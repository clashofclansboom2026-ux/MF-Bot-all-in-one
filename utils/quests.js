
const store = require('./store');
const xp = require('./xp');

const QUESTS = [
  {
    id: 'daily_messages',
    type: 'daily',
    name: 'Conversation Starter',
    description: 'Send 10 messages in this server.',
    target: 10,
    rewardXp: 100,
  },
  {
    id: 'weekly_messages',
    type: 'weekly',
    name: 'Community Regular',
    description: 'Send 50 messages in this server this week.',
    target: 50,
    rewardXp: 400,
  },
];

const DISCORD_ID_PATTERN = /^\d{17,20}$/;

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

function getPeriodKey(type, now = new Date()) {
  const date = new Date(now);

  if (Number.isNaN(date.getTime())) {
    throw new Error('A valid date is required.');
  }

  const year = date.getUTCFullYear();

  if (type === 'daily') {
    return `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  if (type !== 'weekly') {
    throw new Error(`Unknown quest period: ${type}`);
  }

  const monday = new Date(
    Date.UTC(year, date.getUTCMonth(), date.getUTCDate())
  );

  monday.setUTCDate(
    monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7)
  );

  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
}

function readAll() {
  const data = store.read('quests', {});
  return isRecord(data) ? data : {};
}

function getCurrentProgress(record, quest, now = new Date()) {
  const period = getPeriodKey(quest.type, now);

  const saved =
    isRecord(record) && isRecord(record[quest.id])
      ? record[quest.id]
      : null;

  if (!saved || saved.period !== period) {
    return { period, progress: 0, claimed: false };
  }

  const savedProgress = Number(saved.progress);

  const progress = Number.isFinite(savedProgress)
    ? Math.min(quest.target, Math.max(0, Math.floor(savedProgress)))
    : 0;

  return {
    period,
    progress,
    claimed: saved.claimed === true,
  };
}

function getUserRecord(all, guildId, userId) {
  const guildData = isRecord(all[guildId]) ? all[guildId] : {};
  const userData = isRecord(guildData[userId])
    ? guildData[userId]
    : {};

  return { guildData, userData };
}

function recordMessage(guildId, userId, now = new Date()) {
  guildId = requireDiscordId(guildId, 'server');
  userId = requireDiscordId(userId, 'user');

  const all = readAll();
  const { guildData, userData } = getUserRecord(all, guildId, userId);

  const record = { ...userData };
  const updates = [];

  for (const quest of QUESTS) {
    const current = getCurrentProgress(record, quest, now);
    const progress = Math.min(quest.target, current.progress + 1);

    record[quest.id] = {
      period: current.period,
      progress,
      claimed: current.claimed,
    };

    updates.push({
      id: quest.id,
      progress,
      target: quest.target,
      completed: progress >= quest.target,
    });
  }

  guildData[userId] = record;
  all[guildId] = guildData;

  store.write('quests', all);

  return updates;
}

function getQuests(guildId, userId, now = new Date()) {
  guildId = requireDiscordId(guildId, 'server');
  userId = requireDiscordId(userId, 'user');

  const all = readAll();
  const { userData } = getUserRecord(all, guildId, userId);

  return QUESTS.map((quest) => {
    const current = getCurrentProgress(userData, quest, now);

    return {
      ...quest,
      progress: current.progress,
      completed: current.progress >= quest.target,
      claimed: current.claimed,
      period: current.period,
    };
  });
}

function claimQuest(guildId, userId, questId, now = new Date()) {
  guildId = requireDiscordId(guildId, 'server');
  userId = requireDiscordId(userId, 'user');

  const quest = QUESTS.find((item) => item.id === questId);

  if (!quest) {
    return { success: false, reason: 'not_found' };
  }

  const all = readAll();
  const { guildData, userData } = getUserRecord(all, guildId, userId);
  const current = getCurrentProgress(userData, quest, now);

  if (current.progress < quest.target) {
    return { success: false, reason: 'incomplete' };
  }

  if (current.claimed) {
    return { success: false, reason: 'claimed' };
  }

  const record = { ...userData };
  const previousQuestRecord = record[quest.id];

  record[quest.id] = {
    period: current.period,
    progress: current.progress,
    claimed: true,
  };

  guildData[userId] = record;
  all[guildId] = guildData;

  // Save the claim before awarding XP to reduce duplicate claims.
  store.write('quests', all);

  let xpResult;

  try {
    xpResult = xp.addBonusXp(guildId, userId, quest.rewardXp);
  } catch (error) {
    try {
      if (previousQuestRecord === undefined) {
        delete record[quest.id];
      } else {
        record[quest.id] = previousQuestRecord;
      }

      store.write('quests', all);
    } catch (rollbackError) {
      console.error(
        'Could not restore quest claim after XP award failed:',
        rollbackError
      );
    }

    throw error;
  }

  return {
    success: true,
    quest,
    xpResult,
  };
}

module.exports = {
  QUESTS,
  getPeriodKey,
  recordMessage,
  getQuests,
  claimQuest,
};
