const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLog');

module.exports = {
  name: Events.GuildBanRemove,

  async execute(ban) {
    try {
      const auditLogs = await ban.guild.fetchAuditLogs({
        type: 23,
        limit: 5,
      });

      const entry = auditLogs.entries.find(log =>
        log.target?.id === ban.user.id &&
        Date.now() - log.createdTimestamp < 10000
      );

      // Skip logging if no likely matching audit entry is found.
      if (!entry) return;

      await sendModLog(ban.guild, {
        title: 'Member Unbanned (Discord)',
        description:
          `**Member:** ${ban.user.tag} (${ban.user.id})\n` +
          `**Moderator:** ${entry.executor?.tag || 'Unknown'}\n` +
          `**Reason:** ${entry.reason || 'No reason provided'}`,
      });
    } catch (error) {
      console.error('Error logging manual unban:', error);
    }
  },
};
