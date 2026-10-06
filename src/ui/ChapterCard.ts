// ─────────────────────────────────────────────────────────────────────────────
//  ChapterCard.ts  –  Chapter title card overlay
//
//  Typewriter text + glitch effect shown between scene transitions.
//  Fades in, holds for a moment, fades out.
// ─────────────────────────────────────────────────────────────────────────────

import { WORLD } from '../content';

export interface ChapterCardOptions {
  title: string;
  subtitle?: string;
  holdMs?: number;
}

export class ChapterCard {
  private el: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'chapter-card';
    this.el.setAttribute('aria-live', 'assertive');
    this.el.setAttribute('aria-atomic', 'true');
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  async show({ title, subtitle, holdMs = 1800 }: ChapterCardOptions): Promise<void> {
    this.el.innerHTML = /* html */ `
      <div class="chapter-card__inner">
        <div class="chapter-card__line"></div>
        <p class="chapter-card__city">${WORLD.cityName.toUpperCase()} — POLICE DEPARTMENT</p>
        <h2 class="chapter-card__title" aria-label="${title}"></h2>
        ${subtitle ? `<p class="chapter-card__sub">${subtitle}</p>` : ''}
        <div class="chapter-card__line"></div>
      </div>
    `;
    this.el.style.display = 'flex';

    // Fade in
    await this.fade(this.el, 0, 1, 400);

    // Typewriter
    const titleEl = this.el.querySelector('.chapter-card__title')!;
    await this.typewrite(titleEl as HTMLElement, title, 60);

    // Hold
    await this.wait(holdMs);

    // Glitch flash
    this.el.classList.add('glitch');
    await this.wait(300);
    this.el.classList.remove('glitch');

    // Fade out
    await this.fade(this.el, 1, 0, 500);
    this.el.style.display = 'none';
  }

  dispose(): void {
    this.el.remove();
  }

  // ── Private helpers ───────────────────────────────────────────────────────
  private typewrite(el: HTMLElement, text: string, msPerChar: number): Promise<void> {
    return new Promise((resolve) => {
      let i = 0;
      const tick = () => {
        el.textContent = text.slice(0, i);
        if (i < text.length) {
          i++;
          setTimeout(tick, msPerChar);
        } else {
          resolve();
        }
      };
      tick();
    });
  }

  private fade(el: HTMLElement, from: number, to: number, ms: number): Promise<void> {
    return new Promise((resolve) => {
      el.style.opacity = String(from);
      el.style.transition = `opacity ${ms}ms ease`;
      // Force reflow
      void el.offsetHeight;
      el.style.opacity = String(to);
      setTimeout(resolve, ms + 50);
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
