const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test('notes render a safe Markdown subset in preview and stay plain text when stored', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-markdown-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  fs.mkdirSync(repositoryPath);
  const git = (args) => execFileSync('git', args, { cwd: repositoryPath, stdio: 'ignore' });
  git(['-c', 'init.defaultBranch=main', 'init']);
  git(['config', 'user.name', 'Mergentra E2e']);
  git(['config', 'user.email', 'mergentra-e2e@example.invalid']);
  fs.writeFileSync(path.join(repositoryPath, 'a.txt'), 'a');
  git(['add', '.']);
  git(['commit', '-m', 'First']);
  const app = await launchMergentra(path.join(testDirectory, 'user-data'));

  try {
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await window.getByTestId('commit-node').first().click();

    const source = '**important**\n\n- one\n- two\n\n1. first\n2. second';
    const note = window.getByTestId('selected-commit-note');
    await note.fill(source);
    await window.getByRole('button', { name: 'Preview commit' }).click();

    const preview = window.getByTestId('selected-commit-note-preview');
    await expect(note).toBeHidden();
    await expect(preview.locator('strong')).toHaveText('important');
    await expect(preview.locator('ul > li')).toHaveText(['one', 'two']);
    await expect(preview.locator('ol > li')).toHaveText(['first', 'second']);

    await window.getByRole('button', { name: 'Edit commit' }).click();
    await expect(note).toBeVisible();
    await expect(note).toHaveValue(source);

    await note.fill(
      '<img src=x onerror="document.title=1"> <script>1</script> [a](javascript:1) # h'
    );
    await window.getByRole('button', { name: 'Preview commit' }).click();
    await expect(preview.locator('img, script, a, h1')).toHaveCount(0);
    await expect(preview).toContainText('<script>1</script>');
    await expect(preview).toContainText('[a](javascript:1)');

    await window.getByRole('button', { name: 'Edit commit' }).click();
    await note.fill('**b**');
    await window.getByLabel('Repository note').fill('line one\n- item');
    await expect(window.getByLabel('Repository note')).toHaveValue('line one\n- item');
    await window.getByRole('button', { name: 'Preview repository' }).click();
    await expect(window.getByTestId('repository-note-preview').locator('li')).toHaveText(['item']);
  } finally {
    await app.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('branch notes can be previewed and appear formatted in the Review dock', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-markdown-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  fs.mkdirSync(repositoryPath);
  const git = (args) => execFileSync('git', args, { cwd: repositoryPath, stdio: 'ignore' });
  git(['-c', 'init.defaultBranch=main', 'init']);
  git(['config', 'user.name', 'Mergentra E2e']);
  git(['config', 'user.email', 'mergentra-e2e@example.invalid']);
  fs.writeFileSync(path.join(repositoryPath, 'a.txt'), 'a');
  git(['add', '.']);
  git(['commit', '-m', 'First']);
  const app = await launchMergentra(path.join(testDirectory, 'user-data'));

  try {
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await window.locator('#branch-picker > summary').click();
    await window.getByRole('button', { name: 'Note for main', exact: true }).click();
    await window.getByLabel('Note text for main').fill('**careful**\n\n- a\n- b');
    await window.getByRole('button', { name: 'Preview main branch' }).click();
    await expect(window.getByTestId('branch-note-preview').locator('li')).toHaveText(['a', 'b']);

    await window.getByTestId('commit-node').first().click();
    const dockNote = window.getByTestId('selected-commit-branch-notes');
    await expect(dockNote.locator('strong')).toHaveText('careful');
    await expect(dockNote.locator('li li')).toHaveText(['a', 'b']);
  } finally {
    await app.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
