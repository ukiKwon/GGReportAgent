(function (root) {
  'use strict';
  // 입찰 현황판(NEXT 77, 재설계). 규격: handoff/agents/design-reviewer/2026-11-11_1627_a41bdf71.md(+ 1445_aba6f113.md 1단계), 시안 docs/design/2026-11-11_입찰현황판_재설계_시안.html
  // 순수 부분(model·windowItems·moreHint·kindQueueModel·kindQueueHtml·stageCounts·termBar·railHtml·rowHtml·paneHtml 등)은 node 테스트 대상이고,
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

  // 다가오는 기관별 공고현황(종류별 가로 막대) — 월별 막대(D1)를 대체한다(2026-11-23).
  // 줄 5개 고정(교육청은 공공기관 줄에 합침), 구간 4개는 서로 겹치지 않는다. 막대에는 '다가오는 것'만 넣는다:
  //  m.upcoming 중 0~182일 + 예정일이 지난 m.overdue 중 공고 상태 기록이 '처리됨'이 아닌 것(= 공고 확인 어려움).
  //  날짜 미상·183일 넘는 곳·이미 공고가 난 곳(m.notice)은 넣지 않는다(공고 중은 머리 줄 meta가 센다).
  dash.KQ_KINDS = ['지자체', '공공기관', '법원', '대학', '병원'];
  dash.KQ_ORDER = ['m1', 'm3', 'm6', 'x'];
  dash.KQ_LABELS = { m1: '1개월 내', m3: '1~3개월', m6: '3~6개월', x: '공고 확인 어려움' };
  dash.KQ_BAR_MAX = 88;   // 가장 긴 줄의 막대 폭(%) — 나머지 12%는 줄 끝 숫자·최소 폭 여유
  dash.kqKind = function (rec) { const k = dash.kindOfRec(rec); return k === '교육청' ? '공공기관' : k; };
  dash.kqSeg = function (days) {   // 0~30 / 31~91 / 92~182(= URGENT_DAYS). 그 밖은 ''
    if (!(days >= 0)) return '';
    return days <= 30 ? 'm1' : days <= 91 ? 'm3' : days <= dash.URGENT_DAYS ? 'm6' : '';
  };
  dash.kqWidth = function (n, max) { return max > 0 ? Math.round(n / max * dash.KQ_BAR_MAX * 10) / 10 : 0; };
  // o = { today: Date, snap: 공고 상태 기록(생략=지금 값), ids: null|{기관ID:true}(목표·관심만) } → { rows:[{kind,m1,m3,m6,x,n}], max, conf, est, noticeN }
  dash.kindQueueModel = function (m, o) {
    o = o || {};
    const today = o.today || todayDate(), ids = o.ids || null;
    const snap = o.snap === undefined ? curSnap() : o.snap;
    const own = Object.prototype.hasOwnProperty;
    const rows = dash.KQ_KINDS.map(function (k) { return { kind: k, m1: 0, m3: 0, m6: 0, x: 0, n: 0 }; });
    const byKind = {};
    rows.forEach(function (r) { byKind[r.kind] = r; });
    let conf = 0, est = 0;
    const take = function (it, seg) {
      const k = dash.kqKind(it.rec), r = own.call(byKind, k) ? byKind[k] : null;
      if (!r || (ids && !own.call(ids, String(instId(it.rec))))) return;
      r[seg] += 1; r.n += 1;
      if (it.confidence === '확정') conf += 1; else est += 1;
    };
    ((m && m.upcoming) || []).forEach(function (it) { const s = dash.kqSeg(it.days); if (s) take(it, s); });
    const sp = logic.splitOverdue((m && m.overdue) || [], snap, logic.localDateStr(today));
    sp.pending.concat(sp.delayed).forEach(function (it) { take(it, 'x'); });
    let max = 0;
    rows.forEach(function (r) { if (r.n > max) max = r.n; });
    const noticeN = ((m && m.notice) || []).filter(function (it) { return !ids || own.call(ids, String(instId(it.rec))); }).length;   // 목표·관심 보기면 공고 중도 그 기관만 센다
    return { rows: rows, max: max, conf: conf, est: est, noticeN: noticeN };
  };
  // o = { canScope: [전체|목표·관심] 전환을 그릴까(목표 데이터를 받았을 때만), scope: 'all'|'mine', updated: '자료 수정' 날짜 }
  dash.kindQueueHtml = function (q, o) {
    o = o || {};
    const L = dash.KQ_LABELS;
    const scope = o.canScope ? '<fieldset class="db-per db-kq-scope" id="db-kq-scope"><legend class="sr-only">보는 기관</legend>' +
      [['all', '전체 기관'], ['mine', '목표·관심 기관']].map(function (d) {
        return '<label><input type="radio" name="db-kq-sc" value="' + d[0] + '"' + ((o.scope === 'mine' ? 'mine' : 'all') === d[0] ? ' checked' : '') + '><span>' + d[1] + '</span></label>';
      }).join('') + '</fieldset>' : '';
    const head = '<div class="db-h"><h2 id="db-kq-h">다가오는 기관별 공고현황</h2>' + scope + '<span class="meta">지금 공고 중 <b>' + q.noticeN + '</b>곳' +
      (o.updated ? ' · 자료 수정 <b>' + esc(o.updated) + '</b>' : '') + '</span></div>';
    const leg = '<ul class="db-kq-leg">' + dash.KQ_ORDER.map(function (k) {
      return '<li><i class="kq-s ' + k + '"></i>' + esc(L[k]) + (k === 'x' ? '(예정일이 지났는데 공고 확인이 안 된 곳)' : '') + '</li>';
    }).join('') + '</ul>';
    const rows = q.rows.map(function (r) {
      const on = dash.KQ_ORDER.filter(function (k) { return r[k] > 0; });
      const aria = r.kind + (r.kind === '공공기관' ? ', 교육청 포함' : '') + ': ' +
        (on.length ? on.map(function (k) { return L[k] + ' ' + r[k] + '곳'; }).join(', ') : '6개월 내 공고 예정 없음');
      const bar = on.length ? on.map(function (k) {
        return '<span class="kq-s ' + k + '" style="width:' + dash.kqWidth(r[k], q.max) + '%">' + (k === 'x' ? '<em>' + r[k] + '</em>' : r[k]) + '</span>';
      }).join('') : '<span class="db-kq-empty">6개월 내 예정 없음</span>';
      return '<li class="db-kq-row"><span class="db-kq-k">' + esc(r.kind) + '</span><div class="db-kq-bar" role="img" aria-label="' + esc(aria) + '">' + bar + '</div>' +
        '<span class="db-kq-n"><b>' + r.n + '</b>곳</span></li>';
    }).join('');
    const foot = '<div class="db-kq-foot"><span>입찰 예정일은 공고가 나기 전까지 추정입니다. 지금은 공고 확정 <b>' + q.conf + '</b>곳 · 추정 <b>' + q.est + '</b>곳</span>' +
      '<button type="button" id="db-kq-find" aria-controls="db-q">그 외 기간 찾기</button></div>';
    return head + leg + '<ul class="db-kq-rows">' + rows + '</ul>' + foot;
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
  const goalSt = { year: 0, ids: null, watch: null, st: 'idle', seq: 0 };
  dash.setGoals = function (data, today) {   // data = { year, items:[{institution_id}] }. 담았으면 true
    const y = (today || todayDate()).getFullYear();
    if (!data || Number(data.year) !== y || !Array.isArray(data.items)) return false;
    const ids = {}, watch = {};
    data.items.forEach(function (t) { const id = String(instId(t)); if (id) ids[id] = true; });   // isGoalRec·[제안 확정] 규칙은 목표(items)만 본다 — 관심 기관은 규칙 밖
    (Array.isArray(data.watch_items) ? data.watch_items : []).forEach(function (t) { const id = String(instId(t)); if (id) watch[id] = true; });   // 관심은 별도 집합(막대 '목표·관심 기관' 전환용)
    goalSt.seq += 1;   // 앞서 보낸 loadGoals 응답이 늦게 와서 이 집합을 덮지 못하게(qa 11-19 P3-1)
    goalSt.year = y; goalSt.ids = ids; goalSt.watch = watch; goalSt.st = 'ok';
    return true;
  };
  // 제안 확정 가능 역할(actionKind→prep.popoverAction과 같은 집합) — 아니면 목표 집합을 받지 않는다
  function canConfirmRole() {
    const P = root.prep, r = role();
    return !!(P && Array.isArray(P.CONFIRM_ROLES) && P.CONFIRM_ROLES.indexOf(r) >= 0);
  }
  dash.clearGoals = function () { goalSt.seq += 1; goalSt.year = 0; goalSt.ids = null; goalSt.watch = null; goalSt.st = 'idle'; };
  dash.loadGoals = function () {
    if (!serverMode() || !hasEmp() || !canConfirmRole()) { dash.clearGoals(); return Promise.resolve(); }
    const y = todayDate().getFullYear(), my = ++goalSt.seq;
    if (!goalSt.ids) goalSt.st = 'loading';
    return fetchJson('/bid-targets?year=' + encodeURIComponent(y)).then(function (r) {
      if (my !== goalSt.seq) return;
      if (r.status === 'ok' && dash.setGoals(r.data)) return;
      goalSt.ids = null; goalSt.watch = null; goalSt.year = 0; goalSt.st = r.status === 'ok' ? 'error' : r.status;   // 못 받으면 지금 규칙 그대로(공고 뒤에만)
    });
  };
  // 막대 '목표·관심 기관' 전환용: 올해 목표 + 관심 기관 ID 집합. 목표 데이터를 못 받았으면(권한 없음·오프라인) null → 전환을 숨긴다.
  dash.scopeIds = function () {
    if (!goalSt.ids) return null;
    const u = Object.assign({}, goalSt.watch || {}, goalSt.ids);
    return Object.keys(u).length ? u : null;   // 목표·관심이 하나도 없으면 전환을 숨긴다(빈 보기를 고르게 하지 않는다)
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
  // 입찰 없음·종료·지연·접수 기간 지남은 기관 단위 공고 상태라, 올해 목표 기관이면 막지 않는다(사용자 11-25 — 안 되는 경우는 최종본을 올릴 때 확인사항으로 안내). 아래 proposeGate가 덮는다.
  function gateCore(rec, o) {
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
  }
  const GATE_STATUS = { past: 1, closed: 1, nobid: 1, delayed: 1 };
  dash.proposeGate = function (rec, o) {
    const r = gateCore(rec, o);
    return GATE_STATUS[r] && dash.isGoalRec(rec, o && o.goals, (o && o.today) || todayDate()) ? 'confirm' : r;
  };
  // 순수: 목표 기관이라 'confirm'이 됐지만 공고 상태가 past·closed·nobid·delayed인가 → 그 상태 이름, 아니면 ''.
  dash.proposeStatus = function (rec, o) {
    const r = gateCore(rec, o);
    return GATE_STATUS[r] && dash.proposeGate(rec, o) === 'confirm' ? r : '';
  };
  // 확인 상자 본문 3 자리의 평문 한 줄(사실만, 기록하라는 지시·경고 없음)
  dash.PREP_STATUS_NOTE = {
    past: '공고 상태: 접수 기간이 지난 것으로 기록돼 있습니다. 사전준비는 그대로 시작할 수 있습니다.',
    closed: '공고 상태: 이번 회차 공고가 끝난 것으로 기록돼 있습니다. 사전준비는 그대로 시작할 수 있습니다.',
    nobid: "공고 상태: 이번 회차는 '입찰 없음'으로 기록돼 있습니다. 사전준비는 그대로 시작할 수 있습니다.",
    delayed: '공고 상태: 공고가 늦어지거나 재공고를 기다리는 것으로 기록돼 있습니다. 사전준비는 그대로 시작할 수 있습니다.' };
  // 순수: 이 'confirm'이 '공고 전 목표 기관 예외' 때문인가(안내 한 줄을 붙일지 정한다).
  dash.proposeEarly = function (rec, o) {
    return dash.proposeGate(rec, o) === 'confirm' && dash.proposeGate(rec, Object.assign({}, o, { goals: null })) === 'later';
  };
  // 버튼이 없을 때 db-why 한 줄(actHtml이 쓴다)
  dash.EARLY_WHY = '올해 목표 기관이라 공고 전에도 제안 사전준비를 시작할 수 있습니다.';
  // 확정 확인 상자 문구(사용자 11-25): 굵은 경고·[계속 진행] 분기는 없앴다 — 공고 전이면 평문 한 줄(본문 3)만 더한다. 한 곳에서 정해 현황판 툴바·상세 팝업이 같은 말을 쓴다.
  dash.PREP_CONFIRM_GO = '확정하고 이동';
  dash.PREP_BODY2 = '확정하면 [영업 추진 준비 › 제안 준비 현황]의 이 기관 화면으로 넘어갑니다. 그 화면에서 담당자를 정하면 사전준비가 시작되고, 영업팀장(팀장이 직접 시작하면 영업부장)에게 알림이 갑니다.';
  dash.PREP_BODY3 = '아직 입찰 공고 전인 기관입니다. 공고가 나면 일정을 다시 확인하세요.';
  dash.CONFIRM_WHY = {
    later: '입찰 공고가 나면 [제안 사전준비]를 쓸 수 있습니다.',
    closed: '이번 회차 공고가 끝났습니다.',
    past: "접수 기간이 지난 것으로 봅니다. 아직 접수 중이면 공고 상태를 '공고 진행 중'으로 기록하세요.",
    nobid: "이번 회차는 '입찰 없음'으로 닫혔습니다.",
    delayed: '공고가 늦어지거나 재공고를 기다리는 중입니다.',
    noconfirm: '협약 성과 화면에서는 제안을 확정하지 않습니다.' };
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
  // 120일을 넘긴 확정 공고(noticeExpired)는 '진행 중'이 아니라 '공고 후 n일 · 결과 공고를 확인하세요'이다(공고일 이름표 7곳이어도 확정이면 같은 문구,
  // 보조 문구는 dtNoteHtml이 붙인다). 문구는 logic.NOTICE_WORDS 한 곳. 추정 날짜 경과만 공고가 났는지부터 확인한다.
  dash.overdueNote = function (it) {
    const expired = it.noticeExpired !== undefined ? it.noticeExpired : it.kind === 'fixed';
    return expired ? logic.NOTICE_WORDS.expiredNote(it.days) : '공고가 났는지 확인이 필요합니다';
  };
  // 공고일 이름표 7곳(logic.OVERDUE_CHECK_KEYS): 날짜는 금고 지정 공고일이다(데이터 검수 11-23). 뜻이 분명하니 빨강·밑줄 없이 날짜 아래에 회색 보조 문구 한 줄만 둔다.
  function dtNoteHtml(it) { return it.check ? '<span class="dt-note">' + esc(logic.checkDateNote(it.rec)) + '</span>' : ''; }

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
    if (it.resultCheck !== undefined) return !!it.resultCheck;   // check 칸은 '공고일 이름표 7곳' 뜻이라 따로 둔다
    return it.phase === 'awaiting' || (it.phase === 'unknown' && it.since > logic.NOTICE_UNKNOWN_OPEN_DAYS);
  }
  dash.isNoticeCheck = isCheck;   // 기관 사업계획(plans.js)이 같은 '결과 확인' 판정을 쓴다
  // 목록 [다가오는 입찰] 맨 위 묶음(접수 중·접수 기간 원문 확인) 제목. items = 선정 결과 대기가 아닌 공고 진행 중 기관.
  dash.noticeGroupLabel = function (items) {
    const r = items.filter(function (it) { return it.phase === 'receiving'; }).length, u = items.length - r;
    const parts = [];
    if (r) parts.push('접수 마감 전 <b>' + r + '</b>곳');
    if (u) parts.push(esc(logic.NOTICE_WORDS.unknownChip) + ' <b>' + u + '</b>곳');
    return parts.join(' · ') + (r ? ' · 마감 가까운 순' : '');
  };
  // 목록 소묶음 '선정 결과 대기'(isCheck 행) 제목
  dash.waitGroupLabel = function (n) { return '선정 결과 대기 <b>' + n + '</b>곳 · 결과 공고가 났는지 확인하세요'; };
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
    const r = all.filter(function (it) { return it.phase === 'receiving'; }).length;
    const u = all.filter(function (it) { return it.phase === 'unknown' && !isCheck(it); }).length;
    const w = all.filter(isCheck).length;
    if (!open.length && !w) return '';   // 공고 난 곳이 전부 선정 결과 대기여도 띠는 그린다(카드 없이 머리 줄·버튼·안내)
    const sum = '접수 마감 전 <b>' + r + '</b>곳' + (u ? ' · ' + esc(logic.NOTICE_WORDS.unknownChip) + ' <b>' + u + '</b>곳' : '') + (w ? ' · 선정 결과 대기 <b>' + w + '</b>곳' : '');
    const head = '<div class="db-h"><h2 id="db-nb-h">지금 공고가 난 기관</h2><span class="sum">' + sum + '</span>' +
      (w ? '<button type="button" class="end" id="db-nb-wait" aria-controls="db-nwlb">선정 결과 대기 <b>' + w + '</b>곳 보기</button>' : '') + '</div>';
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
    const one = open.length <= 1 && w > 0;
    const aside = one ? '<p class="db-nb-aside">선정 결과 대기 <b>' + w + '</b>곳 — 결과 공고가 났는지 확인하세요.</p>' : '';
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
  dash.noticeSecHtml = function (it, today, extra) {   // extra = ①절 안에 이어 붙일 '공고 상태 기록' 소구획(h4) 마크업
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
    return '<div class="db-sec db-s1"><h3>공고 진행</h3>' + trk + '<dl class="db-dl">' +
      (rec.noticeNo ? '<dt>공고 번호</dt><dd>' + mono(rec.noticeNo) + '</dd>' : '') +
      '<dt>공고일</dt><dd>' + mono(it.date) + '</dd><dt>접수</dt><dd>' + recv + '</dd>' +
      '<dt>출처</dt><dd>' + link + '</dd></dl>' + (extra || '') + '</div>';   // '현 약정 만료' 줄은 ②의 '약정 기간'이 맡는다(막대 끝 라벨은 그대로)
  };

  dash.rowHtml = function (it, o) {
    o = o || {};
    if (it.notice) {
      const nt = dash.recTagHtml(dash.recView(it, o.snap));
      return '<li role="option" id="' + esc(o.id || '') + '" class="db-row" data-key="' + esc(it.key) + '" data-phase="' + esc(it.phase) + (isCheck(it) ? '" data-check="1' : '') +
        '" aria-selected="' + (o.selected ? 'true' : 'false') + '"><span class="nm">' + esc(it.name) + '</span>' + dash.noticeChipHtml(it) +
        '<span class="meta">' + esc(dash.regionName(it.region)) + ' · ' + dash.noticeNote(it) + (nt ? ' · ' + nt : '') +
        (o.prepActive ? ' <span class="wf-badge pp-neutral">사전준비 중</span>' : '') + dtNoteHtml(it) + '</span></li>';
    }
    const rv = it.overdue ? dash.recView(it, o.snap) : null, view = rv ? rv.view : 'pending';
    const tag = it.overdue ? '<span class="ov-stamp' + (view === 'delayed' ? ' is-line' : view === 'done' ? ' is-plain' : '') + '">D+' + it.days + '</span>'
      : '<span class="dg-day ' + esc(it.band) + '">' + dayText(it.days) + '</span>';
    const rt = rv ? dash.recTagHtml(rv) : '';
    const meta = it.overdue
      ? (rt ? rt + ' · ' + esc(dash.regionName(it.region)) : esc(dash.regionName(it.region)) + ' · ' + esc(dash.overdueNote(it))) + dtNoteHtml(it)
      : esc(dash.regionName(it.region)) + ' · <span class="d">' + esc(it.date) + '</span> ' + (it.check ? '공고일' : esc(it.label)) +
        (o.prepActive ? ' <span class="wf-badge pp-neutral">사전준비 중</span>' : '') + dtNoteHtml(it);
    return '<li role="option" id="' + esc(o.id || '') + '" class="db-row" data-key="' + esc(it.key) + (view !== 'pending' ? '" data-rec="' + view : '') + '" aria-selected="' + (o.selected ? 'true' : 'false') + '">' +
      '<span class="nm">' + esc(it.name) + '</span>' + tag + '<span class="meta">' + meta + '</span></li>';
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
    return '날짜를 확인하지 못한 <b>' + m.unknownN + '</b>곳은 목록에 없습니다. <button type="button" class="db-link" id="db-tomap2">지역별 공고현황</button>에서 볼 수 있습니다.';
  };

  // D4 약정 주기 막대. lastBid가 없으면 null(그리지 않고 dl의 '미확인' 칩을 쓴다). pct는 0~100으로 자른다.
  // 경과(D+) 기관은 꽉 찬다. est = 확정이 아니면 끝 표시가 점선. basis는 기관의 effectiveBid 근거(notice|cycle|expiry).
  dash.termBar = function (it, today) {
    const rec = it && it.rec;
    if (!rec || !rec.lastBid || !today) return null;
    const sinceLast = -logic.daysUntil(rec.lastBid, today);          // 지난 금고 선정일부터 오늘까지 지난 일수
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
    const label = '지난 금고 선정일 ' + t.lastBid + ', 오늘 ' + nowTxt + ', 입찰 예정 ' + t.date + ' ' + kind;
    return '<div class="db-term' + (t.over ? ' over' : '') + '" role="img" aria-label="' + esc(label) + '">' +
      '<div class="trk"><div class="el ' + esc(it.band) + '" style="width:' + t.pct.toFixed(1) + '%"></div><div class="end' + (t.est ? ' est' : '') + ' ' + esc(it.band) + '"></div></div>' +
      '<div class="lab"><span>지난 금고 선정일 <b>' + esc(t.lastBid) + '</b></span><span>오늘 <b>' + esc(nowTxt) + '</b></span><span>입찰 예정 <b>' + esc(t.date) + '</b> ' + esc(kind) + '</span></div>' +
      '</div>';
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
    const nrm = NR(), small = o.nested && it && nrm && nrm.scopeHtml ? '<small>' + nrm.scopeHtml(it) + '</small>' : '';
    const open = o.nested ? '<div class="db-rec"><div class="db-sub-h"><h4>공고 상태 기록</h4>' + small + '</div>' : '<div class="db-sec db-rec"><h3>공고 상태 기록</h3>';
    return open + '<dl class="db-dl"><dt>담당자 기록</dt><dd>' + line + '</dd></dl>' +
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
    return '<div class="db-blank">왼쪽 목록에서 기관을 고르세요. 기관 정보가 여기에 보입니다. 제안 사전준비는 [입찰 현황판]에서 시작합니다.</div>';
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

  // ── 기관 정보의 '약정 기간' 한 줄(2026-11-23). periods = 지금 약정 줄들의 [{from, to}](모르면 ''), term = rec.term, expiry = rec.contractExpiry.
  // 값 우선순위: 직접 입력 약정 > 행안부·수집 > rec.contractExpiry(periods가 없을 때만 쓴다). 줄마다 기간이 다르면 한 줄을 만들지 않고(same:false)
  // 은행 줄 둘째 줄에 각자 적는다. 모양: '시작 ~ 끝 (n년)' / '~ 끝 만료 (n년)' / '시작 ~ [미확인] (n년)' / 다 모르면 [미확인](주기만 있으면 뒤에 (n년)).
  dash.termLine = function (periods, term, expiry) {
    const seen = {}, list = [];
    (periods || []).forEach(function (p) {
      const k = (p.from || '') + '|' + (p.to || '');
      if (!seen[k]) { seen[k] = true; list.push({ from: p.from || '', to: p.to || '' }); }
    });
    if (list.length > 1) return { same: false, html: '' };
    let from = list.length ? list[0].from : '', to = list.length ? list[0].to : '';
    if (!from && !to && expiry) to = String(expiry);
    const yrs = term ? ' (' + esc(String(term)) + '년)' : '';
    let t;
    if (from && to) t = mono(from + ' ~ ' + to);
    else if (to) t = '~ ' + mono(to) + ' 만료';
    else if (from) t = mono(from) + ' ~ ' + chip();
    else t = chip();
    return { same: true, html: t + yrs };
  };

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
      const tail = (period && !(o.noTerm && !l.expired) ? '<span class="bk-ln db-why">약정 ' + period + '</span>' : '') +
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
  // 본문 조각: { head: 제목 줄(.db-head), sub: 종류·지역 줄(.db-sub), rest: 그 아래 절들 }. 현황판 오른쪽 칸(paneHtml)은 이어 붙이고, 지도 상세 팝업(popupHtml)은 head를 머리 줄(.dm-bar)로 올린다.
  dash.paneParts = function (it, c) {
    c = c || {};
    const rec = it.rec, srcs = Array.isArray(rec.sources) ? rec.sources : [];
    const oc = ie.isOpenCheck(rec);   // 개원 예정일이 지난 개원 예정 기관 — 입찰 대상이 아니라 날짜 줄·D-day 대신 '개원 확인 필요'
    const head = '<div class="db-head"><h2 id="' + esc(c.nameId || 'db-name') + '" tabindex="-1">' + esc(it.name) + '</h2>' +
      (oc ? '<span class="db-chk">개원 확인 필요</span>' : it.unknown ?'<span class="dg-day unknown">날짜 미상</span>' : it.notice ? dash.noticeChipHtml(it) : it.overdue ? '<span class="ov-stamp">D+' + it.days + '</span>' : '<span class="dg-day ' + esc(it.band) + '">' + dayText(it.days) + '</span>') +
      (c.act === 'open' ? '<span class="wf-badge pp-neutral">사전준비 중</span>' : '') + '</div>';
    const sub = '<p class="db-sub">' + esc(dash.kindOfRec(rec)) + ' · ' + esc(dash.regionName(rec.region)) + '</p>';
    const why = it.confidence === '확정' ? '— 공고로 확인한 날입니다'
      : it.basis === 'expiry' ? '— 약정 만료일의 6개월 전으로 추정한 날입니다(약정 만료 기준 추정)'
      : it.basis === 'notice' ? '— 공고일로 적힌 날짜입니다'
      : '— 지난 금고 선정일에 약정 주기를 더한 날입니다';
    const lp = lastProcNote(rec);
    const recSub = typeof c.recordHtml === 'string' ? c.recordHtml : '';   // '공고 상태 기록'은 ①절 안 h4 소구획. 개원 확인 필요 기관에는 넘기지 않는다
    // ① 공고 진행(공고 난 기관) / 입찰 예정(공고 전). 개원 확인 필요 기관은 입찰 대상이 아니라 ①이 없다.
    let sec1 = '';
    if (!oc) {
      if (it.notice) sec1 = dash.noticeSecHtml(it, c.today, recSub);
      else {
        const when = it.unknown ? '<dt>입찰 예정일</dt><dd>' + chip() + '</dd>'
          : it.check ? '<dt>금고 지정 공고일</dt><dd>' + mono(it.date) + ' ' + esc(it.label) + dtNoteHtml(it) + ie.confirmSrcHtml(rec) + '</dd>'
          : '<dt>입찰 예정일</dt><dd>' + mono(it.date) + ' ' + esc(it.label) + ' <span class="db-why">' + why + '</span>' + ie.confirmSrcHtml(rec) + '</dd>';
        sec1 = '<div class="db-sec db-s1"><h3>입찰 예정</h3>' + (it.unknown ? '' : dash.termBarHtml(it, c.today)) + '<dl class="db-dl">' + when + '</dl>' + recSub + '</div>';
      }
    }
    // ② 기관 정보 = 기관 정보 + 현재 금고 은행 한 절(id db-bank). 줄 순서: 금고 은행 줄들 → 약정 기간 → 지난 금고 선정일 → 운영 상태.
    const bcm = BC();
    const bankOk = !!(c.bank && c.bank.st === 'ok' && c.bank.data);   // 약정 응답이 왔을 때만 문구를 바꾼다(없으면 기존 문구 그대로)
    // 행안부 값은 KB 수집(c.kb·c.next)이 없을 때만 쓴다. c.lofin(순수 시험)이 있으면 그것, 없으면 전역 자료.
    const lofinData = c.lofin !== undefined ? c.lofin : root.LOFIN_2026;
    const lofinAll = c.kb || c.next ? [] : dash.lofinLines(rec, lofinData, c.today);
    const lofinLive = lofinAll.filter(function (l) { return !l.expired; });
    const collected = !!(c.kb || c.next || lofinAll.length);
    // 약정 기간 재료: 직접 입력 현재 줄 > 행안부 현재 줄. 모두 같을 때만 한 줄로 합치고(noTerm), 다르면 은행 줄 둘째 줄에 둔다.
    let periods = [];
    const curLines = bankOk && bcm && bcm.group ? bcm.group(Array.isArray(c.bank.data.lines) ? c.bank.data.lines : []).cur : [];
    if (curLines.length) periods = curLines.map(function (l) { const u = l.term_state === 'UNKNOWN'; return { from: u ? '' : (l.term_from || ''), to: u ? '' : (l.term_to || '') }; });
    else if (!c.kb && !c.next) periods = lofinLive.map(function (l) { return { from: l.start || '', to: l.end || '' }; });
    const tl = dash.termLine(periods, rec.term, rec.contractExpiry);
    const lastRow = '<dt>지난 금고 선정일</dt><dd>' + (rec.lastBid ? mono(rec.lastBid) + (lp ? ' <span class="db-why">' + esc(lp) + '</span>' : '') : chip()) + '</dd>';
    const opHtml = ie.opLineHtml(rec);
    const tailRows = (tl.same ? '<dt>약정 기간</dt><dd>' + tl.html + '</dd>' : '') + lastRow + (opHtml ? '<dt>운영 상태</dt><dd>' + opHtml + '</dd>' : '');
    const srcDet = srcs.length ? '<details class="db-src"><summary>출처 ' + srcs.length + '건 보기</summary><ol>' + srcs.map(srcItem).join('') + '</ol></details>' : '';
    let bankRows, bankNote;
    if (c.kb) {
      const slot = c.kb.slot ? ' · ' + esc(c.kb.slot) + '금고' : '';
      bankRows = '<dt>금고 은행</dt><dd>KB국민은행' + slot + '</dd>' +
        '<dt>근거</dt><dd>' + esc(c.kb.quote || '') + (c.kb.src_date ? ' <span class="db-why">출처 기준일 ' + esc(c.kb.src_date) + '</span>' : '') + '</dd>' +
        (c.kb.leaves ? '<dt>' + esc(c.kb.leaves) + '년부터</dt><dd>다른 은행' + (c.kb.next ? ' <span class="db-why">' + esc(c.kb.next) + '</span>' : '') + '</dd>' : '');
      bankNote = bankOk && c.bank.data.can_edit ? '<p class="db-empty">출처 문장으로 확인한 현 금고만 보입니다. 약정 기간은 금고 약정을 입력하면 함께 보입니다.</p>'
        : '<p class="db-empty">출처 문장으로 확인한 현 금고만 보입니다. 약정 기록을 모으면 약정 기간이 함께 보입니다.</p>';
    } else if (c.next) {
      // 2027년부터 국민은행으로 바뀌는 기관(KB_NEXT). now = 지금 금고 은행(없으면 미확인). 출처 링크는 <dd> 안 — 버튼 밖.
      const nx = c.next, nu = logic.safeHttpUrl(nx.url);
      bankRows = '<dt>금고 은행</dt><dd>' +
        (nx.now ? '현재 금고 ' + esc(nx.now) : '현재 은행 ' + chip()) +
        ' · ' + esc(nx.from || '2027') + '년부터 국민은행' + (nx.term ? '(약정 ' + esc(nx.term) + ')' : '') + '</dd>' +
        '<dt>근거</dt><dd>' + esc(nx.quote || '') + (nx.src_date ? ' <span class="db-why">출처 기준일 ' + esc(nx.src_date) + '</span>' : '') +
        (nu ? ' <a href="' + esc(nu) + '" target="_blank" rel="noopener noreferrer">출처 보기</a>' : '') + '</dd>';
      bankNote = '<p class="db-empty">' + (nx.now ? '지금 금고 은행은 출처 문장으로 확인했습니다. ' : '') + esc(nx.from || '2027') + '년 약정은 선정 결과 기준이며 본계약 여부는 출처에서 다시 확인하세요.</p>';
    } else if (lofinAll.length) {
      // 행안부 금고지정 현황 값 — 직접 입력·KB 수집이 없는 지자체의 '미확인' 자리. 약정 기간은 줄 안(또는 한 줄)에 있다.
      bankRows = dash.lofinRowsHtml(lofinAll, lofinData, { noTerm: tl.same });
      const canEd = bankOk && c.bank.data.can_edit;
      bankNote = !lofinLive.length   // 줄이 모두 만료 — 2027-01-01부터 80곳이 여기에 걸린다
        ? '<p class="db-empty">행안부 현황의 약정 기간이 지났습니다. ' + (canEd ? '지금 약정을 확인해 직접 입력하세요.' : '지금 약정은 기록이 없습니다.') + '</p>'
        : canEd ? '<p class="db-empty">행안부 현황으로 채운 값입니다. 약정을 직접 입력하면 그 값이 먼저 보입니다.</p>'
        : '<p class="db-empty">행안부 현황으로 채운 값입니다.</p>';
    } else {
      bankRows = '<dt>금고 은행</dt><dd>' + chip() + '</dd>';   // '금고 은행 미확인'/'약정 기간 미확인' 두 줄 → 한 줄(약정 기간은 아래 한 줄이 말한다)
      bankNote = !bankOk ? '<p class="db-empty">약정 기록을 모으면 금고 은행과 약정 기간이 출처와 함께 여기에 보입니다.</p>'
        : c.bank.data.can_edit ? '<p class="db-empty">금고 약정을 입력하면 출처와 함께 여기에 보입니다.</p>' : '';   // 권한 없음 문구는 절 아래 foot이 보인다
    }
    // 지자체 기관에만: 행안부 금고지정 현황 바로가기 한 줄(kbboard.srcHtml 재사용 — 머리말만 '직접 확인: ').
    // 서버 모드는 bc.sectionHtml이 note·state 뒤, foot 앞에 끼운다(정규식 끼워 넣기 없음). legacy 경로는 절 끝에 붙인다.
    // c.muniSrcHtml이 문자열이면 그것을 쓴다(순수 시험·kbboard 미로드). 비지자체 기관에는 이 표가 근거가 아니라 넣지 않는다.
    let muniSrc = '';
    if (dash.kindOfRec(rec) === '지자체') muniSrc = typeof c.muniSrcHtml === 'string' ? c.muniSrcHtml : (root.kbboard && root.kbboard.srcHtml ? root.kbboard.srcHtml('직접 확인: ') : '');
    const secHead = c.infoEditHtml ? '<div class="db-sec-h"><h3>기관 정보</h3>' + c.infoEditHtml + '</div>' : '<h3>기관 정보</h3>';
    const info = c.bank && bcm
      ? bcm.sectionHtml(c.bank, { legacyDl: '<dl class="db-dl">' + bankRows + '</dl>', legacyNote: bankNote, collected: collected, hasKb: !!c.kb, col: bankCol(c), srcHtml: muniSrc, editing: !!c.editing,
        noTerm: tl.same, merged: { title: '기관 정보', headHtml: c.infoEditHtml || '', rows: tailRows, srcDetails: srcDet },
        lofin: lofinLive.map(function (l) { return { bank: l.bank, rank: l.cmp, html: dash.lofinRowsHtml([l], lofinData, { diff: true }) }; }) })
      : '<div class="db-sec" id="db-bank">' + secHead + '<dl class="db-dl">' + bankRows + tailRows + '</dl>' + (muniSrc ? '<p class="db-empty bk-src">' + muniSrc + '</p>' : '') + bankNote + srcDet + '</div>';
    // c.headHtml: headcard.js가 만든 '기관장' 절(서버 기관장 API 카드). 없으면(모듈 미로드·순수 테스트) 예전 자리표시를 둔다.
    const chief = typeof c.headHtml === 'string' ? c.headHtml : '<div class="db-sec"><h3>기관장</h3><dl class="db-dl"><dt>기관장</dt><dd>' + chip() + '</dd></dl>' +
      '<p class="db-empty">기관장 프로필은 수집 예정입니다. 입찰이 1년 안에 있는 기관부터 모읍니다.</p></div>';
    // 사업계획 절(plans.js가 dash.plansHook으로 등록): 기관장 절 뒤, tail 앞. plans.js가 없으면(순수 테스트) 두지 않는다.
    const plansSec = typeof c.plansHtml === 'string' ? c.plansHtml : (typeof dash.plansHook === 'function' ? dash.plansHook(rec, c) : '');
    return { head: head, sub: sub, rest: sec1 + info + chief + plansSec + (typeof c.tailHtml === 'string' ? c.tailHtml : '') };
  };
  dash.paneHtml = function (it, c) {
    c = c || {};
    const p = dash.paneParts(it, c);
    return '<div class="db-pane-body">' + p.head + p.sub + p.rest + '</div><div class="db-act">' + dash.actHtml(it, c) + '</div>';
  };
  // 지도 상세 팝업: 머리 줄(.dm-bar 52px) = [‹ 이전](스택일 때만) · 제목 · 주 동작 ┃ [닫기](글자 단추, DESIGN.md '팝업' — × 아이콘 금지, 11-23). [편집]은 머리에서 뺐고 '기관 정보' 절 오른쪽 [기관 정보 수정]으로 옮겼다(design 11-19 저녁 6-3).
  // c.readOnly(보기 전용) = [이전]·×만. c.back = { aria, close }(스택), c.editing = 금고 약정 편집 단계(주 동작 숨김). 반환 { bar, note, body }.
  dash.popupHtml = function (it, c) {
    c = c || {};
    const p = dash.paneParts(it, Object.assign({}, c, { infoEditHtml: c.readOnly ? '' : '<button type="button" id="dm-info-edit" class="db-sec-act">기관 정보 수정</button>' }));
    const a = dash.actParts(it, c);
    const main = c.editing ? '' : a.main;   // 약정 입력 중에는 [제안 확정] 등이 나가지 않게 숨긴다(한 번에 한 일)
    const extra = c.editing ? '' : String(c.extraHtml || '');   // 현황판이 끼우는 보조 단추 [관심 기관으로…](c.extraHtml, NEXT 114): 주 동작 바로 뒤·구분선 앞. 약정 입력 중에는 같이 숨긴다
    const back = c.back ? '<button type="button" id="dm-back" class="dm-back" aria-label="' + esc(c.back.aria) + '"><svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M8 2 4 6l4 4"/></svg>이전</button>' : '';
    const bar = '<div class="dm-bar' + (c.back ? ' has-back' : '') + '">' + back + p.head + '<div class="dm-btns">' + main + extra + (main || extra ? '<span class="dm-sep" aria-hidden="true"></span>' : '') +
      '<button type="button" id="dm-close" class="dm-cls" aria-label="' + esc(c.back ? c.back.close : '닫기') + '" title="' + esc(c.back ? c.back.close : '닫기') + ' (Esc)">닫기</button></div></div>';
    const note = a.confirm || (a.why ? '<p class="db-why dm-why">' + a.why + '</p>' : '');
    return { bar: bar, note: note, body: '<div class="db-pane-body">' + p.sub + p.rest + '</div>' };
  };
  // 약정 편집 중 뒤로 갈 때의 확인 상자(design 6-1). closing = 바깥 클릭으로 전체를 닫으려는 경우.
  dash.leaveBoxHtml = function (closing, what) {   // what = 저장하지 않은 것의 이름(기본 '약정')
    return '<div class="db-confirm dm-confirm" id="dm-leave" role="group" aria-labelledby="dm-leave-t"><span id="dm-leave-t">저장하지 않은 ' + esc(what || '약정') + '이 있습니다.</span>' +
      '<div class="db-act-row"><button type="button" id="dm-leave-drop">' + (closing ? '버리고 닫기' : '버리고 돌아가기') + '</button><button type="button" id="dm-leave-keep">계속 입력</button></div></div>';
  };

  dash.actHtml = function (it, c) {
    const map = c.mapHtml !== undefined ? c.mapHtml : '<button type="button" id="db-map">지역별 공고현황에서 보기</button>';
    // 개원 확인 필요 기관은 입찰 대상이 아니라 [제안 확정]을 두지 않는다 — 운영 상태를 확인해 바꾸는 창으로 보낸다(NEXT 72, 기획 결정).
    if (c.act === 'opencheck') return '<div class="db-act-row"><span class="db-why">개원했는지 확인하고 출처와 함께 운영 상태를 바꾸세요.</span><button type="button" id="db-edit">기관 정보 수정</button></div>';
    if (c.act === 'wait') return '<div class="db-act-row"><span class="db-why">[제안 사전준비]를 쓸 수 있는지 확인하는 중입니다.</span>' + map + '</div>';
    if (dash.CONFIRM_WHY[c.act]) return '<div class="db-act-row"><span class="db-why">' + dash.CONFIRM_WHY[c.act] + '</span>' + map + '</div>';
    if (c.act === 'unavailable') return '<div class="db-act-row"><span class="db-why">서버에 연결되면 [제안 사전준비]를 쓸 수 있습니다.</span>' + map + '</div>';
    if (c.act === 'open') return '<div class="db-act-row"><button type="button" class="db-next" id="db-open">사전준비 열기</button>' + map + '<span class="db-why">이미 제안 확정되어 사전준비가 진행 중입니다.</span></div>';
    if (c.act === 'confirm') {
      // 확정(제안 사전준비)은 입찰 현황판에서만 한다(사용자 11-25). 그 밖의 화면은 [입찰 현황판에서 열기](목표 기관이면 앞에 '목표 기관' 칩)
      if (!c.board) return '<div class="db-act-row">' + boardOpenHtml(it, c) + map + '</div>';
      if (c.confirm) return confirmBoxHtml(it, c, false);
      return '<div class="db-act-row"><button type="button" class="db-next" id="db-cf">제안 사전준비</button>' + map +
        (c.early ? '<span class="db-why">' + esc(dash.EARLY_WHY) + '</span>' : '') + '</div>';
    }
    const noperm = ['영업팀', '영업팀장'].indexOf(c.role || '') < 0 ? '<span class="db-why">제안 사전준비는 영업팀·영업팀장이 합니다.</span>' : '';
    return '<div class="db-act-row">' + map + noperm + '</div>';
  };
  // 현황판 밖 화면의 확정 자리(규격 A 표): 목표 기관 칩 + [입찰 현황판에서 열기]. '목표에 넣기…'는 이 화면에서 처리할 경로가 없어 같은 단추로 대신한다(목표에 넣기는 현황판의 [목표 기관 추가] 창에서).
  const CK_SVG = '<svg class="ck" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M2 5.5l2 2L8 3"/></svg>';
  function boardOpenHtml(it, c) {
    return (c.goal ? '<span class="db-goalchip">' + CK_SVG + '목표 기관</span>' : '') +
      '<button type="button" id="db-board" aria-label="' + esc(it.name) + ' 입찰 현황판에서 열기">입찰 현황판에서 열기</button>' +
      (c.goal ? '' : '<span class="db-why">목표 기관이 아닙니다. 입찰 현황판의 [목표 기관 추가]로 넣은 뒤 제안 사전준비를 합니다.</span>');
  }
  // 확정 확인 상자(현황판 상세 팝업 = popup, 상세 칸 = 아님). 본문 1·2, 공고 전이면 평문 본문 3 — 굵은 경고·[계속 진행]은 없다.
  function confirmBoxHtml(it, c, popup) {
    const b3 = c.early ? dash.PREP_BODY3 : (c.status && dash.PREP_STATUS_NOTE[c.status]) || '';   // 본문 3: 공고 전이면 안내, 목표 기관의 공고 상태가 있으면 사실 한 줄
    return '<div class="db-confirm' + (popup ? ' dm-confirm' : '') + '"' + (popup ? ' id="dm-confirm"' : '') + ' role="group" aria-labelledby="db-cf-t"' + (b3 ? ' aria-describedby="db-cf-d"' : '') + '><span id="db-cf-t">' +
      esc(it.name) + dash.josaEul(it.name) + ' 제안 대상으로 확정합니다. ' + esc(dash.PREP_BODY2) + '</span>' +
      (b3 ? '<span class="db-cf-b" id="db-cf-d">' + esc(b3) + '</span>' : '') +
      '<div class="db-act-row"><button type="button" class="db-next" id="db-do"' + (c.busy ? ' disabled' : '') + '>' + (c.busy ? '확정하는 중…' : esc(dash.PREP_CONFIRM_GO)) + '</button><button type="button" id="db-cancel">취소</button></div></div>';
  }

  // 팝업 머리 줄용: actHtml과 같은 판정을 { main: 주버튼 마크업, why: 이유 글(마크업), confirm: 확정 확인 상자 마크업 }으로 나눈다.
  // 확인 상자가 펼쳐진 동안에는 [제안 확정]을 비활성으로 둔다(상자의 [확정하기]·[취소]만 누를 수 있다). 주버튼이 없으면 main은 빈 글.
  dash.actParts = function (it, c) {
    c = c || {};
    const none = { main: '', why: '', confirm: '' };
    if (c.act === 'opencheck') return { main: '', why: '개원했는지 확인하고 출처와 함께 운영 상태를 바꾸세요.', confirm: '' };
    if (c.act === 'wait') return { main: '', why: '[제안 사전준비]를 쓸 수 있는지 확인하는 중입니다.', confirm: '' };
    if (dash.CONFIRM_WHY[c.act]) return { main: '', why: dash.CONFIRM_WHY[c.act], confirm: '' };
    if (c.act === 'unavailable') return { main: '', why: '서버에 연결되면 [제안 사전준비]를 쓸 수 있습니다.', confirm: '' };
    if (c.act === 'open') return { main: '<button type="button" class="db-next" id="db-open">사전준비 열기</button>', why: '이미 제안 확정되어 사전준비가 진행 중입니다.', confirm: '' };
    if (c.act === 'confirm') {
      if (!c.board) return { main: boardOpenHtml(it, c), why: '', confirm: '' };   // 현황판 밖(지도 팝업·포털 상세): 확정 없이 현황판으로 안내
      if (c.confirm) return { main: '<button type="button" class="db-next" id="db-cf" disabled>제안 사전준비</button>', why: '', confirm: confirmBoxHtml(it, c, true) };
      return { main: '<button type="button" class="db-next" id="db-cf">제안 사전준비</button>', why: c.early ? esc(dash.EARLY_WHY) : '', confirm: '' };
    }
    return ['영업팀', '영업팀장'].indexOf(c.role || '') < 0 ? { main: '', why: '제안 사전준비는 영업팀·영업팀장이 합니다.', confirm: '' } : none;
  };

  // ── DOM ───────────────────────────────────────────────────────────
  // tab: 'up' = 다가오는 입찰, 'ov' = 공고 예정일 경과. 입찰 공고 현황은 /preps만 읽는다(행의 '사전준비 중' 배지용). 단계 집계(overview)는 현황판(kbboard)이 맡는다.
  function recFresh(id) { return { id: id, seq: 0, histSt: 'idle', histCode: 0, hist: null, busy: false, err: '', errs: {}, cf: null, histOpen: false }; }
  const st = { sel: '', q: '', region: '', type: '', win: dash.DEFAULT_WINDOW, tab: 'up', chkOpen: false, confirm: false, busy: false, flash: '', err: '',
    preps: null, prepSt: 'offline', prepCode: 0, ovView: 'pending', drafts: {}, rec: recFresh(''), kqScope: 'all' };
  let host = null, ac = null, M = null, LIST = [], seq = 0, offNr = null, tgTimer = 0;

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

  // 위 '다가오는 기관별 공고현황'(종류별 막대). 기간 버튼과 무관하다. 와플·단계 카드는 입찰 현황판(kbboard)으로 옮겼다.
  function renderStrip() {
    const el = $('db-tl');
    if (el && M) {
      const ids = st.kqScope === 'mine' ? dash.scopeIds() : null;   // 목표·관심 집합을 못 받았으면 전체로
      el.innerHTML = dash.kindQueueHtml(dash.kindQueueModel(M, { today: todayDate(), ids: ids }),
        { canScope: !!dash.scopeIds(), scope: ids ? 'mine' : 'all', updated: M.maxUpdated });
    }
    const asof = $('db-asof');
    if (asof) asof.textContent = logic.localDateStr(todayDate());
  }

  function renderBanner() {
    const el = $('db-err');
    if (!el) return;
    let t = st.err;
    if (!t && !serverMode()) {
      t = (root.location && root.location.protocol === 'file:')
        ? '서버에 연결되지 않은 파일 모드입니다. 내장 자료만 보여 주며 진행 건수와 [제안 사전준비]는 쓸 수 없습니다.'
        : '서버의 기관 정보를 불러오지 못해 내장 자료만 보여 줍니다. 제안 진행 표시와 [제안 사전준비]는 쓸 수 없습니다. <button type="button" id="db-reload">다시 불러오기</button>';
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

  // #db-root 맨 위 '지금 공고가 난 기관' 띠. 공고 난 곳이 하나도 없으면 띠 전체를 숨긴다(전부 선정 결과 대기여도 안내로 그린다).
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
      // [다가오는 입찰] 탭: 접수 중·원문 확인(#db-g0·#db-nlb) → 선정 결과 대기(#db-g0w·#db-nwlb, isCheck 행) → 기간 창. 제목은 스크롤 안에서 같이 넘어간다.
      const ntOpen = nt.filter(function (it) { return !isCheck(it); }), ntWait = nt.filter(isCheck);
      const waitAll = (M.notice || []).filter(isCheck).length;   // 거르기 전 수 — 거르기로 0곳이어도 띠 버튼이 갈 자리는 남긴다
      if (ntOpen.length) h += '<div class="db-grp" id="db-g0">' + dash.noticeGroupLabel(ntOpen) + '</div><ul role="listbox" id="db-nlb" tabindex="0" aria-labelledby="db-g0">' + optionsFor(ntOpen, 'db-n-') + '</ul>';
      const subCls = 'db-grp' + (ntOpen.length ? ' db-grp-sub' : '');
      if (ntWait.length) h += '<div class="' + subCls + '" id="db-g0w">' + dash.waitGroupLabel(ntWait.length) + '</div><ul role="listbox" id="db-nwlb" tabindex="0" aria-labelledby="db-g0w">' + optionsFor(ntWait, 'db-w-') + '</ul>';
      else if (waitAll) h += '<div class="' + subCls + '" id="db-g0w">' + dash.waitGroupLabel(0) + '</div><p class="db-state" id="db-nwlb" tabindex="-1">조건에 맞는 선정 결과 대기 기관이 없습니다.<br><button type="button" id="db-clear-w">조건 지우기</button></p>';
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
    return { serverMode: serverMode(), hasEmp: hasEmp(), role: role(), emp: empNo(), today: todayDate(), bid: headBid(it), repaint: repaintHead, instName: it && it.rec ? it.rec.name : '' };
  }
  function repaintHead() { if (host && M && st.sel) renderPane(); }
  function headSection(it) {
    return root.headcard ? root.headcard.paneSection(it.rec, headEnv(it)) : undefined;
  }

  function paneAct(it, ctx, actives) {
    if (dash.isViewOnly()) return 'none';   // 보기 전용: 개원 확인의 [기관 정보 변경]도 [제안 확정]도 없다(recCompEnd가 같은 값으로 비교하므로 여기서 정한다)
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
    el.innerHTML = dash.paneHtml(it, { act: act, goal: dash.isGoalRec(it.rec, { year: goalSt.year, ids: goalSt.ids }), early: act === 'confirm' && dash.proposeEarly(it.rec, gateOpts()), confirm: st.confirm && act === 'confirm', busy: st.busy,
      kb: dash.kbEntry(it.rec, root.KB_VERIFIED), next: dash.kbEntry(it.rec, root.KB_NEXT), role: ctx.role, today: todayDate(), headHtml: headSection(it),
      recordHtml: ie.isOpenCheck(it.rec) ? '' : recViewHtml(boardRc), bank: dash.isViewOnly() ? dash.lockBank(bankView(it.rec)) : bankView(it.rec) });
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
  // 공고 상태 기록 맥락(rc) — 현황판 상세 칸(st.sel·st.rec)과 기관정보 팝업(dm.cur·m.rc)이 같은 함수를 쓴다. 초안(st.drafts)은 둘이 같이 쓴다.
  // rc = { idp, alive(), it(), rs(), q(sel), flash(msg, isErr), authErr?(msg), viewOnly(), screenId(), resetComp(), mark(), note(o, mark) }
  function rid(rc, k) { return rc.idp + 'db-rec' + (k ? '-' + k : ''); }
  function rq(rc, k) { return rc.q('#' + rid(rc, k)); }
  function recFocus(rc, k) { const b = rq(rc, k); if (b && b.focus) b.focus(); }
  const boardRc = {
    idp: '',
    alive: function () { return !!(host && M); },
    it: function () { return selItem(); },
    rs: function () { return st.rec; },
    q: function (sel) { return host ? host.querySelector(sel) : null; },
    flash: function (msg, isErr) { flash(msg, isErr); },
    viewOnly: function () { return dash.isViewOnly(); },
    screenId: function () { return undefined; },                       // nr.SCREEN(bid_notice)
    resetComp: function () { st.comp = false; st.compLater = false; },
    mark: function () { return { key: st.sel, tab: st.tab }; },
    note: function (o, k) {                                           // P3-8: 저장 뒤 그 기관이 지금 보기에서 빠졌으면 안내 한 문장
      if (!host || !M || st.sel !== k.key || st.tab !== 'ov' || k.tab !== 'ov' || st.flash !== o.msg) return '';
      return recMoveNote(selItem(), st.ovView);
    }
  };
  function recCur(rc) { const n = NR(), r = rc.rs(); return r.hist && n ? n.currentOf(r.hist) : null; }
  function recDraft(rc) { const n = NR(); return st.drafts[recId(rc.it())] || n.blankDraft(recCur(rc)); }
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
    recLoadHist(boardRc, false);
  }
  function recLoadHist(rc, quiet) {
    const r = rc.rs(), n = NR(), my = ++r.seq;
    if (!quiet || !r.hist) r.histSt = 'loading';
    return n.fetchHistory(r.id).then(function (x) {
      if (rc.rs() !== r || my !== r.seq || !rc.alive()) return;
      r.histSt = x.status; r.histCode = x.code || 0; r.hist = x.status === 'ok' ? x.data : null;
      repaintRc(rc);
    });
  }
  function recViewHtml(rc) {
    const n = NR(), r = rc.rs(), it = rc.it(), id = recId(it);
    if (!n) return '';
    if (!id || !recOn()) return dash.recordSecHtml(it, { state: 'offline', nested: true, idp: rc.idp });
    return dash.recordSecHtml(it, { nested: true, idp: rc.idp, state: r.histSt === 'idle' ? 'loading' : r.histSt, code: r.histCode, listState: n.state ? n.state() : '', listCode: n.listCode ? n.listCode() : 0, hist: r.hist, cur: recCur(rc), canEdit: n.canEdit() && !rc.viewOnly(),
      draft: st.drafts[id] || null, errs: r.errs, err: r.err, busy: r.busy, cf: r.cf ? { stage: stageLabel(r.cf.state) } : null,
      who: profileName(), today: recToday(), rv: dash.recView(it), histOpen: r.histOpen });
  }
  function repaintRc(rc) {   // 기록 절만 바꾼다(스크롤·다른 절은 그대로)
    const it = rc.it(), sec = rq(rc, '');
    if (!it || !sec) return;
    rc.resetComp();   // renderPane과 같게 — 다시 그리면 한글 조합도 끊긴다(qa F4)
    const a = document.activeElement, keep = a && a.id && sec.contains(a) ? a.id : '';
    const s0 = keep && a.selectionStart != null ? a.selectionStart : null, e0 = keep && a.selectionEnd != null ? a.selectionEnd : null;
    sec.outerHTML = recViewHtml(rc);
    if (keep) {
      const t = rc.q('#' + keep);
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
    if (it && $('db-rec')) repaintRc(boardRc);
  }
  function recCompEnd() {
    st.comp = false;
    if (!st.compLater) return;
    st.compLater = false;
    const it = host && M ? selItem() : null;
    if (!it) return;
    // 조합 중에 도착한 기록이 버튼 줄을 바꿨다면 조합이 끝난 지금 다시 판정한다(안 하면 옛 문구가 다음 다시 그리기까지 남는다)
    if ($('db-pane') && st.act !== undefined && st.act !== paneAct(it, actCtx(), dash.activePreps(st.preps))) { renderPane(); return; }
    if ($('db-rec')) repaintRc(boardRc);
  }
  function recFocusField(rc, k) {
    const t = rc.q(k === 'status' ? '#' + rid(rc) + ' input[name="' + rc.idp + 'rec-state"]' : '#' + rid(rc, k === 'next' ? 'next' : 'op'));
    if (t && t.focus) t.focus();
  }
  function recDirtyUi(rc) {
    const n = NR(), id = recId(rc.it()), dirty = !!st.drafts[id] && !n.sameDraft(st.drafts[id], n.blankDraft(recCur(rc)));
    const dd = rq(rc, 'dirty'), rb = rq(rc, 'revert');
    if (dd) dd.hidden = !dirty;
    if (rb) rb.hidden = !dirty;
  }
  function recInput(rc, el) {
    const it = rc.it(), r = rc.rs();
    if (!it || !recOn()) return;
    const isNext = el.id === rid(rc, 'next'), d = Object.assign({}, recDraft(rc));
    if (isNext) d.next = el.value; else d.opinion = el.value;
    st.drafts[recId(it)] = d;
    const key = isNext ? 'next' : 'opinion';
    if (r.errs[key]) {   // 고치기 시작하면 그 칸의 오류는 지운다
      delete r.errs[key];
      const p = rq(rc, isNext ? 'next-err' : 'op-err'); if (p) p.textContent = '';
      el.removeAttribute('aria-invalid');
    }
    recDirtyUi(rc);
  }
  function recPick(rc, value) {
    const it = rc.it(), r = rc.rs();
    if (!it) return;
    const d = Object.assign({}, recDraft(rc)); d.status = value;
    st.drafts[recId(it)] = d;
    r.errs = Object.assign({}, r.errs); delete r.errs.status;
    repaintRc(rc);
    const c = rc.q('#' + rid(rc) + ' input[name="' + rc.idp + 'rec-state"]:checked'); if (c && c.focus) c.focus();
  }
  function recCfNo(rc) { rc.rs().cf = null; repaintRc(rc); recFocus(rc, 'save'); }
  function recRevert(rc) {
    const it = rc.it(), r = rc.rs();
    if (!it) return;
    delete st.drafts[recId(it)]; r.errs = {}; r.err = ''; repaintRc(rc); recFocus(rc, 'save');
  }
  function recSave(rc, confirmed) {
    const it = rc.it(), r = rc.rs(), n = NR();
    if (!it || !n || r.busy || r.histSt !== 'ok') return;
    if (rc.viewOnly() || !n.canEdit()) { rc.flash('저장할 수 있는 권한이 없습니다. 공고 상태 기록은 영업팀이 저장합니다.', true); return; }
    const id = recId(it), cur = recCur(rc), d = recDraft(rc), errs = n.validate(d, recToday());
    const first = n.FIELD_ORDER.filter(function (k) { return errs[k]; })[0];
    if (first) { r.errs = errs; r.err = ''; r.cf = null; repaintRc(rc); recFocusField(rc, first); return; }
    r.busy = true; r.err = ''; r.errs = {}; r.cf = null; repaintRc(rc);
    n.save(id, n.body(d, cur, it), confirmed, rc.screenId()).then(function (x) { recDone(rc, r, id, n.outcome(x)); },
      function () { recDone(rc, r, id, { kind: 'alert', msg: '저장하지 못했습니다. 서버가 응답하지 않습니다. 잠시 뒤 [기록 저장]을 다시 누르세요.' }); });
  }
  // 저장 뒤 선택한 기관이 보기(view)의 행에서 빠졌을 때 붙이는 한 문장. F1: 목록을 못 받았으면(error·denied 등) 옮김 판정을 믿을 수 없어 붙이지 않는다.
  function recMoveNote(it, view) {
    const n = NR(), note0 = it ? dash.moveNote(it.overdue ? dash.recView(it).view : '', view, !!it.overdue) : dash.moveNote('', view, false);
    return dash.moveNoteIf(n.state ? n.state() : '', note0);
  }
  function recDone(rc, r, id, o) {
    const n = NR(), same = rc.alive() && rc.rs() === r;
    r.busy = false;
    if (o.kind === 'saved' || o.kind === 'nochange') {
      delete st.drafts[id];
      rc.flash(o.msg, false);
      const mark = rc.mark();
      // 배지·목록·팝업이 onChange로 다시 그려진다. 저장 응답 round_closed(NO_BID로 회차가 닫힘)여도 같은 경로로 목록을 다시 받는다
      Promise.resolve(n.load()).then(function () {   // P3-8: 목록을 다시 받은 뒤 그 기관이 지금 보기에서 빠졌으면 저장 안내 끝에 한 문장
        if (!same || !rc.alive() || rc.rs() !== r) return;
        const note = rc.note(o, mark);
        if (note) rc.flash(o.msg + ' ' + note, false);
      });
      if (!same) return;
      r.err = ''; r.errs = {}; r.cf = null;
      // round_closed면 이력의 닫힌 회차(close_reason_cd NO_BID)를 다시 받아 읽기용으로 보이게 하고, 새 회차 저장은 round_seq null·base_rev_no 0으로 간다
      recLoadHist(rc, true).then(function () { if (rc.alive()) recFocus(rc, 'save'); });   // 저장 뒤 포커스는 저장 버튼
      return;
    }
    if (o.recheck || o.reload) n.load();          // 권한(can_edit)·최신 기록이 바뀌었을 수 있다
    if (!same) { if (o.kind !== 'confirm') rc.flash(o.msg || '저장하지 못했습니다.', true); return; }   // 저장 중에 다른 기관으로 옮겨도 실패 안내는 남긴다
    const top = !!(o.auth && rc.authErr);          // 팝업: 401·403은 위쪽 알림 줄(403 뒤에는 입력 칸이 사라져 절 안 문구도 같이 지워진다)
    r.err = ''; r.errs = {}; r.cf = null;
    if (o.kind === 'field') r.errs[o.field] = o.msg;
    else if (o.kind === 'confirm') r.cf = { state: o.prep };
    else if (top) rc.authErr(o.msg);
    else r.err = o.msg;
    repaintRc(rc);
    if (o.kind === 'field') recFocusField(rc, o.field);
    else if (o.kind === 'confirm') recFocus(rc, 'cf-yes');
    else recFocus(rc, top ? 'save' : 'alert');
    if (o.reload) recLoadHist(rc, true);              // 먼저 저장된 최신 기록을 위에 보인다(입력은 그대로)
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
    if (prep && prep.can_view === false) return false;   // 열람 규칙: 사전준비 시작 뒤 영업팀원은 담당자만 본다 — 못 보는 건으로 보내지 않는다
    if (!P || !A || !A.openNavItem || !P.SOON_ID) return false;
    A.openNavItem(P.SOON_ID);
    if (P.openCase && prep) P.openCase(prep.bid_case_id || prep.bidCaseId);
    return true;
  }

  // 열 수 없는 건(can_view === false)의 이유 문구. 담당자 이름은 호출부가 textContent/esc 경로로 쓴다. can_view가 false가 아니면 fallback.
  function prepNoViewMsg(p, fallback) {
    if (!(p && p.can_view === false)) return fallback;
    const names = (Array.isArray(p.assignee_names) ? p.assignee_names : []).filter(Boolean).join(', ') || '다른 담당자';
    return names + ' 담당으로 사전준비가 진행 중이라 상세를 볼 수 없습니다. 영업팀장·영업부장에게 문의하세요.';
  }
  dash.prepNoViewMsg = prepNoViewMsg;

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
      ((x.r.status === 401 || x.r.status === 403) ? '제안 사전준비를 시작할 권한이 없습니다(' + x.r.status + '). 로그인 사번과 권한을 확인하세요.'
        : '제안 확정하지 못했습니다(' + x.r.status + '). 잠시 뒤 다시 시도하세요.');
    return { again: false, msg: String(msg) };
  };
  dash.goPrep = goPrep;   // 입찰 현황판의 [제안 사전준비]가 확정 뒤·이미 진행 중일 때 그 기관의 사전준비 화면으로 간다
  // 입찰 공고 현황의 [제안 확정]은 없앴다(사용자 11-25: 확정은 입찰 현황판에서만). 이 화면과 지도 팝업·포털 상세는 [입찰 현황판에서 열기]로 현황판의 그 기관 줄로 데려간다.
  dash.openBoard = function (rec) {
    const A = root.app, N = root.nav, K = root.kbboard;
    if (!A || !A.openNavItem || !N || !N.DASH_ID) return false;
    const ok = !!A.openNavItem(N.DASH_ID);
    if (ok && K && K.revealGoal && rec && rec.institutionId) K.revealGoal(rec.institutionId);
    return ok;
  };

  const SKELETON =
    '<section id="db-root" aria-label="입찰 공고 현황">' +
    '<div class="db-top"><h2>입찰 공고 현황</h2><span class="sub">전국 공고와 입찰 예정(지역별 공고현황과 같은 기관)</span><span class="meta">기준일 <b id="db-asof"></b></span></div>' +
    '<section class="pnl db-nb" id="db-notice" aria-labelledby="db-nb-h" hidden></section>' +
    '<div id="db-flash" class="db-flash" role="status"></div><div id="db-err" class="db-state db-banner" role="alert" style="display:none"></div>' +
    '<section class="pnl db-kq" id="db-tl" aria-labelledby="db-kq-h"></section>' +
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
    renderList();
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

  // 띠 [선정 결과 대기 n곳 보기]: [다가오는 입찰] 탭으로 → 소묶음 제목을 목록 맨 위로 → 그 목록에 포커스(제목을 읽어 준다) → 제목을 1.6초 강조.
  function showWait() {
    if (st.tab !== 'up') setTab('up', false);
    const g = $('db-g0w'), lb = $('db-nwlb'), sc = $('db-scroll');
    // 바깥 탭 칸(#tab-soon)은 '목록 칸 위 160px'(소묶음 제목 + 2줄)이 보일 만큼만 움직인다 — 목록 칸 전체를 맞추면 띠가 화면 밖으로 밀린다(design 11-23 실측)
    const tab = sc && sc.closest ? sc.closest('#tab-soon') : null;
    if (tab) { const need = sc.getBoundingClientRect().top + 160 - tab.getBoundingClientRect().bottom; if (need > 0) tab.scrollTop += need; }
    if (sc && g) sc.scrollTop += g.getBoundingClientRect().top - sc.getBoundingClientRect().top;   // 소묶음 제목을 목록 칸 맨 위로
    if (lb && lb.focus) { try { lb.focus({ preventScroll: true }); } catch (e) { lb.focus(); } }   // 포커스가 스크롤을 다시 끌지 않게
    if (!g) return;
    g.classList.add('is-target');
    clearTimeout(tgTimer);
    tgTimer = setTimeout(function () { const x = $('db-g0w'); if (x) x.classList.remove('is-target'); }, 1600);
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
    if (e.key === 'Escape' && st.rec.cf && !st.rec.busy) { recCfNo(boardRc); return; }
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
    if (dash.isViewOnly() && ['db-edit', 'bk-edit', 'db-cf', 'db-do'].indexOf(btn.id) >= 0) return;   // 보기 전용: 버튼이 없어도 함수가 한 번 더 막는다
    switch (btn.id) {
      case 'db-nb-wait': showWait(); break;
      case 'db-nb-more': { const lb = $('db-nlb'); if (lb) { if (lb.scrollIntoView) lb.scrollIntoView({ block: 'nearest' }); lb.focus(); } break; }
      case 'db-chk': {
        const wasSel = st.sel && openCheckItem(st.sel);
        st.chkOpen = !st.chkOpen;
        if (!st.chkOpen && wasSel) { st.sel = ''; renderPane(); }   // 접으면 그 목록에서 고른 기관의 상세도 닫는다
        renderList(); { const b = $('db-chk'); if (b) b.focus(); } break;
      }
      case 'db-edit': { const it = st.sel ? findItem(st.sel) : null; if (it && root.app && root.app.openEdit) root.app.openEdit(it.rec, { from: 'bid_notice', focus: 'status' }); break; }
      case 'db-rec-save': recSave(boardRc, false); break;
      case 'db-rec-cf-yes': st.rec.cf = null; recSave(boardRc, true); break;
      case 'db-rec-cf-no': recCfNo(boardRc); break;
      case 'db-rec-revert': recRevert(boardRc); break;
      case 'db-rec-retry': recLoadHist(boardRc, false); break;
      case 'bk-edit': { const it = selItem(); if (it && root.app && root.app.openEdit) root.app.openEdit(it.rec, { from: 'bid_notice', focus: 'bank' }); break; }
      case 'bk-retry': { const it = selItem(), b = BC(); if (it && b) b.load(recId(it)); break; }
      case 'db-clear': case 'db-clear-w': st.q = ''; st.region = ''; st.type = ''; fillFilters(); renderList(); { const q = $('db-q'); if (q) q.focus(); } break;
      case 'db-board': { const it = findItem(st.sel); if (!(it && dash.openBoard(it.rec))) flash('입찰 현황판을 열 수 없습니다. 왼쪽 메뉴의 [입찰 현황판]에서 여세요.', true); break; }   // 확정은 현황판에서만(사용자 11-25) — 이 화면에는 확정 단추가 없다
      case 'db-open': { const it = findItem(st.sel); const p = it && activeFor(it.rec); if (!goPrep(p)) flash(prepNoViewMsg(p, '이 기관의 사전준비 건을 열지 못했습니다. 메뉴의 [영업 추진 준비 › 제안 준비 현황]에서 여세요.'), true); break; }
      // 눌린 버튼은 다시 그려져 사라진다 — 포커스를 같은 뜻의 새 요소로 돌려 키보드 사용자가 맥락을 잃지 않게 한다.
      case 'db-widen': { setWindow(btn.getAttribute('data-win'), true); const r = host.querySelector('#db-per input:checked'); if (r) r.focus(); break; }
      case 'db-kq-find': { const q = $('db-q'); if (q) { if (q.scrollIntoView) q.scrollIntoView({ block: 'nearest' }); q.focus(); } break; }
      case 'db-map': case 'db-tomap2': { const m = document.getElementById('tab-btn-map'); if (m) m.click(); break; }
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
    m.flashMsg = isErr ? '' : msg;
    if (f) f.textContent = isErr ? '' : msg;
    if (e) { e.textContent = isErr ? msg : ''; e.hidden = !isErr; }
  }
  function dmRepaint() { if (dm.cur) dmRender(); }
  function dmHeadEnv(m) {
    return { serverMode: serverMode(), hasEmp: hasEmp(), role: role(), emp: empNo(), today: todayDate(), bid: headBid(m.it), repaint: dmRepaint, screen: m.screen, instName: m.rec ? m.rec.name : '' };
  }
  function dmActives(m) {
    const id = m.rec && m.rec.institutionId;
    return id ? dash.activePreps(m.preps).filter(function (p) { return instId(p) === id; })[0] || null : null;
  }

  // 팝업의 공고 상태 기록 — 현황판과 같은 함수(recSave·recDone …)에 이 맥락을 넘긴다. 상태 m.rc는 열 때마다 새로, 초안은 st.drafts를 같이 쓴다.
  // 감사 화면 이름: 서버 NoticeUiIds.SCREENS가 map_popover·bid_board를 허용하면 true로 바꾼다(그 전에는 bid_notice 유지 — 허용 목록 밖 값은 감사에서 무효 화면으로 기록된다).
  const REC_POPUP_SCREEN = false;
  function dmRc(m) {
    if (m.rcx) return m.rcx;
    m.rcx = {
      idp: 'dm-',
      alive: function () { return dm.cur === m; },
      it: function () { return m.it; },
      rs: function () { return m.rc; },
      q: function (sel) { return m.el.querySelector(sel); },
      flash: function (msg, isErr) { if (dm.cur === m) dmFlash(msg, isErr); },
      authErr: function (msg) { if (dm.cur === m) dmFlash(msg, true); },
      viewOnly: function () { return !!m.readOnly; },
      screenId: function () { return REC_POPUP_SCREEN ? m.screen : undefined; },
      resetComp: function () { m.comp = false; m.compLater = false; },
      mark: function () { return {}; },
      note: function (o) {   // 지도 미처리 패널에서 열었을 때만: 패널의 지금 보기 기준(전체 보기면 붙이지 않는다)
        if (dm.cur !== m || typeof m.noteView !== 'function' || m.flashMsg !== o.msg) return '';
        const pv = m.noteView();
        return !pv || pv === 'all' ? '' : recMoveNote(dash.itemForRec(m.rec, todayDate()), pv);
      }
    };
    return m.rcx;
  }
  function dmRecSync(m) {   // 팝업이 그려질 때마다: 기관·사번이 바뀐 경우에만 이력을 다시 받는다
    const changed = recGuard(), id = recId(m.it);
    if (changed || !m.rc) m.rc = recFresh('');
    if (!id || !recOn() || ie.isOpenCheck(m.rec)) { if (m.rc.id) m.rc = recFresh(''); return; }
    if (m.rc.id === id) return;
    m.rc = recFresh(id);
    recLoadHist(dmRc(m), false);
  }
  function dmRecDirty(m) {
    const n = NR(), d = n ? st.drafts[recId(m.it)] : null;
    return !!(d && !n.sameDraft(d, n.blankDraft(recCur(dmRc(m)))));
  }
  function dmRecDiscard(m) { delete st.drafts[recId(m.it)]; }
  function dmLeaveWhat(m, kind) {   // 이탈 상자 문구: 저장하지 않은 것의 이름
    const bank = !!(m.bankEdit && m.bankEdit.ctl && m.bankEdit.ctl.dirty()), rec = kind !== 'back' && dmRecDirty(m);
    return bank && rec ? '약정과 공고 상태 기록' : rec ? '공고 상태 기록' : bank ? '약정' : '';   // 둘 다 깨끗하면 '' — dmRender가 상자를 닫는다(qa 11-25 P2-1)
  }
  function dmLeaveKeep(m) { return m.el.querySelector('#ie-bk-bank') || m.el.querySelector('#dm-db-rec-op') || m.el.querySelector('#dm-db-rec-save') || m.el.querySelector('#dm-name'); }
  function dmCompEnd(m) { m.comp = false; if (m.compLater) { m.compLater = false; if (dm.cur === m) dmRender(); } }
  // 현황판이 끼우는 머리 단추(opts.headExtra = { html(m, { confirm, act }), onClick(btn, m) }) — 판정은 호출한 화면이 한다. 실패해도 팝업은 그대로 그린다.
  function dmHeadExtra(m, act) {
    if (!m.headExtra || m.bankEdit) return '';
    try { return String(m.headExtra.html(m, { confirm: !!(m.confirm && act === 'confirm'), act: act }) || ''); } catch (e) { return ''; }
  }
  // 상세를 다시 그린다. 위 상자(#dm-box)·알림 줄(#dm-flash·#dm-err)은 그대로 두고 머리 줄(#dm-bar)·이유/확인 상자(#dm-act-note)·본문(#dm-pane)만 바꾸며, 스크롤·포커스를 이어 준다.
  // 11-19 저녁 design 4-4: 버튼은 머리 줄 오른쪽(주버튼 → [편집] → ×), 확정 확인 상자는 머리 아래 고정 영역(스크롤 안 됨).
  function dmRender() {
    const m = dm.cur;
    if (!m) return;
    if (m.comp) { m.compLater = true; return; }   // 한글 조합 중 다시 그리면 조합이 끊긴다 — 끝난 뒤로 미룬다(dmCompEnd)
    dmRecSync(m);
    if (m.leaveAsk && !dmLeaveWhat(m, m.leaveAsk)) { m.leaveAsk = false; m.leaveFocus = false; }   // 저장·되돌리기로 저장하지 않은 것이 없어졌으면 이탈 상자를 닫는다(qa 11-25 P2-1)
    const pane = m.el.querySelector('#dm-pane'), bar = m.el.querySelector('#dm-bar'), nt = m.el.querySelector('#dm-act-note');
    if (!pane || !bar || !nt) return;
    const body0 = pane.querySelector('.db-pane-body');
    const top = body0 ? body0.scrollTop : 0;
    const a = document.activeElement;
    const inPane = !!(a && [pane, bar, nt].some(function (x) { return x.contains && x.contains(a); }));
    const keepId = inPane ? (a.id || '') : '';
    const keepHc = inPane && a.getAttribute ? (a.getAttribute('data-hc') || '') : '';
    const keepSel = inPane && keepId && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;   // 입력 칸 커서
    // 금고 약정 편집 단계: 입력 묶음(#dm-bk-host)은 노드째 떼어 두었다가 다시 꽂는다 — 응답(preps·약정)이 올 때마다 갈아 끼우면 입력값·포커스가 사라진다(design 6-2 필수 조건)
    const bk = m.bankEdit && m.bankEdit.host ? m.bankEdit.host : null;
    const keepEl = bk && a && bk.contains && bk.contains(a) ? a : null;
    if (bk && bk.parentNode) bk.parentNode.removeChild(bk);
    const ctx = actCtx();
    let act = dash.actionKind(m.rec, ctx, dash.activePreps(m.preps), root.prep, gateOpts());
    if (m.prepSt === 'loading' && act !== 'unavailable') act = 'wait';   // 진행 중인지 모르는 동안 [제안 확정]을 보였다 바꾸지 않는다
    if (m.readOnly) act = 'none';   // 보기 전용: [제안 확정]·[사전준비 열기] 없음(전산팀은 prep.canView 밖이라 이미 none이지만 규칙으로 한 번 더 막는다)
    else if (m.noConfirm && act === 'confirm') act = 'noconfirm';   // 협약 성과 화면에서 연 상세: [제안 확정] 없이 이유 글만
    const raw =root.render && root.render.popRawHtml ? root.render.popRawHtml(m.rec) : '';
    const parts = dash.popupHtml(m.it, {
      act: act, board: m.screen === 'bid_board', goal: dash.isGoalRec(m.rec, { year: goalSt.year, ids: goalSt.ids }), early: act === 'confirm' && dash.proposeEarly(m.rec, gateOpts()), status: act === 'confirm' ? dash.proposeStatus(m.rec, gateOpts()) : '', confirm: m.confirm && act === 'confirm', busy: m.busy, kb: dash.kbEntry(m.rec, root.KB_VERIFIED), next: dash.kbEntry(m.rec, root.KB_NEXT), role: ctx.role, today: todayDate(),
      headHtml: root.headcard ? root.headcard.paneSection(m.rec, dmHeadEnv(m)) : undefined,
      recordHtml: ie.isOpenCheck(m.rec) ? '' : recViewHtml(dmRc(m)), bank: m.readOnly ? dash.lockBank(bankView(m.rec)) : bankView(m.rec),
      nameId: 'dm-name', readOnly: m.readOnly, back: dmBackInfo(m), editing: !!m.bankEdit,   // 보기 전용: 머리 줄에는 ×만(주버튼은 act 'none'이라 없다). back = 스택 단계(약정 편집 → 읽기 → 목록)
      tailHtml: raw ? '<div class="db-sec"><details class="pop-raw"><summary>원본 정보</summary>' + raw + '</details></div>' : '',
      extraHtml: dmHeadExtra(m, act),
    });
    bar.innerHTML = parts.bar; nt.innerHTML = parts.note; pane.innerHTML = parts.body;
    if (m.leaveAsk) nt.innerHTML = dash.leaveBoxHtml(m.leaveAsk === 'close' || (m.leaveAsk === 'exit' && !(m.back && m.back.go)), dmLeaveWhat(m, m.leaveAsk));   // 이탈 확인 상자가 확정 확인 상자 자리를 쓴다
    if (bk) {   // 읽기 부분(dl·근거·비교)은 새로 그리고, 입력 묶음만 원래 노드를 [금고 약정 고치기] 자리(.bk-foot)에 되꽂는다
      const sec = pane.querySelector('#db-bank'), foot = sec ? sec.querySelector('.bk-foot') : null;
      if (foot) foot.parentNode.replaceChild(bk, foot); else (sec || pane).appendChild(bk);
      if (sec) sec.classList.add('is-editing');
    }
    const nb = pane.querySelector('.db-pane-body');
    if (nb) nb.scrollTop = top;
    if (keepEl && keepEl.focus && document.body.contains(keepEl)) keepEl.focus();   // 입력 칸 포커스는 같은 노드로(id 없는 라디오·[고치기]도 지킨다)
    else if (inPane) {   // 다시 그린 요소로 포커스를 돌린다(없으면 제목으로)
      let t = keepId ? m.el.querySelector('#' + keepId) : null;
      if (!t && keepHc) t = pane.querySelector('[data-hc="' + keepHc + '"]');
      if (!t) t = m.el.querySelector('#dm-name');
      if (t && t.focus) { t.focus(); try { if (keepSel && t.setSelectionRange) t.setSelectionRange(keepSel[0], keepSel[1]); } catch (e) { /* 날짜 칸 등 */ } }
    }
    // 확정 확인 상자가 펼쳐지면 [제안 확정]은 비활성이라 포커스를 상자의 [확정하기]로 옮긴다(닫으면 [제안 확정]으로 돌아간다, dmClick db-cancel·dmKey Esc)
    // [확정하기]로 포커스를 옮기는 것은 상자가 막 펼쳐질 때 한 번뿐 — 약정·기록 응답으로 다시 그릴 때마다 옮기면 [취소]에 있던 포커스가 끌려가 Enter 한 번에 확정이 나간다(qa 11-19 P2-1)
    if (m.confirm && m.confirmFocus && act === 'confirm') { m.confirmFocus = false; const b = m.el.querySelector('#db-do'); if (b) b.focus(); }
    // 현황판 줄의 [제안 확정]으로 열었으면(opts.focus === 'confirm') 팝업의 [제안 확정]이 그려지는 순간 한 번만 포커스를 옮긴다. 받는 중(wait)에는 기다린다.
    // 사용자가 팝업 안에서 이미 다른 요소로 포커스를 옮겼으면(초기 포커스 대상 #dm-name·#dm-box가 아니면) 끌고 가지 않고 포기한다(qa 11-17 P3-6).
    const fa = document.activeElement;
    if (m.focus === 'confirm' && fa && m.el && m.el.contains(fa) && fa.id !== 'dm-name' && fa.id !== 'dm-box') m.focus = '';
    if (m.focus === 'confirm' && !m.confirm) {
      const cf = m.el.querySelector('#db-cf');
      if (cf) { cf.focus(); m.focus = ''; }
      else if (act !== 'wait') m.focus = '';   // 판정이 끝났는데 버튼이 없으면(이미 진행 중 등) 포기
    }
    if (m.leaveAsk && m.leaveFocus) { m.leaveFocus = false; const k = m.el.querySelector('#dm-leave-keep'); if (k && k.focus) k.focus(); }   // 이탈 확인 상자가 막 뜰 때 한 번만 [계속 입력]으로
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
          dmFlash(m.it.name + dash.josaEul(m.it.name) + ' 제안 확정했습니다. [영업 추진 준비 › 제안 준비 현황]에서 담당자를 정하세요.', false);
          return dmLoadPreps(m).then(function () { dmRender(); });
        }
        const f = dash.confirmFail(x);
        if (f.again) {   // 이미 진행 중(409 PREP_ALREADY_ACTIVE): 오류 없이 그 건으로 이동한다. 못 열면 버튼이 [사전준비 열기]로 바뀐다
          return dmLoadPreps(m).then(function () { if (dm.cur !== m) return; const p = dmActives(m); if (p && goPrep(p)) dash.closeDetail(false); else if (p && p.can_view === false) { dmFlash(prepNoViewMsg(p, ''), true); dmRender(); } });
        }
        dmFlash(f.msg, true);
        dmRender();
      })
      .catch(function () { if (dm.cur !== m) return; m.busy = false; dmFlash('서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인하세요.', true); dmRender(); });
  }

  // ── 한 단계 뒤로(design 11-19 6-1): [이전]·×·Esc는 같은 길 — 약정 편집 → 기관 상세 → (협약 목록) → 닫기 ──
  function roOf(s) { s = String(s || ''); const c = s.charCodeAt(s.length - 1) - 0xAC00; return c >= 0 && c % 28 !== 0 && c % 28 !== 8 ? '으로' : '로'; }
  function dmBackInfo(m) {
    if (m.bankEdit) return { aria: '이전: 기관 상세', close: '닫기 — 기관 상세로 돌아갑니다' };
    const l = m.back && m.back.label;
    return l ? { aria: '이전: ' + l, close: '닫기 — ' + l + roOf(l) + ' 돌아갑니다' } : null;
  }
  function dmBack(m) {
    if (m.rc && m.rc.busy) return;   // 기록 저장 중에는 벗어나지 않는다(결과를 보여 줄 곳이 없어진다)
    if (m.bankEdit) {
      if (m.bankEdit.ctl && m.bankEdit.ctl.dirty()) { m.leaveAsk = 'back'; m.leaveFocus = true; dmRender(); return; }
      dmBankLeave(m); return;
    }
    if (dmRecDirty(m)) { m.leaveAsk = 'exit'; m.leaveFocus = true; dmRender(); return; }   // 이전·닫기는 어느 쪽이든 이 상세를 벗어난다
    if (m.back && typeof m.back.go === 'function') { const go = m.back.go; dash.closeDetail(false); go(); return; }   // 목록으로(스크롤·줄 포커스는 go가 되살린다)
    dash.closeDetail(true);
  }
  function dmCloseAll(m) {   // 바깥(막) 클릭: 단계와 상관없이 전체 닫기, 작성 중이면 확인 상자
    if (m.rc && m.rc.busy) return;
    if ((m.bankEdit && m.bankEdit.ctl && m.bankEdit.ctl.dirty()) || dmRecDirty(m)) { m.leaveAsk = 'close'; m.leaveFocus = true; dmRender(); return; }
    dash.closeDetail(true);
  }
  // 금고 약정 편집(design 6-2): '현재 금고 은행' 절 안에서 바로 고친다. 상세를 닫지 않고 편집 창을 열지도 않는다 — 근거 문장·행안부 값을 보면서 입력한다.
  function dmBankEnter(m) {
    const b = BC();
    if (m.bankEdit || m.readOnly || !b || !b.attach || !b.groupHtml) return;
    const host = document.createElement('div');
    host.id = 'dm-bk-host'; host.className = 'bk-edit-host';
    host.innerHTML = b.groupHtml() + '<div class="bk-done"><button type="button" id="bk-done">입력 마치기</button></div>';
    m.confirm = false; m.confirmFocus = false;   // 확정 확인 상자가 열려 있었으면 접는다
    m.bankEdit = { host: host, ctl: null };
    dmRender();   // 입력 묶음을 절에 꽂는다(dmRender가 노드를 보존)
    m.bankEdit.ctl = b.attach({ wrap: host, rec: m.rec });   // attach는 wrap 안에서만 요소를 찾는다
    const sec = m.el.querySelector('#db-bank');
    if (sec && sec.scrollIntoView) sec.scrollIntoView({ block: 'start' });
    if (m.bankEdit.ctl && m.bankEdit.ctl.focus) m.bankEdit.ctl.focus();
  }
  function dmBankLeave(m) {   // 읽기 단계로. 포커스는 [금고 약정 고치기](#bk-edit)
    const b = m.bankEdit;
    if (!b) return;
    m.bankEdit = null; m.leaveAsk = false; m.leaveFocus = false;
    if (b.ctl) b.ctl.teardown();
    if (b.host.parentNode) b.host.parentNode.removeChild(b.host);
    dmRender();
    const t = m.el.querySelector('#bk-edit') || m.el.querySelector('#dm-name'); if (t && t.focus) t.focus();
  }
  // 기관 정보 수정 창이 닫힌 뒤(instedit teardown → onClose): 상세는 열린 채 inert만 풀고, 저장했을 수 있으니 항목을 다시 만들어 그린다.
  function dmEditClosed(m) {
    if (dm.cur !== m) return;
    m.el.removeAttribute('inert');
    m.it = dash.itemForRec(m.rec, todayDate());
    dmRender();
    const b = m.el.querySelector('#dm-info-edit'); if (b && b.focus) b.focus();   // 다시 그려 opener 노드가 바뀌므로 id로 찾는다
  }

  function dmClick(e) {
    const m = dm.cur, t = e.target;
    if (!m || !t) return;
    if (t === m.el) { if (m.down === m.el) dmCloseAll(m); return; }   // 바깥(배경) 클릭 — 글을 드래그하다 배경에서 놓은 경우는 닫지 않는다. 단계와 상관없이 전체 닫기(작성 중이면 확인 상자)
    if (!t.closest) return;
    if (m.bankEdit && m.bankEdit.ctl && t.closest('#ie-bank') && m.bankEdit.ctl.click(e)) return;   // 약정 입력 칸의 단추는 bankcontract가 처리(true면 더 보지 않는다)
    const hcb = t.closest('[data-hc]');
    if (hcb && root.headcard) { root.headcard.onPaneClick(hcb.getAttribute('data-hc'), function () { return dmHeadEnv(m); }); return; }
    const btn = t.closest('button');
    if (!btn) return;
    if (btn.getAttribute('data-hx') && m.headExtra && typeof m.headExtra.onClick === 'function') { if (!m.readOnly && !btn.disabled) m.headExtra.onClick(btn, m); return; }   // 현황판이 끼운 머리 단추(NEXT 114)
    if (m.readOnly && ['dm-edit', 'bk-edit', 'db-cf', 'db-do', 'db-open'].indexOf(btn.id) >= 0) return;   // 보기 전용: 버튼이 없어도 함수가 한 번 더 막는다
    if (m.readOnly && btn.id === 'dm-info-edit') return;
    if (m.noConfirm && (btn.id === 'db-cf' || btn.id === 'db-do')) return;   // 협약 성과 화면: 버튼이 없어도 함수가 한 번 더 막는다
    switch (btn.id) {
      case 'dm-close': case 'dm-back': case 'bk-done': dmBack(m); break;
      case 'dm-leave-drop':
        if (m.rc && m.rc.busy) break;   // 저장 중에는 버리지 않는다(dmBack·dmCloseAll과 같게, qa 11-25 P3-2)
        if (m.leaveAsk === 'close') { dmRecDiscard(m); dash.closeDetail(true); }
        else if (m.leaveAsk === 'exit') { dmRecDiscard(m); m.leaveAsk = false; dmBack(m); }
        else dmBankLeave(m);
        break;
      case 'dm-leave-keep': { m.leaveAsk = false; dmRender(); const f = dmLeaveKeep(m); if (f && f.focus) f.focus(); break; }
      case 'dm-db-rec-save': recSave(dmRc(m), false); break;
      case 'dm-db-rec-cf-yes': m.rc.cf = null; recSave(dmRc(m), true); break;
      case 'dm-db-rec-cf-no': recCfNo(dmRc(m)); break;
      case 'dm-db-rec-revert': { recRevert(dmRc(m)); if (m.leaveAsk) { dmRender(); recFocus(dmRc(m), 'save'); } break; }   // repaintRc는 dmRender를 안 거치므로 이탈 상자 자동 닫기를 여기서 돌린다
      case 'dm-db-rec-retry': recLoadHist(dmRc(m), false); break;
      // [기관 정보 수정]: 상세는 닫지 않는다. 상세를 inert로 두고 그 위 한 층(#edit-modal z-index 31)에 편집 창을 연다. 금고 약정 묶음은 뺀다(상세 안에서 고친다, opts.noBank).
      case 'dm-info-edit': {
        const A = root.app;
        if (!A || !A.openEdit || m.el.hasAttribute('inert')) break;
        m.el.setAttribute('inert', '');
        A.openEdit(m.rec, { from: m.screen, opener: btn, noBank: true, onClose: function () { dmEditClosed(m); } });
        if (!(root.instedit && root.instedit.isOpen && root.instedit.isOpen())) m.el.removeAttribute('inert');   // 창이 안 열렸으면(보기 전용·옛 instedit) onClose가 오지 않는다 — inert를 남기지 않는다
        break;
      }
      case 'bk-edit': dmBankEnter(m); break;   // 상세 안 '현재 금고 은행' 절에서 바로 편집(편집 창을 열지 않는다)
      case 'bk-retry': { const b = BC(); if (b) b.load(String(m.rec.institutionId || '')); break; }
      case 'db-cf': m.confirm = true; m.confirmFocus = true; dmRender(); break;
      case 'db-cancel': m.confirm = false; dmRender(); { const b = m.el.querySelector('#db-cf'); if (b) b.focus(); } break;
      case 'db-do': dmDoConfirm(m); break;
      case 'db-open': { const p = dmActives(m); if (p && goPrep(p)) dash.closeDetail(false); else dmFlash(prepNoViewMsg(p, '이 기관의 사전준비 건을 열지 못했습니다. 메뉴의 [영업 추진 준비 › 제안 준비 현황]에서 여세요.'), true); break; }
      case 'db-board': if (dash.openBoard(m.rec)) dash.closeDetail(false); else dmFlash('입찰 현황판을 열 수 없습니다. 왼쪽 메뉴의 [입찰 현황판]에서 여세요.', true); break;   // 현황판 밖 팝업: 확정 없이 현황판으로
      default: break;
    }
  }

  function dmKey(e) {
    const m = dm.cur;
    if (!m) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (m.busy) return;
      if (m.rc && m.rc.busy) return;   // 기록 저장 중
      if (m.rc && m.rc.cf) { recCfNo(dmRc(m)); return; }   // 기록 확인 상자만 닫고 [기록 저장]으로
      if (m.confirm) { m.confirm = false; dmRender(); const b = m.el.querySelector('#db-cf'); if (b) b.focus(); return; }
      if (m.leaveAsk) { m.leaveAsk = false; dmRender(); const f = dmLeaveKeep(m); if (f && f.focus) f.focus(); return; }   // 이탈 확인 상자만 닫는다
      dmBack(m);   // 약정 편집 → 기관 상세 → (협약 목록) → 닫기. 한 번에 한 단계
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
  // opts.noteView = 지도 패널의 지금 보기('pending'|'delayed'|'done'|'all')를 돌려주는 함수 — 저장 뒤 이동 안내 기준.
  // opts.headExtra = { html(m, { confirm, act }) → 머리 .dm-btns에 들어갈 조각, onClick(btn, m) } — 현황판의 [관심 기관으로…](NEXT 114). 단추에는 data-hx를 달고 판정은 호출한 화면이 한다.
  // opts.back = { label, go } — 같은 팝업 안 한 단계 뒤(협약 중인 기관 목록 → 상세). [이전]·×·Esc가 상세를 닫고 go()를 부른다. 없으면 지금처럼 닫는다.
  dash.openDetail = function (rec, opts) {
    if (typeof document === 'undefined' || !rec) return false;
    if (dm.cur) dash.closeDetail(false);
    const m = { rec: rec, it: dash.itemForRec(rec, todayDate()), opener: (opts && opts.opener) || document.activeElement,
      screen: (opts && opts.screen) || 'map_popover', fallback: (opts && opts.fallback) || '', refocus: (opts && opts.refocus) || null, back: opts && opts.back && typeof opts.back.go === 'function' ? opts.back : null, focus: (opts && opts.focus) || '', noConfirm: !!(opts && opts.noConfirm), changed: false, readOnly: dash.isViewOnly(), bankEdit: null, leaveAsk: false, leaveFocus: false,
      preps: null, prepSt: 'offline', confirm: false, busy: false, down: null, el: null,
      rc: recFresh(''), rcx: null, comp: false, compLater: false, flashMsg: '', noteView: opts && typeof opts.noteView === 'function' ? opts.noteView : null,
      headExtra: opts && opts.headExtra && typeof opts.headExtra.html === 'function' ? opts.headExtra : null };
    const ov = document.createElement('div');
    ov.className = 'modal-overlay dm-ov';
    ov.id = 'dm-ov';
    ov.innerHTML = '<div class="modal-box dm-box" id="dm-box" role="dialog" aria-modal="true" aria-labelledby="dm-name" tabindex="-1">' +
      '<div id="dm-bar"></div>' +
      '<div class="dm-note"><div id="dm-flash" class="db-flash" role="status"></div><div id="dm-err" class="db-state" role="alert" hidden></div><div id="dm-act-note"></div></div>' +
      '<div id="dm-pane" class="dm-pane"></div></div>';
    m.el = ov;
    dm.cur = m;
    document.body.appendChild(ov);
    ov.addEventListener('mousedown', function (e) { m.down = e.target; });
    ov.addEventListener('click', dmClick);
    ov.addEventListener('keydown', dmKey);
    const bkIn = function (e) {   // 약정 입력 칸의 입력·선택 변화를 bankcontract에 넘긴다(instedit의 wrap.oninput·onchange와 같은 길)
      const tg = e.target;
      if (dm.cur === m && m.bankEdit && m.bankEdit.ctl && tg && tg.closest && tg.closest('#ie-bank')) m.bankEdit.ctl.input(e);
    };
    ov.addEventListener('input', bkIn); ov.addEventListener('change', bkIn);
    // 공고 상태 기록 칸(id·라디오 이름 앞에 'dm-')
    ov.addEventListener('input', function (e) { const rc = dmRc(m), id = e.target && e.target.id; if (dm.cur === m && (id === rid(rc, 'next') || id === rid(rc, 'op'))) recInput(rc, e.target); });
    ov.addEventListener('change', function (e) { const rc = dmRc(m); if (dm.cur === m && e.target && e.target.name === rc.idp + 'rec-state') recPick(rc, e.target.value); });
    ov.addEventListener('compositionstart', function (e) { const id = e.target && e.target.id; if (id === 'dm-db-rec-op' || id === 'dm-db-rec-next') m.comp = true; });
    ov.addEventListener('compositionend', function (e) { const id = e.target && e.target.id; if (id === 'dm-db-rec-op' || id === 'dm-db-rec-next') dmCompEnd(m); });
    ov.addEventListener('toggle', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('db-rec-hist')) m.rc.histOpen = !!e.target.open;
      bankToggle(e, String(m.rec.institutionId || ''));
    }, true);
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

  // 보기 전용(시작화면에서 전산팀이 연 상세): 금고 약정 변경 단추가 서버 can_edit과 상관없이 나오지 않게 한다. 순수.
  dash.lockBank = function (view) {
    if (!view || !view.data) return view;
    return Object.assign({}, view, { data: Object.assign({}, view.data, { can_edit: false }) });
  };
  // 보기 전용 판정 — nav.isViewOnly(ctx) 한 곳(app.isViewOnly가 감싼다, 전산팀·전산팀장·디자이너 11-19). 어느 화면에서 열든 역할로 정한다. root.app이 없으면(순수 시험) false.
  dash.isViewOnly = function () { try { return !!(root.app && root.app.isViewOnly && root.app.isViewOnly()); } catch (e) { return false; } };

  dash.closeDetail = function (refocus) {
    const m = dm.cur;
    if (!m) return;
    dm.cur = null;
    if (m.bankEdit && m.bankEdit.ctl) { try { m.bankEdit.ctl.teardown(); } catch (e) { /* 닫기를 막지 않는다 */ } }   // 약정 편집 중에 닫혀도 bankcontract 구독을 푼다
    m.bankEdit = null;
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
  dash.popupState = function () { return dm.cur; };   // 시험용
  dash.repaintDetail = function () { if (dm.cur) dmRender(); };   // 현황판이 머리 단추(결재 중 칩 등)를 다시 그리게(NEXT 114)
  dash.detailFlash = function (msg, isErr) { dmFlash(msg, !!isErr); };   // 팝업 알림 줄(#dm-flash·#dm-err)에 한 줄
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
      else if (e.target.id === 'db-rec-next' || e.target.id === 'db-rec-op') recInput(boardRc, e.target);
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
      else if (e.target.name === 'rec-state') recPick(boardRc, e.target.value);
      else if (e.target.name === 'db-ov') setOvView(e.target.value);
      else if (e.target.name === 'db-per') setWindow(e.target.value, true);
      else if (e.target.name === 'db-kq-sc') {   // 막대만 바꾼다(목록은 그대로). 다시 그리면 라디오가 새로 만들어지므로 포커스를 돌려 준다
        st.kqScope = e.target.value === 'mine' ? 'mine' : 'all';
        renderStrip();
        const r = host && host.querySelector('#db-kq-scope input:checked'); if (r && r.focus) r.focus();
      }
    }, opt);
    st.confirm = false; st.busy = false; st.err = ''; st.flash = ''; st.tab = 'up'; st.kqScope = 'all';
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
      if (host && M) renderStrip();   // 목표·관심 전환은 목표 데이터를 받은 뒤에만 보인다
      const it = host && M ? selItem() : null;
      if (it && $('db-pane') && !st.comp && st.act !== undefined && st.act !== paneAct(it, actCtx(), dash.activePreps(st.preps))) renderPane();
    });
  };

  // 기관 편집 저장 뒤 서버 목록이 바뀌면 현황판(열려 있을 때만)을 다시 그린다.
  dash.refresh = function () { if (host && M) refreshData(); };

  dash.unmount = function () {
    seq += 1;
    clearTimeout(tgTimer);
    if (offNr) { offNr(); offNr = null; }
    if (root.headcard) root.headcard.reset();   // 열린 편집 모달·사진 Blob 주소를 정리한다
    if (ac) ac.abort();
    ac = null;
    if (host) host.innerHTML = '';
    host = null; M = null;
    bankUnwatch();
  };

  let stWho = null;
  // 계정이 바뀌면 앞 사용자가 고른 기관·검색어·지역·종류·기록 초안을 버린다(app.onProfileChanged). 같은 사람이면 그대로 둔다(내 정보 저장에 선택이 풀리지 않게).
  dash.onProfileChange = function () {
    const w = empNo();
    if (w === stWho) return;
    stWho = w;
    dash.clearGoals();   // 앞 계정의 올해 목표 집합과 늦은 응답을 버린다(qa 11-19 P3-1)
    st.sel = ''; st.q = ''; st.region = ''; st.type = ''; st.confirm = false; st.drafts = {}; st.rec = recFresh(''); st.kqScope = 'all';
    if (host && M) refreshData();   // refreshData가 필터 칸도 다시 채운다
  };

  if (isNode) module.exports = dash;
  else root.dashboard = dash;
})(typeof self !== 'undefined' ? self : this);
