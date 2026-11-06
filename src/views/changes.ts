import { listChanges, listReads, markAck, markSeen, myRead, type Change, type ReadState } from '../data/changes';
import { listMembers, listTrips, myMemberships, type Trip } from '../data/trips';
import { remindChange } from '../firebase';
import { plural } from '../text';
import { h, present, render, toast } from '../ui';

// Potwierdzenia odczytu (v2, 5.11.2026). Uczestnik: na ekranie wyjazdu karta z nową zmianą – „zobaczone” zapisuje się
// samo, przy ważnych zmianach przycisk „Przyjąłem”. Organizator: ekran pod lornetką – kto zobaczył, kto przyjął, przypomnienie.

const RECENT_DAYS = 45;
const when = (d: Date | null) => (d ? d.toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '…');

/** Karta zmian na ekranie wyjazdu: nowe (niezobaczone) i czekające na „Przyjąłem”. */
export function changesBanner(trip: Trip, me: { uid: string; displayName: string }, who: 'approved' | 'interested', readOnly: boolean, withTripName = false): HTMLElement {
  const wrap = h('div', { class: 'changes' });
  void (async () => {
    const since = Date.now() - RECENT_DAYS * 86_400_000;
    const changes = (await listChanges(trip.id, who).catch(() => [] as Change[])).filter((c) => !c.at || c.at.getTime() >= since);
    const states = await Promise.all(changes.map(async (c) => [c, await myRead(c, me.uid)] as const));
    const pending = states.filter(([c, r]) => !r || (c.requireAck && !r.ackAt));
    if (!pending.length) return;
    const card = (c: Change) => {
      const ack = h('button', { type: 'button', class: 'btn' }, '✓ Przyjąłem');
      ack.addEventListener('click', () => {
        el.remove();
        // „zobaczone” jest już zapisane (wcześniej albo przy pokazaniu karty) – dopisujemy samo „Przyjąłem”
        markAck(c, me.uid).catch(() => toast('Nie udało się zapisać – spróbuj ponownie.'));
        if (!wrap.querySelector('.change')) wrap.remove();
      });
      const el = h(
        'div',
        { class: `card change${c.requireAck ? ' change--ack' : ''}`, role: 'status' },
        h('p', { class: 'change__when muted' }, `📣 ${c.requireAck ? 'Ważna zmiana' : 'Zmiana'}${withTripName ? ` · ${trip.title}` : ''} · ${when(c.at)}`),
        h('h2', {}, c.title),
        c.body && h('p', { class: 'multiline' }, c.body),
        c.requireAck && !readOnly && ack,
        withTripName && h('a', { class: 'link-btn change__open', href: `#/wyjazd/${trip.id}` }, 'Otwórz wyjazd →'),
        h('p', { class: 'muted change__note' }, c.requireAck ? 'Organizator widzi, kto przeczytał i potwierdził.' : 'Organizator widzi, kto przeczytał.'),
      );
      return el;
    };
    wrap.replaceChildren(...pending.map(([c]) => card(c)));
    // „zobaczone” – samo, gdy karta się pokazała (nie w podglądzie organizatora)
    if (!readOnly) for (const [c, r] of pending) if (!r) markSeen(c, me).catch(() => undefined);
  })();
  return wrap;
}

/** Organizator: wszystkie zmiany ze wszystkich wyjazdów – kto zobaczył, kto przyjął, przypomnienie brakującym. */
export async function showReads(myUid: string): Promise<void> {
  const body = h('div', {}, h('p', { class: 'muted' }, 'Wczytuję…'));
  render(
    h('a', { class: 'back', href: '#/' }, '← Wyjazdy'),
    h('h1', {}, 'Kto przeczytał'),
    h('p', { class: 'muted' }, 'Zmiany wysłane powiadomieniem z wyjazdu (🔔). Uczestnicy wiedzą, że odczyty są widoczne.'),
    body,
  );
  try {
    const trips = (await listTrips(true, await myMemberships(myUid))).filter((t) => t.status !== 'draft');
    const blocks: HTMLElement[] = [];
    for (const trip of trips) {
      const changes = await listChanges(trip.id, 'organizer');
      if (!changes.length) continue;
      const members = await listMembers(trip.id);
      blocks.push(h('h2', { class: 'reads-trip' }, trip.title));
      for (const c of changes) {
        const reads = await listReads(c).catch(() => new Map<string, ReadState>());
        const statuses = c.audience === 'approved' ? ['approved'] : ['interested', 'approved'];
        const people = members.filter((m) => statuses.includes(m.status) && m.uid !== myUid);
        const seen = people.filter((p) => reads.get(p.uid)?.seenAt).length;
        const acked = people.filter((p) => reads.get(p.uid)?.ackAt).length;
        const missing = people.filter((p) => (c.requireAck ? !reads.get(p.uid)?.ackAt : !reads.get(p.uid)?.seenAt)).length;
        const remind = h('button', { type: 'button', class: 'btn btn--secondary' }, `🔔 Przypomnij brakującym (${missing})`);
        remind.addEventListener('click', async () => {
          remind.disabled = true;
          try {
            const { data } = await remindChange({ tripId: trip.id, changeId: c.id });
            toast(`Przypomnienie: dostało ${data.reached} z ${plural(data.missing, 'osoby', 'osób', 'osób')}.`);
          } catch {
            toast(navigator.onLine ? 'Nie udało się wysłać.' : 'Brak internetu.');
            remind.disabled = false;
          }
        });
        blocks.push(
          h(
            'details',
            { class: 'card fold reads-change' },
            h(
              'summary',
              { class: 'fold__head' },
              h(
                'span',
                { class: 'fold__text' },
                h('span', { class: 'muted' }, `${when(c.at)}${c.requireAck ? ' · wymaga „Przyjąłem”' : ''}`),
                h('h3', { class: 'fold__title' }, c.title),
              ),
              h('span', { class: 'fold__meta' }, c.requireAck ? `✓ ${acked}/${people.length}` : `👁 ${seen}/${people.length}`),
              h('span', { class: 'fold__chevron', 'aria-hidden': 'true' }),
            ),
            h(
              'div',
              { class: 'fold__body' },
              ...present(
                c.body && h('p', { class: 'multiline muted' }, c.body),
                h('p', {}, `Zobaczyło ${seen} z ${people.length}${c.requireAck ? ` · przyjęło ${acked} z ${people.length}` : ''}.`),
                h(
                  'ul',
                  { class: 'status-list' },
                  ...people.map((p) => {
                    const r = reads.get(p.uid);
                    const state = r?.ackAt ? `✓ przyjęte ${when(r.ackAt)}` : r?.seenAt ? `👁 ${when(r.seenAt)}` : '— jeszcze nie';
                    return h('li', { class: r?.seenAt ? '' : 'reads-missing' }, p.displayName, h('b', {}, state));
                  }),
                ),
                missing > 0 && remind,
              ),
            ),
          ),
        );
      }
    }
    body.replaceChildren(...(blocks.length ? blocks : [h('p', { class: 'muted' }, 'Nie wysłano jeszcze żadnego powiadomienia o zmianie.')]));
  } catch {
    body.replaceChildren(h('p', { class: 'error' }, navigator.onLine ? 'Nie udało się wczytać.' : 'Brak internetu – odczyty widać po połączeniu.'));
  }
}

// ---------- uczestnik: ostatnie powiadomienia (prośba Jacka z 5.11.2026) ----------
// Gdy ktoś odruchowo odrzuci powiadomienie w telefonie, znajdzie je tutaj. „Wyczyść” chowa listę na tym urządzeniu.

const CLEARED_KEY = 'klub.changesClearedAt';
const RECENT_LIMIT = 10;

function clearedAt(): number {
  try {
    return Number(localStorage.getItem(CLEARED_KEY)) || 0;
  } catch {
    return 0;
  }
}

export async function showRecent(me: { uid: string; displayName: string }): Promise<void> {
  const body = h('div', {}, h('p', { class: 'muted' }, 'Wczytuję…'));
  render(h('a', { class: 'back', href: '#/' }, '← Wyjazdy'), h('h1', {}, 'Ostatnie powiadomienia'), body);
  try {
    const memberships = await myMemberships(me.uid);
    const trips = await listTrips(false, memberships);
    const all: Change[] = [];
    for (const t of trips) {
      const status = memberships.get(t.id);
      if (status !== 'approved' && status !== 'interested') continue;
      for (const c of await listChanges(t.id, status).catch(() => [] as Change[])) all.push(c);
    }
    const titles = new Map(trips.map((t) => [t.id, t.title]));
    const since = clearedAt();
    const recent = all
      .filter((c) => !c.at || c.at.getTime() > since)
      .sort((a, b) => (b.at?.getTime() ?? Infinity) - (a.at?.getTime() ?? Infinity))
      .slice(0, RECENT_LIMIT);
    if (!recent.length) {
      body.replaceChildren(h('p', { class: 'muted' }, 'Brak powiadomień o zmianach.'));
      return;
    }
    const reads = await Promise.all(recent.map((c) => myRead(c, me.uid)));
    const rows = recent.map((c, i) => {
      const r = reads[i];
      const ack = h('button', { type: 'button', class: 'chip-btn' }, '✓ Przyjąłem');
      ack.addEventListener('click', () => {
        ack.replaceWith(h('span', { class: 'recent__state' }, '✓ przyjęte'));
        markAck(c, me.uid).catch(() => toast('Nie udało się zapisać – spróbuj ponownie.'));
      });
      const state = c.requireAck ? (r?.ackAt ? h('span', { class: 'recent__state' }, `✓ przyjęte ${when(r.ackAt)}`) : ack) : null;
      return h(
        'div',
        { class: `recent${!r ? ' recent--new' : ''}` },
        h('p', { class: 'muted recent__when' }, `${!r ? '● ' : ''}${titles.get(c.tripId) ?? ''} · ${when(c.at)}`),
        h('a', { class: 'recent__title', href: `#/wyjazd/${c.tripId}` }, c.title),
        ...present(c.body && h('p', { class: 'multiline' }, c.body), state),
      );
    });
    const clear = h('button', { type: 'button', class: 'icon-btn recent__clear', 'aria-label': 'Wyczyść wszystkie', title: 'Wyczyść wszystkie' });
    clear.innerHTML = TRASH_ICON; // stała ikona
    clear.addEventListener('click', () => {
      try {
        localStorage.setItem(CLEARED_KEY, String(Date.now()));
      } catch {
        // bez pamięci urządzenia – lista wróci po ponownym otwarciu
      }
      body.replaceChildren(h('p', { class: 'muted' }, 'Wyczyszczone. Nowe powiadomienia pojawią się tutaj.'));
    });
    body.replaceChildren(h('div', { class: 'card' }, ...rows), h('div', { class: 'recent__footer' }, clear, h('span', { class: 'muted' }, 'Wyczyść wszystkie')));
    // otwarcie listy = przeczytanie
    recent.forEach((c, i) => {
      if (!reads[i]) markSeen(c, me).catch(() => undefined);
    });
  } catch {
    body.replaceChildren(h('p', { class: 'error' }, navigator.onLine ? 'Nie udało się wczytać.' : 'Brak internetu – powiadomienia widać po połączeniu.'));
  }
}

const TRASH_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
