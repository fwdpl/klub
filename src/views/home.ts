import type { User } from 'firebase/auth';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, createLoginCode, db, sendTestPush } from '../firebase';
import { appVersion, isTestEnv } from '../config';
import { isAndroid, isIOS, isStandalone } from '../platform';
import { enablePush, pushState, type PushState } from '../push';
import { getThemePref, setThemePref, type ThemePref } from '../theme';
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

function organizerCard(): HTMLElement {
  const email = h('input', { type: 'email', autocomplete: 'off', inputmode: 'email' });
  const result = h('div');
  const error = h('p', { class: 'error', role: 'alert' });
  const button = h('button', { type: 'submit', class: 'btn' }, 'Wygeneruj kod');
  return h(
    'form',
    {
      class: 'card',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        error.textContent = '';
        result.replaceChildren();
        button.disabled = true;
        try {
          const { data } = await createLoginCode({ email: email.value });
          const until = new Date(data.expiresAt).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
          result.replaceChildren(
            h('p', { class: 'code' }, data.code),
            h('p', { class: 'muted' }, `Kod działa raz, ważny do ${until}. Przekaż go osobiście lub SMS-em. Poprzednie niewykorzystane kody tej osoby przestały działać.`),
            h(
              'button',
              { type: 'button', class: 'btn btn--secondary', onclick: () => navigator.clipboard?.writeText(data.code).then(() => toast('Skopiowano kod')) },
              'Kopiuj kod',
            ),
          );
        } catch {
          error.textContent = navigator.onLine ? 'Nie udało się wygenerować kodu. Sprawdź mail.' : 'Brak połączenia z internetem.';
        } finally {
          button.disabled = false;
        }
      },
    },
    h('h2', {}, 'Kod logowania dla uczestnika'),
    h('label', { class: 'field' }, h('span', {}, 'Mail uczestnika'), email),
    error,
    button,
    result,
  );
}

/**
 * Po odmowie przeglądarka nie pozwala zapytać ponownie, a strona nie może otworzyć ustawień telefonu.
 * Pokazujemy więc dokładną ścieżkę dla danego urządzenia.
 */
function deniedHelp(): HTMLElement {
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
      'Stuknij ikonę po lewej stronie adresu strony (na górze ekranu).',
      'Wybierz Uprawnienia, potem Powiadomienia, i ustaw Zezwalaj.',
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
    h('p', { class: 'muted' }, 'Po powrocie do aplikacji powiadomienia włączą się same.'),
  );
}

export async function showHome(user: User): Promise<void> {
  const snap = await getDoc(doc(db, 'users', user.uid)).catch(() => null);
  const role = snap?.data()?.role === 'organizer' ? 'organizer' : 'member';
  let push = await pushState();

  const pushStatus = h('b', {}, PUSH_LABEL[push]);
  const pushError = h('p', { class: 'error', role: 'alert' });
  const enableBtn = h('button', { type: 'button', class: 'btn' }, 'Włącz powiadomienia');
  const testBtn = h('button', { type: 'button', class: 'btn btn--secondary' }, 'Wyślij testowe powiadomienie za 10 s');

  const help = deniedHelp();

  const refreshPush = () => {
    pushStatus.textContent = PUSH_LABEL[push];
    enableBtn.hidden = push !== 'default';
    testBtn.hidden = push !== 'granted';
    help.hidden = push !== 'denied';
  };

  // Powrót z ustawień telefonu: jeśli zgoda została włączona, rejestrujemy urządzenie bez dodatkowego klikania
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || push !== 'denied') return;
    const now = await pushState();
    if (now !== 'granted') return;
    try {
      await enablePush(user.uid);
      toast('Powiadomienia włączone');
    } catch (err) {
      pushError.textContent = err instanceof Error ? err.message : 'Nie udało się włączyć powiadomień.';
    }
    push = now;
    refreshPush();
  });

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
    h('h1', {}, isTestEnv ? 'Klub TEST' : 'Klub'),
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
        h('li', {}, 'Wersja', h('b', {}, appVersion)),
      ),
    ),
    h('div', { class: 'card' }, h('h2', {}, 'Powiadomienia'), pushError, help, enableBtn, testBtn),
    ...(role === 'organizer' ? [organizerCard()] : []),
    h('div', { class: 'card' }, h('h2', {}, 'Motyw'), themeSwitch()),
    h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => signOut(auth) }, 'Wyloguj'),
  );
}
