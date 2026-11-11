(function (root) {
  'use strict';
  // 입찰 현황판(NEXT 77, 재설계). 규격: handoff/agents/design-reviewer/2026-11-11_1627_a41bdf71.md(+ 1445_aba6f113.md 1단계), 시안 docs/design/2026-11-11_입찰현황판_재설계_시안.html
  // 순수 부분(model·windowItems·moreHint·monthBuckets·timelineHtml·stageCounts·termBar·railHtml·rowHtml·paneHtml 등)은 node 테스트 대상이고,
  // DOM 부분(mount/unmount)은 app.js가 #dash-root를 넘겨 부른다. 새 판정 로직은 만들지 않고 logic.js 함수를 조합한다.
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const dash = {};
  const esc = logic.esc;

  dash.WINDOW_DAYS = 365;
  dash.URGENT_DAYS = 182;                                          // computeUrgency와 같은 경계(≤182 빨강, 그 뒤 주황)
  // 기간 버튼: 일수는 달력 월이 아니라 일수다(지도 색 경계와 한 기관이 다르게 분류되지 않게). 기본 6개월.
  dash.WINDOWS = { '3': 91, '6': 182, '12': 365, 'all': Infinity };
  dash.WINDOW_KEYS = ['3', '6', '12', 'all'];
  dash.WINDOW_LABELS = { '3': '3개월', '6': '6개월', '12': '1년', 'all': '전체' };
  dash.DEFAULT_WINDOW = '6';
  dash.windowKey = function (k) { return dash.WINDOW_KEYS.indexOf(k) >= 0 ? k : dash.DEFAULT_WINDOW; };
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
  // 화면 글자: 약정 만료 기준 추정은 logic.formatBidDateLabel과 같은 말('추정·약정 만료 기준')로 구분한다. 나머지는 확정/추정.
  function bidLabel(e) {
    return e.basis === 'expiry' && e.confidence !== '확정' ? '(추정·약정 만료 기준)' : logic.confidenceLabel(e.confidence);
  }
  function byDaysName(a, b) { return a.days - b.days || (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)); }

  // list(서버 병합 목록) → 기관 단위로 중복 제거한 뒤 1년 안(upcoming)·1년 뒤(later)·경과(overdue)·날짜 미상 집계.
  // 0일(D-day)은 1년 안에 든다. 정렬: 1년 안·1년 뒤는 남은 일수 → 기관명, 경과는 overdueSummary 순서(최근에 지난 순).
  // later는 기간 '전체'의 목록을 위해 들고 있다(beyondN = later.length). 날짜는 logic.effectiveBid 결과만 쓴다.
  dash.model = function (list, today) {
    const src = list || [];
    const deduped = logic.dedupeByInstitution(src);
    const ov = logic.overdueSummary(src, today);
    const upcoming = [], later = [];
    let confirmedN = 0, underReviewN = 0, maxUpdated = '';
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
      const item = { key: logic.instKey(r), rec: r, name: r.name || '', region: r.region || '', date: e.date, days: d,
        confidence: e.confidence, label: bidLabel(e), basis: e.basis || '', check: check,
        band: d <= dash.URGENT_DAYS ? 'urgent' : 'soon', overdue: false };
      (d > dash.WINDOW_DAYS ? later : upcoming).push(item);
    });
    upcoming.sort(byDaysName);
    later.sort(byDaysName);
    const overdue = ov.items.map(function (it) {
      return { key: logic.instKey(it.rec), rec: it.rec, name: it.name, region: it.region, date: it.date, days: it.days,
        confidence: logic.effectiveBid(it.rec).confidence, label: bidLabel(logic.effectiveBid(it.rec)),
        basis: logic.effectiveBid(it.rec).basis || '', check: it.check, band: 'overdue', overdue: true };
    });
    const expiryN = upcoming.filter(function (u) { return u.basis === 'expiry'; }).length;
    return { upcoming: upcoming, later: later, overdue: overdue, unknownN: ov.unknown, beyondN: later.length, expiryN: expiryN,
      total: deduped.length, confirmedN: confirmedN, underReviewN: underReviewN, maxUpdated: maxUpdated };
  };

  // 기간 안(오늘~일수 포함) 목록. 1년 안과 1년 뒤를 이어 붙여 가까운 순을 유지한다. 'all'은 날짜를 아는 미래 전부.
  dash.windowItems = function (m, key) {
    const limit = dash.WINDOWS[dash.windowKey(key)];
    return m.upcoming.concat(m.later || []).filter(function (it) { return it.days <= limit; });
  };

  // 기간 밖의 다음 구간 안내. '3'·'6' → 기간 뒤 1년 안 수(다음 '12'), '12' → 1년 뒤 수(다음 'all'), 'all' → null. 0곳이면 null.
  // f({q,region,type})를 주면 목록과 같은 조건으로 센다.
  dash.moreHint = function (m, key, f) {
    const k = dash.windowKey(key);
    if (k === 'all') return null;
    const pool = (f ? dash.filterItems(m.upcoming.concat(m.later || []), f) : m.upcoming.concat(m.later || []));
    const limit = dash.WINDOWS[k];
    const n = k === '12' ? pool.filter(function (it) { return it.days > dash.WINDOW_DAYS; }).length
      : pool.filter(function (it) { return it.days > limit && it.days <= dash.WINDOW_DAYS; }).length;
    if (!n) return null;
    return k === '12' ? { n: n, next: 'all', text: '1년 뒤에 ' + n + '곳이 더 있습니다.', button: '전체 보기' }
      : { n: n, next: '12', text: dash.WINDOW_LABELS[k] + ' 뒤 1년 안에 ' + n + '곳이 더 있습니다.', button: '1년으로 넓히기' };
  };

  // 지금 목록에 실제로 보이는 기관 key들: 기간 안 + (경과 묶음이 펼쳐져 있을 때만) 경과. f 조건은 둘 다에 건다.
  dash.visibleKeys = function (m, key, f, pastOpen) {
    const items = dash.filterItems(dash.windowItems(m, key), f || {}).concat(pastOpen ? dash.filterItems(m.overdue, f || {}) : []);
    return items.map(function (it) { return it.key; });
  };

  dash.moreHintHtml = function (h) {
    if (!h) return '';
    return '<div class="db-hint"><span>' + esc(h.text) + '</span><button type="button" id="db-widen" data-win="' + esc(h.next) + '">' + esc(h.button) + '</button></div>';
  };

  // 월별 입찰 예정 막대(D1). 이번 달부터 (오늘+365일)이 든 달까지 13칸(달력 월).
  // 칸마다 6개월 안(u)·6개월~1년(s) × 확정(f)·추정(e) 4종을 센다. denom = max(4, 최대 칸 수) — 1곳짜리 달이 꽉 찬 막대로 보이지 않게.
  dash.BAR_MAX_PX = 110;
  dash.monthBuckets = function (m, today) {
    const t0 = today.getFullYear() * 12 + today.getMonth();
    const cols = [];
    for (let i = 0; i < 13; i += 1) {
      const idx = t0 + i;
      cols.push({ y: Math.floor(idx / 12), mo: idx % 12 + 1, uf: 0, ue: 0, sf: 0, se: 0, n: 0 });
    }
    let total = 0;
    m.upcoming.forEach(function (it) {
      const p = String(it.date).split('-');
      const i = Number(p[0]) * 12 + Number(p[1]) - 1 - t0;
      if (!(i >= 0 && i < 13)) return;
      const c = cols[i], urgent = it.days <= dash.URGENT_DAYS, conf = it.confidence === '확정';
      c[(urgent ? 'u' : 's') + (conf ? 'f' : 'e')] += 1;
      c.n += 1; total += 1;
    });
    let max = 0;
    cols.forEach(function (c) { if (c.n > max) max = c.n; });
    return { cols: cols, total: total, max: max, denom: Math.max(4, max) };
  };
  // 막대 한 층의 높이(px). 0이면 0, 있으면 최소 10px.
  dash.barPx = function (n, denom) {
    return n > 0 ? Math.max(10, Math.round(n / Math.max(1, denom) * dash.BAR_MAX_PX)) : 0;
  };
  // 오늘 선·기간 창의 가로 위치(%, 13칸 기준). 한 칸 안은 (일-1)/그 달 일수.
  function posPct(date, t0) {
    const dim = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const col = date.getFullYear() * 12 + date.getMonth() - t0;
    return Math.max(0, Math.min(100, (col + (date.getDate() - 1) / dim) / 13 * 100));
  }
  dash.windowSpan = function (today, key) {
    const t0 = today.getFullYear() * 12 + today.getMonth();
    const from = posPct(today, t0), k = dash.windowKey(key);
    if (k === 'all') return { from: from, to: 100 };
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dash.WINDOWS[k]);
    return { from: from, to: posPct(end, t0) };
  };

  // 접근성 이름: 0이 아닌 달 전부와 확정/추정 합계. 해가 바뀌는 달과 첫 칸에만 연도를 붙인다. 기관명은 들어가지 않는다.
  dash.chartLabel = function (mb) {
    let lastY = null, conf = 0, est = 0;
    const parts = [];
    mb.cols.forEach(function (c) {
      conf += c.uf + c.sf; est += c.ue + c.se;
      if (!c.n) return;
      parts.push((lastY !== c.y ? c.y + '년 ' : '') + c.mo + '월 ' + c.n + '곳');
      lastY = c.y;
    });
    return '앞으로 1년 월별 입찰 예정 ' + mb.total + '곳' + (parts.length ? ': ' + parts.join(', ') : '') + '. 확정 ' + conf + '곳, 추정 ' + est + '곳';
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

  // 제안 진행 단계(D2). prep.js 단계 막대 5칸과 같은 말. gate = 승인을 기다리는 단계(주황 + '대기').
  // state_cd → 단계: CONFIRMED / OPEN_PENDING / IN_PROGRESS / APPROVAL_PENDING / WRITABLE·WRITING. CANCELLED는 뺀다.
  // 모르는 state_cd는 사전준비로 센다(progressCount가 취소 아닌 건을 모두 센 것과 합계를 맞춘다).
  // 같은 기관은 한 번만 센다 — 건이 여러 개면 더 나아간 단계 쪽. overview에만 있는 미완료·실행 중 기관은 제안서 작성에 더한다.
  dash.STAGES = [
    { key: 'confirmed', label: '제안 확정', gate: false },
    { key: 'openPending', label: '개설 승인 대기', gate: true },
    { key: 'inProgress', label: '사전준비', gate: false },
    { key: 'approvalPending', label: '기획승인 대기', gate: true },
    { key: 'writing', label: '제안서 작성', gate: false }];
  const STAGE_OF = { CONFIRMED: 0, OPEN_PENDING: 1, IN_PROGRESS: 2, APPROVAL_PENDING: 3, WRITABLE: 4, WRITING: 4 };
  // preps·overview 모두 null이면 null. preps가 null이면(권한 밖) 제안서 작성 한 줄만(onlyWriting).
  dash.stageCounts = function (preps, overview) {
    const havePreps = Array.isArray(preps);
    const items = Array.isArray(overview) ? overview : (overview && overview.items);
    const haveOv = Array.isArray(items);
    if (!havePreps && !haveOv) return null;
    const best = {}, counts = [0, 0, 0, 0, 0];
    if (havePreps) {
      dash.activePreps(preps).forEach(function (p) {
        const id = instId(p); if (!id) return;
        const s = Object.prototype.hasOwnProperty.call(STAGE_OF, p.state_cd || p.stateCd) ? STAGE_OF[p.state_cd || p.stateCd] : 2;
        if (best[id] === undefined || s > best[id]) best[id] = s;
      });
      Object.keys(best).forEach(function (id) { counts[best[id]] += 1; });
    }
    if (haveOv) {
      const seen = {};
      items.forEach(function (it) {
        const id = instId(it);
        if (id && !it.done && (it.state || 'NONE') !== 'NONE' && best[id] === undefined && !seen[id]) { seen[id] = true; counts[4] += 1; }
      });
    }
    const stages = dash.STAGES.map(function (s, i) { return { key: s.key, label: s.label, gate: s.gate, n: counts[i] }; });
    return { stages: stages, total: counts.reduce(function (a, b) { return a + b; }, 0), onlyWriting: !havePreps };
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

  // D1 월별 입찰 예정 — 화면 맨 위 전체 폭. 경과 칸 | 13개월 막대 | 1년 뒤 칸 | 날짜 미상 칸 + 범례.
  // 확정은 채운 막대, 추정은 45° 빗금(약정 만료 기준 추정도 빗금이고 범례 문구로만 구분), 6개월 안 막대는 ▲.
  // today(Date)·key(기간 버튼 값)를 받는다. 막대 기둥은 포커스 대상이 아니다.
  function toolIcon(name) { return (root.render && root.render.ICONS && root.render.ICONS[name]) || ''; }
  dash.timelineHtml = function (m, today, key) {
    const k = dash.windowKey(key), mb = dash.monthBuckets(m, today), span = dash.windowSpan(today, k);
    const urgentN = m.upcoming.filter(function (u) { return u.days <= dash.URGENT_DAYS; }).length;
    let cols = '', axis = '';
    mb.cols.forEach(function (c, i) {
      const segs = [['u f', c.uf], ['u', c.ue], ['s f', c.sf], ['s', c.se]];
      let bar = '', h = 0;
      segs.forEach(function (s) {
        const px = dash.barPx(s[1], mb.denom);
        if (px) { bar += '<i class="seg ' + s[0] + '" style="height:' + px + 'px"></i>'; h += px; }
      });
      const up = c.uf + c.ue > 0 ? '<span class="up">' + toolIcon('up') + '</span>' : '';
      cols += '<div class="db-col">' + (c.n ? '<span class="c">' + up + c.n + '</span><div class="db-bar" style="height:' + h + 'px">' + bar + '</div>' : '') + '</div>';
      const yr = c.mo === 1;
      axis += '<span' + (yr ? ' class="y"' : '') + '>' + (yr ? '<span class="yf">' + c.y + '</span><span class="ys">' + String(c.y).slice(2) + '</span>년 ' : '') + c.mo + '월</span>';
    });
    const todayLbl = '오늘 ' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const chart = '<div class="db-chart" id="db-chart" role="img" aria-label="' + esc(dash.chartLabel(mb)) + '">' +
      '<div class="db-win" style="left:' + span.from.toFixed(2) + '%;width:' + Math.max(0, span.to - span.from).toFixed(2) + '%"><span>' + esc(dash.WINDOW_LABELS[k]) + '</span></div>' +
      '<div class="db-today" style="left:' + span.from.toFixed(2) + '%"><span>' + esc(todayLbl) + '</span></div>' + cols + '</div>' +
      '<div class="db-axis" aria-hidden="true">' + axis + '</div>';
    const head = '<div class="db-h"><h2 id="db-tl-h">월별 입찰 예정</h2><span class="sum">경과 <b>' + m.overdue.length + '</b>곳 · 6개월 안 <b>' + urgentN +
      '</b>곳 · 1년 안 <b>' + m.upcoming.length + '</b>곳</span><span class="meta">기준일 <b>' + esc(logic.localDateStr(today)) + '</b>' +
      (m.maxUpdated ? ' · 자료 수정 <b>' + esc(m.maxUpdated) + '</b>' : '') + ' · 조사한 기관 <b>' + m.total + '</b>곳</span></div>';
    const tiles = '<button type="button" class="db-tile ov" id="db-tile-ov"><span class="ov-stamp">D+</span><span class="n">' + m.overdue.length + '곳</span><span class="t">공고 예정일 경과</span></button>';
    const later = '<button type="button" class="db-tile later' + (k === 'all' ? ' on' : '') + '" id="db-tile-later" data-win="all" aria-pressed="' + (k === 'all' ? 'true' : 'false') + '"><span class="n">' + m.beyondN + '곳</span><span class="t">1년 뒤</span></button>';
    const unk = '<button type="button" class="db-tile unk" id="db-tomap"><span class="n">' + m.unknownN + '곳</span><span class="t">날짜 미상</span></button>';
    const exp = m.expiryN ? ' · 1년 안 약정 만료 기준 <b class="v">' + m.expiryN + '</b>곳' : '';
    const leg = '<div class="db-leg"><span><i class="seg s f"></i>공고로 확정</span>' +
      '<span><i class="seg s"></i>추정(최근 절차일+약정 주기 / 약정 만료 6개월 전 / 공고 날짜 의미 확인 중)' + exp + '</span>' +
      '<span class="lg-up">' + toolIcon('up') + ' 6개월 안</span>' +
      '<span class="lg-n">입찰일 공고로 확정 <b class="v">' + m.confirmedN + '</b>곳 · 날짜 의미 확인 중 <b class="v">' + m.underReviewN + '</b>곳</span></div>';
    return head + '<div class="db-tl-body">' + tiles + '<div class="db-chart-wrap">' + chart + '</div>' + later + unk + '</div>' + leg;
  };

  // 기간 버튼 — 네이티브 라디오 4개(←→ 이동은 브라우저 기본). 선택 값은 key.
  dash.periodHtml = function (key) {
    const k = dash.windowKey(key);
    return '<legend class="sr-only">입찰 예정일 기간</legend>' + dash.WINDOW_KEYS.map(function (w) {
      return '<label><input type="radio" name="db-per" value="' + w + '"' + (w === k ? ' checked' : '') + '><span>' + dash.WINDOW_LABELS[w] + '</span></label>';
    }).join('');
  };
  // 목록 묶음 제목(aria-live). 전체는 날짜를 아는 곳만이라는 점을 말한다.
  dash.groupLabel = function (key, n) {
    const k = dash.windowKey(key);
    return k === 'all' ? '전체: 앞으로 입찰 <b>' + n + '</b>곳(날짜를 아는 곳)' : dash.WINDOW_LABELS[k] + ' 안 <b>' + n + '</b>곳 · 가까운 순';
  };

  // D3 국민은행 금고 약정 — 와플: 칸 하나가 기관 하나. 확인 칸을 앞에, 미확인은 빈 칸.
  dash.waffleHtml = function (kb) {
    let cells = '';
    for (let i = 0; i < kb.total; i += 1) cells += '<i' + (i < kb.confirmed ? ' class="k"' : '') + '></i>';
    return '<div class="waf" role="img" aria-label="조사한 기관 ' + kb.total + '곳 중 국민은행 금고 약정을 확인한 곳 ' + kb.confirmed + '곳">' + cells + '</div>';
  };
  dash.kbCardHtml = function (kb) {
    return '<section class="db-card" aria-labelledby="db-t1"><h2 id="db-t1">국민은행 금고 약정</h2>' +
      '<p class="fig">확인 <b>' + kb.confirmed + '</b>곳 / 조사 <b>' + kb.total + '</b>곳</p>' + dash.waffleHtml(kb) +
      '<p class="lg"><span><i class="k"></i>확인</span><span><i></i>미확인</span></p>' +
      '<p class="note">약정 기록을 모으기 전이라 출처로 확인한 곳만 셉니다. 미확인은 \'아님\'이 아니라 \'아직 모름\'입니다.</p></section>';
  };

  // D2 제안 진행 단계. p = {state:'offline'|'loading'|'ok'|'denied'|'error', stages:stageCounts 결과, code:401|403|0}
  dash.stageCardHtml = function (p) {
    p = p || { state: 'offline' };
    const s = p.stages;
    let body, total = '';
    if (p.state === 'offline') body = '<p class="note">서버에 연결하면 보입니다.</p>';
    else if (p.state === 'loading') body = '<p class="note">불러오는 중입니다…</p>';
    else if (p.state === 'denied') body = '<p class="note">진행 건수를 볼 권한이 없습니다(' + esc(p.code || '') + '). 로그인 사번과 권한을 확인하세요.</p>';
    else if (p.state === 'error' || !s) body = '<p class="note">진행 건수를 불러오지 못했습니다. <button type="button" id="db-retry">다시 시도</button></p>';
    else {
      const rows = s.onlyWriting ? s.stages.filter(function (x) { return x.key === 'writing'; }) : s.stages;
      let max = 1;
      rows.forEach(function (x) { if (x.n > max) max = x.n; });
      total = '<span class="tot">합계 <b>' + s.total + '</b>건</span>';
      body = '<dl class="stg">' + rows.map(function (x) {
        const w = x.n ? '<i class="b' + (x.gate ? ' g' : '') + '" style="width:' + Math.max(4, Math.round(x.n / max * 100)) + '%"></i>' : '<i class="b z"></i>';
        return '<div class="stg-row"><dt>' + esc(x.label) + '</dt><dd><span class="bw" aria-hidden="true">' + w + '</span><b>' + x.n + '</b></dd></div>';
      }).join('') + '</dl><p class="note">' + (s.onlyWriting ? '단계별 건수는 영업팀·영업팀장·영업부장에게 보입니다.' : '같은 기관은 한 번만 셉니다.') + '</p>';
    }
    return '<section class="db-card" aria-labelledby="db-t2"><div class="db-h"><h2 id="db-t2">제안 진행 단계</h2>' + total + '</div>' + body + '</section>';
  };

  // 오른쪽 기둥(1280~1599px에서는 위로 올라가 두 칸)
  dash.railHtml = function (kb, p) { return dash.kbCardHtml(kb) + dash.stageCardHtml(p); };

  // 목록 꼬리 — 날짜 미상만 말한다('1년 뒤 n곳'은 목록 안내 줄·시간표 칸이 맡는다).
  dash.footHtml = function (m) {
    if (!m.unknownN) return '';
    return '날짜를 확인하지 못한 <b>' + m.unknownN + '</b>곳은 목록에 없습니다. <button type="button" class="db-link" id="db-tomap2">전국 지도</button>에서 볼 수 있습니다.';
  };

  // D4 약정 주기 막대. lastBid가 없으면 null(그리지 않고 dl의 '미확인' 칩을 쓴다). pct는 0~100으로 자른다.
  // 경과(D+) 기관은 꽉 찬다. est = 확정이 아니면 끝 표시가 점선. basis는 기관의 effectiveBid 근거(notice|cycle|expiry).
  dash.termBar = function (it, today) {
    const rec = it && it.rec;
    if (!rec || !rec.lastBid || !today) return null;
    const sinceLast = -logic.daysUntil(rec.lastBid, today);          // 최근 절차일부터 오늘까지 지난 일수
    const toBid = logic.daysUntil(it.date, today);                   // 오늘부터 입찰 예정일까지(경과면 음수)
    if (sinceLast === -Infinity || toBid === Infinity) return null;
    const total = sinceLast + toBid;
    const pct = toBid <= 0 ? 100 : sinceLast <= 0 ? 0 : Math.max(0, Math.min(100, sinceLast / total * 100));
    return { pct: pct, est: it.confidence !== '확정', over: toBid < 0, lastBid: rec.lastBid, date: it.date, days: toBid, basis: it.basis || '' };
  };
  dash.termBarHtml = function (it, today) {
    const t = dash.termBar(it, today);
    if (!t) return '';
    const kind = t.est ? (t.basis === 'expiry' ? '추정·약정 만료 기준' : '추정') : '확정';
    const nowTxt = t.over ? 'D+' + (-t.days) : dayText(t.days);
    const label = '최근 절차일 ' + t.lastBid + ', 오늘 ' + nowTxt + ', 입찰 예정 ' + t.date + ' ' + kind;
    return '<div class="db-sec"><h3>약정 주기</h3><div class="db-term' + (t.over ? ' over' : '') + '" role="img" aria-label="' + esc(label) + '">' +
      '<div class="trk"><div class="el ' + esc(it.band) + '" style="width:' + t.pct.toFixed(1) + '%"></div><div class="end' + (t.est ? ' est' : '') + ' ' + esc(it.band) + '"></div></div>' +
      '<div class="lab"><span>최근 절차일 <b>' + esc(t.lastBid) + '</b></span><span>오늘 <b>' + esc(nowTxt) + '</b></span><span>입찰 예정 <b>' + esc(t.date) + '</b> ' + esc(kind) + '</span></div>' +
      '</div></div>';
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
    const why = it.confidence === '확정' ? '— 공고로 확인한 날입니다'
      : it.basis === 'expiry' ? '— 약정 만료일의 6개월 전으로 추정한 날입니다(약정 만료 기준 추정)'
      : it.basis === 'notice' ? '— 공고된 날짜이나 의미 확인 중입니다'
      : '— 최근 절차일에 약정 주기를 더한 날입니다';
    const lp = lastProcNote(rec);
    const info = dash.termBarHtml(it, c.today) + '<div class="db-sec"><h3>기관 정보</h3><dl class="db-dl">' +
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
  const st = { sel: '', q: '', region: '', type: '', win: dash.DEFAULT_WINDOW, pastOpen: true, confirm: false, busy: false, flash: '', err: '',
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
  function allItems() { return M ? M.upcoming.concat(M.later || [], M.overdue) : []; }
  function findItem(key) { return allItems().filter(function (it) { return it.key === key; })[0] || null; }
  function activeFor(rec) {
    const id = rec && rec.institutionId;
    return id ? dash.activePreps(st.preps).filter(function (p) { return instId(p) === id; })[0] || null : null;
  }

  function progressState() {
    if (!serverMode() || !hasEmp()) return { state: 'offline' };
    if (st.prepSt === 'loading' || st.ovSt === 'loading') return { state: 'loading' };
    const okP = st.prepSt === 'ok', okO = st.ovSt === 'ok';
    if (okP || okO) return { state: 'ok', count: dash.progressCount(okP ? st.preps : null, okO ? st.overview : null),
      stages: dash.stageCounts(okP ? st.preps : null, okO ? st.overview : null) };
    const code = st.ovCode || st.prepCode;
    if (code === 401 || code === 403) return { state: 'denied', code: code };
    return { state: 'error' };
  }

  // 위 시간표(D1)와 오른쪽 기둥(D3·D2). 기간 버튼이 바뀌면 시간표의 기간 창도 다시 그린다.
  function renderStrip() {
    const el = $('db-tl');
    if (el) el.innerHTML = dash.timelineHtml(M, todayDate(), st.win);
    const rail = $('db-rail');
    if (rail) rail.innerHTML = dash.railHtml(dash.kbCount(LIST, root.KB_VERIFIED), progressState());
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
    const inWin = dash.windowItems(M, st.win);
    const up = dash.filterItems(inWin, f), past = dash.filterItems(M.overdue, f);
    const filtered = !!(st.q.trim() || st.region || st.type);
    const grp = $('db-g1');
    if (grp) grp.innerHTML = dash.groupLabel(st.win, up.length);
    let h = '';
    if (up.length) h += '<ul role="listbox" id="db-lb" tabindex="0" aria-labelledby="db-g1">' + optionsFor(up, 'db-o-') + '</ul>';
    else if (filtered && inWin.length) h += '<p class="db-state">조건에 맞는 기관이 없습니다. 검색어를 지우거나 지역을 \'전체 지역\'으로 바꾸세요.<br><button type="button" id="db-clear">조건 지우기</button></p>';
    else h += '<p class="db-state">' + (st.win === 'all' ? '앞으로 입찰 예정인 기관이 없습니다.' : esc(dash.WINDOW_LABELS[st.win]) + ' 안에 입찰 예정인 기관이 없습니다.') + ' 예정일이 지난 기관은 아래 [공고 예정일 경과]에서 봅니다.</p>';
    h += dash.moreHintHtml(dash.moreHint(M, st.win, filtered ? f : null));
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
    if (!it) { el.removeAttribute('aria-labelledby'); el.setAttribute('aria-label', '기관 상세'); el.innerHTML = dash.blankHtml(); return; }
    el.removeAttribute('aria-label'); el.setAttribute('aria-labelledby', 'db-name');
    const actives = dash.activePreps(st.preps);
    const ctx = { serverMode: serverMode() && hasEmp(), role: role(), session: root.store.loadSession && root.store.loadSession() };
    const act = dash.actionKind(it.rec, ctx, actives, root.prep);
    el.innerHTML = dash.paneHtml(it, { act: act, confirm: st.confirm && act === 'confirm', busy: st.busy,
      kb: dash.kbEntry(it.rec, root.KB_VERIFIED), role: ctx.role, today: todayDate() });
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
    markSelected(); renderPane();
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
    '<div id="db-flash" class="db-flash" role="status"></div><div id="db-err" class="db-state db-banner" role="alert" style="display:none"></div>' +
    '<section class="pnl db-tl" id="db-tl" aria-labelledby="db-tl-h"></section>' +
    '<div class="db-work"><section class="db-list" aria-labelledby="db-lt"><div class="db-list-head"><div class="db-h"><h2 id="db-lt">다가오는 입찰</h2></div>' +
    '<fieldset class="db-per" id="db-per"></fieldset><div class="db-filters" id="db-filters">' +
    '<input id="db-q" type="search" placeholder="기관명 검색" aria-label="기관명 검색"><select id="db-region" aria-label="지역"></select>' +
    '<select id="db-type" aria-label="기관 종류" style="display:none"></select></div></div>' +
    '<div class="db-grp" id="db-g1" aria-live="polite"></div>' +
    '<div class="db-scroll" id="db-scroll" aria-busy="true"><p class="db-state" aria-busy="true">기관 목록을 불러오는 중입니다…</p></div>' +
    '<div class="db-foot" id="db-foot"></div></section>' +
    '<section class="db-pane" id="db-pane" aria-labelledby="db-name"></section>' +
    '<div class="db-rail" id="db-rail" tabindex="-1"></div></div></section>';

  // 기간을 바꾼다. 선택한 기관이 보이는 목록에서 빠지면 선택을 풀어 상세와 목록이 어긋나지 않게 한다.
  function setWindow(k, save) {
    const w = dash.windowKey(k);
    st.win = w;
    if (save && root.store && root.store.saveDashWindow) root.store.saveDashWindow(w);
    const per = $('db-per');
    if (per) per.querySelectorAll('input').forEach(function (r) { r.checked = r.value === w; });
    if (!M) return;
    pruneSelection();
    renderStrip(); renderList();
  }

  // 선택한 기관이 지금 보이는 목록(기간 안 + 펼친 경과 묶음)에 없으면 선택을 풀어 listbox와 상세가 어긋나지 않게 한다.
  function pruneSelection() {
    if (!M || !st.sel) return;
    const f = { q: st.q, region: st.region, type: st.type };
    const vis = dash.visibleKeys(M, st.win, f, st.pastOpen);
    if (vis.indexOf(st.sel) < 0) { st.sel = ''; st.confirm = false; renderPane(); }
  }

  // 경과 칸: 경과 묶음을 펼치고 그 목록으로 포커스·스크롤한다(목록 아래 첫 화면 밖에 있을 수 있어서).
  function showPast() {
    st.pastOpen = true;
    renderList();
    const lb = $('db-pastlist') || $('db-past');
    if (lb) { if (lb.scrollIntoView) lb.scrollIntoView({ block: 'nearest' }); lb.focus(); }
  }

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
    if (st.sel && !M.upcoming.concat(M.later, M.overdue).some(function (it) { return it.key === st.sel; })) st.sel = '';   // 데이터가 바뀌어 사라진 기관
    else if (st.sel && dash.visibleKeys(M, st.win, { q: st.q, region: st.region, type: st.type }, st.pastOpen).indexOf(st.sel) < 0) st.sel = '';   // 저장된 기간 밖
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
      case 'db-past': st.pastOpen = !st.pastOpen; pruneSelection(); renderList(); { const b = $('db-past'); if (b) b.focus(); } break;
      case 'db-clear': st.q = ''; st.region = ''; st.type = ''; fillFilters(); renderList(); { const q = $('db-q'); if (q) q.focus(); } break;
      case 'db-cf': st.confirm = true; renderPane(); break;
      case 'db-cancel': st.confirm = false; renderPane(); { const b = $('db-cf'); if (b) b.focus(); } break;
      case 'db-do': doConfirm(); break;
      case 'db-open': { const it = findItem(st.sel); const p = it && activeFor(it.rec); if (!goPrep(p)) flash('사전준비 화면을 열지 못했습니다. 메뉴의 [제안서 사전준비 프로세스]에서 여세요.', true); break; }
      // 눌린 버튼은 다시 그려져 사라진다 — 포커스를 같은 뜻의 새 요소로 돌려 키보드 사용자가 맥락을 잃지 않게 한다.
      case 'db-widen': { setWindow(btn.getAttribute('data-win'), true); const r = host.querySelector('#db-per input:checked'); if (r) r.focus(); break; }
      case 'db-tile-later': { setWindow(btn.getAttribute('data-win'), true); const t = $('db-tile-later'); if (t) t.focus(); break; }
      case 'db-tile-ov': showPast(); break;
      case 'db-map': case 'db-tomap': case 'db-tomap2': { const m = document.getElementById('tab-btn-map'); if (m) m.click(); break; }
      case 'db-retry': { const rl = $('db-rail'); loadProgress(); if (rl) rl.focus(); break; }
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
      else if (e.target.name === 'db-per') setWindow(e.target.value, true);
    }, opt);
    st.confirm = false; st.busy = false; st.err = ''; st.flash = '';
    st.win = dash.windowKey(root.store && root.store.loadDashWindow ? root.store.loadDashWindow() : dash.DEFAULT_WINDOW);
    const per = $('db-per');
    if (per) per.innerHTML = dash.periodHtml(st.win);
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
