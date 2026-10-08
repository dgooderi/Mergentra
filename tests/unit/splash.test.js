import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import splashModule from '../../src/splash.js';

const { createSplash, revealWhenReady } = splashModule;

function fakeWindow() {
  const handlers = {};
  return {
    loadFile: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
    isDestroyed: vi.fn(() => false),
    once: vi.fn((event, handler) => {
      handlers[event] = handler;
    }),
    emit: (event) => handlers[event]()
  };
}

describe('splash screen', () => {
  const applicationDirectory = path.resolve('app');

  it('opens a small frameless window showing the splash page', () => {
    const splash = fakeWindow();
    const BrowserWindow = vi.fn(function () {
      return splash;
    });

    expect(createSplash({ BrowserWindow, applicationDirectory, enabled: true })).toBe(splash);
    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 360,
        height: 360,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true
      })
    );
    expect(splash.loadFile).toHaveBeenCalledWith(path.join(applicationDirectory, 'splash.html'));
  });

  it('does not open a splash window when disabled', () => {
    const BrowserWindow = vi.fn();
    expect(createSplash({ BrowserWindow, applicationDirectory, enabled: false })).toBeNull();
    expect(BrowserWindow).not.toHaveBeenCalled();
  });

  it('shows the main window and closes the splash once the main window is ready', () => {
    const main = fakeWindow();
    const splash = fakeWindow();
    revealWhenReady({ window: main, splash, minimumMilliseconds: 0 });
    expect(main.show).not.toHaveBeenCalled();

    main.emit('ready-to-show');
    return new Promise((resolve) => setTimeout(resolve, 5)).then(() => {
      expect(main.show).toHaveBeenCalled();
      expect(splash.close).toHaveBeenCalled();
    });
  });

  it('shows the main window straight away when there is no splash', () => {
    const main = fakeWindow();
    revealWhenReady({ window: main, splash: null, minimumMilliseconds: 0 });
    main.emit('ready-to-show');
    expect(main.show).toHaveBeenCalled();
  });
});
