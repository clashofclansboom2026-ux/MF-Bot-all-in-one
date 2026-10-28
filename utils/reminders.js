
 // utils/reminders.js - the engine behind /remind.
 // Reminders are saved to a file, so they survive a bot restart.

const store = require('./store');

const UNITS = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000 };
const MIN_MS = 5_000; // 5 seconds
const MAX_MS = 24 * UNITS.d; // 24 days

const timers = new Map(); // reminder id -> timer
const DISCORD_ID_PATTERN = /^\d{17,20}$/;

function readReminders() {
  const saved = store.read('reminders', []);
  return Array.isArray(saved)
    ? saved.filter((reminder) =>
        reminder &&
        typeof reminder === 'object' &&
        !Array.isArray(reminder) &&
        typeof reminder.id === 'string' &&
        DISCORD_ID_PATTERN.test(String(reminder.userId ?? '')) &&
        DISCORD_ID_PATTERN.test(String(reminder.channelId ?? '')) &&
        typeof reminder.message === 'string' &&
        Number.isFinite(reminder.time)
      )
    : [];
}

// Turn text like "10m", "2h", "1d" or "1h30m" into milliseconds.
// Returns null if the text isn't understood.
function parseDuration(text) {
  const cleaned = String(text ?? '').trim();

  if (!/^(?:\d+\s*[dhms]\s*)+$/i.test(cleaned)) return null;

  let total = 0;

  for (const match of cleaned.matchAll(/(\d+)\s*([dhms])/gi)) {
    total += Number(match[1]) * UNITS[match[2].toLowerCase()];

    if (!Number.isSafeInteger(total) || total > MAX_MS) {
      return null;
    }
  }

  return total;
}

async function deliver(client, reminder) {
  timers.delete(reminder.id);

  // Remove it from storage first, so it cannot fire twice.
  const saved = readReminders().filter((item) => item.id !== reminder.id);
  store.write('reminders', saved);

  const late = Date.now() - reminder.time > 60_000;
  const text =
    `⏰ <@${reminder.userId}> reminder${late ? ' (sorry, I was offline, so this is late)' : ''}: ` +
    reminder.message;

  try {
    const channel = await client.channels.fetch(reminder.channelId);

    if (!channel || typeof channel.send !== 'function') {
      throw new Error('The reminder channel is unavailable.');
    }

    await channel.send({
      content: text,
      allowedMentions: { users: [reminder.userId] },
    });

    return;
  } catch {
    // Channel is gone or the bot cannot post there. Try a private message.
  }

  try {
    const user = await client.users.fetch(reminder.userId);
    await user.send(text);
  } catch (error) {
    console.error('Could not deliver a reminder:', error.message);
  }
}

function schedule(client, reminder) {
  if (timers.has(reminder.id)) return;

  const delay = Math.max(0, reminder.time - Date.now());

  // JavaScript timers cannot safely wait longer than this limit.
  if (delay > MAX_MS) {
    const timer = setTimeout(() => {
      timers.delete(reminder.id);
      schedule(client, reminder);
    }, MAX_MS);

    timers.set(reminder.id, timer);
    return;
  }

  const timer = setTimeout(() => {
    deliver(client, reminder).catch((error) => {
      console.error('Reminder delivery failed:', error.message);
    });
  }, delay);

  timers.set(reminder.id, timer);
}

// Save a new reminder and start its timer.
function add(client, { userId, channelId, message, ms } = {}) {
  if (!DISCORD_ID_PATTERN.test(String(userId ?? ''))) {
    throw new Error('A valid Discord user ID is required.');
  }

  if (!DISCORD_ID_PATTERN.test(String(channelId ?? ''))) {
    throw new Error('A valid Discord channel ID is required.');
  }

  if (typeof message !== 'string' || !message.trim()) {
    throw new Error('A reminder message is required.');
  }

  if (!Number.isSafeInteger(ms) || ms < MIN_MS || ms > MAX_MS) {
    throw new Error('Reminder duration must be between 5 seconds and 24 days.');
  }

  const reminder = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: String(userId),
    channelId: String(channelId),
    message: message.trim().slice(0, 2000),
    time: Date.now() + ms,
  };

  store.write('reminders', [...readReminders(), reminder]);
  schedule(client, reminder);

  return reminder;
}

// Call once when the bot starts: restart timers for saved reminders.
function init(client) {
  const saved = readReminders();

  // Save only valid reminders, removing malformed saved entries.
  store.write('reminders', saved);

  for (const reminder of saved) {
    schedule(client, reminder);
  }

  if (saved.length) {
    console.log(`Restored ${saved.length} reminder(s).`);
  }
}

module.exports = { parseDuration, add, init, MIN_MS, MAX_MS };
