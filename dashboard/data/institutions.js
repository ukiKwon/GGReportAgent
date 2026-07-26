// 개발용 샘플 — 실데이터 아님. 실기관 데이터로 교체(또는 CSV 업로드).
window.institutions = [
  { name:"서울시청(예시)", type:"지자체", region:"11", term:4, lastBid:"2022-12-30",
    sources:[], updatedAt:"2026-07-25" }, // 추측(2026-12-30)
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
