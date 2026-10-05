// Sanity check for the world generator. Builds 150 towns for 5 screen shapes and reports:
//   min targets        every town should get all 12
//   unfair             decoys that look exactly like a target (must be 0)
//   same after rotate  rotating the device keeps the same targets
//   cut by edge        animals or people cut off by the screen edge (must be 0)
//   most hidden        worst coverage of a target / other character (limits 0.35 / 0.40)
//
// Run from the project root:  node tools/check-worlds.mjs

import { readFileSync } from 'node:fs';
const { generateWorld } = await import(process.cwd() + '/js/generator.js');
// Same formula as worldSizeFor() in js/engine.js.
const sizeFor = (w, h, A) => { const s = Math.min(1.4, Math.max(0.45, Math.sqrt(w*h/A))); return [Math.round(w/s), Math.round(h/s)]; };
const catalog = JSON.parse(readFileSync('catalog/catalog.json'));
const recipe = JSON.parse(readFileSync('worlds/town.json'));
const screens = { phonePortrait: [356, 600], phoneLandscape: [580, 340], iPadPortrait: [800, 1000], iPadLandscape: [1160, 640], laptop: [1420, 700] };
for (const [name, [w, h]] of Object.entries(screens)) {
  const size = sizeFor(w, h, recipe.area);
  let minT = 99, bad = 0, sameTargets = 0, edge = 0, worst = [0, 0];
  for (let seed = 1; seed <= 150; seed++) {
    const wd = generateWorld(recipe, catalog, { seed, size });
    minT = Math.min(minT, wd.targets.length);
    const keys = new Set(wd.targets.map(t => t.asset.id + '@' + t.hue));
    if (wd.items.some(i => !i.target && keys.has(i.asset.id + '@' + i.hue))) bad++;
    // Independent recount of how hidden each character is, and whether it is cut by an edge.
    for (const c of wd.items.filter(i => i.asset.type === 'animal' || i.asset.type === 'person')) {
      const r = c.rect, A = (r.x1 - r.x0) * (r.y1 - r.y0);
      if (r.x0 < 0 || r.y0 < 0 || r.x1 > size[0] || r.y1 > size[1]) edge++;
      let cov = 0;
      for (const f of wd.items) if (f.y > c.y) cov += Math.max(0, Math.min(f.rect.x1, r.x1) - Math.max(f.rect.x0, r.x0)) * Math.max(0, Math.min(f.rect.y1, r.y1) - Math.max(f.rect.y0, r.y0)) / A;
      worst[c.target ? 0 : 1] = Math.max(worst[c.target ? 0 : 1], cov);
    }
    const other = generateWorld(recipe, catalog, { seed, size: [size[1], size[0]] });
    const k2 = new Set(other.targets.map(t => t.asset.id + '@' + t.hue));
    if ([...keys].every(k => k2.has(k)) && keys.size === k2.size) sameTargets++;
  }
  console.log(name.padEnd(15), 'world', size.join('x').padEnd(10), 'scale', (w/size[0]).toFixed(2), 'min targets', minT, 'unfair', bad, 'same after rotate', sameTargets + '/150', 'cut by edge', edge, 'most hidden target/other', worst.map(v => v.toFixed(2)).join('/'));
}
