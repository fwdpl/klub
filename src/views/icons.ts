// Ikony ekranu wyjazdu. Siedem sekcji ma ikony wycięte z planszy Jacka (public/sections/*.png, maski –
// kolor z currentColor przez CSS mask); Lista, Kraj, Ubezpieczenie oraz ✏️ i 🔔 – wektorowe, w tym samym stylu.

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const calendar = '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/>';

export const ICONS = {
  today: svg(`${calendar}<path d="M11 14.2l1.6-1.2V18M10.6 18h3.6"/>`),
  plan: svg(`${calendar}<path d="M7 13.5h.01M10 13.5h7M7 17h.01M10 17h7"/>`),
  flights: svg(
    '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  ),
  hotels: svg('<path d="M2 12.5 10.5 5.5 19 12.5M4.5 10.5V21h12V10.5M8.5 21v-5h4v5"/><path d="M20.5 2.2a2.6 2.6 0 1 0 1.8 4.1 2.1 2.1 0 0 1-1.8-4.1z"/>'),
  contacts: svg(
    '<path d="M12 22s8-3.5 8-10V5.2L12 2 4 5.2V12c0 6.5 8 10 8 10z"/><path d="M9.3 8.8c.2 2.4 2.6 4.8 5 5l.9-1.2-1.4-.9-.8.6a4 4 0 0 1-2.2-2.2l.6-.8-.9-1.4z"/>',
  ),
  insurance: svg('<path d="M22 12.5a10 10 0 0 0-20 0z"/><path d="M12 12.5v6.3a2.2 2.2 0 0 0 4.4 0M12 2.5v0"/>'),
  checklist: svg('<rect x="4.5" y="4" width="15" height="18" rx="2.5"/><path d="M9 2.5h6v3.5H9zM8 12l1.6 1.6L12.5 10.7M14.5 12.5h2M8 17l1.6 1.6 2.9-2.9M14.5 17.5h2"/>'),
  country: svg('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>'),
  costs: svg('<path d="M6.5 5.5H20a2 2 0 0 1 2 2V15"/><rect x="2" y="8.5" width="16.5" height="11" rx="2"/><circle cx="10.25" cy="14" r="2.6"/>'),
  people: svg(
    '<circle cx="12" cy="7.5" r="3"/><path d="M6.5 20v-1.2a5.5 5.5 0 0 1 11 0V20"/><circle cx="5" cy="9.5" r="2.2"/><path d="M1.5 19.5v-.7A3.8 3.8 0 0 1 5 15"/><circle cx="19" cy="9.5" r="2.2"/><path d="M22.5 19.5v-.7A3.8 3.8 0 0 0 19 15"/>',
  ),
  wishes: svg('<path d="M12 20.5s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.8a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10-7.5 10z"/><path d="M12 3v1.5M5.6 4.8l1 1M18.4 4.8l-1 1"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21a2 2 0 0 0 4 0"/>'),
} as const;

export type IconName = keyof typeof ICONS;

/** Ikony z planszy (maski PNG w public/sections, wycięte skryptem scripts/cut_section_icons.py). */
export const SHEET_ICONS = ['today', 'plan', 'flights', 'hotels', 'contacts', 'costs', 'people'] as const;
