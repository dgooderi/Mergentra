const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const HTTPS_URL = /^https:\/\/[^/\s]+/i;
const SSH_URL = /^ssh:\/\/[^/\s]+/i;
// user@host:path, the scp-like form Git accepts for SSH.
const SCP_LIKE_URL = /^[A-Za-z0-9._~-]+@[A-Za-z0-9.-]+:[^\s]+$/;

function validateCloneUrl(input, { allowLocal = false } = {}) {
  const url = typeof input === 'string' ? input.trim() : '';
  if (url === '') {
    return { valid: false, message: 'Enter a repository URL.' };
  }
  if (url.startsWith('-')) {
    return {
      valid: false,
      message: 'The URL cannot start with "-" because it looks like an option.'
    };
  }
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(url)) {
    return { valid: false, message: 'The URL cannot contain spaces or control characters.' };
  }
  if (allowLocal && !/^[a-z][a-z0-9+.-]*::/i.test(url)) {
    return { valid: true, url };
  }
  const authority = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^[^@/]*@/, '');
  if (HTTPS_URL.test(url) || SSH_URL.test(url)) {
    if (authority.startsWith('-')) {
      return {
        valid: false,
        message: 'The host cannot start with "-" because it looks like an option.'
      };
    }
    return { valid: true, url };
  }
  if (/^https?:\/\/$/i.test(url) || /^ssh:\/\/$/i.test(url)) {
    return { valid: false, message: 'The URL needs a host name.' };
  }
  if (SCP_LIKE_URL.test(url) && !/^[A-Za-z]:[\\/]/.test(url)) {
    return { valid: true, url };
  }
  return { valid: false, message: 'Only HTTPS or SSH repository URLs can be cloned.' };
}

function buildCloneArguments({ url, destination, historyOnly = false, allowLocal = false }) {
  return [
    '-c',
    'protocol.allow=never',
    '-c',
    'protocol.https.allow=always',
    '-c',
    'protocol.ssh.allow=always',
    ...(allowLocal ? ['-c', 'protocol.file.allow=always'] : []),
    'clone',
    '--progress',
    ...(historyOnly ? ['--filter=blob:none'] : []),
    '--',
    url,
    destination
  ];
}

function repositoryNameFromUrl(url) {
  const withoutScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  const lastSegment = withoutScheme.replace(/\/+$/, '').split(/[/:]/).filter(Boolean).pop();
  const name = (lastSegment || '').replace(/\.git$/i, '');
  return /^[\w.-]+$/.test(name) ? name : 'repository';
}

function isDirectory(directory, fileSystem) {
  try {
    return fileSystem.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

function checkDestination(destination, fileSystem = fs) {
  if (typeof destination !== 'string' || destination.trim() === '') {
    return { valid: false, message: 'Choose a destination folder.' };
  }
  const resolved = path.resolve(destination.trim());
  let existing;
  try {
    existing = fileSystem.statSync(resolved);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      return { valid: false, message: `The destination could not be accessed: ${error.message}` };
    }
    if (!isDirectory(path.dirname(resolved), fileSystem)) {
      return { valid: false, message: 'The destination\u2019s parent folder does not exist.' };
    }
    return { valid: true, path: resolved, existed: false };
  }
  if (!existing.isDirectory()) {
    return { valid: false, message: 'The destination is a file, not a folder.' };
  }
  if (fileSystem.readdirSync(resolved).length > 0) {
    return {
      valid: false,
      message: 'The destination folder is not empty. Choose an empty or new folder.'
    };
  }
  return { valid: true, path: resolved, existed: true };
}

function removeClonedFolder(destination, existed, fileSystem = fs) {
  try {
    if (existed) {
      for (const entry of fileSystem.readdirSync(destination)) {
        fileSystem.rmSync(path.join(destination, entry), { recursive: true, force: true });
      }
    } else {
      fileSystem.rmSync(destination, { recursive: true, force: true });
    }
  } catch {
    // Best effort: the diagnostics already tell the user the clone did not finish.
  }
}

// Runs git clone with no timeout (clones take minutes). Resolves with { cancelled, stderr } and
// rejects with an error carrying stderr when Git fails. Progress lines are passed to onProgress.
function runClone({
  gitPath,
  url,
  destination,
  existed,
  historyOnly,
  allowLocal,
  onProgress = () => {},
  spawnProcess = spawn,
  fileSystem = fs,
  getEnvironment = () => process.env
}) {
  let child;
  let cancelled = false;
  const promise = new Promise((resolve, reject) => {
    child = spawnProcess(
      gitPath,
      buildCloneArguments({ url, destination, historyOnly, allowLocal }),
      {
        windowsHide: true,
        env: { ...getEnvironment(), GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }
      }
    );
    let stderr = '';
    child.stdout?.on('data', () => {});
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-64 * 1024);
      const lines = chunk.split(/[\r\n]+/).filter((line) => line.trim() !== '');
      if (lines.length > 0) {
        onProgress(lines[lines.length - 1]);
      }
    });
    child.on('error', (error) => {
      removeClonedFolder(destination, existed, fileSystem);
      reject(error);
    });
    child.on('close', (code, signal) => {
      if (cancelled) {
        removeClonedFolder(destination, existed, fileSystem);
        resolve({ cancelled: true, stderr });
      } else if (code !== 0) {
        removeClonedFolder(destination, existed, fileSystem);
        const error = new Error(stderr.trim() || `Git exited with ${signal || `code ${code}`}.`);
        error.stderr = stderr;
        reject(error);
      } else {
        resolve({ cancelled: false, stderr });
      }
    });
  });
  return {
    promise,
    cancel() {
      cancelled = true;
      child?.kill();
    }
  };
}

module.exports = {
  validateCloneUrl,
  buildCloneArguments,
  repositoryNameFromUrl,
  checkDestination,
  runClone
};
