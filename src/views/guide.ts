import { isTestEnv } from '../config';
import { isAndroid, isIOS } from '../platform';
import { h, render } from '../ui';
import { fold } from './fold';

// Instrukcja dla uczestników pod stałym adresem /instrukcja – otwiera się bez logowania,
// żeby Jacek mógł wysłać link razem z kodem. Tekst krótki, bez zrzutów (decyzja Jacka z 3.11.2026).
// Treść odpowiada docs/INSTRUKCJA.md – zmieniając jedno, zmień drugie.

export const GUIDE_PATH = '/instrukcja';

export function guideUrl(): string {
  return `${location.origin}${GUIDE_PATH}`;
}

export function isGuidePath(): boolean {
  return location.pathname.replace(/\/+$/, '') === GUIDE_PATH || location.hash === `#${GUIDE_PATH}`;
}

/** Link do instrukcji – przy logowaniu, instalacji i w ustawieniach. */
export function guideLink(label = 'Jak zainstalować i zacząć – instrukcja →'): HTMLElement {
  return h('p', { class: 'guide-link' }, h('a', { href: GUIDE_PATH }, label));
}

const steps = (...items: (string | Node)[][]) => h('ol', { class: 'steps' }, ...items.map((parts) => h('li', {}, ...parts)));
const b = (text: string) => h('b', {}, text);
const p = (...parts: (string | Node)[]) => h('p', {}, ...parts);
const note = (...parts: (string | Node)[]) => h('p', { class: 'muted' }, ...parts);

export function showGuide(): void {
  const host = location.host;
  const name = isTestEnv ? 'Klub TEST' : 'Klub';
  const ios = isIOS();
  const android = !ios && isAndroid();

  render(
    h('a', { class: 'back', href: '/' }, `← ${name}`),
    h('h1', {}, `${name} – jak zacząć`),
    p(
      `${name} to aplikacja naszych wyjazdów: plan dnia, loty, noclegi, kontakty i checklista – także bez internetu. Instaluje się ją ze strony, bez sklepu z aplikacjami.`,
    ),
    h(
      'div',
      { class: 'card' },
      h('ul', { class: 'status-list' }, h('li', {}, 'Adres', h('b', {}, host)), h('li', {}, 'Potrzebujesz', h('b', {}, 'swojego maila i kodu od Jacka'))),
      note('Kod ma 8 znaków (np. ABCD-EFGH), działa raz i jest ważny 48 godzin.'),
    ),

    fold(
      { title: 'iPhone', open: ios },
      note('Wymagany iOS 16.4 lub nowszy.'),
      h('h3', {}, '1. Instalacja'),
      steps(
        ['Otwórz ', b(host), ' w ', b('Safari'), '.'],
        ['Stuknij ', b('Udostępnij'), ' (kwadrat ze strzałką). W nowszym Safari jest pod ', b('•••'), ' w prawym dolnym rogu.'],
        ['Wybierz ', b('Do ekranu głównego'), ' (starsze iPhone’y: „Do ekranu początkowego”) i stuknij ', b('Dodaj'), '.'],
      ),
      h('h3', {}, '2. Logowanie'),
      steps(['Otwórz Klub ', b('ikoną z ekranu głównego'), ' – nie w Safari.'], ['Wpisz mail i kod, stuknij ', b('Zaloguj'), '.']),
      note('iPhone trzyma dane Safari i aplikacji osobno – logowanie w Safari nie przeniesie się do aplikacji.'),
      h('h3', {}, '3. Powiadomienia'),
      steps(['W aplikacji stuknij ', b('Włącz powiadomienia'), ' → ', b('Zezwalaj'), '.']),
      note('Jeśli wybrałeś „Nie zezwalaj”: Ustawienia telefonu → Powiadomienia → Klub → Zezwalaj na powiadomienia.'),
    ),

    fold(
      { title: 'Android', open: android },
      h('h3', {}, '1. Instalacja'),
      steps(
        ['Otwórz ', b(host), ' w ', b('Chrome'), '.'],
        ['Stuknij ', b('Zainstaluj aplikację'), ' na stronie albo w menu ', b('⋮'), ' → ', b('Zainstaluj aplikację'), '.'],
        ['Otwieraj Klub ikoną z ekranu głównego.'],
      ),
      h('h3', {}, '2. Logowanie'),
      steps(['Wpisz mail i kod, stuknij ', b('Zaloguj'), '.']),
      h('h3', {}, '3. Powiadomienia'),
      steps(['Stuknij ', b('Włącz powiadomienia'), ' → ', b('Zezwalaj'), '.']),
      note(
        'Jeśli wybrałeś „Nie zezwalaj”: przytrzymaj ikonę Klub → Informacje o aplikacji → Powiadomienia → włącz. W samym Chrome (bez instalacji): ⋮ → Ustawienia → Ustawienia witryn → Powiadomienia → zezwól dla tej strony.',
      ),
    ),

    fold(
      { title: 'Komputer', open: !ios && !android },
      steps(
        ['Otwórz ', b(host), ' w Chrome, Edge albo Firefoksie i zaloguj się mailem i kodem.'],
        ['Chrome i Edge: ikona instalacji po prawej stronie paska adresu instaluje Klub jak program (nie trzeba).'],
      ),
    ),

    fold(
      { title: 'Jak korzystać', open: true },
      h(
        'ul',
        { class: 'steps' },
        h('li', {}, b('Też tam chcę'), ' – zgłaszasz chęć udziału. Widzisz wtedy plan w skrócie, koszty, termin decyzji i kto jedzie.'),
        h('li', {}, b('Po zatwierdzeniu'), ' przez Jacka (gdy udział jest potwierdzony poza aplikacją) – plan dni, loty, noclegi, kontakty awaryjne i Twoja checklista.'),
        h('li', {}, b('Dziś'), ' – w czasie wyjazdu na górze: co teraz, co dalej (z odliczaniem), zbiórka i nocleg na dziś.'),
        h('li', {}, b('🚕 Pokaż kierowcy'), ' – przy noclegu: adres dużą czcionką, w lokalnym języku, do pokazania taksówkarzowi.'),
        h('li', {}, b('Karta kraju'), ' – waluta, gniazdka, numer alarmowy, napiwki, różnica czasu i notatka o wizie; widać ją po zgłoszeniu.'),
        h('li', {}, b('Mój plan / Wszyscy'), ' – Twoje punkty i wspólne albo plan całej grupy. Godziny zawsze w czasie miejsca.'),
        h('li', {}, b('Przed wyjazdem'), ', z internetem: otwórz wyjazd i stuknij ikonę pobierania obok tytułu. Bez sieci wszystko działa, a odhaczenia wyślą się po połączeniu.'),
        h('li', {}, 'Sekcje i dni planu rozwijasz stuknięciem w nagłówek; dzisiejszy dzień jest oznaczony „dziś”.'),
        h('li', {}, b('Ustawienia (⚙)'), ': powiadomienia, motyw jasny/ciemny, „Wycisz wszystkie powiadomienia”.'),
      ),
    ),

    fold(
      { title: 'Gdy coś nie działa', open: false },
      p(b('Kod nie działa. '), 'Działa raz i 48 godzin; wielkość liter, spacje i myślniki nie mają znaczenia. Po 5 błędnych próbach – 15 minut przerwy. Po nowy kod napisz do Jacka.'),
      p(b('Nowy telefon albo usunięta aplikacja. '), 'Zainstaluj ponownie i poproś Jacka o nowy kod.'),
      p(b('„Jest nowa wersja aplikacji”. '), 'Stuknij „Odśwież”.'),
      p(b('Nawiguj bez internetu. '), 'Google Maps działa wtedy tylko z mapami pobranymi wcześniej w Google Maps.'),
    ),
  );
}
