const test = require('node:test');
const assert = require('node:assert');
const wf = require('../js/workflow.js');

test('STAGES: 9단계이고 결재 게이트는 5·7·8뿐', function () {
  assert.strictEqual(wf.STAGES.length, 9);
  const gates = wf.STAGES.filter(function (s) { return s.gate; }).map(function (s) { return [s.no, s.gate]; });
  assert.deepStrictEqual(gates, [[5, '기획승인'], [7, '이관결재'], [8, '최종결재']]);
});

test('stepperModel: 완료/현재/대기 구분', function () {
  const model = wf.stepperModel({ stage: 4, running: false, pending_gate: null, tasks: [] });
  assert.strictEqual(model[2].state, 'done');     // 3단계
  assert.strictEqual(model[3].state, 'current');  // 4단계
  assert.strictEqual(model[4].state, 'todo');     // 5단계
});

test('stepperModel: 결재 대기 중이면 해당 단계가 gate 상태', function () {
  const model = wf.stepperModel({ stage: 5, running: false, pending_gate: '기획승인', tasks: [] });
  assert.strictEqual(model[4].state, 'gate');
});

test('runnable: 실행 중·결재 대기·완료 상태에서는 실행 불가', function () {
  assert.strictEqual(wf.runnable({ stage: 2, running: false, pending_gate: null }), true);
  assert.strictEqual(wf.runnable({ stage: 2, running: true, pending_gate: null }), false);
  assert.strictEqual(wf.runnable({ stage: 5, running: false, pending_gate: '기획승인' }), false);
  assert.strictEqual(wf.runnable({ stage: 9, running: false, pending_gate: null }), false);
});

test('teamCards: 담당자 미배정 표시', function () {
  const cards = wf.teamCards({ tasks: [
    { team: '영업', status: '작성중', progress_pct: 30, assignee: null },
    { team: '전산', status: '1차완료', progress_pct: 100, assignee: 'it-user' },
  ] });
  assert.strictEqual(cards[0].label, '영업 · 미배정');
  assert.strictEqual(cards[1].label, '전산 · it-user');
});

test('coverageRows/Summary: 상태 분류와 합계', function () {
  const payload = { total_score: 30, criteria: [
    { category: '사업', item: '전산 시스템', score: 20, team: '전산', covered: true, gap_note: null, pii_count: 1 },
    { category: '기타', item: '지역 기여', score: 10, team: null, covered: false, gap_note: null, pii_count: 0 },
  ] };
  const rows = wf.coverageRows(payload);
  assert.strictEqual(rows[0].state, 'ok');
  assert.strictEqual(rows[1].state, 'none');

  const sum = wf.coverageSummary(payload);
  assert.deepStrictEqual(sum, { total: 2, covered: 1, coveredScore: 20, totalScore: 30, piiTotal: 1 });
});

test('logRows: 메시지를 시간순 행으로 변환', function () {
  const rows = wf.logRows({ task_id: 't', messages: [
    { role: 'orchestrator', content: '지시', created_at: '2026-07-31T00:00:00' },
    { role: 'agent', content: '보고', created_at: '2026-07-31T00:01:00' },
  ] });
  assert.deepStrictEqual(rows.map(function (r) { return r.role; }), ['orchestrator', 'agent']);
  assert.strictEqual(rows[1].content, '보고');
});

test('logRows: 메시지 없으면 빈 배열', function () {
  assert.deepStrictEqual(wf.logRows({}), []);
});

test('roleLabel: 역할마다 한글 부제를 단다', function () {
  assert.deepStrictEqual(wf.roleLabel('orchestrator', {}), { main: 'orchestrator', sub: '총괄 agent' });
  assert.deepStrictEqual(wf.roleLabel('agent', { team: '영업' }), { main: 'agent', sub: '영업 agent' });
  assert.deepStrictEqual(wf.roleLabel('agent', {}), { main: 'agent', sub: '실무 agent' });
  assert.deepStrictEqual(wf.roleLabel('human', { author: '김 차장' }), { main: 'human', sub: '김 차장' });
  assert.deepStrictEqual(wf.roleLabel('user', { assignee: '정 대리' }), { main: 'user', sub: '정 대리' });
  assert.deepStrictEqual(wf.roleLabel('human', {}), { main: 'human', sub: '담당자' });
});

test('roleLabel: 알림 kind 같은 미지 역할은 부제 없이 그대로', function () {
  assert.deepStrictEqual(wf.roleLabel('결재요청', {}), { main: '결재요청', sub: null });
});

const TL = { events: [
  { stage: 5, at: '09:00', kind: 'message', team: '영업', role: 'agent', author: null, content: 'a' },
  { stage: 5, at: '09:30', kind: 'notification', team: null, role: '결재요청', author: null, content: 'b' },
  { stage: 6, at: '10:00', kind: 'message', team: '영업', role: 'human', author: '김 차장', content: 'c' },
  { stage: null, at: '01:00', kind: 'message', team: '영업', role: 'user', author: null, content: 'old' },
] };

test('stageEvents: 해당 단계만 순서 보존해서 고른다', function () {
  assert.deepStrictEqual(wf.stageEvents(TL, 5).map(function (e) { return e.content; }), ['a', 'b']);
  assert.deepStrictEqual(wf.stageEvents(TL, 6).map(function (e) { return e.content; }), ['c']);
  assert.deepStrictEqual(wf.stageEvents(TL, 9), []);
});

test('stageCounts: 단계별 건수 — stage가 없는 행은 세지 않는다', function () {
  assert.deepStrictEqual(wf.stageCounts(TL), { 5: 2, 6: 1 });
  assert.deepStrictEqual(wf.stageCounts(null), {});
});

test('stepperModel: counts를 주면 각 단계에 건수가 실린다', function () {
  const model = wf.stepperModel({ stage: 6, tasks: [] }, wf.stageCounts(TL));
  assert.strictEqual(model[4].count, 2);   // 5단계
  assert.strictEqual(model[5].count, 1);   // 6단계
  assert.strictEqual(model[8].count, 0);   // 9단계
  // counts 없이 부르면 기존과 동일하게 0
  assert.strictEqual(wf.stepperModel({ stage: 6, tasks: [] })[4].count, 0);
});
