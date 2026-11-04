import { getInfo, getTrip, listMembers, newId, saveInfo, type Member } from '../data/trips';
import type { Audience, ChecklistTemplateItem, EmergencyContact, Flight, Hotel, InfoDoc } from '../model/types';
import { fold } from './fold';
import { dragHandle, makeSortable, moveItem } from './sortable';
import { formatLocal } from './tripDetails';
import { h, render, toast } from '../ui';
import { proposeNotice } from './notify';
import { zonePicker } from './zonePicker';

// Domyślna strefa wylotu: grupa wylatuje zwykle z Polski. Widoczna w formularzu i do zmiany.
const HOME_ZONE = 'Europe/Warsaw';

interface RowEditor<T> {
  el: HTMLElement;
  read: () => T;
}

function text(label: string, value: string, attrs: Record<string, string> = {}): [HTMLElement, () => string] {
  const input = h('input', { type: 'text', value, ...attrs });
  return [h('label', { class: 'field' }, h('span', {}, label), input), () => input.value.trim()];
}

function area(label: string, value: string): [HTMLElement, () => string] {
  const t = h('textarea', { rows: '3' });
  t.value = value;
  return [h('label', { class: 'field' }, h('span', {}, label), t), () => t.value.trim()];
}

/** Czas lokalny miejsca w formacie 'YYYY-MM-DDTHH:mm' – pole datetime-local zwraca dokładnie taki zapis. */
function localTime(label: string, value: string): [HTMLElement, () => string] {
  const input = h('input', { type: 'datetime-local', value });
  return [h('label', { class: 'field' }, h('span', {}, label), input), () => input.value];
}

function zoneField(label: string, value: string): [HTMLElement, () => string] {
  const picker = zonePicker(value);
  return [h('div', { class: 'field' }, h('span', {}, label), picker.el), picker.value];
}

/** „Dla kogo”: wszyscy zatwierdzeni albo zaznaczone osoby (decyzja G). */
export function audienceField(value: Audience, approved: Member[]): [HTMLElement, () => Audience] {
  const all = h('input', { type: 'checkbox' });
  all.checked = value === 'all';
  const boxes = approved.map((m) => {
    const box = h('input', { type: 'checkbox', value: m.uid });
    box.checked = value !== 'all' && value.includes(m.uid);
    return { box, el: h('label', { class: 'audience__person' }, box, h('span', {}, m.displayName)) };
  });
  const people = h('div', { class: 'audience__people' }, ...boxes.map((b) => b.el));
  const sync = () => (people.hidden = all.checked);
  all.addEventListener('change', sync);
  sync();
  return [
    h(
      'div',
      { class: 'field audience' },
      h('span', {}, 'Dla kogo'),
      h('label', { class: 'audience__person' }, all, h('span', {}, 'Wszyscy uczestnicy')),
      people,
    ),
    () => (all.checked ? 'all' : boxes.filter((b) => b.box.checked).map((b) => b.box.value)),
  ];
}

function flightEditor(f: Partial<Flight>, approved: Member[], tripZone: string): RowEditor<Flight> {
  const [numberEl, number] = text('Numer lotu', f.number ?? '', { placeholder: 'np. FI 531' });
  const [airlineEl, airline] = text('Linia', f.airline ?? '');
  const [fromEl, from] = text('Skąd', f.from ?? '', { placeholder: 'np. Warszawa WAW' });
  const [depEl, departure] = localTime('Wylot – czas lokalny lotniska wylotu', f.departure ?? '');
  const [depTzEl, departureTz] = zoneField('Strefa lotniska wylotu', f.departureTz ?? HOME_ZONE);
  const [toEl, to] = text('Dokąd', f.to ?? '', { placeholder: 'np. Keflavík KEF' });
  const [arrEl, arrival] = localTime('Przylot – czas lokalny lotniska przylotu', f.arrival ?? '');
  const [arrTzEl, arrivalTz] = zoneField('Strefa lotniska przylotu', f.arrivalTz ?? tripZone);
  const [notesEl, notes] = area('Uwagi (np. bagaż)', f.notes ?? '');
  const [audEl, audience] = audienceField(f.audience ?? 'all', approved);
  return {
    el: h('div', {}, numberEl, airlineEl, fromEl, depEl, depTzEl, toEl, arrEl, arrTzEl, notesEl, audEl),
    read: () => ({
      id: f.id ?? newId(),
      number: number(),
      airline: airline(),
      from: from(),
      to: to(),
      departure: departure(),
      departureTz: departureTz(),
      arrival: arrival(),
      arrivalTz: arrivalTz(),
      notes: notes(),
      audience: audience(),
    }),
  };
}

function hotelEditor(x: Partial<Hotel>, approved: Member[]): RowEditor<Hotel> {
  const [nameEl, name] = text('Nazwa', x.name ?? '');
  const [addressEl, address] = text('Adres', x.address ?? '');
  const [localNameEl, localName] = text('Nazwa w lokalnym języku – dla kierowcy (opcjonalnie)', x.localName ?? '');
  const [localAddressEl, localAddress] = area('Adres w lokalnym języku – dla kierowcy (opcjonalnie)', x.localAddress ?? '');
  const driverHint = h(
    'p',
    { class: 'muted' },
    'Do karty „Pokaż kierowcy” – aplikacja sama nie tłumaczy. Skopiuj nazwę i adres w lokalnym piśmie z maila z rezerwacją, ze strony hotelu albo z Google Maps po przełączeniu języka na lokalny. Bez tego kierowca zobaczy adres łaciński i przycisk mapy.',
  );
  const [inEl, checkIn] = localTime('Zameldowanie (czas lokalny)', x.checkIn ?? '');
  const [outEl, checkOut] = localTime('Wymeldowanie (czas lokalny)', x.checkOut ?? '');
  const [phoneEl, phone] = text('Telefon', x.phone ?? '', { type: 'tel' });
  const [notesEl, notes] = area('Uwagi', x.notes ?? '');
  const [audEl, audience] = audienceField(x.audience ?? 'all', approved);
  return {
    el: h('div', {}, nameEl, addressEl, localNameEl, localAddressEl, driverHint, inEl, outEl, phoneEl, notesEl, audEl),
    read: () => ({
      id: x.id ?? newId(),
      name: name(),
      address: address(),
      ...(localName() ? { localName: localName() } : {}),
      ...(localAddress() ? { localAddress: localAddress() } : {}),
      checkIn: checkIn(),
      checkOut: checkOut(),
      phone: phone(),
      notes: notes(),
      audience: audience(),
    }),
  };
}

function contactEditor(c: Partial<EmergencyContact>): RowEditor<EmergencyContact> {
  const [nameEl, name] = text('Nazwa lub imię', c.name ?? '');
  const [roleEl, role] = text('Rola', c.role ?? '', { placeholder: 'np. kierowca, ambasada' });
  const [phoneEl, phone] = text('Telefon', c.phone ?? '', { type: 'tel' });
  return { el: h('div', {}, nameEl, roleEl, phoneEl), read: () => ({ id: c.id ?? newId(), name: name(), role: role(), phone: phone() }) };
}

function templateEditor(t: Partial<ChecklistTemplateItem>): RowEditor<ChecklistTemplateItem> {
  const input = h('input', { type: 'text', value: t.text ?? '', maxlength: '80', 'aria-label': 'Punkt checklisty' });
  return { el: input, read: () => ({ id: t.id ?? newId(), text: input.value.trim() }) };
}

/** Lista pozycji z przyciskami „Usuń” i „+ Dodaj …”. */
interface ListOptions<T> {
  /** Klucz zapamiętania zwinięcia sekcji. */
  id: string;
  compact?: boolean;
  sortable?: boolean;
  /** Jednoliniowy opis pozycji – wtedy każda pozycja zwija się do tej linii (uwaga Jacka z 4.11.2026). */
  rowTitle?: (value: T) => string;
}

function listEditor<T>(title: string, addLabel: string, initial: T[], make: (value: Partial<T>) => RowEditor<T>, opts: ListOptions<T>) {
  const { compact = false, sortable = false, rowTitle } = opts;
  const rows: { editor: RowEditor<T>; fold?: HTMLDetailsElement }[] = [];
  const container = h('div');
  const countMeta = () => (rows.length ? String(rows.length) : 'brak');

  const addRow = (value: Partial<T>, open: boolean) => {
    const editor = make(value);
    const row: (typeof rows)[number] = { editor };
    const remove = h('button', { type: 'button', class: compact ? 'row-remove' : 'btn btn--secondary', 'aria-label': 'Usuń' }, compact ? '×' : 'Usuń');
    let wrap: HTMLElement;
    if (rowTitle) {
      // pozycja zwinięta do jednej linii; opis odświeża się przy każdej zmianie pól
      const label = h('span', { class: 'row-fold__title' });
      const refresh = () => (label.textContent = rowTitle(editor.read()) || 'Nowa pozycja');
      const details = h('details', { class: 'row-fold', open }, h('summary', { class: 'row-fold__head' }, label, h('span', { class: 'fold__chevron', 'aria-hidden': 'true' })), editor.el, remove);
      details.addEventListener('input', refresh);
      details.addEventListener('change', refresh);
      refresh();
      row.fold = details;
      wrap = details;
    } else {
      wrap = h('div', { class: `${compact ? 'row-compact' : 'row-block'}${sortable ? ' row-compact--sortable' : ''}` }, editor.el, remove);
      if (sortable) wrap.append(dragHandle('punkt'));
    }
    remove.addEventListener('click', () => {
      rows.splice(rows.indexOf(row), 1);
      wrap.remove();
      meta.textContent = countMeta();
    });
    rows.push(row);
    container.append(wrap);
  };
  initial.forEach((v) => addRow(v, false));
  // Sortable przestawia wiersze na ekranie; tu ta sama zmiana w kolejności zapisu
  if (sortable) makeSortable(container, (from, to) => rows.splice(0, rows.length, ...moveItem(rows, from, to)));

  const card = fold(
    { id: opts.id, title, meta: countMeta(), open: false },
    sortable && initial.length > 1 && h('p', { class: 'muted' }, 'Kolejność zmienisz, przesuwając punkt za uchwyt ⠿.'),
    container,
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn--secondary',
        onclick: () => {
          addRow({}, true);
          meta.textContent = countMeta();
        },
      },
      addLabel,
    ),
  );
  const meta = card.querySelector('.fold__meta') as HTMLElement;
  return {
    card,
    read: () => rows.map((r) => r.editor.read()),
    /** Rozwija sekcję i pozycję – np. gdy w niej jest błąd. */
    reveal: (index: number) => {
      card.open = true;
      const target = rows[index]?.fold;
      if (target) {
        target.open = true;
        target.scrollIntoView({ block: 'center' });
      }
    },
  };
}

const short = (local: string) => (local ? formatLocal(local) : '');

function flightTitle(f: Flight): string {
  const route = [f.from, f.to].filter(Boolean).join(' → ');
  return [f.number, route, short(f.departure)].filter(Boolean).join(' · ');
}

function hotelTitle(x: Hotel): string {
  const dates = [short(x.checkIn.slice(0, 10)), short(x.checkOut.slice(0, 10))].filter(Boolean).join(' – ');
  return [x.name, dates].filter(Boolean).join(' · ');
}

function contactTitle(c: EmergencyContact): string {
  return [c.name, c.role, c.phone].filter(Boolean).join(' · ');
}

/** Organizator: loty, noclegi, kontakty, ubezpieczenie i wspólna część checklisty (warstwa 3). */
export async function showTripDetailsEdit(tripId: string): Promise<void> {
  const [trip, info, members] = await Promise.all([getTrip(tripId), getInfo(tripId).catch(() => null), listMembers(tripId).catch(() => [])]);
  const back = h('a', { class: 'back', href: `#/wyjazd/${tripId}` }, '← Wyjazd');
  if (!trip || !info) {
    render(back, h('p', {}, 'Nie udało się wczytać wyjazdu.'));
    return;
  }
  const approved = members.filter((m) => m.status === 'approved');

  const flights = listEditor('Loty', '+ Dodaj lot', info.flights, (f) => flightEditor(f, approved, trip.timezone), { id: `${tripId}:edit:flights`, rowTitle: flightTitle });
  const hotels = listEditor('Noclegi', '+ Dodaj nocleg', info.hotels, (x) => hotelEditor(x, approved), { id: `${tripId}:edit:hotels`, rowTitle: hotelTitle });
  const contacts = listEditor('Kontakty awaryjne', '+ Dodaj kontakt', info.emergencyContacts, contactEditor, { id: `${tripId}:edit:contacts`, rowTitle: contactTitle });
  const [insuranceEl, insurance] = area('Ubezpieczyciel, numer polisy, numer alarmowy', info.insurance);
  const template = listEditor('Wspólna checklista', '+ Dodaj punkt', info.checklistTemplate, templateEditor, { id: `${tripId}:edit:checklist`, compact: true, sortable: true });

  const error = h('p', { class: 'error', role: 'alert' });
  const save = h('button', { type: 'submit', class: 'btn' }, 'Zapisz szczegóły');

  render(
    back,
    h('h1', {}, 'Szczegóły wyjazdu'),
    h('p', { class: 'muted' }, `${trip.title}. Widzą tylko zatwierdzeni uczestnicy. Wszystkie godziny w czasie lokalnym miejsca.`),
    h(
      'form',
      {
        onsubmit: async (e: Event) => {
          e.preventDefault();
          error.textContent = '';
          const next: InfoDoc = {
            flights: flights.read(),
            hotels: hotels.read().filter((x) => x.name),
            emergencyContacts: contacts.read().filter((c) => c.name || c.phone),
            insurance: insurance(),
            checklistTemplate: template.read().filter((t) => t.text),
          };
          const badFlight = next.flights.find((f) => !f.departure || !f.arrival || !f.departureTz || !f.arrivalTz);
          if (badFlight) {
            flights.reveal(next.flights.indexOf(badFlight));
            error.textContent = `Lot ${badFlight.number || 'bez numeru'}: uzupełnij godziny wylotu i przylotu oraz strefy lotnisk.`;
            return;
          }
          const noAudience = [...next.flights, ...next.hotels].find((x) => Array.isArray(x.audience) && x.audience.length === 0);
          if (noAudience) {
            const fi = next.flights.indexOf(noAudience as Flight);
            if (fi >= 0) flights.reveal(fi);
            else hotels.reveal(hotels.read().findIndex((x) => x.id === noAudience.id));
            error.textContent = 'Każdy lot i nocleg musi być dla kogoś – zaznacz „Wszyscy uczestnicy” albo wybrane osoby.';
            return;
          }
          save.disabled = true;
          try {
            await saveInfo(tripId, next);
            proposeNotice(tripId, { audience: 'approved', title: 'Zmiana szczegółów wyjazdu', body: `${trip.title}: loty, noclegi albo kontakty` });
            toast('Zapisano szczegóły');
            location.hash = `#/wyjazd/${tripId}`;
          } catch {
            error.textContent = navigator.onLine ? 'Nie udało się zapisać.' : 'Brak połączenia z internetem.';
            save.disabled = false;
          }
        },
      },
      flights.card,
      hotels.card,
      contacts.card,
      fold({ id: `${tripId}:edit:insurance`, title: 'Ubezpieczenie', meta: info.insurance ? '' : 'brak', open: false }, insuranceEl),
      template.card,
      h('p', { class: 'muted' }, 'Wspólna checklista pojawi się u każdego uczestnika na górze jego listy; każdy może dopisać własne punkty.'),
      error,
      save,
    ),
  );
}
