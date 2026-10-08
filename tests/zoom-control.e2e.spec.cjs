const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test('the zoom percentage is a dropdown that also accepts a typed percentage', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  fs.mkdirSync(repositoryPath);
  const runGit = (args) => execFileSync('git', args, { cwd: repositoryPath, stdio: 'ignore' });
  runGit(['-c', 'init.defaultBranch=main', 'init']);
  runGit(['config', 'user.name', 'Mergentra E2e']);
  runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
  runGit(['commit', '--allow-empty', '-m', 'Initial commit']);

  let app;
  try {
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    const zoom = window.getByLabel('Zoom percentage');
    await expect(zoom).toHaveValue('100%');

    await window.getByRole('button', { name: 'Show zoom levels' }).click();
    const options = window.getByRole('listbox', { name: 'Zoom levels' }).getByRole('option');
    await expect(options.first()).toHaveText('Reset to 100%');
    await expect(options).toHaveCount(11);
    await window.getByRole('option', { name: '150%' }).click();
    await expect(zoom).toHaveValue('150%');
    await expect(options.first()).toBeHidden();

    await zoom.fill('175');
    await zoom.press('Enter');
    await expect(zoom).toHaveValue('175%');

    await zoom.fill('9999%');
    await zoom.press('Enter');
    await expect(zoom).toHaveValue('300%');
    await expect(window.getByRole('button', { name: 'Zoom in' })).toBeDisabled();

    await zoom.fill('nonsense');
    await zoom.press('Enter');
    await expect(zoom).toHaveValue('300%');

    await window.getByRole('button', { name: 'Show zoom levels' }).click();
    await window.getByRole('option', { name: 'Reset to 100%' }).click();
    await expect(zoom).toHaveValue('100%');
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
