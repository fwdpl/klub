import { offsetMinutes } from '../plan/time';

// Wbudowane informacje o krajach do karty kraju (decyzja Jacka z 4.11.2026: dane wbudowane + poprawki organizatora).
// Dane praktyczne, nie urzędowe – karta przypomina „sprawdź przed wyjazdem”. Wizy celowo brak: tylko link do MSZ
// i notatka organizatora (zasady wjazdu się zmieniają).

export interface CountryInfo {
  code: string;
  currency: string; // ISO 4217
  plugs: string; // typy gniazdek, np. 'C, F'
  voltage: number; // V
  emergency: string;
  tipping: string;
  zone: string; // główna strefa IANA
  manyZones?: boolean;
}

const C = (
  code: string,
  currency: string,
  plugs: string,
  voltage: number,
  emergency: string,
  tipping: string,
  zone: string,
  manyZones = false,
): CountryInfo => ({ code, currency, plugs, voltage, emergency, tipping, zone, ...(manyZones ? { manyZones } : {}) });

export const COUNTRIES: CountryInfo[] = [
  // Europa
  C('IS', 'ISK', 'C, F', 230, '112', 'Niewymagane – obsługa wliczona w cenę.', 'Atlantic/Reykjavik'),
  C('NO', 'NOK', 'C, F', 230, '112', 'Niewymagane; zaokrąglenie rachunku mile widziane.', 'Europe/Oslo'),
  C('SE', 'SEK', 'C, F', 230, '112', 'Niewymagane; zaokrąglenie rachunku mile widziane.', 'Europe/Stockholm'),
  C('FI', 'EUR', 'C, F', 230, '112', 'Niewymagane.', 'Europe/Helsinki'),
  C('DK', 'DKK', 'C, E, F, K', 230, '112', 'Obsługa wliczona; napiwek niewymagany.', 'Europe/Copenhagen'),
  C('DE', 'EUR', 'C, F', 230, '112', 'Zwyczajowo 5–10% albo zaokrąglenie, mówi się kwotę przy płaceniu.', 'Europe/Berlin'),
  C('AT', 'EUR', 'C, F', 230, '112', 'Zwyczajowo 5–10% albo zaokrąglenie.', 'Europe/Vienna'),
  C('CH', 'CHF', 'C, J', 230, '112', 'Obsługa wliczona; zaokrąglenie mile widziane.', 'Europe/Zurich'),
  C('FR', 'EUR', 'C, E', 230, '112', 'Obsługa wliczona („service compris”); drobne za dobrą obsługę.', 'Europe/Paris'),
  C('BE', 'EUR', 'C, E', 230, '112', 'Obsługa zwykle wliczona; zaokrąglenie mile widziane.', 'Europe/Brussels'),
  C('NL', 'EUR', 'C, F', 230, '112', 'Zaokrąglenie albo 5–10%.', 'Europe/Amsterdam'),
  C('GB', 'GBP', 'G', 230, '999 albo 112', '10–12,5% w restauracjach; sprawdź, czy „service charge” nie jest już na rachunku.', 'Europe/London'),
  C('IE', 'EUR', 'G', 230, '112 albo 999', '10–15% w restauracjach; w pubach przy barze niewymagane.', 'Europe/Dublin'),
  C('ES', 'EUR', 'C, F', 230, '112', 'Opcjonalnie 5–10% albo zaokrąglenie.', 'Europe/Madrid'),
  C('PT', 'EUR', 'C, F', 230, '112', 'Opcjonalnie 5–10%.', 'Europe/Lisbon'),
  C('IT', 'EUR', 'C, F, L', 230, '112', 'Na rachunku bywa „coperto” (opłata za nakrycie); napiwek opcjonalny.', 'Europe/Rome'),
  C('GR', 'EUR', 'C, F', 230, '112', '5–10% w restauracjach.', 'Europe/Athens'),
  C('HR', 'EUR', 'C, F', 230, '112', 'Około 10% w restauracjach.', 'Europe/Zagreb'),
  C('CZ', 'CZK', 'C, E', 230, '112', 'Około 10% albo zaokrąglenie.', 'Europe/Prague'),
  C('HU', 'HUF', 'C, F', 230, '112', '10–15%; sprawdź, czy obsługa nie jest już na rachunku.', 'Europe/Budapest'),
  C('TR', 'TRY', 'C, F', 230, '112', '5–10% w restauracjach.', 'Europe/Istanbul'),
  C('GE', 'GEL', 'C, F', 220, '112', 'Około 10%; obsługa często doliczona do rachunku.', 'Asia/Tbilisi'),
  // Afryka i Bliski Wschód
  C('MA', 'MAD', 'C, E', 220, '19 policja, 15 pogotowie i straż', 'Około 10% w restauracjach; drobne dla obsługi i przewodników.', 'Africa/Casablanca'),
  C('EG', 'EGP', 'C, F', 220, '122 policja, 123 pogotowie', 'Napiwki („bakszysz”) oczekiwane: 10–15% i drobne za usługi.', 'Africa/Cairo'),
  C('ZA', 'ZAR', 'C, D, M, N', 230, '10111 policja, 10177 pogotowie, 112 z komórki', '10–15% w restauracjach.', 'Africa/Johannesburg'),
  C('KE', 'KES', 'G', 240, '999 albo 112', 'Około 10%.', 'Africa/Nairobi'),
  C('TZ', 'TZS', 'D, G', 230, '112', 'Około 10%; na safari zwyczajowo dla przewodnika i kierowcy.', 'Africa/Dar_es_Salaam'),
  C('AE', 'AED', 'G', 230, '999 policja, 998 pogotowie', '10–15%, jeśli obsługa nie jest doliczona.', 'Asia/Dubai'),
  C('JO', 'JOD', 'C, D, F, G, J', 230, '911', 'Około 10%.', 'Asia/Amman'),
  C('IL', 'ILS', 'C, H', 230, '100 policja, 101 pogotowie', '12–15% w restauracjach.', 'Asia/Jerusalem'),
  // Azja
  C('JP', 'JPY', 'A, B', 100, '110 policja, 119 pogotowie i straż', 'Napiwków się nie daje – bywają odebrane jako nietakt.', 'Asia/Tokyo'),
  C('KR', 'KRW', 'C, F', 220, '112 policja, 119 pogotowie i straż', 'Napiwków się nie daje.', 'Asia/Seoul'),
  C('CN', 'CNY', 'A, C, I', 220, '110 policja, 120 pogotowie', 'Niewymagane.', 'Asia/Shanghai'),
  C('HK', 'HKD', 'G', 220, '999', 'W restauracjach zwykle doliczone 10%; poza tym drobne mile widziane.', 'Asia/Hong_Kong'),
  C('TW', 'TWD', 'A, B', 110, '110 policja, 119 pogotowie i straż', 'Niewymagane; w restauracjach bywa doliczone 10%.', 'Asia/Taipei'),
  C('SG', 'SGD', 'G', 230, '999 policja, 995 pogotowie i straż', 'Niewymagane; w restauracjach doliczane 10% obsługi.', 'Asia/Singapore'),
  C('TH', 'THB', 'A, B, C, O', 220, '191 policja, 1669 pogotowie, 1155 policja turystyczna', 'Drobne mile widziane, w restauracjach ok. 10%.', 'Asia/Bangkok'),
  C('VN', 'VND', 'A, C', 220, '113 policja, 115 pogotowie', 'Niewymagane, ale mile widziane.', 'Asia/Ho_Chi_Minh'),
  C('MY', 'MYR', 'G', 240, '999', 'Niewymagane; w restauracjach bywa doliczone 10%.', 'Asia/Kuala_Lumpur'),
  C('ID', 'IDR', 'C, F', 230, '112', '5–10%; często doliczone do rachunku.', 'Asia/Jakarta', true),
  C('PH', 'PHP', 'A, B, C', 220, '911', 'Około 10%, jeśli obsługa nie jest doliczona.', 'Asia/Manila'),
  C('IN', 'INR', 'C, D, M', 230, '112', 'Około 10%.', 'Asia/Kolkata'),
  C('LK', 'LKR', 'D, G, M', 230, '119 policja, 1990 pogotowie', 'Około 10%.', 'Asia/Colombo'),
  C('NP', 'NPR', 'C, D, M', 230, '100 policja, 102 pogotowie', 'Około 10%; zwyczajowo dla przewodników i tragarzy.', 'Asia/Kathmandu'),
  C('MV', 'MVR', 'D, G', 230, '119 policja, 102 pogotowie', 'Zwykle doliczone 10% obsługi.', 'Indian/Maldives'),
  // Ameryki
  C('US', 'USD', 'A, B', 120, '911', '15–20% w restauracjach – w praktyce obowiązkowe; drobne dla obsługi hotelu.', 'America/New_York', true),
  C('CA', 'CAD', 'A, B', 120, '911', '15–20% w restauracjach.', 'America/Toronto', true),
  C('MX', 'MXN', 'A, B', 127, '911', '10–15% w restauracjach.', 'America/Mexico_City', true),
  C('CR', 'CRC', 'A, B', 120, '911', 'Obsługa 10% zwykle doliczona.', 'America/Costa_Rica'),
  C('CU', 'CUP', 'A, B, C, L', 110, '106 policja, 104 pogotowie', 'Około 10%; drobne bardzo mile widziane.', 'America/Havana'),
  C('BR', 'BRL', 'C, N', 127, '190 policja, 192 pogotowie', 'Zwykle doliczone 10%.', 'America/Sao_Paulo', true),
  C('AR', 'ARS', 'C, I', 220, '911 policja, 107 pogotowie', 'Około 10%.', 'America/Argentina/Buenos_Aires'),
  C('CL', 'CLP', 'C, L', 220, '133 policja, 131 pogotowie', 'Około 10% (często proponowane na rachunku).', 'America/Santiago'),
  // Oceania
  C('AU', 'AUD', 'I', 230, '000 (112 z komórki)', 'Niewymagane; za wyjątkową obsługę ok. 10%.', 'Australia/Sydney', true),
  C('NZ', 'NZD', 'I', 230, '111', 'Niewymagane.', 'Pacific/Auckland'),
];

export const CUSTOM_CODE = 'ZZ';
export const MSZ_TRAVEL_URL = 'https://www.gov.pl/web/dyplomacja/informacje-dla-podrozujacych';

export function countryInfo(code: string): CountryInfo | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

const regionNames = new Intl.DisplayNames(['pl'], { type: 'region' });
const currencyNames = new Intl.DisplayNames(['pl'], { type: 'currency' });

export function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** „jen japoński (JPY)” */
export function currencyLabel(code: string): string {
  try {
    const name = currencyNames.of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

/** Flaga z kodu kraju (znaki regionalne); dla kraju spoza listy – globus. */
export function flag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code) || code === CUSTOM_CODE) return '🌍';
  return String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** Gniazdka z oceną, czy pasuje polska wtyczka (typ C/E/F, 230 V). */
export function plugsLabel(plugs: string, voltage?: number): string {
  const types = plugs.toUpperCase().match(/[A-O]/g) ?? [];
  const fits = types.some((t) => t === 'C' || t === 'E' || t === 'F');
  const notes = [fits ? 'polska wtyczka pasuje' : 'potrzebna przejściówka'];
  if (voltage !== undefined && voltage < 200) notes.push(`napięcie ${voltage} V – sprawdź, czy ładowarka ma „100–240 V”`);
  return `${plugs}${voltage ? ` · ${voltage} V` : ''} – ${notes.join('; ')}`;
}

/** Różnica czasu względem Polski w danej chwili, np. „+8 h”, „−1 h”, „+5,5 h”, „tak samo jak w Polsce”. */
export function timeDiff(zone: string, at: Date): string {
  const ms = at.getTime();
  const minutes = offsetMinutes(zone, ms) - offsetMinutes('Europe/Warsaw', ms);
  if (minutes === 0) return 'tak samo jak w Polsce';
  const hours = Math.abs(minutes) / 60;
  const text = Number.isInteger(hours) ? String(hours) : hours.toLocaleString('pl-PL', { maximumFractionDigits: 2 });
  return `${minutes > 0 ? '+' : '−'}${text} h względem Polski`;
}

/** Wyszukiwanie kraju po polskiej nazwie (bez polskich znaków i wielkości liter). */
export function searchCountries(text: string, limit = 8): CountryInfo[] {
  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  const q = fold(text.trim());
  const named = COUNTRIES.map((c) => ({ c, name: fold(countryName(c.code)) }));
  if (!q) return [];
  const starts = named.filter((x) => x.name.startsWith(q));
  const contains = named.filter((x) => !x.name.startsWith(q) && x.name.split(/[\s-]+/).some((w) => w.startsWith(q)));
  return [...starts, ...contains].slice(0, limit).map((x) => x.c);
}
