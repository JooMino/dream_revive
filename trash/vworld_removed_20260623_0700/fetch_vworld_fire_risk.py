from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"
OUT_DIR = ROOT / "data"

API_BASE = "https://api.vworld.kr/req/data"
DATASET = "LT_C_KFDRSSIGUGRADE"
DEFAULT_COLUMNS = ",".join(
    [
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
)

# Hwaseong-si bounds, WGS84 longitude/latitude.
HWASEONG_BOX = "BOX(126.79421280,37.13962885,127.00776720,37.23682115)"


def load_dotenv(path: Path = ENV_PATH) -> None:
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch forest fire risk prediction map data from VWorld."
    )
    parser.add_argument(
        "--key",
        default=None,
        help="VWorld API key. Defaults to VWORLD_API_KEY in .env or environment.",
    )
    parser.add_argument(
        "--domain",
        default=os.environ.get("VWORLD_DOMAIN"),
        help="Registered VWorld domain, needed for browser-origin keys in some cases.",
    )
    parser.add_argument(
        "--geom-filter",
        default=HWASEONG_BOX,
        help=(
            "VWorld geometry filter, e.g. POINT(126.98 37.56) or "
            "BOX(126.79,37.13,127.01,37.24). Defaults to Hwaseong-si bounds."
        ),
    )
    parser.add_argument(
        "--columns",
        default=DEFAULT_COLUMNS,
        help="Comma-separated columns to request. Use 'all' to request all attributes.",
    )
    parser.add_argument(
        "--date",
        default=None,
        help="Prediction date as YYYYMMDD. Adds attrFilter=ymd:=:YYYYMMDD.",
    )
    parser.add_argument(
        "--attr-filter",
        default=None,
        help="Raw VWorld attrFilter. Combined with --date using | when both are set.",
    )
    parser.add_argument("--size", type=int, default=100, help="Rows per page, max 1000.")
    parser.add_argument("--page", type=int, default=1, help="Page number to fetch.")
    parser.add_argument(
        "--geometry",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Include feature geometry in the response.",
    )
    parser.add_argument("--crs", default="EPSG:4326", help="Response CRS.")
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output JSON path. Defaults to data/vworld_fire_risk_YYYYMMDD_HHMMSS.json.",
    )
    return parser.parse_args()


def request_vworld(args: argparse.Namespace, api_key: str) -> dict[str, Any]:
    params: dict[str, Any] = {
        "service": "data",
        "version": "2.0",
        "request": "GetFeature",
        "data": DATASET,
        "key": api_key,
        "format": "json",
        "errorFormat": "json",
        "size": args.size,
        "page": args.page,
        "geomFilter": args.geom_filter,
        "geometry": str(args.geometry).lower(),
        "attribute": "true",
        "crs": args.crs,
    }

    if args.columns and args.columns.lower() != "all":
        params["columns"] = args.columns
    if args.domain:
        params["domain"] = args.domain

    attr_filters = []
    if args.date:
        attr_filters.append(f"ymd:=:{args.date}")
    if args.attr_filter:
        attr_filters.append(args.attr_filter)
    if attr_filters:
        params["attrFilter"] = "|".join(attr_filters)

    url = API_BASE + "?" + urllib.parse.urlencode(params, safe="(),:|")
    with urllib.request.urlopen(url, timeout=30) as response:
        body = response.read().decode("utf-8")

    payload = json.loads(body)
    response = payload.get("response", payload) if isinstance(payload, dict) else {}
    if isinstance(response, dict) and response.get("status") == "ERROR":
        error = response.get("error", {})
        code = error.get("code", "UNKNOWN_ERROR")
        text = error.get("text", payload)
        raise RuntimeError(f"VWorld API error {code}: {text}")
    return payload


def output_path(path: Path | None) -> Path:
    if path is not None:
        return path
    stamp = datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y%m%d_%H%M%S")
    return OUT_DIR / f"vworld_fire_risk_{stamp}.json"


def main() -> None:
    load_dotenv()
    args = parse_args()
    api_key = args.key or os.environ.get("VWORLD_API_KEY")
    if not api_key:
        raise SystemExit("Set VWORLD_API_KEY in .env or pass --key YOUR_VWORLD_KEY.")

    payload = request_vworld(args, api_key)
    path = output_path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    response = payload.get("response", payload) if isinstance(payload, dict) else {}
    record = response.get("record", {}) if isinstance(response, dict) else {}
    status = response.get("status", "UNKNOWN") if isinstance(response, dict) else "UNKNOWN"
    total = record.get("total", 0) if isinstance(record, dict) else 0
    current = record.get("current", 0) if isinstance(record, dict) else 0

    print(f"status={status} current={current} total={total}")
    print(f"saved={path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
