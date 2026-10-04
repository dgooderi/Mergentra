const { _electron: electron, expect, test } = require('@playwright/test');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('a developer can open a local Git repository', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const invalidRepositoryPath = path.join(testDirectory, 'not-a-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);
  fs.mkdirSync(invalidRepositoryPath);

  const runGit = (args) => execFileSync('git', args, {
    cwd: repositoryPath,
    stdio: 'ignore'
  });

  runGit(['-c', 'init.defaultBranch=main', 'init']);
  runGit(['config', 'user.name', 'GitScope E2E']);
  runGit(['config', 'user.email', 'gitscope-e2e@example.invalid']);
  fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Test repository');
  runGit(['add', 'README.txt']);
  runGit(['commit', '-m', 'Initial commit']);

  let app;

  try {
    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await expect(window.getByRole('heading', { name: 'Open a repository' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Check for updates' })).toBeVisible();
    await window.getByLabel('Repository folder').fill(invalidRepositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.getByRole('alert')).toContainText('not a Git repository');
    await expect(window.locator('#repository-progress')).toBeEmpty();
    await expect(window.getByRole('button', { name: 'Open repository' })).toBeEnabled();

    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await expect(window.getByRole('heading', { name: 'sample-repository' })).toBeVisible();
    await expect(window.locator('#repository-path-value')).toHaveText(repositoryPath);
    await expect(window.locator('#branch-name')).toHaveText('main');
    await expect(window.getByRole('button', { name: 'Check for updates' })).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('a manual update check links to a newer GitHub release without downloading it', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-update-e2e-'));
  const userDataPath = path.join(testDirectory, 'user-data');
  let app;
  let releaseChecks = 0;

  try {
    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.route('https://api.github.com/repos/dgooderi/GitScope/releases/latest', async (route) => {
      releaseChecks += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tag_name: 'v0.2.0',
          html_url: 'https://github.com/dgooderi/GitScope/releases/tag/v0.2.0',
          draft: false,
          prerelease: false
        })
      });
    });

    await window.waitForTimeout(100);
    expect(releaseChecks).toBe(0);
    await window.getByRole('button', { name: 'Check for updates' }).click();
    await expect(window.locator('#update-status')).toContainText('GitScope 0.2.0 is available.');
    const releaseLink = window.getByRole('link', { name: 'View GitScope 0.2.0 on GitHub Releases' });
    await expect(releaseLink).toHaveAttribute(
      'href',
      'https://github.com/dgooderi/GitScope/releases/tag/v0.2.0'
    );
    await expect(releaseLink).toHaveAttribute('target', '_blank');
    await expect(window.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
    expect(releaseChecks).toBe(1);
    expect(window.url()).toContain('index.html');
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('a manual update check reports when the installed version is current', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-update-e2e-'));
  let app;

  try {
    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: path.join(testDirectory, 'user-data') }
    });
    const window = await app.firstWindow();
    await window.route('https://api.github.com/repos/dgooderi/GitScope/releases/latest', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tag_name: 'v0.1.0',
          html_url: 'https://github.com/dgooderi/GitScope/releases/tag/v0.1.0',
          draft: false,
          prerelease: false
        })
      });
    });
    await window.getByRole('button', { name: 'Check for updates' }).click();
    await expect(window.locator('#update-status')).toContainText('GitScope is up to date (0.1.0).');
    await expect(window.locator('#update-release-link')).toBeHidden();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('a failed update check explains the failure and can be retried', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-update-e2e-'));
  let app;

  try {
    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: path.join(testDirectory, 'user-data') }
    });
    const window = await app.firstWindow();
    await window.route('https://api.github.com/repos/dgooderi/GitScope/releases/latest', async (route) => {
      await route.fulfill({ status: 503, body: 'Unavailable' });
    });
    await window.getByRole('button', { name: 'Check for updates' }).click();
    await expect(window.locator('#update-status')).toContainText(
      'Could not check for updates: GitHub release check failed with HTTP 503.'
    );
    await expect(window.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('a developer can configure Git when it is not on PATH', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (args) => execFileSync('git', args, {
    cwd: repositoryPath,
    stdio: 'ignore'
  });
  runGit(['-c', 'init.defaultBranch=main', 'init']);
  runGit(['config', 'user.name', 'GitScope E2E']);
  runGit(['config', 'user.email', 'gitscope-e2e@example.invalid']);
  fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Test repository');
  runGit(['add', 'README.txt']);
  runGit(['commit', '-m', 'Initial commit']);

  const gitPath = execFileSync('where.exe', ['git'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .find((candidate) => candidate.trim().toLowerCase().endsWith('.exe'))
    .trim();
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const launchOptions = {
    args: [path.resolve(__dirname, '..')],
    env: {
      ...process.env,
      GITSCOPE_USER_DATA_DIR: userDataPath,
      PATH: `${path.join(systemRoot, 'System32')};${systemRoot}`
    }
  };
  let app;

  try {
    app = await electron.launch(launchOptions);
    let window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.getByRole('alert')).toContainText('Git was not found on PATH');

    await window.getByLabel('Git executable path').fill(gitPath);
    await window.getByRole('button', { name: 'Save Git path' }).click();
    await expect(window.getByText('Git path saved.')).toBeVisible();
    await app.close();

    app = await electron.launch(launchOptions);
    window = await app.firstWindow();
    await expect(window.getByLabel('Git executable path')).toHaveValue(gitPath);
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.getByRole('heading', { name: 'sample-repository' })).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('a recently opened repository can be reopened after restarting GitScope', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (args) => execFileSync('git', args, {
    cwd: repositoryPath,
    stdio: 'ignore'
  });
  runGit(['-c', 'init.defaultBranch=main', 'init']);
  runGit(['config', 'user.name', 'GitScope E2E']);
  runGit(['config', 'user.email', 'gitscope-e2e@example.invalid']);
  fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Test repository');
  runGit(['add', 'README.txt']);
  runGit(['commit', '-m', 'Initial commit']);

  const launchOptions = {
    args: [path.resolve(__dirname, '..')],
    env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
  };
  let app;

  try {
    app = await electron.launch(launchOptions);
    let window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.getByRole('heading', { name: 'sample-repository' })).toBeVisible();
    await app.close();

    app = await electron.launch(launchOptions);
    window = await app.firstWindow();
    await expect(window.getByRole('button', { name: /sample-repository/ })).toBeVisible();
    await window.getByRole('button', { name: /sample-repository/ }).click();
    await expect(window.getByRole('heading', { name: 'sample-repository' })).toBeVisible();
    await expect(window.locator('#branch-name')).toHaveText('main');
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('dark mode is the default and light mode can be selected', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  let app;

  try {
    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    const darkModeButton = window.getByRole('button', { name: 'Dark mode' });
    const lightModeButton = window.getByRole('button', { name: 'Light mode' });
    await expect(darkModeButton).toHaveAttribute('aria-pressed', 'true');
    await expect(lightModeButton).toHaveAttribute('aria-pressed', 'false');

    await lightModeButton.click();

    await expect(lightModeButton).toHaveAttribute('aria-pressed', 'true');
    await expect(darkModeButton).toHaveAttribute('aria-pressed', 'false');
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});

test('linear reference histories show their shared commit once and preserve parent order', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const remotePath = path.join(testDirectory, 'origin.git');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (cwd, args) => execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  let app;

  try {
    runGit(testDirectory, ['init', '--bare', remotePath]);
    runGit(repositoryPath, ['-c', 'init.defaultBranch=main', 'init']);
    runGit(repositoryPath, ['config', 'user.name', 'GitScope E2E']);
    runGit(repositoryPath, ['config', 'user.email', 'gitscope-e2e@example.invalid']);
    fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Base commit');
    runGit(repositoryPath, ['add', 'README.txt']);
    runGit(repositoryPath, ['commit', '-m', 'Base commit']);
    const baseCommit = runGit(repositoryPath, ['rev-parse', 'HEAD']);
    runGit(repositoryPath, ['branch', 'feature', baseCommit]);

    fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Tip commit');
    runGit(repositoryPath, ['commit', '-am', 'Tip commit']);
    const tipCommit = runGit(repositoryPath, ['rev-parse', 'HEAD']);
    runGit(repositoryPath, ['checkout', 'feature']);
    fs.writeFileSync(path.join(repositoryPath, 'feature.txt'), 'Feature commit');
    runGit(repositoryPath, ['add', 'feature.txt']);
    runGit(repositoryPath, ['commit', '-m', 'Feature commit']);
    const featureCommit = runGit(repositoryPath, ['rev-parse', 'HEAD']);
    runGit(repositoryPath, ['checkout', 'main']);
    runGit(repositoryPath, ['remote', 'add', 'origin', remotePath]);
    runGit(repositoryPath, ['push', 'origin', 'main', 'feature']);
    runGit(repositoryPath, ['fetch', 'origin']);

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await expect(window.getByRole('heading', { name: 'Commit graph' })).toBeVisible();
    const commits = window.getByTestId('commit-node');
    await expect(commits).toHaveCount(3);
    await expect(commits.nth(0)).toHaveAttribute('data-commit-hash', baseCommit);
    const renderedHashes = [];
    for (let index = 0; index < await commits.count(); index += 1) {
      renderedHashes.push(await commits.nth(index).getAttribute('data-commit-hash'));
    }
    expect(new Set(renderedHashes).size).toBe(3);
    expect(renderedHashes).toContain(tipCommit);
    expect(renderedHashes).toContain(featureCommit);
    await expect(window.getByTestId('commit-graph')).toHaveAttribute('data-order', 'parent-before-child');
    const edges = window.getByTestId('commit-edge');
    await expect(edges).toHaveCount(2);
    const renderedIndex = new Map(renderedHashes.map((hash, index) => [hash, index]));
    for (let index = 0; index < await edges.count(); index += 1) {
      const edge = edges.nth(index);
      const parentIndex = renderedIndex.get(await edge.getAttribute('data-parent-hash'));
      const childIndex = renderedIndex.get(await edge.getAttribute('data-child-hash'));
      expect(parentIndex).toBeLessThan(childIndex);
    }

    const lanes = window.getByTestId('reference-lane');
    await expect(lanes).toHaveCount(4);
    await expect(lanes.nth(0)).toHaveAttribute('data-ref-name', 'main');
    await expect(lanes.nth(0)).toHaveAttribute('data-remote', 'false');
    await expect(lanes.nth(1)).toHaveAttribute('data-ref-name', 'origin/main');
    await expect(lanes.nth(1)).toHaveAttribute('data-remote', 'true');
    await expect(lanes.nth(2)).toHaveAttribute('data-ref-name', 'feature');
    await expect(lanes.nth(3)).toHaveAttribute('data-ref-name', 'origin/feature');
    await expect(lanes.nth(0)).toHaveAttribute('data-color', await lanes.nth(1).getAttribute('data-color'));
    await expect(lanes.nth(2)).toHaveAttribute('data-color', await lanes.nth(3).getAttribute('data-color'));
    await expect(lanes.nth(1).locator('[data-testid="reference-lane-style"]'))
      .toHaveAttribute('stroke-dasharray', '6 4');
    await expect(lanes.nth(3).locator('[data-testid="reference-lane-style"]'))
      .toHaveAttribute('stroke-dasharray', '6 4');
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('merge commits and grouped tags are annotated in the commit graph', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (args) => execFileSync('git', args, {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  let app;

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init']);
    runGit(['config', 'user.name', 'GitScope E2E']);
    runGit(['config', 'user.email', 'gitscope-e2e@example.invalid']);
    fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Base commit');
    runGit(['add', 'README.txt']);
    runGit(['commit', '-m', 'Base commit']);
    const baseCommit = runGit(['rev-parse', 'HEAD']);

    runGit(['checkout', '-b', 'feature']);
    fs.writeFileSync(path.join(repositoryPath, 'feature.txt'), 'Feature commit');
    runGit(['add', 'feature.txt']);
    runGit(['commit', '-m', 'Feature commit']);
    const featureCommit = runGit(['rev-parse', 'HEAD']);

    runGit(['checkout', 'main']);
    fs.writeFileSync(path.join(repositoryPath, 'main.txt'), 'Main commit');
    runGit(['add', 'main.txt']);
    runGit(['commit', '-m', 'Main commit']);
    const mainCommit = runGit(['rev-parse', 'HEAD']);
    runGit(['merge', '--no-ff', 'feature', '-m', 'Merge feature']);
    const mergeCommit = runGit(['rev-parse', 'HEAD']);
    runGit(['tag', 'v1.0.0', mergeCommit]);
    runGit(['tag', 'release-candidate', mergeCommit]);

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const mergeNode = window.locator(`[data-testid="commit-node"][data-commit-hash="${mergeCommit}"]`);
    await expect(mergeNode).toHaveAttribute('data-is-merge', 'true');
    await expect(mergeNode.locator('[data-testid="merge-node-shape"]')).toHaveAttribute('data-shape', 'diamond');
    const mergeEdges = window.locator(`[data-testid="commit-edge"][data-child-hash="${mergeCommit}"]`);
    await expect(mergeEdges).toHaveCount(2);
    const mergeParents = [];
    for (let index = 0; index < await mergeEdges.count(); index += 1) {
      await expect(mergeEdges.nth(index)).toHaveAttribute('marker-end', 'url(#commit-arrowhead)');
      mergeParents.push(await mergeEdges.nth(index).getAttribute('data-parent-hash'));
    }
    expect(new Set(mergeParents)).toEqual(new Set([featureCommit, mainCommit]));

    const tags = mergeNode.getByTestId('commit-tag');
    await expect(tags).toHaveCount(2);
    await expect(tags.nth(0)).toHaveAttribute('data-tag-name', 'release-candidate');
    await expect(tags.nth(1)).toHaveAttribute('data-tag-name', 'v1.0.0');
    await expect(window.getByTestId('commit-node')).toHaveCount(4);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${baseCommit}"]`)).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('divergent branches show inferred markers at their first unique commits', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (args) => execFileSync('git', args, {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  let app;

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init']);
    runGit(['config', 'user.name', 'GitScope E2E']);
    runGit(['config', 'user.email', 'gitscope-e2e@example.invalid']);
    fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Shared ancestor');
    runGit(['add', 'README.txt']);
    runGit(['commit', '-m', 'Shared ancestor']);
    const sharedAncestor = runGit(['rev-parse', 'HEAD']);

    runGit(['checkout', '-b', 'feature']);
    fs.writeFileSync(path.join(repositoryPath, 'feature.txt'), 'First feature commit');
    runGit(['add', 'feature.txt']);
    runGit(['commit', '-m', 'First feature commit']);
    const featureCommit = runGit(['rev-parse', 'HEAD']);

    runGit(['checkout', 'main']);
    fs.writeFileSync(path.join(repositoryPath, 'main.txt'), 'First main commit');
    runGit(['add', 'main.txt']);
    runGit(['commit', '-m', 'First main commit']);
    const mainCommit = runGit(['rev-parse', 'HEAD']);

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const marker = window.getByTestId('divergence-marker');
    await expect(marker).toHaveCount(1);
    await expect(marker).toHaveAttribute('data-inferred', 'true');
    await expect(marker).toHaveAttribute('data-branch-name', 'feature');
    await expect(marker).toHaveAttribute('data-ancestor-hash', sharedAncestor);
    await expect(marker).toHaveAttribute('data-commit-hash', featureCommit);
    await expect(marker).toContainText('Branch diverges: feature');
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${mainCommit}"]`)).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('pointer and keyboard commit selection show the same Review dock details', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (args) => execFileSync('git', args, {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  let app;

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init']);
    runGit(['config', 'user.name', 'Fixture Author']);
    runGit(['config', 'user.email', 'fixture-author@example.invalid']);
    fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Inspectable commit');
    runGit(['add', 'README.txt']);
    execFileSync('git', ['commit', '-m', 'Inspectable commit subject'], {
      cwd: repositoryPath,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2026-01-02T03:04:05+00:00',
        GIT_COMMITTER_DATE: '2026-01-02T03:04:05+00:00'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const commitHash = runGit(['rev-parse', 'HEAD']);
    const authorDate = runGit(['show', '-s', '--format=%aI', commitHash]);
    const author = runGit(['show', '-s', '--format=%an <%ae>', commitHash]);
    runGit(['branch', 'review-branch', commitHash]);
    runGit(['tag', 'review-tag', commitHash]);
    fs.writeFileSync(path.join(repositoryPath, 'next.txt'), 'Follow-up commit');
    runGit(['add', 'next.txt']);
    execFileSync('git', ['commit', '-m', 'Follow-up commit'], {
      cwd: repositoryPath,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2026-01-03T03:04:05+00:00',
        GIT_COMMITTER_DATE: '2026-01-03T03:04:05+00:00'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const childHash = runGit(['rev-parse', 'HEAD']);
    const childAuthorDate = runGit(['show', '-s', '--format=%aI', childHash]);

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const commitNode = window.locator(`[data-testid="commit-node"][data-commit-hash="${commitHash}"]`);
    const childNode = window.locator(`[data-testid="commit-node"][data-commit-hash="${childHash}"]`);
    await childNode.focus();
    await window.keyboard.press('Enter');
    await expect(childNode).toHaveAttribute('aria-pressed', 'true');
    const dock = window.getByTestId('review-dock');
    await expect(dock).toBeVisible();
    await expect(dock.getByTestId('selected-commit-message')).toHaveText('Follow-up commit');
    await expect(dock.getByTestId('selected-commit-author')).toHaveText(author);
    await expect(dock.getByTestId('selected-commit-author-date')).toHaveText(childAuthorDate);
    await expect(dock.getByTestId('selected-commit-hash')).toHaveText(childHash);
    await expect(dock.getByTestId('selected-commit-parents')).toHaveText(commitHash);
    await expect(dock.getByTestId('selected-commit-references').getByText('main', { exact: true })).toBeVisible();

    await commitNode.click({ timeout: 5_000 });
    await expect(commitNode).toHaveAttribute('aria-pressed', 'true');
    await expect(childNode).toHaveAttribute('aria-pressed', 'false');
    await expect(dock.getByTestId('selected-commit-message')).toHaveText('Inspectable commit subject');
    await expect(dock.getByTestId('selected-commit-author')).toHaveText(author);
    await expect(dock.getByTestId('selected-commit-author-date')).toHaveText(authorDate);
    await expect(dock.getByTestId('selected-commit-hash')).toHaveText(commitHash);
    await expect(dock.getByTestId('selected-commit-parents')).toHaveText('None (root commit)');
    await expect(dock.getByTestId('selected-commit-references').getByText('review-branch', { exact: true })).toBeVisible();
    await expect(dock.getByTestId('selected-commit-references').getByText('review-tag', { exact: true })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Commit graph' })).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('reference filters retain shared history reachable from any enabled reference', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const remotePath = path.join(testDirectory, 'origin.git');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (cwd, args) => execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  let app;

  try {
    runGit(testDirectory, ['init', '--bare', remotePath]);
    runGit(repositoryPath, ['-c', 'init.defaultBranch=main', 'init']);
    runGit(repositoryPath, ['config', 'user.name', 'GitScope E2E']);
    runGit(repositoryPath, ['config', 'user.email', 'gitscope-e2e@example.invalid']);
    fs.writeFileSync(path.join(repositoryPath, 'shared.txt'), 'Shared ancestor');
    runGit(repositoryPath, ['add', 'shared.txt']);
    runGit(repositoryPath, ['commit', '-m', 'Shared ancestor']);
    const sharedCommit = runGit(repositoryPath, ['rev-parse', 'HEAD']);
    runGit(repositoryPath, ['branch', 'feature', sharedCommit]);

    fs.writeFileSync(path.join(repositoryPath, 'main.txt'), 'Main-only commit');
    runGit(repositoryPath, ['add', 'main.txt']);
    runGit(repositoryPath, ['commit', '-m', 'Main-only commit']);
    const mainCommit = runGit(repositoryPath, ['rev-parse', 'HEAD']);

    runGit(repositoryPath, ['checkout', 'feature']);
    fs.writeFileSync(path.join(repositoryPath, 'feature.txt'), 'Feature-only commit');
    runGit(repositoryPath, ['add', 'feature.txt']);
    runGit(repositoryPath, ['commit', '-m', 'Feature-only commit']);
    const featureCommit = runGit(repositoryPath, ['rev-parse', 'HEAD']);

    runGit(repositoryPath, ['remote', 'add', 'origin', remotePath]);
    runGit(repositoryPath, ['push', 'origin', 'main', 'feature']);
    runGit(repositoryPath, ['fetch', 'origin']);

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const commitNode = (hash) => window.locator(`[data-testid="commit-node"][data-commit-hash="${hash}"]`);
    const graph = window.getByTestId('commit-graph');
    const localMain = window.getByRole('checkbox', { name: 'main', exact: true });
    const remoteMain = window.getByRole('checkbox', { name: 'origin/main', exact: true });
    const localFeature = window.getByRole('checkbox', { name: 'feature', exact: true });
    const remoteFeature = window.getByRole('checkbox', { name: 'origin/feature', exact: true });

    await expect(localMain).toBeChecked();
    await expect(remoteMain).toBeChecked();
    await expect(localFeature).toBeChecked();
    await expect(remoteFeature).toBeChecked();
    await expect(window.getByTestId('commit-node')).toHaveCount(3);
    await window.keyboard.press('Escape');
    await commitNode(sharedCommit).click();
    const reviewDock = window.getByTestId('review-dock');
    await expect(reviewDock.getByTestId('selected-commit-hash')).toHaveText(sharedCommit);

    await localMain.uncheck({ timeout: 5_000 });
    await expect(graph).toHaveAttribute('data-reference-count', '3');
    await expect(localMain).not.toBeChecked();
    await expect(commitNode(mainCommit)).toBeVisible();
    await expect(reviewDock).toBeVisible();

    await remoteMain.uncheck();
    await expect(graph).toHaveAttribute('data-reference-count', '2');
    await expect(commitNode(sharedCommit)).toBeVisible();
    await expect(commitNode(featureCommit)).toBeVisible();
    await expect(commitNode(mainCommit)).toHaveCount(0);
    await expect(reviewDock).toBeVisible();

    await localFeature.uncheck();
    await expect(graph).toHaveAttribute('data-reference-count', '1');
    await expect(commitNode(featureCommit)).toBeVisible();
    await expect(commitNode(sharedCommit)).toBeVisible();

    await remoteFeature.uncheck();
    await expect(graph).toHaveAttribute('data-reference-count', '0');
    await expect(window.getByTestId('commit-node')).toHaveCount(0);
    await expect(window.getByText('No references selected. Select a reference to show its history.')).toBeVisible();
    await expect(reviewDock).toBeHidden();

    await localMain.check();
    await expect(graph).toHaveAttribute('data-reference-count', '1');
    await expect(commitNode(sharedCommit)).toBeVisible();
    await expect(commitNode(mainCommit)).toBeVisible();
    await expect(commitNode(featureCommit)).toHaveCount(0);
    expect(runGit(repositoryPath, ['rev-parse', 'refs/heads/main'])).toBe(mainCommit);
    expect(runGit(repositoryPath, ['rev-parse', 'refs/heads/feature'])).toBe(featureCommit);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('time presets and custom local dates filter by committer timestamp', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  const frozenNow = new Date(2026, 4, 16, 12, 0, 0);
  fs.mkdirSync(repositoryPath);

  const commitAt = (message, committedAt) => {
    fs.writeFileSync(path.join(repositoryPath, `${message.replaceAll(' ', '-')}.txt`), message);
    execFileSync('git', ['add', '.'], { cwd: repositoryPath, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', message], {
      cwd: repositoryPath,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2000-01-01T00:00:00+00:00',
        GIT_COMMITTER_DATE: committedAt.toISOString()
      },
      stdio: 'ignore'
    });
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryPath,
      encoding: 'utf8'
    }).trim();
  };
  let app;

  try {
    execFileSync('git', ['-c', 'init.defaultBranch=main', 'init'], {
      cwd: repositoryPath,
      stdio: 'ignore'
    });
    execFileSync('git', ['config', 'user.name', 'GitScope E2E'], { cwd: repositoryPath });
    execFileSync('git', ['config', 'user.email', 'gitscope-e2e@example.invalid'], { cwd: repositoryPath });
    const oldestCommit = commitAt('Oldest commit', new Date(frozenNow.getTime() - 50 * 60 * 60 * 1000));
    const middleCommit = commitAt('Middle commit', new Date(frozenNow.getTime() - 30 * 60 * 60 * 1000));
    const recentCommit = commitAt('Recent commit', new Date(frozenNow.getTime() - 12 * 60 * 60 * 1000));
    const tipCommit = commitAt('Tip commit', new Date(frozenNow.getTime() - 3 * 60 * 60 * 1000));

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.clock.install({ time: frozenNow });
    await window.clock.pauseAt(frozenNow);
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const preset = window.getByLabel('Time range', { exact: true });
    await expect(preset.locator('option')).toHaveText([
      '1 day',
      '5 days',
      '1 week',
      '2 weeks',
      '1 month',
      '3 months',
      '6 months',
      '9 months',
      '1 year',
      'All history',
      'Custom'
    ]);

    await preset.selectOption('1d');
    await expect(window.getByTestId('commit-node')).toHaveCount(2);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${oldestCommit}"]`)).toHaveCount(0);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${middleCommit}"]`)).toHaveCount(0);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${recentCommit}"]`)).toBeVisible();
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${tipCommit}"]`)).toBeVisible();
    await expect(window.getByTestId('history-cut-marker')).toBeVisible();

    await preset.selectOption('custom');
    await window.getByLabel('Start date').fill('2026-05-15');
    await window.getByLabel('End date').fill('2026-05-15');
    await window.getByRole('button', { name: 'Apply date range' }).click();
    await expect(window.getByTestId('commit-node')).toHaveCount(1);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${middleCommit}"]`)).toBeVisible();
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${recentCommit}"]`)).toHaveCount(0);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${tipCommit}"]`)).toHaveCount(0);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('ordinary commits between important commits compact into an endpoint-exclusive count', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (args) => execFileSync('git', args, {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  const commitFile = (file, message) => {
    fs.writeFileSync(path.join(repositoryPath, file), message);
    runGit(['add', file]);
    runGit(['commit', '-m', message]);
    return runGit(['rev-parse', 'HEAD']);
  };
  let app;

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init']);
    runGit(['config', 'user.name', 'GitScope E2E']);
    runGit(['config', 'user.email', 'gitscope-e2e@example.invalid']);
    const taggedEndpoint = commitFile('anchor.txt', 'Tagged endpoint');
    runGit(['tag', 'v1.0.0', taggedEndpoint]);
    const hiddenCommits = [
      commitFile('one.txt', 'Ordinary commit one'),
      commitFile('two.txt', 'Ordinary commit two'),
      commitFile('three.txt', 'Ordinary commit three')
    ];
    const branchTip = commitFile('tip.txt', 'Branch tip endpoint');

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const commits = window.getByTestId('commit-node');
    await expect(commits).toHaveCount(2);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${taggedEndpoint}"]`)).toBeVisible();
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${branchTip}"]`)).toBeVisible();
    const summary = window.getByTestId('compacted-commit-count');
    await expect(summary).toHaveAttribute('data-count', '3');
    for (const hiddenCommit of hiddenCommits) {
      await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${hiddenCommit}"]`)).toHaveCount(0);
    }
    await expect(summary).toContainText('+3');
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('calendar-month presets start at the matching local calendar period', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  const frozenNow = new Date(2026, 4, 31, 12, 0, 0);
  fs.mkdirSync(repositoryPath);

  const commitAt = (message, committedAt) => {
    fs.writeFileSync(path.join(repositoryPath, `${message.replaceAll(' ', '-')}.txt`), message);
    execFileSync('git', ['add', '.'], { cwd: repositoryPath, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', message], {
      cwd: repositoryPath,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2000-01-01T00:00:00+00:00',
        GIT_COMMITTER_DATE: committedAt.toISOString()
      },
      stdio: 'ignore'
    });
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryPath,
      encoding: 'utf8'
    }).trim();
  };
  let app;

  try {
    execFileSync('git', ['-c', 'init.defaultBranch=main', 'init'], {
      cwd: repositoryPath,
      stdio: 'ignore'
    });
    execFileSync('git', ['config', 'user.name', 'GitScope E2E'], { cwd: repositoryPath });
    execFileSync('git', ['config', 'user.email', 'gitscope-e2e@example.invalid'], { cwd: repositoryPath });
    const calendarBoundary = commitAt('Calendar boundary', new Date(2026, 3, 30, 12, 0, 0));
    const branchTip = commitAt('Calendar-window tip', new Date(2026, 4, 31, 10, 0, 0));

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.clock.install({ time: frozenNow });
    await window.clock.pauseAt(frozenNow);
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    const preset = window.getByLabel('Time range', { exact: true });
    await preset.selectOption('1m');
    await expect(window.getByTestId('commit-node')).toHaveCount(2);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${calendarBoundary}"]`)).toBeVisible();

    await preset.selectOption('5d');
    await expect(window.getByTestId('commit-node')).toHaveCount(1);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${calendarBoundary}"]`)).toHaveCount(0);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${branchTip}"]`)).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('custom date ranges include their start and end dates without including the next date', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const commitAt = (message, committedAt) => {
    fs.writeFileSync(path.join(repositoryPath, `${message.replaceAll(' ', '-')}.txt`), message);
    execFileSync('git', ['add', '.'], { cwd: repositoryPath, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', message], {
      cwd: repositoryPath,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2000-01-01T00:00:00+00:00',
        GIT_COMMITTER_DATE: committedAt.toISOString()
      },
      stdio: 'ignore'
    });
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryPath,
      encoding: 'utf8'
    }).trim();
  };
  let app;

  try {
    execFileSync('git', ['-c', 'init.defaultBranch=main', 'init'], {
      cwd: repositoryPath,
      stdio: 'ignore'
    });
    execFileSync('git', ['config', 'user.name', 'GitScope E2E'], { cwd: repositoryPath });
    execFileSync('git', ['config', 'user.email', 'gitscope-e2e@example.invalid'], { cwd: repositoryPath });
    const beforeRange = commitAt('Before range', new Date(2026, 4, 14, 23, 59, 59));
    const startBoundary = commitAt('Start boundary', new Date(2026, 4, 15, 0, 0, 0));
    const endBoundary = commitAt('End boundary', new Date(2026, 4, 15, 23, 59, 59));
    const afterRange = commitAt('After range', new Date(2026, 4, 16, 0, 0, 0));

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await window.getByLabel('Time range', { exact: true }).selectOption('custom');
    await window.getByLabel('Start date').fill('2026-05-15');
    await window.getByLabel('End date').fill('2026-05-15');
    await window.getByRole('button', { name: 'Apply date range' }).click();

    await expect(window.getByTestId('commit-node')).toHaveCount(2);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${beforeRange}"]`)).toHaveCount(0);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${startBoundary}"]`)).toBeVisible();
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${endBoundary}"]`)).toBeVisible();
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${afterRange}"]`)).toHaveCount(0);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('history-edge compacted counts include only ordinary commits inside the selected range', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  const frozenNow = new Date(2026, 4, 16, 12, 0, 0);
  fs.mkdirSync(repositoryPath);

  const commitAt = (message, committedAt) => {
    fs.writeFileSync(path.join(repositoryPath, `${message.replaceAll(' ', '-')}.txt`), message);
    execFileSync('git', ['add', '.'], { cwd: repositoryPath, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', message], {
      cwd: repositoryPath,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2000-01-01T00:00:00+00:00',
        GIT_COMMITTER_DATE: committedAt.toISOString()
      },
      stdio: 'ignore'
    });
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryPath,
      encoding: 'utf8'
    }).trim();
  };
  let app;

  try {
    execFileSync('git', ['-c', 'init.defaultBranch=main', 'init'], {
      cwd: repositoryPath,
      stdio: 'ignore'
    });
    execFileSync('git', ['config', 'user.name', 'GitScope E2E'], { cwd: repositoryPath });
    execFileSync('git', ['config', 'user.email', 'gitscope-e2e@example.invalid'], { cwd: repositoryPath });
    const outsideCommit = commitAt('Outside range', new Date(frozenNow.getTime() - 30 * 60 * 60 * 1000));
    const taggedEndpoint = commitAt('In-range tagged endpoint', new Date(frozenNow.getTime() - 20 * 60 * 60 * 1000));
    execFileSync('git', ['tag', 'in-range-anchor', taggedEndpoint], {
      cwd: repositoryPath,
      stdio: 'ignore'
    });
    const firstHiddenCommit = commitAt('In-range ordinary one', new Date(frozenNow.getTime() - 12 * 60 * 60 * 1000));
    const secondHiddenCommit = commitAt('In-range ordinary two', new Date(frozenNow.getTime() - 8 * 60 * 60 * 1000));
    const branchTip = commitAt('In-range branch tip', new Date(frozenNow.getTime() - 2 * 60 * 60 * 1000));

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.clock.install({ time: frozenNow });
    await window.clock.pauseAt(frozenNow);
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await window.getByLabel('Time range', { exact: true }).selectOption('1d');

    await expect(window.getByTestId('commit-node')).toHaveCount(2);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${taggedEndpoint}"]`)).toBeVisible();
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${branchTip}"]`)).toBeVisible();
    await expect(window.getByTestId('compacted-commit-count')).toHaveAttribute('data-count', '2');
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${outsideCommit}"]`)).toHaveCount(0);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${firstHiddenCommit}"]`)).toHaveCount(0);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${secondHiddenCommit}"]`)).toHaveCount(0);
    await expect(window.getByTestId('history-cut-marker')).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('remote-tracking references refresh only after explicit Fetch', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const remotePath = path.join(testDirectory, 'origin.git');
  const producerPath = path.join(testDirectory, 'producer');
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(producerPath);
  let app;

  const runGit = (cwd, args) => execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();

  try {
    runGit(testDirectory, ['init', '--bare', '--initial-branch=main', remotePath]);
    runGit(producerPath, ['init', '--initial-branch=main']);
    runGit(producerPath, ['config', 'user.name', 'GitScope E2E']);
    runGit(producerPath, ['config', 'user.email', 'gitscope-e2e@example.invalid']);
    fs.writeFileSync(path.join(producerPath, 'README.txt'), 'Initial remote commit');
    runGit(producerPath, ['add', 'README.txt']);
    runGit(producerPath, ['commit', '-m', 'Initial remote commit']);
    runGit(producerPath, ['remote', 'add', 'origin', remotePath]);
    runGit(producerPath, ['push', '-u', 'origin', 'main']);
    runGit(testDirectory, ['clone', remotePath, repositoryPath]);
    const originalRemoteTip = runGit(repositoryPath, ['rev-parse', 'refs/remotes/origin/main']);

    fs.writeFileSync(path.join(producerPath, 'remote-update.txt'), 'Fetched only on request');
    runGit(producerPath, ['add', 'remote-update.txt']);
    runGit(producerPath, ['commit', '-m', 'Explicitly fetched commit']);
    runGit(producerPath, ['push', 'origin', 'main']);
    const updatedRemoteTip = runGit(producerPath, ['rev-parse', 'HEAD']);

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const remoteLane = window.locator('[data-testid="reference-lane"][data-ref-name="origin/main"]');
    await expect(remoteLane).toHaveAttribute('data-target-hash', originalRemoteTip);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${updatedRemoteTip}"]`)).toHaveCount(0);
    await window.getByRole('checkbox', { name: 'main', exact: true }).uncheck();
    await expect(remoteLane).toHaveAttribute('data-target-hash', originalRemoteTip);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${updatedRemoteTip}"]`)).toHaveCount(0);

    await window.getByRole('button', { name: 'Fetch' }).click();
    await expect(window.locator('#fetch-status')).toContainText('Fetch completed');
    await expect(remoteLane).toHaveAttribute('data-target-hash', updatedRemoteTip);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${updatedRemoteTip}"]`)).toBeVisible();
    expect(runGit(repositoryPath, ['rev-parse', 'refs/heads/main'])).toBe(originalRemoteTip);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('failed explicit fetch keeps the graph and exposes copyable diagnostics', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const remotePath = path.join(testDirectory, 'origin.git');
  const producerPath = path.join(testDirectory, 'producer');
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const missingRemotePath = path.join(testDirectory, 'missing-origin.git');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(producerPath);
  let app;

  const runGit = (cwd, args) => execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();

  try {
    runGit(testDirectory, ['init', '--bare', '--initial-branch=main', remotePath]);
    runGit(producerPath, ['init', '--initial-branch=main']);
    runGit(producerPath, ['config', 'user.name', 'GitScope E2E']);
    runGit(producerPath, ['config', 'user.email', 'gitscope-e2e@example.invalid']);
    fs.writeFileSync(path.join(producerPath, 'README.txt'), 'Initial commit');
    runGit(producerPath, ['add', 'README.txt']);
    runGit(producerPath, ['commit', '-m', 'Initial commit']);
    runGit(producerPath, ['remote', 'add', 'origin', remotePath]);
    runGit(producerPath, ['push', '-u', 'origin', 'main']);
    runGit(testDirectory, ['clone', remotePath, repositoryPath]);
    runGit(repositoryPath, ['remote', 'set-url', 'origin', missingRemotePath]);
    const originalRemoteTip = runGit(repositoryPath, ['rev-parse', 'refs/remotes/origin/main']);

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await window.getByRole('button', { name: 'Fetch' }).click();

    await expect(window.locator('#fetch-status')).toContainText('Fetch failed');
    await expect(window.getByLabel('Fetch diagnostics')).toBeVisible();
    await expect(window.getByText(/fatal:|does not appear to be a git repository/i)).toBeVisible();
    await window.getByRole('button', { name: 'Copy diagnostics' }).click();
    await expect(window.locator('#diagnostics-copy-status')).toHaveText('Diagnostics copied.');
    await expect(window.locator('[data-testid="reference-lane"][data-ref-name="origin/main"]'))
      .toHaveAttribute('data-target-hash', originalRemoteTip);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${originalRemoteTip}"]`)).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('detached HEAD is marked at its commit without inventing a branch', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'detached-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);
  let app;

  const runGit = (args) => execFileSync('git', args, {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init']);
    runGit(['config', 'user.name', 'GitScope E2E']);
    runGit(['config', 'user.email', 'gitscope-e2e@example.invalid']);
    fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Detached commit');
    runGit(['add', 'README.txt']);
    runGit(['commit', '-m', 'Detached commit']);
    const head = runGit(['rev-parse', 'HEAD']);
    runGit(['checkout', '--detach', head]);

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await expect(window.locator('#branch-name')).toHaveText('Detached HEAD');
    await expect(window.getByTestId('head-marker')).toHaveAttribute('data-commit-hash', head);
    await expect(window.locator('[data-testid="reference-lane"][data-ref-name="HEAD"]')).toHaveCount(0);
    await expect(window.locator(`[data-testid="commit-node"][data-commit-hash="${head}"]`)).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('an unborn branch shows its name and an empty graph', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'unborn-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);
  let app;

  try {
    execFileSync('git', ['-c', 'init.defaultBranch=first-work', 'init'], {
      cwd: repositoryPath,
      stdio: 'ignore'
    });
    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await expect(window.locator('#branch-name')).toHaveText('first-work');
    await expect(window.getByTestId('commit-node')).toHaveCount(0);
    await expect(window.getByText('No commits yet. The commit graph will appear after the first commit.')).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('branches identify the worktree where they are checked out', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const repositoryPath = path.join(testDirectory, 'main-repository');
  const linkedWorktreePath = path.join(testDirectory, 'feature-worktree');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);
  let app;

  const runGit = (args) => execFileSync('git', args, {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init']);
    runGit(['config', 'user.name', 'GitScope E2E']);
    runGit(['config', 'user.email', 'gitscope-e2e@example.invalid']);
    fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Main worktree');
    runGit(['add', 'README.txt']);
    runGit(['commit', '-m', 'Main worktree']);
    runGit(['worktree', 'add', '-b', 'feature', linkedWorktreePath]);

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const mainLocation = window.locator('[data-testid="reference-lane"][data-ref-name="main"] [data-testid="reference-worktree"]');
    const featureLocation = window.locator('[data-testid="reference-lane"][data-ref-name="feature"] [data-testid="reference-worktree"]');
    await expect(window.getByTestId('worktree').filter({ hasText: repositoryPath })).toHaveAttribute('data-current', 'true');
    await expect(window.getByTestId('worktree').filter({ hasText: linkedWorktreePath })).toHaveAttribute('data-current', 'false');
    await expect(mainLocation).toHaveText(repositoryPath);
    await expect(featureLocation).toHaveText(linkedWorktreePath);

    await window.getByRole('button', { name: 'Open another repository' }).click();
    await window.getByLabel('Repository folder').fill(linkedWorktreePath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.getByTestId('worktree').filter({ hasText: repositoryPath })).toHaveAttribute('data-current', 'false');
    await expect(window.getByTestId('worktree').filter({ hasText: linkedWorktreePath })).toHaveAttribute('data-current', 'true');
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('shallow clones mark the visible history boundary', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const sourcePath = path.join(testDirectory, 'source-repository');
  const remotePath = path.join(testDirectory, 'remote.git');
  const repositoryPath = path.join(testDirectory, 'shallow-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(sourcePath);
  let app;

  const runGit = (args, cwd) => execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init'], sourcePath);
    runGit(['config', 'user.name', 'GitScope E2E'], sourcePath);
    runGit(['config', 'user.email', 'gitscope-e2e@example.invalid'], sourcePath);
    for (const [index, message] of ['First commit', 'Second commit', 'Latest commit'].entries()) {
      fs.writeFileSync(path.join(sourcePath, 'history.txt'), `${index + 1}\n`);
      runGit(['add', 'history.txt'], sourcePath);
      runGit(['commit', '-m', message], sourcePath);
    }
    runGit(['clone', '--bare', sourcePath, remotePath], testDirectory);
    runGit(['clone', '--depth=1', pathToFileURL(remotePath).href, repositoryPath], testDirectory);
    const shallowHead = runGit(['rev-parse', 'HEAD'], repositoryPath);

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const marker = window.locator('[data-testid="history-boundary"][data-boundary-type="shallow"]');
    await expect(marker).toHaveAttribute('data-commit-hash', shallowHead);
    await expect(marker).toHaveText('Shallow boundary');
    await expect(window.locator('[data-testid="commit-node"]')).toHaveCount(1);
    await expect(window.locator('[data-testid="history-boundary"][data-boundary-type="missing-object"]')).toHaveCount(0);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('partial clones mark missing-object boundaries without fetching', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const sourcePath = path.join(testDirectory, 'source-repository');
  const remotePath = path.join(testDirectory, 'remote.git');
  const repositoryPath = path.join(testDirectory, 'partial-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(sourcePath);
  let app;

  const runGit = (args, cwd) => execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1' }
  }).trim();

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init'], sourcePath);
    runGit(['config', 'user.name', 'GitScope E2E'], sourcePath);
    runGit(['config', 'user.email', 'gitscope-e2e@example.invalid'], sourcePath);
    fs.writeFileSync(path.join(sourcePath, 'content.txt'), 'Partial clone content');
    runGit(['add', 'content.txt'], sourcePath);
    runGit(['commit', '-m', 'Partial clone commit'], sourcePath);
    runGit(['clone', '--bare', sourcePath, remotePath], testDirectory);
    runGit(['config', '--file', path.join(remotePath, 'config'), 'uploadpack.allowFilter', 'true'], testDirectory);
    runGit([
      'clone', '--filter=tree:0', '--no-checkout',
      pathToFileURL(remotePath).href,
      repositoryPath
    ], testDirectory);
    const head = runGit(['rev-parse', 'HEAD'], repositoryPath);
    const commitObject = runGit(['cat-file', '-p', head], repositoryPath);
    const headTree = commitObject.match(/^tree ([0-9a-f]+)$/m)?.[1];
    assert(headTree, 'the fixture commit must identify its root tree');
    const missingObjects = runGit(['rev-list', '--objects', '--missing=print', '--all'], repositoryPath);
    assert(missingObjects.split(/\r?\n/).includes(`?${headTree}`), 'the fixture must have an intentionally missing commit tree');
    fs.rmSync(remotePath, { recursive: true, force: true });

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const marker = window.locator('[data-testid="history-boundary"][data-boundary-type="missing-object"]');
    await expect(marker).toHaveAttribute('data-commit-hash', head);
    await expect(marker).toHaveText('Missing-object boundary');
    await expect(window.locator('[data-testid="commit-node"][data-commit-hash="' + head + '"]')).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('the complex branch scenario shows its merge history and fetchable bare remote', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-sample-e2e-'));
  const repositoryPath = path.resolve(__dirname, '..', 'samples', 'complex-branch-scenario');
  const bareRemotePath = path.resolve(repositoryPath, '..', 'complex-branch-scenario-origin.git');
  let app;
  let initialRemoteTrackingTip;
  let remoteOnlyTip;

  try {
    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: path.join(testDirectory, 'user-data') }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await window.getByRole('button', { name: 'Fetch' }).click();
    await expect(window.locator('#fetch-status')).toContainText('Fetch completed');
    await expect(remoteMain).toHaveAttribute('data-target-hash', remoteOnlyTip);
    expect(remoteOnlyTip).not.toBe(initialRemoteTrackingTip);
    await expect(remoteOnlyNode).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    if (initialRemoteTrackingTip && remoteOnlyTip) {
      execFileSync('git', ['--git-dir', bareRemotePath, 'update-ref', 'refs/heads/main', remoteOnlyTip]);
      execFileSync('git', ['update-ref', 'refs/remotes/origin/main', initialRemoteTrackingTip], {
        cwd: repositoryPath
      });
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('the checked-out branch is highlighted in the reference list and at its graph tip', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-head-branch-e2e-'));
  const repositoryPath = path.resolve(__dirname, '..', 'samples', 'complex-branch-scenario');
  let app;

  try {
    const branchName = execFileSync('git', ['branch', '--show-current'], {
      cwd: repositoryPath,
      encoding: 'utf8'
    }).trim();
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryPath,
      encoding: 'utf8'
    }).trim();
    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: path.join(testDirectory, 'user-data') }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

test('the complex scenario shows both merge directions and recent history', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-scenario-history-e2e-'));
  const repositoryPath = path.resolve(__dirname, '..', 'samples', 'complex-branch-scenario');
  let app;

  try {
    const latestSampleCommitDate = new Date(execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
      cwd: repositoryPath,
      encoding: 'utf8'
    }).trim());
    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: path.join(testDirectory, 'user-data') }
    });
    const window = await app.firstWindow();
    await window.clock.install({ time: latestSampleCommitDate });
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await expect(window.locator('#branch-name')).toHaveText('feature/checkout');
    const mainIntoFeature = window.locator(
      '[data-testid="commit-node"][aria-label^="Inspect Merge main into feature/checkout ("]'
    );
    const mainIntoFeatureAfterIntegration = window.locator(
      '[data-testid="commit-node"][aria-label^="Inspect Merge main into feature/checkout after integration"]'
    );
    const featureIntoMain = window.locator(
      '[data-testid="commit-node"][aria-label^="Inspect Merge feature/checkout into main"]'
    );
    await expect(mainIntoFeature).toBeVisible();
    await expect(mainIntoFeatureAfterIntegration).toBeVisible();
    await expect(featureIntoMain).toBeVisible();
    const allHistoryCount = await window.getByTestId('commit-node').count();
    await expect(window.locator('[data-testid="commit-node"][aria-label*="Initial project skeleton"]')).toBeVisible();

    await window.locator('#time-range').selectOption('all');
    await expect(window.locator('[data-testid="commit-node"][aria-label*="Initial project skeleton"]')).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('the repository view expands and contracts with the application window', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-layout-e2e-'));
  const repositoryPath = path.join(testDirectory, 'layout-repository');
  fs.mkdirSync(repositoryPath);
  let app;

  try {
    execFileSync('git', ['-c', 'init.defaultBranch=main', 'init'], {
      cwd: repositoryPath,
      stdio: 'ignore'
    });
    execFileSync('git', ['config', 'user.name', 'GitScope E2E'], { cwd: repositoryPath });
    execFileSync('git', ['config', 'user.email', 'gitscope-e2e@example.invalid'], { cwd: repositoryPath });
    fs.writeFileSync(path.join(repositoryPath, 'README.md'), 'Responsive layout test\n');
    execFileSync('git', ['add', 'README.md'], { cwd: repositoryPath, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'Create layout fixture'], {
      cwd: repositoryPath,
      stdio: 'ignore'
    });

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: path.join(testDirectory, 'user-data') }
    });
    const window = await app.firstWindow();
    const resizeWindow = async (width, height) => {
      await app.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()[0].setSize(size.width, size.height);
      }, { width, height });
      await expect.poll(() => window.evaluate(() => window.innerWidth)).toBeGreaterThan(width - 40);
    };
    await resizeWindow(1366, 768);
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.getByRole('heading', { name: 'layout-repository' })).toBeVisible();

    const repositoryView = window.locator('#repository-view');
    const standardLayout = await repositoryView.boundingBox();
    expect(standardLayout.width).toBeGreaterThan(1200);

    await resizeWindow(1600, 900);
    const wideLayout = await repositoryView.boundingBox();
    expect(wideLayout.width).toBeGreaterThan(standardLayout.width);

    await resizeWindow(1000, 720);
    const narrowLayout = await repositoryView.boundingBox();
    expect(narrowLayout.width).toBeLessThan(standardLayout.width);
    expect(await window.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(await window.evaluate(() => window.innerWidth));
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('dense histories show a useful graph and keep filters responsive at target scale', async () => {
  test.setTimeout(180_000);
  const commitCount = 50_000;
  const referenceCount = 100;
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-scale-'));
  const repositoryPath = path.join(testDirectory, 'dense-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);
  let app;

  const runGit = (args) => execFileSync('git', args, {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();

  async function createHistory() {
    const author = 'GitScope E2E <gitscope-e2e@example.invalid>';
    const now = Math.floor(Date.now() / 1000);
    const firstTimestamp = now - commitCount * 3600;
    const stream = spawn('git', ['fast-import', '--quiet'], {
      cwd: repositoryPath,
      stdio: ['pipe', 'ignore', 'pipe']
    });
    let stderr = '';
    stream.stderr.setEncoding('utf8');
    stream.stderr.on('data', (chunk) => { stderr += chunk; });
    const lines = [];
    for (let index = 0; index < commitCount; index += 1) {
      const mark = index + 1;
      const timestamp = firstTimestamp + index * 3600;
      const message = `Commit ${mark}`;
      lines.push(
        `commit refs/heads/main\nmark :${mark}\nauthor ${author} ${timestamp} +0000\ncommitter ${author} ${timestamp} +0000\ndata ${Buffer.byteLength(message)}\n${message}\n`,
        index === 0 ? '\n' : `from :${mark - 1}\n\n`
      );
    }
    for (let index = 1; index < referenceCount; index += 1) {
      const mark = Math.floor((index * (commitCount - 1)) / (referenceCount - 1)) + 1;
      lines.push(`reset refs/heads/branch-${String(index).padStart(3, '0')}\nfrom :${mark}\n\n`);
    }

    await new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr || `git fast-import exited with code ${code}`));
        }
      });

      stream.stdin.end(lines.join(''));
    });
  }

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init']);
    await createHistory();
    expect(runGit(['rev-list', '--count', '--all'])).toBe(String(commitCount));
    expect(runGit(['for-each-ref', '--format=%(refname)', 'refs/heads']).split(/\r?\n/)).toHaveLength(referenceCount);

    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPath }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    const graphStartedAt = process.hrtime.bigint();
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.locator('#repository-progress')).toHaveText('Loading repository history…');
    await expect(window.getByRole('button', { name: 'Open repository' })).toBeDisabled();
    await expect(window.getByRole('heading', { name: 'dense-repository' })).toBeVisible();
    await expect(window.locator('#repository-progress')).toBeEmpty();
    await expect(window.locator('[data-testid="commit-graph"]')).toHaveAttribute(
      'data-reference-count',
      String(referenceCount)
    );
    const displayedCommitCount = await window.getByTestId('commit-node').count();
    const compactedCommitCount = await window.getByTestId('compacted-commit-count').evaluateAll((summaries) => (
      summaries.reduce((sum, summary) => sum + Number(summary.dataset.count), 0)
    ));
    expect(displayedCommitCount + compactedCommitCount).toBe(commitCount);
    await expect(window.getByTestId('commit-node').first()).toBeVisible();
    const graphReadyMs = Number(process.hrtime.bigint() - graphStartedAt) / 1_000_000;
    expect(graphReadyMs, `graph ready in ${graphReadyMs.toFixed(1)} ms`).toBeLessThan(5_000);

    const branchFilter = window.locator('[data-testid="reference-filter"][aria-label="branch-050"]');
    const branchFilterStartedAt = process.hrtime.bigint();
    await branchFilter.uncheck();
    await expect(window.locator('[data-testid="commit-graph"]')).toHaveAttribute(
      'data-reference-count',
      String(referenceCount - 1)
    );
    const branchFilterMs = Number(process.hrtime.bigint() - branchFilterStartedAt) / 1_000_000;
    expect(branchFilterMs, `reference filter responded in ${branchFilterMs.toFixed(1)} ms`).toBeLessThan(250);

    const timeFilterStartedAt = process.hrtime.bigint();
    await window.getByLabel('Time range', { exact: true }).selectOption('1d');
    await expect(window.getByTestId('history-cut-marker')).toContainText('Earlier history continues');
    const timeFilterMs = Number(process.hrtime.bigint() - timeFilterStartedAt) / 1_000_000;
    expect(timeFilterMs, `time filter responded in ${timeFilterMs.toFixed(1)} ms`).toBeLessThan(250);
    const recentNodeCount = await window.getByTestId('commit-node').count();
    expect(recentNodeCount, 'the selected time window should keep recent commit nodes visible').toBeGreaterThan(0);
    expect(recentNodeCount, 'the selected time window should clip dense older history').toBeLessThan(25);
    await expect(window.getByTestId('compacted-commit-count')).toBeVisible();
    console.log(JSON.stringify({
      target: { commits: commitCount, references: referenceCount },
      graphReadyMs: Math.round(graphReadyMs),
      branchFilterMs: Math.round(branchFilterMs),
      timeFilterMs: Math.round(timeFilterMs),
      recentNodeCount
    }));
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

  try {
    app = await launch();
    let window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await node.click();
    await expect(dock).toBeHidden();
    await expect(node).toHaveAttribute('aria-pressed', 'false');
    await node.click();
    await window.locator('#commit-graph').click({ position: { x: 5, y: 5 } });
    await expect(dock).toBeHidden();

  try {
    app = await electron.launch({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, GITSCOPE_USER_DATA_DIR: path.join(testDirectory, 'user-data') }
    });
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
