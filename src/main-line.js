// The main line is the local `main` branch, or `master` when there is no `main`.
const MAIN_LINE_NAMES = ['main', 'master'];

function mainLineName(localNames) {
  return MAIN_LINE_NAMES.find((name) => localNames.includes(name));
}

module.exports = { mainLineName };
