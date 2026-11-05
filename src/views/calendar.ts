import { isFor, type Trip } from '../data/trips';
import type { DayDoc } from '../model/types';
import { buildIcs, icsFileName } from '../plan/ics';
import { isAndroid, isIOS } from '../platform';
import { plural } from '../text';
import { h, toast } from '../ui';

// Eksport planu do kalendarza telefonu – kalendarz sam przypomina o punktach, w tle i z dźwiękiem.

const REMINDER_KEY = 'klub.calendarReminder';
const REMINDERS: [number, string][] = [
  [0, 'bez przypomnienia'],
  [15, '15 min przed'],
  [30, '30 min przed'],
  [60, '1 godz. przed'],
  [120, '2 godz. przed'],
];

function savedReminder(): number {
  try {
    const v = Number(localStorage.getItem(REMINDER_KEY));
    return REMINDERS.some(([m]) => m === v) && localStorage.getItem(REMINDER_KEY) !== null ? v : 30;
  } catch {
    return 30;
  }
}

/** iPhone: arkusz udostępniania (Kalendarz / Zachowaj w Plikach / aplikacja map); gdzie indziej – pobranie pliku. */
export async function deliverFile(name: string, content: string, type: string): Promise<void> {
  const file = new File([content], name, { type });
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
    } catch {
      // zamknięte okno udostępniania – nic nie robimy
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Przycisk i panel „Dodaj do kalendarza” w sekcji planu. */
export function calendarExport(trip: Trip, days: DayDoc[], uid: string, mineOnly: boolean): HTMLElement {
  const wrap = h('div', { class: 'calendar-export' });
  const include = (i: DayDoc['items'][number]) => !mineOnly || isFor(i.audience, uid);
  const count = days.reduce((n, d) => n + d.items.filter(include).length, 0);

  const openBtn = h('button', { type: 'button', class: 'chip-btn chip-btn--wide' }, '📅 Dodaj do kalendarza telefonu');
  const panel = h('div', { class: 'card card--inner', hidden: true });
  openBtn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });

  const select = h(
    'select',
    { 'aria-label': 'Przypomnienie' },
    ...REMINDERS.map(([m, label]) => h('option', { value: String(m), selected: m === savedReminder() }, label)),
  );
  const download = h('button', { type: 'button', class: 'btn' }, 'Pobierz plik do kalendarza');
  download.addEventListener('click', async () => {
    const reminderMinutes = Number(select.value);
    try {
      localStorage.setItem(REMINDER_KEY, String(reminderMinutes));
    } catch {
      // bez pamięci urządzenia – następnym razem domyślne 30 min
    }
    const { ics, count: n } = buildIcs({ tripId: trip.id, tripTitle: trip.title, tripZone: trip.timezone, days, include, reminderMinutes });
    if (!n) return toast('Brak punktów do dodania.');
    await deliverFile(icsFileName(trip.title), ics, 'text/calendar');
  });

  const how = isIOS()
    ? 'iPhone: w oknie udostępniania wybierz „Kalendarz”. Jeśli go nie ma – „Zachowaj w Plikach”, potem otwórz plik w aplikacji Pliki i stuknij „Dodaj wszystkie”.'
    : isAndroid()
      ? 'Android: otwórz pobrany plik (powiadomienie albo Pobrane) i wybierz Kalendarz Google lub inny kalendarz.'
      : 'Komputer: otwórz pobrany plik – doda się do domyślnego kalendarza (Outlook, Kalendarz Apple, Google Calendar przez „Importuj”).';

  panel.append(
    h('p', {}, `Do kalendarza trafi ${mineOnly ? 'Twój plan' : 'cały plan'}: ${plural(count, 'punkt', 'punkty', 'punktów')}. Godziny pokażą się w strefie telefonu – po przylocie w czasie miejsca.`),
    h('label', { class: 'field' }, h('span', {}, 'Przypomnienie'), select),
    download,
    h('p', { class: 'muted' }, how),
    h('p', { class: 'muted' }, 'Kalendarz nie zaktualizuje się sam: po zmianie planu dodaj plik jeszcze raz (stare wydarzenia mogą się powtórzyć – usuń je w kalendarzu).'),
  );
  wrap.append(openBtn, panel);
  return wrap;
}
