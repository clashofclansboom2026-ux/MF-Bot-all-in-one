
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const { sendModLog } = require('../utils/modLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption(option =>
      option
        .setName('member')
        .setDescription('The member to kick')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the kick')
        .setMaxLength(500)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(
      PermissionFlagsBits.KickMembers
    )) {
      return interaction.reply({
        content: 'You need the Kick Members permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const user = interaction.options.getUser('member');
    const reason =
      interaction.options.getString('reason') || 'No reason provided';

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const member = await interaction.guild.members.fetch(user.id);

      if (!member.kickable) {
        return interaction.editReply(
          'I cannot kick that member. Check my permissions and role hierarchy.'
        );
      }

      await member.kick(
        `${reason} | Moderator: ${interaction.user.tag}`
      );

      await sendModLog(interaction.guild, {
        title: 'Member Kicked',
        description:
          `**Member:** ${user.tag} (${user.id})\n` +
          `**Moderator:** ${interaction.user.tag}\n` +
          `**Reason:** ${reason}`,
      });

      await interaction.editReply(
        `Successfully kicked **${user.tag}**.\nReason: ${reason}`
      );
    } catch (error) {
      console.error('Error in /kick:', error);

      await interaction.editReply(
        'Failed to kick that member. Check my permissions and role hierarchy.'
      );
    }
  },
};
