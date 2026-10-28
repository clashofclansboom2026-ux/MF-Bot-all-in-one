
 // utils/modLog.js - sends an entry to the server's moderation log channel.

const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('./configStore');

async function sendModLog(guild, details) {
  try {
    if (!guild || typeof guild.id !== 'string' || !guild.id) return false;
    if (!details || typeof details !== 'object') return false;

    const config = getGuildConfig(guild.id);
    const channelId = config?.modLogChannelId;

    if (typeof channelId !== 'string' || !channelId) return false;

    const channel = await guild.channels.fetch(channelId);
    if (
      !channel ||
      typeof channel.isTextBased !== 'function' ||
      !channel.isTextBased() ||
      channel.isDMBased?.()
    ) {
      return false;
    }

    const title = String(details.title ?? 'Moderation Log').slice(0, 256);
    const description = String(details.description ?? 'No details provided.').slice(0, 4000);
    const color = Number.isInteger(details.color) &&
      details.color >= 0 &&
      details.color <= 0xffffff
      ? details.color
      : 0x5865f2;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();

    if (details.footer) {
      embed.setFooter({ text: String(details.footer).slice(0, 2048) });
    }

    // Moderation logs should never ping users, roles, or everyone.
    await channel.send({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });

    return true;
  } catch (error) {
    console.error('Failed to send moderation log:', error);
    return false;
  }
}

module.exports = { sendModLog };
