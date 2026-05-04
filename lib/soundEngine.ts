// Web Audio API only — no imports, no external files, all sounds synthesized

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private flowOscs: OscillatorNode[] = [];
  private flowGains: GainNode[] = [];
  private flowActive = false;
  private _muted = false;
  private _analysisPaused = false;
  private ready = false;

  // Track last rain level set by setRainIntensity so duck-restore and
  // post-pause decay both know what value to return to / decay from.
  private peakRainGain = 0;

  // For post-pause rain decay — tracks when rain was last actively driven
  private lastRainSetTime = 0;
  // Throttle the decay tick to ~5 Hz (200ms) so we don't flood the scheduler
  private lastDecayTickTime = 0;

  // Called on first keypress — AudioContext requires a user gesture
  resume(): void {
    if (this.ready) {
      this.ctx?.resume();
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(this.ctx.destination);
      this.setupRain();
      this.setupWind();
      this.ready = true;
      this.ctx.resume();
      this.startDecayLoop();
    } catch {
      // Web Audio unavailable in this environment
    }
  }

  // Internal rAF loop — handles post-pause rain decay continuously,
  // independent of whether the user is typing.
  private startDecayLoop(): void {
    const loop = () => {
      this.tickDecay();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private tickDecay(): void {
    if (!this.rainGain || !this.ctx || !this.ready || this.lastRainSetTime === 0) return;

    const elapsed = Date.now() - this.lastRainSetTime;
    if (elapsed < 5000) return; // actively typing — do nothing

    // Throttle to 5 Hz so we don't flood the Web Audio scheduler
    const now = Date.now();
    if (now - this.lastDecayTickTime < 200) return;
    this.lastDecayTickTime = now;

    // Ease rain to 15% of its peak over 10 seconds of silence
    const decayFactor = Math.min((elapsed - 5000) / 10000, 1);
    const target = this.peakRainGain * (1 - decayFactor) * 0.15;
    this.rainGain.gain.setTargetAtTime(
      Math.max(0, target),
      this.ctx.currentTime,
      2.0, // slow 2s time-constant — gradual ease
    );
  }

  private setupRain(): void {
    if (!this.ctx || !this.masterGain) return;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * 2, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < sr * 2; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 0.8;

    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0;

    src.connect(filter);
    filter.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);
    src.start();
  }

  private setupWind(): void {
    if (!this.ctx || !this.masterGain) return;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * 3, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < sr * 3; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;

    src.connect(filter);
    filter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    src.start();
  }

  setRainIntensity(value: number): void {
    if (!this.rainGain || !this.ctx || !this.ready) return;
    // Max 0.25 — present but not oppressive
    const target = Math.min(0.25, Math.max(0, value * 0.25));
    this.peakRainGain = target;
    this.lastRainSetTime = Date.now();
    this.rainGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.5);
  }

  setWindIntensity(value: number): void {
    if (!this.windGain || !this.ctx || !this.ready) return;
    // Max 0.10
    this.windGain.gain.setTargetAtTime(
      Math.min(0.10, Math.max(0, value * 0.10)),
      this.ctx.currentTime,
      0.3,
    );
  }

  playThunder(): void {
    if (!this.ctx || !this.masterGain || !this.ready) return;
    const now = this.ctx.currentTime;

    // Primary oscillator: 60→20 Hz sawtooth, gain 0.8
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(60, now);
    osc1.frequency.exponentialRampToValueAtTime(20, now + 0.5);

    const filt1 = this.ctx.createBiquadFilter();
    filt1.type = 'lowpass';
    filt1.frequency.value = 200;

    const gain1 = this.ctx.createGain();
    gain1.gain.setValueAtTime(0.8, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    osc1.connect(filt1);
    filt1.connect(gain1);
    gain1.connect(this.masterGain);
    osc1.start(now);
    osc1.stop(now + 1.5);

    // Second oscillator: 40 Hz sub-bass for physical rumble depth, gain 0.4
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(40, now);
    osc2.frequency.exponentialRampToValueAtTime(15, now + 0.8);

    const filt2 = this.ctx.createBiquadFilter();
    filt2.type = 'lowpass';
    filt2.frequency.value = 120;

    const gain2 = this.ctx.createGain();
    gain2.gain.setValueAtTime(0.4, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    osc2.connect(filt2);
    filt2.connect(gain2);
    gain2.connect(this.masterGain);
    osc2.start(now);
    osc2.stop(now + 1.5);

    // Duck rain for 300ms then restore — thunder cuts through like real life
    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(0.1, now, 0.04);              // fast duck
      this.rainGain.gain.setTargetAtTime(this.peakRainGain, now + 0.3, 0.3); // gradual restore
    }
  }

  playKeystroke(isDelete: boolean): void {
    if (!this.ctx || !this.masterGain || !this.ready) return;
    const now = this.ctx.currentTime;
    const freq = isDelete
      ? 1800 + Math.random() * 400
      : 2400 + Math.random() * 800;
    // Keystroke tick: 0.03 (not) / delete: 0.05
    const gainVal = isDelete ? 0.05 : 0.03;
    const dur = isDelete ? 0.12 : 0.08;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur);
  }

  startFlowTone(): void {
    if (!this.ctx || !this.masterGain || this.flowActive || !this.ready) return;
    this.flowActive = true;
    const now = this.ctx.currentTime;

    this.flowOscs = [];
    this.flowGains = [];

    for (const freq of [220, 330, 440]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      // 0.015 per oscillator — felt more than heard
      gain.gain.linearRampToValueAtTime(0.015, now + 3);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);

      this.flowOscs.push(osc);
      this.flowGains.push(gain);
    }
  }

  stopFlowTone(): void {
    if (!this.ctx || !this.flowActive || !this.ready) return;
    this.flowActive = false;
    const now = this.ctx.currentTime;

    this.flowGains.forEach(g => g.gain.setTargetAtTime(0, now, 0.8));
    const toStop = this.flowOscs;
    const stopAt = now + 4;
    toStop.forEach(o => { try { o.stop(stopAt); } catch {} });

    this.flowOscs = [];
    this.flowGains = [];
  }

  // Fade out when analysis panel opens (500ms via timeConstant 0.2)
  pauseAll(): void {
    if (!this.masterGain || !this.ctx || !this.ready) return;
    this._analysisPaused = true;
    this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }

  // Fade back in when returning to writing (800ms via timeConstant 0.3)
  resumeAll(): void {
    if (!this.masterGain || !this.ctx || !this.ready) return;
    this._analysisPaused = false;
    // Only restore volume if the user hasn't muted manually
    if (!this._muted) {
      this.masterGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.3);
    }
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this._muted ? 0 : 1,
        this.ctx.currentTime,
        0.1,
      );
    }
    return this._muted;
  }

  get isMuted(): boolean {
    return this._muted;
  }
}
