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
  const errtext = (typeof require !== 'undefined') ? require('./errtext.js') : root.errtext;

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
  // 처음 열 때 받은 결재에 지금 결재할 수 있는 건이 있으면 그 탭으로 연다(rows: requestRows 결과).
  approvals.defaultTab = function (inboxRows) {
    return (inboxRows || []).some(function (r) { return r && r.canDecide; }) ? 'inbox' : approvals.TABS[0].key;
  };
  // 결재를 마친 뒤 포커스를 어디로 보낼지: 다음 카드의 첫 버튼('card'), 없으면 '받은 결재' 탭('tab').
  approvals.focusAfterDecide = function (inboxRows) {
    return (inboxRows || []).some(function (r) { return r && r.canDecide && (!r.isBoard || r.materialId); }) ? 'card' : 'tab';
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

  // 권한 신청 내용 — 신청값과, 있으면 상신 시점의 본인 유효 권한(before). 옛 요청에는 before가 없다.
  approvals.changeRows = function (payload, categories) {
    return ((payload || {}).changes || []).map(function (c) {
      const row = { menu: approvals.menuName(c.menu, categories),
               view: !!c.view, write: !!c.write, edit: !!c.edit, approve: !!c.approve };
      if (c.before && typeof c.before === 'object') {
        row.before = { view: !!c.before.view, write: !!c.before.write,
                       edit: !!c.before.edit, approve: !!c.before.approve };
      }
      return row;
    });
  };

  // 한 행(조회·작성·수정·결재) → 칸 4개. before 없으면 state 'none'(기존 ✓/–).
  // 있으면 on(꺼짐→켜짐 ＋), off(켜짐→꺼짐 －), same(유지). 색 외에 기호·글자로도 구분한다.
  approvals.changeCells = function (change) {
    const c = change || {};
    return ['view', 'write', 'edit', 'approve'].map(function (f) {
      const now = !!c[f];
      if (!c.before) return { field: f, state: 'none', mark: now ? '✓' : '–', text: '' };
      const was = !!c.before[f];
      if (!was && now) return { field: f, state: 'on', mark: '＋', text: '켜짐' };
      if (was && !now) return { field: f, state: 'off', mark: '－', text: '꺼짐' };
      return { field: f, state: 'same', mark: now ? '✓' : '–', text: '유지' };
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
        targets: approvals.assigneeLines(it),
        nomineeLine: approvals.nomineeText(it),
        changes: approvals.changeRows(it.payload, categories),
        chips: approvals.stepChips(it.steps),
        note: it.status === 'REJECTED' || it.status === 'CANCELLED' ? (it.result_note || '') : '',
        canDecide: !!it.can_decide,
        deputy: !!it.acting_as_deputy,
        canCancel: !!it.can_cancel,
        // 이사회 자료 제출(BOARD_SUBMIT): 자료를 열어 보고 결재한다 — 카드에서 바로 승인·반려하지 않는다
        isBoard: it.req_type === 'BOARD_SUBMIT',
        materialId: it.req_type === 'BOARD_SUBMIT' ? String(((it.payload || {}).material_id) == null ? '' : (it.payload || {}).material_id) : '',
        snapNo: it.req_type === 'BOARD_SUBMIT' ? (Number((it.payload || {}).snap_no) || 0) : 0,
      };
    });
  };

  // 결재함 화면·버튼 식별자 — 서버 BoardUiIds 허용 목록과 같은 이름. 승인·반려·회수·검토 열기에 싣는다(감사 기록).
  const AP_UI = { INBOX: 'approvals_inbox', MINE: 'approvals_mine' };
  const AP_BTN = { APPROVE: 'approve', REJECT: 'reject', CANCEL: 'cancel_request', REVIEW: 'review_open' };
  approvals.UI = AP_UI;
  approvals.BTN = AP_BTN;
  approvals.headers = function (screen, button, json) {
    const h = { 'X-Screen-Id': screen, 'X-Button-Id': button };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  };
  // board-material.js 의 검토 화면 도우미. 스크립트 순서상 이 파일이 먼저 실려도 호출 시점에 찾는다(없으면 null).
  function bm() {
    if (root.boardMat) return root.boardMat;
    try { if (typeof require === 'function') return require('./board-material.js'); } catch (e) { /* 없으면 검토 화면만 못 연다 */ }
    return null;
  }

  // 담당자 변경 요청(ASSIGNEE_CHANGE)의 "누구를 추가·해제하나" 줄. 다른 유형이면 빈 배열.
  // people(추가·해제가 섞여 온다)을 사번으로 payload의 두 배열과 맞춘다. 못 찾으면 사번을 그대로 보인다.
  approvals.assigneeLines = function (item) {
    const it = item || {};
    if (it.req_type !== 'ASSIGNEE_CHANGE') return [];
    const p = it.payload || {};
    const byEmp = {};
    (it.people || []).forEach(function (x) { if (x) byEmp[String(x.emp_no)] = x; });
    function label(emp) {
      const x = byEmp[String(emp)];
      if (!x || !x.name) return String(emp);
      return x.name + (x.position_title ? '(' + x.position_title + ')' : '');
    }
    const out = [];
    [['추가', p.add_emp_nos], ['해제', p.remove_emp_nos]].forEach(function (g) {
      const list = Array.isArray(g[1]) ? g[1] : [];
      if (list.length) out.push({ kind: g[0], text: list.map(label).join(', ') });
    });
    return out;
  };

  // 위 줄들의 마크업. 이름·직급은 서버 데이터라 반드시 esc.
  approvals.targetsHtml = function (lines) {
    return (lines || []).map(function (l) {
      return '<div class="dg-who ap-target">' + esc(l.kind) + ': ' + esc(l.text) + '</div>';
    }).join('');
  };

  // 첫 개설 승인(BID_OPEN)의 "지명: 이름(직급), … · 의견: …" 글. 사번은 보이지 않는다.
  // 지명자가 없거나 다른 유형이면 빈 문자열(줄을 그리지 않는다). 이스케이프는 nomineesHtml 에서.
  approvals.nomineeText = function (item) {
    const it = item || {};
    if (it.req_type !== 'BID_OPEN') return '';
    const names = (Array.isArray(it.nominees) ? it.nominees : []).filter(function (n) {
      return n && n.name;
    }).map(function (n) {
      return n.name + (n.position ? '(' + n.position + ')' : '');
    });
    if (!names.length) return '';
    const comment = String((it.payload || {}).comment == null ? '' : (it.payload || {}).comment).trim();
    return '지명: ' + names.join(', ') + (comment ? ' · 의견: ' + comment : '');
  };

  approvals.nomineesHtml = function (text) {
    return text ? '<div class="dg-who ap-nominees">' + esc(text) + '</div>' : '';
  };

  // 내가 올린 요청 탭의 빈 상태 — 권한 신청과 담당자 변경 신청 둘 다 여기서 보인다.
  approvals.mineEmptyText = function () {
    return '올린 요청이 없습니다. 권한은 [내 정보 › 내 권한]에서, 담당자 변경은 [제안팀 구성·배정]에서 신청할 수 있습니다.';
  };

  // 받은 결재 탭의 안내 — 결재 권한이 없으면 숨기지 않고 이유만 알려준다.
  approvals.inboxNotice = function (canApprove, count) {
    if (count > 0) return '';
    return canApprove ? '결재할 것이 없습니다.'
      : '결재 권한이 없어 받은 결재가 없습니다. 권한이 필요하면 [내 정보 › 내 권한]에서 신청하세요.';
  };

  // 결재 자격 — 직급상 자격(rank_can_approve) 또는 결재함 approve 권한(can_approve) 중 하나라도 true면 자격 있음.
  // 응답이 없으면(구서버·오류) 모르는 것이므로 자격 있음으로 봐서 안내를 띄우지 않는다.
  approvals.canApproveOf = function (perms) {
    if (!perms) return true;
    return perms.rank_can_approve === true || perms.can_approve === true;
  };

  approvals.decisionBody = function (approve, comment) {
    const c = String(comment || '').trim();
    return { decision: approve ? 'APPROVE' : 'REJECT', comment: c || null };
  };
  approvals.decisionError = function (approve, comment) {
    return !approve && !String(comment || '').trim() ? '반려 사유를 입력하세요.' : '';
  };
  // 서버 오류 detail(문자열 또는 {code,message})을 화면 글로. 객체를 그대로 Error에 넣으면 "[object Object]"가 뜬다.
  approvals.errText = function (detail, fallback) { return errtext.message(detail, fallback); };

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
      container.innerHTML = '';   // 빈 안내는 #ap-notice(approvals.inboxNotice)가 한 번만 낸다
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
          throw new Error(errtext.message(b.detail, '처리 실패 (' + r.status + ')'));
        });
      }
      return load();
    }).catch(function (e) { alert(e.message || '서버 연결 실패 — 처리되지 않았습니다.'); })
      .then(function () { busy = false; paint(); });
  }

  function paint() {
    const profile = root.store.loadProfile();
    el('ap-role').textContent = (root.roles ? root.roles.roleLabel(profile.team) : profile.team) || '(소속 없음)';
    el('ap-count').textContent = approvals.rows(payload).length ? approvals.summary(payload) : '';
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
    return fetch('/approvals').then(function (r) {   // 역할은 서버가 로그인 사번으로 정한다
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
  let autoTab = false;                         // 처음 연 직후 한 번만 '받은 결재'를 기본 탭으로 고를 수 있다
  let canApprove = true;                     // /approval-requests/my-perms — 모르면 안내를 띄우지 않는다

  function categories() { return root.nav && root.nav.CATEGORIES; }

  function getJson(url) {
    return fetch(url).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          const e = new Error(errtext.message(j.detail, '요청에 실패했습니다 (' + r.status + ')'));
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
    const labels = { view: '조회', write: '작성', edit: '수정', approve: '결재' };
    const hasBefore = rows.some(function (c) { return !!c.before; });
    return '<table class="ad-table ap-changes"><thead><tr><th>메뉴</th><th>조회</th><th>작성</th><th>수정</th><th>결재</th></tr></thead><tbody>' +
      rows.map(function (c) {
        return '<tr><th>' + esc(c.menu) + '</th>' + approvals.changeCells(c).map(function (k) {
          if (k.state === 'none') return '<td>' + k.mark + '</td>';
          const tip = labels[k.field] + ' ' + k.text;
          return '<td class="ap-chg ap-chg-' + k.state + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
            k.mark + (k.state === 'same' ? '' : ' ' + k.text) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>' +
      (hasBefore ? '<div class="dg-who">＋ 새로 켜짐 · － 새로 꺼짐 · ✓/– 변화 없음(상신 시점의 현재 권한 기준)</div>' : '');
  }

  function requestCardHtml(r, mode) {
    const head = '<div class="ap-head"><b>' + esc(mode === 'inbox' ? r.requester + ' · ' + r.title : r.title) + '</b>' +
      '<span class="ad-badge ' + r.tone + '">' + esc(r.statusLabel) + '</span>' +
      '<span class="dg-who">' + esc(r.when) + '</span></div>';
    let act = '';
    let boardLine = '';
    if (r.isBoard && r.snapNo) boardLine = '<div class="dg-who">버전 <span class="mono">' + esc(r.snapNo) + '</span> 제출</div>';
    if (mode === 'inbox' && r.isBoard) {
      if (r.canDecide && r.materialId) {
        act = '<div class="ap-act"><button type="button" class="ap-review-btn" data-id="' + esc(r.id) + '" data-mat="' + esc(r.materialId) + '" data-snap="' + esc(r.snapNo) +
          '">자료 보고 결재</button>' + (r.deputy ? '<span class="dg-who">대결로 처리</span>' : '') + '</div>';
      }
    } else if (mode === 'inbox' && r.canDecide) {
      act = '<div class="ap-act"><input class="ap-comment" data-id="' + esc(r.id) + '" placeholder="의견(반려 시 사유 필수)" aria-label="의견(반려할 때 사유 필수)">' +
        '<button class="ap-req-ok" data-id="' + esc(r.id) + '">승인</button>' +
        '<button class="ap-req-no" data-id="' + esc(r.id) + '">반려</button>' +
        (r.deputy ? '<span class="dg-who">대결로 처리</span>' : '') + '</div>';
    } else if (mode === 'mine' && r.canCancel) {
      act = '<div class="ap-act"><button class="ap-req-cancel" data-id="' + esc(r.id) + '">' + (r.isBoard ? '제출 회수' : '취소') + '</button></div>';
    }
    return '<div class="ap-card ap-req" data-id="' + esc(r.id) + '">' + head + boardLine + approvals.nomineesHtml(r.nomineeLine) + approvals.targetsHtml(r.targets) + changesHtml(r.changes) +
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
      const n = t.key === 'mine' ? mineOpen : inboxCount, on = t.key === tab;
      return '<button type="button" role="tab" id="ap-tab-' + t.key + '" class="' + (on ? 'on' : '') + '" data-tab="' + t.key + '" aria-selected="' + (on ? 'true' : 'false') +
        '" aria-controls="ap-pane-' + t.key + '" tabindex="' + (on ? '0' : '-1') + '">' +
        esc(t.label) + (n ? '<span class="ap-badge">' + n + '</span>' : '') + '</button>';
    }).join('');
    el('ap-tabs').querySelectorAll('button').forEach(function (b) {
      b.onclick = function () { autoTab = false; tab = approvals.normTab(b.dataset.tab); paintRequests(); };
      b.onkeydown = function (e) {   // 좌우 화살표·Home·End 로 탭 이동(roving tabindex)
        const keys = approvals.TABS.map(function (t) { return t.key; }), i = keys.indexOf(b.dataset.tab);
        let to = null;
        if (e.key === 'ArrowRight') to = keys[(i + 1) % keys.length];
        else if (e.key === 'ArrowLeft') to = keys[(i + keys.length - 1) % keys.length];
        else if (e.key === 'Home') to = keys[0];
        else if (e.key === 'End') to = keys[keys.length - 1];
        if (to == null) return;
        e.preventDefault();
        autoTab = false; tab = approvals.normTab(to); paintRequests();
        const nb = el('ap-tab-' + tab); if (nb) nb.focus();
      };
    });
    ['mine', 'inbox'].forEach(function (k) {
      const p = el('ap-pane-' + k);
      p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', 'ap-tab-' + k);
    });
    el('ap-pane-mine').style.display = tab === 'mine' ? '' : 'none';
    el('ap-pane-inbox').style.display = tab === 'inbox' ? '' : 'none';

    const err = reqError ? '<p class="wf-empty">' + esc(reqError) + '</p>' : '';
    el('ap-pane-mine').innerHTML = err || (mineRows.length
      ? mineRows.map(function (r) { return requestCardHtml(r, 'mine'); }).join('')
      : (reqs.mine ? '<p class="wf-empty">' + esc(approvals.mineEmptyText()) + '</p>' : ''));
    el('ap-req-inbox').innerHTML = err ||
      (inboxRows.length ? '<div class="ap-sec">결재 요청</div>' +
        inboxRows.map(function (r) { return requestCardHtml(r, 'inbox'); }).join('') : '');
    el('ap-sec-tasks').style.display = taskCount ? '' : 'none';
    const notice = reqs.inbox && !err ? approvals.inboxNotice(canApprove, inboxCount) : '';
    el('ap-notice').innerHTML = notice ? '<p class="wf-empty">' + esc(notice) + '</p>' : '';

    el('ap-pane-mine').querySelectorAll('.ap-req-cancel').forEach(function (b) {
      b.onclick = function () {
        act(b, '/approval-requests/' + encodeURIComponent(b.dataset.id) + '/cancel', undefined, AP_UI.MINE, AP_BTN.CANCEL);
      };
    });
    el('ap-req-inbox').querySelectorAll('.ap-req-ok,.ap-req-no').forEach(function (b) {
      b.onclick = function () {
        const approve = b.classList.contains('ap-req-ok');
        const card = b.closest('.ap-req');
        const comment = card.querySelector('.ap-comment').value;
        const bad = approvals.decisionError(approve, comment);
        if (bad) { card.querySelector('.ap-err').textContent = bad; return; }
        act(b, '/approval-requests/' + encodeURIComponent(b.dataset.id) + '/decide',
          approvals.decisionBody(approve, comment), AP_UI.INBOX, approve ? AP_BTN.APPROVE : AP_BTN.REJECT);
      };
    });
    el('ap-req-inbox').querySelectorAll('.ap-review-btn').forEach(function (b) {
      b.onclick = function () { openReview(b.dataset.id, b.dataset.mat, Number(b.dataset.snap) || 0); };
    });
    paintReviewPane();
  }

  // ── 이사회 자료 제출 검토(결재함 탭 안) ──────────────────────────────────
  // 받은 결재 카드의 [자료 보고 결재]로 같은 탭 안에서 읽기 전용 자료를 펼치고, 아래 결재 줄에서 승인·반려한다.
  let review = null;      // {reqId, matId, snapNo, data, loading, loadErr, comment, busy, error}
  let apFlash = '';       // 결재를 마친 뒤 목록 위에 한 번 보이는 안내(role=status)

  function paneBox(id, role) {   // index.html 을 바꾸지 않고 받은 결재 탭 맨 위에 컨테이너를 만든다
    let n = el(id);
    if (!n) {
      n = document.createElement('div');
      n.id = id;
      if (role) { n.setAttribute('role', role); n.setAttribute('aria-live', 'polite'); }
      const pane = el('ap-pane-inbox');
      pane.insertBefore(n, pane.firstChild);
    }
    return n;
  }
  function clearFlash() {
    apFlash = '';
    const f = el('ap-flash'); if (f) f.innerHTML = '';
  }
  function reviewCanDecide() {
    const v = review && review.data && review.data.viewer, pid = v ? v.pending_req_id : null;
    if (pid == null) return false;
    return (((reqs.inbox || {}).items) || []).some(function (it) { return String(it.req_id) === String(pid) && !!it.can_decide; });
  }
  function paintReviewPane() {
    const flash = paneBox('ap-flash', 'status'), box = paneBox('ap-review-box');
    wireReview();
    flash.innerHTML = apFlash && !review ? '<p class="bd-m-ap-msg" id="ap-flash-msg" tabindex="-1">' + esc(apFlash) + '</p>' : '';
    const rest = ['ap-req-inbox', 'ap-sec-tasks', 'ap-list', 'ap-notice'];
    if (!review) {
      box.innerHTML = ''; box.style.display = 'none';
      rest.forEach(function (id) { if (id !== 'ap-sec-tasks') el(id).style.display = ''; });
      return;
    }
    rest.forEach(function (id) { el(id).style.display = 'none'; });
    box.style.display = '';
    const m = bm();
    if (!m) { box.innerHTML = '<p class="wf-empty" role="alert">검토 화면을 불러오지 못했습니다. 새로고침해 주세요.</p>'; return; }
    if (review.loading) {
      box.innerHTML = '<div class="bd-m-review"><button type="button" class="link-btn" data-act="rv-back">← 결재함</button>' + m.loadingHtml + '</div>';
    } else if (review.loadErr) {
      box.innerHTML = '<div class="bd-m-review"><button type="button" class="link-btn" id="ap-rv-back" data-act="rv-back">← 결재함</button>' +
        '<p class="wf-empty bd-err" id="ap-rv-loaderr" role="alert" tabindex="-1">' + esc(review.loadErr) + '</p></div>';
    } else {
      box.innerHTML = m.reviewHtml(review.data, { n: review.snapNo, canDecide: reviewCanDecide(), comment: review.comment, busy: review.busy, error: review.error });
    }
  }
  function openReview(reqId, matId, snapNo) {
    const m = bm();
    if (!m || !m.isId(matId)) return;
    review = { reqId: reqId, matId: matId, snapNo: snapNo, data: null, loading: true, loadErr: '', comment: '', busy: '', error: null };
    apFlash = '';
    paintReviewPane();
    const cur = review;
    m.loadReview(function (u, i) { return fetch(u, i); }, matId).then(function (r) {
      if (review !== cur) return;
      cur.loading = false;
      if (r.ok) cur.data = r.review;
      else cur.loadErr = r.notFound ? '담당자가 회수했거나 이미 처리된 제출입니다.' : r.error;
      paintReviewPane();
      const t = cur.loadErr ? el('ap-rv-loaderr') : el('ap-rv-title');
      if (t) t.focus();
    });
  }
  function closeReview(msg) {
    const reqId = review ? review.reqId : '';
    review = null;
    if (msg) apFlash = msg;
    paintRequests();
    if (msg) {   // 결재를 마쳤다 — 다음 카드의 첫 버튼, 없으면 '받은 결재' 탭으로
      const next = el('ap-req-inbox').querySelector('.ap-review-btn,.ap-req-ok');
      const f = next || el('ap-tab-inbox');
      if (f) f.focus();
      return;
    }
    const back = reqId ? el('ap-req-inbox').querySelector('.ap-review-btn[data-id="' + String(reqId).replace(/[^0-9A-Za-z_-]/g, '') + '"]') : null;
    const f = back || el('ap-tab-inbox');
    if (f) f.focus();
  }
  function reviewDecide(approve) {
    const m = bm();
    if (!review || review.busy || !m || !reviewCanDecide()) return;
    const cur = review, ta = el('ap-rv-comment');
    const comment = ta ? ta.value : cur.comment;
    cur.comment = comment;
    if (!approve && !comment.trim()) {
      cur.error = { type: 'field', field: 'comment', text: '반려할 때는 사유를 적어 주세요.' };
      paintReviewPane();
      const t = el('ap-rv-comment'); if (t) t.focus();
      return;
    }
    cur.error = null; cur.busy = approve ? 'approve' : 'reject';
    paintReviewPane();
    const pid = cur.data.viewer.pending_req_id, title = m.titleOf(cur.data), n = cur.snapNo || Number(cur.data.confirmed_snap) || Number(cur.data.current_snap) || 0;
    fetch('/approval-requests/' + encodeURIComponent(pid) + '/decide', {
      method: 'POST', headers: approvals.headers(AP_UI.INBOX, approve ? AP_BTN.APPROVE : AP_BTN.REJECT, true),
      body: JSON.stringify(approvals.decisionBody(approve, comment)),
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; });
    }, function () { return { ok: false, status: 0, body: null, net: true }; }).then(function (x) {
      if (review !== cur) return;
      cur.busy = '';
      if (x.ok) {
        closeReview(title + '를 ' + (approve ? '승인했습니다. 버전 ' + n + '이 확정되었습니다.' : '반려했습니다. 담당자가 다시 작성합니다.'));
        loadRequests().then(function () { refocusAfterLoad('inbox'); });   // 목록을 다시 그리면 포커스가 사라지므로 그 뒤에 되찾는다
        return;
      }
      cur.error = m.actError('decide', x);
      paintReviewPane();
      const t = cur.error.type === 'field' ? el('ap-rv-comment') : el('bd-m-acterr');
      if (t) t.focus();
      if (x.status === 404 || x.status === 409) loadRequests();   // 이미 처리된 제출이면 목록도 최신으로
    });
  }
  function onReviewClick(e) {
    const b = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b || b.disabled) return;
    const a = b.getAttribute('data-act');
    if (a === 'rv-back' || a === 'inbox') closeReview('');
    else if (a === 'rv-approve') reviewDecide(true);
    else if (a === 'rv-reject') reviewDecide(false);
  }
  function onReviewInput(e) {
    const t = e.target;
    if (!t || t.id !== 'ap-rv-comment' || !review) return;
    review.comment = t.value;
    const c = el('ap-rv-cnt');
    if (c) { c.textContent = t.value.length + '/500'; c.hidden = t.value.length < 450; }
  }
  function wireReview() {
    const box = paneBox('ap-review-box');
    if (box.getAttribute('data-wired')) return;
    box.setAttribute('data-wired', '1');
    box.addEventListener('click', onReviewClick);
    box.addEventListener('input', onReviewInput);
  }

  // 한 번에 하나만 — 처리 중에는 그 카드의 버튼을 잠근다. 실패하면 카드 안에 이유를 띄운다.
  // screen·button: 결재함 화면·버튼 이름(감사 기록). 모든 유형에 싣는다(서버는 이사회 자료 제출에서만 기록).
  function act(btn, url, body, screen, button) {
    const card = btn.closest('.ap-req');
    apFlash = '';
    card.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
    const init = { method: 'POST', headers: approvals.headers(screen, button, body !== undefined) };
    if (body !== undefined) { init.body = JSON.stringify(body); }
    fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(errtext.message(j.detail, '처리하지 못했습니다 (' + r.status + ')'));
      });
    }).then(function () { return loadRequests().then(function () { refocusAfterLoad(screen === AP_UI.INBOX ? 'inbox' : 'mine'); }); })
      .catch(function (e) {
        card.querySelectorAll('button').forEach(function (x) { x.disabled = false; });
        card.querySelector('.ap-err').textContent = e.message || '서버 연결 실패 — 처리되지 않았습니다.';
      });
  }

  // 결재·취소 뒤 목록이 다시 그려져 포커스가 body 로 떨어졌을 때만 되찾는다(다른 곳에 있으면 건드리지 않는다).
  function refocusAfterLoad(box) {
    const d = root.document, a = d && d.activeElement;
    if (review || (a && a !== d.body && d.contains(a))) return;
    let f = null;
    if (box === 'inbox') {
      const rows = approvals.requestRows((reqs.inbox || {}).items, categories());
      if (approvals.focusAfterDecide(rows) === 'card') f = el('ap-req-inbox').querySelector('.ap-review-btn,.ap-req-ok');
    } else f = el('ap-pane-mine').querySelector('.ap-req-cancel');
    f = f || el('ap-tab-' + box);
    if (f) f.focus();
  }

  function loadRequests() {
    // 로그아웃 직후엔 사번 헤더가 없어 서버가 401을 낸다 — 부르지 않고 캐시만 비운다.
    if (!(root.store.loadSession() || {}).emp) { reqs.mine = null; reqs.inbox = null; reqError = ''; return Promise.resolve(); }
    return Promise.all([
      getJson('/approval-requests?box=mine'),
      getJson('/approval-requests?box=inbox'),
      getJson('/approval-requests/my-perms').catch(function () { return null; }),
    ]).then(function (res) {
      reqs.mine = res[0]; reqs.inbox = res[1]; reqError = '';
      canApprove = approvals.canApproveOf(res[2]);
      if (autoTab) { autoTab = false; tab = approvals.defaultTab(approvals.requestRows(res[1].items, categories())); }
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
    autoTab = !wantTab;
    wantTab = null;
    review = null; clearFlash();   // 다른 메뉴에 다녀오면 열어 둔 검토 화면은 닫는다
    load().then(paintRequests);
    loadRequests();             // 대결 설정은 결재함이 아니라 [내 정보 › 대결 설정]에 있다
  };
  approvals.unmount = function () { /* 폴링이 없어 정리할 것이 없다 */ };
  approvals.onProfileChange = function () {
    clearFlash();   // 앞 사용자의 결재 안내 문구가 남지 않게
    if (payload !== null) load().then(paintRequests);
    loadRequests();
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = approvals;
  else root.approvals = approvals;
})(typeof self !== 'undefined' ? self : this);
