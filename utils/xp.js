
 // utils/xp.js - the engine behind levels. XP is saved in data/xp.json.
const store = require('./store');

const COOLDOWN_MS = 60_000;

// Keep the existing XP progression formula unchanged.
const needForNext = (level) => 5 * level * level + 50 * level + 100;

function levelFromXp(totalXp) {
  let level = 0;
  let remaining = Math.max(0, Number(totalXp) || 0);

  while (remaining >= needForNext(level)) {
    remaining -= needForNext(level);
    level++;
  }

  return { level, into: remaining, need: needForNext(level) };
}

function addXp(guildId, userId, amount, now = Date.now()) {
  const all = store.read('xp', {});
  all[guildId] ??= {};
  all[guildId][userId] ??= { xp: 0, last: 0 };

  const entry = all[guildId][userId];

  if (now - entry.last < COOLDOWN_MS) return null;

  const beforeLevel = levelFromXp(entry.xp).level;

  entry.xp += amount;
  entry.last = now;

  store.write('xp', all);

  const afterLevel = levelFromXp(entry.xp).level;

  return {
    xp: entry.xp,
    level: afterLevel,
    beforeLevel,
    levelsGained: Math.max(0, afterLevel - beforeLevel),
    leveledUp: afterLevel > beforeLevel,
  };
}

function getXp(guildId, userId) {
  return store.read('xp', {})[guildId]?.[userId]?.xp ?? 0;
}

function ranking(guildId) {
  const guild = store.read('xp', {})[guildId] ?? {};

  return Object.entries(guild)
    .map(([userId, entry]) => ({
      userId,
      xp: Math.max(0, Number(entry.xp) || 0),
    }))
    .sort((a, b) => b.xp - a.xp);
}

module.exports = {
  addXp,
  getXp,
  ranking,
  levelFromXp,
};
