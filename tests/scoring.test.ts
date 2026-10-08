import { describe, expect, it } from 'vitest';
import { calculateScore, summarizePlayerStats } from '../lib/scoring';

describe('scoring engine', () => {
  it('awards points for correct answers with speed bonus', () => {
    const result = calculateScore({
      isCorrect: true,
      remainingMs: 15000,
      totalMs: 20000,
      basePoints: 500,
    });

    expect(result).toBeGreaterThan(500);
    expect(result).toBe(500 + Math.floor(500 * (15000 / 20000)));
  });

  it('returns zero for incorrect answers', () => {
    expect(calculateScore({ isCorrect: false, remainingMs: 5000, totalMs: 20000, basePoints: 500 })).toBe(0);
  });

  it('summarizes player performance', () => {
    const summary = summarizePlayerStats({
      totalQuestions: 4,
      correct: 3,
      incorrect: 1,
      totalResponseMs: 12000,
    });

    expect(summary.accuracy).toBe(75);
    expect(summary.avgResponseMs).toBe(3000);
  });
});
