
 // utils/rolesafety.js - decides which roles are safe to hand out with buttons.
// Self-role buttons must never let members grant themselves staff-level permissions.

const { PermissionFlagsBits: P } = require('discord.js');

// If a role has ANY of these powers, it can never be put on a button.
const POWERFUL = [
  P.Administrator,
  P.ManageGuild,
  P.ManageRoles,
  P.ManageChannels,
  P.ManageWebhooks,
  P.ManageMessages,
  P.ManageNicknames,
  P.ManageThreads,
  P.ManageEvents,
  P.KickMembers,
  P.BanMembers,
  P.ModerateMembers,
  P.MentionEveryone,
  P.ViewAuditLog,
].filter((permission) => permission !== undefined && permission !== null);

// Returns a short reason if the role is NOT allowed, or null if it is safe.
// Fail closed: missing or incomplete role data is never treated as safe.
function roleProblem(role, guild) {
  if (!role || typeof role !== 'object') {
    return 'could not be checked safely';
  }

  if (!guild || typeof guild.id !== 'string' || !guild.id) {
    return 'could not verify the server';
  }

  if (typeof role.id !== 'string' || !role.id) {
    return 'could not verify the role';
  }

  if (role.id === guild.id) return 'is @everyone';

  if (role.guild?.id && role.guild.id !== guild.id) {
    return 'belongs to a different server';
  }

  if (role.managed !== false && role.managed !== true) {
    return 'could not verify whether the role is managed';
  }

  if (role.managed) return 'belongs to a bot or integration';

  if (!role.permissions || typeof role.permissions.any !== 'function') {
    return 'could not check role permissions safely';
  }

  if (POWERFUL.length > 0 && role.permissions.any(POWERFUL)) {
    return 'has powerful permissions (staff-level)';
  }

  if (role.editable !== true) {
    return 'is above my own role, so I cannot give it out';
  }

  return null;
}

module.exports = { roleProblem };
