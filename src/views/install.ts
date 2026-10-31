import { h, render } from '../ui';

export function showInstallIOS(): void {
  render(
    h('h1', {}, 'Klub'),
    h(
      'div',
      { class: 'card' },
      h('h2', {}, 'Zainstaluj aplikację'),
      h('p', {}, 'Na iPhonie Klub działa tylko po dodaniu do ekranu początkowego. Dopiero wtedy działają logowanie i powiadomienia.'),
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, 'Otwórz tę stronę w Safari.'),
        h('li', {}, 'Stuknij przycisk Udostępnij (kwadrat ze strzałką w górę).'),
        h('li', {}, 'Wybierz „Do ekranu początkowego”. Jeśli go nie widać, przewiń listę w dół.'),
        h('li', {}, 'Stuknij „Dodaj”.'),
        h('li', {}, 'Otwórz Klub ikoną z ekranu początkowego i tam się zaloguj.'),
      ),
      h('p', { class: 'muted' }, 'iPhone przechowuje dane Safari i zainstalowanej aplikacji osobno, dlatego logowanie w Safari nic by nie dało.'),
    ),
  );
}
