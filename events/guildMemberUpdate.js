const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLog');
const { wait } = require('../utils/checks');

module.exports = {
  name: Events.GuildMemberUpdate,

  async execute(oldMember, newMember) {
    try {
      const wasTimedOut = oldMember.isCommunicationDisabled();
      const isTimedOut = newMember.isCommunicationDisabled();

      // Only continue if the timeout status changed.
      if (wasTimedOut === isTimedOut) return;

      // Give Discord a moment to write its audit log entry.
      await wait(1000);

      const auditLogs = await newMember.guild.fetchAuditLogs({
        type: 24,
        limit: 5,
      });

      const entry = auditLogs.entries.find(log =>
        log.target?.id === newMember.id &&
        Date.now() - log.createdTimestamp < 10000
      );

      // Skip if no likely matching audit entry was found.
      if (!entry) return;

      // If this bot did it (a command or anti-spam), it was already logged.
      if (entry.executor?.id === newMember.client.user.id) return;

      await sendModLog(newMember.guild, {
        title: isTimedOut
          ? 'Member Timed Out (Discord)'
          : 'Member Timeout Removed (Discord)',
        description:
          `**Member:** ${newMember.user.tag} (${newMember.id})\n` +
          `**Moderator:** ${entry.executor?.tag || 'Unknown'}\n` +
          `**Reason:** ${entry.reason || 'No reason provided'}`,
      });
    } catch (error) {
      console.error('Error logging manual timeout change:', error);
    }
  },
};
