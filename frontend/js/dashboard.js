(function (root) {
  'use strict';
  // 입찰 현황판(NEXT 77, 1단계). 규격: handoff/agents/design-reviewer/2026-11-11_1445_aba6f113.md
  // 순수 부분(model·regionOptions·kbCount·progressCount·rowHtml·paneHtml)은 node 테스트 대상이고,
  // DOM 부분(mount/unmount)은 app.js가 #dash-root를 넘겨 부른다. 새 판정 로직은 만들지 않고 logic.js 함수를 조합한다.
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const dash = {};
  const esc = logic.esc;

  dash.SEGMENTS = [30, 90, 180, 365];                              // 구간 경계(일, 포함)
  dash.SEG_LABELS = ['30일 안', '31~90일', '91~180일', '181일~1년'];
  dash.WINDOW_DAYS = 365;
  dash.URGENT_DAYS = 182;                                          // computeUrgency와 같은 경계(≤182 빨강, 그 뒤 주황)
  dash.SALES_ROLES = ['영업팀', '영업팀장', '영업부장'];

  // ── 조사 을/를 ─────────────────────────────────────────────────────
  // 공용 모듈에는 아직 없고 board-write.js의 bw.josaEul만 있다(그 파일은 로드 순서·크기 때문에 끌어오지 않는다).
  // 공용화(logic 또는 errtext)되면 이 지역 함수를 지운다.
  function jong(s) {
    const w = String(s == null ? '' : s), code = w ? w.charCodeAt(w.length - 1) : 0;
    return (code >= 0xac00 && code <= 0xd7a3) ? (code - 0xac00) % 28 : 0;
  }
  dash.josaEul = function (w) { return jong(w) > 0 ? '을' : '를'; };

  // ── 순수: 모델 ─────────────────────────────────────────────────────
  function bucketOf(d) { return d <= 30 ? 0 : d <= 90 ? 1 : d <= 180 ? 2 : 3; }

  // list(서버 병합 목록) → 기관 단위로 중복 제거한 뒤 1년 안(upcoming)·경과(overdue)·날짜 미상 집계.
  // 0일(D-day)은 1년 안에 든다. 정렬: 1년 안은 남은 일수 → 기관명, 경과는 overdueSummary 순서(최근에 지난 순).
  dash.model = function (list, today) {
    const src = list || [];
    const deduped = logic.dedupeByInstitution(src);
    const ov = logic.overdueSummary(src, today);
    const upcoming = [], buckets = [0, 0, 0, 0];
    let beyondN = 0, confirmedN = 0, underReviewN = 0, maxUpdated = '';
    deduped.forEach(function (r) {
      const e = logic.effectiveBid(r);
      if (e.confidence === '확정') confirmedN += 1;
      const check = logic.isDateUnderReview(r);
      if (check) underReviewN += 1;
      const u = r.updatedAt ? String(r.updatedAt).slice(0, 10) : '';
      if (u > maxUpdated) maxUpdated = u;
      if (!e.date) return;
      const d = logic.daysUntil(e.date, today);
      if (d === Infinity || d < 0) return;
      if (d > dash.WINDOW_DAYS) { beyondN += 1; return; }
      const b = bucketOf(d);
      buckets[b] += 1;
      upcoming.push({ key: logic.instKey(r), rec: r, name: r.name || '', region: r.region || '', date: e.date, days: d,
        confidence: e.confidence, label: logic.confidenceLabel(e.confidence), check: check, bucket: b,
        band: d <= dash.URGENT_DAYS ? 'urgent' : 'soon', overdue: false });
    });
    upcoming.sort(function (a, b) { return a.days - b.days || (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)); });
    const overdue = ov.items.map(function (it) {
      return { key: logic.instKey(it.rec), rec: it.rec, name: it.name, region: it.region, date: it.date, days: it.days,
        confidence: logic.effectiveBid(it.rec).confidence, label: logic.confidenceLabel(logic.effectiveBid(it.rec).confidence),
        check: it.check, bucket: -1, band: 'overdue', overdue: true };
    });
    return { upcoming: upcoming, overdue: overdue, unknownN: ov.unknown, beyondN: beyondN, buckets: buckets,
      total: deduped.length, confirmedN: confirmedN, underReviewN: underReviewN, maxUpdated: maxUpdated };
  };

  function regionNames() { return (root.render && root.render.REGION_NAME) || {}; }
  dash.regionName = function (code, names) { const n = names || regionNames(); return n[code] || code || ''; };

  // 데이터에 있는 시·도만(가나다순). nameOf 생략 시 render.REGION_NAME, 그것도 없으면 코드.
  dash.regionOptions = function (list, nameOf) {
    const seen = {}, out = [];
    logic.dedupeByInstitution(list || []).forEach(function (r) {
      if (!r.region || seen[r.region]) return;
      seen[r.region] = true;
      out.push({ code: r.region, name: nameOf ? nameOf(r.region) : dash.regionName(r.region) });
    });
    out.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
    return out;
  };
  dash.typeOptions = function (list) {
    const seen = {}, out = [];
    logic.dedupeByInstitution(list || []).forEach(function (r) {
      const t = r.type || '';
      if (t && !seen[t]) { seen[t] = true; out.push(t); }
    });
    return out.sort();
  };
  // 종류가 2개 이상일 때만 <select>를 그린다(지금은 전부 지자체).
  dash.showTypeFilter = function (list) { return dash.typeOptions(list).length >= 2; };

  dash.filterItems = function (items, f) {
    const q = String((f && f.q) || '').trim().toLowerCase(), region = (f && f.region) || '', type = (f && f.type) || '';
    return items.filter(function (it) {
      return (!q || it.name.toLowerCase().indexOf(q) >= 0) && (!region || it.region === region) && (!type || (it.rec.type || '') === type);
    });
  };

  // 국민은행 금고 약정 '확인' 수 — 검증된 키 목록(root.KB_VERIFIED, 'region|name')에서만 센다. 없으면 확인 0.
  dash.kbKeys = function (verified) {
    const set = {};
    (verified || []).forEach(function (v) {
      const k = typeof v === 'string' ? v : (v && v.key);
      if (k) set[k] = v;
    });
    return set;
  };
  dash.kbCount = function (list, verifiedKeys) {
    const set = dash.kbKeys(verifiedKeys), deduped = logic.dedupeByInstitution(list || []);
    let c = 0;
    deduped.forEach(function (r) { if (Object.prototype.hasOwnProperty.call(set, logic.instKey(r))) c += 1; });
    return { confirmed: c, unconfirmed: deduped.length - c, total: deduped.length };
  };
  dash.kbEntry = function (rec, verifiedKeys) {
    const set = dash.kbKeys(verifiedKeys), k = logic.instKey(rec);
    return Object.prototype.hasOwnProperty.call(set, k) && typeof set[k] === 'object' ? set[k] : null;
  };

  // 지금 제안 진행 중: 사전준비(취소 제외)와 제안서 작성(overview 미완료·실행 있음)을 institution_id로 한 번씩만 센다.
  // preps나 overview가 null이면(권한 밖·실패) 그쪽은 null — 합계는 받은 쪽만으로 낸다.
  function instId(x) { return x && (x.institution_id || x.institutionId || x.id) || ''; }
  dash.activePreps = function (preps) {
    return (Array.isArray(preps) ? preps : []).filter(function (p) { return (p.state_cd || p.stateCd) !== 'CANCELLED'; });
  };
  dash.progressCount = function (preps, overview) {
    const pset = {}, wset = {};
    let prepN = null, writeN = null;
    if (Array.isArray(preps)) {
      dash.activePreps(preps).forEach(function (p) { const id = instId(p); if (id) pset[id] = true; });
      prepN = Object.keys(pset).length;
    }
    const items = Array.isArray(overview) ? overview : (overview && overview.items);
    if (Array.isArray(items)) {
      items.forEach(function (it) {
        const id = instId(it);
        if (id && !it.done && (it.state || 'NONE') !== 'NONE' && !pset[id]) wset[id] = true;
      });
      writeN = Object.keys(wset).length;
    }
    const total = (prepN === null && writeN === null) ? null : (prepN || 0) + (writeN || 0);
    return { prep: prepN, writing: writeN, total: total };
  };

  // 지도 팝오버와 같은 버튼 규칙: root.prep.popoverAction이 정한다. 반환 모양이 문자열이든 {kind|action|type}이든 받는다.
  dash.actionKind = function (rec, ctx, actives, prepApi) {
    if (!prepApi || typeof prepApi.popoverAction !== 'function' || !ctx || !ctx.serverMode) return 'unavailable';
    let r;
    try { r = prepApi.popoverAction(rec, ctx, actives || []); } catch (e) { return 'unavailable'; }
    const k = typeof r === 'string' ? r : (r && (r.kind || r.action || r.type)) || '';
    if (/open|열기/i.test(k)) return 'open';
    if (/confirm|확정/i.test(k)) return 'confirm';
    return 'none';
  };

  // ── 순수: HTML 조각(사용자·서버 값은 전부 esc) ─────────────────────
  function mono(s) { return '<span class="v">' + esc(s) + '</span>'; }
  function chip() { return '<span class="pop-unk">미확인</span>'; }
  function dayText(days) { return days === 0 ? 'D-day' : 'D-' + days; }
  function chkHtml(it) { return it.check ? ' <span class="db-chk">날짜 의미 확인 중</span>' : ''; }

  dash.rowHtml = function (it, o) {
    o = o || {};
    const tag = it.overdue ? '<span class="ov-stamp">D+' + it.days + '</span>'
      : '<span class="dg-day ' + esc(it.band) + '">' + dayText(it.days) + '</span>';
    const meta = it.overdue
      ? esc(dash.regionName(it.region)) + ' · 공고가 났는지 확인이 필요합니다' + chkHtml(it)
      : esc(dash.regionName(it.region)) + ' · <span class="d">' + esc(it.date) + '</span> ' + esc(it.label) + chkHtml(it) +
        (o.prepActive ? ' <span class="wf-badge pp-neutral">사전준비 중</span>' : '');
    return '<li role="option" id="' + esc(o.id || '') + '" class="db-row" data-key="' + esc(it.key) + '" aria-selected="' + (o.selected ? 'true' : 'false') + '">' +
      '<span class="nm">' + esc(it.name) + '</span>' + tag + '<span class="meta">' + meta + '</span></li>';
  };

  // 요약 띠 가운데 1년 눈금 + 구간 수
  dash.rulerHtml = function (m, selKey) {
    let seg = '', ticks = '';
    dash.SEGMENTS.forEach(function (s, i) {
      seg += '<div class="db-seg" style="left:' + (s / dash.WINDOW_DAYS * 100) + '%"><span>' + ['D-30', 'D-90', 'D-180', '1년'][i] + '</span></div>';
    });
    m.upcoming.forEach(function (it) {
      ticks += '<div class="db-tick ' + (it.days <= dash.URGENT_DAYS ? 'red' : 'orange') + (it.key === selKey ? ' sel' : '') +
        '" style="left:' + (it.days / dash.WINDOW_DAYS * 100) + '%" title="' + esc(it.name + ' ' + dayText(it.days)) + '"></div>';
    });
    const b = m.buckets;
    const label = '앞으로 1년 입찰 예정 ' + m.upcoming.length + '곳: 30일 안 ' + b[0] + '곳, 31~90일 ' + b[1] + '곳, 91~180일 ' + b[2] + '곳, 181일~1년 ' + b[3] + '곳';
    const buckets = dash.SEG_LABELS.map(function (l, i) { return '<span>' + l + '<b>' + b[i] + '</b></span>'; }).join('');
    return '<div class="db-ruler">' +
      '<div class="db-end"><span class="ov-stamp">D+</span><b>' + m.overdue.length + '</b>경과</div>' +
      '<div class="db-track" id="db-track" role="img" aria-label="' + esc(label) + '">' + seg + ticks + '</div>' +
      '<div class="db-end"><b>' + m.unknownN + '</b>날짜 미상</div></div>' +
      '<div class="db-buckets">' + buckets + '</div>';
  };

  // 요약 띠 세 칸. p = {state:'offline'|'loading'|'ok'|'denied'|'error', count:progressCount 결과, code:401|403|0}
  dash.stripHtml = function (m, kb, p, selKey) {
    p = p || { state: 'offline' };
    const c = p.count || {};
    let fig = '', note = '';
    if (p.state === 'offline') note = '서버에 연결하면 보입니다.';
    else if (p.state === 'loading') note = '불러오는 중입니다…';
    else if (p.state === 'denied') note = '진행 건수를 볼 권한이 없습니다(' + esc(p.code || '') + '). 로그인 사번과 권한을 확인하세요.';
    else if (p.state === 'error') note = '진행 건수를 불러오지 못했습니다. <button type="button" id="db-retry">다시 시도</button>';
    else if (c.total === null || c.total === undefined) note = '진행 건수를 불러오지 못했습니다. <button type="button" id="db-retry">다시 시도</button>';
    else {
      fig = '<div class="db-fig"><b>' + c.total + '</b><span class="u">건</span></div>';
      if (c.prep !== null && c.writing !== null) note = '사전준비 ' + c.prep + '건 · 제안서 작성 ' + c.writing + '건 (같은 기관은 한 번만 셉니다)';
      else if (c.prep === null) note = '제안서 작성 중 ' + c.writing + '건';
      else note = '사전준비 ' + c.prep + '건 (제안서 작성 건수는 불러오지 못했습니다)';
    }
    return '<section class="db-topic" aria-labelledby="db-t1"><h2 id="db-t1">국민은행 금고 약정 기관</h2>' +
        '<div class="db-fig"><span class="u">확인</span><b>' + kb.confirmed + '</b><span class="u">곳</span><span class="sep">/</span><span class="u">미확인</span><b>' + kb.unconfirmed + '</b><span class="u">곳</span></div>' +
        '<p class="db-note">약정 기록을 모으기 전이라 출처로 확인한 곳만 셉니다. 미확인은 \'아님\'이 아니라 \'아직 모름\'입니다.</p></section>' +
      '<section class="db-topic" aria-labelledby="db-t2"><h2 id="db-t2">1년 안 입찰 <span class="db-n">' + m.upcoming.length + '</span>곳</h2>' + dash.rulerHtml(m, selKey) + '</section>' +
      '<section class="db-topic" aria-labelledby="db-t3"><h2 id="db-t3">지금 제안 진행 중</h2>' + fig + '<p class="db-note">' + note + '</p></section>';
  };

  dash.statsHtml = function (m, todayStr) {
    return '조사한 기관 <b>' + m.total + '</b>곳 · 입찰일 공고로 확정 <b>' + m.confirmedN + '</b>곳 · 날짜 의미 확인 중 <b>' + m.underReviewN + '</b>곳 · 기준일 <b>' +
      esc(todayStr) + '</b>' + (m.maxUpdated ? ' · 자료 수정 <b>' + esc(m.maxUpdated) + '</b>' : '');
  };

  dash.footHtml = function (m) {
    if (!m.unknownN && !m.beyondN) return '';
    let t = '';
    if (m.unknownN) t += '날짜를 확인하지 못한 <b>' + m.unknownN + '</b>곳은 목록에 없습니다. ';
    if (m.beyondN) t += '입찰이 1년 뒤인 <b>' + m.beyondN + '</b>곳도 목록에 없습니다. ';
    return t + '<button type="button" class="db-link" id="db-tomap">전국 지도</button>에서 볼 수 있습니다.';
  };

  dash.blankHtml = function () {
    return '<div class="db-blank">왼쪽 목록에서 기관을 고르세요. 기관 정보와 [제안 확정] 버튼이 여기에 보입니다.</div>';
  };

  function lastProcNote(rec) {
    const s0 = Array.isArray(rec.sources) && rec.sources[0] ? String(rec.sources[0]) : '';
    if (/기준일\s*=\s*공고일/.test(s0)) return '지정 공고일';
    if (/기준일\s*=\s*지정/.test(s0)) return '지정일';
    return '';
  }
  function srcItem(s) {
    const t = String(s == null ? '' : s).trim();
    if (/^https?:\/\/\S+$/.test(t)) return '<li><a href="' + esc(t) + '" target="_blank" rel="noopener">' + esc(t) + '</a></li>';
    return '<li>' + esc(t) + '</li>';
  }

  // 상세. c = {act:'confirm'|'open'|'unavailable'|'none', confirm:bool, busy:bool, kb:검증 항목|null, role:string}
  dash.paneHtml = function (it, c) {
    c = c || {};
    const rec = it.rec, srcs = Array.isArray(rec.sources) ? rec.sources : [];
    const head = '<div class="db-head"><h2 id="db-name" tabindex="-1">' + esc(it.name) + '</h2>' +
      (it.overdue ? '<span class="ov-stamp">D+' + it.days + '</span>' : '<span class="dg-day ' + esc(it.band) + '">' + dayText(it.days) + '</span>') +
      (c.act === 'open' ? '<span class="wf-badge pp-neutral">사전준비 중</span>' : '') + '</div>' +
      '<p class="db-sub">' + esc(rec.type || '') + ' · ' + esc(dash.regionName(rec.region)) + '</p>';
    const why = it.confidence === '확정' ? '— 공고로 확인한 날입니다' : '— 최근 절차일에 약정 주기를 더한 날입니다';
    const lp = lastProcNote(rec);
    const info = '<div class="db-sec"><h3>기관 정보</h3><dl class="db-dl">' +
      '<dt>입찰 예정일</dt><dd>' + mono(it.date) + ' ' + esc(it.label) + chkHtml(it) + ' <span class="db-why">' + why + '</span></dd>' +
      '<dt>최근 절차일</dt><dd>' + (rec.lastBid ? mono(rec.lastBid) + (lp ? ' <span class="db-why">' + esc(lp) + '</span>' : '') : chip()) + '</dd>' +
      '<dt>약정 주기</dt><dd>' + (rec.term ? mono(rec.term) + '년' : chip()) + '</dd></dl>' +
      (srcs.length ? '<details class="db-src"><summary>출처 ' + srcs.length + '건 보기</summary><ol>' + srcs.map(srcItem).join('') + '</ol></details>' : '') + '</div>';
    let bank;
    if (c.kb) {
      const slot = c.kb.slot ? ' · ' + esc(c.kb.slot) + '금고' : '';
      bank = '<div class="db-sec"><h3>현재 금고 은행</h3><dl class="db-dl"><dt>금고 은행</dt><dd>KB국민은행' + slot + '</dd>' +
        '<dt>근거</dt><dd>' + esc(c.kb.quote || '') + (c.kb.src_date ? ' <span class="db-why">출처 기준일 ' + esc(c.kb.src_date) + '</span>' : '') + '</dd>' +
        '<dt>약정 기간</dt><dd>' + chip() + '</dd></dl>' +
        '<p class="db-empty">출처 문장으로 확인한 현 금고만 보입니다. 약정 기록을 모으면 약정 기간이 함께 보입니다.</p></div>';
    } else {
      bank = '<div class="db-sec"><h3>현재 금고 은행</h3><dl class="db-dl"><dt>금고 은행</dt><dd>' + chip() + '</dd><dt>약정 기간</dt><dd>' + chip() + '</dd></dl>' +
        '<p class="db-empty">약정 기록을 모으면 금고 은행과 약정 기간이 출처와 함께 여기에 보입니다.</p></div>';
    }
    const chief = '<div class="db-sec"><h3>기관장</h3><dl class="db-dl"><dt>기관장</dt><dd>' + chip() + '</dd></dl>' +
      '<p class="db-empty">기관장 프로필은 수집 예정입니다. 입찰이 1년 안에 있는 기관부터 모읍니다.</p></div>';
    return '<div class="db-pane-body">' + head + info + bank + chief + '</div><div class="db-act">' + dash.actHtml(it, c) + '</div>';
  };

  dash.actHtml = function (it, c) {
    const map = '<button type="button" id="db-map">전국 지도에서 보기</button>';
    if (c.act === 'unavailable') return '<div class="db-act-row"><span class="db-why">서버에 연결되면 [제안 확정]을 쓸 수 있습니다.</span>' + map + '</div>';
    if (c.act === 'open') return '<div class="db-act-row"><button type="button" class="db-next" id="db-open">사전준비 열기</button>' + map + '<span class="db-why">이미 제안 확정되어 사전준비가 진행 중입니다.</span></div>';
    if (c.act === 'confirm') {
      if (c.confirm) {
        return '<div class="db-confirm" role="group" aria-labelledby="db-cf-t"><span id="db-cf-t">' + esc(it.name) + dash.josaEul(it.name) +
          ' 제안 대상으로 확정합니다. 확정하면 [영업 추진 준비 › 제안서 사전준비 프로세스]에 이 기관의 준비 건이 생깁니다. 개설 신청 전까지는 확정한 사람·영업팀장이 취소할 수 있습니다.</span>' +
          '<div class="db-act-row"><button type="button" class="db-next" id="db-do"' + (c.busy ? ' disabled' : '') + '>확정하기</button><button type="button" id="db-cancel">취소</button></div></div>';
      }
      return '<div class="db-act-row"><button type="button" class="db-next" id="db-cf">제안 확정</button>' + map + '</div>';
    }
    const noperm = ['영업팀', '영업팀장'].indexOf(c.role || '') < 0 ? '<span class="db-why">제안 확정은 영업팀·영업팀장이 합니다.</span>' : '';
    return '<div class="db-act-row">' + map + noperm + '</div>';
  };

  // ── DOM ───────────────────────────────────────────────────────────
  const st = { sel: '', q: '', region: '', type: '', pastOpen: true, confirm: false, busy: false, flash: '', err: '',
    preps: null, overview: null, prepSt: 'offline', ovSt: 'offline', prepCode: 0, ovCode: 0 };
  let host = null, ac = null, M = null, LIST = [], seq = 0;

  function $(id) { return host ? host.querySelector('#' + id) : null; }
  function todayDate() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function role() { try { return (root.store.loadProfile().team || '').trim(); } catch (e) { return ''; } }
  function serverMode() { try { return !!root.store.isServerMode(); } catch (e) { return false; } }
  function hasEmp() { try { return !!(root.store.loadSession() || {}).emp; } catch (e) { return false; } }
  function dataList() {
    try {
      if (root.render && root.render.allInstitutions) return root.render.allInstitutions();
      return root.store.loadData() || root.institutions || [];
    } catch (e) { return root.institutions || []; }
  }
  function allItems() { return M ? M.upcoming.concat(M.overdue) : []; }
  function findItem(key) { return allItems().filter(function (it) { return it.key === key; })[0] || null; }
  function activeFor(rec) {
    const id = rec && rec.institutionId;
    return id ? dash.activePreps(st.preps).filter(function (p) { return instId(p) === id; })[0] || null : null;
  }

  function progressState() {
    if (!serverMode() || !hasEmp()) return { state: 'offline' };
    if (st.prepSt === 'loading' || st.ovSt === 'loading') return { state: 'loading' };
    const okP = st.prepSt === 'ok', okO = st.ovSt === 'ok';
    if (okP || okO) return { state: 'ok', count: dash.progressCount(okP ? st.preps : null, okO ? st.overview : null) };
    const code = st.ovCode || st.prepCode;
    if (code === 401 || code === 403) return { state: 'denied', code: code };
    return { state: 'error' };
  }

  function renderStrip() {
    const el = $('db-strip');
    if (el) el.innerHTML = dash.stripHtml(M, dash.kbCount(LIST, root.KB_VERIFIED), progressState(), st.sel);
    const n = $('db-stats');
    if (n) n.innerHTML = dash.statsHtml(M, logic.localDateStr(todayDate()));
  }

  function renderBanner() {
    const el = $('db-err');
    if (!el) return;
    let t = st.err;
    if (!t && !serverMode()) {
      t = (root.location && root.location.protocol === 'file:')
        ? '서버에 연결되지 않은 파일 모드입니다. 내장 자료만 보여 주며 진행 건수와 [제안 확정]은 쓸 수 없습니다.'
        : '서버의 기관 정보를 불러오지 못해 내장 자료만 보여 줍니다. 제안 진행 표시와 [제안 확정]은 쓸 수 없습니다. <button type="button" id="db-reload">다시 불러오기</button>';
    }
    el.innerHTML = t && st.err ? esc(st.err) : t;
    el.setAttribute('role', st.err || (root.location && root.location.protocol !== 'file:') ? 'alert' : 'status');
    el.style.display = el.innerHTML ? '' : 'none';
  }

  function optionsFor(items, prefix, listKey) {
    return items.map(function (it, i) {
      const id = prefix + i;
      return dash.rowHtml(it, { id: id, selected: it.key === st.sel, prepActive: !!activeFor(it.rec) });
    }).join('');
  }

  function renderList() {
    const el = $('db-scroll');
    if (!el) return;
    const f = { q: st.q, region: st.region, type: st.type };
    const up = dash.filterItems(M.upcoming, f), past = dash.filterItems(M.overdue, f);
    const filtered = !!(st.q.trim() || st.region || st.type);
    let h = '<div class="db-grp" id="db-g1">1년 안 <b>' + up.length + '</b>곳</div>';
    if (up.length) h += '<ul role="listbox" id="db-lb" tabindex="0" aria-labelledby="db-g1">' + optionsFor(up, 'db-o-') + '</ul>';
    else if (filtered && M.upcoming.length) h += '<p class="db-state">조건에 맞는 기관이 없습니다. 검색어를 지우거나 지역을 \'전체 지역\'으로 바꾸세요.<br><button type="button" id="db-clear">조건 지우기</button></p>';
    else h += '<p class="db-state">앞으로 1년 안에 입찰 예정인 기관이 없습니다. 예정일이 지난 기관은 아래 [공고 예정일 경과]에서 봅니다.</p>';
    h += '<button type="button" class="db-more" id="db-past" aria-expanded="' + st.pastOpen + '" aria-controls="db-pastlist"><span><span class="ov-stamp">D+</span> 공고 예정일 경과 <b>' + past.length + '</b>곳</span><span>' + (st.pastOpen ? '접기' : '펼치기') + '</span></button>';
    if (st.pastOpen) {
      h += past.length ? '<ul role="listbox" id="db-pastlist" tabindex="0" aria-label="공고 예정일 경과 기관">' + optionsFor(past, 'db-p-') + '</ul>'
        : '<p class="db-state">' + (filtered ? '조건에 맞는 경과 기관이 없습니다.' : '예정일이 지난 기관이 없습니다.') + '</p>';
    }
    el.innerHTML = h;
    markSelected();
    const foot = $('db-foot');
    if (foot) foot.innerHTML = dash.footHtml(M);
  }

  function markSelected() {
    if (!host) return;
    host.querySelectorAll('[role=listbox]').forEach(function (lb) {
      let act = '';
      lb.querySelectorAll('[role=option]').forEach(function (o) {
        const on = o.getAttribute('data-key') === st.sel;
        o.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) act = o.id;
      });
      if (act) lb.setAttribute('aria-activedescendant', act); else lb.removeAttribute('aria-activedescendant');
    });
  }

  function renderPane() {
    const el = $('db-pane');
    if (!el) return;
    const it = st.sel ? findItem(st.sel) : null;
    if (!it) { el.innerHTML = dash.blankHtml(); return; }
    const actives = dash.activePreps(st.preps);
    const ctx = { serverMode: serverMode() && hasEmp(), role: role(), session: root.store.loadSession && root.store.loadSession() };
    const act = dash.actionKind(it.rec, ctx, actives, root.prep);
    el.innerHTML = dash.paneHtml(it, { act: act, confirm: st.confirm && act === 'confirm', busy: st.busy,
      kb: dash.kbEntry(it.rec, root.KB_VERIFIED), role: ctx.role });
    if (st.confirm && act === 'confirm') { const b = $('db-do'); if (b) b.focus(); }
  }

  function flash(msg, isErr) {
    st.flash = isErr ? '' : msg;
    const f = $('db-flash');
    if (f) f.textContent = isErr ? '' : msg;
    const e = $('db-err');
    if (e) { st.err = isErr ? msg : ''; renderBanner(); }
  }

  function renderAll() { if (!M) return; renderBanner(); renderStrip(); renderList(); renderPane(); }

  function select(key, focusLb) {
    st.sel = key; st.confirm = false;
    markSelected(); renderStrip(); renderPane();
    if (focusLb) focusLb.focus();
    const o = host && host.querySelector('[role=option][data-key="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]');
    if (o && o.scrollIntoView) o.scrollIntoView({ block: 'nearest' });
  }

  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) return { status: r.status === 401 || r.status === 403 ? 'denied' : 'error', code: r.status };
      return r.json().then(function (d) { return { status: 'ok', data: d }; });
    }).catch(function () { return { status: 'error', code: 0 }; });
  }

  // /preps(영업 계열만 받음)와 /workflow/overview를 함께 받는다. 한쪽이 권한 밖이어도 다른 쪽으로 띠 3을 그린다.
  function loadProgress() {
    if (!serverMode() || !hasEmp()) { st.prepSt = st.ovSt = 'offline'; st.preps = st.overview = null; renderStrip(); renderPane(); return Promise.resolve(); }
    const my = ++seq;
    st.prepSt = st.ovSt = 'loading';
    renderStrip();
    return Promise.all([fetchJson('/preps'), fetchJson('/workflow/overview')]).then(function (res) {
      if (my !== seq || !host) return;
      const p = res[0], o = res[1];
      st.prepSt = p.status; st.prepCode = p.code || 0; st.preps = p.status === 'ok' ? (Array.isArray(p.data) ? p.data : (p.data && p.data.items) || []) : null;
      st.ovSt = o.status; st.ovCode = o.code || 0; st.overview = o.status === 'ok' ? o.data : null;
      renderStrip(); renderList(); renderPane();
    });
  }

  function goPrep(prep) {
    const P = root.prep, A = root.app;
    if (!P || !A || !A.openNavItem || !P.SOON_ID) return false;
    A.openNavItem(P.SOON_ID);
    if (P.openCase && prep) P.openCase(prep.bid_case_id || prep.bidCaseId);
    return true;
  }

  function doConfirm() {
    const it = st.sel ? findItem(st.sel) : null;
    const id = it && it.rec.institutionId;
    if (!it || !id || st.busy) return;
    st.busy = true; renderPane();
    fetch('/preps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ institution_id: id }) })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (body) { return { r: r, body: body }; }); })
      .then(function (x) {
        st.busy = false; st.confirm = false;
        if (x.r.ok) {
          flash(it.name + dash.josaEul(it.name) + ' 제안 확정했습니다. 다음은 [개설 신청]입니다.', false);
          return loadProgress().then(function () {
            const made = activeFor(it.rec);
            if (!goPrep(made || x.body)) renderPane();
          });
        }
        const e = root.errtext ? root.errtext.parse(x.body && x.body.detail) : { code: '', message: '' };
        if (e.code === 'PREP_ALREADY_ACTIVE') return loadProgress();   // 버튼이 [사전준비 열기]로 바뀐다
        const known = root.prep && root.prep.ERR_BY_CODE && root.prep.ERR_BY_CODE[e.code];
        const msg = (known && (known.message || known)) || e.message ||
          ((x.r.status === 401 || x.r.status === 403) ? '제안 확정 권한이 없습니다(' + x.r.status + '). 로그인 사번과 권한을 확인하세요.'
            : '제안 확정하지 못했습니다(' + x.r.status + '). 잠시 뒤 다시 시도하세요.');
        flash(String(msg), true);
        renderPane();
      })
      .catch(function () { st.busy = false; flash('서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인하세요.', true); renderPane(); });
  }

  const SKELETON =
    '<section id="db-root" aria-label="입찰 현황판">' +
    '<div id="db-strip" class="db-strip"></div><p id="db-stats" class="db-stats"></p>' +
    '<div id="db-flash" class="db-flash" role="status"></div><div id="db-err" class="db-state db-banner" role="alert" style="display:none"></div>' +
    '<div class="db-body"><section class="db-list" aria-labelledby="db-lt"><div class="db-list-head"><h2 id="db-lt">다가오는 입찰</h2>' +
    '<p>입찰 예정일이 가까운 순서입니다(1년 안).</p><div class="db-filters" id="db-filters">' +
    '<input id="db-q" type="search" placeholder="기관명 검색" aria-label="기관명 검색"><select id="db-region" aria-label="지역"></select>' +
    '<select id="db-type" aria-label="기관 종류" style="display:none"></select></div></div>' +
    '<div class="db-scroll" id="db-scroll" aria-busy="true"><p class="db-state" aria-busy="true">기관 목록을 불러오는 중입니다…</p></div>' +
    '<div class="db-foot" id="db-foot"></div></section>' +
    '<section class="db-pane" id="db-pane" aria-labelledby="db-name"></section></div></section>';

  function fillFilters() {
    const rg = $('db-region'), ty = $('db-type'), q = $('db-q');
    if (q) q.value = st.q;
    if (rg) {
      rg.innerHTML = '<option value="">전체 지역</option>' + dash.regionOptions(LIST).map(function (o) {
        return '<option value="' + esc(o.code) + '">' + esc(o.name) + '</option>';
      }).join('');
      rg.value = st.region;
    }
    if (ty) {
      const show = dash.showTypeFilter(LIST);
      ty.style.display = show ? '' : 'none';
      if (show) {
        ty.innerHTML = '<option value="">전체 종류</option>' + dash.typeOptions(LIST).map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('');
        ty.value = st.type;
      } else st.type = '';
      const fl = $('db-filters');
      if (fl) fl.style.gridTemplateColumns = show ? '1fr 112px 96px' : '';
    }
  }

  function refreshData() {
    LIST = dataList();
    M = dash.model(LIST, todayDate());
    const sc = $('db-scroll');
    if (sc) sc.setAttribute('aria-busy', 'false');
    const rootEl = $('db-root');
    if (rootEl) rootEl.setAttribute('aria-busy', 'false');
    fillFilters();
    renderAll();
  }

  function onKey(e) {
    if (e.key === 'Escape' && st.confirm) {
      st.confirm = false; renderPane();
      const b = $('db-cf'); if (b) b.focus();
      return;
    }
    const lb = e.target;
    if (!lb || lb.getAttribute('role') !== 'listbox' || !host.contains(lb)) return;
    const opts = Array.prototype.slice.call(lb.querySelectorAll('[role=option]'));
    if (!opts.length) return;
    let i = opts.findIndex(function (o) { return o.getAttribute('data-key') === st.sel; });
    if (e.key === 'ArrowDown') i = i < 0 ? 0 : Math.min(opts.length - 1, i + 1);
    else if (e.key === 'ArrowUp') i = i < 0 ? 0 : Math.max(0, i - 1);
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = opts.length - 1;
    else if (e.key === 'Enter') { e.preventDefault(); const h = $('db-name'); if (h) h.focus(); return; }
    else return;
    e.preventDefault();
    select(opts[i].getAttribute('data-key'), lb);
  }

  function onClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    const row = t.closest('.db-row');
    if (row && host.contains(row)) { select(row.getAttribute('data-key'), row.closest('[role=listbox]')); return; }
    const btn = t.closest('button');
    if (!btn) return;
    switch (btn.id) {
      case 'db-past': st.pastOpen = !st.pastOpen; renderList(); { const b = $('db-past'); if (b) b.focus(); } break;
      case 'db-clear': st.q = ''; st.region = ''; st.type = ''; fillFilters(); renderList(); break;
      case 'db-cf': st.confirm = true; renderPane(); break;
      case 'db-cancel': st.confirm = false; renderPane(); { const b = $('db-cf'); if (b) b.focus(); } break;
      case 'db-do': doConfirm(); break;
      case 'db-open': { const it = findItem(st.sel); const p = it && activeFor(it.rec); if (!goPrep(p)) flash('사전준비 화면을 열지 못했습니다. 메뉴의 [제안서 사전준비 프로세스]에서 여세요.', true); break; }
      case 'db-map': case 'db-tomap': { const m = document.getElementById('tab-btn-map'); if (m) m.click(); break; }
      case 'db-retry': loadProgress(); break;
      case 'db-reload':
        if (root.app && root.app.bootstrapServer) root.app.bootstrapServer().then(function () { refreshData(); loadProgress(); });
        break;
      default: break;
    }
  }

  dash.mount = function (el) {
    if (!el) return;
    if (host) dash.unmount();
    host = el;
    ac = typeof AbortController === 'function' ? new AbortController() : null;
    const opt = ac ? { signal: ac.signal } : undefined;
    host.innerHTML = SKELETON;
    host.addEventListener('keydown', onKey, opt);
    host.addEventListener('click', onClick, opt);
    host.addEventListener('input', function (e) { if (e.target.id === 'db-q') { st.q = e.target.value; renderList(); } }, opt);
    host.addEventListener('change', function (e) {
      if (e.target.id === 'db-region') { st.region = e.target.value; renderList(); }
      else if (e.target.id === 'db-type') { st.type = e.target.value; renderList(); }
    }, opt);
    st.confirm = false; st.busy = false; st.err = ''; st.flash = '';
    refreshData();       // 처음 들어와도 자동으로 고르지 않는다(임의 기관이 '추천'처럼 읽히지 않게). 선택은 세션 안에서만 기억한다.
    loadProgress();
  };

  dash.unmount = function () {
    seq += 1;
    if (ac) ac.abort();
    ac = null;
    if (host) host.innerHTML = '';
    host = null; M = null;
  };

  if (isNode) module.exports = dash;
  else root.dashboard = dash;
})(typeof self !== 'undefined' ? self : this);
