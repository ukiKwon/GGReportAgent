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
  const payload = { total_score: 30, pii_total: 1,
    teams: [{ team: '전산', pii_count: 1 }],
    criteria: [
      { category: '사업', item: '전산 시스템', score: 20, team: '전산', covered: true, gap_note: null },
      { category: '기타', item: '지역 기여', score: 10, team: null, covered: false, gap_note: null },
    ] };
  const rows = wf.coverageRows(payload);
  assert.strictEqual(rows[0].state, 'ok');
  assert.strictEqual(rows[1].state, 'none');

  const sum = wf.coverageSummary(payload);
  assert.deepStrictEqual(sum, { total: 2, covered: 1, coveredScore: 20, totalScore: 30, piiTotal: 1 });
});

// PII는 **항목이 아니라 팀 단위 사실**이다(업로드 본문 1회 스캔 결과). 서버가 이제
// 그대로 팀별로 준다 — 예전에는 항목마다 복제돼 내려와서 화면이 팀당 max를 집는
// 휴리스틱으로 방어해야 했다(항목별로 더하면 3건·4항목 → 12건으로 부풀었다).

test('coverageSummary: 합계는 서버가 준 pii_total을 그대로 쓴다', function () {
  const payload = { total_score: 40, pii_total: 3,
    teams: [{ team: '전산', pii_count: 3 }],
    criteria: [
      { item: 'A', score: 10, team: '전산', covered: true, gap_note: null },
      { item: 'B', score: 10, team: '전산', covered: true, gap_note: null },
      { item: 'C', score: 10, team: '전산', covered: false, gap_note: null },
      { item: 'D', score: 10, team: '전산', covered: false, gap_note: null },
    ] };
  // 같은 팀 항목이 4개여도 3건이다 — 화면이 다시 세지 않는다.
  assert.strictEqual(wf.coverageSummary(payload).piiTotal, 3);
});

test('piiTeams/piiLabel: 팀별로 한 줄에 보여준다', function () {
  const payload = { teams: [{ team: '전산', pii_count: 3 }, { team: '예산', pii_count: 1 }] };
  assert.deepStrictEqual(wf.piiTeams(payload),
    [{ team: '전산', count: 3 }, { team: '예산', count: 1 }]);
  // '팀'은 서버 값에 없다(tasks.team은 '전산') — 화면 문구에서만 붙인다.
  assert.strictEqual(wf.piiLabel(payload), '⚠️ 개인정보 — 전산팀 3건 · 예산팀 1건');
});

test('piiTeams: 0건인 팀은 빼고, 없으면 문구 자체가 없다', function () {
  const payload = { teams: [{ team: '전산', pii_count: 0 }, { team: '예산', pii_count: 2 }] };
  assert.deepStrictEqual(wf.piiTeams(payload), [{ team: '예산', count: 2 }]);
  assert.strictEqual(wf.piiLabel({ teams: [] }), '');
  assert.strictEqual(wf.piiLabel({}), '');
});

test('coverageSummary: pii_total이 없어도 죽지 않는다', function () {
  // 옛 서버 응답이나 빈 상태.
  assert.strictEqual(wf.coverageSummary({ criteria: [] }).piiTotal, 0);
  assert.strictEqual(wf.coverageSummary({}).piiTotal, 0);
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

// Task 6: 어떤 모델을 써서 남긴 기록인지 로그에 실린다.
test('logRows: model이 있으면 함께 옮기고, 없으면 null', function () {
  const rows = wf.logRows({ messages: [
    { role: 'agent', content: '초안', created_at: '2026-08-05T00:00:00', model: 'llama3.2:3b' },
    { role: 'human', content: '확인', created_at: '2026-08-05T00:01:00' },
  ] });
  assert.strictEqual(rows[0].model, 'llama3.2:3b');
  assert.strictEqual(rows[1].model, null);
});

test('renderLog: model이 있는 줄에만 🧠 표시가 붙는다(비LLM 기록은 지저분해지지 않는다)', function () {
  const el = fakeEl();
  wf.renderLog(el, { messages: [
    { role: 'agent', content: '초안', created_at: '2026-08-05T00:00:00', model: 'llama3.2:3b' },
    { role: 'human', content: '확인', created_at: '2026-08-05T00:01:00' },
  ] }, { team: '영업' });
  assert.match(el.innerHTML, /🧠 llama3\.2:3b/);
  assert.strictEqual((el.innerHTML.match(/🧠/g) || []).length, 1);   // human 줄에는 안 붙는다
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

// ── 참여 결정 3단계 (계획 D) ────────────────────────────────────────
test('participationRows: 결재된 차수는 done, 다음 한 차수만 current', function () {
  const rows = wf.participationRows({
    bidCaseId: 'bc-1', participationStatus: '검토중',
    participationDecision: [{ tier: 1, role: '영업팀', by: '김 차장', choice: '참여', at: '08-03' }],
  });
  assert.deepStrictEqual(rows.map(function (r) { return r.state; }), ['done', 'current', 'todo']);
  assert.strictEqual(rows[0].by, '김 차장');
  assert.strictEqual(rows[0].choice, '참여');
  assert.deepStrictEqual(rows.map(function (r) { return r.tier; }), [1, 2, 3]);
});

test('participationRows: 아무도 결재 안 했으면 1차가 current', function () {
  const rows = wf.participationRows({ bidCaseId: 'bc-1', participationStatus: '검토중' });
  assert.deepStrictEqual(rows.map(function (r) { return r.state; }), ['current', 'todo', 'todo']);
});

test('participationRows: 결정이 끝난 공고는 더 누를 수 없다', function () {
  ['참여확정', '미참여확정', '보류'].forEach(function (status) {
    const rows = wf.participationRows({
      bidCaseId: 'bc-1', participationStatus: status,
      participationDecision: [{ tier: 1, choice: '미참여' }],
    });
    assert.strictEqual(rows.filter(function (r) { return r.state === 'current'; }).length, 0,
      status + '에서 current가 남아 있으면 안 된다');
  });
});

test('participationRows: 공고가 없으면 빈 배열 (카드를 그리지 않는다)', function () {
  assert.deepStrictEqual(wf.participationRows({ name: '광진구' }), []);
  assert.deepStrictEqual(wf.participationRows(null), []);
});

test('nextDecisionTier: 다음에 보낼 tier — 끝났으면 null', function () {
  assert.strictEqual(wf.nextDecisionTier({ bidCaseId: 'b', participationStatus: '검토중' }), 1);
  assert.strictEqual(wf.nextDecisionTier({
    bidCaseId: 'b', participationStatus: '검토중',
    participationDecision: [{ tier: 1 }, { tier: 2 }] }), 3);
  assert.strictEqual(wf.nextDecisionTier({ bidCaseId: 'b', participationStatus: '참여확정' }), null);
  assert.strictEqual(wf.nextDecisionTier(null), null);
});

test('consistencyRows: 어긋난 항목만 메시지와 함께', function () {
  const rows = wf.consistencyRows({ ok: false, findings: [
    { institution_id: 'dobong', name_ko: '도봉구', rule: 'stage_without_confirmation',
      why: '참여 결정 전에 워크플로가 진행됐다', message: '도봉구: 9단계까지…' },
  ] });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].rule, 'stage_without_confirmation');
  assert.strictEqual(rows[0].why, '참여 결정 전에 워크플로가 진행됐다');
});

test('consistencyRows: 정상이면 빈 배열', function () {
  assert.deepStrictEqual(wf.consistencyRows({ ok: true, findings: [] }), []);
  assert.deepStrictEqual(wf.consistencyRows(null), []);
});

// ── 단계 로그의 🧠 (후속 정리) ──────────────────────────────────────────
// 팀별 작업 로그에는 진작 붙어 있었는데 스테퍼 칸을 눌러 보는 단계 전체 로그
// (GET /institutions/{id}/timeline)에는 응답에 model이 없어 안 붙었다. 이제 온다.

test('renderStageLog: timeline의 model도 🧠로 붙는다', function () {
  const el = fakeEl();
  wf.renderStageLog(el, { events: [
    { stage: 5, at: '2026-08-05T09:00:00', kind: 'message', team: '영업', role: 'agent',
      author: null, content: '초안 3건 작성 완료', model: 'llama3.2:3b' },
  ] }, 5);
  assert.match(el.innerHTML, /🧠 llama3\.2:3b/);
});

test('renderStageLog: 알림·사람 발화에는 🧠가 붙지 않는다', function () {
  const el = fakeEl();
  wf.renderStageLog(el, { events: [
    { stage: 5, at: '2026-08-05T09:30:00', kind: 'notification', team: null,
      role: '결재요청', author: null, content: '기획승인 대기', model: null },
    { stage: 5, at: '2026-08-05T09:40:00', kind: 'message', team: '영업', role: 'human',
      author: '김 차장', content: '확인했습니다', model: null },
  ] }, 5);
  assert.strictEqual((el.innerHTML.match(/🧠/g) || []).length, 0);
});
