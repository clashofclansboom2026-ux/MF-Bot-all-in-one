
// Case lookup commands: /case and /history

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { clip } = require('../utils/checks');
const { ACTIONS, hidden, getCases } = require('../utils/modCore');

const stamp = (ms) => Math.floor(ms / 1000);

const caseCommand = {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Look up a moderation case by its number')
    .addIntegerOption((option) =>
      option
        .setName('number')
        .setDescription('The case number')
        .setMinValue(1)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply(hidden('Use this in a server.'));
    }

    if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply(
        hidden('You need the Moderate Members permission to use this command.')
      );
    }

    const number = interaction.options.getInteger('number', true);
    const found = getCases(interaction.guildId).find(
      (entry) => entry.number === number
    );

    if (!found) {
      return interaction.reply(hidden(`I can't find case #${number}.`));
    }

    const action = ACTIONS[found.type] ?? {
      label: found.type || 'Unknown action',
      emoji: '📄',
      color: 0x5865f2,
    };

    const embed = new EmbedBuilder()
      .setColor(action.color)
      .setTitle(`${action.emoji} Case #${found.number} | ${action.label}`)
      .addFields(
        {
          name: 'Member',
          value: clip(found.userTag || 'Unknown member', 256),
          inline: true,
        },
        {
          name: 'Moderator',
          value: clip(found.modTag || 'Unknown moderator', 256),
          inline: true,
        },
        {
          name: 'When',
          value: `<t:${stamp(found.at)}:F>`,
          inline: true,
        },
        {
          name: 'Reason',
          value: clip(found.reason || 'No reason provided', 1024),
          inline: false,
        }
      );

    if (found.extra) {
      embed.addFields({
        name: 'Additional details',
        value: clip(found.extra, 1024),
        inline: false,
      });
    }

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  },
};

const history = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription("See a member's moderation history")
    .addUserOption((option) =>
      option
        .setName('member')
        .setDescription('Whose history to show')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply(hidden('Use this in a server.'));
    }

    if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply(
        hidden('You need the Moderate Members permission to use this command.')
      );
    }

    const user = interaction.options.getUser('member', true);
    const list = getCases(interaction.guildId).filter(
      (entry) => entry.userId === user.id
    );

    if (list.length === 0) {
      return interaction.reply(
        hidden(`**${user.tag}** has no moderation history.`)
      );
    }

    const count = (type) => list.filter((entry) => entry.type === type).length;
    const recent = list.slice(-10).reverse();

    const lines = recent.map((entry) => {
      const action = ACTIONS[entry.type] ?? {
        label: entry.type || 'Unknown action',
        emoji: '📄',
      };

      const reason = clip(entry.reason || 'No reason provided', 90);
      const moderator = clip(entry.modTag || 'Unknown moderator', 40);

      return [
        `**#${entry.number}** ${action.emoji} **${action.label}**`,
        `└ ${reason} • By ${moderator} • <t:${stamp(entry.at)}:R>`,
      ].join('\n');
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: user.tag,
        iconURL: user.displayAvatarURL(),
      })
      .setTitle(`Moderation history • ${list.length} case${list.length === 1 ? '' : 's'}`)
      .addFields(
        {
          name: '⚠️ Warnings',
          value: String(count('warn')),
          inline: true,
        },
        {
          name: '🔨 Bans',
          value: String(count('ban')),
          inline: true,
        },
        {
          name: '👢 Kicks',
          value: String(count('kick')),
          inline: true,
        },
        {
          name: '⏳ Timeouts',
          value: String(count('timeout')),
          inline: true,
        },
        {
          name: '🔊 Timeouts removed',
          value: String(count('untimeout')),
          inline: true,
        },
        {
          name: '🔓 Bans removed',
          value: String(count('unban')),
          inline: true,
        }
      )
      .setDescription(`**Recent actions**\n\n${lines.join('\n\n')}`)
      .setFooter({
        text:
          list.length > 10
            ? 'Showing the latest 10 • Use /case to view a full case'
            : 'Use /case to view a full case',
      });

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  },
};

module.exports = [caseCommand, history];
