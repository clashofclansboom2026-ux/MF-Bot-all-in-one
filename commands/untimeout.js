const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { hidden, defer, notifyUser, recordAction } = require('../utils/modCore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove a member timeout')
    .addUserOption((o) =>
      o.setName('member').setDescription('The member to unmute').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason (optional)').setMaxLength(500)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply(hidden('You need the Moderate Members permission to use this command.'));
    }

    const user = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason') || 'Timeout removed by a moderator';

    await defer(interaction);

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.editReply('That person is not in this server.');

    if (!member.moderatable) {
      return interaction.editReply(
        'I cannot moderate that member. Check my permissions and role hierarchy.'
      );
    }
    if (!member.isCommunicationDisabled()) {
      return interaction.editReply(`**${user.tag}** does not currently have an active timeout.`);
    }

    try {
      await member.timeout(null, `${reason} | Moderator: ${interaction.user.tag}`);
    } catch (error) {
      console.error('Error in /untimeout:', error);
      return interaction.editReply(
        'Failed to remove the timeout. Check my permissions and role hierarchy.'
      );
    }

    const dmSent = await notifyUser(interaction.guild, user, 'untimeout', reason);
    await recordAction(interaction, { type: 'untimeout', user, reason, dmSent });
  },
};
