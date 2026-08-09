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

  // mapServerRow의 반대 방향 — '기관 추가'가 POST /institutions로 보낼 본문을 만든다.
  // institutionId(서버가 발급)와 stage(워크플로가 정함)는 보내지 않고, 서버에 대응
  // 컬럼이 없는 로컬 전용 필드(좌표·출처·확정여부 등)도 빼둔다 — 그것들은 store
  // overlay가 유일한 저장처다(LOCAL_ONLY_FIELDS).
  const CREATE_MAP = {
    name: 'name_ko', region: 'region_code', type: 'type',
    contractEnd: 'contract_end', lastBid: 'last_bid', term: 'term',
  };

  serverdata.toServerRow = function (rec) {
    const body = {};
    Object.keys(CREATE_MAP).forEach(function (k) {
      let v = (rec || {})[k];
      if (typeof v === 'string') v = v.trim();
      if (v === undefined || v === null || v === '') return;   // 빈 칸은 아예 안 보낸다
      body[CREATE_MAP[k]] = v;
    });
    return body;
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

  // 입찰일의 진실은 **반입된 공고(bid_cases)** 다. 지도가 보던
  // institutions.contract_end(CSV 반입)는 공고가 없을 때의 폴백일 뿐이다.
  // 우선순위: 확정일 > 예상일 > 기존 값. 이렇게 값만 갈아끼우면 render.js의
  // 빗금(추측)·긴급도 색은 손대지 않아도 공고 기준으로 그려진다.
  serverdata.applyBidCases = function (list, bidCases) {
    const byInst = {};
    (bidCases || []).forEach(function (b) { byInst[b.institution_id] = b; });
    return (list || []).map(function (r) {
      const b = r.institutionId && byInst[r.institutionId];
      if (!b) return r;
      const rec = Object.assign({}, r, {
        bidCaseId: b.bid_case_id,
        participationStatus: b.participation_status,
        participationDecision: b.participation_decision || [],
      });
      // 날짜가 없는 공고(일정 미상)면 기존 값을 남긴다 — 있던 정보를 지우지 않는다.
      if (b.confirmed_date) { rec.contractEnd = b.confirmed_date; rec.confirmed = true; }
      else if (b.expected_date) { rec.contractEnd = b.expected_date; rec.confirmed = false; }
      return rec;
    });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = serverdata;
  else root.serverdata = serverdata;
})(typeof self !== 'undefined' ? self : this);
