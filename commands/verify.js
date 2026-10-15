// /verify - creates a verification panel in the current channel.

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const { setGuildConfig } = require('../utils/configStore');
const { roleProblem } = require('../utils/rolesafety');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Create a member verification panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption((option) =>
      option
        .setName('role')
        .setDescription('The role members receive after verification')
        .setRequired(true)
    ),

  async execute(interaction) {
    const hidden = (content) => ({
      content,
      flags: MessageFlags.Ephemeral,
    });

    if (!interaction.inGuild()) {
      return interaction.reply(
        hidden('Use this command inside your server.')
      );
    }

    if (
      !interaction.memberPermissions.has(
        PermissionFlagsBits.ManageGuild
      )
    ) {
      return interaction.reply(
        hidden('You need Manage Server permission to set up verification.')
      );
    }

    const role = interaction.options.getRole('role', true);
    const isOwner = interaction.user.id === interaction.guild.ownerId;

    const problem = roleProblem(role, interaction.guild);

    if (problem) {
      return interaction.reply(
        hidden(
          `I can't use **${role.name}** as the verification role because it ${problem}.`
        )
      );
    }

    if (
      !isOwner &&
      role.position >= interaction.member.roles.highest.position
    ) {
      return interaction.reply(
        hidden(
          'Your highest role must be above the verification role before you can set it up.'
        )
      );
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`Welcome to ${interaction.guild.name}`)
      .setDescription(
        'Complete this quick check to unlock the server.\n\n' +
        '1. Press **Verify** below.\n' +
        '2. Answer the simple addition question.\n' +
        `3. Receive the ${role} role when you pass.`
      )
      .setFooter({
        text: 'If a check expires, press Verify again for a new one.',
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify:start')
        .setLabel('Verify')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
    );

    // Save the role used by verification in this server.
    setGuildConfig(interaction.guildId, {
      verificationRoleId: role.id,
      verificationEnabled: true,
    });

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  },
};
