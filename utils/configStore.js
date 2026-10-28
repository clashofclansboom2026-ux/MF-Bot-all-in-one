
'use strict';

// MF Bot - Guild Configuration Storage
// Uses the shared JSON storage utility so configuration benefits from
// the same safe file-writing behaviour as the bot's other saved data.

const store = require('./store');

function validateGuildId(guildId) {
  if (
    (typeof guildId !== 'string' && typeof guildId !== 'number') ||
    String(guildId).trim() === ''
  ) {
    throw new TypeError('A valid guild ID is required.');
  }

  return String(guildId);
}

function readAllConfig() {
  const config = store.read('config', {});

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    console.error(
      '[Config] Saved configuration is not a valid object. Using an empty configuration.'
    );
    return {};
  }

  return config;
}

function getGuildConfig(guildId) {
  const id = validateGuildId(guildId);
  const config = readAllConfig();
  const guildConfig = config[id];

  if (
    !guildConfig ||
    typeof guildConfig !== 'object' ||
    Array.isArray(guildConfig)
  ) {
    return {};
  }

  return guildConfig;
}

function setGuildConfig(guildId, updates) {
  const id = validateGuildId(guildId);

  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new TypeError('Configuration updates must be an object.');
  }

  const config = readAllConfig();
  const existingGuildConfig = config[id];

  config[id] = {
    ...(existingGuildConfig &&
    typeof existingGuildConfig === 'object' &&
    !Array.isArray(existingGuildConfig)
      ? existingGuildConfig
      : {}),
    ...updates,
  };

  store.write('config', config);

  return config[id];
}

module.exports = {
  getGuildConfig,
  setGuildConfig,
};
