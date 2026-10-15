
const store = require('./store');

const STORE_NAME = 'tickets';

function readAll() {
  const data = store.read(STORE_NAME, {});
  return data && typeof data === 'object' && !Array.isArray(data)
    ? data
    : {};
}

function writeAll(data) {
  store.write(STORE_NAME, data);
}

function getGuildData(guildId) {
  const all = readAll();

  if (!all[guildId]) {
    all[guildId] = {
      settings: {
        categoryId: null,
        logChannelId: null,
        staffRoleIds: [],
        supportRoleIds: [],
        maxOpenPerUser: 3,
        ticketCounter: 0,
        panelChannelId: null,
        panelMessageId: null,
      },
      tickets: {},
    };

    writeAll(all);
  }

  if (!all[guildId].settings) {
    all[guildId].settings = {};
  }

  if (!all[guildId].tickets) {
    all[guildId].tickets = {};
  }

  return all[guildId];
}

function updateSettings(guildId, updates) {
  const all = readAll();
  const current = all[guildId] || {
    settings: {},
    tickets: {},
  };

  current.settings = {
    categoryId: null,
    logChannelId: null,
    staffRoleIds: [],
    supportRoleIds: [],
    maxOpenPerUser: 3,
    ticketCounter: 0,
    panelChannelId: null,
    panelMessageId: null,
    ...current.settings,
    ...updates,
  };

  current.tickets ||= {};
  all[guildId] = current;
  writeAll(all);

  return current.settings;
}

function getSettings(guildId) {
  return getGuildData(guildId).settings;
}

function createTicket(guildId, ticket) {
  const data = getGuildData(guildId);

  if (!ticket || !ticket.id || data.tickets[ticket.id]) {
    throw new Error('Ticket must have a unique ID.');
  }

  data.tickets[ticket.id] = {
    status: 'open',
    createdAt: new Date().toISOString(),
    claimedBy: null,
    closedAt: null,
    closedBy: null,
    ...ticket,
  };

  writeAll(readAllWithGuild(guildId, data));

  return data.tickets[ticket.id];
}

function readAllWithGuild(guildId, guildData) {
  const all = readAll();
  all[guildId] = guildData;
  return all;
}

function getTicket(guildId, ticketId) {
  return getGuildData(guildId).tickets[ticketId] || null;
}

function updateTicket(guildId, ticketId, updates) {
  const data = getGuildData(guildId);
  const ticket = data.tickets[ticketId];

  if (!ticket) return null;

  data.tickets[ticketId] = {
    ...ticket,
    ...updates,
    id: ticket.id,
  };

  writeAll(readAllWithGuild(guildId, data));

  return data.tickets[ticketId];
}

function getTickets(guildId, filters = {}) {
  const tickets = Object.values(getGuildData(guildId).tickets);

  return tickets.filter((ticket) => {
    if (filters.status && ticket.status !== filters.status) return false;
    if (filters.userId && ticket.userId !== filters.userId) return false;
    if (filters.channelId && ticket.channelId !== filters.channelId) return false;
    if (filters.claimedBy && ticket.claimedBy !== filters.claimedBy) return false;
    return true;
  });
}

function getOpenTicketCount(guildId, userId) {
  return getTickets(guildId, { userId, status: 'open' }).length;
}

module.exports = {
  getSettings,
  updateSettings,
  createTicket,
  getTicket,
  updateTicket,
  getTickets,
  getOpenTicketCount,
};
