
const store = require('./store');

const DEFAULTS = {
  rewards: {},
  channelId: null,
  announcementsEnabled: true,
};

function getSettings(guildId) {
  const all = store.read('levelRewards', {});
  const saved = all[guildId] || {};
  const rewards = saved.rewards || {};

  return {
    ...DEFAULTS,
    ...saved,
    rewards: Object.fromEntries(
      Object.entries(rewards).filter(
        ([level, roleId]) =>
          Number.isInteger(Number(level)) &&
          Number(level) >= 1 &&
          Boolean(roleId)
      )
    ),
    announcementsEnabled: saved.announcementsEnabled !== false,
  };
}

function saveSettings(guildId, settings) {
  const all = store.read('levelRewards', {});

  all[guildId] = {
    ...DEFAULTS,
    ...(all[guildId] || {}),
    ...settings,
  };

  store.write('levelRewards', all);
  return getSettings(guildId);
}

function setReward(guildId, level, roleId) {
  const settings = getSettings(guildId);
  settings.rewards[String(level)] = roleId;
  return saveSettings(guildId, settings);
}

function removeReward(guildId, level) {
  const settings = getSettings(guildId);
  delete settings.rewards[String(level)];

  const all = store.read('levelRewards', {});
  all[guildId] = settings;

  store.write('levelRewards', all);
  return getSettings(guildId);
}

function setChannel(guildId, channelId) {
  const settings = getSettings(guildId);
  settings.channelId = channelId;
  return saveSettings(guildId, settings);
}

function setAnnouncementsEnabled(guildId, enabled) {
  const settings = getSettings(guildId);
  settings.announcementsEnabled = Boolean(enabled);
  return saveSettings(guildId, settings);
}

async function grantRewards(member, fromLevel, toLevel) {
  const settings = getSettings(member.guild.id);
  const earned = [];
  const failures = [];
  const botMember = member.guild.members.me;

  for (let level = fromLevel + 1; level <= toLevel; level++) {
    const roleId = settings.rewards[String(level)];
    if (!roleId) continue;

    const role =
      member.guild.roles.cache.get(roleId) ||
      await member.guild.roles.fetch(roleId).catch(() => null);

    if (!role) {
      failures.push({ level, reason: 'Role no longer exists.' });
      continue;
    }

    if (member.roles.cache.has(role.id)) continue;

    if (!botMember?.permissions.has('ManageRoles')) {
      failures.push({ level, reason: 'Missing Manage Roles permission.' });
      continue;
    }

    if (
      role.managed ||
      role.position >= botMember.roles.highest.position
    ) {
      failures.push({ level, reason: 'Role is above the bot or managed.' });
      continue;
    }

    try {
      await member.roles.add(role, `Reached level ${level}`);
      earned.push({ level, role });
    } catch (error) {
      console.error(`Could not award level ${level} role:`, error);
      failures.push({ level, reason: 'Role assignment failed.' });
    }
  }

  return { earned, failures, settings };
}

module.exports = {
  getSettings,
  saveSettings,
  setReward,
  removeReward,
  setChannel,
  setAnnouncementsEnabled,
  grantRewards,
};
