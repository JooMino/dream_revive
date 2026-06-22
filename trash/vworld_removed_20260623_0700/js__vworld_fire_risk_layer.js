(function () {
  "use strict";

  const config = window.dreamFactoryPriorityConfig || {};
  const map = config.map;
  const layerControl = config.layerControl;
  const data = window.dreamVworldFireRiskData;
  const featureCollection = data && data.featureCollection;
  if (!map || !window.L || !featureCollection || !Array.isArray(featureCollection.features)) return;

  let activeHour = "12";
  const displayDate =
    data.fallbackDate || (featureCollection.features[0] && featureCollection.features[0].properties.ymd) || "";
  const requestedDateMissing = data.requestedDate && data.requestedDateStatus === "NOT_FOUND";

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .vworld-fire-risk-popup {
      min-width: 230px;
      color: #1f2937;
      font: 12px/1.4 "Segoe UI", "Malgun Gothic", Arial, sans-serif;
    }
    .vworld-fire-risk-popup table {
      width: 100%;
      border-collapse: collapse;
    }
    .vworld-fire-risk-popup th,
    .vworld-fire-risk-popup td {
      padding: 4px 7px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
      white-space: nowrap;
    }
    .vworld-fire-risk-popup th {
      color: #4b5563;
      font-weight: 800;
    }
    .vworld-fire-risk-control,
    .vworld-fire-risk-legend {
      background: rgba(255, 255, 255, .94);
      border: 1px solid rgba(15, 23, 42, .18);
      border-radius: 6px;
      box-shadow: 0 2px 10px rgba(15, 23, 42, .16);
      color: #172033;
      font: 12px/1.3 "Segoe UI", "Malgun Gothic", Arial, sans-serif;
    }
    .vworld-fire-risk-control {
      padding: 8px;
    }
    .vworld-fire-risk-control strong,
    .vworld-fire-risk-legend strong {
      display: block;
      margin-bottom: 6px;
      font-size: 12px;
    }
    .vworld-fire-risk-hours {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
    }
    .vworld-fire-risk-hour {
      min-width: 40px;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      background: #fff;
      color: #172033;
      padding: 4px 6px;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .vworld-fire-risk-hour[aria-pressed="true"] {
      border-color: #b91c1c;
      background: #fee2e2;
      color: #7f1d1d;
    }
    .vworld-fire-risk-legend {
      padding: 9px 10px;
    }
    .vworld-fire-risk-legend-row {
      display: flex;
      align-items: center;
      gap: 7px;
      margin: 3px 0;
      white-space: nowrap;
    }
    .vworld-fire-risk-swatch {
      display: inline-block;
      width: 14px;
      height: 10px;
      border: 1px solid rgba(15, 23, 42, .22);
      border-radius: 2px;
    }
    .vworld-fire-risk-layer-label {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .vworld-fire-risk-layer-swatch {
      display: inline-block;
      width: 14px;
      height: 10px;
      border-radius: 2px;
      background: #ef4444;
      border: 1px solid rgba(127, 29, 29, .3);
    }
  `;
  document.head.appendChild(styleEl);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function valueFor(properties, hour) {
    const number = Number(properties && properties[`value${hour}h`]);
    return Number.isFinite(number) ? number : null;
  }

  function gradeLabel(value) {
    if (value === null || value <= 0) return "자료 없음";
    if (value >= 71) return "매우 높음";
    if (value >= 51) return "높음";
    if (value >= 31) return "보통";
    return "낮음";
  }

  function riskColor(value) {
    if (value === null || value <= 0) return "#94a3b8";
    if (value >= 71) return "#991b1b";
    if (value >= 51) return "#dc2626";
    if (value >= 31) return "#f97316";
    return "#2563eb";
  }

  function fillColor(value) {
    if (value === null || value <= 0) return "#cbd5e1";
    if (value >= 71) return "#ef4444";
    if (value >= 51) return "#fb7185";
    if (value >= 31) return "#fdba74";
    return "#60a5fa";
  }

  function styleFeature(feature) {
    const value = valueFor(feature.properties || {}, activeHour);
    return {
      color: riskColor(value),
      weight: 2,
      opacity: 0.9,
      fillColor: fillColor(value),
      fillOpacity: value && value > 0 ? 0.38 : 0.12
    };
  }

  function formatDate(value) {
    const text = String(value || "");
    if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    return text || "-";
  }

  function popupHtml(properties) {
    const rows = [
      ["기준일", formatDate(properties.ymd)],
      ["09시", `${properties.value09h || "-"} (${gradeLabel(valueFor(properties, "09"))})`],
      ["12시", `${properties.value12h || "-"} (${gradeLabel(valueFor(properties, "12"))})`],
      ["15시", `${properties.value15h || "-"} (${gradeLabel(valueFor(properties, "15"))})`],
      ["18시", `${properties.value18h || "-"} (${gradeLabel(valueFor(properties, "18"))})`]
    ];

    return `
      <div class="vworld-fire-risk-popup">
        <table>
          ${rows.map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}
        </table>
      </div>`;
  }

  const layer = L.geoJSON(featureCollection, {
    style: styleFeature,
    onEachFeature: function (feature, featureLayer) {
      const properties = feature.properties || {};
      featureLayer.bindPopup(popupHtml(properties), { maxWidth: 360 });
      featureLayer.bindTooltip(
        `${formatDate(properties.ymd)} ${activeHour}시 산불위험 ${properties[`value${activeHour}h`] || "-"}점`,
        { sticky: true }
      );
    }
  });

  const hourControl = L.control({ position: "topright" });
  hourControl.onAdd = function () {
    const container = L.DomUtil.create("div", "vworld-fire-risk-control");
    container.innerHTML = `
      <strong>VWorld 산불위험</strong>
      <div style="margin:-2px 0 6px;color:#64748b;font-weight:700;">${requestedDateMissing ? "2025-01-01 자료 없음 · " : ""}${formatDate(displayDate)}</div>
      <div class="vworld-fire-risk-hours">
        ${["09", "12", "15", "18"].map((hour) => `<button class="vworld-fire-risk-hour" type="button" data-hour="${hour}" aria-pressed="${hour === activeHour}">${hour}시</button>`).join("")}
      </div>`;
    L.DomEvent.disableClickPropagation(container);
    container.querySelectorAll("[data-hour]").forEach(function (button) {
      button.addEventListener("click", function () {
        activeHour = button.dataset.hour;
        container.querySelectorAll("[data-hour]").forEach(function (item) {
          item.setAttribute("aria-pressed", String(item.dataset.hour === activeHour));
        });
        layer.setStyle(styleFeature);
        layer.eachLayer(function (featureLayer) {
          const properties = (featureLayer.feature && featureLayer.feature.properties) || {};
          featureLayer.setTooltipContent(
            `${formatDate(properties.ymd)} ${activeHour}시 산불위험 ${properties[`value${activeHour}h`] || "-"}점`
          );
        });
      });
    });
    return container;
  };

  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = function () {
    const container = L.DomUtil.create("div", "vworld-fire-risk-legend");
    container.innerHTML = `
      <strong>상세 산림 범위 위험값</strong>
      <div class="vworld-fire-risk-legend-row"><span class="vworld-fire-risk-swatch" style="background:#ef4444"></span>71+ 매우 높음</div>
      <div class="vworld-fire-risk-legend-row"><span class="vworld-fire-risk-swatch" style="background:#fb7185"></span>51-70 높음</div>
      <div class="vworld-fire-risk-legend-row"><span class="vworld-fire-risk-swatch" style="background:#fdba74"></span>31-50 보통</div>
      <div class="vworld-fire-risk-legend-row"><span class="vworld-fire-risk-swatch" style="background:#60a5fa"></span>1-30 낮음</div>
      <div class="vworld-fire-risk-legend-row"><span class="vworld-fire-risk-swatch" style="background:#cbd5e1"></span>0 자료 없음</div>`;
    return container;
  };

  if (layerControl && layerControl.addOverlay) {
    layerControl.addOverlay(
      layer,
      '<span class="vworld-fire-risk-layer-label"><span class="vworld-fire-risk-layer-swatch"></span>VWorld 산불위험 상세 산림 범위</span>'
    );
  }

  layer.addTo(map);
  hourControl.addTo(map);
  legend.addTo(map);

  map.on("overlayadd", function (event) {
    if (event.layer !== layer) return;
    if (!map.hasLayer(layer)) return;
    hourControl.addTo(map);
    legend.addTo(map);
  });

  map.on("overlayremove", function (event) {
    if (event.layer !== layer) return;
    hourControl.remove();
    legend.remove();
  });

  window.dreamVworldFireRiskLayer = { layer, hourControl, legend, data };
})();
