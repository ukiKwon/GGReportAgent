// 지도 상세 팝업(사용자 11-13): 현황판 상세 재사용 — 항목 동등성·옵션 칸·열림/닫힘/포커스 복귀·지도 배선 소스 단언.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const logic = require('../js/logic.js');
const dash = require('../js/dashboard.js');
const read = function (rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };

const TODAY = new Date('2026-11-13T00:00:00');
function plus(days) { return logic.localDateStr(new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + days)); }
function rec(name, region, days, extra) {
  return Object.assign({ name: name, region: region, type: '지자체', contractEnd: days === null ? null : plus(days), confirmed: true }, extra || {});
}

test('itemForRec: 현황판 목록(model)의 같은 기관 항목과 같다 — 1년 안·경과', function () {
  const list = [rec('가람시청', '11', 40, { confirmed: false }), rec('나래군청', '26', -150)];
  const m = dash.model(list, TODAY);
  assert.deepStrictEqual(dash.itemForRec(list[0], TODAY), m.upcoming[0]);
  assert.deepStrictEqual(dash.itemForRec(list[1], TODAY), m.overdue[0]);
});

test('itemForRec: 날짜 미상 기관은 unknown 항목 — 상세는 \'날짜 미상\'·미확인 칩, D-null·NaN 없음', function () {
  const r = rec('미상구청', '11', null);
  const it = dash.itemForRec(r, TODAY);
  assert.strictEqual(it.unknown, true);
  const h = dash.paneHtml(it, { act: 'none', today: TODAY });
  assert.ok(h.indexOf('날짜 미상') > 0 && h.indexOf('<dt>입찰 예정일</dt><dd><span class="pop-unk">미확인</span></dd>') > 0);
  assert.ok(h.indexOf('D-null') < 0 && h.indexOf('NaN') < 0 && h.indexOf('undefined') < 0);
});

test('paneHtml 옵션: 기본은 현황판 그대로(id=db-name), nameId·tailHtml·mapHtml은 모달용', function () {
  const it = dash.itemForRec(rec('가람시청', '11', 40), TODAY);
  const base = dash.paneHtml(it, { act: 'none' });
  assert.ok(base.indexOf('id="db-name"') > 0 && base.indexOf('id="db-map"') > 0);
  const dm = dash.paneHtml(it, { act: 'none', nameId: 'dm-name', tailHtml: '<p id="tail">T</p>', mapHtml: '<button id="dm-close">닫기</button>' });
  assert.ok(dm.indexOf('id="dm-name"') > 0 && dm.indexOf('id="db-name"') < 0);
  assert.ok(dm.indexOf('id="db-map"') < 0 && dm.indexOf('id="dm-close"') > 0);
  assert.ok(dm.indexOf('<p id="tail">T</p></div><div class="db-act">') > 0);
  assert.ok(dash.actHtml(it, { act: 'wait' }).indexOf('확인하는 중입니다') > 0);
  assert.ok(dash.actHtml(it, { act: 'unavailable', mapHtml: 'X' }).indexOf('서버에 연결되면 [제안 확정]을 쓸 수 있습니다.') >= 0);
});

test('핵심 절 동등성: 모달 상세 = 현황판 상세(제목 id만 다름)', function () {
  const it = dash.itemForRec(rec('가람시청', '11', 40, { lastBid: '2024-09-24', term: 4 }), TODAY);
  const a = dash.paneHtml(it, { act: 'confirm', today: TODAY });
  const b = dash.paneHtml(it, { act: 'confirm', today: TODAY, nameId: 'dm-name' });
  assert.strictEqual(b.replace('id="dm-name"', 'id="db-name"'), a);
});

test('confirmFail: 상태별 문구(권한 401/403·그 밖) — 현황판과 지도 팝업 공용, [object Object] 없음', function () {
  assert.ok(dash.confirmFail({ r: { status: 403 }, body: null }).msg.indexOf('제안 확정 권한이 없습니다(403)') >= 0);
  const f = dash.confirmFail({ r: { status: 500 }, body: null });
  assert.strictEqual(f.again, false);
  assert.ok(f.msg.indexOf('제안 확정하지 못했습니다(500)') >= 0 && f.msg.indexOf('[object') < 0);
});

// ── 가짜 DOM: 열림·닫힘·포커스 복귀 ────────────────────────────────
function fakeEl() {
  const e = { listeners: {}, attrs: {}, stubs: {}, parentNode: null, className: '', id: '', innerHTML: '', textContent: '', hidden: false, scrollTop: 0,
    addEventListener: function (t, f) { (e.listeners[t] = e.listeners[t] || []).push(f); },
    querySelector: function (s) { return e.stubs[s] || (e.stubs[s] = fakeEl()); },
    querySelectorAll: function () { return []; },
    contains: function (x) { return x === e || Object.keys(e.stubs).some(function (k) { return e.stubs[k] === x; }); },
    setAttribute: function (k, v) { e.attrs[k] = String(v); }, getAttribute: function (k) { return k in e.attrs ? e.attrs[k] : null; },
    hasAttribute: function (k) { return k in e.attrs; }, closest: function () { return null; },
    focus: function () { global.document.activeElement = e; },
    fire: function (t, ev) { (e.listeners[t] || []).forEach(function (f) { f(Object.assign({ preventDefault: function () {}, stopPropagation: function () {} }, ev)); }); } };
  return e;
}
function withDocument(fn) {
  const prev = global.document;
  const body = { items: [], appendChild: function (x) { this.items.push(x); x.parentNode = this; }, removeChild: function (x) { this.items = this.items.filter(function (i) { return i !== x; }); x.parentNode = null; },
    contains: function (x) { return !!(x && x.__inBody); } };
  global.document = { body: body, activeElement: null, createElement: function () { return fakeEl(); }, querySelector: function () { return null; }, getElementById: function () { return null; } };
  try { fn(body); } finally { dash.closeDetail(false); global.document = prev; }
}

test('openDetail: 오버레이를 body에 붙이고(dm-ov·dm-box role=dialog) 기관명으로 상세를 그린다', function () {
  withDocument(function (body) {
    const opener = fakeEl(); opener.__inBody = true;
    assert.strictEqual(dash.openDetail(rec('가람시청', '11', 40), { opener: opener }), true);
    assert.strictEqual(body.items.length, 1);
    const ov = body.items[0];
    assert.ok(ov.className.indexOf('modal-overlay') >= 0 && ov.className.indexOf('dm-ov') >= 0);
    assert.ok(ov.innerHTML.indexOf('role="dialog" aria-modal="true" aria-labelledby="dm-name"') > 0);
    assert.ok(ov.querySelector('#dm-pane').innerHTML.indexOf('가람시청') > 0);
    assert.strictEqual(dash.isDetailOpen(), true);
  });
});

test('closeDetail: Esc·닫기·배경 클릭으로 닫히고 누른 카드로 포커스가 돌아간다, 상자 안에서 시작한 클릭은 닫지 않는다', function () {
  withDocument(function (body) {
    const opener = fakeEl(); opener.__inBody = true;
    dash.openDetail(rec('가람시청', '11', 40), { opener: opener });
    let ov = body.items[0];
    ov.fire('keydown', { key: 'Escape' });
    assert.strictEqual(dash.isDetailOpen(), false);
    assert.strictEqual(body.items.length, 0);
    assert.strictEqual(global.document.activeElement, opener);
    dash.openDetail(rec('가람시청', '11', 40), { opener: opener }); ov = body.items[0];
    ov.fire('mousedown', { target: fakeEl() }); ov.fire('click', { target: ov });
    assert.strictEqual(dash.isDetailOpen(), true);
    ov.fire('mousedown', { target: ov }); ov.fire('click', { target: ov });
    assert.strictEqual(dash.isDetailOpen(), false);
    dash.openDetail(rec('가람시청', '11', 40), { opener: opener }); ov = body.items[0];
    const btn = fakeEl(); btn.id = 'dm-close';
    const inner = fakeEl(); inner.closest = function (s) { return s === 'button' ? btn : null; };
    ov.fire('click', { target: inner });
    assert.strictEqual(dash.isDetailOpen(), false);
    assert.strictEqual(global.document.activeElement, opener);
  });
});

test('Tab 가두기: 포커스할 곳이 없으면 상자(#dm-box)에 머문다', function () {
  withDocument(function (body) {
    dash.openDetail(rec('가람시청', '11', 40), {});
    let prevented = false;
    body.items[0].fire('keydown', { key: 'Tab', shiftKey: false, preventDefault: function () { prevented = true; } });
    assert.strictEqual(prevented, true);
  });
});

// ── 배선(소스 단언) ────────────────────────────────────────────────
test('render.js: 카드 클릭·키보드·마커가 모두 render.openRecord → dashboard.openDetail, 팝오버는 되돌림용으로 남는다', function () {
  const r = read('js/render.js');
  assert.ok(/render\.openRecord\(r, card, ev\.clientX, ev\.clientY\)/.test(r));
  assert.ok(/render\.openRecord\(r, card, rc\.left - 292, rc\.top, \{ keyboard: true \}\)/.test(r));
  assert.ok(/render\.onMarkerClick = function \(rec\) \{\s*render\.openRecord\(rec, document\.activeElement/.test(r));
  assert.ok(/d\.openDetail\(rec, \{ opener: opener \}\)/.test(r) && /render\.showPopover\(rec, x, y, opts\)/.test(r));
  assert.ok(r.indexOf('.rank-card, .marker, .dm-ov, .hc-ov') > 0);
  const render = require('../js/render.js');
  const x = { name: '노원구청', type: '지자체', region: '11', term: 4, lastBid: '2023-03-02', contractEnd: '2027-03-02', sources: ['https://example.test/a'] };
  assert.ok(render.popoverHtml(x, TODAY).indexOf('<details class="pop-raw"><summary>원본 정보</summary>' + render.popRawHtml(x) + '</details>') > 0);
  assert.strictEqual(render.popRawHtml({ name: '<script>x</script>', sources: ['<script>y</script>'] }).indexOf('<script>'), -1);
});

test('headcard 화면 이름: ensure 4번째 인자 → 조회 요청의 X-Screen-Id, 지도 팝업은 map_popover(서버 허용 목록에 있음)', function () {
  const h = read('js/headcard.js');
  assert.ok(/hc\.ensure = function \(instId, repaint, emp, screen\)/.test(h));
  assert.ok(h.indexOf('hc.ensure(rec.institutionId, env.repaint, env.emp, env.screen)') > 0);
  assert.ok(h.indexOf('undefined, mine.screen || undefined)') > 0);
  const d = read('js/dashboard.js');
  assert.ok(d.indexOf("screen: 'map_popover'") > 0);
  const java = fs.readFileSync(path.join(ROOT, '..', 'kgi-ggreport-web', 'src', 'main', 'java', 'com', 'kbstar', 'kgi', 'ggreport', 'web', 'support', 'HeadUiIds.java'), 'utf8');
  assert.ok(java.indexOf('"map_popover"') > 0 && java.indexOf('"open_card"') > 0);
});

test('app.js·dashboard.js: 계정이 바뀌면 지도 상세 팝업을 닫고, 닫을 때 headcard.reset', function () {
  const a = read('js/app.js');
  assert.ok(a.indexOf('root.dashboard.closeDetail(false)') > a.indexOf('app.onProfileChanged = function'));
  const d = read('js/dashboard.js');
  assert.ok(/dash\.closeDetail = function[\s\S]*?root\.headcard\.reset\(\)/.test(d));
});

test('CSS 블록(지도 상세 팝업): 새 hex 없음·움직임 없음, 상세 칸 제목 밑줄 되돌림, 카드가 좁아지지 않게 720px', function () {
  const html = read('index.html');
  const a = html.indexOf('/* 지도 상세 팝업 시작'), b = html.indexOf('/* 지도 상세 팝업 끝 */');
  assert.ok(a > 0 && b > a);
  const css = html.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepStrictEqual(css.match(/#[0-9a-fA-F]{3,8}\b/g), null);
  assert.ok(!/animation|transition/.test(css));
  assert.ok(/\.dm-box \.db-head h2, \.dm-box \.db-sec h3 \{[^}]*border-bottom:0/.test(css));
  assert.ok(/\.modal-box\.dm-box \{[^}]*width:min\(720px/.test(css));
});

test('[제안 확정] 맥락: 현황판·지도 팝업 모두 account·master를 넘긴다(prep.popoverEligible이 본다, 11-13 수정)', function () {
  const d = read('js/dashboard.js');
  assert.ok(/function actCtx\(\)[\s\S]*?account: acc,[\s\S]*?master:/.test(d));
  assert.strictEqual((d.match(/const ctx = actCtx\(\);/g) || []).length, 2);
  const prep = require('../js/prep.js');
  const r = { name: '가람시청', institutionId: '11010' };
  assert.strictEqual(prep.popoverAction(r, { serverMode: true, role: '영업팀장' }, []).kind, 'none');               // account 없으면 숨는다(옛 동작)
  assert.strictEqual(prep.popoverAction(r, { serverMode: true, account: true, role: '영업팀장' }, []).kind, 'confirm');
});
