// ─────────────────────────────────────────────────────────────────────────────
//  RooftopScene.ts  –  Full Phase 2 implementation
//
//  Contents:
//   • Procedural skyline: 3 depth rows of instanced buildings w/ window flicker
//   • Rain: instanced line segments, ~1200 drops
//   • Fog planes drifting through the scene
//   • Lightning flash system (random intervals)
//   • Helicopter spotlight sweeping across buildings
//   • Rooftop props: vents, antennas, water tower, ledge
//   • Low-poly character: body, cape (vertex-animated), mask, rim light
//   • 4 searchlight beam cones (additive, hover-reactive)
//   • Mouse/gyro parallax, GSAP camera nudge
//   • HTML nav layer: keyboard-focusable beam buttons
//   • Moon (clickable easter egg)
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import gsap       from 'gsap';
import { BaseScene }    from './BaseScene';
import type { SceneDeps } from '../core/SceneManager';
import type { SceneId } from '../core/SceneManager';
import { RetroRenderer }  from '../core/RetroRenderer';
import { Assets }         from '../core/Assets';
import { WORLD, EASTER_EGGS } from '../content';

// ─── Scene config ─────────────────────────────────────────────────────────────
const RAIN_COUNT       = 1200;
const BUILDING_ROWS    = [
  { z: -40, count: 20, minH: 14, maxH: 30, minW: 4.0, maxW: 7.0 },
  { z: -34, count: 18, minH: 12, maxH: 26, minW: 3.5, maxW: 6.0 },
  { z: -28, count: 16, minH: 10, maxH: 22, minW: 3.0, maxW: 5.5 },
  { z: -22, count: 14, minH: 8,  maxH: 18, minW: 3.0, maxW: 5.0 },
  { z: -16, count: 12, minH: 7,  maxH: 15, minW: 2.5, maxW: 4.5 },
  { z: -10, count: 10, minH: 6,  maxH: 12, minW: 2.5, maxW: 4.0 },
];

const BEAM_DEFS = [
  { id: 'desk'   as SceneId, label: 'ABOUT',    x: -15, y: 4, z: -28, icon: '◎', h: 90 },
  { id: 'board'  as SceneId, label: 'PROJECTS', x:   0, y: 0, z: -18, icon: '⊞', h: 110 },
  { id: 'street' as SceneId, label: 'CONTACT',  x:  16, y: 7, z: -32, icon: '✦', h: 80 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rng   = (min: number, max: number) => min + Math.random() * (max - min);
const rngI  = (min: number, max: number) => Math.floor(rng(min, max));

let _seed = 1337;
const seededRandom = () => {
  _seed = (_seed * 9301 + 49297) % 233280;
  return _seed / 233280;
};
const srng = (min: number, max: number) => min + seededRandom() * (max - min);

export class RooftopScene extends BaseScene {

  // 3D groups
  private skylineGroup = new THREE.Group();
  private propsGroup   = new THREE.Group();
  private charGroup    = new THREE.Group();
  private beamGroup    = new THREE.Group();
  private moonMesh!: THREE.Mesh;
  private moonHalo!: THREE.Mesh;

  // Rain
  private rainMesh!: THREE.InstancedMesh;
  private rainPositions: Float32Array = new Float32Array(RAIN_COUNT * 3);
  private rainVelocities: Float32Array = new Float32Array(RAIN_COUNT);

  // Window flicker
  private windowMeshes: THREE.Mesh[] = [];
  private windowFlickerTimers: number[] = [];

  // Character cape
  private capeGeo!: THREE.BufferGeometry;
  private capeOrigY!: Float32Array;

  // Beams
  private beamMeshes:  THREE.Mesh[]   = [];
  private beamGlows:   THREE.Mesh[]   = [];
  private beamHitboxes: THREE.Mesh[]  = [];
  private hoveredBeam: number | null  = null; // The actively highlighted beam
  private uiHoveredBeam: number | null = null; // The beam highlighted via HTML UI
  private hoveredMoon: boolean = false; // Is the moon hovered?
  private raycaster = new THREE.Raycaster();

  // Spotlight / helicopter
  private heliLight!: THREE.SpotLight;
  private heliTarget = new THREE.Object3D();
  private heliAngle  = 0;
  private heliMesh!: THREE.Group;
  private rotorMesh!: THREE.Mesh;

  // Lightning
  private lightningLight!: THREE.PointLight;
  private nextLightning    = 0;
  private lightningTimer   = 0;

  // Fog planes
  private fogPlanes: THREE.Mesh[] = [];

  // HTML nav
  private navEl!: HTMLElement;
  private navButtons: HTMLButtonElement[] = [];

  // Camera
  private camBasePos = new THREE.Vector3(-0.5, 6.0, 3.0);
  private camTarget  = new THREE.Vector3(-0.5, 6.0, 3.0);
  private camLookAt  = new THREE.Vector3(-1.5, -1.0, -20.0);

  // ── Init ──────────────────────────────────────────────────────────────────
  async init(deps: SceneDeps): Promise<void> {
    await super.init(deps);

    // Sky colour — deep navy-purple, clearly visible
    this.scene.background = new THREE.Color(0x1a153a);
    this.scene.fog = RetroRenderer.makeFog(0x1a153a, 0.004); // very light fog — only blurs far distance

    this.camera.position.copy(this.camBasePos);
    this.camera.lookAt(this.camLookAt);
    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();

    this.scene.add(this.skylineGroup);
    this.scene.add(this.propsGroup);
    this.scene.add(this.charGroup);
    this.scene.add(this.beamGroup);

    this.buildLights();
    this.buildSkyline();
    this.buildMoon();
    this.buildRain();
    this.buildFogPlanes();
    this.buildRooftopProps();
    this.buildCharacter();
    this.buildBeams();
    this.buildNavDOM();

    // Precompute window textures
    const winTex = Assets.makeWindowTexture(32, 64, 4, 8);
    this.track(winTex);
  }

  // ── Enter ─────────────────────────────────────────────────────────────────
  async enter(): Promise<void> {
    this.navEl.style.display = 'block';
    gsap.fromTo(this.navEl, { opacity: 0 }, { opacity: 1, duration: 0.8 });

    if ((window as any).gameNotepad) {
      (window as any).gameNotepad.show();
    }

    this.deps.audio.startRain(0.12);

    // Camera fly-in
    if (!this.deps.input.reducedMotion) {
      this.camera.position.set(0, 14, 8);
      gsap.to(this.camera.position, {
        y: this.camBasePos.y,
        duration: 1.8,
        ease: 'power3.out',
      });
    } else {
      this.camera.position.copy(this.camBasePos);
    }

    // Schedule first lightning
    this.nextLightning = rng(4, 12);

    window.addEventListener('click', this.onCanvasClick);
  }

  // ── Exit ──────────────────────────────────────────────────────────────────
  async exit(): Promise<void> {
    window.removeEventListener('click', this.onCanvasClick);
    gsap.to(this.navEl, { opacity: 0, duration: 0.4 });
    this.deps.audio.stopRain();
    this.hoveredBeam = null;
  }

  // ── Update ────────────────────────────────────────────────────────────────
  update(dt: number, time: number): void {
    this.deps.input.update(0.06);

    this.updateRain(dt);
    this.updateCape(time);
    this.updateBeams(time);
    this.updateHelicopter(dt, time);
    this.updateLightning(dt, time);
    this.updateFogPlanes(dt, time);
    this.updateCamera(dt);
    this.updateNavPositions();
    this.raycastBeams();
  }

  // ── Dispose ───────────────────────────────────────────────────────────────
  dispose(): void {
    this.navEl.remove();
    super.dispose();
  }

  // ─── Build: Lights ────────────────────────────────────────────────────────
  private buildLights(): void {
    // Dimmer ambient to restore moody dark vibe
    this.scene.add(new THREE.AmbientLight(0x4455cc, 2.8));

    // Cool moonlight from upper-left
    const moon = new THREE.DirectionalLight(0x88aaff, 2.5);
    moon.position.set(-10, 20, 8);
    this.scene.add(moon);

    // Warm fill from right
    const fill = new THREE.DirectionalLight(0x554477, 1.5);
    fill.position.set(12, 8, 5);
    this.scene.add(fill);

    // Cyan accent rim from below/front — neon city glow
    const rim = new THREE.PointLight(WORLD.accentColorHex, 2.0, 50);
    rim.position.set(0, 2, 10);
    this.scene.add(rim);

    // Secondary accent from behind buildings — backlight glow
    const backRim = new THREE.PointLight(0x8833ff, 1.5, 60);
    backRim.position.set(0, 8, -20);
    this.scene.add(backRim);

    // Helicopter spotlight (narrow cone, sweeping the far city)
    this.heliLight = new THREE.SpotLight(0xeeeeff, 15.0, 300, Math.PI / 20, 0.5, 0);
    this.heliTarget.position.set(0, 0, -35);
    this.scene.add(this.heliTarget);
    this.heliLight.target = this.heliTarget;
    this.heliLight.position.set(0, 22, -25); // Lowered so it's visible on screen
    this.scene.add(this.heliLight);

    // Helicopter visual model
    this.heliMesh = new THREE.Group();
    const flat = (c: number) => RetroRenderer.makeFlatMaterial(c);
    
    // Body
    const hBody = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 2.5), flat(0x1a1a24));
    this.heliMesh.add(hBody);
    
    // Tail
    const hTail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 2.0), flat(0x1a1a24));
    hTail.position.set(0, 0.3, 2.0);
    this.heliMesh.add(hTail);
    
    // Rotor
    this.rotorMesh = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.1, 0.4), flat(0x111111));
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 4.0), flat(0x111111));
    this.rotorMesh.add(r2);
    this.rotorMesh.position.set(0, 0.7, 0);
    this.heliMesh.add(this.rotorMesh);
    
    // Blinking red beacon on tail
    const beaconGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 0.5, 2.8);
    beacon.userData.isBeacon = true;
    this.heliMesh.add(beacon);

    this.scene.add(this.heliMesh);

    // Lightning light (decay: 0 to flood the scene)
    this.lightningLight = new THREE.PointLight(0xaaccff, 0, 500, 0);
    this.lightningLight.position.set(0, 50, -20);
    this.scene.add(this.lightningLight);
  }

  // ─── Build: Skyline ───────────────────────────────────────────────────────
  private buildSkyline(): void {
    const cNear = new THREE.Color(0x20203e); // darkest (near)
    const cFar  = new THREE.Color(0x3a3a5a); // lightest (far)

    _seed = 42; // Reset seed for consistent generation each time

    BUILDING_ROWS.forEach((row, ri) => {
      const spread = 90;
      
      // Smoothly interpolate depth color based on row index
      const lerpFactor = ri / (BUILDING_ROWS.length - 1);
      const rowColor = cFar.clone().lerp(cNear, lerpFactor);

      for (let i = 0; i < row.count; i++) {
        const w = srng(row.minW, row.maxW);
        const h = srng(row.minH, row.maxH);
        const d = srng(row.minW, row.maxW) * 0.8;

        // Main building body
        const geo  = new THREE.BoxGeometry(w, h, d);
        
        // Slightly vary the material brightness for depth within the row
        const instColor = rowColor.clone();
        const hsl = { h: 0, s: 0, l: 0 };
        instColor.getHSL(hsl);
        instColor.setHSL(hsl.h, hsl.s, hsl.l + srng(-0.06, 0.06)); // Increased brightness variance
        
        const instMat = RetroRenderer.makeFlatMaterial(instColor);
        this.track(instMat);

        const mesh = new THREE.Mesh(geo, instMat);
        mesh.position.set(
          (i / row.count - 0.5) * spread + srng(-6, 6), // Massive X staggering
          h / 2 - 24, // Lowered skyline to make our building feel much taller
          row.z + srng(-6, 6), // Massive Z staggering for deep overlap
        );
        // Generous rotation for depth and organic feel
        mesh.rotation.y = srng(-0.25, 0.25);
        this.skylineGroup.add(mesh);
        this.track(geo);

        // Window layer (emissive plane on facade)
        if (seededRandom() > 0.15) {
          const windowSeed = Math.floor(srng(0, 100000));
          this.addWindowFacade(mesh, w, h, d, windowSeed);
        }
      }
    });
  }

  private addWindowFacade(parent: THREE.Mesh, w: number, h: number, d: number, seed: number): void {
    const cols = Math.max(2, Math.floor(w * 1.5));
    const rows = Math.max(3, Math.floor(h * 0.8));
    // Dim amber windows, passes seed for variety
    const tex  = Assets.makeWindowTexture(cols * 8, rows * 8, cols, rows, '#aa7733', '#00000000', seed);
    this.track(tex);

    const geo  = new THREE.PlaneGeometry(w * 0.92, h * 0.88);
    const mat  = new THREE.MeshBasicMaterial({
      map:         tex,
      transparent: true,
      opacity:     0.65, // dimmed from 1.0
      alphaTest:   0.02,
    });
    const plane = new THREE.Mesh(geo, mat);
    plane.position.set(0, 0, d / 2 + 0.05); // Place exactly on the front face
    parent.add(plane);
    this.track(geo);
    this.track(mat);

    this.windowMeshes.push(plane);
    this.windowFlickerTimers.push(rng(1, 8));
  }

  // ─── Build: Moon ──────────────────────────────────────────────────────────
  private buildMoon(): void {
    const geo  = new THREE.SphereGeometry(1.2, 8, 8);
    const mat  = new THREE.MeshBasicMaterial({ color: 0xdde8ff });
    this.moonMesh = new THREE.Mesh(geo, mat);
    this.moonMesh.position.set(-14, 8, -40); // Lowered so it's visible on screen
    this.scene.add(this.moonMesh);
    this.track(geo);
    this.track(mat);

    const haloGeo = new THREE.SphereGeometry(1.4, 16, 16);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.moonHalo = new THREE.Mesh(haloGeo, haloMat);
    this.moonMesh.add(this.moonHalo);
    this.track(haloGeo);
    this.track(haloMat);
  }

  // ─── Build: Rain ──────────────────────────────────────────────────────────
  private buildRain(): void {
    const dummy = new THREE.Object3D();
    const geo   = new THREE.BufferGeometry();
    const verts = new Float32Array([0, 0, 0, 0, -0.35, 0]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));

    const mat = new THREE.LineBasicMaterial({ color: 0x4466aa, transparent: true, opacity: 0.35 });
    this.rainMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.02, 0.35, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x2244aa, transparent: true, opacity: 0.3 }),
      RAIN_COUNT,
    );

    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainPositions[i * 3]     = rng(-35, 35);
      this.rainPositions[i * 3 + 1] = rng(-5, 30);
      this.rainPositions[i * 3 + 2] = rng(-35, 8);
      this.rainVelocities[i]        = rng(14, 22);

      dummy.position.set(
        this.rainPositions[i * 3],
        this.rainPositions[i * 3 + 1],
        this.rainPositions[i * 3 + 2],
      );
      dummy.rotation.x = 0.2; // slight angle
      dummy.updateMatrix();
      this.rainMesh.setMatrixAt(i, dummy.matrix);
    }
    this.rainMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.rainMesh);
    this.track(geo);
    this.track(mat);
  }

  // ─── Build: Fog planes ───────────────────────────────────────────────────
  // Light mist planes and high clouds
  private buildFogPlanes(): void {
    // Low mist
    for (let i = 0; i < 4; i++) {
      const w   = srng(20, 40);
      const h   = srng(2, 5);
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshBasicMaterial({
        color:       0x1a1060,
        transparent: true,
        opacity:     srng(0.06, 0.14),
        depthWrite:  false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(srng(-8, 8), srng(1, 6), srng(-22, -10));
      mesh.rotation.y = srng(-0.15, 0.15);
      this.scene.add(mesh);
      this.fogPlanes.push(mesh);
      this.track(geo);
      this.track(mat);
    }

    // High clouds/fog
    for (let i = 0; i < 6; i++) {
      const w   = srng(80, 120);
      const h   = srng(30, 50);
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshBasicMaterial({
        color:       0x4a457a, // Much lighter than the sky to be visible
        transparent: true,
        opacity:     srng(0.15, 0.25),
        depthWrite:  false,
        blending:    THREE.NormalBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(srng(-30, 30), srng(25, 45), srng(-35, -5)); // Brought forward and higher
      this.scene.add(mesh);
      this.fogPlanes.push(mesh);
      this.track(geo);
      this.track(mat);
    }
  }

  // ─── Build: Rooftop props ─────────────────────────────────────────────────
  private buildRooftopProps(): void {
    const g = this.propsGroup;
    const flat = (c: number) => RetroRenderer.makeFlatMaterial(c);

    // Ledge / parapet — visible medium grey-blue
    const ledgeGeo = new THREE.BoxGeometry(22, 0.4, 1.2);
    const ledge    = new THREE.Mesh(ledgeGeo, flat(0x3a3a54));
    ledge.position.set(0, 0.2, -6.5);
    g.add(ledge);
    this.track(ledgeGeo);

    // Rooftop surface — slightly lighter than sky
    const roofGeo = new THREE.BoxGeometry(22, 0.3, 14);
    const roof    = new THREE.Mesh(roofGeo, flat(0x282840));
    roof.position.set(0, 0, 0);
    g.add(roof);
    this.track(roofGeo);

    // Vents (3) — visible teal-grey
    [[-6, 0, -2], [2, 0, -3], [7, 0, -1.5]].forEach(([x, y, z]) => {
      const vg = new THREE.BoxGeometry(1.2, 0.9, 0.8);
      const vm = new THREE.Mesh(vg, flat(0x3e4060));
      vm.position.set(x, y + 0.6, z);
      g.add(vm);
      this.track(vg);
    });

    // Antennas (2) — visible steel grey
    [[-9, 0, -1], [5, 0, -4]].forEach(([x, y, z]) => {
      const ag = new THREE.CylinderGeometry(0.04, 0.06, 3.5, 4);
      const am = new THREE.Mesh(ag, flat(0x445566));
      am.position.set(x, y + 1.75, z);
      g.add(am);
      this.track(ag);
    });

    // Water tower — warm brown-grey
    const wtBaseGeo = new THREE.CylinderGeometry(1.0, 1.1, 2.2, 6);
    const wtBase    = new THREE.Mesh(wtBaseGeo, flat(0x3a3428));
    wtBase.position.set(4, 1.1, -2); // Moved right to avoid character
    g.add(wtBase);
    const wtRoofGeo = new THREE.ConeGeometry(1.1, 0.9, 6);
    const wtRoof    = new THREE.Mesh(wtRoofGeo, flat(0x4a4230));
    wtRoof.position.set(4, 2.65, -2);
    g.add(wtRoof);
    [wtBaseGeo, wtRoofGeo].forEach((geo) => this.track(geo));
  }

  // ─── Build: Character ─────────────────────────────────────────────────────
  private buildCharacter(): void {
    const g = this.charGroup;
    g.position.set(-3.5, 0.3, -5.8);
    g.rotation.y = Math.PI; // Face away from camera, towards the city

    const accent = WORLD.accentColorHex;
    const flat   = (c: number, opts?: Partial<THREE.MeshLambertMaterialParameters>) =>
      RetroRenderer.makeFlatMaterial(c, opts);

    // Body — dark charcoal, visible against sky
    const bodyGeo = new THREE.BoxGeometry(0.7, 1.3, 0.4);
    const body    = new THREE.Mesh(bodyGeo, flat(0x353545));
    body.position.y = 1.65;
    g.add(body);
    this.track(bodyGeo);

    // Head / mask — slightly lighter than body
    const headGeo = new THREE.BoxGeometry(0.55, 0.55, 0.4);
    const head    = new THREE.Mesh(headGeo, flat(0x2e2e3e));
    head.position.y = 2.55;
    g.add(head);
    this.track(headGeo);

    // Glowing cyan lens eyes — emissive MeshBasicMaterial
    const lensGeo = new THREE.BoxGeometry(0.18, 0.1, 0.45);
    const lensMat = new THREE.MeshBasicMaterial({ color: accent });
    [-0.14, 0.14].forEach((ox) => {
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.set(ox, 2.55, 0.21);
      lens.rotation.z = ox < 0 ? 0.3 : -0.3;
      g.add(lens);
    });
    this.track(lensGeo);
    this.track(lensMat);

    // Shoulders — slightly brighter for silhouette contrast
    const shoulderGeo = new THREE.BoxGeometry(1.1, 0.25, 0.45);
    const shoulder    = new THREE.Mesh(shoulderGeo, flat(0x2e2e44));
    shoulder.position.y = 2.1;
    g.add(shoulder);
    this.track(shoulderGeo);

    // Arms
    [[-0.45, 0, 0], [0.45, 0, 0]].forEach(([ox, oy, oz]) => {
      const armGeo = new THREE.BoxGeometry(0.22, 0.9, 0.22);
      const arm    = new THREE.Mesh(armGeo, flat(0x232333));
      arm.position.set(ox, 1.25 + oy, oz);
      g.add(arm);
      this.track(armGeo);
    });

    // Legs
    [[-0.2, 0, 0], [0.2, 0, 0]].forEach(([ox]) => {
      const legGeo = new THREE.BoxGeometry(0.26, 0.9, 0.26);
      const leg    = new THREE.Mesh(legGeo, flat(0x1c1c2c));
      leg.position.set(ox, 0.45, 0);
      g.add(leg);
      this.track(legGeo);
    });

    // Neck wrap — tight loop of scarf around the neck
    const neckGeo = new THREE.TorusGeometry(0.28, 0.07, 6, 10);
    const neckMat = flat(WORLD.accentColorHex);
    const neckMesh = new THREE.Mesh(neckGeo, neckMat);
    neckMesh.position.set(0, 2.35, 0);
    neckMesh.rotation.x = Math.PI / 2;
    g.add(neckMesh);
    this.track(neckGeo);

    // Scarf — neon blue, trails to the screen-left
    // 2D plane with high segment count for complex 3D bending
    const scarfGeo = new THREE.PlaneGeometry(2.8, 0.28, 28, 6);
    scarfGeo.translate(1.4, 0, 0); // anchor at local right (appears screen-left)
    
    this.capeGeo  = scarfGeo;
    this.capeOrigY = new Float32Array(scarfGeo.attributes.position.array.length);
    this.capeOrigY.set(scarfGeo.attributes.position.array as Float32Array);

    const scarfMat  = flat(WORLD.accentColorHex, { side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    const scarfMesh = new THREE.Mesh(scarfGeo, scarfMat);
    scarfMesh.position.set(-0.15, 2.35, 0.1);
    g.add(scarfMesh);
    this.track(scarfMat);

    // Strong cyan rim light — makes character glow against sky
    const rimLight = new THREE.PointLight(accent, 3.5, 6);
    rimLight.position.set(0, 2.0, 0.8);
    g.add(rimLight);

    // Warm fill from below — prevents character from going completely black
    const fillLight = new THREE.PointLight(0xffaa44, 1.2, 5);
    fillLight.position.set(0, -0.5, 1);
    g.add(fillLight);
  }

  // ─── Build: Beams ─────────────────────────────────────────────────────────
  private buildBeams(): void {
    BEAM_DEFS.forEach((def, i) => {
      const coneGeo = new THREE.ConeGeometry(2.5, def.h, 8, 1, true);
      coneGeo.translate(0, def.h / 2, 0);

      const beamMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor:     { value: new THREE.Color(WORLD.accentColorHex) },
          uIntensity: { value: 0.75 }, // much brighter by default
          uTime:      { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying float vHeight;
          void main() {
            vHeight     = position.y / ${def.h}.0;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3  uColor;
          uniform float uIntensity;
          uniform float uTime;
          varying float vHeight;
          void main() {
            float alpha = (1.0 - vHeight) * uIntensity;
            alpha *= 0.85 + 0.15 * sin(uTime * 2.0 + vHeight * 6.28);
            gl_FragColor = vec4(uColor * alpha, alpha * 0.5);
          }
        `,
        transparent: true,
        depthWrite:  false,
        blending:    THREE.AdditiveBlending,
        side:        THREE.DoubleSide,
      });

      const cone = new THREE.Mesh(coneGeo, beamMat);
      cone.position.set(def.x, def.y, def.z);
      cone.rotation.x = Math.PI; // flip so wide end is up
      this.beamGroup.add(cone);
      this.beamMeshes.push(cone);
      this.track(coneGeo);
      this.track(beamMat);

      // Glow disc at beam base
      const glowGeo = new THREE.CircleGeometry(0.8, 8);
      const glowMat = new THREE.MeshBasicMaterial({
        color:       WORLD.accentColorHex,
        transparent: true,
        opacity:     0.5,
        blending:    THREE.AdditiveBlending,
        depthWrite:  false,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(def.x, def.y + 0.05, def.z);
      glow.rotation.x = -Math.PI / 2;
      this.beamGroup.add(glow);
      this.beamGlows.push(glow);
      this.track(glowGeo);
      this.track(glowMat);

      // Hitbox for raycasting (invisible thick cylinder so it has volume at the tip)
      const hitGeo = new THREE.CylinderGeometry(3.5, 3.5, def.h, 8);
      hitGeo.translate(0, def.h / 2, 0);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitbox = new THREE.Mesh(hitGeo, hitMat);
      hitbox.position.set(def.x, def.y, def.z);
      hitbox.rotation.x = Math.PI; // match the visible cone's flip
      hitbox.userData = { index: i };
      this.beamGroup.add(hitbox);
      this.beamHitboxes.push(hitbox);
      this.track(hitGeo);
      this.track(hitMat);

      void i;
    });
  }

  // ─── Build: Nav DOM ───────────────────────────────────────────────────────
  private buildNavDOM(): void {
    this.navEl = document.createElement('nav');
    this.navEl.id     = 'rooftop-nav';
    this.navEl.setAttribute('aria-label', 'Navigate to portfolio section');

    const ul = document.createElement('ul');
    ul.className = 'beam-nav';
    ul.setAttribute('role', 'list');

    BEAM_DEFS.forEach((def, i) => {
      const li  = document.createElement('li');
      const btn = document.createElement('button');
      btn.className   = 'beam-btn';
      btn.dataset.scene = def.id;
      btn.dataset.index = String(i);
      btn.setAttribute('aria-label', `Navigate to ${def.label} section`);
      btn.innerHTML = `<span class="beam-icon">${def.icon}</span><span class="beam-label">${def.label}</span>`;

      btn.addEventListener('mouseenter', () => {
        this.uiHoveredBeam = i;
      });

      btn.addEventListener('mouseleave', () => {
        if (this.uiHoveredBeam === i) this.uiHoveredBeam = null;
      });

      btn.addEventListener('focus', () => {
        this.uiHoveredBeam = i;
      });

      btn.addEventListener('blur', () => {
        if (this.uiHoveredBeam === i) this.uiHoveredBeam = null;
      });

      btn.addEventListener('click', () => {
        this.deps.audio.playClick();
        this.flyToScene(def.id, i);
      });

      btn.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.deps.audio.playClick();
          this.flyToScene(def.id, i);
        }
      });

      li.appendChild(btn);
      ul.appendChild(li);
      this.navButtons.push(btn);
    });

    this.navEl.appendChild(ul);
    document.body.appendChild(this.navEl);
  }

  // ─── Update handlers ──────────────────────────────────────────────────────
  private updateRain(dt: number): void {
    const dummy = new THREE.Object3D();
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainPositions[i * 3 + 1] -= this.rainVelocities[i] * dt;
      if (this.rainPositions[i * 3 + 1] < -5) {
        this.rainPositions[i * 3 + 1] = 30;
        this.rainPositions[i * 3]     = rng(-35, 35);
        this.rainPositions[i * 3 + 2] = rng(-35, 8);
      }
      dummy.position.set(
        this.rainPositions[i * 3],
        this.rainPositions[i * 3 + 1],
        this.rainPositions[i * 3 + 2],
      );
      dummy.rotation.x = 0.15;
      dummy.updateMatrix();
      this.rainMesh.setMatrixAt(i, dummy.matrix);
    }
    this.rainMesh.instanceMatrix.needsUpdate = true;
  }



  private updateCape(time: number): void {
    if (!this.capeGeo) return;
    const pos   = this.capeGeo.attributes.position as THREE.BufferAttribute;
    const arr   = pos.array as Float32Array;
    const orig  = this.capeOrigY;
    const count = arr.length / 3;

    for (let i = 0; i < count; i++) {
      const ox = orig[i * 3];      // X distance from neck
      const oy = orig[i * 3 + 1];  // local Y (top/bottom edge)
      const oz = orig[i * 3 + 2];  // local Z (starts at 0)

      // Normalised distance from anchor (0 at neck, 1 at tip)
      const t = ox / 2.8;
      const t2 = t * t;

      // 1. Twist the 2D plane around its core (X axis) so edges curl naturally
      const twistAngle = Math.sin(time * 4.0 - ox * 3.0) * Math.PI * 0.8 * t;
      const cosT = Math.cos(twistAngle);
      const sinT = Math.sin(twistAngle);
      
      const twistedY = oy * cosT - oz * sinT;
      const twistedZ = oy * sinT + oz * cosT;

      // 2. 3D flutter simulation (whipping in Y and Z planes)
      // Subtracting ox ensures the wave travels from ox=0 (neck) to ox=2.8 (tip)
      const flutterY = Math.sin(time * 14.0 - ox * 6.0) * 0.3 * t2
                     + Math.cos(time * 6.0 - ox * 3.0) * 0.1 * t;
                     
      const flutterZ = Math.cos(time * 16.0 - ox * 7.0) * 0.4 * t2
                     + Math.sin(time * 8.0 - ox * 4.0) * 0.15 * t;

      // 3. Gravity droop
      const droop = t2 * 0.3;

      arr[i * 3]     = ox;
      arr[i * 3 + 1] = twistedY + flutterY - droop;
      arr[i * 3 + 2] = twistedZ + flutterZ;
    }

    pos.needsUpdate = true;
    this.capeGeo.computeVertexNormals();
  }

  private updateBeams(time: number): void {
    this.beamMeshes.forEach((mesh, i) => {
      const mat = mesh.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = time;
    });
    void time;
  }

  private updateHelicopter(dt: number, time: number): void {
    this.heliAngle += dt * 0.3;
    const r = 35; // Wider sweep
    this.heliLight.position.x = Math.sin(this.heliAngle) * r;
    this.heliLight.position.y = 8; // Locked into the visible skyline
    this.heliLight.position.z = -25 + Math.cos(this.heliAngle * 0.7) * 8; // Deep in the city
    this.heliTarget.position.set(
      Math.sin(this.heliAngle + 0.5) * 30, // Target sweeps wide
      0,
      -35 + Math.cos(this.heliAngle * 0.5) * 10, // Target is further back than the heli
    );

    // Update visual model
    this.heliMesh.position.copy(this.heliLight.position);
    this.heliMesh.lookAt(this.heliTarget.position);
    this.heliMesh.rotateY(Math.PI); // Flip 180 degrees so the front points to the target
    this.rotorMesh.rotation.y += dt * 20.0;

    // Blinking tail beacon
    const beacon = this.heliMesh.children.find(c => c.userData.isBeacon) as THREE.Mesh;
    if (beacon) {
      beacon.visible = Math.floor(time * 4) % 2 === 0;
    }

    void time;
  }

  private updateLightning(dt: number, _time: number): void {
    this.nextLightning -= dt;
    if (this.nextLightning <= 0) {
      // Flash (No decay, floods the scene)
      this.lightningLight.intensity = 40 + Math.random() * 30;
      this.lightningTimer = 0.12 + Math.random() * 0.08;
      this.deps.audio.playThunder();
      this.nextLightning = rng(6, 18);
    }
    if (this.lightningTimer > 0) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningLight.intensity = 0;
      }
    }
  }

  private updateFogPlanes(dt: number, time: number): void {
    this.fogPlanes.forEach((plane, i) => {
      plane.position.x += Math.sin(time * 0.08 + i * 2) * dt * 0.4;
      if (plane.position.x > 30)  plane.position.x = -30;
      if (plane.position.x < -30) plane.position.x =  30;
    });
  }

  private updateCamera(dt: number): void {
    const input = this.deps.input;
    const px    = input.gyro.x !== 0 ? input.gyro.x : input.mouseParallax.x;
    const py    = input.gyro.y !== 0 ? input.gyro.y : input.mouseParallax.y;

    this.camTarget.x = this.camBasePos.x + px * 2.0;
    this.camTarget.y = this.camBasePos.y + py * 0.8;
    this.camTarget.z = this.camBasePos.z;

    this.camera.position.lerp(this.camTarget, 0.04);
    this.camera.lookAt(this.camLookAt.x + px * 1.5, this.camLookAt.y, this.camLookAt.z);

    void dt;
  }

  private updateNavPositions(): void {
    // Project beam base positions to screen space for nav button placement
    // (In Phase 2 we position them in CSS — in Phase 6 we'll map exact 3D→2D)
    // Buttons are in the bottom center row (handled by CSS already)
  }

  private raycastBeams(): void {
    if (this.deps.input.mouse.x === 0 && this.deps.input.mouse.y === 0) return;

    // Sticky hitboxes: drastically widen the hitbox of the currently hovered beam
    // so that the camera nudge doesn't cause the raycaster to slip off.
    this.beamHitboxes.forEach((box, i) => {
      const isHovered = (this.hoveredBeam === i);
      box.scale.set(isHovered ? 4.0 : 1.0, 1.0, isHovered ? 4.0 : 1.0);
      box.updateMatrixWorld();
    });

    const mouseVec = new THREE.Vector2(this.deps.input.mouse.x, this.deps.input.mouse.y);
    this.raycaster.setFromCamera(mouseVec, this.camera);
    const intersects = this.raycaster.intersectObjects(this.beamHitboxes, false);

    let hitIndex: number | null = null;
    if (intersects.length > 0) {
      hitIndex = intersects[0].object.userData.index as number;
    }

    // Check moon
    const moonHits = this.raycaster.intersectObject(this.moonMesh, false);
    if (moonHits.length > 0 && hitIndex === null) {
      if (!this.hoveredMoon) {
        this.hoveredMoon = true;
        document.body.style.cursor = 'pointer';
        gsap.to((this.moonHalo.material as THREE.MeshBasicMaterial), { opacity: 0.3, duration: 0.3 });
        gsap.to(this.moonHalo.scale, { x: 1.15, y: 1.15, z: 1.15, duration: 0.3 });
      }
    } else {
      if (this.hoveredMoon) {
        this.hoveredMoon = false;
        if (this.hoveredBeam === null) document.body.style.cursor = 'auto';
        gsap.to((this.moonHalo.material as THREE.MeshBasicMaterial), { opacity: 0, duration: 0.3 });
        gsap.to(this.moonHalo.scale, { x: 1.0, y: 1.0, z: 1.0, duration: 0.3 });
      }
    }

    // UI hover takes precedence over 3D raycast
    const effectiveHit = this.uiHoveredBeam !== null ? this.uiHoveredBeam : hitIndex;

    if (effectiveHit !== this.hoveredBeam) {
      // Blur old
      if (this.hoveredBeam !== null) {
        this.tweenBeamIntensity(this.hoveredBeam, 0.75, 0.5);
        this.navButtons[this.hoveredBeam]?.classList.remove('hovered');
      }

      this.hoveredBeam = effectiveHit;

      // Focus new
      if (this.hoveredBeam !== null) {
        document.body.style.cursor = 'pointer';
        this.deps.audio.playHover();
        this.tweenBeamIntensity(this.hoveredBeam, 1.4, 0.3);
        this.navButtons[this.hoveredBeam]?.classList.add('hovered');
        this.nudgeCamera(BEAM_DEFS[this.hoveredBeam].x);
      } else {
        document.body.style.cursor = 'auto';
        this.resetCameraX();
      }
    }
  }

  private onCanvasClick = (): void => {
    if (this.hoveredMoon) {
      this.deps.audio.playClick();
      // Easter egg: Turn moon blood red
      (this.moonMesh.material as THREE.MeshBasicMaterial).color.setHex(0xc93b3b);
      
      const tip = document.getElementById('moon-tip');
      if (tip) tip.classList.add('visible');
      
      if ((window as any).gameNotepad) {
        (window as any).gameNotepad.completeQuest('moon');
      }
      return;
    }

    if (this.hoveredBeam !== null) {
      this.deps.audio.playClick();
      this.flyToScene(BEAM_DEFS[this.hoveredBeam].id, this.hoveredBeam);
      document.body.style.cursor = 'auto';
    }
  };

  // ─── Camera / interaction ─────────────────────────────────────────────────
  private tweenBeamIntensity(index: number, to: number, duration: number): void {
    const mat = this.beamMeshes[index].material as THREE.ShaderMaterial;
    const glowMat = this.beamGlows[index].material as THREE.MeshBasicMaterial;
    gsap.to(mat.uniforms.uIntensity, { value: to, duration, ease: 'power2.out' });
    gsap.to(glowMat, { opacity: to * 0.6, duration, ease: 'power2.out' });
  }

  private nudgeCamera(targetX: number): void {
    if (this.deps.input.reducedMotion) return;
    gsap.to(this.camBasePos, { x: -0.5 + targetX * 0.15, duration: 0.8, ease: 'power2.out' });
  }

  private resetCameraX(): void {
    if (this.deps.input.reducedMotion) return;
    gsap.to(this.camBasePos, { x: -0.5, duration: 1.2, ease: 'power3.out' });
  }

  private async flyToScene(id: SceneId, beamIndex: number): Promise<void> {
    if (this.deps.input.reducedMotion) {
      this.deps.navigate(id);
      return;
    }

    // Brighten beam
    this.tweenBeamIntensity(beamIndex, 2.2, 0.2);

    // Navigate immediately (TransitionManager will handle custom overlays)
    this.deps.navigate(id);

    // Reset after leaving (for when we come back)
    setTimeout(() => {
      this.tweenBeamIntensity(beamIndex, 0.75, 0.1);
      this.camera.position.copy(this.camBasePos);
      this.camLookAt.set(-1.5, -1.0, -20.0);
    }, 200);
  }
}
