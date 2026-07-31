(function (root) {
  'use strict';
  // 서버 registry ↔ 대시보드 레코드 변환·병합 (계획 B). 순수 함수만 — fetch는 app.js.
  const serverdata = {};
  const FIELD_MAP = {
    institution_id: 'institutionId', name_ko: 'name', region_code: 'region',
    type: 'type', contract_end: 'contractEnd', last_bid: 'lastBid',
    term: 'term', stage: 'stage',
  };

  serverdata.mapServerRow = function (row) {
    const rec = {};
    Object.keys(FIELD_MAP).forEach(function (k) {
      if (row[k] !== null && row[k] !== undefined) rec[FIELD_MAP[k]] = row[k];
    });
    return rec;
  };

  // union 병합: 서버가 authoritative store지만, 지도의 번들 전용 데이터(좌표·출처 등)와
  // 서버 미등록 기관을 지우면 안 된다 — 서버 필드만 덮고 나머지는 남긴다.
  serverdata.mergeUnion = function (bundle, serverRows) {
    const byName = {};
    serverRows.forEach(function (r) { byName[r.name_ko] = serverdata.mapServerRow(r); });
    const seen = {};
    const out = bundle.map(function (b) {
      const s = byName[b.name];
      if (!s) return b;
      seen[b.name] = true;
      return Object.assign({}, b, s);
    });
    serverRows.forEach(function (r) {
      if (!seen[r.name_ko]) out.push(serverdata.mapServerRow(r));
    });
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = serverdata;
  else root.serverdata = serverdata;
})(typeof self !== 'undefined' ? self : this);
