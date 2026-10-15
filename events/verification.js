
const {
  Events,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

const { getGuildConfig } = require('../utils/configStore');
const { roleProblem } = require('../utils/rolesafety');

const challenges = new Map();
const CHALLENGE_LIFETIME = 2 * 60 * 1000;

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    if (!interaction.inGuild()) return;

    // Handle the Verify button.
    if (
      interaction.isButton() &&
      interaction.customId === 'verify:start'
    ) {
      const config = getGuildConfig(interaction.guildId);

      if (!config.verificationEnabled || !config.verificationRoleId) {
        return interaction.reply({
          content: 'Verification has not been configured. Contact a moderator.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const role = interaction.guild.roles.cache.get(
        config.verificationRoleId
      );

      if (!role) {
        return interaction.reply({
          content: 'The verification role no longer exists. Contact a moderator.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.member.roles.cache.has(role.id)) {
        return interaction.reply({
          content: 'You are already verified.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const a = Math.floor(Math.random() * 8) + 2;
      const b = Math.floor(Math.random() * 8) + 2;
      const key = `${interaction.guildId}:${interaction.user.id}`;

      challenges.set(key, {
        answer: String(a + b),
        createdAt: Date.now(),
      });

      const modal = new ModalBuilder()
        .setCustomId(`verify:answer:${interaction.guildId}`)
        .setTitle('Member verification');

      const answerInput = new TextInputBuilder()
        .setCustomId('answer')
        .setLabel(`What is ${a} + ${b}?`)
        .setPlaceholder('Enter the number')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3);

      modal.addComponents(
        new ActionRowBuilder().addComponents(answerInput)
      );

      return interaction.showModal(modal);
    }

    // Handle the submitted answer.
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith('verify:answer:')
    ) {
      const guildId = interaction.customId.slice(
        'verify:answer:'.length
      );

      if (guildId !== interaction.guildId) {
        return interaction.reply({
          content: 'Invalid verification request. Press Verify again.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const key = `${interaction.guildId}:${interaction.user.id}`;
      const challenge = challenges.get(key);

      if (
        !challenge ||
        Date.now() - challenge.createdAt > CHALLENGE_LIFETIME
      ) {
        challenges.delete(key);

        return interaction.reply({
          content: 'Your question expired. Press Verify to try again.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Each question can only be attempted once.
      challenges.delete(key);

      const answer = interaction.fields
        .getTextInputValue('answer')
        .trim();

      if (answer !== challenge.answer) {
        return interaction.reply({
          content: 'Incorrect answer. Press Verify to try again.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const config = getGuildConfig(interaction.guildId);

      if (!config.verificationEnabled || !config.verificationRoleId) {
        return interaction.reply({
          content: 'Verification is unavailable. Contact a moderator.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const role = interaction.guild.roles.cache.get(
        config.verificationRoleId
      );

      if (!role) {
        return interaction.reply({
          content: 'The verification role no longer exists. Contact a moderator.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const problem = roleProblem(role, interaction.guild);

      if (problem) {
        return interaction.reply({
          content: `I cannot assign **${role.name}** because it ${problem}. Contact a moderator.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        await interaction.member.roles.add(
          role,
          'Passed member verification'
        );

        return interaction.reply({
          content: `Verification successful. You received the **${role.name}** role.`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        console.error('Verification role assignment failed:', error);

        return interaction.reply({
          content: 'Your answer was correct, but I could not assign the role. A moderator needs to check my permissions and role position.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};

