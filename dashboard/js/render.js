(function (root) {
  'use strict';
  const render = {};
  const logic = root.logic, store = root.store;

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

  // 파스텔 기본 팔레트 — 진한 원색은 위에 얹히는 물결/깜빡임을 묻히게 해서 낮췄다.
  render.DEFAULT_THEME = {
    red:'#f0a6a9', orange:'#f3c795', yellow:'#e9e3a8', blue:'#a9c5ea', gray:'#7c8699',
    // 파스텔(난색·연청색) 위에서 가장 잘 튀는 채도 높은 청록. 물결과 구 외곽선이 공유.
    accent:'#19d3c5',
    rippleDuration: 2.2,   // 초. 이전 1.4s에서 한 템포 늦춤
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
    ['red','6개월↓'], ['orange','1년↓'], ['yellow','2년↓'], ['blue','2년+'], ['gray','미상 ⚠️'],
  ];
  // 색은 localStorage(테마)에서 오므로 style 속성에 그대로 끼우지 않고 hex만 통과시킨다.
  render._safeColor = function (c, fallback) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? String(c) : fallback;
  };
  render.drawLegend = function () {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('legend'); if (!el) return;
    const rows = render.LEGEND_ITEMS.map(function (it) {
      const c = render._safeColor(render.URGENCY_COLORS[it[0]], render.DEFAULT_THEME[it[0]]);
      return '<span class="lg-item"><i class="lg-sw" style="background:' + c + '"></i>' +
        logic.esc(it[1]) + '</span>';
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
      .attr('stroke', '#0f1420').attr('stroke-width', 1)
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
    '43': function(){ return window.geoChungbuk; } };
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

  render.subUrgencyColor = function (feature) {
    const hit = render.municipalityForFeature(feature);
    if (!hit.length) return render.URGENCY_COLORS.gray;  // 해당 구에 지자체 레코드 없음
    const sorted = logic.sortByUrgency(hit, render.state.today);
    return render.URGENCY_COLORS[logic.urgencyOf(sorted[0], render.state.today)];
  };

  // 지자체 체크박스 OFF → 면 색은 유지하고 흐리게(정보를 지우지 않고 뒤로 물림).
  render.muniDimOpacity = function () {
    return render.state.enabledTypes.has('지자체') ? 1 : 0.25;
  };
  render.applyMuniDimming = function () {
    // 전체 재렌더 대신 투명도만 갱신 — 재렌더하면 선택 중이던 강조가 사라진다.
    d3.select('#map-svg').selectAll('path.subregion').attr('fill-opacity', render.muniDimOpacity());
    d3.select('#map-svg').selectAll('text.sub-glyph').attr('opacity', render.muniDimOpacity());
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
      .attr('stroke', '#0f1420').attr('stroke-width', 1);
    // 날짜 미상 면 글리프 — 마커·랭킹 카드의 recordGlyph('⚠️')와 같은 시각 언어를 면에도 확장.
    // 레코드가 아예 없는 면은 대상이 아니다(표시할 기관 자체가 없으므로 회색만 유지).
    g.selectAll('text.sub-glyph')
      .data(fc.features.filter(function (d) {
        const hit = render.municipalityForFeature(d);
        return hit.length > 0 && hit.every(function (r) { return !logic.effectiveBid(r).date; });
      }))
      .join('text').attr('class', 'sub-glyph')
      .attr('transform', function (d) {
        const p = path.centroid(d); return 'translate(' + p[0] + ',' + p[1] + ')';
      })
      .attr('text-anchor', 'middle').attr('dy', '0.35em')
      .attr('font-size', 10)
      .attr('opacity', render.muniDimOpacity())
      .attr('pointer-events', 'none')   // 클릭은 아래 폴리곤이 받아야 한다
      .text('⚠️');
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
        banner.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#e6ecff;'; stage.appendChild(banner); }
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
        g.append('circle').attr('r',14).attr('fill','#2a3550').attr('stroke','#e6ecff');
        g.append('text').attr('text-anchor','middle').attr('dy','0.35em').attr('fill','#e6ecff').attr('font-size',12).text(grp.length);
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
        if (glyph) g.append('text').attr('text-anchor','middle').attr('dy','0.35em')
          .attr('fill', glyph === '!' ? '#fff' : '#0f1420').attr('font-weight','bold').attr('font-size',10).text(glyph);
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
    el.textContent = '임박 TOP5 · ' + top.map(function (r) {
      return r.name + '(' + logic.formatDDay(r, render.state.today) + ')';
    }).join('   ·   ');
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
      '<div style="margin-top:8px;"><button id="rank-more" style="width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:6px;cursor:pointer;">더 보기 — 전체 입찰건</button></div>';
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
      card.innerHTML = '<span class="heart" data-name="' + logic.esc(r.name) + '">' + (hearted ? '♥' : '♡') + '</span>' +
        '<b>' + logic.esc(r.name) + '</b> ' + (glyph ? '<span class="miss">' + logic.esc(glyph) + '</span>' : '') +
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
    html += '<div style="margin-top:6px;"><button id="pop-edit">✎ 편집</button></div>';
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
      card.innerHTML = '<span class="star" data-code="' + code + '">' + (on ? '★' : '☆') + '</span><b>' +
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
    if (!watch.length) { bar.innerHTML = '<small style="color:var(--muted)">관심 지역을 ★로 지정하면 여기 쌓입니다 (드래그로 순서 변경).</small>'; return; }
    watch.forEach(function (code, idx) {
      const pin = document.createElement('div'); pin.className = 'pin'; pin.draggable = true; pin.dataset.idx = idx;
      pin.textContent = '★ ' + (render.REGION_NAME[code] || code);
      pin.addEventListener('dragstart', function (e){ e.dataTransfer.setData('text/plain', idx); });
      pin.addEventListener('dragover', function (e){ e.preventDefault(); });
      pin.addEventListener('drop', function (e) {
        e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        store.reorderWatch(from, idx); render.drawPinBar(); render.applyWatchStyles();
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
