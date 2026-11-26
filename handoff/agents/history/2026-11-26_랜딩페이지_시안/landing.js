// 기능 소개 랜딩 시안 — 움직임 엔진·진행 줄·멈춤 단추.
// 규격: handoff/agents/design-reviewer/2026-11-26_1126_a0181b16.md 6-②③④.
// 마크업 기본값이 완성 상태다. 이 파일이 없거나 중간에 실패해도 내용은 다 보인다.
// 장면은 data-step="play" + data-on="토큰…"(누적)으로 그리고, 모양은 CSS 전이가 맡는다.
// file:// 로 열려야 하므로 ES module·fetch 를 쓰지 않는다. 시간표는 landing-content.js(window.LD_CONTENT).
(function () {
  'use strict';

  var root = document.getElementById('landing-view');
  if (!root) return;
  var C = window.LD_CONTENT || {};
  var TL = C.timelines || {};
  var ATTRS = ['hl', 'in', 'rv', 'out', 'fade', 'flash'];
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var reduced = mq.matches;
  var playing = !reduced;           // 저장하지 않는다(규격 8절 권장)

  function $$(sel, el) { return Array.prototype.slice.call((el || root).querySelectorAll(sel)); }

  // ── 장면 상태 ─────────────────────────────────────────────
  // step: 'play'(시작 상태부터) | 'end'(완성 상태). 전이 없이 즉시 바꾼다.
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

  // 써짐(RV) 시간 = 글자 수 × 30ms (400~1400)
  $$('[data-rv]').forEach(function (el) {
    if (el.style.getPropertyValue('--rv')) return;
    var n = el.textContent.replace(/\s+/g, '').length;
    el.style.setProperty('--rv', Math.min(1400, Math.max(400, n * 30)) + 'ms');
  });

  // ── 재생 단위 ─────────────────────────────────────────────
  // 첫 장 · 큰 장면 4개 · 작은 장면 묶음(5→6→7 차례) — 동시에 하나만 재생한다.
  var units = [];
  function makeUnit(target, figs, min) {
    var u = { target: target, figs: figs, min: min, ratio: 0, active: false, timers: [],
      holdTimer: null, waiting: false, hovered: false, idx: 0,
      seq: figs.map(function (f) { return { fig: f, tl: TL[f.getAttribute('data-scene')] }; }) };
    if (u.seq.some(function (s) { return !s.tl; })) return null;
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
    return u;
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
    u.seq.forEach(function (s) { s.fig.classList.remove('ld-fading'); snap(s.fig, 'play'); });
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
  // 되돌림: 몸 전체 opacity 1→0(200) → 시작 상태 → 0→1(200) → 다시 재생
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

  var hero = root.querySelector('.ld-today[data-scene]');
  if (hero) makeUnit(hero, [hero], 0.5);
  $$('.ld-scene .ld-mock[data-scene]').forEach(function (f) { makeUnit(f, [f], 0.5); });
  var trio = root.querySelector('.ld-trio');
  if (trio) makeUnit(trio, $$('.ld-mock[data-scene]', trio), 0.4);

  var current = null;
  function evaluate() {
    if (!playing || document.hidden) {
      units.forEach(stop);
      current = null;
      return;
    }
    var best = null;
    units.forEach(function (u) {           // 비율이 같으면 위쪽(먼저 등록된) 장면
      if (u.ratio >= u.min && (!best || u.ratio > best.ratio)) best = u;
    });
    if (best === current) return;
    if (current) stop(current);
    current = best;
    if (best) start(best);
  }

  if ('IntersectionObserver' in window) {
    var th = [];
    for (var i = 0; i <= 20; i++) th.push(i / 20);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var u = units.filter(function (x) { return x.target === e.target; })[0];
        if (!u) return;
        // 창보다 큰 묶음도 기준을 넘을 수 있게: 보이는 높이 / min(요소 높이, 창 높이)
        var vh = e.rootBounds ? e.rootBounds.height : window.innerHeight;
        var h = Math.min(e.boundingClientRect.height, vh) || 1;
        u.ratio = e.isIntersecting ? Math.min(1, e.intersectionRect.height / h) : 0;
      });
      evaluate();
    }, { threshold: th });
    units.forEach(function (u) { io.observe(u.target); });
  }
  document.addEventListener('visibilitychange', evaluate);

  // ── 멈춤 단추 ─────────────────────────────────────────────
  var btn = document.getElementById('ld-motion');
  function renderBtn() {
    if (!btn) return;
    btn.querySelector('.ld-motion-t').textContent = playing ? '움직임 멈춤' : '움직임 재생';
    btn.querySelector('.ld-ico-pause').toggleAttribute('hidden', !playing);
    btn.querySelector('.ld-ico-play').toggleAttribute('hidden', playing);
  }
  if (btn) {
    btn.hidden = false;
    renderBtn();
    btn.addEventListener('click', function () {
      playing = !playing;
      if (playing && !root.classList.contains('ld-anim')) {
        // 동작 줄이기 사용자가 직접 재생을 고른 경우: 칸 막대는 이미 진회색 그대로 둔다
        $$('.ld-group').forEach(function (g) { g.classList.add('is-lit'); });
        root.classList.add('ld-anim');
      }
      renderBtn();
      evaluate();
    });
  }

  // ── 첫 진입·구역 제목 등장 (동작 줄이기면 붙이지 않는다) ──
  if (!reduced) {
    root.classList.add('ld-anim', 'ld-entering');
    setTimeout(function () { root.classList.remove('ld-entering'); }, 1200);
    if ('IntersectionObserver' in window) {
      root.classList.add('ld-revealing');
      var rio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.intersectionRatio >= 0.3 || e.isIntersecting && e.intersectionRect.height >= e.rootBounds.height * 0.3) {
            e.target.classList.add('is-in');
            rio.unobserve(e.target);
          }
        });
      }, { threshold: [0, 0.3, 0.6, 1] });
      $$('.ld-reveal-t').forEach(function (el) { rio.observe(el); });
    }
  }

  // ── 상단 줄: 지금 보는 구역 ───────────────────────────────
  var topLinks = $$('.ld-top-nav a');
  if ('IntersectionObserver' in window) {
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var a = topLinks.filter(function (l) { return l.getAttribute('href') === '#' + e.target.id; })[0];
        if (!a) return;
        if (e.isIntersecting) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-49% 0px -50% 0px' });
    ['ld-ai', 'ld-flow'].forEach(function (id) { var s = document.getElementById(id); if (s) sio.observe(s); });
  }

  // ── 업무 흐름 진행 줄 ─────────────────────────────────────
  var groups = $$('.ld-group');
  var railLinks = $$('.ld-rail a');
  var rail = root.querySelector('.ld-rail');
  var base = root.querySelector('.ld-rail-base');
  var fill = root.querySelector('.ld-rail-fill');

  // 칸 수 대조(정본 27칸) — 하위 칸은 data-cells 로 센다
  if (C.flowCells) {
    groups.forEach(function (g, gi) {
      var n = $$('.ld-chain > li', g).reduce(function (s, li) { return s + (+li.getAttribute('data-cells') || 1); }, 0);
      if (n !== C.flowCells[gi]) console.warn('[landing] 묶음 ' + (gi + 1) + ' 칸 수 ' + n + ' ≠ 정본 ' + C.flowCells[gi]);
    });
  }
  groups.forEach(function (g) {
    $$('.ld-cell', g).forEach(function (c, i) { c.style.setProperty('--i', i); });
  });

  function setCurrent(i) {
    railLinks.forEach(function (a, j) {
      a.classList.toggle('is-past', j < i);
      a.classList.toggle('is-now', j === i);
      if (j === i) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
    });
    if (groups[i]) groups[i].classList.add('is-lit');     // 처음 한 번만(다시 와도 반복하지 않음)
  }
  if ('IntersectionObserver' in window && groups.length) {
    var gio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) setCurrent(groups.indexOf(e.target));
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    groups.forEach(function (g) { gio.observe(g); });
  }

  // 세로 선: 1번 네모 중심 ~ 5번 네모 중심. 채움은 스크롤에 직접 묶는다(전이 없음).
  function layoutRail() {
    if (!rail || !base || railLinks.length < 2) return;
    var r = rail.getBoundingClientRect();
    var a = railLinks[0].querySelector('.ld-sq').getBoundingClientRect();
    var b = railLinks[railLinks.length - 1].querySelector('.ld-sq').getBoundingClientRect();
    var top = a.top + a.height / 2 - r.top;
    var h = b.top + b.height / 2 - (a.top + a.height / 2);
    [base, fill].forEach(function (el) { el.style.top = top + 'px'; el.style.height = h + 'px'; });
  }
  function centerY(el) { var b = el.getBoundingClientRect(); return b.top + b.height / 2; }
  var ticking = false;
  function updateFill() {
    ticking = false;
    if (!fill || groups.length < 2) return;
    var vc = window.innerHeight / 2;
    var c1 = centerY(groups[0]), c5 = centerY(groups[groups.length - 1]);
    var p = (vc - c1) / ((c5 - c1) || 1);
    p = Math.max(0, Math.min(1, p));
    fill.style.transform = 'scaleY(' + p + ')';
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(updateFill); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { layoutRail(); onScroll(); });
  layoutRail();
  updateFill();

  // ── 쪽 안 이동: 동작 줄이기면 즉시, 아니면 부드럽게. 포커스는 제목으로 ──
  root.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (!a || !root.contains(a)) return;
    var t = document.getElementById(a.getAttribute('href').slice(1));
    if (!t) return;
    ev.preventDefault();
    t.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    var f = t.matches('main,h1,h2,h3,h4') ? t : t.querySelector('h2,h3,h4');
    if (f) {
      if (!f.hasAttribute('tabindex')) f.setAttribute('tabindex', '-1');
      f.focus({ preventScroll: true });
    }
  });

  // ── [로그인]: 시안이라 넘어가지 않는다 ─────────────────────
  var status = document.getElementById('ld-status');
  var statusTimer = null;
  $$('[data-go="login"]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!status) return;
      status.textContent = C.loginNote || '시안이라 로그인 화면으로 넘어가지 않습니다.';
      clearTimeout(statusTimer);
      statusTimer = setTimeout(function () { status.textContent = ''; }, 4000);
    });
  });

  evaluate();
})();
