import { isFor, type Member, type Trip } from '../data/trips';
import type { DayDoc, PlanItem, PlanItemType } from '../model/types';
import { findCollisions, itemInterval, overlaps, sortItems } from '../plan/collisions';
import { richText } from '../plan/richText';
import { todayIn } from '../plan/time';
import { zoneLabel } from '../timezones';
import { plural } from '../text';
import { h, present } from '../ui';
import { calendarExport } from './calendar';
import { mapExport } from './mapExport';
import { planMap, type MapPoint } from './planMap';
import { attachDayChip, dayWeather } from './weatherView';
import { fold, remember } from './fold';
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

/** Jeden dzień planu – zwijany; nagłówek widać zawsze (data, miejsce, tytuł, liczba punktów). */
function dayFold(day: DayDoc, trip: Trip, zone: string, body: HTMLElement[], count: number, filtered: boolean, isOrganizer: boolean): HTMLDetailsElement {
  const isToday = todayIn(zone) === day.date;
  const dateLine = [formatLocal(day.date), day.baseLocation].filter(Boolean).join(' · ');
  const el = fold(
    {
      // przy filtrze etykiety dni są rozwinięte i nie nadpisują zapamiętanego stanu
      // dni zawsze startują zwinięte; rozwinięcie pamiętane tylko do zamknięcia aplikacji (uwaga Jacka z 4.11.2026)
      id: filtered ? undefined : `session:${trip.id}:day:${day.date}`,
      title: day.title || dateLine,
      head: [h('span', { class: 'plan-day__date' }, day.title ? dateLine : null, isToday ? h('span', { class: 'badge badge--accent plan-day__today' }, 'dziś') : null)],
      meta: plural(count, 'punkt', 'punkty', 'punktów'),
      open: filtered,
      className: `plan-day${isToday ? ' plan-day--today' : ''}`,
      level: 'h3',
    },
    day.timezone && day.timezone !== trip.timezone && h('div', { class: 'muted' }, `Godziny w czasie: ${zoneLabel(day.timezone)}`),
    day.note && h('p', { class: 'plan-day__note multiline' }, richText(day.note)),
    ...body,
  );
  // pogoda: znaczek w nagłówku (gdy jest prognoza), blok z prognozą i słońcem – przy pierwszym rozwinięciu
  attachDayChip(trip, day, zone, el.querySelector('.fold__text') as HTMLElement);
  const bodyEl = el.querySelector(':scope > .fold__body') as HTMLElement;
  const addWeather = () => {
    if (!el.open || bodyEl.querySelector('.weather')) return;
    bodyEl.prepend(dayWeather(trip, day, zone, isOrganizer));
  };
  el.addEventListener('toggle', addWeather);
  addWeather();
  return el;
}

// Układ tabletowy (zgoda Jacka z 5.11.2026): od 768 px „Wszyscy” w kolumnach osób, od 1000 px mapa obok planu
const COLUMNS_QUERY = '(min-width: 768px)';
const MAP_QUERY = '(min-width: 1000px)';
const media = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q) : null);

/** Dzień w kolumnach: wspólne punkty + po jednej kolumnie na osobę z jej punktami indywidualnymi. */
function personColumns(items: PlanItem[], members: Member[], card: (i: PlanItem) => HTMLElement): HTMLElement | null {
  const people = members.filter((m) => m.status === 'approved' && items.some((i) => i.audience !== 'all' && i.audience.includes(m.uid)));
  if (!people.length) return null;
  const column = (title: string, list: PlanItem[]) =>
    h('div', { class: 'plan-col' }, h('h4', { class: 'plan-col__title' }, title), ...(list.length ? list.map(card) : [h('p', { class: 'muted' }, '—')]));
  return h(
    'div',
    { class: 'plan-cols', style: `--cols:${people.length + 1}` },
    column('Wszyscy', items.filter((i) => i.audience === 'all')),
    ...people.map((m) => column(m.displayName, items.filter((i) => i.audience !== 'all' && i.audience.includes(m.uid)))),
  );
}

/**
 * Plan dni: oś czasu z „Mój plan” / „Wszyscy” (decyzja J), filtrem etykiet i kolizjami.
 * Dwa poziomy zwijania (uwaga Jacka z 1.11.2026): cała sekcja → lista dni → każdy dzień osobno.
 */
export function planSection(trip: Trip, me: Me, members: Member[], days: DayDoc[], planNotes: string[], amApproved: boolean): HTMLElement {
  let mode: Mode = amApproved ? (savedMode() ?? 'mine') : 'all';
  let tag: string | null = null;
  const tags = [...new Set(days.flatMap((d) => d.items.flatMap((i) => i.tags ?? [])))].sort();

  // Eksport do kalendarza: „Mój plan” dla uczestnika, cały plan dla organizatora spoza listy
  const calendar = calendarExport(trip, days, me.uid, amApproved);
  const map = mapExport(trip, days, me.uid, amApproved);
  const columnsMq = media(COLUMNS_QUERY);
  const mapMq = media(MAP_QUERY);
  const side = mapMq?.matches ? planMap() : null;
  const main = h('div', { class: 'plan-main' });
  const layout = h('div', { class: side ? 'plan-layout plan-layout--map' : 'plan-layout' }, main, side?.el ?? null);
  let shown: { day: DayDoc; zone: string; items: PlanItem[]; el: HTMLDetailsElement }[] = [];

  /** Mapa: punkty rozwiniętych dni (albo wszystkich, gdy żaden nie jest rozwinięty). */
  const updateMap = () => {
    if (!side) return;
    const open = shown.filter((d) => d.el.open);
    const source = open.length ? open : shown;
    const points: MapPoint[] = [];
    let missing = 0;
    for (const { day, items } of source) {
      items.forEach((i, n) => {
        const p = i.place;
        if (p?.lat !== undefined && p?.lng !== undefined) points.push({ lat: p.lat, lng: p.lng, n: n + 1, title: `${timeOf(i.start)} ${i.title}`, day: formatLocal(day.date) });
        else if (p) missing += 1;
      });
    }
    const what = open.length === 1 ? formatLocal(open[0].day.date) : open.length ? `${open.length} dni` : 'cały plan';
    side.show(points, `Na mapie: ${what} – ${plural(points.length, 'punkt', 'punkty', 'punktów')}${missing ? ` (bez położenia: ${missing})` : ''}. Rozwiń dzień, żeby zobaczyć tylko jego punkty.`);
  };
  // toggle nie „bąbelkuje” – łapiemy go w fazie przechwytywania
  main.addEventListener('toggle', (e) => (e.target as HTMLElement).matches?.('details.plan-day') && updateMap(), true);

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

    const dayEls = visible.map(({ day, zone, items }) => {
      const card = (i: PlanItem) => itemCard(i, day, zone, trip, members, me, mode);
      const cols = mode === 'all' && columnsMq?.matches ? personColumns(items, members, card) : null;
      return dayFold(day, trip, zone, cols ? [cols] : items.map(card), items.length, tag !== null, me.isOrganizer);
    });
    shown = visible.map((v, i) => ({ ...v, el: dayEls[i] }));
    const setAll = (open: boolean) => {
      for (const el of dayEls) el.open = open;
      if (tag === null) for (const { day } of visible) remember(`session:${trip.id}:day:${day.date}`, open);
    };

    main.replaceChildren(
      ...present(
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
        days.length > 0 && calendar,
        days.length > 0 && map,
        planNotes.length > 0 &&
          h('div', { class: 'plan-notes' }, h('b', {}, 'Uwagi do planu'), h('ul', {}, ...planNotes.map((n) => h('li', {}, richText(n))))),
        days.length === 0 && h('p', { class: 'muted' }, me.isOrganizer ? 'Plan jest pusty – zaimportuj plik albo dodaj punkt.' : 'Plan pojawi się tutaj, gdy organizator go doda.'),
        days.length > 0 && visible.length === 0 && h('p', { class: 'muted' }, 'Brak punktów dla wybranego widoku.'),
        dayEls.length > 1 &&
          h(
            'div',
            { class: 'actions actions--2 plan-fold-all' },
            h('button', { type: 'button', class: 'chip-btn', onclick: () => setAll(true) }, 'Rozwiń wszystkie dni'),
            h('button', { type: 'button', class: 'chip-btn', onclick: () => setAll(false) }, 'Zwiń wszystkie dni'),
          ),
        ...dayEls,
      ),
    );
    updateMap();
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
  // obrót tabletu: kolumny osób włączają się i wyłączają bez przeładowania
  columnsMq?.addEventListener?.('change', () => draw());
  return fold({ id: `${trip.id}:plan`, title: 'Plan', meta: days.length ? plural(days.length, 'dzień', 'dni', 'dni') : undefined, open: true }, layout);
}
