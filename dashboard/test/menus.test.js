const test = require('node:test');
const assert = require('node:assert');
const app = require('../js/menu_rules.js');

// 서버가 준 역할별 메뉴(GET /menus?role=)를 실제 탭 노출로 바꾸는 규칙.
// DOM 없이 규칙만 고정한다 — 이 규칙이 틀리면 사람이 볼 것을 못 보거나 반대가 된다.

const MENUS = { map: true, regions: true, workflow: false, chat: true,
                knowledge: true, tasks: true, approvals: false, admin: false };

test('visibleTabs: 서버가 켠 것만 보인다', function () {
  const v = app.visibleTabs(MENUS, true);
  assert.strictEqual(v.tasks, true);
  assert.strictEqual(v.workflow, false);
  assert.strictEqual(v.approvals, false);
});

test('visibleTabs: file://에서는 서버 전용 메뉴가 전부 꺼진다', function () {
  // API가 없으므로 켜져 있어도 열 수 없다 — 기존 applyServerModeUI 규칙을 잇는다.
  const v = app.visibleTabs(MENUS, false);
  assert.strictEqual(v.map, true);
  assert.strictEqual(v.regions, true);
  assert.strictEqual(v.chat, false);
  assert.strictEqual(v.knowledge, false);
  assert.strictEqual(v.tasks, false);
});

test('visibleTabs: 서버 응답이 없으면 지도만 남긴다', function () {
  // 권한을 모를 때 열어주는 쪽으로 기울면, 조회에 실패한 순간 전원이 관리 화면을 본다.
  const v = app.visibleTabs(null, true);
  assert.strictEqual(v.map, true);
  assert.strictEqual(v.admin, false);
  assert.strictEqual(v.approvals, false);
});

test('visibleTabs: 모르는 키는 지어내지 않는다', function () {
  const v = app.visibleTabs({ map: true, 낯선메뉴: true }, true);
  assert.strictEqual(v.낯선메뉴, undefined);
});

test('MENU_KEYS: 백엔드 정의와 같은 순서·같은 목록', function () {
  assert.deepStrictEqual(app.MENU_KEYS,
    ['map', 'regions', 'workflow', 'chat', 'knowledge', 'tasks', 'approvals', 'admin']);
});

test('tabButtonId: 탭 버튼 id 규칙', function () {
  assert.strictEqual(app.tabButtonId('tasks'), 'tab-btn-tasks');
});

test('activeFallback: 보이지 않는 탭이 열려 있으면 지도로 돌린다', function () {
  assert.strictEqual(app.activeFallback('approvals', { approvals: false, map: true }), 'map');
  assert.strictEqual(app.activeFallback('tasks', { tasks: true, map: true }), null);
  assert.strictEqual(app.activeFallback(null, { map: true }), null);
});

// ── 겹친 /menus 응답 순서 (2026-08-06 브라우저 검증에서 발견한 결함) ──
// 소속과 직책을 연달아 고르면 조회가 겹치고, 응답 도착 순서는 요청 순서와 다를 수
// 있다. 옛 응답이 나중에 도착해 최종 화면이 되면 **역할에 없는 탭이 열린 채 남는다.**

test('latestGuard: 마지막 요청의 응답만 칠한다', function () {
  const g = app.latestGuard();
  const first = g.next();
  const second = g.next();
  // 나중 요청이 먼저 도착 → 칠한다.
  assert.strictEqual(g.accept(second), true);
  // 먼저 나갔던 요청이 뒤늦게 도착 → 버린다(이게 실제로 났던 버그다).
  assert.strictEqual(g.accept(first), false);
});

test('latestGuard: 순서대로 도착하면 전부 칠한다', function () {
  const g = app.latestGuard();
  const a = g.next();
  assert.strictEqual(g.accept(a), true);
  const b = g.next();
  assert.strictEqual(g.accept(b), true);
});

test('latestGuard: 같은 응답을 두 번 칠하지 않는다', function () {
  const g = app.latestGuard();
  const t = g.next();
  assert.strictEqual(g.accept(t), true);
  assert.strictEqual(g.accept(t), false);
});

test('latestGuard: 문지기끼리 번호를 공유하지 않는다', function () {
  // 화면마다 독립이어야 한다 — 한 쪽의 진행이 다른 쪽 응답을 버리게 하면 안 된다.
  const a = app.latestGuard();
  const b = app.latestGuard();
  a.next(); a.next();
  assert.strictEqual(b.accept(b.next()), true);
});
