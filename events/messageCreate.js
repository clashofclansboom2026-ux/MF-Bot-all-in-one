const { Events, PermissionFlagsBits } = require('discord.js');
const { sendModLog } = require('../utils/modLog');
const { getGuildConfig } = require('../utils/configStore');

const DEFAULTS = {
  messages: 5,
  windowMs: 5000,
  timeoutMs: 60000,
};

const userMessages = new Map();
const processingUsers = new Set();

module.exports = {
  name: Events.MessageCreate,

  async execute(message) {
    if (!message.guild || message.author.bot || !message.member) {
      return;
    }

    const member = message.member;

    if (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageMessages)
    ) {
      return;
    }

    const config = getGuildConfig(message.guild.id);
    const settings = config.antiSpam || {};

    const limit = Number.isInteger(settings.messages)
      ? Math.max(2, Math.min(10, settings.messages))
      : DEFAULTS.messages;

    const windowMs = Number.isInteger(settings.windowMs)
      ? Math.max(3000, Math.min(30000, settings.windowMs))
      : DEFAULTS.windowMs;

    const timeoutMs = Number.isInteger(settings.timeoutMs)
      ? Math.max(60000, Math.min(86400000, settings.timeoutMs))
      : DEFAULTS.timeoutMs;

    const key = `${message.guild.id}:${message.channel.id}:${message.author.id}`;
    const now = Date.now();

    const recent = (userMessages.get(key) || []).filter(
      entry => now - entry.timestamp < windowMs
    );

    recent.push({
      timestamp: now,
      message,
    });

    userMessages.set(key, recent);

    if (recent.length < limit || processingUsers.has(key)) {
      return;
    }

    processingUsers.add(key);

    const burst = [...recent];
    userMessages.delete(key);

    try {
      const messages = burst.map(entry => entry.message);
      let deletedCount = 0;
      let bulkSucceeded = false;

      try {
        const deleted = await message.channel.bulkDelete(messages, true);
        deletedCount = deleted.size;
        bulkSucceeded = true;
      } catch (error) {
        console.error('Anti-spam bulk deletion failed:', error.message);
      }

      if (!bulkSucceeded) {
        for (const msg of messages) {
          try {
            await msg.delete();
            deletedCount++;
          } catch (error) {
            if (error.code !== 10008) {
              console.error(
                `Anti-spam could not delete ${msg.id}:`,
                error.message
              );
            }
          }
        }
      }

      let timeoutApplied = false;

      if (member.moderatable) {
        try {
          await member.timeout(
            timeoutMs,
            'Automatic anti-spam: excessive messages'
          );
          timeoutApplied = true;
        } catch (error) {
          console.error('Anti-spam timeout failed:', error.message);
        }
      }

      await sendModLog(message.guild, {
        title: 'Anti-Spam Triggered',
        description:
          `**Member:** ${message.author.tag} (${message.author.id})\n` +
          `**Channel:** ${message.channel}\n` +
          `**Messages detected:** ${messages.length}\n` +
          `**Messages deleted:** ${deletedCount}\n` +
          `**Timeout:** ${
            timeoutApplied
              ? `${timeoutMs / 60000} minute(s)`
              : 'Not applied'
          }`,
      });
    } catch (error) {
      console.error('Anti-spam processing failed:', error);
    } finally {
      processingUsers.delete(key);
    }
  },
};
