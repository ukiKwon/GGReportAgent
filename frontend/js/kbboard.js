(function (root) {
  'use strict';
  // 입찰 현황판(2026-11-16 역할 재정의, 사용자 확정) — 국민은행 상태 화면.
  // 구성: 알림 줄(공고가 난 국민은행이 맡은 기관) · 국민은행이 맡은 기관 목록(+ 2027년부터 맡는 기관 묶음) | 준비 중인 제안 목록 · 금고 약정 와플 · 제안 진행 단계.
  // 규격: handoff/agents/design-reviewer/2026-11-16_1241_a6db51fa.md 6-A~6-D. 접두어 hb-. 화면 글에 1인칭 '우리'를 쓰지 않는다(낙찰 은행 '우리은행'과 헷갈림). 회차 소식 줄의 출처 문장 속 은행 이름은 그대로 둔다.
  // 새 판정은 만들지 않고 dashboard.js의 함수(model·kbEntry·isOurs·stageCounts·itemForRec …)를 조합한다.
  // 순수 부분은 node 테스트 대상이고, DOM 부분(mount/unmount)은 app.js가 #dash-root를 넘겨 부른다.
  // 순수 함수는 검증 자료(verified)와 2027년부터 자료(nextList)를 인자로 받는다(전역 root.KB_NEXT에 기대지 않는다). DOM 부분만 전역을 읽는다.
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const logic = isNode ? require('./logic.js') : root.logic;
  const dash = isNode ? require('./dashboard.js') : root.dashboard;
  const esc = logic.esc;
  const kbb = {};
  function P() { return isNode ? require('./prep.js') : root.prep; }

  // ── 순수: 국민은행이 맡은 기관 목록 ─────────────────────────────────
  kbb.ours = function (list, verified, scope, nextList) {
    return logic.dedupeByInstitution(list || []).filter(function (r) { return dash.isOurs(r, verified, scope, nextList); });
  };
  // 칩 글자(data-auditor 11-16): 지자체 1금고·2금고(일부 회계), 2027년부터, 법원 공탁금, 공공기관 주거래.
  kbb.slotText = function (rec, verified, nextList) {
    const k = dash.oursKind(rec, verified, nextList);
    if (k === 'muni') { const e = dash.kbEntry(rec, verified); return e && e.slot === 2 ? '2금고(일부 회계)' : (e && e.slot === 1 ? '1금고' : '금고'); }
    if (k === 'next') { const e = dash.kbEntry(rec, nextList); return (e && e.from ? e.from : '2027') + '년부터'; }
    return k === 'court' ? '공탁금' : (k === 'public' ? '주거래' : '');
  };
  // 지금 맡고 있지만 곧 다른 은행으로 바뀌는 기관(KB_VERIFIED의 leaves) — 칩 옆 배지 글자. 없으면 ''.
  kbb.leavesText = function (rec, verified) {
    const e = rec ? dash.kbEntry(rec, verified) : null;
    return e && e.leaves ? e.leaves + '년부터 다른 은행' : '';
  };
  // total = 지금 맡은 곳(지자체 1·2금고 + 켜진 법원·공공기관), next = 2027년부터 맡는 곳(따로 센다).
  kbb.summary = function (ours, verified, nextList) {
    const c = { total: 0, s1: 0, s2: 0, court: 0, pub: 0, next: 0 };
    ours.forEach(function (r) {
      const k = dash.oursKind(r, verified, nextList);
      if (k === 'next') { c.next += 1; return; }
      c.total += 1;
      if (k === 'muni') { const e = dash.kbEntry(r, verified); if (e && e.slot === 1) c.s1 += 1; else if (e && e.slot === 2) c.s2 += 1; }
      else if (k === 'court') c.court += 1;
      else if (k === 'public') c.pub += 1;
    });
    return c;
  };
  kbb.summaryHtml = function (c) {
    let h = '<b>' + c.total + '</b>곳';
    if (c.s1 || c.s2) h += ' · 1금고 ' + c.s1 + ' · 2금고 ' + c.s2;
    if (c.court) h += ' · 공탁금 ' + c.court;
    if (c.pub) h += ' · 주거래 ' + c.pub;
    if (c.next) h += ' · 2027년부터 ' + c.next;
    return h;
  };
  // 금고 은행 칸이 비어 있는 법원·공공기관 수(법원·공공기관을 켰을 때 각주에서 말한다).
  kbb.bankUnknownN = function (list) {
    return logic.dedupeByInstitution(list || []).filter(function (r) {
      const k = logic.kindOf(r.type);
      return (k === '법원' || k === '공공기관') && !String(r.bank || '').trim();
    }).length;
  };
  kbb.footHtml = function (scope, k) {
    const s = scope || dash.OURS_SCOPE;
    const base = '지자체는 행안부 금고지정 현황(2026.1.1. 기준)의 1·2금고';
    const more = [s.court ? '법원은 공탁금 보관은행' : '', s.public ? '공공기관은 주거래은행' : ''].filter(Boolean);
    let h = more.length ? base + ', ' + more.join(', ') + ' 칸으로 셉니다.' : base + '만 셉니다.';
    if (s.next) h += ' 2027년부터는 지정 결과 공고·기사로 확인한 곳입니다.';
    h += more.length ? ' 은행 칸이 빈 법원·공공기관 <b>' + Number(k || 0) + '</b>곳은 세지 않았습니다.' : ' 법원·공공기관은 아직 세지 않습니다.';
    return h;
  };
  // '회차 소식' 줄 — kb-verified의 next 문장을 그대로 쓴다('확정' 같은 말을 덧붙이지 않는다). 2027년부터 자료(from 있음)는 quote가 그 문장이다.
  // data-auditor 결과에 따라 SHOW_NEWS=false로 끈다.
  kbb.SHOW_NEWS = true;
  kbb.newsLine = function (entry) {
    const t = entry ? (entry.next || (entry.from ? entry.quote : '')) : '';
    return kbb.SHOW_NEWS && t ? '회차 소식: ' + t : '';
  };

  function byName(a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); }
  // 묶음 1 = 공고 진행 중(마감 전 → 미확인 → 결과 확인) → 경과(최근에 지난 순) → 기간 안 예정(가까운 순).
  // 묶음 2 = 기간 밖 예정(가까운 순) → 날짜 미상(이름순). 기간 'all'이면 묶음 2는 날짜 미상뿐이다.
  // 묶음 3(next) = 2027년부터 국민은행이 맡는 기관(이름순) — 지금 은행이 아니라 알림 줄·묶음 1·2에 넣지 않는다.
  kbb.groups = function (ours, today, key, verified, nextList) {
    const isNext = function (r) { return dash.oursKind(r, verified, nextList) === 'next'; };
    const cur = ours.filter(function (r) { return !isNext(r); });
    const nxt = ours.filter(isNext).map(function (r) { return dash.itemForRec(r, today); }).sort(byName);
    const m = dash.model(cur, today), k = dash.windowKey(key);
    const first = [].concat(m.notice, m.overdue, dash.windowItems(m, k));
    const inFirst = {}, dated = {};
    first.forEach(function (it) { inFirst[it.key] = true; });
    m.notice.concat(m.overdue, m.upcoming, m.later).forEach(function (it) { dated[it.key] = true; });
    const later = m.upcoming.concat(m.later).filter(function (it) { return !inFirst[it.key]; });
    const unknown = cur.filter(function (r) { return !dated[logic.instKey(r)]; })
      .map(function (r) { return dash.itemForRec(r, today); }).sort(byName);
    return { m: m, k: k, first: first, rest: later.concat(unknown), next: nxt, unknownN: unknown.length };
  };
  kbb.firstLabel = function (k, n) {
    return (k === 'all' ? '날짜를 아는 곳' : dash.WINDOW_LABELS[k] + ' 안에 입찰') + ' <b>' + n + '</b>곳 · 공고 진행 중·경과 포함';
  };
  kbb.firstEmpty = function (k) {
    return k === 'all' ? '입찰 날짜를 아는 기관이 없습니다.' : dash.WINDOW_LABELS[k] + ' 안에 입찰이 있는 기관이 없습니다.';
  };
  kbb.restLabel = function (n) { return '그 밖의 기관 <b>' + n + '</b>곳'; };
  kbb.nextLabel = function (n) { return '2027년부터 국민은행이 맡는 기관 <b>' + n + '</b>곳'; };

  function dText(n) { return n === 0 ? 'D-day' : 'D-' + n; }
  function statusChip(it) {
    if (it.notice) return dash.noticeChipHtml(it);
    if (it.overdue) { const v = dash.recView(it).view; return '<span class="ov-stamp' + (v === 'delayed' ? ' is-line' : v === 'done' ? ' is-plain' : '') + '">D+' + it.days + '</span>'; }
    if (it.unknown) return '<span class="dg-day unknown">날짜 미상</span>';
    return '<span class="dg-day ' + esc(it.band) + '">' + dText(it.days) + '</span>';
  }
  function metaHtml(it) {
    const base = esc(dash.regionName(it.region)) + ' · ' + esc(dash.kindOfRec(it.rec)) + ' · ';
    if (it.notice) { const nt = dash.recTagHtml(dash.recView(it)); return base + dash.noticeNote(it) + (nt ? ' · ' + nt : ''); }
    if (it.overdue) { const rt = dash.recTagHtml(dash.recView(it)); return base + (rt || esc(dash.overdueNote(it))); }   // 기록이 있으면 overdueNote 자리를 '기록: …'이 대신한다(규격 6-D)
    if (it.unknown) return base + '입찰 예정일 미상';
    return base + '<span class="d">' + esc(it.date) + '</span> ' + esc(it.label);
  }
  // 금고 기관 행 — <ul> 안의 <button>. 누르면 상세 팝업이 열린다(선택형 listbox가 아니다).
  // o = { verified, nextList, prepActive }
  kbb.rowHtml = function (it, o) {
    o = o || {};
    const slot = kbb.slotText(it.rec, o.verified, o.nextList), leaves = kbb.leavesText(it.rec, o.verified);
    const news = kbb.newsLine(dash.kbEntry(it.rec, o.verified) || dash.kbEntry(it.rec, o.nextList));
    return '<li><button type="button" class="hb-row" data-key="' + esc(it.key) + (it.overdue && dash.recView(it).view === 'done' ? '" data-rec="done' : '') + '" aria-haspopup="dialog">' +
      '<span class="nm">' + esc(it.name) + (slot ? '<span class="hb-slot">' + esc(slot) + '</span>' : '') +
      (leaves ? '<span class="hb-slot hb-leaves">' + esc(leaves) + '</span>' : '') + '</span>' + statusChip(it) +
      '<span class="meta">' + metaHtml(it) + (o.prepActive ? ' <span class="wf-badge pp-neutral">사전준비 중</span>' : '') + '</span>' +
      (news ? '<span class="news" title="' + esc(news) + '">' + esc(news) + '</span>' : '') + '</button></li>';
  };

  // ── 순수: 알림 줄 ─────────────────────────────────────────────────
  // allNotice = 전국 공고 진행 중 항목(dash.model.notice), oursNotice = 그중 국민은행이 맡은 기관(마감 전 → 미확인 → 결과 확인 순서 그대로).
  kbb.alertModel = function (allNotice, oursNotice) {
    const o = oursNotice || [];
    return { n: (allNotice || []).length, m: o.length, hot: o.some(function (it) { return it.phase === 'receiving'; }),
      chips: o.slice(0, 3), more: Math.max(0, o.length - 3) };
  };
  function chipBtn(it) {
    const when = it.phase === 'receiving' && typeof it.deadlineDays === 'number' ? '마감 ' + dText(it.deadlineDays) : '공고 후 ' + it.since + '일';
    return '<button type="button" class="hb-chip" data-key="' + esc(it.key) + '" aria-label="' + esc(it.name + ', ' + when + ', 입찰 공고 현황에서 보기') + '">' +
      esc(it.name) + ' ' + dash.noticeChipHtml(it) + '</button>';
  }
  kbb.alertHtml = function (a) {
    const btn = '<button type="button" class="db-next" id="hb-to-notice">입찰 공고 현황에서 보기</button>';
    if (a.m > 0) {
      return '<span class="msg">공고가 난 국민은행이 맡은 기관 <b>' + a.m + '</b>곳</span><span class="chips">' + a.chips.map(chipBtn).join('') + '</span>' +
        (a.more ? '<span class="msg">외 <b>' + a.more + '</b>곳</span>' : '') + btn;
    }
    if (a.n > 0) return '<span class="msg">지금 공고 진행 중 <b>' + a.n + '</b>곳 · 그중 국민은행이 맡은 기관은 없습니다.</span>' + btn;
    return '<span class="msg">지금 공고 진행 중인 기관이 없습니다.</span>' + btn;
  };

  // ── 순수: 준비 중인 제안 ──────────────────────────────────────────
  // 같은 기관은 한 번만, 더 나아간 단계 쪽. overview에만 있는 미완료·실행 중 기관은 '제안서 작성'으로 더한다.
  // dash.stageCounts와 같은 집합이어야 한다(P2-1: 목록 합계 = 제안 진행 단계 합계) — 규칙을 바꾸면 두 곳을 같이 바꾼다.
  function idOf(x) { return String(x && (x.institution_id || x.institutionId || x.id) || ''); }
  kbb.prepEntries = function (preps, overview) {
    const best = {}, out = [];
    if (Array.isArray(preps)) {
      dash.activePreps(preps).forEach(function (p) {
        const id = idOf(p); if (!id) return;
        const s = dash.stageOf(p.state_cd || p.stateCd);
        if (!best[id] || s > best[id].stage) best[id] = { id: id, stage: s, row: p, ov: null };
      });
      Object.keys(best).forEach(function (id) { out.push(best[id]); });
    }
    const items = Array.isArray(overview) ? overview : (overview && overview.items);
    if (Array.isArray(items)) {
      const seen = {};
      items.forEach(function (it) {
        const id = idOf(it);
        if (id && !it.done && (it.state || 'NONE') !== 'NONE' && !best[id] && !seen[id]) { seen[id] = true; out.push({ id: id, stage: 4, row: null, ov: it }); }
      });
    }
    return out;
  };
  // 행 모델. 정렬 = 입찰 가까운 순(공고 진행 중이 맨 앞, 경과, 예정, 날짜 없음은 맨 뒤) → 같으면 prep.STATE_ORDER 순 → 이름.
  kbb.prepRows = function (preps, overview, list, today) {
    const Pp = P(), byInst = {};
    logic.dedupeByInstitution(list || []).forEach(function (r) { if (r.institutionId) byInst[String(r.institutionId)] = r; });
    const rows = kbb.prepEntries(preps, overview).map(function (e) {
      const rec = byInst[e.id] || null;
      const m = e.row ? Pp.listRowModel(e.row)
        : { id: '', institutionId: e.id, name: String(e.ov.institution_name || e.ov.institutionName || e.ov.name || ''), stateCd: 'WRITING',
            badge: Pp.stateBadge('WRITING', ''), done: 0, total: 0, assigneeText: '', canView: true };
      if (!m.name && rec) m.name = rec.name || '';
      let sort = Infinity, bidText = '';
      if (rec) {
        const it = dash.itemForRec(rec, today);
        if (it.notice) { sort = -1e9; bidText = '공고 진행 중'; }
        else if (it.overdue) { sort = -it.days; bidText = '입찰 예정일 ' + it.days + '일 지남'; }
        else if (!it.unknown) { sort = it.days; bidText = '입찰 예정 ' + dText(it.days); }
      }
      return Object.assign({}, m, { stageIdx: Pp.STATE_ORDER.indexOf(m.stateCd), sort: sort, bidText: bidText });
    });
    rows.sort(function (a, b) { return (a.sort - b.sort) || (a.stageIdx - b.stageIdx) || a.name.localeCompare(b.name, 'ko'); });
    return rows;
  };
  kbb.prepRowHtml = function (r) {
    const dis = !r.canView;
    const label = r.name + ', ' + r.badge.text + ', ' + (r.bidText ? r.bidText + ', ' : '') + (dis ? '열람 권한이 없습니다' : '사전준비 화면 열기');
    const parts = dis ? ['열람 권한이 없는 건입니다'] : [esc(r.assigneeText),   // 서버 원문이라 이스케이프(pips·숫자 마크업은 그대로)
      r.total ? P().pipsHtml(r.done, r.total) + ' <span class="d">' + r.done + '/' + r.total + '</span>' : '', r.bidText].filter(Boolean);
    return '<li><button type="button" class="hb-row hb-prep" data-bid="' + esc(r.id) + '" data-inst="' + esc(r.institutionId) + '"' +
      (dis ? ' aria-disabled="true"' : '') + ' aria-label="' + esc(label) + '"><span class="nm">' + esc(r.name) + '</span>' +
      '<span class="wf-badge ' + esc(r.badge.cls) + '">' + esc(r.badge.text) + '</span><span class="meta">' + parts.join(' · ') + '</span></button></li>';
  };
  // p = { state:'offline'|'loading'|'ok'|'denied'|'error', code }
  kbb.prepBodyHtml = function (p, rows) {
    if (p.state === 'offline') return '<p class="db-state">서버에 연결하면 보입니다.</p>';
    if (p.state === 'loading') return '<p class="db-state" aria-busy="true">불러오는 중입니다…</p>';
    if (p.state === 'denied') return '<p class="db-state">' + (p.code === 401 ? '로그인이 필요합니다. 다시 로그인하세요.' : '준비 중인 제안은 영업팀·영업팀장·영업부장에게 보입니다.') + '</p>';
    if (p.state === 'error') return '<p class="db-state">준비 중인 제안을 불러오지 못했습니다. <button type="button" id="hb-retry">다시 시도</button></p>';
    if (!rows.length) return '<p class="db-state">아직 제안 확정한 기관이 없습니다. 입찰 공고 현황에서 기관을 고르고 [제안 확정]을 누르면 여기에 나옵니다.<br><button type="button" id="hb-open-notice">입찰 공고 현황 열기</button></p>';
    return '<ul>' + rows.map(kbb.prepRowHtml).join('') + '</ul>';
  };

  // ── DOM ───────────────────────────────────────────────────────────
  const st = { win: dash.DEFAULT_WINDOW, preps: null, overview: null, prepSt: 'offline', ovSt: 'offline', prepCode: 0, ovCode: 0, err: '' };
  let host = null, ac = null, LIST = [], ALL = null, OURS = [], G = null, seq = 0, offNr = null;
  const U = dash.util;
  function $(id) { return host ? host.querySelector('#' + id) : null; }
  function KB() { return root.KB_VERIFIED; }
  function NX() { return root.KB_NEXT; }
  function activeIdSet() {
    const set = {};
    dash.activePreps(st.preps).forEach(function (p) { const id = idOf(p); if (id) set[id] = true; });
    return set;
  }

  // /preps·overview 결과를 화면 상태로: 단계 카드는 둘 중 하나만 받아도 그리고, 준비 중 목록은 /preps가 와야 그린다.
  function progressState() {
    if (!U.serverMode() || !U.hasEmp()) return { state: 'offline' };
    if (st.prepSt === 'loading' || st.ovSt === 'loading') return { state: 'loading' };
    const okP = st.prepSt === 'ok', okO = st.ovSt === 'ok';
    if (okP || okO) return { state: 'ok', stages: dash.stageCounts(okP ? st.preps : null, okO ? st.overview : null) };
    const code = st.ovCode || st.prepCode;
    if (code === 401 || code === 403) return { state: 'denied', code: code };
    return { state: 'error' };
  }
  function panelState() {
    const base = progressState();
    if (base.state !== 'ok' || st.prepSt === 'ok') return base;
    return { state: (st.prepCode === 401 || st.prepCode === 403) ? 'denied' : 'error', code: st.prepCode };
  }

  function renderBanner() {
    const el = $('hb-err');
    if (!el) return;
    let t = st.err;
    if (!t && !U.serverMode()) {
      t = (root.location && root.location.protocol === 'file:')
        ? '서버에 연결되지 않은 파일 모드입니다. 내장 자료만 보여 주며 진행 건수와 [제안 확정]은 쓸 수 없습니다.'
        : '서버의 기관 정보를 불러오지 못해 내장 자료만 보여 줍니다. 제안 진행 표시와 [제안 확정]은 쓸 수 없습니다. <button type="button" id="hb-reload">다시 불러오기</button>';
    }
    el.innerHTML = t && st.err ? esc(st.err) : t;
    el.setAttribute('role', st.err || (root.location && root.location.protocol !== 'file:') ? 'alert' : 'status');
    el.style.display = el.innerHTML ? '' : 'none';
  }

  function renderAlert() {
    const el = $('hb-alert');
    if (!el || !ALL || !G) return;
    const mine = {};
    G.m.notice.forEach(function (it) { mine[it.key] = true; });
    const a = kbb.alertModel(ALL.notice, ALL.notice.filter(function (it) { return mine[it.key]; }));
    el.className = 'pnl hb-alert' + (a.hot ? ' hot' : '');
    el.innerHTML = kbb.alertHtml(a);
  }

  function renderOurs() {
    const sc = $('hb-oscroll');
    if (!sc) return;
    // 포커스가 목록 안의 행에 있었으면 다시 그린 뒤 같은 기관 행으로 되돌린다(상세 팝업을 닫고 집계를 다시 받을 때 body로 떨어지지 않게).
    const ae = typeof document !== 'undefined' ? document.activeElement : null;
    const keepKey = ae && ae.getAttribute && sc.contains(ae) ? (ae.getAttribute('data-key') || '') : '';
    G = kbb.groups(OURS, U.todayDate(), st.win, KB(), NX());
    const act = activeIdSet();
    const ul = function (items, lab) {
      return '<ul aria-labelledby="' + lab + '">' + items.map(function (it) {
        return kbb.rowHtml(it, { verified: KB(), nextList: NX(), prepActive: !!(it.rec.institutionId && act[String(it.rec.institutionId)]) });
      }).join('') + '</ul>';
    };
    let h = '';
    if (G.first.length) h += '<div class="db-grp" id="hb-g1" aria-live="polite">' + kbb.firstLabel(G.k, G.first.length) + '</div>' + ul(G.first, 'hb-g1');
    else h += '<p class="db-state" id="hb-g1" aria-live="polite">' + esc(kbb.firstEmpty(G.k)) + '</p>';
    if (G.rest.length) h += '<div class="db-grp" id="hb-g2">' + kbb.restLabel(G.rest.length) + '</div>' + ul(G.rest, 'hb-g2');
    if (G.next.length) h += '<div class="db-grp" id="hb-g3">' + kbb.nextLabel(G.next.length) + '</div>' + ul(G.next, 'hb-g3');
    sc.innerHTML = h;
    if (keepKey) {
      const rows = sc.querySelectorAll('.hb-row');
      for (let i = 0; i < rows.length; i += 1) { if (rows[i].getAttribute('data-key') === keepKey) { rows[i].focus(); break; } }
    }
    const sum = $('hb-osum');
    if (sum) sum.innerHTML = kbb.summaryHtml(kbb.summary(OURS, KB(), NX()));
    const foot = $('hb-ofoot');
    if (foot) foot.innerHTML = kbb.footHtml(dash.OURS_SCOPE, kbb.bankUnknownN(LIST));
    const box = $('hb-ours');
    if (box) box.setAttribute('aria-busy', 'false');
  }

  function renderPreps() {
    const body = $('hb-pscroll');
    if (!body) return;
    const ps = panelState();
    const rows = ps.state === 'ok' ? kbb.prepRows(st.preps, st.overview, LIST, U.todayDate()) : [];
    body.innerHTML = kbb.prepBodyHtml(ps, rows);
    const sum = $('hb-psum');
    if (sum) sum.innerHTML = ps.state === 'ok' ? '합계 <b>' + rows.length + '</b>건' : '';
    const b = $('hb-to-prep');
    if (b) b.hidden = ps.state !== 'ok';
    const box = $('hb-preps');
    if (box) box.setAttribute('aria-busy', ps.state === 'loading' ? 'true' : 'false');
  }

  function renderCards() {
    const el = $('hb-cards');
    if (el) el.innerHTML = dash.kbCardHtml(dash.kbCount(LIST, KB())) + dash.stageCardHtml(progressState());
  }

  function renderAll() {
    const asof = $('hb-asof');
    if (asof) asof.textContent = logic.localDateStr(U.todayDate());
    renderBanner(); renderOurs(); renderAlert(); renderPreps(); renderCards();
  }

  function refreshData() {
    LIST = U.dataList();
    ALL = dash.model(LIST, U.todayDate());
    OURS = kbb.ours(LIST, KB(), undefined, NX());
    renderAll();
  }

  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) return { status: r.status === 401 || r.status === 403 ? 'denied' : 'error', code: r.status };
      return r.json().then(function (d) { return { status: 'ok', data: d }; });
    }).catch(function () { return { status: 'error', code: 0 }; });
  }
  function loadProgress() {
    if (!U.serverMode() || !U.hasEmp()) { st.prepSt = st.ovSt = 'offline'; st.preps = st.overview = null; renderPreps(); renderCards(); renderOurs(); return Promise.resolve(); }
    const my = ++seq;
    st.prepSt = st.ovSt = 'loading';
    renderPreps(); renderCards();
    return Promise.all([fetchJson('/preps'), fetchJson('/workflow/overview')]).then(function (res) {
      if (my !== seq || !host) return;
      const p = res[0], o = res[1];
      st.prepSt = p.status; st.prepCode = p.code || 0; st.preps = p.status === 'ok' ? (Array.isArray(p.data) ? p.data : (p.data && p.data.items) || []) : null;
      st.ovSt = o.status; st.ovCode = o.code || 0; st.overview = o.status === 'ok' ? o.data : null;
      renderPreps(); renderCards(); renderOurs();
    });
  }

  function flash(msg) { const f = $('hb-flash'); if (f) f.textContent = msg || ''; }

  function goNotice(key) {
    const A = root.app, N = root.nav;
    if (!A || !A.openNavItem || !N) return false;
    const ok = A.openNavItem(N.NOTICE_ID);
    if (ok && key && dash.selectKey) dash.selectKey(key);
    return ok;
  }
  // 입찰 공고 현황으로 간다. 못 열면(둘러보기·파일 모드·탭이 가득 참 등) 안내를 띄운다.
  function openNotice(key) {
    if (goNotice(key)) { flash(''); return true; }
    flash('입찰 공고 현황을 열 수 없습니다. 왼쪽 메뉴의 [입찰 공고 현황]에서 여세요.');
    return false;
  }
  function goPrep(bid) {
    const Pp = root.prep, A = root.app;
    if (!Pp || !A || !A.openNavItem || !Pp.SOON_ID) return false;
    const ok = A.openNavItem(Pp.SOON_ID);
    if (ok && bid && Pp.openCase) Pp.openCase(bid);
    return ok;
  }
  function openOurs(btn) {
    const key = btn.getAttribute('data-key');
    const it = G && G.first.concat(G.rest, G.next).filter(function (x) { return x.key === key; })[0];
    if (it) dash.openDetail(it.rec, { opener: btn, screen: 'bid_board', fallback: '#hb-ours' });
  }

  function onClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    const btn = t.closest('button');
    if (!btn || !host.contains(btn)) return;
    if (btn.classList.contains('hb-prep')) {
      if (btn.getAttribute('aria-disabled') === 'true') { flash('열람 권한이 없는 건입니다.'); return; }
      flash('');
      if (!goPrep(btn.getAttribute('data-bid'))) flash('사전준비 화면을 열지 못했습니다. 메뉴의 [제안서 사전준비 프로세스]에서 여세요.');
      return;
    }
    if (btn.classList.contains('hb-row')) { openOurs(btn); return; }
    if (btn.classList.contains('hb-chip')) { openNotice(btn.getAttribute('data-key')); return; }
    switch (btn.id) {
      case 'hb-to-notice': case 'hb-open-notice': openNotice(''); break;
      case 'hb-to-prep': if (!goPrep('')) flash('사전준비 화면을 열지 못했습니다. 메뉴의 [제안서 사전준비 프로세스]에서 여세요.'); break;
      case 'hb-retry': case 'db-retry': loadProgress(); break;   // db-retry = 단계 카드(dash.stageCardHtml)의 다시 시도
      case 'hb-reload':
        if (root.app && root.app.bootstrapServer) root.app.bootstrapServer().then(function () { refreshData(); loadProgress(); });
        break;
      default: break;
    }
  }

  function setWindow(k, save) {
    st.win = dash.windowKey(k);
    if (save && root.store && root.store.saveHbWindow) root.store.saveHbWindow(st.win);
    const per = $('hb-per');
    if (per) per.querySelectorAll('input').forEach(function (r) { r.checked = r.value === st.win; });
    if (ALL) renderOurs();
  }

  const SKELETON =
    '<section id="hb-root" aria-label="입찰 현황판">' +
    '<div class="hb-top"><h2>입찰 현황판</h2><span class="sub">국민은행이 맡은 기관과 제안 진행</span><span class="meta">기준일 <b id="hb-asof"></b></span></div>' +
    '<div id="hb-flash" class="db-flash" role="status"></div><div id="hb-err" class="db-state db-banner" role="alert" style="display:none"></div>' +
    '<section class="pnl hb-alert" id="hb-alert" aria-label="공고가 난 국민은행이 맡은 기관"></section>' +
    '<div class="hb-grid">' +
    '<section class="pnl hb-list" id="hb-ours" tabindex="-1" aria-labelledby="hb-ot" aria-busy="true"><div class="db-list-head"><div class="db-h"><h2 id="hb-ot">국민은행이 맡은 기관</h2><span class="sum" id="hb-osum"></span></div>' +
    '<fieldset class="db-per" id="hb-per"></fieldset></div><div class="db-scroll" id="hb-oscroll"><p class="db-state" aria-busy="true">불러오는 중입니다…</p></div><div class="db-foot" id="hb-ofoot"></div></section>' +
    '<section class="pnl hb-list" id="hb-preps" aria-labelledby="hb-pt" aria-busy="true"><div class="db-list-head"><div class="db-h"><h2 id="hb-pt">준비 중인 제안</h2><span class="sum" id="hb-psum"></span>' +
    '<button type="button" id="hb-to-prep" hidden>사전준비 화면 열기</button></div></div><div class="db-scroll" id="hb-pscroll"><p class="db-state" aria-busy="true">불러오는 중입니다…</p></div></section>' +
    '<div class="hb-cards" id="hb-cards"></div></div></section>';

  kbb.mount = function (el) {
    if (!el) return;
    if (host) kbb.unmount();
    host = el;
    ac = typeof AbortController === 'function' ? new AbortController() : null;
    const opt = ac ? { signal: ac.signal } : undefined;
    host.innerHTML = SKELETON;
    host.addEventListener('click', onClick, opt);
    host.addEventListener('change', function (e) { if (e.target.name === 'hb-per') setWindow(e.target.value, true); }, opt);
    st.err = '';
    st.win = dash.windowKey(root.store && root.store.loadHbWindow ? root.store.loadHbWindow() : dash.DEFAULT_WINDOW);
    const per = $('hb-per');
    if (per) per.innerHTML = dash.periodHtml(st.win, 'hb-per', '국민은행이 맡은 기관 입찰 기간');
    refreshData();
    loadProgress();
    const nrm = root.noticerec;   // 현황판이 기록 변화에 맞춰 다시 그려지게 구독한다
    if (nrm && nrm.onChange) offNr = nrm.onChange(function () { if (host && ALL) renderOurs(); });
    if (nrm && nrm.ensure) nrm.ensure();
  };
  kbb.refresh = function () { if (host && ALL) refreshData(); };       // 기관 편집 저장 뒤 서버 목록이 바뀌면
  kbb.reload = function () { if (host) loadProgress(); };              // 상세 팝업에서 [제안 확정] 뒤
  kbb.onProfileChange = function () {                                  // 계정이 바뀌면 앞 사용자의 준비 중 제안을 버린다
    seq += 1;
    st.preps = st.overview = null; st.prepSt = st.ovSt = 'offline';
    if (host && ALL) { renderAll(); loadProgress(); }
  };
  kbb.unmount = function () {
    seq += 1;
    if (offNr) { offNr(); offNr = null; }
    if (ac) ac.abort();
    ac = null;
    if (host) host.innerHTML = '';
    host = null; ALL = null; G = null;
  };

  if (isNode) module.exports = kbb;
  else root.kbboard = kbb;
})(typeof self !== 'undefined' ? self : this);
