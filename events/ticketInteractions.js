
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
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
} = require('discord.js');

const tickets = require('../utils/tickets');

function dashboardEmbed(guild, settings) {
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('Ticket System Dashboard')
    .setDescription(
      'Select a section below to configure your ticket system.'
    )
    .addFields(
      {
        name: 'Ticket Category',
        value: settings.categoryId ? `<#${settings.categoryId}>` : 'Not configured',
        inline: true,
      },
      {
        name: 'Logs & Transcripts',
        value: settings.logChannelId ? `<#${settings.logChannelId}>` : 'Not configured',
        inline: true,
      },
      {
        name: 'Maximum Open Tickets',
        value: String(settings.maxOpenPerUser ?? 3),
        inline: true,
      },
      {
        name: 'Staff Roles',
        value: settings.staffRoleIds?.length
          ? settings.staffRoleIds.map(id => `<@&${id}>`).join(', ')
          : 'Not configured',
      },
      {
        name: 'Support Roles',
        value: settings.supportRoleIds?.length
          ? settings.supportRoleIds.map(id => `<@&${id}>`).join(', ')
          : 'Not configured',
      }
    )
    .setFooter({ text: `${guild.name} • Ticket Configuration` })
    .setTimestamp();
}

function dashboardMenu() {
  const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } =
    require('discord.js');

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticketsetup:section')
      .setPlaceholder('Choose a settings section')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('General Settings')
          .setDescription('Ticket category and open-ticket limit')
          .setValue('general'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Staff & Support')
          .setDescription('Configure ticket access roles')
          .setValue('staff'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Logs & Transcripts')
          .setDescription('Choose the transcript destination')
          .setValue('logs'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Ticket Panel')
          .setDescription('How to publish your member-facing panel')
          .setValue('panel')
      )
  );
}

function dashboardButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticketsetup:refresh')
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary)
  );
}

function sectionEmbed(section) {
  const descriptions = {
    general: 'Choose the category where private tickets are created, or change the maximum number of open tickets per member.',
    staff: 'Choose staff or support roles. Members with these roles will be able to view and respond to tickets.',
    logs: 'Choose the text channel where ticket transcripts will be sent when a ticket is closed.',
    panel: 'To publish the ticket-opening panel, use `/ticketpanel` and select the channel where it should appear. Configure the ticket category first.',
  };

  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(section.charAt(0).toUpperCase() + section.slice(1) + ' Settings')
    .setDescription(descriptions[section] || 'Choose a settings section.');
}

function backButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticketsetup:back')
      .setLabel('Back to Dashboard')
      .setStyle(ButtonStyle.Secondary)
  );
}

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.ManageGuild
  );
}

/**
 * Build the ticket modal from the questions saved in the dashboard.
 */
function buildQuestionnaire(guildId) {
  const questions = tickets.getTicketQuestions(guildId);

  const modal = new ModalBuilder()
    .setCustomId('ticket:create:submit')
    .setTitle('Open a Support Ticket');

  for (const question of questions.slice(0, 5)) {
    const input = new TextInputBuilder()
      .setCustomId(question.id)
      .setLabel(question.label.slice(0, 45))
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(Boolean(question.required))
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
    // Ticket setup dashboard: open the selected section.
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === 'ticketsetup:section'
    ) {
      if (!interaction.inGuild() || !isAdmin(interaction)) {
        return interaction.reply({
          content: 'You need Manage Server permission to configure tickets.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const section = interaction.values[0];
      const settings = tickets.getSettings(interaction.guildId);
      const components = [];

      if (section === 'general') {
        components.push(
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId('ticketsetup:category')
              .setPlaceholder('Select the ticket category')
              .setChannelTypes(ChannelType.GuildCategory)
              .setMinValues(1)
              .setMaxValues(1)
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('ticketsetup:limit')
              .setLabel(`Change ticket limit (currently ${settings.maxOpenPerUser ?? 3})`)
              .setStyle(ButtonStyle.Primary)
          )
        );
      }

      if (section === 'staff') {
        components.push(
          new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
              .setCustomId('ticketsetup:staffrole')
              .setPlaceholder('Select staff roles')
              .setMinValues(0)
              .setMaxValues(5)
          ),
          new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
              .setCustomId('ticketsetup:supportrole')
              .setPlaceholder('Select support roles')
              .setMinValues(0)
              .setMaxValues(5)
          )
        );
      }

      if (section === 'logs') {
        components.push(
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId('ticketsetup:logs')
              .setPlaceholder('Select the transcript log channel')
              .setChannelTypes(
                ChannelType.GuildText,
                ChannelType.GuildAnnouncement
              )
              .setMinValues(1)
              .setMaxValues(1)
          )
        );
      }

      components.push(backButton());

      return interaction.update({
        embeds: [sectionEmbed(section)],
        components,
      });
    }

    // Return to the main dashboard.
    if (
      interaction.isButton() &&
      ['ticketsetup:back', 'ticketsetup:refresh'].includes(interaction.customId)
    ) {
      if (!interaction.inGuild() || !isAdmin(interaction)) {
        return interaction.reply({
          content: 'You need Manage Server permission to configure tickets.',
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.update({
        embeds: [
          dashboardEmbed(
            interaction.guild,
            tickets.getSettings(interaction.guildId)
          ),
        ],
        components: [dashboardMenu(), dashboardButtons()],
      });
    }

    // Select the ticket category.
    if (
      interaction.isChannelSelectMenu() &&
      interaction.customId === 'ticketsetup:category'
    ) {
      if (!interaction.inGuild() || !isAdmin(interaction)) {
        return interaction.reply({
          content: 'You need Manage Server permission to configure tickets.',
          flags: MessageFlags.Ephemeral,
        });
      }

      tickets.updateSettings(interaction.guildId, {
        categoryId: interaction.values[0],
      });

      return interaction.update({
        embeds: [
          dashboardEmbed(
            interaction.guild,
            tickets.getSettings(interaction.guildId)
          ),
        ],
        components: [dashboardMenu(), dashboardButtons()],
      });
    }

    // Select the transcript log channel.
    if (
      interaction.isChannelSelectMenu() &&
      interaction.customId === 'ticketsetup:logs'
    ) {
      if (!interaction.inGuild() || !isAdmin(interaction)) {
        return interaction.reply({
          content: 'You need Manage Server permission to configure tickets.',
          flags: MessageFlags.Ephemeral,
        });
      }

      tickets.updateSettings(interaction.guildId, {
        logChannelId: interaction.values[0],
      });

      return interaction.update({
        embeds: [
          dashboardEmbed(
            interaction.guild,
            tickets.getSettings(interaction.guildId)
          ),
        ],
        components: [dashboardMenu(), dashboardButtons()],
      });
    }

    // Set the staff roles.
    if (
      interaction.isRoleSelectMenu() &&
      interaction.customId === 'ticketsetup:staffrole'
    ) {
      if (!interaction.inGuild() || !isAdmin(interaction)) {
        return interaction.reply({
          content: 'You need Manage Server permission to configure tickets.',
          flags: MessageFlags.Ephemeral,
        });
      }

      tickets.updateSettings(interaction.guildId, {
        staffRoleIds: interaction.values,
      });

      return interaction.update({
        embeds: [
          dashboardEmbed(
            interaction.guild,
            tickets.getSettings(interaction.guildId)
          ),
        ],
        components: [dashboardMenu(), dashboardButtons()],
      });
    }

    // Set the support roles.
    if (
      interaction.isRoleSelectMenu() &&
      interaction.customId === 'ticketsetup:supportrole'
    ) {
      if (!interaction.inGuild() || !isAdmin(interaction)) {
        return interaction.reply({
          content: 'You need Manage Server permission to configure tickets.',
          flags: MessageFlags.Ephemeral,
        });
      }

      tickets.updateSettings(interaction.guildId, {
        supportRoleIds: interaction.values,
      });

      return interaction.update({
        embeds: [
          dashboardEmbed(
            interaction.guild,
            tickets.getSettings(interaction.guildId)
          ),
        ],
        components: [dashboardMenu(), dashboardButtons()],
      });
    }

    // Open the ticket limit modal.
    if (
      interaction.isButton() &&
      interaction.customId === 'ticketsetup:limit'
    ) {
      if (!interaction.inGuild() || !isAdmin(interaction)) {
        return interaction.reply({
          content: 'You need Manage Server permission to configure tickets.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('ticketsetup:limit:submit')
        .setTitle('Maximum Open Tickets');

      const input = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Maximum tickets per member (1–10)')
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(2)
        .setRequired(true)
        .setValue(
          String(tickets.getSettings(interaction.guildId).maxOpenPerUser ?? 3)
        );

      modal.addComponents(
        new ActionRowBuilder().addComponents(input)
      );

      return interaction.showModal(modal);
    }

    // Save the ticket limit.
    if (
      interaction.isModalSubmit() &&
      interaction.customId === 'ticketsetup:limit:submit'
    ) {
      if (!interaction.inGuild() || !isAdmin(interaction)) {
        return interaction.reply({
          content: 'You need Manage Server permission to configure tickets.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const amount = Number(
        interaction.fields.getTextInputValue('amount')
      );

      if (!Number.isInteger(amount) || amount < 1 || amount > 10) {
        return interaction.reply({
          content: 'Enter a whole number between 1 and 10.',
          flags: MessageFlags.Ephemeral,
        });
      }

      tickets.updateSettings(interaction.guildId, {
        maxOpenPerUser: amount,
      });

      return interaction.reply({
        content: `Maximum open tickets per member set to ${amount}. Reopen \`/ticketsetup\` to view the updated dashboard.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Open a ticket questionnaire using the saved dashboard questions.
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

      return interaction.showModal(
        buildQuestionnaire(interaction.guildId)
      );
    }

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

    // Only read fields that were actually included in this modal.
    // This allows administrators to remove questions without causing errors.
    const configuredQuestions = tickets.getTicketQuestions(
      interaction.guildId
    );

    const answers = configuredQuestions
      .filter((question) => interaction.fields.fields.has(question.id))
      .map((question) => ({
        question: question.label,
        answer: interaction.fields.fields.get(question.id).value.trim(),
      }))
      .filter((item) => item.answer);

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    let ticketChannel;

    try {
      const guild = interaction.guild;
      const settings = tickets.getSettings(guild.id);

      if (!settings.categoryId) {
        return interaction.editReply({
          content: 'The ticket category is not configured. Ask an administrator to run `/ticketsetup` and select General Settings.',
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
          content: 'The configured ticket category could not be found. Reconfigure it from `/ticketsetup`.',
        });
      }

      const botMember = guild.members.me || await guild.members.fetchMe();

      if (
        !botMember.permissions.has(PermissionFlagsBits.ViewChannel) ||
        !botMember.permissions.has(PermissionFlagsBits.ManageChannels)
      ) {
        return interaction.editReply({
          content: 'I need View Channels and Manage Channels permissions to create tickets.',
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
          `Hello ${interaction.user}, your ticket has been created. A support team member will respond when available.`
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
          ...answers.map(item => ({
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
        .filter(roleId => guild.roles.cache.has(roleId))
        .map(roleId => `<@&${roleId}>`)
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
        await ticketChannel.delete('Ticket creation failed').catch(() => {});
      }

      return interaction.editReply({
        content: 'I could not create your ticket. Please try again or contact a server administrator.',
      }).catch(() => {});
    }
  },
};
