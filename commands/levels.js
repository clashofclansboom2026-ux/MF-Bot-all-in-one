
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const xp = require('../utils/xp');

const hidden = (content) => ({
  content,
  flags: MessageFlags.Ephemeral,
});

const PAGE_SIZE = 10;
const colour = 0x5865f2;

function progressBar(into, need, size = 12) {
  const filled = Math.max(
    0,
    Math.min(size, Math.round((into / need) * size))
  );

  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

const rank = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('See your level and XP')
    .addUserOption((o) =>
      o.setName('member')
        .setDescription('Whose rank to show')
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply(hidden('Use this in a server.'));
    }

    const user =
      interaction.options.getUser('member') ?? interaction.user;

    if (user.bot) {
      return interaction.reply(hidden('Bots do not earn XP.'));
    }

    const total = xp.getXp(interaction.guildId, user.id);
    const { level, into, need } = xp.levelFromXp(total);

    const position =
      xp.ranking(interaction.guildId)
        .findIndex((entry) => entry.userId === user.id) + 1;

    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    const remaining = Math.max(0, need - into);

    const embed = new EmbedBuilder()
      .setColor(colour)
      .setTitle(`${member?.displayName ?? user.globalName ?? user.username}'s Rank`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Level', value: String(level), inline: true },
        {
          name: 'Server Rank',
          value: position ? `#${position}` : 'Not ranked yet',
          inline: true,
        },
        {
          name: 'Total XP',
          value: total.toLocaleString(),
          inline: true,
        },
        {
          name: `Progress to Level ${level + 1}`,
          value: `${progressBar(into, need)}  ${into.toLocaleString()} / ${need.toLocaleString()} XP\n**${remaining.toLocaleString()} XP remaining**`,
        }
      );

    if (!member) {
      embed.setFooter({
        text: 'This user is not currently a member of this server.',
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};

const leaderboard = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('See the server XP leaderboard'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply(hidden('Use this in a server.'));
    }

    const ranking = xp.ranking(interaction.guildId);

    if (!ranking.length) {
      return interaction.reply(
        hidden('Nobody has any XP yet. Start chatting!')
      );
    }

    const maxPage = Math.max(
      0,
      Math.ceil(ranking.length / PAGE_SIZE) - 1
    );

    let page = 0;

    const makePayload = async () => {
      const entries = ranking.slice(
        page * PAGE_SIZE,
        (page + 1) * PAGE_SIZE
      );

      const lines = await Promise.all(entries.map(async (entry, index) => {
        const position = page * PAGE_SIZE + index + 1;

        const member = await interaction.guild.members
          .fetch(entry.userId)
          .catch(() => null);

        const user = member?.user ||
          await interaction.client.users.fetch(entry.userId).catch(() => null);

        const label = member
          ? member.displayName
          : user
            ? `${user.username} (left server)`
            : `Unknown member (${entry.userId})`;

        const level = xp.levelFromXp(entry.xp).level;

        const prefix = position === 1
          ? '🥇'
          : position === 2
            ? '🥈'
            : position === 3
              ? '🥉'
              : `**${position}.**`;

        return `${prefix} ${label} — Level **${level}** · ${entry.xp.toLocaleString()} XP`;
      }));

      const embed = new EmbedBuilder()
        .setColor(colour)
        .setTitle('🏆 XP Leaderboard')
        .setDescription(lines.join('\n'))
        .setFooter({
          text: `Page ${page + 1} of ${maxPage + 1} · ${ranking.length} tracked members`,
        });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('levels_previous')
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),

        new ButtonBuilder()
          .setCustomId('levels_next')
          .setLabel('Next')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page >= maxPage)
      );

      return {
        embeds: [embed],
        components: maxPage > 0 ? [row] : [],
      };
    };

    await interaction.reply({
      ...(await makePayload()),
      fetchReply: true,
    });

    if (maxPage === 0) return;

    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      time: 120_000,
    });

    collector.on('collect', async (buttonInteraction) => {
      if (
        !['levels_previous', 'levels_next']
          .includes(buttonInteraction.customId)
      ) return;

      page = buttonInteraction.customId === 'levels_previous'
        ? Math.max(0, page - 1)
        : Math.min(maxPage, page + 1);

      await buttonInteraction.update(await makePayload());
    });

    collector.on('end', async () => {
      try {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('levels_previous')
            .setLabel('Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),

          new ButtonBuilder()
            .setCustomId('levels_next')
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
        );

        await message.edit({ components: [row] });
      } catch {}
    });
  },
};

module.exports = [rank, leaderboard];
