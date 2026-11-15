// 029(기관 415행) 뒤 서버 ↔ 번들 합치기(2026-11-15).
// 근거: handoff/agents/frontend-dev 11-15 보고(합치기 키: 지역+정규화 이름, 지자체/비지자체 분리),
//       data-auditor 11-15 보고(029 ↔ 묶음 대조: 서울 25 이름 표기 차이, 일반구 반복 21, 개원 예정 법원 6 모두 DB에 있음).
const test = require('node:test');
const assert = require('node:assert');
const sd = require('../js/serverdata.js');
const logic = require('../js/logic.js');
const store = require('../js/store.js');
const render = require('../js/render.js');
const nonmuni = require('../data/institutions_nonmuni.js');

test('mergeUnion: 같은 이름이 다른 지역에 있으면 지역이 같은 쪽에만 붙는다', () => {
  const out = sd.mergeUnion(
    [{ name: '중구청', region: '11', type: '지자체' }, { name: '중구청', region: '28', type: '지자체' }],
    [{ institution_id: 'jung', name_ko: '중구', region_code: '11', type: '지자체' }]);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].institutionId, 'jung');
  assert.strictEqual(out[1].institutionId, undefined);
  assert.strictEqual(out[1].region, '28');   // 지역이 오염되지 않는다
});

test('mergeUnion: 지자체와 비지자체는 이름이 같아 보여도 합치지 않는다', () => {
  const out = sd.mergeUnion([{ name: '서울시청', region: '11', type: '지자체' }],
    [{ institution_id: 'x', name_ko: '서울시', region_code: '11', type: '공공기관' }]);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].institutionId, undefined);
});

test('mergeUnion: 일반구 반복행 N개가 서버 1행을 같이 쓰고 서버 행은 다시 붙지 않는다', () => {
  const b = [1, 2, 3].map(n => ({ name: '수원시청', region: '41', type: '지자체', subRegion: '3101' + n }));
  const out = sd.mergeUnion(b, [{ institution_id: 'lg-41-x', name_ko: '수원시청', region_code: '41', type: '지자체' }]);
  assert.strictEqual(out.length, 3);
  assert.ok(out.every(r => r.institutionId === 'lg-41-x' && r.subRegion));
});

test('mergeUnion: 짝 없는 서버 행은 서버 응답 순서대로 뒤에 붙는다', () => {
  const out = sd.mergeUnion([{ name: '마포구청', region: '11', type: '지자체' }], [
    { institution_id: 'b', name_ko: '나기관', region_code: '46', type: '공공기관' },
    { institution_id: 'mapo', name_ko: '마포구', region_code: '11', type: '지자체' },
    { institution_id: 'a', name_ko: '가기관', region_code: '46', type: '공공기관' }]);
  assert.deepStrictEqual(out.map(r => r.institutionId), ['mapo', 'b', 'a']);
  assert.strictEqual(out[0].name, '마포구청');   // 번들 이름 유지
});

test('mergeUnion: 서버에서 지역을 고친 기관은 그 지역에 번들 짝이 없으면 한 장으로 합치고 서버 지역을 따른다', () => {
  const out = sd.mergeUnion([{ name: '마포구청', region: '11', type: '지자체', lat: 1 }],
    [{ institution_id: 'mapo', name_ko: '마포구', region_code: '41', type: '지자체' }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].institutionId, 'mapo');
  assert.strictEqual(out[0].region, '41');
  assert.strictEqual(out[0].lat, 1);   // 번들 좌표 보존
});

test('mergeUnion: 서버 지역이 빈 문자열이면 번들 지역을 지우지 않는다', () => {
  const out = sd.mergeUnion([{ name: '도봉구청', region: '11', type: '지자체' }],
    [{ institution_id: 'dobong', name_ko: '도봉구', region_code: '', type: '지자체' }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].institutionId, 'dobong');
  assert.strictEqual(out[0].region, '11');
});

test('번들 모드(서버 없음): allInstitutions = 지자체 묶음 + 개원 예정 아닌 지자체 외, 순서 그대로', () => {
  const muni = [{ name: '가구청', region: '11', type: '지자체' }, { name: '나시청', region: '41', type: '지자체' }];
  global.window = { institutions: muni, institutionsNonMuni: nonmuni };
  store.clearServerData();
  try {
    const all = render.allInstitutions();
    const want = muni.concat(nonmuni.filter(r => !logic.isOpeningCourt(r)));
    assert.deepStrictEqual(all.map(logic.instKey), want.map(logic.instKey));
  } finally {
    delete global.window;
  }
});

test('지자체 외 번들 instKey는 유일하다(overlayExtras가 조용히 하나만 얹지 않게)', () => {
  assert.strictEqual(new Set(nonmuni.map(logic.instKey)).size, nonmuni.length);
});

test('overlayExtras: 서버 최소행 위에 번들 칸을 되살리고 서버 값이 이긴다', () => {
  const base = [{ institutionId: 'g2b-B552635', name: '사립학교교직원연금공단', region: '46', type: '공공기관', stage: 1, lastBid: '2026-03-19' }];
  const extras = [
    { name: '사립학교교직원연금공단', region: '46', type: '공공기관', bank: '국민은행', confirmed: true, lastBid: '2020-01-01' },
    { name: '전주가정법원 남원지원', region: '45', type: '법원', opStatus: '개원 예정' }];
  const out = logic.overlayExtras(base, extras);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].bank, '국민은행');
  assert.strictEqual(out[0].confirmed, true);
  assert.strictEqual(out[0].institutionId, 'g2b-B552635');
  assert.strictEqual(out[0].lastBid, '2026-03-19');   // 서버 우선
  assert.strictEqual(out[1].name, '전주가정법원 남원지원');
});

test('isOpeningCourt: 개원 예정 법원만 참', () => {
  assert.ok(logic.isOpeningCourt({ type: '법원', opStatus: '개원 예정' }));
  assert.ok(!logic.isOpeningCourt({ type: '법원', opStatus: '운영' }));
  assert.ok(!logic.isOpeningCourt({ type: '공공기관', opStatus: '개원 예정' }));
  assert.ok(!logic.isOpeningCourt(null));
});

test('서버 모드: DB에서 온 개원 예정 법원은 빠지고, 지자체 외 서버 최소행에 번들 칸이 되살아난다', () => {
  const planned = nonmuni.find(r => logic.isOpeningCourt(r));
  const rich = nonmuni.find(r => !logic.isOpeningCourt(r) && r.bank);
  assert.ok(planned && rich, '데이터에 개원 예정 법원·은행 있는 기관이 있어야 의미가 있다');
  global.window = { institutionsNonMuni: nonmuni };
  store.setServerData([
    { institutionId: 'nm-x', name: planned.name, region: planned.region, type: '법원', stage: 1 },
    { institutionId: 'g2b-y', name: rich.name, region: rich.region, type: rich.type, stage: 1 }]);
  try {
    const all = render.allInstitutions();
    assert.ok(!all.some(r => r.name === planned.name && r.region === planned.region), '개원 예정 법원이 남았다');
    const hits = all.filter(r => logic.instKey(r) === logic.instKey(rich));
    assert.strictEqual(hits.length, 1, '같은 기관이 두 번 나온다');
    assert.strictEqual(hits[0].bank, rich.bank);          // DB에 없는 은행이 돌아온다
    assert.strictEqual(hits[0].institutionId, 'g2b-y');   // 서버 id는 유지
    // 서버 2행(그중 1행은 번들과 겹침) + 나머지 번들 지자체 외 − 개원 예정 전부
    const openCount = nonmuni.filter(r => !logic.isOpeningCourt(r)).length;
    assert.strictEqual(all.length, openCount);
  } finally {
    store.clearServerData();
    delete global.window;
  }
});
