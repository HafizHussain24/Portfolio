// ─────────────────────────────────────────────────────────────────────────────
//  StreetScene.ts  –  Chapter 3 — "THE SIGNAL"  (Full polished version v4)
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import gsap from 'gsap';
import { BaseScene } from './BaseScene';
import type { SceneDeps } from '../core/SceneManager';
import { RetroRenderer } from '../core/RetroRenderer';
import { CONTACT, WORLD } from '../content';
import { DataMaze } from '../games/DataMaze';

const rng = (min: number, max: number) => min + Math.random() * (max - min);

// ─── Camera presets ───────────────────────────────────────────────────────────
// 3/4 view: camera sits to the right and slightly back, looking left across the alley
// Left wall (X=-4) has graffiti & payphone, character stands to the right of the payphone
const CAM_START = { pos: new THREE.Vector3(6.0, 5.0, 12.0), lookAt: new THREE.Vector3(-2.0, 2.5, 0.0) };
const CAM_IDLE = { pos: new THREE.Vector3(3.5, 2.8, 8.0), lookAt: new THREE.Vector3(-2.5, 2.5, -1.0) };
const CAM_FORM = { pos: new THREE.Vector3(-0.5, 3.0, 2.5), lookAt: new THREE.Vector3(-4.0, 2.5, -2.0) };
// Arcade: machine at (-3.6,0,-7.5), 1.5x scaled, screen centre y≈2.025. Camera on +X side.
const CAM_ARCADE = { pos: new THREE.Vector3(-1.2, 2.1, -7.5), lookAt: new THREE.Vector3(-3.8, 2.1, -7.5) };

interface Hotspot {
  mesh: THREE.Mesh;
  el: HTMLElement;
  type: 'link' | 'copy' | 'payphone';
  url: string;
  w: number; h: number;
  originalOpacity: number;
}

export class StreetScene extends BaseScene {
  private alleyGroup = new THREE.Group();
  private neonGroup = new THREE.Group();
  private grafGroup = new THREE.Group();
  private charGroup = new THREE.Group();

  private mainTagMesh!: THREE.Mesh;
  private capeGeo!: THREE.BufferGeometry;
  private capeOrigPos!: Float32Array;

  private neonLights: THREE.PointLight[] = [];
  private flickerTimers: number[] = [];
  private flickerNexts: number[] = [];

  // Rain – hoisted dummies
  private rainMesh!: THREE.InstancedMesh;
  private rainPos!: Float32Array;
  private rippleMesh!: THREE.InstancedMesh;
  private rippleData: { t: number; x: number; z: number; active: boolean }[] = [];
  private readonly _rainDummy = new THREE.Object3D();
  private readonly _riplDummy = new THREE.Object3D();
  private readonly _hsVec3 = new THREE.Vector3();

  private formOpen = false;
  private isSubmitting = false;
  private formOverlayEl!: HTMLDivElement;
  private escOverlayEl!: HTMLDivElement;
  private formEl!: HTMLFormElement;
  private statusEl!: HTMLDivElement;
  private _escHandler!: (e: KeyboardEvent) => void;
  private _focusTrapHandler!: (e: KeyboardEvent) => void;

  private overlayEl!: HTMLDivElement;
  private hotspots: Hotspot[] = [];

  // ── Arcade machine ────────────────────────────────────────────────────────
  private arcadeScreenMesh!: THREE.Mesh;
  private arcadeHitMesh!: THREE.Mesh;
  private arcadeCanvas!: HTMLCanvasElement;
  private arcadeTex!: THREE.CanvasTexture;
  private dataMaze!: DataMaze;
  private arcadeOpen = false;
  private arcadeEscHandler!: (e: KeyboardEvent) => void;
  private arcadeRaycaster = new THREE.Raycaster();
  private arcadeClickHandler!: (e: MouseEvent) => void;
  private arcadeHoverHandler!: (e: MouseEvent) => void;
  private marqueeLight!: THREE.PointLight;
  private marqueeFlickerTimer = 0;
  private arcadeScreenGlow!: THREE.PointLight;
  private arcadeGlowMat!: THREE.MeshBasicMaterial;
  private arcadeGlowTween: any = null;

  // ══════════════════════════════════════════════════════════════════════════
  async init(deps: SceneDeps): Promise<void> {
    await super.init(deps);

    // Lighter fog so scene is visible
    this.scene.background = new THREE.Color(0x0a0c1a);
    this.scene.fog = new THREE.FogExp2(0x0a0c1a, 0.025); // Much less fog

    this.scene.add(this.alleyGroup, this.neonGroup, this.grafGroup, this.charGroup);

    this.camera.position.copy(CAM_START.pos);
    this.camera.lookAt(CAM_START.lookAt);
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();

    this.buildLights();
    this.buildArchitecture();
    this.buildSetDressing();
    this.buildGraffiti();
    this.buildPayphone();
    this.buildCharacter();
    this.buildArcadeMachine();
    this.buildHotspotsDOM();
    this.buildFormDOM();
    this.buildReflections();
    this.buildRain();
  }

  async enter(): Promise<void> {
    this.deps.renderer.setCRTStrength(0.3, 0.55);
    this.deps.audio.startRain(0.15);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      this.overlayEl.style.display = 'block';
      this.overlayEl.style.opacity = '1';
      this.camera.position.copy(CAM_IDLE.pos);
      this.camera.lookAt(CAM_IDLE.lookAt);
      this._showAllGraffiti();
      return;
    }

    gsap.to(this.camera.position, {
      x: CAM_IDLE.pos.x, y: CAM_IDLE.pos.y, z: CAM_IDLE.pos.z,
      duration: 3.5, ease: 'power2.out',
      onUpdate: () => this.camera.lookAt(CAM_IDLE.lookAt),
    });

    this._hideAllGraffiti();

    const tl = gsap.timeline({
      delay: 1.2,
      onComplete: () => {
        this.overlayEl.style.display = 'block';
        gsap.to(this.overlayEl, { opacity: 1, duration: 0.5 });
      },
    });
    tl.call(() => this.deps.audio.playSpray(1.5));
    tl.to((this.mainTagMesh.material as THREE.MeshBasicMaterial), { opacity: 1, duration: 1.5, ease: 'power1.inOut' });
    this.hotspots.filter(h => h.type !== 'payphone').forEach(hs => {
      tl.call(() => this.deps.audio.playSpray(0.5), undefined, '+=0.25');
      tl.to((hs.mesh.material as THREE.MeshBasicMaterial), { opacity: hs.originalOpacity, duration: 0.5 }, '<');
    });
  }

  async exit(): Promise<void> {
    this.deps.renderer.setCRTStrength(0.8, 0.7);
    this.deps.audio.stopRain();
    this.overlayEl.style.display = 'none';
    this.overlayEl.style.opacity = '0';
    if (this.formOpen) this.closeForm(false);
    if (this.arcadeOpen) this.closeArcade();
    gsap.killTweensOf(this.camera.position);
  }

  update(dt: number, time: number): void {
    this.deps.input.update(0.05);
    this.updateFlicker(dt);
    if (!this.formOpen && !this.arcadeOpen) this.updateCameraSway();
    this.updateCharacter(time);
    this.updateRain(dt);
    this.updateHotspotsScreen();
    if (this.arcadeOpen && this.arcadeTex) this.arcadeTex.needsUpdate = true;
  }

  dispose(): void {
    this.overlayEl?.remove();
    this.formOverlayEl?.remove();
    this.escOverlayEl?.remove();
    if (this._escHandler) window.removeEventListener('keydown', this._escHandler);
    if (this._focusTrapHandler) window.removeEventListener('keydown', this._focusTrapHandler);
    if (this.arcadeEscHandler) window.removeEventListener('keydown', this.arcadeEscHandler);
    const _cnv = document.getElementById('canvas') as HTMLCanvasElement;
    if (this.arcadeClickHandler) _cnv?.removeEventListener('click', this.arcadeClickHandler);
    if (this.arcadeHoverHandler) _cnv?.removeEventListener('mousemove', this.arcadeHoverHandler);
    gsap.killTweensOf(this.camera.position);
    super.dispose();
  }

  private _hideAllGraffiti(): void {
    (this.mainTagMesh.material as THREE.MeshBasicMaterial).opacity = 0;
    this.hotspots.filter(h => h.type !== 'payphone').forEach(h => {
      (h.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
    });
  }
  private _showAllGraffiti(): void {
    (this.mainTagMesh.material as THREE.MeshBasicMaterial).opacity = 1;
    this.hotspots.filter(h => h.type !== 'payphone').forEach(h => {
      (h.mesh.material as THREE.MeshBasicMaterial).opacity = h.originalOpacity;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Brick Texture  — richer colors so it reads at the lower brightness
  // ══════════════════════════════════════════════════════════════════════════
  private createBrickTexture(tint = 1.0): THREE.CanvasTexture {
    const W = 512, H = 512;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Mortar (slightly lighter now)
    ctx.fillStyle = '#2a2232'; ctx.fillRect(0, 0, W, H);

    const rows = 14, cols = 7;
    const bH = H / rows, bW = W / cols, gap = 3;

    for (let r = 0; r < rows; r++) {
      const off = (r % 2 === 0) ? 0 : bW / 2;
      for (let c = -1; c < cols + 1; c++) {
        const bx = c * bW + off, by = r * bH;
        const s = rng(0.7, 1.0) * tint;
        // Warmer brick tone — visible in dark scenes
        const R = Math.floor(80 * s), G = Math.floor(45 * s), B = Math.floor(55 * s);
        ctx.fillStyle = `rgb(${R},${G},${B})`;
        ctx.fillRect(bx + gap, by + gap, bW - gap * 2, bH - gap * 2);
        // Highlight top
        ctx.fillStyle = `rgba(255,200,200,0.06)`;
        ctx.fillRect(bx + gap, by + gap, bW - gap * 2, 2);
        // Shadow bottom
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(bx + gap, by + bH - gap - 2, bW - gap * 2, 2);
      }
    }
    // Slight grime gradient
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Lighting  — much brighter overall
  // ══════════════════════════════════════════════════════════════════════════
  private buildLights(): void {
    // Strong ambient so nothing is pure black
    this.scene.add(new THREE.AmbientLight(0xaaccff, 4.5));

    // Moon fill from above-right
    const moon = new THREE.DirectionalLight(0x99bbee, 3.5);
    moon.position.set(8, 14, 8);
    this.scene.add(moon);

    // Strong overhead white light on graffiti wall section
    const wallLight = new THREE.PointLight(0xffffff, 25.0, 18);
    wallLight.position.set(-1, 7, 2);
    this.scene.add(wallLight);

    // Spotlight from lamp-post angle on graffiti
    const lamp = new THREE.SpotLight(0xffe8aa, 12.0);
    lamp.position.set(2, 8, 5);
    lamp.target.position.set(-4, 2, -1);
    lamp.angle = 0.7; lamp.penumbra = 0.6;
    lamp.decay = 1.5; lamp.distance = 22;
    this.scene.add(lamp, lamp.target);

    // Light for dumpster/set dressing on right
    const rightLight = new THREE.PointLight(0xffffff, 6.0, 12);
    rightLight.position.set(4, 5, 1);
    this.scene.add(rightLight);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Architecture
  // ══════════════════════════════════════════════════════════════════════════
  private buildArchitecture(): void {
    const G = <T extends THREE.BufferGeometry>(g: T) => { this.track(g); return g; };
    const M = <T extends THREE.Material>(m: T) => { this.track(m); return m; };

    // Ground – slightly lighter asphalt
    const groundMat = M(new THREE.MeshLambertMaterial({ color: 0x181a22 }));
    const ground = new THREE.Mesh(G(new THREE.PlaneGeometry(18, 45)), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(1, 0, -5);
    this.alleyGroup.add(ground);

    const brickTexL = this.createBrickTexture(1.0); this.track(brickTexL); brickTexL.repeat.set(12, 6);
    const brickTexR = this.createBrickTexture(0.85); this.track(brickTexR); brickTexR.repeat.set(12, 6);

    // Left wall (graffiti wall) – normal brightness
    const leftWall = new THREE.Mesh(
      G(new THREE.PlaneGeometry(45, 22)),
      M(new THREE.MeshLambertMaterial({ map: brickTexL }))
    );
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-4, 11, -7);
    this.alleyGroup.add(leftWall);

    // Right wall – slightly cooler tint
    const rightWall = new THREE.Mesh(
      G(new THREE.PlaneGeometry(45, 22)),
      M(new THREE.MeshLambertMaterial({ map: brickTexR, color: 0xaabbcc }))
    );
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(6, 11, -7);
    this.alleyGroup.add(rightWall);

    // Far end – foggy glow, not a void
    const endWall = new THREE.Mesh(
      G(new THREE.PlaneGeometry(12, 22)),
      M(new THREE.MeshBasicMaterial({ color: 0x22244a }))
    );
    endWall.position.set(1, 11, -22);
    this.alleyGroup.add(endWall);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Set Dressing  — brighter material colors so they read in the scene
  // ══════════════════════════════════════════════════════════════════════════
  private buildSetDressing(): void {
    const G = <T extends THREE.BufferGeometry>(g: T) => { this.track(g); return g; };
    const M = <T extends THREE.Material>(m: T) => { this.track(m); return m; };
    const add = (o: THREE.Object3D) => this.alleyGroup.add(o);

    const metalMat = M(new THREE.MeshLambertMaterial({ color: 0x444450 }));
    const darkMetalMat = M(new THREE.MeshLambertMaterial({ color: 0x2a2a38 }));

    // ─ Foreground framing cable near camera ─
    const cable = new THREE.Mesh(G(new THREE.CylinderGeometry(0.07, 0.07, 18)), darkMetalMat);
    cable.rotation.set(0.4, 0, -0.1); cable.position.set(4.5, 6, 12);
    add(cable);

    // ─ Dumpster on the right (brighter green so it's visible) ─
    const dG = new THREE.Group(); dG.position.set(4.8, 0.75, 0.5);
    const dumpBody = new THREE.Mesh(G(new THREE.BoxGeometry(1.8, 1.5, 1.2)),
      M(new THREE.MeshLambertMaterial({ color: 0x2d4a2d })));   // lifted green
    dG.add(dumpBody);
    const dumpLid = new THREE.Mesh(G(new THREE.BoxGeometry(1.9, 0.1, 1.3)), darkMetalMat);
    dumpLid.position.set(0, 0.82, 0); dumpLid.rotation.z = 0.2; dG.add(dumpLid);
    add(dG);

    // ─ Wooden Crates – warmer color ─
    const crateMat = M(new THREE.MeshLambertMaterial({ color: 0x5a4520 })); // warm wood
    [{ x: 3.2, z: 2.5, s: 0.55 }, { x: 3.6, z: 3.2, s: 0.42 }].forEach(({ x, z, s }) => {
      const c = new THREE.Mesh(G(new THREE.BoxGeometry(s, s, s)), crateMat);
      c.position.set(x, s / 2, z); add(c);
    });

    // ─ Drainpipe on left wall ─
    const pipe = new THREE.Mesh(G(new THREE.CylinderGeometry(0.055, 0.055, 22)), metalMat);
    pipe.position.set(-3.9, 11, 4.5); add(pipe);

    // ─ Fire Escape on right wall ─
    for (let i = 0; i < 3; i++) {
      const y = 2.8 + i * 3.5;
      const plat = new THREE.Mesh(G(new THREE.BoxGeometry(1.2, 0.1, 3.0)), metalMat);
      plat.position.set(5.5, y, -5); add(plat);
      const rail = new THREE.Mesh(G(new THREE.BoxGeometry(0.05, 0.9, 3.0)), darkMetalMat);
      rail.position.set(4.9, y + 0.45, -5); add(rail);
      if (i > 0) {
        const lad = new THREE.Mesh(G(new THREE.BoxGeometry(0.55, 3.6, 0.05)), darkMetalMat);
        lad.position.set(5.1, y - 1.8, -3.7); add(lad);
      }
    }

    // ─ Sagging cables across alley ─
    for (let i = 0; i < 3; i++) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-4, 9 + i * 0.4, rng(-6, 1)),
        new THREE.Vector3(1, 7.2 + i * 0.4, rng(-6, 1)),
        new THREE.Vector3(6, 9 + i * 0.4, rng(-6, 1))
      );
      add(new THREE.Mesh(this.track(new THREE.TubeGeometry(curve, 12, 0.025, 4)), darkMetalMat));
    }

    // ─ Neon signs on right wall ─
    const addNeon = (z: number, y: number, col: number, label: string) => {
      const box = new THREE.Mesh(G(new THREE.BoxGeometry(0.8, 1.2, 0.1)), darkMetalMat);
      box.position.set(5.92, y, z); box.rotation.y = -Math.PI / 2; add(box);
      const face = new THREE.Mesh(G(new THREE.PlaneGeometry(0.6, 1.0)),
        M(new THREE.MeshBasicMaterial({ color: col })));
      face.position.set(5.84, y, z); face.rotation.y = -Math.PI / 2; this.neonGroup.add(face);
      const light = new THREE.PointLight(col, 7.0, 12);
      light.position.set(4.8, y, z); this.neonGroup.add(light);
      this.neonLights.push(light); this.flickerTimers.push(0); this.flickerNexts.push(rng(1, 5));
    };
    addNeon(-2.5, 5.0, 0xff0055, 'HOTEL');
    addNeon(1.5, 6.5, 0x00e5ff, 'BAR');
    addNeon(-7.0, 4.5, 0xffaa00, 'OPEN');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Graffiti  — real letters, NO random swirl background layer
  // ══════════════════════════════════════════════════════════════════════════
  private buildGraffiti(): void {
    const G = <T extends THREE.BufferGeometry>(g: T) => { this.track(g); return g; };
    const M = <T extends THREE.Material>(m: T) => { this.track(m); return m; };

    // Graffiti group sits just in front of left wall, rotated to face +X direction
    this.grafGroup.position.set(-3.93, 0, 0);
    this.grafGroup.rotation.y = Math.PI / 2;

    // Utility: draw a graffiti-style tag to a canvas
    const drawGrafTag = (text: string, fillColor: string, outColor: string, fontSize: number, W: number, H: number): HTMLCanvasElement => {
      const cvs = document.createElement('canvas');
      cvs.width = W; cvs.height = H;
      const ctx = cvs.getContext('2d')!;

      // Overspray halo behind text
      const cx = W / 2, cy = H / 2;
      const halo = ctx.createRadialGradient(cx, cy + 20, 10, cx, cy, H * 0.58);
      halo.addColorStop(0, fillColor + 'aa');
      halo.addColorStop(1, fillColor + '00');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.ellipse(cx, cy + 10, W * 0.48, H * 0.55, 0, 0, Math.PI * 2); ctx.fill();

      ctx.font = `900 ${fontSize}px "Arial Black", "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Thick dark outline/shadow
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 6; ctx.shadowOffsetY = 6;
      ctx.strokeStyle = outColor;
      ctx.lineWidth = fontSize * 0.22;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, cx, cy);

      // Main fill
      ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = fillColor;
      ctx.fillText(text, cx, cy);

      // Highlight stroke (top-left)
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.strokeText(text, cx - 2, cy - 2);

      // Drips from the bottom of the text
      const m = ctx.measureText(text);
      const baseline = cy + fontSize * 0.42;
      const left = cx - m.width * 0.45;
      for (let d = 0; d < 8; d++) {
        const dx = left + rng(0, m.width * 0.9);
        const dLen = rng(20, 90);
        const dW = rng(3, 9);
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.rect(dx, baseline, dW, dLen);
        ctx.arc(dx + dW / 2, baseline + dLen, dW / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      return cvs;
    };

    // ── Main "SAY HI" piece ───────────────────────────────────────────────
    const mainCvs = drawGrafTag('SAY HI', '#00e5ff', '#003355', 200, 1024, 440);
    const mainTex = this.track(new THREE.CanvasTexture(mainCvs));
    mainTex.minFilter = mainTex.magFilter = THREE.NearestFilter;
    this.mainTagMesh = new THREE.Mesh(
      G(new THREE.PlaneGeometry(7.5, 3.2)),
      M(new THREE.MeshBasicMaterial({ map: mainTex, transparent: true, depthWrite: false }))
    );
    this.mainTagMesh.position.set(-0.2, 5.8, 0.03);
    this.grafGroup.add(this.mainTagMesh);

    // ── Contact link tags ─────────────────────────────────────────────────
    const addContactTag = (
      text: string, fill: string, outline: string,
      w: number, h: number, px: number, py: number,
      type: Hotspot['type'], url: string
    ) => {
      const cvs = drawGrafTag(text, fill, outline, 80, 640, 220);
      const tex = this.track(new THREE.CanvasTexture(cvs));
      tex.minFilter = tex.magFilter = THREE.NearestFilter;
      const mat = M(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      const mesh = new THREE.Mesh(G(new THREE.PlaneGeometry(w, h)), mat);
      mesh.position.set(px, py, 0.03);
      this.grafGroup.add(mesh);
      this.hotspots.push({ mesh, type, url, w, h, originalOpacity: 1.0, el: null! });
    };

    // Spread them out vertically so they're readable
    addContactTag('EMAIL', '#ff2266', '#440011', 3.5, 1.2, -1.0, 4.0, 'copy', CONTACT.email);
    if (CONTACT.github)
      addContactTag('GITHUB', '#00ff88', '#003322', 3.5, 1.2, 1.0, 3.0, 'link', CONTACT.github);
    if (CONTACT.linkedin)
      addContactTag('LINKEDIN', '#ffaa00', '#442200', 4.0, 1.2, -0.8, 2.0, 'link', CONTACT.linkedin);

    // ── Arrow pointing to payphone ────────────────────────────────────────
    const arCvs = document.createElement('canvas');
    arCvs.width = 384; arCvs.height = 128;
    const arCtx = arCvs.getContext('2d')!;
    arCtx.font = 'bold 32px "Arial Black", monospace';
    arCtx.fillStyle = 'rgba(255,255,255,0.65)';
    arCtx.textAlign = 'center'; arCtx.textBaseline = 'middle';
    arCtx.fillText('USE THE PHONE  ☎', 192, 64);
    const arTex = this.track(new THREE.CanvasTexture(arCvs));
    arTex.minFilter = arTex.magFilter = THREE.NearestFilter;
    const arMesh = new THREE.Mesh(
      G(new THREE.PlaneGeometry(2.8, 0.8)),
      M(new THREE.MeshBasicMaterial({ map: arTex, transparent: true, depthWrite: false }))
    );
    arMesh.position.set(-3.0, 1.4, 0.06);
    this.grafGroup.add(arMesh);



    // ── Among Us Graffiti ───────────────────────────────────────────────
    const amCvs = document.createElement('canvas');
    amCvs.width = 128; amCvs.height = 128;
    const amCtx = amCvs.getContext('2d')!;

    // Body (Red)
    amCtx.fillStyle = '#ff1122';
    amCtx.strokeStyle = '#000000';
    amCtx.lineWidth = 4;

    // Backpack
    amCtx.beginPath();
    amCtx.roundRect(10, 40, 20, 50, 8);
    amCtx.fill();
    amCtx.stroke();

    // Main Body
    amCtx.beginPath();
    amCtx.roundRect(30, 20, 50, 70, 25);
    amCtx.fill();
    amCtx.stroke();

    // Legs
    amCtx.beginPath();
    amCtx.roundRect(30, 80, 20, 30, 10);
    amCtx.fill();
    amCtx.stroke();

    amCtx.beginPath();
    amCtx.roundRect(60, 80, 20, 30, 10);
    amCtx.fill();
    amCtx.stroke();

    // Visor (Cyan)
    amCtx.fillStyle = '#00e5ff';
    amCtx.beginPath();
    amCtx.roundRect(45, 35, 45, 25, 12);
    amCtx.fill();
    amCtx.stroke();

    // Visor highlight
    amCtx.fillStyle = '#ffffff';
    amCtx.beginPath();
    amCtx.ellipse(75, 42, 8, 3, 0, 0, Math.PI * 2);
    amCtx.fill();

    const amTex = this.track(new THREE.CanvasTexture(amCvs));
    amTex.minFilter = amTex.magFilter = THREE.NearestFilter;
    const amMesh = new THREE.Mesh(
      G(new THREE.PlaneGeometry(0.8, 0.8)),
      M(new THREE.MeshBasicMaterial({ map: amTex, transparent: true, depthWrite: false }))
    );
    amMesh.position.set(2.5, 3.5, 0.03); // Above payphone
    this.grafGroup.add(amMesh);

    // ── Jolly Roger Graffiti ───────────────────────────────────────────────
    const jrCvs = document.createElement('canvas');
    jrCvs.width = 256; jrCvs.height = 256;
    const jrCtx = jrCvs.getContext('2d')!;

    // Draw skull and crossbones with straw hat
    jrCtx.fillStyle = '#ffffff'; // White bone color
    jrCtx.strokeStyle = '#000000';
    jrCtx.lineWidth = 6;

    // Crossbones
    jrCtx.save();
    jrCtx.translate(128, 140);

    const drawBone = () => {
      jrCtx.beginPath();
      jrCtx.moveTo(-80, -10); jrCtx.lineTo(80, -10);
      jrCtx.arc(90, -20, 15, Math.PI, 0);
      jrCtx.arc(90, 0, 15, 0, Math.PI);
      jrCtx.lineTo(-80, 10);
      jrCtx.arc(-90, 0, 15, 0, Math.PI);
      jrCtx.arc(-90, -20, 15, Math.PI, 0);
      jrCtx.closePath();
      jrCtx.fill(); jrCtx.stroke();
    };

    jrCtx.rotate(Math.PI / 4);
    drawBone();
    jrCtx.rotate(Math.PI / 2);
    drawBone();
    jrCtx.restore();

    // Skull (circle)
    jrCtx.beginPath();
    jrCtx.arc(128, 130, 48, 0, Math.PI * 2);
    jrCtx.fill();
    jrCtx.stroke();

    // Jaw (rounded box)
    jrCtx.beginPath();
    jrCtx.roundRect(102, 165, 52, 35, 10);
    jrCtx.fill();
    jrCtx.stroke();

    // Teeth lines
    jrCtx.lineWidth = 4;
    jrCtx.beginPath();
    // Horizontal
    jrCtx.moveTo(102, 182); jrCtx.lineTo(154, 182);
    // Vertical
    jrCtx.moveTo(112, 165); jrCtx.lineTo(112, 200);
    jrCtx.moveTo(128, 165); jrCtx.lineTo(128, 200);
    jrCtx.moveTo(144, 165); jrCtx.lineTo(144, 200);
    jrCtx.stroke();

    // Eyes (big black circles)
    jrCtx.fillStyle = '#000000';
    jrCtx.beginPath(); jrCtx.arc(110, 125, 14, 0, Math.PI * 2); jrCtx.fill();
    jrCtx.beginPath(); jrCtx.arc(146, 125, 14, 0, Math.PI * 2); jrCtx.fill();

    // Nose (small dot)
    jrCtx.beginPath(); jrCtx.arc(128, 148, 4, 0, Math.PI * 2); jrCtx.fill();

    // Straw Hat
    jrCtx.lineWidth = 6;
    jrCtx.fillStyle = '#ffcc00'; // Yellow straw color

    // Brim
    jrCtx.beginPath();
    jrCtx.ellipse(128, 90, 85, 12, 0, 0, Math.PI * 2);
    jrCtx.fill();
    jrCtx.stroke();

    // Dome
    jrCtx.beginPath();
    jrCtx.arc(128, 90, 48, Math.PI, 0);
    jrCtx.fill();
    jrCtx.stroke();

    // Hat red band
    jrCtx.fillStyle = '#e30000';
    jrCtx.beginPath();
    jrCtx.rect(80, 75, 96, 15);
    jrCtx.fill();

    // Add some graffiti drips to it
    jrCtx.fillStyle = '#ffffff';
    jrCtx.fillRect(115, 200, 4, 30);
    jrCtx.fillRect(135, 200, 5, 45);

    const jrTex = this.track(new THREE.CanvasTexture(jrCvs));
    jrTex.minFilter = jrTex.magFilter = THREE.NearestFilter;
    const jrMesh = new THREE.Mesh(
      G(new THREE.PlaneGeometry(2.0, 2.0)),
      M(new THREE.MeshBasicMaterial({ map: jrTex, transparent: true, depthWrite: false }))
    );
    // Move to red circle area (top left of graffiti wall)
    jrMesh.position.set(-3.2, 3.8, 0.05);
    this.grafGroup.add(jrMesh);


    // ── Extra Graffiti Tags ───────────────────────────────────────────────
    const makeSimpleTag = (text: string, col: string, size: number) => {
      const cvs = document.createElement('canvas');
      cvs.width = 256; cvs.height = 128;
      const ctx = cvs.getContext('2d')!;
      ctx.font = `bold ${size}px "Courier New", monospace`;
      ctx.fillStyle = col;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 64);

      // Some spray drips
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(128 + rng(-40, 40), 70, rng(2, 4), rng(10, 30));
      }

      const tex = this.track(new THREE.CanvasTexture(cvs));
      tex.minFilter = tex.magFilter = THREE.NearestFilter;
      return new THREE.Mesh(
        G(new THREE.PlaneGeometry(1.5, 0.75)),
        M(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.7 }))
      );
    };

    const tag1 = makeSimpleTag('REBEL', '#ff44aa', 40);
    tag1.position.set(-2.0, 1.5, 0.02);
    tag1.rotation.z = 0.2;
    this.grafGroup.add(tag1);

    const tag2 = makeSimpleTag('0xDEADC0DE', '#44ffaa', 30);
    tag2.position.set(2.0, 5.5, 0.02);
    tag2.rotation.z = -0.15;
    this.grafGroup.add(tag2);

    // Graffiti area ambient glow
    const glow = new THREE.PointLight(0x00e5ff, 3.5, 10);
    glow.position.set(-2, 4.5, 2);
    this.scene.add(glow);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Payphone  (left wall, BEFORE character so char can stand beside it)
  // ══════════════════════════════════════════════════════════════════════════
  private buildPayphone(): void {
    const flat = RetroRenderer.makeFlatMaterial.bind(RetroRenderer);
    const G = <T extends THREE.BufferGeometry>(g: T) => { this.track(g); return g; };
    const M = <T extends THREE.Material>(m: T) => { this.track(m); return m; };

    // Payphone at Z=-2.5 (character will stand at Z=+1.0, well separated)
    const phonePos = new THREE.Vector3(-3.8, 1.8, -2.5);

    const body = new THREE.Mesh(G(new THREE.BoxGeometry(0.55, 0.9, 0.42)), M(flat(0x28304a)));
    body.position.copy(phonePos);
    this.alleyGroup.add(body);

    // Coin box
    const coinBox = new THREE.Mesh(G(new THREE.BoxGeometry(0.45, 0.2, 0.35)), M(flat(0x1c2238)));
    coinBox.position.set(phonePos.x, phonePos.y - 0.55, phonePos.z);
    this.alleyGroup.add(coinBox);

    // Screen
    const screen = new THREE.Mesh(G(new THREE.PlaneGeometry(0.28, 0.18)), M(new THREE.MeshBasicMaterial({ color: 0x00ff88 })));
    screen.rotation.y = Math.PI / 2;
    screen.position.set(phonePos.x + 0.28, phonePos.y + 0.15, phonePos.z);
    this.alleyGroup.add(screen);

    // Dangling receiver
    const recv = new THREE.Mesh(G(new THREE.BoxGeometry(0.07, 0.35, 0.07)), M(flat(0x111111)));
    recv.position.set(phonePos.x + 0.3, phonePos.y - 0.2, phonePos.z + 0.1);
    recv.rotation.z = 0.5;
    this.alleyGroup.add(recv);

    // Green screen light
    const sLight = new THREE.PointLight(0x00ff88, 3.0, 4);
    sLight.position.set(phonePos.x + 0.8, phonePos.y + 0.2, phonePos.z);
    this.alleyGroup.add(sLight);

    // Hit mesh for hotspot
    const hit = new THREE.Mesh(G(new THREE.PlaneGeometry(0.6, 0.9)), M(new THREE.MeshBasicMaterial({ visible: false })));
    hit.rotation.y = Math.PI / 2;
    hit.position.set(phonePos.x + 0.3, phonePos.y, phonePos.z);
    this.scene.add(hit);

    this.hotspots.push({ mesh: hit, type: 'payphone', url: 'Use payphone', w: 0.6, h: 0.9, originalOpacity: 1.0, el: null! });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Character  — identical to RooftopScene, static cape
  // ══════════════════════════════════════════════════════════════════════════
  private buildCharacter(): void {
    const g = this.charGroup;
    g.position.set(-3.0, 0.3, -4.5);
    // Face the wall (mostly)
    g.rotation.y = -Math.PI / 2 - 0.2;

    const accent = WORLD.accentColorHex;
    const flat = (c: number, opts?: Partial<THREE.MeshLambertMaterialParameters>) =>
      RetroRenderer.makeFlatMaterial(c, opts);

    // Body — dark charcoal
    const bodyGeo = new THREE.BoxGeometry(0.7, 1.3, 0.4);
    const body = new THREE.Mesh(this.track(bodyGeo), this.track(flat(0x353545)));
    body.position.y = 1.65;
    g.add(body);

    // Head / mask (turn head to look over shoulder towards camera)
    const headGroup = new THREE.Group();
    headGroup.position.y = 2.55;
    headGroup.rotation.y = -1.2; // Look back at camera
    g.add(headGroup);

    const headGeo = new THREE.BoxGeometry(0.55, 0.55, 0.4);
    const head = new THREE.Mesh(this.track(headGeo), this.track(flat(0x2e2e3e)));
    headGroup.add(head);

    // Glowing cyan lens eyes (exactly like rooftop)
    const lensGeo = new THREE.BoxGeometry(0.18, 0.1, 0.45);
    const lensMat = new THREE.MeshBasicMaterial({ color: accent });
    [-0.14, 0.14].forEach((ox) => {
      const lens = new THREE.Mesh(this.track(lensGeo), this.track(lensMat));
      lens.position.set(ox, 0, 0.21);
      lens.rotation.z = ox < 0 ? 0.3 : -0.3;
      headGroup.add(lens);
    });

    // Shoulders
    const shoulderGeo = new THREE.BoxGeometry(1.1, 0.25, 0.45);
    const shoulder = new THREE.Mesh(this.track(shoulderGeo), this.track(flat(0x2e2e44)));
    shoulder.position.y = 2.1;
    g.add(shoulder);

    // Arms - Left arm relaxed, Right arm pointing spray can
    const armGeo = new THREE.BoxGeometry(0.22, 0.9, 0.22);

    // Left
    const armL = new THREE.Mesh(this.track(armGeo), this.track(flat(0x232333)));
    armL.position.set(-0.45, 1.25, 0);
    g.add(armL);

    // Right (spray can pose)
    const armR = new THREE.Mesh(this.track(armGeo), this.track(flat(0x232333)));
    armR.position.set(0.45, 1.5, 0.2);
    armR.rotation.x = -Math.PI / 2 + 0.25;
    g.add(armR);

    // Spray can
    const can = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8)),
      this.track(flat(0xdddddd))
    );
    can.position.set(0.45, 1.5, 0.7);
    can.rotation.x = Math.PI / 2;
    g.add(can);

    // Legs
    [[-0.2, 0, 0], [0.2, 0, 0]].forEach(([ox]) => {
      const legGeo = new THREE.BoxGeometry(0.26, 0.9, 0.26);
      const leg = new THREE.Mesh(this.track(legGeo), this.track(flat(0x1c1c2c)));
      leg.position.set(ox, 0.45, 0);
      g.add(leg);
    });

    // Neck wrap
    const neckGeo = new THREE.TorusGeometry(0.28, 0.07, 6, 10);
    const neckMat = flat(accent);
    const neckMesh = new THREE.Mesh(this.track(neckGeo), this.track(neckMat));
    neckMesh.position.set(0, 2.35, 0);
    neckMesh.rotation.x = Math.PI / 2;
    g.add(neckMesh);

    // Scarf - falling down statically
    const scarfGeo = new THREE.PlaneGeometry(0.28, 2.0, 2, 2);
    scarfGeo.translate(0, -1.0, 0);
    const scarfMat = flat(accent, { side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    const scarfMesh = new THREE.Mesh(this.track(scarfGeo), this.track(scarfMat));
    scarfMesh.position.set(0.15, 2.35, -0.2);
    scarfMesh.rotation.x = 0.2; // slight hang backwards
    scarfMesh.rotation.z = -0.1;
    g.add(scarfMesh);

    // Rim light
    const rimLight = new THREE.PointLight(accent, 4.0, 6);
    rimLight.position.set(0, 2.0, 0.8);
    g.add(rimLight);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Arcade Machine — left wall, z=-7.5, past character + payphone
  // ══════════════════════════════════════════════════════════════════════════
  private buildArcadeMachine(): void {
    const G = <T extends THREE.BufferGeometry>(g: T) => { this.track(g); return g; };
    const M = <T extends THREE.Material>(m: T) => { this.track(m); return m; };

    const group = new THREE.Group();
    group.position.set(-3.6, 0, -7.5);
    group.rotation.y = Math.PI / 2;  // face +X (into alley)
    group.scale.setScalar(1.5);      // big enough to be noticeable from idle cam

    const darkMat = M(new THREE.MeshLambertMaterial({ color: 0x111118 }));
    const sideMat = M(new THREE.MeshLambertMaterial({ color: 0x1a1a28 }));
    const trimMat = M(new THREE.MeshLambertMaterial({ color: 0x2a2a40 }));
    const accentMat = M(new THREE.MeshLambertMaterial({ color: 0x00e5ff }));

    // Cabinet body
    const body = new THREE.Mesh(G(new THREE.BoxGeometry(0.72, 1.90, 0.58)), sideMat);
    body.position.set(0, 0.95, 0);
    group.add(body);

    // Side trim strips
    [-0.362, 0.362].forEach(ox => {
      const trim = new THREE.Mesh(G(new THREE.BoxGeometry(0.02, 1.90, 0.62)), trimMat);
      trim.position.set(ox, 0.95, 0);
      group.add(trim);
    });

    // Marquee top block
    const marquee = new THREE.Mesh(G(new THREE.BoxGeometry(0.74, 0.36, 0.54)), M(new THREE.MeshLambertMaterial({ color: 0x0d0d22 })));
    marquee.position.set(0, 1.95, 0);
    group.add(marquee);

    // Marquee text canvas
    const mCvs = document.createElement('canvas');
    mCvs.width = 512; mCvs.height = 96;
    const mCtx = mCvs.getContext('2d')!;
    mCtx.fillStyle = '#000018';
    mCtx.fillRect(0, 0, 512, 96);
    for (let sy = 0; sy < 96; sy += 4) {
      mCtx.fillStyle = 'rgba(0,0,0,0.35)';
      mCtx.fillRect(0, sy, 512, 2);
    }
    mCtx.fillStyle = '#00e5ff';
    mCtx.shadowColor = '#00e5ff';
    mCtx.shadowBlur = 18;
    mCtx.font = 'bold 48px monospace';
    mCtx.textAlign = 'center';
    mCtx.textBaseline = 'middle';
    mCtx.fillText('DATA-MAZE', 256, 48);
    const mTex = this.track(new THREE.CanvasTexture(mCvs));
    const mFace = new THREE.Mesh(G(new THREE.PlaneGeometry(0.64, 0.28)), M(new THREE.MeshBasicMaterial({ map: mTex })));
    mFace.position.set(0, 1.95, 0.281);
    group.add(mFace);

    // Marquee glow light (flickering aggressively)
    this.marqueeLight = new THREE.PointLight(0x00e5ff, 5.0, 6);
    this.marqueeLight.position.set(0, 1.95, 1.2);
    group.add(this.marqueeLight);
    // Removed from standard neonLights to flicker separately


    // Screen bezel
    const bezel = new THREE.Mesh(G(new THREE.BoxGeometry(0.62, 0.54, 0.07)), darkMat);
    bezel.position.set(0, 1.35, 0.26);
    group.add(bezel);

    const bezelInner = new THREE.Mesh(G(new THREE.BoxGeometry(0.52, 0.44, 0.05)), M(new THREE.MeshLambertMaterial({ color: 0x050508 })));
    bezelInner.position.set(0, 1.35, 0.285);
    group.add(bezelInner);

    // Live game screen (Double resolution to fix pixelation/blur)
    this.arcadeCanvas = document.createElement('canvas');
    this.arcadeCanvas.width = 672;
    this.arcadeCanvas.height = 800;
    this.arcadeTex = this.track(new THREE.CanvasTexture(this.arcadeCanvas));
    this.arcadeTex.minFilter = this.arcadeTex.magFilter = THREE.LinearFilter;

    this.arcadeScreenMesh = new THREE.Mesh(
      G(new THREE.PlaneGeometry(0.50, 0.42)),
      M(new THREE.MeshBasicMaterial({ map: this.arcadeTex }))
    );
    this.arcadeScreenMesh.position.set(0, 1.35, 0.312);
    group.add(this.arcadeScreenMesh);

    // Screen ambient glow
    this.arcadeScreenGlow = new THREE.PointLight(0x00e5ff, 2.0, 3);
    this.arcadeScreenGlow.position.set(0, 1.35, 1.0);
    group.add(this.arcadeScreenGlow);

    // Volumetric neon glow plane
    const glowGeo = new THREE.PlaneGeometry(0.8, 0.8);
    this.arcadeGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const glowMesh = new THREE.Mesh(G(glowGeo), M(this.arcadeGlowMat));
    glowMesh.position.set(0, 1.35, 0.4);
    group.add(glowMesh);

    this.arcadeGlowTween = gsap.to([this.arcadeScreenGlow, this.arcadeGlowMat], {
      intensity: 8.0,
      distance: 6.0,
      opacity: 0.4,
      duration: 2.5,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut"
    });

    // Control deck
    const deck = new THREE.Mesh(G(new THREE.BoxGeometry(0.72, 0.20, 0.42)), darkMat);
    deck.position.set(0, 0.90, 0.12);
    deck.rotation.x = -0.4;
    group.add(deck);

    // Joystick
    const stickBase = new THREE.Mesh(G(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 8)), accentMat);
    stickBase.position.set(-0.12, 1.00, 0.25);
    group.add(stickBase);
    const stick = new THREE.Mesh(G(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6)), darkMat);
    stick.position.set(-0.12, 1.07, 0.25);
    group.add(stick);
    const ball = new THREE.Mesh(G(new THREE.SphereGeometry(0.030, 8, 6)), accentMat);
    ball.position.set(-0.12, 1.13, 0.25);
    group.add(ball);

    // Buttons with bezels
    [{ col: 0xff2266, ox: 0.08 }, { col: 0xffaa00, ox: 0.18 }, { col: 0x00e5ff, ox: 0.28 }].forEach(({ col, ox }) => {
      const rim = new THREE.Mesh(G(new THREE.CylinderGeometry(0.033, 0.033, 0.05, 8)), M(new THREE.MeshLambertMaterial({ color: 0x111111 })));
      rim.rotation.x = Math.PI / 2;
      rim.position.set(ox, 0.99, 0.31);
      group.add(rim);
      const btn = new THREE.Mesh(G(new THREE.CylinderGeometry(0.024, 0.024, 0.05, 8)), M(new THREE.MeshLambertMaterial({ color: col })));
      btn.rotation.x = Math.PI / 2;
      btn.position.set(ox, 0.99, 0.32);
      group.add(btn);
    });

    // Base / coin door
    const base = new THREE.Mesh(G(new THREE.BoxGeometry(0.72, 0.38, 0.58)), sideMat);
    base.position.set(0, 0.19, 0);
    group.add(base);
    const slot = new THREE.Mesh(G(new THREE.BoxGeometry(0.12, 0.035, 0.025)), darkMat);
    slot.position.set(0.12, 0.28, 0.292);
    group.add(slot);

    // Speaker grille dots
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        const dot = new THREE.Mesh(G(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 6)), M(new THREE.MeshLambertMaterial({ color: 0x222230 })));
        dot.rotation.x = Math.PI / 2;
        dot.position.set(-0.15 + c * 0.035, 0.55 + r * 0.05, 0.292);
        group.add(dot);
      }
    }

    this.alleyGroup.add(group);

    // World-space hit mesh for raycasting
    group.updateWorldMatrix(true, true);
    const worldScreenPos = new THREE.Vector3();
    this.arcadeScreenMesh.getWorldPosition(worldScreenPos);
    this.arcadeHitMesh = new THREE.Mesh(
      G(new THREE.PlaneGeometry(0.80, 0.70)),
      M(new THREE.MeshBasicMaterial({ visible: false }))
    );
    this.arcadeHitMesh.position.copy(worldScreenPos);
    this.arcadeHitMesh.rotation.y = Math.PI / 2; // faces +X
    this.scene.add(this.arcadeHitMesh);

    // Init game
    this.dataMaze = new DataMaze(this.arcadeCanvas);

    // Click handler
    this.arcadeClickHandler = (e: MouseEvent) => {
      if (this.formOpen || this.arcadeOpen) return;
      const cnv = document.getElementById('canvas') as HTMLCanvasElement;
      if (!cnv) return;
      const rect = cnv.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      this.arcadeRaycaster.setFromCamera(mouse, this.camera);
      if (this.arcadeRaycaster.intersectObject(this.arcadeHitMesh).length > 0) this.openArcade();
    };
    document.getElementById('canvas')?.addEventListener('click', this.arcadeClickHandler);

    // Hover handler
    this.arcadeHoverHandler = (e: MouseEvent) => {
      if (this.formOpen || this.arcadeOpen) {
        document.body.style.cursor = 'default';
        return;
      }
      const cnv = document.getElementById('canvas') as HTMLCanvasElement;
      if (!cnv) return;
      const rect = cnv.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      this.arcadeRaycaster.setFromCamera(mouse, this.camera);
      if (this.arcadeRaycaster.intersectObject(this.arcadeHitMesh).length > 0) {
        document.body.style.cursor = 'pointer';
      } else {
        document.body.style.cursor = 'default';
      }
    };
    document.getElementById('canvas')?.addEventListener('mousemove', this.arcadeHoverHandler);

    // Escape to exit
    this.arcadeEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.arcadeOpen) this.closeArcade();
    };
    window.addEventListener('keydown', this.arcadeEscHandler);
  }

  private openArcade(): void {
    if (this.arcadeOpen) return;
    this.arcadeOpen = true;

    if (this.arcadeGlowTween) {
      this.arcadeGlowTween.kill();
      // If we animated the array, just reset the pointlight intensity to low
      gsap.to(this.arcadeScreenGlow, { intensity: 2.0, distance: 3.0, duration: 0.5 });
      gsap.to(this.arcadeGlowMat, { opacity: 0, duration: 0.5 });
      this.arcadeGlowTween = null;
    }
    this.deps.audio.playClick();
    document.body.style.cursor = 'default'; // Reset cursor when interacting
    this.overlayEl.style.display = 'none';
    gsap.killTweensOf(this.camera.position);
    gsap.to(this.camera.position, {
      x: CAM_ARCADE.pos.x, y: CAM_ARCADE.pos.y, z: CAM_ARCADE.pos.z,
      duration: 1.2, ease: 'power2.inOut',
      onUpdate: () => this.camera.lookAt(CAM_ARCADE.lookAt),
      onComplete: () => {
        this.camera.lookAt(CAM_ARCADE.lookAt);
        this.dataMaze.start();
        if (this.escOverlayEl) this.escOverlayEl.style.display = 'block';
      },
    });
  }

  private closeArcade(): void {
    if (!this.arcadeOpen) return;
    this.arcadeOpen = false;
    this.dataMaze.stop();
    if (this.escOverlayEl) this.escOverlayEl.style.display = 'none';

    // Restart the slow pulse
    this.arcadeGlowTween = gsap.to([this.arcadeScreenGlow, this.arcadeGlowMat], {
      intensity: 8.0,
      distance: 6.0,
      opacity: 0.4,
      duration: 2.5,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut"
    });

    gsap.killTweensOf(this.camera.position);
    gsap.to(this.camera.position, {
      x: CAM_IDLE.pos.x, y: CAM_IDLE.pos.y, z: CAM_IDLE.pos.z,
      duration: 1.0, ease: 'power2.inOut',
      onUpdate: () => this.camera.lookAt(CAM_IDLE.lookAt),
      onComplete: () => { this.overlayEl.style.display = 'block'; },
    });
  }

  private updateCharacter(time: number): void {
    // Subtle breathing bob
    this.charGroup.position.y = Math.sin(time * 1.8) * 0.025;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DOM Hotspots  — FIX: pointer-events only on the actual button elements,
  //  NOT on the container div, so the overlay doesn't swallow mouse events
  // ══════════════════════════════════════════════════════════════════════════
  private buildHotspotsDOM(): void {
    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'graffiti-overlay';
    Object.assign(this.overlayEl.style, {
      position: 'absolute', inset: '0',
      // CRITICAL: container has pointer-events:none so it never catches hover
      pointerEvents: 'none',
      display: 'none', opacity: '0', zIndex: '20',
    });
    document.body.appendChild(this.overlayEl);

    this.escOverlayEl = document.createElement('div');
    this.escOverlayEl.id = 'arcade-esc-overlay';
    Object.assign(this.escOverlayEl.style, {
      position: 'absolute', top: '22%', left: '50%', transform: 'translateX(-50%)',
      color: '#ff2266', fontFamily: 'monospace', fontSize: '18px', fontWeight: 'bold',
      textShadow: '0 0 10px #ff2266', pointerEvents: 'none', display: 'none', zIndex: '100',
      textAlign: 'center', letterSpacing: '1px'
    });
    this.escOverlayEl.innerText = '[ PRESS ESC TO LEAVE ]';
    document.body.appendChild(this.escOverlayEl);

    this.hotspots.forEach(hs => {
      const el = document.createElement('button');
      el.className = 'graffiti-hotspot';
      Object.assign(el.style, {
        position: 'absolute',
        // Only the button itself gets pointer-events
        pointerEvents: 'auto',
        border: '2px dashed transparent',
        background: 'transparent',
        cursor: 'pointer',
        borderRadius: '4px',
        minWidth: '44px', minHeight: '44px',
        // No text content — transparent buttons
        color: 'transparent', fontSize: '0',
        transition: 'border-color 0.15s, background 0.15s',
      });
      el.setAttribute('aria-label', hs.type === 'payphone' ? 'Use the payphone to send a message' : `Visit ${hs.url}`);
      el.title = hs.url;

      el.addEventListener('mouseenter', () => {
        // NO background change — this was causing the gray overlay
        this.deps.audio.playHover();
      });
      el.addEventListener('mouseleave', () => { });
      el.addEventListener('focus', () => { });
      el.addEventListener('blur', () => { });

      el.addEventListener('click', () => {
        this.deps.audio.playClick();
        if (hs.type === 'link') {
          window.open(hs.url, '_blank', 'noopener,noreferrer');
        } else if (hs.type === 'payphone') {
          this.openForm();
          if ((window as any).gameNotepad) {
            (window as any).gameNotepad.completeQuest('payphone');
          }
        } else if (hs.type === 'copy') {
          navigator.clipboard.writeText(hs.url).catch(() => { });
          el.style.color = '#fff'; el.style.fontSize = '11px';
          el.style.fontFamily = 'monospace'; el.style.textShadow = '0 0 8px #000';
          el.textContent = 'COPIED!';
          setTimeout(() => {
            el.textContent = ''; el.style.color = 'transparent'; el.style.fontSize = '0';
          }, 2200);
        }
      });

      this.overlayEl.appendChild(el);
      hs.el = el;
    });
  }

  private updateHotspotsScreen(): void {
    if (!this.overlayEl || this.overlayEl.style.display === 'none') return;
    const W = window.innerWidth, H = window.innerHeight;

    this.hotspots.forEach(hs => {
      hs.mesh.getWorldPosition(this._hsVec3);
      this._hsVec3.project(this.camera);
      if (this._hsVec3.z > 1) { hs.el.style.display = 'none'; return; }

      const sx = (this._hsVec3.x * 0.5 + 0.5) * W;
      const sy = (-this._hsVec3.y * 0.5 + 0.5) * H;

      hs.mesh.getWorldPosition(this._hsVec3);
      const dist = this.camera.position.distanceTo(this._hsVec3);
      // Mathematically correct world-to-screen scale for perspective camera
      const scale = H / (2 * Math.tan(this.camera.fov * Math.PI / 360) * dist);
      const eW = hs.w * scale;
      const eH = hs.h * scale;

      hs.el.style.display = 'block';
      hs.el.style.left = `${sx - eW / 2}px`;
      hs.el.style.top = `${sy - eH / 2}px`;
      hs.el.style.width = `${eW}px`;
      hs.el.style.height = `${eH}px`;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Form DOM
  // ══════════════════════════════════════════════════════════════════════════
  private buildFormDOM(): void {
    this.formOverlayEl = document.createElement('div');
    this.formOverlayEl.id = 'street-form-overlay';
    Object.assign(this.formOverlayEl.style, {
      display: 'none', opacity: '0',
      position: 'absolute', inset: '0',
      zIndex: '30', background: 'rgba(0,0,0,0.75)',
      alignItems: 'center', justifyContent: 'center',
    });

    const panel = document.createElement('div');
    panel.innerHTML = `
      <div id="sf-panel" style="
        background:#0c0e1c; padding:2rem 2.5rem; width:90%; max-width:460px;
        border:2px solid #00e5ff; border-radius:4px;
        font-family:'Courier New',monospace; color:#eee; box-sizing:border-box;
      ">
        <p style="margin:0 0 0.2rem;color:#555;font-size:0.7rem;letter-spacing:2px;">OPEN CHANNEL — CASE FILE №003</p>
        <h2 style="margin:0 0 0.3rem;color:#00e5ff;letter-spacing:3px;font-size:1.35rem;">TRANSMISSION</h2>
        <p style="margin:0 0 1.5rem;color:#777;font-size:0.82rem;">Leave a message on the wall. I'll receive it.</p>
        <form id="sf-form" novalidate>
          <div style="margin-bottom:1rem;">
            <label for="sf-name" style="display:block;margin-bottom:0.4rem;font-size:0.78rem;color:#aaa;">[ NAME ]</label>
            <input id="sf-name" type="text" name="name" required autocomplete="name"
              style="width:100%;padding:0.5rem;background:#111;border:1px solid #334;color:#eee;font-family:inherit;box-sizing:border-box;outline:none;"/>
            <span id="sf-name-err" style="color:#ff4488;font-size:0.72rem;display:none;">Required</span>
          </div>
          <div style="margin-bottom:1rem;">
            <label for="sf-email" style="display:block;margin-bottom:0.4rem;font-size:0.78rem;color:#aaa;">[ EMAIL ]</label>
            <input id="sf-email" type="email" name="email" required autocomplete="email"
              style="width:100%;padding:0.5rem;background:#111;border:1px solid #334;color:#eee;font-family:inherit;box-sizing:border-box;outline:none;"/>
            <span id="sf-email-err" style="color:#ff4488;font-size:0.72rem;display:none;">Valid email required</span>
          </div>
          <div style="margin-bottom:1rem;">
            <label for="sf-msg" style="display:block;margin-bottom:0.4rem;font-size:0.78rem;color:#aaa;">[ MESSAGE ]</label>
            <textarea id="sf-msg" name="message" rows="5" required
              style="width:100%;padding:0.5rem;background:#111;border:1px solid #334;color:#eee;font-family:inherit;box-sizing:border-box;resize:vertical;outline:none;"></textarea>
            <span id="sf-msg-err" style="color:#ff4488;font-size:0.72rem;display:none;">Required</span>
          </div>
          <div id="sf-status" style="min-height:1.1em;margin-bottom:0.8rem;font-size:0.82rem;"></div>
          <div style="display:flex;justify-content:space-between;gap:1rem;">
            <button id="sf-submit" type="submit"
              style="flex:1;padding:0.6rem;background:#00e5ff;color:#000;border:none;font-family:inherit;font-weight:900;cursor:pointer;letter-spacing:2px;font-size:0.82rem;">
              TRANSMIT SIGNAL
            </button>
            <button id="sf-close" type="button"
              style="padding:0.6rem 1rem;background:transparent;color:#ff2266;border:1px solid #ff2266;font-family:inherit;cursor:pointer;font-size:0.82rem;">
              ABORT
            </button>
          </div>
        </form>
      </div>`;
    this.formOverlayEl.appendChild(panel);
    document.body.appendChild(this.formOverlayEl);

    this.formEl = panel.querySelector('#sf-form') as HTMLFormElement;
    this.statusEl = panel.querySelector('#sf-status') as HTMLDivElement;
    this.formEl.addEventListener('submit', (e) => this.handleSubmit(e));
    panel.querySelector('#sf-close')?.addEventListener('click', () => this.closeForm(true));

    this._escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape' && this.formOpen) this.closeForm(true); };
    window.addEventListener('keydown', this._escHandler);

    const sfPanel = panel.querySelector('#sf-panel') as HTMLElement;
    this._focusTrapHandler = (e: KeyboardEvent) => {
      if (!this.formOpen || e.key !== 'Tab') return;
      const focusable = Array.from(sfPanel.querySelectorAll<HTMLElement>('input,textarea,button'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    window.addEventListener('keydown', this._focusTrapHandler);
  }

  private openForm(): void {
    if (this.formOpen) return;
    this.formOpen = true;
    this.deps.audio.playClick();
    gsap.killTweensOf(this.camera.position);
    gsap.to(this.camera.position, {
      x: CAM_FORM.pos.x, y: CAM_FORM.pos.y, z: CAM_FORM.pos.z,
      duration: 1.1, ease: 'power2.inOut',
      onUpdate: () => this.camera.lookAt(CAM_FORM.lookAt),
    });
    this.overlayEl.style.display = 'none';
    this.formOverlayEl.style.display = 'flex';
    gsap.fromTo(this.formOverlayEl, { opacity: 0 }, {
      opacity: 1, duration: 0.5, delay: 0.6,
      onComplete: () => (this.formEl.querySelector('#sf-name') as HTMLElement)?.focus(),
    });
  }

  private closeForm(animate: boolean): void {
    if (!this.formOpen) return;
    this.formOpen = false;
    gsap.to(this.formOverlayEl, {
      opacity: 0, duration: 0.25, ease: 'power2.in', onComplete: () => {
        this.formOverlayEl.style.display = 'none';
        this.formEl.reset(); this.statusEl.innerText = '';
        this.overlayEl.style.display = 'block';
      }
    });
    if (animate) {
      gsap.killTweensOf(this.camera.position);
      gsap.to(this.camera.position, {
        x: CAM_IDLE.pos.x, y: CAM_IDLE.pos.y, z: CAM_IDLE.pos.z,
        duration: 1.0, ease: 'power2.inOut',
        onUpdate: () => this.camera.lookAt(CAM_IDLE.lookAt),
      });
    }
  }

  private handleSubmit(e: Event): void {
    e.preventDefault();
    if (this.isSubmitting) return;
    const nameEl = this.formEl.querySelector<HTMLInputElement>('#sf-name')!;
    const emailEl = this.formEl.querySelector<HTMLInputElement>('#sf-email')!;
    const msgEl = this.formEl.querySelector<HTMLTextAreaElement>('#sf-msg')!;
    const nameErr = this.formEl.querySelector<HTMLElement>('#sf-name-err')!;
    const emailErr = this.formEl.querySelector<HTMLElement>('#sf-email-err')!;
    const msgErr = this.formEl.querySelector<HTMLElement>('#sf-msg-err')!;

    let valid = true;
    nameErr.style.display = nameEl.value.trim() ? 'none' : (valid = false, 'block');
    emailErr.style.display = /^[^@]+@[^@]+\.[^@]+$/.test(emailEl.value.trim()) ? 'none' : (valid = false, 'block');
    msgErr.style.display = msgEl.value.trim() ? 'none' : (valid = false, 'block');
    if (!valid) return;

    this.isSubmitting = true;
    this.statusEl.style.color = '#00e5ff';
    this.statusEl.textContent = '[ ENCODING SIGNAL... ]';

    const endpoint = CONTACT.formEndpoint;
    if (!endpoint || endpoint.startsWith('mailto:')) {
      setTimeout(() => {
        this.statusEl.style.color = '#00ff88';
        this.statusEl.textContent = 'MESSAGE RECEIVED. THE LINE GOES DEAD.';
        setTimeout(() => { this.closeForm(true); this.isSubmitting = false; }, 2200);
      }, 1500);
    } else {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: nameEl.value, email: emailEl.value, message: msgEl.value }),
      }).then(r => {
        if (r.ok) {
          this.statusEl.style.color = '#00ff88';
          this.statusEl.textContent = 'MESSAGE RECEIVED. THE LINE GOES DEAD.';
          setTimeout(() => { this.closeForm(true); this.isSubmitting = false; }, 2200);
        } else {
          this.statusEl.style.color = '#ff4488';
          this.statusEl.textContent = 'SIGNAL LOST. TRY AGAIN.';
          this.isSubmitting = false;
        }
      }).catch(() => {
        this.statusEl.style.color = '#ff4488';
        this.statusEl.textContent = 'NO CARRIER. CHECK YOUR CONNECTION.';
        this.isSubmitting = false;
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Reflections (fake wet floor)
  // ══════════════════════════════════════════════════════════════════════════
  private buildReflections(): void {
    // Mirror neon sign faces only (cheap and effective)
    this.neonGroup.children.forEach(child => {
      if (child instanceof THREE.Mesh) {
        const cm = child.clone();
        cm.position.y = -child.position.y + 0.02;
        cm.scale.y = -1;
        const mat = (cm.material as THREE.MeshBasicMaterial).clone();
        mat.transparent = true; mat.opacity = 0.18;
        mat.blending = THREE.AdditiveBlending; mat.depthWrite = false;
        cm.material = this.track(mat);
        this.scene.add(cm);
      }
    });

    // Puddle decals
    const pudGeo = this.track(new THREE.PlaneGeometry(1, 1));
    const pudMat = this.track(new THREE.MeshLambertMaterial({ color: 0x0c0f18, depthWrite: false }));
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(pudGeo, pudMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(rng(-1, 5), 0.009, rng(-8, 5));
      p.scale.set(rng(1.5, 4.5), rng(0.8, 2.5), 1);
      p.rotation.z = rng(0, Math.PI);
      this.scene.add(p);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Rain & Ripples  (no steam)
  // ══════════════════════════════════════════════════════════════════════════
  private buildRain(): void {
    const geo = this.track(new THREE.PlaneGeometry(0.012, 0.38));
    const mat = this.track(new THREE.MeshBasicMaterial({ color: 0x88aacc, transparent: true, opacity: 0.2, depthWrite: false }));
    const RC = 600;
    this.rainMesh = new THREE.InstancedMesh(geo, mat, RC);
    this.rainMesh.frustumCulled = false;
    this.rainPos = new Float32Array(RC * 3);
    this._rainDummy.rotation.z = 0.15;
    for (let i = 0; i < RC; i++) {
      this.rainPos[i * 3] = rng(-5, 8);
      this.rainPos[i * 3 + 1] = rng(0, 20);
      this.rainPos[i * 3 + 2] = rng(-12, 14);
      this._rainDummy.position.set(this.rainPos[i * 3], this.rainPos[i * 3 + 1], this.rainPos[i * 3 + 2]);
      this._rainDummy.updateMatrix();
      this.rainMesh.setMatrixAt(i, this._rainDummy.matrix);
    }
    this.scene.add(this.rainMesh);

    const rGeo = this.track(new THREE.RingGeometry(0.04, 0.09, 8));
    const rMat = this.track(new THREE.MeshBasicMaterial({ color: 0x7799bb, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    this.rippleMesh = new THREE.InstancedMesh(rGeo, rMat, 40);
    this.rippleMesh.frustumCulled = false;
    this._riplDummy.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 40; i++) this.rippleData.push({ t: 0, x: 0, z: 0, active: false });
    this.scene.add(this.rippleMesh);
  }

  private updateRain(dt: number): void {
    const RC = 600;
    let ripIdx = 0;
    for (let i = 0; i < RC; i++) {
      this.rainPos[i * 3 + 1] -= 20.0 * dt;
      this.rainPos[i * 3] -= 2.5 * dt;
      if (this.rainPos[i * 3 + 1] < 0) {
        if (ripIdx < 40) { const rd = this.rippleData[ripIdx++]; rd.active = true; rd.t = 0; rd.x = this.rainPos[i * 3]; rd.z = this.rainPos[i * 3 + 2]; }
        this.rainPos[i * 3] = rng(-5, 8); this.rainPos[i * 3 + 1] = rng(16, 22); this.rainPos[i * 3 + 2] = rng(-12, 14);
      }
      this._rainDummy.position.set(this.rainPos[i * 3], this.rainPos[i * 3 + 1], this.rainPos[i * 3 + 2]);
      this._rainDummy.updateMatrix();
      this.rainMesh.setMatrixAt(i, this._rainDummy.matrix);
    }
    this.rainMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < 40; i++) {
      const rd = this.rippleData[i];
      if (rd.active) {
        rd.t += dt * 2.5; if (rd.t > 1.0) rd.active = false;
        this._riplDummy.position.set(rd.x, 0.02, rd.z);
        const s = 1.0 + rd.t * 3.0; this._riplDummy.scale.set(s, s, 1);
      } else {
        this._riplDummy.position.set(0, -10, 0); this._riplDummy.scale.set(1, 1, 1);
      }
      this._riplDummy.updateMatrix();
      this.rippleMesh.setMatrixAt(i, this._riplDummy.matrix);
    }
    this.rippleMesh.instanceMatrix.needsUpdate = true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Per-frame
  // ══════════════════════════════════════════════════════════════════════════
  private updateFlicker(dt: number): void {
    this.neonLights.forEach((light, i) => {
      this.flickerTimers[i] += dt;
      if (this.flickerTimers[i] >= this.flickerNexts[i]) {
        gsap.to(light, { intensity: Math.random() < 0.05 ? 0 : rng(5, 9), duration: 0.08 });
        this.flickerTimers[i] = 0; this.flickerNexts[i] = rng(0.5, 4.0);
      }
    });

    if (this.marqueeLight) {
      this.marqueeFlickerTimer += dt;
      // Aggressive fast flicker
      if (this.marqueeFlickerTimer > rng(0.05, 0.2)) {
        this.marqueeFlickerTimer = 0;
        this.marqueeLight.intensity = Math.random() > 0.3 ? rng(4, 8) : rng(0.5, 2);
      }
    }
  }

  private updateCameraSway(): void {
    const mx = this.deps.input.mouseParallax.x;
    const my = this.deps.input.mouseParallax.y;
    this.camera.position.x += (CAM_IDLE.pos.x + mx * 0.15 - this.camera.position.x) * 0.05;
    this.camera.position.y += (CAM_IDLE.pos.y + my * 0.15 - this.camera.position.y) * 0.05;
    this.camera.lookAt(CAM_IDLE.lookAt);
  }
}
