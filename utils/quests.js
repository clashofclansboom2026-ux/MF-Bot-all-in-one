
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

function getPeriodKey(type, now = new Date()) {
  const date = new Date(now);
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
  return store.read('quests', {});
}

function getCurrentProgress(record, quest, now = new Date()) {
  const period = getPeriodKey(quest.type, now);
  const saved = record[quest.id];

  if (!saved || saved.period !== period) {
    return { period, progress: 0, claimed: false };
  }

  return {
    period,
    progress: Math.min(
      quest.target,
      Math.max(0, Number(saved.progress) || 0)
    ),
    claimed: saved.claimed === true,
  };
}

function recordMessage(guildId, userId, now = new Date()) {
  const all = readAll();

  all[guildId] ??= {};
  all[guildId][userId] ??= {};

  const record = all[guildId][userId];
  const updates = [];

  for (const quest of QUESTS) {
    const current = getCurrentProgress(record, quest, now);
    const progress = Math.min(
      quest.target,
      current.progress + 1
    );

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

  store.write('quests', all);
  return updates;
}

function getQuests(guildId, userId, now = new Date()) {
  const all = readAll();
  const record = all[guildId]?.[userId] || {};

  return QUESTS.map((quest) => {
    const current = getCurrentProgress(record, quest, now);

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
  const quest = QUESTS.find((item) => item.id === questId);

  if (!quest) {
    return { success: false, reason: 'not_found' };
  }

  const all = readAll();
  const record = all[guildId]?.[userId] || {};
  const current = getCurrentProgress(record, quest, now);

  if (current.progress < quest.target) {
    return { success: false, reason: 'incomplete' };
  }

  if (current.claimed) {
    return { success: false, reason: 'claimed' };
  }

  all[guildId] ??= {};
  all[guildId][userId] ??= {};

  all[guildId][userId][quest.id] = {
    period: current.period,
    progress: current.progress,
    claimed: true,
  };

  // Save the claim before awarding XP to prevent repeat claims.
  store.write('quests', all);

  const xpResult = xp.addBonusXp(
    guildId,
    userId,
    quest.rewardXp
  );

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
