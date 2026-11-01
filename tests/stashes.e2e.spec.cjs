const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test('stashes are listed read-only, can be inspected, and are left untouched', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  fs.mkdirSync(repositoryPath);
  const runGit = (args) =>
    execFileSync('git', args, { cwd: repositoryPath, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  runGit(['-c', 'init.defaultBranch=main', 'init']);
  runGit(['config', 'user.name', 'Mergentra E2e']);
  runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
  fs.writeFileSync(path.join(repositoryPath, 'readme.txt'), 'v1');
  runGit(['add', '.']);
  runGit(['commit', '-m', 'Base']);
  const baseHash = runGit(['rev-parse', '--short', 'HEAD']);
  fs.writeFileSync(path.join(repositoryPath, 'readme.txt'), 'v2');
  runGit(['stash', 'push', '-m', 'half-done readme']);
  fs.writeFileSync(path.join(repositoryPath, 'scratch.txt'), 'notes');
  runGit(['stash', 'push', '--include-untracked', '-m', 'scratch notes']);
  const stashRefsBefore = runGit(['reflog', 'show', 'refs/stash']);

  let app;
  try {
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await window.locator('#tools-panel > summary').click();

    await expect(window.locator('#stashes-heading')).toHaveText('Stashes (2)');
    const entries = window.getByTestId('stash');
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toContainText('stash@{0}');
    await expect(entries.nth(0)).toContainText('scratch notes');
    await expect(entries.nth(0)).toContainText('On main');
    await expect(entries.nth(0)).toContainText(`Base ${baseHash}`);
    await expect(entries.nth(1)).toContainText('half-done readme');

    await entries.nth(0).getByRole('button').click();
    await expect(window.getByTestId('stash-change')).toHaveText(['A  scratch.txt']);
    await entries.nth(1).getByRole('button').click();
    await expect(window.getByTestId('stash-change')).toHaveText(['M  readme.txt']);

    expect(runGit(['reflog', 'show', 'refs/stash'])).toBe(stashRefsBefore);
    expect(fs.readFileSync(path.join(repositoryPath, 'readme.txt'), 'utf8')).toBe('v1');
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
