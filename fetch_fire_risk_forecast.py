from __future__ import annotations

import argparse
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent
JS_DIR = ROOT / "js"
OUT_JS = JS_DIR / "fire_risk_forecast_data.js"

API_BASE = "https://apis.data.go.kr/1400377/forestPointV2/forestPointListSigunguSearchV2"
API_KEY_PLACEHOLDER_TEXT = "PUT_YOUR_DECODING_SERVICE_KEY_HERE"
API_KEY_PLACEHOLDER = API_KEY_PLACEHOLDER_TEXT

HWASEONG = {
    "name": "화성시",
    "sido_code": "41",
    "sigungu_code": "41590",
    "bounds": {
        "south": 37.13962885,
        "west": 126.79421280,
        "north": 37.23682115,
        "east": 127.00776720,
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch one day of Hwaseong forest fire risk forecast data."
    )
    parser.add_argument(
        "--service-key",
        default=os.environ.get("FOREST_FIRE_API_KEY", API_KEY_PLACEHOLDER),
        help="Data.go.kr decoding service key. Defaults to FOREST_FIRE_API_KEY.",
    )
    parser.add_argument("--date", help="Target forecast date as YYYYMMDD. Defaults to today in Korea.")
    parser.add_argument("--output", type=Path, default=OUT_JS)
    parser.add_argument("--num-rows", type=int, default=100)
    return parser.parse_args()


def api_get(params: dict[str, object]) -> dict:
    query = urllib.parse.urlencode(params)
    with urllib.request.urlopen(f"{API_BASE}?{query}", timeout=30) as response:
        text = response.read().decode("utf-8")
    return json.loads(text)


def as_list(value: object) -> list[dict[str, object]]:
    if value is None:
        return []
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        return [value]
    return []


def extract_items(payload: dict) -> list[dict[str, object]]:
    response = payload.get("response", payload)
    body = response.get("body", response) if isinstance(response, dict) else {}
    items = body.get("items", body.get("item", [])) if isinstance(body, dict) else []
    if isinstance(items, dict):
        items = items.get("item", items.get("items", items))
    return as_list(items)


def day_key(value: object) -> str:
    text = "".join(ch for ch in str(value or "") if ch.isdigit())
    return text[:8]


def number_or_none(value: object) -> float | None:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def normalized_item(item: dict[str, object]) -> dict[str, object]:
    numeric_fields = ("area", "d1", "d2", "d3", "d4", "maxi", "meanavg", "mini", "std")
    normalized = dict(item)
    for field in numeric_fields:
        if field in normalized:
            normalized[field] = number_or_none(normalized[field])
    return normalized


def risk_label(score: float | None) -> str:
    if score is None:
        return "정보 없음"
    if score >= 86:
        return "매우 높음"
    if score >= 66:
        return "높음"
    if score >= 51:
        return "다소 높음"
    return "낮음"


def main() -> None:
    args = parse_args()
    if not args.service_key or args.service_key == API_KEY_PLACEHOLDER_TEXT:
        raise SystemExit(
            "Set FOREST_FIRE_API_KEY or pass --service-key with your data.go.kr decoding key."
        )

    target_date = args.date or datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y%m%d")
    params = {
        "ServiceKey": args.service_key,
        "pageNo": 1,
        "numOfRows": args.num_rows,
        "_type": "json",
        "upplocalcd": HWASEONG["sido_code"],
        "localAreas": HWASEONG["sigungu_code"],
        "excludeForecast": 0,
    }

    payload = api_get(params)
    items = [normalized_item(item) for item in extract_items(payload)]
    day_items = [item for item in items if day_key(item.get("analdate")) == target_date]

    if not day_items and items:
        fallback_date = day_key(items[0].get("analdate"))
        day_items = [item for item in items if day_key(item.get("analdate")) == fallback_date]
        target_date = fallback_date

    day_items.sort(key=lambda item: str(item.get("analdate", "")))
    max_score = max((item.get("maxi") for item in day_items if item.get("maxi") is not None), default=None)
    mean_scores = [item.get("meanavg") for item in day_items if item.get("meanavg") is not None]
    mean_score = round(sum(mean_scores) / len(mean_scores), 2) if mean_scores else None

    output = {
        "source": "산림청 국립산림과학원_산불위험예보정보",
        "generatedAt": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(timespec="seconds"),
        "api": {
            "endpoint": API_BASE,
            "operation": "forestPointListSigunguSearchV2",
            "params": {key: value for key, value in params.items() if key != "ServiceKey"},
        },
        "area": HWASEONG,
        "targetDate": target_date,
        "summary": {
            "records": len(day_items),
            "maxScore": max_score,
            "meanScore": mean_score,
            "riskLabel": risk_label(max_score),
        },
        "records": day_items,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "window.dreamFireRiskForecastData = "
        + json.dumps(output, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Saved {len(day_items)} records for {target_date}: {args.output}")


if __name__ == "__main__":
    main()
