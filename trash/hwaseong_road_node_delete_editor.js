// Click-to-delete editor for Hwaseong road nodes.
(function () {
  "use strict";

  const data = window.dreamHwaseongAllRoadNodesData;
  const totalEl = document.getElementById("total-count");
  const activeEl = document.getElementById("active-count");
  const deletedEl = document.getElementById("deleted-count");
  const statusEl = document.getElementById("status");
  const exportBtn = document.getElementById("export-btn");
  const areaBtn = document.getElementById("area-btn");
  const mountainToggle = document.getElementById("mountain-toggle");
  const linkToggle = document.getElementById("link-toggle");
  const mountainListPanel = document.getElementById("mountain-list-panel");
  const undoBtn = document.getElementById("undo-btn");
  const resetBtn = document.getElementById("reset-btn");
  const importInput = document.getElementById("import-input");

  if (!window.L || !data || !Array.isArray(data.nodes)) {
    statusEl.textContent = "노드 데이터를 불러오지 못했습니다";
    return;
  }

  const nodes = data.nodes.map((item, index) => ({
    index,
    lat: item[0],
    lon: item[1],
    typeIndex: item[2],
    clink: item[3],
    id: item[4] || `node-${index}`
  }));

  const typeCodes = data.typeCodes || [];
  const rawMountains = [
    { id: "mubongsan", name: "무봉산", ele: 351.8, lat: 37.21358, lon: 127.15244 },
    { id: "geondalsan", name: "건달산", ele: 336, lat: 37.1909272, lon: 126.9211196 },
    { id: "taehaengsan", name: "태행산", ele: 295, lat: 37.2156508, lon: 126.8966797 },
    { id: "sambongsan", name: "삼봉산", ele: 270.5, lat: 37.2228724, lon: 126.9143441 },
    { id: "seobongsan", name: "서봉산", ele: 250.3, lat: 37.1587488, lon: 126.9448438 },
    { id: "chilbosan", name: "칠보산", ele: 239, lat: 37.2606811, lon: 126.9322936 },
    { id: "taebongsan", name: "태봉산", ele: 223.8, lat: 37.189311, lon: 126.9528145 },
    { id: "myeongbongsan", name: "명봉산", ele: 170.8, lat: 37.1485429, lon: 126.9522139 },
    { id: "bonghwasan", name: "봉화산", ele: 168.6, lat: 37.1859062, lon: 126.7013657 },
    { id: "cheolmasan", name: "철마산", ele: 168.2, lat: 37.1661111, lon: 126.9157333 },
    { id: "seongtaesan", name: "성태산", ele: 166, lat: 37.31099, lon: 126.8802785 },
    { id: "gubongsan", name: "구봉산", ele: 158.1, lat: 37.1960989, lon: 126.7117398 },
    { id: "cheongmyeongsan", name: "청명산", ele: 157.1, lat: 37.1755715, lon: 126.726269 },
    { id: "choroksan", name: "초록산", ele: 150, lat: 37.08551, lon: 126.95616 },
    { id: "cheondeungsan", name: "천등산", ele: 146, lat: 37.2477806, lon: 126.7105667 },
    { id: "gochobong", name: "고초봉", ele: 143.9, lat: 37.1966795, lon: 126.8109948 },
    { id: "haewoonsan", name: "해운산", ele: 143, lat: 37.1384687, lon: 126.7086206 },
    { id: "gyemyeongsan", name: "계명산", ele: 140, lat: 37.2769543, lon: 126.6745694 },
    { id: "yeochisan", name: "여치산", ele: 130.7, lat: 37.1969094, lon: 126.729619 },
    { id: "haemangsan", name: "해망산", ele: 125.8, lat: 37.2543583, lon: 126.8346722 },
    { id: "maebongsan", name: "매봉산", ele: 108.6, lat: 37.2186099, lon: 126.7444833 },
    { id: "tapjaesan", name: "탑재산", ele: 67, lat: 37.1765427, lon: 126.6198479 },
    { id: "hambaksan", name: "함박산", ele: 56.6, lat: 37.0441629, lon: 127.0328616 },
    { id: "obongsan", name: "오봉산", ele: 68.5, lat: 37.0275642, lon: 126.9620077 },
    { id: "samjeongdaesan", name: "삼정대산", ele: 73.2, lat: 37.0159586, lon: 126.9582251 }
  ];
  const deletedIds = new Set();
  const undoStack = [];
  let nodeLayer = null;
  let hoverMarker = null;
  let drawToken = null;
  let visibleCache = [];
  let areaDeleteMode = false;
  let areaDragStart = null;
  let areaRectangle = null;
  let mountainLayer = null;
  let mountainVisible = true;
  let roadLinkLayer = null;
  let roadLinkVisible = false;
  let linkDataPromise = null;
  let linkDrawToken = null;

  const map = L.map("map", {
    preferCanvas: true,
    zoomControl: true
  });

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  const bounds = L.latLngBounds(nodes.map((node) => [node.lat, node.lon]));
  const hwaseongBounds = bounds.pad(0.002);
  const mountains = rawMountains
    .filter((mountain) => hwaseongBounds.contains([mountain.lat, mountain.lon]))
    .sort((a, b) => b.ele - a.ele);
  map.fitBounds(bounds.pad(0.03));

  const linkPane = map.createPane("roadLinkEditorCanvasPane");
  linkPane.style.zIndex = 390;
  linkPane.style.pointerEvents = "none";

  const canvasPane = map.createPane("nodeEditorCanvasPane");
  canvasPane.style.zIndex = 410;
  canvasPane.style.pointerEvents = "none";

  const typeStyles = [
    { fill: "rgba(97, 110, 124, .72)", radius: 1.8 },
    { fill: "rgba(51, 160, 44, .78)", radius: 2 },
    { fill: "rgba(31, 120, 180, .80)", radius: 2.1 },
    { fill: "rgba(107, 114, 128, .78)", radius: 2 },
    { fill: "rgba(123, 50, 148, .86)", radius: 2.5 },
    { fill: "rgba(99, 102, 241, .82)", radius: 2.2 },
    { fill: "rgba(215, 48, 39, .90)", radius: 2.6 }
  ];

  const linkStyles = [
    { stroke: "rgba(37, 99, 235, .48)", weight: 0.8 },
    { stroke: "rgba(234, 88, 12, .62)", weight: 1.2 },
    { stroke: "rgba(220, 38, 38, .72)", weight: 1.6 },
    { stroke: "rgba(15, 118, 110, .68)", weight: 1.35 },
    { stroke: "rgba(109, 40, 217, .76)", weight: 1.45 },
    { stroke: "rgba(180, 83, 9, .70)", weight: 1.45 }
  ];

  const NodeCanvasLayer = L.Layer.extend({
    onAdd(activeMap) {
      this._map = activeMap;
      this._canvas = L.DomUtil.create("canvas", "node-editor-canvas", canvasPane);
      this._canvas.style.position = "absolute";
      this._canvas.style.pointerEvents = "none";
      this._ctx = this._canvas.getContext("2d");
      activeMap.on("moveend zoomend resize viewreset", this._reset, this);
      this._reset();
    },

    onRemove(activeMap) {
      activeMap.off("moveend zoomend resize viewreset", this._reset, this);
      if (this._canvas && this._canvas.parentNode) {
        this._canvas.parentNode.removeChild(this._canvas);
      }
    },

    redraw() {
      this._scheduleDraw();
    },

    _reset() {
      const size = map.getSize();
      const dpr = window.devicePixelRatio || 1;
      this._canvas.width = Math.max(1, Math.round(size.x * dpr));
      this._canvas.height = Math.max(1, Math.round(size.y * dpr));
      this._canvas.style.width = `${size.x}px`;
      this._canvas.style.height = `${size.y}px`;
      this._topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, this._topLeft);
      this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._scheduleDraw();
    },

    _scheduleDraw() {
      if (drawToken) {
        window.cancelAnimationFrame(drawToken);
      }
      drawToken = window.requestAnimationFrame(() => {
        drawToken = null;
        this._draw();
      });
    },

    _draw() {
      const size = map.getSize();
      const ctx = this._ctx;
      const padded = map.getBounds().pad(0.04);
      const zoom = map.getZoom();
      const radiusBoost = zoom >= 15 ? 1.25 : zoom >= 13 ? .75 : zoom >= 11 ? .35 : 0;
      const buckets = typeStyles.map(() => []);
      visibleCache = [];

      ctx.clearRect(0, 0, size.x, size.y);
      nodes.forEach((node) => {
        if (deletedIds.has(node.id)) return;
        if (!padded.contains([node.lat, node.lon])) return;
        const point = map.latLngToLayerPoint([node.lat, node.lon]).subtract(this._topLeft);
        const styleIndex = node.clink >= 4 ? 6 : Math.max(0, Math.min(node.typeIndex, typeStyles.length - 2));
        buckets[styleIndex].push([point.x, point.y, node]);
        visibleCache.push({ x: point.x, y: point.y, node });
      });

      buckets.forEach((bucket, index) => {
        if (!bucket.length) return;
        const style = typeStyles[index];
        const radius = style.radius + radiusBoost;
        ctx.beginPath();
        bucket.forEach(([x, y]) => {
          ctx.moveTo(x + radius, y);
          ctx.arc(x, y, radius, 0, Math.PI * 2);
        });
        ctx.fillStyle = style.fill;
        ctx.fill();
      });
      updateStats();
    }
  });

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function loadLinkData() {
    if (window.dreamHwaseongAllRoadLinksData) {
      return Promise.resolve(window.dreamHwaseongAllRoadLinksData);
    }
    if (linkDataPromise) return linkDataPromise;
    linkDataPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "hwaseong_green_road_links_data.js?v=20260622-greenroads";
      script.charset = "utf-8";
      script.async = true;
      script.onload = () => {
        if (window.dreamHwaseongAllRoadLinksData) {
          resolve(window.dreamHwaseongAllRoadLinksData);
        } else {
          reject(new Error("link data global missing"));
        }
      };
      script.onerror = () => reject(new Error("link data load failed"));
      document.head.appendChild(script);
    });
    return linkDataPromise;
  }

  function boundsIntersects(boundsToCheck, minLat, minLon, maxLat, maxLon) {
    return !(
      maxLat < boundsToCheck.getSouth() ||
      minLat > boundsToCheck.getNorth() ||
      maxLon < boundsToCheck.getWest() ||
      minLon > boundsToCheck.getEast()
    );
  }

  function isLinkConnectedToDeletedNode(linkItem) {
    return deletedIds.has(linkItem[6]) || deletedIds.has(linkItem[7]);
  }

  const RoadLinkCanvasLayer = L.Layer.extend({
    initialize(linkData) {
      this._data = linkData;
      this._prepared = this._prepareLinks(linkData.links || []);
    },

    onAdd(activeMap) {
      this._map = activeMap;
      this._canvas = L.DomUtil.create("canvas", "road-link-editor-canvas", linkPane);
      this._canvas.style.position = "absolute";
      this._canvas.style.pointerEvents = "none";
      this._ctx = this._canvas.getContext("2d");
      activeMap.on("moveend zoomend resize viewreset", this._reset, this);
      this._reset();
    },

    onRemove(activeMap) {
      activeMap.off("moveend zoomend resize viewreset", this._reset, this);
      if (linkDrawToken) {
        window.cancelAnimationFrame(linkDrawToken);
        linkDrawToken = null;
      }
      if (this._canvas && this._canvas.parentNode) {
        this._canvas.parentNode.removeChild(this._canvas);
      }
    },

    redraw() {
      this._scheduleDraw();
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
      const size = map.getSize();
      const dpr = window.devicePixelRatio || 1;
      this._canvas.width = Math.max(1, Math.round(size.x * dpr));
      this._canvas.height = Math.max(1, Math.round(size.y * dpr));
      this._canvas.style.width = `${size.x}px`;
      this._canvas.style.height = `${size.y}px`;
      this._topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, this._topLeft);
      this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._scheduleDraw();
    },

    _scheduleDraw() {
      if (linkDrawToken) {
        window.cancelAnimationFrame(linkDrawToken);
      }
      linkDrawToken = window.requestAnimationFrame(() => {
        linkDrawToken = null;
        this._draw();
      });
    },

    _point(lat, lon) {
      return map.latLngToLayerPoint([lat, lon]).subtract(this._topLeft);
    },

    _draw() {
      const size = map.getSize();
      const ctx = this._ctx;
      const padded = map.getBounds().pad(0.06);
      const zoom = map.getZoom();
      const zoomWeight = zoom >= 14 ? .85 : zoom >= 12 ? .45 : zoom >= 10 ? .15 : 0;
      let drawn = 0;
      let hiddenByDeletedNodes = 0;
      ctx.clearRect(0, 0, size.x, size.y);

      this._prepared.forEach((bucket, index) => {
        if (!bucket.length) return;
        const style = linkStyles[index];
        ctx.beginPath();
        bucket.forEach((item) => {
          if (isLinkConnectedToDeletedNode(item)) {
            hiddenByDeletedNodes += 1;
            return;
          }
          if (!boundsIntersects(padded, item[1], item[2], item[3], item[4])) return;
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
      if (roadLinkVisible) {
        const hiddenText = hiddenByDeletedNodes ? ` / 삭제노드 연결 ${number(hiddenByDeletedNodes)}건 숨김` : "";
        updateStatus(`화성시 차도링크 표시 중: 화면 ${number(drawn)}건 / 전체 ${number(this._data.meta?.count || 0)}건${hiddenText}`);
      }
    }
  });

  nodeLayer = new NodeCanvasLayer().addTo(map);

  function number(value) {
    return Number(value || 0).toLocaleString("ko-KR");
  }

  function updateStats() {
    totalEl.textContent = number(nodes.length);
    deletedEl.textContent = number(deletedIds.size);
    activeEl.textContent = number(nodes.length - deletedIds.size);
  }

  function updateStatus(text) {
    statusEl.textContent = text;
  }

  function refreshRoadLinks() {
    if (roadLinkLayer && roadLinkVisible) {
      roadLinkLayer.redraw();
    }
  }

  function buildMountainLayer() {
    if (mountainLayer) return mountainLayer;
    mountainLayer = L.layerGroup();
    mountains.forEach((mountain) => {
      const marker = L.marker([mountain.lat, mountain.lon], {
        icon: L.divIcon({
          className: "mountain-label-icon",
          html: `<div class="mountain-label">${escapeHtml(mountain.name)} <small>${escapeHtml(mountain.ele)}m</small></div>`,
          iconSize: [1, 1],
          iconAnchor: [0, 0]
        }),
        title: mountain.name,
        bubblingMouseEvents: false
      });
      marker.bindPopup(
        `<strong>${escapeHtml(mountain.name)}</strong><br>고도 ${escapeHtml(mountain.ele)}m<br>${mountain.lat.toFixed(6)}, ${mountain.lon.toFixed(6)}`,
        { maxWidth: 240 }
      );
      marker.addTo(mountainLayer);
    });
    return mountainLayer;
  }

  function renderMountainList() {
    if (!mountainListPanel) return;
    mountainListPanel.innerHTML = mountains
      .map((mountain) => (
        `<button type="button" data-mountain-id="${escapeHtml(mountain.id)}">${escapeHtml(mountain.name)} · ${escapeHtml(mountain.ele)}m</button>`
      ))
      .join("");
  }

  function setMountainVisible(visible) {
    mountainVisible = visible;
    mountainToggle.classList.toggle("active", mountainVisible);
    mountainToggle.setAttribute("aria-pressed", String(mountainVisible));
    mountainListPanel.classList.toggle("active", mountainVisible);
    if (mountainVisible) {
      buildMountainLayer().addTo(map);
      updateStatus(`화성시 산 목록 ${number(mountains.length)}개 표시`);
    } else if (mountainLayer) {
      mountainLayer.remove();
      updateStatus("산 목록/마커를 숨겼습니다");
    }
  }

  function setRoadLinkVisible(visible) {
    roadLinkVisible = visible;
    linkToggle.classList.toggle("active", roadLinkVisible);
    linkToggle.setAttribute("aria-pressed", String(roadLinkVisible));
    if (!roadLinkVisible) {
      if (roadLinkLayer) {
        roadLinkLayer.remove();
      }
      updateStatus("차도링크를 숨겼습니다");
      return;
    }
    if (roadLinkLayer) {
      roadLinkLayer.addTo(map);
      updateStatus("화성시 차도링크를 다시 표시합니다");
      return;
    }
    updateStatus("화성시 차도링크 데이터를 불러오는 중");
    loadLinkData()
      .then((linkData) => {
        roadLinkLayer = new RoadLinkCanvasLayer(linkData);
        if (roadLinkVisible) {
          roadLinkLayer.addTo(map);
          updateStatus(`화성시 차도링크 ${number(linkData.meta?.count || 0)}건 표시`);
        }
      })
      .catch(() => {
        roadLinkVisible = false;
        linkToggle.classList.remove("active");
        linkToggle.setAttribute("aria-pressed", "false");
        updateStatus("차도링크 데이터를 불러오지 못했습니다");
      });
  }

  function setAreaDeleteMode(enabled) {
    areaDeleteMode = enabled;
    areaBtn.classList.toggle("active", areaDeleteMode);
    areaBtn.setAttribute("aria-pressed", String(areaDeleteMode));
    if (areaDeleteMode) {
      map.dragging.disable();
      map.doubleClickZoom.disable();
      updateStatus("영역삭제 모드: 드래그한 사각형 안의 노드가 삭제됩니다");
    } else {
      map.dragging.enable();
      map.doubleClickZoom.enable();
      cancelAreaRectangle();
      updateStatus("노드 클릭 삭제 / 우클릭으로 영역삭제 켜기");
    }
  }

  function cancelAreaRectangle() {
    areaDragStart = null;
    if (areaRectangle) {
      areaRectangle.remove();
      areaRectangle = null;
    }
  }

  function findNearest(containerPoint) {
    const threshold = map.getZoom() >= 15 ? 12 : map.getZoom() >= 13 ? 10 : 8;
    let best = null;
    let bestDistSq = threshold * threshold;
    visibleCache.forEach((item) => {
      const dx = item.x - containerPoint.x;
      const dy = item.y - containerPoint.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= bestDistSq) {
        bestDistSq = distSq;
        best = item.node;
      }
    });
    return best;
  }

  function nodeLabel(node) {
    const typeCode = typeCodes[node.typeIndex] || "UNKNOWN";
    return `${node.id} / ${typeCode} / 연결 ${node.clink}`;
  }

  function deleteNode(node) {
    if (!node || deletedIds.has(node.id)) return;
    deletedIds.add(node.id);
    undoStack.push([node.id]);
    if (hoverMarker) {
      hoverMarker.remove();
      hoverMarker = null;
    }
    nodeLayer.redraw();
    refreshRoadLinks();
    updateStatus(`삭제됨: ${nodeLabel(node)}`);
  }

  function deleteNodesInBounds(bounds) {
    let removed = 0;
    const removedIds = [];
    nodes.forEach((node) => {
      if (deletedIds.has(node.id)) return;
      if (!bounds.contains([node.lat, node.lon])) return;
      deletedIds.add(node.id);
      removedIds.push(node.id);
      removed += 1;
    });
    if (removedIds.length) {
      undoStack.push(removedIds);
    }
    if (hoverMarker) {
      hoverMarker.remove();
      hoverMarker = null;
    }
    nodeLayer.redraw();
    refreshRoadLinks();
    updateStatus(`영역삭제 완료: ${number(removed)}개 노드 삭제`);
  }

  function restoreLast() {
    while (undoStack.length) {
      const ids = undoStack.pop();
      const batch = Array.isArray(ids) ? ids : [ids];
      let restored = 0;
      let firstNode = null;
      batch.forEach((id) => {
        if (deletedIds.delete(id)) {
          restored += 1;
          if (!firstNode) firstNode = nodes.find((item) => item.id === id);
        }
      });
      if (restored) {
        nodeLayer.redraw();
        refreshRoadLinks();
        updateStatus(restored === 1 ? `복구됨: ${firstNode ? nodeLabel(firstNode) : batch[0]}` : `영역삭제 복구됨: ${number(restored)}개 노드`);
        return;
      }
    }
    updateStatus("복구할 삭제 항목이 없습니다");
  }

  function clearDeleted() {
    deletedIds.clear();
    undoStack.length = 0;
    nodeLayer.redraw();
    refreshRoadLinks();
    updateStatus("삭제 목록을 초기화했습니다");
  }

  function deletedPayload(linkData = window.dreamHwaseongAllRoadLinksData) {
    const deletedNodes = nodes
      .filter((node) => deletedIds.has(node.id))
      .map((node) => ({
        id: node.id,
        lat: node.lat,
        lon: node.lon,
        type: typeCodes[node.typeIndex] || null,
        clink: node.clink
      }));
    const loadedLinks = linkData?.links || [];
    const deletedLinkIds = loadedLinks
      .filter((linkItem) => isLinkConnectedToDeletedNode(linkItem))
      .map((linkItem) => linkItem[8])
      .filter(Boolean);
    return {
      version: 1,
      kind: "hwaseong-road-node-delete-list",
      createdAt: new Date().toISOString(),
      source: data.meta?.source || "TN_RODWAY_NODE(1).shp",
      targetMap: "hwaseong_fire_patrol_map_road_nodes.html",
      count: deletedNodes.length,
      deletedNodeIds: deletedNodes.map((node) => node.id),
      deletedNodes,
      deletedLinkCount: deletedLinkIds.length,
      deletedLinkIds
    };
  }

  async function exportDeleted() {
    let linkData = window.dreamHwaseongAllRoadLinksData;
    if (deletedIds.size && !linkData) {
      updateStatus("연결 링크 삭제 정보를 계산하는 중입니다");
      try {
        linkData = await loadLinkData();
      } catch (error) {
        updateStatus("차도링크 데이터를 불러오지 못해 노드 삭제 목록만 내보냅니다");
      }
    }
    const payload = deletedPayload(linkData);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
    const link = document.createElement("a");
    link.href = url;
    link.download = `hwaseong_deleted_road_nodes_${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    updateStatus(`삭제 목록 ${number(payload.count)}개 / 연결 링크 ${number(payload.deletedLinkCount)}건을 내보냈습니다`);
  }

  function importDeleted(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || "{}"));
        const ids = Array.isArray(payload.deletedNodeIds)
          ? payload.deletedNodeIds
          : Array.isArray(payload.deletedNodes)
            ? payload.deletedNodes.map((item) => item.id).filter(Boolean)
            : [];
        let added = 0;
        const importedIds = [];
        const knownIds = new Set(nodes.map((node) => node.id));
        ids.forEach((id) => {
          if (knownIds.has(id) && !deletedIds.has(id)) {
            deletedIds.add(id);
            importedIds.push(id);
            added += 1;
          }
        });
        if (added) {
          undoStack.push(importedIds);
        }
        nodeLayer.redraw();
        refreshRoadLinks();
        updateStatus(`삭제 목록 ${number(added)}개를 불러왔습니다`);
      } catch (error) {
        updateStatus("삭제 목록 JSON을 읽지 못했습니다");
      } finally {
        importInput.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  map.on("click", (event) => {
    if (areaDeleteMode) return;
    const node = findNearest(event.containerPoint);
    if (node) {
      deleteNode(node);
    } else {
      updateStatus("가까운 노드가 없습니다. 확대 후 다시 클릭하세요");
    }
  });

  map.on("contextmenu", (event) => {
    L.DomEvent.preventDefault(event.originalEvent);
    setAreaDeleteMode(!areaDeleteMode);
  });

  map.on("mousemove", (event) => {
    if (areaDeleteMode) return;
    const node = findNearest(event.containerPoint);
    if (!node) {
      if (hoverMarker) {
        hoverMarker.remove();
        hoverMarker = null;
      }
      return;
    }
    if (!hoverMarker) {
      hoverMarker = L.tooltip({
        className: "node-editor-tooltip",
        direction: "top",
        offset: [0, -8],
        opacity: .95
      }).addTo(map);
    }
    hoverMarker
      .setLatLng([node.lat, node.lon])
      .setContent(nodeLabel(node));
  });

  map.on("mousedown", (event) => {
    if (!areaDeleteMode) return;
    areaDragStart = event.latlng;
    if (areaRectangle) {
      areaRectangle.remove();
    }
    areaRectangle = L.rectangle([areaDragStart, areaDragStart], {
      color: "#16a34a",
      weight: 2,
      fillColor: "#22c55e",
      fillOpacity: 0.12,
      dashArray: "6 4",
      interactive: false
    }).addTo(map);
    L.DomEvent.preventDefault(event.originalEvent);
  });

  map.on("mousemove", (event) => {
    if (!areaDeleteMode || !areaDragStart || !areaRectangle) return;
    areaRectangle.setBounds(L.latLngBounds(areaDragStart, event.latlng));
  });

  map.on("mouseup", (event) => {
    if (!areaDeleteMode || !areaDragStart || !areaRectangle) return;
    const bounds = L.latLngBounds(areaDragStart, event.latlng);
    const startPoint = map.latLngToContainerPoint(areaDragStart);
    const endPoint = map.latLngToContainerPoint(event.latlng);
    const dragDistance = startPoint.distanceTo(endPoint);
    cancelAreaRectangle();
    if (dragDistance < 8) {
      updateStatus("영역이 너무 작습니다. 조금 더 크게 드래그하세요");
      return;
    }
    deleteNodesInBounds(bounds);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && areaDeleteMode) {
      setAreaDeleteMode(false);
    }
  });

  exportBtn.addEventListener("click", exportDeleted);
  areaBtn.addEventListener("click", () => setAreaDeleteMode(!areaDeleteMode));
  mountainToggle.addEventListener("click", () => setMountainVisible(!mountainVisible));
  linkToggle.addEventListener("click", () => setRoadLinkVisible(!roadLinkVisible));
  undoBtn.addEventListener("click", restoreLast);
  resetBtn.addEventListener("click", clearDeleted);
  importInput.addEventListener("change", () => {
    const file = importInput.files && importInput.files[0];
    if (file) importDeleted(file);
  });
  mountainListPanel.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mountain-id]");
    if (!button) return;
    const mountain = mountains.find((item) => item.id === button.dataset.mountainId);
    if (!mountain) return;
    map.flyTo([mountain.lat, mountain.lon], Math.max(map.getZoom(), 14), { duration: .45 });
    if (mountainLayer) {
      mountainLayer.eachLayer((layer) => {
        if (layer.options && layer.options.title === mountain.name) {
          layer.openPopup();
        }
      });
    }
    updateStatus(`${mountain.name} 위치로 이동했습니다`);
  });

  window.dreamHwaseongRoadNodeDeleteEditor = {
    map,
    nodes,
    mountains,
    deletedIds,
    exportDeleted,
    deletedPayload
  };

  renderMountainList();
  setMountainVisible(true);
  updateStats();
  updateStatus("노드 클릭 삭제 / 우클릭으로 영역삭제 켜기");
})();
