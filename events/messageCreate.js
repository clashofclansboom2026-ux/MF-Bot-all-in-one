const { Events, PermissionFlagsBits } = require('discord.js');
const { sendModLog } = require('../utils/modLog');

const SPAM_LIMIT = 5;
const SPAM_WINDOW_MS = 5000;
const TIMEOUT_MS = 60 * 1000;

const userMessages = new Map();
const processingUsers = new Set();

module.exports = {
  name: Events.MessageCreate,

  async execute(message) {
    if (!message.guild || message.author.bot || !message.member) return;

    const member = message.member;

    // Exempt administrators and moderators with Manage Messages.
    if (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageMessages)
    ) {
      return;
    }

    // Track each member separately in each channel.
    const key = `${message.guild.id}:${message.channel.id}:${message.author.id}`;
    const now = Date.now();

    const recent = (userMessages.get(key) || []).filter(
      entry => now - entry.timestamp < SPAM_WINDOW_MS
    );

    recent.push({ timestamp: now, message });
    userMessages.set(key, recent);

    if (recent.length < SPAM_LIMIT || processingUsers.has(key)) return;

    processingUsers.add(key);

    // Capture this burst and reset tracking so new messages can be counted.
    const
