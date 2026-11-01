#!/usr/bin/env python3
"""Walidator pliku planu „klub-plan” 1.x dla skilla eksportu.

Użycie: python scripts/validate.py plan.json --people "Ania,Bartek" [--timezone Atlantic/Reykjavik]

Sprawdza to samo co import w aplikacji Klub (src/plan/importFile.ts): format, wersję, daty, godziny,
strefy, koniec po początku, imiona w „for”, propozycje, spotkania. Wypisuje BŁĘDY i UWAGI,
na końcu „WYNIK: OK” albo „WYNIK: BŁĘDY”.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
LOCAL_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$")
TYPES = {"activity", "meal", "transport", "flight", "checkin", "meeting", "free"}
WEATHER = {"beach", "viewpoint", "night-sky"}
LONG_TITLE, MAX_TITLE = 120, 500


def zone_ok(z):
    try:
        ZoneInfo(z)
        return True
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        return False


def parse_local(s):
    try:
        return datetime.strptime(s, "%Y-%m-%dT%H:%M")
    except ValueError:
        return None


def instant(local, zone):
    return local.replace(tzinfo=ZoneInfo(zone))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plik")
    ap.add_argument("--people", default="", help="imiona zatwierdzonych uczestników, po przecinku")
    ap.add_argument("--timezone", default=None, help="strefa wyjazdu (IANA); domyślnie bez sprawdzania kolizji między strefami")
    a = ap.parse_args()

    errors, notes = [], []
    try:
        data = json.load(open(a.plik, encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"BŁĄD: to nie jest poprawny JSON: {e}\nWYNIK: BŁĘDY")
        return 1

    people = {p.strip().lower() for p in a.people.split(",") if p.strip()}
    if not people:
        notes.append("Nie podano --people: imiona w „for” nie zostały sprawdzone.")
    trip_zone = a.timezone or "UTC"
    if a.timezone and not zone_ok(a.timezone):
        errors.append(f"Nieznana strefa wyjazdu „{a.timezone}”.")
        trip_zone = "UTC"

    if data.get("format") != "klub-plan":
        errors.append('Pole „format” musi mieć wartość "klub-plan".')
    v = data.get("version")
    if not (isinstance(v, str) and re.match(r"^1\.\d+$", v)):
        errors.append('Pole „version” musi mieć postać "1.0" (wersja 1.x).')
    r = data.get("revision")
    if not (isinstance(r, int) and not isinstance(r, bool) and r >= 1):
        errors.append("Pole „revision” musi być liczbą całkowitą ≥ 1.")
    if "notes" in data and not (isinstance(data["notes"], list) and all(isinstance(n, str) for n in data["notes"])):
        errors.append("Pole „notes” musi być listą tekstów.")

    days = data.get("days")
    if not isinstance(days, list) or not days:
        errors.append("Pole „days” musi być niepustą listą dni.")
        days = []

    seen = set()
    for di, day in enumerate(days, 1):
        date = day.get("date", "") if isinstance(day, dict) else ""
        where = f"Dzień {date or di}"
        if not isinstance(day, dict):
            errors.append(f"Dzień {di}: musi być obiektem.")
            continue
        if not parse_local(f"{date}T00:00"):
            errors.append(f"Dzień {di}: „date” musi być istniejącą datą RRRR-MM-DD.")
            continue
        if date in seen:
            errors.append(f"{where}: data występuje więcej niż raz.")
        seen.add(date)
        zone = day.get("timezone", trip_zone)
        if "timezone" in day and not zone_ok(day["timezone"]):
            errors.append(f"{where}: nieznana strefa „{day['timezone']}”.")
            zone = trip_zone
        if "weather" in day and day["weather"] not in WEATHER:
            errors.append(f"{where}: „weather” to beach, viewpoint albo night-sky.")
        items = day.get("items")
        if not isinstance(items, list):
            errors.append(f"{where}: „items” musi być listą.")
            continue
        spans = []
        for ii, it in enumerate(items, 1):
            at = f"{where}, punkt {ii}"
            if not isinstance(it, dict):
                errors.append(f"{at}: musi być obiektem.")
                continue
            title = (it.get("title") or "").strip() if isinstance(it.get("title"), str) else ""
            if title:
                at += f" („{title[:40]}”)"
            if not title or len(title) > MAX_TITLE:
                errors.append(f"{at}: „title” wymagany, do {MAX_TITLE} znaków.")
            elif len(title) > LONG_TITLE:
                notes.append(f"{at}: długi tytuł ({len(title)} znaków) – szczegóły lepiej w „notes”.")
            if it.get("type", "activity") not in TYPES:
                errors.append(f"{at}: nieznany „type”.")
            t = it.get("time")
            if not (isinstance(t, str) and TIME_RE.match(t)):
                errors.append(f"{at}: „time” musi mieć postać GG:MM.")
                continue
            sz = it.get("timezone", zone)
            ez = it.get("endTimezone", sz)
            for key in ("timezone", "endTimezone"):
                if key in it and not zone_ok(it[key]):
                    errors.append(f"{at}: nieznana strefa „{it[key]}”.")
                    sz = ez = zone
            start = instant(parse_local(f"{date}T{t}"), sz)
            end = start
            if "end" in it:
                e = it["end"]
                if isinstance(e, str) and TIME_RE.match(e):
                    end = instant(parse_local(f"{date}T{e}"), ez)
                elif isinstance(e, str) and LOCAL_RE.match(e) and parse_local(e):
                    end = instant(parse_local(e), ez)
                else:
                    errors.append(f"{at}: „end” to GG:MM albo RRRR-MM-DDTGG:MM.")
                if end <= start:
                    errors.append(f"{at}: koniec musi być po początku (następny dzień zapisz z datą).")
            f = it.get("for", "all")
            if f != "all":
                if not (isinstance(f, list) and f and all(isinstance(n, str) for n in f)):
                    errors.append(f"{at}: „for” to \"all\" albo lista imion.")
                    f = []
                elif people:
                    for n in f:
                        if n.strip().lower() not in people:
                            errors.append(f"{at}: „{n}” nie jest na liście --people.")
            m = it.get("meet")
            if m is not None and not (isinstance(m, dict) and isinstance(m.get("place"), str) and m["place"].strip()):
                errors.append(f"{at}: „meet” musi mieć „place”.")
            for o in it.get("options", []) if isinstance(it.get("options", []), list) else [None]:
                if not (isinstance(o, dict) and isinstance(o.get("name"), str) and o["name"].strip()):
                    errors.append(f"{at}: każda propozycja w „options” musi mieć „name”.")
                elif "rating" in o and not (isinstance(o["rating"], (int, float)) and 0 <= o["rating"] <= 5):
                    errors.append(f"{at}: „rating” propozycji to liczba 0–5.")
            p = it.get("place")
            if p is not None:
                if not (isinstance(p, dict) and isinstance(p.get("name"), str) and p["name"].strip()):
                    errors.append(f"{at}: „place” musi mieć „name”.")
                elif ("lat" in p) != ("lng" in p):
                    errors.append(f"{at}: „lat” i „lng” podaje się razem.")
            spans.append((start, end, f, title))
        # kolizje: punkt prywatny nachodzący na wspólny
        for s1, e1, f1, t1 in spans:
            if f1 == "all" or not f1:
                continue
            for s2, e2, f2, t2 in spans:
                if f2 != "all":
                    continue
                point = s1 == e1
                hit = (s2 <= s1 < e2) if point else (s1 < e2 and s2 < e1 if s2 != e2 else s1 <= s2 < e1)
                if hit:
                    notes.append(f"{where}: kolizja – „{t1[:40]}” ({', '.join(f1)}) nachodzi na wspólny „{t2[:40]}”.")
                    break

    for e in errors:
        print(f"BŁĄD: {e}")
    for n in notes:
        print(f"UWAGA: {n}")
    print("WYNIK: OK" if not errors else "WYNIK: BŁĘDY")
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
