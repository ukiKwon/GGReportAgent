const test = require('node:test');
const assert = require('node:assert');
const sd = require('../js/serverdata.js');

test('mapServerRow: 서버 필드명을 대시보드 스키마로 옮긴다', function () {
  const rec = sd.mapServerRow({
    institution_id: 'dobong', name_ko: '도봉구', region_code: '11',
    type: '지자체', contract_end: '2026-12-31', last_bid: '2022-12-01',
    term: 4, stage: 6,
  });
  assert.deepStrictEqual(rec, {
    institutionId: 'dobong', name: '도봉구', region: '11', type: '지자체',
    contractEnd: '2026-12-31', lastBid: '2022-12-01', term: 4, stage: 6,
  });
});

// ── 기관 추가의 서버 경로 (POST /institutions) ────────────────────────
// mapServerRow의 반대 방향. 서버에 없는 로컬 전용 필드(좌표·출처·확정여부 등)는
// 보내지 않는다 — 그 값들은 store overlay가 유일한 저장처다.

test('toServerRow: 서버가 아는 필드만 서버 이름으로 보낸다', function () {
  const body = sd.toServerRow({
    name: '새로운구청', type: '지자체', region: '11', term: 4,
    lastBid: '2022-05-01', contractEnd: '2026-05-01',
    subRegion: '11010', lng: 127.0, lat: 37.5, sources: ['a'], confirmed: true,
  });
  assert.deepStrictEqual(body, {
    name_ko: '새로운구청', type: '지자체', region_code: '11', term: 4,
    last_bid: '2022-05-01', contract_end: '2026-05-01',
  });
});

test('toServerRow: 빈 칸은 키를 만들지 않는다', function () {
  const body = sd.toServerRow({ name: '새로운구청', type: '', region: undefined });
  assert.deepStrictEqual(body, { name_ko: '새로운구청' });
});

test('toServerRow: 이름 앞뒤 공백은 떼고 보낸다', function () {
  assert.strictEqual(sd.toServerRow({ name: '  새로운구청 ' }).name_ko, '새로운구청');
});

test('mapServerRow: null 필드는 키를 만들지 않는다', function () {
  const rec = sd.mapServerRow({ institution_id: 'x', name_ko: '엑스', region_code: null,
    type: null, contract_end: null, last_bid: null, term: null, stage: 1 });
  assert.strictEqual('region' in rec, false);
  assert.strictEqual('contractEnd' in rec, false);
});

test('mergeUnion: 서버 필드 우선, 번들 전용 필드 보존, 순서 유지', function () {
  const bundle = [
    { name: '도봉구', region: '11', contractEnd: '2026-01-01', confidence: '확정',
      sources: ['공고'], lng: 127.0, lat: 37.6 },
    { name: '서울대병원', region: '11', contractEnd: '2027-01-01', confidence: '추측', sources: ['기사'] },
  ];
  const server = [
    { institution_id: 'dobong', name_ko: '도봉구', region_code: null, type: '지자체',
      contract_end: '2026-12-31', last_bid: null, term: 4, stage: 6 },
    { institution_id: 'nowon', name_ko: '노원구', region_code: '11', type: '지자체',
      contract_end: null, last_bid: null, term: null, stage: 2 },
  ];
  const out = sd.mergeUnion(bundle, server);

  assert.strictEqual(out.length, 3);
  const dobong = out[0];
  assert.strictEqual(dobong.contractEnd, '2026-12-31');   // 서버 우선
  assert.strictEqual(dobong.region, '11');                // 서버 null → 번들 유지
  assert.deepStrictEqual(dobong.sources, ['공고']);        // 번들 전용 필드 보존
  assert.strictEqual(dobong.lng, 127.0);
  assert.strictEqual(dobong.stage, 6);                     // 서버 전용 필드 노출
  assert.strictEqual(out[1].name, '서울대병원');            // 서버에 없는 번들 행 유지
  assert.strictEqual(out[2].name, '노원구');                // 번들에 없는 서버 행 추가
});

const BIDCASES = [
  { institution_id: 'dobong', bid_case_id: 'bc-1', schedule_confidence: '확정',
    expected_date: '2026-05-05', confirmed_date: '2026-09-30',
    participation_status: '검토중', participation_decision: [] },
  { institution_id: 'nowon', bid_case_id: 'bc-2', schedule_confidence: '예상',
    expected_date: '2026-11-11', confirmed_date: null,
    participation_status: '검토중', participation_decision: [{ tier: 1 }] },
];

test('applyBidCases: 확정일이 있으면 그것이 입찰일이고 확정 표시가 된다', function () {
  const out = sd.applyBidCases(
    [{ name: '도봉구', institutionId: 'dobong', contractEnd: '2026-01-01', confirmed: false }],
    BIDCASES);
  assert.strictEqual(out[0].contractEnd, '2026-09-30');   // CSV 값을 이긴다
  assert.strictEqual(out[0].confirmed, true);
  assert.strictEqual(out[0].bidCaseId, 'bc-1');
  assert.strictEqual(out[0].participationStatus, '검토중');
});

test('applyBidCases: 확정일이 없으면 예상일 + 추측 표시', function () {
  const out = sd.applyBidCases(
    [{ name: '노원구', institutionId: 'nowon', contractEnd: '2026-01-01', confirmed: true }],
    BIDCASES);
  assert.strictEqual(out[0].contractEnd, '2026-11-11');
  assert.strictEqual(out[0].confirmed, false);            // 예상이면 확정 표시를 내린다
  assert.deepStrictEqual(out[0].participationDecision, [{ tier: 1 }]);
});

test('applyBidCases: 공고가 없는 기관은 손대지 않는다 (CSV 값 보존)', function () {
  const rec = { name: '광진구', institutionId: 'gwangjin', contractEnd: '2026-03-03', confirmed: true };
  const out = sd.applyBidCases([rec], BIDCASES);
  assert.strictEqual(out[0].contractEnd, '2026-03-03');
  assert.strictEqual(out[0].confirmed, true);
  assert.strictEqual('bidCaseId' in out[0], false);
});

test('applyBidCases: 날짜가 둘 다 없는 공고면 일정은 그대로 두고 결재 정보만 싣는다', function () {
  const out = sd.applyBidCases(
    [{ name: '도봉구', institutionId: 'dobong', contractEnd: '2026-01-01', confirmed: true }],
    [{ institution_id: 'dobong', bid_case_id: 'bc-x', expected_date: null, confirmed_date: null,
       participation_status: '검토중', participation_decision: [] }]);
  assert.strictEqual(out[0].contractEnd, '2026-01-01');
  assert.strictEqual(out[0].confirmed, true);
  assert.strictEqual(out[0].bidCaseId, 'bc-x');           // 참여 결정 카드는 여전히 필요하다
});

test('applyBidCases: 빈 입력도 안전하고 원본을 변형하지 않는다', function () {
  const rec = { name: '도봉구', institutionId: 'dobong', contractEnd: '2026-01-01' };
  const out = sd.applyBidCases([rec], null);
  assert.deepStrictEqual(out, [rec]);
  sd.applyBidCases([rec], BIDCASES);
  assert.strictEqual(rec.contractEnd, '2026-01-01');      // 원본 불변
});

// ── 번들·서버의 이름 표기 차이 (2026-08-21) ─────────────────────────────
// 지도 번들은 서울·경기를 `OO구청`/`OO시청`으로 부르고 서버 registry는 `OO구`로
// 부른다. 원본 문자열로 맞추던 시절에는 25개 구가 전부 어긋나 **같은 구가 카드
// 두 장**으로 떴다(서울 지자체 25 → 50). 지도의 municipalityForFeature는 이미
// logic.normalizeMuniName으로 둘을 같은 구로 보고 있었으므로, 병합도 같은 기준을 쓴다.

test("mergeUnion: '구청'과 '구'는 같은 기관이다 — 카드가 두 장이 되지 않는다", function () {
  const bundle = [{ name: '강동구청', region: '11', subRegion: '11250', term: 4, sources: ['번들'] }];
  const server = [{ institution_id: 'gangdong', name_ko: '강동구', region_code: '11',
                    type: '지자체', contract_end: '2026-12-31', stage: 3 }];
  const out = sd.mergeUnion(bundle, server);

  assert.strictEqual(out.length, 1);                       // 예전에는 2였다
  assert.strictEqual(out[0].institutionId, 'gangdong');    // 서버 필드가 실렸고
  assert.strictEqual(out[0].contractEnd, '2026-12-31');
  assert.strictEqual(out[0].subRegion, '11250');           // 번들 전용 필드도 남았다
});

test('mergeUnion: 병합해도 화면에 남는 이름은 번들 것이다', function () {
  // 서버 이름으로 덮으면 표기가 `강동구청` → `강동구`로 조용히 바뀐다.
  // 이름의 진실은 지도 번들 쪽이라는 것이 사용자 확정(ⓐ안)이다.
  const out = sd.mergeUnion(
    [{ name: '강동구청', region: '11' }],
    [{ institution_id: 'gangdong', name_ko: '강동구', region_code: '11' }]);
  assert.strictEqual(out[0].name, '강동구청');
});

test('mergeUnion: 서버에만 있는 기관은 서버 이름 그대로 붙는다', function () {
  const out = sd.mergeUnion(
    [{ name: '강동구청', region: '11' }],
    [{ institution_id: 'gangdong', name_ko: '강동구' },
     { institution_id: 'jung', name_ko: '중구' }]);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[1].name, '중구');
});

test('mergeUnion: 서로 다른 구는 여전히 따로 남는다', function () {
  // '청'을 벗기는 정규화가 지나쳐서 엉뚱한 것끼리 합쳐지지 않는지 본다.
  const out = sd.mergeUnion(
    [{ name: '강동구청', region: '11' }, { name: '강서구청', region: '11' }],
    [{ institution_id: 'gangdong', name_ko: '강동구' }]);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[1].name, '강서구청');
  assert.strictEqual(out[1].institutionId, undefined);   // 안 합쳐졌다
});
