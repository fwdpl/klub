export type Segment = { kind: 'text' | 'bold' | 'link'; text: string };

// Adres zaczynający się od http:// albo https:// – do pierwszej spacji; końcowa interpunkcja nie należy do adresu
const URL_RE = /https?:\/\/[^\s<>"]+/g;
const TRAILING = /[.,;:!?)\]}'”»]+$/;

function linkify(text: string, kind: 'text' | 'bold'): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    const trail = TRAILING.exec(url)?.[0] ?? '';
    if (trail) url = url.slice(0, -trail.length);
    const start = m.index ?? 0;
    if (start > last) out.push({ kind, text: text.slice(last, start) });
    out.push({ kind: 'link', text: url });
    last = start + url.length;
  }
  if (last < text.length) out.push({ kind, text: text.slice(last) });
  return out;
}

/** Podział tekstu na zwykły, pogrubiony (**…**) i adresy WWW – bez DOM, do testów. */
export function segments(text: string): Segment[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .flatMap((part) => (part.startsWith('**') && part.endsWith('**') && part.length > 4 ? linkify(part.slice(2, -2), 'bold') : linkify(part, 'text')));
}

/**
 * Tekst z prostym pogrubieniem **…** i klikalnymi adresami http(s) → węzły DOM.
 * Bez innerHTML – treść z pliku nie wykona się jako HTML; linki tylko http/https, w nowej karcie.
 */
export function richText(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const s of segments(text)) {
    if (s.kind === 'link') {
      const a = document.createElement('a');
      a.href = s.text;
      a.textContent = s.text.replace(/^https?:\/\//, '');
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'text-link';
      fragment.append(a);
    } else if (s.kind === 'bold') {
      const b = document.createElement('b');
      b.textContent = s.text;
      fragment.append(b);
    } else fragment.append(document.createTextNode(s.text));
  }
  return fragment;
}
