from __future__ import annotations

import argparse
import math
from pathlib import Path

import folium
import geopandas as gpd
import pandas as pd
from branca.element import MacroElement, Template
from folium.plugins import MarkerCluster, MiniMap


ROOT = Path(__file__).resolve().parent
FOREST_SHP = ROOT / "수림분포" / "41590.shp"
SOIL_SHP = ROOT / "산림입지토양도" / "41590.shp"
OUTPUT_HTML = ROOT / "hwaseong_fire_patrol_map.html"
PROJECTED_CRS = "EPSG:5179"
WEB_CRS = "EPSG:4326"


class MapBoundsLimiter(MacroElement):
    def __init__(self, south: float, west: float, north: float, east: float) -> None:
        super().__init__()
        self._name = "MapBoundsLimiter"
        self.south = south
        self.west = west
        self.north = north
        self.east = east
        self._template = Template(
            """
            {% macro script(this, kwargs) %}
            const bounds = L.latLngBounds(
                [{{ this.south }}, {{ this.west }}],
                [{{ this.north }}, {{ this.east }}]
            );
            {{ this._parent.get_name() }}.setMaxBounds(bounds);
            {{ this._parent.get_name() }}.fitBounds(bounds);
            {{ this._parent.get_name() }}.options.maxBoundsViscosity = 1.0;
            {{ this._parent.get_name() }}.whenReady(function () {
                const minZoom = {{ this._parent.get_name() }}.getBoundsZoom(bounds, true);
                {{ this._parent.get_name() }}.setMinZoom(minZoom);
                if ({{ this._parent.get_name() }}.getZoom() < minZoom) {
                    {{ this._parent.get_name() }}.setZoom(minZoom);
                }
            });
            {% endmacro %}
            """
        )


def read_layer(path: Path) -> gpd.GeoDataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Missing shapefile: {path}")

    gdf = gpd.read_file(path)
    if gdf.crs is None:
        # The .prj files in this project describe Korea Unified CRS.
        gdf = gdf.set_crs(PROJECTED_CRS)
    return gdf.to_crs(PROJECTED_CRS)


def number_or_zero(value: object) -> float:
    try:
        if pd.isna(value):
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def forest_risk(row: pd.Series) -> int:
    score = 1

    forest_type = str(row.get("FRTP_CD", "")).strip()
    density = str(row.get("DNST_CD", "")).strip().upper()
    diameter = number_or_zero(row.get("DMCLS_CD"))
    area = number_or_zero(row.get("Shape_Area", row.geometry.area))

    # FRTP_CD: 1=coniferous, 2=broadleaf, 3=mixed in this dataset.
    if forest_type == "1":
        score += 4
    elif forest_type == "3":
        score += 2
    elif forest_type == "2":
        score += 1

    if density == "C":
        score += 2
    elif density == "B":
        score += 1

    if diameter >= 3:
        score += 1

    if area >= 100_000:
        score += 2
    elif area >= 50_000:
        score += 1

    return score


def terrain_risk(row: pd.Series) -> int:
    score = 0
    slope = number_or_zero(row.get("LOCTN_GRDN"))
    altitude = number_or_zero(row.get("LOCTN_ALTT"))

    if slope >= 30:
        score += 3
    elif slope >= 20:
        score += 2
    elif slope >= 10:
        score += 1

    if altitude >= 200:
        score += 1

    return score


def enrich_with_nearest_terrain(
    forest: gpd.GeoDataFrame, soil: gpd.GeoDataFrame | None
) -> gpd.GeoDataFrame:
    forest = forest.copy()
    forest["terrain_score"] = 0

    if soil is None or soil.empty:
        return forest

    terrain_columns = ["LOCTN_GRDN", "LOCTN_ALTT", "EIGHT_AGL", "geometry"]
    terrain_columns = [col for col in terrain_columns if col in soil.columns]
    if "geometry" not in terrain_columns:
        return forest

    soil_small = soil[terrain_columns].copy()
    soil_small["terrain_score"] = soil_small.apply(terrain_risk, axis=1)

    centroids = forest[["geometry"]].copy()
    centroids["geometry"] = centroids.geometry.representative_point()

    try:
        joined = gpd.sjoin_nearest(
            centroids,
            soil_small[["terrain_score", "geometry"]],
            how="left",
            max_distance=500,
        )
        forest["terrain_score"] = (
            joined["terrain_score"].fillna(0).astype(int).to_numpy()
        )
    except Exception:
        # If the local spatial-index backend is unavailable, keep the map usable.
        forest["terrain_score"] = 0

    return forest


def risk_color(score: float) -> str:
    if score >= 9:
        return "#b2182b"
    if score >= 7:
        return "#ef8a62"
    if score >= 5:
        return "#fddbc7"
    if score >= 3:
        return "#d1e5f0"
    return "#67a9cf"


def popup_html(row: pd.Series) -> str:
    fields = [
        ("위험도", row.get("risk_score")),
        ("식생", row.get("FRTP_NM", row.get("FRTP_CD", ""))),
        ("경급", row.get("DMCLS_NM", row.get("DMCLS_CD", ""))),
        ("밀도", row.get("DNST_NM", row.get("DNST_CD", ""))),
        ("지형점수", row.get("terrain_score", 0)),
        ("면적", f"{number_or_zero(row.get('Shape_Area', row.geometry.area)):,.0f}㎡"),
    ]
    rows = "".join(f"<tr><th>{k}</th><td>{v}</td></tr>" for k, v in fields)
    return f"<table>{rows}</table>"


def choose_patrol_points(gdf: gpd.GeoDataFrame, count: int) -> gpd.GeoDataFrame:
    candidates = gdf.sort_values(
        ["risk_score", "Shape_Area"], ascending=[False, False]
    ).head(count)
    points = candidates.copy()
    points["geometry"] = points.geometry.representative_point()
    return points


def nearest_neighbor_route(points: gpd.GeoDataFrame) -> list[int]:
    if points.empty:
        return []

    coords = [(geom.x, geom.y) for geom in points.geometry]
    remaining = set(range(len(coords)))
    current = 0
    route = [current]
    remaining.remove(current)

    while remaining:
        cx, cy = coords[current]
        current = min(
            remaining,
            key=lambda idx: math.hypot(coords[idx][0] - cx, coords[idx][1] - cy),
        )
        route.append(current)
        remaining.remove(current)

    return route


def build_map(
    forest: gpd.GeoDataFrame,
    patrol_points: gpd.GeoDataFrame,
    output: Path,
    max_polygons: int,
    area_labels: int,
) -> None:
    full_bounds = forest.to_crs(WEB_CRS).total_bounds
    west, south, east, north = full_bounds
    pad = 0.02

    display = forest.sort_values(
        ["risk_score", "Shape_Area"], ascending=[False, False]
    ).head(max_polygons)

    display_wgs = display.to_crs(WEB_CRS).copy()
    display_wgs["popup"] = display_wgs.apply(popup_html, axis=1)

    center_geom = display_wgs.union_all().centroid
    fmap = folium.Map(
        location=[center_geom.y, center_geom.x],
        zoom_start=11,
        tiles="OpenStreetMap",
        control_scale=True,
    )
    fmap.add_child(
        MapBoundsLimiter(
            south=south - pad,
            west=west - pad,
            north=north + pad,
            east=east + pad,
        )
    )

    folium.GeoJson(
        display_wgs,
        name="산림 위험도",
        style_function=lambda feature: {
            "fillColor": risk_color(feature["properties"]["risk_score"]),
            "color": "#111111",
            "weight": 1.2,
            "fillOpacity": 0.42,
        },
        tooltip=folium.GeoJsonTooltip(
            fields=["risk_score", "FRTP_NM", "DNST_NM"],
            aliases=["위험도", "식생", "밀도"],
            localize=True,
            sticky=False,
        ),
        popup=folium.GeoJsonPopup(fields=["popup"], labels=False),
    ).add_to(fmap)

    label_source = display.sort_values(
        ["risk_score", "Shape_Area"], ascending=[False, False]
    ).head(area_labels)
    label_points = label_source.copy()
    label_points["geometry"] = label_points.geometry.representative_point()
    label_points_wgs = label_points.to_crs(WEB_CRS).reset_index(drop=True)

    for idx, row in label_points_wgs.iterrows():
        label = f"{idx + 1}위<br>위험도 {row['risk_score']}"
        forest_name = row.get("FRTP_NM")
        if isinstance(forest_name, str) and forest_name.strip():
            label += f"<br>{forest_name.strip()}"

        folium.Marker(
            location=[row.geometry.y, row.geometry.x],
            icon=folium.DivIcon(
                html=f"""
                <div style="
                    transform: translate(-50%, -50%);
                    color: #111;
                    font-size: 17px;
                    font-weight: 800;
                    line-height: 1.18;
                    text-align: center;
                    text-shadow:
                        -2px -2px 0 #fff,
                         2px -2px 0 #fff,
                        -2px  2px 0 #fff,
                         2px  2px 0 #fff,
                         0 0 6px #fff;
                    white-space: nowrap;
                ">{label}</div>
                """
            ),
        ).add_to(fmap)

    points_wgs = patrol_points.to_crs(WEB_CRS).reset_index(drop=True)
    marker_layer = MarkerCluster(name="순찰 우선 지점").add_to(fmap)
    for idx, row in points_wgs.iterrows():
        folium.Marker(
            location=[row.geometry.y, row.geometry.x],
            popup=folium.Popup(popup_html(row), max_width=320),
            tooltip=f"{idx + 1}순위 / 위험도 {row['risk_score']}",
            icon=folium.Icon(color="red", icon="flag"),
        ).add_to(marker_layer)

    route_order = nearest_neighbor_route(patrol_points.reset_index(drop=True))
    if len(route_order) >= 2:
        route_points = points_wgs.iloc[route_order]
        line = [[geom.y, geom.x] for geom in route_points.geometry]
        folium.PolyLine(
            line,
            name="추천 순찰 노선",
            color="#1f78b4",
            weight=5,
            opacity=0.85,
            tooltip="고위험 지점 기반 추천 순찰 노선",
        ).add_to(fmap)

        for order, (_, row) in enumerate(route_points.iterrows(), start=1):
            folium.CircleMarker(
                location=[row.geometry.y, row.geometry.x],
                radius=11,
                color="#08306b",
                fill=True,
                fill_color="#deebf7",
                fill_opacity=0.95,
                tooltip=f"순찰 순서 {order}",
            ).add_to(fmap)

    legend = """
    <div style="position: fixed; bottom: 28px; left: 28px; z-index: 9999;
                background: white; padding: 12px 14px; border: 1px solid #999;
                border-radius: 6px; font-size: 13px; line-height: 1.5;">
      <b>산불 위험도</b><br>
      <span style="color:#b2182b;">■</span> 매우 높음<br>
      <span style="color:#ef8a62;">■</span> 높음<br>
      <span style="color:#fddbc7;">■</span> 보통<br>
      <span style="color:#d1e5f0;">■</span> 낮음<br>
      <span style="color:#67a9cf;">■</span> 매우 낮음<br>
      <hr style="margin:6px 0;">
      빨간 마커: 순찰 우선 지점<br>
      파란 선: 추천 순찰 노선<br>
      큰 글씨: 고위험 산림 구역
    </div>
    """
    fmap.get_root().html.add_child(folium.Element(legend))
    MiniMap(toggle_display=True).add_to(fmap)
    folium.LayerControl(collapsed=False).add_to(fmap)
    fmap.save(output)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create an OpenStreetMap-based wildfire risk and patrol map."
    )
    parser.add_argument("--output", type=Path, default=OUTPUT_HTML)
    parser.add_argument("--max-polygons", type=int, default=1500)
    parser.add_argument("--patrol-points", type=int, default=15)
    parser.add_argument("--area-labels", type=int, default=35)
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    forest = read_layer(FOREST_SHP)
    soil = read_layer(SOIL_SHP) if SOIL_SHP.exists() else None

    forest = enrich_with_nearest_terrain(forest, soil)
    forest["forest_score"] = forest.apply(forest_risk, axis=1)
    forest["risk_score"] = forest["forest_score"] + forest["terrain_score"]
    forest["risk_score"] = forest["risk_score"].astype(int)

    patrol_points = choose_patrol_points(forest, args.patrol_points)
    build_map(forest, patrol_points, args.output, args.max_polygons, args.area_labels)

    print(f"Created: {args.output}")
    print(f"Displayed forest polygons: {min(args.max_polygons, len(forest)):,}")
    print(f"Patrol priority points: {len(patrol_points):,}")
    print(f"Area labels: {args.area_labels:,}")


if __name__ == "__main__":
    main()
