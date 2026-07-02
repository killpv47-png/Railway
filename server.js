const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mineflayer = require('mineflayer');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let bot = null;
let currentUsername = 'VatuicLP';
let reconnectTimeout = null;
let isIntentionalQuit = false; // برای اینکه وقتی دستی ری‌کانکت می‌کنی تداخل ایجاد نشه

// HTML Frontend Template
const htmlContent = `
<!DOCTYPE html>
<html lang="fa">
<head>
    <meta charset="UTF-8">
    <title>Minecraft Bot Control Panel</title>
    <style>
        body { background-color: #121212; color: #e0e0e0; font-family: Tahoma, sans-serif; margin: 20px; direction: ltr; }
        .container { max-width: 800px; margin: 0 auto; }
        h2 { text-align: center; color: #00adb5; }
        #logBox { height: 300px; background-color: #1e1e1e; border: 1px solid #333; padding: 10px; overflow-y: scroll; border-radius: 5px; font-family: monospace; white-space: pre-wrap; margin-bottom: 15px; }
        .config-section, .chat-section { background-color: #1e1e1e; padding: 15px; border-radius: 5px; margin-bottom: 15px; border: 1px solid #333; }
        input[type="text"] { background-color: #2d2d2d; border: 1px solid #444; color: #fff; padding: 8px; border-radius: 4px; width: 70%; }
        button { background-color: #00adb5; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold; }
        button:hover { background-color: #007a80; }
        .btn-danger { background-color: #ff2e63; }
        .btn-danger:hover { background-color: #b81d43; }
        .controls-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-width: 300px; margin: 0 auto 15px auto; text-align: center; }
        .control-btn { background-color: #393e46; padding: 15px; border-radius: 5px; user-select: none; cursor: pointer; font-weight: bold; border: 1px solid #444; }
        .control-btn.active { background-color: #00adb5; }
    </style>
</head>
<body>
    <div class="container">
        <h2>PikaNetwork Bot Controller</h2>
        
        <div id="logBox">--- System: Waiting for connection... ---\n</div>
        
        <div class="config-section">
            <input type="text" id="botNameInput" value="${currentUsername}" style="width: 50%;">
            <button id="reconnectBtn" class="btn-danger">Reconnect / Change Name</button>
        </div>

        <div class="chat-section">
            <input type="text" id="chatInput" placeholder="Type a message or /command here..." style="width: 80%;">
            <button id="sendBtn">Send</button>
        </div>

        <h3 style="text-align:center; color:#00adb5;">Movement Controls</h3>
        <div class="controls-grid">
            <div></div>
            <div class="control-btn" id="forward">W (Forward)</div>
            <div></div>
            <div class="control-btn" id="left">A (Left)</div>
            <div class="control-btn" id="back">S (Back)</div>
            <div class="control-btn" id="right">D (Right)</div>
            <div class="control-btn" id="jump">Space (Jump)</div>
            <div class="control-btn" id="sneak">Shift (Sneak)</div>
        </div>
    </div>

    <script>
        // تشخیص خودکار پروتکل امن وب‌سوکت برای ریل‌وی
        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const ws = new WebSocket(protocol + window.location.host);
        const logBox = document.getElementById('logBox');
        
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if(msg.type === 'log') {
                logBox.innerText += msg.data + '\\n';
                logBox.scrollTop = logBox.scrollHeight;
            }
        };

        function sendMsg() {
            const input = document.getElementById('chatInput');
            if(input.value.trim() !== '') {
                ws.send(JSON.stringify({ type: 'chat', message: input.value }));
                input.value = '';
            }
        }
        document.getElementById('sendBtn').onclick = sendMsg;
        document.getElementById('chatInput').onkeypress = (e) => { if(e.key === 'Enter') sendMsg(); };

        document.getElementById('reconnectBtn').onclick = () => {
            const newName = document.getElementById('botNameInput').value;
            ws.send(JSON.stringify({ type: 'reconnect', username: newName }));
        };

        const movements = ['forward', 'back', 'left', 'right', 'jump', 'sneak'];
        movements.forEach(move => {
            const btn = document.getElementById(move);
            
            const startMove = () => {
                btn.classList.add('active');
                ws.send(JSON.stringify({ type: 'move', control: move, state: true }));
            };
            
            const stopMove = () => {
                btn.classList.remove('active');
                ws.send(JSON.stringify({ type: 'move', control: move, state: false }));
            };

            btn.addEventListener('mousedown', startMove);
            btn.addEventListener('mouseup', stopMove);
            btn.addEventListener('mouseleave', stopMove);
            
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); startMove(); });
            btn.addEventListener('touchend', (e) => { e.preventDefault(); stopMove(); });
        });
    </script>
</body>
</html>
`;

app.get('/', (req, res) => {
    res.send(htmlContent);
});

function sendLog(text) {
    console.log(text);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'log', data: text }));
        }
    });
}

// Minecraft Bot Creator Function
function createMinecraftBot(username) {
    // پاک کردن تایم‌اوت‌های قبلی برای جلوگیری از اجرای چندباره فرآیند ریکانکت
    if (reconnectTimeout) clearTimeout(reconnectTimeout);

    if (bot) {
        try { 
            isIntentionalQuit = true; 
            bot.quit(); 
        } catch(e){}
    }

    isIntentionalQuit = false;
    sendLog(`⏳ Connecting to PikaNetwork as [${username}]...`);

    bot = mineflayer.createBot({
        host: 'play.pika-network.net',
        port: 25565,
        username: username,
        version: '1.20.1',
        auth: 'offline'
    });

    bot.on('login', () => {
        sendLog(`✅ Bot successfully logged into the proxy/lobby!`);
    });

    bot.on('messagestr', (message, messagePosition) => {
        if (messagePosition !== 'game_info') {
            sendLog(message);
        }
    });

    bot.on('kicked', (reason) => {
        sendLog(`❌ KICKED FROM SERVER: ${reason}`);
    });

    bot.on('error', (err) => {
        sendLog(`⚠️ ERROR: ${err.message}`);
    });

    bot.on('end', () => {
        sendLog(`🔌 Connection closed.`);
        // اگر دیسکانکت شدن به خاطر زدن دکمه تغییر نام توسط خودت نباشه، اتوماتیک ریکانکت میکنه
        if (!isIntentionalQuit) {
            sendLog(`🔄 [Auto-Reconnect] Reconnecting in 10 seconds...`);
            reconnectTimeout = setTimeout(() => {
                createMinecraftBot(currentUsername);
            }, 10000); 
        }
    });
}

// Handle Web Panel Actions via WebSocket
wss.on('connection', (ws) => {
    sendLog('💻 Web Panel connected to backend.');
    
    ws.on('message', (message) => {
        const action = JSON.parse(message);
        
        if (!bot && action.type !== 'reconnect') return;

        if (action.type === 'chat') {
            bot.chat(action.message);
            sendLog(`[You Sent]: ${action.message}`);
        } 
        else if (action.type === 'move') {
            bot.setControlState(action.control, action.state);
        } 
        else if (action.type === 'reconnect') {
            currentUsername = action.username;
            sendLog(`🔄 Manual reconnection requested. Changing name to [${currentUsername}]...`);
            createMinecraftBot(currentUsername);
        }
    });
});

// Start initial bot connection
createMinecraftBot(currentUsername);

// تنظیم پورت داینامیک برای راه اندازی روی Railway
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Backend Web Server running on port ${PORT}`);
});
