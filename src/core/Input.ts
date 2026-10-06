// ─────────────────────────────────────────────────────────────────────────────
//  Input.ts  –  Unified input handler
//
//  Consolidates keyboard, mouse, touch, pointer-lock, and device orientation
//  (gyro) into a single reactive source of truth.
//  Scenes subscribe to events via addEventListener-style callbacks.
//
//  Key features:
//  • `mouse` — normalised NDC position (-1..1) updated every pointermove
//  • `mouseParallax` — same but smoothed (lerp) for subtle camera nudge
//  • `gyro` — device orientation, normalised, for mobile parallax
//  • `reducedMotion` — reactive flag matching prefers-reduced-motion
//  • Konami code detection → fires 'konami' event
// ─────────────────────────────────────────────────────────────────────────────

type InputEventMap = {
  konami:    () => void;
  moonclick: () => void;
};

const KONAMI = [
  'ArrowUp','ArrowUp','ArrowDown','ArrowDown',
  'ArrowLeft','ArrowRight','ArrowLeft','ArrowRight',
  'b','a',
];

export class InputManager {
  // ── Public state ────────────────────────────────────────────────────────
  readonly mouse        = { x: 0, y: 0 };       // raw NDC, updated each event
  readonly mouseParallax = { x: 0, y: 0 };      // smoothed
  readonly gyro         = { x: 0, y: 0 };       // device orientation
  readonly keys         = new Set<string>();      // currently held keys
  readonly touches      = new Map<number, { x: number; y: number }>(); // active touches

  reducedMotion: boolean;

  // ── Private ────────────────────────────────────────────────────────────
  private listeners: Partial<Record<keyof InputEventMap, Set<() => void>>> = {};
  private konamiBuffer: string[] = [];
  private _reducedMotionMq: MediaQueryList;

  constructor() {
    this._reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion    = this._reducedMotionMq.matches;

    this.attach();
  }

  // ── Smoothing (call every frame) ───────────────────────────────────────
  update(lerpFactor = 0.08): void {
    this.mouseParallax.x += (this.mouse.x - this.mouseParallax.x) * lerpFactor;
    this.mouseParallax.y += (this.mouse.y - this.mouseParallax.y) * lerpFactor;
  }

  // ── Event subscription ─────────────────────────────────────────────────
  on(event: keyof InputEventMap, cb: () => void): void {
    if (!this.listeners[event]) this.listeners[event] = new Set();
    this.listeners[event]!.add(cb);
  }

  off(event: keyof InputEventMap, cb: () => void): void {
    this.listeners[event]?.delete(cb);
  }

  private emit(event: keyof InputEventMap): void {
    this.listeners[event]?.forEach((cb) => cb());
  }

  // ── Attach / detach DOM listeners ─────────────────────────────────────
  private attach(): void {
    window.addEventListener('pointermove',    this.onPointerMove,    { passive: true });
    window.addEventListener('keydown',        this.onKeyDown);
    window.addEventListener('keyup',          this.onKeyUp);
    window.addEventListener('touchstart',     this.onTouchStart,     { passive: true });
    window.addEventListener('touchmove',      this.onTouchMove,      { passive: true });
    window.addEventListener('touchend',       this.onTouchEnd,       { passive: true });
    window.addEventListener('deviceorientation', this.onOrientation,  { passive: true });

    this._reducedMotionMq.addEventListener('change', this.onMotionPrefChange);
  }

  dispose(): void {
    window.removeEventListener('pointermove',      this.onPointerMove);
    window.removeEventListener('keydown',          this.onKeyDown);
    window.removeEventListener('keyup',            this.onKeyUp);
    window.removeEventListener('touchstart',       this.onTouchStart);
    window.removeEventListener('touchmove',        this.onTouchMove);
    window.removeEventListener('touchend',         this.onTouchEnd);
    window.removeEventListener('deviceorientation', this.onOrientation);
    this._reducedMotionMq.removeEventListener('change', this.onMotionPrefChange);
  }

  // ── Handlers ──────────────────────────────────────────────────────────
  private onPointerMove = (e: PointerEvent): void => {
    this.mouse.x = (e.clientX / window.innerWidth)  * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.key);
    this.checkKonami(e.key);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key);
  };

  private onTouchStart = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      this.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      this.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      // Use first touch for parallax
      if (t.identifier === 0) {
        this.mouse.x = (t.clientX / window.innerWidth)  * 2 - 1;
        this.mouse.y = -(t.clientY / window.innerHeight) * 2 + 1;
      }
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      this.touches.delete(t.identifier);
    }
  };

  private onOrientation = (e: DeviceOrientationEvent): void => {
    // gamma = left-right tilt (-90..90), beta = front-back (-180..180)
    if (e.gamma !== null && e.beta !== null) {
      this.gyro.x = Math.max(-1, Math.min(1, e.gamma / 30));
      this.gyro.y = Math.max(-1, Math.min(1, (e.beta - 30) / 30));
    }
  };

  private onMotionPrefChange = (e: MediaQueryListEvent): void => {
    this.reducedMotion = e.matches;
  };

  private checkKonami(key: string): void {
    this.konamiBuffer.push(key);
    if (this.konamiBuffer.length > KONAMI.length) {
      this.konamiBuffer.shift();
    }
    if (this.konamiBuffer.join(',') === KONAMI.join(',')) {
      this.konamiBuffer = [];
      this.emit('konami');
    }
  }

  /** Whether a specific key is currently held */
  isKeyHeld(key: string): boolean { return this.keys.has(key); }
}
