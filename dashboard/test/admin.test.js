const test = require('node:test');
const assert = require('node:assert');
const admin = require('../js/admin.js');

// 권한 관리 (계획 I Task 7) — 전산팀이 역할×메뉴를 켜고 끈다.

const PAYLOAD = {
  menus: [
    { key: 'map', label: '전국 지도', server_only: false },
    { key: 'approvals', label: '결재함', server_only: true },
    { key: 'admin', label: '권한관리', server_only: true },
  ],
  roles: {
    '영업팀': { map: true, approvals: false, admin: false },
    '전산팀': { map: true, approvals: false, admin: true },
  },
};

test('grid: 역할 행 × 메뉴 열로 편다', function () {
  const g = admin.grid(PAYLOAD);
  assert.deepStrictEqual(g.menus.map(function (m) { return m.key; }), ['map', 'approvals', 'admin']);
  assert.deepStrictEqual(g.rows.map(function (r) { return r.role; }), ['영업팀', '전산팀']);
  assert.strictEqual(g.rows[1].cells.admin, true);
});

test('grid: 빈 입력도 안전하다', function () {
  assert.deepStrictEqual(admin.grid(null), { menus: [], rows: [] });
});

test('diff: 바뀐 것만 보낸다', function () {
  // 전체를 덮어쓰면 두 사람이 같은 화면을 열었을 때 나중 저장이 상대 변경을 지운다.
  const after = { '영업팀': { map: true, approvals: true, admin: false },
                  '전산팀': { map: true, approvals: false, admin: true } };
  assert.deepStrictEqual(admin.diff(PAYLOAD.roles, after),
    [{ role: '영업팀', menu: 'approvals', enabled: true }]);
});

test('diff: 바뀐 게 없으면 빈 배열', function () {
  assert.deepStrictEqual(admin.diff(PAYLOAD.roles, PAYLOAD.roles), []);
});

test('lockCheck: 권한관리를 아무도 못 보게 되면 막는다', function () {
  // 서버도 400으로 막지만, 저장을 누르기 전에 화면에서 먼저 알려준다.
  const locked = { '영업팀': { admin: false }, '전산팀': { admin: false } };
  assert.ok(admin.lockCheck(locked));
  assert.strictEqual(admin.lockCheck({ '전산팀': { admin: true } }), '');
});

test('lockCheck: 담당자를 바꾸는 것은 정상이다', function () {
  const moved = { '영업팀': { admin: true }, '전산팀': { admin: false } };
  assert.strictEqual(admin.lockCheck(moved), '');
});
