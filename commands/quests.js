
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
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
      const filled = Math.round(
        (quest.progress / quest.target) * length
      );
      const bar = '▰'.repeat(filled) + '▱'.repeat(length - filled);

      let status;
      if (quest.claimed) {
        status = '✅ Reward claimed';
      } else if (quest.completed) {
        status = '🏁 Completed — reward claiming coming soon';
      } else {
        status = '⏳ In progress';
      }

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
      .setDescription(description)
      .setFooter({
        text: 'Daily quests reset each UTC day; weekly quests reset each Monday UTC.',
      });

    await interaction.reply({ embeds: [embed] });
  },
};
