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
  it('registers the existing preload channels', () => {
    const { handlers } = makeIpcDependencies();

    expect([...handlers.keys()]).toEqual([
      'repository:choose',
      'repository:open',
      'repository:fetch',
      'app:version',
      'external:open-release',
      'diagnostics:copy',
      'repository:open-in-explorer',
      'repository:recent',
      'settings:get-git-path',
      'settings:save-git-path'
    ]);
  });

  it('opens only GitScope release URLs', async () => {
    const { handlers, dependencies } = makeIpcDependencies();

    await handlers.get('external:open-release')(
      null,
      'https://github.com/dgooderi/GitScope/releases/tag/v1.0.0'
    );
    expect(dependencies.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/dgooderi/GitScope/releases/tag/v1.0.0'
    );
    await expect(
      handlers.get('external:open-release')(null, 'https://example.com/')
    ).rejects.toThrow('Only GitScope GitHub release links can be opened.');
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
