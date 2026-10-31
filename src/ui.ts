type Attrs = Record<string, string | boolean | EventListener | undefined>;

/** Mały pomocnik do budowania DOM bez frameworka. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === false) continue;
    el.append(child);
  }
  return el;
}

const appEl = document.getElementById('app') as HTMLElement;

export function render(...nodes: Node[]): void {
  appEl.replaceChildren(...nodes);
  appEl.hidden = false;
}

let toastTimer: number | undefined;

export function toast(message: string, action?: { label: string; run: () => void }): void {
  const el = document.getElementById('toast') as HTMLElement;
  window.clearTimeout(toastTimer);
  el.replaceChildren(h('span', {}, message));
  if (action) {
    el.append(h('button', { type: 'button', onclick: () => { el.hidden = true; action.run(); } }, action.label));
  } else {
    toastTimer = window.setTimeout(() => (el.hidden = true), 5000);
  }
  el.hidden = false;
}

const MIN_SPLASH_MS = 700;
const splashStart = performance.now();

export async function hideSplash(): Promise<void> {
  const el = document.getElementById('splash');
  if (!el) return;
  const wait = MIN_SPLASH_MS - (performance.now() - splashStart);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  el.classList.add('splash--done');
  await new Promise((r) => setTimeout(r, 250));
  el.classList.add('splash--hide');
  setTimeout(() => el.remove(), 400);
}
