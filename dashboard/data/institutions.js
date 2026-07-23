// 개발용 샘플 — 실데이터 아님. 실기관 데이터로 교체 시 sources에 실제 출처 URL 기입.
window.institutions = [
  { name:"서울시청(예시)", type:"지자체", region:"11", contractEnd:"2026-09-30",
    confidence:"미상", sources:["SAMPLE-개발용, 실데이터로 교체 필요"] },
  { name:"경기도청(예시)", type:"지자체", region:"41", contractEnd:"2027-12-31",
    confidence:"미상", sources:["SAMPLE-개발용, 실데이터로 교체 필요"] },
  { name:"○○대학병원(예시)", type:"대학병원", region:"11", lng:126.99, lat:37.56,
    contractEnd:"2026-08-15", confidence:"미상", sources:["SAMPLE-개발용, 실데이터로 교체 필요"] },
  { name:"△△공사(예시)", type:"공기업", region:"41", lng:127.05, lat:37.28,
    contractEnd:"2028-06-30", confidence:"미상", sources:["SAMPLE-개발용, 실데이터로 교체 필요"] },
  { name:"□□공단(예시)", type:"공공기관", region:"11", lng:126.92, lat:37.53,
    confidence:"미상", sources:["SAMPLE-개발용, 실데이터로 교체 필요"] }, // contractEnd 없음 → '?' 글리프 검증용
  { name:"무결성불량(예시)", type:"공기업", region:"11", lng:127.01, lat:37.50,
    confidence:"미상", sources:[] }, // sources 빈 배열 → '!' 글리프 검증용
];
