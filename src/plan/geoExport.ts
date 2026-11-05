import type { DayDoc, Hotel } from '../model/types';
import type { Wish } from '../wishes/wishes';
import { PRIORITY_LABEL, score, sortWishes } from '../wishes/wishes';

// Eksport planu, noclegów i listy życzeń na mapę (v2, decyzja Jacka z 5.11.2026):
// KML – Google Moje Mapy, Google Earth; GPX – Organic Maps, OsmAnd, Garmin. Logika bez DOM – testowana osobno.

export type GeoKind = 'plan' | 'hotel' | 'must' | 'nice';

export interface GeoPoint {
  folder: string; // np. „czw., 10 gru – Tokio”, „Noclegi”, „Lista życzeń”
  name: string;
  kind: GeoKind;
  lat?: number;
  lng?: number;
  query?: string; // do wyszukania położenia, gdy brak współrzędnych (nazwa + adres)
  description?: string;
  approx?: boolean; // położenie znalezione w OpenStreetMap po nazwie/adresie
}

const hasCoords = (p: GeoPoint): p is GeoPoint & { lat: number; lng: number } => typeof p.lat === 'number' && typeof p.lng === 'number';
const plain = (text: string) => text.replace(/\*\*/g, '');

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pl-PL', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
}

export interface CollectInput {
  days: DayDoc[];
  include: (item: DayDoc['items'][number]) => boolean; // „Mój plan” albo całość
  hotels?: Hotel[];
  wishes?: Wish[];
}

/** Punkty do eksportu: plan (dzień = folder), noclegi, lista życzeń. Punkty bez miejsca są pomijane. */
export function collectPoints({ days, include, hotels = [], wishes = [] }: CollectInput): GeoPoint[] {
  const out: GeoPoint[] = [];
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const folder = [dayLabel(day.date), day.title].filter(Boolean).join(' – ');
    for (const item of [...day.items].filter(include).sort((a, b) => a.start.localeCompare(b.start))) {
      if (!item.place?.name && !item.place?.address) continue;
      const time = item.start.slice(11, 16);
      const place = item.place;
      out.push({
        folder,
        name: `${time} ${item.title}`,
        kind: 'plan',
        lat: place.lat,
        lng: place.lng,
        query: [place.name, place.address].filter(Boolean).join(', '),
        description: [place.name !== item.title ? place.name : '', place.address, item.notes && plain(item.notes), item.route && `Dojazd: ${plain(item.route)}`]
          .filter(Boolean)
          .join('\n'),
      });
    }
  }
  for (const hotel of hotels) {
    if (!hotel.name && !hotel.address) continue;
    out.push({
      folder: 'Noclegi',
      name: `🛏 ${hotel.name}`,
      kind: 'hotel',
      query: [hotel.name, hotel.address].filter(Boolean).join(', '),
      description: [hotel.address, hotel.phone && `tel. ${hotel.phone}`, hotel.checkIn && `zameldowanie ${hotel.checkIn.replace('T', ' ')}`].filter(Boolean).join('\n'),
    });
  }
  for (const w of sortWishes(wishes)) {
    const must = Object.values(w.votes).some((v) => v.priority === 'must');
    out.push({
      folder: 'Lista życzeń',
      name: w.name,
      kind: must ? 'must' : 'nice',
      lat: w.place?.lat,
      lng: w.place?.lng,
      query: [w.name, w.place?.address].filter(Boolean).join(', '),
      description: [
        w.place?.address,
        `${score(w)} pkt · ${Object.values(w.votes)
          .map((v) => `${v.name} (${PRIORITY_LABEL[v.priority]})`)
          .join(', ')}`,
        w.note,
        w.link,
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }
  return out;
}

/** Uzupełnia brakujące współrzędne (np. wyszukiwarką OpenStreetMap). Jedno zapytanie na ten sam adres. */
export async function fillCoords(points: GeoPoint[], find: (query: string) => Promise<{ lat: number; lng: number } | null>, limit = 40): Promise<GeoPoint[]> {
  const cache = new Map<string, Promise<{ lat: number; lng: number } | null>>();
  let asked = 0;
  return Promise.all(
    points.map(async (p) => {
      if (hasCoords(p) || !p.query) return p;
      let found = cache.get(p.query);
      if (!found) {
        if (asked >= limit) return p;
        asked += 1;
        found = find(p.query).catch(() => null);
        cache.set(p.query, found);
      }
      const hit = await found;
      return hit ? { ...p, lat: hit.lat, lng: hit.lng, approx: true } : p;
    }),
  );
}

// ---------- pliki ----------

const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const coord = (n: number) => String(Math.round(n * 1e6) / 1e6);
const APPROX_NOTE = 'Położenie przybliżone (wyszukane w OpenStreetMap po nazwie i adresie).';
const describe = (p: GeoPoint) => [p.description, p.approx ? APPROX_NOTE : ''].filter(Boolean).join('\n');

// KML: kolorowe pinezki Google (plan – niebieskie, noclegi – czerwone, „muszę” – żółte z gwiazdką, reszta życzeń – zielone)
const KML_STYLES: Record<GeoKind, { icon: string }> = {
  plan: { icon: 'blu-circle' },
  hotel: { icon: 'red-circle' },
  must: { icon: 'ylw-stars' },
  nice: { icon: 'grn-circle' },
};

export function buildKml(title: string, points: GeoPoint[]): { kml: string; count: number; skipped: number } {
  const usable = points.filter(hasCoords);
  const folders = new Map<string, typeof usable>();
  for (const p of usable) folders.set(p.folder, [...(folders.get(p.folder) ?? []), p]);
  const styles = (Object.keys(KML_STYLES) as GeoKind[]).map(
    (k) => `<Style id="${k}"><IconStyle><Icon><href>https://maps.google.com/mapfiles/kml/paddle/${KML_STYLES[k].icon}.png</href></Icon></IconStyle></Style>`,
  );
  const body = [...folders].map(
    ([name, pts]) =>
      `<Folder><name>${xml(name)}</name>${pts
        .map(
          (p) =>
            `<Placemark><name>${xml(p.name)}</name>${describe(p) ? `<description>${xml(describe(p))}</description>` : ''}<styleUrl>#${p.kind}</styleUrl><Point><coordinates>${coord(p.lng)},${coord(p.lat)},0</coordinates></Point></Placemark>`,
        )
        .join('')}</Folder>`,
  );
  const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(title)}</name>${styles.join('')}${body.join('')}</Document></kml>\n`;
  return { kml, count: usable.length, skipped: points.length - usable.length };
}

export function buildGpx(title: string, points: GeoPoint[]): { gpx: string; count: number; skipped: number } {
  const usable = points.filter(hasCoords);
  const wpts = usable.map(
    (p) =>
      `<wpt lat="${coord(p.lat)}" lon="${coord(p.lng)}"><name>${xml(p.folder === 'Noclegi' || p.folder === 'Lista życzeń' ? p.name : `${p.folder.split(' – ')[0]} ${p.name}`)}</name>${
        describe(p) ? `<desc>${xml(describe(p))}</desc>` : ''
      }<type>${xml(p.folder)}</type></wpt>`,
  );
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Klub" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xml(title)}</name></metadata>${wpts.join('')}</gpx>\n`;
  return { gpx, count: usable.length, skipped: points.length - usable.length };
}

export function mapFileName(tripTitle: string, ext: 'kml' | 'gpx'): string {
  const slug = tripTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `klub-mapa-${slug || 'wyjazd'}.${ext}`;
}
