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
