# Aplikacja wyjazdowa dla grupy — specyfikacja (PWA)

Wersja specyfikacji: 1.4 (1.11.2026). Źródła: podsumowanie ustaleń z 3.10.2026 + uzupełnienia i harmonogram z tej samej sesji; decyzje z 28.10.2026 (powiadomienia, logowanie, widoczność uczestników, format planu, adres, nazwa, motywy i kolory); konfiguracja z 31.10.2026 (projekty, organizator, pierwsze logowanie, ikona, ekran startowy); decyzje A/B/C i powiadomienie organizatora z 1.11.2026; stan bramki technicznej.

---

## 1. Cel i założenia

Własna aplikacja dla grupy wyjazdowej: lista wyjazdów, plan dni, informacje, checklisty i wspólne wydatki w jednym miejscu, dostępne offline na telefonach.

- Grupa: do 10 osób, ok. 50% Android / 50% iPhone.
- Główne treści (wyjazdy, plan, informacje) wprowadza Jacek (organizator). Uczestnicy dodają miejsca do listy życzeń i wydatki (v2).
- Bilety na atrakcje i PDF-y NIE są w aplikacji (wysyłane innym kanałem).
- Koszt utrzymania: docelowo zero.
- Plan wyjazdu układa Claude poza aplikacją (z eksportu listy życzeń); aplikacja go importuje (JSON).

---

## 2. Technologia

### Wybrane
- **PWA**: HTML/CSS/JS, manifest (nazwa, ikona), service worker (offline, aktualizacje). Bez App Store i Google Play. Jeden kod: Android, iPhone, tablet, laptop.
- **Firebase na planie Blaze** (karta + alert budżetowy; przy 10 osobach koszt ~0 zł): Auth (logowanie), Firestore z trwałym cache offline, FCM (powiadomienia), Hosting, Cloud Functions (wysyłka pushy, jednorazowe kody logowania). Region funkcji i bazy: `europe-central2` (Warszawa).
- **Pogoda**: Open-Meteo (bez klucza) — v2.
- **Słońce/Księżyc**: lokalnie biblioteką SunCalc (wschód/zachód, złota i niebieska godzina, faza Księżyca, noc astronomiczna) — offline, dowolna data.
- **Kursy walut**: API NBP (tabela A) — v2.

### Propozycja stosu (do potwierdzenia na starcie)
- Vite + TypeScript, bez ciężkiego frameworka (ewentualnie Preact/Lit, jeśli UI urośnie).
- `vite-plugin-pwa` (Workbox), `registerType: 'prompt'` → komunikat „Jest nowa wersja, odśwież”.
- Firebase modular SDK v10+; Firestore `persistentLocalCache` + `persistentMultipleTabManager`.
- Testy: Firebase Emulator Suite + `@firebase/rules-unit-testing` (reguły), Vitest (logika: strefy czasowe, kolizje, salda).

### Odrzucone (nie wracać bez nowego powodu)
Aplikacja natywna (99 USD/rok Apple, recenzje), gotowe aplikacje typu Wanderlog (nie pokrywają całości), no-code na arkuszu (brak prywatności per osoba, słaby offline), Supabase (usypia darmowe projekty), iframe z PWA wewnątrz innej aplikacji, GitHub Actions jako serwer pushy (opóźnienia, brak wyzwalania z aplikacji), logowanie mailem i hasłem (zastąpione jednorazowym kodem), wspólny format planu z FrameTrails J01 (inny cel i model czasu — patrz §9).

### Środowiska
- **Dwa projekty Firebase**, oba na planie Blaze (Functions są potrzebne w obu), wspólne konto rozliczeniowe, osobne alerty budżetowe:
  - testowy `klub-test-bakutis` — dane testowe; dostęp Claude wyłącznie przez GitHub Actions (konto serwisowe `github-deploy`, klucz w sekrecie `FIREBASE_SERVICE_ACCOUNT_TEST`); Firestore bez kopii zapasowych,
  - produkcyjny `klub-bakutis` — Claude nie ma dostępu; Firestore w `europe-central2` z codzienną kopią zapasową (Scheduled backups → Daily).
- Okres próbny Google Cloud (300 USD / 90 dni): przed końcem stycznia 2027 aktywować pełne konto rozliczeniowe („Activate full account”), inaczej usługi mogą stanąć.
- **Adres produkcyjny: `klub.bakutis.pl`** (ustalone 28.10.2026). To stały adres aplikacji, nie tylko adres instalacji — logowanie, dane offline i zgoda na powiadomienia są przypisane do niego.
- **Stały adres testowy: `klub2.bakutis.pl`** (ustalone 28.10.2026) zamiast kanałów podglądu — kanały mają zmienne adresy i wygasają, nie nadają się do instalacji na ekranie.
- **Nazwa aplikacji: „Klub”** (pełna i krótka). Wersja testowa: „Klub TEST” + ikona z żółtym paskiem „TEST”, żeby Jacek odróżniał dwie instalacje.
- **GitHub**: jedno publiczne repozytorium `fwdpl/klub` (kod jawny, dane chronią reguły Firestore), aplikacja Claude GitHub App tylko do niego, ruleset na `main`: wymagany PR, blokada force push i usunięcia (merge wyłącznie przez Jacka), klucze Firebase w GitHub Secrets.
- **Deploy**: PR → testy (logika, reguły w emulatorze, logowanie kodem w emulatorach) i automatyczny deploy na projekt testowy (`.github/workflows/test-deploy.yml`); merge do `main` → deploy produkcyjny (workflow powstanie przed startem produkcji).
- Repozytorium jest publiczne, więc logi GitHub Actions też: nigdy nie wypisywać sekretów, kodów logowania ani tokenów. Cofnięcie wersji: revert w Git / poprzednia wersja w Firebase Hosting.

### Raz na stałe, przed pierwszą instalacją u grupy
Adres (`klub.bakutis.pl` — ustalony), nazwa, ikona (512 px + wersja maskable), kolor tła ekranu startowego. Zmiana adresu wymaga ponownej instalacji u wszystkich; iOS nie odświeża nazwy, ikony ani ekranu startowego.

---

## 3. Dostęp, statusy i bezpieczeństwo

### Zasady
- Dostęp wyłącznie dla maili z listy prowadzonej przez Jacka. Brak samodzielnej rejestracji.
- Indywidualne konta. Logowanie dopiero po instalacji, w aplikacji (na iOS pamięć Safari i aplikacji są rozdzielne).
- Bez magic linków; ostrożnie z logowaniem Google (na iOS otwiera Safari).
- Ukryty link ani wspólne hasło nie są zabezpieczeniem. Kod może być publiczny — dane chronią reguły Firestore sprawdzające użytkownika i jego status przy każdym odczycie.
- Każda osoba ma status osobno dla każdego wyjazdu; status decyduje, co widzi.
- Rezygnację osoby zatwierdzonej zmienia tylko Jacek; jej wydatki zostają w historii rozliczeń.
- **Lista osób** (od 1.11.2026): organizator dodaje osobę w panelu „Osoby” (mail + imię). Kod logowania można wygenerować tylko dla osoby z listy; mail spoza listy nie zaloguje się nawet kodem wpisanym w konsoli (wyjątek: mail organizatora — awaryjne wejście). Wyłączenie osoby: od razu brak dostępu do danych (reguły sprawdzają `active`), wylogowanie na wszystkich urządzeniach, unieważnienie niewykorzystanych kodów. Organizator nie wyłączy sam siebie.
- **Decyzja A (1.11.2026)**: imię nadaje organizator; uczestnik go nie zmienia. Zmiana imienia przez organizatora aktualizuje też listy osób przy wyjazdach.
- **Stany wyjazdu**: szkic (widzi tylko organizator), otwarty (widoczny, zapisy otwarte), zamknięty (widoczny, zapisy wstrzymane), archiwum.
- **Decyzja B (1.11.2026)**: wyjazdy w archiwum widzą tylko osoby zatwierdzone na nie + organizator (wszystkie warstwy).
- **Decyzja C (1.11.2026)**: po rezygnacji wpisanej przez organizatora osoba nie zgłasza się ponownie sama — przywraca ją tylko organizator.
- **Powiadomienie organizatora (1.11.2026, dopisane do v1 decyzją Jacka)**: gdy ktoś kliknie „też tam chcę” albo wycofa zgłoszenie, organizator dostaje push (z pominięciem zmian, które robi sam, i przy włączonym „wycisz”).
- Widoczność uczestników (ustalone 28.10.2026, wariant C): zainteresowani i zatwierdzeni danego wyjazdu widzą imiona osób zainteresowanych i zatwierdzonych przy tym wyjeździe. Członkowie, którzy nie kliknęli „też tam chcę”, nie widzą listy.
- Kto nie kliknął „też tam chcę”, nie dostaje powiadomień o danym wyjeździe. Dodatkowo globalny przełącznik „wycisz”.
- Dane offline po odebraniu dostępu zostają na telefonie do następnej synchronizacji (ograniczenie, nie błąd).

### Statusy

| Status | Kto nadaje | Co widzi i może |
|---|---|---|
| Członek grupy | Jacek (mail na liście) | Lista wyjazdów: kierunek, orientacyjne daty, opis. Przycisk „też tam chcę”. |
| Zainteresowany | Uczestnik sam (może wycofać) | Ogólny plan wyjazdu i koszty. Tylko ważne powiadomienia (koszty, termin decyzji). |
| Zatwierdzony | Tylko Jacek, po potwierdzeniu poza aplikacją | Loty, hotele, plan dni, lista życzeń, wydatki, checklisty, potwierdzenia zmian. Wszystkie powiadomienia wyjazdu. |
| Organizator | — | Wszystko + panel zarządzania. |

### Wymóg projektowy: trzy warstwy danych
Reguły Firestore działają na poziomie dokumentów, nie pól. Dane wyjazdu muszą być fizycznie rozdzielone:
1. opis dla grupy (członkowie),
2. ogólny plan i koszty (zainteresowani + zatwierdzeni),
3. szczegóły (tylko zatwierdzeni).

### Konta użytkowników
- **Logowanie jednorazowym kodem** (ustalone 28.10.2026). Przepływ:
  1. Jacek w panelu organizatora generuje kod dla osoby z listy i przekazuje go osobiście lub SMS-em.
  2. Osoba w zainstalowanej aplikacji wpisuje mail i kod.
  3. Cloud Function sprawdza kod i zwraca własny token Firebase (custom token); aplikacja loguje się nim i sesja zostaje na stałe.
- Kod: jednorazowy, ważny ograniczony czas (propozycja 48 h), limit nieudanych prób, przechowywany wyłącznie jako skrót (hash) w kolekcji niedostępnej dla klienta. Nowy telefon lub wyczyszczone dane → Jacek generuje nowy kod.
- Szczegóły (od 31.10.2026): kod 8 znaków bez mylących znaków (0/O, 1/I/L), pokazywany jako `XXXX-XXXX`; wielkość liter, spacje i myślniki nie mają znaczenia; kod wpisany ręcznie w konsoli musi mieć co najmniej 6 znaków; ważny 48 h; wygenerowanie nowego kodu unieważnia poprzednie niewykorzystane kody tej osoby; 5 nieudanych prób dla maila → blokada na 15 min.
- Bez haseł i resetu hasła przez Safari. Konto Firebase Auth i dokument `users/{uid}` tworzy funkcja przy pierwszym użyciu kodu.
- **Mail organizatora** jest wyłącznie w sekrecie GitHub `ORGANIZER_EMAIL` (nie w repozytorium — repo jest publiczne). Automat zapisuje go przy wdrożeniu do `functions/.env.<projectId>` (plik ignorowany przez Git). Rolę `organizer` dostaje konto z tym mailem przy pierwszym logowaniu; pozostali `member`. Zmiana sekretu nie zmienia ról istniejących kont — przeniesienie roli trzeba zrobić osobno. Emulator i testy używają `organizator@example.com` (`functions/.env.demo-klub`).
- **Pierwsze logowanie i awaryjne wejście organizatora**: Jacek w konsoli Firebase (Firestore → `loginCodes` → dodaj dokument) wpisuje pola `email` i `code` (dowolny wymyślony kod). Funkcja przyjmuje go raz i usuwa dokument. Do bazy przez konsolę pisze tylko właściciel projektu.

---

## 4. Model danych (projekt — do dopracowania w pierwszej sesji)

Wszystkie dokumenty planu mają pole `schemaVersion`. Schemat planu jest wspólny z FrameTrails (patrz §9) i trzymany w jednym module (`src/model/`).

```
users/{uid}                       # tworzy/zmienia tylko funkcja (panel „Osoby”); użytkownik czyta swój i zmienia fcmTokens/prefs, organizator czyta wszystkie
  email, displayName, role: 'organizer'|'member', active: bool
  prefs: { theme: 'auto'|'light'|'dark', accent?: string, muted: bool }
  fcmTokens: string[]             # każda instalacja ma własny token

trips/{tripId}                    # WARSTWA 1 — każdy aktywny użytkownik
  title, destination, approxDates, description, status: 'draft'|'open'|'closed'|'archived'
  timezone (IANA), accentColor?, schemaVersion

trips/{tripId}/members/{uid}      # status uczestnika
  uid, status: 'interested'|'approved'|'withdrawn', displayName, updatedAt
  # odczyt listy: organizator + zainteresowani i zatwierdzeni tego wyjazdu (wariant C); własny wpis zawsze
  # użytkownik: create tylko własnego wpisu jako 'interested' przy wyjeździe otwartym, z imieniem z users
  #   i updatedAt = czas serwera; delete własnego wpisu tylko gdy 'interested'
  # 'approved' / 'withdrawn': tylko organizator; wpis 'withdrawn' zostaje (decyzja C)
  # trips (warstwa 1): uczestnik czyta open/closed (zapytanie musi filtrować po status), archived tylko zatwierdzony
  # wszystkie warstwy wyjazdu w archiwum: tylko zatwierdzeni (decyzja B)

trips/{tripId}/overview/main      # WARSTWA 2 — interested + approved + organizer
  planSummary, costEstimate, decisionDeadline?

trips/{tripId}/info/main          # WARSTWA 3 — approved + organizer
  flights[], hotels[], emergencyContacts[], insurance, countryCard{}
trips/{tripId}/days/{date}        # WARSTWA 3 — approved + organizer (wszyscy zatwierdzeni widzą wszystkie plany: „gdzie jest reszta”)
  date, baseLocation, weatherDependent?: 'beach'|'viewpoint'|'night-sky'
  items: PlanItem[]
trips/{tripId}/checklists/{uid}   # właściciel + organizator
  items: { id, text, done }[]

loginCodes/{codeId}               # tylko Cloud Functions (klient: brak dostępu)
  # wygenerowany w panelu:
  email (znormalizowany), codeHash, salt, expiresAt, usedAt?, createdBy, createdAt
  # wpisany ręcznie w konsoli (pierwsze logowanie / awaryjne): usuwany po użyciu
  email, code
loginAttempts/{sha256(email)}     # tylko Cloud Functions: failures, lockedUntilMs?

# v2
trips/{tripId}/wishlist/{placeId}
trips/{tripId}/expenses/{expenseId}
trips/{tripId}/changes/{changeId} + reads/{uid}
```

### PlanItem
```
id, type: 'activity'|'meal'|'transport'|'flight'|'checkin'|'meeting'|'free'
title, start: 'YYYY-MM-DDTHH:mm', end?: 'YYYY-MM-DDTHH:mm', tz?: IANA   # brak tz = strefa wyjazdu
endTz?: IANA                                                               # loty między strefami
audience: 'all' | uid[]           # „dla kogo”
pinnedToDate: bool                # loty, check-in, bilety na godzinę — nie przenoszą się przy zamianie dni
place?: { name, address, lat, lng, placeId? }
notes?
```

### Zasady modelu
- Czas: zawsze czas lokalny miejsca + strefa IANA, nigdy UTC jako źródło prawdy. Telefon może być w innej strefie niż wyjazd.
- Reguły nie są filtrami: każde zapytanie klienta musi być zgodne z regułami (np. nie odpytywać kolekcji, do której użytkownik ma dostęp tylko częściowo).
- Kopia zapasowa: codzienne kopie Firestore w produkcji (Blaze, ustawiane przy tworzeniu bazy) + przycisk „eksport całego wyjazdu do JSON” w panelu organizatora jako kopia do trzymania u siebie.

---

## 5. Funkcje

### v1 (rdzeń)
- **Logowanie**, lista dozwolonych maili (panel „Osoby”), statusy per wyjazd, trzy warstwy danych.
- **Powiadomienie organizatora** o „też tam chcę” i wycofaniu zgłoszenia (dopisane 1.11.2026).
- **Lista wyjazdów** z „też tam chcę” (i wycofaniem) oraz zatwierdzaniem przez Jacka.
- **Informacje o wyjeździe**: loty, hotele, kontakty awaryjne, ubezpieczenie. Offline.
- **Checklisty** przed wyjazdem: osobne dla każdej osoby, z odhaczaniem.
- **Plan dni z planami indywidualnymi**: każdy punkt ma „dla kogo” (wszyscy / wybrane osoby / jedna osoba). Uczestnik widzi swoją oś czasu: punkty wspólne + swoje. Punkty wspólne wyróżnione, z adresem i nawigacją (link do Google Maps). Podgląd „gdzie jest reszta” (plany wszystkich obok siebie). Ostrzeżenie o kolizji punktu prywatnego ze wspólnym.
- **Import planu z JSON** (schemat §4/§9) z walidacją i podglądem przed zapisem.
- **Tryb offline**: przycisk „pobierz wszystko na wyjazd”, widoczna data ostatniej synchronizacji.
- **Powiadomienia** (mechanizm wysyłki: patrz OTWARTE DECYZJE) + przycisk „Włącz powiadomienia”.
- **Komunikat o nowej wersji** („Jest nowa wersja, odśwież”).
- **Motyw jasny/ciemny**: Auto (za systemem) + ręczny wybór; zapis w `users/{uid}.prefs`; ustawiany przed renderem (bez błysku). Na iOS pasek statusu `black-translucent`.
- **Układ telefonu** + **panel organizatora** (działający też na telefonie): wyjazdy, uczestnicy i statusy, konta, import planu, eksport kopii.
- **Podgląd jako uczestnik X** w panelu organizatora (tylko widok; reguły i tak egzekwuje baza).

### v2
- **Wspólna lista życzeń**: miejsce istnieje raz (wyszukiwarka miejsc, unikalny identyfikator, bez duplikatów). Inni klikają „też chcę” z własnym priorytetem. Pola: link/miejsce, priorytet („muszę” / „fajnie by było”), preferowana pora, szacowany czas pobytu, ewentualna stała godzina. Eksport do JSON jednym przyciskiem.
- **Wspólne wydatki**: kto płacił, kwota, waluta, podział (po równo / kwotami), kategorie. Salda i minimalna liczba przelewów. Przeliczenie na walutę bazową kursem NBP. Wpis offline wysyła się po odzyskaniu sieci. Oznaczanie przelewu jako wykonanego.
- **Wpłaty na wyjazd**: zaliczki/raty za loty i hotele opłacone z góry przez Jacka.
- **Potwierdzenia odczytu**: automatyczny zapis „zobaczył zmianę” przy każdej zmianie; przycisk „Przyjąłem” tylko przy zmianach „wymaga potwierdzenia”. Panel: kto zobaczył i kiedy, kto potwierdził, przypomnienie do brakujących. Grupa wie, że odczyty są widoczne. (Statystyki FCM są zbiorcze — odczyty logować w aplikacji.)
- **Pogoda**: prognoza dla lokalizacji dnia (temperatura, opady, zachmurzenie godzinowe, wiatr) tylko 5–7 dni do przodu, z datą pobrania. Słońce/Księżyc z SunCalc bez ograniczenia dni.
- **Zamiana dni**: podmiana treści dwóch dni razem z planami indywidualnymi. Punkty `pinnedToDate` zostają. Ostrzeżenie przy dniach w różnych bazach noclegowych. „Cofnij”. Po zamianie push z wymaganym potwierdzeniem.
- **Dni zależne od pogody**: oznaczenie dnia; wieczorem alert tylko do Jacka, gdy prognoza na jutro jest zła, z propozycją zamiany.
- **Układ tabletowy**: plan + mapa, plany uczestników w kolumnach, panel organizatora.
- **Zestawy kolorów**: akcent per osoba lub kolor per wyjazd.
- Wspólna lista „kto co bierze” + szablony checklist kopiowane z poprzedniego wyjazdu.
- Przydział aut i pokoi (wykorzystuje „dla kogo”).
- Głosowanie nad terminem na etapie „zainteresowany”.
- Eksport listy życzeń i planu do KML/GPX.
- Przycisk „dotarłem”.

### Szybko po v1 (tanie, wysoka wartość)
- Eksport osobistego planu do kalendarza (.ics) — kalendarz telefonu przypomina natywnie, w tle, z dźwiękiem.
- Ekran „Dziś”: następny punkt, zbiórka z odliczaniem, adres hotelu, pogoda.
- Karta kraju: waluta, napiwki, gniazdka, numer alarmowy, różnica czasu, wiza/ESTA.
- Karta „pokaż kierowcy”: adres hotelu dużą czcionką, w lokalnym języku.

### Później / opcjonalnie
- Wysłanie lokalizacji: jednorazowy punkt GPS z pushem i linkiem do Google Maps; awaryjnie SMS z linkiem. Bez śledzenia na żywo.
- Termin decyzji z przypomnieniem, limit miejsc z listą rezerwową.
- Ostrzeżenia o godzinach otwarcia po zamianie dni.
- Własne edycje planu przez uczestników.
- Oceny miejsc po wizycie, podsumowanie wyjazdu + link do albumu Google Photos, archiwum i klonowanie wyjazdu.

### Celowo NIE budować
Czat (grupa ma komunikator; wystarczy tablica ogłoszeń organizatora), śledzenie na żywo, przechowywanie plików (biletów, zdjęć, paragonów), dane wrażliwe w profilach (numery paszportów, informacje zdrowotne).

---

## 6. Przepływ planowania wyjazdu
1. Jacek dodaje wyjazd z kierunkiem i orientacyjnymi datami.
2. Członkowie klikają „też tam chcę”; Jacek zatwierdza zdecydowanych.
3. Zatwierdzeni dodają miejsca do listy życzeń lub dopisują się do istniejących (v2).
4. Jacek eksportuje listy jednym przyciskiem do JSON.
5. Claude (poza aplikacją) układa plan: grupuje punkty geograficznie, pilnuje godzin otwarcia i dni zamknięcia, wstawia punkty wspólne tam, gdzie wszyscy są blisko.
6. Plan wraca do aplikacji importem; każdy widzi swój dzień.

---

## 7. Ograniczenia techniczne PWA (uwzględnić w projekcie i instrukcji dla grupy)
- iOS wymaga dodania do ekranu głównego (Safari → Udostępnij → „Do ekranu początkowego”). Bez tego nie działają powiadomienia, a iOS może czyścić dane. Potrzebna instrukcja instalacji ze zrzutami ekranu.
- Pushe na iOS: wymagany iOS 16.4+; zgoda tylko po geście użytkownika (przycisk „Włącz powiadomienia”).
- Brak działania w tle: synchronizacja przy otwarciu; push zachęca do otwarcia aplikacji po zmianach.
- Dźwięki: tylko systemowy dźwięk powiadomienia; brak przebicia trybu cichego; wzorzec wibracji tylko na Androidzie.
- Firebase Storage może wymagać planu Blaze — dlatego brak plików w aplikacji.
- Klucz Google Places (v2) będzie widoczny w kodzie: ograniczyć do domen aplikacji (produkcja, test, ewentualnie FrameTrails) i do Places API.
- Ekran startowy jest systemowy i wspólny dla wszystkich: Android — ikona + `background_color` z manifestu (jeden kolor, bez wersji ciemnej); iOS — `apple-touch-startup-image` w wielu rozdzielczościach (możliwy wariant ciemny, generować narzędziem np. pwa-asset-generator). Spersonalizowane powitanie = własny ekran w aplikacji.
- Cenniki i limity planów darmowych (Firebase, Google Places) zweryfikować przy starcie.

---

## 8. Powiadomienia — wymagają serwera
FCM tylko dostarcza pushe; wysyłka wymaga klucza konta serwisowego, którego nie wolno trzymać w kliencie.

**Decyzja (28.10.2026): Blaze z kartą + alert budżetowy.** Pushe wysyłają Cloud Functions wyzwalane zmianami w Firestore (natychmiast) oraz funkcje z harmonogramu (przypomnienia, alert pogodowy). Alert budżetowy tylko ostrzega, nie blokuje wydatków.
Odrzucone: GitHub Actions jako serwer (aplikacja nie może go wyzwolić bez tokenu w kliencie; harmonogram co ≥5 min i niepunktualny).

Typy pushy: zmiana planu (z/bez wymaganego potwierdzenia), nowe koszty/termin decyzji (zainteresowani), przypomnienia do niepotwierdzonych (v2), wieczorny alert pogodowy do Jacka (v2).

---

## 9. Integracja z FrameTrails (osobista aplikacja Jacka)
- FrameTrails czyta dane grupy przez **drugie połączenie Firebase** (druga instancja aplikacji, konto organizatora). Własne dane FrameTrails zostają w jego osobnym projekcie.
- Model danych planu definiowany w jednym miejscu (wspólny moduł), z numerem wersji schematu — zmiana tu nie może po cichu zepsuć FrameTrails.
- **Format JSON planu: osobny** (ustalone 28.10.2026). J01 to szkielet trasy samochodowej (postoje ze współrzędnymi, odcinki, kontrole pogody, punkty decyzyjne, czas z offsetem), a plan grupowy to punkty programu z „dla kogo” i czasem lokalnym + strefą IANA. Wspólny format wiązałby oba kontrakty — kontrakt J01 zmienia się wyłącznie w projekcie FrameTrails.
- Format grupowy dostaje te same zabezpieczenia co J01: plik schematu JSON (`schema.v1.json`), pole `format` i `version`, `revision` przy ponownym imporcie, walidację przed zapisem.
- Jeśli FrameTrails ma czytać plan grupy: jednokierunkowy konwerter plan grupowy → J01, z testami.
- Najpierw tylko odczyt w FrameTrails; zapis później. Ustalić, która aplikacja dostaje pushe grupowe (domyślnie jedna, bez duplikatów).
- Moduł w FrameTrails: kandydat na v2. W v1 wystarczy wspólny, wersjonowany schemat.

---

## 10. Personalizacja wyglądu
- v1: motyw Auto/Jasny/Ciemny, wszystkie kolory jako zmienne CSS, `theme-color` z `media` dla obu motywów.
- **Motyw (ustalone 28.10.2026)**: domyślnie „Auto” (za ustawieniem telefonu), z ręcznym przełącznikiem Auto / Jasny / Ciemny.
- **Kolory (ustalone 28.10.2026)** — wartości to propozycja do akceptacji na podglądzie w telefonie:
  - **Ciemny**: szare tło jak w aplikacji Claude, białe litery, słoneczny żółty dla nagłówków. Tło `#262624`, karty `#30302E`, tekst `#FFFFFF`, tekst drugorzędny `#BFBDB6`, nagłówki/akcent `#FFC83D`.
  - **Jasny**: białe tło, bez żółtego; nagłówki i akcent granatowe (navy). Tło `#FFFFFF`, karty `#F4F5F7`, tekst `#1A1A1A`, tekst drugorzędny `#5F6368`, nagłówki/akcent `#1F3A6B`.
  - `theme-color` w manifeście i meta osobno dla obu motywów (`media="(prefers-color-scheme: …)"`).
- **Ikona (31.10.2026)**: wariant 05 — kremowy glob ze strzałką (`#F4ECDA`) na morskim tle (`#063945`). Wersje generuje `scripts/generate_assets.py` z `assets-src/` (512/192, maskable, apple-touch-icon, favicon; wariant TEST z żółtym paskiem).
- **Ekran startowy (31.10.2026)**: nocne niebo z Drogą Mleczną i terenówką. iOS: `apple-touch-startup-image` dla 11 rozdzielczości iPhone'ów; Android: ikona na tle `#0B0B14` (kolor nieba). W aplikacji ten sam obraz jako ekran powitalny z animowanym paskiem postępu (pasek wtopiony w oryginał został usunięty).
- Obecne pliki pochodzą ze zrzutów o niskiej rozdzielczości (ikona ok. 300 px, ekran 863×1823) — do podmiany na oryginały w pełnej rozdzielczości.
- v2: zestawy kolorów (akcent per osoba) i kolor per wyjazd; sprawdzić kontrast w obu motywach.

---

## 11. Zakres wersji i kolejność budowy
1. **Bramka techniczna (pierwszy krok, zanim powstanie reszta)**: minimalna PWA — instalacja, logowanie, push — przetestowana na prawdziwym iPhonie i Androidzie. Jeśli coś nie działa: korekta założeń.
   - Stan 1.11.2026: komputer (Firefox) — logowanie ✓, powiadomienia ✓; Android (Chrome, zainstalowana) — instalacja ✓, logowanie ✓, powiadomienia ✓; **iPhone — oczekuje na testerów**. Decyzja Jacka: kroki v1 niezależne od iPhone'a (1–4) idą dalej; przed krokiem 5 (offline, powiadomienia) wymagane potwierdzenie z iPhone'a.
   - Wnioski z Androida: blokada powiadomień bywa w Ustawieniach witryn Chrome (lista „Zablokowane”) — opisane w `docs/INSTRUKCJA.md` i w aplikacji.
2. **v1** według §5 (szacunek: 7–10 sesji po 2–3 h). Kolejność:
   1. logowanie, `users`, statusy, warstwy, reguły + testy reguł,
   2. lista wyjazdów, „też tam chcę”, zatwierdzanie, panel organizatora,
   3. informacje o wyjeździe, checklisty,
   4. plan dni, „dla kogo”, oś czasu, strefy czasowe, kolizje, import JSON,
   5. offline, powiadomienia, komunikat o nowej wersji,
   6. motyw, dopracowanie, instrukcja instalacji ze zrzutami.
3. **v2** według §5 (szacunek: 6–8 sesji).

### Harmonogram
- Start pisania v1: **16.11.2026** (wcześniej, jeśli decyzje i tożsamość są gotowe).
- Bramka techniczna: 9–13.11.
- Jednorazowa konfiguracja (ok. 1 h): GitHub, dwa projekty Firebase (Blaze + alert budżetowy w obu), GitHub Actions, DNS (`klub.bakutis.pl`, `klub2.bakutis.pl`), token Claude Code, ochrona `main`.
- Cel: v1 przetestowana przed **10.12.2026** (test offline w terenie).

---

## 12. Sposób pracy i uprawnienia
1. Jacek opisuje zmianę.
2. Claude pisze kod i wysyła go na gałąź w repozytorium GitHub (PR).
3. GitHub Actions publikuje na stały adres testowy (projekt testowy Firebase).
4. Jacek testuje na telefonie i tablecie.
5. Jacek zatwierdza merge — dopiero wtedy wersja trafia do uczestników.

Uprawnienia (ograniczone celowo): token GitHub tylko do jednego repozytorium; klucze Firebase w GitHub Secrets, używane tylko przez automat; ochrona `main`; dwa projekty Firebase (Claude bez dostępu do produkcji); Claude Code pyta o zgodę przed poleceniami w terminalu; pełna historia w Git, cofnięcie wersji jednym kliknięciem.

---

## 13. DECYZJE

### Podjęte 28.10.2026
- [x] Wysyłka pushy: **Blaze z kartą** + alert budżetowy (§8).
- [x] Logowanie: **jednorazowy kod** przez Cloud Functions (§3).
- [x] Widoczność: **wariant C** — zainteresowani i zatwierdzeni widzą imiona zainteresowanych i zatwierdzonych danego wyjazdu (§3).
- [x] Format JSON planu: **osobny**, z własnym wersjonowanym schematem (§9).
- [x] Adres produkcyjny: **`klub.bakutis.pl`** (§2).
- [x] Adres testowy: **`klub2.bakutis.pl`** (§2).
- [x] Nazwa: **„Klub”** (§2).
- [x] Motyw: domyślnie za telefonem + przełącznik. Ciemny: szary/biały/żółty; jasny: biały/navy, bez żółtego (§10).

### Podjęte 31.10.2026
- [x] Mail organizatora: w sekrecie GitHub `ORGANIZER_EMAIL`, poza repozytorium (§3).
- [x] Pierwsze logowanie: kod wpisany ręcznie w konsoli Firebase, jednorazowy (§3).
- [x] Repozytorium publiczne `fwdpl/klub` z rulesetem na `main` (§2).
- [x] Projekty: `klub-test-bakutis`, `klub-bakutis` (§2).
- [x] Ikona: wariant 05; ekran startowy: nocne niebo z terenówką (§10).
- [x] Nazwa wersji testowej: „Klub TEST”.

### Podjęte 1.11.2026
- [x] A: imię nadaje organizator, uczestnik go nie zmienia (§3).
- [x] B: archiwum widzą tylko zatwierdzeni (§3).
- [x] C: po rezygnacji ponowne zgłoszenie tylko przez organizatora (§3).
- [x] Powiadomienie organizatora o zgłoszeniach i wycofaniach — dopisane do v1 (§3, §5).

### OTWARTE (Claude Code: pytaj, nie zakładaj)
Blokujące v1:
- [ ] Test bramki technicznej na iPhonie (§11) — wymagany przed krokiem 5 v1.
- [ ] Oryginały ikony i ekranu startowego w pełnej rozdzielczości (obecne wersje są tymczasowe, §10).
- [ ] Akceptacja wartości kolorów na podglądzie w telefonie (§10).

Do v2 (nie blokują):
- [ ] Wyszukiwarka miejsc: Google Places (karta w Google Cloud) czy OpenStreetMap.
- [ ] Waluta bazowa rozliczeń (domyślnie PLN).
- [ ] Czy wprowadzać termin decyzji i limit miejsc.
- [ ] Która aplikacja (PWA czy FrameTrails) dostaje pushe grupowe Jacka.
