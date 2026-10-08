/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { findProfileByToken } = require('./profile-store');

const ROOT_DIRECTORY = process.env.APTIQUIZ_DATA_DIR || path.join(process.cwd(), '.data');
const MEDIA_DIRECTORY = path.join(ROOT_DIRECTORY, 'question-media');
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = {
  'image/png': { extension: 'png', signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/jpeg': { extension: 'jpg', signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/webp': { extension: 'webp', signature: (buffer) => buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
};

class QuestionImageError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'QuestionImageError';
    this.code = code;
    this.status = status;
  }
}

async function storeQuestionImage(token, buffer, contentType) {
  if (!token) throw new QuestionImageError('UNAUTHORIZED', 'A host profile is required.', 401);
  const owner = await findProfileByToken(token);
  if (!owner) throw new QuestionImageError('UNAUTHORIZED', 'Your profile session is invalid.', 401);
  const imageType = IMAGE_TYPES[contentType];
  if (!imageType || !Buffer.isBuffer(buffer)) throw new QuestionImageError('INVALID_IMAGE', 'Use a PNG, JPG, or WEBP image.');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new QuestionImageError('IMAGE_TOO_LARGE', 'Question images must be 2 MB or smaller.', 413);
  if (!imageType.signature(buffer)) throw new QuestionImageError('INVALID_IMAGE', 'Image content does not match its file type.');

  await fs.mkdir(MEDIA_DIRECTORY, { recursive: true, mode: 0o700 });
  const id = crypto.randomUUID();
  const filePath = path.join(MEDIA_DIRECTORY, `${id}.${imageType.extension}`);
  const metadataPath = path.join(MEDIA_DIRECTORY, `${id}.json`);
  await fs.writeFile(filePath, buffer, { mode: 0o600, flag: 'wx' });
  await fs.writeFile(metadataPath, JSON.stringify({ id, ownerId: owner.id, contentType, extension: imageType.extension }), { mode: 0o600, flag: 'wx' });
  return { id, url: `/api/question-images/${id}`, contentType, size: buffer.length };
}

async function getQuestionImage(id) {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) return null;
  try {
    const metadata = JSON.parse(await fs.readFile(path.join(MEDIA_DIRECTORY, `${id}.json`), 'utf8'));
    if (metadata.id !== id || !IMAGE_TYPES[metadata.contentType]) return null;
    const buffer = await fs.readFile(path.join(MEDIA_DIRECTORY, `${id}.${metadata.extension}`));
    return { buffer, contentType: metadata.contentType };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function questionImageBelongsToOwner(id, ownerId) {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) return false;
  try {
    const metadata = JSON.parse(await fs.readFile(path.join(MEDIA_DIRECTORY, `${id}.json`), 'utf8'));
    return metadata.id === id && metadata.ownerId === ownerId;
  } catch {
    return false;
  }
}

module.exports = {
  MAX_IMAGE_BYTES,
  QuestionImageError,
  storeQuestionImage,
  getQuestionImage,
  questionImageBelongsToOwner,
};
