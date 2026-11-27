import { groupTasks } from '../checklist/importChecklist';
import { PARTNER_LINK_LABEL } from '../config';
import { getChecklist, listMyTasks, saveOwnItems, setDone } from '../data/checklist';
import { getInfo, isFor, newId, type Member, type Trip } from '../data/trips';
import type { Audience, ChecklistDoc, ChecklistItem, EmergencyContact, Flight, Hotel, TaskDoc } from '../model/types';
import { richText } from '../plan/richText';
import { zoneLabel } from '../timezones';
import { h, present, toast } from '../ui';
import { hasDriverCard, showDriverCard } from './driver';
import { fold } from './fold';
import type Sortable from 'sortablejs';
import { dragHandle, makeSortable, moveItem } from './sortable';

interface Me {
  uid: string;
  isOrganizer: boolean;
}

/** Czas lokalny miejsca ('YYYY-MM-DDTHH:mm') bez przeliczania na strefę telefonu: „śr 10 mar, 06:10”. */
export function formatLocal(local: string): string {
  const [date, time = ''] = local.split('T');
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return local;
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pl-PL', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  return time ? `${day}, ${time}` : day;
}

function audienceNote(audience: Audience, members: Member[]): HTMLElement | null {
  if (audience === 'all') return null;
  const names = members.filter((m) => audience.includes(m.uid)).map((m) => m.displayName);
  return h('div', { class: 'muted' }, `Dla: ${names.join(', ') || '—'}`);
}

function mapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function flightRow(f: Flight, members: Member[]): HTMLElement {
  return h(
    'div',
    { class: 'detail' },
    h('div', { class: 'detail__title' }, [f.number, f.airline].filter(Boolean).join(' · ') || 'Lot'),
    h('div', {}, `${f.from} → ${f.to}`),
    h('div', {}, h('b', {}, 'Wylot: '), `${formatLocal(f.departure)} `, h('span', { class: 'muted' }, `(czas: ${zoneLabel(f.departureTz)})`)),
    h('div', {}, h('b', {}, 'Przylot: '), `${formatLocal(f.arrival)} `, h('span', { class: 'muted' }, `(czas: ${zoneLabel(f.arrivalTz)})`)),
    f.notes && h('p', { class: 'multiline muted' }, richText(f.notes)),
    audienceNote(f.audience, members),
  );
}

function hotelRow(hotel: Hotel, members: Member[]): HTMLElement {
  return h(
    'div',
    { class: 'detail' },
    h('div', { class: 'detail__title' }, hotel.name),
    hotel.address && h('div', {}, hotel.address),
    hotel.checkIn && h('div', {}, h('b', {}, 'Zameldowanie: '), formatLocal(hotel.checkIn)),
    hotel.checkOut && h('div', {}, h('b', {}, 'Wymeldowanie: '), formatLocal(hotel.checkOut)),
    hotel.notes && h('p', { class: 'multiline muted' }, richText(hotel.notes)),
    audienceNote(hotel.audience, members),
    // przyciski w jednym rzędzie (uwaga Jacka z 4.11.2026)
    h(
      'div',
      { class: 'actions actions--row' },
      hotel.address && h('a', { class: 'chip-btn', href: mapsLink(hotel.address), target: '_blank', rel: 'noopener' }, 'Nawiguj'),
      hotel.phone && h('a', { class: 'chip-btn', href: telLink(hotel.phone) }, 'Zadzwoń'),
      hasDriverCard(hotel) && h('button', { type: 'button', class: 'chip-btn', onclick: () => showDriverCard(hotel) }, '🚕 Pokaż kierowcy'),
    ),
  );
}

function contactRow(c: EmergencyContact): HTMLElement {
  return h(
    'div',
    { class: 'detail detail--inline' },
    h('div', {}, h('div', { class: 'detail__title' }, c.name), c.role && h('div', { class: 'muted' }, c.role)),
    c.phone && h('a', { class: 'chip-btn', href: telLink(c.phone) }, c.phone),
  );
}

/** Dzisiejsza data telefonu – terminy zadań są datami lokalnymi bez strefy (przed wyjazdem: w domu). */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Linki partnerskie: otwierane poza aplikacją, bez zmiany adresu (zadanie checklist §6). */
function taskLinks(task: TaskDoc): HTMLElement | null {
  if (!task.links?.length) return null;
  return h(
    'div',
    { class: 'task__links' },
    ...task.links.map((l) =>
      h(
        'span',
        { class: 'task__link' },
        h('a', { class: 'chip-btn', href: l.url, target: '_blank', rel: l.sponsored ? 'noopener noreferrer sponsored' : 'noopener noreferrer' }, l.label),
        l.sponsored && h('small', { class: 'task__partner' }, PARTNER_LINK_LABEL),
      ),
    ),
  );
}

export interface ChecklistOptions {
  /** Podgląd organizatora: tylko do oglądania, bez własnych punktów osoby (są prywatne). */
  readOnly?: boolean;
}

/**
 * „Do zrobienia przed wyjazdem”: zadania od organizatora (import/edytor) pogrupowane po kategorii
 * + własne punkty osoby. Tekst zadań wyłącznie jako tekst (bez HTML). Odhaczenie działa bez sieci.
 */
export function checklistCard(tripId: string, uid: string, tasks: TaskDoc[], initial: ChecklistDoc, opts: ChecklistOptions = {}): HTMLElement {
  let state: ChecklistDoc = initial;
  const body = h('div');
  const card = fold({ id: `${tripId}:checklist`, title: 'Do zrobienia przed wyjazdem', open: true }, body);
  const meta = card.querySelector('.fold__meta') as HTMLElement;
  const today = localToday();

  const failed = () => toast(navigator.onLine ? 'Nie udało się zapisać zmiany.' : 'Brak internetu – zmiana nie została zapisana.');

  const toggle = (taskId: string, value: boolean) => {
    const previous = state;
    const done = { ...state.done };
    if (value) done[taskId] = new Date();
    else delete done[taskId];
    state = { ...state, done };
    draw();
    // bez sieci zapis czeka w kolejce Firestore i wyśle się po połączeniu
    setDone(tripId, uid, taskId, value).catch(() => {
      state = previous;
      draw();
      failed();
    });
  };

  const persistItems = (items: ChecklistItem[]) => {
    const previous = state;
    state = { ...state, items };
    draw();
    saveOwnItems(tripId, uid, items).catch(() => {
      state = previous;
      draw();
      failed();
    });
  };

  const taskRow = (t: TaskDoc) => {
    const isDone = t.id in state.done;
    const box = h('input', { type: 'checkbox', disabled: opts.readOnly });
    box.checked = isDone;
    box.addEventListener('change', () => toggle(t.id, box.checked));
    const late = !isDone && !!t.due && t.due < today;
    const when = state.done[t.id];
    return h(
      'div',
      { class: `task${isDone ? ' task--done' : ''}` },
      h('label', { class: 'check task__check' }, box, h('span', {}, t.text)),
      (t.due || (isDone && when)) &&
        h(
          'div',
          { class: 'task__meta' },
          t.due && h('span', {}, `termin: ${formatLocal(t.due)}`),
          late && h('span', { class: 'badge badge--late' }, 'po terminie'),
          isDone && when && h('span', {}, `✓ ${when.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}`),
        ),
      t.details && h('p', { class: 'multiline muted task__details' }, t.details),
      taskLinks(t),
    );
  };

  const ownRow = (item: ChecklistItem, movable: boolean) => {
    const box = h('input', { type: 'checkbox' });
    box.checked = item.done;
    box.addEventListener('change', () => persistItems(state.items.map((i) => (i.id === item.id ? { ...i, done: box.checked } : i))));
    return h(
      'div',
      { class: `check${item.done ? ' check--done' : ''}` },
      h('label', {}, box, h('span', {}, item.text)),
      h('button', { type: 'button', class: 'check__delete', 'aria-label': `Usuń: ${item.text}`, onclick: () => persistItems(state.items.filter((i) => i.id !== item.id)) }, '×'),
      movable && dragHandle(item.text),
    );
  };

  // Własne punkty można przestawiać za uchwyt ⠿; kolejność zadań ustala organizator
  let sorter: Sortable | null = null;

  const draw = () => {
    const own = opts.readOnly ? [] : state.items;
    const doneCount = tasks.filter((t) => t.id in state.done).length + own.filter((i) => i.done).length;
    const total = tasks.length + own.length;
    meta.textContent = total ? `${doneCount}/${total}` : '';

    const groups = groupTasks(tasks).map((g) => h('div', { class: 'task-group' }, g.category && h('h3', { class: 'task-group__title' }, g.category), ...g.tasks.map(taskRow)));

    sorter?.destroy();
    sorter = null;
    let ownPart: (HTMLElement | false)[] = [];
    if (!opts.readOnly) {
      const movable = own.length > 1;
      const ownList = h('div', { class: 'check-own' }, ...own.map((i) => ownRow(i, movable)));
      sorter = movable ? makeSortable(ownList, (from, to) => persistItems(moveItem(state.items, from, to))) : null;
      const input = h('input', { type: 'text', maxlength: '80', placeholder: 'Dopisz swój punkt', 'aria-label': 'Nowy punkt' });
      ownPart = [
        h('div', { class: 'check-divider' }, 'Moje punkty'),
        ownList,
        h(
          'form',
          {
            class: 'check-add',
            onsubmit: (e: Event) => {
              e.preventDefault();
              const text = input.value.trim();
              if (text) persistItems([...state.items, { id: newId(), text, done: false }]);
            },
          },
          input,
          h('button', { type: 'submit', class: 'btn btn--secondary' }, 'Dodaj'),
        ),
      ];
    }
    body.replaceChildren(
      ...present(
        !tasks.length && h('p', { class: 'muted' }, opts.readOnly ? 'Ta osoba nie ma zadań na checkliście.' : 'Organizator nie dodał jeszcze zadań.'),
        ...groups,
        ...ownPart,
        opts.readOnly && h('p', { class: 'muted' }, 'Własne punkty tej osoby są prywatne – w podglądzie ich nie pokazujemy.'),
      ),
    );
  };

  draw();
  return card;
}

/**
 * Szczegóły wyjazdu (warstwa 3) dla zatwierdzonych i organizatora.
 * Uczestnik widzi pozycje wspólne i te dla siebie; organizator wszystkie z opisem „dla kogo”.
 */
export interface DetailsSections {
  flights: HTMLElement;
  hotels: HTMLElement;
  contacts: HTMLElement;
  insurance: HTMLElement | null;
  checklist: HTMLElement | null;
}

/** Sekcje szczegółów osobno – ekran wyjazdu pokazuje każdą pod własną ikoną. */
export async function detailsSection(trip: Trip, me: Me, members: Member[], checklist: 'own' | 'preview' | null): Promise<DetailsSections> {
  const info = await getInfo(trip.id);
  const mine = <T extends { audience: Audience }>(list: T[]) => (me.isOrganizer ? list : list.filter((x) => isFor(x.audience, me.uid)));
  const flights = mine(info.flights).sort((a, b) => a.departure.localeCompare(b.departure));
  const hotels = mine(info.hotels).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const list = checklist
    ? await Promise.all([listMyTasks(trip.id, me.uid).catch(() => [] as TaskDoc[]), getChecklist(trip.id, me.uid).catch((): ChecklistDoc => ({ done: {}, items: [] }))])
    : null;

  const section = (key: string, title: string, rows: HTMLElement[], empty: string) =>
    fold({ id: `${trip.id}:${key}`, title, meta: rows.length ? String(rows.length) : 'brak', open: false }, ...(rows.length ? rows : [h('p', { class: 'muted' }, empty)]));

  return {
    flights: section('flights', 'Loty', flights.map((f) => flightRow(f, members)), 'Brak lotów.'),
    hotels: section('hotels', 'Noclegi', hotels.map((x) => hotelRow(x, members)), 'Brak noclegów.'),
    contacts: section('contacts', 'Kontakty awaryjne', info.emergencyContacts.map(contactRow), 'Brak kontaktów.'),
    insurance: info.insurance ? fold({ id: `${trip.id}:insurance`, title: 'Ubezpieczenie', open: false }, h('p', { class: 'multiline' }, richText(info.insurance))) : null,
    checklist: list ? checklistCard(trip.id, me.uid, list[0], list[1], { readOnly: checklist === 'preview' }) : null,
  };
}
