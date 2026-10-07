# Zeno

An endless runner painted on a Greek vase. You are Achilles, chasing a tortoise
that is always just ahead. Every stretch you run closes half of the remaining
gap, so you get closer forever and never quite arrive. That's
[Zeno's paradox](https://en.wikipedia.org/wiki/Zeno%27s_paradoxes#Achilles_and_the_tortoise).

## Play

```bash
npm install
npm run dev      # http://localhost:5173
```

| Action | Keyboard | Touch |
|---|---|---|
| Jump (hold for higher) | `Space` / `↑` / `W` | Tap anywhere else |
| Duck (fast-fall in the air) | `↓` / `S` | Hold the left third of the game |
| Pause | `P` / `Esc` | |
| Mute | `M` or the Sound button | Sound button |

## How it works

- **Score:** the gap closed is `1 − 2^(−distance / STAGE_LENGTH)`. The big number
  shows completed halvings (`1/2`, `3/4`, `7/8`, … then `1 − 2⁻ⁿ`), and the small
  one shows the live decimal, which never reaches 1.
- **Obstacles:** amphorae and broken columns at first, then pairs and tall
  columns, then owls at three heights (jump the low ones, duck the middle ones,
  ignore the high ones).
- **Seeds:** white millet seeds float in arcs and rows. Each one in a streak
  plays a higher note.
- **Art:** everything is drawn on a 320×120 canvas in the black-figure palette
  and scaled up with nearest-neighbour sampling. Sprites are pixel grids built
  in code (`src/sprites.ts`), so there are no image assets.
- **Sound:** synthesized with the Web Audio API (`src/audio.ts`). Plucked notes
  use Karplus-Strong for a lyre-like tone, and the music is a D Dorian arpeggio
  whose tempo follows your speed and gains layers as the gap halves.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and build a static site into `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit and simulation tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright, desktop and mobile Chromium) |
| `npm run cf:dev` | Build and serve locally through Cloudflare's runtime |
| `npm run deploy` | Build and deploy to Cloudflare Workers |

## Deploy to Cloudflare

The game is deployed as a **static-assets-only Worker** (`wrangler.jsonc`).
Cloudflare serves the files in `dist/` straight from its edge and no Worker code
runs, so asset requests are free and unlimited on the Free plan.

```bash
npx wrangler login   # once per machine
npm run deploy       # builds, then uploads dist/ to the "zeno" Worker
```

The first deploy prints a `https://zeno.<your-subdomain>.workers.dev` URL.

**Custom domain:** the game is live at <https://zeroengine.space>, set by the
`routes` entry in `wrangler.jsonc`. Cloudflare manages that hostname's DNS
record and certificate itself. `www.zeroengine.space` is a proxied DNS record
plus a zone Redirect Rule that 301s to the apex.

Other deploy files:

- `public/_headers`: long-lived caching for fingerprinted `/assets/*`, plus
  security headers (CSP, `X-Frame-Options`, and others).
- `public/404.html`: served with a 404 status for unknown paths.

## Tests

- **Unit tests** cover the score maths, collisions, and the game simulation
  itself, which runs headless in Node with stubbed sprites, audio and a seeded
  random generator (`src/testing/harness.ts`). That covers jumping, ducking,
  every obstacle height, seeds, pausing and restarts.
- **Fairness:** an autopilot that only reacts to what's on screen plays
  10 simulated minutes on several seeds. If it ever dies, a spawn pattern is
  unfair.
- **Browser tests** (`e2e/`) run the production build in desktop and mobile
  Chromium. They check loading, controls, pause, crash and restart, saved
  best and mute, touch zones, and that the game fits common screen sizes.

First time running the browser tests: `npx playwright install chromium`.
Add `?debug` to the URL to expose the game as `window.zeno` in the console.

## Project layout

```
src/
  main.ts        DOM, input, canvas scaling, main loop
  game.ts        game state, physics, spawning, collisions, rendering
  background.ts  parallax hills, temples, olive trees and the key-pattern bands
  sprites.ts     Achilles, the tortoise, obstacles and scenery as pixel grids
  pixels.ts      tiny pixel-grid painter used by the sprites
  audio.ts       synthesized sound effects and music
  score.ts       gap maths, formatting and taunts
  config.ts      sizes, physics, speeds and palette
```
