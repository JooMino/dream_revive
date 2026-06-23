import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const workDir = path.dirname(__filename);
const repoRoot = path.resolve(workDir, "../..");
const outputPath = path.join(workDir, "화성시_산별_주변_위험도_집계_요약.xlsx");

function cleanText(text) {
  return text.replace(/^\uFEFF/, "");
}

function readJson(text) {
  return JSON.parse(cleanText(text));
}

function parseMountainDatabase(text) {
  const body = cleanText(text)
    .replace(/^window\.dreamMountainMarkerDatabase\s*=\s*/, "")
    .replace(/;\s*$/, "");
  return JSON.parse(body);
}

function valueOrNull(value) {
  return value === undefined ? null : value;
}

function yesNo(value) {
  if (value === true) return "예";
  if (value === false) return "아니오";
  return "";
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function average(values) {
  const numeric = values.map(Number).filter((value) => Number.isFinite(value));
  return numeric.length ? sum(numeric) / numeric.length : null;
}

function riskScoreFromCounts(counts = {}) {
  const weights = {
    factoryPriority1: 1.0,
    factoryPriority2: 0.6,
    factoryPriority3: 0.3,
    farmland: 0.05,
    fireHistory: 20,
  };
  return Math.round((
    (Number(counts.factoryPriority1) || 0) * weights.factoryPriority1 +
    (Number(counts.factoryPriority2) || 0) * weights.factoryPriority2 +
    (Number(counts.factoryPriority3) || 0) * weights.factoryPriority3 +
    (Number(counts.farmland) || 0) * weights.farmland +
    (Number(counts.fireHistory) || 0) * weights.fireHistory
  ) * 10) / 10;
}

function setWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 1, 1).format.columnWidth = width;
  });
}

function styleTitle(range) {
  range.format = {
    fill: "#163B2A",
    font: { bold: true, color: "#FFFFFF", size: 16 },
  };
}

function styleHeader(range) {
  range.format = {
    fill: "#2F6B47",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
  range.format.borders = { preset: "outside", style: "thin", color: "#B7C8B7" };
}

function styleSubHeader(range) {
  range.format = {
    fill: "#E7F1E8",
    font: { bold: true, color: "#173822" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };
  range.format.borders = { preset: "outside", style: "thin", color: "#C9D7C9" };
}

function addTableIfPossible(sheet, range, name) {
  try {
    const table = sheet.tables.add(range, true, name);
    table.style = "TableStyleMedium4";
    table.showFilterButton = true;
    return table;
  } catch (error) {
    return null;
  }
}

const summaryData = readJson(
  await fs.readFile(path.join(repoRoot, "js", "mountain_surrounding_summary.json"), "utf8")
);
const mountainDb = parseMountainDatabase(
  await fs.readFile(path.join(repoRoot, "js", "mountain_marker_database.js"), "utf8")
);

const summaryById = new Map(summaryData.summaries.map((item) => [item.id, item]));
const rows = mountainDb.mountains.map((mountain, index) => {
  const summary = summaryById.get(mountain.id) || {};
  const counts = summary.counts || {};
  const factoryTotal = sum([
    counts.factoryPriority1,
    counts.factoryPriority2,
    counts.factoryPriority3,
  ]);
  const totalNearby = factoryTotal + (counts.farmland || 0) + (counts.fireHistory || 0);
  const riskScore = Number.isFinite(Number(summary.riskScore))
    ? Number(summary.riskScore)
    : riskScoreFromCounts(counts);
  return {
    no: index + 1,
    id: mountain.id,
    name: mountain.name,
    sizeTag: mountain.sizeTag,
    labelVisible: yesNo(mountain.labelVisible !== false),
    generatedName: yesNo(mountain.generated),
    matchedPeak: yesNo(mountain.matchedPeak),
    elevationM: valueOrNull(mountain.ele),
    areaSqm: valueOrNull(mountain.areaSqm),
    areaLabel: mountain.areaLabel || "",
    radiusMeters: valueOrNull(summary.radiusMeters),
    radiusKm: valueOrNull(summary.radiusKm),
    riskScore,
    riskRank: valueOrNull(summary.riskRank ?? mountain.riskRank),
    factoryPriority1: counts.factoryPriority1 || 0,
    factoryPriority2: counts.factoryPriority2 || 0,
    factoryPriority3: counts.factoryPriority3 || 0,
    factoryTotal,
    farmland: counts.farmland || 0,
    fireHistory: counts.fireHistory || 0,
    totalNearby,
    lat: valueOrNull(mountain.lat),
    lon: valueOrNull(mountain.lon),
    representativeLat: valueOrNull(mountain.representativeLat),
    representativeLon: valueOrNull(mountain.representativeLon),
    peakLat: valueOrNull(mountain.peakLat),
    peakLon: valueOrNull(mountain.peakLon),
    category: mountain.category || "",
    osmId: mountain.osmId || "",
    peakOsmId: valueOrNull(mountain.peakOsmId),
    sourceType: mountain.sourceType || "",
    sourceLabel: mountain.sourceLabel || "",
    source: mountain.source || "",
    sortGroup: valueOrNull(mountain.sortGroup),
  };
});

const sizeOrder = ["대형", "중형", "소형", "미상"];
const sizeSummary = sizeOrder
  .map((sizeTag) => {
    const subset = rows.filter((row) => (row.sizeTag || "미상") === sizeTag);
    if (!subset.length) return null;
    return {
      sizeTag,
      mountainCount: subset.length,
      avgRadiusKm: average(subset.map((row) => row.radiusKm)),
      avgRiskScore: average(subset.map((row) => row.riskScore)),
      maxRiskScore: Math.max(...subset.map((row) => Number(row.riskScore) || 0)),
      factoryPriority1: sum(subset.map((row) => row.factoryPriority1)),
      factoryPriority2: sum(subset.map((row) => row.factoryPriority2)),
      factoryPriority3: sum(subset.map((row) => row.factoryPriority3)),
      factoryTotal: sum(subset.map((row) => row.factoryTotal)),
      farmland: sum(subset.map((row) => row.farmland)),
      fireHistory: sum(subset.map((row) => row.fireHistory)),
      totalNearby: sum(subset.map((row) => row.totalNearby)),
    };
  })
  .filter(Boolean);

const workbook = Workbook.create();
workbook.properties = {
  title: "화성시 산별 주변 집계 요약",
  subject: "산 주변 공장, 농지, 화재 기록 집계",
  author: "Codex",
};

const detail = workbook.worksheets.add("산별 집계");
detail.showGridLines = false;

const headers = [
  "순번",
  "산 ID",
  "산 이름",
  "크기",
  "라벨 표시",
  "자동 생성명",
  "정상 매칭",
  "고도(m)",
  "면적(㎡)",
  "면적 표시",
  "주변 반경(m)",
  "주변 반경(km)",
  "위험도 점수",
  "위험도 순위",
  "공장 1순위",
  "공장 2순위",
  "공장 3순위",
  "공장 합계",
  "논밭",
  "화재 발생 기록",
  "총 주변 집계",
  "위도",
  "경도",
  "대표 위도",
  "대표 경도",
  "정상 위도",
  "정상 경도",
  "분류",
  "OSM ID",
  "정상 OSM ID",
  "출처 유형",
  "출처 라벨",
  "출처",
  "정렬 그룹",
];

detail.getRange("A1:AH1").values = [headers];
detail.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows.map((row) => [
  row.no,
  row.id,
  row.name,
  row.sizeTag,
  row.labelVisible,
  row.generatedName,
  row.matchedPeak,
  row.elevationM,
  row.areaSqm,
  row.areaLabel,
  row.radiusMeters,
  row.radiusKm,
  row.riskScore,
  row.riskRank,
  row.factoryPriority1,
  row.factoryPriority2,
  row.factoryPriority3,
  row.factoryTotal,
  row.farmland,
  row.fireHistory,
  row.totalNearby,
  row.lat,
  row.lon,
  row.representativeLat,
  row.representativeLon,
  row.peakLat,
  row.peakLon,
  row.category,
  row.osmId,
  row.peakOsmId,
  row.sourceType,
  row.sourceLabel,
  row.source,
  row.sortGroup,
]);
styleHeader(detail.getRange("A1:AH1"));
detail.freezePanes.freezeRows(1);
setWidths(detail, [
  7, 24, 16, 8, 10, 12, 12, 10, 14, 12, 13, 13, 12, 12, 12, 12,
  12, 12, 12, 15, 13, 12, 12, 12, 12, 12, 12, 16, 22, 16, 16, 16, 34, 10,
]);
detail.getRange(`H2:H${rows.length + 1}`).format.numberFormat = "#,##0.0";
detail.getRange(`I2:I${rows.length + 1}`).format.numberFormat = "#,##0.00";
detail.getRange(`K2:K${rows.length + 1}`).format.numberFormat = "#,##0";
detail.getRange(`L2:L${rows.length + 1}`).format.numberFormat = "0.000";
detail.getRange(`M2:M${rows.length + 1}`).format.numberFormat = "#,##0.0";
detail.getRange(`N2:U${rows.length + 1}`).format.numberFormat = "#,##0";
detail.getRange(`V2:AA${rows.length + 1}`).format.numberFormat = "0.0000000";
detail.getRange("A1:AH1").format.rowHeight = 34;
detail.getRange(`A2:AH${rows.length + 1}`).format.borders = {
  insideHorizontal: { style: "thin", color: "#E6ECE4" },
};
addTableIfPossible(detail, `A1:AH${rows.length + 1}`, "MountainSummaryTable");

const overview = workbook.worksheets.add("요약");
overview.showGridLines = false;
overview.getRange("A1:J1").merge();
overview.getRange("A1").values = [["화성시 산별 주변 집계 요약"]];
styleTitle(overview.getRange("A1:J1"));
overview.getRange("A2:J2").merge();
overview.getRange("A2").values = [[
  `생성 기준: ${summaryData.generatedAt} / 산 ${summaryData.totals.mountains.toLocaleString("ko-KR")}개 / 공장 ${summaryData.totals.factories.toLocaleString("ko-KR")}개 / 논밭 ${summaryData.totals.farmlandFeatures.toLocaleString("ko-KR")}개 / 화재 기록 ${summaryData.totals.fireRecords.toLocaleString("ko-KR")}건`,
]];
overview.getRange("A2:J2").format = {
  fill: "#F6F8F4",
  font: { color: "#405040", size: 10 },
  wrapText: true,
};

overview.getRange("A4:B11").values = [
  ["항목", "값"],
  ["산 개수", summaryData.totals.mountains],
  ["공장 좌표 수", summaryData.totals.factories],
  ["논밭 필지 수", summaryData.totals.farmlandFeatures],
  ["화재 기록 수", summaryData.totals.fireRecords],
  ["평균 주변 반경(km)", average(rows.map((row) => row.radiusKm))],
  ["평균 위험도 점수", average(rows.map((row) => row.riskScore))],
  ["최고 위험도 점수", Math.max(...rows.map((row) => Number(row.riskScore) || 0))],
];
styleSubHeader(overview.getRange("A4:B4"));
overview.getRange("B5:B8").format.numberFormat = "#,##0";
overview.getRange("B9").format.numberFormat = "0.000";
overview.getRange("B10:B11").format.numberFormat = "#,##0.0";

overview.getRange("D4:L4").values = [[
  "크기",
  "산 개수",
  "평균 반경(km)",
  "평균 위험도",
  "최고 위험도",
  "공장 합계",
  "논밭",
  "화재",
  "총 주변 집계",
]];
overview.getRangeByIndexes(4, 3, sizeSummary.length, 9).values = sizeSummary.map((row) => [
  row.sizeTag,
  row.mountainCount,
  row.avgRadiusKm,
  row.avgRiskScore,
  row.maxRiskScore,
  row.factoryTotal,
  row.farmland,
  row.fireHistory,
  row.totalNearby,
]);
styleSubHeader(overview.getRange("D4:L4"));
overview.getRange(`E5:L${sizeSummary.length + 4}`).format.numberFormat = "#,##0";
overview.getRange(`F5:F${sizeSummary.length + 4}`).format.numberFormat = "0.000";
overview.getRange(`G5:H${sizeSummary.length + 4}`).format.numberFormat = "#,##0.0";
addTableIfPossible(overview, `D4:L${sizeSummary.length + 4}`, "SizeSummaryTable");

const topRows = [...rows]
  .sort((a, b) => b.riskScore - a.riskScore || b.totalNearby - a.totalNearby || a.name.localeCompare(b.name, "ko-KR"))
  .slice(0, 20);
overview.getRange("A13:L13").values = [[
  "순위",
  "산 이름",
  "크기",
  "반경(km)",
  "위험도 점수",
  "공장 1순위",
  "공장 2순위",
  "공장 3순위",
  "공장 합계",
  "논밭",
  "화재",
  "총 주변 집계",
]];
overview.getRangeByIndexes(13, 0, topRows.length, 12).values = topRows.map((row, index) => [
  index + 1,
  row.name,
  row.sizeTag,
  row.radiusKm,
  row.riskScore,
  row.factoryPriority1,
  row.factoryPriority2,
  row.factoryPriority3,
  row.factoryTotal,
  row.farmland,
  row.fireHistory,
  row.totalNearby,
]);
styleSubHeader(overview.getRange("A13:L13"));
overview.getRange(`D14:L${topRows.length + 13}`).format.numberFormat = "#,##0";
overview.getRange(`D14:D${topRows.length + 13}`).format.numberFormat = "0.000";
overview.getRange(`E14:E${topRows.length + 13}`).format.numberFormat = "#,##0.0";
addTableIfPossible(overview, `A13:L${topRows.length + 13}`, "TopRiskTable");
overview.freezePanes.freezeRows(4);
setWidths(overview, [8, 18, 8, 12, 13, 12, 12, 12, 12, 12, 10, 13]);

const ranking = workbook.worksheets.add("상위 순위");
ranking.showGridLines = false;
ranking.getRange("A1:H1").values = [[
  "구분",
  "순위",
  "산 이름",
  "크기",
  "반경(km)",
  "값",
  "OSM ID",
  "분류",
]];
styleHeader(ranking.getRange("A1:H1"));
const rankSpecs = [
  ["위험도 점수", "riskScore"],
  ["총 주변 집계", "totalNearby"],
  ["공장 합계", "factoryTotal"],
  ["논밭", "farmland"],
  ["화재 발생 기록", "fireHistory"],
  ["공장 1순위", "factoryPriority1"],
  ["공장 2순위", "factoryPriority2"],
  ["공장 3순위", "factoryPriority3"],
];
const rankRows = [];
rankSpecs.forEach(([label, key]) => {
  [...rows]
    .sort((a, b) => (b[key] || 0) - (a[key] || 0) || a.name.localeCompare(b.name, "ko-KR"))
    .slice(0, 15)
    .forEach((row, index) => {
      rankRows.push([
        label,
        index + 1,
        row.name,
        row.sizeTag,
        row.radiusKm,
        row[key],
        row.osmId,
        row.category,
      ]);
    });
});
ranking.getRangeByIndexes(1, 0, rankRows.length, 8).values = rankRows;
ranking.getRange(`E2:E${rankRows.length + 1}`).format.numberFormat = "0.000";
ranking.getRange(`F2:F${rankRows.length + 1}`).format.numberFormat = "#,##0.0";
ranking.freezePanes.freezeRows(1);
setWidths(ranking, [16, 8, 18, 8, 12, 12, 22, 16]);
addTableIfPossible(ranking, `A1:H${rankRows.length + 1}`, "RankingTable");

const notes = workbook.worksheets.add("데이터 설명");
notes.showGridLines = false;
notes.getRange("A1:D1").merge();
notes.getRange("A1").values = [["데이터 설명 및 산식"]];
styleTitle(notes.getRange("A1:D1"));
notes.getRange("A3:D15").values = [
  ["구분", "내용", "파일/출처", "비고"],
  ["산 마커 DB", "산 ID, 산 이름, 크기, 좌표, 면적, OSM 식별자", "js/mountain_marker_database.js", "192개 산"],
  ["산 주변 집계", "산별 주변 반경과 공장/논밭/화재 개수", "js/mountain_surrounding_summary.json", "UI의 산 주변 집계 카드와 같은 기준"],
  ["위험도 산식", "(공장 1순위×1.0) + (공장 2순위×0.6) + (공장 3순위×0.3) + (논밭×0.05) + (화재×20)", "js/mountain_surrounding_summary.json / js/mountain_marker_database.js", "소수 1자리 반올림"],
  ["공장 1순위", "산 주변 반경 안의 공장 위험 우선순위 1 개수", "dreamFactoryPriorityData", "개수"],
  ["공장 2순위", "산 주변 반경 안의 공장 위험 우선순위 2 개수", "dreamFactoryPriorityData", "개수"],
  ["공장 3순위", "산 주변 반경 안의 공장 위험 우선순위 3 개수", "dreamFactoryPriorityData", "개수"],
  ["논밭", "산 주변 반경 안의 FarmMap 논밭/농지 피처 중심점 개수", "dreamFarmmapFarmlandData", "개수"],
  ["화재 발생 기록", "산 주변 반경 안의 화재 기록 좌표 개수", "dreamFireHistoryLayer.records", "개수"],
  ["반경 산식", summaryData.formula.radius, "mountain_layer.js / mountain_surrounding_summary.json", `기준 반경 ${summaryData.formula.baseRadiusMeters}m, 최소 ${summaryData.formula.minRadiusMeters}m`],
  ["집계 생성 시각", `'${summaryData.generatedAt}`, "mountain_surrounding_summary.json", ""],
  ["초점 범위", JSON.stringify(summaryData.focusBounds), "mountain_surrounding_summary.json", summaryData.filter],
  ["OSM 출처", "OpenStreetMap Overpass 기반 산/숲 범위 및 정상점", "js/mountain_marker_database.js", ""],
];
styleSubHeader(notes.getRange("A3:D3"));
notes.getRange("A4:D15").format = { wrapText: true, verticalAlignment: "top" };
notes.getRange("A3:D15").format.borders = {
  insideHorizontal: { style: "thin", color: "#E6ECE4" },
  outside: { style: "thin", color: "#C9D7C9" },
};
setWidths(notes, [18, 58, 40, 38]);
notes.getRange("A1:D1").format.rowHeight = 28;
notes.getRange("A4:D15").format.rowHeight = 48;

const inspect = await workbook.inspect({
  kind: "table",
  range: "산별 집계!A1:S8",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 19,
  maxChars: 4000,
});
console.log(inspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
  maxChars: 2000,
});
console.log(errors.ndjson);

for (const sheetName of ["요약", "산별 집계", "상위 순위", "데이터 설명"]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    path.join(workDir, `${sheetName}.png`),
    new Uint8Array(await preview.arrayBuffer())
  );
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
