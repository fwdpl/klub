import { collection } from 'firebase/firestore';
import { readDocs } from '../data/read';
import { addPerson, createLoginCode, db, setPersonActive, updatePerson } from '../firebase';
import type { UserDoc } from '../model/types';
import { h, render, toast } from '../ui';

type Person = UserDoc & { uid: string };

function errorMessage(error: unknown, fallback: string): string {
  if (!navigator.onLine) return 'Brak połączenia z internetem.';
  const code = (error as { code?: string }).code ?? '';
  const message = (error as { message?: string }).message;
  // komunikaty funkcji serwerowych są po polsku i bez danych wrażliwych
  if (/already-exists|invalid-argument|failed-precondition|not-found/.test(code) && message) return message;
  return fallback;
}

function codeBox(code: string, expiresAt: string): HTMLElement {
  const until = new Date(expiresAt).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  return h(
    'div',
    { class: 'inline-form' },
    h('p', { class: 'code' }, code),
    h('p', { class: 'muted' }, `Działa raz, ważny do ${until}. Przekaż osobiście lub SMS-em. Poprzednie niewykorzystane kody tej osoby przestały działać.`),
    h(
      'button',
      { type: 'button', class: 'btn btn--secondary', onclick: () => navigator.clipboard?.writeText(code).then(() => toast('Skopiowano kod')) },
      'Kopiuj kod',
    ),
  );
}

function personRow(person: Person, myUid: string, reload: () => Promise<void>): HTMLElement {
  const extra = h('div');
  const error = h('p', { class: 'error', role: 'alert' });
  const isMe = person.uid === myUid;

  const busy = async (button: HTMLButtonElement, action: () => Promise<void>, fallback: string) => {
    error.textContent = '';
    button.disabled = true;
    try {
      await action();
    } catch (err) {
      error.textContent = errorMessage(err, fallback);
    } finally {
      button.disabled = false;
    }
  };

  const codeBtn = h('button', { type: 'button', disabled: !person.active }, 'Kod');
  codeBtn.addEventListener('click', () =>
    busy(
      codeBtn,
      async () => {
        const { data } = await createLoginCode({ email: person.email });
        extra.replaceChildren(codeBox(data.code, data.expiresAt));
      },
      'Nie udało się wygenerować kodu.',
    ),
  );

  const renameBtn = h('button', { type: 'button' }, 'Imię');
  renameBtn.addEventListener('click', () => {
    const input = h('input', { type: 'text', value: person.displayName, maxlength: '40', 'aria-label': 'Nowe imię' });
    const save = h('button', { type: 'submit', class: 'btn' }, 'Zapisz imię');
    extra.replaceChildren(
      h(
        'form',
        {
          class: 'inline-form',
          onsubmit: (e: Event) => {
            e.preventDefault();
            void busy(
              save,
              async () => {
                await updatePerson({ uid: person.uid, displayName: input.value });
                toast('Zapisano imię');
                await reload();
              },
              'Nie udało się zmienić imienia.',
            );
          },
        },
        input,
        save,
      ),
    );
    input.focus();
  });

  const toggleBtn = h('button', { type: 'button', disabled: isMe }, person.active ? 'Wyłącz' : 'Włącz');
  toggleBtn.addEventListener('click', () => {
    const question = person.active
      ? `Wyłączyć: ${person.displayName}? Ta osoba od razu straci dostęp i zostanie wylogowana na wszystkich telefonach.`
      : `Włączyć: ${person.displayName}? Do zalogowania potrzebny będzie nowy kod.`;
    if (!confirm(question)) return;
    void busy(
      toggleBtn,
      async () => {
        await setPersonActive({ uid: person.uid, active: !person.active });
        await reload();
      },
      'Nie udało się zmienić dostępu.',
    );
  });

  return h(
    'div',
    { class: `person${person.active ? '' : ' person--inactive'}` },
    h(
      'div',
      { class: 'person__head' },
      h('span', { class: 'person__name' }, person.displayName),
      person.role === 'organizer'
        ? h('span', { class: 'badge badge--accent' }, 'organizator')
        : !person.active && h('span', { class: 'badge' }, 'wyłączona'),
    ),
    h('div', { class: 'person__email' }, person.email),
    h('div', { class: 'actions' }, codeBtn, renameBtn, toggleBtn),
    error,
    extra,
  );
}

function addForm(onAdded: () => Promise<void>): HTMLElement {
  const email = h('input', { type: 'email', autocomplete: 'off', inputmode: 'email', required: true });
  const name = h('input', { type: 'text', autocomplete: 'off', maxlength: '40', required: true });
  const error = h('p', { class: 'error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn' }, 'Dodaj osobę');
  return h(
    'form',
    {
      class: 'card',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        error.textContent = '';
        submit.disabled = true;
        try {
          await addPerson({ email: email.value, displayName: name.value });
          toast(`Dodano: ${name.value.trim()}. Teraz wygeneruj kod logowania.`);
          email.value = '';
          name.value = '';
          await onAdded();
        } catch (err) {
          error.textContent = errorMessage(err, 'Nie udało się dodać osoby.');
        } finally {
          submit.disabled = false;
        }
      },
    },
    h('h2', {}, 'Dodaj osobę'),
    h('label', { class: 'field' }, h('span', {}, 'Mail'), email),
    h('label', { class: 'field' }, h('span', {}, 'Imię (widoczne dla innych przy wyjazdach)'), name),
    error,
    submit,
  );
}

/** Panel organizatora: lista osób, które mogą się logować (SPEC §3). */
export async function showPeople(myUid: string): Promise<void> {
  const list = h('div', { class: 'card' });
  const counter = h('h2', {});

  const reload = async () => {
    const snap = await readDocs(collection(db, 'users'));
    const people = snap.docs
      .map((d) => ({ uid: d.id, ...(d.data() as UserDoc) }))
      // aktywni najpierw, potem alfabetycznie
      .sort((a, b) => Number(b.active) - Number(a.active) || a.displayName.localeCompare(b.displayName, 'pl'));
    const active = people.filter((p) => p.active).length;
    counter.textContent = `Osoby na liście: ${active}${people.length > active ? ` (+${people.length - active} wyłączone)` : ''}`;
    list.replaceChildren(counter, ...people.map((p) => personRow(p, myUid, reload)));
  };

  render(
    h('a', { class: 'back', href: '#/' }, '← Klub'),
    h('h1', {}, 'Osoby'),
    h('p', { class: 'muted' }, 'Logować się mogą tylko osoby z tej listy. Kod logowania działa raz i jest ważny 48 godzin.'),
    addForm(reload),
    list,
  );

  try {
    await reload();
  } catch {
    list.replaceChildren(h('p', { class: 'error' }, 'Nie udało się wczytać listy. Sprawdź połączenie.'));
  }
}
