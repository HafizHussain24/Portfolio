// ─────────────────────────────────────────────────────────────────────────────
//  BootScene.ts  –  Full Phase 2 implementation
//
//  Sequence:
//   1. Black screen → pulsing PRESS START (unlocks audio on click)
//   2. Dark blue void snaps in; towers drift in from below
//   3. Particles rise; ambient chime swell plays
//   4. "[NAME] INTERACTIVE" wordmark fades in (typewriter)
//   5. Fake "LOADING" progress bar (tied to real asset loading)
//   6. Fade → Rooftop
//
//  Skip: Esc, Enter, or the visible SKIP button skips to step 4→5→rooftop.
//  sessionStorage: subsequent visits within the same session go straight
//  to the rooftop with a brief 1-second boot flash.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import gsap       from 'gsap';
import { BaseScene }    from './BaseScene';
import type { SceneDeps } from '../core/SceneManager';
import { IDENTITY, WORLD } from '../content';

const SESSION_KEY = 'casefile_booted';

// ─── Tower data ───────────────────────────────────────────────────────────────
interface TowerDef {
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  speed: number; drift: number;
}

export class BootScene extends BaseScene {
  // DOM
  private overlay!: HTMLElement;
  private pressStartEl!: HTMLElement;
  private skipBtn!: HTMLButtonElement;

  // 3D objects
  private towers: THREE.Mesh[]    = [];
  private particleSys!: THREE.Points;
  private particlePositions!: Float32Array;
  private particleVelocities!: Float32Array;
  private particleCount           = 220;

  // State
  private phase: 'start' | 'sequence' | 'done' = 'start';
  private _skipped = false;
  private _started = false;
  private accentColor: THREE.Color;

  constructor() {
    super();
    this.accentColor = new THREE.Color(WORLD.accentColorHex);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async init(deps: SceneDeps): Promise<void> {
    await super.init(deps);

    this.scene.background = new THREE.Color(0x000005);
    
    // PS2-style starting camera: High up, directly above the center, pointing straight down
    this.camera.position.set(0, 50, 0);
    this.camera.rotation.set(-Math.PI / 2, 0, 0); // Point straight down into the void
    
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();

    // Remove default fog for boot (clean void feel)
    this.scene.fog = null;

    this.buildLights();
    this.buildTowers();
    this.buildParticles();
    this.buildDOM();
  }

  // ── Enter ─────────────────────────────────────────────────────────────────
  async enter(): Promise<void> {
    this.overlay.style.display = 'flex';
    this.phase = 'start';
    this._skipped = false;
    this._started = false;

    // Hide 3D objects initially — they appear after PRESS START
    this.towers.forEach((t) => { t.visible = false; });
    this.particleSys.visible = false;

    // Reset positions
    this.resetTowers();

    // Show press-start
    this.pressStartEl.style.opacity   = '1';
    this.pressStartEl.style.display   = 'flex';
    this.skipBtn.style.display        = 'none';

    // Pulse animation for press-start
    gsap.fromTo(
      this.pressStartEl.querySelector('.boot-press-text'),
      { opacity: 0.15 },
      { opacity: 1, duration: 1.1, repeat: -1, yoyo: true, ease: 'sine.inOut' }
    );
  }

  // ── Exit ──────────────────────────────────────────────────────────────────
  async exit(): Promise<void> {
    gsap.killTweensOf(this.pressStartEl.querySelector('.boot-press-text'));
    this.overlay.style.display = 'none';
    window.removeEventListener('keydown', this.onKey);
  }

  // ── Update (frame) ────────────────────────────────────────────────────────
  update(dt: number, time: number): void {
    if (this.phase === 'start') return;

    // Drift towers
    this.towers.forEach((t, i) => {
      const def = TOWER_DEFS[i];
      t.position.x += Math.sin(time * def.drift + i)        * 0.002;
      t.position.y += def.speed * dt;
      t.rotation.y  = Math.sin(time * 0.15 + i * 0.8)      * 0.04;
      // Wrap: when a tower floats too high, reset to bottom
      if (t.position.y > 14) {
        t.position.y = -18 + Math.random() * 4;
      }
    });

    // Rise particles
    for (let i = 0; i < this.particleCount; i++) {
      this.particlePositions[i * 3 + 1] += this.particleVelocities[i] * dt;
      // Slight drift
      this.particlePositions[i * 3]     += Math.sin(time * 0.4 + i) * 0.002;
      this.particlePositions[i * 3 + 2] += Math.cos(time * 0.4 + i) * 0.002;
      // Wrap particles (box from y=-30 to y=60)
      if (this.particlePositions[i * 3 + 1] > 60) {
        this.particlePositions[i * 3 + 1] = -30 - Math.random() * 10;
        this.particlePositions[i * 3]     = (Math.random() - 0.5) * 40;
        this.particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
      }
    }
    (this.particleSys.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // Subtle camera drift (add to the base position which may be animating)
    this.camera.position.x = Math.sin(time * 0.07) * 0.6;
    // Note: We don't overwrite y here anymore since GSAP is animating it during swoop.
    // Instead we can just leave y to GSAP, or add drift to a base variable.
    // For now, removing the y drift keeps it smooth during the swoop.
  }

  // ── Dispose ───────────────────────────────────────────────────────────────
  dispose(): void {
    this.overlay.remove();
    window.removeEventListener('keydown', this.onKey);
    super.dispose();
  }

  // ─── Private: Build scene ─────────────────────────────────────────────────
  private buildLights(): void {
    const ambient = new THREE.AmbientLight(0x0a1035, 1.0);
    this.scene.add(ambient);

    const point = new THREE.PointLight(WORLD.accentColorHex, 1.5, 40);
    point.position.set(0, 4, 8);
    this.scene.add(point);

    const rim = new THREE.PointLight(0x1a2860, 2.0, 60);
    rim.position.set(-10, 10, -5);
    this.scene.add(rim);
  }

  private buildTowers(): void {
    TOWER_DEFS.forEach((def) => {
      const geo = new THREE.BoxGeometry(def.w, def.h, def.d);
      // Emissive glass-like tower
      const mat = new THREE.MeshPhongMaterial({
        color:           new THREE.Color(0x050a30),
        emissive:        new THREE.Color(WORLD.accentColorHex),
        emissiveIntensity: 0.08,
        transparent:     true,
        opacity:         0.45,
        flatShading:     true,
        shininess:       0,
        side:            THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(def.x, def.y, def.z);
      mesh.visible = false;
      this.scene.add(mesh);
      this.towers.push(mesh);
      this.track(geo);
      this.track(mat);
    });
  }

  private buildParticles(): void {
    const geo = new THREE.BufferGeometry();
    this.particlePositions  = new Float32Array(this.particleCount * 3);
    this.particleVelocities = new Float32Array(this.particleCount);

    for (let i = 0; i < this.particleCount; i++) {
      this.particlePositions[i * 3]     = (Math.random() - 0.5) * 40;
      this.particlePositions[i * 3 + 1] = -30 + Math.random() * 90; // Spread heavily on Y axis
      this.particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
      this.particleVelocities[i]        = 0.4 + Math.random() * 1.0;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));

    const mat = new THREE.PointsMaterial({
      color:       WORLD.accentColorHex,
      size:        0.12,
      transparent: true,
      opacity:     0.6,
      sizeAttenuation: true,
    });

    this.particleSys = new THREE.Points(geo, mat);
    this.particleSys.visible = false;
    this.scene.add(this.particleSys);
    this.track(geo);
    this.track(mat);
  }

  private resetTowers(): void {
    TOWER_DEFS.forEach((def, i) => {
      this.towers[i].position.set(def.x, -20 + Math.random() * 5, def.z);
    });
  }

  // ─── Private: Build DOM ───────────────────────────────────────────────────
  private buildDOM(): void {
    this.overlay = document.createElement('div');
    this.overlay.id = 'boot-overlay';
    this.overlay.innerHTML = /* html */ `
      <!-- Press Start screen -->
      <div class="boot-press-screen" id="boot-press-screen">
        <p class="boot-press-text" id="boot-press-text" aria-label="Press any key or tap to start">
          ▶ PRESS START
        </p>
      </div>

      <!-- Skip button -->
      <button class="boot-skip-btn" id="boot-skip-btn" aria-label="Skip boot sequence">
        SKIP [ESC]
      </button>
    `;

    document.body.appendChild(this.overlay);

    this.pressStartEl    = this.overlay.querySelector('#boot-press-screen')!;
    this.skipBtn         = this.overlay.querySelector('#boot-skip-btn') as HTMLButtonElement;

    // Click / tap anywhere → start
    this.overlay.addEventListener('click', () => {
      if (this.phase === 'start' && !this._started) this.startSequence();
    });

    this.skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.skip();
    });

    window.addEventListener('keydown', this.onKey);
  }

  // ─── Private: Sequence ────────────────────────────────────────────────────
  private onKey = (e: KeyboardEvent): void => {
    if (this.phase === 'start' && !this._started) {
      if (e.key === 'Enter' || e.key === ' ') this.startSequence();
    }
    if (e.key === 'Escape') this.skip();
  };

  private async startSequence(): Promise<void> {
    if (this._started) return;
    this._started = true;
    this.phase = 'sequence';

    // Unlock audio
    this.deps.audio.unlock();

    // Hide press start
    await gsap.to(this.pressStartEl, { opacity: 0, duration: 0.4 }).then();
    this.pressStartEl.style.display = 'none';

    // Reveal skip button
    this.skipBtn.style.display = 'block';
    gsap.fromTo(this.skipBtn, { opacity: 0 }, { opacity: 1, duration: 0.6 });

    // Background → deep blue void
    gsap.to({ c: 0 }, {
      c: 1, duration: 1.2,
      onUpdate: function(this: gsap.core.Tween) {
        // No-op; handled by scene.background lerp in update — we'll do it inline
      }
    });
    await this.animateBg(0x000005, 0x020818, 1200);

    // Towers fly in
    this.towers.forEach((t) => { t.visible = true; });
    this.towers.forEach((t, i) => {
      gsap.from(t.position, {
        y: -22,
        duration: 2.2 + Math.random() * 1.0,
        delay:    i * 0.07,
        ease:     'power2.out',
      });
      gsap.from(t.material as THREE.Material, {
        opacity: 0,
        duration: 1.5,
        delay: i * 0.07,
        ease: 'power1.out',
      } as gsap.TweenVars);
    });

    // PS2-style camera swoop (fly straight down through the void)
    gsap.to(this.camera.position, {
      y: -15, // Move deep into the center of the towers
      duration: 3.5,
      ease: 'power2.inOut'
    });

    // Particles
    this.particleSys.visible = true;
    gsap.from(this.particleSys.material as THREE.Material, {
      opacity: 0,
      duration: 2.0,
      ease: 'power1.out',
    } as gsap.TweenVars);

    // Boot chime
    this.deps.audio.playBootChime();

    // Wait for the swoop animation (3.5s) to finish
    await this.wait(3500);
    
    if (this._skipped) return;

    // Fade out everything → navigate
    await this.finishBoot();
  }



  private async finishBoot(): Promise<void> {
    this.phase = 'done';
    sessionStorage.setItem(SESSION_KEY, '1');

    await gsap.to(this.overlay, { opacity: 0, duration: 0.8 }).then();
    this.overlay.style.display = 'none';

    this.deps.navigate('rooftop');
  }

  private async skip(): Promise<void> {
    if (this._skipped || this.phase === 'done') return;
    this._skipped = true;
    this.deps.audio.unlock();

    gsap.killTweensOf(this.overlay.querySelector('.boot-press-text'));
    await gsap.to(this.overlay, { opacity: 0, duration: 0.4 }).then();
    this.overlay.style.display = 'none';

    this.phase = 'done';
    sessionStorage.setItem(SESSION_KEY, '1');
    this.deps.navigate('rooftop');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  private animateBg(from: number, to: number, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const start   = new THREE.Color(from);
      const end     = new THREE.Color(to);
      const current = start.clone();
      const t0      = performance.now();
      const tick    = () => {
        const elapsed = performance.now() - t0;
        const p       = Math.min(elapsed / ms, 1);
        current.lerpColors(start, end, p);
        this.scene.background = current;
        if (p < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }



  private wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

// ─── Tower definitions (Concentric rings) ───────────────────────────────
const TOWER_DEFS: TowerDef[] = (() => {
  const defs: TowerDef[] = [];
  const rings = [
    { radius: 6, count: 6, w: 2.0, h: 40, speed: 0.12 },
    { radius: 12, count: 12, w: 2.5, h: 60, speed: 0.08 },
    { radius: 20, count: 18, w: 3.5, h: 80, speed: 0.05 },
  ];
  rings.forEach((ring, rIdx) => {
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * Math.PI * 2 + (rIdx * 0.3); // Stagger rotation between rings
      defs.push({
        x: Math.cos(angle) * ring.radius,
        y: 0,
        z: Math.sin(angle) * ring.radius,
        w: ring.w,
        h: ring.h + (Math.random() - 0.5) * 30, // Random height variation
        d: ring.w,
        speed: ring.speed + Math.random() * 0.05,
        drift: Math.random() * 0.5 + 0.2
      });
    }
  });
  return defs;
})();
