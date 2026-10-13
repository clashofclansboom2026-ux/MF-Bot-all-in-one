
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const { sendModLog } = require('../utils/modLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove a member timeout')
    .addUserOption(option =>
      option
        .setName('member')
        .setDescription('The member to remove the timeout from')
        .setRequired(true)
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

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const member = await interaction.guild.members.fetch(user.id);

      if (!member.moderatable) {
        return interaction.editReply(
          'I cannot moderate that member. Check my permissions and role hierarchy.'
        );
      }

      if (!member.isCommunicationDisabled()) {
        return interaction.editReply(
          `**${user.tag}** does not currently have an active timeout.`
        );
      }

      await member.timeout(
        null,
        `Timeout removed by ${interaction.user.tag}`
      );

      await sendModLog(interaction.guild, {
        title: 'Member Timeout Removed',
        description:
          `**Member:** ${user.tag} (${user.id})\n` +
          `**Moderator:** ${interaction.user.tag}\n` +
          `**Reason:** Timeout removed by moderator`,
      });

      await interaction.editReply(
        `Successfully removed the timeout from **${user.tag}**.`
      );
    } catch (error) {
      console.error('Error in /untimeout:', error);

      await interaction.editReply(
        'Failed to remove the timeout. Check my permissions and role hierarchy.'
      );
    }
  },
};
