(function (root) {
  'use strict';
  // 제안서 사전준비 프로세스 — 준비중 화면 자리(#tab-soon 안 #pp-root, 고정 id 'soon:사전준비')에서 열린다.
  // 지도 팝오버의 [제안 확정]·[사전준비 열기]와 입찰 현황판의 같은 버튼이 이 파일의 순수 함수(popoverAction 등)를 함께 쓴다.
  // 규격: handoff/agents/design-reviewer/2026-11-11_1421_a3b0ec71.md §5·§6.
  //
  // 서버 계약: GET/POST /preps · GET /bidcases/{id}/prep(상세·viewer 플래그) · .../prep/history ·
  //   POST .../prep/unconfirm|cancel|open-requests|plan-approval-requests|start-writing · POST .../prep/tasks/{cd}/check|uncheck ·
  //   PUT|DELETE .../prep/tasks/T3/confirmed-file · GET|POST .../prep/attachments · GET .../attachments/{id}/content · POST .../void ·
  //   POST /approval-requests/{id}/cancel · GET /assignment-candidates
  // 버튼을 보일지는 서버 viewer·task 플래그를 따른다(화면이 권한을 새로 해석하지 않는다).
  // 이 파일은 순수 함수(위)와 DOM 배선(아래)으로 나뉜다. 순수 함수만 node 테스트 대상이다.
  const prep = {};
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const errtext = isNode ? require('./errtext.js') : root.errtext;
  const tm = isNode ? require('./team.js') : root.tm;

  prep.SOON_ID = 'soon:사전준비';                      // nav.PREP_ID와 같아야 한다(테스트가 대조)
  prep.VIEW_ROLES = ['영업팀', '영업팀장', '영업부장'];   // nav.TEAM_ROLES와 같아야 한다
  prep.CONFIRM_ROLES = ['영업팀', '영업팀장'];          // 제안 확정은 영업부장이 하지 않는다
  prep.LEAD = '영업팀장';
  prep.MAX = 10;
  prep.REASON_MAX = 200;
  prep.TABS = [{ key: 'active', label: '진행 중' }, { key: 'closed', label: '취소·중단' }];
  prep.STATE_ORDER = ['CONFIRMED', 'OPEN_PENDING', 'IN_PROGRESS', 'APPROVAL_PENDING', 'WRITABLE', 'WRITING', 'CANCELLED'];
  const TASK_STATES = ['IN_PROGRESS', 'APPROVAL_PENDING', 'WRITABLE', 'WRITING'];
  const AFTER_PLAN = ['APPROVAL_PENDING', 'WRITABLE', 'WRITING'];   // 기획승인 요청 뒤 — 완료 취소는 확인 줄을 한 번 거친다

  // ── 문구 (규격 §5) ───────────────────────────────────────────────
  const T = {
    loading: '불러오는 중…',
    retry: '다시 시도',
    listErr: '사전준비 목록을 불러오지 못했습니다.',
    detailErr: '이 건의 준비 과제를 불러오지 못했습니다.',
    file: '서버에 연결된 상태에서만 쓸 수 있는 화면입니다.',
    login: '로그인이 필요합니다. 사번으로 로그인해 주세요.',
    forbidden: function (roleLabel) {
      return '이 화면은 영업팀·영업팀장·영업부장이 쓰는 화면입니다. 지금 계정(' + (roleLabel || '소속 없음') + ')으로는 볼 수 없습니다.';
    },
    emptyActive: '제안 확정한 기관이 없습니다. 전국 지도에서 기관을 고르고 [제안 확정]을 누르면 여기에 나타납니다.',
    emptyClosed: '취소하거나 중단한 건이 없습니다.',
    emptyQuery: function (q) { return '\'' + q + '\'와 맞는 기관이 없습니다.'; },
    openMap: '전국 지도 열기',
    pick: '왼쪽 목록에서 기관을 고르세요. 진행 단계와 준비 과제가 여기에 보입니다.',
    noView: '이 건의 상세를 볼 수 없습니다. 영업팀장·영업부장은 모든 건을, 영업팀은 확정됨 건(승인 대기 중에는 신청자도)을, 그 밖에는 담당자(중단된 건은 옛 담당자)만 볼 수 있습니다.',
    noViewShort: '열람 권한 없음',
    notFound: '이 건을 찾을 수 없습니다. 목록을 새로 고쳐 주세요.',
    noAssignees: '담당 미정',
    readonly: '읽기 전용입니다. 과제 체크와 파일 올리기는 담당자만 합니다.',
    tasksLater: '개설 신청이 승인되면 준비 과제가 열립니다.',
    manualHint: '다 마쳤으면 [완료로 표시]를 누르세요. 작성 화면은 준비 중입니다.',
    notDone: '아직 완료되지 않았습니다.',
    autoRule: '자동으로 판정됩니다.',
    autoDone: '완료 · 자동 확인',
    naT4: '해당 없음 — RFP가 등록되지 않은 기관입니다.',
    na: '해당 없음',
    openOnlySales: '개설 신청은 영업팀·영업팀장이 합니다.',
    openPending: '개설 신청이 승인을 기다리고 있습니다.',
    planPending: '영업부장 기획승인을 기다리고 있습니다. 회수는 [결재함 › 내가 올린 요청]에서 합니다.',
    planNoStart: '기획승인을 받으면 켜집니다.',
    startNoYet: '필수 과제를 마치고 영업부장 기획승인을 받으면 켜집니다.',
    startOnlyAssignee: '제안서 작성 시작은 담당자가 합니다.',
    planOnlyAssignee: '기획승인 요청은 담당자가 합니다.',
    planCannot: '지금은 기획승인을 요청할 수 없습니다.',
    abortNoPlan: '기획승인 요청 중에는 중단할 수 없습니다.',
    writing: '제안서 작성 중입니다.',
    toWorkflow: '제안서 진행 현황 열기',
    planConfirm: '영업부장에게 기획승인을 요청합니다. 요청 중에는 중단할 수 없습니다.',
    startConfirm: '작성을 시작하면 영업·전산·재무 세 팀 작업이 만들어지고 [제안서 진행 현황]에 나타납니다. 되돌릴 수 없습니다.',
    uncheckConfirm: '기획승인 요청 뒤입니다. 완료를 취소하면 기획승인·작성 시작이 막힙니다.',
    closeAsk: '적은 내용이 사라집니다. 닫을까요?',
    fileHint: 'HWPX·PDF·xlsx·docx, 한 파일 30MB 이하',
    fileEmpty: '아직 올린 파일이 없습니다. 수익성 분석표를 올리고 확정본으로 지정하면 이 과제가 완료됩니다.',
    uploading: '올리는 중…',
    uploadWait: '검사하는 데 시간이 걸릴 수 있습니다.',
    uncheckedWhy: '글자를 읽을 수 없는 파일(스캔 PDF 등)이라 개인정보 검사를 하지 못했습니다.',
    selfReport: '로그인 신원을 확인하지 않은 기록입니다',
    cancelBanner: function (stateName, reason) {
      return '\'' + stateName + '\'' + (reason ? ' — 사유: ' + reason : '');   // 사유가 null(열람 권한 밖)이면 사유 칸을 생략한다
    },
    network: '서버에 연결하지 못해 처리되지 않았습니다. 잠시 뒤 다시 시도하세요.',
    noWrite: '이 작업을 할 권한이 없습니다.',
    generic: '처리하지 못했습니다. 화면을 새로 고친 뒤 다시 하세요.',
    pii: '의견(사유)에 개인정보로 보이는 내용이 있습니다. 그 부분을 지우고 다시 올리세요.',
    // 성공 문구(행위 이름과 결과 이름을 맞춘다)
    okConfirm: function (name) { return name + prep.josa(name, '을', '를') + ' 제안 확정했습니다. 다음은 [개설 신청]입니다.'; },
    okRevived: '확정을 취소했던 건을 다시 확정했습니다.',
    okOpen: '개설 신청을 올렸습니다. 승인되면 지명한 담당자에게 준비 과제가 열립니다.',
    okCheck: function (n) { return '\'' + n + '\'를 완료로 표시했습니다.'; },
    okUncheck: function (n) { return '\'' + n + '\'의 완료를 취소했습니다.'; },
    okPlan: '영업부장에게 기획승인을 요청했습니다.',
    okStart: '제안서 작성을 시작했습니다. 세 팀 작업이 [제안서 진행 현황]에 생겼습니다.',
    okUnconfirm: '제안 확정을 취소했습니다.',
    okAbort: '사전준비를 중단했습니다. 담당 배정이 풀렸습니다.',
    okWithdraw: '개설 신청을 회수했습니다. 담당자를 다시 지명해 [개설 신청]을 올릴 수 있습니다.',
    okUpload: function (f) { return '\'' + f + '\'을 올렸습니다.'; },
    okSetConfirmed: function (f) { return '\'' + f + '\'을 수익성 분석표 확정본으로 지정했습니다.'; },
    okClearConfirmed: function (f) { return '\'' + f + '\'의 확정본 지정을 해제했습니다.'; },
    okVoid: function (f) { return '\'' + f + '\'을 무효 처리했습니다.'; },
    warnTail: ' 필요 없는 정보면 지운 파일을 다시 올리고 이 파일은 무효 처리하세요.',
  };
  prep.T = T;

  // 오류 코드 → 문구·후속 동작(§5-1). after: keep(그 자리에 보임) · reload(상세 다시) · closeReload(모달 닫고 다시) · reason(사유 칸) · none
  const ERR_BY_CODE = {
    PREP_ALREADY_ACTIVE: { text: '이 기관은 이미 제안 확정되어 사전준비가 진행 중입니다. [사전준비 열기]로 진행 상황을 보세요.', after: 'keep' },
    PREP_ABORTED: { text: '사전준비를 중단한 건은 다시 확정할 수 없습니다. 지도에서 기관을 골라 새로 확정하세요.', after: 'keep' },
    ASSIGNED_ALREADY: { text: '이 입찰 건은 예전 방식으로 담당자가 배정되어 있어 제안 확정으로 진행할 수 없습니다. [제안팀 구성·배정]에서 담당자를 확인하세요.', after: 'keep' },
    PLAN_PENDING: { text: '기획승인 요청이 진행 중이라 중단할 수 없습니다. 요청이 회수되거나 반려된 뒤 중단하세요.', after: 'closeReload' },
    STATE_CHANGED: { text: '그사이 다른 사람이 이 건의 상태를 바꿨습니다. 최신 상태를 다시 불러왔으니 확인한 뒤 다시 하세요.', after: 'closeReload' },
    NOT_MANUAL: { text: '자동으로 완료되는 과제라 직접 체크할 수 없습니다.', after: 'reload' },
    TASK_NOT_AVAILABLE: { text: '지금은 이 과제를 체크할 수 없습니다. 선행 과제나 상태가 바뀌었을 수 있어 다시 불러왔습니다.', after: 'reload' },
    NOMINEE_CHANGED: { text: '지명한 담당자 중 상태가 바뀐 사람이 있어 승인할 수 없습니다. 반려하거나, 신청자가 회수한 뒤 다시 신청해야 합니다.', after: 'reload' },
    APPROVER_NOT_RESOLVED: { text: '결재자를 정할 수 없어 신청하지 못했습니다. 시스템 관리자에게 상위 결재자 지정을 요청하세요.', after: 'keep' },
    UNSUPPORTED_FORMAT: { text: '올릴 수 있는 형식은 HWPX·PDF·xlsx·docx입니다. HWP·구형 오피스 파일은 그 형식으로 다시 저장해 올리세요.', after: 'keep' },
    FORMAT_MISMATCH: { text: '파일 내용이 확장자와 맞지 않습니다. 원래 프로그램에서 열어 HWPX·PDF·xlsx·docx로 다시 저장해 올리세요.', after: 'keep' },
    ACTIVE_CONTENT: { text: '매크로·스크립트가 들어 있는 파일은 올릴 수 없습니다. 매크로를 뺀 xlsx·docx나 일반 PDF로 저장해 올리세요.', after: 'keep' },
    ATTACH_IN_USE: { text: '확정본으로 지정한 파일은 무효 처리할 수 없습니다. 먼저 [확정본 해제]를 하세요.', after: 'keep' },
    ATTACH_NOT_ELIGIBLE: { text: '이 파일은 확정본으로 지정할 수 없습니다(무효 처리됐거나 다른 과제의 파일). 목록을 다시 불러왔습니다.', after: 'reload' },
    FILE_MISSING: { text: '파일이 서버에 없습니다. 시스템 관리자에게 알리세요.', after: 'keep' },
  };
  prep.ERR_BY_CODE = ERR_BY_CODE;

  function esc(s) { return logic.esc(s == null ? '' : s); }
  function str(v) { return v == null ? '' : String(v); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // 조사 '을/를' — 끝 글자 받침으로 고른다. 한글이 아니면 '을(를)'로 쓰지 않고 첫째 값.
  prep.josa = function (name, withBatchim, without) {
    const s = str(name).trim();
    if (!s) return withBatchim;
    const code = s.charCodeAt(s.length - 1);
    if (code < 0xAC00 || code > 0xD7A3) return withBatchim;
    return (code - 0xAC00) % 28 !== 0 ? withBatchim : without;
  };

  // ISO 시각 → 'MM-DD HH:mm'(한국 시각). 읽을 수 없으면 ''.
  prep.stamp = function (iso) {
    if (!iso || isNaN(Date.parse(String(iso)))) return '';
    return tm.kst(iso).slice(5, 16);
  };

  prep.formatSize = function (n) {
    const b = Number(n);
    if (!isFinite(b) || b < 0) return '';
    if (b < 1024) return b + 'B';
    if (b < 1024 * 1024) return Math.round(b / 1024) + 'KB';
    return (b / (1024 * 1024)).toFixed(1) + 'MB';
  };

  // ── 열람 자격·게이트 ─────────────────────────────────────────────
  prep.canView = function (role) { return prep.VIEW_ROLES.indexOf(str(role).trim()) >= 0; };
  prep.gateOf = function (ctx) {
    const c = ctx || {};
    if (!c.serverMode) return { kind: 'file', text: T.file };
    if (!c.emp) return { kind: 'login', text: T.login };
    if (!prep.canView(c.role)) return { kind: 'forbidden', text: T.forbidden(c.roleLabel) };
    return null;
  };

  // ── 상태 배지·꼬리표 ─────────────────────────────────────────────
  const DEFAULT_NAMES = { CONFIRMED: '확정됨', OPEN_PENDING: '개설 대기', IN_PROGRESS: '사전준비 중', APPROVAL_PENDING: '기획승인 중',
                          WRITABLE: '작성 가능', WRITING: '작성 중', CANCELLED: '확정 취소' };
  const BADGE_CLS = { CONFIRMED: 'pp-neutral', OPEN_PENDING: 'gap', IN_PROGRESS: 'pp-neutral', APPROVAL_PENDING: 'gap',
                      WRITABLE: 'ok', WRITING: 'ok', CANCELLED: 'pp-cancel' };
  prep.stateBadge = function (cd, name) {
    const n = str(name).trim();
    const text = n || DEFAULT_NAMES[cd] || '';
    return { cls: has(BADGE_CLS, cd) ? BADGE_CLS[cd] : 'pp-neutral', text: text };
  };
  prep.boardTag = function (result) {
    if (result === 'REJECTED') return { cls: 'none', text: '이사회 부결' };
    if (result === 'PASSED') return { cls: 'ok', text: '이사회 가결' };
    if (result === 'SCHEDULED') return { cls: 'pp-neutral', text: '의결 예정' };
    return null;
  };
  function badgeHtml(b) { return '<span class="wf-badge ' + b.cls + '">' + esc(b.text) + '</span>'; }

  // ── 목록 ─────────────────────────────────────────────────────────
  prep.listRowModel = function (row) {
    const r = row || {};
    const names = (Array.isArray(r.assignee_names) ? r.assignee_names : []).filter(Boolean);
    const pr = r.progress || {};
    return {
      id: str(r.bid_case_id), institutionId: str(r.institution_id), name: str(r.institution_name), stateCd: str(r.state_cd),
      badge: prep.stateBadge(r.state_cd, r.state_name),
      done: Number(pr.done) || 0, total: Number(pr.total) || 0,
      assigneeText: names.length ? '담당 ' + names[0] + (names.length > 1 ? ' 외 ' + (names.length - 1) + '명' : '') : T.noAssignees,
      closed: r.state_cd === 'CANCELLED',
      canView: r.can_view !== false,          // 서버가 can_view를 주면 그 값, 없으면 열 수 있다고 본다
    };
  };

  // 정렬(임시, 정책은 기획 이관): 진행 단계가 앞인 건 → 기관명 가나다.
  prep.listRows = function (list) {
    const rows = (Array.isArray(list) ? list : []).map(prep.listRowModel);
    rows.sort(function (a, b) {
      const x = prep.STATE_ORDER.indexOf(a.stateCd), y = prep.STATE_ORDER.indexOf(b.stateCd);
      if (x !== y) return x - y;
      return a.name.localeCompare(b.name, 'ko');
    });
    return rows;
  };
  prep.tabCounts = function (rows) {
    const n = { active: 0, closed: 0 };
    (rows || []).forEach(function (r) { if (r.closed) n.closed += 1; else n.active += 1; });
    return n;
  };
  prep.filterRows = function (rows, tab, query) {
    const q = str(query).trim().toLowerCase();
    return (rows || []).filter(function (r) {
      return (tab === 'closed' ? r.closed : !r.closed) && (!q || r.name.toLowerCase().indexOf(q) >= 0);
    });
  };
  prep.emptyText = function (tab, query) {
    const q = str(query).trim();
    if (q) return T.emptyQuery(q);
    return tab === 'closed' ? T.emptyClosed : T.emptyActive;
  };
  prep.countText = function (n) { return n + '건'; };

  function pipsHtml(done, total) {
    const n = Math.min(Math.max(total, 0), 12);
    let h = '<span class="pp-pips" aria-hidden="true">';
    for (let i = 0; i < n; i += 1) h += '<span class="pp-pip' + (i < done ? ' on' : '') + '"></span>';
    return h + '</span>';
  }
  prep.pipsHtml = pipsHtml;

  prep.itemsHtml = function (rows, selectedId) {
    return '<ul class="tm-ul">' + rows.map(function (r) {
      const sub = r.canView ? r.assigneeText : T.noViewShort;
      return '<li><button type="button" class="tm-item' + (r.canView ? '' : ' pp-noview') + '" data-id="' + esc(r.id) + '"' +
        (r.canView ? '' : ' aria-disabled="true"') + (r.id === selectedId ? ' aria-current="true"' : '') + '>' +
        '<span class="tm-item-head"><b>' + esc(r.name) + '</b>' + badgeHtml(r.badge) + '</span>' +
        '<span class="tm-item-sub"><span>' + pipsHtml(r.done, r.total) + ' <span class="tm-mono">' + r.done + '/' + r.total + '</span>' +
        ' · ' + esc(sub) + '</span></span></button></li>';
    }).join('') + '</ul>';
  };

  // ── 지도 팝오버·현황판 공용: 어떤 버튼을 보일까 ───────────────────────
  // rec: 지도 레코드(institutionId), ctx: { serverMode, account, master, role }, actives: GET /preps 목록(실패면 null).
  // → { kind: 'none'|'confirm'|'open', bid }
  prep.popoverEligible = function (rec, ctx) {
    const c = ctx || {};
    if (!c.serverMode || !c.account || c.master) return false;
    if (!rec || !rec.institutionId) return false;
    return prep.canView(c.role);
  };
  prep.activeFor = function (rec, actives) {
    if (!rec || !rec.institutionId || !Array.isArray(actives)) return null;
    const hit = actives.filter(function (a) {
      return a && String(a.institution_id) === String(rec.institutionId) && a.state_cd !== 'CANCELLED';
    });
    return hit[0] || null;
  };
  prep.popoverAction = function (rec, ctx, actives) {
    const none = { kind: 'none', bid: '' };
    if (!prep.popoverEligible(rec, ctx)) return none;
    const act = prep.activeFor(rec, actives);
    if (act) return { kind: 'open', bid: str(act.bid_case_id) };           // 영업팀·영업팀장·영업부장 모두
    if (prep.CONFIRM_ROLES.indexOf(str(ctx.role).trim()) >= 0) return { kind: 'confirm', bid: '' };   // 조회 실패(null)도 여기 — 서버가 PREP_ALREADY_ACTIVE로 바로잡는다
    return none;
  };
  // 확인 줄(팝오버·현황판 공용). 첫 포커스는 [확정하기]가 아니라 호출 쪽이 정한다.
  prep.popConfirmHtml = function (name) {
    return '<div class="pop-confirm" role="group" aria-label="제안 확정 확인">' +
      '<div>' + esc(name) + esc(prep.josa(name, '을', '를')) + ' 제안 대상으로 확정합니다. 확정하면 [영업 추진 준비 › 제안서 사전준비 프로세스]에 이 기관의 준비 건이 생깁니다. ' +
      '개설 신청 전까지는 확정한 사람·영업팀장이 취소할 수 있습니다.</div>' +
      '<div class="tm-actions"><button type="button" data-pp-pop="cancel">취소</button>' +
      '<button type="button" class="pp-next-btn" data-pp-pop="go">확정하기</button></div>' +
      '<div class="ap-err" id="pop-prep-err" role="alert"></div></div>';
  };

  // ── 상세: 단계 막대 ───────────────────────────────────────────────
  const STEP_DEFS = [{ n: 1, label: '제안 확정', sub: '' }, { n: 2, label: '개설 승인', sub: '영업팀장' }, { n: 3, label: '사전준비', sub: '' },
                     { n: 4, label: '기획승인', sub: '영업부장' }, { n: 5, label: '제안서 작성', sub: '' }];
  const STEP_SR = { done: '완료', current: '현재 단계', gate: '승인 대기', todo: '' };
  const DONE_COUNT = { CONFIRMED: 1, OPEN_PENDING: 1, IN_PROGRESS: 2, APPROVAL_PENDING: 3, WRITABLE: 4, WRITING: 5 };

  // 가장 나중의 이력(이벤트 코드 목록 중). logged_at이 같으면 뒤에 있는 것.
  prep.lastEvent = function (history, codes) {
    let best = null;
    (history || []).forEach(function (h) {
      if (!h || codes.indexOf(h.event_cd) < 0) return;
      if (!best || str(h.logged_at) >= str(best.logged_at)) best = h;
    });
    return best;
  };

  prep.stepModel = function (view, history) {
    const v = view || {};
    const pr = v.progress || {};
    const cnt = pr.total != null ? (Number(pr.done) || 0) + '/' + (Number(pr.total) || 0) : '';
    let st = ['todo', 'todo', 'todo', 'todo', 'todo'];
    const gate = {}, count = {}, note = {};
    switch (v.state_cd) {
      case 'CONFIRMED': st = ['done', 'current', 'todo', 'todo', 'todo']; break;
      case 'OPEN_PENDING': st = ['done', 'gate', 'todo', 'todo', 'todo']; gate[1] = '승인 대기'; break;
      case 'IN_PROGRESS': st = ['done', 'done', 'current', 'todo', 'todo']; count[2] = cnt; break;
      case 'APPROVAL_PENDING': st = ['done', 'done', 'done', 'gate', 'todo']; gate[3] = '승인 대기'; break;
      case 'WRITABLE': st = ['done', 'done', 'done', 'done', 'current']; break;
      case 'WRITING': st = ['done', 'done', 'done', 'done', 'done']; note[4] = '작성 중'; break;
      case 'CANCELLED': {
        const ev = prep.lastEvent(history, ['UNCONFIRM', 'CANCEL']);
        const k = ev && has(DONE_COUNT, ev.from_state) ? DONE_COUNT[ev.from_state] : 1;
        st = st.map(function (s, i) { return i < k ? 'done' : 'todo'; });
        break;
      }
      default: break;
    }
    return STEP_DEFS.map(function (d, i) {
      return { n: d.n, label: d.label, sub: d.sub, status: st[i], gate: gate[i] || '', count: count[i] || '', note: note[i] || '', sr: STEP_SR[st[i]] };
    });
  };

  prep.stepsHtml = function (steps) {
    return '<ol class="wf-stepper pp-steps" aria-label="진행 단계">' + steps.map(function (s) {
      const cls = s.status === 'todo' ? '' : ' ' + s.status;
      return '<li class="wf-step' + cls + '"' + (s.status === 'current' ? ' aria-current="step"' : '') + '>' +
        (s.status === 'done' ? '<span class="pp-ck" aria-hidden="true">✓</span>' : '') + '<b>' + s.n + '</b>' + esc(s.label) +
        (s.sub ? ' <small>· ' + esc(s.sub) + '</small>' : '') +
        (s.gate ? ' <em class="wf-gate">' + esc(s.gate) + '</em>' : '') +
        (s.count ? ' <em class="wf-cnt">' + esc(s.count) + '</em>' : '') +
        (s.note ? ' <small>' + esc(s.note) + '</small>' : '') +
        (s.sr ? '<span class="sr-only"> ' + esc(s.sr) + '</span>' : '') + '</li>';
    }).join('') + '</ol>';
  };

  // ── 상세: 과제 ────────────────────────────────────────────────────
  const KIND_TEXT = { REQUIRED: '필수', CONDITIONAL: '조건부', OPTIONAL: '선택' };
  const STATE_WORD = { DONE: '완료', TODO: '할 일', LOCKED: '잠김', NOT_APPLICABLE: '해당 없음', PREPARING: '준비중' };
  const FACT_RULES = { T3: '수익성 분석표를 올리고 확정본으로 지정하면 완료됩니다.', T5: '이사회 자료가 확정되면 완료됩니다(부결이어도 완료).' };   // 서버 done_rule이 오면 그것을 먼저 쓴다

  function tasksByCd(tasks) {
    const m = {};
    (tasks || []).forEach(function (t) { if (t) m[t.task_cd] = t; });
    return m;
  }
  prep.tasksByCd = tasksByCd;

  // → { cd, no, name, state, stateWord, kindText, glyph, counts, sub, act, preparing, cls }
  prep.taskModel = function (task, byCd, viewer, index) {
    const t = task || {};
    const v = viewer || {};
    const map = byCd || {};
    const state = str(t.state);
    const fact = t.judge_cd === 'FACT';
    const kind = KIND_TEXT[t.kind_cd] || '';
    const m = {
      cd: str(t.task_cd), no: (index || 0) + 1, name: str(t.name), state: state, stateWord: STATE_WORD[state] || '',
      kindText: kind + (fact ? (kind ? ' · ' : '') + '자동 완료' : ''),
      glyph: '', counts: state !== 'PREPARING' && state !== 'NOT_APPLICABLE', sub: '', act: '',
      preparing: state === 'PREPARING', cls: '',
    };
    switch (state) {
      case 'DONE': {
        m.glyph = 'done'; m.cls = 'done';
        const who = t.done_by && t.done_by.name;
        const when = prep.stamp(t.done_at);
        m.sub = who ? '완료 · ' + who + (when ? ' ' + when : '') : T.autoDone;
        if (t.can_uncheck) m.act = 'uncheck';
        break;
      }
      case 'LOCKED': {
        m.glyph = 'lock'; m.cls = 'locked';
        const pre = t.locked_by && map[t.locked_by] ? map[t.locked_by].name : '선행 과제';
        m.sub = '\'' + pre + '\'이 끝나야 열립니다.';
        break;
      }
      case 'NOT_APPLICABLE':
        m.glyph = 'na'; m.cls = 'na';
        m.sub = m.cd === 'T4' ? T.naT4 : T.na;
        break;
      case 'PREPARING':
        m.cls = 'prep';
        break;
      default: {   // TODO
        m.glyph = 'todo'; m.cls = 'todo';
        if (fact) m.sub = str(t.done_rule).trim() || FACT_RULES[m.cd] || T.autoRule;
        else if (t.can_check) m.sub = T.manualHint;
        else if (!v.is_assignee) m.sub = T.notDone;
        else m.sub = str(t.disabled_reason) || T.notDone;
        if (t.can_check) m.act = 'check';
        break;
      }
    }
    return m;
  };

  // 끝나지 않은 필수·조건부 과제 이름(준비중·해당 없음은 뺀다).
  prep.missingNames = function (view) {
    return ((view && view.tasks) || []).filter(function (t) {
      return (t.kind_cd === 'REQUIRED' || t.kind_cd === 'CONDITIONAL') && (t.state === 'TODO' || t.state === 'LOCKED');
    }).map(function (t) { return str(t.name); });
  };

  // 지난 개설 신청 요약 한 줄: 현재 신청(open_request)이 없고 서버가 past_open_requests를 줄 때만.
  // 지금 처리 중(PENDING)인 신청이 있으면 그것이 우선이라 그리지 않는다. 반려·회수·승인으로 끝난 신청이 보이는 권한자에게도 요약은 보인다.
  prep.pastOpenLine = function (view) {
    const v = view || {};
    const p = v.past_open_requests;
    if ((v.open_request && v.open_request.status === 'PENDING') || !p || !(Number(p.count) > 0)) return '';
    const last = p.last_status === 'REJECTED' ? '반려됨' : (p.last_status === 'WITHDRAWN' ? '회수됨' : '');
    return '지난 개설 신청 ' + Number(p.count) + '건' + (last ? ' · 마지막 ' + last : '');
  };

  prep.nextLine = function (view) {
    const v = view || {};
    switch (v.state_cd) {
      case 'CONFIRMED': return '개설 신청을 올리면 영업팀장이 담당자를 승인합니다.';
      case 'OPEN_PENDING': return '영업팀장의 개설 승인을 기다립니다.';
      case 'IN_PROGRESS': {
        const miss = prep.missingNames(v);
        return miss.length ? '남은 필수 과제: ' + miss.join(', ') : '필수 과제를 모두 마쳤습니다. [기획승인 요청]을 누르세요.';
      }
      case 'APPROVAL_PENDING': return '영업부장의 기획승인을 기다립니다.';
      case 'WRITABLE': return '기획승인을 받았습니다. [제안서 작성하기]로 작성을 시작하세요.';
      case 'WRITING': return T.writing;
      default: return '';
    }
  };

  const GLYPH_BODY = {
    done: '<circle cx="6" cy="6" r="5"/><path d="M3.6 6.2l1.8 1.8 3-3.6"/>',
    todo: '<circle cx="6" cy="6" r="5"/>',
    lock: '<rect x="2.5" y="5.5" width="7" height="5" rx="1"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/>',
    na: '<path d="M2.5 6h7"/>',
  };
  function glyphHtml(g) {
    if (!has(GLYPH_BODY, g)) return '<span class="pp-glyph" aria-hidden="true"></span>';
    return '<svg class="pp-glyph" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + GLYPH_BODY[g] + '</svg>';
  }

  function confirmHtml(text, cancelAct, okAct, okLabel, cancelLabel, task, label) {
    const d = task ? ' data-task="' + esc(task) + '"' : '';
    return '<div class="pp-confirm" role="group"' + (label ? ' aria-label="' + esc(label) + '"' : '') + '><span>' + esc(text) + '</span>' +
      '<button type="button" data-act="' + cancelAct + '" data-first="1"' + d + '>' + esc(cancelLabel) + '</button>' +
      '<button type="button" data-act="' + okAct + '" class="pp-next-btn"' + d + '>' + esc(okLabel) + '</button></div>';
  }
  prep.confirmHtml = confirmHtml;

  // ── 상세: 첨부(T3) ────────────────────────────────────────────────
  // row: GET .../attachments 한 행. viewer: 상세 viewer. meEmp: 로그인 사번.
  // role: 로그인 역할. 무효 처리는 영업팀장, 또는 올린 본인이면서 활성 담당자(서버 규칙).
  // stateCd: 건 상태. 중단·취소(CANCELLED)면 무효 처리는 못 한다(내려받기만 유지).
  prep.attachActions = function (row, viewer, meEmp, role, stateCd) {
    const r = row || {};
    const v = viewer || {};
    if (!r.valid) return { download: false, setConfirmed: false, clearConfirmed: false, voidIt: false };
    const mine = !!meEmp && !!r.uploaded_by && r.uploaded_by.emp_no === meEmp;
    const lead = str(role).trim() === prep.LEAD;
    const ended = stateCd === 'CANCELLED';
    return {
      download: true,
      setConfirmed: !!v.is_assignee && !r.confirmed,
      clearConfirmed: !!v.is_assignee && !!r.confirmed,
      voidIt: !ended && (lead || (mine && !!v.is_assignee)) && !r.confirmed,   // 확정본 행에는 [무효 처리]를 그리지 않는다(ATTACH_IN_USE를 미리 막음)
    };
  };

  function piiCell(r) {
    if (r.pii_state === 'UNCHECKED') {
      return '<span class="pp-unchecked">검사 못 함</span><span class="pp-funch">' + esc(T.uncheckedWhy) + '</span>';
    }
    if (r.pii_note) return '<span class="wf-badge gap">개인정보 경고: ' + esc(r.pii_note) + '</span>';
    return '';
  }

  function fileActions(r, a) {
    const n = esc(str(r.name));
    const id = esc(str(r.attach_id));
    function b(act, label) {
      return '<button type="button" data-act="' + act + '" data-attach="' + id + '" aria-label="\'' + n + '\' ' + label + '">' + label + '</button>';
    }
    let h = '';
    if (a.download) h += b('download', '내려받기');
    if (a.setConfirmed) h += ' ' + b('setconfirm', '확정본으로 지정');
    if (a.clearConfirmed) h += ' ' + b('clearconfirm', '확정본 해제');
    if (a.voidIt) h += ' ' + b('void-open', '무효 처리');
    return h;
  }

  // m: { rows, viewer, meEmp, uploading, showVoid }
  prep.filesHtml = function (m) {
    // 이 영역은 T3(수익성 분석표) 파일만 보인다 — 서버 목록에는 다른 과제 첨부가 섞일 수 있다.
    const rows = (Array.isArray(m.rows) ? m.rows : []).filter(function (r) { return !r.task_cd || r.task_cd === 'T3'; });
    const v = m.viewer || {};
    const valid = rows.filter(function (r) { return r.valid; });
    const voided = rows.filter(function (r) { return !r.valid; });
    let h = '<div class="pp-files"><div class="pp-files-head"><b>수익성 분석표 파일</b>';
    if (v.can_upload) {
      h += '<button type="button" data-act="upload"' + (m.uploading ? ' aria-disabled="true"' : '') + '>' + esc(m.uploading ? T.uploading : '파일 올리기') + '</button>';
    }
    h += '<span class="pp-fhint">' + esc(T.fileHint) + '</span></div>';
    if (m.uploading) h += '<div class="pp-fhint" role="status">' + esc(T.uploadWait) + '</div>';
    if (!valid.length) {
      h += '<p class="wf-empty">' + esc(T.fileEmpty) + '</p>';
    } else {
      h += '<div class="tm-tbl-wrap"><table class="ad-table"><thead><tr><th>파일</th><th>올린 사람·시각</th><th>검사</th><th>상태</th><th>동작</th></tr></thead><tbody>' +
        valid.map(function (r) {
          const who = r.uploaded_by && r.uploaded_by.name ? r.uploaded_by.name : '';
          return '<tr><td class="pp-fname">' + esc(str(r.name)) + '<br><span class="pp-fsize">' + esc(prep.formatSize(r.size_bytes)) + '</span></td>' +
            '<td>' + esc(who) + (r.emp_verified === false ? ' <span class="ad-badge muted" title="' + esc(T.selfReport) + '">자기신고</span>' : '') +
            '<br><span class="pp-fsize">' + esc(prep.stamp(r.uploaded_at)) + '</span></td>' +
            '<td>' + piiCell(r) + '</td>' +
            '<td>' + (r.confirmed ? '<span class="wf-badge ok">확정본</span>' : '') + '</td>' +
            '<td>' + fileActions(r, prep.attachActions(r, v, m.meEmp, m.role, m.stateCd)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    if (voided.length) {
      h += '<button type="button" class="link-btn pp-fmore" data-act="toggle-void" aria-expanded="' + (m.showVoid ? 'true' : 'false') + '">' +
        esc(m.showVoid ? '무효 처리한 파일 숨기기' : '무효 처리한 파일 ' + voided.length + '개 보기') + '</button>';
      if (m.showVoid) {
        h += '<div class="tm-tbl-wrap"><table class="ad-table"><tbody>' + voided.map(function (r) {
          const who = r.voided_by && r.voided_by.name ? r.voided_by.name : '';
          return '<tr class="pp-void"><td class="pp-fname">' + esc(str(r.name)) + '</td><td>무효 · ' + esc(who) + ' ' + esc(prep.stamp(r.voided_at)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      }
    }
    return h + '</div>';
  };

  // ── 상세: 머리·끝 노드 ─────────────────────────────────────────────
  function btn(act, label, o) {
    const x = o || {};
    return '<button type="button" data-act="' + act + '"' + (x.cls ? ' class="' + x.cls + '"' : '') +
      (x.disabled ? ' disabled' : '') + (x.describedBy ? ' aria-describedby="' + x.describedBy + '"' : '') + '>' + esc(label) + '</button>';
  }

  prep.headActionHtml = function (view, role) {
    const v = view || {};
    const vw = v.viewer || {};
    if (v.state_cd === 'CONFIRMED' && vw.can_unconfirm) return '<div class="pp-headact">' + btn('unconfirm-open', '확정 취소…') + '</div>';
    if ((v.state_cd === 'IN_PROGRESS' || v.state_cd === 'WRITABLE' || v.state_cd === 'WRITING') && vw.can_cancel) {
      return '<div class="pp-headact">' + btn('abort-open', '중단…') + '</div>';
    }
    if (v.state_cd === 'APPROVAL_PENDING' && str(role).trim() === prep.LEAD) {
      return '<div class="pp-headact">' + btn('abort-open', '중단…', { disabled: true, describedBy: 'pp-why-abort' }) +
        '<span class="pp-why" id="pp-why-abort">' + esc(T.abortNoPlan) + '</span></div>';
    }
    return '';
  };

  function nomineeLines(v) {
    const req = v.open_request || {};
    let h = '';
    if (Array.isArray(req.nominees) && req.nominees.length) {
      h += '<div>지명: ' + esc(req.nominees.map(function (n) {
        return str(n.name) + (n.position ? '(' + n.position + ')' : '');
      }).join(', ')) + '</div>';
    }
    if (str(req.comment).trim()) h += '<div>의견: ' + esc(str(req.comment).trim()) + '</div>';
    return h;
  }

  function disabledNext(act, label, why, whyId) {
    return '<div class="pp-end-row">' + btn(act, label, { disabled: true, describedBy: whyId }) +
      '<span class="pp-why" id="' + whyId + '">' + esc(why) + '</span></div>';
  }

  // ctx: { confirm: null | { kind: 'plan'|'start' } }
  prep.endHtml = function (view, ctx) {
    const v = view || {};
    const vw = v.viewer || {};
    const c = (ctx && ctx.confirm) || null;
    switch (v.state_cd) {
      case 'CONFIRMED': {
        // 반려·회수로 끝난 지난 신청이 권한자에게 보이면 그 지명자·의견을 참고용으로 그린다(요약 줄은 caseHtml이 그린다).
        const ro = v.open_request && v.open_request.status !== 'PENDING' ? nomineeLines(v) : '';
        return '<div class="pp-end"><div class="pp-end-row">' + (vw.can_request_open
          ? btn('open-request-open', '개설 신청', { cls: 'pp-next-btn' })
          : '<span class="pp-why">' + esc(T.openOnlySales) + '</span>') + '</div>' +
          (ro ? '<div class="pp-why">지난 신청 내용(참고)</div><div class="pp-why">' + ro + '</div>' : '') + '</div>';
      }
      case 'OPEN_PENDING': {
        const rid = v.open_request && v.open_request.req_id;
        const wd = !!(ctx && ctx.withdrawing);
        return '<div class="tm-pendbox" role="note"><div>' + esc(T.openPending) + '</div>' + nomineeLines(v) + '</div>' +
          (vw.can_withdraw_open && rid != null
            ? '<div class="pp-end-row"><button type="button" data-act="withdraw" data-req="' + esc(str(rid)) + '"' + (wd ? ' aria-disabled="true"' : '') + '>' +
              (wd ? '회수하는 중…' : '신청 회수') + '</button></div>' : '');
      }
      case 'IN_PROGRESS': {
        const miss = prep.missingNames(v);
        let planWhy = '';
        if (!vw.can_request_plan_approval) {
          if (!vw.is_assignee) planWhy = T.planOnlyAssignee;
          else planWhy = miss.length ? '필수 과제 ' + miss.length + '개가 남았습니다: ' + miss.join(', ') + '.' : T.planCannot;
        }
        return '<div class="pp-end">' + (vw.can_request_plan_approval
          ? '<div class="pp-end-row">' + btn('plan-ask', '기획승인 요청', { cls: 'pp-next-btn' }) + '</div>'
          : disabledNext('plan-ask', '기획승인 요청', planWhy, 'pp-why-plan')) +
          (c && c.kind === 'plan' ? confirmHtml(T.planConfirm, 'plan-no', 'plan-ok', '요청 올리기', '취소', '', '기획승인 요청 확인') : '') +
          disabledNext('start-ask', '제안서 작성하기', T.startNoYet, 'pp-why-start') + '</div>';
      }
      case 'APPROVAL_PENDING':
        return '<div class="tm-pendbox" role="note"><div>' + esc(T.planPending) + '</div></div>' +
          '<div class="pp-end">' + disabledNext('start-ask', '제안서 작성하기', T.planNoStart, 'pp-why-start') + '</div>';
      case 'WRITABLE':
        return '<div class="pp-end">' + (vw.can_start_writing
          ? '<div class="pp-end-row">' + btn('start-ask', '제안서 작성하기', { cls: 'pp-next-btn' }) + '</div>'
          : disabledNext('start-ask', '제안서 작성하기', vw.is_assignee ? T.startNoYet : T.startOnlyAssignee, 'pp-why-start')) +
          (c && c.kind === 'start' ? confirmHtml(T.startConfirm, 'start-no', 'start-ok', '작성 시작', '취소', '', '제안서 작성 시작 확인') : '') + '</div>';
      case 'WRITING':
        return '<div class="pp-end"><div class="pp-end-row"><span>' + esc(T.writing) + '</span>' +
          btn('to-workflow', T.toWorkflow, { cls: 'link-btn' }) + '</div></div>';
      default:
        return '';
    }
  };

  // m: { view, history, attach, role, meEmp, confirm, uploading, showVoid }
  prep.caseHtml = function (m) {
    const v = m.view || {};
    const vw = v.viewer || {};
    const tasks = Array.isArray(v.tasks) ? v.tasks : [];
    const byCd = tasksByCd(tasks);
    const badge = prep.stateBadge(v.state_cd, v.state_name);
    const bt = prep.boardTag(v.board_result);
    const names = (Array.isArray(v.assignees) ? v.assignees : []).map(function (a) { return str(a.name); }).filter(Boolean);
    const meta = [];
    if (v.confirmed_by && v.confirmed_by.name) {
      meta.push('확정 ' + esc(v.confirmed_by.name) + ' ' + esc(prep.stamp(v.confirmed_at)) +
        (v.emp_verified === 0 ? ' <span class="ad-badge muted" title="' + esc(T.selfReport) + '">자기신고</span>' : ''));
    }
    meta.push('담당 ' + (names.length ? esc(names.join(', ')) : esc(T.noAssignees)));
    let h = '<div class="tm-case-head"><div><div class="pp-titlerow"><h2 id="pp-case-title" class="tm-title" tabindex="-1">' + esc(str(v.institution_name)) + '</h2>' +
      '<span class="pp-badges">' + badgeHtml(badge) + (bt ? badgeHtml(bt) : '') + '</span></div>' +
      '<div class="tm-meta">' + meta.join(' · ') + '</div></div>' + prep.headActionHtml(v, m.role) + '</div>';
    h += prep.stepsHtml(prep.stepModel(v, m.history));
    const next = prep.nextLine(v);
    if (next) h += '<p class="pp-next">' + esc(next) + '</p>';
    const past = prep.pastOpenLine(v);
    if (past) h += '<p class="pp-next">' + esc(past) + '</p>';
    if (v.state_cd === 'CANCELLED') {
      const ev = prep.lastEvent(m.history, ['UNCONFIRM', 'CANCEL']);
      h += '<div class="pp-banner" role="note">' + esc(T.cancelBanner(badge.text, ev ? str(ev.reason).trim() : '')) + '</div>';
    }
    if (tasks.length) {
      const models = tasks.map(function (t, i) { return prep.taskModel(t, byCd, vw, i); });
      const pr = v.progress || {};
      const done = Number(pr.done) || 0, total = Number(pr.total) || 0;
      h += '<div class="pp-sec-head">준비 과제 <span class="tm-n">' + done + '/' + total + '</span>' + pipsHtml(done, total) +
        '<small>준비중·해당 없음 과제는 세지 않습니다</small></div>';
      if (TASK_STATES.indexOf(v.state_cd) >= 0 && !vw.is_assignee) h += '<p class="pp-next">' + esc(T.readonly) + '</p>';
      h += '<ol class="pp-tasks" aria-label="준비 과제">' + models.map(function (t) {
        let act = '';
        if (t.act === 'check') {
          act = '<button type="button" class="pp-act" data-act="check" data-task="' + esc(t.cd) + '" aria-label="\'' + esc(t.name) + '\' 완료로 표시">완료로 표시</button>';
        } else if (t.act === 'uncheck') {
          act = '<button type="button" class="pp-act" data-act="uncheck" data-task="' + esc(t.cd) + '" aria-label="\'' + esc(t.name) + '\' 완료 취소">완료 취소</button>';
        }
        const askUncheck = m.confirm && m.confirm.kind === 'uncheck' && m.confirm.task === t.cd;
        const showFiles = t.cd === 'T3' && m.attach && (t.state === 'TODO' || t.state === 'DONE');
        return '<li class="pp-task ' + t.cls + '" data-task="' + esc(t.cd) + '"><div class="pp-task-head">' + glyphHtml(t.glyph) +
          '<span class="pp-task-no">' + t.no + '</span><b>' + esc(t.name) + '</b>' +
          (t.preparing ? '<span class="pp-prep-tag">준비중</span>'
            : '<span class="pp-kind">' + esc(t.stateWord) + (t.kindText ? ' · ' + esc(t.kindText) : '') + '</span>') + act + '</div>' +
          (t.sub ? '<div class="pp-task-sub">' + esc(t.sub) + '</div>' : '') +
          (askUncheck ? confirmHtml(T.uncheckConfirm, 'uncheck-no', 'uncheck-ok', '완료 취소하기', '그대로 두기', t.cd, '완료 취소 확인') : '') +
          (showFiles ? prep.filesHtml({ rows: m.attach, viewer: vw, meEmp: m.meEmp, role: m.role, stateCd: v.state_cd, uploading: m.uploading, showVoid: m.showVoid }) : '') + '</li>';
      }).join('') + '</ol>';
    } else if (v.state_cd === 'CONFIRMED' || v.state_cd === 'OPEN_PENDING') {
      h += '<p class="wf-empty">' + esc(T.tasksLater) + '</p>';
    }
    return h + prep.endHtml(v, { confirm: m.confirm, withdrawing: m.withdrawing });
  };

  // ── 모달(개설 신청·확정 취소·중단·파일 무효 처리) ─────────────────────
  // m: { kind, reason, sel, q, candState: 'loading'|'ok'|'err', cands }
  // info: { name, assignees(명), writing, fileName, meEmp }
  prep.modalTitle = function (kind, info) {
    const i = info || {};
    if (kind === 'open') return '개설 신청 — ' + str(i.name);
    if (kind === 'unconfirm') return '제안 확정 취소 — ' + str(i.name);
    if (kind === 'abort') return '사전준비 중단 — ' + str(i.name);
    return '파일 무효 처리 — ' + str(i.fileName);
  };
  prep.modalGoLabel = function (kind) {
    return { open: '개설 신청 올리기', unconfirm: '확정 취소하기', abort: '중단하기', 'void': '무효 처리하기' }[kind] || '확인';
  };
  prep.modalCancelLabel = function (kind) { return kind === 'open' ? '취소' : '닫기'; };

  function reasonBlock(m, label, hint) {
    return '<div class="tm-reason-row"><label for="pp-reason">' + esc(label) + '</label><span id="pp-rcount" class="tm-count">' +
      str(m.reason).length + '/' + prep.REASON_MAX + '</span></div>' +
      '<textarea id="pp-reason" rows="3" maxlength="' + prep.REASON_MAX + '" aria-describedby="pp-rhint pp-rcount"' +
      (m.kind === 'open' ? '' : ' aria-required="true"') + '>' + esc(m.reason) + '</textarea>' +
      '<p id="pp-rhint" class="tm-note">' + esc(hint) + '</p>';
  }

  prep.modalBodyHtml = function (m, info) {
    const i = info || {};
    const kind = m.kind;
    if (kind === 'open') {
      let inner;
      if (m.candState === 'loading') inner = '<p class="wf-empty">' + esc(T.loading) + '</p>';
      else if (m.candState === 'err') inner = '<p class="wf-empty">담당자 후보를 불러오지 못했습니다. 닫고 다시 여세요.</p>';
      else {
        const n = (m.sel || []).length;
        inner = '<div class="tm-fs-top"><input type="text" id="pp-open-q" placeholder="이름 검색" aria-label="이름 검색" autocomplete="off" value="' + esc(m.q || '') + '">' +
          '<span id="pp-open-n" class="tm-count' + (n >= prep.MAX ? ' full' : '') + '" aria-live="polite">' + n + '/' + prep.MAX + '명</span></div>' +
          '<div class="tm-picks" id="pp-open-picks">' + prep.openPicksHtml(m, i.meEmp) + '</div>' +
          '<p class="tm-note" id="pp-max-note"' + (n >= prep.MAX ? '' : ' hidden') + '>' + esc(tm.T.maxNote) + '</p>';
      }
      return '<p class="tm-note">담당자로 일할 사람을 1~10명 지명합니다. 승인되면 지명한 사람이 담당자가 되고 준비 과제가 열립니다. 신청자나 지명자에 영업팀장이 있으면 영업부장이 승인합니다.</p>' +
        '<fieldset class="tm-fs"><legend>담당자 지명</legend>' + inner + '</fieldset>' +
        reasonBlock(m, '의견 (선택)', '의견에는 주민등록번호·카드번호 같은 개인정보를 적지 마세요.');
    }
    if (kind === 'unconfirm') {
      return '<p class="tm-note">개설 신청 전이라 담당자·과제 기록은 없습니다. 다시 확정하면 같은 건이 되살아납니다.</p>' +
        reasonBlock(m, '취소 사유 (필수)', '사유에는 개인정보를 적지 마세요.');
    }
    if (kind === 'abort') {
      return '<ul class="tm-note">' +
        '<li>중단하면 \'중단(미참여)\'로 바뀌고 되돌릴 수 없습니다.</li>' +
        '<li>담당자 ' + (Number(i.assignees) || 0) + '명의 배정이 풀리고 쓰기 권한이 회수됩니다. 기록은 읽기 전용으로 남습니다.</li>' +
        '<li>다시 참여하려면 지도에서 새로 제안 확정해야 합니다(새 건).</li>' +
        (i.writing ? '<li>이미 만들어진 세 팀 작업은 그대로 남습니다.</li>' : '') + '</ul>' +
        reasonBlock(m, '중단 사유 (필수)', '사유에는 개인정보를 적지 마세요.');
    }
    return '<p class="tm-note">무효 처리한 파일은 목록에서 숨겨지고 확정본으로 지정할 수 없습니다. 기록은 남습니다.</p>' +
      reasonBlock(m, '무효 사유 (필수)', '사유에는 개인정보를 적지 마세요.');
  };

  prep.openPicksHtml = function (m, meEmp) {
    return tm.pickListHtml(m.cands || [], m.sel || [], m.q, { max: prep.MAX, describedBy: 'pp-max-note', meEmp: meEmp }, tm.T.noCands, []);
  };

  prep.modalHtml = function (m, info) {
    const go = prep.modalGoLabel(m.kind);
    const goCls = m.kind === 'abort' ? ' class="pp-danger"' : (m.kind === 'open' ? ' class="pp-next-btn"' : '');
    return '<div class="modal-box tm-modal-box" role="dialog" aria-modal="true" aria-labelledby="pp-m-title">' +
      '<h3 id="pp-m-title">' + esc(prep.modalTitle(m.kind, info)) + '</h3>' +
      '<div class="modal-scroll tm-m-body">' + prep.modalBodyHtml(m, info) + '<div id="pp-m-err" class="ap-err" role="alert"></div></div>' +
      '<div id="pp-m-confirm"></div>' +
      '<div class="tm-m-actions"><span id="pp-m-why" class="tm-why"></span><button type="button" id="pp-m-cancel">' + esc(prep.modalCancelLabel(m.kind)) + '</button>' +
      '<button type="button" id="pp-m-go"' + goCls + ' disabled aria-describedby="pp-m-why">' + esc(go) + '</button></div></div>';
  };

  // 모달 버튼 상태(순수): { canGo, why, count }
  prep.modalState = function (m, busy) {
    const reason = str(m.reason).trim();
    if (m.kind === 'open') {
      const n = (m.sel || []).length;
      return { canGo: n >= 1 && m.candState === 'ok' && !busy, why: n < 1 ? tm.T.assignWhy : '', count: n + '/' + prep.MAX + '명' };
    }
    return { canGo: reason.length >= 1 && reason.length <= prep.REASON_MAX && !busy, why: reason ? '' : '사유를 적으세요.', count: '' };
  };

  prep.closeConfirmHtml = function () {
    return '<div class="pp-confirm" role="group" aria-label="닫기 확인"><span>' + esc(T.closeAsk) + '</span>' +
      '<button type="button" id="pp-m-keep">계속 작성</button><button type="button" id="pp-m-discard">닫기</button></div>';
  };

  // ── 오류 → { text, after, code } (§5-1). tasks: 상세 과제(NOT_READY의 missing 코드를 이름으로), where: 어디서 난 오류인가 ──
  prep.errorInfo = function (status, detail, tasks, where) {
    const p = errtext.parse(detail);
    const d = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : {};
    const code = p.code;
    if (code === 'NOT_READY') {
      const by = tasksByCd(tasks);
      const names = (Array.isArray(d.missing) ? d.missing : []).map(function (cd) { return by[cd] ? str(by[cd].name) : ''; }).filter(Boolean);
      return { text: '아직 끝나지 않은 필수 과제가 있습니다' + (names.length ? ': ' + names.join(', ') + '.' : '.'), after: 'reload', code: code };
    }
    if (code === 'OPEN_PENDING') {
      return where === 'unconfirm'
        ? { text: '개설 신청이 승인을 기다리는 중이라 확정을 취소할 수 없습니다. [결재함 › 내가 올린 요청]에서 신청을 먼저 회수하세요.', after: 'closeReload', code: code }
        : { text: '이 건에는 개설 신청이 이미 올라가 있습니다. 최신 상태를 다시 불러왔습니다.', after: 'closeReload', code: code };
    }
    if (code === 'PII_BLOCKED') {
      const kinds = (Array.isArray(d.kinds) ? d.kinds : []).map(function (k) { return str(k); }).filter(Boolean);
      return { text: '주민등록번호·외국인등록번호·카드번호로 보이는 값이 있어 올리지 않았습니다' + (kinds.length ? '(찾은 것: ' + kinds.join(', ') + ')' : '') +
        '. 그 값을 지운 파일을 올리세요.', after: 'keep', code: code };
    }
    if (code === 'FILE_TOO_LARGE') {
      const mb = Number(d.max_mb) || 30;
      return { text: '파일이 ' + mb + 'MB를 넘어 올리지 않았습니다. ' + mb + 'MB 이하로 나눠 올리세요.', after: 'keep', code: code };
    }
    if (code === 'FILE_REJECTED' || code === 'ATTACH_LIMIT') {
      return { text: p.message || T.generic, after: 'keep', code: code };
    }
    if (code === 'BAD_VALUE') {
      // 내부 값 이름(task_cd 등)이 든 서버 문구는 보이지 않는다. 파일 이름을 말하는 문구만 그대로 쓴다.
      const m = p.message;
      const safe = !!m && /파일/.test(m) && !/[A-Za-z]+_[A-Za-z]+/.test(m);
      return { text: safe ? m : T.generic, after: 'keep', code: code };
    }
    if (code && has(ERR_BY_CODE, code)) return { text: ERR_BY_CODE[code].text, after: ERR_BY_CODE[code].after, code: code };
    if (!status) return { text: T.network, after: 'keep', code: '' };
    if (status === 401) return { text: T.login, after: 'keep', code: code };
    if (status === 422) return { text: T.pii, after: 'reason', code: code };
    if (status === 404) {
      // 열람 문구는 상세 조회(where 'view')에만. 쓰기 동작의 404는 건이 사라졌다는 일반 문구.
      return where === 'view' ? { text: T.noView, after: 'none', code: code } : { text: T.notFound, after: 'reload', code: code };
    }
    if (status === 403) return { text: p.message || T.noWrite, after: 'reload', code: code };
    if (status === 413) return { text: '파일이 너무 큽니다. 30MB 이하로 나눠 올리세요.', after: 'keep', code: code };
    if (status === 400) return { text: p.message || T.generic, after: 'reason', code: code };
    if (status === 409) return { text: p.message || '처리하지 못했습니다 (409)', after: 'reload', code: code };
    return { text: p.message || '처리하지 못했습니다 (' + status + ')', after: 'keep', code: code };
  };

  // 업로드 성공 문구(개인정보 경고가 있으면 덧붙인다).
  prep.uploadOkText = function (fileName, res) {
    const w = res && res.pii && Array.isArray(res.pii.warnings) ? res.pii.warnings : [];
    let t = T.okUpload(fileName);
    if (w.length) {
      t += ' ' + w.map(function (x) { return str(x).replace(/(\d+)$/, '$1건'); }).join('·') + '이 들어 있습니다.' + T.warnTail;
    }
    return t;
  };

  // ════════════════════════════════════════════════════════════════
  // 아래는 DOM 배선 — mount()·decoratePopover()가 불릴 때만 실행된다(노드 테스트 대상 아님).
  // ════════════════════════════════════════════════════════════════
  function freshState() {
    return { who: '', tab: 'active', query: '', selected: '', rows: [], listState: 'loading', detail: null,
             modal: null, confirm: null, showVoid: false, uploading: false, busy: false,
             seq: 0, listSeq: 0, flash: '', refocus: '', focusTitle: false, withdrawing: false };
  }
  let S = freshState();
  let wired = false;

  function el(id) { return document.getElementById(id); }
  function myEmp() { return ((root.store.loadSession() || {}).emp) || ''; }
  function myRole() { return (root.store.loadProfile().team || '').trim(); }
  function whoNow() { return myEmp() + '|' + myRole(); }
  function clearQueryBox() { const q = el('pp-q'); if (q) q.value = ''; }
  function base(id) { return '/bidcases/' + encodeURIComponent(id) + '/prep'; }
  function ui(screen, button) { return { screen: screen, button: button }; }

  // 모든 호출은 이 함수 하나로. 실패하면 Error에 status·detail을 달아 던진다(네트워크 실패는 status 없음).
  function req(method, url, body, u, form) {
    const init = { method: method, headers: {} };
    if (u) { init.headers['X-Screen-Id'] = u.screen; init.headers['X-Button-Id'] = u.button; }
    if (form) init.body = form;
    else if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          const e = new Error('http ' + r.status);
          e.status = r.status;
          e.detail = j && j.detail;
          throw e;
        }
        return j;
      });
    });
  }

  // ── 지도 팝오버·현황판이 쓰는 '진행 중 건' 캐시 ──
  const cache = { who: '', at: 0, rows: null, pending: null };
  const CACHE_MS = 30000;
  function invalidateCache() { cache.at = 0; cache.rows = null; cache.pending = null; }
  // → Promise<GET /preps 목록 | null(조회 실패)>. 같은 계정이면 30초 안에는 다시 받지 않는다.
  prep.fetchActives = function () {
    const who = whoNow();
    if (cache.who !== who) { cache.who = who; cache.at = 0; cache.rows = null; cache.pending = null; }
    if (cache.rows && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.rows);
    if (cache.pending) return cache.pending;
    const p = req('GET', '/preps', undefined, ui('prep_list', 'refresh')).then(function (list) {
      const rows = Array.isArray(list) ? list : [];
      if (cache.who === who) { cache.rows = rows; cache.at = Date.now(); }
      return rows;
    }).catch(function () { return null; }).then(function (r) { cache.pending = null; return r; });
    cache.pending = p;
    return p;
  };
  prep.invalidateActives = invalidateCache;

  function popCtx() {
    const session = root.store.loadSession();
    return { serverMode: root.store.isServerMode(), account: !!(session && session.mode === 'account' && session.emp),
             master: !!(session && session.mode === 'account' && root.login && session.id === root.login.MASTER_ID), role: myRole() };
  }
  prep.currentPopCtx = popCtx;

  // ── 목록 ──
  function paintGate(gate) {
    el('pp-gate').innerHTML = gate ? '<p class="wf-empty">' + esc(gate.text) + '</p>' : '';
    el('pp-wrap').style.display = gate ? 'none' : '';
  }
  function paintTabs() {
    const n = prep.tabCounts(S.rows);
    el('pp-tabs').innerHTML = prep.TABS.map(function (t) {
      return '<button type="button" role="tab" id="pp-tab-' + t.key + '" data-tab="' + t.key + '">' + esc(t.label) + ' ' + n[t.key] + '</button>';
    }).join('');
    markTabs();
  }
  function markTabs() {
    prep.TABS.forEach(function (t) {
      const b = el('pp-tab-' + t.key);
      if (!b) return;
      b.className = t.key === S.tab ? 'on' : '';
      b.setAttribute('aria-selected', t.key === S.tab ? 'true' : 'false');
    });
  }
  function paintList() {
    const box = el('pp-items');
    box.setAttribute('aria-busy', S.listState === 'loading' ? 'true' : 'false');
    if (S.listState === 'loading') { box.innerHTML = '<p class="wf-empty">' + esc(T.loading) + '</p>'; el('pp-count').textContent = ''; return; }
    if (S.listState === 'err') {
      box.innerHTML = '<p class="wf-empty">' + esc(T.listErr) + '</p><button type="button" id="pp-retry-list">' + esc(T.retry) + '</button>';
      el('pp-count').textContent = '';
      return;
    }
    paintTabs();
    const rows = prep.filterRows(S.rows, S.tab, S.query);
    el('pp-count').textContent = prep.countText(rows.length);
    if (rows.length) { box.innerHTML = prep.itemsHtml(rows, S.selected); return; }
    const noQuery = !S.query.trim();
    box.innerHTML = '<p class="wf-empty">' + esc(prep.emptyText(S.tab, S.query)) + '</p>' +
      (S.tab === 'active' && noQuery ? '<button type="button" data-act="open-map">' + esc(T.openMap) + '</button>' : '');
  }
  function markSelected() {
    Array.prototype.forEach.call(el('pp-items').querySelectorAll('.tm-item'), function (b) {
      if (b.getAttribute('data-id') === S.selected) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  }
  function rowOf(id) { return S.rows.filter(function (r) { return r.id === id; })[0] || null; }

  function loadList() {
    const token = ++S.listSeq;
    return req('GET', '/preps', undefined, ui('prep_list', 'refresh')).then(function (list) {
      if (token !== S.listSeq) return;
      S.rows = prep.listRows(list);
      S.listState = 'ok';
      cache.who = whoNow(); cache.rows = Array.isArray(list) ? list : []; cache.at = Date.now();
      const sel = rowOf(S.selected);
      if (sel) S.tab = sel.closed ? 'closed' : 'active';      // 선택한 건이 있는 탭을 보인다
      paintList();
    }).catch(function (e) {
      if (token !== S.listSeq) return;
      S.listState = 'err';
      if (e && e.status === 401) paintGate({ text: T.login });
      paintList();
    });
  }

  // ── 상세 ──
  function setFlash(text) { el('pp-flash').textContent = text || ''; }
  function setPerr(text) { el('pp-perr').textContent = text || ''; }
  function clearNotices() { setFlash(''); setPerr(''); }

  function paintCase() {
    const box = el('pp-case');
    const d = S.detail;
    if (!S.selected || !d) {
      box.setAttribute('aria-busy', 'false');
      box.innerHTML = '<h2 id="pp-case-title" class="sr-only" tabindex="-1">제안서 사전준비 프로세스</h2><p class="wf-empty">' + esc(T.pick) + '</p>';
      return;
    }
    if (d.loading) {
      box.setAttribute('aria-busy', 'true');
      const row = rowOf(S.selected);
      box.innerHTML = '<h2 id="pp-case-title" class="tm-title" tabindex="-1">' + esc(row ? row.name : '') + '</h2><p class="wf-empty">' + esc(T.loading) + '</p>';
      return;
    }
    box.setAttribute('aria-busy', 'false');
    if (d.err) {
      const st = d.err.status;
      if (st === 401) { paintGate({ text: T.login }); return; }
      const row = rowOf(S.selected);
      box.innerHTML = '<h2 id="pp-case-title" class="tm-title" tabindex="-1">' + esc(row ? row.name : '') + '</h2>' + (st === 404
        ? '<p class="wf-empty">' + esc(T.noView) + '</p>'
        : '<p class="wf-empty">' + esc(T.detailErr) + '</p><button type="button" id="pp-retry-detail">' + esc(T.retry) + '</button>');
      return;
    }
    box.innerHTML = prep.caseHtml({ view: d.view, history: d.history, attach: d.attach, role: myRole(), meEmp: myEmp(),
      confirm: S.confirm, uploading: S.uploading, showVoid: S.showVoid, withdrawing: S.withdrawing });
    afterPaint();
  }
  // 다시 그린 뒤 포커스: 확인 줄이 열렸으면 안전한 쪽(취소) 버튼, 아니면 요청된 자리.
  function afterPaint() {
    const box = el('pp-case');
    if (S.focusTitle) { S.focusTitle = false; const t = el('pp-case-title'); if (t) t.focus(); return; }
    if (S.confirm) { const f = box.querySelector('[data-first="1"]'); if (f) f.focus(); return; }
    if (S.refocus) {
      const sel = S.refocus;
      S.refocus = '';
      let t = null;
      try { t = box.querySelector(sel); } catch (e) { t = null; }
      if (!t) t = el('pp-case-title');
      if (t) t.focus();
    }
  }

  function loadDetail(id) {
    const token = ++S.seq;
    S.detail = { loading: true };
    paintCase();
    req('GET', base(id), undefined, ui('prep_detail', 'open')).then(function (view) {
      const vw = (view && view.viewer) || {};
      const tasks = (view && view.tasks) || [];
      const hasT3 = tasks.some(function (t) { return t.task_cd === 'T3' && (t.state === 'TODO' || t.state === 'DONE'); });
      const wantAttach = hasT3 && !!(vw.is_assignee || vw.is_head || myRole() === prep.LEAD);
      return Promise.all([
        view && view.state_cd === 'CANCELLED'
          ? req('GET', base(id) + '/history', undefined, ui('prep_history', 'history_open')).catch(function () { return []; })
          : Promise.resolve([]),
        wantAttach ? req('GET', base(id) + '/attachments', undefined, ui('prep_detail', 'refresh')).catch(function () { return null; }) : Promise.resolve(null),
      ]).then(function (r) { return { view: view, history: Array.isArray(r[0]) ? r[0] : [], attach: Array.isArray(r[1]) ? r[1] : null }; });
    }).then(function (d) {
      if (token !== S.seq) return;
      S.detail = d;
      paintCase();
    }).catch(function (e) {
      if (token !== S.seq) return;
      S.detail = { err: { status: e && e.status, detail: e && e.detail } };
      paintCase();
    });
  }

  function selectCase(id) {
    const row = rowOf(id);
    if (row && !row.canView) { clearNotices(); setPerr(T.noView); return; }
    S.selected = id;
    S.modal = null;
    S.confirm = null;
    S.showVoid = false;
    clearNotices();
    markSelected();
    loadDetail(id);
  }

  function refresh() {
    const role = myRole();
    const gate = prep.gateOf({ serverMode: root.store.isServerMode(), emp: myEmp(), role: role,
                               roleLabel: root.roles ? root.roles.roleLabel(role) : role });
    paintGate(gate);
    if (gate) return;
    S.listState = S.rows.length ? 'ok' : 'loading';
    paintList();
    loadList();
    if (S.selected) loadDetail(S.selected); else paintCase();
  }

  // ── 쓰기 공통 ──
  function taskName(cd) {
    const v = S.detail && S.detail.view;
    const t = v && (v.tasks || []).filter(function (x) { return x.task_cd === cd; })[0];
    return t ? str(t.name) : '과제';
  }
  function attachName(id) {
    const rows = (S.detail && S.detail.attach) || [];
    const r = rows.filter(function (x) { return str(x.attach_id) === str(id); })[0];
    return r ? str(r.name) : '파일';
  }
  function curTasks() { return ((S.detail && S.detail.view && S.detail.view.tasks) || []); }

  function handleError(e, where) {
    const info = prep.errorInfo(e && e.status, e && e.detail, curTasks(), where);
    S.confirm = null;
    const modalOpen = !!S.modal;
    if (modalOpen && info.after !== 'closeReload' && info.after !== 'reload') {
      const b = el('pp-m-err'); if (b) b.textContent = info.text;
      if (info.after === 'reason') { const r = el('pp-reason'); if (r) { r.setAttribute('aria-invalid', 'true'); r.focus(); } }
    } else {
      if (modalOpen) closeModal(false);
      setPerr(info.text);
    }
    if (info.after === 'reload' || info.after === 'closeReload') {
      if (S.selected) loadDetail(S.selected);
      loadList();
    } else if (!modalOpen || info.after === 'keep') {
      paintCase();
    }
  }

  // call: () => Promise. o: { modal, refocus, focusTitle, where }
  function doAct(call, okText, o) {
    const x = o || {};
    if (S.busy || !S.selected) return;
    const id = S.selected;
    S.busy = true;
    setPerr('');
    if (S.modal) updateModalUi();
    return call().then(function (res) {
      S.busy = false;
      if (x.modal) closeModal(false);
      S.confirm = null;
      setFlash(typeof okText === 'function' ? okText(res) : okText);
      S.refocus = x.refocus || '';
      S.focusTitle = !!x.focusTitle;
      invalidateCache();
      loadDetail(id);
      loadList();
    }).catch(function (e) {
      S.busy = false;
      if (S.modal) updateModalUi();
      handleError(e, x.where);
    });
  }

  function taskSel(cd) { return '[data-task="' + cd + '"] [data-act]'; }
  function onCheck(cd, on) {
    const name = taskName(cd);
    return doAct(function () {
      return req('POST', base(S.selected) + '/tasks/' + encodeURIComponent(cd) + '/' + (on ? 'check' : 'uncheck'), {}, ui('prep_detail', on ? 'check' : 'uncheck'));
    }, on ? T.okCheck(name) : T.okUncheck(name), { refocus: taskSel(cd), where: 'check' });
  }
  function onUncheckAsk(cd) {
    const v = S.detail && S.detail.view;
    if (v && AFTER_PLAN.indexOf(v.state_cd) >= 0) { S.confirm = { kind: 'uncheck', task: cd }; paintCase(); return; }
    onCheck(cd, false);
  }
  function askConfirm(kind) { S.confirm = { kind: kind }; paintCase(); }
  function cancelConfirm(refocusSel) { S.confirm = null; S.refocus = refocusSel || ''; paintCase(); }

  function onPlanOk() {
    return doAct(function () {
      return req('POST', base(S.selected) + '/plan-approval-requests', {}, ui('prep_detail', 'plan_request'));
    }, T.okPlan, { refocus: '#pp-case-title', where: 'plan' });
  }
  function onStartOk() {
    return doAct(function () {
      return req('POST', base(S.selected) + '/start-writing', {}, ui('prep_detail', 'start_writing'));
    }, T.okStart, { focusTitle: true, where: 'start' });
  }
  function onWithdraw(reqId) {
    if (S.busy || S.withdrawing) return;
    S.withdrawing = true;
    paintCase();            // 버튼이 '회수하는 중…'으로 바뀐다
    const p = doAct(function () {
      return req('POST', '/approval-requests/' + encodeURIComponent(reqId) + '/cancel', {}, ui('prep_detail', 'withdraw'));
    }, T.okWithdraw, { focusTitle: true, where: 'withdraw' });
    if (p) p.then(function () {
      S.withdrawing = false;
      if (S.detail && !S.detail.loading && !S.detail.err) paintCase();
    });
  }

  // ── 파일 ──
  function onUploadPick() {
    if (S.uploading) return;
    const inp = el('pp-file');
    if (!inp) return;
    inp.value = '';
    inp.click();
  }
  function onFileChosen() {
    const inp = el('pp-file');
    const f = inp && inp.files && inp.files[0];
    if (!f || S.uploading || S.busy || !S.selected) return;
    const id = S.selected;
    const form = new FormData();
    form.append('task_cd', 'T3');
    form.append('file', f, f.name);
    S.uploading = true;
    S.busy = true;
    setPerr('');
    paintCase();
    req('POST', base(id) + '/attachments', undefined, ui('prep_detail', 'attach_upload'), form).then(function (res) {
      S.uploading = false; S.busy = false;
      setFlash(prep.uploadOkText(f.name, res));
      S.refocus = '[data-act="upload"]';
      invalidateCache();
      if (id === S.selected) loadDetail(id);
    }).catch(function (e) {
      S.uploading = false; S.busy = false;
      handleError(e, 'attach');
    });
    inp.value = '';
  }
  function onDownload(attachId) {
    const id = S.selected;
    const name = attachName(attachId);
    req0('GET', base(id) + '/attachments/' + encodeURIComponent(attachId) + '/content', ui('prep_detail', 'attach_download')).then(function (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }).catch(function (e) { handleError(e, 'attach'); });
  }
  // 내려받기 전용(JSON이 아닌 본문). 실패 본문만 JSON으로 읽는다.
  function req0(method, url, u) {
    const headers = u ? { 'X-Screen-Id': u.screen, 'X-Button-Id': u.button } : {};
    return fetch(url, { method: method, headers: headers }).then(function (r) {
      if (r.ok) return r.blob();
      return r.json().catch(function () { return {}; }).then(function (j) {
        const e = new Error('http ' + r.status);
        e.status = r.status;
        e.detail = j && j.detail;
        throw e;
      });
    });
  }
  function onSetConfirmed(attachId) {
    const name = attachName(attachId);
    return doAct(function () {
      return req('PUT', base(S.selected) + '/tasks/T3/confirmed-file', { attach_id: Number(attachId) }, ui('prep_detail', 't3_set'));
    }, T.okSetConfirmed(name), { refocus: taskSel('T3'), where: 'attach' });
  }
  function onClearConfirmed(attachId) {
    const name = attachName(attachId);
    return doAct(function () {
      return req('DELETE', base(S.selected) + '/tasks/T3/confirmed-file', undefined, ui('prep_detail', 't3_clear'));
    }, T.okClearConfirmed(name), { refocus: taskSel('T3'), where: 'attach' });
  }

  // ── 모달 ──
  function modalInfo() {
    const v = (S.detail && S.detail.view) || {};
    const row = rowOf(S.selected);
    const m = S.modal || {};
    return { name: str(v.institution_name) || (row ? row.name : ''), assignees: (v.assignees || []).length,
             writing: v.state_cd === 'WRITING', fileName: m.fileName || '', meEmp: myEmp() };
  }
  function openModal(kind, extra) {
    const opener = document.activeElement;
    S.modal = Object.assign({ kind: kind, reason: '', sel: [], q: '', candState: 'ok', cands: [], closing: false, opener: opener }, extra || {});
    if (kind === 'open') S.modal.candState = 'loading';
    const box = el('pp-modal');
    box.innerHTML = prep.modalHtml(S.modal, modalInfo());
    box.style.display = '';
    updateModalUi();
    const first = el('pp-reason') || el('pp-open-q');
    if (first) first.focus();
    if (kind === 'open') {
      const m = S.modal;
      req('GET', '/assignment-candidates', undefined, ui('prep_detail', 'open_request')).then(function (list) {
        if (S.modal !== m) return;
        m.cands = Array.isArray(list) ? list : [];
        m.candState = 'ok';
        repaintModalBody();
      }).catch(function () {
        if (S.modal !== m) return;
        m.candState = 'err';
        repaintModalBody();
      });
    }
  }
  // 후보 목록이 도착했을 때 본문만 다시 그린다(적은 의견은 유지).
  function repaintModalBody() {
    const m = S.modal;
    if (!m) return;
    const body = el('pp-modal').querySelector('.tm-m-body');
    if (!body) return;
    body.innerHTML = prep.modalBodyHtml(m, modalInfo()) + '<div id="pp-m-err" class="ap-err" role="alert"></div>';
    updateModalUi();
    const first = el('pp-open-q') || el('pp-reason');
    if (first) first.focus();
  }
  function updateModalUi() {
    const m = S.modal;
    if (!m) return;
    const st = prep.modalState(m, S.busy);
    const go = el('pp-m-go'); if (go) go.disabled = !st.canGo;
    const why = el('pp-m-why'); if (why) why.textContent = st.canGo ? '' : st.why;
    const cancel = el('pp-m-cancel'); if (cancel) cancel.disabled = S.busy;
    const rc = el('pp-rcount'); if (rc) rc.textContent = str(m.reason).length + '/' + prep.REASON_MAX;
    if (m.kind === 'open') {
      const n = m.sel.length;
      const cnt = el('pp-open-n'); if (cnt) { cnt.textContent = st.count; cnt.className = 'tm-count' + (n >= prep.MAX ? ' full' : ''); }
      const mx = el('pp-max-note'); if (mx) mx.hidden = n < prep.MAX;
      const picks = el('pp-open-picks');
      if (picks) {
        Array.prototype.forEach.call(picks.querySelectorAll('input[data-emp]'), function (cb) {
          const off = n >= prep.MAX && !cb.checked;
          cb.disabled = off;
          if (off) cb.setAttribute('aria-describedby', 'pp-max-note'); else cb.removeAttribute('aria-describedby');
          cb.parentNode.className = 'tm-pick' + (cb.checked ? ' on' : '') + (off ? ' off' : '');
        });
      }
    }
  }
  function closeModal(refocus) {
    const box = el('pp-modal');
    const opener = S.modal && S.modal.opener;
    box.style.display = 'none';
    box.innerHTML = '';
    S.modal = null;
    if (refocus) {
      const t = opener && document.body.contains(opener) ? opener : el('pp-case-title');
      if (t && t.focus) t.focus();
    }
  }
  function keepWriting() {
    if (!S.modal) return;
    S.modal.closing = false;
    el('pp-m-confirm').innerHTML = '';
    const r = el('pp-reason') || el('pp-open-q'); if (r) r.focus();
  }
  function requestClose() {
    const m = S.modal;
    if (!m || S.busy) return;
    if (m.closing) { keepWriting(); return; }
    if (str(m.reason).trim() || m.sel.length) {
      m.closing = true;
      el('pp-m-confirm').innerHTML = prep.closeConfirmHtml();
      const k = el('pp-m-keep'); if (k) k.focus();
      return;
    }
    closeModal(true);
  }
  function onModalGo() {
    const m = S.modal;
    if (!m || S.busy) return;
    const st = prep.modalState(m, false);
    if (!st.canGo) return;
    const reason = str(m.reason).trim();
    const r = el('pp-reason'); if (r) r.removeAttribute('aria-invalid');
    const err = el('pp-m-err'); if (err) err.textContent = '';
    if (m.kind === 'open') {
      const body = { emp_nos: m.sel.slice() };
      if (reason) body.comment = reason;
      doAct(function () { return req('POST', base(S.selected) + '/open-requests', body, ui('prep_detail', 'open_request')); },
        T.okOpen, { modal: true, focusTitle: true, where: 'open' });
    } else if (m.kind === 'unconfirm') {
      doAct(function () { return req('POST', base(S.selected) + '/unconfirm', { reason: reason }, ui('prep_detail', 'unconfirm')); },
        T.okUnconfirm, { modal: true, focusTitle: true, where: 'unconfirm' });
    } else if (m.kind === 'abort') {
      doAct(function () { return req('POST', base(S.selected) + '/cancel', { reason: reason }, ui('prep_detail', 'cancel_prep')); },
        T.okAbort, { modal: true, focusTitle: true, where: 'abort' });
    } else {
      const aid = m.attachId;
      const name = m.fileName;
      doAct(function () { return req('POST', base(S.selected) + '/attachments/' + encodeURIComponent(aid) + '/void', { reason: reason }, ui('prep_detail', 'attach_void')); },
        T.okVoid(name), { modal: true, refocus: taskSel('T3'), where: 'void' });
    }
  }

  // ── 이벤트(#pp-root에 한 번만 위임) ──
  function onClick(e) {
    const t = e.target && e.target.closest ? e.target.closest('button, a') : null;
    if (!t) return;
    if (t.classList.contains('tm-item')) { selectCase(t.getAttribute('data-id')); return; }
    if (t.getAttribute('data-tab')) {
      S.tab = t.getAttribute('data-tab') === 'closed' ? 'closed' : 'active';
      markTabs();
      paintList();
      return;
    }
    const act = t.getAttribute('data-act');
    const cd = t.getAttribute('data-task');
    switch (act) {
      case 'open-map': if (root.app && root.app.openNavItem) root.app.openNavItem('map'); return;
      case 'check': onCheck(cd, true); return;
      case 'uncheck': onUncheckAsk(cd); return;
      case 'uncheck-ok': onCheck(cd, false); return;
      case 'uncheck-no': cancelConfirm(taskSel(cd)); return;
      case 'plan-ask': askConfirm('plan'); return;
      case 'plan-ok': onPlanOk(); return;
      case 'plan-no': cancelConfirm('[data-act="plan-ask"]'); return;
      case 'start-ask': askConfirm('start'); return;
      case 'start-ok': onStartOk(); return;
      case 'start-no': cancelConfirm('[data-act="start-ask"]'); return;
      case 'withdraw': onWithdraw(t.getAttribute('data-req')); return;
      case 'unconfirm-open': openModal('unconfirm'); return;
      case 'abort-open': openModal('abort'); return;
      case 'open-request-open': openModal('open'); return;
      case 'upload': onUploadPick(); return;
      case 'download': onDownload(t.getAttribute('data-attach')); return;
      case 'setconfirm': onSetConfirmed(t.getAttribute('data-attach')); return;
      case 'clearconfirm': onClearConfirmed(t.getAttribute('data-attach')); return;
      case 'void-open': openModal('void', { attachId: t.getAttribute('data-attach'), fileName: attachName(t.getAttribute('data-attach')) }); return;
      case 'toggle-void': S.showVoid = !S.showVoid; S.refocus = '[data-act="toggle-void"]'; paintCase(); return;
      case 'to-workflow': if (root.app && root.app.openNavItem) root.app.openNavItem('workflow'); return;
      default: break;
    }
    switch (t.id) {
      case 'pp-retry-list': S.listState = 'loading'; paintList(); loadList(); break;
      case 'pp-retry-detail': if (S.selected) loadDetail(S.selected); break;
      case 'pp-m-cancel': requestClose(); break;
      case 'pp-m-go': onModalGo(); break;
      case 'pp-m-keep': keepWriting(); break;
      case 'pp-m-discard': closeModal(true); break;
      default: break;
    }
  }
  function onInput(e) {
    const t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'pp-q') { S.query = t.value; paintList(); }
    else if (t.id === 'pp-open-q' && S.modal) {
      S.modal.q = t.value;
      const box = el('pp-open-picks');
      if (box) { box.innerHTML = prep.openPicksHtml(S.modal, myEmp()); updateModalUi(); }
    } else if (t.id === 'pp-reason' && S.modal) {
      S.modal.reason = t.value;
      t.removeAttribute('aria-invalid');
      updateModalUi();
    }
  }
  function onChange(e) {
    const t = e.target;
    if (t && t.id === 'pp-file') { onFileChosen(); return; }
    const emp = t && t.getAttribute ? t.getAttribute('data-emp') : null;
    if (!emp || !S.modal || S.modal.kind !== 'open' || !t.closest('#pp-open-picks')) return;
    S.modal.sel = tm.togglePick(S.modal.sel, emp, prep.MAX);
    t.checked = S.modal.sel.indexOf(emp) >= 0;
    updateModalUi();
  }
  function onModalKey(e) {
    if (!S.modal || e.key !== 'Tab') return;      // Esc는 wire()의 document 핸들러가 처리
    const list = Array.prototype.filter.call(el('pp-modal').querySelectorAll('button, input, textarea, a[href]'), function (n) {
      return !n.disabled && n.getClientRects().length > 0;
    });
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function wire() {
    const r = el('pp-root');
    r.addEventListener('click', onClick);
    r.addEventListener('input', onInput);
    r.addEventListener('change', onChange);
    // 파일 고르는 숨은 입력 — 보이는 <button>이 .click()한다(display:none 입력을 label로 감싸지 않는다).
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.id = 'pp-file';
    inp.hidden = true;
    inp.accept = '.hwpx,.pdf,.xlsx,.docx';
    inp.setAttribute('aria-hidden', 'true');
    inp.tabIndex = -1;
    r.appendChild(inp);
    const md = el('pp-modal');
    md.addEventListener('keydown', onModalKey);
    // 배경(오버레이 자체) 클릭 → requestClose 경로(작성 중이면 '닫을까요?'). 상자에서 눌러 끌다가 배경에서 놓는 경우는 닫지 않는다.
    let downOnBg = false;
    md.addEventListener('mousedown', function (e) { downOnBg = (e.target === md); });
    md.addEventListener('click', function (e) {
      if (e.target === md && downOnBg) requestClose();
      downOnBg = false;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !S.modal) return;
      e.preventDefault();
      requestClose();
    });
    wired = true;
  }

  // 화면이 열릴 때마다 불린다(app.showSoon). 선택은 유지하고 데이터는 다시 불러온다.
  prep.mount = function () {
    if (typeof document === 'undefined' || !el('pp-root')) return;
    if (!wired) wire();
    const who = whoNow();
    if (who !== S.who) { S = freshState(); S.who = who; clearQueryBox(); }
    const md = el('pp-modal'); md.style.display = 'none'; md.innerHTML = ''; S.modal = null;
    S.confirm = null;
    clearNotices();
    refresh();
    if (S.flash) { setFlash(S.flash); S.flash = ''; }
  };
  // 계정이 바뀌면 이전 계정의 선택·목록·열린 모달·팝오버 캐시를 버린다(app.onProfileChanged).
  prep.onProfileChange = function () {
    if (typeof document === 'undefined') return;
    invalidateCache();
    if (!el('pp-root')) return;
    const who = whoNow();
    if (who === S.who) return;
    S = freshState();
    S.who = who;
    clearQueryBox();
    const md = el('pp-modal'); md.style.display = 'none'; md.innerHTML = '';
    clearNotices();
    if (el('pp-root').style.display !== 'none') refresh();
  };
  prep.unmount = function () { /* 폴링 없음 */ };

  // 팝오버·현황판이 부른다: 그 기관의 사전준비를 연다(목록에서 그 행을 고르고 상세를 연다). flash는 상세가 열리면 보이는 글.
  prep.openCase = function (bid, flash) {
    if (typeof document === 'undefined' || !bid) return false;
    const who = whoNow();
    if (S.who !== who) { S = freshState(); S.who = who; }
    S.selected = String(bid);
    S.flash = flash || '';
    S.focusTitle = true;
    S.tab = 'active';
    S.query = '';
    S.detail = null;
    clearQueryBox();
    const ok = !!(root.app && root.app.openNavItem && root.app.openNavItem(root.nav.PREP_ID));
    if (!ok) S.flash = '';
    return ok;
  };

  // ── 지도 팝오버 붙이기(render.showPopover가 부른다) ──
  function popAttach(pop) {
    if (pop.__ppWired) return;
    pop.__ppWired = true;
    pop.addEventListener('click', function (ev) {
      const t = ev.target && ev.target.closest ? ev.target.closest('[data-pp-pop]') : null;
      if (!t) return;
      // 누른 버튼이 곧 다시 그려져 DOM에서 빠진다 — 문서의 '바깥 클릭' 핸들러가 팝오버를 닫지 않게 여기서 멈춘다.
      ev.stopPropagation();
      popClick(pop, t.getAttribute('data-pp-pop'));
    });
  }
  function popRows(pop) { return pop.__ppRows === undefined ? null : pop.__ppRows; }

  function renderPopSlot(pop, rec, actives) {
    const slot = pop.querySelector('#pop-prep-slot');
    const line = pop.querySelector('#pop-prep-line');
    const actions = pop.querySelector('.pop-actions');
    if (!slot) return;
    if (actions) actions.style.display = '';
    pop.__ppRec = rec;
    pop.__ppRows = actives;
    const act = prep.popoverAction(rec, popCtx(), actives);
    pop.__ppAct = act;
    const row = prep.activeFor(rec, actives);
    if (line) {
      if (row) {
        const m = prep.listRowModel(row);
        line.innerHTML = '제안 진행 ' + badgeHtml(m.badge) + ' <span class="tm-mono">' + m.done + '/' + m.total + '</span>';
      } else line.innerHTML = '';
    }
    if (act.kind === 'confirm') slot.innerHTML = '<button type="button" class="pp-next-btn" data-pp-pop="ask">제안 확정</button>';
    else if (act.kind === 'open') slot.innerHTML = '<button type="button" class="pp-next-btn" data-pp-pop="open">사전준비 열기</button>';
    else slot.innerHTML = '';
  }

  function popClick(pop, what) {
    const rec = pop.__ppRec;
    if (!rec) return;
    const line = pop.querySelector('#pop-prep-line');
    const actions = pop.querySelector('.pop-actions');
    if (what === 'ask') {
      if (actions) actions.style.display = 'none';
      if (line) line.innerHTML = prep.popConfirmHtml(str(rec.name));
      const go = pop.querySelector('[data-pp-pop="go"]'); if (go) go.focus();
      return;
    }
    if (what === 'cancel') {
      renderPopSlot(pop, rec, popRows(pop));
      const b = pop.querySelector('[data-pp-pop="ask"]'); if (b) b.focus();
      return;
    }
    if (what === 'open') {
      const act = pop.__ppAct;
      if (!act || !act.bid) return;
      pop.style.display = 'none';
      prep.openCase(act.bid, '');
      return;
    }
    if (what === 'go') popConfirm(pop, rec);
  }

  function popConfirm(pop, rec) {
    if (pop.__ppBusy) return;
    pop.__ppBusy = true;
    const errBox = pop.querySelector('#pop-prep-err');
    if (errBox) errBox.textContent = '';
    ['go', 'cancel'].forEach(function (k) { const b = pop.querySelector('[data-pp-pop="' + k + '"]'); if (b) b.disabled = true; });
    req('POST', '/preps', { institution_id: rec.institutionId }, ui('map_popover', 'confirm')).then(function (res) {
      pop.__ppBusy = false;
      invalidateCache();
      pop.style.display = 'none';
      const name = str(rec.name);
      prep.openCase(res && res.bid_case_id, res && res.revived ? T.okRevived : T.okConfirm(name));
    }).catch(function (e) {
      pop.__ppBusy = false;
      const info = prep.errorInfo(e && e.status, e && e.detail, [], 'confirm');
      if (info.code === 'PREP_ALREADY_ACTIVE') {
        invalidateCache();
        prep.fetchActives().then(function (rows) {
          renderPopSlot(pop, rec, rows);
          const line = pop.querySelector('#pop-prep-line');
          if (line) line.insertAdjacentHTML('beforeend', '<div class="ap-err" role="alert">' + esc(info.text) + '</div>');
          const b = pop.querySelector('[data-pp-pop="open"]'); if (b) b.focus();
        });
        return;
      }
      ['go', 'cancel'].forEach(function (k) { const b = pop.querySelector('[data-pp-pop="' + k + '"]'); if (b) b.disabled = false; });
      const eb = pop.querySelector('#pop-prep-err');
      if (eb) eb.textContent = info.text;
    });
  }

  prep.decoratePopover = function (pop, rec) {
    if (typeof document === 'undefined' || !pop) return;
    const slot = pop.querySelector('#pop-prep-slot');
    if (!slot) return;
    popAttach(pop);
    pop.__ppBusy = false;
    pop.__ppRec = rec;
    pop.__ppRows = undefined;
    pop.__ppAct = null;
    const ctx = popCtx();
    if (!prep.popoverEligible(rec, ctx)) return;
    const tok = (pop.__ppTok || 0) + 1;
    pop.__ppTok = tok;
    prep.fetchActives().then(function (rows) {
      if (pop.__ppTok !== tok || pop.style.display !== 'block' || pop.__ppRec !== rec) return;
      renderPopSlot(pop, rec, rows);
    });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = prep;
  else root.prep = prep;
})(typeof self !== 'undefined' ? self : this);
