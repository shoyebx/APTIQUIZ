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
});
