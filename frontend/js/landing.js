// 기능 소개 랜딩(#landing-view): 로그인 앞 화면. 움직임 엔진·진행 줄·멈춤 단추·로그인으로 넘기기.
// <script>는 랜딩 마크업 바로 뒤(#login-view 앞)에서 읽힌다 — 세션이 없으면 로그인 화면이 번쩍이기 전에 덮는다.
// 마크업 기본값은 hidden. 이 파일을 못 읽으면 랜딩은 나오지 않고 로그인 화면이 그대로다.
// 장면은 data-step="play" + data-on="토큰…"(누적)으로 그리고 모양은 CSS(#ld-style)가 맡는다. 마크업 기본값 = 완성 상태.
(function (root) {
  'use strict';

  var landing = {};
  var SESSION_KEY = 'tbd.session';   // js/store.js 의 SESSION_KEY 와 같아야 한다(landing.test.js 가 대조)

  // [ms, 토큰]. 토큰은 마크업의 data-hl·in·rv·out·fade·flash 값 또는 CSS [data-on~="토큰"]. 'end' = 회차 완성, hold 뒤 반복.
  var TIMELINES = {
    hero: { hold: 5000, loopFrom: 700, steps: [[700, 'ul'], [1000, 'sort'], [1800, 'foot'], [2080, 'end']] },
    today: { hold: 4000, steps: [[0, 'h1'], [400, 'v1'], [1550, 'h2'], [1950, 'v2'], [2830, 'h3'], [3230, 'v3'],
      [4080, 'h4'], [4480, 'v4'], [5300, 'end']] },
    rfp: { hold: 4000, steps: [[0, 'd1'], [400, 't1'], [900, 'd2'], [1300, 't2'], [1400, 'sc1'], [1800, 'd3'],
      [2200, 't3'], [2700, 'd4'], [3100, 't4'], [3200, 'sc2'], [3600, 'd5'], [4000, 't5'], [4400, 'sum'], [4680, 'end']] },
    check: { hold: 4000, steps: [[0, 'h1'], [300, 'h2'], [600, 'h3'], [1000, 'mark'], [1600, 'dlg'], [2800, 'focus'],
      [3100, 'press'], [3300, 'close'], [3500, 'fix'], [3900, 'end']] },
    plan: { hold: 4000, steps: [[600, 'press'], [750, 'read'], [950, 'shl'], [1400, 'i1'], [2000, 'i2'], [2600, 'i3'],
      [3000, 'done'], [3300, 'end']] },
    script: { hold: 3000, steps: [[0, 'hl'], [400, 'l1'], [700, 'l2'], [1700, 'chip'], [2000, 'end']] },
    draft: { hold: 3000, steps: [[0, 'hl'], [400, 'rv'], [1400, 'chip'], [1700, 'end']] },
    // 사람이 [녹음 글 올리기](ptr·p1·pr1·up·pend) → 발언 줄 읽음(r) → 대응 대본 문단 읽음 + 보완할 곳 등장(g) ×3
    minutes: { hold: 3000, steps: [[0, 'ptr'], [150, 'p1'], [600, 'pr1'], [800, 'up'], [1000, 'pend'], [1200, 'r1'], [1500, 'g1'],
      [1900, 'r2'], [2200, 'g2'], [2600, 'r3'], [2900, 'g3'], [3300, 'end']] },
    // 업무 흐름 4묶음: 지금 쓰는 화면을 가상 자료로 다시 그린 예시(커서·누름은 CSS [data-on~="토큰"])
    map: { hold: 4000, steps: [[200, 'paint'], [1000, 'ptr'], [1100, 'go'], [1750, 'pick'], [1900, 'r1'], [2100, 'r2'],
      [2300, 'r3'], [2500, 'r4'], [3100, 'pend'], [3300, 'end']] },
    // 수익성 분석표 → 이사회 자료. 사람이 엑셀을 올림(ptr·p1·pr1·up·pend) → 묶음마다 읽음(r) → 값이 날아감(m) → 칸에 채워짐(l) → 표 확인 대기(done)
    boardmap: { hold: 3500, steps: [[0, 'ptr'], [120, 'p1'], [800, 'pr1'], [950, 'up'], [1350, 'pend'],
      [1600, 'rA'], [2380, 'mA'], [3300, 'lA'], [3600, 'rC'], [4540, 'mC'], [5600, 'lC'],
      [5900, 'rD'], [6840, 'mD'], [7900, 'lD'], [8200, 'done'], [8500, 'end']] },
    prop: { hold: 4000, steps: [[0, 'ptr'], [200, 'p1'], [850, 'pr1'], [1050, 'rf'], [2200, 'p2'], [2850, 'pr2'], [3000, 'flt'],
      [3800, 'pend'], [4000, 'end']] },
    prep: { hold: 4000, steps: [[0, 'ptr'], [200, 'p1'], [850, 'pr1'], [1000, 'mo1'], [1400, 'p2'], [2000, 'h1'], [2100, 'pk1'],
      [2250, 'sv1'], [2700, 'p3'], [3350, 'pr2'], [3500, 'mo2'], [3900, 'p4'], [4500, 'h2'], [4600, 'pk2'], [4750, 'sv2'],
      [5300, 'pend'], [5500, 'end']] },
    perf: { hold: 4000, steps: [[0, 'bar'], [950, 'brace'], [1150, 'rate'], [1500, 'ptr'], [1600, 'p1'], [2250, 'pr1'], [2400, 'flt'],
      [3200, 'pend'], [3400, 'end']] }
  };
  // 업무 흐름 4묶음의 칸 수(정본 27칸 중 심의·이사회 5칸은 랜딩에서 뺌). 마크업과의 대조는 landing.test.js.
  var FLOW_CELLS = [3, 5, 3, 11];

  landing.SESSION_KEY = SESSION_KEY;
  landing.TIMELINES = TIMELINES;
  landing.FLOW_CELLS = FLOW_CELLS;

  // store.loadSession 과 같은 판정. store.js 보다 먼저 읽히므로 따로 둔다.
  landing.hasSession = function (storage) {
    try {
      var s = JSON.parse(storage.getItem(SESSION_KEY));
      return !!s && (s.mode === 'account' || s.mode === 'guest');
    } catch (e) { return false; }
  };
  // 주소가 소개 화면을 가리키는가(NEXT 135) — 세션이 없을 때 첫 화면을 정하는 데만 쓴다.
  // 빈 값·#/·#/intro·화면 주소가 아닌 값(#ld-ai 등)은 소개, 그 밖의 #/… 는 로그인 화면으로 바로 간다(주소로 연 사람은 소개를 다시 볼 필요가 없다).
  landing.wantsIntro = function (hash) {
    var h = String(hash || '');
    return h.charAt(0) !== '#' || h.charAt(1) !== '/' || h === '#/' || h === '#/intro';
  };
  // 써짐 시간 = 글자 수 × 30ms (400~1400)
  landing.writeMs = function (text) {
    var n = String(text).replace(/\s+/g, '').length;
    return Math.min(1400, Math.max(400, n * 30));
  };
  // 창보다 큰 묶음도 기준을 넘게: 보이는 높이 / min(요소 높이, 창 높이)
  landing.visibleRatio = function (isIntersecting, shown, boxH, viewH) {
    if (!isIntersecting) return 0;
    return Math.min(1, shown / (Math.min(boxH, viewH) || 1));
  };
  // 동시에 하나만 재생. 비율이 같으면 먼저 등록된(위쪽) 장면.
  landing.pickUnit = function (units) {
    var best = null;
    units.forEach(function (u) { if (u.ratio >= u.min && (!best || u.ratio > best.ratio)) best = u; });
    return best;
  };
  landing.fillProgress = function (center, first, last) {
    return Math.max(0, Math.min(1, (center - first) / ((last - first) || 1)));
  };
  // 지금 묶음: 기준선(line)을 품은 묶음, 없으면 가장 가까운 묶음. rects = [{top, bottom}]
  landing.currentGroup = function (rects, line) {
    var best = -1, bd = Infinity;
    rects.forEach(function (r, i) {
      var d = line < r.top ? r.top - line : (line > r.bottom ? line - r.bottom : 0);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };
  // 값이 가는 길: 출발 칸 묶음(a)·도착 칸 묶음(b)·무대(s)의 화면 사각형 → 무대 기준 출발 위치와 이동량(px)
  landing.flightVars = function (a, b, s) {
    return { fx: a.left - s.left, fy: a.top - s.top, fw: a.width, fh: a.height,
      dx: b.left - a.left, dy: b.top - a.top, tw: b.width, th: b.height };
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = landing; return; }

  var doc = root.document;
  var view = doc && doc.getElementById('landing-view');
  if (!view) return;
  root.landing = landing;

  var ATTRS = ['hl', 'in', 'rv', 'out', 'fade', 'flash'];
  var mq = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var reduced = mq.matches;
  var playing = !reduced;      // 저장하지 않는다
  var running = false;         // 랜딩이 보이는 동안만 true — 타이머·관찰자·리스너는 이 동안에만 산다
  var entered = false, enterTimer = null, raf = 0;
  var observers = [], units = [], current = null, curGroup = -1, rszObs = null;

  function byId(id) { return doc.getElementById(id); }
  function $$(sel, el) { return Array.prototype.slice.call((el || view).querySelectorAll(sel)); }

  // ── 장면 상태 ─────────────────────────────────────────────
  function snap(fig, step) {
    fig.classList.add('ld-snap');
    fig.setAttribute('data-step', step);
    fig.setAttribute('data-on', '');
    ATTRS.forEach(function (a) {
      $$('.ld-' + a + '-on', fig).forEach(function (el) { el.classList.remove('ld-' + a + '-on'); });
    });
    void fig.offsetWidth;            // 전이 없이 반영시킨 뒤
    fig.classList.remove('ld-snap');
  }
  function apply(fig, tok) {
    fig.setAttribute('data-on', ((fig.getAttribute('data-on') || '') + ' ' + tok).trim());
    ATTRS.forEach(function (a) {
      $$('[data-' + a + '~="' + tok + '"]', fig).forEach(function (el) { el.classList.add('ld-' + a + '-on'); });
    });
  }
  // 값이 나는 장면: [data-fly-from]·[data-fly-to] 선택자로 칸 위치를 재서 --fx 등을 둔다.
  // 재생을 시작할 때마다 잰다(창 크기·글꼴이 달라도 맞는다). 해당 요소가 없는 장면에서는 아무 일도 안 한다.
  function rectOf(list) {
    var a = list[0].getBoundingClientRect(), b = list[list.length - 1].getBoundingClientRect();
    return { left: a.left, top: a.top, width: b.right - a.left, height: a.height };
  }
  function measureFlights(fig) {
    var toks = $$('[data-fly-from]', fig);
    var stage = toks.length && fig.querySelector('.ld-mock-body');
    if (!stage) return;
    var s = stage.getBoundingClientRect();
    toks.forEach(function (t) {
      var from = $$(t.getAttribute('data-fly-from'), fig), to = $$(t.getAttribute('data-fly-to'), fig);
      if (!from.length || !to.length) return;
      var a = rectOf(from);
      if (!a.width) return;
      var v = landing.flightVars(a, rectOf(to), s);
      Object.keys(v).forEach(function (k) { t.style.setProperty('--' + k, v[k] + 'px'); });
    });
  }

  // ── 재생 단위 ─────────────────────────────────────────────
  function makeUnit(target, figs, min) {
    var u = { target: target, figs: figs, min: min, ratio: 0, active: false, timers: [],
      holdTimer: null, waiting: false, hovered: false, idx: 0,
      seq: figs.map(function (f) { return { fig: f, tl: TIMELINES[f.getAttribute('data-scene')] }; }) };
    if (u.seq.some(function (s) { return !s.tl; })) return;
    figs.forEach(function (f) {
      f.addEventListener('mouseenter', function () {
        u.hovered = true;
        if (u.holdTimer) { clearTimeout(u.holdTimer); u.holdTimer = null; u.waiting = true; }
      });
      f.addEventListener('mouseleave', function () {
        u.hovered = false;
        if (u.active && u.waiting) startHold(u);
      });
    });
    units.push(u);
  }
  function later(u, ms, fn) {
    var id = setTimeout(function () {
      var i = u.timers.indexOf(id);
      if (i >= 0) u.timers.splice(i, 1);
      fn();
    }, ms);
    u.timers.push(id);
    return id;
  }
  function clearUnit(u) {
    u.timers.forEach(clearTimeout);
    u.timers = [];
    u.holdTimer = null;
    u.waiting = false;
  }
  function start(u) {
    clearUnit(u);
    u.active = true;
    u.seq.forEach(function (s) { s.fig.classList.remove('ld-fading'); snap(s.fig, 'play'); measureFlights(s.fig); });
    u.idx = 0;
    run(u, false);
  }
  function run(u, loop) {
    var s = u.seq[u.idx];
    var off = loop && s.tl.loopFrom ? s.tl.loopFrom : 0;
    s.tl.steps.forEach(function (st) {
      later(u, Math.max(0, st[0] - off), function () {
        if (st[1] === 'end') sceneDone(u); else apply(s.fig, st[1]);
      });
    });
  }
  // 회차가 끝나면 완성 장면에서 유지. 마우스가 예시 창 위면 떠날 때까지 기다린다.
  function sceneDone(u) {
    u.waiting = true;
    if (!u.hovered) startHold(u);
  }
  function startHold(u) {
    u.waiting = false;
    u.holdTimer = later(u, u.seq[u.idx].tl.hold, function () {
      u.holdTimer = null;
      if (u.idx < u.seq.length - 1) { u.idx++; run(u, false); } else resetLoop(u);
    });
  }
  function resetLoop(u) {
    u.seq.forEach(function (s) { s.fig.classList.add('ld-fading'); });
    later(u, 200, function () {
      u.seq.forEach(function (s) { snap(s.fig, 'play'); s.fig.classList.remove('ld-fading'); });
      later(u, 200, function () { u.idx = 0; run(u, true); });
    });
  }
  // 멈춤: 반쯤 쓴 글이 남지 않게 즉시 완성 상태로
  function stop(u) {
    clearUnit(u);
    if (!u.active) return;
    u.active = false;
    u.seq.forEach(function (s) { s.fig.classList.remove('ld-fading'); snap(s.fig, 'end'); });
  }
  function evaluate() {
    if (!running || !playing || doc.hidden) {
      units.forEach(stop);
      current = null;
      if (!running || doc.hidden) { clearTimeout(enterTimer); enterTimer = null; view.classList.remove('ld-entering'); }   // 숨은 동안 남는 타이머 0개
      return;
    }
    var best = landing.pickUnit(units);
    if (best === current) return;
    if (current) stop(current);
    current = best;
    if (best) start(best);
  }

  // ── 업무 흐름 진행 줄 ─────────────────────────────────────
  var groups = $$('.ld-group');
  var railLinks = $$('.ld-rail a');
  var topLinks = $$('.ld-top-nav a');
  var rail = view.querySelector('.ld-rail');
  var base = view.querySelector('.ld-rail-base');
  var fill = view.querySelector('.ld-rail-fill');

  function setCurrent(i) {
    railLinks.forEach(function (a, j) {
      a.classList.toggle('is-past', j < i);
      a.classList.toggle('is-now', j === i);
      if (j === i) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
    });
    if (groups[i]) groups[i].classList.add('is-lit');
  }
  // 세로 선: 1번 네모 중심 ~ 5번 네모 중심
  function layoutRail() {
    if (!rail || !base || !fill || railLinks.length < 2) return;
    var r = rail.getBoundingClientRect();
    var a = railLinks[0].querySelector('.ld-sq').getBoundingClientRect();
    var b = railLinks[railLinks.length - 1].querySelector('.ld-sq').getBoundingClientRect();
    var top = a.top + a.height / 2 - r.top;
    var h = b.top + b.height / 2 - (a.top + a.height / 2);
    [base, fill].forEach(function (el) { el.style.top = top + 'px'; el.style.height = h + 'px'; });
  }
  function centerY(el) { var b = el.getBoundingClientRect(); return b.top + b.height / 2; }
  // 스크롤 기준은 window 가 아니라 랜딩 컨테이너(position:fixed)다.
  // 채움선과 '지금 묶음'을 같은 rAF 안에서 위치로 계산한다(IO '들어옴' 알림은 건너뛴 스크롤에서 어긋났다).
  function updateFill() {
    raf = 0;
    var vc = view.getBoundingClientRect().top + view.clientHeight / 2;
    if (fill && groups.length >= 2) {
      fill.style.transform = 'scaleY(' + landing.fillProgress(vc, centerY(groups[0]), centerY(groups[groups.length - 1])) + ')';
    }
    if (groups.length) {
      var rects = groups.map(function (g) { var b = g.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; });
      var i = landing.currentGroup(rects, vc);
      // 첫 묶음 위(업무 흐름 머리 위)에서는 아직 '지금'을 정하지 않는다 — 첫 묶음 칸 막대 연출을 아낀다
      if (i === 0 && vc < rects[0].top) i = -1;
      if (i >= 0 && i !== curGroup) { curGroup = i; setCurrent(i); }
    }
  }
  function onScroll() { if (!raf) raf = requestAnimationFrame(updateFill); }
  function onResize() { layoutRail(); if (current) current.figs.forEach(measureFlights); onScroll(); }

  // ── 켜기·끄기 ─────────────────────────────────────────────
  function observe(targets, fn, opts) {
    opts.root = view;
    var io = new IntersectionObserver(fn, opts);
    targets.forEach(function (t) { if (t) io.observe(t); });
    observers.push(io);
  }
  function startMotion() {
    if (running) return;
    running = true;
    var hasIO = 'IntersectionObserver' in root;
    if (!reduced && !entered) {      // 첫 장 등장은 한 번만. 동작 줄이기면 붙이지 않는다
      entered = true;
      view.classList.add('ld-anim', 'ld-entering');
      if (hasIO) view.classList.add('ld-revealing');
      enterTimer = setTimeout(function () { view.classList.remove('ld-entering'); }, 1200);
    }
    if (hasIO) {
      var th = [];
      for (var i = 0; i <= 20; i++) th.push(i / 20);
      observe(units.map(function (u) { return u.target; }), function (entries) {
        entries.forEach(function (e) {
          var u = units.filter(function (x) { return x.target === e.target; })[0];
          if (!u) return;
          var vh = e.rootBounds ? e.rootBounds.height : view.clientHeight;
          u.ratio = landing.visibleRatio(e.isIntersecting, e.intersectionRect.height, e.boundingClientRect.height, vh);
        });
        evaluate();
      }, { threshold: th });
      if (view.classList.contains('ld-revealing')) {
        observe($$('.ld-reveal-t:not(.is-in)'), function (entries, rio) {
          entries.forEach(function (e) {
            var vh = e.rootBounds ? e.rootBounds.height : view.clientHeight;
            if (e.intersectionRatio >= 0.3 || e.isIntersecting && e.intersectionRect.height >= vh * 0.3) {
              e.target.classList.add('is-in');
              rio.unobserve(e.target);
            }
          });
        }, { threshold: [0, 0.3, 0.6, 1] });
      }
      observe([byId('ld-ai'), byId('ld-flow')], function (entries) {
        entries.forEach(function (e) {
          var a = topLinks.filter(function (l) { return l.getAttribute('href') === '#' + e.target.id; })[0];
          if (!a) return;
          if (e.isIntersecting) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
        });
      }, { rootMargin: '-49% 0px -50% 0px' });
    }
    curGroup = -1;
    doc.addEventListener('visibilitychange', evaluate);
    view.addEventListener('scroll', onScroll, { passive: true });
    if ('onscrollend' in view) view.addEventListener('scrollend', onScroll);
    root.addEventListener('resize', onResize);
    // 글꼴이 늦게 읽히거나 묶음 높이가 바뀌면 진행 줄 위치를 다시 잡는다(없으면 조용히 건너뜀)
    if (root.ResizeObserver) {
      var gw = view.querySelector('.ld-groups');
      if (gw) { rszObs = new root.ResizeObserver(onResize); rszObs.observe(gw); }
    }
    if (doc.fonts && doc.fonts.ready && doc.fonts.ready.then) doc.fonts.ready.then(function () { if (running) onResize(); });
    layoutRail();
    updateFill();
    evaluate();
  }
  function stopMotion() {
    if (!running) return;
    running = false;
    units.forEach(function (u) { stop(u); u.ratio = 0; u.hovered = false; });
    current = null;
    clearTimeout(enterTimer);
    view.classList.remove('ld-entering');
    observers.forEach(function (io) { io.disconnect(); });
    observers = [];
    doc.removeEventListener('visibilitychange', evaluate);
    view.removeEventListener('scroll', onScroll);
    view.removeEventListener('scrollend', onScroll);
    if (rszObs) { rszObs.disconnect(); rszObs = null; }
    root.removeEventListener('resize', onResize);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  // ── 보이기·숨기기 ─────────────────────────────────────────
  function setBehind(on) {
    var lv = byId('login-view');       // 첫 진입(파싱 중)에는 아직 없다 → afterDom 에서 건다
    if (!lv) return;
    if (on) lv.setAttribute('inert', ''); else lv.removeAttribute('inert');
  }
  function show(opts) {
    view.hidden = false;
    setBehind(true);
    view.scrollTop = 0;
    try { startMotion(); } catch (e) {   // 움직임이 실패해도 완성 상태 내용은 보인다
      view.classList.remove('ld-anim', 'ld-entering', 'ld-revealing');
      if (root.console) root.console.warn('[landing] 움직임 시작 실패', e);
    }
    var main = byId('ld-main');
    if (opts && opts.focus && main) main.focus({ preventScroll: true });
  }
  function hide() {
    if (view.hidden) return;
    stopMotion();
    view.hidden = true;
    setBehind(false);
  }
  function goLogin() {
    hide();
    var lv = byId('login-view');
    if (!lv || lv.classList.contains('hidden')) return;
    var hero = root.loginHero;
    if (hero && hero.isMounted && hero.isMounted()) { hero.destroy(); hero.mount(); }   // 첫 장부터
    var id = byId('login-id');
    if (id) id.focus();
  }
  landing.show = show;
  landing.hide = hide;

  // ── 한 번만 하는 연결 ─────────────────────────────────────
  // [로그인]을 가장 먼저 잇는다 — 뒤가 실패해도 랜딩에 갇히지 않게.
  $$('[data-go="login"]').forEach(function (b) { b.addEventListener('click', goLogin); });

  // 쪽 안 이동: 동작 줄이기면 즉시, 아니면 부드럽게. 포커스는 제목으로
  view.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (!a || !view.contains(a)) return;
    var t = byId(a.getAttribute('href').slice(1));
    if (!t) return;
    ev.preventDefault();
    t.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    onScroll();
    var f = t.matches('main,h1,h2,h3,h4') ? t : t.querySelector('h2,h3,h4');
    if (f) {
      if (!f.hasAttribute('tabindex')) f.setAttribute('tabindex', '-1');
      f.focus({ preventScroll: true });
    }
  });

  $$('[data-rv]').forEach(function (el) {
    if (!el.style.getPropertyValue('--rv')) el.style.setProperty('--rv', landing.writeMs(el.textContent) + 'ms');
  });
  groups.forEach(function (g) {
    $$('.ld-cell', g).forEach(function (c, i) { c.style.setProperty('--i', i); });
  });

  var hero = view.querySelector('.ld-today[data-scene]');
  if (hero) makeUnit(hero, [hero], 0.5);
  $$('.ld-scene .ld-mock[data-scene]').forEach(function (f) { makeUnit(f, [f], 0.5); });
  $$('.ld-group .ld-mock[data-scene]').forEach(function (f) { makeUnit(f, [f], 0.5); });
  var trio = view.querySelector('.ld-trio');
  if (trio) makeUnit(trio, $$('.ld-mock[data-scene]', trio), 0.4);

  var btn = byId('ld-motion');
  function renderBtn() {
    btn.querySelector('.ld-motion-t').textContent = playing ? '움직임 멈춤' : '움직임 재생';
    btn.querySelector('.ld-ico-pause').toggleAttribute('hidden', !playing);
    btn.querySelector('.ld-ico-play').toggleAttribute('hidden', playing);
  }
  if (btn) {
    btn.hidden = false;
    renderBtn();
    btn.addEventListener('click', function () {
      playing = !playing;
      if (playing && !view.classList.contains('ld-anim')) {
        // 동작 줄이기 사용자가 직접 재생을 고른 경우: 칸 막대는 이미 진회색 그대로 둔다
        groups.forEach(function (g) { g.classList.add('is-lit'); });
        view.classList.add('ld-anim');
      }
      renderBtn();
      evaluate();
    });
  }

  function storage() { try { return root.localStorage; } catch (e) { return null; } }
  if (!landing.hasSession(storage()) && landing.wantsIntro(root.location && root.location.hash)) show();

  function afterDom() {
    if (!view.hidden) setBehind(true);
    var open = byId('ld-open');   // 로그인 화면의 '서비스 소개' — 이 파일이 있을 때만 드러낸다
    if (open) {
      open.parentNode.hidden = false;
      open.addEventListener('click', function () { show({ focus: true }); });
    }
    // 랜딩을 거치지 않고 로그인되는 경로(캡처 도구의 스크립트 클릭 등)에서도 앱을 가리지 않게
    var lv = byId('login-view');
    if (lv && root.MutationObserver) {
      new root.MutationObserver(function () { if (lv.classList.contains('hidden')) hide(); })
        .observe(lv, { attributes: true, attributeFilter: ['class'] });
    }
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', afterDom); else afterDom();
})(typeof window !== 'undefined' ? window : globalThis);
