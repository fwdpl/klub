import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePlanFile, validatePlan, type ImportContext } from './importFile';

const ctx: ImportContext = {
  tripTitle: 'Islandia zimą',
  tripTimezone: 'Atlantic/Reykjavik',
  people: [
    { uid: 'u-ania', displayName: 'Ania' },
    { uid: 'u-bartek', displayName: 'Bartek' },
  ],
};

const example = readFileSync('docs/plan-example.json', 'utf8');
const base = () => JSON.parse(example);
const withItem = (item: Record<string, unknown>) => {
  const plan = base();
  plan.days = [{ date: '2027-03-10', items: [item] }];
  return plan;
};
const errorsOf = (plan: unknown) => {
  const r = validatePlan(plan, ctx);
  return r.ok ? [] : r.errors;
};

describe('plik przykładowy z dokumentacji', () => {
  it('przechodzi walidację', () => {
    const r = parsePlanFile(example, ctx);
    expect(r.ok, r.ok ? '' : r.errors.join('\n')).toBe(true);
    if (!r.ok) return;
    expect(r.days.map((d) => d.date)).toEqual(['2027-03-10', '2027-03-11']);
    expect(r.warnings).toEqual([]);
  });

  it('zamienia imiona na osoby, strefy i godziny na zapis z SPEC', () => {
    const r = parsePlanFile(example, ctx);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    const [flight, , , , private1] = r.days[0].items;
    expect(flight).toMatchObject({
      type: 'flight',
      start: '2027-03-10T06:10',
      end: '2027-03-10T09:30',
      tz: 'Europe/Warsaw',
      endTz: 'Atlantic/Reykjavik',
      audience: 'all',
      pinnedToDate: true,
    });
    expect(private1.audience).toEqual(['u-ania']);
    expect(r.days[1].weatherDependent).toBe('night-sky');
    expect(r.days[1].items[1].end).toBe('2027-03-12T01:00');
    // strefa dnia równa strefie wyjazdu nie jest zapisywana osobno
    expect(r.days[0].timezone).toBeUndefined();
  });
});

describe('błędy pliku – czytelne, z miejscem', () => {
  it('nie JSON', () => {
    const r = parsePlanFile('{ to nie json', ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/To nie jest poprawny JSON/);
  });

  it('zły format, wersja i rewizja', () => {
    const errs = errorsOf({ ...base(), format: 'frametrails-trip', version: '2.0', revision: 0 });
    expect(errs).toEqual([
      'Pole „format” musi mieć wartość "klub-plan".',
      'Wersja formatu 2.0 nie jest obsługiwana – aplikacja czyta wersję 1.x.',
      'Pole „revision” musi być liczbą całkowitą ≥ 1.',
    ]);
  });

  it('wersja 1.x z nowym polem przechodzi (nowe pola są ignorowane)', () => {
    expect(errorsOf({ ...base(), version: '1.3', extra: true })).toEqual([]);
  });

  it('nieistniejąca data, powtórzony dzień, nieznana strefa', () => {
    const plan = base();
    plan.days = [
      { date: '2027-02-30', items: [] },
      { date: '2027-03-10', timezone: 'Iceland/Vik', items: [] },
      { date: '2027-03-10', items: [] },
    ];
    expect(errorsOf(plan)).toEqual([
      'Dzień 1: pole „date” musi być istniejącą datą w postaci RRRR-MM-DD.',
      'Dzień 2027-03-10: nieznana strefa czasowa „Iceland/Vik” (np. "Atlantic/Reykjavik").',
      'Dzień 2027-03-10: ta data występuje w pliku więcej niż raz.',
    ]);
  });

  it('godzina, koniec przed początkiem, typ', () => {
    expect(errorsOf(withItem({ time: '9:30', title: 'X' }))[0]).toBe('Dzień 2027-03-10, punkt 1 („X”): „time” musi mieć postać GG:MM (np. "09:30").');
    expect(errorsOf(withItem({ time: '10:00', end: '09:00', title: 'X' }))[0]).toMatch(/koniec musi być po początku/);
    expect(errorsOf(withItem({ time: '10:00', title: 'X', type: 'party' }))[0]).toMatch(/„type” może mieć wartość/);
  });

  it('osoby spoza zatwierdzonych i niejednoznaczne imiona', () => {
    expect(errorsOf(withItem({ time: '10:00', title: 'X', for: ['Celina'] }))[0]).toBe(
      'Dzień 2027-03-10, punkt 1 („X”): „Celina” nie jest zatwierdzonym uczestnikiem tego wyjazdu.',
    );
    const twoAnias = { ...ctx, people: [...ctx.people, { uid: 'u-ania2', displayName: 'ania' }] };
    const r = validatePlan(withItem({ time: '10:00', title: 'X', for: ['Ania'] }), twoAnias);
    expect(r.ok ? [] : r.errors[0]).toMatch(/imię „Ania” ma kilka osób/);
  });

  it('imię bez względu na wielkość liter i spacje', () => {
    const r = validatePlan(withItem({ time: '10:00', title: 'X', for: [' ania '] }), ctx);
    expect(r.ok && r.days[0].items[0].audience).toEqual(['u-ania']);
  });

  it('współrzędne poza zakresem', () => {
    expect(errorsOf(withItem({ time: '10:00', title: 'X', place: { name: 'P', lat: 95, lng: 10 } }))[0]).toMatch(/„lat” i „lng”/);
  });

  it('zbiera wszystkie błędy naraz', () => {
    expect(errorsOf(withItem({ time: '25:00', title: '', type: 'x', for: 'kilku' })).length).toBe(4);
  });

  it('inny tytuł wyjazdu – ostrzeżenie, nie błąd', () => {
    const r = validatePlan({ ...base(), trip: 'Maroko' }, ctx);
    expect(r.ok && r.warnings[0]).toMatch(/opisany jako „Maroko”/);
  });
});
