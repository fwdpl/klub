import { describe, expect, it } from 'vitest';
import { memberNotifications } from './memberEvents';

describe('zmiany zrobione przez uczestnika → organizator', () => {
  it('„też tam chcę”', () => {
    expect(memberNotifications(undefined, { status: 'interested', displayName: 'Ania' }, 'Islandia', true)).toEqual({
      toOrganizers: { title: 'Nowe zgłoszenie', body: 'Ania chce jechać: Islandia' },
    });
  });

  it('wycofanie zgłoszenia', () => {
    expect(memberNotifications({ status: 'interested', displayName: 'Ania' }, undefined, 'Islandia', true).toOrganizers?.body).toBe(
      'Ania rezygnuje z: Islandia',
    );
  });
});

describe('zmiany zrobione przez organizatora → uczestnik (decyzja D)', () => {
  it('zatwierdzenie, także od razu przy dopisaniu', () => {
    expect(memberNotifications({ status: 'interested' }, { status: 'approved' }, 'Islandia', false).toMember?.title).toBe(
      'Jesteś na liście uczestników',
    );
    expect(memberNotifications(undefined, { status: 'approved' }, 'Islandia', false).toMember?.title).toBe('Jesteś na liście uczestników');
  });

  it('rezygnacja i przywrócenie', () => {
    expect(memberNotifications({ status: 'approved' }, { status: 'withdrawn' }, 'Islandia', false).toMember?.title).toBe('Wpisano rezygnację');
    expect(memberNotifications({ status: 'withdrawn' }, { status: 'interested' }, 'Islandia', false).toMember?.title).toBe(
      'Przywrócono zgłoszenie',
    );
  });

  it('bez powiadomień: brak zmiany statusu, usunięcie wpisu, organizator nie dostaje swoich zmian', () => {
    expect(memberNotifications({ status: 'approved', displayName: 'A' }, { status: 'approved', displayName: 'B' }, 'X', false)).toEqual({});
    expect(memberNotifications({ status: 'approved' }, undefined, 'X', false)).toEqual({});
    expect(memberNotifications({ status: 'interested' }, { status: 'approved' }, 'X', false).toOrganizers).toBeUndefined();
  });
});
