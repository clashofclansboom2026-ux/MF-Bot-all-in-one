const { Events, PermissionFlagsBits } = require('discord.js');
const { sendModLog } = require('../utils/modLog');

const SPAM_LIMIT = 5;
const SPAM_WINDOW_MS = 5000;
const TIMEOUT_MS = 60 * 1000;

const userMessages = new Map();
const timedOutUsers = new Set();

module.exports = {
  name: Events.MessageCreate,

  async execute(message) {
    try {
      if (!message.guild || message.author.bot) return;

      const member = message.member;
      if (!member) return;

      // Exempt administrators and moderators with Manage Messages.
      if (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageMessages)
      ) {
        return;
      }

      const now = Date.now();
      const key = `${message.guild.id}:${message.author.id}`;

      // Keep the actual message objects, not just timestamps.
      const recentMessages = (userMessages.get(key) || [])
        .filter(entry => now - entry.timestamp < SPAM_WINDOW_MS);

      recentMessages.push({
        timestamp: now,
        message,
      });

      userMessages.set(key, recentMessages);

      // Trigger when a member sends 5 messages within 5 seconds.
      if (recentMessages.length < SPAM_LIMIT) return;

      // Prevent duplicate moderation attempts while processing.
      if (timedOutUsers.has(key)) return;
      timedOutUsers.add(key);

      try {
        // Attempt to delete every message in the detected spam burst.
        const deletions = await Promise.allSettled(
          recentMessages.map(entry => entry.message.delete())
        );

        const deletedCount = deletions.filter(
          result => result.status === 'fulfilled'
        ).length;

        if (!member.moderatable) {
          await sendModLog(message.guild, {
            title: 'Anti-Spam: Messages Deleted',
            description:
              `**Member:** ${message.author.tag} (${message.author.id})\n` +
              `**Channel:** ${message.channel}\n` +
              `**Messages deleted:** ${deletedCount}/${recentMessages.length}\n` +
              '**Timeout:** Not applied — member is not moderatable',
          });

          return;
        }

        await member.timeout(
          TIMEOUT_MS,
          'Automatic anti-spam: excessive messages'
        );

        await sendModLog(message.guild, {
          title: 'Anti-Spam: Member Timed Out',
          description:
            `**Member:** ${message.author.tag} (${message.author.id})\n` +
            `**Channel:** ${message.channel}\n` +
            `**Messages deleted:** ${deletedCount}/${recentMessages.length}\n` +
            '**Duration:** 1 minute\n' +
            '**Reason:** Sent too many messages within 5 seconds',
        });
      } finally {
        userMessages.delete(key);
        timedOutUsers.delete(key);
      }
    } catch (error) {
      console.error('Error in anti-spam event:', error);
    }
  },
};
