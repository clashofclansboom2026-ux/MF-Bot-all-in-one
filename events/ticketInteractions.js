
const {
  Events,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');

const tickets = require('../utils/tickets');

const QUESTIONS = [
  {
    id: 'question_1',
    label: 'What do you need help with?',
    required: true,
  },
  {
    id: 'question_2',
    label: 'Please provide more details',
    required: true,
  },
  {
    id: 'question_3',
    label: 'Have you tried anything already?',
    required: false,
  },
  {
    id: 'question_4',
    label: 'How urgent is this?',
    required: false,
  },
  {
    id: 'question_5',
    label: 'Anything else we should know?',
    required: false,
  },
];

function buildQuestionnaire() {
  const modal = new ModalBuilder()
    .setCustomId('ticket:create:submit')
    .setTitle('Open a Support Ticket');

  for (const question of QUESTIONS) {
    const input = new TextInputBuilder()
      .setCustomId(question.id)
      .setLabel(question.label)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(question.required)
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(input)
    );
  }

  return modal;
}

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    // Step 1: Show the form when the ticket panel button is clicked.
    if (
      interaction.isButton() &&
      interaction.customId === 'ticket:create'
    ) {
      if (!interaction.inGuild()) {
        return interaction.reply({
          content: 'Tickets can only be opened inside a server.',
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.showModal(buildQuestionnaire());
    }

    // Step 2: Create the ticket after the questionnaire is submitted.
    if (
      !interaction.isModalSubmit() ||
      interaction.customId !== 'ticket:create:submit'
    ) {
      return;
    }

    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'Tickets can only be opened inside a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const answers = QUESTIONS.map((question) => ({
      question: question.label,
      answer: interaction.fields
        .getTextInputValue(question.id)
        .trim(),
    })).filter((item) => item.answer);

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
          content: 'The configured ticket category could not be found. Ask an administrator to configure it again.',
        });
      }

      const botMember = guild.members.me ||
        await guild.members.fetchMe();

      if (
        !botMember.permissions.has(PermissionFlagsBits.ViewChannel) ||
        !botMember.permissions.has(PermissionFlagsBits.ManageChannels)
      ) {
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
        answers,
      });

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`Ticket #${paddedNumber}`)
        .setDescription(
          `Hello ${interaction.user}, your ticket has been created. A member of the support team will respond when available.`
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
          },
          ...answers.map((item) => ({
            name: item.question,
            value: item.answer.slice(0, 1024),
            inline: false,
          }))
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
        content: roleMentions ||
          `Support has been requested by ${interaction.user}.`,
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
        await ticketChannel.delete('Ticket creation failed')
          .catch(() => {});
      }

      return interaction.editReply({
        content: 'I could not create your ticket. Please try again or contact a server administrator.',
      }).catch(() => {});
    }
  },
};
