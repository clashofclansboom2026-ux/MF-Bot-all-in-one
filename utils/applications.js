// utils/applications.js
// Persistent storage and helpers for multiple application forms per server.

const crypto = require('node:crypto');
const store = require('./store');

const STORE_NAME = 'applications';
const MAX_QUESTIONS = 5;
const MAX_FORM_NAME_LENGTH = 80;
const MAX_QUESTION_LENGTH = 45;
const MAX_DESCRIPTION_LENGTH = 1000;
const DISCORD_ID_PATTERN = /^\d{17,20}$/;

function makeId() {
  return crypto.randomUUID();
}

function cleanText(value, maxLength, fallback = '') {
  return String(value ?? '').trim().slice(0, maxLength) || fallback;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireGuildId(guildId) {
  if (!DISCORD_ID_PATTERN.test(String(guildId ?? ''))) {
    throw new Error('A valid server ID is required.');
  }

  return String(guildId);
}

function copyQuestions(questions) {
  return Array.isArray(questions)
    ? questions.filter(isRecord).map((question) => ({ ...question }))
    : [];
}

function copyForm(form) {
  if (!isRecord(form)) return null;

  return {
    ...form,
    questions: copyQuestions(form.questions),
  };
}

function copySubmission(submission) {
  if (!isRecord(submission)) return null;

  const answers = Array.isArray(submission.answers)
    ? submission.answers.filter(isRecord).map((answer) => ({ ...answer }))
    : [];

  return {
    ...submission,
    answers,
  };
}

function normalizeQuestions(questions) {
  if (!Array.isArray(questions)) return [];

  return questions
    .slice(0, MAX_QUESTIONS)
    .map((question, index) => ({
      id: 'question_' + (index + 1),
      label: cleanText(question?.label, MAX_QUESTION_LENGTH),
      required: question?.required !== false,
    }))
    .filter((question) => question.label.length > 0);
}

function readAll() {
  const data = store.read(STORE_NAME, {});
  return isRecord(data) ? data : {};
}

function writeAll(data) {
  store.write(STORE_NAME, data);
}

function getGuildData(guildId) {
  guildId = requireGuildId(guildId);

  const all = readAll();
  let changed = false;

  if (!isRecord(all[guildId])) {
    all[guildId] = { forms: {}, submissions: {} };
    changed = true;
  }

  const guildData = all[guildId];

  if (!isRecord(guildData.forms)) {
    guildData.forms = {};
    changed = true;
  }

  if (!isRecord(guildData.submissions)) {
    guildData.submissions = {};
    changed = true;
  }

  if (changed) writeAll(all);

  return { all, guildData };
}

function saveGuildData(guildId, all, guildData) {
  all[requireGuildId(guildId)] = guildData;
  writeAll(all);
}

function listForms(guildId) {
  const { guildData } = getGuildData(guildId);

  return Object.values(guildData.forms)
    .filter(isRecord)
    .map(copyForm)
    .filter(Boolean)
    .sort((a, b) =>
      String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    );
}

function getForm(guildId, formId) {
  const { guildData } = getGuildData(guildId);
  return copyForm(guildData.forms[String(formId)]) || null;
}

function createForm(guildId, input = {}) {
  if (!isRecord(input)) {
    throw new Error('Application form details must be an object.');
  }

  const name = cleanText(input.name, MAX_FORM_NAME_LENGTH);

  if (!name) {
    throw new Error('Give the application form a name.');
  }

  const questions = normalizeQuestions(input.questions);

  if (questions.length === 0) {
    throw new Error('Add at least one question before saving the form.');
  }

  const { all, guildData } = getGuildData(guildId);
  const now = new Date().toISOString();

  const form = {
    id: makeId(),
    name,
    description: cleanText(input.description, MAX_DESCRIPTION_LENGTH),
    questions,
    panelTitle: cleanText(input.panelTitle, 256, name),
    panelDescription: cleanText(
      input.panelDescription,
      4000,
      'Click the button below to submit your application.'
    ),
    buttonLabel: cleanText(input.buttonLabel, 80, 'Apply Now'),
    embedColor: /^#[0-9a-fA-F]{6}$/.test(String(input.embedColor || ''))
      ? input.embedColor
      : '#347eff',
    reviewChannelId: cleanText(input.reviewChannelId, 30) || null,
    reviewerRoleIds: Array.isArray(input.reviewerRoleIds)
      ? [
          ...new Set(
            input.reviewerRoleIds
              .map((id) => String(id).trim())
              .filter((id) => DISCORD_ID_PATTERN.test(id))
          ),
        ].slice(0, 20)
      : [],
    panelChannelId: null,
    panelMessageId: null,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  guildData.forms[form.id] = form;
  saveGuildData(guildId, all, guildData);

  return getForm(guildId, form.id);
}

function updateForm(guildId, formId, updates = {}) {
  if (!isRecord(updates)) {
    throw new Error('Form updates must be an object.');
  }

  const { all, guildData } = getGuildData(guildId);
  const current = guildData.forms[String(formId)];

  if (!isRecord(current)) return null;

  const next = { ...current };

  if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
    const name = cleanText(updates.name, MAX_FORM_NAME_LENGTH);

    if (!name) {
      throw new Error('Give the application form a name.');
    }

    next.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'description')) {
    next.description = cleanText(
      updates.description,
      MAX_DESCRIPTION_LENGTH
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'questions')) {
    const questions = normalizeQuestions(updates.questions);

    if (questions.length === 0) {
      throw new Error('Add at least one question before saving the form.');
    }

    next.questions = questions;
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'panelTitle')) {
    next.panelTitle = cleanText(updates.panelTitle, 256, next.name);
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'panelDescription')) {
    next.panelDescription = cleanText(updates.panelDescription, 4000);
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'buttonLabel')) {
    next.buttonLabel = cleanText(updates.buttonLabel, 80, 'Apply Now');
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'embedColor')) {
    next.embedColor = /^#[0-9a-fA-F]{6}$/.test(
      String(updates.embedColor || '')
    )
      ? updates.embedColor
      : '#347eff';
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'reviewChannelId')) {
    next.reviewChannelId = cleanText(updates.reviewChannelId, 30) || null;
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'reviewerRoleIds')) {
    next.reviewerRoleIds = Array.isArray(updates.reviewerRoleIds)
      ? [
          ...new Set(
            updates.reviewerRoleIds
              .map((id) => String(id).trim())
              .filter((id) => DISCORD_ID_PATTERN.test(id))
          ),
        ].slice(0, 20)
      : [];
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'panelChannelId')) {
    next.panelChannelId = cleanText(updates.panelChannelId, 30) || null;
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'panelMessageId')) {
    next.panelMessageId = cleanText(updates.panelMessageId, 30) || null;
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'enabled')) {
    next.enabled = Boolean(updates.enabled);
  }

  next.updatedAt = new Date().toISOString();
  guildData.forms[String(formId)] = next;

  saveGuildData(guildId, all, guildData);

  return getForm(guildId, formId);
}

function deleteForm(guildId, formId) {
  const { all, guildData } = getGuildData(guildId);

  formId = String(formId);

  if (!isRecord(guildData.forms[formId])) return false;

  delete guildData.forms[formId];
  saveGuildData(guildId, all, guildData);

  return true;
}

function createSubmission(guildId, formId, submission = {}) {
  if (!isRecord(submission)) {
    throw new Error('Submission details must be an object.');
  }

  const { all, guildData } = getGuildData(guildId);
  const form = guildData.forms[String(formId)];

  if (!isRecord(form) || form.enabled === false) {
    throw new Error('This application form is unavailable.');
  }

  if (!DISCORD_ID_PATTERN.test(String(submission.userId ?? ''))) {
    throw new Error('A valid applicant ID is required.');
  }

  const questions = copyQuestions(form.questions);

  if (questions.length === 0) {
    throw new Error('This application form has no valid questions.');
  }

  const suppliedAnswers = isRecord(submission.answers)
    ? submission.answers
    : {};

  const answers = questions.map((question) => {
    const answer = String(
      suppliedAnswers[question.id] ?? ''
    ).trim().slice(0, 4000);

    if (question.required && !answer) {
      throw new Error(
        'Please answer the required question: ' + question.label
      );
    }

    return {
      questionId: question.id,
      question: question.label,
      answer,
    };
  });

  const now = new Date().toISOString();

  const record = {
    id: makeId(),
    formId: String(formId),
    formName: cleanText(form.name, MAX_FORM_NAME_LENGTH, 'Application'),
    userId: String(submission.userId),
    username: cleanText(submission.username, 100, 'Unknown user'),
    answers,
    status: 'pending',
    submittedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: '',
  };

  guildData.submissions[record.id] = record;
  saveGuildData(guildId, all, guildData);

  return copySubmission(record);
}

function listSubmissions(guildId, filters = {}) {
  if (!isRecord(filters)) filters = {};

  const { guildData } = getGuildData(guildId);

  return Object.values(guildData.submissions)
    .filter(isRecord)
    .filter(
      (submission) =>
        !filters.formId || submission.formId === filters.formId
    )
    .filter(
      (submission) =>
        !filters.status || submission.status === filters.status
    )
    .filter(
      (submission) =>
        !filters.userId || submission.userId === filters.userId
    )
    .map(copySubmission)
    .filter(Boolean)
    .sort((a, b) =>
      String(b.submittedAt || '').localeCompare(
        String(a.submittedAt || '')
      )
    );
}

function getSubmission(guildId, submissionId) {
  const { guildData } = getGuildData(guildId);

  return copySubmission(
    guildData.submissions[String(submissionId)]
  ) || null;
}

function reviewSubmission(
  guildId,
  submissionId,
  decision,
  reviewerId,
  note = ''
) {
  if (!['approved', 'rejected'].includes(decision)) {
    throw new Error('Review decision must be approved or rejected.');
  }

  if (!DISCORD_ID_PATTERN.test(String(reviewerId ?? ''))) {
    throw new Error('A valid reviewer ID is required.');
  }

  const { all, guildData } = getGuildData(guildId);
  const submission = guildData.submissions[String(submissionId)];

  if (!isRecord(submission)) return null;

  submission.status = decision;
  submission.reviewedAt = new Date().toISOString();
  submission.reviewedBy = String(reviewerId);
  submission.reviewNote = cleanText(note, 1000);

  saveGuildData(guildId, all, guildData);

  return getSubmission(guildId, submissionId);
}

module.exports = {
  MAX_QUESTIONS,
  MAX_FORM_NAME_LENGTH,
  MAX_QUESTION_LENGTH,
  normalizeQuestions,
  listForms,
  getForm,
  createForm,
  updateForm,
  deleteForm,
  createSubmission,
  listSubmissions,
  getSubmission,
  reviewSubmission,
};
