import { getCountries, getTrip, saveCountries, type Trip } from '../data/trips';
import { approxMonth } from '../data/tripOrder';
import {
  CUSTOM_CODE,
  MSZ_TRAVEL_URL,
  countryInfo,
  countryName,
  currencyLabel,
  flag,
  plugsLabel,
  searchCountries,
  timeDiff,
} from '../data/countries';
import type { CountryCard } from '../model/types';
import { zoneLabel } from '../timezones';
import { h, render, toast } from '../ui';
import { fold } from './fold';
import { zonePicker } from './zonePicker';

// Karta kraju (prośba Jacka z 4.11.2026): wbudowane dane + poprawki organizatora, kilka krajów na wyjazd,
// widzą zgłoszeni i zatwierdzeni, wiza = link do MSZ + notatka organizatora.

const MONTHS = ['styczniu', 'lutym', 'marcu', 'kwietniu', 'maju', 'czerwcu', 'lipcu', 'sierpniu', 'wrześniu', 'październiku', 'listopadzie', 'grudniu'];

export function cardName(card: CountryCard): string {
  return card.code === CUSTOM_CODE ? card.name || 'Kraj' : countryName(card.code);
}

/** Różnica czasu teraz i (jeśli daty wyjazdu są odczytywalne) w miesiącu wyjazdu – czas letni potrafi ją zmienić. */
function timeRow(zone: string, trip: Trip): string {
  const now = timeDiff(zone, new Date());
  const month = approxMonth(trip.approxDates ?? '');
  if (month === null) return `${now} (teraz)`;
  const at = new Date(Date.UTC(Math.floor(month / 12), month % 12, 15, 12));
  const then = timeDiff(zone, at);
  return then === now ? now : `${then} w ${MONTHS[month % 12]} ${Math.floor(month / 12)} (teraz: ${now})`;
}

function row(label: string, value: string | HTMLElement | null | undefined): HTMLElement | null {
  if (!value) return null;
  return h('li', {}, h('span', {}, label), typeof value === 'string' ? h('b', {}, value) : value);
}

function countryFold(card: CountryCard, trip: Trip): HTMLElement {
  const info = countryInfo(card.code);
  const zone = card.zone || info?.zone;
  const currency = card.currency || (info ? currencyLabel(info.currency) : '');
  const plugs = card.plugs || (info ? plugsLabel(info.plugs, info.voltage) : '');
  const emergency = card.emergency || info?.emergency;
  const tipping = card.tipping || info?.tipping;
  const time = zone ? `${timeRow(zone, trip)}${!card.zone && info?.manyZones ? ` – kraj ma kilka stref, podano dla: ${zoneLabel(zone)}` : ''}` : '';

  return fold(
    { id: `${trip.id}:country:${card.code}:${card.name ?? ''}`, title: `${flag(card.code)} ${cardName(card)}`, open: false },
    h(
      'ul',
      { class: 'status-list status-list--wrap' },
      row('Waluta', currency),
      row('Gniazdka', plugs),
      row('Numer alarmowy', emergency),
      row('Napiwki', tipping),
      row('Czas', time),
    ),
    h(
      'div',
      { class: 'country-visa' },
      h('b', {}, 'Wiza / ESTA: '),
      card.visa ? h('span', { class: 'multiline' }, card.visa) : h('span', { class: 'muted' }, 'organizator nic nie dopisał.'),
      h('p', {}, h('a', { href: MSZ_TRAVEL_URL, target: '_blank', rel: 'noopener' }, 'Informacje MSZ dla podróżujących – sprawdź przed wyjazdem →')),
    ),
    card.notes && h('p', { class: 'multiline' }, card.notes),
    h('p', { class: 'muted' }, 'Dane praktyczne, bez gwarancji aktualności – w razie wątpliwości sprawdź.'),
  );
}

/** Karty krajów na ekranie wyjazdu (warstwa 2). */
export function countrySection(trip: Trip, cards: CountryCard[], isOrganizer: boolean): HTMLElement[] {
  const els = cards.map((c) => countryFold(c, trip));
  if (isOrganizer) {
    els.push(
      h('a', { class: 'btn btn--link btn--secondary btn--spaced', href: `#/wyjazd/${trip.id}/kraje` }, cards.length ? 'Edytuj karty krajów' : '+ Karta kraju (waluta, gniazdka, wiza…)'),
    );
  }
  return els;
}

/** Organizator: wybór krajów i poprawki do wbudowanych danych. */
export async function showCountriesEdit(tripId: string): Promise<void> {
  const [trip, initial] = await Promise.all([getTrip(tripId), getCountries(tripId).catch(() => [])]);
  const back = h('a', { class: 'back', href: `#/wyjazd/${tripId}` }, '← Wyjazd');
  if (!trip) {
    render(back, h('p', {}, 'Nie udało się wczytać wyjazdu.'));
    return;
  }

  type Editor = { el: HTMLElement; read: () => CountryCard };
  const editors: Editor[] = [];
  const list = h('div');

  const addEditor = (card: CountryCard) => {
    const info = countryInfo(card.code);
    const custom = card.code === CUSTOM_CODE;
    const text = (value: string | undefined, placeholder: string, label: string) =>
      h('input', { type: 'text', value: value ?? '', placeholder, maxlength: '200', 'aria-label': label });
    const area = (value: string | undefined, placeholder: string, label: string) => {
      const t = h('textarea', { rows: '2', placeholder, maxlength: '1000', 'aria-label': label });
      t.value = value ?? '';
      return t;
    };
    const field = (label: string, el: HTMLElement, hint?: string) =>
      h('label', { class: 'field' }, h('span', {}, label), el, hint ? h('small', { class: 'muted' }, hint) : null);
    const builtIn = 'Puste = dane wbudowane (widać je w polu na szaro).';

    const name = custom ? text(card.name, 'Nazwa kraju', 'Nazwa kraju') : null;
    const currency = text(card.currency, info ? currencyLabel(info.currency) : 'np. euro (EUR)', 'Waluta');
    const plugs = text(card.plugs, info ? plugsLabel(info.plugs, info.voltage) : 'np. C, F · 230 V', 'Gniazdka');
    const emergency = text(card.emergency, info?.emergency ?? 'np. 112', 'Numer alarmowy');
    const tipping = area(card.tipping, info?.tipping ?? 'np. około 10%', 'Napiwki');
    const visa = area(card.visa, 'np. Bez wizy do 90 dni. Paszport ważny 6 miesięcy.', 'Wiza / ESTA');
    const notes = area(card.notes, 'Inne praktyczne uwagi', 'Uwagi');
    const showZone = custom || !!info?.manyZones || !!card.zone;
    const zone = showZone ? zonePicker(card.zone ?? '', info ? `Domyślnie: ${zoneLabel(info.zone)}` : 'Wpisz kraj lub miasto') : null;

    const remove = h('button', { type: 'button', class: 'row-remove', 'aria-label': `Usuń: ${cardName(card)}` }, '×');
    const el = h(
      'div',
      { class: 'card' },
      h('div', { class: 'person__head' }, h('h2', {}, `${flag(card.code)} ${cardName(card)}`), remove),
      name && field('Nazwa kraju', name),
      field('Waluta', currency, builtIn),
      field('Gniazdka', plugs),
      field('Numer alarmowy', emergency),
      field('Napiwki', tipping),
      zone && h('div', { class: 'field' }, h('span', {}, info?.manyZones ? 'Strefa do różnicy czasu (kraj ma kilka stref)' : 'Strefa do różnicy czasu'), zone.el),
      field('Wiza / ESTA – Twoja notatka', visa, 'Aplikacja sama nie podaje, czy wiza jest potrzebna. Uczestnik zobaczy też link do informacji MSZ.'),
      field('Uwagi', notes),
    );
    const editor: Editor = {
      el,
      read: () => {
        const out: CountryCard = { code: card.code };
        const set = (key: Exclude<keyof CountryCard, 'code'>, value: string) => {
          if (value.trim()) out[key] = value.trim();
        };
        if (name) set('name', name.value);
        set('currency', currency.value);
        set('plugs', plugs.value);
        set('emergency', emergency.value);
        set('tipping', tipping.value);
        set('visa', visa.value);
        set('notes', notes.value);
        if (zone) set('zone', zone.value());
        return out;
      },
    };
    remove.addEventListener('click', () => {
      editors.splice(editors.indexOf(editor), 1);
      el.remove();
    });
    editors.push(editor);
    list.append(el);
  };
  initial.forEach(addEditor);

  // Dodawanie kraju: wyszukiwarka po polskiej nazwie, albo kraj spoza listy
  const search = h('input', { type: 'search', placeholder: 'Wpisz kraj, np. Japonia', autocomplete: 'off', 'aria-label': 'Dodaj kraj' });
  const results = h('div', { class: 'zone-results', role: 'listbox' });
  const showResults = () => {
    const taken = new Set(editors.map((e) => e.read().code));
    const found = searchCountries(search.value).filter((c) => !taken.has(c.code));
    results.replaceChildren(
      ...found.map((c) =>
        h(
          'button',
          {
            type: 'button',
            role: 'option',
            class: 'zone-option',
            onclick: () => {
              addEditor({ code: c.code });
              search.value = '';
              results.replaceChildren();
            },
          },
          h('span', {}, `${flag(c.code)} ${countryName(c.code)}`),
          h('span', { class: 'muted' }, c.currency),
        ),
      ),
      ...(search.value.trim()
        ? [
            h(
              'button',
              {
                type: 'button',
                class: 'zone-option',
                onclick: () => {
                  addEditor({ code: CUSTOM_CODE, name: search.value.trim() });
                  search.value = '';
                  results.replaceChildren();
                },
              },
              h('span', {}, `🌍 Inny kraj: „${search.value.trim()}” – uzupełnisz sam`),
            ),
          ]
        : []),
    );
  };
  search.addEventListener('input', showResults);

  const error = h('p', { class: 'error', role: 'alert' });
  const save = h('button', { type: 'button', class: 'btn' }, 'Zapisz karty krajów');
  save.addEventListener('click', async () => {
    error.textContent = '';
    const cards = editors.map((e) => e.read());
    if (cards.length > 10) return void (error.textContent = 'Najwyżej 10 krajów na wyjazd.');
    save.disabled = true;
    try {
      await saveCountries(tripId, cards);
      toast('Zapisano karty krajów');
      location.hash = `#/wyjazd/${tripId}`;
    } catch {
      error.textContent = navigator.onLine ? 'Nie udało się zapisać.' : 'Brak połączenia z internetem.';
      save.disabled = false;
    }
  });

  render(
    back,
    h('h1', {}, 'Karty krajów'),
    h('p', { class: 'muted' }, `${trip.title}. Widzą je zgłoszeni i zatwierdzeni. Puste pola wypełnia aplikacja; wpisz coś, żeby to poprawić.`),
    list,
    h('div', { class: 'card' }, h('h2', {}, 'Dodaj kraj'), h('div', { class: 'zone-picker' }, search, results)),
    error,
    save,
  );
}
