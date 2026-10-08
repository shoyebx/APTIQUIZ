const http = require('http');
const next = require('next');
const { Server } = require('socket.io');
const { createRoom, getRoomState, joinRoom, validateAnswer } = require('./lib/game-engine');

const port = Number(process.env.PORT || 3000);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, hostname: '0.0.0.0', port });
const handle = app.getRequestHandler();
const rooms = new Map();

function getRoomByCode(code) {
  if (!code) return null;
  return rooms.get(String(code).toUpperCase()) || null;
}

function broadcastRoom(room) {
  const payload = getRoomState(room);
  const io = globalThis.aptiQuizIo;
  if (!io) return;
  io.to(room.code).emit('room_state', payload);
}

function beginQuestion(room) {
  if (!room.questions || room.questions.length === 0) {
    room.state = 'FINISHED';
    broadcastRoom(room);
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

  broadcastRoom(room);
  globalThis.aptiQuizIo.to(room.code).emit('question_started', {
    room: getRoomState(room),
    question: room.currentQuestion,
  });

  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
  }

  room.questionTimer = setTimeout(() => finishQuestion(room), room.currentQuestion.timeLimitMs + 200);
}

function finishQuestion(room) {
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

  broadcastRoom(room);
  globalThis.aptiQuizIo.to(room.code).emit('round_results', {
    room: getRoomState(room),
    question: room.currentQuestion,
    results: room.questionResults,
  });

  if (room.questionIndex >= room.questions.length - 1) {
    room.questionTimer = setTimeout(() => {
      room.state = 'FINISHED';
      room.currentQuestion = null;
      room.questionStartedAt = null;
      room.questionEndsAt = null;
      broadcastRoom(room);
      globalThis.aptiQuizIo.to(room.code).emit('game_finished', {
        room: getRoomState(room),
        leaderboard: getRoomState(room).leaderboard,
      });
    }, 3500);
    return;
  }

  room.questionTimer = setTimeout(() => {
    room.questionIndex += 1;
    beginQuestion(room);
  }, 3500);
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
    socket.on('host_create_room', ({ hostName }) => {
      const room = createRoom({ hostName: hostName || 'Host' });
      rooms.set(room.code, room);
      socket.join(room.code);
      socket.data.roomCode = room.code;
      socket.data.playerId = room.hostId;
      socket.emit('room_created', { roomCode: room.code, room: getRoomState(room) });
      socket.emit('room_state', getRoomState(room));
    });

    socket.on('join_room', ({ roomCode, name, college, playerId }) => {
      const room = getRoomByCode(roomCode);
      if (!room) {
        socket.emit('error', sanitizeError('Room not found. Check the code and try again.'));
        return;
      }

      const joinResult = joinRoom(room, { name, college, playerId });
      if (!joinResult.ok) {
        socket.emit('error', sanitizeError(joinResult.reason || 'Unable to join room.'));
        return;
      }

      socket.data.roomCode = room.code;
      socket.data.playerId = joinResult.player.id;
      socket.join(room.code);

      io.to(room.code).emit('player_joined', { player: joinResult.player, room: getRoomState(room) });
      broadcastRoom(room);
    });

    socket.on('player_reconnect', ({ roomCode, playerId, name }) => {
      const room = getRoomByCode(roomCode);
      if (!room) {
        socket.emit('error', sanitizeError('That room no longer exists.'));
        return;
      }

      const restored = joinRoom(room, { name, playerId });
      if (!restored.ok) {
        socket.emit('error', sanitizeError(restored.reason || 'Reconnect failed.'));
        return;
      }

      socket.data.roomCode = room.code;
      socket.data.playerId = restored.player.id;
      socket.join(room.code);
      socket.emit('reconnect_state', { room: getRoomState(room), playerId: restored.player.id });
      socket.emit('room_state', getRoomState(room));
    });

    socket.on('host_start_game', ({ roomCode }) => {
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
      room.players.forEach((player) => {
        player.score = 0;
        player.answered = false;
        player.lastAnswer = null;
      });

      beginQuestion(room);
    });

    socket.on('request_current_state', ({ roomCode }) => {
      const room = getRoomByCode(roomCode);
      if (!room) {
        socket.emit('error', sanitizeError('Room not found.'));
        return;
      }
      socket.emit('room_state', getRoomState(room));
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
      broadcastRoom(room);
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
      broadcastRoom(room);
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`AptiQuiz server running at http://localhost:${port}`);
  });
});
