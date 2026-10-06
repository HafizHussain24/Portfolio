// ─────────────────────────────────────────────────────────────────────────────
//  BaseScene.ts  –  Abstract base class for all scenes
//  Provides default no-op implementations so concrete scenes only
//  override what they need.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import type { IScene, SceneDeps } from '../core/SceneManager';
import { RetroRenderer } from '../core/RetroRenderer';

export abstract class BaseScene implements IScene {
  readonly scene  = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  protected deps!: SceneDeps;

  /** Disposable resources registered via track() */
  private _disposables: Array<{ dispose(): void }> = [];

  constructor() {
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 5, 20);

    // Standard fog
    this.scene.fog = RetroRenderer.makeFog();

    window.addEventListener('resize', this.onResize);
  }

  async init(deps: SceneDeps): Promise<void> {
    this.deps = deps;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async enter(): Promise<void> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async exit(): Promise<void>  {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  update(_dt: number, _time: number): void {}

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];

    // Walk the scene and dispose all geometries + materials
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
    this.scene.clear();
  }

  /** Register any disposable (texture, render target, etc.) for automatic cleanup */
  protected track<T extends { dispose(): void }>(item: T): T {
    this._disposables.push(item);
    return item;
  }

  protected onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };
}
