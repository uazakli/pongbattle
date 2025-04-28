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
const DOMAIN = 'pongbattle.io';

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();
const players = new Map();
const waitingPlayers = [];
const nicknames = new Set();

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const PADDLE_HEIGHT = 100;

let onlinePlayerCount = 0;

function createGameState() {
  return {
    ball: { 
      x: CANVAS_WIDTH/2, 
      y: CANVAS_HEIGHT/2, 
      dx: 5.5,
      dy: 3.3,
      radius: 10
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

  onlinePlayerCount++;
  io.emit('player-count-update', onlinePlayerCount);

  socket.on("set-nickname", (nickname) => {
    // Nickname'i temizle ve kontrol et
    nickname = nickname.trim();
    if (!nickname || nickname.length > 15) {
      socket.emit('error', 'Invalid nickname');
      return;
    }
    
    if (nicknames.has(nickname)) {
      socket.emit('nickname-taken');
      return;
    }
    
    nicknames.add(nickname);
    const player = players.get(socket.id) || { id: socket.id };
    player.nickname = nickname;
    players.set(socket.id, player);
    
    console.log(`Player ${socket.id} set nickname to: ${nickname}`);
    
    // Nickname kabul edildi olayını gönder
    socket.emit('nickname-accepted', nickname);
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
      socket.emit('error-message', 'You are already in a room');
      return;
    }
    
    const roomCode = generateRoomCode();
    
    rooms.set(roomCode, {
      id: roomCode,
      code: roomCode,
      players: [socket.id],
      gameState: null,
      started: false,
      gameInterval: null
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
    
    onlinePlayerCount--;
    io.emit('player-count-update', onlinePlayerCount);
    
    handlePlayerDisconnect(socket.id);
    
    const player = players.get(socket.id);
    if (player) {
      nicknames.delete(player.nickname);
      players.delete(socket.id);
    }
  });

  // Raket hareketi olayını dinle
  socket.on('paddleMove', function(data) {
    const player = players.get(socket.id);
    if (!player) {
        console.log('Player not found for paddle move:', socket.id);
        return;
    }
    
    if (!player.roomId) {
        console.log('Player not in a room:', socket.id);
        return;
    }
    
    const room = rooms.get(player.roomId);
    if (!room) {
        console.log('Room not found:', player.roomId);
        return;
    }
    
    if (!room.gameStarted) {
        console.log('Game not started in room:', player.roomId);
        return;
    }
    
    // Hangi oyuncunun raketini güncellediğimizi belirle
    const side = player.side; // 'left' veya 'right'
    
    // Raket pozisyonunu güncelle
    if (room.paddles && room.paddles[side]) {
        room.paddles[side].y = data.y;
        console.log(`Player ${socket.id} (${side}) moved paddle to y:${data.y}`);
    } else {
        // Eğer paddles nesnesi yoksa oluştur
        if (!room.paddles) {
            room.paddles = {
                left: { y: 200 },
                right: { y: 200 }
            };
        }
        
        // Eğer belirli taraf yoksa oluştur
        if (!room.paddles[side]) {
            room.paddles[side] = { y: 200 };
        }
        
        // Şimdi güncelle
        room.paddles[side].y = data.y;
        console.log(`Created and updated paddle ${side} to y:${data.y}`);
    }
  });

  // Top güncellemesi olayını dinle
  socket.on('ballUpdate', (ballData) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    
    const room = rooms.get(player.roomId);
    if (!room || !room.gameState) return;
    
    // Top verilerini güncelle
    room.gameState.ball.dx = ballData.dx;
    room.gameState.ball.dy = ballData.dy;
    room.gameState.ball.x = ballData.x;
    room.gameState.ball.y = ballData.y;
    
    // Güncellenmiş oyun durumunu odadaki tüm oyunculara gönder
    io.to(player.roomId).emit('game-state', room.gameState);
  });
});

function createRoom(roomId, player1Id, player2Id) {
  const gameState = createGameState();
  
  // Top başlangıç hızını ayarla
  resetBall(gameState);
  
  const room = {
    id: roomId,
    players: [player1Id, player2Id],
    gameStarted: false,
    ball: gameState.ball,
    paddles: gameState.paddles,
    score: gameState.score,
    readyPlayers: []
  };
  
  rooms.set(roomId, room);
  
  // Oyuncuları odaya ekle
  const player1 = players.get(player1Id);
  const player2 = players.get(player2Id);
  
  player1.roomId = roomId;
  player2.roomId = roomId;
  
  // Oyuncuları odaya sok
  io.sockets.sockets.get(player1Id).join(roomId);
  io.sockets.sockets.get(player2Id).join(roomId);
  
  // Oyunculara eşleşme bilgisini gönder
  io.to(player1Id).emit('match-found', {
    roomId: roomId,
    opponent: player2.nickname,
    side: 'left'
  });
  
  io.to(player2Id).emit('match-found', {
    roomId: roomId,
    opponent: player1.nickname,
    side: 'right'
  });
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
  
  // Önceki top pozisyonunu sakla
  const prevBallX = state.ball.x;
  const prevBallY = state.ball.y;
  const prevDx = state.ball.dx;
  const prevDy = state.ball.dy;
  
  // Topu hareket ettir
  state.ball.x += state.ball.dx;
  state.ball.y += state.ball.dy;
  
  // Offline moddaki top fiziği ve çarpışma mantığını kullan
  checkBallHit(state);
  
  // Yön değişimi kontrolü - vuruş sesi için
  const xDirectionChanged = (prevDx > 0 && state.ball.dx < 0) || (prevDx < 0 && state.ball.dx > 0);
  const yDirectionChanged = (prevDy > 0 && state.ball.dy < 0) || (prevDy < 0 && state.ball.dy > 0);
  
  // Yön değiştiyse vuruş sesi çal
  if (xDirectionChanged || yDirectionChanged) {
    io.to(room.id).emit('ball-hit');
  }
  
  // Sayı kontrolü
  if (state.ball.x <= 0) {
    state.score.right++;
    io.to(room.id).emit('point-sound');
    handlePoint(room, 'right');
    return;
  } else if (state.ball.x >= CANVAS_WIDTH) {
    state.score.left++;
    io.to(room.id).emit('point-sound');
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

function resetBall(gameState) {
  gameState.ball.x = 400;
  gameState.ball.y = 250;
  
  // İlk X hızını %10 artır (5 yerine 5.5)
  gameState.ball.dx = (Math.random() > 0.5 ? 5.5 : -5.5);
  
  // Y hızını hesapla ve minimum değer garantile
  // İlk Y hızını da %10 artır
  let newDy = (Math.random() > 0.5 ? 3.3 : -3.3) * (Math.random() * 2 + 1);
  
  // Minimum Y hızı garantisi
  if (Math.abs(newDy) < 2.2) { // Minimum değeri de %10 artır
    newDy = 2.2 * Math.sign(newDy || 1);
  }
  
  gameState.ball.dy = newDy;
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
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit https://${DOMAIN} to play the game`);
});

// Ana route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Oyun durumunu güncelle
function updateGameState(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.gameStarted) return;
    
    // Top hareketini güncelle
    room.ball.x += room.ball.dx;
    room.ball.y += room.ball.dy;
    
    // Offline moddaki top fiziği ve çarpışma mantığını kullan
    checkBallHit(room);
    
    // Sayı kontrolü
    if (room.ball.x < 0) {
        // Sağ oyuncu sayı aldı
        room.score.right++;
        resetBall(room);
    } else if (room.ball.x > 800) {
        // Sol oyuncu sayı aldı
        room.score.left++;
        resetBall(room);
    }
    
    // Oyun durumunu istemcilere gönder
    const gameState = {
        ball: room.ball,
        paddles: room.paddles,
        score: room.score
    };
    
    io.to(roomId).emit('game-state', gameState);
}

// Sayı atıldığında çağrılır
function pointScored(roomId, scorerId) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    // Topu sıfırla
    room.ball.x = 400;
    room.ball.y = 250;
    
    // İlk X hızını %10 artır (5 yerine 5.5)
    room.ball.dx = (Math.random() > 0.5 ? 5.5 : -5.5);
    
    // Y hızını hesapla ve minimum değer garantile
    // İlk Y hızını da %10 artır
    let newDy = (Math.random() > 0.5 ? 3.3 : -3.3) * (Math.random() * 2 + 1);
    
    // Minimum Y hızı garantisi
    if (Math.abs(newDy) < 2.2) { // Minimum değeri de %10 artır
        newDy = 2.2 * Math.sign(newDy || 1);
    }
    
    room.ball.dy = newDy;
    
    // Sayı atanı bildir
    io.to(roomId).emit('point-scored', {
        scorer: scorerId,
        score: room.score
    });
}

// Topa temas kontrolü - offline moddaki fonksiyonu sunucu tarafına taşı
function checkBallHit(gameState) {
    const ball = gameState.ball;
    
    // Üst ve alt duvar çarpışmaları
    if (ball.y <= 10 || ball.y >= 490) {
        // Sadece yön değiştir, hızı değiştirme
        ball.dy = -ball.dy;
        
        // Topun Y hızı çok düşükse minimum bir değer garantile
        // Minimum değeri %10 artır (2 yerine 2.2)
        if (Math.abs(ball.dy) < 2.2) {
            ball.dy = 2.2 * Math.sign(ball.dy);
        }
        
        // Topun tam sınırda kalmasını önle
        if (ball.y <= 10) {
            ball.y = 11;
        } else if (ball.y >= 490) {
            ball.y = 489;
        }
    }
    
    // Sol raket çarpışması (oyuncu veya rakip)
    if (ball.x <= 10 && 
        ball.y >= gameState.paddles.left.y && 
        ball.y <= gameState.paddles.left.y + 100) {
        
        // Paddle'ın ortasını bul
        const paddleMiddle = gameState.paddles.left.y + 50;
        
        // Topun paddle ortasına göre konumunu hesapla (-50 ile +50 arası)
        const hitRelativeToMiddle = ball.y - paddleMiddle;
        
        // Açıyı belirle - daha az keskin açılar
        let angle;
        
        if (hitRelativeToMiddle < -40) {
            // Üst bölüm 1 (en üst) - daha az keskin yukarı açı
            angle = -45 * Math.PI / 180; // -70 yerine -45 derece
        } else if (hitRelativeToMiddle < -30) {
            // Üst bölüm 2 - daha az keskin yukarı açı
            angle = -35 * Math.PI / 180; // -55 yerine -35 derece
        } else if (hitRelativeToMiddle < -20) {
            // Üst bölüm 3 - orta yukarı açı
            angle = -25 * Math.PI / 180; // -40 yerine -25 derece
        } else if (hitRelativeToMiddle < -10) {
            // Üst bölüm 4 - hafif yukarı açı
            angle = -15 * Math.PI / 180; // -25 yerine -15 derece
        } else if (hitRelativeToMiddle < 0) {
            // Üst bölüm 5 (ortaya yakın) - çok hafif yukarı açı
            angle = -5 * Math.PI / 180; // -10 yerine -5 derece
        } else if (hitRelativeToMiddle < 10) {
            // Alt bölüm 1 (ortaya yakın) - çok hafif aşağı açı
            angle = 5 * Math.PI / 180; // 10 yerine 5 derece
        } else if (hitRelativeToMiddle < 20) {
            // Alt bölüm 2 - hafif aşağı açı
            angle = 15 * Math.PI / 180; // 25 yerine 15 derece
        } else if (hitRelativeToMiddle < 30) {
            // Alt bölüm 3 - orta aşağı açı
            angle = 25 * Math.PI / 180; // 40 yerine 25 derece
        } else if (hitRelativeToMiddle < 40) {
            // Alt bölüm 4 - daha az keskin aşağı açı
            angle = 35 * Math.PI / 180; // 55 yerine 35 derece
        } else {
            // Alt bölüm 5 (en alt) - daha az keskin aşağı açı
            angle = 45 * Math.PI / 180; // 70 yerine 45 derece
        }
        
        // Mevcut hızı hesapla
        const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
        
        // Her vuruşta sabit %5 hızlanma (1.1 yerine 1.05)
        const speedIncrease = 1.05; // %5 artış
        
        // Başlangıç hızı (5.5)
        const initialSpeed = 5.5;
        
        // Maksimum hız (başlangıç hızının 2.5 katı)
        const maxSpeed = initialSpeed * 2.5; // Yaklaşık 10 vuruşta maksimum hıza ulaşır
        
        // Hızı artır ama maksimum hızı geçme
        const speed = Math.min(Math.max(currentSpeed * speedIncrease, 7.7), maxSpeed);
        
        // Yeni hız bileşenlerini hesapla
        ball.dx = Math.cos(angle) * speed;
        ball.dy = Math.sin(angle) * speed;
        
        // Top her zaman sağa gitsin
        if (ball.dx < 0) ball.dx = -ball.dx;
        
        // Topun raket içine girmesini önle
        ball.x = 10 + 10; // Paddle genişliği kadar ileri
    }
    
    // Sağ raket çarpışması (oyuncu veya rakip)
    if (ball.x >= 780 && 
        ball.y >= gameState.paddles.right.y && 
        ball.y <= gameState.paddles.right.y + 100) {
        
        // Paddle'ın ortasını bul
        const paddleMiddle = gameState.paddles.right.y + 50;
        
        // Topun paddle ortasına göre konumunu hesapla (-50 ile +50 arası)
        const hitRelativeToMiddle = ball.y - paddleMiddle;
        
        // Açıyı belirle - daha az keskin açılar
        let angle;
        
        if (hitRelativeToMiddle < -40) {
            // Üst bölüm 1 (en üst) - daha az keskin yukarı açı
            angle = -45 * Math.PI / 180; // -70 yerine -45 derece
        } else if (hitRelativeToMiddle < -30) {
            // Üst bölüm 2 - daha az keskin yukarı açı
            angle = -35 * Math.PI / 180; // -55 yerine -35 derece
        } else if (hitRelativeToMiddle < -20) {
            // Üst bölüm 3 - orta yukarı açı
            angle = -25 * Math.PI / 180; // -40 yerine -25 derece
        } else if (hitRelativeToMiddle < -10) {
            // Üst bölüm 4 - hafif yukarı açı
            angle = -15 * Math.PI / 180; // -25 yerine -15 derece
        } else if (hitRelativeToMiddle < 0) {
            // Üst bölüm 5 (ortaya yakın) - çok hafif yukarı açı
            angle = -5 * Math.PI / 180; // -10 yerine -5 derece
        } else if (hitRelativeToMiddle < 10) {
            // Alt bölüm 1 (ortaya yakın) - çok hafif aşağı açı
            angle = 5 * Math.PI / 180; // 10 yerine 5 derece
        } else if (hitRelativeToMiddle < 20) {
            // Alt bölüm 2 - hafif aşağı açı
            angle = 15 * Math.PI / 180; // 25 yerine 15 derece
        } else if (hitRelativeToMiddle < 30) {
            // Alt bölüm 3 - orta aşağı açı
            angle = 25 * Math.PI / 180; // 40 yerine 25 derece
        } else if (hitRelativeToMiddle < 40) {
            // Alt bölüm 4 - daha az keskin aşağı açı
            angle = 35 * Math.PI / 180; // 55 yerine 35 derece
        } else {
            // Alt bölüm 5 (en alt) - daha az keskin aşağı açı
            angle = 45 * Math.PI / 180; // 70 yerine 45 derece
        }
        
        // Mevcut hızı hesapla
        const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
        
        // Her vuruşta sabit %5 hızlanma (1.1 yerine 1.05)
        const speedIncrease = 1.05; // %5 artış
        
        // Başlangıç hızı (5.5)
        const initialSpeed = 5.5;
        
        // Maksimum hız (başlangıç hızının 2.5 katı)
        const maxSpeed = initialSpeed * 2.5; // Yaklaşık 10 vuruşta maksimum hıza ulaşır
        
        // Hızı artır ama maksimum hızı geçme
        const speed = Math.min(Math.max(currentSpeed * speedIncrease, 7.7), maxSpeed);
        
        // Yeni hız bileşenlerini hesapla
        ball.dx = Math.cos(angle) * speed;
        ball.dy = Math.sin(angle) * speed;
        
        // Top her zaman sola gitsin
        if (ball.dx > 0) ball.dx = -ball.dx;
        
        // Topun raket içine girmesini önle
        ball.x = 780 - 10; // Paddle genişliği kadar geri
    }
}
