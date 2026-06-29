import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import authRouter from './auth.js';


const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_nexeditor_2026';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use(express.static(join(__dirname, '..', 'client')));

const rooms = new Map();

function getRoomUsers(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  return Array.from(room.values());
}

io.use((socket, next) => {
  const cookieHeader = socket.request.headers.cookie;
  if (!cookieHeader) {
    return next(new Error('Authentication error: No cookies found'));
  }
  
  const cookies = cookieHeader.split(';').reduce((res, c) => {
    const parts = c.trim().split('=');
    res[parts[0]] = parts[1];
    return res;
  }, {});

  const token = cookies.auth_token;
  if (!token) {
    return next(new Error('Authentication error: Token missing'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.data.user = decoded;
    next();
  } catch (err) {
    return next(new Error('Authentication error: Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  socket.on('join-room', ({ roomId, color }) => {
    try {
      socket.join(roomId);
      
      const name = socket.data.user.name;

      if (!rooms.has(roomId)) rooms.set(roomId, new Map());
      rooms.get(roomId).set(socket.id, { name, color });

      socket.data.roomId = roomId;

      io.to(roomId).emit('room-users', getRoomUsers(roomId));

      console.log(`[room:${roomId}] ${name} joined (${socket.id})`);
    } catch (err) {
      console.error('join-room error:', err);
    }
  });

  socket.on('document-update', ({ roomId, update }) => {
    try {
      socket.broadcast.to(roomId).emit('document-update', { update });
    } catch (err) {
      console.error('document-update relay error:', err);
    }
  });

  socket.on('sync-step-1', ({ roomId, stateVector }) => {
    try {
      socket.broadcast.to(roomId).emit('sync-step-1', {
        stateVector,
        targetSocketId: socket.id
      });
    } catch (err) {
      console.error('sync-step-1 error:', err);
    }
  });

  socket.on('sync-step-2', ({ targetSocketId, update }) => {
    try {
      io.to(targetSocketId).emit('sync-step-2', { update });
    } catch (err) {
      console.error('sync-step-2 error:', err);
    }
  });

  socket.on('cursor-update', ({ roomId, update }) => {
    try {
      socket.broadcast.to(roomId).emit('cursor-update', { update });
    } catch (err) {
      console.error('cursor-update relay error:', err);
    }
  });

  socket.on('disconnect', () => {
    try {
      const roomId = socket.data.roomId;
      if (roomId && rooms.has(roomId)) {
        rooms.get(roomId).delete(socket.id);

        if (rooms.get(roomId).size === 0) {
          rooms.delete(roomId);
          console.log(`[room:${roomId}] Empty — room destroyed`);
        } else {
          io.to(roomId).emit('room-users', getRoomUsers(roomId));
        }
      }
      console.log(`[-] Socket disconnected: ${socket.id}`);
    } catch (err) {
      console.error('disconnect handler error:', err);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`\n🚀 NexEditor server running at http://localhost:${PORT}\n`);
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n⚠️  Port ${PORT} is busy. Kill the old process and try again:\n  lsof -ti:${PORT} | xargs kill -9\n`);
    process.exit(1);
  } else {
    throw err;
  }
});

// Graceful shutdown so node --watch restarts cleanly
const shutdown = () => {
  httpServer.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
