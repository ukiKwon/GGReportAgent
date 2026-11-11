// 국민은행이 현 금고(1·2금고 합산)인 기관 — 출처 문장으로 확인한 곳만(data-auditor 2026-11-11, NEXT 77).
// 현 약정 기준. 서울 5구는 레코드에 1/2금고 순번이 없어 slot=null(순번을 지어내지 않는다).
// 제외: 서대문(심사 순위), 세종(신청만), 부천(전 금고), 울진(근거 애매). 72 약정 기록이 생기면 이 파일을 대체한다.
// key = logic.instKey(region|name). 근거 보고서: handoff/agents/data-auditor/ 2026-11-11.
(function (root) {
  root.KB_VERIFIED = [
    { key: '26|부산광역시', name: '부산광역시', slot: 2,
      quote: '현 약정 2025-01-01~2028-12-31 · 1금고 BNK부산은행 · 2금고 KB국민은행', src_date: '2024-09-24' },
    { key: '11|노원구청', name: '노원구청', slot: null, quote: '현 금고: 국민은행', src_date: '2022-10-23' },
    { key: '11|도봉구청', name: '도봉구청', slot: null, quote: '현 금고: 국민은행', src_date: '2022-10-23' },
    { key: '11|동작구청', name: '동작구청', slot: null, quote: '현 금고: 국민은행', src_date: '2022-10-23' },
    { key: '11|동대문구청', name: '동대문구청', slot: null, quote: '현 금고: 국민은행', src_date: '2022-10-27' },
    { key: '11|광진구청', name: '광진구청', slot: null, quote: '현 금고: 국민은행', src_date: '2022-10-23' }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KB_VERIFIED;
})(typeof window !== 'undefined' ? window : globalThis);
