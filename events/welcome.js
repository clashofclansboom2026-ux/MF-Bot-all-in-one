// Welcome message: runs whenever someone joins the server.
// It posts in a channel called "welcome" (or the server's default channel).

const { Events, ChannelType } = require('discord.js');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const channel =
      member.guild.channels.cache.find(
        (c) => c.name === 'welcome' && c.type === ChannelType.GuildText
      ) || member.guild.systemChannel;

    if (!channel) return; // nowhere to post

    await channel.send(
      `Welcome to **${member.guild.name}**, ${member}! Glad to have you here. Type /help to see what I can do.`
    );
  },
};
