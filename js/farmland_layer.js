// FarmMap farmland layer loaded from the official FarmMap Data API.
(function () {
  "use strict";

  const config = window.dreamFactoryPriorityConfig || {};
  const apiConfig = window.dreamFarmmapApiConfig || {};
  const map =
    config.map ||
    Object.keys(window)
      .filter((key) => key.startsWith("map_"))
      .map((key) => window[key])
      .find((value) => value && value.eachLayer && value.flyTo);
  const layerControl = config.layerControl || null;

  if (!map || !window.L) {
    return;
  }

  const API_BASE = apiConfig.endpointBase || "https://agis.epis.or.kr/ASD/";
  const API_PATH = "farmmapApi/getFarmmapDataSeachRadius.do";
  const MAX_RADIUS = 1000;
  const radiusMeters = Math.max(1, Math.min(Number(apiConfig.radiusMeters || 1000), MAX_RADIUS));
  const minZoom = Number(apiConfig.minZoom || 11);
  const displayMinZoom = Number(apiConfig.displayMinZoom || 14);
  const markerRenderLimit = Number(apiConfig.markerRenderLimit || 600);
  const polygonRenderLimit = Number(apiConfig.polygonRenderLimit ||600);
  const debounceMs = Number(apiConfig.reloadDebounceMs || 700);
  const markerLayer = L.layerGroup();
  const layer = L.geoJSON(null, {
    style: styleFeature,
    onEachFeature(feature, leafLayer) {
      const props = feature.properties || {};
      const label = landLabel(props);
      leafLayer.bindTooltip(label, { sticky: true });
      leafLayer.bindPopup(popupHtml(props), { maxWidth: 320 });
    },
  });

  const status = L.control({ position: "bottomleft" });
  status.onAdd = function () {
    const el = L.DomUtil.create("div", "farmmap-api-status");
    el.textContent = "?? API ??";
    return el;
  };

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .farmmap-api-status {
      padding: 7px 9px;
      border: 1px solid rgba(31, 41, 55, .18);
      border-radius: 6px;
      color: #172317;
      background: rgba(255, 255, 255, .92);
      box-shadow: 0 2px 12px rgba(0,0,0,.16);
      font: 800 12px/1.25 "Segoe UI", "Malgun Gothic", Arial, sans-serif;
    }
    .farmmap-popup table { border-collapse: collapse; font: 12px/1.35 "Segoe UI", "Malgun Gothic", Arial, sans-serif; }
    .farmmap-popup th { padding: 3px 8px 3px 0; color: #31523a; text-align: left; white-space: nowrap; }
    .farmmap-popup td { padding: 3px 0; }
  `;
  document.head.appendChild(styleEl);

  if (layerControl && layerControl.addOverlay) {
    layerControl.addOverlay(layer, "\uB17C\uBC2D \uACBD\uACC4");
    layerControl.addOverlay(markerLayer, "\uB17C\uBC2D \uC704\uCE58 \uB9C8\uCEE4");
  }

  let timer = 0;
  let lastKey = "";
  let inFlight = null;
  let currentFeatures = [];

  function setStatus(text) {
    const el = document.querySelector(".farmmap-api-status");
    if (el) {
      el.textContent = text;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char];
    });
  }

  function landKind(props) {
    const text = [props.ldcg_cd, props.sb_ldcg_cd, props.fl_nm, props.o_fl_nm]
      .filter(Boolean)
      .join(" ");
    if (text.includes("\uB2F5") || text.includes("\uB17C") || text.toLowerCase().includes("paddy")) return "paddy";
    if (text.includes("\uC804") || text.includes("\uBC2D") || text.toLowerCase().includes("field")) return "field";
    return "other";
  }

  function landLabel(props) {
    const kind = landKind(props);
    if (kind === "paddy") return "\uB17C";
    if (kind === "field") return "\uBC2D";
    return props.fl_nm || props.ldcg_cd || "\uB17C\uBC2D";
  }

  function styleFeature(feature) {
    const kind = landKind(feature.properties || {});
    const color = kind === "paddy" ? "#2b8cbe" : kind === "field" ? "#f0b429" : "#6b7280";
    return {
      color,
      weight: 1.1,
      opacity: 0.95,
      fillColor: color,
      fillOpacity: 0.32,
    };
  }

  function popupHtml(props) {
    return `
      <div class="farmmap-popup">
        <table>
          <tr><th>??</th><td>${escapeHtml(landLabel(props))}</td></tr>
          <tr><th>??</th><td>${escapeHtml(props.stdg_addr)}</td></tr>
          <tr><th>PNU</th><td>${escapeHtml(props.pnu || props.sb_pnu)}</td></tr>
          <tr><th>??</th><td>${escapeHtml(props.ldcg_cd || props.sb_ldcg_cd)}</td></tr>
          <tr><th>??</th><td>${escapeHtml(props.fl_ar ? Math.round(Number(props.fl_ar)).toLocaleString() + "?" : "")}</td></tr>
          <tr><th>???</th><td>${escapeHtml(props.updt_ymd)}</td></tr>
        </table>
      </div>`;
  }

  // EPSG:5179 (Korea 2000 / Unified CS) inverse Transverse Mercator to WGS84-like lon/lat.
  function epsg5179ToLatLng(x, y) {
    const a = 6378137.0;
    const f = 1 / 298.257222101;
    const e2 = 2 * f - f * f;
    const ep2 = e2 / (1 - e2);
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const lat0 = 38 * Math.PI / 180;
    const lon0 = 127.5 * Math.PI / 180;
    const k0 = 0.9996;
    const x0 = 1000000;
    const y0 = 2000000;
    function meridian(phi) {
      return a * (
        (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi -
        (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi) +
        (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) -
        (35 * e2 ** 3 / 3072) * Math.sin(6 * phi)
      );
    }
    const m0 = meridian(lat0);
    const m = m0 + (y - y0) / k0;
    const mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
    const phi1 = mu +
      (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) +
      (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) +
      (151 * e1 ** 3 / 96) * Math.sin(6 * mu) +
      (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const c1 = ep2 * Math.cos(phi1) ** 2;
    const t1 = Math.tan(phi1) ** 2;
    const n1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
    const r1 = a * (1 - e2) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
    const d = (x - x0) / (n1 * k0);
    const lat = phi1 - (n1 * Math.tan(phi1) / r1) * (
      d ** 2 / 2 -
      (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24 +
      (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720
    );
    const lon = lon0 + (
      d -
      (1 + 2 * t1 + c1) * d ** 3 / 6 +
      (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120
    ) / Math.cos(phi1);
    return [lat * 180 / Math.PI, lon * 180 / Math.PI];
  }

  function coordsFromFarmmapGeometry(geometry) {
    if (!Array.isArray(geometry)) return [];
    const polygons = [];
    geometry.forEach((part) => {
      const xy = Array.isArray(part.xy) ? part.xy : [];
      const ring = xy
        .map((point) => epsg5179ToLatLng(Number(point.x), Number(point.y)))
        .filter((coord) => Number.isFinite(coord[0]) && Number.isFinite(coord[1]));
      if (ring.length >= 3) {
        polygons.push(ring);
      }
    });
    return polygons;
  }

  function featureFromRecord(record) {
    const polygons = coordsFromFarmmapGeometry(record.geometry);
    if (!polygons.length) return null;
    const geometry = polygons.length === 1
      ? { type: "Polygon", coordinates: [polygons[0].map(([lat, lng]) => [lng, lat])] }
      : { type: "MultiPolygon", coordinates: polygons.map((ring) => [ring.map(([lat, lng]) => [lng, lat])]) };
    return { type: "Feature", properties: record, geometry };
  }

  function jsonp(url, params) {
    return new Promise((resolve, reject) => {
      const callback = `dreamFarmmapCallback_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const script = document.createElement("script");
      const query = new URLSearchParams({ ...params, callback });
      const cleanup = () => {
        delete window[callback];
        script.remove();
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("?? API ?? ??? ???????."));
      }, 15000);
      window[callback] = (data) => {
        window.clearTimeout(timeout);
        cleanup();
        resolve(data);
      };
      script.onerror = () => {
        window.clearTimeout(timeout);
        cleanup();
        reject(new Error("?? API ???? ??? ??????."));
      };
      script.src = `${url}?${query.toString()}`;
      document.head.appendChild(script);
    });
  }

  function buildParams(center) {
    return {
      apiKey: apiConfig.apiKey || "",
      domain: apiConfig.domain || window.location.origin + "/",
      apiVersion: apiConfig.apiVersion || "v1",
      x: center.lng.toFixed(7),
      y: center.lat.toFixed(7),
      epsg: "EPSG:4326",
      radius: String(radiusMeters),
      mapType: apiConfig.mapType || "farmmap",
      columnType: apiConfig.columnType || "ENG",
    };
  }



  function featureCenter(feature) {
    const bounds = L.latLngBounds([]);
    function addCoord(coord) {
      if (!Array.isArray(coord) || coord.length < 2) return;
      const lng = Number(coord[0]);
      const lat = Number(coord[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        bounds.extend([lat, lng]);
      }
    }
    function walk(coords) {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === "number") {
        addCoord(coords);
        return;
      }
      coords.forEach(walk);
    }
    if (feature && feature.geometry) {
      walk(feature.geometry.coordinates);
    }
    return bounds.isValid() ? bounds.getCenter() : null;
  }

  function markerStyle(kind) {
    const fillColor = kind === "paddy" ? "#38bdf8" : kind === "field" ? "#facc15" : "#a7f3d0";
    return {
      radius: 5,
      color: "#ffffff",
      weight: 1.5,
      opacity: 0.95,
      fillColor,
      fillOpacity: 0.9,
      interactive: true,
    };
  }

  function addFeatureMarker(feature) {
    const center = feature.__dreamCenter || featureCenter(feature);
    if (!center) return;
    const props = feature.properties || {};
    const kind = landKind(props);
    L.circleMarker(center, markerStyle(kind))
      .bindTooltip(landLabel(props), { sticky: true })
      .bindPopup(popupHtml(props), { maxWidth: 320 })
      .addTo(markerLayer);
  }

  function shouldRenderFarmland() {
    return !map.getZoom || map.getZoom() >= displayMinZoom;
  }

  function drawCurrentFeatures() {
    layer.clearLayers();
    markerLayer.clearLayers();
    if (!shouldRenderFarmland()) {
      setStatus(`FarmMap farmland hidden until zoom ${displayMinZoom}+`);
      return;
    }
    const bounds = map.getBounds ? map.getBounds().pad(0.08) : null;
    const visible = [];
    for (const feature of currentFeatures) {
      const center = featureCenter(feature);
      if (!center || (bounds && !bounds.contains(center))) continue;
      feature.__dreamCenter = center;
      visible.push(feature);
      if (visible.length >= Math.max(markerRenderLimit, polygonRenderLimit)) break;
    }
    if (polygonRenderLimit > 0) {
      layer.addData({ type: "FeatureCollection", features: visible.slice(0, polygonRenderLimit) });
    }
    visible.slice(0, markerRenderLimit).forEach(addFeatureMarker);
    setStatus(`FarmMap visible ${Math.min(visible.length, markerRenderLimit)} / loaded ${currentFeatures.length}`);
  }

  function renderFeatures(features) {
    currentFeatures = Array.isArray(features) ? features : [];
    window.dreamFarmmapFarmlandFeatures = currentFeatures;
    window.dispatchEvent(new CustomEvent("dream:farmlandfeatureschange", {
      detail: { count: currentFeatures.length }
    }));
    drawCurrentFeatures();
  }

  async function loadFarmmapAtCenter(force) {
    if (!apiConfig.apiKey) {
      setStatus("FarmMap API key required");
      return;
    }
    if (map.getZoom && map.getZoom() < minZoom) {
      setStatus(`FarmMap API: zoom ${minZoom}+ required`);
      return;
    }
    const center = map.getCenter();
    const key = `${center.lat.toFixed(4)},${center.lng.toFixed(4)},${radiusMeters}`;
    if (!force && key === lastKey) return;
    lastKey = key;

    if (inFlight && inFlight.abort) inFlight.abort();
    setStatus("Loading FarmMap API...");

    try {
      const data = await jsonp(API_BASE + API_PATH, buildParams(center));
      if (!data || !data.status || data.status.result !== "S") {
        const msg = data && data.status && data.status.errorMsg ? data.status.errorMsg : "?? ??";
        setStatus(`FarmMap API error: ${msg}`);
        return;
      }
      const rows = (((data.output || {}).farmmapData || {}).data || []);
      const features = rows
        .filter((row) => ["paddy", "field"].includes(landKind(row)))
        .map(featureFromRecord)
        .filter(Boolean);
      renderFeatures(features);
      setStatus(shouldRenderFarmland() ? `FarmMap API farmland ${features.length} / radius ${radiusMeters}m` : `FarmMap farmland loaded ${features.length}; zoom ${displayMinZoom}+ to show`);
    } catch (error) {
      setStatus(error.message || "FarmMap API error");
    }
  }


  function loadStaticFarmmapData() {
    const data = window.dreamFarmmapFarmlandData;
    if (!data || !Array.isArray(data.features)) {
      return false;
    }
    renderFeatures(data.features);
    setStatus(shouldRenderFarmland() ? `FarmMap static farmland ${data.features.length}` : `FarmMap farmland loaded ${data.features.length}; zoom ${displayMinZoom}+ to show`);
    return true;
  }

  function scheduleLoad(force) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => loadFarmmapAtCenter(force), force ? 0 : debounceMs);
  }

  if (!loadStaticFarmmapData()) {
    map.on("moveend zoomend", () => scheduleLoad(false));
    map.on("click", (event) => {
      map.panTo(event.latlng);
      scheduleLoad(true);
    });

    if (apiConfig.autoLoad !== false) {
      scheduleLoad(true);
    }
  }

  map.on("moveend zoomend", drawCurrentFeatures);

  window.dreamFarmmapApiLayer = layer;
  window.dreamFarmmapMarkerLayer = markerLayer;
  window.dreamReloadFarmmapApiLayer = () => scheduleLoad(true);
})();
