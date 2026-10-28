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

// ── 시스템 관리(사용자·권한·메뉴·접근 이력) 순수 규칙 ──────────────────────────

const nav = require('../js/nav.js');

test('isEmpNo / userFormError: 사번은 숫자 7자리, 이름·역할 필수', function () {
  assert.strictEqual(admin.isEmpNo('8203417'), true);
  ['820341', '82034178', '82034a7', '', null, "1234567' OR '1"].forEach(function (v) {
    assert.strictEqual(admin.isEmpNo(v), false, String(v));
  });
  assert.strictEqual(admin.userFormError({ emp_no: '1234567', name: '가', role: '영업팀' }, true), '');
  assert.ok(admin.userFormError({ emp_no: '12', name: '가', role: '영업팀' }, true).indexOf('7자리') >= 0);
  assert.ok(admin.userFormError({ emp_no: '1234567', name: '  ', role: '영업팀' }, true).indexOf('이름') >= 0);
  assert.ok(admin.userFormError({ emp_no: '1234567', name: 'x'.repeat(51), role: '영업팀' }, true).indexOf('이름') >= 0);
  assert.ok(admin.userFormError({ emp_no: '1234567', name: '가', role: '' }, true).indexOf('역할') >= 0);
  // 수정 화면은 사번을 바꾸지 않으므로 사번 검사를 건너뛴다
  assert.strictEqual(admin.userFormError({ emp_no: '', name: '가', role: '영업팀' }, false), '');
});

const ROW = { menu_key: 'approvals', label: '결재함', approvable: true, source: 'role', view: false, write: false, edit: false, approve: false };

test('togglePerm: 작성·수정·결재를 켜면 조회가 따라 켜진다', function () {
  ['write', 'edit', 'approve'].forEach(function (f) {
    const r = admin.togglePerm(ROW, f, true);
    assert.strictEqual(r[f], true, f);
    assert.strictEqual(r.view, true, f + ' → view');
  });
});

test('togglePerm: 조회를 끄면 작성·수정·결재도 꺼진다', function () {
  const on = { ...ROW, view: true, write: true, edit: true, approve: true };
  const r = admin.togglePerm(on, 'view', false);
  assert.deepStrictEqual([r.view, r.write, r.edit, r.approve], [false, false, false, false]);
});

test('togglePerm: 결재 기능이 없는 메뉴는 결재를 켤 수 없고, 입력은 바뀌지 않는다', function () {
  const map = { ...ROW, menu_key: 'map', label: '전국 지도', approvable: false, view: true };
  const r = admin.togglePerm(map, 'approve', true);
  assert.strictEqual(r.approve, false);
  assert.strictEqual(map.approve, false);
  assert.notStrictEqual(r, map);
});

test('permChanges: 바뀐 메뉴만 서버 형식으로 돌려준다', function () {
  const before = [ROW, { ...ROW, menu_key: 'map', label: '전국 지도', approvable: false, view: true }];
  const after = [admin.togglePerm(ROW, 'approve', true), before[1]];
  assert.deepStrictEqual(admin.permChanges(before, after),
    [{ menu: 'approvals', view: true, write: false, edit: false, approve: true }]);
  assert.deepStrictEqual(admin.permChanges(before, before), []);
  assert.deepStrictEqual(admin.permChanges(null, null), []);
});

test('menuColumns: 사이드바의 대표 메뉴 순서·이름으로 열을 만든다(옛 라벨을 쓰지 않는다)', function () {
  const server = [
    { key: 'map', label: '전국 지도', server_only: false }, { key: 'regions', label: '전국 지역별', server_only: false },
    { key: 'workflow', label: '워크플로', server_only: true }, { key: 'chat', label: '대화', server_only: true },
    { key: 'knowledge', label: '지식', server_only: true }, { key: 'tasks', label: '작업함', server_only: true },
    { key: 'approvals', label: '결재함', server_only: true }, { key: 'admin', label: '권한관리', server_only: true }];
  const cols = admin.menuColumns(server, nav.CATEGORIES);
  assert.deepStrictEqual(cols.map(function (c) { return c.key; }),
    ['map', 'regions', 'knowledge', 'chat', 'workflow', 'tasks', 'approvals', 'admin']);
  assert.strictEqual(cols.filter(function (c) { return c.key === 'knowledge'; })[0].label, '지식 검색');
  assert.strictEqual(cols[cols.length - 1].label, '시스템 관리');          // 4개 보기가 한 열
  assert.strictEqual(cols[cols.length - 1].group, '시스템 관리');
  assert.deepStrictEqual(admin.groupSpans(cols).map(function (s) { return s.group + ':' + s.span; }),
    ['기관영업 기획 관리:2', '제안서 자료 관리:2', '제안서 협업 및 결재:3', '시스템 관리:1']);
});

test('menuColumns: 사이드바에 없는 새 메뉴 키도 빠지지 않는다', function () {
  const cols = admin.menuColumns([{ key: 'map', label: '전국 지도' }, { key: 'newone', label: '신규' }], nav.CATEGORIES);
  assert.deepStrictEqual(cols.map(function (c) { return c.key + '/' + c.group; }), ['map/기관영업 기획 관리', 'newone/기타']);
});

test('formatTime: UTC ISO(마이크로초 포함)를 한국시간으로', function () {
  assert.strictEqual(admin.formatTime('2026-10-28T00:00:00.000000+00:00'), '2026-10-28 09:00:00');
  assert.strictEqual(admin.formatTime('2026-10-28T20:30:05.481000+00:00'), '2026-10-29 05:30:05');
  assert.strictEqual(admin.formatTime('garbage'), 'garbage');
  assert.strictEqual(admin.formatTime(null), '');
});

test('maskIp: IPv4 마지막 자리, IPv6 앞 두 묶음만', function () {
  assert.strictEqual(admin.maskIp('10.20.30.40'), '10.20.30.*');
  assert.strictEqual(admin.maskIp('0:0:0:0:0:0:0:1'), '0:0:*');
  assert.strictEqual(admin.maskIp(''), '');
});

test('csvCell: 따옴표를 겹치고, 수식으로 시작하는 칸은 무력화한다(CSV 인젝션)', function () {
  assert.strictEqual(admin.csvCell('a"b'), '"a""b"');
  assert.strictEqual(admin.csvCell('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
  ['+1', '-1', '@x'].forEach(function (v) { assert.strictEqual(admin.csvCell(v), '"\'' + v + '"', v); });
  assert.strictEqual(admin.csvCell(null), '""');
  assert.strictEqual(admin.csvCell(200), '"200"');
});

test('auditCsv: 머리글 + 행, IP는 마스킹, 신원은 검증됨/자기신고', function () {
  const csv = admin.auditCsv([{ occurred_at: '2026-10-28T00:00:00.000000+00:00', emp_no: '5047192', emp_verified: false,
    event_type: 'LOGIN_OK', http_method: 'POST', req_path: '/auth/login', status_code: 200, client_ip: '10.1.2.3', detail: null }]);
  const lines = csv.split('\r\n');
  assert.strictEqual(lines.length, 2);
  assert.ok(lines[0].indexOf('시각(KST)') === 1);
  assert.ok(lines[1].indexOf('"2026-10-28 09:00:00","5047192","자기신고","로그인 성공"') === 0);
  assert.ok(lines[1].indexOf('10.1.2.*') > 0 && lines[1].indexOf('10.1.2.3') < 0);
});

test('VIEWS: 4개 보기와 안내 문구가 짝을 이룬다', function () {
  assert.deepStrictEqual(Object.keys(admin.VIEWS), ['users', 'perms', 'menus', 'audit']);
  Object.keys(admin.VIEWS).forEach(function (k) { assert.ok(admin.VIEW_HINTS[k], k); });
  assert.strictEqual(admin.currentView(), 'users');
});

test('pageSlice: 쪽 자르기·범위 보정·잘못된 쪽 크기', function () {
  const list = Array.from({ length: 23 }, function (_, i) { return i; });
  assert.deepStrictEqual(admin.PAGE_SIZES, [5, 10, 30, 50, 100]);
  let r = admin.pageSlice(list, 0, 10);
  assert.strictEqual(r.items.length, 10); assert.strictEqual(r.pages, 3); assert.strictEqual(r.total, 23);
  r = admin.pageSlice(list, 2, 10);
  assert.deepStrictEqual(r.items, [20, 21, 22]);
  assert.strictEqual(admin.pageSlice(list, 99, 10).page, 2);      // 넘치면 마지막 쪽
  assert.strictEqual(admin.pageSlice(list, -3, 10).page, 0);
  assert.strictEqual(admin.pageSlice(list, 0, 7).size, 10);        // 선택지 밖은 기본 10
  assert.strictEqual(admin.pageSlice(list, 0, 100).pages, 1);
  const empty = admin.pageSlice([], 0, 10);
  assert.strictEqual(empty.pages, 1); assert.strictEqual(empty.items.length, 0);
  assert.strictEqual(admin.pageSlice(null, 0, 5).total, 0);
});

// ── 결재라인(상위 결재자) ─────────────────────────────────────────────

function au(emp, extra) {
  return Object.assign({ emp_no: emp, name: 'n' + emp, role: '영업팀', position_title: '과장', status: 'ACTIVE',
    approval_grade: 'NONE', approver_mode: 'AUTO', approver_state: 'AUTO_OK', approver_emp_no: null, chain: [] }, extra || {});
}

test('chainText: 체인을 이름(직위) → … 로, 최상위·지정 필요·잠긴 결재자 표시', function () {
  const u = au('1', { chain: [{ emp_no: '2', name: '이영업', position_title: '과장', status: 'ACTIVE' },
    { emp_no: '3', name: '박영업', position_title: '부장', status: 'LOCKED' }] });
  assert.strictEqual(admin.chainText(u), '이영업(과장) → 박영업(부장) [잠김]');
  assert.ok(admin.chainText(au('9', { approver_state: 'TOP' })).indexOf('최상위') === 0);
  assert.strictEqual(admin.chainText(au('8', { approver_state: 'NEEDS', approver_note: '후보가 2명' })), '후보가 2명');
});

test('approverCandidates: 사용 중·결재 등급 있음·자기 제외·고리 방지', function () {
  const lead = au('2', { approval_grade: 'TEAM_LEAD' });
  const head = au('3', { approval_grade: 'DEPT_HEAD' });
  const retired = au('4', { approval_grade: 'TEAM_LEAD', status: 'RETIRED' });
  const plain = au('5');
  const me = au('1', { approval_grade: 'TEAM_LEAD' });
  const under = au('6', { approval_grade: 'TEAM_LEAD', chain: [{ emp_no: '1' }] });   // 내 아래 사람 → 고리
  const got = admin.approverCandidates([me, lead, head, retired, plain, under], me).map(function (c) { return c.emp_no; });
  assert.deepStrictEqual(got, ['2', '3']);
});

test('approverChange: 자동↔지정 변경만 서버에 보낸다', function () {
  const auto = au('1');
  const manual = au('2', { approver_mode: 'MANUAL', approver_emp_no: '9', approver_state: 'MANUAL_OK' });
  assert.strictEqual(admin.approverChange(auto, ''), null);
  assert.deepStrictEqual(admin.approverChange(auto, '9'), { mode: 'MANUAL', approver_emp_no: '9' });
  assert.strictEqual(admin.approverChange(manual, '9'), null);
  assert.deepStrictEqual(admin.approverChange(manual, '8'), { mode: 'MANUAL', approver_emp_no: '8' });
  assert.deepStrictEqual(admin.approverChange(manual, ''), { mode: 'AUTO', approver_emp_no: null });
});

test('approverAttention: 지정 필요·재지정 필요만(퇴직·최상위 제외)', function () {
  const list = [au('1', { approver_state: 'NEEDS' }), au('2', { approver_state: 'MANUAL_INVALID' }),
    au('3', { approver_state: 'NEEDS', status: 'RETIRED' }), au('4', { approver_state: 'TOP' }), au('5')];
  assert.strictEqual(admin.approverAttention(list), 2);
});
