import { describe, expect, it } from 'vitest';
import type { DayDoc, Hotel, PlanItem } from '../model/types';
import { countdown, hotelTonight, todayView } from './today';

const item = (p: Partial<PlanItem>): PlanItem => ({ id: p.title ?? 'x', type: 'activity', title: 'Punkt', start: '2027-03-10T09:00', audience: 'all', pinnedToDate: false, ...p });
const day = (date: string, items: PlanItem[]): DayDoc => ({ date, baseLocation: '', items, revision: 1 });
const days = [
  day('2027-03-10', [
    item({ title: 'Śniadanie', start: '2027-03-10T08:00', end: '2027-03-10T09:00' }),
    item({ title: 'Wodospad', start: '2027-03-10T10:00', end: '2027-03-10T12:00', meet: { place: 'Parking', time: '2027-03-10T09:45' } }),
    item({ title: 'Tylko Bartek', start: '2027-03-10T09:30', audience: ['bartek'] }),
  ]),
  day('2027-03-11', [item({ title: 'Czarna plaża', start: '2027-03-11T09:00' })]),
];
const zone = 'Atlantic/Reykjavik'; // UTC+0 – czas miejsca = UTC
const mine = (i: PlanItem) => i.audience === 'all' || i.audience.includes('ania');

describe('ekran „Dziś”', () => {
  it('poza dniami planu – brak', () => {
    expect(todayView(days, zone, mine, new Date('2027-03-09T12:00:00Z'))).toBeNull();
    expect(todayView(days, zone, mine, new Date('2027-03-12T12:00:00Z'))).toBeNull();
  });

  it('w trakcie punktu: trwa, następny, zbiórka z godziną', () => {
    const v = todayView(days, zone, mine, new Date('2027-03-10T08:30:00Z'))!;
    expect(v.day.date).toBe('2027-03-10');
    expect(v.current?.item.title).toBe('Śniadanie');
    expect(v.next?.item.title).toBe('Wodospad'); // punkt Bartka pominięty
    expect(v.meet).toEqual({ place: 'Parking', at: Date.parse('2027-03-10T09:45:00Z') });
  });

  it('po ostatnim punkcie dnia – pierwszy punkt następnego dnia', () => {
    const v = todayView(days, zone, mine, new Date('2027-03-10T20:00:00Z'))!;
    expect(v.next).toBeUndefined();
    expect(v.tomorrow?.item.title).toBe('Czarna plaża');
    expect(v.tomorrow?.day.date).toBe('2027-03-11');
  });

  it('dzień liczony w strefie miejsca, nie telefonu', () => {
    // 23:30 UTC 10 marca to już 11 marca w Tokio
    const tokyo = [day('2027-03-11', [item({ title: 'Świątynia', start: '2027-03-11T09:00' })])];
    expect(todayView(tokyo, 'Asia/Tokyo', mine, new Date('2027-03-10T23:30:00Z'))?.next?.item.title).toBe('Świątynia');
  });

  it('nocleg na dziś', () => {
    const h = (name: string, checkIn: string, checkOut: string): Hotel => ({ id: name, name, address: '', checkIn, checkOut, phone: '', notes: '', audience: 'all' });
    const hotels = [h('Vík', '2027-03-10T15:00', '2027-03-12T11:00'), h('Reykjavík', '2027-03-12T15:00', '2027-03-13T11:00')];
    expect(hotelTonight(hotels, '2027-03-10')?.name).toBe('Vík');
    expect(hotelTonight(hotels, '2027-03-11')?.name).toBe('Vík');
    expect(hotelTonight(hotels, '2027-03-12')?.name).toBe('Reykjavík');
    expect(hotelTonight(hotels, '2027-03-13')).toBeUndefined();
  });

  it('odliczanie po polsku', () => {
    expect(countdown(10_000)).toBe('teraz');
    expect(countdown(5 * 60_000)).toBe('za 5 min');
    expect(countdown(80 * 60_000)).toBe('za 1 godz. 20 min');
    expect(countdown(120 * 60_000)).toBe('za 2 godz.');
    expect(countdown(26 * 3600_000)).toBe('za 1 dzień');
  });
});
