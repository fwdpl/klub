import { h, render } from '../ui';
import { GUIDE_PATH } from './guide';
import type { IconName } from './icons';
import { iconEl } from './tabs';

// Pomoc pod ikoną „?” (prośba Jacka z 5.11.2026): lista ikon – co oznaczają i co pod nimi można zrobić,
// możliwie krótko. Pełna instrukcja (instalacja, logowanie, powiadomienia) – pod /instrukcja.

type Row = [IconName, string, string];

// Ikony u góry – w tej samej kolejności co na ekranie: 🌐, lornetka, ?, ⚙
const topRows = (isOrganizer: boolean): Row[] => [
  ['destinations', 'Kierunki', 'Miejsca, które organizator rozważa – zaznacz „⭐ Interesuje mnie”; widzisz tylko swoje zaznaczenia.'],
  isOrganizer
    ? ['reads', 'Kto przeczytał', 'Kto zobaczył Twoje powiadomienia o zmianach i kto potwierdził „Przyjąłem”; przypomnienie brakującym.']
    : ['reads', 'Powiadomienia', 'Ostatnie 10 powiadomień o zmianach – gdy przypadkiem odrzucisz je w telefonie; „✓ Przyjąłem”, kosz czyści listę.'],
  ['help', 'Pomoc', 'Ta lista.'],
  ['settings', 'Ustawienia', 'Powiadomienia, wyciszenie, motyw jasny/ciemny, kolor aplikacji.'],
];

// Przy tytule wyjazdu
const tripHeadRows = (isOrganizer: boolean): Row[] => [
  ['download', 'Pobierz na telefon', 'Zapisuje wyjazd, żeby działał bez internetu.'],
  ...(isOrganizer
    ? ([
        ['edit', 'Edytuj wyjazd', 'Tytuł, opis, terminy, stan zapisów.'],
        ['bell', 'Powiadomienie', 'Wyślij grupie wiadomość o zmianie; „Ważna zmiana” prosi o „✓ Przyjąłem”.'],
      ] as Row[])
    : []),
];

const TRIP: Row[] = [
  ['today', 'Dziś', 'W czasie wyjazdu: co teraz i dalej, pogoda, nocleg, „📍 Jestem na miejscu”.'],
  ['plan', 'Plan', 'Dni i punkty, „Mój plan / Wszyscy”, pogoda, dodaj do kalendarza, pobierz na mapę.'],
  ['flights', 'Loty', 'Loty z godzinami w czasie miejsca.'],
  ['hotels', 'Noclegi', 'Adresy; Nawiguj, Zadzwoń, 🚕 Pokaż kierowcy.'],
  ['checklist', 'Lista', 'Twoja checklista: odhaczaj, dopisuj, przesuwaj.'],
  ['wishes', 'Życzenia', 'Miejsca do zobaczenia: dodaj albo dopisz się (❤️ Muszę / 👍 Fajnie).'],
  ['expenses', 'Wydatki', 'Kto płacił i za kogo; rozliczenie, całość w PLN, „Kopiuj”.'],
  ['country', 'Kraj', 'Waluta, gniazdka, numer alarmowy, napiwki, wiza.'],
  ['contacts', 'Kontakty', 'Kontakty awaryjne – zadzwoń jednym stuknięciem.'],
  ['insurance', 'Polisa', 'Ubezpieczenie: numer polisy i telefon.'],
  ['costs', 'Koszty', 'Plan i koszty wyjazdu, Twoje wpłaty i terminy.'],
  ['people', 'Kto', 'Kto jedzie; „📍 Jestem na miejscu”.'],
];

function rows(list: Row[]): HTMLElement {
  return h(
    'ul',
    { class: 'help-list' },
    ...list.map(([icon, name, what]) => {
      return h('li', {}, h('span', { class: 'help-list__icon' }, iconEl(icon)), h('span', {}, h('b', {}, name), ' – ', what));
    }),
  );
}

export function showHelp(isOrganizer: boolean): void {
  render(
    h('a', { class: 'back', href: '#/' }, '← Wyjazdy'),
    h('h1', {}, 'Co oznaczają ikony'),
    h('div', { class: 'card' }, h('h2', {}, 'U góry'), rows(topRows(isOrganizer))),
    h('div', { class: 'card' }, h('h2', {}, 'Przy tytule wyjazdu'), rows(tripHeadRows(isOrganizer))),
    h(
      'div',
      { class: 'card' },
      h('h2', {}, 'Na ekranie wyjazdu'),
      h('p', { class: 'muted' }, 'Stuknij ikonę, a pod spodem pokaże się ta część. Widzisz tylko to, co Cię dotyczy.'),
      rows(TRIP),
    ),
    h('p', { class: 'guide-link' }, h('a', { href: GUIDE_PATH }, 'Pełna instrukcja: instalacja, logowanie, powiadomienia →')),
  );
}
