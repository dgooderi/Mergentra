const {
  execFileSync,
  expect,
  fs,
  launchMergentra,
  os,
  path,
  pathToFileURL,
  test
} = require('./e2e-helpers.cjs');

test('selecting a shallow boundary explains the missing ancestry without fetching', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-boundary-e2e-'));
  const sourcePath = path.join(testDirectory, 'source');
  const repositoryPath = path.join(testDirectory, 'shallow');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(sourcePath);
  let app;

  const runGit = (cwd, args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();

  try {
    runGit(sourcePath, ['init', '--initial-branch=main']);
    runGit(sourcePath, ['config', 'user.name', 'Mergentra E2e']);
    runGit(sourcePath, ['config', 'user.email', 'mergentra-e2e@example.invalid']);
    fs.writeFileSync(path.join(sourcePath, 'history.txt'), 'first commit');
    runGit(sourcePath, ['add', 'history.txt']);
    runGit(sourcePath, ['commit', '-m', 'First commit']);
    fs.writeFileSync(path.join(sourcePath, 'history.txt'), 'second commit');
    runGit(sourcePath, ['commit', '-am', 'Second commit']);
    runGit(testDirectory, ['clone', '--depth=1', pathToFileURL(sourcePath).href, repositoryPath]);

    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const marker = window.locator('[data-testid="history-boundary"][data-boundary-type="shallow"]');
    await expect(marker).toHaveText('Shallow boundary');
    await marker.click();
    await expect(window.locator('#boundary-explanation')).toContainText(
      'Its parent history was intentionally left out of this clone.'
    );
    await expect(window.locator('#boundary-next-steps')).toContainText('git fetch --unshallow');
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
