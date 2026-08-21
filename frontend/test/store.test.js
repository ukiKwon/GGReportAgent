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

test('theme: 저장/로드 왕복 + 부분 저장 허용', () => {
  freshLS();
  assert.deepStrictEqual(store.loadTheme(), {});          // 기본은 빈 객체(=기본값 사용)
  store.saveTheme({ red:'#112233', rippleDuration:3 });
  assert.deepStrictEqual(store.loadTheme(), { red:'#112233', rippleDuration:3 });
});

test('theme: resetTheme은 저장값을 지워 기본값으로 되돌린다', () => {
  freshLS();
  store.saveTheme({ accent:'#ff0000' });
  assert.strictEqual(store.loadTheme().accent, '#ff0000');
  store.resetTheme();
  assert.deepStrictEqual(store.loadTheme(), {});
});

test('setServerData: loadData가 서버 리스트를 우선 반환하고 localStorage는 안 건드린다', function () {
  freshLS();
  store.setServerData([{ name: '도봉구' }]);
  assert.strictEqual(store.isServerMode(), true);
  assert.deepStrictEqual(store.loadData(), [{ name: '도봉구' }]);
  store.clearServerData();                                    // 뒤 테스트로 서버 모드를 흘리지 않는다
  assert.strictEqual(store.isServerMode(), false);
});

test('applyEdits: 서버 모드에서는 서버 필드 overlay를 무시하고 로컬 전용 필드만 덮는다', function () {
  freshLS();
  store.setEdit('도봉구', { contractEnd: '2020-01-01', sources: ['수기'] });
  store.setServerData([{ name: '도봉구', contractEnd: '2026-12-31' }]);

  const out = store.applyEdits(store.loadData());
  assert.strictEqual(out[0].contractEnd, '2026-12-31');      // 서버 값이 이긴다
  assert.deepStrictEqual(out[0].sources, ['수기']);           // 로컬 전용 필드는 유지
});

test('applyEdits: 폴백 모드에서는 기존대로 전체 overlay가 적용된다', function () {
  freshLS();
  store.clearServerData();                                    // 폴백 모드로 되돌림
  store.setEdit('도봉구', { contractEnd: '2020-01-01', sources: ['수기'] });

  const out = store.applyEdits([{ name: '도봉구', contractEnd: '2026-12-31' }]);
  assert.strictEqual(out[0].contractEnd, '2020-01-01');      // file://에선 overlay가 진실
  assert.deepStrictEqual(out[0].sources, ['수기']);
});

test('profile: 이름·소속 저장/로드 왕복, 기본값은 빈 문자열', function () {
  freshLS();
  assert.deepStrictEqual(store.loadProfile(), { name: '', team: '' });
  store.saveProfile({ name: '김 차장', team: '영업팀' });
  assert.deepStrictEqual(store.loadProfile(), { name: '김 차장', team: '영업팀' });
});

test('profile: 부분 저장도 나머지 키를 빈 문자열로 채운다', function () {
  freshLS();
  store.saveProfile({ name: '정 대리' });
  assert.deepStrictEqual(store.loadProfile(), { name: '정 대리', team: '' });
});

test('myRecipients: 쪽지함 조회 키는 소속과 이름 둘 다 (빈 값은 뺀다)', function () {
  freshLS();
  assert.deepStrictEqual(store.myRecipients(), []);
  store.saveProfile({ name: '김 차장', team: '영업팀' });
  assert.deepStrictEqual(store.myRecipients(), ['영업팀', '김 차장']);
  store.saveProfile({ name: '', team: '전산팀' });
  assert.deepStrictEqual(store.myRecipients(), ['전산팀']);
});

test('applyEdits: 공고가 있는 행은 로컬 확정여부가 공고를 덮지 못한다', function () {
  freshLS();
  store.setEdit('도봉구', { confirmed: false, sources: ['수기'] });
  store.setServerData([{ name: '도봉구', confirmed: true, bidCaseId: 'bc-1' }]);

  const out = store.applyEdits(store.loadData());
  assert.strictEqual(out[0].confirmed, true);      // 반입된 공고가 로컬 추측을 이긴다
  assert.deepStrictEqual(out[0].sources, ['수기']); // 다른 로컬 전용 필드는 그대로
  store.clearServerData();
});

test('applyEdits: 공고가 없는 행은 로컬 확정여부가 그대로 적용된다', function () {
  freshLS();
  store.setEdit('광진구', { confirmed: true });
  store.setServerData([{ name: '광진구', confirmed: false }]);

  assert.strictEqual(store.applyEdits(store.loadData())[0].confirmed, true);
  store.clearServerData();
});
