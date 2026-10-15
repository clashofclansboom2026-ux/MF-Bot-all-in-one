// /help - a clean help menu with a category dropdown.
// It finds your commands automatically, so new commands show up without edits.
// Commands a member can't use are hidden from their help menu.
// To move a command to another page, edit the CATEGORIES list below.

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');

const COLOR = 0x5865f2;

// Which commands go on which page. Anything not listed lands on an "Other" page.
const CATEGORIES = [
  {
    id: 'moderation',
    label: 'Moderation',
    emoji: '🛡️',
    description: 'Ban, kick, timeout, warnings and cases',
    commands: ['ban', 'kick', 'timeout', 'untimeout', 'unban', 'warn', 'warnings', 'clearwarns', 'clear', 'case', 'history'],
  },
  {
    id: 'setup',
    label: 'Server Setup',
    emoji: '⚙️',
    description: 'Log channel, anti-spam and role panels',
    commands: ['config', 'rolepanel'],
  },
  {
    id: 'levels',
    label: 'Levels',
    emoji: '🏆',
    description: 'XP, ranks and the leaderboard',
    commands: ['rank', 'leaderboard'],
  },
  {
    id: 'utility',
    label: 'Utility',
    emoji: '🧰',
    description: 'Polls, reminders and info commands',
    commands: ['poll', 'remind', 'serverinfo', 'userinfo', 'help'],
  },
];

// ---------- reading the commands ----------

const toJson = (command) =>
  typeof command.data.toJSON === 'function' ? command.data.toJSON() : command.data;

// Can this person use the command? (Uses the permission set on the command.)
function canUse(interaction, command) {
  const needed = toJson(command).default_member_permissions;
  if (!needed || !interaction.inGuild()) return true;
  return interaction.memberPermissions?.has(BigInt(needed)) ?? true;
}

// "<member> [reason]" - <> means required, [] means optional.
function usage(options = []) {
  return options
    .filter((o) => o.type > 2) // skip subcommands, keep normal options
    .map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`))
    .join(' ');
}

// One line per command, or one per subcommand (like /config logs).
function entries(command) {
  const json = toJson(command);
  const subs = (json.options ?? []).filter((o) => o.type === 1);
  if (subs.length) {
    return subs.map((s) => ({
      name: `${json.name} ${s.name}`,
      usage: usage(s.options),
      description: s.description,
    }));
  }
  return [{ name: json.name, usage: usage(json.options), description: json.description }];
}

// Sorts the commands this person can use into pages.
function buildPages(interaction) {
  const visible = [...interaction.client.commands.values()].filter((c) => canUse(interaction, c));
  const used = new Set();

  const pages = CATEGORIES.map((category) => {
    const commands = category.commands
      .map((name) => visible.find((c) => c.data.name === name))
      .filter(Boolean);
    commands.forEach((c) => used.add(c.data.name));
    return { ...category, commands };
  });

  const other = visible.filter((c) => !used.has(c.data.name));
  if (other.length) {
    pages.push({ id: 'other', label: 'Other', emoji: '📦', description: 'More commands', commands: other });
  }

  return pages.filter((page) => page.commands.length > 0);
}

// ---------- building the embeds ----------

function homeEmbed(interaction, pages) {
  const total = pages.reduce((sum, page) => sum + page.commands.length, 0);

  return new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({
      name: `${interaction.client.user.username} Help`,
      iconURL: interaction.client.user.displayAvatarURL(),
    })
    .setDescription(
      `Pick a category from the menu below to see its commands.\n` +
        `You can use **${total}** commands in this server.`
    )
    .addFields(
      pages.map((page) => ({
        name: `${page.emoji} ${page.label}`,
        value: `${page.description}\n*${page.commands.length} command${page.commands.length === 1 ? '' : 's'}*`,
        inline: true,
      }))
    )
    .setFooter({ text: 'Tip: type / in the chat to see commands as you type.' });
}

function categoryEmbed(page) {
  const blocks = page.commands.flatMap(entries).map((e) => {
    const line = `**/${e.name}**${e.usage ? ` \`${e.usage}\`` : ''}`;
    return `${line}\n${e.description}`;
  });

  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${page.emoji} ${page.label}`)
    .setDescription(blocks.join('\n\n'))
    .setFooter({ text: '<required>  [optional]' });
}

function menu(pages, selected, disabled = false) {
  const options = [
    { label: 'Home', value: 'home', emoji: '🏠', description: 'Back to the overview' },
    ...pages.map((page) => ({
      label: page.label,
      value: page.id,
      emoji: page.emoji,
      description: page.description,
    })),
  ].map((option) => ({ ...option, default: option.value === selected }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_menu')
      .setPlaceholder('Choose a category...')
      .setDisabled(disabled)
      .addOptions(options)
  );
}

// ---------- the command ----------

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('See everything the bot can do'),

  async execute(interaction) {
    const pages = buildPages(interaction);

    await interaction.reply({
      embeds: [homeEmbed(interaction, pages)],
      components: [menu(pages, 'home')],
      flags: MessageFlags.Ephemeral,
    });
    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: 120_000,
    });

    collector.on('collect', async (i) => {
      const choice = i.values[0];
      const page = pages.find((p) => p.id === choice);
      await i.update({
        embeds: [page ? categoryEmbed(page) : homeEmbed(interaction, pages)],
        components: [menu(pages, page ? page.id : 'home')],
      });
    });

    // After 2 minutes, grey out the menu so it's clear it has expired.
    collector.on('end', async () => {
      await interaction.editReply({ components: [menu(pages, 'home', true)] }).catch(() => {});
    });
  },
};
