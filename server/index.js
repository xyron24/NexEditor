import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT = process.env.PORT || 3000;

app.use(express.static(join(__dirname, '..', 'client')));

const rooms = new Map();

function getRoomUsers(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  return Array.from(room.values());
}

io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  socket.on('join-room', ({ roomId, name, color }) => {
    try {
      socket.join(roomId);

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
