import {
  MEMBER_STATUS_LABEL,
  TRIP_STATUS_LABEL,
  addApprovedMember,
  getInfo,
  getMyStatus,
  getOverview,
  getTrip,
  joinTrip,
  leaveTrip,
  listActivePeople,
  listDays,
  listMembers,
  setMemberStatus,
  type Member,
  type Trip,
} from '../data/trips';
import type { MemberStatus, OverviewDoc } from '../model/types';
import { h, render, toast } from '../ui';
import { downloadTrip, formatSync, lastSync } from '../offline';
import { fold } from './fold';
import { noticeCard, takeNotice } from './notify';
import { planSection } from './plan';
import { detailsSection } from './tripDetails';

interface Me {
  uid: string;
  displayName: string;
  isOrganizer: boolean;
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  // data bez godziny – liczona w UTC, żeby strefa telefonu nie przesunęła dnia
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pl-PL', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}

function multiline(text: string): HTMLElement {
  return h('p', { class: 'multiline' }, text);
}

/** Plan w skrócie i koszty – rozwinięte domyślnie dla zgłoszonych (to dla nich najważniejsze), zwinięte dla zatwierdzonych. */
function overviewCard(tripId: string, overview: OverviewDoc | null, openByDefault: boolean): HTMLElement {
  const opts = { id: `${tripId}:overview`, title: 'Plan i koszty', open: openByDefault };
  if (!overview || (!overview.planSummary && !overview.costEstimate && !overview.decisionDeadline)) {
    return fold({ ...opts, meta: 'brak' }, h('p', { class: 'muted' }, 'Organizator jeszcze tego nie uzupełnił.'));
  }
  return fold(
    opts,
    overview.planSummary && multiline(overview.planSummary),
    overview.costEstimate && h('p', {}, h('b', {}, 'Szacunkowy koszt: '), overview.costEstimate),
    overview.decisionDeadline && h('p', {}, h('b', {}, 'Termin decyzji: '), formatDate(overview.decisionDeadline)),
  );
}

/** Kto jedzie – imiona zatwierdzonych i zgłoszonych (wariant C). */
function peopleCard(tripId: string, members: Member[]): HTMLElement {
  const approved = members.filter((m) => m.status === 'approved').map((m) => m.displayName);
  const interested = members.filter((m) => m.status === 'interested').map((m) => m.displayName);
  return fold(
    { id: `${tripId}:people`, title: 'Kto jedzie', meta: `zatwierdzeni: ${approved.length}`, open: false },
    h('p', {}, h('b', {}, `Zatwierdzeni (${approved.length}): `), approved.length ? approved.join(', ') : '—'),
    h('p', {}, h('b', {}, `Chętni (${interested.length}): `), interested.length ? interested.join(', ') : '—'),
  );
}

function actionCard(trip: Trip, myStatus: MemberStatus | undefined, me: Me, reload: () => Promise<void>): HTMLElement | null {
  const error = h('p', { class: 'error', role: 'alert' });
  const run = async (button: HTMLButtonElement, action: () => Promise<void>, done: string) => {
    error.textContent = '';
    button.disabled = true;
    try {
      await action();
      toast(done);
      await reload();
    } catch {
      error.textContent = navigator.onLine ? 'Nie udało się. Spróbuj ponownie.' : 'Brak połączenia z internetem.';
      button.disabled = false;
    }
  };

  if (!myStatus) {
    if (trip.status !== 'open') {
      return h('div', { class: 'card' }, h('p', {}, trip.status === 'closed' ? 'Zapisy na ten wyjazd są wstrzymane.' : 'Zapisy są niedostępne.'));
    }
    const join = h('button', { type: 'button', class: 'btn' }, 'Też tam chcę');
    join.addEventListener('click', () => run(join, () => joinTrip(trip.id, me.uid, me.displayName), 'Zgłoszenie wysłane'));
    return h(
      'div',
      { class: 'card' },
      h('p', {}, 'Chcesz jechać? Po zgłoszeniu zobaczysz plan, koszty i listę chętnych, a organizator dostanie powiadomienie.'),
      error,
      join,
    );
  }
  if (myStatus === 'interested') {
    const leave = h('button', { type: 'button', class: 'btn btn--secondary' }, 'Wycofaj zgłoszenie');
    leave.addEventListener('click', () => {
      if (!confirm('Wycofać zgłoszenie? Organizator dostanie powiadomienie.')) return;
      void run(leave, () => leaveTrip(trip.id, me.uid), 'Zgłoszenie wycofane');
    });
    return h(
      'div',
      { class: 'card' },
      h('p', {}, 'Twoje zgłoszenie czeka na decyzję organizatora. Zatwierdzenie następuje po potwierdzeniu poza aplikacją.'),
      error,
      leave,
    );
  }
  if (myStatus === 'approved') {
    return h('div', { class: 'card card--ok' }, h('p', {}, 'Jesteś na liście uczestników.'));
  }
  return h('div', { class: 'card' }, h('p', {}, 'Wpisano rezygnację z tego wyjazdu. Jeśli chcesz wrócić, napisz do organizatora.'));
}

/** Organizator: zgłoszenia z przyciskami i dopisywanie osób. */
function organizerMembersCard(trip: Trip, members: Member[], reload: () => Promise<void>): HTMLElement {
  const error = h('p', { class: 'error', role: 'alert' });
  const run = async (button: HTMLButtonElement, action: () => Promise<void>) => {
    error.textContent = '';
    button.disabled = true;
    try {
      await action();
      await reload();
    } catch {
      error.textContent = navigator.onLine ? 'Nie udało się zmienić statusu.' : 'Brak połączenia z internetem.';
      button.disabled = false;
    }
  };

  const actionsFor = (m: Member): HTMLElement[] => {
    const btn = (label: string, status: MemberStatus, question?: string) => {
      const b = h('button', { type: 'button' }, label);
      b.addEventListener('click', () => {
        if (question && !confirm(question)) return;
        void run(b, () => setMemberStatus(trip.id, m.uid, status));
      });
      return b;
    };
    if (m.status === 'interested') {
      return [btn('Zatwierdź', 'approved'), btn('Rezygnacja', 'withdrawn', `Wpisać rezygnację: ${m.displayName}?`)];
    }
    if (m.status === 'approved') return [btn('Rezygnacja', 'withdrawn', `Wpisać rezygnację: ${m.displayName}? Ta osoba straci dostęp do szczegółów wyjazdu.`)];
    return [btn('Przywróć', 'interested')];
  };

  const rows = members.map((m) =>
    h(
      'div',
      { class: 'person' },
      h('div', { class: 'person__head' }, h('span', { class: 'person__name' }, m.displayName), h('span', { class: `badge badge--${m.status}` }, MEMBER_STATUS_LABEL[m.status])),
      h('div', { class: 'actions actions--2' }, ...actionsFor(m)),
    ),
  );

  // Dopisanie osoby, która potwierdziła udział poza aplikacją
  const select = h('select', { 'aria-label': 'Osoba do dopisania' }, h('option', { value: '' }, 'Wczytuję listę osób…'));
  const addBtn = h('button', { type: 'button', class: 'btn btn--secondary' }, 'Dopisz jako zatwierdzoną');
  const already = new Set(members.map((m) => m.uid));
  listActivePeople()
    .then((people) => {
      const free = people.filter((p) => !already.has(p.uid));
      select.replaceChildren(
        h('option', { value: '' }, free.length ? 'Wybierz osobę' : 'Wszyscy z listy są już przy tym wyjeździe'),
        ...free.map((p) => h('option', { value: p.uid }, p.displayName)),
      );
      addBtn.addEventListener('click', () => {
        const person = free.find((p) => p.uid === select.value);
        if (!person) return;
        void run(addBtn, () => addApprovedMember(trip.id, person));
      });
    })
    .catch(() => select.replaceChildren(h('option', { value: '' }, 'Nie udało się wczytać listy osób')));

  // Zgłoszenia czekające na decyzję (albo pusta lista nowego wyjazdu) – sekcja rozwinięta, żeby nie przeoczyć
  const waiting = members.filter((m) => m.status === 'interested').length;
  const mustOpen = waiting > 0 || members.length === 0;
  return fold(
    {
      title: 'Zgłoszenia',
      meta: waiting ? `${members.length} · czeka ${waiting}` : String(members.length),
      open: mustOpen,
      id: mustOpen ? undefined : `${trip.id}:members`,
    },
    ...(rows.length ? rows : [h('p', { class: 'muted' }, 'Nikt się jeszcze nie zgłosił.')]),
    error,
    h('label', { class: 'field field--top' }, h('span', {}, 'Dopisz osobę, która potwierdziła udział poza aplikacją'), select),
    addBtn,
  );
}

const DOWNLOAD_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';

/** Pobranie tego wyjazdu na telefon (tryb offline) – ikona przy tytule i data ostatniego pobrania. */
function downloadButton(tripId: string, me: Me): HTMLElement {
  const label = h('span', { class: 'download__when' });
  const showWhen = () => {
    const when = lastSync(me.uid, tripId);
    label.textContent = when ? `Na telefonie: ${formatSync(when)}` : 'Nie pobrano na telefon';
  };
  const button = h('button', { type: 'button', class: 'download__btn', 'aria-label': 'Pobierz wyjazd na telefon (do użycia bez internetu)', title: 'Pobierz na telefon' });
  button.innerHTML = DOWNLOAD_ICON; // stała ikona – bez treści od użytkownika
  button.addEventListener('click', async () => {
    if (!navigator.onLine) return toast('Brak internetu – pobierz, gdy będzie połączenie.');
    button.disabled = true;
    label.textContent = 'Pobieram…';
    try {
      await downloadTrip(me.uid, tripId, me.isOrganizer);
      toast('Wyjazd pobrany – działa bez internetu.');
    } catch {
      toast('Nie udało się pobrać. Spróbuj ponownie.');
    } finally {
      button.disabled = false;
      showWhen();
    }
  });
  showWhen();
  return h('div', { class: 'download' }, button, label);
}

export async function showTrip(tripId: string, me: Me): Promise<void> {
  const body = h('div', {}, h('p', { class: 'muted' }, 'Wczytuję…'));
  render(h('a', { class: 'back', href: '#/' }, '← Wyjazdy'), body);

  const reload = async (): Promise<void> => {
    const trip = await getTrip(tripId).catch(() => null);
    if (!trip) {
      body.replaceChildren(h('h1', {}, 'Wyjazd niedostępny'), h('p', {}, 'Ten wyjazd nie istnieje albo nie masz do niego dostępu.'));
      return;
    }
    const members = await listMembers(tripId).catch(() => null);
    const mine = members?.find((m) => m.uid === me.uid)?.status ?? (await getMyStatus(tripId, me.uid));
    const seesOverview = me.isOrganizer || mine === 'interested' || mine === 'approved';
    const overview = seesOverview ? await getOverview(tripId).catch(() => null) : null;
    const seesDetails = me.isOrganizer || mine === 'approved';
    const details = seesDetails
      ? await detailsSection(trip, me, members ?? [], mine === 'approved').catch(() =>
          h('p', { class: 'error' }, 'Nie udało się wczytać szczegółów. Sprawdź połączenie.'),
        )
      : null;
    const plan = seesDetails
      ? await Promise.all([listDays(tripId), getInfo(tripId)])
          .then(([days, info]) => planSection(trip, me, members ?? [], days, info.planNotes ?? [], mine === 'approved'))
          .catch(() => h('p', { class: 'error' }, 'Nie udało się wczytać planu. Sprawdź połączenie.'))
      : null;

    body.replaceChildren(
      h(
        'div',
        {},
        h(
          'div',
          { class: 'trip-head' },
          h('div', {}, h('h1', {}, trip.title), h('p', { class: 'muted' }, [trip.destination, trip.approxDates].filter(Boolean).join(' · '))),
          downloadButton(trip.id, me),
        ),
        (trip.status !== 'open' || me.isOrganizer) &&
          h('div', { class: 'badges badges--top' }, h('span', { class: `badge badge--trip-${trip.status}` }, TRIP_STATUS_LABEL[trip.status])),
        me.isOrganizer && h('a', { class: 'btn btn--link btn--secondary', href: `#/wyjazd/${trip.id}/edycja` }, 'Edytuj wyjazd'),
        me.isOrganizer && noticeCard(trip.id, takeNotice(trip.id)),
        trip.description && h('div', { class: 'card' }, multiline(trip.description)),
        actionCard(trip, mine, me, reload),
        plan,
        details,
        seesOverview && overviewCard(trip.id, overview, !me.isOrganizer && mine !== 'approved'),
        seesOverview && members && (me.isOrganizer ? organizerMembersCard(trip, members, reload) : peopleCard(trip.id, members)),
      ),
    );
  };

  await reload();
}
