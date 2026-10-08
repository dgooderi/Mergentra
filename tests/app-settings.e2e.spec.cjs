const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test('a developer can open a local Git repository', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const invalidRepositoryPath = path.join(testDirectory, 'not-a-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);
  fs.mkdirSync(invalidRepositoryPath);

  const runGit = (args) =>
    execFileSync('git', args, {
      cwd: repositoryPath,
      stdio: 'ignore'
    });

  runGit(['-c', 'init.defaultBranch=main', 'init']);
  runGit(['config', 'user.name', 'Mergentra E2e']);
  runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
  fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Test repository');
  runGit(['add', 'README.txt']);
  runGit(['commit', '-m', 'Initial commit']);

  let app;

  try {
    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await expect(window.getByRole('heading', { name: 'Open a repository' })).toBeVisible();
    await window.getByRole('button', { name: 'Settings' }).click();
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
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-update-e2e-'));
  const userDataPath = path.join(testDirectory, 'user-data');
  let app;
  let releaseChecks = 0;

  try {
    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.route(
      'https://api.github.com/repos/dgooderi/Mergentra/releases/latest',
      async (route) => {
        releaseChecks += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tag_name: 'v1.0.0',
            html_url: 'https://github.com/dgooderi/Mergentra/releases/tag/v1.0.0',
            draft: false,
            prerelease: false
          })
        });
      }
    );

    await window.waitForTimeout(100);
    expect(releaseChecks).toBe(0);
    await window.getByRole('button', { name: 'Settings' }).click();
    await window.getByRole('button', { name: 'Check for updates' }).click();
    await expect(window.locator('#update-status')).toContainText('Mergentra 1.0.0 is available.');
    const releaseLink = window.getByRole('link', {
      name: 'View Mergentra 1.0.0 on GitHub Releases'
    });
    await expect(releaseLink).toHaveAttribute(
      'href',
      'https://github.com/dgooderi/Mergentra/releases/tag/v1.0.0'
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
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-update-e2e-'));
  let app;

  try {
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    const window = await app.firstWindow();
    await window.route(
      'https://api.github.com/repos/dgooderi/Mergentra/releases/latest',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tag_name: 'v0.9.0',
            html_url: 'https://github.com/dgooderi/Mergentra/releases/tag/v0.9.0',
            draft: false,
            prerelease: false
          })
        });
      }
    );
    await window.getByRole('button', { name: 'Settings' }).click();
    await window.getByRole('button', { name: 'Check for updates' }).click();
    await expect(window.locator('#update-status')).toContainText(
      'Mergentra is up to date (0.9.0).'
    );
    await expect(window.locator('#update-release-link')).toBeHidden();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('a failed update check explains the failure and can be retried', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-update-e2e-'));
  let app;

  try {
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    const window = await app.firstWindow();
    await window.route(
      'https://api.github.com/repos/dgooderi/Mergentra/releases/latest',
      async (route) => {
        await route.fulfill({ status: 503, body: 'Unavailable' });
      }
    );
    await window.getByRole('button', { name: 'Settings' }).click();
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
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (args) =>
    execFileSync('git', args, {
      cwd: repositoryPath,
      stdio: 'ignore'
    });
  runGit(['-c', 'init.defaultBranch=main', 'init']);
  runGit(['config', 'user.name', 'Mergentra E2e']);
  runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
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
      MERGENTRA_USER_DATA_DIR: userDataPath,
      PATH: `${path.join(systemRoot, 'System32')};${systemRoot}`
    }
  };
  let app;

  try {
    app = await launchMergentra(launchOptions);
    let window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.getByRole('alert')).toContainText('Git was not found on PATH');

    await window.getByRole('button', { name: 'Settings' }).click();
    await window.getByLabel('Git executable path').fill(gitPath);
    await window.getByRole('button', { name: 'Save Git path' }).click();
    await expect(window.getByText('Git path saved.')).toBeVisible();
    await app.close();

    app = await launchMergentra(launchOptions);
    window = await app.firstWindow();
    await window.getByRole('button', { name: 'Settings' }).click();
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

test('a recently opened repository can be reopened after restarting Mergentra', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (args) =>
    execFileSync('git', args, {
      cwd: repositoryPath,
      stdio: 'ignore'
    });
  runGit(['-c', 'init.defaultBranch=main', 'init']);
  runGit(['config', 'user.name', 'Mergentra E2e']);
  runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
  fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Test repository');
  runGit(['add', 'README.txt']);
  runGit(['commit', '-m', 'Initial commit']);

  const launchOptions = {
    args: [path.resolve(__dirname, '..')],
    env: { ...process.env, MERGENTRA_USER_DATA_DIR: userDataPath }
  };
  let app;

  try {
    app = await launchMergentra(launchOptions);
    let window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.getByRole('heading', { name: 'sample-repository' })).toBeVisible();
    await window.getByLabel('Repository note').fill('Project X');
    await app.close();

    app = await launchMergentra(launchOptions);
    window = await app.firstWindow();
    const recent = window.getByRole('combobox', { name: 'Recent repositories' });
    const entry = recent.locator('option', { hasText: 'sample-repository' });
    await expect(entry).toContainText('Project X');
    await expect(entry).not.toContainText(repositoryPath);
    await expect(entry).toHaveAttribute('title', repositoryPath);
    await expect(window.getByRole('button', { name: 'Open in Explorer' })).toBeHidden();

    await recent.selectOption({ index: 1 });
    await expect(window.getByLabel('Repository folder')).toHaveValue(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.getByRole('heading', { name: 'sample-repository' })).toBeVisible();
    await expect(window.locator('#branch-name')).toHaveText('main');

    await window.getByRole('button', { name: 'Open another repository' }).click();
    await recent.selectOption({ index: 1 });
    await window.getByRole('button', { name: 'Remove from recent list' }).click();
    await expect(recent.locator('option')).toHaveCount(1);
    await expect(window.getByRole('button', { name: 'Remove from recent list' })).toBeDisabled();
    expect(fs.existsSync(repositoryPath)).toBe(true);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('dark mode is the default and light mode can be selected', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  let app;

  try {
    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    const root = window.locator('html');
    await expect(root).not.toHaveAttribute('data-theme', 'light');
    await expect(window.getByRole('button', { name: 'Light mode' })).toBeHidden();

    await window.getByRole('button', { name: 'Settings' }).click();
    await window.getByRole('button', { name: 'Light mode' }).click();
    await expect(root).toHaveAttribute('data-theme', 'light');

    await window.getByRole('button', { name: 'Dark mode' }).click();
    await expect(root).toHaveAttribute('data-theme', 'dark');
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});

test('the default directory setting is saved, survives a restart and flags a missing folder', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-default-dir-e2e-'));
  const userDataPath = path.join(testDirectory, 'user-data');
  const repositoriesFolder = path.join(testDirectory, 'repositories');
  fs.mkdirSync(repositoriesFolder);
  let app;

  try {
    app = await launchMergentra(userDataPath);
    let window = await app.firstWindow();
    await window.getByRole('button', { name: 'Settings' }).click();
    await window.getByLabel('Default directory').fill(path.join(testDirectory, 'missing'));
    await window.getByRole('button', { name: 'Save default directory' }).click();
    await expect(window.locator('#default-directory-status')).toContainText(
      'That folder does not exist.'
    );

    await window.getByLabel('Default directory').fill(repositoriesFolder);
    await window.getByRole('button', { name: 'Save default directory' }).click();
    await expect(window.locator('#default-directory-status')).toHaveText(
      'Default directory saved.'
    );
    await app.close();

    app = await launchMergentra(userDataPath);
    window = await app.firstWindow();
    await window.getByRole('button', { name: 'Settings' }).click();
    await expect(window.getByLabel('Default directory')).toHaveValue(repositoriesFolder);
    await app.close();

    fs.rmSync(repositoriesFolder, { recursive: true });
    app = await launchMergentra(userDataPath);
    window = await app.firstWindow();
    await window.getByRole('button', { name: 'Settings' }).click();
    await expect(window.locator('#default-directory-status')).toContainText('no longer exists');

    await window.getByLabel('Default directory').fill('');
    await window.getByRole('button', { name: 'Save default directory' }).click();
    await expect(window.locator('#default-directory-status')).toHaveText(
      'Default directory cleared.'
    );
  } finally {
    if (app) {
      await app.close().catch(() => {});
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('settings is a cog icon button with an accessible name', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  let app;

  try {
    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    const settings = window.getByRole('button', { name: 'Settings' });
    await expect(settings).toHaveText('');
    await expect(settings.locator('svg')).toHaveCount(1);
    await expect(settings).toHaveAttribute('title', 'Settings');
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});
