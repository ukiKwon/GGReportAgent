(function (root) {
  'use strict';
  // 기관 사업계획 1단계(2026-11-16). 서버: InstitutionPlanController —
  //   GET /institution-plans/status, GET /institutions/{id}/plans, POST /institution-plans/missing.csv(감사 남는 내려받기).
  // 규격: handoff/agents/design-reviewer/2026-11-16_1007_a15c69be.md (보충 A~G). 새 판정 로직 없이 logic.js·dashboard.js(model·windowItems·filterItems)를 조합한다.
  // 입찰 임박 판정은 서버가 아니라 여기(dash.model)서 한다 — 서버 status 는 institution_id 로 붙이기만 한다.
  // 순수 부분(fmtAmount·budgetCell·srcLineHtml·docHtml·detailHtml·listRows·rowHtml·paneSection 등)은 node 테스트 대상, DOM 부분(mount 이하)은 브라우저 전용.
  // 업로드(관리자)는 1단계에서 뺐다 — 서버 API(POST /institutions/{id}/plans/import)는 있지만 화면은 아직 없다.
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const esc = logic.esc;
  const plans = {};
  function D() { return isNode ? require('./dashboard.js') : root.dashboard; }

  // nav.js 의 자동 id('soon:'+라벨)와 같다 — 라벨을 바꾸면 nav.js 쪽에서 이 id를 명시해야 한다(테스트가 대조).
  plans.SOON_ID = 'soon:기관 사업계획';
  const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
  plans.ID_RE = ID_RE;
  plans.MISSING_MAX = 1000;
  const STATUS_FRESH_MS = 5 * 60 * 1000;   // 현황판 상세 절이 쓰는 현황 캐시 수명(화면을 열 때는 늘 다시 받는다)

  // COMMON_CODE 글자(서버 034 INSERT 와 같은 값). 서버가 이름을 주는 곳(src_kind_name)은 그것을 쓴다.
  const UNIT = { MIL_KRW: '백만원', HUNDRED_MIL_KRW: '억원', THOUSAND_KRW: '천원' };
  const ORIGIN = { IMPORT: '수집 파일 반입', SEED_TXT: '서울 25구 원문에서 옮김' };
  const PROGRESS = { NORMAL: '정상', DONE: '완료', DROPPED: '폐기' };
  plans.unitName = function (cd) { return UNIT[cd] || ''; };

  // ── 순수: 값 도우미 ────────────────────────────────────────────────
  function str(v) { return v == null ? '' : String(v); }
  function mono(s) { return '<span class="v">' + esc(s) + '</span>'; }
  function unk(t) { return '<span class="pop-unk">' + esc(t) + '</span>'; }                 // 점선 칩 = 아직 확인 못 함
  function badge(cls, t) { return badgeHtml(cls, esc(t)); }
  function badgeHtml(cls, html) { return '<span class="wf-badge ' + cls + '">' + html + '</span>'; }   // html 은 호출자가 esc/mono 로 이미 안전하게 만든 조각
  function ymd(s) { return /^\d{4}-\d{2}-\d{2}/.test(str(s)) ? str(s).slice(0, 10) : ''; }
  // 서버 시각(ISO, UTC 또는 +09:00) → 한국 날짜. 해석하지 못하면 앞 10자.
  plans.kstYmd = function (iso) {
    const t = Date.parse(str(iso));
    if (isNaN(t)) return ymd(iso);
    return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
  };
  // 원문 숫자 문자열 → 천 단위 쉼표. 숫자 꼴이 아니면 null(0으로 바꾸지 않는다).
  plans.fmtAmount = function (s) {
    const m = /^(\d+)(?:\.(\d+))?$/.exec(str(s).trim());
    if (!m) return null;
    const dec = (m[2] || '').replace(/0+$/, '');
    return m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec ? '.' + dec : '');
  };
  plans.periodText = function (d) {
    return d.period_from === d.period_to ? d.period_from + '년' : d.period_from + '~' + d.period_to + '년';
  };
  plans.filenameFrom = function (cd) {
    const m = /filename="?([A-Za-z0-9_.-]{1,80})"?/.exec(str(cd));
    return m && /\.csv$/i.test(m[1]) ? m[1] : 'plan_missing.csv';
  };

  // ── 순수: 예산·쪽·출처 ─────────────────────────────────────────────
  // 보충 C: 금액 / 금액·계산값 / 확인안됨 / 예산 미기재 / 해당없음. 원문의 '-'·빈칸을 0으로 바꾸지 않는다.
  // headUnit = 문서 안 금액 단위가 하나일 때 그 코드(열 머리 '예산(백만원)'에 쓰고 칸에서는 단위를 뺀다).
  // 계산값(item.calculated)은 서버가 낸 것(AMOUNT)일 때만 쓴다. 계산값이 확인안됨이면 상위사업 자신의 상태를 그대로 보인다.
  // 확인안됨(UNVERIFIED)은 칩 없이 비고(note)의 '예산 원문: …' 조각을 글자로 보인다(사용자 결정 2026-11-16). 조각은 ' / ' 또는 줄바꿈 앞까지.
  // 조각이 없으면 '예산 미기재'. 40자를 넘으면 40자 + '…'로 자르고 전체는 title 에 둔다.
  const SRC_LIMIT = 40;
  plans.srcBudgetText = function (note) {
    const m = /예산 원문:[ \t]*([^\r\n]*)/.exec(str(note));
    return m ? m[1].split(' / ')[0].trim() : '';
  };
  function unverifiedCell(it) {
    const full = plans.srcBudgetText(it.note);
    if (!full) return { html: '<span class="db-why">예산 미기재</span>', sr: '예산 미기재' };
    const cut = full.length > SRC_LIMIT;
    const shown = cut ? full.slice(0, SRC_LIMIT) + '…' : full;
    return {
      html: '<span class="db-why"' + (cut ? ' title="' + esc(full) + '"' : '') + '>' + esc(shown) + ' (원문 표기)</span>',
      sr: '원문 표기 ' + full,
      src: true,
    };
  }
  plans.budgetCell = function (it, headUnit) {
    const b = it.budget || {}, c = it.calculated;
    let state = b.state_cd, amount = b.amount, unit = b.unit_cd, calc = false;
    if (c && c.is_calculated && c.state_cd === 'AMOUNT' && plans.fmtAmount(c.amount) !== null && UNIT[c.unit_cd]) {
      state = 'AMOUNT'; amount = c.amount; unit = c.unit_cd; calc = true;
    }
    if (state === 'AMOUNT') {
      const n = plans.fmtAmount(amount), u = UNIT[unit];
      if (n === null || !u) return unverifiedCell(it);
      const showU = !(headUnit && unit === headUnit);
      return {
        html: mono(n) + (showU ? ' <span class="u">' + esc(u) + '</span>' : '') + (calc ? '<span class="db-why">계산값</span>' : ''),
        sr: (calc ? '하위사업 합계 계산값 ' : '') + n + ' ' + u,
      };
    }
    if (state === 'NOT_IN_SOURCE') return { html: '<span class="db-why">예산 미기재</span>', sr: '예산 미기재' };   // 사실이라 점선 칩을 쓰지 않는다
    if (state === 'NOT_APPLICABLE') return { html: '<span class="db-why">해당없음</span>', sr: '해당없음' };   // 사실이라 점선 칩을 쓰지 않는다
    return unverifiedCell(it);
  };
  function budgetTd(it, headUnit) {
    const c = plans.budgetCell(it, headUnit);
    return '<td class="pl-bud"><span aria-hidden="true">' + c.html + '</span><span class="sr-only">' + esc(c.sr) + '</span></td>';
  }
  // 쪽수는 화면에 보이지 않는다(사용자 결정 2026-11-16) — 쪽 열·'미확인' 칩 없음.
  // url_missing 이 참이면 src_url 이 있어도 링크를 내지 않는다(한 규칙: url_missing 우선 — docHtml 의 noUrl 안내와 같은 기준).
  function srcUrlOf(d) { return d.url_missing ? null : logic.safeHttpUrl(d.src_url); }
  // 보충 A: 출처 줄 순서 = 종류 · 제목 · 확인일. URL 있으면 링크 + '(인터넷 PC에서 열림)', 없으면 글자만 + '원문 문서' 중립 배지(웹 주소 없음).
  plans.srcLineHtml = function (d) {
    const parts = [];
    const kind = str(d.src_kind_name || d.src_kind_cd).trim();
    if (kind) parts.push(esc(kind));
    const url = srcUrlOf(d);
    const title = str(d.title).trim();
    if (url) parts.push('<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(title || url) + '</a>');
    else if (title) parts.push(esc(title));
    if (ymd(d.checked_on)) parts.push('확인 ' + mono(ymd(d.checked_on)));
    return '<span class="pl-src">' + parts.join(' · ') + '</span>' + (url ? ' <span class="db-why">(인터넷 PC에서 열림)</span>' : ' <span class="wf-badge pp-neutral" title="원문 문서(웹 주소 없음)">원문 문서</span>');
  };

  // ── 순수: 사업 행·표 ───────────────────────────────────────────────
  // 상위사업 바로 아래에 하위사업을 붙인다(서버는 row_no 순서). 상위가 같은 문서에 없으면 최상위로 본다.
  plans.orderItems = function (items) {
    const list = Array.isArray(items) ? items : [];
    const byNo = {};
    list.forEach(function (it) { byNo[it.item_no] = it; });
    const kids = {}, tops = [];
    list.forEach(function (it) {
      if (it.parent_no != null && byNo[it.parent_no] && byNo[it.parent_no] !== it) (kids[it.parent_no] = kids[it.parent_no] || []).push(it);
      else tops.push(it);
    });
    const out = [];
    tops.forEach(function (t) { out.push(t); (kids[t.item_no] || []).forEach(function (k) { out.push(k); }); });
    return out;
  };
  plans.groupByField = function (items) {
    const groups = [], idx = {};
    const SEP = String.fromCharCode(1);   // 분야 번호와 이름을 가르는 구분자(소스에 제어문자를 직접 쓰지 않는다)
    items.forEach(function (it) {
      const k = str(it.field_no) + SEP + str(it.field_name);
      if (!(k in idx)) { idx[k] = groups.length; groups.push({ no: str(it.field_no), name: str(it.field_name), items: [] }); }
      groups[idx[k]].items.push(it);
    });
    return groups;
  };
  // 키워드(사업명·내용·분야명): 상위가 맞으면 하위도, 하위가 맞으면 상위도 같이 남긴다. 원래 순서를 유지한다.
  plans.filterItems = function (items, kw) {
    const q = str(kw).trim().toLowerCase();
    if (!q) return items;
    const byNo = {}, kids = {};
    items.forEach(function (it) { byNo[it.item_no] = it; });
    items.forEach(function (it) { if (it.parent_no != null) (kids[it.parent_no] = kids[it.parent_no] || []).push(it); });
    const keep = {};
    items.forEach(function (it) {
      const hay = (str(it.name) + ' ' + str(it.content) + ' ' + str(it.field_name)).toLowerCase();
      if (hay.indexOf(q) < 0) return;
      keep[it.item_id] = true;
      const p = it.parent_no != null ? byNo[it.parent_no] : null;
      if (p) keep[p.item_id] = true;
      (kids[it.item_no] || []).forEach(function (k) { keep[k.item_id] = true; });
    });
    return items.filter(function (it) { return keep[it.item_id]; });
  };
  // 보충 B·D: 폐기 = 실선 외곽 칩 + 글자 --muted(취소선·opacity 없음). 홈페이지 확인 상태(check_cd)는 화면에 쓰지 않는다(사용자 결정 2026-11-16).
  // 예산 칸이 원문 표기를 보이면 비고에서 그 '예산 원문: …' 조각을 빼 같은 글을 두 번 보이지 않는다(사용자 11-16). 조각 뒤 ' / 나머지'는 남긴다.
  plans.noteWithoutSrcBudget = function (note) {
    const n = str(note), frag = plans.srcBudgetText(n);
    if (!frag) return n;
    const m = /예산 원문:[ \t]*/.exec(n);
    let rest = n.slice(m.index + m[0].length);
    rest = rest.slice(rest.indexOf(frag) + frag.length).replace(/^[ \t]*\/[ \t]*/, '');
    return (n.slice(0, m.index) + rest).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).join('\n');
  };
  plans.itemRowHtml = function (it, headUnit) {
    const bud = plans.budgetCell(it, headUnit);
    const note = bud.src ? plans.noteWithoutSrcBudget(it.note) : str(it.note);
    const dropped = it.progress_cd === 'DROPPED';
    const tags = [];
    if (dropped) tags.push(badge('pp-cancel', '폐기'));
    const prog = [];
    if (it.progress_cd && it.progress_cd !== 'DROPPED' && PROGRESS[it.progress_cd]) prog.push(esc(PROGRESS[it.progress_cd]));
    if (it.exec_rate != null && str(it.exec_rate) !== '') prog.push('이행률 ' + mono(str(it.exec_rate) + '%'));
    const nm = '<td class="pl-nm"><span class="pl-name">' + esc(it.name) + '</span>' + (tags.length ? ' ' + tags.join(' ') : '') +
      (str(it.content).trim() ? '<span class="pl-content">' + esc(it.content) + '</span>' : '') +
      (prog.length ? '<span class="db-why pl-prog">' + prog.join(' · ') + '</span>' : '') +
      (note.trim() ? '<span class="pl-content">' + esc(note) + '</span>' : '') + '</td>';
    return '<tr class="pl-row' + (it.parent_no != null ? ' pl-child' : '') + (dropped ? ' pl-dim' : '') + '">' +
      '<td class="pl-no">' + mono(it.item_no) + '</td>' + nm + budgetTd(it, headUnit) + '</tr>';
  };
  plans.itemsTableHtml = function (items, headUnit, kw, title) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return '<p class="db-empty">이 문서에 사업이 없습니다.</p>';
    const shown = plans.filterItems(list, kw);
    const count = str(kw).trim() ? '<p class="db-why" aria-live="polite">' + mono(shown.length) + '건 / 전체 ' + mono(list.length) + '건</p>' : '';
    if (!shown.length) return count + '<p class="db-empty">조건에 맞는 사업이 없습니다. 검색어를 지우세요.</p>';
    const hu = headUnit && UNIT[headUnit] ? headUnit : '';
    const head = '<thead><tr><th scope="col" class="pl-no">번호</th><th scope="col">사업명</th><th scope="col" class="pl-bud">예산' +
      (hu ? '(' + esc(UNIT[hu]) + ')' : '') + '</th></tr></thead>';
    const body = plans.groupByField(plans.orderItems(shown)).map(function (g) {
      const label = [g.no, g.name].filter(Boolean).join(' ');
      return '<tbody>' + (label ? '<tr class="pl-fld"><th scope="rowgroup" colspan="3">' + esc(label) + '</th></tr>' : '') +
        g.items.map(function (it) { return plans.itemRowHtml(it, hu); }).join('') + '</tbody>';
    }).join('');
    return count + '<table class="pl-tbl"><caption class="sr-only">' + esc(title || '') + ' 사업표</caption>' + head + body + '</table>';
  };

  // ── 순수: 문서 카드·상세 ───────────────────────────────────────────
  plans.docHtml = function (d, kw) {
    const items = Array.isArray(d.items) ? d.items : [];
    const hid = 'pl-d' + esc(d.doc_id);
    const notes = [];
    if (d.period_ended) notes.push('<p class="db-why">' + esc(d.period_to) + '년에 끝난 계획입니다. 누리집에 새 계획이 있는지 확인하세요.</p>');
    if (d.stale) notes.push('<p class="pl-warn">확인 ' + mono(ymd(d.checked_on)) + ' 뒤로 12개월 넘게 다시 확인하지 않았습니다.</p>');
    return '<section class="pl-doc" aria-labelledby="' + hid + '"><div class="pl-doc-h"><h3 id="' + hid + '">' + esc(d.title) + '</h3>' +
      badge('pp-neutral', str(d.src_kind_name || d.src_kind_cd) || '기타') + (d.period_ended ? ' ' + badge('pp-cancel', '기간 지남') : '') + '</div>' +
      '<dl class="db-dl"><dt>출처</dt><dd>' + plans.srcLineHtml(d) + '</dd>' +
      '<dt>대상 기간</dt><dd>' + mono(plans.periodText(d)) + '</dd>' +
      (str(d.note).trim() ? '<dt>비고</dt><dd class="pl-note">' + esc(d.note) + '</dd>' : '') + '</dl>' +
      notes.join('') + plans.itemsTableHtml(items, d.budget_unit_cd, kw, d.title) + '</section>';
  };
  plans.docsHtml = function (data, kw) {
    const docs = Array.isArray(data && data.docs) ? data.docs : [];
    return docs.map(function (d) { return plans.docHtml(d, kw); }).join('');
  };
  // 보충 E: 자료 없으면 '자료 없음' 하나. 있으면 '사업계획 N건' + (기간 지남) + (오래됨) 순서. 최대 3개.
  plans.statusBadgesHtml = function (st) {
    if (!st) return unk('자료 없음');
    let h = badgeHtml('pp-neutral', '사업계획 ' + mono(Number(st.item_count) || 0) + '건');
    if (st.period_ended) h += ' ' + badge('pp-cancel', '기간 지남');
    if (st.stale) h += ' ' + badge('gap', '오래됨');
    return h;
  };
  // ── 순수: 사업계획 수집 요청(서버 PlanCollectController). 규격 design-reviewer 2026-11-17_1509_af34bf60.md 6-1·6-2 ──
  // 상태 코드는 서버 PlanCollectService 의 값. 칩은 늘 글자로 쓰고 색만으로 전하지 않는다(data-st 는 시험·보조용). 모르는 코드는 원문을 그대로(esc) 보인다.
  const REQ_STATES = {
    REQUESTED: ['요청됨', 'gap'], RUNNING: ['수집 중(반입 대기)', 'pp-neutral'], APPLIED: ['반영됨', 'ok'],
    FAILED: ['실패', 'none'], CANCELED: ['취소됨', 'pp-cancel'], EXCLUDED: ['제외됨', 'pp-cancel'],
  };
  plans.reqBadgeHtml = function (state) {
    const k = str(state), d = Object.prototype.hasOwnProperty.call(REQ_STATES, k) ? REQ_STATES[k] : null;
    return '<span class="wf-badge cr-st ' + (d ? d[1] : 'pp-cancel') + '" data-st="' + esc(k) + '">' + esc(d ? d[0] : k) + '</span>';
  };
  // item = GET /plan-collect/status 의 열린 요청 한 건(없으면 null), o = { can(서버 can_request), hasData, busy:''|'go'|'cancel' }
  // 규격 6-2: 열린 요청이 없고 요청도 못 하는 사용자(디자이너·재무부서)는 줄 자체를 그리지 않는다. 디자이너는 칩과 사람 수만(버튼 없음).
  plans.reqLineHtml = function (item, o) {
    o = o || {};
    const can = !!o.can, busy = str(o.busy), dis = busy ? ' disabled' : '';
    const go = can ? '<button type="button" id="pl-req-go"' + dis + '>' + (busy === 'go' ? '요청 중…' : '수집 요청') + '</button>' : '';
    const cancel = '<button type="button" id="pl-req-cancel"' + dis + '>' + (busy === 'cancel' ? '취소하는 중…' : '내 요청 취소') + '</button>';
    let inner;
    const cl = !item && o.closed && (o.closed.status_cd === 'FAILED' || o.closed.status_cd === 'EXCLUDED') ? o.closed : null;
    if (cl && can) {   // 디자이너(can=false)는 규격 6-2대로 열린 요청이 없으면 줄 없음. 열린 요청이 없고 최근 30일 안에 실패·제외로 닫힘: 칩 + 날짜 · 사유(요청 가능한 사람만, 서버가 디자이너에겐 사유를 안 준다) + [수집 요청]
      const day = plans.kstYmd(cl.closed_at), why = can ? str(cl.close_reason).trim() : '';
      inner = plans.reqBadgeHtml(cl.status_cd) + '<span class="db-why">' + (day ? mono(day) : '') + (why ? (day ? ' · ' : '') + '사유: ' + esc(why) : '') + '</span>' + go;
    } else if (!item) {
      if (!can) return '';
      inner = go + '<span class="db-why">' + (o.hasData ? '새 계획이 나왔으면 다시 요청하세요.' : '개발부서가 수집하고, 자료가 들어오면 쪽지로 알려 드립니다.') + '</span>';
    } else {
      const st = str(item.status_cd), n = Number(item.requester_count) || 0, mine = !!item.requested_by_me;
      const day = st === 'RUNNING' ? plans.kstYmd(item.run_at) : plans.kstYmd(item.first_requested_at);
      const when = day ? (st === 'RUNNING' ? ' · 내보냄 ' : ' · 첫 요청 ') + mono(day) : '';
      inner = plans.reqBadgeHtml(st) + '<span class="db-why">' + (mine ? '나 포함 ' + mono(n) + '명' : mono(n) + '명 요청') + when + '</span>' +
        (mine ? (st === 'REQUESTED' ? cancel : '') : go);   // 수집 중이면 취소 없음, 내가 이미 포함이면 [수집 요청] 없음
    }
    return '<div class="pl-req" role="group" aria-label="수집 요청">' + inner + '</div>';
  };
  // 요청·취소 오류 → 문구(서버 원문은 쓰지 않는다). kind = 'go' | 'cancel'
  plans.reqErrorText = function (kind, status, code) {
    const s = Number(status) || 0, c = str(code);
    if (s === 0) return '요청을 보내지 못했습니다(연결 실패). 잠시 뒤 다시 누르세요.';
    if (c === 'ALREADY_RUNNING') return '수집이 이미 시작되어 취소할 수 없습니다. 상태를 다시 불러왔습니다.';
    if (c === 'CONCURRENT') return '같은 기관 요청이 동시에 처리되었습니다. 다시 눌러 주세요.';
    if (c === 'NO_REQUEST') return '취소할 요청이 없습니다. 상태를 다시 불러왔습니다.';
    if (c === 'NOT_FOUND') return '서버에서 이 기관을 찾지 못했습니다.';
    if (s === 401) return '로그인이 필요합니다. 사번으로 다시 로그인해 주세요.';
    if (s === 403) return '수집 요청은 영업부서·개발부서만 할 수 있습니다(403). 로그인 사번과 권한을 확인하세요.';
    if (s === 404) return kind === 'cancel' ? '취소할 요청이 없습니다. 상태를 다시 불러왔습니다.' : '서버에서 이 기관을 찾지 못했습니다.';
    if (s === 409) return '다른 사람이 방금 이 요청을 처리했습니다. 상태를 다시 불러왔습니다.';
    return '요청을 처리하지 못했습니다(' + s + '). 잠시 뒤 다시 누르세요.';
  };
  // 성공 응답(POST …/plan-collect, …/cancel) → 결과 문구(규격 6-2). 응답: { status_cd, requester_count, created, outcome }
  plans.reqFlash = function (kind, res) {
    const n = Number(res && res.requester_count) || 0;
    if (kind === 'cancel') {
      return res && res.status_cd === 'CANCELED' ? '내 요청을 취소했습니다. 이 기관의 요청은 \'취소됨\'이 됐습니다.' : '내 요청을 취소했습니다. 다른 요청자 ' + n + '명의 요청은 그대로입니다.';
    }
    if (res && res.created) return '수집을 요청했습니다. 개발부서가 처리하면 쪽지로 알려 드립니다.';
    if (res && res.outcome === 'DUPLICATE') return '이미 요청한 기관입니다(나 포함 ' + n + '명). 결과는 쪽지로 알려 드립니다.';
    return '이미 요청된 기관이라 요청자로 함께 올렸습니다(나 포함 ' + n + '명). 결과는 쪽지로 알려 드립니다.';
  };
  // view = { status:'loading'|'noid'|'offline'|'denied'|'notfound'|'error'|'ok', data, code }, o = { name, sub, kw, req:{ item, can, busy }|null }
  plans.detailHtml = function (view, o) {
    o = o || {};
    const v = view || { status: 'loading' };
    const name = o.name || (v.data && v.data.name_ko) || '';
    function head(extra) {
      return '<div class="db-head"><h2 id="pl-name" tabindex="-1">' + esc(name) + '</h2>' + (extra || '') + '</div>' +
        (o.sub ? '<p class="db-sub">' + esc(o.sub) + '</p>' : '');
    }
    if (v.status === 'loading') return head('') + '<p class="db-state" aria-busy="true">사업계획을 불러오는 중입니다…</p>';
    if (v.status === 'noid') return head(unk('자료 없음')) + '<p class="db-empty">서버에 등록된 기관만 사업계획을 조회합니다. 이 기관은 아직 서버에 등록되지 않아 조회할 수 없습니다.</p>';
    if (v.status === 'offline') return head('') + '<p class="db-state">서버에 연결되면 사업계획을 볼 수 있습니다.</p>';
    if (v.status === 'denied') return head('') + '<p class="db-state">이 기관의 사업계획을 볼 권한이 없습니다(' + esc(v.code || 403) + '). 로그인 사번과 권한을 확인하세요.</p>';
    if (v.status === 'notfound') return head('') + '<p class="db-state">서버에서 이 기관을 찾지 못했습니다. 서버에 등록된 기관만 사업계획을 조회합니다.</p>';
    if (v.status !== 'ok') return head('') + '<p class="db-state">사업계획을 불러오지 못했습니다(' + esc(v.code || '연결 실패') + '). <button type="button" id="pl-retry-detail">다시 불러오기</button></p>';
    const data = v.data || {};
    const docs = Array.isArray(data.docs) ? data.docs : [];
    // 수집 요청 줄(규격 6-2): head 바로 뒤·반입일 앞 한 곳. 자료가 있든 없든 같은 자리. 서버 현황을 못 받았으면(o.req 없음) 그리지 않는다.
    const reqLine = o.req ? plans.reqLineHtml(o.req.item, { can: o.req.can, hasData: docs.length > 0, busy: o.req.busy, closed: o.req.closed }) : '';
    if (!docs.length) {
      return head(unk('자료 없음')) + reqLine + '<div class="db-sec"><h3>사업계획</h3><p class="db-empty">' +
        (o.req && !o.req.can ? '이 기관의 사업계획은 아직 수집되지 않았습니다. 영업부서가 수집을 요청하면 개발부서가 모아 올립니다.' : '이 기관의 사업계획은 아직 수집되지 않았습니다.') + '</p></div>';
    }
    const n = docs.reduce(function (s, d) { return s + (Array.isArray(d.items) ? d.items.length : 0); }, 0);
    const imp = data.import || {};
    const impLine = imp.imported_at ? '<p class="db-why pl-imp">반입 ' + mono(plans.kstYmd(imp.imported_at)) + ' · ' + esc(ORIGIN[imp.origin_cd] || imp.origin_cd || '') + '</p>' : '';
    const kw = '<div class="pl-kwrow"><label class="sr-only" for="pl-kw">이 기관의 사업 찾기</label><input id="pl-kw" type="search" autocomplete="off" ' +
      'placeholder="사업명·내용에서 찾기 (예: 청년, 소상공인, 디지털)" value="' + esc(o.kw || '') + '"></div>';
    return head(plans.statusBadgesHtml({
      item_count: n, period_ended: docs.every(function (d) { return d.period_ended; }), stale: docs.some(function (d) { return d.stale; }),
    })) + reqLine + impLine + kw + '<div id="pl-docs">' + plans.docsHtml(data, o.kw) + '</div>';
  };

  // ── 순수: 목록 ─────────────────────────────────────────────────────
  plans.statusMap = function (data) {
    const m = {};
    ((data && data.items) || []).forEach(function (r) { if (r && r.institution_id) m[r.institution_id] = r; });
    return m;
  };
  // 공고 진행 중(notice) 먼저, 그다음 기간 창(windowItems). 서버 현황은 institutionId 로만 붙인다. map 이 null 이면 st 는 모두 null(아직 모름).
  // '결과 확인' 기관(마감 지남·마감일 미확인 30일 초과)은 입찰 임박이 아니므로 뺀다 — 바닥 안내(checkNoteHtml)가 수를 알리고, 직접 열면 pin 으로 보인다(사용자 11-16).
  plans.listRows = function (M, key, f, map) {
    const d = D();
    const open = (M.notice || []).filter(function (it) { return !d.isNoticeCheck(it); });
    const items = open.concat(d.windowItems(M, key));
    return d.filterItems(items, f || {}).map(function (it) {
      const id = it.rec && it.rec.institutionId ? String(it.rec.institutionId) : '';
      return { key: it.key, it: it, id: id, st: id && map ? (map[id] || null) : null };
    });
  };
  plans.filterByStatus = function (rows, stat) {
    if (stat === 'has') return rows.filter(function (r) { return !!r.st; });
    if (stat === 'none') return rows.filter(function (r) { return !r.st; });
    return rows;
  };
  // '자료 없음' 목록으로 보낼 기관 id: 현황이 없고 형식이 맞는 것만, 화면 순서 그대로, 최대 1,000개.
  plans.missingIds = function (rows) {
    const seen = {}, out = [];
    rows.forEach(function (r) {
      if (r.st || !ID_RE.test(r.id) || seen[r.id]) return;
      seen[r.id] = true;
      out.push(r.id);
    });
    return out.slice(0, plans.MISSING_MAX);
  };
  // 목록 바닥: n = 목록(CSV)에 담을 수 있는 기관 수(missingIds), m = 목록 머리의 '자료 없음' 수. 다를 때만 차이를 밝힌다.
  // can = 수집 요청을 할 수 있는 사용자(요청 줄의 can 과 같은 값, CS.can). 불가면 2줄은 '확인용입니다.'만(없는 버튼을 가리키지 않게, design 11-19).
  plans.footHtml = function (n, m, busy, can) {
    n = Number(n) || 0; m = Number(m) || 0;
    let h = '';
    if (n) {
      h = '목록에 담을 기관 ' + mono(n) + '곳 · <button type="button" class="db-link" id="pl-dl"' + (busy ? ' disabled' : '') + '>자료 없는 기관 내려받기(CSV)</button><br>' +
        (can ? '확인용입니다. 수집은 [수집 요청]으로 개발부서에 맡깁니다.' : '확인용입니다.');
    }
    if (m > n) h += (h ? '<br>' : '') + '서버에 등록되지 않은 ' + mono(m - n) + '곳은 목록에 넣을 수 없습니다.';
    return h;
  };
  // 목록에서 뺀 '결과 확인' 기관 안내. n = 지역·검색을 적용한 수, canOpen = 입찰 공고 현황 메뉴가 보이는가. 0곳이면 ''.
  // 한 줄로 둔다(QA 11-16: 3~4줄이면 1280×720에서 목록 칸이 행 2개로 눌림). 이유 설명은 title(마우스 올림).
  plans.checkNoteHtml = function (n, canOpen) {
    n = Number(n) || 0;
    if (!n) return '';
    const why = '마감이 지났거나, 마감일 기록 없이 공고 후 ' + logic.NOTICE_UNKNOWN_OPEN_DAYS + '일이 지난 곳입니다.';
    return '<p class="pl-fn" title="' + esc(why) + '">결과 확인할 기관 ' + mono(n) + '곳은 목록에서 뺐습니다' +
      (canOpen ? ' · <button type="button" class="db-link" id="pl-to-notice">입찰 공고 현황에서 보기</button>' : '') + '</p>';
  };
  plans.winHtml = function (key) {
    const d = D(), k = d.windowKey(key);
    return '<legend class="sr-only">입찰 예정일 기간</legend>' + d.WINDOW_KEYS.map(function (w) {
      return '<label><input type="radio" name="pl-win" value="' + w + '"' + (w === k ? ' checked' : '') + '><span>' + esc(d.WINDOW_LABELS[w]) + '</span></label>';
    }).join('');
  };
  const STATS = [['all', '모두'], ['has', '자료 있음'], ['none', '자료 없음']];   // 기간 묶음의 '전체'와 겹치지 않게 '모두'
  plans.statHtml = function (stat) {
    return '<legend class="sr-only">사업계획 자료 상태</legend>' + STATS.map(function (p) {
      return '<label><input type="radio" name="pl-stat" value="' + p[0] + '"' + (p[0] === stat ? ' checked' : '') + '><span>' + esc(p[1]) + '</span></label>';
    }).join('');
  };
  plans.groupLabelHtml = function (key, total, missing) {
    const d = D(), k = d.windowKey(key);
    return esc(k === 'all' ? '전체(날짜를 아는 곳)' : d.WINDOW_LABELS[k] + ' 안') + ' <b>' + esc(total) + '</b>곳' +
      (missing == null ? '' : ' · 자료 없음 <b>' + esc(missing) + '</b>곳') + ' · 가까운 순';
  };
  // r = listRows 한 행, o = { id, selected, loaded(현황을 받았는가) }
  plans.rowHtml = function (r, o) {
    o = o || {};
    const it = r.it, d = D();
    const region = esc(d.regionName(it.region));
    let tag, meta;
    if (it.notice) { tag = d.noticeChipHtml(it); meta = region + ' · ' + d.noticeNote(it); }
    else if (it.overdue) { tag = '<span class="ov-stamp">D+' + esc(it.days) + '</span>'; meta = region + ' · 예정일 경과'; }
    else if (it.unknown) { tag = '<span class="dg-day unknown">날짜 미상</span>'; meta = region + ' · 입찰 예정일 미상'; }
    else {
      tag = '<span class="dg-day ' + esc(it.band) + '">' + (it.days === 0 ? 'D-day' : 'D-' + esc(it.days)) + '</span>';
      meta = region + ' · <span class="d">' + esc(it.date) + '</span> ' + esc(it.label);
    }
    if (o.pinned) meta += ' · 직접 연 기관';   // 목록 밖에서 직접 연 기관(현황판·지도에서 열었거나 결과 확인 기관)
    const badges = o.loaded ? plans.statusBadgesHtml(r.st) : '';
    // 열린 요청(요청됨·수집 중)만 칩 하나. 사람 수·버튼은 붙이지 않는다(option 안에는 버튼을 둘 수 없다, 규격 P1-1).
    const reqSt = o.req && (o.req.status_cd === 'REQUESTED' || o.req.status_cd === 'RUNNING') ? o.req.status_cd : '';
    const mark = (o.pinned ? ' data-pin="1"' : '') + (it.notice && d.isNoticeCheck(it) ? ' data-check="1"' : '');
    return '<li role="option" id="' + esc(o.id || '') + '" class="db-row" data-key="' + esc(r.key) + '" aria-selected="' + (o.selected ? 'true' : 'false') + '"' + mark + '>' +
      '<span class="nm">' + esc(it.name) + '</span>' + tag + '<span class="meta">' + meta + (badges ? ' ' + badges : '') + (reqSt ? ' ' + plans.reqBadgeHtml(reqSt) : '') + '</span></li>';
  };

  // ── 서버 현황 캐시(이 화면과 현황판·지도 상세의 '사업계획' 절이 같이 쓴다) ──
  function freshStatus() { return { state: 'idle', map: {}, today: '', code: 0, at: 0 }; }
  let ST = freshStatus();
  let statusSeq = 0, statusPending = null, statusInflight = false;
  function serverOk() { try { return !!(root.store && root.store.isServerMode()) && !!((root.store.loadSession() || {}).emp); } catch (e) { return false; } }
  function whoNow() { try { return String((root.store.loadSession() || {}).emp || ''); } catch (e) { return ''; } }
  // 시험·재시도용: 서버 응답(JSON)을 직접 넣는다.
  plans.applyStatus = function (data) {
    statusSeq += 1; statusInflight = false;
    ST = { state: 'ok', map: plans.statusMap(data), today: str(data && data.today), code: 0, at: Date.now() };
  };
  plans.setStatusState = function (state, code) { statusSeq += 1; statusInflight = false; ST = Object.assign(freshStatus(), { state: state, code: code || 0 }); };
  plans.resetStatus = function () { statusSeq += 1; statusPending = null; statusInflight = false; ST = freshStatus(); plans.resetCollect(); };
  plans.statusState = function () { return ST.state; };

  // ── 사업계획 수집 요청 현황 캐시(GET /plan-collect/status: 열린 요청만 + can_request) ──
  // 기존 현황(ST)과 같은 수명·같은 시점에 받는다(ensureStatus 가 함께 부른다). 실패해도 사업계획 화면은 그대로 쓴다(요청 줄·칩만 없음).
  function freshCollect() { return { state: 'idle', can: false, map: {}, closed: {}, code: 0, at: 0 }; }
  let CS = freshCollect();
  let collectSeq = 0, collectPending = null, collectInflight = false;
  plans.collectMap = function (data) {
    const m = {};
    ((data && data.items) || []).forEach(function (r) { if (r && r.institution_id) m[r.institution_id] = r; });
    return m;
  };
  // last_closed: 열린 요청이 없는 기관의 최근 실패·제외(30일 안). 기관 ID → { status_cd, closed_at, close_reason }
  plans.closedMap = function (data) {
    const m = {};
    ((data && data.last_closed) || []).forEach(function (r) {
      if (r && r.institution_id && (r.status_cd === 'FAILED' || r.status_cd === 'EXCLUDED')) m[r.institution_id] = r;
    });
    return m;
  };
  // 시험·재시도용: 서버 응답(JSON)을 직접 넣는다.
  plans.applyCollect = function (data) {
    collectSeq += 1; collectInflight = false;
    CS = { state: 'ok', can: !!(data && data.can_request), map: plans.collectMap(data), closed: plans.closedMap(data), code: 0, at: Date.now() };
  };
  plans.setCollectState = function (state, code) { collectSeq += 1; collectInflight = false; CS = Object.assign(freshCollect(), { state: state, code: code || 0 }); };
  plans.resetCollect = function () { collectSeq += 1; collectPending = null; collectInflight = false; CS = freshCollect(); };
  plans.collectState = function () { return CS.state; };
  function collectOf(id) { return CS.state === 'ok' ? { req: CS.map[id] || null, can: CS.can } : null; }
  function reqSummaryHtml(req) { return plans.reqBadgeHtml(req.status_cd) + ' <span class="db-why">' + mono(Number(req.requester_count) || 0) + '명 요청</span>'; }
  function ensureCollect(force) {
    if (!serverOk()) { CS = Object.assign(freshCollect(), { state: 'offline' }); return Promise.resolve(CS); }
    if (CS.state === 'forbidden') return Promise.resolve(CS);   // 재무부서(403): 다시 묻지 않는다. 계정이 바뀌면 resetCollect 가 비운다
    if (!force) {
      if (collectInflight && collectPending) return collectPending;
      if (CS.state === 'ok' && Date.now() - CS.at < STATUS_FRESH_MS) return Promise.resolve(CS);
    }
    const my = ++collectSeq;
    collectInflight = true;
    if (CS.state !== 'ok') CS = Object.assign(freshCollect(), { state: 'loading' });
    const p = fetchJson('/plan-collect/status').then(function (r) {
      if (my !== collectSeq) return CS;
      collectInflight = false;
      if (r.status === 'ok') CS = { state: 'ok', can: !!(r.data && r.data.can_request), map: plans.collectMap(r.data), closed: plans.closedMap(r.data), code: 0, at: Date.now() };
      else if (r.status === 'denied' && r.code === 403) CS = Object.assign(freshCollect(), { state: 'forbidden', code: 403 });   // 조용히: 요청 줄·칩 없음, 오류 문구 없음
      else CS = Object.assign(freshCollect(), { state: r.status, code: r.code || 0 });
      refreshSlots();
      onCollect();
      return CS;
    });
    collectPending = p;
    return p;
  }

  function fetchJson(url) {
    if (typeof fetch !== 'function') return Promise.resolve({ status: 'offline', code: 0 });
    return fetch(url).then(function (r) {
      if (!r.ok) return { status: r.status === 401 || r.status === 403 ? 'denied' : 'error', code: r.status };
      return r.json().then(function (d) { return { status: 'ok', data: d }; }, function () { return { status: 'error', code: r.status }; });
    }).catch(function () { return { status: 'error', code: 0 }; });
  }
  function ensureStatus(force) {
    ensureCollect(force);   // 수집 요청 현황은 기존 현황과 같은 때에 함께 받는다(별도 캐시·별도 실패 처리)
    if (!serverOk()) { ST = Object.assign(freshStatus(), { state: 'offline' }); return Promise.resolve(ST); }
    if (!force) {
      // 요청이 나가 있는 동안에는 몇 번을 불러도 새 요청을 만들지 않는다(옛 값이 낡아 ok 인 채로 다시 그려져도 한 번만 받는다).
      if (statusInflight && statusPending) return statusPending;
      if (ST.state === 'ok' && Date.now() - ST.at < STATUS_FRESH_MS) return Promise.resolve(ST);
    }
    const my = ++statusSeq;
    statusInflight = true;
    if (ST.state !== 'ok') ST = Object.assign(freshStatus(), { state: 'loading' });
    const p = fetchJson('/institution-plans/status').then(function (r) {
      if (my !== statusSeq) return ST;
      statusInflight = false;
      if (r.status === 'ok') ST = { state: 'ok', map: plans.statusMap(r.data), today: str(r.data && r.data.today), code: 0, at: Date.now() };
      else ST = Object.assign(freshStatus(), { state: r.status, code: r.code || 0 });
      refreshSlots();
      onStatus();
      return ST;
    });
    statusPending = p;
    return p;
  }

  // ── 현황판·지도 상세의 '사업계획' 절(dashboard.plansHook) ─────────────────
  // 서버에 현황이 있는 기관만 '사업계획 N건 보기'를 둔다. 권한·연결 문제는 절을 숨긴다(기관장 카드 같은 안내 줄을 늘리지 않는다).
  plans.sectionInner = function (id, nameId) {
    // 메뉴에 '기관 사업계획'이 안 보이는 사용자(예산팀 등)는 요약 절도 보지 않는다(11-17). paneSection·refreshSlots 가 모두 여기를 거치므로 한 곳에서 막는다.
    if (!plans.menuVisible()) return '';
    const h3 = '<h3>사업계획</h3>';
    if (!id) return h3 + '<dl class="db-dl"><dt>자료</dt><dd>' + unk('자료 없음') + '</dd></dl><p class="db-empty">서버에 등록된 기관만 사업계획을 조회합니다.</p>';
    if (ST.state === 'idle' || ST.state === 'loading') return h3 + '<p class="db-empty" aria-busy="true">사업계획 현황을 불러오는 중입니다…</p>';
    if (ST.state !== 'ok') return '';
    const st = ST.map[id];
    const rq = collectOf(id);   // 수집 요청 현황을 받은 뒤에만(서버 can_request·열린 요청). 표시만 하고 쓰기 버튼은 두지 않는다(규격 6-3)
    if (!st) {
      const lead = rq && rq.req ? '기관 사업계획에서 보기' : (rq && rq.can ? '기관 사업계획에서 수집 요청' : '');
      return h3 + '<dl class="db-dl"><dt>자료</dt><dd>' + unk('자료 없음') + (rq && rq.req ? ' ' + reqSummaryHtml(rq.req) : '') + '</dd></dl>' +
        (lead ? '<p class="pl-open"><button type="button" class="link-btn" data-pl-open="' + esc(id) + '" aria-describedby="' + esc(nameId || 'db-name') + '">' + lead + '</button>' +
          ' <span class="pl-msg db-why" role="status"></span></p>' : '');
    }
    const n = Number(st.item_count) || 0;
    // 이 절이 보이는 사용자는 메뉴도 열 수 있다(위에서 menuVisible 로 걸렀다).
    const open = '<p class="pl-open"><button type="button" class="link-btn" data-pl-open="' + esc(id) + '" aria-describedby="' + esc(nameId || 'db-name') + '">사업계획 ' + mono(n) + '건 보기</button>' +
      ' <span class="pl-msg db-why" role="status"></span></p>';
    return h3 + '<dl class="db-dl"><dt>자료</dt><dd>' + plans.statusBadgesHtml(st) + (rq && rq.req ? ' ' + reqSummaryHtml(rq.req) : '') + '</dd>' +
      (ymd(st.oldest_checked_on) ? '<dt>확인일</dt><dd>' + mono(ymd(st.oldest_checked_on)) + ' <span class="db-why">가장 오래된 문서 기준</span></dd>' : '') + '</dl>' + open;
  };
  // 기관 사업계획 화면을 이 사용자가 열 수 있는가 = 사이드바에 그 항목이 그려져 있는가(nav.build 가 이미 역할·서버 메뉴 키로 걸러 그린다).
  // 이 판정은 사이드바 DOM(data-nav)으로 본다(입찰 공고 현황 쪽 noticeMenuVisible 은 app.findNavItem 을 쓴다). 사이드바가 아직 없으면(시험·로그인 전) 열 수 있다고 본다.
  // plans.menuCheck 에 함수를 넣으면 그 결과를 쓴다(시험용).
  plans.menuCheck = null;
  plans.menuVisible = function () {
    if (typeof plans.menuCheck === 'function') return !!plans.menuCheck();
    if (typeof document === 'undefined') return true;
    const btns = document.querySelectorAll('#side-nav [data-nav]');
    if (!btns.length) return true;
    return Array.prototype.some.call(btns, function (b) { return b.getAttribute('data-nav') === plans.SOON_ID; });
  };
  // 입찰 공고 현황 메뉴가 이 사용자에게 보이는가(overdue.js 와 같은 방식: app.findNavItem). 사이드바·app 이 없으면(시험·로그인 전) 보인다고 본다.
  // plans.noticeMenuCheck 에 함수를 넣으면 그 결과를 쓴다(시험용).
  plans.noticeMenuCheck = null;
  plans.noticeMenuVisible = function () {
    if (typeof plans.noticeMenuCheck === 'function') return !!plans.noticeMenuCheck();
    const A = root.app, N = root.nav;
    if (!A || !A.findNavItem || !N || !N.NOTICE_ID) return true;
    if (typeof document !== 'undefined' && !document.querySelectorAll('#side-nav [data-nav]').length) return true;
    return !!A.findNavItem(N.NOTICE_ID);
  };
  plans.paneSection = function (rec, c) {
    let id = rec && rec.institutionId ? String(rec.institutionId) : '';
    if (id && !ID_RE.test(id)) id = '';
    const nameId = (c && c.nameId) || 'db-name';
    // 메뉴를 못 여는 사용자에게는 절도, 현황 요청도 없다(요청하면 서버가 403 을 낼 사람이다).
    if (!plans.menuVisible()) return '';
    // 의도한 부작용: 현황이 없거나 낡았으면 이 절을 그리는 김에 현황을 받아 둔다(받으면 refreshSlots 가 절을 다시 그린다).
    // ensureStatus(false)는 요청이 나가 있는 동안 멱등이라 다시 그려져도 요청은 한 번이다. node(document 없음)에서는 요청하지 않는다.
    if (typeof document !== 'undefined') {
      if (ST.state === 'idle' || (ST.state === 'ok' && Date.now() - ST.at >= STATUS_FRESH_MS)) ensureStatus(false);
    }
    const inner = plans.sectionInner(id, nameId);
    if (!inner) return '';
    return '<div class="db-sec pl-slot" data-pl-id="' + esc(id) + '" data-pl-name="' + esc(nameId) + '">' + inner + '</div>';
  };
  function refreshSlots() {
    if (typeof document === 'undefined') return;
    Array.prototype.forEach.call(document.querySelectorAll('.pl-slot[data-pl-id]'), function (el) {
      el.innerHTML = plans.sectionInner(el.getAttribute('data-pl-id'), el.getAttribute('data-pl-name') || 'db-name');
    });
  }

  // ── DOM: 화면 ──────────────────────────────────────────────────────
  let S = null, host = null, ac = null, M = null;
  function freshState(who) {
    return { who: who || '', win: D().DEFAULT_WINDOW, stat: 'all', q: '', region: '', kw: '', selRow: null, pin: null, cache: {},
      pendingId: '', revealKey: '', focusTitle: false, err: '', dlBusy: false, reqBusy: null };
  }
  function $(id) { return host ? host.querySelector('#' + id) : null; }
  function todayDate() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function dataList() {
    try {
      if (root.render && root.render.allInstitutions) return root.render.allInstitutions();
      return root.store.loadData() || root.institutions || [];
    } catch (e) { return root.institutions || []; }
  }
  function ready() { return ST.state === 'ok'; }

  const SKELETON =
    '<div class="tm-head"><b>기관 사업계획</b> <span class="dg-hint">— 입찰이 가까운 기관부터, 기관 홈페이지에 공개된 사업계획을 봅니다</span></div>' +
    '<div id="pl-flash" class="db-flash" role="status"></div>' +
    '<div id="pl-err" class="db-state db-banner" role="alert" style="display:none"></div>' +
    '<div class="pl-work">' +
    '<section class="db-list" aria-labelledby="pl-lt"><div class="db-list-head"><div class="db-h"><h2 id="pl-lt">입찰 임박 기관</h2></div>' +
    '<div class="pl-pers"><fieldset class="db-per" id="pl-win"></fieldset><fieldset class="db-per" id="pl-stat"></fieldset></div>' +
    '<div class="db-filters"><input id="pl-q" type="search" placeholder="기관명 검색" aria-label="기관명 검색" autocomplete="off">' +
    '<select id="pl-region" aria-label="지역"></select></div></div>' +
    '<div class="db-scroll" id="pl-scroll" aria-busy="true"><div class="db-grp" id="pl-g" aria-live="polite"></div><div id="pl-body"></div></div><div class="db-foot" id="pl-foot"></div></section>' +
    '<section class="db-pane" id="pl-pane" aria-label="기관 사업계획 상세"></section></div>';

  function visibleRows() {
    const map = ready() ? ST.map : null;
    const base = plans.listRows(M, S.win, { q: S.q, region: S.region }, map);
    let rows = map ? plans.filterByStatus(base, S.stat) : base;
    if (S.pin && !rows.some(function (r) { return r.key === S.pin.key; })) {
      const id = S.pin.id;
      rows = [{ key: S.pin.key, it: S.pin.it, id: id, st: id && map ? (map[id] || null) : null, pinned: true }].concat(rows);
    }
    return { rows: rows, base: base };
  }
  function renderList() {
    const el = $('pl-body'), grp = $('pl-g'), sc = $('pl-scroll');
    if (!el || !grp || !M) return;
    const ok = ready();
    const vr = visibleRows();
    const missing = ok ? vr.base.filter(function (r) { return !r.st; }).length : null;
    grp.innerHTML = plans.groupLabelHtml(S.win, vr.base.length, missing);   // aria-live 영역은 고정하고 안쪽만 바꾼다
    let h = '';
    if (vr.rows.length) {
      h += '<ul role="listbox" id="pl-lb" tabindex="0" aria-labelledby="pl-g">' + vr.rows.map(function (r, i) {
        return plans.rowHtml(r, { id: 'pl-o-' + i, selected: !!(S.selRow && S.selRow.key === r.key), loaded: ok, pinned: !!r.pinned,
          req: CS.state === 'ok' ? (CS.map[r.id] || null) : null });
      }).join('') + '</ul>';
    } else if (ok && S.stat !== 'all' && vr.base.length) {
      h += '<p class="db-state">' + (S.stat === 'none' ? '자료 없는 기관이 없습니다.' : '사업계획 자료가 있는 기관이 아직 없습니다. 위에서 [모두]를 고르세요.') + '</p>';
    } else if (S.q.trim() || S.region) {
      h += '<p class="db-state">조건에 맞는 기관이 없습니다. 검색어를 지우거나 지역을 \'전체 지역\'으로 바꾸세요.<br><button type="button" id="pl-clear">조건 지우기</button></p>';
    } else {
      h += '<p class="db-state">' + (S.win === 'all' ? '앞으로 입찰 예정인 기관이 없습니다.' : esc(D().WINDOW_LABELS[S.win]) + ' 안에 입찰 예정인 기관이 없습니다. 기간을 넓혀 보세요.') + '</p>';
    }
    const ae = document.activeElement, keepFocus = !!(ae && ae.id === 'pl-lb'), keepTop = sc ? sc.scrollTop : 0;   // 목록을 다시 그려도 키보드 위치·스크롤을 지킨다
    el.innerHTML = h;
    if (sc) { sc.setAttribute('aria-busy', ST.state === 'loading' ? 'true' : 'false'); sc.scrollTop = keepTop; }
    syncActive();
    if (keepFocus) { const lb = $('pl-lb'); if (lb && lb.focus) lb.focus({ preventScroll: true }); }
  }
  // listbox 의 포커스는 ul 에 머무므로 선택된 option 을 aria-activedescendant 로 알린다(현황판 dashboard.js 와 같은 방식).
  // option id 는 그릴 때마다 다시 매겨지므로 그린 뒤·선택을 바꾼 뒤에 다시 계산한다. 선택이 없으면 속성을 뺀다.
  function syncActive() {
    const lb = $('pl-lb');
    if (!lb) return;
    const sel = lb.querySelector('[role=option][aria-selected=true]');
    if (sel && sel.id) lb.setAttribute('aria-activedescendant', sel.id); else lb.removeAttribute('aria-activedescendant');
  }
  function renderFoot() {
    const el = $('pl-foot');
    if (!el || !M) return;
    // 결과 확인 안내는 서버 현황과 무관(로컬 데이터로 계산) — 연결이 없어도 보인다. CSV 문단만 현황을 받은 뒤에 그린다.
    const d = D();
    const n = d.filterItems(M.notice || [], { q: S.q, region: S.region }).filter(d.isNoticeCheck).length;
    let h = plans.checkNoteHtml(n, plans.noticeMenuVisible());
    if (ready()) {
      const base = visibleRows().base;
      const csv = plans.footHtml(plans.missingIds(base).length, base.filter(function (r) { return !r.st; }).length, S.dlBusy, CS.can);
      if (csv) h += '<p class="pl-fn">' + csv + '</p>';
    }
    el.innerHTML = h;
  }
  const OFFLINE_MSG = '서버에 연결되면 사업계획 현황이 보입니다.';
  function renderBanner() {
    const el = $('pl-err');
    if (!el) return;
    let h = '';
    if (S.err) h = esc(S.err);
    else if (ST.state === 'denied') h = '사업계획 현황을 볼 권한이 없습니다(' + esc(ST.code || 403) + '). 로그인 사번과 권한을 확인하세요.';
    else if (ST.state === 'error') h = '사업계획 현황을 불러오지 못했습니다(' + esc(ST.code || '연결 실패') + '). <button type="button" id="pl-retry">다시 불러오기</button>';
    // 연결 안 됨은 오류가 아니라 안내라서 빨간 경고 띠(#pl-err, role=alert)가 아니라 #pl-flash(role=status)로 보낸다.
    const f = $('pl-flash');
    if (ST.state === 'offline') { if (f) f.textContent = OFFLINE_MSG; }
    else if (f && f.textContent === OFFLINE_MSG) f.textContent = '';
    el.innerHTML = h;
    el.style.display = h ? '' : 'none';
  }
  function renderPane() {
    const el = $('pl-pane');
    if (!el) return;
    const row = S.selRow;
    if (!row) {
      el.removeAttribute('aria-labelledby'); el.setAttribute('aria-label', '기관 사업계획 상세');
      el.innerHTML = '<div class="db-blank">왼쪽 목록에서 기관을 고르면 계획 문서와 사업표가 여기에 보입니다.</div>';
      return;
    }
    el.removeAttribute('aria-label'); el.setAttribute('aria-labelledby', 'pl-name');
    const rec = row.it.rec || {};
    const view = !ID_RE.test(row.id) ? { status: 'noid' } : (S.cache[row.id] || { status: 'loading' });
    const sub = [D().kindOfRec(rec), D().regionName(rec.region)].filter(Boolean).join(' · ');
    el.innerHTML = '<div class="db-pane-body">' + plans.detailHtml(view, { name: row.it.name, sub: sub, kw: S.kw, req: collectReq(row.id) }) + '</div>';
    if (S.focusTitle && view.status !== 'loading') { S.focusTitle = false; const h = $('pl-name'); if (h && h.focus) h.focus(); }
  }
  function renderDocs() {
    const el = $('pl-docs'), v = S.selRow ? S.cache[S.selRow.id] : null;
    if (el && v && v.status === 'ok') el.innerHTML = plans.docsHtml(v.data, S.kw);
  }
  function onStatus() {
    if (!host || !M || !S) return;
    renderBanner(); renderList(); renderFoot();
    // 현황(배지)이 들어오면 위쪽 행 높이가 바뀌어 선택 행이 밀린다 — 다른 화면에서 골라 들어온 직후면 한 번 더 맞춘다.
    if (S.revealKey) { revealRow(S.revealKey); S.revealKey = ''; }
  }
  function setFlash(msg) { const f = $('pl-flash'); if (f) f.textContent = msg || ''; }

  function loadDetail(id) {
    if (!ID_RE.test(id)) return;
    const state = S, c = state.cache[id];
    if (c && c.status === 'ok') return;
    if (!serverOk()) { state.cache[id] = { status: 'offline' }; return; }
    state.cache[id] = { status: 'loading' };
    fetchJson('/institutions/' + encodeURIComponent(id) + '/plans').then(function (r) {
      if (state !== S) return;   // 그 사이 계정이 바뀌었으면 버린다
      state.cache[id] = r.status === 'ok' ? { status: 'ok', data: r.data }
        : { status: r.status === 'denied' ? 'denied' : (r.code === 404 ? 'notfound' : r.status), code: r.code };
      if (host && state.selRow && state.selRow.id === id) renderPane();
    });
  }
  function markSelected() {
    Array.prototype.forEach.call(host.querySelectorAll('[role=option]'), function (o) {
      o.setAttribute('aria-selected', S.selRow && o.getAttribute('data-key') === S.selRow.key ? 'true' : 'false');
    });
    syncActive();
  }
  function select(key, focusLb) {
    const row = visibleRows().rows.filter(function (r) { return r.key === key; })[0];
    if (!row) return;
    const hadPin = !!S.pin;
    S.selRow = row; S.kw = ''; S.focusTitle = false; S.revealKey = '';
    if (S.pin && S.pin.key !== key) S.pin = null;
    loadDetail(row.id);
    if (hadPin && !S.pin) renderList(); else markSelected();
    renderPane();
    const lb = focusLb ? $('pl-lb') : null;
    if (lb) lb.focus();
    revealRow(key);
  }
  // 키가 같은 행이 목록 스크롤 영역(#pl-scroll) 안에 보이게 한다. select 와 mount(다른 화면에서 기관을 골라 들어왔을 때)가 함께 쓴다.
  function revealRow(key) {
    if (!host || !key) return;
    Array.prototype.forEach.call(host.querySelectorAll('[role=option]'), function (o) {
      if (o.getAttribute('data-key') === key && o.scrollIntoView) o.scrollIntoView({ block: 'nearest' });
    });
  }

  // 현황판·지도 상세의 링크가 이 기관을 골라 연다. 기간 창 밖이면 가장 가까운 넓은 창으로, 입찰 예정 목록에 없으면(경과·날짜 미상) 맨 위에 붙여 둔다.
  plans.openInstitution = function (instId) {
    const A = root.app;
    if (!instId || !ID_RE.test(String(instId)) || !A || !A.openNavItem) return false;
    if (!S) S = freshState(whoNow());
    S.pendingId = String(instId);
    const ok = !!A.openNavItem(plans.SOON_ID);
    if (!ok) S.pendingId = '';
    return ok;
  };
  function applyPending() {
    const id = S.pendingId;
    S.pendingId = '';
    if (!id) return;
    const rec = dataList().filter(function (r) { return String(r.institutionId || '') === id; })[0];
    if (!rec) return;
    const d = D(), key = logic.instKey(rec);
    S.q = ''; S.region = ''; S.stat = 'all'; S.pin = null; S.kw = '';
    let it = (M.notice || []).filter(function (x) { return x.key === key; })[0] || null;
    if (!it) {
      for (let i = 0; i < d.WINDOW_KEYS.length && !it; i += 1) {
        const w = d.WINDOW_KEYS[i];
        const hit = d.windowItems(M, w).filter(function (x) { return x.key === key; })[0];
        if (hit) { it = hit; if (d.WINDOW_KEYS.indexOf(w) > d.WINDOW_KEYS.indexOf(S.win)) S.win = w; }
      }
    }
    if (!it) { it = d.itemForRec(rec, todayDate()); S.pin = { key: key, it: it, id: id }; }
    else if (it.notice && d.isNoticeCheck(it)) S.pin = { key: key, it: it, id: id };   // 결과 확인 기관은 목록에서 빠졌으므로 맨 위에 붙여 연다
    S.selRow = { key: key, it: it, id: id, st: null };
    S.focusTitle = true;
  }

  function downloadMissing() {
    if (!host || !M || !ready() || S.dlBusy) return;
    const ids = plans.missingIds(visibleRows().base);
    if (!ids.length) return;
    S.dlBusy = true; S.err = ''; renderBanner(); setFlash(''); renderFoot();
    fetch('/institution-plans/missing.csv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ institution_ids: ids }) })
      .then(function (r) {
        if (!r.ok) { const e = new Error('http'); e.status = r.status; throw e; }
        return r.blob().then(function (b) { return { blob: b, name: plans.filenameFrom(r.headers && r.headers.get ? r.headers.get('Content-Disposition') : '') }; });
      })
      .then(function (x) {
        const url = URL.createObjectURL(x.blob);
        const a = document.createElement('a');
        a.href = url; a.download = x.name; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        setFlash('자료 없는 기관 ' + ids.length + '곳의 목록을 내려받았습니다. 엑셀에서 열어 확인하세요.' + (CS.can ? ' 수집이 필요하면 기관을 골라 [수집 요청]을 누르세요.' : ''));   // 요청할 수 없는 사람에게는 없는 버튼을 가리키지 않는다(qa 11-19)
      })
      .catch(function (e) {
        const s = e && e.status;
        S.err = s === 401 || s === 403 ? '목록을 내려받을 권한이 없습니다(' + s + '). 로그인 사번과 권한을 확인하세요.'
          : s ? '목록을 만들지 못했습니다(' + s + '). 목록을 다시 불러온 뒤 시도하세요.' : '서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인하세요.';
      })
      .then(function () { if (!S) return; S.dlBusy = false; renderBanner(); renderFoot(); });
  }

  // ── 수집 요청(기관 사업계획 상세의 .pl-req 줄) ──
  function collectReq(id) {
    if (CS.state !== 'ok') return null;
    return { item: CS.map[id] || null, closed: CS.closed[id] || null, can: CS.can, busy: S && S.reqBusy && S.reqBusy.id === id ? S.reqBusy.kind : '' };
  }
  function onCollect() {   // 수집 요청 현황이 도착·갱신됐을 때: 칩과 요청 줄을 다시 그린다(검색 칸에 입력 중이면 상세는 건드리지 않는다)
    if (!host || !M || !S) return;
    const a = document.activeElement, aid = a && a.id ? a.id : '';
    const pane = $('pl-pane'), inPane = !!(a && pane && pane.contains(a));
    renderList();
    renderFoot();   // 요청 가능 여부(CS.can)가 늦게 와도 바닥 2줄 문구가 맞게
    if (aid === 'pl-dl' && !document.body.contains(a)) { const b = $('pl-dl'); if (b && b.focus) b.focus({ preventScroll: true }); }
    if (S.selRow && !(a && a.id === 'pl-kw')) renderPane();
    if (S.selRow) revealRow(S.selRow.key);   // 칩이 붙어 줄 높이가 바뀌어도 선택 행이 화면 안에 남게
    if (inPane && !document.body.contains(a)) {   // 다시 그리느라 포커스를 둔 요소가 사라졌으면 같은 id → 없으면 제목으로
      const nx = (aid && $(aid)) || $('pl-name');
      if (nx && nx.focus) nx.focus({ preventScroll: true });
    }
  }
  function postEmpty(url) {
    if (typeof fetch !== 'function') return Promise.resolve({ ok: false, status: 0 });
    return fetch(url, { method: 'POST' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        return { ok: r.ok, status: r.status, data: j, code: r.ok ? '' : (j && j.detail && typeof j.detail === 'object' ? str(j.detail.code) : '') };
      });
    }).catch(function () { return { ok: false, status: 0 }; });
  }
  function applyCollectResult(id, res) {   // 응답으로 캐시를 바로 맞춘다(다시 받지 않는다). 닫힌 상태(취소됨)는 캐시에 두지 않는다
    const st = str(res.status_cd);
    delete CS.closed[id];   // 방금 낸 요청·취소 결과가 더 새롭다. 옛 '실패/제외됨' 줄을 남기지 않는다
    if (st === 'REQUESTED' || st === 'RUNNING') {
      CS.map[id] = { institution_id: id, status_cd: st, requester_count: Number(res.requester_count) || 0, requested_by_me: !!res.requested_by_me,
        first_requested_at: res.first_requested_at || null, run_at: res.run_at || null };
    } else delete CS.map[id];
  }
  function requestCollect(kind) {
    const row = S && S.selRow;
    if (!host || !row || !ID_RE.test(row.id) || S.reqBusy || CS.state !== 'ok') return;
    const state = S, id = row.id;
    state.reqBusy = { id: id, kind: kind };
    setFlash(''); renderPane();
    postEmpty('/institutions/' + encodeURIComponent(id) + '/plan-collect' + (kind === 'cancel' ? '/cancel' : '')).then(function (r) {
      if (state !== S) return;   // 그 사이 계정이 바뀌었으면 버린다
      state.reqBusy = null;
      let next;
      if (r.ok) {
        applyCollectResult(id, r.data || {});
        setFlash(plans.reqFlash(kind, r.data || {}));
        next = kind === 'go' ? 'pl-req-cancel' : 'pl-req-go';
      } else {
        setFlash(plans.reqErrorText(kind, r.status, r.code));
        if (r.status === 404 || r.status === 409) ensureCollect(true);
        next = kind === 'go' ? 'pl-req-go' : 'pl-req-cancel';
      }
      if (!host) return;
      renderList();
      if (state.selRow && state.selRow.id === id) {
        renderPane();
        const b = $(next) || $('pl-req-go') || $('pl-req-cancel') || $('pl-name');   // 눌렀던 버튼이 바뀌어도 포커스를 잃지 않는다
        if (b && b.focus) b.focus();
      }
      refreshSlots();
      if (r.ok && root.plancollect && root.plancollect.refreshBadge) root.plancollect.refreshBadge(true);   // 개발부서가 직접 요청했으면 메뉴 배지도
    });
  }

  function fillControls() {
    const w = $('pl-win'), st = $('pl-stat'), rg = $('pl-region'), q = $('pl-q');
    if (w) w.innerHTML = plans.winHtml(S.win);
    if (st) st.innerHTML = plans.statHtml(S.stat);
    if (q) q.value = S.q;
    if (rg) {
      rg.innerHTML = '<option value="">전체 지역</option>' + D().regionOptions(dataList()).map(function (o) {
        return '<option value="' + esc(o.code) + '">' + esc(o.name) + '</option>';
      }).join('');
      rg.value = S.region;
    }
  }
  function onClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    const row = t.closest('.db-row');
    if (row && host.contains(row)) { select(row.getAttribute('data-key'), false); return; }
    const btn = t.closest('button');
    if (!btn) return;
    switch (btn.id) {
      case 'pl-dl': downloadMissing(); break;
      case 'pl-to-notice':
        // 열기 실패(탭 가득 참 등)는 app.openNavItem 이 스스로 안내한다 — 여기서는 app 이 없을 때만 알린다(QA 11-16).
        if (root.app && root.app.openNavItem && root.nav) root.app.openNavItem(root.nav.NOTICE_ID);
        else setFlash('입찰 공고 현황을 열 수 없습니다. 왼쪽 메뉴의 [입찰 공고 현황]에서 여세요.');
        break;
      case 'pl-retry': ensureStatus(true).then(function () { const l = $('pl-lb'); if (l) l.focus(); }); onStatus(); break;
      case 'pl-retry-detail': if (S.selRow) { delete S.cache[S.selRow.id]; loadDetail(S.selRow.id); renderPane(); } break;
      case 'pl-req-go': requestCollect('go'); break;
      case 'pl-req-cancel': requestCollect('cancel'); break;
      case 'pl-clear': S.q = ''; S.region = ''; fillControls(); renderList(); renderFoot(); break;
      default: break;
    }
  }
  function onKey(e) {
    const lb = e.target;
    if (!lb || !lb.getAttribute || lb.getAttribute('role') !== 'listbox' || !host.contains(lb)) return;
    const opts = Array.prototype.slice.call(lb.querySelectorAll('[role=option]'));
    if (!opts.length) return;
    let i = opts.findIndex(function (o) { return S.selRow && o.getAttribute('data-key') === S.selRow.key; });
    if (e.key === 'ArrowDown') i = i < 0 ? 0 : Math.min(opts.length - 1, i + 1);
    else if (e.key === 'ArrowUp') i = i < 0 ? 0 : Math.max(0, i - 1);
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = opts.length - 1;
    else if (e.key === 'Enter') { e.preventDefault(); const h = $('pl-name'); if (h) h.focus(); return; }
    else return;
    e.preventDefault();
    select(opts[i].getAttribute('data-key'), true);
  }
  function onInput(e) {
    const id = e.target && e.target.id;
    if (id === 'pl-q') { S.q = e.target.value; S.pin = null; S.revealKey = ''; renderList(); renderFoot(); }
    else if (id === 'pl-kw') { S.kw = e.target.value; renderDocs(); }
  }
  function onChange(e) {
    const t = e.target;
    if (!t) return;
    if (t.id === 'pl-region' || t.name === 'pl-win' || t.name === 'pl-stat') S.revealKey = '';   // 사용자가 목록 조건을 바꾸면 늦은 스크롤 예약을 버린다
    if (t.id === 'pl-region') { S.region = t.value; S.pin = null; renderList(); renderFoot(); }
    else if (t.name === 'pl-win') { S.win = D().windowKey(t.value); S.pin = null; renderList(); renderFoot(); }
    else if (t.name === 'pl-stat') { S.stat = STATS.some(function (p) { return p[0] === t.value; }) ? t.value : 'all'; S.pin = null; renderList(); renderFoot(); }
  }

  // 화면이 열릴 때마다 app.showSoon 이 부른다. 선택·필터는 이어 가고 데이터는 다시 받는다.
  plans.mount = function (el) {
    if (typeof document === 'undefined') return;
    const target = el || document.getElementById('plans-root');
    if (!target) return;
    if (host) plans.unmount();
    host = target;
    const who = whoNow();
    if (!S || S.who !== who) S = freshState(who);
    S.cache = {}; S.err = ''; S.reqBusy = null;
    ac = typeof AbortController === 'function' ? new AbortController() : null;
    const opt = ac ? { signal: ac.signal } : undefined;
    host.innerHTML = SKELETON;
    host.addEventListener('click', onClick, opt);
    host.addEventListener('keydown', onKey, opt);
    host.addEventListener('input', onInput, opt);
    host.addEventListener('change', onChange, opt);
    M = D().model(dataList(), todayDate());
    fillControls();
    const hadPending = !!S.pendingId;   // 현황판·지도에서 기관을 골라 들어왔는가
    applyPending();
    if (S.selRow) loadDetail(S.selRow.id);
    renderBanner(); renderList(); renderFoot(); renderPane();
    if (hadPending && S.selRow) { revealRow(S.selRow.key); S.revealKey = S.selRow.key; }   // '전체' 창처럼 목록이 길 때 선택 행이 스크롤 밖에 남지 않게(현황 도착 뒤 onStatus 가 한 번 더)
    ensureStatus(true);
  };
  plans.unmount = function () {
    if (ac) ac.abort();
    ac = null;
    if (host) host.innerHTML = '';
    host = null; M = null;
  };
  // 계정이 바뀌면 이전 계정의 현황·상세 캐시와 선택을 버린다(app.onProfileChanged).
  plans.onProfileChange = function () {
    if (typeof document === 'undefined') return;
    plans.resetStatus();
    S = null;
    const was = host;
    plans.unmount();
    if (was && was.style.display !== 'none') plans.mount(was);
    refreshSlots();
  };
  // 사이드바를 다시 그린 뒤(app.paintNav) 부른다. 계정이 바뀌면 onProfileChange 가 새 메뉴 도착 전 사이드바로 판정하므로,
  // 메뉴가 바뀐 다음 상세의 '사업계획' 절을 다시 판정한다(숨길 사람은 비우고, 보일 사람은 현황을 받아 채운다).
  plans.onNavPainted = function () {
    if (typeof document === 'undefined' || !document.querySelector('.pl-slot[data-pl-id]')) return;
    refreshSlots();
    if (plans.menuVisible() && ST.state === 'idle') ensureStatus(false);
  };

  // 문서 단위 클릭: '사업계획 N건 보기'(현황판·지도 상세). 지도 팝업이 열려 있으면 화면이 열린 뒤 닫는다.
  function onDocClick(e) {
    const t = e.target && e.target.closest ? e.target.closest('[data-pl-open]') : null;
    if (!t) return;
    const ok = plans.openInstitution(t.getAttribute('data-pl-open'));
    if (ok) {
      const d = D();
      if (d && d.isDetailOpen && d.isDetailOpen()) d.closeDetail(false);
      return;
    }
    const msg = t.parentNode && t.parentNode.querySelector ? t.parentNode.querySelector('.pl-msg') : null;
    if (msg) msg.textContent = '기관 사업계획 화면을 열지 못했습니다. 메뉴에 보이지 않거나 열어 둔 화면이 가득 찬 경우입니다.';
  }

  if (isNode) module.exports = plans;
  else {
    root.plans = plans;
    if (root.dashboard) root.dashboard.plansHook = plans.paneSection;
    if (typeof document !== 'undefined') document.addEventListener('click', onDocClick);
  }
})(typeof self !== 'undefined' ? self : this);
