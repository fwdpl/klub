# Zmiany

## 1.8.1 — zachmurzenie w procentach

- Nad każdym słupkiem zachmurzenia procent (np. „81%”), a wysokość słupka odpowiada teraz dokładnie zachmurzeniu – wcześniej słupki od ok. 70% wyglądały tak samo.

## 1.8.0 — lista życzeń

- Nowa ikona „Życzenia” przy wyjeździe (dla zatwierdzonych): wspólna lista miejsc, które chcemy zobaczyć.
- Miejsce dodajesz z podpowiedzi (mapa OpenStreetMap) albo wklejając link z Google Maps. Możesz dopisać porę dnia, czas pobytu, stałą godzinę (bilet, rezerwacja) i notatkę.
- Każde miejsce jest na liście raz – jeśli ktoś już je dodał, dopisujesz się przyciskiem „❤️ Muszę” albo „👍 Fajnie”. Drugie stuknięcie wycofuje głos. Najpopularniejsze miejsca są na górze.
- Jacek pobiera listę jednym przyciskiem jako plik do ułożenia planu.

## 1.7.0 — pogoda

- W planie przy dniach w zasięgu prognozy (7 dni) znaczek pogody, np. „🌧️ 4°/-1°”. W rozwiniętym dniu: opis, temperatura, opady, wiatr i zachmurzenie w ciągu dnia, z miejscem i godziną pobrania prognozy.
- Dla każdego dnia (także dalekich) wschód i zachód słońca oraz faza księżyca.
- Na karcie „Dziś” krótka pogoda na dziś i godzina zachodu słońca.
- Miejsce prognozy aplikacja dobiera sama z bazy dnia; organizator może je poprawić („Zmień miejsce prognozy”). Bez internetu widać ostatnio pobraną prognozę.

## 1.6.0 — ikony sekcji i ekran „Dziś”

- Ekran wyjazdu bez długiej listy: pod tytułem rząd ikon (Plan, Loty, Noclegi, Lista, Kraj, Kontakty, Polisa, Koszty, Kto jedzie) – stuknięcie pokazuje tylko tę część. Aplikacja pamięta ostatnio oglądaną.
- Mniej okienek: zamiast „Jesteś na liście uczestników” mały znaczek „✓ jedziesz” przy tytule; organizator ma małe ikony ✏️ (edycja) i 🔔 (powiadomienie) obok tytułu, „Podgląd jako uczestnik” jest w „Kto”.
- Poprawka: zapisanie szczegółów (lotów, noclegów) nie kasuje już „Uwag do planu” z importu.
- Plan zawsze zaczyna się od zwiniętych dni; rozwinięty dzień zostaje rozwinięty do zamknięcia aplikacji.
- W czasie wyjazdu na górze ekranu wyjazdu karta „Dziś”: co trwa teraz, co dalej (z odliczaniem, np. „za 30 min”), zbiórka z godziną i odliczaniem, nawigacja do następnego miejsca i nocleg na dziś z przyciskami Nawiguj, Zadzwoń i „Pokaż kierowcy”. Wieczorem – pierwszy punkt jutra.
- Dni i godziny liczone w czasie miejsca; karta odświeża się sama i działa bez internetu.

## 1.5.0 — plan w kalendarzu telefonu

- Przy planie przycisk „📅 Dodaj do kalendarza telefonu”: pobiera Twój plan (wspólne punkty i Twoje) jako plik do kalendarza, z przypomnieniem do wyboru (np. 30 min przed). Kalendarz telefonu przypomina sam, z dźwiękiem, także gdy Klub jest zamknięty.
- Godziny zgadzają się w każdej strefie – kalendarz pokazuje je w czasie telefonu, po przylocie w czasie miejsca.

## 1.4.0 — wygodniejsza edycja szczegółów

- Edycja szczegółów wyjazdu: sekcje (loty, noclegi, kontakty, ubezpieczenie, checklista) zwijają się jak na ekranie wyjazdu, z liczbą pozycji w nagłówku.
- Przy noclegu przyciski Nawiguj, Zadzwoń i „Pokaż kierowcy” stoją obok siebie w jednym rzędzie.
- Każdy lot, nocleg i kontakt zwija się do jednej linii (np. „LO 79 · Warszawa WAW → Tokio NRT · czw., 10 gru, 06:10”); nowa pozycja jest od razu rozwinięta. Przy błędzie aplikacja sama rozwija właściwą pozycję.

## 1.3.0 — pokaż kierowcy

- Przy noclegu przycisk „🚕 Pokaż kierowcy”: adres hotelu na cały ekran, dużą czcionką, w lokalnym języku (np. po japońsku), z angielskim „Please take me to this address” i telefonem hotelu. Ekran nie gaśnie, póki karta jest otwarta; działa bez internetu.
- Na karcie kierowcy przycisk „🗺 Pokaż na mapie” – Google Maps z pinezką hotelu (wymaga internetu).
- Organizator wpisuje nazwę i adres w lokalnym języku przy noclegu (np. z maila z rezerwacją) – aplikacja sama nie tłumaczy.

## 1.2.0 — karta kraju

- Przy wyjeździe karty krajów: waluta, gniazdka (czy pasuje polska wtyczka i jakie napięcie), numer alarmowy, napiwki i różnica czasu względem Polski – także w miesiącu wyjazdu. Widzą je zgłoszeni i zatwierdzeni, działają bez internetu.
- Wiza i ESTA: notatka organizatora i link do informacji MSZ dla podróżujących.
- Organizator wybiera kraje wyjazdu (także kilka) i może poprawić każde pole; puste pola wypełnia aplikacja.
- Adresy stron (zaczynające się od https://) są klikalne: w notatce o wizie, uwagach, opisie wyjazdu, planie w skrócie, uwagach do lotów i noclegów, ubezpieczeniu i w planie dni.
- Wyszukiwarka strefy czasowej zna Hongkong, Tajwan, Makau, Okinawę, Malediwy, Laos, Mongolię, Uzbekistan i więcej stref Australii.

## 1.1.0 — kolejność punktów checklisty

- Punkty checklisty można przestawiać: przytrzymaj uchwyt ⠿ z prawej strony punktu i przesuń go w nowe miejsce. Organizator układa w ten sposób wspólną część (w edycji szczegółów), a każdy – swoje własne punkty.

## 1.0.0 — pierwsza wersja dla uczestników

- Klub działa pod adresem klub.bakutis.pl: osobna, produkcyjna baza z codzienną kopią zapasową. Wersja testowa zostaje pod klub2.bakutis.pl.
- Instrukcja dla uczestników: klub.bakutis.pl/instrukcja.

## 0.8.0 — instrukcja dla uczestników (wersja testowa)

- Instrukcja pod stałym linkiem `/instrukcja` – otwiera się bez logowania, od razu z sekcją dla Twojego telefonu (iPhone, Android albo komputer). Link jest też na ekranie logowania i w Ustawieniach.
- Organizator: przy wygenerowanym kodzie przycisk „Wyślij zaproszenie z instrukcją” – gotowa wiadomość z linkiem, mailem i kodem do wysłania SMS-em albo komunikatorem.

## 0.7.0 — dopracowanie (wersja testowa)

- Organizator: podgląd wyjazdu oczami wybranego uczestnika – lista „Podgląd jako uczestnik…” przy wyjeździe. Tylko do oglądania.
- Organizator: Ustawienia → „Kopia danych” zapisuje na urządzeniu plik z kopią osób, wyjazdów, planów, szczegółów i checklist.
- Lista wyjazdów jest ułożona chronologicznie według orientacyjnych dat (np. „luty 2027” przed „sierpień 2027”); archiwum na końcu. Formularz wyjazdu podpowiada, jak aplikacja odczytała daty.
- Organizator przy wyjeździe ma „Jadę – dopisz mnie” zamiast „Też tam chcę” – po dopisaniu widzi „Mój plan” i ma swoją checklistę.

## 0.6.0 — wyjazd bez internetu i powiadomienia o zmianach (wersja testowa)

- Ikona pobierania przy wyjeździe – zapisuje ten wyjazd na telefonie; pod nią „Na telefonie: …”. Bez internetu: czerwony pasek, plan, szczegóły i checklista działają, zmiany wysyłają się po połączeniu.
- Po zmianie planu, szczegółów albo kosztów organizator dostaje gotową propozycję powiadomienia – może ją poprawić, wysłać albo pominąć. Przy wyjeździe jest też „Wyślij powiadomienie”.
- Ustawienia: „Wycisz wszystkie powiadomienia z Klubu”.
- Ekran wyjazdu: każdą sekcję można zwinąć i rozwinąć stuknięciem w nagłówek. Plan pokazuje najpierw listę dni, a każdy dzień rozwija się osobno; dzisiejszy dzień jest oznaczony „dziś” i rozwinięty. Aplikacja pamięta, co było rozwinięte.
- Ekran „Osoby”: przekreślony głośnik przy imieniu osoby, która wyciszyła albo nie włączyła powiadomień – wiadomo, z kim w pilnej sprawie skontaktować się inaczej.
- Po wysłaniu powiadomienia podsumowanie (ile osób dostało, ile nie ma włączonych powiadomień, ile wyciszyło) zostaje na ekranie do stuknięcia OK.

## 0.5.0 — plan dni (wersja testowa)

- Plan wyjazdu dla zatwierdzonych uczestników: dni z tytułem i uwagą, oś czasu z godzinami w czasie miejsca, dojazdami, propozycjami lokali, miejscem spotkania i przyciskami „Nawiguj”.
- „Mój plan” – punkty wspólne i moje; „Wszyscy” – gdzie jest reszta. Filtr etykiet, np. #foto.
- Ostrzeżenie ⚠, gdy mój osobny punkt nachodzi na wspólny.
- Pojedynczy przycisk (np. „Nawiguj”) zajmuje całą szerokość – niższy i czytelniejszy.
- Organizator importuje plan z pliku (z podglądem i listą błędów przed zapisem) – import zastępuje tylko dni z pliku – oraz poprawia, dodaje i usuwa pojedyncze punkty.

## 0.4.0 — szczegóły wyjazdu i checklisty (wersja testowa)

- Zatwierdzeni uczestnicy widzą przy wyjeździe: loty (godziny w czasie lotnisk), noclegi z przyciskami „Nawiguj” i „Zadzwoń”, kontakty awaryjne z dzwonieniem jednym stuknięciem i ubezpieczenie.
- Loty i noclegi mogą być dla wszystkich albo dla wybranych osób – każdy widzi swoje i wspólne.
- Moja checklista: wspólne punkty od organizatora na górze, pod nimi własne punkty; odhaczenia zapisują się od razu.
- Organizator uzupełnia to wszystko na ekranie „Edytuj szczegóły i checklistę”.
- Instrukcja instalacji na iPhonie uwzględnia nowe Safari: „Do ekranu głównego” i przycisk Udostępnij pod „•••”.

## 0.3.0 — wyjazdy, zgłoszenia i zatwierdzanie (wersja testowa)

- Ekran główny to lista wyjazdów. Ustawienia (powiadomienia, motyw, wylogowanie) są pod ikoną ⚙.
- Przy wyjeździe: przycisk „Też tam chcę” i „Wycofaj zgłoszenie”. Po zgłoszeniu widać plan, koszty, termin decyzji i kto jedzie.
- Organizator tworzy i edytuje wyjazdy (opis, strefa czasowa miejsca, stan: szkic, zapisy otwarte, zapisy wstrzymane, archiwum) oraz zatwierdza zgłoszenia albo wpisuje rezygnację.
- Strefę czasową wyjazdu wybiera się, wpisując kraj albo miasto po polsku (np. „Islandia”, „Bali”), zamiast przewijać długą listę.
- Organizator może dopisać osobę, która potwierdziła udział poza aplikacją.
- Powiadomienie dla uczestnika, gdy organizator zatwierdzi jego udział, wpisze rezygnację albo przywróci zgłoszenie.

## 0.2.0 — lista osób i zasady dostępu do wyjazdów (wersja testowa)

- Panel organizatora „Osoby”: dodawanie osoby (mail i imię), kod logowania, zmiana imienia, wyłączanie i włączanie dostępu.
- Zalogować się mogą tylko osoby z listy. Wyłączona osoba od razu traci dostęp i zostaje wylogowana na wszystkich telefonach.
- Organizator dostaje powiadomienie, gdy ktoś zgłosi chęć wyjazdu albo wycofa zgłoszenie.
- Zasady dostępu do wyjazdów: opis widzą wszyscy z listy, ogólny plan i koszty – zainteresowani i zatwierdzeni, szczegóły – tylko zatwierdzeni, archiwum – tylko uczestnicy danego wyjazdu.

## 0.1.0 — bramka techniczna (wersja testowa)

- Aplikację „Klub TEST” można zainstalować na ekranie głównym iPhone'a i Androida (ikona z paskiem TEST, ekran startowy z nocnym niebem).
- Na iPhonie przed instalacją aplikacja pokazuje instrukcję dodania do ekranu początkowego.
- Na Androidzie i komputerze przycisk lub instrukcja „Zainstaluj aplikację” – także po zalogowaniu.
- Logowanie mailem i jednorazowym kodem. Organizator generuje kody dla uczestników w aplikacji.
- Przycisk „Włącz powiadomienia” i testowe powiadomienie wysyłane na własne urządzenia po 10 sekundach (czas na wyjście z aplikacji).
- Gdy powiadomienia są zablokowane, aplikacja pokazuje, gdzie je włączyć na danym telefonie, i sama je uruchamia po powrocie z ustawień.
- Motyw jasny i ciemny: domyślnie jak w telefonie, z ręcznym przełącznikiem.
- Komunikat „Jest nowa wersja aplikacji” z przyciskiem „Odśwież”.
