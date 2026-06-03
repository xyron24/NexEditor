import { EditorView, basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { yCollab } from 'y-codemirror.next';
import { ytext, awareness } from './crdt.js';
import { connect, guestName, guestColor } from './network.js';

let roomId = window.location.hash.replace(/^#/, '').trim();

if (!roomId) {
  roomId = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  window.location.hash = roomId;
}

document.getElementById('room-id-display').textContent = roomId;
document.title = `NexEditor · ${roomId}`;

const colorLight = guestColor.replace('hsl(', 'hsla(').replace(')', ', 0.18)');

awareness.setLocalStateField('user', {
  name: guestName,
  color: guestColor,
  colorLight,
});

connect(roomId);

const view = new EditorView({
  extensions: [
    basicSetup,
    oneDark,
    javascript(),
    yCollab(ytext, awareness),
    EditorView.lineWrapping,
  ],
  parent: document.getElementById('editor'),
});

view.focus();

window.addEventListener('connection-status', (e) => {
  const badge = document.getElementById('connection-badge');
  const label = document.getElementById('connection-label');
  if (!badge || !label) return;

  const status = e.detail;
  badge.className = `connection-badge ${status}`;
  label.textContent = status === 'connected' ? 'Connected' : 'Disconnected';
});

window.addEventListener('room-users-updated', (e) => {
  const users = e.detail;
  const list = document.getElementById('user-list');
  const countEl = document.getElementById('user-count');
  if (!list) return;

  if (countEl) countEl.textContent = users.length;

  list.innerHTML = '';

  users.forEach(({ name, color }) => {
    const isYou = name === guestName;
    const item = document.createElement('div');
    item.className = 'user-item';
    item.setAttribute('role', 'listitem');

    item.innerHTML = `
      <span
        class="presence-dot"
        style="background: ${color}; color: ${color};"
        aria-hidden="true"
      ></span>
      <span class="user-name">${escapeHTML(name)}</span>
      ${isYou ? '<span class="user-you-tag">you</span>' : ''}
    `;

    list.appendChild(item);
  });
});

document.getElementById('copy-btn').addEventListener('click', async () => {
  const btn = document.getElementById('copy-btn');
  const url = window.location.href;

  const resetBtn = () => {
    btn.classList.remove('copied');
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="9" y="9" width="13" height="13" rx="2"
          stroke="currentColor" stroke-width="2"/>
        <path d="M5 15H4C2.89543 15 2 14.1046 2 13V4C2 2.89543 2.89543 2
          4 2H13C14.1046 2 15 2.89543 15 4V5"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      Copy Invite Link
    `;
  };

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      window.prompt('Copy this link to invite collaborators:', url);
      return;
    }
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(resetBtn, 2000);
  } catch {
    window.prompt('Copy this link to invite collaborators:', url);
  }
});

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
