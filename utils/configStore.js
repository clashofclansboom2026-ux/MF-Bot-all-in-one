
const fs = require('node:fs');
const path = require('node:path');

const dataDirectory = path.join(__dirname, '..', 'data');
const configFile = path.join(dataDirectory, 'config.json');

function ensureStorage() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, '{}', 'utf8');
  }
}

function readConfig() {
  ensureStorage();

  try {
    return JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch (error) {
    console.error('Could not read configuration:', error);
    return {};
  }
}

function getGuildConfig(guildId) {
  const config = readConfig();
  return config[guildId] || {};
}

function setGuildConfig(guildId, updates) {
  const config = readConfig();

  config[guildId] = {
    ...(config[guildId] || {}),
    ...updates,
  };

  ensureStorage();
  fs.writeFileSync(
    configFile,
    JSON.stringify(config, null, 2),
    'utf8'
  );

  return config[guildId];
}

module.exports = {
  getGuildConfig,
  setGuildConfig,
};
