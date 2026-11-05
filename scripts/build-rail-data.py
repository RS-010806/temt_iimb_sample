"""
Builds TEMT's Indian Railways station index and rail network.

    python3 scripts/build-rail-data.py [cache_dir]

Sources
- FOIS station master (Freight Operations Information System, Indian Railways / CRIS): the official list of
  stations, goods sheds, sidings, container depots and port terminals with their FOIS codes, names and zones,
  as published on the RailSAHAY freight calculator (resources/js/asttn.js). Codes and names follow FOIS.
- datameet railways (CC0, https://github.com/datameet/railways): station coordinates, and the timetable of 2016
  whose consecutive stops form the track graph.
- FOIS coordinates (scripts/data/fois-stations.json, from scripts/fetch-fois-stations.mjs) for points the 2016
  dataset does not have, mostly stations opened since.

Network: edges join consecutive stops of every scheduled train, with a curvature allowance that grows with the
hop length (short hops follow the track; long express hops cut corners). Stations no passenger train stops at are
joined to their nearest served stations. A FOIS siding, goods shed or container depot without coordinates of its
own is placed at the station that serves it, read from its FOIS name ("… SDG, DADRI", "… SERVED BY KHODIYAR"),
because FOIS charges such traffic over the distance to the serving station.

Writes apps/web/public/data/geo/stations.json and rail-graph.json, and prints checks against published Indian
Railways route distances and FOIS freight-calculator distances.
"""
import collections
import heapq
import json
import math
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "apps", "web", "public", "data", "geo")
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".cache", "railways")
DATAMEET = "https://raw.githubusercontent.com/datameet/railways/master/"
FOIS_MASTER = "https://www.fois.indianrail.gov.in/RailSAHAY/resources/js/asttn.js"

# Curvature allowance by hop length (km): track distance ≈ great-circle × factor.
SHORT_HOP, LONG_HOP = 15, 40
FACTORS = (1.05, 1.10, 1.20)
MAX_HOP_KM = 400  # longer hops between consecutive stops are data errors
CONNECT_KM = 30  # an unserved station joins the network through served stations within this distance
FOIS_CONNECT_KM = 80  # a station located by FOIS itself (often on a line opened after 2016) may be further out
FOIS_POINTS = os.path.join(ROOT, "scripts", "data", "fois-stations.json")  # from scripts/fetch-fois-stations.mjs

# datameet (2016) codes that FOIS has since replaced, checked against the FOIS master: old code -> FOIS code.
CODE_CHANGES = {"BCT": "MMCT", "ALD": "PRYJ", "MGS": "DDU", "CSTM": "CSMT"}
# Names people search by that differ from the FOIS name (renamed stations and common short forms).
SEARCH_NAMES = {
    "SBC": ["Bangalore City", "Bengaluru City", "KSR Bengaluru"], "CSMT": ["Mumbai CST", "Mumbai CSMT", "Victoria Terminus"],
    "MMCT": ["Bombay Central"], "LTT": ["Kurla Terminus", "Lokmanya Tilak Terminus"], "MAS": ["Madras Central", "Puratchi Thalaivar Dr. M.G. Ramachandran"],
    "PRYJ": ["Allahabad Jn"], "DDU": ["Mughal Sarai Jn"], "JHS": ["Virangana Lakshmibai Jhansi"], "HBJ": ["Rani Kamlapati", "Bhopal Habibganj"],
    "FD": ["Ayodhya Cantt"], "HWH": ["Kolkata Howrah"], "NDLS": ["Delhi New Delhi"],
    # The station in Shuklaganj (Unnao), across the Ganga from Kanpur, is listed by FOIS as Kanpur Bridge Left Bank.
    "CPB": ["Shuklaganj"],
}

# Published route distances (km) used to check the network: Indian Railways timetable distances.
CHECKS = [("HWH", "NDLS", 1447), ("MAS", "NDLS", 2182), ("SBC", "NZM", 2365), ("NDLS", "JAT", 577), ("CSMT", "HWH", 1968),
          ("SBC", "MAS", 362), ("PUNE", "CSMT", 192), ("LKO", "NDLS", 512), ("SC", "MAS", 794), ("ERS", "TVC", 220),
          ("MMCT", "NDLS", 1384), ("ADI", "MMCT", 491), ("GHY", "NDLS", 1909), ("BBS", "HWH", 441), ("PNBE", "NDLS", 1001), ("JP", "NDLS", 308)]
# FOIS freight calculator (RailSAHAY), "Route (Rationalized) Distance", checked November 2026.
FOIS_CHECKS = [("TKD", "KLMG", 1412), ("HWH", "NDLS", 1451), ("PUNE", "CSMT", 189), ("PRDP", "TLHR", 192),
               ("KRBA", "BNDM", 294), ("BBQ", "WFD", 336), ("ICDD", "CTCS", 1416)]

ACRONYMS = {"ICD", "CFS", "PFT", "MMLP", "CONCOR", "NTPC", "SAIL", "IOC", "IOCL", "BPCL", "HPCL", "ACC", "GSFC", "RCF", "FCI", "CWC", "DFC", "DFCC",
            "BG", "MG", "NG", "II", "III", "IV", "GIDC", "MIDC", "RINL", "NMDC", "JSW", "JSPL", "TPS", "STPS", "BHEL", "ONGC", "CPCL", "MRPL", "TISCO",
            "IISCO", "UPSIDC", "GCT", "DCM", "MSEB", "KPT", "VPT", "JNPT", "SECL", "MCL", "NCL", "BCCL", "CCL", "WCL", "ECL", "SCCL", "PCPL", "GAIL", "HPL"}


def load(name, url):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (TEMT rail data build)"})
        with urllib.request.urlopen(request, timeout=300) as response, open(path, "wb") as handle:
            handle.write(response.read())
    with open(path, encoding="utf8", errors="replace") as handle:
        return handle.read()


def great_circle(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(h))


def title(name):
    """FOIS names are upper case; keep acronyms and vowel-less abbreviations (SDG, PVT), write JN as Jn."""
    def word(match):
        w = match.group(0)
        if w in ("JN", "RD", "ST", "STN", "PT", "DR", "MR", "SMT"):
            return w.capitalize()
        if w in ACRONYMS or len(w) == 1 or not re.search(r"[AEIOUY]", w):
            return w
        return w.capitalize()
    text = re.sub(r"[A-Z][A-Z']*", word, name.upper())
    return re.sub(r"\s+", " ", re.sub(r"\s+([,)])", r"\1", re.sub(r"\(\s+", "(", text))).strip().rstrip(".")


def kind_of(name):
    """What a FOIS point is, from its name: a freight user picks a terminal, not a cabin or loco shed."""
    n = name.upper()
    if re.search(r"\b(CABIN|BLOCK HUT|BLOCK STATION|LOCO|DIESEL SHED|ELECTRIC SHED|EMU SHED|CARRIAGE|POWER CAR|IB|INTERMEDIATE BLOCK)\b", n) or (re.search(r"\bYARD\b", n) and "TERMINAL" not in n):
        return "exclude"
    if re.search(r"\b(ICD|INLAND CONTAINER|CONTAINER|CONCOR|CFS|MMLP|LOGISTICS PARK|PFT|GATI SHAKTI|CARGO TERMINAL|GCT)\b", n):
        return "container"
    if re.search(r"\b(PORT|DOCK|DOCKS|JETTY)\b", n):
        return "port"
    if re.search(r"\b(SDG|SIDING|PVT|PRIVATE|M/S|LTD|LIMITED|PLANT|COLLIERY|THERMAL|REFINERY|WORKS|MINES?|CEMENT)\b", n):
        return "siding"
    if re.search(r"\b(GOODS|G/SHED|GDS|FREIGHT TERMINAL|TMNL)\b", n):
        return "goods"
    return "station"


def clean(name):
    return re.sub(r"\s+", " ", re.sub(r"\b(JN|JUNCTION|HALT|RD)\b\.?", " ", re.sub(r"[^A-Z0-9 ]", " ", name.upper()))).strip()


KEY = (r"(?:INLAND CONTAINER DEPOT|CONTAINER (?:RAIL )?(?:DEPOT|TERMINAL|FREIGHT STATION)|CONCOR(?: TERMINALS?)?|ICD|CFS|PFT|MMLP|SATELLITE (?:GOODS|GDS)"
       r"|GOODS SHED|GOODS|GDS|G/SHED|SDG|SIDING|PVT|PRIVATE|YARD|TERMINAL|TMNL|DEPOT|PLANT|M/S\.?|LTD\.?|LIMITED)")
SERVING_PATTERNS = [r"SERVED BY (?P<x>[A-Z .]+)", r"\bSRV[DG]?\.? (?:BY )?(?P<x>[A-Z .]+)", r"\bAT (?P<x>[A-Z .]+)", r",\s*(?P<x>[A-Z .]+)$",
                    rf"^(?P<x>[A-Z .]+?) {KEY}", rf"{KEY}\s*,?\s+(?P<x>[A-Z .]+)$"]


class ServingStation:
    """Reads the station that serves a siding or depot from its FOIS name, matching names of placed stations."""

    def __init__(self, located, names_of, zone_of, trains_of):
        self.located, self.zone_of, self.trains_of = located, zone_of, trains_of
        self.names = collections.defaultdict(set)
        for code in located:
            for name in names_of(code):
                self.names[clean(name)].add(code)
        self.squashed = collections.defaultdict(set)
        for key, codes in self.names.items():
            self.squashed[key.replace(" ", "")] |= codes

    def pick(self, codes, zone):
        codes = set(codes)
        if len(codes) > 1:
            codes = {code for code in codes if self.zone_of(code) == zone} or codes
        if len(codes) > 1:
            busiest = max(sorted(codes), key=self.trains_of)
            codes = {busiest} if self.trains_of(busiest) > 0 and sum(self.trains_of(code) > 0 for code in codes) == 1 else codes
        return next(iter(codes)) if len(codes) == 1 else None

    @staticmethod
    def close(a, b):
        """One insertion, deletion or substitution apart (CHINCHWAD/CHINCHVAD), for names of six letters or more."""
        if abs(len(a) - len(b)) > 1 or min(len(a), len(b)) < 6:
            return False
        i = 0
        while i < min(len(a), len(b)) and a[i] == b[i]:
            i += 1
        return a[i + 1:] == b[i + 1:] or a[i + 1:] == b[i:] or a[i:] == b[i + 1:]

    def lookup(self, text, zone, code_ok):
        if code_ok and re.fullmatch(r"[A-Z]{2,5}", text) and text in self.located:
            return text
        words = clean(text).split()
        phrases = [" ".join(words)] + [" ".join(words[i:]) for i in range(1, len(words))] + [" ".join(words[:i]) for i in range(len(words) - 1, 0, -1)]
        for phrase in phrases:
            if len(phrase) < 4:
                continue
            hit = self.pick(self.names.get(phrase, ()), zone) or self.pick(self.squashed.get(phrase.replace(" ", ""), ()), zone)
            if hit:
                return hit
        flat = "".join(words)
        near = [key for key in self.squashed if self.close(key, flat)]
        return self.pick(self.squashed[near[0]], zone) if len(near) == 1 else None

    def __call__(self, name, zone):
        for pattern in SERVING_PATTERNS:
            for match in re.finditer(pattern, name.upper()):
                hit = self.lookup(match.group("x").strip(), zone, code_ok=pattern.startswith(("SERVED", r"\bSRV")))
                if hit:
                    return hit
        return None


def main():
    # FOIS station master: "NAME- CODE (ZONE)".
    master_js = load("fois-asttn.js", FOIS_MASTER)
    fois = {}
    for item in re.findall(r'"((?:[^"\\]|\\.)*)"', master_js[master_js.index("["):]):
        match = re.match(r"^(.*)- ([A-Z0-9]+) \(([A-Z]+)\)$", item.strip())
        if match:
            fois[match.group(2)] = (match.group(1).strip(), match.group(3))
    print(f"FOIS station master: {len(fois)} codes")

    coords, dm_name = {}, {}
    for feature in json.loads(load("stations.json", DATAMEET + "stations.json"))["features"]:
        props, geometry = feature["properties"], feature.get("geometry")
        code = CODE_CHANGES.get(props["code"], props["code"])
        dm_name.setdefault(code, props["name"].strip())
        if geometry and geometry.get("coordinates"):
            lon, lat = geometry["coordinates"][:2]
            if 6 <= lat <= 37.5 and 68 <= lon <= 98:
                coords.setdefault(code, (lat, lon))

    # Coordinates FOIS itself gives, for points the 2016 dataset does not have (scripts/fetch-fois-stations.mjs).
    fois_located = set()
    if os.path.exists(FOIS_POINTS):
        with open(FOIS_POINTS, encoding="utf8") as handle:
            for code, point in json.load(handle)["points"].items():
                if code in fois and code not in coords:
                    coords[code] = (point[1], point[2])
                    fois_located.add(code)
    print(f"Located from FOIS coordinates: {len(fois_located)}")

    trains = collections.defaultdict(list)
    for row in json.loads(load("schedules.json", DATAMEET + "schedules.json")):
        trains[row["train_number"]].append(row)
    edges, served = {}, collections.Counter()
    for rows in trains.values():
        rows.sort(key=lambda row: row["id"])
        stops = [CODE_CHANGES.get(row["station_code"], row["station_code"]) for row in rows]
        stops = [code for code in stops if code in coords]
        stops = [code for i, code in enumerate(stops) if i == 0 or code != stops[i - 1]]
        for code in sorted(set(stops)):
            served[code] += 1
        for a, b in zip(stops, stops[1:]):
            hop = great_circle(coords[a], coords[b])
            if hop > MAX_HOP_KM:
                continue
            factor = FACTORS[0] if hop <= SHORT_HOP else FACTORS[1] if hop <= LONG_HOP else FACTORS[2]
            key = tuple(sorted((a, b)))
            edges[key] = min(edges.get(key, math.inf), hop * factor)

    # Stations no passenger train stops at (freight-only stations, goods sheds with their own location) join the
    # network through the nearest served stations.
    served_codes = sorted(served)  # sorted, so ties break the same way on every run
    connected = 0
    for code, (name, _) in fois.items():
        if code in served or code not in coords or kind_of(name) == "exclude":
            continue
        # A point located only by FOIS joins its nearest served station alone: as a dead end it cannot bridge two lines
        # into a shortcut that no track follows.
        reach = FOIS_CONNECT_KM if code in fois_located else CONNECT_KM
        near = sorted(((great_circle(coords[code], coords[other]), other) for other in served_codes if abs(coords[other][0] - coords[code][0]) < reach / 75), key=lambda item: item[0])[:1 if code in fois_located else 2]
        near = [item for item in near if item[0] <= reach]
        for km, other in near:
            edges[tuple(sorted((code, other)))] = km * FACTORS[1]
        connected += bool(near)

    # FOIS points without coordinates of their own sit at the station that serves them.
    endpoints = {code for key in edges for code in key}
    located = {code for code in coords if code in served or code in endpoints}
    serving = ServingStation(located, lambda code: [n for n in (fois.get(code, ("", ""))[0], dm_name.get(code, "")) if n], lambda code: fois.get(code, ("", ""))[1], lambda code: served.get(code, 0))
    placed = {}
    for code, (name, zone) in fois.items():
        if code in located or kind_of(name) in ("exclude", "station"):
            continue
        host = serving(name, zone)
        if host:
            placed[code] = host
            coords[code] = coords[host]
            edges[tuple(sorted((code, host)))] = 0.0

    # The 2016 dataset mixes state names, so every station takes the state code of the nearest city in TEMT's city index.
    with open(os.path.join(OUT, "cities.json"), encoding="utf8") as handle:
        cities = [(row["la"], row["lo"], row["s"]) for row in json.load(handle)]
    def state_of(point):
        return min(cities, key=lambda city: (city[0] - point[0]) ** 2 + ((city[1] - point[1]) * math.cos(math.radians(point[0]))) ** 2)[2]

    endpoints = {code for key in edges for code in key}
    codes = sorted(code for code in coords if code in served or code in placed or code in endpoints)
    index = {code: i for i, code in enumerate(codes)}
    old_codes = collections.defaultdict(list)
    for old, new in CODE_CHANGES.items():
        old_codes[new].append(old)
    rows, kinds = [], collections.Counter()
    for code in codes:
        fois_name, zone = fois.get(code, ("", ""))
        name = title(fois_name) if fois_name else title(dm_name.get(code, code))
        kind = kind_of(fois_name) if fois_name else "station"
        kind = "station" if kind == "exclude" else kind
        kinds[kind] += 1
        aliases = [*old_codes.get(code, []), *SEARCH_NAMES.get(code, [])]
        if dm_name.get(code) and clean(dm_name[code]) != clean(fois_name or ""):
            aliases.append(title(dm_name[code]))
        if re.search(r"INLAND CONTAINER DEPOT", fois_name):
            aliases.append(title(re.sub(r"INLAND CONTAINER DEPOT(?: AT)?,?", "ICD", fois_name)))
        seen = {name.lower()}
        aliases = [alias for alias in aliases if not (alias.lower() in seen or seen.add(alias.lower()))]
        row = [code, name, state_of(coords[code]), round(coords[code][0], 5), round(coords[code][1], 5), served.get(code, 0), aliases, "" if kind == "station" else kind, zone, placed.get(code, "")]
        while row and row[-1] in ("", []):
            row.pop()
        rows.append(row)
    flat = []
    for (a, b), km in sorted(edges.items()):
        if a in index and b in index:
            flat += [index[a], index[b], round(km * 10)]

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "stations.json"), "w", encoding="utf8") as handle:
        json.dump(rows, handle, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "rail-graph.json"), "w", encoding="utf8") as handle:
        json.dump({"source": "FOIS station master (Indian Railways / CRIS) and datameet railways (CC0, 2016 timetable)", "unit": "0.1 km", "edges": flat}, handle, separators=(",", ":"))

    adjacency = collections.defaultdict(list)
    for (a, b), km in edges.items():
        adjacency[a].append((b, km))
        adjacency[b].append((a, km))

    def shortest(start, goal):
        best, queue = {start: 0.0}, [(0.0, start)]
        while queue:
            distance, node = heapq.heappop(queue)
            if node == goal:
                return distance
            if distance > best[node]:
                continue
            for other, km in adjacency[node]:
                if distance + km < best.get(other, math.inf):
                    best[other] = distance + km
                    heapq.heappush(queue, (distance + km, other))
        return None

    print(f"{len(rows)} stations ({', '.join(f'{count} {kind}' for kind, count in kinds.most_common())}); {connected} freight-only stations joined to the network; {len(placed)} FOIS points placed at their serving station; {len(flat) // 3} track segments")
    missing = [code for code, (name, _) in fois.items() if code not in index and kind_of(name) != "exclude"]
    print(f"FOIS points still without a location: {len(missing)} (mostly stations opened after 2016)")
    for label, checks in (("Published route distances", CHECKS), ("FOIS freight calculator", FOIS_CHECKS)):
        errors = []
        for a, b, published in checks:
            km = shortest(a, b)
            if km is None:
                print(f"  {a}-{b}: no route")
                continue
            errors.append((km / published - 1) * 100)
            print(f"  {a}-{b}: {km:,.0f} km ({label.split()[0].lower()} {published:,}, {errors[-1]:+.1f}%)")
        print(f"{label}: mean error {sum(errors) / len(errors):+.1f}%, mean absolute {sum(map(abs, errors)) / len(errors):.1f}%, worst {max(map(abs, errors)):.1f}%")


if __name__ == "__main__":
    main()
