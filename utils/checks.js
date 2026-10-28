
 // utils/checks.js - safety checks and small helpers shared by several features.

// Cut long text so it fits in a Discord message.
function clip(text, max) {
  text = String(text ?? '');
  if (!Number.isFinite(max) || max <= 0) return '';
  max = Math.floor(max);
  return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}${max > 3 ? '...' : ''}` : text;
}

// Pause for a moment (used to give Discord's audit log time to catch up).
const wait = (ms) => new Promise((resolve) => {
  const delay = Number.isFinite(ms) ? Math.max(0, Math.min(ms, 2147483647)) : 0;
  setTimeout(resolve, delay);
});

// Try to send someone a private message. Returns true/false, never crashes.
async function tryDM(user, text) {
  try {
    if (!user || typeof user.send !== 'function') return false;
    await user.send(text);
    return true;
  } catch {
    return false;
  }
}

// Safety check before one person acts on another (kick, ban, timeout, warn...).
// Returns a message if it is NOT allowed, or null if it is fine to go ahead.
function checkTarget(interaction, member) {
  if (!member) return null; // not in the server, nothing to compare

  const guild = interaction?.guild;
  const actor = interaction?.user;
  const botUser = interaction?.client?.user;

  if (!guild || typeof guild.ownerId !== 'string' || !actor?.id || !member?.id) {
    return 'I could not safely verify this moderation target. Please try again.';
  }

  if (member.id === actor.id) return "You can't do that to yourself.";
  if (botUser?.id && member.id === botUser.id) return "I'm not going to do that to myself.";
  if (member.id === guild.ownerId) return "You can't do that to the server owner.";

  const isOwner = actor.id === guild.ownerId;
  const targetPosition = member.roles?.highest?.position;

  if (!Number.isFinite(targetPosition)) {
    return 'I could not safely verify that member’s role position. Please try again.';
  }

  if (!isOwner) {
    // Resolve the acting member from the guild cache because interaction.member
    // may be a raw API object without roles.highest.
    const actorMember = guild.members?.cache?.get(actor.id);
    const actorPosition = actorMember?.roles?.highest?.position;

    if (!Number.isFinite(actorPosition)) {
      return 'I could not safely verify your role position. Please try again.';
    }

    if (targetPosition >= actorPosition) {
      return "Their top role is the same as or higher than yours, so you can't do that.";
    }
  }

  // The bot also has to outrank them, or Discord will refuse the action.
  const me = guild.members?.me;
  const botPosition = me?.roles?.highest?.position;

  if (!Number.isFinite(botPosition)) {
    return "I couldn't verify my role position. Please check my server permissions and try again.";
  }

  if (targetPosition >= botPosition) {
    return "Their top role is higher than mine, so I can't do that. Move my role above theirs in Server Settings > Roles.";
  }

  return null;
}

module.exports = { clip, wait, tryDM, checkTarget };
