const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  hidden,
  defer,
  parseDuration,
  formatDuration,
  notifyUser,
  recordAction,
} = require('../utils/modCore');

const MIN_MS = 5 * 1000; // 5 seconds
const MAX_MS = 28 * 24 * 60 * 60 * 1000; // 28 days (Discord's limit)

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Temporarily mute a member')
    .addUserOption((o) =>
      o.setName('member').setDescription('The member to timeout').setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName('duration')
        .setDescription('How long? Examples: 30m, 2h, 1d, 1h30m (max 28d)')
        .setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for the timeout').setMaxLength(500)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply(hidden('You need the Moderate Members permission to use this command.'));
    }

    const user = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const ms = parseDuration(interaction.options.getString('duration', true));

    if (ms === null) {
      return interaction.reply(hidden("I don't understand that time. Try 30m, 2h, 1d or 1h30m."));
    }
    if (ms < MIN_MS) return interaction.reply(hidden('Pick at least 5 seconds.'));
    if (ms > MAX_MS) return interaction.reply(hidden('Discord only allows timeouts up to 28 days.'));

    await defer(interaction);

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return interaction.editReply('That person is not in this server, so I cannot time them out.');
    }
    if (!member.moderatable) {
      return interaction.editReply(
        'I cannot timeout that member. Check my permissions and role hierarchy.'
      );
    }

    const length = formatDuration(ms);

    try {
      await member.timeout(ms, `${reason} | Moderator: ${interaction.user.tag}`);
    } catch (error) {
      console.error('Error in /timeout:', error);
      return interaction.editReply(
        'Failed to timeout that member. Check my permissions and role hierarchy.'
      );
    }

    const dmSent = await notifyUser(interaction.guild, user, 'timeout', reason, [
      `**Duration:** ${length}`,
    ]);

    await recordAction(interaction, {
      type: 'timeout',
      user,
      reason,
      dmSent,
      fields: [{ name: 'Duration', value: length }],
    });
  },
};
