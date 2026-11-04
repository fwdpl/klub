import { describe, expect, it } from 'vitest';
import { segments } from './richText';

describe('tekst z pogrubieniem i linkami', () => {
  it('pogrubienie bez linków – jak dotąd', () => {
    expect(segments('Zbiórka **04:30** przy odprawie')).toEqual([
      { kind: 'text', text: 'Zbiórka ' },
      { kind: 'bold', text: '04:30' },
      { kind: 'text', text: ' przy odprawie' },
    ]);
  });

  it('adres https klikalny, kropka na końcu zdania poza adresem', () => {
    expect(segments('ESTA: https://esta.cbp.dhs.gov.')).toEqual([
      { kind: 'text', text: 'ESTA: ' },
      { kind: 'link', text: 'https://esta.cbp.dhs.gov' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('adres z parametrami i w nawiasie; kilka adresów', () => {
    expect(segments('(zob. https://example.com/a?b=1&c=2) i http://x.pl/y').filter((s) => s.kind === 'link')).toEqual([
      { kind: 'link', text: 'https://example.com/a?b=1&c=2' },
      { kind: 'link', text: 'http://x.pl/y' },
    ]);
  });

  it('bez http(s) – zwykły tekst (np. javascript: nie staje się linkiem)', () => {
    expect(segments('javascript:alert(1) www.example.com')).toEqual([{ kind: 'text', text: 'javascript:alert(1) www.example.com' }]);
  });
});
