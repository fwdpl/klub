import qrcode from 'qrcode-generator';
import { totpCheck, totpConfirm, totpDisable, totpSetup } from '../firebase';
import { h, present, toast } from '../ui';

// Logowanie awaryjne organizatora przez Google Authenticator (decyzja Jacka z 16.11.2026):
// gdy aplikacja wyloguje na wszystkich urządzeniach, wystarczy mail + 6 cyfr z Authenticatora – bez konsoli Firebase.

const groups = (s: string) => s.replace(/(.{4})/g, '$1 ').trim();

// Parowanie w toku – zapamiętane na urządzeniu, żeby po powrocie z Authenticatora albo odświeżeniu
// aplikacja sama wróciła do pola „wpisz 6 cyfr” (serwer przez 30 min oddaje ten sam klucz).
const PENDING_KEY = 'klub.totpPendingAt';
const PENDING_MS = 30 * 60 * 1000;
const pendingRecently = () => {
  try {
    return Date.now() - Number(localStorage.getItem(PENDING_KEY) ?? 0) < PENDING_MS;
  } catch {
    return false;
  }
};
const setPending = (on: boolean) => {
  try {
    if (on) localStorage.setItem(PENDING_KEY, String(Date.now()));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // bez pamięci urządzenia – po odświeżeniu trzeba stuknąć „Połącz” (ten sam klucz)
  }
};

export function authenticatorCard(enrolledAtStart: boolean): HTMLElement {
  const card = h('div', { class: 'card' });
  let enrolled = enrolledAtStart;

  const intro = () =>
    h(
      'p',
      { class: 'muted' },
      'Gdy aplikacja wyloguje Cię na wszystkich urządzeniach (np. na wyjeździe), zalogujesz się mailem i 6 cyframi z aplikacji Google Authenticator – bez konsoli Firebase.',
    );

  const setupView = async (button: HTMLButtonElement, fresh: boolean) => {
    button.disabled = true;
    try {
      const { data } = await totpSetup({ fresh });
      if (!data.reused) setPending(true);
      else if (!pendingRecently()) setPending(true);
      const qr = qrcode(0, 'M');
      qr.addData(data.url);
      qr.make();
      const qrBox = h('div', { class: 'totp-qr', 'aria-label': 'Kod QR do zeskanowania w Google Authenticator' });
      qrBox.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2 }); // generowany lokalnie z naszego linku
      const code = h('input', { type: 'text', inputmode: 'numeric', maxlength: '7', placeholder: '123456', 'aria-label': 'Kod z Authenticatora', autocomplete: 'one-time-code' });
      const error = h('p', { class: 'error', role: 'alert' });
      const confirm = h('button', { type: 'button', class: 'btn' }, 'Potwierdź');
      confirm.addEventListener('click', async () => {
        error.textContent = '';
        confirm.disabled = true;
        try {
          await totpConfirm({ code: code.value });
          enrolled = true;
          setPending(false);
          toast('Google Authenticator połączony.');
          draw();
        } catch (e) {
          error.textContent = (e as { message?: string }).message?.includes('Kod się nie zgadza')
            ? 'Kod się nie zgadza – wpisz aktualny (zmienia się co 30 s).'
            : 'Nie udało się. Spróbuj ponownie.';
          confirm.disabled = false;
        }
      });
      card.replaceChildren(
        ...present(
          h('h2', {}, 'Google Authenticator'),
          h(
            'ol',
            { class: 'steps' },
            h(
              'li',
              {},
              'Na tym telefonie: ',
              h('a', { href: data.url }, 'otwórz w Authenticatorze'),
              ' – albo zeskanuj kod QR innym urządzeniem (telefon zapasowy, tablet), albo przepisz klucz poniżej. Dodaj na wszystkich urządzeniach.',
            ),
            h(
              'li',
              {},
              'Jeśli Klub przeładuje się po powrocie z Authenticatora – stuknij „Połącz” jeszcze raz: przez 30 minut pokaże ten sam kod (nic nie trzeba dodawać od nowa).',
            ),
            h('li', {}, h('b', {}, 'Wróć tutaj i wpisz 6 cyfr'), ', które pokazuje Authenticator, potem „Potwierdź”. Bez tego kroku połączenie nie działa.'),
          ),
          qrBox,
          data.reused && h('p', { class: 'muted' }, 'To ten sam klucz co przed chwilą – wpis w Authenticatorze jest aktualny.'),
          h('p', { class: 'muted totp-key' }, 'Klucz do wpisania ręcznie: ', h('b', {}, groups(data.secret))),
          code,
          error,
          h('div', { class: 'actions actions--row' }, confirm, h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => (setPending(false), draw()) }, 'Anuluj')),
        ),
      );
      code.focus();
    } catch {
      toast(navigator.onLine ? 'Nie udało się przygotować kodu.' : 'Potrzebny jest internet.');
      button.disabled = false;
    }
  };

  const draw = () => {
    const connect = h('button', { type: 'button', class: enrolled ? 'btn btn--secondary' : 'btn' }, enrolled ? 'Połącz ponownie (nowy klucz)' : 'Połącz z Google Authenticator');
    connect.addEventListener('click', () => {
      if (enrolled && !confirm('Nowy klucz zastąpi obecny – trzeba będzie dodać go jeszcze raz na wszystkich urządzeniach. Kontynuować?')) return;
      void setupView(connect, enrolled);
    });
    const disable = h('button', { type: 'button', class: 'link-btn link-btn--danger' }, 'Odłącz Authenticator');
    disable.addEventListener('click', async () => {
      if (!confirm('Odłączyć? Kody z Authenticatora przestaną działać przy logowaniu.')) return;
      try {
        await totpDisable({});
        enrolled = false;
        draw();
      } catch {
        toast('Nie udało się.');
      }
    });
    // sprawdzenie kodu bez wylogowania – czy Authenticator na danym urządzeniu ma właściwy klucz
    const checkInput = h('input', { type: 'text', inputmode: 'numeric', maxlength: '7', placeholder: '123456', 'aria-label': 'Kod do sprawdzenia' });
    const checkResult = h('p', { class: 'muted', role: 'status' });
    const checkBtn = h('button', { type: 'button', class: 'btn btn--secondary' }, 'Sprawdź kod');
    checkBtn.addEventListener('click', async () => {
      checkBtn.disabled = true;
      try {
        const { data } = await totpCheck({ code: checkInput.value });
        checkResult.textContent = data.ok
          ? '✓ Kod działa – tym urządzeniem zalogujesz się w razie potrzeby.'
          : '✗ Kod nie pasuje. Poczekaj na następny kod; jeśli dalej nie pasuje – to urządzenie ma inny klucz (usuń wpis „Klub” i dodaj ponownie po „Połącz ponownie”).';
        checkInput.value = '';
      } catch {
        checkResult.textContent = navigator.onLine ? 'Nie udało się sprawdzić.' : 'Potrzebny jest internet.';
      }
      checkBtn.disabled = false;
    });
    card.replaceChildren(
      ...present(
        h('h2', {}, 'Logowanie awaryjne'),
        intro(),
        enrolled && h('p', {}, h('b', {}, 'Google Authenticator: połączony ✓. '), 'Przy logowaniu wpisz swój mail i 6 cyfr z Authenticatora w polu kodu.'),
        enrolled && h('p', { class: 'field-label' }, 'Sprawdź kod z każdego urządzenia (bez wylogowania):'),
        enrolled && h('div', { class: 'two-col totp-check' }, checkInput, checkBtn),
        enrolled && checkResult,
        connect,
        enrolled && disable,
      ),
    );
  };

  draw();
  // wróciliśmy z Authenticatora / odświeżenie w trakcie parowania → od razu pole na kod (ten sam klucz)
  if (!enrolled && pendingRecently()) {
    const resume = card.querySelector('button.btn') as HTMLButtonElement | null;
    if (resume) void setupView(resume, false);
  }
  return card;
}
