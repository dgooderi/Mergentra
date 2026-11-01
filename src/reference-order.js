const { mainLineName } = require('./main-line');

const hueCount = 12;
const lightnessTiers = [62, 48, 74];
// A branch with no commit in this long stops reserving its colour, so the colour can be reused.
const ACTIVE_WINDOW_SECONDS = 90 * 24 * 60 * 60;
// Neighbouring lanes get hues at least this far apart where the palette allows it.
const NEIGHBOUR_HUE_STEPS = [3, 2, 1, 0];

function nameHash(key) {
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function hueDistance(left, right) {
  const difference = Math.abs(left - right);
  return Math.min(difference, hueCount - difference);
}

function hslFor(hue, tier) {
  return `hsl(${hue * (360 / hueCount)} 78% ${lightnessTiers[tier]}%)`;
}

// Active keys take a free hue/lightness slot, preferring their name's hue and a hue far from
// the previous lane. Inactive keys use their name's own colour and reserve nothing.
function assignColors(orderedKeys, activeKeys) {
  const taken = new Set();
  const colorsByKey = new Map();
  let previousHue = null;
  for (const key of orderedKeys) {
    if (colorsByKey.has(key)) {
      continue;
    }
    const hash = nameHash(key);
    const preferredHue = (hash >>> 8) % hueCount;
    if (!activeKeys.has(key)) {
      colorsByKey.set(key, hslFor(preferredHue, (hash >>> 9) % lightnessTiers.length));
      continue;
    }
    let chosen = null;
    for (const minimumSteps of NEIGHBOUR_HUE_STEPS) {
      for (let tier = 0; tier < lightnessTiers.length && !chosen; tier += 1) {
        for (let offset = 0; offset < hueCount && !chosen; offset += 1) {
          const hue = (preferredHue + offset) % hueCount;
          const farEnough = previousHue === null || hueDistance(hue, previousHue) >= minimumSteps;
          if (farEnough && !taken.has(tier * hueCount + hue)) {
            chosen = { hue, tier };
          }
        }
      }
      if (chosen) {
        break;
      }
    }
    chosen ??= { hue: preferredHue, tier: 0 };
    taken.add(chosen.tier * hueCount + chosen.hue);
    previousHue = chosen.hue;
    colorsByKey.set(key, hslFor(chosen.hue, chosen.tier));
  }
  return colorsByKey;
}

function colorKey(reference) {
  if (!reference.remote || !reference.name.startsWith('origin/')) {
    return reference.name;
  }
  return reference.name.slice('origin/'.length);
}
function orderReferences(references, { now = Date.now() / 1000 } = {}) {
  const localReferences = references
    .filter((reference) => !reference.remote)
    .sort((left, right) => left.name.localeCompare(right.name));
  const remoteReferences = references
    .filter((reference) => reference.remote)
    .sort((left, right) => left.name.localeCompare(right.name));
  const ordered = [];
  const orderedNames = new Set();
  const pairedRemotes = new Set();

  const keyByName = new Map();

  function add(reference, key = colorKey(reference)) {
    ordered.push(reference);
    orderedNames.add(reference.name);
    keyByName.set(reference.name, key);
  }

  function addPair(local, remote) {
    add(local);
    if (remote) {
      pairedRemotes.add(remote.name);
      add(remote, local.name);
    }
  }

  const mainName = mainLineName(localReferences.map((reference) => reference.name)) ?? 'main';
  const main = localReferences.find((reference) => reference.name === mainName);
  const originMain = remoteReferences.find((reference) => reference.name === `origin/${mainName}`);
  if (main) {
    addPair(main, originMain);
  } else if (originMain) {
    pairedRemotes.add(originMain.name);
    add(originMain);
  }

  const remotesByLocalName = new Map();
  for (const reference of remoteReferences) {
    const localName = reference.name.slice(reference.name.indexOf('/') + 1);
    if (!remotesByLocalName.has(localName)) {
      remotesByLocalName.set(localName, []);
    }
    remotesByLocalName.get(localName).push(reference);
  }
  for (const local of localReferences) {
    if (local.name === mainName) {
      continue;
    }
    const matchingRemote = (remotesByLocalName.get(local.name) || []).find(
      (reference) => !pairedRemotes.has(reference.name)
    );
    if (matchingRemote) {
      addPair(local, matchingRemote);
    }
  }

  const unpairedReferences = [
    ...localReferences.filter(
      (reference) => reference.name !== mainName && !orderedNames.has(reference.name)
    ),
    ...remoteReferences.filter((reference) => !pairedRemotes.has(reference.name))
  ].sort((left, right) => left.name.localeCompare(right.name));
  for (const reference of unpairedReferences) {
    add(reference);
  }

  const isRecent = (reference) =>
    reference.tipTimestamp === undefined || now - reference.tipTimestamp <= ACTIVE_WINDOW_SECONDS;
  const activeKeys = new Set(
    ordered
      .filter((reference) => isRecent(reference) || keyByName.get(reference.name) === mainName)
      .map((reference) => keyByName.get(reference.name))
  );
  const colorsByKey = assignColors(
    ordered.map((reference) => keyByName.get(reference.name)),
    activeKeys
  );

  return ordered.map((reference, index) => ({
    ...reference,
    color: colorsByKey.get(keyByName.get(reference.name)),
    lane: index
  }));
}

module.exports = { orderReferences };
