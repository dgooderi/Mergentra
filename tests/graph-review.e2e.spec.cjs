const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test('linear reference histories show their shared commit once and preserve parent order', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const remotePath = path.join(testDirectory, 'origin.git');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (cwd, args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  let app;

  try {
    runGit(testDirectory, ['init', '--bare', remotePath]);
    runGit(repositoryPath, ['-c', 'init.defaultBranch=main', 'init']);
    runGit(repositoryPath, ['config', 'user.name', 'Mergentra E2e']);
    runGit(repositoryPath, ['config', 'user.email', 'mergentra-e2e@example.invalid']);
    fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Base commit');
    runGit(repositoryPath, ['add', 'README.txt']);
    runGit(repositoryPath, ['commit', '-m', 'Base commit']);
    const baseCommit = runGit(repositoryPath, ['rev-parse', 'HEAD']);
    runGit(repositoryPath, ['branch', 'feature', baseCommit]);

    fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Tip commit');
    runGit(repositoryPath, ['commit', '-am', 'Tip commit']);
    const tipCommit = runGit(repositoryPath, ['rev-parse', 'HEAD']);
    runGit(repositoryPath, ['checkout', 'feature']);
    fs.writeFileSync(path.join(repositoryPath, 'feature.txt'), 'Feature commit');
    runGit(repositoryPath, ['add', 'feature.txt']);
    runGit(repositoryPath, ['commit', '-m', 'Feature commit']);
    const featureCommit = runGit(repositoryPath, ['rev-parse', 'HEAD']);
    runGit(repositoryPath, ['checkout', 'main']);
    runGit(repositoryPath, ['remote', 'add', 'origin', remotePath]);
    runGit(repositoryPath, ['push', 'origin', 'main', 'feature']);
    runGit(repositoryPath, ['fetch', 'origin']);

    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await expect(window.getByRole('heading', { name: 'Commit graph' })).toBeVisible();
    const commits = window.getByTestId('commit-node');
    await expect(commits).toHaveCount(3);
    await expect(commits.nth(0)).toHaveAttribute('data-commit-hash', baseCommit);
    const renderedHashes = [];
    for (let index = 0; index < (await commits.count()); index += 1) {
      renderedHashes.push(await commits.nth(index).getAttribute('data-commit-hash'));
    }
    expect(new Set(renderedHashes).size).toBe(3);
    expect(renderedHashes).toContain(tipCommit);
    expect(renderedHashes).toContain(featureCommit);
    await expect(window.getByTestId('commit-graph')).toHaveAttribute(
      'data-order',
      'parent-before-child'
    );
    const edges = window.getByTestId('commit-edge');
    await expect(edges).toHaveCount(2);
    const renderedIndex = new Map(renderedHashes.map((hash, index) => [hash, index]));
    for (let index = 0; index < (await edges.count()); index += 1) {
      const edge = edges.nth(index);
      const parentIndex = renderedIndex.get(await edge.getAttribute('data-parent-hash'));
      const childIndex = renderedIndex.get(await edge.getAttribute('data-child-hash'));
      expect(parentIndex).toBeLessThan(childIndex);
    }

    const lanes = window.getByTestId('reference-lane');
    await expect(lanes).toHaveCount(4);
    await expect(lanes.nth(0)).toHaveAttribute('data-ref-name', 'main');
    await expect(lanes.nth(0)).toHaveAttribute('data-remote', 'false');
    await expect(lanes.nth(1)).toHaveAttribute('data-ref-name', 'origin/main');
    await expect(lanes.nth(1)).toHaveAttribute('data-remote', 'true');
    await expect(lanes.nth(2)).toHaveAttribute('data-ref-name', 'feature');
    await expect(lanes.nth(3)).toHaveAttribute('data-ref-name', 'origin/feature');
    await expect(lanes.nth(0)).toHaveAttribute(
      'data-color',
      await lanes.nth(1).getAttribute('data-color')
    );
    await expect(lanes.nth(2)).toHaveAttribute(
      'data-color',
      await lanes.nth(3).getAttribute('data-color')
    );
    await expect(lanes.nth(1).locator('[data-testid="reference-lane-style"]')).toHaveAttribute(
      'stroke-dasharray',
      '6 4'
    );
    await expect(lanes.nth(3).locator('[data-testid="reference-lane-style"]')).toHaveAttribute(
      'stroke-dasharray',
      '6 4'
    );
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('merge commits and grouped tags are annotated in the commit graph', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (args) =>
    execFileSync('git', args, {
      cwd: repositoryPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  let app;

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init']);
    runGit(['config', 'user.name', 'Mergentra E2e']);
    runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
    fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Base commit');
    runGit(['add', 'README.txt']);
    runGit(['commit', '-m', 'Base commit']);
    const baseCommit = runGit(['rev-parse', 'HEAD']);

    runGit(['checkout', '-b', 'feature']);
    fs.writeFileSync(path.join(repositoryPath, 'feature.txt'), 'Feature commit');
    runGit(['add', 'feature.txt']);
    runGit(['commit', '-m', 'Feature commit']);
    const featureCommit = runGit(['rev-parse', 'HEAD']);

    runGit(['checkout', 'main']);
    fs.writeFileSync(path.join(repositoryPath, 'main.txt'), 'Main commit');
    runGit(['add', 'main.txt']);
    runGit(['commit', '-m', 'Main commit']);
    const mainCommit = runGit(['rev-parse', 'HEAD']);
    runGit(['merge', '--no-ff', 'feature', '-m', 'Merge feature']);
    const mergeCommit = runGit(['rev-parse', 'HEAD']);
    runGit(['tag', 'v1.0.0', mergeCommit]);
    runGit(['tag', 'release-candidate', mergeCommit]);

    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const mergeNode = window.locator(
      `[data-testid="commit-node"][data-commit-hash="${mergeCommit}"]`
    );
    await expect(mergeNode).toHaveAttribute('data-is-merge', 'true');
    await expect(mergeNode.locator('[data-testid="merge-node-shape"]')).toHaveAttribute(
      'data-shape',
      'diamond'
    );
    const mergeEdges = window.locator(
      `[data-testid="commit-edge"][data-child-hash="${mergeCommit}"]`
    );
    await expect(mergeEdges).toHaveCount(2);
    const mergeParents = [];
    for (let index = 0; index < (await mergeEdges.count()); index += 1) {
      await expect(mergeEdges.nth(index)).toHaveAttribute('marker-end', 'url(#commit-arrowhead)');
      mergeParents.push(await mergeEdges.nth(index).getAttribute('data-parent-hash'));
    }
    expect(new Set(mergeParents)).toEqual(new Set([featureCommit, mainCommit]));

    const mergeLine = window.locator(
      `[data-testid="commit-edge-hover"][data-child-hash="${mergeCommit}"][data-parent-hash="${featureCommit}"]`
    );
    await mergeLine.evaluate((path) =>
      path.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 300,
          clientY: 300
        })
      )
    );
    await window.getByRole('menuitem', { name: 'Focus on destination' }).click();
    await expect(mergeNode).toHaveAttribute('aria-pressed', 'true');
    await expect(window.locator('#graph-context-menu')).toHaveCount(0);

    const tags = mergeNode.getByTestId('commit-tag');
    await expect(tags).toHaveCount(2);
    await expect(tags.nth(0)).toHaveAttribute('data-tag-name', 'release-candidate');
    await expect(tags.nth(1)).toHaveAttribute('data-tag-name', 'v1.0.0');
    await expect(window.getByTestId('commit-node')).toHaveCount(4);
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${baseCommit}"]`)
    ).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('divergent branches show inferred markers at their first unique commits', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (args) =>
    execFileSync('git', args, {
      cwd: repositoryPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  let app;

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init']);
    runGit(['config', 'user.name', 'Mergentra E2e']);
    runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
    fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Shared ancestor');
    runGit(['add', 'README.txt']);
    runGit(['commit', '-m', 'Shared ancestor']);
    const sharedAncestor = runGit(['rev-parse', 'HEAD']);

    runGit(['checkout', '-b', 'feature']);
    fs.writeFileSync(path.join(repositoryPath, 'feature.txt'), 'First feature commit');
    runGit(['add', 'feature.txt']);
    runGit(['commit', '-m', 'First feature commit']);
    const featureCommit = runGit(['rev-parse', 'HEAD']);

    runGit(['checkout', 'main']);
    fs.writeFileSync(path.join(repositoryPath, 'main.txt'), 'First main commit');
    runGit(['add', 'main.txt']);
    runGit(['commit', '-m', 'First main commit']);
    const mainCommit = runGit(['rev-parse', 'HEAD']);

    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const marker = window.getByTestId('divergence-marker');
    await expect(marker).toHaveCount(1);
    await expect(marker).toHaveAttribute('data-inferred', 'true');
    await expect(marker).toHaveAttribute('data-branch-name', 'feature');
    await expect(marker).toHaveAttribute('data-ancestor-hash', sharedAncestor);
    await expect(marker).toHaveAttribute('data-commit-hash', featureCommit);
    await expect(marker).toContainText('Branch diverges: feature');
    await expect(
      window.locator(`[data-testid="commit-node"][data-commit-hash="${mainCommit}"]`)
    ).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('pointer and keyboard commit selection show the same Review dock details', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (args) =>
    execFileSync('git', args, {
      cwd: repositoryPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  let app;

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init']);
    runGit(['config', 'user.name', 'Fixture Author']);
    runGit(['config', 'user.email', 'fixture-author@example.invalid']);
    fs.writeFileSync(path.join(repositoryPath, 'README.txt'), 'Inspectable commit');
    runGit(['add', 'README.txt']);
    execFileSync('git', ['commit', '-m', 'Inspectable commit subject'], {
      cwd: repositoryPath,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2026-01-02T03:04:05+00:00',
        GIT_COMMITTER_DATE: '2026-01-02T03:04:05+00:00'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const commitHash = runGit(['rev-parse', 'HEAD']);
    const authorDate = runGit(['show', '-s', '--format=%aI', commitHash]);
    const author = runGit(['show', '-s', '--format=%an <%ae>', commitHash]);
    runGit(['branch', 'review-branch', commitHash]);
    runGit(['tag', 'review-tag', commitHash]);
    fs.writeFileSync(path.join(repositoryPath, 'next.txt'), 'Follow-up commit');
    runGit(['add', 'next.txt']);
    execFileSync('git', ['commit', '-m', 'Follow-up commit'], {
      cwd: repositoryPath,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2026-01-03T03:04:05+00:00',
        GIT_COMMITTER_DATE: '2026-01-03T03:04:05+00:00'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const childHash = runGit(['rev-parse', 'HEAD']);
    const childAuthorDate = runGit(['show', '-s', '--format=%aI', childHash]);

    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const commitNode = window.locator(
      `[data-testid="commit-node"][data-commit-hash="${commitHash}"]`
    );
    const childNode = window.locator(
      `[data-testid="commit-node"][data-commit-hash="${childHash}"]`
    );
    await childNode.focus();
    await window.keyboard.press('Enter');
    await expect(childNode).toHaveAttribute('aria-pressed', 'true');
    const dock = window.getByTestId('review-dock');
    await expect(dock).toBeVisible();
    await expect(dock.getByTestId('selected-commit-message')).toHaveText('Follow-up commit');
    await expect(dock.getByTestId('selected-commit-author')).toHaveText(author);
    await expect(dock.getByTestId('selected-commit-author-date')).toHaveText(childAuthorDate);
    await expect(dock.getByTestId('selected-commit-hash')).toHaveText(childHash);
    await expect(dock.getByTestId('selected-commit-parents')).toHaveText(commitHash);
    await expect(
      dock.getByTestId('selected-commit-references').getByText('main', { exact: true })
    ).toBeVisible();

    await commitNode.click({ timeout: 5_000 });
    await expect(commitNode).toHaveAttribute('aria-pressed', 'true');
    await expect(childNode).toHaveAttribute('aria-pressed', 'false');
    await expect(dock.getByTestId('selected-commit-message')).toHaveText(
      'Inspectable commit subject'
    );
    await expect(dock.getByTestId('selected-commit-author')).toHaveText(author);
    await expect(dock.getByTestId('selected-commit-author-date')).toHaveText(authorDate);
    await expect(dock.getByTestId('selected-commit-hash')).toHaveText(commitHash);
    await expect(dock.getByTestId('selected-commit-parents')).toHaveText('None (root commit)');
    await expect(
      dock.getByTestId('selected-commit-references').getByText('review-branch', { exact: true })
    ).toBeVisible();
    await expect(
      dock.getByTestId('selected-commit-references').getByText('review-tag', { exact: true })
    ).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Commit graph' })).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('reference filters retain shared history reachable from any enabled reference', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const remotePath = path.join(testDirectory, 'origin.git');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (cwd, args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  let app;

  try {
    runGit(testDirectory, ['init', '--bare', remotePath]);
    runGit(repositoryPath, ['-c', 'init.defaultBranch=main', 'init']);
    runGit(repositoryPath, ['config', 'user.name', 'Mergentra E2e']);
    runGit(repositoryPath, ['config', 'user.email', 'mergentra-e2e@example.invalid']);
    fs.writeFileSync(path.join(repositoryPath, 'shared.txt'), 'Shared ancestor');
    runGit(repositoryPath, ['add', 'shared.txt']);
    runGit(repositoryPath, ['commit', '-m', 'Shared ancestor']);
    const sharedCommit = runGit(repositoryPath, ['rev-parse', 'HEAD']);
    runGit(repositoryPath, ['branch', 'feature', sharedCommit]);

    fs.writeFileSync(path.join(repositoryPath, 'main.txt'), 'Main-only commit');
    runGit(repositoryPath, ['add', 'main.txt']);
    runGit(repositoryPath, ['commit', '-m', 'Main-only commit']);
    const mainCommit = runGit(repositoryPath, ['rev-parse', 'HEAD']);

    runGit(repositoryPath, ['checkout', 'feature']);
    fs.writeFileSync(path.join(repositoryPath, 'feature.txt'), 'Feature-only commit');
    runGit(repositoryPath, ['add', 'feature.txt']);
    runGit(repositoryPath, ['commit', '-m', 'Feature-only commit']);
    const featureCommit = runGit(repositoryPath, ['rev-parse', 'HEAD']);

    runGit(repositoryPath, ['remote', 'add', 'origin', remotePath]);
    runGit(repositoryPath, ['push', 'origin', 'main', 'feature']);
    runGit(repositoryPath, ['fetch', 'origin']);

    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    const commitNode = (hash) =>
      window.locator(`[data-testid="commit-node"][data-commit-hash="${hash}"]`);
    const graph = window.getByTestId('commit-graph');
    await window.locator('#branch-picker > summary').click();
    const localMain = window.getByRole('checkbox', { name: 'main', exact: true });
    const remoteMain = window.getByRole('checkbox', { name: 'origin/main', exact: true });
    const localFeature = window.getByRole('checkbox', { name: 'feature', exact: true });
    const remoteFeature = window.getByRole('checkbox', { name: 'origin/feature', exact: true });

    await expect(localMain).toBeChecked();
    await expect(remoteMain).toBeChecked();
    await expect(localFeature).toBeChecked();
    await expect(remoteFeature).toBeChecked();
    await expect(window.getByTestId('commit-node')).toHaveCount(3);
    await window.keyboard.press('Escape');
    await commitNode(sharedCommit).click();
    await window.locator('#branch-picker > summary').click();
    const reviewDock = window.getByTestId('review-dock');
    await expect(reviewDock.getByTestId('selected-commit-hash')).toHaveText(sharedCommit);

    await localMain.uncheck({ timeout: 5_000 });
    await expect(graph).toHaveAttribute('data-reference-count', '3');
    await expect(localMain).not.toBeChecked();
    await expect(commitNode(mainCommit)).toBeVisible();
    await expect(reviewDock).toBeVisible();

    await remoteMain.uncheck();
    await expect(graph).toHaveAttribute('data-reference-count', '2');
    await expect(commitNode(sharedCommit)).toBeVisible();
    await expect(commitNode(featureCommit)).toBeVisible();
    await expect(commitNode(mainCommit)).toHaveCount(0);
    await expect(reviewDock).toBeVisible();

    await localFeature.uncheck();
    await expect(graph).toHaveAttribute('data-reference-count', '1');
    await expect(commitNode(featureCommit)).toBeVisible();
    await expect(commitNode(sharedCommit)).toBeVisible();

    await remoteFeature.uncheck();
    await expect(graph).toHaveAttribute('data-reference-count', '0');
    await expect(window.getByTestId('commit-node')).toHaveCount(0);
    await expect(
      window.getByText('No references selected. Select a reference to show its history.')
    ).toBeVisible();
    await expect(reviewDock).toBeHidden();

    await localMain.check();
    await expect(graph).toHaveAttribute('data-reference-count', '1');
    await expect(commitNode(sharedCommit)).toBeVisible();
    await expect(commitNode(mainCommit)).toBeVisible();
    await expect(commitNode(featureCommit)).toHaveCount(0);
    expect(runGit(repositoryPath, ['rev-parse', 'refs/heads/main'])).toBe(mainCommit);
    expect(runGit(repositoryPath, ['rev-parse', 'refs/heads/feature'])).toBe(featureCommit);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
