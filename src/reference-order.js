const { mainLineName } = require('./main-line');

function graphColor(key) {
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const hue = Math.round((hash * 137.508 + 215) % 360);
  const lightness = (hash >>> 9) % 2 === 0 ? 62 : 48;
  return `hsl(${hue} 78% ${lightness}%)`;
}

function colorKey(reference) {
  if (!reference.remote || !reference.name.startsWith('origin/')) {
    return reference.name;
  }
  return reference.name.slice('origin/'.length);
}

function orderReferences(references) {
  const localReferences = references
    .filter((reference) => !reference.remote)
    .sort((left, right) => left.name.localeCompare(right.name));
  const remoteReferences = references
    .filter((reference) => reference.remote)
    .sort((left, right) => left.name.localeCompare(right.name));
  const ordered = [];
  const pairedRemotes = new Set();

  function addPair(local, remote) {
    const color = graphColor(colorKey(local));
    ordered.push({ ...local, color });
    if (remote) {
      pairedRemotes.add(remote.name);
      ordered.push({ ...remote, color });
    }
  }

  const mainName = mainLineName(localReferences.map((reference) => reference.name)) ?? 'main';
  const main = localReferences.find((reference) => reference.name === mainName);
  const originMain = remoteReferences.find((reference) => reference.name === `origin/${mainName}`);
  if (main) {
    addPair(main, originMain);
  } else if (originMain) {
    const color = graphColor(colorKey(originMain));
    ordered.push({ ...originMain, color });
    pairedRemotes.add(originMain.name);
  }

  for (const local of localReferences) {
    if (local.name === mainName) {
      continue;
    }
    const matchingRemote = remoteReferences.find(
      (reference) =>
        !pairedRemotes.has(reference.name) &&
        reference.name.slice(reference.name.indexOf('/') + 1) === local.name
    );
    if (matchingRemote) {
      addPair(local, matchingRemote);
    }
  }

  const unpairedReferences = [
    ...localReferences.filter(
      (reference) =>
        reference.name !== mainName && !ordered.some((item) => item.name === reference.name)
    ),
    ...remoteReferences.filter((reference) => !pairedRemotes.has(reference.name))
  ].sort((left, right) => left.name.localeCompare(right.name));

  for (const reference of unpairedReferences) {
    ordered.push({
      ...reference,
      color: graphColor(colorKey(reference))
    });
  }

  return ordered.map((reference, index) => ({ ...reference, lane: index }));
}

module.exports = { orderReferences };
