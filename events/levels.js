// events/levels.js - gives people XP for chatting and announces level-ups.

const { Events } = require('discord.js');
const xp = require('../utils/xp');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author.bot) return;

    const amount = 15 + Math.floor(Math.random() * 11); // 15 to 25 XP
    const result = xp.addXp(message.guild.id, message.author.id, amount);

    if (result?.leveledUp) {
      await message.channel.send({
        content: `🎉 ${message.author} reached **level ${result.level}**!`,
        allowedMentions: { users: [message.author.id] },
      });
    }
  },
};
