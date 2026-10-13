
const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('./configStore');

async function sendModLog(guild, details) {
  try {
    const config = getGuildConfig(guild.id);
    if (!config.modLogChannelId) return;

    const channel = await guild.channels.fetch(config.modLogChannelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(details.title)
      .setDescription(details.description)
      .setTimestamp();

    if (details.footer) {
      embed.setFooter({ text: details.footer });
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to send moderation log:', error);
  }
}

module.exports = { sendModLog };
