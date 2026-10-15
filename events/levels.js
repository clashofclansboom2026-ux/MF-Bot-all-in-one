
const { Events } = require('discord.js');
const xp = require('../utils/xp');
const quests = require('../utils/quests');

module.exports = {
  name: Events.MessageCreate,

  async execute(message) {
    if (!message.guild || message.author.bot) return;

    // Track quest progress independently of the XP cooldown.
    quests.recordMessage(message.guild.id, message.author.id);

    // Preserve MF Bot's existing XP system.
    const amount = 15 + Math.floor(Math.random() * 11);
    const result = xp.addXp(
      message.guild.id,
      message.author.id,
      amount
    );

    if (result?.leveledUp) {
      try {
        await message.channel.send({
          content: `🎉 ${message.author} reached **level ${result.level}**!`,
          allowedMentions: { users: [message.author.id] },
        });
      } catch (error) {
        console.error('Could not send level-up announcement:', error);
      }
    }
  },
};
