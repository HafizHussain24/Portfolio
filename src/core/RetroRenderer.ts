// ─────────────────────────────────────────────────────────────────────────────
//  RetroRenderer.ts  –  Core rendering pipeline
//
//  Pipeline:
//    Scene camera → lowResTarget (480×270) → upscale quad (NearestFilter)
//    → [optional] dither pass → [optional] CRT pass → screen canvas
//
//  All scenes render through this renderer so the low-fi aesthetic is unified.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { WORLD } from '../content';

// ─── Constants ───────────────────────────────────────────────────────────────
export const RETRO_W = 480;
export const RETRO_H = 270;
export const MAX_DPR = 1.5;

// Inline GLSL to avoid async shader fetch issues in Vite
const PASS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DITHER_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2      uResolution;
  uniform float     uStrength;
  uniform float     uPalette;
  varying vec2 vUv;

  float bayerMatrix(ivec2 p) {
    // Bayer 4x4
    int b[16];
    b[0]=0;  b[1]=8;  b[2]=2;  b[3]=10;
    b[4]=12; b[5]=4;  b[6]=14; b[7]=6;
    b[8]=3;  b[9]=11; b[10]=1; b[11]=9;
    b[12]=15;b[13]=7; b[14]=13;b[15]=5;
    return float(b[(p.y & 3) * 4 + (p.x & 3)]) / 16.0;
  }

  vec3 quantize(vec3 c, float s) { return floor(c * s + 0.5) / s; }

  void main() {
    vec3 color = texture2D(tDiffuse, vUv).rgb;
    ivec2 px   = ivec2(gl_FragCoord.xy);
    float thr  = bayerMatrix(px) - 0.5;
    color     += thr * uStrength * (1.0 / uPalette);
    color      = quantize(color, uPalette);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const CRT_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2      uResolution;
  uniform float     uScanStrength;
  uniform float     uVigStrength;
  uniform float     uTime;
  uniform float     uMaskAlpha;
  uniform vec4      uMaskRect;
  varying vec2 vUv;

  void main() {
    vec3 col  = texture2D(tDiffuse, vUv).rgb;
    float line = mod(floor(vUv.y * uResolution.y), 2.0);
    
    vec2 minB = uMaskRect.xy;
    vec2 maxB = uMaskRect.xy + uMaskRect.zw;
    vec2 s = smoothstep(minB - 0.02, minB + 0.02, vUv) - smoothstep(maxB - 0.02, maxB + 0.02, vUv);
    float inMask = s.x * s.y;
    float currentScan = uScanStrength * (1.0 - (inMask * uMaskAlpha));

    col *= 1.0 - currentScan * 0.35 * (1.0 - line);
    vec2 uv2 = vUv * (1.0 - vUv.yx);
    float vig = clamp(pow(uv2.x * uv2.y * 15.0, 0.25), 0.0, 1.0);
    col = mix(col, col * vig, uVigStrength);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface RetroRendererOptions {
  canvas: HTMLCanvasElement;
  performanceMode?: boolean;
}

export interface RenderState {
  ditherEnabled: boolean;
  crtEnabled: boolean;
  vertexSnapEnabled: boolean;
  performanceMode: boolean;
}

// ─── RetroRenderer class ──────────────────────────────────────────────────────
export class RetroRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly state: RenderState;

  // Low-res render targets (ping-pong for post passes)
  private targetA: THREE.WebGLRenderTarget;
  private targetB: THREE.WebGLRenderTarget;

  // Post-process quad
  private quadScene: THREE.Scene;
  private quadCamera: THREE.OrthographicCamera;
  private ditherMesh: THREE.Mesh;
  private crtMesh: THREE.Mesh;
  private copyMesh: THREE.Mesh;   // plain copy when all effects disabled

  // Materials
  private ditherMat: THREE.ShaderMaterial;
  private crtMat: THREE.ShaderMaterial;
  private copyMat: THREE.MeshBasicMaterial;

  private internalW: number;
  private internalH: number;

  constructor({ canvas, performanceMode = false }: RetroRendererOptions) {
    this.state = {
      ditherEnabled: !performanceMode,
      crtEnabled: !performanceMode,
      vertexSnapEnabled: false,   // off by default (reduces motion issues)
      performanceMode,
    };

    // ── Three.js Renderer ───────────────────────────────────────────────
    const dpr = Math.min(window.devicePixelRatio, MAX_DPR);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,      // intentional — we want the jagged pixel look
      alpha: false,
      powerPreference: performanceMode ? 'low-power' : 'high-performance',
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = false; // flat shading aesthetic

    // ── Internal resolution ─────────────────────────────────────────────
    this.internalW = performanceMode ? 320 : RETRO_W;
    this.internalH = performanceMode ? 180 : RETRO_H;

    // ── Render targets ──────────────────────────────────────────────────
    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      colorSpace: THREE.SRGBColorSpace,
    };
    this.targetA = new THREE.WebGLRenderTarget(this.internalW, this.internalH, rtOpts);
    this.targetB = new THREE.WebGLRenderTarget(this.internalW, this.internalH, rtOpts);

    // ── Post-process quad scene ─────────────────────────────────────────
    this.quadScene  = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeo   = new THREE.PlaneGeometry(2, 2);

    // Copy material (no effects)
    this.copyMat  = new THREE.MeshBasicMaterial({ map: this.targetA.texture });
    this.copyMesh = new THREE.Mesh(quadGeo, this.copyMat);

    // Dither material
    this.ditherMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse:    { value: this.targetA.texture },
        uResolution: { value: new THREE.Vector2(this.internalW, this.internalH) },
        uStrength:   { value: 0.4 }, // Reduced from 0.9 to prevent crushing
        uPalette:    { value: 64.0 }, // Increased from 10 to preserve more color shades
      },
      vertexShader:   PASS_VERT,
      fragmentShader: DITHER_FRAG,
      depthTest:  false,
      depthWrite: false,
    });
    this.ditherMesh = new THREE.Mesh(quadGeo, this.ditherMat);

    // CRT material
    this.crtMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse:      { value: this.targetB.texture },
        uResolution:   { value: new THREE.Vector2(this.internalW, this.internalH) },
        uScanStrength: { value: 0.8 },
        uVigStrength:  { value: 0.7 },
        uTime:         { value: 0 },
        uMaskAlpha:    { value: 0.0 },
        uMaskRect:     { value: new THREE.Vector4(0, 0, 1, 1) },
      },
      vertexShader:   PASS_VERT,
      fragmentShader: CRT_FRAG,
      depthTest:  false,
      depthWrite: false,
    });
    this.crtMesh = new THREE.Mesh(quadGeo, this.crtMat);

    // ── Resize observer ─────────────────────────────────────────────────
    window.addEventListener('resize', this.onResize);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setCRTMask(alpha: number, rect = {x: 0, y: 0, w: 1, h: 1}) {
    this.crtMat.uniforms.uMaskAlpha.value = alpha;
    this.crtMat.uniforms.uMaskRect.value.set(rect.x, rect.y, rect.w, rect.h);
  }

  setCRTStrength(scan: number, vig = 0.7) {
    this.crtMat.uniforms.uScanStrength.value = scan;
    this.crtMat.uniforms.uVigStrength.value = vig;
  }

  /**
   * Render a scene + camera through the retro pipeline.
   * Call once per frame from your render loop.
   */
  render(scene: THREE.Scene, camera: THREE.Camera, time: number): void {
    this.renderer.clear();

    // 1. Scene → targetA (low-res)
    this.renderer.setRenderTarget(this.targetA);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    const { ditherEnabled, crtEnabled } = this.state;

    if (!ditherEnabled && !crtEnabled) {
      // No post — blit directly to screen
      this.renderer.setRenderTarget(null);
      this.copyMat.map = this.targetA.texture;
      this.copyMat.needsUpdate = true;
      this.quadScene.clear();
      this.quadScene.add(this.copyMesh);
      this.renderer.render(this.quadScene, this.quadCamera);
      return;
    }

    if (ditherEnabled) {
      // 2. targetA → dither → targetB
      this.ditherMat.uniforms.tDiffuse.value = this.targetA.texture;
      this.renderer.setRenderTarget(this.targetB);
      this.renderer.clear();
      this.quadScene.clear();
      this.quadScene.add(this.ditherMesh);
      this.renderer.render(this.quadScene, this.quadCamera);
    }

    if (crtEnabled) {
      // 3. targetB (or targetA if no dither) → CRT → screen
      this.crtMat.uniforms.tDiffuse.value = ditherEnabled
        ? this.targetB.texture
        : this.targetA.texture;
      this.crtMat.uniforms.uTime.value = time;
      this.renderer.setRenderTarget(null);
      this.quadScene.clear();
      this.quadScene.add(this.crtMesh);
      this.renderer.render(this.quadScene, this.quadCamera);
    } else if (ditherEnabled) {
      // Dither only → blit targetB to screen
      this.renderer.setRenderTarget(null);
      this.copyMat.map = this.targetB.texture;
      this.copyMat.needsUpdate = true;
      this.quadScene.clear();
      this.quadScene.add(this.copyMesh);
      this.renderer.render(this.quadScene, this.quadCamera);
    }
  }

  /** Toggle performance mode at runtime */
  setPerformanceMode(on: boolean): void {
    this.state.performanceMode = on;
    if (on) {
      this.state.ditherEnabled     = false;
      this.state.crtEnabled        = false;
      this.state.vertexSnapEnabled = false;
      this.setInternalResolution(320, 180);
    } else {
      this.state.ditherEnabled = true;
      this.state.crtEnabled    = true;
      this.setInternalResolution(RETRO_W, RETRO_H);
    }
  }

  toggleDither(): void  { this.state.ditherEnabled = !this.state.ditherEnabled; }
  toggleCRT(): void     { this.state.crtEnabled    = !this.state.crtEnabled;    }
  toggleVertexSnap(): void { this.state.vertexSnapEnabled = !this.state.vertexSnapEnabled; }

  setInternalResolution(w: number, h: number): void {
    this.internalW = w;
    this.internalH = h;
    this.targetA.setSize(w, h);
    this.targetB.setSize(w, h);
    this.ditherMat.uniforms.uResolution.value.set(w, h);
    this.crtMat.uniforms.uResolution.value.set(w, h);
  }

  /** Make a standard flat-shaded material with the retro palette feel */
  static makeFlatMaterial(color: THREE.ColorRepresentation, opts?: Partial<THREE.MeshLambertMaterialParameters>): THREE.MeshLambertMaterial {
    return new THREE.MeshLambertMaterial({
      color,
      flatShading: true,
      ...opts,
    });
  }

  /** Fog settings for all scenes — heavy exponential */
  static makeFog(color: THREE.ColorRepresentation = 0x0a0a1a, density = 0.018): THREE.FogExp2 {
    return new THREE.FogExp2(color, density);
  }

  /** Accent colour from content.ts as a Three.js Color */
  static accentColor(): THREE.Color {
    return new THREE.Color(WORLD.accentColorHex);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.targetA.dispose();
    this.targetB.dispose();
    this.ditherMat.dispose();
    this.crtMat.dispose();
    this.copyMat.dispose();
    this.renderer.dispose();
  }

  // ── Private ───────────────────────────────────────────────────────────────
  private onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}
