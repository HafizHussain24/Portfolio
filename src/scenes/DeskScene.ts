// ─────────────────────────────────────────────────────────────────────────────
//  DeskScene.ts  –  Phase 3: CHAPTER 1 — THE SUSPECT
//
//  Top-down detective desk view. Camera overhead showing all desk props.
//  Clicking the main dossier tilts camera to reading angle + opens HTML overlay.
//  Clicking outside closes overlay and returns camera to overhead.
//
//  Contents:
//   • Top-down overhead camera with entrance swoop
//   • Desk surface with wood grain
//   • Desk props: coffee mug, ring stain, pen, ashtray, polaroid, scattered papers
//   • Red evidence strings connecting papers (flat on desk)
//   • Amber desk lamp — light pool visible from above
//   • Paper hover lift + camera tilt interaction
//   • HTML overlay: case file dossier (identity, skills, associates, magnifying glass)
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import gsap       from 'gsap';
import { BaseScene }      from './BaseScene';
import type { SceneDeps } from '../core/SceneManager';
import { RetroRenderer }  from '../core/RetroRenderer';
import { IDENTITY, CONTACT } from '../content';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const rng = (min: number, max: number) => min + Math.random() * (max - min);

// ─── Camera states ────────────────────────────────────────────────────────────
const CAM_OVERHEAD = {
  pos:    new THREE.Vector3(0,  9.0, 2.0),
  target: new THREE.Vector3(0,  0.0, -0.5),
};
const CAM_READING = {
  pos:    new THREE.Vector3(0,  5.5, 5.5),
  target: new THREE.Vector3(0,  0.5, 0.0),
};

// ─────────────────────────────────────────────────────────────────────────────
export class DeskScene extends BaseScene {

  // ─── DOM ──────────────────────────────────────────────────────────────────
  private overlayEl!:  HTMLElement;
  private backdropEl!: HTMLElement;
  private lensEl!:     HTMLElement;
  private secretsEl!:  HTMLElement;
  private isOverOverlay  = false;
  private isLensVisible  = false;
  private onMouseMove!:    (e: MouseEvent) => void;
  private onOverlayEnter!: () => void;
  private onOverlayLeave!: () => void;
  private onSecretEnter!:  () => void;
  private onSecretLeave!:  () => void;
  private onCanvasClick!:  () => void;

  // ─── 3D groups ────────────────────────────────────────────────────────────
  private deskGroup = new THREE.Group();
  private roomGroup = new THREE.Group();
  private lampGroup = new THREE.Group();

  // ─── Interaction ──────────────────────────────────────────────────────────
  private raycaster      = new THREE.Raycaster();
  private mainPaper!:    THREE.Mesh;
  private interactables: THREE.Mesh[] = [];
  private isDossierOpen  = false;
  private isHoveringPaper = false;
  private coffeeMug!:    THREE.Mesh;
  private isHoveringCoffee = false;

  // ─── Lamp flicker ─────────────────────────────────────────────────────────
  private lampLight!:  THREE.PointLight;
  private lampBaseLum  = 100.0;
  private flickerTimer = 0;
  private flickerNext  = 0;
  private flickerDur   = 0;
  private flickerFrom  = 0;
  private flickerTo    = 0;

  // ════════════════════════════════════════════════════════════════════════════
  //  Lifecycle
  // ════════════════════════════════════════════════════════════════════════════

  async init(deps: SceneDeps): Promise<void> {
    await super.init(deps);

    this.scene.background = new THREE.Color(0x05040a);
    this.scene.fog = new THREE.FogExp2(0x0e0a06, 0.025);

    // Desk-scene-only ambient
    this.scene.add(new THREE.AmbientLight(0x776655, 12.0));

    // Start overhead
    this.camera.position.copy(CAM_OVERHEAD.pos);
    this.camera.lookAt(CAM_OVERHEAD.target);

    this.scene.add(this.roomGroup);
    this.scene.add(this.deskGroup);
    this.scene.add(this.lampGroup);

    this.buildRoom();
    this.buildDesk();
    this.buildLamp();
    this.buildNavDOM();
  }

  async enter(): Promise<void> {
    this.deps.audio.startRain(0.06);

    // Camera swoops down from high above
    this.camera.position.set(0, 18, 5);
    this.camera.lookAt(CAM_OVERHEAD.target);
    gsap.to(this.camera.position, {
      x: CAM_OVERHEAD.pos.x,
      y: CAM_OVERHEAD.pos.y,
      z: CAM_OVERHEAD.pos.z,
      duration: 1.8,
      ease: 'power3.out',
      onUpdate: () => this.camera.lookAt(CAM_OVERHEAD.target),
      onComplete: () => {
        // Open dossier after landing
        this.openDossier(true);
      },
    });

    window.addEventListener('mousemove', this.onMouseMove);
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    canvas?.addEventListener('click', this.onCanvasClick);
  }

  async exit(): Promise<void> {
    this.deps.audio.stopRain();
    this.isDossierOpen = false;
    this.backdropEl.style.pointerEvents = 'none';
    gsap.killTweensOf(this.overlayEl);
    gsap.killTweensOf(this.camera.position);
    gsap.to(this.overlayEl, { opacity: 0, duration: 0.25,
      onComplete: () => { this.overlayEl.style.display = 'none'; },
    });
    
    window.removeEventListener('mousemove', this.onMouseMove);
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    canvas?.removeEventListener('click', this.onCanvasClick);
    
    await new Promise<void>((r) => setTimeout(r, 280));
  }

  update(dt: number, time: number): void {
    this.updateLamp(dt, time);
    this.updateParallax();
    this.updateInteraction();
    this.updatePaperSway(time);
  }

  dispose(): void {
    this.teardownDOM();
    document.body.style.cursor = 'auto';
    super.dispose();
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Build: Room
  // ════════════════════════════════════════════════════════════════════════════

  private buildRoom(): void {
    const flat = (c: number, opts?: Partial<THREE.MeshLambertMaterialParameters>) =>
      RetroRenderer.makeFlatMaterial(c, opts);

    // Floor — dark wood, large to fill view from above
    const floorGeo = new THREE.PlaneGeometry(32, 24);
    const floor    = new THREE.Mesh(floorGeo, flat(0x0c0906));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.2;
    this.roomGroup.add(floor);
    this.track(floorGeo);

    // Subtle wood grain strips (visible from top-down)
    const grainMat = flat(0x090705, { transparent: true, opacity: 0.6 });
    this.track(grainMat);
    for (let i = -8; i <= 8; i += 2.2 + rng(0, 0.5)) {
      const gGeo = new THREE.PlaneGeometry(0.05, 24);
      const g    = new THREE.Mesh(gGeo, grainMat);
      g.rotation.x = -Math.PI / 2;
      g.position.set(i, -0.19, 0);
      this.roomGroup.add(g);
      this.track(gGeo);
    }

    // Back wall — partially visible at top of screen from overhead camera
    const wallGeo = new THREE.PlaneGeometry(32, 8);
    const wall    = new THREE.Mesh(wallGeo, flat(0x0e0b09));
    wall.position.set(0, 3.5, -7);
    this.roomGroup.add(wall);
    this.track(wallGeo);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Build: Desk + Props (designed for top-down view)
  // ════════════════════════════════════════════════════════════════════════════

  private buildDesk(): void {
    const flat = (c: number, opts?: Partial<THREE.MeshLambertMaterialParameters>) =>
      RetroRenderer.makeFlatMaterial(c, opts);

    // ── Desk surface ───────────────────────────────────────────────────────
    const deskGeo = new THREE.BoxGeometry(13, 0.22, 9);
    const desk    = new THREE.Mesh(deskGeo, flat(0x3a2214));
    desk.position.set(0, 0, 0);
    this.deskGroup.add(desk);
    this.track(deskGeo);

    // Desk rim / border
    const rimGeo = new THREE.BoxGeometry(13.3, 0.10, 9.3);
    const rim    = new THREE.Mesh(rimGeo, flat(0x110904));
    rim.position.set(0, -0.05, 0);
    this.deskGroup.add(rim);
    this.track(rimGeo);

    // ── Main dossier paper (CENTER, large, clickable) ─────────────────────
    const mainGeo = new THREE.PlaneGeometry(4.6, 6.2);
    const mainMat = flat(0xe8d9b5);
    this.mainPaper = new THREE.Mesh(mainGeo, mainMat);
    this.mainPaper.rotation.x = -Math.PI / 2;
    this.mainPaper.position.set(-0.2, 0.18, 0.4);
    this.deskGroup.add(this.mainPaper);
    this.interactables.push(this.mainPaper);
    this.track(mainGeo);
    this.track(mainMat);

    // Faint ruled lines on the paper (suggest text from above)
    const lineMat = flat(0xb8a870, { transparent: true, opacity: 0.08 });
    this.track(lineMat);
    for (let i = -4; i <= 4; i++) {
      const lGeo = new THREE.PlaneGeometry(3.8 - Math.abs(i) * 0.05, 0.035);
      const l    = new THREE.Mesh(lGeo, lineMat);
      l.position.set(rng(-0.1, 0.1), i * 0.55, 0.01);
      this.mainPaper.add(l);
      this.track(lGeo);
    }

    // Hover hint text line (shorter, near top of paper)
    const hintGeo = new THREE.PlaneGeometry(2.5, 0.06);
    const hintMat = flat(0xaa4422, { transparent: true, opacity: 0.45 });
    const hint    = new THREE.Mesh(hintGeo, hintMat);
    hint.position.set(0, 2.6, 0.01);
    this.mainPaper.add(hint);
    this.track(hintGeo);
    this.track(hintMat);

    // CLASSIFIED rubber stamp mark on paper
    const stampGeo = new THREE.PlaneGeometry(2.0, 0.42);
    const stampMat = flat(0xaa2020, { transparent: true, opacity: 0.55 });
    const stamp    = new THREE.Mesh(stampGeo, stampMat);
    stamp.rotation.z = 0.14;
    stamp.position.set(1.0, 1.2, 0.01);
    this.mainPaper.add(stamp);
    this.track(stampGeo);
    this.track(stampMat);

    // Corner push-pins on main paper
    const pinMat = flat(0xcc2222);
    const pinGeo = new THREE.SphereGeometry(0.07, 6, 4);
    this.track(pinGeo);
    this.track(pinMat);
    [[-2.1, 3.0], [1.9, 3.0], [-2.1, -2.8], [1.9, -2.8]].forEach(([ox, oy]) => {
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(ox, oy, 0.08);
      this.mainPaper.add(pin);
    });

    // ── Scattered secondary papers ─────────────────────────────────────────
    [
      { x: -4.4, z: -1.8, rot: -0.32, w: 2.2, h: 3.0, c: 0xd8c8a0 },
      { x:  4.3, z: -2.2, rot:  0.26, w: 2.0, h: 2.8, c: 0xddd0b0 },
      { x: -4.2, z:  2.8, rot:  0.12, w: 1.9, h: 2.6, c: 0xcfc0a0 },
      { x:  4.6, z:  2.0, rot: -0.18, w: 2.1, h: 2.8, c: 0xd5c5a5 },
      { x:  2.0, z: -3.5, rot:  0.48, w: 1.6, h: 2.1, c: 0xe0d0b0 },
    ].forEach(({ x, z, rot, w, h, c }) => {
      const pGeo = new THREE.PlaneGeometry(w, h);
      const pMat = flat(c, { transparent: true, opacity: 0.88 });
      const p    = new THREE.Mesh(pGeo, pMat);
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = rot;
      p.position.set(x, 0.12, z);
      this.deskGroup.add(p);
      this.interactables.push(p);
      this.track(pGeo);
      this.track(pMat);
    });


    // ── Coffee mug (circle from top) ───────────────────────────────────────
    const mugGeo = new THREE.CylinderGeometry(0.28, 0.24, 0.50, 10);
    const mug    = new THREE.Mesh(mugGeo, flat(0xe0d4c8));
    mug.position.set(3.5, 0.36, 0.5);
    this.deskGroup.add(mug);
    this.coffeeMug = mug;
    this.track(mugGeo);

    // Coffee surface (dark top)
    const cofGeo = new THREE.CircleGeometry(0.27, 10);
    const cofMat = flat(0x160a00);
    const cof    = new THREE.Mesh(cofGeo, cofMat);
    cof.rotation.x = -Math.PI / 2;
    cof.position.set(3.5, 0.555, 0.5);
    this.deskGroup.add(cof);
    this.track(cofGeo);
    this.track(cofMat);

    // Coffee ring stain on desk
    const stainGeo = new THREE.RingGeometry(0.30, 0.40, 16);
    const stainMat = flat(0x140902, { transparent: true, opacity: 0.45 });
    const stain    = new THREE.Mesh(stainGeo, stainMat);
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(3.2, 0.13, 0.9);
    this.deskGroup.add(stain);
    this.track(stainGeo);
    this.track(stainMat);

    // ── Pen ────────────────────────────────────────────────────────────────
    const penGeo = new THREE.CylinderGeometry(0.022, 0.018, 1.65, 6);
    const penMat = flat(0x111111);
    const pen    = new THREE.Mesh(penGeo, penMat);
    pen.rotation.z = Math.PI / 2;
    pen.rotation.y = 0.4;
    pen.position.set(2.6, 0.12, -1.8);
    this.deskGroup.add(pen);
    this.track(penGeo);
    this.track(penMat);

    // Pen cap highlight strip
    const capGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6);
    const capMat = flat(0x888888);
    const cap    = new THREE.Mesh(capGeo, capMat);
    cap.rotation.z = Math.PI / 2;
    cap.rotation.y = 0.4;
    cap.position.set(2.6 + Math.cos(0.4) * 0.62, 0.13, -1.8 - Math.sin(0.4) * 0.62);
    this.deskGroup.add(cap);
    this.track(capGeo);
    this.track(capMat);

    // ── Ashtray (glass torus) ─────────────────────────────────────
    const ashGeo = new THREE.TorusGeometry(0.35, 0.08, 12, 24);
    const ashMat = flat(0x8899aa, { transparent: true, opacity: 0.6 });
    const ash    = new THREE.Mesh(ashGeo, ashMat);
    ash.rotation.x = -Math.PI / 2;
    ash.position.set(-2.5, 0.15, -3.0);
    this.deskGroup.add(ash);
    this.track(ashGeo);
    this.track(ashMat);

    // Ashtray base
    const ashInGeo = new THREE.CircleGeometry(0.35, 24);
    const ashInMat = flat(0x222222);
    const ashIn    = new THREE.Mesh(ashInGeo, ashInMat);
    ashIn.rotation.x = -Math.PI / 2;
    ashIn.position.set(-2.5, 0.115, -3.0);
    this.deskGroup.add(ashIn);
    this.track(ashInGeo);
    this.track(ashInMat);

    // Cigarette stub in ashtray
    const cigGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.45, 5);
    const cigMat = flat(0xe8dcd0); // white paper
    const cig    = new THREE.Mesh(cigGeo, cigMat);
    cig.rotation.z = Math.PI / 2 - 0.15; // slightly tilted down
    cig.rotation.y = 0.5;
    cig.position.set(-2.2, 0.22, -2.8);
    this.deskGroup.add(cig);
    this.track(cigGeo);
    this.track(cigMat);

    // Filter tip (orange-brown)
    const filterGeo = new THREE.CylinderGeometry(0.023, 0.023, 0.15, 5);
    const filterMat = flat(0xc88a44);
    const filter = new THREE.Mesh(filterGeo, filterMat);
    filter.position.set(0, -0.15, 0);
    cig.add(filter);
    this.track(filterGeo);
    this.track(filterMat);

    // Cigarette glow
    const glowGeo = new THREE.SphereGeometry(0.025, 4, 4);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, 0.225, 0); // end of cigarette
    cig.add(glow);
    this.track(glowGeo);
    this.track(glowMat);

    // Smoke (simple wavy line)
    const smokeGeo = new THREE.BufferGeometry();
    const smokePts = [];
    for(let i = 0; i < 15; i++) {
      smokePts.push(new THREE.Vector3(Math.sin(i * 0.4) * 0.03, i * 0.08, 0));
    }
    smokeGeo.setFromPoints(smokePts);
    const smokeMat = new THREE.LineBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.25 });
    const smokeLine = new THREE.Line(smokeGeo, smokeMat);
    smokeLine.position.set(-1.95, 0.25, -2.65); // world pos at tip
    this.deskGroup.add(smokeLine);
    this.track(smokeGeo);
    this.track(smokeMat);

    // Animate smoke
    gsap.to(smokeLine.rotation, { y: Math.PI * 2, duration: 4, repeat: -1, ease: 'linear' });
    gsap.to(smokeLine.scale, { x: 1.3, y: 1.5, z: 1.3, duration: 2, yoyo: true, repeat: -1, ease: 'sine.inOut' });

    // ── Polaroid photo ─────────────────────────────────────────────────────
    const polGeo = new THREE.BoxGeometry(1.5, 0.04, 1.9);
    const polMat = flat(0xeee8d8);
    const pol    = new THREE.Mesh(polGeo, polMat);
    pol.position.set(3.6, 0.13, -3.0);
    pol.rotation.y = -0.28;
    this.deskGroup.add(pol);
    this.track(polGeo);
    this.track(polMat);

    // Polaroid image area
    const polImgGeo = new THREE.PlaneGeometry(1.05, 1.05);
    const polImgMat = flat(0x1a1816, { transparent: true, opacity: 0.85 });
    const polImg    = new THREE.Mesh(polImgGeo, polImgMat);
    polImg.rotation.x = -Math.PI / 2;
    polImg.rotation.z = -0.28;
    polImg.position.set(3.6, 0.165, -2.8);
    this.deskGroup.add(polImg);
    this.track(polImgGeo);
    this.track(polImgMat);
  }


  // ════════════════════════════════════════════════════════════════════════════
  //  Build: Lamp (top-down)
  // ════════════════════════════════════════════════════════════════════════════

  private buildLamp(): void {
    const flat = (c: number) => RetroRenderer.makeFlatMaterial(c);

    this.lampGroup.position.set(-5.2, 0, -3.2);

    // Lamp base (circle from top)
    const baseGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.10, 10);
    this.lampGroup.add(new THREE.Mesh(baseGeo, flat(0x1a1208)));
    this.track(baseGeo);

    // Stem
    const stemGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6);
    const stem    = new THREE.Mesh(stemGeo, flat(0x1e1e1e));
    stem.position.set(0, 1.25, 0);
    this.lampGroup.add(stem);
    this.track(stemGeo);

    // Shade — closed cone, from top we see the flat tip pointing up
    const shadeGeo = new THREE.ConeGeometry(0.58, 0.65, 10, 1, false);
    const shadeMat = RetroRenderer.makeFlatMaterial(0x7a7d80); // Gray metallic shade
    const shade    = new THREE.Mesh(shadeGeo, shadeMat);
    shade.position.set(0, 2.5, 0);
    // Default cone: tip at +Y, base at -Y. From top we see the tip (tip points up = good)
    this.lampGroup.add(shade);
    this.track(shadeGeo);
    this.track(shadeMat);

    // Glowing bulb disc just below shade opening
    const bulbGeo = new THREE.SphereGeometry(0.08, 6, 4);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffdd88 });
    const bulb    = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(0, 2.15, 0);
    this.lampGroup.add(bulb);
    this.track(bulbGeo);
    this.track(bulbMat);

    // Main amber pool light
    this.lampLight = new THREE.PointLight(0xffaa33, 100.0, 22);
    this.lampLight.position.set(0, 2.1, 0);
    this.lampGroup.add(this.lampLight);

    // Warm top-fill (desk-scene only)
    const fill = new THREE.PointLight(0xffeecc, 90.0, 25);
    fill.position.set(0, 6, 1);
    this.scene.add(fill);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Build: HTML Overlay (unchanged from previous version)
  // ════════════════════════════════════════════════════════════════════════════

  private buildNavDOM(): void {
    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'desk-overlay';
    this.overlayEl.style.display       = 'none';
    this.overlayEl.style.opacity       = '0';
    this.overlayEl.style.pointerEvents = 'none';
    this.overlayEl.setAttribute('aria-label', 'Case file dossier — About');

    this.backdropEl = document.createElement('div');
    this.backdropEl.id = 'desk-backdrop';
    this.backdropEl.style.pointerEvents = 'none';
    this.overlayEl.appendChild(this.backdropEl);

    const cardWrapper = document.createElement('div');
    cardWrapper.className = 'desk-card-wrapper';
    cardWrapper.innerHTML = this.buildDossierHTML();
    this.overlayEl.appendChild(cardWrapper);

    document.body.appendChild(this.overlayEl);

    this.lensEl = document.createElement('div');
    this.lensEl.id = 'magnify-lens';
    this.lensEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.lensEl);

    this.secretsEl = cardWrapper.querySelector('.secrets-zone')!;

    this.onMouseMove = (e: MouseEvent) => {
      this.lensEl.style.left = `${e.clientX}px`;
      this.lensEl.style.top  = `${e.clientY}px`;
    };

    this.onSecretEnter = () => {
      this.isLensVisible = true;
      this.lensEl.classList.add('visible');
      this.deps.audio.playHover();
    };

    this.onSecretLeave = () => {
      this.isLensVisible = false;
      this.lensEl.classList.remove('visible');
    };

    this.onOverlayEnter = () => { this.isOverOverlay = true; };
    this.onOverlayLeave = () => { this.isOverOverlay = false; };

    this.secretsEl?.addEventListener('mouseenter', this.onSecretEnter);
    this.secretsEl?.addEventListener('mouseleave',  this.onSecretLeave);
    cardWrapper.addEventListener('mouseenter', this.onOverlayEnter);
    cardWrapper.addEventListener('mouseleave', this.onOverlayLeave);

    // Backdrop click = put paper down
    this.backdropEl.addEventListener('click', () => this.closeDossier());

    // Canvas click = pick up paper
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.onCanvasClick = () => {
      if (this.isDossierOpen) return;
      const m = this.deps.input.mouse;
      this.raycaster.setFromCamera(new THREE.Vector2(m.x, m.y), this.camera);
      
      const coffeeHits = this.raycaster.intersectObject(this.coffeeMug, false);
      if (coffeeHits.length > 0) {
        this.deps.audio.playClick();
        if ((window as any).gameNotepad) {
          (window as any).gameNotepad.completeQuest('coffee');
        }
        return;
      }

      const hits = this.raycaster.intersectObjects(this.interactables, false);
      if (hits.length > 0) this.openDossier();
    };
  }

  private buildDossierHTML(): string {
    const skillTags = IDENTITY.skills.map(s =>
      `<span class="skill-tag">${s}</span>`
    ).join('');

    const associates = IDENTITY.associates.map(a =>
      `<span class="associate-tag">${a}</span>`
    ).join('');

    const secretLines = IDENTITY.secrets.map(s =>
      `<div class="secret-line">${s}</div>`
    ).join('');

    const socialLinks = [
      { href: CONTACT.github,   label: 'GITHUB',   icon: '⬡' },
      { href: CONTACT.linkedin, label: 'LINKEDIN',  icon: '⬡' },
      { href: CONTACT.twitter,  label: 'TWITTER',   icon: '⬡' },
    ].filter(l => l.href && l.href.length > 8)
     .map(l => `<a class="social-link" href="${l.href}" target="_blank" rel="noopener">${l.icon} ${l.label}</a>`)
     .join('');

    return `
      <div class="dossier-card" role="main" aria-label="Personal dossier">
        <div class="dossier-stamp" aria-hidden="true">CLASSIFIED</div>

        <header class="dossier-header">
          <div class="case-no">CASE FILE № 001 — ACTIVE</div>
          <h1 class="dossier-name">${IDENTITY.name}</h1>
          <div class="dossier-alias">a.k.a. ${IDENTITY.alias}</div>
          <div class="dossier-divider" aria-hidden="true"></div>
          <div class="dossier-role">${IDENTITY.role}</div>
          <div class="dossier-location">⬡ ${IDENTITY.location} &nbsp;·&nbsp; ${IDENTITY.availability}</div>
        </header>

        <section class="dossier-bio" aria-label="Biography">
          <div class="section-label">FIELD REPORT</div>
          ${IDENTITY.bio.map(b => `<p class="bio-line">${b}</p>`).join('')}
        </section>

        <section class="dossier-skills" aria-label="Skills">
          <div class="section-label">KNOWN CAPABILITIES</div>
          <div class="tags-row">${skillTags}</div>
        </section>

        <section class="dossier-associates" aria-label="Known associates">
          <div class="section-label">KNOWN ASSOCIATES</div>
          <div class="tags-row">${associates}</div>
        </section>

        <section class="secrets-zone" aria-label="Classified information — hover to reveal" tabindex="0" role="button">
          <div class="section-label secrets-label">
            <span class="blink-dot" aria-hidden="true">▮</span>
            CLASSIFIED — HOVER TO REVEAL
          </div>
          <div class="secrets-content">
            ${secretLines}
          </div>
        </section>

        <footer class="dossier-footer">
          <div class="close-hint" aria-hidden="true">[ CLICK OUTSIDE TO PUT DOWN ]</div>
          <div class="social-row">${socialLinks}</div>
        </footer>
      </div>
    `;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  DOM teardown
  // ════════════════════════════════════════════════════════════════════════════

  private teardownDOM(): void {
    this.secretsEl?.removeEventListener('mouseenter', this.onSecretEnter);
    this.secretsEl?.removeEventListener('mouseleave',  this.onSecretLeave);
    
    window.removeEventListener('mousemove', this.onMouseMove);
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    canvas?.removeEventListener('click', this.onCanvasClick);
    
    this.overlayEl?.remove();
    this.lensEl?.remove();
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Open / Close dossier
  // ════════════════════════════════════════════════════════════════════════════

  private openDossier(isInitial = false): void {
    if (this.isDossierOpen && !isInitial) return;
    this.isDossierOpen = true;
    if (!isInitial) this.deps.audio.playHover();

    this.backdropEl.style.pointerEvents = 'auto';

    const dur = isInitial ? 0.8 : 1.0;

    // Tilt camera from overhead to reading angle
    gsap.killTweensOf(this.camera.position);
    gsap.to(this.camera.position, {
      x: CAM_READING.pos.x,
      y: CAM_READING.pos.y,
      z: CAM_READING.pos.z,
      duration: dur,
      ease: 'power2.inOut',
      onUpdate: () => this.camera.lookAt(CAM_READING.target),
    });

    // Paper lifts up toward camera and tilts
    gsap.killTweensOf(this.mainPaper.position);
    gsap.killTweensOf(this.mainPaper.rotation);
    // Camera is at Y=5.5, Z=5.5, target is Y=0.5, Z=0.0
    // We lift paper to a moderate height so it matches overlay size perfectly
    gsap.to(this.mainPaper.position, { y: 1.5, z: 1.5, duration: dur, ease: 'power2.inOut' });
    gsap.to(this.mainPaper.rotation, { x: -Math.PI / 4, duration: dur, ease: 'power2.inOut' });

    // HTML overlay fades in after camera settles
    gsap.killTweensOf(this.overlayEl);
    gsap.to(this.overlayEl, {
      opacity: 1,
      duration: 0.45,
      delay: dur * 0.55,
      ease: 'power2.out',
      onStart: () => { 
        this.overlayEl.style.display = 'flex'; 
        // Mask the CRT filter over the exact area of the paper UI
        const w = Math.min(640, window.innerWidth * 0.88) / window.innerWidth;
        const h = 0.88;
        const x = (1.0 - w) / 2;
        const y = (1.0 - h) / 2;
        this.deps.renderer.setCRTMask(1.0, {x, y, w, h});
      },
    });
  }

  private closeDossier(): void {
    if (!this.isDossierOpen) return;
    this.isDossierOpen = false;
    this.deps.audio.playHover();

    this.backdropEl.style.pointerEvents = 'none';

    // Fade overlay out first
    gsap.killTweensOf(this.overlayEl);
    gsap.to(this.overlayEl, {
      opacity: 0,
      duration: 0.3,
      ease: 'power2.in',
      onStart: () => {
        this.deps.renderer.setCRTMask(0.0);
      },
      onComplete: () => { this.overlayEl.style.display = 'none'; },
    });

    // Tilt camera back to overhead
    gsap.killTweensOf(this.camera.position);
    gsap.to(this.camera.position, {
      x: CAM_OVERHEAD.pos.x,
      y: CAM_OVERHEAD.pos.y,
      z: CAM_OVERHEAD.pos.z,
      duration: 0.9,
      delay: 0.15,
      ease: 'power2.inOut',
      onUpdate: () => this.camera.lookAt(CAM_OVERHEAD.target),
    });

    // Paper floats back down
    gsap.killTweensOf(this.mainPaper.position);
    gsap.killTweensOf(this.mainPaper.rotation);
    gsap.to(this.mainPaper.position, { y: 0.18, z: 0.4, duration: 0.6, delay: 0.1, ease: 'power2.inOut' });
    gsap.to(this.mainPaper.rotation, { x: -Math.PI / 2, duration: 0.6, delay: 0.1, ease: 'power2.inOut' });

    document.body.style.cursor = 'auto';
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Per-frame updates
  // ════════════════════════════════════════════════════════════════════════════

  private updateInteraction(): void {
    if (this.isDossierOpen) return;
    if (this.deps.input.mouse.x === 0 && this.deps.input.mouse.y === 0) return;

    const m = this.deps.input.mouse;
    this.raycaster.setFromCamera(new THREE.Vector2(m.x, m.y), this.camera);
    const hits = this.raycaster.intersectObjects(this.interactables, false);
    const coffeeHits = this.raycaster.intersectObject(this.coffeeMug, false);

    const nowHovering = hits.length > 0;
    const nowHoveringCoffee = coffeeHits.length > 0;
    const onMainPaper = nowHovering && hits[0].object === this.mainPaper;

    if (nowHoveringCoffee !== this.isHoveringCoffee) {
      this.isHoveringCoffee = nowHoveringCoffee;
    }

    if (nowHovering !== this.isHoveringPaper) {
      this.isHoveringPaper = nowHovering;

      // Lift/drop main paper on hover
      if (onMainPaper || (!nowHovering)) {
        gsap.killTweensOf(this.mainPaper.position);
        gsap.to(this.mainPaper.position, {
          y: nowHovering ? 0.38 : 0.18,
          duration: 0.35,
          ease: nowHovering ? 'power2.out' : 'power2.inOut',
        });
      }
    }
    document.body.style.cursor = (this.isHoveringPaper || this.isHoveringCoffee) ? 'pointer' : 'auto';
  }

  private updateLamp(dt: number, _time: number): void {
    this.flickerTimer += dt;
    if (this.flickerTimer >= this.flickerNext) {
      this.flickerFrom = this.lampLight.intensity;
      this.flickerTo   = this.lampBaseLum + rng(-28.0, 28.0);
      this.flickerDur  = rng(0.04, 0.16);
      this.flickerNext = this.flickerTimer + rng(0.12, 2.8);
    }
    const progress = Math.min(1, this.flickerTimer / Math.max(this.flickerDur, 0.001));
    const lerped   = this.flickerFrom + (this.flickerTo - this.flickerFrom) * progress;
    this.lampLight.intensity = Math.max(22.0, lerped);
  }

  private updateParallax(): void {
    if (this.isDossierOpen || this.isOverOverlay) return;
    const px = this.deps.input.mouseParallax.x;
    const py = this.deps.input.mouseParallax.y;
    // Subtle desk drift from overhead perspective
    this.deskGroup.position.x =  px * 0.12;
    this.deskGroup.position.z = -py * 0.08;
  }

  private updatePaperSway(time: number): void {
    if (this.isDossierOpen) return;
    // Extremely subtle sway as if caught in a slight draft
    this.mainPaper.rotation.z = Math.sin(time * 0.35) * 0.006;
    this.mainPaper.rotation.x = -Math.PI / 2 + Math.cos(time * 0.25) * 0.004;
  }
}
