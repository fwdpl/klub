import { h } from '../ui';

// Mapa obok planu na tablecie i komputerze (v2, układ tabletowy – zgoda Jacka z 5.11.2026).
// Leaflet + OpenStreetMap ładowane dopiero na szerokim ekranie, więc telefon nic nie pobiera.
// Bez internetu kafelki mapy się nie wczytają – plan obok działa dalej.

export interface MapPoint {
  lat: number;
  lng: number;
  n: number; // numer na pinezce (kolejność w dniu)
  title: string; // „09:00 Senso-ji”
  day: string; // „pt., 11 gru”
}

type Leaflet = typeof import('leaflet');

let leafletPromise: Promise<Leaflet> | null = null;
function loadLeaflet(): Promise<Leaflet> {
  leafletPromise ??= Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(
    ([mod]) => (mod as unknown as { default?: Leaflet }).default ?? (mod as unknown as Leaflet),
  );
  return leafletPromise;
}

export function planMap(): { el: HTMLElement; show: (points: MapPoint[], caption: string) => void } {
  const canvas = h('div', { class: 'plan-map__canvas', role: 'region', 'aria-label': 'Mapa punktów planu' });
  const caption = h('p', { class: 'muted plan-map__caption' });
  const el = h('aside', { class: 'plan-map' }, canvas, caption);
  let map: import('leaflet').Map | null = null;
  let layer: import('leaflet').LayerGroup | null = null;
  let pending: { points: MapPoint[]; text: string } | null = null;

  const render = (L: Leaflet, points: MapPoint[], text: string) => {
    if (!map) {
      map = L.map(canvas, { zoomControl: true, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(map);
      layer = L.layerGroup().addTo(map);
    }
    layer!.clearLayers();
    caption.textContent = text;
    if (!points.length) {
      map.setView([20, 0], 1);
      return;
    }
    const markers = points.map((p) =>
      L.marker([p.lat, p.lng], {
        title: p.title,
        icon: L.divIcon({ className: 'plan-pin', html: `<span>${p.n}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
      }).bindPopup(() => {
        const box = document.createElement('div');
        box.append(Object.assign(document.createElement('b'), { textContent: p.title }), document.createElement('br'), p.day);
        return box;
      }),
    );
    for (const m of markers) m.addTo(layer!);
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [32, 32], maxZoom: 15 });
    // mapa wstawiona do niewidocznej jeszcze zakładki – przelicz rozmiar, gdy się pokaże
    setTimeout(() => map?.invalidateSize(), 0);
  };

  const show = (points: MapPoint[], text: string) => {
    pending = { points, text };
    void loadLeaflet()
      .then((L) => {
        if (pending) render(L, pending.points, pending.text);
        pending = null;
      })
      .catch(() => {
        caption.textContent = 'Mapa niedostępna (brak internetu).';
      });
  };

  // zakładka planu bywa ukryta przy tworzeniu – po pokazaniu mapa musi znać swój rozmiar
  new ResizeObserver(() => map?.invalidateSize()).observe(canvas);
  return { el, show };
}
