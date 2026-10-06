// ─────────────────────────────────────────────────────────────────────────────
//  Toast.ts  –  Lightweight toast notification
//  Used for clipboard copy confirmation, easter egg reveals, etc.
// ─────────────────────────────────────────────────────────────────────────────

let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message: string, durationMs = 2200): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  getContainer().appendChild(el);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('show'));
  });

  // Animate out + remove
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, durationMs);
}
