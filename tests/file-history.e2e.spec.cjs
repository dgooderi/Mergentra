const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

function createRepository(testDirectory) {
  const repositoryPath = path.join(testDirectory, 'history-repository');
  fs.mkdirSync(repositoryPath);
  const git = (...args) => execFileSync('git', args, { cwd: repositoryPath, stdio: 'ignore' });
  git('-c', 'init.defaultBranch=main', 'init');
  git('config', 'user.name', 'Mergentra E2e');
  git('config', 'user.email', 'mergentra-e2e@example.invalid');
  fs.writeFileSync(path.join(repositoryPath, 'old-name.txt'), 'one\ntwo\nthree\n');
  fs.writeFileSync(path.join(repositoryPath, 'other.txt'), 'other');
  git('add', '.');
  git('commit', '-m', 'create the file');
  git('mv', 'old-name.txt', 'new-name.txt');
  git('commit', '-m', 'rename the file');
  fs.writeFileSync(path.join(repositoryPath, 'other.txt'), 'changed');
  git('commit', '-am', 'change something else');
  return repositoryPath;
}

test.describe('file history', () => {
  let testDirectory;
  let app;
  let window;

  test.beforeEach(async () => {
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
    const repositoryPath = createRepository(testDirectory);
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await window.locator('#tools-panel > summary').click();
    await expect(window.getByTestId('commit-node')).toHaveCount(1);
  });

  test.afterEach(async () => {
    await app.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
  });

  test('highlights the commits that changed a path, selects one, and restores the full graph', async () => {
    await window.getByLabel('File or folder history').fill('new-name.txt');
    await window.getByRole('button', { name: 'Show history' }).click();

    await expect(window.getByTestId('file-history-commit')).toHaveCount(2);
    await expect(window.locator('[data-file-history="match"]')).toHaveCount(2);
    await expect(window.locator('[data-file-history="other"]')).toHaveCount(1);
    await expect(window.locator('#file-history-status')).toContainText(
      'Followed a rename: old-name.txt → new-name.txt.'
    );

    await window.getByTestId('file-history-commit').filter({ hasText: 'rename the file' }).click();
    await expect(window.getByTestId('selected-commit-message')).toHaveText('rename the file');

    await window.getByRole('button', { name: 'Clear' }).click();
    await expect(window.locator('[data-file-history]')).toHaveCount(0);
    await expect(window.getByTestId('commit-node')).toHaveCount(1);
  });

  test('explains a path that has no history and one that is not allowed', async () => {
    await window.getByLabel('File or folder history').fill('missing.txt');
    await window.getByRole('button', { name: 'Show history' }).click();
    await expect(window.locator('#file-history-status')).toContainText(
      'No commits in the loaded history changed "missing.txt"'
    );

    await window.getByLabel('File or folder history').fill('--output=x');
    await window.getByRole('button', { name: 'Show history' }).click();
    await expect(window.locator('#file-history-status')).toHaveText(
      'Enter a path inside the repository.'
    );
  });
});
