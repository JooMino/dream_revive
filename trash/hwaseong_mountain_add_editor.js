// Minimal manual mountain point editor for Hwaseong map additions.
(function () {
  "use strict";

  const HWASEONG_BOUNDS = [
    [37.00854637343054, 126.51566081086993],
    [37.31862926160805, 127.18135975429367]
  ];
  const STORAGE_KEY = "dream.hwaseong.manualMountains.v2";
  const existingMountains = [
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
  ].sort((a, b) => b.ele - a.ele);

  const existingCountEl = document.getElementById("existing-mountain-count");
  const countEl = document.getElementById("mountain-count");
  const coordEl = document.getElementById("selected-coord");
  const statusEl = document.getElementById("status");
  const existingListEl = document.getElementById("existing-mountain-list");
  const listEl = document.getElementById("mountain-list");
  const exportBtn = document.getElementById("export-btn");
  const clearBtn = document.getElementById("clear-btn");
  const importInput = document.getElementById("import-input");

  if (!window.L) {
    statusEl.textContent = "지도 라이브러리를 불러오지 못했습니다";
    return;
  }

  const mountains = [];
  const existingMarkerById = new Map();
  const markerById = new Map();
  let sequence = 1;
  let selectedExistingId = null;
  let selectedId = null;
  let draftMarker = null;

  const map = L.map("map", {
    preferCanvas: true,
    zoomControl: true
  });

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  const hwaseongBounds = L.latLngBounds(HWASEONG_BOUNDS);
  map.setMaxBounds(hwaseongBounds);
  map.fitBounds(hwaseongBounds.pad(0.02));
  map.options.maxBoundsViscosity = 1.0;
  map.whenReady(() => {
    const minZoom = map.getBoundsZoom(hwaseongBounds, true);
    map.setMinZoom(minZoom);
  });

  const existingMountainLayer = L.layerGroup().addTo(map);
  const mountainLayer = L.layerGroup().addTo(map);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function formatNumber(value, digits = 6) {
    return Number(value).toFixed(digits);
  }

  function formatElevation(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
  }

  function parseElevation(value) {
    const cleaned = String(value || "").replace(/,/g, "").trim();
    const number = Number(cleaned);
    return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
  }

  function normalizeName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function makeId() {
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0")
    ].join("");
    return `manual_mountain_${stamp}_${String(sequence++).padStart(3, "0")}`;
  }

  function uniqueId(id) {
    let candidate = id || makeId();
    let suffix = 2;
    while (mountains.some((mountain) => mountain.id === candidate)) {
      candidate = `${id || "manual_mountain"}_${suffix++}`;
    }
    return candidate;
  }

  function createIcon(mountain) {
    const elevation = formatElevation(mountain.ele);
    return L.divIcon({
      className: "manual-mountain-icon",
      html: `<div class="manual-mountain-label">${escapeHtml(mountain.name)} <small>${escapeHtml(elevation)}m</small></div>`,
      iconSize: [1, 1],
      iconAnchor: [0, 0]
    });
  }

  function createExistingIcon(mountain) {
    const elevation = formatElevation(mountain.ele);
    return L.divIcon({
      className: "existing-mountain-icon",
      html: `<div class="existing-mountain-label">${escapeHtml(mountain.name)} <small>${escapeHtml(elevation)}m</small></div>`,
      iconSize: [1, 1],
      iconAnchor: [0, 0]
    });
  }

  function existingPopupHtml(mountain) {
    return `
      <table class="mountain-popup-table">
        <tr><th>산 이름</th><td>${escapeHtml(mountain.name)}</td></tr>
        <tr><th>높이</th><td>${escapeHtml(formatElevation(mountain.ele))}m</td></tr>
        <tr><th>좌표</th><td>${formatNumber(mountain.lat)}, ${formatNumber(mountain.lon)}</td></tr>
        <tr><th>구분</th><td>기존 산</td></tr>
      </table>
    `;
  }

  function popupFormHtml(mountain, mode) {
    const lat = formatNumber(mountain.lat);
    const lon = formatNumber(mountain.lon);
    const elevation = mountain.ele === "" || mountain.ele == null ? "" : formatElevation(mountain.ele);
    const deleteButton = mode === "edit"
      ? '<button type="button" class="danger" data-action="delete">삭제</button>'
      : '<button type="button" data-action="cancel">취소</button>';
    return `
      <form class="mountain-popup-form" data-mode="${mode}" data-id="${escapeHtml(mountain.id || "")}" data-lat="${lat}" data-lon="${lon}">
        <label>
          산 이름
          <input name="name" value="${escapeHtml(mountain.name || "")}" required autocomplete="off" />
        </label>
        <label>
          높이(m)
          <input name="ele" value="${escapeHtml(elevation)}" required inputmode="decimal" autocomplete="off" />
        </label>
        <div class="mountain-popup-coords">${lat}, ${lon}</div>
        <div class="mountain-popup-actions">
          <button type="submit" class="primary">${mode === "edit" ? "수정" : "추가"}</button>
          ${deleteButton}
        </div>
      </form>
    `;
  }

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function setSelectedCoord(lat, lon) {
    coordEl.textContent = `${formatNumber(lat, 5)}, ${formatNumber(lon, 5)}`;
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mountains));
    } catch (error) {
      // Local storage can be disabled; export still works.
    }
  }

  function renderExistingList() {
    existingCountEl.textContent = existingMountains.length.toLocaleString("ko-KR");
    existingListEl.innerHTML = existingMountains
      .map((mountain) => `
        <button type="button" data-existing-id="${escapeHtml(mountain.id)}" class="${mountain.id === selectedExistingId ? "is-active" : ""}">
          <strong>${escapeHtml(mountain.name)}</strong>
          <span>${escapeHtml(formatElevation(mountain.ele))}m</span>
          <small>${formatNumber(mountain.lat)}, ${formatNumber(mountain.lon)}</small>
        </button>
      `)
      .join("");
  }

  function renderList() {
    countEl.textContent = mountains.length.toLocaleString("ko-KR");
    listEl.innerHTML = mountains
      .map((mountain) => `
        <button type="button" data-id="${escapeHtml(mountain.id)}" class="${mountain.id === selectedId ? "is-active" : ""}">
          <strong>${escapeHtml(mountain.name)}</strong>
          <span>${escapeHtml(formatElevation(mountain.ele))}m</span>
          <small>${formatNumber(mountain.lat)}, ${formatNumber(mountain.lon)}</small>
        </button>
      `)
      .join("");
  }

  function addOrUpdateMarker(mountain) {
    let marker = markerById.get(mountain.id);
    if (!marker) {
      marker = L.marker([mountain.lat, mountain.lon], {
        icon: createIcon(mountain),
        title: mountain.name
      });
      marker.addTo(mountainLayer);
      markerById.set(mountain.id, marker);
    }

    marker
      .setLatLng([mountain.lat, mountain.lon])
      .setIcon(createIcon(mountain))
      .bindPopup(popupFormHtml(mountain, "edit"), { maxWidth: 280 });
  }

  function addExistingMarker(mountain) {
    const marker = L.marker([mountain.lat, mountain.lon], {
      icon: createExistingIcon(mountain),
      title: mountain.name,
      bubblingMouseEvents: false
    });
    marker.bindPopup(existingPopupHtml(mountain), { maxWidth: 260 });
    marker.addTo(existingMountainLayer);
    existingMarkerById.set(mountain.id, marker);
  }

  function focusExistingMountain(id) {
    const mountain = existingMountains.find((item) => item.id === id);
    const marker = existingMarkerById.get(id);
    if (!mountain || !marker) return;

    selectedExistingId = id;
    selectedId = null;
    renderExistingList();
    renderList();
    setSelectedCoord(mountain.lat, mountain.lon);
    map.flyTo([mountain.lat, mountain.lon], Math.max(map.getZoom(), 15), { duration: 0.55 });
    marker.openPopup();
    setStatus(`${mountain.name} 기존 산 위치`);
  }

  function addMountain(mountain) {
    const item = {
      id: uniqueId(mountain.id),
      name: normalizeName(mountain.name),
      ele: parseElevation(mountain.ele),
      lat: Number(mountain.lat),
      lon: Number(mountain.lon),
      source: "manual"
    };

    if (!item.name || item.ele == null || !Number.isFinite(item.lat) || !Number.isFinite(item.lon)) {
      setStatus("산 이름과 높이를 확인하세요");
      return null;
    }

    mountains.push(item);
    selectedExistingId = null;
    selectedId = item.id;
    addOrUpdateMarker(item);
    renderExistingList();
    renderList();
    saveLocal();
    setSelectedCoord(item.lat, item.lon);
    setStatus(`${item.name} ${formatElevation(item.ele)}m 추가`);
    return item;
  }

  function updateMountain(id, patch) {
    const mountain = mountains.find((item) => item.id === id);
    if (!mountain) return;

    const name = normalizeName(patch.name);
    const ele = parseElevation(patch.ele);
    if (!name || ele == null) {
      setStatus("산 이름과 높이를 확인하세요");
      return;
    }

    mountain.name = name;
    mountain.ele = ele;
    selectedExistingId = null;
    selectedId = mountain.id;
    addOrUpdateMarker(mountain);
    renderExistingList();
    renderList();
    saveLocal();
    setStatus(`${mountain.name} 수정`);
  }

  function deleteMountain(id) {
    const index = mountains.findIndex((mountain) => mountain.id === id);
    if (index < 0) return;

    const [removed] = mountains.splice(index, 1);
    const marker = markerById.get(id);
    if (marker) {
      marker.remove();
      markerById.delete(id);
    }
    if (selectedId === id) selectedId = null;
    renderList();
    saveLocal();
    setStatus(`${removed.name} 삭제`);
  }

  function focusMountain(id) {
    const mountain = mountains.find((item) => item.id === id);
    const marker = markerById.get(id);
    if (!mountain || !marker) return;

    selectedExistingId = null;
    selectedId = id;
    renderExistingList();
    renderList();
    setSelectedCoord(mountain.lat, mountain.lon);
    map.flyTo([mountain.lat, mountain.lon], Math.max(map.getZoom(), 15), { duration: 0.55 });
    marker.openPopup();
  }

  function clearDraft() {
    if (draftMarker) {
      draftMarker.remove();
      draftMarker = null;
    }
  }

  function openAddPopup(latlng) {
    clearDraft();
    setSelectedCoord(latlng.lat, latlng.lng);
    draftMarker = L.circleMarker(latlng, {
      radius: 7,
      color: "#22703f",
      weight: 2,
      fillColor: "#ffffff",
      fillOpacity: 0.95
    }).addTo(map);

    L.popup({ maxWidth: 280, closeOnClick: false })
      .setLatLng(latlng)
      .setContent(popupFormHtml({ lat: latlng.lat, lon: latlng.lng, name: "", ele: "" }, "add"))
      .openOn(map);
  }

  function buildPayload() {
    const exported = mountains.map((mountain) => ({
      id: mountain.id,
      name: mountain.name,
      ele: mountain.ele,
      lat: Number(formatNumber(mountain.lat)),
      lon: Number(formatNumber(mountain.lon)),
      source: "manual"
    }));

    const appendToMountainLayer = exported
      .map((mountain) => (
        `{ id: ${JSON.stringify(mountain.id)}, name: ${JSON.stringify(mountain.name)}, ele: ${mountain.ele}, lat: ${mountain.lat}, lon: ${mountain.lon}, source: "manual" }`
      ))
      .join(",\n");

    return {
      version: 1,
      kind: "hwaseong-manual-mountain-additions",
      createdAt: new Date().toISOString(),
      targetMap: "hwaseong_fire_patrol_map_road_nodes.html",
      targetLayer: "mountain_layer.js",
      coordinateSystem: "EPSG:4326",
      count: exported.length,
      mountains: exported,
      appendToMountainLayer
    };
  }

  function exportMountains() {
    const payload = buildPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
    const link = document.createElement("a");
    link.href = url;
    link.download = `hwaseong_added_mountains_${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus(`추가 산 ${payload.count.toLocaleString("ko-KR")}개 내보냄`);
  }

  function importMountains(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || "{}"));
        const imported = Array.isArray(payload.mountains) ? payload.mountains : [];
        let added = 0;

        imported.forEach((item) => {
          if (!item || item.name == null || item.ele == null || item.lat == null || item.lon == null) return;
          const mountain = addMountain({
            id: item.id,
            name: item.name,
            ele: item.ele,
            lat: item.lat,
            lon: item.lon
          });
          if (mountain) added += 1;
        });

        setStatus(`추가 산 ${added.toLocaleString("ko-KR")}개 불러옴`);
      } catch (error) {
        setStatus("산 추가 JSON을 읽지 못했습니다");
      } finally {
        importInput.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function restoreLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(saved)) return;
      saved.forEach((item) => {
        const mountain = addMountain(item);
        if (mountain) addOrUpdateMarker(mountain);
      });
      if (saved.length) setStatus(`저장된 산 ${mountains.length.toLocaleString("ko-KR")}개 복원`);
    } catch (error) {
      setStatus("저장된 산 목록을 복원하지 못했습니다");
    }
  }

  map.on("click", (event) => {
    if (!hwaseongBounds.contains(event.latlng)) {
      setStatus("화성시 지도 범위 밖입니다");
      return;
    }
    openAddPopup(event.latlng);
  });

  map.on("popupopen", (event) => {
    const element = event.popup.getElement();
    const form = element && element.querySelector(".mountain-popup-form");
    if (!form) return;

    const nameInput = form.querySelector('input[name="name"]');
    if (nameInput) nameInput.focus();

    form.addEventListener("submit", (submitEvent) => {
      submitEvent.preventDefault();
      const formData = new FormData(form);
      const mode = form.dataset.mode;
      const id = form.dataset.id;
      const patch = {
        name: formData.get("name"),
        ele: formData.get("ele"),
        lat: Number(form.dataset.lat),
        lon: Number(form.dataset.lon)
      };

      if (mode === "edit") {
        updateMountain(id, patch);
      } else {
        addMountain(patch);
        clearDraft();
      }
      map.closePopup();
    });

    form.addEventListener("click", (clickEvent) => {
      const button = clickEvent.target.closest("[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      if (action === "delete") {
        deleteMountain(form.dataset.id);
        map.closePopup();
      } else if (action === "cancel") {
        clearDraft();
        map.closePopup();
      }
    });
  });

  map.on("popupclose", () => {
    clearDraft();
  });

  existingListEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-existing-id]");
    if (button) focusExistingMountain(button.dataset.existingId);
  });

  listEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-id]");
    if (button) focusMountain(button.dataset.id);
  });

  exportBtn.addEventListener("click", exportMountains);

  clearBtn.addEventListener("click", () => {
    if (!mountains.length) {
      setStatus("초기화할 산이 없습니다");
      return;
    }
    if (!window.confirm("추가한 산 목록을 모두 지울까요?")) return;
    mountains.splice(0, mountains.length);
    markerById.forEach((marker) => marker.remove());
    markerById.clear();
    selectedId = null;
    renderList();
    saveLocal();
    setStatus("추가 산 목록 초기화");
  });

  importInput.addEventListener("change", () => {
    const file = importInput.files && importInput.files[0];
    if (file) importMountains(file);
  });

  existingMountains.forEach(addExistingMarker);
  renderExistingList();
  renderList();
  restoreLocal();

  window.dreamMountainAddEditor = {
    map,
    existingMountains,
    mountains,
    addMountain,
    buildPayload,
    exportMountains,
    focusMountain
  };
})();
