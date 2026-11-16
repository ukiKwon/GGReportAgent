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
  const CHECK = { CONFIRMED: '확인됨', PARTIAL: '부분확인', UNCONFIRMED: '확인안됨', NOT_CHECKED: '미조사' };
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
  // 보충 C: 금액 / 금액·계산값 / 확인안됨 / 원문에 없음 / 해당없음. 원문의 '-'·빈칸을 0으로 바꾸지 않는다.
  // headUnit = 문서 안 금액 단위가 하나일 때 그 코드(열 머리 '예산(백만원)'에 쓰고 칸에서는 단위를 뺀다).
  // 계산값(item.calculated)은 서버가 낸 것(AMOUNT)일 때만 쓴다. 계산값이 확인안됨이면 상위사업 자신의 상태를 그대로 보인다.
  plans.budgetCell = function (it, headUnit) {
    const b = it.budget || {}, c = it.calculated;
    let state = b.state_cd, amount = b.amount, unit = b.unit_cd, calc = false;
    if (c && c.is_calculated && c.state_cd === 'AMOUNT' && plans.fmtAmount(c.amount) !== null && UNIT[c.unit_cd]) {
      state = 'AMOUNT'; amount = c.amount; unit = c.unit_cd; calc = true;
    }
    if (state === 'AMOUNT') {
      const n = plans.fmtAmount(amount), u = UNIT[unit];
      if (n === null || !u) return { html: unk('확인안됨'), sr: '확인안됨' };
      const showU = !(headUnit && unit === headUnit);
      return {
        html: mono(n) + (showU ? ' <span class="u">' + esc(u) + '</span>' : '') + (calc ? '<span class="db-why">계산값</span>' : ''),
        sr: (calc ? '하위사업 합계 계산값 ' : '') + n + ' ' + u,
      };
    }
    if (state === 'NOT_IN_SOURCE') return { html: unk('원문에 없음'), sr: '원문에 없음' };
    if (state === 'NOT_APPLICABLE') return { html: '<span class="db-why">해당없음</span>', sr: '해당없음' };   // 사실이라 점선 칩을 쓰지 않는다
    return { html: unk('확인안됨'), sr: '확인안됨' };
  };
  function budgetTd(it, headUnit) {
    const c = plans.budgetCell(it, headUnit);
    return '<td class="pl-bud"><span aria-hidden="true">' + c.html + '</span><span class="sr-only">' + esc(c.sr) + '</span></td>';
  }
  // 쪽수는 화면에 보이지 않는다(사용자 결정 2026-11-16) — 쪽 열·'미확인' 칩 없음.
  // url_missing 이 참이면 src_url 이 있어도 링크를 내지 않는다(한 규칙: url_missing 우선 — docHtml 의 noUrl 안내와 같은 기준).
  function srcUrlOf(d) { return d.url_missing ? null : logic.safeHttpUrl(d.src_url); }
  // 보충 A: 출처 줄 순서 = 종류 · 제목 · 확인일. URL 있으면 링크 + '(인터넷 PC에서 열림)', 없으면 글자만 + '출처 URL 없음' 칩.
  plans.srcLineHtml = function (d) {
    const parts = [];
    const kind = str(d.src_kind_name || d.src_kind_cd).trim();
    if (kind) parts.push(esc(kind));
    const url = srcUrlOf(d);
    const title = str(d.title).trim();
    if (url) parts.push('<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(title || url) + '</a>');
    else if (title) parts.push(esc(title));
    if (ymd(d.checked_on)) parts.push('확인 ' + mono(ymd(d.checked_on)));
    return '<span class="pl-src">' + parts.join(' · ') + '</span>' + (url ? ' <span class="db-why">(인터넷 PC에서 열림)</span>' : ' ' + unk('출처 URL 없음'));
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
  // 보충 B·D: 폐기 = 실선 외곽 칩 + 글자 --muted(취소선·opacity 없음). 확인됨이 아니면 점선 칩(확인안됨 행은 muted로 낮추지 않는다).
  plans.itemRowHtml = function (it, headUnit) {
    const dropped = it.progress_cd === 'DROPPED';
    const tags = [];
    if (dropped) tags.push(badge('pp-cancel', '폐기'));
    // 부분확인·확인안됨만 칩을 단다. 미조사(NOT_CHECKED)·모르는 값은 칩 없음(사용자 결정 2026-11-16).
    if (it.check_cd === 'PARTIAL' || it.check_cd === 'UNCONFIRMED') tags.push(unk(CHECK[it.check_cd]));
    const prog = [];
    if (it.progress_cd && it.progress_cd !== 'DROPPED' && PROGRESS[it.progress_cd]) prog.push(esc(PROGRESS[it.progress_cd]));
    if (it.exec_rate != null && str(it.exec_rate) !== '') prog.push('이행률 ' + mono(str(it.exec_rate) + '%'));
    const nm = '<td class="pl-nm"><span class="pl-name">' + esc(it.name) + '</span>' + (tags.length ? ' ' + tags.join(' ') : '') +
      (str(it.content).trim() ? '<span class="pl-content">' + esc(it.content) + '</span>' : '') +
      (prog.length ? '<span class="db-why pl-prog">' + prog.join(' · ') + '</span>' : '') +
      (str(it.note).trim() ? '<span class="pl-content">' + esc(it.note) + '</span>' : '') + '</td>';
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
  plans.checkCountsHtml = function (cc) {
    const c = cc || {};
    const cols = [['확인됨', 'confirmed'], ['부분확인', 'partial'], ['확인안됨', 'unconfirmed']];
    if (!cols.some(function (p) { return Number(c[p[1]]) > 0; })) return '';   // 셋 다 0이면 줄 전체를 감춘다(미조사는 세지 않는다)
    return cols.map(function (p) {
      return esc(p[0]) + ' ' + mono(Number(c[p[1]]) || 0);
    }).join(' · ');
  };
  plans.docHtml = function (d, kw) {
    const items = Array.isArray(d.items) ? d.items : [];
    const cc = d.check_counts || {};
    const hid = 'pl-d' + esc(d.doc_id);
    const checks = plans.checkCountsHtml(cc);
    const notes = [];
    if (d.period_ended) notes.push('<p class="db-why">' + esc(d.period_to) + '년에 끝난 계획입니다. 누리집에 새 계획이 있는지 확인하세요.</p>');
    if (d.stale) notes.push('<p class="pl-warn">확인 ' + mono(ymd(d.checked_on)) + ' 뒤로 12개월 넘게 다시 확인하지 않았습니다.</p>');
    if (Number(cc.unconfirmed) > 0) notes.push('<p class="db-why">\'확인안됨\'은 원문에서 아직 대조하지 못한 사업입니다. 폐기된 사업이 아닙니다.</p>');
    return '<section class="pl-doc" aria-labelledby="' + hid + '"><div class="pl-doc-h"><h3 id="' + hid + '">' + esc(d.title) + '</h3>' +
      badge('pp-neutral', str(d.src_kind_name || d.src_kind_cd) || '기타') + (d.period_ended ? ' ' + badge('pp-cancel', '기간 지남') : '') + '</div>' +
      '<dl class="db-dl"><dt>출처</dt><dd>' + plans.srcLineHtml(d) + '</dd>' +
      '<dt>대상 기간</dt><dd>' + mono(plans.periodText(d)) + '</dd>' +
      (checks ? '<dt>확인 상태</dt><dd>' + checks + '</dd>' : '') +
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
  // view = { status:'loading'|'noid'|'offline'|'denied'|'notfound'|'error'|'ok', data, code }, o = { name, sub, kw }
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
    if (!docs.length) {
      return head(unk('자료 없음')) + '<div class="db-sec"><h3>사업계획</h3><p class="db-empty">이 기관의 사업계획은 아직 수집되지 않았습니다. 폐쇄망 밖에서 수집한 파일을 시스템 관리자가 올리면 이 자리에 보입니다.</p></div>';
    }
    const n = docs.reduce(function (s, d) { return s + (Array.isArray(d.items) ? d.items.length : 0); }, 0);
    const imp = data.import || {};
    const impLine = imp.imported_at ? '<p class="db-why pl-imp">반입 ' + mono(plans.kstYmd(imp.imported_at)) + ' · ' + esc(ORIGIN[imp.origin_cd] || imp.origin_cd || '') + '</p>' : '';
    const kw = '<div class="pl-kwrow"><label class="sr-only" for="pl-kw">이 기관의 사업 찾기</label><input id="pl-kw" type="search" autocomplete="off" ' +
      'placeholder="사업명·내용에서 찾기 (예: 청년, 소상공인, 디지털)" value="' + esc(o.kw || '') + '"></div>';
    return head(plans.statusBadgesHtml({
      item_count: n, period_ended: docs.every(function (d) { return d.period_ended; }), stale: docs.some(function (d) { return d.stale; }),
    })) + impLine + kw + '<div id="pl-docs">' + plans.docsHtml(data, o.kw) + '</div>';
  };

  // ── 순수: 목록 ─────────────────────────────────────────────────────
  plans.statusMap = function (data) {
    const m = {};
    ((data && data.items) || []).forEach(function (r) { if (r && r.institution_id) m[r.institution_id] = r; });
    return m;
  };
  // 공고 진행 중(notice) 먼저, 그다음 기간 창(windowItems). 서버 현황은 institutionId 로만 붙인다. map 이 null 이면 st 는 모두 null(아직 모름).
  plans.listRows = function (M, key, f, map) {
    const d = D();
    const items = (M.notice || []).concat(d.windowItems(M, key));
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
  plans.footHtml = function (n, m, busy) {
    n = Number(n) || 0; m = Number(m) || 0;
    let h = '';
    if (n) {
      h = '목록에 담을 수 있는 기관 ' + mono(n) + '곳 · <button type="button" class="db-link" id="pl-dl"' + (busy ? ' disabled' : '') + '>목록 내려받기(CSV)</button><br>' +
        '폐쇄망 밖에서 사업계획을 모을 때 쓰는 할 일 목록입니다.';
    }
    if (m > n) h += (h ? '<br>' : '') + '서버에 등록되지 않은 ' + mono(m - n) + '곳은 목록에 넣을 수 없습니다.';
    return h;
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
    const badges = o.loaded ? plans.statusBadgesHtml(r.st) : '';
    return '<li role="option" id="' + esc(o.id || '') + '" class="db-row" data-key="' + esc(r.key) + '" aria-selected="' + (o.selected ? 'true' : 'false') + '">' +
      '<span class="nm">' + esc(it.name) + '</span>' + tag + '<span class="meta">' + meta + (badges ? ' ' + badges : '') + '</span></li>';
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
  plans.resetStatus = function () { statusSeq += 1; statusPending = null; statusInflight = false; ST = freshStatus(); };
  plans.statusState = function () { return ST.state; };

  function fetchJson(url) {
    if (typeof fetch !== 'function') return Promise.resolve({ status: 'offline', code: 0 });
    return fetch(url).then(function (r) {
      if (!r.ok) return { status: r.status === 401 || r.status === 403 ? 'denied' : 'error', code: r.status };
      return r.json().then(function (d) { return { status: 'ok', data: d }; }, function () { return { status: 'error', code: r.status }; });
    }).catch(function () { return { status: 'error', code: 0 }; });
  }
  function ensureStatus(force) {
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
    const h3 = '<h3>사업계획</h3>';
    if (!id) return h3 + '<dl class="db-dl"><dt>자료</dt><dd>' + unk('자료 없음') + '</dd></dl><p class="db-empty">서버에 등록된 기관만 사업계획을 조회합니다.</p>';
    if (ST.state === 'idle' || ST.state === 'loading') return h3 + '<p class="db-empty" aria-busy="true">사업계획 현황을 불러오는 중입니다…</p>';
    if (ST.state !== 'ok') return '';
    const st = ST.map[id];
    if (!st) return h3 + '<dl class="db-dl"><dt>자료</dt><dd>' + unk('자료 없음') + '</dd></dl><p class="db-empty">아직 수집한 사업계획이 없습니다. 입찰이 가까운 기관부터 모읍니다.</p>';
    const n = Number(st.item_count) || 0;
    // 메뉴에 '기관 사업계획'이 안 보이는 사용자는 화면을 열 수 없으니 버튼을 두지 않고 요약만 보인다.
    const open = plans.menuVisible() ?
      '<p class="pl-open"><button type="button" class="link-btn" data-pl-open="' + esc(id) + '" aria-describedby="' + esc(nameId || 'db-name') + '">사업계획 ' + mono(n) + '건 보기</button>' +
      ' <span class="pl-msg db-why" role="status"></span></p>' : '';
    return h3 + '<dl class="db-dl"><dt>자료</dt><dd>' + plans.statusBadgesHtml(st) + '</dd>' +
      (ymd(st.oldest_checked_on) ? '<dt>확인일</dt><dd>' + mono(ymd(st.oldest_checked_on)) + ' <span class="db-why">가장 오래된 문서 기준</span></dd>' : '') + '</dl>' + open;
  };
  // 기관 사업계획 화면을 이 사용자가 열 수 있는가 = 사이드바에 그 항목이 그려져 있는가(nav.build 가 이미 역할·서버 메뉴 키로 걸러 그린다).
  // app.js 의 findNavItem 은 밖으로 나와 있지 않아 사이드바 DOM(data-nav)로 본다. 사이드바가 아직 없으면(시험·로그인 전) 열 수 있다고 본다.
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
      pendingId: '', focusTitle: false, err: '', dlBusy: false };
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
      rows = [{ key: S.pin.key, it: S.pin.it, id: id, st: id && map ? (map[id] || null) : null }].concat(rows);
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
        return plans.rowHtml(r, { id: 'pl-o-' + i, selected: !!(S.selRow && S.selRow.key === r.key), loaded: ok });
      }).join('') + '</ul>';
    } else if (ok && S.stat !== 'all' && vr.base.length) {
      h += '<p class="db-state">' + (S.stat === 'none' ? '자료 없는 기관이 없습니다.' : '사업계획 자료가 있는 기관이 아직 없습니다. 위에서 [모두]를 고르세요.') + '</p>';
    } else if (S.q.trim() || S.region) {
      h += '<p class="db-state">조건에 맞는 기관이 없습니다. 검색어를 지우거나 지역을 \'전체 지역\'으로 바꾸세요.<br><button type="button" id="pl-clear">조건 지우기</button></p>';
    } else {
      h += '<p class="db-state">' + (S.win === 'all' ? '앞으로 입찰 예정인 기관이 없습니다.' : esc(D().WINDOW_LABELS[S.win]) + ' 안에 입찰 예정인 기관이 없습니다. 기간을 넓혀 보세요.') + '</p>';
    }
    el.innerHTML = h;
    if (sc) sc.setAttribute('aria-busy', ST.state === 'loading' ? 'true' : 'false');
    syncActive();
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
    if (!ready()) { el.innerHTML = ''; return; }
    const base = visibleRows().base;
    el.innerHTML = plans.footHtml(plans.missingIds(base).length, base.filter(function (r) { return !r.st; }).length, S.dlBusy);
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
    el.innerHTML = '<div class="db-pane-body">' + plans.detailHtml(view, { name: row.it.name, sub: sub, kw: S.kw }) + '</div>';
    if (S.focusTitle && view.status !== 'loading') { S.focusTitle = false; const h = $('pl-name'); if (h && h.focus) h.focus(); }
  }
  function renderDocs() {
    const el = $('pl-docs'), v = S.selRow ? S.cache[S.selRow.id] : null;
    if (el && v && v.status === 'ok') el.innerHTML = plans.docsHtml(v.data, S.kw);
  }
  function onStatus() {
    if (!host || !M || !S) return;
    renderBanner(); renderList(); renderFoot();
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
    S.selRow = row; S.kw = ''; S.focusTitle = false;
    if (S.pin && S.pin.key !== key) S.pin = null;
    loadDetail(row.id);
    if (hadPin && !S.pin) renderList(); else markSelected();
    renderPane();
    const lb = focusLb ? $('pl-lb') : null;
    if (lb) lb.focus();
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
        setFlash('자료 없는 기관 ' + ids.length + '곳의 목록을 내려받았습니다. 엑셀에서 열어 수집 담당에게 전달하세요.');
      })
      .catch(function (e) {
        const s = e && e.status;
        S.err = s === 401 || s === 403 ? '목록을 내려받을 권한이 없습니다(' + s + '). 로그인 사번과 권한을 확인하세요.'
          : s ? '목록을 만들지 못했습니다(' + s + '). 목록을 다시 불러온 뒤 시도하세요.' : '서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인하세요.';
      })
      .then(function () { if (!S) return; S.dlBusy = false; renderBanner(); renderFoot(); });
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
      case 'pl-retry': ensureStatus(true).then(function () { const l = $('pl-lb'); if (l) l.focus(); }); onStatus(); break;
      case 'pl-retry-detail': if (S.selRow) { delete S.cache[S.selRow.id]; loadDetail(S.selRow.id); renderPane(); } break;
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
    if (id === 'pl-q') { S.q = e.target.value; S.pin = null; renderList(); renderFoot(); }
    else if (id === 'pl-kw') { S.kw = e.target.value; renderDocs(); }
  }
  function onChange(e) {
    const t = e.target;
    if (!t) return;
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
    S.cache = {}; S.err = '';
    ac = typeof AbortController === 'function' ? new AbortController() : null;
    const opt = ac ? { signal: ac.signal } : undefined;
    host.innerHTML = SKELETON;
    host.addEventListener('click', onClick, opt);
    host.addEventListener('keydown', onKey, opt);
    host.addEventListener('input', onInput, opt);
    host.addEventListener('change', onChange, opt);
    M = D().model(dataList(), todayDate());
    fillControls();
    applyPending();
    if (S.selRow) loadDetail(S.selRow.id);
    renderBanner(); renderList(); renderFoot(); renderPane();
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
