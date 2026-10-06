import { describe, expect, it, vi } from 'vitest';
import configSafety from '../../src/git-config-safety.js';

const { UnsafeRepositoryConfigError, assertRepositoryConfigSafe, findUnsafeGitConfig } =
  configSafety;

function configOutput(entries) {
  return entries.map(([scope, key, value]) => `${scope}\0${key}\n${value}\0`).join('');
}

describe('repository Git configuration safety', () => {
  it('flags repository settings that make Git run a program', () => {
    const output = configOutput([
      ['local', 'core.sshcommand', 'calc.exe'],
      ['local', 'core.gitproxy', 'proxy.cmd'],
      ['local', 'core.askpass', 'ask.exe'],
      ['local', 'credential.helper', '!evil'],
      ['local', 'credential.https://example.com.helper', 'C:\\tools\\helper.exe'],
      ['worktree', 'remote.origin.vcs', 'custom'],
      ['local', 'remote.origin.url', 'ext::sh -c evil'],
      ['local', 'url.ext::sh -c evil.insteadof', 'https://example.com/']
    ]);

    expect(findUnsafeGitConfig(output).map((finding) => finding.key)).toEqual([
      'core.sshcommand',
      'core.gitproxy',
      'core.askpass',
      'credential.helper',
      'credential.https://example.com.helper',
      'remote.origin.vcs',
      'remote.origin.url',
      'url.ext::sh -c evil.insteadof'
    ]);
  });

  it('ignores the same settings outside the repository and ordinary repository settings', () => {
    const output = configOutput([
      ['system', 'core.sshcommand', 'ssh -i key'],
      ['global', 'credential.helper', '!trusted'],
      ['local', 'credential.helper', 'manager'],
      ['local', 'credential.helper', ''],
      ['local', 'credential.helper', 'store --file=/tmp/credentials'],
      ['local', 'remote.origin.url', 'git@github.com:owner/repo.git'],
      ['local', 'remote.origin.url', 'https://example.com/repo.git'],
      ['local', 'core.sshcommand', ''],
      ['command', 'core.fsmonitor', 'false']
    ]);

    expect(findUnsafeGitConfig(output)).toEqual([]);
  });

  it('reads the configuration with scopes and throws before anything is fetched', async () => {
    const runGit = vi.fn().mockResolvedValue({
      stdout: configOutput([['local', 'core.sshCommand', 'calc.exe']])
    });

    await expect(assertRepositoryConfigSafe(runGit, 'git', 'C:\\repo')).rejects.toThrow(
      UnsafeRepositoryConfigError
    );
    expect(runGit).toHaveBeenCalledWith('git', [
      '-C',
      'C:\\repo',
      'config',
      '--list',
      '--show-scope',
      '-z'
    ]);
  });

  it('allows a repository without program-running settings', async () => {
    const runGit = vi.fn().mockResolvedValue({
      stdout: configOutput([['local', 'core.bare', 'false']])
    });

    await expect(assertRepositoryConfigSafe(runGit, 'git', 'C:\\repo')).resolves.toBeUndefined();
  });
});
