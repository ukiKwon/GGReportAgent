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
