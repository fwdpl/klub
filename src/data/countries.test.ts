import { describe, expect, it } from 'vitest';
import { COUNTRIES, countryName, currencyLabel, flag, plugsLabel, searchCountries, timeDiff } from './countries';
import { isValidZone } from '../plan/time';

describe('wbudowane dane krajów', () => {
  it('kody i strefy poprawne, bez powtórzeń', () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.currency).toMatch(/^[A-Z]{3}$/);
      expect(isValidZone(c.zone), c.code).toBe(true);
      expect(countryName(c.code)).not.toBe(c.code);
      expect(c.emergency.length).toBeGreaterThan(0);
    }
  });

  it('nazwy, waluta i flaga po polsku', () => {
    expect(countryName('JP')).toBe('Japonia');
    expect(currencyLabel('JPY')).toMatch(/jen/i);
    expect(currencyLabel('JPY')).toContain('(JPY)');
    expect(flag('JP')).toBe('🇯🇵');
    expect(flag('ZZ')).toBe('🌍');
  });

  it('gniazdka: polska wtyczka i napięcie', () => {
    expect(plugsLabel('C, F', 230)).toBe('C, F · 230 V – polska wtyczka pasuje');
    expect(plugsLabel('A, B', 100)).toContain('potrzebna przejściówka');
    expect(plugsLabel('A, B', 100)).toContain('100 V');
    expect(plugsLabel('G', 230)).toBe('G · 230 V – potrzebna przejściówka');
  });

  it('różnica czasu z uwzględnieniem czasu letniego', () => {
    expect(timeDiff('Asia/Tokyo', new Date('2027-02-15T12:00:00Z'))).toBe('+8 h względem Polski');
    expect(timeDiff('Asia/Tokyo', new Date('2027-07-15T12:00:00Z'))).toBe('+7 h względem Polski');
    expect(timeDiff('Atlantic/Reykjavik', new Date('2027-02-15T12:00:00Z'))).toBe('−1 h względem Polski');
    expect(timeDiff('Asia/Kolkata', new Date('2027-02-15T12:00:00Z'))).toBe('+4,5 h względem Polski');
    expect(timeDiff('Europe/Berlin', new Date('2027-02-15T12:00:00Z'))).toBe('tak samo jak w Polsce');
  });

  it('wyszukiwanie po polsku, bez znaków diakrytycznych', () => {
    expect(searchCountries('jap').map((c) => c.code)).toEqual(['JP']);
    expect(searchCountries('islan').map((c) => c.code)).toContain('IS');
    expect(searchCountries('wlochy').map((c) => c.code)).toEqual(['IT']);
    expect(searchCountries('zjednoczone').map((c) => c.code)).toEqual(expect.arrayContaining(['US', 'AE']));
    expect(searchCountries('')).toEqual([]);
  });
});
