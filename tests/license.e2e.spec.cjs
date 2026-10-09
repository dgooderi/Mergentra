const { expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

let app;
let userDataPath;

test.beforeEach(() => {
  userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-license-e2e-'));
});

test.afterEach(async () => {
  await app?.close().catch(() => {});
  app = undefined;
  fs.rmSync(userDataPath, { recursive: true, force: true });
});

function launch(extraEnv = {}) {
  return launchMergentra({
    args: [path.resolve(__dirname, '..')],
    env: {
      ...process.env,
      MERGENTRA_USER_DATA_DIR: userDataPath,
      MERGENTRA_SKIP_LICENSE: '',
      MERGENTRA_ACCEPT_LICENSE: '',
      ...extraEnv
    }
  });
}

const readSettings = () =>
  JSON.parse(fs.readFileSync(path.join(userDataPath, 'settings.json'), 'utf8'));

test('first run asks for the licence, and accepting opens the app and is remembered', async () => {
  app = await launch();
  let window = await app.firstWindow();
  await expect(window.getByRole('dialog', { name: 'License agreement' })).toBeVisible();
  await expect(window.locator('#license-gate-text')).toContainText('MERGENTRA LICENSE AGREEMENT');
  await expect(window.locator('#app-main')).toHaveJSProperty('inert', true);

  await window.getByRole('button', { name: 'I accept' }).click();
  await expect(window.locator('#license-gate')).toBeHidden();
  await expect(window.locator('#app-main')).toHaveJSProperty('inert', false);
  await expect.poll(() => readSettings().acceptedLicenseVersion).toBe(1);
  expect(readSettings().acceptedLicenseAppVersion).toBe(require('../package.json').version);
  expect(Date.parse(readSettings().acceptedLicenseDate)).toBeGreaterThan(0);

  await app.close();
  app = await launch();
  window = await app.firstWindow();
  await expect(window.locator('#license-summary')).toContainText('version 1 accepted');
  await expect(window.locator('#license-gate')).toBeHidden();
});

test('declining the licence closes the app without saving an acceptance', async () => {
  app = await launch();
  const window = await app.firstWindow();
  const closed = new Promise((resolve) => app.process().once('exit', resolve));
  await window.getByRole('button', { name: 'Decline' }).click();
  await closed;
  expect(
    fs.existsSync(path.join(userDataPath, 'settings.json')) && readSettings().acceptedLicenseVersion
  ).toBeFalsy();
});

test('terms newer than the accepted version are shown again', async () => {
  fs.writeFileSync(
    path.join(userDataPath, 'settings.json'),
    JSON.stringify({ gitPath: '', recentRepositories: [], acceptedLicenseVersion: 0 })
  );
  app = await launch();
  const window = await app.firstWindow();
  await expect(window.locator('#license-gate')).toBeVisible();
});

test('a managed install accepts the licence by policy without prompting', async () => {
  app = await launch({ MERGENTRA_ACCEPT_LICENSE: '1' });
  const window = await app.firstWindow();
  await expect(window.locator('#repository-picker')).toBeVisible();
  await expect(window.locator('#license-gate')).toBeHidden();
});

test('settings lets the user read the accepted licence', async () => {
  app = await launch({ MERGENTRA_ACCEPT_LICENSE: '1' });
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Settings' }).click();
  await window.locator('#license-summary').click();
  await expect(window.locator('#license-settings-text')).toContainText('MERGENTRA LICENSE');
});
