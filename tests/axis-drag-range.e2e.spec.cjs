const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

function createRepository(testDirectory) {
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  fs.mkdirSync(repositoryPath);
  const git = (args, date) =>
    execFileSync('git', args, {
      cwd: repositoryPath,
      stdio: 'ignore',
      env: date ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : process.env
    });
  git(['-c', 'init.defaultBranch=main', 'init']);
  git(['config', 'user.name', 'Mergentra E2e']);
  git(['config', 'user.email', 'mergentra-e2e@example.invalid']);
  fs.writeFileSync(path.join(repositoryPath, 'January.txt'), 'January');
  git(['add', '.']);
  git(['commit', '-m', 'January'], '2023-01-10T12:00:00');
  git(['checkout', '-b', 'feature']);
  fs.writeFileSync(path.join(repositoryPath, 'March.txt'), 'March');
  git(['add', '.']);
  git(['commit', '-m', 'March'], '2023-03-05T12:00:00');
  git(['checkout', 'main']);
  fs.writeFileSync(path.join(repositoryPath, 'June.txt'), 'June');
  git(['add', '.']);
  git(['commit', '-m', 'June'], '2023-06-20T12:00:00');
  return repositoryPath;
}

async function labelCentre(window, isoDate) {
  const timestamp = String(new Date(`${isoDate}T12:00:00`).getTime() / 1000);
  const label = window.locator(`[data-testid="time-axis-label"][data-timestamp="${timestamp}"]`);
  await label.scrollIntoViewIfNeeded();
  const box = await label.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('dragging across the time axis', () => {
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
    await window.locator('#time-range').selectOption('all');
    await expect(window.getByTestId('commit-node')).toHaveCount(3);
    console.log(
      'DBG',
      await window.getByTestId('commit-node').count(),
      await window.getByTestId('time-axis-label').allTextContents()
    );
  });

  test.afterEach(async () => {
    await app.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
  });

  test('selects a custom date range and zooms the graph to it', async () => {
    const first = await labelCentre(window, '2023-01-10');
    const second = await labelCentre(window, '2023-03-05');
    await window.mouse.move(first.x - 6, first.y);
    await window.mouse.down();
    await window.mouse.move((first.x + second.x) / 2, first.y, { steps: 5 });
    await expect(window.getByTestId('time-axis-selection')).toBeVisible();
    await window.mouse.move(second.x + 6, first.y, { steps: 5 });
    await window.mouse.up();

    await expect(window.locator('#time-range')).toHaveValue('custom');
    await expect(window.locator('#time-range-start')).toHaveValue('2023-01-10');
    await expect(window.locator('#time-range-end')).toHaveValue('2023-03-05');
    await expect(window.getByTestId('commit-node')).toHaveCount(2);
    await expect(window.getByTestId('time-axis-selection')).toHaveCount(0);
  });

  test('Escape cancels the selection and a plain click changes nothing', async () => {
    const first = await labelCentre(window, '2023-01-10');
    const second = await labelCentre(window, '2023-03-05');
    await window.mouse.move(first.x - 6, first.y);
    await window.mouse.down();
    await window.mouse.move(second.x + 6, first.y, { steps: 5 });
    await window.keyboard.press('Escape');
    await window.mouse.up();
    await expect(window.locator('#time-range')).toHaveValue('all');
    await expect(window.getByTestId('time-axis-selection')).toHaveCount(0);

    await window.mouse.click(first.x, first.y);
    await expect(window.locator('#time-range')).toHaveValue('all');
    await expect(window.getByTestId('commit-node')).toHaveCount(3);
  });
});
