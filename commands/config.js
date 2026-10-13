const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
} = require('discord.js');

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
            .setDescription('Channel for moderation logs')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName('antispam')
        .setDescription('Configure automatic anti-spam')
        .addIntegerOption(option =>
          option
            .setName('messages')
            .setDescription('Messages needed to trigger anti-spam (2–10)')
            .setMinValue(2)
            .setMaxValue(10)
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('window')
            .setDescription('Detection window in seconds (3–30)')
            .setMinValue(3)
            .setMaxValue(30)
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('timeout')
            .setDescription('Timeout duration in minutes (1–1440)')
            .setMinValue(1)
            .setMaxValue(1440)
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

    if (subcommand === 'antispam') {
      const messages = interaction.options.getInteger('messages', true);
      const windowSeconds = interaction.options.getInteger('window', true);
      const timeoutMinutes = interaction.options.getInteger('timeout', true);

      setGuildConfig(interaction.guildId, {
        antiSpam: {
          messages,
          windowMs: windowSeconds * 1000,
          timeoutMs: timeoutMinutes * 60 * 1000,
        },
      });

      return interaction.reply({
        content:
          '**Anti-spam settings saved for this server.**\n' +
          `Messages required: ${messages}\n` +
          `Detection window: ${windowSeconds} seconds\n` +
          `Timeout duration: ${timeoutMinutes} minute(s)\n\n` +
          'These settings take effect straight away.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
