// utils/reminders.js - the engine behind /remind.
// Reminders are saved to a file, so they survive a bot restart.

const store = require('./store');

const UNITS = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000 };
const MIN_MS = 5_000; // 5 seconds
const MAX_MS = 24 * UNITS.d; // 24 days (a limit of JavaScript timers)

const timers = new Map(); // reminder id -> timer

// Turn text like "10m", "2h", "1d" or "1h30m" into milliseconds.
// Returns null if the text isn't understood.
function parseDuration(text) {
  const cleaned = String(text).trim();
  if (!/^(\s*\d+\s*[dhms]\s*)+$/i.test(cleaned)) return null;
  let total = 0;
  for (const match of cleaned.matchAll(/(\d+)\s*([dhms])/gi)) {
    total += Number(match[1]) * UNITS[match[2].toLowerCase()];
  }
  return total;
}

async function deliver(client, reminder) {
  timers.delete(reminder.id);
  // Remove it from the saved list first, so it can never fire twice.
  store.write(
    'reminders',
    store.read('reminders', []).filter((r) => r.id !== reminder.id)
  );

  const late = Date.now() - reminder.time > 60_000;
  const text =
    `⏰ <@${reminder.userId}> reminder${late ? ' (sorry, I was offline, so this is late)' : ''}: ` +
    reminder.message;

  try {
    const channel = await client.channels.fetch(reminder.channelId);
    await channel.send({ content: text, allowedMentions: { users: [reminder.userId] } });
    return;
  } catch {
    // Channel is gone or I can't post there. Try a private message instead.
  }
  try {
    const user = await client.users.fetch(reminder.userId);
    await user.send(text);
  } catch (error) {
    console.error('Could not deliver a reminder:', error.message);
  }
}

function schedule(client, reminder) {
  const delay = Math.max(0, reminder.time - Date.now());
  timers.set(reminder.id, setTimeout(() => deliver(client, reminder), delay));
}

// Save a new reminder and start its timer.
function add(client, { userId, channelId, message, ms }) {
  const reminder = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    channelId,
    message,
    time: Date.now() + ms,
  };
  store.write('reminders', [...store.read('reminders', []), reminder]);
  schedule(client, reminder);
  return reminder;
}

// Call once when the bot starts: restart the timers for saved reminders.
function init(client) {
  const saved = store.read('reminders', []);
  for (const reminder of saved) schedule(client, reminder);
  if (saved.length) console.log(`Restored ${saved.length} reminder(s).`);
}

module.exports = { parseDuration, add, init, MIN_MS, MAX_MS };
