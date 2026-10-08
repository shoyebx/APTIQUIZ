const { io } = require('socket.io-client');

const socketUrl = process.env.SOCKET_URL || 'http://localhost:3000';
const totalPlayers = 50;
const sockets = [];
let roomCode = null;
let roomReady = false;

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`[sim] ${message}`);
}

const hostSocket = io(socketUrl, { transports: ['websocket'] });

hostSocket.on('connect', () => {
  log('Host connected');
  hostSocket.emit('host_create_room', { hostName: 'Load Test Host' });
});

hostSocket.on('room_created', ({ roomCode: createdCode }) => {
  roomCode = createdCode;
  log(`Room created: ${roomCode}`);

  for (let index = 0; index < totalPlayers; index += 1) {
    const socket = io(socketUrl, { transports: ['websocket'] });
    const playerName = `Sim Player ${index + 1}`;
    socket.data = { playerName, roomCode, playerId: null };
    sockets.push(socket);

    socket.on('connect', () => {
      socket.emit('join_room', {
        roomCode,
        name: playerName,
        college: 'Load Test Campus',
      });
    });

    socket.on('room_state', (room) => {
      if (!socket.data.playerId) {
        const player = room.players.find((entry) => entry.name === playerName);
        if (player) {
          socket.data.playerId = player.id;
        }
      }

      if (room.state === 'WAITING' && room.players.length >= totalPlayers + 1 && !roomReady) {
        roomReady = true;
        log(`All ${totalPlayers + 1} players connected. Starting game.`);
        setTimeout(() => {
          hostSocket.emit('host_start_game', { roomCode });
        }, 1500);
      }
    });

    socket.on('question_started', ({ question }) => {
      const optionId = question.options[Math.floor(Math.random() * question.options.length)].id;
      setTimeout(() => {
        if (socket.data.playerId) {
          socket.emit('submit_answer', {
            roomCode,
            playerId: socket.data.playerId,
            questionId: question.id,
            optionId,
          });
        }
      }, 600 + Math.random() * 5000);
    });
  }
});

hostSocket.on('error', ({ message }) => {
  log(`Host error: ${message}`);
});

process.on('SIGINT', () => {
  sockets.forEach((socket) => socket.disconnect());
  hostSocket.disconnect();
  process.exit(0);
});

log(`Starting ${totalPlayers} simulated players against ${socketUrl}`);
