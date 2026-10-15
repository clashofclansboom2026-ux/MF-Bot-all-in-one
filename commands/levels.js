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
const { makeLeaderboardCard } = require('../utils/leaderboardCard');

const PAGE_SIZE = 10;
const COLOUR = 0x168cff;

function privateReply(content) {
  return {
    content,
    flags: MessageFlags.Ephemeral,
  };
}

const rankCommand = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('View a member level, XP and progress')
    .addUserOption((option) =>
      option
        .setName('member')
        .setDescription('Member to view; leave empty to view yourself')
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply(
        privateReply('Use this command in a server.')
      );
    }

    const user =
      interaction.options.getUser('member') || interaction.user;

    if (user.bot) {
      return interaction.reply(
        privateReply('Bots do not earn XP.')
      );
    }

    await interaction.deferReply();

    const totalXp = xp.getXp(interaction.guildId, user.id);
    const progress = xp.levelFromXp(totalXp);
    const ranking = xp.ranking(interaction.guildId);

    const rankIndex = ranking.findIndex(
      (entry) => entry.userId === user.id
    );

    const rankPosition = rankIndex === -1 ? 0 : rankIndex + 1;

    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    const displayName =
      member?.displayName ||
      user.globalName ||
      user.username;

    const imageBuffer = await makeRankCard({
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

    const attachment = new AttachmentBuilder(imageBuffer, {
      name: 'rank-card.png',
    });

    const embed = new EmbedBuilder()
      .setColor(COLOUR)
      .setTitle(displayName + ' | Rank Profile')
      .setDescription(
        member
          ? 'Level, XP and progress for this server.'
          : 'This user has left the server. Their saved XP is still shown.'
      )
      .setImage('attachment://rank-card.png')
      .setFooter({
        text: 'XP is earned through eligible chat activity.',
      });

    return interaction.editReply({
      embeds: [embed],
      files: [attachment],
    });
  },
};

const leaderboardCommand = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the server XP rankings'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply(
        privateReply('Use this command in a server.')
      );
    }

    const ranking = xp.ranking(interaction.guildId);

    if (ranking.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(COLOUR)
        .setTitle('SERVER XP LEADERBOARD')
        .setDescription(
          'No rankings yet. Send messages and earn XP to appear here.'
        )
        .setFooter({
          text: 'Rankings update as members earn XP.',
        });

      return interaction.reply({
        embeds: [emptyEmbed],
      });
    }

    const pageCount = Math.ceil(ranking.length / PAGE_SIZE);
    let currentPage = 0;

    async function buildLeaderboardPayload() {
      const start = currentPage * PAGE_SIZE;
      const pageEntries = ranking.slice(
        start,
        start + PAGE_SIZE
      );

      const entries = await Promise.all(
        pageEntries.map(async (entry) => {
          const member = await interaction.guild.members
            .fetch(entry.userId)
            .catch(() => null);

          const user = member
            ? member.user
            : await interaction.client.users
                .fetch(entry.userId)
                .catch(() => null);

          return {
            name:
              member?.displayName ||
              user?.globalName ||
              user?.username ||
              'Unknown member',

            avatarUrl: user
              ? user.displayAvatarURL({
                  extension: 'png',
                  size: 128,
                })
              : null,

            level: xp.levelFromXp(
              Number(entry.xp || 0)
            ).level,

            xp: Number(entry.xp || 0),
          };
        })
      );

      const imageBuffer = await makeLeaderboardCard({
        entries,
        page: currentPage,
        pageCount,
        totalMembers: ranking.length,
      });

      const attachment = new AttachmentBuilder(
        imageBuffer,
        {
          name: 'leaderboard.png',
        }
      );

      const embed = new EmbedBuilder()
        .setColor(COLOUR)
        .setTitle('SERVER XP LEADERBOARD')
        .setImage('attachment://leaderboard.png')
        .setFooter({
          text: 'Members who leave remain listed if they have saved XP.',
        });

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            'levels_previous_' + interaction.id
          )
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === 0),

        new ButtonBuilder()
          .setCustomId(
            'levels_next_' + interaction.id
          )
          .setLabel('Next')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage >= pageCount - 1)
      );

      return {
        embeds: [embed],
        files: [attachment],
        attachments: [],
        components: pageCount > 1 ? [buttons] : [],
      };
    }

    await interaction.reply(
      await buildLeaderboardPayload()
    );

    if (pageCount <= 1) return;

    const replyMessage = await interaction.fetchReply();

    const collector =
      replyMessage.createMessageComponentCollector({
        time: 120000,
      });

    collector.on('collect', async (buttonInteraction) => {
      if (
        buttonInteraction.user.id !== interaction.user.id
      ) {
        return buttonInteraction.reply({
          content:
            'Only the person who opened this leaderboard can change pages.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (
        buttonInteraction.customId ===
        'levels_previous_' + interaction.id
      ) {
        currentPage = Math.max(0, currentPage - 1);
      } else if (
        buttonInteraction.customId ===
        'levels_next_' + interaction.id
      ) {
        currentPage = Math.min(
          pageCount - 1,
          currentPage + 1
        );
      } else {
        return;
      }

      return buttonInteraction.update(
        await buildLeaderboardPayload()
      );
    });

    collector.on('end', async () => {
      try {
        const disabledButtons =
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                'levels_previous_' + interaction.id
              )
              .setLabel('Previous')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),

            new ButtonBuilder()
              .setCustomId(
                'levels_next_' + interaction.id
              )
              .setLabel('Next')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true)
          );

        await replyMessage.edit({
          components: [disabledButtons],
        });
      } catch (error) {
        // The reply may have been deleted.
      }
    });
  },
};

module.exports = [rankCommand, leaderboardCommand];
