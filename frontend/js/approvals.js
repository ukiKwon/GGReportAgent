(function (root) {
  'use strict';
  // 결재함 (계획 I Task 5) — 그 역할이 결재할 것만 모아 보여준다.
  //
  // 결재 라인(사용자 확정): 팀원 → **그 팀의 팀장**,
  //                          디자이너 → **영업팀장** → **영업부장**(최종, 흐름 종료).
  // 영업부장 화면에는 워크플로가 없으므로 결재에 필요한 맥락(기관·단계·작성물·파일)이
  // **카드 하나에 다 있어야 한다** — 서버가 그렇게 실어 준다.
  const approvals = {};

  const designer = (typeof require !== 'undefined') ? require('./designer.js') : root.designer;

  approvals.rows = function (payload) {
    return (((payload || {}).items) || []).map(function (it) {
      const isTask = it.kind === 'task';
      return {
        kind: it.kind,
        taskId: it.task_id || null,
        institutionId: it.institution_id,
        // 제목 하나로 "어느 기관의 무엇인지"가 읽혀야 한다.
        title: it.institution_name + ' · ' + (isTask ? it.team : it.gate),
        gate: it.gate || null,
        team: it.team || null,
        stage: it.stage,
        author: isTask ? (it.assignee || null) : null,
        content: isTask ? (it.draft_content || '') : '',
        files: isTask ? designer.fileRows(it.files) : [],
        // 같은 디자이너 작업이 팀장(1차)과 부장(최종) 결재함에 각각 뜬다. 어느
        // 쪽인지는 서버가 정해 준다 — 화면이 상태 문자열을 다시 해석하지 않는다.
        final: !!it.final,
      };
    });
  };

  approvals.kindLabel = function (item) {
    if (!item) return '작업물 결재';
    if (item.kind === 'gate') return item.gate || '결재';
    return item.final ? '최종 결재' : '작업물 결재';
  };

  // 작업과 게이트는 부르는 곳이 다르다 — 같은 카드로 보이지만 뒤는 다른 흐름이다.
  approvals.endpoint = function (row) {
    if (!row) return '';
    return row.kind === 'gate'
      ? '/institutions/' + encodeURIComponent(row.institutionId) + '/checkpoint'
      : '/tasks/' + encodeURIComponent(row.taskId) + '/approve';
  };

  approvals.canDecide = function (profile) {
    // 결재자로 남을 이름이 없으면 "누가 봤는지"가 기록에서 사라진다.
    return !!((profile || {}).name || '').trim();
  };

  approvals.summary = function (payload) {
    const n = (((payload || {}).items) || []).length;
    return n ? '결재 대기 ' + n + '건' : '결재할 것이 없습니다.';
  };

  // ── 렌더·배선 ───────────────────────────────────────────────────────
  function esc(s) {
    if (root.logic && root.logic.esc) return root.logic.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }

  let payload = null;
  let busy = false;

  approvals.render = function (container, data, profile) {
    const rows = approvals.rows(data);
    if (!rows.length) {
      container.innerHTML = '<p class="wf-empty">결재할 것이 없습니다.</p>';
      return;
    }
    const locked = !approvals.canDecide(profile);
    container.innerHTML = rows.map(function (r, i) {
      const files = r.files.length
        ? '<div class="dg-team-files">' + r.files.map(function (f) {
            return '<a href="#" class="ap-dl" data-index="' + i + '" data-name="' +
              esc(f.name) + '">⬇ ' + esc(f.name) + '</a>' +
              '<span class="dg-size">' + esc(f.sizeText) + '</span>';
          }).join('') + '</div>'
        : '';
      return '<div class="ap-card"><div class="ap-head"><b>' + esc(r.title) + '</b>' +
        '<span class="dg-tag sent">' + esc(approvals.kindLabel(data.items[i])) + '</span>' +
        '<span class="dg-who">' + esc(r.stage) + '단계' +
        (r.author ? ' · ' + esc(r.author) : '') + '</span></div>' +
        (r.content ? '<pre class="dg-body">' + esc(r.content) + '</pre>' : '') + files +
        '<div class="ap-act"><input class="ap-comment" data-index="' + i +
        '" placeholder="의견(반려 시 사유)">' +
        '<button class="ap-ok" data-index="' + i + '"' + (locked ? ' disabled' : '') +
        '>승인</button>' +
        '<button class="ap-no" data-index="' + i + '"' + (locked ? ' disabled' : '') +
        '>반려</button></div></div>';
    }).join('') +
      (locked ? '<p class="dg-why">상단에서 이름을 먼저 입력하세요 — 결재자 이름이 기록에 남습니다.</p>' : '');
  };

  function decide(index, approved) {
    const rows = approvals.rows(payload);
    const row = rows[index];
    const comment = (el('ap-list').querySelector('.ap-comment[data-index="' + index + '"]') || {}).value || '';
    if (!approved && !comment.trim() &&
        !confirm('사유 없이 반려하면 담당자가 무엇을 고쳐야 할지 모릅니다. 그대로 진행할까요?')) {
      return;
    }
    busy = true; paint();
    fetch(approvals.endpoint(row), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'web-user' },
      // 한글 결재자 이름은 헤더에 못 싣는다 — body의 by로 보낸다(A1 F10 관행).
      body: JSON.stringify({ approved: approved, comment: comment || null,
        by: root.store.loadProfile().name || null }),
    }).then(function (r) {
      if (!r.ok) {
        return r.json().then(function (b) {
          throw new Error(b.detail || ('처리 실패 (' + r.status + ')'));
        });
      }
      return load();
    }).catch(function (e) { alert(e.message || '서버 연결 실패 — 처리되지 않았습니다.'); })
      .then(function () { busy = false; paint(); });
  }

  function paint() {
    const profile = root.store.loadProfile();
    el('ap-role').textContent = profile.team || '(소속 없음)';
    el('ap-count').textContent = approvals.summary(payload);
    approvals.render(el('ap-list'), payload, profile);
    el('ap-list').querySelectorAll('button').forEach(function (btn) {
      if (busy) { btn.disabled = true; return; }
      btn.onclick = function () {
        decide(Number(btn.dataset.index), btn.classList.contains('ap-ok'));
      };
    });
    // 결재 카드 본문도 펴진다 — 부장 화면에는 워크플로가 없어서 이 카드가 맥락의
    // 전부인데, 근거 인용이 잘린 채 끝나면 그게 전문인 줄 알고 결재하게 된다.
    designer.wireBodyToggles(el('ap-list'));
    el('ap-list').querySelectorAll('.ap-dl').forEach(function (a) {
      a.onclick = function (e) {
        e.preventDefault();
        const row = approvals.rows(payload)[Number(a.dataset.index)];
        window.open('/tasks/' + encodeURIComponent(row.taskId) + '/files/' +
          encodeURIComponent(a.dataset.name), '_blank');
      };
    });
  }

  function load() {
    const role = (root.store.loadProfile().team || '').trim();
    if (!role) { payload = { items: [] }; paint(); return Promise.resolve(); }
    return fetch('/approvals?role=' + encodeURIComponent(role)).then(function (r) {
      if (!r.ok) throw new Error('approvals ' + r.status);
      return r.json();
    }).then(function (body) { payload = body; paint(); })
      .catch(function () {
        payload = null;
        el('ap-list').innerHTML = '<p class="wf-empty">결재 목록을 불러오지 못했습니다.</p>';
      });
  }

  approvals.mount = function () { load(); };
  approvals.unmount = function () { /* 폴링이 없어 정리할 것이 없다 */ };
  approvals.onProfileChange = function () { if (payload !== null) load(); };

  if (typeof module !== 'undefined' && module.exports) module.exports = approvals;
  else root.approvals = approvals;
})(typeof self !== 'undefined' ? self : this);
