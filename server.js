/* eslint-disable @typescript-eslint/no-require-imports */
const http = require('http');
const next = require('next');
const { Server } = require('socket.io');
const { createRoom, getRoomState, joinRoom, validateAnswer } = require('./lib/game-engine');
const { findProfileByToken, getPublicProfilesByIds, recordCompletedQuizzes } = require('./lib/profile-store');

const port = Number(process.env.PORT || 3000);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, hostname: '0.0.0.0', port });
const handle = app.getRequestHandler();
const rooms = new Map();

function getRoomByCode(code) {
  if (!code) return null;
  return rooms.get(String(code).toUpperCase()) || null;
}

async function getRoomSnapshot(room) {
  const profiles = await getPublicProfilesByIds(room.players.map((player) => player.profileId).filter(Boolean));
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  room.players.forEach((player) => {
    if (!player.profileId) return;
    const profile = profilesById.get(player.profileId);
    player.publicProfile = publicRoomIdentity(profile);
    player.college = profile?.college || '';
  });
  const snapshot = getRoomState(room);
  const publicProfiles = new Map(room.players.map((player) => [player.id, player.publicProfile || null]));
  return {
    ...snapshot,
    players: snapshot.players.map((player) => ({ ...player, publicProfile: publicProfiles.get(player.id) || null })),
    leaderboard: snapshot.leaderboard.map((entry) => ({ ...entry, publicProfile: publicProfiles.get(entry.id) || null })),
  };
}

function publicRoomIdentity(profile) {
  if (!profile) return null;
  return {
    fullName: profile.fullName,
    username: profile.username,
    avatarUrl: profile.avatarUrl,
    college: profile.college,
    course: profile.course,
    level: profile.level,
    levelName: profile.levelName,
  };
}

function attachProfile(player, profile) {
  if (!profile) return;
  player.profileId = profile.id;
}

async function resolveProfile(token) {
  if (!token) return null;
  const profile = await findProfileByToken(token);
  if (!profile) throw new Error('Profile session is invalid. Recreate your profile to continue.');
  return profile;
}

async function broadcastRoom(room) {
  const payload = await getRoomSnapshot(room);
  const io = globalThis.aptiQuizIo;
  if (!io) return;
  io.to(room.code).emit('room_state', payload);
}

function collectRoundProfileAnswers(room) {
  if (!Array.isArray(room.profileRounds)) room.profileRounds = [];
  room.profileRounds.push({
    questionId: room.currentQuestion.id,
    topic: room.currentQuestion.topic || '',
    answers: room.players.map((player) => {
      const answer = room.answers[player.id] || null;
      return {
        playerId: player.id,
        questionId: room.currentQuestion.id,
        topic: room.currentQuestion.topic || '',
        correct: !!answer?.correct,
        responseMs: answer?.responseMs ?? null,
        points: answer?.points || 0,
      };
    }),
  });
}

async function recordCompletedRoom(room) {
  const leaderboard = getRoomState(room).leaderboard;
  const records = [];
  for (const player of room.players) {
    if (!player.profileId || player.role === 'HOST') continue;
    const entry = leaderboard.find((candidate) => candidate.id === player.id);
    records.push({ profileId: player.profileId, quiz: {
      id: `${room.id}:${player.id}`,
      roomCode: room.code,
      name: `AptiQuiz Room ${room.code}`,
      playedAt: room.finishedAt || Date.now(),
      totalQuestions: room.questions.length,
      score: player.score,
      rank: entry?.rank || 0,
      answers: (room.profileRounds || []).flatMap((round) => round.answers.filter((answer) => answer.playerId === player.id)),
    } });
  }
  await recordCompletedQuizzes(records);
}

async function beginQuestion(room) {
  if (!room.questions || room.questions.length === 0) {
    room.state = 'FINISHED';
    await broadcastRoom(room);
    return;
  }

  room.currentQuestion = room.questions[room.questionIndex];
  room.questionStartedAt = Date.now();
  room.questionEndsAt = room.questionStartedAt + room.currentQuestion.timeLimitMs;
  room.state = 'QUESTION_ACTIVE';
  room.answers = {};

  room.players.forEach((player) => {
    player.answered = false;
    player.lastAnswer = null;
  });

  await broadcastRoom(room);
  globalThis.aptiQuizIo.to(room.code).emit('question_started', {
    room: await getRoomSnapshot(room),
    question: room.currentQuestion,
  });

  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
  }

  room.questionTimer = setTimeout(() => { void finishQuestion(room); }, room.currentQuestion.timeLimitMs + 200);
}

async function finishQuestion(room) {
  collectRoundProfileAnswers(room);
  room.state = 'QUESTION_ENDED';
  room.questionResults = room.players.map((player) => {
    const answer = room.answers[player.id] || null;
    const selectedOption = room.currentQuestion?.options.find((option) => option.id === answer?.optionId);
    return {
      playerId: player.id,
      name: player.name,
      score: player.score,
      correct: !!answer?.correct,
      points: answer?.points || 0,
      selectedOption: selectedOption ? selectedOption.text : null,
      responseMs: answer?.responseMs || null,
    };
  });

  await broadcastRoom(room);
  globalThis.aptiQuizIo.to(room.code).emit('round_results', {
    room: await getRoomSnapshot(room),
    question: room.currentQuestion,
    results: room.questionResults,
  });

  if (room.questionIndex >= room.questions.length - 1) {
    room.questionTimer = setTimeout(() => { void finishRoom(room); }, 3500);
    return;
  }

  room.questionTimer = setTimeout(() => {
    room.questionIndex += 1;
    void beginQuestion(room);
  }, 3500);
}

async function finishRoom(room) {
  room.state = 'FINISHED';
  room.finishedAt = Date.now();
  room.currentQuestion = null;
  room.questionStartedAt = null;
  room.questionEndsAt = null;
  try {
    await recordCompletedRoom(room);
  } catch (error) {
    console.error('Unable to persist quiz history:', error);
  }
  const snapshot = await getRoomSnapshot(room);
  globalThis.aptiQuizIo.to(room.code).emit('room_state', snapshot);
  globalThis.aptiQuizIo.to(room.code).emit('game_finished', {
    room: snapshot,
    leaderboard: snapshot.leaderboard,
  });
}

function sanitizeError(message) {
  return { message };
}

app.prepare().then(() => {
  const server = http.createServer((req, res) => handle(req, res));
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  globalThis.aptiQuizIo = io;

  io.on('connection', (socket) => {
    socket.on('host_create_room', async ({ hostName, profileToken } = {}) => {
      try {
        const profile = await resolveProfile(profileToken);
        const room = createRoom({ hostName: profile?.fullName || hostName || 'Host' });
        room.profileRounds = [];
        await attachProfile(room.players[0], profile);
        rooms.set(room.code, room);
        socket.join(room.code);
        socket.data.roomCode = room.code;
        socket.data.playerId = room.hostId;
        const snapshot = await getRoomSnapshot(room);
        socket.emit('room_created', { roomCode: room.code, room: snapshot });
        socket.emit('room_state', snapshot);
      } catch (error) {
        socket.emit('error', sanitizeError(error.message));
      }
    });

    socket.on('join_room', async ({ roomCode, name, college, playerId, profileToken } = {}) => {
      const room = getRoomByCode(roomCode);
      if (!room) {
        socket.emit('error', sanitizeError('Room not found. Check the code and try again.'));
        return;
      }

      let profile;
      try {
        profile = await resolveProfile(profileToken);
      } catch (error) {
        socket.emit('error', sanitizeError(error.message));
        return;
      }
      const existingPlayer = room.players.find((player) => player.id === playerId);
      if (existingPlayer?.profileId && existingPlayer.profileId !== profile?.id) {
        socket.emit('error', sanitizeError('This player session requires its linked profile.'));
        return;
      }
      const visibleCollege = profile
        ? profile.profileVisibility === 'public' && profile.showCollege ? profile.college : ''
        : college;
      const joinResult = joinRoom(room, { name: profile?.fullName || name, college: visibleCollege, playerId });
      if (!joinResult.ok) {
        socket.emit('error', sanitizeError(joinResult.reason || 'Unable to join room.'));
        return;
      }
      await attachProfile(joinResult.player, profile);

      socket.data.roomCode = room.code;
      socket.data.playerId = joinResult.player.id;
      socket.join(room.code);

      const snapshot = await getRoomSnapshot(room);
      const joinedPlayer = snapshot.players.find((player) => player.id === joinResult.player.id);
      socket.emit('joined_room', { playerId: joinResult.player.id, player: joinedPlayer, room: snapshot });
      io.to(room.code).emit('player_joined', { player: joinedPlayer, room: snapshot });
      await broadcastRoom(room);
    });

    socket.on('player_reconnect', async ({ roomCode, playerId, name, profileToken } = {}) => {
      const room = getRoomByCode(roomCode);
      if (!room) {
        socket.emit('error', sanitizeError('That room no longer exists.'));
        return;
      }

      let profile;
      try {
        profile = await resolveProfile(profileToken);
      } catch (error) {
        socket.emit('error', sanitizeError(error.message));
        return;
      }
      const existingPlayer = room.players.find((player) => player.id === playerId);
      if (existingPlayer?.profileId && existingPlayer.profileId !== profile?.id) {
        socket.emit('error', sanitizeError('This player session requires its linked profile.'));
        return;
      }
      const visibleCollege = profile
        ? profile.profileVisibility === 'public' && profile.showCollege ? profile.college : ''
        : '';
      const restored = joinRoom(room, { name: profile?.fullName || name, college: visibleCollege, playerId });
      if (!restored.ok) {
        socket.emit('error', sanitizeError(restored.reason || 'Reconnect failed.'));
        return;
      }
      await attachProfile(restored.player, profile);

      socket.data.roomCode = room.code;
      socket.data.playerId = restored.player.id;
      socket.join(room.code);
      const snapshot = await getRoomSnapshot(room);
      socket.emit('reconnect_state', { room: snapshot, playerId: restored.player.id });
      socket.emit('room_state', snapshot);
    });

    socket.on('host_start_game', async ({ roomCode }) => {
      const room = getRoomByCode(roomCode);
      if (!room) {
        socket.emit('error', sanitizeError('Room not found.'));
        return;
      }

      if (room.players.length < 1) {
        socket.emit('error', sanitizeError('At least one player is needed to start.'));
        return;
      }

      room.questionIndex = 0;
      room.currentQuestion = null;
      room.questionResults = null;
      room.profileRounds = [];
      room.players.forEach((player) => {
        player.score = 0;
        player.answered = false;
        player.lastAnswer = null;
      });

      await beginQuestion(room);
    });

    socket.on('request_current_state', async ({ roomCode }) => {
      const room = getRoomByCode(roomCode);
      if (!room) {
        socket.emit('error', sanitizeError('Room not found.'));
        return;
      }
      socket.emit('room_state', await getRoomSnapshot(room));
    });

    socket.on('submit_answer', ({ roomCode, playerId, questionId, optionId }) => {
      const room = getRoomByCode(roomCode);
      if (!room) {
        socket.emit('error', sanitizeError('Room not found.'));
        return;
      }

      const validation = validateAnswer({ room, playerId, questionId, optionId, now: Date.now() });
      if (!validation.ok) {
        socket.emit('error', sanitizeError(validation.reason || 'Answer rejected.'));
        return;
      }

      socket.emit('answer_received', {
        questionId,
        optionId,
        points: validation.result.points,
        correct: validation.result.isCorrect,
      });
      void broadcastRoom(room);
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.roomCode;
      const playerId = socket.data.playerId;
      if (!roomCode || !playerId) return;
      const room = getRoomByCode(roomCode);
      if (!room) return;
      const player = room.players.find((entry) => entry.id === playerId);
      if (player) {
        player.connected = false;
        player.lastSeen = Date.now();
      }
      void broadcastRoom(room);
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`AptiQuiz server running at http://localhost:${port}`);
  });
});
