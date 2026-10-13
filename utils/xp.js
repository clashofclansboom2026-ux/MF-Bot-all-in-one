// utils/xp.js - the engine behind levels. XP is saved in data/xp.json.

const store = require('./store');

const COOLDOWN_MS = 60_000; // you can only earn XP once a minute (stops spam-farming)

// XP needed to go from level L to level L+1.
const needForNext = (level) => 5 * level * level + 50 * level + 100;

// Turn a total XP number into level + progress towards the next level.
function levelFromXp(totalXp) {
  let level = 0;
  let remaining = totalXp;
  while (remaining >= needForNext(level)) {
    remaining -= needForNext(level);
    level++;
  }
  return { level, into: remaining, need: needForNext(level) };
}

// Give XP to someone. Returns null if they are still on cooldown.
function addXp(guildId, userId, amount, now = Date.now()) {
  const all = store.read('xp', {});
  all[guildId] ??= {};
  all[guildId][userId] ??= { xp: 0, last: 0 };
  const entry = all[guildId][userId];

  if (now - entry.last < COOLDOWN_MS) return null;

  const before = levelFromXp(entry.xp).level;
  entry.xp += amount;
  entry.last = now;
  store.write('xp', all);

  const after = levelFromXp(entry.xp).level;
  return { xp: entry.xp, level: after, leveledUp: after > before };
}

function getXp(guildId, userId) {
  return store.read('xp', {})[guildId]?.[userId]?.xp ?? 0;
}

// Everyone in a server, highest XP first: [{ userId, xp }, ...]
function ranking(guildId) {
  const guild = store.read('xp', {})[guildId] ?? {};
  return Object.entries(guild)
    .map(([userId, entry]) => ({ userId, xp: entry.xp }))
    .sort((a, b) => b.xp - a.xp);
}

module.exports = { addXp, getXp, ranking, levelFromXp };
