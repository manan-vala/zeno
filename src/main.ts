import '@fontsource/cinzel/700.css';
import '@fontsource/silkscreen/400.css';
import './style.css';

import { AudioEngine } from './audio';
import { VIEW_H, VIEW_W } from './config';
import { Game, type GameState } from './game';
import { formatGapDecimal, formatStageFraction, tauntFor } from './score';
import { loadFlag, loadNumber, save } from './storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const stageEl = $<HTMLElement>('stage');
const screen = $<HTMLCanvasElement>('screen');
const overlay = $<HTMLDivElement>('overlay');
const toast = $<HTMLDivElement>('toast');
const fractionEl = $<HTMLSpanElement>('fraction');
const decimalEl = $<HTMLSpanElement>('decimal');
const seedsEl = $<HTMLElement>('seeds');
const bestEl = $<HTMLElement>('best');
const tauntEl = $<HTMLParagraphElement>('taunt');
const muteBtn = $<HTMLButtonElement>('mute');

// Everything is drawn into a small buffer, then scaled up onto the screen canvas.
const buffer = document.createElement('canvas');
buffer.width = VIEW_W;
buffer.height = VIEW_H;
const bctx = buffer.getContext('2d')!;
const sctx = screen.getContext('2d')!;

const audio = new AudioEngine(loadFlag('zeno.muted', false));
const isTouch = matchMedia('(pointer: coarse)').matches;

function showOverlay(state: GameState, html = ''): void {
  if (state === 'running') {
    overlay.hidden = true;
    return;
  }
  overlay.hidden = false;
  const action = isTouch ? 'Tap' : 'Press Space';
  if (state === 'title') {
    const controls = isTouch ? 'Tap to run · hold the left side to duck' : `${action} to run · ↓ to duck`;
    overlay.innerHTML = `<div class="card"><h2>Catch the tortoise</h2><p>${controls}</p></div>`;
  } else if (state === 'paused') {
    overlay.innerHTML = `<div class="card"><h2>Paused</h2><p>${action} or P to continue</p></div>`;
  } else {
    overlay.innerHTML = html;
  }
}

function showToast(text: string): void {
  toast.textContent = text;
  toast.classList.remove('show');
  void toast.offsetWidth; // restart the animation
  toast.classList.add('show');
}

function renderBest(distance: number): void {
  bestEl.textContent = distance > 0 ? formatGapDecimal(distance) : '0';
}

const game = new Game({
  audio,
  events: {
    onStateChange: (state) => {
      stageEl.dataset.state = state;
      showOverlay(state);
    },
    onStage: (stage) => {
      fractionEl.textContent = formatStageFraction(stage);
      tauntEl.textContent = tauntFor(stage);
      if (stage > 0) showToast(formatStageFraction(stage));
    },
    onSeeds: (count) => {
      seedsEl.textContent = String(count);
    },
    onGameOver: ({ distance, seeds, best, previousBest }) => {
      save('zeno.best', best);
      renderBest(best);
      const action = isTouch ? 'Tap' : 'Press Space';
      showOverlay(
        'over',
        `<div class="card">
          <h2>${previousBest > 0 && distance > previousBest ? 'Closer than ever.' : 'The tortoise wins. Again.'}</h2>
          <p class="stats-line">Gap closed ${formatGapDecimal(distance)} · ${seeds} seed${seeds === 1 ? '' : 's'}</p>
          <p>${action} to run again</p>
        </div>`,
      );
    },
  },
  best: loadNumber('zeno.best', 0),
});
renderBest(game.best);
stageEl.dataset.state = 'title';
showOverlay('title');

// -- Sound toggle -------------------------------------------------------------

function renderMute(): void {
  muteBtn.textContent = audio.isMuted ? 'Sound off' : 'Sound on';
  muteBtn.setAttribute('aria-pressed', String(audio.isMuted));
}

function toggleMute(): void {
  audio.unlock();
  audio.setMuted(!audio.isMuted);
  save('zeno.muted', audio.isMuted);
  renderMute();
}

muteBtn.addEventListener('click', (e) => {
  toggleMute();
  (e.currentTarget as HTMLButtonElement).blur(); // keep Space for jumping
});
renderMute();

// -- Keyboard -----------------------------------------------------------------

const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
const DUCK_KEYS = new Set(['ArrowDown', 'KeyS']);

window.addEventListener('keydown', (e) => {
  if (JUMP_KEYS.has(e.code)) {
    e.preventDefault();
    if (!e.repeat) game.pressJump();
  } else if (DUCK_KEYS.has(e.code)) {
    e.preventDefault();
    game.setDuck(true);
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    game.togglePause();
  } else if (e.code === 'KeyM') {
    toggleMute();
  } else if (e.code === 'Enter' && (game.state === 'title' || game.state === 'over')) {
    game.pressJump();
  }
});

window.addEventListener('keyup', (e) => {
  if (JUMP_KEYS.has(e.code)) game.releaseJump();
  else if (DUCK_KEYS.has(e.code)) game.setDuck(false);
});

// -- Touch / mouse ------------------------------------------------------------
// Mouse: click anywhere to jump. Touch: hold the left third to duck, tap
// anywhere else to jump. Separate zones mean ducking never starts with a hop.

const DUCK_ZONE = 0.35;
const pointerRoles = new Map<number, 'jump' | 'duck'>();
const holding = (role: 'jump' | 'duck') => [...pointerRoles.values()].includes(role);

stageEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const rect = stageEl.getBoundingClientRect();
  const inDuckZone = e.pointerType !== 'mouse' && e.clientX - rect.left < rect.width * DUCK_ZONE;
  if (inDuckZone && game.state === 'running') {
    pointerRoles.set(e.pointerId, 'duck');
    game.setDuck(true);
  } else {
    pointerRoles.set(e.pointerId, 'jump');
    game.pressJump();
  }
});

const endPointer = (e: PointerEvent) => {
  const role = pointerRoles.get(e.pointerId);
  pointerRoles.delete(e.pointerId);
  if (role === 'jump' && !holding('jump')) game.releaseJump();
  if (role === 'duck' && !holding('duck')) game.setDuck(false);
};
stageEl.addEventListener('pointerup', endPointer);
stageEl.addEventListener('pointercancel', endPointer);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pauseIfRunning();
});
window.addEventListener('blur', () => game.pauseIfRunning());

// -- Canvas sizing and main loop ----------------------------------------------

function resize(): void {
  const rect = screen.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  screen.width = Math.max(VIEW_W, Math.round(rect.width * dpr));
  screen.height = Math.max(VIEW_H, Math.round(rect.height * dpr));
}
new ResizeObserver(resize).observe(screen);
resize();

let last = performance.now();
let lastDecimal = '';

function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  game.tick(dt);
  game.render(bctx);

  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(buffer, 0, 0, screen.width, screen.height);

  const decimal = formatGapDecimal(game.distance);
  if (decimal !== lastDecimal) {
    decimalEl.textContent = decimal;
    lastDecimal = decimal;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for poking at the game from the console (and for browser tests):
// always on in dev, and in production with ?debug in the URL.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { zeno: Game }).zeno = game;
}
