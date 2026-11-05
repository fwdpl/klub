import { deleteDestination, interestedNames, listDestinations, myInterest, saveDestination, setInterest, sortDestinations, type Destination } from '../data/destinations';
import { plural } from '../text';
import { h, present, render, toast } from '../ui';

// Kierunki do rozważenia pod globusem (v2, decyzja Jacka z 5.11.2026 – zamiast głosowania nad terminem):
// organizator wpisuje miejsca, które chce odwiedzić; uczestnicy zaznaczają, co ich w ogóle interesuje.
// Sortowanie alfabetyczne albo wg potencjalnego terminu. Osoba widzi tylko swoje zaznaczenia, organizator – wszystkich.

interface Me {
  uid: string;
  displayName: string;
  isOrganizer: boolean;
}

const SORT_KEY = 'klub.destSort';
const savedSort = (): 'name' | 'date' => {
  try {
    return localStorage.getItem(SORT_KEY) === 'date' ? 'date' : 'name';
  } catch {
    return 'name';
  }
};

export async function showDestinations(me: Me): Promise<void> {
  const body = h('div', {}, h('p', { class: 'muted' }, 'Wczytuję…'));
  render(
    h('a', { class: 'back', href: '#/' }, '← Wyjazdy'),
    h('h1', {}, 'Kierunki'),
    h(
      'p',
      { class: 'muted' },
      me.isOrganizer
        ? 'Miejsca, które chcesz odwiedzić. Uczestnicy zaznaczają, co ich interesuje – Ty widzisz wszystkich.'
        : 'Miejsca, które organizator rozważa. Zaznacz te, które Cię interesują – widzisz tylko swoje zaznaczenia.',
    ),
    body,
  );

  let list: Destination[] = [];
  let sort = savedSort();
  let editing: Destination | 'new' | null = null;
  const mine = new Map<string, boolean>();
  const names = new Map<string, string[]>();

  const load = async () => {
    list = await listDestinations().catch(() => list);
    await Promise.all(
      list.map(async (d) => {
        if (me.isOrganizer) names.set(d.id, await interestedNames(d.id).catch(() => []));
        else mine.set(d.id, await myInterest(d.id, me.uid));
      }),
    );
    draw();
  };

  const form = (d: Destination | null): HTMLElement => {
    const name = h('input', { type: 'text', maxlength: '80', placeholder: 'Np. Patagonia', 'aria-label': 'Kierunek', value: d?.name ?? '' });
    const dates = h('input', { type: 'text', maxlength: '60', placeholder: 'Kiedy, np. jesień 2027', 'aria-label': 'Kiedy (opis)', value: d?.dates ?? '' });
    const month = h('input', { type: 'month', 'aria-label': 'Miesiąc do sortowania', value: d?.sortDate ?? '' });
    const note = h('input', { type: 'text', maxlength: '200', placeholder: 'Notatka (opcjonalnie)', 'aria-label': 'Notatka', value: d?.note ?? '' });
    const save = h('button', { type: 'button', class: 'btn' }, d ? 'Zapisz' : 'Dodaj');
    save.addEventListener('click', async () => {
      if (!name.value.trim()) return toast('Wpisz nazwę kierunku.');
      save.disabled = true;
      try {
        await saveDestination(d?.id ?? null, {
          name: name.value.trim(),
          dates: dates.value.trim() || undefined,
          sortDate: month.value || undefined,
          note: note.value.trim() || undefined,
        });
        editing = null;
        await load();
      } catch {
        toast(navigator.onLine ? 'Nie udało się zapisać.' : 'Brak internetu.');
        save.disabled = false;
      }
    });
    return h(
      'div',
      { class: 'card card--inner dest-form' },
      h('h3', {}, d ? 'Popraw kierunek' : 'Nowy kierunek'),
      name,
      dates,
      h('label', { class: 'field' }, h('span', {}, 'Miesiąc (do sortowania wg terminu)'), month),
      note,
      h('div', { class: 'actions actions--row' }, save, h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => ((editing = null), draw()) }, 'Anuluj')),
      ...present(
        d &&
          h(
            'button',
            {
              type: 'button',
              class: 'link-btn link-btn--danger',
              onclick: async () => {
                if (!confirm(`Usunąć „${d.name}”?`)) return;
                await deleteDestination(d.id).catch(() => toast('Nie udało się usunąć.'));
                editing = null;
                await load();
              },
            },
            'Usuń kierunek',
          ),
      ),
    );
  };

  const row = (d: Destination): HTMLElement => {
    const head = h('div', { class: 'dest__head' }, h('span', { class: 'dest__name' }, d.name), d.dates ? h('span', { class: 'muted dest__dates' }, d.dates) : '');
    if (me.isOrganizer) {
      const who = names.get(d.id) ?? [];
      return h(
        'div',
        { class: 'dest' },
        head,
        d.note && h('p', { class: 'muted' }, d.note),
        h('p', { class: 'dest__who' }, who.length ? `⭐ ${who.length}: ${who.join(', ')}` : 'Nikt jeszcze nie zaznaczył.'),
        h('button', { type: 'button', class: 'link-btn', onclick: () => ((editing = d), draw()) }, 'Popraw'),
      );
    }
    const on = mine.get(d.id) === true;
    const toggle = h('button', { type: 'button', class: `chip-btn${on ? ' chip-btn--on' : ''}`, 'aria-pressed': String(on) }, on ? '⭐ Interesuje mnie' : '☆ Interesuje mnie');
    toggle.addEventListener('click', () => {
      mine.set(d.id, !on);
      draw();
      setInterest(d.id, me, !on).catch(() => {
        mine.set(d.id, on);
        draw();
        toast(navigator.onLine ? 'Nie udało się zapisać.' : 'Brak internetu – spróbuj po połączeniu.');
      });
    });
    return h('div', { class: 'dest' }, head, d.note && h('p', { class: 'muted' }, d.note), toggle);
  };

  const draw = () => {
    const sortBtn = (value: 'name' | 'date', label: string) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(sort === value),
          onclick: () => {
            sort = value;
            try {
              localStorage.setItem(SORT_KEY, value);
            } catch {
              // bez pamięci – sortowanie wraca do alfabetycznego
            }
            draw();
          },
        },
        label,
      );
    const count = me.isOrganizer ? null : [...mine.values()].filter(Boolean).length;
    body.replaceChildren(
      ...present(
        me.isOrganizer && (editing === 'new' ? form(null) : h('button', { type: 'button', class: 'btn', onclick: () => ((editing = 'new'), draw()) }, '+ Dodaj kierunek')),
        list.length > 1 &&
          h('div', { class: 'segmented segmented--2 dest-sort', role: 'group', 'aria-label': 'Sortowanie' }, sortBtn('name', 'A–Z'), sortBtn('date', 'Wg terminu')),
        count !== null && list.length > 0 && h('p', { class: 'muted' }, `Zaznaczone: ${count} z ${plural(list.length, 'kierunku', 'kierunków', 'kierunków')}.`),
        h(
          'div',
          { class: 'card' },
          ...(list.length
            ? sortDestinations(list, sort).map((d) => (editing !== null && editing !== 'new' && editing.id === d.id ? form(d) : row(d)))
            : [h('p', { class: 'muted' }, me.isOrganizer ? 'Dodaj pierwszy kierunek.' : 'Organizator nie dodał jeszcze kierunków.')]),
        ),
      ),
    );
  };

  await load();
}
