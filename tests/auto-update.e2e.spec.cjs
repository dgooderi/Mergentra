const { expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');
const http = require('node:http');

let app;
let server;
let requests;
let userDataPath;

function releaseJson() {
  const asset = (suffix) => ({
    name: `Mergentra-99.0.0-${suffix}`,
    size: 1,
    browser_download_url: `https://github.com/dgooderi/Mergentra/releases/download/v99.0.0/Mergentra-99.0.0-${suffix}`
  });
  return {
    tag_name: 'v99.0.0',
    html_url: 'https://github.com/dgooderi/Mergentra/releases/tag/v99.0.0',
    draft: false,
    prerelease: false,
    body: 'Notes',
    assets: [asset('Setup.exe'), asset('Portable.exe'), asset('x64.msi')]
  };
}

test.beforeEach(async () => {
  requests = 0;
  server = http.createServer((_request, response) => {
    requests += 1;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(releaseJson()));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-auto-update-'));
});

test.afterEach(async () => {
  await app?.close();
  app = undefined;
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(userDataPath, { recursive: true, force: true });
});

function launch(extraEnv = {}) {
  return launchMergentra({
    args: [path.resolve(__dirname, '..')],
    env: {
      ...process.env,
      MERGENTRA_USER_DATA_DIR: userDataPath,
      MERGENTRA_UPDATE_API_URL: `http://127.0.0.1:${server.address().port}/`,
      MERGENTRA_UPDATE_CHECK_DELAY_MS: '1500',
      ...extraEnv
    }
  });
}

function readSettings() {
  return JSON.parse(fs.readFileSync(path.join(userDataPath, 'settings.json'), 'utf8'));
}

async function answerDialogWith(electronApp, buttonLabel, checkboxChecked = false) {
  await electronApp.evaluate(
    ({ dialog }, { label, checked }) => {
      globalThis.updateDialogs = [];
      dialog.showMessageBox = async (_window, options) => {
        globalThis.updateDialogs.push(options);
        return { response: options.buttons.indexOf(label), checkboxChecked: checked };
      };
    },
    { label: buttonLabel, checked: checkboxChecked }
  );
}

const shownDialogs = (electronApp) => electronApp.evaluate(() => globalThis.updateDialogs);

test('a weekly check offers a newer release and Skip this version is remembered', async () => {
  app = await launch();
  await answerDialogWith(app, 'Skip this version');
  await expect.poll(async () => (await shownDialogs(app)).length).toBe(1);

  const [dialogOptions] = await shownDialogs(app);
  expect(dialogOptions.message).toBe('Mergentra 99.0.0 is available');
  expect(dialogOptions.buttons).toEqual([
    'Download and install',
    'Download',
    'Release notes',
    'Skip this version',
    'Remind me later'
  ]);
  expect(dialogOptions.checkboxLabel).toBe("Don't check for updates automatically");
  await expect.poll(() => readSettings().skippedVersion).toBe('99.0.0');
  expect(readSettings().lastUpdateCheck).toBeGreaterThan(0);
});

test('ticking the checkbox turns automatic checking off and it stays off after a restart', async () => {
  app = await launch();
  await answerDialogWith(app, 'Remind me later', true);
  await expect.poll(async () => (await shownDialogs(app)).length).toBe(1);
  await expect.poll(() => readSettings().autoUpdateCheck).toBe(false);
  await app.close();

  fs.writeFileSync(
    path.join(userDataPath, 'settings.json'),
    JSON.stringify({ ...readSettings(), lastUpdateCheck: 1 })
  );
  requests = 0;
  app = await launch();
  const window = await app.firstWindow();
  await window.locator('#open-settings').click();
  await expect(
    window.getByLabel('Automatically check for updates (once a week)')
  ).not.toBeChecked();
  await window.waitForTimeout(2500);
  expect(requests).toBe(0);
});

test('the settings toggle turns automatic checking off and persists', async () => {
  app = await launch({ MERGENTRA_UPDATE_CHECK_DELAY_MS: '600000' });
  const window = await app.firstWindow();
  await window.locator('#open-settings').click();
  const toggle = window.getByLabel('Automatically check for updates (once a week)');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect.poll(() => readSettings().autoUpdateCheck).toBe(false);
});

test('no update is requested when checked within the last week', async () => {
  fs.writeFileSync(
    path.join(userDataPath, 'settings.json'),
    JSON.stringify({ gitPath: '', recentRepositories: [], lastUpdateCheck: Date.now() })
  );
  app = await launch();
  await app.firstWindow();
  await new Promise((resolve) => setTimeout(resolve, 2500));
  expect(requests).toBe(0);
});
