(function () {
  "use strict";

  const config = window.dreamFactoryPriorityConfig || {};
  const map = config.map;
  if (!map || !window.L) return;

  const state = window.dreamWeatherState || {
    windDirection: 225,
    windSpeed: 4,
    humidity: 45,
    temperature: 25,
    rainfall: 0
  };
  window.dreamWeatherState = state;

  const compassNames = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];

  const fields = [
    { key: "windDirection", label: "풍향", min: 0, max: 360, step: 1, unit: "°", suffix: directionName },
    { key: "windSpeed", label: "풍속", min: 0, max: 20, step: 0.1, unit: "m/s" },
    { key: "humidity", label: "습도", min: 0, max: 100, step: 1, unit: "%" },
    { key: "temperature", label: "기온", min: -20, max: 45, step: 0.5, unit: "°C" },
    { key: "rainfall", label: "강우량", min: 0, max: 100, step: 0.5, unit: "mm" }
  ];

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .weather-simulator-control {
      width: 318px;
      max-width: calc(100vw - 24px);
      margin-top: 8px;
      margin-right: 0;
      padding: 11px 12px 12px;
      background: rgba(255, 255, 255, 0.97);
      border: 1px solid rgba(31, 41, 55, 0.18);
      border-radius: 8px;
      box-shadow: 0 3px 12px rgba(15, 23, 42, 0.18);
      color: #1f2937;
      font: 12px/1.35 "Segoe UI", Arial, sans-serif;
    }
    .leaflet-top.leaflet-right .weather-simulator-control {
      clear: both;
      float: right;
    }
    .weather-simulator-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
      font-weight: 800;
      font-size: 13px;
    }
    .weather-simulator-chip {
      padding: 2px 6px;
      border-radius: 999px;
      background: #eef6ff;
      color: #0f5e9c;
      font-weight: 700;
      font-size: 11px;
      white-space: nowrap;
    }
    .weather-simulator-row {
      display: grid;
      grid-template-columns: 48px minmax(96px, 1fr) 104px;
      align-items: center;
      gap: 8px;
      min-height: 32px;
    }
    .weather-simulator-row + .weather-simulator-row { margin-top: 7px; }
    .weather-simulator-label { font-weight: 700; white-space: nowrap; }
    .weather-simulator-range {
      width: 100%;
      min-width: 0;
      accent-color: #2563eb;
    }
    .weather-simulator-value {
      display: grid;
      grid-template-columns: 48px 28px 20px;
      align-items: center;
      gap: 4px;
      min-width: 0;
      font-variant-numeric: tabular-nums;
      color: #111827;
      white-space: nowrap;
    }
    .weather-simulator-number {
      width: 48px;
      height: 24px;
      padding: 2px 4px;
      border: 1px solid rgba(31, 41, 55, 0.28);
      border-radius: 5px;
      background: #fff;
      color: #111827;
      font: 700 12px/1 "Segoe UI", Arial, sans-serif;
      text-align: right;
      box-sizing: border-box;
    }
    .weather-simulator-unit {
      color: #4b5563;
      font-size: 11px;
      overflow: hidden;
      text-overflow: clip;
    }
    .weather-simulator-arrow {
      display: inline-grid;
      place-items: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #e8f0ff;
      color: #1d4ed8;
      font-size: 13px;
      font-weight: 900;
      transform-origin: center;
    }
    .weather-simulator-direction-name {
      grid-column: 1 / 4;
      margin-top: -2px;
      color: #64748b;
      font-size: 11px;
      text-align: right;
    }
  `;
  document.head.appendChild(styleEl);

  function directionName(value) {
    const normalized = ((Number(value) % 360) + 360) % 360;
    const index = Math.round(normalized / 45) % 8;
    return compassNames[index];
  }

  function decimalsFor(field) {
    return String(field.step).includes(".") ? 1 : 0;
  }

  function clampValue(field, value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return Number(state[field.key]) || field.min;
    return Math.min(field.max, Math.max(field.min, numeric));
  }

  function formatNumber(field, value) {
    return Number(value).toFixed(decimalsFor(field)).replace(/\.0$/, "");
  }

  function emitChange() {
    window.dispatchEvent(new CustomEvent("dream:weatherchange", {
      detail: { ...state }
    }));
  }

  const WeatherControl = L.Control.extend({
    options: { position: "topright" },
    onAdd: function () {
      const container = L.DomUtil.create("div", "weather-simulator-control leaflet-control");
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      const title = document.createElement("div");
      title.className = "weather-simulator-title";
      title.innerHTML = `<span>가상 날씨</span><span class="weather-simulator-chip">지도 전체</span>`;
      container.appendChild(title);

      fields.forEach(function (field) {
        const row = document.createElement("div");
        row.className = "weather-simulator-row";

        const label = document.createElement("div");
        label.className = "weather-simulator-label";
        label.textContent = field.label;

        const slider = document.createElement("input");
        slider.className = "weather-simulator-range";
        slider.type = "range";
        slider.min = field.min;
        slider.max = field.max;
        slider.step = field.step;
        slider.value = state[field.key];

        const value = document.createElement("div");
        value.className = "weather-simulator-value";

        const number = document.createElement("input");
        number.className = "weather-simulator-number";
        number.type = "number";
        number.min = field.min;
        number.max = field.max;
        number.step = field.step;
        number.value = formatNumber(field, state[field.key]);
        number.setAttribute("aria-label", `${field.label} 입력값`);

        const unit = document.createElement("span");
        unit.className = "weather-simulator-unit";
        unit.textContent = field.unit;

        let arrow = null;
        if (field.key === "windDirection") {
          arrow = document.createElement("span");
          arrow.className = "weather-simulator-arrow";
          arrow.textContent = "↑";
          arrow.style.transform = `rotate(${state.windDirection}deg)`;
        } else {
          arrow = document.createElement("span");
        }

        let direction = null;
        if (field.key === "windDirection") {
          direction = document.createElement("div");
          direction.className = "weather-simulator-direction-name";
          direction.textContent = directionName(state.windDirection);
        }

        function sync(nextValue) {
          const clamped = clampValue(field, nextValue);
          state[field.key] = clamped;
          slider.value = clamped;
          number.value = formatNumber(field, clamped);
          if (field.key === "windDirection") {
            arrow.style.transform = `rotate(${clamped}deg)`;
            direction.textContent = directionName(clamped);
          }
          emitChange();
        }

        slider.addEventListener("input", function () {
          sync(slider.value);
        });
        number.addEventListener("input", function () {
          sync(number.value);
        });
        number.addEventListener("change", function () {
          sync(number.value);
        });

        value.appendChild(number);
        value.appendChild(unit);
        value.appendChild(arrow);
        if (direction) value.appendChild(direction);

        row.appendChild(label);
        row.appendChild(slider);
        row.appendChild(value);
        container.appendChild(row);
      });

      return container;
    }
  });

  const control = new WeatherControl();
  control.addTo(map);
  window.dreamWeatherControl = control;
  emitChange();
})();
