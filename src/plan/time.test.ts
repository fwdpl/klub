import { describe, expect, it } from 'vitest';
import type { PlanItem } from '../model/types';
import { findCollisions, overlaps, sortItems } from './collisions';
import { isValidLocal, toInstant, todayIn } from './time';

const item = (id: string, start: string, end: string | undefined, audience: PlanItem['audience'], extra: Partial<PlanItem> = {}): PlanItem => ({
  id,
  type: 'activity',
  title: id,
  start,
  end,
  audience,
  pinnedToDate: false,
  ...extra,
});

describe('czas lokalny + strefa', () => {
  it('przelicza na chwilę w czasie z uwzględnieniem czasu letniego', () => {
    expect(new Date(toInstant('2027-03-10T06:10', 'Europe/Warsaw')).toISOString()).toBe('2027-03-10T05:10:00.000Z');
    expect(new Date(toInstant('2027-07-10T06:10', 'Europe/Warsaw')).toISOString()).toBe('2027-07-10T04:10:00.000Z');
    expect(new Date(toInstant('2027-03-10T09:30', 'Atlantic/Reykjavik')).toISOString()).toBe('2027-03-10T09:30:00.000Z');
    expect(new Date(toInstant('2027-01-15T18:00', 'America/New_York')).toISOString()).toBe('2027-01-15T23:00:00.000Z');
  });

  it('odrzuca nieistniejące daty i godziny', () => {
    expect(isValidLocal('2027-02-29T10:00')).toBe(false);
    expect(isValidLocal('2027-03-10T24:00')).toBe(false);
    expect(isValidLocal('2027-03-10 10:00')).toBe(false);
    expect(isValidLocal('2028-02-29T10:00')).toBe(true);
  });
});

describe('kolizje i kolejność', () => {
  const zone = 'Atlantic/Reykjavik';

  it('przedziały i punkty', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 5, end: 15 })).toBe(true);
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 15 })).toBe(false);
    expect(overlaps({ start: 5, end: 5 }, { start: 0, end: 10 })).toBe(true);
    expect(overlaps({ start: 10, end: 10 }, { start: 0, end: 10 })).toBe(false);
  });

  it('punkt prywatny nachodzący na wspólny', () => {
    const items = [
      item('Wodospad', '2027-03-10T09:00', '2027-03-10T11:00', 'all'),
      item('Fotografia', '2027-03-10T10:30', '2027-03-10T12:00', ['ania']),
      item('Spacer', '2027-03-10T12:00', '2027-03-10T13:00', ['ania']),
      item('Basen', '2027-03-10T10:00', '2027-03-10T11:00', ['bartek']),
    ];
    expect([...findCollisions(items, 'ania', zone)]).toEqual([['Fotografia', 'Wodospad']]);
    expect([...findCollisions(items, 'bartek', zone).keys()]).toEqual(['Basen']);
  });

  it('porównuje chwile w różnych strefach (lot)', () => {
    const items = [
      // wylot 06:10 w Warszawie = 05:10 UTC, przylot 09:30 na Islandii = 09:30 UTC
      item('Lot', '2027-03-10T06:10', '2027-03-10T09:30', 'all', { tz: 'Europe/Warsaw', endTz: zone }),
      item('Taxi', '2027-03-10T09:00', undefined, ['ania']),
      item('Śniadanie', '2027-03-10T05:30', '2027-03-10T06:00', ['ania'], { tz: 'Europe/Warsaw' }),
    ];
    expect([...findCollisions(items, 'ania', zone).keys()]).toEqual(['Taxi']);
    expect(sortItems(items, zone).map((i) => i.id)).toEqual(['Śniadanie', 'Lot', 'Taxi']);
  });
});

describe('dziś w strefie miejsca', () => {
  it('liczy datę w strefie wyjazdu, nie telefonu', () => {
    const now = new Date('2027-03-10T23:30:00Z');
    expect(todayIn('Atlantic/Reykjavik', now)).toBe('2027-03-10');
    expect(todayIn('Asia/Tokyo', now)).toBe('2027-03-11');
    expect(todayIn('America/New_York', now)).toBe('2027-03-10');
  });
});
