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

// Mobil kontrol hassasiyeti çarpanı
const MOBILE_SENSITIVITY = 2.0; // 1 birim hareket için 2 birim tepki

// Oyun alanını ve chat alanını mobil cihaza göre ölçeklendir
function resizeGameElements() {
    if (!isMobileDevice) return; // Sadece mobil cihazlarda ölçeklendir
    
    const canvas = document.getElementById('pong');
    const chatContainer = document.getElementById('chatContainer');
    const gameContainer = document.getElementById('game');
    
    if (!canvas || !chatContainer || !gameContainer) return;
    
    // Ekran genişliğini al
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // Canvas'ın orijinal boyutları
    const originalWidth = 800; // Varsayılan genişlik
    const originalHeight = 500; // Varsayılan yükseklik
    
    // Ölçeklendirme oranını hesapla (ekrana sığacak şekilde)
    let scale = Math.min(
        (screenWidth * 0.95) / originalWidth,
        (screenHeight * 0.7) / originalHeight
    );
    
    // Minimum ölçek sınırı
    scale = Math.max(scale, 0.5);
    
    // Yeni boyutları hesapla
    const newWidth = Math.floor(originalWidth * scale);
    const newHeight = Math.floor(originalHeight * scale);
    
    // Canvas boyutlarını güncelle
    canvas.style.width = newWidth + 'px';
    canvas.style.height = newHeight + 'px';
    
    // Oyun konteynerini düzenle
    gameContainer.style.maxWidth = newWidth + 'px';
    gameContainer.style.margin = '0 auto';
    
    // Chat konteynerini düzenle
    chatContainer.style.maxWidth = newWidth + 'px';
    chatContainer.style.margin = '10px auto';
    
    // Chat mesajları alanını düzenle
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.style.maxHeight = (newHeight * 0.3) + 'px'; // Chat yüksekliği oyun yüksekliğinin %30'u
        chatMessages.style.fontSize = Math.max(12, Math.floor(14 * scale)) + 'px'; // Font boyutunu ölçeklendir
    }
    
    // Chat giriş alanını düzenle
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.style.fontSize = Math.max(12, Math.floor(14 * scale)) + 'px';
        chatInput.style.padding = Math.floor(5 * scale) + 'px';
    }
    
    // Chat gönder butonunu düzenle
    const chatSubmit = document.querySelector('#chatForm button');
    if (chatSubmit) {
        chatSubmit.style.fontSize = Math.max(12, Math.floor(14 * scale)) + 'px';
        chatSubmit.style.padding = Math.floor(5 * scale) + 'px ' + Math.floor(10 * scale) + 'px';
    }
    
    console.log(`Game elements resized for mobile: ${newWidth}x${newHeight}, scale: ${scale}`);
}

// DOM yüklendiğinde
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    
    // Mobil cihazlar için ölçeklendirme yap
    if (isMobileDevice) {
        resizeGameElements(); // resizeGameCanvas yerine resizeGameElements kullanıyoruz
        
        // Ekran döndürüldüğünde veya boyutu değiştiğinde yeniden ölçeklendir
        window.addEventListener('resize', resizeGameElements);
        
        // Mobil cihazlar için CSS ayarlamaları
        document.body.classList.add('mobile-device');
        
        // Meta viewport etiketini kontrol et ve güncelle
        let viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            document.head.appendChild(viewport);
        }
        viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
    }
    
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
        this.innerHTML = 'Searching... <div class="loading"><div></div><div></div><div></div><div></div></div>';
        
        // Sunucuya rastgele eşleşme isteği gönder
        socket.emit('join-random');
    });
    
    // Oda oluştur butonu
    const createRoomBtn = document.getElementById('createRoomBtn');
    createRoomBtn.addEventListener('click', function() {
        console.log('Create room button clicked');
        this.disabled = true;
        this.innerHTML = 'Creating... <div class="loading"><div></div><div></div><div></div><div></div></div>';
        
        // Sunucuya oda oluşturma isteği gönder
        socket.emit('create-room');
    });
    
    // Odaya katıl butonu
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    joinRoomBtn.addEventListener('click', function() {
        const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
        if (code) {
            console.log('Join room code:', code);
            this.disabled = true;
            this.innerHTML = 'Joining... <div class="loading"><div></div><div></div><div></div><div></div></div>';
            
            // Sunucuya odaya katılma isteği gönder
            socket.emit('join-room', code);
        } else {
            // Show error for empty code
            document.getElementById('roomCodeInput').focus();
            showNotification('Please enter a room code', 'error');
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
    
    // Mobil cihazlar için dokunmatik desteği ekle - HASSASİYETİ ARTTIRALIM
    if (isMobileDevice) {
        console.log('Adding touch support for mobile device with increased sensitivity');
        
        // Son dokunma pozisyonu
        let lastTouchY = 0;
        
        canvas.addEventListener('touchmove', function(e) {
            if (!gameStarted && !waitingForOpponent) return;
            
            e.preventDefault(); // Sayfanın kaydırılmasını engelle
            
            // Dokunmatik pozisyonu al
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            const touchY = touch.clientY - rect.top;
            
            // Hareket miktarını hesapla
            const deltaY = touchY - lastTouchY;
            
            // Eğer bu ilk dokunuşsa, delta hesaplanamaz
            if (lastTouchY !== 0) {
                // Hassasiyet çarpanı ile yeni pozisyonu hesapla
                // Mevcut pozisyon + (hareket miktarı * hassasiyet)
                const newY = lastMouseY + (deltaY * MOBILE_SENSITIVITY);
                
                // Canvas sınırları içinde kalmayı sağla
                const paddleHeight = 100; // Raket yüksekliği
                const minY = paddleHeight / 2;
                const maxY = canvas.height - (paddleHeight / 2);
                const clampedY = Math.max(minY, Math.min(maxY, newY));
                
                // Paddle pozisyonunu sunucuya gönder
                socket.emit('paddle-move', clampedY);
                
                lastMouseY = clampedY;
                console.log('Touch move with sensitivity: delta=' + deltaY + ', new position=' + clampedY);
            }
            
            // Son dokunma pozisyonunu güncelle
            lastTouchY = touchY;
        }, { passive: false });
        
        // Dokunma bittiğinde son pozisyonu sıfırla
        canvas.addEventListener('touchend', function() {
            lastTouchY = 0;
        });
        
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
            this.innerHTML = isMuted ? '🔇 Sound Off' : '🔊 Sound On';
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
        createRoomBtn.textContent = 'Create Room';
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
    
    // Mobil cihazlarda mesaj geldiğinde chat alanını görünür yap
    if (isMobileDevice && chatMessages.style.display === 'none') {
        const chatToggle = document.getElementById('chatToggle');
        if (chatToggle) {
            chatToggle.textContent = 'Hide Chat';
            chatMessages.style.display = 'block';
        }
    }
}

// Oyunu çiz
function drawGame(state) {
    const canvas = document.getElementById('pong');
    const ctx = canvas.getContext('2d');
    
    // Ekranı temizle - koyu arka plan
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Izgara çiz - retro hissi için
    drawGrid(ctx, canvas.width, canvas.height);
    
    // Raketleri çiz - biri mavi, diğeri kırmızı
    // Sol raket - mavi
    drawPaddle(ctx, 20, state.paddles.left.y, 10, 100, '#00c2ff');
    
    // Sağ raket - kırmızı
    drawPaddle(ctx, canvas.width - 30, state.paddles.right.y, 10, 100, '#ff3e7f');
    
    // Topu çiz - parlak ve güzel
    drawBall(ctx, state.ball.x, state.ball.y, 10);
    
    // Skoru çiz
    drawScore(ctx, state.score.left, state.score.right, canvas.width);
    
    // Orta çizgiyi çiz
    drawCenterLine(ctx, canvas.width, canvas.height);
    
    // Topa temas kontrolü
    checkBallHit(state);
    
    // Son top pozisyonunu kaydet
    lastBallPosition = { x: state.ball.x, y: state.ball.y };
}

// Izgara çiz
function drawGrid(ctx, width, height) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    // Yatay çizgiler
    for (let y = 0; y < height; y += 25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    
    // Dikey çizgiler
    for (let x = 0; x < width; x += 25) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
}

// Raket çiz
function drawPaddle(ctx, x, y, width, height, color) {
    // Gölge efekti
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(x + 2, y + 2, width, height);
    
    // Ana raket
    const gradient = ctx.createLinearGradient(x, y, x + width, y);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, shadeColor(color, 30));
    
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
    
    // Parlak kenar
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(x, y, width, 2);
    ctx.fillRect(x, y, 2, height);
    
    // Koyu kenar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(x, y + height - 2, width, 2);
    ctx.fillRect(x + width - 2, y, 2, height);
}

// Top çiz
function drawBall(ctx, x, y, radius) {
    // Gölge
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fill();
    
    // Ana top
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    
    // Gradient ile daha güzel bir top
    const gradient = ctx.createRadialGradient(x - radius/3, y - radius/3, 0, x, y, radius);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.3, '#f0f0f0');
    gradient.addColorStop(1, '#cccccc');
    
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Parlak nokta (highlight)
    ctx.beginPath();
    ctx.arc(x - radius/2.5, y - radius/2.5, radius/4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fill();
}

// Skor çiz
function drawScore(ctx, leftScore, rightScore, canvasWidth) {
    ctx.font = 'bold 48px Rubik';
    ctx.textAlign = 'center';
    
    // Sol skor - mavi
    ctx.fillStyle = 'rgba(0, 194, 255, 0.8)';
    ctx.fillText(leftScore, canvasWidth/4, 60);
    
    // Sağ skor - kırmızı
    ctx.fillStyle = 'rgba(255, 62, 127, 0.8)';
    ctx.fillText(rightScore, canvasWidth * 3/4, 60);
}

// Orta çizgiyi çiz
function drawCenterLine(ctx, width, height) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 4;
    ctx.setLineDash([15, 15]);
    ctx.beginPath();
    ctx.moveTo(width/2, 0);
    ctx.lineTo(width/2, height);
    ctx.stroke();
    ctx.setLineDash([]);
}

// Renk tonu değiştirme yardımcı fonksiyonu
function shadeColor(color, percent) {
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);

    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);

    R = (R < 255) ? R : 255;
    G = (G < 255) ? G : 255;
    B = (B < 255) ? B : 255;

    const RR = ((R.toString(16).length == 1) ? "0" + R.toString(16) : R.toString(16));
    const GG = ((G.toString(16).length == 1) ? "0" + G.toString(16) : G.toString(16));
    const BB = ((B.toString(16).length == 1) ? "0" + B.toString(16) : B.toString(16));

    return "#" + RR + GG + BB;
}

// Metin çiz - beklerken veya oyun durumları için
function drawText(text) {
    const canvas = document.getElementById('pong');
    const ctx = canvas.getContext('2d');
    
    // Ekranı temizle
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Izgara çiz
    drawGrid(ctx, canvas.width, canvas.height);
    
    // Metni çiz
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Rubik';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 194, 255, 0.5)';
    ctx.shadowBlur = 10;
    
    const lines = text.split('\n');
    const lineHeight = 40;
    lines.forEach((line, index) => {
        ctx.fillText(
            line, 
            canvas.width/2, 
            canvas.height/2 + (index - lines.length/2) * lineHeight
        );
    });
    
    ctx.shadowBlur = 0;
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

// Google Analytics için özel olay gönderme fonksiyonu
function sendAnalyticsEvent(category, action, label = null, value = null) {
    if (typeof gtag === 'function') {
        const eventParams = {
            event_category: category,
            event_label: label,
            value: value
        };
        
        gtag('event', action, eventParams);
        console.log('Analytics event sent:', category, action, label, value);
    }
}

// Oyun başladı
socket.on('game-start', (state) => {
    waitingForOpponent = false;
    gameStarted = true;
    
    // Mobil cihazlarda ölçeklendirmeyi kontrol et
    if (isMobileDevice) {
        resizeGameElements();
    }
    
    drawGame(state);
    addChatMessage('System', 'Game started! Good luck!');
    
    // Analytics: Oyun başlatma olayını gönder
    sendAnalyticsEvent('game', 'start', isMobileDevice ? 'mobile' : 'desktop');
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
        
        // Analytics: Sayı kaybetme olayını gönder
        sendAnalyticsEvent('game', 'point_lost');
    } else {
        drawText('You scored a point!\nWaiting for opponent...');
        addChatMessage('System', 'You scored a point! Waiting for opponent...');
        
        // Analytics: Sayı yapma olayını gönder
        sendAnalyticsEvent('game', 'point_scored');
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
    showNotification(message, 'error');
    resetGameState();
});

// Mobil cihazlar için chat toggle butonu ekle
if (isMobileDevice) {
    document.addEventListener('DOMContentLoaded', function() {
        const chatContainer = document.getElementById('chatContainer');
        const chatMessages = document.getElementById('chatMessages');
        
        if (chatContainer && chatMessages) {
            // Chat toggle butonu oluştur
            const chatToggle = document.createElement('button');
            chatToggle.id = 'chatToggle';
            chatToggle.textContent = 'Show Chat';
            chatToggle.className = 'chat-toggle';
            chatToggle.style.width = '100%';
            chatToggle.style.padding = '5px';
            chatToggle.style.marginBottom = '5px';
            chatToggle.style.backgroundColor = '#333';
            chatToggle.style.color = 'white';
            chatToggle.style.border = 'none';
            chatToggle.style.borderRadius = '3px';
            
            // Chat mesajlarını başlangıçta gizle
            chatMessages.style.display = 'none';
            
            // Toggle butonunu chat container'ın başına ekle
            chatContainer.insertBefore(chatToggle, chatContainer.firstChild);
            
            // Toggle butonuna tıklama olayı ekle
            chatToggle.addEventListener('click', function() {
                if (chatMessages.style.display === 'none') {
                    chatMessages.style.display = 'block';
                    chatToggle.textContent = 'Hide Chat';
                } else {
                    chatMessages.style.display = 'none';
                    chatToggle.textContent = 'Show Chat';
                }
            });
        }
    });
}

// Show loading indicator
function showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = '<div class="loading"><div></div><div></div><div></div><div></div></div>';
    }
}

// Hide loading indicator
function hideLoading(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text || '';
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
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