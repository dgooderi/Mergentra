const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

function createRepository(testDirectory) {
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  fs.mkdirSync(repositoryPath);
  const git = (...args) => execFileSync('git', args, { cwd: repositoryPath, stdio: 'ignore' });
  const commit = (file) => {
    fs.writeFileSync(path.join(repositoryPath, file), file);
    git('add', '.');
    git('commit', '-m', file);
  };
  git('-c', 'init.defaultBranch=main', 'init');
  git('config', 'user.name', 'Mergentra E2e');
  git('config', 'user.email', 'mergentra-e2e@example.invalid');
  commit('base');
  git('checkout', '-b', 'feature');
  commit('feature-work');
  git('checkout', '-b', 'nested');
  commit('nested-work');
  git('checkout', 'main');
  git('checkout', '-b', 'other');
  commit('other-work');
  git('checkout', 'main');
  commit('main-work');
  return repositoryPath;
}

test.describe('branch filters in the commit context menu', () => {
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
    await expect(window.getByTestId('reference-lane')).toHaveCount(4);
  });

  test.afterEach(async () => {
    await app.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
  });

  const shownBranches = async () =>
    window.getByTestId('reference-lane').evaluateAll((lanes) =>
      lanes
        .filter((lane) => lane.querySelector('input').checked)
        .map((lane) => lane.dataset.refName)
        .sort()
    );

  const chooseFromNodeMenu = async (branch, label) => {
    await window
      .locator(`[data-testid="commit-node"][data-ref-names*="${branch}"]`)
      .first()
      .click({ button: 'right' });
    await window.getByRole('menuitem', { name: label }).click();
  };

  test('filter to all branches from main to the selected node', async () => {
    await chooseFromNodeMenu('nested', 'Show branches from main to here');
    expect(await shownBranches()).toEqual(['feature', 'main', 'nested']);
  });

  test('filter to the selected branch and its parent', async () => {
    await chooseFromNodeMenu('nested', 'Show this branch and its parent');
    expect(await shownBranches()).toEqual(['feature', 'nested']);
  });

  test('All branches restores the full set', async () => {
    await chooseFromNodeMenu('nested', 'Show this branch and its parent');
    await window.locator('#branch-picker-summary').click();
    await window.locator('#branch-picker-all').click();
    expect(await shownBranches()).toEqual(['feature', 'main', 'nested', 'other']);
  });
});
