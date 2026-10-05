import { describe, expect, it } from 'vitest';
import { createViewStorage } from '../../src/renderer/view-storage.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key)
  };
}

const brokenStorage = {
  getItem() {
    throw new Error('unavailable');
  },
  setItem() {
    throw new Error('full');
  },
  removeItem() {
    throw new Error('unavailable');
  }
};

describe('createViewStorage', () => {
  it('round-trips notes under the existing key', () => {
    const storage = memoryStorage();
    const views = createViewStorage(storage);
    const notes = { commits: { abc: 'hi' }, branches: {} };
    views.saveNotes('/repo', notes);
    expect(storage.data.has('gitscope:notes:/repo')).toBe(true);
    expect(views.loadNotes('/repo')).toEqual(notes);
  });

  it('returns empty notes when nothing valid is stored', () => {
    expect(createViewStorage(memoryStorage()).loadNotes('/repo')).toEqual({
      commits: {},
      branches: {}
    });
    const corrupt = memoryStorage({ 'gitscope:notes:/repo': '{not json' });
    expect(createViewStorage(corrupt).loadNotes('/repo')).toEqual({ commits: {}, branches: {} });
  });

  it('round-trips view state and returns null when missing or corrupt', () => {
    const storage = memoryStorage();
    const views = createViewStorage(storage);
    expect(views.loadViewState('/repo')).toBeNull();
    views.saveViewState('/repo', { preset: '1w' });
    expect(storage.data.has('gitscope:view-state:/repo')).toBe(true);
    expect(views.loadViewState('/repo')).toEqual({ preset: '1w' });
    storage.setItem('gitscope:view-state:/bad', 'x');
    expect(views.loadViewState('/bad')).toBeNull();
  });

  it('stores repository notes and removes them when blank', () => {
    const storage = memoryStorage();
    const views = createViewStorage(storage);
    views.writeRepositoryNote('/repo', 'my note');
    expect(storage.getItem('gitscope:repository-note:/repo')).toBe('my note');
    expect(views.readRepositoryNote('/repo')).toBe('my note');
    views.writeRepositoryNote('/repo', '   ');
    expect(views.readRepositoryNote('/repo')).toBe('');
    expect(storage.data.size).toBe(0);
  });

  it('never throws when storage fails', () => {
    const views = createViewStorage(brokenStorage);
    expect(() => {
      views.saveNotes('/r', { commits: {}, branches: {} });
      views.saveViewState('/r', {});
      views.writeRepositoryNote('/r', 'x');
    }).not.toThrow();
    expect(views.loadViewState('/r')).toBeNull();
    expect(views.readRepositoryNote('/r')).toBe('');
    expect(views.loadNotes('/r')).toEqual({ commits: {}, branches: {} });
  });
});
