(function (root) {
  'use strict';
  const app = {};
  app.enterRegion = function (code) {
    document.getElementById('cloud-overlay').classList.add('active');
    root.render.loadRegionGeoWithRetry(code, function () {
      // 기존 성공 처리(크로스페이드 → drawRegion → breadcrumb)를 그대로 유지.
      function proceed() {
        setTimeout(function () {
          root.render.drawRegion(code);
          requestAnimationFrame(function(){ document.getElementById('cloud-overlay').classList.remove('active'); });
          document.getElementById('breadcrumb').style.display = 'block';
          document.getElementById('crumb-region').textContent = root.render.REGION_NAME[code] || code;
        }, 350);
      }
      // A3: 전국 geo에서 해당 시도 feature를 찾으면 지오메트릭 fly-to 후 성공 처리,
      // 못 찾으면(전국 geo 부재 등) 기존 크로스페이드 경로로 폴백.
      const fk = window.geoKorea;
      const feature = fk && fk.features
        ? fk.features.filter(function (f) { return f.properties.code === code; })[0]
        : null;
      if (feature && root.render.flyZoomTo) root.render.flyZoomTo(feature, proceed);
      else proceed();
    }, function () { document.getElementById('cloud-overlay').classList.remove('active'); });
  };
  app.backToNational = function () {
    document.getElementById('breadcrumb').style.display = 'none';
    // drawNational이 내부 zoom transform을 identity로 재동기화하므로(A4) 잔존 transform 없이 복귀.
    root.render.drawNational();
  };
  app.onTabChange = function (tab) {
    if (tab === 'regions') { root.render.drawRegionGrid(); root.render.drawPinBar(); }
    else if (tab === 'map') { root.render.applyWatchStyles(); }
  };

  app.wireFilters = function () {
    const boxes = document.querySelectorAll('#type-filter input[type=checkbox]');
    // 데이터 없는 유형 비활성
    const present = new Set(root.render.allInstitutions().map(function (r){ return r.type; }));
    boxes.forEach(function (b) {
      if (!present.has(b.dataset.type)) { b.checked = false; b.disabled = true; }
      b.addEventListener('change', function () {
        const s = root.render.state.enabledTypes;
        if (b.checked) s.add(b.dataset.type); else s.delete(b.dataset.type);
        if (root.render.state.currentRegion) root.render.drawMarkers(root.render.state.currentRegion);
      });
    });
    // 초기 enabledTypes를 체크상태와 동기화
    root.render.state.enabledTypes = new Set(
      Array.from(boxes).filter(function (b){ return b.checked; }).map(function (b){ return b.dataset.type; }));
  };

  app.openEdit = function (rec) {
    const wrap = document.getElementById('edit-fields');
    const fields = root.logic.ALL_FIELDS;
    wrap.innerHTML = fields.map(function (f) {
      const val = f === 'sources' ? (Array.isArray(rec.sources) ? rec.sources.join(', ') : '') : (rec[f] || '');
      return '<label style="display:block;margin:6px 0;">' + f +
        '<input data-f="' + f + '" value="' + root.logic.esc(val) + '" style="width:100%;"></label>';
    }).join('');
    const modal = document.getElementById('edit-modal'); modal.style.display = 'block';
    document.getElementById('edit-cancel').onclick = function () { modal.style.display = 'none'; };
    document.getElementById('edit-save').onclick = function () {
      const partial = {};
      wrap.querySelectorAll('input[data-f]').forEach(function (inp) {
        const f = inp.dataset.f;
        partial[f] = f === 'sources' ? inp.value.split(',').map(function (s){ return s.trim(); }).filter(Boolean) : inp.value;
      });
      const v = root.logic.validateRecord(Object.assign({}, rec, partial));
      if (!v.valid) { alert('필수 필드 누락: ' + v.missing.join(', ')); return; }
      root.store.setEdit(rec.name, partial); modal.style.display = 'none';
      if (root.render.state.currentRegion) { root.render.drawRegion(root.render.state.currentRegion); }
      root.render.drawTicker();
    };
  };
  app.wireExport = function () {
    document.getElementById('btn-export').addEventListener('click', function () {
      root.exporter.downloadInstitutions(root.render.allInstitutions());
    });
  };

  app.init = function () {
    if (window.__d3failed || typeof d3 === 'undefined') { if (root.render.renderFallback) root.render.renderFallback(); return; }
    root.render.drawNational();
    root.render.applyWatchStyles();
    app.wireFilters();
    root.render.drawTicker();
    document.getElementById('btn-back').addEventListener('click', app.backToNational);
    app.wireExport();
  };
  document.addEventListener('DOMContentLoaded', app.init);

  root.app = app;
})(typeof self !== 'undefined' ? self : this);
