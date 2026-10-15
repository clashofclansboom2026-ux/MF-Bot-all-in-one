const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { hidden, defer, recordAction } = require('../utils/modCore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by their Discord ID')
    .addStringOption((o) =>
      o.setName('user_id').setDescription('The Discord ID of the user to unban').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for removing the ban').setMaxLength(500)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));
    if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply(hidden('You need the Ban Members permission to use this command.'));
    }

    const userId = interaction.options.getString('user_id', true).trim();
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.reply(hidden('That does not look like a valid Discord user ID.'));
    }

    await defer(interaction);

    const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!ban) return interaction.editReply('That user is not currently banned from this server.');

    try {
      await interaction.guild.members.unban(
        userId,
        `${reason} | Moderator: ${interaction.user.tag}`
      );
    } catch (error) {
      console.error('Error in /unban:', error);
      return interaction.editReply('Failed to unban that user. Check my permissions and try again.');
    }

    await recordAction(interaction, { type: 'unban', user: ban.user, reason });
  },
};
