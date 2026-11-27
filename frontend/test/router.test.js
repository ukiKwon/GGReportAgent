// 화면 주소(#/…) 규칙(js/router.js) + 연결 소스 단언(app.js·landing.js·index.html). NEXT 135.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const router = require('../js/router.js');
const nav = require('../js/nav.js');
const landing = require('../js/landing.js');

const ROOT = path.join(__dirname, '..');
const read = function (p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); };

// 서버 API 맨 앞 경로 + 정적 폴더·기본 경로(경로 방식으로 바꿀 때 겹치면 안 되는 이름).
const API_FIRST = ['accounts', 'approvals', 'approval-requests', 'approval-deputies', 'assignment-candidates', 'auth',
  'bank-contracts', 'bid-targets', 'bidcases', 'board-docs', 'board-forms', 'board-materials', 'board-minutes', 'consistency',
  'design-tasks', 'documents', 'ext-checks', 'inbox', 'institutions', 'institution-heads', 'institution-plans', 'llm', 'me',
  'menus', 'my-watch', 'notice-rounds', 'notifications', 'plan-collect', 'prep-board', 'preps', 'sysadmin', 'tasks', 'workflow',
  'index.html', 'js', 'fonts', 'geo', 'data', 'vendor', 'test', 'error'];

// 즐겨찾기로 남는 주소라 바꾸면 알려 준다(planner §4 표 그대로).
const GOLDEN = ['intro', 'login', 'home', 'bid-status', 'org-plans', 'regions', 'notice-forecast', 'notices', 'notice-collect',
  'proposal-prep', 'board-writing', 'proposals', 'my-tasks', 'proposal-team', 'co-writing', 'internal-review', 'final-submit',
  'bid-results', 'contract-history', 'contract-performance', 'deadlines', 'request-log', 'ai-chat', 'knowledge', 'keyword-search',
  'approval-box', 'my-info', 'admin', 'admin/users', 'admin/permissions', 'admin/menus', 'admin/access-log', 'admin/plan-collect'];

function navIds() {
  const ids = [];
  nav.CATEGORIES.forEach(function (c) {
    c.items.forEach(function (it) {
      ids.push(it.key ? (it.view ? it.key + ':' + it.view : it.key) : (it.id || 'soon:' + it.label));   // nav.build와 같은 id 규칙
    });
  });
  return ids;
}

test('주소 이름 표: 골든 목록과 같고, 이름 규칙(소문자·숫자·하이픈, 최대 2단)을 지킨다', function () {
  assert.deepStrictEqual(router.NAMES.slice().sort(), GOLDEN.slice().sort());
  router.NAMES.forEach(function (n) { assert.ok(/^[a-z][a-z0-9-]{0,31}(\/[a-z][a-z0-9-]{0,31})?$/.test(n), n); });
  assert.ok(Object.isFrozen(router.NAMES));
});

test('nav.js 항목 id 전부가 대응표에 있다(준비중 라벨을 고치면 여기서 빨개진다 — router.js 표를 같이 고친다)', function () {
  navIds().forEach(function (id) {
    assert.ok(router.nameOf(id), 'nav 항목 "' + id + '"에 주소 이름이 없다 — js/router.js SCREENS에 추가하거나 id를 되돌려라');
  });
});

test('대응표의 nav id는 실제 nav 항목이거나 내 정보(myinfo)뿐이고, 이름·id는 1:1이다', function () {
  const ids = navIds();
  const seen = {};
  router.NAMES.forEach(function (n) {
    const id = router.idOf(n);
    if (!id) return;
    assert.ok(id === 'myinfo' || ids.indexOf(id) >= 0, n + ' → ' + id);
    assert.ok(!seen[id], '중복 id ' + id);
    seen[id] = true;
    assert.strictEqual(router.nameOf(id), n);
  });
  assert.strictEqual(ids.filter(function (i, k) { return ids.indexOf(i) !== k; }).length, 0, 'nav id 중복 없음');
});

test('고정 id 상수와 맞물린다(라벨이 바뀌어도 주소는 유지)', function () {
  assert.strictEqual(router.idOf('home'), nav.HOME_ID);
  assert.strictEqual(router.idOf('bid-status'), nav.DASH_ID);
  assert.strictEqual(router.idOf('org-plans'), nav.PLANS_ID);
  assert.strictEqual(router.idOf('notices'), nav.NOTICE_ID);
  assert.strictEqual(router.idOf('notice-collect'), nav.COLLECT_NOTICE_ID);
  assert.strictEqual(router.idOf('proposal-prep'), nav.PREP_ID);
  assert.strictEqual(router.idOf('board-writing'), nav.BOARD_ID);
  assert.strictEqual(router.idOf('proposal-team'), nav.TEAM_ID);
  assert.strictEqual(router.idOf('contract-performance'), nav.RESULTS_ID);
  assert.strictEqual(router.idOf('admin/plan-collect'), nav.COLLECT_ID);
  assert.strictEqual(router.idOf('my-tasks'), 'tasks');           // 탭 버튼 id 규칙(data-tab 'designer'와 별개)
  assert.strictEqual(router.idOf('notice-forecast'), 'map');
});

test('parse·format 왕복: 모든 이름, 그리고 기본 주소 #/', function () {
  router.NAMES.forEach(function (n) {
    assert.strictEqual(router.format(n), '#/' + n);
    assert.deepStrictEqual(router.parse(router.format(n)), { name: n });
  });
  assert.deepStrictEqual(router.parse('#/'), { name: '' });
  assert.strictEqual(router.format(''), '#/');
});

test('parse 거부: 프로토타입 키·스킴·이중 슬래시·역슬래시·대문자·빈 값·모양 틀린 값은 null', function () {
  ['', '#', 'home', '/home', '#home', '#/__proto__', '#/constructor', '#/toString', '#/hasOwnProperty', '#/valueOf',
    '#/admin/__proto__', '#/javascript:alert(1)', '#/http://evil', '#//evil', '#/\\evil', '#/home\\x', '#/Home', '#/HOME',
    '#/home/', '#/home?next=x', '#/home#x', '#/home%20', '#/%68ome', '#/ home', '#/abc', '#/a/b/c', '#/admin/', '#/admin/nope',
    '#/' + 'a'.repeat(33), '#/1home', '#/-home', '#/home/%2e%2e', '#/..', '#/./home'].forEach(function (h) {
    assert.strictEqual(router.parse(h), null, JSON.stringify(h));
  });
  [null, undefined, 5, {}, [], true, function () {}].forEach(function (v) { assert.strictEqual(router.parse(v), null); });
});

test('has·nameOf·idOf·format은 프로토타입 키에 속지 않고 예외도 내지 않는다', function () {
  ['__proto__', 'constructor', 'toString', 'hasOwnProperty'].forEach(function (k) {
    assert.strictEqual(router.has(k), false, k);
    assert.strictEqual(router.nameOf(k), null, k);
    assert.strictEqual(router.idOf(k), null, k);
    assert.strictEqual(router.labelOf(k), '', k);
    assert.strictEqual(router.format(k), '#/', k);
  });
  [null, undefined, 3, {}].forEach(function (v) {
    assert.strictEqual(router.has(v), false); assert.strictEqual(router.nameOf(v), null); assert.strictEqual(router.idOf(v), null);
  });
  assert.strictEqual(router.nameOf('soon:시작화면'), 'home');
  assert.strictEqual(router.nameOf('myinfo'), 'my-info');
  assert.strictEqual(router.nameOf('admin:audit'), 'admin/access-log');
});

test('isRoute: #/ 로 시작하는 hash만 우리 주소(랜딩 앵커 #ld-ai·#main과 겹치지 않는다)', function () {
  assert.strictEqual(router.isRoute('#/'), true);
  assert.strictEqual(router.isRoute('#/abc'), true);
  ['', '#', '#ld-ai', '#ld-flow', '#main', 'x', null, undefined].forEach(function (h) { assert.strictEqual(router.isRoute(h), false, String(h)); });
});

test('resolve: 열 수 있는 화면만, 그룹(admin)은 열 수 있는 첫 하위 화면', function () {
  assert.strictEqual(router.resolve('proposals', function () { return true; }), 'proposals');
  assert.strictEqual(router.resolve('proposals', function () { return false; }), null);
  assert.strictEqual(router.resolve('admin', function (n) { return n === 'admin/menus' || n === 'admin/access-log'; }), 'admin/menus');
  assert.strictEqual(router.resolve('admin', function () { return false; }), null);
  assert.strictEqual(router.resolve('admin', function () { return true; }), 'admin/users');
  ['intro', 'login', 'nope', '__proto__', '', null].forEach(function (n) { assert.strictEqual(router.resolve(n, function () { return true; }), null, String(n)); });
});

test('이름·제목: 탭 제목은 「화면 이름 - 기관영업지원 시스템」', function () {
  assert.strictEqual(router.labelOf('login'), '로그인');
  assert.strictEqual(router.labelOf('intro'), '서비스 소개');
  assert.strictEqual(router.titleOf('login'), '로그인 - 기관영업지원 시스템');
  assert.strictEqual(router.titleOf(''), '기관영업지원 시스템');
  assert.strictEqual(router.titleOf('__proto__'), '기관영업지원 시스템');
  router.NAMES.forEach(function (n) { assert.ok(router.labelOf(n), n + ' 화면 이름'); });
});

test('API 맨 앞 경로·정적 폴더와 겹치지 않는다(경로 방식으로 바꿀 때를 위해 첫 마디 기준)', function () {
  router.NAMES.forEach(function (n) {
    assert.ok(API_FIRST.indexOf(n.split('/')[0]) < 0, n + '의 첫 마디가 API/정적 경로와 같다');
  });
});

test('landing.wantsIntro: 빈 값·#/·#/intro·화면 주소 아닌 값은 소개, 그 밖의 #/… 는 로그인 바로', function () {
  ['', '#', '#/', '#/intro', '#ld-ai', '#main', undefined, null].forEach(function (h) { assert.strictEqual(landing.wantsIntro(h), true, String(h)); });
  ['#/login', '#/proposal-prep', '#/abc', '#/admin/users'].forEach(function (h) { assert.strictEqual(landing.wantsIntro(h), false, h); });
});

// ── 연결(소스 단언) ──────────────────────────────────────────────
const app = read('js/app.js');
const g0 = app.indexOf('// ── 화면 주소(#/…)');
const g1 = app.indexOf('app.init = function');
const glue = app.slice(g0, g1);

test('app.js 연결: 한 덩어리(화면 주소 절)가 있고, 위험한 수단(innerHTML·href·window.open·선택자 조립)을 쓰지 않는다', function () {
  assert.ok(g0 > 0 && g1 > g0);
  ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'location.href', 'window.open', 'eval(', "querySelector(", "classList.add('hidden')", "'tab-btn-' +"].forEach(function (s) {
    assert.ok(glue.indexOf(s) < 0, '화면 주소 절에 ' + s + ' 금지');
  });
  assert.strictEqual(glue.split('.click()').length - 1, 1, '직접 click은 내 정보 한 곳뿐');
  assert.ok(glue.indexOf("byId('tab-btn-myinfo').click()") > 0);
  assert.ok(glue.indexOf('app.openNavItem(id)') > 0);          // 메뉴 항목 진입은 이것 하나
  assert.ok(glue.indexOf('admin.showView(') < 0);   // 호출만 금지(주석의 언급은 허용)
});

test('app.js 연결: hashchange·pageshow(persisted)마다 세션을 다시 확인하고, 로그아웃은 location.replace', function () {
  const h = glue.slice(glue.indexOf('function onRouteHash'));
  assert.ok(h.slice(0, 500).indexOf('root.store.loadSession()') > 0, 'onRouteHash 첫머리에서 세션 재확인');
  assert.ok(glue.indexOf("root.addEventListener('hashchange', onRouteHash)") > 0);
  assert.ok(/addEventListener\('pageshow', function \(e\) \{ if \(e\.persisted\) onRouteHash\(\); \}\)/.test(glue));
  assert.ok(glue.indexOf('root.location.replace(h)') > 0);
  const lo = glue.slice(glue.indexOf('function routeLoggedOut'), glue.indexOf('function applyRoute'));
  assert.ok(lo.indexOf("routeWrite('login', false)") > 0 && lo.indexOf('routeNext = null') > 0);   // 목적지는 로그아웃에서 비운다
});

test('app.js 연결: 주소 해석은 /menus settled 뒤(paintTabs → applyRoute), 시작화면 판정보다 먼저', function () {
  assert.ok(app.indexOf('applyRoute(!(serverMode && menus === null));') > 0);
  assert.ok(app.indexOf('    applyHome(!(serverMode && menus === null))') < 0);
  const ar = glue.slice(glue.indexOf('function applyRoute'), glue.indexOf('function routeShowIntro'));
  assert.ok(ar.indexOf('settled !== false') > 0 && ar.lastIndexOf('applyHome(settled)') > ar.indexOf('routeOpen('));
  assert.ok(/enterApp = function \(session, profile\) \{\s*pendingHome = true; routeEnter\(\);[^\n]*\n\s*app\.resetScreens\(\);/.test(app));
  assert.ok(/recordScreen\(navActiveId\);\s*routeSync\(navActiveId\);/.test(app));
  assert.ok(/app\.showLogin\(''\);\s*routeLoggedOut\(\);/.test(app));
  assert.ok(/app\.wireNav\(\);\s*app\.wireRoute\(\);/.test(app));
});

test('app.js 연결: 로그인 뒤 목적지(routeNext)는 router.parse를 통과한 이름만 메모리에 둔다', function () {
  assert.ok(/routeNext = p\.name/.test(glue));
  assert.ok(glue.indexOf('localStorage') < 0 && glue.indexOf('sessionStorage') < 0);
  assert.ok(app.indexOf('function closeNavTabBody(id)') > app.indexOf('function closeNavTab(id)'));   // 탭 닫기는 기록을 쌓지 않는다
});

test('index.html: router.js는 app.js보다 앞, landing.js는 wantsIntro로 첫 화면을 정한다', function () {
  const html = read('index.html');
  assert.ok(html.indexOf('<script src="js/router.js"></script>') > 0);
  assert.ok(html.indexOf('<script src="js/router.js"></script>') < html.indexOf('<script src="js/app.js"></script>'));
  assert.ok(read('js/landing.js').indexOf('landing.wantsIntro(root.location && root.location.hash)') > 0);
});
