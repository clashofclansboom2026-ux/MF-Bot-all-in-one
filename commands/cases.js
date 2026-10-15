// Case lookup commands: /case and /history

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { clip } = require('../utils/checks');
const { ACTIONS, hidden, getCases } = require('../utils/modCore');

const stamp = (ms) => Math.floor(ms / 1000);

const caseCommand = {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Look up a moderation case by its number')
    .addIntegerOption((o) =>
      o.setName('number').setDescription('The case number').setMinValue(1).setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply(hidden('You need the Moderate Members permission to use this command.'));
    }

    const number = interaction.options.getInteger('number', true);
    const found = getCases(interaction.guildId).find((c) => c.number === number);
    if (!found) return interaction.reply(hidden(`I can't find case #${number}.`));

    const action = ACTIONS[found.type] ?? { label: found.type, emoji: '📄', color: 0x5865f2 };
    const embed = new EmbedBuilder()
      .setColor(action.color)
      .setTitle(`${action.emoji} Case #${found.number} | ${action.label}`)
      .addFields(
        { name: 'Member', value: `${found.userTag}\n(${found.userId})`, inline: true },
        { name: 'Moderator', value: `${found.modTag}`, inline: true },
        { name: 'When', value: `<t:${stamp(found.at)}:F>`, inline: true },
        { name: 'Reason', value: clip(found.reason, 1024) }
      );
    if (found.extra) embed.addFields({ name: 'Details', value: clip(found.extra, 1024) });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

const history = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription("See a member's moderation history")
    .addUserOption((o) =>
      o.setName('member').setDescription('Whose history to show').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply(hidden('You need the Moderate Members permission to use this command.'));
    }

    const user = interaction.options.getUser('member', true);
    const list = getCases(interaction.guildId).filter((c) => c.userId === user.id);
    if (list.length === 0) {
      return interaction.reply(hidden(`**${user.tag}** has no moderation history.`));
    }

    const recent = list.slice(-10).reverse();
    const lines = recent.map((c) => {
      const action = ACTIONS[c.type] ?? { label: c.type, emoji: '📄' };
      return `**#${c.number}** ${action.emoji} ${action.label} - ${clip(c.reason, 70)} <t:${stamp(c.at)}:R>`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setTitle(`Moderation history (${list.length} case${list.length === 1 ? '' : 's'})`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: list.length > 10 ? 'Showing the latest 10. Use /case for details.' : 'Use /case for details.' });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

module.exports = [caseCommand, history];
