import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import ipcHandlersModule from '../../src/ipc-handlers.js';

const { registerIpcHandlers } = ipcHandlersModule;

function makeIpcDependencies(overrides = {}) {
  const handlers = new Map();
  const currentSettings = { gitPath: '', recentRepositories: [] };
  const dependencies = {
    ipcMain: {
      handle: vi.fn((channel, handler) => handlers.set(channel, handler))
    },
    app: { getVersion: () => '1.0.0' },
    dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }) },
    shell: { openExternal: vi.fn(), openPath: vi.fn().mockResolvedValue('') },
    clipboard: { writeText: vi.fn() },
    window: {},
    openAndRememberRepository: vi.fn(),
    fetchRemoteReferences: vi.fn(),
    getSettings: () => currentSettings,
    saveSettings: vi.fn((nextSettings) => Object.assign(currentSettings, nextSettings)),
    getActiveRepositoryPath: () => 'C:\\repo',
    runGit: vi.fn().mockResolvedValue({ stdout: 'git version', stderr: '' }),
    ...overrides
  };

  registerIpcHandlers(dependencies);
  return { handlers, dependencies, currentSettings };
}

describe('IPC handlers', () => {
  describe('Browse starting folder', () => {
    function choose(overrides, settings = {}) {
      const made = makeIpcDependencies({ directoryExists: () => true, ...overrides });
      Object.assign(made.currentSettings, settings);
      return made;
    }

    it('starts in the default directory when no folder has been used yet', async () => {
      const { handlers, dependencies } = choose({}, { defaultDirectory: 'C:\\repos' });

      await handlers.get('repository:choose')();

      expect(dependencies.dialog.showOpenDialog).toHaveBeenCalledWith(
        dependencies.window,
        expect.objectContaining({ defaultPath: 'C:\\repos' })
      );
    });

    it('prefers the last used folder over the default directory', async () => {
      const { handlers, dependencies } = choose(
        {},
        { defaultDirectory: 'C:\\repos', lastBrowsedDirectory: 'D:\\work' }
      );

      await handlers.get('repository:choose')();

      expect(dependencies.dialog.showOpenDialog).toHaveBeenCalledWith(
        dependencies.window,
        expect.objectContaining({ defaultPath: 'D:\\work' })
      );
    });

    it('remembers the folder containing the chosen repository for next time', async () => {
      const { handlers, dependencies, currentSettings } = choose({}, {});
      dependencies.dialog.showOpenDialog.mockResolvedValueOnce({
        canceled: false,
        filePaths: ['E:\\code\\project']
      });

      await handlers.get('repository:choose')();

      expect(currentSettings.lastBrowsedDirectory).toBe('E:\\code');
    });

    it('falls back to the normal dialog when the saved folders no longer exist', async () => {
      const { handlers, dependencies } = choose(
        { directoryExists: () => false },
        { defaultDirectory: 'C:\\gone', lastBrowsedDirectory: 'D:\\gone' }
      );

      await handlers.get('repository:choose')();

      const options = dependencies.dialog.showOpenDialog.mock.calls[0][1];
      expect(options.defaultPath).toBeUndefined();
    });
  });

  describe('default directory setting', () => {
    it('reports the saved default directory and whether it still exists', async () => {
      const { handlers, currentSettings } = makeIpcDependencies({
        directoryExists: (directory) => directory === 'C:\\repos'
      });

      expect(await handlers.get('settings:get-default-directory')()).toEqual({
        path: '',
        missing: false
      });

      currentSettings.defaultDirectory = 'C:\\repos';
      expect(await handlers.get('settings:get-default-directory')()).toEqual({
        path: 'C:\\repos',
        missing: false
      });

      currentSettings.defaultDirectory = 'C:\\gone';
      expect(await handlers.get('settings:get-default-directory')()).toEqual({
        path: 'C:\\gone',
        missing: true
      });
    });

    it('saves an existing folder as the default directory', async () => {
      const { handlers, currentSettings } = makeIpcDependencies({ directoryExists: () => true });
      const folder = path.resolve('repos');

      await expect(handlers.get('settings:save-default-directory')(null, 'repos')).resolves.toBe(
        folder
      );
      expect(currentSettings.defaultDirectory).toBe(folder);
    });

    it('refuses a folder that does not exist and keeps the previous setting', async () => {
      const { handlers, currentSettings } = makeIpcDependencies({ directoryExists: () => false });
      currentSettings.defaultDirectory = 'C:\\repos';

      await expect(handlers.get('settings:save-default-directory')(null, 'nope')).rejects.toThrow(
        'That folder does not exist.'
      );
      expect(currentSettings.defaultDirectory).toBe('C:\\repos');
    });

    it('clears the default directory when given a blank value', async () => {
      const { handlers, currentSettings } = makeIpcDependencies({ directoryExists: () => false });
      currentSettings.defaultDirectory = 'C:\\repos';

      await expect(handlers.get('settings:save-default-directory')(null, '  ')).resolves.toBe('');
      expect(currentSettings.defaultDirectory).toBe('');
    });

    it('lets the user pick the default directory starting from the current one', async () => {
      const { handlers, dependencies, currentSettings } = makeIpcDependencies({
        directoryExists: () => true
      });
      currentSettings.defaultDirectory = 'C:\\repos';
      dependencies.dialog.showOpenDialog.mockResolvedValueOnce({
        canceled: false,
        filePaths: ['D:\\code']
      });

      await expect(handlers.get('settings:choose-default-directory')()).resolves.toBe('D:\\code');
      expect(dependencies.dialog.showOpenDialog).toHaveBeenCalledWith(
        dependencies.window,
        expect.objectContaining({ defaultPath: 'C:\\repos', properties: ['openDirectory'] })
      );
      expect(currentSettings.defaultDirectory).toBe('C:\\repos');
    });
  });

  it('removes one repository from the recent list and returns the remaining ones', async () => {
    const { handlers, currentSettings } = makeIpcDependencies();
    currentSettings.recentRepositories = [
      { path: 'C:\\repos\\a', name: 'a' },
      { path: 'C:\\repos\\b', name: 'b' }
    ];

    const remaining = await handlers.get('repository:forget-recent')(null, 'C:\\repos\\a');

    expect(remaining).toEqual([{ path: 'C:\\repos\\b', name: 'b' }]);
    expect(currentSettings.recentRepositories).toEqual(remaining);
  });

  it('rejects a recent repository removal that is not a path', async () => {
    const { handlers } = makeIpcDependencies();

    await expect(handlers.get('repository:forget-recent')(null, 42)).rejects.toThrow(
      'Choose a repository to remove.'
    );
  });

  it('registers the existing preload channels', () => {
    const { handlers } = makeIpcDependencies();

    expect([...handlers.keys()]).toEqual([
      'diff:files',
      'diff:patch',
      'repository:choose',
      'repository:open',
      'repository:fetch',
      'clone:choose-destination',
      'clone:start',
      'clone:cancel',
      'settings:get-auto-update-check',
      'settings:save-auto-update-check',
      'license:get',
      'license:accept',
      'license:decline',
      'updates:check',
      'app:version',
      'external:open-release',
      'diagnostics:copy',
      'repository:open-in-explorer',
      'repository:file-history',
      'repository:blame',
      'reflog:read',
      'repository:recent',
      'repository:forget-recent',
      'repository:rename-recent',
      'stashes:list',
      'stashes:inspect',
      'settings:get-git-path',
      'settings:save-git-path',
      'settings:get-default-directory',
      'settings:save-default-directory',
      'settings:choose-default-directory',
      'fetch-guard-log:list',
      'fetch-guard-log:clear'
    ]);
  });

  it('starts a clone with sanitised input, forwards progress and returns the repository as JSON', async () => {
    const repository = { path: 'C:\\clone', graph: { commits: [] } };
    const { handlers, dependencies } = makeIpcDependencies({
      cloneRepository: vi.fn(async (_request, onProgress) => {
        onProgress('Receiving objects: 50%');
        return { success: true, repository };
      }),
      window: { webContents: { send: vi.fn() } }
    });

    const result = await handlers.get('clone:start')(null, {
      url: 'https://example.com/a.git',
      destination: 'C:\\clone',
      historyOnly: 'yes',
      extra: 'ignored'
    });
    expect(dependencies.cloneRepository.mock.calls[0][0]).toEqual({
      url: 'https://example.com/a.git',
      destination: 'C:\\clone',
      historyOnly: false
    });
    expect(dependencies.window.webContents.send).toHaveBeenCalledWith(
      'clone:progress',
      'Receiving objects: 50%'
    );
    expect(JSON.parse(result.repository)).toEqual(repository);
    await expect(handlers.get('clone:start')(null, { url: 5 })).rejects.toThrow('Enter a');
  });

  it('cancels a running clone', async () => {
    const { handlers, dependencies } = makeIpcDependencies({ cancelClone: vi.fn() });
    await handlers.get('clone:cancel')();
    expect(dependencies.cancelClone).toHaveBeenCalled();
  });

  it('sends repositories over IPC as JSON strings so large histories transfer quickly', async () => {
    const { handlers, dependencies } = makeIpcDependencies();
    const repository = { path: 'C:\\repo', graph: { commits: [{ hash: 'a' }] } };
    dependencies.openAndRememberRepository.mockResolvedValue(repository);
    dependencies.fetchRemoteReferences
      .mockResolvedValueOnce({ success: true, repository })
      .mockResolvedValueOnce({ success: false, message: 'nope', diagnostics: '' });

    const opened = await handlers.get('repository:open')(null, 'C:\\repo');
    expect(JSON.parse(opened)).toEqual(repository);

    const fetched = await handlers.get('repository:fetch')();
    expect(JSON.parse(fetched.repository)).toEqual(repository);
    expect(await handlers.get('repository:fetch')()).toEqual({
      success: false,
      message: 'nope',
      diagnostics: ''
    });
  });

  it('opens only Mergentra release URLs', async () => {
    const { handlers, dependencies } = makeIpcDependencies();

    await handlers.get('external:open-release')(
      null,
      'https://github.com/dgooderi/Mergentra/releases/tag/v1.0.0'
    );
    expect(dependencies.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/dgooderi/Mergentra/releases/tag/v1.0.0'
    );
    await expect(
      handlers.get('external:open-release')(null, 'https://example.com/')
    ).rejects.toThrow('Only Mergentra GitHub release links can be opened.');
  });

  it('validates Git before persisting a configured executable path', async () => {
    const { handlers, dependencies, currentSettings } = makeIpcDependencies();
    const configuredPath = path.resolve('tools/git.exe');

    await expect(handlers.get('settings:save-git-path')(null, 'tools/git.exe')).resolves.toBe(
      configuredPath
    );
    expect(dependencies.runGit).toHaveBeenCalledWith(configuredPath, ['--version']);
    expect(currentSettings.gitPath).toBe(configuredPath);
  });

  it('clears the configured Git path when given a blank value', async () => {
    const { handlers, dependencies, currentSettings } = makeIpcDependencies();
    currentSettings.gitPath = 'C:\\Git\\bin\\git.exe';

    await expect(handlers.get('settings:save-git-path')(null, '  ')).resolves.toBe('');
    expect(dependencies.runGit).not.toHaveBeenCalled();
    expect(currentSettings.gitPath).toBe('');
  });

  it('lists the fetch guard log through its channel', async () => {
    const entries = [
      {
        timestamp: '2026-10-25T12:00:00.000Z',
        repository: 'C:\\repo',
        categories: ['core.askpass'],
        decision: 'cancelled'
      }
    ];
    const { handlers } = makeIpcDependencies({
      fetchGuardLog: { list: () => entries, clear: vi.fn() }
    });

    await expect(handlers.get('fetch-guard-log:list')()).resolves.toEqual(entries);
  });

  it('clears the fetch guard log through its channel and returns the empty list', async () => {
    const clear = vi.fn();
    const { handlers } = makeIpcDependencies({
      fetchGuardLog: { list: () => [], clear }
    });

    await expect(handlers.get('fetch-guard-log:clear')()).resolves.toEqual([]);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('reports a fetch guard log that cannot be cleared', async () => {
    const { handlers } = makeIpcDependencies({
      fetchGuardLog: {
        list: () => [],
        clear: () => {
          throw new Error('Mergentra fetch guard log could not be saved: disk full');
        }
      }
    });

    await expect(handlers.get('fetch-guard-log:clear')()).rejects.toThrow('disk full');
  describe('Commit diff', () => {
    it('returns the changed files of the selected commit from the active repository', async () => {
      const diff = { from: 'p', to: 'c', files: [] };
      const loadChangedFiles = vi.fn().mockResolvedValue(diff);
      const { handlers, dependencies, currentSettings } = makeIpcDependencies({ loadChangedFiles });
      currentSettings.gitPath = 'C:\\Git\\git.exe';

      await expect(
        handlers.get('diff:files')(null, { commit: 'abc1234', compareWith: 'def5678', extra: 1 })
      ).resolves.toEqual(diff);
      expect(loadChangedFiles).toHaveBeenCalledWith(
        dependencies.runGit,
        'C:\\Git\\git.exe',
        'C:\\repo',
        { commit: 'abc1234', compareWith: 'def5678' }
      );
    });

    it('returns the patch of one path and refuses requests without a repository', async () => {
      const patch = { binary: false, truncated: false, patch: '@@' };
      const loadFilePatch = vi.fn().mockResolvedValue(patch);
      const { handlers } = makeIpcDependencies({ loadFilePatch });

      await expect(
        handlers.get('diff:patch')(null, { commit: 'abc1234', path: 'src/a.js' })
      ).resolves.toEqual(patch);
      expect(loadFilePatch).toHaveBeenCalledWith(expect.any(Function), 'git', 'C:\\repo', {
        commit: 'abc1234',
        compareWith: undefined,
        path: 'src/a.js'
      });

      const closed = makeIpcDependencies({ loadFilePatch, getActiveRepositoryPath: () => null });
      await expect(
        closed.handlers.get('diff:patch')(null, { commit: 'abc1234', path: 'a' })
      ).rejects.toThrow('Open a repository first.');
      await expect(handlers.get('diff:files')(null, 'abc1234')).rejects.toThrow(
        'Choose a commit from the graph.'
  describe('File history', () => {
    it('answers repository:file-history with the history of the path in the open repository', async () => {
      const history = { path: 'src/a.js', hashes: ['abc'], renames: [], shallow: false };
      const loadFileHistory = vi.fn().mockResolvedValue(history);
      const { handlers, dependencies } = makeIpcDependencies({ loadFileHistory });

      const payload = await handlers.get('repository:file-history')(null, 'src/a.js');

      expect(payload).toEqual(history);
      expect(loadFileHistory).toHaveBeenCalledWith(
        { runGit: dependencies.runGit },
        'git',
        'C:\\repo',
        'src/a.js'
      );
    });

    it('rejects a path that is not text', async () => {
      const { handlers } = makeIpcDependencies({ loadFileHistory: vi.fn() });

      await expect(handlers.get('repository:file-history')(null, 42)).rejects.toThrow(
        'Enter a path inside the repository.'
      );
    });

    it('requires an open repository', async () => {
      const { handlers } = makeIpcDependencies({
        loadFileHistory: vi.fn(),
        getActiveRepositoryPath: () => null
      });

      await expect(handlers.get('repository:file-history')(null, 'a.js')).rejects.toThrow(
        'Open a repository first.'
      );
  describe('repository:blame', () => {
    const commit = '1111111111111111111111111111111111111111';
    const blameOutput = [
      `${commit} 1 1 1`,
      'author Ada Lovelace',
      'author-time 1790000000',
      'summary First draft',
      'filename notes.txt',
      '\talpha',
      ''
    ].join('\n');

    function gitStub(overrides = {}) {
      return vi.fn(async (_gitPath, args) => {
        const command = ['rev-parse', 'ls-tree', 'cat-file', 'blame'].find((name) =>
          args.includes(name)
        );
        const handler = overrides[command];
        if (handler) {
          return handler();
        }
        return {
          'rev-parse': { stdout: `${commit}\n` },
          'ls-tree': {
            stdout: `100644 blob 3333333333333333333333333333333333333333       6\tnotes.txt\0`
          },
          'cat-file': { stdout: 'alpha\n' },
          blame: { stdout: blameOutput }
        }[command];
      });
    }

    it('returns line attribution for a hash and path in the active repository', async () => {
      const { handlers } = makeIpcDependencies({ runGit: gitStub() });

      await expect(handlers.get('repository:blame')(null, commit, 'notes.txt')).resolves.toEqual({
        status: 'ok',
        incompleteHistory: false,
        lines: [
          {
            line: 1,
            commit,
            author: 'Ada Lovelace',
            date: '2026-09-21T14:13:20.000Z',
            summary: 'First draft',
            text: 'alpha',
            boundary: false
          }
        ]
      });
    });

    it('reports a Git failure as an error payload instead of rejecting', async () => {
      const { handlers } = makeIpcDependencies({
        runGit: gitStub({
          blame: () => {
            throw new Error('fatal: unable to read tree');
          }
        })
      });

      await expect(handlers.get('repository:blame')(null, commit, 'notes.txt')).resolves.toEqual({
        status: 'error',
        message: 'Git could not blame this file: fatal: unable to read tree'
      });
    });
  describe('Stashes', () => {
    const stashHash = 'a'.repeat(40);
    const baseHash = 'b'.repeat(40);
    function stashGit(overrides = {}) {
      return vi.fn(async (_gitPath, args) => {
        const command = args[2];
        if (overrides[command]) {
          return overrides[command](args);
        }
        if (command === 'for-each-ref') {
          return { stdout: `${stashHash}\n` };
        }
        return {
          stdout: `${stashHash}\0${baseHash}\x002026-10-20T10:00:00+10:00\x00WIP on main: 1234567 Base\x1e`
        };
      });
    }

    it('lists the active repository stashes using the configured Git executable', async () => {
      const runGit = stashGit();
      const { handlers, currentSettings } = makeIpcDependencies({ runGit });
      currentSettings.gitPath = 'C:\\Git\\git.exe';

      const result = await handlers.get('stashes:list')();

      expect(result).toEqual({
        stashes: [
          {
            index: 0,
            ref: 'stash@{0}',
            hash: stashHash,
            baseHash,
            date: '2026-10-20T10:00:00+10:00',
            branch: 'main',
            message: '1234567 Base'
          }
        ]
      });
      expect(runGit.mock.calls[0][0]).toBe('C:\\Git\\git.exe');
      expect(runGit.mock.calls[0][1].slice(0, 2)).toEqual(['-C', 'C:\\repo']);
    });

    it('reports unreadable stashes as an error with no entries', async () => {
      const runGit = stashGit({
        log: () => Promise.reject(new Error('bad object'))
      });
      const { handlers } = makeIpcDependencies({ runGit });

      await expect(handlers.get('stashes:list')()).resolves.toEqual({
        stashes: [],
        error: 'Stashes are unavailable: Git could not read a saved stash object (missing objects).'
      });
    });

    it('inspects a stash by index and rejects anything that is not a list index', async () => {
      const runGit = stashGit({
        'rev-parse': () => ({ stdout: `${stashHash}\n` }),
        'rev-list': () => ({
          stdout: `${stashHash} ${baseHash} ${'d'.repeat(40)} ${'c'.repeat(40)}\n`
        }),
        'diff-tree': () => ({ stdout: 'M\0src/app.js\0' }),
        'ls-tree': () => ({ stdout: 'notes.txt\0' })
      });
      const { handlers } = makeIpcDependencies({ runGit });

      await expect(handlers.get('stashes:inspect')(null, 0)).resolves.toEqual({
        available: true,
        changes: [
          { status: 'M', path: 'src/app.js' },
          { status: 'A', path: 'notes.txt' }
        ]
      });
      await expect(handlers.get('stashes:inspect')(null, '0')).rejects.toThrow(
        'Choose a stash from the list.'
      );
  describe('reflog:read', () => {
    it('reads the reflog of the active repository for the requested reference', async () => {
      const reflog = { ref: 'feature', entries: [], truncated: false };
      const readReflog = vi.fn().mockResolvedValue(reflog);
      const { handlers } = makeIpcDependencies({ readReflog });

      await expect(handlers.get('reflog:read')(null, 'feature')).resolves.toEqual(reflog);
      expect(readReflog).toHaveBeenCalledWith('C:\\repo', 'feature');
    });

    it('refuses to read without an open repository', async () => {
      const readReflog = vi.fn();
      const { handlers } = makeIpcDependencies({ readReflog, getActiveRepositoryPath: () => null });

      await expect(handlers.get('reflog:read')(null, 'HEAD')).rejects.toThrow(
        'Open a repository first.'
      );
      expect(readReflog).not.toHaveBeenCalled();
    });
  });
});
