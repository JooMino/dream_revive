from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from shapely.geometry import box, mapping, shape
from shapely.prepared import prep


ROOT = Path(__file__).resolve().parent
DEFAULT_VWORLD_JSON = ROOT / "data" / "vworld_fire_risk_20260623_070129.json"
OSM_RANGE_JS = ROOT / "js" / "osm_mountain_range_layer.js"
OUT_JS = ROOT / "js" / "vworld_fire_risk_data.js"

FOCUS_BOUNDS = {
    "south": 37.13962885,
    "west": 126.79421280,
    "north": 37.23682115,
    "east": 127.00776720,
}

RISK_FIELDS = [
    "ymd",
    "value09h",
    "class09h",
    "value12h",
    "class12h",
    "value15h",
    "class15h",
    "value18h",
    "class18h",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a detailed mountain/forest VWorld fire risk layer."
    )
    parser.add_argument("--vworld-json", type=Path, default=DEFAULT_VWORLD_JSON)
    parser.add_argument("--osm-range-js", type=Path, default=OSM_RANGE_JS)
    parser.add_argument("--output", type=Path, default=OUT_JS)
    parser.add_argument(
        "--min-area",
        type=float,
        default=0.0,
        help="Minimum source OSM polygon area in degrees^2 after focus clipping.",
    )
    return parser.parse_args()


def read_vworld_feature_collection(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    response = payload.get("response", payload)
    result = response.get("result", {}) if isinstance(response, dict) else {}
    feature_collection = result.get("featureCollection", {})
    if not isinstance(feature_collection.get("features"), list):
        raise ValueError(f"No VWorld featureCollection in {path}")
    return feature_collection


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


def numeric_value(properties: dict[str, Any], key: str) -> float:
    try:
        return float(properties.get(key) or 0)
    except (TypeError, ValueError):
        return 0.0


def build_detailed_features(
    vworld_fc: dict[str, Any],
    osm_fc: dict[str, Any],
    min_area: float,
) -> list[dict[str, Any]]:
    focus = box(
        FOCUS_BOUNDS["west"],
        FOCUS_BOUNDS["south"],
        FOCUS_BOUNDS["east"],
        FOCUS_BOUNDS["north"],
    )
    prepared_focus = prep(focus)

    risk_features = []
    for feature in vworld_fc["features"]:
        geometry = shape(feature["geometry"])
        if geometry.is_empty or not geometry.is_valid:
            geometry = geometry.buffer(0)
        if geometry.is_empty:
            continue
        risk_features.append(
            {
                "geometry": geometry,
                "prepared": prep(geometry),
                "properties": feature.get("properties", {}),
            }
        )

    detailed = []
    for index, feature in enumerate(osm_fc.get("features", []), start=1):
        source_geometry = shape(feature["geometry"])
        if source_geometry.is_empty:
            continue
        if not prepared_focus.intersects(source_geometry):
            continue

        geometry = source_geometry.intersection(focus)
        if geometry.is_empty or geometry.area <= min_area:
            continue

        matches = []
        for risk in risk_features:
            if not risk["prepared"].intersects(geometry):
                continue
            overlap = geometry.intersection(risk["geometry"]).area
            if overlap > 0:
                matches.append((overlap, risk["properties"]))

        if not matches:
            continue

        matches.sort(
            key=lambda item: (
                item[0],
                numeric_value(item[1], "value12h"),
                numeric_value(item[1], "value09h"),
            ),
            reverse=True,
        )
        risk_properties = matches[0][1]
        source_properties = feature.get("properties", {})
        properties = {
            "source_id": feature.get("id") or source_properties.get("@id") or f"osm-{index}",
            "source_type": source_properties.get("natural")
            or source_properties.get("landuse")
            or "forest",
        }
        for key in RISK_FIELDS:
            properties[key] = risk_properties.get(key, "")

        detailed.append(
            {
                "type": "Feature",
                "properties": properties,
                "geometry": mapping(geometry),
            }
        )

    return detailed


def main() -> None:
    args = parse_args()
    vworld_fc = read_vworld_feature_collection(args.vworld_json)
    osm_fc = extract_js_object(args.osm_range_js, "const rangeData = ")
    detailed_features = build_detailed_features(vworld_fc, osm_fc, args.min_area)

    output = {
        "source": "VWorld LT_C_KFDRSSIGUGRADE + OSM forest/mountain polygons",
        "vworldSource": str(args.vworld_json.relative_to(ROOT)).replace("\\", "/"),
        "displayMode": "detailed_mountain_forest_mask",
        "requestedDate": "20250101",
        "requestedDateStatus": "NOT_FOUND",
        "fallbackDate": (
            detailed_features[0]["properties"].get("ymd") if detailed_features else None
        ),
        "record": {"current": len(detailed_features), "total": len(detailed_features)},
        "area": {"name": "Hwaseong focus mountain/forest area", "bounds": FOCUS_BOUNDS},
        "featureCollection": {
            "type": "FeatureCollection",
            "features": detailed_features,
        },
    }

    args.output.write_text(
        "window.dreamVworldFireRiskData = "
        + json.dumps(output, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(
        f"Saved {len(detailed_features)} detailed mountain/forest features: {args.output}"
    )


if __name__ == "__main__":
    main()
