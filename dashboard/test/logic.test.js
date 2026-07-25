const test = require('node:test');
const assert = require('node:assert');
const logic = require('../js/logic.js');

test('logic module loads', () => {
  assert.strictEqual(typeof logic, 'object');
});

test('computeUrgency: 미상/무효 → gray', () => {
  const today = new Date('2026-07-23T00:00:00');
  assert.strictEqual(logic.computeUrgency(undefined, today), logic.URGENCY.GRAY);
  assert.strictEqual(logic.computeUrgency('not-a-date', today), logic.URGENCY.GRAY);
});

test('computeUrgency: 구간 경계', () => {
  const today = new Date('2026-07-23T00:00:00');
  assert.strictEqual(logic.computeUrgency('2026-08-01', today), logic.URGENCY.RED);    // 6개월 이내
  assert.strictEqual(logic.computeUrgency('2027-06-01', today), logic.URGENCY.ORANGE); // 1년 이내
  assert.strictEqual(logic.computeUrgency('2028-06-01', today), logic.URGENCY.YELLOW); // 2년 이내
  assert.strictEqual(logic.computeUrgency('2030-01-01', today), logic.URGENCY.BLUE);   // 2년 초과
  assert.strictEqual(logic.computeUrgency('2026-07-01', today), logic.URGENCY.RED);    // 이미 지남 → 최긴급
});

test('validateRecord: 필수는 name/type/region', () => {
  assert.strictEqual(logic.validateRecord({ name:'X', type:'공기업', region:'11' }).valid, true);
  const r = logic.validateRecord({ name:'X', type:'공기업' });
  assert.strictEqual(r.valid, false);
  assert.deepStrictEqual(r.missing, ['region']);
});

test('recordGlyph: ! 우선(필수누락), 그다음 ?(유효일 없음)', () => {
  assert.strictEqual(logic.recordGlyph({ name:'X', type:'공기업' }), '!'); // region 없음
  assert.strictEqual(logic.recordGlyph({ name:'X', type:'공기업', region:'11' }), '?'); // 날짜 없음
  assert.strictEqual(logic.recordGlyph({ name:'X', type:'공기업', region:'11', contractEnd:'2027-01-01' }), '');
});

test('markerShape 매핑', () => {
  assert.strictEqual(logic.markerShape('대학병원'), 'circle');
  assert.strictEqual(logic.markerShape('공기업'), 'square');
  assert.strictEqual(logic.markerShape('공공기관'), 'triangle');
  assert.strictEqual(logic.markerShape('지자체'), 'polygon');
  assert.strictEqual(logic.markerShape('학교'), 'diamond'); // 미정의 폴백
});

test('visibleMarkers: 지자체 제외 + 유형 필터 + 미정의 항상표시', () => {
  const list = [
    { name:'구청', type:'지자체', region:'11' },
    { name:'병원', type:'대학병원', region:'11' },
    { name:'공사', type:'공기업', region:'11' },
    { name:'학교', type:'대학교', region:'11' },
  ];
  const enabled = new Set(['대학병원']); // 공기업 꺼짐
  const vis = logic.visibleMarkers(list, enabled).map(r => r.name);
  assert.deepStrictEqual(vis.sort(), ['병원','학교'].sort()); // 지자체 제외, 공기업 제외, 학교(미정의) 표시
});

test('sortByUrgency: 임박순 + 미상 뒤로', () => {
  const today = new Date('2026-07-23T00:00:00');
  const list = [
    { name:'미상', region:'11' },
    { name:'멂', contractEnd:'2029-01-01' },
    { name:'임박', contractEnd:'2026-08-01' },
  ];
  assert.deepStrictEqual(logic.sortByUrgency(list, today).map(r => r.name), ['임박','멂','미상']);
});

test('esc: & < > " \' 를 모두 엔티티로 변환', () => {
  assert.strictEqual(logic.esc('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  assert.strictEqual(logic.esc('<script>alert("x")</script>'),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('esc: 일반 문자열/숫자는 그대로(문자열화만)', () => {
  assert.strictEqual(logic.esc('서울 구청 A-1'), '서울 구청 A-1');
  assert.strictEqual(logic.esc(123), '123');
  assert.strictEqual(logic.esc(''), '');
});

test('ALL_FIELDS: 신규 스키마 필드', () => {
  assert.deepStrictEqual(logic.ALL_FIELDS,
    ['name','type','region','term','lastBid','contractEnd','confirmed','lng','lat','sources','updatedAt']);
});

test('formatBidDate: 괄호 표기', () => {
  assert.strictEqual(logic.formatBidDate({ contractEnd:'2026-12-03', confirmed:true }), '2026-12-03(확정)');
  assert.strictEqual(logic.formatBidDate({ contractEnd:'2026-12-03' }), '2026-12-03(추측)');
  assert.strictEqual(logic.formatBidDate({ lastBid:'2022-12-05', term:2 }), '2024-12-05(추측)');
  assert.strictEqual(logic.formatBidDate({}), '미상');
});

test('FIELD_LABELS: 한글 라벨 매핑', () => {
  assert.strictEqual(logic.FIELD_LABELS.contractEnd, '입찰예상일');
  assert.strictEqual(logic.FIELD_LABELS.term, '입찰주기');
});

test('addYears: 정수 년 더하기', () => {
  assert.strictEqual(logic.addYears('2022-12-05', 2), '2024-12-05');
  assert.strictEqual(logic.addYears('2020-02-29', 1), '2021-03-01'); // 윤일 롤오버
  assert.strictEqual(logic.addYears('', 2), null);
  assert.strictEqual(logic.addYears('bad', 2), null);
});

test('effectiveBid: 확정/추측/미상 유도', () => {
  // 확정: 날짜 + confirmed
  assert.deepStrictEqual(logic.effectiveBid({ contractEnd:'2026-12-03', confirmed:true }),
    { date:'2026-12-03', confidence:'확정' });
  // 추측: 날짜 있으나 confirmed 아님(기본)
  assert.deepStrictEqual(logic.effectiveBid({ contractEnd:'2026-12-03' }),
    { date:'2026-12-03', confidence:'추측' });
  // 추측: 날짜 없고 지난입찰일+주기 → 계산
  assert.deepStrictEqual(logic.effectiveBid({ lastBid:'2022-12-05', term:2 }),
    { date:'2024-12-05', confidence:'추측' });
  // 미상: 아무것도 없음
  assert.deepStrictEqual(logic.effectiveBid({}), { date:null, confidence:'미상' });
});

test('urgencyOf: effectiveBid 기반', () => {
  const today = new Date('2026-07-23T00:00:00');
  assert.strictEqual(logic.urgencyOf({ contractEnd:'2026-08-01', confirmed:true }, today), logic.URGENCY.RED);
  assert.strictEqual(logic.urgencyOf({ lastBid:'2022-01-01', term:4 }, today), logic.URGENCY.RED); // 2026-01-01
  assert.strictEqual(logic.urgencyOf({}, today), logic.URGENCY.GRAY);
});

test('sortByUrgency: effectiveBid(추측 포함) 기준 임박순', () => {
  const today = new Date('2026-07-23T00:00:00');
  const list = [
    { name:'미상' },
    { name:'추측멂', lastBid:'2025-01-01', term:4 }, // 2029-01-01
    { name:'확정임박', contractEnd:'2026-08-01', confirmed:true },
  ];
  assert.deepStrictEqual(logic.sortByUrgency(list, today).map(r=>r.name), ['확정임박','추측멂','미상']);
});

test('sortByInterest: 관심 먼저(임박순) 그 뒤 미관심(임박순)', () => {
  const today = new Date('2026-07-23T00:00:00');
  const list = [
    { name:'미관심임박', contractEnd:'2026-08-01', confirmed:true },
    { name:'관심멂', contractEnd:'2029-01-01', confirmed:true },
    { name:'관심임박', contractEnd:'2026-09-01', confirmed:true },
  ];
  const hearts = new Set(['관심멂','관심임박']);
  const out = logic.sortByInterest(list, today, r => hearts.has(r.name)).map(r=>r.name);
  assert.deepStrictEqual(out, ['관심임박','관심멂','미관심임박']);
});
