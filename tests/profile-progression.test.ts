import { describe, expect, it } from 'vitest';
import {
  calculateProgression,
  calculateRankings,
  calculateStats,
  calculateQuizXp,
} from '../lib/profile-progression';

const sampleQuiz = {
  id: 'quiz-1',
  roomCode: 'A1B2',
  name: 'AptiQuiz Room A1B2',
  playedAt: '2026-10-08T12:00:00.000Z',
  totalQuestions: 2,
  score: 850,
  rank: 1,
  answers: [
    { questionId: 'q1', topic: 'Logical Reasoning', correct: true, responseMs: 3200, points: 450 },
    { questionId: 'q2', topic: 'Logical Reasoning', correct: true, responseMs: 5200, points: 400 },
  ],
};

describe('profile progression', () => {
  it('calculates XP from authoritative quiz results and ranking', () => {
    expect(calculateQuizXp(sampleQuiz)).toBe(95);
    expect(calculateProgression([sampleQuiz])).toMatchObject({
      currentXp: 95,
      level: 1,
      levelName: 'Beginner',
      xpIntoLevel: 95,
      progressPercent: 38,
      wins: 1,
    });
  });

  it('unlocks achievements only when recorded quiz conditions are met', () => {
    const progression = calculateProgression([sampleQuiz]);
    expect(progression.achievements.find((achievement) => achievement.id === 'first-victory')?.unlocked).toBe(true);
    expect(progression.achievements.find((achievement) => achievement.id === 'perfect-accuracy')?.unlocked).toBe(true);
    expect(progression.achievements.find((achievement) => achievement.id === 'speed-demon')?.unlocked).toBe(true);
    expect(progression.achievements.find((achievement) => achievement.id === 'quiz-master')?.unlocked).toBe(false);
  });

  it('derives stats and topic strengths from answered questions only', () => {
    const stats = calculateStats([{
      ...sampleQuiz,
      answers: [...sampleQuiz.answers, { questionId: 'q3', topic: 'Quantitative Aptitude', correct: false, responseMs: null, points: 0 }],
    }]);
    expect(stats).toMatchObject({
      quizzesPlayed: 1,
      averageScore: 850,
      bestScore: 850,
      accuracy: 100,
      averageResponseMs: 4200,
      wins: 1,
      totalQuestions: 2,
      totalQuestionsAnswered: 2,
      strongestArea: { name: 'Logical Reasoning', accuracy: 1, answered: 2 },
    });
    expect(stats.weakestArea).toEqual(stats.strongestArea);
  });

  it('does not assign rankings or best finish before valid quiz history exists', () => {
    const target = { id: 'player-1', username: 'player_1', createdAt: '2026-10-08T00:00:00.000Z', quizHistory: [] };
    expect(calculateRankings([target], target.id)).toEqual({ globalRank: null, collegeRank: null, bestRank: null });
    expect(calculateStats([]).accuracy).toBeNull();
  });
});
