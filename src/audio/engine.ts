/**
 * Engine sound, the core "feel" instrument (docs/DESIGN.md → Sound). Pitch and
 * brightness track speed, so acceleration is heard before it is read off the
 * HUD. This is a read-only view of sim state, like the renderer: it never writes
 * back.
 *
 * Built on the raw Web Audio API (no wrapper) as one small mixer graph:
 *
 *   osc(saw) + osc(saw, sub) + noise → lowpass → master → destination
 *
 * The `AudioContext` is created lazily on the first user gesture to satisfy the
 * autoplay policy; until then `update` is a no-op.
 */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private master: GainNode | null = null;

  /** Arm lazy start: the first keydown/pointerdown builds and resumes the graph. */
  attach(target: Window = window): void {
    const start = (): void => {
      this.init();
      target.removeEventListener('keydown', start);
      target.removeEventListener('pointerdown', start);
    };
    target.addEventListener('keydown', start);
    target.addEventListener('pointerdown', start);
  }

  private init(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    filter.Q.value = 6;
    filter.connect(master);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 55;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 27.5;
    osc2.detune.value = 8;

    osc1.connect(filter);
    osc2.connect(filter);

    // A breath of looped noise for grit, kept low so it never masks the tone.
    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.06;
    noise.connect(noiseGain).connect(filter);

    osc1.start();
    osc2.start();
    noise.start();
    void ctx.resume();

    this.ctx = ctx;
    this.osc1 = osc1;
    this.osc2 = osc2;
    this.filter = filter;
    this.master = master;
  }

  /** Track speed each frame. Smoothed via `setTargetAtTime` to avoid clicks. */
  update(speed: number): void {
    if (!this.ctx || !this.osc1 || !this.osc2 || !this.filter || !this.master) return;
    const t = this.ctx.currentTime;
    const n = Math.max(0, Math.min(speed / 66, 1));

    const f = 55 + n * 120;
    this.osc1.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.filter.frequency.setTargetAtTime(400 + n * 1800, t, 0.05);
    this.master.gain.setTargetAtTime(0.05 + n * 0.09, t, 0.1);
  }
}
