// Handy commands: /poll, /remind, /serverinfo, /userinfo

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const reminders = require('../utils/reminders');

const hidden = (content) => ({ content, flags: MessageFlags.Ephemeral });
const stamp = (ms) => Math.floor(ms / 1000);
const NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

// ---------- /poll ----------
const poll = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Start a poll that people vote on with reactions')
    .addStringOption((o) =>
      o.setName('question').setDescription('What is the poll about?').setMaxLength(200).setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('option1').setDescription('First choice').setMaxLength(100).setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('option2').setDescription('Second choice').setMaxLength(100).setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('option3').setDescription('Third choice (optional)').setMaxLength(100)
    )
    .addStringOption((o) =>
      o.setName('option4').setDescription('Fourth choice (optional)').setMaxLength(100)
    )
    .addStringOption((o) =>
      o.setName('option5').setDescription('Fifth choice (optional)').setMaxLength(100)
    ),

  async execute(interaction) {
    const question = interaction.options.getString('question', true);
    const options = [1, 2, 3, 4, 5]
      .map((i) => interaction.options.getString(`option${i}`))
      .filter(Boolean);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📊 ${question}`)
      .setDescription(options.map((text, i) => `${NUMBERS[i]}  ${text}`).join('\n\n'))
      .setFooter({ text: `Poll started by ${interaction.user.username}` });

    await interaction.reply({ embeds: [embed] });
    const message = await interaction.fetchReply();

    try {
      for (let i = 0; i < options.length; i++) await message.react(NUMBERS[i]);
    } catch {
      await interaction.followUp(
        hidden(
          "I couldn't add the voting reactions. Give my role the Add Reactions and Read Message History permissions."
        )
      );
    }
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
const serverinfo = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show information about this server'),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));

    const guild = interaction.guild;
    const owner = await guild.fetchOwner().catch(() => null);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: 'Owner', value: owner ? owner.user.tag : 'Unknown', inline: true },
        { name: 'Members', value: String(guild.memberCount), inline: true },
        { name: 'Created', value: `<t:${stamp(guild.createdTimestamp)}:D>`, inline: true },
        { name: 'Channels', value: String(guild.channels.cache.size), inline: true },
        { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
        { name: 'Boosts', value: String(guild.premiumSubscriptionCount ?? 0), inline: true }
      );

    await interaction.reply({ embeds: [embed] });
  },
};

// ---------- /userinfo ----------
const userinfo = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show information about a member')
    .addUserOption((o) =>
      o.setName('member').setDescription('Who to look up (leave empty for yourself)')
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply(hidden('Use this in a server.'));

    const user = interaction.options.getUser('member') ?? interaction.user;
    const member =
      interaction.options.getMember('member') ??
      (user.id === interaction.user.id ? interaction.member : null);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(user.tag)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Bot?', value: user.bot ? 'Yes' : 'No', inline: true },
        { name: 'Account created', value: `<t:${stamp(user.createdTimestamp)}:D>`, inline: true }
      );

    if (member) {
      const roles = member.roles.cache
        .filter((r) => r.id !== interaction.guildId)
        .sort((a, b) => b.position - a.position)
        .first(10)
        .map((r) => r.toString());

      embed.addFields(
        { name: 'Joined this server', value: member.joinedTimestamp ? `<t:${stamp(member.joinedTimestamp)}:D>` : 'Unknown', inline: true },
        { name: 'Roles', value: roles.length ? roles.join(' ') : 'None' }
      );
    } else {
      embed.setFooter({ text: 'This person is not in this server.' });
    }

    await interaction.reply({ embeds: [embed] });
  },
};

module.exports = [poll, remind, serverinfo, userinfo];
