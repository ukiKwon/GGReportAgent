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

  // counts는 선택 인자(stageCounts 결과) — 없으면 전부 0이라 기존 호출부가 그대로 돈다.
  workflow.stepperModel = function (status, counts) {
    const stage = Number(status && status.stage) || 1;
    const pending = status && status.pending_gate;
    const c = counts || {};
    return workflow.STAGES.map(function (s) {
      let state = s.no < stage ? 'done' : (s.no === stage ? 'current' : 'todo');
      if (pending && s.gate === pending) state = 'gate';
      return { no: s.no, label: s.label, gate: s.gate, state: state, count: c[s.no] || 0 };
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

  // 역할 표기: 영문 role은 그대로 두고 옆에 한글 부제를 단다(사용자 요청).
  // agent는 무슨 일을 하는지가 팀에서 나오고, 사람은 실명(author)이 곧 부제다.
  workflow.ROLE_SUB = { orchestrator: '총괄 agent' };
  const HUMAN_ROLES = ['human', 'user'];

  workflow.roleLabel = function (role, ctx) {
    const c = ctx || {};
    if (workflow.ROLE_SUB[role]) return { main: role, sub: workflow.ROLE_SUB[role] };
    if (role === 'agent') return { main: role, sub: (c.team ? c.team + ' agent' : '실무 agent') };
    if (HUMAN_ROLES.indexOf(role) >= 0) return { main: role, sub: c.author || c.assignee || '담당자' };
    return { main: role, sub: null };   // 알림 kind(결재요청 등)는 그 자체가 설명이다
  };

  workflow.stageEvents = function (timeline, stageNo) {
    return ((timeline && timeline.events) || []).filter(function (e) {
      return Number(e.stage) === Number(stageNo);
    });
  };

  workflow.stageCounts = function (timeline) {
    const out = {};
    ((timeline && timeline.events) || []).forEach(function (e) {
      if (e.stage == null) return;      // 단계 미상(구버전 행)은 스테퍼에 세지 않는다
      out[e.stage] = (out[e.stage] || 0) + 1;
    });
    return out;
  };

  // GET /tasks/{id} 응답(TaskDetail)의 지시·보고 로그. 서버가 이미 시간순으로 준다.
  workflow.logRows = function (detail) {
    return ((detail && detail.messages) || []).map(function (m) {
      return { role: m.role, content: m.content, at: m.created_at, author: m.author || null };
    });
  };

  // ── 렌더 ────────────────────────────────────────────────────────────
  function esc(s) {
    return (root.logic && root.logic.esc) ? root.logic.esc(s) : String(s == null ? '' : s);
  }

  workflow.renderPanel = function (el, status, coverage, timeline) {
    const counts = workflow.stageCounts(timeline);
    const steps = workflow.stepperModel(status, counts).map(function (s) {
      return '<div class="wf-step ' + s.state + '" data-stage="' + s.no + '"><b>' + s.no + '</b>' +
        esc(s.label) + (s.gate ? '<i class="wf-gate">🛑 ' + esc(s.gate) + '</i>' : '') +
        (s.count ? '<i class="wf-cnt">' + s.count + '</i>' : '') + '</div>';
    }).join('');
    const cards = workflow.teamCards(status).map(function (c) {
      return '<div class="wf-card" data-task-id="' + esc(c.taskId || '') + '"' +
        ' data-team="' + esc(c.team || '') + '"><b>' + esc(c.label) + '</b>' +
        '<span>' + esc(c.status) + ' · ' + (c.progress_pct || 0) + '%</span></div>';
    }).join('') || '<p class="wf-empty">아직 배정된 작업이 없습니다.</p>';
    const sum = workflow.coverageSummary(coverage || {});
    el.innerHTML =
      '<div class="wf-stepper">' + steps + '</div>' +
      '<div class="wf-state">' + (status.running ? '⏳ 실행 중' :
        status.pending_gate ? '🛑 ' + esc(status.pending_gate) + ' 대기' :
        status.failed ? '⚠️ 실패 — 실행을 다시 시도하세요' : '대기') + '</div>' +
      '<div class="wf-cards">' + cards + '</div>' +
      '<div class="wf-sum">배점표 ' + sum.covered + '/' + sum.total + '항목 · ' +
        sum.coveredScore + '/' + sum.totalScore + '점' +
        (sum.piiTotal ? ' · ⚠️ 개인정보 ' + sum.piiTotal + '건' : '') + '</div>';
  };

  const COV_LABEL = { ok: '작성됨', gap: '미충족', none: '미배정' };

  workflow.renderCoverage = function (el, coverage) {
    const rows = workflow.coverageRows(coverage);
    if (!rows.length) {
      el.innerHTML = '<p class="wf-empty">배점표가 아직 없습니다 — 3단계(RFI 공시·배점표 추출) 이후에 표시됩니다.</p>';
      return;
    }
    const sum = workflow.coverageSummary(coverage);
    el.innerHTML =
      '<div class="wf-sum">배점표 매핑 — 작성 ' + sum.covered + '/' + sum.total + '항목 · ' +
        sum.coveredScore + '/' + sum.totalScore + '점' +
        (sum.piiTotal ? ' · ⚠️ 개인정보 ' + sum.piiTotal + '건' : '') + '</div>' +
      '<table class="wf-cov"><thead><tr><th>평가항목</th><th>분류</th><th>배점</th>' +
      '<th>담당팀</th><th>상태</th><th>개인정보</th><th>비고</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr class="' + r.state + '"><td>' + esc(r.item) + '</td>' +
          '<td>' + esc(r.category == null ? '-' : r.category) + '</td>' +
          '<td>' + esc(r.score == null ? '-' : r.score) + '</td>' +
          '<td>' + esc(r.team || '-') + '</td>' +
          '<td><span class="wf-badge ' + r.state + '">' + COV_LABEL[r.state] + '</span></td>' +
          '<td>' + (r.piiCount ? '⚠️ ' + r.piiCount : '-') + '</td>' +
          '<td>' + esc(r.gapNote || '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  };

  // 로그 한 줄: "role <부제> · 시각" + 본문. 팀 로그와 단계 상세가 같은 형식을 쓴다.
  function logLines(rows, ctx) {
    return rows.map(function (r) {
      const lb = workflow.roleLabel(r.role, {
        team: r.team || (ctx && ctx.team) || null,
        author: r.author, assignee: ctx && ctx.assignee,
      });
      return '<div class="wf-log-row"><div class="wf-who">' + esc(lb.main) +
        (lb.sub ? '<span class="wf-sub">' + esc(lb.sub) + '</span>' : '') +
        ' · ' + esc(r.at) + '</div><pre>' + esc(r.content) + '</pre></div>';
    }).join('');
  }

  function logShell(title, body) {
    return '<div class="wf-log"><div class="wf-log-title">■ ' + esc(title) + '</div>' + body + '</div>';
  }

  workflow.renderLog = function (el, detail, ctx) {
    const rows = workflow.logRows(detail);
    const team = (ctx && ctx.team) || (detail && detail.team) || '작업';
    if (!rows.length) {
      el.innerHTML = logShell(team + ' 작업 로그',
        '<p class="wf-empty">이 작업에는 아직 기록된 지시·보고가 없습니다.</p>');
      return;
    }
    el.innerHTML = logShell(team + ' 작업 로그', logLines(rows, ctx));
  };

  // 스테퍼 단계를 눌렀을 때 — 팀 로그와 같은 자리(#wf-log)를 제목으로 구분해 나눠 쓴다.
  workflow.renderStageLog = function (el, timeline, stageNo) {
    const step = workflow.STAGES.filter(function (s) { return s.no === Number(stageNo); })[0];
    const title = stageNo + '단계 「' + (step ? step.label : '?') + '」 수행 내용';
    const rows = workflow.stageEvents(timeline, stageNo);
    if (!rows.length) {
      el.innerHTML = logShell(title, '<p class="wf-empty">이 단계에는 아직 기록이 없습니다.</p>');
      return;
    }
    el.innerHTML = logShell(title, logLines(rows, null));
  };

  // ── 배선 ────────────────────────────────────────────────────────────
  const POLL_MS = 2000;
  let pollTimer = null;
  let selectedId = null;
  let lastStatus = null;
  let selectedTaskId = null;
  let selectedStage = null;      // 팀 카드 선택과 상호배타 — 로그 영역을 공유하기 때문
  let lastTimeline = null;

  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  function startPolling() { stopPolling(); pollTimer = setInterval(function () { refresh(); }, POLL_MS); }

  // 모든 fetch는 r.ok 검사 + catch — 4xx가 성공처럼 보이던 문제(계획 B 최종리뷰) 재발 방지.
  function getJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' → ' + r.status);
      return r.json();
    });
  }

  function el(id) { return document.getElementById(id); }

  function refresh() {
    if (!selectedId) return Promise.resolve();
    const id = selectedId;
    return Promise.all([
      getJson('/institutions/' + encodeURIComponent(id) + '/status'),
      getJson('/institutions/' + encodeURIComponent(id) + '/coverage-map').catch(function () {
        return { criteria: [], total_score: 0 };   // 매핑은 부가 정보 — 없어도 현황판은 뜬다
      }),
      getJson('/institutions/' + encodeURIComponent(id) + '/timeline').catch(function () {
        return { events: [] };
      }),
    ]).then(function (res) {
      if (selectedId !== id) return;               // 폴링 중 기관이 바뀌었으면 버린다
      lastStatus = res[0];
      lastTimeline = res[2];
      workflow.renderPanel(el('wf-panel'), res[0], res[1], res[2]);
      workflow.renderCoverage(el('wf-coverage'), res[1]);
      wireCards();
      wireSteps();
      syncButtons();
      // 돌고 있을 때만 계속 본다 — 멈춰 있으면 폴링도 멈춘다.
      if (!res[0].running) stopPolling();
    }).catch(function (e) {
      stopPolling();
      el('wf-panel').innerHTML = '<p class="wf-empty">현황을 불러오지 못했습니다 — ' + esc(e.message) + '</p>';
    });
  }

  // 팀 카드 클릭 → 그 task의 지시·보고 로그. 폴링으로 카드가 다시 그려져도 선택은 유지된다.
  function wireCards() {
    let stillThere = false;
    el('wf-panel').querySelectorAll('.wf-card').forEach(function (card) {
      const taskId = card.dataset.taskId;
      if (!taskId) return;
      // toggle이어야 한다 — add만 하면 다른 카드를 눌러도 이전 선택이 안 꺼진다.
      const on = taskId === selectedTaskId;
      card.classList.toggle('hi', on);
      if (on) stillThere = true;
      card.onclick = function () { openLog(taskId); };
    });
    if (selectedTaskId && !stillThere) { selectedTaskId = null; el('wf-log').innerHTML = ''; }
  }

  function openLog(taskId) {
    selectedTaskId = taskId;
    selectedStage = null;                   // 로그 영역은 하나 — 단계 선택은 해제한다
    const card = el('wf-panel').querySelector('.wf-card[data-task-id="' + taskId + '"]');
    const team = card ? card.dataset.team : null;
    getJson('/tasks/' + encodeURIComponent(taskId)).then(function (detail) {
      if (selectedTaskId !== taskId) return;
      workflow.renderLog(el('wf-log'), detail, { team: team, assignee: detail.assignee });
      wireCards(); wireSteps();
    }).catch(function (e) {
      el('wf-log').innerHTML = '<p class="wf-empty">로그를 불러오지 못했습니다 — ' + esc(e.message) + '</p>';
    });
  }

  // 스테퍼 단계 클릭 → 그 단계의 수행 내용. 이미 받아둔 timeline을 쓰므로 추가 fetch가 없다.
  function wireSteps() {
    el('wf-panel').querySelectorAll('.wf-step').forEach(function (step) {
      const no = Number(step.dataset.stage);
      step.classList.toggle('sel', no === selectedStage);
      step.onclick = function () { openStage(no); };
    });
  }

  function openStage(stageNo) {
    selectedStage = stageNo;
    selectedTaskId = null;                  // 팀 카드 선택 해제(상호배타)
    workflow.renderStageLog(el('wf-log'), lastTimeline, stageNo);
    wireCards(); wireSteps();
  }

  function syncButtons() {
    const run = el('wf-run'), ok = el('wf-approve'), no = el('wf-reject');
    if (!run) return;
    run.disabled = !workflow.runnable(lastStatus);
    const gated = !!(lastStatus && lastStatus.pending_gate);
    ok.disabled = !gated; no.disabled = !gated;
  }

  function act(url, body) {
    const opts = { method: 'POST' };
    if (body) {
      opts.headers = { 'Content-Type': 'application/json', 'X-User-Id': 'web-user' };
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (r) {
      if (!r.ok) { alert('요청 실패 (' + r.status + ')'); return; }
      return refresh().then(startPolling);        // 액션 직후에는 잠시 따라붙는다
    }).catch(function () { alert('서버 연결 실패 — 처리되지 않았습니다.'); });
  }

  function renderControls() {
    const rows = (root.store && root.store.loadData() || []).filter(function (r) { return r.institutionId; });
    el('wf-controls').innerHTML =
      '<select id="wf-inst"><option value="">기관 선택…</option>' +
      rows.map(function (r) {
        return '<option value="' + esc(r.institutionId) + '">' + esc(r.name) + '</option>';
      }).join('') + '</select>' +
      '<button id="wf-run">▶ 실행</button>' +
      '<input id="wf-by" placeholder="결재자 이름" size="10">' +
      '<input id="wf-comment" placeholder="의견(선택)" size="20">' +
      '<button id="wf-approve">승인</button>' +
      '<button id="wf-reject">반려</button>';
    if (!rows.length) {
      el('wf-panel').innerHTML = '<p class="wf-empty">서버에 등록된 기관이 없습니다 — CSV 반입 후 다시 여세요.</p>';
    }

    el('wf-inst').onchange = function () {
      selectedId = this.value || null;
      lastStatus = null;
      lastTimeline = null;
      selectedTaskId = null;
      selectedStage = null;
      el('wf-log').innerHTML = '';
      if (!selectedId) { stopPolling(); el('wf-panel').innerHTML = ''; el('wf-coverage').innerHTML = ''; return; }
      refresh().then(function () { if (lastStatus && lastStatus.running) startPolling(); });
    };
    el('wf-run').onclick = function () {
      if (!selectedId) return;
      act('/institutions/' + encodeURIComponent(selectedId) + '/run', null);
    };
    function checkpoint(approved) {
      if (!selectedId) return;
      // X-User-Id는 ASCII만 허용(브라우저 헤더 제약) — 한글 결재자명은 body의 by로 보낸다.
      act('/institutions/' + encodeURIComponent(selectedId) + '/checkpoint', {
        approved: approved,
        comment: el('wf-comment').value || null,
        by: el('wf-by').value || null,
      });
    }
    el('wf-approve').onclick = function () { checkpoint(true); };
    el('wf-reject').onclick = function () { checkpoint(false); };
    syncButtons();
  }

  workflow.mount = function () {
    renderControls();
    if (selectedId) {
      const sel = el('wf-inst');
      if (sel) sel.value = selectedId;
      refresh().then(function () { if (lastStatus && lastStatus.running) startPolling(); });
    }
  };

  // 비활성 탭에서는 폴링을 멈춘다(브라우저가 백그라운드 타이머를 스로틀하는 것과 무관하게 명시적으로).
  workflow.unmount = function () { stopPolling(); };

  if (typeof module !== 'undefined' && module.exports) module.exports = workflow;
  else root.workflow = workflow;
})(typeof self !== 'undefined' ? self : this);
