// Level commands: /rank and /leaderboard.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const xp = require('../utils/xp');
const { makeRankCard } = require('../utils/rankCard');

const PAGE_SIZE = 10;
const COLOUR = 0x5b8cff;

const hidden = (content) => ({
  content,
  flags: MessageFlags.Ephemeral,
});

const rank = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('View a member’s level, XP and progress')
    .addUserOption((option) =>
      option
        .setName('member')
        .setDescription('Member to view; leave empty to view yourself')
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply(hidden('Use this command in a server.'));
    }

    const user =
      interaction.options.getUser('member') || interaction.user;

    if (user.bot) {
      return interaction.reply(hidden('Bots do not earn XP.'));
    }

    await interaction.deferReply();

    const totalXp = xp.getXp(interaction.guildId, user.id);
    const progress = xp.levelFromXp(totalXp);
    const ranking = xp.ranking(interaction.guildId);

    const rankPosition =
      ranking.findIndex((entry) => entry.userId === user.id) + 1;

    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    const displayName =
      member?.displayName || user.globalName || user.username;

    const card = await makeRankCard({
      username: displayName,
      avatarUrl: user.displayAvatarURL({
        extension: 'png',
        size: 256,
      }),
      level: progress.level,
      totalXp,
      rank: rankPosition,
      into: progress.into,
      need: progress.need,
    });

    const attachment = new AttachmentBuilder(card, {
      name: 'rank-card.png',
    });

    const embed = new EmbedBuilder()
      .setColor(COLOUR)
      .setTitle(`${displayName} · Rank Profile`)
      .setDescription(
        member
          ? 'Activity, progress and standing in this server.'
          : 'This user has left the server. Their saved XP is still shown.'
      )
      .setImage('attachment://rank-card.png')
      .setFooter({
        text: 'XP is earned through eligible chat activity.',
      });

    await interaction.editReply({
      embeds: [embed],
      files: [attachment],
    });
  },
};

const leaderboard = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the server XP rankings'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply(hidden('Use this command in a server.'));
    }

    const ranking = xp.ranking(interaction.guildId);

    if (!ranking.length) {
      const empty = new EmbedBuilder()
        .setColor(COLOUR)
        .setTitle('XP Leaderboard')
        .setDescription(
          '**No rankings yet.**\nSend messages and earn XP to appear here.'
        )
        .setFooter({
          text: 'Rankings update as members earn XP.',
        });

      return interaction.reply({ embeds: [empty] });
    }

    const maxPage = Math.max(
      0,
      Math.ceil(ranking.length / PAGE_SIZE) - 1
    );

    let page = 0;

    const makePayload = async () => {
      const slice = ranking.slice(
        page * PAGE_SIZE,
        (page + 1) * PAGE_SIZE
      );

      const rows = await Promise.all(
        slice.map(async (entry, index) => {
          const position = page * PAGE_SIZE + index + 1;

          const member = await interaction.guild.members
            .fetch(entry.userId)
            .catch(() => null);

          const user =
            member?.user ||
            (await interaction.client.users
              .fetch(entry.userId)
              .catch(() => null));

          const name = member?.displayName
            ? member.displayName
            : user
              ? `${user.username} (left server)`
              : 'Unknown member';

          const level = xp.levelFromXp(entry.xp).level;

          const place =
            position === 1
              ? '🥇'
              : position === 2
                ? '🥈'
                : position === 3
                  ? '🥉'
                  : `**${String(position).padStart(2, '0')}**`;

          const displayName =
            position <= 3 ? `**${name}**` : name;

          return (
            `${place}  ${displayName}\n` +
            `　 Level **${level}**  ·  **${entry.xp.toLocaleString()} XP**`
          );
        })
      );

      const embed = new EmbedBuilder()
        .setColor(COLOUR)
        .setTitle('Server XP Leaderboard')
        .setDescription(
          `*The most active members in this server*\n\n${rows.join('\n\n')}`
        )
        .addFields(
          {
            name: 'Tracked members',
            value: String(ranking.length),
            inline: true,
          },
          {
            name: 'Page',
            value: `${page + 1} / ${maxPage + 1}`,
            inline: true,
          }
        )
        .setFooter({
          text: 'Saved XP remains listed when a member leaves.',
        });

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`levels_previous_${interaction.id}`)
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),

        new ButtonBuilder()
          .setCustomId(`levels_next_${interaction.id}`)
          .setLabel('Next')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page >= maxPage)
      );

      return {
        embeds: [embed],
        components: maxPage > 0 ? [buttons] : [],
      };
    };

    await interaction.reply(await makePayload());

    if (maxPage === 0) return;

    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      time: 120_000,
    });

    collector.on('collect', async (buttonInteraction) => {
      if (buttonInteraction.user.id !== interaction.user.id) {
        return buttonInteraction.reply({
          content:
            'Only the person who opened this leaderboard can change its page.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (
        buttonInteraction.customId ===
        `levels_previous_${interaction.id}`
      ) {
        page = Math.max(0, page - 1);
      } else if (
        buttonInteraction.customId ===
        `levels_next_${interaction.id}`
      ) {
        page = Math.min(maxPage, page + 1);
      } else {
        return;
      }

      await buttonInteraction.update(await makePayload());
    });

    collector.on('end', async () => {
      try {
        const disabledButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`levels_previous_${interaction.id}`)
            .setLabel('Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),

          new ButtonBuilder()
            .setCustomId(`levels_next_${interaction.id}`)
            .setLabel('Next')
