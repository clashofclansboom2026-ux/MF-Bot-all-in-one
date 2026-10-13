const { Events, PermissionFlagsBits } = require('discord.js');
const { sendModLog } = require('../utils/modLog');
const { getGuildConfig } = require('../utils/configStore');
const defaults = { messages: 5, windowMs: 5000, timeoutMs: 60000 };
const userMessages = new Map();
const processingUsers = new Set();

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author.bot || !message.member) return;
    const member = message.member;
    if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

    const settings = getGuildConfig(message.guild.id).antiSpam || {};
    const limit = Number.isInteger(settings.messages) ? Math.max(2, Math.min(10, settings.messages)) : defaults.messages;
    const windowMs = Number.isInteger(settings.windowMs) ? Math.max(3000, Math.min(30000, settings.windowMs)) : defaults.windowMs;
    const timeoutMs = Number.isInteger(settings.timeoutMs) ? Math.max(60000, Math.min(86400000, settings.timeoutMs)) : defaults.timeoutMs;

    const key = `${message.guild.id}:${message.channel.id}:${message.author.id}`;
    const recent = (userMessages.get(key) || []).filter(e => Date.now() - e.timestamp < windowMs);
    recent.push({ timestamp: Date.now(), message });
    userMessages.set(key, recent);

    if (recent.length < limit || processingUsers.has(key)) return;
    processingUsers.add(key);
    const burst = recent.map(e => e.message);
    userMessages.delete(key);

    try {
      let deletedCount = 0;
      let bulkSucceeded = false;

      try {
        const deleted = await message.channel.bulkDelete(burst, true);
        deletedCount = deleted.size;
        bulkSucceeded = true;
      } catch (error) {
        console.error('Anti-spam bulk deletion failed:', error.message);
      }

      if (!bulkSucceeded) {
        for (const msg of burst) {
          try {
            await msg.delete();
            deletedCount++;
          } catch (error) {
            if (error.code !== 10008) console.error(`Could not delete ${msg.id}:`, error.message);
          }
        }
      }

      let timeoutApplied = false;
      if (member.moderatable) {
        try {
          await member.timeout(timeoutMs, 'Automatic anti-spam: excessive messages');
          timeoutApplied = true;
        } catch (error) {
          console.error('Anti-spam timeout failed:', error.message);
        }
      }

      await sendModLog(message.guild, {
        title: 'Anti-Spam Triggered',
        description: `**Member:** ${message.author.tag} (${message.author.id})\n**Channel:** ${message.channel}\n**Messages detected:** ${burst.length}\n**Messages deleted:** ${deletedCount}\n**Timeout:** ${timeoutApplied ? `${timeoutMs / 60000} minute(s)` : 'Not applied'}`,
      });
    } catch (error) {
      console.error('Anti-spam processing failed:', error);
    } finally {
      processingUsers.delete(key);
    }
  },
};
