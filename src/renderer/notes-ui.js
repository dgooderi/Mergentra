import { state } from './state.js';
import { viewStorage } from './app-storage.js';
import { renderMarkdown } from './markdown.js';

export function loadNotes() {
  state.notes = viewStorage.loadNotes(state.currentRepositoryPath);
}

export function setNote(kind, key, text) {
  if (text.trim() === '') {
    delete state.notes[kind][key];
  } else {
    state.notes[kind][key] = text;
  }
  viewStorage.saveNotes(state.currentRepositoryPath, state.notes);
  refreshNoteMarkers();
}

export function refreshNoteMarkers() {
  for (const node of document.querySelectorAll('[data-testid="commit-node"]')) {
    const refNames = JSON.parse(node.dataset.refNames || '[]');
    const hasNote =
      Object.hasOwn(state.notes.commits, node.dataset.commitHash) ||
      refNames.some((name) => Object.hasOwn(state.notes.branches, name));
    node.dataset.hasNote = String(hasNote);
  }
  for (const lane of document.querySelectorAll('#reference-lanes li')) {
    const hasNote = Object.hasOwn(state.notes.branches, lane.dataset.refName);
    lane.dataset.hasNote = String(hasNote);
    lane.querySelector('[data-testid="branch-note-toggle"]').textContent = hasNote
      ? 'Note ✎'
      : 'Note';
  }
  renderSelectedBranchNotes();
}

export function renderSelectedBranchNotes() {
  const list = document.getElementById('selected-commit-branch-notes');
  list.replaceChildren();
  const names = (state.selectedCommit?.references || []).filter((name) =>
    Object.hasOwn(state.notes.branches, name)
  );
  for (const name of names) {
    const item = document.createElement('li');
    const heading = document.createElement('span');
    const body = document.createElement('div');
    heading.textContent = `${name}: `;
    renderMarkdown(state.notes.branches[name], body);
    item.append(heading, body);
    list.append(item);
  }
  document.getElementById('selected-commit-branch-notes-heading').hidden = names.length === 0;
  list.parentElement.hidden = names.length === 0;
}
