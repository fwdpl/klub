import { isFor, type Member, type Trip } from '../data/trips';
import type { DayDoc, PlanItem, PlanItemType } from '../model/types';
import { findCollisions, itemInterval, overlaps, sortItems } from '../plan/collisions';
import { richText } from '../plan/richText';
import { zoneLabel } from '../timezones';
import { h, present } from '../ui';
import { formatLocal } from './tripDetails';

interface Me {
  uid: string;
  isOrganizer: boolean;
}

type Mode = 'mine' | 'all';

const TYPE_ICON: Record<PlanItemType, string> = {
  activity: '📍',
  meal: '🍽️',
  transport: '🚌',
  flight: '✈️',
  checkin: '🏨',
  meeting: '👥',
  free: '☕',
};

// Wybór widoku i etykiety – zapamiętany na urządzeniu (wygoda, nie dane)
const MODE_KEY = 'klub.planMode';
function savedMode(): Mode | null {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'mine' || v === 'all' ? v : null;
  } catch {
    return null;
  }
}

function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function placeUrl(item: PlanItem, trip: Trip): string | null {
  const p = item.place;
  if (!p) return null;
  if (p.lat !== undefined && p.lng !== undefined) return mapsUrl(`${p.lat},${p.lng}`);
  return mapsUrl([p.name, p.address ?? trip.destination].filter(Boolean).join(', '));
}

function timeOf(local: string): string {
  return local.slice(11, 16);
}

/** „06:10–09:30”, z dopiskiem strefy, gdy inna niż dnia, i „(+1)”, gdy koniec wypada następnego dnia. */
function timeLabel(item: PlanItem, day: DayDoc): HTMLElement {
  const parts: (string | HTMLElement)[] = [timeOf(item.start)];
  if (item.tz) parts.push(h('span', { class: 'plan-item__zone' }, ` ${zoneLabel(item.tz)}`));
  if (item.end) {
    parts.push(`–${timeOf(item.end)}`);
    if (item.end.slice(0, 10) !== day.date) parts.push(h('span', { class: 'plan-item__zone' }, ' (+1)'));
    if (item.endTz) parts.push(h('span', { class: 'plan-item__zone' }, ` ${zoneLabel(item.endTz)}`));
  }
  return h('span', { class: 'plan-item__time' }, ...parts);
}

function namesOf(item: PlanItem, members: Member[]): string {
  if (item.audience === 'all') return 'wszyscy';
  return members
    .filter((m) => (item.audience as string[]).includes(m.uid))
    .map((m) => m.displayName)
    .join(', ');
}

/** Kolizja punktu prywatnego ze wspólnym – dla dowolnej z jego osób (widok „Wszyscy”). */
function collisionFor(item: PlanItem, day: DayDoc, dayZone: string, me: Me, mode: Mode): string | null {
  if (item.audience === 'all') return null;
  if (mode === 'mine') return findCollisions(day.items, me.uid, dayZone).get(item.id) ?? null;
  const own = itemInterval(item, dayZone);
  return day.items.find((s) => s.audience === 'all' && overlaps(own, itemInterval(s, dayZone)))?.title ?? null;
}

function itemCard(item: PlanItem, day: DayDoc, dayZone: string, trip: Trip, members: Member[], me: Me, mode: Mode): HTMLElement {
  const shared = item.audience === 'all';
  const collision = collisionFor(item, day, dayZone, me, mode);
  const placeLink = placeUrl(item, trip);
  const classes = ['plan-item', shared ? 'plan-item--shared' : 'plan-item--private', item.important ? 'plan-item--important' : ''];

  return h(
    'div',
    { class: classes.filter(Boolean).join(' ') },
    h('div', { class: 'plan-item__top' }, timeLabel(item, day), h('span', { class: 'plan-item__icon', 'aria-hidden': 'true' }, TYPE_ICON[item.type])),
    h('div', { class: 'plan-item__title' }, item.title),
    h(
      'div',
      { class: 'badges' },
      !shared && h('span', { class: 'badge' }, `dla: ${namesOf(item, members)}`),
      item.nearby && h('span', { class: 'badge' }, 'w pobliżu'),
      item.important && h('span', { class: 'badge badge--important' }, 'ważne'),
      ...(item.tags ?? []).map((t) => h('span', { class: 'badge' }, `#${t}`)),
    ),
    collision && h('p', { class: 'plan-item__warn' }, `⚠ Nachodzi na wspólny punkt: ${collision}`),
    item.notes && h('p', { class: 'multiline' }, richText(item.notes)),
    item.route && h('p', { class: 'plan-item__route multiline' }, '▸ ', richText(item.route)),
    item.options !== undefined &&
      item.options.length > 0 &&
      h(
        'ul',
        { class: 'plan-options' },
        ...item.options.map((o) =>
          h(
            'li',
            {},
            h('span', {}, o.name, o.rating !== undefined ? h('span', { class: 'muted' }, ` ★ ${o.rating.toLocaleString('pl-PL')}`) : null),
            h('a', { class: 'chip-btn', href: mapsUrl([o.name, o.address ?? trip.destination].filter(Boolean).join(', ')), target: '_blank', rel: 'noopener' }, 'Nawiguj'),
          ),
        ),
      ),
    item.meet && h('p', { class: 'plan-item__meet' }, `◈ Spotkanie: ${item.meet.place}${item.meet.time ? ` — ${timeOf(item.meet.time)}` : ''}`),
    (placeLink || me.isOrganizer) &&
      h(
        'div',
        { class: 'actions actions--2' },
        placeLink && h('a', { class: 'chip-btn', href: placeLink, target: '_blank', rel: 'noopener' }, `Nawiguj${item.place ? `: ${item.place.name}` : ''}`),
        me.isOrganizer && h('a', { class: 'chip-btn', href: `#/wyjazd/${trip.id}/punkt/${day.date}/${item.id}` }, 'Edytuj'),
      ),
  );
}

function dayHeader(day: DayDoc, trip: Trip): HTMLElement {
  return h(
    'div',
    { class: 'plan-day__head' },
    h('div', { class: 'plan-day__date' }, [formatLocal(day.date), day.baseLocation].filter(Boolean).join(' · ')),
    day.title && h('h3', { class: 'plan-day__title' }, day.title),
    day.timezone && day.timezone !== trip.timezone && h('div', { class: 'muted' }, `Godziny w czasie: ${zoneLabel(day.timezone)}`),
    day.note && h('p', { class: 'plan-day__note multiline' }, richText(day.note)),
  );
}

/** Plan dni: oś czasu z „Mój plan” / „Wszyscy” (decyzja J), filtrem etykiet i kolizjami. */
export function planSection(trip: Trip, me: Me, members: Member[], days: DayDoc[], planNotes: string[], amApproved: boolean): HTMLElement {
  const wrap = h('div', { class: 'card' });
  let mode: Mode = amApproved ? (savedMode() ?? 'mine') : 'all';
  let tag: string | null = null;
  const tags = [...new Set(days.flatMap((d) => d.items.flatMap((i) => i.tags ?? [])))].sort();

  const draw = () => {
    const visible = days
      .map((day) => {
        const zone = day.timezone ?? trip.timezone;
        let items = sortItems(day.items, zone);
        if (mode === 'mine') items = items.filter((i) => isFor(i.audience, me.uid));
        if (tag) items = items.filter((i) => i.tags?.includes(tag!));
        return { day, zone, items };
      })
      .filter((d) => d.items.length > 0 || (!tag && mode === 'all'));

    const button = (label: string, pressed: boolean, onclick: () => void) =>
      h('button', { type: 'button', 'aria-pressed': String(pressed), onclick }, label);

    wrap.replaceChildren(
      ...present(
        h('h2', {}, 'Plan'),
        me.isOrganizer &&
          h(
            'div',
            { class: 'button-row' },
            h('a', { class: 'btn btn--link', href: `#/wyjazd/${trip.id}/import` }, 'Importuj plan'),
            h('a', { class: 'btn btn--link btn--secondary', href: `#/wyjazd/${trip.id}/punkt/nowy` }, '+ Dodaj punkt'),
          ),
        amApproved &&
          h(
            'div',
            { class: 'segmented segmented--2', role: 'group', 'aria-label': 'Widok planu' },
            button('Mój plan', mode === 'mine', () => setMode('mine')),
            button('Wszyscy', mode === 'all', () => setMode('all')),
          ),
        tags.length > 0 &&
          h(
            'div',
            { class: 'tag-filter', role: 'group', 'aria-label': 'Etykiety' },
            button('Wszystko', tag === null, () => setTag(null)),
            ...tags.map((t) => button(`#${t}`, tag === t, () => setTag(t))),
          ),
        planNotes.length > 0 &&
          h('div', { class: 'plan-notes' }, h('b', {}, 'Uwagi do planu'), h('ul', {}, ...planNotes.map((n) => h('li', {}, richText(n))))),
        days.length === 0 && h('p', { class: 'muted' }, me.isOrganizer ? 'Plan jest pusty – zaimportuj plik albo dodaj punkt.' : 'Plan pojawi się tutaj, gdy organizator go doda.'),
        days.length > 0 && visible.length === 0 && h('p', { class: 'muted' }, 'Brak punktów dla wybranego widoku.'),
        ...visible.map(({ day, zone, items }) =>
          h('section', { class: 'plan-day' }, dayHeader(day, trip), ...items.map((i) => itemCard(i, day, zone, trip, members, me, mode))),
        ),
      ),
    );
  };

  const setMode = (m: Mode) => {
    mode = m;
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // bez pamięci urządzenia widok wraca do domyślnego
    }
    draw();
  };
  const setTag = (t: string | null) => {
    tag = t;
    draw();
  };

  draw();
  return wrap;
}
