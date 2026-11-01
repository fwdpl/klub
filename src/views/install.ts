import { isTestEnv } from '../config';
import { h, render } from '../ui';

export function showInstallIOS(): void {
  render(
    h('h1', {}, isTestEnv ? 'Klub TEST' : 'Klub'),
    h(
      'div',
      { class: 'card' },
      h('h2', {}, 'Zainstaluj aplikację'),
      h('p', {}, 'Na iPhonie Klub działa tylko po dodaniu do ekranu głównego. Dopiero wtedy działają logowanie i powiadomienia.'),
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, 'Otwórz tę stronę w Safari.'),
        h('li', {}, 'Stuknij Udostępnij (kwadrat ze strzałką w górę). W nowszym Safari jest pod „•••” w prawym dolnym rogu.'),
        h('li', {}, 'Wybierz „Do ekranu głównego” (w starszych iPhone’ach: „Do ekranu początkowego”). Jeśli go nie widać, przewiń listę w dół.'),
        h('li', {}, 'Stuknij „Dodaj”.'),
        h('li', {}, 'Otwórz Klub ikoną z ekranu głównego i tam się zaloguj.'),
      ),
      h('p', { class: 'muted' }, 'iPhone przechowuje dane Safari i zainstalowanej aplikacji osobno, dlatego logowanie w Safari nic by nie dało.'),
    ),
  );
}
