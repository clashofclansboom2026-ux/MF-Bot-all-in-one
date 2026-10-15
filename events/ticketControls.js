
const {
  Events,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const tickets = require('../utils/tickets');

function isSupportMember(interaction, settings) {
  const member = interaction.member;

  if (!member) return false;

  if (
    interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageChannels
    )
  ) {
    return true;
  }

  const roleIds = new Set([
    ...(settings.staffRoleIds || []),
    ...(settings.supportRoleIds || []),
  ]);

  return [...roleIds].some((roleId) =>
    member.roles?.cache?.has(roleId)
  );
}

function controlRow(claimed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:claim')
      .setLabel(claimed ? 'Claimed' : 'Claim Ticket')
      .setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setEmoji('🙋')
      .setDisabled(Boolean(claimed)),
    new ButtonBuilder()
      .setCustomId('ticket:unclaim')
      .setLabel('Unclaim')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!claimed),
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒')
  );
}

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    if (!interaction.isButton()) return;

    const supportedActions = [
      'ticket:claim',
      'ticket:unclaim',
      'ticket:close',
    ];

    if (!supportedActions.includes(interaction.customId)) return;
    if (!interaction.inGuild()) return;

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const guildId = interaction.guildId;
      const channelId = interaction.channelId;
      const ticket = tickets.getTicket(guildId, channelId);

      if (!ticket) {
        return interaction.editReply({
          content: 'This channel is not a registered ticket.',
        });
      }

      if (ticket.status !== 'open') {
        return interaction.editReply({
          content: 'This ticket is already closed.',
        });
      }

      const settings = tickets.getSettings(guildId);
      const isSupport = isSupportMember(interaction, settings);
      const action = interaction.customId;

      if (action === 'ticket:claim' || action === 'ticket:unclaim') {
        if (!isSupport) {
          return interaction.editReply({
            content: 'Only configured support staff can claim or unclaim tickets.',
          });
        }

        if (action === 'ticket:claim') {
          if (ticket.claimedBy && ticket.claimedBy !== interaction.user.id) {
            return interaction.editReply({
              content: `This ticket has already been claimed by <@${ticket.claimedBy}>.`,
            });
          }

          tickets.updateTicket(guildId, channelId, {
            claimedBy: interaction.user.id,
          });

          const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('Ticket Claimed')
            .setDescription(`${interaction.user} has claimed this ticket.`)
            .setTimestamp();

          await interaction.channel.send({
            embeds: [embed],
            allowedMentions: { users: [interaction.user.id] },
          });

          const message = await interaction.channel.messages.fetch({
            limit: 20,
          });

          const panelMessage = message.find((item) =>
            item.author.id === interaction.client.user.id &&
            item.components.some((row) =>
              row.components.some((component) =>
                component.customId === 'ticket:claim'
              )
            )
          );

          if (panelMessage) {
            await panelMessage.edit({
              components: [controlRow(interaction.user.id)],
            }).catch(() => {});
          }

          return interaction.editReply({
            content: 'You have claimed this ticket.',
          });
        }

        if (ticket.claimedBy !== interaction.user.id &&
            !interaction.memberPermissions?.has(
              PermissionFlagsBits.ManageChannels
            )) {
          return interaction.editReply({
            content: 'Only the person who claimed this ticket or a member with Manage Channels can unclaim it.',
          });
        }

        tickets.updateTicket(guildId, channelId, {
          claimedBy: null,
        });

        const embed = new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle('Ticket Unclaimed')
          .setDescription(`${interaction.user} has unclaimed this ticket.`)
          .setTimestamp();

        await interaction.channel.send({ embeds: [embed] });

        const messages = await interaction.channel.messages.fetch({
          limit: 20,
        });

        const panelMessage = messages.find((item) =>
          item.author.id === interaction.client.user.id &&
          item.components.some((row) =>
            row.components.some((component) =>
              component.customId === 'ticket:claim'
            )
          )
        );

        if (panelMessage) {
          await panelMessage.edit({
            components: [controlRow(null)],
          }).catch(() => {});
        }

        return interaction.editReply({
          content: 'The ticket has been unclaimed.',
        });
      }

      if (action === 'ticket:close') {
        const isOwner = ticket.userId === interaction.user.id;

        if (!isOwner && !isSupport) {
          return interaction.editReply({
            content: 'Only the ticket owner or configured support staff can close this ticket.',
          });
        }

        tickets.updateTicket(guildId, channelId, {
          status: 'closed',
          closedAt: new Date().toISOString(),
          closedBy: interaction.user.id,
        });

        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('Ticket Closed')
          .setDescription(
            `This ticket was closed by ${interaction.user}.\n\n` +
            'The channel will be deleted in 10 seconds.'
          )
          .setTimestamp();

        await interaction.channel.send({
          embeds: [embed],
          allowedMentions: { users: [interaction.user.id] },
        });

        await interaction.editReply({
          content: 'Ticket closed. This channel will be deleted in 10 seconds.',
        });

        setTimeout(async () => {
          try {
            await interaction.channel.delete(
              `Ticket closed by ${interaction.user.tag}`
            );
          } catch (error) {
            console.error('Could not delete closed ticket channel:', error);
          }
        }, 10_000);
      }
    } catch (error) {
      console.error('Ticket control error:', error);

      return interaction.editReply({
        content: 'Something went wrong while processing that ticket action.',
      }).catch(() => {});
    }
  },
};
