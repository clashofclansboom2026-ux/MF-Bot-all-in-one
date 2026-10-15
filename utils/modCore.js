// utils/modCore.js - shared tools used by all the moderation commands:
// case numbers, DMs to the member, mod-log entries, public embeds,
// confirm buttons and time durations like "30m" or "2h".

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

// A reply only the person who typed the command can see.
const hidden = (content) => ({ content, flags: MessageFlags.Ephemeral });

// Tell Discord "I'm working on it" (only the moderator sees it).
const defer = (interaction) => interaction.deferReply({ flags: MessageFlags.Ephemeral });

// Look and wording for every kind of action.
const ACTIONS = {
  ban: { label: 'Ban', emoji: '🔨', color: 0xed4245, past: 'was banned' },
  unban: { label: 'Unban', emoji: '🔓', color: 0x57f287, past: 'was unbanned' },
  kick: { label: 'Kick', emoji: '👢', color: 0xe67e22, past: 'was kicked' },
  timeout: { label: 'Timeout', emoji: '⏳', color: 0xfee75c, past: 'was timed out' },
  untimeout: { label: 'Timeout Removed', emoji: '🔊', color: 0x57f287, past: 'had their timeout removed' },
  warn: { label: 'Warning', emoji: '⚠️', color: 0xfee75c, past: 'was warned' },
  clearwarns: { label: 'Warnings Cleared', emoji: '🧹', color: 0x57f287, past: 'had their warnings cleared' },
};

// ---------- durations ----------

const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };

// "30m" -> milliseconds. "1h30m" works too. A plain number means minutes.
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

// milliseconds -> "1d 2h 5m"
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

// ---------- cases ----------

// Saves a numbered case in data/cases.json and returns its number.
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

// ---------- messages ----------

// The public embed everyone in the channel sees.
function caseEmbed(type, number, user, moderator, reason, fields = []) {
  const action = ACTIONS[type];
  return new EmbedBuilder()
    .setColor(action.color)
    .setAuthor({ name: `${action.emoji} ${action.label}` })
    .setDescription(`**${user.tag}** ${action.past}.`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: 'Moderator', value: `${moderator}`, inline: true },
      ...fields.map((f) => ({ name: f.name, value: String(f.value), inline: true })),
      { name: 'Reason', value: clip(reason, 1024) }
    )
    .setFooter({ text: `Case #${number} • User ID: ${user.id}` })
    .setTimestamp();
}

// Sends a private message to the member. Returns true if it was delivered.
async function notifyUser(guild, user, type, reason, lines = []) {
  const action = ACTIONS[type];
  const embed = new EmbedBuilder()
    .setColor(action.color)
    .setTitle(`${action.emoji} ${action.label}`)
    .setDescription(
      [`**Server:** ${guild.name}`, ...lines, `**Reason:** ${clip(reason, 1000)}`].join('\n')
    )
    .setTimestamp();
  return tryDM(user, { embeds: [embed] });
}

// Does everything that should happen AFTER an action worked:
// saves the case, writes the mod log, tells the moderator, posts the public embed.
async function recordAction(interaction, { type, user, reason, fields = [], dmSent }) {
  const number = createCase(interaction.guildId, {
    type,
    userId: user.id,
    userTag: user.tag,
    modId: interaction.user.id,
    modTag: interaction.user.tag,
    reason,
    extra: fields.map((f) => `${f.name}: ${f.value}`).join(' | '),
  });

  const action = ACTIONS[type];
  await sendModLog(interaction.guild, {
    title: `${action.emoji} ${action.label} | Case #${number}`,
    color: action.color,
    description: [
      `**Member:** ${user.tag} (${user.id})`,
      `**Moderator:** ${interaction.user.tag} (${interaction.user.id})`,
      ...fields.map((f) => `**${f.name}:** ${f.value}`),
      `**Reason:** ${reason}`,
    ].join('\n'),
  });

  let note = `✅ Done. Case #${number} created.`;
  if (dmSent === true) note += '\nI sent them a DM.';
  if (dmSent === false) note += "\nI couldn't DM them (their DMs may be closed).";
  await interaction.editReply({ content: note, components: [] });

  try {
    await interaction.followUp({
      embeds: [caseEmbed(type, number, user, interaction.user, reason, fields)],
    });
  } catch (error) {
    console.error('Could not post the public embed:', error.message);
  }

  return number;
}

// ---------- confirm buttons ----------

// Shows "Confirm / Cancel" buttons. Returns true only if the moderator confirms.
// After this, answer with interaction.editReply (the reply already exists).
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
