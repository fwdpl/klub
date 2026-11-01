import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export interface PushMessage {
  title: string;
  body: string;
  link?: string;
}

const STALE_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

/** Wysyła powiadomienie na wszystkie urządzenia osoby i usuwa nieaktualne tokeny. */
export async function sendToUser(userRef: DocumentReference, message: PushMessage): Promise<{ sent: number; failed: number }> {
  const tokens: string[] = (await userRef.get()).get('fcmTokens') ?? [];
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: message.title, body: message.body },
    webpush: { fcmOptions: { link: message.link ?? '/' } },
  });

  // Tokeny nieaktualne (odinstalowana aplikacja, cofnięta zgoda) usuwamy
  const stale = response.responses
    .map((r, i) => (!r.success && STALE_CODES.has(r.error?.code ?? '') ? tokens[i] : null))
    .filter((t): t is string => t !== null);
  if (stale.length > 0) await userRef.update({ fcmTokens: FieldValue.arrayRemove(...stale) });

  return { sent: response.successCount, failed: response.failureCount };
}
