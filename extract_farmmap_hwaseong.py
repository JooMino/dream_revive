"""Extract FarmMap polygons inside the target rectangle to static files.

Run locally, then commit the generated farmmap_farmland_data.js instead of exposing
an API key in GitHub Pages.
"""
from __future__ import annotations

import csv
import json
import math
import time
import os
import urllib.parse
import urllib.request
from pathlib import Path

API_KEY = os.environ.get("FARMMAP_API_KEY", "")
DOMAIN = "https://JooMino.github.io/dream_revive/"
API_BASE = "https://agis.epis.or.kr/ASD/farmmapApi/getFarmmapDataSeachRadius.do"
API_VERSION = "v1"
RADIUS_METERS = 1000
STEP_DEGREES = 0.0090  # about 0.8-1.0 km, for 1000m radius coverage
REQUEST_DELAY_SECONDS = 0.2

# Target rectangle selected on the map. Records are kept when their geometry center is inside it.
MIN_LAT, MAX_LAT = 37.13962885, 37.23682115
MIN_LON, MAX_LON = 126.79421280, 127.00776720

OUT_DIR = Path(__file__).resolve().parent
OUT_JS = OUT_DIR / "farmmap_farmland_data.js"
OUT_GEOJSON = OUT_DIR / "farmmap_farmland_data.geojson"
OUT_CSV = OUT_DIR / "farmmap_farmland_list.csv"


def epsg5179_to_lonlat(x: float, y: float) -> tuple[float, float]:
    # Korea 2000 / Unified CS inverse TM -> lon/lat.
    a = 6378137.0
    f = 1 / 298.257222101
    e2 = 2 * f - f * f
    ep2 = e2 / (1 - e2)
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    lat0 = math.radians(38.0)
    lon0 = math.radians(127.5)
    k0 = 0.9996
    x0 = 1000000.0
    y0 = 2000000.0

    def meridian(phi: float) -> float:
        return a * (
            (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256) * phi
            - (3 * e2 / 8 + 3 * e2**2 / 32 + 45 * e2**3 / 1024) * math.sin(2 * phi)
            + (15 * e2**2 / 256 + 45 * e2**3 / 1024) * math.sin(4 * phi)
            - (35 * e2**3 / 3072) * math.sin(6 * phi)
        )

    m0 = meridian(lat0)
    m = m0 + (y - y0) / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))
    phi1 = (
        mu
        + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
        + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
        + (151 * e1**3 / 96) * math.sin(6 * mu)
        + (1097 * e1**4 / 512) * math.sin(8 * mu)
    )
    c1 = ep2 * math.cos(phi1) ** 2
    t1 = math.tan(phi1) ** 2
    n1 = a / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    r1 = a * (1 - e2) / (1 - e2 * math.sin(phi1) ** 2) ** 1.5
    d = (x - x0) / (n1 * k0)
    lat = phi1 - (n1 * math.tan(phi1) / r1) * (
        d**2 / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * ep2) * d**4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * ep2 - 3 * c1**2) * d**6 / 720
    )
    lon = lon0 + (
        d
        - (1 + 2 * t1 + c1) * d**3 / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * ep2 + 24 * t1**2) * d**5 / 120
    ) / math.cos(phi1)
    return math.degrees(lon), math.degrees(lat)


def land_kind(row: dict) -> str | None:
    values = {str(row.get(k, "")).strip() for k in ("ldcg_cd", "sb_ldcg_cd")}
    if "\ub2f5" in values:
        return "paddy"
    if "\uc804" in values:
        return "field"
    return None

def feature_center(feature: dict) -> tuple[float, float]:
    coords = []
    geom = feature.get("geometry", {})
    if geom.get("type") == "Polygon":
        coords = geom.get("coordinates", [[]])[0]
    elif geom.get("type") == "MultiPolygon":
        for poly in geom.get("coordinates", []):
            if poly and poly[0]:
                coords.extend(poly[0])
    if not coords:
        return 0.0, 0.0
    lon = sum(point[0] for point in coords) / len(coords)
    lat = sum(point[1] for point in coords) / len(coords)
    return lat, lon

def center_in_target_bbox(feature: dict) -> bool:
    lat, lon = feature_center(feature)
    return MIN_LAT <= lat <= MAX_LAT and MIN_LON <= lon <= MAX_LON


def feature_from_record(row: dict) -> dict | None:
    polygons = []
    for part in row.get("geometry") or []:
        ring = []
        for point in part.get("xy") or []:
            lon, lat = epsg5179_to_lonlat(float(point["x"]), float(point["y"]))
            ring.append([round(lon, 7), round(lat, 7)])
        if len(ring) >= 3:
            if ring[0] != ring[-1]:
                ring.append(ring[0])
            polygons.append(ring)
    if not polygons:
        return None
    geometry = {"type": "Polygon", "coordinates": [polygons[0]]}
    if len(polygons) > 1:
        geometry = {"type": "MultiPolygon", "coordinates": [[ring] for ring in polygons]}
    props = {k: v for k, v in row.items() if k != "geometry"}
    props["landuse"] = land_kind(row)
    return {"type": "Feature", "properties": props, "geometry": geometry}


def call_radius_api(lat: float, lon: float) -> list[dict]:
    params = {
        "apiKey": API_KEY,
        "domain": DOMAIN,
        "apiVersion": API_VERSION,
        "x": f"{lon:.7f}",
        "y": f"{lat:.7f}",
        "epsg": "EPSG:4326",
        "radius": str(RADIUS_METERS),
        "mapType": "farmmap",
        "columnType": "ENG",
        "callback": "callback",
    }
    url = API_BASE + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as response:
        text = response.read().decode("utf-8")
    if not text.startswith("callback("):
        raise RuntimeError(text[:500])
    data = json.loads(text[len("callback(") : -1])
    if data.get("status", {}).get("result") != "S":
        raise RuntimeError(data.get("status", {}).get("errorMsg", "API failed"))
    return data.get("output", {}).get("farmmapData", {}).get("data", [])


def grid_points():
    lat = MIN_LAT
    while lat <= MAX_LAT + 1e-9:
        lon = MIN_LON
        while lon <= MAX_LON + 1e-9:
            yield lat, lon
            lon += STEP_DEGREES
        lat += STEP_DEGREES


def main() -> None:
    if not API_KEY:
        raise SystemExit("Set FARMMAP_API_KEY environment variable first.")

    records_by_key = {}
    total_rows = 0
    points = list(grid_points())
    for i, (lat, lon) in enumerate(points, 1):
        print(f"[{i}/{len(points)}] {lat:.5f},{lon:.5f}")
        try:
            rows = call_radius_api(lat, lon)
        except Exception as exc:
            print(f"  skip: {exc}")
            continue
        total_rows += len(rows)
        for row_index, row in enumerate(rows):
            key = row.get("pnu") or row.get("sb_pnu") or row.get("id") or row.get("uid")
            if not key:
                key = json.dumps(row.get("geometry", []), sort_keys=True, ensure_ascii=False)[:240]
            if key:
                records_by_key[str(key)] = row
        time.sleep(REQUEST_DELAY_SECONDS)

    features = []
    geometry_rows = 0
    for row in records_by_key.values():
        feat = feature_from_record(row)
        if not feat:
            continue
        geometry_rows += 1
        if feat["properties"].get("landuse") in {"paddy", "field"} and center_in_target_bbox(feat):
            features.append(feat)

    collection = {"type": "FeatureCollection", "features": features}
    OUT_GEOJSON.write_text(json.dumps(collection, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    OUT_JS.write_text(
        "window.dreamFarmmapFarmlandData = "
        + json.dumps(collection, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        fieldnames = ["pnu", "landuse", "stdg_addr", "ldcg_cd", "fl_nm", "fl_ar", "updt_ymd"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for feat in features:
            p = feat["properties"]
            writer.writerow({name: p.get(name, "") for name in fieldnames})
    print(f"api rows {total_rows}, unique rows {len(records_by_key)}, geometry rows {geometry_rows}")
    print(f"saved {len(features)} features inside target rectangle")
    print(OUT_JS)
    print(OUT_GEOJSON)
    print(OUT_CSV)


if __name__ == "__main__":
    main()
