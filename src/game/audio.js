export function initAudio(world) {
  if (world.audio.ctx) return;
  try {
    const ctx = new AudioContext();
    world.audio.ctx = ctx;
    world.audio.gain = ctx.createGain();
    world.audio.gain.gain.value = 0.0001;
    world.audio.gain.connect(ctx.destination);
    void ctx.resume();
  } catch (e) {
    console.warn("Audio init failed:", e);
    world.audio.ctx = null;
    world.audio.gain = null;
  }
}

export function updateAudioVolume(state, world) {
  if (world.audio.gain) {
    world.audio.gain.gain.value = state.options.volume / 100;
  }
}

export function beep(world, frequency, duration, type) {
  if (!world.audio.ctx || !world.audio.gain) return;
  const ctx = world.audio.ctx;
  if (ctx.state !== "running") {
    void ctx.resume();
    return;
  }
  let osc;
  try {
    osc = ctx.createOscillator();
  } catch (e) {
    return;
  }
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(world.audio.gain);
  try {
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    /* context not ready */
  }
}

export function updateEngineSound(world, state, speedFactor, skidding) {
  const ctx = world.audio.ctx;
  if (!ctx || !world.audio.gain) return;
  if (ctx.state !== "running") {
    void ctx.resume();
    return;
  }

  if (!world._engineAudio) {
    world._engineAudio = {};
  }
  const ea = world._engineAudio;

  if (!ea.osc) {
    try {
      ea.filter = ctx.createBiquadFilter();
      ea.filter.type = "bandpass";
      ea.filter.frequency.value = 180;
      ea.filter.Q.value = 1.4;

      ea.gain = ctx.createGain();
      ea.gain.gain.value = 0.0001;

      ea.osc = ctx.createOscillator();
      ea.osc.type = "sawtooth";
      ea.osc.frequency.value = 80;
      ea.osc.connect(ea.filter);
      ea.filter.connect(ea.gain);
      ea.gain.connect(world.audio.gain);
      ea.osc.start();
    } catch (e) {
      console.warn("Engine sound init failed:", e);
      ea.osc = null;
      ea.gain = null;
      ea.filter = null;
      return;
    }
  }

  const t = ctx.currentTime;
  const targetFreq = 55 + speedFactor * 145 + (skidding ? 30 : 0);
  const targetVol = 0.028 + speedFactor * 0.022;
  try {
    ea.osc.frequency.linearRampToValueAtTime(targetFreq, t + 0.08);
    ea.gain.gain.linearRampToValueAtTime(
      targetVol * (state.options.volume / 100),
      t + 0.08,
    );
    ea.filter.frequency.linearRampToValueAtTime(
      80 + speedFactor * 220,
      t + 0.08,
    );
  } catch (e) {
    /* invalid audio node */
  }
}

export function playSkidSound(world) {
  const ctx = world.audio.ctx;
  if (!ctx || !world.audio.gain || world._skidAudio?.noise) return;
  if (ctx.state !== "running") {
    void ctx.resume();
    return;
  }

  if (!world._skidAudio) {
    world._skidAudio = {};
  }
  const sa = world._skidAudio;

  const bufSize = ctx.sampleRate * 0.5;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  sa.noise = ctx.createBufferSource();
  sa.noise.buffer = buf;
  sa.noise.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1100;
  filter.Q.value = 0.8;

  sa.gain = ctx.createGain();
  sa.gain.gain.value = 0.0001;
  sa.noise.connect(filter);
  filter.connect(sa.gain);
  sa.gain.connect(world.audio.gain);
  try {
    sa.noise.start();
  } catch (e) {
    console.warn("Skid sound start failed:", e);
    sa.noise = null;
    sa.gain = null;
    return;
  }

  const t = ctx.currentTime;
  sa.gain.gain.linearRampToValueAtTime(
    0.045 * (state?.options?.volume ?? 100) / 100,
    t + 0.08,
  );
}

export function stopSkidSound(world) {
  if (!world._skidAudio || !world._skidAudio.noise) return;
  const sa = world._skidAudio;
  const ctx = world.audio.ctx;
  try {
    if (ctx && sa.gain) {
      sa.gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
    }
    sa.noise.stop(ctx ? ctx.currentTime + 0.15 : 0);
  } catch (e) {
    /* already stopped */
  }
  sa.noise = null;
  sa.gain = null;
}