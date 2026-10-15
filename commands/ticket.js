
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');

const tickets = require('../utils/tickets');

function isSupportMember(interaction, settings) {
  if (
    interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageChannels
    )
  ) {
    return true;
  }

  const roleIds = new Set([
    ...(settings.staffRoleIds || []),
    ...(settings.supportRoleIds || []),
  ]);

  return [...roleIds].some((roleId) =>
    interaction.member?.roles?.cache?.has(roleId)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage the current support ticket.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Give a member access to this ticket.')
        .addUserOption((option) =>
          option
            .setName('member')
            .setDescription('Member to add.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a member from this ticket.')
        .addUserOption((option) =>
          option
            .setName('member')
            .setDescription('Member to remove.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('rename')
        .setDescription('Rename this ticket channel.')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('New channel name.')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(90)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('transfer')
        .setDescription('Assign this ticket to a support member.')
        .addUserOption((option) =>
          option
            .setName('member')
            .setDescription('Support member to assign it to.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('info')
        .setDescription('Show information about this ticket.')
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'This command can only be used inside a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const ticket = tickets.getTicket(
      interaction.guildId,
      interaction.channelId
    );

    if (!ticket) {
      return interaction.reply({
        content: 'This command must be used inside a registered ticket channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const settings = tickets.getSettings(interaction.guildId);
    const action = interaction.options.getSubcommand();
    const isSupport = isSupportMember(interaction, settings);

    if (ticket.status !== 'open' && action !== 'info') {
      return interaction.reply({
        content: 'This ticket is closed. Management commands are unavailable.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === 'info') {
      const owner = await interaction.guild.members
        .fetch(ticket.userId)
        .catch(() => null);

      const claimant = ticket.claimedBy
        ? `<@${ticket.claimedBy}>`
        : 'Unassigned';

      return interaction.reply({
        content: [
          `**Ticket:** ${interaction.channel}`,
          `**Number:** ${ticket.ticketNumber ?? 'Unknown'}`,
          `**Owner:** ${owner ? `${owner}` : `<@${ticket.userId}>`}`,
          `**Status:** ${ticket.status}`,
          `**Claimed by:** ${claimant}`,
          `**Opened:** <t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:F>`,
        ].join('\n'),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    }

    if (!isSupport) {
      return interaction.reply({
        content: 'Only configured support staff can use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === 'add' || action === 'remove') {
      const user = interaction.options.getUser('member', true);
      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (!member) {
        return interaction.reply({
          content: 'That member is not in this server.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (action === 'remove' && user.id === ticket.userId) {
        return interaction.reply({
          content: 'You cannot remove the ticket owner.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (action === 'add') {
        await interaction.channel.permissionOverwrites.edit(user.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true,
        });

        return interaction.reply({
          content: `Added ${user} to this ticket.`,
          allowedMentions: { users: [] },
        });
      }

      await interaction.channel.permissionOverwrites.delete(user.id)
        .catch(async () => {
          await interaction.channel.permissionOverwrites.edit(user.id, {
            ViewChannel: false,
            SendMessages: false,
            ReadMessageHistory: false,
          });
        });

      return interaction.reply({
        content: `Removed ${user} from this ticket.`,
        allowedMentions: { users: [] },
      });
    }

    if (action === 'rename') {
      const rawName = interaction.options.getString('name', true);
      const name = rawName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 100);

      if (!name) {
        return interaction.reply({
          content: 'Enter a valid channel name using letters, numbers, or hyphens.',
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.channel.setName(name);

      return interaction.reply({
        content: `Ticket renamed to **${name}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === 'transfer') {
      const user = interaction.options.getUser('member', true);
      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (!member) {
        return interaction.reply({
          content: 'That support member is not in this server.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const hasSupportRole = [
        ...(settings.staffRoleIds || []),
        ...(settings.supportRoleIds || []),
      ].some((roleId) => member.roles.cache.has(roleId));

      if (
        !hasSupportRole &&
        !member.permissions.has(PermissionFlagsBits.ManageChannels)
      ) {
        return interaction.reply({
          content: 'The selected member does not have a configured support/staff role or Manage Channels permission.',
          flags: MessageFlags.Ephemeral,
        });
      }

      tickets.updateTicket(interaction.guildId, interaction.channelId, {
        claimedBy: user.id,
      });

      await interaction.channel.send({
        content: `Ticket assigned to <@${user.id}> by <@${interaction.user.id}>.`,
        allowedMentions: { users: [user.id] },
      });

      return interaction.reply({
        content: `Ticket transferred to ${user}.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { users: [] },
      });
    }
  },
};
