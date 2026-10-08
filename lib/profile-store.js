/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const {
  calculateProgression,
  calculateRankings,
  calculateStats,
} = require('./profile-progression');

const DATA_DIRECTORY = process.env.APTIQUIZ_DATA_DIR || path.join(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIRECTORY, 'profiles.json');
const MAX_AVATAR_BYTES = 256 * 1024;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const EDITABLE_FIELDS = [
  'fullName', 'username', 'avatar', 'college', 'course', 'branch', 'yearOfStudy',
  'bio', 'location', 'profileVisibility', 'showCollege', 'showCourse',
];

let writeQueue = Promise.resolve();

class ProfileError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ProfileError';
    this.code = code;
    this.status = status;
  }
}

function emptyStore() {
  return { profiles: [] };
}

async function loadStore() {
  try {
    const content = await fs.readFile(STORE_PATH, 'utf8');
    const store = JSON.parse(content);
    return Array.isArray(store.profiles) ? store : emptyStore();
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

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function requireToken(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
    throw new ProfileError('UNAUTHORIZED', 'A valid profile session is required.', 401);
  }
  return hashToken(token);
}

function cleanText(value, field, maxLength, { required = false, minLength = 0, rejectMarkup = false } = {}) {
  if (typeof value !== 'string') {
    if (required) throw new ProfileError('INVALID_FIELD', `${field} is required.`);
    return '';
  }
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (rejectMarkup && /[<>]/.test(cleaned)) {
    throw new ProfileError('INVALID_FIELD', `${field} cannot contain HTML markup.`);
  }
  if (required && cleaned.length < minLength) {
    throw new ProfileError('INVALID_FIELD', `${field} must be at least ${minLength} characters.`);
  }
  if (cleaned.length > maxLength) {
    throw new ProfileError('INVALID_FIELD', `${field} must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}

function validateAvatar(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_AVATAR_BYTES * 4 / 3) + 128) {
    throw new ProfileError('INVALID_AVATAR', 'Profile image must be 256 KB or smaller.');
  }
  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new ProfileError('INVALID_AVATAR', 'Use a JPG, PNG, or WEBP image.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) {
    throw new ProfileError('INVALID_AVATAR', 'Profile image must be 256 KB or smaller.');
  }
  const validSignature = match[1] === 'jpeg'
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : match[1] === 'png'
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!validSignature) throw new ProfileError('INVALID_AVATAR', 'Image content does not match its file type.');
  return value;
}

function validateInput(input, { creating = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ProfileError('INVALID_BODY', 'Profile details must be an object.');
  }
  const result = {};
  if (creating || Object.hasOwn(input, 'fullName')) {
    result.fullName = cleanText(input.fullName, 'Full name', 80, { required: true, minLength: 2, rejectMarkup: true });
  }
  if (creating || Object.hasOwn(input, 'username')) {
    result.username = cleanText(input.username, 'Username', 20, { required: true }).toLowerCase();
    if (!USERNAME_PATTERN.test(result.username)) {
      throw new ProfileError('INVALID_USERNAME', 'Username must be 3–20 letters, numbers, or underscores.');
    }
  }
  if (Object.hasOwn(input, 'avatar')) result.avatar = validateAvatar(input.avatar);
  for (const [key, label, maximum] of [
    ['college', 'College / University', 120],
    ['course', 'Course', 100],
    ['branch', 'Branch', 100],
    ['bio', 'Bio', 300],
    ['location', 'Location', 100],
  ]) {
    if (Object.hasOwn(input, key)) result[key] = cleanText(input[key], label, maximum, { rejectMarkup: true });
  }
  if (Object.hasOwn(input, 'yearOfStudy')) {
    if (input.yearOfStudy === '' || input.yearOfStudy == null) result.yearOfStudy = null;
    else if (!Number.isInteger(input.yearOfStudy) || input.yearOfStudy < 1 || input.yearOfStudy > 8) {
      throw new ProfileError('INVALID_FIELD', 'Year of study must be between 1 and 8.');
    } else result.yearOfStudy = input.yearOfStudy;
  }
  if (Object.hasOwn(input, 'profileVisibility')) {
    if (!['public', 'private'].includes(input.profileVisibility)) {
      throw new ProfileError('INVALID_FIELD', 'Profile visibility must be public or private.');
    }
    result.profileVisibility = input.profileVisibility;
  }
  for (const key of ['showCollege', 'showCourse']) {
    if (Object.hasOwn(input, key)) {
      if (typeof input[key] !== 'boolean') throw new ProfileError('INVALID_FIELD', `${key} must be true or false.`);
      result[key] = input[key];
    }
  }
  const unknownFields = Object.keys(input).filter((key) => !EDITABLE_FIELDS.includes(key));
  if (unknownFields.length) throw new ProfileError('INVALID_FIELD', 'Profile contains unsupported fields.');
  return result;
}

function privateProfile(profile, profiles) {
  const progression = calculateProgression(profile.quizHistory);
  return {
    id: profile.id,
    fullName: profile.fullName,
    username: profile.username,
    avatar: profile.avatar,
    college: profile.college,
    course: profile.course,
    branch: profile.branch,
    yearOfStudy: profile.yearOfStudy,
    bio: profile.bio,
    location: profile.location,
    profileVisibility: profile.profileVisibility,
    showCollege: profile.showCollege,
    showCourse: profile.showCourse,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    stats: calculateStats(profile.quizHistory),
    progression,
    rankings: calculateRankings(profiles, profile.id),
    completion: calculateCompletion(profile),
  };
}

function calculateCompletion(profile) {
  const fields = [profile.fullName, profile.username, profile.college, profile.course, profile.yearOfStudy, profile.bio];
  const complete = fields.filter((field) => field != null && String(field).trim() !== '').length;
  return {
    percent: Math.round((complete / fields.length) * 100),
    missing: [
      ['college', profile.college],
      ['course', profile.course],
      ['year of study', profile.yearOfStudy],
      ['bio', profile.bio],
    ].filter(([, value]) => value == null || String(value).trim() === '').map(([label]) => `Add your ${label}`),
  };
}

function publicProfile(profile) {
  if (!profile || profile.profileVisibility !== 'public') return null;
  const progression = calculateProgression(profile.quizHistory);
  const stats = calculateStats(profile.quizHistory);
  return {
    id: profile.id,
    fullName: profile.fullName,
    username: profile.username,
    avatarUrl: profile.avatar ? `/api/profile/${encodeURIComponent(profile.username)}/avatar` : null,
    bio: profile.bio,
    college: profile.showCollege ? profile.college : '',
    course: profile.showCourse ? [profile.course, profile.branch].filter(Boolean).join(' · ') : '',
    level: progression.level,
    levelName: progression.levelName,
    achievements: progression.achievements.filter((achievement) => achievement.unlocked),
    stats: {
      quizzesPlayed: stats.quizzesPlayed,
      wins: stats.wins,
      accuracy: stats.accuracy,
      bestScore: stats.bestScore,
    },
  };
}

async function createProfile(input) {
  const fields = validateInput(input, { creating: true });
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  const profile = await updateStore((store) => {
    if (store.profiles.some((entry) => entry.username === fields.username)) {
      throw new ProfileError('USERNAME_TAKEN', 'That username is already in use.', 409);
    }
    const created = {
      id: crypto.randomUUID(),
      authTokenHash: hashToken(token),
      fullName: fields.fullName,
      username: fields.username,
      avatar: fields.avatar || null,
      college: fields.college || '',
      course: fields.course || '',
      branch: fields.branch || '',
      yearOfStudy: fields.yearOfStudy || null,
      bio: fields.bio || '',
      location: fields.location || '',
      profileVisibility: fields.profileVisibility || 'private',
      showCollege: fields.showCollege || false,
      showCourse: fields.showCourse || false,
      createdAt: now,
      updatedAt: now,
      quizHistory: [],
    };
    store.profiles.push(created);
    return created;
  });
  const profiles = await readStore();
  return { token, profile: privateProfile(profile, profiles.profiles) };
}

async function getProfileByToken(token) {
  const tokenHash = requireToken(token);
  const store = await readStore();
  const profile = store.profiles.find((entry) => entry.authTokenHash === tokenHash);
  return profile ? privateProfile(profile, store.profiles) : null;
}

async function findProfileByToken(token) {
  const tokenHash = requireToken(token);
  const store = await readStore();
  return store.profiles.find((entry) => entry.authTokenHash === tokenHash) || null;
}

async function updateProfile(token, input) {
  const tokenHash = requireToken(token);
  const fields = validateInput(input);
  const now = new Date().toISOString();
  const profile = await updateStore((store) => {
    const current = store.profiles.find((entry) => entry.authTokenHash === tokenHash);
    if (!current) throw new ProfileError('NOT_FOUND', 'Profile not found.', 404);
    if (fields.username && store.profiles.some((entry) => entry.id !== current.id && entry.username === fields.username)) {
      throw new ProfileError('USERNAME_TAKEN', 'That username is already in use.', 409);
    }
    Object.assign(current, fields, { updatedAt: now });
    return current;
  });
  const store = await readStore();
  return privateProfile(profile, store.profiles);
}

async function deleteProfile(token) {
  const tokenHash = requireToken(token);
  return updateStore((store) => {
    const index = store.profiles.findIndex((entry) => entry.authTokenHash === tokenHash);
    if (index < 0) return false;
    store.profiles.splice(index, 1);
    return true;
  });
}

async function getPublicProfileByUsername(username) {
  const store = await readStore();
  const profile = store.profiles.find((entry) => entry.username === String(username).toLowerCase());
  return publicProfile(profile);
}

async function getPublicProfileById(id) {
  const store = await readStore();
  return publicProfile(store.profiles.find((entry) => entry.id === id));
}

async function getPublicProfilesByIds(ids) {
  const requestedIds = new Set(ids);
  const store = await readStore();
  return store.profiles
    .filter((profile) => requestedIds.has(profile.id))
    .map((profile) => publicProfile(profile))
    .filter(Boolean);
}

async function getPublicAvatarByUsername(username) {
  const store = await readStore();
  const profile = store.profiles.find((entry) => entry.username === String(username).toLowerCase());
  if (!profile || profile.profileVisibility !== 'public' || !profile.avatar) return null;
  const match = profile.avatar.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return null;
  return {
    contentType: `image/${match[1]}`,
    buffer: Buffer.from(match[2], 'base64'),
  };
}

async function getProfileHistory(token, { page = 1, pageSize = 10, quizId = '' } = {}) {
  const tokenHash = requireToken(token);
  const store = await readStore();
  const profile = store.profiles.find((entry) => entry.authTokenHash === tokenHash);
  if (!profile) return null;
  if (quizId) return profile.quizHistory.find((quiz) => quiz.id === quizId) || null;
  const total = profile.quizHistory.length;
  const start = (page - 1) * pageSize;
  return {
    items: profile.quizHistory.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    hasMore: start + pageSize < total,
  };
}

async function recordCompletedQuizzes(entries) {
  const validEntries = entries.filter(({ profileId, quiz }) => profileId && quiz?.id && Array.isArray(quiz.answers));
  if (!validEntries.length) return 0;
  return updateStore((store) => {
    let recorded = 0;
    for (const { profileId, quiz } of validEntries) {
      const profile = store.profiles.find((entry) => entry.id === profileId);
      if (!profile || profile.quizHistory.some((entry) => entry.id === quiz.id)) continue;
      const answers = quiz.answers.map((answer) => ({
        questionId: String(answer.questionId),
        topic: typeof answer.topic === 'string' ? answer.topic : '',
        correct: answer.correct === true,
        responseMs: Number.isFinite(answer.responseMs) ? Math.max(0, answer.responseMs) : null,
        points: Number.isFinite(answer.points) ? Math.max(0, answer.points) : 0,
      }));
      profile.quizHistory.unshift({
        id: String(quiz.id),
        roomCode: String(quiz.roomCode),
        name: String(quiz.name || `AptiQuiz Room ${quiz.roomCode}`),
        playedAt: new Date(quiz.playedAt || Date.now()).toISOString(),
        totalQuestions: Math.max(0, Math.trunc(quiz.totalQuestions || answers.length)),
        score: Math.max(0, Math.trunc(quiz.score || 0)),
        rank: Math.max(0, Math.trunc(quiz.rank || 0)),
        answers,
      });
      recorded += 1;
    }
    return recorded;
  });
}

async function recordCompletedQuiz(profileId, quiz) {
  return (await recordCompletedQuizzes([{ profileId, quiz }])) > 0;
}

module.exports = {
  DATA_DIRECTORY,
  MAX_AVATAR_BYTES,
  ProfileError,
  createProfile,
  getProfileByToken,
  findProfileByToken,
  updateProfile,
  deleteProfile,
  getPublicProfileByUsername,
  getPublicProfileById,
  getPublicProfilesByIds,
  getPublicAvatarByUsername,
  getProfileHistory,
  recordCompletedQuiz,
  recordCompletedQuizzes,
  validateAvatar,
};
