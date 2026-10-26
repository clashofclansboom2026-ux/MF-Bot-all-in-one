
const store = require('./store');

const STORE_NAME = 'tickets';

const DEFAULT_QUESTIONS = [
  {
    id: 'question_1',
    label: 'What do you need help with?',
    required: true,
  },
  {
    id: 'question_2',
    label: 'Please provide any extra details.',
    required: false,
  },
];

function normalizeQuestions(questions) {
  if (!Array.isArray(questions)) {
    return DEFAULT_QUESTIONS.map((question) => ({ ...question }));
  }

  return questions
    .slice(0, 5)
    .map((question, index) => ({
      id: `question_${index + 1}`,
      label: String(question?.label || '').trim().slice(0, 45),
      required: Boolean(question?.required),
    }))
    .filter((question) => question.label.length > 0);
}

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
        ticketQuestions: DEFAULT_QUESTIONS.map((question) => ({
          ...question,
        })),
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

  all[guildId].settings = {
    categoryId: null,
    logChannelId: null,
    staffRoleIds: [],
    supportRoleIds: [],
    maxOpenPerUser: 3,
    ticketCounter: 0,
    panelChannelId: null,
    panelMessageId: null,
    ...all[guildId].settings,
  };

  if (!Array.isArray(all[guildId].settings.ticketQuestions)) {
    all[guildId].settings.ticketQuestions = DEFAULT_QUESTIONS.map(
      (question) => ({ ...question })
    );
    writeAll(all);
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
    ticketQuestions: DEFAULT_QUESTIONS.map((question) => ({
      ...question,
    })),
    ...current.settings,
    ...updates,
  };

  if (Object.prototype.hasOwnProperty.call(updates, 'ticketQuestions')) {
    current.settings.ticketQuestions = normalizeQuestions(
      updates.ticketQuestions
    );
  }

  current.tickets ||= {};
  all[guildId] = current;
  writeAll(all);

  return current.settings;
}

function getSettings(guildId) {
  return getGuildData(guildId).settings;
}

function getTicketQuestions(guildId) {
  const settings = getSettings(guildId);
  return normalizeQuestions(settings.ticketQuestions);
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
    if (filters.channelId && ticket.channelId !== filters.channelId) {
      return false;
    }
    if (filters.claimedBy && ticket.claimedBy !== filters.claimedBy) {
      return false;
    }
    return true;
  });
}

function getOpenTicketCount(guildId, userId) {
  return getTickets(guildId, { userId, status: 'open' }).length;
}

module.exports = {
  DEFAULT_QUESTIONS,
  normalizeQuestions,
  getSettings,
  getTicketQuestions,
  updateSettings,
  createTicket,
  getTicket,
  updateTicket,
  getTickets,
  getOpenTicketCount,
};
