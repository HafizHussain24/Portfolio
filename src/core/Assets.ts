// ─────────────────────────────────────────────────────────────────────────────
//  Assets.ts  –  Asset registry + preload tracker
//
//  Provides:
//  • A typed registry for any preloaded assets (textures, etc.)
//  • Progress callbacks for the loading bar
//  • WebGL capability check
//  • Detection of low-end hardware (auto performance mode)
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

export interface LoadProgress {
  loaded: number;
  total:  number;
  ratio:  number;   // 0..1
  item:   string;
}

type ProgressCallback = (p: LoadProgress) => void;

export class Assets {
  private static textures: Map<string, THREE.Texture> = new Map();
  private static progressCbs: Set<ProgressCallback>   = new Set();
  private static loaded  = 0;
  private static total   = 0;

  // ── WebGL availability ─────────────────────────────────────────────────
  static isWebGLAvailable(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(
        (window.WebGL2RenderingContext && canvas.getContext('webgl2')) ||
        (window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')))
      );
    } catch {
      return false;
    }
  }

  // ── Auto-detect low-end / mobile ──────────────────────────────────────
  static shouldDefaultPerformanceMode(): boolean {
    const isMobile     = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const lowCPU       = navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4;
    const hasCoarsePtr = window.matchMedia('(pointer: coarse)').matches;
    return isMobile || (lowCPU && hasCoarsePtr);
  }

  // ── Progress tracking ─────────────────────────────────────────────────
  static onProgress(cb: ProgressCallback): () => void {
    Assets.progressCbs.add(cb);
    return () => Assets.progressCbs.delete(cb);
  }

  private static reportProgress(item: string): void {
    const p: LoadProgress = {
      loaded: Assets.loaded,
      total:  Assets.total,
      ratio:  Assets.total === 0 ? 1 : Assets.loaded / Assets.total,
      item,
    };
    Assets.progressCbs.forEach((cb) => cb(p));
  }

  // ── Procedural texture helpers ────────────────────────────────────────

  /**
   * Generate a window-light texture: a small canvas with random lit squares
   * used as an emissive map on building facades.
   */
  static makeWindowTexture(
    w = 32, h = 64,
    cols = 4, rows = 8,
    litColor = '#ffb347',
    bgColor  = '#050510',
    seed = 1,
  ): THREE.CanvasTexture {
    let _s = seed;
    const srng = () => {
      _s = (_s * 9301 + 49297) % 233280;
      return _s / 233280;
    };

    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    const cellW = w / cols;
    const cellH = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (srng() > 0.45) { // ~55% windows lit
          const randLight = srng();
          if (randLight > 0.8) {
            ctx.fillStyle = '#ffeaa7'; // Very bright warm light
          } else if (randLight > 0.3) {
            ctx.fillStyle = litColor; // Standard
          } else {
            ctx.fillStyle = '#553311'; // Dim
          }
          ctx.fillRect(c * cellW + 1, r * cellH + 1, cellW - 2, cellH - 2);
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  /**
   * Generate a procedural brick texture using canvas 2D.
   */
  static makeBrickTexture(w = 128, h = 128): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    const brickW = 20;
    const brickH = 10;
    const mortar  = 2;

    ctx.fillStyle = '#1a0a08';
    ctx.fillRect(0, 0, w, h);

    for (let row = 0; row < h / brickH; row++) {
      const offset = (row % 2) * (brickW / 2);
      for (let col = -1; col < w / brickW + 1; col++) {
        const x = col * brickW + offset;
        const y = row * brickH;
        // Slight colour variation
        const v = Math.random() * 0.15;
        ctx.fillStyle = `rgb(${Math.floor((100 + v * 40))},${Math.floor((30 + v * 20))},${Math.floor((20 + v * 15))})`;
        ctx.fillRect(x + mortar, y + mortar, brickW - mortar, brickH - mortar);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  /**
   * Register a texture (for scenes that preload assets).
   */
  static register(key: string, texture: THREE.Texture): void {
    Assets.textures.set(key, texture);
    Assets.loaded++;
    Assets.reportProgress(key);
  }

  static get(key: string): THREE.Texture | undefined {
    return Assets.textures.get(key);
  }

  static addToTotal(n: number): void {
    Assets.total += n;
  }

  /** Dispose all cached textures */
  static disposeAll(): void {
    Assets.textures.forEach((t) => t.dispose());
    Assets.textures.clear();
  }
}
