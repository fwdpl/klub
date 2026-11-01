// Wybór strefy czasowej wyjazdu po polskiej nazwie kraju lub miejsca (decyzja E: bez wartości domyślnej).

export interface ZoneOption {
  label: string; // po polsku, np. „Islandia”
  zone: string; // IANA, np. „Atlantic/Reykjavik”
  keywords?: string; // dodatkowe słowa do wyszukiwania (miasta, wyspy)
}

// Kierunki pokazywane, zanim ktoś zacznie pisać
export const POPULAR = ['Europe/Warsaw', 'Atlantic/Reykjavik', 'Europe/Lisbon', 'Atlantic/Canary', 'Europe/Athens', 'America/New_York'];

export const ZONES: ZoneOption[] = [
  { label: 'Polska', zone: 'Europe/Warsaw', keywords: 'warszawa krakow tatry zakopane gdansk' },
  { label: 'Wielka Brytania', zone: 'Europe/London', keywords: 'anglia szkocja londyn edynburg' },
  { label: 'Irlandia', zone: 'Europe/Dublin', keywords: 'dublin' },
  { label: 'Islandia', zone: 'Atlantic/Reykjavik', keywords: 'reykjavik vik' },
  { label: 'Wyspy Owcze', zone: 'Atlantic/Faroe', keywords: 'torshavn' },
  { label: 'Grenlandia', zone: 'America/Nuuk', keywords: 'nuuk' },
  { label: 'Norwegia', zone: 'Europe/Oslo', keywords: 'oslo lofoty bergen tromso' },
  { label: 'Svalbard', zone: 'Arctic/Longyearbyen', keywords: 'spitsbergen longyearbyen' },
  { label: 'Szwecja', zone: 'Europe/Stockholm', keywords: 'sztokholm' },
  { label: 'Finlandia', zone: 'Europe/Helsinki', keywords: 'helsinki laponia rovaniemi' },
  { label: 'Dania', zone: 'Europe/Copenhagen', keywords: 'kopenhaga' },
  { label: 'Estonia', zone: 'Europe/Tallinn', keywords: 'tallin' },
  { label: 'Łotwa', zone: 'Europe/Riga', keywords: 'ryga' },
  { label: 'Litwa', zone: 'Europe/Vilnius', keywords: 'wilno' },
  { label: 'Niemcy', zone: 'Europe/Berlin', keywords: 'berlin monachium' },
  { label: 'Holandia', zone: 'Europe/Amsterdam', keywords: 'amsterdam' },
  { label: 'Belgia', zone: 'Europe/Brussels', keywords: 'bruksela' },
  { label: 'Francja', zone: 'Europe/Paris', keywords: 'paryz korsyka prowansja alpy' },
  { label: 'Hiszpania', zone: 'Europe/Madrid', keywords: 'madryt barcelona majorka andaluzja baleary' },
  { label: 'Wyspy Kanaryjskie', zone: 'Atlantic/Canary', keywords: 'teneryfa gran canaria lanzarote fuerteventura la palma hiszpania' },
  { label: 'Portugalia', zone: 'Europe/Lisbon', keywords: 'lizbona porto algarve' },
  { label: 'Madera', zone: 'Atlantic/Madeira', keywords: 'funchal portugalia' },
  { label: 'Azory', zone: 'Atlantic/Azores', keywords: 'sao miguel portugalia' },
  { label: 'Włochy', zone: 'Europe/Rome', keywords: 'rzym sycylia sardynia dolomity toskania' },
  { label: 'Malta', zone: 'Europe/Malta' },
  { label: 'Szwajcaria', zone: 'Europe/Zurich', keywords: 'zurych alpy' },
  { label: 'Austria', zone: 'Europe/Vienna', keywords: 'wieden alpy' },
  { label: 'Czechy', zone: 'Europe/Prague', keywords: 'praga' },
  { label: 'Słowacja', zone: 'Europe/Bratislava', keywords: 'bratyslawa tatry' },
  { label: 'Węgry', zone: 'Europe/Budapest', keywords: 'budapeszt' },
  { label: 'Słowenia', zone: 'Europe/Ljubljana', keywords: 'lublana' },
  { label: 'Chorwacja', zone: 'Europe/Zagreb', keywords: 'zagrzeb split dubrownik' },
  { label: 'Czarnogóra', zone: 'Europe/Podgorica', keywords: 'kotor' },
  { label: 'Albania', zone: 'Europe/Tirane', keywords: 'tirana' },
  { label: 'Grecja', zone: 'Europe/Athens', keywords: 'ateny kreta rodos santorini' },
  { label: 'Cypr', zone: 'Asia/Nicosia', keywords: 'nikozja larnaka' },
  { label: 'Bułgaria', zone: 'Europe/Sofia', keywords: 'sofia' },
  { label: 'Rumunia', zone: 'Europe/Bucharest', keywords: 'bukareszt transylwania' },
  { label: 'Turcja', zone: 'Europe/Istanbul', keywords: 'stambul kapadocja antalya' },
  { label: 'Gruzja', zone: 'Asia/Tbilisi', keywords: 'tbilisi kaukaz' },
  { label: 'Armenia', zone: 'Asia/Yerevan', keywords: 'erywan' },
  { label: 'Maroko', zone: 'Africa/Casablanca', keywords: 'marrakesz atlas' },
  { label: 'Tunezja', zone: 'Africa/Tunis', keywords: 'tunis' },
  { label: 'Egipt', zone: 'Africa/Cairo', keywords: 'kair hurghada' },
  { label: 'Jordania', zone: 'Asia/Amman', keywords: 'amman petra' },
  { label: 'Izrael', zone: 'Asia/Jerusalem', keywords: 'jerozolima tel awiw' },
  { label: 'Zjednoczone Emiraty Arabskie', zone: 'Asia/Dubai', keywords: 'dubaj abu zabi zea' },
  { label: 'Oman', zone: 'Asia/Muscat', keywords: 'maskat' },
  { label: 'Kenia', zone: 'Africa/Nairobi', keywords: 'nairobi safari' },
  { label: 'Tanzania', zone: 'Africa/Dar_es_Salaam', keywords: 'zanzibar kilimandzaro' },
  { label: 'RPA', zone: 'Africa/Johannesburg', keywords: 'kapsztad johannesburg' },
  { label: 'Namibia', zone: 'Africa/Windhoek', keywords: 'windhuk' },
  { label: 'Indie', zone: 'Asia/Kolkata', keywords: 'delhi goa' },
  { label: 'Sri Lanka', zone: 'Asia/Colombo', keywords: 'kolombo' },
  { label: 'Nepal', zone: 'Asia/Kathmandu', keywords: 'katmandu himalaje' },
  { label: 'Tajlandia', zone: 'Asia/Bangkok', keywords: 'bangkok phuket' },
  { label: 'Wietnam', zone: 'Asia/Ho_Chi_Minh', keywords: 'hanoi sajgon' },
  { label: 'Kambodża', zone: 'Asia/Phnom_Penh', keywords: 'angkor' },
  { label: 'Malezja', zone: 'Asia/Kuala_Lumpur', keywords: 'kuala lumpur borneo' },
  { label: 'Singapur', zone: 'Asia/Singapore' },
  { label: 'Indonezja – Bali, Lombok', zone: 'Asia/Makassar', keywords: 'bali lombok' },
  { label: 'Indonezja – Jawa, Sumatra', zone: 'Asia/Jakarta', keywords: 'dzakarta jawa sumatra' },
  { label: 'Filipiny', zone: 'Asia/Manila', keywords: 'manila' },
  { label: 'Chiny', zone: 'Asia/Shanghai', keywords: 'pekin szanghaj' },
  { label: 'Japonia', zone: 'Asia/Tokyo', keywords: 'tokio kioto' },
  { label: 'Korea Południowa', zone: 'Asia/Seoul', keywords: 'seul' },
  { label: 'USA – wschód', zone: 'America/New_York', keywords: 'nowy jork floryda miami waszyngton boston' },
  { label: 'USA – środek', zone: 'America/Chicago', keywords: 'chicago teksas nowy orlean' },
  { label: 'USA – Góry Skaliste', zone: 'America/Denver', keywords: 'denver kolorado utah yellowstone' },
  { label: 'USA – Arizona', zone: 'America/Phoenix', keywords: 'phoenix wielki kanion' },
  { label: 'USA – zachód', zone: 'America/Los_Angeles', keywords: 'kalifornia los angeles san francisco las vegas nevada' },
  { label: 'USA – Alaska', zone: 'America/Anchorage', keywords: 'anchorage' },
  { label: 'USA – Hawaje', zone: 'Pacific/Honolulu', keywords: 'honolulu' },
  { label: 'Kanada – wschód', zone: 'America/Toronto', keywords: 'toronto montreal' },
  { label: 'Kanada – zachód', zone: 'America/Vancouver', keywords: 'vancouver kolumbia brytyjska' },
  { label: 'Meksyk', zone: 'America/Mexico_City', keywords: 'meksyk' },
  { label: 'Meksyk – Jukatan', zone: 'America/Cancun', keywords: 'cancun jukatan' },
  { label: 'Kuba', zone: 'America/Havana', keywords: 'hawana' },
  { label: 'Kostaryka', zone: 'America/Costa_Rica' },
  { label: 'Kolumbia', zone: 'America/Bogota', keywords: 'bogota' },
  { label: 'Peru', zone: 'America/Lima', keywords: 'lima machu picchu' },
  { label: 'Chile', zone: 'America/Santiago', keywords: 'santiago atacama patagonia' },
  { label: 'Argentyna', zone: 'America/Argentina/Buenos_Aires', keywords: 'buenos aires patagonia' },
  { label: 'Brazylia', zone: 'America/Sao_Paulo', keywords: 'rio sao paulo' },
  { label: 'Australia – Sydney', zone: 'Australia/Sydney', keywords: 'sydney melbourne' },
  { label: 'Australia – Perth', zone: 'Australia/Perth', keywords: 'perth' },
  { label: 'Nowa Zelandia', zone: 'Pacific/Auckland', keywords: 'auckland' },
];

/** Bez polskich znaków i wielkości liter: „Łódź” → „lodz”. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function utcOffset(zone: string, at = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    return (part ?? 'GMT').replace('GMT', 'UTC').replace(/^UTC$/, 'UTC+0');
  } catch {
    return '';
  }
}

/** Nazwa do pokazania dla zapisanej strefy (także spoza polskiej listy). */
export function zoneLabel(zone: string): string {
  return ZONES.find((z) => z.zone === zone)?.label ?? zone.split('/').pop()!.replace(/_/g, ' ');
}

/**
 * Podpowiedzi: najpierw polska lista (początek nazwy, potem dowolne słowo), na końcu pełna lista IANA
 * jako zapas. Pusty tekst – najczęstsze kierunki.
 */
export function searchZones(queryText: string, allZones: string[] = [], limit = 8): ZoneOption[] {
  const q = fold(queryText.trim());
  if (!q) return POPULAR.map((zone) => ZONES.find((z) => z.zone === zone)!);

  const starts: ZoneOption[] = [];
  const contains: ZoneOption[] = [];
  for (const z of ZONES) {
    const label = fold(z.label);
    const words = `${label} ${fold(z.keywords ?? '')} ${fold(z.zone.replace(/_/g, ' '))}`;
    if (label.startsWith(q)) starts.push(z);
    else if (words.split(/[\s/–-]+/).some((w) => w.startsWith(q)) || words.includes(q)) contains.push(z);
  }
  const results = [...starts, ...contains];
  if (results.length < limit) {
    const known = new Set(results.map((r) => r.zone));
    for (const zone of allZones) {
      if (results.length >= limit) break;
      if (!known.has(zone) && fold(zone.replace(/_/g, ' ')).includes(q)) {
        results.push({ label: zone.split('/').pop()!.replace(/_/g, ' '), zone });
      }
    }
  }
  return results.slice(0, limit);
}
