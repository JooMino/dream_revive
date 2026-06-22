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

  const fallbackMountains = [
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
  const database = window.dreamMountainMarkerDatabase || {};
  const mountains = Array.isArray(database.mountains) ? database.mountains : fallbackMountains;
  const EDIT_STORAGE_KEY = "dreamMountainMarkerEdits";

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
      font-size: var(--mountain-label-size, 18px);
    }
    .mountain-name-label small {
      color: #4f624f;
      font-size: var(--mountain-label-meta-size, 11px);
      font-weight: 800;
    }
    .mountain-name-label.is-range {
      padding: 2px 5px;
      border-width: 1px;
      border-color: rgba(39, 74, 54, .32);
      color: #274a36;
      background: rgba(242, 247, 240, .82);
      box-shadow: 0 1px 5px rgba(0, 0, 0, .16);
      font-weight: 800;
    }
    .mountain-name-label.is-range small {
      color: #5c715f;
    }
    .mountain-name-hidden-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      border: 2px solid rgba(47, 80, 53, .65);
      background: rgba(255, 255, 255, .72);
      box-shadow: 0 1px 5px rgba(0, 0, 0, .22);
    }
    .mountain-marker-popup table {
      border-collapse: collapse;
      font: 12px/1.35 "Segoe UI", "Malgun Gothic", Arial, sans-serif;
    }
    .mountain-marker-popup th {
      padding: 3px 8px 3px 0;
      color: #2f5d3a;
      text-align: left;
      white-space: nowrap;
    }
    .mountain-marker-popup td { padding: 3px 0; }
    .mountain-marker-action {
      min-height: 24px;
      margin: 0 4px 0 0;
      border: 1px solid #b6c7b6;
      border-radius: 5px;
      background: #f8faf7;
      color: #233323;
      font: 800 11px/1 "Segoe UI", "Malgun Gothic", Arial, sans-serif;
      cursor: pointer;
    }
    .mountain-marker-action.primary {
      border-color: #2f6b47;
      background: #e7f1e8;
    }
    .mountain-marker-action.danger {
      border-color: #d6a3a3;
      background: #fff5f5;
      color: #8b1f1f;
    }
    .mountain-marker-editor {
      display: grid;
      grid-template-columns: minmax(70px, auto) minmax(120px, 1fr);
      gap: 6px;
      align-items: center;
      min-width: 260px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #dce5d8;
    }
    .mountain-marker-editor label {
      margin: 0;
      color: #39543f;
      font-weight: 800;
    }
    .mountain-marker-editor input,
    .mountain-marker-editor select {
      min-height: 26px;
      border: 1px solid #cbd5c5;
      border-radius: 5px;
      padding: 3px 6px;
      font: 12px "Segoe UI", "Malgun Gothic", Arial, sans-serif;
    }
    .mountain-marker-editor-actions {
      grid-column: 1 / -1;
      display: flex;
      gap: 5px;
      justify-content: flex-end;
      padding-top: 3px;
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

  function loadMarkerEdits() {
    try {
      const raw = window.localStorage && window.localStorage.getItem(EDIT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function saveMarkerEdits() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(markerEdits));
      }
    } catch (error) {
      // Runtime edits still apply during the current session.
    }
  }

  const markerEdits = loadMarkerEdits();

  function applySavedEdit(mountain) {
    mountain.baseName = mountain.baseName || mountain.name;
    const edit = markerEdits[mountain.id];
    if (!edit) {
      return;
    }
    if (edit.name) {
      mountain.name = edit.name;
    }
    if (edit.sizeTag) {
      mountain.sizeTag = edit.sizeTag;
    }
    if (typeof edit.labelVisible === "boolean") {
      mountain.labelVisible = edit.labelVisible;
    }
  }

  mountains.forEach(applySavedEdit);

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

  function escapeJsString(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
  }

  function actionAttr(action, mountain) {
    return `onclick="window.dreamMountainMarkerActions.${action}('${escapeJsString(mountain.id)}')"`;
  }

  function popupHtml(mountain) {
    const elevation = Number(mountain.ele);
    const elevationText = Number.isFinite(elevation) ? `${elevation.toLocaleString("ko-KR")}m` : "";
    const representativeLat = Number(mountain.representativeLat ?? mountain.lat);
    const representativeLon = Number(mountain.representativeLon ?? mountain.lon);
    const peakLat = Number(mountain.peakLat);
    const peakLon = Number(mountain.peakLon);
    const rows = [
      [
        "이름",
        mountain.name,
      ],
      ["라벨", mountain.labelVisible === false ? "숨김" : "표시"],
      ["크기", mountain.sizeTag || ""],
      ["고도", elevationText],
      ["면적", mountain.areaLabel || ""],
      [
        "대표 좌표",
        Number.isFinite(representativeLat) && Number.isFinite(representativeLon)
          ? `${representativeLat.toFixed(7)}, ${representativeLon.toFixed(7)}`
          : "",
      ],
      [
        "정상 좌표",
        Number.isFinite(peakLat) && Number.isFinite(peakLon)
          ? `${peakLat.toFixed(7)}, ${peakLon.toFixed(7)}`
          : "",
      ],
      ["분류", mountain.category || mountain.sourceLabel || ""],
      ["OSM ID", mountain.osmId || ""],
      ["정상 OSM ID", mountain.peakOsmId || mountain.osm || ""],
      ["출처", mountain.source || "OpenStreetMap"],
    ].filter(([, value]) => value !== "" && value !== null && value !== undefined);

    return `
      <div class="mountain-marker-popup">
      <table>
        ${rows
          .map(
            ([key, value, isHtml]) =>
              `<tr><th>${escapeHtml(key)}</th><td>${isHtml ? value : escapeHtml(value)}</td></tr>`
          )
          .join("")}
        <tr><th>작업</th><td>${
          mountain.labelVisible === false
            ? `<button class="mountain-marker-action primary" type="button" data-mountain-show="true" ${actionAttr("show", mountain)}>라벨 표시</button>`
            : `<button class="mountain-marker-action danger" type="button" data-mountain-hide="true" ${actionAttr("hide", mountain)}>라벨 숨김</button>`
        }</td></tr>
      </table>
      ${editorFormHtml(mountain)}
      </div>
    `;
  }

  function editorFormHtml(mountain) {
    const sizeTags = ["대형", "중형", "소형", "초소형", "산정상"];
    const currentSize = mountain.sizeTag || "";
    return `
      <div class="mountain-marker-editor">
        <label for="mountain-marker-name-${escapeHtml(mountain.id)}">이름</label>
        <input id="mountain-marker-name-${escapeHtml(mountain.id)}" type="text" value="${escapeHtml(mountain.name)}" data-mountain-name-input="true">
        <label for="mountain-marker-size-${escapeHtml(mountain.id)}">크기</label>
        <select id="mountain-marker-size-${escapeHtml(mountain.id)}" data-mountain-size-select="true">
          ${sizeTags
            .map((tag) => `<option value="${tag}" ${tag === currentSize ? "selected" : ""}>${tag}</option>`)
            .join("")}
        </select>
        <label for="mountain-marker-label-${escapeHtml(mountain.id)}">라벨</label>
        <select id="mountain-marker-label-${escapeHtml(mountain.id)}" data-mountain-label-select="true">
          <option value="show" ${mountain.labelVisible === false ? "" : "selected"}>표시</option>
          <option value="hide" ${mountain.labelVisible === false ? "selected" : ""}>숨김</option>
        </select>
        <div class="mountain-marker-editor-actions">
          <button class="mountain-marker-action primary" type="button" data-mountain-save="true" ${actionAttr("save", mountain)}>저장</button>
          <button class="mountain-marker-action" type="button" data-mountain-cancel="true" ${actionAttr("cancel", mountain)}>취소</button>
        </div>
      </div>
    `;
  }

  function editHtml(mountain) {
    return `
      <div class="mountain-marker-popup">
        ${editorFormHtml(mountain)}
      </div>
    `;
  }

  function markerMetaText(mountain) {
    const elevation = Number(mountain.ele);
    if (Number.isFinite(elevation)) {
      return `${elevation.toLocaleString("ko-KR")}m`;
    }
    return mountain.sizeTag || (mountain.generated ? "무명" : "산림");
  }

  function listMetaText(mountain) {
    const elevation = Number(mountain.ele);
    if (Number.isFinite(elevation)) {
      return `${elevation.toLocaleString("ko-KR")}m`;
    }
    return mountain.sizeTag || mountain.sourceLabel || "산림 범위";
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function areaScale(mountain) {
    const area = Number(mountain.areaSqm);
    if (!Number.isFinite(area) || area <= 0) {
      return 0;
    }
    const minArea = 1_000;
    const maxArea = 7_000_000;
    return clamp(
      (Math.log10(area) - Math.log10(minArea)) / (Math.log10(maxArea) - Math.log10(minArea)),
      0,
      1
    );
  }

  function labelSizeStyle(mountain) {
    const scale = areaScale(mountain);
    const labelSize = mountain.generated ? 10.5 + scale * 2 : 16.5 + scale * 2;
    const metaSize = mountain.generated ? 8.5 + scale : 10 + scale;
    return `--mountain-label-size:${labelSize.toFixed(1)}px;--mountain-label-meta-size:${metaSize.toFixed(1)}px;`;
  }

  function markerHtml(mountain) {
    if (mountain.labelVisible === false) {
      return `<div class="mountain-name-hidden-dot" title="${escapeHtml(mountain.name)}"></div>`;
    }
    const labelClass = mountain.generated ? "mountain-name-label is-range" : "mountain-name-label";
    return `<div class="${labelClass}" style="${labelSizeStyle(mountain)}">${escapeHtml(mountain.name)} <small>${escapeHtml(markerMetaText(mountain))}</small></div>`;
  }

  function markerIcon(mountain) {
    return L.divIcon({
      className: "mountain-name-icon",
      html: markerHtml(mountain),
      iconSize: [1, 1],
      iconAnchor: [0, 0],
    });
  }

  function updatePanelButton(mountain) {
    if (!mountainPanelContainer) {
      return;
    }
    const button = Array.from(mountainPanelContainer.querySelectorAll("[data-mountain-id]")).find(
      (item) => item.dataset.mountainId === mountain.id
    );
    if (button) {
      button.textContent = `${mountain.name} · ${listMetaText(mountain)}`;
    }
  }

  function refreshMarker(mountain) {
    const marker = markerById.get(mountain.id);
    if (!marker) {
      return;
    }
    marker.setIcon(markerIcon(mountain));
    marker.setPopupContent(popupHtml(mountain));
    marker.options.title = mountain.name;
    updatePanelButton(mountain);
    if (marker.isPopupOpen && marker.isPopupOpen()) {
      window.setTimeout(function () {
        bindPopupContentActions(mountain);
      }, 0);
    }
  }

  function saveMountainEdit(mountain, values) {
    Object.assign(mountain, values);
    markerEdits[mountain.id] = {
      name: mountain.name,
      sizeTag: mountain.sizeTag,
      labelVisible: mountain.labelVisible !== false,
    };
    saveMarkerEdits();
    refreshMarker(mountain);
  }

  function openMarkerEditor(mountain) {
    const marker = markerById.get(mountain.id);
    if (!marker) {
      return;
    }
    marker.setPopupContent(editHtml(mountain));
    window.setTimeout(function () {
      bindPopupContentActions(mountain);
      const input = document.querySelector(".leaflet-popup [data-mountain-name-input]");
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  function saveOpenEditor(mountain) {
    const popupElement = document.querySelector(".leaflet-popup .mountain-marker-popup");
    if (!popupElement) {
      return;
    }
    const input = popupElement.querySelector("[data-mountain-name-input]");
    const sizeSelect = popupElement.querySelector("[data-mountain-size-select]");
    const labelSelect = popupElement.querySelector("[data-mountain-label-select]");
    const nextName = input ? input.value.trim() : "";
    if (!nextName) {
      if (input) input.focus();
      return;
    }

    saveMountainEdit(mountain, {
      name: nextName,
      sizeTag: sizeSelect ? sizeSelect.value : mountain.sizeTag,
      labelVisible: labelSelect ? labelSelect.value !== "hide" : mountain.labelVisible !== false,
    });
  }

  function bindPopupContentActions(mountain) {
    const popupElement = document.querySelector(".leaflet-popup .mountain-marker-popup");
    if (!popupElement || popupElement.dataset.mountainMarkerEditorBound === mountain.id) {
      return;
    }
    popupElement.dataset.mountainMarkerEditorBound = mountain.id;
    popupElement.addEventListener("click", function (clickEvent) {
      if (clickEvent.target.closest("[data-mountain-edit]")) {
        clickEvent.preventDefault();
        openMarkerEditor(mountain);
      } else if (clickEvent.target.closest("[data-mountain-save]")) {
        clickEvent.preventDefault();
        saveOpenEditor(mountain);
      } else if (clickEvent.target.closest("[data-mountain-cancel]")) {
        clickEvent.preventDefault();
        refreshMarker(mountain);
      } else if (clickEvent.target.closest("[data-mountain-hide]")) {
        clickEvent.preventDefault();
        saveMountainEdit(mountain, { labelVisible: false });
      } else if (clickEvent.target.closest("[data-mountain-show]")) {
        clickEvent.preventDefault();
        saveMountainEdit(mountain, { labelVisible: true });
      }
    });
    popupElement.addEventListener("keydown", function (keyEvent) {
      if (keyEvent.key === "Enter" && keyEvent.target.closest("[data-mountain-name-input]")) {
        keyEvent.preventDefault();
        saveOpenEditor(mountain);
      } else if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        refreshMarker(mountain);
      }
    });
  }

  function bindMarkerEditor(mountain, marker) {
    marker.on("popupopen", function () {
      window.setTimeout(function () {
        bindPopupContentActions(mountain);
      }, 0);
    });
  }

  function findMountain(id) {
    return mountains.find((item) => item.id === id);
  }

  window.dreamMountainMarkerActions = {
    edit(id) {
      const mountain = findMountain(id);
      if (mountain) {
        openMarkerEditor(mountain);
      }
    },
    save(id) {
      const mountain = findMountain(id);
      if (mountain) {
        saveOpenEditor(mountain);
      }
    },
    cancel(id) {
      const mountain = findMountain(id);
      if (mountain) {
        refreshMarker(mountain);
      }
    },
    hide(id) {
      const mountain = findMountain(id);
      if (mountain) {
        saveMountainEdit(mountain, { labelVisible: false });
      }
    },
    show(id) {
      const mountain = findMountain(id);
      if (mountain) {
        saveMountainEdit(mountain, { labelVisible: true });
      }
    },
  };

  function focusMountain(id) {
    const mountain = findMountain(id);
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
      icon: markerIcon(mountain),
      title: mountain.name,
    });
    marker.bindPopup(popupHtml(mountain), { maxWidth: 320 });
    bindMarkerEditor(mountain, marker);
    marker.addTo(layer);
    markerById.set(mountain.id, marker);
  });

  layer.addTo(map);

  if (layerControl && layerControl.addOverlay) {
    layerControl.addOverlay(layer, "산이름 마커");
  }

  const panel = L.control({ position: "topleft" });
  panel.onAdd = function () {
    const container = L.DomUtil.create("div", "mountain-panel");
    mountainPanelContainer = container;
    container.innerHTML = `
      <strong>산 모음 ${mountains.length.toLocaleString("ko-KR")}</strong>
      <div class="mountain-panel-list">
        ${mountains
          .map(
            (mountain) =>
              `<button type="button" data-mountain-id="${mountain.id}">${escapeHtml(mountain.name)} · ${escapeHtml(listMetaText(mountain))}</button>`
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
    database,
    markerEdits,
    focusMountain,
    setInfoPanelVisible,
    layer,
  };
})();

