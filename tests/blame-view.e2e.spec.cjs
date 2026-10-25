const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test('blame view attributes lines at the selected commit and links back to the graph', async () => {
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
  let app;

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init']);
    runGit(['config', 'core.autocrlf', 'false']);
    runGit(['config', 'user.name', 'Mergentra E2e']);
    runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
    fs.writeFileSync(path.join(repositoryPath, 'notes.txt'), 'alpha\nbeta\n');
    fs.writeFileSync(path.join(repositoryPath, 'logo.bin'), Buffer.from([1, 0, 2]));
    runGit(['add', '.']);
    runGit(['commit', '-m', 'Add notes']);
    const firstCommit = runGit(['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(repositoryPath, 'notes.txt'), 'alpha\nBETA\ngamma\n');
    runGit(['commit', '-am', 'Change beta']);
    const secondCommit = runGit(['rev-parse', 'HEAD']);

    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.getByTestId('commit-node')).toHaveCount(2);

    await window.locator(`[data-testid="commit-node"][data-commit-hash="${secondCommit}"]`).click();
    const dock = window.getByTestId('review-dock');
    await dock.getByTestId('blame-path').fill('notes.txt');
    await dock.getByTestId('blame-submit').click();

    await expect(dock.getByTestId('blame-caption')).toHaveText(
      `notes.txt at ${secondCommit.slice(0, 7)}`
    );
    const lines = dock.getByTestId('blame-line');
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(0)).toContainText('alpha');
    await expect(lines.nth(0)).toContainText('Add notes');
    await expect(lines.nth(1)).toContainText('BETA');
    await expect(lines.nth(1)).toContainText('Change beta');

    await dock.getByTestId('blame-commit-link').first().click();
    await expect(dock.getByTestId('selected-commit-hash')).toHaveText(firstCommit);

    await dock.getByTestId('blame-path').fill('logo.bin');
    await dock.getByTestId('blame-submit').click();
    await expect(dock.getByTestId('blame-status')).toHaveText(
      'logo.bin is a binary file, so line-by-line blame is not available.'
    );
    await expect(dock.getByTestId('blame-result')).toBeHidden();

    expect(runGit(['status', '--porcelain'])).toBe('');
    expect(runGit(['rev-parse', 'HEAD'])).toBe(secondCommit);
  } finally {
    await app?.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
