// Game engine: draws a generated world, handles taps, hints and the win screen.
// The whole world always fits on screen. There is no panning or zooming.
// It works for any world the generator produces and knows nothing about towns or frogs.

// How much "town" every screen gets, in scene units squared. The world is shaped like the
// play area and scaled to fit it, so a phone and a laptop see the same amount of town.
const WORLD_AREA = 900000;
const MIN_SCALE = 0.45, MAX_SCALE = 1.4;

// Pick a world size with the same shape as the play area.
export function worldSizeFor(areaW, areaH, targetArea = WORLD_AREA) {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.sqrt((areaW * areaH) / targetArea)));
  return [Math.round(areaW / s), Math.round(areaH / s)];
}

// Lay out the target tray.
// Bottom tray: always one row. Cards shrink to fit, and names hide when they get too small.
// Side column (phone held sideways): even rows (3 x 4) instead of one lonely card at the end.
export function layoutTray(count) {
  const tray = document.getElementById('tray');
  const css = getComputedStyle(tray);
  const maxCard = parseFloat(css.getPropertyValue('--card-max')) || 96;
  const gap = parseFloat(css.columnGap) || 6;
  const inner = tray.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
  const sideColumn = matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
  let cols = count;
  if (sideColumn) {
    const fits = Math.max(1, Math.floor((inner + gap) / (52 + gap)));
    cols = Math.ceil(count / Math.ceil(count / fits));
  }
  const cardW = Math.min(maxCard, (inner - gap * (cols - 1)) / cols);
  tray.style.gridTemplateColumns = `repeat(${cols}, ${cardW.toFixed(1)}px)`;
  tray.style.setProperty('--card-img', `${Math.round(Math.min(cardW * 0.8, 56))}px`);
  tray.classList.toggle('compact', cardW < 54);
}

// `state` survives a rotation: { found: Set of target keys, hintsLeft }.
export function startGame(world, state, { onPlayAgain } = {}) {
  const [W, H] = world.size;
  const view = document.getElementById('view');
  const scene = document.getElementById('scene');
  const fx = document.getElementById('fx');
  const tray = document.getElementById('tray');
  const countEl = document.getElementById('count');
  const hintsEl = document.getElementById('hints');
  const winEl = document.getElementById('win');

  document.getElementById('title').textContent = world.name;
  view.style.background = world.ground.color;
  scene.style.width = W + 'px';
  scene.style.height = H + 'px';
  fx.setAttribute('viewBox', `0 0 ${W} ${H}`);
  fx.innerHTML = '';
  winEl.hidden = true;
  winEl.querySelectorAll('.conf').forEach(el => el.remove());

  /* ---------- draw ---------- */
  document.getElementById('ground').outerHTML = drawGround(world);
  document.getElementById('cars').innerHTML = world.vehicles.map(drawVehicle).join('');
  document.getElementById('things').innerHTML = world.items.map(drawItem).join('');
  const thingEls = document.getElementById('things').children;
  world.items.forEach((it, i) => { it.el = thingEls[i]; });

  /* ---------- tray ---------- */
  if (state.hintsLeft == null) state.hintsLeft = world.hints;
  const keyOf = t => `${t.asset.id}@${t.hue}`;
  tray.innerHTML = '';
  for (const t of world.targets) {
    const card = document.createElement('button');
    card.className = 'card';
    card.innerHTML = `<img src="${t.asset.file}" alt="" draggable="false" style="${hueStyle(t.hue)}"><span>${t.asset.name}</span>`;
    card.addEventListener('click', () => hint(t));
    t.card = card;
    tray.appendChild(card);
    // Already found before a rotation rebuilt the world.
    t.found = state.found.has(keyOf(t));
    if (t.found) { t.el.classList.add('found'); card.classList.add('done'); }
  }
  const updateCounts = () => {
    countEl.textContent = `${state.found.size} / ${world.targets.length}`;
    hintsEl.textContent = `Hints: ${state.hintsLeft}`;
  };
  updateCounts();

  /* ---------- fit to screen ---------- */
  let sc = 1;
  function fit() {
    const vw = view.clientWidth, vh = view.clientHeight;
    sc = Math.min(vw / W, vh / H);
    const ox = (vw - W * sc) / 2, oy = (vh - H * sc) / 2;
    scene.style.transform = `translate(${ox}px,${oy}px) scale(${sc})`;
  }
  fit();

  /* ---------- taps ---------- */
  let down = null;
  view.onpointerdown = e => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; };
  view.onpointerup = e => {
    if (!down) return;
    const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
    if (moved < 14 && Date.now() - down.t < 700) tap(e.clientX, e.clientY);
    down = null;
  };
  view.onpointercancel = () => { down = null; };

  function tap(clientX, clientY) {
    const r = scene.getBoundingClientRect();
    const x = (clientX - r.left) / sc, y = (clientY - r.top) / sc;
    // Hit = inside the target's picture, plus about 12 screen pixels of slack for small fingers.
    const slack = 12 / sc;
    let best = null, bestDist = Infinity;
    for (const t of world.targets) {
      if (t.found) continue;
      const { x0, y0, x1, y1 } = t.rect;
      if (x < x0 - slack || x > x1 + slack || y < y0 - slack || y > y1 + slack) continue;
      const d = Math.hypot(x - (x0 + x1) / 2, y - (y0 + y1) / 2);
      if (d < bestDist) { bestDist = d; best = t; }
    }
    if (best) foundIt(best); else miss(x, y);
  }

  function addFx(markup, ms) {
    fx.insertAdjacentHTML('beforeend', markup);
    const el = fx.lastElementChild;
    if (ms) setTimeout(() => el.remove(), ms);
  }
  const centre = t => [(t.rect.x0 + t.rect.x1) / 2, (t.rect.y0 + t.rect.y1) / 2];

  function miss(x, y) {
    addFx(`<circle class="puff" cx="${x}" cy="${y}" r="16" fill="none" stroke="#ff8fab" stroke-width="4"/>`, 650);
  }

  function foundIt(t) {
    t.found = true;
    state.found.add(keyOf(t));
    t.el.classList.add('found');
    const [cx, cy] = centre(t), cols = ['#ffd93d', '#ff8fab', '#7ec8ff', '#7ed957'];
    addFx(`<circle class="ring" cx="${cx}" cy="${cy}" r="44" fill="none" stroke="#35c46a" stroke-width="5"/>`);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      addFx(`<circle class="spark" cx="${cx}" cy="${cy}" r="5" fill="${cols[i % 4]}" stroke="#4a3150" stroke-width="1.5" style="--dx:${(Math.cos(a) * 64).toFixed(0)}px;--dy:${(Math.sin(a) * 64).toFixed(0)}px"/>`, 900);
    }
    t.card.classList.add('done');
    updateCounts();
    if (state.found.size === world.targets.length) setTimeout(win, 1200);
  }

  function hint(t) {
    if (t.found) return;
    if (state.hintsLeft <= 0) {
      t.card.classList.remove('nope');
      void t.card.offsetWidth;   // restart the shake animation
      t.card.classList.add('nope');
      return;
    }
    state.hintsLeft--;
    updateCounts();
    // No zooming, so the hint is a big pulsing ring that shrinks onto the target.
    const [cx, cy] = centre(t);
    addFx(`<circle class="hint" cx="${cx}" cy="${cy}" r="70" fill="none" stroke="#ffb400" stroke-width="8"/>`, 3700);
  }

  function win() {
    winEl.hidden = false;
    const emoji = ['⭐', '🎈', '🎉', '🐸', '🐰', '🦆'];
    for (let i = 0; i < 30; i++) {
      const s = document.createElement('span');
      s.className = 'conf';
      s.textContent = emoji[i % emoji.length];
      s.style.left = Math.random() * 100 + 'vw';
      s.style.animationDuration = 2.5 + Math.random() * 2.5 + 's';
      s.style.animationDelay = Math.random() * 1.5 + 's';
      winEl.appendChild(s);
    }
  }
  document.getElementById('again').onclick = () => onPlayAgain ? onPlayAgain() : location.reload();

  return { fit };
}

/* ---------- drawing helpers ---------- */

const hueStyle = hue => (hue ? `filter:hue-rotate(${hue}deg)` : '');

// One standing thing: an outer box for position and flip, .pose for the found dance, img for the idle animation.
function drawItem(it) {
  const a = it.asset, s = it.s;
  const style = [
    `left:${(it.x - a.anchor[0] * a.w).toFixed(1)}px`,
    `top:${(it.y - a.anchor[1] * a.h).toFixed(1)}px`,
    `width:${a.w}px`, `height:${a.h}px`,
    `transform-origin:${a.anchor[0] * 100}% ${a.anchor[1] * 100}%`,
    `transform:scale(${it.flip ? -s : s},${s})`,
  ].join(';');
  const imgStyle = `animation-delay:${it.delay.toFixed(2)}s;${hueStyle(it.hue)}`;
  return `<div class="thing" style="${style}"><div class="pose" style="transform-origin:${a.anchor[0] * 100}% ${a.anchor[1] * 100}%">` +
    `<img class="idle a-${a.anim}" src="${a.file}" alt="" draggable="false" style="${imgStyle}"></div></div>`;
}

// Vehicles drive along a road. Placeholder cars are flat side views, so they get skewed to match the road.
function drawVehicle(v) {
  const a = v.asset;
  const skew = a.skewToRoad ? `skewY(${v.angle.toFixed(2)}deg) ` : '';
  const flip = v.reverse ? 'scaleX(-1)' : '';
  return `<div class="car" style="left:${(v.x - a.anchor[0] * a.w).toFixed(1)}px;top:${(v.y - a.anchor[1] * a.h).toFixed(1)}px;` +
    `--dx:${v.dx.toFixed(0)}px;--dy:${v.dy.toFixed(0)}px;animation-duration:${v.duration.toFixed(1)}s;animation-delay:${v.delay.toFixed(1)}s;` +
    `animation-direction:${v.reverse ? 'reverse' : 'normal'}">` +
    `<img src="${a.file}" alt="" draggable="false" style="width:${a.w}px;height:${a.h}px;transform:${skew}${flip};${hueStyle(v.hue)}"></div>`;
}

// Flat ground: grass, water, roads. Drawn as one SVG under everything else.
function drawGround(world) {
  const [W, H] = world.size, g = world.ground, L = world.layout;
  // Darken a #rrggbb color toward the ink color by k percent.
  const ink = [0x4a, 0x31, 0x50];
  const mix = (c, k) => '#' + [1, 3, 5].map((i, j) => {
    const v = parseInt(c.slice(i, i + 2), 16);
    return Math.round(v + (ink[j] - v) * k / 100).toString(16).padStart(2, '0');
  }).join('');
  // Repeating patterns are drawn once and tiled by the browser, so they cost almost nothing.
  let s = `<defs>
    <pattern id="pave" width="64" height="32" patternUnits="userSpaceOnUse">
      <path d="M0 16 L32 0 L64 16 L32 32 Z" fill="none" stroke="${mix(g.color, 12)}" stroke-width="1.5" opacity=".55"/>
    </pattern>
    <pattern id="tufts" width="110" height="70" patternUnits="userSpaceOnUse">
      <path d="M12 20 l3 -7 l3 7 l3 -7 l3 7 M70 48 l3 -7 l3 7 l3 -7 l3 7 M48 10 l3 -6 l3 6 M92 26 l3 -6 l3 6 M28 58 l3 -6 l3 6"
        fill="none" stroke="${mix(g.grass, 22)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </pattern>
    <pattern id="slabs" width="40" height="20" patternUnits="userSpaceOnUse">
      <path d="M0 0 L0 20 M20 -10 L20 30" stroke="${mix(g.sidewalk, 15)}" stroke-width="1.5"/>
    </pattern>
  </defs>`;
  s += `<rect width="${W}" height="${H}" fill="${g.color}"/><rect width="${W}" height="${H}" fill="url(#pave)"/>`;
  for (const p of L.parks || []) {
    s += `<ellipse cx="${p.x}" cy="${p.y}" rx="${p.rx}" ry="${p.ry}" fill="${g.grass}" stroke="${mix(g.grass, 14)}" stroke-width="4"/>`;
    s += `<ellipse cx="${p.x}" cy="${p.y}" rx="${p.rx - 6}" ry="${p.ry - 4}" fill="url(#tufts)"/>`;
  }
  for (const w of L.water || []) {
    // sandy shore with pebbles, then water, shine, ripples and lily pads
    s += `<ellipse class="ink" cx="${w.x}" cy="${w.y + 4}" rx="${w.rx + 14}" ry="${w.ry + 11}" fill="#f2dfb5"/>`;
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      s += `<ellipse cx="${(w.x + Math.cos(a) * (w.rx + 7)).toFixed(1)}" cy="${(w.y + 4 + Math.sin(a) * (w.ry + 6)).toFixed(1)}" rx="5" ry="3" fill="#d9dce1" stroke="#4a3150" stroke-width="1.5"/>`;
    }
    s += `<ellipse class="ink" cx="${w.x}" cy="${w.y}" rx="${w.rx}" ry="${w.ry}" fill="${g.water}"/>`;
    s += `<ellipse cx="${w.x - w.rx * 0.2}" cy="${w.y - w.ry * 0.25}" rx="${w.rx * 0.55}" ry="${w.ry * 0.4}" fill="${g.waterShine}" opacity=".7"/>`;
    for (const [px, py] of [[-0.35, 0.45], [0.25, 0.1], [0.05, -0.5]]) {
      const x = w.x + px * w.rx, y = w.y + py * w.ry;
      s += `<path d="M${x - 12} ${y} q6 -4 12 0 q6 4 12 0" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>`;
    }
    for (const [px, py] of [[-0.6, 0.15], [0.45, -0.25], [0.62, 0.35]]) {
      const x = w.x + px * w.rx, y = w.y + py * w.ry;
      s += `<path class="ink thin" d="M${x} ${y} L${x + 25} ${y - 3} A26 10 0 1 1 ${x + 25} ${y + 3} Z" fill="${g.lilyPad}"/>`;
    }
  }
  // Roads are drawn in layers (all sidewalks, then all asphalt, then markings)
  // so two crossing roads join into one intersection.
  const roads = (L.roads || []).map(r => {
    const [x0, y0] = r.from, [x1, y1] = r.to;
    const half = r.width / 2, side = half + (r.sidewalk || 0);
    return { r, x0, y0, x1, y1, half, side, yAt: x => y0 + (y1 - y0) * (x - x0) / (x1 - x0),
      band: m => `${x0},${y0 - m} ${x1},${y1 - m} ${x1},${y1 + m} ${x0},${y0 + m}` };
  });
  for (const R of roads) s += `<polygon class="ink" points="${R.band(R.side)}" fill="${g.sidewalk}"/>`;
  for (const R of roads) s += `<polygon points="${R.band(R.side - 2)}" fill="url(#slabs)"/>`;
  // curb: a lighter edge between sidewalk and road
  for (const R of roads) s += `<polygon class="ink" points="${R.band(R.half + 5)}" fill="#e9e3ef"/>`;
  for (const R of roads) s += `<polygon class="ink" points="${R.band(R.half)}" fill="${g.road}"/>`;
  // Cover the inner outlines where roads cross, so the intersection reads as one surface.
  if (roads.length > 1) for (const R of roads) s += `<polygon points="${R.band(R.half - 1.5)}" fill="${g.road}"/>`;
  for (const R of roads) {
    s += `<line x1="${R.x0}" y1="${R.y0}" x2="${R.x1}" y2="${R.y1}" stroke="#fff" stroke-width="4" stroke-dasharray="22 18"/>`;
    for (const cx of R.r.crossings || []) {
      for (let i = 0; i < 6; i++) {
        const a = cx + i * 30, b = a + 16, m = R.half - 8;
        s += `<polygon points="${a},${R.yAt(a) - m} ${b},${R.yAt(b) - m} ${b},${R.yAt(b) + m} ${a},${R.yAt(a) + m}" fill="#fff" opacity=".85"/>`;
      }
    }
  }
  return `<svg id="ground" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
}
