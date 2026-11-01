import { describe, expect, it } from 'vitest';
import { organizerMessage } from './memberEvents';

describe('powiadomienie organizatora o zgłoszeniach', () => {
  it('„też tam chcę”', () => {
    expect(organizerMessage(undefined, { status: 'interested', displayName: 'Ania' }, 'Islandia')).toEqual({
      title: 'Nowe zgłoszenie',
      body: 'Ania chce jechać: Islandia',
    });
  });

  it('wycofanie zgłoszenia', () => {
    expect(organizerMessage({ status: 'interested', displayName: 'Ania' }, undefined, 'Islandia')?.body).toBe(
      'Ania rezygnuje z: Islandia',
    );
  });

  it('bez powiadomienia przy zatwierdzeniu, rezygnacji wpisanej przez organizatora i usunięciu zatwierdzonego', () => {
    expect(organizerMessage({ status: 'interested' }, { status: 'approved' }, 'X')).toBeNull();
    expect(organizerMessage({ status: 'approved' }, { status: 'withdrawn' }, 'X')).toBeNull();
    expect(organizerMessage({ status: 'approved' }, undefined, 'X')).toBeNull();
    expect(organizerMessage(undefined, { status: 'approved' }, 'X')).toBeNull();
  });
});
