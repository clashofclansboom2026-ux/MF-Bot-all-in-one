// utils/rolesafety.js - decides which roles are safe to hand out with buttons.
// Without this, a button for an Admin role would let anyone make themselves admin.

const { PermissionFlagsBits: P } = require('discord.js');

// If a role has ANY of these powers, it can never be put on a button.
const POWERFUL = [
  P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.ManageWebhooks,
  P.ManageMessages, P.ManageNicknames, P.ManageThreads, P.ManageEvents,
  P.KickMembers, P.BanMembers, P.ModerateMembers, P.MentionEveryone, P.ViewAuditLog,
].filter(Boolean);

// Returns a short reason if the role is NOT allowed, or null if it is fine.
function roleProblem(role, guild) {
  if (role.id === guild.id) return 'is @everyone';
  if (role.managed) return 'belongs to a bot or integration';
  if (role.permissions.any(POWERFUL)) return 'has powerful permissions (staff-level)';
  if (!role.editable) return 'is above my own role, so I cannot give it out';
  return null;
}

module.exports = { roleProblem };
