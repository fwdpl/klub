import { describe, expect, it } from 'vitest';
import { guessSortDate, sortDestinations } from './destinationsLogic';

describe('kierunki', () => {
  it('termin ze słów', () => {
    expect(guessSortDate('grudzień 2027')).toBe('2027-12');
    expect(guessSortDate('w grudniu 2027')).toBe('2027-12');
    expect(guessSortDate('jesień 2027')).toBe('2027-10');
    expect(guessSortDate('wiosna 2028')).toBe('2028-04');
    expect(guessSortDate('maj–czerwiec 2028')).toBe('2028-05');
    expect(guessSortDate('2029')).toBe('2029-01');
    expect(guessSortDate('kiedyś')).toBeNull();
  });
  it('sortowanie A–Z i wg terminu (bez terminu na końcu)', () => {
    const list = [{ id: 'a', name: 'Islandia' }, { id: 'b', name: 'Patagonia', sortDate: '2027-10' }, { id: 'c', name: 'Japonia', sortDate: '2027-04' }];
    expect(sortDestinations(list, 'name').map((d) => d.name)).toEqual(['Islandia', 'Japonia', 'Patagonia']);
    expect(sortDestinations(list, 'date').map((d) => d.name)).toEqual(['Japonia', 'Patagonia', 'Islandia']);
  });
});
