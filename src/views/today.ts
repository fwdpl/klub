import { isFor, type Trip } from '../data/trips';
import type { DayDoc, Hotel, PlanItem } from '../model/types';
import { countdown, hotelTonight, todayView, type Upcoming } from '../plan/today';
import { zoneLabel } from '../timezones';
import { h } from '../ui';
import { hasDriverCard, mapsUrl, showDriverCard } from './driver';
import { formatLocal } from './tripDetails';
import { todayWeather } from './weatherView';

// Karta „Dziś” na górze ekranu wyjazdu – tylko w dniach z planu. Odświeża się co 30 s (odliczanie).

interface Viewer {
  uid: string;
  isOrganizer: boolean;
}

const time = (local: string) => local.slice(11, 16);

function placeLink(item: PlanItem): string | null {
  const p = item.place;
  if (!p) return null;
  const query = p.lat !== undefined && p.lng !== undefined ? `${p.lat},${p.lng}` : [p.name, p.address].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function when(e: Upcoming, zone: string): string {
  const t = time(e.item.start);
  return e.item.tz && e.item.tz !== zone ? `${t} (${zoneLabel(e.item.tz)})` : t;
}

function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function todayCard(trip: Trip, viewer: Viewer, days: DayDoc[], hotels: Hotel[], mineOnly: boolean): HTMLElement | null {
  const include = (i: PlanItem) => !mineOnly || isFor(i.audience, viewer.uid);
  if (!todayView(days, trip.timezone, include)) return null;

  const card = h('section', { class: 'card card--today', 'aria-live': 'polite' });
  const myHotels = viewer.isOrganizer && !mineOnly ? hotels : hotels.filter((x) => isFor(x.audience, viewer.uid));

  // pogoda na dziś – ładowana raz (prognoza z pamięci urządzenia albo z sieci)
  const first = todayView(days, trip.timezone, include);
  const weather = first ? todayWeather(trip, first.day, first.zone) : '';

  const draw = () => {
    const now = Date.now();
    const v = todayView(days, trip.timezone, include, new Date(now));
    if (!v) return void card.replaceChildren(h('p', { class: 'muted' }, 'Plan na dziś się skończył.'));
    const hotel = hotelTonight(myHotels, v.day.date);
    const nav = v.next && placeLink(v.next.item);

    card.replaceChildren(
      h(
        'div',
        { class: 'today__head' },
        h('h2', {}, 'Dziś'),
        h('span', { class: 'muted' }, [formatLocal(v.day.date), v.day.baseLocation].filter(Boolean).join(' · ')),
      ),
      v.day.title ? h('p', { class: 'today__title' }, v.day.title) : '',
      weather,
      v.meet
        ? h(
            'div',
            { class: 'today__meet' },
            h('span', {}, `Zbiórka: ${v.meet.place} – ${new Date(v.meet.at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: v.next?.item.tz ?? v.zone })}`),
            h('b', {}, countdown(v.meet.at - now)),
          )
        : '',
      v.current
        ? h('p', { class: 'today__row' }, h('span', { class: 'today__label' }, 'Teraz'), `${v.current.item.title}${v.current.item.end ? ` – do ${time(v.current.item.end)}` : ''}`)
        : '',
      v.next
        ? h(
            'div',
            { class: 'today__next' },
            h('p', { class: 'today__row' }, h('span', { class: 'today__label' }, 'Dalej'), `${when(v.next, v.zone)} ${v.next.item.title}`),
            h('p', { class: 'today__countdown' }, countdown(v.next.start - now)),
            v.next.item.place ? h('p', { class: 'muted' }, [v.next.item.place.name, v.next.item.place.address].filter(Boolean).join(', ')) : '',
            nav ? h('a', { class: 'chip-btn chip-btn--wide', href: nav, target: '_blank', rel: 'noopener' }, `Nawiguj: ${v.next.item.place?.name ?? ''}`) : '',
          )
        : v.tomorrow
          ? h('p', { class: 'today__row' }, h('span', { class: 'today__label' }, 'Na dziś koniec'), `Jutro ${when(v.tomorrow, v.tomorrow.day.timezone ?? trip.timezone)} ${v.tomorrow.item.title}`)
          : h('p', { class: 'muted' }, 'Na dziś to wszystko.'),
      hotel
        ? h(
            'div',
            { class: 'today__hotel' },
            h('p', { class: 'today__row' }, h('span', { class: 'today__label' }, 'Nocleg'), hotel.name),
            hotel.address ? h('p', { class: 'muted' }, hotel.address) : '',
            h(
              'div',
              { class: 'actions actions--row' },
              hotel.address ? h('a', { class: 'chip-btn', href: mapsUrl(hotel), target: '_blank', rel: 'noopener' }, 'Nawiguj') : '',
              hotel.phone ? h('a', { class: 'chip-btn', href: telLink(hotel.phone) }, 'Zadzwoń') : '',
              hasDriverCard(hotel) ? h('button', { type: 'button', class: 'chip-btn', onclick: () => showDriverCard(hotel) }, '🚕 Pokaż kierowcy') : '',
            ),
          )
        : '',
    );
  };

  draw();
  const timer = window.setInterval(() => {
    if (!card.isConnected) return window.clearInterval(timer);
    draw();
  }, 30_000);
  return card;
}
