from __future__ import annotations

import json
import math
import re
from collections import Counter
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import LineString, Point, shape
from shapely.ops import transform, unary_union
from shapely.prepared import prep


ROOT = Path(__file__).resolve().parents[1]
OSM_LAYER = ROOT / "js" / "osm_mountain_range_layer.js"
ALL_NODES_DATA = ROOT / "js" / "hwaseong_all_road_nodes_data.js"
ALL_LINKS_DATA = ROOT / "js" / "hwaseong_all_road_links_data.js"
NODE_LAYER = ROOT / "js" / "road_nodes_near_forest_layer.js"
LINK_LAYER = ROOT / "js" / "road_links_near_forest_layer.js"

OSM_NEAR_RADIUS_M = 80
TARGET_CRS = "EPSG:5179"

TYPE_NAMES = {
    "RWN001": "끝점",
    "RWN002": "두 점 교차점",
    "RWN003": "세 점 이상 교차점",
    "RWN004": "행정구역 경계노드",
    "RWN005": "입체노드",
    "RWN006": "속성변화점",
}


def read_assignment_json(path: Path, global_name: str) -> dict:
    text = path.read_text(encoding="utf-8")
    prefix = f"window.{global_name}="
    if not text.startswith(prefix):
        raise ValueError(f"{path} does not start with {prefix!r}")
    return json.loads(text[len(prefix) :].rstrip(";\n\r "))


def read_const_json_array(path: Path, const_name: str) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"const\s+{re.escape(const_name)}\s*=\s*(\[.*?\]);", text, re.S)
    if not match:
        raise ValueError(f"Could not find const {const_name} in {path}")
    return json.loads(match.group(1))


def find_balanced_json(text: str, assignment: str, open_char: str) -> str:
    start = text.index(assignment) + len(assignment)
    while start < len(text) and text[start].isspace():
        start += 1
    if text[start] != open_char:
        raise ValueError(f"Expected {open_char!r} after {assignment!r}")
    close_char = "}" if open_char == "{" else "]"
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
        elif char == open_char:
            depth += 1
        elif char == close_char:
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    raise ValueError(f"Unbalanced JSON after {assignment!r}")


def read_osm_range_data() -> dict:
    text = OSM_LAYER.read_text(encoding="utf-8")
    return json.loads(find_balanced_json(text, "const rangeData =", "{"))


def projected_osm_union():
    range_data = read_osm_range_data()
    transformer = Transformer.from_crs("EPSG:4326", TARGET_CRS, always_xy=True)

    def project_xy(x: float, y: float, z: float | None = None):
        return transformer.transform(x, y)

    geometries = []
    for feature in range_data.get("features", []):
        geometry = feature.get("geometry") or {}
        if geometry.get("type") not in {"Polygon", "MultiPolygon"}:
            continue
        geom = shape(geometry)
        if geom.is_empty:
            continue
        geom = transform(project_xy, geom)
        if not geom.is_valid:
            geom = geom.buffer(0)
        if not geom.is_empty:
            geometries.append(geom)

    if not geometries:
        raise ValueError("No OSM polygon geometries found")

    union = unary_union(geometries)
    return union, unary_union([geom.buffer(OSM_NEAR_RADIUS_M) for geom in geometries]), len(geometries)


def distance_meters(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def line_length_m(coords: list[float], transformer: Transformer) -> int:
    points = []
    for index in range(0, len(coords), 2):
        lat = coords[index]
        lon = coords[index + 1]
        points.append(transformer.transform(lon, lat))
    if len(points) < 2:
        return 0
    return int(round(sum(distance_meters(a, b) for a, b in zip(points, points[1:]))))


def compact_link_geometry(coords: list[float]) -> list[list[float]]:
    return [[round(coords[index], 7), round(coords[index + 1], 7)] for index in range(0, len(coords), 2)]


def load_existing_nodes() -> list[dict]:
    return [item for item in read_const_json_array(NODE_LAYER, "roadNodes") if item.get("riskRank") is not None]


def load_existing_links() -> list[dict]:
    return [
        item
        for item in read_const_json_array(LINK_LAYER, "roadLinks")
        if item.get("bRiskRank") is not None and item.get("eRiskRank") is not None
    ]


def node_sort_key(item: dict):
    risk_rank = item.get("riskRank")
    risk_key = risk_rank if isinstance(risk_rank, int) else 9999
    osm_distance = item.get("osmDistanceM")
    osm_key = osm_distance if isinstance(osm_distance, int) else 999999
    return (risk_key, item.get("distanceM", 999999), osm_key, item.get("id", ""))


def link_sort_key(item: dict):
    risk_values = [value for value in (item.get("bRiskRank"), item.get("eRiskRank")) if isinstance(value, int)]
    risk_key = min(risk_values) if risk_values else 9999
    osm_values = [value for value in (item.get("bOsmDistanceM"), item.get("eOsmDistanceM")) if isinstance(value, int)]
    osm_key = min(osm_values) if osm_values else 999999
    return (risk_key, osm_key, item.get("id", ""))


def count_values(items: list[dict], key: str) -> dict:
    return dict(Counter(str(item.get(key)) for item in items if item.get(key) not in (None, "")))


def generate_node_layer(road_nodes: list[dict], meta: dict) -> str:
    road_nodes_json = json.dumps(road_nodes, ensure_ascii=False, separators=(",", ":"))
    meta_json = json.dumps(meta, ensure_ascii=False, separators=(",", ":"))
    return f"""// Auto-generated by tools/merge_osm_adjacent_roads.py.
// Merges high-risk forest-label road nodes with road nodes within {OSM_NEAR_RADIUS_M}m of OSM mountain/forest polygons.
(function () {{
  "use strict";

  const config = window.dreamFactoryPriorityConfig || {{}};
  const map = config.map || Object.keys(window)
    .filter((key) => key.startsWith("map_"))
    .map((key) => window[key])
    .find((value) => value && value.eachLayer && value.flyTo);
  const layerControl = config.layerControl || null;
  const roadNodes = {road_nodes_json};
  const meta = {meta_json};

  if (!map || !window.L || !roadNodes.length) {{
    return;
  }}

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .road-node-panel {{
      width: 236px;
      padding: 10px 11px;
      border: 1px solid rgba(20,32,22,.2);
      border-radius: 7px;
      background: rgba(255,255,255,.94);
      box-shadow: 0 8px 24px rgba(24,36,26,.18);
      color: #1d251f;
      font: 12px/1.4 "Segoe UI", "Malgun Gothic", Arial, sans-serif;
    }}
    .road-node-panel strong {{ display: block; margin-bottom: 5px; font-size: 13px; }}
    .road-node-panel span {{ display: block; color: #627066; }}
    .road-node-popup {{ border-collapse: collapse; font-size: 12px; min-width: 230px; }}
    .road-node-popup th {{ padding: 3px 8px 3px 0; white-space: nowrap; text-align: left; color: #555; }}
    .road-node-popup td {{ padding: 3px 0; }}
  `;
  document.head.appendChild(styleEl);

  function escapeHtml(value) {{
    return String(value || "").replace(/[&<>"']/g, function (char) {{
      return {{ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }}[char];
    }});
  }}

  function colorForNode(item) {{
    if (item.type === "RWN005") return "#7b3294";
    if (item.clink >= 4) return "#d73027";
    if (item.type === "RWN003") return "#1f78b4";
    if (item.type === "RWN002") return "#33a02c";
    return "#6b7280";
  }}

  function radiusForNode(item) {{
    if (item.type === "RWN005" || item.clink >= 5) return 5;
    if (item.clink >= 4) return 4.4;
    if (item.type === "RWN003") return 3.8;
    return 3.1;
  }}

  function formatRiskDistance(item) {{
    if (item.riskRank == null || item.distanceM == null) return "";
    return `${{item.riskRank}}위 / ${{item.distanceM.toLocaleString("ko-KR")}}m`;
  }}

  function formatOsmDistance(item) {{
    if (item.osmDistanceM == null) return "";
    return `${{item.osmDistanceM.toLocaleString("ko-KR")}}m`;
  }}

  function tooltipText(item) {{
    const parts = [`${{item.typeName || item.type}}`, `연결 ${{item.clink}}`];
    if (item.riskRank != null) parts.push(`위험 ${{item.riskRank}}위`);
    if (item.osmDistanceM != null) parts.push(`OSM ${{item.osmDistanceM}}m`);
    return parts.join(" / ");
  }}

  function popupHtml(item) {{
    const rows = [
      ["노드ID", item.id],
      ["노드명", item.name],
      ["노드구분", `${{item.type}} / ${{item.typeName}}`],
      ["연결링크", `${{item.clink}}개`],
      ["가까운 위험라벨", formatRiskDistance(item)],
      ["OSM 산/숲 거리", formatOsmDistance(item)],
      ["좌표", `${{item.lat.toFixed(6)}}, ${{item.lon.toFixed(6)}}`]
    ].filter(([, value]) => value !== "" && value != null);
    return `<table class="road-node-popup">${{rows.map(([key, value]) =>
      `<tr><th>${{escapeHtml(key)}}</th><td>${{escapeHtml(value)}}</td></tr>`
    ).join("")}}</table>`;
  }}

  const renderer = L.canvas({{ padding: 0.5 }});
  const layer = L.layerGroup();
  const nodeRenderLimit = 1200;
  let renderTimer = 0;

  function addRoadNode(item) {{
    L.circleMarker([item.lat, item.lon], {{
      renderer,
      radius: radiusForNode(item),
      color: "#ffffff",
      weight: 1.2,
      fillColor: colorForNode(item),
      fillOpacity: 0.82,
      opacity: 0.95,
      bubblingMouseEvents: false
    }})
      .bindTooltip(tooltipText(item), {{ sticky: true }})
      .bindPopup(popupHtml(item), {{ maxWidth: 340 }})
      .addTo(layer);
  }}

  function renderRoadNodes() {{
    layer.clearLayers();
    if (!map.hasLayer(layer) || !map.getBounds) return;
    const bounds = map.getBounds().pad(0.08);
    let count = 0;
    for (const item of roadNodes) {{
      if (!bounds.contains([item.lat, item.lon])) continue;
      addRoadNode(item);
      count += 1;
      if (count >= nodeRenderLimit) break;
    }}
  }}

  function scheduleRoadNodeRender() {{
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(renderRoadNodes, 80);
  }}

  const panel = L.control({{ position: "bottomleft" }});
  panel.onAdd = function () {{
    const container = L.DomUtil.create("div", "road-node-panel");
    container.innerHTML = `
      <strong>차도노드-산림위험 주변</strong>
      <span>기존 위험라벨 반경 ${{meta.riskRadiusM.toLocaleString("ko-KR")}}m + OSM 산/숲 ${{meta.osmNearRadiusM.toLocaleString("ko-KR")}}m</span>
      <span>${{meta.count.toLocaleString("ko-KR")}}개 노드 표시</span>
      <span>OSM 추가 ${{meta.osmAddedCount.toLocaleString("ko-KR")}}개 / 중복 ${{meta.osmMergedExistingCount.toLocaleString("ko-KR")}}개</span>
      <span>빨강: 4개 이상 연결 / 보라: 입체노드</span>
    `;
    L.DomEvent.disableClickPropagation(container);
    return container;
  }};

  let panelAttached = false;
  function showPanel() {{
    if (!panelAttached) {{
      panel.addTo(map);
      panelAttached = true;
    }}
  }}
  function hidePanel() {{
    if (panelAttached) {{
      panel.remove();
      panelAttached = false;
    }}
  }}

  if (layerControl && layerControl.addOverlay) {{
    layerControl.addOverlay(layer, `차도노드-산림위험 주변 ${{meta.count.toLocaleString("ko-KR")}}건`);
  }}
  map.on("overlayadd", function (event) {{
    if (event.layer === layer) {{ showPanel(); scheduleRoadNodeRender(); }}
  }});
  map.on("overlayremove", function (event) {{
    if (event.layer === layer) {{ hidePanel(); layer.clearLayers(); }}
  }});

  map.on("moveend zoomend", scheduleRoadNodeRender);

  window.dreamRoadNodeLayer = {{ layer, roadNodes, meta }};
}})();
"""


def generate_link_layer(road_links: list[dict], meta: dict) -> str:
    road_links_json = json.dumps(road_links, ensure_ascii=False, separators=(",", ":"))
    meta_json = json.dumps(meta, ensure_ascii=False, separators=(",", ":"))
    return f"""// Auto-generated by tools/merge_osm_adjacent_roads.py.
// Merges existing road-node connection links with links whose endpoints are OSM-adjacent displayed nodes.
(function () {{
  "use strict";

  const config = window.dreamFactoryPriorityConfig || {{}};
  const map = config.map || Object.keys(window)
    .filter((key) => key.startsWith("map_"))
    .map((key) => window[key])
    .find((value) => value && value.eachLayer && value.flyTo);
  const layerControl = config.layerControl || null;
  const roadLinks = {road_links_json};
  const meta = {meta_json};

  if (!map || !window.L || !roadLinks.length) {{
    return;
  }}

  if (!map.getPane("roadLinkPane")) {{
    map.createPane("roadLinkPane");
    map.getPane("roadLinkPane").style.zIndex = 405;
  }}

  const facilityNames = {{
    RFI101: "일반도로",
    RFI102: "교량",
    RFI103: "고가도로",
    RFI104: "지하차도",
    RFI201: "터널",
    RFI202: "지하도로"
  }};
  const roadTypeNames = {{
    RDC001: "고속국도",
    RDC002: "도시고속국도",
    RDC003: "일반국도",
    RDC006: "시군구도",
    RDC010: "소로",
    RDC011: "기타도로",
    RDC014: "비법정도로"
  }};
  const linkTypeNames = {{
    RWL000: "일반",
    RWL001: "교차로 내",
    RWL002: "연결로",
    RWL003: "회전교차로"
  }};

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .road-link-panel {{
      width: 242px;
      padding: 10px 11px;
      border: 1px solid rgba(20,32,60,.2);
      border-radius: 7px;
      background: rgba(255,255,255,.94);
      box-shadow: 0 8px 24px rgba(24,36,60,.18);
      color: #1d2532;
      font: 12px/1.4 "Segoe UI", "Malgun Gothic", Arial, sans-serif;
    }}
    .road-link-panel strong {{ display: block; margin-bottom: 5px; font-size: 13px; }}
    .road-link-panel span {{ display: block; color: #626b78; }}
    .road-link-popup {{ border-collapse: collapse; font-size: 12px; min-width: 250px; }}
    .road-link-popup th {{ padding: 3px 8px 3px 0; white-space: nowrap; text-align: left; color: #555; }}
    .road-link-popup td {{ padding: 3px 0; }}
  `;
  document.head.appendChild(styleEl);

  function codeLabel(code, names) {{
    if (!code) return "";
    return names[code] ? `${{code}} / ${{names[code]}}` : code;
  }}

  function escapeHtml(value) {{
    return String(value || "").replace(/[&<>"']/g, function (char) {{
      return {{ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }}[char];
    }});
  }}

  function colorForLink(item) {{
    if (item.facility === "RFI202") return "#6d28d9";
    if (item.facility === "RFI201") return "#0f766e";
    if (item.roadType === "RDC001" || item.roadType === "RDC002") return "#dc2626";
    if (item.lanes >= 4) return "#ea580c";
    return "#2563eb";
  }}

  function weightForLink(item) {{
    if (item.roadType === "RDC001" || item.roadType === "RDC002") return 3.3;
    if (item.lanes >= 4) return 2.8;
    if (item.facility === "RFI201" || item.facility === "RFI202") return 2.6;
    return 2.1;
  }}

  function riskConnectionLabel(item) {{
    if (item.bRiskRank == null || item.eRiskRank == null) return "";
    return `${{item.bRiskRank}}위 - ${{item.eRiskRank}}위`;
  }}

  function osmConnectionLabel(item) {{
    const values = [item.bOsmDistanceM, item.eOsmDistanceM]
      .filter((value) => value != null)
      .map((value) => `${{value.toLocaleString("ko-KR")}}m`);
    return values.length ? values.join(" - ") : "";
  }}

  function popupHtml(item) {{
    const rows = [
      ["링크ID", item.id],
      ["시작노드", item.b],
      ["끝노드", item.e],
      ["도로명", item.roadName],
      ["도로번호", item.roadNo],
      ["도로구분", codeLabel(item.roadType, roadTypeNames)],
      ["교통시설", codeLabel(item.facility, facilityNames)],
      ["링크구분", codeLabel(item.linkType, linkTypeNames)],
      ["차로/폭", item.lanes || item.width ? `${{item.lanes || "-"}}개 / ${{item.width || "-"}}m` : ""],
      ["선형길이", `${{item.lengthM.toLocaleString("ko-KR")}}m`],
      ["연결 위험라벨", riskConnectionLabel(item)],
      ["OSM 산/숲 거리", osmConnectionLabel(item)]
    ].filter(([, value]) => value !== "" && value != null);
    return `<table class="road-link-popup">${{rows.map(([key, value]) =>
      `<tr><th>${{escapeHtml(key)}}</th><td>${{escapeHtml(value)}}</td></tr>`
    ).join("")}}</table>`;
  }}

  function tooltipText(item) {{
    const detail = codeLabel(item.facility, facilityNames);
    const osm = osmConnectionLabel(item);
    return [item.roadName || item.id, detail, osm ? `OSM ${{osm}}` : ""].filter(Boolean).join(" / ");
  }}

  const renderer = L.canvas({{ pane: "roadLinkPane", padding: 0.5 }});
  const layer = L.layerGroup();

  roadLinks.forEach((item) => {{
    L.polyline(item.geometry, {{
      renderer,
      pane: "roadLinkPane",
      color: colorForLink(item),
      weight: weightForLink(item),
      opacity: 0.72,
      lineCap: "round",
      lineJoin: "round",
      bubblingMouseEvents: false
    }})
      .bindTooltip(tooltipText(item), {{ sticky: true }})
      .bindPopup(popupHtml(item), {{ maxWidth: 360 }})
      .addTo(layer);
  }});

  const panel = L.control({{ position: "bottomleft" }});
  panel.onAdd = function () {{
    const container = L.DomUtil.create("div", "road-link-panel");
    container.innerHTML = `
      <strong>차도링크-노드 연결</strong>
      <span>표시 노드 양끝 연결 링크 ${{meta.count.toLocaleString("ko-KR")}}건</span>
      <span>OSM 산/숲 기준 추가 ${{meta.osmAddedCount.toLocaleString("ko-KR")}}건 / 중복 ${{meta.osmMergedExistingCount.toLocaleString("ko-KR")}}건</span>
      <span>빨강: 국도 / 주황: 4차로+ / 자주: 터널</span>
    `;
    L.DomEvent.disableClickPropagation(container);
    return container;
  }};

  let panelAttached = false;
  function showPanel() {{
    if (!panelAttached) {{
      panel.addTo(map);
      panelAttached = true;
    }}
  }}
  function hidePanel() {{
    if (panelAttached) {{
      panel.remove();
      panelAttached = false;
    }}
  }}

  if (layerControl && layerControl.addOverlay) {{
    layerControl.addOverlay(layer, `차도링크-노드 연결 ${{meta.count.toLocaleString("ko-KR")}}건`);
  }}
  map.on("overlayadd", function (event) {{
    if (event.layer === layer) showPanel();
  }});
  map.on("overlayremove", function (event) {{
    if (event.layer === layer) hidePanel();
  }});

  window.dreamRoadLinkLayer = {{ layer, roadLinks, meta }};
}})();
"""


def main() -> None:
    transformer = Transformer.from_crs("EPSG:4326", TARGET_CRS, always_xy=True)
    osm_union, osm_buffer, osm_polygon_count = projected_osm_union()
    prepared_buffer = prep(osm_buffer)

    all_nodes_data = read_assignment_json(ALL_NODES_DATA, "dreamHwaseongAllRoadNodesData")
    all_links_data = read_assignment_json(ALL_LINKS_DATA, "dreamHwaseongAllRoadLinksData")
    type_codes = all_nodes_data["typeCodes"]

    existing_nodes = load_existing_nodes()
    existing_node_ids = {item["id"] for item in existing_nodes}
    nodes_by_id = {item["id"]: dict(item) for item in existing_nodes}
    osm_node_ids: set[str] = set()

    for lat, lon, type_index, clink, node_id in all_nodes_data["nodes"]:
        x, y = transformer.transform(lon, lat)
        point = Point(x, y)
        if not prepared_buffer.intersects(point):
            continue
        osm_distance = int(round(osm_union.distance(point)))
        if osm_distance > OSM_NEAR_RADIUS_M:
            continue
        osm_node_ids.add(node_id)
        node_type = type_codes[type_index] if 0 <= type_index < len(type_codes) else ""
        if node_id in nodes_by_id:
            item = nodes_by_id[node_id]
            item["osmDistanceM"] = min(osm_distance, item.get("osmDistanceM", osm_distance))
            item["osmAdjacent"] = True
        else:
            nodes_by_id[node_id] = {
                "id": node_id,
                "name": "",
                "type": node_type,
                "typeName": TYPE_NAMES.get(node_type, node_type),
                "clink": clink,
                "lat": round(lat, 7),
                "lon": round(lon, 7),
                "osmDistanceM": osm_distance,
                "osmAdjacent": True,
                "osmAddedFromRange": True,
            }

    merged_nodes = sorted(nodes_by_id.values(), key=node_sort_key)
    merged_node_ids = {item["id"] for item in merged_nodes}
    node_lookup = {item["id"]: item for item in merged_nodes}

    existing_links = load_existing_links()
    existing_link_ids = {item["id"] for item in existing_links}
    links_by_id = {item["id"]: dict(item) for item in existing_links}
    osm_link_ids: set[str] = set()

    for style, _min_lat, _min_lon, _max_lat, _max_lon, coords, b_node, e_node, link_id in all_links_data["links"]:
        if b_node not in merged_node_ids or e_node not in merged_node_ids:
            continue
        if b_node not in osm_node_ids and e_node not in osm_node_ids:
            continue
        osm_link_ids.add(link_id)
        b_item = node_lookup.get(b_node, {})
        e_item = node_lookup.get(e_node, {})
        b_osm = b_item.get("osmDistanceM")
        e_osm = e_item.get("osmDistanceM")
        if link_id in links_by_id:
            item = links_by_id[link_id]
            if b_osm is not None:
                item["bOsmDistanceM"] = b_osm
            if e_osm is not None:
                item["eOsmDistanceM"] = e_osm
            item["osmAdjacent"] = True
        else:
            links_by_id[link_id] = {
                "id": link_id,
                "b": b_node,
                "e": e_node,
                "leg": "4159000000",
                "linkType": "",
                "facility": "",
                "roadNo": "",
                "roadName": "",
                "roadType": "",
                "status": "",
                "lanes": None,
                "width": None,
                "oneway": "",
                "motorOnly": "",
                "bRiskRank": b_item.get("riskRank"),
                "eRiskRank": e_item.get("riskRank"),
                "bOsmDistanceM": b_osm,
                "eOsmDistanceM": e_osm,
                "lengthM": line_length_m(coords, transformer),
                "geometry": compact_link_geometry(coords),
                "multiPart": False,
                "osmAdjacent": True,
                "osmAddedFromRange": True,
                "style": style,
            }

    merged_links = sorted(links_by_id.values(), key=link_sort_key)
    total_point_count = sum(len(item.get("geometry") or []) for item in merged_links)

    node_meta = {
        "riskRadiusM": 700,
        "osmNearRadiusM": OSM_NEAR_RADIUS_M,
        "source": "TN_RODWAY_NODE(1).shp + OSM mountain/forest polygons",
        "filter": "Existing high-risk forest-label nodes merged with Hwaseong road nodes within 80m of OSM mountain/forest polygons",
        "count": len(merged_nodes),
        "originalCount": len(existing_nodes),
        "osmNearCount": len(osm_node_ids),
        "osmAddedCount": len(osm_node_ids - existing_node_ids),
        "osmMergedExistingCount": len(osm_node_ids & existing_node_ids),
        "osmPolygonCount": osm_polygon_count,
        "typeCounts": count_values(merged_nodes, "type"),
        "clinkCounts": count_values(merged_nodes, "clink"),
    }

    link_meta = {
        "source": "TN_RODWAY_LINK(1).shp + OSM mountain/forest polygons",
        "nodeSource": "road_nodes_near_forest_layer.js",
        "filter": "Existing displayed-node links merged with links whose endpoints are displayed nodes and at least one endpoint is within 80m of OSM mountain/forest polygons",
        "count": len(merged_links),
        "originalCount": len(existing_links),
        "osmNearCount": len(osm_link_ids),
        "osmAddedCount": len(osm_link_ids - existing_link_ids),
        "osmMergedExistingCount": len(osm_link_ids & existing_link_ids),
        "osmNearRadiusM": OSM_NEAR_RADIUS_M,
        "totalPointCount": total_point_count,
        "facilityCounts": count_values(merged_links, "facility"),
        "roadTypeCounts": count_values(merged_links, "roadType"),
        "linkTypeCounts": count_values(merged_links, "linkType"),
    }

    NODE_LAYER.write_text(generate_node_layer(merged_nodes, node_meta), encoding="utf-8", newline="\n")
    LINK_LAYER.write_text(generate_link_layer(merged_links, link_meta), encoding="utf-8", newline="\n")

    print(json.dumps({"nodes": node_meta, "links": link_meta}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
