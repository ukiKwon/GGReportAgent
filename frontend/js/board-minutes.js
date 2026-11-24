// 이사회 회의록(047) — 020 상세의 '회의록' 탭. 서버 글은 모두 textContent 로만 넣는다(security R8·S13). HTML 문자열 주입 금지.
// 미리보기 응답과 고른 파일은 컨트롤러 변수에만 두고 브라우저 저장소에는 두지 않는다. stop() 때 비운다.
// 규격: handoff/agents/design-reviewer/2026-11-20_1014_ade114bb.md (6-1~6-8). 서버 계약 정본은 BoardMinutesController·Service·MinutesException.
(function (root) {
  'use strict';
  const mn = {};
  // 서버 허용 목록(MinutesUiIds)과 같은 이름. 화면을 더하면 서버와 같이 고친다.
  mn.UI = { WRITE: 'board_write', REVIEW: 'board_review', UPLOAD: 'board_minutes_upload', LIST: 'board_minutes_list' };
  // 탭 안 읽기·쓰기 화면 id: 담당자는 board_write, 그 밖(영업부장·결재자)은 board_review — board-material.js screenFor 와 같은 식(사용자가 실제로 있는 화면)
  mn.screenFor = function (isAssignee) { return isAssignee === true ? mn.UI.WRITE : mn.UI.REVIEW; };
  mn.BTN = { TAB: 'minutes_tab', OPEN: 'minutes_open', TRANSCRIPT: 'minutes_transcript', PREVIEW: 'minutes_preview',
             UPLOAD: 'minutes_upload', EDIT: 'minutes_edit', META: 'minutes_meta', TODO: 'minutes_todo', HISTORY: 'minutes_history',
             SCOPE_OPEN: 'minutes_scope_open', SCOPE_ADD: 'minutes_scope_add', SCOPE_REMOVE: 'minutes_scope_remove', DELETE: 'minutes_delete', LABEL: 'minutes_label' };
  // 발화자 이름표 저장 헤더도 탭 안 다른 호출과 같은 화면 id(담당자 board_write, 그 밖 board_review)
  mn.labelScreen = function (isAssignee) { return mn.screenFor(isAssignee); };
  mn.MAX_FILE = 2 * 1024 * 1024; mn.TITLE_MAX = 100; mn.TERMS_MAX = 100; mn.SCOPE_MAX = 30; mn.SCOPE_DAYS = 365; mn.SCOPE_DEFAULT_DAYS = 30;
  mn.SLOT = { transcript: '원문', timeline: '시간대별 요약', summary: '맞춤 요약', title: '제목', edit: '고친 글' };
  mn.headers = function (screen, button) { return { 'X-Screen-Id': screen, 'X-Button-Id': button }; };
  function str(v) { return v == null ? '' : String(v); }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function el(tag, cls, text) { const n = root.document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; }
  mn.el = el;
  // [이름]·[가림]·[가림: 개인정보 의심 줄] 을 칩으로 — 문자열 분할 + textContent 뿐
  const MASK_RE = /(\[이름\]|\[가림(?:: 개인정보 의심 줄)?\])/;
  mn.textNodes = function (parent, s) {
    String(s == null ? '' : s).split(MASK_RE).forEach(function (p, i) {
      if (p) parent.appendChild(i % 2 ? el('span', 'mn-mask', p) : root.document.createTextNode(p));
    });
    return parent;
  };
  mn.clock = function (sec) { const s = Math.max(0, sec | 0), h = (s / 3600) | 0, m = ((s / 60) | 0) % 60, x = s % 60, p = function (n) { return (n < 10 ? '0' : '') + n; };
    return h ? h + ':' + p(m) + ':' + p(x) : p((s / 60) | 0) + ':' + p(x); };
  mn.dur = function (sec) { const s = sec | 0; if (s < 60) return '1분 미만'; const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0; return h ? h + '시간' + (m ? ' ' + m + '분' : '') : m + '분'; };
  mn.uttId = function (seq) { return /^\d{1,6}$/.test(String(seq)) ? 'mn-u-' + seq : ''; };   // 앵커 id 는 숫자만(R8)
  mn.tabShown = function (status, body) { return status === 200 && !!body && ((Array.isArray(body.items) && body.items.length > 0) || body.can_upload === true); };

  // ── 날짜·시각 ──
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  mn.today = function (d) { d = d || new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  mn.addDays = function (ymd, n) { const a = str(ymd).split('-'); return mn.today(new Date(+a[0], +a[1] - 1, +a[2] + n)); };
  mn.validDate = function (s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(s));
    if (!m) return false;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
  };
  // 서버 시각(UTC ISO) → 한국 시각 "MM-DD HH:mm". 읽을 수 없으면 ''.
  mn.kst = function (iso) {
    const t = Date.parse(str(iso).replace(/(\.\d{3})\d+/, '$1'));
    if (!isFinite(t)) return '';
    const d = new Date(t + 9 * 3600000);
    return p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
  };
  mn.kstDate = function (iso) { return mn.kst(iso).slice(0, 5); };
  // 서버 시각(UTC ISO) → 한국 시각 "yyyy-MM-dd HH:mm". 읽을 수 없으면 ''.
  mn.kstFull = function (iso) {
    const t = Date.parse(str(iso).replace(/(\.\d{3})\d+/, '$1'));
    if (!isFinite(t)) return '';
    const d = new Date(t + 9 * 3600000);
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
  };
  mn.range = function (s) { return mn.clock(s.start_sec) + '–' + mn.clock(s.end_sec); };   // en dash
  function sizeText(b) { return Math.max(1, Math.round((b || 0) / 1024)) + 'KB'; }

  // ── 문구(6-5) ──
  const T = {
    NET: '서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
    GONE: '이 회의록을 볼 수 없습니다. 삭제됐거나 볼 수 있는 기간이 끝났습니다.',
    LIST_FAIL: '회의록 목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
    DETAIL_FAIL: '회의록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
    SESSION: '로그인이 끝났습니다. 다시 로그인한 뒤 시도해 주세요.',
    BAD: '보낸 내용을 서버가 읽지 못했습니다. 화면을 새로 고친 뒤 미리보기부터 다시 하세요.',
    MARK_B: '대외비·참고용',
    MARK: ' 음성을 자동으로 글로 바꾼 기록이라 잘못 알아들은 말이 있을 수 있습니다. 이름과 개인정보는 [이름]·[가림]으로 가렸습니다.',
    EMPTY_LIST: '아직 올린 회의록이 없습니다. 이사회가 끝난 뒤 받은 회의 정리본(클로바 노트에서 내보낸 텍스트)을 올리면 시간대별 발언으로 나눠 보여 주고, 발화자와 발언을 고쳐 남길 수 있습니다.',
    INTRO: '이사회가 끝난 뒤 받은 회의 정리본으로 남기는 기록입니다. 이사회 자료 확정과 상관없이 언제든 올릴 수 있습니다.',
    UP_INTRO: '이사회가 끝난 뒤 받은 회의 정리본을 올립니다. 미리보기에서 발화자 이름표와 발언을 고친 뒤 저장하세요.',
    FIX_NONE: '발화자 이름표와 발언은 여기서 고칠 수 있습니다. 고친 내용은 저장할 때 함께 저장됩니다.',
    LBL_LEGEND: '발화자 이름표',
    LBL_HINT: '같은 번호의 발언이 한 번에 바뀝니다. 소속·역할·번호를 목록에서 고르세요. 고르지 않으면 \'참석자 번호\' 그대로입니다. \'측\'은 소속을 먼저 고른 뒤에만 고를 수 있습니다.',
    LBL_NEED_ROLE: '역할을 고르세요',
    LBL_NONE: '이름표 없음',
    LBL_FORM: '이름표는 소속·역할·번호를 목록에서 골라 만드세요. 목록에 없는 조합은 쓸 수 없습니다.',
    LBL_NAME: '이름표에는 직책이나 역할만 쓸 수 있습니다. 사람 이름이나 성이 붙은 호칭, 개인정보로 읽히는 말은 쓸 수 없습니다.',
    LBL_UNKNOWN: '원문에 없는 참석자 번호입니다. 미리보기부터 다시 하세요.',
    ED_HINT: '[이름]·[가림] 자리는 지우지 마세요. 사람 이름은 적지 말고 [이름]으로 적으세요.',
    EDIT_SEQ: '고친 발언 중 원문에 없는 줄이 있습니다. 다시 미리보기 하세요.',
    EDITS_BAD: '고친 내용을 읽지 못했습니다. 화면을 새로 고친 뒤 미리보기부터 다시 하세요.',
    EDIT_LINE: '고친 발언의 한 줄이 너무 깁니다. 줄을 나눠 적으세요.',
    FIX_ROW_FAIL: '고친 내용 중 서버가 받지 못한 곳이 있습니다. 표시된 곳을 고친 뒤 다시 미리보기 하세요.',
    FIX_REVERTED: '고친 내용을 모두 되돌렸습니다. [다시 미리보기]를 눌러 확인하세요.',
    FIX_REVERTED_SAME: '고친 내용을 모두 되돌렸습니다.',
    LBL_PENDING: '역할을 고르면 이름표가 바뀝니다. 그 전까지는 ',
    NO_SUMMARY: '맞춤 요약 파일을 함께 올리지 않았습니다.',
    NO_SEG: '시간대별 요약 파일을 함께 올리지 않아 구간이 없습니다. 원문은 아래에서 볼 수 있습니다.',
    NO_TODO: '다음 할 일 항목이 없습니다.',
    NO_TOPIC: '주요 주제 항목이 없습니다.',
    TODO_LOCK: '(영업팀장 이상만 체크)',
    UPLOADER: '올린 사람이라 올린 뒤 정해진 기간 동안 볼 수 있습니다. 그 뒤에는 영업팀장·영업부장에게 공개를 요청하세요.',   // 끝 시각을 모를 때(서버 값 없음) — 근거 없는 숫자를 내지 않는다
    UP_ASK: '그 뒤에는 영업팀장·영업부장에게 공개를 요청하세요.',
    GRANTEE: '공개범위에 추가되어 볼 수 있습니다. 기한이 지나면 볼 수 없습니다.',   // 기한을 모를 때
    RULES: ['① 클로바 노트는 지정 계정으로만 쓰고 공유 링크를 만들지 않습니다.', '② 내보낸 텍스트는 사내 메일로만 보내고 은행 직원만 다룹니다.',
            '③ 올린 뒤에는 클로바 노트 기록·메일·PC에 남은 파일을 지웁니다.', '④ 직원 명단에 없는 사람(기관·다른 은행)의 이름은 \'추가로 가릴 단어\'에 적어야 가려집니다.'],
    ACK: '위 수칙을 확인했습니다',
    SAVE_WHY: '미리보기를 확인하고 수칙에 체크하면 저장할 수 있습니다.',
    SAVED: '회의록을 저장했습니다. 클로바 노트 기록과 메일, PC에 남은 원본 파일을 지워 주세요.',
    DEL_CONFIRM: '이 회의록의 원문·요약·공개범위를 지웁니다. 되돌릴 수 없습니다. 누가 언제 지웠는지는 남습니다.',
    SCOPE_HEAD: '공개범위 — 기본으로 볼 수 있는 사람: 영업팀장·영업부장',
    SCOPE_EMPTY: '추가로 공개한 사람이 없습니다.',
    SCOPE_RO: '공개범위는 영업부장만 바꿀 수 있습니다.',
    SCOPE_FULL: '공개한 사람이 30명입니다. 새 사람은 추가되지 않고, 이미 있는 사람의 기한만 바꿀 수 있습니다.',
    HIDDEN: '회의록 기능을 쓸 수 없습니다.',
    SCOPE_PICK: '공개할 사람을 고르거나 사번을 입력하세요.',
    SCOPE_CANDS_FAIL: '사람 목록을 불러오지 못했습니다. 사번을 직접 입력하세요.',
    SCOPE_CANDS_MORE: '목록에 다 담지 못했습니다. 없는 사람은 사번을 직접 입력하세요.',
    NOCHANGE: '바뀐 내용이 없습니다.',
    TERMS_HINT: '직원 명단에 없는 사람(기관·다른 은행)의 이름은 여기에 적어야 가려집니다. 한 줄에 하나, 2~30자, 100개까지.',
    NO_MASK: '가린 곳이 없습니다. 외부 참석자 이름이 없는지 미리보기를 한 번 훑어보세요.'
  };
  mn.TEXT = T;
  // 상세 머리의 '볼 수 있는 기한' 줄 → {before, date, after}(날짜 부분만 span.mono) 또는 null(줄 없음). 한국 시각 기준 '오늘'. now 는 시험용.
  mn.viewNote = function (v, now) {
    v = isObj(v) ? v : {};
    const today = mn.kstFull((now || new Date()).toISOString()).slice(0, 10);
    if (v.via === 'UPLOADER') {
      const at = mn.kstFull(v.view_until_at);
      if (!at) return { before: T.UPLOADER, date: '', after: '' };
      const same = at.slice(0, 10) === today;
      return { before: '올린 사람이라 ' + (same ? '오늘 ' : ''), date: same ? at.slice(11) : at, after: '까지 볼 수 있습니다. ' + T.UP_ASK };
    }
    if (v.via === 'GRANTEE') {
      const u = str(v.view_until);
      if (!mn.validDate(u)) return { before: T.GRANTEE, date: '', after: '' };
      if (u === today) return { before: '공개범위에 추가되어 오늘까지 볼 수 있습니다.', date: '', after: '' };
      return { before: '공개범위에 추가되어 ', date: u, after: '까지 볼 수 있습니다(그날 포함).' };
    }
    return null;
  };
  const EVENT = { UPLOAD: '올림', EDIT: '고침', TODO_DONE: '할 일 완료', TODO_UNDONE: '완료 취소', SCOPE_ADD: '공개 추가', SCOPE_EXTEND: '공개 기한 변경',
                  SCOPE_REMOVE: '공개 거둠', DELETE: '삭제', SPEAKER_LABEL: '발화자 이름표 바꿈', RULES_ACK: '운용 수칙 확인', SCOPE_CANDIDATES: '공개 후보 목록 열람' };
  mn.EVENT = EVENT;
  // 이력 사건 코드 → 문구. 모르는 코드는 코드명을 그대로 내지 않고 '기타 기록'.
  mn.eventText = function (code) { return Object.prototype.hasOwnProperty.call(EVENT, code) ? EVENT[code] : '기타 기록'; };
  // 공개 후보 한 줄 글자: '이름 직책 (사번)' + 이미 공개 중이면 ' — 공개 중, yyyy-MM-dd까지', 기한이 지났으면 ' — 기한 지남, yyyy-MM-dd'. 물결표는 낭독기가 '물결'로 읽어 '까지'로 쓴다.
  mn.candLabel = function (p) {
    p = isObj(p) ? p : {};
    let t = (str(p.name) + ' ' + str(p.position_title)).trim();
    const e = str(p.emp_no);
    if (e) t = (t ? t + ' ' : '') + '(' + e + ')';
    if (p.granted === true) {
      const u = p.grant_until ? str(p.grant_until) : '';
      t += p.expired === true ? ' — 기한 지남' + (u ? ', ' + u : '') : ' — 공개 중' + (u ? ', ' + u + '까지' : '');
    }
    return t;
  };
  // 공개 후보 응답 → {items, truncated, max}. items 가 배열이 아니면 null. max 는 서버 scope_max, 없으면 상수.
  mn.scopeCands = function (body) {
    if (!isObj(body) || !Array.isArray(body.items)) return null;
    return { items: body.items.filter(isObj), truncated: body.truncated === true, max: (body.scope_max | 0) > 0 ? body.scope_max | 0 : mn.SCOPE_MAX };
  };
  // 이력 사건: 발화자 이름표(SPEAKER/LABEL)는 '발화자 이름표 바꿈 (참석자 N)'. 그 밖은 null.
  mn.histTitle = function (kind, no, event) {
    if (kind !== 'SPEAKER' && event !== 'SPEAKER_LABEL') return null;
    return EVENT.SPEAKER_LABEL + (Number(no) > 0 ? ' (참석자 ' + Number(no) + ')' : '');
  };
  const TARGET = { UTTER: '발언', ITEM: '항목', META: '제목·회의일', RULES: '수칙' };
  // 이력의 대상 글자. RULES 는 '수칙 n판'(수칙 문구가 바뀌면 누가 어느 판을 확인했는지 구별). 판 번호를 모르면 비운다.
  mn.targetText = function (kind, no) {
    const k = Object.prototype.hasOwnProperty.call(TARGET, kind) ? TARGET[kind] : '';
    if (!k) return '';
    if (kind === 'RULES') return Number(no) > 0 ? k + ' ' + Number(no) + '판' : '';
    return k + (no != null && kind !== 'META' ? ' ' + no : '');
  };
  // 이력 한 줄의 사건 글자: '운용 수칙 확인 (수칙 1판)' 꼴
  mn.histText = function (l) {
    l = isObj(l) ? l : {};
    const ht = mn.histTitle(l.target_kind, l.target_no, l.event), tg = mn.targetText(l.target_kind, l.target_no);
    return ht || mn.eventText(l.event) + (tg ? ' (' + tg + ')' : '');
  };
  const LIMIT_CODES = { LIMIT_LINES: 1, LIMIT_LINE: 1, LIMIT_UTTERANCES: 1, LIMIT_SEGMENTS: 1, LIMIT_ITEMS: 1, LIMIT_ITEM_LEN: 1, LIMIT_SPEAKER: 1 };

  // mn.errorText(status, detail, ctx) → {text, field} : 6-5 표 그대로. UI_ID_REQUIRED 는 서버 message 를 쓰지 않는다.
  // detail = 응답 {detail: …} 의 값(객체 {code,message,slot,line,kinds} 또는 문자열). ctx = {action:'upload'|'edit'|'list'|…, kind:'utter'|'item'}.
  // field = 오류를 놓을 곳: transcript·timeline·summary·title·meeting_date·terms·preview·save·edit·scope·until·box.
  mn.errorText = function (status, detail, ctx) {
    ctx = ctx || {};
    const d = isObj(detail) ? detail : {};
    const code = str(d.code);
    const slot = d.slot === 'transcript' || d.slot === 'timeline' || d.slot === 'summary' ? d.slot : '';
    const name = slot ? mn.SLOT[slot] : '';
    const ln = Number(d.line) > 0 ? Number(d.line) + '번째 줄' : '';
    const up = ctx.action === 'upload';
    function R(text, field) { return { text: text, field: field || 'box' }; }
    function S(text) { return R(text, slot || 'box'); }
    if (!status || status >= 500) return R(T.NET);
    if (status === 401) return R(T.SESSION);
    if (status === 404) return R(up ? '이 이사회 자료를 찾을 수 없거나 회의록 기능이 꺼져 있습니다. 화면을 새로 고친 뒤 다시 시도하세요.' : T.GONE);
    if (status === 403) {
      if (code === 'VERIFIED_REQUIRED') return R('사내 인증을 거친 접속에서만 쓸 수 있습니다. 사내 로그인으로 다시 접속하세요.');
      return R(up ? '이 이사회 자료의 회의록은 지금 담당자만 올릴 수 있습니다. 담당에서 빠졌는지 확인하세요.' : '이 회의록에서 할 수 없는 일입니다.');
    }
    if (status === 411) return R('보내지 못했습니다. 다시 시도하세요.');
    if (code === 'CONTROL_CHAR' && d.slot === 'edit') {   // 고친 발언의 보이지 않는 문자: 파일 문구가 아니라 그 발언 줄 문구
      return R('고친 발언' + (Number(d.target_no) > 0 ? ' ' + Number(d.target_no) : '') + '에 쓸 수 없는 보이지 않는 문자가 있습니다. 그 글자를 지우고 다시 반영하세요.', 'edit');
    }
    if (code === 'LIMIT_LINE' && d.slot === 'edit') return R(T.EDIT_LINE, 'edit');
    if (LIMIT_CODES[code] === 1) return S((name || '파일') + '이 한 번에 올릴 수 있는 양을 넘습니다' + (ln ? '(' + ln + ' 부근)' : '') + '. 회의를 나눠 올리세요.');
    switch (code) {
      case 'UI_ID_REQUIRED': case 'TOO_MANY_PARTS': case 'OPTIONS_INVALID': case 'BAD_REQUEST': return R(T.BAD);
      case 'FILE_TOO_LARGE': return S(str(d.message) || '파일이 너무 큽니다. 파일 하나당 2MB 이하만 올릴 수 있습니다.');
      case 'BODY_TOO_LARGE': return R('고친 글이 너무 깁니다. 줄여서 다시 저장하세요.', ctx.action === 'edit' ? 'edit' : 'box');
      case 'TRANSCRIPT_REQUIRED': return R('원문 파일을 고르거나 붙여넣으세요.', 'transcript');
      case 'MEETING_DATE_INVALID': return R('회의일은 2000-01-01부터 오늘까지로 고르세요.', 'meeting_date');
      case 'TITLE_REQUIRED': return R('제목을 1~100자로 적으세요.', 'title');
      case 'EMPTY_FILE': return S((name || '파일') + ' 파일이 비어 있습니다.');
      case 'NOT_TXT': return S((name || '파일') + ': 텍스트(.txt) 파일만 올릴 수 있습니다. 클로바 노트에서 텍스트로 내보낸 파일을 고르세요.');
      case 'BINARY_SIGNATURE': case 'NUL_BYTE': return S((name || '파일') + ': 텍스트 파일이 아닙니다. 워드·PDF 파일은 올릴 수 없습니다.');
      case 'ENCODING_UTF16': case 'ENCODING_UNKNOWN': return S((name || '파일') + ': 글자 인코딩을 읽지 못했습니다. UTF-8 또는 한글(CP949) 텍스트로 내보낸 파일을 올리세요.');
      case 'CONTROL_CHAR': return S((name || '파일') + (ln ? ' ' + ln + '에' : '에') + ' 쓸 수 없는 보이지 않는 문자가 있습니다. 메모장에서 그 줄을 지우고 다시 저장해 올리세요.');
      case 'PARSE_TIMEOUT': return R('처리 시간이 너무 오래 걸려 멈췄습니다. 잠시 뒤 다시 시도하고, 계속되면 파일을 나눠 올리세요.');
      case 'TRANSCRIPT_NO_UTTERANCE': return R('원문에서 발언을 찾지 못했습니다. \'참석자 1 00:00\' 줄이 있는 클로바 노트 원문을 원문 칸에 올렸는지 확인하세요.', 'transcript');
      case 'TIMELINE_FORMAT': return R('시간대별 요약' + (ln ? ' ' + ln + '을' : '을') + ' 읽지 못했습니다. \'00:00~03:20\' 시간 줄로 시작하는지 확인하세요.', 'timeline');
      case 'TIMELINE_RANGE': return R('시간대별 요약' + (ln ? ' ' + ln : '') + ': 구간의 시작이 끝보다 늦습니다.', 'timeline');
      case 'TIMELINE_LOOKS_TRANSCRIPT': return R(str(d.message) || '시간대별 요약 칸에 원문을 올린 것 같습니다. 파일 칸을 확인하세요.', 'timeline');
      case 'SUMMARY_LOOKS_TIMELINE': return R(str(d.message) || '맞춤 요약 칸에 시간대별 요약을 올린 것 같습니다. 파일 칸을 확인하세요.', 'summary');
      case 'SUMMARY_NO_ITEMS': return R('맞춤 요약에 \'- \'로 시작하는 항목이 없습니다. 클로바 노트에서 항목형으로 다시 내보내세요.', 'summary');
      case 'TERMS_INVALID': return R('가릴 단어는 한 줄에 하나, 2~30자, 100개까지입니다.', 'terms');
      case 'RELEASE_INVALID': return R('가리지 않기로 고른 말을 풀었습니다. 다시 미리보기 하세요.', 'preview');
      case 'PREVIEW_CHANGED': return R('미리보기 뒤에 내용이 바뀌었습니다. [다시 미리보기]를 누르세요.', 'save');
      case 'ALREADY_UPLOADED': return R('같은 회의록이 이미 올라와 있습니다.');
      case 'MINUTES_CAP': return R('이 이사회 자료에는 회의록을 10건까지 올릴 수 있습니다. 필요 없는 회의록은 영업부장에게 삭제를 요청하세요.');
      case 'REV_CHANGED': return R(ctx.action === 'edit' || ctx.action === 'label' ? '다른 사람이 먼저 고쳤습니다. [새로 불러오기] 뒤 다시 고치세요.'
        : '다른 사람이 먼저 고쳤습니다. 회의록을 다시 열어 확인한 뒤 시도하세요.', ctx.action === 'edit' ? 'edit' : 'box');
      // 발화자 이름표·고친 발언(저장 전). kinds.form = 고르는 형식 밖, name·title·pii = 직원 이름·개인정보로 걸림. 받은 값은 문구에 싣지 않는다.
      case 'LABEL_INVALID': {
        const k = isObj(d.kinds) ? d.kinds : {};
        return R(k.form > 0 && !(k.name > 0 || k.title > 0 || k.pii > 0) ? T.LBL_FORM : T.LBL_NAME, 'label');
      }
      case 'LABEL_SPEAKER_UNKNOWN': return R(T.LBL_UNKNOWN, 'label');
      case 'EDIT_SEQ_UNKNOWN': return R(T.EDIT_SEQ, 'edit');
      case 'EDITS_INVALID': return R(T.EDITS_BAD, 'edit');
      case 'EDIT_MASK_REMOVED': {
        if (d.slot === 'title') return R('제목의 가린 자리를 지울 수 없습니다. [이름] 자리는 그대로 두고 고치세요.', 'title');   // 저장 뒤 제목 수정(PUT meta)
        const k = isObj(d.kinds) ? d.kinds : {};
        return R(mn.maskLostText(Object.keys(k).reduce(function (n, x) { return n + (Number(k[x]) > 0 ? Number(k[x]) : 0); }, 0)), 'edit');
      }
      case 'MASK_REQUIRED': {
        const k = isObj(d.kinds) ? d.kinds : {}, parts = [];
        if (k.name > 0) parts.push('이름 ' + k.name + '곳');
        if (k.title > 0) parts.push('성+직함 ' + k.title + '곳');
        if (k.pii > 0) parts.push('개인정보 ' + k.pii + '곳');
        return R((parts.length ? parts.join('·') : '이름·개인정보') + '이 들어 있어 저장하지 않았습니다. 그 부분을 지우거나 [이름]으로 바꿔 다시 저장하세요.', 'edit');
      }
      case 'LIMIT_EDIT_LEN': return R(((ctx.kind || (d.slot === 'edit' ? 'utter' : '')) === 'item' ? '1~1,000자(항목)' : (ctx.kind || (d.slot === 'edit' ? 'utter' : '')) === 'utter' ? '1~20,000자(발언)' : ctx.kind === 'title' ? '1~100자(제목)'
        : '1~20,000자(발언) / 1~1,000자(항목)') + '로 적으세요.', 'edit');
      case 'NOT_TODO': return R('다음 할 일 항목이 아닙니다. 새로 불러오세요.');
      case 'SCOPE_TARGET_INVALID': return R('공개할 사람을 찾을 수 없습니다. 사번을 확인하세요(퇴사·정지된 사람은 추가할 수 없습니다).', 'scope');
      case 'SCOPE_TARGET_NOT_ELIGIBLE': return R('이 사람에게는 회의록을 공개할 수 없습니다. 영업부서와 임원급에게만 공개할 수 있습니다.', 'scope');
      case 'GRANT_UNTIL_INVALID': return R('공개 기한은 오늘부터 365일 안으로 고르세요.', 'until');
      case 'SCOPE_CAP': return R('공개할 수 있는 사람은 30명까지입니다. 필요 없는 사람을 먼저 빼세요.', 'scope');
      default: return R('요청을 처리할 수 없습니다. 화면을 새로 고친 뒤 다시 시도하세요.');
    }
  };
  // 미리보기 경고 코드 → 문구. 모르는 코드는 null(화면에 내지 않는다).
  mn.warningText = function (code, count) {
    const n = Number(count) || 0;
    switch (code) {
      case 'PREAMBLE_SKIPPED': return '파일 앞부분 ' + n + '줄은 발언 형식이 아니어서 건너뛰었습니다.';
      case 'TIME_NOT_SORTED': return '시각이 앞으로 되돌아간 곳이 ' + n + '군데 있습니다. 원문 순서 그대로 둡니다.';
      case 'SEG_OVERLAP': return '시간대별 요약에 서로 겹치는 구간이 ' + n + '개 있습니다.';
      case 'SEG_BEYOND_END': return '녹음 길이를 넘는 구간이 ' + n + '개 있습니다. 다른 회의의 요약이 아닌지 확인하세요.';
      case 'LABEL_RENAMED': return '이름으로 적힌 발언자 ' + n + '곳을 \'참석자 번호\'로 바꿨습니다.';
      default: return null;
    }
  };
  // 가린 곳 문장 — 0이 아닌 것만 잇는다.
  mn.maskedText = function (m) {
    m = isObj(m) ? m : {};
    const defs = [['name', '이름', '곳'], ['title', '성+직함', '곳'], ['pii', '개인정보', '곳'], ['term', '지정한 단어', '곳'], ['line', '개인정보 의심', '줄'], ['released', '가리지 않기로 한 말', '곳']];
    const parts = [];
    defs.forEach(function (x) { const n = Number(m[x[0]]) || 0; if (n > 0) parts.push(x[1] + ' ' + n + x[2]); });
    return parts.length ? '가린 곳: ' + parts.join(' · ') : T.NO_MASK;
  };

  // ── 순수 보조(시험용으로 뽑음) ──
  // 가리지 않기 선택 중 지금 후보(cands)에 있는 말만 남긴다. 서버 MinutesMasker 는 이번 적중에 없는 해제어를 거부한다.
  mn.pruneRelease = function (release, cands) {
    const out = {};
    Object.keys(release || {}).forEach(function (t) { if (release[t] && cands && Object.prototype.hasOwnProperty.call(cands, t)) out[t] = true; });
    return out;
  };
  // 올리기 실패 응답이 상태에 미치는 영향: RELEASE_INVALID 면 고른 가리지 않기를 풀고 미리보기를 다시 하게 한다.
  mn.failEffects = function (detail) {
    const code = isObj(detail) ? str(detail.code) : '';
    return { clearRelease: code === 'RELEASE_INVALID', resetSig: code === 'PREVIEW_CHANGED' || code === 'RELEASE_INVALID' };
  };
  // 공개범위가 가득 찼을 때의 안내(막지 않는다 — 기한 변경은 허용, 새 사람은 서버 SCOPE_CAP 이 거절).
  mn.scopeNote = function (count, max) {
    const m = (max | 0) > 0 ? max | 0 : mn.SCOPE_MAX;   // 서버가 준 상한이 있으면 그 값
    return (count | 0) >= m ? T.SCOPE_FULL.replace('30명', m + '명') : '';
  };
  // 비동기 응답을 그려도 되는 때: 패널이 있고, 이미 그린 적이 있다면 그 뿌리가 아직 이 패널 안에 있을 때
  mn.canDraw = function (panel, rootNode) { return !!panel && (!rootNode || rootNode.parentNode === panel); };

  // ── 발화자 이름표·고친 발언(저장 전 고치기) ──
  // 이름표 판정 — 서버 SpeakerLabels.normalize 와 같은 규칙: [소속] 역할 [번호 1~9], '측'은 소속이 있어야 한다.
  // rules = 서버 응답의 speaker_label_rules {affiliations, roles, side_role, max_ordinal, max_chars}. 빈칸은 이름표 없음(ok, value '').
  // → {ok:true, value} | {ok:false, code:'FORM'}
  mn.labelCheck = function (s, rules) {
    const r = isObj(rules) ? rules : {};
    let t = str(s);
    try { t = t.normalize('NFKC'); } catch (e) { /* 오래된 브라우저: 그대로 */ }
    t = t.replace(/\s+/g, ' ').trim();
    if (!t) return { ok: true, value: '' };
    const bad = { ok: false, code: 'FORM' };
    const aff = Array.isArray(r.affiliations) ? r.affiliations : [], roles = Array.isArray(r.roles) ? r.roles : [];
    const side = str(r.side_role), maxOrd = (r.max_ordinal | 0) > 0 ? r.max_ordinal | 0 : 9, maxChars = (r.max_chars | 0) > 0 ? r.max_chars | 0 : 20;
    if (t.length > maxChars) return bad;
    const p = t.split(' ');
    let i = 0, hasAff = false;
    if (p.length > 1 && aff.indexOf(p[0]) >= 0) { hasAff = true; i = 1; }
    if (i >= p.length || roles.indexOf(p[i]) < 0 || (side && p[i] === side && !hasAff)) return bad;
    i++;
    if (i < p.length && /^[1-9]$/.test(p[i]) && Number(p[i]) <= maxOrd) i++;
    if (i !== p.length) return bad;
    return { ok: true, value: t };
  };
  // 고른 세 칸 → 이름표 글자. 역할이 없으면 ''(소속·번호만으로는 이름표가 되지 않는다).
  mn.labelCompose = function (aff, role, ord) {
    if (!role) return '';
    return [aff, role, ord].filter(function (x) { return !!x; }).join(' ');
  };
  // 이름표 글자 → 세 칸 {aff, role, ord}. 규칙에 맞지 않으면 모두 ''.
  mn.labelParse = function (label, rules) {
    const c = mn.labelCheck(label, rules), out = { aff: '', role: '', ord: '' };
    if (!c.ok || !c.value) return out;
    const p = c.value.split(' ');
    let i = 0;
    if (p.length > 1 && (rules.affiliations || []).indexOf(p[0]) >= 0) { out.aff = p[0]; i = 1; }
    out.role = p[i]; i++;
    if (i < p.length) out.ord = p[i];
    return out;
  };
  // 같은 이름표를 쓴 번호 묶음 → [{label, nos:[…]}] (둘 이상일 때만)
  mn.dupLabels = function (labels) {
    const by = {}, order = [];
    Object.keys(labels || {}).forEach(function (no) {
      const l = str(labels[no]);
      if (!l) return;
      if (!by[l]) { by[l] = []; order.push(l); }
      by[l].push(Number(no));
    });
    return order.filter(function (l) { return by[l].length > 1; }).map(function (l) { return { label: l, nos: by[l].sort(function (a, b) { return a - b; }) }; });
  };
  mn.dupText = function (d) { return d.nos.map(function (n) { return '참석자 ' + n; }).join('·') + '가 같은 이름표(' + d.label + ')입니다. 한 사람이 둘로 나뉜 경우라면 그대로 두세요.'; };
  // 발언의 화자 번호: 서버 speaker_no(정수), 없으면 '참석자 N' 글자에서. 모르면 0.
  mn.spkNo = function (it) {
    if (it && Number(it.speaker_no) > 0) return Number(it.speaker_no);
    const m = /^참석자 (\d{1,3})$/.exec(str(it && it.speaker));
    return m ? Number(m[1]) : 0;
  };
  // 화자 칸 표시: 이름표(굵게) + 아래 작은 '참석자 N'. 이름표가 없으면 '참석자 N'만.
  mn.spkView = function (no, label, fallback) {
    const base = no > 0 ? '참석자 ' + no : str(fallback) || '참석자';
    return label ? { main: label, sub: base } : { main: base, sub: '' };
  };
  // 그 번호의 첫 발언 {seq, time} — 잡음이 아닌 것을 먼저, 없으면 잡음 포함 첫 발언
  mn.firstOf = function (items, no) {
    const list = (items || []).filter(function (it) { return mn.spkNo(it) === no; });
    const it = list.filter(function (x) { return !x.noise; })[0] || list[0];
    return it ? { seq: it.seq_no, time: str(it.time) } : null;
  };
  // 이름표 표 '첫 발언' 칸: 원문을 받았으면 firstOf, 아직이면 서버 speakers[].first_seq(시각 없음). 둘 다 없으면 null.
  // (서버 first_seq 도 잡음이 아닌 첫 발언(모두 잡음이면 첫 발언) — firstOf 와 같은 기준)
  mn.firstFor = function (items, ready, speakers, no) {
    if (ready) return mn.firstOf(items, no);
    const sp = (speakers || []).filter(function (s) { return s && s.speaker_no === no; })[0];
    return sp && sp.first_seq != null && mn.uttId(sp.first_seq) ? { seq: sp.first_seq, time: '' } : null;
  };
  mn.firstMsg = function (no, time) { return '참석자 ' + no + '의 첫 발언' + (time ? '(' + time + ')' : '') + '으로 옮겼습니다.'; };
  // 가림 토큰 보존(P1-1): 원래 글의 [이름]·[가림]·[가림: 개인정보 의심 줄]이 고친 글에서 줄었는지. 서버 EDIT_MASK_REMOVED 와 같은 종류별 판정.
  const MASK_G = /\[이름\]|\[가림: 개인정보 의심 줄\]|\[가림\]/g;
  mn.maskCount = function (s) { const c = {}; (str(s).match(MASK_G) || []).forEach(function (k) { c[k] = (c[k] || 0) + 1; }); return c; };
  mn.lostMasks = function (orig, next) {
    const a = mn.maskCount(orig), b = mn.maskCount(next);
    return Object.keys(a).reduce(function (n, k) { return n + Math.max(0, a[k] - (b[k] || 0)); }, 0);
  };
  mn.maskLostText = function (n) { return '가린 자리' + (n > 0 ? ' ' + n + '곳이' : '가') + ' 빠졌습니다. 그 자리는 그대로 두고 나머지만 고치세요.'; };
  // 저장 전 고친 내용 fix = {labels:{번호:라벨}, utt:{seq:{orig, text, shown}}}. orig = 원래(가린) 글, text = 보낼 글(저장 확인값 대상), shown = 화면에 보이는 글.
  // 서버에 보낼 edits 파트 {speaker_labels, utter_edits}. 고친 것이 없으면 null(파트를 넣지 않는다).
  // 고친 발언인가: 서버처럼 앞뒤 공백을 뗀 뒤 원래 글과 비교한다(공백만 다른 수정은 고친 것이 아니다).
  mn.fixed = function (e) { return !!e && str(e.text).trim() !== str(e.orig).trim(); };
  // 편집기 가림 검사 기준(P2-A). base = 가장 최근 미리보기 응답의 가린 글, 없으면 orig. orig 는 고친 줄 판정·되돌리기 기준이라 덮지 않는다.
  mn.editBase = function (fe, itText) { return !fe ? str(itText) : fe.base != null ? str(fe.base) : str(fe.orig); };
  // 미리보기·저장 요청이 나가 있는 동안은 이름표·발언을 고치지 못한다(응답 뒤 다시 그리면 열어 둔 편집기·고르던 값이 사라진다 — P3-B)
  mn.fixLocked = function (u) { return !!(u && u.busy); };
  mn.editsPayload = function (fix) {
    if (!isObj(fix)) return null;
    const labels = {}, utters = [];
    Object.keys(fix.labels || {}).forEach(function (no) { if (fix.labels[no]) labels[no] = fix.labels[no]; });
    Object.keys(fix.utt || {}).map(Number).sort(function (a, b) { return a - b; }).forEach(function (seq) {
      const e = fix.utt[seq];
      if (mn.fixed(e)) utters.push({ seq_no: seq, text: e.text });
    });
    if (!Object.keys(labels).length && !utters.length) return null;
    return { speaker_labels: labels, utter_edits: utters };
  };
  mn.fixCount = function (fix) {
    const p = mn.editsPayload(fix);
    return { spk: p ? Object.keys(p.speaker_labels).length : 0, utt: p ? p.utter_edits.length : 0 };
  };
  mn.fixSummary = function (c) {
    const parts = [];
    if (c.spk > 0) parts.push('발화자 ' + c.spk + '명');
    if (c.utt > 0) parts.push('발언 ' + c.utt + '건');
    return parts.length ? '고친 내용: ' + parts.join(' · ') : '';
  };
  // 다시 미리보기 응답 pv 를 받은 뒤 고친 내용 정리. 이름표는 새 응답에 그 번호가 있으면 유지, 발언은 원문에 그 줄이 있으면 유지하고
  // 화면 글(shown)을 응답 글(서버가 가린 결과)로 바꾼다. 원래와 같아진 발언은 비운다. → {fix, droppedUtt, droppedSpk}
  // 성공한 줄은 base(편집기 가림 검사 기준)도 응답 글로 갱신한다(P2-A). o.sent = 요청에 실은 고친 발언 {seq: 글}. 있으면 요청 뒤에 바꾼 줄(보낸 글과 다른 줄)은 화면 글을 덮지 않고 그대로 둔다(P2-2).
  mn.mergeFix = function (fix, pv, o) {
    const sent = o && isObj(o.sent) ? o.sent : null;
    const out = { labels: {}, utt: {} };
    let dSpk = 0, dUtt = 0;
    const items = {}, nos = {};
    ((pv && pv.transcript) || []).forEach(function (it) { items[it.seq_no] = it; });
    ((pv && pv.speakers) || []).forEach(function (s) { nos[s.speaker_no] = true; });
    Object.keys((fix && fix.labels) || {}).forEach(function (no) {
      if (!fix.labels[no]) return;
      if (nos[no]) out.labels[no] = fix.labels[no]; else dSpk++;
    });
    Object.keys((fix && fix.utt) || {}).forEach(function (seq) {
      const e = fix.utt[seq], it = items[seq];
      if (!mn.fixed(e)) return;
      if (!it) { dUtt++; return; }
      if (sent && sent[seq] !== e.text) { const kp = { orig: e.orig, text: e.text, shown: e.shown != null ? e.shown : e.text }; if (e.base != null) kp.base = e.base; out.utt[seq] = kp; return; }
      out.utt[seq] = { orig: e.orig, text: e.text, shown: str(it.text), base: str(it.text) };   // 가림 검사 기준도 이번 응답의 가린 글로(P2-A)
    });
    return { fix: out, droppedUtt: dUtt, droppedSpk: dSpk };
  };
  // 원문 칸 파일이 바뀌어 다시 미리보기 할 때: 고친 발언을 모두 버리고(이름표는 둔다) 버린 건수를 돌려준다. 새 파일의 같은 번호 줄에 붙는 것을 막는다(P2-1).
  mn.dropEdited = function (fix) {
    const labels = {}, f = isObj(fix) ? fix : {};
    Object.keys(f.labels || {}).forEach(function (no) { labels[no] = f.labels[no]; });
    const n = Object.keys(f.utt || {}).filter(function (k) { return mn.fixed(f.utt[k]); }).length;
    return { fix: { labels: labels, utt: {} }, dropped: n };
  };
  mn.fixDroppedText = function (n) { return '원문이 바뀌어 고친 발언 ' + n + '건을 지웠습니다.'; };
  // 서버가 고친 내용 때문에 거절한 응답인지(이때는 지금 미리보기를 지우지 않고 그 자리에 오류를 단다)
  mn.isEditFail = function (detail) {
    const d = isObj(detail) ? detail : {};
    return { LABEL_INVALID: 1, LABEL_SPEAKER_UNKNOWN: 1, EDIT_SEQ_UNKNOWN: 1, LIMIT_EDIT_LEN: 1, EDITS_INVALID: 1, EDIT_MASK_REMOVED: 1 }[d.code] === 1
      || (d.slot === 'edit' && { CONTROL_CHAR: 1, LIMIT_LINE: 1, LIMIT_EDIT_LEN: 1 }[d.code] === 1);
  };

  // ── 올리기 입력 검사(6-4 사전 검사) ──
  mn.parseTerms = function (text) {
    const seen = Object.create(null), list = [];
    let bad = false;
    str(text).split(/\r?\n/).forEach(function (l) {
      const t = l.trim();
      if (!t) return;
      if (t.length < 2 || t.length > 30) { bad = true; return; }
      if (!seen[t]) { seen[t] = 1; list.push(t); }
    });
    if (list.length > mn.TERMS_MAX) bad = true;
    return { list: list, bad: bad };
  };
  // v = {date, title, termsText, slots:{transcript|timeline|summary:{provided, mode:'file'|'paste', name, size}}} → {ok, errs:{칸:문구}, terms:[…]}
  mn.validateUpload = function (v, today) {
    const errs = {};
    function e(k, status, d) { if (!errs[k]) errs[k] = mn.errorText(status, d, { action: 'upload' }).text; }
    if (!mn.validDate(v.date) || v.date < '2000-01-01' || v.date > today) e('meeting_date', 422, { code: 'MEETING_DATE_INVALID' });
    const t = str(v.title).trim();
    if (!t || t.length > mn.TITLE_MAX) e('title', 422, { code: 'TITLE_REQUIRED' });
    ['transcript', 'timeline', 'summary'].forEach(function (k) {
      const s = v.slots && v.slots[k];
      if (!s || !s.provided) { if (k === 'transcript') e(k, 422, { code: 'TRANSCRIPT_REQUIRED' }); return; }
      if (s.mode === 'file' && !/\.txt$/i.test(str(s.name))) e(k, 422, { code: 'NOT_TXT', slot: k });
      else if (!(s.size > 0)) e(k, 422, { code: 'EMPTY_FILE', slot: k });
      else if (s.size > mn.MAX_FILE) errs[k] = mn.SLOT[k] + ': 파일 하나당 ' + (mn.MAX_FILE / (1024 * 1024)) + 'MB 이하로 올려 주세요.';
    });
    const pt = mn.parseTerms(v.termsText);
    if (pt.bad) e('terms', 422, { code: 'TERMS_INVALID' });
    return { ok: Object.keys(errs).length === 0, errs: errs, terms: pt.list };
  };
  const FIELD_ORDER = ['meeting_date', 'title', 'transcript', 'timeline', 'summary', 'terms'];
  const SLOTS = ['transcript', 'timeline', 'summary'];

  // 올리기 상태 u 에서 칸마다 실제로 보낼 파일/붙여넣기 Blob. 붙여넣기는 text/plain Blob.
  function slotBlob(u, k) {
    if (u.src[k] === 'paste') { const t = u.paste[k]; return t && t.trim() ? new root.Blob([t], { type: 'text/plain' }) : null; }
    return u.files[k] || null;
  }
  function releaseList(u) { return Object.keys(u.release).filter(function (t) { return u.release[t]; }).sort(); }
  // 미리보기 때 입력과 지금 입력이 같은지 비교하는 표식. 파일은 이름·크기·수정시각, 붙여넣기는 글 전체.
  function slotSigs(u) {
    return SLOTS.map(function (k) {
      if (u.src[k] === 'paste') return ['p', u.paste[k] || ''];
      const f = u.files[k]; return f ? ['f', f.name, f.size, f.lastModified] : null;
    });
  }
  // 원문 칸(transcript = SLOTS[0])만의 표식. 직전 미리보기와 다르면 원문이 바뀐 것이다 — 고친 발언은 원문의 번호에만 붙으므로 구간·요약 칸은 보지 않는다(P2-1·P3-C).
  mn.fileSig = function (u) { return JSON.stringify(slotSigs(u).slice(0, 1)); };
  mn.signature = function (u) {
    return JSON.stringify({ d: u.date, t: u.title, f: slotSigs(u), x: u.terms, r: releaseList(u), e: mn.editsPayload(u.fix) });   // 고친 이름표·발언도 표식에 든다 — 고치면 stale, 다시 미리보기 뒤에야 저장
  };
  // multipart 본문. 파일명은 보내지 않는다(고정 이름 '<칸>.txt' — 서버가 확장자만 본다). options 는 JSON Blob.
  // digest 가 있으면 저장 요청이다: preview_digest·rules_ack(수칙 확인, 체크해야 저장이 켜진다)를 싣는다.
  mn.buildForm = function (u, terms, digest) {
    const fd = new root.FormData();
    SLOTS.forEach(function (k) { const b = slotBlob(u, k); if (b) fd.append(k, b, k + '.txt'); });
    const o = { meeting_date: u.date, title: str(u.title).trim(), terms: terms, release: releaseList(u) };
    const ed = mn.editsPayload(u.fix);   // 미리보기·저장 둘 다 싣는다. 비었으면 파트를 넣지 않는다.
    if (ed) fd.append('edits', new root.Blob([JSON.stringify(ed)], { type: 'application/json' }), 'edits.json');
    if (digest) {
      o.preview_digest = digest; o.rules_ack = true;
      if (ed && typeof u.editsDigest === 'string' && u.editsDigest) o.edits_digest = u.editsDigest;   // 다시 미리보기 응답의 edits_digest 를 그대로
    }
    fd.append('options',new root.Blob([JSON.stringify(o)], { type: 'application/json' }), 'options.json');
    return fd;
  };
  function formView(u) {
    const slots = {};
    SLOTS.forEach(function (k) {
      if (u.src[k] === 'paste') { const t = u.paste[k] || ''; slots[k] = { provided: t.trim().length > 0, mode: 'paste', name: k + '.txt', size: new root.Blob([t]).size }; }
      else { const f = u.files[k]; slots[k] = { provided: !!f, mode: 'file', name: f ? f.name : '', size: f ? f.size : 0 }; }
    });
    return { date: u.date, title: u.title, termsText: u.terms, slots: slots };
  }

  // ── 컨트롤러(DOM) ──
  // env: {doFetch, epoch(), me()→{emp,name,role}, msg(text)}
  // probe(mid, {isAssignee})→Promise<{show,count,error,stale?}> · show(panel) · stop() · onCount(n) 를 board-material 이 걸어 둔다
  mn.createController = function (env) {
    const ctl = { onCount: null };
    let S = null, panel = null, rootNode = null;

    function me() { return (env.me && env.me()) || {}; }
    function privileged(isAssignee) { const r = me().role; return isAssignee === true || r === '영업팀장' || r === '영업부장'; }
    function say(t) { if (env.msg) env.msg(t || ''); }
    function scr() { return mn.screenFor(S && S.isAssignee); }   // 탭 안 모든 호출의 X-Screen-Id(담당자 board_write, 그 밖 board_review)
    function live() { return !!(panel && rootNode && rootNode.parentNode === panel); }   // 다른 탭이 패널을 덮었으면 그리지 않는다
    function guard() { const s = S, ep = env.epoch(); return function () { return S === s && ep === env.epoch(); }; }
    function byId(id) { return id ? root.document.getElementById(id) : null; }
    function focusById(id) { const n = byId(id); if (n && !n.disabled && n.focus) n.focus(); }
    function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
    function replaceNode(a, b) { if (a && a.parentNode) a.parentNode.replaceChild(b, a); }
    function btn(label, o) {
      o = o || {};
      const b = el('button', o.cls || '', label);
      b.type = 'button';
      if (o.id) b.id = o.id;
      if (o.attrs) Object.keys(o.attrs).forEach(function (k) { b.setAttribute(k, o.attrs[k]); });
      if (o.on) b.addEventListener('click', o.on);
      return b;
    }
    function badge(t) { return el('span', 'bd-badge', t); }
    function errP(text, id) {
      const p = el('p', 'wf-empty bd-err', text || '');
      if (id) p.id = id;
      p.setAttribute('role', 'alert'); p.tabIndex = -1; p.hidden = !text;
      return p;
    }
    function statusP(t) { const p = el('p', 'wf-empty', t); p.setAttribute('role', 'status'); return p; }
    function buildMark() { const p = el('p', 'mn-mark'); p.appendChild(el('b', '', T.MARK_B)); p.appendChild(root.document.createTextNode(T.MARK)); return p; }

    // fetch 래퍼: 항상 {ok,status,body,detail}. 네트워크 실패는 status 0.
    function call(method, url, ui, btnId, payload, isForm) {
      const init = { method: method, headers: mn.headers(ui, btnId) };
      if (payload !== undefined) {
        if (isForm) init.body = payload;
        else { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(payload); }
      }
      return env.doFetch(url, init).then(function (res) {
        return res.json().then(function (b) { return b; }, function () { return null; }).then(function (b) {
          return { ok: !!res.ok, status: res.status, body: b, detail: isObj(b) && b.detail !== undefined ? b.detail : null };
        });
      }, function () { return { ok: false, status: 0, body: null, detail: null }; });
    }

    // ── 상태 ──
    function newState(mid, isAssignee) {
      return { mid: str(mid), ep: env.epoch(), isAssignee: !!isAssignee, probing: null, view: 'list', notice: '',
               list: { status: 'idle', items: [], canUpload: false, err: '' }, cur: null, up: null };
    }
    function newUp() {
      return { date: '', title: '', src: { transcript: 'file', timeline: 'file', summary: 'file' }, files: {}, paste: {}, terms: '',
               pv: null, pvSig: '', release: {}, cands: {}, ack: false, busy: '', errs: {}, dupId: '',
               fix: { labels: {}, utt: {} }, fixNote: '', pvFileSig: '', editsDigest: null, noiseOpen: {}, rowErr: null, revertAsk: false, cancelAsk: false, editing: null, ctx: null };
    }
    function applyList(s, r) {
      const L = s.list;
      if (r.ok && isObj(r.body) && Array.isArray(r.body.items)) { L.status = 'ready'; L.items = r.body.items; L.canUpload = r.body.can_upload === true; L.err = ''; }
      else if (r.status === 404) { L.status = 'hidden'; L.items = []; L.canUpload = false; L.err = ''; }
      else { L.status = 'error'; L.items = []; L.canUpload = false; L.err = r.status === 401 ? T.SESSION : T.LIST_FAIL; }
    }
    function result(s) {
      const L = s.list;
      let show = false;
      if (L.status === 'ready') show = mn.tabShown(200, { items: L.items, can_upload: L.canUpload });
      else if (L.status === 'error' && L.err !== T.SESSION) show = privileged(s.isAssignee);   // 5xx·네트워크: 담당·팀장급만 탭을 보이고 안에서 다시 불러오게 한다
      return { show: show, count: L.items.length, error: L.status === 'error' };
    }
    ctl.probe = function (mid, opts) {
      mid = str(mid);
      if (!(S && S.mid === mid && S.ep === env.epoch() && S.probing)) {
        const s = S = newState(mid, opts && opts.isAssignee), ok = guard();
        s.list.status = 'loading';
        s.probing = call('GET', '/board-materials/' + mid + '/minutes', scr(), mn.BTN.TAB).then(function (r) { if (ok()) applyList(s, r); });
      }
      const s0 = S;
      return s0.probing.then(function () { return S === s0 ? result(s0) : { show: false, count: 0, error: false, stale: true }; });
    };
    ctl.show = function (p) { panel = p; rootNode = null; if (S) draw(); };   // 탭을 다시 열면 새 뿌리로 그린다
    ctl.stop = function () { S = null; panel = null; rootNode = null; };   // 고른 파일·미리보기 응답은 상태와 함께 버린다
    ctl.state = function () { return S; };

    function reloadList(focus) {
      const s = S, ok = guard();
      s.list.status = 'loading';
      const fid = typeof focus === 'string' ? focus : focus ? 'mn-h' : '';   // 문자열이면 그 id 로, true 면 제목으로
      if (live() && S.view === 'list') draw(typeof focus === 'string' ? focus : '');
      return call('GET', '/board-materials/' + s.mid + '/minutes', scr(), mn.BTN.TAB).then(function (r) {
        if (!ok()) return;
        applyList(s, r);
        if (s.list.status === 'ready' && ctl.onCount) ctl.onCount(s.list.items.length);
        if (live() && s.view === 'list') draw(fid);
      });
    }

    // ── 그리기 뼈대 ──
    function draw(focusId) {
      if (!mn.canDraw(panel, rootNode)) return;   // 다른 탭이 패널을 덮었으면 지우지도 그리지도 않는다(show 가 다시 그린다)
      clear(panel);
      rootNode = el('div', 'mn');
      rootNode.addEventListener('keydown', onKey);
      panel.appendChild(rootNode);
      if (!S) return;
      if (S.view === 'detail' && S.cur) buildDetail(rootNode, S.cur);
      else if (S.view === 'upload' && S.up) buildUpload(rootNode, S.up);
      else buildList(rootNode);
      if (focusId) focusById(focusId);
    }
    function onKey(e) {
      if (e.key !== 'Escape' || !S) return;
      if (S.up && S.up.editing) { e.preventDefault(); closeEditor(S.up, true); return; }   // 미리보기에서 발언 고치는 중
      if (!S.cur) return;
      const cur = S.cur;
      if (cur.editing) { e.preventDefault(); closeEditor(cur, true); }
      else if (cur.confirm) { e.preventDefault(); closeConfirm(cur); }
    }
    function head(title, hid, tools) {
      const h = el('div', 'mn-head'), t = el('h3', '', title);
      t.id = hid; t.tabIndex = -1; h.appendChild(t);
      if (tools) h.appendChild(tools);
      return h;
    }

    // ── 목록 ──
    function buildList(r) {
      const L = S.list;
      r.appendChild(buildMark());
      let tools = null;
      if (L.status === 'ready' && L.canUpload) { tools = el('div', 'mn-tools'); tools.appendChild(btn('회의록 올리기', { id: 'mn-up-open', on: openUpload })); }
      r.appendChild(head('회의록', 'mn-h', tools));
      const intro = el('p', 'wf-empty', T.INTRO); intro.id = 'mn-intro'; r.appendChild(intro);   // 이사회 뒤에 받은 정리본으로 남기는 기록(올리는 시점은 막지 않는다)
      if (S.notice) r.appendChild(errP(S.notice, 'mn-err'));   // 상세·올리기로 들어가면 지운다
      if (L.status === 'loading' || L.status === 'idle') r.appendChild(statusP('불러오는 중…'));
      else if (L.status === 'hidden') r.appendChild(el('p', 'wf-empty', T.HIDDEN));
      else if (L.status === 'error') {
        r.appendChild(errP(L.err, 'mn-list-err'));
        r.appendChild(btn('다시 불러오기', { id: 'mn-reload', on: function () { reloadList(true); } }));
      } else if (!L.items.length) {
        r.appendChild(el('p', 'wf-empty', T.EMPTY_LIST));
        if (L.canUpload) r.appendChild(btn('회의록 올리기', { id: 'mn-up-open2', on: openUpload }));
      } else r.appendChild(buildTable(L.items));
    }
    function buildTable(items) {
      const t = el('table', 'ad-table mn-tbl');
      t.appendChild(el('caption', 'bd-sr', '회의록 ' + items.length + '건'));
      const hr = el('tr');
      ['회의일', '제목', '길이', '발언', '올린 사람'].forEach(function (h) { const th = el('th', '', h); th.setAttribute('scope', 'col'); hr.appendChild(th); });
      const th = el('thead'); th.appendChild(hr); t.appendChild(th);
      const tb = el('tbody');
      items.forEach(function (it) {
        const tr = el('tr');
        tr.appendChild(el('td', 'mono', it.meeting_date));
        const td = el('td', 'mn-t-title');
        td.appendChild(btn(str(it.title) || '(제목 없음)', { cls: 'mn-open', id: 'mn-open-' + str(it.minutes_id), attrs: { 'data-id': str(it.minutes_id) }, on: function () { openDetail(it.minutes_id); } }));
        tr.appendChild(td);
        tr.appendChild(el('td', '', mn.dur(it.duration_sec)));
        tr.appendChild(el('td', '', it.utter_cnt));
        tr.appendChild(el('td', '', str(it.created_by_name) + ' ' + mn.kstDate(it.created_at)));
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      return t;
    }
    function toList() { S.cur = null; S.up = null; S.view = 'list'; draw('mn-h'); }
    // 탭을 연 뒤에 404(삭제·기간 만료): 목록으로 돌아가 이유를 알린다
    function gone() {
      if (!S) return;
      S.cur = null; S.up = null; S.view = 'list'; S.notice = T.GONE;
      reloadList('mn-err');   // 다시 그릴 때마다 안내 줄로 포커스를 둔다
    }

    // ── 상세 ──
    function openDetail(id) {
      S.view = 'detail'; S.up = null; S.notice = '';
      const cur = S.cur = { id: str(id), status: 'loading', data: null, err: '', editOn: false, editing: null, confirm: false, nodes: {}, lbl: null,
                            tr: { status: 'idle', items: [], open: false, err: '' }, noise: {}, scopeOpen: false, scope: null, histOpen: false, hist: null };
      draw('mn-back');
      loadDetail(cur);
    }
    function loadDetail(cur) {
      const ok = guard();
      cur.status = 'loading';
      call('GET', '/board-minutes/' + cur.id, scr(), mn.BTN.OPEN).then(function (r) {
        if (!ok() || S.cur !== cur) return;
        if (r.status === 404) { gone(); return; }
        if (r.ok && isObj(r.body) && isObj(r.body.viewer)) { cur.status = 'ready'; cur.data = r.body; }
        else { cur.status = 'error'; cur.err = r.ok ? T.DETAIL_FAIL : mn.errorText(r.status, r.detail, { action: 'view' }).text; }
        if (live()) draw('mn-title');
      });
    }
    function showErr(cur, text, focus) {
      const n = cur.nodes && cur.nodes.err;
      if (!n) return;
      n.textContent = text; n.hidden = !text;
      if (text && focus !== false && n.focus) n.focus();
    }
    function handleErr(cur, r, ctx) {
      if (r.status === 404) { gone(); return; }
      showErr(cur, mn.errorText(r.status, r.detail, ctx).text);
    }
    function buildDetail(r, cur) {
      r.appendChild(btn('← 회의록 목록', { cls: 'link-btn', id: 'mn-back', on: toList }));
      if (cur.status !== 'ready') {
        r.appendChild(head('회의록', 'mn-title', null));
        if (cur.status === 'loading') r.appendChild(statusP('불러오는 중…'));
        else {
          r.appendChild(errP(cur.err, 'mn-err'));
          r.lastChild.hidden = false;
          r.appendChild(btn('다시 불러오기', { id: 'mn-reload', on: function () { draw('mn-back'); loadDetail(cur); } }));
        }
        return;
      }
      cur.editing = null;   // 다시 그리면 열려 있던 편집 줄은 사라진다
      const d = cur.data, v = d.viewer, st = isObj(d.stats) ? d.stats : {};
      const pr = el('p', 'mn-print', '열람자 사번 ' + str(me().emp) + ' · 출력 ' + mn.today() + ' ' + p2(new Date().getHours()) + ':' + p2(new Date().getMinutes()));
      r.appendChild(pr);
      const tools = el('div', 'mn-tools');
      if (v.can_scope) tools.appendChild(btn('공개범위', { id: 'mn-scope-btn', attrs: { 'aria-expanded': cur.scopeOpen ? 'true' : 'false', 'aria-controls': 'mn-scope' }, on: function () { toggleScope(cur); } }));
      if (v.can_edit) tools.appendChild(btn(cur.editOn ? '고치기 끄기' : '고치기 켜기', { id: 'mn-edit-toggle', attrs: { 'aria-pressed': cur.editOn ? 'true' : 'false' },
        on: function () { if (cur.lbl && cur.lbl.busy) return; closeEditor(cur, false); cur.editOn = !cur.editOn; cur.lbl = null; draw('mn-edit-toggle'); } }));   // 이름표 저장 중에는 끌 수 없다
      if (v.can_view_history) tools.appendChild(btn('변경 이력', { id: 'mn-hist-btn', attrs: { 'aria-expanded': cur.histOpen ? 'true' : 'false', 'aria-controls': 'mn-hist' }, on: function () { toggleHist(cur); } }));
      if (v.can_delete) tools.appendChild(btn('삭제', { id: 'mn-del-btn', on: function () { openConfirm(cur); } }));
      r.appendChild(head(str(d.title), 'mn-title', tools));
      const meta = el('div', 'mn-meta');
      meta.appendChild(el('span', '', '회의일 ' + str(d.meeting_date)));
      meta.appendChild(el('span', '', mn.dur(st.duration_sec)));
      meta.appendChild(el('span', '', '발언 ' + (st.utter_cnt | 0)));
      meta.appendChild(el('span', '', '참석자 ' + (st.speaker_cnt | 0)));
      meta.appendChild(el('span', '', str(d.created_by_name) + ' 올림 ' + mn.kstDate(d.created_at)));
      r.appendChild(meta);
      r.appendChild(buildMark());
      const vn = mn.viewNote(v);   // 올린 사람·공개받은 사람이 볼 수 있는 기한(날짜만 mono). 기본 열람자는 줄 없음
      if (vn) {
        const vp = el('p', 'mn-meta', vn.before);
        if (vn.date) { vp.appendChild(el('span', 'mono', vn.date)); vp.appendChild(root.document.createTextNode(vn.after)); }
        r.appendChild(vp);
      }
      cur.nodes = { err: errP('', 'mn-err'), scope: el('div'), hist: el('div'), del: el('div'), tr: el('div'), lbl: el('div') };
      r.appendChild(cur.nodes.err);
      r.appendChild(cur.nodes.del); r.appendChild(cur.nodes.scope); r.appendChild(cur.nodes.hist);
      const ctx = { mode: 'detail', cur: cur, canEdit: !!(v.can_edit && cur.editOn), canCheck: v.can_check_todo === true };
      buildContent(r, d, ctx);
      const trh = el('div', 'mn-head'); trh.appendChild(el('h4', '', '원문'));
      if (v.can_edit && cur.editOn && isObj(d.speaker_label_rules)) {
        trh.appendChild(btn('발화자 이름표 바꾸기', { id: 'mn-lbl-open', attrs: { 'aria-expanded': cur.lbl ? 'true' : 'false', 'aria-controls': 'mn-spk-fs' }, on: function () { toggleLbl(cur); } }));
      }
      r.appendChild(trh);
      r.appendChild(cur.nodes.lbl);
      r.appendChild(cur.nodes.tr);
      drawTr(cur, ctx);
      drawLbl(cur);
      if (cur.confirm) drawConfirm(cur);
      if (cur.scopeOpen) drawScope(cur);
      if (cur.histOpen) drawHist(cur);
    }

    // 요약 카드·시간대별 구간(상세와 미리보기가 함께 쓴다)
    function buildContent(r, d, ctx) {
      const sm = isObj(d.summary) ? d.summary : {}, topics = sm.topics || [], todos = sm.todos || [], others = sm.others || [];
      if (!topics.length && !todos.length && !others.length) r.appendChild(el('p', 'wf-empty', T.NO_SUMMARY));
      else {
        const grid = el('div', 'mn-sum');
        const c1 = el('div', 'mn-card'); c1.appendChild(el('h4', '', '주요 주제'));
        if (topics.length) { const ul = el('ul'); topics.forEach(function (it) { ul.appendChild(itemLi(it, ctx)); }); c1.appendChild(ul); }
        else c1.appendChild(el('p', 'wf-empty', T.NO_TOPIC));
        grid.appendChild(c1);
        const c2 = el('div', 'mn-card'); c2.appendChild(el('h4', '', '다음 할 일'));
        if (todos.length) { const ul = el('ul', 'mn-todo'); todos.forEach(function (it) { ul.appendChild(todoLi(it, ctx)); }); c2.appendChild(ul); }
        else c2.appendChild(el('p', 'wf-empty', T.NO_TODO));
        grid.appendChild(c2);
        others.forEach(function (sec) {
          const c = el('div', 'mn-card'); c.appendChild(el('h4', '', str(sec.title) || '기타'));
          const ul = el('ul'); (sec.items || []).forEach(function (it) { ul.appendChild(itemLi(it, ctx)); }); c.appendChild(ul);
          grid.appendChild(c);
        });
        r.appendChild(grid);
      }
      const segs = d.segments || [];
      const sh = el('div', 'mn-head'); sh.appendChild(el('h4', '', '시간대별 요약'));
      if ((d.out_of_segment_cnt | 0) > 0) { const o = el('span', 'mn-meta', '구간 밖 발언 ' + (d.out_of_segment_cnt | 0) + '건'); o.style.marginLeft = 'auto'; sh.appendChild(o); }
      r.appendChild(sh);
      if (!segs.length) { r.appendChild(el('p', 'wf-empty', T.NO_SEG)); return; }
      const ul = el('ul', 'mn-segs');
      segs.forEach(function (s) { ul.appendChild(segLi(s, d, ctx)); });
      r.appendChild(ul);
    }
    function segLi(s, d, ctx) {
      const li = el('li', 'mn-seg');
      if (/^\d{1,6}$/.test(str(s.seg_no))) { li.id = 'mn-seg-' + s.seg_no; li.tabIndex = -1; }
      const rg = mn.range(s);
      li.appendChild(el('span', 'mono', rg));
      const mid = el('div');
      if (Array.isArray(s.keywords) && s.keywords.length) { const kw = el('div', 'mn-kw'); s.keywords.forEach(function (k) { kw.appendChild(el('span', '', k)); }); mid.appendChild(kw); }
      if (Array.isArray(s.items) && s.items.length) { const ul = el('ul'); s.items.forEach(function (it) { ul.appendChild(itemLi(it, ctx)); }); mid.appendChild(ul); }
      li.appendChild(mid);
      const act = el('div');
      if (s.first_seq != null && mn.uttId(s.first_seq)) act.appendChild(btn('원문 보기', { attrs: { 'aria-label': rg + ' 구간 원문 보기' }, on: function () { goSeg(ctx, s, rg); } }));
      li.appendChild(act);
      return li;
    }
    function editBtn(kind, no, label, on) { return btn('고치기', { cls: 'link-btn', id: 'mn-ed-' + kind + '-' + no, attrs: { 'aria-label': label }, on: on }); }
    function itemLi(it, ctx) {
      const li = el('li');
      const sp = el('span', 'mn-txt'); mn.textNodes(sp, it.text); li.appendChild(sp);
      if (it.edited) li.appendChild(badge('고침'));
      if (ctx.canEdit) li.appendChild(editBtn('item', it.item_no, '항목 ' + it.item_no + ' 고치기', function () { openEditor(ctx.cur, 'item', it, li, function () { return itemLi(it, ctx); }); }));
      return li;
    }
    function todoLi(it, ctx) {
      const li = el('li', it.done ? 'is-done' : '');
      const lab = el('label'), cb = el('input');
      cb.type = 'checkbox'; cb.id = 'mn-td-' + it.item_no; cb.checked = !!it.done;
      const sp = el('span', 'mn-txt'); mn.textNodes(sp, it.text);
      lab.appendChild(cb); lab.appendChild(sp); li.appendChild(lab);
      if (ctx.mode === 'preview') { cb.disabled = true; cb.checked = false; return li; }
      if (it.done) {
        const w = el('span', 'mn-who', '완료 · ' + str(it.done_by_name) + ' · ' + mn.kst(it.done_at));
        w.id = 'mn-who-' + it.item_no; li.appendChild(w); cb.setAttribute('aria-describedby', w.id);
      }
      if (!ctx.canCheck) { cb.disabled = true; li.appendChild(el('span', 'mn-who', T.TODO_LOCK)); }
      else cb.addEventListener('change', function () { toggleTodo(ctx, it, li, cb); });
      if (ctx.canEdit) li.appendChild(editBtn('item', it.item_no, '할 일 ' + it.item_no + ' 고치기', function () { openEditor(ctx.cur, 'item', it, li, function () { return todoLi(it, ctx); }); }));
      return li;
    }
    function toggleTodo(ctx, it, li, cb) {
      const cur = ctx.cur, want = cb.checked, ok = guard();
      cb.disabled = true;
      call('POST', '/board-minutes/' + cur.id + '/items/' + it.item_no + '/done', scr(), mn.BTN.TODO, { done: want }).then(function (r) {
        if (!ok()) return;
        if (r.ok) {
          it.done = want; it.done_by_name = want ? me().name : null; it.done_at = want ? new Date().toISOString() : null;
          replaceNode(li, todoLi(it, ctx));
          focusById('mn-td-' + it.item_no);
        } else { cb.checked = !want; cb.disabled = false; handleErr(cur, r, { action: 'todo' }); }
      });
    }

    // ── 원문 ──
    function loadTranscript(cur, then) {
      const ok = guard();
      cur.tr.status = 'loading'; cur.tr.err = '';
      call('GET', '/board-minutes/' + cur.id + '/transcript', scr(), mn.BTN.TRANSCRIPT).then(function (r) {
        if (!ok() || S.cur !== cur) return;
        if (r.status === 404) { gone(); return; }
        if (r.ok && isObj(r.body) && Array.isArray(r.body.items)) { cur.tr.status = 'ready'; cur.tr.items = r.body.items; }
        else { cur.tr.status = 'error'; cur.tr.err = mn.errorText(r.status, r.detail, { action: 'view' }).text; }
        if (live()) drawTr(cur);
        if (then) then();
        const w = cur.tr.wait; cur.tr.wait = null;   // 받는 중에 [발언 보기]를 누른 것은 받은 뒤에 옮긴다
        if (w && cur.tr.status === 'ready') w();
      });
    }
    function trCtx(cur) {
      const v = cur.data.viewer;
      return { mode: 'detail', cur: cur, canEdit: !!(v.can_edit && cur.editOn), canCheck: v.can_check_todo === true };
    }
    function drawTr(cur, ctx) {
      const box = cur.nodes.tr, T0 = cur.tr;
      if (!box) return;
      ctx = ctx || trCtx(cur);
      clear(box);
      const bar = el('div', 'mn-tools');
      bar.style.marginBottom = '6px';
      bar.appendChild(btn(T0.open ? '원문 접기' : '원문 펼치기', { id: 'mn-tr-toggle', attrs: { 'aria-expanded': T0.open ? 'true' : 'false', 'aria-controls': 'mn-tr-body' }, on: function () {
        T0.open = !T0.open;
        if (T0.open && T0.status === 'idle') { drawTr(cur, ctx); loadTranscript(cur); focusById('mn-tr-toggle'); return; }
        drawTr(cur, ctx); focusById('mn-tr-toggle');
      } }));
      box.appendChild(bar);
      const body = el('div'); body.id = 'mn-tr-body'; body.hidden = !T0.open;
      box.appendChild(body);
      if (!T0.open) return;
      if (T0.status === 'loading') body.appendChild(statusP('불러오는 중…'));
      else if (T0.status === 'error') {
        body.appendChild(errP(T0.err, 'mn-tr-err')); body.lastChild.hidden = false;
        body.appendChild(btn('다시 불러오기', { on: function () { drawTr(cur, ctx); loadTranscript(cur); } }));
      } else if (T0.status === 'ready') body.appendChild(buildTrList(T0.items, cur.data, ctx, cur.noise, function () { drawTr(cur, ctx); }));
    }
    // 발언을 구간 번호로 묶는다(구간이 없으면 한 줄 목록). 잡음 발언은 구간마다 접어 둔다.
    function buildTrList(items, d, ctx, noiseOpen, redraw) {
      const ul = el('ul', 'mn-tx'), segs = d.segments || [];
      const info = Object.create(null); segs.forEach(function (s) { info[s.seg_no] = s; });
      const order = [], groups = Object.create(null);
      items.forEach(function (u) {
        const k = u.seg_no == null ? 'x' : String(u.seg_no);
        if (!groups[k]) { groups[k] = []; order.push(k); }
        groups[k].push(u);
      });
      order.forEach(function (k) {
        const g = groups[k];
        if (segs.length) {
          const h = el('li', 'mn-seghd');
          if (k === 'x') h.appendChild(el('span', '', '구간 밖'));
          else if (info[k]) {
            h.appendChild(el('span', 'mono', mn.range(info[k])));
            if (/^\d{1,6}$/.test(k)) h.appendChild(btn('구간 요약으로', { cls: 'link-btn', attrs: { 'aria-label': mn.range(info[k]) + ' 구간 요약으로' }, on: function () {
              const n = byId('mn-seg-' + k); if (n) { if (n.scrollIntoView) n.scrollIntoView({ block: 'center' }); n.focus(); }
            } }));
          }
          ul.appendChild(h);
        }
        const noise = [];
        g.forEach(function (u) { if (u.noise) noise.push(u); else ul.appendChild(utterLi(u, ctx)); });
        if (noise.length) {
          const open = !!noiseOpen[k], li = el('li', 'mn-nrow');
          li.style.padding = '6px 12px'; li.style.fontSize = '12px'; li.style.color = 'var(--muted)';
          li.appendChild(el('span', '', '잡음으로 보이는 발언 ' + noise.length + '건' + (open ? '' : ' 숨김') + ' '));
          li.appendChild(btn(open ? '숨기기' : '보이기', { cls: 'link-btn', attrs: { 'aria-expanded': open ? 'true' : 'false', 'aria-controls': 'mn-noise-' + k }, on: function () { noiseOpen[k] = !open; redraw(); } }));
          const inner = el('ul'); inner.id = 'mn-noise-' + k; inner.hidden = !open;
          inner.style.listStyle = 'none'; inner.style.margin = '0'; inner.style.padding = '0';
          if (open) noise.forEach(function (u) { inner.appendChild(utterLi(u, ctx)); });
          li.appendChild(inner);
          ul.appendChild(li);
        }
      });
      return ul;
    }
    function utterLi(u, ctx) {
      const fixMode = ctx.mode === 'preview' && !!ctx.fix;   // 미리보기: 저장 전 고치기(로컬 상태만 바꾼다)
      const no = mn.spkNo(u), fe = fixMode ? ctx.fix.utt[u.seq_no] : null;
      const label = fixMode ? (ctx.fix.labels[no] || '') : str(u.speaker_label);
      const edited = fe ? mn.fixed(fe) : !!u.edited;
      const li = el('li', 'mn-u' + (u.noise ? ' is-noise' : '') + (edited ? ' is-edited' : ''));
      const id = mn.uttId(u.seq_no);
      if (id) { li.id = id; li.tabIndex = -1; }
      li.setAttribute('data-spk', String(no));
      li.appendChild(spkCell(no, label, u.speaker));
      li.appendChild(el('time', '', u.time));
      const body = el('div', 'mn-body'); mn.textNodes(body, fe ? fixText(fe) : u.text); li.appendChild(body);
      const acts = el('div', 'mn-uacts');
      if (edited) acts.appendChild(badge('고침'));
      if (fixMode) {
        const lock = mn.fixLocked(ctx.u);   // 미리보기·저장 요청 중에는 고칠 수 없다(P3-B)
        if (edited) acts.appendChild(btn('되돌리기', { cls: 'link-btn', id: 'mn-rv-' + u.seq_no, attrs: { 'aria-label': '발언 ' + u.seq_no + ' 되돌리기' }, on: function () { pvRevert(ctx, u, li); } }));
        const eb = editBtn('utter', u.seq_no, '발언 ' + u.seq_no + ' 고치기', function () { pvEdit(ctx, u, li); });
        eb.disabled = lock;
        acts.appendChild(eb);
      } else if (ctx.canEdit) acts.appendChild(editBtn('utter', u.seq_no, '발언 ' + u.seq_no + ' 고치기', function () { openEditor(ctx.cur, 'utter', u, li, function () { return utterLi(u, ctx); }); }));
      li.appendChild(acts);
      const re = fixMode && ctx.u && ctx.u.rowErr && ctx.u.rowErr.utt[u.seq_no];
      if (re) { const p = el('p', 'bd-m-ferr', re); p.style.gridColumn = '1 / -1'; p.setAttribute('role', 'alert'); li.appendChild(p); }
      return li;
    }
    function fixText(e) { return e.shown != null ? e.shown : e.text; }
    function spkCell(no, label, fallback) {
      const v = mn.spkView(no, label, fallback), s = el('span', 'mn-spk');
      s.appendChild(el('b', '', v.main));
      if (v.sub) s.appendChild(el('small', '', v.sub));
      return s;
    }
    // 구간 → 원문 첫 발언으로. 원문을 아직 안 받았으면 받는다. 잡음 묶음에 있으면 펼친다.
    function goSeg(ctx, seg, rg) {
      if (ctx.mode === 'preview') {   // 미리보기는 상자 안에서 옮긴다(P2-1: cur 가 없어 아무 일도 안 하던 것)
        if (seg.first_seq != null) pvJump(ctx.u, seg.first_seq, rg + ' 구간의 첫 발언으로 옮겼습니다.');
        return;
      }
      if (!ctx.cur || seg.first_seq == null) return;
      jumpUtter(ctx.cur, seg.first_seq, rg + ' 구간의 첫 발언으로 옮겼습니다.');
    }
    // msg = 글자 또는 (원문 발언)→글자. after = 원문을 새로 받은 경우 옮긴 뒤 부를 함수(이름표 표의 시각 칸을 채운다)
    function jumpUtter(cur, seq, msg, after) {
      if (seq == null || !mn.uttId(seq)) return;
      const move = function () {
        const it = cur.tr.items.filter(function (u) { return Number(u.seq_no) === Number(seq); })[0];
        if (it && it.noise) { cur.noise[it.seg_no == null ? 'x' : String(it.seg_no)] = true; drawTr(cur); }
        const n = byId(mn.uttId(seq));
        if (!n) return;
        const old = rootNode && rootNode.querySelectorAll ? rootNode.querySelectorAll('.is-target') : [];
        for (let i = 0; i < old.length; i++) old[i].className = old[i].className.replace(/\s*is-target/g, '');
        n.className += ' is-target';
        if (n.scrollIntoView) n.scrollIntoView({ block: 'center' });
        n.focus();
        say(typeof msg === 'function' ? msg(it) : msg);
      };
      const run = function () { move(); if (after) after(); };
      cur.tr.open = true;
      if (cur.tr.status === 'ready') { drawTr(cur); move(); }
      else if (cur.tr.status === 'loading') { drawTr(cur); cur.tr.wait = run; }   // 받는 중에 누른 것은 사라지지 않고 받은 뒤 옮긴다
      else { drawTr(cur); cur.tr.wait = run; loadTranscript(cur); }   // idle·error: 누를 때만 받는다(error 는 다시 받기). 받은 뒤(ready)에만 옮기고 표를 다시 그린다 — 실패 때 포커스가 있는 버튼을 지우지 않고, 받는 중 또 누르면 마지막 것 한 번만(qa 11-24 P2-1·P3-2)
    }

    // ── 고치기 ──
    function closeEditor(cur, refocus) {
      const e = cur.editing;
      if (!e) return;
      cur.editing = null;
      replaceNode(e.li, e.rebuild());
      if (refocus) focusById('mn-ed-' + e.kind + '-' + e.no);
    }
    // local = {base, apply(text)→bool} 이면 미리보기 고치기: 서버를 부르지 않고 [반영]으로 로컬 상태만 바꾼다. base = 가림 토큰을 세는 원래 글.
    function openEditor(cur, kind, model, li, rebuild, local) {
      closeEditor(cur, false);
      const no = kind === 'utter' ? model.seq_no : model.item_no, max = kind === 'utter' ? 20000 : 1000;
      // 같은 줄을 다시 그리는 동안 이전 줄 참조가 바뀌므로, 지금 DOM 의 줄을 id 로 다시 찾는다
      const target = byId(li.id || '') || li;
      const box = el('div', 'mn-edit');
      box.style.gridColumn = '1 / -1';
      const ta = el('textarea'); ta.id = 'mn-ta'; ta.value = str(model.text); ta.maxLength = max;
      ta.setAttribute('aria-label', kind === 'utter' ? '발언 고치기' : '항목 고치기');
      const err = errP('', 'mn-ed-err'); err.className = 'bd-m-ferr';
      const acts = el('div', 'mn-edit-acts');
      const saveLabel = local ? '반영' : '저장';
      const save = btn(saveLabel, { cls: 'bd-primary', id: 'mn-ed-save' }), cancel = btn('취소', { id: 'mn-ed-cancel', on: function () { closeEditor(cur, true); } });
      acts.appendChild(save); acts.appendChild(cancel);
      box.appendChild(ta);
      {   // 가린 자리를 지워 이름을 되살리지 못하게 막는다(화면 검사 + 서버 EDIT_MASK_REMOVED) — 발언·요약 항목 모두
        const hint = el('p', 'mn-edit-hint', T.ED_HINT); hint.id = 'mn-ed-hint';
        box.appendChild(hint);
        ta.setAttribute('aria-describedby', 'mn-ed-hint mn-ed-err');
      }
      box.appendChild(err); box.appendChild(acts);
      while (target.firstChild) target.removeChild(target.firstChild);
      target.appendChild(box);
      cur.editing = { li: target, kind: kind, no: no, rebuild: rebuild };
      const base = local ? local.base : str(model.text);
      let busy = false;
      ta.addEventListener('input', function () {
        if (busy) return;
        const n = mn.lostMasks(base, ta.value);
        err.textContent = n > 0 ? mn.maskLostText(n) : ''; err.hidden = !(n > 0);
        save.disabled = n > 0;
      });
      save.addEventListener('click', function () {
        const text = ta.value;
        if (!text.trim()) { err.textContent = mn.errorText(422, { code: 'LIMIT_EDIT_LEN' }, { kind: kind }).text; err.hidden = false; ta.focus(); return; }
        const lost = mn.lostMasks(base, text);
        if (lost > 0) { err.textContent = mn.maskLostText(lost); err.hidden = false; ta.focus(); return; }
        if (local) { local.apply(text); closeEditor(cur, true); return; }
        const ok = guard();
        busy = true;
        save.disabled = true; cancel.disabled = true; save.textContent = '저장하는 중…';
        call('PUT', '/board-minutes/' + cur.id + (kind === 'utter' ? '/utterances/' : '/items/') + no, scr(), mn.BTN.EDIT, { text: text, rev_no: cur.data.rev_no }).then(function (r) {
          if (!ok() || S.cur !== cur) return;
          if (r.ok && isObj(r.body)) {
            if (typeof r.body.rev_no === 'number') cur.data.rev_no = r.body.rev_no;
            if (r.body.changed === false) say(T.NOCHANGE);
            else { model.text = text; model.edited = true; say('고친 내용을 저장했습니다.'); }
            closeEditor(cur, true);
            return;
          }
          busy = false;
          save.disabled = false; cancel.disabled = false; save.textContent = saveLabel;
          if (r.status === 404) { gone(); return; }
          const e = mn.errorText(r.status, r.detail, { action: 'edit', kind: kind });
          err.textContent = e.text; err.hidden = false;
          if (isObj(r.detail) && r.detail.code === 'REV_CHANGED') {
            const rb = btn('새로 불러오기', { id: 'mn-ed-reload', on: function () { cur.editing = null; draw('mn-back'); loadDetail(cur); } });
            if (!byId('mn-ed-reload')) acts.appendChild(rb);
          }
          ta.focus();
        });
      });
      ta.focus();
    }

    // ── 발화자 이름표 표(미리보기·상세 공통) — 자유 입력 없이 소속·역할·번호를 골라 만든다 ──
    function selectOf(id, aria, opts) {
      const s = el('select'); s.id = id; s.setAttribute('aria-label', aria);
      opts.forEach(function (o) { const op = el('option', '', o[1]); op.value = o[0]; if (o[2]) op.disabled = true; s.appendChild(op); });
      return s;
    }
    // cfg = {rules, speakers:[{no,count}], get(no), changed(no), set(no,label), revert(no), first(no)→{seq,time}|null, jump(f,no), rowErrs, labelsNow()}
    function buildSpkTable(cfg) {
      const rules = cfg.rules, rows = {};
      const fs = el('fieldset', 'tm-fs'); fs.id = 'mn-spk-fs';
      fs.appendChild(el('legend', '', T.LBL_LEGEND));
      fs.appendChild(el('p', 'mn-meta', T.LBL_HINT));
      const t = el('table', 'ad-table mn-spk-tbl');
      t.appendChild(el('caption', 'bd-sr', '발화자 이름표 ' + cfg.speakers.length + '명'));
      const hr = el('tr');
      ['원래 표기', '발언 수', '첫 발언', '이름표', '상태'].forEach(function (h) { const th = el('th', '', h); th.setAttribute('scope', 'col'); hr.appendChild(th); });
      const thd = el('thead'); thd.appendChild(hr); t.appendChild(thd);
      const tb = el('tbody');
      const dup = el('p', 'wf-empty'); dup.id = 'mn-spk-dup';
      function renderDup() {
        const ds = mn.dupLabels(cfg.labelsNow());
        dup.textContent = ds.map(mn.dupText).join(' '); dup.hidden = !ds.length;
      }
      cfg.speakers.forEach(function (sp) {
        const no = sp.no, tr = el('tr'), r = rows[no] = {};
        const th = el('th', '', '참석자 ' + no); th.setAttribute('scope', 'row'); tr.appendChild(th);
        tr.appendChild(el('td', 'num', sp.count + '건'));
        const tf = el('td'), f = cfg.first ? cfg.first(no) : null;
        if (f) {
          if (f.time) { tf.appendChild(el('time', '', f.time)); tf.appendChild(root.document.createTextNode(' ')); }   // 원문을 받기 전(first_seq 만)에는 시각 없이 버튼만
          tf.appendChild(btn('발언 보기', { cls: 'link-btn', attrs: { 'aria-label': '참석자 ' + no + ' 첫 발언 보기' }, on: function () { cfg.jump(f, no); } }));
        }
        tr.appendChild(tf);
        const ts = el('td');
        const aff = selectOf('mn-lb-aff-' + no, '참석자 ' + no + ' 소속', [['', '소속 없음']].concat(rules.affiliations.map(function (x) { return [x, x]; })));
        const role = selectOf('mn-lb-role-' + no, '참석자 ' + no + ' 역할', [['', '역할 고르기']].concat(rules.roles.map(function (x) { return [x, x]; })));
        const ordOpts = [['', '번호 없음']];
        for (let k = 1; k <= (rules.max_ordinal | 0); k++) ordOpts.push([String(k), String(k)]);
        const ord = selectOf('mn-lb-ord-' + no, '참석자 ' + no + ' 번호', ordOpts);
        const pv = el('span', 'mn-meta mn-lb-pv'); pv.id = 'mn-lb-pv-' + no;
        const sync = function () {   // '측'은 소속이 있을 때만. 역할이 없으면 번호도 없다.
          const hasAff = !!aff.value;
          for (let i = 0; i < role.options.length; i++) { const op = role.options[i]; if (op.value && op.value === rules.side_role) op.disabled = !hasAff; }
          if (!hasAff && role.value === rules.side_role) role.value = '';
          if (!role.value) ord.value = '';
          ord.disabled = !role.value;
        };
        const showPv = function () {
          const l = mn.labelCompose(aff.value, role.value, ord.value);
          pv.textContent = l ? '→ ' + l : (aff.value || ord.value ? T.LBL_NEED_ROLE : T.LBL_NONE);
        };
        const setFrom = function (label) {
          const p = mn.labelParse(label, rules);
          aff.value = p.aff; role.value = p.role; ord.value = p.ord; sync(); showPv();
        };
        const st = el('td');
        const er = el('p', 'bd-m-ferr', ''); er.id = 'mn-lb-err-' + no; er.setAttribute('role', 'alert'); er.tabIndex = -1;
        const setErr = function (text) { er.textContent = text || ''; er.hidden = !text; };
        const refreshRow = function () {
          clear(st);
          if (cfg.changed(no)) {
            st.appendChild(badge('바꿈')); st.appendChild(root.document.createTextNode(' '));
            st.appendChild(btn('되돌리기', { cls: 'link-btn', id: 'mn-lb-rv-' + no, attrs: { 'aria-label': '참석자 ' + no + ' 이름표 되돌리기' }, on: function () {
              cfg.revert(no); setFrom(cfg.get(no)); setErr(''); refreshRow(); renderDup(); focusById('mn-lb-aff-' + no);
            } }));
          }
        };
        const commit = function () {
          sync(); showPv(); setErr('');
          if (!role.value && (aff.value || ord.value)) {   // 소속·번호만 고르고 역할이 비면 반영하지 않는다 — 이전 값을 두고 알린다(P3-3)
            const prev = cfg.get(no);
            setErr(T.LBL_PENDING + (prev ? '이전 이름표(' + prev + ')' : '이름표 없음') + ' 그대로입니다.');
            return;
          }
          const c = mn.labelCheck(mn.labelCompose(aff.value, role.value, ord.value), rules);
          if (!c.ok) { setErr(T.LBL_FORM); return; }
          cfg.set(no, c.value); refreshRow(); renderDup();
        };
        [aff, role, ord].forEach(function (s) { s.addEventListener('change', commit); ts.appendChild(s); ts.appendChild(root.document.createTextNode(' ')); });
        ts.appendChild(pv);
        tr.appendChild(ts); tr.appendChild(st);
        tb.appendChild(tr);
        const er2 = el('tr'), ec = el('td'); ec.colSpan = 5; ec.appendChild(er); er2.appendChild(ec); tb.appendChild(er2);
        r.setErr = setErr;
        setFrom(cfg.get(no)); refreshRow();
        if (cfg.locked) { aff.disabled = true; role.disabled = true; ord.disabled = true; }   // sync() 가 ord 를 풀 수 있어 setFrom 뒤에. 요청이 나가 있는 동안 막는다(P3-B)
        setErr(cfg.rowErrs && cfg.rowErrs[no]);
      });
      t.appendChild(tb); fs.appendChild(t); fs.appendChild(dup); renderDup();
      return { node: fs, rows: rows };
    }

    // ── 미리보기 고치기(저장 전, 로컬 상태만) ──
    function afterFix(u, msg) {
      drawFix(u);
      const sn = byId('mn-save-fix'); if (sn) { const t = fixSaveNote(u); sn.textContent = t; sn.hidden = !t; }
      syncUp();
      if (msg) say(msg);
    }
    function fixSaveNote(u) {
      const c = mn.fixCount(u.fix);
      return c.spk + c.utt > 0 ? '고친 내용(' + mn.fixSummary(c).replace('고친 내용: ', '') + ')이 함께 저장됩니다. 고친 발언에 직원 이름이 들어 있으면 저장할 때 가려집니다.' : '';
    }
    function drawFix(u, node) {
      const p = node || byId('mn-fix'); if (!p) return;
      clear(p); p.removeAttribute('role');
      const c = mn.fixCount(u.fix), n = c.spk + c.utt;
      if (!n) { u.revertAsk = false; p.textContent = T.FIX_NONE; if (u.fixNote) p.appendChild(el('span', '', ' ' + u.fixNote)); return; }
      if (u.revertAsk) {
        p.setAttribute('role', 'group'); p.setAttribute('aria-label', '모두 되돌리기 확인');
        p.appendChild(el('span', '', '고친 내용 ' + n + '건을 모두 되돌립니다.'));
        p.appendChild(btn('모두 되돌리기', { cls: 'bd-primary', id: 'mn-fix-rv-ok', on: function () { revertAll(u); } }));
        p.appendChild(btn('취소', { id: 'mn-fix-rv-no', on: function () { u.revertAsk = false; drawFix(u); focusById('mn-fix-rv'); } }));
        return;
      }
      p.appendChild(el('span', '', mn.fixSummary(c)));
      p.appendChild(btn('모두 되돌리기', { cls: 'link-btn', id: 'mn-fix-rv', on: function () { u.revertAsk = true; drawFix(u); focusById('mn-fix-rv-no'); } }));
      if (u.fixNote) p.appendChild(el('span', '', ' ' + u.fixNote));
    }
    function revertAll(u) {
      u.revertAsk = false;
      u.fix.labels = {};
      Object.keys(u.fix.utt).forEach(function (k) { const e = u.fix.utt[k]; e.text = e.orig; e.shown = e.orig; });
      replaceNode(byId('mn-spk-fs'), buildPvSpk(u));
      redrawPvList(u);
      const stale = !!u.pv && u.pvSig !== mn.signature(u);   // 되돌려 미리보기 때와 같아지면 [다시 미리보기]는 숨는다
      afterFix(u, stale ? T.FIX_REVERTED : T.FIX_REVERTED_SAME);
      focusById(stale ? 'mn-restale' : 'mn-fix');
    }
    function pvItemOf(u, seq) { return (u.pv.transcript || []).filter(function (x) { return x.seq_no === seq; })[0]; }
    function pvEdit(ctx, it, li) {
      const u = ctx.u, fe = ctx.fix.utt[it.seq_no];
      openEditor(u, 'utter', { seq_no: it.seq_no, text: fe ? fixText(fe) : it.text }, li, function () { return utterLi(it, ctx); },
        { base: mn.editBase(fe, it.text), apply: function (text) { return pvApply(ctx, it, text); } });
    }
    function pvApply(ctx, it, text) {
      const u = ctx.u, seq = it.seq_no;
      let fe = u.fix.utt[seq];
      if (text.trim() === (fe ? fixText(fe) : str(it.text)).trim()) return false;   // 서버처럼 앞뒤 공백은 같은 글로 본다
      if (!fe) fe = u.fix.utt[seq] = { orig: str(it.text), text: str(it.text), shown: str(it.text) };
      fe.text = text; fe.shown = text;
      afterFix(u, '발언을 고쳤습니다. 저장할 때 함께 저장됩니다.');
      return true;
    }
    function pvRevert(ctx, it, li) {
      const u = ctx.u, fe = u.fix.utt[it.seq_no];
      if (!fe) return;
      fe.text = fe.orig; fe.shown = fe.orig;
      replaceNode(byId(li.id || '') || li, utterLi(it, ctx));
      afterFix(u, '발언 ' + it.seq_no + '을 원래 글로 되돌렸습니다.');
      focusById('mn-ed-utter-' + it.seq_no);
    }
    function redrawPvList(u) {
      const w = byId('mn-pv-tr'); if (!w || !u.pv) return;
      const box = w.parentNode, top = box.scrollTop;
      u.editing = null; clear(w);
      w.appendChild(buildTrList(u.pv.transcript || [], u.pv, u.ctx, u.noiseOpen, function () { redrawPvList(u); }));
      box.scrollTop = top;
    }
    function updateSpkCells(u, no) {
      const w = byId('mn-pv-tr'); if (!w || !w.querySelectorAll) return;
      const lis = w.querySelectorAll('li[data-spk="' + Number(no) + '"]');
      for (let i = 0; i < lis.length; i++) {
        const old = lis[i].querySelector('.mn-spk');   // 고치는 중인 줄은 칸이 없다 — 닫을 때 새로 그린다
        if (old) lis[i].replaceChild(spkCell(Number(no), u.fix.labels[no] || '', ''), old);
      }
    }
    // 미리보기 상자 안에서 그 발언으로(상자만 스크롤한다). 잡음 묶음에 있으면 펼친다.
    function pvJump(u, seq, msg) {
      if (!u || !u.pv || !mn.uttId(seq)) return;
      const it = pvItemOf(u, seq);
      if (it && it.noise) { u.noiseOpen[it.seg_no == null ? 'x' : String(it.seg_no)] = true; redrawPvList(u); }
      const n = byId(mn.uttId(seq)), box = u.ctx && u.ctx.box;
      if (!n || !box) return;
      const old = box.querySelectorAll('.is-target');
      for (let i = 0; i < old.length; i++) old[i].className = old[i].className.replace(/\s*is-target/g, '');
      n.className += ' is-target';
      box.scrollTop += n.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 2;
      try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); }
      say(msg);
    }
    function buildPvSpk(u) {
      const d = u.pv, rules = d.speaker_label_rules;
      const speakers = (d.speakers || []).map(function (s) { return { no: s.speaker_no, count: s.utter_cnt | 0 }; });
      if (!isObj(rules) || !speakers.length) return el('div');
      const spk = buildSpkTable({
        rules: rules, speakers: speakers, rowErrs: u.rowErr && u.rowErr.spk, locked: mn.fixLocked(u),
        get: function (no) { return u.fix.labels[no] || ''; },
        changed: function (no) { return !!u.fix.labels[no]; },
        labelsNow: function () { return u.fix.labels; },
        first: function (no) { return mn.firstOf(d.transcript, no); },
        jump: function (f, no) { pvJump(u, f.seq, mn.firstMsg(no, f.time)); },
        revert: function (no) { delete u.fix.labels[no]; updateSpkCells(u, no); afterFix(u, '참석자 ' + no + ' 이름표를 지웠습니다.'); },
        set: function (no, label) {
          if (label) u.fix.labels[no] = label; else delete u.fix.labels[no];
          updateSpkCells(u, no);
          const sp = speakers.filter(function (x) { return x.no === no; })[0];
          afterFix(u, label ? '참석자 ' + no + '의 이름표를 ' + label + '(으)로 바꿨습니다. 발언 ' + (sp ? sp.count : 0) + '건.' : '참석자 ' + no + ' 이름표를 지웠습니다.');
        }
      });
      return spk.node;
    }

    // ── 상세: 저장 뒤 발화자 이름표 바꾸기(can_edit) ──
    function curLabel(cur, no) {
      const sp = (cur.data.speakers || []).filter(function (s) { return s.speaker_no === no; })[0];
      return sp ? str(sp.label) : '';
    }
    function toggleLbl(cur) {
      const b = byId('mn-lbl-open');
      if (cur.lbl && cur.lbl.busy) return;   // 저장 중에는 닫지 않는다
      if (cur.lbl) { cur.lbl = null; clear(cur.nodes.lbl); if (b) b.setAttribute('aria-expanded', 'false'); focusById('mn-lbl-open'); return; }
      cur.lbl = { draft: {}, rowErrs: {}, err: '', rev: false, busy: false };
      if (b) b.setAttribute('aria-expanded', 'true');
      drawLbl(cur);
      const first = (cur.data.speakers || [])[0], firstId = first ? 'mn-lb-aff-' + first.speaker_no : '';
      if (firstId) focusById(firstId);
      // 서버가 speakers[].first_seq 를 주면 원문은 [발언 보기]·[원문 펼치기]를 누를 때만 받는다(원문 받기는 감사에 '원문 열람'으로 남는다). 옛 서버(first_seq 없음)만 자동으로 받는다.
      const hasSeq = (cur.data.speakers || []).some(function (s) { return s && s.first_seq != null; });
      if (!hasSeq && cur.tr.status === 'idle') loadTranscript(cur, function () {   // 첫 발언 [발언 보기]에 원문이 필요하다
        if (!cur.lbl || cur.lbl.busy) return;
        const a = root.document.activeElement, aid = a && typeof a.id === 'string' ? a.id : '';
        const keep = aid.indexOf('mn-lb-') === 0 ? aid : '';   // 표 안에 있던 포커스는 같은 칸으로, 표를 막 그린 직후(포커스 잃음)면 첫 소속 칸으로
        const lost = !a || a === root.document.body;
        drawLbl(cur);
        if (keep && byId(keep)) focusById(keep); else if (lost && firstId) focusById(firstId);
      });
    }
    function drawLbl(cur) {
      const box = cur.nodes.lbl, lb = cur.lbl;
      if (!box) return;
      clear(box);
      const v = cur.data.viewer, rules = cur.data.speaker_label_rules;
      if (!lb || !(v.can_edit && cur.editOn) || !isObj(rules)) return;
      const speakers = (cur.data.speakers || []).map(function (s) { return { no: s.speaker_no, count: s.utter_cnt | 0 }; });
      const tbl = buildSpkTable({
        rules: rules, speakers: speakers, rowErrs: lb.rowErrs,
        get: function (no) { return Object.prototype.hasOwnProperty.call(lb.draft, no) ? lb.draft[no] : curLabel(cur, no); },
        changed: function (no) { return Object.prototype.hasOwnProperty.call(lb.draft, no); },
        labelsNow: function () { const m = {}; speakers.forEach(function (s) { m[s.no] = Object.prototype.hasOwnProperty.call(lb.draft, s.no) ? lb.draft[s.no] : curLabel(cur, s.no); }); return m; },
        first: function (no) { return mn.firstFor(cur.tr.items, cur.tr.status === 'ready', cur.data.speakers, no); },
        jump: function (f, no) {
          jumpUtter(cur, f.seq, function (it) { return mn.firstMsg(no, it && it.time); },
            cur.tr.status === 'ready' ? null : function () { if (cur.lbl && !cur.lbl.busy) drawLbl(cur); });   // 원문을 막 받았으면 표에 시각을 채운다(고르던 값은 draft 에서 복원)
        },
        revert: function (no) { delete lb.draft[no]; delete lb.rowErrs[no]; },
        set: function (no, label) { delete lb.rowErrs[no]; if (label === curLabel(cur, no)) delete lb.draft[no]; else lb.draft[no] = label; }
      });
      const fs = tbl.node;
      const er = errP(lb.err, 'mn-lbl-err'); er.className = 'wf-empty bd-err'; fs.appendChild(er);
      const acts = el('div', 'mn-edit-acts');
      const sv = btn('이름표 저장', { cls: 'bd-primary', id: 'mn-lbl-save' }), cx = btn('취소', { id: 'mn-lbl-cancel', on: function () { toggleLbl(cur); } });
      sv.addEventListener('click', function () { saveLabels(cur); });
      acts.appendChild(sv); acts.appendChild(cx);
      if (lb.rev) acts.appendChild(btn('새로 불러오기', { id: 'mn-lbl-reload', on: function () { cur.lbl = null; draw('mn-back'); loadDetail(cur); } }));   // 눌러 불러오면 고르던 초안은 버려진다(오류 문구가 그렇게 안내한다)
      fs.appendChild(acts);
      box.appendChild(fs);
      if (lb.busy) setLblBusy(cur, true);
    }
    // 저장 중에는 표의 select·버튼과 [고치기 끄기]·[발화자 이름표 바꾸기]를 막는다(저장 중 바꾼 값이 성공 처리로 지워지거나 오류가 사라지는 것을 막는다).
    function setLblBusy(cur, busy) {
      const box = cur.nodes && cur.nodes.lbl;
      if (busy && box && box.querySelectorAll) {   // 풀 때는 표를 새로 그리므로(ord 칸처럼 원래 꺼진 칸이 있다) 여기서 풀지 않는다
        const ns = box.querySelectorAll('select, button');
        for (let i = 0; i < ns.length; i++) ns[i].disabled = true;
      }
      ['mn-edit-toggle', 'mn-lbl-open'].forEach(function (id) { const n = byId(id); if (n) n.disabled = !!busy; });
      const sv = byId('mn-lbl-save'); if (sv) sv.textContent = busy ? '저장하는 중…' : '이름표 저장';
    }
    // 번호별로 한 건씩 보낸다(일괄 API 없음). 실패하면 거기서 멈추고 그 칸에 오류를 단다.
    function saveLabels(cur) {
      const lb = cur.lbl;
      if (!lb || lb.busy) return;
      const list = (cur.data.speakers || []).filter(function (s) { return Object.prototype.hasOwnProperty.call(lb.draft, s.speaker_no) && lb.draft[s.speaker_no] !== str(s.label); });
      if (!list.length) { say(T.NOCHANGE); return; }
      lb.busy = true; lb.err = ''; lb.rowErrs = {}; lb.rev = false;
      setLblBusy(cur, true);
      const ok = guard();
      let saved = 0;
      const done = [];   // 실제로 바뀌어 저장된 참석자 번호
      (function next(i) {
        if (i >= list.length) {
          cur.lbl = null; if (cur.nodes.lbl) clear(cur.nodes.lbl); drawTr(cur);
          setLblBusy(cur, false);
          const b = byId('mn-lbl-open'); if (b) b.setAttribute('aria-expanded', 'false');
          say('발화자 이름표를 저장했습니다(' + saved + '명).');
          focusById('mn-lbl-open');
          return;
        }
        const no = list[i].speaker_no, label = lb.draft[no];
        call('PUT', '/board-minutes/' + cur.id + '/speakers/' + no, mn.labelScreen(S.isAssignee), mn.BTN.LABEL, { label: label, rev_no: cur.data.rev_no }).then(function (r) {
          if (!ok() || S.cur !== cur) return;
          if (r.ok && isObj(r.body)) {
            if (typeof r.body.rev_no === 'number') cur.data.rev_no = r.body.rev_no;
            const nl = r.body.label == null ? '' : str(r.body.label);
            list[i].label = nl || null;
            (cur.tr.items || []).forEach(function (it) { if (mn.spkNo(it) === no) it.speaker_label = nl || null; });
            delete lb.draft[no];
            if (r.body.changed !== false) { saved++; done.push(no); }
            next(i + 1);
            return;
          }
          lb.busy = false;
          if (r.status === 404) { gone(); return; }
          const e = mn.errorText(r.status, r.detail, { action: 'label' });
          // 앞서 저장된 번호는 이미 서버에 반영됐다 — 알리고 원문 목록도 새 이름표로 다시 그린다
          lb.err = done.length ? '참석자 ' + done.join('·') + '는 저장했습니다. 참석자 ' + no + '부터는 저장하지 못했습니다: ' + e.text : e.text;
          if (e.field === 'label') lb.rowErrs[no] = e.text;
          lb.rev = isObj(r.detail) && r.detail.code === 'REV_CHANGED';
          if (done.length) drawTr(cur);
          drawLbl(cur);
          setLblBusy(cur, false);
          focusById('mn-lbl-err');
        });
      })(0);
    }

    // ── 삭제 ──
    function openConfirm(cur) { cur.confirm = true; drawConfirm(cur); focusById('mn-del-cancel'); }
    function closeConfirm(cur) { cur.confirm = false; clear(cur.nodes.del); focusById('mn-del-btn'); }
    function drawConfirm(cur) {
      const box = cur.nodes.del; clear(box);
      const row = el('div', 'bd-confirm'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', '회의록 삭제 확인');
      row.appendChild(el('span', '', T.DEL_CONFIRM));
      const ok = btn('삭제', { cls: 'bd-primary', id: 'mn-del-ok', on: function () { doDelete(cur, ok, no); } });
      const no = btn('취소', { id: 'mn-del-cancel', on: function () { closeConfirm(cur); } });
      row.appendChild(ok); row.appendChild(no);
      box.appendChild(row);
    }
    function doDelete(cur, okBtn, noBtn) {
      const ok = guard();
      okBtn.disabled = true; noBtn.disabled = true; okBtn.textContent = '삭제하는 중…';
      call('POST', '/board-minutes/' + cur.id + '/delete', scr(), mn.BTN.DELETE, { rev_no: cur.data.rev_no }).then(function (r) {
        if (!ok() || S.cur !== cur) return;
        if (r.ok) {
          S.cur = null; S.view = 'list';
          say('회의록을 삭제했습니다.');
          reloadList(true);
          return;
        }
        okBtn.disabled = false; noBtn.disabled = false; okBtn.textContent = '삭제';
        handleErr(cur, r, { action: 'delete' });
      });
    }

    // ── 공개범위 ──
    function toggleScope(cur) {
      cur.scopeOpen = !cur.scopeOpen;
      const b = byId('mn-scope-btn'); if (b) b.setAttribute('aria-expanded', cur.scopeOpen ? 'true' : 'false');
      if (!cur.scopeOpen) { clear(cur.nodes.scope); focusById('mn-scope-btn'); return; }
      cur.scope = { status: 'loading', rows: [], cands: [], candsTruncated: false, max: mn.SCOPE_MAX, candsFail: false, err: '', until: mn.addDays(mn.today(), mn.SCOPE_DEFAULT_DAYS), emp: '' };
      drawScope(cur);
      return loadScope(cur);
    }
    // 공개범위 목록과(수정 권한이 있으면) 후보 목록을 함께 받는다. 후보는 서버가 영업부서·임원급만 거른다.
    function loadScope(cur) {
      const ok = guard(), canEdit = cur.data.viewer.can_scope_edit === true;
      return Promise.all([
        call('GET', '/board-minutes/' + cur.id + '/scope', scr(), mn.BTN.SCOPE_OPEN),
        canEdit ? call('GET', '/board-minutes/' + cur.id + '/scope/candidates', scr(), mn.BTN.SCOPE_OPEN) : Promise.resolve(null)
      ]).then(function (rs) {
        if (!ok() || S.cur !== cur || !cur.scopeOpen) return;
        const a = rs[0], c = rs[1];
        if (a.status === 404) { gone(); return; }
        if (a.ok && Array.isArray(a.body)) { cur.scope.status = 'ready'; cur.scope.rows = a.body; }
        else { cur.scope.status = 'error'; cur.scope.err = mn.errorText(a.status, a.detail, { action: 'scope' }).text; }
        if (c) {
          const sc = c.ok ? mn.scopeCands(c.body) : null;
          if (sc) { cur.scope.cands = sc.items; cur.scope.candsTruncated = sc.truncated; cur.scope.max = sc.max; }
          else cur.scope.candsFail = true;
        }
        drawScope(cur);
      });
    }
    function reloadScope(cur, focusId) {
      const ok = guard();
      call('GET', '/board-minutes/' + cur.id + '/scope', scr(), mn.BTN.SCOPE_OPEN).then(function (a) {
        if (!ok() || S.cur !== cur || !cur.scopeOpen) return;
        if (a.status === 404) { gone(); return; }
        if (a.ok && Array.isArray(a.body)) { cur.scope.status = 'ready'; cur.scope.rows = a.body; }
        drawScope(cur);
        if (typeof focusId === 'function') focusId(); else focusById(focusId);
      });
    }
    function drawScope(cur) {
      const box = cur.nodes.scope, sc = cur.scope;
      if (!box) return;
      clear(box);
      if (!cur.scopeOpen || !sc) return;
      const canEdit = cur.data.viewer.can_scope_edit === true;
      const fs = el('fieldset', 'tm-fs'); fs.id = 'mn-scope';
      fs.appendChild(el('legend', '', '공개범위'));
      fs.appendChild(el('p', 'mn-meta', T.SCOPE_HEAD));
      if (!canEdit) fs.appendChild(el('p', 'mn-meta', T.SCOPE_RO));
      if (sc.status === 'loading') fs.appendChild(statusP('불러오는 중…'));
      else if (sc.status === 'error') { fs.appendChild(errP(sc.err, 'mn-sc-load-err')); fs.lastChild.hidden = false; }
      else if (!sc.rows.length) fs.appendChild(el('p', 'wf-empty', T.SCOPE_EMPTY));
      else {
        const t = el('table', 'ad-table');
        t.appendChild(el('caption', 'bd-sr', '추가로 공개한 사람 ' + sc.rows.length + '명'));
        const hr = el('tr');
        ['이름', '사번', '기한', '상태'].concat(canEdit ? ['빼기'] : []).forEach(function (h) { const th = el('th', '', h); th.setAttribute('scope', 'col'); hr.appendChild(th); });
        const th = el('thead'); th.appendChild(hr); t.appendChild(th);
        const tb = el('tbody');
        sc.rows.forEach(function (row, i) {
          const tr = el('tr');
          tr.appendChild(el('td', '', row.name));
          tr.appendChild(el('td', 'mono', row.emp_no));
          tr.appendChild(el('td', 'mono', row.grant_until));
          const stt = el('td');
          if (row.expired) stt.appendChild(badge('기한 지남'));
          else if (row.active === false) stt.appendChild(badge('사용 정지'));
          tr.appendChild(stt);
          if (canEdit) {
            const td = el('td');
            td.appendChild(btn('빼기', { cls: 'link-btn', id: 'mn-sc-rm-' + i, attrs: { 'aria-label': str(row.name) + ' 공개 빼기' }, on: function () { removeScope(cur, row, i); } }));
            tr.appendChild(td);
          }
          tb.appendChild(tr);
        });
        t.appendChild(tb); fs.appendChild(t);
      }
      if (canEdit && sc.status !== 'loading') {
        const fullNote = mn.scopeNote(sc.rows.length, sc.max);   // 30명이어도 막지 않는다 — 기한 변경은 허용, 새 사람은 서버 SCOPE_CAP 이 거절
        const add = el('div', 'mn-slot');
        add.style.display = 'grid'; add.style.gridTemplateColumns = 'minmax(0,1fr)';   // 클래스에 기대지 않는다
        const sel = el('select'); sel.id = 'mn-sc-sel';
        sel.appendChild(el('option', '', '공개할 사람 고르기')).value = '';
        sc.cands.forEach(function (p) { sel.appendChild(el('option', '', mn.candLabel(p))).value = str(p.emp_no); });
        const selLab = el('label', '', '사람 고르기'); selLab.htmlFor = 'mn-sc-sel';
        const emp = el('input'); emp.type = 'text'; emp.id = 'mn-sc-emp'; emp.maxLength = 10; emp.value = sc.emp;
        const empLab = el('label', '', '목록에 없는 사람: 사번 직접 입력'); empLab.htmlFor = 'mn-sc-emp';
        const until = el('input'); until.type = 'date'; until.id = 'mn-sc-until'; until.value = sc.until; until.min = mn.today(); until.max = mn.addDays(mn.today(), mn.SCOPE_DAYS);
        const unLab = el('label', '', '공개 기한'); unLab.htmlFor = 'mn-sc-until';
        const err = el('p', 'bd-m-ferr'); err.id = 'mn-sc-err'; err.setAttribute('role', 'alert'); err.tabIndex = -1; err.hidden = true;
        const go = btn('추가', { id: 'mn-sc-add', on: function () { addScope(cur, sel, emp, until, err, go); } });
        emp.addEventListener('input', function () { sc.emp = emp.value; });
        until.addEventListener('input', function () { sc.until = until.value; });
        let note = null;
        if (sc.candsFail) note = el('p', 'wf-empty', T.SCOPE_CANDS_FAIL);
        else if (sc.candsTruncated) note = el('p', 'wf-empty', T.SCOPE_CANDS_MORE);
        if (note) {   // 상자로 바로 들어간 키보드 사용자도 안내를 듣게 잇는다
          note.id = 'mn-sc-note';
          add.appendChild(note);
          sel.setAttribute('aria-describedby', 'mn-sc-note');
          emp.setAttribute('aria-describedby', 'mn-sc-note');
        }
        [selLab, sel, empLab, emp, unLab, until, go, err].forEach(function (n) { add.appendChild(n); });
        if (fullNote) add.appendChild(el('p', 'wf-empty', fullNote));
        fs.appendChild(add);
      }
      box.appendChild(fs);
    }
    function addScope(cur, sel, emp, until, err, go) {
      const typed = emp.value.trim(), who = typed || sel.value;
      err.hidden = true; err.textContent = '';
      if (!who) { err.textContent = T.SCOPE_PICK; err.hidden = false; err.focus(); return; }
      if (!mn.validDate(until.value)) { err.textContent = mn.errorText(400, { code: 'GRANT_UNTIL_INVALID' }).text; err.hidden = false; err.focus(); return; }
      const ok = guard(), day = until.value;
      go.disabled = true;
      call('POST', '/board-minutes/' + cur.id + '/scope/add', scr(), mn.BTN.SCOPE_ADD, { emp_no: who, grant_until: day }).then(function (r) {
        if (!ok() || S.cur !== cur) return;
        if (!r.ok) {
          go.disabled = false;
          if (r.status === 404) { gone(); return; }
          err.textContent = mn.errorText(r.status, r.detail, { action: 'scope' }).text; err.hidden = false; err.focus();
          return;
        }
        const b = isObj(r.body) ? r.body : {};
        if (b.reason === 'ALREADY_DEFAULT') say('영업팀장·영업부장은 처음부터 볼 수 있어 추가하지 않았습니다.');
        else if (b.changed === false) say('이미 같은 기한으로 공개되어 있습니다.');
        else if (b.event === 'SCOPE_EXTEND') say('기한을 ' + day + '로 바꿨습니다.');
        else say('공개범위에 추가했습니다.');
        cur.scope.emp = '';
        reloadScope(cur, 'mn-sc-sel');
      });
    }
    function removeScope(cur, row, i) {
      const ok = guard(), b = byId('mn-sc-rm-' + i);
      if (b) b.disabled = true;
      call('POST', '/board-minutes/' + cur.id + '/scope/remove', scr(), mn.BTN.SCOPE_REMOVE, { emp_no: row.emp_no }).then(function (r) {
        if (!ok() || S.cur !== cur) return;
        if (!r.ok) { if (b) b.disabled = false; handleErr(cur, r, { action: 'scope' }); return; }
        say(str(row.name) + ' 공개를 거뒀습니다.');
        reloadScope(cur, function () { focusById(byId('mn-sc-rm-' + i) ? 'mn-sc-rm-' + i : 'mn-sc-sel'); });   // 다음 행의 [빼기], 없으면 추가 칸
      });
    }

    // ── 변경 이력 ──
    function toggleHist(cur) {
      cur.histOpen = !cur.histOpen;
      const b = byId('mn-hist-btn'); if (b) b.setAttribute('aria-expanded', cur.histOpen ? 'true' : 'false');
      if (!cur.histOpen) { clear(cur.nodes.hist); focusById('mn-hist-btn'); return; }
      cur.hist = { status: 'loading', logs: [], revs: [], err: '' };
      drawHist(cur);
      const ok = guard();
      call('GET', '/board-minutes/' + cur.id + '/history', scr(), mn.BTN.HISTORY).then(function (r) {
        if (!ok() || S.cur !== cur || !cur.histOpen) return;
        if (r.status === 404) { gone(); return; }
        if (r.ok && isObj(r.body)) { cur.hist.status = 'ready'; cur.hist.logs = r.body.logs || []; cur.hist.revs = r.body.revs || []; }
        else { cur.hist.status = 'error'; cur.hist.err = mn.errorText(r.status, r.detail, { action: 'history' }).text; }
        drawHist(cur);
      });
    }
    function targetText(kind, no) { return mn.targetText(kind, no); }
    function drawHist(cur) {
      const box = cur.nodes.hist, h = cur.hist;
      if (!box) return;
      clear(box);
      if (!cur.histOpen || !h) return;
      const sec = el('section', 'mn-card'); sec.id = 'mn-hist';
      sec.appendChild(el('h4', '', '변경 이력'));
      if (h.status === 'loading') sec.appendChild(statusP('불러오는 중…'));
      else if (h.status === 'error') { sec.appendChild(errP(h.err, 'mn-hist-err')); sec.lastChild.hidden = false; }
      else if (!h.logs.length) sec.appendChild(el('p', 'wf-empty', '변경 이력이 없습니다.'));
      else {
        const ul = el('ul');
        h.logs.forEach(function (l) {
          const li = el('li');
          li.appendChild(el('span', '', mn.histText(l)));
          li.appendChild(root.document.createTextNode(' '));
          li.appendChild(el('span', '', str(l.actor_name)));
          li.appendChild(root.document.createTextNode(' '));
          li.appendChild(el('time', '', mn.kst(l.at)));
          ul.appendChild(li);
        });
        sec.appendChild(ul);
        if (h.revs.length) {
          sec.appendChild(el('h4', '', '고친 내용'));
          h.revs.forEach(function (rv) {
            const d = el('div');
            d.appendChild(el('p', 'mn-meta', (mn.histTitle(rv.target_kind, rv.target_no, '') || targetText(rv.target_kind, rv.target_no)) + ' ' +str(rv.edited_by_name) + ' ' + mn.kst(rv.edited_at)));
            [['고치기 전', rv.old_text], ['고친 뒤', rv.new_text]].forEach(function (x, xi) {
              if (x[1] == null) {
                if (xi === 1 && rv.target_kind === 'SPEAKER') { const q = el('p'); q.appendChild(el('b', '', '고친 뒤: ')); q.appendChild(el('span', '', '(이름표 지움)')); d.appendChild(q); }   // 이름표를 지운 기록
                return;
              }
              const p = el('p'); p.appendChild(el('b', '', x[0] + ' ')); mn.textNodes(p, x[1]); d.appendChild(p);
            });
            sec.appendChild(d);
          });
        }
      }
      box.appendChild(sec);
    }

    // ── 올리기 ──
    function openUpload() {
      if (!S || !S.list.canUpload) return;
      S.view = 'upload'; S.up = newUp(); S.cur = null; S.notice = '';
      draw('mn-up-h');
    }
    // 고친 내용이 있으면 한 번 더 묻는다(확인 없이 사라지지 않게). force=true 면 바로 취소.
    function cancelUpload(force) {
      if (!S.up || S.up.busy === 'save') return;
      const c = mn.fixCount(S.up.fix);
      if (force !== true && c.spk + c.utt > 0) { S.up.cancelAsk = true; draw('mn-up-cancel-keep'); return; }
      S.up = null; S.view = 'list'; draw('mn-up-open'); focusById('mn-up-open2');
    }
    function ctrlId(u, k) {
      if (k === 'meeting_date') return 'mn-date';
      if (k === 'title') return 'mn-title-in';
      if (k === 'terms') return 'mn-terms';
      return (u.src[k] === 'paste' ? 'mn-p-' : 'mn-f-') + k;
    }
    function clearFieldErr(u, k) {
      if (!u.errs[k]) return;
      delete u.errs[k];
      const p = byId('mn-err-' + k), c = byId(ctrlId(u, k));
      if (p) { p.textContent = ''; p.hidden = true; }
      if (c) { c.removeAttribute('aria-invalid'); c.removeAttribute('aria-describedby'); }
    }
    // 입력이 바뀔 때마다: 미리보기 뒤에 바뀌었으면 안내를 띄우고 [저장]을 끈다
    function syncUp() {
      const u = S && S.up;
      if (!u) return;
      const stale = !!u.pv && u.pvSig !== mn.signature(u);
      const sn = byId('mn-stale'); if (sn) sn.hidden = !stale;
      const sv = byId('mn-save'), why = byId('mn-save-why');
      const can = !!u.pv && !stale && u.ack && !u.busy;
      if (sv) sv.disabled = !can;
      if (why) why.hidden = can;
    }
    function row(labText, labFor, ctrl, k, u, extra, pre) {
      const g = el('div', 'mn-slot');
      const lab = el('label', '', labText); if (labFor) lab.htmlFor = labFor;
      g.appendChild(lab);
      const c = el('div');
      if (pre) c.appendChild(pre);
      c.appendChild(ctrl);
      if (extra) c.appendChild(extra);
      const fe = el('p', 'bd-m-ferr', u.errs[k] || ''); fe.id = 'mn-err-' + k; fe.hidden = !u.errs[k];
      if (u.errs[k] && ctrl.setAttribute) { ctrl.setAttribute('aria-invalid', 'true'); ctrl.setAttribute('aria-describedby', fe.id); }
      c.appendChild(fe);
      g.appendChild(c);
      return g;
    }
    function buildUpload(r, u) {
      const wrap = el('div', 'mn-up');
      u.editing = null;   // 다시 그리면 열려 있던 편집 줄은 사라진다
      const tools = el('div', 'mn-tools'), cx = btn('취소', { id: 'mn-up-cancel', on: function () { cancelUpload(); } });
      cx.disabled = u.busy === 'save';   // 저장 요청이 나가 있는 동안은 취소할 수 없다
      tools.appendChild(cx);
      wrap.appendChild(head('회의록 올리기', 'mn-up-h', tools));
      const upIntro = el('p', 'wf-empty', T.UP_INTRO); upIntro.id = 'mn-up-intro'; wrap.appendChild(upIntro);
      if (u.cancelAsk) {
        const cf = mn.fixCount(u.fix), row = el('div', 'bd-confirm'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', '올리기 취소 확인');
        row.appendChild(el('span', '', '고친 내용 ' + (cf.spk + cf.utt) + '건이 사라집니다. 올리기를 취소할까요?'));
        row.appendChild(btn('올리기 취소', { id: 'mn-up-cancel-ok', on: function () { cancelUpload(true); } }));
        row.appendChild(btn('계속 고치기', { cls: 'bd-primary', id: 'mn-up-cancel-keep', on: function () { u.cancelAsk = false; draw('mn-up-cancel'); } }));
        wrap.appendChild(row);
      }
      wrap.appendChild(buildMark());
      const box = errP(u.errs.box || '', 'mn-err');
      wrap.appendChild(box);
      if (u.dupId) wrap.appendChild(btn('그 회의록 열기', { id: 'mn-dup-open', on: function () { openDetail(u.dupId); } }));
      const fs = el('fieldset', 'tm-fs'); fs.id = 'mn-up-fs'; fs.tabIndex = -1; fs.setAttribute('aria-busy', u.busy ? 'true' : 'false');   // 진행 중 포커스를 둘 곳
      fs.appendChild(el('legend', '', '① 파일 고르기'));
      const today = mn.today();
      const date = el('input'); date.type = 'date'; date.id = 'mn-date'; date.min = '2000-01-01'; date.max = today; date.value = u.date;
      date.addEventListener('input', function () { u.date = date.value; clearFieldErr(u, 'meeting_date'); syncUp(); });
      fs.appendChild(row('회의일*', 'mn-date', date, 'meeting_date', u));
      const ti = el('input'); ti.type = 'text'; ti.id = 'mn-title-in'; ti.maxLength = mn.TITLE_MAX; ti.value = u.title;
      ti.addEventListener('input', function () { u.title = ti.value; clearFieldErr(u, 'title'); syncUp(); });
      fs.appendChild(row('제목*', 'mn-title-in', ti, 'title', u));
      SLOTS.forEach(function (k) { fs.appendChild(slotRow(u, k)); });
      const tx = el('textarea'); tx.id = 'mn-terms'; tx.value = u.terms; tx.setAttribute('aria-describedby', 'mn-terms-hint');
      const cnt = el('span', 'mn-meta', mn.parseTerms(u.terms).list.length + '/' + mn.TERMS_MAX); cnt.id = 'mn-terms-cnt';
      tx.addEventListener('input', function () { u.terms = tx.value; cnt.textContent = mn.parseTerms(u.terms).list.length + '/' + mn.TERMS_MAX; clearFieldErr(u, 'terms'); syncUp(); });
      const hint = el('p', 'wf-empty', T.TERMS_HINT); hint.id = 'mn-terms-hint';
      const ex = el('div'); ex.appendChild(cnt); ex.appendChild(hint);
      fs.appendChild(row('추가로 가릴 단어', 'mn-terms', tx, 'terms', u, ex));
      const pv = btn(u.busy === 'preview' ? '미리보기 만드는 중…' : '미리보기', { cls: 'bd-primary', id: 'mn-preview', on: doPreview });
      pv.disabled = !!u.busy;
      fs.appendChild(pv);
      wrap.appendChild(fs);
      if (u.pv) { wrap.appendChild(buildPreview(u)); wrap.appendChild(buildSave(u)); }
      else wrap.appendChild(previewErr(u));   // ② 자리: 미리보기가 없을 때도 오류가 보이게
      r.appendChild(wrap);
    }
    function slotRow(u, k) {
      const req = k === 'transcript';
      const src = el('div', 'mn-src'); src.setAttribute('role', 'radiogroup'); src.setAttribute('aria-label', mn.SLOT[k] + ' 입력 방식');
      [['file', '파일'], ['paste', '붙여넣기']].forEach(function (m) {
        const on = u.src[k] === m[0], l = el('label', on ? 'on' : ''), i = el('input');
        i.type = 'radio'; i.name = 'mn-src-' + k; i.value = m[0]; i.id = 'mn-r-' + k + '-' + m[0]; i.checked = on;
        i.addEventListener('change', function () { if (!i.checked) return; u.src[k] = m[0]; delete u.errs[k]; syncUp(); draw('mn-r-' + k + '-' + m[0]); });
        l.appendChild(i); l.appendChild(el('span', '', m[1])); src.appendChild(l);
      });
      let ctrl, extra = null;
      const pre = el('div');
      pre.appendChild(src);
      if (!req) pre.appendChild(el('span', 'wf-empty', ' 없어도 됩니다'));
      if (u.src[k] === 'paste') {
        ctrl = el('textarea'); ctrl.id = 'mn-p-' + k; ctrl.value = u.paste[k] || '';
        ctrl.addEventListener('input', function () { u.paste[k] = ctrl.value; clearFieldErr(u, k); syncUp(); });
      } else {
        ctrl = el('input'); ctrl.type = 'file'; ctrl.id = 'mn-f-' + k; ctrl.accept = '.txt,text/plain';
        ctrl.setAttribute('aria-label', mn.SLOT[k] + ' 파일 고르기');
        const f = u.files[k];
        const chosen = el('span', 'mn-meta', f ? '선택: ' + f.name + ' ' + sizeText(f.size) : '선택한 파일이 없습니다.'); chosen.id = 'mn-chosen-' + k;
        ctrl.addEventListener('change', function () {
          u.files[k] = ctrl.files && ctrl.files[0] ? ctrl.files[0] : null;
          const nf = u.files[k];
          chosen.textContent = nf ? '선택: ' + nf.name + ' ' + sizeText(nf.size) : '선택한 파일이 없습니다.';
          clearFieldErr(u, k); syncUp();
        });
        extra = chosen;
      }
      return row(mn.SLOT[k] + (req ? '*' : ''), ctrl.id, ctrl, k, u, extra, pre);
    }
    function failUpload(u, r, action) {
      const e = mn.errorText(r.status, r.detail, { action: 'upload' });
      u.errs = {}; u.dupId = ''; u.rowErr = null;
      if (e.field === 'edit' || e.field === 'label') {   // 고친 내용 때문에 거절: ② 위쪽에 알리고 그 번호·발언 줄에도 단다
        const dd = isObj(r.detail) ? r.detail : {}, tno = Number(dd.target_no) > 0 ? Number(dd.target_no) : 0;
        u.rowErr = { spk: {}, utt: {} };
        if (tno && e.field === 'label') u.rowErr.spk[tno] = e.text;
        else if (tno) u.rowErr.utt[tno] = e.text;
        e.field = 'preview'; e.text = tno ? T.FIX_ROW_FAIL + ' ' + e.text : e.text;
      }
      u.errs[e.field] = e.text;
      if (isObj(r.detail) && r.detail.code === 'ALREADY_UPLOADED' && /^\d{1,18}$/.test(str(r.detail.minutes_id))) u.dupId = str(r.detail.minutes_id);
      const fx = mn.failEffects(r.detail);
      if (fx.resetSig) u.pvSig = '';
      if (fx.clearRelease) u.release = {};   // 가리지 않기로 고른 말을 풀어 다시 미리보기를 할 수 있게 한다
      const fid = e.field === 'box' ? 'mn-err' : e.field === 'preview' ? 'mn-err-preview' : e.field === 'save' ? 'mn-err-save' : ctrlId(u, e.field);
      draw(fid);
    }
    function doPreview() {
      const u = S && S.up;
      if (!u || u.busy) return;
      const v = mn.validateUpload(formView(u), mn.today());
      u.errs = {}; u.dupId = '';
      if (!v.ok) {
        u.errs = v.errs;
        const k = FIELD_ORDER.filter(function (x) { return v.errs[x]; })[0];
        draw(ctrlId(u, k));
        return;
      }
      u.release = mn.pruneRelease(u.release, u.cands);   // 후보에 없는 해제 선택은 보내지 않는다(서버가 거부)
      // 원문 칸 파일이 직전 미리보기 때와 다르면 고친 발언을 모두 버린다(구간·요약 칸만 바뀌면 유지) — 보내면 서버가 새 파일의 같은 번호 줄에 붙인다(P2-1). 이름표는 응답에 그 번호가 있으면 유지.
      const fsig = mn.fileSig(u);
      u.fixNote = '';
      let droppedNow = 0;
      if (u.pvFileSig && u.pvFileSig !== fsig) {
        const dr = mn.dropEdited(u.fix);
        if (dr.dropped > 0) { u.fix = dr.fix; droppedNow = dr.dropped; u.fixNote = mn.fixDroppedText(dr.dropped); say(u.fixNote); }
      }
      u.busy = 'preview';
      draw('mn-up-fs');   // 버튼이 꺼지므로 포커스는 묶음으로
      const ok = guard();
      // 요청에 싣는 입력의 표식과 고친 발언을 지금 잡아 둔다. 응답 때 다시 계산하면 요청 중에 바꾼 것이 '미리보기 때 입력'으로 둔갑한다(P2-2).
      const sig = mn.signature(u), ep = mn.editsPayload(u.fix), sent = {};
      if (ep) ep.utter_edits.forEach(function (x) { sent[x.seq_no] = x.text; });
      call('POST', '/board-materials/' + S.mid + '/minutes/preview', mn.UI.UPLOAD, mn.BTN.PREVIEW, mn.buildForm(u, v.terms, ''), true).then(function (r) {
        if (!ok() || S.up !== u) return;
        u.busy = '';
        if (r.ok && isObj(r.body) && isObj(r.body.stats) && typeof r.body.preview_digest === 'string') {
          u.pv = r.body; u.ack = false;
          const old = u.cands, next = {};
          (r.body.name_candidates || []).forEach(function (c) { if (c && c.term != null) next[str(c.term)] = c.hits; });
          Object.keys(old).forEach(function (t) { if (u.release[t] && !(t in next)) next[t] = old[t]; });   // 이미 가리지 않기로 고른 말은 응답에 없어도 풀 수 있게 남긴다
          u.cands = next;
          u.editsDigest = typeof r.body.edits_digest === 'string' && r.body.edits_digest ? r.body.edits_digest : null;   // 저장 때 options.edits_digest 로 그대로
          u.rowErr = null; u.noiseOpen = {};
          const mg = mn.mergeFix(u.fix, r.body, { sent: sent });   // 서버가 가린 결과를 화면 글로 — 요청 뒤에 바꾼 줄은 덮지 않는다
          u.fix = mg.fix;
          u.pvSig = sig; u.pvFileSig = fsig;   // 요청 시점 표식 — 응답 전에 바꾼 입력은 stale 로 남는다
          if (live()) draw('mn-pv-h');
          if (mg.droppedUtt + mg.droppedSpk > 0) say('원문이 바뀌어 고친 내용 ' + (mg.droppedUtt + mg.droppedSpk) + '건을 지웠습니다.');
        } else {
          if (!(mn.isEditFail(r.detail) && u.pv && !droppedNow)) u.pv = null;   // (원문이 바뀌어 발언을 버린 뒤라면 옛 미리보기를 두지 않는다) 고친 내용 때문에 거절되면 지금 미리보기를 두고 그 자리에 오류를 단다
          failUpload(u, r.ok ? { status: 400, detail: { code: 'BAD_REQUEST' } } : r, 'preview');
        }
      });
    }
    function previewErr(u) {
      const pe = el('p', 'bd-m-ferr', u.errs.preview || ''); pe.id = 'mn-err-preview'; pe.setAttribute('role', 'alert'); pe.tabIndex = -1; pe.hidden = !u.errs.preview;
      return pe;
    }
    function buildPreview(u) {
      const d = u.pv, sec = el('section', 'mn-pv');
      u.editing = null;
      const h = el('h4', '', '② 미리보기 확인·고치기'); h.id = 'mn-pv-h'; h.tabIndex = -1; sec.appendChild(h);
      const stale = el('p', 'mn-stale'); stale.id = 'mn-stale'; stale.hidden = u.pvSig === mn.signature(u);
      stale.appendChild(root.document.createTextNode('내용이 바뀌었습니다. '));
      stale.appendChild(btn('다시 미리보기', { id: 'mn-restale', on: doPreview }));
      sec.appendChild(stale);
      const st = d.stats, meta = el('div', 'mn-meta');
      [['발언 ' + (st.utter_cnt | 0) + '건'], ['참석자 ' + (st.speaker_cnt | 0) + '명'], [mn.dur(st.duration_sec)], ['구간 ' + (st.seg_cnt | 0) + '개'], ['요약 항목 ' + (st.item_cnt | 0) + '개']]
        .forEach(function (x) { meta.appendChild(el('span', '', x[0])); });
      sec.appendChild(meta);
      sec.appendChild(el('p', '', mn.maskedText(d.masked)));
      const ws = (d.warnings || []).map(function (w) { return mn.warningText(w.code, w.count); }).filter(Boolean);
      if (ws.length) { const ul = el('ul'); ws.forEach(function (t) { ul.appendChild(el('li', '', t)); }); sec.appendChild(ul); }
      const terms = Object.keys(u.cands);
      if (terms.length) {
        const c = el('div', 'mn-card'); c.appendChild(el('h4', '', '직원 이름과 같아 가린 말'));
        const ul = el('ul', 'mn-todo');
        terms.forEach(function (t, i) {
          const li = el('li'), lab = el('label'), cb = el('input');
          cb.type = 'checkbox'; cb.id = 'mn-rel-' + i; cb.checked = !!u.release[t];
          cb.addEventListener('change', function () { u.release[t] = cb.checked; clearFieldErr(u, 'preview'); syncUp(); });
          lab.appendChild(cb);
          lab.appendChild(el('span', '', t + ' ' + (u.cands[t] != null ? u.cands[t] + '곳 ' : '') + '가리지 않기'));
          li.appendChild(lab); ul.appendChild(li);
        });
        c.appendChild(ul); sec.appendChild(c);
      }
      sec.appendChild(previewErr(u));
      const fixP = el('p', 'mn-fix'); fixP.id = 'mn-fix'; fixP.tabIndex = -1; sec.appendChild(fixP);   // 모두 되돌린 뒤 포커스를 받는다
      sec.appendChild(buildPvSpk(u));
      const bx = el('div', 'mn-pvbox'); bx.setAttribute('role', 'region'); bx.setAttribute('aria-label', '미리보기 원문'); bx.tabIndex = 0;
      // canEdit 는 요약 항목용(미리보기에서는 끈다). 발언 고치기는 fix 가 있을 때 utterLi 가 따로 켠다.
      const ctx = u.ctx = { mode: 'preview', cur: null, canEdit: false, canCheck: false, fix: u.fix, u: u, box: bx };
      buildContent(bx, d, ctx);
      bx.appendChild(el('h4', '', '원문'));
      const tw = el('div'); tw.id = 'mn-pv-tr';
      tw.appendChild(buildTrList(d.transcript || [], d, ctx, u.noiseOpen, function () { redrawPvList(u); }));
      bx.appendChild(tw);
      sec.appendChild(bx);
      drawFix(u, fixP);
      return sec;
    }
    function buildSave(u) {
      const sec = el('section', 'mn-save');
      sec.appendChild(el('h4', '', '③ 저장'));
      const fnote = fixSaveNote(u), fp = el('p', 'wf-empty', fnote); fp.id = 'mn-save-fix'; fp.hidden = !fnote; sec.appendChild(fp);
      const ul =el('ul', 'mn-rules'); ul.style.listStyle = 'none'; ul.style.paddingLeft = '12px';
      T.RULES.forEach(function (t) { ul.appendChild(el('li', '', t)); });
      sec.appendChild(ul);
      const lab = el('label', 'mn-ack'), cb = el('input'); cb.type = 'checkbox'; cb.id = 'mn-ack'; cb.checked = u.ack;
      cb.addEventListener('change', function () { u.ack = cb.checked; syncUp(); });
      lab.appendChild(cb); lab.appendChild(el('span', '', T.ACK)); sec.appendChild(lab);
      const se = el('p', 'bd-m-ferr', u.errs.save || ''); se.id = 'mn-err-save'; se.setAttribute('role', 'alert'); se.tabIndex = -1; se.hidden = !u.errs.save;
      sec.appendChild(se);
      const sv = btn(u.busy === 'save' ? '저장하는 중…' : '저장', { cls: 'bd-primary', id: 'mn-save', attrs: { 'aria-describedby': 'mn-save-why' }, on: doSave });
      const why = el('span', 'wf-empty', ' ' + T.SAVE_WHY); why.id = 'mn-save-why';
      sec.appendChild(sv); sec.appendChild(why);
      const can = !!u.pv && u.pvSig === mn.signature(u) && u.ack && !u.busy;
      sv.disabled = !can; why.hidden = can;
      return sec;
    }
    function doSave() {
      const u = S && S.up;
      if (!u || !u.pv || u.busy || !u.ack || u.pvSig !== mn.signature(u)) return;
      const v = mn.validateUpload(formView(u), mn.today());
      if (!v.ok) { u.errs = v.errs; draw('mn-preview'); return; }
      u.busy = 'save'; u.errs = {}; u.dupId = '';
      draw('mn-up-fs');   // 저장·취소 버튼이 꺼지므로 포커스는 묶음으로
      const ok = guard(), s = S;
      call('POST', '/board-materials/' + S.mid + '/minutes', mn.UI.UPLOAD, mn.BTN.UPLOAD, mn.buildForm(u, v.terms, u.pv.preview_digest), true).then(function (r) {
        if (!ok() || S.up !== u) return;
        u.busy = '';
        const id = isObj(r.body) ? r.body.minutes_id : null;
        if (r.ok && /^\d{1,18}$/.test(str(id))) {
          s.up = null;   // 고른 파일·미리보기 응답을 비운다
          s.list.items = s.list.items.concat([{ minutes_id: id }]);
          if (ctl.onCount) ctl.onCount(s.list.items.length);
          say(T.SAVED);
          openDetail(id);
          reloadListQuiet(s);
          return;
        }
        failUpload(u, r, 'save');
      });
    }
    // 저장 뒤 목록을 조용히 다시 받는다(상세를 보는 중이라 그리지 않는다). 탭 수를 서버 값으로 맞춘다.
    function reloadListQuiet(s) {
      const ep = env.epoch();
      call('GET', '/board-materials/' + s.mid + '/minutes', mn.screenFor(s.isAssignee), mn.BTN.TAB).then(function (r) {
        if (S !== s || ep !== env.epoch()) return;
        applyList(s, r);
        if (s.list.status === 'ready' && ctl.onCount) ctl.onCount(s.list.items.length);
      });
    }

    // 시험용: 패널 없이(그리지 않고) 흐름만 돌린다. 화면 코드는 이 값을 쓰지 않는다.
    ctl.testApi = { openUpload: openUpload, doPreview: doPreview, openDetail: openDetail, saveLabels: saveLabels, loadScope: loadScope, loadTranscript: loadTranscript, jumpUtter: jumpUtter, toggleLbl: toggleLbl };
    return ctl;
  };

  root.boardMinutes = mn;
  if (typeof module !== 'undefined' && module.exports) module.exports = mn;
})(typeof window !== 'undefined' ? window : globalThis);
