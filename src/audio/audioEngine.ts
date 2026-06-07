export type SoundName = 'pickup' | 'crash' | 'shoot' | 'start' | 'upgrade' | 'explosion';

export class AudioEngine {
  private context: AudioContext | null = null;

  resume(): void {
    if (!this.context) {
      this.context = new AudioContext();
    }

    void this.context.resume();
  }

  play(name: SoundName): void {
    if (!this.context) {
      return;
    }

    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const config = getSoundConfig(name);

    oscillator.frequency.setValueAtTime(config.frequency, now);
    oscillator.type = config.type;
    gain.gain.setValueAtTime(config.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + config.duration);

    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + config.duration);
  }
}

function getSoundConfig(name: SoundName): {
  frequency: number;
  duration: number;
  gain: number;
  type: OscillatorType;
} {
  switch (name) {
    case 'pickup':
      return { frequency: 660, duration: 0.08, gain: 0.08, type: 'triangle' };
    case 'crash':
      return { frequency: 96, duration: 0.16, gain: 0.12, type: 'sawtooth' };
    case 'shoot':
      return { frequency: 180, duration: 0.07, gain: 0.08, type: 'square' };
    case 'start':
      return { frequency: 220, duration: 0.2, gain: 0.08, type: 'sawtooth' };
    case 'upgrade':
      return { frequency: 520, duration: 0.12, gain: 0.08, type: 'sine' };
    case 'explosion':
      return { frequency: 72, duration: 0.24, gain: 0.14, type: 'sawtooth' };
  }
}
