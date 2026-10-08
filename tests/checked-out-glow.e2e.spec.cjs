const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

function createRepository(testDirectory) {
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  fs.mkdirSync(repositoryPath);
  const runGit = (args) =>
    execFileSync('git', args, {
      cwd: repositoryPath,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString();
  runGit(['-c', 'init.defaultBranch=main', 'init']);
  runGit(['config', 'user.name', 'Mergentra E2e']);
  runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
  runGit(['commit', '--allow-empty', '-m', 'Main one']);
  runGit(['checkout', '-b', 'feature']);
  runGit(['commit', '--allow-empty', '-m', 'Feature one']);
  runGit(['commit', '--allow-empty', '-m', 'Feature two']);
  return { repositoryPath, runGit };
}

async function open(window, repositoryPath) {
  await window.getByLabel('Repository folder').fill(repositoryPath);
  await window.getByRole('button', { name: 'Open repository' }).click();
  await expect(window.getByTestId('commit-graph')).toBeVisible();
}

test('the checked-out branch lane glows along its whole length', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const { repositoryPath, runGit } = createRepository(testDirectory);
  let app;
  try {
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    const window = await app.firstWindow();
    await open(window, repositoryPath);
    const featureTip = runGit(['rev-parse', 'HEAD']).trim();

    const glows = window.getByTestId('checked-out-lane-glow');
    await expect(glows).toHaveCount(1);
    await expect(glows.first()).toHaveAttribute('data-child-hash', featureTip);
    await expect(glows.first()).toHaveAttribute('pointer-events', 'none');
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('a detached HEAD has no glowing lane', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const { repositoryPath, runGit } = createRepository(testDirectory);
  runGit(['checkout', '--detach']);
  let app;
  try {
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    const window = await app.firstWindow();
    await open(window, repositoryPath);
    await expect(window.getByTestId('checked-out-lane-glow')).toHaveCount(0);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
