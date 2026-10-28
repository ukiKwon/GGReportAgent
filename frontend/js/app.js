(function (root) {
  'use strict';
  const app = {};

  // 서버 모드 부트스트랩(계획 B): /institutions가 응답하면(2xx) 서버가 authoritative store.
  // file://나 서버 부재 시 fetch가 예외/실패 → 아무 것도 하지 않고 조용히 폴백(기존 동작 그대로).
  app.bootstrapServer = function () {
    // 공고 일정(계획 D)은 부가 정보라 실패해도 병합을 막지 않는다 — 빈 배열로 진행한다.
    const bidCases = fetch('/bidcases/latest')
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });

    return fetch('/institutions').then(function (r) {
      if (!r.ok) return;
      return Promise.all([r.json(), bidCases]).then(function (res) {
        const merged = root.serverdata.mergeUnion(window.institutions || [], res[0]);
        root.store.setServerData(root.serverdata.applyBidCases(merged, res[1]));
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
    // 기관 분류·CSV·지도 색상과 임박 TOP5는 지도·지역별에서만 의미가 있다 —
    // 다른 화면(워크플로 등)에서 '기관 분류 선택'이 보이면 그 화면과 무관한 조작처럼 읽힌다.
    const mapControls = root.nav ? root.nav.showsMapControls(tab) : true;
    ['topbar', 'ticker-strip'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.style.display = mapControls ? '' : 'none';
    });
    if (app.syncNavActive) app.syncNavActive(tab);
    if (tab === 'regions') { root.render.drawRegionGrid(); root.render.drawPinBar(); }
    else if (tab === 'map') { root.render.applyWatchStyles(); }
    // 탭을 벗어나면 폴링·스트림을 멈춘다(백그라운드에서 계속 돌지 않게).
    [['workflow', root.workflow], ['chat', root.chat], ['knowledge', root.knowledge],
     ['designer', root.designer], ['approvals', root.approvals], ['admin', root.admin]]
      .forEach(function (pair) {
        const mod = pair[1];
        if (!mod) return;
        if (tab === pair[0]) { if (mod.mount) mod.mount(); }
        else if (mod.unmount) mod.unmount();
      });
  };

  // 탭 노출은 **역할별 메뉴 권한**이 정한다(계획 I). 예전에는 이 규칙이 두 군데로
  // 흩어져 있었다 — 서버 전용 목록(SERVER_ONLY_IDS)과 소속 문자열 비교
  // (applyDesignerUI). 이제 서버가 역할별 값을 주고 menu_rules가 계산한다.
  // 쪽지함 버튼은 탭이 아니지만 서버 전용이라 같이 토글한다.
  app.SERVER_ONLY_IDS = ['btn-notify'];

  app.applyServerModeUI = function () {
    const on = root.store.isServerMode();
    app.SERVER_ONLY_IDS.forEach(function (id) {
      const elm = document.getElementById(id);
      if (elm) elm.style.display = on ? '' : 'none';
    });
    return app.applyMenuPermissions();
  };

  // 겹친 /menus 응답 중 마지막 것만 칠하게 하는 문지기. 첫 호출 때 만든다 —
  // menu_rules.js가 먼저 로드되지만 로드 순서에 기대지 않는다(근거는 latestGuard 주석).
  let menuGuard = null;

  // 서버가 준 역할별 메뉴로 탭을 켜고 끈다. 프로필은 언제든 바뀌므로(계정 전환기)
  // onProfileChanged에서도 부른다.
  app.applyMenuPermissions = function () {
    const serverMode = root.store.isServerMode();
    if (!serverMode) { app.paintTabs(null, false); return Promise.resolve(); }
    if (!menuGuard) menuGuard = root.menuRules.latestGuard();
    const token = menuGuard.next();
    const role = (root.store.loadProfile().team || '').trim();
    return fetch('/menus?role=' + encodeURIComponent(role)).then(function (r) {
      if (!r.ok) throw new Error('menus ' + r.status);
      return r.json();
    }).then(function (body) {
      if (menuGuard.accept(token)) app.paintTabs(body.menus, true);
    })
      // 권한을 모를 때는 **닫는 쪽**으로 기운다 — 열어주는 쪽으로 기울면 서버가
      // 잠깐 흔들린 순간 전원이 관리 화면을 보게 된다(menu_rules와 같은 원칙).
      // 이 실패 경로도 문지기를 지난다 — 안 그러면 늦게 도착한 실패가 새 역할의
      // 정상 화면을 덮어 탭을 전부 닫아버린다.
      .catch(function () { if (menuGuard.accept(token)) app.paintTabs(null, true); });
  };

  app.paintTabs = function (menus, serverMode) {
    const rules = root.menuRules;
    if (!rules) return;
    const visible = rules.visibleTabs(menus, serverMode);
    let activeKey = null;
    rules.MENU_KEYS.forEach(function (key) {
      const btn = document.getElementById(rules.tabButtonId(key));
      if (!btn) return;
      btn.style.display = visible[key] ? '' : 'none';
      if (btn.classList.contains('active')) activeKey = key;
    });
    // 숨기는 순간 그 탭을 보고 있었다면 빈 화면이 남는다 — 지도로 되돌린다.
    app.paintNav(visible);
    const back = rules.activeFallback(activeKey, visible);
    if (back) {
      const btn = document.querySelector('.tab-btn[data-tab="' + back + '"]');
      if (btn) btn.click();
    }
  };

  // 모달 탈출구 — 배경 클릭 / Esc. 버튼이 화면 밖으로 밀리는 등 어떤 이유로든
  // 닫기 버튼에 닿지 못해도 화면이 잠기지 않게 한다(사용자 보고: 편집 팝업이 안 닫힘).
  app.wireModalDismiss = function () {
    const overlays = document.querySelectorAll('.modal-overlay');
    overlays.forEach(function (ov) {
      ov.addEventListener('click', function (e) {
        // 안쪽(내용 상자)을 눌렀을 때는 닫지 않는다 — 배경 자체를 눌렀을 때만.
        if (e.target === ov) ov.style.display = 'none';
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      overlays.forEach(function (ov) { ov.style.display = 'none'; });
    });
  };

  // 프로필의 소속·직책 두 칸 ↔ 저장되는 역할 문자열 하나 (roles.js가 규칙 본체).
  // 모르는 역할(옛 `본부장` 프로필 등)은 **소속 칸에 그 값 그대로** 임시 항목으로
  // 넣어 보여준다 — 임의로 `영업팀/팀원`을 끼우면 사용자의 신원이 조용히 바뀐다.
  const LEGACY_FLAG = 'data-legacy';

  function paintPositions(teamEl, posEl, position) {
    const legacy = teamEl.selectedOptions[0] && teamEl.selectedOptions[0].hasAttribute(LEGACY_FLAG);
    posEl.style.display = legacy ? 'none' : '';
    if (legacy) { posEl.innerHTML = ''; return; }
    const list = root.roles.positionsFor(teamEl.value);
    posEl.innerHTML = list.map(function (p) {
      return '<option>' + root.logic.esc(p) + '</option>';
    }).join('');
    posEl.value = list.indexOf(position) >= 0 ? position : list[0];
  }

  function dropLegacyOptions(teamEl) {
    Array.prototype.slice.call(teamEl.querySelectorAll('[' + LEGACY_FLAG + ']'))
      .forEach(function (o) { o.remove(); });
  }

  function showRole(teamEl, posEl, role) {
    dropLegacyOptions(teamEl);
    const parts = root.roles.split(role);
    if (parts) {
      teamEl.value = parts.affiliation;
    } else {
      const opt = document.createElement('option');
      opt.textContent = role || '(소속 없음)';
      opt.value = role || '';
      opt.setAttribute(LEGACY_FLAG, '1');
      teamEl.appendChild(opt);
      teamEl.value = opt.value;
    }
    paintPositions(teamEl, posEl, parts ? parts.position : null);
  }

  function readRole(teamEl, posEl) {
    const opt = teamEl.selectedOptions[0];
    if (opt && opt.hasAttribute(LEGACY_FLAG)) return teamEl.value;   // 옛 값은 그대로 둔다
    return root.roles.compose(teamEl.value, posEl.value);
  }

  // 내 프로필(이름·소속·직책) — 쪽지함 조회 키이자 결재자 이름 기본값 (계획 C2).
  app.wireProfile = function () {
    const nameEl = document.getElementById('me-name');
    const teamEl = document.getElementById('me-team');
    const posEl = document.getElementById('me-pos');
    if (!nameEl || !teamEl || !posEl) return;
    const p = root.store.loadProfile();
    nameEl.value = p.name;
    showRole(teamEl, posEl, p.team);

    function save() {
      root.store.saveProfile({ name: nameEl.value.trim(), team: readRole(teamEl, posEl) });
      app.onProfileChanged();
    }
    nameEl.addEventListener('change', save);
    // 소속을 바꾸면 직책 목록부터 다시 그린다 — 전산팀에는 부장이 없다.
    teamEl.addEventListener('change', function () {
      // 옛 값(`본부장` 등)에서 정상 소속으로 옮겼으면 그 임시 항목을 치운다.
      // 안 그러면 없는 소속이 목록에 계속 남아 다시 고를 수 있다.
      if (!teamEl.selectedOptions[0].hasAttribute(LEGACY_FLAG)) dropLegacyOptions(teamEl);
      paintPositions(teamEl, posEl, posEl.value);
      save();
    });
    posEl.addEventListener('change', save);
    app.showProfileRole = function (role) { showRole(teamEl, posEl, role); };
    app.loadAccountSwitcher();
  };

  // 프로필이 바뀌면 그 값을 쓰는 화면들을 따라 갱신한다.
  app.onProfileChanged = function () {
    if (root.notify && root.notify.onProfileChange) root.notify.onProfileChange();
    if (root.approvals && root.approvals.onProfileChange) root.approvals.onProfileChange();
    app.applyMenuPermissions();
    if (app.paintUserArea) app.paintUserArea();
    // 워크플로 탭이 이미 그려져 있으면 결재자 입력도 새 이름으로 맞춘다.
    const by = document.getElementById('wf-by');
    if (by) by.value = root.store.loadProfile().name || '';
  };

  // 계정 전환기(데모 전용) — 목록은 서버가 실데이터에서 뽑아준다.
  // 운영에서는 demo 플래그가 false라 아예 뜨지 않는다.
  app.loadAccountSwitcher = function () {
    const sel = document.getElementById('me-switch');
    if (!sel) return;
    return fetch('/accounts').then(function (r) {
      if (!r.ok) throw new Error('accounts ' + r.status);
      return r.json();
    }).then(function (body) {
      if (!body.demo || !body.accounts.length) { sel.style.display = 'none'; return; }
      sel.innerHTML = '<option value="">계정 전환…</option>' + body.accounts.map(function (a) {
        return '<option value="' + root.logic.esc(root.logic.accountValue(a)) + '">' +
          root.logic.esc(root.logic.accountLabel(a)) + '</option>';
      }).join('');
      sel.style.display = '';
      sel.onchange = function () {
        if (!this.value) return;
        const picked = root.logic.parseAccountValue(this.value);
        document.getElementById('me-name').value = picked.name;
        if (app.showProfileRole) app.showProfileRole(picked.team);
        root.store.saveProfile(picked);
        app.onProfileChanged();
        this.value = '';                 // 다음 전환을 위해 되돌린다(현재 값은 좌측 입력에 보인다)
      };
    }).catch(function () { sel.style.display = 'none'; });
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
    // 서버 모드에서 저장 경로가 없는 필드는 잠근다 — 예전에는 고칠 수 있는 것처럼 보이고
    // 저장을 눌러도 서버·화면 어디에도 반영되지 않으면서 오류도 안 났다(무음 실패).
    const serverMode = root.store.isServerMode();
    wrap.innerHTML = fields.map(function (f) {
      const val = f === 'sources' ? (Array.isArray(rec.sources) ? rec.sources.join(', ') : '') : (rec[f] || '');
      const locked = serverMode && root.logic.SERVER_UNSAVABLE_FIELDS.indexOf(f) >= 0;
      const label = (root.logic.FIELD_LABELS[f] || f) + (locked ? ' (서버 모드에서는 변경 불가)' : '');
      return '<label style="display:block;margin:6px 0;">' + label +
        '<input data-f="' + f + '" value="' + root.logic.esc(val) + '"' +
        (locked ? ' disabled title="기관명은 서버 등록·병합의 기준 이름이라 화면에서 바꿀 수 없습니다"' +
          ' style="width:100%;opacity:.55;cursor:not-allowed;"' : ' style="width:100%;"') +
        '></label>';
    }).join('');
    const modal = document.getElementById('edit-modal'); modal.style.display = 'block';
    document.getElementById('edit-cancel').onclick = function () { modal.style.display = 'none'; };
    document.getElementById('edit-save').onclick = function () {
      const partial = {};
      wrap.querySelectorAll('input[data-f]').forEach(function (inp) {
        if (inp.disabled) return;   // 잠긴 필드는 저장 대상이 아니다(값도 원본 그대로다)
        const f = inp.dataset.f;
        partial[f] = f === 'sources' ? inp.value.split(',').map(function (s){ return s.trim(); }).filter(Boolean) : inp.value;
      });
      const v = root.logic.validateRecord(Object.assign({}, rec, partial));
      if (!v.valid) { alert('필수 필드 누락: ' + v.missing.map(function(k){return root.logic.FIELD_LABELS[k]||k;}).join(', ')); return; }
      // 서버 모드이고 서버에 등록된 레코드면 서버 필드는 PUT으로 반영(부분 갱신 — undefined는
      // JSON.stringify가 제거). lng·lat·sources 등 서버에 없는 필드는 아래 setEdit(로컬 overlay)만 담당.
      // 값을 **비운 것**과 **안 건드린 것**은 다르다. 잠긴(비활성) 입력은 partial에
      // 아예 없으므로 undefined → JSON.stringify가 키를 지운다(= 서버가 보존).
      // 비워서 저장한 칸은 null로 보내 서버가 지우게 한다 — 예전에는 term이
      // `'' ? Number : undefined`라 **비울 방법이 없었다**(B 이월).
      function clearable(v) { return v === undefined ? undefined : (v === '' ? null : v); }
      const serverPatch = root.serverdata ? {
        region_code: clearable(partial.region), type: clearable(partial.type),
        contract_end: clearable(partial.contractEnd), last_bid: clearable(partial.lastBid),
        term: partial.term === undefined ? undefined
          : (partial.term === '' ? null : Number(partial.term)),
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

      // 서버 모드: 서버가 authoritative store다. 서버 필드는 POST로 만들고, 서버에
      // 대응 컬럼이 없는 좌표·출처 등은 여느 편집과 같이 localStorage overlay에 남긴다
      // (그게 없으면 새 기관이 지도에 찍힐 좌표를 갖지 못한다).
      if (root.store.isServerMode()) {
        fetch('/institutions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(root.serverdata.toServerRow(rec)),
        }).then(function (r) {
          if (r.status === 409) { alert('이미 등록된 기관명입니다 — 기존 기관을 편집하세요.'); return; }
          if (!r.ok) { alert('기관 추가 실패 (' + r.status + ')'); return; }
          const local = {};
          root.store.LOCAL_ONLY_FIELDS.forEach(function (f) {
            if (rec[f] !== undefined) local[f] = rec[f];
          });
          root.store.setEdit(rec.name, local);
          modal.style.display = 'none';
          return app.bootstrapServer().then(function () {
            root.render.drawTicker();
            if (root.render.state.currentRegion) root.render.drawRegion(root.render.state.currentRegion);
            else root.render.drawNational();
          });
        }).catch(function () { alert('서버 연결 실패 — 추가되지 않았습니다.'); });
        return;
      }

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

  // ── 좌측 업무 메뉴 ─────────────────────────────────────────────────────────
  // 화면 전환 자체는 기존 .tab-btn(숨김) 클릭이 그대로 한다 — 권한 계산·폴링 정리·
  // 폴백이 전부 그 경로에 걸려 있어서, 사이드바는 "그 버튼을 누르는 새 손잡이"일 뿐이다.
  let openCat = null;           // 열려 있는 카테고리는 하나뿐(아코디언)
  let navBuilt = [];
  let navActiveId = null;
  let navTabs = [];             // 우측 화면 탭(메모리만, 최대 nav.MAX_TABS)
  let navDomSig = '';           // 항목 구성이 같으면 DOM을 다시 만들지 않는다(전환 애니메이션 보존)
  let noticeTimer = null;

  function navContext() {
    const session = root.store.loadSession();
    return {
      role: (root.store.loadProfile().team || '').trim(),
      master: !!(session && session.mode === 'account' && session.id === root.login.MASTER_ID)
    };
  }

  function activeTabKey() {
    const btn = document.querySelector('.tab-btn.active');
    return btn ? btn.id.replace('tab-btn-', '') : null;
  }

  function findNavItem(id) {
    let found = null;
    navBuilt.forEach(function (c) { c.items.forEach(function (it) { if (it.id === id) found = it; }); });
    return found;
  }

  app.showSoon = function (itemId, label, tag, note) {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-view').forEach(function (v) { v.classList.remove('active'); });
    document.getElementById('tab-soon').classList.add('active');
    document.getElementById('soon-title').textContent = label;
    document.getElementById('soon-badge').textContent = tag || '준비중';
    document.getElementById('soon-note').textContent = note || '아직 제공되지 않는 기능입니다. 순서대로 준비하고 있습니다.';
    navActiveId = itemId;
    app.onTabChange('soon');
  };

  // 화면이 바뀔 때마다(어느 경로든) 불린다: 활성 항목 갱신 → 탭 보관 → 그 카테고리만 열기.
  app.syncNavActive = function (tab) {
    if (tab !== 'soon') navActiveId = activeTabKey();
    const item = navActiveId ? findNavItem(navActiveId) : null;
    if (item) {
      navTabs = root.nav.openTab(navTabs, item, navActiveId).tabs;   // 가득 찼으면 보관만 건너뛴다
      openCat = root.nav.categoryOf(navBuilt, navActiveId);
    }
    app.drawNav();
    drawTabs();
  };

  function activateItem(item) {
    if (item.soon) { app.showSoon(item.id, item.label, item.tag, item.note); return; }
    const btn = document.getElementById('tab-btn-' + item.key);
    if (btn) btn.click();
  }

  function showTabNotice(text) {
    const n = document.getElementById('tab-notice');
    if (!n) return;
    n.textContent = text;
    n.classList.add('show');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () { n.classList.remove('show'); }, 2500);
  }

  // 사이드바 항목·탭 모두 이 경로로 연다. 새 탭이 필요한데 가득 찼으면 화면을 옮기지 않는다.
  function openNavItem(item) {
    const r = root.nav.openTab(navTabs, item, navActiveId);
    if (r.full) {
      showTabNotice('화면은 최대 ' + root.nav.MAX_TABS + '개까지 열어 둘 수 있습니다. 탭을 닫고 다시 열어 주세요.');
      return;
    }
    activateItem(item);
  }

  function closeNavTab(id) {
    const r = root.nav.closeTab(navTabs, id, navActiveId);
    navTabs = r.tabs;
    if (id !== navActiveId) { drawTabs(); return; }
    const next = r.activeId ? findNavItem(r.activeId) : null;
    if (next) { activateItem(next); return; }
    drawTabs();
    const mapBtn = document.getElementById('tab-btn-map');   // 마지막 탭을 닫으면 지도로
    if (mapBtn) mapBtn.click();
  }

  function drawTabs() {
    const bar = document.getElementById('tab-bar');
    const list = document.getElementById('tab-list');
    if (!bar || !list) return;
    const esc = root.logic.esc;
    bar.style.display = navTabs.length ? '' : 'none';
    list.innerHTML = navTabs.map(function (t) {
      return '<div class="stab' + (t.id === navActiveId ? ' active' : '') + '" role="tab" data-tab-id="' + esc(t.id) +
        '" title="' + esc(t.label) + '"><span class="stab-label">' + esc(t.label) +
        '</span><span class="stab-x" role="button" aria-label="' + esc(t.label) + ' 탭 닫기">×</span></div>';
    }).join('');
  }

  // 항목 구성(카테고리·항목 id)이 바뀔 때만 DOM을 새로 만든다. 열림·활성 표시는 클래스만 바꿔
  // CSS 전환(스르륵)이 끊기지 않게 한다.
  app.drawNav = function () {
    const el = document.getElementById('side-nav');
    if (!el) return;
    const sig = navBuilt.map(function (c) {
      return c.id + ':' + c.items.map(function (i) { return i.id; }).join(',');
    }).join('|');
    if (sig !== navDomSig) {
      const esc = root.logic.esc;
      el.innerHTML = navBuilt.map(function (cat) {
        const items = cat.items.map(function (it) {
          return '<button class="nav-item' + (it.soon ? ' soon' : '') + '" data-nav="' + esc(it.id) +
            '" title="' + esc(it.label) + '"><span class="nav-label">' + esc(it.label) + '</span>' +
            (it.soon ? '<span class="nav-soon-tag">' + esc(it.tag || '준비중') + '</span>' : '') + '</button>';
        }).join('');
        return '<button class="nav-cat" data-cat="' + esc(cat.id) + '" title="' + esc(cat.title) + '">' +
          '<span class="nav-label">' + esc(cat.title) + '</span></button>' +
          '<div class="nav-items" data-for="' + esc(cat.id) + '"><div class="nav-items-in">' + items + '</div></div>';
      }).join('');
      navDomSig = sig;
    }
    const activeCat = root.nav.categoryOf(navBuilt, navActiveId);
    el.querySelectorAll('.nav-cat').forEach(function (b) {
      b.classList.toggle('open', b.dataset.cat === openCat);
      b.classList.toggle('has-active', b.dataset.cat === activeCat);
    });
    el.querySelectorAll('.nav-items').forEach(function (d) {
      d.classList.toggle('open', d.dataset.for === openCat);
    });
    el.querySelectorAll('.nav-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.nav === navActiveId);
    });
  };

  app.paintNav = function (visible) {
    if (!root.nav || !document.getElementById('side-nav')) return;
    navBuilt = root.nav.build(visible, navContext());
    if (!navActiveId) navActiveId = activeTabKey();
    navTabs = root.nav.pruneTabs(navTabs, navBuilt);
    // 준비중 화면을 보고 있었는데 그 항목이 더는 안 보이면(로그아웃 등) 지도로 돌려보낸다.
    if (navActiveId && navActiveId.indexOf('soon:') === 0 && !root.nav.categoryOf(navBuilt, navActiveId)) {
      const mapBtn = document.getElementById('tab-btn-map');
      navActiveId = 'map';
      if (mapBtn) mapBtn.click();
    }
    if (openCat === null && navActiveId) openCat = root.nav.categoryOf(navBuilt, navActiveId);
    const cur = navActiveId ? findNavItem(navActiveId) : null;
    if (cur) navTabs = root.nav.openTab(navTabs, cur, navActiveId).tabs;   // 지금 보는 화면은 처음부터 탭으로
    app.drawNav();
    drawTabs();
  };

  app.wireNav = function () {
    const el = document.getElementById('side-nav');
    if (!el) return;
    el.addEventListener('click', function (e) {
      const cat = e.target.closest('.nav-cat');
      if (cat) {
        // 아코디언: 다른 카테고리는 닫고, 열린 걸 다시 누르면 닫는다.
        openCat = (openCat === cat.dataset.cat) ? null : cat.dataset.cat;
        app.drawNav();
        return;
      }
      const item = e.target.closest('.nav-item');
      if (!item) return;
      const found = findNavItem(item.dataset.nav);
      if (found) openNavItem(found);
    });
    const list = document.getElementById('tab-list');
    if (list) list.addEventListener('click', function (e) {
      const tab = e.target.closest('.stab');
      if (!tab) return;
      const id = tab.dataset.tabId;
      if (e.target.closest('.stab-x')) { closeNavTab(id); return; }
      const found = findNavItem(id);
      if (found) openNavItem(found);
    });
    // 첫 그림: 권한 조회 전에는 지도·지역별만(닫는 쪽으로 — menu_rules와 같은 원칙).
    app.paintNav(root.menuRules.visibleTabs(null, false));
  };

  // ── 로그인(프로토타입) — login.js가 규칙, 여기는 DOM 연결 ───────────────────────
  // 세션이 없으면 로그인 화면이 첫 화면이다. 로그인은 기존 프로필을 채울 뿐이라
  // 쪽지함·결재자 기본값·/menus 호출은 onProfileChanged 한 줄로 따라온다.
  function byId(id) { return document.getElementById(id); }

  app.paintUserArea = function () {
    const session = root.store.loadSession();
    const chip = byId('profile-chip');
    document.body.classList.toggle('is-guest', !(session && session.mode === 'account'));
    if (chip) chip.textContent = root.login.chipText(session, root.store.loadProfile());
    const pop = byId('profile-pop');
    if (pop && !(session && session.mode === 'account')) pop.style.display = 'none';
  };

  app.showLogin = function (message) {
    const view = byId('login-view');
    if (!view) return;
    view.classList.remove('hidden');
    byId('login-msg').textContent = message || '';
    byId('login-pw').value = '';
    byId('login-id').focus();
  };

  app.enterApp = function (session, profile) {
    root.store.saveSession(session);
    root.store.saveProfile(profile);
    if (app.showProfileRole) {
      byId('me-name').value = profile.name;
      app.showProfileRole(profile.team);
    }
    byId('login-view').classList.add('hidden');
    app.paintUserArea();
    app.onProfileChanged();
  };

  app.logout = function () {
    root.store.clearSession();
    root.store.saveProfile({ name: '', team: '' });
    if (app.showProfileRole) { byId('me-name').value = ''; app.showProfileRole(''); }
    byId('profile-pop').style.display = 'none';
    app.paintUserArea();
    app.onProfileChanged();
    app.showLogin('');
  };

  app.wireLogin = function () {
    const view = byId('login-view');
    if (!view || !root.login) return;
    const idEl = byId('login-id');
    const roleEl = byId('login-role');
    roleEl.innerHTML = '<option value="">직접 입력</option>' + root.login.groups().map(function (g) {
      return '<optgroup label="' + root.logic.esc(g.title) + '">' + g.accounts.map(function (a) {
        return '<option value="' + root.logic.esc(a.id) + '">' + root.logic.esc(root.login.label(a)) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    // 팀/직위를 고르면 아이디가 채워지고, 아이디를 직접 치면 드롭다운이 따라간다.
    roleEl.addEventListener('change', function () { if (roleEl.value) idEl.value = roleEl.value; });
    idEl.addEventListener('input', function () {
      const a = root.login.byId(idEl.value);
      roleEl.value = a ? a.id : '';
    });

    function submit() {
      const a = root.login.authenticate(idEl.value, byId('login-pw').value);
      if (!a) { byId('login-msg').textContent = '등록된 임시 계정이 아닙니다. 팀/직위에서 골라 보세요.'; return; }
      app.enterApp({ mode: 'account', id: a.id }, { name: a.name, team: a.role });
    }
    byId('login-go').addEventListener('click', submit);
    [idEl, byId('login-pw')].forEach(function (el) {
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    });
    // 둘러보기 = 프로필을 비운 채 지금까지의 '/' 화면(지도·지역별)으로 들어간다.
    byId('login-guest').addEventListener('click', function () {
      app.enterApp({ mode: 'guest', id: '' }, { name: '', team: '' });
    });

    // 프로필 칩: 로그인 상태면 편집 팝오버, 둘러보기 상태면 로그인 화면.
    byId('profile-chip').addEventListener('click', function (e) {
      e.stopPropagation();
      const session = root.store.loadSession();
      if (!(session && session.mode === 'account')) { app.showLogin(''); return; }
      const pop = byId('profile-pop');
      const open = pop.style.display === 'none';
      pop.style.display = open ? '' : 'none';
      byId('profile-chip').setAttribute('aria-expanded', String(open));
    });
    byId('profile-pop').addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { byId('profile-pop').style.display = 'none'; });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') byId('profile-pop').style.display = 'none';
    });
    byId('btn-logout').addEventListener('click', app.logout);

    // 첫 화면: 세션이 있으면 바로 앱, 없으면 로그인(마크업 기본값이 "보임"이라 깜빡임이 없다).
    if (root.store.loadSession()) view.classList.add('hidden');
    app.paintUserArea();
  };

  app.init = function () {
    app.wireLogin();
    app.wireNav();
    // 서버 모드 부트스트랩 먼저 시도(성공/실패 무관하게 이어서 기존 초기화 순서 진행).
    return app.bootstrapServer().then(function () {
      if (window.__d3failed || typeof d3 === 'undefined') { if (root.render.renderFallback) root.render.renderFallback(); return; }
      root.render.applyTheme();   // 저장된 색/속도를 그리기 전에 반영
      root.render.drawNational();
      root.render.applyWatchStyles();
      app.wireFilters();
      root.render.drawTicker();
      root.render.startTickerSync();
      document.getElementById('btn-back').addEventListener('click', app.backToNational);
      app.wireExport();
      app.wireData();
      app.wireTheme();
      app.wireProfile();
      app.wireModalDismiss();
      // 쪽지함은 탭이 아니라 상시 버튼이라 여기서 한 번 켠다(미읽음 배지 30초 폴링).
      if (root.notify && root.store.isServerMode()) root.notify.start();
    });
  };
  document.addEventListener('DOMContentLoaded', app.init);

  root.app = app;
})(typeof self !== 'undefined' ? self : this);
