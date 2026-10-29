const test = require('node:test');
const assert = require('node:assert');
const ap = require('../js/approvals.js');

// 결재함 (계획 I Task 5). 영업부장 화면에는 워크플로가 없으므로, 결재에 필요한 맥락이
// 카드 하나에 다 있어야 한다 — 그 카드 모델을 여기서 고정한다.

const PAYLOAD = {
  role: '영업부장',
  items: [
    { kind: 'task', task_id: 't-design', team: '디자이너', status: '1차완료',
      assignee: '최 디자이너', approver: null, draft_content: '표지 시안 설명',
      institution_id: 'nowon', institution_name: '노원구', stage: 8,
      files: [{ name: '표지.pptx', size: 2048, uploaded_at: '2026-08-05T01:00:00+00:00' }] },
    { kind: 'gate', gate: '최종결재', institution_id: 'dobong',
      institution_name: '도봉구', stage: 8 },
  ],
};

test('rows: 작업과 게이트를 같은 카드 모양으로 만든다', function () {
  const rows = ap.rows(PAYLOAD);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].kind, 'task');
  assert.strictEqual(rows[0].title, '노원구 · 디자이너');
  assert.strictEqual(rows[1].title, '도봉구 · 최종결재');
});

test('rows: 작성자와 본문·파일이 카드에 실린다', function () {
  const r = ap.rows(PAYLOAD)[0];
  assert.strictEqual(r.author, '최 디자이너');
  assert.strictEqual(r.content, '표지 시안 설명');
  assert.strictEqual(r.files[0].sizeText, '2.0 KB');
});

test('rows: 게이트에는 작성자도 본문도 없다', function () {
  const r = ap.rows(PAYLOAD)[1];
  assert.strictEqual(r.author, null);
  assert.strictEqual(r.content, '');
  assert.deepStrictEqual(r.files, []);
});

test('rows: 빈 입력도 안전하다', function () {
  assert.deepStrictEqual(ap.rows(null), []);
  assert.deepStrictEqual(ap.rows({ items: [] }), []);
});

test('kindLabel: 무엇을 결재하는지 한마디로', function () {
  assert.strictEqual(ap.kindLabel(PAYLOAD.items[0]), '작업물 결재');
  assert.strictEqual(ap.kindLabel(PAYLOAD.items[1]), '최종결재');
});

test('endpoint: 작업과 게이트는 부르는 곳이 다르다', function () {
  assert.strictEqual(ap.endpoint(ap.rows(PAYLOAD)[0]), '/tasks/t-design/approve');
  assert.strictEqual(ap.endpoint(ap.rows(PAYLOAD)[1]), '/institutions/dobong/checkpoint');
});

test('canDecide: 결재자 이름이 없으면 누를 수 없다', function () {
  // approver로 남을 이름이 없으면 "누가 봤는지"가 기록에서 사라진다.
  assert.strictEqual(ap.canDecide({ name: '' }), false);
  assert.strictEqual(ap.canDecide({ name: '이 팀장' }), true);
  assert.strictEqual(ap.canDecide(null), false);
});

test('summary: 몇 건이 밀려 있는지', function () {
  assert.strictEqual(ap.summary(PAYLOAD), '결재 대기 2건');
  assert.strictEqual(ap.summary({ items: [] }), '결재할 것이 없습니다.');
});

// ── 결재 요청(권한 신청) 탭 — 서버 /approval-requests ─────────────────────

const CATS = [{ title: '업무', items: [{ key: 'knowledge', label: '지식' }, { key: 'approvals', label: '결재함' }] }];
const REQ = {
  req_id: 7, type_label: '권한 신청', title: '권한 신청 — 2개 메뉴', status: 'PENDING',
  requester_name: '김영업', requester_position: '대리', created_at: '2026-10-29T01:40:00Z',
  payload: { reason: '업무상 필요', changes: [
    { menu: 'knowledge', view: true, write: true, edit: false, approve: false },
    { menu: 'admin', view: true, write: false, edit: false, approve: false }] },
  steps: [
    { step_no: 1, kind: 'LINE', approver_name: '이영업', status: 'PENDING' },
    { step_no: 2, kind: 'ADMIN', approver_name: '시스템 관리자', status: 'PENDING' }],
  can_decide: true, acting_as_deputy: false, can_cancel: true,
};

test('탭: 내가 올린 요청이 맨 앞이고, 모르는 키는 맨 앞으로 되돌린다', function () {
  assert.deepStrictEqual(ap.TABS.map(function (t) { return t.key; }), ['mine', 'inbox']);
  assert.strictEqual(ap.normTab('inbox'), 'inbox');
  assert.strictEqual(ap.normTab('nope'), 'mine');
  assert.strictEqual(ap.normTab(undefined), 'mine');
});

test('statusInfo: 요청 상태마다 이름과 색 단계', function () {
  assert.deepStrictEqual(ap.statusInfo('PENDING'), { label: '결재 대기', tone: 'warn' });
  assert.deepStrictEqual(ap.statusInfo('APPROVED'), { label: '승인·반영됨', tone: 'ok' });
  assert.deepStrictEqual(ap.statusInfo('REJECTED'), { label: '반려', tone: 'bad' });
  assert.deepStrictEqual(ap.statusInfo('CANCELLED'), { label: '취소됨', tone: 'muted' });
  assert.strictEqual(ap.statusInfo('???').label, '???');
});

test('stepChips: 결재선을 "누가 · 상태"로, 대결 처리면 처리자를 덧붙인다', function () {
  const chips = ap.stepChips([
    { approver_name: '이영업', status: 'APPROVED', acted_as_deputy: true, acted_by_name: '박영업' },
    { approver_name: '시스템 관리자', status: 'PENDING' },
    { approver_name: '백수아', status: 'SKIPPED' }]);
  assert.strictEqual(chips[0].text, '이영업 (대결 박영업) · 승인');
  assert.strictEqual(chips[0].tone, 'ok');
  assert.strictEqual(chips[1].text, '시스템 관리자 · 대기');
  assert.strictEqual(chips[1].tone, 'warn');
  assert.strictEqual(chips[2].tone, 'muted');
  assert.deepStrictEqual(ap.stepChips(null), []);
});

test('menuName: 사이드바 이름을 따르고, 시스템 관리는 고정, 모르면 키', function () {
  assert.strictEqual(ap.menuName('knowledge', CATS), '지식');
  assert.strictEqual(ap.menuName('admin', CATS), '시스템 관리');
  assert.strictEqual(ap.menuName('zzz', CATS), 'zzz');
  assert.strictEqual(ap.menuName('knowledge', null), 'knowledge');
});

test('requestRows: 카드 모델 — 제목·상태·신청 내용·결재선·버튼 가능 여부', function () {
  const r = ap.requestRows([REQ], CATS)[0];
  assert.strictEqual(r.id, 7);
  assert.strictEqual(r.requester, '김영업(대리)');
  assert.strictEqual(r.statusLabel, '결재 대기');
  assert.strictEqual(r.when, '2026-10-29 10:40');          // UTC → KST
  assert.strictEqual(r.reason, '업무상 필요');
  assert.deepStrictEqual(r.changes[0], { menu: '지식', view: true, write: true, edit: false, approve: false });
  assert.strictEqual(r.changes[1].menu, '시스템 관리');
  assert.strictEqual(r.chips.length, 2);
  assert.strictEqual(r.canDecide, true);
  assert.strictEqual(r.canCancel, true);
  assert.strictEqual(r.note, '');                           // 대기 중에는 결과 메모가 없다
});

test('requestRows: 반려·취소만 결과 메모를 보이고, 비어 있으면 빈 목록', function () {
  const rej = ap.requestRows([Object.assign({}, REQ, { status: 'REJECTED', result_note: '반려', can_decide: false, can_cancel: false })], CATS)[0];
  assert.strictEqual(rej.note, '반려');
  assert.strictEqual(rej.canDecide, false);
  const ok = ap.requestRows([Object.assign({}, REQ, { status: 'APPROVED', result_note: '반영됨' })], CATS)[0];
  assert.strictEqual(ok.note, '');
  assert.deepStrictEqual(ap.requestRows(null, CATS), []);
});

test('inboxNotice: 결재 권한이 없으면 숨기지 않고 안내, 있으면 비었을 때만 문구', function () {
  assert.strictEqual(ap.inboxNotice(true, 3), '');
  assert.strictEqual(ap.inboxNotice(false, 3), '');
  assert.strictEqual(ap.inboxNotice(true, 0), '결재할 것이 없습니다.');
  assert.ok(ap.inboxNotice(false, 0).indexOf('결재 권한이 없어') === 0);
  assert.ok(ap.inboxNotice(false, 0).indexOf('내 정보') > 0);
});

test('decisionBody·decisionError: 승인은 의견 선택, 반려는 사유 필수', function () {
  assert.deepStrictEqual(ap.decisionBody(true, ''), { decision: 'APPROVE', comment: null });
  assert.deepStrictEqual(ap.decisionBody(false, ' 사유 '), { decision: 'REJECT', comment: '사유' });
  assert.strictEqual(ap.decisionError(true, ''), '');
  assert.strictEqual(ap.decisionError(false, '   '), '반려 사유를 입력하세요.');
  assert.strictEqual(ap.decisionError(false, '근거 부족'), '');
});
