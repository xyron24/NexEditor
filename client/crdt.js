import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness.js';

const ydoc = new Y.Doc();
const ytext = ydoc.getText('codemirror-content');
const awareness = new Awareness(ydoc);

export { ydoc, ytext, awareness };
