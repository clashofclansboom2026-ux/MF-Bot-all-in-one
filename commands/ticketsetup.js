const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const tickets = require('../utils/tickets');

const SECTIONS = {
  general: 'General Settings',
  staff: 'Staff & Support',
  logs: 'Logs & Transcripts',
  panel: 'Ticket Panel',
};

function dashboardEmbed(guild, settings) {
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('Ticket System Dashboard')
    .setDescription(
      'Manage your ticket system from this dashboard.\n\n' +
      '**General Settings** — ticket category and ticket limits\n' +
      '**Staff & Support** — roles allowed to access tickets\n' +
      '**Logs & Transcripts** — where ticket transcripts are sent\n' +
      '**Ticket Panel** — create the panel members use to open tickets'
    )
    .addFields(
      {
        name: 'Ticket Category',
        value: settings.categoryId
          ? `<#${settings.categoryId}>`
          : 'Not configured',
        inline: true,
      },
      {
        name: 'Logs',
        value: settings.logChannelId
          ? `<#${settings.logChannelId}>`
          : 'Not configured',
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
        inline: false,
      },
      {
        name: 'Support Roles',
        value: settings.supportRoleIds?.length
          ? settings.supportRoleIds.map(id => `<@&${id}>`).join(', ')
          : 'Not configured',
        inline: false,
      }
    )
    .setFooter({ text: `${guild.name} • Ticket Configuration` })
    .setTimestamp();
}

function dashboardComponents() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticketsetup:section')
    .setPlaceholder('Choose a settings section')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('General Settings')
        .setDescription('Ticket category and maximum open tickets')
        .setValue('general')
        .setEmoji('⚙️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Staff & Support')
        .setDescription('Configure roles that can access tickets')
        .setValue('staff')
        .setEmoji('🛡️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Logs & Transcripts')
        .setDescription('Choose where transcripts are sent')
        .setValue('logs')
        .setEmoji('📋'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Ticket Panel')
        .setDescription('Create the public panel for members')
        .setValue('panel')
        .setEmoji('🎫')
    );

  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticketsetup:refresh')
        .setLabel('Refresh Dashboard')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
    ),
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketsetup')
    .setDescription('Open the ticket system configuration dashboard.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (
      !interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuild
      )
    ) {
      return interaction.reply({
        content: 'You need Manage Server permission to configure tickets.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const settings = tickets.getSettings(interaction.guildId);

    return interaction.reply({
      embeds: [dashboardEmbed(interaction.guild, settings)],
      components: dashboardComponents(),
      flags: MessageFlags.Ephemeral,
    });
  },

  dashboardEmbed,
  dashboardComponents,
  SECTIONS,
};
