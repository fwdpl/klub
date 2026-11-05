import { addExpense, deleteExpense, listExpenses, updateExpense, type ExpenseInput } from '../data/expenses';
import type { Trip } from '../data/trips';
import {
  CATEGORY_LABEL,
  PLN_IGNORE_BELOW,
  balances,
  balancesInPln,
  fetchNbpRates,
  formatMoney,
  fromMinor,
  parseAmount,
  perCurrency,
  settle,
  settlesInPln,
  settlementText,
  splitEqual,
  toMinor,
  unallocated,
  type Category,
  type Expense,
  type Rates,
  type Transfer,
} from '../expenses/expenses';
import { shortDate } from '../expenses/payments';
import { todayIn } from '../plan/time';
import { plural } from '../text';
import { h, present, toast } from '../ui';
import { fold } from './fold';

// Wspólne wydatki przy wyjeździe (v2, decyzje Jacka z 5.11.2026):
// rozliczenie w walucie, w której płacono; na żądanie całość w PLN po bieżącym kursie średnim NBP;
// tekst rozliczenia do skopiowania / udostępnienia poza aplikacją. Poprawia i usuwa wpisujący albo organizator.

interface Me {
  uid: string;
  displayName: string;
  isOrganizer: boolean;
}

export interface Person {
  uid: string;
  displayName: string;
}

const RATES_KEY = 'klub.nbpRates';

function cachedRates(): { rates: Rates; fetchedAt: string } | null {
  try {
    return JSON.parse(localStorage.getItem(RATES_KEY) ?? 'null') as {
      rates: Rates;
      fetchedAt: string;
    } | null;
  } catch {
    return null;
  }
}

async function loadRates(): Promise<{
  rates: Rates;
  fetchedAt: string;
  stale: boolean;
}> {
  const cached = cachedRates();
  if (navigator.onLine === false && cached) return { ...cached, stale: true };
  try {
    const fresh = {
      rates: await fetchNbpRates(),
      fetchedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(RATES_KEY, JSON.stringify(fresh));
    } catch {
      // bez pamięci urządzenia kurs trzeba będzie pobrać ponownie
    }
    return { ...fresh, stale: false };
  } catch (e) {
    if (cached) return { ...cached, stale: true };
    throw e;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h('textarea', {
      'aria-hidden': 'true',
      style: 'position:fixed;opacity:0',
    });
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

const signed = (minor: number, currency: string) => `${minor > 0 ? '+' : minor < 0 ? '−' : ''}${formatMoney(Math.abs(fromMinor(minor, currency)), currency)}`;

export function expensesSection(trip: Trip, me: Me, people: Person[], currencies: string[], readOnly: boolean): HTMLElement {
  const wrap = h('div', { class: 'expenses' }, h('p', { class: 'muted' }, 'Wczytuję…'));
  let list: Expense[] = [];
  let pln: { rates: Rates; fetchedAt: string; stale: boolean } | null = null;
  let editing: Expense | 'new' | null = null;
  const today = () => todayIn(trip.timezone);

  const name = (uid: string): string => people.find((p) => p.uid === uid)?.displayName ?? list.find((e) => e.names[uid])?.names[uid] ?? '?';
  const canEdit = (e: Expense) => !readOnly && (e.createdBy === me.uid || me.isOrganizer);

  const reload = async () => {
    list = await listExpenses(trip.id).catch(() => list);
    draw();
  };

  const failed = () => {
    toast('Nie udało się zapisać – spróbuj ponownie.');
    void reload();
  };

  /** Zapis bez czekania na serwer: bez sieci wpis czeka w kolejce, a ekran od razu go pokazuje. */
  const saveNew = (input: ExpenseInput) => {
    const { expense, saved } = addExpense(trip.id, me.uid, input);
    list = [...list, expense];
    saved.catch(failed);
    if (navigator.onLine === false) toast('Zapisane na telefonie – wyśle się po połączeniu.');
  };
  const saveEdit = (id: string, input: ExpenseInput) => {
    list = list.map((e) => (e.id === id ? { ...e, ...input } : e));
    updateExpense(trip.id, id, input).catch(failed);
  };
  const remove = (id: string) => {
    list = list.filter((e) => e.id !== id);
    deleteExpense(trip.id, id).catch(failed);
  };

  const markReturned = (t: Transfer, currency: string, viaPln = false) => {
    const amount = fromMinor(t.minor, currency);
    if (!confirm(`${name(t.from)} oddaje ${name(t.to)} ${formatMoney(amount, currency)}. Zapisać jako oddane?`)) return;
    saveNew({
      kind: 'transfer',
      title: 'Zwrot',
      amount,
      currency,
      date: today(),
      paidBy: t.from,
      split: 'amounts',
      shares: { [t.to]: amount },
      names: { [t.from]: name(t.from), [t.to]: name(t.to) },
      ...(viaPln ? { viaPln: true } : {}),
    });
    draw();
  };

  // ---------- formularz ----------
  const form = (initial: Expense | null): HTMLElement => {
    const box = h('div', { class: 'card card--inner expense-form' });
    const title = h('input', {
      type: 'text',
      maxlength: '120',
      placeholder: 'Co? Np. kolacja, taksówka',
      'aria-label': 'Co',
    });
    title.value = initial?.title ?? '';
    const amount = h('input', {
      type: 'text',
      inputmode: 'decimal',
      placeholder: 'Kwota',
      'aria-label': 'Kwota',
    });
    amount.value = initial ? String(initial.amount).replace('.', ',') : '';
    const lastCurrency = list.length ? [...list].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!.currency : undefined;
    const startCurrency = initial?.currency ?? lastCurrency ?? currencies[0] ?? 'PLN';
    const options = [...new Set([startCurrency, ...currencies, 'PLN', 'EUR', 'USD'])];
    const currency = h(
      'select',
      { 'aria-label': 'Waluta' },
      ...options.map((c) => h('option', { value: c, selected: c === startCurrency }, c)),
      h('option', { value: '*' }, 'Inna…'),
    );
    currency.addEventListener('change', () => {
      if (currency.value !== '*') return refresh();
      const code = (prompt('Kod waluty (3 litery), np. THB') ?? '').trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(code)) {
        currency.insertBefore(h('option', { value: code }, code), currency.lastElementChild);
        currency.value = code;
      } else currency.value = startCurrency;
      refresh();
    });
    const paidBy = h(
      'select',
      { 'aria-label': 'Kto płacił' },
      ...people.map((p) =>
        h(
          'option',
          {
            value: p.uid,
            selected: p.uid === (initial?.paidBy ?? (people.some((x) => x.uid === me.uid) ? me.uid : people[0]?.uid)),
          },
          p.displayName,
        ),
      ),
    );
    const date = h('input', {
      type: 'date',
      value: initial?.date ?? today(),
      'aria-label': 'Data',
    });
    const category = h(
      'select',
      { 'aria-label': 'Kategoria' },
      h('option', { value: '' }, 'Kategoria – bez'),
      ...(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => h('option', { value: c, selected: initial?.category === c }, CATEGORY_LABEL[c])),
    );
    const note = h('input', {
      type: 'text',
      maxlength: '500',
      placeholder: 'Notatka (opcjonalnie)',
      'aria-label': 'Notatka',
    });
    note.value = initial?.note ?? '';

    // podział
    let mode: 'equal' | 'amounts' = initial?.split ?? 'equal';
    const chosen = new Set(initial ? Object.keys(initial.shares) : people.map((p) => p.uid));
    const amounts = new Map<string, string>(initial?.split === 'amounts' ? Object.entries(initial.shares).map(([u, v]) => [u, String(v).replace('.', ',')]) : []);
    const splitBox = h('div', { class: 'expense-split' });
    const splitInfo = h('p', { class: 'muted' });
    const modeWrap = h('div', {
      class: 'segmented segmented--2',
      role: 'group',
      'aria-label': 'Podział',
    });
    const setMode = (m: typeof mode) => {
      mode = m;
      modeWrap.replaceChildren(
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(mode === 'equal'),
            onclick: () => setMode('equal'),
          },
          'Po równo',
        ),
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(mode === 'amounts'),
            onclick: () => setMode('amounts'),
          },
          'Kwotami',
        ),
      );
      drawSplit();
    };
    const drawSplit = () => {
      splitBox.replaceChildren(
        ...people.map((p) => {
          if (mode === 'equal') {
            const box2 = h('input', { type: 'checkbox' });
            box2.checked = chosen.has(p.uid);
            box2.addEventListener('change', () => {
              if (box2.checked) chosen.add(p.uid);
              else chosen.delete(p.uid);
              refresh();
            });
            return h('label', { class: 'check expense-split__row' }, box2, h('span', {}, p.displayName));
          }
          const input = h('input', {
            type: 'text',
            inputmode: 'decimal',
            placeholder: '0',
            'aria-label': `Kwota – ${p.displayName}`,
          });
          input.value = amounts.get(p.uid) ?? '';
          input.addEventListener('input', () => {
            amounts.set(p.uid, input.value);
            refresh();
          });
          return h('label', { class: 'expense-split__row expense-split__row--amount' }, h('span', {}, p.displayName), input);
        }),
      );
      refresh();
    };
    const shares = (): Record<string, number> | null => {
      const value = parseAmount(amount.value);
      if (!value) return null;
      if (mode === 'equal') return chosen.size ? splitEqual(value, currency.value, [...chosen]) : null;
      const out: Record<string, number> = {};
      for (const [uid, text] of amounts) {
        const v = parseAmount(text);
        if (v) out[uid] = fromMinor(toMinor(v, currency.value), currency.value);
      }
      return Object.keys(out).length ? out : null;
    };
    const refresh = () => {
      const value = parseAmount(amount.value);
      if (!value) return void (splitInfo.textContent = '');
      if (mode === 'equal') {
        splitInfo.textContent = chosen.size
          ? `${chosen.size} ${plural(chosen.size, 'osoba', 'osoby', 'osób')} · ok. ${formatMoney(value / chosen.size, currency.value)} na osobę`
          : 'Zaznacz, kogo dotyczy.';
      } else {
        const left = unallocated(value, currency.value, shares() ?? {});
        splitInfo.textContent =
          left === 0 ? '✓ rozdzielone' : left > 0 ? `Zostało do rozdzielenia: ${formatMoney(left, currency.value)}` : `Za dużo o ${formatMoney(-left, currency.value)}`;
      }
    };
    amount.addEventListener('input', refresh);

    const error = h('p', { class: 'error', role: 'alert' });
    const save = h('button', { type: 'button', class: 'btn' }, initial ? 'Zapisz' : 'Dodaj wydatek');
    const cancel = h('button', { type: 'button', class: 'btn btn--secondary' }, 'Anuluj');
    cancel.addEventListener('click', () => {
      editing = null;
      draw();
    });
    save.addEventListener('click', () => {
      const value = parseAmount(amount.value);
      const s = shares();
      error.textContent = '';
      if (!title.value.trim()) return void (error.textContent = 'Wpisz, za co.');
      if (!value) return void (error.textContent = 'Wpisz kwotę, np. 1200 albo 45,50.');
      if (!paidBy.value) return void (error.textContent = 'Wybierz, kto płacił.');
      if (!s) return void (error.textContent = mode === 'equal' ? 'Zaznacz, kogo dotyczy wydatek.' : 'Wpisz kwoty osób.');
      if (mode === 'amounts' && unallocated(value, currency.value, s) !== 0) return void (error.textContent = 'Kwoty osób muszą dać razem całą kwotę.');
      const involved = [paidBy.value, ...Object.keys(s)];
      const input: ExpenseInput = {
        kind: 'expense',
        title: title.value.trim(),
        amount: fromMinor(toMinor(value, currency.value), currency.value),
        currency: currency.value,
        date: date.value || today(),
        category: (category.value || undefined) as Category | undefined,
        paidBy: paidBy.value,
        split: mode,
        shares: s,
        names: Object.fromEntries(involved.map((u) => [u, name(u)])),
        note: note.value.trim() || undefined,
      };
      if (initial) saveEdit(initial.id, input);
      else saveNew(input);
      editing = null;
      draw();
    });

    setMode(mode);
    box.append(
      ...present(
        h('h3', {}, initial ? 'Popraw wydatek' : 'Nowy wydatek'),
        title,
        h('div', { class: 'two-col expense-amount' }, amount, currency),
        h('label', { class: 'field' }, h('span', {}, 'Kto płacił'), paidBy),
        h('div', { class: 'two-col' }, date, category),
        h('p', { class: 'field-label' }, 'Za kogo'),
        modeWrap,
        splitBox,
        splitInfo,
        note,
        error,
        h('div', { class: 'actions actions--row' }, save, cancel),
        initial &&
          h(
            'button',
            {
              type: 'button',
              class: 'link-btn link-btn--danger',
              onclick: () => {
                if (!confirm(`Usunąć „${initial.title}”?`)) return;
                remove(initial.id);
                editing = null;
                draw();
              },
            },
            'Usuń wydatek',
          ),
      ),
    );
    setTimeout(() => title.focus(), 0);
    return box;
  };

  // ---------- rozliczenie ----------
  const settlementCard = (): HTMLElement => {
    const all = balances(list);
    const plnMode = settlesInPln(list);
    const blocks: HTMLElement[] = [];
    if (plnMode) blocks.push(h('p', { class: 'muted' }, 'Rozliczacie się w złotych (kurs średni NBP z dnia przeliczenia) – zwroty zaznaczajcie poniżej.'));
    for (const [currency, byUid] of plnMode ? [] : [...balances(perCurrency(list))].sort(([a], [b]) => a.localeCompare(b))) {
      const transfers = settle(byUid);
      blocks.push(
        h(
          'div',
          { class: 'settle' },
          h('h3', {}, currency === 'PLN' ? 'W złotych' : `W ${currency}`),
          transfers.length
            ? h(
                'ul',
                { class: 'settle__list' },
                ...transfers.map((t) =>
                  h(
                    'li',
                    {},
                    h('span', {}, `${name(t.from)} → ${name(t.to)}: `, h('b', {}, formatMoney(fromMinor(t.minor, currency), currency))),
                    !readOnly &&
                      h(
                        'button',
                        {
                          type: 'button',
                          class: 'chip-btn',
                          onclick: () => markReturned(t, currency),
                        },
                        '✓ Oddane',
                      ),
                  ),
                ),
              )
            : h('p', { class: 'muted' }, 'Rozliczone ✓'),
        ),
      );
    }

    // przeliczenie na PLN
    const plnBox = h('div', { class: 'settle settle--pln' });
    const drawPln = () => {
      if (!pln && plnMode) {
        // rozliczenie już idzie w złotych – kurs pobiera się sam
        plnBox.replaceChildren(h('p', { class: 'muted' }, 'Pobieram kurs NBP…'));
        loadRates()
          .then((r) => {
            pln = r;
            draw();
          })
          .catch(() => plnBox.replaceChildren(h('p', { class: 'error' }, 'Do przeliczenia potrzebny jest internet (kurs NBP).')));
        return;
      }
      if (!pln) {
        const btn = h('button', { type: 'button', class: 'btn btn--secondary' }, 'Przelicz całość na PLN (kurs NBP)');
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'Pobieram kurs NBP…';
          try {
            pln = await loadRates();
            drawPln();
          } catch {
            btn.disabled = false;
            btn.textContent = 'Przelicz całość na PLN (kurs NBP)';
            toast(navigator.onLine ? 'NBP nie odpowiada – spróbuj za chwilę.' : 'Do pierwszego przeliczenia potrzebny jest internet.');
          }
        });
        plnBox.replaceChildren(btn);
        return;
      }
      const { balance, missing } = balancesInPln(all, pln.rates);
      const transfers = settle(balance, PLN_IGNORE_BELOW);
      const used = [...all.keys()].filter((c) => c !== 'PLN' && pln!.rates.mid[c] !== undefined);
      plnBox.replaceChildren(
        ...present(
          h('h3', {}, 'Całość w PLN'),
          transfers.length
            ? h(
                'ul',
                { class: 'settle__list' },
                ...transfers.map((t) =>
                  h(
                    'li',
                    {},
                    h('span', {}, `${name(t.from)} → ${name(t.to)}: `, h('b', {}, formatMoney(fromMinor(t.minor, 'PLN'), 'PLN'))),
                    !readOnly &&
                      h(
                        'button',
                        {
                          type: 'button',
                          class: 'chip-btn',
                          onclick: () => markReturned(t, 'PLN', true),
                        },
                        '✓ Oddane',
                      ),
                  ),
                ),
              )
            : h('p', { class: 'muted' }, 'Rozliczone ✓ (różnice poniżej 1 zł pominięte)'),
          h(
            'p',
            { class: 'muted' },
            `Kurs średni NBP z ${shortDate(pln.rates.date)}`,
            used.length ? `: ${used.map((c) => `1 ${c} = ${pln!.rates.mid[c].toLocaleString('pl-PL', { maximumFractionDigits: 6 })} zł`).join(', ')}` : '',
            pln.stale ? ' (ostatnio pobrany – bez internetu)' : '',
            '.',
          ),
          missing.length ? h('p', { class: 'error' }, `NBP nie podaje kursu: ${missing.join(', ')} – te kwoty nie są przeliczone.`) : '',
          !plnMode &&
            h(
              'button',
              {
                type: 'button',
                class: 'link-btn',
                onclick: () => ((pln = null), drawPln()),
              },
              'Ukryj przeliczenie',
            ),
        ),
      );
    };
    if (list.length) drawPln();

    const text = () =>
      settlementText({
        tripTitle: trip.title,
        expenses: list,
        name,
        today: shortDate(today()),
        ...(pln
          ? {
              pln: {
                rates: pln.rates,
                ...(() => {
                  const r = balancesInPln(all, pln!.rates);
                  return {
                    transfers: settle(r.balance, PLN_IGNORE_BELOW),
                    missing: r.missing,
                  };
                })(),
              },
            }
          : {}),
      });
    const copy = h('button', { type: 'button', class: 'chip-btn' }, '📋 Kopiuj');
    copy.addEventListener('click', async () => toast((await copyText(text())) ? 'Skopiowane – wklej w komunikatorze albo mailu.' : 'Nie udało się skopiować.'));
    const share =
      typeof navigator.share === 'function'
        ? h(
            'button',
            {
              type: 'button',
              class: 'chip-btn',
              onclick: () => void navigator.share({ title: `Rozliczenie: ${trip.title}`, text: text() }).catch(() => undefined),
            },
            '📤 Udostępnij',
          )
        : null;

    return fold(
      {
        id: `${trip.id}:settle`,
        title: 'Rozliczenie',
        meta: list.length ? '' : 'brak',
        open: true,
      },
      ...(list.length ? blocks : [h('p', { class: 'muted' }, 'Nie ma jeszcze wydatków.')]),
      list.length ? plnBox : null,
      list.length ? h('div', { class: 'actions actions--row' }, copy, share) : null,
    );
  };

  // ---------- lista ----------
  const row = (e: Expense): HTMLElement => {
    const who = Object.keys(e.shares);
    const forText =
      e.kind === 'transfer'
        ? `${name(e.paidBy)} → ${who.map(name).join(', ')}`
        : `💳 ${name(e.paidBy)} · dla: ${who.length === people.length && people.every((p) => who.includes(p.uid)) ? 'wszyscy' : who.map(name).join(', ')}${e.split === 'amounts' ? ' (kwotami)' : ''}`;
    const el = h(
      'div',
      { class: `expense${e.kind === 'transfer' ? ' expense--transfer' : ''}` },
      h(
        'div',
        { class: 'expense__head' },
        h('span', { class: 'expense__title' }, e.kind === 'transfer' ? '↩︎ Zwrot' : `${e.category ? `${CATEGORY_LABEL[e.category].split(' ')[0]} ` : ''}${e.title}`),
        h('b', { class: 'expense__amount' }, formatMoney(e.amount, e.currency)),
      ),
      h('p', { class: 'muted expense__meta' }, forText),
      e.note && h('p', { class: 'expense__note' }, e.note),
    );
    if (canEdit(e)) {
      el.classList.add('expense--editable');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', `Popraw: ${e.title}`);
      const open = () => {
        if (e.kind === 'transfer') {
          if (confirm('Usunąć ten zwrot?')) {
            remove(e.id);
            draw();
          }
          return;
        }
        editing = e;
        draw();
        wrap.scrollIntoView({ block: 'start' });
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (ev) => (ev.key === 'Enter' ? open() : undefined));
    }
    return el;
  };

  const listCard = (): HTMLElement => {
    const byDate = new Map<string, Expense[]>();
    for (const e of [...list].sort((a, b) => b.date.localeCompare(a.date))) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
    const count = list.filter((e) => e.kind === 'expense').length;
    return fold(
      {
        id: `${trip.id}:expenses`,
        title: 'Wszystkie wpisy',
        meta: count ? `${count}` : '',
        open: false,
      },
      ...[...byDate].map(([date, items]) => h('div', { class: 'expense-day' }, h('h4', {}, shortDate(date)), ...items.map(row))),
      !list.length && h('p', { class: 'muted' }, 'Pusto.'),
      list.some(canEdit) && h('p', { class: 'muted' }, 'Stuknij swój wpis, żeby go poprawić albo usunąć.'),
    );
  };

  const mySummary = (): HTMLElement | null => {
    if (!people.some((p) => p.uid === me.uid) || !list.length) return null;
    const plnMode = settlesInPln(list);
    if (plnMode && !pln) return null;
    const source: [string, Map<string, number>][] = plnMode ? [['PLN', balancesInPln(balances(list), pln!.rates).balance]] : [...balances(perCurrency(list))];
    const mine = source.map(([c, b]) => [c, b.get(me.uid) ?? 0] as const).filter(([c, v]) => Math.abs(v) >= (plnMode && c === 'PLN' ? PLN_IGNORE_BELOW : 1));
    return h(
      'p',
      { class: 'expense-mine' },
      h('b', {}, 'Ty: '),
      mine.length ? mine.map(([c, v]) => `${signed(v, c)} ${v > 0 ? '(do odebrania)' : '(do oddania)'}`).join(' · ') : 'rozliczony ✓',
    );
  };

  const draw = () => {
    const add =
      !readOnly && editing === null && people.length
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn',
              onclick: () => ((editing = 'new'), draw()),
            },
            '+ Dodaj wydatek',
          )
        : null;
    wrap.replaceChildren(
      ...[
        mySummary(),
        editing ? form(editing === 'new' ? null : editing) : add,
        !people.length && h('p', { class: 'muted' }, 'Nie ma jeszcze zatwierdzonych uczestników.'),
        settlementCard(),
        listCard(),
      ].filter((x): x is HTMLElement => !!x),
    );
  };

  void reload();
  return wrap;
}
