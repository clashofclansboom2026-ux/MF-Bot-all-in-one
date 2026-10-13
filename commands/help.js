// /help - lists every command automatically.
// You never need to edit this file when you add new commands.

const { MessageFlags } = require('discord.js');

module.exports = {
  data: {
    name: 'help',
    description: 'See everything the bot can do',
  },
  async execute(interaction) {
    const lines = [...interaction.client.commands.values()].map(
      (c) => `/${c.data.name} - ${c.data.description}`
    );

    await interaction.reply({
      content: `**Commands**\n${lines.join('\n')}`,
      flags: MessageFlags.Ephemeral, // only the person who asked sees it
    });
  },
};
