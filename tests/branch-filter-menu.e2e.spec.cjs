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

  test('opening a repository starts with no target branch selected', async () => {
    await expect(window.getByLabel('Target branch')).toHaveValue('');
  });

  test('branch colors can be customized from the Branches picker', async () => {
    const mainLane = window.locator('[data-testid="reference-lane"][data-ref-name="main"]');
    const color = mainLane.getByLabel('Color for main');
    const mainHash = await mainLane.getAttribute('data-target-hash');

    await color.evaluate((input) => {
      input.value = '#123456';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await expect(mainLane).toHaveAttribute('data-color', '#123456');
    await expect(mainLane.locator('[data-testid="reference-lane-style"]')).toHaveAttribute(
      'stroke',
      '#123456'
    );
    await expect(
      window
        .locator(`[data-testid="commit-node"][data-commit-hash="${mainHash}"]`)
        .locator('circle:not(.selection-ring)')
    ).toHaveAttribute('fill', '#123456');
  });

  test('a parent branch with no later commits gets a dotted continuation', async () => {
    const featureLane = window.locator(
      '[data-testid="reference-lane"][data-ref-name="feature"]'
    );
    const featureColor = await featureLane.getAttribute('data-color');
    const continuation = window.locator(
      '[data-testid="branch-continuation"][data-branch="feature"]'
    );

    await expect(continuation).toHaveAttribute('stroke', featureColor);
    await expect(continuation).toHaveAttribute('stroke-dasharray', '2 8');
  });

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

  test('a target view preserves the full repository branch colors', async () => {
    const nestedLane = window.locator('[data-testid="reference-lane"][data-ref-name="nested"]');
    const featureLane = window.locator('[data-testid="reference-lane"][data-ref-name="feature"]');
    const nestedHash = await nestedLane.getAttribute('data-target-hash');
    const featureHash = await featureLane.getAttribute('data-target-hash');
    const nestedColor = await nestedLane.getAttribute('data-color');
    const nestedNode = window.locator(
      `[data-testid="commit-node"][data-commit-hash="${nestedHash}"]`
    );
    const featureNode = window.locator(
      `[data-testid="commit-node"][data-commit-hash="${featureHash}"]`
    );
    const featureNodeColor = await featureNode
      .locator('circle:not(.selection-ring)')
      .getAttribute('fill');

    await expect(nestedNode.locator('circle:not(.selection-ring)')).toHaveAttribute(
      'fill',
      nestedColor
    );
    await window.getByLabel('Target branch').selectOption('nested');

    await expect(nestedNode.locator('circle:not(.selection-ring)')).toHaveAttribute(
      'fill',
      nestedColor
    );
    await expect(featureNode.locator('circle:not(.selection-ring)')).toHaveAttribute(
      'fill',
      featureNodeColor
    );
  });

  test('selecting a target shows its full parent chain through main', async () => {
    await window.getByLabel('Target branch').selectOption('nested');

    await expect(window.getByLabel('Target branch')).toHaveValue('nested');
    expect(await shownBranches()).toEqual(['feature', 'main', 'nested']);
    await expect(window.getByTestId('parent-branch-continuation')).toHaveCount(0);

    const edgePaths = await window
      .getByTestId('commit-edge')
      .evaluateAll((edges) => edges.map((edge) => edge.getAttribute('d')));
    expect(
      edgePaths.some((path) => /^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/.test(path))
    ).toBe(true);
    expect(edgePaths.some((path) => path.includes('C'))).toBe(true);
    await expect(window.getByTestId('commit-branch-label')).toHaveCount(0);
    await expect(window.getByTestId('commit-tag')).toHaveCount(0);
    await expect(window.getByTestId('note-marker')).toHaveCount(0);

    await window.getByLabel('Target branch').selectOption('');

    await expect(window.getByLabel('Target branch')).toHaveValue('');
    expect(await shownBranches()).toEqual(['feature', 'main', 'nested', 'other']);
    await expect(window.getByTestId('parent-branch-continuation')).toHaveCount(0);
  });
});

test('targeting a feature branched from main excludes an unrelated upgrade branch', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);
  const git = (...args) => execFileSync('git', args, { cwd: repositoryPath, stdio: 'ignore' });
  const commit = (file) => {
    fs.writeFileSync(path.join(repositoryPath, file), file);
    git('add', '.');
    git('commit', '-m', file);
  };
  let app;

  try {
    git('-c', 'init.defaultBranch=main', 'init');
    git('config', 'user.name', 'Mergentra E2e');
    git('config', 'user.email', 'mergentra-e2e@example.invalid');
    commit('initial');
    for (let index = 1; index <= 10; index += 1) {
      commit(`main-${index}`);
    }
    git('checkout', '-b', 'upgrade');
    for (let index = 1; index <= 10; index += 1) {
      commit(`upgrade-${index}`);
    }
    git('checkout', '-b', 'feature-1');
    for (let index = 1; index <= 5; index += 1) {
      commit(`feature-1-${index}`);
    }
    git('checkout', 'main');
    commit('main-integration-preparation');
    git('merge', '--no-ff', 'feature-1', '-m', 'merge-feature-1');
    git('checkout', 'upgrade');
    git('checkout', '-b', 'feature-2');
    for (let index = 1; index <= 5; index += 1) {
      commit(`feature-2-${index}`);
    }
    git('checkout', 'main');
    git('checkout', '-b', 'feature-3');
    for (let index = 1; index <= 4; index += 1) {
      commit(`feature-3-${index}`);
    }

    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await window.getByLabel('Target branch').selectOption('feature-3');

    const visibleBranches = await window
      .getByTestId('reference-lane')
      .evaluateAll((lanes) =>
        lanes
          .filter((lane) => lane.querySelector('input').checked)
          .map((lane) => lane.dataset.refName)
          .sort()
      );
    expect(visibleBranches).toEqual(['feature-3', 'main']);

    const mainColor = await window
      .locator('[data-testid="reference-lane"][data-ref-name="main"]')
      .getAttribute('data-color');
    const featureOneLane = window.locator(
      '[data-testid="reference-lane"][data-ref-name="feature-1"]'
    );
    const featureTwoHash = await window
      .locator('[data-testid="reference-lane"][data-ref-name="feature-2"]')
      .getAttribute('data-target-hash');
    const featureOneColor = await featureOneLane.getAttribute('data-color');
    const featureOneHash = await featureOneLane.getAttribute('data-target-hash');

    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${featureOneHash}"]`)
    ).toHaveCount(0);

    await window.getByLabel('Target branch').selectOption('feature-1');

    const featureOneVisibleBranches = await window
      .getByTestId('reference-lane')
      .evaluateAll((lanes) =>
        lanes
          .filter((lane) => lane.querySelector('input').checked)
          .map((lane) => lane.dataset.refName)
          .sort()
      );
    expect(featureOneVisibleBranches).toEqual(['feature-1', 'main', 'upgrade']);
      await expect(
        window.locator(`[data-testid="commit-node"][data-commit-hash="${featureTwoHash}"]`)
      ).toHaveCount(0);

      await expect(
      window
        .locator(`[data-testid="commit-node"][data-commit-hash="${featureOneHash}"]`)
        .locator('circle:not(.selection-ring)')
    ).toHaveAttribute('fill', featureOneColor);
    expect(featureOneColor).not.toBe(mainColor);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
