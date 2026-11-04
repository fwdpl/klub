import SunCalc from 'suncalc';

// Pogoda (v2, decyzje Jacka z 4.11.2026): prognoza Open-Meteo (bez klucza) dla miejsca dnia – automatycznie
// z bazy dnia albo z kierunku wyjazdu, z możliwością poprawki przez organizatora. Prognoza tylko 7 dni do
// przodu, zawsze z godziną pobrania; słońce i księżyc liczone lokalnie (SunCalc) bez ograniczenia dni.
// Wyniki trzymane na urządzeniu – bez internetu widać ostatnią pobraną prognozę.

export interface Place {
  name: string;
  lat: number;
  lng: number;
}

export interface DayForecast {
  date: string; // 'YYYY-MM-DD' w strefie miejsca
  code: number; // kod pogody WMO
  max: number;
  min: number;
  rain: number; // mm
  rainChance?: number; // %
  wind: number; // km/h
  /** Zachmurzenie co 3 godziny, 6:00–21:00 (%). */
  clouds: { hour: number; value: number }[];
}

export interface Forecast {
  place: Place;
  fetchedAt: string; // ISO
  days: DayForecast[];
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FRESH_MS = 3 * 60 * 60 * 1000; // prognoza świeża przez 3 godziny

// ---------- kody pogody WMO → ikona i opis ----------

const WMO: [number[], string, string][] = [
  [[0], '☀️', 'bezchmurnie'],
  [[1], '🌤️', 'przeważnie słonecznie'],
  [[2], '⛅', 'częściowe zachmurzenie'],
  [[3], '☁️', 'pochmurno'],
  [[45, 48], '🌫️', 'mgła'],
  [[51, 53, 55, 56, 57], '🌦️', 'mżawka'],
  [[61, 63, 65, 66, 67], '🌧️', 'deszcz'],
  [[71, 73, 75, 77], '🌨️', 'śnieg'],
  [[80, 81, 82], '🌦️', 'przelotne opady'],
  [[85, 86], '🌨️', 'przelotny śnieg'],
  [[95, 96, 99], '⛈️', 'burza'],
];

export function weatherLook(code: number): { icon: string; text: string } {
  const hit = WMO.find(([codes]) => codes.includes(code));
  return hit ? { icon: hit[1], text: hit[2] } : { icon: '🌡️', text: 'pogoda' };
}

// ---------- pamięć urządzenia ----------

function readStore<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStore(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // pełna pamięć – trudno, następnym razem pobierzemy znowu
  }
}

const placeKey = (p: Place) => `klub.weather.${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;

// ---------- miejsce prognozy ----------

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

/** Wyszukiwanie miejsca po nazwie (po polsku), np. do poprawki przez organizatora. */
export async function searchPlaces(query: string, fetcher: typeof fetch = fetch): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetcher(`${GEOCODE_URL}?name=${encodeURIComponent(q)}&count=6&language=pl&format=json`);
  if (!res.ok) throw new Error(`geocoding ${res.status}`);
  const data = (await res.json()) as { results?: GeoResult[] };
  return (data.results ?? []).map((r) => ({
    name: [r.name, r.admin1 && r.admin1 !== r.name ? r.admin1 : '', r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lng: r.longitude,
  }));
}

/** Pierwsze słowa przed przecinkiem lub „ i ” – baza dnia bywa opisem („Vík i okolice”, „Naha, Okinawa”). */
export function placeQueries(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const first = t.split(/,|\s[-–]\s|\si\s|\/|\(/)[0].trim();
  return [...new Set([t, first].filter((x) => x.length >= 2))];
}

/** Miejsce dla nazwy (baza dnia albo kierunek wyjazdu), zapamiętane na urządzeniu. */
// Równoczesne pytania o to samo (karta „Dziś”, nagłówki dni, blok dnia) czekają na jedno zapytanie
const pending = new Map<string, Promise<unknown>>();
function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  const running = pending.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = run().finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

export function placeFor(text: string, fetcher: typeof fetch = fetch): Promise<Place | null> {
  return once(`geo:${text.trim().toLowerCase()}`, () => placeForNow(text, fetcher));
}

async function placeForNow(text: string, fetcher: typeof fetch): Promise<Place | null> {
  const key = `klub.geo.${text.trim().toLowerCase()}`;
  const cached = readStore<Place | { none: true }>(key);
  if (cached) return 'none' in cached ? null : cached;
  for (const q of placeQueries(text)) {
    const [hit] = await searchPlaces(q, fetcher);
    if (hit) {
      writeStore(key, hit);
      return hit;
    }
  }
  writeStore(key, { none: true });
  return null;
}

// ---------- prognoza ----------

interface OpenMeteo {
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max?: (number | null)[];
    wind_speed_10m_max: number[];
  };
  hourly: { time: string[]; cloud_cover: number[] };
}

export function parseForecast(place: Place, data: OpenMeteo, fetchedAt: Date): Forecast {
  const d = data.daily;
  const days: DayForecast[] = d.time.map((date, i) => {
    const clouds = data.hourly.time
      .map((t, j) => ({ t, value: data.hourly.cloud_cover[j] }))
      .filter((x) => x.t.startsWith(date))
      .map((x) => ({ hour: Number(x.t.slice(11, 13)), value: x.value }))
      .filter((x) => x.hour >= 6 && x.hour <= 21 && x.hour % 3 === 0);
    const chance = d.precipitation_probability_max?.[i];
    return {
      date,
      code: d.weather_code[i],
      max: Math.round(d.temperature_2m_max[i]),
      min: Math.round(d.temperature_2m_min[i]),
      rain: Math.round(d.precipitation_sum[i] * 10) / 10,
      ...(chance !== undefined && chance !== null ? { rainChance: chance } : {}),
      wind: Math.round(d.wind_speed_10m_max[i]),
      clouds,
    };
  });
  return { place, fetchedAt: fetchedAt.toISOString(), days };
}

/**
 * Prognoza na 7 dni dla miejsca. Świeża z pamięci (do 3 h) albo z sieci; bez sieci – ostatnia zapamiętana.
 * Czas w odpowiedzi jest czasem lokalnym miejsca (timezone=auto), więc daty zgadzają się z datami planu.
 */
export function forecastFor(place: Place, fetcher: typeof fetch = fetch, now = new Date()): Promise<Forecast | null> {
  return once(`forecast:${placeKey(place)}`, () => forecastForNow(place, fetcher, now));
}

async function forecastForNow(place: Place, fetcher: typeof fetch, now: Date): Promise<Forecast | null> {
  const cached = readStore<Forecast>(placeKey(place));
  if (cached && now.getTime() - Date.parse(cached.fetchedAt) < FRESH_MS) return cached;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return cached;
  try {
    const params = new URLSearchParams({
      latitude: String(place.lat),
      longitude: String(place.lng),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
      hourly: 'cloud_cover',
      timezone: 'auto',
      forecast_days: '7',
      wind_speed_unit: 'kmh',
    });
    const res = await fetcher(`${FORECAST_URL}?${params}`);
    if (!res.ok) throw new Error(`forecast ${res.status}`);
    const forecast = parseForecast(place, (await res.json()) as OpenMeteo, now);
    writeStore(placeKey(place), forecast);
    return forecast;
  } catch {
    return cached;
  }
}

// ---------- słońce i księżyc (bez sieci, bez limitu dni) ----------

const MOON = ['🌑 nów', '🌒 przybywa', '🌓 pierwsza kwadra', '🌔 przybywa', '🌕 pełnia', '🌖 ubywa', '🌗 ostatnia kwadra', '🌘 ubywa'];

export function moonPhase(at: Date): string {
  const phase = SunCalc.getMoonIllumination(at).phase; // 0 nów, 0.5 pełnia
  return MOON[Math.round(phase * 8) % 8];
}

/** Wschód i zachód słońca w czasie miejsca (HH:MM) dla daty planu; polarna noc/dzień – null. */
export function sunTimes(date: string, place: Place, zone: string): { sunrise: string | null; sunset: string | null } {
  const noon = new Date(`${date}T12:00:00Z`);
  const t = SunCalc.getTimes(noon, place.lat, place.lng);
  const fmt = (d: Date) => (Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: zone }));
  return { sunrise: fmt(t.sunrise), sunset: fmt(t.sunset) };
}

export function fetchedLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  return today ? `dziś ${time}` : `${d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}, ${time}`;
}
