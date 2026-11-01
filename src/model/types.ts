// Model danych aplikacji (SPEC §4). Zmiana tutaj = zmiana firestore.rules + testów reguł.

export const SCHEMA_VERSION = 1;

export type Role = 'organizer' | 'member';
export type ThemePref = 'auto' | 'light' | 'dark';

/** users/{uid} – tworzy i zmienia wyłącznie funkcja serwerowa (lista osób Jacka). */
export interface UserDoc {
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  prefs: { theme: ThemePref; accent?: string; muted: boolean };
  fcmTokens: string[];
}

/**
 * Stan wyjazdu:
 * draft – widzi tylko organizator; open – widoczny, zapisy otwarte;
 * closed – widoczny, zapisy wstrzymane; archived – widzą tylko zatwierdzeni (decyzja B).
 */
export type TripStatus = 'draft' | 'open' | 'closed' | 'archived';

/** trips/{tripId} – WARSTWA 1: opis dla wszystkich z listy. */
export interface TripDoc {
  title: string;
  destination: string;
  approxDates: string;
  description: string;
  status: TripStatus;
  timezone: string; // IANA, np. 'Atlantic/Reykjavik'
  accentColor?: string;
  schemaVersion: number;
}

/**
 * Status osoby przy wyjeździe (trips/{tripId}/members/{uid}).
 * interested – osoba sama („też tam chcę”), może się sama wycofać (usunięcie wpisu);
 * approved – tylko organizator; withdrawn – tylko organizator, osoba nie zapisze się ponownie sama (decyzja C).
 */
export type MemberStatus = 'interested' | 'approved' | 'withdrawn';

export interface MemberDoc {
  uid: string;
  displayName: string;
  status: MemberStatus;
  updatedAt: unknown; // serverTimestamp
}

/** trips/{tripId}/overview/main – WARSTWA 2: zainteresowani + zatwierdzeni. */
export interface OverviewDoc {
  planSummary: string;
  costEstimate: string;
  decisionDeadline?: string; // 'YYYY-MM-DD'
}

/** „Dla kogo”: wszyscy zatwierdzeni albo wybrane osoby (decyzja G). */
export type Audience = 'all' | string[];

/** Godziny zawsze w czasie lokalnym miejsca ('YYYY-MM-DDTHH:mm') + strefa IANA – nigdy UTC. */
export interface Flight {
  id: string;
  number: string; // np. 'FI 531'
  airline: string;
  from: string; // np. 'Warszawa WAW'
  to: string;
  departure: string; // czas lokalny lotniska wylotu
  departureTz: string;
  arrival: string; // czas lokalny lotniska przylotu
  arrivalTz: string;
  notes: string;
  audience: Audience;
}

export interface Hotel {
  id: string;
  name: string;
  address: string;
  checkIn: string; // czas lokalny miejsca
  checkOut: string;
  phone: string;
  notes: string;
  audience: Audience;
}

export interface EmergencyContact {
  id: string;
  name: string;
  role: string;
  phone: string;
}

export interface ChecklistTemplateItem {
  id: string;
  text: string;
}

/** trips/{tripId}/info/main – WARSTWA 3: tylko zatwierdzeni. */
export interface InfoDoc {
  flights: Flight[];
  hotels: Hotel[];
  emergencyContacts: EmergencyContact[];
  insurance: string;
  /** Wspólna część checklisty ustalana przez organizatora (decyzja F). */
  checklistTemplate: ChecklistTemplateItem[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/**
 * trips/{tripId}/checklists/{uid} – właściciel (zatwierdzony) + organizator.
 * Odhaczenia punktów wspólnych (templateDone) + własne punkty dopisane przez osobę (items).
 */
export interface ChecklistDoc {
  templateDone: Record<string, boolean>;
  items: ChecklistItem[];
}
