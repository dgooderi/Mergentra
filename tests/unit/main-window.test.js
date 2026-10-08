import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import mainWindowModule from '../../src/main-window.js';

const { createMainWindow } = mainWindowModule;

describe('main window creation', () => {
  it('creates the existing secure window configuration and loads the app page', () => {
    const window = { loadFile: vi.fn(), maximize: vi.fn() };
    const BrowserWindow = vi.fn(function () {
      return window;
    });
    const Menu = { setApplicationMenu: vi.fn() };
    const applicationDirectory = path.resolve('app');

    expect(createMainWindow({ BrowserWindow, Menu, applicationDirectory })).toBe(window);
    expect(Menu.setApplicationMenu).toHaveBeenCalledWith(null);
    expect(BrowserWindow).toHaveBeenCalledWith({
      width: 1080,
      height: 720,
      minWidth: 720,
      minHeight: 520,
      backgroundColor: '#111827',
      show: false,
      icon: path.join(applicationDirectory, '..', 'assets', 'icons', 'mergentra-256.png'),
      webPreferences: {
        preload: path.join(applicationDirectory, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    expect(window.loadFile).toHaveBeenCalledWith(path.join(applicationDirectory, 'index.html'));
  });

  it('maximises the window before it is first shown', () => {
    const window = { loadFile: vi.fn(), maximize: vi.fn() };
    const BrowserWindow = vi.fn(function () {
      return window;
    });

    createMainWindow({
      BrowserWindow,
      Menu: { setApplicationMenu: vi.fn() },
      applicationDirectory: path.resolve('app')
    });

    expect(window.maximize).toHaveBeenCalledTimes(1);
    expect(BrowserWindow.mock.calls[0][0].show).toBe(false);
  });
});
