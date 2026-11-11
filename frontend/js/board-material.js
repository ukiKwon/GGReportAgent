(function (root) {
  'use strict';
  // 이사회 자료(020a) 화면 — 목록·새 자료·자료 머리·탭·버전 이력·작업 이력·읽기 전용 표.
  // 순수 함수(HTML·검증·fetch 래퍼)와 얇은 DOM 컨트롤러(createController)를 한 파일에 둔다. board.js 가 불러 쓴다.
  // 서버 계약: handoff/agents/backend-dev/2026-11-10_1532_a1f24b10.md §7, 2026-11-10_1751_a28fce85.md §5.
  // 출력 규칙(security): 서버·사용자 값은 모두 esc()를 거친다. innerHTML 에는 이 파일의 HTML 함수가 만든 문자열만 넣는다.
  const logic = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./logic.js') : root.logic;
  const mat = {};

  function str(v) { return v == null ? '' : String(v); }
  function esc(s) {
    if (logic && logic.esc) return logic.esc(str(s));
    return str(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function span(v) { const n = parseInt(v, 10); return n > 1 && n <= 100 ? n : 1; }
  const ALIGNS = { left: 1, center: 1, right: 1 };

  // ── 상수 ──────────────────────────────────────────────────
  // 020b(제출·회수·재작성·의결 결과) 버튼: 서버가 보내는 viewer.can_* 플래그대로 그린다.
  mat.PHASE_020B = true;
  // 서버 허용 목록(BoardUiIds)과 같은 이름. 화면을 더하면 서버 목록과 여기를 같이 고친다.
  mat.UI = { LIST: 'board_list', WRITE: 'board_write', REVIEW: 'board_review', INBOX: 'approvals_inbox', MINE: 'approvals_mine' };
  mat.BTN = { OPEN: 'open', REFRESH: 'refresh', CREATE: 'create', SAVE: 'save_version', SNAP: 'snapshot_open', HIST: 'history_open',
              SUBMIT: 'submit', WITHDRAW: 'withdraw', RESULT: 'result_save', REWORK: 'rework',
              REVIEW_OPEN: 'review_open', APPROVE: 'approve', REJECT: 'reject', CANCEL: 'cancel_request' };
  mat.headers = function (screen, button) { return { 'X-Screen-Id': screen, 'X-Button-Id': button }; };
  // 담당자(is_assignee)는 잠긴 자료를 봐도 board_write, 그 밖(영업부장·결재자)은 board_review 를 보낸다.
  mat.screenFor = function (isAssignee) { return isAssignee === true ? mat.UI.WRITE : mat.UI.REVIEW; };

  const T = {
    NET: '서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
    LIST_FAIL: '이사회 자료 목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
    READ_FAIL: '불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
    NOT_FOUND: '이 이사회 자료를 찾을 수 없습니다. 담당에서 빠졌거나 없는 자료입니다.',
    NO_SNAP: '아직 저장한 버전이 없습니다.',
    NO_FORM: '양식 구조를 받지 못해 값을 표로 그릴 수 없습니다. 새로고침한 뒤 다시 열어 주세요.',
    CREATE_FAIL: '이사회 자료를 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요.',
    MINE_FAIL: '담당 정보를 불러오지 못했습니다. 다시 시도해 주세요.'
  };
  mat.TEXT = T;
  const STATUS_NAME = { PREP: '준비 중', DRAFT: '작성 중', SUBMITTED: '제출(결재 중)', CONFIRMED: '확정' };
  const RESULT_NAME = { SCHEDULED: '의결 예정', PASSED: '가결', REJECTED: '부결' };
  mat.RESULT_NAME = RESULT_NAME;
  mat.loadingHtml = '<p class="wf-empty" role="status">불러오는 중…</p>';

  // ── 작은 순수 함수 ───────────────────────────────────────
  const ID_RE = /^\d{1,18}$/;
  mat.isId = function (id) { return ID_RE.test(str(id)); };
  function ts(iso) {
    const t = Date.parse(str(iso).replace(/(\.\d{3})\d+/, '$1'));   // 마이크로초(…342000) 정규화
    return isFinite(t) ? t : 0;
  }
  // 서버 시각(UTC ISO) → 한국 시각 "MM-DD HH:mm". 읽을 수 없으면 ''.
  mat.kst = function (iso) {
    const t = ts(iso);
    if (!t) return '';
    const d = new Date(t + 9 * 3600000);
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  };
  mat.statusName = function (it) {
    const n = str(it && it.status_name).trim();
    return n || STATUS_NAME[str(it && it.status_cd)] || '';
  };
  // 준비 중 = 회색 글자 배지, 그 밖(작성 중 등) = 잉크 글자 배지
  mat.badgeHtml = function (it) {
    const cd = str(it && it.status_cd);
    return '<span class="bd-badge' + (cd === 'PREP' || cd === '' ? '' : ' is-ink') + '">' + esc(mat.statusName(it)) + '</span>';
  };
  // 'YYYY-MM-DD…' → 'YYYY-MM-DD'(아니면 ''), 'MM-DD'
  mat.dateOf = function (s) { const m = /^(\d{4}-\d{2}-\d{2})/.exec(str(s)); return m ? m[1] : ''; };
  mat.mdOf = function (s) { const d = mat.dateOf(s); return d ? d.slice(5) : ''; };
  // 자료 머리의 상태 배지: 제출(결재 중)=주황, 확정=파랑(배경 위에서만 쓴다), 그 밖은 목록과 같은 배지
  mat.headBadgeHtml = function (d) {
    const cd = str(d && d.status_cd);
    if (cd === 'SUBMITTED') return '<span class="wf-badge gap">' + esc(mat.statusName(d)) + '</span>';
    if (cd === 'CONFIRMED') return '<span class="wf-badge ok">' + esc(mat.statusName(d)) + '</span>';
    return mat.badgeHtml(d);
  };
  // 의결 결과 배지(확정일 때만). 결과가 없으면 ''. 부결도 빨강으로 칠하지 않는다.
  mat.resultBadgeHtml = function (d) {
    if (str(d && d.status_cd) !== 'CONFIRMED') return '';
    const r = str(d.result_cd);
    if (r === '') return '';
    if (r === 'SCHEDULED') {
      const md = mat.mdOf(d.meeting_date);
      return '<span class="bd-badge is-ink bd-m-rbadge">의결 예정' + (md ? ' · <span class="mono">' + esc(md) + '</span>' : '') + '</span>';
    }
    const n = RESULT_NAME[r] || str(d.result_name).trim();
    return n ? '<span class="bd-badge is-ink bd-m-rbadge">' + esc(n) + '</span>' : '';
  };
  // 서버 목록 검색에 없는 조건(제출(결재 중)·확정 상태, 개최일 범위)은 받은 목록에서 화면이 거른다.
  mat.filterItems = function (items, f) {
    const x = f || {}, st = x.status === 'SUBMITTED' || x.status === 'CONFIRMED' ? x.status : '';
    const from = /^\d{4}-\d{2}-\d{2}$/.test(str(x.mfrom)) ? x.mfrom : '', to = /^\d{4}-\d{2}-\d{2}$/.test(str(x.mto)) ? x.mto : '';
    return (Array.isArray(items) ? items : []).filter(function (it) {
      if (st && str(it.status_cd) !== st) return false;
      if (from || to) {
        const d = mat.dateOf(it.meeting_date);
        if (!d || (from && d < from) || (to && d > to)) return false;
      }
      return true;
    });
  };
  // from..to 해 목록(now 기준). 목록 검색: now-2 … now+1, 새 자료: now-1 … now+1
  mat.yearOptions = function (now, from, to) {
    const a = [];
    for (let y = now + from; y <= now + to; y++) a.push(y);
    return a;
  };
  mat.sortItems = function (items) {
    return (Array.isArray(items) ? items : []).filter(isObj).slice().sort(function (a, b) {
      const d = ts(b.last_saved_at || b.created_at) - ts(a.last_saved_at || a.created_at);
      return d !== 0 ? d : str(a.institution_name).localeCompare(str(b.institution_name), 'ko');
    });
  };
  mat.listUrl = function (f) {
    const x = f || {}, p = [];
    if (str(x.q).trim()) p.push('q=' + encodeURIComponent(str(x.q).trim()));
    if (x.status === 'PREP' || x.status === 'DRAFT') p.push('status=' + x.status);
    if (/^\d{4}$/.test(str(x.year))) p.push('year=' + x.year);
    if (str(x.assignee).trim()) p.push('assignee=' + encodeURIComponent(str(x.assignee).trim()));
    return '/board-materials' + (p.length ? '?' + p.join('&') : '');
  };
  mat.itemUrl = function (id) { return '/board-materials/' + encodeURIComponent(id); };
  mat.snapsUrl = function (id) { return mat.itemUrl(id) + '/snapshots'; };
  mat.snapUrl = function (id, n) { return mat.snapsUrl(id) + '/' + encodeURIComponent(n); };
  mat.histUrl = function (id) { return mat.itemUrl(id) + '/history'; };

  // ── 서버 호출(순수: fetchFn 주입). 실패는 reject 하지 않고 {ok:false,…} 로 돌려준다 ──
  function req(fetchFn, url, init) {
    return fetchFn(url, init).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) {
        return { ok: r.ok, status: r.status, body: body };
      });
    }).catch(function () { return { ok: false, status: 0, body: null, net: true }; });
  }
  function detailOf(x) { const d = x && x.body && x.body.detail; return isObj(d) ? d : null; }
  // 서버 400·404 는 detail 이 글자 하나다(저장 API 와 달리 코드 객체가 아님). 글자면 그대로, 아니면 ''.
  function detailText(x) { const d = x && x.body && x.body.detail; return typeof d === 'string' ? d.trim() : ''; }
  function readFail(x) {
    return { ok: false, status: x.status, notFound: x.status === 404,
             error: x.net ? T.NET : (x.status === 404 ? T.NOT_FOUND : T.READ_FAIL) };
  }

  mat.loadList = function (fetchFn, f) {
    return req(fetchFn, mat.listUrl(f), { headers: mat.headers(mat.UI.LIST, mat.BTN.REFRESH) }).then(function (x) {
      if (!x.ok || !isObj(x.body) || !Array.isArray(x.body.items)) return { ok: false, status: x.status, error: x.net ? T.NET : T.LIST_FAIL };
      return { ok: true, items: x.body.items.filter(isObj), truncated: x.body.truncated === true };
    });
  };
  // 내 담당 입찰 건(team.js 와 같은 API). 실패하면 {ok:false, ids:[]} — 화면은 '배정 없음'이 아니라 불러오기 실패로 안내한다.
  mat.loadAssignments = function (fetchFn) {
    return req(fetchFn, '/me/assignments').then(function (x) {
      if (!x.ok || !Array.isArray(x.body)) return { ok: false, ids: [] };
      return { ok: true, ids: x.body.map(function (a) { return str(a && a.bid_case_id); }).filter(Boolean) };
    });
  };
  mat.normMaterial = function (b) { return isObj(b) && b.material_id != null && mat.isId(b.material_id) ? b : null; };
  mat.loadMaterial = function (fetchFn, id, screen, button) {
    if (!mat.isId(id)) return Promise.resolve({ ok: false, status: 404, notFound: true, error: T.NOT_FOUND });
    return req(fetchFn, mat.itemUrl(id), { headers: mat.headers(screen, button) }).then(function (x) {
      if (!x.ok) return readFail(x);
      const m = mat.normMaterial(x.body);
      return m ? { ok: true, material: m } : { ok: false, status: x.status, error: T.READ_FAIL };
    });
  };
  mat.loadSnaps = function (fetchFn, id, screen) {
    return req(fetchFn, mat.snapsUrl(id), { headers: mat.headers(screen, mat.BTN.HIST) }).then(function (x) {
      if (!x.ok) return readFail(x);
      const items = isObj(x.body) && Array.isArray(x.body.items) ? x.body.items.filter(isObj) : null;
      return items ? { ok: true, items: items } : { ok: false, status: x.status, error: T.READ_FAIL };
    });
  };
  mat.loadSnap = function (fetchFn, id, n, screen) {
    return req(fetchFn, mat.snapUrl(id, n), { headers: mat.headers(screen, mat.BTN.SNAP) }).then(function (x) {
      if (!x.ok) return readFail(x);
      return isObj(x.body) && Array.isArray(x.body.tables) ? { ok: true, snap: x.body } : { ok: false, status: x.status, error: T.READ_FAIL };
    });
  };
  mat.loadHistory = function (fetchFn, id, screen) {
    return req(fetchFn, mat.histUrl(id), { headers: mat.headers(screen, mat.BTN.HIST) }).then(function (x) {
      if (!x.ok) return readFail(x);
      return Array.isArray(x.body) ? { ok: true, items: x.body.filter(isObj) } : { ok: false, status: x.status, error: T.READ_FAIL };
    });
  };
  // 201 → {ok, material} / 409 ALREADY_EXISTS → {exists, materialId} / 그 밖 → {error}
  mat.createMaterial = function (fetchFn, p) {
    const body = { bid_case_id: str(p.bidCaseId), year: Number(p.year) };
    if (str(p.formId)) body.form_id = str(p.formId);
    const init = { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, mat.headers(mat.UI.LIST, mat.BTN.CREATE)),
                   body: JSON.stringify(body) };
    return req(fetchFn, '/board-materials', init).then(function (x) {
      if (x.ok) {
        const m = mat.normMaterial(x.body);
        return m ? { ok: true, material: m } : { ok: false, status: x.status, error: T.CREATE_FAIL };
      }
      const d = detailOf(x);
      if (x.status === 409 && d && d.code === 'ALREADY_EXISTS' && mat.isId(d.material_id)) {
        return { ok: false, status: 409, exists: true, materialId: Number(d.material_id) };
      }
      return { ok: false, status: x.status, error: mat.createError(x) };
    });
  };
  mat.createError = function (x) {
    if (x.net) return T.NET;
    const d = detailOf(x), code = d ? str(d.code) : '', msg = d ? str(d.message) : detailText(x);
    if (code === 'UI_ID_REQUIRED') return '화면 오류로 만들지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.';
    if (x.status === 403) return '이 입찰 건의 담당자만 자료를 만들 수 있습니다. 담당이 바뀌었을 수 있으니 목록을 새로 불러와 주세요.';
    if (x.status === 404) return '입찰 건을 찾지 못했습니다. 목록을 새로 고쳐 주세요.';
    if (x.status === 400) return msg || '이사회 자료를 만들지 못했습니다. 입력을 확인해 주세요.';   // 서버 문구(예: "연도는 2000~2100 사이여야 합니다.")를 그대로 보인다. 화면에서 esc 한다.
    return T.CREATE_FAIL;
  };

  // ── 020b 쓰기(제출·회수·의결 결과·재작성 요구)와 결재자 검토 ──────────────
  mat.reviewUrl = function (id) { return mat.itemUrl(id) + '/review'; };
  // kind: submit | withdraw | result | rework. 결과는 reject 하지 않고 {ok,status,body,net} 로 돌려준다.
  // 화면·버튼 이름은 서버 허용 목록(BoardUiIds)과 같다: 담당자 행동은 board_write, 영업부장 재작성 요구는 board_review.
  mat.actCall = function (fetchFn, kind, id, p) {
    const spec = { submit: ['submit', mat.UI.WRITE, mat.BTN.SUBMIT], withdraw: ['withdraw', mat.UI.WRITE, mat.BTN.WITHDRAW],
                   result: ['result', mat.UI.WRITE, mat.BTN.RESULT], rework: ['rework', mat.UI.REVIEW, mat.BTN.REWORK] }[kind];
    if (!spec || !mat.isId(id)) return Promise.resolve({ ok: false, status: 404, body: null });
    const init = { method: 'POST', headers: mat.headers(spec[1], spec[2]) };
    let body;
    if (kind === 'result') body = { result: str(p && p.result), meeting_date: str(p && p.date) || null };
    else if (kind === 'rework') body = { reason: str(p && p.reason).trim() };
    if (body !== undefined) { init.headers = Object.assign({ 'Content-Type': 'application/json' }, init.headers); init.body = JSON.stringify(body); }
    return req(fetchFn, mat.itemUrl(id) + '/' + spec[0], init);
  };
  // 결재자 검토용 읽기(결재함 탭 안에서 연다). 헤더: approvals_inbox / review_open
  mat.loadReview = function (fetchFn, id) {
    if (!mat.isId(id)) return Promise.resolve({ ok: false, status: 404, notFound: true, error: T.NOT_FOUND });
    return req(fetchFn, mat.reviewUrl(id), { headers: mat.headers(mat.UI.INBOX, mat.BTN.REVIEW_OPEN) }).then(function (x) {
      if (!x.ok) return readFail(x);
      const m = mat.normMaterial(x.body);
      return m ? { ok: true, review: m } : { ok: false, status: x.status, error: T.READ_FAIL };
    });
  };
  // 쓰기 오류 → {type:'box', title, hint, btns} | {type:'field', field:'date'|'reason'|'comment', text}
  // kind: submit | withdraw | result | rework | decide. x: {status, body, net}
  mat.actError = function (kind, x) {
    const d = detailOf(x), code = d ? str(d.code) : '', msg = d ? str(d.message) : detailText(x), st = x ? x.status : 0;
    const R = [['refresh', '새로 고치기']], B = [['back', '목록으로']], I = [['inbox', '결재함으로']];
    const box = function (title, hint, btns) { return { type: 'box', title: title, hint: hint || '', btns: btns || [] }; };
    const field = function (f, text) { return { type: 'field', field: f, text: text }; };
    if (!x || x.net || st === 0 || st >= 500) return box('서버에 연결하지 못했습니다.', '처리됐는지 확인하려면 [새로 고치기]를 눌러 주세요.', kind === 'decide' ? I : R);
    if (code === 'UI_ID_REQUIRED') return box('화면 오류로 처리하지 못했습니다.', '새로고침한 뒤 다시 시도해 주세요.');
    if (kind === 'decide') {
      if (st === 422) return field('comment', '의견에 개인정보로 보이는 값이 있어 보내지 않았습니다. 그 부분을 지우거나 가린 뒤 다시 보내 주세요.');
      if (st === 409 && code === 'APPROVER_ROLE_MISMATCH') return box('영업팀장이 관련된 제출이라 영업부장만 승인할 수 있습니다.', '반려하면 담당자가 다시 제출할 수 있습니다.');
      if (st === 409) return box('이미 처리된 제출입니다.', '담당자가 회수했거나 결재가 이미 끝났습니다.', I);
      if (st === 404) return box('담당자가 회수했거나 이미 처리된 제출입니다.', '', I);
      if (st === 403) return box('이 제출을 승인할 수 없습니다.', '이 입찰 건의 담당자이거나 결재할 차례가 아닙니다.', I);
      return box('처리하지 못했습니다.', msg, I);
    }
    if (st === 404) return box('이 이사회 자료를 찾을 수 없습니다.', '담당에서 빠졌거나 없는 자료입니다.', B);
    if (kind === 'submit') {
      if (st === 409 && code === 'ALREADY_SUBMITTED') return box('다른 담당자가 이미 제출했습니다.', '화면을 새로 고쳐 결재 상태를 확인해 주세요.', R);
      if (st === 409 && code === 'MATERIAL_LOCKED') return box('이미 확정된 자료라 제출할 수 없습니다.', '화면을 새로 고쳐 확인해 주세요.', R);
      if (st === 409 && code === 'NO_SNAPSHOT') return box('저장한 버전이 없어 제출하지 못했습니다.', '먼저 [버전 저장]으로 값을 저장한 뒤 제출해 주세요.');
      if (st === 409) return box('자료가 그 사이 바뀌어 제출하지 못했습니다.', '새로 고친 뒤 다시 제출해 주세요.', R);
      if (st === 400 && code === 'APPROVER_NOT_RESOLVED') return box('결재할 사람을 정하지 못해 제출하지 못했습니다.', '영업팀장(또는 영업부장)이 지정되지 않았거나 두 명 이상입니다. 시스템 관리자에게 문의해 주세요.');
      if (st === 403) return box('이 자료의 담당자만 제출할 수 있습니다.', '담당이 바뀌었을 수 있습니다.', B);
    } else if (kind === 'withdraw') {
      if (st === 409) return box('이미 결재가 끝났거나 회수된 제출입니다.', '화면을 새로 고쳐 현재 상태를 확인해 주세요.', R);
      if (st === 403) return box('이 자료의 담당자만 회수할 수 있습니다.', '담당이 바뀌었을 수 있습니다.', B);
    } else if (kind === 'result') {
      if (st === 400 && code === 'MEETING_DATE_REQUIRED') return field('date', '의결 예정이면 개최일을 입력해 주세요.');
      if (st === 400) return box('의결 결과나 개최일 형식이 올바르지 않습니다.', '다시 골라 주세요.');
      if (st === 409 && code === 'NOT_CONFIRMED') return box('확정된 자료가 아니어서 의결 결과를 저장하지 못했습니다.', '영업부장이 재작성을 요구했을 수 있습니다. 새로 고쳐 확인해 주세요.', R);
      if (st === 409) return box('다른 담당자가 먼저 의결 결과를 바꿨습니다.', '새로 고쳐 최신 결과를 확인한 뒤 다시 입력해 주세요.', R);
      if (st === 403) return box('이 자료의 담당자만 의결 결과를 바꿀 수 있습니다.', '담당이 바뀌었을 수 있습니다.', B);
    } else if (kind === 'rework') {
      if (st === 400) return field('reason', /제어|문자/.test(msg) && msg ? msg : '사유를 1~200자로 입력해 주세요.');
      if (st === 422) return field('reason', '사유에 개인정보로 보이는 값이 있어 보내지 않았습니다. 그 부분을 지우거나 가린 뒤 다시 보내 주세요.');
      if (st === 409 && code === 'NOT_APPLICABLE') return box('자료가 이미 작성 중으로 돌아가 재작성을 요구할 수 없습니다.', '담당자가 회수했거나 결재자가 반려했을 수 있습니다.', R);
      if (st === 409) return box('자료 상태가 그 사이 바뀌었습니다.', '새로 고친 뒤 다시 시도해 주세요.', R);
      if (st === 403) return box('재작성 요구는 영업부장만 할 수 있습니다.', '');
    }
    return box('처리하지 못했습니다.', '새로 고친 뒤 다시 시도해 주세요.', R);
  };
  // 성공 문구(응답 b 사용). o: {seen(화면에서 본 버전)}
  mat.okText = function (kind, b, o) {
    const x = o || {};
    if (kind === 'submit') {
      const n = Number(b && b.payload && b.payload.snap_no) || 0, steps = b && Array.isArray(b.steps) ? b.steps : [];
      const who = steps[0] && str(steps[0].approver_name) ? str(steps[0].approver_name) : '';
      return '버전 ' + (n || '') + '을 제출했습니다.' + (who ? ' ' + who + '이(가) 결재합니다.' : '') +
        (n && Number(x.seen) > 0 && n !== Number(x.seen) ? ' 화면에서 본 버전 ' + x.seen + ' 뒤에 저장된 버전입니다. [버전 이력]에서 확인해 주세요.' : '');
    }
    if (kind === 'withdraw') return '제출을 회수했습니다. 자료가 작성 중으로 돌아가 다시 고칠 수 있습니다.';
    if (kind === 'rework') return '재작성을 요구했습니다. 자료가 작성 중으로 돌아갔습니다.';
    if (kind === 'result') {
      const r = RESULT_NAME[str(b && b.result_cd)] || str(b && b.result_name);
      return "의결 결과를 '" + r + "'(으)로 저장했습니다.";
    }
    return '';
  };
  // 결재함 안 검토 화면(읽기 전용 표 + 결재 줄). d: GET /review 응답, o: {n, canDecide, comment, busy, error:{type,…}}
  mat.reviewHtml = function (d, o) {
    const x = o || {}, snap = isObj(d.snapshot) ? d.snapshot : null;
    const n = Number(x.n) > 0 ? Number(x.n) : (snap && Number(snap.snap_no) > 0 ? Number(snap.snap_no) : savedCount(d));
    const who = snap ? (str(snap.saved_by_name) ? esc(snap.saved_by_name) + ' ' : '') : '', when = mat.kst(snap ? snap.saved_at : d.last_saved_at);
    const e = x.error, len = str(x.comment).length;
    let err = '';
    if (e && e.type === 'box') err = mat.actErrHtml({ title: e.title, hint: e.hint, btns: e.btns });
    else if (e && e.type === 'field') err = '<p class="bd-m-ferr" id="ap-rv-err" role="alert">' + esc(e.text) + '</p>';
    let decide;
    if (x.canDecide) {
      decide = '<div class="bd-m-decide" role="group" aria-label="결재"><div class="bd-m-dfield"><label for="ap-rv-comment">의견 (반려할 때 필수)</label>' +
        '<textarea id="ap-rv-comment" rows="2" maxlength="500"' + (e && e.type === 'field' ? ' aria-invalid="true" aria-describedby="ap-rv-err"' : '') + (x.busy ? ' disabled' : '') + '>' + esc(x.comment) + '</textarea>' +
        '<span class="bd-m-cnt" id="ap-rv-cnt" aria-live="polite"' + (len < 450 ? ' hidden' : '') + '>' + len + '/500</span></div>' +
        '<button type="button" id="ap-rv-ok" class="bd-wb-main" data-act="rv-approve"' + (x.busy ? ' disabled' : '') + '>' + (x.busy === 'approve' ? '승인하는 중…' : '승인(확정)') + '</button>' +
        '<button type="button" id="ap-rv-no" data-act="rv-reject"' + (x.busy ? ' disabled' : '') + '>' + (x.busy === 'reject' ? '반려하는 중…' : '반려') + '</button>' +
        '<p class="bd-m-dhint">승인하면 버전 ' + esc(n) + '이 확정되고 담당자는 값을 고칠 수 없습니다.</p>' + (e && e.type === 'field' ? err : '') + '</div>' +
        (e && e.type === 'box' ? err : '');
    } else {
      decide = '<div class="bd-m-decide" role="group" aria-label="결재"><p class="bd-m-dhint">이 제출은 지금 결재할 수 없습니다. 담당자가 회수했거나 이미 처리되었습니다.</p>' +
        '<button type="button" id="ap-rv-gone" data-act="rv-back">결재함으로</button></div>';
    }
    return '<div class="bd-m-review" id="ap-review"><button type="button" class="link-btn" id="ap-rv-back" data-act="rv-back">← 결재함</button>' +
      '<div class="bd-m-head"><h2 id="ap-rv-title" tabindex="-1">' + esc(mat.titleOf(d)) + '</h2>' + mat.headBadgeHtml(d) + '</div>' +
      '<div class="bd-m-meta"><span>' + (n ? '버전 ' + esc(n) + ' · ' + who + '<span class="mono">' + esc(when) + '</span> 저장' : '저장 전') + '</span><span>담당 ' + esc(mat.assigneesText(d)) + '</span></div>' +
      '<p class="bd-m-ap-msg">결재할 버전 ' + esc(n) + '의 전체 내용입니다. 읽기 전용입니다.</p>' +
      mat.readOnlyHtml(d.form, snap ? snap.tables : []) + decide + '</div>';
  };

  // ── 목록 ────────────────────────────────────────────────
  // 이 화면에서 만들 수 있는 입찰 건 = 내 담당 번호(mineIds) ∩ 앱에 실린 입찰 건(records)
  mat.casesFor = function (records, mineIds, regionNames) {
    const mine = Object.create(null);   // 프로토타입 이름(constructor 등)이 담당으로 보이지 않게
    (mineIds || []).forEach(function (id) { mine[id] = true; });
    const seen = Object.create(null), out = [];
    (records || []).forEach(function (r) {
      if (!r || !r.bidCaseId || !mine[r.bidCaseId] || seen[r.bidCaseId]) return;
      seen[r.bidCaseId] = true;
      out.push({ id: str(r.bidCaseId), name: str(r.name), region: str((regionNames && regionNames[r.region]) || r.region || '') });
    });
    out.sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
    return out;
  };
  mat.existFor = function (items, bc, year) {
    const l = (items || []).filter(function (i) { return str(i.bid_case_id) === str(bc) && Number(i.year) === Number(year); });
    return l.length ? l[0] : null;
  };
  mat.assigneesHtml = function (it, me) {
    const as = Array.isArray(it.assignees) ? it.assignees : [];
    return as.map(function (a) {
      const n = esc(a && a.name);
      return me && str(a && a.emp_no) === str(me) ? '<b>' + n + '</b>' : n;
    }).join(', ');
  };
  mat.assigneesText = function (it) {
    return (Array.isArray(it.assignees) ? it.assignees : []).map(function (a) { return str(a && a.name); }).filter(Boolean).join(', ');
  };
  // 헤더의 last_saved_by 는 사번이다 — 담당자 이름과 이어 붙인다(못 찾으면 이름 없이 시각만).
  mat.saverName = function (it) {
    const a = (Array.isArray(it.assignees) ? it.assignees : []).filter(function (x) { return x && str(x.emp_no) === str(it.last_saved_by); })[0];
    return a ? str(a.name) : '';
  };
  function savedCount(it) { return Number(it && it.current_snap) > 0 ? Number(it.current_snap) : 0; }
  mat.savedHtml = function (it) {
    if (!savedCount(it) || !it.last_saved_at) return '<span class="dg-hint">저장 전</span>';
    const n = mat.saverName(it);
    return (n ? esc(n) + ' ' : '') + '<span class="mono">' + esc(mat.kst(it.last_saved_at)) + '</span>';
  };
  mat.listTableHtml = function (items, me) {
    const rows = items.map(function (it) {
      const name = str(it.institution_name), yr = str(it.year);
      const label = name + ' ' + yr + '년 이사회 자료 열기, ' + mat.statusName(it);
      return '<tr><td class="bd-l-name"><button type="button" class="bd-l-open" data-act="open" data-id="' + esc(it.material_id) +
        '" aria-label="' + esc(label) + '">' + esc(name) + '</button></td>' +
        '<td class="mono">' + esc(yr) + '</td><td>' + mat.headBadgeHtml(it) + mat.resultBadgeHtml(it) + '</td>' +
        '<td class="bd-l-who">' + mat.assigneesHtml(it, me) + '</td><td>' + mat.savedHtml(it) + '</td>' +
        '<td class="mono">' + (savedCount(it) ? 'v' + savedCount(it) : '—') + '</td>' +
        '<td class="mono">' + (mat.dateOf(it.meeting_date) ? esc(mat.dateOf(it.meeting_date)) : '—') + '</td></tr>';
    }).join('');
    return '<table class="ad-table bd-l-tbl"><caption class="bd-sr">이사회 자료 ' + items.length + '건</caption><thead><tr>' +
      '<th scope="col">기관명</th><th scope="col" style="width:64px">연도</th><th scope="col" style="width:112px">상태</th>' +
      '<th scope="col" style="width:220px">담당자</th><th scope="col" style="width:168px">마지막 저장</th>' +
      '<th scope="col" style="width:56px">버전</th><th scope="col" style="width:96px">개최일</th></tr></thead><tbody>' + rows + '</tbody></table>';
  };
  mat.countText = function (L) { return L && L.status === 'ready' ? L.items.length + '건' : ''; };
  // L: {status:'idle'|'loading'|'ready'|'error', items, truncated}
  // o: {me, isHead, mine(null=모름|수), filtered, canTeam}
  mat.resultHtml = function (L, o) {
    const x = o || {};
    if (L.status === 'idle' || L.status === 'loading') return mat.loadingHtml;
    if (L.status === 'error') {
      return '<div class="bd-l-state"><p class="wf-empty bd-err" role="alert">' + esc(T.LIST_FAIL) + '</p>' +
        '<button type="button" data-act="reload">다시 불러오기</button></div>';
    }
    if (!L.items.length) {
      if (x.filtered) return '<div class="bd-l-state"><p class="wf-empty">조건에 맞는 이사회 자료가 없습니다.</p><button type="button" data-act="clear">조건 지우기</button></div>';
      if (x.isHead) return '<p class="wf-empty">아직 만들어진 이사회 자료가 없습니다.</p>';
      if (x.mineError) {   // 담당 조회 실패는 '배정 없음'이 아니다
        return '<div class="bd-l-state"><p class="wf-empty bd-err" role="alert">' + esc(T.MINE_FAIL) + '</p>' +
          '<button type="button" data-act="reload-mine">다시 불러오기</button></div>';
      }
      if (x.mine == null) return mat.loadingHtml;
      if (x.mine > 0) {
        return '<div class="bd-l-state"><p class="wf-empty">아직 이사회 자료가 없습니다. 담당 입찰 건 ' + x.mine + '건으로 새 자료를 만들 수 있습니다.</p>' +
          '<button type="button" class="bd-wb-main" data-act="new">새 이사회 자료</button></div>';
      }
      return '<div class="bd-l-state"><p class="wf-empty">담당으로 배정된 입찰 건의 이사회 자료만 볼 수 있습니다. 지금 배정된 입찰 건이 없습니다.</p>' +
        (x.canTeam ? '<button type="button" data-act="team">제안팀 구성·배정 열기</button>' : '') + '</div>';
    }
    return mat.listTableHtml(L.items, x.me) + (L.truncated ? '<p class="wf-empty">최근 300건만 보여 줍니다. 조건을 좁혀 주세요.</p>' : '');
  };
  // o: {isHead, showForms, canCreate, newOpen}
  mat.listHeadHtml = function (o) {
    return '<div class="bd-l-head"><h2 class="tm-title">이사회 자료</h2><span class="dg-hint">' +
      (o.isHead ? '모든 이사회 자료를 읽기 전용으로 봅니다' : '담당 입찰 건의 이사회 자료를 만들고 버전으로 저장합니다') + '</span>' +
      '<span class="bd-l-tools">' + (o.showForms ? '<button type="button" class="link-btn" data-act="forms">양식 보기·편집</button>' : '') +
      (o.canCreate ? '<button type="button" class="bd-wb-main" id="bd-l-newbtn" data-act="new" aria-expanded="' + (o.newOpen ? 'true' : 'false') +
        '" aria-controls="bd-l-new">새 이사회 자료</button>' : '') + '</span></div>';
  };
  mat.searchHtml = function (f, nowYear) {
    const x = f || {};
    const opt = function (v, label, cur) { return '<option value="' + esc(v) + '"' + (str(cur) === str(v) ? ' selected' : '') + '>' + esc(label) + '</option>'; };
    return '<div class="bd-l-search" role="search" aria-label="이사회 자료 검색">' +
      '<input type="text" id="bd-l-q" data-f="q" maxlength="50" placeholder="기관명" aria-label="기관명" value="' + esc(x.q) + '">' +
      '<select id="bd-l-status" data-f="status" aria-label="상태">' + opt('', '상태 전체', x.status) + opt('PREP', '준비 중', x.status) + opt('DRAFT', '작성 중', x.status) +
        opt('SUBMITTED', '제출(결재 중)', x.status) + opt('CONFIRMED', '확정', x.status) + '</select>' +
      '<input type="text" id="bd-l-as" data-f="assignee" maxlength="30" placeholder="담당자 이름" aria-label="담당자 이름" value="' + esc(x.assignee) + '">' +
      '<select id="bd-l-year" data-f="year" aria-label="연도">' + opt('', '연도 전체', x.year) +
        mat.yearOptions(nowYear, -2, 1).map(function (y) { return opt(y, y, x.year); }).join('') + '</select>' +
      '<label class="bd-l-date">개최일 <input type="date" id="bd-l-mfrom" data-f="mfrom" aria-label="개최일 시작" value="' + esc(x.mfrom) + '"></label>' +
      '<label class="bd-l-date">~ <input type="date" id="bd-l-mto" data-f="mto" aria-label="개최일 끝" value="' + esc(x.mto) + '"></label>' +
      '<button type="button" class="link-btn" id="bd-l-clear" data-act="clear" hidden>조건 지우기</button>' +
      '<span class="bd-l-count" id="bd-l-count" role="status" aria-live="polite"></span></div>';
  };

  // ── 새 이사회 자료 패널 ───────────────────────────────────
  mat.npFormOptions = function (forms, sel) {
    return (forms || []).map(function (f) {
      return '<option value="' + esc(f.id) + '"' + (str(f.id) === str(sel) ? ' selected' : '') + '>' + esc(f.name) + '</option>';
    }).join('');
  };
  // o: {cases:[{id,name,region}], np:{bc,year,formId,busy,error,exist}, items(목록), forms:[{id,name}], nowYear}
  mat.newPanelHtml = function (o) {
    const np = o.np || {}, cases = o.cases || [];
    const picks = cases.length ? cases.map(function (c) {
      const ex = mat.existFor(o.items, c.id, np.year);
      return '<label class="tm-pick' + (c.id === np.bc ? ' on' : '') + '"><input type="radio" name="bd-l-bc" value="' + esc(c.id) + '"' + (c.id === np.bc ? ' checked' : '') + '> ' +
        '<span class="tm-pick-name">' + esc(c.name) + '</span>' + (c.region ? ' <span class="dg-hint">' + esc(c.region) + '</span>' : '') +
        (ex ? '<span class="bd-l-exist">' + esc(np.year) + '년 이미 있음 · ' + esc(mat.statusName(ex)) + '</span>' : '') + '</label>';
    }).join('') : '<p class="wf-empty">담당 입찰 건을 찾지 못했습니다. 목록을 새로 불러온 뒤 다시 열어 주세요.</p>';
    const found = mat.existFor(o.items, np.bc, np.year);
    const exId = np.exist || (found ? found.material_id : 0);
    const opening = !!exId && mat.isId(exId);
    return '<fieldset class="tm-fs bd-l-new" id="bd-l-new" aria-busy="' + (np.busy ? 'true' : 'false') + '"><legend>새 이사회 자료</legend>' +
      '<p class="dg-hint bd-l-note">기관과 연도마다 자료는 1건입니다. 만든 뒤에는 양식을 바꿀 수 없습니다.</p>' +
      '<div class="tm-picks" role="radiogroup" aria-label="내 담당 입찰 건">' + picks + '</div>' +
      '<div class="bd-l-row"><label>연도 <select id="bd-l-np-year">' +
        mat.yearOptions(o.nowYear, -1, 1).map(function (y) { return '<option value="' + y + '"' + (y === Number(np.year) ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '</select></label>' +
      '<label>양식 <select id="bd-l-np-form">' + mat.npFormOptions(o.forms, np.formId) + '</select></label>' +
      '<span class="bd-l-btns">' +
      (opening ? '<button type="button" class="bd-wb-main" id="bd-l-np-ok" data-act="open-exist" data-id="' + esc(exId) + '">자료 열기</button>'
               : '<button type="button" class="bd-wb-main" id="bd-l-np-ok" data-act="create"' + (np.busy || !np.bc ? ' disabled' : '') + '>' + (np.busy ? '만드는 중…' : '만들기') + '</button>') +
      '<button type="button" data-act="newclose"' + (np.busy ? ' disabled' : '') + '>취소</button></span></div>' +
      (np.error ? '<p class="bd-err bd-l-newerr" id="bd-l-newerr" role="alert" tabindex="-1">' + esc(np.error) + '</p>' : '') + '</fieldset>';
  };

  // ── 자료 머리·탭 ─────────────────────────────────────────
  // d: GET /board-materials/{id} 응답
  mat.savedLabel = function (d) {
    const s = isObj(d && d.snapshot) ? d.snapshot : null;
    return s ? (str(s.saved_by_name) ? str(s.saved_by_name) + ' · ' : '') + mat.kst(s.saved_at) : '';
  };
  function viewerOf(d) { return isObj(d && d.viewer) ? d.viewer : {}; }
  mat.titleOf = function (d) { return str(d && d.institution_name) + ' ' + str(d && d.year) + '년 이사회 자료'; };
  // 머리 오른쪽 버튼들(viewer.can_* 플래그대로). o: {open:'submit'|'result'|'', busy:'submit'|'withdraw'|'rework'|'result'|'', dirty:수정 칸 수}
  // 머리 [안건 제출]이 틸(bd-wb-main)일 때: 수정이 남아 있으면 [버전 저장]이, 제출 확인 줄이 열려 있으면 줄의 [버전 n 안건 제출]이 틸이다(한 번에 하나).
  mat.headMainOn = function (open, dirty) { return !(Number(dirty) > 0) && open !== 'submit'; };
  mat.headActsHtml = function (d, o) {
    if (!mat.PHASE_020B) return '';
    const x = o || {}, v = viewerOf(d), cd = str(d.status_cd), busy = str(x.busy);
    const off = busy !== '';
    const b = [];
    if (cd === 'PREP' && v.is_assignee === true) {
      b.push('<button type="button" id="bd-m-submit" data-act="submit-open" disabled aria-describedby="bd-m-subwhy">안건 제출</button>' +
        '<span class="bd-sr" id="bd-m-subwhy">버전을 한 번 저장해야 제출할 수 있습니다.</span>');
    }
    if (cd === 'DRAFT' && v.can_submit === true) {
      const main = mat.headMainOn(x.open, x.dirty);   // 틸은 한 번에 하나
      b.push('<button type="button" id="bd-m-submit" data-act="submit-open" class="' + (main ? 'bd-wb-main' : '') + '" aria-expanded="' + (x.open === 'submit' ? 'true' : 'false') +
        '" aria-controls="bd-m-subrow"' + (off ? ' disabled' : '') + '>안건 제출</button>');
    }
    if (cd === 'SUBMITTED' && v.can_withdraw === true) {
      b.push('<button type="button" id="bd-m-withdraw" data-act="withdraw"' + (off ? ' disabled' : '') + '>' + (busy === 'withdraw' ? '회수하는 중…' : '제출 회수') + '</button>');
    }
    if (cd === 'CONFIRMED' && v.can_set_result === true) {
      b.push('<button type="button" id="bd-m-resbtn" data-act="result-open" aria-expanded="' + (x.open === 'result' ? 'true' : 'false') + '" aria-controls="bd-m-resrow"' +
        (off ? ' disabled' : '') + '>' + (str(d.result_cd) ? '의결 결과 바꾸기' : '의결 결과 입력') + '</button>');
    }
    if ((cd === 'SUBMITTED' || cd === 'CONFIRMED') && v.can_rework === true) {
      b.push('<button type="button" id="bd-m-rwbtn" data-act="rework-open" aria-haspopup="dialog"' + (off ? ' disabled' : '') + '>재작성 요구</button>');
    }
    return b.length ? '<span class="bd-m-acts">' + b.join('') + '</span>' : '';
  };
  // 반려·재작성 요구로 작성 중이 된 자료의 사유 배너(DRAFT 일 때만)
  mat.returnHtml = function (d) {
    const r = d && d.last_return;
    if (str(d && d.status_cd) !== 'DRAFT' || !isObj(r)) return '';
    const ev = str(r.event_cd);
    if (ev !== 'REJECT' && ev !== 'REWORK') return '';
    const title = ev === 'REJECT' ? '제출이 반려되었습니다.' : '영업부장이 재작성을 요구했습니다.';
    const reason = str(r.reason).trim();
    return '<section class="bd-m-return" id="bd-m-return" aria-labelledby="bd-m-rt"><h3 id="bd-m-rt">' + esc(title) + '</h3>' +
      '<span class="bd-m-rmeta">' + esc(r.actor_name) + ' · <span class="mono">' + esc(mat.kst(r.logged_at)) + '</span></span>' +
      (reason ? '<p class="bd-m-reason"><b>사유</b>' + esc(reason) + '</p>'
              : '<p class="bd-m-reason">사유는 개인정보로 보이는 내용이 있어 표시하지 않습니다.</p>') +
      (viewerOf(d).is_assignee === true ? '<span class="bd-m-rmeta">고친 뒤 [버전 저장]을 하고 다시 제출해 주세요.</span>' : '') + '</section>';
  };
  // 잠금 줄(제출(결재 중)·확정이고 값을 고칠 수 없을 때, 작성 줄 자리). 해당 없으면 ''.
  mat.lockHtml = function (d) {
    const cd = str(d && d.status_cd), v = viewerOf(d);
    if ((cd !== 'SUBMITTED' && cd !== 'CONFIRMED') || v.can_write === true) return '';
    const asg = v.is_assignee === true;
    let t;
    if (cd === 'SUBMITTED') {
      const n = savedCount(d);
      t = asg ? '버전 ' + n + '을 제출해 결재 중입니다. 결재가 끝나거나 [제출 회수]를 할 때까지 값을 고칠 수 없습니다.'
              : '버전 ' + n + '이 결재 중입니다. 되돌려야 하면 [재작성 요구]를 눌러 주세요.';
    } else {
      const n = Number(d.confirmed_snap) > 0 ? Number(d.confirmed_snap) : savedCount(d);
      t = asg ? '확정된 자료입니다(버전 ' + n + '). 값은 고칠 수 없고 의결 결과와 개최일만 바꿀 수 있습니다. 값을 고쳐야 하면 영업부장에게 재작성 요구를 요청해 주세요.'
              : '확정된 자료입니다(버전 ' + n + '). 고쳐야 하면 [재작성 요구]로 작성 중으로 돌려보냅니다.';
    }
    return '<div class="bd-m-lock' + (cd === 'CONFIRMED' ? ' is-done' : '') + '" id="bd-m-lock"><p>' + esc(t) + '</p></div>';
  };
  // 제출 확인 줄. o: {n(제출할 버전), dirty, unchecked, busy}
  mat.submitRowHtml = function (o) {
    const x = o || {}, n = Number(x.n) || 0;
    if (Number(x.dirty) > 0) {
      return '<div class="bd-confirm bd-m-actrow" id="bd-m-subrow" role="group" aria-label="제출 확인"><span>저장하지 않은 수정 ' + esc(x.dirty) +
        '칸은 제출되지 않습니다. 먼저 [버전 저장]을 눌러 주세요.</span><button type="button" id="bd-m-subsave" class="bd-wb-main" data-act="sub-save">버전 저장하기</button>' +
        '<button type="button" data-act="sub-cancel">취소</button></div>';
    }
    return '<div class="bd-confirm bd-m-actrow" id="bd-m-subrow" role="group" aria-label="제출 확인"><span>버전 ' + esc(n) +
      '을 제출합니다. 영업팀장이 결재하고, 팀장이 이 건의 담당자이면 영업부장이 결재합니다. 결재가 끝나거나 회수할 때까지 담당자 모두 값을 고칠 수 없습니다.' +
      (Number(x.unchecked) > 0 ? ' 확인 안 한 표 ' + esc(x.unchecked) + '개(제출은 막지 않습니다)' : '') + '</span>' +
      '<button type="button" id="bd-m-subok" class="bd-wb-main" data-act="sub-ok"' + (x.busy ? ' disabled' : '') + '>' + (x.busy ? '제출하는 중…' : '버전 ' + esc(n) + ' 안건 제출') + '</button>' +
      '<button type="button" data-act="sub-cancel"' + (x.busy ? ' disabled' : '') + '>취소</button></div>';
  };
  // 의결 결과 폼. o: {result, date, busy, error, errField}
  mat.resultRowHtml = function (d, o) {
    const x = o || {}, cur = str(x.result) || 'SCHEDULED', need = cur === 'SCHEDULED';
    const opt = function (v) { return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + esc(RESULT_NAME[v]) + '</option>'; };
    const bad = x.error && x.errField === 'date';
    return '<div class="bd-confirm bd-m-actrow bd-m-result" id="bd-m-resrow" role="group" aria-label="의결 결과">' +
      '<label>의결 결과 <select id="bd-m-res"' + (x.busy ? ' disabled' : '') + '>' + opt('SCHEDULED') + opt('PASSED') + opt('REJECTED') + '</select></label>' +
      '<label>개최일 <span class="bd-m-req" id="bd-m-mreq">' + (need ? '(필수)' : '(선택)') + '</span> <input type="date" id="bd-m-mdate" value="' + esc(x.date) + '"' +
        (x.busy ? ' disabled' : '') + (bad ? ' aria-invalid="true" aria-describedby="bd-m-ferr"' : '') + '></label>' +
      '<button type="button" id="bd-m-resok" class="bd-wb-main" data-act="res-ok"' + (x.busy ? ' disabled' : '') + '>' + (x.busy ? '저장하는 중…' : '의결 결과 저장') + '</button>' +
      '<button type="button" data-act="res-cancel"' + (x.busy ? ' disabled' : '') + '>취소</button>' +
      (x.error && x.errField ? '<p class="bd-m-ferr" id="bd-m-ferr" role="alert">' + esc(x.error) + '</p>' : '') + '</div>';
  };
  // 재작성 요구 모달. o: {reason, busy, error}
  mat.reworkModalHtml = function (d, o) {
    const x = o || {}, n = str(x.reason).length, conf = str(d.status_cd) === 'CONFIRMED', has = str(x.reason).trim().length > 0;
    let desc;
    if (!conf) desc = '<p id="bd-m-rw-desc">결재 중인 제출을 끝내고 자료를 작성 중으로 돌려보냅니다. 담당자가 고쳐 다시 제출해야 합니다.</p>';
    else {
      const rn = str(d.result_cd) ? (RESULT_NAME[str(d.result_cd)] || str(d.result_name)) : '', md = mat.dateOf(d.meeting_date);
      desc = '<p class="bd-m-warn" id="bd-m-rw-desc">확정된 자료입니다. ' + (rn
        ? '재작성을 요구하면 확정이 풀리고 <b>의결 결과 \'' + esc(rn) + '\'' + (md ? '과 개최일(' + esc(md) + ')이' : '이(가)') + ' 지워집니다.</b> 지운 값은 작업 이력에만 남습니다.'
        : '재작성을 요구하면 확정이 풀립니다. 담당자가 고쳐 다시 제출하고 결재를 받아야 합니다.') + '</p>';
    }
    return '<div class="modal-overlay" id="bd-m-rw-ov"><div class="modal-box bd-m-modal" id="bd-m-rw" role="dialog" aria-modal="true" aria-labelledby="bd-m-rw-title" aria-describedby="bd-m-rw-desc">' +
      '<h3 id="bd-m-rw-title">재작성 요구 — ' + esc(mat.titleOf(d)) + '</h3>' + desc +
      '<label for="bd-m-rw-reason">사유 (필수, 200자까지) <span class="bd-m-cnt" id="bd-m-rw-cnt" aria-live="polite">' + n + '/200</span></label>' +
      '<textarea id="bd-m-rw-reason" rows="3" maxlength="200" aria-required="true"' + (x.error ? ' aria-invalid="true" aria-describedby="bd-m-rw-err"' : '') + (x.busy ? ' disabled' : '') + '>' + esc(x.reason) + '</textarea>' +
      (x.error ? '<p class="bd-m-ferr" id="bd-m-rw-err" role="alert">' + esc(x.error) + '</p>' : '') +
      '<p class="dg-hint">사유는 담당자 화면과 작업 이력에 그대로 보입니다. 이름·연락처 같은 개인정보는 적지 마세요.</p>' +
      '<div class="bd-m-modal-acts"><button type="button" id="bd-m-rw-cancel" data-act="rw-cancel"' + (x.busy ? ' disabled' : '') + '>취소</button>' +
      '<button type="button" id="bd-m-rw-ok" data-act="rw-ok"' + (x.busy || !has ? ' disabled' : '') + '>' +
      (x.busy ? '보내는 중…' : (conf ? '확정 풀고 재작성 요구' : '재작성 요구하기')) + '</button></div></div></div>';
  };
  // 오류 상자(020a 작성 화면과 같은 bd-w-rej 모양). e: {title, hint, btns:[[act,label]]}
  mat.actErrHtml = function (e) {
    return '<div class="bd-w-rej" id="bd-m-acterr" role="alert" tabindex="-1"><strong>' + esc(e.title) + '</strong>' + (e.hint ? '<p>' + esc(e.hint) + '</p>' : '') +
      (e.btns && e.btns.length ? '<div class="bd-w-rejbtns">' + e.btns.map(function (b) { return '<button type="button" data-act="' + esc(b[0]) + '">' + esc(b[1]) + '</button>'; }).join('') + '</div>' : '') + '</div>';
  };
  mat.headHtml = function (d, o) {
    const x = o || {};
    const snap = isObj(d.snapshot) ? d.snapshot : null, cur = savedCount(d);
    const saver = snap ? str(snap.saved_by_name) : '';
    const when = mat.kst(snap ? snap.saved_at : d.last_saved_at);
    const meta1 = cur ? '버전 ' + cur + ' · ' + (saver ? esc(saver) + ' ' : '') + '<span class="mono">' + esc(when) + '</span> 저장' : '저장 전';   // 문장 형태("아직 저장한 버전이 없습니다")는 작성 줄·본문에만 둔다
    const formName = isObj(d.form) ? str(d.form.name) : '';
    let confirmMeta = '';
    if (mat.PHASE_020B && str(d.status_cd) === 'CONFIRMED') {
      const cs = Number(d.confirmed_snap) > 0 ? Number(d.confirmed_snap) : 0, ca = mat.kst(d.confirmed_at);
      confirmMeta = (cs ? '<span>확정 버전 ' + cs + (ca ? ' · <span class="mono">' + esc(ca) + '</span>' : '') + '</span>' : '') +
        (str(d.result_cd) ? '' : '<span>의결 결과 입력 전</span>');
    }
    return '<button type="button" class="link-btn bd-m-back" id="bd-m-back" data-act="back">← 이사회 자료 목록</button>' +
      '<div class="bd-m-head"><h2 id="bd-m-title" tabindex="-1">' + esc(mat.titleOf(d)) + '</h2>' + mat.headBadgeHtml(d) + mat.resultBadgeHtml(d) + mat.headActsHtml(d, x) + '</div>' +
      '<div class="bd-m-meta"><span>' + meta1 + '</span><span>담당 ' + esc(mat.assigneesText(d)) + '</span>' +
      (formName ? '<span>양식 ' + esc(formName) + '</span>' : '') + confirmMeta + '</div>' +
      mat.returnHtml(d) + str(x.rowHtml);
  };
  const TABS = [['write', '작성'], ['ver', '버전 이력'], ['hist', '작업 이력']];
  const PANEL = { write: 'bd-body', ver: 'bd-m-hist', hist: 'bd-m-hist' };
  // isHead(영업부장): 고칠 수 없으므로 첫 탭 이름은 '내용'(담당자는 '작성')
  mat.tabsHtml = function (active, verCount, isHead) {
    return '<div class="ap-tabs bd-m-tabs" role="tablist" aria-label="이사회 자료 보기">' + TABS.map(function (t) {
      const on = t[0] === active;
      const label = (t[0] === 'write' && isHead ? '내용' : t[1]) + (t[0] === 'ver' && verCount > 0 ? ' ' + verCount : '');
      return '<button type="button" role="tab" id="bd-tab-' + t[0] + '" data-tab="' + t[0] + '" aria-selected="' + (on ? 'true' : 'false') +
        '" aria-controls="' + PANEL[t[0]] + '" tabindex="' + (on ? '0' : '-1') + '">' + esc(label) + '</button>';
    }).join('') + '</div>';
  };
  // ←/→ 로 이동(끝에서 처음으로), Home/End. 다른 키는 null.
  mat.tabKey = function (cur, key) {
    const ids = TABS.map(function (t) { return t[0]; }), i = ids.indexOf(cur);
    if (i < 0) return null;
    if (key === 'ArrowRight') return ids[(i + 1) % ids.length];
    if (key === 'ArrowLeft') return ids[(i + ids.length - 1) % ids.length];
    if (key === 'Home') return ids[0];
    if (key === 'End') return ids[ids.length - 1];
    return null;
  };
  mat.openErrorHtml = function (r) {
    return '<div class="bd-l-state"><p class="wf-empty bd-err" id="bd-m-err" role="alert" tabindex="-1">' + esc(r && r.error) + '</p>' +
      '<button type="button" data-act="back">목록으로</button></div>';
  };
  mat.errorBoxHtml = function (msg, act) {
    return '<div class="bd-l-state"><p class="wf-empty bd-err" role="alert">' + esc(msg) + '</p><button type="button" data-act="' + esc(act) + '">다시 불러오기</button></div>';
  };

  // ── 읽기 전용 표(영업부장·저장본 보기·버전 보기) ─────────────
  mat.fmtValue = function (v) {
    const s = str(v), m = /^(-?)(\d+)(\.\d+)?$/.exec(s);
    return m ? m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (m[3] || '') : s;
  };
  // ── 숫자 칸 표시·입력 해석(020a): 서버 BoardDocSpec.display 와 같은 규칙. board-write.js 도 이 함수를 쓴다 ─────────
  // 양식 칸의 unit·paren·sub_key·dec → {dec, unit, paren, subKey}. 새 필드가 없거나(옛 서버·옛 모양) 가공할 것이 없으면 null.
  // 직접 입력(텍스트) 칸(input 이고 mapped 아님)도 null — 숫자로 읽지 않는다. 이미 fmtOf 결과인 객체를 넘겨도 같은 결과.
  mat.fmtOf = function (cell) {
    if (!isObj(cell)) return null;
    if (!(has(cell, 'unit') || has(cell, 'paren') || has(cell, 'dec'))) return null;
    if (cell.input === true && cell.mapped !== true) return null;
    const dn = cell.dec == null ? NaN : Number(cell.dec);
    const dec = isFinite(dn) && dn >= 0 ? Math.floor(dn) : null, unit = str(cell.unit), paren = cell.paren === true;
    if (dec == null && unit === '' && !paren) return null;
    const sk = cell.subKey != null ? cell.subKey : cell.sub_key;
    return { dec: dec, unit: unit, paren: paren, subKey: paren ? (sk != null && str(sk) !== '' ? str(sk) : (str(cell.key) !== '' ? str(cell.key) + '_p' : null)) : null };
  };
  const DISP_NUM = /^-?(?:\d{1,13}|\d{1,3}(?:,\d{3}){1,4})(?:\.\d{1,2})?$/;
  // 소수 dec 자리 고정(HALF_UP) + 천 단위 쉼표. v 는 DISP_NUM 모양. 반올림 뒤 0 이면 부호 없음.
  function fixedNum(v, dec) {
    let s = str(v).replace(/,/g, ''), neg = false;
    if (s.charAt(0) === '-') { neg = true; s = s.slice(1); }
    const d = s.indexOf('.');
    let ip = d >= 0 ? s.slice(0, d) : s, fp = d >= 0 ? s.slice(d + 1) : '';
    if (fp.length > dec) {
      const up = fp.charAt(dec) >= '5';
      fp = fp.slice(0, dec);
      if (up) {
        const digits = (ip + fp).split('');
        let i = digits.length - 1;
        while (i >= 0) { if (digits[i] === '9') { digits[i] = '0'; i--; } else { digits[i] = String(Number(digits[i]) + 1); break; } }
        if (i < 0) digits.unshift('1');
        const all = digits.join('');
        ip = all.slice(0, all.length - dec); fp = all.slice(all.length - dec);
      }
    }
    while (fp.length < dec) fp += '0';
    const zero = /^0*$/.test(ip + fp);
    return (neg && !zero ? '-' : '') + ip.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec > 0 ? '.' + fp : '');
  }
  function shownPart(f, v, withUnit) {
    if (v === '' || !DISP_NUM.test(v) || (f.dec == null && f.unit === '')) return v;   // 숫자가 아니거나 가공 규칙이 없으면 그대로(단위도 붙이지 않는다)
    const body = f.dec != null ? fixedNum(v, f.dec) : v;
    return withUnit ? body + f.unit : body;
  }
  // 앞 값·괄호 안 값 표시 글자. 괄호 칸이 아니면 sub 는 ''.
  mat.displayParts = function (cell, main, sub) {
    const f = mat.fmtOf(cell), m = str(main).trim(), s = str(sub).trim();
    if (!f) return { main: m, sub: '', paren: false };
    if (f.paren) return { main: shownPart(f, m, false), sub: shownPart(f, s, false), paren: true };
    return { main: shownPart(f, m, true), sub: '', paren: false };
  };
  // 칸 표시 글자: 괄호 칸은 "앞 (괄호안)"(괄호 안이 비면 앞 값만), 단위는 숫자 뒤에.
  mat.display = function (cell, main, sub) {
    const p = mat.displayParts(cell, main, sub);
    if (!p.paren) return p.main;
    const m = str(main).trim(), s = str(sub).trim();
    if (m === '' && s === '') return '';
    return s === '' ? p.main : (m === '' ? '' : p.main + ' ') + '(' + p.sub + ')';
  };
  // 숫자 한 덩어리 해석 → {v, ok}. 공백·쉼표 제거, 칸 단위로 끝나면 뗌, 음수 -n·△n·▲n·(n). 빈 글자는 {'' , ok}.
  function numPart(f, x) {
    let s = str(x).replace(/[\s ,]/g, '');
    if (s === '') return { v: '', ok: true };
    if (f.unit !== '' && s.length > f.unit.length && s.slice(-f.unit.length) === f.unit) s = s.slice(0, -f.unit.length);
    let neg = false;
    if (/^[△▲]/.test(s)) { neg = true; s = s.slice(1); }
    else if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    else if (s.charAt(0) === '-') { neg = true; s = s.slice(1); }
    if (!/^\d+(\.\d+)?$/.test(s)) return { v: str(x).trim(), ok: false };
    return { v: (neg ? '-' : '') + s, ok: true };
  }
  // 사용자가 고친 글자 → {main, sub, ok}. 숫자 칸이 아니면(fmtOf null) 글자 그대로 {main: trim, sub: '', ok: true}.
  // ok 가 false 면 main 은 입력한 글자(trim) 그대로이고 sub 는 ''(서버·화면이 숫자 오류로 알린다).
  mat.parseCell = function (cell, text) {
    const f = mat.fmtOf(cell), raw = str(text).replace(/ /g, ' ').trim();
    if (!f) return { main: raw, sub: '', ok: true };
    const flat = raw.replace(/,/g, '');
    if (f.paren) {
      const m = /^([^\s()]+)\s*\(\s*([^()]*?)\s*\)$/.exec(flat);
      if (m) {
        const a = numPart(f, m[1]), b = numPart(f, m[2]);
        return a.ok && b.ok ? { main: a.v, sub: b.v, ok: true } : { main: raw, sub: '', ok: false };
      }
    }
    const w = numPart(f, flat);
    return w.ok ? { main: w.v, sub: '', ok: true } : { main: raw, sub: '', ok: false };
  };
  mat.baseOf = function (tables) {   // 저장본 tables → {ref:{칸키:값}}
    const out = {};
    (Array.isArray(tables) ? tables : []).forEach(function (t) {
      if (isObj(t) && t.ref != null && isObj(t.cells)) out[str(t.ref)] = t.cells;
    });
    return out;
  };
  function unitText(u) {
    const s = str(u).trim();
    if (s === '') return '';
    if (/^[(（]/.test(s)) return s;
    if (/^단위\s*[:：]/.test(s)) return '(' + s + ')';
    return '(단위: ' + s + ')';
  }
  function roCell(c, vals) {
    const o = isObj(c) ? c : { text: c };
    const header = o.header === true, tag = header ? 'th' : 'td';
    const isVal = o.mapped === true || o.input === true, key = str(o.key);
    let inner, num = false;
    if (isVal) {   // 값 칸은 저장한 값만 그린다(양식의 예시 숫자는 그리지 않는다)
      const v = has(vals, key) ? str(vals[key]) : '';
      const fm = mat.fmtOf(o), sv = fm && fm.paren && fm.subKey && has(vals, fm.subKey) ? str(vals[fm.subKey]) : '';
      if (v === '' && sv === '') inner = '<span class="dg-hint">—</span>';
      else if (fm) {   // 양식이 정한 표시(소수 자리·단위·괄호)로 — 작성 화면·워드와 같은 글자
        const pp = mat.displayParts(o, v, sv), f = mat.display(o, v, sv);
        inner = esc(f); num = /^-?[\d,]+(\.\d+)?$/.test(fm.paren ? pp.main : f);
      }
      else { const f = mat.fmtValue(v); inner = esc(f); num = /^-?[\d,]+(\.\d+)?$/.test(f); }
    } else inner = esc(o.text);
    const al = has(ALIGNS, o.align) ? o.align : (num ? 'right' : (header ? 'center' : 'left'));
    const cs = span(o.colspan), rs = span(o.rowspan);
    return '<' + tag + ' class="bd-a-' + al + (num ? ' bd-num' : '') + '"' + (cs > 1 ? ' colspan="' + cs + '"' : '') + (rs > 1 ? ' rowspan="' + rs + '"' : '') + '>' + inner + '</' + tag + '>';
  }
  function roTableHtml(ft, vals) {
    const rows = Array.isArray(ft.rows) ? ft.rows : [];
    const hasHead = rows.length > 0 && Array.isArray(rows[0]) && rows[0].some(function (c) { return c && c.header === true; });
    const cols = Array.isArray(ft.columns) ? ft.columns : [];
    const thead = (cols.length && !hasHead)
      ? '<thead><tr>' + cols.map(function (c) { return '<th class="bd-a-center" scope="col">' + esc(isObj(c) ? c.text : c) + '</th>'; }).join('') + '</tr></thead>' : '';
    const body = rows.map(function (r) { return '<tr>' + (Array.isArray(r) ? r : []).map(function (c) { return roCell(c, vals); }).join('') + '</tr>'; }).join('');
    const unit = unitText(ft.unit);
    const cap = (ft.title || unit) ? '<caption>' + esc(ft.title) + (unit ? '<span class="bd-unit">' + esc(unit) + '</span>' : '') + '</caption>' : '';
    const notes = Array.isArray(ft.notes) && ft.notes.length ? '<ul class="bd-notes">' + ft.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '';
    return '<section class="bd-card">' + (ft.mapping ? '<div class="bd-card-head"><span class="bd-map">' + esc(ft.mapping) + '</span></div>' : '') +
      '<div class="bd-table-wrap"><table class="bd-table">' + cap + thead + '<tbody>' + body + '</tbody></table></div>' + notes + '</section>';
  }
  // form: 서버 응답의 form(양식 구조), tables: 저장본의 tables([{ref,cells}])
  mat.readOnlyHtml = function (form, tables) {
    const fts = isObj(form) && Array.isArray(form.tables) ? form.tables : [];
    const base = mat.baseOf(tables);
    const any = Object.keys(base).some(function (r) { return Object.keys(base[r]).length > 0; });
    if (!fts.length) return '<p class="wf-empty bd-err" role="alert">' + esc(T.NO_FORM) + '</p>';
    if (!any) return '<p class="wf-empty">' + esc(T.NO_SNAP) + '</p>';
    return '<div class="bd-m-ro-tables">' + fts.map(function (ft) { return roTableHtml(ft, base[str(ft.ref != null ? ft.ref : ft.id)] || {}); }).join('') + '</div>';
  };
  // 작성 탭(읽기 전용): 영업부장이면 한 줄 안내 + 표
  mat.writeRoHtml = function (d, isHead) {
    return (isHead ? '<p class="bd-m-ro">영업부장은 이 자료를 읽기 전용으로 봅니다.</p>' : '') +
      mat.readOnlyHtml(d.form, isObj(d.snapshot) ? d.snapshot.tables : []);
  };

  // ── 버전 이력·작업 이력 ──────────────────────────────────
  mat.snapsHtml = function (items, cur) {
    const l = (items || []).slice().sort(function (a, b) { return Number(b.snap_no) - Number(a.snap_no); });
    if (!l.length) return '<p class="wf-empty">' + esc(T.NO_SNAP) + '</p>';
    return '<table class="ad-table"><caption class="bd-sr">버전 이력 ' + l.length + '개</caption><thead><tr><th scope="col">버전</th><th scope="col">저장한 사람</th>' +
      '<th scope="col">저장 시각</th><th scope="col">메모</th><th scope="col"><span class="bd-sr">보기</span></th></tr></thead><tbody>' + l.map(function (s) {
      const n = Number(s.snap_no);
      return '<tr><td class="mono bd-m-ver">v' + esc(n) + (n === Number(cur) ? ' <span class="bd-badge is-ink bd-m-cur">현재</span>' : '') + '</td>' +
        '<td>' + esc(s.saved_by_name) + '</td><td class="mono">' + esc(mat.kst(s.saved_at)) + '</td>' +
        '<td class="tm-t-reason">' + (str(s.note) ? esc(s.note) : '<span class="dg-hint">—</span>') + '</td>' +
        '<td><button type="button" data-act="snap" data-n="' + esc(n) + '" aria-label="버전 ' + esc(n) + ' 보기">보기</button></td></tr>';
    }).join('') + '</tbody></table>';
  };
  // v: {n, snap: GET /snapshots/{n} 응답}
  mat.snapViewHtml = function (v) {
    const s = isObj(v.snap) ? v.snap : {};
    const who = str(s.saved_by_name), when = mat.kst(s.saved_at);
    return '<div class="bd-m-viewbar"><strong id="bd-m-viewtitle" tabindex="-1">버전 ' + esc(Number(v.n)) + ' 보기</strong>' +
      '<span class="dg-hint">읽기 전용' + (when ? ' · ' + esc((who ? who + ' ' : '') + when) + ' 저장' : '') + '</span>' +
      '<button type="button" class="link-btn" id="bd-m-verlist" data-act="verlist">버전 목록으로</button></div>' +
      (str(s.note) ? '<p class="bd-m-snapnote">메모: ' + esc(s.note) + '</p>' : '') + mat.readOnlyHtml(s.form, s.tables);
  };
  mat.eventText = function (ev) {
    const nm = function (x) { return str(x) || '—'; };
    switch (str(ev && ev.event_cd)) {
      case 'CREATE': return '자료를 만들었습니다(준비 중)';
      case 'HANDOVER': return '작성본 인계: ' + nm(ev.from_name) + ' → ' + nm(ev.to_name);
      case 'SUBMIT': return '제출했습니다(결재 요청)';
      case 'WITHDRAW': return '제출을 회수했습니다(작성 중으로)';
      case 'REJECT': return '제출이 반려되었습니다(작성 중으로)';   // 반려 의견은 결재 단계 행에 있다 — 이력 행에는 사유가 없다
      case 'CONFIRM': return '승인되어 확정되었습니다';
      case 'REWORK': {
        const why = str(ev.reason).trim();
        const wasConfirmed = str(ev.from_status) === 'CONFIRMED';
        const fr = str(ev.from_result_name).trim();
        const head = wasConfirmed ? '재작성 요구(확정 해제' + (fr ? ', 의결 결과 ' + fr + ' 지움' : '') + ')' : '재작성 요구';
        return why ? head + ': ' + why : head;
      }
      case 'RESULT': {
        const md = mat.dateOf(ev.meeting_date);
        return '의결 결과: ' + (str(ev.from_result_name).trim() || '없음') + ' → ' + nm(ev.to_result_name) + (md ? ' · 개최일 ' + md : '');
      }
      default: return '기록';
    }
  };
  mat.histHtml = function (items) {
    const l = (items || []).slice().sort(function (a, b) { return ts(b.logged_at) - ts(a.logged_at); });
    if (!l.length) return '<p class="wf-empty">작업 이력이 없습니다.</p>';
    return '<table class="ad-table"><caption class="bd-sr">작업 이력 ' + l.length + '건</caption><thead><tr><th scope="col">시각</th>' +
      '<th scope="col">한 일</th><th scope="col">한 사람</th></tr></thead><tbody>' + l.map(function (e) {
      return '<tr><td class="mono">' + esc(mat.kst(e.logged_at)) + '</td><td class="tm-t-reason">' + esc(mat.eventText(e)) + '</td>' +
        '<td>' + esc(e.actor_name) + (e.emp_verified === false ? '<span class="ad-badge muted tm-selfrep">자기신고</span>' : '') + '</td></tr>';
    }).join('') + '</tbody></table>';
  };

  // ── DOM 컨트롤러 ─────────────────────────────────────────
  // env: {el(id), doFetch, epoch(), me()→{emp,name,role}, records(), regionNames(), nowYear(), forms()→[{form_id,name}],
  //       loadForms()→Promise, toForms(), teamBtn()→요소|null, write?: {start(c),redraw(),stop(),dirty(),askLeave(next),active()}}
  // 컨테이너: #bd-list(목록) · #bd-mat(자료 머리·탭) · #bd-m-hist(이력 탭) · #bd-body(작성 탭·양식 화면 공용) · #bd-head/#bd-controls(양식 화면)
  mat.createController = function (env) {
    const L = { status: 'idle', items: [], truncated: false, tok: 0, f: { q: '', status: '', year: '', assignee: '' } };
    let mine = null, mineErr = false, np = null, M = null, view = 'none', wired = false, built = false;
    let openerId = '', openTok = 0, searchTimer = 0;

    function $(id) { return env.el(id); }
    function me() { return (env.me && env.me()) || {}; }
    function isHead() { return me().role === '영업부장'; }
    // 감사 화면 이름: 담당자는 잠긴 자료를 봐도 board_write, 그 밖(영업부장·결재자)은 board_review
    function screen() { return mat.screenFor(!!(M && M.data && M.data.viewer && M.data.viewer.is_assignee === true)); }
    function canWriteNow() { return !isHead() && !!(M && M.data && M.data.viewer && M.data.viewer.can_write === true); }
    function liveDirty() { return env.write && env.write.dirty ? env.write.dirty() : 0; }
    function filtered() { const f = L.f; return !!(f.q.trim() || f.status || f.year || f.assignee.trim()); }
    function focusNode(n) { if (n && !n.disabled && n.focus) n.focus(); }
    function byAttr(scope, sel, attr, val) {
      if (!scope) return null;
      const l = scope.querySelectorAll(sel);
      for (let i = 0; i < l.length; i++) if (l[i].getAttribute(attr) === str(val)) return l[i];
      return null;
    }
    function setHidden(id, h) { const n = $(id); if (n) n.hidden = h; }
    function showView(v) {
      view = v;
      const write = !M || M.tab === 'write';
      setHidden('bd-list', v !== 'list');
      setHidden('bd-mat', v !== 'material');
      setHidden('bd-m-hist', !(v === 'material' && !write));
      setHidden('bd-f-backrow', v !== 'form');
      setHidden('bd-head', v !== 'form');
      setHidden('bd-controls', v !== 'form');
      setHidden('bd-body', !(v === 'form' || (v === 'material' && write)));
      const body = $('bd-body');   // 자료 화면에서는 작성 탭의 패널, 양식 화면에서는 탭이 없으니 역할을 뗀다
      if (body && body.setAttribute) {
        if (v === 'material') { body.setAttribute('role', 'tabpanel'); body.setAttribute('aria-labelledby', 'bd-tab-write'); }
        else { body.removeAttribute('role'); body.removeAttribute('aria-labelledby'); }
      }
    }
    // 화면을 다시 그려도(innerHTML) 포커스가 body 로 떨어지지 않게: 그리기 전 포커스 위치를 기억했다가 같은 버튼을 다시 찾아 준다.
    function focusKeyIn(scope) {
      const d = root.document, a = d && d.activeElement;
      if (!a || !scope || !scope.contains || !scope.contains(a) || !a.getAttribute) return null;
      return { dom: a.id || '', act: a.getAttribute('data-act') || '', did: a.getAttribute('data-id') || '' };
    }
    function refocus(scope, k) {
      if (!k || !scope) return;
      let n = k.dom ? $(k.dom) : null;
      if (!n && k.act) n = byAttrBoth(scope, k.act, k.did);
      focusNode(n);
    }
    function byAttrBoth(scope, act, did) {
      const l = scope.querySelectorAll('[data-act]');
      for (let i = 0; i < l.length; i++) {
        if (l[i].getAttribute('data-act') === act && (l[i].getAttribute('data-id') || '') === did) return l[i];
      }
      return null;
    }
    function formsOf() {
      const l = ((env.forms && env.forms()) || []).map(function (f) { return { id: str(f.form_id != null ? f.form_id : f.id), name: str(f.name) }; })
        .filter(function (f) { return f.id !== ''; });
      return l.length ? l : [{ id: 'default_doc', name: '기본 양식' }];
    }
    function casesNow() { return mat.casesFor(env.records && env.records(), mine || [], env.regionNames && env.regionNames()); }

    // ── 목록 ──
    function drawTop(focus) {
      const top = $('bd-l-top');
      if (!top) return;
      const head = isHead(), keep = focus ? null : focusKeyIn(top);
      top.innerHTML = mat.listHeadHtml({ isHead: head, showForms: !head, canCreate: !head && !!mine && mine.length > 0, newOpen: !!np }) +
        (np ? mat.newPanelHtml({ cases: casesNow(), np: np, items: L.items, forms: formsOf(), nowYear: env.nowYear() }) : '');
      if (keep) refocus(top, keep);
      if (focus === 'newbtn') focusNode($('bd-l-newbtn'));
      else if (focus === 'firstpick') focusNode(top.querySelector('input[name="bd-l-bc"]:checked') || top.querySelector('input[name="bd-l-bc"]'));
      else if (focus === 'err') focusNode($('bd-l-newerr'));
      else if (focus === 'year') focusNode($('bd-l-np-year'));
      else if (focus && focus.pick != null) focusNode(byAttr(top, 'input[name="bd-l-bc"]', 'value', focus.pick));
    }
    function drawRes() {
      const r = $('bd-l-res');
      if (!r) return;
      const keep = focusKeyIn(r), zero = L.status === 'ready' && !L.items.length;
      r.innerHTML = mat.resultHtml(L, { me: me().emp, isHead: isHead(), mine: mine ? mine.length : null, filtered: filtered(),
                                       mineError: mineErr, canTeam: !!(env.teamBtn && env.teamBtn()) });
      if (keep) refocus(r, keep);   // 목록을 다시 받아 그려도 열었던 행 버튼의 포커스를 잃지 않는다
      const c = $('bd-l-count'); if (c) c.textContent = mat.countText(L);
      // 결과 0건이면 빈 상태 쪽 [조건 지우기]만 둔다(같은 버튼이 둘 보이지 않게)
      const x = $('bd-l-clear'); if (x) x.hidden = !filtered() || zero;
      // 담당 건이 없는 사람(영업부장 아님)에게는 검색할 대상이 없다 — 조건도 없으면 검색 줄을 숨긴다
      setHidden('bd-l-bar', !isHead() && !!mine && mine.length === 0 && !filtered() && !L.items.length);
    }
    function loadMine() {
      if (isHead()) { mine = []; mineErr = false; return Promise.resolve(); }
      const ep = env.epoch();
      return mat.loadAssignments(env.doFetch).then(function (r) {
        if (ep !== env.epoch()) return;
        mineErr = !r.ok;
        mine = r.ok ? r.ids : null;   // 실패하면 '모름'(null) + 실패 표시 — '배정 없음'으로 보이지 않게
        if (!np) drawTop();
        drawRes();
      });
    }
    function loadList() {
      const t = ++L.tok, ep = env.epoch();
      if (L.status !== 'ready') { L.status = 'loading'; drawRes(); }
      return mat.loadList(env.doFetch, L.f).then(function (r) {
        if (t !== L.tok || ep !== env.epoch()) return;
        if (r.ok) { L.status = 'ready'; L.items = mat.sortItems(r.items); L.truncated = r.truncated; }
        else { L.status = 'error'; L.items = []; L.truncated = false; }
        drawRes();
      });
    }
    function reloadFiltered() { clearTimeout(searchTimer); drawRes(); loadList(); }
    function clearFilter() {
      L.f = { q: '', status: '', year: '', assignee: '' };
      const bar = $('bd-l-bar'); if (bar) bar.innerHTML = mat.searchHtml(L.f, env.nowYear());
      reloadFiltered();
      focusNode($('bd-l-q'));
    }

    // ── 새 자료 ──
    function openNew() {
      if (isHead() || !mine || !mine.length) return;
      const cases = casesNow();
      np = { bc: cases.length ? cases[0].id : '', year: env.nowYear(), formId: 'default_doc', busy: false, error: '', exist: 0 };
      drawTop('firstpick');
      if (env.loadForms) {
        env.loadForms().then(function () {
          const s = $('bd-l-np-form');
          if (np && s) s.innerHTML = mat.npFormOptions(formsOf(), np.formId);
        });
      }
    }
    function closeNew() { if (np && np.busy) return; np = null; drawTop('newbtn'); }
    function doCreate() {
      if (!np || np.busy || !np.bc) return;
      const p = np, ep = env.epoch();
      p.busy = true; p.error = '';
      const fs = $('bd-l-new'); if (fs) fs.setAttribute('aria-busy', 'true');
      const ok = $('bd-l-np-ok'); if (ok) { ok.disabled = true; ok.textContent = '만드는 중…'; }   // 두 번 누름 방지
      mat.createMaterial(env.doFetch, { bidCaseId: p.bc, year: p.year, formId: p.formId }).then(function (r) {
        if (ep !== env.epoch() || np !== p) return;
        p.busy = false;
        if (r.ok) {
          np = null; drawTop();
          openerId = '';   // 새로 만든 자료에서 목록으로 돌아올 때 예전에 열었던 행으로 가지 않게
          enterMaterial(r.material, str(r.material.institution_name) + ' ' + str(r.material.year) + '년 이사회 자료를 만들었습니다.');
          loadList();
          return;
        }
        if (r.exists) { p.exist = r.materialId; p.error = '이 입찰 건의 ' + p.year + '년 이사회 자료가 이미 있습니다. [자료 열기]로 열어 주세요.'; loadList(); }
        else p.error = r.error;
        drawTop('err');
      });
    }

    // ── 자료 ──
    function setMsg(t) { const n = $('bd-m-msg'); if (n) n.textContent = t || ''; }
    // 머리 아래 인라인 줄(제출 확인 / 의결 결과 폼)과 행동 오류 상자
    function rowHtml() {
      const u = M.ui, d = M.data;
      let h = '';
      if (u.open === 'submit') h += mat.submitRowHtml({ n: savedCount(d), dirty: u.dirty, unchecked: u.unchecked, busy: u.busy === 'submit' });
      else if (u.open === 'result' && u.res) h += mat.resultRowHtml(d, { result: u.res.result, date: u.res.date, busy: u.busy === 'result', error: u.res.error, errField: u.res.errField });
      if (u.err && u.err.type === 'box') h += mat.actErrHtml(u.err);
      return h;
    }
    function drawMat(keepMsg) {
      const n = $('bd-mat');
      if (!n || !M) return;
      const msg = keepMsg && $('bd-m-msg') ? $('bd-m-msg').textContent : '';
      n.innerHTML = mat.headHtml(M.data, { open: M.ui.open, busy: M.ui.busy, dirty: liveDirty(), rowHtml: rowHtml() }) +
        mat.tabsHtml(M.tab, savedCount(M.data), !canWriteNow()) + '<p id="bd-m-msg" class="bd-m-msg" role="status" aria-live="polite"></p>';
      setMsg(msg);
    }
    function enterMaterial(data, msg) {
      closeModal(false);
      M = { id: str(data.material_id), data: data, tab: 'write', wstarted: false, ui: { open: '', busy: '', err: null, res: null, rw: null, dirty: 0, unchecked: 0 },
            ver: { status: 'idle', items: [], view: null, err: '' }, hist: { status: 'idle', items: [], err: '' } };
      showView('material'); drawMat(false); setMsg(msg);
      setTab('write', false);
      focusNode($('bd-m-title'));
    }
    function openMaterial(id, fromPanel) {
      if (!mat.isId(id)) return;
      openerId = fromPanel ? '' : str(id);
      const t = ++openTok, ep = env.epoch();
      if (env.write) env.write.stop();
      np = null; if (fromPanel) drawTop();
      M = null; showView('material');
      $('bd-mat').innerHTML = mat.loadingHtml; $('bd-body').innerHTML = ''; $('bd-m-hist').innerHTML = '';
      mat.loadMaterial(env.doFetch, id, mat.UI.LIST, mat.BTN.OPEN).then(function (r) {
        if (t !== openTok || ep !== env.epoch()) return;
        if (!r.ok) { $('bd-mat').innerHTML = mat.openErrorHtml(r); focusNode($('bd-m-err')); return; }
        enterMaterial(r.material, '');
      });
    }
    function setTab(tab, focus) {
      if (!M) return;
      M.tab = tab;
      const btns = $('bd-mat').querySelectorAll('[role="tab"]');
      for (let i = 0; i < btns.length; i++) {
        const on = btns[i].getAttribute('data-tab') === tab;
        btns[i].setAttribute('aria-selected', on ? 'true' : 'false');
        btns[i].tabIndex = on ? 0 : -1;
        if (on && focus) btns[i].focus();
      }
      showView('material');
      const hp = $('bd-m-hist'); if (hp) hp.setAttribute('aria-labelledby', 'bd-tab-' + tab);
      if (tab === 'write') drawWrite(); else if (tab === 'ver') drawVer(); else drawHist();
    }
    // 작성 탭: 담당자(can_write)면 작성 컨트롤러, 아니면 읽기 전용 표
    function drawWrite() {
      const b = $('bd-body'), d = M.data;
      const canWrite = !isHead() && !!(d.viewer && d.viewer.can_write === true);
      if (canWrite && env.write) {
        if (M.wstarted && env.write.active()) { env.write.redraw(); return; }
        b.innerHTML = '';
        M.wstarted = !!env.write.start({
          mat: { id: M.id, bidCaseId: str(d.bid_case_id), snapNo: savedCount(d), savedLabel: mat.savedLabel(d) },
          form: d.form, snapshot: isObj(d.snapshot) ? d.snapshot : null });
        if (M.wstarted) return;
      }
      b.innerHTML = mat.lockHtml(d) + mat.writeRoHtml(d, isHead());
    }
    function drawVer() {
      const p = $('bd-m-hist'), cur = M;
      if (M.ver.view) { p.innerHTML = mat.snapViewHtml(M.ver.view); return; }
      if (M.ver.status === 'ready') { p.innerHTML = mat.snapsHtml(M.ver.items, savedCount(M.data)); return; }
      if (M.ver.status === 'error') { p.innerHTML = mat.errorBoxHtml(M.ver.err, 'ver-reload'); return; }
      p.innerHTML = mat.loadingHtml;
      if (M.ver.status === 'loading') return;
      M.ver.status = 'loading';
      mat.loadSnaps(env.doFetch, M.id, screen()).then(function (r) {
        if (M !== cur) return;
        if (r.ok) { M.ver.status = 'ready'; M.ver.items = r.items; } else { M.ver.status = 'error'; M.ver.err = r.error; }
        if (M.tab === 'ver') drawVer();
      });
    }
    function drawHist() {
      const p = $('bd-m-hist'), cur = M;
      if (M.hist.status === 'ready') { p.innerHTML = mat.histHtml(M.hist.items); return; }
      if (M.hist.status === 'error') { p.innerHTML = mat.errorBoxHtml(M.hist.err, 'hist-reload'); return; }
      p.innerHTML = mat.loadingHtml;
      if (M.hist.status === 'loading') return;
      M.hist.status = 'loading';
      mat.loadHistory(env.doFetch, M.id, screen()).then(function (r) {
        if (M !== cur) return;
        if (r.ok) { M.hist.status = 'ready'; M.hist.items = r.items; } else { M.hist.status = 'error'; M.hist.err = r.error; }
        if (M.tab === 'hist') drawHist();
      });
    }
    function openSnap(n) {
      if (!M || !(n >= 1)) return;
      const cur = M;
      mat.loadSnap(env.doFetch, M.id, n, screen()).then(function (r) {
        if (M !== cur) return;
        if (!r.ok) { setMsg(r.error); return; }
        M.ver.view = { n: n, snap: r.snap };
        if (M.tab === 'ver') { drawVer(); focusNode($('bd-m-viewtitle')); }
      });
    }
    function guardLeave(next) {   // 저장하지 않은 수정이 있으면 작성 탭에서 인라인으로 먼저 묻는다
      if (env.write && M && env.write.dirty() > 0) {
        if (M.tab !== 'write') setTab('write', false);
        env.write.askLeave(next);
        return;
      }
      next();
    }
    function toList() {
      openTok++;
      if (env.write) env.write.stop();
      const id = M ? M.id : '';
      closeModal(false);
      M = null;
      ['bd-body', 'bd-m-hist', 'bd-mat'].forEach(function (k) { const n = $(k); if (n) n.innerHTML = ''; });
      showView('list');
      loadList();
      focusNode(byAttr($('bd-list'), 'button.bd-l-open', 'data-id', openerId || id) || $('bd-l-newbtn') || $('bd-l-q'));
    }
    function backToList() { guardLeave(toList); }
    // 최신 머리를 받았을 때(저장 뒤·409 뒤): 머리를 갱신하고 버전·작업 이력 캐시를 비운다(다음에 열 때 다시 받는다)
    function setHead(data) {
      if (!M || !isObj(data) || str(data.material_id) !== M.id) return;
      M.data = data; M.ver.status = 'idle'; M.ver.view = null; M.hist.status = 'idle';
      drawMat(true);
    }

    // ── 020b 행동: 제출·회수·의결 결과·재작성 요구 ──
    function reloadMat(msg) {   // 화면을 비우고 최신 자료를 다시 연다(작성 중이던 값은 버려진다)
      if (!M) return;
      const id = M.id, t = ++openTok, ep = env.epoch();
      mat.loadMaterial(env.doFetch, id, screen(), mat.BTN.REFRESH).then(function (r) {
        if (t !== openTok || ep !== env.epoch()) return;
        if (!r.ok) { setMsg(r.error); return; }
        if (env.write) env.write.stop();
        enterMaterial(r.material, msg || '최신 내용을 불러왔습니다.');
      });
    }
    function closeRow(focusId) {
      if (!M) return;
      M.ui.open = ''; M.ui.err = null; drawMat(true);
      focusNode($(focusId));
    }
    function openSubmit() {
      if (!M || M.ui.busy) return;
      M.ui.open = 'submit'; M.ui.err = null; M.ui.dirty = liveDirty();
      M.ui.unchecked = env.write && env.write.unchecked ? env.write.unchecked() : 0;
      drawMat(true);
      focusNode($(M.ui.dirty > 0 ? 'bd-m-subsave' : 'bd-m-subok'));
    }
    function openResult() {
      if (!M || M.ui.busy) return;
      const d = M.data;
      M.ui.open = 'result'; M.ui.err = null;
      M.ui.res = { result: str(d.result_cd) || 'SCHEDULED', date: mat.dateOf(d.meeting_date), error: '', errField: '' };
      drawMat(true);
      focusNode($('bd-m-res'));
    }
    // 성공하면 최신 상세를 받아 머리·버튼·잠금 줄을 새로 그린다(이력 캐시도 비워진다). 포커스는 #bd-m-title.
    function afterOk(kind, x, seen) {
      const msg = mat.okText(kind, x.body, { seen: seen }), cur = M, ep = env.epoch();
      mat.loadMaterial(env.doFetch, cur.id, screen(), mat.BTN.REFRESH).then(function (r) {
        if (M !== cur || ep !== env.epoch()) return;
        if (!r.ok) {
          cur.ui.open = ''; cur.ui.busy = ''; closeModal(false); drawMat(true);
          setMsg(msg + ' 최신 내용은 [새로 고치기]로 확인해 주세요.');
          return;
        }
        if (env.write) env.write.stop();
        enterMaterial(r.material, msg);
      });
    }
    function doAct(kind, p) {
      if (!M || M.ui.busy) return;
      const cur = M, ep = env.epoch(), seen = savedCount(cur.data);
      cur.ui.busy = kind; cur.ui.err = null;
      if (cur.ui.res) { cur.ui.res.error = ''; cur.ui.res.errField = ''; }
      drawMat(true);
      mat.actCall(env.doFetch, kind, cur.id, p).then(function (x) {
        if (M !== cur || ep !== env.epoch()) return;
        cur.ui.busy = '';
        if (x.ok) { afterOk(kind, x, seen); return; }
        const e = mat.actError(kind, x);
        if (e.type === 'field' && kind === 'result' && cur.ui.res) {
          cur.ui.res.error = e.text; cur.ui.res.errField = e.field; drawMat(true); focusNode($('bd-m-mdate'));
        } else if (e.type === 'field' && kind === 'rework' && cur.ui.rw) {
          cur.ui.rw.busy = false; cur.ui.rw.error = e.text; drawMat(true); drawModal(); focusNode($('bd-m-rw-reason'));
        } else {
          cur.ui.open = ''; cur.ui.err = e.type === 'box' ? e : { type: 'box', title: '처리하지 못했습니다.', hint: e.text, btns: [['refresh', '새로 고치기']] };
          if (cur.ui.rw) { cur.ui.rw = null; drawModal(); }
          drawMat(true);
          focusNode($('bd-m-acterr'));
        }
      });
    }
    function doSubmit() {
      if (!M) return;
      if (liveDirty() > 0) { openSubmit(); return; }   // 그 사이 고친 칸이 생겼으면 저장부터
      doAct('submit');
    }
    function doResult() {
      if (!M || !M.ui.res) return;
      const sel = $('bd-m-res'), dt = $('bd-m-mdate');
      const r = M.ui.res;
      if (sel) r.result = sel.value;
      if (dt) r.date = dt.value;
      if (r.result === 'SCHEDULED' && !r.date) {   // 요청하지 않고 칸 오류로 알린다
        r.error = '의결 예정이면 개최일을 입력해 주세요.'; r.errField = 'date';
        drawMat(true); focusNode($('bd-m-mdate'));
        return;
      }
      doAct('result', { result: r.result, date: r.date });
    }
    function drawModal() {
      const n = $('bd-m-modal');
      if (!n) return;
      n.innerHTML = M && M.ui.rw ? mat.reworkModalHtml(M.data, M.ui.rw) : '';
    }
    function closeModal(refocus) {
      if (M && M.ui) M.ui.rw = null;
      drawModal();
      if (refocus) focusNode($('bd-m-rwbtn'));
    }
    function openRework() {
      if (!M || M.ui.busy) return;
      M.ui.rw = { reason: '', busy: false, error: '' }; M.ui.err = null;
      drawModal();
      focusNode($('bd-m-rw-reason'));
    }
    function doRework() {
      if (!M || !M.ui.rw || M.ui.rw.busy) return;
      const ta = $('bd-m-rw-reason'), reason = (ta ? ta.value : M.ui.rw.reason).trim();
      if (!reason) return;
      M.ui.rw.reason = reason; M.ui.rw.busy = true; M.ui.rw.error = '';
      drawModal();
      doAct('rework', { reason: reason });
    }
    function onModalClick(e) {
      const b = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b || b.disabled || !M || !M.ui.rw) return;
      const a = b.getAttribute('data-act');
      if (a === 'rw-cancel') { if (!M.ui.rw.busy) closeModal(true); }
      else if (a === 'rw-ok') doRework();
    }
    function onModalInput(e) {
      const t = e.target;
      if (!t || t.id !== 'bd-m-rw-reason' || !M || !M.ui.rw) return;
      M.ui.rw.reason = t.value;
      const c = $('bd-m-rw-cnt'); if (c) c.textContent = t.value.length + '/200';
      const ok = $('bd-m-rw-ok'); if (ok && !M.ui.rw.busy) ok.disabled = t.value.trim().length === 0;
      if (M.ui.rw.error) {   // 사유를 고치기 시작하면 칸 오류를 지운다
        M.ui.rw.error = '';
        const er = $('bd-m-rw-err'); if (er && er.parentNode) er.parentNode.removeChild(er);
        t.removeAttribute('aria-invalid'); t.removeAttribute('aria-describedby');
      }
    }
    function onModalKey(e) {   // Tab 은 모달 안에서만 돈다(Esc 는 document 핸들러)
      if (e.key !== 'Tab' || !M || !M.ui.rw) return;
      const box = $('bd-m-modal');
      const list = Array.prototype.filter.call(box.querySelectorAll('button, input, textarea, a[href]'), function (n) {
        return !n.disabled && n.getClientRects().length > 0;
      });
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0], last = list[list.length - 1], a = root.document && root.document.activeElement;
      if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (a === last || !box.contains(a))) { e.preventDefault(); first.focus(); }
    }
    function onDocKey(e) {
      if (e.key === 'Escape' && M && M.ui && M.ui.rw && !M.ui.rw.busy && view === 'material') { e.preventDefault(); closeModal(true); }
    }
    function onMatChange(e) {
      const t = e.target;
      if (!t || !M || !M.ui.res) return;
      if (t.id === 'bd-m-res') {
        M.ui.res.result = t.value;
        const q = $('bd-m-mreq'); if (q) q.textContent = t.value === 'SCHEDULED' ? '(필수)' : '(선택)';
      } else if (t.id === 'bd-m-mdate') M.ui.res.date = t.value;
      else return;
      if (M.ui.res.error || M.ui.res.errField) {   // 값을 바꾸면 칸 오류를 지운다
        M.ui.res.error = ''; M.ui.res.errField = '';
        const er = $('bd-m-ferr'); if (er && er.parentNode) er.parentNode.removeChild(er);
        const dt = $('bd-m-mdate');
        if (dt) { dt.removeAttribute('aria-invalid'); dt.removeAttribute('aria-describedby'); }
      }
    }
    // 작성 줄의 수정 칸 수가 바뀌면 머리 [안건 제출]의 틸을 맞춘다(머리를 다시 그리지 않고 클래스만 바꾼다)
    function syncSubmitTeal() {
      const s = $('bd-m-submit');
      if (!M || !s || str(M.data.status_cd) !== 'DRAFT' || !s.classList) return;
      if (mat.headMainOn(M.ui.open, liveDirty())) s.classList.add('bd-wb-main'); else s.classList.remove('bd-wb-main');
    }

    function onListClick(e) {
      const b = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b || b.disabled) return;
      const a = b.getAttribute('data-act');
      if (a === 'open') openMaterial(b.getAttribute('data-id'), false);
      else if (a === 'open-exist') openMaterial(b.getAttribute('data-id'), true);
      else if (a === 'new') openNew();
      else if (a === 'newclose') closeNew();
      else if (a === 'create') doCreate();
      else if (a === 'clear') clearFilter();
      else if (a === 'reload') loadList();
      else if (a === 'reload-mine') { mineErr = false; mine = null; drawRes(); loadMine(); }
      else if (a === 'forms') { if (env.toForms) env.toForms(); }
      else if (a === 'team') { const t = env.teamBtn && env.teamBtn(); if (t) t.click(); }
    }
    function onListChange(e) {
      const t = e.target;
      if (!t || !t.getAttribute) return;
      const f = t.getAttribute('data-f');
      if (f === 'status' || f === 'year') { L.f[f] = t.value; reloadFiltered(); return; }
      if (!np) return;
      if (t.name === 'bd-l-bc') { np.bc = t.value; np.error = ''; np.exist = 0; drawTop({ pick: t.value }); }
      else if (t.id === 'bd-l-np-year') { np.year = Number(t.value) || np.year; np.error = ''; np.exist = 0; drawTop('year'); }
      else if (t.id === 'bd-l-np-form') np.formId = t.value;
    }
    function onListInput(e) {
      const t = e.target, f = t && t.getAttribute ? t.getAttribute('data-f') : null;
      if (f !== 'q' && f !== 'assignee') return;
      L.f[f] = t.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(reloadFiltered, 400);   // 입력을 멈추고 400ms 뒤 조회(Enter 는 바로)
    }
    function onListKey(e) {
      const t = e.target, f = t && t.getAttribute ? t.getAttribute('data-f') : null;
      if (e.key === 'Enter' && (f === 'q' || f === 'assignee')) { e.preventDefault(); reloadFiltered(); }
      else if (e.key === 'Escape' && np && !np.busy && t && t.closest && t.closest('#bd-l-new')) { e.preventDefault(); closeNew(); }
    }
    function onMatClick(e) {
      const b = e.target && e.target.closest ? e.target.closest('[data-act],[data-tab]') : null;
      if (!b) return;
      if (b.getAttribute('data-tab')) { setTab(b.getAttribute('data-tab'), false); return; }
      const a = b.getAttribute('data-act');
      if (b.disabled) return;
      if (a === 'back') backToList();
      else if (a === 'submit-open') { if (M && M.ui.open === 'submit') closeRow('bd-m-submit'); else openSubmit(); }
      else if (a === 'sub-cancel') closeRow('bd-m-submit');
      else if (a === 'sub-ok') doSubmit();
      else if (a === 'sub-save') {   // 저장하지 않은 수정이 있으면 작성 줄의 [버전 저장]으로 보낸다(제출 줄은 닫는다)
        if (M) { M.ui.open = ''; drawMat(true); }
        const sv = $('bd-m-save');
        if (sv && !sv.disabled) sv.click();
      }
      else if (a === 'withdraw') doAct('withdraw');
      else if (a === 'result-open') { if (M && M.ui.open === 'result') closeRow('bd-m-resbtn'); else openResult(); }
      else if (a === 'res-cancel') closeRow('bd-m-resbtn');
      else if (a === 'res-ok') doResult();
      else if (a === 'rework-open') openRework();
      else if (a === 'refresh') reloadMat('최신 내용을 불러왔습니다.');
    }
    function onMatKey(e) {
      const t = e.target;
      if (e.key === 'Escape' && M && !M.ui.busy && t && t.closest) {   // 인라인 줄 안에서 Esc → 닫고 연 버튼으로
        if (t.closest('#bd-m-subrow')) { e.preventDefault(); closeRow('bd-m-submit'); return; }
        if (t.closest('#bd-m-resrow')) { e.preventDefault(); closeRow('bd-m-resbtn'); return; }
      }
      if (!M || !t || !t.getAttribute || t.getAttribute('role') !== 'tab') return;
      const nx = mat.tabKey(M.tab, e.key);
      if (nx) { e.preventDefault(); setTab(nx, true); }
    }
    function onHistClick(e) {
      const b = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b || b.disabled || !M) return;
      const a = b.getAttribute('data-act');
      if (a === 'snap') openSnap(Number(b.getAttribute('data-n')));
      else if (a === 'verlist') {
        const n = M.ver.view ? M.ver.view.n : 0;
        M.ver.view = null; drawVer();
        focusNode(byAttr($('bd-m-hist'), 'button[data-act="snap"]', 'data-n', n));
      } else if (a === 'ver-reload') { M.ver.status = 'idle'; drawVer(); }
      else if (a === 'hist-reload') { M.hist.status = 'idle'; drawHist(); }
    }

    function build() {
      const l = $('bd-list');
      if (!l) return;
      if (!built) {
        built = true;
        l.innerHTML = '<div id="bd-l-top"></div><div id="bd-l-bar"></div><div id="bd-l-res"></div>';
        $('bd-l-bar').innerHTML = mat.searchHtml(L.f, env.nowYear());
        drawTop(); drawRes();
      }
      if (!wired) {   // 컨테이너 요소는 계속 같다 — 한 번만 건다
        wired = true;
        l.addEventListener('click', onListClick);
        l.addEventListener('change', onListChange);
        l.addEventListener('input', onListInput);
        l.addEventListener('keydown', onListKey);
        $('bd-mat').addEventListener('click', onMatClick);
        $('bd-mat').addEventListener('keydown', onMatKey);
        $('bd-mat').addEventListener('change', onMatChange);
        $('bd-mat').addEventListener('input', onMatChange);
        const wb = $('bd-body');
        if (wb && typeof MutationObserver !== 'undefined') new MutationObserver(syncSubmitTeal).observe(wb, { childList: true, subtree: true, characterData: true });
        const md = $('bd-m-modal');
        if (md) {
          md.addEventListener('click', onModalClick);
          md.addEventListener('input', onModalInput);
          md.addEventListener('keydown', onModalKey);
        }
        if (root.document && root.document.addEventListener) root.document.addEventListener('keydown', onDocKey);
        $('bd-m-hist').addEventListener('click', onHistClick);
      }
    }
    function mount() {
      build();
      if (view === 'none') showView('list');
      if (view === 'list') { loadMine(); loadList(); }
    }
    function reset() {
      L.tok++; openTok++; clearTimeout(searchTimer);
      L.status = 'idle'; L.items = []; L.truncated = false; L.f = { q: '', status: '', year: '', assignee: '' };
      closeModal(false);
      mine = null; mineErr = false; np = null; M = null; view = 'none'; built = false; openerId = '';
      if (env.write) env.write.stop();
      ['bd-list', 'bd-mat', 'bd-m-hist'].forEach(function (k) { const n = $(k); if (n) n.innerHTML = ''; });
    }

    return {
      mount: mount, reset: reset, view: function () { return view; },
      showForm: function () { showView('form'); },
      leaveForm: function () {   // 양식 화면 → 목록
        const b = $('bd-body'); if (b) b.innerHTML = '';
        showView('list'); loadMine(); loadList();
        focusNode(byAttr($('bd-list'), 'button[data-act="forms"]', 'data-act', 'forms') || $('bd-l-q'));
      },
      // ── 작성 탭(2부)이 쓰는 입구 ──
      toList: toList,
      head: function (id) { return mat.loadMaterial(env.doFetch, id, mat.UI.WRITE, mat.BTN.REFRESH); },
      afterSaved: function () {   // 저장 뒤 머리(버전·저장자)를 새로 받는다. 버전 이력은 다음에 열 때 다시 받는다
        if (!M) return;
        const cur = M, ep = env.epoch();
        mat.loadMaterial(env.doFetch, cur.id, mat.UI.WRITE, mat.BTN.REFRESH).then(function (r) {
          if (M !== cur || ep !== env.epoch() || !r.ok) return;
          setHead(r.material);
          if (env.write && env.write.setSavedLabel) env.write.setSavedLabel(mat.savedLabel(r.material));   // 요약 줄은 방금 저장한 사람·시각으로
        });
      },
      setHead: setHead,
      reload: reloadMat,
      showSnap: function (n) { if (M) { setTab('ver', false); openSnap(n); } }
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = mat;
  else root.boardMat = mat;
})(typeof self !== 'undefined' ? self : this);
