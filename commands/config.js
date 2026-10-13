
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require('discord.js');
const { getGuildConfig, setGuildConfig } = require('../utils/configStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure this server’s bot settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('logs')
        .setDescription('Set the moderation log channel')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Mention or select the channel for moderation logs')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: 'You need Manage Server permission to change bot settings.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'logs') {
      const channel = interaction.options.getChannel('channel', true);

      if (!channel.isTextBased() || channel.isDMBased()) {
        return interaction.reply({
          content: 'Please choose a server text channel.',
          flags: MessageFlags.Ephemeral,
        });
      }

      setGuildConfig(interaction.guildId, {
        modLogChannelId: channel.id,
      });

      return interaction.reply({
        content: `Moderation logs will be sent to ${channel}.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
