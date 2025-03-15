const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const fsExtra = require('fs-extra');

// Create Express app
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from 'public'

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'public', 'uploads')); // Save to 'public/uploads'
    },
    filename: function (req, file, cb) {
        const uniquePrefix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniquePrefix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max file size
    }
});

// ... (rest of your server.js code remains the same)

app.post('/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const filePath = `/uploads/${req.file.filename}`; // Correct relative path

        return res.status(200).json({
            success: true,
            filePath: filePath
        });
    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Store online users and their colors
const onlineUsers = new Set();
const userColors = {};
let users = {};

// Message storage setup
const MESSAGES_FILE = path.join(__dirname, 'chat_messages.json');
const USER_COLORS_FILE = path.join(__dirname, 'user_colors.json');

// Initialize messages
let chatMessages = [];
try {
    if (fs.existsSync(MESSAGES_FILE)) {
        const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
        chatMessages = JSON.parse(data);
    } else {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(chatMessages), 'utf8');
    }
} catch (error) {
    console.error('Error loading chat messages:', error);
}

// Initialize user colors
try {
    if (fs.existsSync(USER_COLORS_FILE)) {
        const data = fs.readFileSync(USER_COLORS_FILE, 'utf8');
        Object.assign(userColors, JSON.parse(data));
    } else {
        fs.writeFileSync(USER_COLORS_FILE, JSON.stringify(userColors), 'utf8');
    }
} catch (error) {
    console.error('Error loading user colors:', error);
}

// Save messages
function saveMessages() {
    try {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(chatMessages), 'utf8');
    } catch (error) {
        console.error('Error saving chat messages:', error);
    }
}

// Save user colors
function saveUserColors() {
    try {
        fs.writeFileSync(USER_COLORS_FILE, JSON.stringify(userColors), 'utf8');
    } catch (error) {
        console.error('Error saving user colors:', error);
    }
}

// Socket.IO connection handler
io.on('connection', (socket) => {
    const username = socket.handshake.query.username;
    const userColor = socket.handshake.query.color;

    if (!username) {
        socket.disconnect();
        return;
    }

    if (userColor) {
        userColors[username] = userColor;
        saveUserColors();
    }

    onlineUsers.add(username);

    console.log(`User connected: ${username} with socket ID: ${socket.id}`);

    users[socket.id] = {
        username: username,
        dnd: false
    };

    socket.on('user_join', (data) => {
        io.emit('user_join', {
            username: data.username,
            users: Object.values(users),
            userColors: userColors
        });

        const joinMessage = {
            type: 'system',
            message: `${data.username} has joined the chat`,
            timestamp: new Date().toISOString()
        };

        chatMessages.push(joinMessage);
        saveMessages();
    });

    socket.on('chat_message', (data) => {
        const messageData = {
            type: 'message',
            username: username,
            message: data.message,
            timestamp: new Date().toISOString(),
            color: userColors[username],
            image: data.image || null
        };

        chatMessages.push(messageData);
        saveMessages();

        io.emit('chat_message', messageData);
    });

    socket.on('load_messages', (data) => {
        const page = data.page || 1;
        const pageSize = 20;
        const start = Math.max(0, chatMessages.length - (page * pageSize));
        const end = Math.max(0, chatMessages.length - ((page - 1) * pageSize));

        const messages = chatMessages.slice(start, end).reverse();

        socket.emit('chat_history', {
            messages,
            page,
            totalMessages: chatMessages.length,
            userColors: userColors
        });
    });

    socket.on('update_color', (data) => {
        if (data.color) {
            userColors[username] = data.color;
            saveUserColors();

            io.emit('update_colors', {
                userColors: userColors
            });
        }
    });

    socket.on('dnd_toggle', (dndStatus) => {
        users[socket.id].dnd = dndStatus;
        io.emit('update_users', { users: Object.values(users) });
    });

    io.emit('update_users', { users: Object.values(users) });

    socket.on('disconnect', () => {
        onlineUsers.delete(username);
        delete users[socket.id];

        console.log(`User disconnected: ${username}`);

        const leaveMessage = {
            type: 'system',
            message: `${username} has left the chat`,
            timestamp: new Date().toISOString()
        };

        chatMessages.push(leaveMessage);
        saveMessages();

        io.emit('user_leave', {
            username: username,
            users: Object.values(users),
            userColors: userColors
        });

        io.emit('update_users', { users: Object.values(users) });
    });
});

app.post('/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const filePath = `/uploads/${req.file.filename}`;

        return res.status(200).json({
            success: true,
            filePath: filePath
        });
    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'chat.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
