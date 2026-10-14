"""
Builds TEMT's Indian Railways station index and rail network from the datameet railways dataset (CC0,
https://github.com/datameet/railways): stations with codes and coordinates, and an undirected graph whose
edges join consecutive stops of every scheduled train.

    python3 scripts/build-rail-data.py [cache_dir]

Writes apps/web/public/data/geo/stations.json and rail-graph.json. Edge lengths are great-circle distances
between consecutive stops with a curvature allowance that grows with the hop length (short hops follow the
track closely; long express hops cut corners). Shortest paths on this graph match published Indian Railways
route distances to within about 3% on average (16 trunk routes checked; see the test list below).
"""
import collections
import heapq
import json
import math
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "apps", "web", "public", "data", "geo")
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".cache", "railways")
BASE = "https://raw.githubusercontent.com/datameet/railways/master/"

# Curvature allowance by hop length (km): track distance ≈ great-circle × factor.
SHORT_HOP, LONG_HOP = 15, 40
FACTORS = (1.05, 1.10, 1.20)
MAX_HOP_KM = 400  # longer hops between consecutive stops are data errors

# Current official names and codes for major stations renamed since the 2016 timetable: code -> (name, other codes).
RENAMES = {
    "CSTM": ("Mumbai CSMT (Chhatrapati Shivaji Maharaj Terminus)", ["CSMT"]),
    "BCT": ("Mumbai Central", ["MMCT"]),
    "LTT": ("Mumbai Lokmanya Tilak Terminus", []),
    "SBC": ("KSR Bengaluru City Jn", ["KSR"]),
    "MAS": ("Chennai Central (Puratchi Thalaivar Dr. M.G. Ramachandran)", []),
    "ALD": ("Prayagraj Jn", ["PRYJ"]),
    "MGS": ("Pt. Deen Dayal Upadhyaya Jn", ["DDU"]),
    "JHS": ("Virangana Lakshmibai Jhansi Jn", ["VGLJ"]),
    "HBJ": ("Rani Kamlapati (Bhopal)", ["RKMP"]),
    "FZD": ("Ayodhya Cantt", ["AYC"]),
}

# Published route distances (km) used to check the network.
CHECKS = [("HWH", "NDLS", 1447), ("MAS", "NDLS", 2182), ("SBC", "NZM", 2365), ("NDLS", "JAT", 577), ("CSTM", "HWH", 1968),
          ("SBC", "MAS", 362), ("PUNE", "CSTM", 192), ("LKO", "NDLS", 512), ("SC", "MAS", 794), ("ERS", "TVC", 220),
          ("BCT", "NDLS", 1384), ("ADI", "BCT", 491), ("GHY", "NDLS", 1909), ("BBS", "HWH", 441), ("PNBE", "NDLS", 1001), ("JP", "NDLS", 308)]


def load(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        urllib.request.urlretrieve(BASE + name, path)
    with open(path, encoding="utf8") as handle:
        return json.load(handle)


def great_circle(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(h))


def title(name):
    return name.title() if name.isupper() else name


def main():
    stations = {}
    for feature in load("stations.json")["features"]:
        props, geometry = feature["properties"], feature.get("geometry")
        if not geometry or not geometry.get("coordinates"):
            continue
        lon, lat = geometry["coordinates"][:2]
        if 6 <= lat <= 37.5 and 68 <= lon <= 98:
            stations[props["code"]] = {"name": title(props["name"].strip()), "state": (props.get("state") or "").strip(), "at": (lat, lon)}

    trains = collections.defaultdict(list)
    for row in load("schedules.json"):
        trains[row["train_number"]].append(row)

    edges, served = {}, collections.Counter()
    for rows in trains.values():
        rows.sort(key=lambda row: row["id"])
        stops = [row["station_code"] for row in rows if row["station_code"] in stations]
        stops = [code for i, code in enumerate(stops) if i == 0 or code != stops[i - 1]]
        for code in set(stops):
            served[code] += 1
        for a, b in zip(stops, stops[1:]):
            hop = great_circle(stations[a]["at"], stations[b]["at"])
            if hop > MAX_HOP_KM:
                continue
            factor = FACTORS[0] if hop <= SHORT_HOP else FACTORS[1] if hop <= LONG_HOP else FACTORS[2]
            key = tuple(sorted((a, b)))
            edges[key] = min(edges.get(key, math.inf), hop * factor)

    # The 2016 dataset mixes full, abbreviated and pre-2014 state names, so every station takes the state code of
    # the nearest city in TEMT's city index, as cities and PIN codes do.
    with open(os.path.join(OUT, "cities.json"), encoding="utf8") as handle:
        cities = [(row["la"], row["lo"], row["s"]) for row in json.load(handle)]
    for code in served:
        station = stations[code]
        station["state"] = min(cities, key=lambda city: (city[0] - station["at"][0]) ** 2 + ((city[1] - station["at"][1]) * math.cos(math.radians(station["at"][0]))) ** 2)[2]

    codes = sorted(served)
    index = {code: i for i, code in enumerate(codes)}
    rows = []
    for code in codes:
        name, aliases = RENAMES.get(code, (stations[code]["name"], []))
        if code in RENAMES:
            aliases = [*aliases, stations[code]["name"]]  # the earlier name stays searchable
        rows.append([code, name, stations[code]["state"], round(stations[code]["at"][0], 5), round(stations[code]["at"][1], 5), served[code], *([aliases] if aliases else [])])
    flat = []
    for (a, b), km in sorted(edges.items()):
        flat += [index[a], index[b], round(km * 10)]

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "stations.json"), "w", encoding="utf8") as handle:
        json.dump(rows, handle, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "rail-graph.json"), "w", encoding="utf8") as handle:
        json.dump({"source": "datameet/railways (CC0), timetable of 2016", "unit": "0.1 km", "edges": flat}, handle, separators=(",", ":"))

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

    errors = []
    for a, b, published in CHECKS:
        km = shortest(a, b)
        errors.append((km / published - 1) * 100)
        print(f"{a}-{b}: {km:,.0f} km (published {published:,}, {errors[-1]:+.1f}%)")
    print(f"{len(rows)} stations, {len(edges)} track segments; mean error {sum(errors) / len(errors):+.1f}%, mean absolute {sum(map(abs, errors)) / len(errors):.1f}%")


if __name__ == "__main__":
    main()
