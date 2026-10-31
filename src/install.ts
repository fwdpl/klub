import { isAndroid, isIOS, isStandalone } from './platform';
import { isTestEnv } from './config';
import { h } from './ui';

type InstallPrompt = Event & { prompt: () => Promise<void> };

// Przechwytujemy systemowe zaproszenie do instalacji, żeby pokazać je z naszego przycisku
let deferred: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPrompt;
  notify();
});

window.addEventListener('appinstalled', () => {
  deferred = null;
  installed = true;
  notify();
});

/** Karta zachęcająca do instalacji; znika w zainstalowanej aplikacji. */
export function installCard(): HTMLElement {
  const app = isTestEnv ? 'Klub TEST' : 'Klub';
  const card = h('div', { class: 'card' });

  const draw = () => {
    card.hidden = isStandalone() || isIOS();
    if (card.hidden) return;
    if (installed) {
      card.replaceChildren(
        h('h2', {}, 'Aplikacja zainstalowana'),
        h('p', {}, `Otwieraj ${app} ikoną z ekranu głównego – tam działają powiadomienia i tryb offline.`),
      );
      return;
    }
    const intro = h('p', {}, `Zainstaluj ${app} na ekranie głównym. Będzie działać jak zwykła aplikacja, także bez internetu.`);
    if (deferred) {
      const prompt = deferred;
      card.replaceChildren(
        h('h2', {}, 'Zainstaluj aplikację'),
        intro,
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            onclick: async () => {
              deferred = null;
              await prompt.prompt();
              draw();
            },
          },
          'Zainstaluj aplikację',
        ),
      );
      return;
    }
    // Przeglądarka nie dała zaproszenia (np. odrzucone wcześniej) – instrukcja ręczna
    const steps = isAndroid()
      ? ['W Chrome stuknij ⋮ (prawy górny róg).', 'Wybierz „Zainstaluj aplikację” albo „Dodaj do ekranu głównego” → „Zainstaluj”.', `Otwieraj ${app} ikoną z ekranu głównego.`]
      : ['Kliknij ikonę instalacji po prawej stronie paska adresu (monitor ze strzałką).', 'Potwierdź „Zainstaluj”.'];
    card.replaceChildren(h('h2', {}, 'Zainstaluj aplikację'), intro, h('ol', { class: 'steps' }, ...steps.map((s) => h('li', {}, s))));
  };

  listeners.add(draw);
  draw();
  return card;
}
