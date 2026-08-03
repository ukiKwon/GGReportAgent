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

const STATUS_6 = { stage: 6, tasks: [
  { task_id: 't-sales', team: '영업', status: '작성중', progress_pct: 40, assignee: '김 차장' },
  { task_id: 't-bud', team: '예산', status: '작성중', progress_pct: 65, assignee: '정 대리' },
] };

const TL_P = { events: [
  { stage: 5, at: '1', kind: 'message', team: '영업', role: 'orchestrator', author: null, content: '영업팀에 초안 지시' },
  { stage: 5, at: '2', kind: 'message', team: '영업', role: 'agent', author: null, content: '초안 2건 완료' },
  { stage: 5, at: '3', kind: 'notification', team: null, role: '결재요청', author: null, content: '기획승인 대기' },
  { stage: 5, at: '4', kind: 'message', team: '예산', role: 'human', author: '정 대리', content: '금리 수치는 본부 회신 후' },
  { stage: 6, at: '5', kind: 'message', team: '영업', role: 'human', author: '김 차장', content: '기획 승인 — 김 차장' },
] };

test('stageParticipants: 그 단계에 기록을 남긴 팀만, 사람이 있으면 실명으로', function () {
  const ps = wf.stageParticipants(TL_P, 5, STATUS_6);
  assert.deepStrictEqual(ps.map(function (p) { return p.label; }), ['영업 agent', '예산 · 정 대리']);
  assert.deepStrictEqual(ps.map(function (p) { return p.count; }), [2, 1]);
  // 마지막 기록이 그 단계에서 한 일 요약이 된다
  assert.strictEqual(ps[0].summary, '초안 2건 완료');
  // 진행률·상태·task_id는 status.tasks에서 붙는다
  assert.strictEqual(ps[0].taskId, 't-sales');
  assert.strictEqual(ps[0].statusText, '작성중');
  assert.strictEqual(ps[0].progressPct, 40);
});

test('stageParticipants: 알림은 참여자가 아니다(팀 없음) — 단계 로그에만 남는다', function () {
  const teams = wf.stageParticipants(TL_P, 5, STATUS_6).map(function (p) { return p.team; });
  assert.deepStrictEqual(teams, ['영업', '예산']);
});

test('stageParticipants: 사람이 낀 단계는 실명이 이긴다', function () {
  const ps = wf.stageParticipants(TL_P, 6, STATUS_6);
  assert.deepStrictEqual(ps.map(function (p) { return p.label; }), ['영업 · 김 차장']);
});

test('stageParticipants: agent 메시지의 author는 사람 이름이 아니다', function () {
  const tl = { events: [
    { stage: 6, at: '1', kind: 'message', team: '예산', role: 'agent', author: '검증 agent',
      content: '업로드 즉시검사 — 미달 1건' },
  ] };
  assert.strictEqual(wf.stageParticipants(tl, 6, null)[0].label, '예산 agent');
});

test('stageParticipants: 기록 없는 단계는 빈 배열', function () {
  assert.deepStrictEqual(wf.stageParticipants(TL_P, 9, STATUS_6), []);
  assert.deepStrictEqual(wf.stageParticipants(null, 5, null), []);
});

test('stageParticipants: status에 없는 팀도 카드로 나온다(진행률만 비어 있음)', function () {
  const ps = wf.stageParticipants(TL_P, 5, { tasks: [] });
  assert.strictEqual(ps[0].taskId, null);
  assert.strictEqual(ps[0].statusText, null);
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

// ── 렌더 스모크 ──────────────────────────────────────────────────────
// DOM은 innerHTML만 쓰므로 가짜 엘리먼트로 충분하다. 순수부만 테스트하다 보니
// renderPanel의 선언 누락(ReferenceError)이 실행해봐야만 드러난 적이 있어 추가했다.
function fakeEl() { return { innerHTML: '' }; }

test('renderPanel: 스테퍼·참여자 카드·배점표 요약을 예외 없이 그린다', function () {
  const el = fakeEl();
  wf.renderPanel(el, STATUS_6, { total_score: 30, criteria: [
    { item: 'a', score: 20, team: '영업', covered: true, pii_count: 0 }] }, TL_P, 5);

  assert.match(el.innerHTML, /wf-stepper/);
  assert.match(el.innerHTML, /data-stage="5"/);
  assert.match(el.innerHTML, /5단계 「제안서 기획」 참여자 2명/);
  assert.match(el.innerHTML, /영업 agent/);
  assert.match(el.innerHTML, /예산 · 정 대리/);
  assert.match(el.innerHTML, /배점표 1\/1항목 · 20\/30점/);
});

test('renderPanel: stageNo를 안 주면 status.stage를 본다', function () {
  const el = fakeEl();
  wf.renderPanel(el, STATUS_6, null, TL_P);
  assert.match(el.innerHTML, /6단계 「세부기획\(3팀\)」 참여자 1명/);
});

test('renderPanel: 참여 기록이 없는 단계도 안전하게 그린다', function () {
  const el = fakeEl();
  wf.renderPanel(el, STATUS_6, null, TL_P, 9);
  assert.match(el.innerHTML, /이 단계에는 참여 기록이 없습니다/);
});

test('renderStageLog / renderLog / renderCoverage: 빈 입력도 예외 없이 그린다', function () {
  const el = fakeEl();
  wf.renderStageLog(el, TL_P, 9);
  assert.match(el.innerHTML, /9단계 「제출」 수행 내용/);
  wf.renderLog(el, {}, { team: '예산' });
  assert.match(el.innerHTML, /예산 작업 로그/);
  wf.renderCoverage(el, { criteria: [], total_score: 0 });
  assert.match(el.innerHTML, /배점표가 아직 없습니다/);
});
