import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import settingsStoreModule from '../../src/settings-store.js';

const { createSettingsStore } = settingsStoreModule;
let temporaryDirectory;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-settings-test-'));
});

afterEach(() => {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe('settings store', () => {
  it('returns defaults when the settings file does not exist', () => {
    const store = createSettingsStore(temporaryDirectory);

    expect(store.load()).toEqual({ gitPath: '', recentRepositories: [] });
  });

  it('saves and reloads settings, creating the user data directory', () => {
    const userDataPath = path.join(temporaryDirectory, 'user-data');
    const store = createSettingsStore(userDataPath);
    const settings = {
      gitPath: 'C:\\Git\\bin\\git.exe',
      recentRepositories: [{ path: 'C:\\repo', name: 'repo' }]
    };

    store.save(settings);

    expect(fs.readFileSync(path.join(userDataPath, 'settings.json'), 'utf8')).toBe(
      `${JSON.stringify(settings, null, 2)}\n`
    );
    expect(store.load()).toEqual(settings);
  });

  it('drops commit graphs that earlier versions stored with recent repositories', () => {
    fs.writeFileSync(
      path.join(temporaryDirectory, 'settings.json'),
      JSON.stringify({
        gitPath: '',
        recentRepositories: [
          { path: 'C:\\repo', name: 'repo', branch: 'main', graph: { commits: [{ hash: 'a' }] } }
        ]
      })
    );

    expect(createSettingsStore(temporaryDirectory).load()).toEqual({
      gitPath: '',
      recentRepositories: [{ path: 'C:\\repo', name: 'repo' }]
    });
  });

  it('reports invalid JSON with the parsing error as its cause', () => {
    fs.writeFileSync(path.join(temporaryDirectory, 'settings.json'), '{invalid');
    const store = createSettingsStore(temporaryDirectory);

    expect(() => store.load()).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Mergentra settings are not valid JSON:'),
        cause: expect.any(SyntaxError)
      })
    );
  });

  it('rejects settings with an unsupported format', () => {
    fs.writeFileSync(
      path.join(temporaryDirectory, 'settings.json'),
      JSON.stringify({ gitPath: '', recentRepositories: [{ path: 'C:\\repo' }] })
    );
    const store = createSettingsStore(temporaryDirectory);

    expect(() => store.load()).toThrow(
      'Mergentra settings have an unsupported format. Move settings.json out of the user data folder and restart Mergentra.'
    );
  });

  it('wraps filesystem read errors with their cause', () => {
    const failure = Object.assign(new Error('access denied'), { code: 'EACCES' });
    const fileSystem = {
      readFileSync: () => {
        throw failure;
      }
    };
    const store = createSettingsStore(temporaryDirectory, fileSystem);

    expect(() => store.load()).toThrow(
      expect.objectContaining({
        message: 'Mergentra settings could not be read: access denied',
        cause: failure
      })
    );
  });
});
