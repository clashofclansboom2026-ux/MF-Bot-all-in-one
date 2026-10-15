// Handles the buttons on polls and restarts poll timers when the bot starts.

const { Events, MessageFlags, PermissionFlagsBits } = require('discord.js');
const polls = require('../utils/polls');

const hidden = (content) => ({ content, flags: MessageFlags.Ephemeral });

const buttons = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    if (!interaction.isButton() || !interaction.customId.startsWith('poll:')) return;

    const [, action, value] = interaction.customId.split(':');
    const messageId = interaction.message.id;

    // Someone tapped a choice.
    if (action === 'vote') {
      const result = polls.castVote(messageId, interaction.user.id, Number(value));

      if (result.error === 'missing') {
        return interaction.reply(hidden('This poll is no longer active.'));
      }
      if (result.error === 'ended') {
        await interaction.update(polls.render(result.poll));
        return interaction.followUp(hidden('This poll has ended, so your vote was not counted.'));
      }
      return interaction.update(polls.render(result.poll));
    }

    // Someone tapped "End poll".
    if (action === 'end') {
      const poll = polls.get(messageId);
      if (!poll) return interaction.reply(hidden('This poll is no longer active.'));

      const allowed =
        interaction.user.id === poll.creatorId ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
      if (!allowed) {
        return interaction.reply(hidden('Only the person who started this poll or a moderator can end it.'));
      }

      const ended = polls.markEnded(messageId);
      return interaction.update(polls.render(ended ?? poll));
    }
  },
};

const ready = {
  name: Events.ClientReady,
  execute(client) {
    polls.init(client);
  },
};

// This file exports a list, so one file can hold several events.
module.exports = [buttons, ready];
