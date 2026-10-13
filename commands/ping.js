// /ping - checks that the bot is alive.

module.exports = {
  data: {
    name: 'ping',
    description: 'Check that the bot is alive',
  },
  async execute(interaction) {
    await interaction.reply('Pong!');
  },
};
