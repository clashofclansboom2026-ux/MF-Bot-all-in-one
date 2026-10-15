
const { Events, EmbedBuilder } = require('discord.js');
const xp = require('../utils/xp');
const levelRewards = require('../utils/levelRewards');

module.exports = {
  name: Events.MessageCreate,

  async execute(message) {
    if (!message.guild || message.author.bot || !message.member) return;

    // Preserve the existing XP amount: 15–25 per eligible message.
    const amount = 15 + Math.floor(Math.random() * 11);
    const result = xp.addXp(
      message.guild.id,
      message.author.id,
      amount
    );

    if (!result?.leveledUp) return;

    const rewardResult = await levelRewards.grantRewards(
      message.member,
      result.beforeLevel,
      result.level
    );

    if (rewardResult.failures.length) {
      console.warn(
        `Some level rewards could not be granted to ${message.author.tag}:`,
        rewardResult.failures
      );
    }

    if (!rewardResult.settings.announcementsEnabled) return;

    const channelId = rewardResult.settings.channelId;
    const channel = channelId
      ? await message.guild.channels.fetch(channelId).catch(() => null)
      : message.channel;

    if (!channel?.isTextBased() || !channel.messages) {
      console.warn(
        `Level-up announcement channel is missing or invalid in guild ${message.guild.id}.`
      );
      return;
    }

    const earnedText = rewardResult.earned.length
      ? `\n**Role rewards earned:** ${rewardResult.earned.map(({ role }) => `${role}`).join(', ')}`
      : '';

    const levelText = result.level - result.beforeLevel > 1
      ? `levels **${result.beforeLevel + 1}–${result.level}**`
      : `**level ${result.level}**`;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(
        `🎉 ${message.author} reached ${levelText}!${earnedText}`
      )
      .setThumbnail(message.author.displayAvatarURL({ size: 128 }));

    try {
      await channel.send({
        embeds: [embed],
        allowedMentions: {
          users: [message.author.id],
          roles: [],
        },
      });
    } catch (error) {
      console.error(
        `Could not send level-up announcement in ${channel.id}:`,
        error.message
      );
    }
  },
};
