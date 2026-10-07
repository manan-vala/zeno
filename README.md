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
| Instant (stop time, needs 8 seeds) | `Shift` / `F` | The Instant button |
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
  plays a higher note, and every 8 seeds charge **Instant**.
- **Instant** (the arrow paradox: at any instant, a flying arrow is still):
  1.6 s of bullet time. The whole world, Achilles included, slows to 15%, so
  jumps cover the same ground but you get far longer to react. An arrow
  crosses the frozen sky and the music sinks and slows.
- **Red-figure night:** every 4 halvings the painting cross-fades between
  black-figure day (black figures on clay) and red-figure night (clay figures
  on black, with a moon and stars), as Greek potters switched styles around
  530 BC.
- **The vase breaks:** a crash cracks the picture from the point of impact,
  then it falls apart in shards. Restarting flies a fresh vase back together.
  With reduced motion turned on, it only cracks.
- **Art:** everything is drawn on a 320×120 canvas in the black-figure palette
  and scaled up with nearest-neighbour sampling. Sprites are pixel grids built
  in code (`src/sprites.ts`), so there are no image assets.
- **Sound:** synthesized with the Web Audio API (`src/audio.ts`). Plucked notes
  use Karplus-Strong for a lyre-like tone. The music is a D Dorian arpeggio
  whose tempo follows your speed. Zeno's millet-seed paradox says one seed is
  silent but a bushel makes a sound, so layers arrive at 10, 25 and 50 seeds
  (octave sparkle, hi-hat, melody). Underneath runs a Shepard tone, an audio
  illusion of a pitch that rises forever without arriving.

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
  game.ts        the simulation: state, physics, spawning, collisions, Instant
  renderer.ts    draws the game: day/night cross-fade, Instant, the breaking vase
  theme.ts       black-figure and red-figure palettes, and when night falls
  shatter.ts     crack and shard geometry for the breaking vase
  background.ts  parallax hills, temples, olive trees, key-pattern bands, sky
  sprites.ts     Achilles, the tortoise, obstacles and scenery as pixel grids
  pixels.ts      tiny pixel-grid painter used by the sprites
  audio.ts       synthesized sound effects and music
  score.ts       gap maths, formatting and taunts
  config.ts      sizes, physics, speeds and palette
```
