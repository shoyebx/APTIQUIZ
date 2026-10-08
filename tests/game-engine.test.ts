import { describe, expect, it } from 'vitest';
import { createRoom, getRoomState, validateAnswer } from '../lib/game-engine';

describe('game room engine', () => {
  it('creates an active room with a join code and host', () => {
    const room = createRoom({ hostName: 'Host One' });

    expect(room.code.length).toBeGreaterThan(3);
    expect(room.hostName).toBe('Host One');
    expect(room.players).toHaveLength(1);
  });

  it('rejects late or duplicate answers', () => {
    const room = createRoom({ hostName: 'Host One' });
    room.players[0].id = 'player-1';
    const question = {
      id: 'q1',
      text: 'What is 2 + 2?',
      options: [
        { id: 'a', text: '4' },
        { id: 'b', text: '5' },
        { id: 'c', text: '3' },
      ],
      correctOptionId: 'a',
      topic: 'Quantitative Aptitude',
      difficulty: 'Easy',
      timeLimitMs: 20000,
    };

    room.currentQuestion = question;
    room.questionState = 'QUESTION_ACTIVE';
    room.questionStartedAt = Date.now() - 1000;
    room.questionEndsAt = Date.now() + 20000;

    const first = validateAnswer({ room, playerId: 'player-1', questionId: 'q1', optionId: 'a', now: Date.now() });
    const duplicate = validateAnswer({ room, playerId: 'player-1', questionId: 'q1', optionId: 'b', now: Date.now() });

    expect(first.ok).toBe(true);
    expect(duplicate.ok).toBe(false);
  });

  it('returns room state snapshot', () => {
    const room = createRoom({ hostName: 'Host One' });
    const snapshot = getRoomState(room);

    expect(snapshot.code).toBe(room.code);
    expect(snapshot.state).toBe('WAITING');
  });

  it('keeps answer keys and individual responses private in live question snapshots', () => {
    const room = createRoom({ hostName: 'Host One' });
    const playerId = room.players[0].id;
    room.currentQuestion = {
      id: 'media-question',
      text: 'Read the table.',
      options: [
        { id: 'A', text: '10' },
        { id: 'B', text: '20' },
        { id: 'C', text: '30' },
        { id: 'D', text: '40' },
      ],
      correctOptionId: 'B',
      topic: 'Data Interpretation',
      difficulty: 'Medium',
      timeLimitMs: 20000,
      image: { id: 'image-1', url: '/api/question-images/image-1', altText: 'Chart' },
      table: { columns: ['Year', 'Value'], rows: [['2025', '20']] },
    };
    room.questionState = 'QUESTION_ACTIVE';
    room.questionStartedAt = Date.now() - 1000;
    room.questionEndsAt = Date.now() + 19000;
    room.answers = {};

    expect(validateAnswer({ room, playerId, questionId: 'media-question', optionId: 'B' }).ok).toBe(true);
    const snapshot = getRoomState(room);

    expect(snapshot.currentQuestion).toMatchObject({
      image: { url: '/api/question-images/image-1', altText: 'Chart' },
      table: { columns: ['Year', 'Value'], rows: [['2025', '20']] },
    });
    expect(snapshot.currentQuestion).not.toHaveProperty('correctOptionId');
    expect(snapshot.players[0].lastAnswer).toBeNull();
    expect(snapshot.answerDistribution).toEqual([
      { optionId: 'A', count: 0 },
      { optionId: 'B', count: 1 },
      { optionId: 'C', count: 0 },
      { optionId: 'D', count: 0 },
    ]);
  });
});
