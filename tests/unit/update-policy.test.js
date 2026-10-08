import { describe, expect, it } from 'vitest';
import {
  actionsForChannel,
  detectInstallChannel,
  isAutoCheckEnabled,
  isCheckDue,
  parseLatestRelease,
  pickInstallerAsset
} from '../../src/update-policy.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 9);

function release(overrides = {}) {
  return {
    tag_name: 'v0.11.0',
    html_url: 'https://github.com/dgooderi/Mergentra/releases/tag/v0.11.0',
    draft: false,
    prerelease: false,
    body: 'Notes',
    assets: [
      asset('Mergentra-0.11.0-Setup.exe'),
      asset('Mergentra-0.11.0-Portable.exe'),
      asset('Mergentra-0.11.0-x64.msi')
    ],
    ...overrides
  };
}

function asset(name) {
  return {
    name,
    size: 10,
    digest: `sha256:${'a'.repeat(64)}`,
    browser_download_url: `https://github.com/dgooderi/Mergentra/releases/download/v0.11.0/${name}`
  };
}

describe('isAutoCheckEnabled', () => {
  it('defaults on for installer and portable builds and off for MSI', () => {
    expect(isAutoCheckEnabled({}, 'installer')).toBe(true);
    expect(isAutoCheckEnabled({}, 'portable')).toBe(true);
    expect(isAutoCheckEnabled({}, 'msi')).toBe(false);
  });

  it('lets a stored preference win over the install default', () => {
    expect(isAutoCheckEnabled({ autoUpdateCheck: true }, 'msi')).toBe(true);
    expect(isAutoCheckEnabled({ autoUpdateCheck: false }, 'installer')).toBe(false);
  });
});

describe('isCheckDue', () => {
  it('is due when never checked', () => {
    expect(isCheckDue({}, 'installer', NOW)).toBe(true);
  });

  it('is not due after 6 days and due after 7', () => {
    expect(isCheckDue({ lastUpdateCheck: NOW - 6 * DAY }, 'installer', NOW)).toBe(false);
    expect(isCheckDue({ lastUpdateCheck: NOW - 7 * DAY }, 'installer', NOW)).toBe(true);
  });

  it('is never due when automatic checking is off', () => {
    expect(isCheckDue({ autoUpdateCheck: false }, 'installer', NOW)).toBe(false);
    expect(isCheckDue({}, 'msi', NOW)).toBe(false);
  });

  it('treats a last check in the future as due', () => {
    expect(isCheckDue({ lastUpdateCheck: NOW + DAY }, 'installer', NOW)).toBe(true);
  });
});

describe('detectInstallChannel', () => {
  it('reads the MSI marker from the resources folder', () => {
    const fileSystem = {
      readFileSync: (file) => {
        if (file.endsWith('install-channel')) return 'msi\n';
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
    };
    expect(detectInstallChannel({ resourcesPath: 'C:\\app\\resources', env: {}, fileSystem })).toBe(
      'msi'
    );
  });

  it('reports portable when the portable launcher variable is set', () => {
    const fileSystem = {
      readFileSync: () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
    };
    expect(
      detectInstallChannel({
        resourcesPath: 'x',
        env: { PORTABLE_EXECUTABLE_FILE: 'C:\\m.exe' },
        fileSystem
      })
    ).toBe('portable');
  });

  it('defaults to a normal installer', () => {
    const fileSystem = {
      readFileSync: () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
    };
    expect(detectInstallChannel({ resourcesPath: 'x', env: {}, fileSystem })).toBe('installer');
  });
});

describe('parseLatestRelease', () => {
  it('returns the version, page link and notes of a valid release', () => {
    expect(parseLatestRelease(release())).toMatchObject({
      version: '0.11.0',
      url: 'https://github.com/dgooderi/Mergentra/releases/tag/v0.11.0',
      notes: 'Notes'
    });
  });

  it('rejects drafts, pre-releases and links to other places', () => {
    expect(() => parseLatestRelease(release({ draft: true }))).toThrow(/invalid/);
    expect(() => parseLatestRelease(release({ prerelease: true }))).toThrow(/invalid/);
    expect(() => parseLatestRelease(release({ html_url: 'https://evil.example/x' }))).toThrow(
      /unexpected release link/
    );
    expect(() => parseLatestRelease(null)).toThrow(/invalid/);
  });
});

describe('pickInstallerAsset', () => {
  const parsed = parseLatestRelease(release());

  it('picks the asset that matches the install type', () => {
    expect(pickInstallerAsset(parsed, 'installer').name).toBe('Mergentra-0.11.0-Setup.exe');
    expect(pickInstallerAsset(parsed, 'portable').name).toBe('Mergentra-0.11.0-Portable.exe');
    expect(pickInstallerAsset(parsed, 'msi').name).toBe('Mergentra-0.11.0-x64.msi');
  });

  it('ignores assets that are not hosted on the project release downloads', () => {
    const tampered = parseLatestRelease(
      release({
        assets: [
          {
            ...asset('Mergentra-0.11.0-Setup.exe'),
            browser_download_url: 'https://evil.example/Mergentra-0.11.0-Setup.exe'
          }
        ]
      })
    );
    expect(pickInstallerAsset(tampered, 'installer')).toBeUndefined();
  });
});

describe('actionsForChannel', () => {
  it('offers install only for a normal installer', () => {
    expect(actionsForChannel('installer')).toContain('install');
    expect(actionsForChannel('portable')).not.toContain('install');
    expect(actionsForChannel('msi')).not.toContain('install');
    expect(actionsForChannel('msi')).toEqual(['download', 'notes', 'skip', 'later']);
  });
});
