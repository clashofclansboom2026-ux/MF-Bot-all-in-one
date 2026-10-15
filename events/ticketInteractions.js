
const {
  Events,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const tickets = require('../utils/tickets');

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'ticket:create') return;
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'Tickets can only be opened inside a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    let ticketChannel;

    try {
      const guild = interaction.guild;
      const settings = tickets.getSettings(guild.id);

      if (!settings.categoryId) {
        return interaction.editReply({
          content: 'The ticket category is not configured. Ask a server administrator to run `/ticketsetup category`.',
        });
      }

      const maxOpen = Number(settings.maxOpenPerUser) || 3;
      const openCount = tickets.getOpenTicketCount(
        guild.id,
        interaction.user.id
      );

      if (openCount >= maxOpen) {
        return interaction.editReply({
          content: `You already have ${openCount} open ticket(s). The limit is ${maxOpen}. Close an existing ticket before opening another.`,
        });
      }

      const category = await guild.channels.fetch(settings.categoryId);

      if (!category || category.type !== ChannelType.GuildCategory) {
        return interaction.editReply({
          content: 'The configured ticket category could not be found. Ask a server administrator to configure it again.',
        });
      }

      const botMember = guild.members.me || await guild.members.fetchMe();

      const requiredPermissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ManageChannels,
      ];

      const missingPermissions = requiredPermissions.filter(
        (permission) => !botMember.permissions.has(permission)
      );

      if (missingPermissions.length > 0) {
        return interaction.editReply({
          content: 'I need the View Channels and Manage Channels server permissions to create tickets.',
        });
      }

      const ticketNumber = (Number(settings.ticketCounter) || 0) + 1;
      const paddedNumber = String(ticketNumber).padStart(4, '0');

      const permissionOverwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
        {
          id: botMember.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
      ];

      const roleIds = new Set([
        ...(settings.staffRoleIds || []),
        ...(settings.supportRoleIds || []),
      ]);

      for (const roleId of roleIds) {
        const role = await guild.roles.fetch(roleId).catch(() => null);

        if (!role) continue;

        permissionOverwrites.push({
          id: role.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        });
      }

      const safeUsername = interaction.user.username
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 20) || 'user';

      ticketChannel = await guild.channels.create({
        name: `ticket-${paddedNumber}-${safeUsername}`.slice(0, 100),
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Ticket ${paddedNumber} | Owner: ${interaction.user.id}`,
        permissionOverwrites,
        reason: `Ticket opened by ${interaction.user.tag}`,
      });

      tickets.updateSettings(guild.id, {
        ticketCounter: ticketNumber,
      });

      tickets.createTicket(guild.id, {
        id: ticketChannel.id,
        channelId: ticketChannel.id,
        ticketNumber,
        userId: interaction.user.id,
        username: interaction.user.username,
        status: 'open',
        createdAt: new Date().toISOString(),
        categoryId: category.id,
        claimedBy: null,
        closedAt: null,
        closedBy: null,
      });

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`Ticket #${paddedNumber}`)
        .setDescription(
          `Hello ${interaction.user}, your ticket has been created.\n\n` +
          'Please describe your issue in detail. A member of the support team will respond when available.'
        )
        .addFields(
          {
            name: 'Opened by',
            value: `${interaction.user}`,
            inline: true,
          },
          {
            name: 'Status',
            value: 'Open',
            inline: true,
          }
        )
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:close')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒')
      );

      const roleMentions = [...roleIds]
        .filter((roleId) => guild.roles.cache.has(roleId))
        .map((roleId) => `<@&${roleId}>`)
        .join(' ');

      await ticketChannel.send({
        content: roleMentions || `Support has been requested by ${interaction.user}.`,
        embeds: [embed],
        components: [row],
        allowedMentions: {
          users: [interaction.user.id],
          roles: [...roleIds],
        },
      });

      return interaction.editReply({
        content: `Your ticket has been created: ${ticketChannel}`,
      });
    } catch (error) {
      console.error('Could not create ticket:', error);

      if (ticketChannel) {
        await ticketChannel.delete('Ticket creation failed').catch(() => {});
      }

      return interaction.editReply({
        content: 'I could not create your ticket. Please try again or contact a server administrator.',
      }).catch(() => {});
    }
  },
};
