import { describe, expect, it } from 'vitest';
import type { DayDoc, Hotel } from '../model/types';
import type { Wish } from '../wishes/wishes';
import { buildGpx, buildKml, collectPoints, fillCoords, mapFileName } from './geoExport';

const day = (date: string, items: Partial<DayDoc['items'][number]>[]): DayDoc =>
  ({
    date,
    title: 'Asakusa',
    revision: 1,
    items: items.map((i, n) => ({ id: `${date}-${n}`, type: 'activity', title: 'x', start: `${date}T09:00`, audience: 'all', pinnedToDate: false, ...i })),
  }) as DayDoc;

const days = [
  day('2026-12-11', [
    {
      title: 'Senso-ji',
      start: '2026-12-11T10:00',
      place: { name: 'Senso-ji', address: 'Asakusa, Tokio', lat: 35.7148, lng: 139.7967 },
      notes: 'Wejście **od bramy Kaminarimon**',
    },
    { title: 'Śniadanie', start: '2026-12-11T08:00' },
    { title: 'Kolacja & sake', start: '2026-12-11T19:00', place: { name: 'Izakaya <Tori>' }, audience: ['ania'] },
  ]),
];
const hotel = { id: 'h', name: 'Hotel Ueno', address: '1-2-3 Ueno, Tokio', phone: '+81 3 0000', checkIn: '2026-12-10T15:00', checkOut: '', notes: '', audience: 'all' } as Hotel;
const wish: Wish = {
  id: 'osm-N1',
  name: 'Fushimi Inari',
  place: { lat: 34.9671, lng: 135.7727 },
  addedBy: 'a',
  addedByName: 'Ania',
  votes: { a: { name: 'Ania', priority: 'must' } },
};

describe('eksport na mapę', () => {
  it('zbiera punkty: dzień = folder, bez punktów bez miejsca, „mój plan”', () => {
    const all = collectPoints({ days, include: () => true, hotels: [hotel], wishes: [wish] });
    expect(all.map((p) => [p.folder, p.name, p.kind])).toEqual([
      ['pt., 11 gru – Asakusa', '10:00 Senso-ji', 'plan'],
      ['pt., 11 gru – Asakusa', '19:00 Kolacja & sake', 'plan'],
      ['Noclegi', '🛏 Hotel Ueno', 'hotel'],
      ['Lista życzeń', 'Fushimi Inari', 'must'],
    ]);
    expect(all[0].description).toContain('Wejście od bramy Kaminarimon');
    const mine = collectPoints({ days, include: (i) => i.audience === 'all' });
    expect(mine).toHaveLength(1);
  });

  it('uzupełnia brakujące współrzędne, jedno zapytanie na adres', async () => {
    const pts = collectPoints({ days, include: () => true, hotels: [hotel, { ...hotel, id: 'h2' }] });
    const asked: string[] = [];
    const filled = await fillCoords(pts, async (q) => (asked.push(q), q.includes('Ueno') ? { lat: 35.71, lng: 139.77 } : null));
    expect(asked).toEqual(['Izakaya <Tori>', 'Hotel Ueno, 1-2-3 Ueno, Tokio']);
    expect(filled.filter((p) => p.approx)).toHaveLength(2);
    expect(filled[1].lat).toBeUndefined();
  });

  it('KML i GPX: znaki specjalne, pominięte bez współrzędnych', () => {
    const pts = collectPoints({ days, include: () => true, wishes: [wish] });
    const { kml, count, skipped } = buildKml('Japonia & Korea', pts);
    expect([count, skipped]).toEqual([2, 1]);
    expect(kml).toContain('<name>Japonia &amp; Korea</name>');
    expect(kml).toContain('<coordinates>139.7967,35.7148,0</coordinates>');
    expect(kml).toContain('<Folder><name>Lista życzeń</name>');
    expect(kml).not.toContain('<Tori>');
    const { gpx } = buildGpx('Japonia', pts);
    expect(gpx).toContain('<wpt lat="35.7148" lon="139.7967"><name>pt., 11 gru 10:00 Senso-ji</name>');
    expect(gpx).toContain('<name>Fushimi Inari</name>');
    expect(mapFileName('Zaćmienie słońca', 'gpx')).toBe('klub-mapa-zacmienie-slonca.gpx');
  });
});
