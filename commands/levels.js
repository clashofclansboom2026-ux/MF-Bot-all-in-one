// Level commands: /rank and /leaderboard

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const xp = require('../utils/xp');

const hidden = (content) => ({ content, flags: MessageFlags.Ephemeral });

const rank = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('See your level and XP')
    .addUserOption((o) =>
      o.setName('member').setDescription('Whose rank to show (leave empty for yourself)')
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));

    const user = interaction.options.getUser('member') ?? interaction.user;
    if (user.bot) return interaction.reply(hidden('Bots do not earn XP.'));

    const total = xp.getXp(interaction.guildId, user.id);
    const { level, into, need } = xp.levelFromXp(total);
    const position = xp.ranking(interaction.guildId).findIndex((r) => r.userId === user.id) + 1;

    const filled = Math.round((into / need) * 10);
    const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(user.tag)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'Level', value: String(level), inline: true },
        { name: 'Rank', value: position ? `#${position}` : 'Not ranked yet', inline: true },
        { name: 'Total XP', value: String(total), inline: true },
        { name: `Progress to level ${level + 1}`, value: `${bar}  ${into} / ${need} XP` }
      );

    await interaction.reply({ embeds: [embed] });
  },
};

const leaderboard = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('See the top 10 chatters in this server'),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));

    const top = xp.ranking(interaction.guildId).slice(0, 10);
    if (top.length === 0) {
      return interaction.reply(hidden('Nobody has any XP yet. Start chatting!'));
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = top.map(
      (r, i) =>
        `${medals[i] ?? `**${i + 1}.**`} <@${r.userId}> - level ${xp.levelFromXp(r.xp).level} (${r.xp} XP)`
    );

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🏆 Leaderboard')
      .setDescription(lines.join('\n'));

    await interaction.reply({ embeds: [embed] });
  },
};

module.exports = [rank, leaderboard];
