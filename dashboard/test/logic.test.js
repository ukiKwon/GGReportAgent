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

test('validateRecord: 필수필드 누락 감지', () => {
  const bad = { name:'X', type:'공기업' }; // region/confidence/sources 없음
  const r = logic.validateRecord(bad);
  assert.strictEqual(r.valid, false);
  assert.deepStrictEqual(r.missing.sort(), ['confidence','region','sources'].sort());
});

test('validateRecord: sources 빈 배열은 누락', () => {
  const rec = { name:'X', type:'공기업', region:'11', confidence:'추정', sources:[] };
  assert.strictEqual(logic.validateRecord(rec).valid, false);
  assert.ok(logic.validateRecord(rec).missing.includes('sources'));
});

test('recordGlyph: ! 우선, 그다음 ?', () => {
  const broken = { name:'X', type:'공기업' };
  assert.strictEqual(logic.recordGlyph(broken), '!');
  const noDate = { name:'X', type:'공기업', region:'11', confidence:'확정', sources:['s'] };
  assert.strictEqual(logic.recordGlyph(noDate), '?');
  const ok = Object.assign({}, noDate, { contractEnd:'2027-01-01' });
  assert.strictEqual(logic.recordGlyph(ok), '');
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
