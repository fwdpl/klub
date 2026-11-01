import { describe, expect, it } from 'vitest';
import { POPULAR, ZONES, fold, searchZones, utcOffset, zoneLabel } from './timezones';

const ALL = ['Atlantic/Reykjavik', 'Europe/Warsaw', 'Pacific/Fiji', 'America/Argentina/Ushuaia'];

describe('wyszukiwanie strefy po polsku', () => {
  it('bez wpisanego tekstu – najczęstsze kierunki', () => {
    expect(searchZones('').map((z) => z.zone)).toEqual(POPULAR);
  });

  it('po początku nazwy kraju, bez polskich znaków i wielkości liter', () => {
    expect(searchZones('isl')[0]).toMatchObject({ label: 'Islandia', zone: 'Atlantic/Reykjavik' });
    expect(searchZones('lotwa')[0].zone).toBe('Europe/Riga');
    expect(searchZones('WŁO')[0].zone).toBe('Europe/Rome');
  });

  it('po mieście lub wyspie', () => {
    expect(searchZones('bali')[0].zone).toBe('Asia/Makassar');
    expect(searchZones('teneryfa')[0].zone).toBe('Atlantic/Canary');
    expect(searchZones('nowy jork')[0].zone).toBe('America/New_York');
    expect(searchZones('reykjavik')[0].zone).toBe('Atlantic/Reykjavik');
  });

  it('nazwa spoza polskiej listy – zapas z pełnej listy stref', () => {
    expect(searchZones('fiji', ALL).map((z) => z.zone)).toEqual(['Pacific/Fiji']);
    expect(searchZones('ushuaia', ALL)[0].zone).toBe('America/Argentina/Ushuaia');
  });

  it('nic nie pasuje – pusto', () => {
    expect(searchZones('xyzxyz', ALL)).toEqual([]);
  });

  it('każda strefa z polskiej listy jest poprawna', () => {
    for (const z of ZONES) expect(() => new Intl.DateTimeFormat('en', { timeZone: z.zone })).not.toThrow();
  });
});

describe('opisy stref', () => {
  it('przesunięcie względem UTC zależy od daty (czas letni)', () => {
    expect(utcOffset('Europe/Warsaw', new Date('2027-01-15T12:00:00Z'))).toBe('UTC+1');
    expect(utcOffset('Europe/Warsaw', new Date('2027-07-15T12:00:00Z'))).toBe('UTC+2');
    expect(utcOffset('Atlantic/Reykjavik', new Date('2027-07-15T12:00:00Z'))).toBe('UTC+0');
  });

  it('nazwa: polska z listy albo miasto ze strefy', () => {
    expect(zoneLabel('Atlantic/Reykjavik')).toBe('Islandia');
    expect(zoneLabel('Pacific/Fiji')).toBe('Fiji');
    expect(fold('Łódź Żółć')).toBe('lodz zolc');
  });
});
