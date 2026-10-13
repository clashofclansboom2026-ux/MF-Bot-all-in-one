// index.js - the main file of your bot.
// Phase 2: the bot comes online and answers /ping.

const { Client, GatewayIntentBits, Events } = require('discord.js');

// The token is read from an environment variable, never written in the code.
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Missing DISCORD_TOKEN. Add it in your host\'s Variables tab.');
  process.exit(1);
}

// "Intents" tell Discord what the bot wants to hear about.
// Guilds is enough for slash commands.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// The list of slash commands the bot has. We will add more here later.
const commands = [
  { name: 'ping', description: 'Check that the bot is alive' },
];

// Runs once when the bot has logged in.
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  try {
    if (process.env.GUILD_ID) {
      // Registers commands in just your test server (shows up instantly).
      const guild = await readyClient.guilds.fetch(process.env.GUILD_ID);
      await guild.commands.set(commands);
      console.log('Commands registered in your test server.');
    } else {
      // Registers commands everywhere the bot is (can take a while to appear).
      await readyClient.application.commands.set(commands);
      console.log('Commands registered globally.');
    }
  } catch (error) {
    console.error('Could not register commands:', error);
  }
});

// Runs every time someone uses a slash command.
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong!');
  }
});

client.login(token);
