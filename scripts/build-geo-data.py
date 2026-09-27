#!/usr/bin/env python3
"""Build the compact location datasets used for offline distance estimation.

Sources (downloaded into a cache directory, never committed):
  - GeoNames cities5000 + admin1 codes (CC BY 4.0) https://download.geonames.org/export/dump/
  - GeoNames postal codes for India (CC BY 4.0) https://download.geonames.org/export/zip/IN.zip
  - OurAirports airports.csv (public domain) https://davidmegginson.github.io/ourairports-data/airports.csv

Usage: python3 scripts/build-geo-data.py <cache-dir>
Outputs: apps/web/public/data/geo/{cities,pincodes,airports}.json and meta.json
"""
import csv
import json
import sys
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "apps/web/public/data/geo"

STATE_CODES = {
    "01": "AN", "02": "AP", "03": "AS", "05": "CH", "07": "DL", "09": "GJ", "10": "HR", "11": "HP", "12": "JK",
    "13": "KL", "14": "LD", "16": "MH", "17": "MN", "18": "ML", "19": "KA", "20": "NL", "21": "OD", "22": "PY",
    "23": "PB", "24": "RJ", "25": "TN", "26": "TR", "28": "WB", "29": "SK", "30": "AR", "31": "MZ", "33": "GA",
    "34": "BR", "35": "MP", "36": "UP", "37": "CT", "38": "JH", "39": "UK", "40": "TG", "41": "LA", "52": "DH",
}
# Widely used former or alternative names, so a search for "Bangalore" finds Bengaluru.
ALIASES = {
    "Mumbai": ["Bombay"], "Bengaluru": ["Bangalore"], "Chennai": ["Madras"], "Kolkata": ["Calcutta"],
    "Gurugram": ["Gurgaon"], "Pune": ["Poona"], "Vadodara": ["Baroda"], "Thiruvananthapuram": ["Trivandrum"],
    "Kochi": ["Cochin"], "Visakhapatnam": ["Vizag", "Vishakhapatnam"], "Mysuru": ["Mysore"], "Mangaluru": ["Mangalore"],
    "Belagavi": ["Belgaum"], "Hubballi": ["Hubli"], "Kozhikode": ["Calicut"], "Puducherry": ["Pondicherry"],
    "Varanasi": ["Benares", "Banaras"], "Prayagraj": ["Allahabad"], "Thoothukudi": ["Tuticorin"],
    "Tiruchirappalli": ["Trichy"], "Delhi": ["New Delhi"], "Navi Mumbai": ["New Bombay"], "Kalaburagi": ["Gulbarga"],
}
MIN_POPULATION = 20000


def build_cities(cache: Path):
    with zipfile.ZipFile(cache / "cities5000.zip") as archive:
        rows = archive.read("cities5000.txt").decode("utf-8").splitlines()
    cities, seen = [], set()
    for line in rows:
        f = line.split("\t")
        if f[8] != "IN" or int(f[14] or 0) < MIN_POPULATION:
            continue
        name, state = f[2].strip(), STATE_CODES.get(f[10], "")
        key = (name.lower(), state)
        if key in seen:
            continue
        seen.add(key)
        city = {"n": name, "s": state, "la": round(float(f[4]), 4), "lo": round(float(f[5]), 4), "p": int(f[14])}
        if name in ALIASES:
            city["a"] = ALIASES[name]
        cities.append(city)
    for name in ["Gurugram", "Mysuru", "Mangaluru", "Belagavi", "Hubballi", "Kalaburagi"]:
        # GeoNames lists some cities under their older names; expose the current official name too.
        legacy = {"Gurugram": "Gurgaon", "Mysuru": "Mysore", "Mangaluru": "Mangalore", "Belagavi": "Belgaum", "Hubballi": "Hubli", "Kalaburagi": "Gulbarga"}[name]
        for city in cities:
            if city["n"] == legacy:
                city["n"], city["a"] = name, [legacy]
    cities.sort(key=lambda c: -c["p"])
    return cities


def km(a, b):
    from math import asin, cos, radians, sin, sqrt
    dlat, dlon = radians(b[0] - a[0]), radians(b[1] - a[1])
    h = sin(dlat / 2) ** 2 + cos(radians(a[0])) * cos(radians(b[0])) * sin(dlon / 2) ** 2
    return 2 * 6371.0088 * asin(sqrt(h))


def build_pincodes(cache: Path, cities):
    """GeoNames stores many Indian PIN codes at district-centroid precision. Where the district
    names a city within 60 km, the city coordinate is a better estimate of where freight moves."""
    with zipfile.ZipFile(cache / "postal-IN.zip") as archive:
        rows = archive.read("IN.txt").decode("utf-8").splitlines()
    by_name = defaultdict(list)
    for city in cities:
        for name in [city["n"], *city.get("a", [])]:
            by_name[name.lower()].append(city)
    groups = defaultdict(list)
    for line in rows:
        f = line.split("\t")
        if len(f) < 11 or not f[9] or not f[10]:
            continue
        groups[f[1]].append((float(f[9]), float(f[10]), f[2], f[5], STATE_CODES.get(f[4], f[3][:2].upper())))
    pins, snapped = {}, 0
    for pin, entries in groups.items():
        lats, lons = sorted(e[0] for e in entries), sorted(e[1] for e in entries)
        point = (lats[len(lats) // 2], lons[len(lons) // 2])
        district, state = entries[0][3] or entries[0][2], entries[0][4]
        label, precision = district, "d"
        candidates = [c for key in (district.lower(), district.lower().replace(" urban", "").replace(" rural", "")) for c in by_name.get(key, [])]
        candidates = [c for c in candidates if km(point, (c["la"], c["lo"])) <= 60]
        if candidates:
            city = max(candidates, key=lambda c: c["p"])
            point, label, precision = (city["la"], city["lo"]), city["n"], "c"
            snapped += 1
        pins[pin] = [round(point[0], 3), round(point[1], 3), label, state, precision]
    print(f"PIN codes snapped to a city coordinate: {snapped} of {len(pins)}")
    return dict(sorted(pins.items()))


def build_airports(cache: Path):
    airports = []
    with open(cache / "airports.csv", newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            iata = row["iata_code"].strip()
            if len(iata) != 3 or row["scheduled_service"] != "yes":
                continue
            india = row["iso_country"] == "IN"
            if not (india and row["type"] in ("large_airport", "medium_airport", "small_airport")) and row["type"] != "large_airport":
                continue
            airports.append({"c": iata, "n": row["name"].strip(), "m": row["municipality"].strip(), "k": row["iso_country"], "t": {"large_airport": "L", "medium_airport": "M"}.get(row["type"], "S"),
                             "la": round(float(row["latitude_deg"]), 4), "lo": round(float(row["longitude_deg"]), 4)})
    airports.sort(key=lambda a: (a["k"] != "IN", a["m"], a["c"]))
    return airports


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    cache = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    cities = build_cities(cache)
    datasets = {"cities": cities, "pincodes": build_pincodes(cache, cities), "airports": build_airports(cache)}
    for name, data in datasets.items():
        (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    meta = {
        "built": date.today().isoformat(),
        "counts": {name: len(data) for name, data in datasets.items()},
        "sources": [
            {"dataset": "cities", "source": "GeoNames cities5000", "licence": "CC BY 4.0", "url": "https://download.geonames.org/export/dump/", "filter": f"India, population >= {MIN_POPULATION}"},
            {"dataset": "pincodes", "source": "GeoNames postal codes (IN)", "licence": "CC BY 4.0", "url": "https://download.geonames.org/export/zip/", "filter": "Median post-office coordinate per PIN code; snapped to the named city when it lies within 60 km (precision c), otherwise district-level (precision d)"},
            {"dataset": "airports", "source": "OurAirports", "licence": "Public domain", "url": "https://ourairports.com/data/", "filter": "Indian airports with scheduled service and IATA code; large international airports"},
        ],
    }
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta["counts"]))


if __name__ == "__main__":
    main()
