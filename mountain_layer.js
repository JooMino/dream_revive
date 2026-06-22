// Mountain labels sourced from OpenStreetMap Overpass natural=peak data.
(function () {
  "use strict";

  const config = window.dreamFactoryPriorityConfig || {};
  const map =
    config.map ||
    Object.keys(window)
      .filter((key) => key.startsWith("map_"))
      .map((key) => window[key])
      .find((value) => value && value.eachLayer && value.flyTo);
  const layerControl = config.layerControl || null;

  const mountains = [
    { id: "mubongsan", name: "무봉산", ele: 351.8, lat: 37.21358, lon: 127.15244, osm: 10252816348 },
    { id: "geondalsan", name: "건달산", ele: 336, lat: 37.1909272, lon: 126.9211196, osm: 4641754015 },
    { id: "taehaengsan", name: "태행산", ele: 295, lat: 37.2156508, lon: 126.8966797, osm: 5750035818 },
    { id: "sambongsan", name: "삼봉산", ele: 270.5, lat: 37.2228724, lon: 126.9143441, osm: 10125280561 },
    { id: "seobongsan", name: "서봉산", ele: 250.3, lat: 37.1587488, lon: 126.9448438, osm: 4641754016 },
    { id: "chilbosan", name: "칠보산", ele: 239, lat: 37.2606811, lon: 126.9322936, osm: 7480406719 },
    { id: "taebongsan", name: "태봉산", ele: 223.8, lat: 37.189311, lon: 126.9528145, osm: 10127283391 },
    { id: "myeongbongsan", name: "명봉산", ele: 170.8, lat: 37.1485429, lon: 126.9522139, osm: 10127283394 },
    { id: "bonghwasan", name: "봉화산", ele: 168.6, lat: 37.1859062, lon: 126.7013657, osm: 4659373183 },
    { id: "cheolmasan", name: "철마산", ele: 168.2, lat: 37.1661111, lon: 126.9157333, osm: 10252867588 },
    { id: "seongtaesan", name: "성태산", ele: 166, lat: 37.31099, lon: 126.8802785, osm: 10125280559 },
    { id: "gubongsan", name: "구봉산", ele: 158.1, lat: 37.1960989, lon: 126.7117398, osm: 4659373185 },
    { id: "cheongmyeongsan", name: "청명산", ele: 157.1, lat: 37.1755715, lon: 126.726269, osm: 5750034504 },
    { id: "choroksan", name: "초록산", ele: 150, lat: 37.08551, lon: 126.95616, osm: 10252771066 },
    { id: "cheondeungsan", name: "천등산", ele: 146, lat: 37.2477806, lon: 126.7105667, osm: 10252871983 },
    { id: "gochobong", name: "고초봉", ele: 143.9, lat: 37.1966795, lon: 126.8109948, osm: 5750036199 },
    { id: "haewoonsan", name: "해운산", ele: 143, lat: 37.1384687, lon: 126.7086206, osm: 5750036137 },
    { id: "gyemyeongsan", name: "계명산", ele: 140, lat: 37.2769543, lon: 126.6745694, osm: 9102241380 },
    { id: "yeochisan", name: "여치산", ele: 130.7, lat: 37.1969094, lon: 126.729619, osm: 4769607564 },
    { id: "haemangsan", name: "해망산", ele: 125.8, lat: 37.2543583, lon: 126.8346722, osm: 10252872065 },
    { id: "maebongsan", name: "매봉산", ele: 108.6, lat: 37.2186099, lon: 126.7444833, osm: 4741727534 },
    { id: "tapjaesan", name: "탑재산", ele: 67, lat: 37.1765427, lon: 126.6198479, osm: 7768446631 },
    { id: "hambaksan", name: "함박산", ele: 56.6, lat: 37.0441629, lon: 127.0328616, osm: 6721051092 },
    { id: "obongsan", name: "오봉산", ele: 68.5, lat: 37.0275642, lon: 126.9620077, osm: 7149134908 },
    { id: "samjeongdaesan", name: "삼정대산", ele: 73.2, lat: 37.0159586, lon: 126.9582251, osm: 7149134909 },
  ];

  if (!map || !window.L) {
    return;
  }

  const markerById = new Map();
  const layer = L.layerGroup();
  const highlight = L.layerGroup().addTo(map);
  const riskLegend = document.getElementById("wildfire-risk-legend");
  let mountainPanelContainer = null;

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .mountain-name-icon { background: transparent; border: 0; }
    .mountain-name-label {
      transform: translate(-50%, -50%);
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 8px;
      border: 2px solid rgba(47, 80, 53, .45);
      border-radius: 6px;
      color: #172317;
      background: rgba(255, 255, 255, .9);
      box-shadow: 0 2px 10px rgba(0, 0, 0, .25);
      font: 900 18px/1.15 "Segoe UI", "Malgun Gothic", Arial, sans-serif;
      white-space: nowrap;
      text-shadow: 0 1px 0 #fff;
    }
    .mountain-name-label small {
      color: #4f624f;
      font-size: 11px;
      font-weight: 800;
    }
    .mountain-panel {
      display: none;
      width: 176px;
      max-height: min(46vh, 360px);
      overflow: hidden;
      border: 1px solid rgba(20, 32, 22, .2);
      border-radius: 7px;
      background: rgba(255, 255, 255, .94);
      box-shadow: 0 8px 24px rgba(24, 36, 26, .18);
      font-family: "Segoe UI", "Malgun Gothic", Arial, sans-serif;
    }
    .mountain-panel strong {
      display: block;
      padding: 9px 10px;
      border-bottom: 1px solid #d9dfd5;
      font-size: 13px;
    }
    .mountain-panel-list {
      display: grid;
      gap: 3px;
      max-height: calc(min(46vh, 360px) - 40px);
      overflow: auto;
      padding: 7px;
    }
    .mountain-panel button {
      width: 100%;
      min-height: 28px;
      border: 1px solid transparent;
      border-radius: 5px;
      color: #1d251f;
      background: #f6f8f4;
      font-size: 12px;
      font-weight: 800;
      text-align: left;
      cursor: pointer;
    }
    .mountain-panel button:hover,
    .mountain-panel button.is-active {
      border-color: #2f6b47;
      background: #e7f1e8;
    }
  `;
  document.head.appendChild(styleEl);

  if (riskLegend) {
    riskLegend.style.display = "none";
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char];
    });
  }

  function popupHtml(mountain) {
    return `
      <table class="factory-priority-popup">
        <tr><th>산명</th><td>${escapeHtml(mountain.name)}</td></tr>
        <tr><th>고도</th><td>${mountain.ele.toLocaleString("ko-KR")}m</td></tr>
        <tr><th>좌표</th><td>${mountain.lat.toFixed(6)}, ${mountain.lon.toFixed(6)}</td></tr>
        <tr><th>출처</th><td>OpenStreetMap #${mountain.osm}</td></tr>
      </table>
    `;
  }

  function focusMountain(id) {
    const mountain = mountains.find((item) => item.id === id);
    const marker = markerById.get(id);
    if (!mountain || !marker) {
      return;
    }

    if (!map.hasLayer(layer)) {
      layer.addTo(map);
    }

    map.flyTo([mountain.lat, mountain.lon], Math.max(map.getZoom(), 14), {
      duration: 0.7,
    });
    marker.openPopup();

    highlight.clearLayers();
    L.circleMarker([mountain.lat, mountain.lon], {
      radius: 18,
      color: "#2f6b47",
      weight: 4,
      fill: false,
      opacity: 0.95,
    }).addTo(highlight);

    document
      .querySelectorAll(".mountain-panel button")
      .forEach((button) => button.classList.toggle("is-active", button.dataset.mountainId === id));
  }

  function setInfoPanelVisible(panel, visible) {
    if (panel === "risk" && riskLegend) {
      riskLegend.style.display = visible ? "" : "none";
    }

    if (panel === "mountains" && mountainPanelContainer) {
      mountainPanelContainer.style.display = visible ? "block" : "none";
    }
  }

  mountains.forEach((mountain) => {
    const marker = L.marker([mountain.lat, mountain.lon], {
      icon: L.divIcon({
        className: "mountain-name-icon",
        html: `<div class="mountain-name-label">${escapeHtml(mountain.name)} <small>${mountain.ele}m</small></div>`,
        iconSize: [1, 1],
        iconAnchor: [0, 0],
      }),
      title: mountain.name,
    });
    marker.bindPopup(popupHtml(mountain), { maxWidth: 280 });
    marker.addTo(layer);
    markerById.set(mountain.id, marker);
  });

  layer.addTo(map);

  if (layerControl && layerControl.addOverlay) {
    layerControl.addOverlay(layer, "산 이름 마커");
  }

  const panel = L.control({ position: "topleft" });
  panel.onAdd = function () {
    const container = L.DomUtil.create("div", "mountain-panel");
    mountainPanelContainer = container;
    container.innerHTML = `
      <strong>산 모음</strong>
      <div class="mountain-panel-list">
        ${mountains
          .map(
            (mountain) =>
              `<button type="button" data-mountain-id="${mountain.id}">${escapeHtml(mountain.name)} · ${mountain.ele}m</button>`
          )
          .join("")}
      </div>
    `;

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    container.addEventListener("click", (event) => {
      const button = event.target.closest("[data-mountain-id]");
      if (button) {
        focusMountain(button.dataset.mountainId);
      }
    });
    return container;
  };
  panel.addTo(map);

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "dream:fly-to-mountain") {
      focusMountain(message.id);
    } else if (message.type === "dream:set-info-panel") {
      setInfoPanelVisible(message.panel, !!message.visible);
    }
  });

  window.dreamMountainLayer = {
    mountains,
    focusMountain,
    setInfoPanelVisible,
    layer,
  };
})();
