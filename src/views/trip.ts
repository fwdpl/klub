import {
  MEMBER_STATUS_LABEL,
  TRIP_STATUS_LABEL,
  addApprovedMember,
  getMyStatus,
  getOverview,
  getTrip,
  joinTrip,
  leaveTrip,
  listActivePeople,
  listMembers,
  setMemberStatus,
  type Member,
  type Trip,
} from '../data/trips';
import type { MemberStatus, OverviewDoc } from '../model/types';
import { h, render, toast } from '../ui';

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

function overviewCard(overview: OverviewDoc | null): HTMLElement {
  if (!overview || (!overview.planSummary && !overview.costEstimate && !overview.decisionDeadline)) {
    return h('div', { class: 'card' }, h('h2', {}, 'Plan i koszty'), h('p', { class: 'muted' }, 'Organizator jeszcze tego nie uzupełnił.'));
  }
  return h(
    'div',
    { class: 'card' },
    h('h2', {}, 'Plan i koszty'),
    overview.planSummary && multiline(overview.planSummary),
    overview.costEstimate && h('p', {}, h('b', {}, 'Szacunkowy koszt: '), overview.costEstimate),
    overview.decisionDeadline && h('p', {}, h('b', {}, 'Termin decyzji: '), formatDate(overview.decisionDeadline)),
  );
}

/** Kto jedzie – imiona zatwierdzonych i zgłoszonych (wariant C). */
function peopleCard(members: Member[]): HTMLElement {
  const approved = members.filter((m) => m.status === 'approved').map((m) => m.displayName);
  const interested = members.filter((m) => m.status === 'interested').map((m) => m.displayName);
  return h(
    'div',
    { class: 'card' },
    h('h2', {}, 'Kto jedzie'),
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
    return h('div', { class: 'card card--ok' }, h('p', {}, 'Jesteś na liście uczestników. Szczegóły – loty, hotele, plan dni – pojawią się tutaj.'));
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

  return h(
    'div',
    { class: 'card' },
    h('h2', {}, `Zgłoszenia (${members.length})`),
    ...(rows.length ? rows : [h('p', { class: 'muted' }, 'Nikt się jeszcze nie zgłosił.')]),
    error,
    h('label', { class: 'field field--top' }, h('span', {}, 'Dopisz osobę, która potwierdziła udział poza aplikacją'), select),
    addBtn,
  );
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

    body.replaceChildren(
      h(
        'div',
        {},
        h('h1', {}, trip.title),
        h('p', { class: 'muted' }, [trip.destination, trip.approxDates].filter(Boolean).join(' · ')),
        (trip.status !== 'open' || me.isOrganizer) &&
          h('div', { class: 'badges badges--top' }, h('span', { class: `badge badge--trip-${trip.status}` }, TRIP_STATUS_LABEL[trip.status])),
        me.isOrganizer && h('a', { class: 'btn btn--link btn--secondary', href: `#/wyjazd/${trip.id}/edycja` }, 'Edytuj wyjazd'),
        trip.description && h('div', { class: 'card' }, multiline(trip.description)),
        actionCard(trip, mine, me, reload),
        seesOverview && overviewCard(overview),
        seesOverview && members && (me.isOrganizer ? organizerMembersCard(trip, members, reload) : peopleCard(members)),
      ),
    );
  };

  await reload();
}
