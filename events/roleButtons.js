// events/roleButtons.js - runs when someone presses a button on a /rolepanel.
// The role is stored inside the button itself, so panels keep working after
// restarts and there is nothing to save.

const { Events, MessageFlags } = require('discord.js');
const { roleProblem } = require('../utils/rolesafety');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() || !interaction.customId.startsWith('rr:')) return;

    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (!interaction.inGuild()) return;

    const role = interaction.guild.roles.cache.get(interaction.customId.slice(3));
    if (!role) return reply('That role no longer exists. Ask a moderator to remake the panel.');

    // Check again now: the role's powers may have changed since the panel was made.
    const problem = roleProblem(role, interaction.guild);
    if (problem) return reply(`I can't give out **${role.name}** because it ${problem}.`);

    try {
      if (interaction.member.roles.cache.has(role.id)) {
        await interaction.member.roles.remove(role, 'Role panel button');
        await reply(`Removed **${role.name}**.`);
      } else {
        await interaction.member.roles.add(role, 'Role panel button');
        await reply(`You now have **${role.name}**.`);
      }
    } catch (error) {
      console.error('Role panel error:', error);
      await reply('I could not change that role. A moderator needs to check my permissions.');
    }
  },
};
