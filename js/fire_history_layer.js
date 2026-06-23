// Auto-generated from 화성시_화재기록_위도경도_완성.xlsx.
(function () {
  "use strict";

  const config = window.dreamFactoryPriorityConfig || {};
  const map = config.map;
  const layerControl = config.layerControl;
  if (!map || !window.L) return;

  const fireRecords = [{"year":"2012","month":"06","day":"27","time":"02:57:00","area":"0.1","cause":"기타","emd":"비봉","ri":"청요리","lot":"산127","address":"화성시 비봉 청요리 산127","naverAddress":"경기도 화성시 효행구 비봉면 청요리 산127","lat":37.2040257,"lng":126.8956837,"status":"성공"},{"year":"2014","month":"04","day":"08","time":"17:30:00","area":"0.1","cause":"입산자실화","emd":"팔탄","ri":"지월","lot":"434-1","address":"화성시 팔탄 지월 434-1","naverAddress":"경기도 화성시 만세구 팔탄면 지월리 434-1","lat":37.1492202632226,"lng":126.899246083597,"status":"성공"},{"year":"2015","month":"03","day":"08","time":"13:32:00","area":"0.01","cause":"쓰레기소각","emd":"팔탄","ri":"창곡","lot":"산54-1","address":"화성시 팔탄 창곡 산54-1","naverAddress":"경기도 화성시 만세구 팔탄면 창곡리 산54-1","lat":37.1823409527387,"lng":126.892982986732,"status":"성공"},{"year":"2015","month":"03","day":"10","time":"13:30:00","area":"0.05","cause":"쓰레기소각","emd":"봉담","ri":"분천","lot":"산34-1","address":"화성시 봉담 분천 산34-1","naverAddress":"경기도 화성시 효행구 봉담읍 분천리 산34-1","lat":37.2072120847508,"lng":126.949111942392,"status":"성공"},{"year":"2015","month":"03","day":"17","time":"14:07:00","area":"0.01","cause":"농산부산물소각","emd":"비봉","ri":"양노","lot":"산739-5","address":"화성시 비봉 양노 산739-5","naverAddress":"경기도 화성시 효행구 비봉면 양노리 산739-5","lat":37.2244081,"lng":126.8699689,"status":"성공"},{"year":"2016","month":"02","day":"09","time":"15:59:00","area":"0.2","cause":"입산자실화","emd":"향남","ri":"증거","lot":"산24","address":"화성시 향남 증거 산24","naverAddress":"경기도 화성시 만세구 향남읍 증거리 산24","lat":37.1430895728762,"lng":126.972310641,"status":"성공"},{"year":"2016","month":"03","day":"23","time":"13:14:00","area":"0.1","cause":"농산부산물소각","emd":"정남","ri":"관항","lot":"산38-1","address":"화성시 정남 관항 산38-1","naverAddress":"경기도 화성시 효행구 정남면 관항리 산38-1","lat":37.1818302,"lng":126.9577443,"status":"성공"},{"year":"2016","month":"03","day":"27","time":"16:13:00","area":"0.9","cause":"농산부산물소각","emd":"장안","ri":"석포","lot":"산66","address":"화성시 장안 석포 산66","naverAddress":"경기도 화성시 만세구 장안면 석포리 산66","lat":37.1467113292986,"lng":126.826546479612,"status":"성공"},{"year":"2016","month":"04","day":"11","time":"12:39:00","area":"0.35","cause":"쓰레기소각","emd":"봉담","ri":"상기","lot":"산76","address":"화성시 봉담 상기 산76","naverAddress":"경기도 화성시 효행구 봉담읍 상기리 산76","lat":37.2111336710027,"lng":126.917488952552,"status":"성공"},{"year":"2016","month":"04","day":"11","time":"09:21:00","area":"0.09","cause":"농산부산물소각","emd":"팔탄","ri":"덕천","lot":"산43-4","address":"화성시 팔탄 덕천 산43-4","naverAddress":"경기도 화성시 만세구 팔탄면 덕천리 산43-4","lat":37.1502442350689,"lng":126.873248250954,"status":"성공"},{"year":"2016","month":"05","day":"20","time":"17:53:00","area":"0.17","cause":"농산부산물소각","emd":"봉담","ri":"상기","lot":"산93-1","address":"화성시 봉담 상기 산93-1","naverAddress":"경기도 화성시 효행구 봉담읍 상기리 산93-1","lat":37.218647406276,"lng":126.913660528381,"status":"성공"},{"year":"2017","month":"03","day":"11","time":"12:50:00","area":"0.5","cause":"기타","emd":"팔탄","ri":"덕천","lot":"산106","address":"화성시 팔탄 덕천 산106","naverAddress":"경기도 화성시 만세구 팔탄면 덕천리 산106","lat":37.1417938059692,"lng":126.88213386548,"status":"성공"},{"year":"2017","month":"03","day":"18","time":"13:30:00","area":"0.3","cause":"농산부산물소각","emd":"정남","ri":"관항","lot":"산77-5","address":"화성시 정남 관항 산77-5","naverAddress":"경기도 화성시 효행구 정남면 관항리 산77-5","lat":37.1771932546662,"lng":126.95713920469,"status":"성공"},{"year":"2017","month":"03","day":"22","time":"15:51:00","area":"0.4","cause":"기타","emd":"팔탄","ri":"가재","lot":"산146","address":"화성시 팔탄 가재 산146","naverAddress":"경기도 화성시 만세구 팔탄면 가재리 산146","lat":37.1520626481799,"lng":126.911543214567,"status":"성공"},{"year":"2017","month":"04","day":"01","time":"12:20:00","area":"0.2","cause":"쓰레기소각","emd":"봉담","ri":"상","lot":"산107-3","address":"화성시 봉담 상 산107-3","naverAddress":"경기도 화성시 효행구 봉담읍 상리 산107-3","lat":37.221542534579,"lng":126.933274867365,"status":"성공"},{"year":"2017","month":"04","day":"04","time":"13:35:00","area":"0.1","cause":"쓰레기소각","emd":"남양","ri":"안석","lot":"산118-1","address":"화성시 남양 안석 산118-1","naverAddress":"경기도 화성시 만세구 남양읍 안석리 산118-1","lat":37.1632339,"lng":126.8331103,"status":"성공"},{"year":"2017","month":"05","day":"06","time":"14:18:00","area":"0.5","cause":"입산자실화","emd":"기안","ri":"","lot":"245-3임","address":"화성시 기안 245-3임","naverAddress":"경기도 화성시 동부출장소 기안동 245-3임","lat":37.2282046,"lng":126.977432,"status":"성공"},{"year":"2017","month":"06","day":"17","time":"09:40:00","area":"0.06","cause":"기타","emd":"봉담","ri":"내","lot":"281-4임","address":"화성시 봉담 내 281-4임","naverAddress":"경기도 화성시 효행구 봉담읍 내리 281-4임","lat":37.2367660381169,"lng":126.913550276487,"status":"성공"},{"year":"2018","month":"02","day":"19","time":"20:52:00","area":"0.01","cause":"쓰레기소각","emd":"봉담","ri":"덕우","lot":"산4-2","address":"화성시 봉담 덕우 산4-2","naverAddress":"경기도 화성시 효행구 봉담읍 덕우리 산4-2","lat":37.1681330958734,"lng":126.932165520685,"status":"성공"},{"year":"2018","month":"02","day":"25","time":"11:19:00","area":"0.6","cause":"쓰레기소각","emd":"남양","ri":"북양","lot":"산74-5","address":"화성시 남양 북양 산74-5","naverAddress":"경기도 화성시 만세구 남양읍 북양리 산74-5","lat":37.2189180127419,"lng":126.843121464768,"status":"성공"},{"year":"2018","month":"12","day":"28","time":"15:30:00","area":"0.02","cause":"건축물화재비화","emd":"팔탄","ri":"창곡","lot":"산19-1","address":"화성시 팔탄 창곡 산19-1","naverAddress":"경기도 화성시 만세구 팔탄면 창곡리 산19-1","lat":37.1893718411113,"lng":126.889317831763,"status":"성공"},{"year":"2019","month":"03","day":"06","time":"14:20:00","area":"0.06","cause":"쓰레기소각","emd":"남양","ri":"송림","lot":"산145-1","address":"화성시 남양 송림 산145-1","naverAddress":"경기도 화성시 만세구 남양읍 송림리 산145-1","lat":37.2211563011711,"lng":126.815772950364,"status":"성공"},{"year":"2019","month":"05","day":"10","time":"10:50:00","area":"0.06","cause":"입산자실화","emd":"남양","ri":"송림","lot":"430-2(임)","address":"화성시 남양 송림 430-2(임)","naverAddress":"경기도 화성시 만세구 남양읍 송림리 430-2(임)","lat":37.2244402595385,"lng":126.818988192783,"status":"성공"},{"year":"2019","month":"05","day":"11","time":"08:51:00","area":"0.06","cause":"입산자실화","emd":"남양","ri":"송림","lot":"334-5","address":"화성시 남양 송림 334-5","naverAddress":"경기도 화성시 만세구 남양읍 송림리 334-5","lat":37.2229167269046,"lng":126.827040057186,"status":"성공"},{"year":"2020","month":"03","day":"22","time":"12:51:00","area":"0.1","cause":"담뱃불실화","emd":"남양","ri":"남양","lot":"103-1","address":"화성시 남양 남양 103-1","naverAddress":"경기도 화성시 만세구 남양읍 남양리 103-1","lat":37.2137153028821,"lng":126.809697562201,"status":"성공"},{"year":"2020","month":"03","day":"24","time":"12:55:00","area":"0.05","cause":"기타","emd":"정남","ri":"괘랑","lot":"636.0","address":"화성시 정남 괘랑 636.0","naverAddress":"경기도 화성시 효행구 정남면 괘랑리 636.0","lat":37.1837444641185,"lng":126.987745535759,"status":"성공"},{"year":"2020","month":"03","day":"29","time":"11:59:00","area":"0.1","cause":"건축물화재비화","emd":"남양","ri":"복양","lot":"500-105","address":"화성시 남양 복양 500-105","naverAddress":"경기도 화성시 만세구 남양읍 복양리 500-105","lat":37.2112064,"lng":126.8497011,"status":"성공"},{"year":"2020","month":"04","day":"16","time":"13:04:00","area":"0.01","cause":"입산자실화","emd":"향남","ri":"장짐","lot":"86-22","address":"화성시 향남 장짐 86-22","naverAddress":"경기도 화성시 만세구 향남읍 장짐리 86-22","lat":37.1420865210711,"lng":126.904294387951,"status":"성공"},{"year":"2020","month":"04","day":"18","time":"12:22:00","area":"0.01","cause":"담뱃불실화","emd":"비봉","ri":"청오","lot":"702-7","address":"화성시 비봉 청오 702-7","naverAddress":"경기도 화성시 효행구 비봉면 청오리 702-7","lat":37.2318636,"lng":126.8717339,"status":"성공"},{"year":"2020","month":"10","day":"29","time":"13:25:00","area":"0.03","cause":"담뱃불실화","emd":"남양","ri":"무송","lot":"산125-1","address":"화성시 남양 무송 산125-1","naverAddress":"경기도 화성시 만세구 남양읍 무송리 산125-1","lat":37.1922630257294,"lng":126.852279747544,"status":"성공"},{"year":"2020","month":"12","day":"12","time":"23:37:00","area":"0.01","cause":"쓰레기소각","emd":"팔탄","ri":"창곡","lot":"615-1","address":"화성시 팔탄 창곡 615-1","naverAddress":"경기도 화성시 만세구 팔탄면 창곡리 615-1","lat":37.184540369142,"lng":126.893821586913,"status":"성공"},{"year":"2021","month":"01","day":"15","time":"14:37:00","area":"0.03","cause":"담뱃불실화","emd":"비봉","ri":"자안","lot":"산37-4","address":"화성시 비봉 자안 산37-4","naverAddress":"경기도 화성시 효행구 비봉면 자안리 산37-4","lat":37.2095568521318,"lng":126.881598436907,"status":"성공"},{"year":"2021","month":"02","day":"26","time":"10:41:00","area":"0.06","cause":"쓰레기소각","emd":"남양","ri":"송림","lot":"430-1","address":"화성시 남양 송림 430-1","naverAddress":"경기도 화성시 만세구 남양읍 송림리 430-1","lat":37.2245314952145,"lng":126.819966685839,"status":"성공"},{"year":"2021","month":"03","day":"15","time":"15:20:00","area":"0.4","cause":"농산부산물소각","emd":"남양","ri":"신남","lot":"산25-2","address":"화성시 남양 신남 산25-2","naverAddress":"경기도 화성시 만세구 남양읍 신남리 산25-2","lat":37.1861425279289,"lng":126.809307728781,"status":"성공"},{"year":"2021","month":"04","day":"02","time":"09:44:00","area":"0.1","cause":"담뱃불실화","emd":"봉담","ri":"당하","lot":"242-2","address":"화성시 봉담 당하 242-2","naverAddress":"경기도 화성시 효행구 봉담읍 당하리 242-2","lat":37.1835191178399,"lng":126.931313337202,"status":"성공"},{"year":"2022","month":"01","day":"31","time":"14:51:00","area":"0.3","cause":"쓰레기소각","emd":"성산","ri":"고포","lot":"산216-7","address":"화성시 성산 고포 산216-7","naverAddress":"경기도 화성시 만세구 남양읍 성산리 산216-7","lat":37.2081823,"lng":126.8218019,"status":"성공"},{"year":"2022","month":"04","day":"12","time":"13:21:00","area":"0.27","cause":"기타","emd":"봉담","ri":"내","lot":"산72-1","address":"화성시 봉담 내 산72-1","naverAddress":"경기도 화성시 효행구 봉담읍 내리 산72-1","lat":37.230545841347,"lng":126.932229548066,"status":"성공"},{"year":"2022","month":"05","day":"16","time":"23:18:00","area":"0.06","cause":"기타","emd":"팔탄","ri":"기천","lot":"산132","address":"화성시 팔탄 기천 산132","naverAddress":"경기도 화성시 만세구 팔탄면 기천리 산132","lat":37.1766838898379,"lng":126.903730524611,"status":"성공"},{"year":"2022","month":"11","day":"19","time":"10:48:00","area":"0.06","cause":"기타","emd":"팔탄","ri":"노하","lot":"산54-3","address":"화성시 팔탄 노하 산54-3","naverAddress":"경기도 화성시 만세구 팔탄면 노하리 산54-3","lat":37.1536731848245,"lng":126.867778410227,"status":"성공"},{"year":"2023","month":"02","day":"20","time":"12:40:00","area":"0.3","cause":"쓰레기소각","emd":"비봉","ri":"자안","lot":"산61-7","address":"화성시 비봉 자안 산61-7","naverAddress":"경기도 화성시 효행구 비봉면 자안리 산61-7","lat":37.2063597233203,"lng":126.871711643455,"status":"성공"},{"year":"2023","month":"03","day":"02","time":"12:52:00","area":"0.43","cause":"쓰레기소각","emd":"정남","ri":"백","lot":"산76외3필지","address":"화성시 정남 백 산76외3필지","naverAddress":"경기도 화성시 효행구 정남면 백리 산76외3필지","lat":37.1620044,"lng":126.9499472,"status":"성공"},{"year":"2023","month":"04","day":"04","time":"11:51:00","area":"0.09","cause":"기타","emd":"남양","ri":"남양","lot":"산149","address":"화성시 남양 남양 산149","naverAddress":"경기도 화성시 만세구 남양읍 남양리 산149","lat":37.2057924872895,"lng":126.814826538729,"status":"성공"},{"year":"2024","month":"03","day":"08","time":"18:44:00","area":"0.01","cause":"담뱃불실화","emd":"팔탄","ri":"노하","lot":"산111","address":"화성시 팔탄 노하 산111","naverAddress":"경기도 화성시 만세구 팔탄면 노하리 산111","lat":37.1616473956686,"lng":126.863513031347,"status":"성공"},{"year":"2024","month":"03","day":"13","time":"13:20:00","area":"0.2","cause":"기타","emd":"","ri":"중","lot":"산77","address":"화성시 중 산77","naverAddress":"경기도 화성시 중리 산77","lat":37.1688927,"lng":126.8941169,"status":"성공"},{"year":"2025","month":"01","day":"03","time":"03:16:00","area":"0.05","cause":"담뱃불실화","emd":"정남","ri":"백","lot":"352-2","address":"화성시 정남 백 352-2","naverAddress":"경기도 화성시 효행구 정남면 백리 352-2","lat":37.164956770764,"lng":126.957501894915,"status":"성공"},{"year":"2025","month":"02","day":"25","time":"10:38:00","area":"0.06","cause":"쓰레기소각","emd":"남양","ri":"무송","lot":"산47-2","address":"화성시 남양 무송 산47-2","naverAddress":"경기도 화성시 만세구 남양읍 무송리 산47-2","lat":37.1976331320696,"lng":126.845097355184,"status":"성공"},{"year":"2025","month":"04","day":"03","time":"11:24:00","area":"0.39","cause":"기타","emd":"남양","ri":"신남","lot":"349-2","address":"화성시 남양 신남 349-2","naverAddress":"경기도 화성시 만세구 남양읍 신남리 349-2","lat":37.1809817465075,"lng":126.824954531186,"status":"성공"}];

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .fire-history-icon {
      background: transparent;
      border: 0;
    }
    .fire-history-flame {
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border-radius: 50% 50% 50% 8px;
      background: linear-gradient(135deg, #f97316 0%, #dc2626 70%);
      border: 2px solid #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,.38);
      color: #fff7ed;
      font-size: 14px;
      transform: rotate(-45deg);
    }
    .fire-history-flame i {
      transform: rotate(45deg);
      line-height: 1;
    }
    .fire-history-popup {
      border-collapse: collapse;
      min-width: 230px;
      font-size: 12px;
    }
    .fire-history-popup th {
      padding: 3px 8px 3px 0;
      white-space: nowrap;
      text-align: left;
      color: #555;
    }
    .fire-history-popup td { padding: 3px 0; }
    .fire-history-layer-label {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .fire-history-layer-dot {
      display: inline-grid;
      place-items: center;
      width: 14px;
      height: 14px;
      border-radius: 50% 50% 50% 4px;
      background: #dc2626;
      color: #fff;
      font-size: 9px;
      transform: rotate(-45deg);
    }
    .fire-history-layer-dot i { transform: rotate(45deg); }
  `;
  document.head.appendChild(styleEl);

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[char];
    });
  }

  function dateText(item) {
    const parts = [item.year, item.month, item.day].filter(Boolean);
    return parts.length ? parts.join(".") + (item.time ? " " + item.time : "") : "";
  }

  function popupHtml(item) {
    const rows = [
      ["발생일시", dateText(item)],
      ["발생원인", item.cause],
      ["피해면적", item.area ? item.area + " ha" : ""],
      ["위치", [item.emd, item.ri, item.lot].filter(Boolean).join(" ")],
      ["전체주소", item.address],
      ["네이버주소", item.naverAddress],
      ["좌표", `${Number(item.lat).toFixed(7)}, ${Number(item.lng).toFixed(7)}`]
    ].filter(([, value]) => value);
    return `<table class="fire-history-popup">${rows.map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table>`;
  }

  function fireIcon() {
    return L.divIcon({
      className: "fire-history-icon",
      html: `<span class="fire-history-flame"><i class="fa-solid fa-fire"></i></span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 24],
      popupAnchor: [0, -22]
    });
  }

  const layer = L.layerGroup();
  const icon = fireIcon();
  fireRecords.forEach(function (item) {
    const marker = L.marker([item.lat, item.lng], {
      icon,
      title: `${dateText(item)} ${item.cause || "화재"}`.trim()
    });
    const label = `${item.year || ""} ${item.cause || "화재"}`.trim() || "화재 발생 기록";
    marker.bindTooltip(label, { sticky: true });
    marker.bindPopup(popupHtml(item), { maxWidth: 420 });
    marker.addTo(layer);
  });

  layer.addTo(map);

  if (layerControl && layerControl.addOverlay) {
    layerControl.addOverlay(layer, `<span class="fire-history-layer-label"><span class="fire-history-layer-dot"><i class="fa-solid fa-fire"></i></span>화재 발생 기록 ${fireRecords.length.toLocaleString("ko-KR")}건</span>`);
  }

  window.dreamFireHistoryLayer = { layer, records: fireRecords };
})();
