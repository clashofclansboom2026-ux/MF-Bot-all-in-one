// Handy commands: /poll, /remind, /serverinfo, /userinfo

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const reminders = require('../utils/reminders');
const polls = require('../utils/polls');

const hidden = (content) => ({ content, flags: MessageFlags.Ephemeral });
const stamp = (ms) => Math.floor(ms / 1000);
const COLOR = 0x5865f2;

// A row of link buttons. Skips any that have no link.
function linkButtons(links) {
  const buttons = links
    .filter(([, url]) => url)
    .map(([label, url]) =>
      new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url)
    );
  return buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
}

// ---------- /poll ----------

const MIN_POLL_MS = 60 * 1000; // 1 minute
const MAX_POLL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const pollBuilder = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Start a poll that people vote on with buttons')
  .addStringOption((o) =>
    o.setName('question').setDescription('What is the poll about?').setMaxLength(200).setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('option1').setDescription('First choice').setMaxLength(100).setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('option2').setDescription('Second choice').setMaxLength(100).setRequired(true)
  );

for (let n = 3; n <= 10; n++) {
  pollBuilder.addStringOption((o) =>
    o.setName(`option${n}`).setDescription(`Choice ${n} (optional)`).setMaxLength(100)
  );
}

pollBuilder
  .addStringOption((o) =>
    o
      .setName('duration')
      .setDescription('How long it runs, e.g. 30m, 2h, 1d (max 7d). Leave empty to end it yourself.')
  )
  .addBooleanOption((o) =>
    o.setName('multiple').setDescription('Let people pick more than one option')
  );

const poll = {
  data: pollBuilder,

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));

    const question = interaction.options.getString('question', true);
    const options = [];
    for (let n = 1; n <= 10; n++) {
      const text = interaction.options.getString(`option${n}`)?.trim();
      if (text) options.push(text);
    }

    // Duplicate choices would make the buttons confusing.
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      return interaction.reply(hidden('Each choice has to be different.'));
    }

    let endsAt = null;
    const durationText = interaction.options.getString('duration');
    if (durationText) {
      const ms = reminders.parseDuration(durationText);
      if (ms === null) {
        return interaction.reply(hidden("I don't understand that time. Try 30m, 2h, 1d or 1h30m."));
      }
      if (ms < MIN_POLL_MS) return interaction.reply(hidden('A poll has to run for at least 1 minute.'));
      if (ms > MAX_POLL_MS) return interaction.reply(hidden('A poll can run for 7 days at most.'));
      endsAt = Date.now() + ms;
    }

    const newPoll = {
      question,
      options,
      multiple: interaction.options.getBoolean('multiple') ?? false,
      creatorId: interaction.user.id,
      creatorName: interaction.user.username,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      endsAt,
      ended: false,
      votes: {},
    };

    await interaction.reply(polls.render(newPoll));
    const message = await interaction.fetchReply();
    polls.save(message.id, newPoll, interaction.client);
  },
};

// ---------- /remind ----------

const remind = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Get a reminder later')
    .addStringOption((o) =>
      o.setName('time').setDescription('When? Examples: 10m, 2h, 1d, 1h30m').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('message').setDescription('What should I remind you about?').setMaxLength(500).setRequired(true)
    ),

  async execute(interaction) {
    const ms = reminders.parseDuration(interaction.options.getString('time', true));
    const message = interaction.options.getString('message', true);

    if (ms === null) {
      return interaction.reply(
        hidden("I don't understand that time. Try something like 10m, 2h, 1d or 1h30m.")
      );
    }
    if (ms < reminders.MIN_MS) return interaction.reply(hidden('Pick at least 5 seconds.'));
    if (ms > reminders.MAX_MS) return interaction.reply(hidden('Pick 24 days or less.'));

    const reminder = reminders.add(interaction.client, {
      userId: interaction.user.id,
      channelId: interaction.channelId,
      message,
      ms,
    });

    await interaction.reply(
      hidden(`⏰ Okay! I'll remind you <t:${stamp(reminder.time)}:R>: ${message}`)
    );
  },
};

// ---------- /serverinfo ----------

const VERIFICATION = ['None', 'Low', 'Medium', 'High', 'Very high'];

const serverinfo = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show information about this server'),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));

    const guild = interaction.guild;
    const owner = await guild.fetchOwner().catch(() => null);

    // Count the channels by type.
    const channels = guild.channels.cache;
    const count = (...types) => channels.filter((c) => types.includes(c.type)).size;
    const text = count(ChannelType.GuildText, ChannelType.GuildAnnouncement);
    const voice = count(ChannelType.GuildVoice, ChannelType.GuildStageVoice);
    const forums = count(ChannelType.GuildForum);
    const categories = count(ChannelType.GuildCategory);

    const icon = guild.iconURL({ size: 1024 });
    const banner = guild.bannerURL({ size: 1024 });

    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(guild.name)
      .addFields(
        { name: '👑 Owner', value: owner ? `${owner.user}` : 'Unknown', inline: true },
        { name: '👥 Members', value: guild.memberCount.toLocaleString(), inline: true },
        {
          name: '📅 Created',
          value: `<t:${stamp(guild.createdTimestamp)}:D>\n<t:${stamp(guild.createdTimestamp)}:R>`,
          inline: true,
        },
        {
          name: `💬 Channels (${text + voice + forums})`,
          value:
            `Text: **${text}**\nVoice: **${voice}**` +
            (forums ? `\nForums: **${forums}**` : '') +
            `\nCategories: **${categories}**`,
          inline: true,
        },
        {
          name: '🎭 Roles & Emoji',
          value:
            `Roles: **${Math.max(0, guild.roles.cache.size - 1)}**\n` +
            `Emojis: **${guild.emojis.cache.size}**\n` +
            `Stickers: **${guild.stickers.cache.size}**`,
          inline: true,
        },
        {
          name: '🚀 Boosts',
          value: `Level **${guild.premiumTier}**\n**${guild.premiumSubscriptionCount ?? 0}** boost(s)`,
          inline: true,
        },
        {
          name: '🛡️ Security',
          value: `Verification: **${VERIFICATION[guild.verificationLevel] ?? 'Unknown'}**`,
          inline: false,
        }
      )
      .setFooter({ text: `Server ID: ${guild.id}` });

    if (guild.description) embed.setDescription(guild.description);
    if (icon) embed.setThumbnail(icon);
    if (banner) embed.setImage(banner);

    await interaction.reply({
      embeds: [embed],
      components: linkButtons([
        ['Server icon', icon],
        ['Server banner', banner],
      ]),
    });
  },
};

// ---------- /userinfo ----------

// Friendly names for Discord's profile badges.
const BADGES = {
  Staff: '🛠️ Discord Staff',
  Partner: '🤝 Partnered Server Owner',
  Hypesquad: '🎉 HypeSquad Events',
  BugHunterLevel1: '🐛 Bug Hunter',
  BugHunterLevel2: '🐛 Bug Hunter Gold',
  HypeSquadOnlineHouse1: '🟣 HypeSquad Bravery',
  HypeSquadOnlineHouse2: '🟠 HypeSquad Brilliance',
  HypeSquadOnlineHouse3: '🟢 HypeSquad Balance',
  PremiumEarlySupporter: '⭐ Early Supporter',
  VerifiedBot: '✅ Verified Bot',
  VerifiedDeveloper: '💻 Early Verified Bot Developer',
  CertifiedModerator: '🛡️ Moderator Programs Alumni',
  ActiveDeveloper: '⚡ Active Developer',
};

// Powerful permissions worth pointing out on a member.
const KEY_PERMISSIONS = [
  [PermissionFlagsBits.ManageGuild, 'Manage Server'],
  [PermissionFlagsBits.ManageRoles, 'Manage Roles'],
  [PermissionFlagsBits.ManageChannels, 'Manage Channels'],
  [PermissionFlagsBits.ManageMessages, 'Manage Messages'],
  [PermissionFlagsBits.BanMembers, 'Ban Members'],
  [PermissionFlagsBits.KickMembers, 'Kick Members'],
  [PermissionFlagsBits.ModerateMembers, 'Moderate Members'],
  [PermissionFlagsBits.MentionEveryone, 'Mention Everyone'],
];

const userinfo = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show information about a member')
    .addUserOption((o) =>
      o.setName('member').setDescription('Who to look up (leave empty for yourself)')
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));

    const picked = interaction.options.getUser('member') ?? interaction.user;
    const member =
      interaction.options.getMember('member') ??
      (picked.id === interaction.user.id ? interaction.member : null);

    // Fetch the full profile so we can show their banner too.
    const user = await interaction.client.users.fetch(picked.id, { force: true }).catch(() => picked);

    const avatar = (member ?? user).displayAvatarURL({ size: 1024 });
    const banner = user.bannerURL({ size: 1024 });

    const embed = new EmbedBuilder()
      .setColor(member?.displayColor || user.accentColor || COLOR)
      .setAuthor({ name: user.tag, iconURL: avatar })
      .setTitle(member?.displayName ?? user.displayName ?? user.username)
      .setThumbnail(avatar)
      .addFields(
        { name: '🆔 ID', value: user.id, inline: true },
        { name: '🤖 Bot?', value: user.bot ? 'Yes' : 'No', inline: true },
        {
          name: '📅 Account created',
          value: `<t:${stamp(user.createdTimestamp)}:D>\n<t:${stamp(user.createdTimestamp)}:R>`,
          inline: true,
        }
      );

    if (banner) embed.setImage(banner);

    // Profile badges
    const badges = (user.flags?.toArray() ?? []).map((flag) => BADGES[flag]).filter(Boolean);
    if (badges.length) embed.addFields({ name: '🏅 Badges', value: badges.join('\n') });

    if (member) {
      if (member.joinedTimestamp) {
        embed.addFields({
          name: '📥 Joined this server',
          value: `<t:${stamp(member.joinedTimestamp)}:D>\n<t:${stamp(member.joinedTimestamp)}:R>`,
          inline: true,
        });
      }
      if (member.nickname) {
        embed.addFields({ name: '✏️ Nickname', value: member.nickname, inline: true });
      }
      if (member.premiumSinceTimestamp) {
        embed.addFields({
          name: '🚀 Boosting since',
          value: `<t:${stamp(member.premiumSinceTimestamp)}:D>`,
          inline: true,
        });
      }

      // Roles, highest first.
      const roles = member.roles.cache
        .filter((r) => r.id !== interaction.guildId)
        .sort((a, b) => b.position - a.position);
      if (roles.size) {
        const shown = [...roles.values()].slice(0, 10).map((r) => r.toString());
        const extra = roles.size > 10 ? ` +${roles.size - 10} more` : '';
        embed.addFields({ name: `🎭 Roles (${roles.size})`, value: shown.join(' ') + extra });
      } else {
        embed.addFields({ name: '🎭 Roles', value: 'None' });
      }

      // Key permissions
      const key = [];
      if (member.id === interaction.guild.ownerId) key.push('👑 Server Owner');
      if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        key.push('Administrator');
      } else {
        for (const [flag, name] of KEY_PERMISSIONS) {
          if (member.permissions.has(flag)) key.push(name);
        }
      }
      if (key.length) embed.addFields({ name: '🔑 Key permissions', value: key.join(', ') });

      // Active timeout
      if (member.communicationDisabledUntilTimestamp > Date.now()) {
        embed.addFields({
          name: '⏳ Timed out',
          value: `Until <t:${stamp(member.communicationDisabledUntilTimestamp)}:R>`,
        });
      }
    } else {
      embed.setFooter({ text: 'This person is not in this server.' });
    }

    await interaction.reply({
      embeds: [embed],
      components: linkButtons([
        ['Avatar', avatar],
        ['Banner', banner],
      ]),
    });
  },
};

module.exports = [poll, remind, serverinfo, userinfo];
