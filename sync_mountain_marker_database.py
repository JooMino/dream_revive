from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from shapely.geometry import Point, box, mapping, shape


ROOT = Path(__file__).resolve().parent
OSM_RANGE_JS = ROOT / "js" / "osm_mountain_range_layer.js"
OUT_JS = ROOT / "js" / "mountain_marker_database.js"

# Current map focus bounds in WGS84 lon/lat.
FOCUS_BOUNDS = {
    "south": 37.13962885,
    "west": 126.79421280,
    "north": 37.23682115,
    "east": 127.00776720,
}

KNOWN_MOUNTAINS = [
    {"id": "mubongsan", "name": "무봉산", "ele": 351.8, "lat": 37.21358, "lon": 127.15244, "osm": 10252816348},
    {"id": "geondalsan", "name": "건달산", "ele": 336, "lat": 37.1909272, "lon": 126.9211196, "osm": 4641754015},
    {"id": "taehaengsan", "name": "태행산", "ele": 295, "lat": 37.2156508, "lon": 126.8966797, "osm": 5750035818},
    {"id": "sambongsan", "name": "삼봉산", "ele": 270.5, "lat": 37.2228724, "lon": 126.9143441, "osm": 10125280561},
    {"id": "seobongsan", "name": "서봉산", "ele": 250.3, "lat": 37.1587488, "lon": 126.9448438, "osm": 4641754016},
    {"id": "chilbosan", "name": "칠보산", "ele": 239, "lat": 37.2606811, "lon": 126.9322936, "osm": 7480406719},
    {"id": "taebongsan", "name": "태봉산", "ele": 223.8, "lat": 37.189311, "lon": 126.9528145, "osm": 10127283391},
    {"id": "myeongbongsan", "name": "명봉산", "ele": 170.8, "lat": 37.1485429, "lon": 126.9522139, "osm": 10127283394},
    {"id": "bonghwasan", "name": "봉화산", "ele": 168.6, "lat": 37.1859062, "lon": 126.7013657, "osm": 4659373183},
    {"id": "cheolmasan", "name": "철마산", "ele": 168.2, "lat": 37.1661111, "lon": 126.9157333, "osm": 10252867588},
    {"id": "seongtaesan", "name": "성태산", "ele": 166, "lat": 37.31099, "lon": 126.8802785, "osm": 10125280559},
    {"id": "gubongsan", "name": "구봉산", "ele": 158.1, "lat": 37.1960989, "lon": 126.7117398, "osm": 4659373185},
    {"id": "cheongmyeongsan", "name": "청명산", "ele": 157.1, "lat": 37.1755715, "lon": 126.726269, "osm": 5750034504},
    {"id": "choroksan", "name": "초록산", "ele": 150, "lat": 37.08551, "lon": 126.95616, "osm": 10252771066},
    {"id": "cheondeungsan", "name": "천등산", "ele": 146, "lat": 37.2477806, "lon": 126.7105667, "osm": 10252871983},
    {"id": "gochobong", "name": "고초봉", "ele": 143.9, "lat": 37.1966795, "lon": 126.8109948, "osm": 5750036199},
    {"id": "haewoonsan", "name": "해운산", "ele": 143, "lat": 37.1384687, "lon": 126.7086206, "osm": 5750036137},
    {"id": "gyemyeongsan", "name": "계명산", "ele": 140, "lat": 37.2769543, "lon": 126.6745694, "osm": 9102241380},
    {"id": "yeochisan", "name": "여치산", "ele": 130.7, "lat": 37.1969094, "lon": 126.729619, "osm": 4769607564},
    {"id": "haemangsan", "name": "해망산", "ele": 125.8, "lat": 37.2543583, "lon": 126.8346722, "osm": 10252872065},
    {"id": "maebongsan", "name": "매봉산", "ele": 108.6, "lat": 37.2186099, "lon": 126.7444833, "osm": 4741727534},
    {"id": "tapjaesan", "name": "탑재산", "ele": 67, "lat": 37.1765427, "lon": 126.6198479, "osm": 7768446631},
    {"id": "hambaksan", "name": "함박산", "ele": 56.6, "lat": 37.0441629, "lon": 127.0328616, "osm": 6721051092},
    {"id": "obongsan", "name": "오봉산", "ele": 68.5, "lat": 37.0275642, "lon": 126.9620077, "osm": 7149134908},
    {"id": "samjeongdaesan", "name": "삼정대산", "ele": 73.2, "lat": 37.0159586, "lon": 126.9582251, "osm": 7149134909},
]



def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Synchronize mountain name markers with OSM mountain/forest ranges."
    )
    parser.add_argument("--osm-range-js", type=Path, default=OSM_RANGE_JS)
    parser.add_argument("--output", type=Path, default=OUT_JS)
    parser.add_argument("--include-outside-focus", action="store_true")
    parser.add_argument(
        "--min-area",
        type=float,
        default=0.0,
        help="Minimum clipped polygon area in degrees^2.",
    )
    return parser.parse_args()


def extract_js_object(path: Path, marker: str) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    marker_index = text.index(marker)
    start = text.index("{", marker_index)
    depth = 0
    in_string = False
    escape = False

    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : index + 1])

    raise ValueError(f"Could not parse JS object after {marker!r}")


def marker_id(value: object) -> str:
    text = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(value or "")).strip("-").lower()
    return text or "unknown"


EARTH_RADIUS_METERS = 6378137
SIZE_THRESHOLDS = [
    ("대형", 500000),
    ("중형", 100000),
    ("소형", 30000),
    ("초소형", 0),
]



def source_label(properties: dict[str, Any]) -> str:
    if properties.get("natural") == "wood":
        return "OSM 숲 범위"
    if properties.get("landuse") == "forest":
        return "OSM 산림 범위"
    return "OSM 산/숲 범위"


def kind_label(properties: dict[str, Any]) -> str:
    if properties.get("natural") == "wood":
        return "산림/숲"
    if properties.get("landuse") == "forest":
        return "토지이용 산림"
    return str(properties.get("natural") or properties.get("landuse") or "기타")


def size_tag(area_sqm: float | None) -> str:
    area = area_sqm or 0
    for tag, minimum in SIZE_THRESHOLDS:
        if area >= minimum:
            return tag
    return "초소형"


def format_area(area_sqm: float | None) -> str:
    area = area_sqm or 0
    if area >= 1_000_000:
        return f"{area / 1_000_000:,.2f}㎢"
    return f"{round(area):,}㎡"



def ring_area_sqm(ring: list[list[float]]) -> float:
    if not isinstance(ring, (list, tuple)) or len(ring) < 3:
        return 0.0

    latitude_origin = (
        sum((point[1] if len(point) > 1 else 0) for point in ring) / len(ring)
    ) * 3.141592653589793 / 180
    cos_lat = __import__("math").cos(latitude_origin)
    points = [
        (
            EARTH_RADIUS_METERS * point[0] * 3.141592653589793 / 180 * cos_lat,
            EARTH_RADIUS_METERS * point[1] * 3.141592653589793 / 180,
        )
        for point in ring
    ]

    area = 0.0
    j = len(points) - 1
    for i, point in enumerate(points):
        prev = points[j]
        area += prev[0] * point[1] - point[0] * prev[1]
        j = i
    return abs(area) / 2


def polygon_area_sqm(coordinates: list[Any]) -> float:
    if not coordinates:
        return 0.0
    outer_area = ring_area_sqm(coordinates[0])
    inner_area = sum(ring_area_sqm(ring) for ring in coordinates[1:])
    return max(0.0, outer_area - inner_area)


def geometry_area_sqm(geometry: Any) -> float:
    geojson = mapping(geometry)
    if geojson["type"] == "Polygon":
        return polygon_area_sqm(geojson["coordinates"])
    if geojson["type"] == "MultiPolygon":
        return sum(polygon_area_sqm(polygon) for polygon in geojson["coordinates"])
    return 0.0


def build_range_items(
    feature_collection: dict[str, Any],
    include_outside_focus: bool,
    min_area: float,
) -> list[dict[str, Any]]:
    focus = box(
        FOCUS_BOUNDS["west"],
        FOCUS_BOUNDS["south"],
        FOCUS_BOUNDS["east"],
        FOCUS_BOUNDS["north"],
    )
    items = []

    for feature in feature_collection.get("features", []):
        geometry = shape(feature["geometry"])
        if geometry.is_empty:
            continue

        clipped = geometry if include_outside_focus else geometry.intersection(focus)
        if clipped.is_empty or clipped.area <= min_area:
            continue

        properties = feature.get("properties", {})
        centroid = clipped.centroid
        point = centroid if clipped.covers(centroid) else clipped.representative_point()
        area_sqm = geometry_area_sqm(clipped)
        items.append(
            {
                "feature": feature,
                "geometry": clipped,
                "properties": properties,
                "osm_id": feature.get("id") or properties.get("@id"),
                "name": properties.get("name:ko") or properties.get("name"),
                "lat": round(point.y, 7),
                "lon": round(point.x, 7),
                "area_sqm": area_sqm,
                "area_label": format_area(area_sqm),
                "size_tag": size_tag(area_sqm),
                "category": kind_label(properties),
                "source_label": source_label(properties),
                "matched_peak": None,
            }
        )

    items.sort(key=lambda item: (-item["area_sqm"], str(item["osm_id"] or "")))
    return items


def match_peaks_to_ranges(range_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unmatched = []
    for mountain in KNOWN_MOUNTAINS:
        point = Point(mountain["lon"], mountain["lat"])
        containing = [item for item in range_items if item["geometry"].covers(point)]
        if containing:
            match = min(containing, key=lambda item: item["area_sqm"])
        else:
            nearby = sorted(
                range_items,
                key=lambda item: item["geometry"].distance(point),
            )
            match = nearby[0] if nearby and nearby[0]["geometry"].distance(point) <= 0.012 else None

        if match and match["matched_peak"] is None:
            match["matched_peak"] = mountain
        else:
            unmatched.append(mountain)
    return unmatched


def range_marker(
    item: dict[str, Any],
    generated_index: int,
    timestamp: str,
) -> dict[str, Any]:
    peak = item.get("matched_peak")
    has_peak = peak is not None
    generated = not bool(item.get("name")) and not has_peak
    name = (
        peak["name"]
        if has_peak
        else item.get("name") or f"무명산 {generated_index:03d}"
    )
    marker_lat = peak["lat"] if has_peak else item["lat"]
    marker_lon = peak["lon"] if has_peak else item["lon"]

    return {
        "id": (peak["id"] if has_peak else "range-" + marker_id(item["osm_id"] or generated_index)),
        "name": name,
        "labelVisible": True,
        "sizeTag": item["size_tag"],
        "ele": peak["ele"] if has_peak else None,
        "lat": round(marker_lat, 7),
        "lon": round(marker_lon, 7),
        "representativeLat": item["lat"],
        "representativeLon": item["lon"],
        "peakLat": round(peak["lat"], 7) if has_peak else None,
        "peakLon": round(peak["lon"], 7) if has_peak else None,
        "areaSqm": round(item["area_sqm"], 2),
        "areaLabel": item["area_label"],
        "category": item["category"],
        "osmId": item["osm_id"],
        "peakOsmId": peak["osm"] if has_peak else None,
        "source": f"OpenStreetMap Overpass {timestamp}".strip(),
        "sourceType": "mountain-range",
        "sourceLabel": item["source_label"],
        "generated": generated,
        "matchedPeak": has_peak,
        "sortGroup": 0 if has_peak else (1 if item.get("name") else 2),
    }


def peak_only_marker(mountain: dict[str, Any], timestamp: str) -> dict[str, Any]:
    return {
        "id": mountain["id"],
        "name": mountain["name"],
        "labelVisible": True,
        "sizeTag": "산정상",
        "ele": mountain["ele"],
        "lat": round(mountain["lat"], 7),
        "lon": round(mountain["lon"], 7),
        "representativeLat": round(mountain["lat"], 7),
        "representativeLon": round(mountain["lon"], 7),
        "peakLat": round(mountain["lat"], 7),
        "peakLon": round(mountain["lon"], 7),
        "areaSqm": None,
        "areaLabel": "",
        "category": "산 정상",
        "osmId": None,
        "peakOsmId": mountain["osm"],
        "source": f"OpenStreetMap Overpass {timestamp}".strip(),
        "sourceType": "mountain-range",
        "sourceLabel": "OSM 산 정상",
        "generated": False,
        "matchedPeak": False,
        "sortGroup": 3,
    }


def unified_markers(
    feature_collection: dict[str, Any],
    include_outside_focus: bool,
    min_area: float,
) -> list[dict[str, Any]]:
    timestamp = str(feature_collection.get("timestamp") or "").strip()
    range_items = build_range_items(feature_collection, include_outside_focus, min_area)
    unmatched_peaks = match_peaks_to_ranges(range_items)
    generated_count = 0
    markers = []
    for item in range_items:
        if not item.get("name"):
            generated_count += 1
        markers.append(range_marker(item, generated_count, timestamp))
    markers.extend(peak_only_marker(mountain, timestamp) for mountain in unmatched_peaks)
    markers.sort(key=lambda item: (item["sortGroup"], item["name"], -(item.get("areaSqm") or 0)))
    return markers


def main() -> None:
    args = parse_args()
    range_data = extract_js_object(args.osm_range_js, "const rangeData = ")
    mountains = unified_markers(
        range_data,
        include_outside_focus=args.include_outside_focus,
        min_area=args.min_area,
    )

    output = {
        "generatedFrom": str(args.osm_range_js.relative_to(ROOT)).replace("\\", "/"),
        "focusBounds": FOCUS_BOUNDS,
        "count": len(mountains),
        "knownPeakCount": len(KNOWN_MOUNTAINS),
        "matchedPeakCount": sum(1 for item in mountains if item.get("matchedPeak")),
        "rangeMarkerCount": sum(1 for item in mountains if item.get("osmId")),
        "peakOnlyCount": sum(1 for item in mountains if item.get("category") == "산 정상"),
        "generatedNameCount": sum(1 for item in mountains if item.get("generated")),
        "mountains": mountains,
    }

    args.output.write_text(
        "window.dreamMountainMarkerDatabase = "
        + json.dumps(output, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(
        f"Saved {output['count']} markers "
        f"({output['matchedPeakCount']} matched peaks, "
        f"{output['peakOnlyCount']} peak-only, "
        f"{output['generatedNameCount']} generated names): {args.output}"
    )


if __name__ == "__main__":
    main()
