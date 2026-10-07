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
// Rising notes for seed pickups in a streak (D minor pentatonic, two octaves).
const SEED_SCALE = [74, 77, 79, 81, 84, 86, 89, 91, 93, 96];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
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
      this.music.connect(this.master);
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
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    if (!this.musicPlaying) return;
    this.musicPlaying = false;
    window.clearInterval(this.timer);
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.music.gain.setValueAtTime(this.music.gain.value, t);
      this.music.gain.linearRampToValueAtTime(0, t + 0.3);
    }
  }

  /**
   * @param speed01 run speed normalised to 0..1, which drives the tempo
   * @param stage   how many times the gap has halved, which adds layers
   */
  setIntensity(speed01: number, stage: number): void {
    this.bpm = 96 + speed01 * 44;
    this.layers = 1 + Math.min(2, Math.floor(stage / 2));
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += 60 / this.bpm / 2; // eighth notes
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
