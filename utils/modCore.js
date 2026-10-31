
// utils/modCore.js - shared moderation helpers, case storage and message layouts.

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const store = require('./store');
const { sendModLog } = require('./modLog');
const { clip, tryDM } = require('./checks');

const hidden = (content) => ({ content, flags: MessageFlags.Ephemeral });
const defer = (interaction) => interaction.deferReply({ flags: MessageFlags.Ephemeral });

const ACTIONS = {
  ban: { label: 'Ban', heading: 'MEMBER BANNED', emoji: '🔨', color: 0xed4245, past: 'was banned' },
  unban: { label: 'Unban', heading: 'BAN REMOVED', emoji: '🔓', color: 0x57f287, past: 'was unbanned' },
  kick: { label: 'Kick', heading: 'MEMBER KICKED', emoji: '👢', color: 0xe67e22, past: 'was kicked' },
  timeout: { label: 'Timeout', heading: 'MEMBER TIMED OUT', emoji: '⏳', color: 0xfee75c, past: 'was timed out' },
  untimeout: { label: 'Timeout Removed', heading: 'TIMEOUT REMOVED', emoji: '🔊', color: 0x57f287, past: 'had their timeout removed' },
  warn: { label: 'Warning', heading: 'MEMBER WARNED', emoji: '⚠️', color: 0xfee75c, past: 'was warned' },
  clearwarns: { label: 'Warnings Cleared', heading: 'WARNINGS CLEARED', emoji: '🧹', color: 0x57f287, past: 'had their warnings cleared' },
};

const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };

function parseDuration(text) {
  const cleaned = String(text).toLowerCase().replace(/\s+/g, '');
  if (/^\d+$/.test(cleaned)) return Number(cleaned) * UNITS.m;
  if (!/^(\d+[smhdw])+$/.test(cleaned)) return null;

  let total = 0;
  for (const [, amount, unit] of cleaned.matchAll(/(\d+)([smhdw])/g)) {
    total += Number(amount) * UNITS[unit];
  }
  return total;
}

function formatDuration(ms) {
  let left = Math.round(ms / 1000);
  const parts = [];
  for (const [name, seconds] of [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]]) {
    const amount = Math.floor(left / seconds);
    if (amount) {
      parts.push(`${amount}${name}`);
      left -= amount * seconds;
    }
  }
  return parts.join(' ') || '0s';
}

function createCase(guildId, entry) {
  const all = store.read('cases', {});
  all[guildId] ??= { next: 1, list: [] };
  const number = all[guildId].next++;
  all[guildId].list.push({ number, at: Date.now(), ...entry });
  store.write('cases', all);
  return number;
}

function getCases(guildId) {
  return store.read('cases', {})[guildId]?.list ?? [];
}

// Build a consistent emoji-based breakdown of the action.
function buildDetailLines(type, fields, dmSent) {
  const icons = {
    Duration: '⏱️',
    'Messages deleted': '🗑️',
    'Total warnings': '📊',
    'Warnings removed': '🧹',
  };

  const lines = fields.map((field) => {
    const name = String(field.name || 'Detail');
    const value = String(field.value ?? 'Not specified');
    const icon = icons[name] || '📌';
    return `${icon} **${name}:** ${value}`;
  });

  // Only show DM status when delivery was actually attempted.
  if (dmSent === true) lines.push('✉️ **DM notification:** 🟩 Delivered');
  if (dmSent === false) lines.push('✉️ **DM notification:** 🟥 Could not deliver');

  if (type === 'ban' && !fields.some((field) => field.name === 'Messages deleted')) {
    lines.push('🗑️ **Message deletion:** ⬜ Not specified');
  }

  return lines;
}

function caseEmbed(type, number, user, moderator, reason, fields = [], dmSent) {
  const action = ACTIONS[type] || ACTIONS.warn;
  const detailLines = buildDetailLines(type, fields, dmSent);

  const description = [
    `👤 **Member:** ${user}`,
    `🛡️ **Moderator:** ${moderator}`,
    ...detailLines,
    `📝 **Reason:** ${clip(reason || 'No reason provided', 900)}`,
  ].join('\n');

  return new EmbedBuilder()
    .setColor(action.color)
    .setAuthor({ name: 'MF BOT • MODERATION CASE', iconURL: moderator.displayAvatarURL() })
    .setTitle(`${action.emoji} ${action.heading}`)
    .setDescription(description.slice(0, 4000))
    .setThumbnail(user.displayAvatarURL())
    .setFooter({ text: `CASE #${number} • MF Bot Moderation` })
    .setTimestamp();
}

async function notifyUser(guild, user, type, reason, lines = []) {
  const action = ACTIONS[type] || ACTIONS.warn;
  const embed = new EmbedBuilder()
    .setColor(action.color)
    .setAuthor({ name: `${guild.name} • MODERATION NOTICE` })
    .setTitle(`${action.emoji} ${action.heading}`)
    .setDescription(
      [`A moderation action has been taken against you in **${guild.name}**.`, ...lines, `📝 **Reason:** ${clip(reason || 'No reason provided', 1000)}`].join('\n')
    )
    .setFooter({ text: 'MF Bot Moderation' })
    .setTimestamp();

  return tryDM(user, { embeds: [embed] });
}

async function recordAction(interaction, { type, user, reason, fields = [], dmSent }) {
  const number = createCase(interaction.guildId, {
    type,
    userId: user.id,
    userTag: user.tag,
    modId: interaction.user.id,
    modTag: interaction.user.tag,
    reason,
    extra: fields.map((field) => `${field.name}: ${field.value}`).join(' | '),
  });

  const action = ACTIONS[type] || ACTIONS.warn;
  const detailLines = buildDetailLines(type, fields, dmSent);

  const logDescription = [
    `👤 **Member:** ${user.tag}`,
    `🛡️ **Moderator:** ${interaction.user.tag}`,
    ...detailLines,
    `📝 **Reason:** ${clip(reason || 'No reason provided', 900)}`,
  ].join('\n');

  await sendModLog(interaction.guild, {
    title: `${action.emoji} ${action.heading} • CASE #${number}`,
    color: action.color,
    description: logDescription.slice(0, 4000),
    footer: `Case #${number} • ${interaction.guild.name}`,
  });

  let note = `✅ Done. Case #${number} created.`;
  if (dmSent === true) note += '\nI sent them a DM.';
  if (dmSent === false) note += "\nI couldn't DM them (their DMs may be closed).";
  await interaction.editReply({ content: note, components: [] });

  try {
    await interaction.followUp({
      embeds: [caseEmbed(type, number, user, interaction.user, reason, fields, dmSent)],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error('Could not post the public embed:', error.message);
  }

  return number;
}

async function confirm(interaction, question) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mc_yes_${interaction.id}`)
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`mc_no_${interaction.id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({
    content: question,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
  const message = await interaction.fetchReply();

  try {
    const click = await message.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id,
      time: 30_000,
    });

    if (click.customId.startsWith('mc_yes_')) {
      await click.update({ content: 'Working on it...', components: [] });
      return true;
    }
    await click.update({ content: 'Cancelled. Nothing was done.', components: [] });
    return false;
  } catch {
    await interaction
      .editReply({ content: 'Timed out. Nothing was done.', components: [] })
      .catch(() => {});
    return false;
  }
}

module.exports = {
  ACTIONS,
  hidden,
  defer,
  parseDuration,
  formatDuration,
  createCase,
  getCases,
  caseEmbed,
  notifyUser,
  recordAction,
  confirm,
};
