const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLog');

module.exports = {
  name: Events.MessageBulkDelete,

  async execute(messages) {
    try {
      const firstMessage = messages.first();
      if (!firstMessage || !firstMessage.guild) return;

      const guild = firstMessage.guild;
      const channel = firstMessage.channel;

      const auditLogs = await guild.fetchAuditLogs({
        type: 73,
        limit: 5,
      });

      const entry = auditLogs.entries.find(log =>
        log.extra?.channel?.id === channel.id &&
        Date.now() - log.createdTimestamp < 10000
      );

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
