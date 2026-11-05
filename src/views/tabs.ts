import { h } from '../ui';
import { ICONS, SHEET_ICONS, type IconName } from './icons';

// Ekran wyjazdu jako rząd ikon (prośba Jacka z 4.11.2026): stuknięcie w ikonę pokazuje pod spodem
// tylko jej sekcję, zamiast długiej listy w dół. Wybór zapamiętany na urządzeniu.

export interface Tab {
  key: string;
  icon: IconName;
  label: string;
  /** Pełna nazwa sekcji – nagłówek panelu. */
  title: string;
  /** Liczba na ikonie (np. zgłoszenia czekające na decyzję). */
  badge?: number;
  content: () => HTMLElement;
}

const storeKey = (tripId: string) => `klub.tab.${tripId}`;

export function iconEl(name: IconName): HTMLElement {
  if ((SHEET_ICONS as readonly string[]).includes(name)) {
    // maska z planszy – kolor bierze z currentColor (żółty / granatowy)
    return h('span', { class: 'tab__icon tab__icon--mask', style: `--icon: url("/sections/${name}.png")`, 'aria-hidden': 'true' });
  }
  const el = h('span', { class: 'tab__icon', 'aria-hidden': 'true' });
  el.innerHTML = ICONS[name]; // stałe ikony – bez treści od użytkownika
  return el;
}

function stored(tripId: string): string | null {
  try {
    return sessionStorage.getItem(storeKey(tripId)) ?? localStorage.getItem(storeKey(tripId));
  } catch {
    return null;
  }
}

function remember(tripId: string, key: string): void {
  try {
    sessionStorage.setItem(storeKey(tripId), key);
    localStorage.setItem(storeKey(tripId), key);
  } catch {
    // bez pamięci urządzenia – następnym razem sekcja domyślna
  }
}

/**
 * Siatka ikon + panel wybranej sekcji. W czasie wyjazdu („Dziś” na liście) na start otwiera się „Dziś”,
 * chyba że w tej sesji wybrano już inną ikonę.
 */
export function tabbedSections(tripId: string, tabs: Tab[], fallback: string): HTMLElement {
  const wrap = h('div', { class: 'tabs' });
  if (!tabs.length) return wrap;
  const bar = h('div', { class: 'tabs__bar', role: 'tablist', 'aria-label': 'Sekcje wyjazdu' });
  const panel = h('div', { class: 'tabs__panel card', role: 'tabpanel' });

  let session: string | null = null;
  try {
    session = sessionStorage.getItem(storeKey(tripId));
  } catch {
    // brak pamięci sesji
  }
  const has = (k: string | null) => !!k && tabs.some((t) => t.key === k);
  let current = has(session) ? session! : tabs.some((t) => t.key === 'today') ? 'today' : has(stored(tripId)) ? stored(tripId)! : has(fallback) ? fallback : tabs[0].key;

  const buttons = tabs.map((t) =>
    h(
      'button',
      { type: 'button', role: 'tab', class: 'tab', 'data-key': t.key, onclick: () => select(t.key) },
      iconEl(t.icon),
      h('span', { class: 'tab__label' }, t.label),
      t.badge ? h('span', { class: 'tab__badge', 'aria-label': `${t.badge} czeka` }, String(t.badge)) : null,
    ),
  );

  const built = new Map<string, HTMLElement>();
  const select = (key: string, save = true) => {
    current = key;
    if (save) remember(tripId, key);
    const tab = tabs.find((t) => t.key === key)!;
    for (const b of buttons) {
      const on = b.dataset.key === key;
      b.setAttribute('aria-selected', String(on));
      b.classList.toggle('tab--on', on);
    }
    // zawartość budowana raz i pokazywana ponownie przy każdym powrocie do ikony (stan, np. rozwinięte dni, zostaje)
    let content = built.get(key);
    if (!content) {
      content = tab.content();
      built.set(key, content);
    }
    panel.replaceChildren(...(tab.key === 'today' ? [] : [h('h2', { class: 'tabs__title' }, tab.title)]), content);
  };

  bar.append(...buttons);
  wrap.append(bar, panel);
  select(current, false);
  return wrap;
}
