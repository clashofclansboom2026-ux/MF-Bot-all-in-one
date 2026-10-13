const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLog');
const { wait } = require('../utils/checks');

module.exports = {
  name: Events.GuildBanAdd,

  async execute(ban) {
    try {
      // Give Discord a moment to write its audit log entry.
      await wait(1000);

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

      // If this bot did it, the command already logged it.
      if (entry.executor?.id === ban.client.user.id) return;

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
