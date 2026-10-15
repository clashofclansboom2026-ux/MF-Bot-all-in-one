const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { hidden, confirm, notifyUser, recordAction } = require('../utils/modCore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption((o) =>
      o.setName('member').setDescription('The member to ban').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for the ban').setMaxLength(500)
    )
    .addIntegerOption((o) =>
      o
        .setName('delete_days')
        .setDescription('Days of recent messages to delete (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));
    if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply(hidden('You need the Ban Members permission to use this command.'));
    }

    const user = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

    // The person may have already left the server. That is fine for a ban.
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member && !member.bannable) {
      return interaction.reply(
        hidden('I cannot ban that member. Check my permissions and role hierarchy.')
      );
    }

    const sure = await confirm(
      interaction,
      `⚠️ Ban **${user.tag}**?\n**Reason:** ${reason}\n**Message history deleted:** ${deleteDays} day(s)`
    );
    if (!sure) return;

    // Message them first. Once they are banned, I can no longer reach them.
    const dmSent = member ? await notifyUser(interaction.guild, user, 'ban', reason) : undefined;

    try {
      await interaction.guild.members.ban(user.id, {
        reason: `${reason} | Moderator: ${interaction.user.tag}`,
        deleteMessageSeconds: deleteDays * 24 * 60 * 60,
      });
    } catch (error) {
      console.error('Error in /ban:', error);
      return interaction.editReply(
        'Failed to ban that user. Check my permissions and role hierarchy.'
      );
    }

    await recordAction(interaction, {
      type: 'ban',
      user,
      reason,
      dmSent,
      fields: [{ name: 'Messages deleted', value: `${deleteDays} day(s)` }],
    });
  },
};
