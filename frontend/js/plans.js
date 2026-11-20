(function (root) {
  'use strict';
  // 기관 사업계획 1단계(2026-11-16). 서버: InstitutionPlanController —
  //   GET /institution-plans/status, GET /institutions/{id}/plans, POST /institution-plans/missing.csv(감사 남는 내려받기).
  // 규격: handoff/agents/design-reviewer/2026-11-16_1007_a15c69be.md (보충 A~G). 새 판정 로직 없이 logic.js·dashboard.js(regionName·regionOptions)를 조합한다.
  // 목록 = 모든 기관(dataList). 목표·관심은 GET /bid-targets 올해·내년 두 번, 자료 현황은 서버 status 를 institution_id 로 붙인다. 입찰일 기준 판정은 쓰지 않는다(NEXT 103).
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
  plans.docHtml = function (d, kw, months) {
    const items = Array.isArray(d.items) ? d.items : [];
    const hid = 'pl-d' + esc(d.doc_id);
    const notes = [];
    if (d.period_ended) notes.push('<p class="db-why">' + esc(d.period_to) + '년에 끝난 계획입니다. 누리집에 새 계획이 있는지 확인하세요.</p>');
    const mo = Number(months) > 0 ? Math.floor(Number(months)) : 12;   // 서버 status 의 stale_months. 못 받았으면 서버 기본값과 같게
     if (d.stale) notes.push('<p class="pl-warn">확인 ' + mono(ymd(d.checked_on)) + ' 뒤로 ' + mo + '개월 넘게 다시 확인하지 않았습니다.</p>');
    return '<section class="pl-doc" aria-labelledby="' + hid + '"><div class="pl-doc-h"><h4 id="' + hid + '">' + esc(d.title) + '</h4>' +
      badge('pp-neutral', str(d.src_kind_name || d.src_kind_cd) || '기타') + (d.period_ended ? ' ' + badge('pp-cancel', '기간 지남') : '') + '</div>' +
      '<dl class="db-dl"><dt>출처</dt><dd>' + plans.srcLineHtml(d) + '</dd>' +
      '<dt>대상 기간</dt><dd>' + mono(plans.periodText(d)) + '</dd>' +
      (str(d.note).trim() ? '<dt>비고</dt><dd class="pl-note">' + esc(d.note) + '</dd>' : '') + '</dl>' +
      notes.join('') + plans.itemsTableHtml(items, d.budget_unit_cd, kw, d.title) + '</section>';
  };
  plans.docsHtml = function (data, kw, months) {
    const docs = Array.isArray(data && data.docs) ? data.docs : [];
    return docs.map(function (d) { return plans.docHtml(d, kw, months); }).join('');
  };
  // 상태 칩 한 곳(규격 design 2026-11-19 6-1). 목록 3행·상세 '사업계획' 절 첫 줄·현황판·지도 '자료' 칸이 함께 쓴다.
  // st = /institution-plans/status 한 건 또는 null, req = 열린 요청(REQUESTED·RUNNING) 또는 null, closed = 최근 실패·제외(last_closed, 요청 가능한 사람만 받는다) 또는 null,
  // isNew = 7일 안에 반영된 요청(/plan-collect/status recent_applied 한 건 { closed_at } 또는 true) 또는 falsy. 칩은 최대 4개, 글자는 모두 칩 안에(색만으로 전하지 않는다).
  const OPEN_CHIP = { REQUESTED: ['gap', '요청됨', '사업계획 요청됨'], RUNNING: ['pp-neutral', '수집 중', '사업계획 수집 중'] };   // [색, 자료 있을 때 짧은 글자, 자료 없을 때 긴 글자]
  function stChip(cls, text, st) { return '<span class="wf-badge ' + cls + '" data-st="' + esc(st) + '">' + esc(text) + '</span>'; }
  function newChipHtml(isNew) {
    const day = isNew && typeof isNew === 'object' ? plans.kstYmd(isNew.closed_at) : '';
    const title = '수집 요청으로 ' + (day ? day + '에 ' : '') + '들어온 자료입니다(7일간 표시).';
    return '<span class="wf-badge cr-st ok" data-st="NEW" title="' + esc(title) + '"><span aria-hidden="true">new</span><span class="sr-only">새로 들어온 자료</span></span>';
  }
  plans.stateChipsHtml = function (st, req, closed, isNew) {
    const rc = req ? str(req.status_cd) : '';
    const open = Object.prototype.hasOwnProperty.call(OPEN_CHIP, rc) ? OPEN_CHIP[rc] : null;
    const cc = !open && closed && (closed.status_cd === 'FAILED' || closed.status_cd === 'EXCLUDED') ? closed.status_cd : '';
    const closedChip = cc === 'FAILED' ? stChip('cr-st none', '수집 실패', cc) : cc === 'EXCLUDED' ? stChip('pp-cancel', '수집 제외', cc) : '';
    if (!st) return open ? stChip('cr-st ' + open[0], open[2], rc) : unk('자료 없음') + (closedChip ? ' ' + closedChip : '');
    const out = [badgeHtml('pp-neutral', '사업계획 ' + mono(Number(st.item_count) || 0) + '건')];
    if (isNew) out.push(newChipHtml(isNew));
    if (st.period_ended) out.push(badge('pp-cancel', '기간 지남'));
    if (st.stale && !isNew && !open) out.push(badge('cr-st gap', '오래됨'));   // 방금 들어왔거나 이미 다시 요청 중이면 '오래됨'을 뺀다
    if (open) out.push(stChip('cr-st ' + open[0], open[1], rc)); else if (closedChip && !isNew) out.push(closedChip);   // 새 자료가 들어왔으면 그 뒤 재요청의 실패·제외는 칩으로 내지 않는다(qa 11-19 P2-2)
    return out.join(' ');
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
      inner = '<span class="db-why">' + (day ? mono(day) : '') + (why ? (day ? ' · ' : '') + '사유: ' + esc(why) : '') + '</span>' + go;
    } else if (!item) {
      if (!can) return '';
      inner = go + '<span class="db-why">' + (o.hasData ? '새 계획이 나왔으면 다시 요청하세요.' : '개발부서가 수집하고, 자료가 들어오면 쪽지로 알려 드립니다.') + '</span>';
    } else {
      const st = str(item.status_cd), n = Number(item.requester_count) || 0, mine = !!item.requested_by_me;
      const day = st === 'RUNNING' ? plans.kstYmd(item.run_at) : plans.kstYmd(item.first_requested_at);
      const when = (day ? (st === 'RUNNING' ? ' · 내보냄 ' : ' · 첫 요청 ') + mono(day) : '') + (st === 'RUNNING' ? ' · 반입 대기' : '');
      inner = '<span class="db-why">' + (mine ? '나 포함 ' + mono(n) + '명' : mono(n) + '명 요청') + when + '</span>' +
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
    function head() {   // 상태 칩은 제목 옆이 아니라 '사업계획' 절 첫 줄(규격 6-3). 기존 head('') 호출은 그대로 둬도 된다
      return '<div class="db-head"><h2 id="pl-name" tabindex="-1">' + esc(name) + '</h2></div>' +
        (o.sub ? '<p class="db-sub">' + esc(o.sub) + '</p>' : '');
    }
    // '사업계획' 절: 자료 유무와 관계없이 같은 절. 첫 줄 상태 칩 → body(설명 또는 반입일) → 요청 줄(body 끝에 붙인다)
    function sumSec(chips, body) {
      return '<section class="db-sec pl-sum" aria-labelledby="pl-sum-h"><h3 id="pl-sum-h">사업계획</h3><p class="pl-st">' + chips + '</p>' + body + '</section>';
    }
    if (v.status === 'loading') return head('') + '<p class="db-state" aria-busy="true">사업계획을 불러오는 중입니다…</p>';
    if (v.status === 'noid') return head() + sumSec(unk('자료 없음'), '<p class="db-empty">서버에 등록된 기관만 사업계획을 조회합니다. 이 기관은 아직 서버에 등록되지 않아 조회할 수 없습니다.</p>');
    if (v.status === 'offline') return head('') + '<p class="db-state">서버에 연결되면 사업계획을 볼 수 있습니다.</p>';
    if (v.status === 'denied') return head('') + '<p class="db-state">이 기관의 사업계획을 볼 권한이 없습니다(' + esc(v.code || 403) + '). 로그인 사번과 권한을 확인하세요.</p>';
    if (v.status === 'notfound') return head('') + '<p class="db-state">서버에서 이 기관을 찾지 못했습니다. 서버에 등록된 기관만 사업계획을 조회합니다.</p>';
    if (v.status !== 'ok') return head('') + '<p class="db-state">사업계획을 불러오지 못했습니다(' + esc(v.code || '연결 실패') + '). <button type="button" id="pl-retry-detail">다시 불러오기</button></p>';
    const data = v.data || {};
    const docs = Array.isArray(data.docs) ? data.docs : [];
    // 수집 요청 줄(규격 6-3): '사업계획' 절의 마지막 줄. 자료가 있든 없든 같은 자리. 서버 현황을 못 받았으면(o.req 없음) 그리지 않는다.
    const reqLine = o.req ? plans.reqLineHtml(o.req.item, { can: o.req.can, hasData: docs.length > 0, busy: o.req.busy, closed: o.req.closed }) : '';
    const rq = o.req || null;
    const openReq = rq ? rq.item : null, closedReq = rq && rq.can ? rq.closed : null;   // 닫힌 실패·제외는 요청 가능한 사람에게만(reqLineHtml 과 같은 규칙)
    if (!docs.length) {
      return head() + sumSec(plans.stateChipsHtml(null, openReq, closedReq, null), '<p class="db-empty">' +
        (rq && !rq.can ? '이 기관의 사업계획은 아직 수집되지 않았습니다. 영업부서가 수집을 요청하면 개발부서가 모아 올립니다.' : '이 기관의 사업계획은 아직 수집되지 않았습니다.') + '</p>' + reqLine);
    }
    const n = docs.reduce(function (s, d) { return s + (Array.isArray(d.items) ? d.items.length : 0); }, 0);
    const imp = data.import || {};
    const impLine = imp.imported_at ? '<p class="db-why pl-imp">반입 ' + mono(plans.kstYmd(imp.imported_at)) + ' · ' + esc(ORIGIN[imp.origin_cd] || imp.origin_cd || '') + '</p>' : '';
    const kw = '<div class="pl-kwrow"><label class="sr-only" for="pl-kw">이 기관의 사업 찾기</label><input id="pl-kw" type="search" autocomplete="off" ' +
      'placeholder="사업명·내용에서 찾기 (예: 청년, 소상공인, 디지털)" value="' + esc(o.kw || '') + '"></div>';
    const chips = plans.stateChipsHtml({
      item_count: n, period_ended: docs.every(function (d) { return d.period_ended; }), stale: docs.some(function (d) { return d.stale; }),
    }, openReq, closedReq, rq && rq.applied);
    return head() + sumSec(chips, impLine + reqLine) + kw + '<div id="pl-docs">' + plans.docsHtml(data, o.kw, o.staleMonths) + '</div>';
  };

  // ── 순수: 목록 ─────────────────────────────────────────────────────
  plans.statusMap = function (data) {
    const m = {};
    ((data && data.items) || []).forEach(function (r) { if (r && r.institution_id) m[r.institution_id] = r; });
    return m;
  };
  // ── 순수: 목록(모든 기관) ─────────────────────────────────────────────
  // 목표·관심 = GET /bid-targets?year= 를 올해·내년 두 번 받은 성공 응답 [{ year, data }]. items = 그해 목표, watch_items = 관심(두 응답에 같은 관심이 오므로 기관 ID 로 합친다).
  // watch_items 가 배열이 아닌 응답뿐이면 관심 기능이 없는 서버(hasWatch=false). 목표이면서 관심이면 목표로 본다. 기관 ID 키는 ownGet/ownPut 으로만 읽고 쓴다.
  plans.mergeTargets = function (resps) {
    const goal = {}, watch = {};
    let hasWatch = false;
    (Array.isArray(resps) ? resps : []).forEach(function (r) {
      const d = r && r.data;
      if (!d) return;
      (Array.isArray(d.items) ? d.items : []).forEach(function (t) {
        const id = str(t && t.institution_id);
        if (!id) return;
        const y = Number(t.target_year) || Number(r.year) || 0;
        const cur = ownGet(goal, id) || { years: [] };
        if (y && cur.years.indexOf(y) < 0) cur.years.push(y);
        cur.years.sort(function (a, b) { return a - b; });
        ownPut(goal, id, cur);
      });
      if (Array.isArray(d.watch_items)) {
        hasWatch = true;
        d.watch_items.forEach(function (t) { const id = str(t && t.institution_id); if (id) ownPut(watch, id, true); });
      }
    });
    return { goal: goal, watch: watch, hasWatch: hasWatch };
  };
  plans.targetOf = function (tm, id) {
    if (!tm || !id) return null;
    const g = ownGet(tm.goal, id);
    if (g) return { kind: 'GOAL', years: g.years.slice() };
    return ownGet(tm.watch, id) ? { kind: 'WATCH', years: [] } : null;
  };
  // 행 = { key, rec, name, region, id, st(서버 현황 또는 null), kind('GOAL'|'WATCH'|''), years[] }. map 이 null 이면 st 는 모두 null(아직 모름).
  plans.baseRows = function (list, tm, map) {
    return logic.dedupeByInstitution(Array.isArray(list) ? list : []).map(function (r) {
      const id = r.institutionId ? String(r.institutionId) : '';
      const t = plans.targetOf(tm, id);
      return { key: logic.instKey(r), rec: r, name: r.name || '', region: r.region || '', id: id, st: id && map ? ownGet(map, id) : null,
        kind: t ? t.kind : '', years: t ? t.years : [] };
    });
  };
  const COLL = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator('ko') : null;
  function cmpName(a, b) { return COLL ? COLL.compare(a, b) : (a < b ? -1 : (a > b ? 1 : 0)); }
  // 정렬 켬의 위 묶음 안 구분: 올해(이하) 목표 0 → 그 뒤 해 목표 1 → 관심 2 → 그 밖 3. 두 해 목표는 이른 연도 기준.
  plans.goalRank = function (r, year) { return r.kind === 'GOAL' ? ((r.years[0] || 0) <= year ? 0 : 1) : (r.kind === 'WATCH' ? 2 : 3); };
  // 기본: 자료 있는 곳 먼저 → 이름순. top(정렬 켬)이면 구분 순위가 먼저, 같은 구분 안은 같은 기본 정렬.
  plans.orderRows = function (rows, top, year) {
    return rows.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
      if (top) { const ra = plans.goalRank(a.r, year), rb = plans.goalRank(b.r, year); if (ra !== rb) return ra - rb; }
      const ha = a.r.st ? 0 : 1, hb = b.r.st ? 0 : 1;
      if (ha !== hb) return ha - hb;
      return cmpName(a.r.name, b.r.name) || a.i - b.i;
    }).map(function (x) { return x.r; });
  };
  plans.filterRows = function (rows, f) {
    const q = str(f && f.q).trim().toLowerCase(), region = str(f && f.region);
    return rows.filter(function (r) { return (!q || r.name.toLowerCase().indexOf(q) >= 0) && (!region || r.region === region); });
  };
  // ── 순수: 일괄 수집 요청(POST /plan-collect/batch, 서버 MAX_BATCH 50) ──
  plans.BATCH_MAX = 50;
  plans.reasonOf = function (r) { return !r.st ? 'none' : (r.st.stale ? 'stale' : (r.st.period_ended ? 'ended' : '')); };
  // 대상: ID_RE + 열린 요청 없음 + 최근 닫힘이 EXCLUDED 아님(FAILED 는 포함) + (자료 없음 | 오래됨 | 기간 지남).
  // rows = 화면에 보이는 행(표시 순서), top = 정렬 켬(켬이면 목표·관심 행만), reqOf(id) = 열린 요청, closedOf(id) = 최근 닫힘.
  // skipped = 데이터상 대상인데 빠진 곳 수(이미 요청 중 · 수집 제외 · 서버에 등록되지 않음).
  plans.batchPlan = function (rows, top, reqOf, closedOf) {
    const pool = top ? rows.filter(function (r) { return !!r.kind; }) : rows;
    const seen = {}, all = [], counts = { none: 0, stale: 0, ended: 0 }, skipped = { open: 0, excl: 0, noid: 0 };
    pool.forEach(function (r) {
      if (!(!r.st || r.st.stale || r.st.period_ended)) return;
      if (!ID_RE.test(r.id)) { skipped.noid += 1; return; }
      if (ownGet(seen, r.id)) return;
      ownPut(seen, r.id, true);
      if (reqOf && reqOf(r.id)) { skipped.open += 1; return; }
      const c = closedOf ? closedOf(r.id) : null;
      if (c && c.status_cd === 'EXCLUDED') { skipped.excl += 1; return; }
      all.push(r);
      counts[plans.reasonOf(r)] += 1;
    });
    const sel = all.slice(0, plans.BATCH_MAX);
    return { ids: sel.map(function (r) { return r.id; }), rows: sel, total: all.length, counts: counts, skipped: skipped };
  };
  // 바닥 둘째 줄의 일괄 요청(요청 가능한 사람만). 0곳이면 #pl-bat-none(포커스 복귀 자리).
  plans.batHtml = function (p, o) {
    o = o || {};
    if (!p || !p.total) return '<span id="pl-bat-none" tabindex="-1">수집 요청할 기관이 없습니다.</span>';
    const n = p.ids.length, over = p.total > n;
    const lab = o.hasWatch === false ? '목표' : '목표·관심';
    const btn = '<button type="button" id="pl-bat"' + (o.busy ? ' disabled' : '') + (o.wait ? ' aria-disabled="true" aria-describedby="pl-bat-why"' : '') + '>' + (o.top ? lab + ' ' : '') + (over ? '앞 ' : '') + mono(n) + '곳 수집 요청</button>';
    if (o.wait) return btn + ' <span class="db-why" id="pl-bat-why">목표·관심 기관 목록을 받는 중입니다.</span>';   // 목록 순서가 아직 기본 정렬이라 누르면 엉뚱한 곳이 간다 — 눌러도 무시
    let why = '';
    if (o.top) {
      const parts = [];
      if (p.counts.none) parts.push('자료 없음 ' + mono(p.counts.none));
      if (p.counts.stale) parts.push('오래됨 ' + mono(p.counts.stale));
      if (p.counts.ended) parts.push('기간 지남 ' + mono(p.counts.ended));
      why = parts.join(' · ');
    } else if (over) why = '확인 필요 ' + mono(p.total) + '곳 중 목록 순서로';
    return btn + (why ? ' <span class="db-why">' + why + '</span>' : '');
  };
  function reasonChip(r) {
    const k = plans.reasonOf(r);
    return k === 'none' ? unk('자료 없음') : (k === 'stale' ? badge('cr-st gap', '오래됨') : badge('pp-cancel', '기간 지남'));
  }
  function kindLabel(r) { return r.kind === 'GOAL' ? (r.years[0] ? mono(r.years[0]) + ' ' : '') + '목표' : (r.kind === 'WATCH' ? '관심' : '그 밖의 기관'); }
  // 확인 창 마크업(공통 .dlg 시안의 클래스 이름·구조, alertdialog). 동적 글은 모두 esc/mono.
  plans.batchDialogHtml = function (p) {
    const n = p.ids.length, sk = p.skipped || {};
    const warn = p.total > n ? '<p class="pl-warn">확인 필요 ' + mono(p.total) + '곳 중 목록 순서로 앞 ' + mono(n) + '곳만 요청합니다(한 번에 ' + mono(plans.BATCH_MAX) + '곳까지).</p>' : '';
    const rows = p.rows.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td>' + kindLabel(r) + '</td><td>' + reasonChip(r) + '</td></tr>'; }).join('');
    const skip = [];
    if (sk.open) skip.push('이미 요청 중 ' + mono(sk.open) + '곳');
    if (sk.excl) skip.push('수집 제외 ' + mono(sk.excl) + '곳');
    if (sk.noid) skip.push('서버에 등록되지 않은 ' + mono(sk.noid) + '곳');
    return '<div id="pl-dlg" class="modal-overlay" style="display:none"><div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="pl-dlg-t" aria-describedby="pl-dlg-p">' +
      '<header class="dlg-bar"><h2 class="dlg-t" id="pl-dlg-t" tabindex="-1">사업계획 ' + esc(n) + '곳 수집 요청</h2></header>' +
      '<div class="dlg-note"><p class="dlg-hint" id="pl-dlg-busy" hidden>창을 닫아도 요청은 계속 보내지고 결과는 화면 위 띠에 나옵니다.</p><p class="dlg-err" id="pl-dlg-err" role="alert"></p></div>' +
      '<div class="dlg-body" id="pl-dlg-d"><p class="pl-dlg-p" id="pl-dlg-p">개발부서에 아래 기관의 사업계획 수집을 요청합니다. 자료가 들어오면 쪽지로 알려 드립니다.</p>' + warn +
      '<div class="pl-dlg-scroll" tabindex="0" role="region" aria-label="요청할 기관"><table class="pl-dlg-tbl"><caption class="sr-only">요청할 기관</caption>' +
      '<thead><tr><th scope="col">기관</th><th scope="col">구분</th><th scope="col">이유</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      (skip.length ? '<p class="db-why pl-dlg-skip">뺀 곳: ' + skip.join(' · ') + '</p>' : '') +
      '</div>' +
      '<footer class="dlg-foot"><button type="button" id="pl-dlg-cancel">취소</button><button type="button" id="pl-dlg-ok" class="dlg-go">' + esc(n) + '곳 요청</button></footer></div></div>';
  };
  // 200 응답 { requested_count, joined_count, already_count, not_found_count, error_count, note_sent, results[] } → { fail, text }.
  // fail=true(접수된 곳 0)면 #pl-err 로, 아니면 #pl-flash 로. nameOf(id)는 3곳 이하일 때 기관명용(없으면 id).
  plans.batchResult = function (res, nameOf) {
    const g = function (k) { return Number(res && res[k]) || 0; };
    const rq = g('requested_count'), jn = g('joined_count'), al = g('already_count'), nf = g('not_found_count'), er = g('error_count');
    const ok = rq + jn + al, fail = nf + er;
    if (!ok && fail) return { fail: true, text: fail + '곳 모두 요청하지 못했습니다. 잠시 뒤 다시 누르세요.' };
    let text;
    if (rq && !jn && !al && !fail) text = rq + '곳 수집을 요청했습니다. 개발부서가 처리하면 쪽지로 알려 드립니다.';
    else if (ok) {
      const parts = [];
      if (rq) parts.push('새 요청 ' + rq + '곳');
      if (jn) parts.push('다른 사람 요청에 함께 올림 ' + jn + '곳');
      if (al) parts.push('이미 내가 요청한 곳 ' + al + '곳');
      text = ok + '곳 요청을 보냈습니다: ' + parts.join(' · ') + '.';
    } else text = '요청한 기관이 없습니다.';
    if (fail) {
      const bad = (Array.isArray(res && res.results) ? res.results : []).filter(function (r) { return r && (r.result_cd === 'not_found' || r.result_cd === 'error'); });
      const why = function (r) { return r.result_cd === 'not_found' ? '서버에서 찾지 못함' : (r.code === 'CONCURRENT' ? '동시에 처리됨' : '처리 오류'); };
      let det;
      if (bad.length && bad.length <= 3) det = bad.map(function (r) { return (nameOf ? nameOf(str(r.institution_id)) : str(r.institution_id)) + ': ' + why(r); }).join(' · ');
      else {
        const cnt = {};
        if (bad.length) bad.forEach(function (r) { cnt[why(r)] = (cnt[why(r)] || 0) + 1; });
        else { if (nf) cnt['서버에서 찾지 못함'] = nf; if (er) cnt['처리 오류'] = er; }
        det = Object.keys(cnt).map(function (k) { return k + ' ' + cnt[k]; }).join(' · ');
      }
      text += ' 못 한 곳 ' + fail + '곳(' + det + '). 못 한 곳은 목록에 그대로 남으니 잠시 뒤 다시 누르세요.';
    }
    if (rq > 0 && res && res.note_sent === false) text += ' 개발부서 알림이 가지 않았습니다(요청은 접수됨). 개발부서에 따로 알려 주세요.';
    return { fail: false, text: text };
  };
  plans.TIMEOUT_TEXT = '응답이 늦어 결과를 확인하지 못했습니다. 요청은 접수됐을 수 있으니 창을 닫고 바닥 숫자가 줄었는지 확인하세요.';
  plans.batchErrorText = function (status, code, timeout) {
    if (timeout) return plans.TIMEOUT_TEXT;
    if (Number(status) === 400) return '요청 목록이 올바르지 않아 보내지 못했습니다. 화면을 다시 연 뒤 다시 누르세요.';
    return plans.reqErrorText('go', status, code);
  };
  // 정렬 토글(목록 머리줄 오른쪽). 글자는 눌림과 무관하게 고정, 눌림 표시는 체크 SVG(CSS 가 눌릴 때만 보임). o = { on, ok(목표·관심을 받았는가), why, hasWatch }
  plans.topLabel = function (hasWatch) { return hasWatch === false ? '목표 먼저' : '목표·관심 먼저'; };
  plans.sortBtnHtml = function (o) {
    o = o || {};
    return '<button type="button" id="pl-sort" class="pl-sort" aria-pressed="' + (o.on && o.ok ? 'true' : 'false') + '"' + (o.ok ? '' : ' aria-disabled="true"') +
      (o.why ? ' title="' + esc(o.why) + '"' : '') + '><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3.5"></path></svg><span>' +
      esc(plans.topLabel(o.hasWatch)) + '</span></button>';
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
  // can = 수집 요청을 할 수 있는 사용자(CS.can). 가능하면 둘째 줄 = 일괄 요청 조각(bat, plans.batHtml), 불가면 '확인용입니다.'(없는 버튼을 가리키지 않게).
  plans.footHtml = function (n, m, busy, can, bat) {
    n = Number(n) || 0; m = Number(m) || 0;
    let h = '';
    if (n) {
      h = '목록에 담을 기관 ' + mono(n) + '곳 · <button type="button" class="db-link" id="pl-dl"' + (busy ? ' disabled' : '') + '>자료 없는 기관 내려받기(CSV)</button>';
      if (!can) h += '<br>확인용입니다.';
      else if (bat) h += '<br>' + bat;
    } else if (can && bat) h = bat;
    if (m > n) h += (h ? '<br>' : '') + '서버에 등록되지 않은 ' + mono(m - n) + '곳은 목록에 넣을 수 없습니다.';
    return h;
  };
  const STATS = [['all', '모두'], ['has', '자료 있음'], ['none', '자료 없음']];   // 기간 묶음의 '전체'와 겹치지 않게 '모두'
  plans.statHtml = function (stat) {
    return '<legend class="sr-only">사업계획 자료 상태</legend>' + STATS.map(function (p) {
      return '<label><input type="radio" name="pl-stat" value="' + p[0] + '"' + (p[0] === stat ? ' checked' : '') + '><span>' + esc(p[1]) + '</span></label>';
    }).join('');
  };
  // 요약줄 #pl-g (규격 보정 7). o = { ready(서버 현황 받음), loading, stat('all'|'has'|'none'), total(기관 수), shown(상태 필터 뒤), has(자료 있음 수), top(정렬 켬), marks(위 묶음 수), hasWatch }
  plans.groupLabelHtml = function (o) {
    o = o || {};
    const tot = '<b>' + esc(o.total) + '</b>';
    if (o.ready && o.stat === 'none') return '자료 없음 <b>' + esc(o.shown) + '</b>곳 (전체 ' + tot + '곳)';
    if (o.ready && o.stat === 'has') return '자료 있음 <b>' + esc(o.shown) + '</b>곳 (전체 ' + tot + '곳)';
    if (!o.ready) return '기관 ' + tot + '곳' + (o.loading ? ' · 사업계획 현황을 받는 중' : '');
    if (o.top) return '기관 ' + tot + '곳 · ' + (o.hasWatch === false ? '목표' : '목표·관심') + ' <b>' + esc(o.marks) + '</b>곳을 위로';
    return '기관 ' + tot + '곳 · 자료 있음 <b>' + esc(o.has) + '</b>곳 · 자료 있는 곳 먼저';
  };
  // 묶음 머리 .pl-gh (규격 보정 3). which = 'top'|'rest', o = { id, goal, watch, total, marks(필터 전 목표·관심 수), hasWatch }. li role=presentation, ul[role=group]이 id 로 이름을 받는다.
  plans.groupHeadHtml = function (which, o) {
    o = o || {};
    const lab = o.hasWatch === false ? '목표' : '목표·관심';
    let inner;
    if (which === 'rest') inner = '<b>그 밖의 기관</b> ' + mono(o.total) + '곳';
    else if (!o.total) inner = esc(o.marks ? '조건에 맞는 ' + lab + ' 기관이 없습니다.' : lab + ' 기관이 없습니다. 입찰 현황판에서 ' + lab + ' 기관으로 넣을 수 있습니다.');
    else inner = '<b>' + lab + '</b> ' + mono(o.total) + '곳' + (o.hasWatch === false ? '' : ' (목표 ' + mono(o.goal) + ' · 관심 ' + mono(o.watch) + ')');
    return '<li role="presentation" class="pl-gh" id="' + esc(o.id || '') + '">' + inner + '</li>';
  };
  // 목표/관심 칩(행 1줄 오른쪽). 점선은 '자료 없음' 전용이라 쓰지 않는다 — 실선 muted .pl-tag. 두 해 목표면 이른 연도만 칩에, 두 해는 title 에.
  plans.kindChipHtml = function (kind, years) {
    if (kind === 'GOAL') {
      const ys = (Array.isArray(years) ? years : []).filter(Number).sort(function (a, b) { return a - b; });
      const title = ys.length > 1 ? ' title="' + esc('목표 연도 ' + ys.join('·') + '(가장 이른 해를 표시)') + '"' : '';
      return '<span class="pl-tag" data-kind="GOAL"' + title + '>' + (ys.length ? mono(ys[0]) + ' ' : '') + '목표</span>';
    }
    return kind === 'WATCH' ? '<span class="pl-tag" data-kind="WATCH">관심</span>' : '';
  };
  // 2줄 행. 1줄 = 이름 + 목표/관심 칩, 2줄 .meta = 지역·종류 + 상태 칩(.pl-st 는 display:contents). r = baseRows 한 행,
  // o = { id, selected, loaded(현황을 받았는가), pending(받는 중 — 칩 자리 유지), pinned(직접 연 기관), req, closed, isNew }. option 안에는 버튼을 두지 않는다.
  plans.rowHtml = function (r, o) {
    o = o || {};
    const d = D();
    const where = [d.regionName(r.region), d.kindOfRec(r.rec)].filter(Boolean).join(' · ') + (o.pinned ? ' · 직접 연 기관' : '');
    const chips = o.loaded ? plans.stateChipsHtml(r.st, o.req, o.closed, o.isNew) : (o.pending ? '<span class="pl-wait" aria-hidden="true"></span>' : '');
    return '<li role="option" id="' + esc(o.id || '') + '" class="db-row" data-key="' + esc(r.key) + '" aria-selected="' + (o.selected ? 'true' : 'false') + '"' + (o.pinned ? ' data-pin="1"' : '') + '>' +
      '<span class="nm">' + esc(r.name) + '</span>' + plans.kindChipHtml(r.kind, r.years) +
      '<span class="meta"><span class="pl-reg">' + esc(where) + '</span>' + (chips ? '<span class="pl-st">' + chips + '</span>' : '') + '</span></li>';
  };

  // ── 서버 현황 캐시(이 화면과 현황판·지도 상세의 '사업계획' 절이 같이 쓴다) ──
  function freshStatus() { return { state: 'idle', map: {}, today: '', code: 0, at: 0, staleMonths: 0 }; }
  let ST = freshStatus();
  let statusSeq = 0, statusPending = null, statusInflight = false;
  function serverOk() { try { return !!(root.store && root.store.isServerMode()) && !!((root.store.loadSession() || {}).emp); } catch (e) { return false; } }
  function whoNow() { try { return String((root.store.loadSession() || {}).emp || ''); } catch (e) { return ''; } }
  // 시험·재시도용: 서버 응답(JSON)을 직접 넣는다.
  plans.applyStatus = function (data) {
    statusSeq += 1; statusInflight = false;
    ST = { state: 'ok', map: plans.statusMap(data), today: str(data && data.today), code: 0, at: Date.now(), staleMonths: Number(data && data.stale_months) || 0 };
  };
  plans.setStatusState = function (state, code) { statusSeq += 1; statusInflight = false; ST = Object.assign(freshStatus(), { state: state, code: code || 0 }); };
  plans.resetStatus = function () { statusSeq += 1; statusPending = null; statusInflight = false; ST = freshStatus(); plans.resetCollect(); plans.resetTargets(); };
  plans.statusState = function () { return ST.state; };

  // ── 사업계획 수집 요청 현황 캐시(GET /plan-collect/status: 열린 요청만 + can_request) ──
  // 기존 현황(ST)과 같은 수명·같은 시점에 받는다(ensureStatus 가 함께 부른다). 실패해도 사업계획 화면은 그대로 쓴다(요청 줄·칩만 없음).
  function freshCollect() { return { state: 'idle', can: false, map: {}, closed: {}, applied: {}, code: 0, at: 0 }; }
  // 기관 ID 키 객체는 자기 키만 읽고 쓴다('constructor'·'toString' 이 상속값을 돌려주거나 '__proto__' 가 프로토타입을 바꾸지 않게)
  function ownGet(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null; }
  function ownPut(o, k, v) { Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true }); }
  let CS = freshCollect();
  let collectSeq = 0, collectPending = null, collectInflight = false;
  plans.collectMap = function (data) {
    const m = {};
    ((data && data.items) || []).forEach(function (r) { if (r && r.institution_id) ownPut(m, r.institution_id, r); });
    return m;
  };
  // last_closed: 열린 요청이 없는 기관의 최근 실패·제외(30일 안). 기관 ID → { status_cd, closed_at, close_reason }
  plans.closedMap = function (data) {
    const m = {};
    ((data && data.last_closed) || []).forEach(function (r) {
      if (r && r.institution_id && (r.status_cd === 'FAILED' || r.status_cd === 'EXCLUDED')) ownPut(m, r.institution_id, r);
    });
    return m;
  };
  // recent_applied: 최근 7일 안에 반영(APPLIED)된 요청, 기관당 1건. 기관 ID → { institution_id, closed_at }. 키가 없거나 배열이 아닌 옛 응답은 빈 값('new' 칩 없음).
  plans.appliedMap = function (data) {
    const m = {};
    const a = data && data.recent_applied;
    (Array.isArray(a) ? a : []).forEach(function (r) { if (r && r.institution_id) ownPut(m, r.institution_id, r); });
    return m;
  };
  // 시험·재시도용: 서버 응답(JSON)을 직접 넣는다.
  plans.applyCollect = function (data) {
    collectSeq += 1; collectInflight = false;
    CS = { state: 'ok', can: !!(data && data.can_request), map: plans.collectMap(data), closed: plans.closedMap(data), applied: plans.appliedMap(data), code: 0, at: Date.now() };
  };
  plans.setCollectState = function (state, code) { collectSeq += 1; collectInflight = false; CS = Object.assign(freshCollect(), { state: state, code: code || 0 }); };
  plans.resetCollect = function () { collectSeq += 1; collectPending = null; collectInflight = false; CS = freshCollect(); };
  plans.collectState = function () { return CS.state; };
  function appliedOf(id) { return CS.state === 'ok' ? ownGet(CS.applied, id) : null; }   // new 칩. 요청 현황이 없거나 옛 응답이면 늘 null
  function collectOf(id) { return CS.state === 'ok' ? { req: ownGet(CS.map, id), closed: ownGet(CS.closed, id), applied: appliedOf(id), can: CS.can } : null; }
  plans.collectOf = collectOf;   // 시험용
  function reqSummaryHtml(req) { return ' <span class="db-why">· ' + mono(Number(req.requester_count) || 0) + '명 요청</span>'; }   // 칩은 stateChipsHtml 이 그린다. 사람 수만(규격 6-4)
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
      if (r.status === 'ok') CS = { state: 'ok', can: !!(r.data && r.data.can_request), map: plans.collectMap(r.data), closed: plans.closedMap(r.data), applied: plans.appliedMap(r.data), code: 0, at: Date.now() };
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
      if (r.status === 'ok') ST = { state: 'ok', map: plans.statusMap(r.data), today: str(r.data && r.data.today), code: 0, at: Date.now(), staleMonths: Number(r.data && r.data.stale_months) || 0 };
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
      return h3 + '<dl class="db-dl"><dt>자료</dt><dd>' + plans.stateChipsHtml(null, rq && rq.req, null, null) + (rq && rq.req ? reqSummaryHtml(rq.req) : '') + '</dd></dl>' +
        (lead ? '<p class="pl-open"><button type="button" class="link-btn" data-pl-open="' + esc(id) + '" aria-describedby="' + esc(nameId || 'db-name') + '">' + lead + '</button>' +
          ' <span class="pl-msg db-why" role="status"></span></p>' : '');
    }
    const n = Number(st.item_count) || 0;
    // 이 절이 보이는 사용자는 메뉴도 열 수 있다(위에서 menuVisible 로 걸렀다).
    const open = '<p class="pl-open"><button type="button" class="link-btn" data-pl-open="' + esc(id) + '" aria-describedby="' + esc(nameId || 'db-name') + '">사업계획 ' + mono(n) + '건 보기</button>' +
      ' <span class="pl-msg db-why" role="status"></span></p>';
    return h3 + '<dl class="db-dl"><dt>자료</dt><dd>' + plans.stateChipsHtml(st, rq && rq.req, null, rq && rq.applied) + (rq && rq.req ? reqSummaryHtml(rq.req) : '') + '</dd>' +
      (ymd(st.oldest_checked_on) ? '<dt>확인일</dt><dd>' + mono(ymd(st.oldest_checked_on)) + ' <span class="db-why">가장 오래된 문서 기준</span></dd>' : '') + '</dl>' + open;
  };
  // 기관 사업계획 화면을 이 사용자가 열 수 있는가 = 사이드바에 그 항목이 그려져 있는가(nav.build 가 이미 역할·서버 메뉴 키로 걸러 그린다).
  // 이 판정은 사이드바 DOM(data-nav)으로 본다. 사이드바가 아직 없으면(시험·로그인 전) 열 수 있다고 본다.
  // plans.menuCheck 에 함수를 넣으면 그 결과를 쓴다(시험용).
  plans.menuCheck = null;
  plans.menuVisible = function () {
    if (typeof plans.menuCheck === 'function') return !!plans.menuCheck();
    if (typeof document === 'undefined') return true;
    const btns = document.querySelectorAll('#side-nav [data-nav]');
    if (!btns.length) return true;
    return Array.prototype.some.call(btns, function (b) { return b.getAttribute('data-nav') === plans.SOON_ID; });
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
  let S = null, host = null, ac = null, qTimer = 0, DLG = null;   // DLG = 열린 일괄 요청 창(계정이 바뀌어 S 가 null 이 돼도 unmount 가 닫을 수 있게 따로 쥔다)
  function freshState(who) {
    return { who: who || '', stat: 'all', q: '', region: '', kw: '', top: null, selRow: null, pin: null, cache: {},
      pendingId: '', revealKey: '', focusTitle: false, err: '', dlBusy: false, reqBusy: null, dlg: null, batchBusy: false };
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

  // ── 목표·관심 캐시(GET /bid-targets 올해·내년) ──
  function freshTargets() { return { state: 'idle', map: null, hasWatch: false, code: 0, at: 0 }; }
  let TG = freshTargets(), tgSeq = 0, tgInflight = false, tgPending = null;
  plans.resetTargets = function () { tgSeq += 1; tgInflight = false; tgPending = null; TG = freshTargets(); dirty(); };
  plans.applyTargets = function (resps) {   // 시험·재시도용
    tgSeq += 1; tgInflight = false;
    const m = plans.mergeTargets(resps);
    TG = { state: 'ok', map: m, hasWatch: m.hasWatch, code: 0, at: Date.now() };
    dirty();
  };
  plans.targetState = function () { return TG.state; };
  function watchOn() { return !(TG.state === 'ok' && !TG.hasWatch); }   // 관심 기능 없는 서버면 '목표'만
  function tgWait() { return TG.state === 'idle' || TG.state === 'loading'; }   // 목표·관심 목록을 받는 중(P3-4)
  function ensureTargets(force) {
    if (!serverOk()) { TG = Object.assign(freshTargets(), { state: 'offline' }); dirty(); return Promise.resolve(TG); }
    if (TG.state === 'denied') return Promise.resolve(TG);   // 권한 없음(401·403)은 조용히 — 정렬 토글만 aria-disabled
    if (!force) {
      if (tgInflight && tgPending) return tgPending;
      if (TG.state === 'ok' && Date.now() - TG.at < STATUS_FRESH_MS) return Promise.resolve(TG);
    }
    const my = ++tgSeq, y = todayDate().getFullYear();
    tgInflight = true;
    if (TG.state !== 'ok') TG = Object.assign(freshTargets(), { state: 'loading' });
    dirty();
    const p = Promise.all([fetchJson('/bid-targets?year=' + y), fetchJson('/bid-targets?year=' + (y + 1))]).then(function (rs) {
      if (my !== tgSeq) return TG;
      tgInflight = false;
      const bad = rs.filter(function (r) { return r.status !== 'ok'; })[0];
      if (!bad) {
        const m = plans.mergeTargets([{ year: y, data: rs[0].data }, { year: y + 1, data: rs[1].data }]);
        TG = { state: 'ok', map: m, hasWatch: m.hasWatch, code: 0, at: Date.now() };
      } else TG = Object.assign(freshTargets(), { state: bad.status, code: bad.code || 0 });
      dirty();
      if (host && S) { renderBanner(); renderList(); renderFoot(); }
      return TG;
    });
    tgPending = p;
    return p;
  }
  // ── 행 모델 캐시: 데이터·현황·목표가 바뀔 때만 다시 만든다(검색 입력마다 정렬하지 않게) ──
  let RAW = null, ORD = null, ordTop = null;
  function dirty() { RAW = null; ORD = null; }
  function rawRows() {
    if (!RAW) {
      RAW = plans.baseRows(dataList(), TG.state === 'ok' ? TG.map : null, ready() ? ST.map : null);
      RAW.marks = RAW.filter(function (r) { return !!r.kind; }).length;
    }
    return RAW;
  }
  function markCount() { return rawRows().marks; }
  function topOn() { return TG.state === 'ok' && (S.top === null ? markCount() > 0 : !!S.top); }   // Q1: 처음엔 눌린 채(0곳이면 꺼짐). 사용자가 누른 값이 우선
  function orderedRows() {
    const t = topOn();
    if (!ORD || ordTop !== t) { ORD = plans.orderRows(rawRows(), t, todayDate().getFullYear()); ordTop = t; }
    return ORD;
  }
  function reqOfId(id) { return CS.state === 'ok' ? ownGet(CS.map, id) : null; }
  function closedOfId(id) { return CS.state === 'ok' ? ownGet(CS.closed, id) : null; }
  function nameOfId(id) { const r = rawRows().filter(function (x) { return x.id === id; })[0]; return r ? r.name : id; }

  const SKELETON =
    '<div class="tm-head"><b>기관 사업계획</b> <span class="dg-hint">— 목표로 하는 기관과 관심 있는 기관부터, 기관 홈페이지에서 공개된 사업계획을 봅니다</span></div>' +
    '<div id="pl-flash" class="db-flash" role="status"></div>' +
    '<div id="pl-err" class="db-state db-banner" role="alert" style="display:none"></div>' +
    '<div class="pl-work">' +
    '<section class="db-list" aria-labelledby="pl-lt"><div class="db-list-head"><div class="db-h"><h2 id="pl-lt">기관 목록</h2><span id="pl-sorthost"></span></div>' +
    '<div class="pl-pers"><fieldset class="db-per" id="pl-stat"></fieldset></div>' +
    '<div class="db-filters"><input id="pl-q" type="search" placeholder="기관명 검색" aria-label="기관명 검색" autocomplete="off">' +
    '<select id="pl-region" aria-label="지역"></select></div></div>' +
    '<div class="db-scroll" id="pl-scroll" aria-busy="true"><div class="db-grp" id="pl-g" aria-live="polite"></div><div id="pl-body"></div></div><div class="db-foot" id="pl-foot"></div></section>' +
    '<section class="db-pane" id="pl-pane" aria-label="기관 사업계획 상세"></section></div>';

  function visibleRows() {
    const base = plans.filterRows(orderedRows(), { q: S.q, region: S.region });
    let rows = ready() ? plans.filterByStatus(base, S.stat) : base;
    const shown = rows.length;
    if (S.pin) {   // 직접 연 기관은 필터에 걸러졌어도 맨 위에 붙인다
      const hit = rows.filter(function (r) { return r.key === S.pin; })[0] || rawRows().filter(function (r) { return r.key === S.pin; })[0];
      if (hit) rows = [Object.assign({}, hit, { pinned: true })].concat(rows.filter(function (r) { return r.key !== S.pin; }));
    }
    return { rows: rows, base: base, shown: shown };
  }
  function renderSort() {
    const el = $('pl-sorthost');
    if (!el) return;
    const st = TG.state, ok = st === 'ok';
    const why = ok ? '' : (st === 'idle' || st === 'loading' ? '목표·관심 기관을 불러오는 중입니다.' : '목표·관심 기관을 받지 못해 쓸 수 없습니다.');
    const keep = !!(document.activeElement && document.activeElement.id === 'pl-sort');
    el.innerHTML = plans.sortBtnHtml({ on: topOn(), ok: ok, why: why, hasWatch: watchOn() });
    if (keep) { const b = $('pl-sort'); if (b && b.focus) b.focus({ preventScroll: true }); }
  }
  function renderList() {
    const el = $('pl-body'), grp = $('pl-g'), sc = $('pl-scroll');
    if (!el || !grp || !S) return;
    const ok = ready(), top = topOn();
    const vr = visibleRows();
    const rest = vr.rows.filter(function (r) { return !r.pinned; });
    const tops = top ? rest.filter(function (r) { return !!r.kind; }) : [];
    const markRows = vr.rows.filter(function (r) { return !!r.kind; });   // 요약줄·묶음 머리가 같은 기준(직접 연 기관 포함, 상태 필터 뒤)으로 센다(design P3-2)
    const markGoal = markRows.filter(function (r) { return r.kind === 'GOAL'; }).length;
    grp.innerHTML = plans.groupLabelHtml({ ready: ok, loading: ST.state === 'loading', stat: S.stat, total: vr.base.length, shown: vr.shown,
      has: vr.base.filter(function (r) { return !!r.st; }).length, top: top, marks: markRows.length, hasWatch: watchOn() });   // aria-live 영역은 고정하고 안쪽만 바꾼다
    let n = 0;
    const rowAt = function (r) {
      const cc = collectOf(r.id) || {};   // 수집 요청 현황이 아직 없거나 재무부서(403)면 st 칩만
      const csWait = ok && CS.state === 'loading';   // 수집 현황을 받는 중이면 '자료 없음'을 먼저 그렸다 바꾸지 않게 빈 자리(qa 11-19 P2-1)
      return plans.rowHtml(r, { id: 'pl-o-' + (n++), selected: !!(S.selRow && S.selRow.key === r.key), loaded: ok && !csWait, pending: ST.state === 'loading' || csWait, pinned: !!r.pinned,
        req: cc.req || null, closed: cc.can ? (cc.closed || null) : null, isNew: cc.applied || null });   // 실패·제외는 요청 가능한 사람만(상세와 같은 가드, qa P3-1)
    };
    let h = '';
    if (vr.rows.length) {
      let inner = '';
      const pin = vr.rows.filter(function (r) { return r.pinned; });
      if (pin.length) inner += '<ul class="pl-pinned" role="group" aria-label="직접 연 기관">' + pin.map(rowAt).join('') + '</ul>';   // 다음 묶음 첫 행 위에 점선 경계(사용자 11-16)
      if (top) {
        inner += '<ul role="group" aria-labelledby="pl-gh-top">' + plans.groupHeadHtml('top', { id: 'pl-gh-top', goal: markGoal, watch: markRows.length - markGoal, total: markRows.length, marks: markCount(), hasWatch: watchOn() }) + tops.map(rowAt).join('') + '</ul>';
        const others = rest.filter(function (r) { return !r.kind; });
        if (others.length) inner += '<ul role="group" aria-labelledby="pl-gh-rest">' + plans.groupHeadHtml('rest', { id: 'pl-gh-rest', total: others.length }) + others.map(rowAt).join('') + '</ul>';
      } else if (rest.length) inner += '<ul class="pl-flat" role="presentation">' + rest.map(rowAt).join('') + '</ul>';   // 정렬을 끄면 묶음이 없다 — listbox 자체가 #pl-g 로 이름 붙어 있다
      h += '<div role="listbox" id="pl-lb" tabindex="0" aria-labelledby="pl-g">' + inner + '</div>';
    } else if (ok && S.stat !== 'all' && vr.base.length) {
      h += '<p class="db-state">' + (S.stat === 'none' ? '자료 없는 기관이 없습니다.' : '사업계획 자료가 있는 기관이 아직 없습니다. 위에서 [모두]를 고르세요.') + '</p>';
    } else if (S.q.trim() || S.region) {
      h += '<p class="db-state">조건에 맞는 기관이 없습니다. 검색어를 지우거나 지역을 \'전체 지역\'으로 바꾸세요.<br><button type="button" id="pl-clear">조건 지우기</button></p>';
    } else {
      h += '<p class="db-state">표시할 기관이 없습니다.</p>';
    }
    const ae = document.activeElement, keepFocus = !!(ae && ae.id === 'pl-lb'), keepTop = sc ? sc.scrollTop : 0;   // 목록을 다시 그려도 키보드 위치·스크롤을 지킨다
    el.innerHTML = h;
    if (sc) { sc.setAttribute('aria-busy', ST.state === 'loading' ? 'true' : 'false'); sc.scrollTop = keepTop; }
    syncActive();
    if (keepFocus) { const lb = $('pl-lb'); if (lb && lb.focus) lb.focus({ preventScroll: true }); }
    renderSort();
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
    if (!el || !S) return;
    let h = '';
    if (ready()) {
      const vr = visibleRows(), base = vr.base;
      let bat = '';
      if (CS.state === 'ok' && CS.can) {   // 요청 가능한 사람만. 재무부서(403)·현황 없음·디자이너는 줄 없음('확인용입니다.' 유지)
        bat = plans.batHtml(plans.batchPlan(vr.rows, topOn(), reqOfId, closedOfId), { top: topOn(), hasWatch: watchOn(), busy: !!(S.dlg || S.batchBusy), wait: tgWait() });
      }
      const csv = plans.footHtml(plans.missingIds(base).length, base.filter(function (r) { return !r.st; }).length, S.dlBusy, CS.can, bat);
      if (csv) h += '<p class="pl-fn">' + csv + '</p>';
    }
    const a = document.activeElement;   // 바닥을 새로 그리면 눌렀던 pl-dl 이 사라져 포커스가 body 로 떨어진다 — 같은 id 로 돌려준다
    const keep = !!(a && a.id === 'pl-dl') || !!(S.dlFocus && (!a || a === document.body));
    const keepBat = !!(a && (a.id === 'pl-bat' || a.id === 'pl-bat-none'));
    el.innerHTML = h;
    if (keep) {
      const b = $('pl-dl');
      if (b && !b.disabled && b.focus) { b.focus({ preventScroll: true }); S.dlFocus = false; }   // 내려받는 중(disabled)이면 끝난 뒤 그릴 때 돌려준다
      else if (!b) S.dlFocus = false;
    }
    if (keepBat) { const b = $('pl-bat') || $('pl-bat-none'); if (b && !b.disabled && b.focus) b.focus({ preventScroll: true }); }
  }
  const OFFLINE_MSG = '서버에 연결되면 사업계획 현황이 보입니다.';
  function renderBanner() {
    const el = $('pl-err');
    if (!el) return;
    let h = '';
    if (S.err) h = esc(S.err);
    else if (ST.state === 'denied') h = '사업계획 현황을 볼 권한이 없습니다(' + esc(ST.code || 403) + '). 로그인 사번과 권한을 확인하세요.';
    else if (ST.state === 'error') h = '사업계획 현황을 불러오지 못했습니다(' + esc(ST.code || '연결 실패') + '). <button type="button" id="pl-retry">다시 불러오기</button>';
    else if (TG.state === 'error') h = '목표·관심 기관 목록을 받지 못했습니다. <button type="button" id="pl-retry-tg">다시 받기</button>';
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
    const rec = row.rec || {};
    const view = !ID_RE.test(row.id) ? { status: 'noid' } : (S.cache[row.id] || { status: 'loading' });
    const sub = [D().kindOfRec(rec), D().regionName(rec.region)].filter(Boolean).join(' · ');
    el.innerHTML = '<div class="db-pane-body">' + plans.detailHtml(view, { name: row.name, sub: sub, kw: S.kw, req: collectReq(row.id), staleMonths: ST.staleMonths }) + '</div>';
    if (S.focusTitle && view.status !== 'loading') { S.focusTitle = false; const h = $('pl-name'); if (h && h.focus) h.focus(); }
  }
  function renderDocs() {
    const el = $('pl-docs'), v = S.selRow ? S.cache[S.selRow.id] : null;
    if (el && v && v.status === 'ok') el.innerHTML = plans.docsHtml(v.data, S.kw, ST.staleMonths);
  }
  function onStatus() {
    if (!host || !S) return;
    dirty();   // 서버 현황이 바뀌었다 — 행 모델·정렬을 다시 만든다
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
    if (S.pin && S.pin !== key) S.pin = null;
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
    const row = rawRows().filter(function (r) { return r.id === id; })[0];
    if (!row) return;
    S.q = ''; S.region = ''; S.stat = 'all'; S.kw = '';
    S.selRow = row; S.pin = row.key;   // 직접 연 기관은 맨 위에 붙여 보인다(목록 어디에 있든)
    S.focusTitle = true;
  }

  function downloadMissing() {
    if (!host || !ready() || S.dlBusy) return;
    const ids = plans.missingIds(visibleRows().base);
    if (!ids.length) return;
    { const fa = document.activeElement; S.dlFocus = !!(fa && fa.id === 'pl-dl'); }   // 누른 단추에 포커스가 있었으면(키보드·마우스 모두) 끝난 뒤 돌려준다
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
      .then(function () { if (!S) return; S.dlBusy = false; renderBanner(); renderFoot(); S.dlFocus = false; });
  }

  // ── 수집 요청(기관 사업계획 상세의 .pl-req 줄) ──
  function collectReq(id) {
    if (CS.state !== 'ok') return null;
    return { item: ownGet(CS.map, id), closed: ownGet(CS.closed, id), applied: appliedOf(id), can: CS.can, busy: S && S.reqBusy && S.reqBusy.id === id ? S.reqBusy.kind : '' };
  }
  function onCollect() {   // 수집 요청 현황이 도착·갱신됐을 때: 칩과 요청 줄을 다시 그린다(검색 칸에 입력 중이면 상세는 건드리지 않는다)
    if (!host || !S) return;
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
      ownPut(CS.map, id, { institution_id: id, status_cd: st, requester_count: Number(res.requester_count) || 0, requested_by_me: !!res.requested_by_me,
        first_requested_at: res.first_requested_at || null, run_at: res.run_at || null });
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
      renderList(); renderFoot();   // 단건 요청도 바닥의 일괄 대상 수가 바뀐다
      if (state.selRow && state.selRow.id === id) {
        renderPane();
        const b = $(next) || $('pl-req-go') || $('pl-req-cancel') || $('pl-name');   // 눌렀던 버튼이 바뀌어도 포커스를 잃지 않는다
        if (b && b.focus) b.focus();
      }
      refreshSlots();
      if (r.ok && root.plancollect && root.plancollect.refreshBadge) root.plancollect.refreshBadge(true);   // 개발부서가 직접 요청했으면 메뉴 배지도
    });
  }

  // ── 일괄 수집 요청(바닥 [#pl-bat] → 확인 창 → POST /plan-collect/batch 한 번) ──
  plans.POST_TIMEOUT_MS = 20000;   // 응답이 이보다 늦으면 기다리지 않는다(P2-3). 서버는 이미 처리했을 수 있다
  function postJson(url, body) {
    if (typeof fetch !== 'function') return Promise.resolve({ ok: false, status: 0 });
    return new Promise(function (resolve) {   // 먼저 도착한 한 번만 이긴다
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(function () { if (ctl) ctl.abort(); resolve({ ok: false, status: 0, timeout: true }); }, plans.POST_TIMEOUT_MS);
      const done = function (v) { clearTimeout(timer); resolve(v); };
      const opt = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
      if (ctl) opt.signal = ctl.signal;
      fetch(url, opt).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          done({ ok: r.ok, status: r.status, data: j, code: r.ok ? '' : (j && j.detail && typeof j.detail === 'object' ? str(j.detail.code) : '') });
        });
      }).catch(function () { done({ ok: false, status: 0 }); });
    });
  }
  plans.postJson = postJson;   // 시험용
  // ── 확인 창: 열기·닫기·Esc·바깥 클릭·포커스·뒤 화면 inert 는 공통 dlg(js/dlg.js)가 맡는다 ──
  function dq(id) { return DLG && DLG.overlay ? DLG.overlay.querySelector('#' + id) : null; }
  function focusAfterDlg() {   // 창이 닫힌 뒤 포커스: 바닥 버튼 → 없음 안내 → 목록 → 검색칸(막힌 버튼은 건너뛴다)
    const ids = ['pl-bat', 'pl-bat-none', 'pl-lb', 'pl-q'];
    for (let i = 0; i < ids.length; i += 1) {
      const b = $(ids[i]);
      if (b && !b.disabled && b.focus) { b.focus({ preventScroll: true }); return; }
    }
  }
  function openBatchDialog() {
    if (!host || !S || S.dlg || S.batchBusy || !root.dlg || !ready() || CS.state !== 'ok' || !CS.can || tgWait()) return;
    const p = plans.batchPlan(visibleRows().rows, topOn(), reqOfId, closedOfId);
    if (!p.ids.length) return;
    const w = document.createElement('div');
    w.innerHTML = plans.batchDialogHtml(p);
    const ov = w.firstChild;
    const d = { plan: p, busy: false, err: '', overlay: ov, gone: false, detach: false };
    S.dlg = d; DLG = d;
    ov.addEventListener('click', onDlgClick);
    document.body.appendChild(ov);   // 덮개는 body 직계여야 dlg 가 나머지 화면 전체를 inert 로 막는다
    root.dlg.open(ov, { onClose: function () { dlgClosed(d); } });   // 열면 제목에 포커스
    renderFoot();   // 바닥 버튼은 창이 열린 동안 disabled
  }
  function dlgClosed(d) {   // dlg.close 가 부른다 — [취소]·Esc·바깥 클릭·성공·화면 닫힘 모두 여기로 온다
    d.gone = true;
    if (d.overlay.parentNode) d.overlay.parentNode.removeChild(d.overlay);
    if (DLG === d) DLG = null;
    if (S && S.dlg === d) S.dlg = null;
    if (d.detach || !host || !S) return;   // 화면을 닫는 중이면 그리지 않는다
    renderFoot();
    focusAfterDlg();
  }
  function onDlgClick(e) {
    const b = e.target && e.target.closest ? e.target.closest('button') : null;
    const d = S && S.dlg;
    if (!b || !d || d.gone) return;
    if (b.id === 'pl-dlg-cancel') root.dlg.requestClose(d.overlay);   // 보내는 중에도 닫는다 — Esc·바깥 클릭과 같은 동작(DESIGN 팝업), 결과는 띠로(design P2-3)
    else if (b.id === 'pl-dlg-ok') submitBatch();
  }
  function paintDlg() {
    const d = DLG;
    if (!d || d.gone) return;
    const ok = dq('pl-dlg-ok'), cancel = dq('pl-dlg-cancel'), err = dq('pl-dlg-err'), box = d.overlay.querySelector('.dlg'), t = dq('pl-dlg-t');
    if (ok) { ok.disabled = d.busy; ok.textContent = d.busy ? '요청 중…' : d.plan.ids.length + '곳 요청'; }
    const hint = dq('pl-dlg-busy');
    if (hint) hint.hidden = !d.busy;   // 보내는 중에만: 닫아도 요청은 계속된다는 안내
    if (err) err.textContent = d.err;   // 서버 글이 아니라 batchErrorText 고정 문구 — textContent
    if (box) box.setAttribute('aria-busy', d.busy ? 'true' : 'false');
    if (d.busy) { if (t && t.focus) t.focus(); }
    else if (d.err && cancel && cancel.focus) cancel.focus();
  }
  function applyBatchResults(res) {   // 응답으로 요청 현황 캐시를 바로 맞춘다(바닥 일괄 대상 수가 곧바로 줄어든다). 뒤에서 한 번 더 받아 맞춘다
    (Array.isArray(res.results) ? res.results : []).forEach(function (r) {
      const id = str(r && r.institution_id), c = str(r && r.result_cd);
      if (!id || (c !== 'requested' && c !== 'joined' && c !== 'already')) return;
      delete CS.closed[id];
      ownPut(CS.map, id, { institution_id: id, status_cd: str(r.status_cd) || 'REQUESTED', requester_count: Number(r.requester_count) || 0, requested_by_me: true,
        first_requested_at: null, run_at: null });
    });
  }
  function submitBatch() {
    const state = S, d = state && state.dlg;
    if (!d || d.busy || d.gone) return;
    d.busy = true; d.err = ''; state.batchBusy = true; paintDlg(); renderFoot();
    postJson('/plan-collect/batch', { institution_ids: d.plan.ids }).then(function (r) {
      state.batchBusy = false; d.busy = false;
      if (state !== S || !host) return;   // 계정이 바뀌었거나 화면을 닫았다
      if (!r.ok) {
        const msg = plans.batchErrorText(r.status, r.code, r.timeout);
        if (d.gone) { S.err = msg; setFlash(''); renderBanner(); }   // 보내는 중에 창을 닫았다 — 결과를 버리지 않고 띠로 알린다
        else { d.err = msg; paintDlg(); }
        renderFoot();
        if (r.timeout) ensureCollect(true);   // 서버는 이미 처리했을 수 있다 — 요청 현황을 다시 받는다
        return;
      }
      const res = r.data || {};
      const rr = plans.batchResult(res, nameOfId);
      if (CS.state === 'ok') applyBatchResults(res);
      if (!d.gone && root.dlg) root.dlg.close(d.overlay);   // dlgClosed 가 덮개를 치우고 바닥을 다시 그려 포커스를 돌려준다
      if (rr.fail) { S.err = rr.text; setFlash(''); } else { S.err = ''; setFlash(rr.text); }
      renderBanner(); renderList(); renderFoot();
      ensureCollect(true);
      if (root.plancollect && root.plancollect.refreshBadge) root.plancollect.refreshBadge(true);
    });
  }
  function fillControls() {
    const st = $('pl-stat'), rg = $('pl-region'), q = $('pl-q');
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
      case 'pl-retry': ensureStatus(true).then(function () { const l = $('pl-lb'); if (l) l.focus(); }); onStatus(); break;
      case 'pl-retry-tg': ensureTargets(true); renderBanner(); renderSort(); { const sb = $('pl-sort'); if (sb && sb.focus) sb.focus({ preventScroll: true }); } break;   // 눌린 버튼이 사라지므로 포커스를 정렬 토글로(P3-3)
      case 'pl-sort':
        if (btn.getAttribute('aria-disabled') === 'true') break;   // 목표·관심을 못 받았으면 눌러도 아무 일 없음(title 이 이유)
        S.top = !topOn(); S.pin = null; S.revealKey = '';
        { const sc = $('pl-scroll'); if (sc) sc.scrollTop = 0; }
        renderList(); renderFoot();
        break;
      case 'pl-bat':
        if (btn.getAttribute('aria-disabled') === 'true') break;   // 목표·관심 목록을 받는 중엔 눌러도 무시(P3-4)
        openBatchDialog();
        break;
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
    if (id === 'pl-q') {   // 수백 행을 한 번에 다시 그리므로 120ms 디바운스(행 모델·정렬은 캐시)
      S.q = e.target.value; S.pin = null; S.revealKey = '';
      clearTimeout(qTimer);
      qTimer = setTimeout(function () { qTimer = 0; if (host && S) { renderList(); renderFoot(); } }, 120);
    }
    else if (id === 'pl-kw') { S.kw = e.target.value; renderDocs(); }
  }
  function onChange(e) {
    const t = e.target;
    if (!t) return;
    if (t.id === 'pl-region' || t.name === 'pl-stat') S.revealKey = '';   // 사용자가 목록 조건을 바꾸면 늦은 스크롤 예약을 버린다
    if (t.id === 'pl-region') { S.region = t.value; S.pin = null; renderList(); renderFoot(); }
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
    S.cache = {}; S.err = ''; S.reqBusy = null; S.dlg = null;
    ac = typeof AbortController === 'function' ? new AbortController() : null;
    const opt = ac ? { signal: ac.signal } : undefined;
    host.innerHTML = SKELETON;
    host.addEventListener('click', onClick, opt);
    host.addEventListener('keydown', onKey, opt);
    host.addEventListener('input', onInput, opt);
    host.addEventListener('change', onChange, opt);
    dirty();
    ensureTargets(true);   // 목표·관심(올해·내년). 못 받아도 목록은 기본 정렬로 그린다
    const hadPending = !!S.pendingId;   // 현황판·지도에서 기관을 골라 들어왔는가
    applyPending();
    fillControls();   // applyPending 이 검색어·지역을 비우므로 칸 값은 그 뒤에 채운다(안 그러면 칸에 옛 글이 남는다)
    if (S.selRow) loadDetail(S.selRow.id);
    renderBanner(); renderList(); renderFoot(); renderPane();
    if (hadPending && S.selRow) { revealRow(S.selRow.key); S.revealKey = S.selRow.key; }   // '전체' 창처럼 목록이 길 때 선택 행이 스크롤 밖에 남지 않게(현황 도착 뒤 onStatus 가 한 번 더)
    ensureStatus(true);
    if (ST.state === 'loading') renderList();   // 현황을 받는 동안 3행 자리를 미리 잡는다(도착할 때 행이 커지며 스크롤이 튀지 않게)
  };
  plans.unmount = function () {
    if (DLG) {   // 열린 확인 창은 화면과 함께 닫는다(뒤 화면 inert·포커스는 dlg 가 되돌린다)
      const d = DLG;
      d.detach = true; d.gone = true; DLG = null;
      if (S && S.dlg === d) S.dlg = null;
      if (root.dlg) root.dlg.close(d.overlay); else if (d.overlay.parentNode) d.overlay.parentNode.removeChild(d.overlay);
    }
    if (ac) ac.abort();
    ac = null;
    if (host) host.innerHTML = '';
    host = null;
    clearTimeout(qTimer); qTimer = 0;
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
