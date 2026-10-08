/* eslint-disable @typescript-eslint/no-require-imports */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type ProfileStore = typeof import('../lib/profile-store');
type QuestionBankStore = typeof import('../lib/question-bank-store');

let store: ProfileStore;
let questionBank: QuestionBankStore;
let testDirectory: string;
let originalDataDirectory: string | undefined;

beforeEach(async () => {
  originalDataDirectory = process.env.APTIQUIZ_DATA_DIR;
  testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'aptiquiz-profile-test-'));
  process.env.APTIQUIZ_DATA_DIR = testDirectory;
  const profileStorePath = require.resolve('../lib/profile-store');
  const questionBankStorePath = require.resolve('../lib/question-bank-store');
  delete require.cache[profileStorePath];
  delete require.cache[questionBankStorePath];
  store = require('../lib/profile-store');
  questionBank = require('../lib/question-bank-store');
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

  it('owns question sets and preserves independent, ordered ready snapshots', async () => {
    const { token } = await createTestProfile('question_owner');
    const other = await createTestProfile('other_owner');
    const draft = await questionBank.createQuestionSet(token, { name: 'Placement Round', description: 'First pass' });
    expect(draft).toMatchObject({ status: 'draft', questionCount: 0, readiness: { ready: false } });
    await expect(questionBank.getQuestionSet(other.token, draft.id)).resolves.toBeNull();

    const first = await questionBank.addQuestion(token, draft.id, {
      text: 'How much is 2 + 2?',
      options: ['3', '4', '5', '6'],
      correctOptionId: 'B',
      topic: 'Quantitative Aptitude',
      difficulty: 'Easy',
      explanation: 'Two plus two is four.',
    });
    const second = await questionBank.addQuestion(token, draft.id, {
      text: 'Choose the practical synonym.',
      options: ['Abstract', 'Practical', 'Vague', 'Rare'],
      correctOptionId: 'B',
      topic: 'Verbal Ability',
      difficulty: 'Medium',
    });
    const copy = await questionBank.duplicateQuestion(token, draft.id, first.id);
    await questionBank.reorderQuestions(token, draft.id, [second.id, copy.id, first.id]);
    const ready = await questionBank.updateQuestionSet(token, draft.id, { status: 'ready' });
    expect(ready).toMatchObject({ status: 'ready', readiness: { ready: true } });

    const snapshot = await questionBank.getReadyQuestionSet(token, draft.id);
    expect(snapshot.questions.map((question) => question.text)).toEqual([
      second.text,
      first.text,
      first.text,
    ]);
    expect(new Set(snapshot.questions.map((question) => question.id)).size).toBe(3);
    await questionBank.updateQuestion(token, draft.id, first.id, {
      text: 'Edited original question.',
      options: ['A', 'B', 'C', 'D'],
      correctOptionId: 'A',
      topic: 'Logical Reasoning',
      difficulty: 'Hard',
    });
    const updatedSnapshot = await questionBank.getReadyQuestionSet(token, draft.id).catch(() => null);
    expect(updatedSnapshot).toBeNull();
    const listed = await questionBank.listQuestionSets(token, { search: 'Edited original' });
    expect(listed).toHaveLength(1);
  });
});
