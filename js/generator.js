// World generator: recipe + catalog + seed  ->  a plain list of things to draw.
// It knows nothing about the DOM. The engine takes its output and renders it.

import { makeRng } from './rng.js';

// Decoys are recolored with a CSS hue-rotate. Every copy of a target's species
// gets a different hue from the target, so the one in the tray is always unique.
const HUES = [0, 60, 120, 180, 240, 300];

// `size` is the world size in scene units. The engine picks it to match the
// shape of the screen, so a phone in portrait gets a tall town.
export function generateWorld(recipe, catalog, { seed = recipe.seed, size }) {
  const rng = makeRng(seed);
  const [W, H] = size;
  const theme = recipe.theme;
  const diff = recipe.difficulty;
  // The town's skeleton (roads, ponds, parks, how many of each thing) has its own random
  // stream, so it depends only on the seed and survives a rotation.
  const layoutRng = makeRng(seed * 31 + 7);
  const layout = resolveLayout(recipe.layout, W, H, layoutRng);
  // Recipe counts are for a world of `recipe.area`. Bigger screens get a few more things.
  const density = (W * H) / (recipe.area || W * H);
  const counts = Object.fromEntries(Object.entries(recipe.fill).map(([k, v]) => [k, pickCount(v, layoutRng)]));
  const fill = type => Math.round((counts[type] || 0) * density);

  const byId = Object.fromEntries(catalog.assets.map(a => [a.id, a]));
  const ofType = type => catalog.assets.filter(a => a.type === type && a.tags.includes(theme));

  const items = [];      // everything that stands on the ground, drawn in y order
  const targets = [];    // subset of items the player has to find
  const usedHues = {};   // asset id -> hues that are taken by targets

  /* ---------- geometry ---------- */
  const roadY = (road, x) => road.y + road.slope * (x - road.x);

  // Where the image sits in the scene, as a rectangle.
  function imageRect(asset, x, y, s, flip) {
    const w = asset.w * s, h = asset.h * s;
    const ax = flip ? 1 - asset.anchor[0] : asset.anchor[0];
    const left = x - ax * w, top = y - asset.anchor[1] * h;
    return { x0: left, y0: top, x1: left + w, y1: top + h };
  }
  // The patch of ground it stands on. Buildings set this in the catalog.
  function groundRect(asset, x, y, s) {
    const [hw, depth] = asset.footprint || [asset.w * 0.32, 16];
    return { x0: x - hw * s, y0: y - depth * s, x1: x + hw * s, y1: y + 4 };
  }
  const overlap = (a, b, pad = 0) =>
    a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad;
  const overlapArea = (a, b) =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
    Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const area = r => (r.x1 - r.x0) * (r.y1 - r.y0);

  // Every animal, person and target must stay easy to see. `hidden` is the share of a character's
  // picture covered by things drawn in front of it (rectangles, so it errs on the safe side).
  const characters = [];
  const isCharacter = asset => asset.type === 'animal' || asset.type === 'person';
  const hideLimit = c => (c.target ? diff.maxHidden ?? 0.35 : 0.4);
  const coverShare = (front, back) => (front.y > back.y ? overlapArea(front.rect, back.rect) / area(back.rect) : 0);

  function groundIsFree(g) {
    if (g.x0 < 20 || g.x1 > W - 20 || g.y0 < 30 || g.y1 > H - 10) return false;
    const corners = [[g.x0, g.y0], [g.x1, g.y0], [g.x0, g.y1], [g.x1, g.y1], [(g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2]];
    for (const road of layout.roads || []) {
      const half = road.width / 2 + (road.sidewalk || 0) + 6;
      const ys = corners.map(([cx, cy]) => cy - roadY(road, cx));
      // Blocked if any corner is on the road, or the corners sit on both sides of it.
      if (ys.some(d => Math.abs(d) < half) || (Math.min(...ys) < 0 && Math.max(...ys) > 0)) return false;
    }
    for (const w of layout.water || []) {
      if (corners.some(([cx, cy]) => ((cx - w.x) / (w.rx + 20)) ** 2 + ((cy - w.y) / (w.ry + 14)) ** 2 < 1)) return false;
    }
    for (const it of items) if (overlap(g, it.ground, 4)) return false;
    return true;
  }

  // Is this a good place for `asset`? Checks ground space and that every character stays in view.
  function canPlace(asset, x, y, s, opts = {}) {
    const ground = groundRect(asset, x, y, s);
    if (!opts.skipGround && !groundIsFree(ground)) return null;
    const me = { y, rect: imageRect(asset, x, y, s, opts.flip), target: !!opts.isTarget };
    if (isCharacter(asset) || opts.isTarget) {
      // Fully on screen, and not already tucked behind too much.
      const r = me.rect;
      if (r.x0 < 4 || r.y0 < 4 || r.x1 > W - 4 || r.y1 > H - 4) return null;
      me.hidden = items.reduce((sum, it) => sum + coverShare(it, me), 0);
      if (me.hidden > hideLimit(me)) return null;
      // Targets are spread out. In a crowded town the last ones may sit a bit closer.
      const spacing = opts.crowded ? 50 : 120;
      if (opts.isTarget && targets.some(t => Math.hypot(t.x - x, t.y - y) < spacing)) return null;
    }
    // Placing this must not push any character already there over its limit.
    for (const c of characters) {
      if (c.hidden + coverShare(me, c) > hideLimit(c)) return null;
    }
    return { ground, rect: me.rect, hidden: me.hidden };
  }

  function place(asset, x, y, extra = {}) {
    const s = extra.s ?? 1;
    const spot = extra.spot || canPlace(asset, x, y, s, extra);
    if (!spot) return null;
    const item = { asset, x, y, s, flip: !!extra.flip, hue: extra.hue || 0,
      delay: -rng.range(0, 3), ground: spot.ground, rect: spot.rect };
    for (const c of characters) c.hidden += coverShare(item, c);
    if (isCharacter(asset) || extra.isTarget) {
      item.hidden = spot.hidden || 0;
      item.target = !!extra.isTarget;
      characters.push(item);
    }
    items.push(item);
    return item;
  }

  // Try random spots until one fits, or give up quietly.
  function placeAnywhere(asset, extra = {}, tries = 300) {
    for (let i = 0; i < tries; i++) {
      const x = rng.range(30, W - 30), y = rng.range(40, H - 12);
      const item = place(asset, x, y, extra);
      if (item) return item;
    }
    return null;
  }

  function placeNear(asset, cx, cy, minR, maxR, extra = {}, tries = 60) {
    for (let i = 0; i < tries; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(minR, maxR);
      const item = place(asset, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6, extra);
      if (item) return item;
    }
    return null;
  }

  const freeHue = asset => rng.pick(HUES.filter(h => !(usedHues[asset.id] || []).includes(h)));
  const isTargetSpecies = asset => !!usedHues[asset.id];
  // A decoy may not look exactly like a target.
  const canBeDecoy = asset => !isTargetSpecies(asset) || asset.recolor;
  const decoyHue = asset => (asset.recolor ? (isTargetSpecies(asset) ? freeHue(asset) : rng.pick(HUES)) : 0);

  /* ---------- 1. landmarks and buildings ---------- */
  for (const lm of layout.landmarks || []) {
    const asset = byId[lm.asset];
    // Try the recipe's spot first, then spiral outwards if a road is in the way.
    if (asset) placeAnywhere(asset, {}, 400);
  }

  let pool = [];
  for (let i = 0; i < fill('building'); i++) {
    if (!pool.length) pool = rng.shuffle(ofType('building'));
    if (pool.length) placeAnywhere(pool.pop(), {}, 400);
  }

  /* ---------- 2. street lamps along the roads ---------- */
  const roadside = layout.roadside && byId[layout.roadside.asset];
  if (roadside) {
    for (const road of layout.roads || []) {
      const edge = road.width / 2 + (road.sidewalk || 0);
      for (let x = 80; x < W - 40; x += layout.roadside.spacing) {
        const x2 = x + layout.roadside.spacing / 2;
        // Lamps stand on this road's sidewalk, but never in the middle of another road.
        const onOtherRoad = (px, py) => layout.roads.some(o => o !== road &&
          Math.abs(py - roadY(o, px)) < o.width / 2 + (o.sidewalk || 0) + 20);
        const y1 = roadY(road, x) - edge - 6, y2 = roadY(road, x2) + edge + 14;
        if (!onOtherRoad(x, y1)) place(roadside, x, y1, { skipGround: true });
        if (x2 < W - 40 && !onOtherRoad(x2, y2)) place(roadside, x2, y2, { skipGround: true });
      }
    }
  }

  /* ---------- 3. targets, their cover and their lookalikes ---------- */
  // Which targets (and their colors) depend only on the seed, not on the screen size,
  // so rotating the device rebuilds the town with the same things to find.
  const pickRng = makeRng(seed * 7919 + 1);
  const candidates = pickRng.shuffle(ofType('animal').concat(ofType('person'), ofType('prop')).filter(a => a.canBeTarget));
  // First pass uses every species once in its own color. Further passes reuse recolorable ones in a new color.
  const wanted = [], hueTaken = {};
  for (let pass = 0; wanted.length < diff.targets && pass < HUES.length; pass++) {
    for (const asset of candidates) {
      if (wanted.length >= diff.targets) break;
      if (pass > 0 && !asset.recolor) continue;
      const taken = hueTaken[asset.id] ||= [];
      const hue = pass === 0 ? 0 : pickRng.pick(HUES.filter(h => !taken.includes(h)));
      taken.push(hue);
      wanted.push({ asset, hue });
    }
  }
  if (wanted.length < diff.targets) console.warn(`Only ${wanted.length} target-able assets for theme "${theme}"`);
  // Reserve every wanted color up front so no decoy can copy a target.
  for (const { asset, hue } of wanted) (usedHues[asset.id] ||= []).push(hue);

  const bushes = ofType('bush');
  for (const { asset, hue } of wanted) {
    const flip = rng.chance(0.5);
    const item = placeAnywhere(asset, { isTarget: true, hue, flip }, 3000) ||
      placeAnywhere(asset, { isTarget: true, hue, flip, crowded: true }, 3000);
    if (!item) continue;
    targets.push(item);
    if (bushes.length && rng.chance(diff.coverChance)) {
      const bush = rng.pick(bushes), bs = rng.range(0.85, 1), bx = item.x + rng.range(-10, 10);
      // The bush goes right in front of the target. Start close (covers more) and slide it
      // forward until the target is no more than maxHidden covered.
      for (let by = item.y + 8; by < item.y + 60; by += 4) {
        if (place(bush, bx, by, { skipGround: true, s: bs })) break;
      }
    }
  }
  // Lookalikes: same animal in another color, close enough to make you look twice.
  for (const t of targets) {
    if (!t.asset.recolor) continue;
    for (let i = 0; i < (diff.lookalikes || 0); i++) {
      placeNear(t.asset, t.x, t.y, 130, 320, { hue: freeHue(t.asset), flip: rng.chance(0.5), s: rng.range(0.9, 1.05) });
    }
  }

  /* ---------- 4. scenery and people ---------- */
  const fillType = (type, count, sizeLo, sizeHi, recolor) => {
    // Filler that is the same kind of thing as a target follows the decoy rules.
    const assets = ofType(type).filter(canBeDecoy);
    if (!assets.length) return;
    for (let i = 0; i < count; i++) {
      const asset = rng.pick(assets);
      const hue = isTargetSpecies(asset) ? decoyHue(asset) : (recolor && asset.recolor ? rng.pick(HUES) : 0);
      placeAnywhere(asset, { s: rng.range(sizeLo, sizeHi), flip: rng.chance(0.5), hue });
    }
  };
  fillType('tree', fill('tree'), 0.9, 1.25);
  fillType('bush', fill('bush'), 0.7, 1);
  fillType('flower', fill('flower'), 0.9, 1.1, true);
  fillType('person', fill('person'), 0.9, 1.1);
  fillType('prop', fill('prop'), 0.9, 1.05, true);

  /* ---------- 5. decoy animals ---------- */
  const decoys = ofType('animal').filter(canBeDecoy);
  for (let i = 0; i < Math.round((diff.decoyAnimals || 0) * density) && decoys.length; i++) {
    const asset = rng.pick(decoys);
    placeAnywhere(asset, { hue: decoyHue(asset), s: rng.range(0.85, 1.05), flip: rng.chance(0.5) });
  }

  // Swimmers float on the water, so they skip the ground check.
  const swimmers = catalog.assets.filter(a => a.tags.includes('swims') && canBeDecoy(a));
  for (const w of layout.water || []) {
    for (let i = 0; i < (w.swimmers || 0) && swimmers.length; i++) {
      const asset = rng.pick(swimmers);
      const a = rng.range(0, Math.PI * 2), r = rng.range(0.1, 0.6);
      const x = w.x + Math.cos(a) * w.rx * r, y = w.y + Math.sin(a) * w.ry * r + 10;
      place(asset, x, y, { skipGround: true, hue: decoyHue(asset), s: 0.8, flip: x > w.x });
    }
  }

  /* ---------- 6. vehicles ---------- */
  const vehicles = [];
  const cars = ofType('vehicle');
  for (const road of layout.roads || []) {
    const slope = road.slope;
    for (let i = 0; i < (road.cars || 0) && cars.length; i++) {
      const dir = i % 2 ? 1 : -1;             // -1 drives down-right, 1 drives up-left
      const lane = dir * road.width * 0.2;
      const startX = -120, distance = W + 240;
      vehicles.push({
        asset: rng.pick(cars),
        x: startX, y: roadY(road, startX) + lane + 14,
        dx: distance, dy: distance * slope,
        reverse: dir > 0,
        angle: Math.atan(slope) * 180 / Math.PI,
        // Same speed on every screen size: about 110 scene units per second.
        duration: distance / rng.range(100, 120), delay: -rng.range(0, 16),
        hue: rng.pick(HUES),
      });
    }
  }

  items.sort((a, b) => a.y - b.y);
  return {
    name: recipe.name, seed, size: [W, H], hints: diff.hints,
    ground: recipe.ground, layout, items, targets, vehicles,
  };
}

// A recipe number can be a fixed count or a [min, max] range.
function pickCount(v, rng) {
  return Array.isArray(v) ? Math.floor(rng.range(v[0], v[1] + 1)) : v;
}

// Turn the recipe's layout rules into this town's actual roads, ponds and parks.
// Positions are picked as fractions of the world, so the same seed gives the same
// town on any screen shape. Sizes stay in scene units so things keep their size.
function resolveLayout(spec, W, H, rng) {
  /* Roads: one, or two crossing in an X. Both follow the isometric grid (slope +-0.5). */
  const roads = [];
  const roadSpec = spec.roads || {};
  const roadCount = pickCount(roadSpec.count ?? 1, rng);
  const firstSlope = rng.chance(0.5) ? 0.5 : -0.5;
  for (let i = 0; i < roadCount; i++) {
    const slope = i === 0 ? firstSlope : -firstSlope;
    const x = rng.range(0.3, 0.7) * W, y = rng.range(0.3, 0.7) * H;
    const yAt = px => y + slope * (px - x);
    roads.push({
      x, y, slope, width: roadSpec.width, sidewalk: roadSpec.sidewalk,
      from: [-60, yAt(-60)], to: [W + 60, yAt(W + 60)],
      crossings: [...Array(pickCount(roadSpec.crossings ?? 1, rng))].map(() => rng.range(0.12, 0.8) * W),
      cars: pickCount(roadSpec.cars ?? 0, rng),
    });
  }

  /* Ponds: random size and spot, never on a road or another pond. */
  const roadGap = (cx, cy, rx, ry) => Math.min(...roads.map(r => {
    let near = Infinity, side = 0;
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2, px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
      const d = py - (r.y + r.slope * (px - r.x));
      if (side && Math.sign(d) !== side) return -1;   // the pond crosses the road
      side = Math.sign(d);
      near = Math.min(near, Math.abs(d));
    }
    return near - (r.width / 2 + (r.sidewalk || 0));
  }));
  const water = [];
  const waterSpec = spec.water || {};
  const pondCount = pickCount(waterSpec.count ?? 0, rng);
  for (let i = 0; i < pondCount; i++) {
    const rx = rng.range(...(waterSpec.rx || [120, 150])), ry = rx * 0.5;
    for (let tries = 0; tries < 80; tries++) {
      const x = rng.range(0.08, 0.92) * W, y = rng.range(0.1, 0.9) * H;
      if (x - rx < 10 || x + rx > W - 10 || y - ry < 20 || y + ry > H - 20) continue;
      if (roads.length && roadGap(x, y, rx, ry) < 30) continue;
      if (water.some(w => Math.hypot((x - w.x) / (rx + w.rx), (y - w.y) / (ry + w.ry)) < 1.2)) continue;
      water.push({ x, y, rx, ry, swimmers: pickCount(waterSpec.swimmers ?? 0, rng) });
      break;
    }
  }

  /* Parks are just grass patches, so they can go anywhere, roads draw over them. */
  const parkSpec = spec.parks || {};
  const parks = [...Array(pickCount(parkSpec.count ?? 0, rng))].map(() => {
    const rx = rng.range(...(parkSpec.rx || [150, 300]));
    return { x: rng.range(0, 1) * W, y: rng.range(0, 1) * H, rx, ry: rx * 0.45 };
  });
  // Every pond sits in a bit of park.
  for (const w of water) parks.push({ x: w.x, y: w.y + 5, rx: w.rx * 1.5, ry: w.ry * 1.7 });

  const landmarks = (spec.landmarks || []).filter(l => rng.chance(l.chance ?? 1));
  return { roads, water, parks, landmarks, roadside: spec.roadside };
}
