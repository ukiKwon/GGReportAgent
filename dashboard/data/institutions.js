// 개발용 샘플 — 실데이터 아님. 실기관 데이터로 교체(또는 CSV 업로드).
window.institutions = [
  { name:"서울시청(예시)", type:"지자체", region:"11", term:4, lastBid:"2022-12-30",
    sources:[], updatedAt:"2026-07-25" }, // 추측(2026-12-30) — 광역이라 어떤 구에도 안 붙음
  // 구 단위 지자체 — subRegion 코드로 폴리곤에 직접 매칭(구마다 다른 임박도 확인용)
  { name:"마포구청(예시)", type:"지자체", region:"11", subRegion:"11140",
    contractEnd:"2026-09-30", confirmed:true, sources:[], updatedAt:"2026-07-28" }, // 확정 → red
  { name:"종로구청(예시)", type:"지자체", region:"11", subRegion:"11010",
    contractEnd:"2027-06-30", sources:[], updatedAt:"2026-07-28" },                 // 추측 → orange
  // subRegion 없이 이름 매칭 폴백으로만 붙는 케이스('강남구청'→'강남구')
  { name:"강남구청(예시)", type:"지자체", region:"11",
    contractEnd:"2028-05-31", sources:[], updatedAt:"2026-07-28" },                 // 추측 → yellow
  { name:"경기도청(예시)", type:"지자체", region:"41", contractEnd:"2027-12-31", confirmed:true,
    sources:[], updatedAt:"2026-07-25" }, // 확정
  { name:"○○대학병원(예시)", type:"대학병원", region:"11", lng:126.99, lat:37.56,
    contractEnd:"2026-08-15", sources:[], updatedAt:"2026-07-25" }, // 추측(확정 아님)
  { name:"△△공사(예시)", type:"공기업", region:"41", lng:127.05, lat:37.28,
    term:2, lastBid:"2026-06-30", sources:[], updatedAt:"2026-07-25" }, // 추측(2028-06-30)
  { name:"□□공단(예시)", type:"공공기관", region:"11", lng:126.92, lat:37.53,
    sources:[], updatedAt:"2026-07-25" }, // 미상 → '?' 검증용
  { name:"무결성불량(예시)", type:"공기업", lng:127.01, lat:37.50,
    sources:[], updatedAt:"2026-07-25" }, // region 없음 → '!' 검증용
];
