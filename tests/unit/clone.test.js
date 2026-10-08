import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import clone from '../../src/clone.js';

const { validateCloneUrl, buildCloneArguments, repositoryNameFromUrl, checkDestination, runClone } =
  clone;

describe('validateCloneUrl', () => {
  it.each([
    'https://github.com/dgooderi/Mergentra.git',
    'https://example.com/a/b',
    'ssh://git@example.com/a/b.git',
    'git@github.com:dgooderi/Mergentra.git'
  ])('accepts %s', (url) => {
    expect(validateCloneUrl(url)).toEqual({ valid: true, url });
  });

  it('trims surrounding whitespace', () => {
    expect(validateCloneUrl('  https://example.com/a  ')).toEqual({
      valid: true,
      url: 'https://example.com/a'
    });
  });

  it.each([
    ['', /Enter a repository URL/],
    ['   ', /Enter a repository URL/],
    ['--upload-pack=calc', /option/],
    ['-u calc', /option/],
    ['ext::calc', /HTTPS or SSH/],
    ['ext::sh -c calc', /HTTPS or SSH|spaces/],
    ['file:///C:/repo', /HTTPS or SSH/],
    ['C:\\repos\\thing', /HTTPS or SSH/],
    ['\\\\server\\share\\repo', /HTTPS or SSH/],
    ['/home/user/repo', /HTTPS or SSH/],
    ['http://example.com/a', /HTTPS or SSH/],
    ['git://example.com/a', /HTTPS or SSH/],
    ['https://example.com/a b', /spaces|control/],
    ['https://example.com/a\nb', /spaces|control/],
    ['https://', /host/],
    ['ssh://-oProxyCommand=calc/a', /option/],
    ['-oProxyCommand=calc@host:path', /option/]
  ])('rejects %j', (url, message) => {
    const result = validateCloneUrl(url);
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(message);
  });

  it('accepts a local path only when explicitly allowed', () => {
    expect(validateCloneUrl('C:\\repos\\thing', { allowLocal: true }).valid).toBe(true);
    expect(validateCloneUrl('--evil', { allowLocal: true }).valid).toBe(false);
    expect(validateCloneUrl('ext::calc', { allowLocal: true }).valid).toBe(false);
  });
});

describe('buildCloneArguments', () => {
  it('restricts protocols and ends options before the URL', () => {
    const args = buildCloneArguments({ url: 'https://example.com/a.git', destination: 'D:\\x' });
    expect(args).toEqual([
      '-c',
      'protocol.allow=never',
      '-c',
      'protocol.https.allow=always',
      '-c',
      'protocol.ssh.allow=always',
      'clone',
      '--progress',
      '--',
      'https://example.com/a.git',
      'D:\\x'
    ]);
  });

  it('adds a blob-less filter for history only', () => {
    const args = buildCloneArguments({
      url: 'https://example.com/a.git',
      destination: 'D:\\x',
      historyOnly: true
    });
    expect(args).toContain('--filter=blob:none');
    expect(args.indexOf('--filter=blob:none')).toBeLessThan(args.indexOf('--'));
  });

  it('allows the file protocol only for explicitly allowed local clones', () => {
    const args = buildCloneArguments({ url: 'D:\\bare', destination: 'D:\\x', allowLocal: true });
    expect(args).toContain('protocol.file.allow=always');
  });
});

describe('repositoryNameFromUrl', () => {
  it.each([
    ['https://github.com/dgooderi/Mergentra.git', 'Mergentra'],
    ['https://github.com/dgooderi/Mergentra/', 'Mergentra'],
    ['git@github.com:dgooderi/Mergentra.git', 'Mergentra'],
    ['ssh://git@host/a/b', 'b'],
    ['https://host', 'repository']
  ])('%s -> %s', (url, name) => {
    expect(repositoryNameFromUrl(url)).toBe(name);
  });
});

describe('checkDestination', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-dest-'));
  fs.mkdirSync(path.join(root, 'empty'));
  fs.mkdirSync(path.join(root, 'full'));
  fs.writeFileSync(path.join(root, 'full', 'a.txt'), 'a');
  fs.writeFileSync(path.join(root, 'file.txt'), 'a');

  it('accepts a new folder inside an existing one', () => {
    expect(checkDestination(path.join(root, 'new'))).toEqual({
      valid: true,
      path: path.join(root, 'new'),
      existed: false
    });
  });

  it('accepts an empty existing folder', () => {
    expect(checkDestination(path.join(root, 'empty'))).toMatchObject({
      valid: true,
      existed: true
    });
  });

  it('refuses a non-empty folder, a file, a missing parent and blank input', () => {
    expect(checkDestination(path.join(root, 'full'))).toMatchObject({
      valid: false,
      message: expect.stringContaining('not empty')
    });
    expect(checkDestination(path.join(root, 'file.txt')).valid).toBe(false);
    expect(checkDestination(path.join(root, 'missing', 'new')).valid).toBe(false);
    expect(checkDestination('  ').valid).toBe(false);
    expect(checkDestination(undefined).valid).toBe(false);
  });
});

describe('runClone', () => {
  function fakeSpawn() {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn(() => child.emit('close', null, 'SIGTERM'));
    return { child, spawnProcess: vi.fn(() => child) };
  }
  const base = { gitPath: 'git', url: 'https://example.com/a.git', destination: 'D:\\x' };

  it('reports progress and resolves on success', async () => {
    const { child, spawnProcess } = fakeSpawn();
    const onProgress = vi.fn();
    const { promise } = runClone({ ...base, existed: false, onProgress, spawnProcess });
    child.stderr.write('Receiving objects:  10%\rReceiving objects:  50%\r');
    await new Promise((resolve) => setImmediate(resolve));
    child.emit('close', 0, null);
    await expect(promise).resolves.toMatchObject({ cancelled: false });
    expect(onProgress).toHaveBeenLastCalledWith('Receiving objects:  50%');
    expect(spawnProcess.mock.calls[0][2].env.GIT_TERMINAL_PROMPT).toBe('0');
  });

  it('removes a folder it created when Git fails, and rejects with stderr', async () => {
    const { child, spawnProcess } = fakeSpawn();
    const fileSystem = { rmSync: vi.fn(), readdirSync: vi.fn() };
    const { promise } = runClone({ ...base, existed: false, spawnProcess, fileSystem });
    child.stderr.write('fatal: Authentication failed');
    await new Promise((resolve) => setImmediate(resolve));
    child.emit('close', 128, null);
    await expect(promise).rejects.toThrow('Authentication failed');
    expect(fileSystem.rmSync).toHaveBeenCalledWith('D:\\x', { recursive: true, force: true });
  });

  it('cancel stops Git and cleans up, keeping a pre-existing folder itself', async () => {
    const { spawnProcess } = fakeSpawn();
    const fileSystem = { rmSync: vi.fn(), readdirSync: vi.fn(() => ['.git']) };
    const run = runClone({ ...base, existed: true, spawnProcess, fileSystem });
    run.cancel();
    await expect(run.promise).resolves.toMatchObject({ cancelled: true });
    expect(fileSystem.rmSync).toHaveBeenCalledWith(path.join('D:\\x', '.git'), {
      recursive: true,
      force: true
    });
    expect(fileSystem.rmSync).not.toHaveBeenCalledWith('D:\\x', expect.anything());
  });
});
