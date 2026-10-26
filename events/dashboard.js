
const http = require('node:http');
const crypto = require('node:crypto');
const { Events, ChannelType, PermissionFlagsBits } = require('discord.js');
const store = require('../utils/store');
const { getGuildConfig, setGuildConfig } = require('../utils/configStore');
const { sendModLog } = require('../utils/modLog');
const tickets = require('../utils/tickets');
const levelRewards = require('../utils/levelRewards');
const applications = require('../utils/applications');

const API = 'https://discord.com/api/v10';
const SESSION_HOURS = 12;

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

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

  const sign = (text) =>
    crypto.createHmac('sha256', secret).update(text).digest('base64url');

  const safeEqual = (a, b) => {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));

    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };

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

  const csrfFor = (session) =>
    sign(`csrf:${session.id}:${session.exp}`);

  const clientIp = (req) =>
    (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
      .split(',')[0]
      .trim();

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

  async function canManage(userId, guildId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return null;

    if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return null;
    }

    return guild;
  }

  async function manageableGuilds(userId) {
    const found = [];

    for (const guild of client.guilds.cache.values()) {
      if (await canManage(userId, guild.id)) found.push(guild);
    }

    return found.sort((a, b) => a.name.localeCompare(b.name));
  }

  const css = `
  :root{color-scheme:dark;--bg:#070a12;--panel:#101727;--panel2:#0c1220;--line:#25324b;--text:#edf3ff;--muted:#9aa8c0;--blue:#347eff;--cyan:#65bdff;--ok:#36c98f;--bad:#ff6875}
  *{box-sizing:border-box}
  html{scroll-behavior:smooth;scroll-padding-top:20px}
  body{margin:0;background:radial-gradient(900px 420px at 50% -100px,#142c54 0,transparent 70%),var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
  main{max-width:1180px;margin:auto;padding:0 22px 60px}
  header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 0;border-bottom:1px solid var(--line)}
  .brand{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--text);font-weight:800;font-size:1.1rem}
  .logo{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(145deg,#398cff,#10254b);box-shadow:0 0 24px #347eff30;font-weight:900;font-size:1.25rem}
  .brand b{color:var(--cyan)}
  h1{font-size:clamp(1.65rem,4vw,2.4rem);line-height:1.15;margin:26px 0 8px}
  h2{font-size:1.05rem;margin:0 0 6px}
  p{margin:6px 0 14px}
  .muted{color:var(--muted);font-size:.92rem}
  .hero{border:1px solid var(--line);border-radius:18px;padding:25px;background:linear-gradient(115deg,#111d32,#0b101c 65%);margin:22px 0}
  .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
  .card{background:linear-gradient(160deg,var(--panel),var(--panel2));border:1px solid var(--line);border-radius:16px;padding:20px;margin:16px 0}
  .cardhead{display:flex;gap:12px;align-items:flex-start;margin-bottom:14px}
  .icon{flex:0 0 38px;width:38px;height:38px;border:1px solid #34517c;border-radius:11px;display:grid;place-items:center;color:var(--cyan);font-weight:800}
  .field{margin:13px 0}
  label{display:block;color:#d6e1f4;font-weight:650;margin:0 0 6px}
  input,select{width:100%;padding:11px 12px;border:1px solid #30405d;border-radius:10px;background:#080e19;color:var(--text);font:inherit}
  input:focus,select:focus{outline:2px solid var(--blue);border-color:var(--blue)}
  select[multiple]{min-height:110px}
  small{color:var(--muted)}
  .row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .btn,button{display:inline-flex;justify-content:center;align-items:center;gap:8px;padding:11px 17px;border:0;border-radius:10px;background:linear-gradient(135deg,#438dff,#245fd5);color:white;font:inherit;font-weight:750;text-decoration:none;cursor:pointer}
  .btn.secondary,button.secondary{background:#111a2b;border:1px solid var(--line);color:var(--text);box-shadow:none}
  .topactions{display:flex;align-items:center;gap:10px}
  .notice{padding:12px 14px;border-radius:10px;border:1px solid #2d5e4c;background:#10271f;margin:16px 0}
  .notice.bad{border-color:#6b3440;background:#2b141b}
  .serverlist{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:0;list-style:none}
  .serverlist a{display:block;border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:16px;color:var(--text);text-decoration:none}
  .serverlist a:hover{border-color:var(--blue);transform:translateY(-1px)}
  .crumb{display:inline-block;margin-top:18px;color:var(--cyan);text-decoration:none}
  .pill{display:inline-block;padding:3px 8px;border:1px solid var(--line);border-radius:99px;color:var(--muted);font-size:.8rem}
  .checkbox{display:flex;align-items:center;gap:10px}
  .checkbox input{width:auto}
  .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
  .rewardlist{margin:10px 0;padding:0;list-style:none}
  .rewardlist li{padding:8px 0;border-bottom:1px solid var(--line)}
  footer{color:var(--muted);font-size:.82rem;padding:24px 0;text-align:center}
  .settings-intro{margin-bottom:12px}
  .settings-overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0}
  .overview-link{display:flex;align-items:center;gap:13px;min-width:0;padding:16px;border:1px solid var(--line);border-radius:14px;background:linear-gradient(145deg,#111c30,#0b111d);color:var(--text);text-decoration:none;transition:border-color .15s,transform .15s}
  .overview-link:hover{border-color:var(--blue);transform:translateY(-2px)}
  .overview-icon{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border-radius:12px;background:#14294a;border:1px solid #294b7b;font-size:1.2rem}
  .overview-link strong{display:block;margin-bottom:2px}
  .overview-link span{display:block;color:var(--muted);font-size:.82rem}
  .settings-layout{display:grid;grid-template-columns:210px minmax(0,1fr);gap:22px;align-items:start;margin-top:18px}
  .settings-nav{position:sticky;top:16px;border:1px solid var(--line);border-radius:15px;background:#0c1220;padding:10px}
  .settings-nav .nav-title{padding:10px 11px 12px;color:var(--muted);font-size:.72rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
  .settings-nav a{display:flex;align-items:center;gap:10px;padding:11px;border-radius:9px;color:#cbd8ed;text-decoration:none;font-weight:650;margin:3px 0;transition:background .15s,color .15s}
  .settings-nav a:hover,.settings-nav a:focus{background:#172746;color:#fff;outline:none}
  .nav-number{display:grid;place-items:center;width:28px;height:28px;flex:0 0 28px;border:1px solid #34517c;border-radius:8px;color:var(--cyan);font-size:.78rem}
  .settings-content{min-width:0}
  .settings-section{scroll-margin-top:20px}
  .settings-section .card{margin:0 0 18px}
  .settings-section button{margin-top:6px}
  .section-kicker{font-size:.76rem;text-transform:uppercase;letter-spacing:.1em;color:var(--cyan);font-weight:800;margin-bottom:4px}
  .more-card{border-style:dashed;background:#0b111d}
  .rolegrid{display:flex;flex-wrap:wrap;gap:8px;max-height:230px;overflow:auto;padding:10px;border:1px solid #30405d;border-radius:10px;background:#080e19}
  .rolechip{display:flex;align-items:center;gap:7px;padding:7px 11px;border:1px solid var(--line);border-radius:999px;background:#101727;font-size:.85rem;cursor:pointer}
  .rolechip input{width:auto;margin:0;accent-color:var(--blue)}
  .rolechip:has(input:checked){border-color:var(--blue);background:#15284a;color:#fff}
  textarea{width:100%;padding:11px 12px;border:1px solid #30405d;border-radius:10px;background:#080e19;color:var(--text);font:inherit;min-height:88px;resize:vertical}
  textarea:focus{outline:2px solid var(--blue);border-color:var(--blue)}
  .formcard{border:1px solid var(--line);border-radius:14px;padding:18px;margin:16px 0;background:#0c1220}
  .formcard summary{cursor:pointer;color:var(--cyan);font-weight:750;list-style:none}
  .formcard summary::-webkit-details-marker{display:none}
  .formcard summary::before{content:'▸ ';display:inline-block}
  .formcard[open] summary::before{content:'▾ '}
  .formhead{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
  .badge{padding:3px 10px;border-radius:999px;font-size:.76rem;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
  .badge.on{color:#36c98f;border-color:#2d5e4c}
  .badge.off{color:#ff6875;border-color:#6b3440}
  .btn.danger,button.danger{background:transparent;color:#ff8890;border:1px solid #6b3440;box-shadow:none;font-weight:650}
  .newformcard{border-style:dashed}
  @media(max-width:760px){
    main{padding:0 14px 40px}
    .settings-layout{grid-template-columns:1fr;gap:12px}
    .settings-nav{position:static;display:flex;gap:4px;overflow-x:auto;white-space:nowrap;padding:8px;scrollbar-width:thin}
    .settings-nav .nav-title{display:none}
    .settings-nav a{flex:0 0 auto;padding:9px}
    .settings-nav a span:last-child{font-size:.9rem}
    .settings-overview{grid-template-columns:1fr;gap:8px}
    .overview-link{padding:12px}
    .settings-section{scroll-margin-top:12px}
  }
  @media(max-width:680px){
    .grid,.serverlist,.row{grid-template-columns:1fr}
    main{padding:0 12px 40px}
    .card{padding:16px}
    .hero{padding:18px}
    header{gap:10px}
    .brand{font-size:.95rem}
    .logo{width:36px;height:36px}
  }
  `;

  const page = (title, body, session) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#070a12"><title>${esc(title)} · MF Bot</title><style>${css}</style></head><body><main>${header(session)}${body}<footer>MF Bot Control Panel · Changes save to your bot's existing settings</footer></main></body></html>`;

  function header(session) {
    return `<header><a class="brand" href="/"><span class="logo">MF</span><span>MF Bot <b>CONTROL PANEL</b></span></a>${session ? `<form method="post" action="/logout"><input type="hidden" name="csrf" value="${csrfFor(session)}"><button class="secondary">Log out</button></form>` : ''}</header>`;
  }

  const homePage = (session, guilds) =>
    page(
      'Control Panel',
      `<section class="hero"><span class="pill">BOT MANAGEMENT</span><h1>One place to manage your server.</h1><p class="muted">Configure moderation, ticket settings and level rewards without needing to run commands in Discord.</p>${session ? `<p>Signed in as <strong>${esc(session.name)}</strong></p>` : '<a class="btn" href="/login">Continue with Discord</a><p class="muted">Discord sign-in only identifies you. MF Bot checks your Manage Server permission for each server.</p>'}</section>${session ? `<section class="card"><h2>Your servers</h2><p class="muted">Only servers where MF Bot is present and you have Manage Server permission are listed.</p>${guilds.length ? `<ul class="serverlist">${guilds.map(g => `<li><a href="/guild/${esc(g.id)}"><strong>${esc(g.name)}</strong><br><small>Open control panel →</small></a></li>`).join('')}</ul>` : '<p class="muted">No manageable servers found. Check that MF Bot is in your server and your account has Manage Server permission.</p>'}</section>` : ''}`,
      session
    );

  function guildPage(session, guild, message) {
    const config = getGuildConfig(guild.id);
    const spam = config.antiSpam || {};

    const messages = Number.isInteger(spam.messages) ? spam.messages : 5;
    const windowSec = Number.isInteger(spam.windowMs) ? Math.round(spam.windowMs / 1000) : 5;
    const timeoutMin = Number.isInteger(spam.timeoutMs) ? Math.round(spam.timeoutMs / 60000) : 1;

    const channels = [...guild.channels.cache.values()]
      .filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type))
      .sort((a, b) => a.rawPosition - b.rawPosition);

    const categories = [...guild.channels.cache.values()]
      .filter((c) => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.rawPosition - b.rawPosition);

    const roles = [...guild.roles.cache.values()]
      .filter((r) => r.id !== guild.id && !r.managed)
      .sort((a, b) => b.position - a.position);

    const channelOptions = (selected, includeOff = true) =>
      `${includeOff ? '<option value="">Not set / Off</option>' : ''}${channels.map((c) => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>#${esc(c.name)}</option>`).join('')}`;

    const categoryOptions = (selected) =>
      `<option value="">Not set</option>${categories.map((c) => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}`;

    const roleOptions = (selected = []) =>
      roles.map((r) => `<option value="${esc(r.id)}"${selected.includes(r.id) ? ' selected' : ''}>${esc(r.name)}</option>`).join('');

    // A tappable grid of role chips. Much easier to use on a phone or tablet
    // than a native multi-select box, which is awkward to operate by touch.
    const roleGrid = (name, selected = []) =>
      roles.length
        ? `<div class="rolegrid">${roles.map((r) => `<label class="rolechip"><input type="checkbox" name="${name}" value="${esc(r.id)}"${selected.includes(r.id) ? ' checked' : ''}> ${esc(r.name)}</label>`).join('')}</div>`
        : '<p class="muted">This server has no roles to choose from yet.</p>';

    const ticket = tickets.getSettings(guild.id);
    const ticketQuestions = tickets.getTicketQuestions(guild.id);
    const level = levelRewards.getSettings(guild.id);
    const rewardEntries = Object.entries(level.rewards).sort((a, b) => Number(a[0]) - Number(b[0]));
    const forms = applications.listForms(guild.id);

    // One editable card per existing application form, plus a blank "add new" card.
    const applicationFormCard = (form) => {
      const isNew = !form;
      const id = form?.id || '';
      const action = isNew
        ? `/guild/${esc(guild.id)}/applications/create`
        : `/guild/${esc(guild.id)}/applications/${esc(id)}/update`;
      const questions = isNew ? [] : form.questions;

      return `<details class="formcard${isNew ? ' newformcard' : ''}"${isNew ? '' : ' open'}>
        <summary>${isNew ? '＋ Create a new application form' : `<span class="formhead"><span>${esc(form.name)}</span><span class="badge ${form.enabled ? 'on' : 'off'}">${form.enabled ? 'Accepting applications' : 'Closed'}</span></span>`}</summary>
        <form method="post" action="${action}">
          <input type="hidden" name="csrf" value="${csrfFor(session)}">
          <div class="field"><label for="name${id}">Form name</label><input id="name${id}" name="name" maxlength="${applications.MAX_FORM_NAME_LENGTH}" value="${esc(form?.name || '')}" placeholder="e.g. Staff Application" required></div>
          <div class="field"><label for="description${id}">Description (shown to you in the admin list only)</label><textarea id="description${id}" name="description" maxlength="1000" placeholder="What this application is for">${esc(form?.description || '')}</textarea></div>

          <h2>Questions applicants answer</h2>
          <p class="muted">Up to ${applications.MAX_QUESTIONS} questions, ${applications.MAX_QUESTION_LENGTH} characters each. Leave a box blank to remove that question.</p>
          ${Array.from({ length: applications.MAX_QUESTIONS }, (_, index) => {
            const q = questions[index] || { label: '', required: true };
            const n = index + 1;
            return `<div class="field">
              <label for="q${id}_${n}">Question ${n}</label>
              <input id="q${id}_${n}" name="questionLabel${n}" maxlength="${applications.MAX_QUESTION_LENGTH}" value="${esc(q.label)}" placeholder="${n === 1 ? 'Why do you want to join the team?' : 'Optional question'}">
              <label class="checkbox"><input type="checkbox" name="questionRequired${n}" value="yes"${q.required !== false ? ' checked' : ''}> Required</label>
            </div>`;
          }).join('')}

          <h2>Application panel</h2>
          <p class="muted">The message members will see with the "apply" button, ready for when posting it in Discord is set up. Saving these now means nothing needs retyping later.</p>
          <div class="field"><label for="panelTitle${id}">Panel title</label><input id="panelTitle${id}" name="panelTitle" maxlength="256" value="${esc(form?.panelTitle || '')}" placeholder="Defaults to the form name"></div>
          <div class="field"><label for="panelDescription${id}">Panel description</label><textarea id="panelDescription${id}" name="panelDescription" maxlength="4000" placeholder="Click the button below to submit your application.">${esc(form?.panelDescription && form.panelDescription !== 'Click the button below to submit your application.' ? form.panelDescription : '')}</textarea></div>
          <div class="row">
            <div class="field"><label for="buttonLabel${id}">Button text</label><input id="buttonLabel${id}" name="buttonLabel" maxlength="80" value="${esc(form?.buttonLabel && form.buttonLabel !== 'Apply Now' ? form.buttonLabel : '')}" placeholder="Apply Now"></div>
            <div class="field"><label for="embedColor${id}">Panel colour</label><input id="embedColor${id}" name="embedColor" type="color" value="${esc(form?.embedColor || '#347eff')}" style="padding:4px;height:44px"></div>
          </div>

          <h2>Reviewing applications</h2>
          <div class="field"><label for="reviewChannel${id}">Send new applications to</label><select id="reviewChannel${id}" name="reviewChannelId">${channelOptions(form?.reviewChannelId || '')}</select></div>
          <div class="field"><label>Roles who can review</label>${roleGrid('reviewerRoleIds', form?.reviewerRoleIds || [])}</div>
          <label class="checkbox"><input type="checkbox" name="enabled" value="yes"${isNew || form.enabled !== false ? ' checked' : ''}> Accepting applications</label>

          <div class="actions">
            <button>${isNew ? 'Create form' : 'Save changes'}</button>
          </div>
        </form>
        ${isNew ? '' : `<form method="post" action="/guild/${esc(guild.id)}/applications/${esc(id)}/delete" style="margin-top:10px">
          <input type="hidden" name="csrf" value="${csrfFor(session)}">
          <button class="danger">Delete this form</button>
        </form>`}
      </details>`;
    };

    const messageHtml = message
      ? `<div class="notice ${message.ok ? '' : 'bad'}">${esc(message.text)}</div>`
      : '';

    return page(
      guild.name,
      `<a class="crumb" href="/">← All servers</a>
      <h1>${esc(guild.name)}</h1>
      <p class="muted settings-intro">Your server control centre. Choose a section below, adjust its settings, and save that section. Each section saves independently.</p>
      ${messageHtml}
      <div class="settings-overview" aria-label="Settings sections">
        <a class="overview-link" href="#moderation"><span class="overview-icon">🛡️</span><span><strong>Moderation</strong><span>Anti-spam and log channel</span></span></a>
        <a class="overview-link" href="#tickets"><span class="overview-icon">🎫</span><span><strong>Ticket system</strong><span>Category, staff and limits</span></span></a>
        <a class="overview-link" href="#levels"><span class="overview-icon">⭐</span><span><strong>Levels & XP</strong><span>Announcements and rewards</span></span></a>
        <a class="overview-link" href="#applications"><span class="overview-icon">📝</span><span><strong>Applications</strong><span>Staff & role application forms</span></span></a>
      </div>
      <div class="settings-layout">
        <nav class="settings-nav" aria-label="Settings navigation">
          <div class="nav-title">Server settings</div>
          <a href="#moderation"><span class="nav-number">01</span><span>Moderation</span></a>
          <a href="#tickets"><span class="nav-number">02</span><span>Ticket system</span></a>
          <a href="#levels"><span class="nav-number">03</span><span>Levels & XP</span></a>
          <a href="#applications"><span class="nav-number">04</span><span>Applications</span></a>
          <a href="#more"><span class="nav-number">05</span><span>More features</span></a>
        </nav>
        <div class="settings-content">
          <form method="post" action="/guild/${esc(guild.id)}/moderation">
            <input type="hidden" name="csrf" value="${csrfFor(session)}">
            <section class="settings-section" id="moderation">
              <div class="card">
                <div class="section-kicker">01 · Moderation</div>
                <div class="cardhead"><span class="icon">🛡️</span><div><h2>Moderation & security</h2><p class="muted">Choose the moderation log channel and tune anti-spam protection.</p></div></div>
                <div class="field">
                  <label for="logChannel">Moderation log channel</label>
                  <select id="logChannel" name="logChannel">${channelOptions(config.modLogChannelId)}</select>
                  <small>Set to Off to disable moderation log delivery.</small>
                </div>
                <div class="row">
                  <div class="field"><label for="messages">Message limit</label><input id="messages" name="messages" type="number" min="2" max="10" value="${messages}" required><small>2–10 messages</small></div>
                  <div class="field"><label for="window">Time window (seconds)</label><input id="window" name="window" type="number" min="3" max="30" value="${windowSec}" required><small>3–30 seconds</small></div>
                </div>
                <div class="field"><label for="timeout">Timeout duration (minutes)</label><input id="timeout" name="timeout" type="number" min="1" max="1440" value="${timeoutMin}" required><small>1 minute to 24 hours</small></div>
                <button>Save moderation settings</button>
              </div>
            </section>
          </form>

          <form method="post" action="/guild/${esc(guild.id)}/tickets">
            <input type="hidden" name="csrf" value="${csrfFor(session)}">
            <section class="settings-section" id="tickets">
              <div class="card">
                <div class="section-kicker">02 · Tickets</div>
                <div class="cardhead"><span class="icon">🎫</span><div><h2>Ticket system</h2><p class="muted">Edit the existing ticket settings used by MF Bot. This does not create or repost a ticket panel.</p></div></div>
                <div class="row">
                  <div class="field"><label for="ticketCategory">Ticket category</label><select id="ticketCategory" name="categoryId">${categoryOptions(ticket.categoryId)}</select></div>
                  <div class="field"><label for="ticketMax">Maximum open tickets per user</label><input id="ticketMax" name="maxOpenPerUser" type="number" min="1" max="20" value="${Number.isInteger(ticket.maxOpenPerUser) ? ticket.maxOpenPerUser : 3}" required></div>
                </div>
                <div class="field"><label for="ticketLog">Ticket log channel</label><select id="ticketLog" name="ticketLogChannelId">${channelOptions(ticket.logChannelId)}</select></div>
                <div class="field"><label for="panelChannel">Existing ticket panel channel</label><select id="panelChannel" name="panelChannelId">${channelOptions(ticket.panelChannelId)}</select><small>This saves the panel channel setting only; it does not publish a new panel.</small></div>
                <div class="field"><label>Staff roles</label>${roleGrid('staffRoleIds', Array.isArray(ticket.staffRoleIds) ? ticket.staffRoleIds : [])}<small>Can see and manage every ticket.</small></div>
                <div class="field"><label>Support roles</label>${roleGrid('supportRoleIds', Array.isArray(ticket.supportRoleIds) ? ticket.supportRoleIds : [])}<small>Can see tickets and help out.</small></div>

                <hr style="border:0;border-top:1px solid var(--line);margin:22px 0">
                <h2>Ticket opening questions</h2>
                <p class="muted">Customize the questions members answer when opening a ticket. Leave wording blank to remove a question. You can use up to five questions, each up to 45 characters.</p>
                ${Array.from({ length: 5 }, (_, index) => {
                  const question = ticketQuestions[index] || { label: '', required: false };
                  const number = index + 1;
                  return `<div class="field">
                    <label for="questionLabel${number}">Question ${number}</label>
                    <input id="questionLabel${number}" name="questionLabel${number}" maxlength="45" value="${esc(question.label)}" placeholder="${number === 1 ? 'What do you need help with?' : 'Optional question'}">
                    <label class="checkbox"><input type="checkbox" name="questionRequired${number}" value="yes"${question.required ? ' checked' : ''}> Required</label>
                  </div>`;
                }).join('')}
                <button>Save ticket settings</button>
              </div>
            </section>
          </form>

          <form method="post" action="/guild/${esc(guild.id)}/levels">
            <input type="hidden" name="csrf" value="${csrfFor(session)}">
            <section class="settings-section" id="levels">
              <div class="card">
                <div class="section-kicker">03 · Progression</div>
                <div class="cardhead"><span class="icon">⭐</span><div><h2>Levels & XP</h2><p class="muted">Configure where level-up announcements are sent and manage the role reward mapping.</p></div></div>
                <div class="field"><label for="levelChannel">Level-up announcement channel</label><select id="levelChannel" name="levelChannelId">${channelOptions(level.channelId)}</select></div>
                <label class="checkbox"><input type="checkbox" name="announcementsEnabled" value="yes"${level.announcementsEnabled ? ' checked' : ''}> Enable level-up announcements</label>
                <hr style="border:0;border-top:1px solid var(--line);margin:20px 0">
                <h2>Add or update a level role reward</h2>
                <p class="muted">Choose a level and role. Existing rewards for other levels will be kept.</p>
                <div class="row">
                  <div class="field"><label for="rewardLevel">Level</label><input id="rewardLevel" name="rewardLevel" type="number" min="1" max="10000" placeholder="e.g. 10"></div>
                  <div class="field"><label for="rewardRoleId">Role reward</label><select id="rewardRoleId" name="rewardRoleId"><option value="">Do not change rewards</option>${roleOptions([])}</select></div>
                </div>
                ${rewardEntries.length ? `<h2>Current rewards</h2><ul class="rewardlist">${rewardEntries.map(([lv, id]) => `<li><strong>Level ${esc(lv)}</strong> — ${esc(guild.roles.cache.get(id)?.name || 'Deleted role')}</li>`).join('')}</ul>` : '<p class="muted">No level role rewards are configured yet.</p>'}
                <button>Save level settings</button>
              </div>
            </section>
          </form>

          <section class="settings-section" id="applications">
            <div class="card">
              <div class="section-kicker">04 · Applications</div>
              <div class="cardhead"><span class="icon">📝</span><div><h2>Application forms</h2><p class="muted">Build forms for people to apply for staff or special roles. Each form saves on its own — open a form below to edit it, or add a new one.</p></div></div>
              ${forms.length ? forms.map((form) => applicationFormCard(form)).join('') : '<p class="muted">No application forms yet. Create your first one below.</p>'}
              ${applicationFormCard(null)}
            </div>
          </section>

          <section class="settings-section" id="more">
            <div class="card more-card">
              <div class="section-kicker">Coming next</div>
              <div class="cardhead"><span class="icon">＋</span><div><h2>More features</h2><p class="muted">Welcome-message editing and additional feature controls need their own settings integrations before they can safely be exposed here. This section will grow as those settings are connected.</p></div></div>
            </div>
          </section>
        </div>
      </div>`,
      session
    );
  }

  const notice = (title, text) =>
    page(
      title,
      `<section class="card"><h2>${esc(title)}</h2><p>${esc(text)}</p><a class="btn" href="/">Back to dashboard</a></section>`,
      null
    );

  function send(res, status, body, extra = {}) {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      ...extra,
    });

    res.end(body);
  }

  const redirect = (res, to, cookies = []) => {
    res.writeHead(302, {
      Location: to,
      'Set-Cookie': cookies,
      'Cache-Control': 'no-store',
    });

    res.end();
  };

  // Limit form size without abruptly destroying the request connection.
  function readForm(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      let tooLarge = false;
      const chunks = [];

      req.on('data', (chunk) => {
        if (tooLarge) return;

        size += chunk.length;

        if (size > 20000) {
          tooLarge = true;
          chunks.length = 0;
          reject(Object.assign(new Error('Form too large'), { statusCode: 413 }));
          return;
        }

        chunks.push(chunk);
      });

      req.on('end', () => {
        if (!tooLarge) {
          resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
        }
      });

      req.on('error', (error) => {
        if (!tooLarge) reject(error);
      });
    });
  }

  const getSession = (req) => unpack(parseCookies(req).sid);

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    const session = getSession(req);

    if (req.method === 'GET' && path === '/') {
      const guilds = session ? await manageableGuilds(session.id) : [];
      return send(res, 200, homePage(session, guilds));
    }

    if (req.method === 'GET' && path === '/login') {
      if (tooMany(req)) {
        return send(res, 429, notice('Slow down', 'Too many login attempts. Wait a minute.'));
      }

      const state = crypto.randomBytes(16).toString('hex');
      const authUrl = 'https://discord.com/oauth2/authorize?' + new URLSearchParams({
        client_id: client.user.id,
        redirect_uri: `${baseUrl}/callback`,
        response_type: 'code',
        scope: 'identify',
        state,
        prompt: 'none',
      });

      return redirect(
        res,
        authUrl,
        [cookieText('st', pack({ s: state, exp: Date.now() + 600000 }), 600)]
      );
    }

    if (req.method === 'GET' && path === '/callback') {
      if (tooMany(req)) {
        return send(res, 429, notice('Slow down', 'Too many login attempts. Wait a minute.'));
      }

      const saved = unpack(parseCookies(req).st);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const clear = cookieText('st', '', 0);

      if (!saved || !code || !state || !safeEqual(saved.s, state)) {
        return send(
          res,
          400,
          notice('Login failed', 'That login link expired. Please try again.'),
          { 'Set-Cookie': clear }
        );
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

        const meRes = await fetchImpl(`${API}/users/@me`, {
          headers: { Authorization: `Bearer ${token.access_token}` },
        });

        if (!meRes.ok) throw new Error(`user ${meRes.status}`);

        const me = await meRes.json();
        const exp = Date.now() + SESSION_HOURS * 3600000;

        return redirect(
          res,
          '/',
          [
            cookieText('sid', pack({
              id: me.id,
              name: me.global_name || me.username,
              exp,
            }), SESSION_HOURS * 3600),
            clear,
          ]
        );
      } catch (error) {
        console.error('Dashboard login failed:', error.message);

        return send(
          res,
          500,
          notice('Login failed', 'Discord rejected the login. Check DASHBOARD_URL, the OAuth redirect URL and client secret.'),
          { 'Set-Cookie': clear }
        );
      }
    }

    if (!session) return redirect(res, '/');

    if (req.method === 'POST' && path === '/logout') {
      const form = await readForm(req);

      if (!safeEqual(form.get('csrf') || '', csrfFor(session))) {
        return send(res, 403, notice('Blocked', 'Please go back and try again.'));
      }

      return redirect(res, '/', [cookieText('sid', '', 0)]);
    }

    const match = path.match(
      /^\/guild\/(\d{15,25})(?:\/(moderation|tickets|levels)|\/applications(?:\/(create)|\/([0-9a-f-]{8,40})\/(update|delete))?)?$/
    );

    if (match) {
      const guild = await canManage(session.id, match[1]);

      if (!guild) {
        return send(
          res,
          403,
          notice('No access', 'You need Manage Server permission and MF Bot must be in that server.')
        );
      }

      if (req.method === 'GET') {
        // Only the plain guild page is viewable with GET; the action
        // sub-paths below only make sense as a form submission.
        if (match[2] || match[3] || match[4]) {
          return send(res, 404, notice('Not found', 'That page does not exist.'));
        }
        return send(res, 200, guildPage(session, guild));
      }

      if (req.method !== 'POST') {
        return send(res, 405, notice('Method not allowed', 'Use the dashboard form to change settings.'));
      }

      const form = await readForm(req);

      if (!safeEqual(form.get('csrf') || '', csrfFor(session))) {
        return send(res, 403, notice('Blocked', 'Your security token expired. Reload the page and try again.'));
      }

      const num = (name, min, max) => {
        const raw = form.get(name) || '';
        const n = Number(raw);

        return /^\d+$/.test(raw) && n >= min && n <= max ? n : null;
      };

      const channelById = (
        id,
        types = [ChannelType.GuildText, ChannelType.GuildAnnouncement]
      ) => {
        if (!id) return null;

        const channel = guild.channels.cache.get(id);
        return channel && types.includes(channel.type) ? channel : null;
      };

      const roleIds = (name) =>
        form.getAll(name)
          .filter((id) =>
            guild.roles.cache.has(id) &&
            id !== guild.id &&
            !guild.roles.cache.get(id).managed
          )
          .slice(0, 50);

      if (match[2] === 'moderation') {
        const messages = num('messages', 2, 10);
        const windowSec = num('window', 3, 30);
        const timeoutMin = num('timeout', 1, 1440);
        const logId = form.get('logChannel') || '';
        const logChannel = channelById(logId);

        if (
          messages === null ||
          windowSec === null ||
          timeoutMin === null ||
          (logId && !logChannel)
        ) {
          return send(
            res,
            400,
            guildPage(session, guild, {
              ok: false,
              text: 'Invalid value or channel. Nothing was saved.',
            })
          );
        }

        setGuildConfig(guild.id, {
          modLogChannelId: logChannel?.id || null,
          antiSpam: {
            messages,
            windowMs: windowSec * 1000,
            timeoutMs: timeoutMin * 60000,
          },
        });

        await sendModLog(guild, {
          title: 'Dashboard settings changed',
          description: `**By:** ${esc(session.name)} (<@${session.id}>)\n**Anti-spam:** ${messages} messages in ${windowSec}s; ${timeoutMin} minute timeout`,
        }).catch(() => {});

        return send(
          res,
          200,
          guildPage(session, guild, {
            ok: true,
            text: 'Moderation settings saved.',
          })
        );
      }

      if (match[2] === 'tickets') {
        const maxOpen = num('maxOpenPerUser', 1, 20);
        const categoryId = form.get('categoryId') || '';
        const logId = form.get('ticketLogChannelId') || '';
        const panelId = form.get('panelChannelId') || '';

        const category = categoryId ? guild.channels.cache.get(categoryId) : null;
        const logChannel = channelById(logId);
        const panelChannel = channelById(panelId);
        const ticketQuestions = [];

        for (let i = 1; i <= 5; i++) {
          const label = String(form.get(`questionLabel${i}`) || '').trim();

          if (!label) continue;

          if (label.length > 45) {
            return send(
              res,
              400,
              guildPage(session, guild, {
                ok: false,
                text: 'Each ticket question must be 45 characters or fewer. Nothing was saved.',
              })
            );
          }

          ticketQuestions.push({
            label,
            required: form.get(`questionRequired${i}`) === 'yes',
          });
        }

        if (ticketQuestions.length === 0) {
          return send(
            res,
            400,
            guildPage(session, guild, {
              ok: false,
              text: 'Add at least one ticket question before saving.',
            })
          );
        }

        if (
          maxOpen === null ||
          (categoryId && category?.type !== ChannelType.GuildCategory) ||
          (logId && !logChannel) ||
          (panelId && !panelChannel)
        ) {
          return send(
            res,
            400,
            guildPage(session, guild, {
              ok: false,
              text: 'Invalid ticket setting or channel. Nothing was saved.',
            })
          );
        }

        tickets.updateSettings(guild.id, {
          categoryId: category?.id || null,
          logChannelId: logChannel?.id || null,
          panelChannelId: panelChannel?.id || null,
          maxOpenPerUser: maxOpen,
          staffRoleIds: roleIds('staffRoleIds'),
          supportRoleIds: roleIds('supportRoleIds'),
          ticketQuestions,
        });

        return send(
          res,
          200,
          guildPage(session, guild, {
            ok: true,
            text: 'Ticket settings saved. Existing panel messages are not changed.',
          })
        );
      }

      if (match[2] === 'levels') {
        const channelId = form.get('levelChannelId') || '';
        const channel = channelById(channelId);
        const rewardLevelRaw = form.get('rewardLevel') || '';
        const rewardRoleId = form.get('rewardRoleId') || '';
        const rewardRole = rewardRoleId
          ? guild.roles.cache.get(rewardRoleId)
          : null;

        const rewardLevelInvalid =
          rewardLevelRaw !== '' &&
          (!/^\d+$/.test(rewardLevelRaw) ||
            Number(rewardLevelRaw) < 1 ||
            Number(rewardLevelRaw) > 10000);

        const rewardSelectionIncomplete =
          (rewardLevelRaw !== '' && rewardRoleId === '') ||
          (rewardLevelRaw === '' && rewardRoleId !== '');

        // Only fetch the bot member when a role reward is being changed.
        const botMember = rewardRoleId
          ? await guild.members.fetchMe().catch(() => null)
          : null;

        const rewardRoleInvalid =
          rewardRoleId !== '' &&
          (
            !rewardRole ||
            rewardRole.managed ||
            rewardRole.id === guild.id ||
            !botMember ||
            !botMember.permissions.has(PermissionFlagsBits.ManageRoles) ||
            rewardRole.position >= botMember.roles.highest.position
          );

        if (
          (channelId && !channel) ||
          rewardLevelInvalid ||
          rewardSelectionIncomplete ||
          rewardRoleInvalid
        ) {
          return send(
            res,
            400,
            guildPage(session, guild, {
              ok: false,
              text: 'Invalid level setting. Choose a valid channel and, if changing a reward, provide both a level and a normal server role below MF Bot’s highest role. MF Bot must also have Manage Roles permission. Nothing was saved.',
            })
          );
        }

        // Validate every submitted value before changing any saved setting.
        levelRewards.setChannel(guild.id, channel?.id || null);
        levelRewards.setAnnouncementsEnabled(
          guild.id,
          form.get('announcementsEnabled') === 'yes'
        );

        if (rewardLevelRaw && rewardRole) {
          levelRewards.setReward(
            guild.id,
            Number(rewardLevelRaw),
            rewardRole.id
          );
        }

        return send(
          res,
          200,
          guildPage(session, guild, {
            ok: true,
            text: 'Level settings saved.',
          })
        );
      }

      if (match[2] === undefined && (match[3] === 'create' || match[4])) {
        // Shared parsing for both creating a new form and updating one.
        const channelId = form.get('reviewChannelId') || '';
        const reviewChannel = channelById(channelId);

        if (channelId && !reviewChannel) {
          return send(
            res,
            400,
            guildPage(session, guild, {
              ok: false,
              text: 'That review channel is not valid. Nothing was saved.',
            })
          );
        }

        const questions = [];

        for (let i = 1; i <= applications.MAX_QUESTIONS; i++) {
          const label = String(form.get(`questionLabel${i}`) || '').trim();
          if (!label) continue;

          questions.push({
            label,
            required: form.get(`questionRequired${i}`) === 'yes',
          });
        }

        const input = {
          name: form.get('name') || '',
          description: form.get('description') || '',
          questions,
          panelTitle: form.get('panelTitle') || '',
          panelDescription: form.get('panelDescription') || '',
          buttonLabel: form.get('buttonLabel') || '',
          embedColor: form.get('embedColor') || '',
          reviewChannelId: reviewChannel?.id || '',
          reviewerRoleIds: roleIds('reviewerRoleIds'),
          enabled: form.get('enabled') === 'yes',
        };

        try {
          if (match[3] === 'create') {
            applications.createForm(guild.id, input);

            return send(
              res,
              200,
              guildPage(session, guild, {
                ok: true,
                text: `Application form "${input.name}" created.`,
              })
            );
          }

          if (match[5] === 'update') {
            const updated = applications.updateForm(guild.id, match[4], input);

            if (!updated) {
              return send(
                res,
                400,
                guildPage(session, guild, {
                  ok: false,
                  text: 'That application form no longer exists.',
                })
              );
            }

            return send(
              res,
              200,
              guildPage(session, guild, {
                ok: true,
                text: `Application form "${updated.name}" saved.`,
              })
            );
          }
        } catch (error) {
          return send(
            res,
            400,
            guildPage(session, guild, { ok: false, text: error.message })
          );
        }

        if (match[5] === 'delete') {
          const existing = applications.getForm(guild.id, match[4]);
          applications.deleteForm(guild.id, match[4]);

          return send(
            res,
            200,
            guildPage(session, guild, {
              ok: true,
              text: existing ? `Deleted "${existing.name}".` : 'That form was already deleted.',
            })
          );
        }
      }
    }

    return send(res, 404, notice('Not found', 'That page does not exist.'));
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      // Return a proper client error when a submitted form exceeds 20 KB.
      if (error.statusCode === 413) {
        if (!res.headersSent) {
          send(
            res,
            413,
            notice(
              'Request too large',
              'The submitted form was too large. Please go back and try again.'
            )
          );
        } else {
          res.end();
        }
        return;
      }

      console.error('Dashboard error:', error.message);

      if (!res.headersSent) {
        send(res, 500, notice('Something went wrong', 'Please try again.'));
      } else {
        res.end();
      }
    });
  });

  return { server, handle, pack, unpack, csrfFor, sign };
}

module.exports = {
  name: Events.ClientReady,
  makeDashboard,

  async execute(client) {
    if (!process.env.DISCORD_CLIENT_SECRET) {
      console.log('Dashboard is off (no DISCORD_CLIENT_SECRET set).');
      return;
    }

    if (!process.env.DASHBOARD_URL) {
      console.log('Dashboard is off: add DASHBOARD_URL in your Env tab.');
      return;
    }

    const port = Number(process.env.DASHBOARD_PORT) || 26431;
    const dashboard = makeDashboard(client);

    dashboard.server.on('error', (error) =>
      console.error('Dashboard could not start:', error.message)
    );

    dashboard.server.listen(port, '0.0.0.0', () =>
      console.log(`Dashboard running on port ${port}`)
    );
  },
};
