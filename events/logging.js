// events/logging.js - logs joins, leaves, deleted messages and edited messages
// to your moderation log channel (the one you set with /config logs).

const { Events, AuditLogEvent } = require('discord.js');
const { sendModLog } = require('../utils/modLog');
const { getGuildConfig } = require('../utils/configStore');
const { clip, wait } = require('../utils/checks');

const stamp = (ms) => Math.floor(ms / 1000);

// Messages inside the log channel itself are not logged (avoids a loop).
function inLogChannel(message) {
  return getGuildConfig(message.guildId).modLogChannelId === message.channelId;
}

const memberJoined = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await sendModLog(member.guild, {
      title: 'Member Joined',
      description:
        `**Member:** ${member.user.tag} (${member.id})\n` +
        `**Account created:** <t:${stamp(member.user.createdTimestamp)}:R>`,
    });
  },
};

const memberLeft = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    // Leaving also happens when someone is kicked or banned. Check the audit log
    // so we don't log the same thing twice.
    await wait(1000);

    let entry = null;
    try {
      const logs = await member.guild.fetchAuditLogs({ limit: 6 });
      entry = logs.entries.find(
        (log) =>
          (log.action === AuditLogEvent.MemberKick ||
            log.action === AuditLogEvent.MemberBanAdd) &&
          log.target?.id === member.id &&
          Date.now() - log.createdTimestamp < 10000
      );
    } catch {
      // No audit log access. Fall through and log it as a normal leave.
    }

    if (entry) {
      // A ban has its own log entry already.
      if (entry.action === AuditLogEvent.MemberBanAdd) return;
      // A kick by this bot was already logged by /kick.
      if (entry.executor?.id === member.client.user.id) return;

      await sendModLog(member.guild, {
        title: 'Member Kicked (Discord)',
        description:
          `**Member:** ${member.user.tag} (${member.id})\n` +
          `**Moderator:** ${entry.executor?.tag || 'Unknown'}\n` +
          `**Reason:** ${entry.reason || 'No reason provided'}`,
      });
      return;
    }

    await sendModLog(member.guild, {
      title: 'Member Left',
      description: `**Member:** ${member.user.tag} (${member.id})`,
    });
  },
};

const messageDeleted = {
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guild || message.author?.bot) return;
    if (inLogChannel(message)) return;

    const author = message.author
      ? `${message.author.tag} (${message.author.id})`
      : 'Unknown (the message was sent before I started)';

    let content;
    if (message.partial) content = '*Not available.*';
    else if (message.content) content = clip(message.content, 1500);
    else content = '*No text (maybe an image or file).*';

    const files = message.attachments?.size
      ? `\n**Attachments:** ${message.attachments.size}`
      : '';

    await sendModLog(message.guild, {
      title: 'Message Deleted',
      description:
        `**Author:** ${author}\n` +
        `**Channel:** <#${message.channelId}>${files}\n` +
        `**Content:** ${content}`,
    });
  },
};

const messageEdited = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    // If either version is "partial" I don't have the text to compare.
    if (oldMessage.partial || newMessage.partial) return;
    // Discord also sends updates when only a link preview loads. Ignore those.
    if (oldMessage.content === newMessage.content) return;
    if (inLogChannel(newMessage)) return;

    await sendModLog(newMessage.guild, {
      title: 'Message Edited',
      description:
        `**Author:** ${newMessage.author.tag} (${newMessage.author.id})\n` +
        `**Channel:** <#${newMessage.channelId}> - [jump to message](${newMessage.url})\n` +
        `**Before:** ${clip(oldMessage.content || '*empty*', 900)}\n` +
        `**After:** ${clip(newMessage.content || '*empty*', 900)}`,
    });
  },
};

// This file exports a list, so one file can hold several events.
module.exports = [memberJoined, memberLeft, messageDeleted, messageEdited];
