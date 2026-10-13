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

      const recentMessages = (userMessages.get(key) || [])
        .filter(timestamp => now - timestamp < SPAM_WINDOW_MS);

      recentMessages.push(now);
      userMessages.set(key, recentMessages);

      // Trigger when a member sends 5 messages within 5 seconds.
      if (recentMessages.length < SPAM_LIMIT) return;

      // Prevent repeated timeout attempts while this action is running.
      if (timedOutUsers.has(key)) return;
      timedOutUsers.add(key);

      try {
        // Delete the messages that triggered the spam threshold.
        await message.delete().catch(() => null);

        if (!member.moderatable) return;

        await member.timeout(
          TIMEOUT_MS,
          'Automatic anti-spam: excessive messages'
        );

        await sendModLog(message.guild, {
          title: 'Anti-Spam: Member Timed Out',
          description:
            `**Member:** ${message.author.tag} (${message.author.id})\n` +
            `**Channel:** ${message.channel}\n` +
            `**Duration:** 1 minute\n` +
            `**Reason:** Sent ${recentMessages.length} messages within 5 seconds`,
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
