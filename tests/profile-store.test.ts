/* eslint-disable @typescript-eslint/no-require-imports */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type ProfileStore = typeof import('../lib/profile-store');

let store: ProfileStore;
let testDirectory: string;
let originalDataDirectory: string | undefined;

beforeEach(async () => {
  originalDataDirectory = process.env.APTIQUIZ_DATA_DIR;
  testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'aptiquiz-profile-test-'));
  process.env.APTIQUIZ_DATA_DIR = testDirectory;
  const profileStorePath = require.resolve('../lib/profile-store');
  delete require.cache[profileStorePath];
  store = require('../lib/profile-store');
});

afterEach(() => {
  fs.rmSync(testDirectory, { recursive: true, force: true });
  if (originalDataDirectory === undefined) delete process.env.APTIQUIZ_DATA_DIR;
  else process.env.APTIQUIZ_DATA_DIR = originalDataDirectory;
});

async function createTestProfile(username: string) {
  return store.createProfile({ fullName: 'Ada Lovelace', username, college: 'Analytical University' });
}

describe('persistent profiles', () => {
  it('defaults profiles to private and only returns explicitly public fields', async () => {
    const { token, profile } = await createTestProfile('ada_profile');
    expect(profile.profileVisibility).toBe('private');
    expect(await store.getPublicProfileByUsername('ada_profile')).toBeNull();

    await store.updateProfile(token, { profileVisibility: 'public', showCollege: true, showCourse: false });
    await store.updateProfile(token, { college: 'Analytical University', course: 'Mathematics' });
    const publicProfile = await store.getPublicProfileByUsername('ada_profile');
    expect(publicProfile).toMatchObject({
      fullName: 'Ada Lovelace',
      username: 'ada_profile',
      college: 'Analytical University',
      course: '',
      avatarUrl: null,
    });
    expect(publicProfile).not.toHaveProperty('email');
    expect(publicProfile).not.toHaveProperty('authTokenHash');
    expect(publicProfile).not.toHaveProperty('quizHistory');
  });

  it('enforces unique normalized usernames and validates profile text', async () => {
    await createTestProfile('ada_profile');
    await expect(store.createProfile({ fullName: 'Another Ada', username: 'ADA_PROFILE' })).rejects.toMatchObject({ status: 409 });
    await expect(store.createProfile({ fullName: '<script>bad</script>', username: 'bad_profile' })).rejects.toMatchObject({ code: 'INVALID_FIELD' });
    await expect(store.createProfile({ fullName: 'Invalid Username', username: 'bad-name' })).rejects.toMatchObject({ code: 'INVALID_USERNAME' });
  });

  it('records server-owned quiz results once and derives stats and XP', async () => {
    const { token, profile } = await createTestProfile('ada_profile');
    const result = {
      id: 'room-1:player-1',
      roomCode: 'A1B2',
      totalQuestions: 2,
      score: 850,
      rank: 1,
      playedAt: '2026-10-08T12:00:00.000Z',
      answers: [
        { playerId: 'player-1', questionId: 'q1', topic: 'Logical Reasoning', correct: true, responseMs: 3200, points: 450 },
        { playerId: 'player-1', questionId: 'q2', topic: 'Logical Reasoning', correct: true, responseMs: 5200, points: 400 },
      ],
    };

    expect(await store.recordCompletedQuizzes([{ profileId: profile.id, quiz: result }])).toBe(1);
    expect(await store.recordCompletedQuizzes([{ profileId: profile.id, quiz: result }])).toBe(0);
    const saved = await store.getProfileByToken(token);
    const history = await store.getProfileHistory(token, { page: 1, pageSize: 1 });
    expect(saved?.stats).toMatchObject({ quizzesPlayed: 1, wins: 1, accuracy: 100, averageResponseMs: 4200 });
    expect(saved?.progression).toMatchObject({ currentXp: 95, level: 1 });
    expect(history).toMatchObject({ total: 1, hasMore: false, items: [{ score: 850, rank: 1 }] });
  });

  it('validates supported avatar data and removes profiles by owner token', async () => {
    const { token, profile } = await createTestProfile('ada_profile');
    expect(() => store.validateAvatar('data:image/svg+xml;base64,PHN2Zz4=')).toThrow();
    expect(await store.deleteProfile(token)).toBe(true);
    expect(await store.getProfileByToken(token)).toBeNull();
    expect(await store.getPublicProfileById(profile.id)).toBeNull();
  });

  it('ranks completed public competitors by level, XP, then best score', async () => {
    const highLevel = await store.createProfile({ fullName: 'High Level', username: 'high_level', profileVisibility: 'public' });
    const highXp = await store.createProfile({ fullName: 'High XP', username: 'high_xp', profileVisibility: 'public' });
    const highScore = await store.createProfile({ fullName: 'High Score', username: 'high_score', profileVisibility: 'public' });
    const privateProfile = await store.createProfile({ fullName: 'Private Player', username: 'private_player' });
    const levelTwoAnswers = Array.from({ length: 30 }, (_, index) => ({
      questionId: `level-${index}`,
      topic: 'Reasoning',
      correct: true,
      responseMs: 1000,
      points: 10,
    }));
    const tieAnswers = Array.from({ length: 2 }, (_, index) => ({
      questionId: `tie-${index}`,
      topic: 'Reasoning',
      correct: true,
      responseMs: 1000,
      points: 10,
    }));

    await store.recordCompletedQuizzes([
      { profileId: highLevel.profile.id, quiz: { id: 'level', roomCode: 'L1', rank: 4, score: 400, answers: levelTwoAnswers } },
      { profileId: highXp.profile.id, quiz: { id: 'xp', roomCode: 'X1', rank: 2, score: 300, answers: tieAnswers } },
      { profileId: highScore.profile.id, quiz: { id: 'score', roomCode: 'S1', rank: 2, score: 900, answers: tieAnswers } },
      { profileId: privateProfile.profile.id, quiz: { id: 'private', roomCode: 'P1', rank: 1, score: 1000, answers: tieAnswers } },
    ]);

    const leaderboard = await store.getLeaderboardPage({ token: highLevel.token, pageSize: 5 });
    expect(leaderboard.items.map((entry) => entry.username)).toEqual(['high_level', 'high_score', 'high_xp']);
    expect(leaderboard.items[0]).toMatchObject({ rank: 1, level: 2, score: 400 });
    expect(leaderboard.currentUser).toMatchObject({ rank: 1, level: 2 });
    expect(leaderboard.items).not.toContainEqual(expect.objectContaining({ username: 'private_player' }));

    const privateLeaderboard = await store.getLeaderboardPage({ token: privateProfile.token });
    expect(privateLeaderboard.currentUser).toMatchObject({ rank: 2 });
  });
});
