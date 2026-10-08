const http = require('node:http');
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
    await expect(window.locator('.repository-header')).toContainText(`Path: ${repositoryPath}`);
    await expect(window.locator('.repository-header')).toContainText('Current Branch: main');
    await expect(window.locator('#branch-name')).toHaveText('main');
    await expect(window.getByRole('button', { name: 'Check for updates' })).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

async function withReleaseServer(respond, run) {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-update-e2e-'));
  const server = http.createServer((_request, response) => respond(response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let app;
  try {
    app = await launchMergentra({
      args: [path.resolve(__dirname, '..')],
      env: {
        ...process.env,
        MERGENTRA_USER_DATA_DIR: path.join(testDirectory, 'user-data'),
        MERGENTRA_UPDATE_API_URL: `http://127.0.0.1:${server.address().port}/`,
        MERGENTRA_UPDATE_CHECK_DELAY_MS: '600000'
      }
    });
    await run(await app.firstWindow());
  } finally {
    await app?.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
}

function releaseResponse(version) {
  return (response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        tag_name: `v${version}`,
        html_url: `https://github.com/dgooderi/Mergentra/releases/tag/v${version}`,
        draft: false,
        prerelease: false
      })
    );
  };
}

test('a manual update check links to a newer GitHub release without downloading it', async () => {
  await withReleaseServer(releaseResponse('1.0.0'), async (window) => {
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
    expect(window.url()).toContain('index.html');
  });
});

test('a manual update check reports when the installed version is current', async () => {
  const { version } = require('../package.json');
  await withReleaseServer(releaseResponse(version), async (window) => {
    await window.getByRole('button', { name: 'Settings' }).click();
    await window.getByRole('button', { name: 'Check for updates' }).click();
    await expect(window.locator('#update-status')).toContainText(
      `Mergentra is up to date (${version}).`
    );
    await expect(window.locator('#update-release-link')).toBeHidden();
  });
});

test('a failed update check explains the failure and can be retried', async () => {
  await withReleaseServer(
    (response) => {
      response.statusCode = 503;
      response.end('Unavailable');
    },
    async (window) => {
      await window.getByRole('button', { name: 'Settings' }).click();
      await window.getByRole('button', { name: 'Check for updates' }).click();
      await expect(window.locator('#update-status')).toContainText(
        'Could not check for updates: GitHub release check failed with HTTP 503.'
      );
      await expect(window.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
    }
  );
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
    window.once('dialog', (dialog) => dialog.accept());
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
