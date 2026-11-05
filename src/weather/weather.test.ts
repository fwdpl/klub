import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forecastFor, moonPhase, parseForecast, placeFor, placeQueries, searchPlaces, sunTimes, weatherLook } from './weather';

// prosta pamięć zamiast localStorage (testy w Node)
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});

const json = (body: unknown, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as Response);
const vik = { name: 'Vík, Islandia', lat: 63.42, lng: -19.01 };
const sample = {
  daily: {
    time: ['2027-03-10', '2027-03-11'],
    weather_code: [61, 1],
    temperature_2m_max: [4.4, 6.6],
    temperature_2m_min: [-0.6, 1.2],
    precipitation_sum: [3.27, 0],
    precipitation_probability_max: [80, null],
    wind_speed_10m_max: [41.6, 18.2],
  },
  hourly: {
    time: ['2027-03-10T03:00', '2027-03-10T06:00', '2027-03-10T07:00', '2027-03-10T09:00', '2027-03-10T21:00', '2027-03-11T06:00'],
    cloud_cover: [100, 90, 85, 70, 20, 10],
  },
};

describe('pogoda', () => {
  it('odpowiedź Open-Meteo → dni prognozy', () => {
    const f = parseForecast(vik, sample, new Date('2027-03-09T12:00:00Z'));
    expect(f.days[0]).toEqual({
      date: '2027-03-10', code: 61, max: 4, min: -1, rain: 3.3, rainChance: 80, wind: 42,
      clouds: [{ hour: 6, value: 90 }, { hour: 9, value: 70 }, { hour: 21, value: 20 }],
    });
    expect(f.days[1].rainChance).toBeUndefined();
  });

  it('kody pogody po polsku', () => {
    expect(weatherLook(61)).toEqual({ icon: '🌧️', text: 'deszcz' });
    expect(weatherLook(0).text).toBe('bezchmurnie');
    expect(weatherLook(999).text).toBe('pogoda');
  });

  it('prognoza z pamięci, gdy świeża; z sieci, gdy stara; bez sieci – ostatnia', async () => {
    const fetcher = vi.fn(() => json(sample));
    const first = await forecastFor(vik, fetcher as unknown as typeof fetch, new Date('2027-03-09T12:00:00Z'));
    expect(first?.days).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain('timezone=auto');
    await forecastFor(vik, fetcher as unknown as typeof fetch, new Date('2027-03-09T13:00:00Z'));
    expect(fetcher).toHaveBeenCalledTimes(1); // w pamięci
    const failing = vi.fn(() => json({}, false));
    const later = await forecastFor(vik, failing as unknown as typeof fetch, new Date('2027-03-09T20:00:00Z'));
    expect(failing).toHaveBeenCalledTimes(1);
    expect(later?.fetchedAt).toBe('2027-03-09T12:00:00.000Z'); // ostatnia zapamiętana
  });

  it('miejsce z bazy dnia: pełna nazwa, potem pierwsze słowo; wynik zapamiętany', async () => {
    expect(placeQueries('Vík i okolice')).toEqual(['Vík i okolice', 'Vík']);
    expect(placeQueries('Naha, Okinawa')).toEqual(['Naha, Okinawa', 'Naha']);
    const fetcher = vi.fn((url: string) =>
      json(url.includes('okolice') ? {} : { results: [{ name: 'Vík', latitude: 63.42, longitude: -19.01, country: 'Islandia', admin1: 'Suðurland' }] }),
    );
    const place = await placeFor('Vík i okolice', fetcher as unknown as typeof fetch);
    expect(place).toEqual({ name: 'Vík, Suðurland, Islandia', lat: 63.42, lng: -19.01 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await placeFor('Vík i okolice', fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('wyszukiwanie: krótkie zapytanie – bez sieci', async () => {
    const fetcher = vi.fn();
    expect(await searchPlaces('a', fetcher as unknown as typeof fetch)).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('słońce i księżyc bez sieci, w czasie miejsca', () => {
    // strefa bez zmian czasu – wynik nie zależy od wersji danych o strefach na serwerze
    const tokyo = { name: 'Tokio', lat: 35.68, lng: 139.69 };
    const t = sunTimes('2027-08-02', tokyo, 'Asia/Tokyo');
    expect(t.sunrise).toMatch(/^04:\d\d$/);
    expect(t.sunset).toMatch(/^18:\d\d$/);
    // dzień zaćmienia 2.08.2027 to nów
    expect(moonPhase(new Date('2027-08-02T10:00:00Z'))).toBe('🌑 nów');
    // dzień polarny na Svalbardzie – bez zachodu
    expect(sunTimes('2027-06-21', { name: 'Longyearbyen', lat: 78.22, lng: 15.65 }, 'Arctic/Longyearbyen').sunset).toBeNull();
  });
});
