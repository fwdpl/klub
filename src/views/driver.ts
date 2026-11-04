import type { Hotel } from '../model/types';
import { h } from '../ui';

// Karta „pokaż kierowcy” (lista „Szybko po v1”, prośba Jacka z 4.11.2026): adres noclegu dużą czcionką,
// najlepiej w lokalnym języku, na cały ekran – do pokazania taksówkarzowi. Działa bez internetu.

type WakeLock = { release: () => Promise<void> };

function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** Wyszukiwanie w Google Maps: najlepiej po adresie lokalnym, inaczej po nazwie i adresie. */
export function mapsUrl(hotel: Pick<Hotel, 'name' | 'address' | 'localAddress'>): string {
  const query = hotel.localAddress?.replace(/\s+/g, ' ').trim() || [hotel.name, hotel.address].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Czy jest co pokazać kierowcy. */
export function hasDriverCard(hotel: Hotel): boolean {
  return !!(hotel.localAddress || hotel.address);
}

export function showDriverCard(hotel: Hotel): void {
  let lock: WakeLock | null = null;
  const previousFocus = document.activeElement as HTMLElement | null;

  const close = () => {
    void lock?.release().catch(() => undefined);
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    document.body.classList.remove('driver-open');
    previousFocus?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  const closeBtn = h('button', { type: 'button', class: 'btn btn--secondary driver__close', onclick: close }, 'Zamknij');
  const local = hotel.localAddress || hotel.localName;
  const overlay = h(
    'div',
    { class: 'driver', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Pokaż kierowcy: ${hotel.name}` },
    h('p', { class: 'driver__ask' }, 'Please take me to this address'),
    hotel.localName && h('p', { class: 'driver__name', lang: 'und' }, hotel.localName),
    hotel.localAddress && h('p', { class: 'driver__address', lang: 'und' }, hotel.localAddress),
    // bez wersji lokalnej adres łaciński jest głównym; z nią – mniejszy, pod spodem
    h('p', { class: local ? 'driver__latin' : 'driver__address' }, hotel.name),
    hotel.address && h('p', { class: local ? 'driver__latin' : 'driver__address' }, hotel.address),
    hotel.phone && h('a', { class: 'driver__phone', href: telLink(hotel.phone) }, `☎ ${hotel.phone}`),
    // mapa z pinezką: kierowca rozpozna miejsce, nawet gdy nie ma adresu w lokalnym języku (wymaga internetu)
    h('a', { class: 'btn btn--link driver__map', href: mapsUrl(hotel), target: '_blank', rel: 'noopener' }, '🗺 Pokaż na mapie'),
    closeBtn,
  );

  document.body.append(overlay);
  document.body.classList.add('driver-open');
  document.addEventListener('keydown', onKey);
  closeBtn.focus();
  // ekran nie gaśnie, póki kierowca czyta (Android Chrome, iOS 16.4+); bez obsługi – po prostu nic
  const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLock> } }).wakeLock;
  wakeLock
    ?.request('screen')
    .then((l) => (lock = l))
    .catch(() => undefined);
}
