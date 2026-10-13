const { Events, PermissionFlagsBits } = require('discord.js');
const { sendModLog } = require('../utils/modLog');
const { getGuildConfig } = require('../utils/configStore');

const DEFAULT_SPAM_LIMIT = 5;
const DEFAULT_SPAM_WINDOW_MS = 5000;
const DEFAULT_TIMEOUT_MS = 60 * 1000;

const userMessages = new Map();
const processingUsers = new Set();

module.exports = {
  name: Events.MessageCreate,

  async execute(message) {
    if (!message.guild || message.author.bot || !message.member) return;

    const member = message.member;

    // Exempt administrators and moderators with Manage Messages.
    if (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageMessages)
    ) {
      return;
    }

    // Read this server's anti-spam configuration.
    const config = getGuildConfig(message.guild.id);
    const settings = config.antiSpam || {};

    const spamLimit = Number.isInteger(settings.messages)
      ? Math.min(10, Math.max(2, settings.messages))
      : DEFAULT_SPAM_LIMIT;

    const spamWindowMs = Number.isInteger(settings.windowMs)
      ? Math.min(30000, Math.max(3000, settings.windowMs))
      : DEFAULT_SPAM_WINDOW_MS;

    const timeoutMs = Number.isInteger(settings.timeoutMs)
      ? Math.min(1440 * 60 * 1000, Math.max(60 * 1000, settings.timeoutMs))
      : DEFAULT_TIMEOUT_MS;

    // Track each member separately in each channel.
    const key = `${message.guild.id}:${message.channel.id}:${message.author.id}`;
    const now = Date.now();

    const recent = (userMessages.get(key) || []).filter(
      entry => now - entry.timestamp < spamWindowMs
    );

    recent.push({ timestamp: now, message });
    userMessages.set(key, recent);

    if (recent.length < spamLimit || processingUsers.has(key)) return;

    processingUsers.add(key);

    // Capture this burst and reset tracking.
    const burst = [...recent];
    userMessages.delete(key);

    try {
      const messages = burst.map(entry => entry.message);
      let deletedCount = 0;
      let bulkDeleteSucceeded = false;

      // Attempt bulk deletion first.
      if (messages.length >= 2) {
        try {
          const deleted = await message.channel.bulkDelete(messages, true);
          deletedCount = deleted.size;
