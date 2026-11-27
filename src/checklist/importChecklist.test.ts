import { describe, expect, it } from 'vitest';
import type { TaskDoc } from '../model/types';
import {
  applyOps,
  buildChecklistExport,
  chunkOps,
  groupTasks,
  nameKey,
  parseChecklistFile,
  planImport,
  slugify,
  type ChecklistContext,
  type ChecklistState,
  type ImportResult,
} from './importChecklist';

// Przypadki z zadania docs/tasks/zadanie-checklisty.md §5.

const approved = [
  { uid: 'u-ania', displayName: 'Ania' },
  { uid: 'u-lucja', displayName: 'Łucja' },
  { uid: 'u-marek', displayName: 'Marek' },
];

const task = (id: string, order: number, extra: Partial<TaskDoc> = {}): TaskDoc => ({
  id,
  text: `Zadanie ${id}`,
  audience: ['all'],
  order,
  archived: false,
  schemaVersion: 1,
  ...extra,
});

const START: ChecklistState = {
  tasks: new Map(
    [
      task('esim-usa', 1, { links: [{ label: 'Kup eSIM', url: 'https://example.com/esim?ref=jacek', sponsored: true }], category: 'Przed wylotem' }),
      task('esta-ania', 2, { audience: ['u-ania'] }),
      task('parking-lotnisko', 3),
    ].map((t) => [t.id, t]),
  ),
  done: new Map([
    [
      'u-ania',
      new Map([
        ['esim-usa', '2026-11-20'],
        ['esta-ania', '2026-11-21'],
        ['parking-lotnisko', '2026-11-22'],
      ]),
    ],
    ['u-marek', new Map([['esim-usa', '2026-11-23']])],
  ]),
};

const ctxOf = (state: ChecklistState, extra: Partial<ChecklistContext> = {}): ChecklistContext => ({
  tripId: 'trip1',
  approved,
  tasks: [...state.tasks.values()],
  progress: [...state.done].map(([uid, m]) => ({ uid, done: [...m.keys()] })),
  legacyTemplate: state.legacyTemplate,
  ...extra,
});

const file = (tasks: unknown[], extra: object = {}) => ({ schema: 'trip-checklist', schemaVersion: 1, tripId: 'trip1', mode: 'merge', tasks, ...extra });

function ok(r: ImportResult) {
  if (!r.ok) throw new Error(`Oczekiwano sukcesu: ${r.errors.join(' | ')}`);
  return r;
}
function errorsOf(r: ImportResult): string {
  if (r.ok) throw new Error('Oczekiwano błędu');
  return r.errors.join(' | ');
}
const doneOf = (s: ChecklistState) => Object.fromEntries([...s.done].map(([uid, m]) => [uid, Object.fromEntries(m)]));

describe('merge', () => {
  it('same nowe punkty: istniejące zadania i wszystkie done bez zmian', () => {
    const r = ok(
      planImport(
        file([
          { id: 'ubezpieczenie', text: 'Wykup ubezpieczenie', category: 'Dokumenty' },
          { id: 'esta-marek', text: 'ESTA', audience: ['marek'] },
        ]),
        ctxOf(START),
      ),
    );
    const after = applyOps(START, r.ops);
    expect(doneOf(after)).toEqual(doneOf(START));
    for (const [id, t] of START.tasks) expect(after.tasks.get(id)).toEqual(t);
    expect(after.tasks.get('ubezpieczenie')).toMatchObject({ audience: ['all'], order: 4, archived: false, schemaVersion: 1, category: 'Dokumenty' });
    expect(after.tasks.get('esta-marek')).toMatchObject({ audience: ['u-marek'], order: 5 });
    expect(r.preview.added.map((a) => a.who)).toEqual(['wszyscy', 'Marek']);
    expect(r.preview.untouched).toBe(3);
    expect(r.ops.every((o) => o.kind === 'setTask')).toBe(true);
  });

  it('poprawiony link w istniejącym zadaniu: done bez zmian, reszta pól też', () => {
    const url = 'https://example.com/esim2?ref=jacek&utm_source=klub&x=%20a';
    const r = ok(planImport(file([{ id: 'esim-usa', links: [{ label: 'Kup eSIM', url, sponsored: true }] }]), ctxOf(START)));
    const after = applyOps(START, r.ops);
    expect(doneOf(after)).toEqual(doneOf(START));
    expect(after.tasks.get('esim-usa')).toEqual({ ...START.tasks.get('esim-usa'), links: [{ label: 'Kup eSIM', url, sponsored: true }] });
    // adres zapisany dosłownie
    expect(after.tasks.get('esim-usa')!.links![0].url).toBe(url);
    expect(r.preview.changed[0].changes.map((c) => c.field)).toEqual(['linki']);
    expect(r.preview.changed[0].changes[0].before).toContain('esim?ref=jacek');
  });

  it('resetDone czyści done tylko dla tego zadania', () => {
    const r = ok(planImport(file([{ id: 'esim-usa', text: 'Kup eSIM na NOWY termin', resetDone: true }]), ctxOf(START)));
    const after = applyOps(START, r.ops);
    expect(doneOf(after)).toEqual({ 'u-ania': { 'esta-ania': '2026-11-21', 'parking-lotnisko': '2026-11-22' }, 'u-marek': {} });
    expect(r.preview.reset).toEqual([{ id: 'esim-usa', text: 'Kup eSIM na NOWY termin', names: ['Ania', 'Marek'] }]);
  });

  it('bez resetDone aktualizacja nie rusza done', () => {
    const r = ok(planImport(file([{ id: 'esta-ania', text: 'Złóż ESTA', due: '2027-01-15', audience: ['Ania', 'Marek'] }]), ctxOf(START)));
    expect(r.ops.some((o) => o.kind === 'clearDone' || o.kind === 'clearAllDone')).toBe(false);
    expect(r.preview.changed[0].changes.map((c) => c.field)).toEqual(['treść', 'termin', 'dla kogo']);
  });

  it('archive: zadanie ukryte, done zostaje; przywrócenie działa', () => {
    const r = ok(planImport(file([{ id: 'parking-lotnisko', action: 'archive' }]), ctxOf(START)));
    const archived = applyOps(START, r.ops);
    expect(archived.tasks.get('parking-lotnisko')!.archived).toBe(true);
    expect(doneOf(archived)).toEqual(doneOf(START));
    expect(r.preview.archived).toEqual([{ id: 'parking-lotnisko', text: 'Zadanie parking-lotnisko', done: 1 }]);

    const back = ok(planImport(file([{ id: 'parking-lotnisko', archived: false }]), ctxOf(archived)));
    const restored = applyOps(archived, back.ops);
    expect(restored.tasks.get('parking-lotnisko')).toEqual(START.tasks.get('parking-lotnisko'));
    expect(doneOf(restored)).toEqual(doneOf(START));
    expect(back.preview.restored).toHaveLength(1);
  });

  it('delete: zadanie i klucze done usunięte u wszystkich', () => {
    const r = ok(planImport(file([{ id: 'esim-usa', action: 'delete' }]), ctxOf(START)));
    const after = applyOps(START, r.ops);
    expect(after.tasks.has('esim-usa')).toBe(false);
    expect(doneOf(after)).toEqual({ 'u-ania': { 'esta-ania': '2026-11-21', 'parking-lotnisko': '2026-11-22' }, 'u-marek': {} });
    expect(r.preview.deleted).toEqual([{ id: 'esim-usa', text: 'Zadanie esim-usa', done: 2 }]);
  });

  it('ponowny import tego samego pliku daje zero zmian (idempotencja)', () => {
    const f = file([
      { id: 'ubezpieczenie', text: 'Wykup ubezpieczenie', links: [{ label: 'Kup', url: 'https://example.com/u?ref=jacek' }], audience: 'all', due: '2027-01-10' },
      { id: 'esim-usa', text: 'Kup eSIM', resetDone: true },
      { id: 'parking-lotnisko', action: 'archive' },
      { id: 'esta-ania', audience: ['ANIA', 'lucja'] },
    ]);
    const first = ok(planImport(f, ctxOf(START)));
    expect(first.ops.length).toBeGreaterThan(0);
    const after = applyOps(START, first.ops);
    const second = ok(planImport(f, ctxOf(after)));
    expect(second.ops).toEqual([]);
    expect(second.preview).toMatchObject({ added: [], changed: [], archived: [], restored: [], deleted: [], reset: [], same: 4 });
  });

  it('imię bez wielkości liter i polskich znaków; brak audience przy aktualizacji = bez zmian', () => {
    const r = ok(
      planImport(
        file([
          { id: 'nowe', text: 'X', audience: ['LUCJA', 'ania'] },
          { id: 'esta-ania', text: 'ESTA!' },
        ]),
        ctxOf(START),
      ),
    );
    const after = applyOps(START, r.ops);
    expect(after.tasks.get('nowe')!.audience).toEqual(['u-lucja', 'u-ania']);
    expect(after.tasks.get('esta-ania')!.audience).toEqual(['u-ania']);
  });

  it('order: nowe po największym w kolejności z pliku; jawny order jest brany; aktualizacja nie rusza order', () => {
    const r = ok(
      planImport(
        file([
          { id: 'b', text: 'B' },
          { id: 'a', text: 'A', order: 0.5 },
          { id: 'c', text: 'C' },
          { id: 'esim-usa', text: 'eSIM' },
        ]),
        ctxOf(START),
      ),
    );
    const after = applyOps(START, r.ops);
    expect(['b', 'a', 'c', 'esim-usa'].map((id) => after.tasks.get(id)!.order)).toEqual([4, 0.5, 5, 1]);
  });

  it('null usuwa pole opcjonalne', () => {
    const r = ok(planImport(file([{ id: 'esim-usa', links: null, category: null }]), ctxOf(START)));
    const t = applyOps(START, r.ops).tasks.get('esim-usa')!;
    expect(t.links).toBeUndefined();
    expect(t.category).toBeUndefined();
  });

  it('brak mode = merge; nieznane pola to ostrzeżenia, nie błędy', () => {
    const { mode: _m, ...f } = file([{ id: 'nowe', text: 'X', priority: 'high' }], { comment: 'od Claude' });
    const r = ok(planImport(f, ctxOf(START)));
    expect(r.preview.mode).toBe('merge');
    expect(r.warnings.join(' ')).toContain('„comment”');
    expect(r.warnings.join(' ')).toContain('„priority”');
  });
});

describe('replace', () => {
  it('wszystko wyczyszczone (zadania, odhaczenia, stary model), potem zapis z pliku', () => {
    const state = { ...START, legacyTemplate: true };
    const r = ok(
      planImport(
        file(
          [
            { id: 'esim-usa', text: 'Nowy eSIM' },
            { id: 'paszport', text: 'Sprawdź paszport', audience: ['Marek'] },
          ],
          { mode: 'replace' },
        ),
        {
          ...ctxOf(state),
          progress: [...ctxOf(state).progress, { uid: 'u-lucja', done: [], legacy: true }],
        },
      ),
    );
    expect(r.preview.removed).toEqual({ tasks: 3, done: 4 });
    expect(r.ops.map((o) => o.kind)).toEqual(['deleteTask', 'deleteTask', 'clearAllDone', 'clearAllDone', 'clearAllDone', 'dropLegacyTemplate', 'setTask', 'setTask']);
    const after = applyOps(state, r.ops);
    expect([...after.tasks.keys()]).toEqual(['esim-usa', 'paszport']);
    expect(after.tasks.get('esim-usa')).toEqual({ id: 'esim-usa', text: 'Nowy eSIM', audience: ['all'], order: 1, archived: false, schemaVersion: 1 });
    expect(after.tasks.get('paszport')!.order).toBe(2);
    expect(Object.values(doneOf(after)).every((d) => Object.keys(d).length === 0)).toBe(true);
    expect(after.legacyTemplate).toBe(false);
  });

  it('w replace „action” to błąd', () => {
    expect(errorsOf(planImport(file([{ id: 'esim-usa', action: 'archive' }], { mode: 'replace' }), ctxOf(START)))).toContain('"replace" nie ma „action”');
  });
});

describe('błędy blokujące', () => {
  const err = (tasks: unknown[], extra: object = {}, ctx = ctxOf(START)) => errorsOf(planImport(file(tasks, extra), ctx));

  it('nieznane imię – z listą dostępnych', () => {
    expect(err([{ id: 'x', text: 'X', audience: ['Zenek'] }])).toContain('nie ma zatwierdzonej osoby „Zenek” (dostępne: Ania, Łucja, Marek)');
  });
  it('imię niejednoznaczne', () => {
    const ctx = ctxOf(START, { approved: [...approved, { uid: 'u-ania2', displayName: 'ania' }] });
    expect(err([{ id: 'x', text: 'X', audience: ['Ania'] }], {}, ctx)).toContain('pasuje do kilku osób');
  });
  it('http: i javascript: w linku', () => {
    expect(err([{ id: 'x', text: 'X', links: [{ label: 'A', url: 'http://example.com' }] }])).toContain('tylko adresy https://');
    expect(err([{ id: 'x', text: 'X', links: [{ label: 'A', url: 'javascript:alert(1)' }] }])).toContain('tylko adresy https://');
    expect(err([{ id: 'x', text: 'X', links: [{ label: 'A', url: 'data:text/html,<b>' }] }])).toContain('tylko adresy https://');
  });
  it('duplikat id', () => {
    expect(
      err([
        { id: 'x', text: 'X' },
        { id: 'x', text: 'Y' },
      ]),
    ).toContain('więcej niż raz');
  });
  it('action na nieistniejącym id', () => {
    expect(err([{ id: 'nie-ma', action: 'delete' }])).toContain('nie ma takiego zadania');
    expect(err([{ id: 'nie-ma', action: 'archive' }])).toContain('nie ma takiego zadania');
  });
  it('zły tripId', () => {
    expect(err([], { tripId: 'usa-2027' })).toContain('innego wyjazdu');
  });
  it('schemaVersion inna niż 1, zły id, zła data, pusta audience, nowe bez text', () => {
    expect(err([], { schemaVersion: 2 })).toContain('wersja formatu');
    expect(err([{ id: 'Esim USA', text: 'X' }])).toContain('„id”');
    expect(err([{ id: 'x', text: 'X', due: '2027-02-30' }])).toContain('„due”');
    expect(err([{ id: 'x', text: 'X', audience: [] }])).toContain('„audience”');
    expect(err([{ id: 'x', details: 'bez treści' }])).toContain('musi mieć „text”');
    expect(err([{ id: 'x', text: 'a'.repeat(201) }])).toContain('ponad 200');
    expect(err([{ id: 'x', text: 'X', links: Array(6).fill({ label: 'A', url: 'https://a.pl' }) }])).toContain('najwyżej 5');
  });
  it('eksport wklejony zamiast pliku importu; zły JSON', () => {
    expect(errorsOf(planImport({ schema: 'trip-checklist-export', tasks: [] }, ctxOf(START)))).toContain('eksport checklisty');
    expect(errorsOf(parseChecklistFile('{ "schema": ', ctxOf(START)))).toContain('JSON');
  });
});

describe('eksport i pomocnicze', () => {
  it('eksport: imiona zamiast uid, archiwalne też, liczba odhaczeń bez dat i bez nazwisk', () => {
    const archived = applyOps(START, [{ kind: 'setTask', task: { ...START.tasks.get('parking-lotnisko')!, archived: true } }]);
    const e = buildChecklistExport({ ...ctxOf(archived), tripTitle: 'USA', now: new Date('2026-11-27T10:00:00Z') });
    expect(e).toMatchObject({ schema: 'trip-checklist-export', tripId: 'trip1', participants: ['Ania', 'Łucja', 'Marek'], exportedAt: '2026-11-27' });
    expect(e.tasks.map((t) => [t.id, t.audience, t.doneCount, t.archived])).toEqual([
      ['esim-usa', 'all', 2, false],
      ['esta-ania', ['Ania'], 1, false],
      ['parking-lotnisko', 'all', 1, true],
    ]);
    expect(JSON.stringify(e.tasks)).not.toMatch(/2026-11-2\d/);
    expect(JSON.stringify(e)).not.toContain('u-ania');
  });

  it('grupowanie po kategorii, bez kategorii na końcu', () => {
    const groups = groupTasks([task('a', 3), task('b', 1, { category: 'Dokumenty' }), task('c', 2, { category: 'Przed wylotem' }), task('d', 4, { category: 'Dokumenty' })]);
    expect(groups.map((g) => [g.category, g.tasks.map((t) => t.id)])).toEqual([
      ['Dokumenty', ['b', 'd']],
      ['Przed wylotem', ['c']],
      ['Inne', ['a']],
    ]);
  });

  it('partie po 500 operacji', () => {
    expect(chunkOps(Array(1201).fill(0)).map((c) => c.length)).toEqual([500, 500, 201]);
  });

  it('slug i nazwy', () => {
    expect(slugify('Kup eSIM na USA!', new Set())).toBe('kup-esim-na-usa');
    expect(slugify('Złóż wniosek', new Set(['zloz-wniosek']))).toBe('zloz-wniosek-2');
    expect(nameKey('  Łucja  Ść ')).toBe('lucja sc');
  });
});
