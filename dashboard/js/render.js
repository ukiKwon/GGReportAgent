(function (root) {
  'use strict';
  const render = {};
  const logic = root.logic, store = root.store;

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
  };

  render.REGION_GEO = { '11': function(){ return window.geoSeoul; }, '41': function(){ return window.geoGyeonggi; } };
  render.REGION_NAME = { '11':'서울', '41':'경기' };

  render.subUrgencyColor = function (feature) {
    // 상세 폴리곤(구/시군)엔 지자체 레코드가 코드 단위로 매칭되지 않을 수 있어,
    // 해당 상위 region의 지자체 임박도를 공통 적용(자리표시). 실데이터에선 feature.code 매칭으로 정밀화.
    return render.regionUrgencyColor(render.state.currentRegion);
  };

  render.drawRegion = function (code) {
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

  render.flyToRegion = function (code, done) {
    const overlay = document.getElementById('cloud-overlay');
    overlay.classList.add('active');              // 구름 덮음
    setTimeout(function () {
      render.drawRegion(code);                    // 상세 그리기(가려진 채)
      requestAnimationFrame(function () { overlay.classList.remove('active'); }); // 구름 걷힘(페이드아웃)
      if (done) done();
    }, 350);
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
      .filter(function (r){ return typeof r.lng === 'number' && typeof r.lat === 'number'; });

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
      card.innerHTML = '<b>' + r.name + '</b> ' + (glyph ? '<span class="miss">' + glyph + '</span>' : '') +
        '<br><small>' + r.type + ' · ' + (d === Infinity ? '미상' : 'D-' + d) + '</small>';
      card.addEventListener('mouseenter', function () { render.highlightMarker(r.name, true); });
      card.addEventListener('mouseleave', function () { render.highlightMarker(r.name, false); });
      card.addEventListener('click', function (ev) { render.showPopover(r, ev.clientX, ev.clientY); });
      panel.appendChild(card);
    });
  };

  render.showPopover = function (rec, x, y) {
    const pop = document.getElementById('popover'); if (!pop) return;
    const v = logic.validateRecord(rec);
    const fields = ['name','type','region','contractEnd','confidence','sources'];
    let html = '<b>' + (rec.name || '(이름없음)') + '</b><br>';
    fields.forEach(function (f) {
      const missing = v.missing.indexOf(f) >= 0 || (f === 'contractEnd' && !rec.contractEnd);
      let val = f === 'sources' ? (Array.isArray(rec.sources) ? rec.sources.join(', ') : '') : (rec[f] == null ? '' : rec[f]);
      html += '<div' + (missing ? ' class="miss"' : '') + '>' + f + ': ' + (val || (missing ? '(누락)' : '')) + '</div>';
    });
    pop.innerHTML = html; pop.style.left = Math.min(x + 12, window.innerWidth - 300) + 'px';
    pop.style.top = Math.min(y + 12, window.innerHeight - 180) + 'px'; pop.style.display = 'block';
  };
  render.onMarkerClick = function (rec) { render.showPopover(rec, window.innerWidth/2, 120);
    render.highlightCard(rec.name, true); setTimeout(function(){ render.highlightCard(rec.name, false); }, 1500); };

  // 팝오버 바깥 클릭 시 닫기
  if (typeof document !== 'undefined') document.addEventListener('click', function (ev) {
    const pop = document.getElementById('popover');
    if (pop && pop.style.display === 'block' && !pop.contains(ev.target) && !(ev.target.closest && ev.target.closest('.rank-card, .marker'))) pop.style.display = 'none';
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = render;
  else root.render = render;
})(typeof self !== 'undefined' ? self : this);
