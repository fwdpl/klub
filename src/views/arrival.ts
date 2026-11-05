import { listArrivals, sendArrival, type Arrival, type ArrivalTo } from '../data/arrivals';
import type { Trip } from '../data/trips';
import { todayIn } from '../plan/time';
import { h, present, toast } from '../ui';

// „Jestem na miejscu” (v2, decyzja Jacka z 5.11.2026): jeden ogólny przycisk; po stuknięciu wybór
// „do wszystkich” albo „do organizatora”. Pod spodem ostatnie zgłoszenia, które ta osoba może widzieć.

interface Me {
  uid: string;
  displayName: string;
  isOrganizer: boolean;
}

const RECENT = 6;

function when(at: Date | null, zone: string): string {
  if (!at) return 'wysyła się…';
  const time = at.toLocaleTimeString('pl-PL', { timeZone: zone, hour: '2-digit', minute: '2-digit' });
  if (todayIn(zone, at) === todayIn(zone)) return time;
  return `${at.toLocaleDateString('pl-PL', { timeZone: zone, day: 'numeric', month: 'short' })}, ${time}`;
}

/**
 * Przycisk z wyborem odbiorców i lista ostatnich zgłoszeń.
 * canSend – tylko zatwierdzeni i organizator, nie w podglądzie.
 */
export function arrivalCard(trip: Trip, me: Me, canSend: boolean): HTMLElement {
  const wrap = h('div', { class: 'arrival' });
  let list: Arrival[] = [];
  let choosing = false;

  const reload = async () => {
    list = await listArrivals(trip.id, me.uid, me.isOrganizer).catch(() => list);
    draw();
  };

  const send = (to: ArrivalTo, note: string) => {
    choosing = false;
    const local: Arrival = { id: `local-${Date.now()}`, uid: me.uid, name: me.displayName, to, ...(note.trim() ? { note: note.trim() } : {}), at: null };
    list = [local, ...list];
    draw();
    const who = to === 'all' ? 'Wszyscy dostaną' : 'Organizator dostanie';
    toast(navigator.onLine === false ? 'Zapisane na telefonie – wyśle się po połączeniu.' : `${who} powiadomienie.`);
    sendArrival(trip.id, me, to, note)
      .then(reload)
      .catch(() => {
        list = list.filter((a) => a !== local);
        draw();
        toast('Nie udało się wysłać – spróbuj ponownie.');
      });
  };

  const chooser = (): HTMLElement => {
    const note = h('input', { type: 'text', maxlength: '80', placeholder: 'Dopisek (opcjonalnie), np. jestem w hotelu', 'aria-label': 'Dopisek' });
    return h(
      'div',
      { class: 'card card--inner arrival__choose' },
      h('p', {}, h('b', {}, 'Komu dać znać?')),
      note,
      h(
        'div',
        { class: 'actions actions--row' },
        h('button', { type: 'button', class: 'btn', onclick: () => send('all', note.value) }, 'Do wszystkich'),
        !me.isOrganizer && h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => send('organizer', note.value) }, 'Do organizatora'),
      ),
      h('button', { type: 'button', class: 'link-btn', onclick: () => ((choosing = false), draw()) }, 'Anuluj'),
    );
  };

  const draw = () => {
    const recent = list.slice(0, RECENT);
    wrap.replaceChildren(
      ...present(
        canSend && !choosing && h('button', { type: 'button', class: 'btn btn--secondary arrival__btn', onclick: () => ((choosing = true), draw()) }, '📍 Jestem na miejscu'),
        canSend && choosing && chooser(),
        recent.length > 0 &&
          h(
            'ul',
            { class: 'arrival__list' },
            ...recent.map((a) =>
              h(
                'li',
                {},
                h('span', {}, `📍 ${a.uid === me.uid ? 'Ty' : a.name}`, a.note ? h('span', { class: 'muted' }, ` – ${a.note}`) : ''),
                h('span', { class: 'muted' }, `${when(a.at, trip.timezone)}${a.to === 'organizer' ? ' · do organizatora' : ''}`),
              ),
            ),
          ),
      ),
    );
  };

  draw();
  void reload();
  return wrap;
}
