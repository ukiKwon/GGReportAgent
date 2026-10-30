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
  const placed = new Set();
  nav.CATEGORIES.forEach(function (c) { c.items.forEach(function (i) { if (i.key) placed.add(i.key); }); });
  assert.deepStrictEqual(Array.from(placed).sort(), menuRules.MENU_KEYS.slice().sort());
});

test('같은 화면을 두 항목에 걸지 않는다(화면 = key + view)', function () {
  const ids = [];
  nav.CATEGORIES.forEach(function (c) {
    c.items.forEach(function (i) { if (i.key) ids.push(i.key + ':' + (i.view || '')); });
  });
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('시스템 관리: 사용자·권한·메뉴·접근 이력 4항목이 admin 키 하나를 나눠 쓴다', function () {
  const built = nav.build(ALL_ON, { role: '전산팀', master: true });
  const sys = built.filter(function (c) { return c.id === 'sys'; })[0];
  assert.strictEqual(sys.title, '시스템 관리');
  assert.deepStrictEqual(sys.items.map(function (i) { return i.id; }),
    ['admin:users', 'admin:perms', 'admin:menus', 'admin:audit']);
  assert.deepStrictEqual(sys.items.map(function (i) { return i.label; }),
    ['사용자 관리', '권한 관리', '메뉴 관리', '접근 이력']);
  sys.items.forEach(function (i) { assert.strictEqual(i.key, 'admin'); assert.strictEqual(i.soon, false); });
  assert.strictEqual(nav.categoryOf(built, 'admin:audit'), 'sys');
});

test('admin 권한이 꺼지면 시스템 관리 전체가 사라진다', function () {
  const v = Object.assign({}, ALL_ON, { admin: false });
  assert.ok(!nav.build(v, { role: '영업팀' }).some(function (c) { return c.id === 'sys'; }));
});

test('영업팀장: 6개 업무 카테고리 + 시스템(권한관리 꺼짐이면 빠짐) — 구현 있는 곳 먼저', function () {
  const v = Object.assign({}, ALL_ON, { admin: false });
  const built = nav.build(v, { role: '영업팀장' });
  assert.deepStrictEqual(ids(built), ['opp', 'docs', 'collab', 'bid', 'match', 'result']);
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

test('준비중 항목 id는 라벨 기반으로 안정적이고 서로 다르다', function () {
  const built = nav.build(ALL_ON, { role: '영업팀장' });
  const all = [];
  built.forEach(function (c) { c.items.forEach(function (i) { all.push(i.id); }); });
  assert.strictEqual(new Set(all).size, all.length);
  assert.strictEqual(items(built, 'match')[0].id, 'soon:팀원 배정 요청·일정');
  // 항목이 카테고리를 옮겨도 id가 같다(이사회 자료: opp → collab)
  assert.strictEqual(items(built, 'collab').filter(function (i) { return i.soon; })[0].id, 'soon:이사회 자료');
});

test('이사회 자료는 제안 진행·승인 아래 "구현 예정", 기관 현황에는 없다', function () {
  const built = nav.build(ALL_ON, { role: '영업팀' });
  assert.strictEqual(built.filter(function (c) { return c.id === 'collab'; })[0].title, '제안 진행·승인');
  const board = items(built, 'collab').filter(function (i) { return i.label === '이사회 자료'; })[0];
  assert.ok(board && board.soon);
  assert.strictEqual(board.tag, '구현 예정');
  assert.ok(board.note.indexOf('이사회') >= 0);
  assert.ok(!items(built, 'opp').some(function (i) { return i.label === '이사회 자료'; }));
  assert.ok(!items(built, 'docs').some(function (i) { return i.label.indexOf('엑셀') >= 0; }));
  assert.strictEqual(items(built, 'match')[0].tag, '준비중');
  assert.deepStrictEqual(items(built, 'opp').map(function (i) { return i.label; }),
    ['전국 지도', '전국 지역별', '기관 이력·협약 현황', '영업 메모·활동 이력']);
});

test('openTab: 새 탭은 뒤에 붙고 활성이 된다, 이미 있으면 활성만 이동', function () {
  let r = nav.openTab([], { id: 'map', label: '전국 지도' }, null);
  assert.deepStrictEqual(r.tabs.map(function (t) { return t.id; }), ['map']);
  assert.strictEqual(r.activeId, 'map');
  r = nav.openTab(r.tabs, { id: 'chat', label: '대화' }, r.activeId);
  r = nav.openTab(r.tabs, { id: 'map', label: '전국 지도' }, r.activeId);
  assert.deepStrictEqual(r.tabs.map(function (t) { return t.id; }), ['map', 'chat']);
  assert.strictEqual(r.activeId, 'map');
  assert.strictEqual(r.full, false);
});

test('openTab: 10개가 차면 새 탭은 못 열고 full, 기존 탭으로의 이동은 가능', function () {
  assert.strictEqual(nav.MAX_TABS, 10);
  let tabs = [];
  let active = null;
  for (let i = 0; i < 10; i += 1) {
    const r = nav.openTab(tabs, { id: 't' + i, label: 'T' + i }, active);
    tabs = r.tabs; active = r.activeId;
  }
  assert.strictEqual(tabs.length, 10);
  const over = nav.openTab(tabs, { id: 'extra', label: 'X' }, active);
  assert.strictEqual(over.full, true);
  assert.strictEqual(over.tabs.length, 10);
  assert.strictEqual(over.activeId, 't9');
  const again = nav.openTab(tabs, { id: 't3', label: 'T3' }, active);
  assert.strictEqual(again.full, false);
  assert.strictEqual(again.activeId, 't3');
});

test('closeTab: 활성을 닫으면 오른쪽 → 왼쪽 이웃, 비활성을 닫으면 활성 유지, 마지막이면 null', function () {
  const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.strictEqual(nav.closeTab(tabs, 'b', 'b').activeId, 'c');
  assert.strictEqual(nav.closeTab(tabs, 'c', 'c').activeId, 'b');
  assert.strictEqual(nav.closeTab(tabs, 'a', 'c').activeId, 'c');
  assert.deepStrictEqual(nav.closeTab(tabs, 'a', 'c').tabs.map(function (t) { return t.id; }), ['b', 'c']);
  assert.strictEqual(nav.closeTab([{ id: 'a' }], 'a', 'a').activeId, null);
  assert.strictEqual(nav.closeTab(tabs, 'zzz', 'a').activeId, 'a');
  assert.strictEqual(tabs.length, 3);   // 입력은 바뀌지 않는다
});

test('pruneTabs: 권한이 사라진 항목의 탭만 걷어 낸다', function () {
  const built = nav.build(Object.assign({}, ALL_ON, { chat: false }), { role: '영업팀' });
  const kept = nav.pruneTabs([{ id: 'map' }, { id: 'chat' }, { id: 'soon:이사회 자료' }], built);
  assert.deepStrictEqual(kept.map(function (t) { return t.id; }), ['map', 'soon:이사회 자료']);
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

// ── 메뉴 재편(NEXT 32): 구조·정렬 ─────────────────────────────────────────
test('새 구조: 7개 카테고리 이름·소속(정의 순서 = 흐름 순서), "관리"는 시스템 관리에만', function () {
  assert.deepStrictEqual(nav.CATEGORIES.map(function (c) { return c.id + ':' + c.title; }),
    ['opp:기관 현황', 'bid:입찰 공고', 'match:제안팀 구성', 'docs:제안서 작성',
     'collab:제안 진행·승인', 'result:제출·결과', 'sys:시스템 관리']);
  const by = {};
  nav.CATEGORIES.forEach(function (c) { by[c.id] = c.items.map(function (i) { return i.label; }); });
  assert.deepStrictEqual(by.opp, ['전국 지도', '전국 지역별', '기관 이력·협약 현황', '영업 메모·활동 이력']);
  assert.deepStrictEqual(by.match,
    ['팀원 배정 요청·일정', '기술·데이터 지원 요청', '팀원 지정·진행 알림', '요청 이력·소통']);
  assert.deepStrictEqual(by.docs, ['지식 검색', '대화(질의)', '질의사항 정리·내부 검토',
    '검토 의견·대응 방향', '공동 작성·버전 관리']);
  assert.deepStrictEqual(by.collab, ['제안서 진행 현황', '작업함', '결재함', '이사회 자료']);
  assert.deepStrictEqual(by.result, ['최종 확인·제출', '제출 결과·평가 대응', '협약 등록·사후관리']);
  nav.CATEGORIES.filter(function (c) { return c.id !== 'sys'; }).forEach(function (c) {
    assert.ok(c.title.indexOf('관리') < 0, c.title);
  });
  // 서버 키·view는 동결: workflow는 라벨만 바뀌고 키는 그대로
  assert.strictEqual(nav.CATEGORIES.filter(function (c) { return c.id === 'collab'; })[0].items[0].key, 'workflow');
});

test('영업 계열 표시 순서: 구현 있는 카테고리 → 준비중뿐 → 시스템 관리 맨 아래', function () {
  const built = nav.build(ALL_ON, { role: '영업팀' });
  assert.deepStrictEqual(ids(built), ['opp', 'docs', 'collab', 'bid', 'match', 'result', 'sys']);
  // 카테고리 안에서도 구현이 위, 준비중이 아래(섞이지 않는다)
  built.forEach(function (c) {
    const firstSoon = c.items.findIndex(function (i) { return i.soon; });
    if (firstSoon >= 0) c.items.slice(firstSoon).forEach(function (i) { assert.strictEqual(i.soon, true, c.id); });
  });
  assert.deepStrictEqual(items(built, 'docs').map(function (i) { return i.label; }),
    ['지식 검색', '대화(질의)', '질의사항 정리·내부 검토', '검토 의견·대응 방향', '공동 작성·버전 관리']);
});

test('정렬은 서버가 켠 키에 따라 달라진다 — 구현 항목이 없는 카테고리는 뒤로', function () {
  const v = { map: false, regions: false, workflow: false, chat: false, knowledge: true,
              tasks: false, approvals: false, admin: true };
  assert.deepStrictEqual(ids(nav.build(v, { role: '영업팀' })),
    ['docs', 'opp', 'bid', 'match', 'collab', 'result', 'sys']);
});

test('비영업 역할: 준비중이 숨겨지고 시스템 관리가 맨 아래', function () {
  assert.deepStrictEqual(ids(nav.build(ALL_ON, { role: '예산팀' })), ['opp', 'docs', 'collab', 'sys']);
  assert.deepStrictEqual(ids(nav.build(ALL_ON, { role: '전산팀' })), ['opp', 'docs', 'collab', 'sys']);
  nav.build(ALL_ON, { role: '예산팀' }).forEach(function (c) {
    c.items.forEach(function (i) { assert.strictEqual(i.soon, false); });
  });
});

test('준비중 라벨은 정의 전체에서 유일하다(라벨 기반 id의 전제)', function () {
  const labels = [];
  nav.CATEGORIES.forEach(function (c) { c.items.forEach(function (i) { if (!i.key) labels.push(i.label); }); });
  assert.strictEqual(new Set(labels).size, labels.length);
  assert.strictEqual(labels.length, 17);   // opp 2·bid 4·match 4·docs 3·collab 1·result 3
});
