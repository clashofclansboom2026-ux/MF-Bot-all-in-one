
 // utils/polls.js - everything about button polls:
// saving votes, drawing the poll message, and ending polls on time.
// Polls are saved in data/polls.json, so they survive restarts.

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const store = require('./store');
const { clip } = require('./checks');

const NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const KEEP_ENDED_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TIMER_MS = 2147483647;

const timers = new Map();

const load = () => {
  const data = store.read('polls', {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
};

const saveAll = (all) => store.write('polls', all);

const get = (messageId) => {
  if (typeof messageId !== 'string' || !messageId) return null;
  const poll = load()[messageId];
  return isValidPoll(poll) ? poll : null;
};

function isValidPoll(poll) {
  if (!poll || typeof poll !== 'object' || Array.isArray(poll)) return false;
  if (typeof poll.question !== 'string' || !poll.question.trim()) return false;
  if (!Array.isArray(poll.options) || poll.options.length < 2 || poll.options.length > 10) return false;
  if (!poll.options.every((option) => typeof option === 'string' && option.trim())) return false;
  if (!poll.votes || typeof poll.votes !== 'object' || Array.isArray(poll.votes)) return false;
  if (typeof poll.ended !== 'boolean' || typeof poll.multiple !== 'boolean') return false;
  if (poll.endsAt != null && (!Number.isFinite(poll.endsAt) || poll.endsAt < 0)) return false;
  if (poll.endedAt != null && (!Number.isFinite(poll.endedAt) || poll.endedAt < 0)) return false;
  if (typeof poll.channelId !== 'string' || !poll.channelId) return false;
  if (typeof poll.creatorName !== 'string') return false;

  for (const [userId, picks] of Object.entries(poll.votes)) {
    if (
      !userId ||
      !Array.isArray(picks) ||
      !picks.every((index) =>
        Number.isInteger(index) && index >= 0 && index < poll.options.length
      )
    ) {
      return false;
    }
  }

  return true;
}

// ---------- drawing the poll ----------

function tally(poll) {
  const counts = poll.options.map(() => 0);
  let voters = 0;

  for (const picks of Object.values(poll.votes)) {
    if (!Array.isArray(picks)) continue;

    const validPicks = [...new Set(picks)].filter(
      (index) => Number.isInteger(index) && index >= 0 && index < counts.length
    );

    if (validPicks.length) voters += 1;
    for (const index of validPicks) counts[index] += 1;
  }

  return { counts, voters };
}

// Builds the message (embed + buttons) for a poll.
function render(poll) {
  if (!isValidPoll(poll)) {
    throw new TypeError('Cannot render an invalid poll.');
  }

  const { counts, voters } = tally(poll);
  const top = Math.max(0, ...counts);

  const lines = poll.options.map((text, i) => {
    const percent = voters ? Math.round((counts[i] / voters) * 100) : 0;
    const filled = Math.round(percent / 10);
    const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);
    const crown = poll.ended && top > 0 && counts[i] === top ? ' 🏆' : '';

    return `${NUMBERS[i]} **${text}**${crown}\n${bar} ${percent}% (${counts[i]})`;
  });

  let status;
  if (poll.ended) status = '🔒 This poll has ended';
  else if (poll.endsAt) status = `⏳ Ends <t:${Math.floor(poll.endsAt / 1000)}:R>`;
  else status = '⏳ Open until its creator ends it';

  const how = poll.multiple
    ? 'Pick as many options as you like. Tap again to remove a vote.'
    : 'One vote each. Tap another option to change it, or the same one to remove it.';

  const embed = new EmbedBuilder()
    .setColor(poll.ended ? 0x747f8d : 0x5865f2)
    .setTitle(`📊 ${clip(poll.question, 256)}`)
    .setDescription(lines.join('\n\n').slice(0, 4096))
    .addFields({
      name: `${voters} voter${voters === 1 ? '' : 's'}`,
      value: (poll.ended ? status : `${how}\n${status}`).slice(0, 1024),
    })
    .setFooter({ text: `Started by ${clip(poll.creatorName || 'Unknown', 2048)}` });

  if (poll.ended) return { embeds: [embed], components: [] };

  const rows = [];

  for (let i = 0; i < poll.options.length; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        poll.options.slice(i, i + 5).map((text, j) =>
          new ButtonBuilder()
            .setCustomId(`poll:vote:${i + j}`)
            .setLabel(clip(text, 80))
            .setEmoji(NUMBERS[i + j])
            .setStyle(ButtonStyle.Secondary)
        )
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('poll:end')
        .setLabel('End poll')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger)
    )
  );

  return { embeds: [embed], components: rows };
}

// ---------- saving, voting, ending ----------

function save(messageId, poll, client) {
  if (typeof messageId !== 'string' || !messageId || !isValidPoll(poll)) {
    throw new TypeError('Cannot save a poll with invalid data or message ID.');
  }

  const all = load();
  all[messageId] = poll;
  saveAll(all);
  schedule(client, messageId);
}

function castVote(messageId, userId, index) {
  if (
    typeof messageId !== 'string' || !messageId ||
    typeof userId !== 'string' || !userId
  ) {
    return { error: 'missing' };
  }

  const all = load();
  const poll = all[messageId];

  if (!isValidPoll(poll)) return { error: 'missing' };
  if (poll.ended) return { error: 'ended', poll };

  if (poll.endsAt && Date.now() >= poll.endsAt) {
    return { error: 'ended', poll: markEnded(messageId) };
  }

  if (!Number.isInteger(index) || index < 0 || index >= poll.options.length) {
    return { error: 'missing' };
  }

  const picks = Array.isArray(poll.votes[userId])
    ? [...new Set(poll.votes[userId])]
    : [];

  let next;

  if (picks.includes(index)) {
    next = picks.filter((i) => i !== index);
  } else {
    next = poll.multiple ? [...picks, index] : [index];
  }

  if (next.length) poll.votes[userId] = next;
  else delete poll.votes[userId];

  saveAll(all);
  return { poll };
}

function markEnded(messageId) {
  if (typeof messageId !== 'string' || !messageId) return null;

  const all = load();
  const poll = all[messageId];

  if (!isValidPoll(poll)) return null;

  if (!poll.ended) {
    poll.ended = true;
    poll.endedAt = Date.now();
    saveAll(all);
  }

  const timer = timers.get(messageId);
  if (timer) clearTimeout(timer);
  timers.delete(messageId);

  return poll;
}

async function finishByTimer(client, messageId) {
  const poll = markEnded(messageId);
  if (!poll) return;

  try {
    if (!client?.channels?.fetch) return;

    const channel = await client.channels.fetch(poll.channelId);
    if (!channel?.messages?.fetch) return;

    const message = await channel.messages.fetch(messageId);
    await message.edit(render(poll));
  } catch (error) {
    console.error('Could not update an ended poll:', error?.message || error);
  }
}

function schedule(client, messageId) {
  const poll = get(messageId);
  if (!poll || poll.ended || !poll.endsAt) return;

  const oldTimer = timers.get(messageId);
  if (oldTimer) clearTimeout(oldTimer);

  const delay = Math.max(0, poll.endsAt - Date.now());

  // Split long waits into safe chunks instead of using an oversized timer.
  const timer = setTimeout(() => {
    if (delay > MAX_TIMER_MS) {
      schedule(client, messageId);
    } else {
      finishByTimer(client, messageId);
    }
  }, Math.min(delay, MAX_TIMER_MS));

  timers.set(messageId, timer);
}

// Runs when the bot starts: restarts timers and tidies old polls.
function init(client) {
  const all = load();
  let changed = false;

  for (const [messageId, poll] of Object.entries(all)) {
    if (!isValidPoll(poll)) {
      delete all[messageId];
      changed = true;
      continue;
    }

    if (poll.ended && poll.endedAt && Date.now() - poll.endedAt > KEEP_ENDED_MS) {
      delete all[messageId];
      changed = true;
    }
  }

  if (changed) saveAll(all);

  for (const messageId of Object.keys(all)) {
    schedule(client, messageId);
  }
}

module.exports = { render, save, get, castVote, markEnded, init };
