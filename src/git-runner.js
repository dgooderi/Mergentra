const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const OUTPUT_LIMIT = 32 * 1024 * 1024;

function createGitRunner({
  execFileAsync = promisify(execFile),
  spawnProcess = spawn,
  getEnvironment = () => process.env
} = {}) {
  async function runGit(gitPath, args, { timeout = 30_000, maxBuffer = OUTPUT_LIMIT } = {}) {
    return execFileAsync(gitPath, args, {
      windowsHide: true,
      timeout,
      maxBuffer,
      env: {
        ...getEnvironment(),
        GIT_NO_LAZY_FETCH: '1',
        GIT_TERMINAL_PROMPT: '0'
      }
    });
  }

  async function runGitWithInput(gitPath, args, input) {
    return new Promise((resolve, reject) => {
      const child = spawnProcess(gitPath, args, {
        windowsHide: true,
        env: {
          ...getEnvironment(),
          GIT_NO_LAZY_FETCH: '1',
          GIT_TERMINAL_PROMPT: '0'
        }
      });
      let stdout = '';
      let stderr = '';
      let outputTooLarge = false;
      let timedOut = false;
      let inputError = null;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, 30_000);

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        if (stdout.length + chunk.length > OUTPUT_LIMIT) {
          outputTooLarge = true;
          child.kill();
          return;
        }
        stdout += chunk;
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        if (stderr.length + chunk.length <= OUTPUT_LIMIT) {
          stderr += chunk;
        }
      });
      child.stdin.on('error', (error) => {
        inputError = error;
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error(`Git command timed out: ${args.join(' ')}`));
        } else if (outputTooLarge) {
          reject(new Error(`Git command output exceeded ${OUTPUT_LIMIT} bytes: ${args.join(' ')}`));
        } else if (inputError) {
          reject(new Error(`Git command input could not be sent: ${inputError.message}`));
        } else if (code !== 0) {
          const error = new Error(stderr.trim() || `Git exited with ${signal || `code ${code}`}.`);
          error.code = code;
          error.stderr = stderr;
          error.stdout = stdout;
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
      child.stdin.end(input, 'utf8');
    });
  }

  return { runGit, runGitWithInput };
}

module.exports = { createGitRunner };
