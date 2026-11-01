# Format planu wyjazdu – `klub-plan` 1.0

Plik JSON, który aplikacja Klub importuje jako plan dni (panel organizatora → wyjazd → **Importuj plan**).
Przykład: [`plan-example.json`](plan-example.json). Schemat formalny: [`plan.schema.v1.json`](plan.schema.v1.json).
Kontrakt jest sprawdzany testami – przykład i walidator w aplikacji muszą się zgadzać.

## Zasady

- **Czas zawsze lokalny miejsca.** `"09:30"` znaczy 9:30 tam, gdzie punkt się dzieje – niezależnie od strefy telefonu.
  Strefa dnia = strefa wyjazdu, chyba że dzień ma własną (`timezone`). Lot między strefami: `timezone` (wylot) i `endTimezone` (przylot).
- **Osoby po imieniu** – tak jak w aplikacji (panel „Osoby”), wielkość liter bez znaczenia. Tylko osoby **zatwierdzone** na ten wyjazd.
  `"for": "all"` = wszyscy. Rozdzielenie grupy = dwa punkty w tym samym czasie, każdy dla innych osób (+ `meet`, `nearby`).
- **Import zastępuje tylko dni z pliku** (decyzja I). Poprawiony jeden dzień = plik z tym jednym dniem i wyższym `revision`.
- **Krótki tytuł, szczegóły w `notes`.** Tytuł widać na osi czasu; powyżej 120 znaków import ostrzega, powyżej 500 – odrzuca.
- **Pogrubienie** w `note`, `notes`, `route` i `notes` planu: `**tekst**`. Inny HTML/Markdown nie jest interpretowany.
- Pola nieznane w wersji 1.x są ignorowane (nowsza wersja 1.y nie psuje importu). Zmiana znaczenia pola = wersja 2.0.

## Plik

| Pole | Wymagane | Opis |
|---|---|---|
| `format` | tak | zawsze `"klub-plan"` |
| `version` | tak | `"1.0"` |
| `revision` | tak | liczba ≥ 1; przy każdym ponownym eksporcie o 1 więcej |
| `trip` | nie | nazwa wyjazdu – inna niż w aplikacji daje ostrzeżenie |
| `notes` | nie | uwagi do całego planu, lista tekstów (np. „co odpuścić w pierwszej kolejności”) |
| `days` | tak | lista dni (co najmniej jeden) |

## Dzień

| Pole | Wymagane | Opis |
|---|---|---|
| `date` | tak | `"RRRR-MM-DD"`, każda data raz |
| `title` | nie | tytuł dnia, np. `"Przylot + zachód słońca w Williamsburgu"` |
| `base` | nie | baza noclegowa, np. `"Vík"` |
| `note` | nie | uwaga do całego dnia (np. „Najdłuższy dzień, pobudka 4:15”) |
| `timezone` | nie | strefa IANA dnia, gdy inna niż wyjazdu (wyjazd przez kilka krajów) |
| `weather` | nie | dzień zależny od pogody: `"beach"`, `"viewpoint"`, `"night-sky"` |
| `items` | tak | lista punktów (może być pusta) |

## Punkt

| Pole | Wymagane | Opis |
|---|---|---|
| `time` | tak | początek `"GG:MM"` tego dnia |
| `end` | nie | koniec `"GG:MM"` albo `"RRRR-MM-DDTGG:MM"`, gdy kończy się innego dnia (np. noc do 01:00) |
| `title` | tak | krótko, co się dzieje |
| `type` | nie | `"activity"` (domyślnie), `"meal"`, `"transport"`, `"flight"`, `"checkin"`, `"meeting"`, `"free"` |
| `for` | nie | `"all"` (domyślnie) albo lista imion, np. `["Jacek"]` |
| `important` | nie | `true` – wyróżnienie: stała godzina, rezerwacja, rzecz do sprawdzenia |
| `fixed` | nie | `true` – punkt nie przenosi się przy zamianie dni (loty i check-in zawsze stałe) |
| `place` | nie | `{ "name", "address"?, "lat"?, "lng"? }` – przycisk „Nawiguj” |
| `route` | nie | dojazd: linie, przesiadki, alternatywy (`**Alt:** …`) |
| `notes` | nie | szczegóły, listy, przypomnienia |
| `options` | nie | propozycje do wyboru (np. restauracje): `[{ "name", "rating"?, "address"? }]`, `rating` 0–5 |
| `meet` | nie | spotkanie po rozdzieleniu: `{ "place", "time"? }`, `time` jak `end` |
| `nearby` | nie | `true` – osoby rozdzielone, ale w pobliżu (do 10 min metrem / 15 min pieszo) |
| `tags` | nie | etykiety, np. `["foto"]` – z nich aplikacja buduje zestawienia (np. harmonogram zdjęć) |
| `timezone` | nie | strefa początku, gdy inna niż dnia (wylot) |
| `endTimezone` | nie | strefa końca (przylot) |

## Typowe sytuacje

**Rozdzielamy się na 2 godziny, potem spotkanie:**
```json
{ "time": "15:30", "end": "17:30", "title": "Macy's Herald Square", "for": ["Jolka"], "nearby": true,
  "meet": { "place": "główne wejście Macy's, 34th & Broadway", "time": "17:30" } },
{ "time": "15:30", "end": "17:30", "title": "Zdjęcia 5th Ave", "for": ["Jacek"], "nearby": true, "tags": ["foto"],
  "meet": { "place": "główne wejście Macy's, 34th & Broadway", "time": "17:30" } }
```

**Lot między strefami:**
```json
{ "time": "06:10", "end": "09:30", "timezone": "Europe/Warsaw", "endTimezone": "Atlantic/Reykjavik",
  "type": "flight", "title": "Lot FI 531 Warszawa → Keflavík", "important": true }
```

**Noc do 1:00 następnego dnia:** `"time": "23:00", "end": "2026-07-04T01:00"`.

**Kolacja z propozycjami:**
```json
{ "time": "21:30", "type": "meal", "title": "Kolacja w Williamsburgu",
  "options": [{ "name": "Le Crocodile", "rating": 4.5 }, { "name": "Misi", "rating": 4.6 }] }
```

## Co sprawdza import

Wszystkie błędy naraz, po polsku, z miejscem (np. „Dzień 2027-03-10, punkt 3 („Obiad”): „time” musi mieć postać GG:MM”).
Nic nie jest zapisywane, dopóki plik ma błędy. Ostrzeżenia (inny tytuł wyjazdu, długi tytuł, kolizje punktu prywatnego
ze wspólnym) nie blokują importu – widać je w podglądzie.
