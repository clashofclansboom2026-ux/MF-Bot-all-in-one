
const {
  SlashCommandBuilder,
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
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Create or update the ticket panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel where the ticket panel will appear.')
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Title shown on the ticket panel.')
        .setMaxLength(200)
    )
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('Instructions shown on the ticket panel.')
        .setMaxLength(3000)
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageGuild
    )) {
      return interaction.reply({
        content: 'You need Manage Server permission to create a ticket panel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const channel = interaction.options.getChannel('channel', true);
    const title =
      interaction.options.getString('title') || 'Support Tickets';
    const description =
      interaction.options.getString('description') ||
      'Need help? Open a private support ticket using the button below. Our team will respond as soon as possible.';

    const settings = tickets.getSettings(interaction.guildId);

    if (!settings.categoryId) {
      return interaction.reply({
        content: 'Configure the ticket category first using `/ticketsetup category`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const botPermissions = channel.permissionsFor(
      interaction.guild.members.me
    );

    if (
      !botPermissions?.has(PermissionFlagsBits.ViewChannel) ||
      !botPermissions.has(PermissionFlagsBits.SendMessages) ||
      !botPermissions.has(PermissionFlagsBits.EmbedLinks) ||
      !botPermissions.has(PermissionFlagsBits.ReadMessageHistory)
    ) {
      return interaction.reply({
        content: 'I need View Channel, Send Messages, Embed Links and Read Message History permissions in that channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(title)
      .setDescription(description)
      .setFooter({ text: `${interaction.guild.name} • Support Centre` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:create')
        .setLabel('Create a Ticket')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎫')
    );

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const message = await channel.send({
        embeds: [embed],
        components: [row],
      });

      tickets.updateSettings(interaction.guildId, {
        panelChannelId: channel.id,
        panelMessageId: message.id,
      });

      await interaction.editReply({
        content: `Ticket panel posted in ${channel}.\n\nMembers can now use the button. The ticket-creation handler is a separate part of the system and must be installed before tickets can actually open.`,
      });
    } catch (error) {
      console.error('Could not create ticket panel:', error);

      await interaction.editReply({
        content: 'I could not post the ticket panel. Check my channel permissions and try again.',
      });
    }
  },
};
