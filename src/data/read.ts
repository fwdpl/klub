import {
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';

// Bez internetu Firestore najpierw czeka na serwer (kilkanaście sekund na odczyt), a dopiero potem
// sięga do pamięci telefonu. Gdy telefon zgłasza brak sieci, czytamy od razu z pamięci (tryb offline, SPEC §5).
// Dokumentu, którego nie ma w pamięci, nie da się odczytać – wywołujący traktuje to jak brak danych.

export function readDoc<T = DocumentData>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
  return navigator.onLine ? getDoc(ref) : getDocFromCache(ref);
}

export function readDocs<T = DocumentData>(q: Query<T>): Promise<QuerySnapshot<T>> {
  return navigator.onLine ? getDocs(q) : getDocsFromCache(q);
}
