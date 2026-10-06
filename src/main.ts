// ─────────────────────────────────────────────────────────────────────────────
//  main.ts  –  Application entry point
//
//  Boot sequence:
//   1. Check WebGL → show fallback if unavailable
//   2. Detect performance mode (mobile / low-end)
//   3. Init RetroRenderer, AudioManager, InputManager, SceneManager
//   4. Build HUD + fade overlay
//   5. Wire transitions (fade + chapter card)
//   6. Navigate to boot scene (or skip if sessionStorage says we've booted)
//   7. Start render loop
// ─────────────────────────────────────────────────────────────────────────────

import './styles/main.css';

import { RetroRenderer }  from './core/RetroRenderer';
import { SceneManager }   from './core/SceneManager';
import type { SceneId }   from './core/SceneManager';
import { AudioManager }   from './core/AudioManager';
import { InputManager }   from './core/Input';
import { Assets }         from './core/Assets';
import { HUD }            from './ui/HUD';
import { TransitionManager } from './ui/TransitionManager';
import { showToast }      from './ui/Toast';
import { Notepad }        from './ui/Notepad';
import { EASTER_EGGS }    from './content';

// (Chapter titles are no longer needed as we use visual transitions)

// ── Main init ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {

  // ── 1. WebGL check ─────────────────────────────────────────────────────
  // if (!Assets.isWebGLAvailable()) {
  //   const fb = document.getElementById('webgl-fallback');
  //   if (fb) fb.classList.add('visible');
  //   return;
  // }

  // ── 2. Canvas ─────────────────────────────────────────────────────────
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('[main] #canvas element not found');

  // ── 3. Core systems ────────────────────────────────────────────────────
  const perfMode = Assets.shouldDefaultPerformanceMode();
  const renderer = new RetroRenderer({ canvas, performanceMode: perfMode });
  const audio    = new AudioManager();
  const input    = new InputManager();

  // ── 4. UI ──────────────────────────────────────────────────────────────
  const hud         = new HUD(audio, renderer);
  const transitions = new TransitionManager(audio);
  const notepad     = new Notepad(audio);

  // Attach to window so scenes can access it to mark quests complete
  (window as any).gameNotepad = notepad;

  // Moon tip DOM element
  const moonTip = document.createElement('div');
  moonTip.id = 'moon-tip';
  moonTip.textContent = EASTER_EGGS.moonMessage;
  moonTip.setAttribute('aria-live', 'polite');
  document.body.appendChild(moonTip);

  // Dev convenience: Shift+reload resets boot screen
  if (location.search.includes('reset') || (location.hash === '#reset')) {
    sessionStorage.removeItem('casefile_booted');
  }

  // Fade overlay
  const fadeOverlay = document.getElementById('fade-overlay')!;
  const loadingBar  = document.getElementById('loading-bar')!;

  // Loading bar tied to Assets
  Assets.onProgress((p) => {
    loadingBar.style.width  = `${p.ratio * 100}%`;
    if (p.ratio >= 1) {
      setTimeout(() => {
        loadingBar.style.opacity = '0';
      }, 600);
    }
  });

  // ── 5. Scene Manager ───────────────────────────────────────────────────
  const scenes = new SceneManager();

  // Back to rooftop
  hud.setOnBack(() => scenes.navigateTo('rooftop'));

  scenes.init({ renderer, audio, input });

  // ── 6. Transition handler ──────────────────────────────────────────────
  scenes.setTransitionHandler(async (from, to) => {
    // 1. Play the cover animation for the target scene
    const reveal = await transitions.cover(from, to);

    // Update HUD
    hud.setScene(to);

    // Audio / UI
    if (to !== 'boot') {
      hud.show();
    }

    // Return the reveal function to be called after enter()
    return reveal;
  });

  // ── 7. Konami Easter Egg ───────────────────────────────────────────────
  input.on('konami', () => {
    const on = document.body.classList.toggle('night-vision');
    audio.playClick();
    showToast(on ? '🕶  NIGHT VISION ON' : '🕶  NIGHT VISION OFF');
  });

  // ── 8. Moon click easter egg ──────────────────────────────────────────
  // The moon is a Three.js mesh; we detect clicks by comparing NDC coords
  // against a fixed screen region where the moon renders (top-right quadrant).
  // Phase 6 will replace this with proper raycasting.
  canvas.addEventListener('click', (e: MouseEvent) => {
    if (scenes.activeId !== 'rooftop') return;
    const nx = (e.clientX / window.innerWidth)  * 2 - 1;   // -1..1
    const ny = -(e.clientY / window.innerHeight) * 2 + 1;  // -1..1
    // Moon is roughly in top-left of the world scene, projects to ~(-0.7..−0.3, 0.5..0.85)
    if (nx < -0.25 && nx > -0.85 && ny > 0.45) {
      moonTip.classList.add('visible');
      audio.playHover();
      showToast(EASTER_EGGS.moonMessage);
      setTimeout(() => moonTip.classList.remove('visible'), 3000);
    }
  });

  // ── 9. Start ───────────────────────────────────────────────────────────
  scenes.startLoop(renderer);

  // Check if we've booted this session already
  const hasBooted = sessionStorage.getItem('casefile_booted');
  if (hasBooted) {
    // Fast path: go straight to rooftop with a quick flash
    await scenes.navigateTo('rooftop');
  } else {
    await scenes.navigateTo('boot');
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error('[CASEFILE] Fatal error:', err);
});
