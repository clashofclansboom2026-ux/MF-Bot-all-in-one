const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
} = require('discord.js');

const rewards = require('../utils/levelRewards');

const BLUE = 0x5b8cff;
const RED = 0xe05a67;
const EPHEMERAL = MessageFlags.Ephemeral;

function makeEmbed(title, description, success = true) {
  return new EmbedBuilder()
    .setColor(success ? BLUE : RED)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Level System • Administration' });
}

function sortedRewards(settings) {
  return Object.entries(settings.rewards)
    .sort((a, b) => Number(a[0]) - Number(b[0]));
}

function makeRewardsEmbed(settings) {
  const entries = sortedRewards(settings);

  const embed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle('Level Rewards')
    .setDescription(
      entries.length
        ? entries.map(([level, roleId], index) =>
            `**${String(index + 1).padStart(2, '0')}**  ·  **Level ${level}**\n` +
            `　　 <@&${roleId}>`
          ).join('\n\n')
        : 'No rewards configured yet.\n\nUse `/levelrewards add` to set your first role reward.'
    )
    .addFields({
      name: 'Configured rewards',
      value: String(entries.length),
      inline: true,
    })
    .setFooter({
      text: 'New rewards apply to future level-ups only.',
    });

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('levelrewards')
    .setDescription('Manage level rewards and announcements')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand((sub) => sub
      .setName('add')
      .setDescription('Add a role reward for a level')
      .addIntegerOption((option) => option
        .setName('level')
        .setDescription('Level required for this role')
        .setMinValue(1)
        .setMaxValue(10000)
        .setRequired(true))
      .addRoleOption((option) => option
        .setName('role')
        .setDescription('Role members will receive')
        .setRequired(true)))

    .addSubcommand((sub) => sub
      .setName('remove')
      .setDescription('Remove a reward setting')
      .addIntegerOption((option) => option
        .setName('level')
        .setDescription('Level reward to remove')
        .setMinValue(1)
        .setMaxValue(10000)
        .setRequired(true)))

    .addSubcommand((sub) => sub
      .setName('list')
      .setDescription('View all configured rewards'))

    .addSubcommand((sub) => sub
      .setName('channel')
      .setDescription('Set the level-up announcement channel')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Channel for announcements')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)))

    .addSubcommand((sub) => sub
      .setName('announcements')
      .setDescription('Enable or disable level-up announcements')
      .addBooleanOption((option) => option
        .setName('enabled')
        .setDescription('Turn announcements on or off')
        .setRequired(true)))

    .addSubcommand((sub) => sub
      .setName('status')
      .setDescription('View the current level system settings')),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        embeds: [
          makeEmbed(
            'Server Only',
            'Use this command inside a Discord server.',
            false
          ),
        ],
        flags: EPHEMERAL,
      });
    }

    if (!interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageGuild
    )) {
      return interaction.reply({
        embeds: [
          makeEmbed(
            'Permission Required',
            'You need **Manage Server** permission to manage level rewards.',
            false
          ),
        ],
        flags: EPHEMERAL,
      });
    }

    const action = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const settings = rewards.getSettings(guildId);

    if (action === 'add') {
      const level = interaction.options.getInteger('level', true);
      const role = interaction.options.getRole('role', true);
      const botMember = interaction.guild.members.me;

      if (role.id === guildId || role.managed) {
        return interaction.reply({
          embeds: [
            makeEmbed(
              'Invalid Role',
              'Choose a normal server role that can be assigned to members.',
              false
            ),
          ],
          flags: EPHEMERAL,
        });
      }

      if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({
          embeds: [
            makeEmbed(
              'Missing Permission',
              'The bot needs the **Manage Roles** permission.',
              false
            ),
          ],
          flags: EPHEMERAL,
        });
      }

      if (role.position >= botMember.roles.highest.position) {
        return interaction.reply({
          embeds: [
            makeEmbed(
              'Role Hierarchy Issue',
              'Move the bot role above the reward role in **Server Settings → Roles**.',
              false
            ),
          ],
          flags: EPHEMERAL,
        });
      }

      rewards.setReward(guildId, level, role.id);

      const embed = makeEmbed(
        'Reward Saved',
        `Members reaching **Level ${level}** can earn ${role}.`
      );

      embed.addFields(
        {
          name: 'Level',
          value: String(level),
          inline: true,
        },
        {
          name: 'Reward Role',
          value: `${role}`,
          inline: true,
        },
        {
          name: 'When It Applies',
          value: 'Future level-ups only. Existing levels are not rewarded retroactively.',
        }
      );

      return interaction.reply({
        embeds: [embed],
        flags: EPHEMERAL,
      });
    }

    if (action === 'remove') {
      const level = interaction.options.getInteger('level', true);
      const roleId = settings.rewards[String(level)];

      if (!roleId) {
        return interaction.reply({
          embeds: [
            makeEmbed(
              'Reward Not Found',
              `There is no configured reward for **Level ${level}**.`,
              false
            ),
          ],
          flags: EPHEMERAL,
        });
      }

      rewards.removeReward(guildId, level);

      return interaction.reply({
        embeds: [
          makeEmbed(
            'Reward Removed',
            `The reward for **Level ${level}** (<@&${roleId}>) has been removed from the configuration.\n\nMembers who already earned the role **keep it**.`
          ),
        ],
        flags: EPHEMERAL,
      });
    }

    if (action === 'list') {
      return interaction.reply({
        embeds: [makeRewardsEmbed(settings)],
        flags: EPHEMERAL,
      });
    }

    if (action === 'channel') {
      const channel = interaction.options.getChannel('channel', true);

      rewards.setChannel(guildId, channel.id);

      return interaction.reply({
        embeds: [
          makeEmbed(
            'Announcement Channel Updated',
            `Level-up announcements will be sent to ${channel}.`
          ),
        ],
        flags: EPHEMERAL,
      });
    }

    if (action === 'announcements') {
      const enabled = interaction.options.getBoolean('enabled', true);

      rewards.setAnnouncementsEnabled(guildId, enabled);

      return interaction.reply({
        embeds: [
          makeEmbed(
            enabled ? 'Announcements Enabled' : 'Announcements Disabled',
            enabled
              ? 'Level-up announcements are now on. XP and role rewards continue working.'
              : 'Level-up announcements are now off. **XP and role rewards will continue working.**'
          ),
        ],
        flags: EPHEMERAL,
      });
    }

    if (action === 'status') {
      const entries = sortedRewards(settings);

      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('Level System Overview')
        .setDescription('Current settings for this server.')
        .addFields(
          {
            name: 'Configured Rewards',
            value: String(entries.length),
            inline: true,
          },
          {
            name: 'Announcements',
            value: settings.announcementsEnabled ? 'Enabled' : 'Disabled',
            inline: true,
          },
          {
            name: 'Announcement Channel',
            value: settings.channelId
              ? `<#${settings.channelId}>`
              : 'Not set — uses the message channel',
            inline: false,
          },
          {
            name: 'Reward Rules',
            value: 'Rewards apply to future level-ups. Previously earned roles are kept when a reward is removed.',
            inline: false,
          }
        )
        .setFooter({
          text: 'XP formula and earning cooldown remain unchanged.',
        });

      if (entries.length) {
        const rewardList = entries
          .map(([level, roleId]) => `**Level ${level}** → <@&${roleId}>`)
          .join('\n')
          .slice(0, 1024);

        embed.addFields({
          name: 'Reward Levels',
          value: rewardList,
        });
      }

      return interaction.reply({
        embeds: [embed],
        flags: EPHEMERAL,
      });
    }
  },
};
