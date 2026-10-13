
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption(option =>
      option
        .setName('member')
        .setDescription('The member to ban')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the ban')
        .setMaxLength(500)
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option
        .setName('delete_days')
        .setDescription('Days of recent messages to delete (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
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

    const user = interaction.options.getUser('member');
    const reason =
      interaction.options.getString('reason') || 'No reason provided';
    const deleteDays =
      interaction.options.getInteger('delete_days') ?? 0;

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const member = await interaction.guild.members.fetch(user.id)
        .catch(() => null);

      if (member && !member.bannable) {
        return interaction.editReply(
          'I cannot ban that member. Check my permissions and role hierarchy.'
        );
      }

      await interaction.guild.members.ban(user.id, {
        reason: `${reason} | Moderator: ${interaction.user.tag}`,
        deleteMessageSeconds: deleteDays * 24 * 60 * 60,
      });

      await interaction.editReply(
        `Successfully banned **${user.tag}**.\nReason: ${reason}\nRecent message history deleted: ${deleteDays} day(s).`
      );
    } catch (error) {
      console.error('Error in /ban:', error);

      await interaction.editReply(
        'Failed to ban that user. Check my permissions and role hierarchy.'
      );
    }
  },
};
