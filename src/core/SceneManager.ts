// ─────────────────────────────────────────────────────────────────────────────
//  SceneManager.ts  –  Lifecycle orchestrator for all 3D scenes
//
//  Each scene must implement the IScene interface.
//  SceneManager handles:
//   • Lazy dynamic imports (code-splitting per scene)
//   • enter / exit / update / dispose calls
//   • Transition callbacks (fade, chapter card)
//   • Proper cleanup on scene change to prevent memory leaks
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import type { RetroRenderer } from './RetroRenderer';
import type { AudioManager } from './AudioManager';
import type { InputManager } from './Input';

// ─── Scene interface ───────────────────────────────────────────────────────────
export interface IScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;

  /** Called once when this scene is first loaded and added to the manager */
  init(deps: SceneDeps): Promise<void>;

  /** Called every time this scene becomes active (after transition in) */
  enter(): Promise<void>;

  /** Called when transitioning away from this scene */
  exit(): Promise<void>;

  /** Called every frame while this scene is active */
  update(dt: number, time: number): void;

  /** Called when the scene is permanently removed — free ALL resources */
  dispose(): void;
}

export interface SceneDeps {
  renderer: RetroRenderer;
  audio: AudioManager;
  input: InputManager;
  navigate: (to: SceneId) => void;
}

export type SceneId = 'boot' | 'rooftop' | 'desk' | 'board' | 'street';

// ─── Transition types ─────────────────────────────────────────────────────────
export type TransitionFn = (from: SceneId | null, to: SceneId) => Promise<() => Promise<void>>;

// ─── SceneManager ─────────────────────────────────────────────────────────────
export class SceneManager {
  private current: IScene | null = null;
  private currentId: SceneId | null = null;
  private cache: Map<SceneId, IScene> = new Map();
  private deps!: SceneDeps;

  private onTransition: TransitionFn | null = null;
  private isTransitioning = false;

  private clock = new THREE.Clock();
  private rafId = 0;
  private paused = false;

  // ── Initialise with dependencies ────────────────────────────────────────
  init(deps: Omit<SceneDeps, 'navigate'>): void {
    this.deps = {
      ...deps,
      navigate: (id) => this.navigateTo(id),
    };

    // Pause rendering when the tab is hidden (performance budget)
    document.addEventListener('visibilitychange', () => {
      this.paused = document.hidden;
      if (!this.paused) this.clock.getDelta(); // reset delta after pause
    });
  }

  setTransitionHandler(fn: TransitionFn): void {
    this.onTransition = fn;
  }

  // ── Navigate ─────────────────────────────────────────────────────────────
  async navigateTo(id: SceneId): Promise<void> {
    if (this.isTransitioning || id === this.currentId) return;
    this.isTransitioning = true;

    try {
      // 1. Load the next scene (lazy import + init if not cached)
      const next = await this.loadScene(id);

      // 2. Run transition (fade, chapter card, etc.)
      let revealFn: (() => Promise<void>) | null = null;
      if (this.onTransition) {
        revealFn = await this.onTransition(this.currentId, id);
      }

      // 3. Exit current scene
      if (this.current) {
        await this.current.exit();
      }

      // 4. Activate next
      this.current   = next;
      this.currentId = id;
      await this.current.enter();

      // 5. Reveal next scene
      if (revealFn) {
        await revealFn();
      }
    } catch (err) {
      console.error('[SceneManager] Navigation failed:', err);
    } finally {
      this.isTransitioning = false;
    }
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  startLoop(renderer: RetroRenderer): void {
    this.clock.start();
    const tick = (): void => {
      this.rafId = requestAnimationFrame(tick);
      if (this.paused || !this.current) return;

      const dt   = Math.min(this.clock.getDelta(), 0.05); // cap at 50ms
      const time = this.clock.getElapsedTime();

      this.current.update(dt, time);
      renderer.render(this.current.scene, this.current.camera, time);
    };
    tick();
  }

  stopLoop(): void {
    cancelAnimationFrame(this.rafId);
  }

  // ── Dispose a scene and remove from cache ────────────────────────────────
  disposeScene(id: SceneId): void {
    const scene = this.cache.get(id);
    if (scene) {
      scene.dispose();
      this.cache.delete(id);
    }
  }

  disposeAll(): void {
    for (const id of this.cache.keys()) {
      this.disposeScene(id);
    }
    this.stopLoop();
  }

  get activeId(): SceneId | null { return this.currentId; }

  // ── Private: lazy load ────────────────────────────────────────────────────
  private async loadScene(id: SceneId): Promise<IScene> {
    if (this.cache.has(id)) return this.cache.get(id)!;

    // Dynamic imports — each scene is a separate chunk
    let SceneClass: new () => IScene;

    switch (id) {
      case 'boot':
        SceneClass = (await import('../scenes/BootScene')).BootScene;
        break;
      case 'rooftop':
        SceneClass = (await import('../scenes/RooftopScene')).RooftopScene;
        break;
      case 'desk':
        SceneClass = (await import('../scenes/DeskScene')).DeskScene;
        break;
      case 'board':
        SceneClass = (await import('../scenes/BoardScene')).BoardScene;
        break;
      case 'street':
        SceneClass = (await import('../scenes/StreetScene')).StreetScene;
        break;
      default:
        throw new Error(`[SceneManager] Unknown scene: ${id}`);
    }

    const instance = new SceneClass();
    await instance.init(this.deps);
    this.cache.set(id, instance);
    return instance;
  }
}
