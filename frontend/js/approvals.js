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

  // ── 결재 요청(권한 신청 등) — 결재라인 서버 /approval-requests ────────────
  // 탭은 두 개다: 내가 올린 요청(누구나 쓴다 — 팀원도 결재자가 될 수 있어 맨 앞) · 받은 결재.
  approvals.TABS = [
    { key: 'mine', label: '내가 올린 요청' },
    { key: 'inbox', label: '받은 결재' },
  ];
  approvals.normTab = function (key) {
    return approvals.TABS.some(function (t) { return t.key === key; }) ? key : approvals.TABS[0].key;
  };

  const REQ_STATUS = {
    PENDING: { label: '결재 대기', tone: 'warn' },
    APPROVED: { label: '승인·반영됨', tone: 'ok' },
    REJECTED: { label: '반려', tone: 'bad' },
    CANCELLED: { label: '취소됨', tone: 'muted' },
  };
  const STEP_STATUS = { PENDING: '대기', APPROVED: '승인', REJECTED: '반려', SKIPPED: '건너뜀' };

  approvals.statusInfo = function (status) {
    return REQ_STATUS[status] || { label: String(status || ''), tone: 'muted' };
  };

  // 결재선 한 줄 — 단계마다 "누가 · 어떤 상태". 대결로 처리됐으면 처리한 사람을 덧붙인다.
  approvals.stepChips = function (steps) {
    return (steps || []).map(function (s) {
      const who = s.approver_name || '-';
      const how = s.acted_as_deputy && s.acted_by_name ? ' (대결 ' + s.acted_by_name + ')' : '';
      return {
        text: who + how + ' · ' + (STEP_STATUS[s.status] || s.status),
        tone: s.status === 'APPROVED' ? 'ok' : s.status === 'REJECTED' ? 'bad' : s.status === 'PENDING' ? 'warn' : 'muted',
      };
    });
  };

  // 메뉴 키 → 사이드바의 현재 이름. 모르면 키 그대로.
  approvals.menuName = function (key, categories) {
    if (key === 'admin') return '시스템 관리';
    let name = null;
    (categories || []).forEach(function (cat) {
      (cat.items || []).forEach(function (it) { if (it.key === key && !name) name = it.label; });
    });
    return name || String(key || '');
  };

  // 권한 신청 내용 — 신청한 권한(✓)만 있다. 서버는 "바뀌기 전 값"을 싣지 않는다.
  approvals.changeRows = function (payload, categories) {
    return ((payload || {}).changes || []).map(function (c) {
      return { menu: approvals.menuName(c.menu, categories),
               view: !!c.view, write: !!c.write, edit: !!c.edit, approve: !!c.approve };
    });
  };

  // UTC ISO → 한국시간 'YYYY-MM-DD HH:mm'. 읽을 수 없으면 원문.
  approvals.formatTime = function (iso) {
    const t = Date.parse(String(iso || ''));
    if (isNaN(t)) return String(iso || '');
    return new Date(t + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);
  };

  // 서버의 요청 한 건 → 카드 모델. 어디까지 눌러도 되는지는 서버가 정한다(can_decide·can_cancel).
  approvals.requestRows = function (items, categories) {
    return (items || []).map(function (it) {
      const st = approvals.statusInfo(it.status);
      return {
        id: it.req_id,
        typeLabel: it.type_label || '',
        title: it.title || '',
        requester: (it.requester_name || '') + (it.requester_position ? '(' + it.requester_position + ')' : ''),
        statusLabel: st.label,
        tone: st.tone,
        when: approvals.formatTime(it.created_at),
        reason: ((it.payload || {}).reason) || '',
        changes: approvals.changeRows(it.payload, categories),
        chips: approvals.stepChips(it.steps),
        note: it.status === 'REJECTED' || it.status === 'CANCELLED' ? (it.result_note || '') : '',
        canDecide: !!it.can_decide,
        deputy: !!it.acting_as_deputy,
        canCancel: !!it.can_cancel,
      };
    });
  };

  // 받은 결재 탭의 안내 — 결재 권한이 없으면 숨기지 않고 이유만 알려준다.
  approvals.inboxNotice = function (canApprove, count) {
    if (count > 0) return '';
    return canApprove ? '결재할 것이 없습니다.'
      : '결재 권한이 없어 받은 결재가 없습니다. 권한이 필요하면 [내 정보 › 내 권한]에서 신청하세요.';
  };

  approvals.decisionBody = function (approve, comment) {
    const c = String(comment || '').trim();
    return { decision: approve ? 'APPROVE' : 'REJECT', comment: c || null };
  };
  approvals.decisionError = function (approve, comment) {
    return !approve && !String(comment || '').trim() ? '반려 사유를 입력하세요.' : '';
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

  // ── 결재 요청 탭(내가 올린 요청 · 받은 결재) ───────────────────────────
  let tab = approvals.TABS[0].key;
  const reqs = { mine: null, inbox: null };   // null = 아직 못 불렀다
  let reqError = '';
  let canApprove = true;                       // /approval-requests/my-perms — 모르면 안내를 띄우지 않는다

  function categories() { return root.nav && root.nav.CATEGORIES; }

  function getJson(url) {
    return fetch(url).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          const e = new Error(j.detail || ('요청에 실패했습니다 (' + r.status + ')'));
          e.status = r.status;
          throw e;
        }
        return j;
      });
    });
  }

  function chipsHtml(chips) {
    return '<div class="ap-chips">' + chips.map(function (c, i) {
      return (i ? '<i>→</i>' : '') + '<span class="ad-badge ' + c.tone + '">' + esc(c.text) + '</span>';
    }).join('') + '</div>';
  }

  function changesHtml(rows) {
    if (!rows.length) return '';
    function mark(v) { return v ? '✓' : '–'; }
    return '<table class="ad-table ap-changes"><thead><tr><th>메뉴</th><th>조회</th><th>작성</th><th>수정</th><th>결재</th></tr></thead><tbody>' +
      rows.map(function (c) {
        return '<tr><th>' + esc(c.menu) + '</th><td>' + mark(c.view) + '</td><td>' + mark(c.write) + '</td><td>' +
          mark(c.edit) + '</td><td>' + mark(c.approve) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function requestCardHtml(r, mode) {
    const head = '<div class="ap-head"><b>' + esc(mode === 'inbox' ? r.requester + ' · ' + r.title : r.title) + '</b>' +
      '<span class="ad-badge ' + r.tone + '">' + esc(r.statusLabel) + '</span>' +
      '<span class="dg-who">' + esc(r.when) + '</span></div>';
    let act = '';
    if (mode === 'inbox' && r.canDecide) {
      act = '<div class="ap-act"><input class="ap-comment" data-id="' + esc(r.id) + '" placeholder="의견(반려 시 사유 필수)">' +
        '<button class="ap-req-ok" data-id="' + esc(r.id) + '">승인</button>' +
        '<button class="ap-req-no" data-id="' + esc(r.id) + '">반려</button>' +
        (r.deputy ? '<span class="dg-who">대결로 처리</span>' : '') + '</div>';
    } else if (mode === 'mine' && r.canCancel) {
      act = '<div class="ap-act"><button class="ap-req-cancel" data-id="' + esc(r.id) + '">취소</button></div>';
    }
    return '<div class="ap-card ap-req" data-id="' + esc(r.id) + '">' + head + changesHtml(r.changes) +
      (r.reason ? '<div class="dg-who">사유: ' + esc(r.reason) + '</div>' : '') + chipsHtml(r.chips) +
      (r.note ? '<div class="dg-who">' + esc(r.note) + '</div>' : '') + act + '<div class="ap-err" role="alert"></div></div>';
  }

  function paintRequests() {
    const mineRows = approvals.requestRows((reqs.mine || {}).items, categories());
    const inboxRows = approvals.requestRows((reqs.inbox || {}).items, categories());
    const taskCount = (((payload || {}).items) || []).length;
    const inboxCount = inboxRows.length + taskCount;
    const mineOpen = mineRows.filter(function (r) { return r.canCancel; }).length;

    el('ap-tabs').innerHTML = approvals.TABS.map(function (t) {
      const n = t.key === 'mine' ? mineOpen : inboxCount;
      return '<button type="button" role="tab" class="' + (t.key === tab ? 'on' : '') + '" data-tab="' + t.key + '">' +
        esc(t.label) + (n ? '<span class="ap-badge">' + n + '</span>' : '') + '</button>';
    }).join('');
    el('ap-tabs').querySelectorAll('button').forEach(function (b) {
      b.onclick = function () { tab = approvals.normTab(b.dataset.tab); paintRequests(); };
    });
    el('ap-pane-mine').style.display = tab === 'mine' ? '' : 'none';
    el('ap-pane-inbox').style.display = tab === 'inbox' ? '' : 'none';

    const err = reqError ? '<p class="wf-empty">' + esc(reqError) + '</p>' : '';
    el('ap-pane-mine').innerHTML = err || (mineRows.length
      ? mineRows.map(function (r) { return requestCardHtml(r, 'mine'); }).join('')
      : (reqs.mine ? '<p class="wf-empty">올린 요청이 없습니다. [내 정보 › 내 권한]에서 권한을 신청할 수 있습니다.</p>' : ''));
    el('ap-req-inbox').innerHTML = err ||
      (inboxRows.length ? '<div class="ap-sec">권한 신청 요청</div>' +
        inboxRows.map(function (r) { return requestCardHtml(r, 'inbox'); }).join('') : '');
    el('ap-sec-tasks').style.display = taskCount ? '' : 'none';
    const notice = reqs.inbox && !err ? approvals.inboxNotice(canApprove, inboxCount) : '';
    el('ap-notice').innerHTML = notice ? '<p class="wf-empty">' + esc(notice) + '</p>' : '';

    el('ap-pane-mine').querySelectorAll('.ap-req-cancel').forEach(function (b) {
      b.onclick = function () { act(b, '/approval-requests/' + encodeURIComponent(b.dataset.id) + '/cancel', undefined); };
    });
    el('ap-req-inbox').querySelectorAll('.ap-req-ok,.ap-req-no').forEach(function (b) {
      b.onclick = function () {
        const approve = b.classList.contains('ap-req-ok');
        const card = b.closest('.ap-req');
        const comment = card.querySelector('.ap-comment').value;
        const bad = approvals.decisionError(approve, comment);
        if (bad) { card.querySelector('.ap-err').textContent = bad; return; }
        act(b, '/approval-requests/' + encodeURIComponent(b.dataset.id) + '/decide',
          approvals.decisionBody(approve, comment));
      };
    });
  }

  // 한 번에 하나만 — 처리 중에는 그 카드의 버튼을 잠근다. 실패하면 카드 안에 이유를 띄운다.
  function act(btn, url, body) {
    const card = btn.closest('.ap-req');
    card.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
    const init = { method: 'POST' };
    if (body !== undefined) { init.headers = { 'Content-Type': 'application/json' }; init.body = JSON.stringify(body); }
    fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.detail || ('처리하지 못했습니다 (' + r.status + ')'));
      });
    }).then(function () { return loadRequests(); })
      .catch(function (e) {
        card.querySelectorAll('button').forEach(function (x) { x.disabled = false; });
        card.querySelector('.ap-err').textContent = e.message || '서버 연결 실패 — 처리되지 않았습니다.';
      });
  }

  function loadRequests() {
    return Promise.all([
      getJson('/approval-requests?box=mine'),
      getJson('/approval-requests?box=inbox'),
      getJson('/approval-requests/my-perms').catch(function () { return null; }),
    ]).then(function (res) {
      reqs.mine = res[0]; reqs.inbox = res[1]; reqError = '';
      canApprove = res[2] ? !!res[2].can_approve : true;
      paintRequests();
    }).catch(function (e) {
      reqError = e && e.status === 401 ? '로그인이 필요합니다. 사번으로 로그인해 주세요.'
        : (e && e.status === 403 ? '이 계정으로는 결재함을 쓸 수 없습니다.' : '결재 요청을 불러오지 못했습니다.');
      reqs.mine = null; reqs.inbox = null;
      paintRequests();
    });
  }

  // 쪽지함의 결재 쪽지가 "이 탭으로 열어 달라"고 미리 알려 둔다. 한 번 쓰면 비운다.
  let wantTab = null;
  approvals.openTab = function (key) { wantTab = approvals.normTab(key); };

  approvals.mount = function () {
    tab = wantTab || approvals.TABS[0].key;
    wantTab = null;
    load().then(paintRequests);
    loadRequests();             // 대결 설정은 결재함이 아니라 [내 정보 › 대결 설정]에 있다
  };
  approvals.unmount = function () { /* 폴링이 없어 정리할 것이 없다 */ };
  approvals.onProfileChange = function () {
    if (payload !== null) load().then(paintRequests);
    loadRequests();
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = approvals;
  else root.approvals = approvals;
})(typeof self !== 'undefined' ? self : this);
