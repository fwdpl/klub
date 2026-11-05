// Lista życzeń (v2, decyzje Jacka z 4.11.2026): miejsce istnieje raz, inni dopisują się „też chcę” z własnym
// priorytetem. Miejsca z OpenStreetMap (wyszukiwarka Photon) albo z wklejonego linku Google Maps.
// Logika bez DOM i bazy – testowana osobno.

export type Priority = 'must' | 'nice';
export type DayTime = 'rano' | 'południe' | 'wieczór' | 'dowolna';

export interface WishVote {
  name: string;
  priority: Priority;
}

export interface WishPlace {
  lat?: number;
  lng?: number;
  address?: string;
  osm?: string; // np. 'N123456' – podstawa identyfikatora, żeby miejsce było raz
}

export interface Wish {
  id: string;
  name: string;
  place?: WishPlace;
  link?: string;
  preferredTime?: DayTime;
  durationMin?: number;
  fixedTime?: string; // 'HH:MM' – stała godzina (bilet, rezerwacja)
  note?: string;
  addedBy: string;
  addedByName: string;
  votes: Record<string, WishVote>;
}

export const PRIORITY_LABEL: Record<Priority, string> = { must: 'muszę', nice: 'fajnie by było' };
export const TIME_LABEL: Record<DayTime, string> = { rano: 'rano', południe: 'w środku dnia', wieczór: 'wieczorem', dowolna: 'o dowolnej porze' };

/** Punkty popularności: „muszę” liczy się podwójnie. */
export function score(w: Pick<Wish, 'votes'>): number {
  return Object.values(w.votes).reduce((n, v) => n + (v.priority === 'must' ? 2 : 1), 0);
}

export function sortWishes(list: Wish[]): Wish[] {
  return [...list].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, 'pl'));
}

/** Identyfikator dokumentu: z OSM (to samo miejsce = ten sam dokument), inaczej z nazwy i współrzędnych. */
export function wishId(name: string, place?: WishPlace): string {
  if (place?.osm) return `osm-${place.osm}`;
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const coords = place?.lat !== undefined && place?.lng !== undefined ? `-${place.lat.toFixed(3)}_${place.lng.toFixed(3)}` : '';
  return `n-${base || 'miejsce'}${coords}`.replace(/\./g, '-');
}

// ---------- link z Google Maps ----------

/** Nazwa i współrzędne z linku Google Maps (pełnego). Krótkie linki maps.app.goo.gl – tylko jako link. */
export function parseMapsLink(raw: string): { link: string; name?: string; lat?: number; lng?: number } | null {
  const text = raw.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^www\./, '');
  if (!/(^|\.)google\.[a-z.]+$/.test(host) && host !== 'maps.app.goo.gl' && host !== 'goo.gl') return null;
  const out: { link: string; name?: string; lat?: number; lng?: number } = { link: url.toString() };
  const place = /\/maps\/place\/([^/]+)/.exec(url.pathname);
  if (place) out.name = decodeURIComponent(place[1].replace(/\+/g, ' ')).trim();
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url.pathname);
  const q = url.searchParams.get('query') ?? url.searchParams.get('q');
  if (at) {
    out.lat = Number(at[1]);
    out.lng = Number(at[2]);
  } else if (q && /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(q)) {
    const [lat, lng] = q.split(',').map(Number);
    out.lat = lat;
    out.lng = lng;
  } else if (q && !out.name) {
    out.name = q;
  }
  return out;
}

// ---------- wyszukiwarka OpenStreetMap (Photon) ----------

export interface PlaceHit {
  name: string;
  address: string;
  lat: number;
  lng: number;
  osm: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { osm_type?: string; osm_id?: number; name?: string; street?: string; housenumber?: string; city?: string; town?: string; village?: string; state?: string; country?: string };
}

export function parsePhoton(data: { features?: PhotonFeature[] }): PlaceHit[] {
  return (data.features ?? [])
    .filter((f) => f.properties.name && f.properties.osm_type && f.properties.osm_id !== undefined)
    .map((f) => {
      const p = f.properties;
      const street = [p.street, p.housenumber].filter(Boolean).join(' ');
      return {
        name: p.name!,
        address: [street, p.city ?? p.town ?? p.village, p.country].filter(Boolean).join(', '),
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        osm: `${p.osm_type}${p.osm_id}`,
      };
    })
    .filter((hit, i, all) => all.findIndex((x) => x.osm === hit.osm) === i);
}

export async function searchOsm(query: string, near?: { lat: number; lng: number }, fetcher: typeof fetch = fetch): Promise<PlaceHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({ q, limit: '6' });
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lon', String(near.lng));
  }
  const res = await fetcher(`https://photon.komoot.io/api/?${params}`);
  if (!res.ok) throw new Error(`photon ${res.status}`);
  return parsePhoton(await res.json());
}

// ---------- eksport ----------

export const WISHLIST_FORMAT = 'klub-wishlist';

/** Plik do planowania (np. dla Claude): miejsca od najpopularniejszych, z głosami i preferencjami. */
export function exportWishlist(tripTitle: string, list: Wish[], now = new Date()): object {
  return {
    format: WISHLIST_FORMAT,
    version: '1.0',
    trip: tripTitle,
    exportedAt: now.toISOString(),
    places: sortWishes(list).map((w) => ({
      name: w.name,
      ...(w.place?.address ? { address: w.place.address } : {}),
      ...(w.place?.lat !== undefined ? { lat: w.place.lat, lng: w.place.lng } : {}),
      ...(w.link ? { link: w.link } : {}),
      ...(w.preferredTime ? { preferredTime: w.preferredTime } : {}),
      ...(w.durationMin ? { durationMin: w.durationMin } : {}),
      ...(w.fixedTime ? { fixedTime: w.fixedTime } : {}),
      ...(w.note ? { note: w.note } : {}),
      score: score(w),
      votes: Object.values(w.votes).map((v) => ({ name: v.name, priority: v.priority })),
    })),
  };
}
