import { describe, expect, it } from 'vitest';
import { arrivalMessage, arrivalRecipients } from './arrivals';

const people = [
  { uid: 'jacek', isOrganizer: true, status: 'approved' },
  { uid: 'ania', isOrganizer: false, status: 'approved' },
  { uid: 'bartek', isOrganizer: false, status: 'approved' },
  { uid: 'celina', isOrganizer: false, status: 'interested' },
];

describe('jestem na miejscu', () => {
  it('do wszystkich: zatwierdzeni i organizator, bez nadawcy i bez zgłoszonych', () => {
    expect(arrivalRecipients(people, 'ania', 'all')).toEqual(['jacek', 'bartek']);
  });
  it('do organizatora: tylko organizator', () => {
    expect(arrivalRecipients(people, 'ania', 'organizer')).toEqual(['jacek']);
    expect(arrivalRecipients(people, 'jacek', 'organizer')).toEqual([]);
  });
  it('treść neutralna, z notatką', () => {
    expect(arrivalMessage('Ania', 'Islandia')).toEqual({ title: '📍 Ania jest na miejscu', body: 'Islandia' });
    expect(arrivalMessage('Ania', 'Islandia', ' w hotelu ').body).toBe('w hotelu · Islandia');
  });
});
