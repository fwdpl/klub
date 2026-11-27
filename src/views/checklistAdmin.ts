import {
  buildChecklistExport,
  hasChanges,
  isDate,
  isFor,
  linkError,
  nameKey,
  parseChecklistFile,
  slugify,
  sortTasks,
  TASK_LIMITS,
  type ChecklistContext,
  type ChecklistOp,
  type ImportResult,
  type Person,
  type Preview,
  type Progress,
} from '../checklist/importChecklist';
import { commitOps, deleteTask, hasLegacyTemplate, listAllTasks, listChecklists, saveTask } from '../data/checklist';
import { saveFile } from '../data/backup';
import { getTrip, listMembers, type Trip } from '../data/trips';
import { TASK_SCHEMA_VERSION, type ChecklistDoc, type TaskDoc, type TaskLink } from '../model/types';
import { h, present, render, toast } from '../ui';
import { fold } from './fold';
import { noticeCard } from './notify';
import { checklistCard, formatLocal } from './tripDetails';

// Organizator: checklista przed wyjazdem (zadanie docs/tasks/zadanie-checklisty.md §3.4, §3.5, §7):
// zadania (prosty edytor – decyzja Jacka z 27.11.2026), import JSON z podglądem, eksport stanu,
// tabela postępu i podgląd listy wybranej osoby.

interface Data {
  trip: Trip;
  approved: Person[];
  everyone: Person[];
  tasks: TaskDoc[];
  docs: Map<string, ChecklistDoc>;
  progress: Progress[];
  legacyTemplate: boolean;
}

async function load(tripId: string): Promise<Data | null> {
  const [trip, members, tasks, lists, legacyTemplate] = await Promise.all([
    getTrip(tripId),
    listMembers(tripId).catch(() => []),
    listAllTasks(tripId),
    listChecklists(tripId),
    hasLegacyTemplate(tripId),
  ]);
  if (!trip) return null;
  const person = (m: { uid: string; displayName: string }) => ({ uid: m.uid, displayName: m.displayName });
  return {
    trip,
    approved: members.filter((m) => m.status === 'approved').map(person),
    everyone: members.map(person),
    tasks: sortTasks(tasks),
    docs: lists.docs,
    progress: lists.progress,
    legacyTemplate,
  };
}

const contextOf = (d: Data): ChecklistContext => ({
  tripId: d.trip.id,
  approved: d.approved,
  everyone: d.everyone,
  tasks: d.tasks,
  progress: d.progress,
  legacyTemplate: d.legacyTemplate,
});

const doneCount = (d: Data, taskId: string) => d.progress.filter((p) => p.done.includes(taskId)).length;
const shortDay = (date: Date | null) => (date ? date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric' }) : '');
const plural = (n: number, one: string, few: string, many: string) => {
  const last = n % 10;
  const teen = n % 100 >= 12 && n % 100 <= 14;
  return `${n} ${n === 1 ? one : last >= 2 && last <= 4 && !teen ? few : many}`;
};

export async function showChecklistAdmin(tripId: string): Promise<void> {
  const back = h('a', { class: 'back', href: `#/wyjazd/${tripId}` }, '← Wyjazd');
  let data = await load(tripId).catch(() => null);
  if (!data) {
    render(back, h('h1', {}, 'Checklista'), h('p', { class: 'error' }, 'Nie udało się wczytać checklisty. Sprawdź połączenie z internetem.'));
    return;
  }
  const trip = data.trip;

  const summaryBox = h('div', { role: 'status' });
  const tasksBox = h('div');
  const progressBox = h('div');
  const previewBox = h('div');

  const refresh = async () => {
    const next = await load(tripId).catch(() => null);
    if (next) data = next;
    drawTasks();
    drawProgress();
    drawPreview();
  };

  // ---------- zadania: prosty edytor ----------
  let editing: string | null = null; // id zadania albo 'new'

  const taskForm = (t: TaskDoc | null): HTMLElement => {
    const d = data!;
    const text = h('input', { type: 'text', maxlength: String(TASK_LIMITS.text), value: t?.text ?? '', 'aria-label': 'Treść zadania', placeholder: 'np. Kup eSIM na USA' });
    const details = h('textarea', { rows: '3', maxlength: String(TASK_LIMITS.details), 'aria-label': 'Opis (opcjonalnie)', placeholder: 'Opis (opcjonalnie)' });
    details.value = t?.details ?? '';
    const categories = [...new Set(d.tasks.map((x) => x.category).filter((c): c is string => !!c))];
    const listId = `cat-${Math.random().toString(36).slice(2, 8)}`;
    const category = h('input', {
      type: 'text',
      maxlength: String(TASK_LIMITS.category),
      value: t?.category ?? '',
      list: listId,
      'aria-label': 'Kategoria',
      placeholder: 'np. Dokumenty',
    });
    const due = h('input', { type: 'date', value: t?.due ?? '', 'aria-label': 'Termin' });

    // dla kogo: wszyscy albo wybrane osoby (zatwierdzone)
    const all = h('input', { type: 'checkbox' });
    all.checked = !t || t.audience.includes('all');
    const boxes = d.approved.map((p) => {
      const box = h('input', { type: 'checkbox', value: p.uid });
      box.checked = !!t && !t.audience.includes('all') && t.audience.includes(p.uid);
      return { box, el: h('label', { class: 'audience__person' }, box, h('span', {}, p.displayName)) };
    });
    const peopleEl = h('div', { class: 'audience__people' }, ...boxes.map((b) => b.el));
    const sync = () => (peopleEl.hidden = all.checked);
    all.addEventListener('change', sync);
    sync();

    // linki (do 5): tekst przycisku, adres https://, „partnerski”
    const linkRows: { el: HTMLElement; read: () => { label: string; url: string; sponsored: boolean } }[] = [];
    const linksEl = h('div', { class: 'task-links-edit' });
    const addLink = h('button', { type: 'button', class: 'btn btn--secondary' }, '+ Link');
    const addLinkRow = (l?: TaskLink) => {
      const label = h('input', { type: 'text', maxlength: String(TASK_LIMITS.label), value: l?.label ?? '', placeholder: 'Tekst przycisku', 'aria-label': 'Tekst przycisku' });
      const url = h('input', {
        type: 'url',
        value: l?.url ?? '',
        placeholder: 'https://…',
        'aria-label': 'Adres linku',
        inputmode: 'url',
        autocapitalize: 'off',
        spellcheck: 'false',
      });
      const sponsored = h('input', { type: 'checkbox' });
      sponsored.checked = l?.sponsored ?? true;
      const row = {
        el: h(
          'div',
          { class: 'task-link-edit' },
          label,
          url,
          h('label', { class: 'audience__person' }, sponsored, h('span', {}, 'link partnerski')),
          h(
            'button',
            {
              type: 'button',
              class: 'row-remove',
              'aria-label': 'Usuń link',
              onclick: () => {
                linkRows.splice(linkRows.indexOf(row), 1);
                row.el.remove();
                addLink.hidden = linkRows.length >= TASK_LIMITS.links;
              },
            },
            '×',
          ),
        ),
        // adres bez zmian (linki partnerskie) – tylko obcięte spacje z brzegów pola
        read: () => ({ label: label.value.trim(), url: url.value.trim(), sponsored: sponsored.checked }),
      };
      linkRows.push(row);
      linksEl.append(row.el);
      addLink.hidden = linkRows.length >= TASK_LIMITS.links;
    };
    (t?.links ?? []).forEach(addLinkRow);
    addLink.addEventListener('click', () => addLinkRow());

    const done = t ? doneCount(d, t.id) : 0;
    const reset = h('input', { type: 'checkbox' });
    const error = h('p', { class: 'error', role: 'alert' });
    const save = h('button', { type: 'button', class: 'btn' }, t ? 'Zapisz zadanie' : 'Dodaj zadanie');

    save.addEventListener('click', async () => {
      error.textContent = '';
      const audience = all.checked ? ['all'] : boxes.filter((b) => b.box.checked).map((b) => b.box.value);
      const links = linkRows.map((r) => r.read()).filter((l) => l.label || l.url);
      if (!text.value.trim()) return void (error.textContent = 'Wpisz treść zadania.');
      if (!audience.length) return void (error.textContent = 'Zaznacz „Wszyscy uczestnicy” albo wybrane osoby.');
      if (due.value && !isDate(due.value)) return void (error.textContent = 'Termin nie jest poprawną datą.');
      for (const l of links) {
        const e = linkError(l);
        if (e) return void (error.textContent = `Popraw link: ${e}.`);
      }
      const next: TaskDoc = {
        id: t?.id ?? slugify(text.value, new Set(d.tasks.map((x) => x.id))),
        text: text.value.trim(),
        ...(details.value.trim() ? { details: details.value.trim() } : {}),
        ...(links.length ? { links } : {}),
        audience,
        ...(due.value ? { due: due.value } : {}),
        ...(category.value.trim() ? { category: category.value.trim() } : {}),
        order: t?.order ?? Math.max(0, ...d.tasks.map((x) => x.order)) + 1,
        archived: t?.archived ?? false,
        schemaVersion: TASK_SCHEMA_VERSION,
      };
      save.disabled = true;
      try {
        if (t && reset.checked && done) {
          const ops: ChecklistOp[] = [
            { kind: 'setTask', task: next },
            ...d.progress.filter((p) => p.done.includes(t.id)).map((p) => ({ kind: 'clearDone' as const, uid: p.uid, taskIds: [t.id] })),
          ];
          await commitOps(tripId, ops);
        } else await saveTask(tripId, next);
        editing = null;
        toast(t ? 'Zapisano zadanie' : 'Dodano zadanie');
        await refresh();
      } catch {
        error.textContent = navigator.onLine ? 'Nie udało się zapisać.' : 'Brak połączenia z internetem.';
        save.disabled = false;
      }
    });

    const run = (label: string, action: () => Promise<void>, ok: string) =>
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--secondary',
          onclick: async (e: Event) => {
            (e.currentTarget as HTMLButtonElement).disabled = true;
            try {
              await action();
              editing = null;
              toast(ok);
              await refresh();
            } catch {
              (e.currentTarget as HTMLButtonElement).disabled = false;
              toast(navigator.onLine ? 'Nie udało się zapisać.' : 'Brak połączenia z internetem.');
            }
          },
        },
        label,
      );

    return h(
      'div',
      { class: 'card card--inner task-edit' },
      h('h3', {}, t ? 'Zmień zadanie' : 'Nowe zadanie'),
      h('label', { class: 'field' }, h('span', {}, 'Treść'), text),
      h('label', { class: 'field' }, h('span', {}, 'Opis (opcjonalnie)'), details),
      h('div', { class: 'two-col' }, h('label', { class: 'field' }, h('span', {}, 'Kategoria'), category), h('label', { class: 'field' }, h('span', {}, 'Termin'), due)),
      h('datalist', { id: listId }, ...categories.map((c) => h('option', { value: c }))),
      h('div', { class: 'field audience' }, h('span', {}, 'Dla kogo'), h('label', { class: 'audience__person' }, all, h('span', {}, 'Wszyscy uczestnicy')), peopleEl),
      h('p', { class: 'field-label' }, 'Linki (adres zapisuje się dokładnie tak, jak go wkleisz)'),
      linksEl,
      addLink,
      t && done > 0 && h('label', { class: 'audience__person' }, reset, h('span', {}, `Wyczyść odhaczenia (${done}) – wszyscy mają to zrobić jeszcze raz`)),
      error,
      h(
        'div',
        { class: 'actions actions--row' },
        save,
        t &&
          run(
            t.archived ? 'Przywróć' : 'Archiwizuj',
            () => saveTask(tripId, { ...t, archived: !t.archived }),
            t.archived ? 'Przywrócono zadanie' : 'Zarchiwizowano – odhaczenia zostają',
          ),
        t &&
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn--secondary',
              onclick: async () => {
                if (!confirm(`Usunąć „${t.text}”${done ? ` razem z odhaczeniami (${done})` : ''}? Tego nie da się cofnąć. Archiwizacja zostawia historię.`)) return;
                try {
                  await deleteTask(tripId, t.id, d.progress);
                  editing = null;
                  toast('Usunięto zadanie');
                  await refresh();
                } catch {
                  toast(navigator.onLine ? 'Nie udało się usunąć.' : 'Brak połączenia z internetem.');
                }
              },
            },
            'Usuń',
          ),
        h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => ((editing = null), drawTasks()) }, 'Anuluj'),
      ),
    );
  };

  const tasksFold = fold({ id: `${tripId}:checklist-admin:tasks`, title: 'Zadania', open: true }, tasksBox);
  const drawTasks = () => {
    const d = data!;
    const active = d.tasks.filter((t) => !t.archived);
    const archived = d.tasks.filter((t) => t.archived);
    (tasksFold.querySelector('.fold__meta') as HTMLElement).textContent = archived.length ? `${active.length} + ${archived.length} w archiwum` : String(active.length);
    const row = (t: TaskDoc) => {
      if (editing === t.id) return taskForm(t);
      const who = t.audience.includes('all') ? 'wszyscy' : t.audience.map((uid) => d.everyone.find((p) => p.uid === uid)?.displayName ?? '?').join(', ');
      return h(
        'div',
        { class: `task-admin${t.archived ? ' task-admin--archived' : ''}` },
        h(
          'div',
          {},
          h('div', { class: 'task-admin__text' }, t.text),
          h(
            'div',
            { class: 'muted task-admin__meta' },
            [
              t.category,
              `dla: ${who}`,
              t.due && `termin ${formatLocal(t.due)}`,
              t.links?.length && `linki: ${t.links.length}`,
              `✓ ${doneCount(d, t.id)}`,
              t.archived && 'w archiwum',
            ]
              .filter(Boolean)
              .join(' · '),
          ),
          h('div', { class: 'muted task-admin__id' }, `id: ${t.id}`),
        ),
        h('button', { type: 'button', class: 'link-btn', 'aria-label': `Zmień: ${t.text}`, onclick: () => ((editing = t.id), drawTasks()) }, 'zmień'),
      );
    };
    tasksBox.replaceChildren(
      ...present(
        !d.tasks.length && h('p', { class: 'muted' }, 'Brak zadań. Dodaj je tutaj albo wgraj plik z czatu checklisty (niżej).'),
        ...active.map(row),
        editing === 'new' ? taskForm(null) : h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => ((editing = 'new'), drawTasks()) }, '+ Dodaj zadanie'),
        archived.length > 0 && h('div', { class: 'check-divider' }, 'Archiwum (uczestnicy ich nie widzą)'),
        ...archived.map(row),
      ),
    );
  };

  // ---------- import ----------
  const textarea = h('textarea', { rows: '8', placeholder: '{ "schema": "trip-checklist", … }', 'aria-label': 'Treść pliku checklisty', spellcheck: 'false' });
  const file = h('input', { type: 'file', accept: '.json,application/json' });
  const result = h('div');
  const check = h('button', { type: 'button', class: 'btn' }, 'Sprawdź plik');
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    textarea.value = await f.text();
    runCheck();
  });

  const section = (title: string, items: HTMLElement[], cls = '') =>
    items.length > 0 && h('div', { class: `import-section ${cls}` }, h('h3', {}, `${title} (${items.length})`), h('ul', {}, ...items));
  const li = (...c: (string | HTMLElement | false | undefined)[]) => h('li', {}, ...c.filter((x): x is string | HTMLElement => !!x));

  const showPreview = (r: Extract<ImportResult, { ok: true }>) => {
    const p = r.preview;
    const saveBtn = h('button', { type: 'button', class: 'btn' }, 'Zapisz');
    const progress = h('p', { class: 'muted', role: 'status' });
    let confirmEl: HTMLElement | null = null;
    if (p.mode === 'replace') {
      const input = h('input', { type: 'text', placeholder: trip.title, 'aria-label': 'Nazwa wyjazdu do potwierdzenia', autocomplete: 'off' });
      saveBtn.disabled = true;
      input.addEventListener('input', () => (saveBtn.disabled = nameKey(input.value) !== nameKey(trip.title)));
      confirmEl = h(
        'div',
        { class: 'card card--danger' },
        h('h3', {}, 'Tryb „replace”: zastąpienie całej checklisty'),
        h(
          'p',
          {},
          `Zniknie ${plural(p.removed!.tasks, 'zadanie', 'zadania', 'zadań')} i ${plural(p.removed!.done, 'odhaczenie', 'odhaczenia', 'odhaczeń')} wszystkich uczestników`,
          data!.legacyTemplate ? ' oraz stara wspólna checklista ze szczegółów.' : '.',
          ' Własne punkty uczestników zostają.',
        ),
        h('label', { class: 'field' }, h('span', {}, `Wpisz nazwę wyjazdu („${trip.title}”), żeby potwierdzić`), input),
      );
    }
    const changed = hasChanges(r);
    saveBtn.hidden = !changed;
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      check.disabled = true;
      try {
        await commitOps(tripId, r.ops, (done, total) => {
          if (total > 500) progress.textContent = `Zapisuję… ${done}/${total}`;
        });
        result.replaceChildren();
        textarea.value = '';
        file.value = '';
        showSummary(p);
        await refresh();
      } catch {
        progress.textContent = '';
        toast(navigator.onLine ? 'Nie udało się zapisać. Sprawdź plik jeszcze raz (część partii mogła się zapisać).' : 'Brak połączenia z internetem.');
        saveBtn.disabled = false;
      } finally {
        check.disabled = false;
      }
    });

    result.replaceChildren(
      ...present(
        h('p', {}, h('b', {}, `Tryb: ${p.mode === 'replace' ? 'replace (zastąpienie wszystkiego)' : 'merge (dopisanie i poprawki)'}`)),
        section(
          'Nowe',
          p.added.map((a) => li(h('b', {}, a.text), ` – ${a.who}`)),
        ),
        section(
          'Zmienione',
          p.changed.map((c) => li(h('b', {}, c.text), h('ul', {}, ...c.changes.map((x) => li(`${x.field}: `, h('s', {}, x.before), ' → ', x.after))))),
        ),
        section(
          'Do archiwizacji',
          p.archived.map((a) => li(a.text, h('span', { class: 'muted' }, ` – odhaczenia (${a.done}) zostają`))),
        ),
        section(
          'Przywrócone z archiwum',
          p.restored.map((a) => li(a.text)),
        ),
        section(
          'Do usunięcia',
          p.deleted.map((a) => li(h('b', {}, a.text), h('span', { class: 'error' }, ` – zniknie odhaczeń: ${a.done}`))),
          'import-section--danger',
        ),
        section(
          'Reset odhaczeń',
          p.reset.map((a) => li(h('b', {}, a.text), ` – ${a.names.join(', ')}`)),
          'import-section--danger',
        ),
        p.mode === 'merge' &&
          p.untouched > 0 &&
          h('p', { class: 'muted' }, `${plural(p.untouched, 'zadanie nie jest', 'zadania nie są', 'zadań nie jest')} w pliku i zostaje bez zmian.`),
        p.same > 0 && h('p', { class: 'muted' }, `${plural(p.same, 'zadanie', 'zadania', 'zadań')} z pliku bez zmian.`),
        r.warnings.length > 0 && h('div', { class: 'import-warnings' }, h('h3', {}, 'Ostrzeżenia'), h('ul', {}, ...r.warnings.map((w) => li(w)))),
        !changed && h('p', {}, h('b', {}, 'Plik nic nie zmienia – wszystko jest już zapisane.')),
        confirmEl,
        progress,
        saveBtn,
      ),
    );
  };

  const runCheck = () => {
    const r = parseChecklistFile(textarea.value, contextOf(data!));
    if (r.ok) return showPreview(r);
    result.replaceChildren(
      h(
        'div',
        { class: 'import-errors', role: 'alert' },
        h('h3', {}, 'Błędy – popraw plik (np. w czacie checklisty) i sprawdź jeszcze raz'),
        h('ul', {}, ...r.errors.map((e) => h('li', {}, e))),
      ),
      ...(r.warnings.length ? [h('div', { class: 'import-warnings' }, h('h3', {}, 'Ostrzeżenia'), h('ul', {}, ...r.warnings.map((w) => h('li', {}, w))))] : []),
    );
  };
  check.addEventListener('click', runCheck);

  const showSummary = (p: Preview) => {
    const parts = [
      p.added.length && plural(p.added.length, 'nowe', 'nowe', 'nowych'),
      p.changed.length && plural(p.changed.length, 'zmienione', 'zmienione', 'zmienionych'),
      p.archived.length && `${p.archived.length} w archiwum`,
      p.restored.length && `${p.restored.length} przywrócone`,
      p.deleted.length && `${p.deleted.length} usunięte`,
      p.reset.length && `reset odhaczeń: ${p.reset.length}`,
    ].filter(Boolean);
    const news = p.added.length + p.changed.length + p.restored.length;
    summaryBox.replaceChildren(
      ...present(
        h(
          'div',
          { class: 'card card--ok' },
          h('h2', {}, 'Checklista zapisana'),
          h('p', {}, parts.join(', ') || 'bez zmian'),
          p.mode === 'replace' && h('p', { class: 'muted' }, 'Poprzednie zadania i odhaczenia usunięte.'),
        ),
        // powiadomienie tylko na żądanie (jak po zmianie planu) – automatyczny push poza zakresem
        news > 0 &&
          noticeCard(tripId, {
            audience: 'approved',
            title: 'Checklista przed wyjazdem',
            body: `${trip.title}: ${p.added.length ? 'nowe zadania' : 'zmiany'} na liście „Do zrobienia”`,
          }),
      ),
    );
    summaryBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ---------- eksport ----------
  const exportData = () => buildChecklistExport({ ...contextOf(data!), tripTitle: trip.title });
  const copyBtn = h('button', { type: 'button', class: 'btn btn--secondary' }, 'Kopiuj eksport');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportData(), null, 2));
      toast('Skopiowane – wklej w czacie checklisty z Claude.');
    } catch {
      toast('Nie udało się skopiować – użyj „Pobierz plik”.');
    }
  });
  const fileBtn = h('button', { type: 'button', class: 'btn btn--secondary' }, 'Pobierz plik');
  fileBtn.addEventListener('click', () => saveFile(`checklista-eksport-${tripId}-${new Date().toISOString().slice(0, 10)}.json`, exportData()));

  // ---------- postęp ----------
  let onlyOpen = false;
  const drawProgress = () => {
    const d = data!;
    const active = d.tasks.filter((t) => !t.archived);
    // kolumny: zatwierdzeni, do których trafia choć jedno zadanie
    const people = d.approved.filter((p) => active.some((t) => isFor(t, p.uid)));
    const doneAt = (uid: string, taskId: string) => {
      const c = d.docs.get(uid);
      return c && taskId in c.done ? { at: c.done[taskId] } : null;
    };
    const rows = active.filter((t) => !onlyOpen || people.some((p) => isFor(t, p.uid) && !doneAt(p.uid, t.id)));
    const filter = h('input', { type: 'checkbox' });
    filter.checked = onlyOpen;
    filter.addEventListener('change', () => ((onlyOpen = filter.checked), drawProgress()));
    progressBox.replaceChildren(
      ...present(
        !active.length && h('p', { class: 'muted' }, 'Brak aktywnych zadań.'),
        !!active.length && !people.length && h('p', { class: 'muted' }, 'Nie ma jeszcze zatwierdzonych uczestników.'),
        !!active.length && !!people.length && h('label', { class: 'audience__person' }, filter, h('span', {}, 'Tylko niezrobione')),
        !!active.length &&
          !!people.length &&
          h(
            'div',
            { class: 'table-scroll' },
            h(
              'table',
              { class: 'progress-table' },
              h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Zadanie'), ...people.map((p) => h('th', { scope: 'col' }, p.displayName)))),
              h(
                'tbody',
                {},
                ...rows.map((t) => {
                  const forWhom = people.filter((p) => isFor(t, p.uid));
                  const doneN = forWhom.filter((p) => doneAt(p.uid, t.id)).length;
                  return h(
                    'tr',
                    {},
                    h('th', { scope: 'row' }, t.text, h('span', { class: 'muted progress-table__count' }, ` ${doneN}/${forWhom.length}`)),
                    ...people.map((p) => {
                      if (!isFor(t, p.uid)) return h('td', { class: 'progress-table__na', 'aria-label': 'nie dotyczy' }, '–');
                      const x = doneAt(p.uid, t.id);
                      return x ? h('td', { class: 'progress-table__done' }, '✓', h('small', {}, ` ${shortDay(x.at)}`)) : h('td', { 'aria-label': 'nie zrobione' }, '');
                    }),
                  );
                }),
              ),
            ),
          ),
        onlyOpen && !rows.length && h('p', {}, 'Wszystko zrobione ✓'),
      ),
    );
  };

  // ---------- podgląd listy osoby ----------
  let previewUid = '';
  const drawPreview = () => {
    const d = data!;
    const select = h(
      'select',
      { 'aria-label': 'Podgląd jako uczestnik' },
      h('option', { value: '' }, 'Wybierz osobę…'),
      ...d.approved.map((p) => h('option', { value: p.uid, selected: p.uid === previewUid }, p.displayName)),
    );
    select.addEventListener('change', () => ((previewUid = select.value), drawPreview()));
    const person = d.approved.find((p) => p.uid === previewUid);
    const tasks = person ? d.tasks.filter((t) => !t.archived && isFor(t, person.uid)) : [];
    previewBox.replaceChildren(
      ...present(
        h('label', { class: 'field' }, h('span', {}, 'Podgląd jako uczestnik'), select),
        person && h('div', { class: 'previewing' }, checklistCard(tripId, person.uid, tasks, d.docs.get(person.uid) ?? { done: {}, items: [] }, { readOnly: true })),
      ),
    );
  };

  drawTasks();
  drawProgress();
  drawPreview();

  render(
    back,
    h('h1', {}, 'Checklista przed wyjazdem'),
    h('p', { class: 'muted' }, `${trip.title}. Uczestnik widzi tylko zadania dla siebie, bez archiwalnych. Identyfikator wyjazdu do plików: `, h('code', {}, tripId)),
    summaryBox,
    tasksFold,
    fold(
      { id: `${tripId}:checklist-admin:import`, title: 'Import z pliku (JSON)', open: !data.tasks.length },
      h(
        'p',
        { class: 'muted' },
        'Plik z czatu checklisty z Claude (format „trip-checklist”). Najpierw podgląd zmian – nic nie zapisze się bez „Zapisz”. Import nie kasuje odhaczeń, chyba że plik wprost o to prosi.',
      ),
      file,
      textarea,
      check,
      result,
    ),
    fold(
      { id: `${tripId}:checklist-admin:export`, title: 'Eksport checklisty', open: false },
      h(
        'p',
        { class: 'muted' },
        'Stan do wklejenia w czacie checklisty: identyfikator wyjazdu, uczestnicy, wszystkie zadania (także archiwalne) i liczba odhaczeń – bez dat i bez tego, kto odhaczył.',
      ),
      h('div', { class: 'actions actions--row' }, copyBtn, fileBtn),
    ),
    fold({ id: `${tripId}:checklist-admin:progress`, title: 'Postęp', open: true }, progressBox),
    fold({ id: `${tripId}:checklist-admin:preview`, title: 'Podgląd jako uczestnik', open: false }, previewBox),
  );
}
