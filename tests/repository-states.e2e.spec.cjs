const {
  assert,
  execFileSync,
  expect,
  fs,
  launchGitScope,
  os,
  path,
  pathToFileURL,
  test
} = require('./e2e-helpers.cjs');

test('remote-tracking references refresh only after explicit Fetch', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitscope-e2e-'));
  const remotePath = path.join(testDirectory, 'origin.git');
  const producerPath = path.join(testDirectory, 'producer');
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(producerPath);
  let app;

  const runGit = (cwd, args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();

  try {
    runGit(testDirectory, ['init', '--bare', '--initial-branch=main', remotePath]);
    runGit(producerPath, ['init', '--initial-branch=main']);
    runGit(producerPath, ['config', 'user.name', 'Gitscope E2e']);
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

    app = await launchGitScope(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const remoteLane = window.locator(
      '[data-testid="reference-lane"][data-ref-name="origin/main"]'
    );
    await expect(remoteLane).toHaveAttribute('data-target-hash', originalRemoteTip);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${updatedRemoteTip}"]`)
    ).toHaveCount(0);
    await window.locator('#branch-picker > summary').click();
    await window.getByRole('checkbox', { name: 'main', exact: true }).uncheck();
    await expect(remoteLane).toHaveAttribute('data-target-hash', originalRemoteTip);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${updatedRemoteTip}"]`)
    ).toHaveCount(0);

    await window.getByRole('button', { name: 'Fetch' }).click();
    await expect(window.locator('#fetch-status')).toContainText('Fetch completed');
    await expect(remoteLane).toHaveAttribute('data-target-hash', updatedRemoteTip);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${updatedRemoteTip}"]`)
    ).toBeVisible();
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

  const runGit = (cwd, args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();

  try {
    runGit(testDirectory, ['init', '--bare', '--initial-branch=main', remotePath]);
    runGit(producerPath, ['init', '--initial-branch=main']);
    runGit(producerPath, ['config', 'user.name', 'Gitscope E2e']);
    runGit(producerPath, ['config', 'user.email', 'gitscope-e2e@example.invalid']);
    fs.writeFileSync(path.join(producerPath, 'README.txt'), 'Initial commit');
    runGit(producerPath, ['add', 'README.txt']);
    runGit(producerPath, ['commit', '-m', 'Initial commit']);
    runGit(producerPath, ['remote', 'add', 'origin', remotePath]);
    runGit(producerPath, ['push', '-u', 'origin', 'main']);
    runGit(testDirectory, ['clone', remotePath, repositoryPath]);
    runGit(repositoryPath, ['remote', 'set-url', 'origin', missingRemotePath]);
    const originalRemoteTip = runGit(repositoryPath, ['rev-parse', 'refs/remotes/origin/main']);

    app = await launchGitScope(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await window.getByRole('button', { name: 'Fetch' }).click();

    await expect(window.locator('#fetch-status')).toContainText('Fetch failed');
    await expect(window.getByLabel('Fetch diagnostics')).toBeVisible();
    await expect(window.getByText(/fatal:|does not appear to be a git repository/i)).toBeVisible();
    await window.getByRole('button', { name: 'Copy diagnostics' }).click();
    await expect(window.locator('#diagnostics-copy-status')).toHaveText('Diagnostics copied.');
    await expect(
      window.locator('[data-testid="reference-lane"][data-ref-name="origin/main"]')
    ).toHaveAttribute('data-target-hash', originalRemoteTip);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${originalRemoteTip}"]`)
    ).toBeVisible();
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

  const runGit = (args) =>
    execFileSync('git', args, {
      cwd: repositoryPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init']);
    runGit(['config', 'user.name', 'Gitscope E2e']);
    runGit(['config', 'user.email', 'gitscope-e2e@example.invalid']);
    fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Detached commit');
    runGit(['add', 'README.txt']);
    runGit(['commit', '-m', 'Detached commit']);
    const head = runGit(['rev-parse', 'HEAD']);
    runGit(['checkout', '--detach', head]);

    app = await launchGitScope(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await expect(window.locator('#branch-name')).toHaveText('Detached HEAD');
    await expect(window.getByTestId('head-marker')).toHaveAttribute('data-commit-hash', head);
    await expect(
      window.locator('[data-testid="reference-lane"][data-ref-name="HEAD"]')
    ).toHaveCount(0);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${head}"]`)
    ).toBeVisible();
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
    app = await launchGitScope(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await expect(window.locator('#branch-name')).toHaveText('first-work');
    await expect(window.getByTestId('commit-node')).toHaveCount(0);
    await expect(
      window.getByText('No commits yet. The commit graph will appear after the first commit.')
    ).toBeVisible();
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

  const runGit = (args) =>
    execFileSync('git', args, {
      cwd: repositoryPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init']);
    runGit(['config', 'user.name', 'Gitscope E2e']);
    runGit(['config', 'user.email', 'gitscope-e2e@example.invalid']);
    fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Main worktree');
    runGit(['add', 'README.txt']);
    runGit(['commit', '-m', 'Main worktree']);
    runGit(['worktree', 'add', '-b', 'feature', linkedWorktreePath]);

    app = await launchGitScope(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const mainLocation = window.locator(
      '[data-testid="reference-lane"][data-ref-name="main"] [data-testid="reference-worktree"]'
    );
    const featureLocation = window.locator(
      '[data-testid="reference-lane"][data-ref-name="feature"] [data-testid="reference-worktree"]'
    );
    await expect(
      window.getByTestId('worktree').filter({ hasText: repositoryPath })
    ).toHaveAttribute('data-current', 'true');
    await expect(
      window.getByTestId('worktree').filter({ hasText: linkedWorktreePath })
    ).toHaveAttribute('data-current', 'false');
    await expect(mainLocation).toHaveText(repositoryPath);
    await expect(featureLocation).toHaveText(linkedWorktreePath);

    await window.getByRole('button', { name: 'Open another repository' }).click();
    await window.getByLabel('Repository folder').fill(linkedWorktreePath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(
      window.getByTestId('worktree').filter({ hasText: repositoryPath })
    ).toHaveAttribute('data-current', 'false');
    await expect(
      window.getByTestId('worktree').filter({ hasText: linkedWorktreePath })
    ).toHaveAttribute('data-current', 'true');
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

  const runGit = (args, cwd) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init'], sourcePath);
    runGit(['config', 'user.name', 'Gitscope E2e'], sourcePath);
    runGit(['config', 'user.email', 'gitscope-e2e@example.invalid'], sourcePath);
    for (const [index, message] of ['First commit', 'Second commit', 'Latest commit'].entries()) {
      fs.writeFileSync(path.join(sourcePath, 'history.txt'), `${index + 1}\n`);
      runGit(['add', 'history.txt'], sourcePath);
      runGit(['commit', '-m', message], sourcePath);
    }
    runGit(['clone', '--bare', sourcePath, remotePath], testDirectory);
    runGit(['clone', '--depth=1', pathToFileURL(remotePath).href, repositoryPath], testDirectory);
    const shallowHead = runGit(['rev-parse', 'HEAD'], repositoryPath);

    app = await launchGitScope(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const marker = window.locator('[data-testid="history-boundary"][data-boundary-type="shallow"]');
    await expect(marker).toHaveAttribute('data-commit-hash', shallowHead);
    await expect(marker).toHaveText('Shallow boundary');
    await expect(window.locator('[data-testid="commit-node"]')).toHaveCount(1);
    await expect(
      window.locator('[data-testid="history-boundary"][data-boundary-type="missing-object"]')
    ).toHaveCount(0);
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

  const runGit = (args, cwd) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1' }
    }).trim();

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init'], sourcePath);
    runGit(['config', 'user.name', 'Gitscope E2e'], sourcePath);
    runGit(['config', 'user.email', 'gitscope-e2e@example.invalid'], sourcePath);
    fs.writeFileSync(path.join(sourcePath, 'content.txt'), 'Partial clone content');
    runGit(['add', 'content.txt'], sourcePath);
    runGit(['commit', '-m', 'Partial clone commit'], sourcePath);
    runGit(['clone', '--bare', sourcePath, remotePath], testDirectory);
    runGit(
      ['config', '--file', path.join(remotePath, 'config'), 'uploadpack.allowFilter', 'true'],
      testDirectory
    );
    runGit(
      ['clone', '--filter=tree:0', '--no-checkout', pathToFileURL(remotePath).href, repositoryPath],
      testDirectory
    );
    const head = runGit(['rev-parse', 'HEAD'], repositoryPath);
    const commitObject = runGit(['cat-file', '-p', head], repositoryPath);
    const headTree = commitObject.match(/^tree ([0-9a-f]+)$/m)?.[1];
    assert(headTree, 'the fixture commit must identify its root tree');
    const missingObjects = runGit(
      ['rev-list', '--objects', '--missing=print', '--all'],
      repositoryPath
    );
    assert(
      missingObjects.split(/\r?\n/).includes(`?${headTree}`),
      'the fixture must have an intentionally missing commit tree'
    );
    fs.rmSync(remotePath, { recursive: true, force: true });

    app = await launchGitScope(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const marker = window.locator(
      '[data-testid="history-boundary"][data-boundary-type="missing-object"]'
    );
    await expect(marker).toHaveAttribute('data-commit-hash', head);
    await expect(marker).toHaveText('Missing-object boundary');
    await expect(
      window.locator('[data-testid="commit-node"][data-commit-hash="' + head + '"]')
    ).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
