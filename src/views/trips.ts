import { isTestEnv } from '../config';
import { MEMBER_STATUS_LABEL, TRIP_STATUS_LABEL, listTrips, myMemberships, type Trip } from '../data/trips';
import { installCard } from '../install';
import type { MemberStatus } from '../model/types';
import { h, render } from '../ui';

function tripCard(trip: Trip, myStatus: MemberStatus | undefined, isOrganizer: boolean): HTMLElement {
  const badges: HTMLElement[] = [];
  if (myStatus) badges.push(h('span', { class: `badge badge--${myStatus}` }, MEMBER_STATUS_LABEL[myStatus]));
  if (trip.status !== 'open' || isOrganizer) {
    badges.push(h('span', { class: `badge badge--trip-${trip.status}` }, TRIP_STATUS_LABEL[trip.status]));
  }
  return h(
    'a',
    { class: 'card trip-card', href: `#/wyjazd/${trip.id}` },
    h('div', { class: 'trip-card__title' }, trip.title),
    h('div', { class: 'muted' }, [trip.destination, trip.approxDates].filter(Boolean).join(' · ')),
    badges.length > 0 && h('div', { class: 'badges' }, ...badges),
  );
}

/** Ekran główny: lista wyjazdów. */
export async function showTrips(uid: string, isOrganizer: boolean): Promise<void> {
  const list = h('div', {}, h('p', { class: 'muted' }, 'Wczytuję wyjazdy…'));

  render(
    h(
      'div',
      { class: 'topbar' },
      h('h1', {}, isTestEnv ? 'Klub TEST' : 'Klub'),
      h('a', { class: 'icon-link', href: '#/ustawienia', 'aria-label': 'Ustawienia' }, '⚙'),
    ),
    installCard(),
    isOrganizer &&
      h(
        'div',
        { class: 'button-row' },
        h('a', { class: 'btn btn--link', href: '#/nowy-wyjazd' }, '+ Nowy wyjazd'),
        h('a', { class: 'btn btn--link btn--secondary', href: '#/osoby' }, 'Osoby'),
      ),
    list,
  );

  try {
    const memberships = await myMemberships(uid);
    const trips = await listTrips(isOrganizer, memberships);
    list.replaceChildren(
      ...(trips.length > 0
        ? trips.map((t) => tripCard(t, memberships.get(t.id), isOrganizer))
        : [
            h(
              'div',
              { class: 'card' },
              h('p', {}, isOrganizer ? 'Nie ma jeszcze żadnych wyjazdów. Dodaj pierwszy przyciskiem „+ Nowy wyjazd”.' : 'Nie ma jeszcze żadnych wyjazdów.'),
            ),
          ]),
    );
  } catch {
    list.replaceChildren(h('p', { class: 'error' }, 'Nie udało się wczytać wyjazdów. Sprawdź połączenie.'));
  }
}
