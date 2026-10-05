// Boot: load the catalog and a world recipe, build a world shaped like the screen, start the game.
//   index.html                   -> worlds/town.json, a brand new random town
//   index.html?world=town&seed=5 -> that exact town again (the seed is shown in the address bar)

import { generateWorld } from './generator.js';
import { startGame, worldSizeFor, layoutTray } from './engine.js';

const params = new URLSearchParams(location.search);
const worldName = params.get('world') || 'town';
const view = document.getElementById('view');

const loadJson = path => fetch(path).then(r => {
  if (!r.ok) throw new Error(`Could not load ${path}`);
  return r.json();
});

const [catalog, recipe] = await Promise.all([
  loadJson('catalog/catalog.json'),
  loadJson(`worlds/${worldName}.json`),
]);

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
let seed = Number(params.get('seed')) || randomSeed();
let state, game, builtFor;   // builtFor = play area aspect ratio the current world was made for

function build() {
  // Fill the tray with blank cards first, so the play area is measured at its real size.
  const tray = document.getElementById('tray');
  if (!tray.children.length) tray.innerHTML = '<button class="card"><img alt=""><span>&nbsp;</span></button>'.repeat(recipe.difficulty.targets);
  layoutTray(recipe.difficulty.targets);
  const w = view.clientWidth, h = view.clientHeight;
  builtFor = w / h;
  const world = generateWorld(recipe, catalog, { seed, size: worldSizeFor(w, h, recipe.area) });
  game = startGame(world, state, { onPlayAgain: newTown });
}

function newTown() {
  // "New town" on the win screen: same recipe, new random seed, completely new layout.
  seed = randomSeed();
  startTown();
}

function startTown() {
  // Put the seed in the address bar so a reload keeps the same town.
  history.replaceState(null, '', `?world=${worldName}&seed=${seed}`);
  state = { found: new Set(), hintsLeft: null };
  build();
}

// Small size changes (Safari's address bar sliding in and out) just rescale the world.
// A real change of shape (rotating the device, resizing a laptop window a lot) rebuilds
// it in the new shape. Same seed and same targets, and what was found stays found.
let resizeTimer;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    layoutTray(recipe.difficulty.targets);
    const aspect = view.clientWidth / view.clientHeight;
    const change = Math.max(aspect, builtFor) / Math.min(aspect, builtFor);
    if (change > 1.25) build(); else game.fit();
  }, 150);
}
// Watching the play area itself also catches the tray changing height.
new ResizeObserver(onResize).observe(view);
// Backups: ResizeObserver only reports while the page is being drawn.
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
document.addEventListener('visibilitychange', onResize);

// Stop iOS Safari from pinch-zooming or double-tap zooming the page.
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());

startTown();

// Offline support (only works over https or localhost).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
