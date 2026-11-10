(function (root) {
  'use strict';
  // 제안팀 구성·배정 — 준비중 화면 자리(#tab-soon 안 #tm-root, 고정 id 'soon:제안팀')에서 열린다.
  // 규격: handoff/agents/design-reviewer/2026-11-10_1257_a0866e54.md §5·§6.
  //
  // 서버 계약(기존): GET/POST /bidcases/{id}/assignments · GET .../assignments/history · GET /me/assignments ·
  //                 POST /approval-requests/assignee-change
  // 서버 계약(신규, 백엔드 병행): GET /assignment-candidates → [{emp_no,name,position_title,role}],
  //                 pending_change.add_people / remove_people:[{emp_no,name}] · requested_by_name
  // 버튼을 보일지는 서버 viewer 플래그를 따른다(화면이 권한을 새로 해석하지 않는다).
  // 이 파일은 순수 함수(위)와 DOM 배선(아래)으로 나뉜다. 순수 함수만 node 테스트 대상이다.
  const tm = {};
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const roles = isNode ? require('./roles.js') : root.roles;
  const errtext = isNode ? require('./errtext.js') : root.errtext;

  tm.SOON_ID = 'soon:제안팀';                 // nav.TEAM_ID와 같아야 한다(테스트가 대조)
  tm.MAX = 10;
  tm.REASON_MAX = 200;
  tm.LEAD = '영업팀장';
  tm.VIEW_ROLES = ['영업팀', '영업팀장', '영업부장'];   // nav.TEAM_ROLES와 같아야 한다
  tm.TABS = [{ key: 'all', label: '전체' }, { key: 'mine', label: '내 담당' }];

  // ── 문구 (규격 §5-1) ────────────────────────────────────────────────
  const T = {
    pickHint: '왼쪽에서 입찰 건을 고르세요. 임박한 건이 위에 있습니다.',
    emptyAll: '입찰 공고가 등록된 기관이 없습니다. 공고가 등록되면 여기에 나타납니다.',
    emptyMine: '내가 담당인 입찰 건이 없습니다.',
    emptyQuery: function (q) { return '\'' + q + '\'와 맞는 기관이 없습니다.'; },
    noMatchUser: function (q) { return '\'' + q + '\'와 맞는 사용자가 없습니다.'; },
    noAddable: '추가할 수 있는 담당자 후보가 없습니다.',
    loading: '불러오는 중…',
    listErr: '입찰 건 목록을 불러오지 못했습니다.',
    detailErr: '담당자 정보를 불러오지 못했습니다.',
    retry: '다시 시도',
    login: '로그인이 필요합니다. 사번으로 로그인해 주세요.',
    file: '서버에 연결된 상태에서만 쓸 수 있는 화면입니다.',
    forbidden: function (role) {
      const label = roles.roleLabel(String(role || '').trim());
      return '이 화면은 영업팀·영업팀장·영업부장이 쓰는 화면입니다. 지금 계정(' + (label || '소속 없음') + ')으로는 볼 수 없습니다.';
    },
    unassigned: '아직 담당자가 배정되지 않았습니다. 영업팀장이 배정하면 여기에 표시됩니다.',
    pendingWhy: '결재 중인 변경 신청이 끝난 뒤 다시 신청할 수 있습니다.',
    noQualify: '담당자 변경은 현재 담당자 또는 영업팀장이 신청합니다.',
    noCands: '배정할 수 있는 영업팀 사용자가 없습니다. 시스템 관리자에게 사용자 등록을 요청하세요.',
    assignWhy: '한 명 이상 고르세요.',
    maxNote: '최대 10명까지 고를 수 있습니다. 바꾸려면 먼저 한 명을 빼세요.',
    selfNote: '본인을 포함하면 이력에 \'팀장 자기 포함 배정\'으로 남습니다.',
    assignConfirm: function (n) { return '선택한 ' + n + '명을 담당자로 배정합니다. 배정 뒤에는 담당자 변경 신청(결재)으로만 바꿀 수 있습니다.'; },
    assigned: function (n) { return '담당자 ' + n + '명을 배정했습니다.'; },
    modalTitle: function (name) { return '담당자 변경 신청 — ' + name; },
    changeEmpty: '추가하거나 해제할 담당자를 한 명 이상 고르세요.',
    changeNone: '담당자는 최소 1명이어야 합니다. 해제할 사람을 줄이거나 추가할 사람을 고르세요.',
    changeTooMany: '담당자는 10명을 넘을 수 없습니다. 추가할 사람을 줄이세요.',
    reasonHint: '사유에는 개인정보(연락처·주민등록번호 등)를 적지 마세요.',   // 예시는 Pii.scan 범위 확인 뒤 확정(이관)
    approverBase: '결재자는 신청 내용에 따라 시스템이 정합니다.',
    approverMore: ' 신청 뒤 [결재함 › 내가 올린 요청]에서 결재 진행을 볼 수 있습니다.',
    closeAsk: '적은 사유가 사라집니다. 닫을까요?',
    changeDone: '담당자 변경을 신청했습니다. 결재가 끝나면 담당자 목록에 반영됩니다.',
    selfReport: '로그인 신원을 확인하지 않은 기록입니다',
    noHistory: '아직 배정 기록이 없습니다.',
    pii: '사유에 개인정보로 보이는 내용이 있습니다. 그 부분을 지우고 다시 올리세요.',
    notFound: '이 입찰 건을 찾을 수 없습니다. 목록을 새로 고쳐 주세요.',
    network: '서버에 연결하지 못해 처리되지 않았습니다. 잠시 뒤 다시 시도하세요.',
    noWrite: '이 작업을 할 권한이 없습니다.',
  };
  tm.T = T;

  // 오류 코드 → 문구·후속 동작(규격 §5-1 표). after: keep(그 자리에 보임) · reload(상세 다시) · closeReload(모달 닫고 다시) · reason · none
  const ERR_BY_CODE = {
    ASSIGNED_ALREADY: { text: '다른 사람이 먼저 담당자를 배정했습니다. 현재 담당자를 다시 불러왔습니다. 바꾸려면 담당자 변경 신청을 하세요.', after: 'reload' },
    CHANGE_PENDING: { text: '이 입찰 건에는 결재 중인 변경 신청이 이미 있습니다. 결재가 끝난 뒤 다시 신청하세요.', after: 'closeReload' },
    NOT_ASSIGNED: { text: '아직 담당자가 배정되지 않은 입찰 건입니다. 영업팀장이 먼저 배정해야 변경을 신청할 수 있습니다.', after: 'closeReload' },
    NO_ASSIGNEE_LEFT: { text: '변경 후 담당자가 한 명도 남지 않습니다. 해제할 사람을 줄이거나 추가할 사람을 고르세요.', after: 'keep' },
    TOO_MANY_ASSIGNEES: { text: '변경 후 담당자가 10명을 넘습니다. 추가할 사람을 줄이거나 해제할 사람을 고르세요.', after: 'keep' },
    APPROVER_NOT_RESOLVED: { text: '결재자를 정할 수 없어 신청하지 못했습니다. 시스템 관리자에게 상위 결재자 지정을 요청하세요.', after: 'keep' },
  };

  function esc(s) { return logic.esc(s == null ? '' : s); }

  // ── 열람 자격·게이트 ───────────────────────────────────────────────
  tm.canView = function (role) { return tm.VIEW_ROLES.indexOf(String(role || '').trim()) >= 0; };

  // 화면 전체를 대신하는 상태. 없으면 null(정상). 순서: 서버 없음 → 로그인 → 권한.
  tm.gateOf = function (ctx) {
    const c = ctx || {};
    if (!c.serverMode) return { kind: 'file', text: T.file };
    if (!c.emp) return { kind: 'login', text: T.login };
    if (!tm.canView(c.role)) return { kind: 'forbidden', text: T.forbidden(c.role) };
    return null;
  };

  // ── 목록 ────────────────────────────────────────────────────────────
  // 지도(logic.computeUrgency)와 같은 경계: 182일 이내(지난 것 포함) 빨강, 365일 이내 주황.
  tm.ddayClass = function (days) {
    if (days == null || !isFinite(days)) return 'unknown';
    if (days <= 182) return 'urgent';
    if (days <= 365) return 'soon';
    return 'later';
  };

  // 입찰 예정일 글자. 확정이면 '(확정)', 그 밖(예상일·지난 입찰+주기 추정)은 '(예상)'. 규격은 '추정'이 아니라 '예상'.
  tm.bidDate = function (rec) {
    const e = logic.effectiveBid(rec || {});
    if (!e.date) return { date: null, conf: null, text: '미상' };
    const conf = e.confidence === '확정' ? '확정' : '예상';
    return { date: e.date, conf: conf, text: e.date + '(' + conf + ')' };
  };

  // 레코드 → 목록 행. bidCaseId 없는 기관은 뺀다. 같은 bidCaseId(일반구 폴리곤 반복)는 한 번만.
  // 정렬: 입찰 예정일 오름차순(지난 날짜가 맨 위), 날짜 미상은 맨 아래, 같으면 이름 순.
  tm.listRows = function (records, today, mineIds, regionNames) {
    const mine = {};
    (mineIds || []).forEach(function (id) { mine[id] = true; });
    const seen = {};
    const out = [];
    (records || []).forEach(function (r) {
      if (!r || !r.bidCaseId || seen[r.bidCaseId]) return;
      seen[r.bidCaseId] = true;
      const bd = tm.bidDate(r);
      const days = logic.daysUntil(bd.date, today);
      out.push({
        id: r.bidCaseId,
        name: r.name || '',
        region: (regionNames && regionNames[r.region]) || r.region || '',
        status: r.participationStatus || '검토중',
        date: bd.date,
        conf: bd.conf,
        days: isFinite(days) ? days : null,
        dday: logic.formatDDay(r, today),
        ddayClass: tm.ddayClass(isFinite(days) ? days : null),
        mine: !!mine[r.bidCaseId],
      });
    });
    out.sort(function (a, b) {
      if (a.date && b.date) { if (a.date !== b.date) return a.date < b.date ? -1 : 1; }
      else if (a.date || b.date) return a.date ? -1 : 1;
      return a.name.localeCompare(b.name, 'ko');
    });
    return out;
  };

  tm.filterRows = function (rows, filter, query) {
    const q = String(query || '').trim().toLowerCase();
    return (rows || []).filter(function (r) {
      return (filter !== 'mine' || r.mine) && (!q || r.name.toLowerCase().indexOf(q) >= 0);
    });
  };

  tm.emptyText = function (filter, query) {
    const q = String(query || '').trim();
    if (q) return T.emptyQuery(q);
    return filter === 'mine' ? T.emptyMine : T.emptyAll;
  };

  tm.countText = function (n) { return n + '건'; };

  // ── 상세: 역할별 표시 (규격 §6-7 — 서버 viewer를 그대로 따른다) ───────
  // phase: assign(최초 배정 폼) | empty(배정 전 안내) | list(담당자 표)
  // button: none | enabled | disabled(진행 중 신청 있음) — note는 비활성 사유 또는 자격 안내
  tm.viewerState = function (view, role) {
    const v = (view && view.viewer) || {};
    const assigned = !!(view && view.assigned);
    const pending = !!(view && view.pending_change);
    const lead = String(role || '').trim() === tm.LEAD;
    if (!assigned) return { phase: v.can_assign ? 'assign' : 'empty', pending: false, button: 'none', note: '' };
    if (v.can_request_change) return { phase: 'list', pending: pending, button: 'enabled', note: '' };
    if (pending && (v.is_assignee || lead)) return { phase: 'list', pending: pending, button: 'disabled', note: T.pendingWhy };
    return { phase: 'list', pending: pending, button: 'none', note: T.noQualify };
  };

  tm.kst = function (iso) {
    const t = Date.parse(String(iso || ''));
    if (isNaN(t)) return String(iso || '');
    return new Date(t + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);
  };
  tm.kstDate = function (iso) { return tm.kst(iso).slice(0, 10); };

  tm.assigneeRows = function (assignees, myEmp) {
    return (assignees || []).map(function (a) {
      return { empNo: a.emp_no, name: a.name || '', position: a.position_title || '',
               date: tm.kstDate(a.assigned_at), isMe: !!myEmp && a.emp_no === myEmp };
    });
  };

  // 이력: 최근 순(서버는 오래된 순). 같은 시각이면 나중에 기록된 것이 위.
  tm.historyRows = function (list) {
    const idx = (list || []).map(function (h, i) { return { h: h, i: i }; });
    idx.sort(function (a, b) {
      const x = String(a.h.logged_at || ''), y = String(b.h.logged_at || '');
      if (x !== y) return x < y ? 1 : -1;
      return b.i - a.i;
    });
    return idx.map(function (o) {
      const h = o.h;
      return {
        when: tm.kst(h.logged_at),
        content: (h.action_name || h.action_cd || '') + ' — ' + (h.target_name || ''),
        reflected: !!h.req_id,
        actor: h.actor_name || '',
        selfReport: h.emp_verified !== true,        // true일 때만 아무것도 붙이지 않는다. 신원 확인 표기는 붙이지 않는다
        reason: String(h.reason == null ? '' : h.reason).trim() || '-',
      };
    });
  };

  // 진행 중 변경 신청 안내. 이름은 서버가 준 add_people/remove_people, 없으면 현재 담당자와 맞춰 찾는다(모두 찾을 때만).
  tm.pendingInfo = function (p, assignees) {
    if (!p) return null;
    const addNos = p.add_emp_nos || [];
    const remNos = p.remove_emp_nos || [];
    const a = (p.add_people || addNos).length;
    const r = (p.remove_people || remNos).length;
    const lines = [];
    let remNames = null;
    if (Array.isArray(p.remove_people)) remNames = p.remove_people.map(function (x) { return x.name; });
    else {
      const byEmp = {};
      (assignees || []).forEach(function (x) { byEmp[x.emp_no] = x.name; });
      const found = remNos.map(function (e) { return byEmp[e]; });
      if (found.length && found.every(function (n) { return !!n; })) remNames = found;
    }
    if (remNames && remNames.length) lines.push('해제: ' + remNames.join(', '));
    if (Array.isArray(p.add_people) && p.add_people.length) {
      lines.push('추가: ' + p.add_people.map(function (x) { return x.name; }).join(', '));
    }
    if (p.requested_by_name) lines.push('신청: ' + p.requested_by_name);
    return {
      text: '담당자 변경 신청이 결재 중입니다 — 추가 ' + a + '명 · 해제 ' + r + '명. 결재가 끝나면 이 목록에 반영됩니다.',
      lines: lines,
    };
  };

  // ── 체크 목록(최초 배정·변경 신청 공통) ─────────────────────────────
  tm.togglePick = function (sel, emp, max) {
    const list = (sel || []).slice();
    const i = list.indexOf(emp);
    if (i >= 0) { list.splice(i, 1); return list; }
    if (max && list.length >= max) return list;
    list.push(emp);
    return list;
  };

  tm.filterCands = function (cands, query, excludeEmps) {
    const q = String(query || '').trim().toLowerCase();
    const ex = {};
    (excludeEmps || []).forEach(function (e) { ex[e] = true; });
    return (cands || []).filter(function (c) {
      return !ex[c.emp_no] && (!q || String(c.name || '').toLowerCase().indexOf(q) >= 0);
    });
  };

  tm.assignState = function (n) {
    return { text: n + ' / ' + tm.MAX + '명 선택', full: n >= tm.MAX, disabled: n < 1, why: n < 1 ? T.assignWhy : '' };
  };

  // 변경 후 인원 미리보기. current·remove·add는 배열(길이만 센다).
  tm.changePreview = function (current, remove, add) {
    const c = (current || []).length, r = (remove || []).length, a = (add || []).length;
    const k = c + a - r;
    const base = { k: k, c: c, a: a, r: r };
    if (a + r === 0) return Object.assign(base, { k: c, state: 'empty', canSubmit: false, text: T.changeEmpty });
    if (k < 1) return Object.assign(base, { state: 'none-left', canSubmit: false, text: T.changeNone });
    if (k > tm.MAX) return Object.assign(base, { state: 'too-many', canSubmit: false, text: T.changeTooMany });
    return Object.assign(base, { state: 'ok', canSubmit: true,
      text: '변경 후 ' + k + '명 (현재 ' + c + ' · 추가 ' + a + ' · 해제 ' + r + ')' });
  };

  // 쓰기 오류 → { text, after }. 해석 순서: code → 상태 → detail.message → 기본 문구 (규격 §4 P1).
  tm.errorInfo = function (status, detail) {
    const p = errtext.parse(detail);
    const hit = p.code && Object.prototype.hasOwnProperty.call(ERR_BY_CODE, p.code) ? ERR_BY_CODE[p.code] : null;
    if (hit) return { text: hit.text, after: hit.after, code: p.code };
    if (!status) return { text: T.network, after: 'keep', code: '' };
    if (status === 401) return { text: T.login, after: 'keep', code: p.code };
    if (status === 422) return { text: T.pii, after: 'reason', code: p.code };
    if (status === 404) return { text: T.notFound, after: 'none', code: p.code };
    if (status === 403) return { text: p.message || T.noWrite, after: 'reload', code: p.code };
    if (status === 409) return { text: p.message || '처리하지 못했습니다 (409)', after: 'reload', code: p.code };
    return { text: p.message || '처리하지 못했습니다 (' + status + ')', after: 'keep', code: p.code };
  };

  // 오류 문구를 어디에 보일지: modal(모달 .ap-err) · assign(확인 줄 아래) · pane(상세 위 알림)
  tm.errorTarget = function (info, where, modalOpen) {
    if (where === 'change' && modalOpen && info.after !== 'closeReload') return 'modal';
    if (where === 'assign' && info.after === 'keep') return 'assign';
    return 'pane';
  };

  // ── HTML 조각(전부 esc) ─────────────────────────────────────────────
  tm.itemsHtml = function (rows, selectedId) {
    return '<ul class="tm-ul">' + rows.map(function (r) {
      const sub = [r.region, r.status].filter(Boolean).join(' · ');
      return '<li><button type="button" class="tm-item" data-id="' + esc(r.id) + '"' +
        (r.id === selectedId ? ' aria-current="true"' : '') + '>' +
        '<span class="tm-item-head"><b>' + esc(r.name) + '</b>' +
        '<span class="dg-day ' + r.ddayClass + '">' + esc(r.dday) + '</span></span>' +
        '<span class="tm-item-sub"><span>' + esc(sub) + '</span>' +
        (r.mine ? '<span class="ad-badge tm-mine">내 담당</span>' : '') + '</span></button></li>';
    }).join('') + '</ul>';
  };

  tm.caseHeadHtml = function (row) {
    const r = row || { name: '', region: '', status: '', date: null, conf: null, dday: '미상', ddayClass: 'unknown' };
    const parts = [];
    if (r.region) parts.push(esc(r.region));
    parts.push(r.date ? '입찰 예정일 <span class="tm-mono">' + esc(r.date) + '</span>' + esc('(' + r.conf + ')') : '입찰 예정일 미상');
    if (r.status) parts.push(esc(r.status));
    return '<div class="tm-case-head"><div><h2 id="tm-case-title" class="tm-title">' + esc(r.name) + '</h2>' +
      '<div class="tm-meta">' + parts.join(' · ') + '</div></div>' +
      '<span class="dg-day ' + r.ddayClass + '">' + esc(r.dday) + '</span></div>';
  };

  tm.assigneesTableHtml = function (rows) {
    return '<div class="tm-tbl-wrap"><table class="ad-table"><thead><tr><th>이름</th><th>직위</th><th>배정일</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(r.name) + (r.isMe ? ' <span class="tm-me">(나)</span>' : '') + '</td><td>' + esc(r.position) +
          '</td><td class="mono">' + esc(r.date) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  };

  tm.historyHtml = function (rows) {
    if (!rows.length) return '<p class="wf-empty">' + esc(T.noHistory) + '</p>';
    return '<div class="tm-tbl-wrap"><table class="ad-table"><thead><tr><th>시각</th><th>내용</th><th>처리자</th><th>사유</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td class="tm-t-time">' + esc(r.when) + '</td><td>' + esc(r.content) +
          (r.reflected ? ' <span class="tm-me">· 결재 반영</span>' : '') + '</td><td>' + esc(r.actor) +
          (r.selfReport ? ' <span class="ad-badge muted tm-selfrep" title="' + esc(T.selfReport) + '" aria-label="' + esc(T.selfReport) + '">자기신고</span>' : '') +
          '</td><td class="tm-t-reason">' + esc(r.reason) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  };

  // 체크 행. opts: { max, describedBy, meEmp }. 사번은 data 속성에만 둔다(화면에 글자로 내지 않는다).
  tm.picksHtml = function (list, selected, opts) {
    const o = opts || {};
    const on = {};
    (selected || []).forEach(function (e) { on[e] = true; });
    const atMax = !!o.max && (selected || []).length >= o.max;
    return list.map(function (c) {
      const checked = !!on[c.emp_no];
      const off = !checked && atMax;
      return '<label class="tm-pick' + (checked ? ' on' : '') + (off ? ' off' : '') + '">' +
        '<input type="checkbox" data-emp="' + esc(c.emp_no) + '"' + (checked ? ' checked' : '') +
        (off ? ' disabled aria-describedby="' + esc(o.describedBy || '') + '"' : '') + '>' +
        '<span class="tm-pick-name">' + esc(c.name) + (o.meEmp && c.emp_no === o.meEmp ? ' <span class="tm-me">(나)</span>' : '') + '</span>' +
        (c.position_title ? '<span class="tm-pick-pos">' + esc(c.position_title) + '</span>' : '') +
        (c.role ? '<span class="ad-badge">' + esc(roles.roleLabel(c.role)) + '</span>' : '') + '</label>';
    }).join('');
  };

  function pickListHtml(cands, selected, q, opts, emptyAllText, excludeEmps) {
    const shown = tm.filterCands(cands, q, excludeEmps);
    if (shown.length) return tm.picksHtml(shown, selected, opts);
    const qq = String(q || '').trim();
    return '<p class="wf-empty">' + esc(qq ? T.noMatchUser(qq) : emptyAllText) + '</p>';
  }
  tm.pickListHtml = pickListHtml;

  tm.assignFormHtml = function (m) {
    const cands = m.cands || [];
    const sel = m.sel || [];
    const st = tm.assignState(sel.length);
    let inner;
    if (!cands.length) {
      inner = '<p class="wf-empty">' + esc(T.noCands) + '</p>';
    } else {
      inner = '<div class="tm-fs-top"><input type="text" id="tm-assign-q" placeholder="이름 검색" aria-label="이름 검색" autocomplete="off" value="' + esc(m.q || '') + '">' +
        '<span id="tm-assign-n" class="tm-count' + (st.full ? ' full' : '') + '" aria-live="polite">' + esc(st.text) + '</span></div>' +
        '<div class="tm-picks" id="tm-assign-picks">' +
        pickListHtml(cands, sel, m.q, { max: tm.MAX, describedBy: 'tm-max-note', meEmp: m.meEmp }, T.noCands, []) + '</div>' +
        '<p class="tm-note" id="tm-max-note"' + (st.full ? '' : ' hidden') + '>' + esc(T.maxNote) + '</p>' +
        '<p class="tm-note" id="tm-self-note"' + (sel.indexOf(m.meEmp) >= 0 ? '' : ' hidden') + '>' + esc(T.selfNote) + '</p>';
    }
    return '<fieldset class="tm-fs" id="tm-assign"><legend>담당자 선택 (1~10명)</legend>' + inner +
      '<div class="tm-actions"><button type="button" id="tm-assign-go" aria-describedby="tm-assign-why"' +
      (st.disabled || !cands.length ? ' disabled' : '') + '>담당자 배정</button>' +
      '<span class="tm-why" id="tm-assign-why">' + esc(cands.length ? st.why : '') + '</span></div>' +
      '<div id="tm-assign-confirm"></div><div id="tm-assign-err" class="ap-err" role="alert"></div></fieldset>';
  };

  tm.assignConfirmHtml = function (n) {
    return '<div class="bd-confirm" role="group"><span>' + esc(T.assignConfirm(n)) + '</span>' +
      '<button type="button" id="tm-assign-cancel">취소</button>' +
      '<button type="button" id="tm-assign-ok" class="bd-primary">배정 확정</button></div>';
  };

  tm.closeConfirmHtml = function () {
    return '<div class="bd-confirm" role="group"><span>' + esc(T.closeAsk) + '</span>' +
      '<button type="button" id="tm-m-keep">계속 작성</button>' +
      '<button type="button" id="tm-m-discard">닫기</button></div>';
  };

  tm.previewHtml = function (p) {
    if (p.state !== 'ok') return esc(p.text);
    return '변경 후 <span class="tm-mono">' + p.k + '</span>명 (현재 <span class="tm-mono">' + p.c +
      '</span> · 추가 <span class="tm-mono">' + p.a + '</span> · 해제 <span class="tm-mono">' + p.r + '</span>)';
  };

  // 상세 본문(담당자 절 + 배정 이력 절). m: { view, history, cands, role, meEmp, assign:{sel,q} }
  tm.caseBodyHtml = function (m) {
    const view = m.view || {};
    const vs = tm.viewerState(view, m.role);
    const rows = tm.assigneeRows(view.assignees, m.meEmp);
    let staff = '<div class="tm-sec"><h3>담당자 <span class="tm-n">' + rows.length + '명</span>' +
      (vs.pending ? '<span class="tm-pend">변경 결재 중</span>' : '') + '</h3>';
    if (vs.phase === 'assign') {
      staff += tm.assignFormHtml({ cands: m.cands, sel: (m.assign || {}).sel, q: (m.assign || {}).q, meEmp: m.meEmp });
    } else if (vs.phase === 'empty') {
      staff += '<p class="wf-empty">' + esc(T.unassigned) + '</p>';
    } else {
      staff += tm.assigneesTableHtml(rows);
      const pi = tm.pendingInfo(view.pending_change, view.assignees);
      if (pi) {
        staff += '<div class="tm-pendbox" role="note"><div>' + esc(pi.text) + '</div>' +
          pi.lines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>';
      }
      if (vs.button === 'enabled') {
        staff += '<div class="tm-actions"><button type="button" id="tm-change-btn">담당자 변경 신청</button></div>';
      } else if (vs.button === 'disabled') {
        staff += '<div class="tm-actions"><button type="button" id="tm-change-btn" disabled aria-describedby="tm-change-why">담당자 변경 신청</button>' +
          '<span class="tm-why" id="tm-change-why">' + esc(vs.note) + '</span></div>';
      } else if (vs.note) {
        staff += '<p class="tm-why">' + esc(vs.note) + '</p>';
      }
    }
    staff += '</div>';
    return staff + '<div class="tm-sec"><h3>배정 이력 <span class="tm-n">최근 순</span></h3>' +
      tm.historyHtml(tm.historyRows(m.history)) + '</div>';
  };

  // 변경 신청 모달. m: { name, assignees, cands, meEmp, approvalsHint }
  tm.modalHtml = function (m) {
    const cur = m.assignees || [];
    const curEmps = cur.map(function (a) { return a.emp_no; });
    return '<div class="modal-box tm-modal-box" role="dialog" aria-modal="true" aria-labelledby="tm-m-title">' +
      '<h3 id="tm-m-title">' + esc(T.modalTitle(m.name)) + '</h3>' +
      '<div class="modal-scroll tm-m-body">' +
      '<fieldset class="tm-fs"><legend>해제할 담당자</legend><div class="tm-picks tm-picks-rm" id="tm-rm-picks">' +
        tm.picksHtml(cur, [], { meEmp: m.meEmp }) + '</div></fieldset>' +
      '<fieldset class="tm-fs"><legend>추가할 담당자</legend>' +
        '<div class="tm-fs-top"><input type="text" id="tm-add-q" placeholder="이름 검색" aria-label="이름 검색" autocomplete="off"></div>' +
        '<div class="tm-picks" id="tm-add-picks">' + pickListHtml(m.cands || [], [], '', { meEmp: m.meEmp }, T.noAddable, curEmps) + '</div></fieldset>' +
      '<p id="tm-preview" class="tm-preview" aria-live="polite"></p>' +
      '<div class="tm-reason-row"><label for="tm-reason">변경 사유 (필수)</label><span id="tm-rcount" class="tm-count">0/' + tm.REASON_MAX + '</span></div>' +
      '<textarea id="tm-reason" rows="3" maxlength="' + tm.REASON_MAX + '" aria-required="true" aria-describedby="tm-rhint tm-rcount"></textarea>' +
      '<p id="tm-rhint" class="tm-note">' + esc(T.reasonHint) + '</p>' +
      '<p class="tm-note">' + esc(T.approverBase + (m.approvalsHint ? T.approverMore : '')) + '</p>' +
      '<div id="tm-m-err" class="ap-err" role="alert"></div></div>' +
      '<div id="tm-m-confirm"></div>' +
      '<div class="tm-m-actions"><button type="button" id="tm-m-cancel">취소</button>' +
      '<button type="button" id="tm-m-go" disabled aria-describedby="tm-preview">변경 신청 올리기</button></div></div>';
  };

  // ════════════════════════════════════════════════════════════════
  // 아래는 DOM 배선 — mount()가 불릴 때만 실행된다(노드 테스트 대상 아님).
  // ════════════════════════════════════════════════════════════════
  function freshAssign() { return { sel: [], q: '', confirming: false, busy: false }; }
  function freshState() {
    return { who: '', filter: 'all', query: '', selected: '', rows: [], mineIds: [], mineFail: false, mineLoaded: false,
             detail: null, assign: freshAssign(), modal: null, seq: 0, mineSeq: 0, refocus: false };
  }
  let S = freshState();
  let wired = false;

  function el(id) { return document.getElementById(id); }
  function myEmp() { return ((root.store.loadSession() || {}).emp) || ''; }
  function myRole() { return (root.store.loadProfile().team || '').trim(); }
  function whoNow() { return myEmp() + '|' + myRole(); }
  function today() { return new Date(logic.localDateStr(new Date()) + 'T00:00:00'); }
  function caseUrl(id) { return '/bidcases/' + encodeURIComponent(id); }

  // 모든 호출은 이 함수 하나로. 실패하면 Error에 status·detail을 달아 던진다(네트워크 실패는 status 없음).
  function req(method, url, body) {
    const init = { method: method };
    if (body !== undefined) { init.headers = { 'Content-Type': 'application/json' }; init.body = JSON.stringify(body); }
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

  function buildRows() {
    const names = (root.render && root.render.REGION_NAME) || {};
    S.rows = tm.listRows(root.store.loadData() || [], today(), S.mineIds, names);
  }
  function rowOf(id) { return S.rows.filter(function (r) { return r.id === id; })[0] || null; }

  function paintGate(gate) {
    el('tm-gate').innerHTML = gate ? '<p class="wf-empty">' + esc(gate.text) + '</p>' : '';
    el('tm-wrap').style.display = gate ? 'none' : '';
  }

  function paintTabs() {
    el('tm-tabs').innerHTML = tm.TABS.map(function (t) {
      return '<button type="button" role="tab" id="tm-tab-' + t.key + '" data-tab="' + t.key + '">' + esc(t.label) + '</button>';
    }).join('');
    markTabs();
  }
  function markTabs() {
    tm.TABS.forEach(function (t) {
      const b = el('tm-tab-' + t.key);
      if (!b) return;
      b.className = t.key === S.filter ? 'on' : '';
      b.setAttribute('aria-selected', t.key === S.filter ? 'true' : 'false');
    });
  }

  function paintList() {
    const box = el('tm-items');
    if (S.filter === 'mine' && !S.mineLoaded) {
      box.innerHTML = '<p class="wf-empty">' + esc(T.loading) + '</p>';
      el('tm-count').textContent = '';
      return;
    }
    if (S.filter === 'mine' && S.mineFail) {
      box.innerHTML = '<p class="wf-empty">' + esc(T.listErr) + '</p><button type="button" id="tm-retry-list">' + esc(T.retry) + '</button>';
      el('tm-count').textContent = '';
      return;
    }
    const rows = tm.filterRows(S.rows, S.filter, S.query);
    el('tm-count').textContent = tm.countText(rows.length);
    box.innerHTML = rows.length ? tm.itemsHtml(rows, S.selected)
      : '<p class="wf-empty">' + esc(tm.emptyText(S.filter, S.query)) + '</p>';
  }
  // 선택 표시는 속성만 바꾼다 — 목록을 다시 그리면 키보드 포커스를 잃는다.
  function markSelected() {
    Array.prototype.forEach.call(el('tm-items').querySelectorAll('.tm-item'), function (b) {
      if (b.getAttribute('data-id') === S.selected) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  }

  function paintCase() {
    const box = el('tm-case');
    const d = S.detail;
    if (!S.selected || !d) {
      box.setAttribute('aria-busy', 'false');
      box.innerHTML = '<h2 id="tm-case-title" class="sr-only">제안팀 구성·배정</h2><p class="wf-empty">' + esc(T.pickHint) + '</p>';
      return;
    }
    const row = rowOf(S.selected) || { id: S.selected, name: S.selected, region: '', status: '', date: null, conf: null, dday: '미상', ddayClass: 'unknown' };
    const head = tm.caseHeadHtml(row);
    if (d.loading) {
      box.setAttribute('aria-busy', 'true');
      box.innerHTML = head + '<p class="wf-empty">' + esc(T.loading) + '</p>';
      return;
    }
    box.setAttribute('aria-busy', 'false');
    if (d.err) {
      const st = d.err.status;
      if (st === 401) { paintGate({ text: T.login }); return; }
      if (st === 403) { paintGate({ text: T.forbidden(myRole()) }); return; }
      box.innerHTML = head + (st === 404
        ? '<p class="wf-empty">' + esc(T.notFound) + '</p>'
        : '<p class="wf-empty">' + esc(T.detailErr) + '</p><button type="button" id="tm-retry-detail">' + esc(T.retry) + '</button>');
      return;
    }
    box.innerHTML = head + tm.caseBodyHtml({ view: d.view, history: d.history, cands: d.cands, role: myRole(),
      meEmp: myEmp(), assign: S.assign });
  }

  function clearNotices() { el('tm-flash').innerHTML = ''; el('tm-perr').textContent = ''; }
  function canOpenApprovals() {
    const b = document.getElementById('tab-btn-approvals');
    return !!b && b.style.display !== 'none';
  }
  function setFlash(text, withLink) {
    el('tm-flash').innerHTML = esc(text) + (withLink ? ' <a href="#" id="tm-to-approvals" class="tm-link">결재함에서 보기</a>' : '');
  }
  function toApprovals() {
    const b = document.getElementById('tab-btn-approvals');
    if (!b || b.style.display === 'none') return;
    if (root.approvals && root.approvals.openTab) root.approvals.openTab('mine');
    b.click();
  }

  function loadMine() {
    const token = ++S.mineSeq;
    return req('GET', '/me/assignments').then(function (list) {
      if (token !== S.mineSeq) return;
      S.mineIds = (Array.isArray(list) ? list : []).map(function (x) { return x.bid_case_id; });
      S.mineFail = false;
      S.mineLoaded = true;
    }).catch(function (e) {
      if (token !== S.mineSeq) return;
      S.mineFail = true;
      S.mineLoaded = true;
      if (e && e.status === 401) paintGate({ text: T.login });
    }).then(function () {
      if (token !== S.mineSeq) return;
      buildRows();
      paintList();
    });
  }

  function loadDetail(id) {
    const token = ++S.seq;
    S.detail = { loading: true };
    S.assign = freshAssign();
    paintCase();
    const base = caseUrl(id);
    req('GET', base + '/assignments').then(function (view) {
      const v = (view && view.viewer) || {};
      const needCands = !!(v.can_assign || v.can_request_change);
      return Promise.all([
        req('GET', base + '/assignments/history'),
        needCands ? req('GET', '/assignment-candidates') : Promise.resolve(null),
      ]).then(function (r) { return { view: view, history: r[0], cands: r[1] }; });
    }).then(function (d) {
      if (token !== S.seq) return;
      S.detail = { view: d.view, history: Array.isArray(d.history) ? d.history : [], cands: Array.isArray(d.cands) ? d.cands : [] };
      paintCase();
      afterDetail();
    }).catch(function (e) {
      if (token !== S.seq) return;
      S.detail = { err: { status: e && e.status, detail: e && e.detail } };
      paintCase();
      afterDetail();
    });
  }
  function afterDetail() {
    if (!S.refocus) return;
    S.refocus = false;
    focusAfterModal();
  }
  function focusAfterModal() {
    const b = el('tm-change-btn');
    const t = (b && !b.disabled) ? b : el('tm-items').querySelector('.tm-item[aria-current="true"]');
    if (t) t.focus();
  }

  function selectCase(id) {
    S.selected = id;
    S.modal = null;
    clearNotices();
    markSelected();
    loadDetail(id);
  }

  function refresh() {
    const gate = tm.gateOf({ serverMode: root.store.isServerMode(), emp: myEmp(), role: myRole() });
    paintGate(gate);
    if (gate) return;
    buildRows();
    paintList();
    loadMine();
    if (S.selected) loadDetail(S.selected); else paintCase();
  }

  // ── 최초 배정 ──
  function updateAssignUi() {
    const picks = el('tm-assign-picks');
    const n = S.assign.sel.length;
    const st = tm.assignState(n);
    if (picks) {
      Array.prototype.forEach.call(picks.querySelectorAll('input[data-emp]'), function (cb) {
        const off = st.full && !cb.checked;
        cb.disabled = off;
        if (off) cb.setAttribute('aria-describedby', 'tm-max-note'); else cb.removeAttribute('aria-describedby');
        cb.parentNode.className = 'tm-pick' + (cb.checked ? ' on' : '') + (off ? ' off' : '');
      });
    }
    const cnt = el('tm-assign-n');
    if (cnt) { cnt.textContent = st.text; cnt.className = 'tm-count' + (st.full ? ' full' : ''); }
    const mx = el('tm-max-note'); if (mx) mx.hidden = !st.full;
    const sf = el('tm-self-note'); if (sf) sf.hidden = S.assign.sel.indexOf(myEmp()) < 0;
    const go = el('tm-assign-go'); if (go) go.disabled = st.disabled || S.assign.busy;
    const why = el('tm-assign-why'); if (why) why.textContent = st.why;
  }
  function repaintAssignPicks() {
    const box = el('tm-assign-picks');
    if (!box) return;
    const cands = (S.detail || {}).cands || [];
    box.innerHTML = pickListHtml(cands, S.assign.sel, S.assign.q, { max: tm.MAX, describedBy: 'tm-max-note', meEmp: myEmp() }, T.noCands, []);
  }
  function cancelConfirm() {
    S.assign.confirming = false;
    const c = el('tm-assign-confirm'); if (c) c.innerHTML = '';
  }
  function onAssignGo() {
    if (!S.assign.sel.length || S.assign.busy) return;
    clearNotices();
    S.assign.confirming = true;
    el('tm-assign-err').textContent = '';
    el('tm-assign-confirm').innerHTML = tm.assignConfirmHtml(S.assign.sel.length);
    const ok = el('tm-assign-ok'); if (ok) ok.focus();
  }
  function onAssignCancel() {
    cancelConfirm();
    const go = el('tm-assign-go'); if (go) go.focus();
  }
  function setAssignBusy(b) {
    S.assign.busy = b;
    ['tm-assign-go', 'tm-assign-ok', 'tm-assign-cancel'].forEach(function (id) { const x = el(id); if (x) x.disabled = b; });
    if (!b) updateAssignUi();
  }
  function onAssignOk() {
    if (S.assign.busy) return;
    const id = S.selected;
    const n = S.assign.sel.length;
    if (!id || !n) return;
    el('tm-assign-err').textContent = '';
    setAssignBusy(true);
    req('POST', caseUrl(id) + '/assignments', { emp_nos: S.assign.sel.slice() }).then(function (res) {
      const count = (res && res.assignees && res.assignees.length) || n;
      setFlash(T.assigned(count), false);
      S.refocus = true;
      loadDetail(id);
    }).catch(function (e) {
      setAssignBusy(false);
      handleWriteError(e, 'assign');
    });
  }

  // ── 변경 신청 모달 ──
  function currentAssignees() { return (((S.detail || {}).view || {}).assignees) || []; }
  function updateModalUi() {
    const m = S.modal;
    if (!m) return;
    const p = tm.changePreview(currentAssignees(), m.rm, m.add);
    const pv = el('tm-preview');
    pv.innerHTML = tm.previewHtml(p);
    pv.className = 'tm-preview' + (p.state === 'none-left' || p.state === 'too-many' ? ' bad' : '');
    el('tm-rcount').textContent = m.reason.length + '/' + tm.REASON_MAX;
    el('tm-m-go').disabled = !(p.canSubmit && m.reason.trim()) || m.busy;
    el('tm-m-cancel').disabled = m.busy;
    Array.prototype.forEach.call(el('tm-modal').querySelectorAll('.tm-pick'), function (lab) {
      const cb = lab.querySelector('input');
      lab.className = 'tm-pick' + (cb && cb.checked ? ' on' : '');
    });
  }
  function repaintAddPicks() {
    const box = el('tm-add-picks');
    if (!box || !S.modal) return;
    const cands = (S.detail || {}).cands || [];
    const curEmps = currentAssignees().map(function (a) { return a.emp_no; });
    box.innerHTML = pickListHtml(cands, S.modal.add, S.modal.q, { meEmp: myEmp() }, T.noAddable, curEmps);
  }
  function openModal() {
    const d = S.detail;
    if (!d || !d.view) return;
    const row = rowOf(S.selected);
    S.modal = { rm: [], add: [], q: '', reason: '', closing: false, busy: false };
    const box = el('tm-modal');
    box.innerHTML = tm.modalHtml({ name: row ? row.name : S.selected, assignees: d.view.assignees || [], cands: d.cands || [],
      meEmp: myEmp(), approvalsHint: canOpenApprovals() });
    box.style.display = '';
    updateModalUi();
    const first = el('tm-rm-picks').querySelector('input') || el('tm-add-q');
    if (first) first.focus();
  }
  function closeModal(refocus) {
    const box = el('tm-modal');
    box.style.display = 'none';
    box.innerHTML = '';
    S.modal = null;
    if (refocus) focusAfterModal();
  }
  function keepWriting() {
    if (!S.modal) return;
    S.modal.closing = false;
    el('tm-m-confirm').innerHTML = '';
    const r = el('tm-reason'); if (r) r.focus();
  }
  function requestClose() {
    const m = S.modal;
    if (!m || m.busy) return;
    if (m.closing) { keepWriting(); return; }
    if (m.reason.trim()) {
      m.closing = true;
      el('tm-m-confirm').innerHTML = tm.closeConfirmHtml();
      const k = el('tm-m-keep'); if (k) k.focus();
      return;
    }
    closeModal(true);
  }
  function onChangeGo() {
    const m = S.modal;
    if (!m || m.busy) return;
    const p = tm.changePreview(currentAssignees(), m.rm, m.add);
    if (!p.canSubmit || !m.reason.trim()) return;
    const id = S.selected;
    m.busy = true;
    updateModalUi();
    el('tm-m-err').textContent = '';
    el('tm-reason').removeAttribute('aria-invalid');
    clearNotices();
    req('POST', '/approval-requests/assignee-change', {
      bid_case_id: id, add_emp_nos: m.add.slice(), remove_emp_nos: m.rm.slice(), reason: m.reason.trim(),
    }).then(function () {
      closeModal(false);
      S.refocus = true;
      setFlash(T.changeDone, canOpenApprovals());
      loadDetail(id);
    }).catch(function (e) {
      if (S.modal) { S.modal.busy = false; updateModalUi(); }
      handleWriteError(e, 'change');
    });
  }

  function handleWriteError(e, where) {
    const info = tm.errorInfo(e && e.status, e && e.detail);
    const target = tm.errorTarget(info, where, !!S.modal);
    if (info.after === 'closeReload' && S.modal) closeModal(false);
    if (target === 'modal') { const b = el('tm-m-err'); if (b) b.textContent = info.text; }
    else if (target === 'assign') { const a = el('tm-assign-err'); if (a) a.textContent = info.text; }
    else el('tm-perr').textContent = info.text;
    if (info.after === 'reason') {
      const r = el('tm-reason');
      if (r) { r.setAttribute('aria-invalid', 'true'); r.focus(); }
    }
    if (info.after === 'reload' || info.after === 'closeReload') loadDetail(S.selected);
  }

  // ── 이벤트(#tm-root에 한 번만 위임) ──
  function onClick(e) {
    const t = e.target && e.target.closest ? e.target.closest('button, a') : null;
    if (!t) return;
    if (t.classList.contains('tm-item')) { selectCase(t.getAttribute('data-id')); return; }
    if (t.getAttribute('data-tab')) {
      S.filter = t.getAttribute('data-tab') === 'mine' ? 'mine' : 'all';
      markTabs();
      paintList();
      return;
    }
    switch (t.id) {
      case 'tm-retry-list': S.mineLoaded = false; paintList(); loadMine(); break;
      case 'tm-retry-detail': if (S.selected) loadDetail(S.selected); break;
      case 'tm-assign-go': onAssignGo(); break;
      case 'tm-assign-cancel': onAssignCancel(); break;
      case 'tm-assign-ok': onAssignOk(); break;
      case 'tm-change-btn': openModal(); break;
      case 'tm-m-cancel': requestClose(); break;
      case 'tm-m-go': onChangeGo(); break;
      case 'tm-m-keep': keepWriting(); break;
      case 'tm-m-discard': closeModal(true); break;
      case 'tm-to-approvals': e.preventDefault(); toApprovals(); break;
      default: break;
    }
  }
  function onInput(e) {
    const t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'tm-q') { S.query = t.value; paintList(); }
    else if (t.id === 'tm-assign-q') { S.assign.q = t.value; repaintAssignPicks(); }
    else if (t.id === 'tm-add-q' && S.modal) { S.modal.q = t.value; repaintAddPicks(); }
    else if (t.id === 'tm-reason' && S.modal) {
      S.modal.reason = t.value;
      t.removeAttribute('aria-invalid');
      updateModalUi();
    }
  }
  function onChange(e) {
    const t = e.target;
    const emp = t && t.getAttribute ? t.getAttribute('data-emp') : null;
    if (!emp) return;
    if (t.closest('#tm-assign-picks')) {
      S.assign.sel = tm.togglePick(S.assign.sel, emp, tm.MAX);
      t.checked = S.assign.sel.indexOf(emp) >= 0;
      if (S.assign.confirming) cancelConfirm();         // 선택이 바뀌면 확인 줄은 거둔다
      updateAssignUi();
    } else if (S.modal && t.closest('#tm-rm-picks')) {
      S.modal.rm = tm.togglePick(S.modal.rm, emp, 0);
      updateModalUi();
    } else if (S.modal && t.closest('#tm-add-picks')) {
      S.modal.add = tm.togglePick(S.modal.add, emp, 0);
      updateModalUi();
    }
  }
  function onModalKey(e) {
    if (!S.modal) return;
    if (e.key === 'Escape') { e.preventDefault(); requestClose(); return; }
    if (e.key !== 'Tab') return;
    const list = Array.prototype.filter.call(el('tm-modal').querySelectorAll('button, input, textarea, a[href]'), function (n) {
      return !n.disabled && n.getClientRects().length > 0;
    });
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function wire() {
    const r = el('tm-root');
    r.addEventListener('click', onClick);
    r.addEventListener('input', onInput);
    r.addEventListener('change', onChange);
    el('tm-modal').addEventListener('keydown', onModalKey);
    wired = true;
  }

  // 화면이 열릴 때마다 불린다(app.showSoon). 선택은 유지하고 데이터는 다시 불러온다.
  tm.mount = function () {
    if (typeof document === 'undefined' || !el('tm-root')) return;
    if (!wired) wire();
    const who = whoNow();
    if (who !== S.who) { S = freshState(); S.who = who; }
    el('tm-modal').style.display = 'none';
    el('tm-modal').innerHTML = '';
    S.modal = null;
    paintTabs();
    refresh();
  };
  // 계정이 바뀌면 이전 계정의 선택·목록·열린 모달을 버린다(app.onProfileChanged). 화면이 보이고 있으면 새 계정으로 다시 그린다.
  tm.onProfileChange = function () {
    if (typeof document === 'undefined' || !el('tm-root')) return;
    const who = whoNow();
    if (who === S.who) return;
    S = freshState();
    S.who = who;
    el('tm-modal').style.display = 'none';
    el('tm-modal').innerHTML = '';
    clearNotices();
    if (el('tm-root').style.display !== 'none') { paintTabs(); refresh(); }
  };
  tm.unmount = function () { /* 폴링 없음 */ };

  if (typeof module !== 'undefined' && module.exports) module.exports = tm;
  else root.tm = tm;
})(typeof self !== 'undefined' ? self : this);
