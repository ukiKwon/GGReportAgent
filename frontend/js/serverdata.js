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
    // 030(2026-11-15): 기관 코드·운영 상태 칸. 서버가 있는 칸은 번들 값을 이긴다(mergeUnion이 e.rec를 덮어 씀).
    org_code: 'orgCode', g2b_code: 'g2bCode', open_date: 'openDate',
    contract_end_confirmed: 'confirmed',   // 확정 여부는 서버 칸이다(store LOCAL_ONLY_FIELDS에서 뺌). false도 값이다
    contract_end_src_url: 'contractEndSrcUrl', contract_end_src_no: 'contractEndSrcNo',
    op_src_url: 'opSrcUrl', op_src_no: 'opSrcNo', open_check_needed: 'openCheckNeeded',
  };
  // 서버 op_status(OPERATING|PLANNED) → 화면 opStatus('운영'|'개원 예정'). logic.isOpeningCourt·overlayExtras가 이 글자로 판정한다.
  const OP_LABEL = { OPERATING: '운영', PLANNED: '개원 예정' };

  serverdata.mapServerRow = function (row) {
    const rec = {};
    Object.keys(FIELD_MAP).forEach(function (k) {
      // 빈 문자열도 '값 없음' — DB의 '' 가 번들 값(지역 등)을 지우지 않게(qa 11-15 P3-3)
      if (row[k] !== null && row[k] !== undefined && row[k] !== '') rec[FIELD_MAP[k]] = row[k];
    });
    if (Object.prototype.hasOwnProperty.call(OP_LABEL, row.op_status)) rec.opStatus = OP_LABEL[row.op_status];
    // 편집 창의 초기값은 공고(bid_cases)로 덮이기 전의 기관 행 값이어야 한다 — applyBidCases가 contractEnd·confirmed를 덮으므로
    // 덮이기 전 값을 따로 둔다(030 서버 응답일 때만 — 옛 서버 응답엔 만들지 않는다).
    if (typeof row.contract_end_confirmed === 'boolean') {
      rec._inst = { contractEnd: row.contract_end || null, confirmed: row.contract_end_confirmed,
        srcUrl: row.contract_end_src_url || null, srcNo: row.contract_end_src_no || null };
    }
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
  // 같은 정규화 이름이 지역을 넘어 있을 수 있어(029 뒤 415행 — 부산·대구 중구 등) **지역까지 본다**.
  // 후보 우선순위: ① 지역이 같은 서버 행 ② 서버 지역이 빈 행 ③ (번들 지역이 비면) 첫 행.
  // 서버 지역이 있고 번들과 다르면 합치지 않는다. 지자체와 비지자체도 서로 합치지 않는다.
  // 일반구 반복행(수원 4구 등)은 번들 N행이 서버 1행을 같이 쓴다.
  function mergeKey(name) {
    return logic.normalizeMuniName(name);
  }
  function sameKind(a, b) { return !a || !b || (a === '지자체') === (b === '지자체'); }

  serverdata.mergeUnion = function (bundle, serverRows) {
    const entries = serverRows.map(function (r) {
      return { key: mergeKey(r.name_ko), rec: serverdata.mapServerRow(r) };
    });
    const byName = {};
    entries.forEach(function (e) { (byName[e.key] = byName[e.key] || []).push(e); });
    // 이름별 번들 지역 — ④ 폴백이 '그 지역에 번들 짝이 따로 있는 서버 행'을 가져가지 않게.
    const bundleRegions = {};
    bundle.forEach(function (b) {
      const k = mergeKey(b.name);
      (bundleRegions[k] = bundleRegions[k] || {})[b.region || ''] = true;
    });
    function pick(b) {
      const k = mergeKey(b.name);
      const ok = (byName[k] || []).filter(function (e) { return sameKind(e.rec.type, b.type); });
      return ok.filter(function (e) { return e.rec.region && e.rec.region === b.region; })[0] ||
             ok.filter(function (e) { return !e.rec.region; })[0] ||
             (!b.region ? ok[0] : null) ||
             // ④ 서버 쪽에서 지역을 고친 기관(편집 저장) — 같은 이름·종류의 서버 행이 하나뿐이고 그 지역에 번들 짝이
             //    없으면 합친다. 안 그러면 같은 기관이 번들 행·서버 행 두 장으로 갈라진다(qa 11-15 P2-1).
             (ok.length === 1 && !bundleRegions[k][ok[0].rec.region] ? ok[0] : null) || null;
    }
    const used = new Set();
    const out = bundle.map(function (b) {
      const e = pick(b);
      if (!e) return b;
      used.add(e);
      // 번들 이름을 남긴다 — 서버 필드로 덮으면 화면 표기가 `강동구청`에서
      // `강동구`로 조용히 바뀐다. 이름의 진실은 지도 번들 쪽이다(사용자 확정 ⓐ안).
      return Object.assign({}, b, e.rec, { name: b.name });
    });
    entries.forEach(function (e) { if (!used.has(e)) out.push(e.rec); });
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
      if (!b) {
        if (!r._bid) return r;
        const stale = Object.assign({}, r);   // 다시 적용할 때 공고가 없어졌으면 낡은 _bid를 지운다
        delete stale._bid;
        return stale;
      }
      const rec = Object.assign({}, r, {
        bidCaseId: b.bid_case_id,
        participationStatus: b.participation_status,
        participationDecision: b.participation_decision || [],
      });
      // 날짜가 없는 공고(일정 미상)면 기존 값을 남긴다 — 있던 정보를 지우지 않는다.
      // _bid = 이 날짜가 공고에서 왔다는 표시 — 편집 창 안내(기관 기본값과 다름)와 확정 출처 표시(공고 날짜면 숨김)가 쓴다.
      delete rec._bid;   // 공고에 날짜가 없으면 이 공고는 날짜를 덮지 않았다 — 이전 적용분의 표시를 남기지 않는다
      if (b.confirmed_date) { rec.contractEnd = b.confirmed_date; rec.confirmed = true; rec._bid = { date: b.confirmed_date, confirmed: true }; }
      else if (b.expected_date) { rec.contractEnd = b.expected_date; rec.confirmed = false; rec._bid = { date: b.expected_date, confirmed: false }; }
      return rec;
    });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = serverdata;
  else root.serverdata = serverdata;
})(typeof self !== 'undefined' ? self : this);
