const { Events, PermissionFlagsBits } = require('discord.js');
const { sendModLog } = require('../utils/modLog');

const SPAM_LIMIT = 5;
const SPAM_WINDOW_MS = 5000;
const TIMEOUT_MS = 60 * 1000;

const userMessages = new Map();
const processingUsers = new Set();

module.exports = {
  name: Events.MessageCreate,

  async execute(message) {
    try {
      if (!message.guild || message.author.bot || !message.member) return;

      const member = message.member;

      if (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageMessages)
      ) {
        return;
      }

      const now = Date.now();
      const key = `${message.guild.id}:${message.author.id}`;

      const recentMessages = (userMessages.get(key) || [])
        .filter(entry => now - entry.timestamp < SPAM_WINDOW_MS);

      recentMessages.push({
        timestamp: now,
        message,
      });

      userMessages.set(key, recentMessages);

      if (recentMessages.length < SPAM_LIMIT) return;
      if (processingUsers.has(key)) return;

      processingUsers.add(key);

      try {
        const messagesToDelete = recentMessages
          .map(entry => entry.message)
          .filter(msg => msg.deletable);

        let deletedCount = 0;

        if (messagesToDelete.length > 1) {
          try {
            const deleted = await message.channel.bulkDelete(
              messagesToDelete,
              true
            );
            deletedCount = deleted.size;
          } catch (error) {
            console.error('Bulk spam deletion failed:', error);
          }
        } else if (messagesToDelete.length === 1) {
          try {
            await messagesToDelete[0].delete();
            deletedCount = 1;
          } catch (error) {
            console.error('Spam message deletion failed:', error);
          }
        }

        if (member.moderatable) {
          await member.timeout(
            TIMEOUT_MS,
            'Automatic anti-spam: excessive messages'
          );
        }

        await sendModLog(message.guild, {
          title: 'Anti-Spam Triggered',
          description:
            `**Member:** ${message.author.tag} (${message.author.id})\n` +
            `**Channel:** ${message.channel}\n` +
            `**Messages deleted:** ${deletedCount}/${recentMessages.length}\n` +
            `**Timeout:** ${member.moderatable ? '1 minute' : 'Not applied — member is not moderatable'}`,
        });
      } finally {
        userMessages.delete(key);
        processingUsers.delete(key);
      }
    } catch (error) {
      console.error('Error in anti-spam event:', error);
    }
  },
};
