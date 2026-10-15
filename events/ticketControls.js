
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
const { sendTranscript } = require('../utils/ticketTranscripts');

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

async function updateControlMessage(channel, client, claimed) {
  const messages = await channel.messages.fetch({ limit: 50 });

  const panelMessage = messages.find((message) =>
    message.author.id === client.user.id &&
    message.components.some((row) =>
      row.components.some((component) =>
        component.customId === 'ticket:claim'
      )
    )
  );

  if (panelMessage) {
    await panelMessage.edit({
      components: [controlRow(claimed)],
    });
  }
}

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    if (!interaction.isButton()) return;

    const action = interaction.customId;

    if (
      ![
        'ticket:claim',
        'ticket:unclaim',
        'ticket:close',
      ].includes(action)
    ) {
      return;
    }

    if (!interaction.inGuild()) return;

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const guildId = interaction.guildId;
      const channel = interaction.channel;
      const ticket = tickets.getTicket(guildId, channel.id);

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
              allowedMentions: { parse: [] },
            });
          }

          tickets.updateTicket(guildId, channel.id, {
            claimedBy: interaction.user.id,
          });

          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(0x3498db)
                .setTitle('Ticket Claimed')
                .setDescription(`${interaction.user} has claimed this ticket.`)
                .setTimestamp(),
            ],
            allowedMentions: { users: [interaction.user.id] },
          });

          await updateControlMessage(
            channel,
            interaction.client,
            interaction.user.id
          ).catch((error) => {
            console.error('Could not update ticket controls:', error);
          });

          return interaction.editReply({
            content: 'You have claimed this ticket.',
          });
        }

        if (
          ticket.claimedBy !== interaction.user.id &&
          !interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageChannels
          )
        ) {
          return interaction.editReply({
            content: 'Only the person who claimed this ticket or a member with Manage Channels can unclaim it.',
          });
        }

        tickets.updateTicket(guildId, channel.id, {
          claimedBy: null,
        });

        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x95a5a6)
              .setTitle('Ticket Unclaimed')
              .setDescription(`${interaction.user} has unclaimed this ticket.`)
              .setTimestamp(),
          ],
          allowedMentions: { users: [interaction.user.id] },
        });

        await updateControlMessage(
          channel,
          interaction.client,
          null
        ).catch((error) => {
          console.error('Could not update ticket controls:', error);
        });

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

        const closedBy = interaction.user;

        // Save the transcript while the channel and its messages still exist.
        let transcriptResult;

        try {
          transcriptResult = await sendTranscript(
            interaction.guild,
            channel,
            ticket,
            closedBy
          );
        } catch (error) {
          console.error('Ticket transcript failed:', error);

          return interaction.editReply({
            content: 'The transcript could not be saved, so this ticket has not been closed or deleted. Check the bot logs and ticket-log channel permissions, then try again.',
          });
        }

        if (!transcriptResult.sent) {
          return interaction.editReply({
            content: `The ticket has not been closed or deleted because its transcript was not saved. ${transcriptResult.reason}`,
          });
        }

        tickets.updateTicket(guildId, channel.id, {
          status: 'closed',
          closedAt: new Date().toISOString(),
          closedBy: closedBy.id,
        });

        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle('Ticket Closed')
              .setDescription(
                `This ticket was closed by ${closedBy}.\n\n` +
                'The transcript has been saved to the ticket logs channel. ' +
                'This channel will be deleted in 10 seconds.'
              )
              .setTimestamp(),
          ],
          allowedMentions: { users: [closedBy.id] },
        });

        await interaction.editReply({
          content: 'Transcript saved. This ticket will be deleted in 10 seconds.',
        });

        setTimeout(async () => {
          try {
            await channel.delete(`Ticket closed by ${closedBy.tag}`);
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
