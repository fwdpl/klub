import { collection, deleteDoc, deleteField, doc, FieldPath, query, serverTimestamp, setDoc, Timestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { chunkOps, type ChecklistOp, type Progress } from '../checklist/importChecklist';
import type { ChecklistDoc, ChecklistItem, TaskDoc } from '../model/types';
import { readDoc, readDocs } from './read';

// Checklisty (zadanie docs/tasks/zadanie-checklisty.md): zadania trips/{id}/tasks (zapis: organizator)
// i postęp osoby trips/{id}/checklists/{uid} (done + własne punkty). Zapytania zgodne z firestore.rules.

const tasksOf = (tripId: string) => collection(db, 'trips', tripId, 'tasks');
const checklistRef = (tripId: string, uid: string) => doc(db, 'trips', tripId, 'checklists', uid);

const toTask = (data: Record<string, unknown>): TaskDoc => {
  const { updatedAt: _u, ...rest } = data;
  return rest as unknown as TaskDoc;
};

/** Organizator: wszystkie zadania, także archiwalne. */
export async function listAllTasks(tripId: string): Promise<TaskDoc[]> {
  const snap = await readDocs(tasksOf(tripId));
  return snap.docs.map((d) => toTask(d.data()));
}

/** Uczestnik: tylko aktywne zadania dla niego – zapytanie musi odpowiadać regule (audience ∩ ['all', uid]). */
export async function listMyTasks(tripId: string, uid: string): Promise<TaskDoc[]> {
  const snap = await readDocs(query(tasksOf(tripId), where('audience', 'array-contains-any', ['all', uid]), where('archived', '==', false)));
  return snap.docs.map((d) => toTask(d.data()));
}

const toDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);

function toChecklist(data: Record<string, unknown> | undefined): ChecklistDoc {
  const done = (data?.done ?? {}) as Record<string, unknown>;
  return {
    done: Object.fromEntries(Object.entries(done).map(([id, v]) => [id, toDate(v)])),
    items: (data?.items as ChecklistItem[] | undefined) ?? [],
  };
}

export async function getChecklist(tripId: string, uid: string): Promise<ChecklistDoc> {
  const d = await readDoc(checklistRef(tripId, uid));
  return toChecklist(d.exists() ? d.data() : undefined);
}

/** Organizator: postęp wszystkich osób (uid → dokument) i informacja o danych starego modelu. */
export async function listChecklists(tripId: string): Promise<{ docs: Map<string, ChecklistDoc>; progress: Progress[] }> {
  const snap = await readDocs(collection(db, 'trips', tripId, 'checklists'));
  const docs = new Map<string, ChecklistDoc>();
  const progress: Progress[] = [];
  for (const d of snap.docs) {
    const c = toChecklist(d.data());
    docs.set(d.id, c);
    progress.push({ uid: d.id, done: Object.keys(c.done), ...('templateDone' in d.data() ? { legacy: true } : {}) });
  }
  return { docs, progress };
}

/** Czy w szczegółach została wspólna checklista starego modelu (replace ją usuwa). */
export async function hasLegacyTemplate(tripId: string): Promise<boolean> {
  const d = await readDoc(doc(db, 'trips', tripId, 'info', 'main')).catch(() => null);
  return !!d?.exists() && d.get('checklistTemplate') !== undefined;
}

// Odhaczenie: zapis z merge pojedynczego klucza, więc działa bez sieci (kolejka Firestore) i nie
// nadpisuje innych odhaczeń z drugiego telefonu. Stare pole templateDone znika przy pierwszym zapisie.
export function setDone(tripId: string, uid: string, taskId: string, done: boolean): Promise<void> {
  return setDoc(
    checklistRef(tripId, uid),
    { done: { [taskId]: done ? serverTimestamp() : deleteField() }, templateDone: deleteField(), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function saveOwnItems(tripId: string, uid: string, items: ChecklistItem[]): Promise<void> {
  return setDoc(checklistRef(tripId, uid), { items, templateDone: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
}

// ---------- zapis organizatora: import i edytor ----------

function taskData(task: TaskDoc) {
  return { ...task, updatedAt: serverTimestamp() };
}

/**
 * Wykonuje plan importu: jedna partia = jeden writeBatch (atomowo). Powyżej 500 operacji – kolejne partie
 * (replace najpierw czyści, potem zapisuje). onProgress dostaje liczbę zapisanych operacji.
 */
export async function commitOps(tripId: string, ops: ChecklistOp[], onProgress?: (done: number, total: number) => void): Promise<void> {
  let done = 0;
  onProgress?.(0, ops.length);
  for (const part of chunkOps(ops)) {
    const batch = writeBatch(db);
    for (const op of part) {
      if (op.kind === 'setTask') batch.set(doc(tasksOf(tripId), op.task.id), taskData(op.task));
      else if (op.kind === 'deleteTask') batch.delete(doc(tasksOf(tripId), op.id));
      else if (op.kind === 'clearDone') {
        const [first, ...rest] = op.taskIds.map((id) => new FieldPath('done', id));
        batch.update(checklistRef(tripId, op.uid), first, deleteField(), ...rest.flatMap((p) => [p, deleteField()]));
      } else if (op.kind === 'clearAllDone') batch.update(checklistRef(tripId, op.uid), { done: {}, templateDone: deleteField() });
      else batch.update(doc(db, 'trips', tripId, 'info', 'main'), { checklistTemplate: deleteField() });
    }
    await batch.commit();
    done += part.length;
    onProgress?.(done, ops.length);
  }
}

/** Edytor: zapis jednego zadania (całego dokumentu). */
export function saveTask(tripId: string, task: TaskDoc): Promise<void> {
  return setDoc(doc(tasksOf(tripId), task.id), taskData(task));
}

/** Edytor: usunięcie zadania razem z jego odhaczeniami u wszystkich (jak „delete” w imporcie). */
export async function deleteTask(tripId: string, taskId: string, progress: Progress[]): Promise<void> {
  const who = progress.filter((p) => p.done.includes(taskId)).map((p) => p.uid);
  if (!who.length) return deleteDoc(doc(tasksOf(tripId), taskId));
  await commitOps(tripId, [{ kind: 'deleteTask', id: taskId }, ...who.map((uid) => ({ kind: 'clearDone' as const, uid, taskIds: [taskId] }))]);
}
