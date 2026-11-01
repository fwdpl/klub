import { searchZones, utcOffset, zoneLabel } from '../timezones';
import { h } from '../ui';

/**
 * Wybór strefy: wyszukiwarka po polskiej nazwie kraju lub miasta zamiast listy ~400 stref.
 * Bez wartości domyślnej – strefa dotyczy całego harmonogramu (decyzja E).
 */
export function zonePicker(current: string, placeholder = 'Wpisz kraj lub miasto, np. Islandia'): { el: HTMLElement; value: () => string } {
  let selected = current;
  const all: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const el = h('div', { class: 'zone-picker' });
  const input = h('input', {
    type: 'search',
    placeholder,
    autocomplete: 'off',
    'aria-label': 'Szukaj strefy czasowej',
  });
  const results = h('div', { class: 'zone-results', role: 'listbox' });

  const showResults = () => {
    const found = searchZones(input.value, all);
    results.replaceChildren(
      ...(found.length
        ? found.map((z) =>
            h(
              'button',
              {
                type: 'button',
                role: 'option',
                class: 'zone-option',
                onclick: () => {
                  selected = z.zone;
                  draw();
                },
              },
              h('span', {}, z.label),
              h('span', { class: 'muted' }, utcOffset(z.zone)),
            ),
          )
        : [h('p', { class: 'muted' }, 'Nic nie znaleziono. Spróbuj nazwy kraju albo większego miasta.')]),
    );
  };
  input.addEventListener('input', showResults);

  const draw = () => {
    if (selected) {
      el.replaceChildren(
        h(
          'div',
          { class: 'zone-chosen' },
          h('div', {}, h('b', {}, zoneLabel(selected)), h('div', { class: 'muted' }, `${selected} · ${utcOffset(selected)}`)),
          h(
            'button',
            {
              type: 'button',
              class: 'zone-change',
              onclick: () => {
                selected = '';
                input.value = '';
                draw();
                input.focus();
              },
            },
            'Zmień',
          ),
        ),
      );
    } else {
      el.replaceChildren(input, results);
      showResults();
    }
  };
  draw();
  return { el, value: () => selected };
}
