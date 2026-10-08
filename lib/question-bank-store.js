/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { findProfileByToken } = require('./profile-store');
const { questionImageBelongsToOwner } = require('./question-image-store');

const DATA_DIRECTORY = process.env.APTIQUIZ_DATA_DIR || path.join(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIRECTORY, 'question-sets.json');
const TOPICS = ['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability', 'Data Interpretation'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const OPTION_IDS = ['A', 'B', 'C', 'D'];
let writeQueue = Promise.resolve();

class QuestionBankError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'QuestionBankError';
    this.code = code;
    this.status = status;
  }
}

function emptyStore() {
  return { sets: [] };
}

async function loadStore() {
  try {
    const store = JSON.parse(await fs.readFile(STORE_PATH, 'utf8'));
    return Array.isArray(store.sets) ? store : emptyStore();
  } catch (error) {
    if (error.code === 'ENOENT') return emptyStore();
    throw error;
  }
}

async function saveStore(store) {
  await fs.mkdir(DATA_DIRECTORY, { recursive: true, mode: 0o700 });
  const temporaryPath = `${STORE_PATH}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(store), { mode: 0o600 });
  await fs.rename(temporaryPath, STORE_PATH);
}

function updateStore(update) {
  const operation = writeQueue.then(async () => {
    const store = await loadStore();
    const result = await update(store);
    await saveStore(store);
    return result;
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}

async function readStore() {
  await writeQueue;
  return loadStore();
}

async function requireOwner(token) {
  if (!token) throw new QuestionBankError('UNAUTHORIZED', 'Create a profile before managing question sets.', 401);
  const owner = await findProfileByToken(token);
  if (!owner) throw new QuestionBankError('UNAUTHORIZED', 'Your profile session is invalid.', 401);
  return owner;
}

function cleanText(value, field, max, required = false) {
  if (typeof value !== 'string') {
    if (required) throw new QuestionBankError('INVALID_FIELD', `${field} is required.`);
    return '';
  }
  const text = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (text.length > max) throw new QuestionBankError('INVALID_FIELD', `${field} must be ${max} characters or fewer.`);
  if (required && !text) throw new QuestionBankError('INVALID_FIELD', `${field} is required.`);
  return text;
}

function validateTable(table) {
  if (table == null) return null;
  if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
    throw new QuestionBankError('INVALID_TABLE', 'Table columns and rows must be structured arrays.');
  }
  if (table.columns.length < 1 || table.columns.length > 8 || table.rows.length > 30) {
    throw new QuestionBankError('INVALID_TABLE', 'Tables support 1–8 columns and up to 30 rows.');
  }
  const columns = table.columns.map((column, index) => cleanText(column, `Column ${index + 1}`, 80, true));
  const rows = table.rows.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== columns.length) {
      throw new QuestionBankError('INVALID_TABLE', `Row ${rowIndex + 1} must contain ${columns.length} cells.`);
    }
    return row.map((cell) => cleanText(cell, 'Table cell', 300));
  });
  return { columns, rows };
}

function validateQuestion(input, { allowIncomplete = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new QuestionBankError('INVALID_QUESTION', 'Question must be an object.');
  }
  const text = cleanText(input.text, 'Question text', 2000, !allowIncomplete);
  const options = Array.isArray(input.options) ? input.options : [];
  if (!allowIncomplete && options.length !== OPTION_IDS.length) {
    throw new QuestionBankError('INVALID_OPTIONS', 'Exactly four answer options are required.');
  }
  if (options.length > OPTION_IDS.length) {
    throw new QuestionBankError('INVALID_OPTIONS', 'Exactly four answer options are supported.');
  }
  const normalizedOptions = OPTION_IDS.map((id, index) => {
    const option = options[index];
    const optionText = typeof option === 'string' ? option : option?.text;
    if (!allowIncomplete && !cleanText(optionText, `Option ${id}`, 500, true)) {
      throw new QuestionBankError('INVALID_OPTIONS', `Option ${id} cannot be empty.`);
    }
    return { id, text: cleanText(optionText, `Option ${id}`, 500) };
  });
  const topic = cleanText(input.topic, 'Topic', 80);
  const difficulty = cleanText(input.difficulty, 'Difficulty', 20);
  if (!allowIncomplete && !TOPICS.includes(topic)) throw new QuestionBankError('INVALID_TOPIC', 'Choose a supported topic.');
  if (!allowIncomplete && !DIFFICULTIES.includes(difficulty)) throw new QuestionBankError('INVALID_DIFFICULTY', 'Choose Easy, Medium, or Hard.');
  const correctOptionId = input.correctOptionId || '';
  if (!allowIncomplete && !OPTION_IDS.includes(correctOptionId)) {
    throw new QuestionBankError('INVALID_ANSWER', 'Select the correct answer.');
  }
  const timeLimitMs = Number.isInteger(input.timeLimitMs) && input.timeLimitMs >= 5000 && input.timeLimitMs <= 120000
    ? input.timeLimitMs
    : 20000;
  let image = null;
  if (input.image != null) {
    const imageId = cleanText(input.image.id, 'Image ID', 80, true);
    if (!/^[a-f0-9-]{36}$/i.test(imageId)) throw new QuestionBankError('INVALID_IMAGE', 'Question image reference is invalid.');
    image = {
      id: imageId,
      url: `/api/question-images/${imageId}`,
      altText: cleanText(input.image.altText, 'Image description', 200),
    };
  }
  return {
    id: typeof input.id === 'string' && input.id ? input.id : crypto.randomUUID(),
    text,
    options: normalizedOptions,
    correctOptionId: OPTION_IDS.includes(correctOptionId) ? correctOptionId : null,
    topic: TOPICS.includes(topic) ? topic : '',
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : '',
    timeLimitMs,
    explanation: cleanText(input.explanation, 'Explanation', 3000),
    image,
    table: validateTable(input.table),
  };
}

function validateQuestionSetReadiness(questionSet) {
  const issues = [];
  if (!questionSet.name.trim()) issues.push('Add a set name.');
  if (!questionSet.questions.length) issues.push('Add at least one question.');
  questionSet.questions.forEach((question, index) => {
    try {
      validateQuestion(question);
    } catch (error) {
      issues.push(`Question ${index + 1}: ${error.message}`);
    }
  });
  if (questionSet.questions.length > 0) {
    const questionsWithTopic = questionSet.questions.filter((q) => q.topic).length;
    const questionsWithDifficulty = questionSet.questions.filter((q) => q.difficulty).length;
    const questionsWithCorrectAnswer = questionSet.questions.filter(
      (q) => q.correctOptionId && OPTION_IDS.includes(q.correctOptionId)
    ).length;
    if (questionsWithTopic < questionSet.questions.length) issues.push('Add a topic to each question.');
    if (questionsWithDifficulty < questionSet.questions.length) issues.push('Set difficulty for each question.');
    if (questionsWithCorrectAnswer < questionSet.questions.length) issues.push('Set the correct answer for each question.');
  }
  return { ready: issues.length === 0, issues };
}

function setSummary(questionSet, ownerName) {
  const topics = [...new Set(questionSet.questions.map((question) => question.topic).filter(Boolean))];
  const difficultyDistribution = Object.fromEntries(DIFFICULTIES.map((difficulty) => [
    difficulty,
    questionSet.questions.filter((question) => question.difficulty === difficulty).length,
  ]));
  const readiness = validateQuestionSetReadiness(questionSet);
  return {
    id: questionSet.id,
    name: questionSet.name,
    description: questionSet.description,
    defaultTopic: questionSet.defaultTopic,
    defaultDifficulty: questionSet.defaultDifficulty,
    status: questionSet.status,
    questionCount: questionSet.questions.length,
    topics,
    difficultyDistribution,
    createdBy: ownerName,
    createdAt: questionSet.createdAt,
    updatedAt: questionSet.updatedAt,
    readiness,
  };
}

async function listQuestionSets(token, { search = '', topic = '', difficulty = '', status = '' } = {}) {
  const owner = await requireOwner(token);
  const store = await readStore();
  const query = search.trim().toLocaleLowerCase();
  return store.sets
    .filter((questionSet) => questionSet.ownerId === owner.id)
    .filter((questionSet) => !status || questionSet.status === status)
    .filter((questionSet) => !topic || questionSet.questions.some((question) => question.topic === topic))
    .filter((questionSet) => !difficulty || questionSet.questions.some((question) => question.difficulty === difficulty))
    .filter((questionSet) => !query || questionSet.name.toLocaleLowerCase().includes(query)
      || questionSet.description.toLocaleLowerCase().includes(query)
      || questionSet.questions.some((question) => question.text.toLocaleLowerCase().includes(query)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((questionSet) => setSummary(questionSet, owner.fullName));
}

async function createQuestionSet(token, input = {}) {
  const owner = await requireOwner(token);
  const name = cleanText(input.name, 'Set name', 120);
  const description = cleanText(input.description, 'Description', 1000);
  const defaultTopic = cleanText(input.defaultTopic, 'Default topic', 80);
  const defaultDifficulty = cleanText(input.defaultDifficulty, 'Default difficulty', 20);
  if (defaultTopic && !TOPICS.includes(defaultTopic)) throw new QuestionBankError('INVALID_TOPIC', 'Choose a supported default topic.');
  if (defaultDifficulty && !DIFFICULTIES.includes(defaultDifficulty)) throw new QuestionBankError('INVALID_DIFFICULTY', 'Choose Easy, Medium, or Hard.');
  const now = new Date().toISOString();
  const questionSet = {
    id: crypto.randomUUID(),
    ownerId: owner.id,
    name,
    description,
    defaultTopic,
    defaultDifficulty,
    status: 'draft',
    questions: [],
    createdAt: now,
    updatedAt: now,
  };
  await updateStore((store) => { store.sets.push(questionSet); });
  return setSummary(questionSet, owner.fullName);
}

async function getQuestionSet(token, setId) {
  const owner = await requireOwner(token);
  const store = await readStore();
  const questionSet = store.sets.find((entry) => entry.id === setId && entry.ownerId === owner.id);
  return questionSet ? { ...questionSet, createdBy: owner.fullName, readiness: validateQuestionSetReadiness(questionSet) } : null;
}

async function updateQuestionSet(token, setId, input = {}) {
  const owner = await requireOwner(token);
  return updateStore((store) => {
    const questionSet = store.sets.find((entry) => entry.id === setId && entry.ownerId === owner.id);
    if (!questionSet) return null;
    if (Object.hasOwn(input, 'name')) questionSet.name = cleanText(input.name, 'Set name', 120);
    if (Object.hasOwn(input, 'description')) questionSet.description = cleanText(input.description, 'Description', 1000);
    if (Object.hasOwn(input, 'defaultTopic')) {
      const value = cleanText(input.defaultTopic, 'Default topic', 80);
      if (value && !TOPICS.includes(value)) throw new QuestionBankError('INVALID_TOPIC', 'Choose a supported default topic.');
      questionSet.defaultTopic = value;
    }
    if (Object.hasOwn(input, 'defaultDifficulty')) {
      const value = cleanText(input.defaultDifficulty, 'Default difficulty', 20);
      if (value && !DIFFICULTIES.includes(value)) throw new QuestionBankError('INVALID_DIFFICULTY', 'Choose Easy, Medium, or Hard.');
      questionSet.defaultDifficulty = value;
    }
    if (Object.hasOwn(input, 'status')) {
      if (!['draft', 'ready', 'archived'].includes(input.status)) throw new QuestionBankError('INVALID_STATUS', 'Status must be draft, ready, or archived.');
      if (input.status === 'ready') {
        const readiness = validateQuestionSetReadiness(questionSet);
        if (!readiness.ready) throw new QuestionBankError('SET_NOT_READY', readiness.issues.join(' '));
      }
      questionSet.status = input.status;
    }
    questionSet.updatedAt = new Date().toISOString();
    return { ...questionSet, createdBy: owner.fullName, readiness: validateQuestionSetReadiness(questionSet) };
  });
}

async function deleteQuestionSet(token, setId) {
  const owner = await requireOwner(token);
  return updateStore((store) => {
    const index = store.sets.findIndex((entry) => entry.id === setId && entry.ownerId === owner.id);
    if (index < 0) return false;
    store.sets.splice(index, 1);
    return true;
  });
}

async function duplicateQuestionSet(token, setId) {
  const owner = await requireOwner(token);
  const now = new Date().toISOString();
  return updateStore((store) => {
    const original = store.sets.find((entry) => entry.id === setId && entry.ownerId === owner.id);
    if (!original) return null;
    const duplicate = {
      ...JSON.parse(JSON.stringify(original)),
      id: crypto.randomUUID(),
      name: `${original.name} Copy`.slice(0, 120),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      questions: original.questions.map((question, index) => ({
        ...question,
        id: crypto.randomUUID(),
        order: index,
      })),
    };
    store.sets.push(duplicate);
    return { ...duplicate, createdBy: owner.fullName, readiness: validateQuestionSetReadiness(duplicate) };
  });
}

async function addQuestion(token, setId, input) {
  const owner = await requireOwner(token);
  const question = validateQuestion(input);
  if (question.image && !await questionImageBelongsToOwner(question.image.id, owner.id)) {
    throw new QuestionBankError('INVALID_IMAGE', 'This image is not available to your profile.');
  }
  return updateStore((store) => {
    const questionSet = store.sets.find((entry) => entry.id === setId && entry.ownerId === owner.id);
    if (!questionSet) return null;
    question.id = crypto.randomUUID();
    question.order = questionSet.questions.length;
    questionSet.questions.push(question);
    questionSet.status = 'draft';
    questionSet.updatedAt = new Date().toISOString();
    return question;
  });
}

async function updateQuestion(token, setId, questionId, input) {
  const owner = await requireOwner(token);
  const question = validateQuestion({ ...input, id: questionId });
  if (question.image && !await questionImageBelongsToOwner(question.image.id, owner.id)) {
    throw new QuestionBankError('INVALID_IMAGE', 'This image is not available to your profile.');
  }
  return updateStore((store) => {
    const questionSet = store.sets.find((entry) => entry.id === setId && entry.ownerId === owner.id);
    if (!questionSet) return null;
    const index = questionSet.questions.findIndex((entry) => entry.id === questionId);
    if (index < 0) return undefined;
    question.order = questionSet.questions[index].order;
    questionSet.questions[index] = question;
    questionSet.status = 'draft';
    questionSet.updatedAt = new Date().toISOString();
    return question;
  });
}

async function deleteQuestion(token, setId, questionId) {
  const owner = await requireOwner(token);
  return updateStore((store) => {
    const questionSet = store.sets.find((entry) => entry.id === setId && entry.ownerId === owner.id);
    if (!questionSet) return false;
    const index = questionSet.questions.findIndex((entry) => entry.id === questionId);
    if (index < 0) return false;
    questionSet.questions.splice(index, 1);
    questionSet.questions.forEach((question, order) => { question.order = order; });
    questionSet.status = 'draft';
    questionSet.updatedAt = new Date().toISOString();
    return true;
  });
}

async function duplicateQuestion(token, setId, questionId) {
  const owner = await requireOwner(token);
  return updateStore((store) => {
    const questionSet = store.sets.find((entry) => entry.id === setId && entry.ownerId === owner.id);
    if (!questionSet) return null;
    const index = questionSet.questions.findIndex((entry) => entry.id === questionId);
    if (index < 0) return undefined;
    const original = questionSet.questions[index];
    const duplicate = { ...JSON.parse(JSON.stringify(original)), id: crypto.randomUUID(), order: index + 1 };
    questionSet.questions.splice(index + 1, 0, duplicate);
    questionSet.questions.forEach((question, order) => { question.order = order; });
    questionSet.status = 'draft';
    questionSet.updatedAt = new Date().toISOString();
    return duplicate;
  });
}

async function reorderQuestions(token, setId, questionIds) {
  const owner = await requireOwner(token);
  if (!Array.isArray(questionIds) || questionIds.some((id) => typeof id !== 'string')) {
    throw new QuestionBankError('INVALID_ORDER', 'Question order must be a list of IDs.');
  }
  return updateStore((store) => {
    const questionSet = store.sets.find((entry) => entry.id === setId && entry.ownerId === owner.id);
    if (!questionSet) return null;
    const currentIds = questionSet.questions.map((question) => question.id);
    if (questionIds.length !== currentIds.length || new Set(questionIds).size !== currentIds.length || currentIds.some((id) => !questionIds.includes(id))) {
      throw new QuestionBankError('INVALID_ORDER', 'The new order must contain each question exactly once.');
    }
    const questionsById = new Map(questionSet.questions.map((question) => [question.id, question]));
    questionSet.questions = questionIds.map((id, order) => ({ ...questionsById.get(id), order }));
    questionSet.status = 'draft';
    questionSet.updatedAt = new Date().toISOString();
    return questionSet.questions;
  });
}

async function getReadyQuestionSet(token, setId) {
  const owner = await requireOwner(token);
  const store = await readStore();
  const questionSet = store.sets.find((entry) => entry.id === setId && entry.ownerId === owner.id);
  if (!questionSet) throw new QuestionBankError('SET_NOT_FOUND', 'Question set not found.', 404);
  if (questionSet.status !== 'ready' || !validateQuestionSetReadiness(questionSet).ready) {
    throw new QuestionBankError('SET_NOT_READY', 'Save a valid ready question set before starting a quiz.', 409);
  }
  return {
    id: questionSet.id,
    name: questionSet.name,
    questions: questionSet.questions.map((question, index) => ({ ...JSON.parse(JSON.stringify(question)), order: index })),
  };
}

module.exports = {
  TOPICS,
  DIFFICULTIES,
  QuestionBankError,
  validateQuestion,
  validateQuestionSetReadiness,
  listQuestionSets,
  createQuestionSet,
  getQuestionSet,
  updateQuestionSet,
  deleteQuestionSet,
  duplicateQuestionSet,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  duplicateQuestion,
  reorderQuestions,
  getReadyQuestionSet,
};
