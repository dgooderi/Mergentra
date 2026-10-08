// Measures how long Mergentra takes to draw a fully visible graph at increasing sizes.
/* global document, requestAnimationFrame */
// Usage: node scripts/measure-render.cjs [commitCount ...]   (defaults to 10000 50000 100000)
const { _electron: electron } = require('@playwright/test');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AUTHOR = 'Mergentra Measure <measure@example.invalid>';
const SECONDS_BETWEEN_COMMITS = 600;

function createHistory(repositoryPath, commitCount, { tagEvery, branchCount }) {
  const now = Math.floor(Date.now() / 1000);
  const first = now - commitCount * SECONDS_BETWEEN_COMMITS;
  const lines = [];
  for (let index = 0; index < commitCount; index += 1) {
    const mark = index + 1;
    const stamp = first + index * SECONDS_BETWEEN_COMMITS;
    const message = `Commit ${mark}`;
    lines.push(
      `commit refs/heads/main\nmark :${mark}\nauthor ${AUTHOR} ${stamp} +0000\ncommitter ${AUTHOR} ${stamp} +0000\ndata ${Buffer.byteLength(message)}\n${message}\n`,
      index === 0 ? '\n' : `from :${mark - 1}\n\n`
    );
    if (tagEvery && mark % tagEvery === 0) {
      lines.push(`reset refs/tags/t${mark}\nfrom :${mark}\n\n`);
    }
  }
  for (let index = 1; index < branchCount; index += 1) {
    const mark = Math.floor((index * (commitCount - 1)) / branchCount) + 1;
    lines.push(`reset refs/heads/b${index}\nfrom :${mark}\n\n`);
  }
  execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', '--quiet'], {
    cwd: repositoryPath
  });
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['fast-import', '--quiet'], {
      cwd: repositoryPath,
      stdio: ['pipe', 'ignore', 'inherit']
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`fast-import ${code}`))
    );
    child.stdin.end(lines.join(''));
  });
}

async function measure(commitCount, shape) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-measure-'));
  const repositoryPath = path.join(root, 'repo');
  fs.mkdirSync(repositoryPath);
  let app;
  try {
    await createHistory(repositoryPath, commitCount, shape);
    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: {
        ...process.env,
        MERGENTRA_USER_DATA_DIR: path.join(root, 'user-data'),
        MERGENTRA_LARGE_REPOSITORY_COMMITS: '100000000'
      }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    const openStarted = Date.now();
    await window.getByRole('button', { name: 'Open repository' }).click();
    await window.getByRole('heading', { name: 'repo', exact: true }).waitFor({ timeout: 600_000 });
    await window.waitForFunction(
      () => document.getElementById('repository-progress').textContent === '',
      null,
      {
        timeout: 600_000
      }
    );
    const openMs = Date.now() - openStarted;

    const allMs = await window.evaluate(async () => {
      const select = document.getElementById('time-range');
      const started = performance.now();
      select.value = 'all';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return performance.now() - started;
    });
    const stats = await window.evaluate(() => ({
      svgElements: document.querySelectorAll('#commit-graph *').length,
      commitNodes: document.querySelectorAll('[data-testid="commit-node"]').length,
      summaryPills: document.querySelectorAll('[data-testid="compacted-commit-count"]').length,
      heapMb: Math.round(performance.memory.usedJSHeapSize / 1e6)
    }));
    return { commitCount, ...shape, openMs, allMs: Math.round(allMs), ...stats };
  } finally {
    if (app) await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

(async () => {
  const sizes = process.argv.slice(2).map(Number).filter(Boolean);
  for (const size of sizes.length ? sizes : [10_000, 50_000, 100_000]) {
    for (const shape of [
      { tagEvery: 0, branchCount: 100 },
      { tagEvery: 20, branchCount: 100 }
    ]) {
      console.log(JSON.stringify(await measure(size, shape)));
    }
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
