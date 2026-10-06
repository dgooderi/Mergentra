const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test('time presets and custom local dates filter by committer timestamp', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
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
    execFileSync('git', ['config', 'user.name', 'Mergentra E2e'], { cwd: repositoryPath });
    execFileSync('git', ['config', 'user.email', 'mergentra-e2e@example.invalid'], {
      cwd: repositoryPath
    });
    const oldestCommit = commitAt(
      'Oldest commit',
      new Date(frozenNow.getTime() - 50 * 60 * 60 * 1000)
    );
    const middleCommit = commitAt(
      'Middle commit',
      new Date(frozenNow.getTime() - 30 * 60 * 60 * 1000)
    );
    const recentCommit = commitAt(
      'Recent commit',
      new Date(frozenNow.getTime() - 12 * 60 * 60 * 1000)
    );
    const tipCommit = commitAt('Tip commit', new Date(frozenNow.getTime() - 3 * 60 * 60 * 1000));

    app = await launchMergentra(userDataPath);
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
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${oldestCommit}"]`)
    ).toHaveCount(0);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${middleCommit}"]`)
    ).toHaveCount(0);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${recentCommit}"]`)
    ).toBeVisible();
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${tipCommit}"]`)
    ).toBeVisible();
    await expect(window.getByTestId('history-cut-marker')).toBeVisible();

    await preset.selectOption('custom');
    await window.getByLabel('Start date').fill('2026-05-15');
    await window.getByLabel('End date').fill('2026-05-15');
    await window.getByRole('button', { name: 'Apply date range' }).click();
    await expect(window.getByTestId('commit-node')).toHaveCount(1);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${middleCommit}"]`)
    ).toBeVisible();
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${recentCommit}"]`)
    ).toHaveCount(0);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${tipCommit}"]`)
    ).toHaveCount(0);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('ordinary commits between important commits compact into an endpoint-exclusive count', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (args) =>
    execFileSync('git', args, {
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
    runGit(['config', 'user.name', 'Mergentra E2e']);
    runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
    const taggedEndpoint = commitFile('anchor.txt', 'Tagged endpoint');
    runGit(['tag', 'v1.0.0', taggedEndpoint]);
    const hiddenCommits = [
      commitFile('one.txt', 'Ordinary commit one'),
      commitFile('two.txt', 'Ordinary commit two'),
      commitFile('three.txt', 'Ordinary commit three')
    ];
    const branchTip = commitFile('tip.txt', 'Branch tip endpoint');

    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const commits = window.getByTestId('commit-node');
    await expect(commits).toHaveCount(2);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${taggedEndpoint}"]`)
    ).toBeVisible();
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${branchTip}"]`)
    ).toBeVisible();
    const summary = window.getByTestId('compacted-commit-count');
    await expect(summary).toHaveAttribute('data-count', '3');
    for (const hiddenCommit of hiddenCommits) {
      await expect(
        window.locator(`[data-testid="commit-node"][data-commit-hash="${hiddenCommit}"]`)
      ).toHaveCount(0);
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
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
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
    execFileSync('git', ['config', 'user.name', 'Mergentra E2e'], { cwd: repositoryPath });
    execFileSync('git', ['config', 'user.email', 'mergentra-e2e@example.invalid'], {
      cwd: repositoryPath
    });
    const calendarBoundary = commitAt('Calendar boundary', new Date(2026, 3, 30, 12, 0, 0));
    const branchTip = commitAt('Calendar-window tip', new Date(2026, 4, 31, 10, 0, 0));

    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.clock.install({ time: frozenNow });
    await window.clock.pauseAt(frozenNow);
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    const preset = window.getByLabel('Time range', { exact: true });
    await preset.selectOption('1m');
    await expect(window.getByTestId('commit-node')).toHaveCount(2);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${calendarBoundary}"]`)
    ).toBeVisible();

    await preset.selectOption('5d');
    await expect(window.getByTestId('commit-node')).toHaveCount(1);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${calendarBoundary}"]`)
    ).toHaveCount(0);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${branchTip}"]`)
    ).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('custom date ranges include their start and end dates without including the next date', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
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
    execFileSync('git', ['config', 'user.name', 'Mergentra E2e'], { cwd: repositoryPath });
    execFileSync('git', ['config', 'user.email', 'mergentra-e2e@example.invalid'], {
      cwd: repositoryPath
    });
    const beforeRange = commitAt('Before range', new Date(2026, 4, 14, 23, 59, 59));
    const startBoundary = commitAt('Start boundary', new Date(2026, 4, 15, 0, 0, 0));
    const endBoundary = commitAt('End boundary', new Date(2026, 4, 15, 23, 59, 59));
    const afterRange = commitAt('After range', new Date(2026, 4, 16, 0, 0, 0));

    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await window.getByLabel('Time range', { exact: true }).selectOption('custom');
    await window.getByLabel('Start date').fill('2026-05-15');
    await window.getByLabel('End date').fill('2026-05-15');
    await window.getByRole('button', { name: 'Apply date range' }).click();

    await expect(window.getByTestId('commit-node')).toHaveCount(2);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${beforeRange}"]`)
    ).toHaveCount(0);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${startBoundary}"]`)
    ).toBeVisible();
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${endBoundary}"]`)
    ).toBeVisible();
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${afterRange}"]`)
    ).toHaveCount(0);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('history-edge compacted counts include only ordinary commits inside the selected range', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
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
    execFileSync('git', ['config', 'user.name', 'Mergentra E2e'], { cwd: repositoryPath });
    execFileSync('git', ['config', 'user.email', 'mergentra-e2e@example.invalid'], {
      cwd: repositoryPath
    });
    const outsideCommit = commitAt(
      'Outside range',
      new Date(frozenNow.getTime() - 30 * 60 * 60 * 1000)
    );
    const taggedEndpoint = commitAt(
      'In-range tagged endpoint',
      new Date(frozenNow.getTime() - 20 * 60 * 60 * 1000)
    );
    execFileSync('git', ['tag', 'in-range-anchor', taggedEndpoint], {
      cwd: repositoryPath,
      stdio: 'ignore'
    });
    const firstHiddenCommit = commitAt(
      'In-range ordinary one',
      new Date(frozenNow.getTime() - 12 * 60 * 60 * 1000)
    );
    const secondHiddenCommit = commitAt(
      'In-range ordinary two',
      new Date(frozenNow.getTime() - 8 * 60 * 60 * 1000)
    );
    const branchTip = commitAt(
      'In-range branch tip',
      new Date(frozenNow.getTime() - 2 * 60 * 60 * 1000)
    );

    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.clock.install({ time: frozenNow });
    await window.clock.pauseAt(frozenNow);
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await window.getByLabel('Time range', { exact: true }).selectOption('1d');

    await expect(window.getByTestId('commit-node')).toHaveCount(2);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${taggedEndpoint}"]`)
    ).toBeVisible();
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${branchTip}"]`)
    ).toBeVisible();
    await expect(window.getByTestId('compacted-commit-count')).toHaveAttribute('data-count', '2');
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${outsideCommit}"]`)
    ).toHaveCount(0);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${firstHiddenCommit}"]`)
    ).toHaveCount(0);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${secondHiddenCommit}"]`)
    ).toHaveCount(0);
    await expect(window.getByTestId('history-cut-marker')).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
