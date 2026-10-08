import { describe, expect, it, vi } from 'vitest';
import appStateModule from '../../src/app-state.js';

const { createAppState } = appStateModule;

describe('app state', () => {
  it('loads settings from the store once and starts with no active repository', () => {
    const store = {
      load: vi.fn(() => ({ gitPath: 'git', recentRepositories: [] })),
      save: vi.fn()
    };

    const state = createAppState(store);

    expect(state.getSettings()).toEqual({ gitPath: 'git', recentRepositories: [] });
    expect(state.getActiveRepositoryPath()).toBeNull();
    expect(store.load).toHaveBeenCalledTimes(1);
  });

  it('persists saved settings and returns them afterwards', () => {
    const store = { load: () => ({ gitPath: '', recentRepositories: [] }), save: vi.fn() };
    const state = createAppState(store);
    const next = { gitPath: 'C:\\git.exe', recentRepositories: [] };

    state.saveSettings(next);

    expect(store.save).toHaveBeenCalledWith(next);
    expect(state.getSettings()).toBe(next);
  });

  it('keeps the old settings when saving fails', () => {
    const original = { gitPath: '', recentRepositories: [] };
    const store = {
      load: () => original,
      save: vi.fn(() => {
        throw new Error('disk full');
      })
    };
    const state = createAppState(store);

    expect(() => state.saveSettings({ gitPath: 'x', recentRepositories: [] })).toThrow('disk full');
    expect(state.getSettings()).toBe(original);
  });

  it('tracks the active repository', () => {
    const state = createAppState({ load: () => ({}), save: vi.fn() });

    state.setActiveRepositoryPath('C:\\repos\\a');

    expect(state.getActiveRepositoryPath()).toBe('C:\\repos\\a');
  });
});
