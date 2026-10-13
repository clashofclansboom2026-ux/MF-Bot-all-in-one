
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const { sendModLog } = require('../utils/modLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Temporarily timeout a member')
    .addUserOption(option =>
      option
        .setName('member')
        .setDescription('The member to timeout')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('duration')
        .setDescription('Duration in minutes (1-40320)')
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the timeout')
        .setMaxLength(500)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(
      PermissionFlagsBits.ModerateMembers
    )) {
      return interaction.reply({
        content: 'You need the Moderate Members permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const user = interaction.options.getUser('member');
    const duration = interaction.options.getInteger('duration');
    const reason =
      interaction.options.getString('reason') || 'No reason provided';

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const member = await interaction.guild.members.fetch(user.id);

      if (!member.moderatable) {
        return interaction.editReply(
          'I cannot timeout that member. Check my permissions and role hierarchy.'
        );
      }

      await member.timeout(
        duration * 60 * 1000,
        `${reason} | Moderator: ${interaction.user.tag}`
      );

      await sendModLog(interaction.guild, {
        title: 'Member Timed Out',
        description:
          `**Member:** ${user.tag} (${user.id})\n` +
          `**Moderator:** ${interaction.user.tag}\n` +
          `**Duration:** ${duration} minute(s)\n` +
          `**Reason:** ${reason}`,
      });

      await interaction.editReply(
        `Successfully timed out **${user.tag}** for **${duration} minute(s)**.\nReason: ${reason}`
      );
    } catch (error) {
      console.error('Error in /timeout:', error);

      await interaction.editReply(
        'Failed to timeout that member. Check my permissions and role hierarchy.'
      );
    }
  },
};
