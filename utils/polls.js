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
const KEEP_ENDED_MS = 30 * 24 * 60 * 60 * 1000; // forget finished polls after 30 days

const timers = new Map(); // messageId -> timer for polls that end by themselves

const load = () => store.read('polls', {});
const saveAll = (all) => store.write('polls', all);
const get = (messageId) => load()[messageId] ?? null;

// ---------- drawing the poll ----------

// Counts the votes. "voters" is how many different people voted.
function tally(poll) {
  const counts = poll.options.map(() => 0);
  for (const picks of Object.values(poll.votes)) {
    for (const index of picks) counts[index] += 1;
  }
  return { counts, voters: Object.keys(poll.votes).length };
}

// Builds the message (embed + buttons) for a poll.
function render(poll) {
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
    .setTitle(`📊 ${poll.question}`)
    .setDescription(lines.join('\n\n'))
    .addFields({
      name: `${voters} voter${voters === 1 ? '' : 's'}`,
      value: poll.ended ? status : `${how}\n${status}`,
    })
    .setFooter({ text: `Started by ${poll.creatorName}` });

  if (poll.ended) return { embeds: [embed], components: [] };

  // Up to 5 buttons per row, then an "End poll" button.
  const rows = [];
  for (let i = 0; i < poll.options.length; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        poll.options.slice(i, i + 5).map((text, j) =>
          new ButtonBuilder()
            .setCustomId(`poll:vote:${i + j}`)
            .setLabel(clip(text, 30))
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

// Saves a brand new poll and starts its timer (if it has an end time).
function save(messageId, poll, client) {
  const all = load();
  all[messageId] = poll;
  saveAll(all);
  schedule(client, messageId);
}

// A vote click. Tapping your choice again removes it.
function castVote(messageId, userId, index) {
  const all = load();
  const poll = all[messageId];
  if (!poll) return { error: 'missing' };
  if (poll.ended) return { error: 'ended', poll };
  if (poll.endsAt && Date.now() >= poll.endsAt) return { error: 'ended', poll: markEnded(messageId) };
  if (!Number.isInteger(index) || index < 0 || index >= poll.options.length) return { error: 'missing' };

  const picks = poll.votes[userId] ?? [];
  let next;
  if (picks.includes(index)) next = picks.filter((i) => i !== index);
  else next = poll.multiple ? [...picks, index] : [index];

  if (next.length) poll.votes[userId] = next;
  else delete poll.votes[userId];

  saveAll(all);
  return { poll };
}

// Marks a poll as finished. Returns the poll, or null if it doesn't exist.
function markEnded(messageId) {
  const all = load();
  const poll = all[messageId];
  if (!poll) return null;

  if (!poll.ended) {
    poll.ended = true;
    poll.endedAt = Date.now();
    saveAll(all);
  }
  clearTimeout(timers.get(messageId));
  timers.delete(messageId);
  return poll;
}

// Ends a poll by itself when its time is up and updates the message.
async function finishByTimer(client, messageId) {
  const poll = markEnded(messageId);
  if (!poll) return;

  try {
    const channel = await client.channels.fetch(poll.channelId);
    const message = await channel.messages.fetch(messageId);
    await message.edit(render(poll));
  } catch (error) {
    console.error('Could not update an ended poll:', error.message);
  }
}

function schedule(client, messageId) {
  const poll = get(messageId);
  if (!poll || poll.ended || !poll.endsAt) return;

  clearTimeout(timers.get(messageId));
  const delay = Math.max(0, poll.endsAt - Date.now());
  timers.set(messageId, setTimeout(() => finishByTimer(client, messageId), delay));
}

// Runs when the bot starts: restarts timers and tidies old polls.
function init(client) {
  const all = load();
  let changed = false;

  for (const [messageId, poll] of Object.entries(all)) {
    if (poll.ended && poll.endedAt && Date.now() - poll.endedAt > KEEP_ENDED_MS) {
      delete all[messageId];
      changed = true;
    }
  }
  if (changed) saveAll(all);

  for (const messageId of Object.keys(all)) schedule(client, messageId);
}

module.exports = { render, save, get, castVote, markEnded, init };
