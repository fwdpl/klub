import { saveDay, type Trip } from '../data/trips';
import type { DayDoc } from '../model/types';
import { todayIn } from '../plan/time';
import { h, toast } from '../ui';
import {
  fetchedLabel,
  forecastFor,
  moonPhase,
  placeFor,
  searchPlaces,
  sunTimes,
  weatherLook,
  type DayForecast,
  type Forecast,
  type Place,
} from '../weather/weather';

// Pogoda w planie: znaczek w nagłówku dnia (gdy jest prognoza) i blok w rozwiniętym dniu.

export async function placeForDay(trip: Trip, day: DayDoc): Promise<{ place: Place; source: 'organizer' | 'base' | 'trip' } | null> {
  if (day.weatherPlace) return { place: day.weatherPlace, source: 'organizer' };
  try {
    const base = day.baseLocation ? await placeFor(day.baseLocation) : null;
    if (base) return { place: base, source: 'base' };
    const fromTrip = trip.destination ? await placeFor(trip.destination) : null;
    return fromTrip ? { place: fromTrip, source: 'trip' } : null;
  } catch {
    return null;
  }
}

/** Czy data jest w zasięgu prognozy (dziś i 6 kolejnych dni w strefie miejsca). */
export function inForecastRange(date: string, zone: string, now = new Date()): boolean {
  const today = todayIn(zone, now);
  const diff = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return diff >= 0 && diff <= 6;
}

export function chipText(f: DayForecast): string {
  return `${weatherLook(f.code).icon} ${f.max}°/${f.min}°`;
}

function cloudsBar(f: DayForecast): HTMLElement {
  return h(
    'div',
    { class: 'clouds', 'aria-label': 'Zachmurzenie w ciągu dnia' },
    ...f.clouds.map((c) =>
      h(
        'span',
        { class: 'clouds__cell', title: `${c.hour}:00 – ${c.value}%` },
        h('span', { class: 'clouds__area' }, h('span', { class: 'clouds__pct' }, `${c.value}%`), h('span', { class: 'clouds__fill', style: `height:${Math.max(6, c.value)}%` })),
        h('small', {}, String(c.hour)),
      ),
    ),
  );
}

function forecastBlock(f: DayForecast, forecast: Forecast): HTMLElement {
  const look = weatherLook(f.code);
  return h(
    'div',
    { class: 'weather__forecast' },
    h('p', { class: 'weather__main' }, `${look.icon} ${look.text}, ${f.max}° / ${f.min}°`),
    h(
      'p',
      { class: 'muted' },
      [`opady ${f.rain.toLocaleString('pl-PL')} mm${f.rainChance !== undefined ? ` (${f.rainChance}%)` : ''}`, `wiatr do ${f.wind} km/h`].join(' · '),
    ),
    f.clouds.length ? cloudsBar(f) : '',
    h('p', { class: 'muted weather__source' }, `Prognoza dla: ${forecast.place.name} · pobrano ${fetchedLabel(forecast.fetchedAt)}`),
  );
}

/** Blok pogody w rozwiniętym dniu planu (ładowany przy pierwszym rozwinięciu). */
export function dayWeather(trip: Trip, day: DayDoc, zone: string, isOrganizer: boolean): HTMLElement {
  const box = h('div', { class: 'weather' }, h('p', { class: 'muted' }, 'Pogoda…'));
  void (async () => {
    const found = await placeForDay(trip, day);
    if (!found) {
      box.replaceChildren(
        h('p', { class: 'muted' }, 'Pogoda: nie znalazłem miejsca dla tego dnia.'),
        isOrganizer ? placeEditor(trip, day, box, zone) : '',
      );
      return;
    }
    const { place, source } = found;
    const sun = sunTimes(day.date, place, zone);
    const moon = moonPhase(new Date(`${day.date}T22:00:00Z`));
    const sunLine = h(
      'p',
      { class: 'muted' },
      [sun.sunrise ? `wschód ${sun.sunrise}` : 'bez wschodu słońca', sun.sunset ? `zachód ${sun.sunset}` : 'bez zachodu słońca', `księżyc: ${moon}`].join(' · '),
    );
    let forecastEl: HTMLElement | string = h('p', { class: 'muted' }, 'Prognoza pojawi się na 7 dni przed tym dniem.');
    if (inForecastRange(day.date, zone)) {
      const forecast = await forecastFor(place);
      const f = forecast?.days.find((d) => d.date === day.date);
      forecastEl = f && forecast ? forecastBlock(f, forecast) : h('p', { class: 'muted' }, navigator.onLine ? 'Nie udało się pobrać prognozy.' : 'Bez internetu – prognoza pobierze się po połączeniu.');
    } else if (source !== 'organizer') {
      sunLine.append(` (dla: ${place.name})`);
    }
    box.replaceChildren(forecastEl, sunLine, isOrganizer ? placeEditor(trip, day, box, zone, place) : '');
  })();
  return box;
}

/** Organizator: poprawka miejsca prognozy dla dnia (np. gdy baza dnia to opis, nie miejscowość). */
function placeEditor(trip: Trip, day: DayDoc, box: HTMLElement, zone: string, current?: Place): HTMLElement {
  const toggle = h('button', { type: 'button', class: 'link-btn weather__change' }, current ? 'Zmień miejsce prognozy' : 'Wskaż miejsce prognozy');
  const wrap = h('div', {}, toggle);
  toggle.addEventListener('click', () => {
    const input = h('input', { type: 'search', placeholder: 'Wpisz miejscowość, np. Vík', autocomplete: 'off', 'aria-label': 'Miejsce prognozy' });
    const results = h('div', { class: 'zone-results', role: 'listbox' });
    let timer: number | undefined;
    input.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const found = await searchPlaces(input.value).catch(() => []);
        results.replaceChildren(
          ...found.map((p) =>
            h(
              'button',
              {
                type: 'button',
                class: 'zone-option',
                onclick: async () => {
                  try {
                    await saveDay(trip.id, { ...day, weatherPlace: p });
                    day.weatherPlace = p;
                    toast(`Pogoda dla: ${p.name}`);
                    box.replaceWith(dayWeather(trip, day, zone, true));
                  } catch {
                    toast('Nie udało się zapisać miejsca.');
                  }
                },
              },
              h('span', {}, p.name),
            ),
          ),
        );
      }, 350);
    });
    wrap.replaceChildren(h('div', { class: 'zone-picker' }, input, results));
    input.focus();
  });
  return wrap;
}

/** Znaczek pogody w nagłówku dnia – dopisywany, gdy jest prognoza na ten dzień. */
export function attachDayChip(trip: Trip, day: DayDoc, zone: string, target: HTMLElement): void {
  if (!inForecastRange(day.date, zone)) return;
  void (async () => {
    const found = await placeForDay(trip, day);
    const forecast = found ? await forecastFor(found.place) : null;
    const f = forecast?.days.find((d) => d.date === day.date);
    if (f) target.append(h('span', { class: 'weather-chip', title: weatherLook(f.code).text }, chipText(f)));
  })();
}

/** Krótka linia pogody na karcie „Dziś”. */
export function todayWeather(trip: Trip, day: DayDoc, zone: string): HTMLElement {
  const line = h('p', { class: 'muted' });
  const wrap = h('div', { class: 'today__weather' }, line);
  void (async () => {
    const found = await placeForDay(trip, day);
    if (!found) return;
    const forecast = await forecastFor(found.place);
    const f = forecast?.days.find((d) => d.date === day.date);
    const sun = sunTimes(day.date, found.place, zone);
    const parts = [
      f ? `${weatherLook(f.code).icon} ${weatherLook(f.code).text}, ${f.max}°/${f.min}°` : '',
      f && f.rain > 0 ? `opady ${f.rain.toLocaleString('pl-PL')} mm` : '',
      f ? `wiatr do ${f.wind} km/h` : '',
      sun.sunset ? `zachód ${sun.sunset}` : '',
    ].filter(Boolean);
    line.textContent = parts.join(' · ');
    // zachmurzenie w ciągu dnia – tak jak w rozwiniętym dniu planu
    if (f?.clouds.length) wrap.append(cloudsBar(f));
  })();
  return wrap;
}
