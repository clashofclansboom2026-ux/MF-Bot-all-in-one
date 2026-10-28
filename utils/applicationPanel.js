
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');

const applications = require('./applications');

async function deletePanelMessage(guild, form) {
  if (!form?.panelChannelId || !form?.panelMessageId) {
    return false;
  }

  const channel = await guild.channels
    .fetch(form.panelChannelId)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    return false;
  }

  const message = await channel.messages
    .fetch(form.panelMessageId)
    .catch(() => null);

  if (message) {
    await message.delete().catch(() => {});
  }

  applications.updateForm(guild.id, form.id, {
    panelMessageId: '',
  });

  return true;
}

async function syncPanel(guild, form) {
  if (!guild || !form?.id) {
    throw new Error('A server and application form are required.');
  }

  if (!form.enabled) {
    await deletePanelMessage(guild, form);
    return applications.updateForm(guild.id, form.id, {
      panelMessageId: '',
    });
  }

  if (!form.panelChannelId) {
    return form;
  }

  const channel = await guild.channels
    .fetch(form.panelChannelId)
    .catch(() => null);

  if (
    !channel ||
    !channel.isTextBased() ||
    ![ChannelType.GuildText, ChannelType.GuildAnnouncement]
      .includes(channel.type)
  ) {
    throw new Error('The application panel channel is unavailable or invalid.');
  }

  const color = /^#[0-9a-fA-F]{6}$/.test(form.embedColor || '')
    ? Number.parseInt(form.embedColor.slice(1), 16)
    : 0x347eff;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(form.panelTitle || form.name)
    .setDescription(
      form.panelDescription ||
      'Click the button below to submit your application.'
    );

  const button = new ButtonBuilder()
    .setCustomId(`application_apply:${form.id}`)
    .setLabel(form.buttonLabel || 'Apply Now')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(button);

  let message = null;

  if (form.panelMessageId) {
    message = await channel.messages
      .fetch(form.panelMessageId)
      .catch(() => null);
  }

  if (message) {
    await message.edit({
      embeds: [embed],
      components: [row],
    });
  } else {
    message = await channel.send({
      embeds: [embed],
      components: [row],
    });
  }

  return applications.updateForm(guild.id, form.id, {
    panelChannelId: channel.id,
    panelMessageId: message.id,
  });
}

module.exports = {
  syncPanel,
  deletePanelMessage,
};
