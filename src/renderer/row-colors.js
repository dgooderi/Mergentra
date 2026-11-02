// Branch colours are chosen per branch, but rows are stacked by where each lane starts, so two
// lanes that sit next to each other on screen can end up with close hues. This pass walks the
// rows from the top and moves a lane's hue only when it is too close to the row above it.
const MINIMUM_DISTANCE = 100;
const HUE_STEP = 30;
const SATURATIONS = [78, 48];
const LIGHTNESSES = [62, 46, 76];

function parseHsl(color) {
  const match = /^hsl\((\d+(?:\.\d+)?) (\d+)% (\d+)%\)$/.exec(color ?? '');
  return match
    ? { hue: Number(match[1]), saturation: Number(match[2]), lightness: Number(match[3]) }
    : null;
}

function hueGap(left, right) {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}

// Hue gap (0-180) dominates; differing saturation and lightness add to it.
function distance(left, right) {
  return (
    hueGap(left.hue, right.hue) +
    1.5 * Math.abs(left.lightness - right.lightness) +
    1.0 * Math.abs(left.saturation - right.saturation)
  );
}

function nearest(color, others) {
  return others.reduce((smallest, other) => Math.min(smallest, distance(color, other)), Infinity);
}

function formatHsl({ hue, saturation, lightness }) {
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function separateRowColors({ commits, commitPositions, colorOf, mayShare = () => false }) {
  const lanes = new Map();
  commits.forEach((commit, index) => {
    const position = commitPositions.get(commit.hash);
    if (!position) {
      return;
    }
    const lane = lanes.get(commit.lane) || { lane: commit.lane, y: position.y, first: index };
    lane.last = index;
    lanes.set(commit.lane, lane);
  });
  // A lane is also visible along the edges that join it to other lanes, not just at its commits.
  const indexOf = new Map(commits.map((commit, index) => [commit.hash, index]));
  commits.forEach((commit, index) => {
    for (const parentHash of commit.parents ?? []) {
      const parentIndex = indexOf.get(parentHash);
      const parent = parentIndex === undefined ? null : commits[parentIndex];
      if (!parent || !lanes.has(commit.lane) || !lanes.has(parent.lane)) {
        continue;
      }
      for (const lane of [lanes.get(commit.lane), lanes.get(parent.lane)]) {
        lane.first = Math.min(lane.first, index, parentIndex);
        lane.last = Math.max(lane.last, index, parentIndex);
      }
    }
  });

  const ordered = [...lanes.values()].sort((a, b) => a.y - b.y || a.first - b.first);
  const result = new Map();
  const placed = [];
  for (const lane of ordered) {
    const base = parseHsl(colorOf(lane.lane));
    if (!base) {
      placed.push({ ...lane, color: null });
      continue;
    }
    const overlapping = placed.filter(
      (other) =>
        other.color !== null &&
        other.y < lane.y &&
        other.first <= lane.last &&
        other.last >= lane.first
    );
    const neighbours = overlapping.filter((other) => !mayShare(lane.lane, other.lane));
    const neighbourColors = neighbours.map((other) => other.color);
    let color = base;
    if (neighbourColors.length > 0 && nearest(base, neighbourColors) < MINIMUM_DISTANCE) {
      // Search hue, saturation and lightness; the farthest candidate (usually the opposite side
      // of the wheel) wins, and ties keep the colour closest to the original hue.
      let best = { color: base, score: nearest(base, neighbourColors) };
      for (let hue = 0; hue < 360; hue += HUE_STEP) {
        for (const saturation of SATURATIONS) {
          for (const lightness of LIGHTNESSES) {
            const candidate = { hue, saturation, lightness };
            const score = nearest(candidate, neighbourColors);
            const closer =
              hueGap(hue, base.hue) < hueGap(best.color.hue, base.hue) && score === best.score;
            if (score > best.score || closer) {
              best = { color: candidate, score };
            }
          }
        }
      }
      color = best.color;
      result.set(lane.lane, formatHsl(color));
    }
    placed.push({ ...lane, color });
  }
  return result;
}
