import qrcode from 'qrcode-generator';
import { totpConfirm, totpDisable, totpSetup } from '../firebase';
import { h, present, toast } from '../ui';

// Logowanie awaryjne organizatora przez Google Authenticator (decyzja Jacka z 16.11.2026):
// gdy aplikacja wyloguje na wszystkich urządzeniach, wystarczy mail + 6 cyfr z Authenticatora – bez konsoli Firebase.

const groups = (s: string) => s.replace(/(.{4})/g, '$1 ').trim();

export function authenticatorCard(enrolledAtStart: boolean): HTMLElement {
  const card = h('div', { class: 'card' });
  let enrolled = enrolledAtStart;

  const intro = () =>
    h(
      'p',
      { class: 'muted' },
      'Gdy aplikacja wyloguje Cię na wszystkich urządzeniach (np. na wyjeździe), zalogujesz się mailem i 6 cyframi z aplikacji Google Authenticator – bez konsoli Firebase.',
    );

  const setupView = async (button: HTMLButtonElement) => {
    button.disabled = true;
    try {
      const { data } = await totpSetup({});
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
        h('h2', {}, 'Google Authenticator'),
        h(
          'ol',
          { class: 'steps' },
          h(
            'li',
            {},
            'Na tym telefonie: ',
            h('a', { href: data.url }, 'otwórz w Authenticatorze'),
            ' – albo zeskanuj kod QR innym urządzeniem (telefon zapasowy, tablet). Dodaj na wszystkich urządzeniach teraz – kod QR pokazuje się tylko raz.',
          ),
          h('li', {}, 'Wpisz poniżej 6 cyfr, które pokazuje Authenticator, i stuknij „Potwierdź”.'),
        ),
        qrBox,
        h('p', { class: 'muted totp-key' }, 'Klucz do wpisania ręcznie: ', h('b', {}, groups(data.secret))),
        code,
        error,
        h('div', { class: 'actions actions--row' }, confirm, h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => draw() }, 'Anuluj')),
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
      void setupView(connect);
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
    card.replaceChildren(
      ...present(
        h('h2', {}, 'Logowanie awaryjne'),
        intro(),
        enrolled && h('p', {}, h('b', {}, 'Google Authenticator: połączony ✓. '), 'Przy logowaniu wpisz swój mail i 6 cyfr z Authenticatora w polu kodu.'),
        connect,
        enrolled && disable,
      ),
    );
  };

  draw();
  return card;
}
