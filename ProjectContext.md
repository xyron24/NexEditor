# Project Context: Real-Time Collaborative Text Editor (MVP)

## 1. Project Overview

This project is a high-performance, real-time collaborative text editor built for synchronous developer collaboration (similar to the foundational architecture of Zed or Google Docs). It is a Minimum Viable Product (MVP) focused entirely on distributed systems, low-latency WebSocket networking, and Conflict-free Replicated Data Types (CRDTs).

The system relies on a **"Thick Client, Thin Server"** architecture. All heavy state resolution and algorithmic computation happens on the edge (the users' browsers), while the backend serves strictly as a high-speed, dumb Pub/Sub message relay.

---

## 2. Strict Technology Stack

- **Frontend UI & Syntax Highlighting:** `codemirror` (Version 6) and `@codemirror/theme-one-dark`.
- **Frontend Logic:** Vanilla JavaScript (ES6+). **DO NOT** use React, Vue, Angular, or any Virtual DOM wrappers (e.g., no `react-codemirror`). Mount CodeMirror natively.
- **CRDT Engine & Editor Binding:** `yjs` (Handles state synchronization) and `y-codemirror.next` (The official binding to connect Yjs directly to CodeMirror 6).
- **Network Transport:** `socket.io` and `socket.io-client` (Full-duplex WebSockets).
- **Backend:** Node.js with `express` and `socket.io`.

---

## 3. Core Architectural Highlights & Unique Optimizations

The AI must implement the codebase keeping these specific engineering decisions in mind:

### ID-Anchored Sequence CRDTs
The application uses Yjs (`Y.Text` or `Y.Array`) to manage document state. Characters/blocks are tracked via permanently unique IDs linked to their neighbors, completely eliminating naive array-index shifting and preventing race conditions during concurrent typing.

### Logical Deletions (Tombstoning)
The system must never forcefully splice or garbage-collect deleted characters immediately if it breaks the CRDT chain. Rely on Yjs's native tombstoning to mark nodes as `isDeleted: true` for network preservation.

### CodeMirror Editor Binding
The UI is driven by CodeMirror 6 mounted to a Vanilla DOM `<div>`. Do not write manual event listeners for keystrokes; instead, use the `y-codemirror.next` binding. This module acts as a bridge, automatically converting CodeMirror editor transactions into Yjs CRDT operations, and instantly rendering remote user cursors and syntax highlighting (like a real IDE) with zero React overhead.

### Network Debouncing / Event Aggregation
The frontend must **not** emit a WebSocket packet for every single microscopic keystroke. Implement a debounce or batching layer to aggregate rapid, continuous typing bursts into unified CRDT update payloads before emitting to the server.

### Line-Indexed Performance Philosophy
While using `Y.Text`, ensure DOM updates are localized. Do not re-render the entire document string on every keystroke; aim to update only the modified nodes or lines to simulate O(C) local time complexity operations.

---

## 4. System Flow

```
User Input (CodeMirror editor canvas)
        │
        ▼
y-codemirror.next intercepts editor transaction
        │
        ▼
Local Y.Text Update (Yjs CRDT)
        │
        ▼
Throttle / Encode → Binary Payload (debounced)
        │
        ▼
Socket.io Emit → Node.js Server
        │
        ▼
Server Blindly Broadcasts to Room Peers
        │
        ▼
Client B Receives Payload → Applies to Local Y.Doc
        │
        ▼
Yjs Resolves CRDT Math
        │
        ▼
y-codemirror.next Observes Update → CodeMirror Paints Text + Cursors
```

1. **Input** — User types in the CodeMirror editor canvas mounted on the Vanilla HTML page.
2. **Local CRDT Update** — The `y-codemirror.next` binding automatically intercepts the editor transaction and updates the local `Y.Text` instance.
3. **Throttle/Encode** — The Yjs update event is converted to a binary payload. A debounce function throttles the emission rate.
4. **Relay** — The payload is sent via Socket.io to the Node.js server.
5. **Broadcast** — The Node.js server receives the `document-update` event and blindly broadcasts it to all other clients in the specific Socket.io room.
6. **Remote Resolution** — Client B receives the binary payload, applies it to its local `Y.Doc`, and the Yjs engine resolves the CRDT math natively.
7. **Paint** — Client B's `y-codemirror.next` binding observes the Yjs update and tells the CodeMirror engine to paint the new text and syntax colors onto the screen.

---

## 5. UI / UX Scope

### Layout

```
┌─────────────────────────────────────────────┐
│  Header: Title | Room ID | Copy Invite Link  │
├──────────────────────────────┬──────────────┤
│                              │ Active Users │
│  <div id="editor"></div>     │  ● Guest_102 │
│  CodeMirror 6 mounted here   │  ● Guest_047 │
│  One Dark theme, JS syntax   │  ...         │
│  highlighting, remote        │              │
│  cursors rendered            │  (20% width) │
│        (80% width)           │              │
└──────────────────────────────┴──────────────┘
```

### Components

- **Header** — Simple title, current Room ID display, and a "Copy Invite Link" button.
- **Main Stage (80% width)** — An empty `<div id="editor"></div>` where CodeMirror is mounted. It must use a dark theme (like One Dark) and include basic syntax highlighting (e.g., JavaScript). It will display the text and render the colored remote cursors of other users currently typing.
- **Right Sidebar (20% width)** — A live "Active Users" presence panel. Displays a list of connected users (e.g., `Guest_102`) with a green online indicator. Updates dynamically on Socket.io `connection` and `disconnect` events.

---

## 6. Suggested File Structure

```
project-root/
├── server/
│   └── index.js          # Express + Socket.io server (dumb Pub/Sub relay)
├── client/
│   ├── index.html        # Entry point
│   ├── style.css         # Dark-mode UI styles
│   ├── crdt.js           # Yjs Y.Doc init, Y.Text binding, y-codemirror.next setup
│   ├── network.js        # Socket.io client, debounce/batching layer
│   └── ui.js             # CodeMirror mount, presence panel, room UI
└── package.json
```

---

## 7. Execution Rules

### ✅ DO

- Write modular, clean Vanilla JavaScript (separate files: `crdt.js`, `network.js`, `ui.js`).
- Initialize a single `Y.Doc()` per client and bind it to the CodeMirror instance.
- Implement a strict **Rooms** concept in Socket.io so multiple independent sessions can run on the same server.
- Manage presence state (Active Users list) using Socket.io's built-in room tracking.
- Implement error handling for network reconnects — buffer local edits if the WebSocket drops, and sync upon reconnection.

### ❌ DO NOT

- **DO NOT** introduce React, Next.js, Webpack, or complex build tools. Use simple module imports or CDN links for frontend libraries.
- **DO NOT** build a file explorer or directory tree. This is a single-document room architecture.
- **DO NOT** implement a backend compiler, terminal, or any Remote Code Execution (RCE) logic.
- **DO NOT** write CRDT conflict-resolution algorithms from scratch on the Node.js server. The server must remain a **"dumb pipe"** (Pub/Sub only).
- **DO NOT** integrate a database (MongoDB, PostgreSQL, Redis). State exists purely in-memory across connected peer CRDTs. If the last user leaves the room, the document dies. *(Persistence is out of scope for this MVP.)*

---

## 8. Key Constraints Summary

| Concern | Decision |
|---|---|
| State persistence | ❌ None (in-memory, ephemeral) |
| Conflict resolution location | ✅ Client-side only (Yjs) |
| Server intelligence | ❌ Dumb relay — no CRDT logic |
| Build tooling | ❌ None — CDN / ES modules only |
| Framework | ❌ Vanilla JS only |
| Editor | ✅ CodeMirror 6 (native mount) |
| Syntax highlighting | ✅ CodeMirror 6 + `@codemirror/theme-one-dark` |
| Remote cursors | ✅ `y-codemirror.next` binding |
| Multi-room support | ✅ Socket.io rooms |
| Reconnect buffering | ✅ Required |