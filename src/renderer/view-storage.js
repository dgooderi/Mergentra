const viewStateKeyPrefix = 'mergentra:view-state:';
const notesKeyPrefix = 'mergentra:notes:';
const repositoryNoteKeyPrefix = 'mergentra:repository-note:';

// Every operation is best-effort: unavailable or full storage must never break the view.
export function createViewStorage(storage) {
  return {
    loadNotes(repositoryPath) {
      try {
        const stored = JSON.parse(storage.getItem(notesKeyPrefix + repositoryPath));
        return { commits: stored?.commits || {}, branches: stored?.branches || {} };
      } catch {
        return { commits: {}, branches: {} };
      }
    },

    saveNotes(repositoryPath, notes) {
      try {
        storage.setItem(notesKeyPrefix + repositoryPath, JSON.stringify(notes));
      } catch {
        // Notes are best-effort local storage.
      }
    },

    loadViewState(repositoryPath) {
      try {
        return JSON.parse(storage.getItem(viewStateKeyPrefix + repositoryPath)) || null;
      } catch {
        return null;
      }
    },

    saveViewState(repositoryPath, state) {
      try {
        storage.setItem(viewStateKeyPrefix + repositoryPath, JSON.stringify(state));
      } catch {
        // View state is a convenience.
      }
    },

    readRepositoryNote(repositoryPath) {
      try {
        return storage.getItem(repositoryNoteKeyPrefix + repositoryPath) || '';
      } catch {
        return '';
      }
    },

    writeRepositoryNote(repositoryPath, text) {
      try {
        if (text.trim() === '') {
          storage.removeItem(repositoryNoteKeyPrefix + repositoryPath);
        } else {
          storage.setItem(repositoryNoteKeyPrefix + repositoryPath, text);
        }
      } catch {
        // Best-effort local storage.
      }
    }
  };
}
