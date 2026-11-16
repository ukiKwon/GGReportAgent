// 대시보드 연출 판정 순수 함수(fmt.js) — NEXT 43 qa 케이스 ①~⑥. app.js는 이 함수들로 위임한다.
const test = require('node:test'), assert = require('node:assert');
const { lapIntOf, fatOf, isSplashOk, pickSplashCands, lastPourAfter, nextSplashAt, planetOf } = require('../fmt.js');

test('planetOf: 120층마다 다음 행성 1층부터(공사판 ③안, 11-16)', () => {
  assert.deepStrictEqual(planetOf(0, 3, 120), { planet: 0, floor: 1, total: 1 });
  assert.deepStrictEqual(planetOf(357, 3, 120), { planet: 0, floor: 120, total: 120 });
  assert.deepStrictEqual(planetOf(360, 3, 120), { planet: 1, floor: 1, total: 121 });
  assert.deepStrictEqual(planetOf(437, 3, 120), { planet: 1, floor: 26, total: 146 });
  assert.deepStrictEqual(planetOf(-5, 3, 120), { planet: 0, floor: 1, total: 1 });
  assert.deepStrictEqual(planetOf(NaN, 3, 120), { planet: 0, floor: 1, total: 1 });
  assert.deepStrictEqual(planetOf(359, 3, 120), { planet: 0, floor: 120, total: 120 });
  assert.deepStrictEqual(planetOf(720, 3, 120), { planet: 2, floor: 1, total: 241 });
  assert.strictEqual(planetOf(20000, 3, 120).planet, 55);
});
const CD = 60;
const R = (o) => Object.assign({ state: 'rest', lieAt: 0, active: false, slot: 0 }, o);

test('lapIntOf: 부동소수 경계(2.9999999999 -> 3)·0', () => {
  assert.strictEqual(lapIntOf(27.4), 27); assert.strictEqual(lapIntOf(3 - 1e-12), 3); assert.strictEqual(lapIntOf(0), 0);
});
test('① 병원 복귀: lapF 27.4, freshAt=lapIntOf -> 피로 0, 바퀴 수 불변', () => {
  const lapF = 27.4; assert.strictEqual(fatOf(lapF, 0), 27);
  const fresh = lapIntOf(lapF); assert.strictEqual(fatOf(lapF, fresh), 0); assert.strictEqual(lapIntOf(lapF), 27);
});
test('② +5 버튼: freshAt 10, lapF 12 -> 17 -> 피로 7', () => {
  assert.strictEqual(fatOf(12, 10), 2); assert.strictEqual(fatOf(12 + 5, 10), 7);
});
test('fatOf: freshAt 없음(undefined)이면 0으로 본다', () => assert.strictEqual(fatOf(16, undefined), 16));
test('isSplashOk: rest·누운 시각 있음·비활성만 참, null은 거짓', () => {
  assert.ok(isSplashOk(R({}))); assert.ok(!isSplashOk(R({ state: 'run' }))); assert.ok(!isSplashOk(R({ lieAt: null })));
  assert.ok(!isSplashOk(R({ active: true }))); assert.ok(!isSplashOk(null));
});
test('pickSplashCands: 대기 시간 미만 제외, lieAt 오름차순, 같으면 slot 순', () => {
  const L = [R({ slot: 5, lieAt: 10 }), R({ slot: 2, lieAt: 10 }), R({ slot: 1, lieAt: 4 }), R({ slot: 0, lieAt: 11 })];
  assert.deepStrictEqual(pickSplashCands(L, 13, 3).map(r => r.slot), [1, 2, 5]); // slot0은 2초
  assert.deepStrictEqual(pickSplashCands([], 99, 3), []);
});
test('pickSplashCands: 경계(정확히 wait초)는 포함, 원본 배열 순서는 그대로', () => {
  const L = [R({ slot: 3, lieAt: 10 }), R({ slot: 1, lieAt: 5 })];
  assert.deepStrictEqual(pickSplashCands(L, 13, 3).map(r => r.slot), [1, 3]);
  assert.deepStrictEqual(L.map(r => r.slot), [3, 1]);
});
test('③ 일반 쿨다운: 붓기 2회 중 2번째 hit=false -> 1번째 lastPour + 60', () => {
  let last = 0; last = lastPourAfter(last, true, 100); last = lastPourAfter(last, false, 130);
  assert.strictEqual(last, 100); assert.strictEqual(nextSplashAt(7, true, last, CD), 160);
});
test('④ 깨운 적 없는 회차: splashNext 불변', () => assert.strictEqual(nextSplashAt(123, false, 0, CD), 123));
test('⑤ reduced 도중 끔: rms.last 0이면 쿨다운 없음, t면 t+60', () => {
  assert.strictEqual(nextSplashAt(5, !!0, 0, CD), 5); assert.strictEqual(nextSplashAt(5, !!42, 42, CD), 102);
});
test('⑥ reduced 회차 종료: last=t -> t+60, last=0 -> 불변', () => {
  assert.strictEqual(nextSplashAt(0, !!200, 200, CD), 260); assert.strictEqual(nextSplashAt(9, !!0, 0, CD), 9);
});
