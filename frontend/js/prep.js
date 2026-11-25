(function (root) {
  'use strict';
  // 제안서 사전준비 프로세스 — 준비중 화면 자리(#tab-soon 안 #pp-root, 고정 id 'soon:사전준비')에서 열린다.
  // 입찰 현황판·지도 상세 팝업의 [제안 확정]·[사전준비 열기]가 이 파일의 순수 함수(popoverAction 등)를 함께 쓴다.
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
  prep.T1_NAME = '기관 선정 입찰참여 관련 요약';
  prep.MAX = 10;
  prep.REASON_MAX = 200;
  prep.TABS = [{ key: 'active', label: '진행 중' }, { key: 'closed', label: '취소·중단' }];
  prep.STATE_ORDER = ['CONFIRMED', 'OPEN_PENDING', 'IN_PROGRESS', 'APPROVAL_PENDING', 'WRITABLE', 'WRITING', 'CANCELLED'];
  const TASK_STATES = ['IN_PROGRESS', 'APPROVAL_PENDING', 'WRITABLE', 'WRITING'];
  prep.TASK_STATES = TASK_STATES;   // preptask.js가 '읽기 전용' 안내 줄 판정에 쓴다
  const AFTER_PLAN = ['APPROVAL_PENDING', 'WRITABLE', 'WRITING'];   // 사전준비 승인 요청 뒤 — 완료 취소는 확인 줄을 한 번 거친다

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
    emptyActive: '제안 확정한 기관이 없습니다. 지역별 공고현황에서 공고가 난 기관을 고르고 [제안 확정]을 누르면 여기에 나타납니다.',
    emptyClosed: '취소하거나 중단한 건이 없습니다.',
    emptyQuery: function (q) { return '\'' + q + '\'와 맞는 기관이 없습니다.'; },
    openMap: '지역별 공고현황 열기',
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
    startOnlyOwner: '담당자 지정은 제안을 확정한 사람이나 그 팀 영업팀장이 합니다.',
    tasksLaterStart: '담당자를 지정하면 준비 과제가 열립니다.',
    startModalNote: '담당자를 정하면 결재 없이 바로 사전준비가 시작되고, 영업팀장(팀장이 직접 시작하면 영업부장)에게 알림이 갑니다.',
    okPrepStart: function (res) {
      const n = res && res.notified_count != null && isFinite(Number(res.notified_count)) ? Number(res.notified_count) : -1;
      return '사전준비를 시작했습니다. ' + (n >= 0 ? '알림 ' + n + '건을 보냈습니다.' : '알림을 보냈습니다.') +
        (res && res.can_view === false ? ' 담당자가 아니어서 이 건의 상세는 볼 수 없습니다.' : '');
    },
    errNotGoal: '목표 기관만 사전준비를 시작할 수 있습니다. 이 기관이 목표 대상인지 확인하세요.',
    errNotify: '알림을 받을 영업팀장을 찾지 못했습니다. 결재선(팀장) 지정을 확인하세요.',
    errStartOwner: '담당자 지정은 제안을 확정한 사람이나 그 팀 영업팀장만 할 수 있습니다.',
    openPending: '개설 신청이 승인을 기다리고 있습니다.',
    planPending: '영업부장 사전준비 승인을 기다리고 있습니다. 회수는 [결재함 › 내가 올린 요청]에서 합니다.',
    planNoStart: '사전준비 승인을 받으면 켜집니다.',
    startNoYet: '필수 과제를 마치고 영업부장 사전준비 승인을 받으면 켜집니다.',
    startOnlyAssignee: '제안서 작성 시작은 담당자가 합니다.',
    planOnlyAssignee: '사전준비 승인 요청은 담당자가 합니다.',
    planCannot: '지금은 사전준비 승인을 요청할 수 없습니다.',
    abortNoPlan: '사전준비 승인 요청 중에는 중단할 수 없습니다.',
    writing: '제안서 작성 중입니다.',
    toWorkflow: '제안서 진행 현황 열기',
    planConfirm: '영업부장에게 사전준비 승인을 요청합니다. 요청 중에는 중단할 수 없습니다.',
    startConfirm: '작성을 시작하면 영업·전산·재무 세 팀 작업이 만들어지고 [제안서 진행 현황]에 나타납니다. 되돌릴 수 없습니다.',
    uncheckConfirm: '사전준비 승인 요청 뒤입니다. 완료를 취소하면 사전준비 승인·작성 시작이 막힙니다.',
    closeAsk: '적은 내용이 사라집니다. 닫을까요?',
    fileHint: 'HWPX·PDF·xlsx·docx, 한 파일 30MB 이하',
    fileEmpty: '아직 올린 파일이 없습니다. 수익성 분석표를 올리고 확정본으로 지정하면 이 과제가 완료됩니다.',
    uploading: '올리는 중…',
    okChangeReq: '담당자 변경을 요청했습니다. 승인되면 담당자가 바뀝니다.',
    changeNote: '담당자를 더하거나 뺍니다(여러 명 가능, 1~10명). 요청하면 영업팀장이 승인한 뒤 바뀌고, 영업팀장이 들어 있으면 영업부장이 승인합니다.',
    changeWhySame: '바뀐 담당자가 없습니다.',
    okSched: '이사회 일정을 등록했습니다.',
    okResult: '이사회 결과를 등록했습니다.',
    errDate: '날짜를 고르세요.',
    errResult: '등록하지 못했습니다. 잠시 뒤 다시 하세요.',
    piiOk: '이상 없음',
    piiTitle: '올린 파일에 주민등록번호·카드번호 같은 개인정보가 들어 있는지 서버가 자동으로 살핀 결과입니다.',
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
    okConfirm: function (name) { return name + prep.josa(name, '을', '를') + ' 제안 확정했습니다. 담당자를 정하면 사전준비가 시작됩니다.'; },
    okRevived: '확정을 취소했던 건을 다시 확정했습니다.',
    okOpen: '개설 신청을 올렸습니다. 승인되면 지명한 담당자에게 준비 과제가 열립니다.',
    okCheck: function (n) { return '\'' + n + '\'를 완료로 표시했습니다.'; },
    okUncheck: function (n) { return '\'' + n + '\'의 완료를 취소했습니다.'; },
    okPlan: '영업부장에게 사전준비 승인을 요청했습니다.',
    okStart: '제안서 작성을 시작했습니다. 세 팀 작업이 [제안서 진행 현황]에 생겼습니다.',
    okUnconfirm: '제안 확정을 취소했습니다.',
    okAbort: '사전준비를 중단했습니다. 담당 배정이 풀렸습니다.',
    okWithdraw: '개설 신청을 회수했습니다. 담당자를 다시 지명해 [개설 신청]을 올릴 수 있습니다.',
    okUpload: function (f) { return '\'' + f + '\'을 올렸습니다.'; },
    okSetConfirmed: function (f) { return '\'' + f + '\'을 수익성 분석표 확정본으로 지정했습니다.'; },
    okClearConfirmed: function (f) { return '\'' + f + '\'의 확정본 지정을 해제했습니다.'; },
    okVoid: function (f) { return '\'' + f + '\'을 무효 처리했습니다.'; },
    warnTail: ' 필요 없는 정보면 지운 파일을 다시 올리고 이 파일은 무효 처리하세요.',
    // 입찰 없음 알림(NEXT 98-1, design 11-19 6장). 날짜·기록자는 서버 값만, 새 부서 이름은 '영업부서'
    nbFact: '이 기관의 이번 회차 입찰 공고 상태는 \'입찰 없음(연장·지정)\'입니다',
    nbBanner: '이 기관은 이번 회차 입찰 공고가 \'입찰 없음(연장·지정)\'으로 기록되어 있습니다',
    nbWarn: '주의: ',
    nbTitle: function (name) { return '입찰 없음으로 기록된 기관' + (name ? ' — ' + name : ''); },   // 기관명이 비면 ' — 기관명' 부분을 뺀다
    nbAskWriting: '제안서를 계속 작성하시겠습니까?',
    nbAskPrep: '이 기관의 제안 준비를 계속하시겠습니까?',
    nbBtnNotice: '공고 상태 보기',
    nbBtnUnconfirm: '제안 확정 취소…',   // tidy_action UNCONFIRM(확정 단계) — 이름은 서버 tidy_action을 따른다(design 6-6)
    nbBtnAbort: '제안 중단…',            // tidy_action CANCEL(개설 뒤)
    nbBtnContinue: '계속 작성',
    nbLineNotice: '공고 상태 보기: 입찰 공고 현황에서 이 기관의 기록을 엽니다. 닫힌 회차라 읽기만 됩니다.',
    nbLineNoNotice: '공고 기록이 틀렸다면 입찰 공고 현황 기록 담당에게 알려 주세요.',
    nbLineUnconfirm: '제안 확정 취소: 입찰 없음이 맞으면 제안 확정을 취소합니다. 사유를 적는 창이 열립니다.',
    nbLineCancel: '제안 중단: 입찰 없음이 맞으면 이 건을 중단(미참여)합니다. 사유를 적는 창이 열리고, 중단하면 되돌릴 수 없습니다.',
    nbLineOpenPending: '개설 신청이 승인을 기다리는 중이라 지금은 제안 확정을 취소할 수 없습니다. 신청을 회수하거나 반려된 뒤 취소하세요.',
    nbLinePlanPending: '사전준비 승인 요청 중에는 제안을 중단할 수 없습니다. 요청이 회수되거나 반려된 뒤 중단하세요.',
    nbWho: function (stateCd) { return stateCd === 'CONFIRMED' || stateCd === 'OPEN_PENDING' ? '확정한 사람이나 영업부서 팀장' : '영업부서 팀장'; },
    nbLineNoAuth: function (who) {
      return '이 건의 확정 취소·중단은 ' + who + prep.josa(who, '이', '가') + ' 합니다. 입찰 없음이 맞으면 ' + who + '에게 알려 주세요.';
    },
    nbLineContinue: '계속 작성: 다음 회차를 준비하는 중이면 누르세요. 누른 기록이 남고, 공고 기록이 바뀌기 전까지 다시 묻지 않습니다.',
    nbNoticeFail: '입찰 공고 현황을 열 수 없습니다. 왼쪽 메뉴의 [입찰 공고 현황]에서 여세요.',
    nbAckFail: '기록을 남기지 못했습니다. 다시 누르세요.',
    nbChanged: '공고 기록이 바뀌었습니다. 최신 내용으로 다시 확인합니다.',
    nbGone: '이 건은 지금 \'입찰 없음\' 알림 대상이 아닙니다. 최신 상태를 불러왔습니다.',
  };
  prep.T = T;

  // 오류 코드 → 문구·후속 동작(§5-1). after: keep(그 자리에 보임) · reload(상세 다시) · closeReload(모달 닫고 다시) · reason(사유 칸) · none
  const ERR_BY_CODE = {
    PREP_ALREADY_ACTIVE: { text: '이 기관은 이미 제안 확정되어 사전준비가 진행 중입니다. [사전준비 열기]로 진행 상황을 보세요.', after: 'keep' },
    PREP_ABORTED: { text: '사전준비를 중단한 건은 다시 확정할 수 없습니다. 지도에서 기관을 골라 새로 확정하세요.', after: 'keep' },
    ASSIGNED_ALREADY: { text: '이 입찰 건은 예전 방식으로 담당자가 배정되어 있어 제안 확정으로 진행할 수 없습니다. [제안팀 구성·배정]에서 담당자를 확인하세요.', after: 'keep' },
    PLAN_PENDING: { text: '사전준비 승인 요청이 진행 중이라 중단할 수 없습니다. 요청이 회수되거나 반려된 뒤 중단하세요.', after: 'closeReload' },
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

  // 결재 없는 시작 흐름인가 — 서버가 can_start_prep를 주고 개설 신청 스위치가 꺼져 있을 때만(옛 흐름이면 false).
  prep.isNewStartFlow = function (viewer) {
    const vw = viewer || {};
    return !vw.can_request_open && vw.can_start_prep !== undefined;
  };

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
  const DEFAULT_NAMES = { CONFIRMED: '확정됨', OPEN_PENDING: '개설 대기', IN_PROGRESS: '사전준비 중', APPROVAL_PENDING: '사전준비 승인 중',
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
      '<div>' + esc(name) + esc(prep.josa(name, '을', '를')) + ' 제안 대상으로 확정합니다. 확정하면 [영업 추진 준비 › 제안 준비 현황]에 이 기관의 준비 건이 생깁니다. ' +
      '담당자 지정 전까지 확정한 사람·영업팀장이 취소할 수 있습니다.</div>' +
      '<div class="tm-actions"><button type="button" data-pp-pop="cancel">취소</button>' +
      '<button type="button" class="pp-next-btn" data-pp-pop="go">확정하기</button></div>' +
      '<div class="ap-err" id="pop-prep-err" role="alert"></div></div>';
  };

  // ── 상세: 단계 막대 ───────────────────────────────────────────────
  const STEP_DEFS = [{ n: 1, label: '제안 확정', sub: '' }, { n: 2, label: '개설 승인', sub: '영업팀장' }, { n: 3, label: '사전준비', sub: '' },
                     { n: 4, label: '사전준비 승인', sub: '영업부장' }, { n: 5, label: '제안서 작성', sub: '' }];
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
      case 'CONFIRMED':
        if (prep.isNewStartFlow(v.viewer)) return '담당자를 지정하면 결재 없이 사전준비가 시작됩니다.';
        return '개설 신청을 올리면 영업팀장이 담당자를 승인합니다.';
      case 'OPEN_PENDING': return '영업팀장의 개설 승인을 기다립니다.';
      case 'IN_PROGRESS': {
        const miss = prep.missingNames(v);
        return miss.length ? '남은 필수 과제: ' + miss.join(', ') : '필수 과제를 모두 마쳤습니다. [사전준비 승인 요청]을 누르세요.';
      }
      case 'APPROVAL_PENDING': return '영업부장의 사전준비 승인을 기다립니다.';
      case 'WRITABLE': return '사전준비 승인을 받았습니다. [제안서 작성하기]로 작성을 시작하세요.';
      case 'WRITING': return T.writing;
      default: return '';
    }
  };

  const GLYPH_BODY = {
    done: '<circle cx="6" cy="6" r="5"/><path d="M3.6 6.2l1.8 1.8 3-3.6"/>',
    todo: '<circle cx="6" cy="6" r="5"/>',
    lock: '<rect x="2.5" y="5.5" width="7" height="5" rx="1"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/>',
    na: '<path d="M2.5 6h7"/>',
    warn: '<path d="M6 1.4l5 9H1z"/><path d="M6 4.8v2.6"/><path d="M6 9.1v.1"/>',
  };
  function glyphHtml(g) {
    if (!has(GLYPH_BODY, g)) return '<span class="pp-glyph" aria-hidden="true"></span>';
    return '<svg class="pp-glyph" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + GLYPH_BODY[g] + '</svg>';
  }

  // ── 입찰 없음 알림(NEXT 98-1, design 11-19 6장) — 서버 view.nobid_notice(PrepNobidService.view)를 읽는 순수 함수 ──
  // applicable=true일 때만 대상. mode 'popup'(팝업) | 'fact_only'(사실 줄만) | 'none'. 날짜·기록자는 서버가 map 권한자에게만 주고, 없으면 괄호를 통째로 뺀다.
  prep.nobidOf = function (view) {
    const n = view && view.nobid_notice;
    return n && typeof n === 'object' && n.applicable === true ? n : null;
  };
  prep.nobidPopup = function (view) {
    const n = prep.nobidOf(view);
    return !!n && n.mode === 'popup' && n.can_ack === true;
  };
  prep.nobidDate = function (n) {
    const s = n && n.handled_at != null ? String(n.handled_at).trim() : '';
    return s && !isNaN(Date.parse(s)) ? tm.kst(s).slice(0, 10) : '';
  };
  function nobidTail(n, who) {   // → { date, name } | null
    const d = prep.nobidDate(n);
    return d ? { date: d, name: who ? str(n.handler_name).trim() : '' } : null;
  }
  prep.nobidTailText = function (n, who) {
    const t = nobidTail(n, who);
    return t ? '(' + t.date + ' 수정됨' + (t.name ? ', 기록자 ' + t.name : '') + ')' : '';
  };
  function nobidTailHtml(n, who) {
    const t = nobidTail(n, who);
    return t ? '(<span class="pp-mono">' + esc(t.date) + '</span> 수정됨' + (t.name ? ', 기록자 ' + esc(t.name) : '') + ')' : '';
  }
  prep.nobidWarnText = function (view) {   // 확인 줄·개설 신청 창의 주의 한 줄(대상이 아니면 '')
    const n = prep.nobidOf(view);
    return n ? T.nbWarn + T.nbFact + prep.nobidTailText(n, false) + '.' : '';
  };
  function nobidWarnBlock(text) {
    return text ? '<div class="pp-cwarn">' + glyphHtml('warn') + esc(text) + '</div>' : '';
  }
  prep.nobidAsk = function (stateCd) { return stateCd === 'WRITING' ? T.nbAskWriting : T.nbAskPrep; };
  // 정리 버튼 모델: kind가 있으면 버튼을 그리고(기존 모달 종류), 없으면 line 문장만 보인다.
  prep.nobidTidy = function (view) {
    const v = view || {};
    const n = prep.nobidOf(v) || {};
    switch (n.tidy_action) {
      case 'UNCONFIRM': return { kind: 'unconfirm', btn: T.nbBtnUnconfirm, line: T.nbLineUnconfirm };
      case 'CANCEL': return { kind: 'abort', btn: T.nbBtnAbort, line: T.nbLineCancel };
      case 'OPEN_PENDING': return { kind: '', line: T.nbLineOpenPending };
      case 'PLAN_PENDING': return { kind: '', line: T.nbLinePlanPending };
      default: return { kind: '', line: T.nbLineNoAuth(T.nbWho(v.state_cd)) };
    }
  };
  // 팝업 상자(#pp-modal 안). opts.canNotice=false면 [공고 상태 보기]를 빼고 그 줄을 문장으로. 버튼은 쓸 수 있는 것만 그린다(비활성으로 남기지 않는다).
  prep.nobidPopupHtml = function (view, opts) {
    const v = view || {};
    const n = prep.nobidOf(v) || {};
    const o = opts || {};
    const tidy = prep.nobidTidy(v);
    const lines = [o.canNotice ? T.nbLineNotice : T.nbLineNoNotice, tidy.line, T.nbLineContinue];
    const bt = function (id, act, label) { return '<button type="button" id="' + id + '" data-act="' + act + '">' + esc(label) + '</button>'; };
    return '<div class="modal-box tm-modal-box pp-nb-box" id="pp-nb" role="alertdialog" aria-modal="true" aria-labelledby="pp-nb-t" ' +
      'aria-describedby="pp-nb-fact pp-nb-ask" tabindex="-1">' +
      '<h3 id="pp-nb-t">' + esc(T.nbTitle(str(v.institution_name).trim() || str(o.name).trim())) + '</h3>' +
      '<div class="modal-scroll tm-m-body">' +
      '<p id="pp-nb-fact">' + esc(T.nbFact) + nobidTailHtml(n, true) + '.</p>' +
      '<p id="pp-nb-ask" class="pp-nb-ask">' + esc(prep.nobidAsk(v.state_cd)) + '</p>' +
      '<ul class="tm-note">' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' +
      '<div id="pp-nb-err" class="ap-err" role="alert"></div></div>' +
      '<div class="tm-m-actions pp-nb-acts">' +
      (o.canNotice ? bt('pp-nb-notice', 'nobid-notice', T.nbBtnNotice) : '') +
      (tidy.kind ? bt('pp-nb-tidy', 'nobid-tidy', tidy.btn) : '') +
      bt('pp-nb-continue', 'nobid-continue', T.nbBtnContinue) + '</div></div>';
  };
  // 상세 머리 아래 상시 사실 줄(design 6-4) — 팝업과 별개로 늘 남는다.
  prep.nobidBannerHtml = function (n, canNotice) {
    return '<div class="pp-banner is-nobid" role="note">' + glyphHtml('warn') + '<span>' + esc(T.nbBanner) + nobidTailHtml(n, false) + '.</span>' +
      (canNotice ? '<button type="button" class="link-btn" data-act="nobid-notice">' + esc(T.nbBtnNotice) + '</button>' : '') + '</div>';
  };

  // warn: 알림 대상이면 확인 줄 맨 앞에 두는 '주의:' 한 줄(문장 앞 블록, 그룹 이름과 함께 읽힌다).
  function confirmHtml(text, cancelAct, okAct, okLabel, cancelLabel, task, label, warn) {
    const d = task ? ' data-task="' + esc(task) + '"' : '';
    return '<div class="pp-confirm" role="group"' + (label ? ' aria-label="' + esc(label) + '"' : '') + '>' + nobidWarnBlock(warn) + '<span>' + esc(text) + '</span>' +
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
    return '<span class="pp-fsize">' + esc(T.piiOk) + '</span>';
  }
  // 첨부 종류: T3(수익성 분석표 — 확정본 지정이 있다) · NOTICE(입찰공고 원본) · BOARD_ADD(이사회 추가 자료) · BOARD_RES(이사회 결과 문서)
  prep.FILE_KINDS = {
    T3: { title: '수익성 분석표 파일', empty: T.fileEmpty, hint: T.fileHint, pick: true },
    NOTICE: { title: '', empty: '', hint: T.fileHint, pick: false },
    BOARD_ADD: { title: '', empty: '', hint: T.fileHint, pick: false },
    BOARD_RES: { title: '', empty: '', hint: T.fileHint, pick: false },
  };

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

  // m: { rows, viewer, meEmp, uploading, showVoid, task('T3' 기본), title, empty, hint }
  // 열(사용자 11-25): 파일명 | 상태 | 개인정보 검사 | 담당자 | 수정시간 (+ 동작) — 가운데 정렬.
  prep.filesHtml = function (m) {
    // 한 영역에는 한 종류의 파일만 보인다 — 서버 목록에는 다른 종류의 첨부가 섞여 온다.
    const task = str(m.task) || 'T3';
    const K = prep.FILE_KINDS[task] || prep.FILE_KINDS.T3;
    const rows = (Array.isArray(m.rows) ? m.rows : []).filter(function (r) { return task === 'T3' ? (!r.task_cd || r.task_cd === 'T3') : r.task_cd === task; });
    const v = m.viewer || {};
    const valid = rows.filter(function (r) { return r.valid; });
    const voided = rows.filter(function (r) { return !r.valid; });
    const title = m.title !== undefined ? str(m.title) : K.title;
    const busy = !!m.uploading;
    const mineUp = m.uploading === true || m.uploading === task;   // 지금 이 종류를 올리는 중인가
    let h = '<div class="pp-files' + (task === 'T3' ? '' : ' pp-files-flat') + '" data-kind="' + esc(task) + '"><div class="pp-files-head">' + (title ? '<b>' + esc(title) + '</b>' : '');
    if (v.can_upload) {
      h += '<button type="button" data-act="upload" data-kind="' + esc(task) + '"' + (busy ? ' aria-disabled="true"' : '') + '>' + esc(mineUp ? T.uploading : '파일 올리기') + '</button>';
    }
    h += '<span class="pp-fhint">' + esc(str(m.hint) || K.hint) + '</span></div>';
    if (mineUp) h += '<div class="pp-fhint" role="status">' + esc(T.uploadWait) + '</div>';
    if (!valid.length) {
      h += '<p class="wf-empty">' + esc(str(m.empty) || K.empty || T.fileEmpty) + '</p>';
    } else {
      h += '<div class="tm-tbl-wrap"><table class="ad-table pp-ftbl"><thead><tr><th scope="col">파일명</th><th scope="col">상태</th>' +
        '<th scope="col" title="' + esc(T.piiTitle) + '">개인정보 검사</th><th scope="col">담당자</th><th scope="col">수정시간</th><th scope="col"><span class="sr-only">동작</span></th></tr></thead><tbody>' +
        valid.map(function (r) {
          const who = r.uploaded_by && r.uploaded_by.name ? r.uploaded_by.name : '';
          const a = prep.attachActions(r, v, m.meEmp, m.role, m.stateCd);
          if (!K.pick) { a.setConfirmed = false; a.clearConfirmed = false; }
          return '<tr><td class="pp-fname">' + esc(str(r.name)) + '<br><span class="pp-fsize">' + esc(prep.formatSize(r.size_bytes)) + '</span></td>' +
            '<td>' + (r.confirmed ? '<span class="wf-badge ok">확정본</span>' : '<span class="pp-fsize">' + (K.pick ? '올림' : '보관') + '</span>') + '</td>' +
            '<td>' + piiCell(r) + '</td>' +
            '<td>' + esc(who) + (r.emp_verified === false ? ' <span class="ad-badge muted" title="' + esc(T.selfReport) + '">자기신고</span>' : '') + '</td>' +
            '<td><span class="pp-fsize">' + esc(prep.stamp(r.uploaded_at)) + '</span></td>' +
            '<td>' + fileActions(r, a) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    if (voided.length && task === 'T3') {
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
    const warn = prep.nobidWarnText(v);   // 입찰 없음 알림 대상이면 확인 줄 맨 앞 주의 한 줄
    switch (v.state_cd) {
      case 'CONFIRMED': {
        // 반려·회수로 끝난 지난 신청이 권한자에게 보이면 그 지명자·의견을 참고용으로 그린다(요약 줄은 caseHtml이 그린다).
        const ro = v.open_request && v.open_request.status !== 'PENDING' ? nomineeLines(v) : '';
        const newFlow = prep.isNewStartFlow(vw);   // 서버가 can_start_prep를 주면 결재 없는 시작 흐름
        return '<div class="pp-end"><div class="pp-end-row">' + (vw.can_start_prep
          ? btn('prep-start-open', '담당자 지정', { cls: 'pp-next-btn' })
          : vw.can_request_open
            ? btn('open-request-open', '개설 신청', { cls: 'pp-next-btn' })
            : '<span class="pp-why">' + esc(newFlow ? T.startOnlyOwner : T.openOnlySales) + '</span>') + '</div>' +
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
          ? '<div class="pp-end-row">' + btn('plan-ask', '사전준비 승인 요청', { cls: 'pp-next-btn' }) + '</div>'
          : disabledNext('plan-ask', '사전준비 승인 요청', planWhy, 'pp-why-plan')) +
          (c && c.kind === 'plan' ? confirmHtml(T.planConfirm, 'plan-no', 'plan-ok', '요청 올리기', '취소', '', '사전준비 승인 요청 확인', warn) : '') +
          disabledNext('start-ask', '제안서 작성하기', T.startNoYet, 'pp-why-start') + '</div>';
      }
      case 'APPROVAL_PENDING':
        return '<div class="tm-pendbox" role="note"><div>' + esc(T.planPending) + '</div></div>' +
          '<div class="pp-end">' + disabledNext('start-ask', '제안서 작성하기', T.planNoStart, 'pp-why-start') + '</div>';
      case 'WRITABLE':
        return '<div class="pp-end">' + (vw.can_start_writing
          ? '<div class="pp-end-row">' + btn('start-ask', '제안서 작성하기', { cls: 'pp-next-btn' }) + '</div>'
          : disabledNext('start-ask', '제안서 작성하기', vw.is_assignee ? T.startNoYet : T.startOnlyAssignee, 'pp-why-start')) +
          (c && c.kind === 'start' ? confirmHtml(T.startConfirm, 'start-no', 'start-ok', '작성 시작', '취소', '', '제안서 작성 시작 확인', warn) : '') + '</div>';
      case 'WRITING':
        return '<div class="pp-end"><div class="pp-end-row"><span>' + esc(T.writing) + '</span>' +
          btn('to-workflow', T.toWorkflow, { cls: 'link-btn' }) + '</div></div>';
      default:
        return '';
    }
  };

  // m: { view, history, attach, role, meEmp, confirm, uploading, showVoid }
  // 머리: 기관 이름·상태 배지·확정/담당 줄·[확정 취소]/[중단]
  prep.caseHeadHtml = function (m) {
    const v = m.view || {};
    const badge = prep.stateBadge(v.state_cd, v.state_name);
    const bt = prep.boardTag(v.board_result);
    const names = (Array.isArray(v.assignees) ? v.assignees : []).map(function (a) { return str(a.name); }).filter(Boolean);
    const meta = [];
    if (v.confirmed_by && v.confirmed_by.name) {
      meta.push('확정 ' + esc(v.confirmed_by.name) + ' ' + esc(prep.stamp(v.confirmed_at)) +
        (v.emp_verified === 0 ? ' <span class="ad-badge muted" title="' + esc(T.selfReport) + '">자기신고</span>' : ''));
    }
    meta.push(names.length ? '담당 ' + esc(names.join(', ')) : esc(T.noAssignees));   // '담당 담당 미정' 겹침 방지(ce 리허설 관찰 11-24)
    return '<div class="tm-case-head"><div><div class="pp-titlerow"><h2 id="pp-case-title" class="tm-title" tabindex="-1">' + esc(str(v.institution_name)) + '</h2>' +
      '<span class="pp-badges">' + badgeHtml(badge) + (bt ? badgeHtml(bt) : '') + '</span></div>' +
      '<div class="tm-meta">' + meta.join(' · ') + '</div></div>' + prep.headActionHtml(v, m.role) + '</div>';
  };
  // 알림 줄: 입찰 없음 사실 줄 · 다음 한 걸음 · 지난 개설 신청 · 취소 사유
  prep.caseNoticeHtml = function (m) {
    const v = m.view || {};
    let h = '';
    const nb = prep.nobidOf(v);
    if (nb) h += prep.nobidBannerHtml(nb, !!m.canNotice);   // 입찰 없음 사실 줄 — 단계 막대 뒤, 다음 한 걸음 앞
    const next = prep.nextLine(v);
    if (next) h += '<p class="pp-next">' + esc(next) + '</p>';
    const past = prep.pastOpenLine(v);
    if (past) h += '<p class="pp-next">' + esc(past) + '</p>';
    if (v.state_cd === 'CANCELLED') {
      const ev = prep.lastEvent(m.history, ['UNCONFIRM', 'CANCEL']);
      h += '<div class="pp-banner" role="note">' + esc(T.cancelBanner(prep.stateBadge(v.state_cd, v.state_name).text, ev ? str(ev.reason).trim() : '')) + '</div>';
    }
    return h;
  };
  // 준비 과제 한 줄(<li>). t = prep.taskModel 결과.
  // x(선택): { acts: 완료 단추 앞에 둘 단추들 HTML, tail: 줄 끝에 붙일 내용 HTML } — 구간·단계 화면의 펼침형 과제가 쓴다.
  prep.taskItemHtml = function (t, m, x) {
    const xa = x && x.acts ? str(x.acts) : '';
    const v = m.view || {};
    const vw = v.viewer || {};
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
        : '<span class="pp-kind">' + esc(t.stateWord) + (t.kindText ? ' · ' + esc(t.kindText) : '') + '</span>') + (xa ? '<span class="pp-acts">' + xa + act + '</span>' : act) + '</div>' +
      (t.sub ? '<div class="pp-task-sub">' + esc(t.sub) + '</div>' : '') +
      (askUncheck ? confirmHtml(T.uncheckConfirm, 'uncheck-no', 'uncheck-ok', '완료 취소하기', '그대로 두기', t.cd, '완료 취소 확인') : '') +
      (showFiles ? prep.filesHtml({ rows: m.attach, viewer: vw, meEmp: m.meEmp, role: m.role, stateCd: v.state_cd, uploading: m.uploading, showVoid: m.showVoid }) : '') + (x && x.tail ? str(x.tail) : '') + '</li>';
  };
  // 옛 한 장짜리 상세(5칸 단계 막대 + 과제 목록). 구간·단계 화면(preptask.js)이 없을 때의 대체 경로다.
  prep.caseHtml = function (m) {
    const v = m.view || {};
    const vw = v.viewer || {};
    const tasks = Array.isArray(v.tasks) ? v.tasks : [];
    const byCd = tasksByCd(tasks);
    let h = prep.caseHeadHtml(m) + prep.stepsHtml(prep.stepModel(v, m.history)) + prep.caseNoticeHtml(m);
    if (tasks.length) {
      const models = tasks.map(function (t, i) { return prep.taskModel(t, byCd, vw, i); });
      const pr = v.progress || {};
      const done = Number(pr.done) || 0, total = Number(pr.total) || 0;
      h += '<div class="pp-sec-head">준비 과제 <span class="tm-n">' + done + '/' + total + '</span>' + pipsHtml(done, total) +
        '<small>준비중·해당 없음 과제는 세지 않습니다</small></div>';
      if (TASK_STATES.indexOf(v.state_cd) >= 0 && !vw.is_assignee) h += '<p class="pp-next">' + esc(T.readonly) + '</p>';
      h += '<ol class="pp-tasks" aria-label="준비 과제">' + models.map(function (t) { return prep.taskItemHtml(t, m); }).join('') + '</ol>';
    } else if (v.state_cd === 'CONFIRMED' || v.state_cd === 'OPEN_PENDING') {
      h += '<p class="wf-empty">' + esc(prep.isNewStartFlow(vw) ? T.tasksLaterStart : T.tasksLater) + '</p>';
    }
    return h + prep.endHtml(v, { confirm: m.confirm, withdrawing: m.withdrawing });
  };

  // ── 모달(개설 신청·확정 취소·중단·파일 무효 처리) ─────────────────────
  // m: { kind, reason, sel, q, candState: 'loading'|'ok'|'err', cands }
  // info: { name, assignees(명), writing, fileName, meEmp }
  prep.modalTitle = function (kind, info) {
    const i = info || {};
    if (kind === 'open') return (i.change ? '담당자 변경 — ' : i.direct ? '담당자 지정 — ' : '개설 신청 — ') + str(i.name);
    if (kind === 'unconfirm') return '제안 확정 취소 — ' + str(i.name);
    if (kind === 'abort') return '사전준비 중단 — ' + str(i.name);
    return '파일 무효 처리 — ' + str(i.fileName);
  };
  prep.modalGoLabel = function (kind, direct, change) {
    return { open: change ? '담당자 변경 요청' : direct ? '사전준비 시작' : '개설 신청 올리기', unconfirm: '확정 취소하기', abort: '중단하기', 'void': '무효 처리하기' }[kind] || '확인';
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
      if (m.change) {
        return '<p class="tm-note">' + esc(T.changeNote) + '</p>' +
          '<fieldset class="tm-fs"><legend>담당자</legend>' + inner + '</fieldset>' +
          reasonBlock(m, '변경 사유 (필수)', '사유에는 주민등록번호·카드번호 같은 개인정보를 적지 마세요.');
      }
      return nobidWarnBlock(i.nobidWarn) + (m.direct
        ? '<p class="tm-note">' + esc(T.startModalNote) + ' 담당자는 1~10명 지정합니다.</p>'
        : '<p class="tm-note">담당자로 일할 사람을 1~10명 지명합니다. 승인되면 지명한 사람이 담당자가 되고 준비 과제가 열립니다. 신청자나 지명자에 영업팀장이 있으면 영업부장이 승인합니다.</p>') +
        '<fieldset class="tm-fs"><legend>' + (m.direct ? '담당자 지정' : '담당자 지명') + '</legend>' + inner + '</fieldset>' +
        reasonBlock(m, '의견 (선택)', '의견에는 주민등록번호·카드번호 같은 개인정보를 적지 마세요.');
    }
    if (kind === 'unconfirm') {
      return '<p class="tm-note">담당자 지정 전이라 담당자·과제 기록은 없습니다. 다시 확정하면 같은 건이 되살아납니다.</p>' +
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
    const go = prep.modalGoLabel(m.kind, !!m.direct, !!m.change);
    const goCls = m.kind === 'abort' ? ' class="pp-danger"' : (m.kind === 'open' ? ' class="pp-next-btn"' : '');
    return '<div class="modal-box tm-modal-box" role="dialog" aria-modal="true" aria-labelledby="pp-m-title">' +
      '<h3 id="pp-m-title">' + esc(prep.modalTitle(m.kind, Object.assign({}, info, { direct: !!m.direct, change: !!m.change }))) + '</h3>' +
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
      if (m.change) {
        const d = prep.assigneeDiff(m.cur, m.sel);
        const same = !d.add.length && !d.remove.length;
        const okReason = reason.length >= 1 && reason.length <= prep.REASON_MAX;
        return { canGo: n >= 1 && !same && okReason && m.candState === 'ok' && !busy,
                 why: n < 1 ? tm.T.assignWhy : same ? T.changeWhySame : okReason ? '' : '사유를 적으세요.', count: n + '/' + prep.MAX + '명' };
      }
      return { canGo: n >= 1 && m.candState === 'ok' && !busy, why: n < 1 ? tm.T.assignWhy : '', count: n + '/' + prep.MAX + '명' };
    }
    return { canGo: reason.length >= 1 && reason.length <= prep.REASON_MAX && !busy, why: reason ? '' : '사유를 적으세요.', count: '' };
  };

  // 지금 담당자(cur)와 고른 사람(sel)의 차이 → { add, remove } (사번 목록)
  prep.assigneeDiff = function (cur, sel) {
    const c = (Array.isArray(cur) ? cur : []).map(str), x = (Array.isArray(sel) ? sel : []).map(str);
    return { add: x.filter(function (e) { return c.indexOf(e) < 0; }), remove: c.filter(function (e) { return x.indexOf(e) < 0; }) };
  };

  prep.closeConfirmHtml = function () {
    return '<div class="pp-confirm" role="group" aria-label="닫기 확인"><span>' + esc(T.closeAsk) + '</span>' +
      '<button type="button" id="pp-m-keep">계속 작성</button><button type="button" id="pp-m-discard">버리고 닫기</button></div>';
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
    if (where === 'prepstart') {
      const bad = function (text, after) { return { text: text, after: after, code: code }; };
      if (code === 'NOTIFY_TARGET_NOT_RESOLVED') return bad(p.message || T.errNotify, 'keep');
      if (code === 'OPEN_APPROVAL_ON') return bad('지금은 개설 결재 방식이 켜져 있어 바로 시작할 수 없습니다. 최신 상태를 다시 불러왔습니다.', 'closeReload');
      if (code === 'OPEN_APPROVAL_CLOSED') return bad('개설 결재 방식이 닫혀 있습니다. 최신 상태를 다시 불러왔으니 확인한 뒤 다시 하세요.', 'closeReload');
      if (code === 'OPEN_PENDING') return bad('이 건에는 개설 신청이 이미 올라가 있습니다. 승인을 기다리거나 신청을 회수하세요. 최신 상태를 다시 불러왔습니다.', 'closeReload');
      if (code === 'NOT_GOAL_TARGET') return bad(T.errNotGoal, 'keep');
      if (code === 'GOAL_CHANGE_PENDING') return bad('이 기관의 목표 변경 결재가 진행 중입니다. 결재가 끝난 뒤 다시 담당자를 지정하세요.', 'keep');
      if (code === 'ASSIGNED_ALREADY') return bad('이미 담당자가 지정되어 있습니다. 화면을 다시 불러옵니다.', 'closeReload');
      if (status === 403) return bad(T.errStartOwner, 'reload');
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
  // 아래는 DOM 배선 — mount()가 불릴 때만 실행된다(노드 테스트 대상 아님).
  // ════════════════════════════════════════════════════════════════
  function freshState() {
    return { who: '', tab: 'active', query: '', selected: '', rows: [], listState: 'loading', detail: null,
             modal: null, confirm: null, showVoid: false, uploading: false, busy: false,
             seq: 0, listSeq: 0, flash: '', refocus: '', focusTitle: false, withdrawing: false,
             nb: null, nbSeen: '',   // nb: 열린 입찰 없음 팝업 { id, round, rev, sending } · nbSeen: 이미 띄운 건|회차|판정 번호
             view: 'board', fromBoard: false, pendingCase: false, boardName: '',
             board: null, boardLoading: false, boardSeq: 0, stepIdx: -1, stepAuto: true, markBusy: {}, live: '', sum: null, foldOpen: {}, nextAsk: false };   // 구간·단계 화면(preptask.js): board = { row, marks, scope }(제안 준비 현황 표의 그 줄), stepIdx -1 = '지금 할 단계'로 자동   // 제안 준비 현황 표(prepboard.js)가 있을 때: view 'board'(표) | 'case'(같은 자리 상세). fromBoard: 표에서 연 상세
  }
  let S = freshState();
  let reqSeq = 0;   // 요청 번호는 S 밖에서 단조 증가 — 계정 전환으로 S가 새로 만들어져도 옛 응답 번호와 겹치지 않는다(seq·listSeq 공용)
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

  // ── 현황판·지도 상세 팝업이 쓰는 '진행 중 건' 캐시 ──
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
  // 현황판·지도 상세 팝업의 [확정]이 쓰는 공용 요청. 화면 머리글(X-Screen-Id·X-Button-Id)을 싣고, 성공·실패 모두 진행 중 캐시를 비운다.
  prep.postConfirm = function (institutionId, screen) {
    return req('POST', '/preps', { institution_id: institutionId }, ui(screen, 'confirm')).then(
      function (j) { invalidateCache(); return j; },
      function (e) { invalidateCache(); throw e; });
  };

  // ── 목록 ──
  function paintGate(gate) {
    el('pp-gate').innerHTML = gate ? '<p class="wf-empty">' + esc(gate.text) + '</p>' : '';
    el('pp-wrap').style.display = gate ? 'none' : '';
    const bd = el('pp-board');
    if (bd) bd.style.display = gate ? 'none' : '';
  }

  // ── 제안 준비 현황 표 ↔ 상세 전환(NEXT 102). #pp-board·prepboard.js가 없으면 옛 목록+상세 화면 그대로. ──
  function boardOn() { return !!(root.prepboard && root.prepboard.show && el('pp-board')); }
  function showView() {
    const bo = boardOn();
    const inCase = !bo || S.view === 'case';
    if (bo) el('pp-board').hidden = inCase;
    el('pp-wrap').hidden = !inCase;
    const list = el('pp-list'); if (list) list.hidden = bo;      // 표가 있으면 왼쪽 목록은 쓰지 않는다
    const bk = el('pp-back'); if (bk) bk.hidden = !bo;
  }
  function toBoardState() {
    S.view = 'board'; S.fromBoard = false; S.selected = ''; S.detail = null; S.seq = ++reqSeq; S.confirm = null; S.nbSeen = ''; S.boardName = '';
    resetSteps(null);
  }
  // 건을 새로 열 때: 표가 넘긴 줄이 있으면 그것으로, 없으면 상세를 받은 뒤 loadBoardRow가 채운다.
  function resetSteps(bd) {
    S.board = bd && bd.row ? { row: bd.row, marks: Array.isArray(bd.marks) ? bd.marks : [], scope: str(bd.scope) } : null;
    S.boardLoading = false; S.boardSeq = ++reqSeq; S.stepIdx = -1; S.stepAuto = true; S.markBusy = {}; S.live = '';
    S.sum = null; S.foldOpen = {}; S.res = null;   // 3단계 펼침 내용(기관 정보 요약 응답)·다시 편 과제
    S.mat = null;                    // 7단계 이사회 자료
  }
  function boardHooks() {
    const role = myRole();
    return { req: req, roleLabel: root.roles ? root.roles.roleLabel(role) : role, openCase: enterCase,
             openMap: function () { if (root.app && root.app.openNavItem) root.app.openNavItem('map'); } };
  }
  // 표의 기관 이름 → 같은 자리에서 상세. 상세를 여는 요청의 화면 이름은 prep_dashboard.
  function enterCase(bid, name, bd) {
    if (root.prepboard && root.prepboard.leave) root.prepboard.leave();
    S.view = 'case'; S.fromBoard = true; S.selected = String(bid); S.nbSeen = ''; S.tab = 'active'; S.query = ''; S.detail = null;
    S.boardName = typeof name === 'string' ? name : '';
    resetSteps(bd);
    S.modal = null; S.confirm = null; S.showVoid = false; S.focusTitle = true;
    clearQueryBox();
    clearNotices();
    showView();
    // 표에서 연 상세는 숨은 왼쪽 목록이 필요 없다 — GET /preps(prep_list/refresh)를 보내지 않는다(qa P3-7).
    if (!boardOn()) loadList();
    loadDetail(S.selected, { popup: true });
  }
  // [← 제안 준비 현황으로] — 거르기·스크롤은 prepboard가 간직하고, 표는 다시 불러온다(상세에서 과제를 체크하면 자동 칸이 바뀐다).
  function backToBoard() {
    const bid = S.selected;
    if (S.nb) closeNobid(false);
    toBoardState();
    invalidateCache();
    clearNotices();
    showView();
    root.prepboard.show(boardHooks(), { reload: true, focusBid: bid });
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
  // 제목·모달 이름: 목록 행이 있으면 그 이름, 표에서 연 상세는 표가 넘긴 이름(S.boardName).
  function caseName() { const row = rowOf(S.selected); return row ? row.name : S.boardName; }
  // 표에서 연 상세는 쓰기 뒤에도 GET /preps를 생략한다(qa P3-a). 지도·현황판·옛 화면은 그대로 목록을 다시 읽는다.
  function reloadList() { if (!S.fromBoard) loadList(); }

  function loadList() {
    const token = S.listSeq = ++reqSeq;
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
      box.innerHTML = '<h2 id="pp-case-title" class="sr-only" tabindex="-1">제안 준비 현황</h2><p class="wf-empty">' + esc(T.pick) + '</p>';
      return;
    }
    if (d.loading) {
      box.setAttribute('aria-busy', 'true');
      box.innerHTML = '<h2 id="pp-case-title" class="tm-title" tabindex="-1">' + esc(caseName()) + '</h2><p class="wf-empty">' + esc(T.loading) + '</p>';
      return;
    }
    box.setAttribute('aria-busy', 'false');
    if (d.err) {
      const st = d.err.status;
      if (st === 401) { paintGate({ text: T.login }); return; }
      box.innerHTML = '<h2 id="pp-case-title" class="tm-title" tabindex="-1">' + esc(caseName()) + '</h2>' + (st === 404
        ? '<p class="wf-empty">' + esc(T.noView) + '</p>'
        : '<p class="wf-empty">' + esc(T.detailErr) + '</p><button type="button" id="pp-retry-detail">' + esc(T.retry) + '</button>');
      return;
    }
    const model = { view: d.view, history: d.history, attach: d.attach, role: myRole(), meEmp: myEmp(),
      confirm: S.confirm, uploading: S.uploading, showVoid: S.showVoid, withdrawing: S.withdrawing,
      canNotice: nbCanNotice(prep.nobidOf(d.view)) };
    const pt = root.preptask;
    if (pt && pt.caseHtml) {   // 구간·단계 한 화면(NEXT 113 2단계)
      const bd = S.board || {};
      model.row = bd.row || null; model.marks = bd.marks || []; model.rowState = S.boardLoading ? 'loading' : 'none';
      const ni = noticeInfo(d.view, model.row);   // 입찰공고확인 판정을 그 줄에 적는다 — '지금 할 단계'보다 먼저
      if (S.stepIdx < 0) S.stepIdx = pt.defaultIdx(d.view, model.row, model.marks);
      model.idx = S.stepIdx; model.markBusy = S.markBusy;
      const curStep = pt.STEPS[pt.clampIdx(S.stepIdx)];
      const filesOf = function (kind, o) {   // 첨부 목록을 받았을 때만(담당자 지정 뒤, 볼 수 있는 사람)
        if (!Array.isArray(d.attach)) return '';
        return prep.filesHtml(Object.assign({ rows: d.attach, viewer: (d.view && d.view.viewer) || {}, meEmp: myEmp(), role: myRole(), stateCd: d.view.state_cd,
          uploading: S.uploading, showVoid: false, task: kind }, o));
      };
      if (curStep.kind === 'notice') {
        const vwr = (d.view && d.view.viewer) || {};
        const nFiles = Array.isArray(d.attach) ? d.attach.filter(function (r) { return r && r.valid && r.task_cd === 'NOTICE'; }).length : 0;
        const cell = model.row && model.row.cells && model.row.cells.NOTICE_CHECK ? model.row.cells.NOTICE_CHECK : {};
        model.notice = { state: ni.state, gaps: ni.gaps, html: ni.build ? ni.build() : '',
          checks: pt.noticeChecks ? pt.noticeChecks(ni.ns || null, str(cell.notice_status_cd), { known: Array.isArray(d.attach), n: nFiles }, { canUpload: !!vwr.can_upload }) : [] };
        model.noticeFiles = filesOf('NOTICE', { title: '', hint: pt.T.noticeFilesHint, empty: pt.T.noticeFilesEmpty });
      }
      if (curStep.id === 'INST_ANALYSIS') { model.docs = stepDocs(d.view); model.foldOpen = S.foldOpen; }
      if (curStep.id === 'BOARD_DOC' || curStep.result) model.board = stepBoard();
      if (curStep.id === 'BOARD_DOC') model.addFiles = filesOf('BOARD_ADD', { title: '', hint: pt.T.addFilesHint, empty: pt.T.addFilesEmpty });
      if (curStep.result) model.resFiles = filesOf('BOARD_RES', { title: '', hint: pt.T.resFilesHint, empty: pt.T.resFilesEmpty });
      box.innerHTML = pt.caseHtml(model);
      if (S.live) { const lv = el('ts-live'); if (lv) lv.textContent = S.live; S.live = ''; }
    } else {
      box.innerHTML = prep.caseHtml(model);
    }
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

  // ── 구간·단계 화면: 단계 고르기·표의 그 줄 받기·칸 체크 ──
  function stepCtx() {
    const d = S.detail, bd = S.board || {};
    return root.preptask && d && d.view ? { pt: root.preptask, v: d.view, row: bd.row || null, marks: bd.marks || [] } : null;
  }
  // 비동기 응답으로 다시 그릴 때: 지금 포커스가 놓인 단추를 다시 찾아 준다(다시 그리면 단추가 새로 만들어진다).
  function focusKey() {
    const a = document.activeElement, box = el('pp-case');
    if (!a || !box || !box.contains(a) || !a.getAttribute) return '';
    if (a.id) return '#' + a.id;
    if (a.classList && a.classList.contains('ts-step')) return '.ts-step[data-i="' + a.getAttribute('data-i') + '"]';
    const act = a.getAttribute('data-act');
    if (!act) return '';
    let sel = '[data-act="' + act + '"]';
    ['data-col', 'data-mk', 'data-task', 'data-ph', 'data-attach'].forEach(function (k) {
      const val = a.getAttribute(k);
      if (val && /^[\w:.-]+$/.test(val)) sel += '[' + k + '="' + val + '"]';
    });
    return sel;
  }
  function repaintKeep() {
    if (!S.detail || S.detail.loading || S.detail.err) return;
    if (!S.refocus && !S.focusTitle && !S.confirm) S.refocus = focusKey();
    paintCase();
  }
  function selectStep(i, refocus) {
    const c = stepCtx();
    if (!c || !(i >= 0 && i < c.pt.STEPS.length)) return;
    S.stepIdx = i; S.stepAuto = false; S.confirm = null;
    S.refocus = refocus || '.ts-step[data-i="' + i + '"]';
    S.live = c.pt.liveText(c.v, c.row, c.marks, i);
    paintCase();
  }
  // 2단계 입찰공고확인(사용자 11-25): 기관정보 팝업과 같은 내용을 읽기 전용으로 보이고, 누락·미확인이 없으면 완료로 본다.
  // 판정은 표의 그 줄 NOTICE_CHECK 칸에 notice_ok로 적는다(preptask.stepState가 읽는다). 기관 자료를 못 찾으면 판정하지 않는다.
  function noticeInfo(v, row) {
    const D = root.dashboard, pt = root.preptask;
    let out = { state: 'none', gaps: [], build: null };
    try {
      const id = str(v && v.institution_id);
      const list = D && D.util && D.util.dataList ? D.util.dataList() : [];
      const rec = id ? list.filter(function (r) { return String(r.institutionId || '') === id; })[0] : null;
      if (rec && D.itemForRec && D.paneParts && pt && pt.noticeGaps) {
        const today = D.util.todayDate ? D.util.todayDate() : new Date();
        const it = D.itemForRec(rec, today);
        const nr = root.noticerec;
        if (nr && nr.ensure) nr.ensure();
        const snap = nr && nr.snap ? nr.snap() : null;
        let ns = null;
        try { ns = root.logic && root.logic.noticeState ? root.logic.noticeState(rec, today) : null; } catch (e) { ns = null; }
        out = { state: 'ok', ns: ns,
          gaps: pt.noticeGaps(it, { hasLink: !!(D.noticeLink && D.noticeLink(rec)), unhandled: !!(snap && D.isUnhandled && D.isUnhandled(it, snap)) }),
          build: function () {
            try {
              const p = D.paneParts(it, { readOnly: true, today: today });
              // 읽기 전용: 단추는 걷고, 다른 화면의 같은 id와 겹치지 않게 id도 뺀다
              return (str(p.sub) + str(p.rest)).replace(/<button\b[\s\S]*?<\/button>/g, '').replace(/\s(?:id|aria-labelledby|aria-describedby)="[^"]*"/g, '');
            } catch (e) { return ''; }
          } };
      }
    } catch (e) { out = { state: 'none', gaps: [], build: null }; }
    if (row) {
      row.cells = row.cells || {};
      const cell = Object.assign({}, row.cells.NOTICE_CHECK);
      if (out.state === 'ok') cell.notice_ok = out.gaps.length === 0; else delete cell.notice_ok;
      row.cells.NOTICE_CHECK = cell;
    }
    return out;
  }
  // 3단계 기관 정보 분석(펼침형, 사용자 11-25): 과제 내용을 본문에 펼친다.
  //   T1 기관 정보 요약 = 양식 응답(GET …/prep/forms/INST_SUMMARY)을 읽기용 표로, [수정하기] = 양식 작성 창(instsummary.js).
  //   T2 기관장 프로필 = 기관정보의 기관장 카드(headcard.js) 그대로, [수정하기] = 그 카드의 편집 창.
  function hcEnv() {
    const D = root.dashboard;
    const v = (S.detail && S.detail.view) || {};
    return { serverMode: root.store.isServerMode(), hasEmp: !!myEmp(), role: myRole(), emp: myEmp(),
             today: D && D.util && D.util.todayDate ? D.util.todayDate() : new Date(), repaint: repaintKeep, instName: str(v.institution_name) };
  }
  function loadSummary(id) {
    const mine = S.sum = { state: 'loading', view: null };
    req('GET', base(id) + '/forms/INST_SUMMARY', undefined, ui('prep_form', 'form_open')).then(function (view) {
      if (S.sum !== mine || S.selected !== id) return;
      mine.state = 'ok'; mine.view = view;
      repaintKeep();
    }).catch(function () {
      if (S.sum !== mine || S.selected !== id) return;
      mine.state = 'err';
      repaintKeep();
    });
  }
  function stepDocs(v) {
    const pt = root.preptask, hc = root.headcard;
    const docs = {};
    const has = function (cd) { return (v.tasks || []).some(function (t) { return t && t.task_cd === cd && (t.state === 'TODO' || t.state === 'DONE'); }); };
    if (has('T1')) {
      if (!S.sum && S.selected) loadSummary(S.selected);
      const sm = S.sum || { state: 'loading' };
      // 아직 한 번도 저장하지 않았으면(판 0) 단추 이름이 [작성하기]다(사용자 11-25)
      docs.T1 = { state: sm.state, html: sm.state === 'ok' && pt.summaryHtml ? pt.summaryHtml(sm.view) : '', empty: sm.state === 'ok' && !(Number(sm.view && sm.view.cur_ver) > 0) };
    }
    if (has('T2')) {
      const id = str(v.institution_id);
      let html = '';
      try { html = hc && hc.paneSection && id ? hc.paneSection({ institutionId: id }, hcEnv()) : ''; } catch (e) { html = ''; }
      docs.T2 = { state: html ? 'ok' : 'err', html: html };
    }
    return docs;
  }
  function onDocEdit(cd, btn) {
    const id = S.selected;
    const v = (S.detail && S.detail.view) || {};
    if (!id) return;
    if (cd === 'T1') {
      if (!root.instSummary || !root.instSummary.open) { setPerr('기관 선정 입찰참여 관련 요약 양식을 열 수 없습니다. 화면을 새로 고친 뒤 다시 하세요.'); return; }
      root.instSummary.open({
        bidCaseId: id, instName: str(v.institution_name) || caseName(), opener: btn,
        restoreFallback: function () { return el('pp-case-title'); },
        onClosed: function () { if (S.selected === id) { S.sum = null; repaintKeep(); } },   // 닫으면 본문 내용을 다시 읽는다(저장만 하고 닫은 경우도 반영)
      });
    } else if (cd === 'T2') {
      const hc = root.headcard;
      if (!hc || !hc.onPaneClick) return;
      const st = hc.view ? hc.view().status : '';
      hc.onPaneClick(st === 'none' ? 'add-head' : 'edit', hcEnv);
    }
  }
  // ── 4·7단계: 수익성 분석표 → 이사회 자료(사용자 11-25) ──
  //   4단계에서 수익성 분석표(xlsx)를 올리면 그 기관의 이사회 자료 초안을 자동으로 만든다: 자료가 없으면 만들고 → 엑셀을 양식에 채우고 → 버전으로 저장.
  //   모두 '이사회 자료 작성' 화면이 쓰는 서버 주소·함수(board-write.js·board-material.js) 그대로다. 표별 확인·제출은 7단계에서 그 화면으로 가서 한다.
  //   실패해도 올린 파일은 그대로다 — 알림만 하고 7단계에서 직접 올리게 한다.
  function bfetch(url, init) { return fetch(url, init); }
  function matOfCase(id) {   // → Promise<{ ok, item|null }> — 이 건의 이사회 자료(여러 해면 가장 최근 해)
    const mat = root.boardMat;
    return mat.loadList(bfetch, {}).then(function (r) {
      if (!r.ok) return { ok: false, item: null };
      const mine = r.items.filter(function (i) { return str(i.bid_case_id) === id; }).sort(function (a, b) { return Number(b.year) - Number(a.year); });
      return { ok: true, item: mine[0] || null };
    });
  }
  function autoBoardDraft(id, file) {   // → Promise<{ kind: 'skip'|'saved'|'same'|'locked'|'fail', snapNo }>
    const bw = root.boardWrite, mat = root.boardMat;
    if (!bw || !mat || !bw.buildState || !mat.loadList || !/\.xlsx$/i.test(str(file && file.name))) return Promise.resolve({ kind: 'skip' });
    const fail = { kind: 'fail' };
    return matOfCase(id).then(function (f) {
      if (!f.ok) return fail;
      if (f.item) return f.item.material_id;
      return mat.createMaterial(bfetch, { bidCaseId: id, year: new Date().getFullYear() }).then(function (c) {
        return c.ok ? c.material.material_id : c.exists ? c.materialId : null;
      });
    }).then(function (mid) {
      if (mid == null || mid === fail) return fail;
      return mat.loadMaterial(bfetch, mid, mat.UI.WRITE, mat.BTN.OPEN).then(function (r) {
        if (!r.ok) return fail;
        const d = r.material;
        if (str(d.status_cd) !== 'DRAFT' && str(d.status_cd) !== 'PREP') return { kind: 'locked' };   // 제출·확정된 자료는 건드리지 않는다
        return bw.upload(bfetch, str(d.form_id) || 'default_doc', d.form_version, file, null, id).then(function (x) {
          if (!x.ok || !x.body || !Array.isArray(x.body.tables)) return fail;
          const baseVals = mat.baseOf(d.snapshot && d.snapshot.tables);
          const ws = bw.adoptManual(bw.buildState(d.form, x.body, { fileName: file.name, formId: str(d.form_id), version: d.form_version }), baseVals);
          const body = bw.saveBody(ws, baseVals, d.current_snap, '수익성 분석표 올리기로 자동 작성(표별 확인 전)');
          return bw.postSnapshot(bfetch, mid, body).then(function (s) {
            if (!s.ok) return fail;
            return { kind: s.body && s.body.changed === false ? 'same' : 'saved', snapNo: Number(s.body && s.body.snap_no) || 0 };
          });
        });
      });
    }).catch(function () { return fail; });
  }
  // 7단계 본문: 이 건의 이사회 자료(상태·마지막 저장·채워진 표). S.mat = { state: 'loading'|'ok'|'none'|'err', d }
  function loadMat(id) {
    const mat = root.boardMat;
    const mine = S.mat = { state: 'loading', d: null };
    const done = function (state, d) { if (S.mat !== mine || S.selected !== id) return; mine.state = state; mine.d = d || null; repaintKeep(); };
    if (!mat || !mat.loadList) { mine.state = 'err'; return; }
    matOfCase(id).then(function (f) {
      if (!f.ok) { done('err'); return; }
      if (!f.item) { done('none'); return; }
      return mat.loadMaterial(bfetch, f.item.material_id, mat.UI.REVIEW, mat.BTN.OPEN).then(function (r) { done(r.ok ? 'ok' : 'err', r.ok ? r.material : null); });
    }).catch(function () { done('err'); });
  }
  function stepBoard() {
    const mat = root.boardMat;
    if (!S.mat && S.selected) loadMat(S.selected);
    const sm = S.mat || { state: 'loading' };
    if (sm.state !== 'ok' || !sm.d || !mat) return { state: sm.state };
    const d = sm.d;
    let html = '';
    try { html = mat.readOnlyHtml(d.form, d.snapshot && d.snapshot.tables); } catch (e) { html = ''; }
    const rs = S.res || {};
    return { state: 'ok', id: d.material_id, statusName: str(d.status_name), snapNo: Number(d.current_snap) || 0,
             saved: mat.savedLabel ? mat.savedLabel(d) : '', confirmed: d.confirmed_snap != null, html: html,
             resultCd: str(d.result_cd), meeting: mat.dateOf ? str(mat.dateOf(d.meeting_date)) : str(d.meeting_date).slice(0, 10),
             canResult: !!(d.viewer && d.viewer.can_set_result === true), resBusy: !!rs.busy, resErr: str(rs.err) };
  }
  // 이사회 일정 등록(sched: 결과 = 의결 예정)·결과 등록 — 이사회 자료 화면의 '의결 결과 입력'과 같은 주소(누가·언제는 자료 이력에 남는다).
  function onBoardResult(sched) {
    const mat = root.boardMat, sm = S.mat, id = S.selected;
    if (!mat || !mat.actCall || !sm || sm.state !== 'ok' || !sm.d || (S.res && S.res.busy)) return;
    const dateEl = el(sched ? 'ts-sched-date' : 'ts-res-date'), cdEl = el('ts-res-cd');
    const date = str(dateEl && dateEl.value).trim();
    const result = sched ? 'SCHEDULED' : str(cdEl && cdEl.value);
    const sel = '[data-act="' + (sched ? 'board-sched' : 'board-result') + '"]';
    if (!date) { S.res = { busy: false, err: T.errDate }; S.refocus = '#' + (sched ? 'ts-sched-date' : 'ts-res-date'); paintCase(); return; }
    const mine = S.res = { busy: true, err: '' };
    S.refocus = sel; paintCase();
    mat.actCall(bfetch, 'result', sm.d.material_id, { result: result, date: date }).then(function (r) {
      if (S.res !== mine || S.selected !== id) return;
      if (!r || !r.ok) {
        const msg = r && r.body && typeof r.body === 'object' ? str(r.body.message || r.body.error) : '';
        S.res = { busy: false, err: msg || T.errResult }; S.refocus = sel; paintCase(); return;
      }
      S.res = null; S.mat = null;   // 자료를 다시 읽는다
      setFlash(sched ? T.okSched : T.okResult);
      S.refocus = sel; paintCase();
    }).catch(function () {
      if (S.res !== mine) return;
      S.res = { busy: false, err: T.errResult }; S.refocus = sel; paintCase();
    });
  }
  // [다음] 확인 팝업(사용자 11-25: 단계마다 공통) — [확인]이면 다음 단계로, [닫기]·Esc·바깥 클릭이면 그대로.
  function openNextAsk() {
    const c = stepCtx();
    if (!c || S.modal || S.nb || S.nextAsk || !c.pt.nextAskHtml) return;
    const html = c.pt.nextAskHtml(S.stepIdx);
    if (!html) return;
    S.nextAsk = true;
    const box = el('pp-modal');
    box.innerHTML = html;
    box.style.display = '';
    const ok = el('pp-nx-ok'); if (ok) ok.focus();
  }
  function closeNextAsk(go) {
    if (!S.nextAsk) return;
    S.nextAsk = false;
    const box = el('pp-modal'); box.style.display = 'none'; box.innerHTML = '';
    if (go) {
      // 2단계 입찰공고확인: 누락·미확인이 없으면 넘어가면서 '확인'을 적는다(사용자 11-25 — 누가·언제 확인했는지 이력). 표의 칸 체크와 같은 주소.
      const c = stepCtx();
      if (c && c.pt.noticeConfirmDue) {
        const ni = noticeInfo(c.v, c.row);
        if (c.pt.noticeConfirmDue(S.stepIdx, c.v, c.row, S.boardLoading ? 'loading' : 'none', ni)) onMark('NOTICE_CHECK', 'DONE');
      }
      stepBy(1);
      return;
    }
    const b = el('pp-case').querySelector('[data-act="ts-next"]'); if (b) b.focus();
  }
  // 단계 본문의 이동 단추 → 다른 메뉴 화면
  function goNav(name) {
    const N = root.nav || {};
    const id = { board: N.DASH_ID, map: 'map', notice: N.NOTICE_ID, team: N.TEAM_ID }[name];
    if (id && root.app && root.app.openNavItem) root.app.openNavItem(id);
  }
  // [이전]/[다음] — 누른 단추에 포커스를 남긴다(연달아 누를 수 있게). 끝에서 그 단추가 꺼지면 반대 단추로.
  function stepBy(d) {
    const c = stepCtx();
    if (!c) return;
    const i = S.stepIdx + d, last = c.pt.STEPS.length - 1;
    const keep = d > 0 ? (i >= last ? 'ts-prev' : 'ts-next') : (i <= 0 ? 'ts-next' : 'ts-prev');
    selectStep(i, '[data-act="' + keep + '"]');
  }
  // 제안 준비 현황 표의 그 줄(손으로 체크하는 칸의 값·체크 권한). scope를 주면 그 범위만, 없으면 내 작업 → 부서 순으로 찾는다.
  function loadBoardRow(id, scope) {
    const pbd = root.prepboard;
    if (!root.preptask || !pbd || !pbd.boardUrl) return;
    const token = S.boardSeq = ++reqSeq;
    const order = pbd.scopeValid(scope) ? [scope] : ['mine', 'dept'];
    if (!S.board) S.boardLoading = true;
    (function next(k) {
      req('GET', pbd.boardUrl(order[k], true), undefined, ui('prep_dashboard', 'refresh')).then(function (d) {
        if (token !== S.boardSeq || S.selected !== id) return;
        const rows = d && Array.isArray(d.rows) ? d.rows : [];
        const row = rows.filter(function (r) { return r && str(r.bid_case_id) === id; })[0] || null;
        if (!row && k + 1 < order.length) { next(k + 1); return; }
        S.boardLoading = false;
        if (row && !Object.keys(S.markBusy).length) {   // 칸을 저장하는 중이면 그 응답이 값을 맞춘다
          S.board = { row: row, marks: Array.isArray(d.marks) ? d.marks : [], scope: order[k] };
          if (S.stepAuto) S.stepIdx = -1;
        }
        repaintKeep();
      }).catch(function () {
        if (token !== S.boardSeq || S.selected !== id) return;
        S.boardLoading = false;
        repaintKeep();
      });
    })(0);
  }
  // 칸 체크 — 제안 준비 현황 표와 같은 주소·같은 화면 이름표로 저장한다(서버 감사 허용 목록이 prep_dashboard/dash_check).
  function onMark(cd, mark) {
    const c = stepCtx(), pbd = root.prepboard, bd = S.board;
    if (!c || !pbd || !bd || !bd.row || !S.selected || !cd || S.markBusy[cd]) return;
    const id = S.selected, row = bd.row, s0 = S;
    const cur = c.pt.cellState(row, cd, bd.marks);
    if (cur.mark === mark) return;   // 같은 값은 요청하지 않는다
    const prev = row.cells && row.cells[cd] ? row.cells[cd] : { mark_cd: 'NONE', rev_no: 0 };
    const label = c.pt.colLabel(cd);
    S.markBusy[cd] = true;
    clearNotices();
    row.cells = row.cells || {};
    row.cells[cd] = Object.assign({}, prev, { mark_cd: mark });   // 고른 값을 바로 그린다
    repaintKeep();
    req('PUT', base(id) + '/board-checks/' + encodeURIComponent(cd), { mark_cd: mark, base_rev: cur.revNo }, ui('prep_dashboard', 'dash_check')).then(function (res) {
      if (s0 !== S || S.selected !== id || S.board !== bd) return;
      delete S.markBusy[cd];
      row.cells[cd] = Object.assign({}, prev, res && res.cell && typeof res.cell === 'object' ? res.cell : { mark_cd: mark });
      if (!res || res.saved !== false) setFlash(pbd.saveOk(label, pbd.markName(bd.marks, mark)));
      repaintKeep();
    }).catch(function (e) {
      if (s0 !== S || S.selected !== id || S.board !== bd) return;
      delete S.markBusy[cd];
      row.cells[cd] = prev;
      if (e && e.status === 401) { paintGate({ text: T.login }); return; }
      setPerr(pbd.saveError(e && e.status, e && e.detail && typeof e.detail === 'object' ? str(e.detail.code) : '', { inst: caseName() || str(row.institution_name), col: label }));
      repaintKeep();
    });
  }

  // o.popup: 건을 연 경우에만 true(목록 선택·화면 열림·다시 시도). 쓰기 뒤 재조회는 옵션 없음 = 입찰 없음 팝업을 또 띄우지 않는다.
  function loadDetail(id, o) {
    const popup = !!(o && o.popup);
    const token = S.seq = ++reqSeq;
    S.detail = { loading: true };
    paintCase();
    req('GET', base(id), undefined, ui(S.fromBoard ? 'prep_dashboard' : 'prep_detail', 'open')).then(function (view) {
      const vw = (view && view.viewer) || {};
      const tasks = (view && view.tasks) || [];
      // 사용자 11-25: '기관 정보 요약' 과제의 화면 이름
      tasks.forEach(function (t) { if (t && t.task_cd === 'T1') t.name = prep.T1_NAME; });
      const wantAttach = tasks.length > 0 && !!(vw.is_assignee || vw.is_head || myRole() === prep.LEAD);
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
      if (!S.board) loadBoardRow(id, '');                 // 지도·현황판에서 바로 연 건: 표의 그 줄을 받아 온다
      else if (!popup) loadBoardRow(id, S.board.scope);   // 쓰기 뒤: 체크 권한·자동 칸이 바뀌었을 수 있다
      if (popup) maybeNobid();
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
    resetSteps(null);
    S.modal = null;
    S.confirm = null;
    S.showVoid = false;
    clearNotices();
    markSelected();
    S.nbSeen = '';
    loadDetail(id, { popup: true });
  }

  function refresh() {
    const role = myRole();
    const gate = prep.gateOf({ serverMode: root.store.isServerMode(), emp: myEmp(), role: role,
                               roleLabel: root.roles ? root.roles.roleLabel(role) : role });
    paintGate(gate);
    if (gate) return;
    showView();
    if (boardOn() && S.view === 'board') { root.prepboard.show(boardHooks()); return; }
    S.listState = S.rows.length ? 'ok' : 'loading';
    paintList();
    loadList();
    if (S.selected) loadDetail(S.selected, { popup: true }); else paintCase();
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
      reloadList();
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
      reloadList();
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
  function onUploadPick(kind) {
    if (S.uploading) return;
    S.upKind = prep.FILE_KINDS[str(kind)] ? str(kind) : 'T3';
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
    const kind = S.upKind || 'T3';
    form.append('task_cd', kind);
    form.append('file', f, f.name);
    S.uploading = kind;
    S.busy = true;
    setPerr('');
    paintCase();
    req('POST', base(id) + '/attachments', undefined, ui('prep_detail', 'attach_upload'), form).then(function (res) {
      S.uploading = false; S.busy = false;
      const okText = prep.uploadOkText(f.name, res);
      setFlash(okText);
      S.refocus = '[data-act="upload"][data-kind="' + kind + '"]';
      invalidateCache();
      if (id === S.selected) loadDetail(id);
      if (kind !== 'T3') return;
      // 4단계 → 이사회 자료 초안 자동 작성(실패해도 올린 파일은 그대로)
      autoBoardDraft(id, f).then(function (r) {
        if (id !== S.selected || r.kind === 'skip') return;
        S.mat = null;   // 7단계 본문을 다시 읽게
        const T7 = root.preptask && root.preptask.T ? root.preptask.T : {};
        const tail = r.kind === 'saved' && T7.draftSaved ? T7.draftSaved(r.snapNo) : r.kind === 'same' ? T7.draftSame : r.kind === 'locked' ? T7.draftLocked : T7.draftFail;
        if (tail) setFlash(okText + ' ' + tail);
        repaintKeep();
      });
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
    const m = S.modal || {};
    return { name: str(v.institution_name) || caseName(), assignees: (v.assignees || []).length,
             writing: v.state_cd === 'WRITING', fileName: m.fileName || '', meEmp: myEmp(), nobidWarn: prep.nobidWarnText(v) };
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
      req('GET', '/assignment-candidates', undefined, ui('prep_detail', m.direct ? 'open_start' : 'open_request')).then(function (list) {
        if (S.modal !== m) return;
        m.cands = Array.isArray(list) ? list : [];
        m.candState = 'ok';
        // 결재 없는 시작(담당자 지정): 누른 사람을 기본으로 골라 둔다(사용자 11-25) — 후보에 있을 때만, 바꿀 수 있다
        if (m.direct && !m.change && !m.sel.length) { const me = myEmp(); if (me && m.cands.some(function (c) { return c && c.emp_no === me; })) m.sel = [me]; }
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
    const touched = m.change ? (function () { const d = prep.assigneeDiff(m.cur, m.sel); return d.add.length + d.remove.length > 0; })() : m.sel.length > 0;
    if (str(m.reason).trim() || touched) {
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
      if (m.change) {
        const d = prep.assigneeDiff(m.cur, m.sel);
        doAct(function () {
          return req('POST', '/approval-requests/assignee-change', { bid_case_id: S.selected, add_emp_nos: d.add, remove_emp_nos: d.remove, reason: reason }, ui('prep_detail', 'assignee_change'));
        }, T.okChangeReq, { modal: true, focusTitle: true, where: 'change' });
      } else if (m.direct) {
        doAct(function () { return req('POST', base(S.selected) + '/prep/start', body, ui('prep_detail', 'open_start')); },
          T.okPrepStart, { modal: true, focusTitle: true, where: 'prepstart' });
      } else {
        doAct(function () { return req('POST', base(S.selected) + '/open-requests', body, ui('prep_detail', 'open_request')); },
          T.okOpen, { modal: true, focusTitle: true, where: 'open' });
      }
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

  // ── 입찰 없음 알림 팝업(NEXT 98-1, design 11-19 6장) ──
  // 열림: 건을 연 뒤 상세가 도착했을 때 한 번. 닫힘: Esc·바깥 클릭(기록 없이 상세에 머묾), [공고 상태 보기]·[제안 확정 취소…]/[제안 중단…](기록 없음), [계속 작성](기록).
  let nbInert = [];
  function nbRelease() {
    const K = root.kbboard;
    if (K && K.inertRelease) K.inertRelease(nbInert);   // 이 팝업이 건 것만 푼다
    nbInert = [];
  }
  function nbCanNotice(n) {
    const A = root.app, N = root.nav;
    return !!(n && n.can_view_notice === true && A && A.findNavItem && N && N.NOTICE_ID && A.findNavItem(N.NOTICE_ID));
  }
  function nbErr(text) { const e = el('pp-nb-err'); if (e) e.textContent = text || ''; }
  function maybeNobid() {
    const v = S.detail && S.detail.view;
    if (!v || !prep.nobidPopup(v) || S.modal || S.nb) return;
    const pr = el('pp-root'), ts = document.getElementById('tab-soon');
    if (!pr || pr.style.display === 'none' || (ts && !ts.classList.contains('active'))) return;   // 숨은 화면에서 열면 배경 inert가 앱을 잠근다
    const key = [S.selected, v.nobid_notice.round_seq, v.nobid_notice.rev_no].join('|');
    if (S.nbSeen === key) return;
    S.nbSeen = key;
    openNobid();
  }
  function openNobid() {
    const v = S.detail && S.detail.view;
    const n = prep.nobidOf(v);
    if (!n) return;
    const md = el('pp-modal');
    S.nb = { id: S.selected, round: n.round_seq, rev: n.rev_no, sending: false };
    md.innerHTML = prep.nobidPopupHtml(v, { canNotice: nbCanNotice(n), name: caseName() });   // 상세에 기관명이 없으면 목록 행 이름
    md.style.display = '';
    nbWatchHidden();
    const K = root.kbboard;
    nbInert = K && K.inertBehind ? K.inertBehind(md, document.body) : [];
    const box = el('pp-nb');
    if (box) box.focus();   // 처음 포커스는 상자 자체 — 목록 Enter 한 번 더로 [계속 작성]이 눌리는 사고 방지(design 5-2)
  }
  // 팝업이 열린 뒤 사전준비 화면이 숨겨지면(#pp-root display:none · #tab-soon이 active를 잃음) 팝업과 inert를 즉시 거둔다(qa 11-19 P2-1).
  // nbSeen은 그대로라 돌아와도 다시 띄우지 않는다(사실 줄은 남는다). MutationObserver가 없는 환경이면 건너뛴다.
  let nbObs = null;
  function nbScreenHidden() {
    const pr = el('pp-root'), ts = document.getElementById('tab-soon');
    return !pr || pr.style.display === 'none' || !!(ts && !ts.classList.contains('active'));
  }
  function nbWatchHidden() {
    nbUnwatch();
    if (typeof MutationObserver === 'undefined') return;
    const pr = el('pp-root'), ts = document.getElementById('tab-soon');
    const check = function () { if (S.nb && nbScreenHidden()) closeNobid(false); };
    nbObs = new MutationObserver(check);
    if (pr) nbObs.observe(pr, { attributes: true, attributeFilter: ['style'] });
    if (ts) nbObs.observe(ts, { attributes: true, attributeFilter: ['class'] });
  }
  function nbUnwatch() { if (nbObs) { nbObs.disconnect(); nbObs = null; } }
  function closeNobid(refocus) {
    if (!S.nb) return;
    nbUnwatch();
    const md = el('pp-modal');
    md.style.display = 'none';
    md.innerHTML = '';
    S.nb = null;
    nbRelease();
    if (refocus) { const t = el('pp-case-title'); if (t && t.focus) t.focus(); }
  }
  // 현황판 kbboard.goNotice와 같은 경로: 입찰 공고 현황을 열고 그 기관을 고른다. 못 열면 false.
  function gotoNotice() {
    const A = root.app, N = root.nav, D = root.dashboard;
    if (!A || !A.openNavItem || !N || !N.NOTICE_ID || !A.openNavItem(N.NOTICE_ID)) return false;
    closeNobid(false);   // 화면이 바뀐다 — 팝업과 inert를 먼저 걷는다(기록 없음)
    const v = (S.detail && S.detail.view) || {};
    const id = String((v.nobid_notice && v.nobid_notice.institution_id) || v.institution_id || '');
    const list = D && D.util && D.util.dataList ? D.util.dataList() : [];
    const rec = id ? list.filter(function (r) { return String(r.institutionId || '') === id; })[0] : null;
    if (rec && D.selectKey) D.selectKey(logic.instKey(rec));
    else { const q = document.getElementById('db-q'); if (q && q.focus) q.focus(); }   // 기관을 못 찾아도 포커스가 body에 떨어지지 않게 — 공고 현황의 검색 칸으로
    return true;
  }
  function onNobidNotice() {
    if (S.nb && S.nb.sending) return;
    if (gotoNotice()) return;
    if (S.nb) nbErr(T.nbNoticeFail); else setPerr(T.nbNoticeFail);   // 못 열면 팝업을 닫지 않고 그 자리에 안내
  }
  function onNobidTidy() {
    const v = S.detail && S.detail.view;
    if (!v || !S.nb || S.nb.sending) return;
    const kind = prep.nobidTidy(v).kind;
    if (!kind) return;
    closeNobid(false);
    openModal(kind, { opener: el('pp-case-title') });   // 이 단계에서는 기록 없음 — 기존 모달이 자기 기록을 남긴다
  }
  function onNobidContinue() {
    const nb = S.nb;
    if (!nb || nb.sending) return;
    nb.sending = true;
    const btn0 = el('pp-nb-continue');
    if (btn0) btn0.setAttribute('aria-disabled', 'true');
    nbErr('');
    const id = nb.id;
    req('POST', base(id) + '/nobid-ack', { round_seq: nb.round, rev_no: nb.rev }, ui('prep_detail', 'nobid_continue')).then(function () {
      if (S.nb !== nb) return;
      closeNobid(true);   // 화면 표시 없음(Q2) — 201·200 모두 성공
    }).catch(function (e) {
      if (S.nb !== nb) return;
      nb.sending = false;
      if (btn0) btn0.removeAttribute('aria-disabled');
      const code = errtext.parse(e && e.detail).code;
      if (e && e.status === 409 && (code === 'NOTICE_CHANGED' || code === 'NOT_APPLICABLE')) {
        closeNobid(false);
        S.nbSeen = '';
        setFlash(code === 'NOTICE_CHANGED' ? T.nbChanged : T.nbGone);
        S.focusTitle = true;   // 다시 그린 뒤 제목으로(afterPaint) — 로딩 그림 중에는 제목이 곧 사라지므로 완료 뒤에 받는다
        loadDetail(id, { popup: true });   // 바뀐 공고 기록이면 새 판정으로 다시 묻는다
        return;
      }
      // 감사 기록 없이 진행되지 않게 닫지 않는다. 401·404 등은 기존 오류 문구를 재사용, 403은 권한 없음, 그 밖은 '다시 누르세요'.
      const st = e && e.status;
      nbErr(st === 401 || st === 404 ? prep.errorInfo(st, e && e.detail, curTasks(), 'nobid').text : st === 403 ? T.noWrite : T.nbAckFail);
    });
  }

  // ── 이벤트(#pp-root에 한 번만 위임) ──
  function onClick(e) {
    const t = e.target && e.target.closest ? e.target.closest('button, a') : null;
    if (!t) return;
    if (t.classList.contains('tm-item')) { selectCase(t.getAttribute('data-id')); return; }
    if (t.classList.contains('ts-step')) { selectStep(Number(t.getAttribute('data-i')), ''); return; }
    // 본문에 실은 기관장 카드의 단추([새로 고침]·[워드 내려받기] 등) — headcard.js가 처리한다
    const hcWhat = t.getAttribute('data-hc');
    if (hcWhat && root.headcard && root.headcard.onPaneClick && t.closest && t.closest('#pp-case')) { root.headcard.onPaneClick(hcWhat, hcEnv); return; }
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
      case 'ts-phase': {
        const c = stepCtx(), ph = t.getAttribute('data-ph');
        if (c) selectStep(c.pt.phaseEntryIdx(ph, c.v, c.row, c.marks), '.ts-phase[data-ph="' + ph + '"]');
        return;
      }
      case 'ts-prev': stepBy(-1); return;
      case 'ts-next': openNextAsk(); return;
      case 'go-nav': goNav(t.getAttribute('data-nav')); return;
      case 'doc-edit': onDocEdit(cd, t); return;
      case 'doc-toggle': S.foldOpen[cd] = !S.foldOpen[cd]; S.refocus = '[data-act="doc-toggle"][data-task="' + cd + '"]'; paintCase(); return;
      case 'mark': if (t.getAttribute('aria-disabled') !== 'true') onMark(t.getAttribute('data-col'), t.getAttribute('data-mk')); return;
      case 'to-board-doc': {   // 이 건의 자료가 있으면 그 자료를 바로 열고(board.openMaterial), 없으면 메뉴 첫 화면(목록)
        const mid = t.getAttribute('data-mat');
        S.mat = null;   // 다녀오면 다시 읽는다
        if (mid && root.board && root.board.openMaterial && root.board.openMaterial(Number(mid))) return;
        if (root.app && root.app.openNavItem && root.nav) root.app.openNavItem(root.nav.BOARD_ID);
        return;
      }
      case 'back': if (boardOn()) backToBoard(); return;
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
      case 'prep-start-open': openModal('open', { direct: true }); return;
      case 'assignee-change': {
        const as = ((S.detail && S.detail.view && S.detail.view.assignees) || []).map(function (a) { return str(a && a.emp_no); }).filter(Boolean);
        openModal('open', { change: true, cur: as, sel: as.slice() });
        return;
      }
      case 'board-sched': onBoardResult(true); return;
      case 'board-result': onBoardResult(false); return;
      case 'upload': onUploadPick(t.getAttribute('data-kind')); return;
      case 'download': onDownload(t.getAttribute('data-attach')); return;
      case 'setconfirm': onSetConfirmed(t.getAttribute('data-attach')); return;
      case 'clearconfirm': onClearConfirmed(t.getAttribute('data-attach')); return;
      case 'void-open': openModal('void', { attachId: t.getAttribute('data-attach'), fileName: attachName(t.getAttribute('data-attach')) }); return;
      case 'toggle-void': S.showVoid = !S.showVoid; S.refocus = '[data-act="toggle-void"]'; paintCase(); return;
      case 'to-workflow': if (root.app && root.app.openNavItem) root.app.openNavItem('workflow'); return;
      case 'nobid-notice': onNobidNotice(); return;
      case 'nobid-tidy': onNobidTidy(); return;
      case 'nobid-continue': onNobidContinue(); return;
      default: break;
    }
    switch (t.id) {
      case 'pp-retry-list': S.listState = 'loading'; paintList(); loadList(); break;
      case 'pp-retry-detail': if (S.selected) loadDetail(S.selected, { popup: true }); break;
      case 'pp-nx-ok': closeNextAsk(true); break;
      case 'pp-nx-no': closeNextAsk(false); break;
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
  // 단계 목록 ↑↓·Home·End — 포커스만 옮긴다(고르기는 Enter·Space = 단추의 click).
  function onStepKey(e) {
    const b = e.target && e.target.closest ? e.target.closest('.ts-step') : null;
    if (!b || !root.preptask) return;
    const i = root.preptask.stepKey(Number(b.getAttribute('data-i')), e.key);
    if (i === null || i === undefined) return;
    e.preventDefault();
    const t = el('pp-case').querySelector('.ts-step[data-i="' + i + '"]');
    if (t) t.focus();
  }
  function onModalKey(e) {
    if ((!S.modal && !S.nb && !S.nextAsk) || e.key !== 'Tab') return;      // Esc는 wire()의 document 핸들러가 처리
    const list = Array.prototype.filter.call(el('pp-modal').querySelectorAll('button, input, textarea, a[href]'), function (n) {
      return !n.disabled && n.getClientRects().length > 0;
    });
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    const box = S.nb ? el('pp-nb') : null;
    if (box && document.activeElement === box) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }   // 처음 포커스(상자) → 첫 Tab은 첫 버튼
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function wire() {
    const r = el('pp-root');
    r.addEventListener('click', onClick);
    r.addEventListener('input', onInput);
    r.addEventListener('change', onChange);
    r.addEventListener('keydown', onStepKey);
    // 파일 고르는 숨은 입력 — 보이는 <button>이 .click()한다(display:none 입력을 label로 감싸지 않는다).
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.id = 'pp-file';
    inp.hidden = true;
    inp.accept = '.hwpx,.pdf,.xlsx,.docx';
    inp.setAttribute('aria-hidden', 'true');
    inp.tabIndex = -1;
    r.appendChild(inp);
    // 상세 맨 위 [← 제안 준비 현황으로] — 표(#pp-board)가 있을 때만 보인다(showView). case를 다시 그려도 지워지지 않게 #pp-case 밖에 둔다.
    const pane = el('pp-pane');
    if (pane && !el('pp-back')) {
      const bk = document.createElement('button');
      bk.type = 'button';
      bk.id = 'pp-back';
      bk.className = 'pb-back';
      bk.setAttribute('data-act', 'back');
      bk.textContent = '← 제안 준비 현황으로';
      bk.hidden = true;
      pane.insertBefore(bk, pane.firstChild);
    }
    const md = el('pp-modal');
    md.addEventListener('keydown', onModalKey);
    // 배경(오버레이 자체) 클릭 → requestClose 경로(작성 중이면 '닫을까요?'). 상자에서 눌러 끌다가 배경에서 놓는 경우는 닫지 않는다.
    let downOnBg = false;
    md.addEventListener('mousedown', function (e) { downOnBg = (e.target === md); });
    md.addEventListener('click', function (e) {
      if (e.target === md && downOnBg) {
        if (S.nb) { if (!S.nb.sending) closeNobid(true); } else if (S.nextAsk) closeNextAsk(false); else requestClose();
      }
      downOnBg = false;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (S.nb) { e.preventDefault(); if (!S.nb.sending) closeNobid(true); return; }   // 팝업만 닫고 상세에 머문다(기록 없음)
      if (S.nextAsk) { e.preventDefault(); closeNextAsk(false); return; }
      if (!S.modal) return;
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
    if (who !== S.who) { S = freshState(); S.who = who; clearQueryBox(); if (root.prepboard && root.prepboard.reset) root.prepboard.reset(); }
    if (boardOn()) { if (S.pendingCase) S.pendingCase = false; else toBoardState(); }   // 메뉴로 들어오면 표부터. 지도·현황판이 openCase로 열면 상세
    const md = el('pp-modal'); md.style.display = 'none'; md.innerHTML = ''; S.modal = null; S.nextAsk = false;
    S.nb = null; nbRelease();
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
    if (root.prepboard && root.prepboard.reset) root.prepboard.reset();
    const md = el('pp-modal'); md.style.display = 'none'; md.innerHTML = '';
    nbRelease();
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
    S.nbSeen = '';
    S.flash = flash || '';
    S.focusTitle = true;
    S.tab = 'active';
    S.query = '';
    S.detail = null;
    S.view = 'case';          // 표가 있으면 mount()가 이 값을 한 번 지켜 상세를 연다(pendingCase)
    S.fromBoard = false;
    S.pendingCase = true;
    S.boardName = '';
    resetSteps(null);
    clearQueryBox();
    const ok = !!(root.app && root.app.openNavItem && root.app.openNavItem(root.nav.PREP_ID));
    if (!ok) { S.flash = ''; S.pendingCase = false; S.view = 'board'; }
    return ok;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = prep;
  else root.prep = prep;
})(typeof self !== 'undefined' ? self : this);
