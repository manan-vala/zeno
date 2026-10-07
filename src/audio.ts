/**
 * All sound is synthesized with the Web Audio API, so there are no audio files.
 * Plucked notes use the Karplus-Strong algorithm, which sounds a lot like a lyre.
 */

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// D Dorian: Dm – C – Dm – G. The B natural in G major is what makes it Dorian.
const BARS = [
  { bass: 38, tones: [62, 65, 69, 74] },
  { bass: 36, tones: [60, 64, 67, 72] },
  { bass: 38, tones: [62, 65, 69, 74] },
  { bass: 43, tones: [62, 67, 71, 74] },
];
const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
// A melody over the four bars, in eighth notes; -1 is a rest.
const MELODY = [
  [74, -1, 77, -1, 76, 74, -1, 72],
  [72, -1, 76, -1, 79, -1, 77, 76],
  [74, -1, 81, -1, 79, 77, 76, 74],
  [79, -1, 77, -1, 74, -1, 71, -1],
];

/**
 * Zeno's millet seed: one seed makes no sound, a bushel makes a song. The
 * music gains a layer as the seeds you've gathered in this run add up.
 */
export const LAYER_THRESHOLDS = [10, 25, 50];
export function musicLayers(seeds: number): number {
  return 1 + LAYER_THRESHOLDS.filter((t) => seeds >= t).length;
}
// Rising notes for seed pickups in a streak (D minor pentatonic, two octaves).
const SEED_SCALE = [74, 77, 79, 81, 84, 86, 89, 91, 93, 96];

const SHEPARD_VOICES = 6;
const SHEPARD_BASE = 55; // Hz, the lowest octave (A1)

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private shepard: { oscs: OscillatorNode[]; gains: GainNode[]; out: GainNode; phase: number } | null = null;
  private shepardRate = 0.05; // octaves per second
  private tempoScale = 1;
  private noise!: AudioBuffer;
  private plucks = new Map<number, AudioBuffer>();

  private muted: boolean;
  private musicPlaying = false;
  private timer: number | undefined;
  private nextNoteTime = 0;
  private step = 0;
  private bpm = 100;
  private layers = 1;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Browsers only allow audio after a user gesture, so call this from one. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.7;
      this.sfx.connect(this.master);
      this.music = this.ctx.createGain();
      this.music.gain.value = 0.32;
      // Everything musical runs through a filter so Instant can muffle it.
      this.musicFilter = this.ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 18000;
      this.music.connect(this.musicFilter).connect(this.master);
      this.noise = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  // -- Sound effects --------------------------------------------------------

  jump(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.pluck(69, t, 0.35, this.sfx);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(760, t + 0.09);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  land(): void {
    if (!this.ctx) return;
    this.noiseBurst(this.ctx.currentTime, 0.06, 'lowpass', 380, 0.35);
  }

  duck(): void {
    if (!this.ctx) return;
    this.noiseBurst(this.ctx.currentTime, 0.1, 'bandpass', 900, 0.12);
  }

  /** `streak` is how many seeds in a row; each one climbs the scale. */
  seed(streak: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const note = SEED_SCALE[Math.min(streak, SEED_SCALE.length - 1)];
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = midiToFreq(note);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  /** The gap to the tortoise just halved. */
  halve(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [62, 69, 74, 77, 81].forEach((m, i) => this.pluck(m, t + i * 0.055, 0.32, this.sfx));
  }

  hit(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    // A snapped string falling in pitch...
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.45);
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(filter).connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.5);
    // ...and pottery cracking.
    for (let i = 0; i < 4; i++) {
      this.noiseBurst(t + i * 0.035 + Math.random() * 0.02, 0.03, 'bandpass', 2200 + Math.random() * 1800, 0.35);
    }
    this.pluck(38, t, 0.4, this.sfx);
  }

  /** The vase falls apart `delay` seconds from now: a clatter of shards. */
  shatter(delay: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    this.noiseBurst(t, 0.25, 'lowpass', 500, 0.35);
    for (let i = 0; i < 9; i++) {
      this.noiseBurst(t + 0.05 + i * 0.07 + Math.random() * 0.05, 0.04, 'bandpass', 1500 + Math.random() * 3000, 0.25);
    }
  }

  /** The new vase flies back together: a rising swell and an up-arpeggio. */
  reassemble(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(4000, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    src.connect(filter).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + 0.6);
    [62, 69, 74, 81].forEach((m, i) => this.pluck(m, t + 0.3 + i * 0.05, 0.25, this.sfx));
  }

  /** Time stops (or starts again): muffle and slow the music, with a whoosh. */
  instant(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.musicFilter.frequency.setTargetAtTime(on ? 420 : 18000, t, on ? 0.05 : 0.15);
    this.tempoScale = on ? 0.5 : 1;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(on ? 3000 : 300, t);
    filter.frequency.exponentialRampToValueAtTime(on ? 250 : 3000, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(filter).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.42);
  }

  /** Short descending phrase after the run ends. */
  gameOver(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.45;
    [69, 65, 62, 57].forEach((m, i) => this.pluck(m, t + i * 0.22, 0.3, this.sfx));
  }

  start(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [62, 69, 74].forEach((m, i) => this.pluck(m, t + i * 0.07, 0.3, this.sfx));
  }

  // -- Music ----------------------------------------------------------------

  startMusic(): void {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.25;
    this.music.gain.cancelScheduledValues(this.ctx.currentTime);
    this.music.gain.setValueAtTime(0.32, this.ctx.currentTime);
    this.tempoScale = 1;
    this.musicFilter.frequency.cancelScheduledValues(this.ctx.currentTime);
    this.musicFilter.frequency.setValueAtTime(18000, this.ctx.currentTime);
    this.startShepard();
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    if (!this.musicPlaying) return;
    this.musicPlaying = false;
    window.clearInterval(this.timer);
    this.stopShepard();
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.music.gain.setValueAtTime(this.music.gain.value, t);
      this.music.gain.linearRampToValueAtTime(0, t + 0.3);
    }
  }

  /**
   * @param speed01 run speed normalised to 0..1: drives the tempo and how fast
   *                the Shepard tone climbs
   * @param seeds   seeds gathered this run, which add musical layers
   */
  setIntensity(speed01: number, seeds: number): void {
    this.bpm = 96 + speed01 * 44;
    this.layers = musicLayers(seeds);
    this.shepardRate = 0.04 + speed01 * 0.1;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.updateShepard(0.025);
    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += 60 / (this.bpm * this.tempoScale) / 2; // eighth notes
      this.step = (this.step + 1) % (BARS.length * 8);
    }
  }

  private playStep(step: number, t: number): void {
    const bar = BARS[Math.floor(step / 8)];
    const beat = step % 8;
    if (beat === 0 || beat === 4) this.pluck(bar.bass, t, 0.5, this.music);
    this.pluck(bar.tones[ARP[beat]], t, 0.22, this.music);
    if (this.layers >= 2 && beat % 2 === 1) this.pluck(bar.tones[ARP[beat]] + 12, t, 0.08, this.music);
    if (this.layers >= 3) this.noiseBurst(t, 0.025, 'highpass', 6000, beat % 2 ? 0.05 : 0.09, this.music);
    const note = MELODY[Math.floor(step / 8)][beat];
    if (this.layers >= 4 && note > 0) this.pluck(note + 12, t, 0.2, this.music);
  }

  // -- Shepard tone ---------------------------------------------------------
  // Six sine waves an octave apart all glide upward; each fades in at the
  // bottom and out at the top, so the pitch seems to rise forever without
  // getting anywhere. Zeno would approve.

  private startShepard(): void {
    const ctx = this.ctx!;
    if (this.shepard) return;
    const out = ctx.createGain();
    out.gain.value = 0.05;
    out.connect(this.music);
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    for (let i = 0; i < SHEPARD_VOICES; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(out);
      osc.start();
      oscs.push(osc);
      gains.push(g);
    }
    this.shepard = { oscs, gains, out, phase: 0 };
    this.updateShepard(0);
  }

  private stopShepard(): void {
    if (!this.shepard || !this.ctx) return;
    const { oscs, out } = this.shepard;
    const t = this.ctx.currentTime;
    out.gain.setTargetAtTime(0, t, 0.08);
    oscs.forEach((o) => o.stop(t + 0.5));
    this.shepard = null;
  }

  private updateShepard(dt: number): void {
    const ctx = this.ctx;
    const sh = this.shepard;
    if (!ctx || !sh) return;
    const before = sh.phase;
    sh.phase = (sh.phase + dt * this.shepardRate * this.tempoScale) % SHEPARD_VOICES;
    const t = ctx.currentTime;
    for (let i = 0; i < SHEPARD_VOICES; i++) {
      const prev = (i + before) % SHEPARD_VOICES;
      const octave = (i + sh.phase) % SHEPARD_VOICES; // 0..6
      const freq = SHEPARD_BASE * Math.pow(2, octave);
      // Loudest in the middle octaves, silent at both ends.
      const level = Math.exp(-((octave - SHEPARD_VOICES / 2) ** 2) / 2.2);
      const f = sh.oscs[i].frequency;
      // A voice that just wrapped from the top back to the bottom jumps
      // instantly (it's silent there); the rest glide.
      if (octave < prev) f.setValueAtTime(freq, t);
      else f.setTargetAtTime(freq, t, 0.03);
      sh.gains[i].gain.setTargetAtTime(level, t, 0.03);
    }
  }


  // -- Building blocks ------------------------------------------------------

  private pluck(midi: number, when: number, gain: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.pluckBuffer(midi);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest);
    src.start(when);
  }

  /** Karplus-Strong: a burst of noise fed through a short, damped delay line. */
  private pluckBuffer(midi: number): AudioBuffer {
    const cached = this.plucks.get(midi);
    if (cached) return cached;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const length = Math.floor(sr * 1.4);
    const buffer = ctx.createBuffer(1, length, sr);
    const data = buffer.getChannelData(0);
    const period = Math.max(2, Math.round(sr / midiToFreq(midi)));
    const line = new Float32Array(period);
    let prev = 0;
    for (let i = 0; i < period; i++) {
      // Softened noise gives a warmer, gut-string attack.
      prev = prev * 0.5 + (Math.random() * 2 - 1) * 0.5;
      line[i] = prev;
    }
    const damping = 0.996;
    let idx = 0;
    for (let i = 0; i < length; i++) {
      const next = (idx + 1) % period;
      const v = line[idx];
      data[i] = v * 0.8;
      line[idx] = damping * 0.5 * (v + line[next]);
      idx = next;
    }
    this.plucks.set(midi, buffer);
    return buffer;
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private noiseBurst(
    when: number,
    dur: number,
    type: BiquadFilterType,
    freq: number,
    gain: number,
    dest: AudioNode = this.sfx,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(filter).connect(g).connect(dest);
    src.start(when, Math.random() * 0.5);
    src.stop(when + dur + 0.01);
  }
}
