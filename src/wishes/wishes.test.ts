import { describe, expect, it } from 'vitest';
import { exportWishlist, parseMapsLink, parsePhoton, score, sortWishes, wishId, type Wish } from './wishes';

const w = (name: string, votes: Wish['votes'], extra: Partial<Wish> = {}): Wish => ({ id: name, name, addedBy: 'ania', addedByName: 'Ania', votes, ...extra });

describe('lista życzeń', () => {
  it('popularność: „muszę” ×2, sortowanie, remis po nazwie', () => {
    const a = w('Bambusowy las', { ania: { name: 'Ania', priority: 'nice' }, bartek: { name: 'Bartek', priority: 'nice' } });
    const b = w('Fushimi Inari', { ania: { name: 'Ania', priority: 'must' }, bartek: { name: 'Bartek', priority: 'nice' } });
    const c = w('Arashiyama', { jacek: { name: 'Jacek', priority: 'must' } });
    expect(score(b)).toBe(3);
    expect(sortWishes([a, c, b]).map((x) => x.name)).toEqual(['Fushimi Inari', 'Arashiyama', 'Bambusowy las']);
  });

  it('identyfikator: z OSM (to samo miejsce raz), inaczej z nazwy i współrzędnych', () => {
    expect(wishId('Fushimi Inari', { osm: 'N123' })).toBe('osm-N123');
    expect(wishId('Zamek w Osace', { lat: 34.6873, lng: 135.5262 })).toBe('n-zamek-w-osace-34-687_135-526');
    expect(wishId('Łódź – ramen')).toBe('n-lodz-ramen');
  });

  it('link Google Maps: nazwa i współrzędne; krótki link – tylko link; inne strony – nie', () => {
    expect(parseMapsLink('https://www.google.com/maps/place/Fushimi+Inari+Taisha/@34.9671402,135.7726717,17z/data=!3m1')).toEqual({
      link: 'https://www.google.com/maps/place/Fushimi+Inari+Taisha/@34.9671402,135.7726717,17z/data=!3m1',
      name: 'Fushimi Inari Taisha',
      lat: 34.9671402,
      lng: 135.7726717,
    });
    expect(parseMapsLink('https://maps.app.goo.gl/AbCdEf123')).toEqual({ link: 'https://maps.app.goo.gl/AbCdEf123' });
    expect(parseMapsLink('https://www.google.com/maps/search/?api=1&query=35.0394,135.7292')).toMatchObject({ lat: 35.0394, lng: 135.7292 });
    expect(parseMapsLink('https://example.com/maps/place/X')).toBeNull();
    expect(parseMapsLink('nie link')).toBeNull();
  });

  it('wyniki Photon: nazwa, adres, współrzędne, OSM, bez powtórzeń i bezimiennych', () => {
    const hits = parsePhoton({
      features: [
        { geometry: { coordinates: [-7.9963, 31.6419] }, properties: { osm_type: 'W', osm_id: 42, name: 'Jardin Majorelle', street: 'Rue Yves Saint Laurent', city: 'Marrakesh', country: 'Morocco' } },
        { geometry: { coordinates: [-7.9963, 31.6419] }, properties: { osm_type: 'W', osm_id: 42, name: 'Jardin Majorelle' } },
        { geometry: { coordinates: [0, 0] }, properties: { osm_type: 'N', osm_id: 7 } },
      ],
    });
    expect(hits).toEqual([{ name: 'Jardin Majorelle', address: 'Rue Yves Saint Laurent, Marrakesh, Morocco', lat: 31.6419, lng: -7.9963, osm: 'W42' }]);
  });

  it('eksport: format, kolejność od najpopularniejszych, głosy i preferencje', () => {
    const list = [
      w('Arashiyama', { jacek: { name: 'Jacek', priority: 'nice' } }),
      w('Fushimi Inari', { ania: { name: 'Ania', priority: 'must' } }, { preferredTime: 'rano', durationMin: 120, fixedTime: '07:00', place: { lat: 34.96, lng: 135.77, address: 'Kioto' } }),
    ];
    const out = exportWishlist('Japonia', list, new Date('2026-11-05T10:00:00Z')) as { format: string; places: Record<string, unknown>[] };
    expect(out.format).toBe('klub-wishlist');
    expect(out.places[0]).toEqual({
      name: 'Fushimi Inari', address: 'Kioto', lat: 34.96, lng: 135.77, preferredTime: 'rano', durationMin: 120, fixedTime: '07:00',
      score: 2, votes: [{ name: 'Ania', priority: 'must' }],
    });
    expect(out.places[1].name).toBe('Arashiyama');
  });
});
