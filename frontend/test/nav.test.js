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

test('영업팀장: 6개 업무 대분류(시스템은 권한관리 꺼짐이면 빠짐) — 업무 순서 1→6 고정', function () {
  const v = Object.assign({}, ALL_ON, { admin: false });
  const built = nav.build(v, { role: '영업팀장' });
  assert.deepStrictEqual(ids(built), ['scan', 'plan', 'manage', 'write', 'relate', 'tools']);
});

test('서버가 끈 화면은 하위 항목에서도 사라진다', function () {
  const v = Object.assign({}, ALL_ON, { approvals: false, admin: false });
  const built = nav.build(v, { role: '영업팀장' });
  const labels = items(built, 'manage').map(function (i) { return i.label; });
  assert.ok(labels.indexOf('결재함') < 0);
  assert.ok(labels.indexOf('제안서 진행 현황') >= 0);
  assert.ok(items(built, 'write').some(function (i) { return i.label === '작업함'; }));
});

test('준비중 항목은 영업 계열(영업팀·팀장·부장·디자이너·마스터)에게만 보인다', function () {
  ['영업팀', '영업팀장', '영업부장', '디자이너'].forEach(function (role) {
    assert.ok(nav.build(ALL_ON, { role: role }).some(function (c) { return c.id === 'relate'; }), role);
  });
  assert.ok(nav.build(ALL_ON, { role: '전산팀', master: true }).some(function (c) { return c.id === 'relate'; }));
  ['전산팀', '전산팀장', '예산팀', '예산팀장', ''].forEach(function (role) {
    assert.ok(!nav.build(ALL_ON, { role: role }).some(function (c) { return c.id === 'relate'; }), role);
  });
});

test('둘러보기(역할 없음): 지도·지역별만, 준비중 없음', function () {
  const built = nav.build(GUEST, { role: '' });
  assert.deepStrictEqual(ids(built), ['scan']);
  assert.deepStrictEqual(items(built, 'scan').map(function (i) { return i.key; }), ['map', 'regions']);
});

test('비영업 팀: 구현 화면 + 예외(이사회 부의·팀 간 지원 요청·pending 키) 외 준비중은 없다', function () {
  const v = Object.assign({}, ALL_ON, { approvals: false, admin: false });
  const built = nav.build(v, { role: '예산팀' });
  assert.deepStrictEqual(ids(built), ['scan', 'plan', 'manage', 'write', 'tools']);
  const EXCEPT = ['soon:이사회 자료', 'soon:팀 간 지원 요청'];
  built.forEach(function (c) {
    c.items.filter(function (i) { return EXCEPT.indexOf(i.id) < 0 && !i.pending; })
      .forEach(function (i) { assert.strictEqual(i.soon, false, i.id); });
  });
});

test('준비중 id: 명시 id 외에는 soon:라벨, 전부 서로 다르고 21개', function () {
  const built = nav.build(ALL_ON, { role: '영업팀장' });
  const all = [];
  built.forEach(function (c) { c.items.forEach(function (i) { all.push(i.id); }); });
  assert.strictEqual(new Set(all).size, all.length);
  assert.strictEqual(items(built, 'relate')[0].id, 'soon:입찰 결과 등록');
  const soonIds = all.filter(function (id) { return id.indexOf('soon:') === 0; });
  assert.strictEqual(soonIds.length, 21);
  // 이사회 부의: 라벨은 바뀌어도 id는 고정(board.SOON_ID)
  const board = items(built, 'plan').filter(function (i) { return i.id === 'soon:이사회 자료'; })[0];
  assert.ok(board && board.label === '이사회 자료 작성');
});

test('이사회 부의는 영업 기획 > 질의·부의 아래 "구현 예정(배지 없음)", 다른 대분류에는 없다', function () {
  const built = nav.build(ALL_ON, { role: '영업팀' });
  assert.strictEqual(built.filter(function (c) { return c.id === 'plan'; })[0].title, '영업 기획');
  const board = items(built, 'plan').filter(function (i) { return i.id === 'soon:이사회 자료'; })[0];
  assert.ok(board && board.soon);
  assert.strictEqual(board.sub, '질의·부의');
  assert.strictEqual(board.tag, '');
  assert.ok(board.note.indexOf('이사회') >= 0);
  assert.ok(!items(built, 'scan').some(function (i) { return i.id === 'soon:이사회 자료'; }));
  assert.strictEqual(items(built, 'relate')[0].tag, '준비중');
  assert.deepStrictEqual(items(built, 'scan').map(function (i) { return i.label; }),
    ['전국 지도', '전국 지역별', '기관 사업계획', '입찰 공고 현황', '공고 자동 수집']);
});

test('showSubs: 영업팀은 6개 모두 true, 시스템 관리는 false, 예산팀 제안서 관리·둘러보기 기관·입찰 현황은 false', function () {
  const sales = nav.build(ALL_ON, { role: '영업팀' });
  ['scan', 'plan', 'manage', 'write', 'relate', 'tools'].forEach(function (id) {
    assert.strictEqual(sales.filter(function (c) { return c.id === id; })[0].showSubs, true, id);
  });
  assert.strictEqual(sales.filter(function (c) { return c.id === 'sys'; })[0].showSubs, false);
  const budget = nav.build(ALL_ON, { role: '예산팀' });
  assert.strictEqual(budget.filter(function (c) { return c.id === 'manage'; })[0].showSubs, false);
  assert.strictEqual(nav.build(GUEST, { role: '' })[0].showSubs, false);
});

test('pending(AI 대화·지식 검색): 서버 키를 따라 보이고, 준비중 표시·키 유지', function () {
  const built = nav.build(ALL_ON, { role: '예산팀' });
  const chat = items(built, 'tools').filter(function (i) { return i.id === 'chat'; })[0];
  assert.ok(chat);
  assert.strictEqual(chat.key, 'chat');
  assert.strictEqual(chat.soon, true);
  assert.strictEqual(chat.pending, true);
  assert.strictEqual(nav.badgeOf(chat), '준비중');
  assert.deepStrictEqual(items(built, 'tools').map(function (i) { return i.id; }), ['chat', 'knowledge']);
  const off = nav.build(Object.assign({}, ALL_ON, { chat: false, knowledge: false }), { role: '예산팀' });
  assert.ok(!off.some(function (c) { return c.id === 'tools'; }));
});

test('팀 간 지원 요청: 전산·예산(재무)팀에도 tasks 조회 권한이 있으면 보인다', function () {
  ['전산팀', '예산팀'].forEach(function (role) {
    assert.ok(items(nav.build(ALL_ON, { role: role }), 'manage').some(function (i) { return i.id === 'soon:팀 간 지원 요청'; }), role);
  });
  const noTasks = Object.assign({}, ALL_ON, { tasks: false });
  assert.ok(!nav.build(noTasks, { role: '예산팀' }).some(function (c) {
    return c.items.some(function (i) { return i.id === 'soon:팀 간 지원 요청'; });
  }));
});

test('팀 간 지원 요청: 아직 열리지 않는 항목이라 배지가 "준비중"이다(배지 없음 \'\' 금지)', function () {
  ['예산팀', '전산팀', '영업팀'].forEach(function (role) {
    const it = items(nav.build(ALL_ON, { role: role }), 'manage').filter(function (i) { return i.id === 'soon:팀 간 지원 요청'; })[0];
    assert.ok(it, role);
    assert.strictEqual(nav.badgeOf(it), '준비중', role);
  });
});

// 디자인 결정 대기: 실서버 역할표에서 영업팀은 approvals:false라 '진행·결재'에 1개만 남아 '제안서 관리'가 소제목 없이 평평해진다.
// 영업팀장(approvals:true)만 소제목이 보여 같은 영업팀 안에서도 모양이 달라진다. 이 모양을 받아들일지는 디자인이 정한다 —
// 정해지면 이 기대값을 함께 고친다(현재 동작을 못 박아 두는 테스트다).
test('showSubs(디자인 결정 대기): 결재함 권한이 없는 영업팀의 제안서 관리는 평평하다', function () {
  const noApprovals = Object.assign({}, ALL_ON, { approvals: false, admin: false });
  const built = nav.build(noApprovals, { role: '영업팀' });
  assert.strictEqual(built.filter(function (c) { return c.id === 'manage'; })[0].showSubs, false);
  assert.strictEqual(nav.build(ALL_ON, { role: '영업팀장' }).filter(function (c) { return c.id === 'manage'; })[0].showSubs, true);
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
  assert.strictEqual(nav.categoryOf(built, 'approvals'), 'manage');
  assert.strictEqual(nav.categoryOf(built, 'nope'), null);
  assert.strictEqual(nav.showsMapControls('map'), true);
  assert.strictEqual(nav.showsMapControls('regions'), true);
  assert.strictEqual(nav.showsMapControls('workflow'), false);
  assert.strictEqual(nav.showsMapControls('designer'), false);
});

// ── 메뉴 재편(NEXT 32): 구조·정렬 ─────────────────────────────────────────
test('3단 구조: 대분류 7개 이름·소속(정의 순서 = 업무 순서 1→6, 시스템 관리 마지막)', function () {
  assert.deepStrictEqual(nav.CATEGORIES.map(function (c) { return c.id + ':' + c.title; }),
    ['scan:기관·입찰 현황', 'plan:영업 기획', 'manage:제안서 관리', 'write:제안서 작성',
     'relate:협약·관계 관리', 'tools:공통 도구', 'sys:시스템 관리']);
  const by = {};
  nav.CATEGORIES.forEach(function (c) { by[c.id] = c.items.map(function (i) { return (i.sub || '') + '>' + i.label; }); });
  assert.deepStrictEqual(by.scan, ['기관>전국 지도', '기관>전국 지역별', '기관>기관 사업계획',
    '입찰 공고>입찰 공고 현황', '입찰 공고>공고 자동 수집']);
  assert.deepStrictEqual(by.plan, ['대상 분석>협약 대상 선정', '대상 분석>기관 정보 요약서', '대상 분석>배점표 확인 검색',
    '질의·부의>기관 공식 질의', '질의·부의>이사회 자료 작성']);
  assert.deepStrictEqual(by.manage, ['진행·결재>제안서 진행 현황', '진행·결재>결재함',
    '제안팀>제안팀 구성·배정', '제안팀>팀 간 지원 요청']);
  assert.deepStrictEqual(by.write, ['작성>작업함', '작성>공동 작성·버전 관리',
    '검토·제출>내부 검토 의견', '검토·제출>최종 확인·제출']);
  assert.deepStrictEqual(by.relate, ['결과·협약>입찰 결과 등록', '결과·협약>협약 등록·이행 관리',
    '기관 관계>협약 이력', '기관 관계>영업 메모·활동 이력', '기관 관계>탈락 기관 대응']);
  assert.deepStrictEqual(by.tools, ['알림·소통>일정·마감 알림', '알림·소통>요청 이력·소통',
    '검색·AI>AI 대화', '검색·AI>지식 검색', '검색·AI>사내 업무 키워드 조회']);
  // 서버 키·view는 동결
  const keys = {};
  nav.CATEGORIES.forEach(function (c) { c.items.forEach(function (i) { if (i.key) keys[i.key + ':' + (i.view || '')] = c.id; }); });
  assert.strictEqual(keys['workflow:'], 'manage');
  assert.strictEqual(keys['tasks:'], 'write');
  assert.strictEqual(keys['chat:'], 'tools');
  assert.strictEqual(nav.CATEGORIES.filter(function (c) { return c.id === 'sys'; })[0].subs, undefined);
  // 구현 11개(키 8개, admin은 보기 4개)
  assert.strictEqual(Object.keys(keys).length, 11);
});

test('영업 계열 표시 순서: 정의 순서 고정, 시스템 관리 맨 아래, 중분류 안에서 구현이 위', function () {
  const built = nav.build(ALL_ON, { role: '영업팀' });
  assert.deepStrictEqual(ids(built), ['scan', 'plan', 'manage', 'write', 'relate', 'tools', 'sys']);
  built.forEach(function (c) {
    const bySub = {};
    c.items.forEach(function (i) { (bySub[i.sub] = bySub[i.sub] || []).push(i); });
    Object.keys(bySub).forEach(function (s) {
      const firstSoon = bySub[s].findIndex(function (i) { return i.soon; });
      if (firstSoon >= 0) bySub[s].slice(firstSoon).forEach(function (i) { assert.strictEqual(i.soon, true, c.id + s); });
    });
  });
});

test('서버가 켠 키가 달라도 대분류 순서는 바뀌지 않는다', function () {
  const v = { map: false, regions: false, workflow: false, chat: false, knowledge: true,
              tasks: false, approvals: false, admin: true };
  assert.deepStrictEqual(ids(nav.build(v, { role: '영업팀' })),
    ['scan', 'plan', 'manage', 'write', 'relate', 'tools', 'sys']);
});

test('비영업 역할: 준비중이 숨겨지고 시스템 관리가 맨 아래', function () {
  assert.deepStrictEqual(ids(nav.build(ALL_ON, { role: '예산팀' })), ['scan', 'plan', 'manage', 'write', 'tools', 'sys']);
  assert.deepStrictEqual(ids(nav.build(ALL_ON, { role: '전산팀' })), ['scan', 'plan', 'manage', 'write', 'tools', 'sys']);
});

test('이사회 자료 작성: 영업 계열이 아니어도 tasks 조회 권한이 있으면 보이고, tasks가 꺼지면 영업팀 외에는 안 보인다', function () {
  function hasBoard(v, ctx) {
    return nav.build(v, ctx).some(function (c) {
      return c.items.some(function (i) { return i.id === 'soon:이사회 자료'; });
    });
  }
  const noTasks = Object.assign({}, ALL_ON, { tasks: false });
  assert.ok(hasBoard(ALL_ON, { role: '전산팀' }));
  assert.ok(hasBoard(ALL_ON, { role: '전산팀장' }));
  assert.ok(hasBoard(ALL_ON, { role: '전산팀', master: true }));
  assert.ok(hasBoard(ALL_ON, { role: '예산팀' }));
  assert.ok(!hasBoard(noTasks, { role: '전산팀' }));
  assert.ok(!hasBoard(noTasks, { role: '예산팀' }));
  assert.ok(!hasBoard(GUEST, { role: '' }));
  // 영업팀은 기존대로(tasks 여부와 무관하게 보임)
  assert.ok(hasBoard(ALL_ON, { role: '영업팀' }));
  assert.ok(hasBoard(noTasks, { role: '영업팀' }));
  // 다른 준비중 항목은 영업 계열이 아니면 tasks가 있어도 안 보인다(예외: 이사회 부의·팀 간 지원 요청, pending 키 항목)
  const others = nav.build(ALL_ON, { role: '전산팀' }).reduce(function (n, c) {
    return n + c.items.filter(function (i) {
      return i.soon && !i.pending && i.id !== 'soon:이사회 자료' && i.id !== 'soon:팀 간 지원 요청';
    }).length;
  }, 0);
  assert.strictEqual(others, 0);
});

test('준비중 라벨은 정의 전체에서 유일하다(라벨 기반 id의 전제)', function () {
  const labels = [];
  nav.CATEGORIES.forEach(function (c) { c.items.forEach(function (i) { if (!i.key) labels.push(i.label); }); });
  assert.strictEqual(new Set(labels).size, labels.length);
  assert.strictEqual(labels.length, 21);   // scan 3·plan 5·manage 2·write 3·relate 5·tools 3
});

test('badgeOf: 이사회 자료는 배지 없음, 준비중 항목은 "준비중"(F4)', function () {
  assert.strictEqual(nav.badgeOf({ soon: true, tag: '' }), '');
  assert.strictEqual(nav.badgeOf({ soon: true, tag: '준비중' }), '준비중');
  assert.strictEqual(nav.badgeOf({ soon: false }), '');
  assert.strictEqual(nav.badgeOf(null), '');
});

test('screenName: 이사회 자료는 tasks:board, 다른 준비중 화면은 기록하지 않고, 나머지는 그대로', function () {
  const B = 'soon:이사회 자료';
  assert.strictEqual(nav.screenName(B, B), 'tasks:board');
  assert.strictEqual(nav.screenName('soon:다른 화면', B), null);
  assert.strictEqual(nav.screenName('soon:이사회 자료', undefined), null);
  assert.strictEqual(nav.screenName('', B), null);
  assert.strictEqual(nav.screenName(null, B), null);
  assert.strictEqual(nav.screenName('map', B), 'map');
  assert.strictEqual(nav.screenName('admin:users', B), 'admin:users');
  assert.ok(/^[a-z]{2,20}(:[a-z_]{2,20})?$/.test(nav.screenName(B, B)));
});
