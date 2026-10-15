// Warning commands: /warn, /warnings, /clearwarns
// Warnings are saved in data/warns.json, so they survive restarts.
// Every action also gets a case number (see utils/modCore.js).

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const store = require('../utils/store');
const { clip } = require('../utils/checks');
const { ACTIONS, hidden, defer, confirm, notifyUser, recordAction } = require('../utils/modCore');

const getList = (all, guildId, userId) => all[guildId]?.[userId] ?? [];

const needPerm = (interaction) =>
  interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)
    ? null
    : interaction.reply(hidden('You need the Moderate Members permission to use this command.'));

const warn = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Give a member a warning')
    .addUserOption((o) => o.setName('member').setDescription('Who to warn').setRequired(true))
    .addStringOption((o) =>
      o.setName('reason').setDescription('Why they are being warned').setMaxLength(500).setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
      return needPerm(interaction);
    }

    const user = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason', true);
    if (user.bot) return interaction.reply(hidden("You can't warn a bot."));

    await defer(interaction);

    // Save the warning.
    const all = store.read('warns', {});
    all[interaction.guildId] ??= {};
    all[interaction.guildId][user.id] ??= [];
    const entry = {
      reason,
      moderator: interaction.user.tag,
      moderatorId: interaction.user.id,
      at: Date.now(),
    };
    all[interaction.guildId][user.id].push(entry);
    store.write('warns', all);
    const total = all[interaction.guildId][user.id].length;

    const dmSent = await notifyUser(interaction.guild, user, 'warn', reason, [
      `**Total warnings:** ${total}`,
    ]);

    const number = await recordAction(interaction, {
      type: 'warn',
      user,
      reason,
      dmSent,
      fields: [{ name: 'Total warnings', value: total }],
    });

    // Remember which case this warning belongs to.
    const fresh = store.read('warns', {});
    const saved = fresh[interaction.guildId]?.[user.id];
    if (saved && saved.length) {
      saved[saved.length - 1].case = number;
      store.write('warns', fresh);
    }
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
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
      return needPerm(interaction);
    }

    const user = interaction.options.getUser('member', true);
    const list = getList(store.read('warns', {}), interaction.guildId, user.id);

    if (list.length === 0) {
      return interaction.reply(hidden(`**${user.tag}** has no warnings.`));
    }

    // Show the 10 most recent.
    const start = Math.max(0, list.length - 10);
    const lines = list.slice(start).map(
      (w, i) =>
        `**${start + i + 1}.** ${clip(w.reason, 150)}\n` +
        `By ${w.moderator} <t:${Math.floor(w.at / 1000)}:R>` +
        (w.case ? ` • Case #${w.case}` : '')
    );

    const embed = new EmbedBuilder()
      .setColor(ACTIONS.warn.color)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setTitle(`⚠️ ${list.length} warning(s)`)
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: start > 0 ? 'Showing the latest 10' : `User ID: ${user.id}` });

    await interaction.reply({ embeds: [embed], flags: 64 });
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
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
      return needPerm(interaction);
    }

    const user = interaction.options.getUser('member', true);
    const count = getList(store.read('warns', {}), interaction.guildId, user.id).length;

    if (count === 0) {
      return interaction.reply(hidden(`**${user.tag}** has no warnings to clear.`));
    }

    const sure = await confirm(
      interaction,
      `⚠️ Clear all **${count}** warning(s) for **${user.tag}**? This cannot be undone.`
    );
    if (!sure) return;

    const all = store.read('warns', {});
    delete all[interaction.guildId]?.[user.id];
    store.write('warns', all);

    await recordAction(interaction, {
      type: 'clearwarns',
      user,
      reason: 'Warnings cleared by a moderator',
      fields: [{ name: 'Warnings removed', value: count }],
    });
  },
};

// This file exports a list, so one file can hold several commands.
module.exports = [warn, warnings, clearwarns];
