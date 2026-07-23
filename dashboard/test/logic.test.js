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
