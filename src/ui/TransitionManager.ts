// ─────────────────────────────────────────────────────────────────────────────
//  TransitionManager.ts  –  Custom per-scene transition animations
//
//  Three transitions:
//   • "desk"   — Paper Slam: paper flies down and slams onto screen
//   • "board"  — Static Wipe: VHS-style horizontal noise wipe left-to-right
//   • "street" — Spray Paint: cyan spray fills from corner, drips off to reveal
//   • default  — Quick black flash
//
//  Each cover() call returns a reveal function that runs after enter().
// ─────────────────────────────────────────────────────────────────────────────

import gsap from 'gsap';
import type { SceneId } from '../core/SceneManager';
import type { AudioManager } from '../core/AudioManager';

type RevealFn = () => Promise<void>;

export class TransitionManager {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wrap: HTMLDivElement;

  constructor(private audio: AudioManager) {
    // Fullscreen overlay wrapper
    this.wrap = document.createElement('div');
    Object.assign(this.wrap.style, {
      position: 'fixed', inset: '0',
      zIndex: '9999',
      pointerEvents: 'none',
      overflow: 'hidden',
    });
    document.body.appendChild(this.wrap);

    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      position: 'absolute', inset: '0',
      width: '100%', height: '100%',
      display: 'none', opacity: '1',
    });
    this.wrap.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** Call before scene swap. Returns a reveal fn to call after enter(). */
  async cover(from: SceneId | null, to: SceneId): Promise<RevealFn> {
    this.resizeCanvas();
    if (to === 'desk') return this.paperSlamCover();
    if (to === 'board') return this.staticWipeCover();
    if (to === 'street') return this.sprayPaintCover();
    return this.blackFlashCover();
  }

  dispose(): void { this.wrap.remove(); }

  // ── Resize canvas to current viewport ─────────────────────────────────────
  private resizeCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private raf(): Promise<void> {
    return new Promise(r => requestAnimationFrame(() => r()));
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  1. PAPER SLAM  (→ desk)
  // ══════════════════════════════════════════════════════════════════════════
  private async paperSlamCover(): Promise<RevealFn> {
    const W = this.canvas.width, H = this.canvas.height;
    const ctx = this.ctx;

    // Dark background appears instantly
    this.canvas.style.display = 'block';
    this.canvas.style.opacity = '1';
    ctx.fillStyle = '#090608';
    ctx.fillRect(0, 0, W, H);

    // Build paper div in the overlay
    const pW = Math.min(560, W * 0.48);
    const pH = pW * 1.38;
    const pX = (W - pW) / 2;
    const pY = (H - pH) / 2;

    const paper = document.createElement('div');
    Object.assign(paper.style, {
      position: 'absolute',
      width: `${pW}px`,
      height: `${pH}px`,
      left: `${pX}px`,
      top: `${-pH - 40}px`,
      background: 'linear-gradient(160deg,#f0e6c8 0%,#e2d4a8 100%)',
      borderRadius: '3px',
      boxShadow: '0 40px 80px rgba(0,0,0,0.85)',
      transformOrigin: 'center bottom',
      willChange: 'transform,top',
    });

    // Stamp lines on paper for detail
    const stampHTML = `
      <div style="position:absolute;inset:0;padding:24px;box-sizing:border-box;font-family:'Courier New',monospace;color:rgba(0,0,0,0.18);font-size:11px;line-height:1.8;overflow:hidden">
        ${'&mdash;&mdash;&mdash;&mdash;&mdash;&mdash;&mdash;&mdash;&mdash;&mdash;&mdash;&mdash;&mdash;&mdash;<br>'.repeat(22)}
      </div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-12deg);font-family:'Courier New',monospace;font-size:clamp(18px,3vw,28px);font-weight:900;color:rgba(160,30,30,0.55);border:3px solid rgba(160,30,30,0.45);padding:6px 18px;letter-spacing:4px;white-space:nowrap">
        CLASSIFIED
      </div>
    `;
    paper.innerHTML = stampHTML;
    this.wrap.appendChild(paper);

    // Whoosh audio as paper falls
    this.audio.playWhoosh();

    // Paper slams down (power4.in for fast acceleration)
    await new Promise<void>(resolve => {
      gsap.to(paper, {
        top: pY,
        duration: 0.38,
        ease: 'power4.in',
        onComplete: () => {
          // Slam sound + squash bounce
          this.audio.playPaperSlam();
          // Draw impact dust puffs on canvas
          this.drawImpactPuff(W / 2, pY + pH, W);
          gsap.timeline({ onComplete: resolve })
            .to(paper, { scaleX: 1.05, scaleY: 0.88, duration: 0.055, ease: 'power1.out' })
            .to(paper, { scaleX: 1.00, scaleY: 1.00, duration: 0.18, ease: 'elastic.out(1,0.4)' });
        },
      });
    });

    // Hold briefly so you can read "CLASSIFIED"
    await new Promise(r => setTimeout(r, 380));

    return async () => {
      // Paper slides back up fast and overlay fades
      gsap.to(paper, {
        top: -pH - 40, duration: 0.35, ease: 'power3.in',
        onComplete: () => paper.remove(),
      });
      await new Promise<void>(resolve => {
        gsap.to(this.canvas, {
          opacity: 0, duration: 0.4, delay: 0.1, ease: 'power2.inOut',
          onComplete: () => {
            this.canvas.style.display = 'none';
            this.canvas.style.opacity = '1';
            resolve();
          },
        });
      });
    };
  }

  private drawImpactPuff(cx: number, cy: number, W: number): void {
    const ctx = this.ctx;
    ctx.save();
    const count = 14;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = 18 + Math.random() * 28;
      const px = cx + Math.cos(angle) * r * (W / 1200);
      const py = cy + Math.sin(angle) * r * 0.35;
      const size = 3 + Math.random() * 6;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(210,195,160,${0.3 + Math.random() * 0.4})`;
      ctx.fill();
    }
    ctx.restore();
    // Fade puffs out
    setTimeout(() => {
      const H = this.canvas.height;
      this.ctx.fillStyle = '#090608';
      this.ctx.fillRect(0, cy - 5, this.canvas.width, H);
    }, 120);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  2. SWOOSH WIPE  (→ board)
  // ══════════════════════════════════════════════════════════════════════════
  private async staticWipeCover(): Promise<RevealFn> {
    this.canvas.style.display = 'block';
    this.canvas.style.opacity = '1';
    const ctx = this.ctx;

    this.audio.playWhoosh();

    // Generate continuous full-length horizontal speedlines
    const W = this.canvas.width, H = this.canvas.height;
    const lines: { y: number; h: number; speed: number; offset: number }[] = [];
    for (let i = 0; i < 50; i++) {
      lines.push({
        y: Math.random() * H,
        h: 1 + Math.random() * 4,
        speed: W * (2.0 + Math.random() * 2.0), // Pixels per second
        offset: Math.random() * W * 3, // Distribute initially
      });
    }

    let lastTime = performance.now();

    // Wipe IN (left → right)
    // Block travels distance W (from x=-2W to x=-W)
    await new Promise<void>(resolve => {
      let t = 0;
      const step = (now: number) => {
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        t += dt / 0.35; // 350ms to travel W

        ctx.clearRect(0, 0, W, H);

        // 2-screen wide solid black block
        const blockX = -W * 2 + (W * Math.min(t, 1));

        ctx.fillStyle = '#060508';
        ctx.fillRect(blockX, 0, W * 2, H);

        // Continuous stream of lines clipped to the black block
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = '#ffffff';
        lines.forEach(line => {
          line.offset += line.speed * dt;
          if (line.offset > W * 2) line.offset -= W * 4; // Wrap seamlessly
          ctx.fillRect(line.offset, line.y, W, line.h);
        });
        ctx.globalCompositeOperation = 'source-over';

        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    await new Promise(r => setTimeout(r, 150));

    return async () => {
      // Wipe OUT (left → right reveal)
      // Block travels distance 2W (from x=-W to x=W) to fully clear the screen
      this.audio.playWhoosh();
      lastTime = performance.now();

      await new Promise<void>(resolve => {
        let t = 0;
        const step = (now: number) => {
          const dt = (now - lastTime) / 1000;
          lastTime = now;
          t += dt / 0.70; // 700ms to travel 2W (constant speed)

          ctx.clearRect(0, 0, W, H);

          // 2-screen wide block continuing its momentum
          const blockX = -W + (2 * W * Math.min(t, 1));

          if (blockX < W) {
            ctx.fillStyle = '#060508';
            ctx.fillRect(blockX, 0, W * 2, H);

            // Continuous lines ONLY over the remaining black area
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = '#ffffff';
            lines.forEach(line => {
              line.offset += line.speed * dt;
              if (line.offset > W * 2) line.offset -= W * 4;
              ctx.fillRect(line.offset, line.y, W, line.h);
            });
            ctx.globalCompositeOperation = 'source-over';
          }

          if (t < 1) requestAnimationFrame(step);
          else {
            this.canvas.style.display = 'none';
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  3. SPRAY PAINT  (→ street)
  // ══════════════════════════════════════════════════════════════════════════
  private async sprayPaintCover(): Promise<RevealFn> {
    this.canvas.style.display = 'block';
    this.canvas.style.opacity = '1';
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;

    this.audio.playSpray(1.8);

    const offCanvas = document.createElement('canvas');
    offCanvas.width = W; offCanvas.height = H;
    const offCtx = offCanvas.getContext('2d')!;

    // We simulate a spray can moving back and forth (zigzag), row by row
    let dir = 1; // 1 = right, -1 = left
    let bx = -W * 0.2;
    let by = H * 0.1;
    let row = 0;
    const totalRows = 5;
    const rowHeight = H / (totalRows - 1);

    // Muted cyan paint color
    const paintColor = '#2bb5caff';

    let lastTime = performance.now();
    await new Promise<void>(resolve => {
      const step = (now: number) => {
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        // Speed to finish all rows in ~1.4s
        const speedX = (W * 1.4) * (totalRows / 1.4);

        const oldBx = bx;
        bx += dir * speedX * dt;

        offCtx.lineJoin = 'round';
        offCtx.lineCap = 'round';
        offCtx.lineWidth = Math.min(W, H) * 0.45;

        // Spray stroke without glow
        offCtx.strokeStyle = paintColor;

        offCtx.beginPath();
        offCtx.moveTo(oldBx, by);
        offCtx.lineTo(bx, by);
        offCtx.stroke();

        // Check bounds and reverse direction
        if ((dir === 1 && bx > W * 1.2) || (dir === -1 && bx < -W * 0.2)) {
          dir *= -1; // Reverse direction
          row++;     // Move down one row
          by += rowHeight;
        }

        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(offCanvas, 0, 0);

        if (row < totalRows) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    // Ensure completely covered at the end
    ctx.fillStyle = paintColor;
    ctx.fillRect(0, 0, W, H);

    await new Promise(r => setTimeout(r, 250));

    // REVEAL: paint drips downward off the bottom of the screen
    return async () => {
      this.audio.playDrip();

      const COLS = 60;
      const colW = Math.ceil(W / COLS);
      const drips = Array.from({ length: COLS }, () => ({
        y: 0, // The TOP of the paint column (moving down to reveal the scene above it)
        speed: H * (1.2 + Math.random() * 1.5), // pixels per second
        delay: Math.random() * 0.35, // seconds
      }));

      lastTime = performance.now();
      await new Promise<void>(resolve => {
        const step = (now: number) => {
          const dt = (now - lastTime) / 1000;
          lastTime = now;
          this.ctx.clearRect(0, 0, W, H);

          let allDone = true;
          drips.forEach((drip, i) => {
            if (drip.delay > 0) {
              drip.delay -= dt;
              allDone = false;
            } else {
              drip.y += drip.speed * dt;
              if (drip.y < H) allDone = false;
            }

            // Draw the paint block sliding off the bottom
            if (drip.y < H) {
              this.ctx.fillStyle = paintColor;
              this.ctx.fillRect(i * colW, drip.y, colW, H - drip.y);

              // Liquid tearing meniscus at the top
              if (drip.y > 0) {
                this.ctx.beginPath();
                this.ctx.arc(i * colW + colW / 2, drip.y, colW / 2, 0, Math.PI * 2);
                this.ctx.fill();
              }
            }
          });

          if (!allDone) requestAnimationFrame(step);
          else {
            this.canvas.style.display = 'none';
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  4. DEFAULT  (quick black flash for boot / rooftop)
  // ══════════════════════════════════════════════════════════════════════════
  private async blackFlashCover(): Promise<RevealFn> {
    this.canvas.style.display = 'block';
    this.canvas.style.opacity = '1';
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    await new Promise(r => setTimeout(r, 200));

    return async () => {
      await new Promise<void>(resolve => {
        gsap.to(this.canvas, {
          opacity: 0, duration: 0.45, ease: 'power2.inOut',
          onComplete: () => {
            this.canvas.style.opacity = '1';
            this.canvas.style.display = 'none';
            resolve();
          },
        });
      });
    };
  }
}
