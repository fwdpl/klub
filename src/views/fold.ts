import { h } from '../ui';

// Zwijane sekcje ekranu wyjazdu. Stan rozwinięcia jest zapamiętany na urządzeniu (wygoda, nie dane):
// po powrocie z edycji punktu ten sam dzień jest dalej rozwinięty.

const KEY = 'klub.fold';
type Child = Node | string | null | false | undefined;

function load(): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function isOpen(id: string, fallback: boolean): boolean {
  return load()[id] ?? fallback;
}

export function remember(id: string, open: boolean): void {
  try {
    const all = load();
    all[id] = open;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // bez pamięci urządzenia sekcje wracają do domyślnego stanu
  }
}

export interface FoldOptions {
  /** Klucz zapamiętania, np. `${tripId}:plan`. Bez klucza stan nie jest zapamiętywany. */
  id?: string;
  title: string;
  /** Krótka informacja w nagłówku, widoczna także po zwinięciu, np. „3 dni” albo „2/10”. */
  meta?: string;
  open: boolean;
  /** Klasa elementu: domyślnie karta; dzień planu ma własną. */
  className?: string;
  /** Poziom nagłówka: sekcja (h2) albo dzień planu (h3). */
  level?: 'h2' | 'h3';
  /** Dodatkowe elementy nagłówka (np. data i miejsce dnia). */
  head?: Child[];
}

/** Sekcja zwijana stuknięciem w nagłówek (natywne <details>, działa też z czytnikiem ekranu). */
export function fold(opts: FoldOptions, ...children: Child[]): HTMLDetailsElement {
  const level = opts.level ?? 'h2';
  const summary = h(
    'summary',
    { class: 'fold__head' },
    h('span', { class: 'fold__text' }, ...(opts.head ?? []), h(level, { class: 'fold__title' }, opts.title)),
    h('span', { class: 'fold__meta' }, opts.meta ?? ''),
    h('span', { class: 'fold__chevron', 'aria-hidden': 'true' }),
  );
  const details = h('details', { class: `fold ${opts.className ?? 'card'}`, open: opts.id ? isOpen(opts.id, opts.open) : opts.open }, summary, h('div', { class: 'fold__body' }, ...children));
  if (opts.id) {
    const id = opts.id;
    details.addEventListener('toggle', () => remember(id, details.open));
  }
  return details;
}
