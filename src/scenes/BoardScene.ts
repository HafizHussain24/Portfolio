// ─────────────────────────────────────────────────────────────────────────────
//  BoardScene.ts  –  Phase 4: CHAPTER 2 — THE EVIDENCE
//
//  An old detective's cork board mounted on a dimly-lit wall.
//  Each project is a "case file card" pinned with push-pins,
//  connected by red evidence strings. Clicking a card zooms the
//  camera in and opens a full HTML overlay with project details.
//
//  Contents:
//   • Wall + cork board surface (3D)
//   • Amber overhead lamp with volumetric cone
//   • Project cards (flat meshes) with coloured labels
//   • Red string connections drawn as tube curves
//   • Push-pin spheres at card corners
//   • Polaroid-style image thumbnails
//   • Floating paper scraps and sticky notes
//   • Camera: starts at wide shot, zooms to card on click
//   • HTML overlay: project detail panel (title, blurb, tags, links)
//   • Subtle idle camera sway
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import gsap       from 'gsap';
import { BaseScene }      from './BaseScene';
import type { SceneDeps } from '../core/SceneManager';
import { RetroRenderer }  from '../core/RetroRenderer';
import { PROJECTS, WORLD } from '../content';
import type { Project }   from '../content';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const rng  = (min: number, max: number) => min + Math.random() * (max - min);
const flat = (c: number | THREE.Color, opts?: Partial<THREE.MeshLambertMaterialParameters>) =>
  RetroRenderer.makeFlatMaterial(c instanceof THREE.Color ? c : c, opts);

// ─── Card layout positions on the board (local to board plane, centred) ──────
// boardPos in content.ts is [0..1, 0..1].  Map to board local coords:
//   board is 14 wide × 8.5 tall, centred at origin of boardGroup
const BOARD_W = 14.0;
const BOARD_H =  8.5;

function cardLocalPos(bp: [number, number]): THREE.Vector3 {
  return new THREE.Vector3(
    (bp[0] - 0.5) * BOARD_W,
    (0.5 - bp[1]) * BOARD_H,
    0.06,  // slightly in front of board surface
  );
}

// ─── String connection pairs [fromIndex, toIndex] ────────────────────────────
const STRING_PAIRS: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
  [1, 2],
  [3, 5],
  [4, 5],
];

// ─── Camera states ─────────────────────────────────────────────────────────────
const CAM_WIDE = {
  pos: new THREE.Vector3(0, 0.5, 12),
  lookAt: new THREE.Vector3(0, 0, 0),
};

// ─────────────────────────────────────────────────────────────────────────────
export class BoardScene extends BaseScene {

  // ─── DOM ──────────────────────────────────────────────────────────────────
  private overlayEl!: HTMLElement;
  private backdropEl!: HTMLElement;
  private closeBtn!: HTMLButtonElement;

  // ─── 3D groups ────────────────────────────────────────────────────────────
  private boardGroup  = new THREE.Group();
  private cardsGroup  = new THREE.Group();
  private stringsGroup = new THREE.Group();
  private propsGroup  = new THREE.Group();

  // ─── Interaction ──────────────────────────────────────────────────────────
  private raycaster    = new THREE.Raycaster();
  private cardMeshes: THREE.Mesh[]   = [];   // one per project
  private cardProjects: Project[]    = [];   // parallel to cardMeshes
  private cardPositions: THREE.Vector3[] = [];
  private selectedCard: number | null = null;
  private isDetailOpen = false;

  // Quest
  private secretFolder!: THREE.Mesh;
  private isHoveringFolder = false;

  // ─── Lamp ─────────────────────────────────────────────────────────────────
  private lampLight!: THREE.SpotLight;
  private lampTarget = new THREE.Object3D();
  private flickerTimer = 0;
  private flickerNext  = 0;
  private flickerBase  = 35.0;

  // ─── Camera sway ──────────────────────────────────────────────────────────
  private swayEnabled = true;

  // ─── Event handlers (stored for removal) ─────────────────────────────────
  private onClickHandler!: (e: MouseEvent) => void;
  private onMoveHandler!:  (e: MouseEvent) => void;
  private _escHandler!:    (e: KeyboardEvent) => void;

  // ════════════════════════════════════════════════════════════════════════════
  //  Lifecycle
  // ════════════════════════════════════════════════════════════════════════════

  async init(deps: SceneDeps): Promise<void> {
    await super.init(deps);

    // Scene background — near-black with warm brown tint
    this.scene.background = new THREE.Color(0x0a0705);
    this.scene.fog = new THREE.FogExp2(0x0a0705, 0.028);

    // Camera setup
    this.camera.position.copy(CAM_WIDE.pos);
    this.camera.lookAt(CAM_WIDE.lookAt);
    this.camera.fov = 52;
    this.camera.updateProjectionMatrix();

    // Add groups
    this.scene.add(this.boardGroup);
    this.scene.add(this.cardsGroup);
    this.scene.add(this.stringsGroup);
    this.scene.add(this.propsGroup);
    this.scene.add(this.lampTarget);

    this.buildLights();
    this.buildRoom();
    this.buildBoard();
    this.buildCards();
    this.buildSecretFolder();
    this.buildStrings();
    this.buildProps();
    this.buildOverlayDOM();
    this.wireEvents();
  }

  async enter(): Promise<void> {
    this.overlayEl.style.display = 'none';
    this.isDetailOpen = false;
    this.selectedCard = null;
    this.swayEnabled = true;

    this.deps.audio.startRain(0.05);

    // Camera fly-in from slightly above/back
    if (!this.deps.input.reducedMotion) {
      this.camera.position.set(0, 3, 18);
      this.camera.lookAt(CAM_WIDE.lookAt);
      gsap.to(this.camera.position, {
        x: CAM_WIDE.pos.x,
        y: CAM_WIDE.pos.y,
        z: CAM_WIDE.pos.z,
        duration: 1.6,
        ease: 'power3.out',
        onUpdate: () => this.camera.lookAt(CAM_WIDE.lookAt),
      });
    } else {
      this.camera.position.copy(CAM_WIDE.pos);
      this.camera.lookAt(CAM_WIDE.lookAt);
    }

    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    canvas?.addEventListener('click', this.onClickHandler);
    canvas?.addEventListener('mousemove', this.onMoveHandler);
    window.addEventListener('keydown', this._escHandler);
  }

  async exit(): Promise<void> {
    this.deps.audio.stopRain();
    this.closeDetail(false);
    gsap.killTweensOf(this.camera.position);

    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    canvas?.removeEventListener('click', this.onClickHandler);
    canvas?.removeEventListener('mousemove', this.onMoveHandler);
    window.removeEventListener('keydown', this._escHandler);
    document.body.style.cursor = 'auto';
  }

  update(dt: number, time: number): void {
    this.deps.input.update(0.05);
    this.updateFlicker(dt);
    this.updateCameraSway(time);
    this.updateCardHover();
  }

  dispose(): void {
    this.teardownEvents();
    this.overlayEl?.remove();
    super.dispose();
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Build: Lights
  // ════════════════════════════════════════════════════════════════════════════

  private buildLights(): void {
    // Ambient — very dim warm (increased brightness)
    this.scene.add(new THREE.AmbientLight(0x201510, 32.0));

    // Cool backfill from the sides
    const sideL = new THREE.DirectionalLight(0x223366, 12.0);
    sideL.position.set(-8, 4, 3);
    this.scene.add(sideL);

    const sideR = new THREE.DirectionalLight(0x332244, 8.0);
    sideR.position.set(8, 4, 3);
    this.scene.add(sideR);

    // Main overhead lamp — spotlight aimed at board centre
    this.lampTarget.position.set(0, 0, -1);
    this.scene.add(this.lampTarget);
    this.lampLight = new THREE.SpotLight(0xffcc66, this.flickerBase, 30, Math.PI / 4.5, 0.55, 1.2);
    this.lampLight.position.set(0, 9, 4);
    this.lampLight.target = this.lampTarget;
    this.scene.add(this.lampLight);

    // Accent rim from accent colour
    const rim = new THREE.PointLight(WORLD.accentColorHex, 4.0, 20);
    rim.position.set(0, 2, 8);
    this.scene.add(rim);

    // Schedule first flicker
    this.flickerNext = rng(2, 6);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Build: Room (wall + floor)
  // ════════════════════════════════════════════════════════════════════════════

  private buildRoom(): void {
    // Back wall — dark warm grey brick texture approximation via flat material
    const wallGeo = new THREE.PlaneGeometry(28, 18);
    const wallMat = flat(0x1a1208);
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 0, -2.5);
    this.propsGroup.add(wall);
    this.track(wallGeo);

    // Subtle horizontal mortar lines (brickwork feel)
    const mortarMat = flat(0x130e06, { transparent: true, opacity: 0.5 });
    this.track(mortarMat);
    for (let y = -8; y <= 8; y += 0.7) {
      const mg = new THREE.PlaneGeometry(28, 0.04);
      const mm = new THREE.Mesh(mg, mortarMat);
      mm.position.set(0, y, -2.45);
      this.propsGroup.add(mm);
      this.track(mg);
    }

    // Floor — worn dark wood
    const floorGeo = new THREE.PlaneGeometry(28, 16);
    const floor = new THREE.Mesh(floorGeo, flat(0x0e0906));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -5.5, 0);
    this.propsGroup.add(floor);
    this.track(floorGeo);

    // Lamp fixture mount on wall
    const mountGeo = new THREE.BoxGeometry(0.25, 0.12, 0.4);
    const mount    = new THREE.Mesh(mountGeo, flat(0x1a1a1a));
    mount.position.set(0, 9.1, 2.5);
    this.propsGroup.add(mount);
    this.track(mountGeo);

    // Lamp cord (thin cylinder going to lamp)
    const cordGeo = new THREE.CylinderGeometry(0.015, 0.015, 5.5, 4);
    const cord    = new THREE.Mesh(cordGeo, flat(0x111111));
    cord.position.set(0, 6.5, 3.5);
    this.propsGroup.add(cord);
    this.track(cordGeo);

    // Lamp shade
    const shadeGeo = new THREE.ConeGeometry(0.9, 0.7, 8, 1, true);
    const shadeMat = flat(0x2a2010, { side: THREE.DoubleSide });
    const shade    = new THREE.Mesh(shadeGeo, shadeMat);
    shade.rotation.x = Math.PI; // open end faces down
    shade.position.set(0, 4.0, 3.5);
    this.propsGroup.add(shade);
    this.track(shadeGeo);
    this.track(shadeMat);

    // Lamp bulb glow
    const bulbGeo = new THREE.SphereGeometry(0.12, 6, 4);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffeeaa });
    const bulb    = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(0, 3.7, 3.5);
    this.propsGroup.add(bulb);
    this.track(bulbGeo);
    this.track(bulbMat);

    // Lamp shadow cone (dark volumetric cone below shade for atmosphere)
    const coneGeo = new THREE.ConeGeometry(3.5, 8, 8, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.018,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const lightCone = new THREE.Mesh(coneGeo, coneMat);
    lightCone.position.set(0, -0.2, 1.2);
    lightCone.rotation.x = Math.PI;
    this.propsGroup.add(lightCone);
    this.track(coneGeo);
    this.track(coneMat);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Build: Cork Board
  // ════════════════════════════════════════════════════════════════════════════

  private buildBoard(): void {
    // Wooden outer frame (even lighter)
    const frameMat = flat(0x8b5a2b);

    // Top/bottom bars
    [BOARD_H / 2 + 0.35, -BOARD_H / 2 - 0.35].forEach((y) => {
      const g = new THREE.BoxGeometry(BOARD_W + 1.2, 0.65, 0.28);
      const m = new THREE.Mesh(g, frameMat);
      m.position.set(0, y, -0.1);
      this.boardGroup.add(m);
      this.track(g);
    });
    // Left/right bars
    [-BOARD_W / 2 - 0.35, BOARD_W / 2 + 0.35].forEach((x) => {
      const g = new THREE.BoxGeometry(0.65, BOARD_H + 1.2, 0.28);
      const m = new THREE.Mesh(g, frameMat);
      m.position.set(x, 0, -0.1);
      this.boardGroup.add(m);
      this.track(g);
    });
    this.track(frameMat);

    // Cork surface — even lighter warm tan
    const corkGeo = new THREE.BoxGeometry(BOARD_W, BOARD_H, 0.18);
    const corkMat = flat(0xd2b48c);
    const cork    = new THREE.Mesh(corkGeo, corkMat);
    cork.position.z = -0.04;
    this.boardGroup.add(cork);
    this.track(corkGeo);
    this.track(corkMat);

    // Cork grain overlay strips (slight texture illusion)
    const grainMat = flat(0xc19a6b, { transparent: true, opacity: 0.22 });
    this.track(grainMat);
    for (let i = -6; i <= 6; i += 0.6 + rng(0, 0.3)) {
      const gGeo = new THREE.PlaneGeometry(BOARD_W, 0.07 + rng(0, 0.06));
      const g    = new THREE.Mesh(gGeo, grainMat);
      g.position.set(rng(-0.5, 0.5), i + rng(-0.1, 0.1), 0.04);
      this.boardGroup.add(g);
      this.track(gGeo);
    }

    // Aged darkening at edges (vignette plane overlay)
    const vigGeo = new THREE.PlaneGeometry(BOARD_W, BOARD_H);
    const vigMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    const vig = new THREE.Mesh(vigGeo, vigMat);
    vig.position.z = 0.05;
    this.boardGroup.add(vig);
    this.track(vigGeo);
    this.track(vigMat);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Build: Project Cards
  // ════════════════════════════════════════════════════════════════════════════

  private buildCards(): void {
    PROJECTS.forEach((proj, i) => {
      const bp = proj.boardPos ?? [0.5, 0.5] as [number, number];
      const localPos = cardLocalPos(bp as [number, number]);
      this.cardPositions.push(localPos.clone());

      const cardGroup = new THREE.Group();
      cardGroup.position.copy(localPos);

      // Slight random tilt
      const rotZ = rng(-0.12, 0.12);
      cardGroup.rotation.z = rotZ;
      cardGroup.userData = { origRotZ: rotZ, origZ: localPos.z };

      // Card backing (cream index card, or special gold for Kochi Metro)
      const cardW = 2.55;
      const cardH = 1.75;
      const isFeatured = proj.id === 'proj-01'; // Kochi Metro
      
      const cardGeo = new THREE.PlaneGeometry(cardW, cardH);
      const cardMat = flat(isFeatured ? 0xffea99 : 0xe8dcc8);
      const cardMesh = new THREE.Mesh(cardGeo, cardMat);
      cardMesh.userData = { projectIndex: i };
      cardGroup.add(cardMesh);
      this.track(cardGeo);
      this.track(cardMat);

      // Add a special "STAR" or shiny badge for the featured project
      if (isFeatured) {
        const starGeo = new THREE.CircleGeometry(0.18, 6); // Hexagon star
        const starMat = flat(0xffaa00);
        const starMesh = new THREE.Mesh(starGeo, starMat);
        starMesh.position.set(-cardW / 2 + 0.35, cardH / 2 - 0.45, 0.008);
        cardGroup.add(starMesh);
        this.track(starGeo);
        this.track(starMat);
      }

      // Card shadow beneath
      const shadowGeo = new THREE.PlaneGeometry(cardW + 0.1, cardH + 0.08);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.30,
        depthWrite: false,
      });
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.position.set(0.06, -0.06, -0.02);
      cardGroup.add(shadow);
      this.track(shadowGeo);
      this.track(shadowMat);

      // Top colour stripe (category indicator)
      const stripeColor = proj.isGameProject ? 0xffb347 : WORLD.accentColorHex;
      const stripeGeo = new THREE.PlaneGeometry(cardW, 0.28);
      const stripeMat = flat(stripeColor, { transparent: true, opacity: 0.85 });
      const stripe    = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(0, cardH / 2 - 0.14, 0.005);
      cardGroup.add(stripe);
      this.track(stripeGeo);
      this.track(stripeMat);

      const fakeTextGroup = new THREE.Group();
      fakeTextGroup.name = 'fakeText';
      cardGroup.add(fakeTextGroup);

      // Lines representing title text (thick bar)
      const titleBarGeo = new THREE.PlaneGeometry(cardW * 0.82, 0.1);
      const titleBarMat = flat(0x2a1a0a, { transparent: true, opacity: 0.8 });
      const titleBar    = new THREE.Mesh(titleBarGeo, titleBarMat);
      titleBar.position.set(-0.05, cardH / 2 - 0.55, 0.005);
      fakeTextGroup.add(titleBar);
      this.track(titleBarGeo);
      this.track(titleBarMat);

      // Lines representing body text (thin bars)
      [0.0, 0.18, 0.36].forEach((offset, li) => {
        const w = cardW * [0.78, 0.68, 0.55][li];
        const lineGeo = new THREE.PlaneGeometry(w, 0.04);
        const lineMat = flat(0x4a3520, { transparent: true, opacity: 0.35 });
        const line    = new THREE.Mesh(lineGeo, lineMat);
        line.position.set(-(cardW * 0.5 - w * 0.5 - 0.18), cardH / 2 - 0.92 - offset, 0.005);
        fakeTextGroup.add(line);
        this.track(lineGeo);
        this.track(lineMat);
      });

      // Tag blobs (small coloured rects)
      const tagColor = proj.isGameProject ? 0xc8860a : 0x006080;
      [0, 1, 2].slice(0, Math.min(3, proj.tags.length)).forEach((ti) => {
        const tgGeo = new THREE.PlaneGeometry(0.55 + rng(0, 0.2), 0.1);
        const tgMat = flat(tagColor, { transparent: true, opacity: 0.5 });
        const tg    = new THREE.Mesh(tgGeo, tgMat);
        tg.position.set(-0.55 + ti * 0.7, -cardH / 2 + 0.26, 0.005);
        cardGroup.add(tg);
        this.track(tgGeo);
        this.track(tgMat);
      });

      // CLASSIFIED / CASE FILE badge
      const badgeGeo = new THREE.PlaneGeometry(0.7, 0.12);
      const badgeMat = flat(0x8b0000, { transparent: true, opacity: 0.65 });
      const badge    = new THREE.Mesh(badgeGeo, badgeMat);
      badge.position.set(cardW / 2 - 0.40, -cardH / 2 + 0.1, 0.006);
      badge.rotation.z = -0.08;
      cardGroup.add(badge);
      this.track(badgeGeo);
      this.track(badgeMat);

      // Push pins at top corners
      const pinMat = flat(proj.isGameProject ? 0xdd6600 : 0xcc1111);
      const pinGeo = new THREE.SphereGeometry(0.065, 6, 4);
      this.track(pinGeo);
      this.track(pinMat);
      [[-cardW / 2 + 0.18, cardH / 2 - 0.12], [cardW / 2 - 0.18, cardH / 2 - 0.12]].forEach(([px, py]) => {
        const pin = new THREE.Mesh(pinGeo, pinMat);
        pin.position.set(px, py, 0.075);
        cardGroup.add(pin);
      });

      // Store the card mesh (backing) for raycasting
      this.cardMeshes.push(cardMesh);
      this.cardProjects.push(proj);

      this.cardsGroup.add(cardGroup);
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Build: Top Secret Folder (Quest item)
  // ════════════════════════════════════════════════════════════════════════════
  
  private buildSecretFolder(): void {
    // Placed in the middle left between the two left cards
    const fw = 1.9;
    const fh = 1.4;
    const folderGeo = new THREE.PlaneGeometry(fw, fh);
    const folderMat = flat(0xb89060); // manila folder color
    this.secretFolder = new THREE.Mesh(folderGeo, folderMat);
    this.secretFolder.position.set(-5.6, 0.0, 0.08); // Middle left
    this.secretFolder.rotation.z = -0.2;
    
    // Top-secret red stamp
    const stampGeo = new THREE.PlaneGeometry(1.3, 0.3);
    const stampMat = flat(0xcc1111, { transparent: true, opacity: 0.8 });
    const stamp = new THREE.Mesh(stampGeo, stampMat);
    stamp.position.set(0, 0, 0.01);
    stamp.rotation.z = 0.2;
    this.secretFolder.add(stamp);
    
    // Pin
    const pinMat = flat(0x222222);
    const pinGeo = new THREE.SphereGeometry(0.04, 6, 4);
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.position.set(0, fh / 2 - 0.12, 0.05);
    this.secretFolder.add(pin);

    this.boardGroup.add(this.secretFolder);
    this.track(folderGeo);
    this.track(folderMat);
    this.track(stampGeo);
    this.track(stampMat);
    this.track(pinGeo);
    this.track(pinMat);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Build: Red Evidence Strings
  // ════════════════════════════════════════════════════════════════════════════

  private buildStrings(): void {
    const stringMat = new THREE.MeshBasicMaterial({
      color: 0xcc2020,
      transparent: true,
      opacity: 0.75,
    });
    this.track(stringMat);

    STRING_PAIRS.forEach(([a, b]) => {
      if (a >= this.cardPositions.length || b >= this.cardPositions.length) return;

      const start = this.cardPositions[a].clone();
      const end   = this.cardPositions[b].clone();
      start.z = 0.12;
      end.z   = 0.12;

      // Catenary sag — midpoint pulled down
      const mid = start.clone().add(end).multiplyScalar(0.5);
      mid.y -= rng(0.15, 0.45);
      mid.z = 0.12;

      // Build a smooth curve with CatmullRom
      const curve = new THREE.CatmullRomCurve3([start, mid, end]);
      const points = curve.getPoints(28);
      const tubeGeo = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        28, 0.012, 4, false,
      );
      const tube = new THREE.Mesh(tubeGeo, stringMat);
      this.stringsGroup.add(tube);
      this.track(tubeGeo);

      // Anchor tack at start + end
      const tackMat = flat(0xddaa44);
      const tackGeo = new THREE.SphereGeometry(0.04, 5, 4);
      this.track(tackGeo);
      this.track(tackMat);
      [start, end].forEach((pt) => {
        const tack = new THREE.Mesh(tackGeo, tackMat);
        tack.position.copy(pt);
        this.stringsGroup.add(tack);
      });
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Build: Atmosphere Props
  // ════════════════════════════════════════════════════════════════════════════

  private buildProps(): void {
    // Sticky notes scattered around board edges
    const noteColors = [0xe8d44d, 0xf0a060, 0xa0c870];
    [
      { x: -5.5, y:  2.8, rot: 0.18, c: noteColors[0] },
      { x:  5.0, y:  3.0, rot: -0.14, c: noteColors[1] },
      { x: -4.8, y: -2.6, rot: 0.22, c: noteColors[2] },
      { x:  4.6, y: -2.0, rot: -0.10, c: noteColors[0] },
    ].forEach(({ x, y, rot, c }) => {
      const ng  = new THREE.PlaneGeometry(0.90, 0.80);
      const nm  = flat(c, { transparent: true, opacity: 0.82 });
      const n   = new THREE.Mesh(ng, nm);
      n.position.set(x, y, 0.08);
      n.rotation.z = rot;
      this.boardGroup.add(n);
      this.track(ng);
      this.track(nm);

      // Lines on note
      const lm = flat(0x2a2010, { transparent: true, opacity: 0.25 });
      this.track(lm);
      [0.1, -0.05, -0.2].forEach((ly) => {
        const lg = new THREE.PlaneGeometry(0.68, 0.035);
        const l  = new THREE.Mesh(lg, lm);
        l.position.set(0, ly, 0.01);
        n.add(l);
        this.track(lg);
      });
    });

    // Loose newspaper / evidence scraps
    [
      { x: -6.2, y: -3.4, rot: -0.30, w: 1.1, h: 0.9 },
      { x:  5.8, y:  0.8, rot:  0.20, w: 0.95, h: 0.8 },
    ].forEach(({ x, y, rot, w, h }) => {
      const sg  = new THREE.PlaneGeometry(w, h);
      const sm  = flat(0xd4c8a8, { transparent: true, opacity: 0.72 });
      const s   = new THREE.Mesh(sg, sm);
      s.position.set(x, y, 0.07);
      s.rotation.z = rot;
      this.boardGroup.add(s);
      this.track(sg);
      this.track(sm);
    });

    // Chapter label plate above board
    const plateGeo = new THREE.BoxGeometry(4.5, 0.45, 0.12);
    const plateMat = flat(0x2a1a08);
    const plate    = new THREE.Mesh(plateGeo, plateMat);
    plate.position.set(0, BOARD_H / 2 + 0.9, 0.0);
    this.boardGroup.add(plate);
    this.track(plateGeo);
    this.track(plateMat);

    // Accent bar on plate
    const plateAccGeo = new THREE.PlaneGeometry(4.2, 0.045);
    const plateAccMat = new THREE.MeshBasicMaterial({ color: WORLD.accentColorHex });
    const plateAcc    = new THREE.Mesh(plateAccGeo, plateAccMat);
    plateAcc.position.set(0, BOARD_H / 2 + 0.9, 0.07);
    this.boardGroup.add(plateAcc);
    this.track(plateAccGeo);
    this.track(plateAccMat);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Build: HTML Overlay
  // ════════════════════════════════════════════════════════════════════════════

  private buildOverlayDOM(): void {
    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'board-overlay';
    this.overlayEl.style.display = 'none';
    this.overlayEl.style.opacity = '0';
    this.overlayEl.setAttribute('aria-label', 'Project detail panel');
    this.overlayEl.setAttribute('role', 'dialog');
    this.overlayEl.setAttribute('aria-modal', 'true');

    this.backdropEl = document.createElement('div');
    this.backdropEl.id = 'board-backdrop';
    this.overlayEl.appendChild(this.backdropEl);

    // Panel itself — built dynamically when a card is clicked
    document.body.appendChild(this.overlayEl);
  }

  private renderDetailPanel(proj: Project): void {
    // Remove any old panel
    const old = this.overlayEl.querySelector('.board-panel');
    if (old) old.remove();

    const tagBadges = proj.tags.map(t =>
      `<span class="board-tag${proj.isGameProject ? ' game' : ''}">${t}</span>`
    ).join('');

    const links = [
      proj.liveUrl
        ? `<a class="board-link" href="${proj.liveUrl}" target="_blank" rel="noopener">
             ${proj.isGameProject ? '▶ PLAY' : '↗ LIVE'}
           </a>`
        : '',
      proj.youtubeUrl
        ? `<a class="board-link" href="${proj.youtubeUrl}" target="_blank" rel="noopener">
             ▶ INTERVIEW
           </a>`
        : '',
      proj.githubUrl
        ? `<a class="board-link secondary" href="${proj.githubUrl}" target="_blank" rel="noopener">
             ⌥ GITHUB
           </a>`
        : '',
    ].filter(Boolean).join('');

    const panel = document.createElement('div');
    panel.className = 'board-panel';
    panel.setAttribute('role', 'article');
    panel.innerHTML = /* html */ `
      <div class="board-panel-inner">
        <div class="board-case-no">CASE FILE — EXHIBIT ${(this.cardProjects.indexOf(proj) + 1).toString().padStart(2, '0')}${proj.isGameProject ? ' · GAME JAM' : ''}</div>
        <h2 class="board-title">${proj.title}</h2>
        <div class="board-role">${proj.role}</div>
        <div class="board-divider"></div>
        <p class="board-blurb">${proj.blurb}</p>
        <div class="board-tags">${tagBadges}</div>
        <div class="board-links">${links}</div>
        <button class="board-close-btn" id="board-close-btn" aria-label="Close project detail">
          [ CLOSE FILE ]
        </button>
      </div>
    `;
    this.overlayEl.appendChild(panel);

    this.closeBtn = panel.querySelector('#board-close-btn')!;
    this.closeBtn.addEventListener('click', () => this.closeDetail(true));
    this.backdropEl.addEventListener('click', () => this.closeDetail(true));
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Interaction
  // ════════════════════════════════════════════════════════════════════════════

  private wireEvents(): void {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;

    this.onClickHandler = (e: MouseEvent) => {
      if (this.isDetailOpen) return;
      const nx =  (e.clientX / window.innerWidth)  * 2 - 1;
      const ny = -(e.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
      
      const folderHits = this.raycaster.intersectObject(this.secretFolder, false);
      if (folderHits.length > 0) {
        this.deps.audio.playClick();
        if ((window as any).gameNotepad) {
          (window as any).gameNotepad.completeQuest('folder');
        }
        return;
      }

      const hits = this.raycaster.intersectObjects(this.cardMeshes, false);
      if (hits.length > 0) {
        const idx = (hits[0].object as THREE.Mesh).userData.projectIndex as number;
        this.deps.audio.playClick();
        this.openDetail(idx);
      }
    };

    // Escape closes detail
    this._escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.closeDetail(true);
    };

    this.onMoveHandler = (e: MouseEvent) => {
      if (this.isDetailOpen) return;
      const nx =  (e.clientX / window.innerWidth)  * 2 - 1;
      const ny = -(e.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
      
      const hits = this.raycaster.intersectObjects(this.cardMeshes, false);
      const folderHits = this.raycaster.intersectObject(this.secretFolder, false);
      
      if (hits.length > 0 || folderHits.length > 0) {
        document.body.style.cursor = 'pointer';
        
        if (folderHits.length > 0 && !this.isHoveringFolder) {
          this.isHoveringFolder = true;
          // small hover lift effect
          gsap.killTweensOf(this.secretFolder.scale);
          gsap.to(this.secretFolder.scale, { x: 1.05, y: 1.05, z: 1.05, duration: 0.2 });
        } else if (folderHits.length === 0 && this.isHoveringFolder) {
          this.isHoveringFolder = false;
          gsap.killTweensOf(this.secretFolder.scale);
          gsap.to(this.secretFolder.scale, { x: 1.0, y: 1.0, z: 1.0, duration: 0.2 });
        }
      } else {
        document.body.style.cursor = 'auto';
        if (this.isHoveringFolder) {
          this.isHoveringFolder = false;
          gsap.killTweensOf(this.secretFolder.scale);
          gsap.to(this.secretFolder.scale, { x: 1.0, y: 1.0, z: 1.0, duration: 0.2 });
        }
      }
    };
  }

  private teardownEvents(): void {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    canvas?.removeEventListener('click',     this.onClickHandler);
    canvas?.removeEventListener('mousemove', this.onMoveHandler);
    window.removeEventListener('keydown',    this._escHandler);
  }

  private openDetail(idx: number): void {
    if (this.isDetailOpen) return;
    this.isDetailOpen = true;
    this.selectedCard = idx;
    this.swayEnabled  = false;

    const proj = this.cardProjects[idx];
    this.deps.audio.playHover();

    // Zoom camera toward the card
    const cardWorldPos = this.cardPositions[idx].clone(); // in board local coords
    const cardGroup = this.cardMeshes[idx].parent as THREE.Group;
    
    // Hide the fake 3D text lines so real HTML text is readable
    const fakeText = cardGroup.getObjectByName('fakeText');
    if (fakeText) fakeText.visible = false;
    
    // Lift card off the board and straighten it
    gsap.killTweensOf(cardGroup.position);
    gsap.killTweensOf(cardGroup.rotation);
    gsap.to(cardGroup.position, { z: cardGroup.userData.origZ + 0.6, duration: 0.7, ease: 'power2.inOut' });
    gsap.to(cardGroup.rotation, { z: 0, duration: 0.7, ease: 'power2.inOut' });

    // Swing spotlight to illuminate the selected card
    gsap.killTweensOf(this.lampTarget.position);
    gsap.to(this.lampTarget.position, {
      x: cardWorldPos.x,
      y: cardWorldPos.y,
      z: cardWorldPos.z,
      duration: 0.7,
      ease: 'power2.inOut'
    });

    // Intensify the lamp and move it directly over the card to clearly illuminate the text
    this.flickerBase = 40.0;
    gsap.killTweensOf(this.lampLight);
    gsap.to(this.lampLight, { intensity: 40.0, duration: 0.7, ease: 'power2.inOut' });

    gsap.killTweensOf(this.lampLight.position);
    gsap.to(this.lampLight.position, {
      x: cardWorldPos.x,
      y: cardWorldPos.y + 0.5,
      z: cardGroup.userData.origZ + 3.0,
      duration: 0.7,
      ease: 'power2.inOut'
    });

    // Move camera to be centered on the card
    gsap.killTweensOf(this.camera.position);
    gsap.to(this.camera.position, {
      x: cardWorldPos.x,
      y: cardWorldPos.y,
      z: cardGroup.userData.origZ + 0.6 + 2.5, // 2.5 units away from card
      duration: 0.7,
      ease: 'power2.inOut',
      onUpdate: () => this.camera.lookAt(new THREE.Vector3(cardWorldPos.x, cardWorldPos.y, cardGroup.userData.origZ + 0.6)),
    });

    // Fade in CRT mask over overlay rect
    const w = Math.min(520, window.innerWidth * 0.82) / window.innerWidth;
    const h = 0.80;
    const x = (1 - w) / 2;
    const y = (1 - h) / 2;
    this.deps.renderer.setCRTMask(1.0, { x, y, w, h });

    this.renderDetailPanel(proj);

    this.overlayEl.style.display = 'flex';
    gsap.fromTo(this.overlayEl, { opacity: 0 }, {
      opacity: 1,
      duration: 0.45,
      delay: 0.25,
      ease: 'power2.out',
    });
  }

  private closeDetail(animate: boolean): void {
    if (!this.isDetailOpen) return;
    this.isDetailOpen = false;
    this.selectedCard = null;
    this.deps.renderer.setCRTMask(0.0);

    const doClose = () => {
      this.overlayEl.style.display = 'none';
      this.overlayEl.style.opacity = '0';
      this.swayEnabled = true;
      document.body.style.cursor = 'auto';

      // Return card to its spot
      if (this.selectedCard !== null) {
        const cardGroup = this.cardMeshes[this.selectedCard].parent as THREE.Group;
        
        // Restore fake 3D text lines
        const fakeText = cardGroup.getObjectByName('fakeText');
        if (fakeText) fakeText.visible = true;

        gsap.killTweensOf(cardGroup.position);
        gsap.killTweensOf(cardGroup.rotation);
        gsap.to(cardGroup.position, { z: cardGroup.userData.origZ, duration: 0.65, ease: 'power2.inOut' });
        gsap.to(cardGroup.rotation, { z: cardGroup.userData.origRotZ, duration: 0.65, ease: 'power2.inOut' });
      }
      this.selectedCard = null;

      // Restore lamp brightness and position
      this.flickerBase = 35.0;
      gsap.killTweensOf(this.lampLight);
      gsap.to(this.lampLight, { intensity: 35.0, duration: 0.65, ease: 'power2.inOut' });
      
      gsap.killTweensOf(this.lampLight.position);
      gsap.to(this.lampLight.position, {
        x: 0,
        y: 9,
        z: 4,
        duration: 0.65,
        ease: 'power2.inOut'
      });


      // Return camera to wide
      gsap.killTweensOf(this.camera.position);
      gsap.to(this.camera.position, {
        x: CAM_WIDE.pos.x,
        y: CAM_WIDE.pos.y,
        z: CAM_WIDE.pos.z,
        duration: 0.65,
        ease: 'power2.inOut',
        onUpdate: () => this.camera.lookAt(CAM_WIDE.lookAt),
      });
    };

    if (animate) {
      this.deps.audio.playHover();
      gsap.to(this.overlayEl, {
        opacity: 0,
        duration: 0.28,
        ease: 'power2.in',
        onComplete: doClose,
      });
    } else {
      doClose();
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Per-frame updates
  // ════════════════════════════════════════════════════════════════════════════

  private updateFlicker(dt: number): void {
    this.flickerTimer += dt;
    if (this.flickerTimer >= this.flickerNext) {
      // Brief intensity blip
      const delta = rng(-0.8, 0.8);
      const dur   = rng(0.06, 0.18);
      gsap.to(this.lampLight, {
        intensity: this.flickerBase + delta,
        duration: dur,
        yoyo: true,
        repeat: 1,
        ease: 'none',
      });
      this.flickerTimer = 0;
      this.flickerNext  = rng(1.5, 5.0);
    }
  }

  private updateCameraSway(time: number): void {
    if (!this.swayEnabled || this.isDetailOpen) return;

    // Mouse parallax
    const mx = this.deps.input.mouseParallax.x;
    const my = this.deps.input.mouseParallax.y;

    const targetX = CAM_WIDE.pos.x + mx * 0.4;
    const targetY = CAM_WIDE.pos.y + my * 0.25 + Math.sin(time * 0.18) * 0.06;

    this.camera.position.x += (targetX - this.camera.position.x) * 0.04;
    this.camera.position.y += (targetY - this.camera.position.y) * 0.04;

    this.camera.lookAt(CAM_WIDE.lookAt);

    // Spotlight follows cursor
    const spotTargetX = mx * 8.0;
    const spotTargetY = my * 4.5 - 1.0; 
    const spotTargetZ = -1.0;
    this.lampTarget.position.x += (spotTargetX - this.lampTarget.position.x) * 0.08;
    this.lampTarget.position.y += (spotTargetY - this.lampTarget.position.y) * 0.08;
    this.lampTarget.position.z += (spotTargetZ - this.lampTarget.position.z) * 0.08;
  }

  private updateCardHover(): void {
    if (this.isDetailOpen) return;

    const mx = this.deps.input.mouse.x;
    const my = this.deps.input.mouse.y;
    if (mx === 0 && my === 0) return;

    this.raycaster.setFromCamera(new THREE.Vector2(mx, my), this.camera);
    const hits = this.raycaster.intersectObjects(this.cardMeshes, false);

    this.cardMeshes.forEach((mesh, i) => {
      const group = mesh.parent as THREE.Group;
      const isHit = hits.length > 0 && hits[0].object === mesh;
      const targetZ = isHit ? 0.28 : 0.06;
      const currentZ = group.position.z;
      group.position.z += (targetZ - currentZ) * 0.12;
    });
  }
}
