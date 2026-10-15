// events/dashboard.js - a small website for your bot.
// You log in with Discord, pick a server you manage, and change settings
// (log channel + anti-spam) from a webpage instead of typing commands.
//
// It needs NO extra packages. It only turns on if DISCORD_CLIENT_SECRET is set
// in your host's Env tab, so it can't break the bot if you haven't set it up yet.

const fs = require('node:fs');
const nodePath = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { Events, ChannelType, PermissionFlagsBits } = require('discord.js');

const store = require('../utils/store');
const { getGuildConfig, setGuildConfig } = require('../utils/configStore');
const { sendModLog } = require('../utils/modLog');

const API = 'https://discord.com/api/v10';
const SESSION_HOURS = 12;
const ASSETS = {
  '/assets/logo.png': { file: 'logo.png', type: 'image/png' },
  '/assets/banner.jpg': { file: 'banner.jpg', type: 'image/jpeg' },
};

// ---------- small helpers ----------

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const b64 = (s) => Buffer.from(s).toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString('utf8');

function getSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  let saved = store.read('dashboard-secret', null);
  if (!saved?.secret) {
    saved = { secret: crypto.randomBytes(32).toString('hex') };
    store.write('dashboard-secret', saved);
  }
  return saved.secret;
}

function makeDashboard(client, options = {}) {
  const secret = options.secret ?? getSecret();
  const baseUrl = (options.baseUrl ?? process.env.DASHBOARD_URL ?? '').replace(/\/+$/, '');
  const clientSecret = options.clientSecret ?? process.env.DISCORD_CLIENT_SECRET;
  const secureCookies = baseUrl.startsWith('https://');
  const fetchImpl = options.fetch ?? fetch;

  const sign = (text) => crypto.createHmac('sha256', secret).update(text).digest('base64url');
  const safeEqual = (a, b) => {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };

  // A signed value: "data.signature". Nobody can change it without the secret.
  const pack = (obj) => {
    const body = b64(JSON.stringify(obj));
    return `${body}.${sign(body)}`;
  };
  const unpack = (text) => {
    if (!text || !text.includes('.')) return null;
    const [body, sig] = text.split('.');
    if (!safeEqual(sig, sign(body))) return null;
    try {
      const obj = JSON.parse(unb64(body));
      return obj.exp && obj.exp > Date.now() ? obj : null;
    } catch {
      return null;
    }
  };

  const parseCookies = (req) =>
    Object.fromEntries(
      (req.headers.cookie || '')
        .split(';')
        .map((p) => p.trim().split('='))
        .filter((p) => p[0])
        .map(([k, ...v]) => [k, v.join('=')])
    );

  const cookieText = (name, value, maxAgeSec) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secureCookies ? '; Secure' : ''}`;

  const csrfFor = (session) => sign(`csrf:${session.id}:${session.exp}`);

  const clientIp = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  // Very simple "slow down" for the login routes.
  const hits = new Map();
  function tooMany(req) {
    const key = clientIp(req);
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < 60_000);
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return recent.length > 20;
  }

  // ---------- who is allowed where ----------

  // A person can open a server's page only if the bot is in it AND they
  // currently have Manage Server there. I check live, every time.
  async function canManage(userId, guildId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return null;
    if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) return null;
    return guild;
  }

  async function manageableGuilds(userId) {
    const found = [];
    for (const guild of client.guilds.cache.values()) {
      if (await canManage(userId, guild.id)) found.push(guild);
    }
    return found;
  }

  // ---------- pages ----------

  const BRAND = 'MF Bot';

  const css = `
    :root{--bg:#05070d;--panel:#0a0f1c;--panel2:#0d1426;--line:#18233f;--text:#e9eef8;--muted:#8c97ad;--silver:#cfd6e4;--blue:#2d7bff;--blue2:#4da3ff;--ok:#2fbf71;--bad:#e5484d}
    *{box-sizing:border-box}
    html{background:var(--bg)}
    body{margin:0;color:var(--text);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;min-height:100vh;
      background:radial-gradient(900px 420px at 50% -120px,rgba(45,123,255,.16),transparent 70%),var(--bg)}
    main{max-width:720px;margin:0 auto;padding:0 16px 64px}
    header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 0;border-bottom:1px solid var(--line)}
    .brand{display:flex;align-items:center;gap:10px;color:var(--text);text-decoration:none;font-weight:700;letter-spacing:.02em}
    .brand img{width:34px;height:34px}
    .brand span b{color:var(--blue2)}
    h1{font-size:1.6rem;line-height:1.2;margin:.9em 0 .3em;letter-spacing:.01em}
    h2{font-size:1rem;margin:0 0 .5em;color:var(--silver);letter-spacing:.06em;text-transform:uppercase}
    .hero{margin:18px 0 6px;border:1px solid var(--line);border-radius:16px;overflow:hidden;position:relative;background:#000}
    .hero img{display:block;width:100%;height:auto;max-height:220px;object-fit:cover}
    .card{background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:14px;padding:18px;margin:14px 0}
    .muted{color:var(--muted);font-size:.92rem}
    a{color:var(--blue2)}
    a.btn,button{display:inline-block;background:linear-gradient(180deg,#3a86ff,#1f63e0);color:#fff;border:0;border-radius:10px;padding:12px 20px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer;box-shadow:0 0 0 1px rgba(77,163,255,.35),0 6px 22px rgba(45,123,255,.25)}
    a.btn:hover,button:hover{filter:brightness(1.08)}
    button.plain{background:transparent;color:var(--muted);box-shadow:none;border:1px solid var(--line);padding:8px 14px;font-weight:500}
    label{display:block;margin:14px 0 6px;font-weight:600;color:var(--silver);font-size:.95rem}
    input,select{width:100%;padding:12px;border-radius:10px;border:1px solid var(--line);background:#060a14;color:var(--text);font:inherit}
    input:focus,select:focus{outline:2px solid var(--blue);border-color:var(--blue)}
    .row{display:flex;gap:12px}.row>div{flex:1}
    .note{border-left:3px solid var(--blue);padding:12px 14px;border-radius:10px;background:var(--panel);margin:14px 0}
    .note.ok{border-left-color:var(--ok)}.note.bad{border-left-color:var(--bad)}
    ul{list-style:none;padding:0;margin:0}
    li a{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-radius:10px;border:1px solid var(--line);background:var(--panel);margin:8px 0;color:var(--text);text-decoration:none}
    li a:after{content:"›";color:var(--blue2);font-size:1.4rem}
    li a:hover{border-color:var(--blue)}
    .crumb{display:inline-block;margin-top:14px;color:var(--muted);text-decoration:none;font-size:.92rem}
    @media (max-width:480px){.row{flex-direction:column;gap:0}}`;

  const page = (title, body, session) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#05070d"><title>${esc(title)} · ${BRAND}</title><link rel="icon" href="/assets/logo.png"><style>${css}</style></head><body><main>${header(session)}${body}</main></body></html>`;

  function header(session) {
    const name = client.user?.username ?? BRAND;
    return (
      `<header><a class="brand" href="/"><img src="/assets/logo.png" alt=""><span>${esc(name)} <b>Dashboard</b></span></a>` +
      (session
        ? `<form method="post" action="/logout"><input type="hidden" name="csrf" value="${csrfFor(session)}"><button class="plain">Log out</button></form>`
        : '') +
      `</header>`
    );
  }

  const homePage = (session, guilds) =>
    page(
      'Dashboard',
      `<div class="hero"><img src="/assets/banner.jpg" alt=""></div>` +
        (!session
          ? `<h1>Manage ${esc(client.user?.username ?? BRAND)}</h1><div class="card"><p>Log in with Discord to change your bot's settings from here.</p><a class="btn" href="/login">Log in with Discord</a><p class="muted">Only your name is shared. It cannot read your messages or act as you.</p></div>`
          : `<h1>Welcome, ${esc(session.name)}</h1><div class="card"><h2>Your servers</h2>` +
            (guilds.length
              ? `<ul>${guilds.map((g) => `<li><a href="/guild/${esc(g.id)}">${esc(g.name)}</a></li>`).join('')}</ul>`
              : `<p class="muted">No servers found. You need <b>Manage Server</b> in a server that the bot is also in.</p>`) +
            `</div>`),
      session
    );

  function guildPage(session, guild, message) {
    const config = getGuildConfig(guild.id);
    const spam = config.antiSpam || {};
    const messages = Number.isInteger(spam.messages) ? spam.messages : 5;
    const windowSec = Number.isInteger(spam.windowMs) ? Math.round(spam.windowMs / 1000) : 5;
    const timeoutMin = Number.isInteger(spam.timeoutMs) ? Math.round(spam.timeoutMs / 60000) : 1;

    const channels = [...guild.channels.cache.values()]
      .filter((c) => c.type === ChannelType.GuildText)
      .sort((a, b) => a.rawPosition - b.rawPosition);

    return page(
      guild.name,
      `<a href="/" class="crumb">← All servers</a><h1>${esc(guild.name)}</h1>` +
        (message ? `<div class="note ${message.ok ? 'ok' : 'bad'}">${esc(message.text)}</div>` : '') +
        `<form method="post" action="/guild/${esc(guild.id)}">
          <input type="hidden" name="csrf" value="${csrfFor(session)}">
          <div class="card"><h2>Moderation log</h2>
            <p class="muted">Bans, kicks, deleted messages and so on get posted here.</p>
            <label for="log">Log channel</label>
            <select id="log" name="logChannel"><option value="">Off</option>
            ${channels.map((c) => `<option value="${esc(c.id)}"${c.id === config.modLogChannelId ? ' selected' : ''}>#${esc(c.name)}</option>`).join('')}
            </select></div>
          <div class="card"><h2>Anti-spam</h2>
            <p class="muted">If someone sends too many messages too fast, their messages are deleted and they are timed out. Admins and people who can Manage Messages are ignored.</p>
            <div class="row">
              <div><label for="m">Messages</label><input id="m" name="messages" type="number" min="2" max="10" value="${messages}" required></div>
              <div><label for="w">Within (seconds)</label><input id="w" name="window" type="number" min="3" max="30" value="${windowSec}" required></div>
            </div>
            <label for="t">Timeout (minutes)</label><input id="t" name="timeout" type="number" min="1" max="1440" value="${timeoutMin}" required>
          </div>
          <button>Save settings</button>
        </form>`,
      session
    );
  }

  const notice = (title, text) => page(title, `<div class="card"><h2>${esc(title)}</h2><p>${esc(text)}</p><a class="btn" href="/">Back</a></div>`, null);

  // ---------- the server ----------

  function send(res, status, body, extra = {}) {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      ...extra,
    });
    res.end(body);
  }
  const redirect = (res, to, cookies = []) => {
    res.writeHead(302, { Location: to, 'Set-Cookie': cookies, 'Cache-Control': 'no-store' });
    res.end();
  };

  function readForm(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > 10_000) {
          reject(new Error('too big'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));
      req.on('error', reject);
    });
  }

  const getSession = (req) => unpack(parseCookies(req).sid);

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    const session = getSession(req);

    // Logo and banner pictures (from the "assets" folder)
    if (req.method === 'GET' && ASSETS[path]) {
      try {
        const file = fs.readFileSync(nodePath.join(__dirname, '..', 'assets', ASSETS[path].file));
        res.writeHead(200, { 'Content-Type': ASSETS[path].type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
        return res.end(file);
      } catch {
        res.writeHead(404);
        return res.end();
      }
    }

    // Home
    if (req.method === 'GET' && path === '/') {
      const guilds = session ? await manageableGuilds(session.id) : [];
      return send(res, 200, homePage(session, guilds));
    }

    // Start login
    if (req.method === 'GET' && path === '/login') {
      if (tooMany(req)) return send(res, 429, notice('Slow down', 'Too many tries. Wait a minute.'));
      const state = crypto.randomBytes(16).toString('hex');
      const authUrl =
        `https://discord.com/oauth2/authorize?` +
        new URLSearchParams({
          client_id: client.user.id,
          redirect_uri: `${baseUrl}/callback`,
          response_type: 'code',
          scope: 'identify',
          state,
          prompt: 'none',
        });
      return redirect(res, authUrl, [cookieText('st', pack({ s: state, exp: Date.now() + 10 * 60_000 }), 600)]);
    }

    // Discord sends people back here after they approve
    if (req.method === 'GET' && path === '/callback') {
      if (tooMany(req)) return send(res, 429, notice('Slow down', 'Too many tries. Wait a minute.'));
      const saved = unpack(parseCookies(req).st);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const clear = cookieText('st', '', 0);

      if (!saved || !code || !state || !safeEqual(saved.s, state)) {
        return send(res, 400, notice('Login failed', 'That login link has expired. Please try again.'), { 'Set-Cookie': clear });
      }

      try {
        const tokenRes = await fetchImpl(`${API}/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: client.user.id,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: `${baseUrl}/callback`,
          }),
        });
        if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}`);
        const token = await tokenRes.json();

        const meRes = await fetchImpl(`${API}/users/@me`, { headers: { Authorization: `Bearer ${token.access_token}` } });
        if (!meRes.ok) throw new Error(`user ${meRes.status}`);
        const me = await meRes.json();

        const exp = Date.now() + SESSION_HOURS * 3_600_000;
        return redirect(res, '/', [
          cookieText('sid', pack({ id: me.id, name: me.global_name || me.username, exp }), SESSION_HOURS * 3600),
          clear,
        ]);
      } catch (error) {
        console.error('Dashboard login failed:', error.message);
        return send(res, 500, notice('Login failed', 'Discord did not accept the login. Check the redirect link and client secret, then try again.'), { 'Set-Cookie': clear });
      }
    }

    // Everything below needs a login
    if (!session) return redirect(res, '/');

    if (req.method === 'POST' && path === '/logout') {
      const form = await readForm(req);
      if (!safeEqual(form.get('csrf') || '', csrfFor(session))) return send(res, 403, notice('Blocked', 'Please go back and try again.'));
      return redirect(res, '/', [cookieText('sid', '', 0)]);
    }

    const match = path.match(/^\/guild\/(\d{15,25})$/);
    if (match) {
      const guild = await canManage(session.id, match[1]);
      if (!guild) return send(res, 403, notice('No access', 'You need Manage Server there, and my bot must be in that server.'));

      if (req.method === 'GET') return send(res, 200, guildPage(session, guild));

      if (req.method === 'POST') {
        const form = await readForm(req);
        if (!safeEqual(form.get('csrf') || '', csrfFor(session))) return send(res, 403, notice('Blocked', 'Please go back and try again.'));

        const num = (name, min, max) => {
          const raw = form.get(name) || '';
          const n = Number(raw);
          return /^\d+$/.test(raw) && n >= min && n <= max ? n : null;
        };
        const messages = num('messages', 2, 10);
        const windowSec = num('window', 3, 30);
        const timeoutMin = num('timeout', 1, 1440);
        const logId = form.get('logChannel') || '';
        const logChannel = logId ? guild.channels.cache.get(logId) : null;

        if (messages === null || windowSec === null || timeoutMin === null || (logId && logChannel?.type !== ChannelType.GuildText)) {
          return send(res, 400, guildPage(session, guild, { ok: false, text: 'Some numbers were out of range, so nothing was saved.' }));
        }

        setGuildConfig(guild.id, {
          modLogChannelId: logChannel ? logChannel.id : null,
          antiSpam: { messages, windowMs: windowSec * 1000, timeoutMs: timeoutMin * 60_000 },
        });

        await sendModLog(guild, {
          title: 'Settings changed on the dashboard',
          description: `**By:** ${session.name} (<@${session.id}>)\n**Anti-spam:** ${messages} messages in ${windowSec}s, ${timeoutMin} min timeout`,
        });

        return send(res, 200, guildPage(session, guild, { ok: true, text: 'Saved. The bot uses the new settings straight away.' }));
      }
    }

    return send(res, 404, notice('Not found', 'That page does not exist.'));
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error('Dashboard error:', error.message);
      if (!res.headersSent) send(res, 500, notice('Something went wrong', 'Please try again.'));
      else res.end();
    });
  });

  return { server, handle, pack, unpack, csrfFor, sign };
}

module.exports = {
  name: Events.ClientReady,
  makeDashboard,
  async execute(client) {
    if (!process.env.DISCORD_CLIENT_SECRET) {
      console.log('Dashboard is off (no DISCORD_CLIENT_SECRET set). That is fine.');
      return;
    }
    if (!process.env.DASHBOARD_URL) {
      console.log('Dashboard is off: add DASHBOARD_URL in your Env tab.');
      return;
    }
    const port = Number(process.env.DASHBOARD_PORT) || 26431;
    const dashboard = makeDashboard(client);
    dashboard.server.on('error', (error) => console.error('Dashboard could not start:', error.message));
    dashboard.server.listen(port, '0.0.0.0', () => console.log(`Dashboard running on port ${port}`));
  },
};
