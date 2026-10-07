import { Background } from './background';
import { COLORS, DEATH, GROUND_Y, INSTANT, PLAYER_X, VIEW_H, VIEW_W } from './config';
import type { Game, Obstacle, Seed, Tone } from './game';
import { drawCracks, drawShards, fracture, type Fracture } from './shatter';
import { buildSprites, toNightCanvas, type Sprite, type SpriteSheet } from './sprites';
import { DAY, NIGHT_THEME, type Theme } from './theme';

interface Look {
  theme: Theme;
  sprites: SpriteSheet;
  background: Background;
}

const PAGE_BG = '#17100d'; // what's behind the vase once it breaks
const SHATTER_TIME = 1.6; // how long shards keep falling

function offscreen(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = VIEW_H;
  return [c, c.getContext('2d')!];
}

/** Draws the game. Reads the simulation; never changes it. */
export class Renderer {
  private day: Look;
  private night: Look;
  private layer: [HTMLCanvasElement, CanvasRenderingContext2D] = offscreen();
  private picture: [HTMLCanvasElement, CanvasRenderingContext2D] = offscreen();

  /** The current break: geometry plus which moment it belongs to. */
  private broken: { fracture: Fracture; key: number; captured: boolean } | null = null;

  constructor(
    private game: Game,
    daySprites: SpriteSheet,
    private options: { reduceMotion: boolean },
  ) {
    const nightSprites = buildSprites(toNightCanvas);
    this.day = { theme: DAY, sprites: daySprites, background: new Background(daySprites, DAY) };
    this.night = { theme: NIGHT_THEME, sprites: nightSprites, background: new Background(nightSprites, NIGHT_THEME) };
  }

  render(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    const motion = !this.options.reduceMotion;

    if (g.state === 'over' && g.crash) {
      const t = g.time - g.overAt;
      const f = this.fractureFor(g.overAt, g.crash.x, g.crash.y);
      if (motion && t >= DEATH.shatterAt) {
        // Capture the cracked vase once, then let it fall apart.
        if (!this.broken!.captured) {
          this.drawScene(this.picture[1]);
          drawCracks(this.picture[1], f, 1, this.look().theme.figure);
          this.broken!.captured = true;
        }
        ctx.fillStyle = PAGE_BG;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        drawShards(ctx, this.picture[0], f, Math.min(t - DEATH.shatterAt, SHATTER_TIME), PAGE_BG);
        return;
      }
      this.drawScene(ctx);
      drawCracks(ctx, f, motion ? t / DEATH.crackTime : 1, this.look().theme.figure);
      return;
    }

    if (g.state === 'reassembling' && motion) {
      // The fresh vase flies together from the pieces of the old one.
      const p = Math.min(1, (g.time - g.reassembleAt) / DEATH.reassembleTime);
      const f = this.fractureFor(g.reassembleAt, VIEW_W / 2, VIEW_H / 2);
      if (!this.broken!.captured) {
        this.drawScene(this.picture[1]);
        this.broken!.captured = true;
      }
      ctx.fillStyle = PAGE_BG;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const eased = 1 - Math.pow(1 - p, 3);
      drawShards(ctx, this.picture[0], f, (1 - eased) * 0.7, PAGE_BG);
      return;
    }

    this.drawScene(ctx);
  }

  /** Same break geometry for the whole of one crash or reassembly. */
  private fractureFor(key: number, x: number, y: number): Fracture {
    if (!this.broken || this.broken.key !== key) {
      this.broken = { fracture: fracture(x, y, VIEW_W, VIEW_H, Math.random), key, captured: false };
    }
    return this.broken.fracture;
  }

  /** The look that dominates right now (for cracks and other overlays). */
  private look(): Look {
    return this.game.nightness() >= 0.5 ? this.night : this.day;
  }

  /** The whole painted world, cross-faded between day and night. */
  private drawScene(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    ctx.save();
    if (g.shake > 0) {
      const m = Math.ceil(g.shake * 8);
      ctx.translate(Math.round((Math.random() - 0.5) * m), Math.round((Math.random() - 0.5) * m));
    }
    const n = g.nightness();
    if (n <= 0) this.drawWorld(ctx, this.day);
    else if (n >= 1) this.drawWorld(ctx, this.night);
    else {
      this.drawWorld(ctx, this.day);
      const [layer, lctx] = this.layer;
      this.drawWorld(lctx, this.night);
      ctx.globalAlpha = n;
      ctx.drawImage(layer, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawWorld(ctx: CanvasRenderingContext2D, look: Look): void {
    const g = this.game;
    const { sprites, theme } = look;
    look.background.draw(ctx, g.scroll, g.time);

    // The tortoise.
    const tortoise = sprites.tortoise[Math.floor(g.time * 4) % 2];
    ctx.drawImage(tortoise, Math.round(g.tortoiseX()), GROUND_Y - tortoise.height + Math.round(g.tortoiseHop));

    for (const s of g.seedsOnField) this.drawSeed(ctx, s);
    for (const o of g.obstacles) {
      const bob = o.kind === 'owl' ? g.owlBob(o) : 0;
      ctx.drawImage(this.obstacleSprite(sprites, o), Math.round(o.x), Math.round(o.y + bob));
    }

    this.drawPlayer(ctx, sprites);

    const tones: Record<Tone, string> = { figure: theme.figure, white: COLORS.white, dust: theme.dust };
    for (const p of g.particles) {
      ctx.globalAlpha = Math.min(1, (p.life / p.maxLife) * 1.5);
      ctx.fillStyle = tones[p.tone];
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    this.drawInstant(ctx, sprites);
  }

  private obstacleSprite(sprites: SpriteSheet, o: Obstacle): Sprite {
    if (o.kind === 'owl') return sprites.owl[Math.floor(o.phase * 8) % 2];
    return sprites[o.kind];
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, s: SpriteSheet): void {
    const g = this.game;
    if (g.state === 'over') {
      ctx.drawImage(s.fallen, PLAYER_X, GROUND_Y - s.fallen.height);
    } else if (g.isDucking()) {
      ctx.drawImage(s.duck, PLAYER_X, GROUND_Y - s.duck.height);
    } else {
      const sprite = g.onGround ? s.run[Math.floor(g.runPhase) % s.run.length] : s.jump;
      ctx.drawImage(sprite, PLAYER_X, Math.round(g.y));
    }
  }

  private drawSeed(ctx: CanvasRenderingContext2D, s: Seed): void {
    const t = this.game.time;
    const x = Math.round(s.x);
    const y = Math.round(s.y + Math.sin(t * 4 + s.phase));
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(x, y - 1, 1, 3);
    ctx.fillRect(x - 1, y, 3, 1);
    if (Math.sin(t * 6 + s.phase) > 0.6) {
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  /** While time stands still: a pale wash, a still border, and the arrow. */
  private drawInstant(ctx: CanvasRenderingContext2D, sprites: SpriteSheet): void {
    const g = this.game;
    const still = (1 - g.worldScale()) / (1 - INSTANT.worldScale); // 0..1
    if (still > 0) {
      ctx.fillStyle = `rgba(242, 229, 207, ${0.14 * still})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.strokeStyle = `rgba(242, 229, 207, ${0.8 * still})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(1.5, 13.5, VIEW_W - 3, GROUND_Y - 15);
    }
    if (g.arrow) ctx.drawImage(sprites.arrow, Math.round(g.arrow.x), g.arrow.y);
  }
}
