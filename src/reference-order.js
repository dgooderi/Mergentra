function graphColor(index) {
  const hue = Math.round((index * 137.508 + 215) % 360);
  const lightness = index % 2 === 0 ? 62 : 48;
  return `hsl(${hue} 78% ${lightness}%)`;
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
  let pairIndex = 0;

  function addPair(local, remote) {
    const color = graphColor(pairIndex++);
    ordered.push({ ...local, color });
    if (remote) {
      pairedRemotes.add(remote.name);
      ordered.push({ ...remote, color });
    }
  }

  const main = localReferences.find((reference) => reference.name === 'main');
  const originMain = remoteReferences.find((reference) => reference.name === 'origin/main');
  if (main) {
    addPair(main, originMain);
  } else if (originMain) {
    const color = graphColor(pairIndex++);
    ordered.push({ ...originMain, color });
    pairedRemotes.add(originMain.name);
  }

  for (const local of localReferences) {
    if (local.name === 'main') {
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
        reference.name !== 'main' && !ordered.some((item) => item.name === reference.name)
    ),
    ...remoteReferences.filter((reference) => !pairedRemotes.has(reference.name))
  ].sort((left, right) => left.name.localeCompare(right.name));

  for (const reference of unpairedReferences) {
    ordered.push({
      ...reference,
      color: graphColor(pairIndex++)
    });
  }

  return ordered.map((reference, index) => ({ ...reference, lane: index }));
}

module.exports = { orderReferences };
