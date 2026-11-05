// Kolor aplikacji (v2, decyzja Jacka z 5.11.2026): 10 gotowych kolorów albo własny. Każdy kolor ma wersję
// dla motywu jasnego i ciemnego z kontrastem co najmniej 4,5:1 do tła i kart, więc tekst w kolorze akcentu
// (tytuły, linki) i przyciski zawsze są czytelne. Własny kolor aplikacja dopasowuje (jaśniej/ciemniej),
// nie pozwala użyć wersji zlewającej się z tłem. Zapamiętany na urządzeniu, jak motyw. Logika bez DOM – testowana.

export interface ThemeColors {
  accent: string;
  text: string; // kolor napisu na przycisku w kolorze akcentu
}

export interface AccentColors {
  light: ThemeColors;
  dark: ThemeColors;
}

export interface Preset {
  id: string;
  name: string;
  light: string;
  dark: string;
}

/** Tła motywów – muszą zgadzać się z :root w styles.css. */
export const BACKGROUNDS = {
  light: ['#ffffff', '#f4f5f7'],
  dark: ['#262624', '#30302e'],
} as const;

export const MIN_CONTRAST = 4.5;

export const PRESETS: Preset[] = [
  { id: 'klub', name: 'Granat i bursztyn', light: '#1f3a6b', dark: '#ffc83d' },
  { id: 'blue', name: 'Niebieski', light: '#1c5fb8', dark: '#6fb1ff' },
  { id: 'teal', name: 'Morski', light: '#0b6e6e', dark: '#4fd1c5' },
  { id: 'green', name: 'Zielony', light: '#1e6b34', dark: '#74d68a' },
  { id: 'olive', name: 'Oliwkowy', light: '#56601a', dark: '#c5d35a' },
  { id: 'orange', name: 'Pomarańczowy', light: '#a14000', dark: '#ffa560' },
  { id: 'raspberry', name: 'Malinowy', light: '#b0174f', dark: '#ff7aa8' },
  { id: 'violet', name: 'Fioletowy', light: '#5b2a9e', dark: '#c3a2ff' },
  { id: 'plum', name: 'Śliwkowy', light: '#7a1f6b', dark: '#f08fe0' },
  { id: 'graphite', name: 'Grafitowy', light: '#3b4250', dark: '#d0d4dc' },
];

export const DEFAULT_ACCENT = 'klub';

// ---------- kolory ----------

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb: [number, number, number]) =>
  `#${rgb
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

export function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return [h / 6, s, l];
}

function fromHsl([h, s, l]: [number, number, number]): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [ch(h + 1 / 3) * 255, ch(h) * 255, ch(h - 1 / 3) * 255];
}

const minContrast = (hex: string, theme: keyof typeof BACKGROUNDS) => Math.min(...BACKGROUNDS[theme].map((bg) => contrast(hex, bg)));

/**
 * Wersja koloru czytelna w danym motywie: ten sam odcień, jasność zmieniana (ciemniej na jasnym tle,
 * jaśniej na ciemnym), aż kontrast z tłem i kartami osiągnie MIN_CONTRAST.
 */
export function fitToTheme(hex: string, theme: keyof typeof BACKGROUNDS): string {
  const rgb = parseHex(hex);
  if (!rgb) return theme === 'light' ? PRESETS[0].light : PRESETS[0].dark;
  if (minContrast(toHex(rgb), theme) >= MIN_CONTRAST) return toHex(rgb);
  const [h, s, l] = toHsl(rgb);
  const step = theme === 'light' ? -0.01 : 0.01;
  for (let ll = l; ll >= 0 && ll <= 1; ll += step) {
    const candidate = toHex(fromHsl([h, s, ll]));
    if (minContrast(candidate, theme) >= MIN_CONTRAST) return candidate;
  }
  return theme === 'light' ? '#000000' : '#ffffff';
}

/** Napis na przycisku: biały albo ciemny – ten, który daje większy kontrast. */
export function textOn(accent: string): string {
  return contrast(accent, '#ffffff') >= contrast(accent, '#1a1a1a') ? '#ffffff' : '#1a1a1a';
}

/** Wybór z ustawień: id gotowego koloru albo „#rrggbb” (własny). */
export function resolveAccent(choice: string | null | undefined): AccentColors {
  const preset = PRESETS.find((p) => p.id === choice);
  const custom = !preset && choice && parseHex(choice) ? choice : null;
  const light = preset ? preset.light : custom ? fitToTheme(custom, 'light') : PRESETS[0].light;
  const dark = preset ? preset.dark : custom ? fitToTheme(custom, 'dark') : PRESETS[0].dark;
  return { light: { accent: light, text: textOn(light) }, dark: { accent: dark, text: textOn(dark) } };
}

/** Reguły CSS nadpisujące zmienne akcentu w obu motywach (wstrzykiwane przed renderem – bez błysku). */
export function accentCss(colors: AccentColors): string {
  const block = (t: ThemeColors) => `--accent:${t.accent};--accent-text:${t.text};--focus:${t.accent};`;
  // wyższa szczegółowość niż :root[data-theme] w styles.css – arkusz aplikacji ładuje się później
  return `:root:root:not([data-theme='dark']){${block(colors.light)}}:root:root[data-theme='dark']{${block(colors.dark)}}`;
}
