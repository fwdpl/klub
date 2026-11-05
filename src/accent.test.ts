import { describe, expect, it } from 'vitest';
import { BACKGROUNDS, MIN_CONTRAST, PRESETS, accentCss, contrast, fitToTheme, resolveAccent, textOn } from './accent';

const readable = (hex: string, theme: 'light' | 'dark') => BACKGROUNDS[theme].every((bg) => contrast(hex, bg) >= MIN_CONTRAST);

describe('kolor aplikacji', () => {
  it('10 gotowych kolorów, każdy czytelny w obu motywach (tekst i przyciski)', () => {
    expect(PRESETS).toHaveLength(10);
    for (const p of PRESETS) {
      expect(readable(p.light, 'light'), `${p.name} – jasny`).toBe(true);
      expect(readable(p.dark, 'dark'), `${p.name} – ciemny`).toBe(true);
      for (const hex of [p.light, p.dark]) expect(contrast(hex, textOn(hex)), `${p.name} – napis na przycisku`).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('własny kolor: zlewający się z tłem zostaje dopasowany, czytelny bez zmian', () => {
    // żółty na białym tle i granat na ciemnym są nieczytelne – aplikacja je przyciemnia / rozjaśnia
    const yellowOnLight = fitToTheme('#ffe000', 'light');
    const navyOnDark = fitToTheme('#101a40', 'dark');
    expect(readable(yellowOnLight, 'light')).toBe(true);
    expect(readable(navyOnDark, 'dark')).toBe(true);
    expect(yellowOnLight).not.toBe('#ffe000');
    expect(fitToTheme('#1c5fb8', 'light')).toBe('#1c5fb8');
    // nawet biały i czarny dają czytelny wynik
    expect(readable(fitToTheme('#ffffff', 'light'), 'light')).toBe(true);
    expect(readable(fitToTheme('#000000', 'dark'), 'dark')).toBe(true);
  });

  it('wybór → kolory obu motywów i CSS', () => {
    expect(resolveAccent('teal').dark.accent).toBe('#4fd1c5');
    expect(resolveAccent(null)).toEqual(resolveAccent('klub'));
    expect(resolveAccent('zly-wybor')).toEqual(resolveAccent('klub'));
    const custom = resolveAccent('#ff00aa');
    expect(readable(custom.light.accent, 'light') && readable(custom.dark.accent, 'dark')).toBe(true);
    const css = accentCss(resolveAccent('klub'));
    expect(css).toContain(":root:root[data-theme='dark']{--accent:#ffc83d;--accent-text:#1a1a1a;--focus:#ffc83d;}");
  });
});
