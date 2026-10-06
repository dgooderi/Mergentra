// Settings in these scopes come from the opened repository, so they are untrusted.
const REPOSITORY_SCOPES = new Set(['local', 'worktree']);

const COMMAND_SETTINGS = new Set(['core.sshcommand', 'core.askpass', 'core.gitproxy']);

class UnsafeRepositoryConfigError extends Error {
  constructor(findings) {
    const names = findings.map((finding) => finding.key).join(', ');
    super(
      `Fetch blocked: this repository's Git configuration can run programs (${names}). ` +
        'Remove these settings from the repository configuration, then try again.'
    );
    this.name = 'UnsafeRepositoryConfigError';
    this.findings = findings;
  }
}

function parseConfigList(output) {
  const parts = output.split('\0');
  const entries = [];
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const separator = parts[index + 1].indexOf('\n');
    const key = separator === -1 ? parts[index + 1] : parts[index + 1].slice(0, separator);
    const value = separator === -1 ? '' : parts[index + 1].slice(separator + 1);
    entries.push({ scope: parts[index], key: key.toLowerCase(), value });
  }
  return entries;
}

function isUnsafeCredentialHelper(value) {
  const helper = value.trim();
  if (helper === '') {
    return false;
  }
  // "!cmd" runs a shell command and a path runs an arbitrary program; plain names resolve
  // to git-credential-<name> from Git's own install.
  const program = helper.split(/\s+/)[0];
  return helper.startsWith('!') || /[\\/]|^[a-z]:/i.test(program);
}

function isHelperUrl(url) {
  return /^[a-z0-9+.-]+::/i.test(url.trim());
}

function isUnsafeSetting({ key, value }) {
  if (COMMAND_SETTINGS.has(key)) {
    return value.trim() !== '';
  }
  if (/^credential(\..+)?\.helper$/.test(key)) {
    return isUnsafeCredentialHelper(value);
  }
  if (/^remote\..+\.vcs$/.test(key)) {
    return value.trim() !== '';
  }
  if (/^remote\..+\.url$/.test(key)) {
    // "<helper>::<address>" URLs, notably ext::, launch a program.
    return isHelperUrl(value);
  }
  const rewrite = /^url\.(.+)\.(insteadof|pushinsteadof)$/.exec(key);
  // The replacement address is the part of the key; the value is the prefix being replaced.
  return rewrite !== null && isHelperUrl(rewrite[1]);
}

function findUnsafeGitConfig(configOutput) {
  return parseConfigList(configOutput)
    .filter((entry) => REPOSITORY_SCOPES.has(entry.scope) && isUnsafeSetting(entry))
    .map(({ scope, key, value }) => ({ scope, key, value }));
}

async function assertRepositoryConfigSafe(runGit, gitPath, repositoryPath) {
  const { stdout } = await runGit(gitPath, [
    '-C',
    repositoryPath,
    'config',
    '--list',
    '--show-scope',
    '-z'
  ]);
  const findings = findUnsafeGitConfig(stdout);
  if (findings.length > 0) {
    throw new UnsafeRepositoryConfigError(findings);
  }
}

module.exports = { UnsafeRepositoryConfigError, assertRepositoryConfigSafe, findUnsafeGitConfig };
