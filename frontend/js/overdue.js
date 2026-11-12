(function (root) {
  'use strict';
  // 공고 예정일 경과(NEXT 30 추가 요건, 1단계 — 화면만, 서버 변경 없음).
  //   ① 전국 지도 화면의 접는 경과 패널(보기 전용)  ② 로그인 직후 요약 팝업(영업 계열만)
  //   ③ 사이드바 '전국 지도' 옆 미처리 건수 배지
  // 판정·묶음·정렬 규칙은 logic.js(overdueSummary 등)가 갖고, 이 파일은 그 결과를 HTML과 DOM에 옮긴다.
  // 상태 기록(지연·처리됨)은 2단계라 지금은 모든 경과 건이 '미처리'다.
  const logic = (typeof require === 'function' && typeof module !== 'undefined') ? require('./logic.js') : root.logic;
  const store = (typeof require === 'function' && typeof module !== 'undefined') ? require('./store.js') : root.store;
  const nav = (typeof require === 'function' && typeof module !== 'undefined') ? require('./nav.js') : root.nav;
  const esc = logic.esc;

  const ov = {};
  ov.state = {
    summary: null,        // logic.overdueSummary 결과(마지막 refresh)
    view: 'pending',      // 'pending' | 'delayed' | 'done' | 'all'
    mode: null,           // 'dock' | 'drawer' | 'stack'
    open: false,
    opened: null,         // 펼쳐 둔 묶음(data-group) 집합 — 다시 그려도 유지. null이면 기본값
    wired: false,
    pop: null,            // 팝업이 열려 있는 동안 {who, date, returnTo}
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
  ov.TITLE_CHECK = '이 날짜가 공고일인지 약정 만료일인지 원문을 확인하고 있습니다';

  // 확정 공고가 공고 후 120일을 넘긴 건(noticeExpired)은 '예정일 경과'가 아니라 '공고 후 n일'이다 — 공고는 났고 결과만 모른다.
  ov.NOTICE_EXPIRED_NOTE = function (it) { return '공고 후 ' + it.days + '일 · 결과 미확인 — 결과 공고를 확인하세요'; };
  ov.stampHtml = function (it) {
    return '<span class="ov-stamp">' + icon('overdue') + '<span aria-hidden="true">D+' + it.days + '</span>' +
      '<span class="sr-only">' + (it.noticeExpired ? '공고 후 ' + it.days + '일 지남' : '예정일 ' + it.days + '일 지남') + '</span></span>';
  };

  // 날짜 근거 표식. '날짜 의미 확인 중'이면 확정·추정 표식을 대신한다.
  ov.confHtml = function (it) {
    if (it.kind === 'check') {
      return '<span class="ov-conf is-check" title="' + esc(ov.TITLE_CHECK) + '">' + icon('check') + '날짜 의미 확인 중</span>';
    }
    if (it.kind === 'est') {
      const rec = it.rec || {};
      const t = (!rec.contractEnd && rec.lastBid && rec.term)
        ? '지난 입찰일 ' + rec.lastBid + ' + ' + rec.term + '년으로 계산한 날짜'
        : '공고 원문으로 확정되지 않은 예상일입니다';
      return '<span class="ov-conf is-est" title="' + esc(t) + '">추정</span>';
    }
    return '<span class="ov-conf is-fixed">확정</span>';
  };

  // slot: 패널 행은 상태 칸(1단계에서는 비어 있음)이 있고, 팝업 행은 없다.
  // view가 'all'이면 상태 칸에 '미처리'를 적는다(규격 6-1: 전체 탭에서만).
  ov.itemHtml = function (it, slot, view) {
    return '<li class="ov-item" data-state="pending" data-id="' + esc(logic.instKey(it.rec)) + '">' +
      ov.stampHtml(it) + '<span class="ov-name" title="' + esc(it.name) + '">' + esc(it.name) + '</span>' +
      (slot ? (view === 'all' ? '<span class="ov-status">미처리</span>' : '<span></span>') : '') +
      '<span class="ov-meta"><span class="ov-where">' + esc(nameOf(it.region)) + '</span>' +
      '<span class="ov-date">' + esc(it.date) + '</span>' + ov.confHtml(it) +
      (it.noticeExpired ? '<span class="ov-note">' + esc(ov.NOTICE_EXPIRED_NOTE(it)) + '</span>' : '') + '</span></li>';
  };

  function groupHtml(code, title, items, open, isWatch, view) {
    const star = isWatch ? icon('starFill').replace('<svg class="gph"', '<svg class="gph ov-star" aria-hidden="true"') : '';
    return '<details class="ov-grp" data-group="' + esc(code) + '"' + (open ? ' open' : '') + '><summary>' + star +
      esc(title) + '<span class="ov-grp-n">' + items.length + '</span></summary><ul class="ov-items">' +
      items.map(function (it) { return ov.itemHtml(it, true, view); }).join('') + '</ul></details>';
  }

  ov.HINT_WATCH = '관심 지역이 없어 모든 시·도를 접어 두었습니다. 전국 지역별 화면에서 지역 카드의 별을 누르면 그 지역이 맨 위에 펼쳐집니다.';

  // ctx = { watched: [지역코드], opened: Set|null }. 1단계에는 지연·처리됨 기록이 없다.
  ov.listHtml = function (summary, view, ctx) {
    const c = ctx || {};
    if (!summary) return '<p class="ov-empty">기관 목록을 불러오는 중입니다.</p>';
    if (view === 'delayed' || view === 'done') {
      const msg = view === 'delayed' ? '지연·재공고 대기로 기록된 건이 없습니다.'
        : '공고 진행 중이나 공고 종료로 기록된 건이 없습니다.';
      return '<div class="ov-empty"><p>' + msg + '</p><p>상태 기록 기능은 준비중입니다.</p></div>';
    }
    if (!summary.items.length) {
      return '<div class="ov-empty"><p>' + (view === 'all' ? '공고 예정일이 지난 건이 없습니다.'
        : '공고 예정일이 지난 미처리 건이 없습니다.') + '</p></div>';
    }
    const watched = c.watched || [];
    const g = logic.groupOverdue(summary.items, watched, nameOf);
    let html = '';
    if (!watched.length) html += '<p class="ov-hint" id="ov-hint-watch">' + ov.HINT_WATCH + '</p>';
    if (g.watch.length) html += groupHtml('watch', '관심 지역', g.watch, c.opened ? c.opened.has('watch') : true, true, view);
    g.bySido.forEach(function (s) {
      html += groupHtml(s.code, s.name, s.items, c.opened ? c.opened.has(s.code) : false, false, view);
    });
    return html;
  };

  ov.HINT_POP = '관심 지역이 없어 최근에 지난 순으로 골랐습니다. 전국 지역별 화면에서 지역 카드의 별을 누르면 그 지역 건이 먼저 나옵니다. 관심 지역은 PC마다 따로 저장됩니다.';

  // 팝업에 채울 값 전부(순수). 상위 5건: 관심 지역 먼저, 최근에 지난 순, 확인 중은 뒤.
  ov.popupParts = function (summary, watched, dateStr) {
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
      listHtml: top.map(function (it) { return ov.itemHtml(it, false); }).join(''),
      more: items.length > 5 ? '외 ' + (items.length - 5) + '건은 경과 패널에서 볼 수 있습니다.' : '',
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
    const list = r.allInstitutions().filter(function (x) { return r.state.activeRegions.has(x.region); });
    return logic.overdueSummary(list, r.state.today);
  };
  ov.count = function () { return ov.state.summary ? ov.state.summary.items.length : 0; };
  function todayStr() { const r = R(); return logic.localDateStr(r ? r.state.today : new Date()); }
  function watched() { try { return store.loadWatch() || []; } catch (e) { return []; } }

  // ── DOM 그리기 ──────────────────────────────────────────────────────────────
  function paintToggle() {
    const tg = $('ov-toggle'); if (!tg) return;
    const n = ov.count();
    tg.innerHTML = icon('overdue') + '공고 예정일 경과' + (n > 0 ? '<span class="ov-stamp">미처리 ' + n + '</span>' : '');
  }

  function paintPanel() {
    const list = $('ov-list'); if (!list) return;
    const s = ov.state.summary;
    const n = ov.count();
    const cnt = $('ov-count');
    if (cnt) { cnt.textContent = n > 0 ? '미처리 ' + n : ''; cnt.hidden = !(n > 0); }
    const sub = $('ov-sub');
    if (sub) sub.innerHTML = '기준일 <b>' + esc(todayStr()) + '</b>, 최근에 지난 순';
    const nums = { pending: n, delayed: 0, done: 0, all: n };
    Array.prototype.forEach.call(document.querySelectorAll('#ov-tabs .ov-tab'), function (t) {
      const sp = t.querySelector('.ov-tab-n'); if (sp) sp.textContent = String(nums[t.dataset.view]);
    });
    // 다시 그리기 전에 사용자가 펼쳐 둔 묶음을 기억한다(목록이 없던 첫 그림은 기본값 사용).
    const groups = list.querySelectorAll('details.ov-grp');
    if (groups.length) {
      ov.state.opened = new Set(Array.prototype.map.call(list.querySelectorAll('details.ov-grp[open]'),
        function (d) { return d.dataset.group; }));
    }
    list.innerHTML = ov.listHtml(s, ov.state.view, { watched: watched(), opened: ov.state.opened });
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
    const btn = document.querySelector('#side-nav .nav-item[data-nav="map"]'); if (!btn) return;
    Array.prototype.forEach.call(btn.querySelectorAll('.nav-count, .ov-nav-sr'), function (x) { x.remove(); });
    const label = btn.querySelector('.nav-label');
    const n = ov.count();
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
  function popOpen() { return !!ov.state.pop; }

  function visible(el) {
    return !!(el && document.contains(el) && el.getClientRects().length > 0 && !el.disabled);
  }

  ov.showPopup = function (who, dateStr) {
    const pop = $('ov-pop'); if (!pop) return false;
    const p = ov.popupParts(ov.state.summary, watched(), dateStr);
    const set = function (id, html) { const e = $(id); if (e) e.innerHTML = html; };
    set('ov-pop-n', esc(p.nText));
    set('ov-pop-sum', esc(p.sum));
    set('ov-pop-sido', p.sidoHtml);
    set('ov-pop-cap', esc(p.cap));
    set('ov-pop-list', p.listHtml);
    const more = $('ov-pop-more'); if (more) { more.textContent = p.more; more.hidden = !p.more; }
    const hint = $('ov-pop-hint'); if (hint) { hint.textContent = p.hint; hint.hidden = !p.hint; }
    const ae = document.activeElement;
    ov.state.pop = { who: who, date: dateStr, returnTo: ae && ae !== document.body ? ae : null };
    pop.style.display = 'block';
    const t = $('ov-pop-title'); if (t) t.focus();
    return true;
  };

  // restore=false면 포커스를 되돌리지 않는다('전체 보기'는 패널 제목으로 옮긴다).
  ov.closePopup = function (restore) {
    const pop = $('ov-pop');
    const st = ov.state.pop;
    if (!pop || !st) return;
    pop.style.display = 'none';
    ov.state.pop = null;
    if (restore === false) return;
    // 열기 직전 포커스가 사라졌으면(로그인 폼) 사이드바 '전국 지도' 항목으로 간다.
    const back = visible(st.returnTo) ? st.returnTo : document.querySelector('#side-nav .nav-item[data-nav="map"]');
    if (back && back.focus) back.focus();
  };

  // 로그인 직후(app.enterApp)에 부른다. ctx는 app의 navContext(소속·마스터).
  ov.onLogin = function (ctx, who) {
    ov.refresh();
    const dateStr = logic.localDateStr(new Date());   // '오늘'은 실제 현재 날짜(자정을 넘기면 다시 뜬다)
    if (!ov.shouldShow(ctx, who, dateStr, ov.count())) return false;
    return ov.showPopup(who, dateStr);
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
    if (all) all.addEventListener('click', function () { ov.closePopup(false); ov.openPanel(true); });

    // Esc·배경 클릭·Tab은 이 팝업이 직접 처리한다 — app.wireModalDismiss의 전역 Esc는
    // 오버레이를 숨기기만 하고 포커스를 돌려주지 않는다. window 캡처 단계에서 가로챈다.
    window.addEventListener('keydown', function (e) {
      if (!popOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ov.closePopup(true); return; }
      if (e.key !== 'Tab') return;
      const btns = ['ov-pop-skip', 'ov-pop-close', 'ov-pop-all'].map($).filter(visible);
      if (!btns.length) return;
      const idx = btns.indexOf(document.activeElement);
      if (idx < 0) { e.preventDefault(); (e.shiftKey ? btns[btns.length - 1] : btns[0]).focus(); return; }
      if (e.shiftKey && idx === 0) { e.preventDefault(); btns[btns.length - 1].focus(); }
      else if (!e.shiftKey && idx === btns.length - 1) { e.preventDefault(); btns[0].focus(); }
    }, true);
    window.addEventListener('click', function (e) {
      if (popOpen() && e.target === $('ov-pop')) { e.stopPropagation(); ov.closePopup(true); }
    }, true);

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
      }, 150);
    });

    setView(ov.state.view, false);
    ov.syncLayout();
    ov.state.drawnW = root.innerWidth;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ov;
  else root.overdue = ov;
})(typeof self !== 'undefined' ? self : this);
