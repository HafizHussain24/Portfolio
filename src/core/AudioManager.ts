// ─────────────────────────────────────────────────────────────────────────────
//  AudioManager.ts  –  Web Audio API synthesizer + sound library
//
//  ALL sounds are synthesised — no external audio files are loaded.
//  Master volume and mute state are persisted in localStorage.
//  The AudioContext is created only after the first user gesture
//  (required by browser autoplay policy — boot screen "PRESS START" satisfies this).
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY_VOL  = 'casefile_vol';
const STORAGE_KEY_MUTE = 'casefile_mute';

// ─── Types ────────────────────────────────────────────────────────────────────
type OscType = OscillatorType;

interface ToneParams {
  type?: OscType;
  freq?: number;
  duration?: number;
  gain?: number;
  attack?: number;
  release?: number;
  detune?: number;
}

// ─── AudioManager ─────────────────────────────────────────────────────────────
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private _muted: boolean;
  private _volume: number;

  // Long-running nodes we need to stop later
  private rainNode:  AudioBufferSourceNode | null = null;
  private rainGain:  GainNode | null = null;
  private lofiNode:  AudioBufferSourceNode | null = null;
  private lofiGain:  GainNode | null = null;
  private _lofiPlaying = false;
  private rainStopTimeout: any = null;

  constructor() {
    const storedVol  = parseFloat(localStorage.getItem(STORAGE_KEY_VOL)  ?? '0.7');
    const storedMute = (localStorage.getItem(STORAGE_KEY_MUTE) === 'true');
    this._volume = isNaN(storedVol) ? 0.7 : storedVol;
    this._muted  = storedMute;
  }

  // ── Unlock AudioContext (call on first gesture) ──────────────────────────
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this._muted ? 0 : this._volume;
    this.masterGain.connect(this.ctx.destination);
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  get isUnlocked(): boolean { return this.ctx !== null; }
  get muted(): boolean      { return this._muted; }
  get volume(): number      { return this._volume; }
  get lofiPlaying(): boolean { return this._lofiPlaying; }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && !this._muted) {
      this.masterGain.gain.setTargetAtTime(this._volume, this.ctx!.currentTime, 0.05);
    }
    localStorage.setItem(STORAGE_KEY_VOL, String(this._volume));
  }

  setMute(muted: boolean): void {
    this._muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this._volume, this.ctx!.currentTime, 0.05);
    }
    localStorage.setItem(STORAGE_KEY_MUTE, String(muted));
  }

  toggleMute(): void { this.setMute(!this._muted); }

  // ─── UI Sounds ─────────────────────────────────────────────────────────────

  /** Short blip on hover */
  playHover(): void {
    this.tone({ type: 'sine', freq: 880, duration: 0.06, gain: 0.15, attack: 0.005, release: 0.05 });
  }

  /** Satisfying click */
  playClick(): void {
    this.tone({ type: 'square', freq: 440, duration: 0.08, gain: 0.2, attack: 0.002, release: 0.07 });
    setTimeout(() => this.tone({ type: 'sine', freq: 660, duration: 0.06, gain: 0.1, attack: 0.002, release: 0.05 }), 30);
  }

  /** Whoosh for scene transitions */
  playWhoosh(): void {
    if (!this.ctx) return;
    const ctx  = this.ctx;
    const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.4);
    filter.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    src.connect(filter).connect(g).connect(this.masterGain);
    src.start();
  }

  /** Aerosol spray hiss */
  playSpray(duration = 1.0): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) { data[i] = Math.random() * 2 - 1; }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 6000; // High hiss
    filter.Q.value = 1.5;
    
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.4, ctx.currentTime + duration - 0.2);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    
    noise.connect(filter).connect(gain).connect(this.masterGain);
    noise.start();
  }


  /** Paper/card rustle */
  playRustle(): void {
    if (!this.ctx) return;
    const ctx  = this.ctx;
    const dur  = 0.3;
    const buf  = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.value = 0.25;
    src.connect(filter).connect(g).connect(this.masterGain);
    src.start();
  }

  /** Heavy paper slam onto a desk */
  playPaperSlam(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    // Thump
    this.tone({ type: 'triangle', freq: 100, duration: 0.15, gain: 0.4, attack: 0.01, release: 0.1 });
    this.tone({ type: 'sine', freq: 60, duration: 0.2, gain: 0.3, attack: 0.01, release: 0.15 });
    
    // Slap
    const dur = 0.1;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 4000;
    const g = ctx.createGain();
    g.gain.value = 0.2;
    src.connect(filter).connect(g).connect(this.masterGain);
    src.start();
  }

  /** CRT static burst */
  playStaticBurst(duration = 0.25): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
    
    const src = ctx.createBufferSource();
    src.buffer = buf;
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;
    
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    
    src.connect(filter).connect(g).connect(this.masterGain);
    src.start();
  }

  /** Single paint drip sound */
  playDrip(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);
    
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    
    osc.connect(g).connect(this.masterGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.16);
  }

  /** Spray-paint hiss for graffiti scene */
  playSprayHiss(durationSec = 1.2): void {
    if (!this.ctx) return;
    const ctx  = this.ctx;
    const buf  = ctx.createBuffer(1, ctx.sampleRate * durationSec, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 8000;
    filter.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);
    src.connect(filter).connect(g).connect(this.masterGain);
    src.start();
  }

  /** Boot chime swell — ascending sine chord */
  playBootChime(): void {
    if (!this.ctx) return;
    const freqs = [130.81, 164.81, 196.00, 261.63]; // C3 chord
    freqs.forEach((f, i) => {
      setTimeout(() => {
        this.tone({ type: 'sine', freq: f, duration: 3.0, gain: 0.12, attack: 0.4, release: 2.0 });
        this.tone({ type: 'sine', freq: f * 2, duration: 2.5, gain: 0.06, attack: 0.5, release: 1.8 });
      }, i * 200);
    });
  }

  /** Distant thunder — low rumble */
  playThunder(): void {
    if (!this.ctx) return;
    const ctx  = this.ctx;
    const dur  = 2.5;
    const buf  = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 80;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter).connect(g).connect(this.masterGain);
    src.start();
  }

  // ─── Ambient Loops ─────────────────────────────────────────────────────────

  /** Start continuous rain sound */
  startRain(gain = 0.12): void {
    if (this.rainStopTimeout) {
      clearTimeout(this.rainStopTimeout);
      this.rainStopTimeout = null;
    }

    if (this.ctx && this.rainNode && this.rainGain) {
      this.rainGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.rainGain.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 2);
      return;
    }

    if (!this.ctx || this.rainNode) return;
    const ctx      = this.ctx;
    const dur      = 4; // seconds of buffer, looped
    const buf      = ctx.createBuffer(2, ctx.sampleRate * dur, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop   = true;

    const hipass = ctx.createBiquadFilter();
    hipass.type = 'highpass';
    hipass.frequency.value = 2000;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 8000;

    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.rainGain.gain.linearRampToValueAtTime(gain, ctx.currentTime + 2);

    src.connect(hipass).connect(lowpass).connect(this.rainGain).connect(this.masterGain);
    src.start();
    this.rainNode = src;
  }

  stopRain(): void {
    if (!this.rainGain || !this.ctx) return;
    if (this.rainStopTimeout) {
      clearTimeout(this.rainStopTimeout);
      this.rainStopTimeout = null;
    }
    this.rainGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.rainGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.5);
    this.rainStopTimeout = setTimeout(() => {
      this.rainNode?.stop();
      this.rainNode = null;
      this.rainStopTimeout = null;
    }, 2000);
  }

  /** Toggle the synthesised lo-fi loop (cassette prop in Desk scene) */
  toggleLofi(): void {
    if (this._lofiPlaying) {
      this.stopLofi();
    } else {
      this.startLofi();
    }
  }

  private startLofi(): void {
    if (!this.ctx || this._lofiPlaying) return;
    this._lofiPlaying = true;
    // Simple lo-fi: detuned sawtooth + slight reverb simulation
    const ctx   = this.ctx;
    const freqs = [130.81, 196.00, 261.63, 329.63]; // C3 arp
    let step = 0;
    const playNote = () => {
      if (!this._lofiPlaying) return;
      const freq = freqs[step % freqs.length];
      this.tone({ type: 'sawtooth', freq, duration: 0.45, gain: 0.08, attack: 0.02, release: 0.35, detune: -40 });
      step++;
      setTimeout(playNote, 480); // ~125 BPM quarter notes
    };
    playNote();
    this.startRain(0.04); // light rain under lo-fi
  }

  private stopLofi(): void {
    this._lofiPlaying = false;
    this.stopRain();
  }

  // ─── Internal ──────────────────────────────────────────────────────────────
  private tone(p: ToneParams): void {
    if (!this.ctx) return;
    const ctx     = this.ctx;
    const now     = ctx.currentTime;
    const type    = p.type    ?? 'sine';
    const freq    = p.freq    ?? 440;
    const dur     = p.duration ?? 0.1;
    const gain    = p.gain    ?? 0.2;
    const attack  = p.attack  ?? 0.01;
    const release = p.release ?? 0.05;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (p.detune) osc.detune.value = p.detune;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + attack);
    g.gain.setValueAtTime(gain, now + dur - release);
    g.gain.linearRampToValueAtTime(0, now + dur);

    osc.connect(g).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }
}
