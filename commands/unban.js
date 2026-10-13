
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const { sendModLog } = require('../utils/modLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by their Discord ID')
    .addStringOption(option =>
      option
        .setName('user_id')
        .setDescription('The Discord ID of the user to unban')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for removing the ban')
        .setMaxLength(500)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(
      PermissionFlagsBits.BanMembers
    )) {
      return interaction.reply({
        content: 'You need the Ban Members permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const userId = interaction.options.getString('user_id').trim();
    const reason =
      interaction.options.getString('reason') || 'No reason provided';

    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.reply({
        content: 'That does not look like a valid Discord user ID.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const ban = await interaction.guild.bans.fetch(userId)
        .catch(() => null);

      if (!ban) {
        return interaction.editReply(
          'That user is not currently banned from this server.'
        );
      }

      await interaction.guild.members.unban(
        userId,
        `${reason} | Moderator: ${interaction.user.tag}`
      );

      await sendModLog(interaction.guild, {
        title: 'Member Unbanned',
        description:
          `**Member:** ${ban.user.tag} (${ban.user.id})\n` +
          `**Moderator:** ${interaction.user.tag}\n` +
          `**Reason:** ${reason}`,
      });

      await interaction.editReply(
        `Successfully unbanned **${ban.user.tag}**.\nReason: ${reason}\nThey can now rejoin using a valid server invite.`
      );
    } catch (error) {
      console.error('Error in /unban:', error);

      await interaction.editReply(
        'Failed to unban that user. Check my permissions and try again.'
      );
    }
  },
};
