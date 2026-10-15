
const {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const quests = require('../utils/quests');
const { makeQuestCard } = require('../utils/questCard');

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

    await interaction.deferReply();

    try {
      const memberQuests = quests.getQuests(
        interaction.guildId,
        interaction.user.id
      );

      const avatarUrl = interaction.user.displayAvatarURL({
        extension: 'png',
        size: 256,
      });

      const botIconUrl = interaction.client.user.displayAvatarURL({
        extension: 'png',
        size: 256,
      });

      const image = await makeQuestCard({
        username: interaction.user.username,
        avatarUrl,
        botIconUrl,
        quests: memberQuests,
      });

      const attachment = new AttachmentBuilder(image, {
        name: 'mfbot-quests.png',
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

      await interaction.editReply({
        files: [attachment],
        components: rows,
      });
    } catch (error) {
      console.error('Failed to generate quest card:', error);

      await interaction.editReply({
        content: 'Could not generate your quest card. Please try again later.',
        files: [],
        components: [],
      });
    }
  },
};
