// Test całego logowania kodem w emulatorach (funkcje, baza, logowanie): npm run test:e2e

const P = 'demo-klub';
const FN = `http://127.0.0.1:5001/${P}/europe-central2`;
const FS = `http://127.0.0.1:8080/v1/projects/${P}/databases/(default)/documents`;
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
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
const ok = (c, m) => {
  console.log(c ? 'OK  ' : 'FAIL', m);
  if (!c) process.exitCode = 1;
};

// kod startowy wpisany „ręcznie” (jak w konsoli Firebase)
await fetch(`${FS}/loginCodes?documentId=boot`, {
  method: 'POST',
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { email: { stringValue: 'Kontakt@bakutis.pl' }, code: { stringValue: 'start-2026' } } }),
});

let r = await call('redeemLoginCode', { email: 'kontakt@bakutis.pl', code: 'START 2026' });
ok(r.result?.token, 'organizator loguje się kodem startowym (inna wielkość liter i spacje) ' + (r.error ? JSON.stringify(r.error) : ''));
const orgId = await signIn(r.result?.token);
r = await call('redeemLoginCode', { email: 'kontakt@bakutis.pl', code: 'start-2026' });
ok(r.error?.status === 'PERMISSION_DENIED', 'kod startowy działa tylko raz');

r = await call('createLoginCode', { email: 'ania@example.com' }, orgId);
ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(r.result?.code ?? ''), 'organizator generuje kod ' + (r.error ? JSON.stringify(r.error) : ''));
const aniaCode = r.result?.code ?? '';

r = await call('redeemLoginCode', { email: 'ania@example.com', code: aniaCode.toLowerCase() });
ok(r.result?.token, 'uczestniczka loguje się wygenerowanym kodem');
const aniaId = await signIn(r.result?.token);
r = await call('redeemLoginCode', { email: 'ania@example.com', code: aniaCode });
ok(r.error?.status === 'PERMISSION_DENIED', 'wygenerowany kod działa tylko raz');

r = await call('createLoginCode', { email: 'ola@example.com' }, aniaId);
ok(r.error?.status === 'PERMISSION_DENIED', 'uczestniczka nie generuje kodów');
r = await call('createLoginCode', { email: 'ola@example.com' });
ok(r.error?.status === 'UNAUTHENTICATED', 'bez logowania nie da się generować kodów');

const u = await (await fetch(`${FS}/users`, { headers: { Authorization: 'Bearer owner' } })).json();
const roles = Object.fromEntries((u.documents ?? []).map((d) => [d.fields.email.stringValue, d.fields.role.stringValue]));
ok(roles['kontakt@bakutis.pl'] === 'organizer' && roles['ania@example.com'] === 'member', 'role nadane: ' + JSON.stringify(roles));

for (let i = 0; i < 5; i++) await call('redeemLoginCode', { email: 'ola@example.com', code: 'ZLYKOD' + i });
r = await call('redeemLoginCode', { email: 'ola@example.com', code: 'ZLYKOD9' });
ok(r.error?.status === 'RESOURCE_EXHAUSTED', 'blokada po 5 nieudanych próbach');

r = await call('sendTestPush', null, aniaId);
ok(r.result?.sent === 0, 'testowy push bez urządzeń zwraca 0 ' + (r.error ? JSON.stringify(r.error) : ''));
