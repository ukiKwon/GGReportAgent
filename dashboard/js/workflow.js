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

  // ── 렌더 ────────────────────────────────────────────────────────────
  function esc(s) {
    return (root.logic && root.logic.esc) ? root.logic.esc(s) : String(s == null ? '' : s);
  }

  workflow.renderPanel = function (el, status, coverage) {
    const steps = workflow.stepperModel(status).map(function (s) {
      return '<div class="wf-step ' + s.state + '"><b>' + s.no + '</b>' +
        esc(s.label) + (s.gate ? '<i class="wf-gate">🛑 ' + esc(s.gate) + '</i>' : '') + '</div>';
    }).join('');
    const cards = workflow.teamCards(status).map(function (c) {
      return '<div class="wf-card" data-task-id="' + esc(c.taskId || '') + '"><b>' + esc(c.label) + '</b>' +
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

  // ── 배선 ────────────────────────────────────────────────────────────
  const POLL_MS = 2000;
  let pollTimer = null;
  let selectedId = null;
  let lastStatus = null;

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
    ]).then(function (res) {
      if (selectedId !== id) return;               // 폴링 중 기관이 바뀌었으면 버린다
      lastStatus = res[0];
      workflow.renderPanel(el('wf-panel'), res[0], res[1]);
      syncButtons();
      // 돌고 있을 때만 계속 본다 — 멈춰 있으면 폴링도 멈춘다.
      if (!res[0].running) stopPolling();
    }).catch(function (e) {
      stopPolling();
      el('wf-panel').innerHTML = '<p class="wf-empty">현황을 불러오지 못했습니다 — ' + esc(e.message) + '</p>';
    });
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
