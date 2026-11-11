// 로그인 화면 오른쪽 '슬라이드 재생' 히어로 (시안: docs/design/2026-11-11_로그인_시안B3_슬라이드.html).
// 슬라이드의 문구·사실은 모두 data/login-slides.js(window.loginSlides)에서 읽는다 — 여기에는 문구를 두지 않는다.
// 위쪽은 DOM을 쓰지 않는 순수 함수(테스트 대상), 아래쪽 mount/destroy가 DOM·타이머를 다룬다.
// #login-view를 보이면 app.js가 mount, 숨기는 모든 경로에서 destroy — 숨은 화면에서 타이머가 돌지 않게.
(function (root) {
  'use strict';

  const hero = {};

  hero.DUR = 6000;   // 한 장 보이는 시간(ms) — CSS --lg-dur 와 같아야 한다
  hero.KINDS = ['notice', 'districts', 'heatmap', 'flow', 'timeline', 'cards'];
  hero.MODES = ['new', 'keep'];
  hero.SIX_MONTHS = 182;       // logic.computeUrgency의 '6개월 안'과 같은 기준(일)
  hero.TIMELINE_MAX = 8;       // timeline 장에 보이는 최대 줄 수
  // 데이터 칸 길이·개수 상한(화면이 넘치지 않게). problems가 넘으면 그 장을 뺀다.
  hero.LIMITS = { say: 60, topic: 20, items: 6, hot: 25, steps: 6, cardsMin: 3 };

  // ── 날짜 ────────────────────────────────────────────────────────────────
  // 날짜를 '일 번호'로(시간·시간대 무시). Date는 로컬 달력 날짜, 문자열은 실제로 있는 날 YYYY-MM-DD.
  hero.dayNo = function (v) {
    let ms = NaN;
    if (v instanceof Date) ms = Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
    else {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v));
      if (m) {
        const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
        if (t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3]) ms = t.getTime();
      }
    }
    return Math.round(ms / 86400000);   // 잘못된 입력은 NaN
  };
  hero.isDate = function (v) { return typeof v === 'string' && isFinite(hero.dayNo(v)); };

  // today 기준 target까지 남은 일수(지났으면 음수)
  hero.dday = function (today, target) { return hero.dayNo(target) - hero.dayNo(today); };

  hero.ddayLabel = function (n) {
    if (!isFinite(n)) return '';
    if (n === 0) return 'D-DAY';
    return n > 0 ? 'D-' + n : 'D+' + (-n);
  };

  function two(n) { return (n < 10 ? '0' : '') + n; }
  function parts(v) {
    if (v instanceof Date) return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() };
    const d = new Date(hero.dayNo(v) * 86400000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  hero.korDate = function (v) { const p = parts(v); return p.m + '월 ' + p.d + '일'; };      // 11월 11일
  hero.dotDate = function (v) { const p = parts(v); return two(p.m) + '.' + two(p.d); };     // 11.11
  hero.fullDate = function (v) { const p = parts(v); return p.y + '. ' + p.m + '. ' + p.d + '.'; };   // 2026. 12. 31.
  // 2026. 10. 29.–11. 18. (같은 해면 뒤쪽 연도 생략)
  hero.rangeText = function (a, b) {
    const pa = parts(a), pb = parts(b);
    return hero.fullDate(a) + '–' + (pa.y === pb.y ? pb.m + '. ' + pb.d + '.' : hero.fullDate(b));
  };

  // 날짜가 오늘부터 6개월(182일) 안인가
  hero.withinSixMonths = function (today, date) {
    const n = hero.dday(today, date);
    return isFinite(n) && n >= 0 && n <= hero.SIX_MONTHS;
  };

  // say·sayOpen 안의 {receiveFrom} {receiveTo} {noticeFrom} {noticeTo} {contractEnd}는 슬라이드 날짜(M월 D일)로,
  // {count}는 vars.count로 바꾼다. 모르는 자리표시는 그대로 둔다.
  hero.fill = function (text, s, vars) {
    return String(text).replace(/\{(\w+)\}/g, function (m, k) {
      if (vars && vars[k] !== undefined) return String(vars[k]);
      if (s && hero.isDate(s[k])) return hero.korDate(s[k]);
      return m;
    });
  };

  // 공고 시작~접수 마감 줄에서 값의 위치(0~100, 소수 첫째 자리)
  hero.timelinePct = function (v, from, to) {
    const a = hero.dayNo(from), b = hero.dayNo(to), t = hero.dayNo(v);
    if (!isFinite(a) || !isFinite(b) || !isFinite(t) || b === a) return 0;
    return Math.round(Math.max(0, Math.min(100, (t - a) / (b - a) * 100)) * 10) / 10;
  };

  // ── 슬라이드 데이터 검증 ────────────────────────────────────────────────
  function str(v) { return typeof v === 'string' && v.trim() !== ''; }
  function optStr(v) { return v === undefined || typeof v === 'string'; }
  function code5(v) { return typeof v === 'string' && /^\d{5}$/.test(v); }

  // 잘못된 점의 목록(비면 정상). 데이터 파일 테스트가 이 목록을 그대로 보여 준다.
  hero.problems = function (s) {
    const p = [];
    if (!s || typeof s !== 'object') return ['슬라이드가 객체가 아님'];
    if (!str(s.id) || !/^[a-z0-9-]+$/.test(s.id)) p.push('id');   // 영문 소문자·숫자·-만
    if (!str(s.topic) || s.topic.length > hero.LIMITS.topic) p.push('topic');
    if (!str(s.say) || s.say.length > hero.LIMITS.say) p.push('say');
    if (str(s.sayOpen) && s.sayOpen.length > hero.LIMITS.say) p.push('sayOpen');
    if (!optStr(s.src)) p.push('src');
    if (!optStr(s.sayOpen)) p.push('sayOpen');
    if (s.showUntil !== undefined && !hero.isDate(s.showUntil)) p.push('showUntil');
    if (hero.KINDS.indexOf(s.kind) < 0) { p.push('kind'); return p; }
    if (s.kind === 'notice') {
      ['org', 'title', 'noticeNo'].forEach(function (k) { if (!str(s[k])) p.push(k); });
      ['noticeFrom', 'noticeTo', 'receiveFrom', 'receiveTo', 'contractEnd'].forEach(function (k) { if (!hero.isDate(s[k])) p.push(k); });
      if (hero.isDate(s.noticeFrom) && hero.isDate(s.noticeTo) && hero.isDate(s.receiveFrom) && hero.isDate(s.receiveTo) &&
          !(hero.dayNo(s.noticeFrom) <= hero.dayNo(s.noticeTo) && hero.dayNo(s.noticeFrom) <= hero.dayNo(s.receiveFrom) &&
            hero.dayNo(s.receiveFrom) <= hero.dayNo(s.receiveTo))) p.push('날짜 순서');
    } else if (s.kind === 'districts') {
      if (hero.MODES.indexOf(s.mode) < 0) p.push('mode');
      if (!Array.isArray(s.items) || !s.items.length || s.items.length > hero.LIMITS.items) p.push('items');
      else s.items.forEach(function (it, i) {
        if (!it || !code5(it.code) || !str(it.name) || !str(it.what) || !optStr(it.src)) p.push('items[' + i + ']');
      });
    } else if (s.kind === 'cards') {
      if (!Array.isArray(s.items) || s.items.length < hero.LIMITS.cardsMin || s.items.length > hero.LIMITS.items) p.push('items');
      else s.items.forEach(function (it, i) {
        if (!it || !str(it.name) || !str(it.kindLabel) || !str(it.bank) || !str(it.term) || !str(it.src) ||
            (it.pending !== undefined && typeof it.pending !== 'boolean')) p.push('items[' + i + ']');
      });
    } else if (s.kind === 'heatmap') {
      if (!Array.isArray(s.hot) || !s.hot.length || s.hot.length > hero.LIMITS.hot) p.push('hot');
      else {
        const seen = {};
        s.hot.forEach(function (it, i) {
          if (!it || !code5(it.code) || !optStr(it.mark) || seen[it.code]) p.push('hot[' + i + ']');
          if (it) seen[it.code] = 1;
        });
      }
      if (!str(s.hotText)) p.push('hotText');
      if (!str(s.farText)) p.push('farText');
      ['hotLabel', 'farLabel', 'note'].forEach(function (k) { if (!optStr(s[k])) p.push(k); });
    } else if (s.kind === 'flow') {
      if (!Array.isArray(s.steps) || !s.steps.length || s.steps.length > hero.LIMITS.steps) p.push('steps');
      else s.steps.forEach(function (it, i) { if (!it || !str(it.title) || !str(it.desc)) p.push('steps[' + i + ']'); });
    }
    return p;
  };
  hero.isValid = function (s) { return hero.problems(s).length === 0; };

  // 접수 슬라이드의 오늘 상태. closed면 슬라이드를 뺀다.
  hero.noticeView = function (s, today) {
    const toOpen = hero.dday(today, s.receiveFrom), toClose = hero.dday(today, s.receiveTo);
    if (!isFinite(toOpen) || !isFinite(toClose) || toClose < 0) return { state: 'closed' };
    const when = hero.korDate(today) + ' 기준';
    const startPct = hero.timelinePct(s.receiveFrom, s.noticeFrom, s.receiveTo);
    const todayPct = hero.timelinePct(today, s.noticeFrom, s.receiveTo);
    // '오늘' 점은 항상 찍고, 글자는 접수 시작 글자와 겹치거나 공고 전이거나 접수 중이면 뺀다(lg-quiet)
    const beforeNotice = hero.dday(today, s.noticeFrom) > 0;
    const common = { startPct: startPct, todayPct: todayPct, todayText: hero.dotDate(today),
                     chip: hero.withinSixMonths(today, s.contractEnd), beforeNotice: beforeNotice };
    if (toOpen > 0) {
      return Object.assign({ state: 'before', big: hero.ddayLabel(toOpen), cap: '접수 시작까지, ' + when,
               sayLines: hero.fill(s.say, s).split('\n'),
               showToday: !beforeNotice && startPct - todayPct >= 15 }, common);
    }
    return Object.assign({ state: 'open', big: hero.ddayLabel(toClose), cap: '접수 마감까지, ' + when,
             sayLines: hero.fill(str(s.sayOpen) ? s.sayOpen : s.say, s).split('\n'), showToday: false }, common);
  };

  // timeline 장의 줄: 6개월 안(0~182일)에 입찰이 잡힌 기관을 가까운 순으로. 개원 예정 법원·날짜 없는 곳은 뺀다.
  // records는 기관 목록(지자체+지자체 외), L은 logic(effectiveBid·dedupeByInstitution·kindOf). total은 자른 뒤가 아니라 전체 수.
  hero.bidItems = function (records, today, L) {
    if (!Array.isArray(records) || !L || typeof L.effectiveBid !== 'function') return { total: 0, items: [] };
    const list = typeof L.dedupeByInstitution === 'function' ? L.dedupeByInstitution(records) : records;
    const all = [];
    list.forEach(function (r) {
      if (!r || r.opStatus === '개원 예정') return;
      const e = L.effectiveBid(r);
      const d = e && e.date ? hero.dday(today, e.date) : NaN;
      if (!isFinite(d) || d < 0 || d > hero.SIX_MONTHS) return;
      all.push({ name: String(r.name || ''), kind: (typeof L.kindOf === 'function' && L.kindOf(r.type)) || r.type || '',
                 date: e.date, days: d, label: hero.ddayLabel(d), est: e.confidence !== '확정' });
    });
    all.sort(function (a, b) { return a.days - b.days || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
    return { total: all.length, items: all.slice(0, hero.TIMELINE_MAX) };
  };

  // 오늘 보여 줄 슬라이드만 남긴다: 형식이 틀린 것·showUntil이 지난 것·접수가 끝난 것·줄이 0개인 timeline은 조용히 뺀다.
  // ctx = { records, logic } (timeline 계산용, 없으면 timeline은 빠진다)
  hero.activeSlides = function (list, today, ctx) {
    if (!Array.isArray(list)) return [];
    const seen = {};
    return list.filter(function (s) {
      if (!hero.isValid(s) || seen[s.id]) return false;
      if (s.showUntil !== undefined && hero.dday(today, s.showUntil) < 0) return false;
      if (s.kind === 'notice' && hero.noticeView(s, today).state === 'closed') return false;
      if (s.kind === 'timeline' && !(ctx && hero.bidItems(ctx.records, today, ctx.logic).total > 0)) return false;
      seen[s.id] = true;
      return true;
    });
  };

  // ←/→/Home/End → 이동할 장 번호, 해당 없으면 null (끝에서 처음으로 돈다)
  hero.keyTarget = function (key, cur, n) {
    if (!(n > 0)) return null;
    if (key === 'ArrowRight') return (cur + 1) % n;
    if (key === 'ArrowLeft') return (cur - 1 + n) % n;
    if (key === 'Home') return 0;
    if (key === 'End') return n - 1;
    return null;
  };
  hero.wrap = function (i, n) { return n > 0 ? ((i % n) + n) % n : 0; };

  // 자동으로 넘겨도 되는 때: 재생 중 · 마우스/포커스가 히어로 밖 · 탭이 보임 · 히어로가 보이는 폭
  hero.canRun = function (s) { return !!s.wantPlay && !s.hover && !s.focus && !s.hiddenTab && !s.narrow; };

  // ── DOM ─────────────────────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';
  // 모든 글자는 textContent로 넣는다(innerHTML을 쓰지 않으므로 데이터 안의 < > 가 마크업이 되지 않는다).
  function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svgEl(n, at) { const e = document.createElementNS(NS, n); for (const k in at) e.setAttribute(k, at[k]); return e; }
  function add(parent) { for (let i = 1; i < arguments.length; i += 1) if (arguments[i]) parent.appendChild(arguments[i]); return parent; }
  function lines(text) {
    const e = h('h2', 'lg-say');
    String(text).split('\n').forEach(function (t, i) { if (i) e.appendChild(document.createElement('br')); e.appendChild(document.createTextNode(t)); });
    return e;
  }

  function polys(f) { const g = f.geometry; return g.type === 'Polygon' ? [g.coordinates] : g.coordinates; }
  function fitter(fs, w, hh, pad) {
    const K = Math.cos(37.55 * Math.PI / 180);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    fs.forEach(function (f) { polys(f).forEach(function (pg) { pg.forEach(function (r) { r.forEach(function (c) {
      const x = c[0] * K, y = -c[1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }); }); }); });
    const s = Math.min((w - 2 * pad) / (x1 - x0), (hh - 2 * pad) / (y1 - y0));
    const ox = (w - (x1 - x0) * s) / 2, oy = (hh - (y1 - y0) * s) / 2;
    function pt(c) { return [(c[0] * K - x0) * s + ox, (-c[1] - y0) * s + oy]; }
    return {
      d: function (f) {
        return polys(f).map(function (pg) {
          return pg.map(function (r) {
            return 'M' + r.map(function (c) { const q = pt(c); return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join('L') + 'Z';
          }).join('');
        }).join('');
      },
      center: function (f) {
        let a = Infinity, b = Infinity, c2 = -Infinity, d2 = -Infinity;
        polys(f).forEach(function (pg) { pg[0].forEach(function (c) {
          const q = pt(c);
          a = Math.min(a, q[0]); c2 = Math.max(c2, q[0]); b = Math.min(b, q[1]); d2 = Math.max(d2, q[1]);
        }); });
        return [(a + c2) / 2, (b + d2) / 2];
      }
    };
  }
  function placeholder(svg, w, hh, text) {
    svg.appendChild(svgEl('rect', { 'class': 'lg-ph', x: 6, y: 6, width: w - 12, height: hh - 12, rx: 8 }));
    if (text) svg.appendChild(svgEl('text', { 'class': 'lg-ph-t', x: w / 2, y: hh / 2 + 4 }, text)).textContent = text;
  }
  // 서울 25개 구 지도. cls(code) → 구별 클래스, label(feature) → 글자(없으면 null)
  function buildMap(cls, label) {
    const svg = svgEl('svg', { 'class': 'lg-map', viewBox: '0 0 380 300', 'aria-hidden': 'true' });
    const geo = root.geoSeoul;
    if (!geo || !geo.features) { placeholder(svg, 380, 300, '서울 25개 구 경계 자리'); return svg; }
    const fm = fitter(geo.features, 380, 300, 6);
    geo.features.slice().sort(function (a, b) { return (cls(a.properties.code) !== 'lg-gu') - (cls(b.properties.code) !== 'lg-gu'); })
      .forEach(function (ft) { svg.appendChild(svgEl('path', { d: fm.d(ft), 'class': cls(ft.properties.code) })); });
    geo.features.forEach(function (ft) {
      const t = label(ft); if (!t) return;
      const c = fm.center(ft), tx = svgEl('text', { x: c[0].toFixed(1), y: (c[1] + 4).toFixed(1), 'class': 'lg-gu-label' });
      tx.textContent = t; svg.appendChild(tx);
    });
    return svg;
  }
  function buildSil(code) {
    const svg = svgEl('svg', { viewBox: '0 0 160 150', 'aria-hidden': 'true' });
    const geo = root.geoSeoul;
    const ft = geo && geo.features ? geo.features.filter(function (x) { return x.properties.code === code; })[0] : null;
    if (ft) svg.appendChild(svgEl('path', { d: fitter([ft], 160, 150, 6).d(ft), 'class': 'lg-sil' }));
    else placeholder(svg, 160, 150, '');
    return svg;
  }
  function srcLine(s) { return str(s.src) ? h('p', 'lg-src', s.src) : null; }

  function buildNotice(s, v) {
    const art = add(h('article', 'lg-slide'), lines(v.sayLines.join('\n')));
    const notice = add(h('div', 'lg-notice'), h('p', 'lg-org', s.org + ' 공고 ' + s.noticeNo), h('h3', null, s.title));
    const dl = h('dl');
    [['공고기간', hero.rangeText(s.noticeFrom, s.noticeTo)], ['제안서 접수', hero.rangeText(s.receiveFrom, s.receiveTo)],
     ['현 약정 만료', hero.fullDate(s.contractEnd)]].forEach(function (r) { add(dl, h('dt', null, r[0]), h('dd', null, r[1])); });
    notice.appendChild(dl);
    const dday = add(h('div', 'lg-dday'), h('p', 'lg-big', v.big), h('p', 'lg-cap', v.cap));
    if (v.chip) {
      const chip = h('p', 'lg-chip');
      const ic = svgEl('svg', { viewBox: '0 0 12 12', 'aria-hidden': 'true' });
      ic.appendChild(svgEl('path', { d: 'M6 1.5 11 10.5H1Z', fill: 'currentColor' }));
      add(chip, ic, document.createTextNode('6개월 안'));
      dday.appendChild(chip);
    }
    const span = h('div', 'lg-tlspan'); span.setAttribute('aria-hidden', 'true'); span.style.left = v.startPct + '%';
    const ol = h('ol', 'lg-tl'); ol.setAttribute('aria-label', s.org + ' 공고 일정');
    function mark(cls, pct, date, text) {
      const li = h('li', cls), sp = h('span');
      add(sp, h('b', null, date), document.createTextNode(text)); li.appendChild(sp);
      li.style.setProperty('--x', pct + '%'); ol.appendChild(li);
    }
    mark('down start', 0, hero.dotDate(s.noticeFrom), '공고');
    if (!v.beforeNotice) mark(v.showToday ? 'up today' : 'up today lg-quiet', v.todayPct, v.todayText, '오늘');   // 점은 항상, 글자만 숨김
    mark('up', v.startPct, hero.dotDate(s.receiveFrom), '접수 시작');
    mark('down end', 100, hero.dotDate(s.receiveTo), '접수 마감');
    const vis = add(h('div', 'lg-vis lg-v1'), notice, dday, add(h('div', 'lg-tlw'), span, ol));
    return add(art, vis, srcLine(s));
  }

  function buildDistricts(s) {
    const art = add(h('article', 'lg-slide'), lines(s.say));
    const codes = {}; s.items.forEach(function (it) { codes[it.code] = 1; });
    const on = s.mode === 'new' ? 'lg-gu lg-ink' : 'lg-gu lg-ring';
    const map = buildMap(function (c) { return codes[c] ? on : 'lg-gu'; }, function (f) { return codes[f.properties.code] ? f.properties.name : null; });
    const ul = h('ul', 'lg-rows');
    s.items.forEach(function (it) {
      const info = add(h('div'), h('p', 'lg-name', it.name), h('p', 'lg-what', it.what), str(it.src) ? h('p', 'lg-src', it.src) : null);
      ul.appendChild(add(h('li'), buildSil(it.code), info));
    });
    return add(art, add(h('div', 'lg-vis lg-v2'), map, ul), srcLine(s));
  }

  function buildHeatmap(s) {
    const art = add(h('article', 'lg-slide'), lines(s.say));
    const hot = {}; s.hot.forEach(function (it) { hot[it.code] = it.mark || ''; });
    const map = buildMap(function (c) { return hot[c] !== undefined ? 'lg-gu lg-hot' : 'lg-gu lg-far'; },
      function (f) { const m = hot[f.properties.code]; return m === undefined ? null : f.properties.name + (m ? ' ' + m : ''); });
    const total = root.geoSeoul && root.geoSeoul.features ? root.geoSeoul.features.length : 0;
    function item(swatch, count, label, text) {
      const d = add(h('div'), count ? h('span', 'lg-n', count) : null, label ? document.createTextNode((count ? ' ' : '') + label) : null, h('p', null, text));
      return add(h('li'), h('span', 'lg-sw ' + swatch), d);
    }
    const legend = add(h('ul', 'lg-legend'),
      item('lg-hotsw', s.hot.length + '곳', s.hotLabel, s.hotText),
      item('lg-farsw', total > s.hot.length ? (total - s.hot.length) + '곳' : '', s.farLabel, s.farText));
    const side = add(h('div'), legend, str(s.note) ? h('p', 'lg-memo', s.note) : null);
    return add(art, add(h('div', 'lg-vis lg-v4'), map, side), srcLine(s));
  }

  function buildFlow(s) {
    const art = add(h('article', 'lg-slide'), lines(s.say));
    const ol = h('ol', 'lg-flow');
    s.steps.forEach(function (st, i) { ol.appendChild(add(h('li'), h('p', 'lg-no', String(i + 1)), h('h3', null, st.title), h('p', 'lg-d', st.desc))); });
    return add(art, add(h('div', 'lg-vis'), ol), srcLine(s));
  }

  // 지자체 외 포함 6개월 안 입찰 일정 줄(날짜순). 이름·종류 배지·D-day, 추정이면 '추정' 표시.
  function buildTimeline(s, b) {
    const art = add(h('article', 'lg-slide'), lines(hero.fill(s.say, s, { count: b.total })));
    const ol = h('ol', 'lg-bids');
    b.items.forEach(function (it) {
      const li = h('li');
      const nm = add(h('span', 'lg-bname'), h('span', null, it.name), h('span', 'lg-badge', it.kind));
      const dt = add(h('span', 'lg-bdate'), document.createTextNode(hero.dotDate(it.date) + (it.est ? ' (추정)' : '')));
      add(li, h('span', 'lg-bday', it.label), nm, dt);
      ol.appendChild(li);
    });
    return add(art, add(h('div', 'lg-vis'), ol), srcLine(s));
  }

  // 지자체 밖 기관 카드 묶음. pending이면 '확정 아님' 표시.
  function buildCards(s) {
    const art = add(h('article', 'lg-slide'), lines(s.say));
    const ul = h('ul', 'lg-cards');
    s.items.forEach(function (it) {
      const head = add(h('div', 'lg-chead'), h('p', 'lg-cname', it.name), h('span', 'lg-badge', it.kindLabel));
      const li = add(h('li'), head, h('p', 'lg-cbank', it.bank), h('p', 'lg-cterm', it.term));
      if (it.pending) li.appendChild(h('p', 'lg-pending', '확정 아님'));
      li.appendChild(h('p', 'lg-src', it.src));
      ul.appendChild(li);
    });
    return add(art, add(h('div', 'lg-vis'), ul), srcLine(s));
  }

  function buildSlide(s, today, ctx) {
    const art = s.kind === 'notice' ? buildNotice(s, hero.noticeView(s, today))
      : s.kind === 'districts' ? buildDistricts(s) : s.kind === 'heatmap' ? buildHeatmap(s)
      : s.kind === 'timeline' ? buildTimeline(s, hero.bidItems(ctx.records, today, ctx.logic))
      : s.kind === 'cards' ? buildCards(s) : buildFlow(s);
    art.setAttribute('role', 'group'); art.setAttribute('aria-roledescription', '슬라이드');
    return art;
  }

  // 기관 목록(지자체 + 지자체 외). 없는 쪽은 건너뛴다.
  function gatherRecords() {
    return [].concat(Array.isArray(root.institutions) ? root.institutions : [], Array.isArray(root.institutionsNonMuni) ? root.institutionsNonMuni : []);
  }

  let active = null;   // 지금 mount된 인스턴스 (한 번에 하나)

  // now: 기준 날짜(기본 오늘), list: 슬라이드 목록(기본 window.loginSlides)
  hero.mount = function (now, list) {
    if (active) return;
    const heroEl = document.getElementById('lg-hero');
    if (!heroEl) return;
    const today = now || new Date();
    const wrap = document.getElementById('lg-slides'), dotsEl = document.getElementById('lg-dots');
    const play = document.getElementById('lg-play'), playTxt = play.querySelector('.lg-t');
    const countEl = document.getElementById('lg-n'), totalEl = document.getElementById('lg-total'), topicEl = document.getElementById('lg-topic');
    const ctl = heroEl.querySelector('.lg-ctl');
    const stage = heroEl.parentNode;

    const ctx = { records: gatherRecords(), logic: root.logic };
    const mountDay = hero.dayNo(today), fixedNow = !!now;
    const data = hero.activeSlides(list === undefined ? root.loginSlides : list, today, ctx);
    wrap.textContent = ''; dotsEl.textContent = '';
    // 남은 슬라이드가 없으면 히어로를 숨기고 로그인 카드만 가운데에 둔다
    heroEl.hidden = data.length === 0;
    if (stage && stage.classList) stage.classList.toggle('lg-solo', data.length === 0);
    if (!data.length) { active = { destroy: function () {} }; return; }

    const N = data.length;
    const slides = [], dots = [];
    data.forEach(function (s, i) {
      const art = buildSlide(s, today, ctx);
      art.setAttribute('aria-label', (i + 1) + ' / ' + N + ' ' + s.topic);
      wrap.appendChild(art); slides.push(art);
      const d = h('button', 'lg-dot'); d.type = 'button';
      d.setAttribute('aria-label', (i + 1) + '번째 슬라이드: ' + s.topic);
      dotsEl.appendChild(d); dots.push(d);
    });
    totalEl.textContent = String(N);

    const rm = window.matchMedia('(prefers-reduced-motion: reduce)'), narrow = window.matchMedia('(max-width: 960px)');
    const st = { wantPlay: !rm.matches, hover: false, focus: false, hiddenTab: document.hidden, narrow: narrow.matches };
    let cur = 0, timer = null, startedAt = 0, left = hero.DUR;
    slides[0].classList.add('on');   // go(0)이 바로 지우고 다시 켜므로 순서만 맞추면 된다

    // 진행 막대가 멈춤→재생 때 처음부터 다시 차지 않게, 지난 시간만큼 애니메이션을 앞으로 당긴다(음수 delay).
    function setElapsed() { heroEl.style.setProperty('--lg-delay', '-' + Math.round(hero.DUR - left) + 'ms'); }
    // 자정을 넘기면 D-day·목록이 낡으므로 날짜가 바뀐 것을 알아챈 즉시 처음부터 다시 그린다(탭이 다시 보일 때·넘김 때).
    function dayChanged() { return !fixedNow && hero.dayNo(new Date()) !== mountDay; }
    function reload() { hero.destroy(); hero.mount(now, list); }
    function halt() { if (timer) { clearTimeout(timer); timer = null; left = Math.max(0, left - (Date.now() - startedAt)); setElapsed(); } }
    function run() {
      if (timer) return;
      startedAt = Date.now();
      timer = setTimeout(function () { timer = null; if (dayChanged()) reload(); else go(cur + 1); }, left);
    }
    function sync() {
      st.hiddenTab = document.hidden; st.narrow = narrow.matches;
      const r = hero.canRun(st);
      if (r) run(); else halt();
      heroEl.classList.toggle('is-running', r);
      heroEl.setAttribute('data-play', st.wantPlay ? 'on' : 'off');
      wrap.setAttribute('aria-live', r ? 'off' : 'polite');   // 자동으로 넘어가는 동안은 읽지 않는다(WCAG 2.2.2)
      play.setAttribute('aria-label', st.wantPlay ? '자동 재생 멈추기' : '자동 재생 시작');
      playTxt.textContent = st.wantPlay ? '멈춤' : '재생';
      play.classList.toggle('paused', !st.wantPlay);
    }
    function go(n) {
      n = hero.wrap(n, N); halt(); left = hero.DUR; setElapsed();
      slides[cur].classList.remove('on'); dots[cur].removeAttribute('aria-current');
      cur = n;
      slides[cur].classList.add('on'); dots[cur].setAttribute('aria-current', 'true');
      countEl.textContent = String(cur + 1); topicEl.textContent = data[cur].topic;
      heroEl.classList.add('reset'); void heroEl.offsetWidth; heroEl.classList.remove('reset');   // 진행 막대를 처음부터
      sync();
    }

    function onPlay() {
      st.wantPlay = !st.wantPlay;
      if (st.wantPlay) { st.hover = false; st.focus = false; if (left <= 0) left = hero.DUR; }   // 명시적 재생 요청이 일시 정지보다 우선
      sync();
    }
    function onPrev() { go(cur - 1); }
    function onNext() { go(cur + 1); }
    function onDot(e) { const i = dots.indexOf(e.currentTarget); if (i >= 0) go(i); }
    function onKey(e) {
      const to = hero.keyTarget(e.key, cur, N);
      if (to === null) return;
      e.preventDefault();
      const onDotNow = dots.indexOf(document.activeElement) >= 0;
      go(to); if (onDotNow) dots[cur].focus();
    }
    function onEnter() { st.hover = true; sync(); }
    function onLeave() { st.hover = false; sync(); }
    function onFocusIn() { st.focus = true; sync(); }
    function onFocusOut(e) { if (!heroEl.contains(e.relatedTarget)) { st.focus = false; sync(); } }
    function onVis() { if (!document.hidden && dayChanged()) { reload(); return; } sync(); }
    function onRm() { if (rm.matches) st.wantPlay = false; sync(); }
    function listen(mq, fn, on) {
      if (mq.addEventListener) mq[on ? 'addEventListener' : 'removeEventListener']('change', fn);
      else if (mq.addListener) mq[on ? 'addListener' : 'removeListener'](fn);
    }
    const prev = document.getElementById('lg-prev'), next = document.getElementById('lg-next');
    function wire(on) {
      const m = on ? 'addEventListener' : 'removeEventListener';
      play[m]('click', onPlay); prev[m]('click', onPrev); next[m]('click', onNext);
      dots.forEach(function (d) { d[m]('click', onDot); });
      ctl[m]('keydown', onKey);
      heroEl[m]('mouseenter', onEnter); heroEl[m]('mouseleave', onLeave);
      heroEl[m]('focusin', onFocusIn); heroEl[m]('focusout', onFocusOut);
      document[m]('visibilitychange', onVis);
      listen(rm, onRm, on); listen(narrow, onVis, on);
    }

    wire(true);
    go(0);   // 첫 장 표시 + sync

    active = {
      destroy: function () {
        halt(); st.wantPlay = false;
        heroEl.classList.remove('is-running', 'reset');
        wire(false);
      }
    };
  };

  hero.destroy = function () { if (active) { active.destroy(); active = null; } };
  hero.isMounted = function () { return !!active; };

  if (typeof module !== 'undefined' && module.exports) module.exports = hero;
  else root.loginHero = hero;
})(typeof window !== 'undefined' ? window : globalThis);
