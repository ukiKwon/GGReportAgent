const test = require('node:test');
const assert = require('node:assert');

// localStorage 메모리 팩토리
function makeLS() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
  };
}

// localStorage 스텁 (모듈 로드 전에 주입)
function freshLS() {
  global.localStorage = makeLS();
}
freshLS();
const store = require('../js/store.js');

test('toggleWatch: 추가/제거 토글 + 순서 유지', () => {
  freshLS();
  assert.deepStrictEqual(store.toggleWatch('11'), ['11']);
  assert.deepStrictEqual(store.toggleWatch('41'), ['11','41']);
  assert.deepStrictEqual(store.toggleWatch('11'), ['41']); // 재토글 제거
  assert.strictEqual(store.isWatched('41'), true);
});
test('reorderWatch: 자리 이동', () => {
  freshLS();
  store.toggleWatch('11'); store.toggleWatch('41'); store.toggleWatch('28');
  assert.deepStrictEqual(store.reorderWatch(2, 0), ['28','11','41']);
});
test('applyEdits: 이름 매칭 병합', () => {
  freshLS();
  store.setEdit('X구청', { contractEnd:'2027-05-01' });
  const merged = store.applyEdits([{ name:'X구청', type:'지자체', contractEnd:'2026-01-01' }]);
  assert.strictEqual(merged[0].contractEnd, '2027-05-01');
});

test('interest: 토글/조회 (♥, 관심지역과 별개 키)', () => {
  global.localStorage = makeLS();
  assert.strictEqual(store.isInterested('병원A'), false);
  store.toggleInterest('병원A');
  assert.strictEqual(store.isInterested('병원A'), true);
  store.toggleInterest('병원A');
  assert.strictEqual(store.isInterested('병원A'), false);
});

test('data: saveData/loadData 왕복', () => {
  global.localStorage = makeLS();
  assert.strictEqual(store.loadData(), null);
  store.saveData([{ name:'A' }]);
  assert.deepStrictEqual(store.loadData(), [{ name:'A' }]);
});
