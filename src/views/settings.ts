import type { User } from 'firebase/auth';
import { signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { readDoc } from '../data/read';
import { auth, db, sendTestPush } from '../firebase';
import { appVersion, buildId, isTestEnv } from '../config';
import { isAndroid, isIOS, isStandalone } from '../platform';
import { enablePush, pushState, type PushState } from '../push';
import { getThemePref, setThemePref, type ThemePref } from '../theme';
import { installCard } from '../install';
import { h, render, toast } from '../ui';

const PUSH_LABEL: Record<PushState, string> = {
  granted: 'włączone',
  denied: 'zablokowane',
  default: 'niewłączone',
  unsupported: 'nieobsługiwane',
};

function themeSwitch(): HTMLElement {
  const options: [ThemePref, string][] = [
    ['auto', 'Auto'],
    ['light', 'Jasny'],
    ['dark', 'Ciemny'],
  ];
  const wrap = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Motyw' });
  const draw = () => {
    const current = getThemePref();
    wrap.replaceChildren(
      ...options.map(([value, label]) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(current === value),
            onclick: () => {
              setThemePref(value);
              draw();
            },
          },
          label,
        ),
      ),
    );
  };
  draw();
  return wrap;
}

/**
 * Po odmowie przeglądarka nie pozwala zapytać ponownie, a strona nie może otworzyć ustawień telefonu.
 * Pokazujemy więc dokładną ścieżkę dla danego urządzenia.
 */
function deniedHelp(recheck: () => void): HTMLElement {
  const app = isTestEnv ? 'Klub TEST' : 'Klub';
  let steps: string[];
  if (isIOS()) {
    steps = ['Otwórz Ustawienia telefonu.', 'Wybierz Powiadomienia.', `Znajdź ${app} i włącz „Zezwalaj na powiadomienia”.`];
  } else if (isAndroid() && isStandalone()) {
    steps = [
      `Przytrzymaj ikonę ${app} na ekranie głównym.`,
      'Stuknij „Informacje o aplikacji” (ikona ⓘ).',
      'Wybierz Powiadomienia i włącz je.',
    ];
  } else if (isAndroid()) {
    steps = [
      'W Chrome stuknij ⋮ (prawy górny róg) → Ustawienia → Ustawienia witryn → Powiadomienia.',
      'Jeśli przełącznik „Powiadomienia” na górze jest wyłączony – włącz go.',
      `Jeśli ${location.hostname} jest na liście „Zablokowane” – stuknij go i wybierz Zezwalaj.`,
      'Jeśli to nie pomoże: Ustawienia telefonu → Aplikacje → Chrome → Powiadomienia → włącz.',
    ];
  } else {
    steps = ['Kliknij ikonę obok adresu strony (kłódka lub suwaki).', 'Przy Powiadomieniach wybierz Zezwalaj.'];
  }
  return h(
    'div',
    {},
    h('p', {}, 'Powiadomienia są zablokowane. Aplikacja nie może sama otworzyć ustawień, więc trzeba je włączyć ręcznie:'),
    h('ol', { class: 'steps' }, ...steps.map((s) => h('li', {}, s))),
    h('p', { class: 'muted' }, 'Po zmianie ustawień powiadomienia włączą się same. Jeśli nie – stuknij poniżej.'),
    h('button', { type: 'button', class: 'btn btn--secondary', onclick: recheck }, 'Sprawdź ponownie'),
  );
}

/** Globalne „wycisz” (SPEC §3): organizator i funkcje pomijają tę osobę przy wysyłce. */
function muteToggle(uid: string, initial: boolean): HTMLElement {
  const box = h('input', { type: 'checkbox' });
  box.checked = initial;
  box.addEventListener('change', async () => {
    const value = box.checked;
    try {
      await updateDoc(doc(db, 'users', uid), { 'prefs.muted': value });
      toast(value ? 'Powiadomienia wyciszone' : 'Powiadomienia włączone ponownie');
    } catch {
      box.checked = !value;
      toast(navigator.onLine ? 'Nie udało się zapisać.' : 'Brak połączenia z internetem.');
    }
  });
  return h(
    'label',
    { class: 'audience__person mute' },
    box,
    h('span', {}, 'Wycisz wszystkie powiadomienia z Klubu', h('small', { class: 'muted' }, ' – na tym koncie, na wszystkich telefonach')),
  );
}

// Nasłuchiwanie zmian zgody na powiadomienia – jedno na raz, odpinane przy ponownym wejściu na ekran
let listeners: AbortController | null = null;

/** Ustawienia: powiadomienia, motyw, instalacja, informacje o koncie, wylogowanie. */
export async function showSettings(user: User): Promise<void> {
  listeners?.abort();
  listeners = new AbortController();
  const { signal } = listeners;

  const snap = await readDoc(doc(db, 'users', user.uid)).catch(() => null);
  const role = snap?.data()?.role === 'organizer' ? 'organizer' : 'member';
  let push = await pushState();

  const pushStatus = h('b', {}, PUSH_LABEL[push]);
  const pushError = h('p', { class: 'error', role: 'alert' });
  const enableBtn = h('button', { type: 'button', class: 'btn' }, 'Włącz powiadomienia');
  const testBtn = h('button', { type: 'button', class: 'btn btn--secondary' }, 'Wyślij testowe powiadomienie za 10\u00a0s');

  // Po zmianie zgody w ustawieniach rejestrujemy urządzenie bez dodatkowego klikania
  const recheck = async () => {
    if (push !== 'denied') return;
    const now = await pushState();
    if (now === 'default') {
      // blokada zdjęta, ale zgody jeszcze nie ma – pokazujemy przycisk z okienkiem systemowym
      push = now;
      refreshPush();
      return;
    }
    if (now !== 'granted') {
      toast('Nadal zablokowane – sprawdź kroki z instrukcji');
      return;
    }
    push = now;
    refreshPush();
    try {
      await enablePush(user.uid);
      toast('Powiadomienia włączone');
    } catch (err) {
      pushError.textContent = err instanceof Error ? err.message : 'Nie udało się włączyć powiadomień.';
    }
  };
  const help = deniedHelp(() => void recheck());

  const refreshPush = () => {
    pushStatus.textContent = PUSH_LABEL[push];
    enableBtn.hidden = push !== 'default';
    testBtn.hidden = push !== 'granted';
    help.hidden = push !== 'denied';
  };

  // Powrót z ustawień telefonu (aplikacja znika z ekranu) albo zmiana w okienku Chrome (strona cały czas widoczna)
  const silentRecheck = async () => {
    if (push === 'denied' && (await pushState()) !== 'denied') await recheck();
  };
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'visible') void silentRecheck();
    },
    { signal },
  );
  window.addEventListener('focus', () => void silentRecheck(), { signal });
  navigator.permissions
    ?.query({ name: 'notifications' })
    .then((status) => status.addEventListener('change', () => void silentRecheck(), { signal }))
    .catch(() => undefined);

  enableBtn.addEventListener('click', async () => {
    pushError.textContent = '';
    enableBtn.disabled = true;
    try {
      await enablePush(user.uid);
      if ((await pushState()) === 'granted') toast('Powiadomienia włączone');
    } catch (err) {
      pushError.textContent = err instanceof Error ? err.message : 'Nie udało się włączyć powiadomień.';
    }
    push = await pushState();
    enableBtn.disabled = false;
    refreshPush();
  });

  testBtn.addEventListener('click', async () => {
    pushError.textContent = '';
    testBtn.disabled = true;
    toast('Za 10 s przyjdzie powiadomienie. Wyjdź teraz do ekranu głównego, żeby zobaczyć je jako systemowe.');
    try {
      const { data } = await sendTestPush({ delaySec: 10 });
      if (data.sent === 0) toast('Brak urządzeń do wysłania – włącz najpierw powiadomienia');
    } catch {
      pushError.textContent = 'Nie udało się wysłać powiadomienia.';
    } finally {
      testBtn.disabled = false;
    }
  });

  refreshPush();

  render(
    h('a', { class: 'back', href: '#/' }, '← Wyjazdy'),
    h('h1', {}, 'Ustawienia'),
    h(
      'div',
      { class: 'card' },
      h(
        'ul',
        { class: 'status-list' },
        h('li', {}, 'Zalogowano', h('b', {}, user.email ?? '—')),
        h('li', {}, 'Rola', h('b', {}, role === 'organizer' ? 'organizator' : 'uczestnik')),
        h('li', {}, 'Tryb', h('b', {}, isStandalone() ? 'zainstalowana' : 'przeglądarka')),
        h('li', {}, 'Powiadomienia', pushStatus),
        h('li', {}, 'Wersja', h('b', {}, `${appVersion} (${buildId})`)),
      ),
    ),
    installCard(),
    h('div', { class: 'card' }, h('h2', {}, 'Powiadomienia'), pushError, help, enableBtn, testBtn, muteToggle(user.uid, snap?.get('prefs.muted') === true)),
    h('div', { class: 'card' }, h('h2', {}, 'Motyw'), themeSwitch()),
    h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => signOut(auth) }, 'Wyloguj'),
  );
}
