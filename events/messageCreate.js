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
    if (!message.guild || message.author.bot || !message.member) return;

    const member = message.member;

    if (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageMessages)
    ) {
      return;
    }

    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();

    const recent = (userMessages.get(key) || [])
      .filter(entry => now - entry.timestamp < SPAM_WINDOW_MS);

    recent.push({ timestamp: now, message });
    userMessages.set(key, recent);

    if (recent.length < SPAM_LIMIT || processingUsers.has(key)) return;

    processingUsers.add(key);

    const burst = [...recent];
    userMessages.delete(key);

    try {
      const messages = burst.map(entry => entry.message);
      let deletedCount = 0;
      const deletedIds = new Set();

      // Bulk-delete the captured spam burst.
      if (messages.length >= 2) {
        try {
          const deleted = await message.channel.bulkDelete(messages, true);
          deletedCount = deleted.size;

          for (const deletedMessage of deleted.values()) {
            deletedIds.add(deletedMessage.id);
          }
        } catch (error) {
          console.error('Bulk deletion failed:', error.message);
        }
      }

      // Only try individual deletion if the bulk request failed.
      if (deletedIds.size === 0) {
        for (const msg of messages) {
          try {
            await msg.delete();
            deletedCount++;
          } catch (error) {
            // A message may already have been deleted.
            if (error.code !== 10008) {
              console.error(`Could not delete message ${msg.id}:`, error.message);
            }
          }
        }
      }

      let timeoutApplied = false;

      if (member.moderatable) {
        try {
          await member.timeout(
            TIMEOUT_MS,
            'Automatic anti-spam: excessive messages'
          );
          timeoutApplied = true;
        } catch (error) {
          console.error('Could not apply anti-spam timeout:', error.message);
        }
      }

      await sendModLog(message.guild, {
        title: 'Anti-Spam Triggered',
        description:
          `**Member:** ${message.author.tag} (${message.author.id})\n` +
          `**Channel:** ${message.channel}\n` +
          `**Messages in burst:** ${messages.length}\n` +
          `**Messages deleted:** ${deletedCount}\n` +
          `**Timeout:** ${timeoutApplied ? '1 minute' : 'Not applied'}`,
      });
    } catch (error) {
      console.error('Error in anti-spam event:', error);
    } finally {
      processingUsers.delete(key);
    }
  },
};
