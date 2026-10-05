// Draws all the code-made art as standalone SVG files in assets/, and writes catalog/catalog.json.
// AI-generated PNGs can replace any of these files later, one at a time.
//
// Run from the project root:  node tools/bootstrap-placeholders.mjs
// It always rewrites the .svg files, but never overwrites an existing catalog.json
// (the catalog is hand-edited from here on). Pass --catalog to force it.
//
// Every sprite is drawn around its "feet" at (0,0). `box` is the visible area around that point.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const INK = '#4a3150';
// One ink outline rule for everything. Class "ne" = no outline.
const STYLE = `<style>*{stroke:${INK};stroke-width:3;stroke-linejoin:round;stroke-linecap:round}.ne{stroke:none}.t{stroke-width:1.6}` +
  `.drop{animation:drop 1.1s linear infinite}@keyframes drop{0%{transform:translateY(0);opacity:1}100%{transform:translateY(22px);opacity:0}}</style>`;

/* ---------- color helpers ---------- */
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
const dark = (c, t = 0.22) => mix(c, INK, t);
const light = (c, t = 0.45) => mix(c, '#ffffff', t);

/* ---------- drawing helpers ---------- */
let uid = 0;
const id = () => 'c' + (++uid);

// Soft shadow on the ground under the feet.
const shadow = (rx, cx = 0) => `<ellipse class="ne" cx="${cx}" cy="1" rx="${rx}" ry="${(rx * 0.28).toFixed(1)}" fill="${INK}" opacity=".16"/>`;

// A filled, outlined shape with a darker lower-right side and a small shine, like the reference.
function shaded(shape, color, { sx = 0.3, sy = 0.5, shine = true } = {}) {
  const k = id();
  const get = n => parseFloat((shape.match(new RegExp(` ${n}="([-\\d.]+)"`)) || [0, 0])[1]);
  let cx = get('cx'), cy = get('cy'), rx = get('rx'), ry = get('ry');
  if (shape.startsWith('<rect')) {   // rectangles: use their own box, rx there is the corner radius
    rx = get('width') / 2; ry = get('height') / 2; cx = get('x') + rx; cy = get('y') + ry;
  }
  const base = shape.replace('/>', ` fill="${color}"/>`);
  const clip = shape.replace(/ class="[^"]*"/, '');
  let s = `<clipPath id="${k}">${clip}</clipPath>${base}`;
  s += `<ellipse class="ne" clip-path="url(#${k})" cx="${(cx + rx * sx).toFixed(1)}" cy="${(cy + ry * sy).toFixed(1)}" rx="${rx}" ry="${ry}" fill="${INK}" opacity=".13"/>`;
  if (shine) s += `<ellipse class="ne" cx="${(cx - rx * 0.4).toFixed(1)}" cy="${(cy - ry * 0.5).toFixed(1)}" rx="${(rx * 0.25).toFixed(1)}" ry="${(ry * 0.15).toFixed(1)}" fill="#fff" opacity=".55"/>`;
  return s;
}
const ell = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
const circ = (cx, cy, r) => `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r}"/>`;

// Several overlapping blobs with one clean outline around the outside (no inner lines).
function blobs(list, color, shade = true) {
  const k = id();
  const shapes = list.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`).join('');
  let s = `<g fill="${color}">${shapes}</g><g class="ne" fill="${color}">${list.map(([cx, cy, r]) => `<circle class="ne" cx="${cx}" cy="${cy}" r="${r}"/>`).join('')}</g>`;
  if (shade) {
    const ys = list.map(b => b[1] + b[2]), bottom = Math.max(...ys);
    const xs = list.map(b => b[0]), cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const w = Math.max(...list.map(b => b[0] + b[2])) - Math.min(...list.map(b => b[0] - b[2]));
    s += `<clipPath id="${k}">${shapes}</clipPath><ellipse class="ne" clip-path="url(#${k})" cx="${cx + w * 0.12}" cy="${bottom + 4}" rx="${w * 0.6}" ry="${w * 0.32}" fill="${INK}" opacity=".14"/>`;
    for (const [bx, by, r] of list.slice(0, 3)) s += `<circle class="ne" cx="${(bx - r * 0.35).toFixed(1)}" cy="${(by - r * 0.4).toFixed(1)}" r="${(r * 0.22).toFixed(1)}" fill="#fff" opacity=".35"/>`;
  }
  return s;
}

// Shiny cartoon eye: white, pupil, sparkle.
const eye = (x, y, r = 4) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" class="t"/><circle class="ne" cx="${(x + r * 0.15).toFixed(1)}" cy="${(y + r * 0.15).toFixed(1)}" r="${(r * 0.62).toFixed(1)}" fill="${INK}"/>` +
  `<circle class="ne" cx="${(x - r * 0.1).toFixed(1)}" cy="${(y - r * 0.2).toFixed(1)}" r="${(r * 0.24).toFixed(1)}" fill="#fff"/>`;
const dotEye = (x, y, r = 2.2) => `<circle class="ne" cx="${x}" cy="${y}" r="${r}" fill="${INK}"/><circle class="ne" cx="${x - 0.6}" cy="${y - 0.7}" r="${r * 0.35}" fill="#fff"/>`;
const cheek = (x, y, rx = 3.6) => `<ellipse class="ne" cx="${x}" cy="${y}" rx="${rx}" ry="${(rx * 0.65).toFixed(1)}" fill="#ff8fab" opacity=".6"/>`;
const smile = (x, y, w = 3) => `<path class="t" d="M${x - w} ${y} Q${x} ${y + w * 0.9} ${x + w} ${y}" fill="none"/>`;
// A thick line with an outline: draw it twice, ink underneath.
const tube = (d, color, w = 7) => `<path d="${d}" fill="none" style="stroke:${INK};stroke-width:${w + 6}"/><path d="${d}" fill="none" style="stroke:${color};stroke-width:${w}"/>`;

/* ======================================================================
   ANIMALS
   ====================================================================== */
const A = {};
A.frog = (c = '#7ed957', b = '#d8f5a2') => shadow(28) +
  `<ellipse cx="-21" cy="-6" rx="10" ry="7" fill="${c}"/><ellipse cx="21" cy="-6" rx="10" ry="7" fill="${c}"/>` +
  shaded(ell(0, -18, 25, 17), c) + `<ellipse class="t" cx="0" cy="-12" rx="14" ry="8" fill="${b}"/>` +
  `<circle cx="-13" cy="-32" r="10" fill="${c}"/><circle cx="13" cy="-32" r="10" fill="${c}"/>` +
  eye(-13, -33, 6) + eye(13, -33, 6) + `<path class="t" d="M-8 -21 Q0 -15 8 -21" fill="none"/>` + cheek(-17, -22) + cheek(17, -22) +
  `<ellipse cx="-12" cy="-2" rx="8" ry="3.5" fill="${c}"/><ellipse cx="12" cy="-2" rx="8" ry="3.5" fill="${c}"/>`;

A.cat = (c = '#ff9f43', b = '#fff0d9') => shadow(26) + tube('M16 -12 Q42 -10 38 -44', c) +
  shaded(ell(0, -20, 21, 16), c) + `<ellipse class="t" cx="0" cy="-15" rx="10" ry="9" fill="${b}"/>` +
  `<ellipse cx="-11" cy="-3" rx="7" ry="4.5" fill="${b}"/><ellipse cx="11" cy="-3" rx="7" ry="4.5" fill="${b}"/>` +
  `<path d="M-16 -50 L-15 -70 L-3 -58 Z" fill="${c}"/><path d="M16 -50 L15 -70 L3 -58 Z" fill="${c}"/>` +
  `<path class="ne" d="M-13 -54 L-13 -64 L-6 -58 Z" fill="#ffb3c7"/><path class="ne" d="M13 -54 L13 -64 L6 -58 Z" fill="#ffb3c7"/>` +
  shaded(circ(0, -44, 17), c) + `<path d="M-4 -60 L-3 -54 M0 -61 L0 -55 M4 -60 L3 -54" style="stroke:${dark(c, .3)};stroke-width:2.5"/>` +
  `<ellipse class="t" cx="0" cy="-38" rx="8" ry="5.5" fill="${b}"/>` + eye(-6, -46, 4.2) + eye(6, -46, 4.2) +
  `<path class="t" d="M-2.5 -41.5 L2.5 -41.5 L0 -38.5 Z" fill="#ff8fab"/>` +
  `<path class="t" d="M-8 -38 L-17 -39 M-8 -36 L-16 -34 M8 -38 L17 -39 M8 -36 L16 -34" fill="none"/>` + cheek(-11, -40) + cheek(11, -40);

A.duck = (c = '#ffd93d', b = '#f5b800') => shadow(26) +
  `<ellipse cx="-7" cy="-1" rx="6" ry="2.5" fill="#ff9f43"/><ellipse cx="8" cy="-1" rx="6" ry="2.5" fill="#ff9f43"/>` +
  `<path d="M-22 -26 L-36 -36 L-24 -14 Z" fill="${c}"/>` + shaded(ell(0, -20, 25, 17), c) +
  `<path class="t" d="M-14 -24 Q-2 -31 8 -20 Q-2 -10 -14 -16 Z" fill="${b}"/>` + shaded(circ(14, -42, 13), c) +
  `<ellipse cx="29" cy="-40" rx="9" ry="4.5" fill="#ff9f43"/><path class="t" d="M22 -40 L37 -40" fill="none"/>` + eye(17, -45, 3.8) + cheek(12, -37);

A.bunny = (c = '#ffffff', e = '#ffb3c7') => shadow(24) +
  `<ellipse cx="-8" cy="-70" rx="6" ry="16" fill="${c}"/><ellipse class="ne" cx="-8" cy="-70" rx="2.5" ry="10" fill="${e}"/>` +
  `<ellipse cx="8" cy="-70" rx="6" ry="16" fill="${c}"/><ellipse class="ne" cx="8" cy="-70" rx="2.5" ry="10" fill="${e}"/>` +
  `<circle cx="-21" cy="-16" r="7" fill="${c}"/>` + shaded(ell(0, -20, 19, 16), c) +
  `<ellipse cx="-9" cy="-2" rx="8" ry="4" fill="${c}"/><ellipse cx="9" cy="-2" rx="8" ry="4" fill="${c}"/>` +
  shaded(circ(0, -46, 16), c) + eye(-6, -48, 4) + eye(6, -48, 4) +
  `<ellipse class="ne" cx="0" cy="-41" rx="3" ry="2" fill="${e}"/><path class="t" d="M-3 -37.5 Q0 -35.5 0 -39 Q0 -35.5 3 -37.5" fill="none"/>` + cheek(-11, -41) + cheek(11, -41);

A.penguin = (c = '#3e4a6b') => shadow(24) +
  `<ellipse cx="-21" cy="-30" rx="6" ry="14" fill="${c}" transform="rotate(14 -21 -30)"/><ellipse cx="21" cy="-30" rx="6" ry="14" fill="${c}" transform="rotate(-14 21 -30)"/>` +
  shaded(ell(0, -30, 20, 28), c) + `<ellipse class="t" cx="0" cy="-24" rx="12" ry="19" fill="#fff"/>` +
  eye(-7, -47, 4.5) + eye(7, -47, 4.5) + `<path class="t" d="M-5 -41 L5 -41 L0 -35 Z" fill="#ff9f43"/>` + cheek(-12, -39) + cheek(12, -39) +
  `<path d="M-17 -33 Q0 -26 17 -33 L17 -28 Q0 -21 -17 -28 Z" fill="#e63946"/><path d="M7 -29 L12 -16 L4 -18 Z" fill="#e63946"/>` +
  `<ellipse cx="-8" cy="-1" rx="8" ry="4" fill="#ff9f43"/><ellipse cx="8" cy="-1" rx="8" ry="4" fill="#ff9f43"/>`;

A.snail = (c = '#b57edc', b = '#ffd6a5') => shadow(34) +
  `<path d="M-30 -8 L-32 -24 M-24 -8 L-22 -24" fill="none"/>` + eye(-32, -26, 3.6) + eye(-22, -26, 3.6) +
  `<path d="M-38 0 Q-40 -13 -27 -13 L24 -13 Q34 -12 34 0 Z" fill="${b}"/>` + smile(-30, -6, 2.5) + cheek(-23, -6, 3) +
  shaded(circ(6, -27, 18), c) + `<path d="M6 -27 m-2 0 a4 4 0 1 1 4 4 a9 9 0 1 1 -9 -9 a13 13 0 0 1 13 13" fill="none" style="stroke-width:2.5"/>`;

A.turtle = (c = '#4cc38a', b = '#9be8bf') => shadow(36) +
  `<ellipse cx="-18" cy="-4" rx="7" ry="5" fill="${b}"/><ellipse cx="16" cy="-4" rx="7" ry="5" fill="${b}"/><path d="M-32 -10 L-43 -6 L-32 -4 Z" fill="${b}"/>` +
  shaded(circ(34, -22, 10), b) + eye(37, -25, 3.3) + smile(36, -18, 3) + cheek(31, -18, 3) +
  shaded(`<path d="M-30 -8 Q-30 -46 0 -46 Q30 -46 30 -8 Z" cx="0" cy="-27" rx="30" ry="19"/>`, c) +
  `<path class="t" d="M-8 -39 L8 -39 L12 -27 L0 -19 L-12 -27 Z" fill="${light(c, .3)}"/><path class="t" d="M-12 -27 L-26 -22 M12 -27 L26 -22 M-8 -39 L-14 -44 M8 -39 L14 -44 M0 -19 L0 -9" fill="none"/>` +
  `<path d="M-32 -9 L32 -9 Q30 -2 0 -2 Q-30 -2 -32 -9 Z" fill="${dark(c, .15)}"/>`;

A.fox = (c = '#ee6c4d') => shadow(28) +
  `<path d="M-18 -14 Q-54 -12 -48 -52 Q-32 -34 -16 -30 Z" fill="${c}"/><path class="t" d="M-52 -46 Q-50 -54 -44 -55 Q-44 -48 -47 -44 Z" fill="#fff"/>` +
  shaded(ell(0, -20, 22, 16), c) + `<ellipse class="t" cx="8" cy="-16" rx="9" ry="8" fill="#fff"/>` +
  `<ellipse cx="-10" cy="-3" rx="7" ry="4.5" fill="${dark(c, .45)}"/><ellipse cx="11" cy="-3" rx="7" ry="4.5" fill="${dark(c, .45)}"/>` +
  `<path d="M4 -52 L7 -74 L18 -56 Z" fill="${c}"/><path d="M22 -52 L28 -72 L32 -50 Z" fill="${c}"/>` +
  `<path class="ne" d="M6 -66 L7 -72 L11 -63 Z" fill="${INK}"/><path class="ne" d="M26 -66 L28 -71 L29 -63 Z" fill="${INK}"/>` +
  shaded(circ(15, -42, 15), c) + `<ellipse class="t" cx="27" cy="-37" rx="9" ry="6" fill="#fff"/>` +
  `<circle class="ne" cx="35" cy="-38" r="2.8" fill="${INK}"/>` + eye(15, -46, 3.8) + cheek(11, -38);

A.dog = (c = '#d9a066') => shadow(26) + tube('M-17 -24 Q-30 -32 -26 -44', c, 6) +
  shaded(ell(0, -20, 21, 15), c) +
  `<ellipse cx="-11" cy="-3" rx="7" ry="4.5" fill="${c}"/><ellipse cx="11" cy="-3" rx="7" ry="4.5" fill="${c}"/>` +
  `<path d="M-6 -29 Q6 -24 18 -29 L18 -25 Q6 -20 -6 -25 Z" fill="#e63946"/><circle class="t" cx="6" cy="-21" r="2.6" fill="#ffd93d"/>` +
  shaded(circ(6, -42, 16), c) +
  `<ellipse cx="-9" cy="-39" rx="6" ry="11" fill="${dark(c, .3)}" transform="rotate(18 -9 -39)"/><ellipse cx="21" cy="-39" rx="6" ry="11" fill="${dark(c, .3)}" transform="rotate(-18 21 -39)"/>` +
  `<ellipse class="t" cx="6" cy="-36" rx="8" ry="6" fill="#fff4e0"/><ellipse class="ne" cx="6" cy="-39.5" rx="3.4" ry="2.5" fill="${INK}"/>` +
  smile(6, -35, 2.5) + eye(0, -46, 3.8) + eye(12, -46, 3.8) + cheek(-3, -37) + cheek(15, -37);

A.pig = (c = '#ffb3c7') => shadow(26) +
  `<path d="M-22 -22 q-7 -2 -5 -7 q4 -3 3 2" fill="none" style="stroke-width:2.5"/>` +
  `<ellipse cx="-12" cy="-3" rx="6" ry="4.5" fill="${dark(c, .15)}"/><ellipse cx="12" cy="-3" rx="6" ry="4.5" fill="${dark(c, .15)}"/>` +
  shaded(ell(0, -20, 23, 16), c) +
  `<path d="M0 -49 L-2 -60 L8 -54 Z" fill="${c}"/><path d="M15 -51 L21 -61 L23 -49 Z" fill="${c}"/>` +
  shaded(circ(10, -38, 15), c) + `<ellipse class="t" cx="17" cy="-33" rx="7" ry="5" fill="${dark(c, .12)}"/>` +
  `<ellipse class="ne" cx="15" cy="-33" rx="1.4" ry="2" fill="${INK}"/><ellipse class="ne" cx="19" cy="-33" rx="1.4" ry="2" fill="${INK}"/>` +
  eye(5, -43, 3.5) + eye(16, -43.5, 3.2) + cheek(3, -35);

A.owl = (c = '#a47c5b', b = '#e8d2b0') => shadow(22) +
  `<ellipse cx="-6" cy="-1" rx="4" ry="2" fill="#ff9f43"/><ellipse cx="6" cy="-1" rx="4" ry="2" fill="#ff9f43"/>` +
  `<path d="M-14 -44 L-16 -56 L-5 -48 Z" fill="${c}"/><path d="M14 -44 L16 -56 L5 -48 Z" fill="${c}"/>` +
  shaded(ell(0, -26, 19, 24), c) + `<ellipse class="t" cx="0" cy="-17" rx="12" ry="14" fill="${b}"/>` +
  `<path class="t" d="M-5 -20 l2 2 l2 -2 M1 -20 l2 2 l2 -2 M-2 -13 l2 2 l2 -2" fill="none"/>` +
  `<ellipse cx="-17" cy="-22" rx="6" ry="13" fill="${dark(c, .2)}"/><ellipse cx="17" cy="-22" rx="6" ry="13" fill="${dark(c, .2)}"/>` +
  `<circle class="t" cx="-7" cy="-37" r="8" fill="#fff6e8"/><circle class="t" cx="7" cy="-37" r="8" fill="#fff6e8"/>` +
  eye(-7, -37, 5) + eye(7, -37, 5) + `<path class="t" d="M-3 -31 L3 -31 L0 -26 Z" fill="#ff9f43"/>`;

A.hedgehog = (c = '#8d6e63', b = '#f5d6b4') => shadow(30) +
  `<path d="M-28 -5 L-33 -13 L-27 -16 L-30 -26 L-21 -24 L-19 -34 L-11 -28 L-5 -38 L1 -30 L9 -37 L11 -27 L19 -30 L17 -19 L24 -16 L20 -6 Z" fill="${c}"/>` +
  `<path class="t" d="M-18 -14 l4 -6 M-8 -18 l3 -7 M2 -16 l4 -7 M-12 -8 l4 -6 M6 -9 l4 -6" fill="none"/>` +
  `<ellipse cx="-12" cy="-2" rx="6" ry="3" fill="${b}"/><ellipse cx="10" cy="-2" rx="6" ry="3" fill="${b}"/>` +
  shaded(ell(20, -14, 12, 10), b) + `<circle class="ne" cx="32" cy="-15" r="2.8" fill="${INK}"/>` + eye(21, -18, 3.2) + cheek(19, -10);

A.chick = (c = '#ffe066') => shadow(15) +
  `<path d="M-3 -3 L-3 1 M3 -3 L3 1" style="stroke:#ff9f43;stroke-width:3"/>` +
  shaded(ell(0, -14, 13, 12), c) + `<ellipse class="t" cx="-4" cy="-14" rx="6" ry="4" fill="${dark(c, .1)}"/>` +
  shaded(circ(3, -28, 9), c) + `<path class="t" d="M1 -36 Q2 -42 5 -36" fill="${c}"/>` +
  `<path class="t" d="M11 -30 L17 -28 L11 -26 Z" fill="#ff9f43"/>` + eye(6, -30, 2.8) + cheek(2, -24, 2.6);

A.mouse = (c = '#b8b8c8') => shadow(20) +
  `<path d="M-14 -8 Q-31 -6 -28 -21" fill="none" style="stroke:${INK};stroke-width:5"/><path d="M-14 -8 Q-31 -6 -28 -21" fill="none" style="stroke:#ffb3c7;stroke-width:2"/>` +
  shaded(ell(0, -14, 15, 12), c) + `<ellipse cx="-6" cy="-2" rx="5" ry="2.5" fill="${c}"/><ellipse cx="7" cy="-2" rx="5" ry="2.5" fill="${c}"/>` +
  `<circle cx="5" cy="-33" r="7" fill="${c}"/><circle class="ne" cx="5" cy="-33" r="4" fill="#ffb3c7"/>` +
  `<circle cx="19" cy="-33" r="7" fill="${c}"/><circle class="ne" cx="19" cy="-33" r="4" fill="#ffb3c7"/>` +
  shaded(circ(12, -24, 10), c) + `<circle class="t" cx="22" cy="-23" r="2.2" fill="#ff8fab"/>` +
  `<path class="t" d="M20 -21 L28 -20 M20 -24 L28 -26" fill="none"/>` + eye(14, -27, 2.9) + cheek(11, -20, 2.8);

/* ======================================================================
   PEOPLE  (one function, many outfits)
   ====================================================================== */
function person(o) {
  const skin = o.skin, hair = o.hair;
  let s = shadow(15);
  // legs or dress
  if (o.dress) {
    s += `<rect x="-6" y="-12" width="4" height="10" rx="2" fill="${skin}"/><rect x="2" y="-12" width="4" height="10" rx="2" fill="${skin}"/>`;
  } else {
    s += `<rect x="-7" y="-16" width="6" height="14" rx="2.5" fill="${o.bottom}"/><rect x="1" y="-16" width="6" height="14" rx="2.5" fill="${o.bottom}"/>`;
  }
  s += `<ellipse cx="-4.5" cy="-2" rx="5" ry="3" fill="${o.shoes}"/><ellipse cx="4.5" cy="-2" rx="5" ry="3" fill="${o.shoes}"/>`;
  // arms behind body
  s += `<rect x="-15" y="-34" width="6" height="18" rx="3" fill="${o.top}"/><circle cx="-12" cy="-16" r="3.2" fill="${skin}"/>`;
  s += `<rect x="9" y="-34" width="6" height="18" rx="3" fill="${o.top}"/><circle cx="12" cy="-16" r="3.2" fill="${skin}"/>`;
  // body
  if (o.dress) s += `<path d="M-9 -36 L9 -36 L13 -12 L-13 -12 Z" fill="${o.top}"/>` + `<path class="ne" d="M-12 -16 L12 -16" style="stroke:${light(o.top, .5)};stroke-width:2.5"/>`;
  else s += shaded(`<rect x="-10" y="-37" width="20" height="23" rx="7"/>`, o.top, { shine: false });
  if (o.overalls) s += `<path class="t" d="M-7 -28 L7 -28 L7 -15 L-7 -15 Z" fill="${o.overalls}"/><path class="t" d="M-7 -28 L-8 -36 M7 -28 L8 -36" fill="none" style="stroke:${INK}"/>`;
  if (o.stripe) s += `<path class="ne" d="M-10 -28 L10 -28" style="stroke:${o.stripe};stroke-width:3.5"/>`;
  // head
  s += shaded(circ(0, -50, 15), skin, { shine: false });
  // hair styles
  if (hair) {
    const h = o.hairStyle;
    if (h === 'buns') s += `<circle cx="-14" cy="-60" r="7" fill="${hair}"/><circle cx="14" cy="-60" r="7" fill="${hair}"/>`;
    if (h === 'bob') s += `<path d="M-16 -46 Q-18 -68 0 -67 Q18 -68 16 -46 L12 -46 Q11 -57 0 -58 Q-11 -57 -12 -46 Z" fill="${hair}"/>`;
    else if (h === 'spiky') s += `<path d="M-15 -52 L-14 -62 L-9 -59 L-6 -67 L-1 -61 L4 -68 L7 -60 L13 -64 L15 -52 Q0 -58 -15 -52 Z" fill="${hair}"/>`;
    else if (h === 'long') s += `<path d="M-16 -50 Q-17 -68 0 -67 Q17 -68 16 -50 L17 -34 L11 -36 L11 -52 Q0 -58 -11 -52 L-11 -36 L-17 -34 Z" fill="${hair}"/>`;
    else s += `<path d="M-15 -51 Q-14 -67 0 -66 Q14 -67 15 -51 Q6 -59 -15 -51 Z" fill="${hair}"/>`;
  }
  // face
  s += dotEye(-5, -49) + dotEye(5, -49) + smile(0, -43, 3) + cheek(-9, -44, 3) + cheek(9, -44, 3);
  if (o.glasses) s += `<circle cx="-5" cy="-49" r="4.5" fill="none" class="t"/><circle cx="5" cy="-49" r="4.5" fill="none" class="t"/><path class="t" d="M-0.5 -49 L0.5 -49"/>`;
  if (o.beard) s += `<path d="M-12 -47 Q-12 -32 0 -32 Q12 -32 12 -47 Q6 -40 0 -41 Q-6 -40 -12 -47 Z" fill="${o.beard}"/>` + smile(0, -42, 2.5);
  // hats
  if (o.hat === 'cap') s += `<path d="M-15 -55 Q0 -73 15 -55 Z" fill="${o.hatColor}"/><path d="M8 -57 L22 -55 L15 -53 Z" fill="${o.hatColor}"/>`;
  if (o.hat === 'beanie') s += `<path d="M-15 -54 Q0 -76 15 -54 Z" fill="${o.hatColor}"/><rect x="-16" y="-57" width="32" height="6" rx="3" fill="${light(o.hatColor, .3)}"/><circle cx="0" cy="-70" r="4" fill="${light(o.hatColor, .5)}"/>`;
  if (o.hat === 'sun') s += `<ellipse cx="0" cy="-56" rx="22" ry="5" fill="${o.hatColor}"/><path d="M-11 -57 Q0 -74 11 -57 Z" fill="${o.hatColor}"/><path class="ne" d="M-11 -59 L11 -59" style="stroke:#ff8fab;stroke-width:3"/>`;
  // held things (right hand at 12,-16)
  if (o.hold === 'balloon') s += `<path class="t" d="M12 -16 Q16 -50 18 -78" fill="none"/>` + shaded(ell(18, -90, 10, 12), o.holdColor) + `<path class="t" d="M16 -78 L20 -78 L18 -75 Z" fill="${o.holdColor}"/>`;
  if (o.hold === 'icecream') s += `<path class="t" d="M9 -20 L15 -20 L12 -9 Z" fill="#f2c27b"/><circle cx="12" cy="-24" r="5" fill="${o.holdColor}"/>`;
  if (o.hold === 'bag') s += `<path class="t" d="M9 -18 Q12 -24 15 -18" fill="none"/><rect x="7" y="-18" width="11" height="12" rx="2" fill="${o.holdColor}"/>`;
  return s;
}
const SKINS = ['#ffd8b8', '#f2b48c', '#c98a64', '#8d5a3b'];
const people = [
  { skin: SKINS[0], top: '#ff8fab', bottom: '#5d5a82', shoes: '#4a3150', hair: '#8d5a3b', hairStyle: 'buns', glasses: true, hold: 'balloon', holdColor: '#ffd93d' },
  { skin: SKINS[1], top: '#7ec8ff', bottom: '#3e4a6b', shoes: '#ffffff', hat: 'cap', hatColor: '#e63946', hold: 'bag', holdColor: '#ffd93d' },
  { skin: SKINS[2], top: '#ffd93d', dress: true, shoes: '#e63946', hair: '#4a3150', hairStyle: 'long', hold: 'icecream', holdColor: '#ffb3c7' },
  { skin: SKINS[3], top: '#7ed9c3', bottom: '#5d5a82', shoes: '#4a3150', hat: 'beanie', hatColor: '#3a86ff' },
  { skin: SKINS[0], top: '#c9a0ff', dress: true, shoes: '#7ec8ff', hair: '#f4a261', hairStyle: 'bob', hat: 'sun', hatColor: '#fff6bf' },
  { skin: SKINS[1], top: '#ffb347', bottom: '#5d5a82', shoes: '#4a3150', hair: '#4a3150', hairStyle: 'spiky', stripe: '#ffffff' },
  { skin: SKINS[2], top: '#ffffff', bottom: '#3a86ff', shoes: '#4a3150', overalls: '#3a86ff', hair: '#4a3150', hairStyle: 'short', beard: '#8d5a3b' },
  { skin: SKINS[3], top: '#ff8fab', bottom: '#7ed9c3', shoes: '#ffffff', hair: '#4a3150', hairStyle: 'buns', hold: 'balloon', holdColor: '#7ec8ff' },
  { skin: SKINS[0], top: '#7ed957', bottom: '#5d5a82', shoes: '#4a3150', hair: '#ffd93d', hairStyle: 'short', glasses: true, hold: 'bag', holdColor: '#ff8fab' },
  { skin: SKINS[1], top: '#e63946', dress: true, shoes: '#4a3150', hair: '#8d5a3b', hairStyle: 'long', hat: 'sun', hatColor: '#ffd6a5' },
  { skin: SKINS[2], top: '#3e4a6b', bottom: '#9c95aa', shoes: '#4a3150', hair: '#9aa0a6', hairStyle: 'short', glasses: true, beard: '#d9dce1' },
  { skin: SKINS[3], top: '#ffd93d', bottom: '#ee6c4d', shoes: '#ffffff', hat: 'cap', hatColor: '#7ed957', hold: 'icecream', holdColor: '#c9f0e0' },
];

/* ======================================================================
   BUILDINGS  (isometric, feet at the front corner of the ground diamond)
   ====================================================================== */
function building(b) {
  const a = b.a, h = b.h, fl = b.fl || 2;
  // Ground diamond corners, shifted up so the front corner B is at (0,0).
  const T = [0, -a], Rr = [a, -a / 2], B = [0, 0], L = [-a, -a / 2];
  const up = (p, d) => [p[0], p[1] - d];
  const P = pts => pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const lf = (s, t) => [L[0] + s * (B[0] - L[0]), L[1] + s * (B[1] - L[1]) - t * h];
  const rf = (s, t) => [B[0] + s * (Rr[0] - B[0]), B[1] + s * (Rr[1] - B[1]) - t * h];
  const quad = (f, s0, s1, t0, t1) => P([f(s0, t0), f(s1, t0), f(s1, t1), f(s0, t1)]);
  const pane = (f, s0, s1, t0, t1, flowers) => {
    const sm = (s0 + s1) / 2, tm = (t0 + t1) / 2;
    let w = `<polygon points="${quad(f, s0, s1, t0, t1)}" fill="#cfeefa" style="stroke-width:2.5"/>`;
    w += `<polygon class="ne" points="${quad(f, s0 + .02, sm - .03, tm + .02, t1 - .03)}" fill="#fff" opacity=".55"/>`;
    w += `<path class="t" d="M${P([f(sm, t0), f(sm, t1)]).replace(' ', ' L')} M${P([f(s0, tm), f(s1, tm)]).replace(' ', ' L')}" fill="none"/>`;
    w += `<polygon class="t" points="${quad(f, s0 - .03, s1 + .03, t0 - .03, t0)}" fill="#fff"/>`;
    if (flowers) {
      w += `<polygon class="t" points="${quad(f, s0 - .02, s1 + .02, t0 - .09, t0 - .03)}" fill="#8fd36b"/>`;
      for (let i = 0; i < 4; i++) { const p = f(s0 + (s1 - s0) * (i + .5) / 4, t0 - .02); w += `<circle class="ne" cx="${p[0].toFixed(1)}" cy="${(p[1] - 1).toFixed(1)}" r="2.2" fill="${['#ff8fab', '#ffd93d', '#c9a0ff', '#ff8fab'][i]}"/>`; }
    }
    return w;
  };

  let s = `<polygon class="ne" points="${P([L, B, Rr, T].map(p => [p[0] + 7, p[1] + 5]))}" fill="${INK}" opacity=".14"/>`;
  s += `<polygon points="${P([L, B, up(B, h), up(L, h)])}" fill="${b.left}"/>`;
  s += `<polygon points="${P([B, Rr, up(Rr, h), up(B, h)])}" fill="${b.right}"/>`;
  // foundation band
  s += `<polygon class="t" points="${quad(lf, 0, 1, 0, 8 / h)}" fill="${dark(b.left, .25)}"/><polygon class="t" points="${quad(rf, 0, 1, 0, 8 / h)}" fill="${dark(b.right, .25)}"/>`;
  s += `<polygon points="${P([up(T, h), up(Rr, h), up(B, h), up(L, h)])}" fill="${b.top}"/>`;

  for (let i = 0; i < fl; i++) {
    const t0 = (i + .3) / fl, t1 = (i + .75) / fl;
    s += pane(lf, .14, .4, t0, t1, b.flowers && i === 0) + pane(lf, .58, .84, t0, t1, b.flowers && i === 0);
    if (i > 0) s += pane(rf, .14, .4, t0, t1);
    s += pane(rf, .58, .84, t0, t1);
  }
  // door on the right face, with a frame and knob
  const dt = Math.min(.62 / fl, 46 / h), d0 = 8 / h;
  s += `<polygon points="${quad(rf, .12, .42, d0, dt + .03)}" fill="${light(b.right, .5)}"/>`;
  s += `<polygon points="${quad(rf, .16, .38, d0, dt)}" fill="${b.door || '#b07a52'}"/>`;
  const kn = rf(.33, (d0 + dt) / 2);
  s += `<circle class="ne" cx="${kn[0].toFixed(1)}" cy="${kn[1].toFixed(1)}" r="1.8" fill="#ffd93d"/>`;
  // striped shop awning over the door, sticking out from the wall
  if (b.awning) {
    const n = 6, out = [7, 10];
    for (let i = 0; i < n; i++) {
      const s0 = .08 + i * (.4 / n), s1 = s0 + .4 / n;
      const p1 = rf(s0, dt + .1), p2 = rf(s1, dt + .1), p3 = [rf(s1, dt + .1)[0] + out[0], rf(s1, dt + .1)[1] + out[1]], p4 = [rf(s0, dt + .1)[0] + out[0], rf(s0, dt + .1)[1] + out[1]];
      s += `<polygon class="t" points="${P([p1, p2, p3, p4])}" fill="${i % 2 ? '#fff' : b.awning}"/>`;
    }
  }
  // shop sign on the left face
  if (b.sign) {
    // In the gap between the ground floor windows and the first floor windows.
    const t = .8 / fl;
    s += `<polygon points="${quad(lf, .22, .78, t, t + 18 / h)}" fill="#fff"/>`;
    const c = lf(.34, t + 9 / h);
    s += `<circle class="t" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="4.5" fill="${b.sign}"/>`;
    // two short lines that read as lettering
    for (const y of [6, 11]) {
      const p0 = lf(.45, t + y / h), p1 = lf(.7, t + y / h);
      s += `<path class="ne" d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} L${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" style="stroke:${dark(b.left, .35)};stroke-width:2.5"/>`;
    }
  }

  // roofs
  const Lh = up(L, h), Bh = up(B, h), Rh = up(Rr, h), Th = up(T, h);
  if (b.roof === 'pyr') {
    const ap = [0, -a / 2 - h - a * 0.62];
    s += `<polygon points="${P([Lh, Bh, ap])}" fill="${b.rl}"/><polygon points="${P([Bh, Rh, ap])}" fill="${b.rr}"/>`;
    for (const t of [.28, .55]) {
      s += `<path class="t" d="M${P([lerp(Lh, ap, t), lerp(Bh, ap, t)]).replace(' ', ' L')} M${P([lerp(Bh, ap, t), lerp(Rh, ap, t)]).replace(' ', ' L')}" fill="none" opacity=".6"/>`;
    }
    if (b.chimney) {
      const c = lerp(lerp(Bh, Rh, .6), ap, .35);
      s += `<rect x="${(c[0] - 6).toFixed(1)}" y="${(c[1] - 22).toFixed(1)}" width="12" height="20" fill="${b.chimney}"/><rect x="${(c[0] - 8).toFixed(1)}" y="${(c[1] - 26).toFixed(1)}" width="16" height="6" rx="1.5" fill="${dark(b.chimney, .15)}"/>`;
    }
  } else if (b.roof === 'flat') {
    const C = [0, -a / 2 - h], k = .84;
    const inset = p => [C[0] + (p[0] - C[0]) * k, C[1] + (p[1] - C[1]) * k];
    s += `<polygon class="t" points="${P([Th, Rh, Bh, Lh].map(inset))}" fill="${dark(b.top, .08)}"/>`;
    if (b.ac) s += `<rect x="${(C[0] - 4).toFixed(1)}" y="${(C[1] - 16).toFixed(1)}" width="22" height="14" rx="2" fill="#d9dce1"/><circle class="t" cx="${(C[0] + 7).toFixed(1)}" cy="${(C[1] - 9).toFixed(1)}" r="4.5" fill="#9aa0a6"/>`;
  } else if (b.roof === 'cupcake') {
    const x = 0, y = -a / 2 - h + 4;
    s += `<g transform="translate(${x},${y})"><path d="M-28 0 L-22 -34 L22 -34 L28 0 Z" fill="#ffd0e0"/><path class="t" d="M-9 -2 L-7 -33 M9 -2 L7 -33" fill="none"/>` +
      shaded(ell(0, -38, 30, 13), '#ff8fab') + shaded(circ(0, -55, 17), '#ff8fab') +
      ['#ffd93d', '#7ec8ff', '#7ed957', '#fff'].map((col, i) => `<rect class="ne" x="${-18 + i * 11}" y="${-42 + (i % 2) * 5}" width="5" height="2.4" rx="1" fill="${col}" transform="rotate(${i * 40 - 30} ${-16 + i * 11} ${-41 + (i % 2) * 5})"/>`).join('') +
      shaded(circ(0, -74, 6), '#e63946') + `</g>`;
  } else if (b.roof === 'cone') {
    const y = -a / 2 - h + 2;
    s += `<g transform="translate(0,${y})"><path d="M-18 -40 L0 0 L18 -40 Z" fill="#f2c27b"/><path class="t" d="M-12 -34 L6 -12 M-4 -40 L10 -22 M12 -34 L-6 -12 M4 -40 L-10 -22" fill="none" opacity=".6"/>` +
      shaded(circ(0, -48, 21), '#ffb3c7') + shaded(circ(0, -72, 14), '#c9f0e0') + shaded(circ(0, -88, 5), '#e63946') + `</g>`;
  }
  return s;
}
function buildingTop(b) {
  const roof = b.roof === 'pyr' ? b.a * 0.62 + (b.chimney ? 4 : 0) : b.roof === 'cupcake' ? 82 : b.roof === 'cone' ? 97 : b.ac ? 18 : 0;
  return -b.a / 2 - b.h - roof - (b.roof === 'flat' ? b.a / 2 : 0) - 8;
}

/* ======================================================================
   PROPS, SCENERY, VEHICLES
   ====================================================================== */
const P = {};
P.mailbox = (c = '#3a86ff') => shadow(14) + `<rect x="-3" y="-30" width="6" height="30" fill="#9aa0a6"/>` +
  shaded(`<path d="M-13 -28 L-13 -46 Q0 -60 13 -46 L13 -28 Z" cx="0" cy="-40" rx="13" ry="13"/>`, c) +
  `<path class="t" d="M-8 -36 L8 -36" fill="none"/><rect x="13" y="-50" width="3" height="16" fill="#9aa0a6"/><rect x="13" y="-50" width="10" height="6" fill="#e63946"/>`;
P.hydrant = (c = '#e63946') => shadow(13) + `<rect x="-11" y="-7" width="22" height="7" rx="2" fill="${dark(c, .15)}"/>` +
  `<rect x="-14" y="-24" width="6" height="7" rx="2" fill="${c}"/><rect x="8" y="-24" width="6" height="7" rx="2" fill="${c}"/>` +
  shaded(`<rect x="-8" y="-32" width="16" height="26" rx="4"/>`, c) +
  `<path d="M-9 -32 Q0 -44 9 -32 Z" fill="${c}"/><rect x="-2.5" y="-45" width="5" height="5" rx="1" fill="${dark(c, .15)}"/>`;
P.bike = (c = '#2ec4b6') => shadow(26) +
  `<circle cx="-14" cy="-10" r="9.5" fill="none"/><circle cx="14" cy="-10" r="9.5" fill="none"/><circle class="ne" cx="-14" cy="-10" r="2.5" fill="${INK}"/><circle class="ne" cx="14" cy="-10" r="2.5" fill="${INK}"/>` +
  tube('M-14 -10 L-4 -24 L10 -24 L14 -10 M-4 -24 L1 -10 L-14 -10 M1 -10 L10 -24', c, 3) +
  `<path d="M-8 -28 L1 -28" style="stroke:${INK};stroke-width:5"/><path d="M10 -24 L12 -32 L18 -32" fill="none" style="stroke-width:3.5"/>` +
  `<path class="t" d="M14 -36 L26 -36 L24 -27 L16 -27 Z" fill="#f2c27b"/><circle class="t" cx="18" cy="-38" r="3" fill="#ff8fab"/><circle class="t" cx="23" cy="-38" r="3" fill="#ffd93d"/>`;
P.balloons = (c = '#ff6b8b') => shadow(10) +
  `<path class="t" d="M0 -4 Q-6 -30 -10 -50 M0 -4 Q4 -36 5 -58 M0 -4 Q8 -28 14 -44" fill="none"/>` +
  shaded(ell(-10, -60, 9, 11), c) + shaded(ell(5, -68, 9, 11), mix(c, '#ffd93d', .7)) + shaded(ell(14, -54, 9, 11), mix(c, '#7ec8ff', .8)) +
  `<rect x="-4" y="-6" width="8" height="6" rx="2" fill="#9aa0a6"/>`;
P.bench = (c = '#d9a066') => shadow(26) + `<rect x="-22" y="-12" width="4" height="12" fill="#6b7fa3"/><rect x="18" y="-12" width="4" height="12" fill="#6b7fa3"/>` +
  `<rect x="-25" y="-31" width="50" height="5" rx="2" fill="${c}"/><rect x="-25" y="-24" width="50" height="5" rx="2" fill="${c}"/><rect x="-26" y="-15" width="52" height="6" rx="2" fill="${dark(c, .1)}"/>`;
P.umbrella = (c = '#7ed9c3') => shadow(26) + `<rect x="-1.5" y="-62" width="3" height="50" fill="#9aa0a6"/>` +
  `<path d="M-18 -6 L-16 -14 M18 -6 L16 -14" style="stroke-width:3"/><ellipse cx="0" cy="-15" rx="20" ry="6" fill="#ffffff"/>` +
  `<path d="M-34 -54 Q0 -84 34 -54 Q26 -50 17 -54 Q8 -50 0 -54 Q-8 -50 -17 -54 Q-26 -50 -34 -54 Z" fill="${c}"/>` +
  `<path class="ne" d="M-9 -54.5 Q-6 -74 0 -77 Q6 -74 9 -54.5 Q4 -51 0 -54 Q-4 -51 -9 -54.5 Z" fill="#fff"/><circle cx="0" cy="-78" r="3" fill="${c}"/>`;
P.flowerpot = (c = '#ff8fab') => shadow(13) + blobs([[-6, -24, 7], [6, -26, 7], [0, -32, 7]], '#6fc27a', false) +
  [[-6, -30], [6, -32], [0, -38], [-1, -26]].map(([x, y]) => `<circle class="t" cx="${x}" cy="${y}" r="3.5" fill="${c}"/><circle class="ne" cx="${x}" cy="${y}" r="1.4" fill="#ffd93d"/>`).join('') +
  `<path d="M-10 -15 L-8 0 L8 0 L10 -15 Z" fill="#e8946a"/><rect x="-12" y="-19" width="24" height="5" rx="2" fill="#f2a882"/>`;
P.trashcan = (c = '#6fc27a') => shadow(13) + shaded(`<rect x="-10" y="-27" width="20" height="27" rx="3"/>`, c, { shine: false }) +
  `<path class="t" d="M-4 -22 L-4 -5 M4 -22 L4 -5" fill="none"/><ellipse cx="0" cy="-28" rx="12" ry="4" fill="${dark(c, .12)}"/><rect x="-3" y="-34" width="6" height="4" rx="1.5" fill="${dark(c, .2)}"/>`;
P.cart = (c = '#ffd6e0') => shadow(32) + `<rect x="-1.5" y="-78" width="3" height="44" fill="#9aa0a6"/>` +
  `<path d="M-30 -74 Q0 -96 30 -74 Z" fill="#ff8fab"/><path class="ne" d="M-10 -75 Q0 -91 10 -75 Z" fill="#fff"/>` +
  shaded(`<rect x="-26" y="-38" width="46" height="26" rx="5"/>`, c) +
  `<path class="ne" d="M-24 -30 L18 -30" style="stroke:#7ec8ff;stroke-width:4"/>` +
  `<circle cx="-4" cy="-44" r="6" fill="#c9f0e0"/><circle cx="6" cy="-44" r="6" fill="#ffb3c7"/><path class="t" d="M-9 -40 L11 -40 L9 -37 L-7 -37 Z" fill="#f2c27b"/>` +
  `<path d="M20 -30 L30 -36" fill="none" style="stroke-width:3"/><circle cx="-16" cy="-8" r="7" fill="${INK}"/><circle class="ne" cx="-16" cy="-8" r="3" fill="#ddd"/><circle cx="12" cy="-8" r="7" fill="${INK}"/><circle class="ne" cx="12" cy="-8" r="3" fill="#ddd"/>`;

const S = {};
S.tree = c => shadow(30) + `<path d="M-6 0 L-4 -30 L4 -30 L6 0 Z" fill="#b07a52"/><path class="ne" d="M1 -2 L2 -28 L4 -28 L5 -2 Z" fill="${INK}" opacity=".15"/>` +
  blobs([[-18, -46, 18], [18, -46, 18], [0, -64, 26], [0, -42, 18]], c);
S.fruitTree = c => S.tree(c) + [[-18, -48], [12, -60], [20, -42], [-6, -70], [2, -46]].map(([x, y]) => `<circle class="t" cx="${x}" cy="${y}" r="4" fill="#ff6b6b"/>`).join('');
S.pine = c => shadow(24) + `<rect x="-4" y="-16" width="8" height="16" fill="#b07a52"/>` +
  `<path d="M-28 -14 L0 -50 L28 -14 Z" fill="${c}"/><path d="M-22 -36 L0 -70 L22 -36 Z" fill="${c}"/><path d="M-15 -56 L0 -86 L15 -56 Z" fill="${c}"/>` +
  `<path class="ne" d="M2 -50 L28 -14 L4 -14 Z M2 -70 L22 -36 L4 -36 Z M2 -86 L15 -56 L4 -56 Z" fill="${INK}" opacity=".13"/>`;
S.bush = (c, dots) => shadow(28) + blobs([[-16, -13, 14], [16, -13, 14], [0, -19, 17]], c) +
  (dots ? [[-14, -16], [8, -26], [18, -12], [-4, -10], [2, -22]].map(([x, y]) => `<circle class="t" cx="${x}" cy="${y}" r="2.8" fill="${dots}"/>`).join('') : '');
S.flower = c => `<path d="M0 0 L0 -12" fill="none" style="stroke:#4fa86a;stroke-width:3"/><ellipse class="t" cx="-5" cy="-6" rx="4" ry="2" fill="#6fc27a" transform="rotate(-30 -5 -6)"/>` +
  [...Array(5)].map((_, i) => { const a = i / 5 * Math.PI * 2; return `<circle class="t" cx="${(Math.cos(a) * 6).toFixed(1)}" cy="${(-14 + Math.sin(a) * 6).toFixed(1)}" r="5" fill="${c}"/>`; }).join('') +
  `<circle class="t" cx="0" cy="-14" r="3.5" fill="#ffd93d"/>`;
S.tulip = c => `<path d="M0 0 L0 -14" fill="none" style="stroke:#4fa86a;stroke-width:3"/><ellipse class="t" cx="4" cy="-6" rx="4" ry="2" fill="#6fc27a" transform="rotate(30 4 -6)"/>` +
  `<path class="t" d="M-6 -24 L-6 -14 Q0 -9 6 -14 L6 -24 L3 -19 L0 -25 L-3 -19 Z" fill="${c}"/>`;
S.lamp = () => shadow(9) + `<rect x="-7" y="-6" width="14" height="6" rx="2" fill="#6b7fa3"/><rect x="-3" y="-62" width="6" height="58" rx="2" fill="#6b7fa3"/>` +
  `<circle class="ne" cx="0" cy="-70" r="14" fill="#fff3a8" opacity=".35"/><path d="M-8 -64 L-6 -76 L6 -76 L8 -64 Z" fill="#fff3a8"/><path d="M-9 -76 L0 -84 L9 -76 Z" fill="#6b7fa3"/>`;
S.fountain = () => `<ellipse class="ne" cx="6" cy="2" rx="86" ry="30" fill="${INK}" opacity=".12"/>` +
  `<ellipse cx="0" cy="-8" rx="84" ry="36" fill="#d9dce1"/>` +
  [...Array(12)].map((_, i) => { const a = i / 12 * Math.PI * 2; return `<path class="t" d="M${(Math.cos(a) * 75).toFixed(1)} ${(-8 + Math.sin(a) * 31).toFixed(1)} L${(Math.cos(a) * 84).toFixed(1)} ${(-8 + Math.sin(a) * 36).toFixed(1)}" fill="none" opacity=".5"/>`; }).join('') +
  `<ellipse cx="0" cy="-12" rx="68" ry="27" fill="#8fd3e8"/><ellipse class="ne" cx="-14" cy="-18" rx="34" ry="10" fill="#b4e8f5" opacity=".8"/>` +
  `<path class="t" d="M-40 -6 q6 -3 12 0 M20 -2 q6 -3 12 0 M30 -20 q5 -3 10 0" fill="none" style="stroke:#fff"/>` +
  `<rect x="-7" y="-62" width="14" height="52" rx="4" fill="#c9d6e8"/>` + shaded(ell(0, -64, 24, 8), '#d9dce1', { shine: false }) +
  `<path class="ne" d="M-2 -66 Q-20 -88 -36 -40 M2 -66 Q20 -88 36 -40" fill="none" style="stroke:#bfe9ff;stroke-width:4;opacity:.9"/>` +
  `<circle class="drop ne" cx="-14" cy="-74" r="4" fill="#bfe9ff"/><circle class="drop ne" cx="10" cy="-78" r="4" fill="#bfe9ff" style="animation-delay:-.4s"/><circle class="drop ne" cx="0" cy="-84" r="4" fill="#bfe9ff" style="animation-delay:-.8s"/>`;

const V = {};
V.car = c => `<ellipse class="ne" cx="0" cy="-2" rx="34" ry="5" fill="${INK}" opacity=".15"/>` +
  `<path d="M-20 -26 L-12 -43 L14 -43 L22 -26 Z" fill="${c}"/>` +
  `<path class="t" d="M-13 -28 L-8 -40 L-1 -40 L-1 -28 Z M3 -28 L3 -40 L11 -40 L17 -28 Z" fill="#cfeefa"/><path class="ne" d="M-9 -30 L-6 -38" style="stroke:#fff;stroke-width:2"/>` +
  shaded(`<rect x="-34" y="-28" width="68" height="20" rx="8"/>`, c) +
  `<path class="t" d="M0 -27 L0 -12" fill="none"/><rect class="t" x="29" y="-23" width="5" height="5" rx="1.5" fill="#fff6a3"/><rect class="t" x="-34" y="-23" width="4" height="5" rx="1.5" fill="#ff6b6b"/>` +
  `<circle cx="-19" cy="-8" r="8" fill="${INK}"/><circle class="ne" cx="-19" cy="-8" r="3.5" fill="#ddd"/><circle cx="19" cy="-8" r="8" fill="${INK}"/><circle class="ne" cx="19" cy="-8" r="3.5" fill="#ddd"/>`;
V.van = c => `<ellipse class="ne" cx="0" cy="-2" rx="38" ry="5" fill="${INK}" opacity=".15"/>` +
  shaded(`<path d="M-38 -12 L-38 -46 Q-38 -50 -34 -50 L22 -50 Q26 -50 30 -40 L38 -28 L38 -12 Z" cx="0" cy="-30" rx="38" ry="20"/>`, c) +
  `<path class="t" d="M24 -46 L31 -32 L20 -32 L20 -46 Z" fill="#cfeefa"/><rect class="t" x="-30" y="-44" width="14" height="10" rx="2" fill="#cfeefa"/><rect class="t" x="-12" y="-44" width="14" height="10" rx="2" fill="#cfeefa"/>` +
  `<path class="ne" d="M-38 -24 L38 -24" style="stroke:#fff;stroke-width:4"/><rect class="t" x="34" y="-22" width="4" height="5" rx="1.5" fill="#fff6a3"/>` +
  `<circle cx="-22" cy="-10" r="8" fill="${INK}"/><circle class="ne" cx="-22" cy="-10" r="3.5" fill="#ddd"/><circle cx="22" cy="-10" r="8" fill="${INK}"/><circle class="ne" cx="22" cy="-10" r="3.5" fill="#ddd"/>`;

/* ======================================================================
   CATALOG LIST
   ====================================================================== */
const assets = [];
const add = a => assets.push(a);
const T = ['town', 'park'];

// [id, name, svg, box, anim, recolor]  Recolor = lookalikes can be made with a hue shift.
// White, grey and navy animals cannot be recolored that way, so they never get lookalikes.
const animals = [
  ['frog', 'Frog', A.frog(), [-36, -46, 36, 6], 'hop', true],
  ['cat', 'Cat', A.cat(), [-30, -74, 50, 6], 'sway', true],
  ['duck', 'Duck', A.duck(), [-40, -58, 42, 6], 'bob', true],
  ['bunny', 'Bunny', A.bunny(), [-32, -90, 28, 6], 'hop', false],
  ['penguin', 'Penguin', A.penguin(), [-32, -62, 32, 6], 'waddle', false],
  ['snail', 'Snail', A.snail(), [-42, -48, 38, 6], 'slide', true],
  ['turtle', 'Turtle', A.turtle(), [-48, -50, 48, 6], 'bob', true],
  ['fox', 'Fox', A.fox(), [-58, -78, 40, 6], 'sway', true],
  ['dog', 'Dog', A.dog(), [-36, -62, 30, 6], 'waddle', true],
  ['pig', 'Pig', A.pig(), [-32, -66, 30, 6], 'bob', true],
  ['owl', 'Owl', A.owl(), [-28, -60, 28, 6], 'sway', true],
  ['hedgehog', 'Hedgehog', A.hedgehog(), [-36, -42, 36, 6], 'slide', true],
  ['chick', 'Chick', A.chick(), [-18, -44, 20, 6], 'hop', true],
  ['mouse', 'Mouse', A.mouse(), [-34, -44, 30, 6], 'hop', false],
];
for (const [id, name, svg, box, anim, recolor] of animals) {
  add({ id, name, type: 'animal', tags: id === 'duck' ? [...T, 'swims'] : T, svg, box, anim, canBeTarget: true, recolor });
}

people.forEach((p, i) => add({ id: `person-${i + 1}`, name: 'Person', type: 'person', tags: T, svg: person(p),
  box: [-26, p.hold === 'balloon' ? -106 : -80, p.hold === 'balloon' ? 30 : 26, 6], anim: i % 2 ? 'bob' : 'sway', canBeTarget: false, recolor: false }));

const props = [
  ['mailbox', 'Mailbox', P.mailbox(), [-17, -62, 25, 6], 'none', true, true],
  ['hydrant', 'Hydrant', P.hydrant(), [-17, -48, 17, 6], 'none', true, true],
  ['bike', 'Bike', P.bike(), [-27, -44, 29, 6], 'none', true, true],
  ['balloons', 'Balloons', P.balloons(), [-21, -82, 25, 6], 'bob', true, true],
  ['bench', 'Bench', P.bench(), [-29, -35, 29, 6], 'none', false, true],
  ['umbrella-table', 'Table', P.umbrella(), [-37, -84, 37, 6], 'none', false, true],
  ['flowerpot', 'Flower pot', P.flowerpot(), [-16, -44, 16, 6], 'none', false, true],
  ['trashcan', 'Trash can', P.trashcan(), [-15, -37, 15, 6], 'none', false, false],
  ['icecream-cart', 'Ice cream cart', P.cart(), [-36, -98, 36, 6], 'none', false, true],
];
for (const [id, name, svg, box, anim, canBeTarget, recolor] of props) add({ id, name, type: 'prop', tags: ['town'], svg, box, anim, canBeTarget, recolor });

add({ id: 'tree-green', name: 'Tree', type: 'tree', tags: T, svg: S.tree('#8fd36b'), box: [-40, -94, 40, 6], anim: 'tree', canBeTarget: false, recolor: false });
add({ id: 'tree-mint', name: 'Tree', type: 'tree', tags: T, svg: S.tree('#6fc27a'), box: [-40, -94, 40, 6], anim: 'tree', canBeTarget: false, recolor: false });
add({ id: 'tree-fruit', name: 'Tree', type: 'tree', tags: T, svg: S.fruitTree('#7bd18f'), box: [-40, -94, 40, 6], anim: 'tree', canBeTarget: false, recolor: false });
add({ id: 'tree-pine', name: 'Tree', type: 'tree', tags: T, svg: S.pine('#4fa86a'), box: [-31, -90, 31, 6], anim: 'tree', canBeTarget: false, recolor: false });
add({ id: 'bush-green', name: 'Bush', type: 'bush', tags: T, svg: S.bush('#8fd36b'), box: [-32, -38, 32, 6], anim: 'none', canBeTarget: false, recolor: false });
add({ id: 'bush-lime', name: 'Bush', type: 'bush', tags: T, svg: S.bush('#a6df7b'), box: [-32, -38, 32, 6], anim: 'none', canBeTarget: false, recolor: false });
add({ id: 'bush-flowers', name: 'Bush', type: 'bush', tags: T, svg: S.bush('#6fc27a', '#ff8fab'), box: [-32, -38, 32, 6], anim: 'none', canBeTarget: false, recolor: false });
add({ id: 'flower', name: 'Flower', type: 'flower', tags: T, svg: S.flower('#ff8fab'), box: [-13, -24, 13, 3], anim: 'none', canBeTarget: false, recolor: true });
add({ id: 'tulip', name: 'Flower', type: 'flower', tags: T, svg: S.tulip('#ff6b6b'), box: [-9, -28, 10, 3], anim: 'none', canBeTarget: false, recolor: true });
add({ id: 'lamp', name: 'Lamp', type: 'roadside', tags: ['town'], svg: S.lamp(), box: [-15, -88, 15, 6], anim: 'none', canBeTarget: false, recolor: false });
add({ id: 'car', name: 'Car', type: 'vehicle', tags: ['town'], svg: V.car('#ffd93d'), box: [-38, -48, 38, 4], anim: 'drive', canBeTarget: false, recolor: true, skewToRoad: true });
add({ id: 'van', name: 'Van', type: 'vehicle', tags: ['town'], svg: V.van('#7ec8ff'), box: [-42, -54, 42, 4], anim: 'drive', canBeTarget: false, recolor: true, skewToRoad: true });
add({ id: 'fountain', name: 'Fountain', type: 'landmark', tags: T, svg: S.fountain(), box: [-88, -92, 94, 34], anim: 'none', canBeTarget: false, recolor: false, footprint: [88, 48] });

const buildings = [
  ['bakery', 'Bakery', { a: 95, h: 110, top: '#fff1d6', left: '#ffd6a5', right: '#ffbf86', roof: 'cupcake', awning: '#ff8fab', sign: '#ff8fab' }],
  ['lilac-house', 'Lilac house', { a: 90, h: 100, top: '#e7dcff', left: '#c9b6f5', right: '#b39cee', roof: 'pyr', rl: '#8e7dd9', rr: '#7b69c9', chimney: '#ee6c4d', flowers: true }],
  ['ice-cream-shop', 'Ice cream shop', { a: 85, h: 90, top: '#ffffff', left: '#c8f0e6', right: '#a9e4d5', roof: 'cone', awning: '#7ec8ff', sign: '#ffb3c7' }],
  ['pink-house', 'Pink house', { a: 85, h: 100, top: '#ffe3ec', left: '#ffc2d4', right: '#ffa8c2', roof: 'pyr', rl: '#ff8fab', rr: '#f0759a', chimney: '#b07a52' }],
  ['blue-tower', 'Blue tower', { a: 80, h: 150, top: '#d8ecff', left: '#a9d3ff', right: '#8bc2fb', roof: 'flat', fl: 3, ac: true }],
  ['yellow-house', 'Yellow house', { a: 100, h: 110, top: '#fff6bf', left: '#ffe98a', right: '#ffd966', roof: 'pyr', rl: '#ffb347', rr: '#f59e2b', flowers: true }],
  ['green-shop', 'Green shop', { a: 95, h: 100, top: '#d9f5c4', left: '#bfe8a0', right: '#a5d985', roof: 'flat', awning: '#7ed957', sign: '#7ed957', ac: true }],
  ['orange-house', 'Orange house', { a: 90, h: 100, top: '#ffe0d1', left: '#ffc4a8', right: '#ffab8a', roof: 'pyr', rl: '#ee6c4d', rr: '#d95a3b', chimney: '#9aa0a6' }],
  ['cafe', 'Cafe', { a: 90, h: 95, top: '#fff6e8', left: '#f2d4b6', right: '#e6c09a', roof: 'flat', awning: '#e63946', sign: '#b07a52', flowers: true }],
  ['toy-shop', 'Toy shop', { a: 85, h: 105, top: '#e0f7ff', left: '#b8ecff', right: '#9fdcf2', roof: 'pyr', rl: '#ffd93d', rr: '#f5c400', awning: '#c9a0ff', sign: '#ffd93d' }],
];
for (const [id, name, b] of buildings) {
  add({ id, name, type: 'building', tags: ['town'], svg: building(b),
    box: [-b.a - 4, Math.floor(buildingTop(b)), b.a + 14, 12], anim: 'none', canBeTarget: false, recolor: false, footprint: [b.a, b.a] });
}

/* ---------- write files ---------- */
const folder = { animal: 'animals', person: 'people', building: 'buildings', vehicle: 'vehicles', prop: 'props' };
const catalog = [];
for (const a of assets) {
  const [x0, y0, x1, y1] = a.box, w = x1 - x0, h = y1 - y0;
  const dir = `assets/${folder[a.type] || 'scenery'}`;
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/${a.id}.svg`;
  writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x0} ${y0} ${w} ${h}">${STYLE}${a.svg}</svg>\n`);
  const entry = { id: a.id, name: a.name, type: a.type, tags: a.tags, file, w, h,
    anchor: [+(-x0 / w).toFixed(3), +(-y0 / h).toFixed(3)], anim: a.anim, canBeTarget: a.canBeTarget, recolor: a.recolor };
  if (a.footprint) entry.footprint = a.footprint;
  if (a.skewToRoad) entry.skewToRoad = true;
  catalog.push(entry);
}
console.log(`wrote ${assets.length} images`);

mkdirSync('catalog', { recursive: true });
if (existsSync('catalog/catalog.json') && !process.argv.includes('--catalog')) {
  console.log('catalog/catalog.json already exists, left it alone (use --catalog to overwrite)');
} else {
  const lines = catalog.map(e => '    ' + JSON.stringify(e));
  writeFileSync('catalog/catalog.json', `{\n  "assets": [\n${lines.join(',\n')}\n  ]\n}\n`);
  console.log('wrote catalog/catalog.json');
}
