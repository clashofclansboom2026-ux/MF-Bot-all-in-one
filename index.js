// index.js - the main file of your bot.
// It logs in, loads every file in the "commands" folder, and runs them.
// To add a new command later, you only add a new file in "commands".

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Events,
  MessageFlags,
} = require('discord.js');

// The token is read from an environment variable, never written in the code.
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Missing DISCORD_TOKEN. Add it in your host\'s Env tab.');
  process.exit(1);
}

// "Intents" tell Discord what the bot wants to hear about.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Load every command file from the "commands" folder.
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`Skipped ${file}: it needs both "data" and "execute".`);
  }
}

// Runs once when the bot has logged in.
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Loaded ${client.commands.size} command(s).`);

  const commandData = [...client.commands.values()].map((c) => c.data);

  try {
    if (process.env.GUILD_ID) {
      // Registers commands in just your test server (shows up instantly).
      const guild = await readyClient.guilds.fetch(process.env.GUILD_ID);
      await guild.commands.set(commandData);
      console.log('Commands registered in your test server.');
    } else {
      // Registers commands everywhere the bot is (can take a while to appear).
      await readyClient.application.commands.set(commandData);
      console.log('Commands registered globally.');
    }
  } catch (error) {
    console.error('Could not register commands:', error);
  }
});

// Runs every time someone uses a slash command.
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error in /${interaction.commandName}:`, error);
    const reply = {
      content: 'Something went wrong running that command.',
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.login(token);
