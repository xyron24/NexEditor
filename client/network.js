import * as Y from 'yjs';
import {
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness.js';
import { ydoc, awareness } from './crdt.js';

const io = window.io;

export let guestName = localStorage.getItem('nexeditor_username') || ('Guest_' + Math.floor(Math.random() * 900 + 100));
const hue = Math.floor(Math.random() * 360);
export const guestColor = `hsl(${hue}, 70%, 60%)`;

export function updateGuestName() {
  const saved = localStorage.getItem('nexeditor_username');
  if (saved) {
    guestName = saved;
  }
}

let socket = null;
let currentRoomId = null;
let isConnected = false;
let reconnectBuffer = [];
let pendingUpdates = [];
let flushTimer = null;

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (pendingUpdates.length === 0) return;

    const merged = Y.mergeUpdates(pendingUpdates);
    pendingUpdates = [];

    if (!isConnected) {
      reconnectBuffer.push(merged);
      return;
    }

    socket.emit('document-update', {
      roomId: currentRoomId,
      update: Array.from(merged),
    });
  }, 50);
}

ydoc.on('update', (update, origin) => {
  if (origin === 'remote') return;
  pendingUpdates.push(update);
  scheduleFlush();
});

export function connect(roomId) {
  currentRoomId = roomId;

  socket = io({ 
    transports: ['websocket'],
    withCredentials: true
  });

  socket.on('connect', () => {
    isConnected = true;

    socket.emit('join-room', {
      roomId,
      color: guestColor,
    });

    const stateVector = Y.encodeStateVector(ydoc);
    socket.emit('sync-step-1', {
      roomId,
      stateVector: Array.from(stateVector)
    });

    if (reconnectBuffer.length > 0) {
      const merged = Y.mergeUpdates(reconnectBuffer);
      reconnectBuffer = [];
      socket.emit('document-update', {
        roomId,
        update: Array.from(merged),
      });
      console.log('[network] Reconnect buffer flushed');
    }

    _dispatch('connection-status', 'connected');
  });

  socket.on('disconnect', (reason) => {
    isConnected = false;
    console.warn('[network] Disconnected:', reason);
    _dispatch('connection-status', 'disconnected');
  });

  socket.on('connect_error', (err) => {
    console.error('[network] Connection error:', err.message);
    _dispatch('connection-status', 'disconnected');
  });

  socket.on('document-update', ({ update }) => {
    try {
      Y.applyUpdate(ydoc, new Uint8Array(update), 'remote');
    } catch (err) {
      console.error('[network] Failed to apply remote CRDT update:', err);
    }
  });

  socket.on('sync-step-1', ({ stateVector, targetSocketId }) => {
    try {
      const update = Y.encodeStateAsUpdate(ydoc, new Uint8Array(stateVector));
      socket.emit('sync-step-2', {
        targetSocketId,
        update: Array.from(update)
      });

      const awarenessState = encodeAwarenessUpdate(awareness, [awareness.clientID]);
      socket.emit('cursor-update', {
        roomId: currentRoomId,
        update: Array.from(awarenessState)
      });
    } catch (err) {
      console.error('[network] Failed to compute sync-step-2:', err);
    }
  });

  socket.on('sync-step-2', ({ update }) => {
    try {
      Y.applyUpdate(ydoc, new Uint8Array(update), 'remote');
    } catch (err) {
      console.error('[network] Failed to apply sync-step-2:', err);
    }
  });

  socket.on('cursor-update', ({ update }) => {
    try {
      applyAwarenessUpdate(awareness, new Uint8Array(update), 'remote');
    } catch (err) {
      console.error('[network] Failed to apply remote awareness update:', err);
    }
  });

  socket.on('room-users', (users) => {
    _dispatch('room-users-updated', users);
  });

  awareness.on('change', ({ added, updated, removed }) => {
    if (!isConnected) return;
    const changedClients = [...added, ...updated, ...removed];
    try {
      const encoded = encodeAwarenessUpdate(awareness, changedClients);
      socket.emit('cursor-update', {
        roomId,
        update: Array.from(encoded),
      });
    } catch (err) {
      console.error('[network] Failed to encode awareness update:', err);
    }
  });

  window.addEventListener('beforeunload', () => {
    removeAwarenessStates(awareness, [ydoc.clientID], 'window-unload');
  });
}

function _dispatch(eventName, detail) {
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

// Exported variables and functions are defined above as inline exports.
