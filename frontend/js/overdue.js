(function (root) {
  'use strict';
  // 공고 예정일 경과(NEXT 30 추가 요건, 1단계 — 화면만, 서버 변경 없음).
  //   ① 전국 지도 화면의 접는 경과 패널(보기 전용)  ② 로그인 직후 요약 팝업(영업 계열만)
  //   ③ 사이드바 '전국 지도' 옆 미처리 건수 배지
  // 판정·묶음·정렬 규칙은 logic.js(overdueSummary 등)가 갖고, 이 파일은 그 결과를 HTML과 DOM에 옮긴다.
  // 2단계(공고 상태 기록): 미처리·지연·처리됨 판정은 logic.recordView(noticerec.snap) 한 곳. 서버 미연결이면 모든 경과 건이 미처리다.
  const logic = (typeof require === 'function' && typeof module !== 'undefined') ? require('./logic.js') : root.logic;
  const store = (typeof require === 'function' && typeof module !== 'undefined') ? require('./store.js') : root.store;
  const nav = (typeof require === 'function' && typeof module !== 'undefined') ? require('./nav.js') : root.nav;
  const esc = logic.esc;
  const nrMod = (typeof require === 'function' && typeof module !== 'undefined') ? require('./noticerec.js') : null;
  function NR() { return nrMod || root.noticerec || null; }

  const ov = {};
  ov.state = {
    summary: null,        // logic.overdueSummary 결과(마지막 refresh)
    parts: null,          // logic.splitOverdue(summary.items, snap) — { pending, delayed, done }
    view: 'pending',      // 'pending' | 'delayed' | 'done' | 'all'
    mode: null,           // 'dock' | 'drawer' | 'stack'
    open: false,
    opened: null,         // 펼쳐 둔 묶음(data-group) 집합 — 다시 그려도 유지. null이면 기본값
    wired: false,
    pop: null,            // 팝업이 열려 있는 동안 {who, date, dest} — 열기·닫기·Esc·포커스는 dlg.js. dest: 'notice'(입찰 공고 현황) | 'map'(지도 경과 패널)
  };

  // 같은 파일이 브라우저(전역)와 node(테스트) 양쪽에서 돌도록 render는 늦게 찾는다.
  function R() {
    if (root.render) return root.render;
    return (typeof require === 'function' && typeof module !== 'undefined') ? require('./render.js') : null;
  }
  function nameOf(code) { const r = R(); return (r && r.REGION_NAME && r.REGION_NAME[code]) || code; }
  function icon(k) { const r = R(); return (r && r.ICONS && r.ICONS[k]) || ''; }
  function $(id) { return typeof document === 'undefined' ? null : document.getElementById(id); }

  // ── HTML 조각(순수) ─────────────────────────────────────────────────────────

  // 확정 공고가 공고 후 120일을 넘긴 건(noticeExpired)은 '예정일 경과'가 아니라 '공고 후 n일'이다 — 공고는 났고 결과만 모른다.
  ov.NOTICE_EXPIRED_NOTE = function (it) { return logic.NOTICE_WORDS.expiredNote(it.days); };
  ov.stampHtml = function (it, rv) {
    const v = rv ? rv.view : 'pending';
    return '<span class="ov-stamp' + (v === 'delayed' ? ' is-line' : v === 'done' ? ' is-plain' : '') + '">' + icon('overdue') + '<span aria-hidden="true">D+' + it.days + '</span>' +
      '<span class="sr-only">' + (it.noticeExpired ? '공고 후 ' + it.days + '일 지남' : '예정일 ' + it.days + '일 지남') + '</span></span>';
  };

  // 날짜 근거 표식. 공고일 이름표 7곳(kind 'check')은 확정·추정 표식 대신 이름표 '공고일'과 보조 문구 한 줄을 보인다(데이터 검수 11-23).
  ov.confHtml = function (it) {
    if (it.kind === 'check') {
      return '<span class="ov-conf is-notice">공고일</span><span class="dt-note">' + esc(logic.checkDateNote(it.rec)) + '</span>';
    }
    if (it.kind === 'est') {
      const rec = it.rec || {};
      const t = (!rec.contractEnd && rec.lastBid && rec.term)
        ? '지난 금고 선정일 ' + rec.lastBid + ' + ' + rec.term + '년으로 계산한 날짜'
        : '공고 원문으로 확정되지 않은 예상일입니다';
      return '<span class="ov-conf is-est" title="' + esc(t) + '">추정</span>';
    }
    return '<span class="ov-conf is-fixed">확정</span>';
  };

  // slot: 패널 행은 상태 칸(1단계에서는 비어 있음)이 있고, 팝업 행은 없다.
  // view가 'all'이면 상태 칸에 '미처리'를 적는다(규격 6-1: 전체 탭에서만).
  ov.STATUS_TEXT = { pending: '미처리', delayed: '지연·재공고 대기', done: '처리됨' };
  ov.itemHtml = function (it, slot, view, rv) {
    const v = rv ? rv.view : 'pending', bt = logic.recordBriefText(rv);
    return '<li class="ov-item" data-state="' + v + '" data-id="' + esc(logic.instKey(it.rec)) + '">' +
      ov.stampHtml(it, rv) + '<span class="ov-name" title="' + esc(it.name) + '">' + esc(it.name) + '</span>' +
      (slot ? (view === 'all' ? '<span class="ov-status">' + esc(ov.STATUS_TEXT[v]) + '</span>' : '<span></span>') : '') +
      '<span class="ov-meta"><span class="ov-where">' + esc(nameOf(it.region)) + '</span>' +
      '<span class="ov-date">' + esc(it.date) + '</span>' + ov.confHtml(it) + (bt ? '<span class="ov-note">' + esc(bt) + '</span>' : '') +
      (it.noticeExpired ? '<span class="ov-note">' + esc(ov.NOTICE_EXPIRED_NOTE(it)) + '</span>' : '') + '</span></li>';
  };

  function groupHtml(code, title, items, open, isWatch, view, c) {
    const star = isWatch ? icon('starFill').replace('<svg class="gph"', '<svg class="gph ov-star" aria-hidden="true"') : '';
    return '<details class="ov-grp" data-group="' + esc(code) + '"' + (open ? ' open' : '') + '><summary>' + star +
      esc(title) + '<span class="ov-grp-n">' + items.length + '</span></summary><ul class="ov-items">' +
      items.map(function (it) { return ov.itemHtml(it, true, view, logic.recordView(it.rec, c && c.snap, c && c.today)); }).join('') + '</ul></details>';
  }

  ov.HINT_WATCH = '관심 지역이 없어 모든 시·도를 접어 두었습니다. 전국 지역별 화면에서 지역 카드의 별을 누르면 그 지역이 맨 위에 펼쳐집니다.';

  // ctx = { watched: [지역코드], opened: Set|null, snap, today }. snap이 없으면 모든 경과 건이 미처리다.
  ov.listHtml = function (summary, view, ctx) {
    const c = ctx || {};
    if (!summary) return '<p class="ov-empty">기관 목록을 불러오는 중입니다.</p>';
    const sp = logic.splitOverdue(summary.items, c.snap, c.today);
    const items = view === 'all' ? summary.items : (sp[view] || sp.pending);
    if (!items.length) {
      const msg = view === 'delayed' ? '지연·재공고 대기로 기록된 건이 없습니다.'
        : view === 'done' ? '공고 진행 중·공고 종료·입찰 없음으로 기록된 건이 없습니다.'
        : view === 'all' ? '공고 예정일이 지난 건이 없습니다.' : '공고 예정일이 지난 미처리 건이 없습니다.';
      return '<div class="ov-empty"><p>' + msg + '</p></div>';
    }
    const watched = c.watched || [];
    const g = logic.groupOverdue(items, watched, nameOf);
    let html = '';
    if (!watched.length) html += '<p class="ov-hint" id="ov-hint-watch">' + ov.HINT_WATCH + '</p>';
    if (g.watch.length) html += groupHtml('watch', '관심 지역', g.watch, c.opened ? c.opened.has('watch') : true, true, view, c);
    g.bySido.forEach(function (s) {
      html += groupHtml(s.code, s.name, s.items, c.opened ? c.opened.has(s.code) : false, false, view, c);
    });
    return html;
  };

  ov.HINT_POP = '관심 지역이 없어 최근에 지난 순으로 골랐습니다. 전국 지역별 화면에서 지역 카드의 별을 누르면 그 지역 건이 먼저 나옵니다. 관심 지역은 PC마다 따로 저장됩니다.';

  // 팝업에 채울 값 전부(순수). 상위 5건: 관심 지역 먼저, 최근에 지난 순, 확인 중은 뒤.
  // dest: 'notice'면 안내 줄의 목적지가 입찰 공고 현황의 [공고 예정일 경과] 탭, 아니면 지도 경과 패널(design-reviewer 11-16 6-B).
  ov.popupParts = function (summary, watched, dateStr, dest, rc) {
    const items = (summary && summary.items) || [];
    const w = watched || [];
    const top = logic.pickTopOverdue(items, w, 5);
    return {
      n: items.length,
      nText: items.length + '건',
      sum: items.length && items.every(function (it) { return it.noticeExpired; })
        ? '공고가 난 지 120일이 넘었는데 결과가 아직 기록되지 않은 건입니다. 기준일 ' + dateStr + '.'
        : '예정일이 지났는데 공고 진행 여부가 아직 기록되지 않은 건입니다. 기준일 ' + dateStr + '.',
      sidoHtml: logic.countBySido(items, nameOf).map(function (s) {
        return '<li>' + esc(s.name) + '<b>' + s.n + '</b></li>';
      }).join(''),
      cap: '먼저 볼 ' + top.length + '건 (관심 지역 먼저, 최근에 지난 순)',
      listHtml: top.map(function (it) { return ov.itemHtml(it, false, undefined, rc ? logic.recordView(it.rec, rc.snap, rc.today) : undefined); }).join(''),
      more: items.length > 5 ? '외 ' + (items.length - 5) + '건은 '
        + (dest === 'notice' ? '입찰 공고 현황의 [공고 예정일 경과]에서' : '경과 패널에서') + ' 볼 수 있습니다.' : '',
      hint: w.length ? '' : ov.HINT_POP,
    };
  };

  // 팝업 대상 판정 입력을 한곳에서 만든다(팀 게이트 + 오늘 그만 보기 키).
  ov.shouldShow = function (ctx, who, dateStr, count) {
    return logic.shouldShowOverduePopup({
      sales: nav.isSales(ctx), count: count, skipped: store.isOverdueSkipped(who, dateStr) });
  };

  // ── 배치 규칙(순수) ─────────────────────────────────────────────────────────
  // 1366 이상 도킹(지도 옆 360px) / 881~1365 덮개 서랍 / 880 이하 지도 위 쌓기.
  // 드릴인(랭킹 패널이 보임) 중에는 도킹하지 않고 덮개 서랍으로 연다(3열이 되지 않게).
  ov.modeFor = function (width, drilled) {
    if (width <= 880) return 'stack';
    return (width < 1366 || drilled) ? 'drawer' : 'dock';
  };
  // 기본 열림: 도킹은 펼침(사용자가 접었으면 그 선택), 나머지는 접힘.
  // 창 폭이 바뀌었고 드릴인이 아니면 전국 지도를 다시 그린다(같은 배치 안의 폭 변화 포함).
  // 드릴인이면 지역 지도·랭킹 패널을 건드리지 않는다. lastW가 없으면(첫 호출) 그리지 않는다.
  ov.shouldRedraw = function (lastW, width, drilled) {
    if (drilled || !lastW) return false;
    return lastW !== width;
  };
  ov.defaultOpen = function (mode, saved) {
    if (mode === 'dock') return saved === null || saved === undefined ? true : !!saved;
    return false;
  };

  // ── 현재 데이터 ─────────────────────────────────────────────────────────────
  ov.current = function () {
    const r = R();
    if (!r || !r.allInstitutions) return null;
    // 미처리 수는 한 곳: 입찰 공고 현황 경과 탭(dashboard dataList 전체·실시간 오늘)과 같은 대상·같은 기준일로 센다(사용자 팀 결정 11-17).
    return logic.overdueSummary(r.allInstitutions(), ov.today());
  };
  ov.today = function () { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  function todayStr() { return logic.localDateStr(ov.today()); }
  ov.snap = function () { const n = NR(); return n && n.snap ? n.snap() : null; };
  // 첫 기록 목록을 받는 동안(서버 연결됨·아직 안 받음)에는 배지를 그리지 않는다 — 전부 미처리로 부풀려 보였다 줄지 않게.
  ov.waiting = function () { const n = NR(), s = n && n.state ? n.state() : 'offline'; return s === 'idle' || s === 'loading'; };
  // 미처리 = 경과 && (기록 없음 || 지연인데 다음 확인일 ≤ 오늘). parts가 아직 없으면(refresh 전) 경과 전체로 센다.
  ov.count = function () {
    if (ov.state.parts) return ov.state.parts.pending.length;
    return ov.state.summary ? ov.state.summary.items.length : 0;
  };
  ov.pendingSummary = function () {
    return ov.state.parts && ov.state.summary ? Object.assign({}, ov.state.summary, { items: ov.state.parts.pending }) : ov.state.summary;
  };
  function watched() { try { return store.loadWatch() || []; } catch (e) { return []; } }

  // ── DOM 그리기 ──────────────────────────────────────────────────────────────
  function paintToggle() {
    const tg = $('ov-toggle'); if (!tg) return;
    const n = ov.count();
    tg.innerHTML = icon('overdue') + '공고 예정일 경과' + (n > 0 && !ov.waiting() ? '<span class="ov-stamp">미처리 ' + n + '</span>' : '');
  }

  function paintPanel() {
    const list = $('ov-list'); if (!list) return;
    const s = ov.state.summary;
    const n = ov.count();
    const cnt = $('ov-count');
    if (cnt) { cnt.textContent = n > 0 && !ov.waiting() ? '미처리 ' + n : ''; cnt.hidden = !(n > 0 && !ov.waiting()); }
    const sub = $('ov-sub');
    if (sub) sub.innerHTML = '기준일 <b>' + esc(todayStr()) + '</b>, 최근에 지난 순';
    const pt = ov.state.parts || { pending: [], delayed: [], done: [] };
    const nums = { pending: pt.pending.length, delayed: pt.delayed.length, done: pt.done.length, all: s ? s.items.length : 0 };
    Array.prototype.forEach.call(document.querySelectorAll('#ov-tabs .ov-tab'), function (t) {
      const sp = t.querySelector('.ov-tab-n'); if (sp) sp.textContent = String(nums[t.dataset.view]);
    });
    // 다시 그리기 전에 사용자가 펼쳐 둔 묶음을 기억한다(목록이 없던 첫 그림은 기본값 사용).
    const groups = list.querySelectorAll('details.ov-grp');
    if (groups.length) {
      ov.state.opened = new Set(Array.prototype.map.call(list.querySelectorAll('details.ov-grp[open]'),
        function (d) { return d.dataset.group; }));
    }
    list.innerHTML = ov.listHtml(s, ov.state.view, { watched: watched(), opened: ov.state.opened, snap: ov.snap(), today: todayStr() });
    const unk = $('ov-unknown');
    if (unk) {
      const u = s ? s.unknown : 0;
      unk.hidden = !(u > 0);
      unk.innerHTML = '날짜 미상 <b>' + u + '</b>건은 예정일을 몰라 이 목록에서 뺐습니다.';
    }
  }

  // 사이드바 '전국 지도' 항목 옆 배지. 0이면 렌더하지 않는다. 숫자는 aria-hidden, 문장은 .sr-only.
  ov.paintNavBadge = function () {
    if (typeof document === 'undefined') return;
    const items = Array.prototype.slice.call(document.querySelectorAll('#side-nav .nav-item'));
    const byId = function (id) { return items.filter(function (b) { return b.dataset && b.dataset.nav === id; })[0] || null; };
    const nid = root.nav && root.nav.NOTICE_ID;
    const btn = (nid && byId(nid)) || byId('map'); if (!btn) return;   // 배지는 '입찰 공고 현황' 옆(규격 P2-1), 그 항목이 없으면 예전처럼 '전국 지도'
    items.forEach(function (b) {   // 예전 자리('전국 지도')나 옮기기 전 배지를 모두 지운다
      if (root.nav && b.dataset && b.dataset.nav === root.nav.COLLECT_ID) return;   // 수집 요청 대기 배지(plancollect.js)는 따로 칠한다 — 지우지 않는다
      Array.prototype.forEach.call(b.querySelectorAll('.nav-count, .ov-nav-sr'), function (x) { x.remove(); });
      const lb = b.querySelector('.nav-label'); if (lb) b.title = lb.textContent;
    });
    const label = btn.querySelector('.nav-label');
    const n = ov.waiting() ? 0 : ov.count();
    if (n > 0) {
      const text = '공고 예정일 경과 미처리 ' + n + '건';
      btn.insertAdjacentHTML('beforeend', '<span class="nav-count" aria-hidden="true">' + n +
        '</span><span class="sr-only ov-nav-sr">, ' + text + '</span>');
      btn.title = text;
    } else if (label) {
      btn.title = label.textContent;
    }
  };

  // 데이터가 바뀔 때마다(render.drawTicker가 부른다) 판정을 다시 하고 세 곳을 함께 칠한다.
  ov.refresh = function () {
    ov.state.summary = ov.current();
    ov.state.parts = logic.splitOverdue(ov.state.summary ? ov.state.summary.items : [], ov.snap(), todayStr());
    const nrm = NR(); if (nrm && nrm.ensure) nrm.ensure();   // 처음 한 번 기록 목록을 받는다(실패하면 자동 재시도 없음)
    if (typeof document === 'undefined') return ov.state.summary;
    paintToggle();
    paintPanel();
    ov.paintNavBadge();
    return ov.state.summary;
  };

  // ── 배치·열림 ───────────────────────────────────────────────────────────────
  function isDrilled() {
    const rp = $('rank-panel');
    return !!(rp && rp.style.display && rp.style.display !== 'none');
  }
  function applyOpen() {
    const wrap = $('drill-wrap'); if (!wrap) return;
    wrap.dataset.ov = ov.state.open ? 'open' : 'closed';
    ['ov-toggle', 'ov-collapse'].forEach(function (id) {
      const b = $(id); if (b) b.setAttribute('aria-expanded', ov.state.open ? 'true' : 'false');
    });
    const cl = $('ov-collapse');
    if (cl) cl.setAttribute('aria-label', ov.state.open ? '경과 패널 접기' : '경과 패널 펼치기');
  }

  // 지도 그리기 전(render.drawNational/drawRegion)에 부른다 — 폭이 확정된 뒤에 지도를 그리려고.
  // 배치가 바뀌면 그 배치의 기본 열림 상태로 되돌린다(사용자 선택 저장은 setOpen만 한다).
  ov.syncLayout = function () {
    if (typeof document === 'undefined') return;
    const wrap = $('drill-wrap'); if (!wrap) return;
    const mode = ov.modeFor(root.innerWidth || 1440, isDrilled());
    if (mode !== ov.state.mode) {
      ov.state.mode = mode;
      ov.state.open = ov.defaultOpen(mode, store.loadOverduePanelOpen());
    }
    wrap.dataset.ovmode = mode;
    applyOpen();
  };

  // 도킹 폭이 바뀌면 옛 폭으로 그려진 전국 지도가 잘리거나 한쪽으로 쏠린다 — 다시 그린다.
  function redrawNational() {
    const r = R();
    if (!r || !r.drawNational || isDrilled() || typeof d3 === 'undefined' || root.__d3failed) return;
    r.drawNational();
    if (r.applyWatchStyles) r.applyWatchStyles();
    ov.state.drawnW = root.innerWidth;
  }

  ov.setOpen = function (open, opts) {
    const before = ov.state.open;
    ov.state.open = !!open;
    applyOpen();
    if (ov.state.mode === 'dock') {
      store.saveOverduePanelOpen(ov.state.open);
      if (before !== ov.state.open) redrawNational();
    }
    if (!open && opts && opts.focusToggle) { const t = $('ov-toggle'); if (t) t.focus(); }
  };

  function onMap() { const v = $('tab-map'); return !!(v && v.classList.contains('active')); }
  function goMap() { const b = $('tab-btn-map'); if (b && !onMap()) b.click(); }
  // 로그인 경과 팝업의 마지막 버튼 — 입찰 공고 현황 메뉴가 있으면 그 경과 탭으로, 없으면 지금처럼 지도 경과 패널로(사용자 11-16, design 6-B).
  ov.POP_ALL_MAP = '경과 패널에서 전체 보기';
  ov.POP_ALL_NOTICE = '입찰 공고 현황에서 보기';
  ov.popAllLabel = function (dest) { return dest === 'notice' ? ov.POP_ALL_NOTICE : ov.POP_ALL_MAP; };
  // 목적지 판정(열 때와 누를 때 두 번): 입찰 공고 현황 항목이 메뉴에 있고 본체가 있으면 'notice'.
  // 영업 계열 밖에는 그 메뉴가 안 보이므로 자연히 'map'으로 떨어진다.
  function popDest() {
    const A = root.app, N = root.nav, D = root.dashboard;
    return !!(A && A.findNavItem && N && N.NOTICE_ID && A.findNavItem(N.NOTICE_ID) && D && D.mount) ? 'notice' : 'map';
  }
  // 입찰 공고 현황이 지금 보이는지: 탭 활성 + 마운트 + #notice-root가 숨지 않음.
  function onNotice() {
    const v = $('tab-soon'), d = root.dashboard, el = $('notice-root');
    return !!(v && v.classList.contains('active') && el && el.style.display !== 'none' && d && d.isMounted && d.isMounted());
  }
  function goNotice() {
    const N = root.nav;
    if (!onNotice() && !(root.app && root.app.openNavItem && root.app.openNavItem(N.NOTICE_ID))) return false;   // 이미 열려 있으면 다시 마운트하지 않는다
    if (root.dashboard.showPast) root.dashboard.showPast();
    return true;
  }

  // 팝업 '전체 보기'와 토글(전국 지역별 화면에서)이 쓴다: 지도 화면으로 옮긴 뒤 패널을 연다.
  ov.openPanel = function (focusTitle) {
    goMap();
    ov.syncLayout();
    ov.setOpen(true);
    if (focusTitle) { const t = $('ov-title'); if (t) t.focus(); }
  };

  function setView(view, focus) {
    ov.state.view = view;
    Array.prototype.forEach.call(document.querySelectorAll('#ov-tabs .ov-tab'), function (t) {
      const on = t.dataset.view === view;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    const list = $('ov-list');
    if (list) list.setAttribute('aria-labelledby', 'ov-tab-' + view);
    paintPanel();
  }

  // ── 로그인 직후 팝업 ────────────────────────────────────────────────────────
  // 닫은 뒤 커서: 연 자리가 안 보이면(로그인 폼·body) 사이드바의 지금 화면 항목, 그것도 없으면 '전국 지도' 항목(dlg의 restoreFallback).
  function popFallback() {
    return document.querySelector('#side-nav .nav-item[aria-current="page"]') || document.querySelector('#side-nav .nav-item[data-nav="map"]');
  }

  ov.showPopup = function (who, dateStr) {
    const pop = $('ov-pop'); if (!pop || !root.dlg) return false;
    const dest = popDest();
    const p = ov.popupParts(ov.pendingSummary(), watched(), dateStr, dest, { snap: ov.snap(), today: todayStr() });
    const set = function (id, html) { const e = $(id); if (e) e.innerHTML = html; };
    set('ov-pop-n', esc(p.nText));
    set('ov-pop-sum', esc(p.sum));
    set('ov-pop-sido', p.sidoHtml);
    set('ov-pop-cap', esc(p.cap));
    set('ov-pop-list', p.listHtml);
    const more = $('ov-pop-more'); if (more) { more.textContent = p.more; more.hidden = !p.more; }
    const hint = $('ov-pop-hint'); if (hint) { hint.textContent = p.hint; hint.hidden = !p.hint; }
    const allBtn = $('ov-pop-all'); if (allBtn) allBtn.textContent = ov.popAllLabel(dest);
    ov.state.pop = { who: who, date: dateStr, dest: dest };
    root.dlg.open(pop, { restoreFallback: popFallback, onClose: function () { ov.state.pop = null; } });   // 공통 팝업 틀 3단계 — 첫 포커스는 제목, Esc·바깥 클릭·Tab은 dlg
    return true;
  };

  // restore=false면 포커스를 되돌리지 않는다('전체 보기'는 패널 제목으로 옮긴다).
  ov.closePopup = function (restore) {
    const pop = $('ov-pop');
    if (!pop || !ov.state.pop) return;
    ov.state.pop = null;
    if (root.dlg) root.dlg.close(pop, restore === false ? { restore: false } : undefined);
    else pop.style.display = 'none';
  };

  // 로그인 직후(app.enterApp)에 부른다. ctx는 app의 navContext(소속·마스터).
  ov.onLogin = function (ctx, who) {
    const dateStr = logic.localDateStr(new Date());   // '오늘'은 실제 현재 날짜(자정을 넘기면 다시 뜬다)
    const decide = function () {
      ov.refresh();
      if (!ov.shouldShow(ctx, who, dateStr, ov.count())) return false;
      return ov.showPopup(who, dateStr);
    };
    // 시작 때 사번(읽지 못하면 null). 받는 동안 로그아웃했거나 다른 사람이 로그인했으면 판정하지 않는다.
    const empNow = function () { try { const s = store.loadSession && store.loadSession(); return s ? String(s.emp || '') : false; } catch (e) { return null; } };
    const startEmp = empNow();
    const later = function () {
      const now = empNow();
      if (now === false) return false;                                        // 세션 없음(로그아웃)
      if (now !== null && startEmp !== null && now !== startEmp) return false; // 다른 사번으로 바뀜
      return decide();                                                        // 세션을 못 읽으면(null) 그대로 진행
    };
    const nrm = NR();
    if (!nrm || !nrm.canLoad || !nrm.canLoad()) return decide();   // 서버 미연결: 모든 경과 건이 미처리
    const p = nrm.load();                                           // 요청은 한 번만(load가 loading으로 바꾸므로 refresh 안의 ensure는 다시 받지 않는다)
    ov.refresh();
    p.then(later, later);                                           // 기록을 받은 뒤 미처리 수로 팝업을 정한다(그동안 팝업은 보류, 응답이 없어도 제한 시간 뒤 진행)
    return false;
  };

  // ── 이벤트 연결 ─────────────────────────────────────────────────────────────
  ov.wire = function () {
    if (ov.state.wired || typeof document === 'undefined') return;
    ov.state.wired = true;
    const tg = $('ov-toggle'), cl = $('ov-collapse'), panel = $('ov-panel'), tabs = $('ov-tabs');

    if (tg) tg.addEventListener('click', function () {
      if (!onMap()) { ov.openPanel(false); return; }   // 전국 지역별 등에서 누르면 지도로 옮긴 뒤 연다
      ov.setOpen(!ov.state.open);
    });
    if (cl) cl.addEventListener('click', function () { ov.setOpen(false, { focusToggle: true }); });
    // 덮개 서랍은 모달이 아니므로 가두지 않고, Esc로 접으면 토글로 돌아간다.
    [panel, tg].forEach(function (el) {
      if (el) el.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && ov.state.mode === 'drawer' && ov.state.open) {
          e.preventDefault(); ov.setOpen(false, { focusToggle: true });
        }
      });
    });
    if (tabs) {
      tabs.addEventListener('click', function (e) {
        const t = e.target.closest ? e.target.closest('.ov-tab') : null;
        if (t) setView(t.dataset.view, false);
      });
      tabs.addEventListener('keydown', function (e) {
        const order = ['pending', 'delayed', 'done', 'all'];
        const i = order.indexOf(ov.state.view);
        let next = null;
        if (e.key === 'ArrowRight') next = order[(i + 1) % order.length];
        else if (e.key === 'ArrowLeft') next = order[(i + order.length - 1) % order.length];
        else if (e.key === 'Home') next = order[0];
        else if (e.key === 'End') next = order[order.length - 1];
        if (next) { e.preventDefault(); setView(next, true); }
      });
    }

    // 팝업 버튼 3개
    const skip = $('ov-pop-skip'), close = $('ov-pop-close'), all = $('ov-pop-all');
    if (close) close.addEventListener('click', function () { ov.closePopup(true); });
    if (skip) skip.addEventListener('click', function () {
      const st = ov.state.pop;
      if (st) store.skipOverdueToday(st.who, st.date);   // 저장소가 막혀도 팝업은 닫힌다
      ov.closePopup(true);
    });
    if (all) all.addEventListener('click', function () {
      const st = ov.state.pop;
      // 열 때 판정에 더해 누르는 순간에도 목적지를 다시 본다(메뉴 권한이 바뀐 경우 — qa 11-16 P3-2).
      const toNotice = popDest() === 'notice';
      ov.closePopup(false);
      if (!toNotice) { ov.openPanel(true); return; }
      if (!goNotice()) {   // 탭이 가득 차 화면이 안 옮겨지면(안내는 app이 띄움) 포커스만 지금 화면 항목으로 돌린다
        const back = document.querySelector('#side-nav .nav-item[aria-current="page"]');
        if (back && back.focus) back.focus();
      }
    });

    // Esc·바깥 클릭·Tab 가두기는 공통 팝업 틀(dlg.js)이 맡는다(3단계, 11-23).

    // 창 폭이 바뀌면 배치를 바로 다시 정하고, 지도는 150ms 잠잠해진 뒤 한 번만 다시 그린다
    // (같은 배치 안의 폭 변화 포함. 다시 그리면 확대 상태는 초기화된다. 드릴인이면 건드리지 않는다).
    let rzTimer = null;
    window.addEventListener('resize', function () {
      ov.syncLayout();
      if (rzTimer) clearTimeout(rzTimer);
      rzTimer = setTimeout(function () {
        rzTimer = null;
        ov.syncLayout();
        if (ov.shouldRedraw(ov.state.drawnW, root.innerWidth, isDrilled())) redrawNational();
        else if (isDrilled() && ov.state.drawnW && ov.state.drawnW !== root.innerWidth) {
          // 드릴인: 시군구 지시선 카드가 판 폭에 고정 좌표로 놓이므로 폭이 바뀌면 다시 배치한다(qa 11-24 P2). 고른 기관 강조는 되살린다.
          const r = R();
          if (r && r.redrawKeepSel && typeof d3 !== 'undefined' && !root.__d3failed) { r.redrawKeepSel(); ov.state.drawnW = root.innerWidth; }
        }
      }, 150);
    });

    { const nrm = NR(); if (nrm && nrm.onChange) nrm.onChange(function () { ov.refresh(); }); }   // 기록이 바뀌면 배지·패널을 함께 다시 칠한다
    setView(ov.state.view, false);
    ov.syncLayout();
    ov.state.drawnW = root.innerWidth;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ov;
  else root.overdue = ov;
})(typeof self !== 'undefined' ? self : this);
