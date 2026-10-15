
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const quests = require('../utils/quests');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quests')
    .setDescription('View your daily and weekly quests'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'Use this command in a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const memberQuests = quests.getQuests(
      interaction.guildId,
      interaction.user.id
    );

    const description = memberQuests.map((quest) => {
      const length = 10;
      const filled = Math.max(
        0,
        Math.min(
          length,
          Math.round((quest.progress / quest.target) * length)
        )
      );

      const bar =
        '▰'.repeat(filled) + '▱'.repeat(length - filled);

      const status = quest.claimed
        ? '✅ Reward claimed'
        : quest.completed
          ? '🏆 Ready to claim'
          : '⏳ In progress';

      return [
        `**${quest.name}** (${quest.type})`,
        quest.description,
        `${bar} **${quest.progress}/${quest.target}**`,
        `Reward: **${quest.rewardXp} XP** · ${status}`,
      ].join('\n');
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📜 Your Quests')
      .setDescription(
        description || 'There are no quests available right now.'
      )
      .setFooter({
        text: 'Daily quests reset each UTC day; weekly quests reset each Monday UTC.',
      });

    const buttons = memberQuests.map((quest) =>
      new ButtonBuilder()
        .setCustomId(`quest:claim:${quest.id}`)
        .setLabel(
          quest.claimed
            ? `${quest.name} — Claimed`
            : `Claim: ${quest.name}`
        )
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!quest.completed || quest.claimed)
    );

    const rows = [];

    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(
        new ActionRowBuilder().addComponents(
          buttons.slice(i, i + 5)
        )
      );
    }

    await interaction.reply({
      embeds: [embed],
      components: rows,
    });
  },
};
