(function (root) {
  'use strict';
  const app = {};

  // 서버 모드 부트스트랩(계획 B): /institutions가 응답하면(2xx) 서버가 authoritative store.
  // file://나 서버 부재 시 fetch가 예외/실패 → 아무 것도 하지 않고 조용히 폴백(기존 동작 그대로).
  app.bootstrapServer = function () {
    return fetch('/institutions').then(function (r) {
      if (!r.ok) return;
      return r.json().then(function (rows) {
        root.store.setServerData(root.serverdata.mergeUnion(window.institutions || [], rows));
      });
    }).catch(function () { /* 폴백 — 아무것도 하지 않음 */ })
      .then(function () { if (app.applyServerModeUI) app.applyServerModeUI(); });
  };

  app.enterRegion = function (code) {
    // 선택 지역만 남기고 나머지를 흐리게 → "지금 뭘 골랐는지"를 지도 자체로 보여준다.
    // (지도 위에 큰 지역명을 덮어쓰는 방식은 사용자 피드백으로 제거했다.)
    root.render.focusRegion(code);
    document.getElementById('cloud-overlay').classList.add('active');
    root.render.loadRegionGeoWithRetry(code, function () {
      // proceed는 flyZoomTo의 transition 이벤트에 의존하지 않고 enterRegion 자체
      // 타이머로 보장한다 — d3.zoom과 얽힌 transition 'end'가 불발되어 지역 뷰가
      // 영영 안 뜨는 문제를 근본 차단. flyZoomTo는 순수 시각 연출만 담당.
      let done = false;
      function proceed() {
        if (done) return; done = true;
        root.render.drawRegion(code);
        // 직접 제거(비활성 탭에서 rAF가 스로틀되어 오버레이가 안 걷히는 문제 방지).
        // CSS opacity transition이 "구름 걷힘" 페이드를 담당.
        document.getElementById('cloud-overlay').classList.remove('active');
        document.getElementById('breadcrumb').style.display = 'block';
        document.getElementById('crumb-region').textContent = root.render.REGION_NAME[code] || code;
      }
      // A3: 전국 geo에서 해당 시도 feature를 찾으면 지오메트릭 fly-to(시각 연출),
      // 못 찾으면 크로스페이드만. 어느 경우든 proceed는 타이머로 확정 실행.
      const fk = window.geoKorea;
      const feature = fk && fk.features
        ? fk.features.filter(function (f) { return f.properties.code === code; })[0]
        : null;
      if (feature && root.render.flyZoomTo) root.render.flyZoomTo(feature);
      // 확대(ZOOM_MS)가 끝난 뒤 HOLD_MS만큼 멈췄다가 상세로 전환 — 툭 끊기지 않게.
      setTimeout(proceed, (feature ? root.render.ZOOM_MS : 0) + root.render.HOLD_MS);
    }, function () {
      document.getElementById('cloud-overlay').classList.remove('active');
      root.render.drawNational();   // 실패 시 흐림 상태가 남지 않게 원복
    });
  };
  app.backToNational = function () {
    document.getElementById('breadcrumb').style.display = 'none';
    // drawNational이 내부 zoom transform을 identity로 재동기화하므로(A4) 잔존 transform 없이 복귀.
    root.render.drawNational();
  };
  app.onTabChange = function (tab) {
    if (tab === 'regions') { root.render.drawRegionGrid(); root.render.drawPinBar(); }
    else if (tab === 'map') { root.render.applyWatchStyles(); }
    // 탭을 벗어나면 폴링·스트림을 멈춘다(백그라운드에서 계속 돌지 않게).
    [['workflow', root.workflow], ['chat', root.chat], ['knowledge', root.knowledge]]
      .forEach(function (pair) {
        const mod = pair[1];
        if (!mod) return;
        if (tab === pair[0]) { if (mod.mount) mod.mount(); }
        else if (mod.unmount) mod.unmount();
      });
  };

  // 워크플로·대화·지식 탭과 쪽지함은 서버 모드 전용 — API가 없는 file://에서는 숨긴다.
  app.SERVER_ONLY_IDS = ['tab-btn-workflow', 'tab-btn-chat', 'tab-btn-knowledge', 'btn-notify'];
  app.applyServerModeUI = function () {
    const on = root.store.isServerMode();
    app.SERVER_ONLY_IDS.forEach(function (id) {
      const elm = document.getElementById(id);
      if (elm) elm.style.display = on ? '' : 'none';
    });
  };

  // 내 프로필(이름·소속) — 쪽지함 조회 키이자 결재자 이름 기본값 (계획 C2).
  app.wireProfile = function () {
    const nameEl = document.getElementById('me-name');
    const teamEl = document.getElementById('me-team');
    if (!nameEl || !teamEl) return;
    const p = root.store.loadProfile();
    nameEl.value = p.name; teamEl.value = p.team;
    function save() {
      root.store.saveProfile({ name: nameEl.value.trim(), team: teamEl.value });
      if (root.notify && root.notify.onProfileChange) root.notify.onProfileChange();
    }
    nameEl.addEventListener('change', save);
    teamEl.addEventListener('change', save);
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
        if (!root.render.state.currentRegion) return;
        if (b.dataset.type === '지자체') {
          // 지자체는 마커가 아니라 면이라, 재렌더 없이 투명도만 갱신한다
          // (재렌더하면 선택 중이던 강조가 사라진다). 랭킹 목록에는 계속 남긴다.
          root.render.applyMuniDimming();
          return;
        }
        root.render.drawMarkers(root.render.state.currentRegion);
        root.render.drawRankingPanel(root.render.state.currentRegion);
      });
    });
    // 초기 enabledTypes를 체크상태와 동기화
    root.render.state.enabledTypes = new Set(
      Array.from(boxes).filter(function (b){ return b.checked; }).map(function (b){ return b.dataset.type; }));
    // 지자체 데이터가 없어 체크박스가 비활성화된 경우까지 "꺼짐"으로 보면 지도 전체가
    // 이유 없이 흐려진다 — 사용자가 직접 끈 게 아니면 켜진 것으로 취급한다.
    const muniBox = Array.from(boxes).filter(function (b){ return b.dataset.type === '지자체'; })[0];
    if (muniBox && muniBox.disabled) root.render.state.enabledTypes.add('지자체');
  };

  app.wireTheme = function () {
    const modal = document.getElementById('theme-modal');
    const btn = document.getElementById('btn-theme');
    if (!modal || !btn) return;
    const inputs = modal.querySelectorAll('[data-t]');
    const durVal = document.getElementById('theme-dur-val');

    function fill(theme) {
      inputs.forEach(function (inp) { inp.value = theme[inp.dataset.t]; });
      durVal.textContent = Number(theme.rippleDuration).toFixed(1) + 's';
    }
    function collect() {
      const t = {};
      inputs.forEach(function (inp) {
        t[inp.dataset.t] = inp.dataset.t === 'rippleDuration' ? Number(inp.value) : inp.value;
      });
      return t;
    }
    // 현재 지역 뷰면 면 색을 다시 칠해야 하므로 재렌더, 전국이면 전국을 다시 그린다.
    function repaint() {
      root.render.applyTheme();
      if (root.render.state.currentRegion) root.render.drawRegion(root.render.state.currentRegion);
      else root.render.drawNational();
    }

    btn.addEventListener('click', function () { fill(root.render.currentTheme()); modal.style.display = 'block'; });
    modal.querySelector('#theme-cancel').onclick = function () { modal.style.display = 'none'; };
    modal.querySelector('[data-t=rippleDuration]').addEventListener('input', function (e) {
      durVal.textContent = Number(e.target.value).toFixed(1) + 's';
    });
    modal.querySelector('#theme-save').onclick = function () {
      root.store.saveTheme(collect()); modal.style.display = 'none'; repaint();
    };
    modal.querySelector('#theme-reset').onclick = function () {
      root.store.resetTheme(); fill(root.render.currentTheme()); repaint();
    };
  };

  app.openEdit = function (rec) {
    const wrap = document.getElementById('edit-fields');
    const fields = root.logic.ALL_FIELDS;
    wrap.innerHTML = fields.map(function (f) {
      const val = f === 'sources' ? (Array.isArray(rec.sources) ? rec.sources.join(', ') : '') : (rec[f] || '');
      return '<label style="display:block;margin:6px 0;">' + (root.logic.FIELD_LABELS[f] || f) +
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
      if (!v.valid) { alert('필수 필드 누락: ' + v.missing.map(function(k){return root.logic.FIELD_LABELS[k]||k;}).join(', ')); return; }
      // 서버 모드이고 서버에 등록된 레코드면 서버 필드는 PUT으로 반영(부분 갱신 — undefined는
      // JSON.stringify가 제거). lng·lat·sources 등 서버에 없는 필드는 아래 setEdit(로컬 overlay)만 담당.
      const serverPatch = root.serverdata ? {
        region_code: partial.region, type: partial.type,
        contract_end: partial.contractEnd, last_bid: partial.lastBid,
        term: partial.term ? Number(partial.term) : undefined,
      } : null;
      if (root.store.isServerMode() && rec.institutionId) {
        fetch('/institutions/' + rec.institutionId, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(serverPatch),
        }).then(function (r) {
          if (!r.ok) { alert('서버 저장 실패 (' + r.status + ')'); return; }
          return app.bootstrapServer().then(function () {
            if (root.render.state.currentRegion) root.render.drawRegion(root.render.state.currentRegion);
            root.render.drawTicker();
          });
        }).catch(function () { alert('서버 연결 실패 — 저장되지 않았습니다.'); });
      } else if (root.store.isServerMode()) {
        // 서버 미등록 행(번들에만 있는 기관) — PUT할 대상이 없고, overlay도 서버 필드는
        // 더 이상 적용하지 않으므로(F4) 조용히 사라지지 않도록 알린다.
        alert('서버에 등록되지 않은 기관이라 서버 필드(기관구분·지역·주기·입찰일)는 저장되지 않습니다.\n좌표·출처 등 로컬 전용 필드만 저장됩니다.');
      }
      root.store.setEdit(rec.name, partial); modal.style.display = 'none';   // 로컬 전용 필드 overlay는 항상 유지
      if (root.render.state.currentRegion) { root.render.drawRegion(root.render.state.currentRegion); }
      root.render.drawTicker();
    };
  };
  app.wireExport = function () {
    document.getElementById('btn-export').addEventListener('click', function () {
      root.exporter.downloadInstitutions(root.render.allInstitutions());
    });
  };

  app.openAdd = function () {
    if (root.store.isServerMode()) {
      alert('서버 모드에서는 기관 추가가 아직 지원되지 않습니다 — CSV 반입을 사용하세요.');
      return;
    }
    const wrap = document.getElementById('add-fields');
    const L = root.logic.FIELD_LABELS;
    const fields = ['name','type','region','subRegion','term','lastBid','contractEnd','lng','lat','sources'];
    wrap.innerHTML = fields.map(function (f) {
      return '<label style="display:block;margin:6px 0;">' + L[f] +
        '<input data-f="' + f + '" style="width:100%;"></label>';
    }).join('') +
      '<label style="display:flex;gap:6px;align-items:center;margin:6px 0;">' +
      '<input type="checkbox" data-f="confirmed"> ' + L.confirmed + '(공고로 확인됨)</label>' +
      '<p style="color:var(--muted);font-size:11px;">확정여부를 체크하지 않으면 "추측"으로 표시됩니다.</p>';
    const modal = document.getElementById('add-modal'); modal.style.display = 'block';
    document.getElementById('add-cancel').onclick = function () { modal.style.display = 'none'; };
    document.getElementById('add-save').onclick = function () {
      const rec = {};
      wrap.querySelectorAll('input[data-f]').forEach(function (inp) {
        const f = inp.dataset.f;
        if (f === 'confirmed') rec.confirmed = inp.checked;
        else if (f === 'sources') rec.sources = inp.value ? inp.value.split(',').map(function (s){ return s.trim(); }).filter(Boolean) : [];
        else if (f === 'term') rec.term = inp.value ? Number(inp.value) : undefined;
        else if (f === 'lng' || f === 'lat') rec[f] = inp.value ? Number(inp.value) : undefined;
        else if (inp.value) rec[f] = inp.value;
      });
      const v = root.logic.validateRecord(rec);
      if (!v.valid) { alert('필수 누락: ' + v.missing.map(function(k){return root.logic.FIELD_LABELS[k];}).join(', ')); return; }
      rec.updatedAt = new Date().toISOString().slice(0,10);
      const data = root.render.baseInstitutions().slice(); data.push(rec);
      root.store.saveData(data); modal.style.display = 'none';
      root.render.drawTicker();
      if (root.render.state.currentRegion) root.render.drawRegion(root.render.state.currentRegion);
      else root.render.drawNational();
    };
  };

  app.wireData = function () {
    document.getElementById('btn-add').addEventListener('click', app.openAdd);
    document.getElementById('btn-tmpl').addEventListener('click', function () { root.exporter.downloadCsvTemplate(); });
    document.getElementById('file-csv').addEventListener('change', function (e) {
      const file = e.target.files[0]; if (!file) return;
      if (root.store.isServerMode()) {
        // 서버 모드: 기존 12열 CSV 그대로 multipart로 올려 서버 반입(SCHEMA §⑦의 상위집합 계약).
        const fd = new FormData(); fd.append('file', file);
        fetch('/institutions/import', { method: 'POST', body: fd })
          .then(function (r) {
            if (!r.ok) { alert('반입 실패 (' + r.status + ')'); return; }
            return r.json().then(function (data) {
              alert(data.imported + '건을 반영했습니다.');
              return app.bootstrapServer().then(function () {
                root.render.drawTicker(); root.render.drawNational();
              });
            });
          }).catch(function () { alert('서버 연결 실패 — 반입되지 않았습니다.'); });
        e.target.value = ''; return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        const recs = root.logic.parseCsv(String(reader.result));
        if (!recs.length) { alert('CSV에서 읽은 행이 없습니다.'); return; }
        recs.forEach(function (r) { if (!r.updatedAt) r.updatedAt = new Date().toISOString().slice(0,10); });
        root.store.saveData(recs);
        alert(recs.length + '건을 반영했습니다.');
        root.render.drawTicker(); root.render.drawNational();
      };
      reader.readAsText(file, 'utf-8'); e.target.value = '';
    });
  };

  app.init = function () {
    // 서버 모드 부트스트랩 먼저 시도(성공/실패 무관하게 이어서 기존 초기화 순서 진행).
    return app.bootstrapServer().then(function () {
      if (window.__d3failed || typeof d3 === 'undefined') { if (root.render.renderFallback) root.render.renderFallback(); return; }
      root.render.applyTheme();   // 저장된 색/속도를 그리기 전에 반영
      root.render.drawNational();
      root.render.applyWatchStyles();
      app.wireFilters();
      root.render.drawTicker();
      document.getElementById('btn-back').addEventListener('click', app.backToNational);
      app.wireExport();
      app.wireData();
      app.wireTheme();
      app.wireProfile();
      // 쪽지함은 탭이 아니라 상시 버튼이라 여기서 한 번 켠다(미읽음 배지 30초 폴링).
      if (root.notify && root.store.isServerMode()) root.notify.start();
    });
  };
  document.addEventListener('DOMContentLoaded', app.init);

  root.app = app;
})(typeof self !== 'undefined' ? self : this);
