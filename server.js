// server.js
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();
const players = new Map();
const waitingPlayers = [];
const nicknames = new Set();

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const PADDLE_HEIGHT = 100;

function createGameState() {
  return {
    ball: { 
      x: CANVAS_WIDTH/2, 
      y: CANVAS_HEIGHT/2, 
      dx: 5, 
      dy: 5,
      speedMultiplier: 1
    },
    paddles: {
      left: { y: CANVAS_HEIGHT/2 - PADDLE_HEIGHT/2, h: PADDLE_HEIGHT },
      right: { y: CANVAS_HEIGHT/2 - PADDLE_HEIGHT/2, h: PADDLE_HEIGHT }
    },
    score: { left: 0, right: 0 },
    started: false,
    readyPlayers: []
  };
}

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  socket.on("set-nickname", (nickname) => {
    if (nicknames.has(nickname)) {
      socket.emit('nickname-taken');
      return;
    }
    
    nicknames.add(nickname);
    players.set(socket.id, { 
      id: socket.id,
      nickname: nickname,
      roomId: null,
      ready: false
    });
    
    socket.emit('nickname-accepted');
    console.log(`Player ${nickname} (${socket.id}) joined`);
  });

  socket.on("join-random", () => {
    const player = players.get(socket.id);
    if (!player) return;
    
    if (player.roomId) {
      socket.emit('error-message', 'You are already in a game');
      return;
    }
    
    if (waitingPlayers.length > 0) {
      const opponentId = waitingPlayers.shift();
      const opponent = players.get(opponentId);
      
      const roomId = generateRoomId();
      createRoom(roomId, socket.id, opponentId);
      
      console.log(`Match found: ${player.nickname} vs ${opponent.nickname} in room ${roomId}`);
    } else {
      waitingPlayers.push(socket.id);
      console.log(`Player ${player.nickname} is waiting for a match`);
    }
  });

  socket.on("create-room", () => {
    const player = players.get(socket.id);
    if (!player) return;
    
    if (player.roomId) {
      socket.emit('error-message', 'You are already in a game');
      return;
    }
    
    const roomCode = generateRoomCode();
    
    rooms.set(roomCode, {
      id: roomCode,
      players: [socket.id],
      gameState: null,
      started: false
    });
    
    player.roomId = roomCode;
    socket.join(roomCode);
    
    socket.emit('room-created', roomCode);
    console.log(`Room created: ${roomCode} by ${player.nickname}`);
  });

  socket.on("join-room", (roomCode) => {
    const player = players.get(socket.id);
    if (!player) return;
    
    if (player.roomId) {
      socket.emit('error-message', 'You are already in a game');
      return;
    }
    
    if (!rooms.has(roomCode)) {
      socket.emit('error-message', 'Room not found');
      return;
    }
    
    const room = rooms.get(roomCode);
    
    if (room.players.length >= 2) {
      socket.emit('error-message', 'Room is full');
      return;
    }
    
    room.players.push(socket.id);
    player.roomId = roomCode;
    socket.join(roomCode);
    
    io.to(roomCode).emit('match-found');
    console.log(`Player ${player.nickname} joined room ${roomCode}`);
  });

  socket.on("player-ready", () => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    
    const room = rooms.get(player.roomId);
    if (!room) return;
    
    player.ready = true;
    
    const otherPlayerId = room.players.find(id => id !== socket.id);
    const otherPlayer = players.get(otherPlayerId);
    
    io.to(otherPlayerId).emit('ready-status', { opponentReady: true });
    
    if (otherPlayer && otherPlayer.ready) {
      startGame(room);
    }
  });

  socket.on("paddle-move", (y) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    
    const room = rooms.get(player.roomId);
    if (!room || !room.gameState) return;
    
    const playerIndex = room.players.indexOf(socket.id);
    const side = playerIndex === 0 ? 'left' : 'right';
    
    room.gameState.paddles[side].y = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT/2, y - PADDLE_HEIGHT/2));
    
    io.to(player.roomId).emit('game-state', room.gameState);
  });

  socket.on("continue-after-point", () => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    
    const room = rooms.get(player.roomId);
    if (!room) return;
    
    resetBall(room.gameState);
    
    io.to(player.roomId).emit('game-continue', room.gameState);
    
    startGameLoop(room);
  });

  socket.on("chat-message", (message) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    
    socket.to(player.roomId).emit('chat-message', {
      sender: player.nickname,
      message: message
    });
  });

  socket.on("leave-game", () => {
    handlePlayerDisconnect(socket.id);
  });

  socket.on("disconnect", () => {
    console.log('Disconnected:', socket.id);
    handlePlayerDisconnect(socket.id);
    
    const player = players.get(socket.id);
    if (player) {
      nicknames.delete(player.nickname);
      players.delete(socket.id);
    }
  });
});

function createRoom(roomId, player1Id, player2Id) {
  rooms.set(roomId, {
    id: roomId,
    players: [player1Id, player2Id],
    gameState: null,
    started: false,
    gameInterval: null
  });
  
  const player1 = players.get(player1Id);
  const player2 = players.get(player2Id);
  player1.roomId = roomId;
  player2.roomId = roomId;
  
  io.sockets.sockets.get(player1Id).join(roomId);
  io.sockets.sockets.get(player2Id).join(roomId);
  
  io.to(roomId).emit('match-found');
}

function startGame(room) {
  room.gameState = {
    ball: { x: CANVAS_WIDTH/2, y: CANVAS_HEIGHT/2, dx: 5, dy: 3 },
    paddles: {
      left: { y: CANVAS_HEIGHT/2 - PADDLE_HEIGHT/2 },
      right: { y: CANVAS_HEIGHT/2 - PADDLE_HEIGHT/2 }
    },
    score: { left: 0, right: 0 }
  };
  
  room.started = true;
  io.to(room.id).emit('game-start', room.gameState);
  
  startGameLoop(room);
}

function startGameLoop(room) {
  if (room.gameInterval) {
    clearInterval(room.gameInterval);
  }
  
  room.gameInterval = setInterval(() => {
    updateGame(room);
  }, 1000/60);
}

function updateGame(room) {
  const state = room.gameState;
  
  state.ball.x += state.ball.dx;
  state.ball.y += state.ball.dy;
  
  if (state.ball.y <= 0 || state.ball.y >= CANVAS_HEIGHT) {
    state.ball.dy = -state.ball.dy;
  }

  if (state.ball.x <= 30 && state.ball.y >= state.paddles.left.y && state.ball.y <= state.paddles.left.y + PADDLE_HEIGHT) {
    state.ball.dx = -state.ball.dx;
    state.ball.dx *= 1.05;
  } else if (state.ball.x >= CANVAS_WIDTH - 30 && state.ball.y >= state.paddles.right.y && state.ball.y <= state.paddles.right.y + PADDLE_HEIGHT) {
    state.ball.dx = -state.ball.dx;
    state.ball.dx *= 1.05;
  }

  if (state.ball.x <= 0) {
    state.score.right++;
    handlePoint(room, 'right');
    return;
  } else if (state.ball.x >= CANVAS_WIDTH) {
    state.score.left++;
    handlePoint(room, 'left');
    return;
  }

  io.to(room.id).emit('game-state', state);
}

function handlePoint(room, scoringSide) {
  clearInterval(room.gameInterval);
  room.gameInterval = null;
  
  const losingPlayerIndex = scoringSide === 'left' ? 1 : 0;
  const losingPlayerId = room.players[losingPlayerIndex];
  const winningPlayerId = room.players[1 - losingPlayerIndex];
  
  io.to(losingPlayerId).emit('point-scored', { youLost: true });
  io.to(winningPlayerId).emit('point-scored', { youLost: false });
}

function resetBall(state) {
  state.ball.x = CANVAS_WIDTH/2;
  state.ball.y = CANVAS_HEIGHT/2;
  state.ball.dx = Math.random() > 0.5 ? 5 : -5;
  state.ball.dy = Math.random() > 0.5 ? 3 : -3;
}

function handlePlayerDisconnect(playerId) {
  const player = players.get(playerId);
  if (!player) return;
  
  const waitingIndex = waitingPlayers.indexOf(playerId);
  if (waitingIndex !== -1) {
    waitingPlayers.splice(waitingIndex, 1);
  }
  
  if (player.roomId) {
    const room = rooms.get(player.roomId);
    if (room) {
      if (room.gameInterval) {
        clearInterval(room.gameInterval);
        room.gameInterval = null;
      }
      
      const otherPlayerId = room.players.find(id => id !== playerId);
      if (otherPlayerId) {
        io.to(otherPlayerId).emit('opponent-left');
        
        const otherPlayer = players.get(otherPlayerId);
        if (otherPlayer) {
          otherPlayer.roomId = null;
          otherPlayer.ready = false;
        }
      }
      
      rooms.delete(player.roomId);
    }
    
    player.roomId = null;
    player.ready = false;
  }
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 10);
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Ana route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
