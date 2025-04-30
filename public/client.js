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
let isOfflineGame = false;
let aiDifficulty = 'easy'; // Varsayılan zorluk seviyesi

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

// Canvas ve dokunmatik kontroller için değişkenler
let touchY = 0;
let isTouching = false;

// Dokunmatik ekran olaylarını dinle
function setupTouchControls() {
    const canvas = document.getElementById('pong');
    
    // Dokunma başladığında
    canvas.addEventListener('touchstart', function(e) {
        e.preventDefault(); // Sayfanın kaydırılmasını engelle
        isTouching = true;
        const touch = e.touches[0];
        touchY = touch.clientY - canvas.getBoundingClientRect().top;
        
        // Paddle pozisyonunu güncelle
        if (gameMode === 'online') {
            socket.emit('paddle-move', { y: touchY });
        } else if (gameMode === 'offline') {
            playerPaddleY = touchY - PADDLE_HEIGHT / 2;
            // Paddle'ın canvas dışına çıkmasını engelle
            if (playerPaddleY < 0) playerPaddleY = 0;
            if (playerPaddleY > CANVAS_HEIGHT - PADDLE_HEIGHT) playerPaddleY = CANVAS_HEIGHT - PADDLE_HEIGHT;
        }
    });
    
    // Dokunma hareket ettiğinde
    canvas.addEventListener('touchmove', function(e) {
        e.preventDefault(); // Sayfanın kaydırılmasını engelle
        if (isTouching) {
            const touch = e.touches[0];
            touchY = touch.clientY - canvas.getBoundingClientRect().top;
            
            // Paddle pozisyonunu güncelle
            if (gameMode === 'online') {
                socket.emit('paddle-move', { y: touchY });
            } else if (gameMode === 'offline') {
                playerPaddleY = touchY - PADDLE_HEIGHT / 2;
                // Paddle'ın canvas dışına çıkmasını engelle
                if (playerPaddleY < 0) playerPaddleY = 0;
                if (playerPaddleY > CANVAS_HEIGHT - PADDLE_HEIGHT) playerPaddleY = CANVAS_HEIGHT - PADDLE_HEIGHT;
            }
        }
    });
    
    // Dokunma bittiğinde
    canvas.addEventListener('touchend', function(e) {
        isTouching = false;
    });
    
    // Dokunma iptal edildiğinde
    canvas.addEventListener('touchcancel', function(e) {
        isTouching = false;
    });
}

// Mobil cihaz kontrolü için bilgi mesajı
if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    document.getElementById('controlsInfo').innerHTML = '👆 Controls: Swipe up and down on the game area to control the paddle';
}

// Canvas tıklama ve dokunma - hazır olma ve sayı sonrası devam etme
function setupCanvasInteractions() {
    const canvas = document.getElementById('pong');
    
    // Fare tıklaması için
    canvas.addEventListener('click', handleCanvasInteraction);
    
    // Mobil cihazlar için dokunma olayı
    if (isMobileDevice) {
        canvas.addEventListener('touchend', function(e) {
            e.preventDefault(); // Varsayılan davranışı engelle
            console.log('Canvas touchend detected');
            handleCanvasInteraction(e);
        }, false);
    }
}

// Tıklama/dokunma işleme fonksiyonu
function handleCanvasInteraction(e) {
    console.log('Canvas interaction detected', e.type);
    
    if (waitingForOpponent && !playerReady) {
        // Hazır olduğunu bildir
        console.log('Player ready signal sent');
        playerReady = true;
        socket.emit('player-ready');
        
        if (opponentReady) {
            drawText('Both players ready!\nGame starting...');
        } else {
            drawText('Waiting for opponent...');
        }
    } else if (waitingAfterPoint && iAmPointLoser) {
        // Sayı sonrası devam et
        console.log('Continue after point signal sent');
        socket.emit('continue-after-point');
        waitingAfterPoint = false;
    }
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
        console.log('Back to lobby button clicked');
        
        // Offline oyun döngüsünü temizle
        if (window.aiGameInterval) {
            console.log('Clearing AI game interval');
            clearInterval(window.aiGameInterval);
            window.aiGameInterval = null;
        }
        
        // Online oyundan ayrılma
        if (!isOfflineGame) {
            // Sunucuya oyundan ayrılma isteği gönder
            socket.emit('leave-game');
        }
        
        // Oyun durumunu sıfırla
        resetGameState();
        
        // Butonları sıfırla
        resetLobbyButtons();
        
        // Lobiye dön
        document.getElementById('game').style.display = 'none';
        document.getElementById('lobby').style.display = 'block';
        
        // Analytics: Lobiye dönüş olayını gönder
        sendAnalyticsEvent('navigation', 'back_to_lobby');
        
        console.log('Returned to lobby, game state reset');
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
        if (!gameStarted && !waitingForOpponent && !isOfflineGame) return;
        
        // Mouse pozisyonunu al
        const rect = canvas.getBoundingClientRect();
        const mouseY = e.clientY - rect.top;
        
        // Raket pozisyonunu güncelle
        if (gameStarted || isOfflineGame) {
            // Raket pozisyonunu sunucuya gönder (online oyun için)
            if (!isOfflineGame) {
                socket.emit('paddle-move', mouseY);
            } 
            // Offline oyun için doğrudan raket pozisyonunu güncelle
            else {
                // Canvas ölçeğini hesapla
                const scaleY = canvas.height / rect.height;
                // Ölçeklenmiş Y pozisyonu
                const scaledY = mouseY * scaleY;
                // Raket yüksekliğinin yarısını çıkar (ortalama için)
                const paddleY = Math.max(0, Math.min(canvas.height - 100, scaledY - 50));
                
                // Oyun durumunu güncelle
                const gameState = window.offlineGameState;
                if (gameState) {
                    gameState.paddles.left.y = paddleY;
                }
            }
        }
        
        // Son mouse pozisyonunu kaydet
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
    
    // Canvas etkileşimlerini ayarla
    setupCanvasInteractions();
    
    // Ses butonları
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
        // Ses durumunu saklamak için global değişken
        window.soundMuted = false;
        
        muteBtn.addEventListener('click', function() {
            window.soundMuted = !window.soundMuted;
            this.innerHTML = window.soundMuted ? '🔇 Sound Off' : '🔊 Sound On';
        });
    }
    
    // Zorluk seviyesi butonları
    const difficultyBtns = document.querySelectorAll('.difficulty-btn');
    difficultyBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            // Aktif sınıfı kaldır
            document.querySelector('.difficulty-btn.active').classList.remove('active');
            // Bu butona aktif sınıfı ekle
            this.classList.add('active');
            // Zorluk seviyesini ayarla
            aiDifficulty = this.id.replace('Btn', '').toLowerCase();
        });
    });
    
    // Offline oyun başlatma butonu
    const startOfflineBtn = document.getElementById('startOfflineBtn');
    if (startOfflineBtn) {
        startOfflineBtn.addEventListener('click', function() {
            console.log('Starting offline game with difficulty:', aiDifficulty);
            document.getElementById('lobby').style.display = 'none';
            document.getElementById('game').style.display = 'block';
            
            // Offline oyun başlat
            startOfflineGame();
        });
    }
    
    // Sesleri önceden yükle
    preloadSounds();
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
    // Offline oyun döngüsünü temizle
    if (window.aiGameInterval) {
        clearInterval(window.aiGameInterval);
        window.aiGameInterval = null;
    }
    
    // Oyun durumunu sıfırla
    isOfflineGame = false;
    gameStarted = false;
    waitingForOpponent = false;
    playerReady = false;
    opponentReady = false;
    waitingAfterPoint = false;
    iAmPointLoser = false;
    roomCode = '';
    
    // Oyun durumu nesnesini sıfırla
    window.gameState = null;
    
    // Son top pozisyonunu sıfırla
    lastBallPosition = { x: 0, y: 0 };
    
    console.log('Game state fully reset');
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
    // Sol raket - mavi - kenardan 10px uzaklıkta (15px yerine)
    drawPaddle(ctx, 10, state.paddles.left.y, 10, 100, '#00c2ff');
    
    // Sağ raket - kırmızı - kenardan 10px uzaklıkta (25px yerine)
    drawPaddle(ctx, canvas.width - 20, state.paddles.right.y, 10, 100, '#ff3e7f');
    
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
        // Son top pozisyonunu sakla (çarpışma tespiti için)
        const lastBallX = lastBallPosition.x;
        const lastBallY = lastBallPosition.y;
        
        // Yeni top pozisyonunu sakla
        lastBallPosition.x = state.ball.x;
        lastBallPosition.y = state.ball.y;
        
        // Oyun durumunu çiz
        drawGame(state);
        
        // Online modda da top fiziğini işle
        if (!isOfflineGame) {
            // Çarpışma sesi kontrolü
            checkCollisionSound(state, lastBallX, lastBallY);
        }
    }
});

// Çarpışma sesi kontrolü için yeni fonksiyon
function checkCollisionSound(state, lastX, lastY) {
    const ball = state.ball;
    
    // İlk kare ise kontrol etme
    if (lastX === 0 && lastY === 0) return;
    
    // Top yön değiştirdi mi?
    const xDirectionChanged = (ball.dx > 0 && lastX > ball.x) || (ball.dx < 0 && lastX < ball.x);
    const yDirectionChanged = (ball.dy > 0 && lastY > ball.y) || (ball.dy < 0 && lastY < ball.y);
    
    // X yönü değiştiyse (raket vuruşu)
    if (xDirectionChanged) {
        console.log('X direction changed, playing hit sound');
        playHitSound();
    }
    // Y yönü değiştiyse (duvar vuruşu)
    else if (yDirectionChanged) {
        console.log('Y direction changed, playing hit sound');
        playHitSound();
    }
}

// Özel bir olay ekleyelim - sunucudan gelen vuruş bildirimi
socket.on('ball-hit', () => {
    console.log('Received ball-hit event from server');
    playHitSound();
});

// Özel bir olay ekleyelim - sunucudan gelen sayı bildirimi
socket.on('point-sound', () => {
    console.log('Received point-sound event from server');
    playPointSound();
});

// Sayı oldu
socket.on('point-scored', (data) => {
    gameStarted = false;
    waitingAfterPoint = true;
    iAmPointLoser = data.youLost;
    
    // Sayı sesi çal
    playPointSound();
    
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
    const leftPaddle = { x: 10, y: state.paddles.left.y, width: 10, height: 100 };
    const rightPaddle = { x: 780, y: state.paddles.right.y, width: 10, height: 100 };
    
    // Top yön değiştirdi mi?
    const directionChanged = (
        (ball.dx > 0 && lastBallPosition.x > ball.x) || 
        (ball.dx < 0 && lastBallPosition.x < ball.x)
    );
    
    // Yön değiştiyse ve raketlere yakınsa ses çal
    if (directionChanged) {
        // Sol raket kontrolü
        if (Math.abs(ball.x - leftPaddle.x) < 20) {
            playHitSound();
        }
        // Sağ raket kontrolü
        else if (Math.abs(ball.x - rightPaddle.x) < 20) {
            playHitSound();
        }
    }
    
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
        
        // Ses çal
        playHitSound();
        
        // Sunucuya top durumunu gönder (online mod için)
        if (!isOfflineGame) {
            socket.emit('ballUpdate', { dx: ball.dx, dy: ball.dy, x: ball.x, y: ball.y });
        }
    }
}

// Ses çalma fonksiyonu - ses sorunlarını çözmek için ayrı bir fonksiyon
function playHitSound() {
    if (window.soundMuted) return;
    
    console.log('Playing hit sound...');
    
    // Önce mevcut ses nesnesini kullanmayı dene
    try {
        hitSound.currentTime = 0;
        const playPromise = hitSound.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.log('Hit sound error with existing audio:', error);
                playFallbackHitSound();
            });
        }
    } catch (e) {
        console.log('Hit sound error:', e);
        playFallbackHitSound();
    }
}

// Yedek ses çalma fonksiyonu
function playFallbackHitSound() {
    try {
        // Yeni bir ses nesnesi oluştur
        const tempHitSound = new Audio('/sounds/hit.mp3');
        tempHitSound.volume = 0.5;
        tempHitSound.play().catch(e => console.log('Fallback hit sound error:', e));
    } catch (e) {
        console.log('Fallback hit sound failed:', e);
    }
}

// Sayı sesi çalma fonksiyonunu güncelle
function playPointSound() {
    if (window.soundMuted) return;
    
    console.log('Playing point sound...');
    
    // Önce mevcut ses nesnesini kullanmayı dene
    try {
        pointSound.currentTime = 0;
        const playPromise = pointSound.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.log('Point sound error with existing audio:', error);
                playFallbackPointSound();
            });
        }
    } catch (e) {
        console.log('Point sound error:', e);
        playFallbackPointSound();
    }
}

// Yedek sayı sesi çalma fonksiyonu
function playFallbackPointSound() {
    try {
        // Yeni bir ses nesnesi oluştur
        const tempPointSound = new Audio('/sounds/point.mp3');
        tempPointSound.volume = 0.7;
        tempPointSound.play().catch(e => console.log('Fallback point sound error:', e));
    } catch (e) {
        console.log('Fallback point sound failed:', e);
    }
}

// Oyuncu sayısı değişkeni
let onlinePlayerCount = 0;

// Socket olayları bölümüne ekle
socket.on('player-count-update', (count) => {
    console.log('Player count update received:', count);
    onlinePlayerCount = count;
    updatePlayerCount();
});

// Oyuncu sayısını güncelleme fonksiyonu - tamamen yeniden yazıldı
function updatePlayerCount() {
    const playerCountElement = document.getElementById('playerCount');
    if (playerCountElement && typeof onlinePlayerCount !== 'undefined') {
        // Sadece sayıyı güncelle, metin HTML'de olmalı
        playerCountElement.innerHTML = onlinePlayerCount;
        
        console.log('Player count updated to:', onlinePlayerCount);
    }
}

// Mobil cihazlar için dokunmatik olayları iyileştir
document.addEventListener('DOMContentLoaded', function() {
    const canvas = document.getElementById('pong');
    
    // Mobil cihaz kontrollerini ayarla
    if (isMobileDevice) {
        console.log('Setting up mobile touch controls');
        
        // Dokunmatik olayları ekle
        canvas.addEventListener('touchstart', handleTouchMove);
        canvas.addEventListener('touchmove', handleTouchMove);
        
        // Varsayılan davranışı engelle (sayfanın kaydırılmasını önle)
        canvas.addEventListener('touchmove', function(e) {
            e.preventDefault();
        }, { passive: false });
        
        // Tüm dokunmatik yüzeyi kullan
        document.body.addEventListener('touchmove', function(e) {
            e.preventDefault();
        }, { passive: false });
    }
});

// Dokunmatik hareket işleme fonksiyonu
function handleTouchMove(e) {
    e.preventDefault();
    
    // Dokunmatik pozisyonu al
    const touch = e.touches[0];
    const canvasRect = document.getElementById('pong').getBoundingClientRect();
    
    // Dokunmatik Y pozisyonunu canvas koordinatlarına dönüştür
    const touchY = touch.clientY - canvasRect.top;
    
    // Canvas ölçeğini hesapla
    const canvasScale = canvasRect.height / 500; // 500 = orijinal canvas yüksekliği
    
    // Ölçeklendirilmiş Y pozisyonu
    const scaledY = touchY / canvasScale;
    
    // Paddle pozisyonunu güncelle
    if (isOfflineGame) {
        // Offline mod için paddle pozisyonunu doğrudan güncelle
        const currentState = window.gameState;
        if (currentState) {
            // Paddle'ın ortasını dokunulan noktaya getir
            currentState.paddles.left.y = Math.max(0, Math.min(400, scaledY - 50));
            
            // Konsola bilgi yazdır
            console.log('Mobile touch: updating offline paddle position to', currentState.paddles.left.y);
        }
    } else {
        // Online mod için sunucuya paddle pozisyonunu gönder
        socket.emit('paddleMove', { y: Math.max(0, Math.min(400, scaledY - 50)) });
    }
    
    // Son fare pozisyonunu güncelle
    lastMouseY = scaledY;
}

// Offline oyun başlatma fonksiyonunu güncelle
function startOfflineGame() {
    // Önceki oyun durumunu temizle
    resetGameState();
    
    isOfflineGame = true;
    gameStarted = true;
    
    // Başlangıç oyun durumunu oluştur
    const initialState = {
        ball: { 
            x: 400, 
            y: 250, 
            dx: 5.5, 
            dy: 3.3, 
            radius: 10 
        },
        paddles: {
            left: { y: 200, h: 100 },
            right: { y: 200, h: 100 }
        },
        score: { left: 0, right: 0 }
    };
    
    // Global oyun durumunu ayarla
    window.gameState = initialState;
    
    // Oyunu çiz
    drawGame(initialState);
    
    // AI oyun döngüsünü başlat
    window.aiGameInterval = startAiGameLoop(initialState);
    
    // Mobil cihazlarda ölçeklendirmeyi kontrol et
    if (isMobileDevice) {
        resizeGameElements();
        
        // Mobil cihazlar için özel mesaj
        addChatMessage('System', 'Touch the screen to move your paddle.');
        
        // Konsola bilgi yazdır
        console.log('Mobile offline game started. Touch controls enabled.');
    }
    
    console.log('Offline game started with initial state:', initialState);
}

// Offline mod için AI oyun döngüsünü tamamen yeniden yaz
function startAiGameLoop(initialState) {
    console.log('Starting AI game loop');
    
    // Önceki interval'ı temizle (eğer varsa)
    if (window.aiGameInterval) {
        clearInterval(window.aiGameInterval);
    }
    
    return setInterval(() => {
        // Mevcut oyun durumunu al
        const currentState = window.gameState;
        
        if (!currentState) {
            console.error('Game state is undefined in AI loop');
            return;
        }
        
        // Fare/dokunmatik hareketi - sadece mobil olmayan cihazlarda
        if (!isMobileDevice) {
            // Fare hareketi ile paddle'ı güncelle
            currentState.paddles.left.y = Math.max(0, Math.min(400, lastMouseY - 50));
        }
        // Not: Mobil cihazlarda paddle pozisyonu dokunmatik olay tarafından güncellenir
        
        // AI raketini hareket ettir
        moveAI(currentState);
        
        // Topu hareket ettir
        currentState.ball.x += currentState.ball.dx;
        currentState.ball.y += currentState.ball.dy;
        
        // Duvar çarpışmaları
        if (currentState.ball.y <= 10 || currentState.ball.y >= 490) {
            currentState.ball.dy = -currentState.ball.dy;
            
            // Topun Y hızı çok düşükse minimum bir değer garantile
            if (Math.abs(currentState.ball.dy) < 2.2) {
                currentState.ball.dy = 2.2 * Math.sign(currentState.ball.dy);
            }
            
            // Topun tam sınırda kalmasını önle
            if (currentState.ball.y <= 10) {
                currentState.ball.y = 11;
            } else if (currentState.ball.y >= 490) {
                currentState.ball.y = 489;
            }
            
            // Ses çal
            playHitSound();
        }
        
        // Sol raket çarpışması (oyuncu)
        if (currentState.ball.x <= 20 && 
            currentState.ball.y >= currentState.paddles.left.y && 
            currentState.ball.y <= currentState.paddles.left.y + 100) {
            
            // Paddle'ın ortasını bul
            const paddleMiddle = currentState.paddles.left.y + 50;
            
            // Topun paddle ortasına göre konumunu hesapla
            const hitRelativeToMiddle = currentState.ball.y - paddleMiddle;
            
            // Açıyı belirle
            let angle;
            
            if (hitRelativeToMiddle < -40) {
                angle = -45 * Math.PI / 180;
            } else if (hitRelativeToMiddle < -30) {
                angle = -35 * Math.PI / 180;
            } else if (hitRelativeToMiddle < -20) {
                angle = -25 * Math.PI / 180;
            } else if (hitRelativeToMiddle < -10) {
                angle = -15 * Math.PI / 180;
            } else if (hitRelativeToMiddle < 0) {
                angle = -5 * Math.PI / 180;
            } else if (hitRelativeToMiddle < 10) {
                angle = 5 * Math.PI / 180;
            } else if (hitRelativeToMiddle < 20) {
                angle = 15 * Math.PI / 180;
            } else if (hitRelativeToMiddle < 30) {
                angle = 25 * Math.PI / 180;
            } else if (hitRelativeToMiddle < 40) {
                angle = 35 * Math.PI / 180;
            } else {
                angle = 45 * Math.PI / 180;
            }
            
            // Mevcut hızı hesapla
            const currentSpeed = Math.sqrt(currentState.ball.dx * currentState.ball.dx + currentState.ball.dy * currentState.ball.dy);
            
            // Her vuruşta sabit %5 hızlanma
            const speedIncrease = 1.05;
            
            // Başlangıç hızı
            const initialSpeed = 5.5;
            
            // Maksimum hız
            const maxSpeed = initialSpeed * 2.0;
            
            // Hızı artır ama maksimum hızı geçme
            const speed = Math.min(Math.max(currentSpeed * speedIncrease, 7.7), maxSpeed);
            
            // Yeni hız bileşenlerini hesapla
            currentState.ball.dx = Math.cos(angle) * speed;
            currentState.ball.dy = Math.sin(angle) * speed;
            
            // Top her zaman sağa gitsin
            if (currentState.ball.dx < 0) currentState.ball.dx = -currentState.ball.dx;
            
            // Ses çal
            playHitSound();
            
            // Topun raket içine girmesini önle
            currentState.ball.x = 20;
        }
        
        // Sağ raket çarpışması (AI)
        if (currentState.ball.x >= 780 && 
            currentState.ball.y >= currentState.paddles.right.y && 
            currentState.ball.y <= currentState.paddles.right.y + 100) {
            
            // Paddle'ın ortasını bul
            const paddleMiddle = currentState.paddles.right.y + 50;
            
            // Topun paddle ortasına göre konumunu hesapla
            const hitRelativeToMiddle = currentState.ball.y - paddleMiddle;
            
            // Açıyı belirle
            let angle;
            
            if (hitRelativeToMiddle < -40) {
                angle = -45 * Math.PI / 180;
            } else if (hitRelativeToMiddle < -30) {
                angle = -35 * Math.PI / 180;
            } else if (hitRelativeToMiddle < -20) {
                angle = -25 * Math.PI / 180;
            } else if (hitRelativeToMiddle < -10) {
                angle = -15 * Math.PI / 180;
            } else if (hitRelativeToMiddle < 0) {
                angle = -5 * Math.PI / 180;
            } else if (hitRelativeToMiddle < 10) {
                angle = 5 * Math.PI / 180;
            } else if (hitRelativeToMiddle < 20) {
                angle = 15 * Math.PI / 180;
            } else if (hitRelativeToMiddle < 30) {
                angle = 25 * Math.PI / 180;
            } else if (hitRelativeToMiddle < 40) {
                angle = 35 * Math.PI / 180;
            } else {
                angle = 45 * Math.PI / 180;
            }
            
            // Mevcut hızı hesapla
            const currentSpeed = Math.sqrt(currentState.ball.dx * currentState.ball.dx + currentState.ball.dy * currentState.ball.dy);
            
            // Her vuruşta sabit %5 hızlanma
            const speedIncrease = 1.05;
            
            // Başlangıç hızı
            const initialSpeed = 5.5;
            
            // Maksimum hız
            const maxSpeed = initialSpeed * 2.0;
            
            // Hızı artır ama maksimum hızı geçme
            const speed = Math.min(Math.max(currentSpeed * speedIncrease, 7.7), maxSpeed);
            
            // Yeni hız bileşenlerini hesapla
            currentState.ball.dx = Math.cos(angle) * speed;
            currentState.ball.dy = Math.sin(angle) * speed;
            
            // Top her zaman sola gitsin
            if (currentState.ball.dx > 0) currentState.ball.dx = -currentState.ball.dx;
            
            // Ses çal
            playHitSound();
            
            // Topun raket içine girmesini önle
            currentState.ball.x = 780;
        }
        
        // Sayı kontrolü
        if (currentState.ball.x <= 0) {
            // AI sayı aldı
            currentState.score.right++;
            playPointSound();
            resetBall(currentState);
        } else if (currentState.ball.x >= 800) {
            // Oyuncu sayı aldı
            currentState.score.left++;
            playPointSound();
            resetBall(currentState);
        }
        
        // Oyunu çiz
        drawGame(currentState);
        
    }, 1000/60); // 60 FPS
}

// Top sıfırlama fonksiyonu
function resetBall(gameState) {
    gameState.ball.x = 400;
    gameState.ball.y = 250;
    
    // Rastgele X yönü
    gameState.ball.dx = (Math.random() > 0.5 ? 5.5 : -5.5);
    
    // Rastgele Y yönü
    let newDy = (Math.random() > 0.5 ? 3.3 : -3.3) * (Math.random() * 2 + 1);
    
    // Minimum Y hızı garantisi
    if (Math.abs(newDy) < 2.2) {
        newDy = 2.2 * Math.sign(newDy || 1);
    }
    
    gameState.ball.dy = newDy;
}

// AI raketini hareket ettir - tamamen yeniden yaz
function moveAI(gameState) {
    const paddle = gameState.paddles.right;
    const ball = gameState.ball;
    
    // Zorluk seviyesine göre AI tepki hızı
    let aiSpeed;
    let aiError;
    let deadZone; // Titreme önleyici ölü bölge
    
    switch(aiDifficulty) {
        case 'easy':
            aiSpeed = 3;
            aiError = 40;
            deadZone = 15;
            break;
        case 'medium':
            aiSpeed = 5;
            aiError = 20;
            deadZone = 10;
            break;
        case 'hard':
            aiSpeed = 7;
            aiError = 5;
            deadZone = 5;
            break;
        default:
            aiSpeed = 5;
            aiError = 20;
            deadZone = 10;
    }
    
    // Hedef pozisyon
    let targetY;
    
    // Top sağa doğru gidiyorsa (AI'ya doğru) veya top orta çizginin sağındaysa
    if (ball.dx > 0 || ball.x > 400) {
        // Paddle'ın ortasını hedefle (paddle yüksekliği 100px)
        const paddleCenter = 50;
        
        // Rastgele hatayı her karede değil, belirli aralıklarla uygula
        if (!paddle.errorTimer || paddle.errorTimer <= 0) {
            paddle.errorOffset = (Math.random() * aiError - aiError/2);
            paddle.errorTimer = 30; // 30 kare (yaklaşık 0.5 saniye) boyunca aynı hatayı kullan
        } else {
            paddle.errorTimer--;
        }
        
        // Hedef pozisyon (topun Y pozisyonu - paddle merkezi + sabit hata)
        targetY = ball.y - paddleCenter + (paddle.errorOffset || 0);
        
        // Topun hızına göre öngörü yap (zor seviyede)
        if (aiDifficulty === 'hard' && ball.dx > 0) {
            // Topun sağ kenara ulaşması için gereken süre
            const timeToReach = (780 - ball.x) / ball.dx;
            // Tahmin edilen Y pozisyonu
            const predictedY = ball.y + (ball.dy * timeToReach);
            // Tahmin edilen pozisyonu sınırlar içinde tut
            const clampedPrediction = Math.max(0, Math.min(500, predictedY));
            // Tahmin ve mevcut pozisyon arasında karışım yap
            targetY = clampedPrediction - paddleCenter + (paddle.errorOffset || 0);
        }
    } else {
        // Top AI'dan uzaklaşıyorsa, raket yavaşça merkeze dön
        targetY = 200; // Canvas ortası - paddle yüksekliğinin yarısı
    }
    
    // Hedef ile mevcut pozisyon arasındaki fark
    const distance = targetY - paddle.y;
    
    // Ölü bölge kontrolü - çok küçük farklar için hareket etme (titreme önleme)
    if (Math.abs(distance) > deadZone) {
        // Yumuşak hareket için mesafeye göre hız ayarla
        let moveSpeed = Math.min(aiSpeed, Math.abs(distance) / 10);
        
        // Minimum hız garantisi
        moveSpeed = Math.max(moveSpeed, aiSpeed / 2);
        
        // Yönü belirle ve hareket et
        if (distance > 0) {
            paddle.y += moveSpeed;
        } else {
            paddle.y -= moveSpeed;
        }
    }
    
    // Raket sınırlarını kontrol et
    paddle.y = Math.max(0, Math.min(400, paddle.y));
}

// Sesleri önceden yükle
function preloadSounds() {
    // Ses dosyalarını yükle
    hitSound.load();
    pointSound.load();
    
    // Ses dosyalarının yüklendiğinden emin olmak için
    console.log('Preloading sounds...');
    
    // Ses dosyalarının yollarını kontrol et
    console.log('Hit sound path:', hitSound.src);
    console.log('Point sound path:', pointSound.src);
}

// Butonları sıfırlama fonksiyonu
function resetLobbyButtons() {
    // Rastgele eşleşme butonu
    const randomMatchBtn = document.getElementById('randomMatchBtn');
    if (randomMatchBtn) {
        randomMatchBtn.disabled = false;
        randomMatchBtn.innerHTML = 'Find Match';
    }
    
    // Oda oluşturma butonu
    const createRoomBtn = document.getElementById('createRoomBtn');
    if (createRoomBtn) {
        createRoomBtn.disabled = false;
        createRoomBtn.innerHTML = 'Create Room';
    }
    
    // Odaya katılma butonu
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    if (joinRoomBtn) {
        joinRoomBtn.disabled = false;
        joinRoomBtn.innerHTML = 'Join Room';
    }
    
    // Oda kodu giriş alanı
    const roomCodeInput = document.getElementById('roomCodeInput');
    if (roomCodeInput) {
        roomCodeInput.value = '';
    }
    
    // Oda kodu gösterimi
    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    if (roomCodeDisplay) {
        roomCodeDisplay.style.display = 'none';
    }
    
    // Chat mesajlarını temizle
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '';
        // Sistem mesajı ekle
        addChatMessage('System', 'Welcome to PongBattle.io! Play online or against AI.');
    }
    
    // Oyuncu sayısı bilgisini güncelle
    updatePlayerCount();
}