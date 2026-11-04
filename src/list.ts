/** Nowa tablica z elementem przeniesionym z miejsca `from` na `to` (przesuwanie punktów checklisty). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
