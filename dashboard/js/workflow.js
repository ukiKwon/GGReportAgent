(function (root) {
  'use strict';
  // 워크플로 현황판 (계획 C1). 순수 모델과 DOM 렌더를 한 파일 안에서 분리해 두고,
  // 순수부만 node --test로 고정한다. 서버 모드 전용 — file:// 폴백에서는 탭이 숨는다.
  const workflow = {};

  workflow.STAGES = [
    { no: 1, label: '입찰현황 파악', gate: null },
    { no: 2, label: '입찰상황 발생', gate: null },
    { no: 3, label: 'RFI 공시', gate: null },
    { no: 4, label: 'RFI 분석', gate: null },
    { no: 5, label: '제안서 기획', gate: '기획승인' },
    { no: 6, label: '세부기획(3팀)', gate: null },
    { no: 7, label: '취합', gate: '이관결재' },
    { no: 8, label: '검토', gate: '최종결재' },
    { no: 9, label: '제출', gate: null },
  ];

  workflow.stepperModel = function (status) {
    const stage = Number(status && status.stage) || 1;
    const pending = status && status.pending_gate;
    return workflow.STAGES.map(function (s) {
      let state = s.no < stage ? 'done' : (s.no === stage ? 'current' : 'todo');
      if (pending && s.gate === pending) state = 'gate';
      return { no: s.no, label: s.label, gate: s.gate, state: state };
    });
  };

  // 실행 버튼 활성 조건 — 이미 돌고 있거나 결재 대기 중이거나 제출까지 끝났으면 못 누른다.
  workflow.runnable = function (status) {
    if (!status) return false;
    return !status.running && !status.pending_gate && Number(status.stage) < 9;
  };

  workflow.teamCards = function (status) {
    const tasks = (status && status.tasks) || [];
    return tasks.map(function (t) {
      return {
        team: t.team, status: t.status, progress_pct: t.progress_pct,
        assignee: t.assignee || null, taskId: t.task_id || null,
        label: t.team + ' · ' + (t.assignee || '미배정'),
      };
    });
  };

  // ok=작성 완료, gap=담당팀은 있는데 미충족, none=아무도 안 맡음
  workflow.coverageRows = function (payload) {
    return ((payload && payload.criteria) || []).map(function (c) {
      return {
        item: c.item, category: c.category, score: c.score, team: c.team || null,
        covered: !!c.covered, gapNote: c.gap_note || null, piiCount: c.pii_count || 0,
        state: c.covered ? 'ok' : (c.team ? 'gap' : 'none'),
      };
    });
  };

  workflow.coverageSummary = function (payload) {
    const rows = workflow.coverageRows(payload);
    let covered = 0, coveredScore = 0, piiTotal = 0;
    rows.forEach(function (r) {
      if (r.covered) { covered += 1; coveredScore += Number(r.score) || 0; }
      piiTotal += r.piiCount;
    });
    return {
      total: rows.length, covered: covered, coveredScore: coveredScore,
      totalScore: (payload && payload.total_score) || 0, piiTotal: piiTotal,
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = workflow;
  else root.workflow = workflow;
})(typeof self !== 'undefined' ? self : this);
