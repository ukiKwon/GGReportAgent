const test = require('node:test'), assert = require('node:assert');
const { qClassify, qIsPending, qElapsedDays, qDaysLabel, qOverdue, qSplit, qMd } = require('../fmt.js');
const NOW = new Date(2026, 10, 15, 9, 30); // 2026-11-15 로컬

test('qClassify: 알 수 없는 값은 미답(open)', () => {
  assert.strictEqual(qClassify({ status: 'done' }), 'done');
  assert.strictEqual(qClassify({ status: 'answered' }), 'answered');
  assert.strictEqual(qClassify({ status: 'hold' }), 'hold');
  assert.strictEqual(qClassify({ status: 'open' }), 'open');
  assert.strictEqual(qClassify({}), 'open');
  assert.strictEqual(qClassify(null), 'open');
});
test('qIsPending: open·hold 만 미답 수에 든다', () => {
  assert.deepStrictEqual(['open', 'hold', 'answered', 'done'].map(s => qIsPending({ status: s })), [true, true, false, false]);
});
test('qElapsedDays: 달력 날짜 차이(시각 무관), 미래·형식 오류 처리', () => {
  assert.strictEqual(qElapsedDays('2026-11-15', NOW), 0);
  assert.strictEqual(qElapsedDays('2026-11-12', NOW), 3);
  assert.strictEqual(qElapsedDays('2026-11-08', NOW), 7);
  assert.strictEqual(qElapsedDays('2026-11-07', NOW), 8);
  assert.strictEqual(qElapsedDays('2026-11-20', NOW), 0);
  assert.strictEqual(qElapsedDays('2026-10-31', NOW), 15);
  assert.strictEqual(qElapsedDays('', NOW), null);
  assert.strictEqual(qElapsedDays('어제', NOW), null);
  assert.strictEqual(qElapsedDays(undefined, NOW), null);
});
test('qDaysLabel·qOverdue: 7일 초과부터 경고', () => {
  assert.strictEqual(qDaysLabel(0), '오늘');
  assert.strictEqual(qDaysLabel(3), '3일째');
  assert.strictEqual(qDaysLabel(null), '');
  assert.strictEqual(qOverdue(7), false);
  assert.strictEqual(qOverdue(8), true);
  assert.strictEqual(qOverdue(null), false);
});
test('qMd: 날짜에서 월-일', () => {
  assert.strictEqual(qMd('2026-11-14'), '11-14');
  assert.strictEqual(qMd('x'), '');
  assert.strictEqual(qMd(undefined), '');
});
test('qSplit: 해소 전 질문은 최근에 물은 순(같은 날은 번호 큰 것 위, 날짜 없음은 맨 뒤), done 은 따로(최근 해소 먼저)', () => {
  const L = [
    { id: 'a', status: 'answered', askedAt: '2026-11-01' },
    { id: 'b', status: 'open', askedAt: '2026-11-10' },
    { id: 'c', status: 'hold', askedAt: '2026-11-05' },
    { id: 'd', status: 'done', askedAt: '2026-11-02', answeredAt: '2026-11-13' },
    { id: 'e', status: 'done', askedAt: '2026-11-03', answeredAt: '2026-11-14' },
    { id: 'f', status: 'open', askedAt: '2026-11-10' },
    { id: 'g', status: 'open' },
  ];
  const s = qSplit(L);
  assert.deepStrictEqual(s.active.map(q => q.id), ['f', 'b', 'c', 'a', 'g']);
  assert.deepStrictEqual(s.done.map(q => q.id), ['e', 'd']);
  assert.strictEqual(s.pendingCount, 4);
});
test('qSplit: 입력 불변·이상값 무시', () => {
  const L = [null, 3, { id: 1, status: 'open', askedAt: '2026-11-01' }];
  const copy = JSON.stringify(L);
  const s = qSplit(L);
  assert.strictEqual(JSON.stringify(L), copy);
  assert.strictEqual(s.active.length, 1);
  assert.deepStrictEqual(qSplit(undefined), { active: [], done: [], pendingCount: 0 });
  assert.deepStrictEqual(qSplit({}), { active: [], done: [], pendingCount: 0 });
});
