// Warning commands: /warn, /warnings, /clearwarns
// Warnings are saved in data/warns.json, so they survive restarts.

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const store = require('../utils/store');
const { sendModLog } = require('../utils/modLog');
const { tryDM, clip } = require('../utils/checks');

const hidden = (content) => ({ content, flags: MessageFlags.Ephemeral });
const getList = (all, guildId, userId) => all[guildId]?.[userId] ?? [];

const warn = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Give a member a warning')
    .addUserOption((o) =>
      o.setName('member').setDescription('Who to warn').setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName('reason')
        .setDescription('Why they are being warned')
        .setMaxLength(500)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));

    const user = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason', true);
    if (user.bot) return interaction.reply(hidden("You can't warn a bot."));

    const all = store.read('warns', {});
    all[interaction.guildId] ??= {};
    all[interaction.guildId][user.id] ??= [];
    all[interaction.guildId][user.id].push({
      reason,
      moderator: interaction.user.tag,
      moderatorId: interaction.user.id,
      at: Date.now(),
    });
    store.write('warns', all);
    const total = all[interaction.guildId][user.id].length;

    const dmSent = await tryDM(
      user,
      `⚠️ You were warned in **${interaction.guild.name}**.\nReason: ${reason}`
    );

    await sendModLog(interaction.guild, {
      title: 'Member Warned',
      description:
        `**Member:** ${user.tag} (${user.id})\n` +
        `**Moderator:** ${interaction.user.tag}\n` +
        `**Reason:** ${reason}\n` +
        `**Total warnings:** ${total}`,
    });

    await interaction.reply(
      hidden(
        `Warned **${user.tag}** (warning #${total}).\nReason: ${reason}\n` +
          (dmSent ? 'I sent them a DM.' : "I couldn't DM them (their DMs may be closed).")
      )
    );
  },
};

const warnings = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription("See a member's warnings")
    .addUserOption((o) =>
      o.setName('member').setDescription('Whose warnings to show').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));

    const user = interaction.options.getUser('member', true);
    const list = getList(store.read('warns', {}), interaction.guildId, user.id);

    if (list.length === 0) {
      return interaction.reply(hidden(`**${user.tag}** has no warnings.`));
    }

    // Show the 10 most recent.
    const start = Math.max(0, list.length - 10);
    const lines = list
      .slice(start)
      .map(
        (w, i) =>
          `**${start + i + 1}.** ${clip(w.reason, 150)} - by ${w.moderator} <t:${Math.floor(w.at / 1000)}:R>`
      );

    await interaction.reply(
      hidden(
        `**${user.tag}** has ${list.length} warning(s)` +
          (start > 0 ? ` (showing the latest 10)` : '') +
          `:\n${lines.join('\n')}`
      )
    );
  },
};

const clearwarns = {
  data: new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription("Remove all of a member's warnings")
    .addUserOption((o) =>
      o.setName('member').setDescription('Whose warnings to clear').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));

    const user = interaction.options.getUser('member', true);
    const all = store.read('warns', {});
    const count = getList(all, interaction.guildId, user.id).length;

    if (count === 0) {
      return interaction.reply(hidden(`**${user.tag}** has no warnings to clear.`));
    }

    delete all[interaction.guildId][user.id];
    store.write('warns', all);

    await sendModLog(interaction.guild, {
      title: 'Warnings Cleared',
      description:
        `**Member:** ${user.tag} (${user.id})\n` +
        `**Moderator:** ${interaction.user.tag}\n` +
        `**Warnings removed:** ${count}`,
    });

    await interaction.reply(hidden(`Cleared ${count} warning(s) for **${user.tag}**.`));
  },
};

// This file exports a list, so one file can hold several commands.
module.exports = [warn, warnings, clearwarns];
