import { getTrip, listDays, listMembers, newId, saveDay } from '../data/trips';
import type { DayDoc, PlanItem, PlanItemType } from '../model/types';
import { ITEM_TYPES } from '../plan/importFile';
import { isValidDate, toInstant } from '../plan/time';
import { h, render, toast } from '../ui';
import { audienceField } from './tripDetailsEdit';

const TYPE_LABEL: Record<PlanItemType, string> = {
  activity: 'Zwiedzanie / aktywność',
  meal: 'Posiłek',
  transport: 'Przejazd',
  flight: 'Lot',
  checkin: 'Zameldowanie',
  meeting: 'Zbiórka / spotkanie',
  free: 'Czas wolny',
};

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Organizator: dodanie albo poprawka jednego punktu planu (decyzja H).
 * Pola, których formularz nie pokazuje (propozycje, współrzędne, strefy lotu, etykiety), zostają bez zmian.
 */
export async function showPlanItemEdit(tripId: string, date: string | null, itemId: string | null): Promise<void> {
  const [trip, members, days] = await Promise.all([getTrip(tripId), listMembers(tripId).catch(() => []), listDays(tripId).catch(() => [])]);
  const back = h('a', { class: 'back', href: `#/wyjazd/${tripId}` }, '← Wyjazd');
  const day = date ? days.find((d) => d.date === date) : undefined;
  const item = itemId ? day?.items.find((i) => i.id === itemId) : undefined;
  if (!trip || (itemId && !item)) {
    render(back, h('p', {}, 'Nie ma takiego punktu – może został zmieniony importem.'));
    return;
  }
  const approved = members.filter((m) => m.status === 'approved');

  const input = (type: string, value: string, attrs: Record<string, string> = {}) => h('input', { type, value, ...attrs });
  const area = (value: string) => {
    const t = h('textarea', { rows: '3' });
    t.value = value;
    return t;
  };
  const field = (label: string, el: HTMLElement, hint?: string) =>
    h('label', { class: 'field' }, h('span', {}, label), el, hint ? h('small', { class: 'muted' }, hint) : null);

  const dateEl = input('date', date ?? days.at(-1)?.date ?? '');
  const start = input('time', item ? item.start.slice(11, 16) : '');
  const end = input('time', item?.end ? item.end.slice(11, 16) : '');
  const nextDay = h('input', { type: 'checkbox' });
  nextDay.checked = !!item?.end && !!date && item.end.slice(0, 10) !== date;
  const type = h('select', {}, ...ITEM_TYPES.map((t) => h('option', { value: t, selected: t === (item?.type ?? 'activity') }, TYPE_LABEL[t])));
  const title = input('text', item?.title ?? '', { maxlength: '500' });
  const [audienceEl, audience] = audienceField(item?.audience ?? 'all', approved);
  const important = h('input', { type: 'checkbox' });
  important.checked = !!item?.important;
  const placeName = input('text', item?.place?.name ?? '');
  const placeAddress = input('text', item?.place?.address ?? '');
  const route = area(item?.route ?? '');
  const notes = area(item?.notes ?? '');
  const meetPlace = input('text', item?.meet?.place ?? '');
  const meetTime = input('time', item?.meet?.time ? item.meet.time.slice(11, 16) : '');
  const error = h('p', { class: 'error', role: 'alert' });
  const save = h('button', { type: 'submit', class: 'btn' }, item ? 'Zapisz punkt' : 'Dodaj punkt');

  const remove = item && h('button', { type: 'button', class: 'btn btn--secondary' }, 'Usuń punkt');
  remove?.addEventListener('click', async () => {
    if (!day || !confirm(`Usunąć „${item!.title}”?`)) return;
    remove.disabled = true;
    try {
      await saveDay(tripId, { ...day, items: day.items.filter((i) => i.id !== item!.id) });
      toast('Usunięto punkt');
      location.hash = `#/wyjazd/${tripId}`;
    } catch {
      error.textContent = 'Nie udało się usunąć.';
      remove.disabled = false;
    }
  });

  render(
    back,
    h('h1', {}, item ? 'Edycja punktu' : 'Nowy punkt planu'),
    h('p', { class: 'muted' }, `${trip.title}. Godziny w czasie lokalnym miejsca.`),
    h(
      'form',
      {
        onsubmit: async (e: Event) => {
          e.preventDefault();
          error.textContent = '';
          const targetDate = dateEl.value;
          if (!isValidDate(targetDate)) return void (error.textContent = 'Podaj datę.');
          if (!start.value) return void (error.textContent = 'Podaj godzinę rozpoczęcia.');
          if (!title.value.trim()) return void (error.textContent = 'Podaj tytuł.');
          const aud = audience();
          if (Array.isArray(aud) && aud.length === 0) return void (error.textContent = 'Zaznacz „Wszyscy uczestnicy” albo wybrane osoby.');

          const updated: PlanItem = {
            ...(item ?? { id: newId(), pinnedToDate: false }),
            type: type.value as PlanItemType,
            title: title.value.trim(),
            start: `${targetDate}T${start.value}`,
            audience: aud,
          } as PlanItem;
          if (end.value) updated.end = `${nextDay.checked ? addDays(targetDate, 1) : targetDate}T${end.value}`;
          else delete updated.end;
          const zone = (days.find((d) => d.date === targetDate)?.timezone ?? trip.timezone) as string;
          if (updated.end && toInstant(updated.end, updated.endTz ?? updated.tz ?? zone) <= toInstant(updated.start, updated.tz ?? zone)) {
            return void (error.textContent = 'Koniec musi być po początku (zaznacz „następnego dnia”, jeśli trzeba).');
          }
          if (important.checked) updated.important = true;
          else delete updated.important;
          if (placeName.value.trim()) {
            updated.place = { ...item?.place, name: placeName.value.trim() };
            if (placeAddress.value.trim()) updated.place.address = placeAddress.value.trim();
            else delete updated.place.address;
          } else delete updated.place;
          for (const [key, el] of [['route', route], ['notes', notes]] as const) {
            if (el.value.trim()) updated[key] = el.value.trim();
            else delete updated[key];
          }
          if (meetPlace.value.trim()) updated.meet = { place: meetPlace.value.trim(), ...(meetTime.value ? { time: `${targetDate}T${meetTime.value}` } : {}) };
          else delete updated.meet;

          // Punkt mógł zmienić dzień: usuwamy go ze starego, dopisujemy do nowego
          const changes: DayDoc[] = [];
          if (day && item && targetDate !== day.date) changes.push({ ...day, items: day.items.filter((i) => i.id !== item.id) });
          const target = days.find((d) => d.date === targetDate) ?? { date: targetDate, baseLocation: '', items: [], revision: 1 };
          const others = target.items.filter((i) => i.id !== updated.id);
          changes.push({ ...target, items: [...others, updated] });

          save.disabled = true;
          try {
            for (const d of changes) await saveDay(tripId, d);
            toast('Zapisano punkt');
            location.hash = `#/wyjazd/${tripId}`;
          } catch {
            error.textContent = navigator.onLine ? 'Nie udało się zapisać.' : 'Brak połączenia z internetem.';
            save.disabled = false;
          }
        },
      },
      h(
        'div',
        { class: 'card' },
        field('Dzień', dateEl),
        h('div', { class: 'two-col' }, field('Od', start), field('Do', end)),
        h('label', { class: 'audience__person' }, nextDay, h('span', {}, 'Koniec następnego dnia')),
        field('Rodzaj', type),
        field('Tytuł', title, 'Krótko – szczegóły w uwagach.'),
        audienceEl,
        h('label', { class: 'audience__person' }, important, h('span', {}, 'Ważne (stała godzina, rezerwacja, do sprawdzenia)')),
      ),
      h(
        'div',
        { class: 'card' },
        h('h2', {}, 'Miejsce i szczegóły'),
        field('Miejsce – nazwa', placeName),
        field('Miejsce – adres', placeAddress),
        field('Dojazd', route, 'Pogrubienie: **tekst**'),
        field('Uwagi', notes),
        h('div', { class: 'two-col' }, field('Spotkanie – miejsce', meetPlace), field('Spotkanie – godzina', meetTime)),
        item?.options?.length ? h('p', { class: 'muted' }, `Propozycje (${item.options.length}) i współrzędne zmienia się importem planu.`) : null,
      ),
      error,
      save,
      remove ?? null,
    ),
  );
}
