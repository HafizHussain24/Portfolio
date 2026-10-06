// ─────────────────────────────────────────────────────────────────────────────
//  HUD.ts  –  Persistent heads-up display overlay
//
//  Renders on top of the canvas (pointer-events: none on the container,
//  pointer-events: auto on interactive elements).
//  Elements:
//   • Objective text (top-left)
//   • Mute toggle (top-right)
//   • Performance mode toggle (top-right)
//   • "Plain version" link (top-right)
//   • Scene name / chapter breadcrumb (bottom-left)
//   • Back-to-rooftop button (appears outside boot/rooftop scenes)
// ─────────────────────────────────────────────────────────────────────────────

import type { AudioManager } from '../core/AudioManager';
import type { SceneId }      from '../core/SceneManager';
import type { RetroRenderer } from '../core/RetroRenderer';
import { WORLD }             from '../content';

export class HUD {
  private el: HTMLElement;
  private objectiveEl: HTMLElement;
  private muteBtn: HTMLButtonElement;
  private perfBtn: HTMLButtonElement;
  private backBtn: HTMLButtonElement;
  private chapterEl: HTMLElement;

  private audio: AudioManager;
  private renderer: RetroRenderer;
  private onBack: (() => void) | null = null;

  constructor(audio: AudioManager, renderer: RetroRenderer) {
    this.audio    = audio;
    this.renderer = renderer;
    this.el       = this.build();
    document.body.appendChild(this.el);

    this.objectiveEl = this.el.querySelector('[data-hud="objective"]') as HTMLElement;
    this.muteBtn     = this.el.querySelector('[data-hud="mute"]') as HTMLButtonElement;
    this.perfBtn     = this.el.querySelector('[data-hud="perf"]') as HTMLButtonElement;
    this.backBtn     = this.el.querySelector('[data-hud="back"]') as HTMLButtonElement;
    this.chapterEl   = this.el.querySelector('[data-hud="chapter"]') as HTMLElement;

    this.wireEvents();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setScene(id: SceneId): void {
    const chapterNames: Record<SceneId, string> = {
      boot:    '',
      rooftop: 'HUB · ROOFTOP',
      desk:    'CH.1 · THE SUSPECT',
      board:   'CH.2 · THE EVIDENCE',
      street:  'CH.3 · THE WALL',
    };
    if (this.chapterEl) {
      this.chapterEl.textContent = chapterNames[id] ?? '';
    }

    // Show back button only outside boot + rooftop
    const showBack = id !== 'boot' && id !== 'rooftop';
    this.backBtn.style.display = showBack ? 'block' : 'none';

    // Hide HUD entirely during boot
    this.el.style.opacity = id === 'boot' ? '0' : '1';
    this.el.style.pointerEvents = id === 'boot' ? 'none' : '';
  }

  setOnBack(cb: () => void): void {
    this.onBack = cb;
  }

  setObjective(text: string): void {
    if (this.objectiveEl) {
      this.objectiveEl.textContent = text;
    }
  }

  show(): void { this.el.style.opacity = '1'; }
  hide(): void { this.el.style.opacity = '0'; this.el.style.pointerEvents = 'none'; }

  dispose(): void {
    this.el.remove();
  }

  // ── Private: Build DOM ───────────────────────────────────────────────────
  private build(): HTMLElement {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.setAttribute('aria-label', 'Game HUD overlay');
    hud.innerHTML = /* html */ `
      <!-- Objective (top-left) removed per request -->

      <!-- Controls (top-right) -->
      <div class="hud-top-right" role="toolbar" aria-label="Controls">
        <button
          class="hud-btn"
          data-hud="mute"
          id="hud-mute-btn"
          aria-label="Toggle sound"
          aria-pressed="false"
          title="Toggle sound (M)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path class="icon-on"  d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
            <path class="icon-off" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" display="none"/>
          </svg>
        </button>

        <button
          class="hud-btn"
          data-hud="perf"
          id="hud-perf-btn"
          aria-label="Toggle performance mode"
          aria-pressed="false"
          title="Performance mode (P)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M13 2.05v2.02c3.95.49 7 3.85 7 7.93 0 3.21-1.81 6-4.72 7.72L13 17v5h5l-1.22-1.22C19.91 19.07 22 15.76 22 12c0-5.18-3.95-9.45-9-9.95zM11 2.05C5.95 2.55 2 6.82 2 12c0 3.76 2.09 7.07 5.22 8.78L6 22h5V2.05zM9 16.5c-2.43-1.28-4-3.79-4-6.5 0-3.34 2.15-6.17 5-7.3V16.5z"/>
          </svg>
        </button>

        <a
          class="hud-btn hud-plain-link"
          href="/plain.html"
          target="_blank"
          rel="noopener"
          aria-label="Plain version – accessible, no 3D"
          title="Plain version (no 3D)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM9 13v3h2v-3h2v-1H9zm4 0v1h2v1h-2v1h3v-3h-3z"/>
          </svg>
          <span class="hud-btn-label">PLAIN</span>
        </a>
      </div>

      <!-- Chapter / scene name (bottom-left) removed per request -->

      <!-- Back button (bottom-right, hidden on rooftop) -->
      <div class="hud-bottom-right">
        <button
          class="hud-btn hud-back"
          data-hud="back"
          id="hud-back-btn"
          aria-label="Return to rooftop hub"
          style="display:none"
        >
          ← ROOFTOP
        </button>
      </div>
    `;
    return hud;
  }

  private wireEvents(): void {
    // Mute
    this.muteBtn.addEventListener('click', () => {
      this.audio.toggleMute();
      const m = this.audio.muted;
      this.muteBtn.setAttribute('aria-pressed', String(m));
      this.muteBtn.querySelector('.icon-on')!.setAttribute('display',  m ? 'none' : '');
      this.muteBtn.querySelector('.icon-off')!.setAttribute('display', m ? ''     : 'none');
    });

    // Performance mode
    this.perfBtn.addEventListener('click', () => {
      const next = !this.renderer.state.performanceMode;
      this.renderer.setPerformanceMode(next);
      this.perfBtn.setAttribute('aria-pressed', String(next));
      this.perfBtn.classList.toggle('active', next);
      this.audio.playClick();
    });

    // Back to rooftop
    this.backBtn.addEventListener('click', () => {
      this.audio.playClick();
      this.onBack?.();
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') this.muteBtn.click();
      if (e.key === 'p' || e.key === 'P') this.perfBtn.click();
    });
  }
}
