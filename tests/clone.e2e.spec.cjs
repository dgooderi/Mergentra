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

function createBareRepository(testDirectory) {
  const sourcePath = path.join(testDirectory, 'source');
  const barePath = path.join(testDirectory, 'remote.git');
  fs.mkdirSync(sourcePath);
  const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: 'ignore' });
  git(sourcePath, ['-c', 'init.defaultBranch=main', 'init']);
  git(sourcePath, ['config', 'user.name', 'Mergentra E2e']);
  git(sourcePath, ['config', 'user.email', 'mergentra-e2e@example.invalid']);
  fs.writeFileSync(path.join(sourcePath, 'a.txt'), 'a');
  git(sourcePath, ['add', '.']);
  git(sourcePath, ['commit', '-m', 'First']);
  fs.writeFileSync(path.join(sourcePath, 'b.txt'), 'b');
  git(sourcePath, ['add', '.']);
  git(sourcePath, ['commit', '-m', 'Second']);
  git(testDirectory, ['clone', '--bare', sourcePath, barePath]);
  git(barePath, ['--git-dir=.', 'config', 'uploadpack.allowFilter', 'true']);
  return pathToFileURL(barePath).href;
}

test.describe('clone repository', () => {
  let testDirectory;
  let app;
  let window;
  let remoteUrl;

  test.beforeEach(async () => {
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-clone-e2e-'));
    remoteUrl = createBareRepository(testDirectory);
    app = await launchMergentra({
      args: [path.resolve(__dirname, '..')],
      env: {
        ...process.env,
        MERGENTRA_USER_DATA_DIR: path.join(testDirectory, 'user-data'),
        MERGENTRA_ALLOW_LOCAL_CLONE: '1'
      }
    });
    window = await app.firstWindow();
  });

  test.afterEach(async () => {
    await app.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
  });

  test('clones a repository, opens it and adds it to the recent list', async () => {
    const destination = path.join(testDirectory, 'cloned');
    await expect(window.getByLabel('History only')).not.toBeChecked();
    await expect(window.getByRole('button', { name: 'Cancel clone' })).toBeHidden();
    await window.getByLabel('Repository URL').fill(remoteUrl);
    await window.getByLabel('Clone destination folder').fill(destination);
    await window.getByRole('button', { name: 'Clone repository' }).click();

    await expect(window.locator('#repository-name')).toHaveText('cloned');
    await expect(window.getByTestId('commit-node')).toHaveCount(2);
    await expect(window.locator('#repository-path-value')).toHaveText(destination);
    expect(fs.existsSync(path.join(destination, 'b.txt'))).toBe(true);

    await window.getByRole('button', { name: 'Open another repository' }).click();
    await expect(window.locator('#recent-repositories option')).toContainText([
      'Choose a recent repository\u2026',
      'cloned'
    ]);
  });

  test('history only makes a partial clone', async () => {
    const destination = path.join(testDirectory, 'partial');
    await window.getByLabel('Repository URL').fill(remoteUrl);
    await window.getByLabel('Clone destination folder').fill(destination);
    await window.getByLabel('History only').check();
    await window.getByRole('button', { name: 'Clone repository' }).click();
    await expect(window.locator('#repository-name')).toHaveText('partial');
    const filter = execFileSync('git', ['config', 'remote.origin.partialclonefilter'], {
      cwd: destination,
      encoding: 'utf8'
    });
    expect(filter.trim()).toBe('blob:none');
  });

  test('rejects unsafe URLs and non-empty destinations with a clear message', async () => {
    const destination = path.join(testDirectory, 'target');
    const status = window.locator('#clone-status');
    await window.getByLabel('Clone destination folder').fill(destination);

    for (const [url, message] of [
      ['--upload-pack=calc', 'option'],
      ['ext::calc', 'HTTPS or SSH'],
      ['', 'Enter a repository URL']
    ]) {
      await window.getByLabel('Repository URL').fill(url);
      await window.getByRole('button', { name: 'Clone repository' }).click();
      await expect(status).toContainText(message);
    }
    expect(fs.existsSync(destination)).toBe(false);

    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, 'keep.txt'), 'keep');
    await window.getByLabel('Repository URL').fill(remoteUrl);
    await window.getByRole('button', { name: 'Clone repository' }).click();
    await expect(status).toContainText('not empty');
    expect(fs.readdirSync(destination)).toEqual(['keep.txt']);
  });

  test('a failed clone shows a copyable diagnostic and removes the folder', async () => {
    const destination = path.join(testDirectory, 'failed');
    await window
      .getByLabel('Repository URL')
      .fill(pathToFileURL(path.join(testDirectory, 'nope.git')).href);
    await window.getByLabel('Clone destination folder').fill(destination);
    await window.getByRole('button', { name: 'Clone repository' }).click();
    await expect(window.locator('#clone-status')).toContainText('Clone failed');
    await expect(window.locator('#clone-diagnostics')).not.toBeEmpty();
    await expect(window.getByRole('button', { name: 'Copy clone diagnostics' })).toBeVisible();
    expect(fs.existsSync(destination)).toBe(false);
  });
});
