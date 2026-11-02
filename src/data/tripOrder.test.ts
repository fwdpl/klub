import { describe, expect, it } from 'vitest';
import { approxMonth, compareTrips, monthLabel } from './tripOrder';

const label = (text: string) => {
  const v = approxMonth(text);
  return v === null ? null : monthLabel(v);
};

describe('odczyt orientacyjnych dat', () => {
  it('nazwy miesięcy w mianowniku i dopełniaczu', () => {
    expect(label('luty 2028')).toBe('luty 2028');
    expect(label('grudzień 2026')).toBe('grudzień 2026');
    expect(label('12–20 marca 2027')).toBe('marzec 2027');
    expect(label('koniec sierpnia 2027')).toBe('sierpień 2027');
    expect(label('Październik 2027')).toBe('październik 2027');
    expect(label('maj 2027')).toBe('maj 2027');
    expect(label('początek czerwca 2027')).toBe('czerwiec 2027');
  });

  it('zakres – liczy się początek', () => {
    expect(label('luty–marzec 2027')).toBe('luty 2027');
    expect(label('przełom grudnia 2026 i stycznia 2027')).toBe('grudzień 2026');
  });

  it('zapis liczbowy', () => {
    expect(label('03.2027')).toBe('marzec 2027');
    expect(label('12–20.03.2027')).toBe('marzec 2027');
    expect(label('2027-11')).toBe('listopad 2027');
  });

  it('pora roku, sam rok, brak roku', () => {
    expect(label('lato 2027')).toBe('lipiec 2027');
    expect(label('2028')).toBe('styczeń 2028');
    expect(label('jak się uda')).toBeNull();
    expect(label('marzec')).toBeNull();
    expect(label('')).toBeNull();
  });
});

describe('kolejność wyjazdów', () => {
  it('chronologicznie, nieodczytane na końcu, archiwum na samym końcu', () => {
    const trips = [
      { title: 'Australia 2028', approxDates: 'luty 2028', status: 'open' },
      { title: 'Hongkong, Tajpej, Okinawa', approxDates: 'grudzień 2026', status: 'open' },
      { title: 'Singapur 2027', approxDates: 'luty 2027', status: 'open' },
      { title: 'Zaćmienie słońca', approxDates: 'sierpień 2027', status: 'open' },
      { title: 'Kiedyś', approxDates: 'jak się uda', status: 'open' },
      { title: 'Islandia', approxDates: 'marzec 2026', status: 'archived' },
      { title: 'Szkic', approxDates: 'styczeń 2027', status: 'draft' },
    ];
    expect([...trips].sort(compareTrips).map((t) => t.title)).toEqual([
      'Hongkong, Tajpej, Okinawa',
      'Szkic',
      'Singapur 2027',
      'Zaćmienie słońca',
      'Australia 2028',
      'Kiedyś',
      'Islandia',
    ]);
  });
});
