---
name: klub-plan-export
description: Eksportuje plan wyjazdu grupowego do pliku JSON importowanego przez aplikację Klub (format „klub-plan” 1.x) – oś czasu dni z punktami „dla kogo”, dojazdami, propozycjami lokali i spotkaniami po rozdzieleniu. Używaj ZAWSZE, gdy użytkownik pisze „eksport planu do Klubu”, „eksport do Klubu”, „plan do aplikacji Klub”, „klub-plan” albo prosi o przekazanie gotowego harmonogramu wyjazdu grupowego do aplikacji Klub – w każdym projekcie planowania wyjazdu.
---

# Eksport planu do aplikacji Klub

Wersja skilla 1.0 · kontrakt `format: "klub-plan"`, `version: "1.0"`.

Harmonogram zostaje w rozmowie lub projekcie (markdown, HTML, tabela). Ten skill robi z niego plik,
który organizator importuje w aplikacji (wyjazd → **Importuj plan**). Import zastępuje tylko dni zawarte w pliku.

## Kontrakt
`references/schema.v1.json` jest nadrzędny wobec tego opisu; `references/example.json` pokazuje wszystkie pola.
Kontrakt zmienia się wyłącznie w repozytorium aplikacji (`docs/plan-format.md`) – nie dopasowuj go tutaj,
bo aplikacja odrzuci plik.

## Procedura
1. Ustal zakres: cały wyjazd albo wskazane dni („eksport planu do Klubu, dzień 3”). Niejednoznaczne – zapytaj jednym zdaniem.
2. Ustal **imiona uczestników dokładnie tak, jak są w aplikacji** (panel „Osoby”) – tylko osoby zatwierdzone na ten wyjazd.
   Jeśli nie są znane z rozmowy, zapytaj przed eksportem. Inne imię = błąd importu.
3. Ustal strefę czasową wyjazdu (IANA, np. `America/New_York`) i ewentualne dni w innej strefie.
4. Zbuduj JSON według zasad poniżej. `revision`: 1 przy pierwszym eksporcie, przy każdym kolejnym o 1 więcej
   (jeśli nie wiesz, jaka była poprzednia – zapytaj albo użyj bieżącej daty i godziny `MMDDHHmm` jako liczby).
5. Zapisz jako `plan-<krótka-nazwa-wyjazdu>-r<revision>.json` (np. `plan-nyc-r2.json`).
6. Uruchom `python scripts/validate.py <plik> --people "Imię1,Imię2"`. Popraw wszystkie BŁĘDY i uruchom ponownie.
   Nie oddawaj pliku bez `WYNIK: OK`. Brak wykonywania kodu → powiedz to wprost i oddaj plik z adnotacją „niezwalidowany”.
7. Oddaj plik i wypisz UWAGI walidatora (długie tytuły, kolizje punktów prywatnych ze wspólnymi).

## Zasady – według ZNACZENIA, nie nazw nagłówków

### Dni
- `date` `RRRR-MM-DD`; `title` – tytuł dnia z harmonogramu; `base` – baza noclegowa; `note` – uwaga do całego dnia
  (np. „Najdłuższy dzień”, „Wczesna pobudka”).
- `weather`: `"beach"`, `"viewpoint"` albo `"night-sky"`, gdy plan dnia zależy od pogody (zachód słońca z widokiem, plaża, zorza, gwiazdy).
- `timezone` dnia tylko wtedy, gdy dzień jest w innej strefie niż wyjazd.

### Punkty
- **Czas lokalny miejsca**: `time` `"GG:MM"`; `end` `"GG:MM"` albo `"RRRR-MM-DDTGG:MM"`, gdy koniec wypada następnego dnia
  (np. Times Square 23:00–01:00 → `"end": "2026-07-04T01:00"`). Punkt bez końca (np. „21:30 Kolacja”) – bez `end`.
- Godzina przybliżona („~20:00”, „po zmroku”) → najlepsza konkretna godzina z planu + wyjaśnienie w `notes`.
- **Tytuł krótki** (do ~120 znaków) – listy miejsc, kolejność marszu, opisy → `notes`.
- `for`: `"all"` albo lista imion. „Razem” → `"all"`; punkt jednej osoby → `["Imię"]`.
- **Rozdzielenie grupy** („Osobno”, „Macy's / Jacek: zdjęcia 5th Ave”) → **dwa punkty** w tym samym czasie, każdy dla innej osoby,
  oba z `"nearby": true`, jeśli są blisko, i z tym samym `meet` (`place` + `time`), jeśli plan podaje spotkanie.
- `important: true` – stała godzina, rezerwacja, „fix”, rzecz do sprawdzenia (w planach oznaczane „Uwaga”, ⚠, ✅ Rezerwacja).
  Treść rezerwacji (np. „wejście 19:10”) → `notes`. **Nie przepisuj kodów rezerwacji ani numerów biletów.**
- `type`: `meal` (posiłki), `transport` (dojazd jako osobny punkt), `flight`, `checkin`, `meeting` (zbiórka), `free` (czas wolny),
  pozostałe `activity`.
- `route` – dojazd do punktu: linie, przesiadki, alternatywa (`**Alt:** …`). Nie dubluj w `notes`.
- `options` – propozycje do wyboru (restauracje „Le Crocodile (4,5) / Misi (4,6)”) → `[{ "name": "Le Crocodile", "rating": 4.5 }, …]`.
  Ocena z przecinkiem → liczba z kropką.
- `place` – gdy punkt ma konkretne miejsce docelowe: `name`, `address` jeśli znany. `lat`/`lng` tylko ze źródła –
  **nie zgaduj współrzędnych** (bez nich aplikacja szuka po nazwie i adresie).
- `tags`: `["foto"]` dla punktów fotograficznych (z nich aplikacja zbuduje harmonogram zdjęć – nie eksportuj osobnej tabeli zdjęć).
- Pogrubienie tylko `**tekst**` (linie metra, nazwy lokali). Bez HTML.

### Uwagi do całego planu
Bloki typu „co odpuścić w pierwszej kolejności”, ogólne informacje o transporcie → `notes` pliku (lista krótkich tekstów).

### Czego NIE eksportujesz
Lotów i noclegów jako osobnych sekcji (są w aplikacji w „Szczegółach” – lot jako punkt dnia jest w porządku),
kodów rezerwacji, cen biletów, danych osobowych spoza imion, legend kolorów, osobnych tabel podsumowań.

## Wersjonowanie kontraktu
- Nowe pole opcjonalne → `version` 1.x; aplikacja ignoruje pola, których nie zna.
- Zmiana znaczenia albo usunięcie pola → wersja 2, nowy schemat, nowa wersja skilla.
