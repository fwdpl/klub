import { DEFAULT_ACCENT, accentCss, resolveAccent } from './accent';

export type ThemePref = 'auto' | 'light' | 'dark';

const KEY = 'klub.theme';
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // brak dostępu do pamięci – zostaje „auto”
  }
  return 'auto';
}

function apply(pref: ThemePref): void {
  const dark = pref === 'dark' || (pref === 'auto' && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // Przy ręcznym wyborze jeden kolor paska przeglądarki; przy „auto” decydują znaczniki z atrybutem media
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    if (!m.dataset.media) m.dataset.media = m.media;
    m.media = pref === 'auto' ? m.dataset.media : '';
    if (pref !== 'auto') m.content = dark ? '#262624' : '#FFFFFF';
    else m.content = m.dataset.media.includes('dark') ? '#262624' : '#FFFFFF';
  });
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // zapis niemożliwy – motyw działa do końca sesji
  }
  apply(pref);
}

export function initTheme(): void {
  apply(getThemePref());
  darkQuery.addEventListener('change', () => {
    if (getThemePref() === 'auto') apply('auto');
  });
}

// ---------- kolor aplikacji (v2) ----------
// Wybór (id gotowego koloru albo „#rrggbb”) i gotowe reguły CSS w pamięci urządzenia;
// index.html wstrzykuje te reguły przed pierwszym renderem, więc nie ma błysku domyślnego koloru.

const ACCENT_KEY = 'klub.accent';
const ACCENT_CSS_KEY = 'klub.accentCss';
const STYLE_ID = 'accent-css';

export function getAccentChoice(): string {
  try {
    return localStorage.getItem(ACCENT_KEY) ?? DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

export function setAccentChoice(choice: string): void {
  const css = choice === DEFAULT_ACCENT ? '' : accentCss(resolveAccent(choice));
  try {
    if (choice === DEFAULT_ACCENT) {
      localStorage.removeItem(ACCENT_KEY);
      localStorage.removeItem(ACCENT_CSS_KEY);
    } else {
      localStorage.setItem(ACCENT_KEY, choice);
      localStorage.setItem(ACCENT_CSS_KEY, css);
    }
  } catch {
    // zapis niemożliwy – kolor działa do końca sesji
  }
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.append(style);
  }
  style.textContent = css;
}
