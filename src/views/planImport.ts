import { getTrip, listDays, listMembers, saveImportedPlan } from '../data/trips';
import type { DayDoc } from '../model/types';
import { findCollisions } from '../plan/collisions';
import { parsePlanFile } from '../plan/importFile';
import { h, present, render, toast } from '../ui';
import { formatLocal } from './tripDetails';

/** Organizator: import planu z pliku JSON (docs/plan-format.md) – sprawdzenie, podgląd, zapis dni z pliku. */
export async function showPlanImport(tripId: string): Promise<void> {
  const [trip, members, existing] = await Promise.all([getTrip(tripId), listMembers(tripId).catch(() => []), listDays(tripId).catch(() => [])]);
  const back = h('a', { class: 'back', href: `#/wyjazd/${tripId}` }, '← Wyjazd');
  if (!trip) {
    render(back, h('p', {}, 'Nie udało się wczytać wyjazdu.'));
    return;
  }
  const approved = members.filter((m) => m.status === 'approved');
  const existingByDate = new Map(existing.map((d) => [d.date, d]));

  const textarea = h('textarea', { rows: '10', placeholder: '{ "format": "klub-plan", … }', 'aria-label': 'Treść pliku planu' });
  const file = h('input', { type: 'file', accept: '.json,application/json' });
  const result = h('div');
  const check = h('button', { type: 'button', class: 'btn' }, 'Sprawdź plik');

  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    textarea.value = await f.text();
    runCheck();
  });

  const preview = (days: DayDoc[], planNotes: string[], revision: number, warnings: string[]) => {
    const nameOf = (uid: string) => approved.find((m) => m.uid === uid)?.displayName ?? '?';
    const collisions: string[] = [];
    for (const day of days) {
      for (const m of approved) {
        for (const [id, sharedTitle] of findCollisions(day.items, m.uid, day.timezone ?? trip.timezone)) {
          const item = day.items.find((i) => i.id === id)!;
          collisions.push(`${formatLocal(day.date)}: ${nameOf(m.uid)} – „${item.title}” nachodzi na wspólny „${sharedTitle}”.`);
        }
      }
    }
    const lowerRevision = days.filter((d) => (existingByDate.get(d.date)?.revision ?? 0) > revision);
    const save = h('button', { type: 'button', class: 'btn' }, `Zapisz plan (${days.length} ${days.length === 1 ? 'dzień' : 'dni'})`);
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await saveImportedPlan(tripId, days, planNotes);
        toast('Plan zapisany');
        location.hash = `#/wyjazd/${tripId}`;
      } catch {
        toast(navigator.onLine ? 'Nie udało się zapisać planu.' : 'Brak połączenia z internetem.');
        save.disabled = false;
      }
    });

    result.replaceChildren(
      ...present(
        h(
          'div',
          { class: 'card card--ok' },
          h('h2', {}, 'Plik jest poprawny'),
          h('p', {}, `Rewizja ${revision}. Dni: ${days.length}, punkty: ${days.reduce((n, d) => n + d.items.length, 0)}.`),
          h(
            'ul',
            { class: 'status-list' },
            ...days.map((d) =>
              h(
                'li',
                {},
                `${formatLocal(d.date)}${d.title ? ` – ${d.title}` : ''}`,
                h('b', {}, existingByDate.has(d.date) ? `zastąpi (${existingByDate.get(d.date)!.items.length} pkt)` : `nowy (${d.items.length} pkt)`),
              ),
            ),
          ),
          existing.length > 0 && h('p', { class: 'muted' }, 'Dni, których nie ma w pliku, zostają bez zmian.'),
        ),
        (warnings.length > 0 || collisions.length > 0 || lowerRevision.length > 0) &&
          h(
            'div',
            { class: 'card' },
            h('h2', {}, 'Ostrzeżenia – nie blokują zapisu'),
            h(
              'ul',
              {},
              ...lowerRevision.map((d) =>
                h('li', {}, `${formatLocal(d.date)}: zapisany plan ma wyższą rewizję (${existingByDate.get(d.date)!.revision}) niż plik (${revision}) – czy to na pewno nowszy plik?`),
              ),
              ...warnings.map((w) => h('li', {}, w)),
              ...collisions.map((c) => h('li', {}, `⚠ ${c}`)),
            ),
          ),
        save,
      ),
    );
  };

  const runCheck = () => {
    const text = textarea.value.trim();
    if (!text) {
      result.replaceChildren(h('p', { class: 'error' }, 'Wklej treść pliku albo wybierz plik.'));
      return;
    }
    const r = parsePlanFile(text, {
      tripTitle: trip.title,
      tripTimezone: trip.timezone,
      people: approved.map((m) => ({ uid: m.uid, displayName: m.displayName })),
    });
    if (!r.ok) {
      result.replaceChildren(
        h(
          'div',
          { class: 'card card--error' },
          h('h2', {}, `Plik ma błędy (${r.errors.length}) – nic nie zostało zapisane`),
          h('ul', {}, ...r.errors.map((e) => h('li', {}, e))),
        ),
      );
      return;
    }
    preview(r.days, r.planNotes, r.revision, r.warnings);
  };
  check.addEventListener('click', runCheck);

  render(
    back,
    h('h1', {}, 'Import planu'),
    h(
      'p',
      { class: 'muted' },
      `${trip.title}. Plik w formacie „klub-plan” (opis w docs/plan-format.md). Osoby w pliku – po imieniu, tylko zatwierdzeni: ${
        approved.map((m) => m.displayName).join(', ') || 'jeszcze nikt'
      }.`,
    ),
    h('div', { class: 'card' }, h('label', { class: 'field' }, h('span', {}, 'Wybierz plik'), file), h('label', { class: 'field' }, h('span', {}, 'albo wklej treść'), textarea), check),
    result,
  );
}
