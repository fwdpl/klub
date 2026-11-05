import { saveFile } from '../data/backup';
import { addWish, deleteWish, listWishes, setVote, updateWish, type WishDetails } from '../data/wishes';
import type { Trip } from '../data/trips';
import { plural } from '../text';
import { h, toast } from '../ui';
import {
  TIME_LABEL,
  exportWishlist,
  parseMapsLink,
  score,
  searchOsm,
  sortWishes,
  wishId,
  type DayTime,
  type PlaceHit,
  type Priority,
  type Wish,
} from '../wishes/wishes';

// Lista życzeń przy wyjeździe (v2): kto co chce zobaczyć, z priorytetem; każde miejsce raz.

interface Me {
  uid: string;
  displayName: string;
  isOrganizer: boolean;
}

const DURATIONS = [30, 60, 90, 120, 180, 240, 360];

function mapsUrl(w: Wish): string | null {
  if (w.link) return w.link;
  const p = w.place;
  if (p?.lat !== undefined && p?.lng !== undefined) return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([w.name, p?.address].filter(Boolean).join(', '))}`;
}

function durationLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h2 = min / 60;
  return `${Number.isInteger(h2) ? h2 : h2.toLocaleString('pl-PL')} godz.`;
}

/** Pola pory, czasu pobytu, stałej godziny i notatki – wspólne dla dodawania i edycji. */
function detailFields(initial: Partial<Wish> = {}) {
  const time = h('select', { 'aria-label': 'Pora' }, h('option', { value: '' }, 'Pora – obojętnie'), ...(Object.keys(TIME_LABEL) as DayTime[]).filter((t) => t !== 'dowolna').map((t) => h('option', { value: t, selected: initial.preferredTime === t }, TIME_LABEL[t])));
  const duration = h('select', { 'aria-label': 'Czas pobytu' }, h('option', { value: '' }, 'Czas pobytu – nie wiem'), ...DURATIONS.map((m) => h('option', { value: String(m), selected: initial.durationMin === m }, durationLabel(m))));
  const fixed = h('input', { type: 'time', value: initial.fixedTime ?? '', 'aria-label': 'Stała godzina' });
  const note = h('textarea', { rows: '2', maxlength: '300', placeholder: 'Np. bilety online, zamknięte w poniedziałki', 'aria-label': 'Notatka' });
  note.value = initial.note ?? '';
  const el = h(
    'div',
    { class: 'wish-fields' },
    h('div', { class: 'two-col' }, time, duration),
    h('label', { class: 'field' }, h('span', {}, 'Stała godzina (bilet, rezerwacja) – opcjonalnie'), fixed),
    note,
  );
  const read = (): Pick<WishDetails, 'preferredTime' | 'durationMin' | 'fixedTime' | 'note'> => ({
    preferredTime: (time.value || undefined) as DayTime | undefined,
    durationMin: duration.value ? Number(duration.value) : undefined,
    fixedTime: fixed.value || undefined,
    note: note.value.trim() || undefined,
  });
  return { el, read };
}

function priorityPicker(initial: Priority = 'nice') {
  let value: Priority = initial;
  const make = (p: Priority) =>
    h('button', { type: 'button', 'aria-pressed': String(p === value), onclick: () => set(p) }, p === 'must' ? '❤️ Muszę' : '👍 Fajnie by było');
  const wrap = h('div', { class: 'segmented segmented--2', role: 'group', 'aria-label': 'Jak bardzo chcesz' });
  const set = (p: Priority) => {
    value = p;
    wrap.replaceChildren(make('must'), make('nice'));
  };
  set(initial);
  return { el: wrap, value: () => value };
}

export function wishlistSection(trip: Trip, me: Me, near?: { lat: number; lng: number }): HTMLElement {
  const wrap = h('div', { class: 'wishlist' }, h('p', { class: 'muted' }, 'Wczytuję…'));
  let wishes: Wish[] = [];

  const reload = async () => {
    wishes = await listWishes(trip.id).catch(() => wishes);
    draw();
  };

  const run = async (action: () => Promise<unknown>, fail = 'Nie udało się zapisać.') => {
    try {
      await action();
      await reload();
    } catch {
      toast(navigator.onLine ? fail : 'Brak internetu – spróbuj po połączeniu.');
    }
  };

  // ---------- dodawanie ----------
  const addForm = () => {
    const box = h('div', { class: 'card card--inner wish-add' });
    const search = h('input', { type: 'search', placeholder: 'Szukaj miejsca, np. Fushimi Inari', autocomplete: 'off', 'aria-label': 'Szukaj miejsca' });
    const results = h('div', { class: 'zone-results', role: 'listbox' });
    const link = h('input', { type: 'url', placeholder: 'albo wklej link z Google Maps', 'aria-label': 'Link z Google Maps' });
    const name = h('input', { type: 'text', maxlength: '120', placeholder: 'Nazwa miejsca', 'aria-label': 'Nazwa miejsca' });
    const chosen = h('p', { class: 'muted' });
    let hit: PlaceHit | null = null;
    let linked: ReturnType<typeof parseMapsLink> = null;
    const fields = detailFields();
    const priority = priorityPicker();
    const error = h('p', { class: 'error', role: 'alert' });
    const save = h('button', { type: 'button', class: 'btn' }, 'Dodaj do listy');

    let timer: number | undefined;
    search.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const found = await searchOsm(search.value, near).catch(() => null);
        results.replaceChildren(
          ...(found === null
            ? [h('p', { class: 'muted' }, navigator.onLine ? 'Wyszukiwarka nie odpowiada – wpisz nazwę albo wklej link.' : 'Bez internetu – wpisz nazwę ręcznie.')]
            : found.map((f) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'zone-option',
                    onclick: () => {
                      hit = f;
                      name.value = f.name;
                      chosen.textContent = `📍 ${f.address || 'z mapy OpenStreetMap'}`;
                      results.replaceChildren();
                      search.value = '';
                    },
                  },
                  h('span', {}, f.name),
                  h('span', { class: 'muted' }, f.address),
                ),
              )),
        );
      }, 400);
    });
    link.addEventListener('change', () => {
      linked = parseMapsLink(link.value);
      if (!link.value.trim()) return void (linked = null);
      if (!linked) return void (error.textContent = 'To nie wygląda na link z Google Maps.');
      error.textContent = '';
      if (linked.name && !name.value) name.value = linked.name;
      chosen.textContent = linked.lat !== undefined ? `📍 ${linked.lat.toFixed(4)}, ${linked.lng!.toFixed(4)}` : '🔗 link do mapy';
    });

    save.addEventListener('click', async () => {
      error.textContent = '';
      const title = name.value.trim();
      if (!title) return void (error.textContent = 'Podaj nazwę miejsca albo wybierz je z wyszukiwarki.');
      const place = hit && hit.name === title
        ? { lat: hit.lat, lng: hit.lng, address: hit.address || undefined, osm: hit.osm }
        : linked?.lat !== undefined
          ? { lat: linked.lat, lng: linked.lng }
          : undefined;
      const cleanPlace = place ? (Object.fromEntries(Object.entries(place).filter(([, v]) => v !== undefined)) as WishDetails['place']) : undefined;
      const id = wishId(title, cleanPlace);
      save.disabled = true;
      await run(async () => {
        const isNew = await addWish(trip.id, id, { name: title, place: cleanPlace, link: linked?.link, ...fields.read() }, me, priority.value());
        toast(isNew ? 'Dodano do listy życzeń' : 'To miejsce już jest na liście – dopisano Twój głos');
      });
      save.disabled = false;
    });

    box.append(
      h('h3', {}, 'Nowe miejsce'),
      h('div', { class: 'zone-picker' }, search, results),
      link,
      h('label', { class: 'field' }, h('span', {}, 'Nazwa'), name),
      chosen,
      fields.el,
      h('p', { class: 'field-label' }, 'Jak bardzo chcesz?'),
      priority.el,
      error,
      save,
    );
    return box;
  };

  // ---------- jedno miejsce ----------
  const wishCard = (w: Wish): HTMLElement => {
    const mine = w.votes[me.uid];
    const canEdit = me.isOrganizer || w.addedBy === me.uid;
    const canDelete = me.isOrganizer || (w.addedBy === me.uid && Object.keys(w.votes).every((u) => u === me.uid));
    const voters = Object.entries(w.votes).sort(([, a], [, b]) => (a.priority === b.priority ? a.name.localeCompare(b.name, 'pl') : a.priority === 'must' ? -1 : 1));
    const facts = [
      w.preferredTime ? TIME_LABEL[w.preferredTime] : '',
      w.durationMin ? `ok. ${durationLabel(w.durationMin)}` : '',
      w.fixedTime ? `stała godzina ${w.fixedTime}` : '',
    ].filter(Boolean);
    const card = h(
      'div',
      { class: 'wish' },
      h('div', { class: 'wish__head' }, h('span', { class: 'wish__name' }, w.name), h('span', { class: 'wish__score', title: '„muszę” liczy się podwójnie' }, `${score(w)} pkt`)),
      w.place?.address ? h('p', { class: 'muted wish__addr' }, w.place.address) : '',
      facts.length ? h('p', { class: 'wish__facts' }, facts.join(' · ')) : '',
      w.note ? h('p', { class: 'muted multiline' }, w.note) : '',
      h(
        'div',
        { class: 'badges' },
        ...voters.map(([, v]) => h('span', { class: `badge${v.priority === 'must' ? ' badge--must' : ''}` }, `${v.priority === 'must' ? '❤️' : '👍'} ${v.name}`)),
      ),
      h(
        'div',
        { class: 'actions actions--row' },
        h('button', { type: 'button', class: `chip-btn${mine?.priority === 'must' ? ' chip-btn--on' : ''}`, onclick: () => run(() => setVote(trip.id, w.id, me, mine?.priority === 'must' ? null : 'must')) }, '❤️ Muszę'),
        h('button', { type: 'button', class: `chip-btn${mine?.priority === 'nice' ? ' chip-btn--on' : ''}`, onclick: () => run(() => setVote(trip.id, w.id, me, mine?.priority === 'nice' ? null : 'nice')) }, '👍 Fajnie'),
        h('a', { class: 'chip-btn', href: mapsUrl(w) ?? '#', target: '_blank', rel: 'noopener' }, 'Mapa'),
      ),
      canEdit || canDelete
        ? h(
            'div',
            { class: 'wish__tools' },
            canEdit ? h('button', { type: 'button', class: 'link-btn', onclick: () => card.replaceWith(editCard(w)) }, 'Edytuj') : '',
            canDelete
              ? h('button', { type: 'button', class: 'link-btn', onclick: () => confirm(`Usunąć „${w.name}” z listy?`) && run(() => deleteWish(trip.id, w.id), 'Nie udało się usunąć.') }, 'Usuń')
              : '',
          )
        : '',
    );
    return card;
  };

  const editCard = (w: Wish): HTMLElement => {
    const name = h('input', { type: 'text', value: w.name, maxlength: '120', 'aria-label': 'Nazwa miejsca' });
    const fields = detailFields(w);
    const save = h('button', { type: 'button', class: 'btn' }, 'Zapisz');
    save.addEventListener('click', () => {
      if (!name.value.trim()) return toast('Podaj nazwę.');
      void run(() => updateWish(trip.id, w.id, { name: name.value.trim(), ...fields.read() }));
    });
    return h('div', { class: 'wish wish--edit' }, h('label', { class: 'field' }, h('span', {}, 'Nazwa'), name), fields.el, save, h('button', { type: 'button', class: 'link-btn', onclick: draw }, 'Anuluj'));
  };

  // ---------- całość ----------
  function draw() {
    const sorted = sortWishes(wishes);
    const addBtn = h('button', { type: 'button', class: 'btn btn--secondary' }, '+ Dodaj miejsce');
    const formSlot = h('div');
    addBtn.addEventListener('click', () => {
      formSlot.replaceChildren(addForm());
      addBtn.remove();
    });
    const exportBtn = h(
      'button',
      {
        type: 'button',
        class: 'link-btn',
        onclick: () => saveFile(`klub-lista-zyczen-${trip.id}.json`, exportWishlist(trip.title, wishes)),
      },
      'Pobierz listę (plik do planowania)',
    );
    wrap.replaceChildren(
      h('p', { class: 'muted' }, 'Co chcecie zobaczyć? Każde miejsce raz – dopisz się z „Muszę” albo „Fajnie”. Kolejność według zainteresowania.'),
      addBtn,
      formSlot,
      ...(sorted.length ? sorted.map(wishCard) : [h('p', { class: 'muted' }, 'Lista jest pusta – dodaj pierwsze miejsce.')]),
      sorted.length ? h('p', { class: 'muted wish__count' }, plural(sorted.length, 'miejsce', 'miejsca', 'miejsc')) : '',
      sorted.length && me.isOrganizer ? exportBtn : '',
    );
  }

  void reload();
  return wrap;
}
