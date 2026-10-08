const { expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test.describe('recent repository list', () => {
  let testDirectory;
  let settingsFile;
  let app;
  let window;
  let recent;

  test.beforeEach(async () => {
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-recent-e2e-'));
    const userData = path.join(testDirectory, 'user-data');
    fs.mkdirSync(userData);
    settingsFile = path.join(userData, 'settings.json');
    fs.writeFileSync(
      settingsFile,
      JSON.stringify({
        gitPath: '',
        recentRepositories: [
          { path: path.join(testDirectory, 'alpha'), name: 'alpha' },
          { path: path.join(testDirectory, 'beta'), name: 'beta' }
        ]
      })
    );
    fs.mkdirSync(path.join(testDirectory, 'alpha'));
    app = await launchMergentra({
      args: [path.resolve(__dirname, '..')],
      env: { ...process.env, MERGENTRA_USER_DATA_DIR: userData }
    });
    window = await app.firstWindow();
    recent = window.getByRole('combobox', { name: 'Recent repositories' });
  });

  test.afterEach(async () => {
    await app.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
  });

  const saved = () => JSON.parse(fs.readFileSync(settingsFile, 'utf8')).recentRepositories;

  test('edit and delete are icon buttons that need a selected entry', async () => {
    const edit = window.getByRole('button', { name: 'Edit name' });
    const remove = window.getByRole('button', { name: 'Remove from recent list' });
    await expect(edit).toBeDisabled();
    await expect(remove).toBeDisabled();
    expect((await edit.boundingBox()).width).toBeLessThan(60);
    expect((await remove.boundingBox()).width).toBeLessThan(60);
    await expect(remove).toHaveText('');

    await recent.selectOption({ label: 'alpha' });
    await expect(edit).toBeEnabled();
    await expect(remove).toBeEnabled();
  });

  test('the list is wider than the folder row minus its buttons', async () => {
    const list = await recent.boundingBox();
    const folder = await window.getByLabel('Repository folder').boundingBox();
    expect(list.width).toBeGreaterThan(folder.width * 0.85);
  });

  test('renaming changes only the label shown, not the folder', async () => {
    await recent.selectOption({ label: 'alpha' });
    await window.getByRole('button', { name: 'Edit name' }).click();
    const name = window.getByRole('textbox', { name: 'Display name' });
    await expect(name).toHaveValue('alpha');
    await name.fill('Client A');
    await name.press('Enter');

    await expect(recent.locator('option', { hasText: 'Client A' })).toHaveCount(1);
    expect(saved()[0]).toMatchObject({ name: 'alpha', displayName: 'Client A' });
    expect(fs.existsSync(path.join(testDirectory, 'alpha'))).toBe(true);
  });

  test('Escape cancels a rename and a blank name restores the folder name', async () => {
    await recent.selectOption({ label: 'alpha' });
    await window.getByRole('button', { name: 'Edit name' }).click();
    const name = window.getByRole('textbox', { name: 'Display name' });
    await name.fill('Discarded');
    await name.press('Escape');
    await expect(name).toBeHidden();
    await expect(recent.locator('option', { hasText: 'Discarded' })).toHaveCount(0);

    await window.getByRole('button', { name: 'Edit name' }).click();
    await name.fill('Temp');
    await name.press('Enter');
    await recent.selectOption({ label: 'Temp' });
    await window.getByRole('button', { name: 'Edit name' }).click();
    await name.fill('');
    await name.press('Enter');
    await expect(recent.locator('option', { hasText: 'alpha' })).toHaveCount(1);
    expect(saved()[0].displayName).toBeUndefined();
  });

  test('removing asks for confirmation and never deletes the folder', async () => {
    await recent.selectOption({ label: 'alpha' });
    const remove = window.getByRole('button', { name: 'Remove from recent list' });

    let message = '';
    window.once('dialog', (dialog) => {
      message = dialog.message();
      dialog.dismiss();
    });
    await remove.click();
    await expect.poll(() => message).toContain('alpha');
    await expect(recent.locator('option')).toHaveCount(3);

    window.once('dialog', (dialog) => dialog.accept());
    await remove.click();
    await expect(recent.locator('option')).toHaveCount(2);
    expect(saved().map((entry) => entry.name)).toEqual(['beta']);
    expect(fs.existsSync(path.join(testDirectory, 'alpha'))).toBe(true);
  });
});
