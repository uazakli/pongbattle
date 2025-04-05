// Pong Game - Client

// Socket.io bağlantısı
const socket = io();

// Oyun değişkenleri
let gameStarted = false;
let waitingForOpponent = false;
let playerReady = false;
let opponentReady = false;
let playerNickname = '';
let roomCode = '';
let lastMouseY = 0;
let waitingAfterPoint = false;
let iAmPointLoser = false;
let lastBallPosition = { x: 0, y: 0 };

// Ses efektleri
const hitSound = new Audio('/sounds/hit.mp3');
const pointSound = new Audio('/sounds/point.mp3');

// Cihaz tipini tespit et
let isMobileDevice = false;
(function detectDevice() {
    isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    console.log('Device detected:', isMobileDevice ? 'Mobile' : 'Desktop');
})();

// DOM yüklendiğinde
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    
    // Nickname formu
    const nicknameForm = document.getElementById('nicknameForm');
    nicknameForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        playerNickname = document.getElementById('nicknameInput').value.trim();
        if (!playerNickname) return;
        
        // Nickname'i sunucuya gönder ve kontrol et
        socket.emit('set-nickname', playerNickname);
    });
    
    // Tab sistemi
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Aktif tab'ı değiştir
            document.querySelector('.tab.active').classList.remove('active');
            this.classList.add('active');
            
            // İlgili içeriği göster
            const tabName = this.getAttribute('data-tab');
            document.querySelector('.tabContent.active').classList.remove('active');
            document.getElementById(tabName).classList.add('active');
        });
    });
    
    // Hızlı maç butonu
    const randomMatchBtn = document.getElementById('randomMatchBtn');
    randomMatchBtn.addEventListener('click', function() {
        console.log('Quick match button clicked');
        this.disabled = true;
        this.textContent = 'Searching...';
        
        // Sunucuya rastgele eşleşme isteği gönder
        socket.emit('join-random');
    });
    
    // Oda oluştur butonu
    const createRoomBtn = document.getElementById('createRoomBtn');
    createRoomBtn.addEventListener('click', function() {
        console.log('Create room button clicked');
        this.disabled = true;
        
        // Sunucuya oda oluşturma isteği gönder
        socket.emit('create-room');
    });
    
    // Odaya katıl butonu
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    joinRoomBtn.addEventListener('click', function() {
        const code = document.getElementById('roomCodeInput').value.trim();
        if (code) {
            console.log('Join room code:', code);
            this.disabled = true;
            this.textContent = 'Joining...';
            
            // Sunucuya odaya katılma isteği gönder
            socket.emit('join-room', code);
        }
    });
    
    // Geri dönme butonu
    const backBtn = document.getElementById('backBtn');
    backBtn.addEventListener('click', function() {
        // Sunucuya oyundan ayrılma isteği gönder
        socket.emit('leave-game');
        
        resetGameState();
        document.getElementById('game').style.display = 'none';
        document.getElementById('lobby').style.display = 'block';
    });
    
    // Chat formu
    const chatForm = document.getElementById('chatForm');
    chatForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const chatInput = document.getElementById('chatInput');
        const message = chatInput.value.trim();
        
        if (message) {
            // Mesajı sunucuya gönder
            socket.emit('chat-message', message);
            
            // Kendi mesajımızı ekle
            addChatMessage('You', message);
            
            chatInput.value = '';
        }
    });
    
    // Mouse hareketi ile raket kontrolü
    const canvas = document.getElementById('pong');
    canvas.addEventListener('mousemove', function(e) {
        if (!gameStarted && !waitingForOpponent) return;
        
        // Mouse'un canvas içindeki Y pozisyonunu al
        const rect = canvas.getBoundingClientRect();
        const mouseY = e.clientY - rect.top;
        
        // Paddle pozisyonunu sunucuya gönder
        socket.emit('paddle-move', mouseY);
        
        lastMouseY = mouseY;
    });
    
    // Mobil cihazlar için dokunmatik desteği ekle
    if (isMobileDevice) {
        console.log('Adding touch support for mobile device');
        
        canvas.addEventListener('touchmove', function(e) {
            if (!gameStarted && !waitingForOpponent) return;
            
            e.preventDefault(); // Sayfanın kaydırılmasını engelle
            
            // Dokunmatik pozisyonu al
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            const touchY = touch.clientY - rect.top;
            
            // Paddle pozisyonunu sunucuya gönder
            socket.emit('paddle-move', touchY);
            
            lastMouseY = touchY; // Aynı değişkeni kullanabiliriz
            
            console.log('Touch move: ' + touchY);
        }, { passive: false });
        
        // Mobil cihazlar için bilgi mesajı
        const gameInfo = document.createElement('div');
        gameInfo.className = 'mobile-info';
        gameInfo.textContent = 'Swipe up and down to control the paddle';
        gameInfo.style.position = 'absolute';
        gameInfo.style.bottom = '10px';
        gameInfo.style.left = '0';
        gameInfo.style.right = '0';
        gameInfo.style.textAlign = 'center';
        gameInfo.style.color = 'white';
        gameInfo.style.fontSize = '14px';
        document.getElementById('game').appendChild(gameInfo);
    }
    
    // Canvas tıklama - hazır olma ve sayı sonrası devam etme
    canvas.addEventListener('click', function() {
        if (waitingForOpponent && !playerReady) {
            // Hazır olduğunu bildir
            playerReady = true;
            socket.emit('player-ready');
            
            if (opponentReady) {
                drawText('Both players ready!\nGame starting...');
            } else {
                drawText('Waiting for opponent...');
            }
        } else if (waitingAfterPoint && iAmPointLoser) {
            // Sayı sonrası devam et
            socket.emit('continue-after-point');
            waitingAfterPoint = false;
        }
    });
    
    // Ses butonları
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
        muteBtn.addEventListener('click', function() {
            const isMuted = this.classList.toggle('muted');
            hitSound.muted = isMuted;
            pointSound.muted = isMuted;
            this.textContent = isMuted ? 'Unmute' : 'Mute';
        });
    }
});

// Rastgele oda kodu oluştur
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Oyun durumunu sıfırla
function resetGameState() {
    gameStarted = false;
    waitingForOpponent = false;
    playerReady = false;
    opponentReady = false;
    waitingAfterPoint = false;
    iAmPointLoser = false;
    
    // Butonları sıfırla
    const randomMatchBtn = document.getElementById('randomMatchBtn');
    if (randomMatchBtn) {
        randomMatchBtn.disabled = false;
        randomMatchBtn.textContent = 'Find Match';
    }
    
    const createRoomBtn = document.getElementById('createRoomBtn');
    if (createRoomBtn) {
        createRoomBtn.disabled = false;
    }
    
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    if (joinRoomBtn) {
        joinRoomBtn.disabled = false;
        joinRoomBtn.textContent = 'Join Room';
    }
    
    // Oda kodu ekranını gizle
    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    if (roomCodeDisplay) {
        roomCodeDisplay.style.display = 'none';
    }
    
    // Chat mesajlarını temizle
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '';
    }
}

// Chat mesajı ekle
function addChatMessage(sender, message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    
    if (sender === 'System') {
        messageElement.innerHTML = `<span class="system">${message}</span>`;
    } else {
        messageElement.innerHTML = `<span class="sender">${sender}:</span> ${message}`;
    }
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Oyunu çiz
function drawGame(state) {
    const canvas = document.getElementById('pong');
    const ctx = canvas.getContext('2d');
    
    // Ekranı temizle
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Raketleri çiz
    ctx.fillStyle = 'white';
    ctx.fillRect(20, state.paddles.left.y, 10, 100);
    ctx.fillRect(canvas.width - 30, state.paddles.right.y, 10, 100);
    
    // Topu çiz
    ctx.fillRect(state.ball.x - 5, state.ball.y - 5, 10, 10);
    
    // Skoru çiz
    ctx.font = '30px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${state.score.left} - ${state.score.right}`, canvas.width/2, 50);
    
    // Orta çizgiyi çiz
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(canvas.width/2, 0);
    ctx.lineTo(canvas.width/2, canvas.height);
    ctx.strokeStyle = 'white';
    ctx.stroke();
    
    // Topa temas kontrolü
    checkBallHit(state);
    
    // Son top pozisyonunu kaydet
    lastBallPosition = { x: state.ball.x, y: state.ball.y };
}

// Topa temas kontrolü
function checkBallHit(state) {
    // İlk kare ise kontrol etme
    if (lastBallPosition.x === 0 && lastBallPosition.y === 0) return;
    
    const ball = state.ball;
    const leftPaddle = { x: 30, y: state.paddles.left.y, width: 10, height: 100 };
    const rightPaddle = { x: 770, y: state.paddles.right.y, width: 10, height: 100 };
    
    // Top yön değiştirdi mi?
    const directionChanged = (
        (ball.dx > 0 && lastBallPosition.x > ball.x) || 
        (ball.dx < 0 && lastBallPosition.x < ball.x)
    );
    
    // Yön değiştiyse ve raketlere yakınsa ses çal
    if (directionChanged) {
        // Sol raket kontrolü
        if (Math.abs(ball.x - leftPaddle.x) < 20) {
            hitSound.currentTime = 0;
            hitSound.play();
        }
        // Sağ raket kontrolü
        else if (Math.abs(ball.x - rightPaddle.x) < 20) {
            hitSound.currentTime = 0;
            hitSound.play();
        }
    }
    
    // Üst veya alt duvara çarptı mı?
    if ((ball.y <= 0 && lastBallPosition.y > 0) || 
        (ball.y >= 500 && lastBallPosition.y < 500)) {
        hitSound.currentTime = 0;
        hitSound.play();
    }
}

// Metin çiz
function drawText(text) {
    const canvas = document.getElementById('pong');
    const ctx = canvas.getContext('2d');
    
    // Ekranı temizle
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Metni çiz
    ctx.fillStyle = 'white';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    
    const lines = text.split('\n');
    const lineHeight = 30;
    lines.forEach((line, index) => {
        ctx.fillText(
            line, 
            canvas.width/2, 
            canvas.height/2 + (index - lines.length/2) * lineHeight
        );
    });
}

// Socket olayları
socket.on('connect', () => {
    console.log('Connected to server');
});

// Nickname onaylandı
socket.on('nickname-accepted', () => {
    console.log('Nickname accepted');
    document.getElementById('login').style.display = 'none';
    document.getElementById('lobby').style.display = 'block';
});

// Nickname reddedildi
socket.on('nickname-taken', () => {
    alert('This nickname is already taken. Please choose another one.');
    document.getElementById('nicknameInput').value = '';
});

// Oda oluşturuldu
socket.on('room-created', (code) => {
    roomCode = code;
    document.getElementById('roomCode').textContent = code;
    document.getElementById('roomCodeDisplay').style.display = 'block';
});

// Eşleşme bulundu
socket.on('match-found', () => {
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game').style.display = 'block';
    waitingForOpponent = true;
    drawText('Click on the game area when ready');
    addChatMessage('System', 'Match found! Click on the game area when you are ready.');
});

// Hazır durumu güncellendi
socket.on('ready-status', (data) => {
    opponentReady = data.opponentReady;
    
    if (data.opponentReady && !playerReady) {
        drawText('Opponent is ready!\nClick on the game area when you are ready');
    } else if (playerReady && !data.opponentReady) {
        drawText('Waiting for opponent...');
    }
});

// Oyun başladı
socket.on('game-start', (state) => {
    waitingForOpponent = false;
    gameStarted = true;
    drawGame(state);
    addChatMessage('System', 'Game started! Good luck!');
});

// Oyun durumu güncellendi
socket.on('game-state', (state) => {
    if (gameStarted && !waitingAfterPoint) {
        drawGame(state);
    }
});

// Sayı oldu
socket.on('point-scored', (data) => {
    gameStarted = false;
    waitingAfterPoint = true;
    iAmPointLoser = data.youLost;
    
    // Sayı sesi çal
    pointSound.currentTime = 0;
    pointSound.play();
    
    if (data.youLost) {
        drawText('You lost a point!\nClick to continue');
        addChatMessage('System', 'You lost a point! Click to continue.');
    } else {
        drawText('You scored a point!\nWaiting for opponent...');
        addChatMessage('System', 'You scored a point! Waiting for opponent...');
    }
});

// Oyun devam ediyor
socket.on('game-continue', (state) => {
    waitingAfterPoint = false;
    gameStarted = true;
    drawGame(state);
});

// Chat mesajı alındı
socket.on('chat-message', (data) => {
    addChatMessage(data.sender, data.message);
});

// Rakip ayrıldı
socket.on('opponent-left', () => {
    gameStarted = false;
    waitingForOpponent = false;
    drawText('Opponent left the game\nClick "Back to Lobby" to play again');
    addChatMessage('System', 'Opponent left the game.');
});

// Hata mesajı
socket.on('error-message', (message) => {
    alert(message);
    resetGameState();
});