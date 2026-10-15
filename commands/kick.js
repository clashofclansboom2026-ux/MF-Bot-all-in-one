const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { hidden, confirm, notifyUser, recordAction } = require('../utils/modCore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption((o) =>
      o.setName('member').setDescription('The member to kick').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for the kick').setMaxLength(500)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));
    if (!interaction.memberPermissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply(hidden('You need the Kick Members permission to use this command.'));
    }

    const user = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return interaction.reply(hidden('That person is not in this server, so there is nobody to kick.'));
    }
    if (!member.kickable) {
      return interaction.reply(
        hidden('I cannot kick that member. Check my permissions and role hierarchy.')
      );
    }

    const sure = await confirm(interaction, `⚠️ Kick **${user.tag}**?\n**Reason:** ${reason}`);
    if (!sure) return;

    // Message them first. Once they are kicked, I can no longer reach them.
    const dmSent = await notifyUser(interaction.guild, user, 'kick', reason);

    try {
      await member.kick(`${reason} | Moderator: ${interaction.user.tag}`);
    } catch (error) {
      console.error('Error in /kick:', error);
      return interaction.editReply(
        'Failed to kick that member. Check my permissions and role hierarchy.'
      );
    }

    await recordAction(interaction, { type: 'kick', user, reason, dmSent });
  },
};
