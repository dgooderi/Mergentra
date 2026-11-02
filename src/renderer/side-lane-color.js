// A merged-in side lane is drawn in a colour well away from its owner's, so it never
// looks like the branch it was merged into. Colours that are not hsl() are kept as they are.
const HUE_SHIFT = 150;

export function sideLaneColor(ownerColor) {
  const match = /^hsl\((\d+(?:\.\d+)?) (\d+)% (\d+)%\)$/.exec(ownerColor ?? '');
  if (!match) {
    return ownerColor;
  }
  const hue = (Number(match[1]) + HUE_SHIFT) % 360;
  const lightness = Number(match[3]) >= 60 ? 48 : 66;
  return `hsl(${hue} ${match[2]}% ${lightness}%)`;
}
