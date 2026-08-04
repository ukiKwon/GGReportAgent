const test = require('node:test');
const assert = require('node:assert');
const chat = require('../js/chat.js');

const MSGS = [
  { role: 'user', content: '참여할까요?', created_at: '09:00', author: '김 차장' },
  { role: 'agent', content: '영업 관점에서는…', created_at: '09:01', author: null },
  { role: 'user', content: '예산은요?', created_at: '09:05', author: '정 대리' },
  { role: 'user', content: '작성자 없는 옛날 글', created_at: '08:00', author: null },
];

test('rows: 역할별 표기 — 사람은 실명, 에이전트는 참여검토', function () {
  const rows = chat.rows(MSGS, { name: '김 차장', team: '영업팀' });
  assert.deepStrictEqual(rows.map(function (r) { return r.label; }),
    ['김 차장', '참여검토 agent', '정 대리', '담당자']);
});

test('rows: mine은 내 이름이 쓴 글만 (에이전트는 절대 내 것이 아니다)', function () {
  const rows = chat.rows(MSGS, { name: '김 차장', team: '영업팀' });
  assert.deepStrictEqual(rows.map(function (r) { return r.mine; }), [true, false, false, false]);
});

test('rows: 프로필이 비면 내 것으로 표시되는 글이 없다', function () {
  const rows = chat.rows(MSGS, { name: '', team: '' });
  assert.deepStrictEqual(rows.map(function (r) { return r.mine; }), [false, false, false, false]);
});

test('rows: 빈 입력도 안전하다', function () {
  assert.deepStrictEqual(chat.rows(null, null), []);
});

test('canSend: 기관·내용·전송중 세 조건을 모두 본다', function () {
  assert.strictEqual(chat.canSend({ institutionId: 'dobong', text: '질문', sending: false }), true);
  assert.strictEqual(chat.canSend({ institutionId: null, text: '질문', sending: false }), false);
  assert.strictEqual(chat.canSend({ institutionId: 'dobong', text: '   ', sending: false }), false);
  assert.strictEqual(chat.canSend({ institutionId: 'dobong', text: '질문', sending: true }), false);
  assert.strictEqual(chat.canSend(null), false);
});

// ── LLM 실패 표시 (계획 F 후속 G1) ─────────────────────────────────────

test('rows: 실패 사유가 담긴 agent 답변을 failed로 표시한다', function () {
  const rows = chat.rows([{ role: 'agent', content: '[답변 실패] 모델을 찾을 수 없습니다' }]);
  assert.strictEqual(rows[0].failed, true);
});

test('rows: 정상 답변은 failed가 아니다', function () {
  assert.strictEqual(chat.rows([{ role: 'agent', content: '영업 관점: …' }])[0].failed, false);
});

test('rows: 사용자가 같은 문구를 쳐도 실패로 보지 않는다 (agent 답변만 대상)', function () {
  const rows = chat.rows([{ role: 'user', content: '[답변 실패] 라고 떴는데요' }]);
  assert.strictEqual(rows[0].failed, false);
});

test('renderLog: failed면 말풍선에 클래스가 붙는다', function () {
  const el = { innerHTML: '' };
  chat.renderLog(el, [{ role: 'agent', content: '[답변 실패] 모델 없음' }], {});
  assert.ok(el.innerHTML.includes('ch-row agent failed'));
});
