(function (root) {
  'use strict';
  const render = {};
  const logic = root.logic, store = root.store;

  const esc = logic.esc; // 공유 이스케이프(logic.esc) 위임

  render.state = {
    today: new Date(new Date().toISOString().slice(0,10) + 'T00:00:00'),
    activeRegions: new Set(['11','41']),        // v1 활성: 서울·경기
    enabledTypes: new Set(logic.FILTERABLE_TYPES),
    currentRegion: null,
  };

  render.URGENCY_COLORS = { red:'#e5484d', orange:'#f5a524', yellow:'#f2e14c', blue:'#3b82f6', gray:'#5a6680' };

  render.allInstitutions = function () { return store.applyEdits(window.institutions || []); };
  render.institutionsByRegion = function (code) {
    return render.allInstitutions().filter(function (r) { return r.region === code; });
  };

  // 지자체(면) 레코드 중 해당 region의 최임박 임박도 → 면 색
  render.regionUrgencyColor = function (code) {
    const muni = render.institutionsByRegion(code).filter(function (r) { return r.type === '지자체'; });
    if (!muni.length) return render.URGENCY_COLORS.gray;
    const sorted = logic.sortByUrgency(muni, render.state.today);
    return render.URGENCY_COLORS[logic.computeUrgency(sorted[0].contractEnd, render.state.today)];
  };

  render.drawNational = function () {
    var rp = document.getElementById('rank-panel'); if (rp) rp.style.display='none';
    const svg = d3.select('#map-svg');
    svg.selectAll('*').remove();
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
        return render.state.activeRegions.has(code) ? render.regionUrgencyColor(code) : '#39435c';
      })
      .attr('stroke', '#0f1420').attr('stroke-width', 1)
      .style('cursor', function (d){ return render.state.activeRegions.has(d.properties.code) ? 'pointer' : 'default'; })
      .style('opacity', function (d){ return render.state.activeRegions.has(d.properties.code) ? 1 : 0.5; })
      .on('click', function (ev, d) {
        if (!render.state.activeRegions.has(d.properties.code)) return;
        if (root.app && root.app.enterRegion) root.app.enterRegion(d.properties.code);
      });

    g.selectAll('text.label').data(fc.features).join('text')
      .attr('class', 'label')
      .attr('transform', function (d){ const c = path.centroid(d); return 'translate(' + c[0] + ',' + c[1] + ')'; })
      .attr('text-anchor', 'middle').attr('dy', '0.35em')
      .attr('fill', '#e6ecff').attr('font-size', 12)
      .text(function (d) {
        const active = render.state.activeRegions.has(d.properties.code);
        return d.properties.name + (active ? '' : ' (준비중)');
      });

    render.state.currentRegion = null;
    render._nationalProjection = proj; render._nationalG = g;

    // A1: 전국 지도 자유 팬/줌(스펙 ⑦-A). 휠 확대·축소 + 드래그 팬.
    render._zoom = d3.zoom().scaleExtent([1, 8]).on('zoom', function (e) { g.attr('transform', e.transform); });
    svg.call(render._zoom);
    // drawNational 재호출(init/전국복귀) 시 내부 transform을 identity로 재동기화 —
    // 이전 flyZoomTo 잔존 transform이 새 레이어와 어긋나지 않게 보장(A4).
    svg.call(render._zoom.transform, d3.zoomIdentity);
  };

  // A2: 대상 시도 bounds로 750ms 지오메트릭 줌인("붕 떴다 내려앉는").
  render.flyZoomTo = function (feature, done) {
    const svg = d3.select('#map-svg');
    const proj = render._nationalProjection;
    if (!proj || !render._nationalG || !render._zoom) { if (done) done(); return; }
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
      .call(render._zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k))
      .on('end', function () { if (done) done(); });
  };

  render.REGION_GEO = { '11': function(){ return window.geoSeoul; }, '41': function(){ return window.geoGyeonggi; } };
  render.REGION_NAME = { '11':'서울', '41':'경기' };

  render.subUrgencyColor = function (feature) {
    // 상세 폴리곤(구/시군)엔 지자체 레코드가 코드 단위로 매칭되지 않을 수 있어,
    // 해당 상위 region의 지자체 임박도를 공통 적용(자리표시). 실데이터에선 feature.code 매칭으로 정밀화.
    return render.regionUrgencyColor(render.state.currentRegion);
  };

  render.drawRegion = function (code) {
    var b = document.getElementById('geo-retry-banner'); if (b) b.remove();
    const svg = d3.select('#map-svg'); svg.selectAll('*').remove();
    const node = svg.node(); const w = node.clientWidth || 900, h = node.clientHeight || 600;
    const fc = (render.REGION_GEO[code] || function(){ return {type:'FeatureCollection',features:[]}; })();
    const proj = d3.geoMercator().fitSize([w, h], fc);
    const path = d3.geoPath(proj);
    render.state.currentRegion = code;
    const g = svg.append('g').attr('class', 'region-layer');
    g.selectAll('path.subregion').data(fc.features).join('path')
      .attr('class', 'subregion').attr('d', path)
      .attr('fill', function (d){ return render.subUrgencyColor(d); })
      .attr('stroke', '#0f1420').attr('stroke-width', 1);
    render._regionProjection = proj; render._regionPath = path; render._regionG = g;
    if (render.drawMarkers) render.drawMarkers(code); // Task 9
    render.drawRankingPanel(code);
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
        const color = render.URGENCY_COLORS[logic.computeUrgency(r.contractEnd, render.state.today)];
        const glyph = logic.recordGlyph(r);
        const g = layer.append('g').attr('class','marker').attr('data-name', r.name).attr('transform','translate('+p[0]+','+p[1]+')');
        const hatched = r.confidence === '추정';
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
    const top = logic.sortByUrgency(all, render.state.today).slice(0, 5);
    const el = document.getElementById('ticker'); if (!el) return;
    el.textContent = '임박 TOP5 · ' + top.map(function (r) {
      const d = logic.daysUntil(r.contractEnd, render.state.today);
      return r.name + (d === Infinity ? '(미상)' : '(D-' + d + ')');
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

  render.drawRankingPanel = function (code) {
    const panel = document.getElementById('rank-panel'); if (!panel) return;
    const list = logic.sortByUrgency(render.institutionsByRegion(code), render.state.today);
    panel.style.display = 'block'; panel.innerHTML = '<h3 style="margin:4px 0 8px;">임박순 랭킹</h3>';
    list.forEach(function (r) {
      const d = logic.daysUntil(r.contractEnd, render.state.today);
      const card = document.createElement('div'); card.className = 'rank-card'; card.dataset.name = r.name;
      const glyph = logic.recordGlyph(r);
      card.innerHTML = '<b>' + esc(r.name) + '</b> ' + (glyph ? '<span class="miss">' + esc(glyph) + '</span>' : '') +
        '<br><small>' + esc(r.type) + ' · ' + (d === Infinity ? '미상' : 'D-' + d) + '</small>';
      card.addEventListener('mouseenter', function () { render.highlightMarker(r.name, true); });
      card.addEventListener('mouseleave', function () { render.highlightMarker(r.name, false); });
      card.addEventListener('click', function (ev) { render.showPopover(r, ev.clientX, ev.clientY); });
      panel.appendChild(card);
    });
  };

  render.showPopover = function (rec, x, y) {
    const pop = document.getElementById('popover'); if (!pop) return;
    const v = logic.validateRecord(rec);
    const fields = logic.ALL_FIELDS;
    let html = '<b>' + esc(rec.name || '(이름없음)') + '</b><br>';
    fields.forEach(function (f) {
      const missing = v.missing.indexOf(f) >= 0 || (f === 'contractEnd' && !rec.contractEnd);
      let val = f === 'sources' ? (Array.isArray(rec.sources) ? rec.sources.join(', ') : '') : (rec[f] == null ? '' : rec[f]);
      html += '<div' + (missing ? ' class="miss"' : '') + '>' + f + ': ' + (val ? esc(val) : (missing ? '(누락)' : '')) + '</div>';
    });
    html += '<div style="margin-top:6px;"><button id="pop-edit">✎ 편집</button></div>';
    pop.innerHTML = html;
    const eb = document.getElementById('pop-edit');
    if (eb) eb.onclick = function () { if (root.app && root.app.openEdit) root.app.openEdit(rec); };
    pop.style.left = Math.min(x + 12, window.innerWidth - 300) + 'px';
    pop.style.top = Math.min(y + 12, window.innerHeight - 180) + 'px'; pop.style.display = 'block';
  };
  render.onMarkerClick = function (rec) { render.showPopover(rec, window.innerWidth/2, 120);
    render.highlightCard(rec.name, true); setTimeout(function(){ render.highlightCard(rec.name, false); }, 1500); };

  // 팝오버 바깥 클릭 시 닫기
  if (typeof document !== 'undefined') document.addEventListener('click', function (ev) {
    const pop = document.getElementById('popover');
    if (pop && pop.style.display === 'block' && !pop.contains(ev.target) && !(ev.target.closest && ev.target.closest('.rank-card, .marker'))) pop.style.display = 'none';
  });

  render.renderFallback = function () {
    const stage = document.getElementById('map-stage'); if (!stage) return;
    const all = render.allInstitutions().filter(function (r){ return render.state.activeRegions.has(r.region); });
    const top = logic.sortByUrgency(all, render.state.today);
    stage.innerHTML = '<div style="padding:16px;"><b>지도 로딩 실패</b> — D3 번들(vendor/d3.v7.min.js)을 확인하세요.' +
      '<br>아래는 지도 없이 제공하는 임박순 랭킹입니다.<ol>' +
      top.map(function (r){ const d = logic.daysUntil(r.contractEnd, render.state.today);
        return '<li>' + esc(r.name) + ' — ' + esc(r.type) + ' · ' + (d === Infinity ? '미상' : 'D-' + d) + '</li>'; }).join('') +
      '</ol></div>';
  };

  render.WATCHABLE = function () { return Array.from(render.state.activeRegions); };

  render.drawRegionGrid = function () {
    const grid = document.getElementById('region-grid'); if (!grid) return;
    grid.innerHTML = '';
    render.WATCHABLE().forEach(function (code) {
      const card = document.createElement('div'); card.className = 'rg-card';
      const on = store.isWatched(code);
      card.innerHTML = '<span class="star" data-code="' + code + '">' + (on ? '★' : '☆') + '</span><b>' +
        (render.REGION_NAME[code] || code) + '</b>';
      card.querySelector('.star').addEventListener('click', function () {
        store.toggleWatch(code); render.drawRegionGrid(); render.drawPinBar(); render.applyWatchStyles();
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

  if (typeof module !== 'undefined' && module.exports) module.exports = render;
  else root.render = render;
})(typeof self !== 'undefined' ? self : this);
