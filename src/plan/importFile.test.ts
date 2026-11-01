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
    const [flight, car, lunch, , ania, bartek, checkin] = r.days[0].items;
    expect(flight).toMatchObject({
      type: 'flight',
      start: '2027-03-10T06:10',
      end: '2027-03-10T09:30',
      tz: 'Europe/Warsaw',
      endTz: 'Atlantic/Reykjavik',
      audience: 'all',
      pinnedToDate: true,
    });
    expect(flight.important).toBe(true);
    expect(car.route).toMatch(/Shuttle/);
    expect(lunch.options?.map((o) => o.rating)).toEqual([4.5, 4.6, 4.4]);
    expect(ania).toMatchObject({ audience: ['u-ania'], nearby: true, tags: ['foto'], meet: { place: 'parking przy Seljalandsfoss', time: '2027-03-10T17:30' } });
    expect(bartek.audience).toEqual(['u-bartek']);
    expect(checkin.pinnedToDate).toBe(true);
    expect(r.days[0]).toMatchObject({ title: 'Przylot + wodospady południowego wybrzeża', note: expect.stringMatching(/Długi dzień/) });
    expect(r.planNotes).toHaveLength(2);
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

  it('spotkanie, propozycje, etykiety, uwagi do planu', () => {
    expect(errorsOf(withItem({ time: '10:00', title: 'X', meet: { time: '11:00' } }))[0]).toMatch(/„meet” musi mieć „place”/);
    expect(errorsOf(withItem({ time: '10:00', title: 'X', meet: { place: 'P', time: '11' } }))[0]).toMatch(/„meet.time”/);
    expect(errorsOf(withItem({ time: '10:00', title: 'X', options: [{ name: 'A', rating: 7 }] }))[0]).toMatch(/„rating”/);
    expect(errorsOf(withItem({ time: '10:00', title: 'X', tags: 'foto' }))[0]).toMatch(/„tags”/);
    expect(errorsOf(withItem({ time: '10:00', title: 'X', nearby: 'tak' }))[0]).toMatch(/„nearby” to true albo false/);
    expect(errorsOf({ ...base(), notes: 'jedna uwaga' })[0]).toBe('Pole „notes” musi być listą tekstów.');
  });

  it('etykiety bez powtórzeń i wielkich liter', () => {
    const r = validatePlan(withItem({ time: '10:00', title: 'X', tags: ['Foto', 'foto ', 'jedzenie'] }), ctx);
    expect(r.ok && r.days[0].items[0].tags).toEqual(['foto', 'jedzenie']);
  });

  it('współrzędne poza zakresem', () => {
    expect(errorsOf(withItem({ time: '10:00', title: 'X', place: { name: 'P', lat: 95, lng: 10 } }))[0]).toMatch(/„lat” i „lng”/);
  });

  it('zbiera wszystkie błędy naraz', () => {
    expect(errorsOf(withItem({ time: '25:00', title: '', type: 'x', for: 'kilku' })).length).toBe(4);
  });

  it('długi tytuł – ostrzeżenie; bardzo długi – błąd', () => {
    const long = validatePlan(withItem({ time: '10:00', title: 'x'.repeat(200) }), ctx);
    expect(long.ok && long.warnings[0]).toBe('Dzień 2027-03-10, punkt 1: długi tytuł (200 znaków) – szczegóły lepiej przenieść do „notes”.');
    expect(errorsOf(withItem({ time: '10:00', title: 'x'.repeat(501) }))[0]).toMatch(/do 500 znaków/);
  });

  it('inny tytuł wyjazdu – ostrzeżenie, nie błąd', () => {
    const r = validatePlan({ ...base(), trip: 'Maroko' }, ctx);
    expect(r.ok && r.warnings[0]).toMatch(/opisany jako „Maroko”/);
  });
});

describe('schemat formalny docs/plan.schema.v1.json', () => {
  it('plik przykładowy jest zgodny ze schematem', async () => {
    const { default: Ajv2020 } = await import('ajv/dist/2020');
    const ajv = new Ajv2020({ allErrors: true });
    const validate = ajv.compile(JSON.parse(readFileSync('docs/plan.schema.v1.json', 'utf8')));
    const ok = validate(JSON.parse(example));
    expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });
});

describe('skill eksportu dla Claude (docs/claude-skill/klub-plan-export)', () => {
  const skill = 'docs/claude-skill/klub-plan-export';

  it('kopie schematu i przykładu są identyczne z dokumentacją', () => {
    expect(readFileSync(`${skill}/references/schema.v1.json`, 'utf8')).toBe(readFileSync('docs/plan.schema.v1.json', 'utf8'));
    expect(readFileSync(`${skill}/references/example.json`, 'utf8')).toBe(example);
  });

  it('walidator skilla przyjmuje przykład i odrzuca zły plik', async () => {
    const { spawnSync } = await import('node:child_process');
    const run = (file: string) =>
      spawnSync('python3', ['-I', `${skill}/scripts/validate.py`, file, '--people', 'Ania,Bartek', '--timezone', 'Atlantic/Reykjavik'], { encoding: 'utf8' });
    const good = run('docs/plan-example.json');
    expect(good.stdout).toContain('WYNIK: OK');
    const { writeFileSync, mkdtempSync } = await import('node:fs');
    const dir = mkdtempSync('/tmp/klub-plan-');
    writeFileSync(`${dir}/zly.json`, JSON.stringify(withItem({ time: '10:00', title: 'X', for: ['Celina'] })));
    const bad = run(`${dir}/zly.json`);
    expect(bad.stdout).toContain('„Celina” nie jest na liście --people');
    expect(bad.stdout).toContain('WYNIK: BŁĘDY');
  });
});
