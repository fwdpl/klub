import { TASK_SCHEMA_VERSION, type TaskDoc, type TaskLink } from '../model/types';

// Checklisty importowane z JSON (zadanie docs/tasks/zadanie-checklisty.md, format docs/checklist-import-format.md).
// Zasada: kolejne importy (merge) tylko dopisują i poprawiają – odhaczeń nie ruszają, chyba że plik wprost
// każe (resetDone, delete) albo jest to tryb replace. Tu sama logika: plik → plan zmian → operacje zapisu,
// bez DOM i bez bazy (testy: importChecklist.test.ts).

export const CHECKLIST_SCHEMA = 'trip-checklist';
export const CHECKLIST_EXPORT_SCHEMA = 'trip-checklist-export';
export const CHECKLIST_SCHEMA_VERSION = 1;

export const TASK_ID_RE = /^[a-z0-9-]{1,60}$/;
export const TASK_LIMITS = { text: 200, details: 1000, label: 40, category: 60, links: 5 } as const;

/** Liczba operacji w jednej partii zapisu (limit writeBatch w Firestore). */
export const BATCH_LIMIT = 500;

export interface Person {
  uid: string;
  displayName: string;
}

/** Postęp jednej osoby: id odhaczonych zadań. */
export interface Progress {
  uid: string;
  done: string[];
  /** Dokument ma dane starego modelu checklisty (templateDone) – replace je czyści. */
  legacy?: boolean;
}

export interface ChecklistContext {
  tripId: string;
  /** Zatwierdzeni uczestnicy – wśród nich szukamy imion z pliku. */
  approved: Person[];
  /** Wszystkie osoby wyjazdu (także po rezygnacji) – do opisu w podglądzie. */
  everyone?: Person[];
  tasks: TaskDoc[];
  progress: Progress[];
  /** Wspólna checklista w starym modelu (info/main.checklistTemplate) – replace ją usuwa. */
  legacyTemplate?: boolean;
}

/** Operacje zapisu – wykonuje je warstwa danych (src/data/checklist.ts), po kolei, w partiach ≤ BATCH_LIMIT. */
export type ChecklistOp =
  | { kind: 'setTask'; task: TaskDoc }
  | { kind: 'deleteTask'; id: string }
  /** Usuń klucze done podanych zadań u jednej osoby. */
  | { kind: 'clearDone'; uid: string; taskIds: string[] }
  /** Replace: wyczyść całe done (i stare templateDone) u osoby; jej własne punkty zostają. */
  | { kind: 'clearAllDone'; uid: string }
  /** Replace: usuń wspólną checklistę starego modelu z info/main. */
  | { kind: 'dropLegacyTemplate' };

export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

export interface Preview {
  mode: 'merge' | 'replace';
  added: { id: string; text: string; who: string }[];
  changed: { id: string; text: string; changes: FieldChange[] }[];
  archived: { id: string; text: string; done: number }[];
  restored: { id: string; text: string }[];
  deleted: { id: string; text: string; done: number }[];
  reset: { id: string; text: string; names: string[] }[];
  /** Zadania, których nie ma w pliku – zostają bez zmian. */
  untouched: number;
  /** Zadania w pliku, w których nic się nie zmienia. */
  same: number;
  /** Replace: ile zadań i odhaczeń zniknie. */
  removed?: { tasks: number; done: number };
}

export type ImportResult = { ok: true; preview: Preview; ops: ChecklistOp[]; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function isDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Imię do porównań: bez wielkości liter, polskich znaków i podwójnych spacji („Łucja” = „lucja”). */
export function nameKey(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Link do zapisu: tylko https://, adres dosłownie (bez trim, bez normalizacji). Zwraca komunikat błędu albo null. */
export function linkError(link: { label?: unknown; url?: unknown; sponsored?: unknown }): string | null {
  if (typeof link.label !== 'string' || !link.label.trim()) return 'link bez „label” (tekst przycisku)';
  if (link.label.trim().length > TASK_LIMITS.label) return `„label” linku ma ponad ${TASK_LIMITS.label} znaków`;
  if (typeof link.url !== 'string' || !link.url) return 'link bez „url”';
  if (!link.url.startsWith('https://')) return `link „${link.url.slice(0, 60)}” – dozwolone są tylko adresy https://`;
  if (/\s/.test(link.url)) return `link „${link.url.slice(0, 60)}” zawiera spacje`;
  try {
    new URL(link.url);
  } catch {
    return `link „${link.url.slice(0, 60)}” nie jest poprawnym adresem`;
  }
  if (link.sponsored !== undefined && typeof link.sponsored !== 'boolean') return '„sponsored” musi być true albo false';
  return null;
}

const sameAudience = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
const linksKey = (l?: TaskLink[]) => JSON.stringify((l ?? []).map((x) => [x.label, x.url, x.sponsored]));

export function audienceText(audience: string[], people: Person[]): string {
  if (audience.includes('all')) return 'wszyscy';
  return audience.map((uid) => people.find((p) => p.uid === uid)?.displayName ?? 'osoba spoza wyjazdu').join(', ');
}

const TASK_FIELDS = ['id', 'text', 'details', 'links', 'audience', 'due', 'category', 'order', 'archived', 'resetDone', 'action'];
const TOP_FIELDS = ['schema', 'schemaVersion', 'tripId', 'mode', 'tasks'];

export function parseChecklistFile(text: string, ctx: ChecklistContext): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['To nie jest poprawny plik JSON (sprawdź, czy skopiowano całość).'], warnings: [] };
  }
  return planImport(data, ctx);
}

/** Plik → plan zmian (podgląd + operacje). Nic nie zapisuje. */
export function planImport(data: unknown, ctx: ChecklistContext): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (): ImportResult => ({ ok: false, errors, warnings });
  if (!isObject(data)) return (errors.push('Plik nie ma oczekiwanej struktury (obiekt z polem „tasks”).'), fail());
  if (data.schema === CHECKLIST_EXPORT_SCHEMA) return (errors.push('To jest eksport checklisty z aplikacji, nie plik do importu. Wklej go w czacie checklisty z Claude.'), fail());
  if (data.schema !== CHECKLIST_SCHEMA) errors.push(`Nieznany format: oczekiwano "schema": "${CHECKLIST_SCHEMA}".`);
  if (data.schemaVersion !== CHECKLIST_SCHEMA_VERSION)
    errors.push(`Nieobsługiwana wersja formatu (${String(data.schemaVersion)}) – aplikacja zna wersję ${CHECKLIST_SCHEMA_VERSION}.`);
  if (data.tripId !== ctx.tripId)
    errors.push(`Plik jest dla innego wyjazdu („${String(data.tripId)}”). Ten wyjazd ma identyfikator „${ctx.tripId}” – jest w „Eksporcie checklisty”.`);
  const mode = data.mode === undefined || data.mode === 'merge' ? 'merge' : data.mode === 'replace' ? 'replace' : null;
  if (!mode) errors.push('Pole „mode” musi mieć wartość "merge" albo "replace".');
  if (!Array.isArray(data.tasks)) errors.push('Brak listy „tasks”.');
  for (const k of Object.keys(data)) if (!TOP_FIELDS.includes(k)) warnings.push(`Nieznane pole „${k}” – pominięte.`);
  if (errors.length || !mode) return fail();

  const people = ctx.everyone ?? ctx.approved;
  const nameOf = (uid: string) => people.find((p) => p.uid === uid)?.displayName ?? 'osoba spoza wyjazdu';
  const available = ctx.approved.map((p) => p.displayName).join(', ') || 'brak zatwierdzonych osób';
  const byKey = new Map<string, Person[]>();
  for (const p of ctx.approved) byKey.set(nameKey(p.displayName), [...(byKey.get(nameKey(p.displayName)) ?? []), p]);

  // w replace stan wyjściowy jest pusty – wszystko z pliku to nowe zadania
  const current = new Map(mode === 'merge' ? ctx.tasks.map((t) => [t.id, t]) : []);
  const doneBy = new Map<string, string[]>(); // taskId → uid osób, które odhaczyły
  for (const p of ctx.progress) for (const id of p.done) doneBy.set(id, [...(doneBy.get(id) ?? []), p.uid]);
  let nextOrder = Math.max(0, ...[...current.values()].map((t) => t.order)) + 1;

  const preview: Preview = { mode, added: [], changed: [], archived: [], restored: [], deleted: [], reset: [], untouched: 0, same: 0 };
  const taskOps: ChecklistOp[] = [];
  const clear = new Map<string, Set<string>>(); // uid → taskIds do odznaczenia
  const addClear = (taskId: string) => {
    for (const uid of doneBy.get(taskId) ?? []) clear.set(uid, (clear.get(uid) ?? new Set()).add(taskId));
  };
  const seen = new Set<string>();

  (data.tasks as unknown[]).forEach((raw, i) => {
    const label = `Zadanie nr ${i + 1}`;
    if (!isObject(raw)) return void errors.push(`${label}: to nie jest obiekt.`);
    const id = raw.id;
    if (typeof id !== 'string' || !TASK_ID_RE.test(id)) return void errors.push(`${label}: „id” musi mieć postać małe-litery-cyfry-myślniki, do 60 znaków (np. "esim-usa").`);
    const at = `Zadanie „${id}”`;
    if (seen.has(id)) return void errors.push(`${at}: to samo „id” jest w pliku więcej niż raz.`);
    seen.add(id);
    for (const k of Object.keys(raw)) if (!TASK_FIELDS.includes(k)) warnings.push(`${at}: nieznane pole „${k}” – pominięte.`);
    const existing = current.get(id);

    // ---- akcje: archiwizacja i usunięcie ----
    if (raw.action !== undefined) {
      if (mode === 'replace') return void errors.push(`${at}: w trybie "replace" nie ma „action” – plik ma zawierać pełną listę zadań.`);
      if (raw.action !== 'archive' && raw.action !== 'delete') return void errors.push(`${at}: „action” może mieć wartość "archive" albo "delete".`);
      if (!existing) return void errors.push(`${at}: nie ma takiego zadania w tym wyjeździe – nie można go ${raw.action === 'delete' ? 'usunąć' : 'zarchiwizować'}.`);
      const extra = Object.keys(raw).filter((k) => k !== 'id' && k !== 'action' && TASK_FIELDS.includes(k));
      if (extra.length) warnings.push(`${at}: przy „action” pozostałe pola (${extra.join(', ')}) są pomijane.`);
      const done = doneBy.get(id)?.length ?? 0;
      if (raw.action === 'delete') {
        taskOps.push({ kind: 'deleteTask', id });
        addClear(id);
        preview.deleted.push({ id, text: existing.text, done });
      } else if (!existing.archived) {
        taskOps.push({ kind: 'setTask', task: { ...existing, archived: true } });
        preview.archived.push({ id, text: existing.text, done });
      } else preview.same++;
      return;
    }

    // ---- pola ----
    const errs: string[] = [];
    const patch: Partial<TaskDoc> = {};
    const removeFields: (keyof TaskDoc)[] = [];
    const str = (key: 'text' | 'details' | 'category', max: number, required = false) => {
      const v = raw[key];
      if (v === undefined) return;
      if (v === null && !required) return void removeFields.push(key);
      if (typeof v !== 'string' || (required && !v.trim())) return void errs.push(`„${key}” musi być ${required ? 'niepustym ' : ''}tekstem`);
      const t = v.trim();
      if (t.length > max) return void errs.push(`„${key}” ma ponad ${max} znaków`);
      if (t) patch[key] = t;
      else removeFields.push(key);
    };
    str('text', TASK_LIMITS.text, true);
    str('details', TASK_LIMITS.details);
    str('category', TASK_LIMITS.category);

    if (raw.links !== undefined) {
      if (raw.links === null) removeFields.push('links');
      else if (!Array.isArray(raw.links)) errs.push('„links” musi być listą');
      else if (raw.links.length > TASK_LIMITS.links) errs.push(`najwyżej ${TASK_LIMITS.links} linków`);
      else {
        const links: TaskLink[] = [];
        for (const l of raw.links) {
          if (!isObject(l)) {
            errs.push('link musi być obiektem { label, url, sponsored }');
            continue;
          }
          const e = linkError(l);
          if (e) errs.push(e);
          else links.push({ label: (l.label as string).trim(), url: l.url as string, sponsored: l.sponsored === undefined ? true : (l.sponsored as boolean) });
          for (const k of Object.keys(l)) if (!['label', 'url', 'sponsored'].includes(k)) warnings.push(`${at}: nieznane pole linku „${k}” – pominięte.`);
        }
        if (links.length) patch.links = links;
        else removeFields.push('links');
      }
    }

    if (raw.audience !== undefined) {
      if (raw.audience === 'all') patch.audience = ['all'];
      else if (!Array.isArray(raw.audience) || raw.audience.length === 0) errs.push('„audience” musi być "all" albo niepustą listą imion');
      else {
        const uids: string[] = [];
        for (const name of raw.audience) {
          if (typeof name !== 'string' || !name.trim()) {
            errs.push('„audience” zawiera pustą wartość');
            continue;
          }
          const found = byKey.get(nameKey(name)) ?? [];
          if (found.length === 0) errs.push(`nie ma zatwierdzonej osoby „${name}” (dostępne: ${available})`);
          else if (found.length > 1) errs.push(`imię „${name}” pasuje do kilku osób (${found.map((p) => p.displayName).join(', ')}) – zmień imię w aplikacji, żeby się różniły`);
          else if (!uids.includes(found[0].uid)) uids.push(found[0].uid);
        }
        if (uids.length) patch.audience = uids;
      }
    }

    if (raw.due !== undefined) {
      if (raw.due === null) removeFields.push('due');
      else if (!isDate(raw.due)) errs.push(`„due” musi być prawdziwą datą RRRR-MM-DD (jest: ${JSON.stringify(raw.due)})`);
      else patch.due = raw.due;
    }
    if (raw.order !== undefined) {
      if (typeof raw.order !== 'number' || !Number.isFinite(raw.order)) errs.push('„order” musi być liczbą');
      else patch.order = raw.order;
    }
    if (raw.archived !== undefined) {
      if (typeof raw.archived !== 'boolean') errs.push('„archived” musi być true albo false');
      else patch.archived = raw.archived;
    }
    if (raw.resetDone !== undefined && typeof raw.resetDone !== 'boolean') errs.push('„resetDone” musi być true albo false');
    if (errs.length) return void errors.push(...errs.map((e) => `${at}: ${e}.`));

    // ---- nowe zadanie ----
    if (!existing) {
      if (!patch.text) return void errors.push(`${at}: nowe zadanie musi mieć „text”.`);
      if (raw.resetDone === true) warnings.push(`${at}: „resetDone” przy nowym zadaniu nic nie zmienia – pominięte.`);
      const task: TaskDoc = {
        id,
        text: patch.text,
        ...(patch.details ? { details: patch.details } : {}),
        ...(patch.links ? { links: patch.links } : {}),
        audience: patch.audience ?? ['all'],
        ...(patch.due ? { due: patch.due } : {}),
        ...(patch.category ? { category: patch.category } : {}),
        order: patch.order ?? nextOrder++,
        archived: patch.archived ?? false,
        schemaVersion: TASK_SCHEMA_VERSION,
      };
      taskOps.push({ kind: 'setTask', task });
      preview.added.push({ id, text: task.text, who: audienceText(task.audience, people) });
      return;
    }

    // ---- aktualizacja (patch): tylko pola z pliku ----
    const next: TaskDoc = { ...existing, ...patch, schemaVersion: TASK_SCHEMA_VERSION };
    for (const k of removeFields) delete next[k];
    const changes: FieldChange[] = [];
    const show = (v: unknown) => (v === undefined || v === '' ? '—' : String(v));
    const cmp = (field: string, a: unknown, b: unknown) => {
      if (a !== b) changes.push({ field, before: show(a), after: show(b) });
    };
    cmp('treść', existing.text, next.text);
    cmp('opis', existing.details, next.details);
    cmp('kategoria', existing.category, next.category);
    cmp('termin', existing.due, next.due);
    cmp('kolejność', existing.order, next.order);
    if (linksKey(existing.links) !== linksKey(next.links))
      changes.push({
        field: 'linki',
        before: (existing.links ?? []).map((l) => `${l.label} (${l.url})`).join(', ') || '—',
        after: (next.links ?? []).map((l) => `${l.label} (${l.url})`).join(', ') || '—',
      });
    if (!sameAudience(existing.audience, next.audience))
      changes.push({ field: 'dla kogo', before: audienceText(existing.audience, people), after: audienceText(next.audience, people) });
    const archiving = !existing.archived && next.archived;
    const restoring = existing.archived && !next.archived;
    const resetNames = raw.resetDone === true ? (doneBy.get(id) ?? []).map(nameOf) : [];

    if (changes.length || archiving || restoring || existing.schemaVersion !== TASK_SCHEMA_VERSION) taskOps.push({ kind: 'setTask', task: next });
    if (changes.length) preview.changed.push({ id, text: next.text, changes });
    if (archiving) preview.archived.push({ id, text: next.text, done: doneBy.get(id)?.length ?? 0 });
    if (restoring) preview.restored.push({ id, text: next.text });
    if (resetNames.length) {
      addClear(id);
      preview.reset.push({ id, text: next.text, names: resetNames });
    }
    if (!changes.length && !archiving && !restoring && !resetNames.length) preview.same++;
  });

  if (errors.length) return fail();

  const ops: ChecklistOp[] = [];
  if (mode === 'replace') {
    // najpierw czyszczenie wszystkiego, potem zapis zadań z pliku
    const doneTotal = ctx.progress.reduce((n, p) => n + p.done.length, 0);
    preview.removed = { tasks: ctx.tasks.length, done: doneTotal };
    const fileIds = new Set(seen);
    for (const t of ctx.tasks) if (!fileIds.has(t.id)) ops.push({ kind: 'deleteTask', id: t.id });
    for (const p of ctx.progress) if (p.done.length || p.legacy) ops.push({ kind: 'clearAllDone', uid: p.uid });
    if (ctx.legacyTemplate) ops.push({ kind: 'dropLegacyTemplate' });
  } else {
    preview.untouched = ctx.tasks.filter((t) => !seen.has(t.id)).length;
  }
  ops.push(...taskOps);
  for (const [uid, ids] of clear) ops.push({ kind: 'clearDone', uid, taskIds: [...ids] });
  return { ok: true, preview, ops, warnings };
}

/** Czy plan coś zmienia (ponowny import tego samego pliku merge = brak zmian). */
export function hasChanges(r: Extract<ImportResult, { ok: true }>): boolean {
  return r.ops.length > 0;
}

// ---------- stan w pamięci: do testów i do podsumowania (ta sama semantyka co zapis w bazie) ----------

export interface ChecklistState {
  tasks: Map<string, TaskDoc>;
  /** uid → (taskId → chwila odhaczenia) */
  done: Map<string, Map<string, string>>;
  legacyTemplate?: boolean;
}

export function applyOps(state: ChecklistState, ops: ChecklistOp[]): ChecklistState {
  const tasks = new Map(state.tasks);
  const done = new Map([...state.done].map(([uid, m]) => [uid, new Map(m)]));
  let legacyTemplate = state.legacyTemplate;
  for (const op of ops) {
    if (op.kind === 'setTask') tasks.set(op.task.id, op.task);
    else if (op.kind === 'deleteTask') tasks.delete(op.id);
    else if (op.kind === 'clearDone') for (const id of op.taskIds) done.get(op.uid)?.delete(id);
    else if (op.kind === 'clearAllDone') done.set(op.uid, new Map());
    else legacyTemplate = false;
  }
  return { tasks, done, legacyTemplate };
}

/** Partie operacji do kolejnych writeBatch. Jedna partia = zapis atomowy. */
export function chunkOps<T>(ops: T[], size = BATCH_LIMIT): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ops.length; i += size) out.push(ops.slice(i, i + size));
  return out;
}

// ---------- eksport stanu (dla czatu checklisty) ----------

export interface ChecklistExport {
  schema: typeof CHECKLIST_EXPORT_SCHEMA;
  schemaVersion: number;
  tripId: string;
  tripTitle: string;
  exportedAt: string;
  participants: string[];
  tasks: {
    id: string;
    text: string;
    details?: string;
    links?: TaskLink[];
    audience: 'all' | string[];
    due?: string;
    category?: string;
    order: number;
    archived: boolean;
    doneCount: number;
  }[];
}

export function buildChecklistExport(ctx: ChecklistContext & { tripTitle: string; now?: Date }): ChecklistExport {
  const people = ctx.everyone ?? ctx.approved;
  const count = new Map<string, number>();
  for (const p of ctx.progress) for (const id of p.done) count.set(id, (count.get(id) ?? 0) + 1);
  return {
    schema: CHECKLIST_EXPORT_SCHEMA,
    schemaVersion: CHECKLIST_SCHEMA_VERSION,
    tripId: ctx.tripId,
    tripTitle: ctx.tripTitle,
    exportedAt: (ctx.now ?? new Date()).toISOString().slice(0, 10),
    participants: ctx.approved.map((p) => p.displayName),
    tasks: sortTasks(ctx.tasks).map((t) => ({
      id: t.id,
      text: t.text,
      ...(t.details ? { details: t.details } : {}),
      ...(t.links?.length ? { links: t.links } : {}),
      audience: t.audience.includes('all') ? 'all' : t.audience.map((uid) => people.find((p) => p.uid === uid)?.displayName ?? `(usunięta osoba ${uid.slice(0, 4)})`),
      ...(t.due ? { due: t.due } : {}),
      ...(t.category ? { category: t.category } : {}),
      order: t.order,
      archived: t.archived,
      doneCount: count.get(t.id) ?? 0,
    })),
  };
}

// ---------- wyświetlanie ----------

export function sortTasks(tasks: TaskDoc[]): TaskDoc[] {
  return [...tasks].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** Grupy po kategorii w kolejności pierwszego wystąpienia (po order); bez kategorii – na końcu jako „Inne”. */
export function groupTasks(tasks: TaskDoc[]): { category: string; tasks: TaskDoc[] }[] {
  const groups = new Map<string, TaskDoc[]>();
  for (const t of sortTasks(tasks)) {
    const key = t.category ?? '';
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const named = [...groups].filter(([k]) => k).map(([category, list]) => ({ category, tasks: list }));
  const other = groups.get('');
  return other ? [...named, { category: named.length ? 'Inne' : '', tasks: other }] : named;
}

export function isFor(task: TaskDoc, uid: string): boolean {
  return task.audience.includes('all') || task.audience.includes(uid);
}

/** Slug na id nowego zadania z edytora: „Kup eSIM na USA” → „kup-esim-na-usa” (unikalny w wyjeździe). */
export function slugify(text: string, taken: Set<string>): string {
  const base =
    nameKey(text)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50)
      .replace(/-+$/, '') || 'zadanie';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}
