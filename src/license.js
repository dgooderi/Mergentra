const path = require('node:path');

// Bump this whenever the terms change; everyone who accepted an older version is asked again.
const LICENSE_VERSION = 1;

// Shown to people re-accepting after a change. Describe what changed in this version's terms.
const WHAT_CHANGED = '';

function needsAcceptance(settings, licenseVersion) {
  return !(
    Number.isInteger(settings.acceptedLicenseVersion) &&
    settings.acceptedLicenseVersion >= licenseVersion
  );
}

function recordAcceptance(settings, { licenseVersion, appVersion, now }) {
  return {
    ...settings,
    acceptedLicenseVersion: licenseVersion,
    acceptedLicenseDate: new Date(now).toISOString(),
    acceptedLicenseAppVersion: appVersion
  };
}

// Managed installs accept on the organisation's behalf by setting MERGENTRA_ACCEPT_LICENSE to the
// licence version they reviewed. Newer terms still prompt until the administrator raises it.
function isAcceptedByPolicy(env, licenseVersion) {
  const value = env.MERGENTRA_ACCEPT_LICENSE;
  return /^\d+$/.test(value ?? '') && Number(value) >= licenseVersion;
}

function readLicenseText(fileSystem) {
  return fileSystem.readFileSync(path.join(__dirname, 'license', 'terms.txt'), 'utf8');
}

module.exports = {
  LICENSE_VERSION,
  WHAT_CHANGED,
  isAcceptedByPolicy,
  needsAcceptance,
  readLicenseText,
  recordAcceptance
};
