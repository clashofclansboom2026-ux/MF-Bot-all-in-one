// index.js - the main file of your bot.
// It logs in, then loads every file in the "commands" and "events" folders.
// A file can hold one command/event, or a list of several.

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  Events,
  MessageFlags,
} = require('discord.js');

const reminders = require('./utils/reminders');
const { checkTarget } = require('./utils/checks');

// The token is read from an environment variable, never written in the code.
const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('Missing DISCORD_TOKEN. Add it in your host\'s Env tab.');
  process.exit(1);
}

// Intents tell Discord which events the bot wants to receive.
// IMPORTANT: GuildMembers and MessageContent are "privileged". They must also be
// switched on in the Discord Developer Portal (Bot page), or the bot cannot log in.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  // Partials let the bot hear about messages and members it hasn't seen before.
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

// Read every .js file in a folder. A file can export one thing or a list of things.
// If one file is broken, the bot skips it and tells you which one.
function loadFolder(folder, handleItem) {
  const dir = path.join(__dirname, folder);
  if (!fs.existsSync(dir)) return 0;

  let count = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    try {
      const exported = require(path.join(dir, file));
      for (const item of Array.isArray(exported) ? exported : [exported]) {
        if (handleItem(item, file)) count++;
      }
    } catch (error) {
      console.error(`Could not load ${folder}/${file}:`, error);
    }
  }
  return count;
}

// Load every command.
client.commands = new Collection();
loadFolder('commands', (command, file) => {
  if (command && 'data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    return true;
  }
  console.warn(`Skipped ${file}: it needs both "data" and "execute".`);
  return false;
});

// Load every event (something the bot reacts to, like "a member joined").
const eventCount = loadFolder('events', (event, file) => {
  if (event && 'name' in event && 'execute' in event) {
    client.on(event.name, async (...args) => {
      try {
        await event.execute(...args);
      } catch (error) {
        console.error(`Error in event ${event.name}:`, error);
      }
    });
    return true;
  }
  console.warn(`Skipped ${file}: it needs both "name" and "execute".`);
  return false;
});
console.log(`Loaded ${eventCount} event(s).`);

// Runs once when the bot has logged in.
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Loaded ${client.commands.size} command(s).`);

  const commandData = [...client.commands.values()].map((c) =>
    typeof c.data.toJSON === 'function' ? c.data.toJSON() : c.data
  );

  try {
    if (process.env.GUILD_ID) {
      const guild = await readyClient.guilds.fetch(process.env.GUILD_ID);
      await guild.commands.set(commandData);
      console.log('Commands registered in your test server.');
    } else {
      await readyClient.application.commands.set(commandData);
      console.log('Commands registered globally.');
    }
  } catch (error) {
    console.error('Could not register commands:', error);
  }

  // Restart the timers for any saved reminders.
  reminders.init(readyClient);
});

// Commands that act on another person. Before any of them runs, make sure the
// person typing the command actually outranks the person they are targeting.
const TARGETING_COMMANDS = new Set(['kick', 'ban', 'timeout', 'untimeout', 'warn']);

// Runs every time someone uses a slash command.
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    if (interaction.inGuild() && TARGETING_COMMANDS.has(interaction.commandName)) {
      const problem = checkTarget(interaction, interaction.options.getMember('member'));
      if (problem) {
        return await interaction.reply({ content: problem, flags: MessageFlags.Ephemeral });
      }
    }

    await command.execute(interaction);
  } catch (error) {
    console.error(`Error in /${interaction.commandName}:`, error);

    const reply = {
      content: 'Something went wrong running that command.',
      flags: MessageFlags.Ephemeral,
    };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch (replyError) {
      console.error('Could not send the error message either:', replyError.message);
    }
  }
});

// Log unexpected errors instead of letting the whole bot crash.
process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
});

client.login(token);
