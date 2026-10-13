// /rolepanel - posts a message with buttons. Members press a button to get a role,
// and press it again to remove it. No website needed.

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const { roleProblem } = require('../utils/rolesafety');
const { clip } = require('../utils/checks');

const MAX_ROLES = 10; // 2 rows of 5 buttons

const builder = new SlashCommandBuilder()
  .setName('rolepanel')
  .setDescription('Post a message with buttons so members can pick their own roles')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addStringOption((o) =>
    o.setName('title').setDescription('Title of the panel, e.g. Pick your roles').setMaxLength(100).setRequired(true)
  )
  .addRoleOption((o) => o.setName('role1').setDescription('First role').setRequired(true));

for (let n = 2; n <= MAX_ROLES; n++) {
  builder.addRoleOption((o) => o.setName(`role${n}`).setDescription(`Role ${n} (optional)`));
}
builder.addStringOption((o) =>
  o.setName('description').setDescription('Extra text under the title (optional)').setMaxLength(300)
);

module.exports = {
  data: builder,

  async execute(interaction) {
    const hidden = (content) => ({ content, flags: MessageFlags.Ephemeral });
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));

    // Collect the chosen roles (no duplicates).
    const roles = new Map();
    for (let n = 1; n <= MAX_ROLES; n++) {
      const role = interaction.options.getRole(`role${n}`);
      if (role) roles.set(role.id, role);
    }

    // Safety checks: every role must be safe, and you must outrank it yourself.
    const isOwner = interaction.user.id === interaction.guild.ownerId;
    const problems = [];
    for (const role of roles.values()) {
      const why =
        roleProblem(role, interaction.guild) ??
        (!isOwner && role.position >= interaction.member.roles.highest.position
          ? 'is the same as or higher than your own top role'
          : null);
      if (why) problems.push(`**${role.name}** ${why}`);
    }
    if (problems.length) {
      return interaction.reply(hidden(`I can't make this panel:\n- ${problems.join('\n- ')}`));
    }

    const list = [...roles.values()];
    const description = interaction.options.getString('description');
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(interaction.options.getString('title', true))
      .setDescription(
        (description ? `${description}\n\n` : '') +
          'Press a button to get a role. Press it again to remove it.\n\n' +
          list.map((r) => `• ${r}`).join('\n')
      );

    // Up to 5 buttons per row.
    const rows = [];
    for (let i = 0; i < list.length; i += 5) {
      rows.push(
        new ActionRowBuilder().addComponents(
          list.slice(i, i + 5).map((role) =>
            new ButtonBuilder()
              .setCustomId(`rr:${role.id}`)
              .setLabel(clip(role.name, 80))
              .setStyle(ButtonStyle.Secondary)
          )
        )
      );
    }

    await interaction.reply({ embeds: [embed], components: rows });
  },
};
