(function () {
  "use strict";

  const config = window.dreamFactoryPriorityConfig || {};
  const map = config.map;
  const layerControl = config.layerControl;
  const data = window.dreamFireRiskForecastData;
  if (!map || !window.L || !data || !data.area || !data.area.bounds) return;

  const records = Array.isArray(data.records) ? data.records : [];
  const summary = data.summary || {};
  const boundsConfig = data.area.bounds;
  const bounds = L.latLngBounds(
    [boundsConfig.south, boundsConfig.west],
    [boundsConfig.north, boundsConfig.east]
  );

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function numberText(value, digits) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return number.toLocaleString("ko-KR", {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0
    });
  }

  function scoreColor(score) {
    const value = Number(score);
    if (!Number.isFinite(value)) return "#64748b";
    if (value >= 86) return "#991b1b";
    if (value >= 66) return "#dc2626";
    if (value >= 51) return "#f97316";
    return "#2563eb";
  }

  function scoreFill(score) {
    const value = Number(score);
    if (!Number.isFinite(value)) return "#94a3b8";
    if (value >= 86) return "#ef4444";
    if (value >= 66) return "#fb7185";
    if (value >= 51) return "#fdba74";
    return "#60a5fa";
  }

  function formatAnaldate(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length < 8) return String(value || "");
    const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    if (digits.length >= 10) return `${date} ${digits.slice(8, 10)}시`;
    return date;
  }

  function popupHtml() {
    const rows = [
      ["대상", `${data.area.name || "화성시"} (${data.area.sigungu_code || ""})`],
      ["기준일", data.targetDate || "-"],
      ["최대지수", numberText(summary.maxScore, 1)],
      ["평균지수", numberText(summary.meanScore, 1)],
      ["위험등급", summary.riskLabel || "정보 없음"],
      ["데이터 수", `${numberText(records.length, 0)}건`],
      ["출처", data.source || ""]
    ];

    const timeline = records
      .map(function (item) {
        return `
          <tr>
            <td>${escapeHtml(formatAnaldate(item.analdate))}</td>
            <td>${escapeHtml(numberText(item.maxi, 1))}</td>
            <td>${escapeHtml(numberText(item.meanavg, 1))}</td>
            <td>${escapeHtml(numberText(item.d4, 1))}</td>
          </tr>`;
      })
      .join("");

    return `
      <div class="fire-risk-forecast-popup">
        <table class="fire-risk-forecast-summary">
          ${rows
            .filter(([, value]) => value !== "")
            .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`)
            .join("")}
        </table>
        ${
          records.length
            ? `<table class="fire-risk-forecast-timeline">
                <thead><tr><th>시간</th><th>최대</th><th>평균</th><th>매우높음</th></tr></thead>
                <tbody>${timeline}</tbody>
              </table>`
            : `<p class="fire-risk-forecast-empty">아직 생성된 예보 데이터가 없습니다.</p>`
        }
      </div>`;
  }

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .fire-risk-forecast-popup {
      min-width: 260px;
      max-width: 360px;
      color: #1f2937;
      font: 12px/1.35 "Segoe UI", "Malgun Gothic", Arial, sans-serif;
    }
    .fire-risk-forecast-summary,
    .fire-risk-forecast-timeline {
      width: 100%;
      border-collapse: collapse;
    }
    .fire-risk-forecast-summary th,
    .fire-risk-forecast-summary td,
    .fire-risk-forecast-timeline th,
    .fire-risk-forecast-timeline td {
      padding: 4px 7px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
      white-space: nowrap;
    }
    .fire-risk-forecast-summary th,
    .fire-risk-forecast-timeline th {
      color: #4b5563;
      font-weight: 800;
    }
    .fire-risk-forecast-timeline {
      margin-top: 8px;
      font-variant-numeric: tabular-nums;
    }
    .fire-risk-forecast-empty {
      margin: 8px 0 0;
      color: #6b7280;
      font-weight: 700;
    }
    .fire-risk-forecast-label {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 6px;
      border: 1px solid rgba(127, 29, 29, .2);
      border-radius: 5px;
      color: #111827;
      background: rgba(255, 255, 255, .92);
      box-shadow: 0 1px 6px rgba(0, 0, 0, .22);
      font: 800 12px/1.1 "Segoe UI", "Malgun Gothic", Arial, sans-serif;
      white-space: nowrap;
    }
    .fire-risk-forecast-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--fire-risk-color, #64748b);
    }
  `;
  document.head.appendChild(styleEl);

  const color = scoreColor(summary.maxScore);
  const fillColor = scoreFill(summary.maxScore);
  const layer = L.layerGroup();

  const rectangle = L.rectangle(bounds, {
    color,
    weight: 2,
    opacity: 0.9,
    fillColor,
    fillOpacity: records.length ? 0.24 : 0.08,
    dashArray: "8 6"
  });
  rectangle.bindPopup(popupHtml(), { maxWidth: 420 });
  rectangle.bindTooltip(
    `${data.area.name || "화성시"} 산불위험예보: ${summary.riskLabel || "정보 없음"} (${numberText(summary.maxScore, 1)})`,
    { sticky: true }
  );
  rectangle.addTo(layer);

  if (records.length) {
    const center = bounds.getCenter();
    const label = L.marker(center, {
      interactive: true,
      icon: L.divIcon({
        className: "fire-risk-forecast-label-wrap",
        html: `<span class="fire-risk-forecast-label" style="--fire-risk-color:${color}"><i class="fire-risk-forecast-dot"></i>${escapeHtml(summary.riskLabel || "정보 없음")} ${escapeHtml(numberText(summary.maxScore, 1))}</span>`,
        iconSize: [1, 1],
        iconAnchor: [0, 0]
      })
    });
    label.bindPopup(popupHtml(), { maxWidth: 420 });
    label.addTo(layer);
  }

  if (layerControl && layerControl.addOverlay) {
    layerControl.addOverlay(
      layer,
      `<span class="fire-risk-forecast-label"><i class="fire-risk-forecast-dot" style="background:${color}"></i>산불위험예보 ${escapeHtml(data.area.name || "화성시")}</span>`
    );
  }

  window.dreamFireRiskForecastLayer = { layer, data };
})();
