const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test('selected commits show their changed files, text diffs and comparisons without touching the repository', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'diff-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);
  const runGit = (args) =>
    execFileSync('git', args, { cwd: repositoryPath, encoding: 'utf8' }).trim();
  let app;

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init']);
    runGit(['config', 'user.name', 'Mergentra E2e']);
    runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
    runGit(['config', 'core.autocrlf', 'false']);
    fs.writeFileSync(path.join(repositoryPath, 'notes.txt'), 'first line\n');
    runGit(['add', 'notes.txt']);
    runGit(['commit', '-m', 'First commit']);
    const firstCommit = runGit(['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(repositoryPath, 'notes.txt'), 'first line\nsecond line\n');
    fs.writeFileSync(path.join(repositoryPath, 'logo.bin'), Buffer.from([0, 1, 2, 0, 255]));
    runGit(['add', '-A']);
    runGit(['commit', '-m', 'Second commit']);
    const secondCommit = runGit(['rev-parse', 'HEAD']);
    const repositoryStateBefore = runGit(['status', '--porcelain=v1', '--branch']);

    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.getByTestId('commit-node')).toHaveCount(2);

    await window.locator(`[data-testid="commit-node"][data-commit-hash="${secondCommit}"]`).click();
    await window.getByTestId('view-changes').click();
    await expect(window.getByTestId('diff-summary')).toHaveText('2 files changed, +1 −0, 1 binary');
    await expect(window.getByTestId('diff-file')).toHaveCount(2);

    await window.locator('[data-testid="diff-file"][data-path="notes.txt"]').click();
    await expect(window.getByTestId('diff-patch')).toContainText('+second line');
    await window.locator('[data-testid="diff-file"][data-path="logo.bin"]').click();
    await expect(window.getByTestId('diff-file-note')).toContainText('binary file');
    await expect(window.getByTestId('diff-patch')).toHaveText('');

    await window.getByTestId('compare-commit').click();
    await window.locator(`[data-testid="commit-node"][data-commit-hash="${firstCommit}"]`).click();
    await expect(window.getByTestId('diff-status')).toContainText(
      `Changes from ${secondCommit.slice(0, 7)} to ${firstCommit.slice(0, 7)}`
    );
    await expect(window.getByTestId('diff-file')).toHaveCount(2);
    await window.locator('[data-testid="diff-file"][data-path="notes.txt"]').click();
    await expect(window.getByTestId('diff-patch')).toContainText('-second line');

    expect(runGit(['status', '--porcelain=v1', '--branch'])).toBe(repositoryStateBefore);
    expect(runGit(['rev-parse', 'HEAD'])).toBe(secondCommit);
  } finally {
    await app?.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
