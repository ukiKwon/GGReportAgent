const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const logic = require('../js/logic.js');
const store = require('../js/store.js');
const render = require('../js/render.js');

function fakeFetch(plan) {
  const calls = [];
  const f = (url, init) => {
    init = init || {}; calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    const key = (init.method || 'GET') + ' ' + url.split('?')[0].replace(/\/institutions\/[^/]+/, '/institutions/:id');
    const p = plan[key] || { status: 200, body: {} };
    return Promise.resolve({ status: p.status, json: () => Promise.resolve(p.body) });
  };
  f.calls = calls; return f;
}
function serverOn() { store.setServerData([]); render.watch = { st: 'idle', mine: new Set() }; render._watchBusy = {}; }
function serverOff() { store.clearServerData(); render.env.fetch = null; }

test('watchIndex: my-watch → Set, null이면 빈 값. 관심 n명 함수는 없다', () => {
  const x = logic.watchIndex({ items: [{ institution_id: 7 }] });
  assert.ok(x.mine.has('7') && !x.mine.has('9'));
  assert.strictEqual(logic.watchIndex(null).mine.size, 0);
  assert.strictEqual(logic.watchCount, undefined); assert.strictEqual(render.watchBadgeHtml, undefined);
});

test('watchOutcome: 200·201 ok, 403·409·404·그 밖은 문구', () => {
  assert.strictEqual(logic.watchOutcome(201, null, 'put').ok, true);
  assert.strictEqual(logic.watchOutcome(200, null, 'delete').ok, true);
  assert.match(logic.watchOutcome(403, null, 'put').message, /권한이 없어 관심에 담을 수/);
  assert.match(logic.watchOutcome(409, null, 'delete').message, /결재 중.*관심에서 뺄 수/);
  assert.match(logic.watchOutcome(409, null, 'put').message, /결재 중.*관심에 담을 수/);
  assert.match(logic.watchOutcome(404, null, 'put').message, /찾을 수 없습니다/);
  assert.match(logic.watchOutcome(0, null, 'put').message, /저장하지 못했습니다/);
  assert.match(logic.watchOutcome(500, null, 'put').message, /저장하지 못했습니다/);
});

test('서버 모드: syncWatch는 my-watch만 받아(/watchers 호출 없음) ♥ 기준을 institutionId로 바꾼다', async () => {
  serverOn();
  const sf = fakeFetch({ 'GET /my-watch': { status: 200, body: { items: [{ institution_id: 5 }] } } });
  render.env.fetch = sf;
  try {
    assert.strictEqual(await render.syncWatch(null), true);
    assert.ok(sf.calls.length === 1 && sf.calls[0].url === '/my-watch' && !sf.calls.some(c => /watchers/.test(c.url)));
    assert.strictEqual(render.hearted({ name: 'A', institutionId: 5 }), true);
    assert.strictEqual(render.hearted({ name: 'A', institutionId: 6 }), false);
    store.toggleInterest('A');   // 로컬 ♥는 서버 모드에서 보이지 않는다
    assert.strictEqual(render.hearted({ name: 'A', institutionId: 6 }), false);
    store.toggleInterest('A');
  } finally { serverOff(); }
});

test('서버 모드: ♥ 켬 = PUT + 머리글, 끔 = DELETE, 성공하면 다시 받는다(낙관적 갱신 없음)', async () => {
  serverOn();
  const f = fakeFetch({ 'PUT /institutions/:id/my-watch': { status: 201, body: {} }, 'DELETE /institutions/:id/my-watch': { status: 200, body: {} },
    'GET /my-watch': { status: 200, body: { items: [] } } });
  render.env.fetch = f;
  try {
    const o = await render.toggleWatch({ name: 'A', institutionId: 5 }, '41');
    assert.strictEqual(o.ok, true);
    const put = f.calls[0];
    assert.strictEqual(put.method, 'PUT'); assert.strictEqual(put.url, '/institutions/5/my-watch');
    assert.strictEqual(put.headers['X-Screen-Id'], 'map_popover'); assert.strictEqual(put.headers['X-Button-Id'], 'toggle_watch_heart');
    assert.ok(f.calls.slice(1).some(c => c.url === '/my-watch'));   // 성공 뒤 서버 값을 다시 받는다
    render.watch.mine = new Set(['5']);
    f.calls.length = 0;
    await render.toggleWatch({ name: 'A', institutionId: 5 }, '41');
    assert.strictEqual(f.calls[0].method, 'DELETE'); assert.strictEqual(f.calls[0].headers['X-Button-Id'], 'toggle_watch_heart');
  } finally { serverOff(); }
});

test('서버 모드: 실패(403·409·네트워크)는 문구를 돌려주고 ♥ 상태는 그대로, institutionId 없으면 요청 안 함', async () => {
  serverOn();
  const f = fakeFetch({ 'PUT /institutions/:id/my-watch': { status: 403, body: {} }, 'DELETE /institutions/:id/my-watch': { status: 409, body: {} } });
  render.env.fetch = f;
  try {
    let o = await render.toggleWatch({ name: 'A', institutionId: 5 }, '41');
    assert.strictEqual(o.ok, false); assert.match(o.message, /권한/); assert.strictEqual(render.watch.mine.size, 0);
    assert.strictEqual(f.calls.length, 1);   // 실패 뒤 다시 받기(GET)를 하지 않는다
    render.watch.mine = new Set(['5']);
    o = await render.toggleWatch({ name: 'A', institutionId: 5 }, '41');
    assert.match(o.message, /결재 중/); assert.ok(render.watch.mine.has('5'));
    render.env.fetch = () => Promise.reject(new Error('net'));
    o = await render.toggleWatch({ name: 'A', institutionId: 5 }, '41');
    assert.match(o.message, /저장하지 못했습니다/);
    f.calls.length = 0; render.env.fetch = f;
    o = await render.toggleWatch({ name: 'X' }, '41');
    assert.strictEqual(o.ok, false); assert.strictEqual(f.calls.length, 0);
  } finally { serverOff(); }
});

test('로컬 모드: 서버를 부르지 않고 localStorage ♥ 그대로', () => {
  assert.strictEqual(render.watchOn(), false);
  assert.strictEqual(render.hearted({ name: '병원A' }), store.isInterested('병원A'));
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'render.js'), 'utf8');
  assert.ok(/if \(!render\.watchOn\(\)\) \{ store\.toggleInterest\(r\.name\); render\.drawRankingPanel\(code\); return; \}/.test(src));
});

test('관심 n명 표시 없음: render.js·index.html에 rk-wn·/watchers·관심 n명이 없다', () => {
  const dir = path.join(__dirname, '..');
  const js = fs.readFileSync(path.join(dir, 'js', 'render.js'), 'utf8');
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.ok(!/rk-wn/.test(js) && !/rk-wn/.test(html));
  assert.ok(!/\/watchers/.test(js));
  assert.ok(!/관심 '\s*\+/.test(js));
  assert.ok(/\.rk-note\s*\{/.test(html));   // 실패 알림 CSS는 유지
});
