import { describe, expect, it } from 'vitest';
import type { DayDoc, PlanItem } from '../model/types';
import { buildIcs, escapeText, foldLine, icsFileName } from './ics';

const item = (p: Partial<PlanItem>): PlanItem => ({ id: 'x', type: 'activity', title: 'Punkt', start: '2027-03-10T09:00', audience: 'all', pinnedToDate: false, ...p });
const day = (date: string, items: PlanItem[], timezone?: string): DayDoc => ({ date, baseLocation: '', items, revision: 1, ...(timezone ? { timezone } : {}) });

describe('eksport do kalendarza', () => {
  const days = [
    day('2027-03-10', [
      item({ id: 'lot', type: 'flight', title: 'Lot FI 531', start: '2027-03-10T06:10', tz: 'Europe/Warsaw', end: '2027-03-10T09:30', important: true, place: { name: 'Lotnisko Chopina', address: 'Żwirki i Wigury 1, Warszawa' } }),
      item({ id: 'obiad', title: 'Obiad, Selfoss', start: '2027-03-10T13:00', notes: 'Zupa **rybna**\nRezerwacja na Jacka', audience: ['ania'] }),
      item({ id: 'tylko-bartek', title: 'Muzeum', start: '2027-03-10T15:00', audience: ['bartek'] }),
    ]),
  ];
  const mine = (i: PlanItem) => i.audience === 'all' || i.audience.includes('ania');
  const { ics, count } = buildIcs({ tripId: 't1', tripTitle: 'Islandia zimą', tripZone: 'Atlantic/Reykjavik', days, include: mine, reminderMinutes: 30, now: new Date('2026-11-04T12:00:00Z') });
  const unfolded = ics.replace(/\r\n /g, '');

  it('tylko punkty z „Mojego planu”', () => {
    expect(count).toBe(2);
    expect(unfolded).not.toContain('Muzeum');
  });

  it('czas lokalny + strefa → chwila w UTC (strefa punktu ma pierwszeństwo przed strefą dnia)', () => {
    expect(unfolded).toContain('DTSTART:20270310T051000Z'); // 06:10 w Warszawie (CET)
    expect(unfolded).toContain('DTEND:20270310T083000Z'); // 09:30 w Warszawie
    expect(unfolded).toContain('DTSTART:20270310T130000Z'); // 13:00 na Islandii (UTC)
    expect(unfolded).toContain('DTEND:20270310T133000Z'); // bez końca – 30 min
  });

  it('opis, miejsce, wyróżnienie, przypomnienie i stały UID', () => {
    expect(unfolded).toContain('SUMMARY:❗ Lot FI 531');
    expect(unfolded).toContain('LOCATION:Lotnisko Chopina\\, Żwirki i Wigury 1\\, Warszawa');
    expect(unfolded).toContain('DESCRIPTION:Zupa rybna\\nRezerwacja na Jacka\\nIslandia zimą');
    expect(unfolded).toContain('TRIGGER:-PT30M');
    expect(unfolded).toContain('UID:t1-2027-03-10-lot@klub.bakutis.pl');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('bez przypomnienia – bez VALARM', () => {
    const r = buildIcs({ tripId: 't1', tripTitle: 'X', tripZone: 'UTC', days, include: () => true, reminderMinutes: 0 });
    expect(r.ics).not.toContain('VALARM');
    expect(r.count).toBe(3);
  });

  it('znaki specjalne i zawijanie długich linii (UTF-8, bez dzielenia liter)', () => {
    expect(escapeText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
    const long = 'SUMMARY:' + 'ż'.repeat(60);
    const folded = foldLine(long);
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });

  it('nazwa pliku bez polskich znaków', () => {
    expect(icsFileName('Hongkong, Tajpej, Okinawa')).toBe('klub-hongkong-tajpej-okinawa.ics');
    expect(icsFileName('Zaćmienie słońca')).toBe('klub-zacmienie-slonca.ics');
  });
});
