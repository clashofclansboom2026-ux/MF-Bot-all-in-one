// utils/store.js - a tiny "memory" for the bot.
// It saves things (like warnings and reminders) to files in a "data" folder
// so they are still there after the bot restarts.

const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'data');
const fileFor = (name) => path.join(dir, `${name}.json`);

// Read saved data. If nothing is saved yet, give back "fallback".
function read(name, fallback) {
  const file = fileFor(name);
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`Could not read ${name}.json, starting fresh:`, error.message);
    return fallback;
  }
}

// Save data. Writes to a temp file first so a crash can't leave a half-written file.
function write(name, data) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${fileFor(name)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, fileFor(name));
}

module.exports = { read, write };
