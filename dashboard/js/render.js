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

  if (typeof module !== 'undefined' && module.exports) module.exports = render;
  else root.render = render;
})(typeof self !== 'undefined' ? self : this);
