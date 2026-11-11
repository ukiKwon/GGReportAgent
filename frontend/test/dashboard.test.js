// 입찰 현황판(NEXT 77 1단계) 순수 부분: 구간 경계·경과/미상·중복 제거·필터·약정 확인 수·진행 건수·버튼 행렬·이스케이프·CSS 규칙.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const logic = require('../js/logic.js');
const dash = require('../js/dashboard.js');

const TODAY = new Date('2026-11-11T00:00:00');   // 로컬 자정

function plus(days) {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + days);
  return logic.localDateStr(d);
}
function rec(name, region, days, extra) {
  return Object.assign({ name: name, region: region, type: '지자체', contractEnd: days === null ? null : plus(days), confirmed: true }, extra || {});
}

// ── 구간 경계 ──────────────────────────────────────────────────────
test('구간 경계: 0·30 | 31·90 | 91·180 | 181·182·183·365 | 366은 1년 밖', function () {
  const days = [0, 30, 31, 90, 91, 180, 181, 182, 183, 365, 366];
  const list = days.map(function (d) { return rec('기관' + d, '11', d); });
  const m = dash.model(list, TODAY);
  assert.deepStrictEqual(m.buckets, [2, 2, 2, 4]);
  assert.strictEqual(m.upcoming.length, 10);
  assert.strictEqual(m.beyondN, 1);
  assert.strictEqual(m.upcoming[0].days, 0);                 // D-day는 1년 안
  assert.strictEqual(m.upcoming[0].bucket, 0);
  assert.deepStrictEqual(m.upcoming.map(function (u) { return u.days; }), [0, 30, 31, 90, 91, 180, 181, 182, 183, 365]);
});

test('빨강/주황 경계: 182일은 urgent, 183일은 soon', function () {
  const m = dash.model([rec('가', '11', 182), rec('나', '11', 183)], TODAY);
  assert.strictEqual(m.upcoming[0].band, 'urgent');
  assert.strictEqual(m.upcoming[1].band, 'soon');
  const h = dash.rulerHtml(m, '');
  assert.ok(h.indexOf('db-tick red') >= 0 && h.indexOf('db-tick orange') >= 0);
});

// ── 경과·미상·중복 제거 ────────────────────────────────────────────
test('경과·미상 집계와 기관 단위 중복 제거(수원 4구가 1곳)', function () {
  const list = [
    rec('수원시청', '41', 40), rec('수원시청', '41', 40), rec('수원시청', '41', 40), rec('수원시청', '41', 40),
    rec('경과시청', '11', -5), rec('경과군청', '11', -1),
    { name: '미상구청', region: '11', type: '지자체' },
  ];
  const m = dash.model(list, TODAY);
  assert.strictEqual(m.upcoming.length, 1);
  assert.strictEqual(m.overdue.length, 2);
  assert.strictEqual(m.overdue[0].days, 1);                  // 최근에 지난 순
  assert.strictEqual(m.overdue[0].overdue, true);
  assert.strictEqual(m.unknownN, 1);
  assert.strictEqual(m.total, 4);
});

test('확정·확인 중·자료 수정 집계', function () {
  const list = [
    rec('가', '11', 50, { updatedAt: '2026-11-01T10:00:00' }),
    rec('나', '11', 60, { confirmed: false, updatedAt: '2026-11-09' }),
    rec('강남구청', '11', 70),                                // 날짜 의미 확인 중 15곳 중 하나
  ];
  const m = dash.model(list, TODAY);
  assert.strictEqual(m.confirmedN, 2);
  assert.strictEqual(m.underReviewN, 1);
  assert.strictEqual(m.maxUpdated, '2026-11-09');
  const chk = m.upcoming.filter(function (u) { return u.name === '강남구청'; })[0];
  assert.strictEqual(chk.check, true);
  assert.ok(dash.rowHtml(chk, { id: 'x' }).indexOf('날짜 의미 확인 중') >= 0);
});

test('1년 안 0곳: 띠는 0을 숨기지 않고 경과 수를 양 끝에 함께 보인다', function () {
  const m = dash.model([rec('경과시청', '11', -3), rec('먼시청', '11', 500)], TODAY);
  assert.strictEqual(m.upcoming.length, 0);
  const h = dash.stripHtml(m, { confirmed: 0, unconfirmed: 2, total: 2 }, { state: 'offline' }, '');
  assert.ok(h.indexOf('<span class="db-n">0</span>곳') >= 0);
  assert.ok(h.indexOf('경과') >= 0 && h.indexOf('날짜 미상') >= 0);
  assert.ok(h.indexOf('서버에 연결하면 보입니다.') >= 0);
  assert.ok(dash.footHtml(m).indexOf('1년 뒤인 <b>1</b>곳') >= 0);
});

// ── 필터 ───────────────────────────────────────────────────────────
test('종류 필터는 종류가 2개 이상일 때만', function () {
  assert.strictEqual(dash.showTypeFilter([rec('가', '11', 5), rec('나', '26', 6)]), false);
  assert.strictEqual(dash.showTypeFilter([rec('가', '11', 5), rec('나', '26', 6, { type: '공공기관' })]), true);
  assert.strictEqual(dash.showTypeFilter([]), false);
});

test('regionOptions: 데이터에 있는 시·도만, 중복 없이 가나다순', function () {
  const names = { '11': '서울', '26': '부산', '41': '경기' };
  const opts = dash.regionOptions([rec('가', '41', 1), rec('나', '11', 1), rec('다', '11', 1), rec('라', '26', 1)], function (c) { return names[c]; });
  assert.deepStrictEqual(opts.map(function (o) { return o.name; }), ['경기', '부산', '서울']);
  assert.strictEqual(opts.length, 3);
});

test('filterItems: 기관명 검색·지역·종류', function () {
  const m = dash.model([rec('가람시청', '41', 10), rec('나래군청', '42', 20), rec('다솔구청', '41', 30, { type: '공공기관' })], TODAY);
  assert.strictEqual(dash.filterItems(m.upcoming, { q: '나래' }).length, 1);
  assert.strictEqual(dash.filterItems(m.upcoming, { region: '41' }).length, 2);
  assert.strictEqual(dash.filterItems(m.upcoming, { region: '41', type: '공공기관' }).length, 1);
  assert.strictEqual(dash.filterItems(m.upcoming, { q: '없는이름' }).length, 0);
});

// ── 국민은행 약정 확인 수 ──────────────────────────────────────────
test('kbCount: 검증 키 목록이 없으면 확인 0 / 미확인 N', function () {
  const list = [rec('가', '11', 5), rec('나', '26', 6)];
  assert.deepStrictEqual(dash.kbCount(list, undefined), { confirmed: 0, unconfirmed: 2, total: 2 });
  assert.deepStrictEqual(dash.kbCount(list, []), { confirmed: 0, unconfirmed: 2, total: 2 });
});

test('kbCount: region|name 키로 세고 같은 기관 중복·목록에 없는 키는 세지 않는다', function () {
  const list = [rec('가', '11', 5), rec('가', '11', 5), rec('나', '26', 6), rec('다', '41', 7)];
  const k = dash.kbCount(list, [{ key: '11|가', name: '가', slot: null }, '26|나', { key: '99|없음' }]);
  assert.deepStrictEqual(k, { confirmed: 2, unconfirmed: 1, total: 3 });
});

test('KB_VERIFIED(frontend/data/kb-verified.js)의 키가 실제 레코드 region|name과 맞물린다', function (t) {
  const file = path.join(ROOT, 'data/kb-verified.js');
  if (!fs.existsSync(file)) { t.skip('kb-verified.js 아직 없음'); return; }
  const load = function (rel, name) {
    const sb = { window: {} };
    vm.createContext(sb);
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sb);
    return JSON.parse(JSON.stringify(sb.window[name]));   // 다른 realm 값을 이 realm으로 옮긴다
  };
  const verified = load('data/kb-verified.js', 'KB_VERIFIED');
  const institutions = load('data/institutions.js', 'institutions');
  assert.ok(Array.isArray(verified) && verified.length > 0);
  const keys = {};
  institutions.forEach(function (r) { keys[logic.instKey(r)] = true; });
  verified.forEach(function (v) {
    assert.ok(keys[v.key], '레코드에 없는 키: ' + v.key);
    assert.strictEqual(v.key, '' + v.key.split('|')[0] + '|' + v.name);
    assert.ok(v.quote && v.src_date);
  });
  const kb = dash.kbCount(institutions, verified);
  assert.strictEqual(kb.confirmed, verified.length);
});

// ── 진행 건수 ──────────────────────────────────────────────────────
test('progressCount: institution_id로 한 번만, 취소·완료·실행 없음 제외', function () {
  const preps = [
    { institution_id: 'A', state_cd: 'CONFIRMED' }, { institution_id: 'A', state_cd: 'WRITABLE' },
    { institution_id: 'B', state_cd: 'CANCELLED' },
  ];
  const overview = { items: [
    { institution_id: 'A', state: 'RUNNING', done: false },     // 이미 사전준비에서 셌다
    { institution_id: 'C', state: 'RUNNING', done: false },
    { institution_id: 'C', state: 'PENDING_APPROVAL', done: false },
    { institution_id: 'D', state: 'NONE', done: false },
    { institution_id: 'E', state: 'RUNNING', done: true },
  ] };
  assert.deepStrictEqual(dash.progressCount(preps, overview), { prep: 1, writing: 1, total: 2 });
});

test('progressCount: /preps를 못 받는 역할은 제안서 작성 건수만, 둘 다 없으면 null', function () {
  const overview = [{ id: 'C', state: 'RUNNING', done: false }, { id: 'F', state: 'RUNNING', done: false }];
  assert.deepStrictEqual(dash.progressCount(null, overview), { prep: null, writing: 2, total: 2 });
  assert.deepStrictEqual(dash.progressCount(null, null), { prep: null, writing: null, total: null });
  const h = dash.stripHtml(dash.model([], TODAY), { confirmed: 0, unconfirmed: 0, total: 0 }, { state: 'ok', count: dash.progressCount(null, overview) }, '');
  assert.ok(h.indexOf('제안서 작성 중 2건') >= 0);
  const d = dash.stripHtml(dash.model([], TODAY), { confirmed: 0, unconfirmed: 0, total: 0 }, { state: 'denied', code: 403 }, '');
  assert.ok(d.indexOf('권한이 없습니다(403)') >= 0);
});

// ── 버튼 행렬(prep.popoverAction 재사용) ───────────────────────────
// popoverAction 대역: 70번 규격표(서버 모드 + 기관 id + 활성 건 + 역할)를 그대로 흉내 낸다.
const stubPrep = {
  popoverAction: function (r, ctx, actives) {
    if (!ctx.serverMode || !r.institutionId) return null;
    const has = actives.some(function (p) { return p.institution_id === r.institutionId; });
    const sales = ['영업팀', '영업팀장', '영업부장'].indexOf(ctx.role) >= 0;
    if (has && sales) return { kind: 'open' };
    if (!has && (ctx.role === '영업팀' || ctx.role === '영업팀장')) return { kind: 'confirm' };
    return null;
  },
};

test('actionKind 행렬: 역할 × 활성 건 × 서버 모드 × prep 유무', function () {
  const r = { institutionId: 'I1' };
  const act = [{ institution_id: 'I1', state_cd: 'CONFIRMED' }];
  const srv = function (role) { return { serverMode: true, role: role }; };
  assert.strictEqual(dash.actionKind(r, srv('영업팀'), [], stubPrep), 'confirm');
  assert.strictEqual(dash.actionKind(r, srv('영업팀장'), [], stubPrep), 'confirm');
  assert.strictEqual(dash.actionKind(r, srv('영업부장'), [], stubPrep), 'none');
  assert.strictEqual(dash.actionKind(r, srv('디자이너'), [], stubPrep), 'none');
  assert.strictEqual(dash.actionKind(r, srv('영업팀'), act, stubPrep), 'open');
  assert.strictEqual(dash.actionKind(r, srv('영업부장'), act, stubPrep), 'open');
  assert.strictEqual(dash.actionKind(r, srv('디자이너'), act, stubPrep), 'none');
  assert.strictEqual(dash.actionKind({}, srv('영업팀'), [], stubPrep), 'none');                 // 기관 id 없음
  assert.strictEqual(dash.actionKind(r, { serverMode: false, role: '영업팀' }, [], stubPrep), 'unavailable');
  assert.strictEqual(dash.actionKind(r, srv('영업팀'), [], undefined), 'unavailable');          // root.prep 없음
  assert.strictEqual(dash.actionKind(r, srv('영업팀'), [], {}), 'unavailable');
  assert.strictEqual(dash.actionKind(r, srv('영업팀'), [], { popoverAction: function () { return 'confirm'; } }), 'confirm');   // 문자열 반환도 받는다
  assert.strictEqual(dash.actionKind(r, srv('영업팀'), [], { popoverAction: function () { throw new Error('x'); } }), 'unavailable');
});

test('actHtml: 서버 없음은 버튼 없이 안내, 권한 밖은 한 줄 안내, 확인 줄은 조사 함수', function () {
  const it = dash.model([rec('부산광역시', '26', 40)], TODAY).upcoming[0];
  const un = dash.actHtml(it, { act: 'unavailable' });
  assert.ok(un.indexOf('서버에 연결되면 [제안 확정]을 쓸 수 있습니다.') >= 0);
  assert.ok(un.indexOf('id="db-cf"') < 0 && un.indexOf('id="db-do"') < 0);
  assert.ok(dash.actHtml(it, { act: 'confirm' }).indexOf('id="db-cf"') >= 0);
  assert.ok(dash.actHtml(it, { act: 'open' }).indexOf('id="db-open"') >= 0);
  const none = dash.actHtml(it, { act: 'none', role: '영업부장' });
  assert.ok(none.indexOf('제안 확정은 영업팀·영업팀장이 합니다.') >= 0 && none.indexOf('id="db-cf"') < 0);
  const cf = dash.actHtml(it, { act: 'confirm', confirm: true });
  assert.ok(cf.indexOf('부산광역시를 제안 대상으로 확정합니다.') >= 0);
  assert.ok(cf.indexOf('id="db-do"') >= 0 && cf.indexOf('id="db-cancel"') >= 0);
});

test('josaEul: 받침 유무', function () {
  assert.strictEqual(dash.josaEul('부산광역시'), '를');
  assert.strictEqual(dash.josaEul('노원구청'), '을');
  assert.strictEqual(dash.josaEul('서울특별시'), '를');
  assert.strictEqual(dash.josaEul(''), '를');
});

// ── 상세·이스케이프 ────────────────────────────────────────────────
test('paneHtml: 금고 순번(slot)은 있을 때만 표시, 값이 없으면 미확인 칩', function () {
  const it = dash.model([rec('부산광역시', '26', 40, { lastBid: '2024-09-24', term: 4 })], TODAY).upcoming[0];
  const withSlot = dash.paneHtml(it, { act: 'none', kb: { key: '26|부산광역시', slot: 2, quote: '현 금고 문장', src_date: '2024-09-24' } });
  assert.ok(withSlot.indexOf('KB국민은행 · 2금고') >= 0 && withSlot.indexOf('현 금고 문장') >= 0);
  const noSlot = dash.paneHtml(it, { act: 'none', kb: { key: '26|부산광역시', slot: null, quote: 'q', src_date: '2022-10-23' } });
  assert.ok(noSlot.indexOf('KB국민은행</dd>') >= 0 && noSlot.indexOf('금고 ·') < 0);
  const plain = dash.paneHtml(it, { act: 'none', kb: null });
  assert.ok(plain.indexOf('pop-unk') >= 0 && plain.indexOf('약정 기록을 모으면') >= 0);
  assert.ok(plain.indexOf('기관장 프로필은 수집 예정입니다.') >= 0);
  const bare = dash.paneHtml(dash.model([{ name: '빈구청', region: '11', type: '지자체', contractEnd: plus(9), confirmed: true }], TODAY).upcoming[0], { act: 'none' });
  assert.ok(bare.indexOf('pop-unk') >= 0);                                     // 최근 절차일·약정 주기 없음 → 칩(빈칸·'-' 금지)
});

test('이스케이프: 기관명·출처·검증 문장의 <script>가 그대로 나가지 않는다', function () {
  const evil = '<script>alert(1)</script>';
  const m = dash.model([rec(evil, '11', 20, { sources: [evil, 'https://example.invalid/a"onmouseover="x'] }), rec(evil + '2', '11', -3)], TODAY);
  const html = [
    dash.rowHtml(m.upcoming[0], { id: evil, selected: true, prepActive: true }),
    dash.rowHtml(m.overdue[0], { id: 'p' }),
    dash.paneHtml(m.upcoming[0], { act: 'confirm', confirm: true, kb: { slot: '<b>', quote: evil, src_date: evil } }),
    dash.paneHtml(m.overdue[0], { act: 'open' }),
    dash.stripHtml(m, { confirmed: 0, unconfirmed: 1, total: 1 }, { state: 'denied', code: evil }, evil),
  ].join('');
  assert.strictEqual(html.indexOf('<script>'), -1);
  assert.strictEqual(html.indexOf('<b>"'), -1);
  assert.ok(html.indexOf('&lt;script&gt;') >= 0);
  assert.ok(!/href="[^"]*"onmouseover/.test(html));
});

test('경과 행: D+ 도장과 확인 안내, 선택·진행 배지는 1년 안 행만', function () {
  const m = dash.model([rec('경과시청', '11', -7)], TODAY);
  const h = dash.rowHtml(m.overdue[0], { id: 'db-p-0', selected: false, prepActive: true });
  assert.ok(h.indexOf('ov-stamp">D+7') >= 0 && h.indexOf('공고가 났는지 확인이 필요합니다') >= 0);
  assert.ok(h.indexOf('role="option"') >= 0 && h.indexOf('data-key="11|경과시청"') >= 0);
  assert.strictEqual(h.indexOf('사전준비 중'), -1);
});

// ── 스타일 규칙 ────────────────────────────────────────────────────
test('CSS 블록: 11px 미만 글자·새 hex 없음, 시작/끝 주석', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = html.indexOf('/* 입찰 현황판 시작'), b = html.indexOf('/* 입찰 현황판 끝 */');
  assert.ok(a > 0 && b > a);
  const css = html.slice(a, b);
  (css.match(/font(?:-size)?:\s*[^;]*?(\d+(?:\.\d+)?)px/g) || []).forEach(function (m) {
    const n = Number(/(\d+(?:\.\d+)?)px/.exec(m)[1]);
    if (/font-size|font:/.test(m)) assert.ok(n >= 11, '11px 미만: ' + m);
  });
  assert.deepStrictEqual(css.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-fA-F]{3,8}\b/g), null);
  assert.ok(html.indexOf('<script src="js/dashboard.js"></script>') > html.indexOf('<script src="data/kb-verified.js"></script>'));
  assert.ok(html.indexOf('<script src="js/dashboard.js"></script>') < html.indexOf('<script src="js/app.js"></script>'));
});
