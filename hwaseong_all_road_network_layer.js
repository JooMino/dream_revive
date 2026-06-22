// Lazy canvas layers for all Hwaseong road nodes and links.
(function () {
  "use strict";

  const config = window.dreamFactoryPriorityConfig || {};
  const map =
    config.map ||
    Object.keys(window)
      .filter((key) => key.startsWith("map_"))
      .map((key) => window[key])
      .find((value) => value && value.eachLayer && value.flyTo);
  const layerControl =
    config.layerControl ||
    Object.keys(window)
      .map((key) => window[key])
      .find((value) => value && value.addOverlay && value.removeLayer);

  if (!map || !window.L) {
    return;
  }

  const loadPromises = {};

  function loadScriptOnce(src, globalName) {
    if (window[globalName]) {
      return Promise.resolve(window[globalName]);
    }
    if (loadPromises[globalName]) {
      return loadPromises[globalName];
    }
    loadPromises[globalName] = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.charset = "utf-8";
      script.async = true;
      script.onload = () => {
        if (window[globalName]) {
          resolve(window[globalName]);
        } else {
          reject(new Error(`${globalName} was not defined by ${src}`));
        }
      };
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
    return loadPromises[globalName];
  }

  function ensurePane(name, zIndex) {
    if (!map.getPane(name)) {
      map.createPane(name);
      map.getPane(name).style.zIndex = zIndex;
      map.getPane(name).style.pointerEvents = "none";
    }
    return map.getPane(name);
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("ko-KR");
  }

  function boundsIntersects(bounds, minLat, minLon, maxLat, maxLon) {
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const west = bounds.getWest();
    const east = bounds.getEast();
    return !(maxLat < south || minLat > north || maxLon < west || minLon > east);
  }

  const nodeStyles = [
    { fill: "rgba(97, 110, 124, .68)", radius: 1.4 },
    { fill: "rgba(51, 160, 44, .72)", radius: 1.6 },
    { fill: "rgba(31, 120, 180, .74)", radius: 1.8 },
    { fill: "rgba(107, 114, 128, .72)", radius: 1.6 },
    { fill: "rgba(123, 50, 148, .78)", radius: 2.2 },
    { fill: "rgba(99, 102, 241, .74)", radius: 1.8 },
    { fill: "rgba(215, 48, 39, .82)", radius: 2.2 }
  ];

  const linkStyles = [
    { stroke: "rgba(37, 99, 235, .50)", weight: 0.8 },
    { stroke: "rgba(234, 88, 12, .62)", weight: 1.2 },
    { stroke: "rgba(220, 38, 38, .70)", weight: 1.6 },
    { stroke: "rgba(15, 118, 110, .68)", weight: 1.35 },
    { stroke: "rgba(109, 40, 217, .76)", weight: 1.45 },
    { stroke: "rgba(180, 83, 9, .70)", weight: 1.45 }
  ];

  const HwaseongCanvasLayer = L.Layer.extend({
    initialize(options) {
      L.setOptions(this, options);
      this._data = null;
      this._prepared = null;
      this._loaded = false;
      this._loading = false;
      this._panelAttached = false;
      this._drawToken = null;
    },

    onAdd(activeMap) {
      this._map = activeMap;
      this._pane = ensurePane(this.options.paneName, this.options.zIndex);
      this._canvas = L.DomUtil.create("canvas", this.options.className, this._pane);
      this._canvas.style.position = "absolute";
      this._canvas.style.pointerEvents = "none";
      this._canvas.setAttribute("aria-hidden", "true");
      this._ctx = this._canvas.getContext("2d");

      activeMap.on("moveend zoomend resize viewreset", this._reset, this);
      this._showPanel();
      this._setPanel("loading");
      this._reset();
      this._loadData();
    },

    onRemove(activeMap) {
      activeMap.off("moveend zoomend resize viewreset", this._reset, this);
      if (this._drawToken) {
        window.cancelAnimationFrame(this._drawToken);
        this._drawToken = null;
      }
      if (this._canvas && this._canvas.parentNode) {
        this._canvas.parentNode.removeChild(this._canvas);
      }
      this._canvas = null;
      this._ctx = null;
      this._hidePanel();
    },

    _showPanel() {
      if (!this._panel) {
        this._panel = L.control({ position: "bottomright" });
        this._panel.onAdd = () => {
          this._panelContainer = L.DomUtil.create("div", "hwaseong-all-road-panel");
          L.DomEvent.disableClickPropagation(this._panelContainer);
          return this._panelContainer;
        };
      }
      if (!this._panelAttached) {
        this._panel.addTo(this._map);
        this._panelAttached = true;
      }
    },

    _hidePanel() {
      if (this._panelAttached && this._panel) {
        this._panel.remove();
        this._panelAttached = false;
      }
      this._panelContainer = null;
    },

    _setPanel(state, drawnCount) {
      if (!this._panelContainer) return;
      const title = this.options.title;
      const count = this._data?.meta?.count || this.options.expectedCount;
      const subline =
        state === "ready"
          ? `${formatNumber(drawnCount ?? count)}개 화면 렌더링 / 전체 ${formatNumber(count)}`
          : state === "error"
            ? "데이터를 불러오지 못했습니다"
            : "큰 데이터 파일을 불러오는 중";
      const detail = this.options.kind === "links"
        ? "선형 Canvas 표시 · 기본 꺼짐"
        : "점 Canvas 표시 · 기본 꺼짐";
      this._panelContainer.innerHTML = `
        <strong>${title}</strong>
        <span>${subline}</span>
        <span>${detail}</span>
      `;
    },

    _loadData() {
      if (this._loaded || this._loading) return;
      this._loading = true;
      loadScriptOnce(this.options.dataSrc, this.options.globalName)
        .then((data) => {
          this._data = data;
          this._prepared = this.options.kind === "links"
            ? this._prepareLinks(data.links)
            : this._prepareNodes(data.nodes);
          this._loaded = true;
          this._loading = false;
          this._scheduleDraw();
        })
        .catch(() => {
          this._loading = false;
          this._setPanel("error");
        });
    },

    _prepareNodes(nodes) {
      const buckets = Array.from({ length: nodeStyles.length }, () => []);
      nodes.forEach((item) => {
        const lat = item[0];
        const lon = item[1];
        const type = item[2];
        const clink = item[3];
        const style = clink >= 4 ? 6 : Math.max(0, Math.min(type, nodeStyles.length - 2));
        buckets[style].push([lat, lon]);
      });
      return buckets;
    },

    _prepareLinks(links) {
      const buckets = Array.from({ length: linkStyles.length }, () => []);
      links.forEach((item) => {
        const style = Math.max(0, Math.min(item[0], linkStyles.length - 1));
        buckets[style].push(item);
      });
      return buckets;
    },

    _reset() {
      if (!this._canvas || !this._map) return;
      const size = this._map.getSize();
      const dpr = window.devicePixelRatio || 1;
      this._canvas.width = Math.max(1, Math.round(size.x * dpr));
      this._canvas.height = Math.max(1, Math.round(size.y * dpr));
      this._canvas.style.width = `${size.x}px`;
      this._canvas.style.height = `${size.y}px`;
      this._topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, this._topLeft);
      this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._scheduleDraw();
    },

    _scheduleDraw() {
      if (!this._loaded || !this._ctx || !this._canvas) return;
      if (this._drawToken) {
        window.cancelAnimationFrame(this._drawToken);
      }
      this._drawToken = window.requestAnimationFrame(() => {
        this._drawToken = null;
        const drawn = this.options.kind === "links" ? this._drawLinks() : this._drawNodes();
        this._setPanel("ready", drawn);
      });
    },

    _clear() {
      const size = this._map.getSize();
      this._ctx.clearRect(0, 0, size.x, size.y);
    },

    _point(lat, lon) {
      return this._map.latLngToLayerPoint([lat, lon]).subtract(this._topLeft);
    },

    _drawNodes() {
      this._clear();
      const ctx = this._ctx;
      const bounds = this._map.getBounds().pad(0.04);
      const zoom = this._map.getZoom();
      const zoomBoost = zoom >= 14 ? 1.1 : zoom >= 12 ? 0.65 : zoom >= 10 ? 0.25 : 0;
      let drawn = 0;

      this._prepared.forEach((bucket, index) => {
        if (!bucket.length) return;
        const style = nodeStyles[index];
        const radius = style.radius + zoomBoost;
        ctx.beginPath();
        bucket.forEach(([lat, lon]) => {
          if (!bounds.contains([lat, lon])) return;
          const point = this._point(lat, lon);
          ctx.moveTo(point.x + radius, point.y);
          ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
          drawn += 1;
        });
        ctx.fillStyle = style.fill;
        ctx.fill();
      });
      return drawn;
    },

    _drawLinks() {
      this._clear();
      const ctx = this._ctx;
      const bounds = this._map.getBounds().pad(0.06);
      const zoom = this._map.getZoom();
      const zoomWeight = zoom >= 14 ? 0.85 : zoom >= 12 ? 0.45 : zoom >= 10 ? 0.15 : 0;
      let drawn = 0;

      this._prepared.forEach((bucket, index) => {
        if (!bucket.length) return;
        const style = linkStyles[index];
        ctx.beginPath();
        bucket.forEach((item) => {
          if (!boundsIntersects(bounds, item[1], item[2], item[3], item[4])) return;
          const coords = item[5];
          if (!coords || coords.length < 4) return;
          let point = this._point(coords[0], coords[1]);
          ctx.moveTo(point.x, point.y);
          for (let i = 2; i < coords.length; i += 2) {
            point = this._point(coords[i], coords[i + 1]);
            ctx.lineTo(point.x, point.y);
          }
          drawn += 1;
        });
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = style.weight + zoomWeight;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      });
      return drawn;
    }
  });

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .hwaseong-all-road-panel {
      width: 230px;
      padding: 9px 11px;
      border: 1px solid rgba(28, 38, 48, .2);
      border-radius: 7px;
      background: rgba(255, 255, 255, .94);
      box-shadow: 0 8px 22px rgba(24, 36, 42, .16);
      color: #202a35;
      font: 12px/1.4 "Segoe UI", "Malgun Gothic", Arial, sans-serif;
    }
    .hwaseong-all-road-panel strong { display: block; margin-bottom: 5px; font-size: 13px; }
    .hwaseong-all-road-panel span { display: block; color: #596772; }
    .hwaseong-all-road-nodes,
    .hwaseong-all-road-links { mix-blend-mode: multiply; }
  `;
  document.head.appendChild(styleEl);

  ensurePane("hwaseongAllRoadLinkPane", 388);
  ensurePane("hwaseongAllRoadNodePane", 398);

  const allLinkLayer = new HwaseongCanvasLayer({
    kind: "links",
    title: "화성시 녹지근접 차도링크",
    expectedCount: 41629,
    dataSrc: "hwaseong_green_road_links_data.js?v=20260622-greenroads",
    globalName: "dreamHwaseongAllRoadLinksData",
    paneName: "hwaseongAllRoadLinkPane",
    zIndex: 388,
    className: "hwaseong-all-road-links"
  });

  const allNodeLayer = new HwaseongCanvasLayer({
    kind: "nodes",
    title: "화성시 녹지근접 차도노드",
    expectedCount: 44285,
    dataSrc: "hwaseong_green_road_nodes_data.js?v=20260622-greenroads",
    globalName: "dreamHwaseongAllRoadNodesData",
    paneName: "hwaseongAllRoadNodePane",
    zIndex: 398,
    className: "hwaseong-all-road-nodes"
  });

  if (layerControl && layerControl.addOverlay) {
    layerControl.addOverlay(allNodeLayer, "화성시 녹지근접 차도노드 44,285건");
    layerControl.addOverlay(allLinkLayer, "화성시 녹지근접 차도링크 41,629건");
  }

  window.dreamHwaseongAllRoadNetworkLayers = {
    nodes: allNodeLayer,
    links: allLinkLayer
  };
})();
