// 사이드바 아코디언(한 번에 하나만 열림 + 마지막 상태 기억, 사용자 결정 2026-11-11)과 현황판 기간 기억(store) 규칙.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const nav = require('../js/nav.js');
const store = require('../js/store.js');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

// localStorage 대역(전역을 바꿨다가 되돌린다). broken=true면 접근할 때마다 예외.
function withStorage(init, fn, broken) {
  const data = Object.assign({}, init || {});
  const fake = broken ? new Proxy({}, { get: function () { throw new Error('blocked'); } }) : {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
  };
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
  try { return fn(data); }
  finally {
    if (prev) Object.defineProperty(globalThis, 'localStorage', prev); else delete globalThis.localStorage;
  }
}

const ALL_ON = { map: true, regions: true, workflow: true, approvals: true, tasks: true, chat: true, knowledge: true, admin: true };

// ── 순수 규칙 ──────────────────────────────────────────────────────
test('openOnNavigate: 화면 이동은 그 분류를 연다(하나만이므로 지금 열린 다른 분류는 닫힌다), 분류가 없으면 그대로', function () {
  assert.strictEqual(nav.openOnNavigate(null, 'scan'), 'scan');
  assert.strictEqual(nav.openOnNavigate('manage', 'scan'), 'scan');
  assert.strictEqual(nav.openOnNavigate('scan', 'scan'), 'scan');
  assert.strictEqual(nav.openOnNavigate('manage', null), 'manage');
  assert.strictEqual(nav.openOnNavigate(null, null), null);
});

test('toggleCat: 닫힌 걸 누르면 그쪽으로 옮기고 열린 걸 다시 누르면 닫는다', function () {
  assert.strictEqual(nav.toggleCat(null, 'scan'), 'scan');
  assert.strictEqual(nav.toggleCat('scan', 'manage'), 'manage');
  assert.strictEqual(nav.toggleCat('scan', 'scan'), null);
});

test('validOpen: 지금 보이는 분류 id만 통과, 모르는 id·빈 값은 null', function () {
  const built = nav.build(ALL_ON, { role: '영업팀' });
  assert.strictEqual(nav.validOpen(built, 'manage'), 'manage');
  assert.strictEqual(nav.validOpen(built, 'nope'), null);
  assert.strictEqual(nav.validOpen(built, ''), null);
  assert.strictEqual(nav.validOpen(built, null), null);
  const guest = nav.build({ map: true, regions: true }, {});
  assert.strictEqual(nav.validOpen(guest, 'manage'), null);        // 권한으로 사라진 분류는 버린다
  assert.strictEqual(nav.validOpen(guest, 'scan'), 'scan');
});

test('catBadgeSum: 접힌 분류 배지 = 안 배지 숫자의 합, 숫자 아닌 값·0 이하는 세지 않는다', function () {
  assert.strictEqual(nav.catBadgeSum(['10']), 10);
  assert.strictEqual(nav.catBadgeSum(['3', '4', '']), 7);
  assert.strictEqual(nav.catBadgeSum(['x', '0', '-2']), 0);
  assert.strictEqual(nav.catBadgeSum([]), 0);
  assert.strictEqual(nav.catBadgeSum(undefined), 0);
});

// ── 저장(store) ────────────────────────────────────────────────────
test('navOpen 키는 사번별(guest 따로), 사번 모양이 아닌 값은 guest', function () {
  assert.strictEqual(store.navOpenKey('2400001'), 'tbd.navOpen.2400001');
  assert.strictEqual(store.navOpenKey(''), 'tbd.navOpen.guest');
  assert.strictEqual(store.navOpenKey('guest'), 'tbd.navOpen.guest');
  assert.strictEqual(store.navOpenKey('../x'), 'tbd.navOpen.guest');
  withStorage({}, function (data) {
    assert.strictEqual(store.saveNavOpen('2400001', 'manage'), true);
    store.saveNavOpen('guest', 'scan');
    assert.strictEqual(store.loadNavOpen('2400001'), 'manage');
    assert.strictEqual(store.loadNavOpen('2400002'), null);          // 다른 사번은 영향 없음
    assert.strictEqual(store.loadNavOpen('guest'), 'scan');
    assert.deepStrictEqual(Object.keys(data).sort(), ['tbd.navOpen.2400001', 'tbd.navOpen.guest']);
  });
});

test('navOpen 저장값 검증: 모양이 틀린 값은 읽지 않고, 닫음(null)은 키를 지운다, 저장소가 막혀도 죽지 않는다', function () {
  withStorage({ 'tbd.navOpen.guest': JSON.stringify('<img onerror=x>') }, function () {
    assert.strictEqual(store.loadNavOpen('guest'), null);
  });
  withStorage({ 'tbd.navOpen.guest': JSON.stringify(['scan']) }, function () {
    assert.strictEqual(store.loadNavOpen('guest'), null);            // 배열(여러 개 열기 방식)은 쓰지 않는다
  });
  withStorage({ 'tbd.navOpen.guest': '{깨진 json' }, function () {
    assert.strictEqual(store.loadNavOpen('guest'), null);
  });
  withStorage({}, function (data) {
    store.saveNavOpen('guest', 'scan');
    store.saveNavOpen('guest', null);                                 // 모두 접음도 기억('none')
    assert.strictEqual(data['tbd.navOpen.guest'], JSON.stringify('none'));
    assert.strictEqual(store.loadNavOpen('guest'), 'none');
    assert.strictEqual(store.saveNavOpen('guest', 'Bad Id'), true);   // 모양이 틀리면 저장 대신 지운다
    assert.strictEqual('tbd.navOpen.guest' in data, false);
  });
  withStorage({}, function () {
    assert.strictEqual(store.loadNavOpen('guest'), null);
    assert.strictEqual(store.saveNavOpen('guest', 'scan'), false);
  }, true);
});

test('store.loadDashWindow/saveDashWindow: 허용 목록만, 그 밖이나 저장소 예외는 6', function () {
  withStorage({}, function (data) {
    assert.strictEqual(store.loadDashWindow(), '6');                   // 저장값 없음
    ['3', '6', '12', 'all'].forEach(function (k) {
      assert.strictEqual(store.saveDashWindow(k), true);
      assert.strictEqual(store.loadDashWindow(), k);
    });
    assert.strictEqual(data['tbd.dashWindow'], JSON.stringify('all'));
    assert.strictEqual(store.saveDashWindow('7'), false);              // 허용 밖은 저장하지 않는다
    assert.strictEqual(store.loadDashWindow(), 'all');
  });
  withStorage({ 'tbd.dashWindow': JSON.stringify('99') }, function () { assert.strictEqual(store.loadDashWindow(), '6'); });
  withStorage({ 'tbd.dashWindow': JSON.stringify(12) }, function () { assert.strictEqual(store.loadDashWindow(), '6'); });
  withStorage({}, function () {
    assert.strictEqual(store.loadDashWindow(), '6');
    assert.strictEqual(store.saveDashWindow('12'), false);
  }, true);
});

// ── 마크업·CSS·와이어링(소스 고정) ─────────────────────────────────
test('사이드바 마크업: 펼침 표시는 aria-hidden SVG, CSS에 content:"▸"·cursor:default 줄이 없다', function () {
  assert.ok(/<svg class="chev"[^>]*aria-hidden="true"/.test(APP));
  assert.strictEqual(HTML.indexOf('content:"▸"'), -1);
  assert.strictEqual(/\.nav-cat::after/.test(HTML), false);
  assert.strictEqual(/is-guest #side-nav \.nav-cat \{ cursor:default/.test(HTML), false);
  assert.ok(/\.nav-cat \.chev \{[^}]*transition:transform \.2s/.test(HTML));
  assert.ok(/\.nav-cat\.open \.chev \{ transform:rotate\(90deg\)/.test(HTML));
});

test('사이드바 전환은 200ms, reduced-motion이면 끈다', function () {
  const m = /\.nav-items \{[^}]*\}/.exec(HTML)[0];
  assert.ok(m.indexOf('.2s') >= 0 && m.indexOf('.28s') < 0);
  assert.ok(/prefers-reduced-motion: reduce\) \{ \.nav-items, \.nav-items\.open, \.nav-cat \.chev \{ transition:none; \}/.test(HTML));
});

// ── 열림 상태 기계(팀 결정 11-11) ──
test('저장값 manage + 영업팀 + 현황판 홈 자동 열림 → manage 유지(홈이 덮어쓰지 않는다)', function () {
  const built = nav.build(ALL_ON, { role: '영업팀' });
  let s = nav.settleOpen(nav.newOpenState('manage'), built, 'scan');     // 로그인 뒤 첫 그림: 저장값 복원
  assert.deepStrictEqual(s, { open: 'manage', fixed: true, pending: null });
  s = nav.navigatedOpen(s, 'scan', true);                                 // applyHome이 현황판을 연다(자동)
  assert.strictEqual(s.open, 'manage');
});

test('저장값이 아직 안 보이는 분류(권한이 늦게 옴)면 미뤄 두었다가 보이면 복원, 그 사이 자동 열림은 덮지 않는다', function () {
  const early = nav.build({ map: true, regions: true }, {});   // 영업 계열은 준비중 항목 덕에 manage가 이미 보이므로, 권한 전(타 역할) 상태로 만든다
  let s = nav.settleOpen(nav.newOpenState('manage'), early, 'scan');
  assert.deepStrictEqual(s, { open: 'scan', fixed: false, pending: 'manage' });   // 임시로 현재 분류
  s = nav.navigatedOpen(s, 'scan', true);
  assert.strictEqual(s.pending, 'manage');
  s = nav.settleOpen(s, nav.build(ALL_ON, { role: '영업팀' }), 'scan');
  assert.deepStrictEqual(s, { open: 'manage', fixed: true, pending: null });
});

test('저장값 없음 → 현재 화면 분류(홈 자동 열림도 따른다), 저장은 하지 않는다', function () {
  const built = nav.build(ALL_ON, { role: '영업팀' });
  let s = nav.settleOpen(nav.newOpenState(null), built, null);
  assert.strictEqual(s.open, null);
  s = nav.navigatedOpen(s, 'scan', true);
  assert.deepStrictEqual(s, { open: 'scan', fixed: false, pending: null });
  withStorage({}, function (data) { assert.deepStrictEqual(Object.keys(data), []); });
});

test("'none' = 모두 접음을 기억: 복원해도 현재 분류로 다시 열리지 않고, 자동 열림도 덮지 않는다", function () {
  const built = nav.build(ALL_ON, { role: '영업팀' });
  let s = nav.settleOpen(nav.newOpenState('none'), built, 'scan');
  assert.deepStrictEqual(s, { open: null, fixed: true, pending: null });
  s = nav.navigatedOpen(s, 'scan', true);
  assert.strictEqual(s.open, null);
  assert.strictEqual(nav.navigatedOpen(s, 'manage', false).open, 'manage');   // 사용자가 연 화면이면 그 분류를 연다
  assert.strictEqual(nav.validOpen(built, 'none'), null);
});

test('사용자 전환: 새 상태는 앞 사용자의 open을 쓰지 않는다(저장값 없으면 현재 화면 분류)', function () {
  const built = nav.build(ALL_ON, { role: '영업팀' });
  const a = nav.toggledOpen(nav.settleOpen(nav.newOpenState('manage'), built, 'scan'), 'tools');
  assert.strictEqual(a.open, 'tools');
  const b = nav.settleOpen(nav.newOpenState(null), built, 'scan');
  assert.strictEqual(b.open, 'scan');
});

test('toggledOpen: 직접 펼침·접음은 fixed로 굳고 pending을 버린다', function () {
  const s = nav.toggledOpen({ open: 'scan', fixed: false, pending: 'manage' }, 'scan');
  assert.deepStrictEqual(s, { open: null, fixed: true, pending: null });
  assert.strictEqual(nav.toggledOpen(s, 'plan').open, 'plan');
});

test('app.js 와이어링: 복원은 사번별, 저장은 직접 펼침·접음 때만, 홈 자동 열림 표시, 접힌 분류 배지 합계', function () {
  assert.ok(APP.indexOf('root.store.loadNavOpen') >= 0 && APP.indexOf('root.store.saveNavOpen') >= 0);
  assert.ok(APP.indexOf('root.nav.settleOpen(navOpen, navBuilt') >= 0);
  assert.ok(APP.indexOf('root.nav.navigatedOpen(navOpen, cat, navHoming)') >= 0);
  assert.ok(APP.indexOf('root.nav.toggledOpen(navOpen, cat.dataset.cat)') >= 0);
  assert.strictEqual((APP.match(/rememberOpenCat\(\);/g) || []).length, 1);          // 호출은 클릭 한 곳뿐
  assert.ok(/navHoming = true; try \{ openNavItem\(item\)/.test(APP));
  assert.ok(/saveNavOpen\(navOpenWho, openCat\)/.test(APP));                         // 로그아웃 중 guest 키로 새지 않게
  assert.ok(APP.indexOf('root.nav.catBadgeSum(vals)') >= 0);
  assert.ok(APP.indexOf('nav-cat-count') >= 0 && APP.indexOf('지금 보는 화면 포함') >= 0);
  assert.ok(/s\.emp \? s\.emp : 'guest'/.test(APP));                   // 키는 사번, 없으면 guest
});
