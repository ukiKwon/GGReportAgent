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

test('시스템 관리: 사용자·권한·메뉴·접근 이력·사업계획 수집 요청 5항목이 admin 키 하나를 나눠 쓴다', function () {
  const built = nav.build(ALL_ON, { role: '전산팀', master: true });
  const sys = built.filter(function (c) { return c.id === 'sys'; })[0];
  assert.strictEqual(sys.title, '시스템 관리');
  assert.deepStrictEqual(sys.items.map(function (i) { return i.id; }),
    ['admin:users', 'admin:perms', 'admin:menus', 'admin:audit', 'admin:collect']);
  assert.deepStrictEqual(sys.items.map(function (i) { return i.label; }),
    ['사용자 관리', '권한 관리', '메뉴 관리', '접근 이력', '사업계획 수집 요청']);
  sys.items.forEach(function (i) { assert.strictEqual(i.key, 'admin'); assert.strictEqual(i.soon, false); });
  assert.strictEqual(nav.categoryOf(built, 'admin:audit'), 'sys');
});

test('admin 권한이 꺼지면 시스템 관리 전체가 사라진다', function () {
  const v = Object.assign({}, ALL_ON, { admin: false });
  assert.ok(!nav.build(v, { role: '영업팀' }).some(function (c) { return c.id === 'sys'; }));
});

test('영업팀장: 5개 업무 대분류(시스템은 권한관리 꺼짐이면 빠짐) — 업무 순서 1→5 고정', function () {
  const v = Object.assign({}, ALL_ON, { admin: false });
  const built = nav.build(v, { role: '영업팀장' });
  assert.deepStrictEqual(ids(built), ['home', 'scan', 'plan', 'manage', 'relate', 'tools', 'apprbox']);   // apprbox = 머리 띠 결재함(headOnly, 11-23)
});

test('서버가 끈 화면은 하위 항목에서도 사라진다', function () {
  const v = Object.assign({}, ALL_ON, { approvals: false, admin: false });
  const built = nav.build(v, { role: '영업팀장' });
  const labels = items(built, 'manage').map(function (i) { return i.label; });
  assert.ok(labels.indexOf('결재함') < 0);
  assert.ok(labels.indexOf('제안서 진행 현황') >= 0);
  assert.ok(items(built, 'manage').some(function (i) { return i.label === '작업함'; }));
});

test('협약·관계 관리: 영업 계열·마스터 + 협약 성과 관리 때문에 전산팀도 보이고, 재무·역할 없음은 안 보인다(NEXT 104, 11-20)', function () {
  ['영업팀', '영업팀장', '영업부장', '디자이너', '전산팀', '전산팀장'].forEach(function (role) {
    assert.ok(nav.build(ALL_ON, { role: role }).some(function (c) { return c.id === 'relate'; }), role);
  });
  assert.ok(nav.build(ALL_ON, { role: '전산팀', master: true }).some(function (c) { return c.id === 'relate'; }));
  ['예산팀', '예산팀장', ''].forEach(function (role) {
    assert.ok(!nav.build(ALL_ON, { role: role }).some(function (c) { return c.id === 'relate'; }), role);
  });
});

test('둘러보기(역할 없음): 입찰 현황판·입찰 공고 현황(서버 map 키 전원)·지도·지역별만, 그 밖의 준비중 없음', function () {
  const built = nav.build(GUEST, { role: '' });
  assert.deepStrictEqual(ids(built), ['scan']);
  assert.deepStrictEqual(items(built, 'scan').map(function (i) { return i.id; }), ['soon:현황판', 'regions', 'map', 'soon:입찰 공고 현황']);
});

test('비영업 팀: 구현 화면 + 예외(이사회 부의·pending 키) 외 준비중은 없다', function () {
  const v = Object.assign({}, ALL_ON, { approvals: false, admin: false });
  const built = nav.build(v, { role: '예산팀' });
  assert.deepStrictEqual(ids(built), ['scan', 'plan', 'manage', 'tools']);
  const EXCEPT = ['soon:이사회 자료', 'soon:현황판', 'soon:입찰 공고 현황'];
  built.forEach(function (c) {
    c.items.filter(function (i) { return EXCEPT.indexOf(i.id) < 0 && !i.pending; })
      .forEach(function (i) { assert.strictEqual(i.soon, false, i.id); });
  });
});

test('준비중 id: 명시 id 외에는 soon:라벨, 전부 서로 다르고 20개(시작화면·협약 성과 관리 포함)', function () {
  const built = nav.build(ALL_ON, { role: '영업팀장' });
  const all = [];
  built.forEach(function (c) { c.items.forEach(function (i) { all.push(i.id); }); });
  assert.strictEqual(new Set(all).size, all.length);
  assert.strictEqual(items(built, 'relate')[0].id, 'soon:입찰 결과 등록');
  const soonIds = all.filter(function (id) { return id.indexOf('soon:') === 0; });
  assert.strictEqual(soonIds.length, 36);   // 19 − plan 5 + plan 22(제안 준비 현황 1 + 협약준비 업무 21, NEXT 113)
  // 이사회 부의: 라벨은 바뀌어도 id는 고정(board.SOON_ID)
  const board = items(built, 'plan').filter(function (i) { return i.id === 'soon:이사회 자료'; })[0];
  assert.ok(board && board.label === '이사회 자료 작성');
});

test('이사회 부의는 영업 추진 준비 > 협약준비 업무 아래 "구현 예정(배지 없음)", 다른 대분류에는 없다', function () {
  const built = nav.build(ALL_ON, { role: '영업팀' });
  assert.strictEqual(built.filter(function (c) { return c.id === 'plan'; })[0].title, '영업 추진 준비');
  const board = items(built, 'plan').filter(function (i) { return i.id === 'soon:이사회 자료'; })[0];
  assert.ok(board && board.soon);
  assert.strictEqual(board.sub, '협약준비 업무');
  assert.strictEqual(board.tag, '');
  assert.ok(board.note.indexOf('이사회') >= 0);
  assert.ok(!items(built, 'scan').some(function (i) { return i.id === 'soon:이사회 자료'; }));
  assert.strictEqual(items(built, 'relate')[0].tag, '준비중');
  assert.deepStrictEqual(items(built, 'scan').map(function (i) { return i.label; }),
    ['입찰 현황판', '기관 사업계획', '전국 지역별', '지역별 공고현황', '입찰 공고 현황']);
});

test('showSubs: 영업팀은 scan·plan·manage·tools true, 평평한 relate·시스템 관리는 false, 예산팀 제안서 작성·관리·둘러보기 기관·입찰 현황은 false', function () {
  const sales = nav.build(ALL_ON, { role: '영업팀' });
  ['scan', 'plan', 'manage', 'tools'].forEach(function (id) {
    assert.strictEqual(sales.filter(function (c) { return c.id === id; })[0].showSubs, true, id);
  });
  assert.strictEqual(sales.filter(function (c) { return c.id === 'relate'; })[0].showSubs, false);
  assert.strictEqual(sales.filter(function (c) { return c.id === 'sys'; })[0].showSubs, false);
  const budget = nav.build(ALL_ON, { role: '예산팀' });
  assert.strictEqual(budget.filter(function (c) { return c.id === 'manage'; })[0].showSubs, false);
  assert.strictEqual(nav.build(GUEST, { role: '' })[0].showSubs, true);   // scan은 soloSubs(11-23)
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

// 결재함이 머리 띠로 가며(11-23) 제안서 작성·관리는 '진행·작성'·'검토·제출' 두 중분류 — 결재함 권한과 관계없이 영업팀·영업팀장 모양이 같다.
test('showSubs: 결재함 권한과 관계없이 영업팀·영업팀장의 제안서 작성·관리 소제목이 같다(결재함 머리 띠, 11-23)', function () {
  const noApprovals = Object.assign({}, ALL_ON, { approvals: false, admin: false });
  const built = nav.build(noApprovals, { role: '영업팀' });
  assert.strictEqual(built.filter(function (c) { return c.id === 'manage'; })[0].showSubs, true);
  assert.strictEqual(nav.build(ALL_ON, { role: '영업팀장' }).filter(function (c) { return c.id === 'manage'; })[0].showSubs, true);
  assert.ok(!built.some(function (c) { return c.id === 'apprbox'; }));   // 결재함 권한이 꺼지면 머리 띠 항목도 없다
});

test('결재함은 사이드바가 아니라 머리 띠 단독 항목(apprbox, headOnly) — id·권한·탭 판정은 그대로(사용자 11-23)', function () {
  const built = nav.build(ALL_ON, { role: '영업팀장' });
  const ab = built.filter(function (c) { return c.id === 'apprbox'; })[0];
  assert.ok(ab && ab.headOnly === true);
  assert.deepStrictEqual(ab.items.map(function (i) { return i.id; }), ['approvals']);
  assert.strictEqual(nav.categoryOf(built, 'approvals'), 'apprbox');
  assert.strictEqual(nav.accordionOf(built, 'approvals'), null);
  assert.ok(!items(built, 'manage').some(function (i) { return i.id === 'approvals'; }));
  assert.deepStrictEqual(nav.limitToRole(nav.build(ALL_ON, { role: '예산팀장' }), { role: '예산팀장' }).map(function (c) { return c.id; }), ['plan', 'apprbox', 'sys']);
  assert.ok(nav.limitToRole(nav.build(ALL_ON, { role: '예산팀' }), { role: '예산팀' }).some(function (c) { return c.id === 'apprbox'; }));
  assert.ok(nav.limitToRole(nav.build(ALL_ON, { role: '디자이너' }), { role: '디자이너' }).some(function (c) { return c.id === 'apprbox'; }));
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
  assert.strictEqual(nav.categoryOf(built, 'approvals'), 'apprbox');   // 결재함 = 머리 띠 단독 항목(11-23)
  assert.strictEqual(nav.categoryOf(built, 'nope'), null);
  assert.strictEqual(nav.showsMapControls('map'), true);
  assert.strictEqual(nav.showsMapControls('regions'), true);
  assert.strictEqual(nav.showsMapControls('workflow'), false);
  assert.strictEqual(nav.showsMapControls('designer'), false);
});

// ── 메뉴 재편(NEXT 32): 구조·정렬 ─────────────────────────────────────────
test('3단 구조: 대분류 7개 이름·소속(시작화면 단독 + 정의 순서 = 업무 순서 1→5, 시스템 관리 마지막)', function () {
  assert.deepStrictEqual(nav.CATEGORIES.map(function (c) { return c.id + ':' + c.title; }),
    ['home:시작화면', 'scan:기관·입찰 현황', 'plan:영업 추진 준비', 'manage:제안서 작성·관리',
     'relate:협약·관계 관리', 'tools:공통 도구', 'apprbox:결재함', 'sys:시스템 관리']);
  const by = {};
  nav.CATEGORIES.forEach(function (c) { by[c.id] = c.items.map(function (i) { return (i.sub || '') + '>' + i.label; }); });
  assert.deepStrictEqual(by.scan, ['대시보드>입찰 현황판', '기관>기관 사업계획', '기관>전국 지역별', '입찰 공고>지역별 공고현황',
    '입찰 공고>입찰 공고 현황', '입찰 공고>공고 자동 수집']);
  assert.deepStrictEqual(by.plan, ['현황>제안 준비 현황', '협약준비 업무>기관 정보 분석', '협약준비 업무>수익성분석',
    '협약준비 업무>가결위(재무)', '협약준비 업무>출심위(사업부)', '협약준비 업무>이사회 자료 작성', '협약준비 업무>이사회 발표 대본',
    '협약준비 업무>이사회', '협약준비 업무>발표자료', '협약준비 업무>제출서류', '협약준비 업무>제안서제출품의', '협약준비 업무>PT',
    '협약준비 업무>결과발표', '협약준비 업무>우선협상', '협약준비 업무>협약서(법률)', '협약준비 업무>협약체결품의',
    '협약준비 업무>ATM', '협약준비 업무>KB카드', '협약준비 업무>전산구축', '협약준비 업무>VIP 지정', '협약준비 업무>금리승인', '협약준비 업무>협약식']);
  assert.deepStrictEqual(by.manage, ['진행·작성>제안서 진행 현황', '진행·작성>작업함', '진행·작성>제안팀 구성·배정',
    '진행·작성>공동 작성·버전 관리', '검토·제출>내부 검토 의견', '검토·제출>최종 확인·제출']);
  assert.deepStrictEqual(by.apprbox, ['>결재함']);
  assert.deepStrictEqual(by.relate, ['>입찰 결과 등록', '>협약 이력', '>협약 성과 관리']);
  assert.deepStrictEqual(by.tools, ['알림·소통>일정·마감 알림', '알림·소통>요청 이력·소통',
    '검색·AI>AI 대화', '검색·AI>지식 검색', '검색·AI>사내 업무 키워드 조회']);
  // 서버 키·view는 동결
  const keys = {};
  nav.CATEGORIES.forEach(function (c) { c.items.forEach(function (i) { if (i.key) keys[i.key + ':' + (i.view || '')] = c.id; }); });
  assert.strictEqual(keys['workflow:'], 'manage');
  assert.strictEqual(keys['tasks:'], 'manage');
  assert.strictEqual(keys['chat:'], 'tools');
  assert.strictEqual(nav.CATEGORIES.filter(function (c) { return c.id === 'sys'; })[0].subs, undefined);
  // 구현 12개(키 8개, admin은 보기 5개 — 사업계획 수집 요청 11-17)
  assert.strictEqual(Object.keys(keys).length, 12);
});

test('영업 계열 표시 순서: 정의 순서 고정, 시스템 관리 맨 아래, 중분류 안에서 구현이 위', function () {
  const built = nav.build(ALL_ON, { role: '영업팀' });
  assert.deepStrictEqual(ids(built), ['home', 'scan', 'plan', 'manage', 'relate', 'tools', 'apprbox', 'sys']);
  built.forEach(function (c) {
    const bySub = {};
    c.items.forEach(function (i) { (bySub[i.sub] = bySub[i.sub] || []).push(i); });
    Object.keys(bySub).forEach(function (s) {
      // front(입찰 현황판)는 같은 중분류의 맨 앞에 놓이므로 '구현 → 준비중' 순서 검사에서 뺀다
      const rest = bySub[s].filter(function (i) { return !i.front; });
      const firstSoon = rest.findIndex(function (i) { return i.soon; });
      if (firstSoon >= 0) rest.slice(firstSoon).forEach(function (i) { assert.strictEqual(i.soon, true, c.id + s); });
    });
  });
});

test('서버가 켠 키가 달라도 대분류 순서는 바뀌지 않는다', function () {
  const v = { map: false, regions: false, workflow: false, chat: false, knowledge: true,
              tasks: false, approvals: false, admin: true };
  assert.deepStrictEqual(ids(nav.build(v, { role: '영업팀' })),
    ['plan', 'manage', 'relate', 'tools', 'sys']);   // map·regions가 꺼지면 영업팀에게 기관·입찰 현황은 빈 묶음(공고 자동 수집은 전산팀만, 11-23)
});

test('비영업 역할: 준비중이 숨겨지고 시스템 관리가 맨 아래', function () {
  assert.deepStrictEqual(ids(nav.build(ALL_ON, { role: '예산팀' })), ['scan', 'plan', 'manage', 'tools', 'apprbox', 'sys']);
  assert.deepStrictEqual(ids(nav.build(ALL_ON, { role: '전산팀' })), ['home', 'scan', 'plan', 'manage', 'relate', 'tools', 'apprbox', 'sys']);   // 전산팀은 시작화면을 본다(보기 전용, 11-19)·협약 성과 관리(11-20)로 relate도
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
  // 다른 준비중 항목은 영업 계열이 아니면 tasks가 있어도 안 보인다(예외: 이사회 부의, pending 키 항목,
  // 서버 map 키로 보이는 입찰 현황판·입찰 공고 현황 — 11-16 공고 현황도 타팀 공유, map 키 AND 영업·전산팀인 기관 사업계획 — 11-17)
  const others = nav.build(ALL_ON, { role: '전산팀' }).reduce(function (n, c) {
    return n + c.items.filter(function (i) {
      return i.soon && !i.pending && i.id !== 'soon:이사회 자료' && i.id !== nav.DASH_ID && i.id !== nav.NOTICE_ID && i.id !== nav.PLANS_ID && i.id !== nav.HOME_ID && i.id !== nav.RESULTS_ID && i.id !== nav.COLLECT_NOTICE_ID;
    }).length;
  }, 0);
  assert.strictEqual(others, 0);
});

test('준비중 라벨은 정의 전체에서 유일하다(라벨 기반 id의 전제)', function () {
  const labels = [];
  nav.CATEGORIES.forEach(function (c) { c.items.forEach(function (i) { if (!i.key) labels.push(i.label); }); });
  assert.strictEqual(new Set(labels).size, labels.length);
  assert.strictEqual(labels.length, 37);   // home 1·scan 4(입찰 현황판 포함)·plan 22(NEXT 113)·manage 4·relate 3(협약 성과 관리 11-20)·tools 3
});

test('입찰 공고 현황: id는 soon:입찰 공고 현황 고정(NOTICE_ID), 배지 없음(실제 화면 — 11-16)', function () {
  assert.strictEqual(nav.NOTICE_ID, 'soon:입찰 공고 현황');
  const it = nav.CATEGORIES.filter(function (c) { return c.id === 'scan'; })[0].items
    .filter(function (i) { return i.id === nav.NOTICE_ID; })[0];
  assert.ok(it, 'NOTICE_ID 항목이 scan에 있다');
  assert.strictEqual(it.label, '입찰 공고 현황');
  assert.strictEqual(it.sub, '입찰 공고');
  assert.strictEqual(it.withKey, 'map');   // 영업 계열 제한 없이 서버 map 키가 켜진 사람 전원(현황판과 같음)
  assert.ok(nav.build(ALL_ON, { role: '예산팀' }).some(function (c) { return c.items.some(function (i) { return i.id === nav.NOTICE_ID; }); }));
  assert.ok(!nav.build(Object.assign({}, ALL_ON, { map: false }), { role: '영업팀' }).some(function (c) { return c.items.some(function (i) { return i.id === nav.NOTICE_ID; }); }));
  assert.strictEqual(nav.badgeOf(it), '');
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

test('제안팀 구성·배정: 영업팀·영업팀장·영업부장에게만 보이고 디자이너·마스터·타 팀에는 숨는다, 배지 없음, 고정 id', function () {
  function find(v, ctx) {
    const hit = [];
    nav.build(v, ctx).forEach(function (c) { c.items.forEach(function (i) { if (i.label === '제안팀 구성·배정') hit.push(i); }); });
    return hit[0] || null;
  }
  ['영업팀', '영업팀장', '영업부장'].forEach(function (role) {
    const it = find(ALL_ON, { role: role });
    assert.ok(it, role);
    assert.strictEqual(it.id, 'soon:제안팀');
    assert.strictEqual(nav.badgeOf(it), '');
  });
  // 서버 메뉴 키(approvals 등)가 꺼져도 영업팀에는 보인다(열람은 서버가 역할로 정한다)
  assert.ok(find(Object.assign({}, ALL_ON, { approvals: false, tasks: false, admin: false }), { role: '영업팀' }));
  // 숨김: 디자이너, 마스터(역할이 영업팀이어도), 타 팀, 역할 없음
  assert.strictEqual(find(ALL_ON, { role: '디자이너' }), null);
  assert.strictEqual(find(ALL_ON, { role: '영업팀', master: true }), null);
  assert.strictEqual(find(ALL_ON, { role: '전산팀', master: true }), null);
  ['전산팀', '예산팀', '예산팀장', ''].forEach(function (role) { assert.strictEqual(find(ALL_ON, { role: role }), null, role); });
  // 디자이너는 같은 중분류(작성)의 공동 작성·버전 관리는 그대로 본다
  assert.ok(items(nav.build(ALL_ON, { role: '디자이너' }), 'manage').some(function (i) { return i.id === 'soon:공동 작성·버전 관리'; }));
  assert.ok(nav.roleIn(nav.TEAM_ROLES, { role: ' 영업팀 ' }));
  assert.ok(!nav.roleIn(nav.TEAM_ROLES, undefined));
});

test('제안팀 구성·배정: 영업팀·디자이너 모두 제안서 작성·관리 소제목 유지(디자이너는 작성 중분류에 작업함·공동 작성 2개가 남는다, showSubs)', function () {
  const built = nav.build(ALL_ON, { role: '영업팀' });
  assert.strictEqual(built.filter(function (c) { return c.id === 'manage'; })[0].showSubs, true);
  const designer = nav.build(ALL_ON, { role: '디자이너' });
  assert.strictEqual(designer.filter(function (c) { return c.id === 'manage'; })[0].showSubs, true);   // 작성 중분류에 작업함·공동 작성 2개가 남는다
});

// ── 메뉴 재편(NEXT 69): 추가 검증 ─────────────────────────────────────────
test('재편으로 지운 7개 라벨은 정의 어디에도 없다', function () {
  const removed = ['협약 대상 선정', '배점표 확인 검색', '기관 공식 질의', '팀 간 지원 요청',
                   '협약 등록·이행 관리', '영업 메모·활동 이력', '탈락 기관 대응'];
  const labels = [];
  nav.CATEGORIES.forEach(function (c) { c.items.forEach(function (i) { labels.push(i.label); }); });
  removed.forEach(function (l) { assert.ok(labels.indexOf(l) < 0, l); });
  assert.ok(!nav.CATEGORIES.some(function (c) { return c.id === 'write'; }));
});

test('PREP_ID: soon:사전준비로 고정, 영업 추진 준비(plan)의 제안 준비 현황(옛 제안서 사전준비 프로세스)에 붙는다', function () {
  assert.strictEqual(nav.PREP_ID, 'soon:사전준비');
  const built = nav.build(ALL_ON, { role: '영업팀' });
  const it = items(built, 'plan').filter(function (i) { return i.id === nav.PREP_ID; })[0];
  assert.ok(it);
  assert.strictEqual(it.label, '제안 준비 현황');
  assert.strictEqual(it.sub, '현황');
  assert.strictEqual(nav.categoryOf(built, nav.PREP_ID), 'plan');
});

test('아직 준비중인 1개(이사회 발표 대본): 배지 "준비중", 영업 계열에게만(tasks가 있는 예산·전산팀에는 안 보인다). 사전준비 프로세스·협약준비 task는 배지 없음(NEXT 113)', function () {
  const labels = ['이사회 발표 대본'];
  function find(ctx, label) {
    const hit = [];
    nav.build(ALL_ON, ctx).forEach(function (c) { c.items.forEach(function (i) { if (i.label === label) hit.push(i); }); });
    return hit[0] || null;
  }
  labels.forEach(function (l) {
    const it = find({ role: '영업팀' }, l);
    assert.ok(it, l);
    assert.strictEqual(nav.badgeOf(it), '준비중', l);
    ['예산팀', '전산팀', '전산팀장', ''].forEach(function (role) { assert.strictEqual(find({ role: role }, l), null, l + '/' + role); });
  });
});

test('plan·manage의 중분류(subs) 정의와 협약·관계 관리의 평평한 구조', function () {
  const by = {};
  nav.CATEGORIES.forEach(function (c) { by[c.id] = c; });
  assert.deepStrictEqual(by.plan.subs, ['현황', '협약준비 업무']);
  assert.strictEqual(by.plan.soloSubs, true);
  assert.deepStrictEqual(by.manage.subs, ['진행·작성', '검토·제출']);   // 결재함 머리 띠로(11-23)
  assert.strictEqual(by.relate.subs, undefined);
  assert.deepStrictEqual(by.relate.items.map(function (i) { return i.label; }), ['입찰 결과 등록', '협약 이력', '협약 성과 관리']);
});

// qa 69 후속: 실서버 키 조합·경계값·줄바꿈 CSS 고정
test('영업부장(작업함 키 없음): 진행·작성 소분류에 제안서 진행·제안팀·공동 작성이 남아 소제목 유지', function () {
  const built = nav.build({ map: true, workflow: true, approvals: true, chat: true }, { role: '영업부장' });
  const manage = built.filter(function (c) { return c.id === 'manage'; })[0];
  assert.strictEqual(manage.showSubs, true);
  assert.deepStrictEqual(manage.items.filter(function (i) { return i.sub === '진행·작성'; }).map(function (i) { return i.id; }),
    ['workflow', 'soon:제안팀', 'soon:공동 작성·버전 관리']);
});

test('디자이너 tasks 없음: 진행·작성에 제안서 진행·공동 작성이 남아 소제목 유지(결재함 머리 띠 뒤, 11-23)', function () {
  const built = nav.build(Object.assign({}, ALL_ON, { tasks: false }), { role: '디자이너' });
  assert.strictEqual(built.filter(function (c) { return c.id === 'manage'; })[0].showSubs, true);
});

test('재무(예산)팀: 영업 추진 준비에는 이사회 자료 작성 하나만, 소제목 없음', function () {
  const plan = nav.build(ALL_ON, { role: '예산팀' }).filter(function (c) { return c.id === 'plan'; })[0];
  assert.deepStrictEqual(plan.items.map(function (i) { return i.id; }), ['soon:이사회 자료']);
  assert.strictEqual(plan.showSubs, false);
});

test('사이드바 라벨은 말줄임 대신 어절 단위 줄바꿈(index.html CSS)', function () {
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(/\.nav-item \.nav-label \{[^}]*white-space:normal[^}]*word-break:keep-all/.test(html));
});

test('기관 사업계획: map 키 AND 영업팀·전산팀 소속(디자이너·마스터 포함)에게만, 예산팀 제외 (11-17)', function () {
  function has(v, ctx) {
    return nav.build(v, ctx).some(function (c) {
      return c.items.some(function (i) { return i.id === nav.PLANS_ID; });
    });
  }
  ['영업팀', '영업팀장', '영업부장', '디자이너', '전산팀', '전산팀장'].forEach(function (role) {
    assert.ok(has(ALL_ON, { role: role }), role);
  });
  assert.ok(has(ALL_ON, { role: '전산팀', master: true }));
  assert.ok(has(ALL_ON, { role: '예산팀', master: true }));   // 마스터는 팀 무관
  ['예산팀', '예산팀장', ''].forEach(function (role) {
    assert.ok(!has(ALL_ON, { role: role }), role);
  });
  // map 키가 꺼지면 팀이 맞아도 숨긴다(서버가 403을 내는 사람에게 메뉴를 보이지 않는다)
  const noMap = Object.assign({}, ALL_ON, { map: false });
  ['영업팀', '디자이너', '전산팀', '전산팀장'].forEach(function (role) {
    assert.ok(!has(noMap, { role: role }), role);
  });
  assert.ok(!has(noMap, { role: '전산팀', master: true }));
});

test('nav.teamIn 경계: 공백 낀 소속은 보이고, 다른 팀·직급만 있는 역할·ctx 없음은 숨긴다 (11-17)', function () {
  const T = ['영업', '전산'];
  assert.strictEqual(nav.teamIn(T, { role: ' 전산팀 ' }), true);      // trim 후 전산
  assert.strictEqual(nav.teamIn(T, { role: '디자이너' }), true);      // 디자이너는 영업팀 소속
  assert.strictEqual(nav.teamIn(T, { role: '재무팀' }), false);       // 목록에 없는 팀
  assert.strictEqual(nav.teamIn(T, { role: '본부장' }), false);       // 접미사 규칙에 안 걸리는 직급
  assert.strictEqual(nav.teamIn(T, { role: '' }), false);
  assert.strictEqual(nav.teamIn(T, undefined), false);                 // ctx 없음
  assert.strictEqual(nav.teamIn(T, { role: '예산팀', master: true }), true);   // 마스터는 통과
  function hasPlans(v, ctx) {
    return nav.build(v, ctx).some(function (c) { return c.items.some(function (i) { return i.id === nav.PLANS_ID; }); });
  }
  assert.ok(hasPlans(ALL_ON, { role: ' 전산팀 ' }));
  assert.ok(!hasPlans(ALL_ON, { role: '재무팀' }));
  assert.ok(!hasPlans(ALL_ON, { role: '본부장' }));
  assert.ok(!hasPlans(ALL_ON));                                        // ctx 없음(nav.build(ALL_ON))
});

test('기관 사업계획: 전산팀은 기관 분류에 현황판·지도·지역별·사업계획·공고 현황이 보이고 다른 준비중은 없다', function () {
  const built = nav.build(ALL_ON, { role: '전산팀' });
  assert.deepStrictEqual(items(built, 'scan').map(function (i) { return i.label; }),
    ['입찰 현황판', '기관 사업계획', '전국 지역별', '지역별 공고현황', '입찰 공고 현황', '공고 자동 수집']);
  assert.strictEqual(nav.PLANS_ID, 'soon:기관 사업계획');
});

test('시작화면 고정 탭: 맨 앞에 붙고 개수 제한(10)에 세지 않으며 닫을 수 없다', function () {
  const home = { id: nav.HOME_ID, label: '시작화면' };
  let r = nav.openTab([{ id: 'map', label: '전국 지도' }], home, 'map');
  assert.deepStrictEqual(r.tabs.map(function (t) { return t.id; }), [nav.HOME_ID, 'map']);
  assert.strictEqual(r.activeId, nav.HOME_ID);
  let tabs = [];
  for (let i = 0; i < 10; i += 1) tabs = nav.openTab(tabs, { id: 't' + i, label: 'T' + i }, null).tabs;
  assert.strictEqual(nav.openTab(tabs, { id: 'x', label: 'X' }, 't0').full, true);   // 일반 탭은 10개까지
  r = nav.openTab(tabs, home, 't0');                                                  // 가득 차도 시작화면은 열린다
  assert.strictEqual(r.full, false); assert.strictEqual(r.tabs[0].id, nav.HOME_ID); assert.strictEqual(r.tabs.length, 11);
  assert.strictEqual(nav.openTab(r.tabs, { id: 'x', label: 'X' }, nav.HOME_ID).full, true);   // 시작화면이 있어도 일반 탭 한도는 10
  assert.strictEqual(nav.openTab(r.tabs, home, 't3').activeId, nav.HOME_ID);          // 이미 있으면 활성만 옮김
  assert.strictEqual(nav.closeTab(r.tabs, nav.HOME_ID, nav.HOME_ID).tabs.length, 11);  // 닫기 거부
  assert.strictEqual(nav.closeTab(r.tabs, nav.HOME_ID, 't0').activeId, 't0');
});

test('시작화면: headOnly 표시, 역할 목록은 한 곳(HOME_ROLES ⊇ VIEW_ONLY_ROLES), 보기 전용은 전산팀·전산팀장뿐', function () {
  assert.strictEqual(nav.build(ALL_ON, { role: '영업팀' })[0].headOnly, true);
  ['전산팀', '전산팀장'].forEach(function (r) {
    assert.strictEqual(nav.isViewOnly({ role: r }), true, r);
    assert.strictEqual(nav.isHomeRole({ role: r }), true, r);
    assert.strictEqual(nav.build(ALL_ON, { role: r })[0].id, 'home', r);
  });
  nav.VIEW_ONLY_ROLES.forEach(function (r) { assert.ok(nav.isHomeRole({ role: r }), r); });
  ['영업팀', '영업팀장', '영업부장', '예산팀', '예산팀장', ''].forEach(function (r) { assert.strictEqual(nav.isViewOnly({ role: r }), false, r || '(없음)'); });
  assert.strictEqual(nav.isViewOnly({ role: '전산팀', master: true }), false);
  const built = nav.build(ALL_ON, { role: '예산팀' });
  assert.deepStrictEqual(nav.pruneTabs([{ id: nav.HOME_ID }, { id: 'map' }], built).map(function (t) { return t.id; }), ['map']);   // 대상이 아닌 계정으로 바뀌면 시작화면 탭이 걷힌다
  assert.strictEqual(nav.homeItemId(nav.build(ALL_ON, { role: '영업팀' }), nav.HOME_ID, [{ id: nav.HOME_ID }, { id: 'map' }], { role: '영업팀' }), null);   // 이미 시작화면
});

test('공고 자동 수집: 전산팀·전산팀장·관리자(마스터)에게만 보이고 준비중 배지, 그 밖(영업 계열·디자이너·재무·역할 없음)은 숨김(11-23)', function () {
  function find(ctx) {
    const hit = [];
    nav.build(ALL_ON, ctx).forEach(function (c) { c.items.forEach(function (i) { if (i.id === nav.COLLECT_NOTICE_ID) hit.push(i); }); });
    return hit[0] || null;
  }
  assert.strictEqual(nav.COLLECT_NOTICE_ID, 'soon:공고 자동 수집');
  ['전산팀', '전산팀장'].forEach(function (r) {
    const it = find({ role: r });
    assert.ok(it, r);
    assert.strictEqual(it.sub, '입찰 공고');
    assert.strictEqual(nav.badgeOf(it), '준비중');
  });
  ['영업팀', '영업팀장', '영업부장', '디자이너', '예산팀', '예산팀장', ''].forEach(function (r) {
    assert.strictEqual(find({ role: r }), null, r);
  });
  assert.ok(find({ role: '전산팀', master: true }), '관리자에게도 보인다(사용자 11-23)');
  assert.ok(find({ role: '', master: true }), '관리자는 역할과 무관하게 보인다');
});

test('기관·입찰 현황 소제목: 대시보드 → 기관 → 입찰 공고 순, 항목이 하나뿐인 대시보드도 소제목이 켜진다(soloSubs, 11-23)', function () {
  const built = nav.build(ALL_ON, { role: '영업팀' });
  const scan = built.filter(function (c) { return c.id === 'scan'; })[0];
  assert.strictEqual(scan.showSubs, true);
  assert.deepStrictEqual(scan.items.map(function (i) { return i.sub + '>' + i.label; }),
    ['대시보드>입찰 현황판', '기관>기관 사업계획', '기관>전국 지역별',
     '입찰 공고>지역별 공고현황', '입찰 공고>입찰 공고 현황']);
  const map = scan.items.filter(function (i) { return i.id === 'map'; })[0];
  assert.strictEqual(map.key, 'map');
  assert.strictEqual(map.label, '지역별 공고현황');
  assert.strictEqual(nav.build(ALL_ON, { role: '예산팀' }).filter(function (c) { return c.id === 'plan'; })[0].showSubs, false);
});
