const { mainLineName } = require('./main-line');

const colorBucketCount = 12;

function graphColor(key, assignedBuckets) {
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  let bucket = (hash >>> 8) % colorBucketCount;
  for (let attempts = 0; attempts < colorBucketCount; attempts += 1) {
    if (!assignedBuckets.has(bucket)) {
      assignedBuckets.add(bucket);
      break;
    }
    bucket = (bucket + 1) % colorBucketCount;
  }
  const hue = bucket * (360 / colorBucketCount);
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
  const colorsByKey = new Map();
  const assignedBuckets = new Set();

  function colorFor(reference) {
    const key = colorKey(reference);
    if (!colorsByKey.has(key)) {
      colorsByKey.set(key, graphColor(key, assignedBuckets));
    }
    return colorsByKey.get(key);
  }

  function addPair(local, remote) {
    const color = colorFor(local);
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
    const color = colorFor(originMain);
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
      color: colorFor(reference)
    });
  }

  return ordered.map((reference, index) => ({ ...reference, lane: index }));
}

module.exports = { orderReferences };
