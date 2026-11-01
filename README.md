# Klub

Aplikacja wyjazdowa dla grupy (PWA). Specyfikacja: [`docs/SPEC.md`](docs/SPEC.md). Zasady pracy: [`CLAUDE.md`](CLAUDE.md). Instrukcja dla uczestników: [`docs/INSTRUKCJA.md`](docs/INSTRUKCJA.md).

## Polecenia

| Polecenie | Co robi |
|---|---|
| `npm run dev` | aplikacja lokalnie (projekt testowy) |
| `npm run build` | budowanie wersji testowej do `dist/` |
| `npm test` | testy logiki |
| `npm run test:rules` | testy reguł Firestore w emulatorze (wymaga Javy) |
| `npm run test:e2e` | test logowania kodem i listy osób w emulatorach |
| `VITE_USE_EMULATORS=1 npm run dev` | aplikacja lokalnie na emulatorach (`npx firebase emulators:start --project klub-test-bakutis`, mail organizatora w `functions/.env.local`) |
| `python3 scripts/generate_assets.py` | ikony i ekrany startowe z `assets-src/` |

Każdy PR do `main` uruchamia testy i publikuje wersję testową (`.github/workflows/test-deploy.yml`).
