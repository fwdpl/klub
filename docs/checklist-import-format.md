# Format pliku checklisty – `trip-checklist` 1

Plik, który Claude oddaje w czacie checklisty (skill „eksport checklisty”), a Jacek wgrywa w aplikacji Klub:
wyjazd → Lista → „Checklista: zadania, import, postęp” → Import z pliku → Sprawdź plik → podgląd → Zapisz.

Zasada: **kolejne importy nie nadpisują**. Plik `merge` zawiera tylko nowe i zmienione zadania. Archiwizacja,
usunięcie i reset odhaczeń dzieją się tylko wtedy, gdy plik wprost o to prosi.

## Struktura

```json
{
  "schema": "trip-checklist",
  "schemaVersion": 1,
  "tripId": "Xk3Fq9yZ2abc",
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

- `tripId` – identyfikator wyjazdu w aplikacji (losowy ciąg, nie nazwa). Claude bierze go z „Eksportu checklisty”;
  widać go też na ekranie checklisty („Identyfikator wyjazdu do plików”). Inny `tripId` = błąd.
- `schemaVersion` inna niż 1 = błąd. Nieznane pola (na górze, w zadaniu, w linku) = ostrzeżenie, są pomijane.

## Tryby (`mode`)

| Tryb | Działanie |
|---|---|
| `merge` (domyślny, także gdy brak `mode`) | Brak zadania o tym `id` → dodaj. Zadanie istnieje → zmień tylko pola podane w pliku. Zadań spoza pliku nie rusza. |
| `replace` | Usuwa wszystkie zadania wyjazdu, wszystkie odhaczenia i starą wspólną checklistę (sprzed 1.19.0), potem zapisuje zadania z pliku. Na pierwszy import. Aplikacja każe wpisać nazwę wyjazdu. Własne punkty uczestników zostają. Wpisy z `action` = błąd. |

## Pola zadania

| Pole | Opis |
|---|---|
| `id` | Wymagane. `^[a-z0-9-]{1,60}$`, unikalne w pliku, **stałe na zawsze** (zmiana treści nie zmienia `id`). Nie używać ponownie `id` usuniętego zadania. |
| `text` | Treść, do 200 znaków. Wymagane przy nowym zadaniu. |
| `details` | Opis, do 1000 znaków, zwykły tekst (bez HTML/Markdown – pokazywany dosłownie). |
| `links` | Do 5 linków `{ label, url, sponsored }`. `label` do 40 znaków. `url` tylko `https://` (inne schematy: błąd), zapisywany **dosłownie** – bez skracania i zmiany parametrów. `sponsored` domyślnie `true` (link partnerski: `rel="sponsored"` i etykieta „link partnerski”). Przy aktualizacji podana lista zastępuje całą starą. |
| `audience` | `"all"` albo tablica imion zatwierdzonych uczestników. Imiona porównywane bez wielkości liter i polskich znaków („lucja” = „Łucja”). Nieznane albo pasujące do kilku osób = błąd (aplikacja pokaże dostępne imiona). Nowe zadanie bez `audience` = dla wszystkich; aktualizacja bez `audience` = bez zmian; podana tablica zastępuje starą. |
| `due` | Termin `YYYY-MM-DD` (data lokalna, prawdziwa data). Po terminie nieodhaczone zadanie ma odznakę „po terminie”. |
| `category` | Grupa na liście, np. „Dokumenty”, „Przed wylotem” (do 60 znaków). Zadania bez kategorii – na końcu jako „Inne”. |
| `order` | Liczba – kolejność. Zwykle pomijać: nowe zadania dostają kolejne numery po największym istniejącym, w kolejności z pliku. Aktualizacja nie zmienia kolejności, chyba że `order` podano. |
| `archived` | `false` przywraca zarchiwizowane zadanie (odhaczenia wracają razem z nim). `true` działa jak `action: "archive"`. |
| `resetDone` | `true` przy aktualizacji: usuwa odhaczenia tego zadania u wszystkich (np. nowy termin biletu). Bez tej flagi aktualizacja nigdy nie rusza odhaczeń. Przy nowym zadaniu ignorowane. |
| `action` | `"archive"` – ukryj u uczestników, historia odhaczeń zostaje. `"delete"` – usuń zadanie i jego odhaczenia u wszystkich. Wpis z `action` nie potrzebuje innych pól (inne są pomijane). Odwołanie do nieistniejącego `id` = błąd (więc ponowny import pliku z `delete` zgłosi błąd). |

`null` w `details`, `links`, `due` albo `category` usuwa to pole z zadania.

## Podgląd w aplikacji

Przed zapisem aplikacja pokazuje: **Nowe** (z odbiorcami), **Zmienione** (pole: było → będzie),
**Do archiwizacji** i **Do usunięcia** (z liczbą odhaczeń), **Reset odhaczeń** (kogo dotyczy),
liczbę zadań spoza pliku, błędy (blokują „Zapisz”) i ostrzeżenia. Ponowny import tego samego pliku `merge`
(bez `delete`) daje „Plik nic nie zmienia”.

## Eksport stanu (`trip-checklist-export`)

„Eksport checklisty” (kopiuj albo pobierz plik) – do wklejenia w czacie checklisty, żeby Claude znał istniejące `id`:

```json
{
  "schema": "trip-checklist-export",
  "schemaVersion": 1,
  "tripId": "Xk3Fq9yZ2abc",
  "tripTitle": "USA 2027",
  "exportedAt": "2026-11-27",
  "participants": ["Ania", "Łucja", "Marek"],
  "tasks": [
    { "id": "esim-usa", "text": "Kup eSIM na USA", "audience": "all", "category": "Przed wylotem", "order": 1, "archived": false, "doneCount": 2 }
  ]
}
```

Zawiera wszystkie zadania (także archiwalne) z odbiorcami po imieniu i liczbą odhaczeń – bez dat i bez tego, kto odhaczył.
Eksport wgrany jako import = błąd z podpowiedzią.

Logika (walidacja, plan zmian, eksport): `src/checklist/importChecklist.ts`, testy: `src/checklist/importChecklist.test.ts`.
