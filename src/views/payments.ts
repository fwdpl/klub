import { getMyPayments, listPayments, savePayments } from '../data/expenses';
import { newId, type Trip } from '../data/trips';
import { formatMoney, parseAmount } from '../expenses/expenses';
import { nextDue, shortDate, sumText, summary, unpaid, type PaymentItem, type PaymentsDoc } from '../expenses/payments';
import { todayIn } from '../plan/time';
import { h, present, toast } from '../ui';
import { fold } from './fold';
import type { Person } from './expenses';

// Wpłaty na wyjazd (v2, decyzja Jacka z 5.11.2026): osobno od wydatków.
// Organizator wpisuje każdej osobie raty (lot, hotel…) z terminem i odhacza wpłaty; osoba widzi tylko swoje.

function itemLine(i: PaymentItem, today: string): HTMLElement {
  const state = i.paidOn
    ? h('span', { class: 'pay__state pay__state--ok' }, `✓ wpłacone ${shortDate(i.paidOn)}`)
    : i.due
      ? h('span', { class: `pay__state${i.due < today ? ' pay__state--late' : ''}` }, `${i.due < today ? 'po terminie – ' : 'do '}${shortDate(i.due)}`)
      : h('span', { class: 'pay__state' }, 'do wpłaty');
  return h('div', { class: 'pay__line' }, h('span', { class: 'pay__title' }, i.title), h('b', {}, formatMoney(i.amount, i.currency)), state);
}

/** Uczestnik: moje wpłaty (tylko do odczytu). */
export function myPaymentsCard(trip: Trip, uid: string): HTMLElement {
  const body = h('div', {}, h('p', { class: 'muted' }, 'Wczytuję…'));
  const card = fold({ id: `${trip.id}:payments`, title: 'Moje wpłaty', open: true }, body);
  const meta = card.querySelector('.fold__meta') as HTMLElement;
  const today = todayIn(trip.timezone);
  void getMyPayments(trip.id, uid)
    .catch(() => null)
    .then((doc) => {
      const items = doc?.items ?? [];
      if (!items.length) {
        body.replaceChildren(h('p', { class: 'muted' }, 'Organizator nie wpisał jeszcze wpłat.'));
        return;
      }
      const open = unpaid(items);
      const next = nextDue(items, today);
      meta.textContent = open.length ? sumText(open) : '✓';
      body.replaceChildren(
        ...present(
          h('p', {}, open.length ? h('span', {}, h('b', {}, 'Do wpłaty: '), sumText(open)) : h('b', {}, 'Wszystko wpłacone ✓')),
          next && h('p', { class: next.overdue ? 'error' : 'muted' }, `${next.overdue ? 'Minął termin' : 'Najbliższy termin'}: ${next.item.title} – ${shortDate(next.item.due!)}`),
          ...items.map((i) => itemLine(i, today)),
        ),
      );
    });
  return card;
}

/** Organizator: wpisywanie rat i odhaczanie wpłat wszystkich uczestników. */
export function organizerPaymentsCard(trip: Trip, people: Person[]): HTMLElement {
  const body = h('div', {}, h('p', { class: 'muted' }, 'Wczytuję…'));
  const card = fold({ id: `${trip.id}:payments-org`, title: 'Wpłaty uczestników', open: true }, body);
  const meta = card.querySelector('.fold__meta') as HTMLElement;
  const today = todayIn(trip.timezone);
  let docs = new Map<string, PaymentsDoc>();
  let adding = false;
  let editingItem: string | null = null; // `${uid}:${itemId}`

  const docOf = (p: Person): PaymentsDoc => docs.get(p.uid) ?? { name: p.displayName, items: [] };

  const save = async (uid: string, next: PaymentsDoc) => {
    const previous = docs.get(uid);
    docs.set(uid, next);
    draw();
    try {
      await savePayments(trip.id, uid, next);
    } catch {
      if (previous) docs.set(uid, previous);
      else docs.delete(uid);
      draw();
      toast(navigator.onLine ? 'Nie udało się zapisać.' : 'Brak internetu – zmiana nie została zapisana.');
    }
  };

  const addForm = (): HTMLElement => {
    const title = h('input', {
      type: 'text',
      maxlength: '80',
      placeholder: 'Za co, np. Lot, Hotel – zaliczka',
      'aria-label': 'Za co',
    });
    const amount = h('input', {
      type: 'text',
      inputmode: 'decimal',
      placeholder: 'Kwota na osobę',
      'aria-label': 'Kwota na osobę',
    });
    const currency = h('select', { 'aria-label': 'Waluta' }, ...['PLN', 'EUR', 'USD'].map((c) => h('option', { value: c }, c)));
    const due = h('input', { type: 'date', 'aria-label': 'Termin wpłaty' });
    const chosen = new Set(people.map((p) => p.uid));
    const error = h('p', { class: 'error', role: 'alert' });
    const ok = h('button', { type: 'button', class: 'btn' }, 'Dodaj');
    ok.addEventListener('click', async () => {
      const value = parseAmount(amount.value);
      error.textContent = '';
      if (!title.value.trim()) return void (error.textContent = 'Wpisz, za co.');
      if (!value) return void (error.textContent = 'Wpisz kwotę, np. 3200.');
      if (!chosen.size) return void (error.textContent = 'Zaznacz osoby.');
      adding = false;
      for (const p of people.filter((x) => chosen.has(x.uid))) {
        const d = docOf(p);
        const item: PaymentItem = {
          id: newId(),
          title: title.value.trim(),
          amount: value,
          currency: currency.value,
          ...(due.value ? { due: due.value } : {}),
        };
        void save(p.uid, { name: p.displayName, items: [...d.items, item] });
      }
    });
    return h(
      'div',
      { class: 'card card--inner' },
      h('h3', {}, 'Nowa wpłata'),
      title,
      h('div', { class: 'two-col expense-amount' }, amount, currency),
      h('label', { class: 'field' }, h('span', {}, 'Termin (opcjonalnie)'), due),
      h('p', { class: 'field-label' }, 'Dla kogo'),
      ...people.map((p) => {
        const box = h('input', { type: 'checkbox' });
        box.checked = true;
        box.addEventListener('change', () => (box.checked ? chosen.add(p.uid) : chosen.delete(p.uid)));
        return h('label', { class: 'check expense-split__row' }, box, h('span', {}, p.displayName));
      }),
      error,
      h(
        'div',
        { class: 'actions actions--row' },
        ok,
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--secondary',
            onclick: () => ((adding = false), draw()),
          },
          'Anuluj',
        ),
      ),
    );
  };

  const editForm = (p: Person, i: PaymentItem): HTMLElement => {
    const title = h('input', {
      type: 'text',
      maxlength: '80',
      value: i.title,
      'aria-label': 'Za co',
    });
    const amount = h('input', {
      type: 'text',
      inputmode: 'decimal',
      value: String(i.amount).replace('.', ','),
      'aria-label': 'Kwota',
    });
    const due = h('input', {
      type: 'date',
      value: i.due ?? '',
      'aria-label': 'Termin',
    });
    const ok = h('button', { type: 'button', class: 'chip-btn' }, 'Zapisz');
    ok.addEventListener('click', () => {
      const value = parseAmount(amount.value);
      if (!title.value.trim() || !value) return toast('Wpisz nazwę i kwotę.');
      editingItem = null;
      const d = docOf(p);
      const { due: _old, ...rest } = i;
      void save(p.uid, {
        ...d,
        items: d.items.map((x) =>
          x.id === i.id
            ? {
                ...rest,
                title: title.value.trim(),
                amount: value,
                ...(due.value ? { due: due.value } : {}),
              }
            : x,
        ),
      });
    });
    const del = h('button', { type: 'button', class: 'chip-btn' }, 'Usuń');
    del.addEventListener('click', () => {
      if (!confirm(`Usunąć „${i.title}” u ${p.displayName}?`)) return;
      editingItem = null;
      const d = docOf(p);
      void save(p.uid, { ...d, items: d.items.filter((x) => x.id !== i.id) });
    });
    return h(
      'div',
      { class: 'pay__edit' },
      title,
      h('div', { class: 'two-col' }, amount, due),
      h(
        'div',
        { class: 'actions actions--row' },
        ok,
        del,
        h(
          'button',
          {
            type: 'button',
            class: 'chip-btn',
            onclick: () => ((editingItem = null), draw()),
          },
          'Anuluj',
        ),
      ),
    );
  };

  const personFold = (p: Person): HTMLElement => {
    const d = docOf(p);
    const open = unpaid(d.items);
    return fold(
      {
        id: `${trip.id}:pay:${p.uid}`,
        title: p.displayName,
        meta: !d.items.length ? '—' : open.length ? sumText(open) : '✓',
        open: false,
        className: 'pay-person',
        level: 'h3',
      },
      ...d.items.map((i) => {
        const key = `${p.uid}:${i.id}`;
        if (editingItem === key) return editForm(p, i);
        const box = h('input', {
          type: 'checkbox',
          'aria-label': `Wpłacone: ${i.title}`,
        });
        box.checked = !!i.paidOn;
        box.addEventListener('change', () => {
          const { paidOn: _p, ...rest } = i;
          void save(p.uid, {
            ...d,
            items: d.items.map((x) => (x.id === i.id ? (box.checked ? { ...rest, paidOn: today } : rest) : x)),
          });
        });
        return h(
          'div',
          { class: 'pay__row' },
          box,
          itemLine(i, today),
          h(
            'button',
            {
              type: 'button',
              class: 'link-btn',
              'aria-label': `Zmień: ${i.title}`,
              onclick: () => ((editingItem = key), draw()),
            },
            'zmień',
          ),
        );
      }),
      !d.items.length && h('p', { class: 'muted' }, 'Brak wpisanych wpłat.'),
    );
  };

  const draw = () => {
    const all = people.map(docOf);
    const rows = summary(all);
    const openSum = sumText(all.flatMap((d) => unpaid(d.items)));
    meta.textContent = rows.length ? (openSum ? `brakuje ${openSum}` : '✓') : '';
    body.replaceChildren(
      ...present(
        !people.length && h('p', { class: 'muted' }, 'Nie ma jeszcze zatwierdzonych uczestników.'),
        rows.length > 0 &&
          h(
            'ul',
            { class: 'status-list pay__summary' },
            ...rows.map((r) => h('li', {}, r.title, h('b', {}, `wpłaciło ${r.paid} z ${r.total}${r.missing ? ` · brakuje ${r.missing}` : ' ✓'}`))),
          ),
        adding
          ? addForm()
          : people.length > 0 &&
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn btn--secondary',
                  onclick: () => ((adding = true), draw()),
                },
                '+ Dodaj wpłatę (np. lot, hotel)',
              ),
        ...people.map(personFold),
        rows.length > 0 && h('p', { class: 'muted' }, 'Zaznacz pole, gdy osoba wpłaci. Każdy widzi tylko swoje wpłaty.'),
      ),
    );
  };

  void listPayments(trip.id)
    .catch(() => docs)
    .then((d) => {
      docs = d;
      draw();
    });
  return card;
}
