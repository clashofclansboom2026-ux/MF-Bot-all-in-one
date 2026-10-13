
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete a number of recent messages')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');

    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: 'You need the Manage Messages permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);

      await interaction.reply({
        content: `Deleted ${deleted.size} message(s). Messages older than 14 days cannot be bulk deleted.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Error in /clear:', error);

      const reply = {
        content: 'I could not delete those messages. Check my permissions and try again.',
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  },
};
