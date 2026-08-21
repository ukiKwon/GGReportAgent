(function (root) {
  'use strict';
  // 서버 registry ↔ 대시보드 레코드 변환·병합 (계획 B). 순수 함수만 — fetch는 app.js.
  const serverdata = {};
  // 병합 키에 쓸 이름 정규화를 logic과 공유한다(designer.js와 같은 require 패턴).
  const logic = (typeof require !== 'undefined') ? require('./logic.js') : root.logic;
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
  // 매칭은 **정규화된 이름**으로 한다. 지도 번들은 서울·경기를 `OO구청`/`OO시청`으로
  // 부르고 서버 registry는 `OO구`로 부르는데, 원본 문자열로 맞추면 25개 구가 전부
  // 어긋나 **같은 구가 카드 두 장**으로 떴다(서울 지자체 25 → 50). 지도 쪽
  // municipalityForFeature는 이미 normalizeMuniName으로 둘을 같은 구로 보고 있었다 —
  // 병합만 그 기준을 안 쓰고 있던 것이다.
  // ⚠️ 이름만으로 맞추므로 **같은 이름이 지역을 넘어 존재하면 엉뚱하게 합쳐진다.**
  //    지금 번들에서 구 단위는 서울뿐이고(다른 지역은 시/군) 서버 25개 이름 중
  //    번들에 두 번 이상 나오는 것은 없다 — 아래 테스트가 그 전제를 고정한다.
  function mergeKey(name) {
    return logic.normalizeMuniName(name);
  }

  serverdata.mergeUnion = function (bundle, serverRows) {
    const byName = {};
    serverRows.forEach(function (r) { byName[mergeKey(r.name_ko)] = serverdata.mapServerRow(r); });
    const seen = {};
    const out = bundle.map(function (b) {
      const s = byName[mergeKey(b.name)];
      if (!s) return b;
      seen[mergeKey(b.name)] = true;
      // 번들 이름을 남긴다 — 서버 필드로 덮으면 화면 표기가 `강동구청`에서
      // `강동구`로 조용히 바뀐다. 이름의 진실은 지도 번들 쪽이다(사용자 확정 ⓐ안).
      return Object.assign({}, b, s, { name: b.name });
    });
    serverRows.forEach(function (r) {
      if (!seen[mergeKey(r.name_ko)]) out.push(serverdata.mapServerRow(r));
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
