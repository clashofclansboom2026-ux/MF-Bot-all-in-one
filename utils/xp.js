
const store = require('./store');

const COOLDOWN_MS = 60_000;
const DISCORD_ID_PATTERN = /^\d{17,20}$/;

// XP needed to move from level L to level L + 1.
const needForNext = (level) => 5 * level * level + 50 * level + 100;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireDiscordId(value, label) {
  const id = String(value ?? '');

  if (!DISCORD_ID_PATTERN.test(id)) {
    throw new Error(`A valid Discord ${label} ID is required.`);
  }

  return id;
}

function readAll() {
  const data = store.read('xp', {});
  return isRecord(data) ? data : {};
}

function normaliseNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function levelFromXp(totalXp) {
  let level = 0;
  let remaining = normaliseNonNegativeNumber(totalXp);

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
  if (!isRecord(all[guildId])) all[guildId] = {};

  const guild = all[guildId];
  const existing = guild[userId];
  const entry = isRecord(existing) ? existing : { xp: 0, last: 0 };

  entry.xp = Math.floor(normaliseNonNegativeNumber(entry.xp));
  entry.last = Math.floor(normaliseNonNegativeNumber(entry.last));
  guild[userId] = entry;

  return entry;
}

function validateAmount(amount, label) {
  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error(`${label} must be a positive number of at least 1.`);
  }

  return Math.floor(amount);
}

// Normal message XP, subject to the existing cooldown.
function addXp(guildId, userId, amount, now = Date.now()) {
  guildId = requireDiscordId(guildId, 'server');
  userId = requireDiscordId(userId, 'user');
  amount = validateAmount(amount, 'XP amount');

  if (!Number.isFinite(now) || now < 0) {
    throw new Error('A valid timestamp is required.');
  }

  const all = readAll();
  const entry = getXpEntry(all, guildId, userId);

  if (now - entry.last < COOLDOWN_MS) return null;

  const beforeLevel = levelFromXp(entry.xp).level;

  entry.xp += amount;
  entry.last = Math.floor(now);

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
  guildId = requireDiscordId(guildId, 'server');
  userId = requireDiscordId(userId, 'user');
  amount = validateAmount(amount, 'Bonus XP');

  const all = readAll();
  const entry = getXpEntry(all, guildId, userId);
  const beforeLevel = levelFromXp(entry.xp).level;

  entry.xp += amount;

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
  guildId = requireDiscordId(guildId, 'server');
  userId = requireDiscordId(userId, 'user');

  const all = readAll();
  const guild = isRecord(all[guildId]) ? all[guildId] : {};
  const entry = isRecord(guild[userId]) ? guild[userId] : {};

  return Math.floor(normaliseNonNegativeNumber(entry.xp));
}

// Server rankings, highest XP first.
function ranking(guildId) {
  guildId = requireDiscordId(guildId, 'server');

  const all = readAll();
  const guild = isRecord(all[guildId]) ? all[guildId] : {};

  return Object.entries(guild)
    .filter(([userId, entry]) => DISCORD_ID_PATTERN.test(userId) && isRecord(entry))
    .map(([userId, entry]) => ({
      userId,
      xp: Math.floor(normaliseNonNegativeNumber(entry.xp)),
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

