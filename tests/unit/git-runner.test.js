import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import gitRunner from '../../src/git-runner.js';

const { createGitRunner } = gitRunner;

describe('git runner', () => {
  it('runs Git with the configured executable, limits, and non-interactive environment', async () => {
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: 'git version', stderr: '' });
    const runner = createGitRunner({
      execFileAsync,
      getEnvironment: () => ({ PATH: 'fake-path', GIT_TERMINAL_PROMPT: '1' })
    });

    await expect(
      runner.runGit('git-test.exe', ['--version'], { timeout: 5000, maxBuffer: 1024 })
    ).resolves.toEqual({ stdout: 'git version', stderr: '' });
    expect(execFileAsync).toHaveBeenCalledWith('git-test.exe', ['--version'], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 1024,
      env: {
        PATH: 'fake-path',
        GIT_NO_LAZY_FETCH: '1',
        GIT_TERMINAL_PROMPT: '0'
      }
    });
  });

  it('preserves errors from the Git executable', async () => {
    const failure = Object.assign(new Error('Git not found'), { code: 'ENOENT' });
    const runner = createGitRunner({ execFileAsync: vi.fn().mockRejectedValue(failure) });

    await expect(runner.runGit('missing-git', ['--version'])).rejects.toBe(failure);
  });

  it('writes input and collects stdout and stderr', async () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = vi.fn();
    let receivedInput = '';
    child.stdin.on('data', (chunk) => {
      receivedInput += chunk.toString();
    });
    const spawnProcess = vi.fn(() => {
      setImmediate(() => {
        child.stdout.end('checked objects');
        child.stderr.end('diagnostic');
        child.emit('close', 0, null);
      });
      return child;
    });
    const runner = createGitRunner({
      spawnProcess,
      getEnvironment: () => ({ GIT_TERMINAL_PROMPT: '1' })
    });

    await expect(
      runner.runGitWithInput('git-test.exe', ['cat-file', '--batch-check'], 'hash\n')
    ).resolves.toEqual({ stdout: 'checked objects', stderr: 'diagnostic' });
    expect(receivedInput).toBe('hash\n');
    expect(spawnProcess).toHaveBeenCalledWith('git-test.exe', ['cat-file', '--batch-check'], {
      windowsHide: true,
      env: { GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' }
    });
  });

  it('rejects non-zero exits with captured Git diagnostics', async () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = vi.fn();
    const spawnProcess = vi.fn(() => {
      setImmediate(() => {
        child.stdout.end('partial output');
        child.stderr.end('git failed\n');
        child.emit('close', 2, null);
      });
      return child;
    });
    const runner = createGitRunner({ spawnProcess });

    await expect(runner.runGitWithInput('git-test.exe', ['command'], '')).rejects.toMatchObject({
      message: 'git failed',
      code: 2,
      stderr: 'git failed\n',
      stdout: 'partial output'
    });
  });
});
