
const store = require('./store');

const COOLDOWN_MS = 60_000;

// XP needed to move from level L to level L + 1.
const needForNext = (level) => 5 * level * level + 50 * level + 100;

function levelFromXp(totalXp) {
  let level = 0;
  let remaining = Math.max(0, Number(totalXp) || 0);

  while (remaining >= needForNext(level)) {
    remaining -= needForNext(level);
    level++;
  }

  return {
    level,
    into: remaining,
    need: needForNext(level),
  };
}

function getXpEntry(all, guildId, userId) {
  all[guildId] ??= {};
  all[guildId][userId] ??= { xp: 0, last: 0 };

  const entry = all[guildId][userId];
  entry.xp = Math.max(0, Number(entry.xp) || 0);
  entry.last = Math.max(0, Number(entry.last) || 0);

  return entry;
}

// Normal message XP, subject to the existing cooldown.
function addXp(guildId, userId, amount, now = Date.now()) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('XP amount must be a positive number.');
  }

  const all = store.read('xp', {});
  const entry = getXpEntry(all, guildId, userId);

  if (now - entry.last < COOLDOWN_MS) return null;

  const beforeLevel = levelFromXp(entry.xp).level;

  entry.xp += Math.floor(amount);
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

// Bonus XP for quest rewards; does not change the message cooldown.
function addBonusXp(guildId, userId, amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Bonus XP must be a positive number.');
  }

  const all = store.read('xp', {});
  const entry = getXpEntry(all, guildId, userId);
  const beforeLevel = levelFromXp(entry.xp).level;

  entry.xp += Math.floor(amount);

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
  const totalXp = store.read('xp', {})[guildId]?.[userId]?.xp ?? 0;
  return Math.max(0, Number(totalXp) || 0);
}

// Server rankings, highest XP first.
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
  addBonusXp,
  getXp,
  ranking,
  levelFromXp,
};
