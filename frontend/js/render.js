(function (root) {
  'use strict';
  const render = {};
  // designer.js·approvals.js와 같은 방식(브라우저는 전역, node는 require) — 이 파일도
  // node --test로 열 수 있어야 면 클릭 규칙을 테스트로 고정할 수 있다.
  const logic = (typeof require !== 'undefined') ? require('./logic.js') : root.logic;
  const store = (typeof require !== 'undefined') ? require('./store.js') : root.store;

  const esc = logic.esc; // 공유 이스케이프(logic.esc) 위임

  render.state = {
    today: new Date(new Date().toISOString().slice(0,10) + 'T00:00:00'),
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
  render.DEFAULT_THEME = {
    red:'#f0a6a9', orange:'#f3c795', yellow:'#e9e3a8', blue:'#a9c5ea', gray:'#7c8699',
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
  };
  // 호출부(regionUrgencyColor·drawMarkers 등)가 render.URGENCY_COLORS[...]로 직접 참조하므로
  // 객체 정체성을 유지한 채 applyTheme이 키만 덮어쓴다.
  render.URGENCY_COLORS = { red:'', orange:'', yellow:'', blue:'', gray:'' };

  render.currentTheme = function () {
    return Object.assign({}, render.DEFAULT_THEME, store.loadTheme() || {});
  };

  render.INACTIVE_FILL = '#c3cad9';   // 준비중 지역 — 진한 라벨이 읽히도록 밝은 중립색

  // 저장된 테마를 팔레트 객체와 CSS 변수에 반영. app.init 1회 + 설정 저장 시마다 호출.
  render.applyTheme = function () {
    const t = render.currentTheme();
    ['red','orange','yellow','blue','gray'].forEach(function (k) { render.URGENCY_COLORS[k] = t[k]; });
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
  render.LEGEND_ITEMS = [
    ['red','6개월↓'], ['orange','1년↓'], ['yellow','2년↓'], ['blue','2년+'], ['gray','미상'],
  ];
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
      const c = render._safeColor(render.URGENCY_COLORS[it[0]], render.DEFAULT_THEME[it[0]]);
      const warn = it[0] === 'gray' ? ' ' + render.ICONS.warn : '';
      return '<span class="lg-item" style="color:color-mix(in srgb, ' + c + ' 70%, #ffffff)">' +
        '<i class="lg-sw" style="background:' + c + '"></i>' + logic.esc(it[1]) + warn + '</span>';
    });
    rows.push('<span class="lg-item"><i class="lg-sw lg-hatch" style="background:' +
      render._safeColor(render.INACTIVE_FILL, '#c3cad9') + '"></i>준비중</span>');
    el.innerHTML = '<div class="lg-title">입찰 임박도</div>' + rows.join('');
  };
  render.applyTheme();

  render.baseInstitutions = function () { return store.loadData() || window.institutions || []; };
  render.allInstitutions = function () { return store.applyEdits(render.baseInstitutions()); };
  render.institutionsByRegion = function (code) {
    return render.allInstitutions().filter(function (r) { return r.region === code; });
  };

  // 지자체(면) 레코드 중 해당 region의 최임박 임박도 → 면 색
  render.regionUrgencyColor = function (code) {
    const muni = render.institutionsByRegion(code).filter(function (r) { return r.type === '지자체'; });
    if (!muni.length) return render.URGENCY_COLORS.gray;
    const sorted = logic.sortByUrgency(muni, render.state.today);
    return render.URGENCY_COLORS[logic.urgencyOf(sorted[0], render.state.today)];
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
  render.HOLD_MS = 400;   // 확대가 끝난 뒤 "살짝 멈춤" — 이후 상세 지도로 전환

  render.drawNational = function () {
    var rp = document.getElementById('rank-panel'); if (rp) rp.style.display='none';
    const svg = d3.select('#map-svg');
    svg.selectAll('*').remove();
    render._ensureDefs(svg);   // 준비중 지역 빗금(#hatch)용 — 이전엔 지역 뷰에서만 호출됐다
    const node = svg.node(); const w = node.clientWidth || 900, h = node.clientHeight || 600;
    const fc = window.geoKorea;
    const proj = d3.geoMercator().fitSize([w, h], fc);
    const path = d3.geoPath(proj);
    const g = svg.append('g').attr('class', 'national-layer');

    g.selectAll('path.region').data(fc.features).join('path')
      .attr('class', 'region').attr('d', path)
      .attr('data-code', function (d){ return d.properties.code; })
      .attr('fill', function (d) {
        const code = d.properties.code;
        // 준비중은 밝은 중립색 — 균일한 진한 라벨이 읽히려면 면이 밝아야 한다.
        return render.state.activeRegions.has(code) ? render.regionUrgencyColor(code) : render.INACTIVE_FILL;
      })
      .attr('stroke', '#07090e').attr('stroke-width', 1)
      // 커서·클릭은 activeRegions가 아니라 hasSubGeo로 판단한다(위 주석 참조).
      .style('cursor', function (d){ return render.hasSubGeo(d.properties.code) ? 'pointer' : 'default'; })
      .style('opacity', 1)
      .on('click', function (ev, d) {
        if (!render.hasSubGeo(d.properties.code)) return;
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
  render.recordForFeature = function (feature) {
    const hit = render.municipalityForFeature(feature);
    if (!hit.length) return null;
    return logic.sortByUrgency(hit, render.state.today)[0];
  };

  render.subUrgencyColor = function (feature) {
    const rec = render.recordForFeature(feature);
    if (!rec) return render.URGENCY_COLORS.gray;  // 해당 구에 지자체 레코드 없음
    return render.URGENCY_COLORS[logic.urgencyOf(rec, render.state.today)];
  };

  // 지자체 체크박스 OFF → 면 색은 유지하고 흐리게(정보를 지우지 않고 뒤로 물림).
  render.muniDimOpacity = function () {
    return render.state.enabledTypes.has('지자체') ? 1 : 0.25;
  };
  render.applyMuniDimming = function () {
    // 전체 재렌더 대신 투명도만 갱신 — 재렌더하면 선택 중이던 강조가 사라진다.
    d3.select('#map-svg').selectAll('path.subregion').attr('fill-opacity', render.muniDimOpacity());
    d3.select('#map-svg').selectAll('g.sub-glyph').attr('opacity', render.muniDimOpacity());
  };

  render.drawRegion = function (code) {
    var b = document.getElementById('geo-retry-banner'); if (b) b.remove();
    // 랭킹 패널을 먼저 펼쳐 레이아웃을 확정한 뒤 폭을 잰다 — 그렇지 않으면
    // 패널이 나중에 열리며 SVG가 줄어들어 지도가 확대·좌측 쏠림으로 그려진다.
    var rp0 = document.getElementById('rank-panel'); if (rp0) rp0.style.display = 'block';
    const svg = d3.select('#map-svg'); svg.selectAll('*').remove();
    const node = svg.node(); const w = node.clientWidth || 900, h = node.clientHeight || 600;
    const fc = (render.REGION_GEO[code] || function(){ return {type:'FeatureCollection',features:[]}; })();
    const proj = d3.geoMercator().fitSize([w, h], fc);
    const path = d3.geoPath(proj);
    render.state.currentRegion = code;
    const g = svg.append('g').attr('class', 'region-layer');
    g.selectAll('path.subregion').data(fc.features).join('path')
      .attr('class', 'subregion').attr('d', path)
      .attr('data-code', function (d){ return d.properties.code; })  // 선택 강조 대상 조회용
      .attr('fill', function (d){ return render.subUrgencyColor(d); })
      .attr('fill-opacity', render.muniDimOpacity())
      .attr('stroke', '#07090e').attr('stroke-width', 1)
      // 지자체는 좌표가 없어 마커가 그려지지 않으므로(_blinkMunicipality 주석 참조)
      // **이 면이 유일한 클릭 대상**인데 여태 핸들러가 없었다 — 눌러도 아무 일이
      // 없었고, 카드→지도 방향만 동작했다.
      .style('cursor', function (d) {
        return render.municipalityForFeature(d).length ? 'pointer' : 'default';
      })
      .on('click', function (ev, d) { render.onSubregionClick(d, ev); });
    // 날짜 미상 면 글리프 — 마커·랭킹 카드의 recordGlyph('⚠️')와 같은 시각 언어를 면에도 확장.
    // 레코드가 아예 없는 면은 대상이 아니다(표시할 기관 자체가 없으므로 회색만 유지).
    // 이모지 대신 필터 글리프(.fsw)와 같은 획 어휘의 삼각 경고를 직접 그린다(마감 리뷰 반영).
    const gw = g.selectAll('g.sub-glyph')
      .data(fc.features.filter(function (d) {
        const hit = render.municipalityForFeature(d);
        return hit.length > 0 && hit.every(function (r) { return !logic.effectiveBid(r).date; });
      }))
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
        const color = render.URGENCY_COLORS[logic.urgencyOf(r, render.state.today)];
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
    const top = logic.dedupeByInstitution(logic.sortByUrgency(all, render.state.today)).slice(0, 5);
    const el = document.getElementById('ticker'); if (!el) return;
    // 항목마다 임박도 색을 입힌다 — 티커 자체가 등락을 말해야 한다(마감 리뷰 반영).
    // ▲는 6개월 이내(상승 = 임박)에만 붙는 시세 표기. 색은 hex 화이트리스트 통과분만.
    el.innerHTML = '<span class="tk-cap">임박 TOP5</span>' + top.map(function (r) {
      const band = logic.urgencyOf(r, render.state.today);
      const c = render._safeColor(render.URGENCY_COLORS[band], render.DEFAULT_THEME[band]);
      const mark = band === 'red' ? render.ICONS.up + ' ' : '';
      return '<span style="color:color-mix(in srgb, ' + c + ' 72%, #ffffff)">' + mark +
        logic.esc(r.name) + ' ' + logic.esc(logic.formatDDay(r, render.state.today)) + '</span>';
    }).join('<span class="tk-sep">·</span>');
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
        '<br><small>' + logic.esc(r.type) + ' · ' + logic.esc(logic.formatBidDate(r)) + '</small>';
      card.querySelector('.heart').addEventListener('click', function (e) {
        e.stopPropagation(); store.toggleInterest(r.name); render.drawRankingPanel(code);
      });
      card.addEventListener('mouseenter', function () { render.highlightMarker(r.name, true); });
      card.addEventListener('mouseleave', function () { render.highlightMarker(r.name, false); });
      card.addEventListener('click', function (ev) { render.selectInstitution(r); render.showPopover(r, ev.clientX, ev.clientY); });
      listEl.appendChild(card);
    });
    // 목록을 새로 그리면 .hi가 사라지므로 현재 선택을 복원한다 —
    // ♥ 토글이 이 함수를 재호출하는데 그때 선택 강조가 엉뚱하게 풀리는 걸 막는다.
    if (render._selectedName) render.highlightCard(render._selectedName, true);
  };

  render.showPopover = function (rec, x, y) {
    const pop = document.getElementById('popover'); if (!pop) return;
    const v = logic.validateRecord(rec);
    const fields = logic.ALL_FIELDS;
    let html = '<b>' + esc(rec.name || '(이름없음)') + '</b><br>';
    fields.forEach(function (f) {
      const label = logic.FIELD_LABELS[f] || f;
      if (f === 'contractEnd') {
        html += '<div>' + label + ': ' + esc(logic.formatBidDate(rec)) + '</div>';
        return;
      }
      const missing = v.missing.indexOf(f) >= 0;
      let val = f === 'sources' ? (Array.isArray(rec.sources) ? rec.sources.join(', ') : '') : (rec[f] == null ? '' : rec[f]);
      html += '<div' + (missing ? ' class="miss"' : '') + '>' + label + ': ' + (val ? esc(val) : (missing ? '(누락)' : '')) + '</div>';
    });
    html += '<div style="margin-top:6px;"><button id="pop-edit">편집</button></div>';
    pop.innerHTML = html;
    const eb = document.getElementById('pop-edit');
    if (eb) eb.onclick = function () { if (root.app && root.app.openEdit) root.app.openEdit(rec); };
    pop.style.left = Math.min(x + 12, window.innerWidth - 300) + 'px';
    pop.style.top = Math.min(y + 12, window.innerHeight - 180) + 'px'; pop.style.display = 'block';
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
        '<td style="padding:6px;">' + logic.esc(logic.formatBidDate(r)) + '</td>' +
        '<td style="padding:6px;">' + logic.esc(r.term ? r.term + '년' : '') + '</td>' +
        '<td style="padding:6px;">' + logic.esc(r.updatedAt || '') + '</td></tr>';
    }).join('');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = render;
  else root.render = render;
})(typeof self !== 'undefined' ? self : this);
