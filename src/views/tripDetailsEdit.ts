import { getInfo, getTrip, listMembers, newId, saveInfo, type Member } from '../data/trips';
import type { Audience, ChecklistTemplateItem, EmergencyContact, Flight, Hotel, InfoDoc } from '../model/types';
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
  const [inEl, checkIn] = localTime('Zameldowanie (czas lokalny)', x.checkIn ?? '');
  const [outEl, checkOut] = localTime('Wymeldowanie (czas lokalny)', x.checkOut ?? '');
  const [phoneEl, phone] = text('Telefon', x.phone ?? '', { type: 'tel' });
  const [notesEl, notes] = area('Uwagi', x.notes ?? '');
  const [audEl, audience] = audienceField(x.audience ?? 'all', approved);
  return {
    el: h('div', {}, nameEl, addressEl, inEl, outEl, phoneEl, notesEl, audEl),
    read: () => ({
      id: x.id ?? newId(),
      name: name(),
      address: address(),
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
function listEditor<T>(title: string, addLabel: string, initial: T[], make: (value: Partial<T>) => RowEditor<T>, compact = false) {
  const rows: RowEditor<T>[] = [];
  const container = h('div');
  const addRow = (value: Partial<T>) => {
    const editor = make(value);
    const remove = h('button', { type: 'button', class: compact ? 'row-remove' : 'btn btn--secondary' }, compact ? '×' : 'Usuń');
    const wrap = h('div', { class: compact ? 'row-compact' : 'row-block' }, editor.el, remove);
    remove.addEventListener('click', () => {
      rows.splice(rows.indexOf(editor), 1);
      wrap.remove();
    });
    rows.push(editor);
    container.append(wrap);
  };
  initial.forEach(addRow);
  const card = h(
    'div',
    { class: 'card' },
    h('h2', {}, title),
    container,
    h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => addRow({}) }, addLabel),
  );
  return { card, read: () => rows.map((r) => r.read()) };
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

  const flights = listEditor('Loty', '+ Dodaj lot', info.flights, (f) => flightEditor(f, approved, trip.timezone));
  const hotels = listEditor('Noclegi', '+ Dodaj nocleg', info.hotels, (x) => hotelEditor(x, approved));
  const contacts = listEditor('Kontakty awaryjne', '+ Dodaj kontakt', info.emergencyContacts, contactEditor);
  const [insuranceEl, insurance] = area('Ubezpieczyciel, numer polisy, numer alarmowy', info.insurance);
  const template = listEditor('Wspólna checklista', '+ Dodaj punkt', info.checklistTemplate, templateEditor, true);

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
            error.textContent = `Lot ${badFlight.number || 'bez numeru'}: uzupełnij godziny wylotu i przylotu oraz strefy lotnisk.`;
            return;
          }
          const noAudience = [...next.flights, ...next.hotels].find((x) => Array.isArray(x.audience) && x.audience.length === 0);
          if (noAudience) {
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
      h('div', { class: 'card' }, h('h2', {}, 'Ubezpieczenie'), insuranceEl),
      template.card,
      h('p', { class: 'muted' }, 'Wspólna checklista pojawi się u każdego uczestnika na górze jego listy; każdy może dopisać własne punkty.'),
      error,
      save,
    ),
  );
}
