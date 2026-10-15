
const { Events, MessageFlags } = require('discord.js');
const quests = require('../utils/quests');

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    if (!interaction.isButton()) return;

    const match = interaction.customId.match(
      /^quest:claim:([a-z0-9_]+)$/
    );

    if (!match) return;

    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'Quest rewards can only be claimed in a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const questId = match[1];

    try {
      const result = quests.claimQuest(
        interaction.guildId,
        interaction.user.id,
        questId
      );

      if (!result.success) {
        const messages = {
          not_found: 'That quest could not be found.',
          incomplete: 'You have not completed that quest yet.',
          claimed: 'You have already claimed this quest reward.',
        };

        return interaction.reply({
          content: messages[result.reason] || 'Unable to claim this reward.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const { quest, xpResult } = result;

      const levelMessage = xpResult.leveledUp
        ? ` You also reached level ${xpResult.level}!`
        : '';

      await interaction.reply({
        content: `🏆 Quest completed: **${quest.name}**!\nYou received **${quest.rewardXp} XP**.${levelMessage}`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Quest reward claim failed:', error);

      if (interaction.replied || interaction.deferred) return;

      await interaction.reply({
        content: 'Something went wrong while claiming your reward. Please contact a server administrator.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
