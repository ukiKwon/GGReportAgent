const test = require('node:test');
const assert = require('node:assert');
const mi = require('../js/myinfo.js');
const admin = require('../js/admin.js');

// 내 정보 — 회원관리성 개인 설정 화면의 순수 규칙. 서버: GET /approval-requests/my-perms.

const CATS = [{ title: '업무', items: [{ key: 'knowledge', label: '지식' }, { key: 'approvals', label: '결재함' }] }];
const ME = { emp_no: '3918264', name: '김영업', role: '영업팀', position_title: '대리',
  approver_emp_no: '5047192', approver_name: '이영업', can_approve: false };

test('보기: 기본 정보 · 내 권한 · 대결 설정 순서, 모르는 키는 맨 앞으로', function () {
  assert.deepStrictEqual(mi.VIEWS.map(function (v) { return v.key; }), ['basic', 'perms', 'deputy']);
  assert.strictEqual(mi.normView('deputy'), 'deputy');
  assert.strictEqual(mi.normView('x'), 'basic');
});

test('basicRows: 사번·이름·소속·직급·상위 결재자, 없는 값은 -', function () {
  const rows = mi.basicRows(ME);
  assert.deepStrictEqual(rows.map(function (r) { return r.label; }), ['사번', '이름', '소속', '직급', '상위 결재자']);
  assert.strictEqual(rows[4].value, '이영업 (5047192)');
  const top = mi.basicRows({ emp_no: '1473958', name: '백수아', role: '대표', position_title: '대표' });
  assert.strictEqual(top[4].value, '없음 (최상위)');
  assert.strictEqual(mi.basicRows({})[1].value, '-');
  assert.strictEqual(mi.basicRows(null)[0].value, '-');
});

test('permRows: 화면 이름을 사이드바에서 따오고, admin의 권한 규칙이 그대로 돈다', function () {
  const rows = mi.permRows([
    { menu_key: 'knowledge', label: '지식(옛 이름)', approvable: false, source: 'role', view: true, write: false, edit: false, approve: false },
    { menu_key: 'approvals', label: '결재', approvable: true, source: 'user', view: true, write: false, edit: false, approve: false }], CATS);
  assert.strictEqual(rows[0].label, '지식');
  assert.strictEqual(rows[1].source, 'user');
  // 작성을 켜면 조회가 따라 켜지고, 바뀐 메뉴만 신청 목록에 나온다.
  const draft = JSON.parse(JSON.stringify(rows));
  draft[0] = admin.togglePerm(draft[0], 'write', true);
  const changes = admin.permChanges(rows, draft);
  assert.strictEqual(changes.length, 1);
  assert.deepStrictEqual(changes[0], { menu: 'knowledge', view: true, write: true, edit: false, approve: false });
  assert.deepStrictEqual(mi.permRows(null, CATS), []);
});

test('reasonError·submitError: 사유 필수(200자 이내), 바뀐 것이 없으면 신청 못 함', function () {
  assert.strictEqual(mi.reasonError('   '), '신청 사유를 입력하세요.');
  assert.strictEqual(mi.reasonError('필요합니다'), '');
  assert.strictEqual(mi.reasonError('가'.repeat(201)), '신청 사유는 200자 이내로 입력하세요.');
  assert.strictEqual(mi.reasonError('가'.repeat(200)), '');
  const one = [{ menu: 'knowledge', view: true, write: true, edit: false, approve: false }];
  assert.ok(mi.submitError([], '사유').indexOf('바꿀 권한') === 0);
  assert.ok(mi.submitError(null, '사유').indexOf('바꿀 권한') === 0);
  assert.strictEqual(mi.submitError(one, '사유'), '');
  assert.strictEqual(mi.submitError(one, ''), '신청 사유를 입력하세요.');
});

test('deputyNotice: 결재 권한이 없으면 안내 문구만, 있으면 비어 있다', function () {
  assert.strictEqual(mi.deputyNotice(true), '');
  assert.ok(mi.deputyNotice(false).indexOf('결재 권한이 없어') === 0);
  assert.ok(mi.deputyNotice(false).indexOf('내 권한') > 0);
});

test('canApproveOf: 직급 자격 또는 메뉴 권한이 있으면 자격', function () {
  assert.strictEqual(mi.canApproveOf({ can_approve: false, rank_can_approve: true }), true);
  assert.strictEqual(mi.canApproveOf({ can_approve: true, rank_can_approve: false }), true);
  assert.strictEqual(mi.canApproveOf({ can_approve: true }), true);
  assert.strictEqual(mi.canApproveOf({ can_approve: false }), false);
  assert.strictEqual(mi.canApproveOf({ can_approve: false, rank_can_approve: false }), false);
  assert.strictEqual(mi.canApproveOf(null), true);
  assert.strictEqual(mi.deputyNotice(mi.canApproveOf({ can_approve: false, rank_can_approve: true })), '');
});
