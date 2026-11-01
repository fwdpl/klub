import { getChecklist, getInfo, isFor, newId, saveChecklist, type Member, type Trip } from '../data/trips';
import type { Audience, ChecklistDoc, EmergencyContact, Flight, Hotel, InfoDoc } from '../model/types';
import { zoneLabel } from '../timezones';
import { h, present, toast } from '../ui';

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
    f.notes && h('p', { class: 'multiline muted' }, f.notes),
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
    hotel.notes && h('p', { class: 'multiline muted' }, hotel.notes),
    audienceNote(hotel.audience, members),
    h(
      'div',
      { class: 'actions actions--2' },
      hotel.address && h('a', { class: 'chip-btn', href: mapsLink(hotel.address), target: '_blank', rel: 'noopener' }, 'Nawiguj'),
      hotel.phone && h('a', { class: 'chip-btn', href: telLink(hotel.phone) }, 'Zadzwoń'),
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

/** Moja checklista: punkty wspólne od organizatora + własne (decyzja F). */
function checklistCard(tripId: string, uid: string, template: InfoDoc['checklistTemplate'], initial: ChecklistDoc): HTMLElement {
  let state: ChecklistDoc = initial;
  const card = h('div', { class: 'card' });

  const persist = async (next: ChecklistDoc) => {
    const previous = state;
    state = next;
    draw();
    try {
      await saveChecklist(tripId, uid, state);
    } catch {
      state = previous;
      draw();
      toast(navigator.onLine ? 'Nie udało się zapisać zmiany.' : 'Brak internetu – zmiana nie została zapisana.');
    }
  };

  const checkbox = (checked: boolean, label: string, onChange: (v: boolean) => void, onDelete?: () => void) => {
    const box = h('input', { type: 'checkbox' });
    box.checked = checked;
    box.addEventListener('change', () => onChange(box.checked));
    return h(
      'div',
      { class: `check${checked ? ' check--done' : ''}` },
      h('label', {}, box, h('span', {}, label)),
      onDelete && h('button', { type: 'button', class: 'check__delete', 'aria-label': `Usuń: ${label}`, onclick: onDelete }, '×'),
    );
  };

  const draw = () => {
    const doneCount = template.filter((t) => state.templateDone[t.id]).length + state.items.filter((i) => i.done).length;
    const total = template.length + state.items.length;
    const input = h('input', { type: 'text', maxlength: '80', placeholder: 'Dopisz swój punkt', 'aria-label': 'Nowy punkt' });
    const add = h('button', { type: 'submit', class: 'btn btn--secondary' }, 'Dodaj');

    card.replaceChildren(
      ...present(
        h('h2', {}, `Moja checklista${total ? ` (${doneCount}/${total})` : ''}`),
        ...template.map((t) =>
          checkbox(!!state.templateDone[t.id], t.text, (v) => persist({ ...state, templateDone: { ...state.templateDone, [t.id]: v } })),
        ),
        template.length > 0 && state.items.length > 0 && h('div', { class: 'check-divider' }, 'Moje punkty'),
        ...state.items.map((item) =>
          checkbox(
            item.done,
            item.text,
            (v) => persist({ ...state, items: state.items.map((i) => (i.id === item.id ? { ...i, done: v } : i)) }),
            () => persist({ ...state, items: state.items.filter((i) => i.id !== item.id) }),
          ),
        ),
        h(
          'form',
          {
            class: 'check-add',
            onsubmit: (e: Event) => {
              e.preventDefault();
              const text = input.value.trim();
              if (!text) return;
              void persist({ ...state, items: [...state.items, { id: newId(), text, done: false }] });
            },
          },
          input,
          add,
        ),
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
export async function detailsSection(trip: Trip, me: Me, members: Member[], showChecklist: boolean): Promise<HTMLElement> {
  const info = await getInfo(trip.id);
  const mine = <T extends { audience: Audience }>(list: T[]) => (me.isOrganizer ? list : list.filter((x) => isFor(x.audience, me.uid)));
  const flights = mine(info.flights).sort((a, b) => a.departure.localeCompare(b.departure));
  const hotels = mine(info.hotels).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const checklist = showChecklist ? await getChecklist(trip.id, me.uid).catch(() => ({ templateDone: {}, items: [] })) : null;

  const section = (title: string, rows: HTMLElement[], empty: string) =>
    h('div', { class: 'card' }, h('h2', {}, title), ...(rows.length ? rows : [h('p', { class: 'muted' }, empty)]));

  return h(
    'div',
    {},
    me.isOrganizer && h('a', { class: 'btn btn--link btn--secondary', href: `#/wyjazd/${trip.id}/szczegoly` }, 'Edytuj szczegóły i checklistę'),
    section('Loty', flights.map((f) => flightRow(f, members)), 'Brak lotów.'),
    section('Noclegi', hotels.map((x) => hotelRow(x, members)), 'Brak noclegów.'),
    section('Kontakty awaryjne', info.emergencyContacts.map(contactRow), 'Brak kontaktów.'),
    info.insurance && h('div', { class: 'card' }, h('h2', {}, 'Ubezpieczenie'), h('p', { class: 'multiline' }, info.insurance)),
    checklist && checklistCard(trip.id, me.uid, info.checklistTemplate, checklist),
  );
}
