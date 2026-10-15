// /help - a clean help menu with a category dropdown.
// - Commands are clickable (tap one to put it in the chat box).
// - Admins also see a setup checklist on the home page.
// - Link buttons at the bottom: invite, support server, website.
// It finds your commands automatically, so new commands show up without edits.
// Commands a member can't use are hidden from their help menu.

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js');

const { getGuildConfig } = require('../utils/configStore');

// ======================= EDIT THESE =======================
// Paste your links between the quotes. Leave a link empty ('') to hide its button.
const SUPPORT_URL = 'https://discord.gg/8CFnUCNFPj';
const WEBSITE_URL = ''; // e.g. 'https://example.com'
// ==========================================================

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

// Permissions the bot needs to do its job (used by the checklist and invite link).
const BOT_PERMISSIONS = [
  [PermissionFlagsBits.ViewChannel, 'View Channels'],
  [PermissionFlagsBits.SendMessages, 'Send Messages'],
  [PermissionFlagsBits.EmbedLinks, 'Embed Links'],
  [PermissionFlagsBits.ReadMessageHistory, 'Read Message History'],
  [PermissionFlagsBits.AddReactions, 'Add Reactions'],
  [PermissionFlagsBits.ManageMessages, 'Manage Messages'],
  [PermissionFlagsBits.ManageRoles, 'Manage Roles'],
  [PermissionFlagsBits.KickMembers, 'Kick Members'],
  [PermissionFlagsBits.BanMembers, 'Ban Members'],
  [PermissionFlagsBits.ModerateMembers, 'Moderate Members'],
  [PermissionFlagsBits.ViewAuditLog, 'View Audit Log'],
];

// ---------- clickable commands ----------

// Discord needs each command's ID to make it clickable. We look the IDs up once
// and remember them for 10 minutes.
let idCache = null;

async function commandIds(client) {
  if (idCache && Date.now() - idCache.at < 10 * 60 * 1000) return idCache.map;

  try {
    const fetched = process.env.GUILD_ID
      ? await (await client.guilds.fetch(process.env.GUILD_ID)).commands.fetch()
      : await client.application.commands.fetch();
    const map = new Map(fetched.map((c) => [c.name, c.id]));
    idCache = { at: Date.now(), map };
    return map;
  } catch (error) {
    console.error('Could not look up command IDs for /help:', error.message);
    return new Map();
  }
}

// "config logs" -> a clickable </config logs:123>, or plain /config logs if unknown.
function mention(fullName, ids) {
  const id = ids.get(fullName.split(' ')[0]);
  return id ? `</${fullName}:${id}>` : `/${fullName}`;
}

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

// One entry per command, or one per subcommand (like /config logs).
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

// ---------- admin setup checklist ----------

function checklist(interaction, ids) {
  const guild = interaction.guild;
  let config = {};
  try {
    config = getGuildConfig(guild.id) ?? {};
  } catch {
    config = {};
  }

  const lines = [];

  // Mod log channel
  const logChannel = config.modLogChannelId ? guild.channels.cache.get(config.modLogChannelId) : null;
  if (logChannel) {
    lines.push(`✅ Mod log channel: ${logChannel}`);
  } else if (config.modLogChannelId) {
    lines.push(`❌ Your mod log channel was deleted. Pick a new one: ${mention('config logs', ids)}`);
  } else {
    lines.push(`❌ No mod log channel yet. Set one: ${mention('config logs', ids)}`);
  }

  // Anti-spam
  if (config.antiSpam) {
    const seconds = Math.round((config.antiSpam.windowMs ?? 0) / 1000);
    lines.push(`✅ Anti-spam: ${config.antiSpam.messages} messages in ${seconds}s`);
  } else {
    lines.push(`⚪ Anti-spam is using default settings. Change it: ${mention('config antispam', ids)}`);
  }

  // Bot permissions
  const me = guild.members.me;
  const missing = BOT_PERMISSIONS.filter(([flag]) => !me?.permissions.has(flag)).map(([, name]) => name);
  lines.push(
    missing.length
      ? `❌ I'm missing permissions: ${missing.join(', ')}`
      : '✅ I have all the permissions I need'
  );

  return lines.join('\n');
}

const isAdmin = (interaction) =>
  interaction.inGuild() && interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

// ---------- building the embeds ----------

function homeEmbed(interaction, pages, ids) {
  const total = pages.reduce((sum, page) => sum + page.commands.length, 0);

  const embed = new EmbedBuilder()
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
    .setFooter({ text: 'Tip: tap any command in the lists to use it.' });

  if (isAdmin(interaction)) {
    embed.addFields({ name: '🔧 Setup checklist', value: checklist(interaction, ids) });
  }

  return embed;
}

function categoryEmbed(page, ids) {
  const blocks = page.commands.flatMap(entries).map((e) => {
    const line = `${mention(e.name, ids)}${e.usage ? ` \`${e.usage}\`` : ''}`;
    return `${line}\n${e.description}`;
  });

  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${page.emoji} ${page.label}`)
    .setDescription(blocks.join('\n\n'))
    .setFooter({ text: '<required>  [optional]' });
}

// ---------- menu and link buttons ----------

function menuRow(pages, selected, disabled = false) {
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

function linkRow(client) {
  const bits = new PermissionsBitField(BOT_PERMISSIONS.map(([flag]) => flag)).bitfield;
  const invite =
    `https://discord.com/oauth2/authorize?client_id=${client.user.id}` +
    `&scope=bot%20applications.commands&permissions=${bits}`;

  const buttons = [
    new ButtonBuilder().setLabel('Invite me').setEmoji('➕').setStyle(ButtonStyle.Link).setURL(invite),
  ];
  if (SUPPORT_URL.startsWith('https://')) {
    buttons.push(new ButtonBuilder().setLabel('Support server').setEmoji('💬').setStyle(ButtonStyle.Link).setURL(SUPPORT_URL));
  }
  if (WEBSITE_URL.startsWith('https://')) {
    buttons.push(new ButtonBuilder().setLabel('Website').setEmoji('🌐').setStyle(ButtonStyle.Link).setURL(WEBSITE_URL));
  }

  return new ActionRowBuilder().addComponents(buttons);
}

// ---------- the command ----------

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('See everything the bot can do'),

  async execute(interaction) {
    const [pages, ids] = [buildPages(interaction), await commandIds(interaction.client)];
    const links = linkRow(interaction.client);

    await interaction.reply({
      embeds: [homeEmbed(interaction, pages, ids)],
      components: [menuRow(pages, 'home'), links],
      flags: MessageFlags.Ephemeral,
    });
    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id && i.isStringSelectMenu(),
      time: 120_000,
    });

    collector.on('collect', async (i) => {
      const page = pages.find((p) => p.id === i.values[0]);
      await i.update({
        embeds: [page ? categoryEmbed(page, ids) : homeEmbed(interaction, pages, ids)],
        components: [menuRow(pages, page ? page.id : 'home'), links],
      });
    });

    // After 2 minutes, grey out the menu so it's clear it has expired.
    collector.on('end', async () => {
      await interaction
        .editReply({ components: [menuRow(pages, 'home', true), links] })
        .catch(() => {});
    });
  },
};
