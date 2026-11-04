import Sortable from 'sortablejs';
import { h } from '../ui';
export { moveItem } from '../list';

// Zmiana kolejności „chwyć i przesuń” za uchwyt ⠿ (prośba Jacka z 4.11.2026).
// Tylko za uchwyt: przeciąganie całego wiersza myliłoby się na telefonie z przewijaniem i odhaczaniem.

export const HANDLE_CLASS = 'drag-handle';

/** Uchwyt do chwytania; nie jest przyciskiem, żeby stuknięcie niczego nie robiło. */
export function dragHandle(label: string): HTMLElement {
  return h('span', { class: HANDLE_CLASS, role: 'img', 'aria-label': `Przytrzymaj i przesuń: ${label}`, title: 'Przytrzymaj i przesuń' }, '⠿');
}

/** Włącza przesuwanie dzieci `list` za uchwyt; `onMove` dostaje stare i nowe miejsce. */
export function makeSortable(list: HTMLElement, onMove: (from: number, to: number) => void): Sortable {
  return Sortable.create(list, {
    handle: `.${HANDLE_CLASS}`,
    animation: 150,
    // ta sama obsługa na iPhonie, Androidzie i komputerze, z przewijaniem przy krawędzi ekranu
    forceFallback: true,
    fallbackOnBody: true,
    scroll: true,
    scrollSensitivity: 80,
    ghostClass: 'drag-ghost',
    chosenClass: 'drag-chosen',
    dragClass: 'drag-active',
    onEnd: (e) => {
      if (e.oldIndex !== undefined && e.newIndex !== undefined && e.oldIndex !== e.newIndex) onMove(e.oldIndex, e.newIndex);
    },
  });
}
