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

const rank = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('View a member’s level, XP and progress')
    .addUserOption(option =>
      option
        .setName('member')
        .setDescription('Member to view; leave empty to view yourself')
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'Use this command inside a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const user =
      interaction.options.getUser('member') || interaction.user;

    if (user.bot) {
      return interaction.reply({
        content: 'Bots do not earn XP.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    const totalXp = xp.getXp(interaction.guildId, user.id);
    const progress = xp.levelFromXp(totalXp);
    const ranking = xp.ranking(interaction.guildId);

    const rankPosition =
      ranking.findIndex(entry => entry.userId === user.id) + 1;

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
      .setTitle(`${displayName} | Rank Profile`)
      .setDescription(
        member
          ? 'Activity and progress in this server.'
          : 'This user has left the server. Their saved XP is shown.'
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
      return interaction.reply({
        content: 'Use this command inside a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const ranking = xp.ranking(interaction.guildId);

    if (!ranking.length) {
      const embed = new EmbedBuilder()
        .setColor(COLOUR)
        .setTitle('SERVER LEADERBOARD')
        .setDescription(
          '
