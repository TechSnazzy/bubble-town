# Bubble Town

A hidden object game for iPhone, iPad and computers. Every time you play you get a brand new
cartoon town full of animals, people, cars and shops, and you have to find the 12 things shown
in the tray at the bottom.

Inspired by games like Hidden Folks, with a colorful isometric look. All characters and worlds
are original. It is a plain static website: no ads, no accounts, no tracking, no server.

## How to play

- Look at the tray. Each card is something hiding in the town.
- Tap it in the town when you spot it. It does a little dance and the card gets a check mark.
- Stuck? Tap a card in the tray to use a hint. A yellow ring shrinks onto it. You get 3 hints per town.
- Careful: there are lookalikes in other colors. Only the exact one from the tray counts.
- Find all 12 to win, then tap **New town** for a completely different town.

## Features

- **A new town every time.** Roads, ponds, parks, buildings and where everything stands are
  generated from a random seed.
- **Fits any screen.** The whole town is always visible, with no scrolling or zooming. The town
  is built in the shape of the screen: tall on a phone, wide on a laptop, and it rebuilds itself
  when you rotate an iPad or iPhone (keeping what you already found).
- **Fair puzzles.** Every target is fully on screen and never more than about a third hidden.
  Decoys never look exactly like a target.
- **Animated.** Animals hop, waddle and sway, cars drive, the fountain splashes.
- **Installable.** Add it to the home screen on iPhone or iPad and it opens full screen like an
  app, with its own icon. After the first visit it also works offline.
- **Light.** About 60 small SVG images. No frameworks, no build step, no dependencies.

## Run it on your computer

The game uses JavaScript modules, which browsers will not load from a plain file, so start a
small local web server from the project folder:

```bash
python3 -m http.server 8123
```

Then open http://localhost:8123 in a browser.

To try a phone on the same Wi-Fi, open `http://<your computer's IP>:8123` on the phone.
(Offline mode and installing only work over https, so test those on the published site.)

## Put it on GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository, go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. After a minute the game is live at `https://<user>.github.io/<repository>/`.

All paths in the game are relative, so it works from that subfolder without changes.

### Add to the home screen (iPhone / iPad)

Open the game in Safari, tap **Share**, then **Add to Home Screen**.

## How it works

The game is split into content (what is in a town) and an engine (how the game plays), with a
generator in between.

```
catalog/catalog.json   every character, building and prop, with its size and settings
worlds/town.json       the recipe for a town: ranges for roads, ponds, parks, counts, difficulty
        |
        v
js/generator.js        recipe + catalog + seed + screen shape  ->  list of things and where they go
        |
        v
js/engine.js           draws that list, handles taps, hints, the tray and the win screen
```

- **Catalog.** Each asset is one image file in `assets/` plus one line in `catalog/catalog.json`:
  `id`, `name`, `type` (animal, person, prop, building, tree, bush, flower, vehicle...),
  `tags` (which themes it belongs to), `file`, size `w`/`h`, `anchor` (where its feet are, as
  fractions of the image), `anim` (idle animation), `canBeTarget`, and `recolor` (whether
  lookalikes can be made by shifting its color).
- **Recipe.** A world file says which theme tags to use and gives ranges, for example
  `"building": [6, 9]` or `"roads": { "count": [1, 2] }`. Difficulty settings live there too:
  number of targets, hints, how often a target hides behind a bush, how much it may be hidden,
  and how many lookalikes.
- **Generator.** Uses a seeded random number generator, so the same seed always makes the same
  town. It places buildings, then targets (with cover and lookalikes), then everything else,
  checking that nothing hides a target too much.
- **Engine.** Picks a town size with the same shape as the screen, scales it to fit, draws the
  ground as one SVG and every object as an image, and runs the game.

### Useful addresses

- `?seed=12345` replays a specific town (the current seed is always in the address bar).
- `?world=town` picks a recipe from `worlds/` (only `town` exists so far).

## Adding things

**A new character or object:** draw it (or generate it), save it in `assets/`, add a line to
`catalog/catalog.json`, and it shows up in every world whose tags match. Set `canBeTarget` to
`true` if it should be findable.

**Replacing art with PNGs:** put the PNG in `assets/`, point the catalog entry's `file` at it,
and set `w`, `h` and `anchor` to match. Make PNGs 2 to 3 times larger than their display size so
they stay sharp on Retina screens.

**A new world:** copy `worlds/town.json`, change the theme tag and ranges, and tag some catalog
assets with the new theme. Open it with `?world=<name>`.

## Tools

| Command | What it does |
| --- | --- |
| `node tools/bootstrap-placeholders.mjs` | Redraws all the code-drawn art in `assets/`. Add `--catalog` to also rewrite `catalog/catalog.json` (overwrites hand edits). |
| `node tools/make-icons.mjs` | Builds the app icon in `icons/` from the game art and renders the PNG sizes with headless Chrome. |
| `node tools/check-worlds.mjs` | Generates 750 test towns across 5 screen shapes and checks the fairness rules. |
| `tools/gallery.html` | Open at http://localhost:8123/tools/gallery.html to see every asset with its frame and anchor point. |

## Project layout

```
index.html              the page
manifest.webmanifest    app name and icons for "Add to Home Screen"
sw.js                   offline support (network first, cache as fallback)
css/game.css            layout, animations, tray, win screen
js/main.js              loads catalog and recipe, builds the town, handles rotation
js/generator.js         builds a town from a recipe (no browser code, runs in Node too)
js/engine.js            draws the town and runs the game
js/rng.js               seeded random numbers
catalog/catalog.json    list of all assets
worlds/town.json        the town recipe
assets/                 the art (SVG today, PNG welcome)
icons/                  app icon in all sizes
tools/                  art, icon and test scripts
prototype/              the original single-file prototype, kept for reference
```

## Browser support

Safari on iOS/iPadOS 15 or newer, and current Chrome, Edge, Firefox and Safari on computers.
