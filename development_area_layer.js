// Development area outline from four manually selected corner coordinates.
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

  if (!map || !window.L) {
    return;
  }

  const manualCorners = [
    { key: "leftTop", label: "수동 좌측 상단", lat: 37.22528, lon: 126.79527 },
    { key: "rightTop", label: "수동 우측 상단", lat: 37.23634, lon: 126.98783 },
    { key: "rightBottom", label: "수동 우측 하단", lat: 37.14189, lon: 127.00671 },
    { key: "leftBottom", label: "수동 좌측 하단", lat: 37.14011, lon: 126.82444 },
  ];

  const adjustedCorners = [
    { key: "leftTop", label: "보정 좌측 상단", lat: 37.23682115, lon: 126.7942128 },
    { key: "rightTop", label: "보정 우측 상단", lat: 37.23682115, lon: 127.0077672 },
    { key: "rightBottom", label: "보정 우측 하단", lat: 37.13962885, lon: 127.0077672 },
    { key: "leftBottom", label: "보정 좌측 하단", lat: 37.13962885, lon: 126.7942128 },
  ];

  const center = { lat: 37.188225, lon: 126.90099 };
  const dimensions = {
    widthMeters: 18917.5,
    heightMeters: 10807.3,
    rotationDegrees: 0,
  };

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .development-area-label {
      border: 2px solid rgba(185, 28, 28, .45);
      border-radius: 5px;
      color: #7f1d1d;
      background: rgba(255, 255, 255, .92);
      box-shadow: 0 2px 8px rgba(0, 0, 0, .2);
      font: 900 13px/1.15 "Segoe UI", "Malgun Gothic", Arial, sans-serif;
      padding: 4px 8px;
      white-space: nowrap;
    }
    .development-area-popup table {
      border-collapse: collapse;
      font: 12px/1.35 "Segoe UI", "Malgun Gothic", Arial, sans-serif;
    }
    .development-area-popup th {
      padding: 3px 8px 3px 0;
      color: #7f1d1d;
      text-align: left;
      white-space: nowrap;
    }
    .development-area-popup td {
      padding: 3px 0;
    }
  `;
  document.head.appendChild(styleEl);

  function formatCoord(point) {
    return `${point.lat.toFixed(8)}, ${point.lon.toFixed(8)}`;
  }

  function popupHtml() {
    const rows = [
      ["중심", formatCoord(center)],
      ["폭", `${dimensions.widthMeters.toLocaleString("ko-KR")}m`],
      ["높이", `${dimensions.heightMeters.toLocaleString("ko-KR")}m`],
      ["회전", `${dimensions.rotationDegrees.toFixed(4)}도`],
      ["좌측 상단", formatCoord(adjustedCorners[0])],
      ["우측 상단", formatCoord(adjustedCorners[1])],
      ["우측 하단", formatCoord(adjustedCorners[2])],
      ["좌측 하단", formatCoord(adjustedCorners[3])],
    ]
      .map((row) => `<tr><th>${row[0]}</th><td>${row[1]}</td></tr>`)
      .join("");
    return `<div class="development-area-popup"><table>${rows}</table></div>`;
  }

  const layer = L.layerGroup();
  const outline = L.polygon(
    adjustedCorners.map((point) => [point.lat, point.lon]),
    {
      color: "#dc2626",
      weight: 4,
      opacity: 0.95,
      fillColor: "#ef4444",
      fillOpacity: 0.04,
      dashArray: "10 7",
      interactive: true,
    }
  )
    .bindTooltip("개발 구역", {
      permanent: true,
      direction: "center",
      className: "development-area-label",
    })
    .bindPopup(popupHtml(), { maxWidth: 360 })
    .addTo(layer);

  L.circleMarker([center.lat, center.lon], {
    radius: 5,
    color: "#991b1b",
    weight: 2,
    fillColor: "#ffffff",
    fillOpacity: 1,
  })
    .bindTooltip("개발 구역 중심", { sticky: true })
    .addTo(layer);

  layer.addTo(map);
  if (outline.bringToFront) {
    outline.bringToFront();
  }

  if (layerControl && layerControl.addOverlay) {
    layerControl.addOverlay(layer, "개발 구역 테두리");
  }

  window.dreamDevelopmentAreaLayer = {
    layer,
    outline,
    manualCorners,
    adjustedCorners,
    center,
    dimensions,
  };
})();
