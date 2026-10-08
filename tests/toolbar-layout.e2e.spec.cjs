const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

async function openSampleRepository(use) {
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
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    await expect(window.getByRole('heading', { name: 'sample-repository' })).toBeVisible();
    await use(window);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
}

const box = async (locator) => await locator.boundingBox();

test('toolbar buttons share one height, including Branches and Display', async () => {
  await openSampleRepository(async (window) => {
    const toolbar = window.locator('.fetch-controls');
    const heights = [];
    for (const locator of [
      toolbar.getByRole('button', { name: 'Fetch' }),
      toolbar.locator('#branch-picker-summary'),
      toolbar.locator('.display-menu > summary'),
      window.locator('#time-earlier'),
      window.locator('#time-centre'),
      window.locator('#change-repository')
    ]) {
      heights.push(Math.round((await box(locator)).height));
    }
    expect(new Set(heights).size, `heights: ${heights}`).toBe(1);
  });
});

test('neighbouring toolbar controls are separated by the same gap', async () => {
  await openSampleRepository(async (window) => {
    const gaps = async (selectors) => {
      const boxes = [];
      for (const selector of selectors) {
        boxes.push(await box(window.locator(selector)));
      }
      return boxes.slice(1).map((next, index) => {
        const previous = boxes[index];
        return Math.round(next.x - (previous.x + previous.width));
      });
    };
    const appGaps = await gaps(['#open-explorer', '#change-repository', '#open-settings']);
    const navigationGaps = await gaps(['#time-earlier', '#time-later', '#time-centre']);
    const rowGaps = await gaps(['#fetch-button', '#branch-picker', '.time-controls']);
    const all = [...appGaps, ...navigationGaps, ...rowGaps];
    expect(new Set(all).size, `gaps: ${all}`).toBe(1);
  });
});

test('disabled buttons look disabled', async () => {
  await openSampleRepository(async (window) => {
    const earlier = window.locator('#time-earlier');
    await expect(earlier).toBeDisabled();
    const style = await earlier.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { cursor: computed.cursor, opacity: Number(computed.opacity) };
    });
    expect(style.cursor).toBe('not-allowed');
    expect(style.opacity).toBeLessThan(0.7);
  });
});

test('the zoom controls have space above the commit graph', async () => {
  await openSampleRepository(async (window) => {
    const zoom = await box(window.locator('.zoom-controls'));
    const graph = await box(window.locator('.graph-scroll'));
    expect(graph.y - (zoom.y + zoom.height)).toBeGreaterThanOrEqual(8);
  });
});
