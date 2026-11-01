import { signInWithCustomToken } from 'firebase/auth';
import { auth, redeemLoginCode } from '../firebase';
import { isTestEnv } from '../config';
import { installCard } from '../install';
import { h, render } from '../ui';

function messageFor(error: unknown): string {
  const code = (error as { code?: string }).code ?? '';
  if (code.endsWith('resource-exhausted')) return 'Za dużo prób. Spróbuj ponownie za 15 minut.';
  if (code.endsWith('permission-denied') || code.endsWith('not-found')) return 'Nieprawidłowy mail lub kod.';
  if (code.endsWith('invalid-argument')) {
    const field = (error as { details?: { field?: string } }).details?.field;
    return field === 'code' ? 'Kod musi mieć co najmniej 6 znaków.' : 'Sprawdź adres mailowy.';
  }
  if (!navigator.onLine || code.endsWith('unavailable')) return 'Brak połączenia z internetem.';
  return 'Nie udało się zalogować. Spróbuj ponownie.';
}

export function showLogin(): void {
  const email = h('input', { type: 'email', name: 'email', autocomplete: 'email', inputmode: 'email', required: true });
  const code = h('input', {
    type: 'text',
    name: 'code',
    autocomplete: 'one-time-code',
    autocapitalize: 'characters',
    spellcheck: 'false',
    required: true,
  });
  const error = h('p', { class: 'error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn' }, 'Zaloguj');

  const form = h(
    'form',
    {
      class: 'card',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        error.textContent = '';
        submit.disabled = true;
        submit.textContent = 'Loguję…';
        try {
          const { data } = await redeemLoginCode({ email: email.value, code: code.value });
          await signInWithCustomToken(auth, data.token);
          // dalej prowadzi onAuthStateChanged w main.ts
        } catch (err) {
          error.textContent = messageFor(err);
          submit.disabled = false;
          submit.textContent = 'Zaloguj';
        }
      },
    },
    h('h2', {}, 'Logowanie'),
    h('p', { class: 'muted' }, 'Wpisz swój mail i jednorazowy kod od Jacka.'),
    h('label', { class: 'field' }, h('span', {}, 'Mail'), email),
    h('label', { class: 'field' }, h('span', {}, 'Kod'), code),
    error,
    submit,
  );

  render(h('h1', {}, isTestEnv ? 'Klub TEST' : 'Klub'), form, installCard());
}
