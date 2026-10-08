import { beforeEach, describe, expect, it } from 'vitest';
import { createUpdateService } from '../../src/update-service.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 9);

function releaseJson(version = '0.11.0') {
  const name = (suffix) => `Mergentra-${version}-${suffix}`;
  const asset = (suffix) => ({
    name: name(suffix),
    size: 1,
    digest: `sha256:${'a'.repeat(64)}`,
    browser_download_url: `https://github.com/dgooderi/Mergentra/releases/download/v${version}/${name(suffix)}`
  });
  return {
    tag_name: `v${version}`,
    html_url: `https://github.com/dgooderi/Mergentra/releases/tag/v${version}`,
    draft: false,
    prerelease: false,
    body: '',
    assets: [asset('Setup.exe'), asset('Portable.exe'), asset('x64.msi')]
  };
}

let settings;
let calls;
let clicks;
let checkbox;
let fetches;

function build(overrides = {}) {
  return createUpdateService({
    getVersion: () => '0.10.1',
    getSettings: () => settings,
    saveSettings: (next) => {
      settings = next;
    },
    channel: 'installer',
    fetchImpl: async () => {
      fetches += 1;
      return Response.json(releaseJson());
    },
    showMessageBox: async (options) => {
      calls.dialogs.push(options);
      const label = clicks.shift();
      return {
        response: options.buttons.indexOf(label),
        checkboxChecked: checkbox ?? options.checkboxChecked
      };
    },
    showError: (title, message) => calls.errors.push(message),
    openExternal: async (url) => calls.opened.push(url),
    showItemInFolder: (file) => calls.revealed.push(file),
    launchInstaller: (file) => calls.launched.push(file),
    quit: () => calls.quits.push(true),
    downloadAsset: async ({ asset, requireDigest }) => {
      calls.downloads.push({ name: asset.name, requireDigest });
      return `C:\\temp\\${asset.name}`;
    },
    downloadDirectory: () => 'C:\\temp',
    now: () => NOW,
    ...overrides
  });
}

beforeEach(() => {
  settings = { gitPath: '', recentRepositories: [] };
  calls = {
    dialogs: [],
    errors: [],
    opened: [],
    revealed: [],
    launched: [],
    quits: [],
    downloads: []
  };
  clicks = [];
  checkbox = undefined;
  fetches = 0;
});

describe('scheduled update check', () => {
  it('asks about a newer release and records when it checked', async () => {
    clicks = ['Remind me later'];
    await build().runScheduledCheck();
    expect(calls.dialogs).toHaveLength(1);
    expect(calls.dialogs[0].message).toBe('Mergentra 0.11.0 is available');
    expect(calls.dialogs[0].buttons).toEqual([
      'Download and install',
      'Download',
      'Release notes',
      'Skip this version',
      'Remind me later'
    ]);
    expect(settings.lastUpdateCheck).toBe(NOW);
  });

  it('does nothing, and makes no network call, when checked within a week', async () => {
    settings.lastUpdateCheck = NOW - 2 * DAY;
    await build().runScheduledCheck();
    expect(fetches).toBe(0);
    expect(calls.dialogs).toHaveLength(0);
  });

  it('makes no network call when automatic checking is off', async () => {
    settings.autoUpdateCheck = false;
    await build().runScheduledCheck();
    expect(fetches).toBe(0);
  });

  it('stays quiet when already up to date, but records the check', async () => {
    await build({ getVersion: () => '0.11.0' }).runScheduledCheck();
    expect(calls.dialogs).toHaveLength(0);
    expect(settings.lastUpdateCheck).toBe(NOW);
  });

  it('does not offer a skipped version, but offers a newer one', async () => {
    settings.skippedVersion = '0.11.0';
    await build().runScheduledCheck();
    expect(calls.dialogs).toHaveLength(0);

    settings.lastUpdateCheck = undefined;
    clicks = ['Remind me later'];
    await build({
      fetchImpl: async () => Response.json(releaseJson('0.12.0'))
    }).runScheduledCheck();
    expect(calls.dialogs).toHaveLength(1);
  });

  it('logs a failure instead of showing it and does not repeat on the next launch', async () => {
    const logged = [];
    await build({
      fetchImpl: async () => new Response('down', { status: 503 }),
      log: (message) => logged.push(message)
    }).runScheduledCheck();
    expect(calls.dialogs).toHaveLength(0);
    expect(calls.errors).toHaveLength(0);
    expect(logged[0]).toMatch(/HTTP 503/);
    expect(settings.lastUpdateCheck).toBe(NOW);
  });

  it('survives the network being unreachable', async () => {
    const logged = [];
    await build({
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
      log: (message) => logged.push(message)
    }).runScheduledCheck();
    expect(logged[0]).toMatch(/fetch failed/);
  });
});

describe('update dialog choices', () => {
  const available = async (service) => (await service.check()).release;

  it('downloads, verifies and launches the installer, then quits', async () => {
    clicks = ['Download and install'];
    const service = build();
    await service.prompt(await available(service));
    expect(calls.downloads).toEqual([{ name: 'Mergentra-0.11.0-Setup.exe', requireDigest: true }]);
    expect(calls.launched).toEqual(['C:\\temp\\Mergentra-0.11.0-Setup.exe']);
    expect(calls.quits).toHaveLength(1);
  });

  it('downloads without running the installer', async () => {
    clicks = ['Download'];
    const service = build();
    await service.prompt(await available(service));
    expect(calls.launched).toHaveLength(0);
    expect(calls.revealed).toEqual(['C:\\temp\\Mergentra-0.11.0-Setup.exe']);
    expect(calls.quits).toHaveLength(0);
  });

  it('opens the release notes and keeps the dialog open', async () => {
    clicks = ['Release notes', 'Remind me later'];
    const service = build();
    await service.prompt(await available(service));
    expect(calls.opened).toEqual(['https://github.com/dgooderi/Mergentra/releases/tag/v0.11.0']);
    expect(calls.dialogs).toHaveLength(2);
  });

  it('remembers a skipped version', async () => {
    clicks = ['Skip this version'];
    const service = build();
    await service.prompt(await available(service));
    expect(settings.skippedVersion).toBe('0.11.0');
  });

  it('turns automatic checking off when the checkbox is ticked, whatever the button', async () => {
    clicks = ['Remind me later'];
    checkbox = true;
    const service = build();
    await service.prompt(await available(service));
    expect(settings.autoUpdateCheck).toBe(false);
  });

  it('changes nothing for Remind me later', async () => {
    clicks = ['Remind me later'];
    const before = { ...settings };
    const service = build();
    await service.prompt(await available(service));
    expect(settings).toEqual({ ...before, lastUpdateCheck: NOW });
  });

  it('shows the failure when the download cannot be verified', async () => {
    clicks = ['Download and install'];
    const service = build({
      downloadAsset: async () => {
        throw new Error('The downloaded file failed its checksum check, so it was discarded.');
      }
    });
    await service.prompt(await available(service));
    expect(calls.errors[0]).toMatch(/checksum/);
    expect(calls.launched).toHaveLength(0);
  });

  it('does not offer install for portable or MSI installs', async () => {
    for (const channel of ['portable', 'msi']) {
      clicks = ['Remind me later'];
      calls.dialogs = [];
      const service = build({ channel });
      await service.prompt(await available(service));
      expect(calls.dialogs[0].buttons).not.toContain('Download and install');
    }
  });

  it('downloads the MSI for a managed install', async () => {
    clicks = ['Download'];
    const service = build({ channel: 'msi' });
    await service.prompt(await available(service));
    expect(calls.downloads[0].name).toBe('Mergentra-0.11.0-x64.msi');
  });
});
