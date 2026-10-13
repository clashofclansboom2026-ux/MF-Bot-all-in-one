const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLog');

module.exports = {
  name: Events.GuildBanAdd,

  async execute(ban) {
    try {
      const auditLogs = await ban.guild.fetchAuditLogs({
        type: 22,
        limit: 5,
      });

      const entry = auditLogs.entries.find(log =>
        log.target?.id === ban.user.id &&
        Date.now() - log.createdTimestamp < 10000
      );

      // Skip logging if the bot cannot identify a likely manual action.
      if (!entry) return;

      await sendModLog(ban.guild, {
        title: 'Member Banned (Discord)',
        description:
          `**Member:** ${ban.user.tag} (${ban.user.id})\n` +
          `**Moderator:** ${entry.executor?.tag || 'Unknown'}\n` +
          `**Reason:** ${entry.reason || 'No reason provided'}`,
      });
    } catch (error) {
      console.error('Error logging manual ban:', error);
    }
  },
};
