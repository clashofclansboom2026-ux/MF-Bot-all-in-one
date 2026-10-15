
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const quests = require('../utils/quests');

function makeProgressBar(progress, target, size = 12) {
  const ratio = target > 0
    ? Math.min(1, Math.max(0, progress / target))
    : 0;

  const filled = Math.round(ratio * size);

  return `\`${'▰'.repeat(filled)}${'▱'.repeat(size - filled)}\``;
}

function getQuestStatus(quest) {
  if (quest.claimed) return '✅ **Reward claimed**';
  if (quest.completed) return '🏆 **Complete — claim your reward!**';
  return '⏳ **In progress**';
}

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

    const completedCount = memberQuests.filter(
      (quest) => quest.completed
    ).length;

    const claimedCount = memberQuests.filter(
      (quest) => quest.claimed
    ).length;

    const availableRewards = memberQuests
      .filter((quest) => quest.completed && !quest.claimed)
      .reduce((total, quest) => total + quest.rewardXp, 0);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({
        name: 'MF BOT  •  QUEST BOARD',
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTitle('📜 Your Quests')
      .setDescription([
        'Complete challenges by chatting in the server and earn bonus XP.',
        '',
        '━━━━━━━━━━━━━━━━━━━━',
        `**QUESTS COMPLETED**`,
        `\`${completedCount}/${memberQuests.length}\` completed  •  \`${claimedCount}\` rewards claimed`,
        '',
        availableRewards > 0
          ? `🎁 **${availableRewards} XP ready to collect!**`
          : '💬 Keep chatting to unlock your next reward.',
        '━━━━━━━━━━━━━━━━━━━━',
      ].join('\n'));

    for (const quest of memberQuests) {
      const isDaily = quest.type === 'daily';
      const progress = Math.min(quest.progress, quest.target);
      const percentage = Math.floor(
        (progress / quest.target) * 100
      );

      embed.addFields({
        name: `${isDaily ? '☀️' : '🗓️'} ${quest.name}  ·  ${isDaily ? 'DAILY' : 'WEEKLY'}`,
        value: [
          quest.description,
          '',
          `${makeProgressBar(progress, quest.target)} **${progress}/${quest.target}**`,
          `📊 Progress: **${percentage}%**`,
          `🎁 Reward: **${quest.rewardXp} XP**`,
          getQuestStatus(quest),
        ].join('\n'),
        inline: false,
      });
    }

    embed.setFooter({
      text: 'Daily reset: 00:00 UTC  •  Weekly reset: Monday 00:00 UTC',
    });

    const buttons = memberQuests.map((quest) => {
      let label;
      let style;
      let disabled = false;

      if (quest.claimed) {
        label = `${quest.name} — Claimed`;
        style = ButtonStyle.Secondary;
        disabled = true;
      } else if (quest.completed) {
        label = `Claim ${quest.rewardXp} XP`;
        style = ButtonStyle.Success;
      } else {
        label = `${quest.progress}/${quest.target} • ${quest.rewardXp} XP`;
        style = ButtonStyle.Secondary;
        disabled = true;
      }

      return new ButtonBuilder()
        .setCustomId(`quest:claim:${quest.id}`)
        .setLabel(label)
        .setStyle(style)
        .setDisabled(disabled);
    });

    const rows = [];

    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(
        new ActionRowBuilder().addComponents(
          buttons.slice(i, i + 5)
        )
      );
    }

    return interaction.reply({
      embeds: [embed],
      components: rows,
    });
  },
};
