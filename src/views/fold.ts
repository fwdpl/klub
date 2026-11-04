import { h } from '../ui';

// Zwijane sekcje ekranu wyjazdu. Stan rozwinięcia jest zapamiętany na urządzeniu (wygoda, nie dane):
// po powrocie z edycji punktu ten sam dzień jest dalej rozwinięty.

const KEY = 'klub.fold';
type Child = Node | string | null | false | undefined;

/** Klucz zaczynający się od „session:” – stan tylko do zamknięcia aplikacji (np. dni planu). */
const SESSION = 'session:';
const storeFor = (id: string): Storage => (id.startsWith(SESSION) ? sessionStorage : localStorage);

function load(store: Storage): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(store.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function isOpen(id: string, fallback: boolean): boolean {
  try {
    return load(storeFor(id))[id] ?? fallback;
  } catch {
    return fallback;
  }
}

export function remember(id: string, open: boolean): void {
  try {
    const store = storeFor(id);
    const all = load(store);
    all[id] = open;
    store.setItem(KEY, JSON.stringify(all));
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

/** Zawartość sekcji bez nagłówka – do pokazania w panelu wybranym ikoną (ekran wyjazdu). */
export function foldBody(el: HTMLElement): HTMLElement {
  return el.matches('details.fold') ? ((el.querySelector(':scope > .fold__body') as HTMLElement | null) ?? el) : el;
}
