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
