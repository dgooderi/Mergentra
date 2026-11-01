import path from 'node:path';
import { describe, expect, it } from 'vitest';
import fetchGuardLogModule from '../../src/fetch-guard-log.js';

const { createFetchGuardLog } = fetchGuardLogModule;

function createFakeFileSystem() {
  const files = new Map();
  return {
    files,
    mkdirSync: () => {},
    readFileSync: (file) => {
      if (!files.has(file)) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      return files.get(file);
    },
    writeFileSync: (file, content) => files.set(file, content),
    renameSync: (from, to) => {
      files.set(to, files.get(from));
      files.delete(from);
    }
  };
}

const LOG_FILE = path.join('C:\\data', 'fetch-guard-log.json');

describe('fetch guard log', () => {
  it('starts empty', () => {
    const log = createFetchGuardLog('C:\\data', createFakeFileSystem());

    expect(log.list()).toEqual([]);
  });

  it('records the time, repository, warning categories and decision of a guard event', () => {
    const log = createFetchGuardLog(
      'C:\\data',
      createFakeFileSystem(),
      () => new Date('2026-10-25T12:00:00.000Z')
    );

    log.record({
      repositoryPath: 'C:\\work\\untrusted',
      findings: [{ scope: 'local', key: 'core.sshcommand', value: 'calc.exe' }],
      decision: 'cancelled'
    });

    expect(log.list()).toEqual([
      {
        timestamp: '2026-10-25T12:00:00.000Z',
        repository: 'C:\\work\\untrusted',
        categories: ['core.sshcommand'],
        decision: 'cancelled'
      }
    ]);
  });

  it('never writes configuration values to disk', () => {
    const fileSystem = createFakeFileSystem();
    const log = createFetchGuardLog('C:\\data', fileSystem);

    log.record({
      repositoryPath: 'C:\\work\\untrusted',
      findings: [{ scope: 'local', key: 'core.sshcommand', value: 'calc.exe --secret-token' }],
      decision: 'fetched-anyway'
    });

    expect(fileSystem.files.get(LOG_FILE)).not.toContain('calc.exe');
    expect(fileSystem.files.get(LOG_FILE)).not.toContain('secret-token');
  });

  it('keeps only setting names, dropping names and addresses embedded in keys', () => {
    const log = createFetchGuardLog('C:\\data', createFakeFileSystem());

    log.record({
      repositoryPath: 'C:\\work\\r',
      findings: [
        { scope: 'local', key: 'url.ext::https://user:pw@host/x.insteadof', value: 'a' },
        { scope: 'local', key: 'credential.https://user:pw@host.helper', value: '!x' },
        { scope: 'local', key: 'remote.origin.url', value: 'ext::sh' },
        { scope: 'local', key: 'core.sshcommand', value: 'x' }
      ],
      decision: 'cancelled'
    });

    expect(log.list()[0].categories).toEqual([
      'url.insteadof',
      'credential.helper',
      'remote.url',
      'core.sshcommand'
    ]);
  });

  it('removes credentials from a repository location given as a URL', () => {
    const log = createFetchGuardLog('C:\\data', createFakeFileSystem());

    log.record({
      repositoryPath: 'https://user:hunter2@example.invalid/repo.git',
      findings: [{ key: 'core.sshcommand' }],
      decision: 'cancelled'
    });

    expect(log.list()[0].repository).toBe('https://example.invalid/repo.git');
  });

  it('lists newest entries first', () => {
    const times = ['2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'];
    const log = createFetchGuardLog(
      'C:\\data',
      createFakeFileSystem(),
      () => new Date(times.shift())
    );
    for (const decision of ['cancelled', 'fetched-anyway']) {
      log.record({ repositoryPath: 'C:\\r', findings: [{ key: 'core.askpass' }], decision });
    }

    expect(log.list().map((entry) => entry.decision)).toEqual(['fetched-anyway', 'cancelled']);
  });

  it('keeps only the 200 most recent entries', () => {
    let tick = 0;
    const log = createFetchGuardLog(
      'C:\\data',
      createFakeFileSystem(),
      () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++))
    );
    for (let index = 0; index < 205; index += 1) {
      log.record({
        repositoryPath: `C:\\repo${index}`,
        findings: [{ key: 'core.askpass' }],
        decision: 'cancelled'
      });
    }

    const entries = log.list();
    expect(entries).toHaveLength(200);
    expect(entries[0].repository).toBe('C:\\repo204');
    expect(entries.at(-1).repository).toBe('C:\\repo5');
  });

  it('clears the log', () => {
    const log = createFetchGuardLog('C:\\data', createFakeFileSystem());
    log.record({
      repositoryPath: 'C:\\r',
      findings: [{ key: 'core.askpass' }],
      decision: 'cancelled'
    });

    log.clear();

    expect(log.list()).toEqual([]);
  });

  it('writes through a temporary file so a crash cannot leave a half-written log', () => {
    const fileSystem = createFakeFileSystem();
    const writes = [];
    const originalWrite = fileSystem.writeFileSync;
    fileSystem.writeFileSync = (file, content) => {
      writes.push(file);
      originalWrite(file, content);
    };
    const log = createFetchGuardLog('C:\\data', fileSystem);

    log.record({
      repositoryPath: 'C:\\r',
      findings: [{ key: 'core.askpass' }],
      decision: 'cancelled'
    });

    expect(writes).toEqual([`${LOG_FILE}.tmp`]);
    expect(fileSystem.files.has(LOG_FILE)).toBe(true);
  });

  it('reports an unreadable log instead of treating it as empty', () => {
    const fileSystem = createFakeFileSystem();
    fileSystem.files.set(LOG_FILE, '{not json');
    const log = createFetchGuardLog('C:\\data', fileSystem);

    expect(() => log.list()).toThrow('Mergentra fetch guard log is not valid JSON');
  });

  it('reports a failed write and does not hide it', () => {
    const fileSystem = createFakeFileSystem();
    fileSystem.writeFileSync = () => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    };
    const log = createFetchGuardLog('C:\\data', fileSystem);

    expect(() =>
      log.record({
        repositoryPath: 'C:\\r',
        findings: [{ key: 'core.askpass' }],
        decision: 'cancelled'
      })
    ).toThrow('Mergentra fetch guard log could not be saved: disk full');
  });

  it('refuses an unknown decision', () => {
    const log = createFetchGuardLog('C:\\data', createFakeFileSystem());

    expect(() =>
      log.record({
        repositoryPath: 'C:\\r',
        findings: [{ key: 'core.askpass' }],
        decision: 'maybe'
      })
    ).toThrow('decision');
  });
});
