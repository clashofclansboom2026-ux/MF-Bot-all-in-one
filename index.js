'use strict';

// MF Bot — central bot entry point.
// Loads commands and events, registers slash commands, and routes Discord
// interactions through one central handler.

const fs = require('node:fs');
const path = require('node:path');

const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  Events,
  MessageFlags,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const reminders = require('./utils/reminders');
const { checkTarget } = require('./utils/checks');
const applications = require('./utils/applications');

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('[MF Bot] Missing DISCORD_TOKEN in the host Environment tab.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
  ],
});

// -----------------------------------------------------------------------------
// Logging
// -----------------------------------------------------------------------------

function logInfo(message) {
  console.log(`[MF Bot] ${message}`);
}

function logWarn(message) {
  console.warn(`[MF Bot] ${message}`);
}

function logError(message, error) {
  console.error(`[MF Bot] ${message}`, error?.stack || error || '');
}

function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const message = String(error?.message || '');

  if (
    message.includes('Missing Access') ||
    message.includes('Missing Permissions') ||
    message.includes('50013')
  ) {
    return 'MF Bot does not have permission to do that in this server.';
  }

  if (message.includes('Unknown Interaction')) {
    return 'That interaction expired. Please try again.';
  }

  return fallback;
}

// -----------------------------------------------------------------------------
// Dynamic command and event loading
// -----------------------------------------------------------------------------

client.commands = new Collection();

// Interaction event modules are collected here and called by the central
// InteractionCreate listener below.
const interactionHandlers = [];

function loadFolder(folder, handleItem) {
  const directory = path.join(__dirname, folder);

  if (!fs.existsSync(directory)) {
    logWarn(`Optional folder "${folder}" does not exist.`);
    return 0;
  }

  let loaded = 0;

  const files = fs.readdirSync(directory)
    .filter((file) => file.endsWith('.js'))
    .sort();

  for (const file of files) {
    const fullPath = path.join(directory, file);

    try {
      delete require.cache[require.resolve(fullPath)];

      const exported = require(fullPath);
      const items = Array.isArray(exported) ? exported : [exported];

      for (const item of items) {
        if (handleItem(item, file)) {
          loaded++;
        }
      }
    } catch (error) {
      logError(`Could not load ${folder}/${file}.`, error);
    }
  }

  return loaded;
}

const commandCount = loadFolder('commands', (command, file) => {
  if (
    !command ||
    !command.data ||
    typeof command.data.name !== 'string' ||
    typeof command.execute !== 'function'
  ) {
    logWarn(`Skipped commands/${file}: expected data.name and execute().`);
    return false;
  }

  if (client.commands.has(command.data.name)) {
    logWarn(`Duplicate command "${command.data.name}" in ${file}; skipped.`);
    return false;
  }

  client.commands.set(command.data.name, command);
  return true;
});

const eventCount = loadFolder('events', (event, file) => {
  if (
    !event ||
    !event.name ||
    typeof event.execute !== 'function'
  ) {
    logWarn(`Skipped events/${file}: expected name and execute().`);
    return false;
  }

  // InteractionCreate events are not registered separately.
  // They are dispatched by the single central handler.
  if (event.name === Events.InteractionCreate) {
    interactionHandlers.push({ event, file });
    return true;
  }

  const listener = async (...args) => {
    try {
      await event.execute(...args);
    } catch (error) {
      logError(`Event "${event.name}" from ${file} failed.`, error);
    }
  };

  if (event.once) {
    client.once(event.name, listener);
  } else {
    client.on(event.name, listener);
  }

  return true;
});

logInfo(
  `Loaded ${commandCount} command(s), ${eventCount} event(s), and ${interactionHandlers.length} interaction handler(s).`
);

// -----------------------------------------------------------------------------
// Safe interaction replies
// -----------------------------------------------------------------------------

async function replyPrivate(interaction, content) {
  const payload = {
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };

  try {
    if (interaction.deferred) {
      return await interaction.editReply(payload);
    }

    if (interaction.replied) {
      return await interaction.followUp(payload);
    }

    return await interaction.reply(payload);
  } catch (error) {
    logWarn(`Could not reply to interaction: ${error.message}`);
    return null;
  }
}

async function deferPrivate(interaction) {
  if (interaction.deferred || interaction.replied) return;

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });
}

// -----------------------------------------------------------------------------
// Application system
// -----------------------------------------------------------------------------

function isApplicationReviewer(member, form) {
  if (!member || !form) return false;

  if (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  ) {
    return true;
  }

  const reviewerRoleIds = Array.isArray(form.reviewerRoleIds)
    ? form.reviewerRoleIds
    : [];

  return reviewerRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

function buildApplicationEmbed(submission) {
  const embed = new EmbedBuilder()
    .setColor(0xf0b429)
    .setTitle(`Application: ${submission.formName}`.slice(0, 256))
    .setDescription(
      `**Applicant:** <@${submission.userId}>\n` +
      `**Username:** ${submission.username}\n` +
      `**Status:** Pending review\n` +
      `**Application ID:** \`${submission.id}\``
    )
    .setTimestamp(new Date(submission.submittedAt));

  for (const answer of submission.answers) {
    embed.addFields({
      name: String(answer.question || 'Question').slice(0, 256),
      value: String(answer.answer || 'No answer provided').slice(0, 1024),
      inline: false,
    });
  }

  return embed;
}

function buildReviewButtons(guildId, submissionId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`application_review:approved:${guildId}:${submissionId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`application_review:rejected:${guildId}:${submissionId}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

async function handleApplicationButton(interaction) {
  if (!interaction.inGuild()) {
    return replyPrivate(interaction, 'Applications can only be submitted inside a server.');
  }

  const formId = interaction.customId.slice('application_apply:'.length);
  const form = applications.getForm(interaction.guildId, formId);

  if (!form || !form.enabled) {
    return replyPrivate(interaction, 'This application form is no longer available.');
  }

  if (!Array.isArray(form.questions) || form.questions.length === 0) {
    return replyPrivate(interaction, 'This form has no questions configured. Please contact a server administrator.');
  }

  if (form.questions.length > 5) {
    return replyPrivate(interaction, 'This form has too many questions configured. Please contact a server administrator.');
  }

  const modal = new ModalBuilder()
    .setCustomId(`application_submit:${interaction.guildId}:${form.id}`)
    .setTitle(`Apply: ${form.name}`.slice(0, 45));

  for (const question of form.questions) {
    const input = new TextInputBuilder()
      .setCustomId(question.id)
      .setLabel(String(question.label || 'Your answer').slice(0, 45))
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(question.required !== false)
      .setMaxLength(4000)
      .setPlaceholder('Enter your answer here.');

    modal.addComponents(
      new ActionRowBuilder().addComponents(input)
    );
  }

  return interaction.showModal(modal);
}

async function handleApplicationSubmit(interaction) {
  if (!interaction.inGuild()) {
    return replyPrivate(interaction, 'Applications can only be submitted inside a server.');
  }

  const parts = interaction.customId.split(':');
  const guildId = parts[1];
  const formId = parts.slice(2).join(':');

  if (guildId !== interaction.guildId || !formId) {
    return replyPrivate(interaction, 'This application form is invalid. Please try again.');
  }

  const form = applications.getForm(guildId, formId);

  if (!form || !form.enabled) {
    return replyPrivate(interaction, 'This application form has been closed.');
  }

  await deferPrivate(interaction);

  try {
    const answers = {};

    for (const question of form.questions) {
      answers[question.id] = interaction.fields.getTextInputValue(question.id);
    }

    const submission = applications.createSubmission(guildId, formId, {
      userId: interaction.user.id,
      username: interaction.user.globalName || interaction.user.username,
      answers,
    });

    let reviewMessage = null;

    if (form.reviewChannelId) {
      const channel = await interaction.guild.channels
        .fetch(form.reviewChannelId)
        .catch(() => null);

      if (channel && channel.isTextBased() && channel.messages) {
        try {
          reviewMessage = await channel.send({
            embeds: [buildApplicationEmbed(submission)],
            components: [
              buildReviewButtons(guildId, submission.id),
            ],
            allowedMentions: {
              parse: [],
              users: [submission.userId],
            },
          });
        } catch (error) {
          logError(`Could not send application ${submission.id} to its review channel.`, error);
        }
      }
    }

    if (reviewMessage) {
      await interaction.editReply({
        content: 'Your application has been submitted successfully. The server team will review it.',
      });
    } else {
      await interaction.editReply({
        content: 'Your application has been saved, but MF Bot could not send it to the review channel. Please contact a server administrator.',
      });
    }

    logInfo(
      `Application ${submission.id} submitted by ${interaction.user.id} in guild ${guildId}.`
    );
  } catch (error) {
    logError('Application submission failed.', error);

    await interaction.editReply({
      content: errorMessage(error, 'Your application could not be submitted. Please try again.'),
    }).catch(() => {});
  }
}

async function handleApplicationReview(interaction) {
  if (!interaction.inGuild()) {
    return replyPrivate(interaction, 'Applications can only be reviewed inside a server.');
  }

  const parts = interaction.customId.split(':');
  const decision = parts[1];
  const guildId = parts[2];
  const submissionId = parts.slice(3).join(':');

  if (
    guildId !== interaction.guildId ||
    !submissionId ||
    !['approved', 'rejected'].includes(decision)
  ) {
    return replyPrivate(interaction, 'This review action is invalid.');
  }

  const submission = applications.getSubmission(guildId, submissionId);

  if (!submission) {
    return replyPrivate(interaction, 'This application could not be found.');
  }

  const form = applications.getForm(guildId, submission.formId);

  if (!form) {
    return replyPrivate(interaction, 'The form for this application no longer exists.');
  }

  if (!isApplicationReviewer(interaction.member, form)) {
    return replyPrivate(interaction, 'You do not have permission to review this application.');
  }

  if (submission.status !== 'pending') {
    return replyPrivate(interaction, `This application has already been ${submission.status}.`);
  }

  await deferPrivate(interaction);

  try {
    const reviewed = applications.reviewSubmission(
      guildId,
      submissionId,
      decision,
      interaction.user.id
    );

    if (!reviewed) {
      return interaction.editReply({
        content: 'This application could not be found.',
      });
    }

    const updatedEmbed = buildApplicationEmbed(reviewed)
      .setColor(decision === 'approved' ? 0x36c98f : 0xff6875)
      .setDescription(
        `**Applicant:** <@${reviewed.userId}>\n` +
        `**Username:** ${reviewed.username}\n` +
        `**Status:** ${decision === 'approved' ? 'Approved' : 'Rejected'}\n` +
        `**Reviewed by:** <@${interaction.user.id}>\n` +
        `**Application ID:** \`${reviewed.id}\``
      );

    await interaction.message.edit({
      embeds: [updatedEmbed],
      components: [
        buildReviewButtons(guildId, submissionId, true),
      ],
      allowedMentions: { parse: [] },
    }).catch((error) => {
      logWarn(`Could not update reviewed application message: ${error.message}`);
    });

    const applicant = await client.users
      .fetch(reviewed.userId)
      .catch(() => null);

    if (applicant) {
      await applicant.send({
        content:
          `Your **${reviewed.formName}** application in **${interaction.guild.name}** ` +
          `has been ${decision}.`,
        allowedMentions: { parse: [] },
      }).catch(() => {});
    }

    await interaction.editReply({
      content: `Application ${decision}.`,
    });

    logInfo(
      `Application ${submissionId} ${decision} by ${interaction.user.id} in guild ${guildId}.`
    );
  } catch (error) {
    logError('Application review failed.', error);

    await interaction.editReply({
      content: errorMessage(error, 'The application could not be reviewed. Please try again.'),
    }).catch(() => {});
  }
}

// -----------------------------------------------------------------------------
// Slash commands
// -----------------------------------------------------------------------------

const TARGETING_COMMANDS = new Set([
  'kick',
  'ban',
  'timeout',
  'untimeout',
  'warn',
]);

async function handleChatCommand(interaction) {
  const command = client.commands.get(interaction.commandName);

  if (!command) {
    return replyPrivate(interaction, 'That command is unavailable. It may have been removed or not loaded.');
  }

  try {
    if (
      interaction.inGuild() &&
      TARGETING_COMMANDS.has(interaction.commandName)
    ) {
      const target = interaction.options.getMember('member');
      const problem = checkTarget(interaction, target);

      if (problem) {
        return replyPrivate(interaction, problem);
      }
    }

    await command.execute(interaction);
  } catch (error) {
    logError(`Command /${interaction.commandName} failed.`, error);

    await replyPrivate(
      interaction,
      errorMessage(error, 'Something went wrong running that command.')
    );
  }
}

// -----------------------------------------------------------------------------
// Application interaction routing
// -----------------------------------------------------------------------------

async function handleApplicationInteraction(interaction) {
  if (
    interaction.isButton() &&
    interaction.customId.startsWith('application_apply:')
  ) {
    await handleApplicationButton(interaction);
    return true;
  }

  if (
    interaction.isButton() &&
    interaction.customId.startsWith('application_review:')
  ) {
    await handleApplicationReview(interaction);
    return true;
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith('application_submit:')
  ) {
    await handleApplicationSubmit(interaction);
    return true;
  }

  return false;
}

// -----------------------------------------------------------------------------
// Central interaction dispatcher
// -----------------------------------------------------------------------------

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Slash commands are handled centrally.
    if (interaction.isChatInputCommand()) {
      await handleChatCommand(interaction);
      return;
    }

    // Application buttons and forms are handled here first.
    if (await handleApplicationInteraction(interaction)) {
      return;
    }

    // All other feature-specific interactions are passed to their own
    // existing handler modules, without registering separate listeners.
    for (const { event, file } of interactionHandlers) {
      // Once an interaction has been acknowledged, no other handler should
      // attempt to reply to it.
      if (interaction.replied || interaction.deferred) {
        break;
      }

      try {
        await event.execute(interaction);
      } catch (error) {
        logError(`Interaction handler in ${file} failed.`, error);

        if (
          interaction.isRepliable() &&
          !interaction.replied &&
          !interaction.deferred
        ) {
          await replyPrivate(
            interaction,
            'Something went wrong processing that interaction.'
          );
        }

        break;
      }
    }
  } catch (error) {
    logError('Central interaction handler failed.', error);

    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await replyPrivate(
        interaction,
        'Something went wrong processing that interaction.'
      );
    }
  }
});

// -----------------------------------------------------------------------------
// Startup and command registration
// -----------------------------------------------------------------------------

client.once(Events.ClientReady, async (readyClient) => {
  logInfo(`Logged in as ${readyClient.user.tag}.`);
  logInfo(`${client.commands.size} command(s) are available.`);

  const commandData = [...client.commands.values()].map((command) =>
    typeof command.data.toJSON === 'function'
      ? command.data.toJSON()
      : command.data
  );

  // Remove old server-specific commands from the original server.
  // This does not remove global commands or affect other servers.
  const oldGuildId = process.env.OLD_GUILD_ID?.trim();

  if (oldGuildId) {
    try {
      const oldGuild = await readyClient.guilds.fetch(oldGuildId);

      await oldGuild.commands.set([]);

      logInfo(
        `Successfully cleared old server-specific commands from "${oldGuild.name}".`
      );
    } catch (error) {
      logError(
        'Could not clear old server-specific commands. Check OLD_GUILD_ID and the bot’s access to the original server.',
        error
      );
    }
  } else {
    logWarn(
      'OLD_GUILD_ID is not configured. Skipping old server command cleanup.'
    );
  }

  // Always register commands globally.
  // This is deliberately separate from cleanup so a cleanup failure
  // cannot prevent global command registration.
  try {
    await readyClient.application.commands.set(commandData);
    logInfo('Successfully registered global slash commands.');
  } catch (error) {
    logError('Could not register global slash commands.', error);
  }

  try {
    reminders.init(readyClient);
    logInfo('Reminder system initialised.');
  } catch (error) {
    logError('Could not initialise the reminder system.', error);
  }
});

// -----------------------------------------------------------------------------
// Process-level safety
// -----------------------------------------------------------------------------

process.on('unhandledRejection', (error) => {
  logError('Unhandled promise rejection.', error);
});

process.on('uncaughtException', (error) => {
  logError('Uncaught exception. The process may be in an unsafe state.', error);
  process.exit(1);
});

client.on(Events.Error, (error) => {
  logError('Discord client error.', error);
});

client.login(token).catch((error) => {
  logError('Discord login failed. Check DISCORD_TOKEN and the bot configuration.', error);
  process.exit(1);
});
