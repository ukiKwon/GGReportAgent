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

test('popupHtml(11-19 저녁 4-4): 머리 줄 [주버튼] ┃ [×] 순서, 본문엔 .db-act 없음, 확인 상자는 note·그동안 [제안 확정] 비활성, 현황판 paneHtml은 그대로', function () {
  const it = dash.itemForRec(rec('가람시청', '11', 40), TODAY);
  const o = { act: 'confirm', role: '영업팀', today: TODAY, nameId: 'dm-name' };
  const a = dash.popupHtml(it, o);
  assert.ok(a.bar.indexOf('<div class="dm-bar">') === 0 && a.bar.indexOf('id="dm-name"') > 0);
  assert.ok(a.bar.indexOf('id="dm-edit"') < 0 && a.bar.indexOf('id="db-cf"') < a.bar.indexOf('class="dm-sep"') && a.bar.indexOf('class="dm-sep"') < a.bar.indexOf('id="dm-close"'));   // 주 동작 → 구분선 → ×(편집은 기관 정보 절로 옮김, 11-19)
  assert.ok(/id="dm-close" class="dm-cls" aria-label="닫기" title="닫기 \(Esc\)">닫기<\/button>/.test(a.bar) && a.bar.indexOf('id="db-cf" disabled') < 0);
  assert.ok(a.body.indexOf('db-act') < 0 && a.body.indexOf('id="dm-name"') < 0 && a.body.indexOf('<p class="db-sub">') > 0 && a.note === '');
  const c = dash.popupHtml(it, Object.assign({}, o, { confirm: true }));
  assert.ok(c.bar.indexOf('id="db-cf" disabled') > 0 && c.note.indexOf('id="dm-confirm"') > 0 && c.note.indexOf('id="db-do"') > 0 && c.note.indexOf('id="db-cancel"') > 0);
  assert.ok(c.note.indexOf('id="db-cf"') < 0);   // 확인 상자 안에는 [제안 확정]이 없다(머리 줄에만)
  const early = dash.popupHtml(it, Object.assign({}, o, { confirm: true, early: true }));
  assert.ok(early.note.indexOf('db-confirm dm-confirm early') > 0 && early.note.indexOf('계속 진행') > 0);
  const op = dash.popupHtml(it, { act: 'open', today: TODAY });
  assert.ok(op.bar.indexOf('id="db-open"') < op.bar.indexOf('id="dm-close"') && op.note.indexOf('이미 제안 확정되어 사전준비가 진행 중입니다.') > 0);
  const ro = dash.popupHtml(it, { act: 'none', role: '디자이너', readOnly: true, today: TODAY });
  assert.ok(ro.bar.indexOf('dm-edit') < 0 && ro.bar.indexOf('db-next') < 0 && ro.bar.indexOf('id="dm-close"') > 0);
  assert.ok(dash.paneHtml(it, { act: 'confirm', today: TODAY }).indexOf('<div class="db-act"><div class="db-act-row"><button type="button" class="db-next" id="db-cf">제안 확정</button>') > 0);   // 현황판 안쪽 칸은 그대로
  const s = read('js/dashboard.js');
  assert.ok(/bar\.innerHTML = parts\.bar; nt\.innerHTML = parts\.note; pane\.innerHTML = parts\.body;/.test(s) && s.indexOf("m.el.querySelector('#db-do')") > 0);
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
    assert.ok(ov.querySelector('#dm-bar').innerHTML.indexOf('가람시청') > 0 && ov.querySelector('#dm-pane').innerHTML.indexOf('db-pane-body') > 0);   // 제목은 머리 줄(11-19 저녁 4-4), 본문만 #dm-pane
    assert.ok(ov.innerHTML.indexOf('id="dm-bar"') < ov.innerHTML.indexOf('id="dm-flash"') && ov.innerHTML.indexOf('id="dm-flash"') < ov.innerHTML.indexOf('id="dm-pane"'));   // 알림 줄은 머리 줄 아래
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
test('render.js: 카드 클릭·키보드·마커가 모두 render.openRecord → dashboard.openDetail(요약 카드 없음, NEXT 78)', function () {
  const r = read('js/render.js');
  assert.ok(/render\.openRecord\(r, card, ev\.clientX, ev\.clientY\)/.test(r));
  assert.ok(/render\.openRecord\(r, card, rc\.left - 292, rc\.top, \{ keyboard: true \}\)/.test(r));
  assert.ok(/render\.onMarkerClick = function \(rec\) \{\s*render\.openRecord\(rec, document\.activeElement/.test(r));
  assert.ok(/d\.openDetail\(rec, \{ opener: opener \}\)/.test(r) && r.indexOf('showPopover') < 0 && r.indexOf("getElementById('popover')") < 0);
  assert.ok(r.indexOf('.rank-card, .marker, .dm-ov, .hc-ov') > 0);
  const render = require('../js/render.js');
  assert.strictEqual(render.popRawHtml({ name: '<script>x</script>', sources: ['<script>y</script>'] }).indexOf('<script>'), -1);
});

test('headcard 화면 이름: ensure 4번째 인자 → 조회 요청의 X-Screen-Id, 지도 팝업은 map_popover(서버 허용 목록에 있음)', function () {
  const h = read('js/headcard.js');
  assert.ok(/hc\.ensure = function \(instId, repaint, emp, screen\)/.test(h));
  assert.ok(h.indexOf('hc.ensure(rec.institutionId, env.repaint, env.emp, env.screen)') > 0);
  assert.ok(h.indexOf('undefined, mine.screen || undefined)') > 0);
  const d = read('js/dashboard.js');
  assert.ok(d.indexOf("(opts && opts.screen) || 'map_popover'") > 0 && d.indexOf('screen: m.screen') > 0);   // 기본 map_popover, 현황판은 bid_board를 넘긴다(11-16)
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

// ── 감사 머리글(11-15 planner): 현황판 bid_board/confirm, 지도 상세 팝업 map_popover/confirm ──

test('postConfirm(대비 경로): 화면·버튼 머리글을 싣는다 — 현황판 bid_board, 지도 팝업 map_popover', async function () {
  const prev = global.fetch, calls = [];
  global.fetch = function (url, init) { calls.push({ url: url, init: init }); return Promise.resolve({ ok: true, status: 201, json: function () { return Promise.resolve({ bid_case_id: 'B1' }); } }); };
  try {
    const x = await dash.postConfirm('I1', 'bid_board');
    await dash.postConfirm('I2', 'map_popover');
    assert.strictEqual(calls[0].url, '/preps');
    assert.strictEqual(calls[0].init.method, 'POST');
    assert.strictEqual(calls[0].init.headers['X-Screen-Id'], 'bid_board');
    assert.strictEqual(calls[0].init.headers['X-Button-Id'], 'confirm');
    assert.strictEqual(JSON.parse(calls[0].init.body).institution_id, 'I1');
    assert.strictEqual(calls[1].init.headers['X-Screen-Id'], 'map_popover');
    assert.strictEqual(x.r.ok, true);
  } finally { global.fetch = prev; }
});

test('dashboard.js: 두 [확정]은 직접 fetch하지 않고 postConfirm으로 화면 id를 넘긴다', function () {
  const src = read('js/dashboard.js');
  assert.ok(src.indexOf("dash.postConfirm(id, 'bid_notice')") >= 0);   // 입찰 공고 현황의 감사 화면 이름(11-16, 서버 허용 목록에 반영됨)
  assert.ok(src.indexOf("dash.postConfirm(id, m.screen)") >= 0);
  const rest = src.replace(/dash\.postConfirm = function[\s\S]*?\r?\n  };\r?\n/, '');
  assert.ok(rest.length < src.length, 'postConfirm 본문을 걸러냈다');
  assert.strictEqual((rest.match(/fetch\('\/preps', \{ method: 'POST'/g) || []).length, 0);
});

// 브라우저에서 실제로 타는 경로(prep.js가 있을 때) — 가짜 prep을 self에 두고 dashboard.js를 새로 불러 어댑터 분기를 본다(qa 11-15 P2).
function loadFresh(rel, selfObj) {
  const file = require.resolve(rel);
  const saved = require.cache[file];
  const hadSelf = Object.prototype.hasOwnProperty.call(global, 'self');
  const prevSelf = global.self;
  delete require.cache[file];
  global.self = selfObj;
  try { return require(rel); }
  finally {
    if (hadSelf) global.self = prevSelf; else delete global.self;
    if (saved) require.cache[file] = saved; else delete require.cache[file];
  }
}
function loadDashWithPrep(fakePrep) {
  return loadFresh('../js/dashboard.js', { prep: fakePrep, errtext: require('../js/errtext.js') });
}

test('dash.postConfirm(prep 경로): 성공 본문 매핑 — 빈 객체는 null, 그 밖은 그대로', async function () {
  let reply = {};
  const d = loadDashWithPrep({ postConfirm: function (id, screen) { this.last = [id, screen]; return Promise.resolve(reply); } });
  let x = await d.postConfirm('I1', 'bid_board');
  assert.strictEqual(x.r.ok, true);
  assert.strictEqual(x.body, null);
  reply = { bid_case_id: 'B1' };
  x = await d.postConfirm('I1', 'map_popover');
  assert.deepStrictEqual(x.body, { bid_case_id: 'B1' });
});

test('dash.postConfirm(prep 경로): 실패는 {r,body}로 바꿔 confirmFail이 같은 판정을 내린다, 네트워크 오류는 그대로 던진다', async function () {
  let fail;
  const d = loadDashWithPrep({ postConfirm: function () { return Promise.reject(fail); } });
  fail = Object.assign(new Error('http 409'), { status: 409, detail: { code: 'PREP_ALREADY_ACTIVE' } });
  let x = await d.postConfirm('I1', 'bid_board');
  assert.strictEqual(x.r.ok, false);
  assert.strictEqual(d.confirmFail(x).again, true);
  fail = Object.assign(new Error('http 403'), { status: 403 });
  x = await d.postConfirm('I1', 'bid_board');
  assert.ok(d.confirmFail(x).msg.indexOf('권한이 없습니다(403)') >= 0);
  fail = new TypeError('Failed to fetch');
  await assert.rejects(d.postConfirm('I1', 'bid_board'), TypeError);
});

test('prep.postConfirm: 성공·실패 모두 진행 중 캐시를 비워 다음 fetchActives가 다시 받는다', async function () {
  const store = { loadSession: function () { return { emp: '3918264' }; }, loadProfile: function () { return { team: '영업팀' }; } };
  const prep = loadFresh('../js/prep.js', { store: store });
  const prev = global.fetch, urls = [];
  let postOk = true;
  global.fetch = function (url, init) {
    urls.push((init && init.method) + ' ' + url);
    if (init && init.method === 'POST') return Promise.resolve(postOk
      ? { ok: true, status: 201, json: function () { return Promise.resolve({ bid_case_id: 'B1' }); } }
      : { ok: false, status: 409, json: function () { return Promise.resolve({ detail: {} }); } });
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve([]); } });
  };
  try {
    prep.invalidateActives();
    await prep.fetchActives();
    await prep.fetchActives();                                   // 캐시 적중 — GET 1번
    await prep.postConfirm('I1', 'bid_board');
    await prep.fetchActives();                                   // 성공 뒤 다시 GET
    postOk = false;
    await prep.postConfirm('I1', 'bid_board').catch(function () {});
    await prep.fetchActives();                                   // 실패 뒤에도 다시 GET
    assert.strictEqual(urls.filter(function (u) { return u === 'GET /preps'; }).length, 3);
  } finally { global.fetch = prev; }
});

test('prep.postConfirm: 머리글을 싣고, 실패는 status·detail을 단 Error로 던진다', async function () {
  const prep = require('../js/prep.js');
  const prev = global.fetch, calls = [];
  let ok = true;
  global.fetch = function (url, init) { calls.push({ url: url, init: init }); return Promise.resolve(ok
    ? { ok: true, status: 201, json: function () { return Promise.resolve({ bid_case_id: 'B1' }); } }
    : { ok: false, status: 409, json: function () { return Promise.resolve({ detail: { code: 'PREP_ALREADY_ACTIVE' } }); } }); };
  try {
    const j = await prep.postConfirm('I1', 'bid_board');
    assert.strictEqual(j.bid_case_id, 'B1');
    assert.strictEqual(calls[0].init.headers['X-Screen-Id'], 'bid_board');
    assert.strictEqual(calls[0].init.headers['X-Button-Id'], 'confirm');
    ok = false;
    await assert.rejects(prep.postConfirm('I1', 'map_popover'), function (e) { return e.status === 409 && e.detail.code === 'PREP_ALREADY_ACTIVE'; });
    assert.strictEqual(calls[1].init.headers['X-Screen-Id'], 'map_popover');
  } finally { global.fetch = prev; }
});

// ── security 11-15 하: 사번(X-Emp-No)이 화면 머리글과 함께 실제 요청에 실린다 ──
// app.js는 module.exports가 없어 loadFresh 반환값이 아니라 가짜 self의 app을 쓴다. 최상위 외부 의존은 document.addEventListener 한 줄뿐.
test('installIdentityHeader 설치 후 prep.postConfirm 요청: X-Emp-No가 X-Screen-Id·X-Button-Id와 함께 실린다', async function () {
  const sent = [];
  const rawFetch = function (url, init) {
    sent.push({ url: url, init: init });
    return Promise.resolve({ ok: true, status: 201, json: function () { return Promise.resolve({ bid_case_id: 'B1' }); } });
  };
  let session = { mode: 'account', id: 'x', emp: '3918264' };
  const fakeSelf = {
    fetch: rawFetch,
    store: { loadSession: function () { return session; } },
    login: require('../js/login.js')
  };
  const prevDoc = global.document, prevFetch = global.fetch;
  global.document = { addEventListener: function () {} };
  try {
    loadFresh('../js/app.js', fakeSelf);
    assert.strictEqual(typeof fakeSelf.app.installIdentityHeader, 'function');
    fakeSelf.app.installIdentityHeader();
    assert.strictEqual(fakeSelf.fetch.__identity, true, '전역 fetch가 신원 래퍼로 바뀌었다');
    global.fetch = fakeSelf.fetch;            // 브라우저에서는 self === window라 같은 객체 — prep.js는 전역 fetch를 직접 부른다

    const prep = require('../js/prep.js');
    await prep.postConfirm('I1', 'bid_board');
    const h = sent[0].init.headers;
    assert.strictEqual(sent[0].url, '/preps');
    assert.strictEqual(h['X-Emp-No'], '3918264');
    assert.strictEqual(h['X-Screen-Id'], 'bid_board');
    assert.strictEqual(h['X-Button-Id'], 'confirm');

    await prep.postConfirm('I2', 'map_popover');
    assert.strictEqual(sent[1].init.headers['X-Emp-No'], '3918264');
    assert.strictEqual(sent[1].init.headers['X-Screen-Id'], 'map_popover');

    session = null;                            // 로그아웃 상태면 사번을 붙이지 않되 화면 머리글은 그대로
    await prep.postConfirm('I3', 'bid_board');
    assert.strictEqual(sent[2].init.headers['X-Emp-No'], undefined);
    assert.strictEqual(sent[2].init.headers['X-Screen-Id'], 'bid_board');
  } finally {
    if (prevDoc === undefined) delete global.document; else global.document = prevDoc;
    global.fetch = prevFetch;
  }
});

// ── 사용자 11-16: 순위 카드 한 번=지도 반짝, 두 번=상세 팝업, 비지자체는 소재 구 면 반짝 ──
test('render.js: 카드 click은 지도 표시만(상세 안 열림), dblclick이 상세, focus도 지도 표시, ♥ 더블클릭은 막는다', function () {
  const r = read('js/render.js');
  assert.ok(r.indexOf("card.addEventListener('click', function () { render.showOnMap(r); });") > 0);
  const dbl = r.slice(r.indexOf("card.addEventListener('dblclick'"));
  assert.ok(dbl.length > 0 && /^[^\n]*render\.openRecord\(r, card/.test(dbl));
  assert.ok(r.indexOf("card.addEventListener('focus', function () { render.showOnMap(r); });") > 0);
  assert.ok(/\.heart'\)\.addEventListener\('dblclick', function \(e\) \{ e\.stopPropagation\(\); \}\)/.test(r));
  assert.ok(/else if \(!render\._blinkSubRegion\(rec\)\) render\._noteNoLocation\(rec\);/.test(r));
});

test('render.faceCodesForSubRegion: subRegion 면만, 없거나 지도에 없으면 []', function () {
  const render = require('../js/render.js');
  const fc = { features: [{ properties: { code: '11010' } }, { properties: { code: '11220' } }] };
  assert.deepStrictEqual(render.faceCodesForSubRegion({ subRegion: '11220' }, fc), ['11220']);
  assert.deepStrictEqual(render.faceCodesForSubRegion({}, fc), []);
  assert.deepStrictEqual(render.faceCodesForSubRegion({ subRegion: '99999' }, fc), []);
  assert.deepStrictEqual(render.faceCodesForSubRegion({ subRegion: '11220' }, null), []);
});


test('render.js: 전국 지도 시도 면 반짝(덮개 층 링), 시도 지도 위치 미확인 안내, 해제·중복 판정에 path.region 포함(사용자 11-16, 11-19 덮개 층)', function () {
  const r = read('js/render.js'), h = read('index.html');
  assert.ok(/else if \(!render\.state\.currentRegion\) render\._blinkRegionFace\(rec\);/.test(r));
  assert.ok(r.indexOf("selectAll('path.subregion.selected, path.region.selected')") > 0);
  assert.ok(r.indexOf("'지도 위치(소재 시·군·구) 미확인'") > 0);
  assert.ok(/\.ring-sel\.over \{[^}]*animation:muni-blink/.test(h));   // 선택 깜빡임은 덮개 층 경로에서
  assert.ok(/\.rank-noloc \{[^}]*font-size:12px[^}]*var\(--muted\)/.test(h));
});
