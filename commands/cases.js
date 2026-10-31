
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
      heading: 'MODERATION ACTION',
      emoji: '📄',
      color: 0x5865f2,
    };

    const memberUser = await interaction.client.users
      .fetch(found.userId)
      .catch(() => null);

    const details = [
      '🟩 **Action:** Successfully completed',
      `👤 **Member:** ${clip(found.userTag || 'Unknown member', 100)}`,
      `🛡️ **Moderator:** ${clip(found.modTag || 'Unknown moderator', 100)}`,
    ];

    if (found.extra) {
      for (const item of String(found.extra).split(' | ')) {
        const separator = item.indexOf(':');

        if (separator === -1) {
          details.push(`📌 **Details:** ${clip(item, 300)}`);
          continue;
        }

        const name = item.slice(0, separator).trim();
        const value = item.slice(separator + 1).trim();

        const emoji = name === 'Duration' ? '⏱️'
          : name === 'Messages deleted' ? '🗑️'
          : name === 'Total warnings' ? '📊'
          : name === 'Warnings removed' ? '🧹'
          : '📌';

        details.push(`${emoji} **${clip(name, 80)}:** ${clip(value, 300)}`);
      }
    }

    details.push(`📝 **Reason:** ${clip(found.reason || 'No reason provided', 900)}`);

    const embed = new EmbedBuilder()
      .setColor(action.color)
      .setAuthor({
        name: 'MF BOT • MODERATION CASE',
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTitle(`${action.emoji} ${action.heading || action.label.toUpperCase()}`)
      .setDescription(details.join('\n'))
      .setThumbnail(
        memberUser?.displayAvatarURL() ||
        interaction.client.user.displayAvatarURL()
      )
      .setFooter({ text: `CASE #${found.number} • MF Bot Moderation` })
      .setTimestamp(found.at ? new Date(found.at) : new Date());

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

      return `**#${entry.number}** ${action.emoji} **${action.label}**\n└ 📝 ${reason} • 🛡️ ${moderator} • <t:${stamp(entry.at)}:R>`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: 'MF BOT • MODERATION HISTORY',
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTitle(`📋 ${user.tag}`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        {
          name: '⚠️ Warnings',
          value: `🟨 **${count('warn')}**`,
          inline: true,
        },
        {
          name: '🔨 Bans',
          value: `🟥 **${count('ban')}**`,
          inline: true,
        },
        {
          name: '👢 Kicks',
          value: `🟧 **${count('kick')}**`,
          inline: true,
        },
        {
          name: '⏳ Timeouts',
          value: `🟨 **${count('timeout')}**`,
          inline: true,
        },
        {
          name: '🔊 Timeouts removed',
          value: `🟩 **${count('untimeout')}**`,
          inline: true,
        },
        {
          name: '🔓 Bans removed',
          value: `🟩 **${count('unban')}**`,
          inline: true,
        }
      )
      .setDescription(`**📜 Recent actions**\n\n${lines.join('\n\n')}`)
      .setFooter({
        text:
          list.length > 10
            ? `SHOWING LATEST 10 • ${list.length} TOTAL CASES • USE /CASE FOR DETAILS`
            : `${list.length} TOTAL CASE${list.length === 1 ? '' : 'S'} • USE /CASE FOR DETAILS`,
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  },
};

module.exports = [caseCommand, history];
