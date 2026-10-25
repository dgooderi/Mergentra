const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test('fetch guard decisions are listed in Settings without config values, and can be cleared', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'untrusted-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  let app;

  const runGit = (cwd, args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();

  try {
    runGit(testDirectory, ['init', '--initial-branch=main', repositoryPath]);
    runGit(repositoryPath, ['config', 'user.name', 'Mergentra E2e']);
    runGit(repositoryPath, ['config', 'user.email', 'mergentra-e2e@example.invalid']);
    runGit(repositoryPath, ['commit', '--allow-empty', '-m', 'Initial commit']);
    runGit(repositoryPath, ['remote', 'add', 'origin', 'ssh://git@example.invalid/repo.git']);
    runGit(repositoryPath, ['config', 'core.sshCommand', 'echo SECRETVALUE42']);

    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 0 });
    });
    await window.getByRole('button', { name: 'Fetch' }).click();
    await expect(window.locator('#fetch-status')).toContainText('Fetch blocked');
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 });
    });
    await window.getByRole('button', { name: 'Fetch' }).click();
    await expect(window.locator('#fetch-status')).toContainText('Fetch failed');

    await window.getByRole('button', { name: 'Settings' }).click();
    await window.getByText('Fetch guard log', { exact: true }).click();
    const entries = window.locator('#fetch-guard-log-entries li');
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toContainText('fetched-anyway');
    await expect(entries.nth(0)).toContainText('core.sshcommand');
    await expect(entries.nth(0)).toContainText(repositoryPath);
    await expect(entries.nth(1)).toContainText('cancelled');
    await expect(window.locator('#fetch-guard-log-entries')).not.toContainText('SECRETVALUE42');
    expect(fs.readFileSync(path.join(userDataPath, 'fetch-guard-log.json'), 'utf8')).not.toContain(
      'SECRETVALUE42'
    );

    await window.getByRole('button', { name: 'Clear log' }).click();
    await expect(entries).toHaveCount(0);
    await expect(window.locator('#fetch-guard-log-status')).toContainText('No fetch guard events');

    // An unreadable log is reported, yet the guard still blocks the fetch.
    const logPath = path.join(userDataPath, 'fetch-guard-log.json');
    fs.rmSync(logPath);
    fs.mkdirSync(logPath);
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 0 });
    });
    await window.getByRole('button', { name: 'Fetch' }).click();
    await expect(window.locator('#fetch-status')).toContainText('Fetch blocked');
    await expect(window.locator('#fetch-audit-status')).toContainText(
      'fetch guard log could not be read'
    );
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
