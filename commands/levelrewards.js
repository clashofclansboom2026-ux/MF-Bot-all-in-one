
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
} = require('discord.js');

const rewards = require('../utils/levelRewards');

const ephemeral = (content) => ({
  content,
  flags: MessageFlags.Ephemeral,
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName('levelrewards')
    .setDescription('Configure level-up rewards and announcements')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand((sub) => sub
      .setName('add')
      .setDescription('Set a role reward for a level')
      .addIntegerOption((o) => o
        .setName('level')
        .setDescription('Required level')
        .setMinValue(1)
        .setMaxValue(10000)
        .setRequired(true))
      .addRoleOption((o) => o
        .setName('role')
        .setDescription('Role to award')
        .setRequired(true)))

    .addSubcommand((sub) => sub
      .setName('remove')
      .setDescription('Remove a reward setting')
      .addIntegerOption((o) => o
        .setName('level')
        .setDescription('Level reward to remove')
        .setMinValue(1)
        .setMaxValue(10000)
        .setRequired(true)))

    .addSubcommand((sub) => sub
      .setName('list')
      .setDescription('List configured level rewards'))

    .addSubcommand((sub) => sub
      .setName('channel')
      .setDescription('Set the level-up announcement channel')
      .addChannelOption((o) => o
        .setName('channel')
        .setDescription('Announcement text channel')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)))

    .addSubcommand((sub) => sub
      .setName('announcements')
      .setDescription('Enable or disable level-up announcements')
      .addBooleanOption((o) => o
        .setName('enabled')
        .setDescription('Whether announcements are enabled')
        .setRequired(true)))

    .addSubcommand((sub) => sub
      .setName('status')
      .setDescription('Show the current reward configuration')),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply(ephemeral('Use this command in a server.'));
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply(
        ephemeral('You need the Manage Server permission.')
      );
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const settings = rewards.getSettings(guildId);

    if (subcommand === 'add') {
      const level = interaction.options.getInteger('level', true);
      const role = interaction.options.getRole('role', true);
      const botMember = interaction.guild.members.me;

      if (role.id === interaction.guild.id || role.managed) {
        return interaction.reply(
          ephemeral('Choose a normal server role that the bot can assign.')
        );
      }

      if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply(
          ephemeral('I need the Manage Roles permission.')
        );
      }

      if (role.position >= botMember.roles.highest.position) {
        return interaction.reply(
          ephemeral('Move my bot role above the selected role in Server Settings → Roles.')
        );
      }

      rewards.setReward(guildId, level, role.id);

      return interaction.reply(ephemeral(
        `Configured ${role} for **Level ${level}**. This applies to future level-ups only. Members who already passed that level will not receive the role automatically.`
      ));
    }

    if (subcommand === 'remove') {
      const level = interaction.options.getInteger('level', true);

      if (!settings.rewards[String(level)]) {
        return interaction.reply(
          ephemeral(`There is no reward configured for Level ${level}.`)
        );
      }

      rewards.removeReward(guildId, level);

      return interaction.reply(ephemeral(
        `Removed the Level ${level} reward setting. Members who already earned the role will keep it.`
      ));
    }

    if (subcommand === 'list') {
      const entries = Object.entries(settings.rewards)
        .sort((a, b) => Number(a[0]) - Number(b[0]));

      if (!entries.length) {
        return interaction.reply(
          ephemeral('No rewards configured yet. Use `/levelrewards add`.')
        );
      }

      const description = entries
        .map(([level, roleId]) => `**Level ${level}:** <@&${roleId}>`)
        .join('\n');

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('Configured Level Rewards')
            .setDescription(description),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'channel') {
      const channel = interaction.options.getChannel('channel', true);
      rewards.setChannel(guildId, channel.id);

      return interaction.reply(
        ephemeral(`Level-up announcements will be sent to ${channel}.`)
      );
    }

    if (subcommand === 'announcements') {
      const enabled = interaction.options.getBoolean('enabled', true);
      rewards.setAnnouncementsEnabled(guildId, enabled);

      return interaction.reply(ephemeral(
        `Level-up announcements are now **${enabled ? 'enabled' : 'disabled'}**. XP and role rewards will continue working.`
      ));
    }

    if (subcommand === 'status') {
      const entries = Object.entries(settings.rewards)
        .sort((a, b) => Number(a[0]) - Number(b[0]));

      const description = [
        `**Reward levels:** ${entries.length ? entries.map(([level]) => level).join(', ') : 'None configured'}`,
        `**Announcement channel:** ${settings.channelId ? `<#${settings.channelId}>` : 'Not configured'}`,
        `**Announcements:** ${settings.announcementsEnabled ? 'Enabled' : 'Disabled'}`,
        '**Reward behaviour:** Cumulative; new settings apply to future level-ups only.',
      ].join('\n');

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('Level Rewards Status')
            .setDescription(description),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
