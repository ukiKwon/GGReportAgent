(function (root) {
  'use strict';
  const render = {};
  // designer.js·approvals.js와 같은 방식(브라우저는 전역, node는 require) — 이 파일도
  // node --test로 열 수 있어야 면 클릭 규칙을 테스트로 고정할 수 있다.
  const logic = (typeof require !== 'undefined') ? require('./logic.js') : root.logic;
  const store = (typeof require !== 'undefined') ? require('./store.js') : root.store;

  const esc = logic.esc; // 공유 이스케이프(logic.esc) 위임

  render.state = {
    // 로컬 날짜 기준 자정. toISOString()은 UTC라 한국 시각 00~09시에 하루 전 날짜가 된다.
    today: new Date(logic.localDateStr(new Date()) + 'T00:00:00'),
    // v2(2026-08-09): 전국 확대. korea.js의 17개 시·도 코드 전부를 활성화한다.
    // 비활성 지역은 빗금('준비중')으로 그려지고 클릭·랭킹 집계에서도 빠지므로,
    // 광역 금고 데이터를 넣어도 여기에 코드가 없으면 화면에 아무것도 안 나타난다.
    activeRegions: new Set(['11','26','27','28','30','31','36',
                            '41','42','43','44','45','46','47','48','50']),
    enabledTypes: new Set(logic.FILTERABLE_TYPES),
    currentRegion: null,
    rankSort: 'urgency',   // 'urgency' | 'interest'
  };

  // 파스텔 기본 팔레트(2026-08-14 정본 — 다크 크롬+파스텔 지도 월드). 어두운 크롬
  // 위에서 채도는 지도만 갖는다: 진한 원색은 위에 얹히는 물결/깜빡임을 묻히게 해서
  // 낮췄고(1.0 팔레트 계승), 사용자 확정 근거는 handoff/2026-08-14_summary.md
  // (라이트·원색 계열 8종 비교 후 이 조합 선택).
  // 2026-11-11(NEXT 78): 지도 면 색이 5단 섞기로 바뀌었다 — r3 진빨강 · r2 빨강 · p 보라(섞임) ·
  // b2 파랑 · b3 진파랑 · gray 날짜 미상. 값은 design-reviewer 1616 규격 §6(바탕 대비 4.0~9.6:1).
  render.DEFAULT_THEME = {
    r3:'#e8606b', r2:'#f0a6a9', p:'#cf9ad8', b2:'#7397d8', b3:'#4f72b8', gray:'#7c8699',
    // 파스텔 위에서 가장 잘 튀는 채도 높은 틸 — 물결·구 외곽선·크롬 강조가 공유.
    accent:'#57b8ad',
    rippleDuration: 2.2,   // 초. 이전 1.4s에서 한 템포 늦춤
  };

  // 글리프는 문자·이모지 대신 같은 획 어휘(1.2~1.4 스트로크)의 인라인 SVG로 그린다 —
  // 상단 필터의 .fsw와 한 계열. 색은 부모(.heart/.star 등)의 currentColor를 따른다.
  render.ICONS = {
    heartFill: '<svg class="gph" viewBox="0 0 12 12"><path d="M6 10.2C2.4 7.6 1 5.9 1 4.1 1 2.7 2.1 1.7 3.4 1.7 4.4 1.7 5.4 2.3 6 3.3 6.6 2.3 7.6 1.7 8.6 1.7 9.9 1.7 11 2.7 11 4.1 11 5.9 9.6 7.6 6 10.2Z" fill="currentColor"/></svg>',
    heartLine: '<svg class="gph" viewBox="0 0 12 12"><path d="M6 10.2C2.4 7.6 1 5.9 1 4.1 1 2.7 2.1 1.7 3.4 1.7 4.4 1.7 5.4 2.3 6 3.3 6.6 2.3 7.6 1.7 8.6 1.7 9.9 1.7 11 2.7 11 4.1 11 5.9 9.6 7.6 6 10.2Z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    starFill: '<svg class="gph" viewBox="0 0 12 12"><path d="M6 1.2 7.35 4.35 10.8 4.65 8.2 6.9 9 10.3 6 8.45 3 10.3 3.8 6.9 1.2 4.65 4.65 4.35Z" fill="currentColor"/></svg>',
    starLine: '<svg class="gph" viewBox="0 0 12 12"><path d="M6 1.2 7.35 4.35 10.8 4.65 8.2 6.9 9 10.3 6 8.45 3 10.3 3.8 6.9 1.2 4.65 4.65 4.35Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    warn: '<svg class="gph warn" viewBox="0 0 12 12"><path d="M6 1.6 11 10.4H1Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><line x1="6" y1="4.6" x2="6" y2="7.2" stroke="currentColor" stroke-width="1.3"/><circle cx="6" cy="8.8" r="0.8" fill="currentColor"/></svg>',
    // 티커 임박(상승) 표기 — 문자 ▲ 대신 같은 획 어휘의 채운 삼각
    up: '<svg class="gph up" viewBox="0 0 12 12"><path d="M6 2.4 10.4 9.6H1.6Z" fill="currentColor"/></svg>',
    // 공고 예정일 경과 도장(시계) — 임박(▲, 빨강)과 모양·색·글자가 모두 다른 무채색 신호.
    overdue: '<svg class="gph" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6 3.4V6l1.9 1.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // '날짜 의미 확인 중' 표식(점선 원 + i)
    check: '<svg class="gph" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.4"/><line x1="6" y1="5.4" x2="6" y2="8.6" stroke="currentColor" stroke-width="1.3"/><circle cx="6" cy="3.7" r=".75" fill="currentColor"/></svg>',
  };
  // MAP_COLORS는 지도 위(지역 면·마커)의 5단 색이고 테마로 바꾼다. URGENCY_COLORS는 **크롬**(티커)의
  // 옛 4단+미상 색으로 고정이다(규격 §6 '크롬 그대로', 팀 결정 2026-11-11). 지도 위 마커는 기관 하나의
  // 임박도 band를 BAND_TO_MIX로 5단 색에 대응시켜 MAP_COLORS를 쓴다: red→r3, orange→r2, yellow→b2, blue→b3, gray→gray.
  render.MAP_KEYS = ['r3','r2','p','b2','b3','gray'];
  render.BAND_TO_MIX = { red:'r3', orange:'r2', yellow:'b2', blue:'b3', gray:'gray' };
  render.MAP_COLORS = { r3:'', r2:'', p:'', b2:'', b3:'', gray:'' };
  render.markerColor = function (band) {
    const k = render.BAND_TO_MIX[band] || 'gray';
    return render._safeColor(render.MAP_COLORS[k], render.DEFAULT_THEME[k]);
  };

  // 이전 테마(red/orange/yellow/blue/gray)를 이어받는다. 끝점 대응은 위 BAND_TO_MIX와 같다.
  // 테마 창은 저장할 때 다섯 색을 전부 쓰므로, 옛 기본값 그대로인 값은 사용자가 고른 색이 아니라서
  // 가져오지 않는다(가져오면 새 5단이 옛 파스텔로 덮여 노랑이 파랑 자리에 들어간다).
  render.LEGACY_DEFAULTS = { red:'#f0a6a9', orange:'#f3c795', yellow:'#e9e3a8', blue:'#a9c5ea', gray:'#7c8699' };
  render.URGENCY_COLORS = Object.assign({}, render.LEGACY_DEFAULTS);
  render.migrateTheme = function (saved) {
    const src = saved || {};
    const out = Object.assign({}, src);
    Object.keys(render.LEGACY_DEFAULTS).forEach(function (k) {
      const to = render.BAND_TO_MIX[k];
      if (k === to) return;                       // gray는 키 이름이 같아 그대로 이어진다
      delete out[k];                              // 옛 키는 남기지 않는다
      const v = src[k];
      if (typeof v !== 'string' || src[to] !== undefined) return;   // 새 키가 이미 있으면 새 키가 이긴다
      if (v.toLowerCase() === render.LEGACY_DEFAULTS[k]) return;    // 옛 기본값 그대로 = 고른 색 아님
      out[to] = v;
    });
    return out;
  };

  render.currentTheme = function () {
    return Object.assign({}, render.DEFAULT_THEME, render.migrateTheme(store.loadTheme()));
  };

  render.INACTIVE_FILL = '#c3cad9';   // 준비중 지역 — 진한 라벨이 읽히도록 밝은 중립색

  // 저장된 테마를 팔레트 객체와 CSS 변수에 반영. app.init 1회 + 설정 저장 시마다 호출.
  render.applyTheme = function () {
    const t = render.currentTheme();
    render.MAP_KEYS.forEach(function (k) { render.MAP_COLORS[k] = t[k]; });
    if (typeof document !== 'undefined' && document.documentElement) {
      const s = document.documentElement.style;
      s.setProperty('--accent-color', t.accent);
      s.setProperty('--ripple-duration', t.rippleDuration + 's');
    }
    render.drawLegend();   // 색을 바꾸면 범례도 같이 바뀌어야 한다
    return t;
  };

  // 범례를 실제 테마 색으로 그린다. 이전엔 🔴🟠🟡 이모지가 하드코딩돼 있어
  // 색을 바꿔도 범례만 옛 색으로 남는 문제가 있었다.
  // 용어 통일(규격 §6): 6개월 안 / 6~12개월 / 1~2년 / 2년 넘음 / 날짜 미상 / 추정.
  render.LEGEND_ITEMS = [
    ['r3','6개월 안 위주'], ['r2','1년 안 위주'], ['p','섞임 (1년 안 포함)'],
    ['b2','1~2년 위주'], ['b3','2년 넘음 위주'], ['gray','날짜 미상'],
  ];
  render.MIX_NAME = { r3:'진빨강', r2:'빨강', p:'보라', b2:'파랑', b3:'진파랑', gray:'날짜 미상', none:'기관 없음' };
  // 색은 localStorage(테마)에서 오므로 style 속성에 그대로 끼우지 않고 hex만 통과시킨다.
  render._safeColor = function (c, fallback) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? String(c) : fallback;
  };
  render.drawLegend = function () {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('legend'); if (!el) return;
    // 라벨 글자도 해당 등락색으로 — 범례 스스로 색 의미론을 말한다(마감 리뷰 반영).
    // 딥톤 면색 그대로는 작은 글자가 어두워서, 글자용으로만 흰색을 30% 섞어 밝힌다.
    const rows = render.LEGEND_ITEMS.map(function (it) {
      const c = render._safeColor(render.MAP_COLORS[it[0]], render.DEFAULT_THEME[it[0]]);
      const warn = it[0] === 'gray' ? ' ' + render.ICONS.warn : '';
      return '<span class="lg-item" style="color:color-mix(in srgb, ' + c + ' 70%, #ffffff)">' +
        '<i class="lg-sw" style="background:' + c + '"></i>' + logic.esc(it[1]) + warn + '</span>';
    });
    rows.push('<span class="lg-item"><i class="lg-sw lg-hatch" style="background:' +
      render._safeColor(render.INACTIVE_FILL, '#c3cad9') + '"></i>준비중</span>');
    rows.push('<span class="lg-item lg-tri-row"><b class="lg-tri" aria-hidden="true">▲3</b>6개월 안 기관 수 (속 빈 △는 추정)</span>');
    el.innerHTML = '<div class="lg-title">입찰 임박도 · 지역 색 섞기</div>' + rows.join('');
  };
  render.applyTheme();

  render.baseInstitutions = function () { return store.loadData() || window.institutions || []; };
  render.allInstitutions = function () { return store.applyEdits(render.baseInstitutions()); };
  render.institutionsByRegion = function (code) {
    return render.allInstitutions().filter(function (r) { return r.region === code; });
  };

  // ── 지역 색 섞기(NEXT 78, C안) ─────────────────────────────────────────────────
  // 켠 종류의 기관을 모두 섞는다. '켠 종류' 판단은 랭킹과 같은 _rankTypeVisible(지자체는 항상 포함 —
  // 끄면 면을 지우지 않고 흐리게만 한다는 기존 규칙). 같은 기관이 일반구 폴리곤마다 반복 등록되므로
  // 기관 단위로 중복을 먼저 뺀다(수원 4구 등이 건수를 부풀리지 않게).
  render.mixInfo = function (list) {
    return logic.regionMix(logic.dedupeByInstitution(list), render.state.today);
  };
  render.regionMixInfo = function (code) {
    return render.mixInfo(render.institutionsByRegion(code).filter(function (r) { return render._rankTypeVisible(r); }));
  };
  // 섞기 결과 → 면 색. 기관 0곳('none')과 날짜 미상('gray')은 둘 다 회색(규격 §4 P2는 보류).
  render.mixColor = function (info) {
    const k = (info && render.MAP_COLORS[info.band] !== undefined && info.band !== 'none') ? info.band : 'gray';
    return render._safeColor(render.MAP_COLORS[k], render.DEFAULT_THEME[k]);
  };
  render.regionUrgencyColor = function (code) {
    return render.mixColor(render.regionMixInfo(code));
  };

  // 도넛(경기)·군도(인천)라 면적가중 중심이 엉뚱한 곳에 찍히는 지역만 앵커를 직접 지정.
  // 나머지는 path.centroid를 그대로 쓰고, 남는 겹침은 _separateLabels가 자동으로 민다.
  render.LABEL_ANCHOR = {
    '41': [127.45, 37.35],   // 경기: 서울을 감싸 중심이 서울 위로 올라옴 → 동쪽 두꺼운 쪽
    '28': [126.60, 37.45],   // 인천: 서해 섬들이 중심을 바다로 끌어당김 → 본토 쪽
  };
  render.labelAnchor = function (feature, path, proj) {
    const a = render.LABEL_ANCHOR[feature.properties.code];
    return a ? proj(a) : path.centroid(feature);
  };

  // 라벨을 다 그린 뒤 실제 bbox로 겹침을 찾아 세로로 밀어낸다(계산은 logic.separateLabelsY).
  render._separateLabels = function (labels) {
    const nodes = labels.nodes();
    if (!nodes.length) return;
    const boxes = nodes.map(function (n) {
      const b = n.getBBox();
      return { x: Number(n.getAttribute('data-x')), y: Number(n.getAttribute('data-y')),
               w: b.width, h: b.height };
    });
    const dy = logic.separateLabelsY(boxes, 2, 3);
    nodes.forEach(function (n, i) {
      if (!dy[i]) return;
      n.setAttribute('transform', 'translate(' + boxes[i].x + ',' + (boxes[i].y + dy[i]) + ')');
    });
  };

  // 드릴인 연출: 선택 지역만 남기고 나머지 면·라벨을 흐리게.
  // drawNational이 opacity를 인라인 style로 주므로 클래스로는 못 이긴다 — 같은 인라인을 덮어쓴다.
  render.focusRegion = function (code) {
    const svg = d3.select('#map-svg');
    svg.selectAll('path.region').style('opacity', function (d) {
      return d.properties.code === code ? 1 : 0.15;
    });
    svg.selectAll('text.label').style('opacity', function (d) {
      return d.properties.code === code ? 1 : 0.15;
    });
  };

  render.ZOOM_MS = 750;   // flyZoomTo transition 길이
  render.HOLD_MS = 200;   // 확대가 끝난 뒤 "살짝 멈춤" — 이후 상세 지도로 전환

  render.drawNational = function () {
    var rp = document.getElementById('rank-panel'); if (rp) rp.style.display='none';
    // 경과 패널 배치(도킹/덮개/위 쌓기)를 폭을 재기 전에 확정한다 — 패널이 나중에 나타나거나
    // 사라지면 지도가 옛 폭으로 그려져 잘리거나 한쪽으로 쏠린다.
    if (root.overdue && root.overdue.syncLayout) root.overdue.syncLayout();
    const svg = d3.select('#map-svg');
    svg.selectAll('*').remove();
    render._ensureDefs(svg);   // 준비중 지역 빗금(#hatch)용 — 이전엔 지역 뷰에서만 호출됐다
    const node = svg.node(); const w = node.clientWidth || 900, h = node.clientHeight || 600;
    const fc = window.geoKorea;
    const proj = d3.geoMercator().fitSize([w, h], fc);
    const path = d3.geoPath(proj);
    const g = svg.append('g').attr('class', 'national-layer');
    render.hideRegionTip();
    render._kbDrill = false;   // 전국으로 돌아왔다 — 못 끝난 키보드 드릴인 표식을 버린다
    // 시도별 섞기 결과는 면 색·▲n·툴팁·aria가 함께 쓰므로 한 번만 계산한다.
    const mix = {};
    fc.features.forEach(function (d) {
      const code = d.properties.code;
      if (render.state.activeRegions.has(code)) mix[code] = render.regionMixInfo(code);
    });

    const regionPaths = g.selectAll('path.region').data(fc.features).join('path')
      .attr('class', 'region').attr('d', path)
      .attr('data-code', function (d){ return d.properties.code; })
      .attr('fill', function (d) {
        const code = d.properties.code;
        // 준비중은 밝은 중립색 — 균일한 진한 라벨이 읽히려면 면이 밝아야 한다.
        return mix[code] ? render.mixColor(mix[code]) : render.INACTIVE_FILL;
      })
      // 키보드·스크린리더: 눌러서 들어갈 수 있는 지역(경계가 있음)만 Tab으로 닿고 button(Enter·Space=드릴인).
      // 경계가 없는 지역(세종·제주)은 눌러도 아무 일이 없으므로 tabindex를 주지 않는다(이름은 aria-label로 남는다).
      .attr('tabindex', function (d) { return mix[d.properties.code] && render.hasSubGeo(d.properties.code) ? 0 : null; })
      .attr('role', function (d) {
        return mix[d.properties.code] ? (render.hasSubGeo(d.properties.code) ? 'button' : 'img') : null;
      })
      .attr('aria-label', function (d) {
        const m = mix[d.properties.code];
        return m ? render.mixAriaLabel(d.properties.name, m) : d.properties.name + ', 준비중';
      })
      .attr('stroke', '#07090e').attr('stroke-width', 1)
      // 커서·클릭은 activeRegions가 아니라 hasSubGeo로 판단한다(위 주석 참조).
      .style('cursor', function (d){ return render.hasSubGeo(d.properties.code) ? 'pointer' : 'default'; })
      .style('opacity', 1)
      .on('click', function (ev, d) {
        if (!render.hasSubGeo(d.properties.code)) return;
        if (root.app && root.app.enterRegion) root.app.enterRegion(d.properties.code);
      });
    // 지역 툴팁(마우스 올림·포커스) + Enter 드릴인. 준비중 지역은 툴팁이 없다.
    render.bindRegionTip(regionPaths.filter(function (d) { return !!mix[d.properties.code]; }),
      function (d) { return render.tipHtml(d.properties.name, mix[d.properties.code], render.state.today); },
      function (ev, d) {
        if (!render.hasSubGeo(d.properties.code)) return;
        render._kbDrill = true;   // 새 화면이 그려지면 포커스를 옮긴다(drawRegion 끝)
        if (root.app && root.app.enterRegion) root.app.enterRegion(d.properties.code);
      });

    // 준비중 지역엔 빗금을 덧씌워 임박도 '미상'(평평한 회색)과 확실히 구분한다.
    g.selectAll('path.region-hatch')
      .data(fc.features.filter(function (d){ return !render.state.activeRegions.has(d.properties.code); }))
      .join('path')
      .attr('class', 'region-hatch').attr('d', path)
      .attr('fill', 'url(#hatch)').style('pointer-events', 'none').style('opacity', 0.35);

    // 라벨: 지역명 한 줄 + (비활성일 때) 작은 '준비중' 둘째 줄.
    // 색은 CSS(.label)가 균일하게 정한다 — 지역마다 색을 달리하면 난잡해진다.
    const labels = g.selectAll('text.label').data(fc.features).join('text')
      .attr('class', 'label')
      .attr('data-code', function (d){ return d.properties.code; })
      .attr('text-anchor', 'middle')
      .style('pointer-events', 'none');  // 라벨이 폴리곤 클릭을 가로채지 않도록
    labels.each(function (d) {
      const t = d3.select(this);
      t.selectAll('*').remove();
      const p = render.labelAnchor(d, path, proj);
      t.attr('data-x', p[0]).attr('data-y', p[1])
        .attr('transform', 'translate(' + p[0] + ',' + p[1] + ')');
      const active = render.state.activeRegions.has(d.properties.code);
      t.append('tspan').attr('x', 0).attr('dy', active ? '0.35em' : '0em').text(d.properties.name);
      // ▲n: 6개월 안 기관 수(모두 추정이면 속 빈 △). 글자(tspan)로 그려 후광·겹침 이동이 라벨과 함께 간다.
      const mark = active ? logic.urgentMark(mix[d.properties.code]) : '';
      if (mark) t.append('tspan').attr('class', 'tri').attr('dx', 4).text(mark);
      if (!active) t.append('tspan').attr('class', 'sub').attr('x', 0).attr('dy', '1.15em').text('준비중');
    });
    render._separateLabels(labels);

    render.state.currentRegion = null;
    render._nationalProjection = proj; render._nationalG = g;

    // A1: 전국 지도 자유 팬/줌(스펙 ⑦-A). 휠 확대·축소 + 드래그 팬.
    render._zoom = d3.zoom().scaleExtent([1, 8]).on('zoom', function (e) { g.attr('transform', e.transform); });
    svg.call(render._zoom);
    // drawNational 재호출(init/전국복귀) 시 내부 transform을 identity로 재동기화 —
    // 이전 flyZoomTo 잔존 transform이 새 레이어와 어긋나지 않게 보장(A4).
    svg.call(render._zoom.transform, d3.zoomIdentity);
  };

  // A2: 대상 시도 bounds로 750ms 지오메트릭 줌인("붕 떴다 내려앉는") — 순수 시각 연출.
  // 지역 뷰 전환 타이밍은 호출부(app.enterRegion)가 자체 타이머로 확정하므로,
  // 여기서는 transition 완료 콜백에 의존하지 않는다.
  render.flyZoomTo = function (feature) {
    const svg = d3.select('#map-svg');
    const proj = render._nationalProjection;
    if (!proj || !render._nationalG || !render._zoom) return;
    const path = d3.geoPath(proj);
    const node = svg.node(); const w = node.clientWidth || 900, h = node.clientHeight || 600;
    const b = path.bounds(feature);
    const dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1];
    const cx = (b[0][0] + b[1][0]) / 2, cy = (b[0][1] + b[1][1]) / 2;
    let k = 0.9 / Math.max(dx / w, dy / h);
    if (!isFinite(k) || k < 1) k = 1;
    k = Math.min(k, 8); // scaleExtent 최댓값 이내로 클램프
    const tx = w / 2 - k * cx, ty = h / 2 - k * cy;
    svg.transition().duration(750)
      .call(render._zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  };

  render.REGION_GEO = { '11': function(){ return window.geoSeoul; }, '41': function(){ return window.geoGyeonggi; },
    '26': function(){ return window.geoBusan; }, '28': function(){ return window.geoIncheon; },
    '27': function(){ return window.geoDaegu; }, '30': function(){ return window.geoDaejeon; },
    '31': function(){ return window.geoUlsan; }, '42': function(){ return window.geoGangwon; },
    '43': function(){ return window.geoChungbuk; }, '44': function(){ return window.geoChungnam; },
    '45': function(){ return window.geoJeonbuk; }, '46': function(){ return window.geoJnGwangju; },
    '47': function(){ return window.geoGyeongbuk; }, '48': function(){ return window.geoGyeongnam; } };
  // '29'(광주)는 2026-07-01 전남광주통합특별시 출범으로 '46'에 병합됐다(geo/korea.js도 병합).
  render.REGION_NAME = { '11':'서울', '26':'부산', '27':'대구', '28':'인천',
    '30':'대전', '31':'울산', '36':'세종', '41':'경기', '42':'강원', '43':'충북',
    '44':'충남', '45':'전북', '46':'전남광주', '47':'경북', '48':'경남', '50':'제주' };

  // **면 색칠(activeRegions)과 드릴인 가능 여부는 다른 것이다.** v1에서는 활성 지역이
  // 서울·경기 둘뿐이라 우연히 일치했지만, 전국 확대(v2) 이후로는 17개 시·도가 전부
  // 색은 칠해지되 구/시군 경계 GeoJSON은 여전히 서울·경기에만 있다. 이 둘을 계속
  // 같은 조건으로 묶으면 나머지 15곳이 "눌리는데 오류 배너만 뜨는" 막다른 길이 된다.
  render.hasSubGeo = function (code) { return !!render.REGION_GEO[code]; };

  // 구/시군 면 하나에 해당하는 지자체 레코드들. subRegion 코드가 1순위,
  // 없으면 기관명↔폴리곤명 정규화 매칭('마포구청'→'마포구')으로 보완한다.
  render.municipalityForFeature = function (feature) {
    if (!feature || !feature.properties) return [];
    const muni = render.institutionsByRegion(render.state.currentRegion)
      .filter(function (r) { return r.type === '지자체'; });
    const code = feature.properties.code, name = feature.properties.name;
    const byCode = muni.filter(function (r) { return r.subRegion && r.subRegion === code; });
    if (byCode.length) return byCode;
    return muni.filter(function (r) { return logic.normalizeMuniName(r.name) === name; });
  };

  // 면 하나에 지자체 레코드가 여럿 걸릴 수 있다(같은 이름의 중복 레코드 등).
  // **면의 색을 정하는 레코드와 면을 눌렀을 때 잡히는 레코드는 같아야 한다** —
  // 다르면 색과 다른 기관이 선택돼 지도를 믿을 수 없게 된다. 그래서 두 곳이
  // 각자 정렬하지 않고 이 함수 하나를 공유한다.
  // 면 하나를 섞는 기관들: 지자체(municipalityForFeature) + 켠 다른 종류 중 구시군코드가 이 면인 기관.
  render.recordsForFeature = function (feature) {
    const hit = render.municipalityForFeature(feature);
    const code = feature && feature.properties && feature.properties.code;
    let extra = [];
    if (code && render.state.currentRegion) {
      extra = render.institutionsByRegion(render.state.currentRegion).filter(function (r) {
        return r.type !== '지자체' && r.subRegion === code && render._rankTypeVisible(r);
      });
    }
    return logic.dedupeByInstitution(hit.concat(extra));
  };
  render.featureMixInfo = function (feature) {
    return logic.regionMix(render.recordsForFeature(feature), render.state.today);
  };

  // 섞기 기준의 '가장 임박' 기관 — 툴팁·▲가 가리키는 기관(logic.mostImminent). 날짜가 전부 없으면 null.
  render.imminentForFeature = function (feature) {
    return logic.mostImminent(render.recordsForFeature(feature), render.state.today);
  };

  // **클릭으로 잡히는 기관**은 섞기와 별개다(팀 결정 2026-11-11, 사용자 확정 ⓐ안): 그 구의 지자체가
  // 먼저, 지자체가 없으면 섞기 기준 가장 임박 기관. 날짜가 전부 없으면 첫 기관 — 눌러서 고를 수는 있다.
  render.recordForFeature = function (feature) {
    const muni = logic.dedupeByInstitution(render.municipalityForFeature(feature));
    if (muni.length) return logic.mostImminent(muni, render.state.today) || muni[0];
    const hit = render.recordsForFeature(feature);
    if (!hit.length) return null;
    return logic.mostImminent(hit, render.state.today) || hit[0];
  };

  render.subUrgencyColor = function (feature) {
    return render.mixColor(render.featureMixInfo(feature));
  };

  // 스크린리더용 이름: "서울, 보라, 6개월 안 1곳, 기관 30곳"
  render.mixAriaLabel = function (name, info) {
    const parts = [name, render.MIX_NAME[info.band] || render.MIX_NAME.none];
    if (info.urgent > 0) parts.push('6개월 안 ' + info.urgent + '곳' + (info.urgentAllEst ? '(모두 추정)' : ''));
    parts.push('기관 ' + info.total + '곳');
    return parts.join(', ');
  };

  // 지역 툴팁 문안(마우스 올림·포커스). 규격 §6. 클릭 동작과는 무관하다.
  render.tipHtml = function (name, info, today) {
    const c = render.mixColor(info);
    let h = '<div class="rt-head"><b>' + esc(name) + '</b><i class="rt-sw" style="background:' + c + '"></i></div>';
    if (!info.total) return h + '<div class="rt-mu">켠 종류의 기관이 없습니다</div>';
    const im = info.imminent;
    if (im) {
      const est = logic.effectiveBid(im).confidence === '추측' ? ' (추정)' : '';
      h += '<div class="rt-row">가장 임박 ' + esc(im.name || '') + (im.type ? ' · ' + esc(im.type) : '') +
        ' <span class="rt-d">' + esc(logic.formatDDay(im, today)) + est + '</span></div>' +
        '<div class="rt-row rt-m">6개월 안 ' + info.within6 + ' · 6~12개월 ' + info.to12 +
        ' · 1~2년 ' + info.to24 + ' · 2년 넘음 ' + info.over24 + '</div>';
    } else {
      h += '<div class="rt-row">날짜가 있는 기관이 없습니다</div>';
    }
    h += '<div class="rt-mu">' + (info.unknown
      ? '기관 ' + info.total + '곳 중 날짜 미상 ' + info.unknown + '곳은 색에 넣지 않음'
      : '기관 ' + info.total + '곳') + '</div>';
    return h;
  };
  render.showRegionTip = function (html, x, y) {
    if (typeof document === 'undefined') return;
    let tip = document.getElementById('region-tip');
    if (!tip) {
      tip = document.createElement('div'); tip.id = 'region-tip'; tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    tip.innerHTML = html; tip.style.display = 'block';
    render.moveRegionTip(x, y);
  };
  render.moveRegionTip = function (x, y) {
    const tip = typeof document !== 'undefined' && document.getElementById('region-tip');
    if (!tip || tip.style.display !== 'block') return;
    tip.style.left = Math.max(8, Math.min(x + 14, window.innerWidth - tip.offsetWidth - 8)) + 'px';
    tip.style.top = Math.max(8, Math.min(y + 14, window.innerHeight - tip.offsetHeight - 8)) + 'px';
  };
  render.hideRegionTip = function () {
    const tip = typeof document !== 'undefined' && document.getElementById('region-tip');
    if (tip) tip.style.display = 'none';
  };
  render.isActivateKey = function (ev) { return !!ev && (ev.key === 'Enter' || ev.key === ' '); };
  // 면의 키 처리: Enter·Space가 클릭과 같은 동작. Space의 페이지 스크롤은 막고, 키를 누르고 있어도(repeat) 한 번만.
  // 동작했으면 true.
  render.regionKey = function (ev, d, enterFn) {
    if (!render.isActivateKey(ev) || !enterFn) return false;
    ev.preventDefault();
    if (ev.repeat) return false;
    render.hideRegionTip();
    enterFn(ev, d);
    return true;
  };
  // 면(path)에 툴팁·키보드 접근을 붙인다. htmlFn(d) → 문안, enterFn(ev, d) → Enter 동작(없으면 키 처리 안 함).
  render.bindRegionTip = function (sel, htmlFn, enterFn) {
    sel.on('mouseenter', function (ev, d) { render.showRegionTip(htmlFn(d), ev.clientX, ev.clientY); })
      .on('mousemove', function (ev) { render.moveRegionTip(ev.clientX, ev.clientY); })
      .on('mouseleave', function () { render.hideRegionTip(); })
      .on('focus', function (ev, d) {
        const r = this.getBoundingClientRect();
        render.showRegionTip(htmlFn(d), r.left + r.width / 2, r.top + r.height / 2);
      })
      .on('blur', function () { render.hideRegionTip(); })
      .on('keydown', function (ev, d) { render.regionKey(ev, d, enterFn); });
  };

  // 지자체 체크박스 OFF → 면 색은 유지하고 흐리게(정보를 지우지 않고 뒤로 물림).
  render.muniDimOpacity = function () {
    return render.state.enabledTypes.has('지자체') ? 1 : 0.25;
  };
  render.applyMuniDimming = function () {
    // 전체 재렌더 대신 투명도만 갱신 — 재렌더하면 선택 중이던 강조가 사라진다.
    d3.select('#map-svg').selectAll('path.subregion').attr('fill-opacity', render.muniDimOpacity());
    d3.select('#map-svg').selectAll('g.sub-glyph').attr('opacity', render.muniDimOpacity());
    d3.select('#map-svg').selectAll('text.sub-urgent').attr('opacity', render.muniDimOpacity());
  };

  render.drawRegion = function (code) {
    var b = document.getElementById('geo-retry-banner'); if (b) b.remove();
    // 랭킹 패널을 먼저 펼쳐 레이아웃을 확정한 뒤 폭을 잰다 — 그렇지 않으면
    // 패널이 나중에 열리며 SVG가 줄어들어 지도가 확대·좌측 쏠림으로 그려진다.
    var rp0 = document.getElementById('rank-panel'); if (rp0) rp0.style.display = 'block';
    // 드릴인 중에는 도킹된 경과 패널을 접어(덮개 서랍으로) 랭킹 패널과 3열이 되지 않게 한다.
    if (root.overdue && root.overdue.syncLayout) root.overdue.syncLayout();
    const svg = d3.select('#map-svg'); svg.selectAll('*').remove();
    const node = svg.node(); const w = node.clientWidth || 900, h = node.clientHeight || 600;
    const fc = (render.REGION_GEO[code] || function(){ return {type:'FeatureCollection',features:[]}; })();
    const proj = d3.geoMercator().fitSize([w, h], fc);
    const path = d3.geoPath(proj);
    render.state.currentRegion = code;
    const g = svg.append('g').attr('class', 'region-layer');
    render.hideRegionTip();
    const subMix = {};
    fc.features.forEach(function (d) { subMix[d.properties.code] = render.featureMixInfo(d); });
    const subPaths = g.selectAll('path.subregion').data(fc.features).join('path')
      .attr('class', 'subregion').attr('d', path)
      .attr('data-code', function (d){ return d.properties.code; })  // 선택 강조 대상 조회용
      .attr('fill', function (d){ return render.mixColor(subMix[d.properties.code]); })
      // 기관이 걸린 면만 Tab으로 닿고 Enter로 고른다(클릭과 같은 동작).
      .attr('tabindex', function (d) { return subMix[d.properties.code].total ? 0 : null; })
      .attr('role', function (d) { return subMix[d.properties.code].total ? 'button' : null; })
      .attr('aria-label', function (d) { return render.mixAriaLabel(d.properties.name, subMix[d.properties.code]); })
      .attr('fill-opacity', render.muniDimOpacity())
      .attr('stroke', '#07090e').attr('stroke-width', 1)
      // 지자체는 좌표가 없어 마커가 그려지지 않으므로(_blinkMunicipality 주석 참조)
      // **이 면이 유일한 클릭 대상**인데 여태 핸들러가 없었다 — 눌러도 아무 일이
      // 없었고, 카드→지도 방향만 동작했다.
      .style('cursor', function (d) {
        return render.municipalityForFeature(d).length ? 'pointer' : 'default';
      })
      .on('click', function (ev, d) { render.onSubregionClick(d, ev); });
    render.bindRegionTip(subPaths.filter(function (d) { return subMix[d.properties.code].total > 0; }),
      function (d) { return render.tipHtml(d.properties.name, subMix[d.properties.code], render.state.today); },
      function (ev, d) { render.onSubregionClick(d, ev); });
    // ▲n — 6개월 안 기관이 있는 면에만. 시군구에는 이름 라벨이 없어 ▲n만 면 가운데에 둔다.
    g.selectAll('text.label.sub-urgent')
      .data(fc.features.filter(function (d) { return logic.urgentMark(subMix[d.properties.code]) !== ''; }))
      .join('text').attr('class', 'label sub-urgent').attr('text-anchor', 'middle')
      .attr('pointer-events', 'none').attr('opacity', render.muniDimOpacity())
      .attr('transform', function (d) { const p = path.centroid(d); return 'translate(' + p[0] + ',' + p[1] + ')'; })
      .append('tspan').attr('class', 'tri').attr('dy', '0.35em')
      .text(function (d) { return logic.urgentMark(subMix[d.properties.code]); });
    // 날짜 미상 면 글리프 — 마커·랭킹 카드의 recordGlyph('⚠️')와 같은 시각 언어를 면에도 확장.
    // 레코드가 아예 없는 면은 대상이 아니다(표시할 기관 자체가 없으므로 회색만 유지).
    // 이모지 대신 필터 글리프(.fsw)와 같은 획 어휘의 삼각 경고를 직접 그린다(마감 리뷰 반영).
    // ⚠는 섞기 결과와 같은 판정: 기관이 걸렸는데 날짜 있는 기관이 0곳일 때(면이 회색일 때)만.
    const gw = g.selectAll('g.sub-glyph')
      .data(fc.features.filter(function (d) { return subMix[d.properties.code].band === 'gray'; }))
      .join('g').attr('class', 'sub-glyph')
      .attr('transform', function (d) {
        const p = path.centroid(d); return 'translate(' + p[0] + ',' + p[1] + ')';
      })
      .attr('opacity', render.muniDimOpacity())
      .attr('pointer-events', 'none');   // 클릭은 아래 폴리곤이 받아야 한다
    gw.selectAll('*').remove();
    gw.append('path').attr('d', 'M0,-4.5 L4.5,3.5 L-4.5,3.5 Z')
      .attr('fill', 'none').attr('stroke', '#ffcf5e')
      .attr('stroke-width', 1.3).attr('stroke-linejoin', 'round');
    gw.append('line').attr('x1', 0).attr('y1', -2).attr('x2', 0).attr('y2', 0.6)
      .attr('stroke', '#ffcf5e').attr('stroke-width', 1.3);
    gw.append('circle').attr('cx', 0).attr('cy', 2.1).attr('r', 0.7).attr('fill', '#ffcf5e');
    render._regionProjection = proj; render._regionPath = path; render._regionG = g;
    if (render.drawMarkers) render.drawMarkers(code); // Task 9
    render.drawRankingPanel(code);
    render.clearSelection();
    // 키보드(Enter·Space)로 들어왔으면 포커스를 새 화면의 첫 면으로 — 눌렀던 면은 이미 사라졌다.
    if (render._kbDrill) {
      render._kbDrill = false;
      const first = document.querySelector('#map-svg path.subregion[tabindex]');
      if (first && first.focus) first.focus();
    }
  };

  render.loadRegionGeoWithRetry = function (code, done, fail) {
    const getGeo = render.REGION_GEO[code]; const name = render.REGION_NAME[code] || code;
    const overlay = document.getElementById('cloud-overlay');
    function attempt(n) {
      const fc = getGeo && getGeo();
      if (fc && fc.features && fc.features.length) { done(fc); return; }
      const stage = document.getElementById('map-stage');
      const msg = n === 0 ? (name + '지역을 불러오는 중입니다…') : '준비중…';
      let banner = document.getElementById('geo-retry-banner');
      if (!banner) { banner = document.createElement('div'); banner.id = 'geo-retry-banner';
        banner.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#e2e7ee;'; stage.appendChild(banner); }
      banner.textContent = msg;
      if (n < 2) { setTimeout(function(){ attempt(n + 1); }, 600); }
      else {
        banner.innerHTML = name + '지역 정보를 다시 확인해주세요. <button id="geo-retry-btn">다시 시도</button>';
        document.getElementById('geo-retry-btn').onclick = function () { banner.remove(); render.loadRegionGeoWithRetry(code, done, fail); };
        if (fail) fail();
      }
    }
    attempt(0);
  };

  render._ensureDefs = function (svg) {
    if (svg.select('#hatch').size()) return;
    const p = svg.append('defs').append('pattern').attr('id','hatch')
      .attr('width',4).attr('height',4).attr('patternUnits','userSpaceOnUse')
      .attr('patternTransform','rotate(45)');
    p.append('rect').attr('width',4).attr('height',4).attr('fill','transparent');
    p.append('line').attr('x1',0).attr('y1',0).attr('x2',0).attr('y2',4).attr('stroke','#0f1420').attr('stroke-width',2);
  };

  render._shapePath = function (shape, s) { // s=반지름/반폭
    if (shape === 'square') return 'M' + (-s) + ',' + (-s) + ' h' + (2*s) + ' v' + (2*s) + ' h' + (-2*s) + ' Z';
    if (shape === 'triangle') return 'M0,' + (-s) + ' L' + s + ',' + s + ' L' + (-s) + ',' + s + ' Z';
    if (shape === 'diamond') return 'M0,' + (-s) + ' L' + s + ',0 L0,' + s + ' L' + (-s) + ',0 Z';
    if (shape === 'pentagon') { // 대학교 — 기존 4종과 겹치지 않는 정오각형
      const pts = [];
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
        pts.push((s * Math.cos(a)).toFixed(2) + ',' + (s * Math.sin(a)).toFixed(2));
      }
      return 'M' + pts.join(' L') + ' Z';
    }
    return ''; // circle은 <circle>로 별도
  };

  render.drawMarkers = function (code) {
    const svg = d3.select('#map-svg'); render._ensureDefs(svg);
    const proj = render._regionProjection; if (!proj) return;
    const list = render.institutionsByRegion(code);
    const markers = logic.visibleMarkers(list, render.state.enabledTypes)
      .filter(function (r){ return typeof r.lng === 'number' && !isNaN(r.lng) && typeof r.lat === 'number' && !isNaN(r.lat); });

    let layer = svg.select('g.marker-layer');
    if (!layer.size()) layer = svg.append('g').attr('class','marker-layer');
    layer.selectAll('*').remove();

    // 밀집 클러스터: 동일 좌표 반올림 셀에 8개+면 뱃지
    const cells = {};
    markers.forEach(function (r){ const p = proj([r.lng, r.lat]); const key = Math.round(p[0]/24)+'_'+Math.round(p[1]/24);
      (cells[key] = cells[key] || []).push({ r:r, p:p }); });

    Object.keys(cells).forEach(function (key) {
      const grp = cells[key];
      if (grp.length >= 8) {
        const p = grp[0].p;
        const g = layer.append('g').attr('class','cluster').attr('transform','translate('+p[0]+','+p[1]+')');
        // 두 월드 전 잔재색 재도색(2026-08-14) — 현행 토큰(panel-raised/ink)으로.
        g.append('circle').attr('r',14).attr('fill','#1a2029').attr('stroke','#e2e7ee');
        g.append('text').attr('text-anchor','middle').attr('dy','0.35em').attr('fill','#e2e7ee').attr('font-size',12).text(grp.length);
        return;
      }
      grp.forEach(function (item) {
        const r = item.r, p = item.p, shape = logic.markerShape(r.type);
        const color = render.markerColor(logic.urgencyOf(r, render.state.today));
        const glyph = logic.recordGlyph(r);
        const g = layer.append('g').attr('class','marker').attr('data-name', r.name).attr('transform','translate('+p[0]+','+p[1]+')');
        const hatched = logic.effectiveBid(r).confidence === '추측';
        if (shape === 'circle') {
          g.append('circle').attr('r',8).attr('fill',color).attr('stroke','#0f1420');
          if (hatched) g.append('circle').attr('r',8).attr('fill','url(#hatch)');
        } else {
          g.append('path').attr('d', render._shapePath(shape,8)).attr('fill',color).attr('stroke','#0f1420');
          if (hatched) g.append('path').attr('d', render._shapePath(shape,8)).attr('fill','url(#hatch)');
        }
        if (glyph === '!') {
          g.append('text').attr('text-anchor','middle').attr('dy','0.35em')
            .attr('fill','#fff').attr('font-weight','bold').attr('font-size',10).text(glyph);
        } else if (glyph) {  // '⚠️'(날짜 미상) — 이모지 대신 획 어휘로 그린 경고 삼각
          g.append('path').attr('d','M0,-3.8 L3.8,3 L-3.8,3 Z')
            .attr('fill','none').attr('stroke','#10151d')
            .attr('stroke-width',1.2).attr('stroke-linejoin','round');
          g.append('line').attr('x1',0).attr('y1',-1.7).attr('x2',0).attr('y2',0.5)
            .attr('stroke','#10151d').attr('stroke-width',1.2);
          g.append('circle').attr('cx',0).attr('cy',1.9).attr('r',0.6).attr('fill','#10151d');
        }
        g.style('cursor','pointer').on('click', function () { if (render.onMarkerClick) render.onMarkerClick(r); });
        if (glyph === '!') console.warn('무결성 문제 레코드:', r.name, logic.validateRecord(r).missing);
      });
    });
  };

  render.drawTicker = function () {
    const all = render.allInstitutions().filter(function (r){ return render.state.activeRegions.has(r.region); });
    // 시-단위 중복제거 — 일반구 폴리곤 레코드(수원 4구 등)가 TOP5를 채우지 않게.
    // 이미 예정일이 지난(D<0) 건은 '임박'이 아니라 경과라 뺀다 — 경과는 경과 패널이 맡는다.
    // 날짜 미상(Infinity)은 예전처럼 맨 뒤에 남는다.
    const upcoming = all.filter(function (r) {
      return logic.daysUntil(logic.effectiveBid(r).date, render.state.today) >= 0;
    });
    const top = logic.dedupeByInstitution(logic.sortByUrgency(upcoming, render.state.today)).slice(0, 5);
    const el = document.getElementById('ticker'); if (!el) return;
    // 항목마다 임박도 색을 입힌다 — 티커 자체가 등락을 말해야 한다(마감 리뷰 반영).
    // ▲는 6개월 이내(상승 = 임박, D>=0)에만 붙는 시세 표기. 색은 hex 화이트리스트 통과분만.
    el.innerHTML = '<span class="tk-cap">임박 TOP5</span>' + top.map(function (r) {
      const band = logic.urgencyOf(r, render.state.today);
      const c = render._safeColor(render.URGENCY_COLORS[band], render.LEGACY_DEFAULTS[band]);
      const mark = band === 'red' ? render.ICONS.up + ' ' : '';
      return '<span style="color:color-mix(in srgb, ' + c + ' 72%, #ffffff)">' + mark +
        logic.esc(r.name) + ' ' + logic.esc(logic.formatDDay(r, render.state.today)) + '</span>';
    }).join('<span class="tk-sep">·</span>') +
      '<span class="tk-sync" title="기준일 시점의 값입니다">기준 ' + logic.localDateStr(render.state.today) + '</span>';
    render._rollTicker();
    // 경과 건수는 같은 데이터에서 나오므로 티커를 다시 그릴 때(데이터가 바뀔 때마다) 함께 갱신한다.
    if (root.overdue && root.overdue.refresh) root.overdue.refresh();
  };

  // "최신화되는 듯한" 표현 — 값을 새로 가져오는 것이 아니라 **기준일 고정값을 다시 그리는 연출**이다
  // (그래서 '기준 YYYY-MM-DD' 라벨을 남긴다). 시계 분·초가 넘어가듯, 맨 왼쪽 항목부터 차례로
  // 아래로 굴러 내려가 사라지고 위에서 새 값이 내려와 앉는다. 모션 줄이기 설정이면 하지 않는다.
  render.TICKER_ROLL_MS = 10000;
  let tickerTimer = null;

  render._rollTicker = function () {
    const el = document.getElementById('ticker'); if (!el) return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.querySelectorAll(':scope > span:not(.tk-cap):not(.tk-sep):not(.tk-sync)').forEach(function (item, i) {
      item.classList.remove('tk-roll');
      void item.offsetWidth;                       // 같은 클래스를 다시 걸어도 애니메이션이 재시작되게
      item.style.animationDelay = (i * 0.16) + 's';
      item.classList.add('tk-roll');
    });
  };

  render.startTickerSync = function () {
    if (tickerTimer || typeof setInterval !== 'function') return;
    tickerTimer = setInterval(render._rollTicker, render.TICKER_ROLL_MS);
  };

  render.highlightMarker = function (name, on) {
    d3.select('#map-svg').selectAll('g.marker').classed('hi', function () {
      return on && this.getAttribute('data-name') === name;
    });
  };
  render.highlightCard = function (name, on) {
    document.querySelectorAll('.rank-card').forEach(function (c) {
      if (c.dataset.name === name) c.classList.toggle('hi', on);
    });
  };

  render.rankedList = function (code) {
    const list = render.institutionsByRegion(code)
      .filter(function (r) { return render._rankTypeVisible(r); });
    const sorted = render.state.rankSort === 'interest'
      ? logic.sortByInterest(list, render.state.today, function (r){ return store.isInterested(r.name); })
      : logic.sortByUrgency(list, render.state.today);
    // 기관 단위 중복제거 — 일반구 복제 레코드(수원 4구 등)가 카드 4장을 차지하지 않게.
    // 티커(drawTicker)와 같은 규칙. 폴리곤 강조는 _blinkMunicipality가 전 폴리곤을 잡는다.
    return logic.dedupeByInstitution(sorted);
  };
  // 랭킹 유형 필터: 지자체는 항상 표시, 그 외는 enabledTypes 따름
  render._rankTypeVisible = function (r) {
    if (r.type === '지자체') return true;
    if (logic.FILTERABLE_TYPES.indexOf(r.type) >= 0) return render.state.enabledTypes.has(r.type);
    return true;
  };

  render.drawRankingPanel = function (code) {
    const panel = document.getElementById('rank-panel'); if (!panel) return;
    panel.style.display = 'block';
    // 헤더(정렬 토글) + 목록 컨테이너
    panel.innerHTML =
      '<div class="rank-head"><b>랭킹</b>' +
      '<select id="rank-sort"><option value="urgency">임박순</option><option value="interest">관심도순</option></select>' +
      '</div><div id="rank-list"></div>' +
      '<div style="margin-top:8px;"><button id="rank-more">더 보기 — 전체 입찰건</button></div>';
    document.getElementById('rank-sort').value = render.state.rankSort;
    document.getElementById('rank-sort').addEventListener('change', function (e) {
      render.state.rankSort = e.target.value; render.drawRankingPanel(code);
    });
    document.getElementById('rank-more').addEventListener('click', function () { render.openMoreModal(); });

    const listEl = document.getElementById('rank-list');
    render.rankedList(code).forEach(function (r) {
      const card = document.createElement('div'); card.className = 'rank-card'; card.dataset.name = r.name;
      const glyph = logic.recordGlyph(r);
      const hearted = store.isInterested(r.name);
      // 글리프: '⚠️'(날짜 미상)는 획 어휘 SVG로, '!'(무결성 문제)는 글자 그대로.
      const missHtml = glyph === '!' ? '<span class="miss">!</span>'
        : (glyph ? '<span class="miss">' + render.ICONS.warn + '</span>' : '');
      card.innerHTML = '<span class="heart" data-name="' + logic.esc(r.name) + '">' +
        (hearted ? render.ICONS.heartFill : render.ICONS.heartLine) + '</span>' +
        '<b>' + logic.esc(r.name) + '</b> ' + missHtml +
        '<br><small>' + logic.esc(r.type) + ' · ' + logic.esc(logic.formatBidDateLabel(r)) + '</small>';
      card.querySelector('.heart').addEventListener('click', function (e) {
        e.stopPropagation(); store.toggleInterest(r.name); render.drawRankingPanel(code);
      });
      card.addEventListener('mouseenter', function () { render.highlightMarker(r.name, true); });
      card.addEventListener('mouseleave', function () { render.highlightMarker(r.name, false); });
      card.addEventListener('click', function (ev) { render.selectInstitution(r); render.showPopover(r, ev.clientX, ev.clientY); });
      // 키보드로도 열 수 있다(NEXT 28 최소분): Tab으로 닿고 Enter·Space로 팝오버를 연다. ♥(하트)에서 올라온 키는 건너뛴다.
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.addEventListener('keydown', function (ev) {
        if (ev.target !== card || (ev.key !== 'Enter' && ev.key !== ' ')) return;
        ev.preventDefault();
        const rc = card.getBoundingClientRect();
        render.selectInstitution(r);
        render.showPopover(r, rc.left - 292, rc.top, { keyboard: true });
      });
      listEl.appendChild(card);
    });
    // 목록을 새로 그리면 .hi가 사라지므로 현재 선택을 복원한다 —
    // ♥ 토글이 이 함수를 재호출하는데 그때 선택 강조가 엉뚱하게 풀리는 걸 막는다.
    if (render._selectedName) render.highlightCard(render._selectedName, true);
  };

  // 팝오버 — 기관 요약(이름·D-day·입찰 예정일·미확인 칸) + 다음 행동([제안 확정]·[사전준비 열기], prep.decoratePopover가 채움) + 접힌 원본 정보.
  // 규격: handoff/agents/design-reviewer/2026-11-11_1421_a3b0ec71.md §6-B. 지역코드·구시군코드·경도·위도는 보이지 않고 [편집] 창에만 있다.
  render.POP_RAW_FIELDS = ['type', 'term', 'lastBid', 'confirmed', 'sources', 'updatedAt'];
  render.POP_HIDDEN_FIELDS = ['name', 'region', 'subRegion', 'lng', 'lat'];
  render.popRawValue = function (rec, f) {
    if (f === 'sources') return Array.isArray(rec.sources) ? rec.sources : [];
    if (f === 'confirmed') return rec.confirmed === true ? '확정' : (rec.confirmed === false ? '미확정' : '');
    if (f === 'term') return rec.term == null || rec.term === '' ? '' : rec.term + '년';
    return rec[f] == null ? '' : String(rec[f]);
  };
  render.popoverHtml = function (rec, today) {
    const v = logic.validateRecord(rec);
    const bid = logic.effectiveBid(rec);
    const days = logic.daysUntil(bid.date, today);
    const dayCls = days === Infinity ? 'unknown' : (days <= 182 ? 'urgent' : (days <= 365 ? 'soon' : 'later'));
    const regionName = (render.REGION_NAME && render.REGION_NAME[rec.region]) || '';
    const sub = [rec.type, regionName].filter(Boolean).join(' · ');
    const unk = '<span class="pop-unk">미확인</span>';
    let raw = '';
    render.POP_RAW_FIELDS.forEach(function (f) {
      const label = logic.FIELD_LABELS[f] || f;
      const missing = v.missing.indexOf(f) >= 0;
      const val = render.popRawValue(rec, f);
      let body;
      if (f === 'sources') {
        body = val.map(function (s) {
          const t = String(s);
          return /^https?:\/\//i.test(t)
            ? '<a href="' + esc(t) + '" target="_blank" rel="noopener noreferrer">' + esc(t) + '</a>' : esc(t);
        }).join('<br>');
      } else body = esc(val);
      if (!body) body = missing ? '(누락)' : '';
      raw += '<div' + (missing ? ' class="miss"' : '') + '><span class="pop-rl">' + esc(label) + '</span> ' + body + '</div>';
    });
    const hiddenMissing = render.POP_HIDDEN_FIELDS.filter(function (f) { return v.missing.indexOf(f) >= 0; })
      .map(function (f) { return logic.FIELD_LABELS[f] || f; });
    if (hiddenMissing.length) {
      raw += '<div class="miss">누락된 칸: ' + esc(hiddenMissing.join(', ')) + ' — [편집]에서 채우세요.</div>';
    }
    return '<div class="pop-head"><b id="pop-title" tabindex="-1">' + esc(rec.name || '(이름없음)') + '</b>' +
      '<span class="dg-day ' + dayCls + '">' + esc(logic.formatDDay(rec, today)) + '</span></div>' +
      (sub ? '<div class="pop-sub">' + esc(sub) + '</div>' : '') +
      '<dl class="pop-grid"><dt>입찰 예정일</dt><dd class="pop-mono">' +
      (bid.date ? esc(bid.date) + ' (' + esc(logic.confidenceLabel(bid.confidence)) + ')' : '미상') + '</dd>' +
      '<dt>현 유치 은행</dt><dd>' + unk + '</dd><dt>임직원 수</dt><dd>' + unk + '</dd><dt>기관장</dt><dd>' + unk + '</dd></dl>' +
      '<div class="pop-note">미확인 칸은 기관 정보 이관 뒤 채워집니다.</div>' +
      '<div id="pop-prep-line"></div>' +
      '<div class="pop-actions"><span id="pop-prep-slot"></span><button id="pop-edit" type="button">편집</button></div>' +
      '<details class="pop-raw"><summary>원본 정보</summary>' + raw + '</details>';
  };

  render.showPopover = function (rec, x, y, opts) {
    const pop = document.getElementById('popover'); if (!pop) return;
    const keyboard = !!(opts && opts.keyboard);
    render._popOpener = keyboard ? document.activeElement : null;   // Esc로 닫으면 연 카드로 돌아간다
    pop.innerHTML = render.popoverHtml(rec, render.state.today);
    const eb = document.getElementById('pop-edit');
    if (eb) eb.onclick = function () { if (root.app && root.app.openEdit) root.app.openEdit(rec); };
    pop.style.left = Math.max(8, Math.min(x + 12, window.innerWidth - 300)) + 'px';
    pop.style.top = '8px'; pop.style.display = 'block';
    // 실제 높이를 잰 뒤 화면 안에 들어오게 놓는다(미확인 줄·확인 줄이 붙으면 높이가 달라진다). 더 길면 CSS max-height로 스크롤.
    pop.style.top = Math.max(8, Math.min(y + 12, window.innerHeight - pop.offsetHeight - 8)) + 'px';
    // 다음 행동 버튼은 사전준비 모듈이 붙인다(서버 호출은 prep.js에만 둔다).
    if (root.prep && root.prep.decoratePopover) root.prep.decoratePopover(pop, rec);
    if (keyboard) { const t = document.getElementById('pop-title'); if (t) t.focus(); }
  };

  render._selectedName = null;

  // 이전 선택의 흔적을 전부 해제한다. selectInstitution의 유일한 "끄기" 경로이자,
  // 랭킹 카드 흰 테두리가 클릭할수록 누적되던 버그의 근본 수정.
  render.clearSelection = function () {
    document.querySelectorAll('.rank-card.hi').forEach(function (c) { c.classList.remove('hi'); });
    const svg = d3.select('#map-svg');
    svg.selectAll('g.ripple-layer').remove();
    svg.selectAll('path.subregion.selected').classed('selected', false);
  };

  render.selectInstitution = function (rec) {
    render.clearSelection();                       // 항상 먼저 — 이전 강조를 남기지 않는다
    render._selectedName = rec ? rec.name : null;
    if (!rec) return;
    if (rec.type === '지자체') render._blinkMunicipality(rec);
    else render._drawRipple(rec.name);
    render.highlightCard(rec.name, true);
  };

  // 지자체: 좌표(마커)가 없으므로 물결 대신 해당 구 외곽선을 깜빡인다.
  render._blinkMunicipality = function (rec) {
    const fc = (render.REGION_GEO[render.state.currentRegion] || function(){ return null; })();
    if (!fc || !fc.features) return;
    // 일반구로 쪼개진 시(수원 4구 등)는 같은 기관이 폴리곤 여러 개에 걸친다 —
    // 첫 폴리곤만 잡으면 랭킹 카드가 시의 일부 구만 가리키므로 전부 모아 깜빡인다.
    const codes = fc.features.filter(function (f) {
      const hit = render.municipalityForFeature(f);
      return hit.some(function (r) { return r.name === rec.name; });
    }).map(function (f) { return f.properties.code; });
    if (!codes.length) return;
    const sel = d3.select('#map-svg')
      .selectAll('path.subregion')
      .filter(function () { return codes.indexOf(this.getAttribute('data-code')) >= 0; });
    // raise() 없이는 인접 폴리곤이 나중에 그려지며 외곽선을 덮어 반쪽만 보인다.
    sel.classed('selected', true).raise();
  };

  render._drawRipple = function (name) {
    const svg = d3.select('#map-svg');
    svg.selectAll('g.ripple-layer').remove();
    if (!name) return;
    // 현재 지역 마커 중 해당 이름의 좌표를 찾는다
    const proj = render._regionProjection; if (!proj) return;
    const rec = render.institutionsByRegion(render.state.currentRegion)
      .filter(function (r){ return r.name === name && typeof r.lng === 'number' && typeof r.lat === 'number'; })[0];
    if (!rec) return;
    const p = proj([rec.lng, rec.lat]);
    const g = svg.append('g').attr('class', 'ripple-layer');
    // 3중 링(위상차)로 잔잔한 물결 — 위상차는 주기에서 파생시켜 속도를 바꿔도 간격이 맞는다.
    const dur = render.currentTheme().rippleDuration;
    [0, 1, 2].forEach(function (i) {
      g.append('circle').attr('class', 'ripple-ring')
        .attr('cx', p[0]).attr('cy', p[1]).attr('r', 6)
        .style('animation-delay', (i * dur / 3) + 's');
    });
  };

  render.onMarkerClick = function (rec) {
    render.showPopover(rec, window.innerWidth/2, 120);
    render.selectInstitution(rec);
  };

  // 면 클릭 → 오른쪽 랭킹 목록의 그 카드로 포커스(사용자 요청). 마커 클릭과 달리
  // **팝오버는 띄우지 않는다** — 목적이 목록으로 시선을 옮기는 것인데 팝오버가
  // 그 카드를 가릴 수 있다(사용자 확정 ⓐ안).
  render.onSubregionClick = function (feature, ev) {
    // 면 색을 정한 바로 그 레코드를 고른다(recordForFeature 주석 참조).
    const rec = render.recordForFeature(feature);
    // 레코드 없는 회색 면은 고를 것이 없다 — 막지 않고 그대로 흘려보내
    // 아래 document 핸들러가 예전처럼 '빈 곳 클릭'(선택 해제)으로 처리하게 둔다.
    if (!rec) return;
    // 그 document 핸들러는 .rank-card/.marker 밖 클릭을 전부 빈 곳으로 보므로,
    // 여기서 멈추지 않으면 방금 한 선택이 곧바로 풀린다.
    if (ev && ev.stopPropagation) ev.stopPropagation();
    const pop = document.getElementById('popover');
    if (pop) pop.style.display = 'none';   // 카드 클릭으로 열려 있던 것은 닫는다
    render.selectInstitution(rec);
    render.focusCard(rec.name);
  };

  // 목록이 길면 강조된 카드가 스크롤 밖에 있어 "아무 일도 안 났다"로 보인다.
  render.focusCard = function (name) {
    const panel = document.getElementById('rank-panel'); if (!panel) return;
    let card = null;
    // 이름을 선택자에 넣지 않는다 — 기관명에 따옴표가 섞이면 선택자가 깨진다.
    panel.querySelectorAll('.rank-card').forEach(function (c) {
      if (c.dataset.name === name) card = c;
    });
    // 타입 필터로 카드가 빠져 있을 수 있다. 그때는 면 강조만 남기고 조용히 넘어간다.
    if (!card) return;
    const pr = panel.getBoundingClientRect(), cr = card.getBoundingClientRect();
    // 이미 다 보이면 움직이지 않는다 — 보고 있던 목록이 이유 없이 튀는 게 더 헷갈린다.
    if (cr.top >= pr.top && cr.bottom <= pr.bottom) return;
    // 밖에 있었으면 가운데로. scrollIntoView는 조상 스크롤까지 건드리므로 패널의
    // scrollTop만 직접 옮긴다 — 페이지 전체가 따라 움직이면 안 된다.
    panel.scrollTop += (cr.top - pr.top) - (panel.clientHeight - card.offsetHeight) / 2;
  };

  // Esc로 팝오버 닫기 — 키보드로 열었으면 연 카드로 포커스를 돌린다.
  if (typeof document !== 'undefined') document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    const pop = document.getElementById('popover');
    if (!pop || pop.style.display !== 'block') return;
    // 모달이 열려 있으면 그 모달의 Esc가 먼저 — 팝오버는 건드리지 않는다.
    const modalOpen = Array.prototype.some.call(document.querySelectorAll('.modal-overlay'), function (ov) {
      return window.getComputedStyle(ov).display !== 'none';
    });
    if (modalOpen) return;
    pop.style.display = 'none';
    let o = render._popOpener;
    render._popOpener = null;
    if (!(o && o.focus && document.body.contains(o))) {
      // 마우스로 열었으면 연 마커·카드(선택 강조된 카드)로, 없으면 지도 영역으로 돌린다.
      o = document.querySelector('.rank-card.hi') || document.getElementById('map-stage');
      if (o && !o.hasAttribute('tabindex')) o.setAttribute('tabindex', '-1');
    }
    if (o && o.focus) o.focus();
  });

  // 팝오버 바깥 클릭 시 닫기 + 선택 강조 해제
  if (typeof document !== 'undefined') document.addEventListener('click', function (ev) {
    const pop = document.getElementById('popover');
    const outside = !(ev.target.closest && ev.target.closest('.rank-card, .marker'));
    if (pop && pop.style.display === 'block' && !pop.contains(ev.target) && outside) pop.style.display = 'none';
    // 지도 빈 곳·패널 여백 클릭 → 강조 해제(팝오버 내부 클릭은 선택 유지)
    if (outside && !(pop && pop.contains(ev.target)) && render._selectedName) {
      render._selectedName = null; render.clearSelection();
    }
  });

  render.renderFallback = function () {
    const stage = document.getElementById('map-stage'); if (!stage) return;
    const all = render.allInstitutions().filter(function (r){ return render.state.activeRegions.has(r.region); });
    const top = logic.sortByUrgency(all, render.state.today);
    stage.innerHTML = '<div style="padding:16px;"><b>지도 로딩 실패</b> — D3 번들(vendor/d3.v7.min.js)을 확인하세요.' +
      '<br>아래는 지도 없이 제공하는 임박순 랭킹입니다.<ol>' +
      top.map(function (r){
        return '<li>' + esc(r.name) + ' — ' + esc(r.type) + ' · ' +
          esc(logic.formatDDay(r, render.state.today)) + '</li>'; }).join('') +
      '</ol></div>';
  };

  render.WATCHABLE = function () { return Array.from(render.state.activeRegions); };

  render.drawRegionGrid = function () {
    const grid = document.getElementById('region-grid'); if (!grid) return;
    grid.innerHTML = '';
    render.WATCHABLE().forEach(function (code) {
      const drillable = render.hasSubGeo(code);
      const card = document.createElement('div'); card.className = 'rg-card';
      card.style.cursor = drillable ? 'pointer' : 'default';
      const on = store.isWatched(code);
      const cnt = render.institutionsByRegion(code).length;
      card.innerHTML = '<span class="star" data-code="' + code + '">' +
        (on ? render.ICONS.starFill : render.ICONS.starLine) + '</span><b>' +
        (render.REGION_NAME[code] || code) + '</b>' +
        '<div style="color:var(--muted);font-size:12px;margin-top:6px;">기관 ' + cnt + '곳 · ' +
        (drillable ? '구/시군 보기 →' : '구/시군 경계 준비중') + '</div>';
      // ★는 관심 토글만 (드릴인으로 전파 방지)
      card.querySelector('.star').addEventListener('click', function (e) {
        e.stopPropagation();
        store.toggleWatch(code); render.drawRegionGrid(); render.drawPinBar(); render.applyWatchStyles();
      });
      // 카드 본문 클릭 → 전국 지도 탭으로 전환 후 해당 지역 구/시군 드릴인.
      // 경계 데이터가 없는 지역은 아예 열지 않는다 — 열어봐야 오류 배너만 뜬다.
      if (drillable) card.addEventListener('click', function () {
        const mapBtn = document.querySelector('.tab-btn[data-tab="map"]');
        if (mapBtn) mapBtn.click();
        // 지도 탭은 직전 화면(이전 시도 상세 등) 그대로 켜진다 — 확대 연출이 끝나는 ~1초 동안
        // 낡은 지도가 보이다가 갑자기 바뀌는 지연으로 읽혔다. 같은 틱에 전국 지도로 되돌려
        // 브라우저가 낡은 화면을 그리기 전에 "전국 → 확대 → 상세"가 이어지게 한다.
        if (root.app && root.app.backToNational) root.app.backToNational();
        if (root.app && root.app.enterRegion) root.app.enterRegion(code);
      });
      grid.appendChild(card);
    });
  };

  render.drawPinBar = function () {
    const bar = document.getElementById('pin-bar'); if (!bar) return;
    bar.innerHTML = ''; const watch = store.loadWatch();
    if (!watch.length) { bar.innerHTML = '<small style="color:var(--muted)">관심 지역을 별표(' + render.ICONS.starLine + ')로 지정하면 여기 쌓입니다 (드래그로 순서 변경).</small>'; return; }
    watch.forEach(function (code, idx) {
      const pin = document.createElement('div'); pin.className = 'pin'; pin.draggable = true; pin.dataset.idx = idx;
      pin.innerHTML = render.ICONS.starFill + ' ' + logic.esc(render.REGION_NAME[code] || code);
      pin.addEventListener('dragstart', function (e){ e.dataTransfer.setData('text/plain', idx); });
      pin.addEventListener('dragover', function (e){ e.preventDefault(); });
      pin.addEventListener('drop', function (e) {
        e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        store.reorderWatch(from, idx); render.drawPinBar(); render.applyWatchStyles();
      });
      // 핀 클릭 → 지도 탭 전환. 경계 데이터가 있는 지역만 드릴인 (카드와 동일 규칙).
      pin.style.cursor = 'pointer';
      pin.addEventListener('click', function () {
        const mapBtn = document.querySelector('.tab-btn[data-tab="map"]');
        if (mapBtn) mapBtn.click();
        if (render.hasSubGeo(code) && root.app && root.app.enterRegion) root.app.enterRegion(code);
      });
      bar.appendChild(pin);
    });
  };

  render.applyWatchStyles = function () {
    d3.select('#map-svg').selectAll('path.region').classed('watched', function (d) {
      return store.isWatched(d.properties.code);
    });
  };

  render.REGION_NAME_ALL = function (code) { return render.REGION_NAME[code] || code; };
  render.openMoreModal = function () {
    const modal = document.getElementById('more-modal'); if (!modal) return;
    modal.style.display = 'block';
    const search = document.getElementById('more-search');
    search.value = ''; render.renderMoreTable('');
    search.oninput = function () { render.renderMoreTable(search.value); };
    document.getElementById('more-close').onclick = function () { modal.style.display = 'none'; };
  };
  render.renderMoreTable = function (query) {
    const tb = document.getElementById('more-tbody'); if (!tb) return;
    const q = (query || '').trim().toLowerCase();
    const all = render.allInstitutions();
    const rows = logic.sortByUrgency(all, render.state.today).filter(function (r) {
      if (!q) return true;
      return [r.name, r.type, render.REGION_NAME_ALL(r.region)].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    tb.innerHTML = rows.map(function (r) {
      return '<tr style="border-top:1px solid var(--line);">' +
        '<td style="padding:6px;">' + logic.esc(r.name) + '</td>' +
        '<td style="padding:6px;">' + logic.esc(r.type || '') + '</td>' +
        '<td style="padding:6px;">' + logic.esc(render.REGION_NAME_ALL(r.region)) + '</td>' +
        '<td style="padding:6px;">' + logic.esc(logic.formatBidDateLabel(r)) + '</td>' +
        '<td style="padding:6px;">' + logic.esc(r.term ? r.term + '년' : '') + '</td>' +
        '<td style="padding:6px;">' + logic.esc(r.updatedAt || '') + '</td></tr>';
    }).join('');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = render;
  else root.render = render;
})(typeof self !== 'undefined' ? self : this);
