// Test logowania kodem i listy osób w emulatorach (funkcje, baza, logowanie): npm run test:e2e

const P = 'demo-klub';
const FN = `http://127.0.0.1:5001/${P}/europe-central2`;
const FS = `http://127.0.0.1:8080/v1/projects/${P}/databases/(default)/documents`;
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

const call = async (name, data, idToken) => {
  const r = await fetch(`${FN}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ data }),
  });
  return r.json();
};
const signIn = async (token) =>
  (
    await (
      await fetch(`${AUTH}/accounts:signInWithCustomToken?key=fake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, returnSecureToken: true }),
      })
    ).json()
  ).idToken;
const putDoc = (path, fields) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields }) });
const getDoc = async (path) => (await fetch(`${FS}/${path}`, { headers: OWNER })).json();
const str = (v) => ({ stringValue: v });
const ok = (c, m, r) => {
  console.log(c ? 'OK  ' : 'FAIL', m, !c && r ? JSON.stringify(r) : '');
  if (!c) process.exitCode = 1;
};

// --- organizator: pierwsze logowanie kodem wpisanym ręcznie w konsoli ---
await fetch(`${FS}/loginCodes?documentId=boot`, {
  method: 'POST',
  headers: OWNER,
  body: JSON.stringify({ fields: { email: str('Organizator@Example.com'), code: str('start-2026') } }),
});

let r = await call('redeemLoginCode', { email: 'organizator@example.com', code: '736' });
ok(r.error?.status === 'INVALID_ARGUMENT' && r.error?.details?.field === 'code', 'za krótki kod: czytelny błąd', r);

r = await call('redeemLoginCode', { email: 'organizator@example.com', code: 'START 2026' });
ok(r.result?.token, 'organizator loguje się kodem startowym (inna wielkość liter i spacje)', r);
const org = await signIn(r.result?.token);
r = await call('redeemLoginCode', { email: 'organizator@example.com', code: 'start-2026' });
ok(r.error?.status === 'PERMISSION_DENIED', 'kod startowy działa tylko raz', r);

// --- lista osób ---
r = await call('createLoginCode', { email: 'ania@example.com' }, org);
ok(r.error?.status === 'FAILED_PRECONDITION', 'kodu nie da się wygenerować dla osoby spoza listy', r);

r = await call('addPerson', { email: ' Ania@Example.com ', displayName: '  Ania ' }, org);
ok(typeof r.result?.uid === 'string', 'organizator dodaje osobę do listy', r);
const aniaUid = r.result?.uid;
r = await call('addPerson', { email: 'ania@example.com', displayName: 'Ania' }, org);
ok(r.error?.status === 'ALREADY_EXISTS', 'ta sama osoba drugi raz – odmowa', r);
r = await call('addPerson', { email: 'bez-imienia@example.com', displayName: '   ' }, org);
ok(r.error?.status === 'INVALID_ARGUMENT' && r.error?.details?.field === 'displayName', 'imię jest wymagane', r);

r = await call('createLoginCode', { email: 'ania@example.com' }, org);
ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(r.result?.code ?? ''), 'kod dla osoby z listy', r);
const aniaCode = r.result?.code ?? '';
r = await call('redeemLoginCode', { email: 'ania@example.com', code: aniaCode.toLowerCase() });
ok(r.result?.token, 'osoba z listy loguje się kodem', r);
const ania = await signIn(r.result?.token);
r = await call('redeemLoginCode', { email: 'ania@example.com', code: aniaCode });
ok(r.error?.status === 'PERMISSION_DENIED', 'wygenerowany kod działa tylko raz', r);

let aniaDoc = await getDoc(`users/${aniaUid}`);
ok(
  aniaDoc.fields?.displayName?.stringValue === 'Ania' && aniaDoc.fields?.role?.stringValue === 'member' && aniaDoc.fields?.email?.stringValue === 'ania@example.com',
  'konto: imię od organizatora, rola uczestnik, mail znormalizowany',
  aniaDoc,
);

// kod wpisany w konsoli dla maila spoza listy nie wpuszcza
await fetch(`${FS}/loginCodes?documentId=obcy`, {
  method: 'POST',
  headers: OWNER,
  body: JSON.stringify({ fields: { email: str('obcy@example.com'), code: str('wpusc-mnie') } }),
});
r = await call('redeemLoginCode', { email: 'obcy@example.com', code: 'wpusc-mnie' });
ok(r.error?.status === 'PERMISSION_DENIED', 'mail spoza listy nie loguje się nawet kodem z konsoli', r);

// --- uprawnienia ---
r = await call('addPerson', { email: 'x@example.com', displayName: 'X' }, ania);
ok(r.error?.status === 'PERMISSION_DENIED', 'uczestnik nie dodaje osób', r);
r = await call('createLoginCode', { email: 'ania@example.com' }, ania);
ok(r.error?.status === 'PERMISSION_DENIED', 'uczestnik nie generuje kodów', r);
r = await call('createLoginCode', { email: 'ania@example.com' });
ok(r.error?.status === 'UNAUTHENTICATED', 'bez logowania nie da się generować kodów', r);

// --- zmiana imienia trafia też na listy przy wyjazdach ---
await putDoc('trips/t1', { title: str('Islandia'), status: str('open') });
await putDoc(`trips/t1/members/${aniaUid}`, { uid: str(aniaUid), displayName: str('Ania'), status: str('approved') });
r = await call('updatePerson', { uid: aniaUid, displayName: 'Anna' }, org);
ok(r.result?.updatedTrips === 1, 'zmiana imienia', r);
const member = await getDoc(`trips/t1/members/${aniaUid}`);
ok(member.fields?.displayName?.stringValue === 'Anna', 'nowe imię na liście osób przy wyjeździe', member);

// --- wyłączenie osoby ---
r = await call('createLoginCode', { email: 'ania@example.com' }, org);
const pendingCode = r.result?.code ?? '';
r = await call('setPersonActive', { uid: aniaUid, active: false }, org);
ok(r.result?.active === false, 'organizator wyłącza osobę', r);
r = await call('redeemLoginCode', { email: 'ania@example.com', code: pendingCode });
ok(r.error?.status === 'PERMISSION_DENIED', 'wyłączona osoba nie loguje się kodem wydanym wcześniej', r);
r = await call('createLoginCode', { email: 'ania@example.com' }, org);
ok(r.error?.status === 'FAILED_PRECONDITION', 'dla wyłączonej osoby nie ma kodów', r);
aniaDoc = await getDoc(`users/${aniaUid}`);
ok(aniaDoc.fields?.active?.booleanValue === false, 'konto oznaczone jako wyłączone', aniaDoc);
r = await call('setPersonActive', { uid: aniaUid, active: true }, org);
ok(r.result?.active === true, 'organizator włącza osobę z powrotem', r);

const orgUid = JSON.parse(Buffer.from(org.split('.')[1], 'base64url').toString()).user_id;
r = await call('setPersonActive', { uid: orgUid, active: false }, org);
ok(r.error?.status === 'FAILED_PRECONDITION', 'organizator nie wyłączy samego siebie', r);

// --- limit prób ---
for (let i = 0; i < 5; i++) await call('redeemLoginCode', { email: 'ola@example.com', code: 'ZLYKOD' + i });
r = await call('redeemLoginCode', { email: 'ola@example.com', code: 'ZLYKOD9' });
ok(r.error?.status === 'RESOURCE_EXHAUSTED', 'blokada po 5 nieudanych próbach', r);

r = await call('sendTestPush', { delaySec: 10 }, org);
ok(r.result?.sent === 0, 'testowy push bez urządzeń zwraca 0', r);

// --- powiadomienie organizatora na żądanie (decyzje K, L) ---
await putDoc('trips/t1/members/' + aniaUid, { uid: str(aniaUid), displayName: str('Anna'), status: str('approved') });
r = await call('notifyTrip', { tripId: 't1', audience: 'approved', title: 'Zmiana planu', body: 'śr 10 mar' }, org);
ok(r.result?.people === 1 && r.result?.reached === 0, 'powiadomienie do zatwierdzonych: 1 osoba (bez urządzeń – nic nie doszło)', r);
r = await call('notifyTrip', { tripId: 't1', audience: 'approved', title: 'X' }, ania);
ok(r.error?.status === 'PERMISSION_DENIED', 'uczestnik nie wysyła powiadomień do grupy', r);
r = await call('notifyTrip', { tripId: 't1', audience: 'wszyscy', title: 'X' }, org);
ok(r.error?.status === 'INVALID_ARGUMENT', 'nieznana grupa odbiorców – odmowa', r);
await putDoc('users/' + aniaUid, { email: str('ania@example.com'), displayName: str('Anna'), role: str('member'), active: { booleanValue: true }, prefs: { mapValue: { fields: { muted: { booleanValue: true } } } } });
r = await call('notifyTrip', { tripId: 't1', audience: 'interested', title: 'Koszty', body: 'nowy szacunek' }, org);
ok(r.result?.people === 0 && r.result?.muted === 1, 'osoba z włączonym „wycisz” jest pomijana', r);
