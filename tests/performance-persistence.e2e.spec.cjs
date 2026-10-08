const {
  execFileSync,
  expect,
  fs,
  launchMergentra,
  os,
  path,
  spawn,
  test
} = require('./e2e-helpers.cjs');

test('the repository view expands and contracts with the application window', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-layout-e2e-'));
  const repositoryPath = path.join(testDirectory, 'layout-repository');
  fs.mkdirSync(repositoryPath);
  let app;

  try {
    execFileSync('git', ['-c', 'init.defaultBranch=main', 'init'], {
      cwd: repositoryPath,
      stdio: 'ignore'
    });
    execFileSync('git', ['config', 'user.name', 'Mergentra E2e'], { cwd: repositoryPath });
    execFileSync('git', ['config', 'user.email', 'mergentra-e2e@example.invalid'], {
      cwd: repositoryPath
    });
    fs.writeFileSync(path.join(repositoryPath, 'README.md'), 'Responsive layout test\n');
    execFileSync('git', ['add', 'README.md'], { cwd: repositoryPath, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'Create layout fixture'], {
      cwd: repositoryPath,
      stdio: 'ignore'
    });

    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    const window = await app.firstWindow();
    const resizeWindow = async (width, height) => {
      await app.evaluate(
        ({ BrowserWindow }, size) => {
          BrowserWindow.getAllWindows()[0].setSize(size.width, size.height);
        },
        { width, height }
      );
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
    expect(await window.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await window.evaluate(() => window.innerWidth)
    );
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
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-scale-'));
  const repositoryPath = path.join(testDirectory, 'dense-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);
  let app;

  const runGit = (args) =>
    execFileSync('git', args, {
      cwd: repositoryPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();

  async function createHistory() {
    const author = 'Mergentra E2e <mergentra-e2e@example.invalid>';
    const now = Math.floor(Date.now() / 1000);
    const firstTimestamp = now - commitCount * 3600;
    const stream = spawn('git', ['fast-import', '--quiet'], {
      cwd: repositoryPath,
      stdio: ['pipe', 'ignore', 'pipe']
    });
    let stderr = '';
    stream.stderr.setEncoding('utf8');
    stream.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
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
    expect(
      runGit(['for-each-ref', '--format=%(refname)', 'refs/heads']).split(/\r?\n/)
    ).toHaveLength(referenceCount);

    app = await launchMergentra(userDataPath);
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
    const compactedCommitCount = await window
      .getByTestId('compacted-commit-count')
      .evaluateAll((summaries) =>
        summaries.reduce((sum, summary) => sum + Number(summary.dataset.count), 0)
      );
    expect(displayedCommitCount + compactedCommitCount).toBe(commitCount);
    await expect(window.getByTestId('commit-node').first()).toBeVisible();
    const graphReadyMs = Number(process.hrtime.bigint() - graphStartedAt) / 1_000_000;
    expect(graphReadyMs, `graph ready in ${graphReadyMs.toFixed(1)} ms`).toBeLessThan(5_000);

    // This measures the full Playwright interaction and DOM update; allow scheduler variance while bounding visible stalls.
    const filterResponseBudgetMs = 500;
    await window.locator('#branch-picker > summary').click();
    const branchFilter = window.locator(
      '[data-testid="reference-filter"][aria-label="branch-050"]'
    );
    const branchFilterStartedAt = process.hrtime.bigint();
    await branchFilter.uncheck();
    await expect(window.locator('[data-testid="commit-graph"]')).toHaveAttribute(
      'data-reference-count',
      String(referenceCount - 1)
    );
    const branchFilterMs = Number(process.hrtime.bigint() - branchFilterStartedAt) / 1_000_000;
    expect(
      branchFilterMs,
      `reference filter responded in ${branchFilterMs.toFixed(1)} ms`
    ).toBeLessThan(filterResponseBudgetMs);

    const timeFilterStartedAt = process.hrtime.bigint();
    await window.getByLabel('Time range', { exact: true }).selectOption('1d');
    await expect(window.getByTestId('history-cut-marker')).toContainText(
      'Earlier history continues'
    );
    const timeFilterMs = Number(process.hrtime.bigint() - timeFilterStartedAt) / 1_000_000;
    expect(timeFilterMs, `time filter responded in ${timeFilterMs.toFixed(1)} ms`).toBeLessThan(
      filterResponseBudgetMs
    );
    const recentNodeCount = await window.getByTestId('commit-node').count();
    expect(
      recentNodeCount,
      'the selected time window should keep recent commit nodes visible'
    ).toBeGreaterThan(0);
    expect(
      recentNodeCount,
      'the selected time window should clip dense older history'
    ).toBeLessThan(25);
    await expect(window.getByTestId('compacted-commit-count')).toBeVisible();
    console.log(
      JSON.stringify({
        target: { commits: commitCount, references: referenceCount },
        graphReadyMs: Math.round(graphReadyMs),
        branchFilterMs: Math.round(branchFilterMs),
        timeFilterMs: Math.round(timeFilterMs),
        recentNodeCount
      })
    );
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('branch selection and time range are remembered per repository', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-view-state-e2e-'));
  const userDataPath = path.join(testDirectory, 'user-data');
  const runGit = (cwd, args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const createRepository = (name) => {
    const repositoryPath = path.join(testDirectory, name);
    fs.mkdirSync(repositoryPath);
    runGit(repositoryPath, ['-c', 'init.defaultBranch=main', 'init']);
    runGit(repositoryPath, ['config', 'user.name', 'Mergentra E2e']);
    runGit(repositoryPath, ['config', 'user.email', 'mergentra-e2e@example.invalid']);
    runGit(repositoryPath, ['commit', '--allow-empty', '-m', 'Initial']);
    runGit(repositoryPath, ['branch', 'feature']);
    return repositoryPath;
  };
  const firstRepository = createRepository('first');
  const secondRepository = createRepository('second');
  const launch = () => launchMergentra(userDataPath);
  let app;

  try {
    app = await launch();
    let window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(firstRepository);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.locator('#branch-picker-summary')).toHaveText('Branches: 2 of 2 shown');
    await window.locator('#branch-picker > summary').click();
    await window.getByRole('checkbox', { name: 'feature', exact: true }).uncheck();
    await expect(window.locator('#branch-picker-summary')).toHaveText('Branches: 1 of 2 shown');
    await window.locator('#time-range').selectOption('1w');
    await expect(window.locator('#branch-owner-filter option')).toHaveText([
      'All owners',
      'Mergentra E2e'
    ]);
    await window.locator('#branch-owner-filter').selectOption({ label: 'Mergentra E2e' });
    await expect(window.locator('#branch-picker-summary')).toHaveText('Branches: 2 of 2 shown');
    await window.getByTestId('commit-node').first().click();
    await window.getByRole('button', { name: 'Centre on selected' }).click();
    await expect(window.getByTestId('commit-node')).toHaveCount(1);
    await expect(window.getByRole('button', { name: 'Later' })).toBeDisabled();
    await window.getByRole('button', { name: 'Earlier' }).click();
    await expect(window.getByTestId('commit-node')).toHaveCount(0);
    await window.getByRole('button', { name: 'Later' }).click();
    await expect(window.getByTestId('commit-node')).toHaveCount(1);
    await window.locator('#time-range').selectOption('1d');
    await expect(window.getByTestId('commit-node')).toHaveCount(1);
    await window.locator('#time-range').selectOption('1m');
    await expect(window.getByTestId('commit-node')).toHaveCount(1);
    await window.locator('#time-range').selectOption('1w');
    await window.getByRole('button', { name: 'Earlier' }).click();
    await app.close();

    app = await launch();
    window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(firstRepository);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.locator('#branch-picker-summary')).toHaveText('Branches: 0 of 0 shown');
    await expect(window.locator('#time-range')).toHaveValue('1w');
    await expect(window.getByTestId('commit-node')).toHaveCount(0);

    await window.getByRole('button', { name: 'Open another repository' }).click();
    await window.getByLabel('Repository folder').fill(secondRepository);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.locator('#branch-picker-summary')).toHaveText('Branches: 2 of 2 shown');
    await expect(window.locator('#time-range')).toHaveValue('all');
  } finally {
    await app?.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('commit and branch notes persist per repository and selection can be cleared', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-notes-e2e-'));
  const userDataPath = path.join(testDirectory, 'user-data');
  const repositoryPath = path.join(testDirectory, 'notes-repository');
  fs.mkdirSync(repositoryPath);
  const runGit = (args) =>
    execFileSync('git', args, {
      cwd: repositoryPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  runGit(['-c', 'init.defaultBranch=main', 'init']);
  runGit(['config', 'user.name', 'Mergentra E2e']);
  runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
  runGit(['commit', '--allow-empty', '-m', 'Initial']);
  runGit(['commit', '--allow-empty', '-m', 'Second']);
  runGit(['branch', 'feature']);
  const tip = runGit(['rev-parse', 'HEAD']);
  const launch = () => launchMergentra(userDataPath);
  let app;

  try {
    app = await launch();
    let window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const node = window.locator(`[data-testid="commit-node"][data-commit-hash="${tip}"]`);
    const dock = window.getByTestId('review-dock');
    await expect(dock).toBeHidden();
    await node.click();
    await expect(dock).toBeVisible();
    await expect(node).toHaveAttribute('aria-pressed', 'true');
    await expect(node.getByTestId('selection-ring')).toBeVisible();
    await window.getByTestId('selected-commit-note').fill('Part of project X');
    await expect(node).toHaveAttribute('data-has-note', 'true');

    await node.click();
    await expect(dock).toBeHidden();
    await expect(node).toHaveAttribute('aria-pressed', 'false');
    await node.click();
    await window.locator('#commit-graph').click({ position: { x: 5, y: 5 } });
    await expect(dock).toBeHidden();

    await window.locator('#branch-picker > summary').click();
    await window.getByRole('button', { name: 'Note for feature', exact: true }).click();
    await window.getByLabel('Note text for feature').fill('Prototype for project X');
    await app.close();

    app = await launch();
    window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await window.locator(`[data-testid="commit-node"][data-commit-hash="${tip}"]`).click();
    await expect(window.getByTestId('selected-commit-note')).toHaveValue('Part of project X');
    await expect(window.getByTestId('selected-commit-branch-notes')).toContainText(
      'feature: Prototype for project X'
    );
  } finally {
    await app?.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('collapsed commit groups list their commits, highlight with the selection, and labels can be toggled', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-collapsed-e2e-'));
  const repositoryPath = path.join(testDirectory, 'collapsed-repository');
  fs.mkdirSync(repositoryPath);
  const runGit = (args) =>
    execFileSync('git', args, {
      cwd: repositoryPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  runGit(['-c', 'init.defaultBranch=main', 'init']);
  runGit(['config', 'user.name', 'Mergentra E2e']);
  runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
  runGit(['commit', '--allow-empty', '-m', 'Start']);
  runGit(['tag', 'v1.0.0']);
  runGit(['tag', 'wip-marker']);
  for (const name of ['Alpha', 'Beta', 'Gamma']) {
    runGit(['commit', '--allow-empty', '-m', name]);
  }
  const betaHash = runGit(['rev-parse', 'HEAD~1']);
  runGit(['commit', '--allow-empty', '-m', 'End']);
  let app;

  try {
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await expect(window.getByTestId('compacted-commit-count')).toBeVisible();
    const graphSvg = window.getByTestId('commit-graph');
    const baseWidth = Number(await graphSvg.getAttribute('width'));
    await window.getByRole('button', { name: 'Zoom in' }).click();
    await expect(window.getByLabel('Zoom percentage')).toHaveValue('125%');
    expect(Number(await graphSvg.getAttribute('width'))).toBe(Math.round(baseWidth * 1.25));
    await window.getByRole('button', { name: 'Zoom out' }).click();
    await window.getByRole('button', { name: 'Zoom out' }).click();
    await expect(window.getByLabel('Zoom percentage')).toHaveValue('80%');
    await graphSvg.click({ position: { x: 5, y: 5 }, modifiers: ['Shift'] });
    await expect(window.getByLabel('Zoom percentage')).toHaveValue('100%');
    await graphSvg.click({ position: { x: 5, y: 5 }, modifiers: ['Shift', 'Alt'] });
    await expect(window.getByLabel('Zoom percentage')).toHaveValue('80%');
    await window.getByRole('button', { name: 'Show zoom levels' }).click();
    await window.getByRole('option', { name: 'Reset to 100%' }).click();
    expect(Number(await graphSvg.getAttribute('width'))).toBe(baseWidth);

    const summary = window.getByTestId('compacted-commit-count');
    await expect(summary).toHaveAttribute('data-count', '3');
    await expect(summary).toHaveAttribute('aria-pressed', 'false');
    await expect(summary.locator('title')).toContainText('Beta');

    await summary.click();
    const items = window.getByTestId('compacted-commit-item');
    await expect(items).toHaveCount(3);
    await items.filter({ hasText: 'Beta' }).click();
    await expect(window.getByTestId('selected-commit-hash')).toHaveText(betaHash);
    await expect(summary).toHaveAttribute('aria-pressed', 'true');
    await expect(items.filter({ hasText: 'Beta' })).toHaveAttribute('aria-pressed', 'true');
    await expect(window.getByTestId('compacted-selection-ring')).toBeVisible();

    await window.locator('#commit-graph').click({ position: { x: 5, y: 5 } });
    await expect(summary).toHaveAttribute('aria-pressed', 'false');
    await expect(window.getByTestId('compacted-popover')).toHaveCount(0);

    await window.getByText('Display', { exact: true }).click();
    const hashLabel = window.locator('.hash-label').first();
    await expect(hashLabel).toBeVisible();
    await window.getByLabel('Commit hashes').uncheck();
    await expect(hashLabel).toBeHidden();
    await expect(window.locator('[data-kind="release"]')).toBeVisible();
    await expect(window.locator('[data-kind="tag"]')).toBeVisible();
    await window.getByLabel('Releases').uncheck();
    await expect(window.locator('[data-kind="release"]')).toBeHidden();
    await window.getByLabel('Tags', { exact: true }).uncheck();
    await expect(window.locator('[data-kind="tag"]')).toBeHidden();
  } finally {
    await app?.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
