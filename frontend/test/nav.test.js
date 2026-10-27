const test = require('node:test');
const assert = require('node:assert');
const nav = require('../js/nav.js');
const menuRules = require('../js/menu_rules.js');

const ALL_ON = { map: true, regions: true, workflow: true, chat: true, knowledge: true,
                 tasks: true, approvals: true, admin: true };
const GUEST = { map: true, regions: true, workflow: false, chat: false, knowledge: false,
                tasks: false, approvals: false, admin: false };

function ids(built) { return built.map(function (c) { return c.id; }); }
function items(built, catId) {
  return built.filter(function (c) { return c.id === catId; })[0].items;
}

test('MENU_KEYS 8개는 전부 어딘가의 항목으로 재배치돼 있다(빠진 화면이 없다)', function () {
  const placed = [];
  nav.CATEGORIES.forEach(function (c) { c.items.forEach(function (i) { if (i.key) placed.push(i.key); }); });
  assert.deepStrictEqual(placed.slice().sort(), menuRules.MENU_KEYS.slice().sort());
});

test('같은 화면(key)을 두 항목에 걸지 않는다', function () {
  const keys = [];
  nav.CATEGORIES.forEach(function (c) { c.items.forEach(function (i) { if (i.key) keys.push(i.key); }); });
  assert.strictEqual(new Set(keys).size, keys.length);
});

test('영업팀장: 6개 업무 카테고리 + 시스템(권한관리 꺼짐이면 빠짐)', function () {
  const v = Object.assign({}, ALL_ON, { admin: false });
  const built = nav.build(v, { role: '영업팀장' });
  assert.deepStrictEqual(ids(built), ['opp', 'bid', 'match', 'docs', 'collab', 'result']);
});

test('서버가 끈 화면은 하위 항목에서도 사라진다', function () {
  const v = Object.assign({}, ALL_ON, { approvals: false, admin: false });
  const labels = items(nav.build(v, { role: '영업팀장' }), 'collab').map(function (i) { return i.label; });
  assert.ok(labels.indexOf('결재함') < 0);
  assert.ok(labels.indexOf('작업함') >= 0);
});

test('준비중 항목은 영업 계열(영업팀·팀장·부장·디자이너·마스터)에게만 보인다', function () {
  ['영업팀', '영업팀장', '영업부장', '디자이너'].forEach(function (role) {
    assert.ok(nav.build(ALL_ON, { role: role }).some(function (c) { return c.id === 'match'; }), role);
  });
  assert.ok(nav.build(ALL_ON, { role: '전산팀', master: true }).some(function (c) { return c.id === 'match'; }));
  ['전산팀', '전산팀장', '예산팀', '예산팀장', ''].forEach(function (role) {
    assert.ok(!nav.build(ALL_ON, { role: role }).some(function (c) { return c.id === 'match'; }), role);
  });
});

test('둘러보기(역할 없음): 지도·지역별만, 준비중 없음', function () {
  const built = nav.build(GUEST, { role: '' });
  assert.deepStrictEqual(ids(built), ['opp']);
  assert.deepStrictEqual(items(built, 'opp').map(function (i) { return i.key; }), ['map', 'regions']);
});

test('비영업 팀의 카테고리는 구현된 화면만 남는다(빈 카테고리는 뺀다)', function () {
  const v = Object.assign({}, ALL_ON, { approvals: false, admin: false });
  const built = nav.build(v, { role: '예산팀' });
  assert.deepStrictEqual(ids(built), ['opp', 'docs', 'collab']);
  items(built, 'collab').forEach(function (i) { assert.strictEqual(i.soon, false); });
});

test('준비중 항목 id는 안정적이고 서로 다르다', function () {
  const built = nav.build(ALL_ON, { role: '영업팀장' });
  const all = [];
  built.forEach(function (c) { c.items.forEach(function (i) { all.push(i.id); }); });
  assert.strictEqual(new Set(all).size, all.length);
  assert.ok(items(built, 'match')[0].id.indexOf('soon:match:') === 0);
});

test('엑셀→워드 자동 기입은 제안서 자료 관리 아래 준비중으로 있다', function () {
  const it = items(nav.build(ALL_ON, { role: '영업팀' }), 'docs')
    .filter(function (i) { return i.label.indexOf('엑셀') >= 0; })[0];
  assert.ok(it && it.soon);
});

test('categoryOf / showsMapControls', function () {
  const built = nav.build(ALL_ON, { role: '영업팀' });
  assert.strictEqual(nav.categoryOf(built, 'approvals'), 'collab');
  assert.strictEqual(nav.categoryOf(built, 'nope'), null);
  assert.strictEqual(nav.showsMapControls('map'), true);
  assert.strictEqual(nav.showsMapControls('regions'), true);
  assert.strictEqual(nav.showsMapControls('workflow'), false);
  assert.strictEqual(nav.showsMapControls('designer'), false);
});
