
const store = require('./store');

const DEFAULTS = {
  rewards: {},
  channelId: null,
  announcementsEnabled: true,
};

const DISCORD_ID_PATTERN = /^\d{17,20}$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireGuildId(guildId) {
  const id = String(guildId ?? '');

  if (!DISCORD_ID_PATTERN.test(id)) {
    throw new Error('A valid server ID is required.');
  }

  return id;
}

function normalizeRewards(rewards) {
  if (!isRecord(rewards)) return {};

  return Object.fromEntries(
    Object.entries(rewards).filter(
      ([level, roleId]) =>
        /^\d+$/.test(level) &&
        Number.isSafeInteger(Number(level)) &&
        Number(level) >= 1 &&
        DISCORD_ID_PATTERN.test(String(roleId ?? ''))
    )
  );
}

function readAll() {
  const all = store.read('levelRewards', {});
  return isRecord(all) ? all : {};
}

function getSettings(guildId) {
  guildId = requireGuildId(guildId);

  const all = readAll();
  const saved = isRecord(all[guildId]) ? all[guildId] : {};

  return {
    ...DEFAULTS,
    ...saved,
    rewards: normalizeRewards(saved.rewards),
    channelId: DISCORD_ID_PATTERN.test(String(saved.channelId ?? ''))
      ? String(saved.channelId)
      : null,
    announcementsEnabled: saved.announcementsEnabled !== false,
  };
}

function saveSettings(guildId, settings) {
  guildId = requireGuildId(guildId);

  if (!isRecord(settings)) {
    throw new Error('Level reward settings must be an object.');
  }

  const all = readAll();
  const current = isRecord(all[guildId]) ? all[guildId] : {};

  const next = {
    ...DEFAULTS,
    ...current,
    ...settings,
    rewards: normalizeRewards({
      ...(isRecord(current.rewards) ? current.rewards : {}),
      ...(isRecord(settings.rewards) ? settings.rewards : {}),
    }),
  };

  if (next.channelId !== null && next.channelId !== undefined) {
    next.channelId = DISCORD_ID_PATTERN.test(String(next.channelId))
      ? String(next.channelId)
      : null;
  } else {
    next.channelId = null;
  }

  next.announcementsEnabled = next.announcementsEnabled !== false;

  all[guildId] = next;
  store.write('levelRewards', all);

  return getSettings(guildId);
}

function setReward(guildId, level, roleId) {
  guildId = requireGuildId(guildId);

  const numericLevel = Number(level);

  if (!Number.isSafeInteger(numericLevel) || numericLevel < 1) {
    throw new Error('The reward level must be a positive whole number.');
  }

  if (!DISCORD_ID_PATTERN.test(String(roleId ?? ''))) {
    throw new Error('A valid Discord role ID is required.');
  }

  const settings = getSettings(guildId);
  settings.rewards[String(numericLevel)] = String(roleId);

  return saveSettings(guildId, settings);
}

function removeReward(guildId, level) {
  guildId = requireGuildId(guildId);

  const numericLevel = Number(level);

  if (!Number.isSafeInteger(numericLevel) || numericLevel < 1) {
    throw new Error('The reward level must be a positive whole number.');
  }

  const settings = getSettings(guildId);
  delete settings.rewards[String(numericLevel)];

  return saveSettings(guildId, settings);
}

function setChannel(guildId, channelId) {
  guildId = requireGuildId(guildId);

  if (channelId !== null && channelId !== undefined && channelId !== '') {
    if (!DISCORD_ID_PATTERN.test(String(channelId))) {
      throw new Error('A valid Discord channel ID is required.');
    }

    channelId = String(channelId);
  } else {
    channelId = null;
  }

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
  if (!member?.guild?.id || !member?.roles?.cache) {
    throw new Error('A valid Discord server member is required.');
  }

  if (
    !Number.isSafeInteger(fromLevel) ||
    !Number.isSafeInteger(toLevel) ||
    fromLevel < 0 ||
    toLevel < fromLevel
  ) {
    throw new Error('Invalid level range supplied for reward assignment.');
  }

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
