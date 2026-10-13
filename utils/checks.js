// utils/checks.js - safety checks and small helpers shared by several features.

// Cut long text so it fits in a Discord message.
function clip(text, max) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

// Pause for a moment (used to give Discord's audit log time to catch up).
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Try to send someone a private message. Returns true/false, never crashes.
async function tryDM(user, text) {
  try {
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
  if (member.id === interaction.user.id) return "You can't do that to yourself.";
  if (member.id === interaction.client.user.id) return "I'm not going to do that to myself.";
  if (member.id === interaction.guild.ownerId) return "You can't do that to the server owner.";

  const isOwner = interaction.user.id === interaction.guild.ownerId;
  if (!isOwner && member.roles.highest.position >= interaction.member.roles.highest.position) {
    return "Their top role is the same as or higher than yours, so you can't do that.";
  }
  return null;
}

module.exports = { clip, wait, tryDM, checkTarget };
