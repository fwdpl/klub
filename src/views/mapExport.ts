import { getInfo, isFor, type Trip } from '../data/trips';
import { listWishes } from '../data/wishes';
import type { DayDoc } from '../model/types';
import { buildGpx, buildKml, collectPoints, fillCoords, mapFileName, type GeoPoint } from '../plan/geoExport';
import { isAndroid, isIOS } from '../platform';
import { plural } from '../text';
import { h, toast } from '../ui';
import { searchOsm } from '../wishes/wishes';
import { deliverFile } from './calendar';

// Eksport na mapę (v2, decyzja Jacka z 5.11.2026): plan, noclegi i lista życzeń jako KML (Google Moje Mapy / Earth)
// albo GPX (Organic Maps, OsmAnd – mapy offline). Brakujące położenia szuka w OpenStreetMap (z internetem).

function centre(points: GeoPoint[]): { lat: number; lng: number } | undefined {
  const known = points.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
  if (!known.length) return undefined;
  return { lat: known.reduce((n, p) => n + p.lat!, 0) / known.length, lng: known.reduce((n, p) => n + p.lng!, 0) / known.length };
}

/** Przycisk i panel „Na mapę” w sekcji planu. */
export function mapExport(trip: Trip, days: DayDoc[], uid: string, mineOnly: boolean): HTMLElement {
  const wrap = h('div', { class: 'calendar-export' });
  const openBtn = h('button', { type: 'button', class: 'chip-btn chip-btn--wide' }, '🗺️ Pobierz na mapę (KML / GPX)');
  const panel = h('div', { class: 'card card--inner', hidden: true });
  openBtn.addEventListener('click', () => (panel.hidden = !panel.hidden));

  const box = (label: string, checked = true) => {
    const input = h('input', { type: 'checkbox' });
    input.checked = checked;
    return { input, el: h('label', { class: 'check' }, input, h('span', {}, label)) };
  };
  const plan = box(mineOnly ? 'Mój plan' : 'Cały plan');
  const hotels = box('Noclegi');
  const wishes = box('Lista życzeń');
  const status = h('p', { class: 'muted', role: 'status' });

  const run = async (format: 'kml' | 'gpx', button: HTMLButtonElement) => {
    button.disabled = true;
    status.textContent = 'Przygotowuję…';
    try {
      const include = (i: DayDoc['items'][number]) => !mineOnly || isFor(i.audience, uid);
      const info = hotels.input.checked ? await getInfo(trip.id).catch(() => null) : null;
      const wishList = wishes.input.checked ? await listWishes(trip.id).catch(() => []) : [];
      let points = collectPoints({
        days: plan.input.checked ? days : [],
        include,
        hotels: (info?.hotels ?? []).filter((x) => !mineOnly || isFor(x.audience, uid)),
        wishes: wishList,
      });
      if (!points.length) {
        status.textContent = 'Brak miejsc do eksportu – zaznacz coś powyżej.';
        return;
      }
      const missing = points.filter((p) => p.lat === undefined).length;
      if (missing && navigator.onLine !== false) {
        status.textContent = `Szukam położenia ${plural(missing, 'miejsca', 'miejsc', 'miejsc')} w OpenStreetMap…`;
        const near = centre(points);
        points = await fillCoords(points, async (q) => {
          const hit = (await searchOsm(q, near))[0];
          return hit ? { lat: hit.lat, lng: hit.lng } : null;
        });
      }
      const title = `${trip.title} – Klub`;
      const out = format === 'kml' ? buildKml(title, points) : buildGpx(title, points);
      const content = 'kml' in out ? out.kml : out.gpx;
      if (!out.count) {
        status.textContent = 'Żadne miejsce nie ma położenia na mapie (spróbuj z internetem).';
        return;
      }
      await deliverFile(mapFileName(trip.title, format), content, format === 'kml' ? 'application/vnd.google-earth.kml+xml' : 'application/gpx+xml');
      const approx = points.filter((p) => p.approx).length;
      status.textContent = [
        `Na mapie: ${plural(out.count, 'miejsce', 'miejsca', 'miejsc')}.`,
        approx ? `${approx} z położeniem przybliżonym (wyszukane po nazwie – sprawdź na mapie).` : '',
        out.skipped ? `Bez położenia (pominięte): ${out.skipped}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
    } catch {
      status.textContent = '';
      toast('Nie udało się przygotować pliku.');
    } finally {
      button.disabled = false;
    }
  };

  const kml = h('button', { type: 'button', class: 'btn' }, 'KML (Google)');
  const gpx = h('button', { type: 'button', class: 'btn btn--secondary' }, 'GPX (mapy offline)');
  kml.addEventListener('click', () => void run('kml', kml));
  gpx.addEventListener('click', () => void run('gpx', gpx));

  const how = isIOS()
    ? 'iPhone: w oknie udostępniania wybierz aplikację map (np. Organic Maps) albo „Zachowaj w Plikach”.'
    : isAndroid()
      ? 'Android: otwórz pobrany plik w Organic Maps / OsmAnd albo zaimportuj go w Google Moje Mapy.'
      : 'Komputer: KML zaimportujesz w Google Moje Mapy (mymaps.google.com → Utwórz mapę → Importuj) albo otworzysz w Google Earth.';

  panel.append(
    h('p', {}, 'Co ma trafić na mapę?'),
    plan.el,
    hotels.el,
    wishes.el,
    h('div', { class: 'actions actions--row' }, kml, gpx),
    status,
    h('p', { class: 'muted' }, 'KML – Google Moje Mapy i Google Earth (każdy dzień to osobna warstwa). GPX – Organic Maps, OsmAnd i inne mapy działające bez internetu.'),
    h('p', { class: 'muted' }, how),
  );
  wrap.append(openBtn, panel);
  return wrap;
}
