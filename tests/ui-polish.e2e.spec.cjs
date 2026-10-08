const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

async function withApp(callback, { openRepository = true } = {}) {
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
    if (openRepository) {
      await window.getByLabel('Repository folder').fill(repositoryPath);
      await window.getByRole('button', { name: 'Open repository' }).click();
      await expect(window.getByRole('heading', { name: 'sample-repository' })).toBeVisible();
    }
    await callback(window);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
}

test('Current Branch sits directly under Path, left aligned', async () => {
  await withApp(async (window) => {
    const path = await window.locator('.repository-path').boundingBox();
    const branch = await window.locator('.repository-header .branch-label').boundingBox();
    expect(branch.y).toBeGreaterThanOrEqual(path.y + path.height - 1);
    expect(branch.y - (path.y + path.height)).toBeLessThan(8);
    expect(Math.abs(branch.x - path.x)).toBeLessThan(1);
  });
});

test('note Preview button sits to the right of the note', async () => {
  await withApp(async (window) => {
    const note = await window.locator('#repository-note').boundingBox();
    const toggle = await window
      .locator('.repository-header .markdown-note .note-view-toggle')
      .boundingBox();
    expect(toggle.x).toBeGreaterThanOrEqual(note.x + note.width - 1);
  });
});

test('note is at least three lines tall in edit and preview modes', async () => {
  await withApp(async (window) => {
    const lineHeight = await window
      .locator('#repository-note')
      .evaluate((element) => parseFloat(getComputedStyle(element).lineHeight) || 16);
    const editor = await window.locator('#repository-note').boundingBox();
    expect(editor.height).toBeGreaterThanOrEqual(lineHeight * 3);
    await window.locator('.repository-header .markdown-note .note-view-toggle').click();
    const preview = await window.locator('.repository-header .note-preview').boundingBox();
    expect(preview.height).toBeGreaterThanOrEqual(lineHeight * 3);
    expect(Math.abs(preview.height - editor.height)).toBeLessThan(4);
  });
});

test('settings cog is centred in its button and large, on both screens', async () => {
  const check = async (window) => {
    const button = await window.locator('#open-settings').boundingBox();
    const icon = await window.locator('#open-settings svg').boundingBox();
    expect(Math.abs(icon.x + icon.width / 2 - (button.x + button.width / 2))).toBeLessThan(1);
    expect(Math.abs(icon.y + icon.height / 2 - (button.y + button.height / 2))).toBeLessThan(1);
    expect(icon.width).toBeGreaterThanOrEqual(24);
  };
  await withApp(check, { openRepository: false });
  await withApp(check);
});

test('picker screen shows only the Open or the Clone form and keeps typed values', async () => {
  await withApp(
    async (window) => {
      const openTab = window.getByRole('tab', { name: 'Open' });
      const cloneTab = window.getByRole('tab', { name: 'Clone' });
      await expect(openTab).toHaveAttribute('aria-selected', 'true');
      await expect(window.locator('#repository-form')).toBeVisible();
      await expect(window.locator('#clone-form')).toBeHidden();

      await window.getByLabel('Repository folder').fill('C:\\typed\\path');
      await cloneTab.click();
      await expect(cloneTab).toHaveAttribute('aria-selected', 'true');
      await expect(window.locator('#clone-form')).toBeVisible();
      await expect(window.locator('#repository-form')).toBeHidden();
      await window.getByLabel('Repository URL').fill('https://example.invalid/r.git');

      await cloneTab.press('ArrowLeft');
      await expect(openTab).toBeFocused();
      await expect(window.locator('#repository-form')).toBeVisible();
      await expect(window.getByLabel('Repository folder')).toHaveValue('C:\\typed\\path');
      await openTab.press('ArrowRight');
      await expect(window.getByLabel('Repository URL')).toHaveValue(
        'https://example.invalid/r.git'
      );
    },
    { openRepository: false }
  );
});

test('clone URL is as wide as the folder field and History only is centred', async () => {
  await withApp(
    async (window) => {
      await window.getByRole('tab', { name: 'Clone' }).click();
      const url = await window.getByLabel('Repository URL').boundingBox();
      const destinationRow = await window.locator('#clone-destination').boundingBox();
      const browse = await window.locator('#clone-browse').boundingBox();
      const rowRight = browse.x + browse.width;
      expect(Math.abs(url.x + url.width - rowRight)).toBeLessThan(1);
      expect(Math.abs(url.x - destinationRow.x)).toBeLessThan(1);

      const checkbox = await window.locator('.clone-section .checkbox-label').boundingBox();
      const start = await window.locator('#clone-start').boundingBox();
      const above = checkbox.y - (destinationRow.y + destinationRow.height);
      const below = start.y - (checkbox.y + checkbox.height);
      expect(Math.abs(above - below)).toBeLessThan(2);
    },
    { openRepository: false }
  );
});

test('Open and Clone panels are the same height and the tab bar does not move', async () => {
  await withApp(
    async (window) => {
      const tabs = window.locator('.mode-tabs');
      const openTabY = (await tabs.boundingBox()).y;
      const openPanel = await window.locator('#panel-open').boundingBox();
      await window.getByRole('tab', { name: 'Clone' }).click();
      const clonePanel = await window.locator('#panel-clone').boundingBox();
      expect(Math.abs((await tabs.boundingBox()).y - openTabY)).toBeLessThan(1);
      expect(Math.abs(clonePanel.height - openPanel.height)).toBeLessThan(1);
      const emptyStatus = await window.locator('#clone-status').boundingBox();
      expect(emptyStatus === null || emptyStatus.height < 2).toBe(true);
    },
    { openRepository: false }
  );
});

test('logo is shown on the picker screen and in the repository header', async () => {
  await withApp(
    async (window) => {
      const pickerLogo = window.locator('#repository-picker img.brand-logo');
      await expect(pickerLogo).toBeVisible();
      await expect(pickerLogo).toHaveAttribute('alt', 'Mergentra');
      expect(await pickerLogo.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
      await window.getByLabel('Repository folder').fill(process.env.TEMP);
    },
    { openRepository: false }
  );
  await withApp(async (window) => {
    const headerLogo = window.locator('.repository-header img.brand-logo');
    await expect(headerLogo).toBeVisible();
    expect(await headerLogo.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    const scrolls = await window.evaluate(
      () => document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight
    );
    expect(scrolls).toBe(false);
  });
});

test('Clone form has no extra card layer and fits tightly', async () => {
  await withApp(
    async (window) => {
      await window.getByRole('tab', { name: 'Clone' }).click();
      const section = window.locator('.clone-section');
      const style = await section.evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          border: computed.borderTopWidth,
          padding: computed.paddingTop + computed.paddingLeft,
          shadow: computed.boxShadow
        };
      });
      expect(style.border).toBe('0px');
      expect(style.padding).toBe('0px0px');
      expect(style.shadow).toBe('none');
      const panel = await window.locator('#panel-clone').boundingBox();
      const sectionBox = await section.boundingBox();
      expect(panel.height - sectionBox.height).toBeLessThan(2);
      expect(sectionBox.height).toBeLessThan(330);
    },
    { openRepository: false }
  );
});

test('Open and Clone controls share the same position and size', async () => {
  await withApp(
    async (window) => {
      const openTop = (await window.locator('#panel-open h2').first().boundingBox()).y;
      const openFolder = await window.locator('#repository-form .path-controls').boundingBox();
      const openButton = await window.locator('#repository-form > .primary').boundingBox();
      await window.getByRole('tab', { name: 'Clone' }).click();
      const cloneTop = (await window.locator('#panel-clone h2').boundingBox()).y;
      const cloneButton = await window.locator('#clone-start').boundingBox();
      expect(Math.abs(openTop - cloneTop)).toBeLessThan(1);
      expect(
        Math.abs(openFolder.width - (await window.locator('#clone-url').boundingBox()).width)
      ).toBeLessThan(1);
      expect(
        Math.abs(openButton.y + openButton.height - (cloneButton.y + cloneButton.height))
      ).toBeLessThan(1);
      expect(Math.abs(openButton.width - cloneButton.width)).toBeLessThan(1);
    },
    { openRepository: false }
  );
});

test('picker screen fits the default window without scrolling on both tabs', async () => {
  await withApp(
    async (window) => {
      const overflow = () =>
        window.evaluate(() =>
          [
            document.scrollingElement,
            document.querySelector('main'),
            document.querySelector('#repository-picker')
          ].map((element) => element.scrollHeight - element.clientHeight)
        );
      expect((await overflow()).every((value) => value <= 0)).toBe(true);
      await window.getByRole('tab', { name: 'Clone' }).click();
      expect((await overflow()).every((value) => value <= 0)).toBe(true);
    },
    { openRepository: false }
  );
});
