// 지자체 외 기관 금고·주거래은행·공탁금 보관은행 입찰 일정 — NEXT 79(2026-11-11 시작, 9f 수집 / e3 화면 연결).
// 칸 규칙은 institutions.js 머리말과 같다: lastBid(직전 회차 확인된 절차일 — 공고일 > 지정일 > 심의·약정·보도일 근사),
// term(명시된 약정 연수만), contractEnd(지금 실제로 뜬 공고만), contractExpiry(현 약정 만료일 — 화면은 6개월 전을 추정),
// sources(첫 줄에 기준일 종류 또는 빈 이유, 날짜를 주장하면 URL 1개 이상).
// 추가 칸: orgCode(행정표준 기관코드 7자리, 존폐 0 — docs/samples 기관코드 전체자료 2026-11), parentOrgCode,
// bidKind('금고'|'공탁금 보관은행'|'주거래은행'), 법원은 courtKind('본원'|'지원')·opStatus('운영'|'개원 예정')·openDate.
// region = 시도 2자리(지도 코드 체계). subRegion = 본사 소재 시군구 폴리곤 코드 — 주소를 출처로 대조한 뒤 채운다(지금은 비움).
// type: '교육청'·'법원'·'공공기관'·'지방공기업'·'대학'·'병원' — 지도 종류는 logic.kindOf가 접는다(교육청·지방공기업 → 공공기관, e3 11-11).
(function (root) {
  const E = function (o) { return Object.assign({ type: '교육청', bidKind: '금고', updatedAt: '2026-11-11' }, o); };
  root.institutionsNonMuni = [
    // ── 시·도 교육청 교육금고(교육비특별회계) — data-auditor 2026-11-11(기사 근거, 교육청 고시 원문은 미확인) ──
    E({ name: '서울특별시교육청', region: '11', orgCode: '7010000', lastBid: '2024-07-29', term: 4, contractExpiry: '2028-12-31',
      sources: ['기준일=약정 체결일(2024-07-29, 기사, 근사 — 공고·심의일 미확인): NH농협은행 서울본부, 약정 2025~2028(4년)',
        'https://www.thefairnews.co.kr/news/articleView.html?idxno=30720'] }),
    E({ name: '부산광역시교육청', region: '26', orgCode: '7150000', lastBid: '2024-08-12', term: 4, contractExpiry: '2028-12-31',
      sources: ['기준일=공고일(08-12, 연도는 기사일 2024-10-25 기준 추정, 근사): 재공고 09-20 · 심의 10-24 · 부산은행 단독 응찰, 약정 2025-01-01~2028-12-31(4년)',
        'https://www.asiae.co.kr/article/2024102511171429830'] }),
    E({ name: '대구광역시교육청', region: '27', orgCode: '7240000', lastBid: '2024-07-19', term: 4, contractExpiry: '2028-12-31',
      sources: ['기준일=입찰 공고 예정일(2024-07-19, 사전 보도, 근사 — 실제 공고·결과 미확인): 제안서 08-05 · 심의 08-27 예정, 약정 2025~2028(4년). 선정 은행 미확인(이전 2021~2024 농협)',
        'https://www.newsis.com/view/NISX20240716_0002812652'] }),
    E({ name: '인천광역시교육청', region: '28', orgCode: '7310000', lastBid: '2025-10-28', term: 4, contractExpiry: '2029-12-31',
      sources: ['기준일=심의·지정일(2025-10-28, 기사, 근사 — 재공고 뒤 단독, 공고일 미확인): NH농협, 약정 2026~2029(4년)',
        'https://www.naewoeilbo.com/news/articleView.html?idxno=2221948'] }),
    E({ name: '전남광주통합특별시교육청', region: '46', orgCode: '7140000', lastBid: '2026-09-21', term: 4, contractExpiry: '2030-12-31',
      sources: ['기준일=공고일(2026-09-21, 기사): 재공고 10-07 · 심의 10-29 · NH농협 지정(2026-10-30 보도), 약정 2027-01-01~2030-12-31(4년, 체결은 11월 예정). 통합(2026-07) 전 약정은 2026-07~12 농협 한시 운영 — 2026 회차 종료',
        'https://www.newspim.com/news/view/20261030000662'] }),
    E({ name: '대전광역시교육청', region: '30', orgCode: '7430000', term: 4, contractExpiry: '2029-12-31',
      sources: ['월/일 미확보 — 선정 발표 "30일"(월·연 미확인). NH농협 단일금고, 약정 2026-01-01~2029-12-31(기사) — 약정 만료 기준 추정만',
        'https://www.ccnnews.co.kr/news/articleView.html?idxno=376361'] }),
    E({ name: '울산광역시교육청', region: '31', orgCode: '7480000', lastBid: '2025-08-07', term: 4, contractExpiry: '2029-12-31',
      sources: ['기준일=공고일(08-07, 연도는 약정기간 기준 2025 추정, 근사): 재공고 08-29 · 심의 10-27 · 약정 11-02 · NH농협, 약정 2026~2029(4년) — 기사 안에 이전 약정 서술 불일치 있음',
        'https://www.iusm.co.kr/news/articleView.html?idxno=1056497'] }),
    E({ name: '세종특별자치시교육청', region: '36', orgCode: '9300000', lastBid: '2026-09-01', term: 4, contractExpiry: '2030-12-31',
      sources: ['기준일=공고일(2026-09-01, 기사): 재공고 09-21 · NH농협 단독 지정(2026-10-27 보도), 약정 2027-01~2030-12(4년) — 2026 회차 종료(약정 체결 여부 미확인)',
        'https://www.newspim.com/news/view/20261027000643'] }),
    E({ name: '경기도교육청', region: '41', orgCode: '7530000', lastBid: '2025-09-14', term: 4, contractExpiry: '2029-12-31',
      sources: ['기준일=1순위 선정 보도일(2025-09-14, 근사 — 공고 2025-08, 일 미상): NH농협 재지정(우리은행과 경합), 약정 2026-01-01~2029-12-31(4년)',
        'https://www.kyeonggi.com/article/20250914580260'] }),
    E({ name: '강원특별자치도교육청', region: '42', orgCode: '7801000',
      sources: ['월/일 미확보 — 기사 검색으로 최근 회차를 찾지 못함(2026-11-11). 마지막 확인은 2017 기사(2018~2020 농협), 2024-06 보도상 2024-12 만료 4곳 중 하나 — 교육청 고시 게시판 확인 필요',
        'https://www.imaeil.com/page/view/2024061816234060737'] }),
    E({ name: '충청북도교육청', region: '43', orgCode: '8000000', lastBid: '2025-06-12', term: 4, contractExpiry: '2029-12-31',
      sources: ['기준일=심의일(2025-06-12, 기사, 근사 — 공고일 미확인): NH농협 충북본부 단독, 약정 체결 2025-07-14, 약정 2026-01-01~2029-12-31(4년)',
        'https://www.newspim.com/news/view/20250714000948'] }),
    E({ name: '충청남도교육청', region: '44', orgCode: '8140000', lastBid: '2025-07-11', term: 4, contractExpiry: '2029-12-31',
      sources: ['기준일=약정 체결일(2025-07-11, 기사, 근사): NH농협 충남본부, 약정 2026~2029(4년)',
        'https://www.newsis.com/view/NISX20250711_0003248402'] }),
    E({ name: '전북특별자치도교육청', region: '45', orgCode: '8321000', lastBid: '2025-08-26', term: 4, contractExpiry: '2029-12-31',
      sources: ['기준일=공고일(2025-08-26, 기사): 재공고 09-15 · 심의 10-28 · NH농협 단독 선정(2025-10-31 보도), 약정 2026-01-01~2029-12-31(4년)',
        'https://www.newsis.com/view/NISX20251031_0003385698'] }),
    E({ name: '경상북도교육청', region: '47', orgCode: '8750000', lastBid: '2025-12-18', term: 4, contractExpiry: '2029-12-31',
      sources: ['기준일=약정 체결일(2025-12-18, 기사, 근사 — 공고일 미확인): NH농협 경북본부, 약정 2026-01-01~2029-12-31(4년)',
        'https://www.asiae.co.kr/article/2025121814293559990'] }),
    E({ name: '경상남도교육청', region: '48', orgCode: '9010000', term: 4, contractExpiry: '2029-12-31',
      sources: ['월/일 미확보 — 공고 2025-02·03(일 미상), 약정 4월 예정 보도. NH농협 단일금고, 약정 2026-01-01~2029-12-31 — 약정 만료 기준 추정만',
        'https://www.idomin.com/news/articleView.html?idxno=933865'] }),
    E({ name: '제주특별자치도교육청', region: '50', orgCode: '9290000',
      sources: ['월/일 미확보 — 기사 검색으로 교육청 금고 회차를 찾지 못함(도청 금고 기사만, 2026-11-11). 교육청 고시 게시판 확인 필요'] }),
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = root.institutionsNonMuni;
})(typeof window !== 'undefined' ? window : globalThis);
