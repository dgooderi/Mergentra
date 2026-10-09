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
      'repository:recent',
      'repository:forget-recent',
      'repository:rename-recent',
      'settings:get-git-path',
      'settings:save-git-path',
      'settings:get-default-directory',
      'settings:save-default-directory',
      'settings:choose-default-directory'
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
});
