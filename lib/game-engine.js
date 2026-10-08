/* eslint-disable @typescript-eslint/no-require-imports */
const { calculateScore } = require('./scoring');

const sampleQuestions = [
  {
    id: 'q-1',
    text: 'A train travels 180 km in 3 hours. What is its average speed?',
    options: [
      { id: 'a', text: '50 km/h' },
      { id: 'b', text: '60 km/h' },
      { id: 'c', text: '70 km/h' },
      { id: 'd', text: '75 km/h' },
    ],
    correctOptionId: 'b',
    topic: 'Quantitative Aptitude',
    difficulty: 'Easy',
    timeLimitMs: 20000,
    explanation: 'Average speed = distance / time = 180 / 3 = 60 km/h.',
  },
  {
    id: 'q-2',
    text: 'If all roses are flowers and some flowers fade quickly, which statement is definitely true?',
    options: [
      { id: 'a', text: 'All flowers are roses' },
      { id: 'b', text: 'Some roses fade quickly' },
      { id: 'c', text: 'Some flowers are roses' },
      { id: 'd', text: 'No roses fade quickly' },
    ],
    correctOptionId: 'c',
    topic: 'Logical Reasoning',
    difficulty: 'Medium',
    timeLimitMs: 25000,
    explanation: 'Since all roses are flowers, some flowers being roses is a valid conclusion.',
  },
  {
    id: 'q-3',
    text: 'Choose the word closest in meaning to “pragmatic”.',
    options: [
      { id: 'a', text: 'Theoretical' },
      { id: 'b', text: 'Practical' },
      { id: 'c', text: 'Cautious' },
      { id: 'd', text: 'Evasive' },
    ],
    correctOptionId: 'b',
    topic: 'Verbal Ability',
    difficulty: 'Easy',
    timeLimitMs: 18000,
    explanation: 'Pragmatic means practical and focused on results.',
  },
  {
    id: 'q-4',
    text: 'If 15% of a number is 45, what is the number?',
    options: [
      { id: 'a', text: '200' },
      { id: 'b', text: '250' },
      { id: 'c', text: '300' },
      { id: 'd', text: '350' },
    ],
    correctOptionId: 'c',
    topic: 'Quantitative Aptitude',
    difficulty: 'Medium',
    timeLimitMs: 22000,
    explanation: 'If 15% = 45, then 100% = 45 / 0.15 = 300.',
  },
  {
    id: 'q-5',
    text: 'A table shows sales for 5 months: 90, 110, 100, 130, 120. What is the average monthly sales?',
    options: [
      { id: 'a', text: '105' },
      { id: 'b', text: '108' },
      { id: 'c', text: '110' },
      { id: 'd', text: '112' },
    ],
    correctOptionId: 'c',
    topic: 'Data Interpretation',
    difficulty: 'Hard',
    timeLimitMs: 26000,
    explanation: 'Average = (90 + 110 + 100 + 130 + 120) / 5 = 550 / 5 = 110.',
  },
];

function createPlayer({ id, name, college = '', role = 'PLAYER' }) {
  return {
    id,
    name: name || 'Player',
    college,
    role,
    score: 0,
    answered: false,
    connected: true,
    lastAnswer: null,
    lastSeen: Date.now(),
  };
}

function generateRoomCode() {
  const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => pool[Math.floor(Math.random() * pool.length)]).join('');
}

function createRoom({ hostName = 'Host', roomCode } = {}) {
  const code = (roomCode || generateRoomCode()).toUpperCase();
  const hostId = `host-${Date.now().toString(36)}`;
  const room = {
    id: `room-${Date.now().toString(36)}`,
    code,
    hostName,
    hostId,
    state: 'WAITING',
    players: [createPlayer({ id: hostId, name: hostName, role: 'HOST' })],
    questions: sampleQuestions.map((question) => ({ ...question, options: question.options.map((option) => ({ ...option })) })),
    currentQuestion: null,
    questionIndex: 0,
    questionStartedAt: null,
    questionEndsAt: null,
    questionResults: null,
    answers: {},
    createdAt: Date.now(),
  };

  return room;
}

function computeLeaderboard(room) {
  return [...room.players]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((player, index) => ({
      rank: index + 1,
      id: player.id,
      name: player.name,
      score: player.score,
      college: player.college,
      answered: player.answered,
      isHost: player.id === room.hostId,
    }));
}

function getRoomState(room) {
  const roomState = room.questionState || room.state || 'WAITING';
  const safeQuestion = room.currentQuestion
    ? {
        id: room.currentQuestion.id,
        text: room.currentQuestion.text,
        topic: room.currentQuestion.topic,
        difficulty: room.currentQuestion.difficulty,
        timeLimitMs: room.currentQuestion.timeLimitMs,
        options: room.currentQuestion.options.map((option) => ({ id: option.id, text: option.text })),
        image: room.currentQuestion.image ? { url: room.currentQuestion.image.url, altText: room.currentQuestion.image.altText || '' } : null,
        table: room.currentQuestion.table
          ? { columns: [...room.currentQuestion.table.columns], rows: room.currentQuestion.table.rows.map((row) => [...row]) }
          : null,
        ...(roomState === 'QUESTION_ENDED' || roomState === 'FINISHED'
          ? { correctOptionId: room.currentQuestion.correctOptionId, explanation: room.currentQuestion.explanation }
          : {}),
      }
    : null;

  return {
    id: room.id,
    code: room.code,
    hostName: room.hostName,
    hostId: room.hostId,
    state: roomState,
    totalQuestions: room.questions.length,
    questionIndex: room.questionIndex,
    questionStartedAt: room.questionStartedAt,
    questionEndsAt: room.questionEndsAt,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      college: player.college,
      role: player.role,
      score: player.score,
      answered: player.answered,
      connected: player.connected,
      lastAnswer: null,
      isHost: player.id === room.hostId,
    })),
    answerDistribution: roomState === 'QUESTION_ACTIVE' && room.currentQuestion
      ? room.currentQuestion.options.map((option) => ({
          optionId: option.id,
          count: Object.values(room.answers || {}).filter((answer) => answer.optionId === option.id).length,
        }))
      : [],
    leaderboard: computeLeaderboard(room),
    currentQuestion: safeQuestion,
    questionResults: room.questionResults || null,
  };
}

function joinRoom(room, { name, college = '', playerId } = {}) {
  if (!room || !room.code) {
    return { ok: false, reason: 'ROOM_NOT_FOUND' };
  }

  if (room.state === 'FINISHED') {
    return { ok: false, reason: 'GAME_ALREADY_ENDED' };
  }

  const existingPlayer = room.players.find((player) => player.id === playerId);
  if (existingPlayer) {
    existingPlayer.name = name || existingPlayer.name;
    existingPlayer.college = college || existingPlayer.college;
    existingPlayer.connected = true;
    existingPlayer.lastSeen = Date.now();
    return { ok: true, player: existingPlayer };
  }

  const nextPlayer = createPlayer({
    id: playerId || `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    college,
    role: 'PLAYER',
  });

  room.players.push(nextPlayer);
  return { ok: true, player: nextPlayer };
}

function validateAnswer({ room, playerId, questionId, optionId, now = Date.now() }) {
  if (!room || !room.currentQuestion) {
    return { ok: false, reason: 'NO_ACTIVE_QUESTION' };
  }

  const roomState = room.questionState || room.state || 'WAITING';
  if (roomState !== 'QUESTION_ACTIVE') {
    return { ok: false, reason: 'ROUND_NOT_ACTIVE' };
  }

  if (room.currentQuestion.id !== questionId) {
    return { ok: false, reason: 'QUESTION_MISMATCH' };
  }

  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) {
    return { ok: false, reason: 'PLAYER_NOT_FOUND' };
  }

  if (player.answered) {
    return { ok: false, reason: 'DUPLICATE_ANSWER' };
  }

  const validOption = room.currentQuestion.options.some((option) => option.id === optionId);
  if (!validOption) {
    return { ok: false, reason: 'INVALID_OPTION' };
  }

  if (room.questionEndsAt && now > room.questionEndsAt) {
    return { ok: false, reason: 'LATE_ANSWER' };
  }

  const responseMs = Math.max(0, now - (room.questionStartedAt || now));
  const remainingMs = Math.max(0, (room.questionEndsAt || now) - now);
  const isCorrect = optionId === room.currentQuestion.correctOptionId;
  const points = calculateScore({
    isCorrect,
    remainingMs,
    totalMs: room.currentQuestion.timeLimitMs,
    basePoints: 500,
  });

  player.score += points;
  player.answered = true;
  player.lastAnswer = {
    optionId,
    correct: isCorrect,
    points,
    responseMs,
    submittedAt: now,
  };

  room.answers[playerId] = {
    playerId,
    optionId,
    correct: isCorrect,
    points,
    responseMs,
    submittedAt: now,
  };

  return {
    ok: true,
    result: {
      isCorrect,
      points,
      responseMs,
    },
  };
}

module.exports = {
  createRoom,
  joinRoom,
  getRoomState,
  validateAnswer,
  sampleQuestions,
};
