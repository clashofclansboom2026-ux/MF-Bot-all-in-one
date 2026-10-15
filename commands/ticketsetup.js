
const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const tickets = require('../utils/tickets');

const data = new SlashCommandBuilder()
  .setName('ticketsetup')
  .setDescription('Configure the ticket system.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName('category')
      .setDescription('Set the category where tickets are created.')
      .addChannelOption((o) =>
        o.setName('category')
          .setDescription('Ticket category')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('logs')
      .setDescription('Set the ticket logs and transcript channel.')
      .addChannelOption((o) =>
        o.setName('channel')
          .setDescription('Logs channel')
          .addChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement
          )
          .setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('staffrole')
      .setDescription('Add or remove a ticket-management role.')
      .addStringOption((o) =>
        o.setName('action')
          .setDescription('Add or remove')
          .setRequired(true)
          .addChoices(
            { name: 'Add role', value: 'add' },
            { name: 'Remove role', value: 'remove' }
          ))
      .addRoleOption((o) =>
        o.setName('role')
          .setDescription('Staff role')
          .setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('supportrole')
      .setDescription('Add or remove a role that sees new tickets.')
      .addStringOption((o) =>
        o.setName('action')
          .setDescription('Add or remove')
          .setRequired(true)
          .addChoices(
            { name: 'Add role', value: 'add' },
            { name: 'Remove role', value: 'remove' }
          ))
      .addRoleOption((o) =>
        o.setName('role')
          .setDescription('Support role')
          .setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('limit')
      .setDescription('Set the maximum open tickets per user.')
      .addIntegerOption((o) =>
        o.setName('amount')
          .setDescription('Maximum open tickets, from 1 to 10')
          .setMinValue(1)
          .setMaxValue(10)
          .setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('status')
      .setDescription('Show the current ticket configuration.'));

async function execute(interaction) {
  if (!interaction.inGuild()) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!interaction.memberPermissions?.has(
    PermissionFlagsBits.ManageGuild
  )) {
    return interaction.reply({
      content: 'You need Manage Server permission to configure tickets.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();
  const settings = tickets.getSettings(guildId);

  if (subcommand === 'category') {
    const category = interaction.options.getChannel('category', true);
    tickets.updateSettings(guildId, { categoryId: category.id });

    return interaction.reply({
      content: `Ticket category set to **${category.name}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'logs') {
    const channel = interaction.options.getChannel('channel', true);
    tickets.updateSettings(guildId, { logChannelId: channel.id });

    return interaction.reply({
      content: `Ticket logs and transcripts will use ${channel}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'staffrole' || subcommand === 'supportrole') {
    const action = interaction.options.getString('action', true);
    const role = interaction.options.getRole('role', true);
    const key = subcommand === 'staffrole'
      ? 'staffRoleIds'
      : 'supportRoleIds';

    const roles = Array.isArray(settings[key])
      ? [...settings[key]]
      : [];
    const exists = roles.includes(role.id);

    if (action === 'add' && !exists) {
      roles.push(role.id);
    } else if (action === 'remove' && exists) {
      roles.splice(roles.indexOf(role.id), 1);
    }

    tickets.updateSettings(guildId, { [key]: roles });

    const type = subcommand === 'staffrole' ? 'staff' : 'support';
    const result = action === 'add'
      ? (exists ? 'was already configured' : 'has been added')
      : (exists ? 'has been removed' : 'was not configured');

    return interaction.reply({
      content: `${role} ${result} as a ${type} role.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'limit') {
    const amount = interaction.options.getInteger('amount', true);
    tickets.updateSettings(guildId, { maxOpenPerUser: amount });

    return interaction.reply({
      content: `Maximum open tickets per user set to **${amount}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'status') {
    const current = tickets.getSettings(guildId);
    const roleList = (ids) =>
      ids?.length ? ids.map((id) => `<@&${id}>`).join(', ') : 'Not configured';

    return interaction.reply({
      content: [
        '**Ticket system configuration**',
        `**Ticket category:** ${current.categoryId ? `<#${current.categoryId}>` : 'Not configured'}`,
        `**Logs/transcripts:** ${current.logChannelId ? `<#${current.logChannelId}>` : 'Not configured'}`,
        `**Staff roles:** ${roleList(current.staffRoleIds)}`,
        `**Support roles:** ${roleList(current.supportRoleIds)}`,
        `**Maximum open tickets per user:** ${current.maxOpenPerUser ?? 3}`,
      ].join('\n'),
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = { data, execute };
