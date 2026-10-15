
const {
  AttachmentBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');

const tickets = require('./tickets');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimestamp(date) {
  return new Date(date).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

async function fetchAllMessages(channel) {
  const messages = [];
  let before;

  while (true) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });

    if (batch.size === 0) break;

    messages.push(...batch.values());
    before = batch.last().id;

    if (batch.size < 100) break;
  }

  return messages.sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp
  );
}

async function createTranscript(channel, ticket) {
  if (!channel || !channel.isTextBased() || !channel.messages) {
    throw new Error('A valid text ticket channel is required.');
  }

  const messages = await fetchAllMessages(channel);

  const messageHtml = messages.map((message) => {
    const author = escapeHtml(
      message.author?.tag || message.author?.username || 'Unknown user'
    );

    const avatar = escapeHtml(
      message.author?.displayAvatarURL({
        extension: 'png',
        size: 64,
      }) || ''
    );

    const timestamp = escapeHtml(
      formatTimestamp(message.createdAt)
    );

    const content = escapeHtml(message.content || '')
      .replace(/\n/g, '<br>');

    const attachments = [...message.attachments.values()]
      .map((attachment) => {
        const url = escapeHtml(attachment.url);
        const filename = escapeHtml(attachment.name || 'Attachment');

        return `<div class="attachment"><a href="${url}">${filename}</a></div>`;
      })
      .join('');

    const embeds = message.embeds.map((embed) => {
      const title = escapeHtml(embed.title || '');
      const description = escapeHtml(embed.description || '')
        .replace(/\n/g, '<br>');

      if (!title && !description) return '';

      return `
        <div class="discord-embed">
          ${title ? `<strong>${title}</strong>` : ''}
          ${description ? `<div>${description}</div>` : ''}
        </div>
      `;
    }).join('');

    return `
      <article class="message">
        ${avatar ? `<img class="avatar" src="${avatar}" alt="">` : ''}
        <div class="message-body">
          <div class="message-meta">
            <strong>${author}</strong>
            <time>${timestamp}</time>
          </div>
          ${content ? `<div class="content">${content}</div>` : ''}
          ${attachments}
          ${embeds}
        </div>
      </article>
    `;
  }).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ticket Transcript</title>
<style>
  body {
    margin: 0;
    padding: 24px;
    background: #313338;
    color: #dbdee1;
    font: 14px/1.5 Arial, sans-serif;
  }
  header {
    max-width: 1000px;
    margin: 0 auto 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #4e5058;
  }
  h1 { margin: 0 0 8px; color: #fff; }
  .summary { color: #b5bac1; }
  main { max-width: 1000px; margin: 0 auto; }
  .message {
    display: flex;
    gap: 14px;
    padding: 12px 0;
    border-bottom: 1px solid #3f4147;
  }
  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
  }
  .message-body { min-width: 0; flex: 1; }
  .message-meta { margin-bottom: 4px; }
  .message-meta strong { color: #fff; }
  time { margin-left: 8px; color: #949ba4; font-size: 12px; }
  .content { overflow-wrap: anywhere; white-space: normal; }
  .attachment, .discord-embed {
    margin-top: 8px;
    padding: 10px;
    border-radius: 4px;
    background: #2b2d31;
    overflow-wrap: anywhere;
  }
  a { color: #00a8fc; }
  .discord-embed { border-left: 4px solid #5865f2; }
</style>
</head>
<body>
<header>
  <h1>Ticket Transcript</h1>
  <div class="summary">Ticket: ${escapeHtml(ticket.ticketNumber ?? channel.name)}</div>
  <div class="summary">Channel: ${escapeHtml(channel.name)}</div>
  <div class="summary">Owner ID: ${escapeHtml(ticket.userId || 'Unknown')}</div>
  <div class="summary">Messages: ${messages.length}</div>
  <div class="summary">Generated: ${escapeHtml(formatTimestamp(new Date()))}</div>
</header>
<main>
${messageHtml || '<p>No messages were found in this ticket.</p>'}
</main>
</body>
</html>`;

  const buffer = Buffer.from(html, 'utf8');

  return {
    attachment: new AttachmentBuilder(buffer, {
      name: `ticket-${ticket.ticketNumber ?? channel.id}-transcript.html`,
    }),
    messageCount: messages.length,
  };
}

async function sendTranscript(guild, channel, ticket, closedBy) {
  const settings = tickets.getSettings(guild.id);

  if (!settings.logChannelId) {
    return {
      sent: false,
      reason: 'No ticket logs channel is configured.',
    };
  }

  const logChannel = await guild.channels
    .fetch(settings.logChannelId)
    .catch(() => null);

  if (
    !logChannel ||
    ![
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
    ].includes(logChannel.type)
  ) {
    return {
      sent: false,
      reason: 'The configured ticket logs channel could not be found.',
    };
  }

  const permissions = logChannel.permissionsFor(guild.members.me);

  if (
    !permissions?.has(PermissionFlagsBits.ViewChannel) ||
    !permissions.has(PermissionFlagsBits.SendMessages) ||
    !permissions.has(PermissionFlagsBits.AttachFiles) ||
    !permissions.has(PermissionFlagsBits.EmbedLinks)
  ) {
    return {
      sent: false,
      reason: 'The bot needs View Channel, Send Messages, Attach Files and Embed Links in the logs channel.',
    };
  }

  const transcript = await createTranscript(channel, ticket);

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`Ticket #${ticket.ticketNumber ?? 'Unknown'} — Closed`)
    .addFields(
      {
        name: 'Ticket owner',
        value: ticket.userId ? `<@${ticket.userId}>` : 'Unknown',
        inline: true,
      },
      {
        name: 'Closed by',
        value: closedBy ? `<@${closedBy.id}>` : 'Unknown',
        inline: true,
      },
      {
        name: 'Messages saved',
        value: String(transcript.messageCount),
        inline: true,
      }
    )
    .setTimestamp();

  await logChannel.send({
    embeds: [embed],
    files: [transcript.attachment],
    allowedMentions: { parse: [] },
  });

  return {
    sent: true,
    messageCount: transcript.messageCount,
  };
}

module.exports = {
  createTranscript,
  sendTranscript,
};
