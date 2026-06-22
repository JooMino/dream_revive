// FarmMap API settings. This file is intentionally separate so the key is easy to edit.
window.dreamFarmmapApiConfig = {
  // Put your issued FarmMap API key here.
  apiKey: "",

  // Must match the domain registered for the API key.
  domain: "https://JooMino.github.io/dream_revive/",

  endpointBase: "https://agis.epis.or.kr/ASD/",
  apiVersion: "v1",
  mapType: "farmmap",
  columnType: "ENG",

  // FarmMap radius API accepts 0-1000 meters.
  radiusMeters: 1000,
  minZoom: 11,
  reloadDebounceMs: 700,
  autoLoad: true,
};
