import { notifyTrip, type NotifyAudience } from '../firebase';
import { h, toast } from '../ui';

// Powiadomienia na żądanie (decyzje K i L): po zapisie zmian organizator dostaje gotową propozycję,
// którą może poprawić i wysłać – albo pominąć. Propozycja czeka do wejścia na ekran wyjazdu.

export interface NoticeDraft {
  audience: NotifyAudience;
  title: string;
  body: string;
}

const key = (tripId: string) => `klub.notice.${tripId}`;

export function proposeNotice(tripId: string, draft: NoticeDraft): void {
  try {
    sessionStorage.setItem(key(tripId), JSON.stringify(draft));
  } catch {
    // bez pamięci sesji karta po prostu się nie pojawi – można wysłać ręcznie
  }
}

export function takeNotice(tripId: string): NoticeDraft | null {
  try {
    const raw = sessionStorage.getItem(key(tripId));
    sessionStorage.removeItem(key(tripId));
    return raw ? (JSON.parse(raw) as NoticeDraft) : null;
  } catch {
    return null;
  }
}

const AUDIENCE_LABEL: Record<NotifyAudience, string> = {
  approved: 'Zatwierdzeni uczestnicy',
  interested: 'Zgłoszeni i zatwierdzeni',
};

/** Karta wysyłki: z propozycją po zapisie albo pusta (przycisk „Wyślij powiadomienie”). */
export function noticeCard(tripId: string, draft: NoticeDraft | null): HTMLElement {
  const wrap = h('div');

  const open = (d: NoticeDraft, proposed: boolean) => {
    const audience = h(
      'select',
      { 'aria-label': 'Do kogo' },
      ...(Object.keys(AUDIENCE_LABEL) as NotifyAudience[]).map((a) => h('option', { value: a, selected: a === d.audience }, AUDIENCE_LABEL[a])),
    );
    const title = h('input', { type: 'text', value: d.title, maxlength: '60', 'aria-label': 'Tytuł powiadomienia' });
    const body = h('textarea', { rows: '2', maxlength: '200', 'aria-label': 'Treść powiadomienia' });
    body.value = d.body;
    const error = h('p', { class: 'error', role: 'alert' });
    const send = h('button', { type: 'submit', class: 'btn' }, 'Wyślij powiadomienie');
    const skip = h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => closed() }, proposed ? 'Nie teraz' : 'Anuluj');

    wrap.replaceChildren(
      h(
        'form',
        {
          class: 'card card--notice',
          onsubmit: async (e: Event) => {
            e.preventDefault();
            error.textContent = '';
            if (!title.value.trim()) return void (error.textContent = 'Podaj tytuł.');
            send.disabled = true;
            try {
              const { data } = await notifyTrip({ tripId, audience: audience.value as NotifyAudience, title: title.value, body: body.value });
              const notes = [
                data.people > data.reached ? `${data.people - data.reached} bez włączonych powiadomień` : '',
                data.muted ? `${data.muted} wyciszone` : '',
              ].filter(Boolean);
              const extra = notes.length ? ` (${notes.join(', ')})` : '';
              toast(data.reached ? `Wysłano do ${data.reached} os.${extra}` : `Nikt nie dostał powiadomienia${extra}.`);
              closed();
            } catch {
              error.textContent = navigator.onLine ? 'Nie udało się wysłać.' : 'Brak połączenia z internetem.';
              send.disabled = false;
            }
          },
        },
        h('h2', {}, proposed ? 'Wysłać powiadomienie o zmianie?' : 'Powiadomienie do uczestników'),
        proposed && h('p', { class: 'muted' }, 'Zapisane zmiany nie powiadamiają nikogo same – wyślij, gdy skończysz poprawki.'),
        h('label', { class: 'field' }, h('span', {}, 'Do kogo'), audience),
        h('label', { class: 'field' }, h('span', {}, 'Tytuł'), title),
        h('label', { class: 'field' }, h('span', {}, 'Treść'), body),
        error,
        send,
        skip,
      ),
    );
  };

  const closed = () =>
    wrap.replaceChildren(
      h(
        'button',
        { type: 'button', class: 'btn btn--secondary btn--spaced', onclick: () => open({ audience: 'approved', title: '', body: '' }, false) },
        'Wyślij powiadomienie',
      ),
    );

  if (draft) open(draft, true);
  else closed();
  return wrap;
}
