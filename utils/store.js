
'use strict';

// MF Bot - Persistent JSON Storage
// Keeps data available after restarts while protecting saved files
// against unsafe paths and incomplete writes.

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIRECTORY = path.resolve(__dirname, '..', 'data');
const TEMP_SUFFIX = '.tmp';

function ensureDirectory() {
  fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
}

// Only allow simple names such as "dashboard-secret" or "reminders".
// This prevents names containing paths from escaping the data folder.
function fileFor(name) {
  if (
    typeof name !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(name)
  ) {
    throw new TypeError(
      'Storage name must contain only letters, numbers, underscores or hyphens.'
    );
  }

  return path.join(DATA_DIRECTORY, `${name}.json`);
}

// Read stored data. Return the provided fallback when the file
// does not exist or cannot be read.
function read(name, fallback = null) {
  const file = fileFor(name);

  try {
    const contents = fs.readFileSync(file, 'utf8');
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }

    console.error(
      `[Storage] Could not read "${name}.json": ${error.message}`
    );

    return fallback;
  }
}

// Save JSON safely by writing a temporary file first, then renaming it.
// The temporary file is unique so separate writes are less likely to
// overwrite each other's temporary files.
function write(name, data) {
  const file = fileFor(name);

  ensureDirectory();

  const temporaryFile = path.join(
    DATA_DIRECTORY,
    `${path.basename(file, '.json')}.${process.pid}.${Date.now()}.${Math.random()
      .toString(16)
      .slice(2)}${TEMP_SUFFIX}`
  );

  try {
    const contents = JSON.stringify(data, null, 2);

    if (contents === undefined) {
      throw new TypeError('Storage data must be JSON-serializable.');
    }

    fs.writeFileSync(temporaryFile, contents, {
      encoding: 'utf8',
      flag: 'wx',
    });

    fs.renameSync(temporaryFile, file);

    return true;
  } catch (error) {
    console.error(
      `[Storage] Could not save "${name}.json": ${error.message}`
    );

    throw error;
  } finally {
    try {
      fs.unlinkSync(temporaryFile);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(
          `[Storage] Could not remove temporary file: ${error.message}`
        );
      }
    }
  }
}

module.exports = {
  read,
  write,
};
