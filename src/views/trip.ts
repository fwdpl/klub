import {
  MEMBER_STATUS_LABEL,
  TRIP_STATUS_LABEL,
  addApprovedMember,
  getCountries,
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
import { richText } from '../plan/richText';
import { countrySection } from './country';
import { todayCard } from './today';
import { fold, foldBody } from './fold';
import { ICONS } from './icons';
import { tabbedSections, type Tab } from './tabs';
import { wishlistSection } from './wishlist';
import { expensesSection } from './expenses';
import { arrivalCard } from './arrival';
import { changesBanner } from './changes';
import { myPaymentsCard, organizerPaymentsCard } from './payments';
import { countryInfo } from '../data/countries';
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
  return h('p', { class: 'multiline' }, richText(text));
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

  if (!myStatus && me.isOrganizer) {
    // Organizator też jeździ: dopisuje się od razu jako zatwierdzony – ma wtedy „Mój plan” i własną checklistę
    const self = h('button', { type: 'button', class: 'btn btn--secondary' }, 'Jadę – dopisz mnie');
    self.addEventListener('click', () => run(self, () => addApprovedMember(trip.id, me), 'Jesteś na liście uczestników'));
    return h('div', { class: 'card' }, h('p', {}, 'Nie ma Cię na liście uczestników tego wyjazdu.'), error, self);
  }
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
  // zatwierdzony: zamiast okienka mały znaczek „✓ jedziesz” przy tytule (uwaga Jacka z 4.11.2026)
  if (myStatus === 'approved') return null;
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

/** Organizator: wybór osoby do podglądu (SPEC §5 „Podgląd jako uczestnik X”). */
function previewPicker(members: Member[], selfUid: string, start: (m: Member) => void): HTMLElement | null {
  const others = members.filter((m) => m.uid !== selfUid);
  if (others.length === 0) return null;
  const select = h(
    'select',
    { 'aria-label': 'Podgląd jako' },
    h('option', { value: '' }, 'Podgląd jako uczestnik…'),
    ...others.map((m) => h('option', { value: m.uid }, `${m.displayName} (${MEMBER_STATUS_LABEL[m.status]})`)),
  );
  select.addEventListener('change', () => {
    const m = others.find((x) => x.uid === select.value);
    if (m) start(m);
  });
  return h('div', { class: 'preview-picker' }, select);
}

/** Czy osoba o danym statusie widzi wyjazd – jak w firestore.rules (canSeeTrip). */
function participantSeesTrip(trip: Trip, status: MemberStatus | undefined): boolean {
  if (trip.status === 'open' || trip.status === 'closed') return true;
  return trip.status === 'archived' && status === 'approved';
}

export async function showTrip(tripId: string, me: Me): Promise<void> {
  const body = h('div', {}, h('p', { class: 'muted' }, 'Wczytuję…'));
  render(h('a', { class: 'back', href: '#/' }, '← Wyjazdy'), body);
  // Podgląd jako uczestnik – tylko widok; zmiany i tak blokują reguły bazy, a tu wyłączamy przyciski
  let previewOf: Member | null = null;

  const reload = async (): Promise<void> => {
    const trip = await getTrip(tripId).catch(() => null);
    if (!trip) {
      body.replaceChildren(h('h1', {}, 'Wyjazd niedostępny'), h('p', {}, 'Ten wyjazd nie istnieje albo nie masz do niego dostępu.'));
      return;
    }
    const members = await listMembers(tripId).catch(() => null);
    const preview = me.isOrganizer && previewOf ? previewOf : null;
    const viewer: Me = preview ? { uid: preview.uid, displayName: preview.displayName, isOrganizer: false } : me;
    const mine = members?.find((m) => m.uid === viewer.uid)?.status ?? (preview ? undefined : await getMyStatus(tripId, me.uid));
    const seesOverview = viewer.isOrganizer || mine === 'interested' || mine === 'approved';
    const overview = seesOverview ? await getOverview(tripId).catch(() => null) : null;
    const countries = seesOverview ? await getCountries(tripId).catch(() => []) : [];
    const seesDetails = viewer.isOrganizer || mine === 'approved';
    const details = seesDetails ? await detailsSection(trip, viewer, members ?? [], !preview && mine === 'approved').catch(() => null) : null;
    const planData = seesDetails ? await Promise.all([listDays(tripId), getInfo(tripId)]).catch(() => null) : null;
    const loadError = (what: string) => h('p', { class: 'error' }, `Nie udało się wczytać: ${what}. Sprawdź połączenie.`);
    // „Dziś” – tylko w dniach z planu; uczestnik widzi swój plan, organizator spoza listy – cały
    const today = planData ? todayCard(trip, viewer, planData[0], planData[1].hotels, mine === 'approved') : null;

    const stopPreview = () => {
      previewOf = null;
      void reload().then(() => window.scrollTo(0, 0));
    };
    const banner =
      preview &&
      h(
        'div',
        { class: 'card card--preview', role: 'status' },
        h('h2', {}, `Podgląd: ${preview.displayName}`),
        h('p', {}, `Tak ${preview.displayName} (${MEMBER_STATUS_LABEL[preview.status]}) widzi ten wyjazd. To tylko podgląd – przyciski nic nie zmieniają.`),
        preview.status === 'approved' && h('p', { class: 'muted' }, 'Checklista tej osoby jest prywatna – w podglądzie jej nie pokazujemy.'),
        h('button', { type: 'button', class: 'btn', onclick: stopPreview }, 'Zakończ podgląd'),
      );
    if (preview && !participantSeesTrip(trip, mine)) {
      body.replaceChildren(
        h('h1', {}, trip.title),
        banner as HTMLElement,
        h('div', { class: 'card' }, h('p', {}, `${preview.displayName} nie widzi tego wyjazdu (${TRIP_STATUS_LABEL[trip.status]}).`)),
      );
      return;
    }

    const action = actionCard(trip, mine, viewer, reload);
    if (preview) action?.querySelectorAll('button').forEach((b) => (b.disabled = true));
    const organizer = !preview && me.isOrganizer;
    const notice = organizer ? noticeCard(trip.id, takeNotice(trip.id)) : null;
    const editDetails = () =>
      organizer ? h('a', { class: 'btn btn--link btn--secondary btn--spaced', href: `#/wyjazd/${trip.id}/szczegoly` }, 'Edytuj szczegóły i checklistę') : null;
    const withEdit = (el: HTMLElement) => h('div', {}, el, editDetails());
    const iconLink = (icon: 'edit' | 'bell', label: string, attrs: Record<string, string | EventListener>) => {
      const el = h(attrs.href ? 'a' : 'button', { class: 'icon-btn', 'aria-label': label, title: label, ...(attrs.href ? {} : { type: 'button' }), ...attrs });
      el.innerHTML = ICONS[icon]; // stała ikona
      return el;
    };

    // Sekcje pod ikonami – tylko te, które ta osoba może zobaczyć
    const waiting = (members ?? []).filter((m) => m.status === 'interested').length;
    const tabs: Tab[] = [];
    const approvedPeople = (members ?? []).filter((m) => m.status === 'approved').map((m) => ({ uid: m.uid, displayName: m.displayName }));
    // waluty krajów wyjazdu – na początek listy przy wydatkach
    const tripCurrencies = [...new Set(countries.map((c) => (c.currency && /^[A-Z]{3}$/.test(c.currency) ? c.currency : countryInfo(c.code)?.currency)).filter((c): c is string => !!c))];
    // „Jestem na miejscu”: wysyłają zatwierdzeni i organizator (nie w podglądzie); widzą wszyscy z dostępem do szczegółów
    const canArrive = !preview && (me.isOrganizer || mine === 'approved');
    const arrival = () => (seesDetails ? arrivalCard(trip, viewer, canArrive) : null);
    if (today) tabs.push({ key: 'today', icon: 'today', label: 'Dziś', title: 'Dziś', content: () => h('div', {}, arrival(), today) });
    if (seesDetails) {
      const plan = planData ? planSection(trip, viewer, members ?? [], planData[0], planData[1].planNotes ?? [], mine === 'approved') : null;
      tabs.push({ key: 'plan', icon: 'plan', label: 'Plan', title: 'Plan', content: () => (plan ? foldBody(plan) : loadError('plan')) });
      tabs.push({ key: 'flights', icon: 'flights', label: 'Loty', title: 'Loty', content: () => (details ? withEdit(foldBody(details.flights)) : loadError('loty')) });
      tabs.push({ key: 'hotels', icon: 'hotels', label: 'Noclegi', title: 'Noclegi', content: () => (details ? withEdit(foldBody(details.hotels)) : loadError('noclegi')) });
      if (details?.checklist) tabs.push({ key: 'checklist', icon: 'checklist', label: 'Lista', title: 'Moja checklista', content: () => foldBody(details.checklist!) });
      tabs.push({ key: 'wishes', icon: 'wishes', label: 'Życzenia', title: 'Lista życzeń', content: () => wishlistSection(trip, viewer.isOrganizer ? viewer : { ...viewer, isOrganizer: false }) });
      tabs.push({ key: 'expenses', icon: 'expenses', label: 'Wydatki', title: 'Wspólne wydatki', content: () => expensesSection(trip, viewer, approvedPeople, tripCurrencies, !!preview) });
    }
    if (seesOverview) {
      tabs.push({ key: 'country', icon: 'country', label: 'Kraj', title: countries.length > 1 ? 'Karty krajów' : 'Karta kraju', content: () => h('div', {}, ...countrySection(trip, countries, organizer)) });
    }
    if (seesDetails) {
      tabs.push({ key: 'contacts', icon: 'contacts', label: 'Kontakty', title: 'Kontakty awaryjne', content: () => (details ? withEdit(foldBody(details.contacts)) : loadError('kontakty')) });
      if (details?.insurance || organizer) {
        tabs.push({
          key: 'insurance',
          icon: 'insurance',
          label: 'Polisa',
          title: 'Ubezpieczenie',
          content: () => withEdit(details?.insurance ? foldBody(details.insurance) : h('p', { class: 'muted' }, 'Brak informacji o ubezpieczeniu.')),
        });
      }
    }
    if (seesOverview) {
      tabs.push({
        key: 'costs',
        icon: 'costs',
        label: 'Koszty',
        title: 'Plan i koszty',
        content: () =>
          h(
            'div',
            {},
            foldBody(overviewCard(trip.id, overview, true)),
            organizer ? organizerPaymentsCard(trip, approvedPeople.filter((p) => p.uid !== me.uid)) : mine === 'approved' ? myPaymentsCard(trip, viewer.uid) : null,
          ),
      });
      if (members) {
        tabs.push({
          key: 'people',
          icon: 'people',
          label: 'Kto',
          title: viewer.isOrganizer ? 'Zgłoszenia' : 'Kto jedzie',
          badge: viewer.isOrganizer ? waiting : 0,
          content: () =>
            viewer.isOrganizer
              ? h(
                  'div',
                  {},
                  arrival(),
                  organizer &&
                    previewPicker(members, me.uid, (m) => {
                      previewOf = m;
                      void reload().then(() => window.scrollTo(0, 0));
                    }),
                  foldBody(organizerMembersCard(trip, members, reload)),
                )
              : h('div', {}, arrival(), foldBody(peopleCard(trip.id, members))),
        });
      }
    }
    const fallback = seesDetails ? 'plan' : 'costs';

    // Opis wyjazdu: krótko, z „więcej”, żeby nie spychał ikon w dół
    const description =
      trip.description &&
      (() => {
        const text = h('p', { class: 'multiline trip-desc' }, richText(trip.description));
        const long = trip.description.length > 180 || trip.description.split('\n').length > 3;
        if (!long) return text;
        text.classList.add('trip-desc--short');
        const more = h('button', { type: 'button', class: 'link-btn' }, 'więcej');
        more.addEventListener('click', () => {
          const short = text.classList.toggle('trip-desc--short');
          more.textContent = short ? 'więcej' : 'mniej';
        });
        return h('div', {}, text, more);
      })();

    body.replaceChildren(
      h(
        'div',
        { class: preview ? 'previewing wide' : 'wide' },
        banner,
        h(
          'div',
          { class: 'trip-head' },
          h(
            'div',
            {},
            h('h1', {}, trip.title),
            h('p', { class: 'muted' }, [trip.destination, trip.approxDates].filter(Boolean).join(' · ')),
            h(
              'div',
              { class: 'badges badges--top' },
              mine === 'approved' && h('span', { class: 'badge badge--approved' }, '✓ jedziesz'),
              (trip.status !== 'open' || viewer.isOrganizer) && h('span', { class: `badge badge--trip-${trip.status}` }, TRIP_STATUS_LABEL[trip.status]),
            ),
          ),
          h(
            'div',
            { class: 'trip-head__tools' },
            organizer && iconLink('edit', 'Edytuj wyjazd', { href: `#/wyjazd/${trip.id}/edycja` }),
            organizer && notice && iconLink('bell', 'Wyślij powiadomienie', { onclick: () => notice.openManual() }),
            !preview && downloadButton(trip.id, me),
          ),
        ),
        notice,
        // nowe zmiany od organizatora (potwierdzenia odczytu); w podglądzie tylko do oglądania
        !viewer.isOrganizer && (mine === 'approved' || mine === 'interested') && changesBanner(trip, viewer, mine, !!preview),
        description,
        action,
        tabbedSections(trip.id, tabs, fallback),
        preview && h('button', { type: 'button', class: 'btn', onclick: stopPreview }, 'Zakończ podgląd'),
      ),
    );
  };

  await reload();
}
