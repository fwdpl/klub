import { TRIP_STATUS_LABEL, getOverview, getTrip, saveTrip, type TripForm } from '../data/trips';
import type { TripStatus } from '../model/types';
import { proposeNotice } from './notify';
import { zonePicker } from './zonePicker';
import { h, render, toast } from '../ui';

function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('small', { class: 'muted' }, hint) : null);
}

/** Formularz organizatora: nowy wyjazd albo edycja (warstwa 1 + warstwa 2). */
export async function showTripEdit(tripId: string | null): Promise<void> {
  const [trip, overview] = tripId ? await Promise.all([getTrip(tripId), getOverview(tripId).catch(() => null)]) : [null, null];
  if (tripId && !trip) {
    render(h('a', { class: 'back', href: '#/' }, '← Wyjazdy'), h('p', {}, 'Nie ma takiego wyjazdu.'));
    return;
  }

  const text = (name: string, value = '', attrs: Record<string, string | boolean> = {}) =>
    h('input', { type: 'text', name, value, ...attrs });
  const area = (name: string, value = '') => {
    const t = h('textarea', { name, rows: '5' });
    t.value = value;
    return t;
  };

  const title = text('title', trip?.title, { required: true, maxlength: '80' });
  const destination = text('destination', trip?.destination, { maxlength: '80' });
  const approxDates = text('approxDates', trip?.approxDates, { maxlength: '80', placeholder: 'np. marzec 2027' });
  const description = area('description', trip?.description);
  const timezone = zonePicker(trip?.timezone ?? '');
  const status = h(
    'select',
    { name: 'status' },
    ...(['draft', 'open', 'closed', 'archived'] as TripStatus[]).map((s) =>
      h('option', { value: s, selected: s === (trip?.status ?? 'draft') }, TRIP_STATUS_LABEL[s]),
    ),
  );
  const planSummary = area('planSummary', overview?.planSummary);
  const costEstimate = text('costEstimate', overview?.costEstimate, { maxlength: '120', placeholder: 'np. ok. 6000 zł/os.' });
  const decisionDeadline = h('input', { type: 'date', name: 'decisionDeadline', value: overview?.decisionDeadline ?? '' });

  const error = h('p', { class: 'error', role: 'alert' });
  const save = h('button', { type: 'submit', class: 'btn' }, tripId ? 'Zapisz zmiany' : 'Utwórz wyjazd');
  const back = tripId ? `#/wyjazd/${tripId}` : '#/';

  render(
    h('a', { class: 'back', href: back }, tripId ? '← Wyjazd' : '← Wyjazdy'),
    h('h1', {}, tripId ? 'Edycja wyjazdu' : 'Nowy wyjazd'),
    h(
      'form',
      {
        onsubmit: async (e: Event) => {
          e.preventDefault();
          error.textContent = '';
          if (!title.value.trim()) {
            error.textContent = 'Podaj tytuł.';
            return;
          }
          if (!timezone.value()) {
            error.textContent = 'Wybierz strefę czasową miejsca – według niej będą godziny w planie.';
            return;
          }
          const form: TripForm = {
            title: title.value,
            destination: destination.value,
            approxDates: approxDates.value,
            description: description.value,
            timezone: timezone.value(),
            status: status.value as TripStatus,
            planSummary: planSummary.value,
            costEstimate: costEstimate.value,
            decisionDeadline: decisionDeadline.value,
          };
          save.disabled = true;
          try {
            const id = await saveTrip(tripId, form);
            // Zmiana planu w skrócie, kosztów albo terminu decyzji – propozycja powiadomienia zgłoszonych (decyzja L)
            const overviewChanged =
              (overview?.planSummary ?? '') !== form.planSummary.trim() ||
              (overview?.costEstimate ?? '') !== form.costEstimate.trim() ||
              (overview?.decisionDeadline ?? '') !== form.decisionDeadline;
            if (tripId && overviewChanged && form.status !== 'draft') {
              const deadline = form.decisionDeadline ? `, decyzja do ${form.decisionDeadline.split('-').reverse().join('.')}` : '';
              proposeNotice(id, {
                audience: 'interested',
                title: 'Nowe informacje o wyjeździe',
                body: `${form.title.trim()}: ${form.costEstimate.trim() || 'zaktualizowany plan'}${deadline}`.slice(0, 200),
              });
            }
            toast('Zapisano');
            location.hash = `#/wyjazd/${id}`;
          } catch {
            error.textContent = navigator.onLine ? 'Nie udało się zapisać.' : 'Brak połączenia z internetem.';
            save.disabled = false;
          }
        },
      },
      h(
        'div',
        { class: 'card' },
        h('h2', {}, 'Opis – widzą wszyscy z listy'),
        field('Tytuł', title),
        field('Kierunek', destination),
        field('Orientacyjne daty', approxDates),
        field('Opis', description),
        h(
          'div',
          { class: 'field' },
          h('span', {}, 'Strefa czasowa miejsca'),
          timezone.el,
          h('small', { class: 'muted' }, 'Wszystkie godziny w planie będą w czasie tego miejsca, niezależnie od strefy telefonu.'),
        ),
        field('Stan', status, 'Szkic widzisz tylko Ty. Zapisy otwarte – można się zgłaszać. Archiwum widzą tylko uczestnicy.'),
      ),
      h(
        'div',
        { class: 'card' },
        h('h2', {}, 'Plan i koszty – widzą zgłoszeni i zatwierdzeni'),
        field('Plan w skrócie', planSummary),
        field('Szacunkowy koszt', costEstimate),
        field('Termin decyzji', decisionDeadline),
      ),
      error,
      save,
    ),
  );
}
