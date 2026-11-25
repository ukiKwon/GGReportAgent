(function (root) {
  'use strict';
  // 영업 추진 준비 › 제안 준비 현황 — 제안 확정 기관 × 준비 체크리스트 표(NEXT 102). 엑셀 머리줄(묶음 1행 + 하위 칸 2행)을 그대로 옮긴다.
  // 규격: handoff/agents/design-reviewer/2026-11-23_1049_ae4db5c1.md 5·6절. 서버 계약: handoff/agents/backend-dev/2026-11-23_1027_ab347621.md 3-0.
  //   GET /prep-board[?scope=mine|team|dept][&include_ended=true] (조회 범위 11-24, backend af8643b6) · PUT /bidcases/{id}/prep/board-checks/{col} {mark_cd, base_rev}
  //   머리 X-Screen-Id: prep_dashboard · X-Button-Id: open | refresh | dash_check
  // main 결정(11-23): 칸은 columns[] 그대로(27), 묶음 머리는 groups, 정렬은 서버 순서, 자동 새로고침 없음, 브라우저 저장소 안 씀.
  // 앞 절반은 순수 함수(node 테스트 대상), 뒤 절반은 DOM 배선 — prep.js가 show()를 부를 때만 실행된다.
  const pb = {};
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const prep = isNode ? require('./prep.js') : root.prep;

  function esc(s) { return logic.esc(s == null ? '' : s); }
  function str(v) { return v == null ? '' : String(v); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  pb.SCREEN = 'prep_dashboard';
  pb.MARK_ORDER = ['DONE', 'IN_PROGRESS', 'NA', 'NONE'];
  // 조회 범위(사용자 11-24): 내 작업·팀 작업·부서 작업 3가지뿐(전체·이름별 거르기 없음). 범위는 서버가 거른다 — GET /prep-board?scope=
  pb.SCOPES = ['mine', 'team', 'dept'];
  pb.scopeValid = function (s) { return pb.SCOPES.indexOf(s) >= 0; };
  // 개설 승인 전 — 활성 담당 배정이 개설 승인 때 생기므로 이 줄의 손 칸은 아무도 체크하지 못한다(D31, 팀 결정 A).
  pb.PRE_OPEN_STATES = ['CONFIRMED', 'OPEN_PENDING'];
  pb.preOpen = function (row) {
    return !!row && !row.ended && pb.PRE_OPEN_STATES.indexOf(str(row.state_cd)) >= 0;
  };
  const MARK_NAMES = { DONE: '완료', IN_PROGRESS: '진행', NA: '대상 아님', NONE: '시작 전' };

  // ── 문구 (규격 5-1) ───────────────────────────────────────────────
  const T = {
    title: '제안 준비 현황',
    hint: '— 제안 확정한 기관의 준비 진행을 칸마다 봅니다. 담당 기관의 칸을 눌러 체크하세요.',
    loading: '불러오는 중…',
    retry: '다시 시도',
    loadErr: '제안 준비 현황을 불러오지 못했습니다.',
    refresh: '새로 고침',
    refreshing: '새로 고치는 중…',
    scopeMine: '내 작업',
    scopeTeam: '팀 작업',
    scopeDept: '부서 작업',
    scopeNote: '팀 작업·부서 작업에는 개설 승인(팀장 결재)이 끝난 기관만 나옵니다. 개설 전 기관은 내 작업에서 봅니다.',
    teamUnresolved: '상위 결재자(소속 팀장)가 지정되지 않아 팀 작업에 내가 담당한 기관만 나옵니다. 시스템 관리자에게 상위 결재자 지정을 요청하세요.',
    emptyMine: '내가 제안 확정했거나 담당한 기관이 없습니다. 입찰 현황판에서 목표 기관을 고르고 [제안 확정]을 누르면 여기에 생깁니다.',
    emptyTeam: '팀에 개설 승인이 끝난 기관이 없습니다. 개설 전 기관은 내 작업에서 봅니다.',
    emptyTeamSolo: '내가 담당한 기관 중 개설 승인이 끝난 곳이 없습니다. 개설 전 기관은 내 작업에서 봅니다.',
    emptyDept: '부서에 개설 승인이 끝난 기관이 없습니다. 개설 전 기관은 내 작업에서 봅니다.',
    seeMine: '내 작업 보기',
    seeTeam: '팀 작업 보기',
    clearQ: '검색 지우기',
    openMap: '입찰 현황판 열기',
    readOnly: '지금 계정이 담당한 기관이 없어 보기만 합니다. 체크는 각 기관의 담당 영업이 합니다.',
    all: '전체',   // headModel이 묶음 이름과 같은 하위 칸 이름으로 쓴다(조회 범위와 무관)
    chipMine: '내 담당',
    chipEnded: '확정 취소',
    noAssignee: '담당 미정',
    saving: '저장 중…',
    infoStart: '칸을 고르면 체크한 날과 사람이 여기에 보입니다.',
    infoNoView: '이 기관의 상세는 볼 수 없습니다. 상세는 담당자와 영업팀장·영업부장이 봅니다.',
    infoNotMine: '체크는 이 기관의 담당 영업만 합니다.',
    infoAuto: '사전준비 과제에서 시스템이 채웁니다.',
    infoAutoProposal: '디자이너 작업 결과로 시스템이 채웁니다.',
    infoNotice: '공고 판정에서 가져옵니다.',
    infoNoCheck: '아직 체크하지 않았습니다.',
    chipPre: '개설 전',
    ariaPre: ', 개설 승인 뒤 담당 영업이 체크',
    infoPre: '개설 승인 뒤 정해지는 담당 영업이 체크합니다.',
    legendPre: '개설 승인 전 — 담당이 정해지면 체크합니다',
    readOnlyPre: '아직 개설 승인된 기관이 없어 체크할 칸이 없습니다. 담당 영업은 개설 승인 때 정해집니다.',
    back: '← 제안 준비 현황으로',
    err400: '저장하지 못했습니다. 화면을 새로 고친 뒤 다시 고르세요.',
    errNet: '연결이 끊겨 저장하지 못했습니다. 연결을 확인하고 다시 고르세요.',
    err404: '이 칸이나 기관을 찾을 수 없습니다. [새로 고침]으로 확인하세요.',
    forbidden: function (roleLabel) {
      return '이 화면은 영업부서만 볼 수 있습니다. 지금 계정(' + (roleLabel || '소속 없음') + ')으로는 볼 수 없습니다.';
    },
  };
  pb.T = T;

  // ── 날짜·시각 ────────────────────────────────────────────────────
  // 칸 안 날짜: 올해면 MM-DD, 다른 해면 YYYY(main 결정 4). 전체 날짜는 정보 줄·메뉴 머리에 나온다.
  pb.dateText = function (d, today) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(d));
    if (!m) return '';
    const y = /^(\d{4})/.exec(str(today));
    const thisYear = y ? y[1] : String(new Date().getFullYear());
    return m[1] === thisYear ? m[2] + '-' + m[3] : m[1];
  };
  pb.fullDate = function (d) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(str(d));
    return m ? m[1] : '';
  };
  pb.hm = function (d) {
    const x = d || new Date();
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(x.getHours()) + ':' + p(x.getMinutes());
  };

  // 조사: 을/를은 prep.josa, '로/으로'는 받침 ㄹ도 '로'.
  pb.ro = function (name) {
    const s = str(name).trim();
    if (!s) return '로';
    const code = s.charCodeAt(s.length - 1);
    if (code < 0xAC00 || code > 0xD7A3) return '로';
    const b = (code - 0xAC00) % 28;
    return b === 0 || b === 8 ? '로' : '으로';
  };

  // ── 값 이름·글리프 ────────────────────────────────────────────────
  pb.markName = function (marks, cd) {
    const hit = (Array.isArray(marks) ? marks : []).filter(function (m) { return m && m.mark_cd === cd; })[0];
    const n = hit ? str(hit.name).trim() : '';
    return n || MARK_NAMES[cd] || '';
  };
  pb.glyphKind = function (mark) {
    return mark === 'DONE' ? 'done' : mark === 'IN_PROGRESS' ? 'prog' : mark === 'NA' ? 'na' : '';
  };
  const GLYPH_PATH = { done: 'M2.5 6.4 5 8.9 9.6 3.2', prog: 'M6 2.3 10.2 9.6H1.8Z', na: 'M3 6h6' };
  // 문자 아이콘(V·△) 대신 SVG 획 글리프(DESIGN 아이콘 규칙). 시작 전은 빈 칸.
  pb.glyphSvg = function (kind) {
    if (!has(GLYPH_PATH, kind)) return '';
    return '<svg class="pb-g ' + kind + '" viewBox="0 0 12 12" aria-hidden="true"><path d="' + GLYPH_PATH[kind] + '"/></svg>';
  };
  const CK = '<svg class="ck" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.4 5 8.9 9.6 3.2"/></svg>';

  // ── 열 머리 2단 구성 ──────────────────────────────────────────────
  // columns[{col_cd,label,group,kind,editable}] 순서 그대로. 같은 group이 이어지면 묶음 머리(colspan) + 하위 칸, 묶음이 없으면 rowspan 2.
  // 하위 칸 이름이 묶음 이름과 같으면 '전체'(규격 P1-1). → { top:[{type,...}], sub:[{cd,label,auto,gs}] }
  pb.headModel = function (columns, groups) {
    const cols = Array.isArray(columns) ? columns : [];
    const g = groups && typeof groups === 'object' ? groups : {};
    const top = [], sub = [];
    let i = 0;
    while (i < cols.length) {
      const c = cols[i] || {};
      if (!c.group) {
        top.push({ type: 'single', cd: str(c.col_cd), label: str(c.label), auto: c.kind === 'AUTO' });
        i += 1;
        continue;
      }
      let j = i;
      while (j < cols.length && cols[j] && cols[j].group === c.group) j += 1;
      const label = has(g, c.group) ? str(g[c.group]) : str(c.group);
      top.push({ type: 'group', group: str(c.group), label: label, span: j - i });
      for (let k = i; k < j; k += 1) {
        sub.push({ cd: str(cols[k].col_cd), label: str(cols[k].label) === label ? T.all : str(cols[k].label), auto: cols[k].kind === 'AUTO', gs: k === i });
      }
      i = j;
    }
    return { top: top, sub: sub };
  };

  // 칸마다 한 줄: { cd, label, fullLabel('묶음 › 칸'), kind, editable, auto, gs(묶음 첫 칸) }
  pb.colInfos = function (columns, groups) {
    const cols = Array.isArray(columns) ? columns : [];
    const g = groups && typeof groups === 'object' ? groups : {};
    return cols.map(function (c, i) {
      const prev = i > 0 ? cols[i - 1] : null;
      const gl = c.group ? (has(g, c.group) ? str(g[c.group]) : str(c.group)) : '';
      const label = str(c.label);
      return {
        cd: str(c.col_cd), label: label, kind: str(c.kind), editable: c.editable === true, auto: c.kind === 'AUTO',
        gs: !!c.group && (!prev || prev.group !== c.group),
        fullLabel: gl && gl !== label ? gl + ' › ' + label : label,
      };
    });
  };

  // ── 칸 모양 ──────────────────────────────────────────────────────
  // → { cd, kind, mark, glyph, date, button, tint, pre, revNo, noticeText }
  // button: 담당(can_check)이 누를 수 있는 손 칸. 끝난 행은 모두 읽기 전용이고 칸 색도 없다.
  pb.cellModel = function (info, row, cell, today) {
    const c = cell && typeof cell === 'object' ? cell : {};
    const r = row || {};
    const kind = info.kind;
    const ended = !!r.ended;
    const mark = kind === 'NOTICE' ? '' : has(MARK_NAMES, c.mark_cd) ? c.mark_cd : 'NONE';
    return {
      cd: info.cd, kind: kind, mark: mark, glyph: pb.glyphKind(mark),
      date: mark && mark !== 'NONE' ? pb.dateText(c.marked_on, today) : '',
      button: kind === 'MANUAL' && info.editable && r.can_check === true && !ended,
      tint: !ended && (mark === 'DONE' || mark === 'IN_PROGRESS') ? mark : '',
      pre: kind === 'MANUAL' && pb.preOpen(r),
      revNo: Number(c.rev_no) || 0,
      noticeText: kind === 'NOTICE' ? str(c.notice_status_name).trim() : '',
    };
  };

  // 칸 aria-label — 색·글리프가 아니라 말로 전한다.
  pb.cellAria = function (row, info, cell, marks, today) {
    const c = cell || {};
    const inst = str(row && row.institution_name);
    const head = inst + ' ' + info.fullLabel + ': ';
    if (info.kind === 'NOTICE') {
      const t = str(c.notice_status_name).trim();
      return head + (t || '공고 상태 없음') + ', 공고 판정에서 가져옴';
    }
    const m = has(MARK_NAMES, c.mark_cd) ? c.mark_cd : 'NONE';
    const name = pb.markName(marks, m);
    const d = pb.fullDate(c.marked_on);
    if (info.kind === 'AUTO') return head + name + (d ? ', ' + d : '') + ', 자동, 시스템이 채움';
    const tail = pb.preOpen(row) ? T.ariaPre : '';
    if (m === 'NONE') return head + name + tail;
    const by = str(c.by_name).trim();
    return head + name + (d ? ', ' + d + (by ? ' ' + by + ' 체크' : '') : '') + tail;
  };

  // ── 정보 줄(칸을 고르면 아래에 글자로 보인다) ─────────────────────────
  // info가 null이면 이름 칸. → { parts:[{l, v, mono}], tail }
  pb.infoParts = function (row, info, cell, marks) {
    const r = row || {};
    const c = cell || {};
    const parts = [];
    if (!info) {
      parts.push({ l: '', v: str(r.institution_name) });
      if (r.state_name) parts.push({ l: '상태', v: str(r.state_name) });
      if (r.bid_expected_date) parts.push({ l: '입찰 예정일(추정)', v: pb.fullDate(r.bid_expected_date) || str(r.bid_expected_date), mono: true });
      const banks = (Array.isArray(r.current_banks) ? r.current_banks : []).map(function (b) { return str(b && b.bank_name).trim(); }).filter(Boolean);
      if (banks.length) parts.push({ l: '현재 금고', v: banks.join(', ') });
      return { parts: parts, tail: r.can_view === false ? T.infoNoView : '' };
    }
    parts.push({ l: '칸', v: info.fullLabel });
    if (info.kind === 'NOTICE') {
      parts.push({ l: '공고 상태', v: str(c.notice_status_name).trim() || '없음' });
      return { parts: parts, tail: '— ' + T.infoNotice };
    }
    const m = has(MARK_NAMES, c.mark_cd) ? c.mark_cd : 'NONE';
    parts.push({ l: '표시', v: pb.markName(marks, m) });
    if (info.kind === 'AUTO') {
      const d = pb.fullDate(c.marked_on);
      if (m !== 'NONE' && d) parts.push({ l: '기록한 날', v: d, mono: true });
      return { parts: parts, tail: '— ' + (info.cd === 'PROPOSAL' ? T.infoAutoProposal : T.infoAuto) };
    }
    const why = r.can_check === true || r.ended ? '' : (pb.preOpen(r) ? T.infoPre : T.infoNotMine);
    if (m === 'NONE') return { parts: parts, tail: '— ' + T.infoNoCheck + (why ? ' ' + why : '') };
    const d2 = pb.fullDate(c.marked_on);
    if (d2) parts.push({ l: '체크한 날', v: d2, mono: true });
    if (str(c.by_name).trim()) parts.push({ l: '체크한 사람', v: str(c.by_name).trim() });
    return { parts: parts, tail: why };
  };
  pb.infoHtml = function (p) {
    return p.parts.map(function (x) {
      return '<span>' + (x.l ? esc(x.l) + ' ' : '') + '<b' + (x.mono ? ' class="m"' : '') + '>' + esc(x.v) + '</b></span>';
    }).join('') + (p.tail ? '<span>' + esc(p.tail) + '</span>' : '');
  };

  // ── 거르기 ───────────────────────────────────────────────────────
  // 조회 범위 이름·요청 주소·안내 줄. 범위를 모르면(첫 응답 전) 화면에는 내 작업으로 보이되 요청에는 scope를 싣지 않는다.
  pb.scopeLabel = function (scope) {
    return scope === 'team' ? T.scopeTeam : scope === 'dept' ? T.scopeDept : T.scopeMine;
  };
  // 서버 계약: 첫 요청은 scope 없이(역할 기본값), 칩을 바꾸면 scope=team 등을 붙여 다시 불러온다.
  pb.boardUrl = function (scope, ended) {
    const q = [];
    if (pb.scopeValid(scope)) q.push('scope=' + scope);
    if (ended) q.push('include_ended=true');
    return '/prep-board' + (q.length ? '?' + q.join('&') : '');
  };
  // 팀·부서일 때만 안내 줄. 팀인데 결재선이 없어 내 건만 오면(team_resolved:false) 그 사실을 앞에 붙인다.
  pb.scopeNoteText = function (scope, teamResolved) {
    if (scope !== 'team' && scope !== 'dept') return '';
    return (scope === 'team' && teamResolved === false ? T.teamUnresolved + ' ' : '') + T.scopeNote;
  };
  pb.liveText = function (scope, n) { return pb.scopeLabel(scope) + ', 기관 ' + Number(n) + '곳'; };
  // f: { q }. 범위는 서버가 거르므로 여기서는 이름만 거른다 — is_mine으로 다시 거르지 않는다. 서버 순서(입찰 예정일 빠른 순)를 그대로 둔다.
  pb.filterRows = function (rows, f) {
    const q = str(f && f.q).trim().toLowerCase();
    return (Array.isArray(rows) ? rows : []).filter(function (r) {
      if (!r) return false;
      return !q || str(r.institution_name).toLowerCase().indexOf(q) >= 0;
    });
  };
  // 개수 줄: { shown, total, filtered }
  pb.countModel = function (shown, total) { return { shown: shown, total: total, filtered: shown !== total }; };
  pb.countHtml = function (m) {
    return '기관 <b>' + Number(m.shown) + '</b>곳' + (m.filtered ? ' 중 <b>' + Number(m.total) + '</b>곳' : '');
  };
  // 빈 표 안내 → null(표를 그린다) | { kind, text, actions:[{act,label}] }. f: { q, scope, teamResolved }
  // act: map(입찰 현황판 열기 — act 이름은 옛 것) · scope-mine · scope-team(범위 바꿔 다시 불러옴) · clearq(검색어만 지움, 범위 유지)
  pb.emptyModel = function (total, shown, f) {
    const scope = f && pb.scopeValid(f.scope) ? f.scope : 'mine';
    if (total === 0) {
      if (scope === 'team') return { kind: 'none', text: f && f.teamResolved === false ? T.emptyTeamSolo : T.emptyTeam, actions: [{ act: 'scope-mine', label: T.seeMine }] };
      if (scope === 'dept') return { kind: 'none', text: T.emptyDept, actions: [{ act: 'scope-mine', label: T.seeMine }] };
      return { kind: 'none', text: T.emptyMine, actions: [{ act: 'map', label: T.openMap }, { act: 'scope-team', label: T.seeTeam }] };
    }
    if (shown > 0) return null;
    const q = str(f && f.q).trim();
    if (!q) return null;
    return { kind: 'query', text: pb.scopeLabel(scope) + '에서 \'' + q + '\'' + prep.josa(q, '과', '와') + ' 맞는 기관이 없습니다.', actions: [{ act: 'clearq', label: T.clearQ }] };
  };
  // 개설 승인 뒤 줄이 있는데 내가 체크할 수 있는 줄이 없을 때(끝난 줄·개설 전 줄은 세지 않는다)
  pb.readOnlyAll = function (rows) {
    const open = (Array.isArray(rows) ? rows : []).filter(function (x) { return x && !x.ended && !pb.preOpen(x); });
    return open.length > 0 && !open.some(function (x) { return x.can_check === true; });
  };
  // 살아 있는 줄이 모두 개설 전
  pb.preOnly = function (rows) {
    const live = (Array.isArray(rows) ? rows : []).filter(function (x) { return x && !x.ended; });
    return live.length > 0 && live.every(function (x) { return pb.preOpen(x); });
  };
  // 표 위 안내 문구 — 없으면 ''(숨김). 두 조건은 서로 배타다. (규격에 없는 얇은 helper: DOM 없이 시험하려고 추가)
  pb.roText = function (rows) {
    return pb.preOnly(rows) ? T.readOnlyPre : pb.readOnlyAll(rows) ? T.readOnly : '';
  };

  // ── 오류·성공 문구 ─────────────────────────────────────────────────
  // status·code는 서버가 준 값. 서버 message 원문은 어느 칸인지 말하지 않으므로 코드로 문구를 고른다.
  // c: { inst, col } → 문구(문자열)
  pb.saveError = function (status, code, c) {
    const inst = str(c && c.inst), col = str(c && c.col);
    if (status === 409) {
      if (code === 'STALE_CHECK') return inst + ' › ' + col + ': 다른 사람이 먼저 바꿨습니다. [새로 고침]으로 지금 값을 본 뒤 다시 고르세요.';
      if (code === 'STATE_CHANGED') return inst + '의 진행 상태가 바뀌어 지금은 체크할 수 없습니다. [새로 고침]으로 확인하세요.';
      if (code === 'NOT_MANUAL') return col + prep.josa(col, '은', '는') + ' 시스템이 채우는 칸이라 직접 바꿀 수 없습니다.';
      return T.err400;
    }
    if (status === 403) return inst + '의 담당 영업만 체크할 수 있습니다. 담당이 바뀌었다면 [새로 고침]을 누르세요.';
    if (status === 401) return prep.T.login;
    if (status === 404) return T.err404;
    if (!status || status >= 500) return T.errNet;
    return T.err400;
  };
  pb.saveOk = function (colLabel, markName) {
    return colLabel + prep.josa(colLabel, '을', '를') + ' ' + markName + pb.ro(markName) + ' 저장했습니다.';
  };

  // ── 표 키보드(roving tabindex) ─────────────────────────────────────
  // pos {r, c}: r = 보이는 행 번호, c = 0(이름 칸)·1…N(칸). 못 다루는 키는 null.
  pb.nextPos = function (pos, key, ctrl, nRows, nCols) {
    let r = pos.r, c = pos.c;
    switch (key) {
      case 'ArrowLeft': c = Math.max(0, c - 1); break;
      case 'ArrowRight': c = Math.min(nCols, c + 1); break;
      case 'ArrowUp': r = Math.max(0, r - 1); break;
      case 'ArrowDown': r = Math.min(Math.max(nRows - 1, 0), r + 1); break;
      case 'Home': if (ctrl) r = 0; c = 0; break;
      case 'End': if (ctrl) r = Math.max(nRows - 1, 0); c = nCols; break;
      default: return null;
    }
    return { r: r, c: c };
  };
  // 메뉴의 숫자 키 1~4 → 값
  pb.markByKey = function (key, order) {
    const i = Number(key) - 1;
    const list = order && order.length ? order : pb.MARK_ORDER;
    return /^[1-9]$/.test(str(key)) && i < list.length ? list[i] : '';
  };

  // ── 마크업 ───────────────────────────────────────────────────────
  pb.legendHtml = function (hasPre) {
    return '<span>' + pb.glyphSvg('done') + '완료</span><span>' + pb.glyphSvg('prog') + '진행</span><span>' + pb.glyphSvg('na') + '대상 아님</span>' +
      '<span><i class="sw0"></i>시작 전</span><span>머리에 \'자동\'이 붙은 칸은 시스템이 채웁니다</span><span>체크한 날은 저장한 날로 자동 기록됩니다</span>' +
      (hasPre ? '<span><i class="sw-pre"></i>' + esc(T.legendPre) + '</span>' : '');
  };

  // 열 머리 글자: esc 먼저, 그다음 괄호 앞에 줄 바꿈 허용점(<wbr>)
  function headLabel(s) { return esc(s).replace(/\(/g, '<wbr>('); }
  pb.headLabel = headLabel;

  pb.headHtml = function (columns, groups) {
    const h = pb.headModel(columns, groups);
    let r1 = '<th class="pb-corner" rowspan="2" scope="col">기관</th>';
    h.top.forEach(function (t) {
      if (t.type === 'group') r1 += '<th class="pb-grp gs" colspan="' + t.span + '" scope="colgroup">' + esc(t.label) + '</th>';
      else r1 += '<th rowspan="2" scope="col">' + headLabel(t.label) + (t.auto ? '<span class="pb-auto">자동</span>' : '') + '</th>';
    });
    const r2 = h.sub.map(function (s) {
      return '<th scope="col"' + (s.gs ? ' class="gs"' : '') + '>' + headLabel(s.label) + (s.auto ? '<span class="pb-auto">자동</span>' : '') + '</th>';
    }).join('');
    return '<thead><tr>' + r1 + '</tr><tr>' + r2 + '</tr></thead>';
  };

  // o: { info, row, cell, marks, today, r, c, saving, failed }
  pb.cellHtml = function (o) {
    const m = pb.cellModel(o.info, o.row, o.cell, o.today);
    const cls = (m.kind === 'NOTICE' ? 'is-notice' : m.kind === 'AUTO' ? 'is-auto' : '') + (o.info.gs ? ' gs' : '') + (m.pre ? ' is-pre' : '') + (o.saving ? ' is-saving' : '') + (o.failed ? ' is-failed' : '');
    const at = ' data-r="' + o.r + '" data-c="' + o.c + '" data-col="' + esc(m.cd) + '"' + (m.tint ? ' data-mk="' + m.tint + '"' : '') +
      (cls.trim() ? ' class="' + cls.trim() + '"' : '');
    const label = esc(pb.cellAria(o.row, o.info, o.cell, o.marks, o.today));
    if (m.kind === 'NOTICE') {
      return '<td role="gridcell" aria-readonly="true" tabindex="-1" aria-label="' + label + '"' + at + '>' +
        (m.noticeText ? '<span class="wf-badge pp-neutral pb-notice">' + esc(m.noticeText) + '</span>' : '') + '</td>';
    }
    const inner = pb.glyphSvg(m.glyph) + (m.date ? '<span class="pb-d">' + esc(m.date) + '</span>' : '');
    if (m.button) {
      return '<td role="gridcell"' + (o.saving ? ' aria-busy="true"' : '') + at + '><button type="button" class="pb-mk" tabindex="-1" aria-haspopup="menu" aria-expanded="false"' +
        (o.saving ? ' aria-disabled="true"' : '') + ' aria-label="' + label + '">' + inner + '</button></td>';
    }
    return '<td role="gridcell" aria-readonly="true" tabindex="-1" aria-label="' + label + '"' + at + '><span class="pb-in">' + inner + '</span></td>';
  };

  pb.rowHtml = function (o) {
    // o: { row, infos, marks, today, r, pending, failed }
    const row = o.row;
    const names = (Array.isArray(row.assignee_names) ? row.assignee_names : []).filter(Boolean);
    const chip = row.ended ? '<span class="wf-badge pp-neutral pb-chip">' + esc(str(row.state_name).trim() || T.chipEnded) + '</span>'
      : pb.preOpen(row) ? '<span class="wf-badge pp-neutral pb-chip">' + T.chipPre + '</span>'
      : row.is_mine === true ? '<span class="wf-badge pp-neutral pb-chip">' + T.chipMine + '</span>' : '';
    const nm = row.can_view === false ? '<span class="pb-nm-t">' + esc(row.institution_name) + '</span>'
      : '<button type="button" class="pb-nm" data-pb="open" tabindex="-1">' + esc(row.institution_name) + '</button>';
    let h = '<tr data-bid="' + esc(row.bid_case_id) + '"' + (row.ended ? ' class="is-ended"' : '') + '>' +
      '<th scope="row" role="rowheader" tabindex="-1" data-r="' + o.r + '" data-c="0">' + nm + chip +
      '<span class="pb-who">' + esc(names.length ? '담당 ' + names.join(', ') : T.noAssignee) + '</span></th>';
    o.infos.forEach(function (info, i) {
      const key = str(row.bid_case_id) + '|' + info.cd;
      h += pb.cellHtml({ info: info, row: row, cell: row.cells && row.cells[info.cd], marks: o.marks, today: o.today, r: o.r, c: i + 1,
        saving: !!(o.pending && o.pending[key]), failed: !!(o.failed && o.failed[key]) });
    });
    return h + '</tr>';
  };

  // m: { columns, groups, marks, rows(거른 뒤), today, pending, failed }
  pb.tableHtml = function (m) {
    const infos = pb.colInfos(m.columns, m.groups);
    const rows = m.rows || [];
    return '<table class="pb-t" role="grid" aria-labelledby="pb-title" aria-rowcount="' + (rows.length + 2) + '" aria-colcount="' + (infos.length + 1) + '">' +
      '<colgroup><col class="c-name">' + infos.map(function (i) { return '<col class="' + (i.kind === 'NOTICE' ? 'c-notice' : 'c-mk') + '">'; }).join('') + '</colgroup>' +
      pb.headHtml(m.columns, m.groups) + '<tbody>' +
      rows.map(function (row, r) { return pb.rowHtml({ row: row, infos: infos, marks: m.marks, today: m.today, r: r, pending: m.pending, failed: m.failed }); }).join('') +
      '</tbody></table>';
  };

  // 칸 메뉴 마크업(규격 6-5). cell은 그 칸의 현재 값.
  pb.menuHtml = function (row, info, cell, marks) {
    const c = cell || {};
    const cur = has(MARK_NAMES, c.mark_cd) ? c.mark_cd : 'NONE';
    const by = str(c.by_name).trim(), d = pb.fullDate(c.marked_on);
    const last = d && by ? '마지막 체크 ' + d + ' ' + by : T.infoNoCheck;
    const order = (Array.isArray(marks) && marks.length ? marks.map(function (x) { return x.mark_cd; }) : pb.MARK_ORDER).filter(function (k) { return has(MARK_NAMES, k); });
    return '<div class="mh"><b>' + esc(info.fullLabel + ' — ' + str(row.institution_name)) + '</b>' + esc(last) + '</div>' +
      order.map(function (k, i) {
        const g = pb.glyphSvg(pb.glyphKind(k)) || '<span class="pb-g"></span>';
        return '<button type="button" role="menuitemradio" aria-checked="' + (k === cur ? 'true' : 'false') + '" tabindex="-1" data-mk="' + k + '">' +
          g + '<span>' + esc(k === 'NONE' ? pb.markName(marks, k) + '(빈칸)' : pb.markName(marks, k)) + '</span><span class="kk">' + (i + 1) + '</span>' + CK + '</button>';
      }).join('');
  };

  // ════════════════════════════════════════════════════════════════
  // 아래는 DOM 배선 — prep.js가 show()를 부를 때만 실행된다(노드 테스트 대상 아님).
  // ════════════════════════════════════════════════════════════════
  function fresh() {
    return { data: null, state: 'idle', q: '', scope: '', teamResolved: true, announce: false, ended: false, at: '', refreshing: false, pending: {}, failed: {}, errText: '',
             pos: { r: 0, c: 0 }, seq: 0, hooks: null, scroll: null, menu: null, touched: false };
  }
  let B = fresh();
  let reqSeq = 0;   // 요청 번호는 B 밖에서 단조 증가 — reset으로 B가 바뀌어도 옛 응답 번호와 겹치지 않는다
  let wired = false;
  let menuEl = null;

  function el(id) { return document.getElementById(id); }
  function ui(button) { return { screen: pb.SCREEN, button: button }; }
  function visibleRows() { return B.data ? pb.filterRows(B.data.rows, { q: B.q }) : []; }
  function rowById(bid) { return (B.data ? B.data.rows : []).filter(function (r) { return str(r.bid_case_id) === bid; })[0] || null; }
  function infoOf(cd) { return pb.colInfos(B.data.columns, B.data.groups).filter(function (i) { return i.cd === cd; })[0] || null; }
  function setErr(text) { B.errText = text || ''; const e = el('pb-err'); if (e) e.textContent = B.errText; }
  function live(text) { const e = el('pb-live'); if (e) e.textContent = text || ''; }

  function normalize(d) {
    const x = d && typeof d === 'object' ? d : {};
    return { columns: Array.isArray(x.columns) ? x.columns : [], groups: x.groups && typeof x.groups === 'object' ? x.groups : {},
             marks: Array.isArray(x.marks) ? x.marks : [], today: str(x.today), rows: Array.isArray(x.rows) ? x.rows : [],
             scope: pb.scopeValid(x.scope) ? x.scope : '', teamResolved: x.team_resolved !== false };
  }

  function paintMeta() {
    const total = B.data ? B.data.rows.length : 0;
    const n = visibleRows().length;
    const c = el('pb-count'); if (c) c.innerHTML = B.data ? pb.countHtml(pb.countModel(n, total)) : '';
    const a = el('pb-at'); if (a) a.textContent = B.at;
    const b = el('pb-refresh');
    if (b) { b.textContent = B.refreshing ? T.refreshing : T.refresh; if (B.refreshing) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled'); }
    const ro = el('pb-ro');
    if (ro) { const msg = B.data ? pb.roText(B.data.rows) : ''; ro.hidden = !msg; if (msg) ro.textContent = msg; }
    const e = el('pb-ended'); if (e) e.checked = B.ended;
    const sec = el('pp-board'); if (sec) sec.setAttribute('aria-busy', B.state === 'loading' ? 'true' : 'false');
  }
  // 조회 범위 세그먼트: 눌린 단추(aria-pressed)와 안내 줄. 범위를 아직 모르면 내 작업으로 보인다.
  function paintScope() {
    const g = el('pb-scope');
    const cur = B.scope || 'mine';
    if (g && g.querySelectorAll) {
      Array.prototype.forEach.call(g.querySelectorAll('.pb-sc'), function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-scope') === cur ? 'true' : 'false');
      });
    }
    const n = el('pb-scope-note');
    if (n) { const msg = pb.scopeNoteText(cur, B.teamResolved); n.hidden = !msg; n.textContent = msg; }
  }
  function stateBox(text, action) {
    return '<p class="wf-empty">' + esc(text) + '</p>' + action;
  }
  function actionBtn(a) {
    return '<button type="button" data-pb="' + esc(a.act) + '">' + esc(a.label) + '</button>';
  }
  function paintTable() {
    const box = el('pb-scroll');
    if (!box) return;
    const keep = { l: box.scrollLeft, t: box.scrollTop };
    closeMenu(false);
    if (B.state === 'loading') box.innerHTML = stateBox(T.loading, '');
    else if (B.state === 'err') box.innerHTML = stateBox(T.loadErr, '<button type="button" data-pb="retry">' + esc(T.retry) + '</button>');
    else if (B.state === 'login') box.innerHTML = stateBox(prep.T.login, '');
    else if (B.state === 'forbidden') box.innerHTML = stateBox(T.forbidden(B.hooks && B.hooks.roleLabel), '');
    else if (B.data) {
      const rows = visibleRows();
      const em = pb.emptyModel(B.data.rows.length, rows.length, { q: B.q, scope: B.scope, teamResolved: B.teamResolved });
      if (em) {
        box.innerHTML = stateBox(em.text, em.actions.map(actionBtn).join(' '));
      } else {
        box.innerHTML = pb.tableHtml({ columns: B.data.columns, groups: B.data.groups, marks: B.data.marks, rows: rows, today: B.data.today, pending: B.pending, failed: B.failed });
        B.pos.r = Math.min(B.pos.r, rows.length - 1);
        B.pos.c = Math.min(B.pos.c, B.data.columns.length);
        applyRoving();
      }
    }
    box.scrollLeft = keep.l; box.scrollTop = keep.t;
    paintMeta();
    paintInfo();
  }
  function paintAll() {
    const lg = el('pb-legend'); if (lg) lg.innerHTML = pb.legendHtml(!!(B.data && B.data.rows.some(function (x) { return pb.preOpen(x); })));
    paintScope();
    const q = el('pb-q'); if (q && q.value !== B.q) q.value = B.q;
    paintTable();
    setErr(B.errText);
  }

  // 현재 위치 칸 / 정보 줄
  function targetAt(r, c) {
    const tr = el('pb-scroll') && el('pb-scroll').querySelectorAll('tbody tr')[r];
    const cell = tr && tr.children[c];
    return cell ? (cell.querySelector('button.pb-mk') || cell) : null;
  }
  function applyRoving() {
    const box = el('pb-scroll');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('[data-r]'), function (n) {
      const b = n.querySelector && n.querySelector('button.pb-mk');
      n.setAttribute('tabindex', '-1');
      if (b) b.setAttribute('tabindex', '-1');
    });
    const t = targetAt(B.pos.r, B.pos.c) || targetAt(0, 0);
    if (t) t.setAttribute('tabindex', '0');
  }
  function paintInfo() {
    const box = el('pb-info');
    if (!box) return;
    const rows = visibleRows();
    const row = B.data && B.state === 'ok' ? rows[B.pos.r] : null;
    if (!row || !B.touched) { box.textContent = T.infoStart; return; }
    const info = B.pos.c === 0 ? null : pb.colInfos(B.data.columns, B.data.groups)[B.pos.c - 1];
    if (B.pos.c > 0 && !info) { box.textContent = T.infoStart; return; }
    const key = str(row.bid_case_id) + '|' + (info ? info.cd : '');
    if (info && B.pending[key]) { box.textContent = T.saving; return; }
    box.innerHTML = pb.infoHtml(pb.infoParts(row, info, info ? row.cells && row.cells[info.cd] : null, B.data.marks));
  }
  function focusAt(r, c) {
    B.pos = { r: r, c: c };
    B.touched = true;
    applyRoving();
    const t = targetAt(r, c);
    if (t) {
      t.focus();
      if (t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    paintInfo();
  }

  // 한 칸만 다시 그린다(저장 중·성공·실패). 가로·세로 스크롤은 그대로.
  function paintCell(bid, cd, refocus) {
    const box = el('pb-scroll');
    const rows = visibleRows();
    const r = rows.findIndex(function (x) { return str(x.bid_case_id) === bid; });
    const infos = B.data ? pb.colInfos(B.data.columns, B.data.groups) : [];
    const i = infos.findIndex(function (x) { return x.cd === cd; });
    if (!box || r < 0 || i < 0) return;
    const tr = box.querySelectorAll('tbody tr')[r];
    const old = tr && tr.children[i + 1];
    if (!old) return;
    const key = bid + '|' + cd;
    old.outerHTML = pb.cellHtml({ info: infos[i], row: rows[r], cell: rows[r].cells && rows[r].cells[cd], marks: B.data.marks, today: B.data.today, r: r, c: i + 1,
      saving: !!B.pending[key], failed: !!B.failed[key] });
    applyRoving();
    if (refocus) { const t = targetAt(r, i + 1); if (t) t.focus(); }
    paintInfo();
  }

  // ── 불러오기 ──
  function load(button, focusBid) {
    const hooks = B.hooks;
    if (!hooks) return;
    const token = B.seq = ++reqSeq;
    if (!B.data) { B.state = 'loading'; paintAll(); } else { B.refreshing = true; paintMeta(); }
    hooks.req('GET', pb.boardUrl(B.scope, B.ended), undefined, ui(button)).then(function (d) {
      if (token !== B.seq) return;
      B.data = normalize(d);
      if (B.data.scope) B.scope = B.data.scope;   // 첫 응답(scope 없이 요청)이면 역할 기본값이 여기서 정해진다
      B.teamResolved = B.data.teamResolved;
      B.state = 'ok';
      B.refreshing = false;
      B.at = pb.hm(new Date());
      B.pending = {}; B.failed = {};
      setErr('');
      paintAll();
      if (B.announce) { B.announce = false; live(pb.liveText(B.scope, visibleRows().length)); }
      if (focusBid) {
        const r = visibleRows().findIndex(function (x) { return str(x.bid_case_id) === focusBid; });
        if (r >= 0) focusAt(r, 0);
      }
      restoreScroll();
    }).catch(function (e) {
      if (token !== B.seq) return;
      B.refreshing = false;
      B.announce = false;
      const st = e && e.status;
      if (!B.data) {
        B.state = st === 403 ? 'forbidden' : st === 401 ? 'login' : 'err';
        paintAll();
      } else {
        paintMeta();
        setErr(st === 403 ? T.forbidden(hooks.roleLabel) : T.loadErr);
      }
    });
  }
  function restoreScroll() {
    const box = el('pb-scroll');
    if (box && B.scroll) { box.scrollLeft = B.scroll.l; box.scrollTop = B.scroll.t; B.scroll = null; }
  }

  // 범위를 바꾸면 서버에서 다시 불러온다(표 자리에 '불러오는 중…'). 검색어·끝난 건 포함은 그대로. 체크 저장 중인 칸이 있을 수 있다 — 표를 비운 동안 도착한 저장 응답은 save()가 B.data가 null이면 조용히 끝내고, 저장 중·실패 표시는 새 목록 응답이 비운다.
  function setScope(scope) {
    if (!pb.scopeValid(scope) || scope === B.scope || !B.hooks) return;
    closeMenu(false);
    B.scope = scope;
    B.data = null;
    B.pos = { r: 0, c: 0 };
    B.touched = false;
    B.announce = true;
    setErr('');
    paintScope();
    load('refresh');
  }

  // ── 칸 메뉴 ──
  function ensureMenu() {
    if (menuEl) return menuEl;
    menuEl = document.createElement('div');
    menuEl.className = 'hb-menu pb-menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.style.display = 'none';
    menuEl.addEventListener('click', function (e) {
      const b = e.target && e.target.closest ? e.target.closest('button[data-mk]') : null;
      if (b) pick(b.getAttribute('data-mk'));
    });
    menuEl.addEventListener('keydown', onMenuKey);
    document.body.appendChild(menuEl);
    document.addEventListener('mousedown', function (e) {
      if (B.menu && !menuEl.contains(e.target) && !(B.menu.btn && B.menu.btn.contains(e.target))) closeMenu(false);
    });
    return menuEl;
  }
  function menuItems() { return Array.prototype.slice.call(menuEl.querySelectorAll('button[data-mk]')); }
  function openMenu(btn) {
    const td = btn.closest('td');
    const tr = td && td.parentNode;
    if (!td || !tr) return;
    const bid = tr.getAttribute('data-bid'), cd = td.getAttribute('data-col');
    const row = rowById(bid), info = infoOf(cd);
    if (!row || !info || B.pending[bid + '|' + cd]) return;
    closeMenu(false);
    const cell = row.cells && row.cells[cd];
    const m = ensureMenu();
    m.setAttribute('aria-label', info.fullLabel + ' 표시 고르기');
    m.innerHTML = pb.menuHtml(row, info, cell, B.data.marks);
    m.style.display = '';
    const rect = btn.getBoundingClientRect();
    let left = rect.left, top = rect.bottom + 2;
    if (top + m.offsetHeight > window.innerHeight) top = Math.max(4, rect.top - m.offsetHeight - 2);
    if (left + m.offsetWidth > window.innerWidth) left = Math.max(4, window.innerWidth - m.offsetWidth - 8);
    m.style.left = left + 'px'; m.style.top = top + 'px';
    btn.setAttribute('aria-expanded', 'true');
    B.menu = { bid: bid, cd: cd, btn: btn };
    const cur = menuItems().filter(function (b) { return b.getAttribute('aria-checked') === 'true'; })[0] || menuItems()[0];
    if (cur) cur.focus();
  }
  function closeMenu(refocus) {
    if (!B.menu) return;
    const btn = B.menu.btn;
    B.menu = null;
    if (menuEl) { menuEl.style.display = 'none'; menuEl.innerHTML = ''; }
    if (btn && btn.setAttribute) {
      btn.setAttribute('aria-expanded', 'false');
      if (refocus && document.body.contains(btn)) btn.focus();
    }
  }
  function onMenuKey(e) {
    const items = menuItems();
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); return; }
    if (e.key === 'Home') { e.preventDefault(); items[0].focus(); return; }
    if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); return; }
    const k = pb.markByKey(e.key, items.map(function (b) { return b.getAttribute('data-mk'); }));
    if (k) { e.preventDefault(); pick(k); }
    // Enter·Space는 단추의 기본 동작(click)이 pick을 부른다
  }

  // ── 저장 ──
  function pick(mark) {
    const mnu = B.menu;
    if (!mnu) return;
    closeMenu(true);
    save(mnu.bid, mnu.cd, mark);
  }
  function save(bid, cd, mark) {
    const row = rowById(bid), info = infoOf(cd);
    if (!row || !info || !B.hooks) return;
    const key = bid + '|' + cd;
    if (B.pending[key]) return;
    const prev = row.cells && row.cells[cd] ? row.cells[cd] : { mark_cd: 'NONE', rev_no: 0 };
    if ((has(MARK_NAMES, prev.mark_cd) ? prev.mark_cd : 'NONE') === mark) return;   // 같은 값은 요청 없이 메뉴만 닫는다
    const base = Number(prev.rev_no) || 0;
    B.pending[key] = true;
    delete B.failed[key];
    setErr('');
    row.cells = row.cells || {};
    row.cells[cd] = Object.assign({}, prev, { mark_cd: mark, marked_on: mark === 'NONE' ? null : B.data.today });   // 고른 값을 바로 그린다
    paintCell(bid, cd, true);
    const b = B;
    B.hooks.req('PUT', '/bidcases/' + encodeURIComponent(bid) + '/prep/board-checks/' + encodeURIComponent(cd), { mark_cd: mark, base_rev: base }, ui('dash_check')).then(function (res) {
      if (b !== B) return;   // 그 사이 계정이 바뀜
      delete B.pending[key];
      if (!B.data) return;   // 범위 전환 중(setScope가 표를 비움): 표 갱신 없이 끝낸다 — 새 목록 응답이 칸을 다시 그린다
      const cur = rowById(bid);   // 새로 고침으로 행 객체가 바뀌었을 수 있다
      if (cur) { cur.cells = cur.cells || {}; cur.cells[cd] = Object.assign({}, prev, res && res.cell && typeof res.cell === 'object' ? res.cell : { mark_cd: mark }); }
      const oldFailed = Object.keys(B.failed);
      B.failed = {};
      paintCell(bid, cd, false);
      oldFailed.forEach(function (k) { const p = k.split('|'); paintCell(p[0], p[1], false); });
      setErr('');
      if (!res || res.saved !== false) live(pb.saveOk(info.fullLabel, pb.markName(B.data.marks, mark)));
    }).catch(function (e) {
      if (b !== B) return;
      delete B.pending[key];
      if (!B.data) return;   // 범위 전환 중: 실패 표시를 하지 않는다(새 목록 응답이 서버 값으로 다시 그린다)
      if (rowById(bid) === row) row.cells[cd] = prev;   // 새로 고침으로 바뀐 행은 서버 값이 맞으니 되돌리지 않는다
      B.failed[key] = true;
      setErr(pb.saveError(e && e.status, e && e.detail ? (typeof e.detail === 'object' ? str(e.detail.code) : '') : '', { inst: str(row.institution_name), col: info.fullLabel }));
      paintCell(bid, cd, false);
    });
  }

  // ── 이벤트 ──
  // 기관 이름 → 상세(prep.js enterCase — 구간·단계 한 화면). 그 줄·값 이름표·조회 범위를 함께 넘겨 상세가 표를 다시 받지 않게 한다.
  function canOpen() { return !!(B.hooks && B.hooks.openCase); }
  function openRow(row) {
    if (!canOpen()) return;
    B.hooks.openCase(str(row.bid_case_id), str(row.institution_name), { row: row, marks: B.data ? B.data.marks : [], scope: B.scope });
  }
  function cellOf(t) { return t && t.closest ? t.closest('[data-r]') : null; }
  function onClick(e) {
    const t = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!t) {
      const c = cellOf(e.target);
      if (c) { B.pos = { r: Number(c.getAttribute('data-r')), c: Number(c.getAttribute('data-c')) }; B.touched = true; applyRoving(); paintInfo(); }
      return;
    }
    const c0 = cellOf(t);
    if (c0) { B.pos = { r: Number(c0.getAttribute('data-r')), c: Number(c0.getAttribute('data-c')) }; B.touched = true; applyRoving(); paintInfo(); }
    if (t.classList.contains('pb-mk')) { if (t.getAttribute('aria-disabled') !== 'true') openMenu(t); return; }
    if (t.id === 'pb-refresh') { if (!B.refreshing) { setErr(''); load('refresh'); } return; }
    const sc = t.getAttribute('data-scope');
    if (sc) { setScope(sc); return; }
    const act = t.getAttribute('data-pb');
    if (act === 'open') {
      const tr = t.closest('tr');
      const bid = tr ? tr.getAttribute('data-bid') : '';
      const row = bid ? rowById(bid) : null;
      if (row && row.can_view !== false) openRow(row);
    } else if (act === 'retry') { B.state = 'loading'; B.data = null; load('open'); }
    else if (act === 'map') { if (B.hooks && B.hooks.openMap) B.hooks.openMap(); }
    else if (act === 'scope-mine') setScope('mine');
    else if (act === 'scope-team') setScope('team');
    else if (act === 'clearq') { B.q = ''; B.pos = { r: 0, c: 0 }; const q = el('pb-q'); if (q) q.value = ''; paintTable(); }
  }
  function onKey(e) {
    if (B.menu) return;
    const c = cellOf(e.target);
    if (!c) return;
    const pos = { r: Number(c.getAttribute('data-r')), c: Number(c.getAttribute('data-c')) };
    const rows = visibleRows();
    const np = pb.nextPos(pos, e.key, e.ctrlKey || e.metaKey, rows.length, B.data ? B.data.columns.length : 0);
    if (np) { e.preventDefault(); focusAt(np.r, np.c); return; }
    if ((e.key === 'Enter' || e.key === ' ') && pos.c === 0 && e.target === c) {   // 이름 칸에 머물 때 Enter·Space는 상세
      const row = rows[pos.r];
      if (row && row.can_view !== false && canOpen()) { e.preventDefault(); openRow(row); }
    }
  }
  function wire() {
    const sec = el('pp-board');
    if (!sec) return false;
    sec.addEventListener('click', onClick);
    sec.addEventListener('keydown', onKey);
    sec.addEventListener('focusin', function (e) {
      const c = cellOf(e.target);
      if (!c || (menuEl && menuEl.contains(e.target))) return;
      B.pos = { r: Number(c.getAttribute('data-r')), c: Number(c.getAttribute('data-c')) };
      B.touched = true;
      paintInfo();
    });
    sec.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'pb-q') { B.q = e.target.value; B.pos = { r: 0, c: 0 }; paintTable(); }
    });
    sec.addEventListener('change', function (e) {
      const t = e.target;
      if (!t) return;
      if (t.id === 'pb-ended') { B.ended = !!t.checked; setErr(''); load('refresh'); }
    });
    wired = true;
    return true;
  }

  // ── 바깥(prep.js)이 쓰는 문 ──
  // hooks: { req, roleLabel, openCase(bid, name, { row, marks, scope }), openMap() }. o: { reload: 상세에서 돌아옴, focusBid }
  pb.show = function (hooks, o) {
    if (typeof document === 'undefined' || !el('pp-board')) return false;
    if (!wired && !wire()) return false;
    B.hooks = hooks;
    const x = o || {};
    load(x.reload ? 'refresh' : 'open', x.focusBid ? str(x.focusBid) : '');
    return true;
  };
  // 표를 가리기 전에 불린다(상세로 갈 때): 스크롤을 적어 두었다가 돌아오면 되돌린다.
  pb.leave = function () {
    if (typeof document === 'undefined') return;
    closeMenu(false);
    const box = el('pb-scroll');
    if (box) B.scroll = { l: box.scrollLeft, t: box.scrollTop };
  };
  // 계정이 바뀌면 이전 계정의 표·거르기·저장 중 표시를 버린다.
  pb.reset = function () {
    closeMenu(false);   // 옛 B.menu가 살아 있을 때 먼저 닫는다
    B = fresh();
    if (typeof document === 'undefined') return;
    const box = el('pb-scroll'); if (box) box.innerHTML = '';
    const q = el('pb-q'); if (q) q.value = '';
    // 계정 전환 뒤 옛 계정의 표 위 안내·'개설 전' 범례 항목이 남지 않게(qa 11-23 밤 P3). 다음 load의 paintAll/paintMeta가 다시 채운다.
    const ro = el('pb-ro'); if (ro) ro.hidden = true;
    const lg = el('pb-legend'); if (lg) lg.innerHTML = pb.legendHtml(false);
    paintScope();   // 범위는 다음 계정의 첫 응답 scope로 다시 정해진다
    setErr('');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = pb;
  else root.prepboard = pb;
})(typeof self !== 'undefined' ? self : this);
