// Builds the app icon (icons/icon.svg) from the game's own art, then renders the PNG
// sizes that iPhone/iPad home screens and the web app manifest need, using headless Chrome.
//
// Run from the project root after tools/bootstrap-placeholders.mjs:
//   node tools/make-icons.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const INK = '#4a3150';

// Put an asset's SVG inside the icon at (x, y) with a given width, keeping its proportions.
function embed(file, x, y, width) {
  const src = readFileSync(file, 'utf8');
  const [, vb] = src.match(/viewBox="([^"]+)"/);
  const [, , w, h] = vb.split(' ').map(Number);
  const inner = src.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const height = width * h / w;
  return `<svg x="${x}" y="${y}" width="${width}" height="${height.toFixed(1)}" viewBox="${vb}">${inner}</svg>`;
}

const star = (cx, cy, r) =>
  `<path d="M${cx} ${cy - r} Q${cx + r * 0.18} ${cy - r * 0.18} ${cx + r} ${cy} Q${cx + r * 0.18} ${cy + r * 0.18} ${cx} ${cy + r} Q${cx - r * 0.18} ${cy + r * 0.18} ${cx - r} ${cy} Q${cx - r * 0.18} ${cy - r * 0.18} ${cx} ${cy - r} Z" fill="#ffd93d" style="stroke-width:10"/>`;

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <radialGradient id="bg" cx="50%" cy="40%" r="70%">
    <stop offset="0" stop-color="#fff6e8"/><stop offset=".6" stop-color="#ffd6e0"/><stop offset="1" stop-color="#ffb3c7"/>
  </radialGradient>
</defs>
<rect class="ne" width="1024" height="1024" fill="url(#bg)"/>
<!-- grassy isometric tile -->
<path d="M512 560 L940 774 L512 988 L84 774 Z" fill="#cdeba9" style="stroke:${INK};stroke-width:14;stroke-linejoin:round"/>
<!-- house behind -->
${embed('assets/buildings/pink-house.svg', 560, 210, 380)}
<!-- the frog, framed by the magnifying glass -->
<circle class="ne" cx="430" cy="560" r="250" fill="#ffffff" opacity=".55"/>
${embed('assets/animals/frog.svg', 205, 425, 450)}
<path d="M600 735 L840 950" style="stroke:${INK};stroke-width:84;stroke-linecap:round"/>
<path d="M600 735 L840 950" style="stroke:#b07a52;stroke-width:52;stroke-linecap:round"/>
<circle cx="430" cy="560" r="250" fill="none" style="stroke:${INK};stroke-width:64"/>
<circle cx="430" cy="560" r="250" fill="none" style="stroke:#ffd93d;stroke-width:34"/>
<path class="ne" d="M290 430 Q330 360 410 345" fill="none" style="stroke:#fff;stroke-width:22;stroke-linecap:round;opacity:.9"/>
${star(830, 180, 70)}${star(170, 230, 46)}${star(900, 520, 40)}
</svg>
`;

mkdirSync('icons', { recursive: true });
writeFileSync('icons/icon.svg', icon);
console.log('wrote icons/icon.svg');

// Render PNGs with headless Chrome (or Edge). Each size gets its own little page.
const browsers = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];
const browser = browsers.find(existsSync);
if (!browser) {
  console.log('No Chrome or Edge found, skipped the PNGs. Convert icons/icon.svg by hand.');
  process.exit(0);
}
const sizes = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512, 'favicon-32.png': 32 };
for (const [name, size] of Object.entries(sizes)) {
  const page = resolve(`icons/.render-${size}.html`);
  writeFileSync(page, `<!doctype html><html><body style="margin:0"><img src="icon.svg" width="${size}" height="${size}" style="display:block"></body></html>`);
  execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${size},${size}`,
    `--screenshot=${resolve('icons', name)}`, `file://${page}`], { stdio: 'ignore' });
  execFileSync('rm', [page]);
  console.log(`wrote icons/${name}`);
}
