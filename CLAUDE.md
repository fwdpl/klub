# Aplikacja wyjazdowa dla grupy (PWA) — instrukcje dla Claude Code

Pełna specyfikacja: `docs/SPEC.md`. Przeczytaj ją przed pierwszą zmianą w sesji i przed każdą zmianą modelu danych.

## Kto i jak pracuje
- Właściciel i jedyny organizator: Jacek. On decyduje, testuje na telefonie i zatwierdza.
- Cykl pracy: Jacek opisuje zmianę → Ty piszesz kod na gałęzi `feature/...` → PR → GitHub Actions publikuje na środowisko TESTOWE → Jacek testuje na iPhonie/Androidzie/tablecie → Jacek merguje → automat publikuje na produkcję.
- Nigdy nie pushuj bezpośrednio na `main`. Nigdy nie wdrażaj na produkcję. Nie masz dostępu do produkcyjnego projektu Firebase i nie proś o niego.
- Pytaj o zgodę przed poleceniami w terminalu (ustawienie domyślne zostaje). Żadnych operacji destrukcyjnych (usuwanie plików, danych, historii Git) bez wyraźnej zgody.
- Operacje na danych Firestore tylko w emulatorze albo w projekcie testowym.

## Zakres
- Realizuj wyłącznie bieżący etap ze `docs/SPEC.md` → „Zakres wersji”. v1 jest zamrożona.
- Pomysły spoza zakresu dopisuj do `docs/IDEAS.md` — nie implementuj ich.
- Decyzje oznaczone w SPEC jako OTWARTE: zapytaj Jacka, nie zakładaj.
- Każde wydanie: podbij wersję w `package.json` i dopisz wpis w `CHANGELOG.md` (po polsku, krótko, z perspektywy użytkownika).

## Zasady techniczne (nienegocjowalne)
- Bezpieczeństwo = reguły Firestore. Każda zmiana modelu danych idzie razem ze zmianą `firestore.rules` i testami reguł w emulatorze (`@firebase/rules-unit-testing`). Testy muszą przechodzić przed PR.
- Czas w planie: czas lokalny miejsca („wall clock”, `YYYY-MM-DDTHH:mm`) + strefa IANA. Nigdy UTC jako źródło prawdy planu.
- Wszystkie kolory przez zmienne CSS; motyw jasny/ciemny działa od pierwszego ekranu, bez błysku przy starcie.
- Mobile-first (sprawdzaj przy szerokości 375 px), potem tablet.
- Offline-first: każdy ekran v1 musi działać bez sieci po synchronizacji.
- Bez sekretów w repozytorium. Konfiguracja webowa Firebase jest jawna; klucze kont serwisowych tylko w GitHub Secrets.
- Repozytorium i logi GitHub Actions są publiczne: nigdy nie wypisuj w logach (workflow, Cloud Functions) sekretów, kodów logowania ani tokenów.
- iOS: logowanie wyłącznie w zainstalowanej aplikacji; prośba o powiadomienia tylko po kliknięciu przycisku; nie używaj magic linków ani przekierowań OAuth.

## Język
- Interfejs, komunikaty, CHANGELOG i opisy PR: po polsku.
- Kod, identyfikatory, nazwy kolekcji i pól: po angielsku.
