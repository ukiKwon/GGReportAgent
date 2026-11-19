(function (root) {
  'use strict';
  // 입찰 현황판(NEXT 77, 재설계). 규격: handoff/agents/design-reviewer/2026-11-11_1627_a41bdf71.md(+ 1445_aba6f113.md 1단계), 시안 docs/design/2026-11-11_입찰현황판_재설계_시안.html
  // 순수 부분(model·windowItems·moreHint·monthBuckets·timelineHtml·stageCounts·termBar·railHtml·rowHtml·paneHtml 등)은 node 테스트 대상이고,
  // DOM 부분(mount/unmount)은 app.js가 #dash-root를 넘겨 부른다. 새 판정 로직은 만들지 않고 logic.js 함수를 조합한다.
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const ie = isNode ? require('./instedit.js') : root.instedit;   // 확정 날짜 옆 출처·개원 예정 줄·개원 확인 필요 목록(NEXT 72)
  const bcMod = isNode ? require('./bankcontract.js') : null;     // 금고 약정(NEXT 89). 브라우저는 root.bankcontract(index.html에서 instedit.js 뒤, dashboard.js 앞)
  function BC() { return bcMod || root.bankcontract || null; }
  const nrMod = isNode ? require('./noticerec.js') : null;           // 공고 상태 기록(2단계). 브라우저는 root.noticerec(index.html에서 dashboard.js 앞)
  function NR() { return nrMod || root.noticerec || null; }
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
      if (logic.noticeState(r, today)) return;   // 진행 중 공고는 notice 목록이 맡는다(공고일이 오늘이어도 '예정'에 이중으로 들지 않게)
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
        basis: logic.effectiveBid(it.rec).basis || '', check: it.check, kind: it.kind, noticeExpired: !!it.noticeExpired,
        band: 'overdue', overdue: true };
    });
    // 공고 진행 중(noticeSummary 순서: 마감 전 → 마감일 미확인 → 마감 지남). 경과(overdue)에는 들지 않는다.
    const nsum = logic.noticeSummary(src, today);
    const notice = nsum.items.map(function (it) {
      const rec = it.rec, e = logic.effectiveBid(rec);
      return { key: logic.instKey(rec), rec: rec, name: it.name, region: it.region, date: it.date, days: it.since, since: it.since,
        phase: it.phase, late: !!it.late, resultCheck: !!it.check, receiveFrom: it.receiveFrom, receiveTo: it.receiveTo, deadlineDays: it.deadlineDays,
        startDays: it.receiveFrom ? logic.daysUntil(it.receiveFrom, today) : null,
        confidence: e.confidence, label: bidLabel(e), basis: e.basis || '', check: logic.isDateUnderReview(rec),
        band: 'notice', overdue: false, notice: true };
    });
    const expiryN = upcoming.filter(function (u) { return u.basis === 'expiry'; }).length;
    return { upcoming: upcoming, later: later, overdue: overdue, notice: notice,
      noticeN: { receiving: nsum.receiving, unknown: nsum.unknown, awaiting: nsum.awaiting, late: nsum.late, check: nsum.check },
      unknownN: ov.unknown, beyondN: later.length, expiryN: expiryN,
      total: deduped.length, confirmedN: confirmedN, underReviewN: underReviewN, maxUpdated: maxUpdated };
  };

  // 처음 열 때 고를 기관: 마감 전 공고 중 마감이 가장 가까운 곳 → 기간 창 첫 행 → 없음(''). f 조건을 함께 건다. 포커스는 옮기지 않는다(호출부).
  dash.autoSelectKey = function (m, key, f) {
    const fl = f || {};
    const r = dash.filterItems((m.notice || []).filter(function (it) { return it.phase === 'receiving'; }), fl)[0];
    if (r) return r.key;
    const w = dash.filterItems(dash.windowItems(m, key), fl)[0];
    return w ? w.key : '';
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
  // tab: 'ov' = [공고 예정일 경과] 탭(경과 기관만), 'up' = [다가오는 입찰] 탭(공고 진행 중 + 기간 창). true는 옛 호출(둘 다 — 시험이 쓴다), false·생략 = 'up'과 같다.
  dash.visibleKeys = function (m, key, f, tab) {
    const fl = f || {};
    const keys = function (items) { return items.map(function (it) { return it.key; }); };
    if (tab === 'ov') return keys(dash.filterItems(m.overdue, fl));
    // 공고 진행 중 묶음은 접히지 않는다 — 기간 창과 상관없이 [다가오는 입찰] 탭에 항상 있다.
    return keys(dash.filterItems(m.notice || [], fl).concat(dash.filterItems(dash.windowItems(m, key), fl),
      tab === true ? dash.filterItems(m.overdue, fl) : []));
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
  // 종류 표시는 정본 6종(logic.kindOf) — 지방공기업·공기업 같은 옛·세부 이름은 접는다(교육청은 11-15부터 따로). 모르는 이름은 그대로.
  dash.kindOfRec = function (rec) { return logic.kindOf(rec && rec.type) || (rec && rec.type) || ''; };
  dash.typeOptions = function (list) {
    const seen = {}, out = [];
    logic.dedupeByInstitution(list || []).forEach(function (r) {
      const t = dash.kindOfRec(r);
      if (t && !seen[t]) { seen[t] = true; out.push(t); }
    });
    const rank = function (t) { const i = logic.TYPE_KINDS.indexOf(t); return i < 0 ? 99 : i; };
    return out.sort(function (a, b) { return rank(a) - rank(b) || (a < b ? -1 : (a > b ? 1 : 0)); });
  };
  // 종류가 2개 이상일 때만 <select>를 그린다(지자체 외 기관이 합쳐져 지금은 보인다).
  dash.showTypeFilter = function (list) { return dash.typeOptions(list).length >= 2; };

  dash.filterItems = function (items, f) {
    const q = String((f && f.q) || '').trim().toLowerCase(), region = (f && f.region) || '', type = (f && f.type) || '';
    return items.filter(function (it) {
      return (!q || it.name.toLowerCase().indexOf(q) >= 0) && (!region || it.region === region) && (!type || dash.kindOfRec(it.rec) === type);
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
    // 카드 제목이 '국민은행 금고 약정'이라 분모는 지자체만 센다(법원 공탁금·교육청·공공기관 등 비지자체 168곳 제외, qa 11-12 M2).
    const set = dash.kbKeys(verifiedKeys), deduped = logic.dedupeByInstitution(list || [])
      .filter(function (r) { return logic.kindOf(r.type) === '지자체'; });
    let c = 0;
    deduped.forEach(function (r) { if (Object.prototype.hasOwnProperty.call(set, logic.instKey(r))) c += 1; });
    return { confirmed: c, unconfirmed: deduped.length - c, total: deduped.length };
  };
  dash.kbEntry = function (rec, verifiedKeys) {
    const set = dash.kbKeys(verifiedKeys), k = logic.instKey(rec);
    return Object.prototype.hasOwnProperty.call(set, k) && typeof set[k] === 'object' ? set[k] : null;
  };
  // 국민은행이 맡은 기관 판정(입찰 현황판). 종류별로 켜고 끄는 값은 이 한 곳(OURS_SCOPE)뿐이다 — data-auditor 11-16:
  //  muni = 행안부 2026.1.1. 기준 금고 지정(KB_VERIFIED), next = 2027년부터 맡기로 선정된 곳(KB_NEXT, 지금은 다른 은행),
  //  court = 법원 '공탁금 보관은행' 칸, public = 공공기관 '주거래은행' 칸. 사용자 11-16: 모두 켠다.
  //  법원·공공기관의 bank='국민은행'은 뜻이 서로 다르다(공탁금 보관 / 주거래). 차기 선정만 된 곳은 KB_NEXT로 먼저 가려내므로 현재 은행 칸과 섞이지 않는다.
  // (코드 주석에서만 '우리'라는 말을 쓴다 — 화면 글은 '국민은행이 맡은 기관'. 낙찰 은행 '우리은행'과 헷갈리지 않게.)
  dash.OURS_SCOPE = { muni: true, next: true, court: true, public: true };
  // nextList = root.KB_NEXT를 호출자가 넘긴다(생략하면 '2027년부터' 판정을 하지 않는다 — 순수 시험이 전역 자료에 기대지 않게).
  dash.oursKind = function (rec, verifiedKeys, nextList) {
    if (!rec) return '';
    const k0 = logic.instKey(rec);
    if (Object.prototype.hasOwnProperty.call(dash.kbKeys(verifiedKeys), k0)) return 'muni';
    if (nextList && Object.prototype.hasOwnProperty.call(dash.kbKeys(nextList), k0)) return 'next';
    if (rec.bank !== '국민은행') return '';
    const k = logic.kindOf(rec.type);
    return k === '법원' ? 'court' : (k === '공공기관' ? 'public' : '');
  };
  dash.isOurs = function (rec, verifiedKeys, scope, nextList) {
    const k = dash.oursKind(rec, verifiedKeys, nextList), s = scope || dash.OURS_SCOPE;
    return !!k && !!s[k];
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
    { key: 'approvalPending', label: '사전준비 승인 대기', gate: true },
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
  // state_cd → 단계 번호(모르는 값은 사전준비 2). kbboard의 '준비 중인 제안' 목록이 stageCounts와 같은 합계를 내도록 같은 표를 쓴다.
  dash.stageOf = function (cd) { return Object.prototype.hasOwnProperty.call(STAGE_OF, cd) ? STAGE_OF[cd] : 2; };

  // 현황판·지도 상세 팝업 공용 버튼 규칙: root.prep.popoverAction이 정한다. 반환 모양이 문자열이든 {kind|action|type}이든 받는다.
  // [제안 확정]·[사전준비 열기] 판정에 넘길 맥락 — prep.popoverEligible이 account·master를 본다.
  // 11-13: 현황판이 account를 넘기지 않아 [제안 확정]이 늘 숨던 문제를 바로잡음.
  function actCtx() {
    const ses = (function () { try { return root.store && root.store.loadSession && root.store.loadSession(); } catch (e) { return null; } })();
    const acc = !!(ses && ses.mode === 'account' && ses.emp);
    return { serverMode: serverMode() && hasEmp(), role: role(), session: ses, account: acc,
      master: !!(acc && root.login && ses.id === root.login.MASTER_ID) };
  }
  // ── 올해 목표 기관 집합(사용자 11-19 Q2: 올해 목표 기관은 공고 전에도 [제안 확정]) ──
  // kbboard가 받은 GET /bid-targets 응답을 setGoals로 넘기거나, 없으면 loadGoals가 직접 받는다. 올해(오늘 연도) 응답만 담는다.
  const goalSt = { year: 0, ids: null, st: 'idle', seq: 0 };
  dash.setGoals = function (data, today) {   // data = { year, items:[{institution_id}] }. 담았으면 true
    const y = (today || todayDate()).getFullYear();
    if (!data || Number(data.year) !== y || !Array.isArray(data.items)) return false;
    const ids = {};
    data.items.forEach(function (t) { const id = String(instId(t)); if (id) ids[id] = true; });   // watch_items는 읽지 않는다 — 관심 기관은 규칙 밖
    goalSt.year = y; goalSt.ids = ids; goalSt.st = 'ok';
    return true;
  };
  dash.clearGoals = function () { goalSt.seq += 1; goalSt.year = 0; goalSt.ids = null; goalSt.st = 'idle'; };
  dash.loadGoals = function () {
    if (!serverMode() || !hasEmp()) { dash.clearGoals(); return Promise.resolve(); }
    const y = todayDate().getFullYear(), my = ++goalSt.seq;
    if (!goalSt.ids) goalSt.st = 'loading';
    return fetchJson('/bid-targets?year=' + encodeURIComponent(y)).then(function (r) {
      if (my !== goalSt.seq) return;
      if (r.status === 'ok' && dash.setGoals(r.data)) return;
      goalSt.ids = null; goalSt.year = 0; goalSt.st = r.status === 'ok' ? 'error' : r.status;   // 못 받으면 지금 규칙 그대로(공고 뒤에만)
    });
  };
  // 순수: 올해 목표 기관인가. goals = { year, ids }.
  dash.isGoalRec = function (rec, goals, today) {
    const t = today || todayDate();
    return !!(goals && goals.ids && Number(goals.year) === t.getFullYear() && goals.ids[String(instId(rec))]);
  };
  // [제안 확정] 노출 규칙(사용자 11-17 결정 '공고 난 뒤에만') — 한 곳. o = { today: Date, snap: 공고 상태 기록 snap|null }.
  // 담당자 기록이 있으면 기록이 먼저다: 공고 진행 중 → 보임 / 공고 종료·입찰 없음·지연·재공고 대기 → 안 보임.
  // 기록이 없으면 날짜로 본다: 공고(noticeState)가 진행 중이면서 접수 마감 전, 마감일을 모르면 공고 후 30일 이내만 보인다.
  // → 'confirm' | 'closed' | 'nobid' | 'delayed' | 'past'(접수 마감이 지났거나 마감일 모름·공고 후 30일 초과) | 'later'(공고가 아직 없다)
  // 예외(사용자 11-19): o.goals = { year, ids }에 든 올해 목표 기관은 공고가 아직 없어도('later') 'confirm'. 관심·다른 해 목표·목표 아님은 그대로.
  // 입찰 없음·종료·지연·접수 기간 지남은 목표 기관이어도 막는다.
  dash.proposeGate = function (rec, o) {
    const today = (o && o.today) || todayDate();
    const snap = (o && o.snap) || null;
    // 다음 확인일이 지난 '지연·재공고 대기'는 logic.recordView가 미처리(pending)로 되돌린다 — 같은 기준으로 기록 없음으로 보고 날짜 규칙으로 간다.
    const rv = snap ? logic.recordView(rec, snap, logic.localDateStr(today)) : null;
    const item = rv && rv.view !== 'pending' ? rv.item : null;
    const cd = item ? item.status_cd : '';
    const ns = logic.noticeState(rec, today);
    // '공고 진행 중' 기록도 날짜상 공고가 없으면(공고 후 120일 넘김 등) 낡은 기록으로 보고 무시한다 — 날짜 규칙으로 간다.
    if (cd === 'IN_PROGRESS' && ns) return 'confirm';
    if (cd === 'CLOSED') return 'closed';
    if (cd === 'NO_BID') return 'nobid';
    if (cd === 'DELAYED') return 'delayed';
    if (ns && (ns.phase === 'receiving' || (ns.phase === 'unknown' && !ns.late))) return 'confirm';
    if (ns && ns.check) return 'past';
    return dash.isGoalRec(rec, o && o.goals, today) ? 'confirm' : 'later';
  };
  // 순수: 이 'confirm'이 '공고 전 목표 기관 예외' 때문인가(안내 한 줄을 붙일지 정한다).
  dash.proposeEarly = function (rec, o) {
    return dash.proposeGate(rec, o) === 'confirm' && dash.proposeGate(rec, Object.assign({}, o, { goals: null })) === 'later';
  };
  // 버튼이 없을 때 db-why 한 줄(actHtml이 쓴다)
  dash.EARLY_WHY = '올해 목표 기관이라 공고 전에도 영업부서가 제안 확정할 수 있습니다.';
  dash.CONFIRM_WHY = {
    later: '입찰 공고가 나면 [제안 확정]을 쓸 수 있습니다.',
    closed: '이번 회차 공고가 끝났습니다.',
    past: "접수 기간이 지난 것으로 봅니다. 아직 접수 중이면 공고 상태를 '공고 진행 중'으로 기록하세요.",
    nobid: "이번 회차는 '입찰 없음'으로 닫혔습니다.",
    delayed: '공고가 늦어지거나 재공고를 기다리는 중입니다.' };
  // o를 넘기면(화면 호출) 노출 규칙을 건다. 안 넘기면(순수 시험) 역할·진행 중 사전준비만 본다.
  // o.wait = 공고 상태 기록을 받는 중 → 'wait'(받기 전에 보였다 사라지지 않게).
  dash.actionKind = function (rec, ctx, actives, prepApi, o) {
    if (!prepApi || typeof prepApi.popoverAction !== 'function' || !ctx || !ctx.serverMode) return 'unavailable';
    let r;
    try { r = prepApi.popoverAction(rec, ctx, actives || []); } catch (e) { return 'unavailable'; }
    const k = typeof r === 'string' ? r : (r && (r.kind || r.action || r.type)) || '';
    if (/open|열기/i.test(k)) return 'open';
    if (/confirm|확정/i.test(k)) {
      if (!o) return 'confirm';
      return o.wait ? 'wait' : dash.proposeGate(rec, o);
    }
    return 'none';
  };
  // 화면(상세 칸·지도 팝업)이 actionKind에 넘기는 값
  function gateOpts() {
    const n = NR();
    // goals를 아직 못 받았고 받는 중이면 wait — 공고 전 목표 기관의 [제안 확정]이 늦게 나타나 깜빡이는 것을 줄인다(못 받으면 지금 규칙)
    return { today: todayDate(), snap: curSnap(), wait: !!(n && n.state && n.state() === 'loading') || (goalSt.st === 'loading' && !goalSt.ids),
      goals: { year: goalSt.year, ids: goalSt.ids } };
  }

  // ── 순수: HTML 조각(사용자·서버 값은 전부 esc) ─────────────────────
  function mono(s) { return '<span class="v">' + esc(s) + '</span>'; }
  function chip() { return '<span class="pop-unk">미확인</span>'; }
  function dayText(days) { return days === 0 ? 'D-day' : 'D-' + days; }
  // 경과 행 안내: 실제 뜬 공고(확정)의 날짜가 지났으면 공고는 이미 났고 결과를 기다리는 중이다(9f·qa 11-12 —
  // contractEnd=공고일 규칙이라 진행 중 공고가 경과로 잡힌다). 추정 날짜가 지났으면 공고 여부부터 확인.
  // 120일을 넘긴 확정 공고(noticeExpired)는 '진행 중'이 아니라 '공고 후 n일 · 결과 공고를 확인하세요'이다('날짜 의미 확인 중'이어도 확정이면 같은 문구,
  // 꼬리표는 chkHtml이 붙인다). 문구는 logic.NOTICE_WORDS 한 곳. 추정 날짜 경과만 공고가 났는지부터 확인한다.
  dash.overdueNote = function (it) {
    const expired = it.noticeExpired !== undefined ? it.noticeExpired : it.kind === 'fixed';
    return expired ? logic.NOTICE_WORDS.expiredNote(it.days) : '공고가 났는지 확인이 필요합니다';
  };
  function chkHtml(it) { return it.check ? ' <span class="db-chk">날짜 의미 확인 중</span>' : ''; }

  // ── 공고 상태 기록(2단계): 행·상세·현황판이 같은 판정(logic.recordView)을 쓴다. snap을 안 넘기면 noticerec의 지금 값, 없으면 전부 미처리 ──
  function curSnap() { const n = NR(); return n && n.snap ? n.snap() : null; }
  dash.recView = function (it, snap) {
    return logic.recordView(it && it.rec, snap === undefined ? curSnap() : snap, logic.localDateStr(todayDate()));
  };
  dash.isUnhandled = function (it, snap) { return !!(it && it.overdue) && dash.recView(it, snap).view === 'pending'; };
  dash.recTagHtml = function (rv) {
    const parts = logic.recordBrief(rv);
    if (!parts) return '';
    return '<span class="db-rec-tag">' + parts.map(function (s) { return s[1] ? '<span class="d">' + esc(s[0]) + '</span>' : esc(s[0]); }).join('') + '</span>';
  };

  // ── 공고 진행 중(2026-11-12) ───────────────────────────────────────
  // 날짜 글: 'YYYY-MM-DD' → 'MM-DD' / 'MM.DD'. 모양이 다르면 ''.
  function mdDash(s) { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? m[1] + '-' + m[2] : ''; }
  function mdDot(s) { return mdDash(s).replace('-', '.'); }
  function ddText(n) { return n === 0 ? 'D-day' : 'D-' + n; }
  // 칩 두 갈래(셋째는 경과 D+ 도장): 마감 D-n(빨강 테두리) / 공고 후 n일(무채색). 마감일을 모르거나 지난 곳은 빨강을 쓰지 않는다.
  // 문구의 정본은 logic.noticeText(지도 팝오버 noticeBrief와 공유, 2026-11-15) — 여기서는 HTML로 감싸기만 한다.
  dash.noticeChipHtml = function (it) {
    const c = logic.noticeText(it).chip;
    if (c.kind === 'open') return '<span class="db-chip open">' + esc(c.lead + c.value) + '</span>';
    return '<span class="db-chip wait">' + esc(c.lead) + '<span class="v">' + esc(c.value) + '</span>' + esc(c.tail) + '</span>';
  };
  // 목록 행의 둘째 줄(지역 뒤): 상태별 문구. 날짜 조각만 <span class="d">로 감싼다.
  dash.noticeNote = function (it) {
    return logic.noticeText(it).note.map(function (s) { return s[1] ? '<span class="d">' + esc(s[0]) + '</span>' : esc(s[0]); }).join('');
  };
  // '결과 확인' 묶음 = 마감 지남 + 마감일 미확인 30일 초과. 띠 카드·지도 색에서 빠지고 목록에서만 보인다.
  // 결과 확인 = 마감 지남 또는 마감일 미확인인데 공고 후 30일 넘음(check 칸이 없는 항목도 같은 규칙으로 판정)
  function isCheck(it) {
    if (it.resultCheck !== undefined) return !!it.resultCheck;   // check 칸은 '날짜 의미 확인 중' 뜻이라 따로 둔다
    return it.phase === 'awaiting' || (it.phase === 'unknown' && it.since > logic.NOTICE_UNKNOWN_OPEN_DAYS);
  }
  dash.isNoticeCheck = isCheck;   // 기관 사업계획(plans.js)이 같은 '결과 확인' 판정을 쓴다
  dash.noticeGroupLabel = function (items) {
    const r = items.filter(function (it) { return it.phase === 'receiving'; }).length;
    return '공고 진행 중 <b>' + items.length + '</b>곳' + (r && r < items.length ? ' · 마감 전 먼저' : '');
  };
  // 공고 원문 링크: noticeUrl, 없으면 sources의 첫 http 항목. 나라장터 bidPbancNo 주소면 '공고 원문 열기', 그 밖(게시판·기사)은 '공고 게시판 열기'.
  // 출처 글에서 날짜를 뽑아 쓰지 않는다. http(s)만 통과시킨다.
  dash.noticeLink = function (rec) {
    const cands = [rec && rec.noticeUrl].concat(rec && Array.isArray(rec.sources) ? rec.sources : []);
    const url = cands.map(logic.safeHttpUrl).filter(function (t) { return t; })[0];
    if (!url) return null;
    return { url: url, name: (/g2b\.go\.kr/i.test(url) && /bidPbancNo=/i.test(url)) ? '공고 원문 열기' : '공고 게시판 열기' };
  };

  // 지금 공고가 난 기관 띠(#db-notice 안쪽). 카드 = 마감 전 + 마감일 미확인 30일 이내(결과 확인 묶음은 목록에서만), 마감 가까운 순, 5칸.
  // 6곳 이상이면 다섯째 칸이 '+n곳 더'. 카드가 0곳이면 ''(띠를 숨긴다). selKey = 지금 목록에서 고른 기관.
  dash.noticeBandHtml = function (m, selKey) {
    const all = (m && m.notice) || [];
    const open = all.filter(function (it) { return !isCheck(it); });
    if (!open.length) return '';
    const r = all.filter(function (it) { return it.phase === 'receiving'; }).length;
    const u = all.filter(function (it) { return it.phase === 'unknown' && !isCheck(it); }).length;
    const w = all.filter(isCheck).length;
    const sum = '접수 마감 전 <b>' + r + '</b>곳' + (u ? ' · ' + esc(logic.NOTICE_WORDS.unknownChip) + ' <b>' + u + '</b>곳' : '') + (w ? ' · 결과 확인 <b>' + w + '</b>곳' : '');
    const head = '<div class="db-h"><h2 id="db-nb-h">지금 공고가 난 기관</h2><span class="sum">' + sum + '</span>' +
      (w ? '<button type="button" class="end" id="db-nb-wait">결과 확인 <b>' + w + '</b>곳 보기</button>' : '') + '</div>';
    const card = function (it) {
      const wait = it.phase !== 'receiving';
      const stub = wait ? '<small>공고 후</small><b>' + esc(it.since) + '일</b>' : '<small>마감</small><b>' + esc(ddText(it.deadlineDays)) + '</b>';
      const rc = wait ? esc(logic.NOTICE_WORDS.unknownChip) : (it.receiveFrom && it.receiveTo ? '접수 <span class="d">' + esc(mdDot(it.receiveFrom) + '~' + mdDot(it.receiveTo)) + '</span>'
        : '마감 <span class="d">' + esc(mdDot(it.receiveTo)) + '</span>');
      const aria = it.name + ', ' + (wait ? '공고 후 ' + it.since + '일, ' + logic.NOTICE_WORDS.unknownChip : '마감 ' + ddText(it.deadlineDays));
      return '<button type="button" class="db-nb-card' + (wait ? ' wait' : '') + '" data-key="' + esc(it.key) + '" aria-pressed="' + (it.key === selKey ? 'true' : 'false') +
        '" aria-label="' + esc(aria) + '"><span class="db-nb-stub">' + stub + '</span><span class="db-nb-body"><span class="nm">' + esc(it.name) +
        '</span><span class="mt">' + esc(dash.regionName(it.region)) + ' · ' + esc(dash.kindOfRec(it.rec)) + '</span><span class="rc">' + rc + '</span></span></button>';
    };
    const many = open.length > 5;
    const cards = (many ? open.slice(0, 4) : open).map(card).join('') +
      (many ? '<button type="button" class="db-nb-more" id="db-nb-more">+' + (open.length - 4) + '곳 더</button>' : '');
    const one = open.length === 1 && w > 0;
    const aside = one ? '<p class="db-nb-aside">공고가 나서 결과를 기다리는 기관 <b>' + w + '</b>곳 — 결과 공고가 났는지 확인하세요.</p>' : '';
    return head + '<div class="db-nb-row' + (one ? ' one' : '') + '">' + cards + aside + '</div>';
  };

  // 상세 칸 맨 위 '공고 진행' 절의 공고 막대 계산: 공고일(0%) → 오늘 → 접수 창 → 약정 만료(100%). 접수 칸이 없으면 창(hasWin=false)을 생략한다.
  // 약정 만료가 오늘·마감 뒤가 아니면 끝은 공고 후 120일(또는 더 먼 쪽)로 둔다. 'YYYY'만 있으면 그해 12-31.
  dash.noticeTrack = function (it, today) {
    const day = function (s) { return new Date(s + 'T00:00:00'); };
    const rel = function (s) { return s ? Math.round((day(s) - day(it.date)) / 86400000) : null; };
    const nowD = rel(logic.localDateStr(today));
    const fromD = rel(it.receiveFrom), toD = rel(it.receiveTo);
    const exp = it.rec && it.rec.contractExpiry ? (/^\d{4}$/.test(String(it.rec.contractExpiry)) ? it.rec.contractExpiry + '-12-31' : String(it.rec.contractExpiry)) : '';
    const expD = /^\d{4}-\d{2}-\d{2}$/.test(exp) ? rel(exp) : null;
    const floor = Math.max(nowD, toD === null ? 0 : toD, 1);
    const hasExp = expD !== null && expD > floor;
    const endD = hasExp ? expD : Math.max(logic.NOTICE_ACTIVE_DAYS, floor);
    const pct = function (d) { return Math.max(0, Math.min(100, d / endD * 100)); };
    const hasWin = toD !== null;
    const winFrom = hasWin ? pct(fromD !== null ? fromD : toD) : 0;
    const winTo = hasWin ? pct(toD) : 0;
    const nowPct = pct(nowD);
    // 라벨 줄 배치(qa 11-12 M5): 접수 창 라벨은 막대 위 줄(top)에 두고, 위 줄의 '오늘' 라벨과 px 기준으로 겹치면 맨 아래 셋째 줄(low)로 내린다.
    // 막대 폭은 모르므로 TRACK_PX 추정치로 라벨 폭을 %로 바꿔 계산한다(공고일·약정 만료 라벨은 가운데 줄 양 끝이라 겹치지 않는다).
    const nowText = nowLabelText(today);
    const recvText = dash.noticeRecvLabel(it);
    const wNow = labelPct(nowText), wRecv = labelPct(recvText);
    const nowRight = nowPct > 88;
    const nowL = nowRight ? nowPct - wNow : nowPct - wNow / 2, nowR = nowRight ? nowPct : nowPct + wNow / 2;
    const center = Math.max(wRecv / 2, Math.min(100 - wRecv / 2, (winFrom + Math.max(winTo, winFrom + 1.2)) / 2));
    const overlap = hasWin && center - wRecv / 2 < nowR + LABEL_GAP_PCT && center + wRecv / 2 > nowL - LABEL_GAP_PCT;
    return { nowPct: nowPct, hasWin: hasWin, winFrom: winFrom, winTo: Math.max(winTo, winFrom + 1.2),
      recvCenter: center, recvText: recvText, recvRow: overlap ? 'low' : 'top', nowText: nowText,
      hasExp: hasExp, expDate: hasExp ? exp : '', endLabel: hasExp ? '약정 만료 ' + mdDot(exp) : '공고 후 ' + logic.NOTICE_ACTIVE_DAYS + '일' };
  };
  // 막대 라벨 폭 추정: 12px 고정폭 글꼴 기준 한글 12px·그 밖 7.2px, 막대 폭 TRACK_PX 추정.
  const TRACK_PX = 420, LABEL_GAP_PCT = 1.5;
  function labelPct(s) {
    let px = 0;
    String(s).split('').forEach(function (ch) { px += ch.charCodeAt(0) >= 0x1100 ? 12 : 7.2; });
    return px / TRACK_PX * 100;
  }
  function nowLabelText(today) { return '오늘' + (today ? ' ' + mdDot(logic.localDateStr(today)) : ''); }
  dash.noticeRecvLabel = function (it) {
    return it.receiveFrom && it.receiveTo ? '접수 ' + mdDot(it.receiveFrom) + '~' + mdDot(it.receiveTo) : (it.receiveTo ? '마감 ' + mdDot(it.receiveTo) : '');
  };
  dash.noticeSecHtml = function (it, today) {
    const rec = it.rec, t = dash.noticeTrack(it, today || new Date());
    const nowS = today ? mdDash(logic.localDateStr(today)) : '';
    const aria = '공고 ' + it.date + (nowS ? ', 오늘 ' + nowS : '') +
      (it.receiveFrom && it.receiveTo ? ', 접수 ' + mdDash(it.receiveFrom) + '부터 ' + mdDash(it.receiveTo) + '까지' : (it.receiveTo ? ', 마감 ' + mdDash(it.receiveTo) : '')) +
      (t.hasExp ? ', 현 약정 만료 ' + mdDash(t.expDate) : '');
    const trk = '<div class="db-ntrk' + (t.hasWin && t.recvRow === 'low' ? ' r3' : '') + '" role="img" aria-label="' + esc(aria) + '"><div class="base"></div><div class="done" style="width:' + t.nowPct.toFixed(1) + '%"></div>' +
      '<div class="tick" style="left:0"></div><span class="lb l" style="left:0">공고 ' + esc(mdDot(it.date)) + '</span>' +
      '<div class="tick" style="left:' + t.nowPct.toFixed(1) + '%"></div><span class="lb top' + (t.nowPct > 88 ? ' r' : '') + '" style="left:' + t.nowPct.toFixed(1) + '%">오늘' + (nowS ? ' ' + esc(nowS.replace('-', '.')) : '') + '</span>' +
      (t.hasWin ? '<div class="win' + (it.phase === 'receiving' ? '' : ' past') + '" style="left:' + t.winFrom.toFixed(1) + '%;width:' + (t.winTo - t.winFrom).toFixed(1) + '%"></div>' +
        '<span class="lb ' + (t.recvRow === 'low' ? 'low' : 'top2') + '" style="left:' + t.recvCenter.toFixed(1) + '%">' + esc(t.recvText) + '</span>' : '') +
      '<div class="tick end" style="left:100%"></div><span class="lb r" style="left:100%">' + esc(t.endLabel) + '</span></div>';
    const unk = '<span class="pop-unk">' + esc(logic.NOTICE_WORDS.unknownChip) + '</span>';
    let recv;
    if (it.receiveFrom && it.receiveTo) recv = mono(it.receiveFrom + ' ~ ' + mdDash(it.receiveTo)) + (it.phase === 'receiving' ? ' · 마감 ' + mono(ddText(it.deadlineDays)) : ' · 마감 지남');
    else if (it.receiveTo) recv = '마감 ' + mono(it.receiveTo) + (it.phase === 'receiving' ? ' · ' + mono(ddText(it.deadlineDays)) : ' · 마감 지남');
    else recv = unk;
    const lk = dash.noticeLink(rec);
    const link = lk ? '<a href="' + esc(lk.url) + '" target="_blank" rel="noopener noreferrer">' + esc(lk.name) + '</a> <span class="db-why">(인터넷 PC에서 열림)</span>'
      : '<span class="db-why">공고 링크가 아직 없습니다</span>';
    const expiry = rec.contractExpiry ? mono(rec.contractExpiry) : chip();
    return '<div class="db-sec"><h3>공고 진행</h3>' + trk + '<dl class="db-dl">' +
      (rec.noticeNo ? '<dt>공고 번호</dt><dd>' + mono(rec.noticeNo) + '</dd>' : '') +
      '<dt>공고일</dt><dd>' + mono(it.date) + '</dd><dt>접수</dt><dd>' + recv + '</dd>' +
      '<dt>현 약정 만료</dt><dd>' + expiry + '</dd><dt>출처</dt><dd>' + link + '</dd></dl></div>';
  };

  dash.rowHtml = function (it, o) {
    o = o || {};
    if (it.notice) {
      const nt = dash.recTagHtml(dash.recView(it, o.snap));
      return '<li role="option" id="' + esc(o.id || '') + '" class="db-row" data-key="' + esc(it.key) + '" data-phase="' + esc(it.phase) + (isCheck(it) ? '" data-check="1' : '') +
        '" aria-selected="' + (o.selected ? 'true' : 'false') + '"><span class="nm">' + esc(it.name) + '</span>' + dash.noticeChipHtml(it) +
        '<span class="meta">' + esc(dash.regionName(it.region)) + ' · ' + dash.noticeNote(it) + chkHtml(it) + (nt ? ' · ' + nt : '') +
        (o.prepActive ? ' <span class="wf-badge pp-neutral">사전준비 중</span>' : '') + '</span></li>';
    }
    const rv = it.overdue ? dash.recView(it, o.snap) : null, view = rv ? rv.view : 'pending';
    const tag = it.overdue ? '<span class="ov-stamp' + (view === 'delayed' ? ' is-line' : view === 'done' ? ' is-plain' : '') + '">D+' + it.days + '</span>'
      : '<span class="dg-day ' + esc(it.band) + '">' + dayText(it.days) + '</span>';
    const rt = rv ? dash.recTagHtml(rv) : '';
    const meta = it.overdue
      ? (rt ? rt + ' · ' + esc(dash.regionName(it.region)) : esc(dash.regionName(it.region)) + ' · ' + esc(dash.overdueNote(it))) + chkHtml(it)
      : esc(dash.regionName(it.region)) + ' · <span class="d">' + esc(it.date) + '</span> ' + esc(it.label) + chkHtml(it) +
        (o.prepActive ? ' <span class="wf-badge pp-neutral">사전준비 중</span>' : '');
    return '<li role="option" id="' + esc(o.id || '') + '" class="db-row" data-key="' + esc(it.key) + (view !== 'pending' ? '" data-rec="' + view : '') + '" aria-selected="' + (o.selected ? 'true' : 'false') + '">' +
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
      '</b>곳 · 1년 안 <b>' + m.upcoming.length + '</b>곳</span><span class="meta">' +
      (m.maxUpdated ? '자료 수정 <b>' + esc(m.maxUpdated) + '</b> · ' : '') + '조사한 기관 <b>' + m.total + '</b>곳</span></div>';
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
  // name·legend로 이름·범례를 바꿀 수 있다(현황판은 11-17 기간 버튼을 없앴다). 생략하면 입찰 공고 현황 그대로.
  dash.periodHtml = function (key, name, legend) {
    const k = dash.windowKey(key), nm = name || 'db-per';
    return '<legend class="sr-only">' + esc(legend || '입찰 예정일 기간') + '</legend>' + dash.WINDOW_KEYS.map(function (w) {
      return '<label><input type="radio" name="' + esc(nm) + '" value="' + w + '"' + (w === k ? ' checked' : '') + '><span>' + dash.WINDOW_LABELS[w] + '</span></label>';
    }).join('');
  };
  // 목록 묶음 제목(aria-live). 전체는 날짜를 아는 곳만이라는 점을 말한다.
  dash.groupLabel = function (key, n) {
    const k = dash.windowKey(key);
    return k === 'all' ? '전체: 앞으로 입찰 <b>' + n + '</b>곳(날짜를 아는 곳)' : dash.WINDOW_LABELS[k] + ' 안 <b>' + n + '</b>곳 · 가까운 순';
  };

  // D3 국민은행 금고 약정 — 와플: 칸 하나가 기관 하나. 국민은행 칸을 앞에, 다른 은행은 빈 칸. (design-reviewer 11-17 6-2)
  dash.waffleHtml = function (kb) {
    let cells = '';
    for (let i = 0; i < kb.total; i += 1) cells += '<i' + (i < kb.confirmed ? ' class="k"' : '') + '></i>';
    return '<div class="waf" role="img" aria-label="지자체 ' + kb.total + '곳 중 국민은행이 금고 협약 중인 곳 ' + kb.confirmed + '곳, 2026년 1월 1일 기준">' + cells + '</div>';
  };
  // o.empty = 국민은행 금고 자료(KB_VERIFIED)가 비었다 → 0곳 와플로 '모두 다른 은행'이라 말하지 않고 안내 한 줄만 둔다.
  dash.kbCardHtml = function (kb, o) {
    // 11-17: 현황판 맨 위 띠로 올라가며 가로 배치 — 머리 줄 오른쪽에 숫자, 아래는 [와플 | 범례·안내](문구 불변, design 11-17)
    const head = '<section class="db-card kb-card" aria-labelledby="db-t1"><div class="db-h"><h2 id="db-t1">국민은행 금고 협약</h2>';
    if (o && o.empty) return head + '</div><p class="fig">국민은행 금고 자료를 불러오지 못했습니다. 화면을 새로 고치세요.</p></section>';
    return head +
      '<p class="fig">지자체 <b>' + kb.total + '</b>곳 중 국민은행 <b>' + kb.confirmed + '</b>곳</p></div>' +
      '<div class="kb-body">' + dash.waffleHtml(kb) + '<div class="kb-side">' +
      '<p class="lg"><span><i class="k"></i>국민은행</span><span><i></i>다른 은행</span></p>' +
      '<p class="note">행안부 금고지정 현황(2026.1.1. 기준)에서 회계 하나라도 국민은행이 맡은 지자체입니다. 2027년부터 바뀌는 곳은 목록의 \'협약 예정(2027년부터)\' 묶음에 있습니다.</p>' +
      '</div></div></section>';
  };

  // D2 제안 진행 단계. p = {state:'offline'|'loading'|'ok'|'denied'|'error', stages:stageCounts 결과, code:401|403|0}
  // stageParts = 카드 껍데기 없이 { body(상태 문구 또는 dl+각주), total(합계 칸 마크업, 없으면 '') } — 현황판 3열의 구획 머리가 쓴다(design 11-17 6-B).
  dash.stageParts = function (p) {
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
    return { body: body, total: total };
  };
  dash.stageCardHtml = function (p) {
    const r = dash.stageParts(p);
    return '<section class="db-card" aria-labelledby="db-t2"><div class="db-h"><h2 id="db-t2">제안 진행 단계</h2>' + r.total + '</div>' + r.body + '</section>';
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

  // 개원 확인 필요(NEXT 72, 규격 6-E): '공고 예정일 경과' 토글 바로 아래, n>0일 때만. 기본 접힘. D-day 태그는 두지 않는다(입찰 대상이 아님).
  dash.openCheckRowHtml = function (r, id, selected) {
    return '<li role="option" id="' + esc(id) + '" class="db-row" data-key="' + esc(logic.instKey(r)) + '" aria-selected="' + (selected ? 'true' : 'false') + '">' +
      '<span class="nm">' + esc(r.name) + '</span><span class="db-chk">개원 확인 필요</span>' +
      '<span class="meta">' + esc(dash.regionName(r.region)) + ' · 개원 예정일 <span class="d">' + esc(r.openDate || '') + '</span> 지남</span></li>';
  };
  dash.openCheckHtml = function (recs, open, sel) {
    if (!recs || !recs.length) return '';
    let h = '<button type="button" class="db-more" id="db-chk" aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="db-chklist"><span>개원 확인 필요 <b>' + recs.length + '</b>곳</span><span>' + (open ? '접기' : '펼치기') + '</span></button>';
    if (open) {
      h += '<ul role="listbox" id="db-chklist" tabindex="0" aria-label="개원 확인 필요 기관">' + recs.map(function (r, i) {
        return dash.openCheckRowHtml(r, 'db-c-' + i, logic.instKey(r) === sel);
      }).join('') + '</ul>';
    }
    return h;
  };

  // 상세 칸 '공고 상태 기록' 절(2단계). 본체는 noticerec.sectionHtml(it, v). 인자 없이 부르면 서버 미연결 모양.
  dash.recordSecHtml = function (it, v) { const n = NR(); return n ? n.sectionHtml(it, v) : ''; };
  // 지도·현황판 상세 팝업(규격 P2-3): 쓰는 곳은 입찰 공고 현황 하나라 읽기 요약 한 줄 + [입찰 공고 현황에서 기록]만 둔다.
  // o = { state:'offline'|'idle'|'loading'|'ok'|'error'|'denied', snap, canGo }
  dash.recordBriefHtml = function (it, o) {
    o = o || {};
    let line;
    if (o.state === 'ok') {
      const rec = dash.recView(it, o.snap).item, def = rec ? logic.recStatus(rec.status_cd) : null;
      line = def ? esc(def.label) + ' · ' + esc(rec.handler_name || '') + ' ' + mono(String(rec.handled_at || '').slice(0, 10)) : '<span class="db-why">아직 기록이 없습니다.</span>';
    } else if (o.state === 'loading' || o.state === 'idle') line = '<span class="db-why">불러오는 중입니다…</span>';
    else if (o.state === 'error' || o.state === 'denied') line = '<span class="db-why">기록을 불러오지 못했습니다.</span>';
    else line = '<span class="db-why">서버에 연결하면 보입니다.</span>';
    return '<div class="db-sec db-rec"><h3>공고 상태 기록</h3><dl class="db-dl"><dt>담당자 기록</dt><dd>' + line + '</dd></dl>' +
      (o.canGo ? '<p class="db-rec-go"><button type="button" id="dm-rec-go">입찰 공고 현황에서 ' + (o.canEdit ? '기록' : '보기') + '</button></p>' : '') + '</div>';
  };
  // 경과 탭 상태 보기 [미처리 | 지연·재공고 대기 | 처리됨]. '처리됨' = 공고 진행 중·공고 종료·입찰 없음. '처리'는 이 보기 이름에만 쓴다.
  dash.OV_VIEWS = [['pending', '미처리'], ['delayed', '지연·재공고 대기'], ['done', '처리됨']];
  dash.ovViewHtml = function (view, counts) {
    const c = counts || {};
    return '<legend class="sr-only">기록 상태</legend>' + dash.OV_VIEWS.map(function (d) {
      return '<label><input type="radio" name="db-ov" value="' + d[0] + '"' + (d[0] === view ? ' checked' : '') + '><span>' + esc(d[1]) + ' <b>' + Number(c[d[0]] || 0) + '</b></span></label>';
    }).join('');
  };
  // o = { state:nr.state(), canEdit }
  dash.ovGuide = function (view, o) {
    o = o || {};
    if (o.state === 'idle' || o.state === 'loading') return '기록 상태를 불러오는 중입니다…';
    if (o.state === 'error' || o.state === 'denied') return '기록 상태를 불러오지 못했습니다. 지금은 모든 회차를 미처리로 셉니다.';
    if (o.state !== 'ok') return '서버에 연결하면 기록 상태가 보입니다. 지금은 모든 회차를 미처리로 셉니다.';
    if (view === 'delayed') return '지연·재공고 대기로 적은 회차입니다. 다음 확인일이 되면 미처리로 돌아갑니다.';
    if (view === 'done') return '공고 진행 중·공고 종료·입찰 없음으로 적은 회차입니다.';
    return '예정일이 지났는데 아직 기록이 없거나 다음 확인일이 지난 회차입니다. ' + (o.canEdit ? '기관을 골라 오른쪽 \'공고 상태 기록\'에 적으세요.' : '영업팀이 기록합니다.');
  };
  // 저장 뒤 선택한 기관이 지금 보기(ovView)의 행에서 빠졌을 때 저장 안내 끝에 붙이는 한 문장(design-reviewer 11-17 6-3, P3-8).
  // view = 그 기관이 지금 든 보기('pending'|'delayed'|'done'), inList = 경과 목록에 아직 있는가. 빠지지 않았으면 ''.
  dash.moveNote = function (view, ovView, inList) {
    if (!inList) return '이 기관은 경과 목록에서 빠졌습니다.';
    if (view === ovView) return '';
    const d = dash.OV_VIEWS.filter(function (x) { return x[0] === view; })[0];
    return d ? '이 기관은 [' + d[1] + '] 보기로 옮겼습니다.' : '';
  };
  // 안내 문장을 붙일지 판단(qa F1): 공고 상태 목록이 'ok'일 때만 쓴다. 목록 요청이 실패했으면 '목록에서 빠졌습니다'가 거짓이 된다.
  dash.moveNoteIf = function (listState, note) { return listState === 'ok' ? (note || '') : ''; };
  dash.ovEmpty = function (view) {
    return view === 'delayed' ? '지연·재공고 대기로 적은 회차가 없습니다.' : view === 'done' ? '공고 진행 중·공고 종료·입찰 없음으로 적은 회차가 없습니다.' : '예정일이 지난 회차를 모두 기록했습니다.';
  };
  // 목록 탭 두 개: 다가오는 입찰 / [D+ 도장] 공고 예정일 경과. 선택한 칸이 aria-selected, 한 칸만 tabindex 0.
  dash.tabsHtml = function (tab, upN, ovN) {
    const defs = [['up', '다가오는 입찰', upN, ''], ['ov', '공고 예정일 경과', ovN, '<span class="ov-stamp" aria-hidden="true">D+</span>']];
    return defs.map(function (d) {
      const on = d[0] === tab;
      return '<button type="button" role="tab" class="db-tab" id="db-tab-' + d[0] + '" data-tab="' + d[0] + '" aria-selected="' + (on ? 'true' : 'false') +
        '" aria-controls="db-scroll" tabindex="' + (on ? '0' : '-1') + '">' + d[3] + esc(d[1]) + ' <b>' + Number(d[2] || 0) + '</b></button>';
    }).join('');
  };

  dash.blankHtml = function () {
    return '<div class="db-blank">왼쪽 목록에서 기관을 고르세요. 기관 정보가 여기에 보이고, 공고가 난 기관이면 [제안 확정] 버튼도 보입니다.</div>';
  };

  function lastProcNote(rec) {
    const s0 = Array.isArray(rec.sources) && rec.sources[0] ? String(rec.sources[0]) : '';
    if (/기준일\s*=\s*공고일/.test(s0)) return '지정 공고일';
    if (/기준일\s*=\s*지정/.test(s0)) return '지정일';
    return '';
  }
  function srcItem(s) {
    const t = String(s == null ? '' : s).trim();
    const u = logic.safeHttpUrl(t);
    if (u) return '<li><a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(t) + '</a></li>';
    return '<li>' + esc(t) + '</li>';
  }

  // ── 행안부 금고지정 현황(root.LOFIN_2026, 생성물 frontend/data/lofin-2026.js) — 지자체의 '현재 금고 은행' 수집 줄 ──
  // 우선순위: 직접 입력(현재) > KB_VERIFIED·KB_NEXT 수집 > 행안부 값 > 만료된 직접 입력. 약정 기록 표에는 넣지 않고 화면 '수집' 줄로만 보인다.
  // 직접 입력이 있으면 행안부 값은 bankcontract.sectionHtml의 비교 대상(같음/다름)이 된다.
  const LOFIN_RANK = { SINGLE: '단수 금고', RANK1: '1금고', RANK2: '2금고' };
  const LOFIN_CMP = { SINGLE: 'SINGLE', RANK1: 'FIRST', RANK2: 'SECOND' };   // DB 041 BANK_RANK 코드
  const LOFIN_ORD = { SINGLE: 0, RANK1: 1, RANK2: 2 };
  // → [{ bank, rankLabel, cmp, accts[], start, end, unit, approx, expired }] (단위 묶음 순서 → 1금고 먼저). 지자체가 아니거나 자료가 없으면 [].
  dash.lofinLines = function (rec, lofin, today) {
    if (!rec || !lofin || !lofin.rows || dash.kindOfRec(rec) !== '지자체') return [];
    const k = logic.instKey(rec);
    const list = Object.prototype.hasOwnProperty.call(lofin.rows, k) ? lofin.rows[k] : null;
    if (!Array.isArray(list)) return [];
    const ts = logic.localDateStr(today || todayDate()), units = [];
    const lines = list.filter(function (x) { return x && x.bank; }).map(function (x, i) {
      const u = x.unit || '';
      if (units.indexOf(u) < 0) units.push(u);
      return { bank: String(x.bank), rank: x.rank, rankLabel: LOFIN_RANK[x.rank] || '', cmp: LOFIN_CMP[x.rank] || '',
        accts: Array.isArray(x.accts) ? x.accts.map(String) : [], start: x.start || '', end: x.end || '', unit: u, approx: !!x.approx,
        expired: !!x.end && String(x.end) < ts, ui: units.indexOf(u), i: i };
    });
    lines.sort(function (a, b) { return (a.ui - b.ui) || ((LOFIN_ORD[a.rank] || 0) - (LOFIN_ORD[b.rank] || 0)) || (a.i - b.i); });
    return lines;
  };
  function lofinAsof(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? m[1] + '.' + Number(m[2]) + '.' + Number(m[3]) + '.' : '';
  }
  // dt·dd 묶음. o.diff = 직접 입력과 다를 때(dt '수집 기록' + '수집 기록과 다름' 표지).
  dash.lofinRowsHtml = function (lines, lofin, o) {
    o = o || {};
    const asof = lofinAsof(lofin && lofin.asof);
    return (lines || []).map(function (l) {
      const period = l.start && l.end ? mono(l.start + ' ~ ' + l.end) : l.end ? '끝 ' + mono(l.end) : l.start ? '시작 ' + mono(l.start) : '';
      const tail = (period ? '<span class="bk-ln db-why">약정 ' + period + '</span>' : '') +
        (l.accts.length ? '<span class="bk-ln db-why">맡는 회계 ' + l.accts.map(esc).join(' · ') + '</span>' : '');
      const expired = l.expired ? ' <span class="wf-badge pp-cancel">만료</span>' : '';
      if (o.diff) {   // 직접 입력 줄 사이에 끼므로 줄마다 출처 꼬리를 둔다
        const who = (l.unit && !l.approx ? esc(l.unit) + ': ' : '') + esc(l.bank) + (l.rankLabel ? ' · ' + esc(l.rankLabel) : '');
        const why = '· 행안부 금고지정 현황' + (asof ? ' ' + esc(asof) + ' 기준' : '') + (l.approx && l.unit ? ' (개편 전 ' + esc(l.unit) + ' 기준)' : '');
        return '<dt>수집 기록</dt><dd><span class="bk-ln">' + who + expired + ' <span class="wf-badge pp-cancel">수집</span> <span class="db-why">' + why + '</span>' +
          ' <span class="db-chk">수집 기록과 다름</span></span>' + tail + '</dd>';
      }
      // legacy 갈래: dt = 순위 이름(㊹ 직접 입력 줄과 같은 짜임), 출처는 아래 '직접 확인:' 링크 한 곳이 맡는다
      const dt = (l.unit && !l.approx ? esc(l.unit) + ' ' : '') + esc(l.rankLabel || '금고 은행');
      const apx = l.approx && l.unit ? ' <span class="db-why">(' + esc(l.unit) + ' 값, 행정구역 개편 전)</span>' : '';
      return '<dt>' + dt + '</dt><dd><span class="bk-ln">' + esc(l.bank) + expired + ' <span class="wf-badge pp-cancel">수집</span>' + apx + '</span>' + tail + '</dd>';
    }).join('');
  };

  // 기존 수집 갈래(c.kb·c.next)의 요약 — 약정 응답과 나란히 보일 때만 쓴다(비교는 bankcontract.bankKey).
  function bankCol(c) {
    if (c.kb) return { name: 'KB국민은행', slot: c.kb.slot ? String(c.kb.slot) : '', date: c.kb.src_date || '',
      extra: c.kb.leaves ? [[String(c.kb.leaves) + '년부터', '다른 은행' + (c.kb.next ? ' ' + c.kb.next : '')]] : [] };
    if (c.next) return { name: c.next.now ? String(c.next.now) : '', slot: '', date: c.next.src_date || '',
      extra: [[String(c.next.from || '2027') + '년부터', '국민은행' + (c.next.term ? '(약정 ' + c.next.term + ')' : '')]] };
    return null;
  }

  // 상세. c = {act:'confirm'|'open'|'unavailable'|'none', confirm:bool, busy:bool, kb:검증 항목|null, role:string, bank:약정 응답(bankcontract.view)|null}
  dash.paneHtml = function (it, c) {
    c = c || {};
    const rec = it.rec, srcs = Array.isArray(rec.sources) ? rec.sources : [];
    const oc = ie.isOpenCheck(rec);   // 개원 예정일이 지난 개원 예정 기관 — 입찰 대상이 아니라 날짜 줄·D-day 대신 '개원 확인 필요'
    const head = '<div class="db-head"><h2 id="' + esc(c.nameId || 'db-name') + '" tabindex="-1">' + esc(it.name) + '</h2>' +
      (oc ? '<span class="db-chk">개원 확인 필요</span>' : it.unknown ?'<span class="dg-day unknown">날짜 미상</span>' : it.notice ? dash.noticeChipHtml(it) : it.overdue ? '<span class="ov-stamp">D+' + it.days + '</span>' : '<span class="dg-day ' + esc(it.band) + '">' + dayText(it.days) + '</span>') +
      (c.act === 'open' ? '<span class="wf-badge pp-neutral">사전준비 중</span>' : '') + '</div>' +
      '<p class="db-sub">' + esc(dash.kindOfRec(rec)) + ' · ' + esc(dash.regionName(rec.region)) + '</p>';
    const why = it.confidence === '확정' ? '— 공고로 확인한 날입니다'
      : it.basis === 'expiry' ? '— 약정 만료일의 6개월 전으로 추정한 날입니다(약정 만료 기준 추정)'
      : it.basis === 'notice' ? '— 공고된 날짜이나 의미 확인 중입니다'
      : '— 최근 절차일에 약정 주기를 더한 날입니다';
    const lp = lastProcNote(rec);
    // 진행 중 공고는 맨 위 '공고 진행' 절이 공고일·접수·약정 만료를 맡는다 — 예정일 막대·'입찰 예정일' 줄은 두지 않는다.
    const info = (it.notice ? dash.noticeSecHtml(it, c.today) : oc ? '' : dash.termBarHtml(it, c.today)) +'<div class="db-sec"><h3>기관 정보</h3><dl class="db-dl">' +
      (it.notice || oc ? '' : it.unknown ? '<dt>입찰 예정일</dt><dd>' + chip() + '</dd>' : '<dt>입찰 예정일</dt><dd>' + mono(it.date) + ' ' + esc(it.label) + chkHtml(it) + ' <span class="db-why">' + why + '</span>' + ie.confirmSrcHtml(rec) + '</dd>') +
      '<dt>최근 절차일</dt><dd>' + (rec.lastBid ? mono(rec.lastBid) + (lp ? ' <span class="db-why">' + esc(lp) + '</span>' : '') : chip()) + '</dd>' +
      '<dt>약정 주기</dt><dd>' + (rec.term ? mono(rec.term) + '년' : chip()) + '</dd>' +
      (ie.opLineHtml(rec) ? '<dt>운영 상태</dt><dd>' + ie.opLineHtml(rec) + '</dd>' : '') + '</dl>' +
      (srcs.length ? '<details class="db-src"><summary>출처 ' + srcs.length + '건 보기</summary><ol>' + srcs.map(srcItem).join('') + '</ol></details>' : '') + '</div>';
    let bankDl, bankNote;
    const bankOk = !!(c.bank && c.bank.st === 'ok' && c.bank.data);   // 약정 응답이 왔을 때만 문구를 바꾼다(없으면 기존 문구 그대로)
    // 행안부 값은 KB 수집(c.kb·c.next)이 없을 때만 쓴다. c.lofin(순수 시험)이 있으면 그것, 없으면 전역 자료.
    const lofinData = c.lofin !== undefined ? c.lofin : root.LOFIN_2026;
    const lofinAll = c.kb || c.next ? [] : dash.lofinLines(rec, lofinData, c.today);
    const lofinLive = lofinAll.filter(function (l) { return !l.expired; });
    if (c.kb) {
      const slot = c.kb.slot ? ' · ' + esc(c.kb.slot) + '금고' : '';
      bankDl = '<dl class="db-dl"><dt>금고 은행</dt><dd>KB국민은행' + slot + '</dd>' +
        '<dt>근거</dt><dd>' + esc(c.kb.quote || '') + (c.kb.src_date ? ' <span class="db-why">출처 기준일 ' + esc(c.kb.src_date) + '</span>' : '') + '</dd>' +
        (c.kb.leaves ? '<dt>' + esc(c.kb.leaves) + '년부터</dt><dd>다른 은행' + (c.kb.next ? ' <span class="db-why">' + esc(c.kb.next) + '</span>' : '') + '</dd>' : '') +
        '<dt>약정 기간</dt><dd>' + chip() + '</dd></dl>';
      bankNote = bankOk && c.bank.data.can_edit ? '<p class="db-empty">출처 문장으로 확인한 현 금고만 보입니다. 약정 기간은 금고 약정을 입력하면 함께 보입니다.</p>'
        : '<p class="db-empty">출처 문장으로 확인한 현 금고만 보입니다. 약정 기록을 모으면 약정 기간이 함께 보입니다.</p>';
    } else if (c.next) {
      // 2027년부터 국민은행으로 바뀌는 기관(KB_NEXT). now = 지금 금고 은행(없으면 미확인). 출처 링크는 <dd> 안 — 버튼 밖.
      const nx = c.next, nu = logic.safeHttpUrl(nx.url);
      bankDl = '<dl class="db-dl"><dt>금고 은행</dt><dd>' +
        (nx.now ? '현재 금고 ' + esc(nx.now) : '현재 은행 ' + chip()) +
        ' · ' + esc(nx.from || '2027') + '년부터 국민은행' + (nx.term ? '(약정 ' + esc(nx.term) + ')' : '') + '</dd>' +
        '<dt>근거</dt><dd>' + esc(nx.quote || '') + (nx.src_date ? ' <span class="db-why">출처 기준일 ' + esc(nx.src_date) + '</span>' : '') +
        (nu ? ' <a href="' + esc(nu) + '" target="_blank" rel="noopener noreferrer">출처 보기</a>' : '') + '</dd></dl>';
      bankNote = '<p class="db-empty">' + (nx.now ? '지금 금고 은행은 출처 문장으로 확인했습니다. ' : '') + esc(nx.from || '2027') + '년 약정은 선정 결과 기준이며 본계약 여부는 출처에서 다시 확인하세요.</p>';
    } else if (lofinAll.length) {
      // 행안부 금고지정 현황 값 — 직접 입력·KB 수집이 없는 지자체의 '미확인' 자리. 약정 기간은 줄 안에 같이 있다.
      bankDl = '<dl class="db-dl">' + dash.lofinRowsHtml(lofinAll, lofinData) + '</dl>';
      const canEd = bankOk && c.bank.data.can_edit;
      bankNote = !lofinLive.length   // 줄이 모두 만료 — 2027-01-01부터 80곳이 여기에 걸린다
        ? '<p class="db-empty">행안부 현황의 약정 기간이 지났습니다. ' + (canEd ? '지금 약정을 확인해 직접 입력하세요.' : '지금 약정은 기록이 없습니다.') + '</p>'
        : canEd ? '<p class="db-empty">행안부 현황으로 채운 값입니다. 약정을 직접 입력하면 그 값이 먼저 보입니다.</p>'
        : '<p class="db-empty">행안부 현황으로 채운 값입니다.</p>';
    } else {
      bankDl = '<dl class="db-dl"><dt>금고 은행</dt><dd>' + chip() + '</dd><dt>약정 기간</dt><dd>' + chip() + '</dd></dl>';
      bankNote = !bankOk ? '<p class="db-empty">약정 기록을 모으면 금고 은행과 약정 기간이 출처와 함께 여기에 보입니다.</p>'
        : c.bank.data.can_edit ? '<p class="db-empty">금고 약정을 입력하면 출처와 함께 여기에 보입니다.</p>' : '';   // 권한 없음 문구는 절 아래 foot이 보인다
    }
    const bcm = BC();
    // 지자체 기관에만: '현재 금고 은행' 절에 행안부 금고지정 현황 바로가기 한 줄(kbboard.srcHtml 재사용 — 머리말만 '직접 확인: ').
    // 서버 모드는 bc.sectionHtml이 note·state 뒤, foot 앞에 끼운다(정규식 끼워 넣기 없음). legacy 경로는 절 끝에 붙인다.
    // c.muniSrcHtml이 문자열이면 그것을 쓴다(순수 시험·kbboard 미로드). 비지자체 기관에는 이 표가 근거가 아니라 넣지 않는다.
    let muniSrc = '';
    if (dash.kindOfRec(rec) === '지자체') muniSrc = typeof c.muniSrcHtml === 'string' ? c.muniSrcHtml : (root.kbboard && root.kbboard.srcHtml ? root.kbboard.srcHtml('직접 확인: ') : '');
    const bank = c.bank && bcm
      ? bcm.sectionHtml(c.bank, { legacyDl: bankDl, legacyNote: bankNote, collected: !!(c.kb || c.next || lofinAll.length), hasKb: !!c.kb, col: bankCol(c), srcHtml: muniSrc,
        lofin: lofinLive.map(function (l) { return { bank: l.bank, rank: l.cmp, html: dash.lofinRowsHtml([l], lofinData, { diff: true }) }; }) })
      : '<div class="db-sec"><h3>현재 금고 은행</h3>' + bankDl + bankNote + (muniSrc ? '<p class="db-empty bk-src">' + muniSrc + '</p>' : '') + '</div>';
    // c.headHtml: headcard.js가 만든 '기관장' 절(서버 기관장 API 카드). 없으면(모듈 미로드·순수 테스트) 예전 자리표시를 둔다.
    const chief = typeof c.headHtml === 'string' ? c.headHtml : '<div class="db-sec"><h3>기관장</h3><dl class="db-dl"><dt>기관장</dt><dd>' + chip() + '</dd></dl>' +
      '<p class="db-empty">기관장 프로필은 수집 예정입니다. 입찰이 1년 안에 있는 기관부터 모읍니다.</p></div>';
    // 사업계획 절(plans.js가 dash.plansHook으로 등록): 기관장 절 뒤, tail 앞. plans.js가 없으면(순수 테스트) 두지 않는다.
    const plansSec = typeof c.plansHtml === 'string' ? c.plansHtml : (typeof dash.plansHook === 'function' ? dash.plansHook(rec, c) : '');
    // c.recordHtml: '공고 상태 기록' 절 — 기관 정보 바로 뒤(규격 P1-2). 입찰 공고 현황은 입력 칸 포함, 지도·현황판 팝업은 읽기 요약 한 줄. 개원 확인 필요 기관에는 넘기지 않는다.
    return '<div class="db-pane-body">' + head + info + (typeof c.recordHtml === 'string' ? c.recordHtml : '') + bank + chief + plansSec + (typeof c.tailHtml === 'string' ? c.tailHtml : '') + '</div><div class="db-act">' + dash.actHtml(it, c) + '</div>';
  };

  dash.actHtml = function (it, c) {
    const map = c.mapHtml !== undefined ? c.mapHtml : '<button type="button" id="db-map">전국 지도에서 보기</button>';
    // 개원 확인 필요 기관은 입찰 대상이 아니라 [제안 확정]을 두지 않는다 — 운영 상태를 확인해 바꾸는 창으로 보낸다(NEXT 72, 기획 결정).
    if (c.act === 'opencheck') return '<div class="db-act-row"><span class="db-why">개원했는지 확인하고 출처와 함께 운영 상태를 바꾸세요.</span><button type="button" id="db-edit">기관 정보 변경</button></div>';
    if (c.act === 'wait') return '<div class="db-act-row"><span class="db-why">[제안 확정]을 쓸 수 있는지 확인하는 중입니다.</span>' + map + '</div>';
    if (dash.CONFIRM_WHY[c.act]) return '<div class="db-act-row"><span class="db-why">' + dash.CONFIRM_WHY[c.act] + '</span>' + map + '</div>';
    if (c.act === 'unavailable') return '<div class="db-act-row"><span class="db-why">서버에 연결되면 [제안 확정]을 쓸 수 있습니다.</span>' + map + '</div>';
    if (c.act === 'open') return '<div class="db-act-row"><button type="button" class="db-next" id="db-open">사전준비 열기</button>' + map + '<span class="db-why">이미 제안 확정되어 사전준비가 진행 중입니다.</span></div>';
    if (c.act === 'confirm') {
      if (c.confirm) {
        return '<div class="db-confirm" role="group" aria-labelledby="db-cf-t"><span id="db-cf-t">' + esc(it.name) + dash.josaEul(it.name) +
          ' 제안 대상으로 확정합니다. 확정하면 [영업 추진 준비 › 제안서 사전준비 프로세스]에 이 기관의 준비 건이 생깁니다. 개설 신청 전까지는 확정한 사람·영업팀장이 취소할 수 있습니다.</span>' +
          '<div class="db-act-row"><button type="button" class="db-next" id="db-do"' + (c.busy ? ' disabled' : '') + '>확정하기</button><button type="button" id="db-cancel">취소</button></div></div>';
      }
      return '<div class="db-act-row"><button type="button" class="db-next" id="db-cf">제안 확정</button>' + map +
        (c.early ? '<span class="db-why">' + esc(dash.EARLY_WHY) + '</span>' : '') + '</div>';
    }
    const noperm = ['영업팀', '영업팀장'].indexOf(c.role || '') < 0 ? '<span class="db-why">제안 확정은 영업팀·영업팀장이 합니다.</span>' : '';
    return '<div class="db-act-row">' + map + noperm + '</div>';
  };

  // ── DOM ───────────────────────────────────────────────────────────
  // tab: 'up' = 다가오는 입찰, 'ov' = 공고 예정일 경과. 입찰 공고 현황은 /preps만 읽는다(행의 '사전준비 중' 배지용). 단계 집계(overview)는 현황판(kbboard)이 맡는다.
  function recFresh(id) { return { id: id, seq: 0, histSt: 'idle', histCode: 0, hist: null, busy: false, err: '', errs: {}, cf: null, histOpen: false }; }
  const st = { sel: '', q: '', region: '', type: '', win: dash.DEFAULT_WINDOW, tab: 'up', chkOpen: false, confirm: false, busy: false, flash: '', err: '',
    preps: null, prepSt: 'offline', prepCode: 0, ovView: 'pending', drafts: {}, rec: recFresh('') };
  let host = null, ac = null, M = null, LIST = [], seq = 0, offNr = null;

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
  function allItems() { return M ? M.upcoming.concat(M.later || [], M.overdue, M.notice || []) : []; }
  // 개원 확인 필요 기관(서버 open_check_needed) — 입찰 목록(dataList)에서는 빠지는 개원 예정 법원이라 서버 행에서 따로 모은다.
  function openCheckRecs() {
    if (!serverMode()) return [];
    try { return ie.openCheckList(root.store.loadData() || []); } catch (e) { return []; }
  }
  function openCheckItem(key) {
    const r = openCheckRecs().filter(function (x) { return logic.instKey(x) === key; })[0];
    return r ? dash.itemForRec(r, todayDate()) : null;
  }
  function findItem(key) { return allItems().filter(function (it) { return it.key === key; })[0] || (st.chkOpen ? openCheckItem(key) : null) || null; }
  function activeFor(rec) {
    const id = rec && rec.institutionId;
    return id ? dash.activePreps(st.preps).filter(function (p) { return instId(p) === id; })[0] || null : null;
  }

  // 위 시간표(D1). 기간 버튼이 바뀌면 시간표의 기간 창도 다시 그린다. 와플·단계 카드는 입찰 현황판(kbboard)으로 옮겼다.
  function renderStrip() {
    const el = $('db-tl');
    if (el) el.innerHTML = dash.timelineHtml(M, todayDate(), st.win);
    const asof = $('db-asof');
    if (asof) asof.textContent = logic.localDateStr(todayDate());
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

  // #db-root 맨 위 '지금 공고가 난 기관' 띠. 카드가 0곳이면 띠 전체를 숨긴다(빈 띠를 두지 않음).
  function renderNotice() {
    const el = $('db-notice');
    if (!el) return;
    const h = dash.noticeBandHtml(M, st.sel);
    el.innerHTML = h;
    el.hidden = !h;
  }

  function paintTabs(upN, ovN, counts) {
    const tabs = $('db-tabs');
    if (tabs) tabs.innerHTML = dash.tabsHtml(st.tab, upN, ovN);
    const per = $('db-per');
    if (per) per.hidden = st.tab === 'ov';              // 경과에는 기간 뜻이 없다
    const ovv = $('db-ovview');                         // 경과에서는 같은 자리에 상태 보기. 한 번만 만들고 숫자·선택만 바꾼다(방향키 포커스를 잃지 않게)
    if (ovv) {
      ovv.hidden = st.tab !== 'ov';
      if (!ovv.firstChild) ovv.innerHTML = dash.ovViewHtml(st.ovView, counts);
      Array.prototype.forEach.call(ovv.querySelectorAll('input'), function (r) {
        r.checked = r.value === st.ovView;
        const b = r.parentNode && r.parentNode.querySelector ? r.parentNode.querySelector('b') : null;
        if (b) b.textContent = String((counts && counts[r.value]) || 0);
      });
    }
    const sc = $('db-scroll');
    if (sc) sc.setAttribute('aria-labelledby', 'db-tab-' + st.tab);
  }

  function renderList() {
    const el = $('db-scroll');
    if (!el) return;
    const f = { q: st.q, region: st.region, type: st.type };
    const inWin = dash.windowItems(M, st.win);
    const nt = dash.filterItems(M.notice || [], f);
    const up = dash.filterItems(inWin, f), past = dash.filterItems(M.overdue, f);
    const filtered = !!(st.q.trim() || st.region || st.type);
    let h = '', ovCounts = null;
    if (st.tab === 'ov') {
      // [공고 예정일 경과] 탭: 상태 보기(미처리·지연·처리됨) → 안내 줄 → 그 보기의 경과 행 → 개원 확인 필요(맨 아래, 접힘)
      const snap = curSnap(), n = NR(), sp = logic.splitOverdue(past, snap, logic.localDateStr(todayDate()));
      ovCounts = { pending: sp.pending.length, delayed: sp.delayed.length, done: sp.done.length };
      const view = sp[st.ovView] ? st.ovView : 'pending', rows = sp[view];
      h += '<p class="db-grp" id="db-g2">' + esc(dash.ovGuide(view, { state: n && n.state ? n.state() : 'offline', canEdit: !!(n && n.canEdit && n.canEdit()) })) + '</p>';
      if (rows.length) h += '<ul role="listbox" id="db-pastlist" tabindex="0" aria-label="공고 예정일 경과 기관">' + optionsFor(rows, 'db-p-') + '</ul>';
      else if (past.length) h += '<p class="db-state">' + esc(dash.ovEmpty(view)) + '</p>';
      else if (filtered) h += '<p class="db-state">조건에 맞는 경과 기관이 없습니다.<br><button type="button" id="db-clear">조건 지우기</button></p>';
      else h += '<p class="db-state">예정일이 지난 기관이 없습니다.</p>';
      h += dash.openCheckHtml(openCheckRecs().filter(function (r) {
        return (!st.region || r.region === st.region) && (!st.q.trim() || String(r.name || '').indexOf(st.q.trim()) >= 0) && (!st.type || dash.kindOfRec(r) === st.type);   // 종류 판정은 filterItems와 같은 kindOfRec
      }), st.chkOpen);
    } else {
      // [다가오는 입찰] 탭: 공고 진행 중(마감 전 → 마감일 미확인 → 결과 확인) → 기간 창. 제목은 스크롤 안에서 같이 넘어간다.
      if (nt.length) h += '<div class="db-grp" id="db-g0">' + dash.noticeGroupLabel(nt) + '</div><ul role="listbox" id="db-nlb" tabindex="0" aria-labelledby="db-g0">' + optionsFor(nt, 'db-n-') + '</ul>';
      h += '<div class="db-grp" id="db-g1" aria-live="polite">' + dash.groupLabel(st.win, up.length) + '</div>';
      if (up.length) h += '<ul role="listbox" id="db-lb" tabindex="0" aria-labelledby="db-g1">' + optionsFor(up, 'db-o-') + '</ul>';
      else if (filtered && inWin.length) h += '<p class="db-state">조건에 맞는 기관이 없습니다. 검색어를 지우거나 지역을 \'전체 지역\'으로 바꾸세요.<br><button type="button" id="db-clear">조건 지우기</button></p>';
      else h += '<p class="db-state">' + (st.win === 'all' ? '앞으로 입찰 예정인 기관이 없습니다.' : esc(dash.WINDOW_LABELS[st.win]) + ' 안에 입찰 예정인 기관이 없습니다.') + ' 예정일이 지난 기관은 [공고 예정일 경과] 탭에서 봅니다.</p>';
      h += dash.moreHintHtml(dash.moreHint(M, st.win, filtered ? f : null));
    }
    el.innerHTML = h;
    paintTabs(nt.length + up.length, past.length, ovCounts);
    markSelected();
    const foot = $('db-foot');
    if (foot) foot.innerHTML = dash.footHtml(M);
  }

  function markSelected() {
    if (!host) return;
    host.querySelectorAll('.db-nb-card').forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-key') === st.sel ? 'true' : 'false'); });
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

  // 기관장 카드(headcard.js). 입찰 D-day는 임기 만료일을 모를 때 카드 맨 위 큰 숫자가 된다.
  // 공고 진행 중인 기관은 입찰 예정일이 없으므로 접수 중이면 마감 D-n(출처: 공고), 그 밖이면 '공고 진행 중' 칩이 되도록 notice 정보를 넘긴다.
  function empNo() { try { return String((root.store.loadSession() || {}).emp || ''); } catch (e) { return ''; } }
  function headBid(it) {
    if (it && it.notice) return { notice: true, receiving: it.phase === 'receiving', days: it.deadlineDays, date: it.receiveTo || '' };
    if (!it || !it.date || typeof it.days !== 'number') return null;
    return { days: it.overdue ? -it.days : it.days, date: it.date, label: it.label };
  }
  function headEnv(it) {
    return { serverMode: serverMode(), hasEmp: hasEmp(), role: role(), emp: empNo(), today: todayDate(), bid: headBid(it), repaint: repaintHead };
  }
  function repaintHead() { if (host && M && st.sel) renderPane(); }
  function headSection(it) {
    return root.headcard ? root.headcard.paneSection(it.rec, headEnv(it)) : undefined;
  }

  function paneAct(it, ctx, actives) {
    return ie.isOpenCheck(it.rec) ? 'opencheck' : dash.actionKind(it.rec, ctx, actives, root.prep, gateOpts());
  }
  function renderPane() {
    const el = $('db-pane');
    if (!el) return;
    const it = st.sel ? findItem(st.sel) : null;
    if (!it) { el.removeAttribute('aria-labelledby'); el.setAttribute('aria-label', '기관 상세'); el.innerHTML = dash.blankHtml(); return; }
    el.removeAttribute('aria-label'); el.setAttribute('aria-labelledby', 'db-name');
    const actives = dash.activePreps(st.preps);
    const ctx = actCtx();
    const act = paneAct(it, ctx, actives);
    st.act = act;
    if (act !== 'confirm') st.confirm = false;   // 판정이 잠깐 바뀌면 열어 둔 확인 상자도 닫는다 — 남겨 두면 나중에 저절로 다시 뜬다
    // 같은 기관을 다시 그릴 때는 본문 스크롤을 지킨다(기록 도착으로 act가 바뀌어도 맨 위로 튀지 않게). 다른 기관이면 맨 위.
    const body0 = el.querySelector ? el.querySelector('.db-pane-body') : null;
    const scrollTop0 = body0 && st.paneSel === st.sel ? body0.scrollTop : 0;
    st.paneSel = st.sel;
    const a0 = document.activeElement;   // 상세 안에서 포커스가 있던 칸(id 있는 요소)은 다시 그린 뒤 같은 칸·커서로 돌린다
    const keep = a0 && a0.id && el.contains && el.contains(a0) ? { id: a0.id, s: a0.selectionStart, e: a0.selectionEnd } : null;
    recSync(it);
    st.comp = false; st.compLater = false;   // 상세를 통째로 다시 그리면 조합도 끊긴다 — 미룬 다시 그리기 표시를 남기지 않는다
    el.innerHTML = dash.paneHtml(it, { act: act, early: act === 'confirm' && dash.proposeEarly(it.rec, gateOpts()), confirm: st.confirm && act === 'confirm', busy: st.busy,
      kb: dash.kbEntry(it.rec, root.KB_VERIFIED), next: dash.kbEntry(it.rec, root.KB_NEXT), role: ctx.role, today: todayDate(), headHtml: headSection(it),
      recordHtml: ie.isOpenCheck(it.rec) ? '' : recViewHtml(it), bank: bankView(it.rec) });
    if (st.confirm && act === 'confirm') { const b = $('db-do'); if (b) b.focus(); }
    else if (keep) { const t = $(keep.id); if (t && t.focus) { t.focus(); try { if (keep.s != null) t.setSelectionRange(keep.s, keep.e); } catch (e) { /* 날짜 칸 등 */ } } }
    if (scrollTop0) { const b1 = el.querySelector('.db-pane-body'); if (b1) b1.scrollTop = scrollTop0; }   // 포커스가 끌어간 스크롤을 원래 자리로
  }

  // ── 공고 상태 기록(2단계) 상세 칸: 이력 받기·초안·저장 ─────────────────────────────
  function recOn() { const n = NR(); return !!(n && n.canLoad && n.canLoad()); }
  function selItem() { return st.sel ? findItem(st.sel) : null; }
  function recId(it) { return it && it.rec && it.rec.institutionId ? String(it.rec.institutionId) : ''; }
  function profileName() { try { return String((root.store.loadProfile() || {}).name || '').trim(); } catch (e) { return ''; } }
  function recToday() { const n = NR(), l = logic.localDateStr(todayDate()); return n && n.today ? n.today(l) : l; }
  function stageLabel(cd) { return cd ? ((dash.STAGES[dash.stageOf(cd)] || {}).label || '') : ''; }
  function recCur() { const n = NR(); return st.rec.hist && n ? n.currentOf(st.rec.hist) : null; }
  function recDraft(it) { const n = NR(); return st.drafts[recId(it)] || n.blankDraft(recCur()); }
  // 사번이 바뀌면 앞 사람의 초안·이력을 버린다(noticerec의 sync와 같은 기준). 처음 보는 사번이면 기록만 한다.
  function recGuard() {
    const n = NR(), e = n && n.emp ? n.emp() : '';
    if (st.empSeen === e) return false;
    const changed = st.empSeen !== undefined;
    st.empSeen = e;
    if (changed) { st.drafts = {}; st.rec = recFresh(''); }
    return changed;
  }
  dash.recGuard = recGuard;
  dash.recState = function () { return st; };   // 시험용
  function recSync(it) {   // 상세 칸이 기관을 바꿀 때마다 이력을 한 번 받는다(같은 기관 다시 그리기는 받지 않는다)
    recGuard();
    const id = recId(it);
    if (!id || !recOn() || ie.isOpenCheck(it.rec)) { if (st.rec.id) st.rec = recFresh(''); return; }
    if (st.rec.id === id) return;
    st.rec = recFresh(id);
    recLoadHist(false);
  }
  function recLoadHist(quiet) {
    const r = st.rec, n = NR(), my = ++r.seq;
    if (!quiet || !r.hist) r.histSt = 'loading';
    return n.fetchHistory(r.id).then(function (x) {
      if (st.rec !== r || my !== r.seq || !host) return;
      r.histSt = x.status; r.histCode = x.code || 0; r.hist = x.status === 'ok' ? x.data : null;
      repaintRec();
    });
  }
  function recViewHtml(it) {
    const n = NR(), r = st.rec, id = recId(it);
    if (!n) return '';
    if (!id || !recOn()) return dash.recordSecHtml(it, { state: 'offline' });
    return dash.recordSecHtml(it, { state: r.histSt === 'idle' ? 'loading' : r.histSt, code: r.histCode, listState: n.state ? n.state() : '', listCode: n.listCode ? n.listCode() : 0, hist: r.hist, cur: recCur(), canEdit: n.canEdit(),
      draft: st.drafts[id] || null, errs: r.errs, err: r.err, busy: r.busy, cf: r.cf ? { stage: stageLabel(r.cf.state) } : null,
      who: profileName(), today: recToday(), rv: dash.recView(it), histOpen: r.histOpen });
  }
  function repaintRec() {   // 기록 절만 바꾼다(스크롤·다른 절은 그대로)
    const it = selItem(), sec = $('db-rec');
    if (!it || !sec) return;
    st.comp = false; st.compLater = false;   // renderPane과 같게 — 다시 그리면 한글 조합도 끊긴다(qa F4)
    const a = document.activeElement, keep = a && a.id && sec.contains(a) ? a.id : '';
    const s0 = keep && a.selectionStart != null ? a.selectionStart : null, e0 = keep && a.selectionEnd != null ? a.selectionEnd : null;
    sec.outerHTML = recViewHtml(it);
    if (keep) {
      const t = $(keep);
      if (t && t.focus) { t.focus(); try { if (s0 != null) t.setSelectionRange(s0, e0); } catch (e) { /* 날짜 칸 등 */ } }   // 커서 위치도 지킨다
    }
  }
  // 기록 목록이 바뀌었을 때(current 도착·403 재확인 뒤) 고른 기관의 기록 절도 다시 그린다. 초안은 st.drafts에 있어 입력은 그대로다.
  function onRecChange() {
    if (!host || !M) return;
    const changed = recGuard();
    renderList();
    const it = selItem();
    // 사번이 바뀌어 이력이 비워졌으면 고른 기관의 이력을 다시 받는다(안 받으면 '불러오는 중'에서 멈춘다 — qa N-1)
    if (changed && it) recSync(it);
    if (st.comp && !changed) { st.compLater = true; return; }   // 한글 조합 중이면 다시 그리기를 조합이 끝난 뒤로 미룬다(qa N-5)
    // 기록이 도착하면 [제안 확정] 노출도 달라진다(11-17) — 버튼 줄이 바뀌면 상세를 통째로 다시 그린다(입력 칸 포커스·커서는 renderPane이 지킨다)
    if (it && $('db-pane') && st.act !== undefined && st.act !== paneAct(it, actCtx(), dash.activePreps(st.preps))) { renderPane(); return; }
    if (it && $('db-rec')) repaintRec();
  }
  function recCompEnd() {
    st.comp = false;
    if (!st.compLater) return;
    st.compLater = false;
    const it = host && M ? selItem() : null;
    if (!it) return;
    // 조합 중에 도착한 기록이 버튼 줄을 바꿨다면 조합이 끝난 지금 다시 판정한다(안 하면 옛 문구가 다음 다시 그리기까지 남는다)
    if ($('db-pane') && st.act !== undefined && st.act !== paneAct(it, actCtx(), dash.activePreps(st.preps))) { renderPane(); return; }
    if ($('db-rec')) repaintRec();
  }
  function recFocusField(k) {
    const t = host && host.querySelector(k === 'status' ? '#db-rec input[name="rec-state"]' : (k === 'next' ? '#db-rec-next' : '#db-rec-op'));
    if (t && t.focus) t.focus();
  }
  function recDirtyUi(it) {
    const n = NR(), id = recId(it), dirty = !!st.drafts[id] && !n.sameDraft(st.drafts[id], n.blankDraft(recCur()));
    const dd = $('db-rec-dirty'), rb = $('db-rec-revert');
    if (dd) dd.hidden = !dirty;
    if (rb) rb.hidden = !dirty;
  }
  function recInput(el) {
    const it = selItem();
    if (!it || !recOn()) return;
    const d = Object.assign({}, recDraft(it));
    if (el.id === 'db-rec-next') d.next = el.value; else d.opinion = el.value;
    st.drafts[recId(it)] = d;
    const key = el.id === 'db-rec-next' ? 'next' : 'opinion';
    if (st.rec.errs[key]) {   // 고치기 시작하면 그 칸의 오류는 지운다
      delete st.rec.errs[key];
      const p = $(el.id === 'db-rec-next' ? 'db-rec-next-err' : 'db-rec-op-err'); if (p) p.textContent = '';
      el.removeAttribute('aria-invalid');
    }
    recDirtyUi(it);
  }
  function recPick(value) {
    const it = selItem();
    if (!it) return;
    const d = Object.assign({}, recDraft(it)); d.status = value;
    st.drafts[recId(it)] = d;
    st.rec.errs = Object.assign({}, st.rec.errs); delete st.rec.errs.status;
    repaintRec();
    const c = host.querySelector('#db-rec input[name="rec-state"]:checked'); if (c && c.focus) c.focus();
  }
  function recSave(confirmed) {
    const it = selItem(), r = st.rec, n = NR();
    if (!it || !n || r.busy || r.histSt !== 'ok') return;
    if (!n.canEdit()) { flash('저장할 수 있는 권한이 없습니다. 공고 상태 기록은 영업팀이 저장합니다.', true); return; }
    const id = recId(it), cur = recCur(), d = recDraft(it), errs = n.validate(d, recToday());
    const first = n.FIELD_ORDER.filter(function (k) { return errs[k]; })[0];
    if (first) { r.errs = errs; r.err = ''; r.cf = null; repaintRec(); recFocusField(first); return; }
    r.busy = true; r.err = ''; r.errs = {}; r.cf = null; repaintRec();
    n.save(id, n.body(d, cur, it), confirmed).then(function (x) { recDone(r, id, n.outcome(x)); },
      function () { recDone(r, id, { kind: 'alert', msg: '저장하지 못했습니다. 서버가 응답하지 않습니다. 잠시 뒤 [기록 저장]을 다시 누르세요.' }); });
  }
  function recDone(r, id, o) {
    const n = NR(), same = st.rec === r;
    r.busy = false;
    if (o.kind === 'saved' || o.kind === 'nochange') {
      delete st.drafts[id];
      flash(o.msg, false);
      const key = st.sel, tabAt = st.tab;
      // 배지·목록·팝업이 onChange로 다시 그려진다. 저장 응답 round_closed(NO_BID로 회차가 닫힘)여도 같은 경로로 목록을 다시 받는다
      Promise.resolve(n.load()).then(function () {   // P3-8: 목록을 다시 받은 뒤 그 기관이 지금 보기에서 빠졌으면 저장 안내 끝에 한 문장
        if (!host || !M || !same || st.sel !== key || st.tab !== 'ov' || tabAt !== 'ov' || st.flash !== o.msg) return;
        const it = selItem(), note0 = it ? dash.moveNote(it.overdue ? dash.recView(it).view : '', st.ovView, !!it.overdue) : dash.moveNote('', st.ovView, false);
        const note = dash.moveNoteIf(n.state ? n.state() : '', note0);   // F1: 목록을 못 받았으면(error·denied 등) 옮김 판정을 믿을 수 없어 붙이지 않는다
        if (note) flash(o.msg + ' ' + note, false);
      });
      if (!same) return;
      r.err = ''; r.errs = {}; r.cf = null;
      // round_closed면 이력의 닫힌 회차(close_reason_cd NO_BID)를 다시 받아 읽기용으로 보이게 하고, 새 회차 저장은 round_seq null·base_rev_no 0으로 간다
      recLoadHist(true).then(function () { const b = $('db-rec-save'); if (b && b.focus) b.focus(); });   // 저장 뒤 포커스는 저장 버튼
      return;
    }
    if (o.recheck || o.reload) n.load();          // 권한(can_edit)·최신 기록이 바뀌었을 수 있다
    if (!same) { if (o.kind !== 'confirm') flash(o.msg || '저장하지 못했습니다.', true); return; }   // 저장 중에 다른 기관으로 옮겨도 실패 안내는 남긴다
    r.err = ''; r.errs = {}; r.cf = null;
    if (o.kind === 'field') r.errs[o.field] = o.msg;
    else if (o.kind === 'confirm') r.cf = { state: o.prep };
    else r.err = o.msg;
    repaintRec();
    if (o.kind === 'field') recFocusField(o.field);
    else if (o.kind === 'confirm') { const b = $('db-rec-cf-yes'); if (b && b.focus) b.focus(); }
    else { const a = $('db-rec-alert'); if (a && a.focus) a.focus(); }
    if (o.reload) recLoadHist(true);              // 먼저 저장된 최신 기록을 위에 보인다(입력은 그대로)
  }
  // ── 금고 약정(NEXT 89): 상세 '현재 금고 은행' 절 ─────────────────────────────────
  // 약정 응답은 표시용일 뿐 rec.bank·현황판 '국민은행이 맡은 기관' 계산에 섞지 않는다. 서버 모드·로그인·등록 기관일 때만 받는다(아니면 null → 기존 세 갈래).
  function bankView(rec) { const b = BC(); return b && rec && rec.institutionId ? b.view(String(rec.institutionId)) : null; }
  let offBank = null;
  function bankWatch() { const b = BC(); if (!offBank && b && b.onChange) offBank = b.onChange(bankRepaint); }
  function bankUnwatch() { if (offBank && !host && !dm.cur) { offBank(); offBank = null; } }
  function bankRepaint() {   // 약정 응답이 바뀌면 상세를 다시 그리되 스크롤·포커스는 지킨다
    if (dm.cur) { dmRender(); return; }
    if (!host || !M || !st.sel) return;
    const b0 = host.querySelector('.db-pane-body'), top = b0 ? b0.scrollTop : 0;
    const a = document.activeElement, keep = a && a.id && host.contains(a) && /^bk-/.test(a.id) ? a.id : '';
    renderPane();
    const b1 = host.querySelector('.db-pane-body'); if (b1) b1.scrollTop = top;
    if (keep) { const t = $(keep); if (t && t.focus) t.focus(); }
  }
  function bankToggle(e, id) {   // [수정 이력 n건 보기]를 펼칠 때만 이력을 받는다
    const tg = e.target, b = BC();
    if (b && id && tg && tg.classList && tg.classList.contains('bk-hist')) b.setHistOpen(id, !!tg.open);
  }

  function setOvView(v) {
    st.ovView = (v === 'delayed' || v === 'done') ? v : 'pending';
    if (!M) return;
    const it = selItem();
    if (it && it.overdue && st.tab === 'ov' && !(st.chkOpen && openCheckItem(st.sel))) {
      const f = { q: st.q, region: st.region, type: st.type };
      const keys = logic.splitOverdue(dash.filterItems(M.overdue, f), curSnap(), logic.localDateStr(todayDate()))[st.ovView].map(function (x) { return x.key; });
      if (keys.indexOf(st.sel) < 0) { st.sel = ''; st.confirm = false; renderPane(); }   // 새 보기에 없는 기관의 상세는 닫는다
    }
    renderList();
  }

  function flash(msg, isErr) {
    st.flash = isErr ? '' : msg;
    const f = $('db-flash');
    if (f) f.textContent = isErr ? '' : msg;
    const e = $('db-err');
    if (e) { st.err = isErr ? msg : ''; renderBanner(); }
  }

  function renderAll() { if (!M) return; renderBanner(); renderNotice(); renderStrip(); renderList(); renderPane(); }

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

  // 행의 '사전준비 중' 배지에 쓰는 /preps만 받는다(영업 계열만 받음). 권한 밖·실패면 배지만 빠진다.
  function loadProgress() {
    if (!serverMode() || !hasEmp()) { st.prepSt = 'offline'; st.preps = null; renderPane(); return Promise.resolve(); }
    const my = ++seq;
    st.prepSt = 'loading';
    return fetchJson('/preps').then(function (p) {
      if (my !== seq || !host) return;
      st.prepSt = p.status; st.prepCode = p.code || 0;
      st.preps = p.status === 'ok' ? (Array.isArray(p.data) ? p.data : (p.data && p.data.items) || []) : null;
      renderList(); renderPane();
    });
  }

  function goPrep(prep) {
    const P = root.prep, A = root.app;
    if (!P || !A || !A.openNavItem || !P.SOON_ID) return false;
    A.openNavItem(P.SOON_ID);
    if (P.openCase && prep) P.openCase(prep.bid_case_id || prep.bidCaseId);
    return true;
  }

  // [확정] POST 공용. prep.js가 있으면 그 요청 경로(화면 머리글·캐시 무효화)를 쓰고, 없으면 같은 머리글을 직접 달아 보낸다.
  // 반환은 confirmFail이 받는 { r:{ok,status}, body } 모양. 네트워크 실패는 던진다.
  dash.postConfirm = function (id, screen) {
    const P = root.prep;
    if (P && P.postConfirm) {
      return P.postConfirm(id, screen).then(function (j) {
        return { r: { ok: true, status: 200 }, body: (j && Object.keys(j).length) ? j : null };
      }, function (e) {
        if (e && e.status) return { r: { ok: false, status: e.status }, body: { detail: e.detail } };
        throw e;
      });
    }
    return fetch('/preps', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Screen-Id': screen, 'X-Button-Id': 'confirm' },
      body: JSON.stringify({ institution_id: id }) })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (body) { return { r: r, body: body }; }); });
  };

  // [제안 확정] 실패 응답 → { again: 이미 진행 중이라 목록을 다시 받아야 함, msg: 화면 문구 }. 현황판·지도 상세 팝업 공용.
  dash.confirmFail = function (x) {
    const e = root.errtext ? root.errtext.parse(x.body && x.body.detail) : { code: '', message: '' };
    if (e.code === 'PREP_ALREADY_ACTIVE') return { again: true, msg: '' };
    const known = root.prep && root.prep.ERR_BY_CODE && root.prep.ERR_BY_CODE[e.code];
    const msg = (known && (known.message || known.text)) || e.message ||
      ((x.r.status === 401 || x.r.status === 403) ? '제안 확정 권한이 없습니다(' + x.r.status + '). 로그인 사번과 권한을 확인하세요.'
        : '제안 확정하지 못했습니다(' + x.r.status + '). 잠시 뒤 다시 시도하세요.');
    return { again: false, msg: String(msg) };
  };
  function doConfirm() {
    const it = st.sel ? findItem(st.sel) : null;
    const id = it && it.rec.institutionId;
    if (!it || !id || st.busy) return;
    st.busy = true; renderPane();
    dash.postConfirm(id, 'bid_notice')   // 입찰 공고 현황의 [제안 확정] — 감사 기록의 화면 이름(서버 허용 목록에 반영됨)
      .then(function (x) {
        st.busy = false; st.confirm = false;
        if (x.r.ok) {
          flash(it.name + dash.josaEul(it.name) + ' 제안 확정했습니다. 다음은 [개설 신청]입니다.', false);
          return loadProgress().then(function () {
            const made = activeFor(it.rec);
            if (!goPrep(made || x.body)) renderPane();
          });
        }
        const f = dash.confirmFail(x);
        if (f.again) return loadProgress();   // 버튼이 [사전준비 열기]로 바뀐다
        flash(f.msg, true);
        renderPane();
      })
      .catch(function () { st.busy = false; flash('서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인하세요.', true); renderPane(); });
  }

  const SKELETON =
    '<section id="db-root" aria-label="입찰 공고 현황">' +
    '<div class="db-top"><h2>입찰 공고 현황</h2><span class="sub">전국 공고와 입찰 예정(전국 지도와 같은 기관)</span><span class="meta">기준일 <b id="db-asof"></b></span></div>' +
    '<section class="pnl db-nb" id="db-notice" aria-labelledby="db-nb-h" hidden></section>' +
    '<div id="db-flash" class="db-flash" role="status"></div><div id="db-err" class="db-state db-banner" role="alert" style="display:none"></div>' +
    '<section class="pnl db-tl" id="db-tl" aria-labelledby="db-tl-h"></section>' +
    '<div class="db-work"><section class="db-list" aria-label="공고 목록"><div class="db-list-head">' +
    '<div class="db-tabs" id="db-tabs" role="tablist" aria-label="공고 목록 보기"></div>' +
    '<fieldset class="db-per" id="db-per"></fieldset><fieldset class="db-per" id="db-ovview" hidden></fieldset><div class="db-filters" id="db-filters">' +
    '<input id="db-q" type="search" placeholder="기관명 검색" aria-label="기관명 검색"><select id="db-region" aria-label="지역"></select>' +
    '<select id="db-type" aria-label="기관 종류" style="display:none"></select></div></div>' +
    '<div class="db-scroll" id="db-scroll" role="tabpanel" aria-busy="true"><p class="db-state" aria-busy="true">기관 목록을 불러오는 중입니다…</p></div>' +
    '<div class="db-foot" id="db-foot"></div></section>' +
    '<section class="db-pane" id="db-pane" aria-labelledby="db-name"></section></div></section>';

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

  // 선택한 기관이 지금 보이는 목록(현재 탭)에 없으면 선택을 풀어 listbox와 상세가 어긋나지 않게 한다.
  function pruneSelection() {
    if (!M || !st.sel) return;
    if (st.tab === 'ov' && st.chkOpen && openCheckItem(st.sel)) return;   // 개원 확인 필요 목록(경과 탭 맨 아래)에서 고른 기관은 기간 창과 무관하다
    const f = { q: st.q, region: st.region, type: st.type };
    const vis = dash.visibleKeys(M, st.win, f, st.tab);
    if (vis.indexOf(st.sel) < 0) { st.sel = ''; st.confirm = false; markSelected(); renderPane(); }
  }

  // 탭을 바꾼다(선택하면 바로 바뀐다 — 기간 버튼과 같은 자동 선택). focus면 새 탭 버튼으로 포커스를 둔다.
  function setTab(t, focus) {
    st.tab = t === 'ov' ? 'ov' : 'up';
    if (!M) return;
    pruneSelection();
    renderList();
    if (focus) { const b = $('db-tab-' + st.tab); if (b) b.focus(); }
  }

  // 경과 칸·로그인 팝업의 [입찰 공고 현황에서 보기]: 경과 탭으로 바꾸고 그 목록(없으면 탭)으로 포커스·스크롤한다.
  function showPast() {
    st.tab = 'ov'; st.ovView = 'pending';
    if (M) { pruneSelection(); renderList(); }
    const tb = $('db-tab-ov');
    if (tb && tb.scrollIntoView) tb.scrollIntoView({ block: 'nearest' });
    const lb = $('db-pastlist') || tb;
    if (lb && lb.focus) lb.focus();
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
      if (fl && fl.classList) fl.classList.toggle('has-type', !!show);   // 배치는 index.html의 .db-filters.has-type이 맡는다
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
    if (st.sel && !findItem(st.sel)) st.sel = '';   // 데이터가 바뀌어 사라진 기관(개원 확인 필요 목록 포함)
    else if (st.sel && !(st.tab === 'ov' && st.chkOpen && openCheckItem(st.sel)) && dash.visibleKeys(M, st.win, { q: st.q, region: st.region, type: st.type }, st.tab).indexOf(st.sel) < 0) st.sel = '';   // 저장된 기간 밖
    // 고른 곳이 없으면 자동 선택(마감 전 가장 가까운 곳 → 기간 창 첫 행) — 상세 칸이 빈 상자로 열리지 않게. 포커스는 옮기지 않는다.
    if (!st.sel) st.sel = dash.autoSelectKey(M, st.win, { q: st.q, region: st.region, type: st.type });
    renderAll();
  }

  function onKey(e) {
    if (e.key === 'Escape' && st.rec.cf && !st.rec.busy) { st.rec.cf = null; repaintRec(); const b = $('db-rec-save'); if (b && b.focus) b.focus(); return; }
    if (e.key === 'Escape' && st.confirm) {
      st.confirm = false; renderPane();
      const b = $('db-cf'); if (b) b.focus();
      return;
    }
    // 탭: ←→·Home·End로 움직이고 선택하면 바로 바뀐다.
    const tb = e.target && e.target.closest ? e.target.closest('[role=tab]') : null;
    if (tb && host.contains(tb)) {
      const order = ['up', 'ov'], i = order.indexOf(st.tab);
      let nx = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') nx = order[(i + 1) % 2];
      else if (e.key === 'Home') nx = order[0];
      else if (e.key === 'End') nx = order[1];
      if (nx) { e.preventDefault(); setTab(nx, true); }
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
    const tabBtn = t.closest('[role=tab]');
    if (tabBtn && host.contains(tabBtn)) { setTab(tabBtn.getAttribute('data-tab'), true); return; }
    const row = t.closest('.db-row');
    if (row && host.contains(row)) { select(row.getAttribute('data-key'), row.closest('[role=listbox]')); return; }
    // 띠 카드: 목록 선택과 상세 칸이 같이 바뀐다(목록 쪽 그 행으로 스크롤). 포커스는 눌린 카드에 그대로 둔다.
    const card = t.closest('.db-nb-card');
    if (card && host.contains(card)) { select(card.getAttribute('data-key')); return; }
    // 기관장 카드의 [편집]·[기관장 추가]·[새로 고침] (headcard.js가 모달·요청을 맡는다)
    const hcb = t.closest('[data-hc]');
    if (hcb && host.contains(hcb) && root.headcard) {
      root.headcard.onPaneClick(hcb.getAttribute('data-hc'), function () { return headEnv(findItem(st.sel)); });
      return;
    }
    const btn = t.closest('button');
    if (!btn) return;
    switch (btn.id) {
      case 'db-nb-wait': { const o = host.querySelector('.db-row[data-check="1"]'); const lb = o && o.closest('[role=listbox]'); if (o && o.scrollIntoView) o.scrollIntoView({ block: 'nearest' }); if (lb) lb.focus(); break; }
      case 'db-nb-more': { const lb = $('db-nlb'); if (lb) { if (lb.scrollIntoView) lb.scrollIntoView({ block: 'nearest' }); lb.focus(); } break; }
      case 'db-chk': {
        const wasSel = st.sel && openCheckItem(st.sel);
        st.chkOpen = !st.chkOpen;
        if (!st.chkOpen && wasSel) { st.sel = ''; renderPane(); }   // 접으면 그 목록에서 고른 기관의 상세도 닫는다
        renderList(); { const b = $('db-chk'); if (b) b.focus(); } break;
      }
      case 'db-edit': { const it = st.sel ? findItem(st.sel) : null; if (it && root.app && root.app.openEdit) root.app.openEdit(it.rec, { from: 'bid_notice', focus: 'status' }); break; }
      case 'db-rec-save': recSave(false); break;
      case 'db-rec-cf-yes': st.rec.cf = null; recSave(true); break;
      case 'db-rec-cf-no': st.rec.cf = null; repaintRec(); { const b = $('db-rec-save'); if (b && b.focus) b.focus(); } break;
      case 'db-rec-revert': { const it = selItem(); if (it) { delete st.drafts[recId(it)]; st.rec.errs = {}; st.rec.err = ''; repaintRec(); const b = $('db-rec-save'); if (b && b.focus) b.focus(); } break; }
      case 'db-rec-retry': recLoadHist(false); break;
      case 'bk-edit': { const it = selItem(); if (it && root.app && root.app.openEdit) root.app.openEdit(it.rec, { from: 'bid_notice', focus: 'bank' }); break; }
      case 'bk-retry': { const it = selItem(), b = BC(); if (it && b) b.load(recId(it)); break; }
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
      case 'db-reload':
        if (root.app && root.app.bootstrapServer) root.app.bootstrapServer().then(function () { refreshData(); loadProgress(); });
        break;
      default: break;
    }
  }

  // ── 지도 상세 팝업(2026-11-13, 사용자 결정): 지도에서 기관을 누르면 현황판 오른쪽 상세 칸과 같은 내용을 모달로 연다 ──
  // 현황판 상태(st·host·M)를 건드리지 않는다. 열려 있는 동안만 dm.cur = { el, rec, it, opener, preps, prepSt, confirm, busy, down }.
  // 기관장 카드는 headcard가 한 기관만 쥔다 — 열 때 ensure(화면 이름 map_popover)로 잡고, 닫을 때 reset한다.
  const dm = { cur: null };

  // 지도의 기관 한 건 → 상세 칸이 쓰는 항목. 현황판 목록의 같은 기관 항목과 같다(날짜 있는 기관). 날짜가 없으면 unknown 항목.
  dash.itemForRec = function (rec, today) {
    const m = dash.model([rec], today);
    const it = m.notice.concat(m.upcoming, m.later, m.overdue)[0];
    if (it) return it;
    return { key: logic.instKey(rec), rec: rec, name: rec.name || '', region: rec.region || '', date: '', days: null, confidence: '',
      label: '', basis: '', check: false, band: 'unknown', overdue: false, unknown: true };
  };

  function dmFlash(msg, isErr) {
    const m = dm.cur;
    if (!m) return;
    const f = m.el.querySelector('#dm-flash'), e = m.el.querySelector('#dm-err');
    if (f) f.textContent = isErr ? '' : msg;
    if (e) { e.textContent = isErr ? msg : ''; e.hidden = !isErr; }
  }
  function dmRepaint() { if (dm.cur) dmRender(); }
  function dmHeadEnv(m) {
    return { serverMode: serverMode(), hasEmp: hasEmp(), role: role(), emp: empNo(), today: todayDate(), bid: headBid(m.it), repaint: dmRepaint, screen: m.screen };
  }
  function dmActives(m) {
    const id = m.rec && m.rec.institutionId;
    return id ? dash.activePreps(m.preps).filter(function (p) { return instId(p) === id; })[0] || null : null;
  }

  function dmRecState() {
    const n = NR(), A = root.app, N = root.nav;
    return { state: n && n.state ? n.state() : 'offline', snap: n && n.snap ? n.snap() : null, canEdit: !!(n && n.canEdit && n.canEdit()),
      canGo: !!(A && A.findNavItem && N && N.NOTICE_ID && A.findNavItem(N.NOTICE_ID) && root.dashboard && root.dashboard.mount) };
  }
  // 상세를 다시 그린다. 위 상자(#dm-box)·알림 줄은 그대로 두고 #dm-pane만 바꾸며, 스크롤·포커스를 이어 준다.
  function dmRender() {
    const m = dm.cur;
    if (!m) return;
    const pane = m.el.querySelector('#dm-pane');
    if (!pane) return;
    const body0 = pane.querySelector('.db-pane-body');
    const top = body0 ? body0.scrollTop : 0;
    const a = document.activeElement;
    const inPane = !!(a && pane.contains && pane.contains(a));
    const keepId = inPane ? (a.id || '') : '';
    const keepHc = inPane && a.getAttribute ? (a.getAttribute('data-hc') || '') : '';
    const ctx = actCtx();
    let act = dash.actionKind(m.rec, ctx, dash.activePreps(m.preps), root.prep, gateOpts());
    if (m.prepSt === 'loading' && act !== 'unavailable') act = 'wait';   // 진행 중인지 모르는 동안 [제안 확정]을 보였다 바꾸지 않는다
    const raw = root.render && root.render.popRawHtml ? root.render.popRawHtml(m.rec) : '';
    pane.innerHTML = dash.paneHtml(m.it, {
      act: act, early: act === 'confirm' && dash.proposeEarly(m.rec, gateOpts()), confirm: m.confirm && act === 'confirm', busy: m.busy, kb: dash.kbEntry(m.rec, root.KB_VERIFIED), next: dash.kbEntry(m.rec, root.KB_NEXT), role: ctx.role, today: todayDate(),
      headHtml: root.headcard ? root.headcard.paneSection(m.rec, dmHeadEnv(m)) : undefined,
      recordHtml: ie.isOpenCheck(m.rec) ? '' : dash.recordBriefHtml(m.it, dmRecState()), bank: bankView(m.rec),
      nameId: 'dm-name',
      mapHtml: '<button type="button" id="dm-edit">편집</button><button type="button" id="dm-close">닫기</button>',
      tailHtml: raw ? '<div class="db-sec"><details class="pop-raw"><summary>원본 정보</summary>' + raw + '</details></div>' : '',
    });
    const nb = pane.querySelector('.db-pane-body');
    if (nb) nb.scrollTop = top;
    if (inPane) {   // 다시 그린 요소로 포커스를 돌린다(없으면 제목으로)
      let t = keepId ? pane.querySelector('#' + keepId) : null;
      if (!t && keepHc) t = pane.querySelector('[data-hc="' + keepHc + '"]');
      if (!t) t = pane.querySelector('#dm-name');
      if (t && t.focus) t.focus();
    }
    if (m.confirm && act === 'confirm') { const b = pane.querySelector('#db-do'); if (b) b.focus(); }
    // 현황판 줄의 [제안 확정]으로 열었으면(opts.focus === 'confirm') 팝업의 [제안 확정]이 그려지는 순간 한 번만 포커스를 옮긴다. 받는 중(wait)에는 기다린다.
    // 사용자가 팝업 안에서 이미 다른 요소로 포커스를 옮겼으면(초기 포커스 대상 #dm-name·#dm-box가 아니면) 끌고 가지 않고 포기한다(qa 11-17 P3-6).
    const fa = document.activeElement;
    if (m.focus === 'confirm' && fa && m.el && m.el.contains(fa) && fa.id !== 'dm-name' && fa.id !== 'dm-box') m.focus = '';
    if (m.focus === 'confirm' && !m.confirm) {
      const cf = pane.querySelector('#db-cf');
      if (cf) { cf.focus(); m.focus = ''; }
      else if (act !== 'wait') m.focus = '';   // 판정이 끝났는데 버튼이 없으면(이미 진행 중 등) 포기
    }
  }

  function dmLoadPreps(m) {
    if (!serverMode() || !hasEmp()) { m.prepSt = 'offline'; m.preps = null; return Promise.resolve(); }
    m.prepSt = 'loading';
    return fetchJson('/preps').then(function (r) {
      if (dm.cur !== m) return;
      m.prepSt = r.status;
      m.preps = r.status === 'ok' ? (Array.isArray(r.data) ? r.data : (r.data && r.data.items) || []) : null;
      dmRender();
    });
  }

  function dmDoConfirm(m) {
    const id = m.rec.institutionId;
    if (!id || m.busy) return;
    m.busy = true; dmRender();
    dash.postConfirm(id, m.screen)   // 지도 map_popover(기본)·현황판 bid_board
      .then(function (x) {
        if (dm.cur !== m) return;
        m.busy = false; m.confirm = false;
        if (x.r.ok) {
          m.changed = true;   // 닫을 때 현황판(kbboard)의 준비 중 제안·단계 집계를 다시 받게 한다
          if (goPrep(x.body)) { dash.closeDetail(false); return; }   // 사전준비 화면으로 간다(지도 팝업은 닫는다)
          dmFlash(m.it.name + dash.josaEul(m.it.name) + ' 제안 확정했습니다. 메뉴의 [제안서 사전준비 프로세스]에서 여세요.', false);
          return dmLoadPreps(m).then(function () { dmRender(); });
        }
        const f = dash.confirmFail(x);
        if (f.again) return dmLoadPreps(m);   // 버튼이 [사전준비 열기]로 바뀐다
        dmFlash(f.msg, true);
        dmRender();
      })
      .catch(function () { if (dm.cur !== m) return; m.busy = false; dmFlash('서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인하세요.', true); dmRender(); });
  }

  function dmClick(e) {
    const m = dm.cur, t = e.target;
    if (!m || !t) return;
    if (t === m.el) { if (m.down === m.el) dash.closeDetail(true); return; }   // 바깥(배경) 클릭 — 글을 드래그하다 배경에서 놓은 경우는 닫지 않는다
    if (!t.closest) return;
    const hcb = t.closest('[data-hc]');
    if (hcb && root.headcard) { root.headcard.onPaneClick(hcb.getAttribute('data-hc'), function () { return dmHeadEnv(m); }); return; }
    const btn = t.closest('button');
    if (!btn) return;
    switch (btn.id) {
      case 'dm-close': dash.closeDetail(true); break;
      case 'dm-rec-go': {
        const key = m.it.key;
        const opened = !!(root.app && root.app.openNavItem && root.nav && root.app.openNavItem(root.nav.NOTICE_ID));
        if (!opened) { const e = m.el.querySelector('#dm-flash'); if (e) e.textContent = '입찰 공고 현황을 열 수 없습니다. 왼쪽 메뉴의 [입찰 공고 현황]에서 여세요.'; break; }   // 열지 못하면 팝업을 닫지 않고 안내(kbboard openNotice와 같은 문구)
        dash.closeDetail(false);
        if (dash.selectKey) dash.selectKey(key);
        break;
      }
      case 'dm-edit': { const r = m.rec; dash.closeDetail(false); if (root.app && root.app.openEdit) root.app.openEdit(r, { from: m.screen, opener: m.opener }); break; }   // 편집 창이 팝업 뒤에 깔리지 않게 먼저 닫는다
      case 'bk-edit': { const r = m.rec; dash.closeDetail(false); if (root.app && root.app.openEdit) root.app.openEdit(r, { from: m.screen, opener: m.opener, focus: 'bank' }); break; }
      case 'bk-retry': { const b = BC(); if (b) b.load(String(m.rec.institutionId || '')); break; }
      case 'db-cf': m.confirm = true; dmRender(); break;
      case 'db-cancel': m.confirm = false; dmRender(); { const b = m.el.querySelector('#db-cf'); if (b) b.focus(); } break;
      case 'db-do': dmDoConfirm(m); break;
      case 'db-open': { const p = dmActives(m); if (p && goPrep(p)) dash.closeDetail(false); else dmFlash('사전준비 화면을 열지 못했습니다. 메뉴의 [제안서 사전준비 프로세스]에서 여세요.', true); break; }
      default: break;
    }
  }

  function dmKey(e) {
    const m = dm.cur;
    if (!m) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (m.busy) return;
      if (m.confirm) { m.confirm = false; dmRender(); const b = m.el.querySelector('#db-cf'); if (b) b.focus(); return; }
      dash.closeDetail(true);
      return;
    }
    if (e.key !== 'Tab') return;
    const f = Array.prototype.filter.call(m.el.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex="0"]'), function (x) {
      return !x.disabled && x.getAttribute('aria-disabled') !== 'true' && x.offsetParent !== null;
    });
    const box = m.el.querySelector('#dm-box');
    if (!f.length) { e.preventDefault(); if (box && box.focus) box.focus(); return; }
    const first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (e.shiftKey && (a === first || f.indexOf(a) < 0)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (a === last || !m.el.contains(a))) { e.preventDefault(); first.focus(); }
  }

  // opts.opener = 누른 카드·마커(닫으면 포커스가 돌아간다). opts.screen = 감사 기록 화면 이름(기본 'map_popover', 현황판은 'bid_board').
  // opts.fallback = opener가 사라졌을 때 포커스를 돌릴 선택자(현황판 '#hb-ours', 지도는 비움). 열었으면 true.
  // opts.refocus = opener가 사라졌을 때 닫은 뒤 포커스를 받을 새 요소를 돌려주는 함수(현황판: 같은 열의 같은 data-key 버튼). 없거나 null이면 fallback.
  // opts.focus = 'confirm'이면 팝업이 그려진 뒤 [제안 확정] 버튼으로 포커스를 옮긴다(현황판 2번 구획 줄의 [제안 확정]).
  dash.openDetail = function (rec, opts) {
    if (typeof document === 'undefined' || !rec) return false;
    if (dm.cur) dash.closeDetail(false);
    const m = { rec: rec, it: dash.itemForRec(rec, todayDate()), opener: (opts && opts.opener) || document.activeElement,
      screen: (opts && opts.screen) || 'map_popover', fallback: (opts && opts.fallback) || '', refocus: (opts && opts.refocus) || null, focus: (opts && opts.focus) || '', changed: false,
      preps: null, prepSt: 'offline', confirm: false, busy: false, down: null, el: null };
    const ov = document.createElement('div');
    ov.className = 'modal-overlay dm-ov';
    ov.id = 'dm-ov';
    ov.innerHTML = '<div class="modal-box dm-box" id="dm-box" role="dialog" aria-modal="true" aria-labelledby="dm-name" tabindex="-1">' +
      '<div id="dm-flash" class="db-flash" role="status"></div><div id="dm-err" class="db-state" role="alert" hidden></div>' +
      '<div id="dm-pane" class="dm-pane"></div></div>';
    m.el = ov;
    dm.cur = m;
    document.body.appendChild(ov);
    ov.addEventListener('mousedown', function (e) { m.down = e.target; });
    ov.addEventListener('click', dmClick);
    ov.addEventListener('keydown', dmKey);
    ov.addEventListener('toggle', function (e) { bankToggle(e, String(m.rec.institutionId || '')); }, true);
    bankWatch();
    dmLoadPreps(m);   // 상태를 받는 동안 'wait'로 그리고, 도착하면 다시 그린다
    dash.loadGoals().then(function () { if (dm.cur === m) dmRender(); });   // 올해 목표 기관 여부 — 공고 전 [제안 확정] 판정
    const nrm = NR();
    if (nrm && nrm.onChange) { m.offNr = nrm.onChange(function () { if (dm.cur === m) dmRender(); }); if (nrm.ensure) nrm.ensure(); }
    dmRender();
    const t = ov.querySelector('#dm-name') || ov.querySelector('#dm-box');
    if (t && t.focus) t.focus();
    return true;
  };

  dash.closeDetail = function (refocus) {
    const m = dm.cur;
    if (!m) return;
    dm.cur = null;
    if (m.offNr) m.offNr();
    bankUnwatch();
    if (root.headcard) root.headcard.reset();   // 열린 기관장 편집 창·사진 Blob 주소·대기 중 조회를 정리한다
    if (m.el && m.el.parentNode) m.el.parentNode.removeChild(m.el);
    if (m.changed && root.kbboard && root.kbboard.reload) root.kbboard.reload();   // 팝업에서 [제안 확정]을 했으면 현황판 집계를 다시 받는다
    if (refocus && typeof document !== 'undefined') {
      let o = m.opener;
      if (!(o && o.focus && document.body.contains(o))) {
        // 눌렀던 카드가 다시 그려져 사라졌으면 같은 자리의 새 요소(opts.refocus), 그것도 없으면 선택 강조된 카드로, 없으면 지도 영역으로(render.js Esc 처리와 같은 규칙)
        let again = null;
        if (typeof m.refocus === 'function') { try { again = m.refocus(); } catch (e) { again = null; } }
        o = (again && again.focus && document.body.contains(again) ? again : null) || (m.fallback && document.querySelector(m.fallback)) || document.querySelector('.rank-card.hi') || document.getElementById('map-stage');
        if (o && o !== again && !o.hasAttribute('tabindex')) o.setAttribute('tabindex', '-1');   // 다시 찾은 버튼은 그대로(이미 포커스 가능)
      }
      if (o && o.focus) o.focus();
    }
  };
  dash.isDetailOpen = function () { return !!dm.cur; };
  // 로그인 경과 팝업이 현황판 위에서 쓴다(overdue.js): 마운트 여부·경과 묶음 펼침+포커스.
  dash.isMounted = function () { return !!host; };
  dash.showPast = function () { if (host) showPast(); };
  // 현황판 알림 줄의 기관 칩: 입찰 공고 현황으로 옮긴 뒤 그 기관을 고른다(경과 기관이면 경과 탭).
  dash.selectKey = function (key) {
    if (!host || !M || !key || !findItem(key)) return false;
    const sit = findItem(key);
    st.tab = sit.overdue ? 'ov' : 'up';
    if (sit.overdue) st.ovView = dash.recView(sit).view;   // 그 기관이 든 보기로 열어 행이 보이게
    // 고른 기관이 지금 검색·지역·종류 조건에 걸러지면 조건을 지운 뒤 고른다. 기간 밖이면(다가오는 입찰 탭) 기간을 '전체'로 넓힌다(저장은 하지 않는다).
    const vis = function () { return dash.visibleKeys(M, st.win, { q: st.q, region: st.region, type: st.type }, st.tab).indexOf(key) >= 0; };
    if (!vis() && (st.q.trim() || st.region || st.type)) { st.q = ''; st.region = ''; st.type = ''; fillFilters(); }
    if (!vis() && st.tab === 'up' && st.win !== 'all') setWindow('all', false);
    renderList();
    const o = host.querySelector('[role=option][data-key="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]');
    const lb = o && o.closest ? o.closest('[role=listbox]') : null;
    select(key, lb);                                 // 목록 행이 있으면 그 목록으로, 없으면 상세 제목으로 포커스(body로 떨어지지 않게)
    if (!lb) { const h = $('db-name'); if (h && h.focus) h.focus(); }
    return true;
  };
  // kbboard.js가 같은 맥락(데이터·오늘·서버 모드)을 쓰게 한다 — 복사하지 않는다.
  // actCtx·gateOpts = 현황판 2번 구획 줄의 [제안 확정] 판정(actionKind)이 상세 팝업과 같은 맥락을 쓰게 한다.
  dash.util = { dataList: dataList, todayDate: todayDate, serverMode: serverMode, hasEmp: hasEmp, actCtx: actCtx, gateOpts: gateOpts };

  dash.mount = function (el) {
    if (!el) return;
    if (host) dash.unmount();
    host = el;
    ac = typeof AbortController === 'function' ? new AbortController() : null;
    const opt = ac ? { signal: ac.signal } : undefined;
    host.innerHTML = SKELETON;
    host.addEventListener('keydown', onKey, opt);
    host.addEventListener('click', onClick, opt);
    host.addEventListener('input', function (e) {
      if (e.target.id === 'db-q') { st.q = e.target.value; renderList(); }
      else if (e.target.id === 'db-rec-next' || e.target.id === 'db-rec-op') recInput(e.target);
    }, opt);
    host.addEventListener('compositionstart', function (e) { if (e.target && (e.target.id === 'db-rec-op' || e.target.id === 'db-rec-next')) st.comp = true; }, opt);
    host.addEventListener('compositionend', function (e) { if (e.target && (e.target.id === 'db-rec-op' || e.target.id === 'db-rec-next')) recCompEnd(); }, opt);
    host.addEventListener('toggle', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('db-rec-hist')) st.rec.histOpen = !!e.target.open;
      bankToggle(e, recId(selItem()));
    }, Object.assign({ capture: true }, opt || {}));
    bankWatch();
    host.addEventListener('change', function (e) {
      if (e.target.id === 'db-region') { st.region = e.target.value; renderList(); }
      else if (e.target.id === 'db-type') { st.type = e.target.value; renderList(); }
      else if (e.target.name === 'rec-state') recPick(e.target.value);
      else if (e.target.name === 'db-ov') setOvView(e.target.value);
      else if (e.target.name === 'db-per') setWindow(e.target.value, true);
    }, opt);
    st.confirm = false; st.busy = false; st.err = ''; st.flash = ''; st.tab = 'up';
    st.ovView = 'pending'; st.drafts = {}; st.rec = recFresh(''); st.comp = false; st.compLater = false;   // 이 화면을 떠나면 초안을 버린다
    const nrm = NR();
    if (nrm && nrm.onChange) offNr = nrm.onChange(onRecChange);   // 목록·고른 기관의 기록 절을 다시 그린다(포커스·커서·초안은 지킨다)
    st.empSeen = nrm && nrm.emp ? nrm.emp() : '';
    if (nrm && nrm.load) nrm.load();   // 열 때마다 최신 기록 목록
    st.win = dash.windowKey(root.store && root.store.loadDashWindow ? root.store.loadDashWindow() : dash.DEFAULT_WINDOW);
    const per = $('db-per');
    if (per) per.innerHTML = dash.periodHtml(st.win);
    refreshData();       // 고른 기관이 없으면 자동 선택한다(마감 전 가장 가까운 곳 → 기간 창 첫 행, 포커스 이동 없음). 선택은 세션 안에서만 기억한다.
    loadProgress();
    dash.loadGoals().then(function () {   // 올해 목표 기관을 받으면 공고 전 [제안 확정] 노출이 달라질 수 있다 — 버튼 줄이 바뀔 때만 다시 그린다(조합 중이면 건너뜀)
      const it = host && M ? selItem() : null;
      if (it && $('db-pane') && !st.comp && st.act !== undefined && st.act !== paneAct(it, actCtx(), dash.activePreps(st.preps))) renderPane();
    });
  };

  // 기관 편집 저장 뒤 서버 목록이 바뀌면 현황판(열려 있을 때만)을 다시 그린다.
  dash.refresh = function () { if (host && M) refreshData(); };

  dash.unmount = function () {
    seq += 1;
    if (offNr) { offNr(); offNr = null; }
    if (root.headcard) root.headcard.reset();   // 열린 편집 모달·사진 Blob 주소를 정리한다
    if (ac) ac.abort();
    ac = null;
    if (host) host.innerHTML = '';
    host = null; M = null;
    bankUnwatch();
  };

  if (isNode) module.exports = dash;
  else root.dashboard = dash;
})(typeof self !== 'undefined' ? self : this);
