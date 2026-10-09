// Blocks the app behind the licence terms until they are accepted for this licence version.
export async function initLicenseGate() {
  const gate = document.getElementById('license-gate');
  const appMain = document.getElementById('app-main');
  const summary = document.getElementById('license-summary');
  const settingsText = document.getElementById('license-settings-text');

  let license;
  try {
    license = await window.mergentra.getLicense();
  } catch (error) {
    summary.textContent = `License agreement could not be loaded: ${error.message}`;
    return;
  }

  settingsText.textContent = license.text;
  function showAcceptedSummary(version, date) {
    summary.textContent = version
      ? `License agreement (version ${version} accepted on ${new Date(date).toLocaleDateString()})`
      : 'License agreement';
  }
  showAcceptedSummary(license.accepted.version, license.accepted.date);

  if (!license.needed) {
    return;
  }

  const changes = document.getElementById('license-changes');
  if (license.accepted.version && license.whatChanged) {
    changes.textContent = `The license terms have changed: ${license.whatChanged}`;
    changes.hidden = false;
  }
  document.getElementById('license-gate-text').textContent = license.text;
  appMain.inert = true;
  gate.hidden = false;
  document.getElementById('license-accept').focus();

  document.getElementById('license-accept').addEventListener('click', async () => {
    try {
      await window.mergentra.acceptLicense();
    } catch (error) {
      changes.textContent = `The agreement could not be saved: ${error.message}`;
      changes.hidden = false;
      return;
    }
    gate.hidden = true;
    appMain.inert = false;
    showAcceptedSummary(license.version, Date.now());
  });
  document
    .getElementById('license-decline')
    .addEventListener('click', () => window.mergentra.declineLicense());
}
