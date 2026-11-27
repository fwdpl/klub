Zadanie dla Claude Code: checklisty importowane z JSON (bez nadpisywania odhaczeń)

Data: 25.11.2026. Dotyczy etapu v1 nr 3 („informacje o wyjeździe, checklisty”) i zastępuje model checklists/{uid} z docs/SPEC.md §4. Przed startem przeczytaj docs/SPEC.md i CLAUDE.md. Wszystkie zasady z CLAUDE.md obowiązują (gałąź feature/checklists-import, PR, testy reguł, bez produkcji).

## 1. Cel

Jacek ustala checklistę przed wyjazdem w osobnym czacie z Claude (jeden czat checklisty na jeden wyjazd). Claude oddaje plik JSON, a Jacek wgrywa go w panelu organizatora.

- Każde zadanie jest dla wszystkich albo dla wybranych osób (podawanych z imienia).
- Zadanie może mieć klikalne linki. Są to linki partnerskie Jacka: aplikacja nie zmienia ich i nie dokleja do nich żadnych parametrów.
- Pierwszy import może zastąpić wszystko, co jest teraz w checklistach tego wyjazdu (dane testowe lub stare, do wyrzucenia).
- Każdy kolejny import tylko dopisuje i aktualizuje. Nigdy nie kasuje odhaczeń i nie usuwa zadań, chyba że plik wprost oznacza zadanie do archiwizacji albo usunięcia.

## 2. Model danych

Zadanie (definicja) i odhaczenie (postęp) są rozdzielone. Import zapisuje tylko zadania. Odhaczenia zmienia uczestnik, a import zmienia je wyłącznie na wyraźne polecenie (resetDone, delete, tryb replace).

```
trips/{tripId}/tasks/{taskId}          # WARSTWA 3; zapis: tylko organizator
  id: string                           # stały identyfikator z pliku (slug, np. "esim-usa"); = id dokumentu
  text: string                         # treść, max 200 znaków
  details?: string                     # opis, max 1000 znaków, zwykły tekst
  links?: { label: string, url: string, sponsored: bool }[]   # max 5
  audience: string[]                   # ['all'] albo lista uid; NIGDY pusta
  due?: 'YYYY-MM-DD'                   # termin (data lokalna, bez strefy)
  category?: string                    # grupowanie na liście, np. "Przed wylotem"
  order: number                        # kolejność wyświetlania
  archived: bool                       # true = ukryte u uczestników, historia zostaje
  updatedAt: Timestamp
  schemaVersion: 1

trips/{tripId}/checklists/{uid}        # postęp osoby; właściciel + organizator
  done: { [taskId]: Timestamp }        # brak klucza = nieodhaczone
```

Uwagi:

- audience jest zawsze tablicą: przy regułach i zapytaniach (§4) zastępuje to unię 'all' | uid[] z PlanItem.
- Imiona z pliku zamienia się na uid przy imporcie (§3.3). W bazie są tylko uid.
- Po usunięciu osoby z wyjazdu jej odhaczenia zostają (spójność z wydatkami).

## 3. Format pliku importu

### 3.1 Struktura

```json
{
  "schema": "trip-checklist",
  "schemaVersion": 1,
  "tripId": "usa-2027",
  "mode": "merge",
  "tasks": [
    {
      "id": "esim-usa",
      "text": "Kup eSIM na USA",
      "details": "Pakiet min. 10 GB na 14 dni.",
      "links": [{ "label": "Kup eSIM", "url": "https://example.com/?ref=jacek", "sponsored": true }],
      "audience": "all",
      "due": "2027-01-15",
      "category": "Przed wylotem"
    },
    { "id": "esta-ania", "text": "Złóż wniosek ESTA", "audience": ["Ania"] },
    { "id": "parking-lotnisko", "action": "archive" },
    { "id": "stary-punkt", "action": "delete" },
    { "id": "bilet-park", "text": "Kup bilet do parku na NOWY termin", "resetDone": true }
  ]
}
```

### 3.2 Tryby (mode)

| Tryb | Działanie |
|---|---|
| merge (domyślny) | Dla każdego wpisu: brak zadania o tym id → dodaj; zadanie istnieje → zaktualizuj tylko pola podane w pliku (patch), reszta bez zmian. Zadania, których nie ma w pliku, zostają nietknięte. Plik może zawierać same nowe punkty. |
| replace | Usuń wszystkie tasks tego wyjazdu i wszystkie odhaczenia (checklists/*), a także dane checklist w starym modelu, jeśli istnieją. Potem zapisz zadania z pliku. Przeznaczony na pierwszy import. |

replace wymaga dodatkowego potwierdzenia: w podglądzie pokaż na czerwono, ile zadań i odhaczeń zniknie, i każ wpisać nazwę wyjazdu. W replace wpisy z action są błędem.

### 3.3 Pola wpisu i reguły walidacji

- id: wymagane, `^[a-z0-9-]{1,60}$`, unikalne w pliku.
- action: opcjonalne.
  - "archive": ustaw archived: true. Odhaczenia zostają. Ponowny wpis bez action z "archived": false przywraca zadanie.
  - "delete": usuń zadanie i jego klucz z done u wszystkich.
  - Wpis z action nie potrzebuje innych pól. Odwołanie do nieistniejącego id jest błędem.
- audience: "all" albo tablica imion. Imię szukane jest wśród displayName osób o statusie approved w tym wyjeździe, bez rozróżniania wielkości liter i polskich znaków.
  - Imię nieznane albo pasujące do kilku osób to błąd blokujący (pokaż listę dostępnych imion).
  - Przy nowym zadaniu brak audience oznacza "all". Przy aktualizacji brak audience oznacza bez zmian.
- links[].url: tylko https://. Inne schematy (javascript:, data:, http:) to błąd. Adres zapisywany jest dosłownie, bez normalizacji i bez zmiany parametrów.
- resetDone: true: przy aktualizacji usuń odhaczenia tego zadania u wszystkich. Bez tej flagi aktualizacja nigdy nie rusza done.
- due: poprawna data YYYY-MM-DD.
- order: nowe zadania dostają kolejne numery po największym istniejącym, w kolejności z pliku. Aktualizacja nie zmienia order, chyba że plik podaje order jawnie.
- tripId w pliku musi zgadzać się z wyjazdem, w którym robiony jest import. Inaczej błąd blokujący.
- Nieznane pola: ostrzeżenie (nie błąd). schemaVersion inna niż 1: błąd.

### 3.4 Podgląd przed zapisem (obowiązkowy)

Panel organizatora → wyjazd → „Import checklisty”: wklejenie tekstu albo wybór pliku .json. Po walidacji pokaż:

- Nowe (lista z odbiorcami po imionach),
- Zmienione (pole: było → będzie),
- Do archiwizacji, Do usunięcia (z liczbą odhaczeń, które znikną),
- Reset odhaczeń (kogo dotyczy),
- Bez zmian w pliku: tylko liczba („12 zadań nie jest w pliku i zostaje bez zmian”),
- błędy (blokują przycisk „Zapisz”) i ostrzeżenia.

Zapis jednym writeBatch (atomowo). Jeśli operacji jest więcej niż 500, podziel na partie i pokaż postęp. Po zapisie krótkie podsumowanie.

### 3.5 Eksport stanu checklisty

Przycisk „Eksport checklisty” w tym samym miejscu. Zapisuje JSON z:

- tripId,
- listą uczestników zatwierdzonych (displayName),
- wszystkimi zadaniami (z audience przetłumaczonym na imiona, łącznie z archiwalnymi),
- liczbą odhaczeń przy każdym zadaniu (bez dat i bez tego, kto odhaczył).

Ten plik Jacek wkleja do czatu checklisty, żeby Claude znał istniejące id i nie tworzył duplikatów.

## 4. Reguły Firestore

- tasks:
  - Odczyt: organizator albo (status approved w wyjeździe i `resource.data.audience.hasAny(['all', request.auth.uid])`).
  - Zapis: tylko organizator.
  - Zapytanie klienta uczestnika musi odpowiadać regule: `where('audience', 'array-contains-any', ['all', uid])` + `where('archived', '==', false)`. Nie odpytywać całej kolekcji.
- checklists/{uid}:
  - Odczyt: właściciel i organizator.
  - Tworzenie i aktualizacja przez właściciela: tylko pole done, tylko gdy ma status approved.
  - Organizator: pełny zapis (potrzebny przy delete, resetDone, replace).
- Testy w emulatorze (@firebase/rules-unit-testing), co najmniej:
  - uczestnik nie widzi zadania przypisanego innej osobie,
  - uczestnik nie zapisze tasks,
  - uczestnik nie zmieni cudzego checklists,
  - uczestnik nie zmieni pól poza done,
  - interested nie widzi zadań,
  - zapytanie array-contains-any przechodzi, a zapytanie bez filtra jest odrzucane.

## 5. Logika importu: testy (Vitest)

Logikę importu (parsowanie → plan zmian → operacje zapisu) wydziel jako czystą funkcję, niezależną od Firestore, i przetestuj co najmniej te przypadki:

- merge z samymi nowymi punktami: istniejące zadania i wszystkie done bez zmian.
- merge z poprawionym linkiem w istniejącym zadaniu: done bez zmian.
- resetDone: czyści done tylko dla tego zadania.
- archive: zadanie ukryte, done zostaje. Przywrócenie działa.
- delete: zadanie i klucze done usunięte.
- replace: wszystko wyczyszczone, potem zapis.
- Błędy: nieznane imię, imię niejednoznaczne, http:/javascript: w linku, duplikat id, action na nieistniejącym id, zły tripId.
- Ponowny import tego samego pliku merge daje zero zmian (idempotencja).

## 6. Interfejs uczestnika

- Lista „Do zrobienia przed wyjazdem”: zadania pogrupowane po category, posortowane po order. Przy każdym termin i odznaka „po terminie”, gdy data minęła, a zadanie nie jest odhaczone.
- Linki jako przyciski z label: target="_blank", rel="noopener noreferrer", a przy sponsored: true także rel="sponsored". Przy linku partnerskim mała etykieta „link partnerski” (tekst konfigurowalny w jednym miejscu).
- text, details, label renderowane wyłącznie jako tekst (bez HTML).
- Odhaczenie działa offline i synchronizuje się po odzyskaniu sieci.
- Sprawdzić na iPhonie w zainstalowanej PWA: link otwiera się poza aplikacją, a powrót do aplikacji nie gubi stanu.

## 7. Interfejs organizatora

- Import i eksport (§3.4, §3.5).
- Tabela postępu: wiersze to zadania, kolumny to osoby z danego audience, komórka to ✓ z datą albo puste. Filtr „tylko niezrobione”.
- Przycisk „Podgląd jako uczestnik X” pokazuje checklistę tej osoby.

## 8. Poza zakresem (wpisać do docs/IDEAS.md, nie implementować)

- Push „nowe zadanie na checkliście” (zależy od otwartej decyzji o wysyłce pushy, SPEC §8).
- Prywatne punkty dodawane przez uczestnika.
- Automatyczny import z repozytorium (inbox/ + GitHub Actions).
- Szablony checklist kopiowane z poprzedniego wyjazdu.

## 9. Zakończenie

- Zaktualizuj docs/SPEC.md §4 (model) i §5 (opis checklist) zgodnie z tym dokumentem.
- Format pliku z §3 zapisz osobno w docs/checklist-import-format.md: z niego będzie korzystał Claude w czacie.
- Podbij wersję, dopisz wpis w CHANGELOG.md, otwórz PR. W opisie PR podaj listę przypadków z §5 i z testów reguł.
- Jeśli w repozytorium istnieje już implementacja checklist w starym modelu: nie migruj danych, bo pierwszy import w trybie replace je wyczyści. Usuń stary kod i reguły.
