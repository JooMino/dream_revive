from __future__ import annotations

import argparse
import heapq
import json
import math
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pyproj import Transformer


ROOT = Path(__file__).resolve().parent
JS_DIR = ROOT / "js"
OUTPUT_DIR = ROOT / "outputs" / "road_patrol_priority"

MOUNTAIN_SUMMARY = JS_DIR / "mountain_surrounding_summary.json"
ROAD_NODES_DATA = JS_DIR / "hwaseong_all_road_nodes_data.js"
ROAD_LINKS_DATA = JS_DIR / "hwaseong_all_road_links_data.js"
OUTPUT_JSON = OUTPUT_DIR / "road_patrol_priority.json"
OUTPUT_JS = JS_DIR / "road_patrol_priority_layer.js"
OUTPUT_HTML = ROOT / "hwaseong_fire_patrol_map.html"

TARGET_CRS = "EPSG:5179"
WEB_CRS = "EPSG:4326"


@dataclass
class Mountain:
    id: str
    name: str
    lat: float
    lon: float
    x: float
    y: float
    risk_score: float
    risk_rank: int
    radius_m: float
    coverage_radius_m: float
    area_label: str = ""
    counts: dict[str, Any] = field(default_factory=dict)
    best_link_id: str | None = None
    best_link_distance_m: float | None = None
    target_node_id: str | None = None
    target_node_distance_m: float | None = None


@dataclass
class RoadNode:
    id: str
    lat: float
    lon: float
    type_index: int
    clink: int
    x: float
    y: float
    score: float = 0.0


@dataclass
class RoadLink:
    id: str
    style: int
    min_lat: float
    min_lon: float
    max_lat: float
    max_lon: float
    coords: list[float]
    projected: list[tuple[float, float]]
    b_node: str
    e_node: str
    length_m: float
    coverage_score: float = 0.0
    priority_score: float = 0.0
    mountain_scores: dict[str, float] = field(default_factory=dict)
    mountain_distances: dict[str, float] = field(default_factory=dict)


def read_assignment_json(path: Path, global_name: str) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    prefix = f"window.{global_name}="
    if not text.startswith(prefix):
        raise ValueError(f"{path} does not start with {prefix!r}")
    return json.loads(text[len(prefix) :].rstrip(";\n\r "))


def number(value: Any, fallback: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(result):
        return fallback
    return result


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def expanded_bounds(bounds: dict[str, float], pad_degrees: float) -> dict[str, float]:
    return {
        "south": bounds["south"] - pad_degrees,
        "west": bounds["west"] - pad_degrees,
        "north": bounds["north"] + pad_degrees,
        "east": bounds["east"] + pad_degrees,
    }


def point_in_bounds(lat: float, lon: float, bounds: dict[str, float]) -> bool:
    return (
        bounds["south"] <= lat <= bounds["north"]
        and bounds["west"] <= lon <= bounds["east"]
    )


def link_intersects_bounds(item: list[Any], bounds: dict[str, float]) -> bool:
    min_lat = item[1]
    min_lon = item[2]
    max_lat = item[3]
    max_lon = item[4]
    return not (
        max_lat < bounds["south"]
        or min_lat > bounds["north"]
        or max_lon < bounds["west"]
        or min_lon > bounds["east"]
    )


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def line_length_m(points: list[tuple[float, float]]) -> float:
    if len(points) < 2:
        return 0.0
    return sum(distance_m(a, b) for a, b in zip(points, points[1:]))


def point_segment_distance_m(
    px: float, py: float, ax: float, ay: float, bx: float, by: float
) -> float:
    abx = bx - ax
    aby = by - ay
    apx = px - ax
    apy = py - ay
    denom = abx * abx + aby * aby
    if denom <= 0:
        return math.hypot(px - ax, py - ay)
    t = clamp((apx * abx + apy * aby) / denom, 0.0, 1.0)
    qx = ax + t * abx
    qy = ay + t * aby
    return math.hypot(px - qx, py - qy)


def point_polyline_distance_m(px: float, py: float, points: list[tuple[float, float]]) -> float:
    if not points:
        return math.inf
    if len(points) == 1:
        return math.hypot(px - points[0][0], py - points[0][1])
    best = math.inf
    for a, b in zip(points, points[1:]):
        current = point_segment_distance_m(px, py, a[0], a[1], b[0], b[1])
        if current < best:
            best = current
    return best


def road_cost_factor(style: int) -> float:
    if style == 1:  # four-plus lanes
        return 0.78
    if style == 2:  # national road
        return 0.82
    if style == 3:  # bridge
        return 0.95
    if style == 4:  # tunnel
        return 1.18
    if style == 5:  # interchange
        return 0.90
    return 1.0


def compact_coords(coords: list[float]) -> list[list[float]]:
    return [
        [round(coords[index], 7), round(coords[index + 1], 7)]
        for index in range(0, len(coords), 2)
    ]


def bbox_radius_filter(
    mountain: Mountain, link: RoadLink, radius_m: float, meters_per_lon_degree: float
) -> bool:
    lat_pad = radius_m / 111_000
    lon_pad = radius_m / meters_per_lon_degree
    return not (
        link.max_lat < mountain.lat - lat_pad
        or link.min_lat > mountain.lat + lat_pad
        or link.max_lon < mountain.lon - lon_pad
        or link.min_lon > mountain.lon + lon_pad
    )


def load_mountains(
    transformer: Transformer,
    scoring_mountain_count: int,
) -> tuple[list[Mountain], dict[str, Any]]:
    summary = json.loads(MOUNTAIN_SUMMARY.read_text(encoding="utf-8-sig"))
    raw = summary.get("summaries", [])
    mountains: list[Mountain] = []

    for item in raw:
        lat = number(item.get("lat"))
        lon = number(item.get("lon"))
        risk_score = number(item.get("riskScore"))
        risk_rank = int(number(item.get("riskRank"), 9999))
        if not lat or not lon or risk_score <= 0:
            continue
        x, y = transformer.transform(lon, lat)
        radius_m = number(item.get("radiusMeters"), 800)
        coverage_radius_m = clamp(radius_m * 0.55, 500, 1800)
        mountains.append(
            Mountain(
                id=str(item.get("id") or f"mountain-{len(mountains) + 1}"),
                name=str(item.get("name") or "무명산"),
                lat=lat,
                lon=lon,
                x=x,
                y=y,
                risk_score=risk_score,
                risk_rank=risk_rank,
                radius_m=radius_m,
                coverage_radius_m=coverage_radius_m,
                area_label=str(item.get("areaLabel") or ""),
                counts=item.get("counts") or {},
            )
        )

    mountains.sort(key=lambda mountain: (-mountain.risk_score, mountain.risk_rank, mountain.name))
    return mountains[:scoring_mountain_count], summary


def load_road_nodes(
    transformer: Transformer,
    bounds: dict[str, float],
) -> dict[str, RoadNode]:
    node_data = read_assignment_json(ROAD_NODES_DATA, "dreamHwaseongAllRoadNodesData")
    nodes: dict[str, RoadNode] = {}
    for item in node_data.get("nodes", []):
        lat, lon, type_index, clink, node_id = item
        if not point_in_bounds(lat, lon, bounds):
            continue
        x, y = transformer.transform(lon, lat)
        nodes[str(node_id)] = RoadNode(
            id=str(node_id),
            lat=float(lat),
            lon=float(lon),
            type_index=int(type_index),
            clink=int(clink),
            x=x,
            y=y,
        )
    return nodes


def load_road_links(
    transformer: Transformer,
    nodes: dict[str, RoadNode],
    bounds: dict[str, float],
) -> dict[str, RoadLink]:
    link_data = read_assignment_json(ROAD_LINKS_DATA, "dreamHwaseongAllRoadLinksData")
    links: dict[str, RoadLink] = {}

    for item in link_data.get("links", []):
        if not link_intersects_bounds(item, bounds):
            continue
        style, min_lat, min_lon, max_lat, max_lon, coords, b_node, e_node, link_id = item
        b_node = str(b_node)
        e_node = str(e_node)
        if b_node not in nodes or e_node not in nodes:
            continue
        projected = []
        for index in range(0, len(coords), 2):
            lat = float(coords[index])
            lon = float(coords[index + 1])
            projected.append(transformer.transform(lon, lat))
        length = line_length_m(projected)
        if length <= 0:
            length = distance_m((nodes[b_node].x, nodes[b_node].y), (nodes[e_node].x, nodes[e_node].y))
        if length <= 0:
            continue
        links[str(link_id)] = RoadLink(
            id=str(link_id),
            style=int(style),
            min_lat=float(min_lat),
            min_lon=float(min_lon),
            max_lat=float(max_lat),
            max_lon=float(max_lon),
            coords=[float(value) for value in coords],
            projected=projected,
            b_node=b_node,
            e_node=e_node,
            length_m=length,
        )
    return links


def score_links(
    links: dict[str, RoadLink],
    nodes: dict[str, RoadNode],
    mountains: list[Mountain],
) -> None:
    for mountain in mountains:
        meters_per_lon_degree = max(1.0, 111_000 * math.cos(math.radians(mountain.lat)))
        best_contribution = -1.0
        best_link: RoadLink | None = None
        best_distance = math.inf

        for link in links.values():
            if not bbox_radius_filter(mountain, link, mountain.coverage_radius_m, meters_per_lon_degree):
                continue
            distance = point_polyline_distance_m(mountain.x, mountain.y, link.projected)
            if distance > mountain.coverage_radius_m:
                continue

            closeness = 1.0 - (distance / mountain.coverage_radius_m)
            contribution = mountain.risk_score * closeness * closeness
            if contribution <= 0:
                continue
            link.coverage_score += contribution
            link.mountain_scores[mountain.id] = contribution
            link.mountain_distances[mountain.id] = distance
            if contribution > best_contribution:
                best_contribution = contribution
                best_link = link
                best_distance = distance

        if best_link is None:
            continue

        mountain.best_link_id = best_link.id
        mountain.best_link_distance_m = best_distance
        b_node = nodes[best_link.b_node]
        e_node = nodes[best_link.e_node]
        b_distance = distance_m((mountain.x, mountain.y), (b_node.x, b_node.y))
        e_distance = distance_m((mountain.x, mountain.y), (e_node.x, e_node.y))
        if b_distance <= e_distance:
            mountain.target_node_id = b_node.id
            mountain.target_node_distance_m = b_distance
        else:
            mountain.target_node_id = e_node.id
            mountain.target_node_distance_m = e_distance

    for link in links.values():
        if not link.coverage_score:
            continue
        unique_count = len(link.mountain_scores)
        length_weight = math.sqrt(max(link.length_m, 50.0))
        link.priority_score = (link.coverage_score * (1.0 + unique_count * 0.14)) / length_weight
        nodes[link.b_node].score += link.priority_score
        nodes[link.e_node].score += link.priority_score


def build_graph(links: dict[str, RoadLink]) -> dict[str, list[tuple[str, float, str]]]:
    graph: dict[str, list[tuple[str, float, str]]] = defaultdict(list)
    for link in links.values():
        cost = link.length_m * road_cost_factor(link.style)
        graph[link.b_node].append((link.e_node, cost, link.id))
        graph[link.e_node].append((link.b_node, cost, link.id))
    return graph


def dijkstra_to_targets(
    graph: dict[str, list[tuple[str, float, str]]],
    start: str,
    targets: set[str],
) -> dict[str, tuple[float, list[str], list[str]]]:
    if not targets:
        return {}

    queue: list[tuple[float, str]] = [(0.0, start)]
    distances: dict[str, float] = {start: 0.0}
    previous: dict[str, tuple[str, str]] = {}
    found: dict[str, tuple[float, list[str], list[str]]] = {}
    remaining = set(targets)

    while queue and remaining:
        current_distance, node_id = heapq.heappop(queue)
        if current_distance != distances.get(node_id):
            continue

        if node_id in remaining:
            link_path: list[str] = []
            node_path = [node_id]
            cursor = node_id
            while cursor in previous:
                parent, link_id = previous[cursor]
                link_path.append(link_id)
                node_path.append(parent)
                cursor = parent
            link_path.reverse()
            node_path.reverse()
            found[node_id] = (current_distance, node_path, link_path)
            remaining.remove(node_id)
            if not remaining:
                break

        for neighbor, edge_cost, link_id in graph.get(node_id, []):
            next_distance = current_distance + edge_cost
            if next_distance < distances.get(neighbor, math.inf):
                distances[neighbor] = next_distance
                previous[neighbor] = (node_id, link_id)
                heapq.heappush(queue, (next_distance, neighbor))

    return found


def mountain_coverage_from_links(
    link_ids: list[str],
    links: dict[str, RoadLink],
) -> set[str]:
    covered: set[str] = set()
    for link_id in link_ids:
        link = links.get(link_id)
        if link:
            covered.update(link.mountain_scores)
    return covered


def build_route(
    graph: dict[str, list[tuple[str, float, str]]],
    links: dict[str, RoadLink],
    mountains: list[Mountain],
    route_budget_m: float,
    max_route_targets: int,
    start_mountain_id: str | None = None,
    excluded_target_ids: set[str] | None = None,
) -> dict[str, Any]:
    targets = [mountain for mountain in mountains if mountain.target_node_id and mountain.best_link_id]
    if not targets:
        return {
            "targetSequence": [],
            "linkIds": [],
            "nodeIds": [],
            "travelDistanceM": 0,
            "selectedLinkDistanceM": 0,
            "coveredMountainIds": [],
        }

    by_id = {mountain.id: mountain for mountain in targets}
    blocked_targets = set(excluded_target_ids or ())
    start = by_id.get(start_mountain_id or "")
    if start is None:
        start = min(
            (mountain for mountain in targets if mountain.id not in blocked_targets),
            key=lambda mountain: (mountain.risk_rank, -mountain.risk_score),
            default=min(targets, key=lambda mountain: (mountain.risk_rank, -mountain.risk_score)),
        )
    current_node = start.target_node_id
    assert current_node is not None

    visited_targets = [start.id]
    route_covered_mountains: set[str] = {start.id}
    covered_mountains: set[str] = set(blocked_targets)
    covered_mountains.add(start.id)
    ordered_link_ids: list[str] = []
    ordered_node_ids: list[str] = [current_node]
    selected_link_ids: set[str] = set()
    travel_distance = 0.0

    if start.best_link_id:
        ordered_link_ids.append(start.best_link_id)
        selected_link_ids.add(start.best_link_id)
        start_covered = mountain_coverage_from_links([start.best_link_id], links)
        route_covered_mountains.update(start_covered)
        covered_mountains.update(start_covered)
        travel_distance += links[start.best_link_id].length_m

    while len(visited_targets) < max_route_targets and travel_distance < route_budget_m:
        candidate_targets = {
            mountain.target_node_id: mountain.id
            for mountain in targets
            if (
                mountain.id not in visited_targets
                and mountain.id not in blocked_targets
                and mountain.target_node_id
            )
        }
        paths = dijkstra_to_targets(graph, current_node, set(candidate_targets))
        if not paths:
            break

        best_choice: tuple[float, Mountain, float, list[str], list[str], set[str], float] | None = None

        for node_id, (path_cost, node_path, link_path) in paths.items():
            mountain = by_id[candidate_targets[node_id]]
            visit_links = list(link_path)
            if mountain.best_link_id and mountain.best_link_id not in visit_links:
                visit_links.append(mountain.best_link_id)

            newly_covered = mountain_coverage_from_links(visit_links, links) - covered_mountains
            if mountain.id not in covered_mountains:
                newly_covered.add(mountain.id)
            marginal_risk = sum(by_id[item].risk_score for item in newly_covered if item in by_id)
            extra_distance = sum(links[item].length_m for item in visit_links if item not in selected_link_ids)
            leg_distance = path_cost + (
                links[mountain.best_link_id].length_m
                if mountain.best_link_id and mountain.best_link_id not in link_path
                else 0.0
            )
            if travel_distance + leg_distance > route_budget_m:
                continue
            efficiency = marginal_risk / max(leg_distance, 400.0)
            if best_choice is None or efficiency > best_choice[0]:
                best_choice = (
                    efficiency,
                    mountain,
                    leg_distance,
                    node_path,
                    visit_links,
                    newly_covered,
                    extra_distance,
                )

        if best_choice is None:
            break

        _, mountain, leg_distance, node_path, visit_links, newly_covered, _ = best_choice
        for link_id in visit_links:
            if link_id not in selected_link_ids:
                ordered_link_ids.append(link_id)
                selected_link_ids.add(link_id)
        for node_id in node_path[1:]:
            ordered_node_ids.append(node_id)

        visited_targets.append(mountain.id)
        route_covered_mountains.update(mountain_coverage_from_links(visit_links, links))
        route_covered_mountains.add(mountain.id)
        covered_mountains.update(newly_covered)
        travel_distance += leg_distance
        current_node = mountain.target_node_id or current_node

    selected_link_distance = sum(links[link_id].length_m for link_id in selected_link_ids)
    return {
        "targetSequence": visited_targets,
        "linkIds": ordered_link_ids,
        "nodeIds": ordered_node_ids,
        "travelDistanceM": round(travel_distance),
        "selectedLinkDistanceM": round(selected_link_distance),
        "coveredMountainIds": sorted(route_covered_mountains, key=lambda item: by_id[item].risk_rank if item in by_id else 9999),
    }


def select_diverse_route_starts(
    mountains: list[Mountain],
    route_count: int,
    min_start_distance_m: float,
) -> list[Mountain]:
    candidates = [
        mountain
        for mountain in sorted(mountains, key=lambda item: (-item.risk_score, item.risk_rank, item.name))
        if mountain.target_node_id and mountain.best_link_id
    ]
    selected: list[Mountain] = []
    threshold = min_start_distance_m

    while candidates and len(selected) < route_count and threshold >= 1500:
        added = False
        for mountain in candidates:
            if mountain in selected:
                continue
            if all(
                distance_m((mountain.x, mountain.y), (other.x, other.y)) >= threshold
                for other in selected
            ):
                selected.append(mountain)
                added = True
                if len(selected) >= route_count:
                    break
        if not added:
            threshold *= 0.78

    if len(selected) < route_count:
        for mountain in candidates:
            if mountain not in selected:
                selected.append(mountain)
            if len(selected) >= route_count:
                break

    return selected[:route_count]


def build_routes(
    graph: dict[str, list[tuple[str, float, str]]],
    links: dict[str, RoadLink],
    mountains: list[Mountain],
    route_count: int,
    route_budget_m: float,
    max_route_targets: int,
    min_start_distance_m: float,
) -> list[dict[str, Any]]:
    starts = select_diverse_route_starts(mountains, route_count, min_start_distance_m)
    assigned_targets: set[str] = set()
    routes: list[dict[str, Any]] = []

    for index, start in enumerate(starts, start=1):
        route = build_route(
            graph,
            links,
            mountains,
            route_budget_m,
            max_route_targets,
            start_mountain_id=start.id,
            excluded_target_ids=assigned_targets,
        )
        route["id"] = f"road-patrol-route-{index}"
        route["name"] = f"{index}코스 {start.name} 권역"
        route["startMountainId"] = start.id
        route["startMountainName"] = start.name
        assigned_targets.update(route["coveredMountainIds"])
        routes.append(route)

    return routes


def format_mountain_for_output(mountain: Mountain) -> dict[str, Any]:
    return {
        "id": mountain.id,
        "name": mountain.name,
        "lat": round(mountain.lat, 7),
        "lon": round(mountain.lon, 7),
        "riskScore": round(mountain.risk_score, 1),
        "riskRank": mountain.risk_rank,
        "areaLabel": mountain.area_label,
        "radiusM": round(mountain.radius_m),
        "coverageRadiusM": round(mountain.coverage_radius_m),
        "counts": mountain.counts,
        "bestLinkId": mountain.best_link_id,
        "bestLinkDistanceM": round(mountain.best_link_distance_m) if mountain.best_link_distance_m is not None else None,
        "targetNodeId": mountain.target_node_id,
        "targetNodeDistanceM": round(mountain.target_node_distance_m) if mountain.target_node_distance_m is not None else None,
    }


def link_mountain_list(
    link: RoadLink,
    mountains_by_id: dict[str, Mountain],
    limit: int = 5,
) -> list[dict[str, Any]]:
    items = []
    for mountain_id, score in sorted(link.mountain_scores.items(), key=lambda item: item[1], reverse=True)[:limit]:
        mountain = mountains_by_id[mountain_id]
        items.append(
            {
                "id": mountain.id,
                "name": mountain.name,
                "riskScore": round(mountain.risk_score, 1),
                "riskRank": mountain.risk_rank,
                "contribution": round(score, 2),
                "distanceM": round(link.mountain_distances[mountain_id]),
            }
        )
    return items


def format_link_for_output(
    link: RoadLink,
    mountains_by_id: dict[str, Mountain],
    include_geometry: bool = True,
) -> dict[str, Any]:
    item: dict[str, Any] = {
        "id": link.id,
        "bNode": link.b_node,
        "eNode": link.e_node,
        "style": link.style,
        "lengthM": round(link.length_m),
        "coverageScore": round(link.coverage_score, 2),
        "priorityScore": round(link.priority_score, 2),
        "coveredMountains": link_mountain_list(link, mountains_by_id),
    }
    if include_geometry:
        item["geometry"] = compact_coords(link.coords)
    return item


def format_node_for_output(node: RoadNode) -> dict[str, Any]:
    return {
        "id": node.id,
        "lat": round(node.lat, 7),
        "lon": round(node.lon, 7),
        "typeIndex": node.type_index,
        "clink": node.clink,
        "priorityScore": round(node.score, 2),
    }


def build_output(
    mountains: list[Mountain],
    nodes: dict[str, RoadNode],
    links: dict[str, RoadLink],
    routes: list[dict[str, Any]],
    summary_meta: dict[str, Any],
    args: argparse.Namespace,
) -> dict[str, Any]:
    mountains_by_id = {mountain.id: mountain for mountain in mountains}
    scored_links = [link for link in links.values() if link.coverage_score > 0]
    scored_links.sort(key=lambda link: (-link.priority_score, -link.coverage_score, link.length_m))

    formatted_routes: list[dict[str, Any]] = []
    all_route_link_ids: set[str] = set()
    all_route_node_ids: set[str] = set()
    all_covered_mountain_ids: set[str] = set()
    colors = ["#dc2626", "#2563eb", "#16a34a", "#9333ea", "#f97316"]

    for index, route in enumerate(routes):
        route_link_ids = route["linkIds"]
        route_links = [links[link_id] for link_id in route_link_ids if link_id in links]
        route_node_ids = route["nodeIds"]
        route_nodes = [nodes[node_id] for node_id in route_node_ids if node_id in nodes]
        covered_mountains = [
            mountains_by_id[mountain_id]
            for mountain_id in route["coveredMountainIds"]
            if mountain_id in mountains_by_id
        ]
        route_risk_score = sum(mountain.risk_score for mountain in covered_mountains)
        all_route_link_ids.update(route_link_ids)
        all_route_node_ids.update(route_node_ids)
        all_covered_mountain_ids.update(route["coveredMountainIds"])
        formatted_routes.append(
            {
                "id": route.get("id", f"road-patrol-route-{index + 1}"),
                "name": route.get("name", f"{index + 1}코스"),
                "color": colors[index % len(colors)],
                "startMountainId": route.get("startMountainId"),
                "startMountainName": route.get("startMountainName"),
                "targetSequence": route["targetSequence"],
                "travelDistanceM": route["travelDistanceM"],
                "selectedLinkDistanceM": route["selectedLinkDistanceM"],
                "coveredRiskScore": round(route_risk_score, 1),
                "coveredMountains": [format_mountain_for_output(mountain) for mountain in covered_mountains],
                "nodes": [format_node_for_output(node) for node in route_nodes[:80]],
                "links": [format_link_for_output(link, mountains_by_id) for link in route_links],
            }
        )

    node_candidates = [node for node in nodes.values() if node.score > 0]
    node_candidates.sort(key=lambda node: (-node.score, node.id))

    covered_mountains_total = [
        mountains_by_id[mountain_id]
        for mountain_id in sorted(
            all_covered_mountain_ids,
            key=lambda mountain_id: mountains_by_id[mountain_id].risk_rank if mountain_id in mountains_by_id else 9999,
        )
        if mountain_id in mountains_by_id
    ]

    return {
        "meta": {
            "generatedAt": summary_meta.get("generatedAt"),
            "algorithm": "five diverse roadway patrol routes using maximum-risk-coverage greedy routing",
            "source": {
                "mountains": str(MOUNTAIN_SUMMARY.relative_to(ROOT)),
                "roadNodes": str(ROAD_NODES_DATA.relative_to(ROOT)),
                "roadLinks": str(ROAD_LINKS_DATA.relative_to(ROOT)),
            },
            "parameters": {
                "scoringMountainCount": args.scoring_mountains,
                "routeBudgetM": args.route_budget_m,
                "maxRouteTargets": args.max_route_targets,
                "routeCount": args.route_count,
                "minStartDistanceM": args.min_start_distance_m,
                "boundsPadDegrees": args.bounds_pad_degrees,
                "coverageRadius": "clamp(radiusMeters * 0.55, 500m, 1800m)",
            },
            "counts": {
                "mountainsScored": len(mountains),
                "roadNodesLoaded": len(nodes),
                "roadLinksLoaded": len(links),
                "roadLinksScored": len(scored_links),
                "routes": len(formatted_routes),
                "routeLinks": len(all_route_link_ids),
                "routeNodes": len(all_route_node_ids),
                "coveredMountains": len(covered_mountains_total),
            },
            "focusBounds": summary_meta.get("focusBounds"),
        },
        "targetMountains": [format_mountain_for_output(mountain) for mountain in mountains],
        "routes": formatted_routes,
        "coveredMountains": [format_mountain_for_output(mountain) for mountain in covered_mountains_total],
        "priorityLinks": [
            format_link_for_output(link, mountains_by_id)
            for link in scored_links[: args.priority_links]
        ],
        "priorityNodes": [
            format_node_for_output(node)
            for node in node_candidates[: args.priority_nodes]
        ],
    }


def js_layer(output: dict[str, Any]) -> str:
    data_json = json.dumps(output, ensure_ascii=False, separators=(",", ":"))
    return f"""// Auto-generated by generate_road_patrol_priority.py. Do not edit by hand.
(function () {{
  "use strict";

  const config = window.dreamFactoryPriorityConfig || {{}};
  const map = config.map || Object.keys(window)
    .filter((key) => key.startsWith("map_"))
    .map((key) => window[key])
    .find((value) => value && value.eachLayer && value.flyTo);
  const layerControl = config.layerControl || null;
  const data = {data_json};

  if (!map || !window.L) {{
    return;
  }}

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .road-patrol-panel {{
      width: 270px;
      padding: 10px 11px;
      border: 1px solid rgba(31, 41, 55, .22);
      border-radius: 7px;
      background: rgba(255,255,255,.95);
      box-shadow: 0 8px 22px rgba(24,36,42,.18);
      color: #1f2937;
      font: 12px/1.42 "Segoe UI", "Malgun Gothic", Arial, sans-serif;
    }}
    .road-patrol-panel strong {{ display: block; margin-bottom: 5px; font-size: 13px; }}
    .road-patrol-panel span {{ display: block; color: #4b5563; }}
    .road-patrol-popup {{ border-collapse: collapse; min-width: 260px; font-size: 12px; }}
    .road-patrol-popup th {{ padding: 3px 8px 3px 0; white-space: nowrap; text-align: left; color: #555; }}
    .road-patrol-popup td {{ padding: 3px 0; }}
  `;
  document.head.appendChild(styleEl);

  function escapeHtml(value) {{
    return String(value ?? "").replace(/[&<>"']/g, function (char) {{
      return {{ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }}[char];
    }});
  }}

  function formatNumber(value) {{
    return Number(value || 0).toLocaleString("ko-KR");
  }}

  function formatKm(meters) {{
    return (Number(meters || 0) / 1000).toFixed(1) + " km";
  }}

  function coveredMountainText(link) {{
    return (link.coveredMountains || [])
      .map((mountain) => `${{escapeHtml(mountain.name)}}(${{mountain.riskRank}}위, ${{formatNumber(mountain.distanceM)}}m)`)
      .join("<br>");
  }}

  function routeMountainNames(route, limit) {{
    return (route.coveredMountains || [])
      .slice(0, limit || 4)
      .map((mountain) => `${{escapeHtml(mountain.name)}}(${{mountain.riskRank}}위)`)
      .join(", ");
  }}

  function table(rows) {{
    return `<table class="road-patrol-popup">${{rows
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `<tr><th>${{escapeHtml(key)}}</th><td>${{value}}</td></tr>`)
      .join("")}}</table>`;
  }}

  const routeLayers = {{}};
  const routeLineRefs = {{}};
  const mountainLayer = L.layerGroup();

  function routeBounds(route) {{
    const bounds = L.latLngBounds([]);
    (route.links || []).forEach(function (link) {{
      (link.geometry || []).forEach(function (point) {{
        bounds.extend(point);
      }});
    }});
    return bounds;
  }}

  function setRouteStyle(routeId, active) {{
    (routeLineRefs[routeId] || []).forEach(function (line) {{
      line.setStyle({{
        weight: active ? 7 : 4,
        opacity: active ? 0.95 : 0.58
      }});
      if (active && line.bringToFront) {{
        line.bringToFront();
      }}
    }});
  }}

  function focusRoute(routeId) {{
    data.routes.forEach(function (route) {{
      setRouteStyle(route.id, route.id === routeId);
    }});
    const route = data.routes.find((item) => item.id === routeId);
    if (!route) {{
      return;
    }}
    const bounds = routeBounds(route);
    if (bounds.isValid()) {{
      map.fitBounds(bounds.pad(0.18), {{ maxZoom: 15 }});
    }}
  }}

  function fitAllRoutes() {{
    const bounds = L.latLngBounds([]);
    data.routes.forEach(function (route) {{
      const routeOnlyBounds = routeBounds(route);
      if (routeOnlyBounds.isValid()) {{
        bounds.extend(routeOnlyBounds);
      }}
      setRouteStyle(route.id, false);
    }});
    if (bounds.isValid()) {{
      map.fitBounds(bounds.pad(0.12), {{ maxZoom: 13 }});
    }}
  }}

  data.routes.forEach(function (route, routeIndex) {{
    const routeLayer = L.layerGroup();
    routeLayers[route.id] = routeLayer;
    routeLineRefs[route.id] = [];

    (route.links || []).forEach(function (link, linkIndex) {{
      const line = L.polyline(link.geometry, {{
        color: route.color || "#dc2626",
        weight: 4,
        opacity: 0.66,
        lineCap: "round",
        lineJoin: "round"
      }});
      line.bindTooltip(`${{route.name}} · ${{linkIndex + 1}}번 링크 · ${{formatKm(link.lengthM)}}`, {{ sticky: true }});
      line.bindPopup(table([
        ["노선", escapeHtml(route.name)],
        ["링크 ID", escapeHtml(link.id)],
        ["길이", formatKm(link.lengthM)],
        ["커버점수", formatNumber(link.coverageScore)],
        ["위험 산", coveredMountainText(link)]
      ]), {{ maxWidth: 420 }});
      line.on("click", function () {{
        focusRoute(route.id);
      }});
      line.addTo(routeLayer);
      routeLineRefs[route.id].push(line);
    }});

    routeLayer.addTo(map);
    if (layerControl && layerControl.addOverlay) {{
      layerControl.addOverlay(
        routeLayer,
        `<span style="display:inline-flex;align-items:center;gap:5px;"><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${{route.color}}"></i>${{escapeHtml(route.name)}} ${{formatKm(route.selectedLinkDistanceM)}}</span>`
      );
    }}
  }});

  data.coveredMountains.forEach(function (mountain, index) {{
    const marker = L.circleMarker([mountain.lat, mountain.lon], {{
      radius: 8,
      color: "#7f1d1d",
      weight: 2,
      fillColor: index < 5 ? "#ef4444" : "#fca5a5",
      fillOpacity: 0.72
    }});
    marker.bindTooltip(`${{mountain.name}} · 위험 ${{mountain.riskRank}}위`, {{ sticky: true }});
    marker.bindPopup(table([
      ["산", escapeHtml(mountain.name)],
      ["위험 순위", `${{mountain.riskRank}}위`],
      ["위험 점수", formatNumber(mountain.riskScore)],
      ["면적", escapeHtml(mountain.areaLabel)],
      ["추천 링크 거리", mountain.bestLinkDistanceM ? formatNumber(mountain.bestLinkDistanceM) + " m" : ""],
      ["추천 노드 거리", mountain.targetNodeDistanceM ? formatNumber(mountain.targetNodeDistanceM) + " m" : ""]
    ]), {{ maxWidth: 360 }});
    marker.addTo(mountainLayer);
  }});

  mountainLayer.addTo(map);

  if (layerControl && layerControl.addOverlay) {{
    layerControl.addOverlay(mountainLayer, `추천 노선 커버 산 ${{formatNumber(data.coveredMountains.length)}}개`);
  }}

  const panel = L.control({{ position: "bottomleft" }});
  panel.onAdd = function () {{
    const container = L.DomUtil.create("div", "road-patrol-panel");
    L.DomEvent.disableClickPropagation(container);
    const totalDistance = data.routes.reduce((sum, route) => sum + Number(route.selectedLinkDistanceM || 0), 0);
    const routeText = data.routes
      .map((route) => `${{escapeHtml(route.name.replace(/^\\d+코스\\s*/, ""))}} ${{formatKm(route.selectedLinkDistanceM)}}`)
      .join("<br>");
    container.innerHTML = `
      <strong>차도 순찰 추천 5개 노선</strong>
      <span>노선당 약 10km · 총 표시 연장 ${{formatKm(totalDistance)}}</span>
      <span>커버 산 ${{formatNumber(data.coveredMountains.length)}}개</span>
      <span>${{routeText}}</span>
    `;
    return container;
  }};
  panel.addTo(map);

  window.addEventListener("message", function (event) {{
    const message = event.data || {{}};
    if (message.type === "dream:focus-road-patrol-route") {{
      focusRoute(message.id);
    }}
    if (message.type === "dream:show-all-road-patrol-routes") {{
      fitAllRoutes();
    }}
  }});

  if (window.parent && window.parent !== window) {{
    window.parent.postMessage({{
      type: "dream:road-patrol-routes-ready",
      routes: data.routes.map(function (route) {{
        return {{
          id: route.id,
          name: route.name,
          color: route.color,
          selectedLinkDistanceM: route.selectedLinkDistanceM,
          travelDistanceM: route.travelDistanceM,
          coveredMountainCount: (route.coveredMountains || []).length,
          coveredMountainNames: routeMountainNames(route, 3)
        }};
      }})
    }}, "*");
  }}

  window.dreamRoadPatrolPriorityLayer = {{
    data,
    routeLayers,
    mountainLayer,
    focusRoute,
    fitAllRoutes
  }};
}})();
"""


def install_loader(html_path: Path, script_name: str = OUTPUT_JS.name) -> None:
    html = html_path.read_bytes()
    block = f"""
<!-- DREAM_ROAD_PATROL_PRIORITY_SCRIPT:start -->
<script src="js/{script_name}?v=20260623-road-patrol-priority" charset="utf-8"></script>
<!-- DREAM_ROAD_PATROL_PRIORITY_SCRIPT:end -->
""".encode("ascii")
    pattern = re.compile(
        rb"\n\s*<!-- DREAM_ROAD_PATROL_PRIORITY_SCRIPT:start -->.*?"
        rb"<!-- DREAM_ROAD_PATROL_PRIORITY_SCRIPT:end -->\s*\n",
        re.S,
    )
    if pattern.search(html):
        html = pattern.sub(b"\n" + block + b"\n", html)
    else:
        anchor = b"<!-- DREAM_ROAD_LINK_LAYER_SCRIPT:end -->"
        if anchor in html:
            html = html.replace(anchor, anchor + b"\n" + block, 1)
        else:
            html = html.replace(b"</html>", block + b"\n</html>", 1)
    html_path.write_bytes(html)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate roadway-link patrol priority recommendations from current Hwaseong risk data."
    )
    parser.add_argument("--scoring-mountains", type=int, default=40)
    parser.add_argument("--route-budget-m", type=int, default=10_500)
    parser.add_argument("--max-route-targets", type=int, default=5)
    parser.add_argument("--route-count", type=int, default=5)
    parser.add_argument("--min-start-distance-m", type=float, default=5_500)
    parser.add_argument("--priority-links", type=int, default=120)
    parser.add_argument("--priority-nodes", type=int, default=40)
    parser.add_argument("--bounds-pad-degrees", type=float, default=0.045)
    parser.add_argument("--skip-html-install", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    transformer = Transformer.from_crs(WEB_CRS, TARGET_CRS, always_xy=True)

    mountains, summary_meta = load_mountains(transformer, args.scoring_mountains)
    bounds = expanded_bounds(summary_meta["focusBounds"], args.bounds_pad_degrees)
    nodes = load_road_nodes(transformer, bounds)
    links = load_road_links(transformer, nodes, bounds)

    score_links(links, nodes, mountains)
    graph = build_graph(links)
    routes = build_routes(
        graph,
        links,
        mountains,
        args.route_count,
        args.route_budget_m,
        args.max_route_targets,
        args.min_start_distance_m,
    )
    output = build_output(mountains, nodes, links, routes, summary_meta, args)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    OUTPUT_JS.write_text(js_layer(output), encoding="utf-8")
    if not args.skip_html_install:
        install_loader(OUTPUT_HTML)

    print(f"Created: {OUTPUT_JSON}")
    print(f"Created: {OUTPUT_JS}")
    print(f"Road nodes loaded: {len(nodes):,}")
    print(f"Road links loaded: {len(links):,}")
    print(f"Scored links: {output['meta']['counts']['roadLinksScored']:,}")
    print(f"Routes: {output['meta']['counts']['routes']:,}")
    print(f"Route links: {output['meta']['counts']['routeLinks']:,}")
    print(f"Covered mountains: {output['meta']['counts']['coveredMountains']:,}")
    for route in output["routes"]:
        print(
            f"- {route['name']}: {route['selectedLinkDistanceM']:,} m, "
            f"{len(route['coveredMountains']):,} mountains, risk {route['coveredRiskScore']:,}"
        )


if __name__ == "__main__":
    main()
