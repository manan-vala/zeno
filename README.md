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
| Jump (hold for higher) | `Space` / `↑` / `W` | Tap |
| Duck (fast-fall in the air) | `↓` / `S` | Swipe down and hold |
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
| `npm test` | Unit tests (Vitest) |

The build is fully static with relative paths, so `dist/` can be hosted on
GitHub Pages, Netlify, Vercel or any static host.

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
