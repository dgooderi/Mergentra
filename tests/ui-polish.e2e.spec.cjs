const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

async function withApp(callback, { openRepository = true } = {}) {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  fs.mkdirSync(repositoryPath);
  const runGit = (args) => execFileSync('git', args, { cwd: repositoryPath, stdio: 'ignore' });
  runGit(['-c', 'init.defaultBranch=main', 'init']);
  runGit(['config', 'user.name', 'Mergentra E2e']);
  runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
  fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Test repository');
  runGit(['add', 'README.txt']);
  runGit(['commit', '-m', 'Initial commit']);

  let app;
  try {
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    const window = await app.firstWindow();
    if (openRepository) {
      await window.getByLabel('Repository folder').fill(repositoryPath);
      await window.getByRole('button', { name: 'Open repository' }).click();
      await expect(window.getByRole('heading', { name: 'sample-repository' })).toBeVisible();
    }
    await callback(window);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
}

test('Current Branch sits directly under Path, left aligned', async () => {
  await withApp(async (window) => {
    const path = await window.locator('.repository-path').boundingBox();
    const branch = await window.locator('.repository-header .branch-label').boundingBox();
    expect(branch.y).toBeGreaterThanOrEqual(path.y + path.height - 1);
    expect(branch.y - (path.y + path.height)).toBeLessThan(8);
    expect(Math.abs(branch.x - path.x)).toBeLessThan(1);
  });
});

test('note Preview button sits to the right of the note', async () => {
  await withApp(async (window) => {
    const note = await window.locator('#repository-note').boundingBox();
    const toggle = await window
      .locator('.repository-header .markdown-note .note-view-toggle')
      .boundingBox();
    expect(toggle.x).toBeGreaterThanOrEqual(note.x + note.width - 1);
  });
});

test('note is at least three lines tall in edit and preview modes', async () => {
  await withApp(async (window) => {
    const lineHeight = await window
      .locator('#repository-note')
      .evaluate((element) => parseFloat(getComputedStyle(element).lineHeight) || 16);
    const editor = await window.locator('#repository-note').boundingBox();
    expect(editor.height).toBeGreaterThanOrEqual(lineHeight * 3);
    await window.locator('.repository-header .markdown-note .note-view-toggle').click();
    const preview = await window.locator('.repository-header .note-preview').boundingBox();
    expect(preview.height).toBeGreaterThanOrEqual(lineHeight * 3);
    expect(Math.abs(preview.height - editor.height)).toBeLessThan(4);
  });
});
