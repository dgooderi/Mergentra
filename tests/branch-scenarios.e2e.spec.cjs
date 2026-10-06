const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test('the complex branch scenario shows its merge history and fetchable bare remote', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-sample-e2e-'));
  const repositoryPath = path.resolve(__dirname, '..', 'samples', 'complex-branch-scenario');
  const bareRemotePath = path.resolve(repositoryPath, '..', 'complex-branch-scenario-origin.git');
  let app;
  let initialRemoteTrackingTip;
  let remoteOnlyTip;

  try {
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await expect(window.locator('#repository-name')).toHaveText('complex-branch-scenario');
    await expect(window.locator('[data-testid="reference-lane"]')).toHaveCount(18);
    await expect(window.locator('[data-testid="commit-node"][data-is-merge="true"]')).toHaveCount(
      6
    );
    expect(await window.getByTestId('time-axis-label').count()).toBeGreaterThan(3);
    await expect(window.locator('[data-testid="commit-tag"]')).toHaveCount(3);
    expect(await window.getByTestId('divergence-marker').count()).toBeGreaterThanOrEqual(2);
    remoteOnlyTip = execFileSync('git', ['ls-remote', 'origin', 'refs/heads/main'], {
      cwd: repositoryPath,
      encoding: 'utf8'
    })
      .trim()
      .split(/\s+/)[0];
    const remoteMain = window.locator(
      '[data-testid="reference-lane"][data-ref-name="origin/main"]'
    );
    initialRemoteTrackingTip = await remoteMain.getAttribute('data-target-hash');
    const remoteOnlyNode = window.locator(
      `[data-testid="commit-node"][data-commit-hash="${remoteOnlyTip}"]`
    );
    await expect(remoteOnlyNode).not.toBeVisible();

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
      execFileSync('git', [
        '--git-dir',
        bareRemotePath,
        'update-ref',
        'refs/heads/main',
        remoteOnlyTip
      ]);
      execFileSync('git', ['update-ref', 'refs/remotes/origin/main', initialRemoteTrackingTip], {
        cwd: repositoryPath
      });
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('the checked-out branch is highlighted in the reference list and at its graph tip', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-head-branch-e2e-'));
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
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await window.locator('#branch-picker > summary').click();
    const checkedOutLane = window.locator(
      `[data-testid="reference-lane"][data-ref-name="${branchName}"][data-checked-out="true"]`
    );
    await expect(checkedOutLane).toBeVisible();
    await expect(checkedOutLane).toHaveCSS('border-top-style', 'solid');
    await expect(checkedOutLane).toHaveCSS('border-top-width', '2px');
    await expect(checkedOutLane.getByTestId('checked-out-label')).toHaveText('Checked out');
    await expect(
      window.locator(
        `[data-testid="checked-out-branch-marker"][data-branch-name="${branchName}"][data-commit-hash="${head}"]`
      )
    ).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('the complex scenario shows both merge directions and recent history', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-scenario-history-e2e-'));
  const repositoryPath = path.resolve(__dirname, '..', 'samples', 'complex-branch-scenario');
  let app;

  try {
    const latestSampleCommitDate = new Date(
      execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
        cwd: repositoryPath,
        encoding: 'utf8'
      }).trim()
    );
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
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
    await expect(
      window.locator('[data-testid="commit-node"][aria-label*="Initial project skeleton"]')
    ).toBeVisible();

    await window.locator('#time-range').selectOption('1d');
    await expect(mainIntoFeature).toBeVisible();
    await expect(mainIntoFeatureAfterIntegration).toBeVisible();
    await expect(featureIntoMain).toBeVisible();
    expect(await window.getByTestId('commit-node').count()).toBeGreaterThan(0);
    expect(await window.getByTestId('commit-node').count()).toBeLessThan(allHistoryCount);
    await expect(
      window.getByTestId('compacted-commit-count').filter({ hasText: '+1' })
    ).toHaveCount(0);

    await window.locator('#time-range').selectOption('all');
    await expect(
      window.locator('[data-testid="commit-node"][aria-label*="Initial project skeleton"]')
    ).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
