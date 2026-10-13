const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLog');
const { wait } = require('../utils/checks');

module.exports = {
  name: Events.MessageBulkDelete,

  async execute(messages) {
    try {
      const firstMessage = messages.first();
      if (!firstMessage || !firstMessage.guild) return;

      const guild = firstMessage.guild;
      const channel = firstMessage.channel;

      // Give Discord a moment to write its audit log entry.
      await wait(1000);

      const auditLogs = await guild.fetchAuditLogs({
        type: 73,
        limit: 5,
      });

      const entry = auditLogs.entries.find(log =>
        log.extra?.channel?.id === channel.id &&
        Date.now() - log.createdTimestamp < 10000
      );

      // If this bot did it (/clear or anti-spam), it was already logged.
      if (entry?.executor?.id === firstMessage.client.user.id) return;

      await sendModLog(guild, {
        title: 'Messages Bulk Deleted (Discord)',
        description:
          `**Moderator:** ${entry?.executor?.tag || 'Unknown'}\n` +
          `**Channel:** ${channel}\n` +
          `**Messages deleted:** ${messages.size}\n` +
          `**Reason:** ${entry?.reason || 'Not available'}`,
      });
    } catch (error) {
      console.error('Error logging bulk message deletion:', error);
    }
  },
};
