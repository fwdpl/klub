/** Tekst z prostym pogrubieniem **…** → węzły DOM (bez innerHTML – treść z pliku nie wykona się jako HTML). */
export function richText(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  text.split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
    if (!part) return;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      const b = document.createElement('b');
      b.textContent = part.slice(2, -2);
      fragment.append(b);
    } else fragment.append(document.createTextNode(part));
  });
  return fragment;
}
