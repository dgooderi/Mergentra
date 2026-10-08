// Generates the Mergentra icon set: SVG sources, PNGs at each size and a multi-size .ico.
// Run with: npm run build:icons
const fs = require('node:fs');
const path = require('node:path');
const { _electron: electron } = require('@playwright/test');

const outputDirectory = path.resolve(__dirname, '..', 'assets', 'icons');
const GRADIENTS = `
  <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e6edf6"/>
  </linearGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b7c6da"/>
  </linearGradient>
  <linearGradient id="flow" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#14b8b0"/><stop offset="0.5" stop-color="#2f7fd3"/><stop offset="1" stop-color="#1b3f94"/>
  </linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
    <feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#1e3a5f" flood-opacity="0.28"/>
  </filter>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#0f2a55" flood-opacity="0.35"/>
  </filter>`;

function arrowHead(x, y, fromX, fromY, size, fill) {
  const angle = Math.atan2(y - fromY, x - fromX);
  const point = (distance, side) =>
    [
      x + Math.cos(angle) * distance - Math.sin(angle) * side,
      y + Math.sin(angle) * distance + Math.cos(angle) * side
    ]
      .map((value) => value.toFixed(1))
      .join(',');
  return `<polygon points="${point(size * 0.9, 0)} ${point(-size * 0.4, size * 0.75)} ${point(-size * 0.4, -size * 0.75)}" fill="${fill}"/>`;
}

function node(cx, cy, radius, ring, fill, dot = true) {
  return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="${ring}" stroke-width="${radius * 0.28}" filter="url(#soft)"/>${
    dot
      ? `<circle cx="${cx - radius * 0.25}" cy="${cy - radius * 0.3}" r="${radius * 0.3}" fill="#ffffff" fill-opacity="0.55"/>`
      : ''
  }`;
}

// The detailed mark: a trunk that splits into branches ending in commit nodes and arrows. 200x200 box.
function treeMark() {
  const stroke = (d, color, width = 10) =>
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" filter="url(#soft)"/>`;
  return `
  ${stroke('M100 192 L100 150', '#1f55b3', 12)}
  ${stroke('M100 160 C100 128 66 122 30 100', '#2b86d9')}
  ${stroke('M100 164 C100 116 62 112 60 64', '#18aeb0')}
  ${stroke('M100 152 L100 56', '#7fb8e6', 8)}
  ${stroke('M102 168 C104 112 132 92 144 66', '#1a9cb8', 9)}
  ${stroke('M104 178 C106 144 148 138 168 114', '#1f4aa8', 10)}
  ${arrowHead(100, 44, 100, 70, 15, '#7fb8e6')}
  ${arrowHead(150, 52, 138, 78, 16, '#1a9cb8')}
  ${arrowHead(176, 106, 158, 128, 17, '#1f4aa8')}
  ${node(28, 100, 15, '#ffffff', '#8cc6f2')}
  ${node(60, 56, 15, '#ffffff', '#16b0ae')}
  ${node(100, 28, 15, '#ffffff', '#a9d5f5')}
  ${node(158, 40, 17, '#ffffff', '#12748f')}
  ${node(184, 94, 16, '#ffffff', '#1f4aa8')}`;
}

// A simplified branch-graph mark with heavy strokes that stay readable at 16 px. 200x200 box.
function graphMark(extraDetail) {
  const rail = (d, width = 13) =>
    `<path d="${d}" fill="none" stroke="url(#flow)" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `
  ${rail('M22 100 L178 100')}
  ${rail('M58 100 C84 100 78 52 108 52 L178 52')}
  ${rail('M58 100 C84 100 78 148 108 148 L178 148')}
  ${extraDetail ? rail('M108 52 C134 52 128 100 150 100', 7) : ''}
  ${arrowHead(184, 52, 150, 52, 17, '#1b3f94')}
  ${arrowHead(184, 148, 150, 148, 17, '#1b3f94')}
  ${arrowHead(186, 100, 150, 100, 17, '#1b3f94')}
  ${node(24, 100, 17, '#ffffff', '#14b8b0', extraDetail)}
  ${node(58, 100, 16, '#ffffff', '#1fa4c0', extraDetail)}
  ${node(108, 52, 16, '#ffffff', '#2f7fd3', extraDetail)}
  ${node(108, 148, 16, '#ffffff', '#2a6cc8', extraDetail)}
  ${node(142, 100, 15, '#ffffff', '#1b3f94', extraDetail)}`;
}

function tile(size, content, { withText = false } = {}) {
  const margin = size * 0.02;
  const inner = size - margin * 2;
  const radius = inner * 0.22;
  const markBox = withText ? inner * 0.62 : inner * 0.9;
  const markX = margin + (inner - markBox) / 2;
  const markY = withText ? margin + inner * 0.07 : margin + (inner - markBox) / 2;
  const text = withText
    ? `<text x="${size / 2}" y="${size * 0.9}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="${size * 0.115}" letter-spacing="${size * 0.004}"><tspan fill="#2b86d9">MERGEN</tspan><tspan fill="#1f4aa8">TRA</tspan></text>`
    : '';
  const shadow = size >= 32 ? 'filter="url(#shadow)"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>${GRADIENTS}</defs>
  <rect x="${margin}" y="${margin}" width="${inner}" height="${inner}" rx="${radius}" fill="url(#tile)" stroke="url(#rim)" stroke-width="${Math.max(1, size * 0.012)}" ${shadow}/>
  <g transform="translate(${markX} ${markY}) scale(${markBox / 200})">${content}</g>
  ${text}
</svg>`;
}

const variants = [
  { name: 'mergentra-256-text', size: 256, svg: tile(256, treeMark(), { withText: true }) },
  { name: 'mergentra-128', size: 128, svg: tile(128, treeMark()) },
  { name: 'mergentra-64', size: 64, svg: tile(64, graphMark(true)) },
  { name: 'mergentra-48', size: 48, svg: tile(48, graphMark(true)) },
  { name: 'mergentra-32', size: 32, svg: tile(32, graphMark(false)) },
  { name: 'mergentra-16', size: 16, svg: tile(16, graphMark(false)) },
  // Icon-only versions of the large sizes, for places that draw their own label.
  { name: 'mergentra-256', size: 256, svg: tile(256, graphMark(true)) },
  { name: 'mergentra-tree-256', size: 256, svg: tile(256, treeMark()) }
];

const ICO_SIZES = [
  ['mergentra-tree-256', 256],
  ['mergentra-128', 128],
  ['mergentra-64', 64],
  ['mergentra-48', 48],
  ['mergentra-32', 32],
  ['mergentra-16', 16]
];

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)]);
}

async function main() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  // Electron is already a dev dependency, so it renders the SVGs and no browser download is needed.
  const app = await electron.launch({ args: [path.join(__dirname, 'icon-renderer-main.cjs')] });
  const rendered = new Map();
  try {
    const page = await app.firstWindow();
    for (const { name, size, svg } of variants) {
      fs.writeFileSync(path.join(outputDirectory, `${name}.svg`), svg);
      await page.setContent(
        `<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>${svg}`
      );
      const data = await page.screenshot({
        omitBackground: true,
        type: 'png',
        clip: { x: 0, y: 0, width: size, height: size }
      });
      fs.writeFileSync(path.join(outputDirectory, `${name}.png`), data);
      rendered.set(name, data);
    }
  } finally {
    await app.close();
  }
  const images = ICO_SIZES.map(([name, size]) => ({ size, data: rendered.get(name) }));
  fs.writeFileSync(path.join(outputDirectory, 'mergentra.ico'), buildIco(images));
  console.log(`Wrote ${variants.length} icons and mergentra.ico to ${outputDirectory}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
