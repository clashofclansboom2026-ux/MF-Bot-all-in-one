
const {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');

const QUESTION_COUNT = 5;

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    // Open the questionnaire when the dedicated button is pressed.
    if (
      interaction.isButton() &&
      interaction.customId === 'ticket:questions'
    ) {
      const modal = new ModalBuilder()
        .setCustomId('ticket:questions:submit')
        .setTitle('Ticket Questions');

      const questions = [
        {
          id: 'question_1',
          label: 'What do you need help with?',
          required: true,
        },
        {
          id: 'question_2',
          label: 'Please provide more details',
          required: true,
        },
        {
          id: 'question_3',
          label: 'Have you tried anything already?',
          required: false,
        },
        {
          id: 'question_4',
          label: 'How urgent is this?',
          required: false,
        },
        {
          id: 'question_5',
          label: 'Anything else we should know?',
          required: false,
        },
      ];

      for (const question of questions.slice(0, QUESTION_COUNT)) {
        const input = new TextInputBuilder()
          .setCustomId(question.id)
          .setLabel(question.label)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(question.required)
          .setMaxLength(1000);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );
      }

      return interaction.showModal(modal);
    }

    // Collect the answers when the modal is submitted.
    if (
      interaction.isModalSubmit() &&
      interaction.customId === 'ticket:questions:submit'
    ) {
      const answers = [];

      for (let i = 1; i <= QUESTION_COUNT; i++) {
        const answer = interaction.fields.getTextInputValue(
          `question_${i}`
        );

        if (answer.trim()) {
          answers.push({
            question: i,
            answer: answer.trim(),
          });
        }
      }

      // Store the answers on this interaction so the next integration
      // step can pass them into ticket creation.
      interaction.ticketQuestionAnswers = answers;

      return interaction.reply({
        content:
          'Your answers have been received. Ticket creation will be connected to this form in the next step.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
