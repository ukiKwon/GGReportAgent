// 공고 예정일 경과 1단계(화면만): 판정·그룹핑·중복 제거·확인 중 정렬·오늘 그만 보기 키·팀 게이트·기준일 포맷.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const logic = require('../js/logic.js');
const store = require('../js/store.js');
const render = require('../js/render.js');
const ov = require('../js/overdue.js');

const TODAY = new Date('2026-11-09T00:00:00');   // 로컬 자정

// 기본은 추정(confirmed:false) — 확정 공고는 공고일부터 120일 안이면 '진행 중'이라 경과 목록에 들지 않는다(2026-11-12).
// 확정 공고가 경과로 잡히는 경우를 보려면 120일 넘게 지난 날짜에 confirmed:true를 명시한다.
function rec(name, region, contractEnd, extra) {
  return Object.assign({ name: name, region: region, type: '지자체', contractEnd: contractEnd, confirmed: false }, extra || {});
}

// ── 기준일 포맷 ─────────────────────────────────────────────────────────────
test('localDateStr: 로컬 날짜로 만든다(UTC로 변환하지 않는다)', function () {
  assert.strictEqual(logic.localDateStr(new Date(2026, 10, 9, 0, 30)), '2026-11-09');   // KST 새벽에도 같은 날
  assert.strictEqual(logic.localDateStr(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.strictEqual(logic.localDateStr(new Date(2026, 11, 31)), '2026-12-31');
});

test('render.state.today는 오늘의 로컬 자정이다', function () {
  const t = render.state.today;
  assert.strictEqual(t.getHours(), 0);
  assert.strictEqual(logic.localDateStr(t), logic.localDateStr(new Date()));
});

// ── 경과 판정 ───────────────────────────────────────────────────────────────
test('overdueSummary: 오늘 > 예정일이면 경과, 당일·미래는 아니다(유예 없음)', function () {
  const list = [
    rec('하루지남', '11', '2026-11-08'),
    rec('당일', '11', '2026-11-09'),
    rec('내일', '11', '2026-11-10'),
  ];
  const s = logic.overdueSummary(list, TODAY);
  assert.deepStrictEqual(s.items.map(function (i) { return i.name; }), ['하루지남']);
  assert.strictEqual(s.items[0].days, 1);
});

test('overdueSummary: 확정과 추정을 똑같이 센다(추정 = lastBid+term, confirmed 아님)', function () {
  const list = [
    rec('확정건', '11', '2026-06-01', { confirmed: true }),   // 공고 후 161일 — 120일을 넘어 경과로 잡힌다
    rec('추정건', '41', null, { contractEnd: undefined, confirmed: false, lastBid: '2022-10-20', term: 4 }),   // 2026-10-20
    rec('예상일건', '42', '2026-10-05', { confirmed: false }),
  ];
  const s = logic.overdueSummary(list, TODAY);
  const kinds = {};
  s.items.forEach(function (i) { kinds[i.name] = i.kind; });
  assert.deepStrictEqual(kinds, { 확정건: 'fixed', 추정건: 'est', 예상일건: 'est' });
});

test('overdueSummary: 날짜 미상은 경과에서 빼고 건수만 센다', function () {
  const list = [
    rec('미상1', '11', null, { contractEnd: undefined }),
    { name: '미상2', region: '41', type: '지자체' },
    rec('잘못된날짜', '42', '2026-13-45'),
    rec('경과', '11', '2026-01-01'),
  ];
  const s = logic.overdueSummary(list, TODAY);
  assert.strictEqual(s.items.length, 1);
  assert.strictEqual(s.unknown, 3);
  assert.strictEqual(s.total, 4);
});

test('overdueSummary: 기관 단위 중복 제거(수원 4구처럼 같은 기관 반복)', function () {
  const list = [
    rec('수원시청', '41', '2026-10-01'), rec('수원시청', '41', '2026-10-01'),
    rec('수원시청', '41', '2026-10-01'), rec('수원시청', '41', '2026-10-01'),
    rec('광주시청', '41', '2026-10-01'),      // 경기 광주
    rec('광주시청', '46', '2026-10-01'),      // 동명이지만 지역이 달라 다른 기관
  ];
  const s = logic.overdueSummary(list, TODAY);
  assert.strictEqual(s.items.length, 3);
  assert.strictEqual(s.total, 3);
});

test('overdueSummary: 최근에 지난 순(days 오름차순)', function () {
  const list = [rec('오래', '11', '2026-07-01'), rec('최근', '11', '2026-11-05'), rec('중간', '11', '2026-10-01')];
  const s = logic.overdueSummary(list, TODAY);
  assert.deepStrictEqual(s.items.map(function (i) { return i.name; }), ['최근', '중간', '오래']);
});

// ── 공고일 이름표 7곳(옛 '날짜 의미 확인 중') ───────────────────────────────────────────────────────
function loadInstitutions() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data/institutions.js'), 'utf8'), sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.institutions));
}

test('날짜 의미 확인 중 7기관 키가 실제 데이터의 region+name과 모두 맞는다', function () {
  // 2026-11-11: 회차 종료 8곳을 lastBid로 옮겨 15 → 7(NEXT 30-1)
  assert.strictEqual(logic.OVERDUE_CHECK_KEYS.length, 7);
  const keys = new Set(loadInstitutions().map(logic.instKey));
  logic.OVERDUE_CHECK_KEYS.forEach(function (k) { assert.ok(keys.has(k), '데이터에 없는 키: ' + k); });
});

test('확인 중 기관은 check 표식이 붙고 경과 건수에는 포함된다', function () {
  const list = [rec('영천시청', '47', '2026-07-30'), rec('성북구청', '11', '2026-10-27', { confirmed: false })];
  const s = logic.overdueSummary(list, TODAY);
  assert.strictEqual(s.items.length, 2);
  const byName = {};
  s.items.forEach(function (i) { byName[i.name] = i; });
  assert.strictEqual(byName['영천시청'].check, true);
  assert.strictEqual(byName['영천시청'].kind, 'check');
  assert.strictEqual(byName['성북구청'].check, false);
  // 같은 이름이라도 지역이 다르면 확인 중이 아니다(region+name 키)
  assert.strictEqual(logic.isDateUnderReview(rec('영천시청', '11', '2026-07-30')), false);
});

test('pickTopOverdue: 관심 지역 먼저, 최근에 지난 순, 확인 중은 맨 뒤', function () {
  const items = logic.overdueSummary([
    rec('가', '11', '2026-11-08'),                     // D+1, 관심 아님
    rec('나', '42', '2026-10-01'),                     // D+39, 관심
    rec('영천시청', '47', '2026-11-07'),               // D+2, 확인 중(관심 아님)
    rec('다', '42', '2026-11-01'),                     // D+8, 관심
    rec('삼척시청', '42', '2026-11-06'),               // D+3, 관심이지만 확인 중
    rec('라', '41', '2026-11-03'),                     // D+6
  ], TODAY).items;
  const top = logic.pickTopOverdue(items, ['42'], 5).map(function (i) { return i.name; });
  // 확인 중이 아닌 건: 관심(다 D+8, 나 D+39) → 그 외(가 D+1, 라 D+6). 그 뒤에 확인 중(삼척 D+3, 영천 D+2) 중 관심 먼저.
  assert.deepStrictEqual(top, ['다', '나', '가', '라', '삼척시청']);
  // n을 줄이면 확인 중은 밀려난다
  assert.deepStrictEqual(logic.pickTopOverdue(items, ['42'], 4).map(function (i) { return i.name; }), ['다', '나', '가', '라']);
  // 입력을 바꾸지 않는다
  assert.strictEqual(items[0].name, '가');
});

// ── 그룹핑 ─────────────────────────────────────────────────────────────────
test('groupOverdue: 관심 지역 건은 관심 묶음에만, 시·도는 건수 많은 순(같으면 코드 순)', function () {
  const items = logic.overdueSummary([
    rec('a', '11', '2026-10-01'), rec('b', '11', '2026-10-02'), rec('c', '11', '2026-10-03'),
    rec('d', '42', '2026-10-04'), rec('e', '42', '2026-10-05'),
    rec('f', '47', '2026-10-06'), rec('g', '43', '2026-10-07'),
  ], TODAY).items;
  const g = logic.groupOverdue(items, ['42'], function (c) { return 'N' + c; });
  assert.deepStrictEqual(g.watch.map(function (i) { return i.name; }).sort(), ['d', 'e']);
  assert.deepStrictEqual(g.bySido.map(function (s) { return s.code; }), ['11', '43', '47']);   // 3건, 1건(43<47)
  // 두 번 세지 않는다 — 묶음 건수 합 = 전체
  const sum = g.watch.length + g.bySido.reduce(function (n, s) { return n + s.items.length; }, 0);
  assert.strictEqual(sum, items.length);
  assert.strictEqual(g.bySido[0].name, 'N11');
});

test('groupOverdue: 관심 지역이 없으면 전부 시·도 묶음', function () {
  const items = logic.overdueSummary([rec('a', '11', '2026-10-01'), rec('b', '41', '2026-10-02')], TODAY).items;
  const g = logic.groupOverdue(items, [], null);
  assert.strictEqual(g.watch.length, 0);
  assert.strictEqual(g.bySido.length, 2);
});

test('countBySido: 관심 구분 없이 시·도별 전체 건수', function () {
  const items = logic.overdueSummary([rec('a', '11', '2026-10-01'), rec('b', '11', '2026-10-02'), rec('c', '41', '2026-10-03')], TODAY).items;
  assert.deepStrictEqual(logic.countBySido(items, function (c) { return c; }),
    [{ code: '11', name: '11', n: 2 }, { code: '41', name: '41', n: 1 }]);
});

// ── 팀 게이트·오늘 그만 보기 키 ──────────────────────────────────────────────
function fakeStorage() {
  const m = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
           setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, _m: m };
}
function withStorage(ls, fn) {
  const had = Object.prototype.hasOwnProperty.call(global, 'localStorage');
  const prev = global.localStorage;
  global.localStorage = ls;
  try { return fn(); } finally { if (had) global.localStorage = prev; else delete global.localStorage; }
}

test('shouldShowOverduePopup: 영업 계열 + 1건 이상 + 안 건너뜀일 때만', function () {
  assert.strictEqual(logic.shouldShowOverduePopup({ sales: true, count: 3, skipped: false }), true);
  assert.strictEqual(logic.shouldShowOverduePopup({ sales: false, count: 3, skipped: false }), false);
  assert.strictEqual(logic.shouldShowOverduePopup({ sales: true, count: 0, skipped: false }), false);
  assert.strictEqual(logic.shouldShowOverduePopup({ sales: true, count: 3, skipped: true }), false);
  assert.strictEqual(logic.shouldShowOverduePopup(null), false);
});

test('팀 게이트: 영업 계열(영업팀·팀장·부장·디자이너·마스터)만 팝업 대상, 전산·예산·둘러보기는 아니다', function () {
  withStorage(fakeStorage(), function () {
    const d = '2026-11-09';
    ['영업팀', '영업팀장', '영업부장', '디자이너'].forEach(function (role) {
      assert.strictEqual(ov.shouldShow({ role: role }, '1234567', d, 5), true, role);
    });
    assert.strictEqual(ov.shouldShow({ master: true }, '1234567', d, 5), true);
    ['전산팀', '예산팀', '전산팀장', ''].forEach(function (role) {
      assert.strictEqual(ov.shouldShow({ role: role }, '1234567', d, 5), false, '[' + role + ']');
    });
    assert.strictEqual(ov.shouldShow({}, '', d, 5), false);                      // 둘러보기
    assert.strictEqual(ov.shouldShow({ role: '영업팀' }, '1234567', d, 0), false);   // 미처리 0건
  });
});

test('오늘 더 이상 보지 않기: 사번+날짜 키라 사람·날짜마다 따로다', function () {
  const ls = fakeStorage();
  withStorage(ls, function () {
    assert.strictEqual(store.overdueSkipKey('1234567', '2026-11-09'), 'tbd.overdueSkip.1234567.2026-11-09');
    assert.strictEqual(store.isOverdueSkipped('1234567', '2026-11-09'), false);
    assert.strictEqual(store.skipOverdueToday('1234567', '2026-11-09'), true);
    assert.strictEqual(store.isOverdueSkipped('1234567', '2026-11-09'), true);
    assert.strictEqual(store.isOverdueSkipped('1234567', '2026-11-10'), false);   // 자정이 지나면 다시 뜬다
    assert.strictEqual(store.isOverdueSkipped('7654321', '2026-11-09'), false);   // 다른 사람은 그대로
    assert.strictEqual(ov.shouldShow({ role: '영업팀' }, '1234567', '2026-11-09', 5), false);
    assert.strictEqual(ov.shouldShow({ role: '영업팀' }, '1234567', '2026-11-10', 5), true);
    assert.strictEqual(store.overdueSkipKey('', '2026-11-09'), 'tbd.overdueSkip.anon.2026-11-09');
  });
});

test('오늘 그만 보기: 저장소 접근이 막혀도 던지지 않는다', function () {
  const broken = {
    getItem: function () { throw new Error('blocked'); },
    setItem: function () { throw new Error('blocked'); },
  };
  withStorage(broken, function () {
    assert.strictEqual(store.isOverdueSkipped('1234567', '2026-11-09'), false);
    assert.strictEqual(store.skipOverdueToday('1234567', '2026-11-09'), false);
    assert.strictEqual(store.saveOverduePanelOpen(false), false);
    assert.strictEqual(store.loadOverduePanelOpen(), null);
    // 막혀 있어도 팝업은 뜬다(건너뜀 기록이 없으니)
    assert.strictEqual(ov.shouldShow({ role: '영업팀' }, '1234567', '2026-11-09', 5), true);
  });
});

test('패널 열림 저장값: 없음 null, 저장하면 불리언', function () {
  withStorage(fakeStorage(), function () {
    assert.strictEqual(store.loadOverduePanelOpen(), null);
    store.saveOverduePanelOpen(false);
    assert.strictEqual(store.loadOverduePanelOpen(), false);
    store.saveOverduePanelOpen(true);
    assert.strictEqual(store.loadOverduePanelOpen(), true);
  });
});

// ── 배치 규칙 ───────────────────────────────────────────────────────────────
// modeFor·defaultOpen(경과 패널 배치 규칙)은 지도의 경과 패널이 없어지며 함께 삭제했다(2026-11-25 예상 공고현황).
test('shouldRedraw: 폭이 바뀌면 같은 배치 안에서도 다시 그리고, 드릴인·같은 폭·첫 호출은 그리지 않는다', function () {
  assert.strictEqual(ov.shouldRedraw(1440, 1366, false), true);   // 도킹끼리
  assert.strictEqual(ov.shouldRedraw(1365, 929, false), true);    // 서랍끼리
  assert.strictEqual(ov.shouldRedraw(1440, 1440, false), false);
  assert.strictEqual(ov.shouldRedraw(1440, 1366, true), false);   // 드릴인
  assert.strictEqual(ov.shouldRedraw(undefined, 1366, false), false);
});

test('쌓기 모드(880px 이하) CSS: 틀이 위에서부터 쌓여 패널 머리가 잘리지 않는다', function () {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const i = html.indexOf('@media (max-width: 880px)');
  assert.ok(i > 0);
  const block = html.slice(i, html.indexOf('</style>', i));
  const m = block.match(/#drill-wrap\s*\{[^}]*\}/);
  assert.ok(m, '쌓기 규칙이 있어야 한다');
  assert.ok(/flex-direction:\s*column/.test(m[0]));
  assert.ok(/justify-content:\s*flex-start/.test(m[0]));
  assert.ok(/#tab-map\.active\s*\{[^}]*overflow-y:\s*auto/.test(block));
});

test('도장 폭 고정 CSS와 전체 탭의 미처리 표시', function () {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(/\.ov-item > \.ov-stamp\s*\{[^}]*min-width:\s*60px/.test(html));
  const s = logic.overdueSummary([rec('가구청', '11', '2026-06-28', { confirmed: true })], TODAY);
  const all = ov.listHtml(s, 'all', { watched: [] });
  assert.ok(all.includes('class="ov-status">미처리<'));
  const pending = ov.listHtml(s, 'pending', { watched: [] });
  assert.ok(!pending.includes('ov-status'));
});

// ── 화면 조각 ───────────────────────────────────────────────────────────────
test('itemHtml: D+n 도장, 스크린리더 문장, 기관명 이스케이프', function () {
  const s = logic.overdueSummary([rec('<b>가</b>구청', '11', '2026-10-28', { confirmed: false })], TODAY);
  const html = ov.itemHtml(s.items[0], true);
  assert.ok(html.includes('D+12'));
  assert.ok(html.includes('예정일 12일 지남'));
  assert.ok(!html.includes('<b>가</b>'));
  assert.ok(html.includes('&lt;b&gt;'));
  assert.ok(html.includes('class="ov-conf is-est"'));
  assert.ok(html.includes('>추정<'));
  assert.ok(!html.includes('추측'));
});

test('itemHtml: 패널 행(slot)은 이름이 열기 버튼(ov-open, data-id=instKey)이고 이름은 이스케이프된다', function () {
  const s = logic.overdueSummary([rec('<b>가</b>구청', '11', '2026-10-28', { confirmed: false })], TODAY);
  const html = ov.itemHtml(s.items[0], true);
  assert.ok(html.includes('class="ov-name ov-open"'));
  assert.ok(html.includes('data-id="' + logic.esc(logic.instKey(s.items[0].rec)) + '"'));
  assert.ok(html.includes('<button type="button"'));
  assert.ok(!html.includes('<b>가</b>'));
});

test('itemHtml: 팝업 목록(slot 거짓)에는 ov-open 버튼이 없다', function () {
  const s = logic.overdueSummary([rec('나구청', '11', '2026-10-28', { confirmed: false })], TODAY);
  const html = ov.itemHtml(s.items[0], false);
  assert.ok(!html.includes('ov-open'));
  assert.ok(html.includes('<span class="ov-name"'));
});

test('findItem: instKey로 항목을 찾고, 없는 id나 summary가 null이면 null', function () {
  const s = logic.overdueSummary([rec('다구청', '11', '2026-10-28', { confirmed: false })], TODAY);
  const it = s.items[0];
  assert.strictEqual(ov.findItem(s, logic.instKey(it.rec)), it);
  assert.strictEqual(ov.findItem(s, '없는-키'), null);
  assert.strictEqual(ov.findItem(null, logic.instKey(it.rec)), null);
});

test('confHtml: 공고일 7곳은 이름표 \'공고일\'+보조 문구가 확정·추정 표식을 대신하고, 추정 근거는 title로 준다', function () {
  const s = logic.overdueSummary([
    rec('영천시청', '47', '2026-07-30'),
    rec('추정건', '41', null, { contractEnd: undefined, confirmed: false, lastBid: '2022-10-20', term: 4 }),
  ], TODAY);
  const byName = {};
  s.items.forEach(function (i) { byName[i.name] = i; });
  const chk = ov.confHtml(byName['영천시청']);
  assert.ok(chk.includes('ov-conf is-notice') && chk.includes('>공고일<') && chk.includes('class="dt-note"') && /공고일 \d{4}-\d{2}-\d{2}/.test(chk));
  assert.ok(!chk.includes('확정') && !chk.includes('>추정<') && !chk.includes('title=') && !chk.includes('확인 중'));
  const est = ov.confHtml(byName['추정건']);
  assert.ok(est.includes('지난 금고 선정일 2022-10-20 + 4년으로 계산한 날짜'));
});

test('listHtml: 관심 지역이 없으면 안내 한 줄과 접힌 시·도 묶음, 있으면 관심 묶음이 펼쳐진다', function () {
  const s = logic.overdueSummary([rec('a', '11', '2026-10-01'), rec('b', '42', '2026-10-02')], TODAY);
  const none = ov.listHtml(s, 'pending', { watched: [], opened: null });
  assert.ok(none.includes('id="ov-hint-watch"'));
  assert.ok(!none.includes('data-group="watch"'));
  assert.ok(!/ open>/.test(none) && !/ open>/.test(none.replace(/data-group="[^"]*"/g, '')));
  const some = ov.listHtml(s, 'pending', { watched: ['42'], opened: null });
  assert.ok(!some.includes('ov-hint-watch'));
  assert.ok(/data-group="watch" open>/.test(some));
  assert.ok(/data-group="11">/.test(some));          // 시·도 묶음은 접힘
  // 사용자가 펼쳐 둔 묶음은 다시 그려도 유지
  const kept = ov.listHtml(s, 'pending', { watched: ['42'], opened: new Set(['11']) });
  assert.ok(/data-group="11" open>/.test(kept));
  assert.ok(/data-group="watch">/.test(kept));
});

test('listHtml: 지연·처리됨은 0건과 준비중 안내, 빈 경과는 빈 상태 문구', function () {
  const s = logic.overdueSummary([rec('a', '11', '2026-10-01')], TODAY);
  const delayed = ov.listHtml(s, 'delayed', {});
  assert.ok(delayed.includes('지연·재공고 대기로 기록된 건이 없습니다.'));
  assert.ok(!delayed.includes('준비중'));
  const done = ov.listHtml(s, 'done', {});
  assert.ok(done.includes('공고 진행 중·공고 종료·입찰 없음으로 기록된 건이 없습니다.'));
  const empty = logic.overdueSummary([rec('a', '11', '2027-10-01')], TODAY);
  assert.ok(ov.listHtml(empty, 'pending', {}).includes('공고 예정일이 지난 미처리 건이 없습니다.'));
  assert.ok(ov.listHtml(empty, 'all', {}).includes('공고 예정일이 지난 건이 없습니다.'));
  assert.ok(ov.listHtml(null, 'pending', {}).includes('기관 목록을 불러오는 중입니다.'));
  assert.ok(!ov.listHtml(s, 'pending', {}).includes('입찰 종료'));
});

test('popupParts: 총 건수, 시·도별 건수, 상위 5건, 외 N건, 관심 없음 안내', function () {
  const list = [];
  for (let i = 1; i <= 7; i += 1) list.push(rec('기관' + i, '11', '2026-10-0' + i));   // 서울 7건
  list.push(rec('경기1', '41', '2026-10-10'));
  const s = logic.overdueSummary(list, TODAY);
  const p = ov.popupParts(s, [], '2026-11-09');
  assert.strictEqual(p.n, 8);
  assert.strictEqual(p.nText, '8건');
  assert.ok(p.sum.includes('기준일 2026-11-09.'));
  assert.ok(p.sidoHtml.includes('<b>7</b>') && p.sidoHtml.includes('<b>1</b>'));
  assert.strictEqual((p.listHtml.match(/<li class="ov-item"/g) || []).length, 5);
  assert.strictEqual(p.more, '외 3건이 더 있습니다.');
  assert.strictEqual(ov.popupParts(s, [], '2026-11-09', 'notice').more, '외 3건은 입찰 공고 현황의 [공고 예정일 경과]에서 볼 수 있습니다.');
  assert.ok(p.hint.includes('관심 지역이 없어'));
  const w = ov.popupParts(s, ['41'], '2026-11-09');
  assert.strictEqual(w.hint, '');
  assert.ok(w.listHtml.indexOf('경기1') < w.listHtml.indexOf('기관'));   // 관심 지역(경기)이 맨 앞
  const few = ov.popupParts(logic.overdueSummary([rec('a', '11', '2026-10-01')], TODAY), [], '2026-11-09');
  assert.strictEqual(few.more, '');
});

// ── 화면 글자 '추정' ────────────────────────────────────────────────────────
test('화면 글자는 추정, 내부 값은 추측 유지', function () {
  assert.strictEqual(logic.confidenceLabel('추측'), '추정');
  assert.strictEqual(logic.confidenceLabel('확정'), '확정');
  assert.strictEqual(logic.effectiveBid({ contractEnd: '2026-12-03' }).confidence, '추측');   // 내부 값은 그대로
  assert.strictEqual(logic.formatBidDate({ contractEnd: '2026-12-03' }), '2026-12-03(추측)');
  assert.strictEqual(logic.formatBidDateLabel({ contractEnd: '2026-12-03' }), '2026-12-03(추정)');
  assert.strictEqual(logic.formatBidDateLabel({ lastBid: '2022-12-05', term: 2 }), '2024-12-05(추정)');
  assert.strictEqual(logic.formatBidDateLabel({}), '미상');
});

// 티커(임박 TOP5) 시험은 머리 줄로 바뀌며 map_expected.test.js '머리 줄'로 옮겼다(2026-11-25).
test('경과 도장·확인 중 아이콘은 render.ICONS에 있다(문자 아이콘 아님)', function () {
  assert.ok(render.ICONS.overdue.startsWith('<svg'));
  assert.ok(render.ICONS.check.startsWith('<svg'));
});

test('팝업 전체 보기 클릭 분기: 공고 현황 메뉴가 있으면 dashboard.showPast(goNotice), 없으면 단추 숨김·그냥 닫기', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'overdue.js'), 'utf8');
  const dsrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'dashboard.js'), 'utf8');
  assert.ok(/function popDest\(\)/.test(src) && /function goNotice\(\)/.test(src));
  assert.ok(/if \(!toNotice\) \{ ov\.closePopup\(true\); return; \}/.test(src));
  assert.ok(src.indexOf('dest: dest') > 0);
  assert.ok(/dash\.isMounted = /.test(dsrc) && /dash\.showPast = /.test(dsrc) && /dash\.selectKey = /.test(dsrc));
});

test('경과 팝업(#ov-pop): .dlg 틀 — 제목 줄에 단추 없음, 아래 줄 skip→all→close, 옛 CSS 없음(design 11-23)', function () {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const s = html.indexOf('<div id="ov-pop"'); assert.ok(s > 0);
  const b = html.slice(s, html.indexOf('</footer>', s) + 9);
  assert.match(b, /class="dlg" role="dialog" aria-modal="true" aria-labelledby="ov-pop-title ov-pop-n"/);
  const bar = b.slice(b.indexOf('<header class="dlg-bar">'), b.indexOf('</header>'));
  assert.ok(bar.indexOf('<h2 class="dlg-t" id="ov-pop-title" tabindex="-1">') >= 0 && bar.indexOf('id="ov-pop-n"') > 0);
  assert.strictEqual((bar.match(/<button/g) || []).length, 0);
  const foot = b.slice(b.indexOf('<footer class="dlg-foot">'));
  const at = ['ov-pop-skip', 'ov-pop-all', 'ov-pop-close'].map(function (id) { return foot.indexOf('id="' + id + '"'); });
  assert.ok(at[0] > 0 && at[0] < at[1] && at[1] < at[2], 'skip → all → close');
  assert.match(foot, /<button class="link-btn" id="ov-pop-skip"/);
  assert.match(foot, /<button class="dlg-go" id="ov-pop-all"/);
  assert.doesNotMatch(b, /modal-box|ov-pop-box|ov-pop-head|ov-pop-foot/);
  assert.doesNotMatch(html, /\.ov-pop-box|\.ov-pop-head|\.ov-pop-foot|#ov-pop-title \{/);
  assert.match(html, /#ov-pop \.dlg-t \{ flex:0 1 auto; \}/);
  const before = html.slice(0, s);   // 덮개는 body 직계(section 밖)여야 뒤 화면이 inert 된다
  assert.strictEqual((before.match(/<section\b/g) || []).length, (before.match(/<\/section>/g) || []).length);
});

test('overdue.js: 팝업은 dlg가 연다 — 자체 Esc·Tab·바깥 클릭·popOpen·returnTo 없음, 이동은 restore:false', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'overdue.js'), 'utf8');
  assert.match(src, /root\.dlg\.open\(pop, \{ restoreFallback: popFallback/);
  assert.match(src, /root\.dlg\.close\(pop, restore === false \? \{ restore: false \} : undefined\)/);
  assert.doesNotMatch(src, /popOpen|returnTo|window\.addEventListener\('keydown'|window\.addEventListener\('click'/);
});

test('pickRefocus: 같은 행이 있으면 그 행, 없으면 같은 묶음의 다음 행, 다음이 없으면 묶음 제목', function () {
  const order = ['a', 'b', 'c'];
  assert.deepStrictEqual(ov.pickRefocus(order, 'b', function (x) { return true; }), { kind: 'self', id: 'b' });
  assert.deepStrictEqual(ov.pickRefocus(order, 'b', function (x) { return x === 'c'; }), { kind: 'next', id: 'c' });
  assert.deepStrictEqual(ov.pickRefocus(order, 'b', function (x) { return x === 'a'; }), { kind: 'group' });   // 앞 행으로는 가지 않는다
  assert.deepStrictEqual(ov.pickRefocus([], 'z', function () { return false; }), { kind: 'group' });
});
