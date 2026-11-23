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
      .then(function () {
        if (app.applyServerModeUI) app.applyServerModeUI();
        // 시작화면이 기관 목록보다 먼저 열렸으면(빠른 로그인·새로고침 복원) 서버 모드가 아니라고 보고 '로그인과 서버 연결이 필요합니다'로 굳는다 — 목록이 온 뒤 다시 불러온다(11-19 실측)
        if (root.portal && root.portal.onDataReady) root.portal.onDataReady();
      });
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
    if (tab !== 'soon' && root.portal && root.portal.unmount) root.portal.unmount();   // 시작화면을 떠나면 구독·요청을 거둔다(soon 안 다른 화면은 showSoon이 처리)
    if (tab === 'regions') { root.render.drawRegionGrid(); root.render.drawPinBar(); }
    else if (tab === 'map') { root.render.applyWatchStyles(); }
    // 탭을 벗어나면 폴링·스트림을 멈춘다(백그라운드에서 계속 돌지 않게).
    [['workflow', root.workflow], ['chat', root.chat], ['knowledge', root.knowledge],
     ['designer', root.designer], ['approvals', root.approvals], ['admin', root.admin], ['myinfo', root.myinfo]]
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
    applyHome(!(serverMode && menus === null));   // 서버 모드에서 권한 응답을 못 받았으면(menus=null) 시작화면 판정을 미룬다 — 항목이 아직 없어 못 여는 것이라 pending을 소모하지 않는다
  };

  // 모달 탈출구 — 배경 클릭 / Esc. 버튼이 화면 밖으로 밀리는 등 어떤 이유로든
  // 닫기 버튼에 닿지 못해도 화면이 잠기지 않게 한다(사용자 보고: 편집 팝업이 안 닫힘).
  function dlgOwns(ov) { return !!(root.dlg && root.dlg.isOpen(ov)); }
  app.wireModalDismiss = function () {
    // #tm-modal·#pp-modal은 제외 — 작성 중 닫기 확인(requestClose)을 team.js·prep.js가 직접 처리한다.
    const overlays = Array.prototype.filter.call(document.querySelectorAll('.modal-overlay'), function (ov) {
      return ov.id !== 'tm-modal' && ov.id !== 'pp-modal' && ov.id !== 'edit-modal';   // #edit-modal은 instedit.js가 저장 안 한 변경 확인과 함께 닫는다
    });
    overlays.forEach(function (ov) {
      ov.addEventListener('click', function (e) {
        // 안쪽(내용 상자)을 눌렀을 때는 닫지 않는다 — 배경 자체를 눌렀을 때만.
        // 공통 팝업 틀(dlg.js)로 열린 창은 dlg가 닫는다(저장 안 한 내용 확인·커서 복귀, qa 11-20 P2-1·P2-2).
        if (e.target === ov && !dlgOwns(ov)) ov.style.display = 'none';
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      overlays.forEach(function (ov) { if (!dlgOwns(ov)) ov.style.display = 'none'; });
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
      opt.textContent = root.roles.roleLabel(role) || '(소속 없음)';
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

  let lastRecorded = null;   // 접근 이력 연속 기록 방지용 — 계정이 바뀌거나 로그아웃하면 비워 새 계정의 시작화면도 기록한다
  // 프로필이 바뀌면 그 값을 쓰는 화면들을 따라 갱신한다.
  app.onProfileChanged = function () {
    lastRecorded = null;
    if (root.headcard && root.headcard.onProfileChange) root.headcard.onProfileChange();   // 앞 사용자가 읽은 기관장 카드·사진·모달을 버린다
    if (root.dashboard && root.dashboard.closeDetail) root.dashboard.closeDetail(false);   // 앞 사용자가 연 지도 상세 팝업(기관장 카드 포함)을 닫는다
    if (root.kbboard && root.kbboard.onProfileChange) root.kbboard.onProfileChange();      // 앞 사용자의 준비 중 제안·단계 집계를 버린다
    if (root.portal && root.portal.onProfileChange) root.portal.onProfileChange();         // 시작화면의 결재·약정·배정 응답도 앞 사용자의 것을 버린다
    if (root.dashboard && root.dashboard.onProfileChange) root.dashboard.onProfileChange();   // 입찰 공고 현황의 고른 기관·검색·거르기도 앞 사용자의 것을 버린다
    if (root.notify && root.notify.onProfileChange) root.notify.onProfileChange();
    if (root.approvals && root.approvals.onProfileChange) root.approvals.onProfileChange();
    if (root.myinfo && root.myinfo.onProfileChange) root.myinfo.onProfileChange();
    if (root.board && root.board.onProfileChange) root.board.onProfileChange();   // 계정이 바뀌면 이사회 화면 상태를 버린다
    if (root.tm && root.tm.onProfileChange) root.tm.onProfileChange();            // 제안팀 구성·배정도 같다
    if (root.prep && root.prep.onProfileChange) root.prep.onProfileChange();      // 제안서 사전준비·지도 팝오버 캐시도 같다
    if (root.plans && root.plans.onProfileChange) root.plans.onProfileChange();   // 기관 사업계획 현황·상세 캐시도 같다
    if (root.results && root.results.onProfileChange) root.results.onProfileChange();   // 협약 성과 응답·거르기도 앞 사용자의 것을 버린다
    app.applyMenuPermissions();
    if (app.paintUserArea) app.paintUserArea();
    // 워크플로 탭이 이미 그려져 있으면 승인·반려 버튼의 권한 표시를 새 계정에 맞춘다.
    if (root.workflow && root.workflow.onProfileChange) root.workflow.onProfileChange();
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
          root.logic.esc(root.logic.accountLabel(Object.assign({}, a, { team: root.roles.roleLabel(a.team) }))) + '</option>';
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
    // 체크박스는 정본 종류 6종(logic.TYPE_KINDS) — 데이터의 옛 이름(공기업·대학병원 등)은 kindOf로 접어 센다.
    const present = new Set(root.render.allInstitutions().map(function (r){ return root.logic.kindOf(r.type); }));
    boxes.forEach(function (b) {
      if (!present.has(b.dataset.type)) { b.checked = false; b.disabled = true; }
      b.addEventListener('change', function () {
        const s = root.render.state.enabledTypes;
        if (b.checked) s.add(b.dataset.type); else s.delete(b.dataset.type);
        // 켠 종류가 바뀌면 지역 색 섞기(색·▲n·툴팁·aria-label)도 달라진다 — 전국이면 전국을 다시 그린다.
        // (지자체는 항상 섞이고 끄면 흐려질 뿐이라 전국 면은 그대로다.)
        if (!root.render.state.currentRegion) {
          if (b.dataset.type !== '지자체') { root.render.drawNational(); root.render.applyWatchStyles(); }
          return;
        }
        if (b.dataset.type === '지자체') {
          // 지자체는 마커가 아니라 면이라, 재렌더 없이 투명도만 갱신한다
          // (재렌더하면 선택 중이던 강조가 사라진다). 랭킹 목록에는 계속 남긴다.
          root.render.applyMuniDimming();
          return;
        }
        // 지역 화면은 면 색·▲n이 종류에 따라 바뀌므로 면까지 다시 그린다(drawRegion이 마커·랭킹도 그린다).
        // 다시 그리면 선택 강조가 풀리므로 선택 중이던 기관을 이어서 고른다.
        const sel = root.render._selectedName;
        const rec = sel ? root.render.allInstitutions().filter(function (r) { return r.name === sel; })[0] : null;
        root.render.drawRegion(root.render.state.currentRegion);
        if (rec) root.render.selectInstitution(rec);
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

    let base = '';   // 열 때(또는 초기화한 뒤)의 값 — 닫을 때 저장 안 한 변경이 있는지 비교한다(공통 팝업 틀 2단계)
    btn.addEventListener('click', function () {
      fill(root.render.currentTheme());
      base = JSON.stringify(collect());
      root.dlg.open(modal, {
        isDirty: function () { return JSON.stringify(collect()) !== base; },
        dirtyText: '닫으면 바꾼 색이 저장되지 않습니다.',
      });
    });
    modal.querySelector('#theme-cancel').onclick = function () { root.dlg.requestClose(modal); };
    modal.querySelector('[data-t=rippleDuration]').addEventListener('input', function (e) {
      durVal.textContent = Number(e.target.value).toFixed(1) + 's';
    });
    modal.querySelector('#theme-save').onclick = function () {
      const t = collect(), d = root.render.DEFAULT_THEME || {};
      const isDefault = Object.keys(d).every(function (k) { return String(t[k]).toLowerCase() === String(d[k]).toLowerCase(); });
      if (isDefault) root.store.resetTheme(); else root.store.saveTheme(t);   // 전부 기본값이면 저장값을 지워 나중 기본값을 따라가게(design 11-20)
      root.dlg.close(modal); repaint();
    };
    modal.querySelector('#theme-reset').onclick = function () {
      fill(Object.assign({}, root.render.DEFAULT_THEME));   // 칸만 기본 색으로 채운다 — 반영은 [저장], [취소]·Esc면 그대로(닫기 전 확인, design 11-20)
    };
  };

  // 기관 편집 창(NEXT 72) — 입찰 예정일(추정/공고로 확정+출처)·운영 상태·기본 정보를 묶음별로 저장한다. 본체는 instedit.js.
  // opts = { opener, focus:'status', from:'map_popover'|'bid_board' }. from은 서버로 가는 요청이 없어 쓰지 않는다(PUT은 institution_edit).
  app.openEdit = function (rec, opts) {
    if (app.isViewOnly()) return;   // 보기 전용 역할은 단추가 없어도 한 번 더 막는다
    root.instedit.open(rec, Object.assign({}, opts, {
      bootstrap: function () { return app.bootstrapServer(); },
      repaint: function () {
        if (root.render.state.currentRegion) root.render.drawRegion(root.render.state.currentRegion);
        root.render.drawTicker();
        if (root.dashboard && root.dashboard.refresh) root.dashboard.refresh();   // 입찰 공고 현황이 열려 있으면 다시 그린다
        if (root.kbboard && root.kbboard.refresh) root.kbboard.refresh();         // 입찰 현황판도 같다
        if (root.portal && root.portal.refresh) root.portal.refresh();            // 시작화면의 숫자·표도 같다
      },
    }));
  };
  app.wireExport = function () {
    document.getElementById('btn-export').addEventListener('click', function () {
      root.exporter.downloadInstitutions(root.render.allInstitutions());
    });
  };

  app.openAdd = function () {
    if (app.isViewOnly()) return;
    const wrap = document.getElementById('add-fields');
    const L = root.logic.FIELD_LABELS;
    const fields = ['name','type','region','subRegion','term','lastBid','contractEnd','lng','lat','sources'];
    const req = root.logic.REQUIRED_FIELDS;
    wrap.innerHTML = fields.map(function (f) {
      const must = req.indexOf(f) >= 0;   // L[f]는 고정 라벨이라 esc 불필요
      return '<div class="dlg-f"><label for="add-f-' + f + '">' + L[f] +
        (must ? '<span class="dlg-req" aria-hidden="true">*</span>' : '') + '</label>' +
        '<input id="add-f-' + f + '" data-f="' + f + '" style="width:100%;"' +
        (must ? ' required aria-required="true"' : '') + '></div>';
    }).join('') + (root.store.isServerMode()
      // 서버 모드: 확정 여부는 서버 칸이고 출처와 함께만 정한다(030) — 만든 뒤 [편집]의 '입찰 예정일'에서 고른다.
      ? '<p style="color:var(--muted);font-size:12px;">입찰 예정일은 추정으로 등록됩니다. 공고로 확정하려면 만든 뒤 [편집]에서 공고 링크나 번호와 함께 고르세요.</p>'
      : '<label style="display:flex;gap:6px;align-items:center;margin:6px 0;">' +
        '<input type="checkbox" data-f="confirmed"> ' + L.confirmed + '(공고로 확인됨)</label>' +
        '<p style="color:var(--muted);font-size:12px;">확정여부를 체크하지 않으면 "추정"으로 표시됩니다.</p>');
    const modal = document.getElementById('add-modal');
    const err = document.getElementById('add-err'), save = document.getElementById('add-save');
    function setErr(msg) { err.textContent = msg || ''; }   // 창 전체 오류(서버·연결)만. 칸 문제는 dlg.invalid
    function fieldOf(f) { return wrap.querySelector('input[data-f="' + f + '"]'); }
    setErr(''); root.dlg.setDisabled(save, false);
    root.dlg.open(modal, {
      isDirty: function () {   // 칸에 입력이 있으면
        return Array.prototype.some.call(wrap.querySelectorAll('input[data-f]'), function (inp) {
          return inp.type === 'checkbox' ? inp.checked : inp.value.trim() !== '';
        });
      },
      dirtyText: '닫으면 입력한 기관 정보가 사라집니다.',
      focus: fieldOf('name'),
    });
    document.getElementById('add-cancel').onclick = function () { root.dlg.requestClose(modal); };
    save.onclick = function () {
      const rec = {};
      wrap.querySelectorAll('input[data-f]').forEach(function (inp) {
        const f = inp.dataset.f;
        if (f === 'confirmed') rec.confirmed = inp.checked;
        else if (f === 'sources') rec.sources = inp.value ? inp.value.split(',').map(function (s){ return s.trim(); }).filter(Boolean) : [];
        else if (f === 'term') rec.term = inp.value ? Number(inp.value) : undefined;
        else if (f === 'lng' || f === 'lat') rec[f] = inp.value ? Number(inp.value) : undefined;
        else if (inp.value.trim()) rec[f] = inp.value.trim();   // 공백만 넣은 칸은 빈 칸(qa 11-20 P3-5)
      });
      const v = root.logic.validateRecord(rec);
      setErr('');
      if (!v.valid) {   // 빠진 칸마다 경고, 첫 칸에 커서(저장 단추는 막지 않는다)
        v.missing.forEach(function (k, i) {
          root.dlg.invalid(fieldOf(k), root.dlg.withObj(root.logic.FIELD_LABELS[k]) + ' 적으세요.', { focus: i === 0 });
        });
        return;
      }
      rec.updatedAt = new Date().toISOString().slice(0,10);

      // 서버 모드: 서버가 authoritative store다. 서버 필드는 POST로 만들고, 서버에
      // 대응 컬럼이 없는 좌표·출처 등은 여느 편집과 같이 localStorage overlay에 남긴다
      // (그게 없으면 새 기관이 지도에 찍힐 좌표를 갖지 못한다).
      if (root.store.isServerMode()) {
        root.dlg.setDisabled(save, true);   // 두 번 눌러 중복 등록(409)되지 않게
        fetch('/institutions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(root.serverdata.toServerRow(rec)),
        }).then(function (r) {
          if (r.status === 409) { root.dlg.invalid(fieldOf('name'), '이미 등록된 기관명입니다. 기존 기관을 편집하세요.', { focus: true }); return; }
          if (!r.ok) { setErr('기관을 추가하지 못했습니다 (' + r.status + '). 잠시 뒤 다시 저장하세요.'); return; }
          const local = {};
          root.store.LOCAL_ONLY_FIELDS.forEach(function (f) {
            if (rec[f] !== undefined) local[f] = rec[f];
          });
          root.store.setEdit(rec.name, local);
          root.dlg.close(modal);
          return app.bootstrapServer().then(function () {
            root.render.drawTicker();
            if (root.render.state.currentRegion) root.render.drawRegion(root.render.state.currentRegion);
            else root.render.drawNational();
          });
        }).catch(function () { setErr('서버에 연결하지 못했습니다. 기관은 추가되지 않았습니다.'); })
          .then(function () { root.dlg.setDisabled(save, false); });   // 닫기 확인 상자가 떠 있으면 상자를 접을 때 풀린다
        return;
      }

      const data = root.render.baseInstitutions().slice(); data.push(rec);
      root.store.saveData(data); root.dlg.close(modal);
      root.render.drawTicker();
      if (root.render.state.currentRegion) root.render.drawRegion(root.render.state.currentRegion);
      else root.render.drawNational();
    };
  };

  app.wireData = function () {
    // CSV 반입 결과·오류는 티커 줄의 #data-msg에 한 줄(alert 대체, 11-23). 성공 안내는 8초 뒤 접는다.
    let dataMsgTimer = null;
    function dataMsg(text, bad) {
      const n = document.getElementById('data-msg');
      root.dlg.line(n, text, bad);
      clearTimeout(dataMsgTimer);
      if (text && !bad) dataMsgTimer = setTimeout(function () { root.dlg.line(n, '', false); }, 8000);
    }
    document.getElementById('btn-add').addEventListener('click', app.openAdd);
    document.getElementById('btn-tmpl').addEventListener('click', function () { root.exporter.downloadCsvTemplate(); });
    document.getElementById('file-csv').addEventListener('change', function (e) {
      if (app.isViewOnly()) { e.target.value = ''; return; }   // 보기 전용: 단추가 없어도 한 번 더 막는다
      const file = e.target.files[0]; if (!file) return;
      dataMsg('', false);
      if (root.store.isServerMode()) {
        // 서버 모드: 기존 12열 CSV 그대로 multipart로 올려 서버 반입(SCHEMA §⑦의 상위집합 계약).
        const fd = new FormData(); fd.append('file', file);
        fetch('/institutions/import', { method: 'POST', body: fd })
          .then(function (r) {
            if (!r.ok) { dataMsg('CSV를 반입하지 못했습니다. 서버가 파일을 받지 않았습니다. 열 구성이 템플릿과 같은지 확인한 뒤 다시 올리세요.', true); return; }
            return r.json().then(function (data) {
              const n = Number(data && data.imported) || 0;
              dataMsg(n + '건을 반영했습니다.', false);
              return app.bootstrapServer().then(function () {
                root.render.drawTicker(); root.render.drawNational();
              }, function () {   // 반입은 끝났다 — 화면만 못 새로 고침(qa 11-23 P2-2: '못 했습니다'로 덮으면 다시 올려 중복 반입)
                dataMsg(n + '건을 반영했습니다. 화면을 새로 고치지 못했습니다. F5로 새로 고치세요.', true);
              });
            });
          }).catch(function () { dataMsg('CSV를 반입하지 못했습니다. 서버에 연결되지 않았습니다. 잠시 뒤 다시 올리세요.', true); });
        e.target.value = ''; return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        const recs = root.logic.parseCsv(String(reader.result));
        if (!recs.length) { dataMsg('CSV를 반입하지 못했습니다. 읽은 행이 없습니다. 첫 줄 머리글과 데이터 행이 있는지 확인하세요.', true); return; }
        recs.forEach(function (r) { if (!r.updatedAt) r.updatedAt = new Date().toISOString().slice(0,10); });
        root.store.saveData(recs);
        dataMsg(recs.length + '건을 반영했습니다.', false);
        root.render.drawTicker(); root.render.drawNational();
      };
      reader.readAsText(file, 'utf-8'); e.target.value = '';
    });
  };

  // ── 좌측 업무 메뉴 ─────────────────────────────────────────────────────────
  // 화면 전환 자체는 기존 .tab-btn(숨김) 클릭이 그대로 한다 — 권한 계산·폴링 정리·
  // 폴백이 전부 그 경로에 걸려 있어서, 사이드바는 "그 버튼을 누르는 새 손잡이"일 뿐이다.
  let openCat = null;           // 열려 있는 카테고리는 하나뿐(아코디언) — navOpen.open의 사본. 규칙은 nav.settleOpen·navigatedOpen·toggledOpen
  let navOpen = root.nav ? root.nav.newOpenState(null) : { open: null, fixed: false, pending: null };
  let navOpenWho = null;        // 열림 복원을 마친 사용자(사번|guest) — 바뀌면 그 사람의 저장값으로 새로 시작한다
  let navHoming = false;        // 로그인·새로고침 뒤 홈 화면 자동 열림 중(저장값을 덮어쓰지 않는다)
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
  app.navContext = navContext;
  // 보기 전용 역할(전산팀·전산팀장·디자이너) 판정은 nav.isViewOnly(ctx) 한 곳 — 화면은 이 함수만 부른다.
  app.isViewOnly = function () { return !!(root.nav && root.nav.isViewOnly && root.nav.isViewOnly(navContext())); };

  function navWho() {
    const s = root.store.loadSession();
    return s && s.emp ? s.emp : 'guest';
  }
  // 사용자가 분류를 직접 펼치거나 접었을 때만 저장한다('none' = 모두 접음). 복원을 마친 사용자(navOpenWho) 키에 쓴다 — 로그아웃 중 guest 키로 새지 않게.
  function rememberOpenCat() {
    if (navOpenWho && root.store.saveNavOpen) root.store.saveNavOpen(navOpenWho, openCat);
  }

  function activeTabKey() {
    const btn = document.querySelector('.tab-btn.active');
    return btn ? btn.id.replace('tab-btn-', '') : null;
  }

  // 사이드바 항목 id. 시스템 관리는 같은 'admin' 탭 안의 네 보기라 'admin:users'처럼 보기까지 붙는다.
  function activeNavId() {
    const key = activeTabKey();
    if (key === 'admin' && root.admin && root.admin.currentView) return 'admin:' + root.admin.currentView();
    return key;
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
    // 이사회 자료·제안팀 구성·배정·제안서 사전준비·입찰 현황판은 새 서버 메뉴 키 없이, 준비중 화면 자리에서 실제 화면으로 열린다.
    const isBoard = !!(root.board && itemId === root.board.SOON_ID);
    const isTeam = !!(root.tm && itemId === root.tm.SOON_ID);
    const isPrep = !!(root.prep && itemId === root.prep.SOON_ID);
    const isDash = !!(root.nav && itemId === root.nav.DASH_ID);
    const isPlans = !!(root.plans && itemId === root.plans.SOON_ID);   // 기관 사업계획(서버 map 키 읽기 전용 화면)
    const isResults = !!(root.results && itemId === root.results.SOON_ID);   // 협약 성과 관리(서버 map 키 읽기 전용 화면, results.js)
    const dashReady = isDash && !!(root.kbboard && root.kbboard.mount);   // 본체(국민은행 상태, kbboard.js)가 아직 없으면 안내만 보인다
    const isNotice = !!(root.nav && itemId === root.nav.NOTICE_ID);        // 입찰 공고 현황 = 전국 공고 목록(dashboard.js, #notice-root)
    const noticeReady = isNotice && !!(root.dashboard && root.dashboard.mount);
    const isHome = !!(root.nav && itemId === root.nav.HOME_ID);             // 시작화면 = 로그인 뒤 포털(portal.js, #pt-root)
    const homeReady = isHome && !!(root.portal && root.portal.mount);
    if (isDash && !dashReady) {
      document.getElementById('soon-note').textContent = '입찰 현황판은 준비 중입니다.';
    }
    if (isHome && !homeReady) {
      document.getElementById('soon-note').textContent = '시작화면은 준비 중입니다.';
    }
    document.getElementById('soon-plain').style.display = (isBoard || isTeam || isPrep || dashReady || isPlans) ? 'none' : '';
    document.getElementById('bd-root').style.display = isBoard ? '' : 'none';
    document.getElementById('tm-root').style.display = isTeam ? '' : 'none';
    document.getElementById('pp-root').style.display = isPrep ? '' : 'none';
    const dashEl = document.getElementById('dash-root');
    if (dashEl) dashEl.style.display = dashReady ? '' : 'none';
    const noticeEl = document.getElementById('notice-root');
    if (noticeEl) noticeEl.style.display = noticeReady ? '' : 'none';
    if (noticeReady) document.getElementById('soon-plain').style.display = 'none';   // (soon-plain 숨김 한 줄에 noticeReady를 섞지 않는다 — isPlans 줄 보존)
    if (homeReady) document.getElementById('soon-plain').style.display = 'none';     // 시작화면도 같다
    const plansEl = document.getElementById('plans-root');
    if (plansEl) plansEl.style.display = isPlans ? '' : 'none';
    const resultsEl = document.getElementById('results-root');
    if (resultsEl) resultsEl.style.display = isResults ? '' : 'none';
    if (isResults) document.getElementById('soon-plain').style.display = 'none';   // (soon-plain 숨김 줄에 섞지 않는다 — isPlans 줄 보존)
    const homeEl = document.getElementById('pt-root');
    if (homeEl) homeEl.style.display = homeReady ? '' : 'none';
    navActiveId = itemId;
    app.onTabChange('soon');
    if (isBoard) root.board.mount();
    if (isTeam) root.tm.mount();
    if (isPrep) root.prep.mount();
    if (dashReady) root.kbboard.mount(dashEl);
    if (noticeReady && noticeEl) root.dashboard.mount(noticeEl);
    if (isPlans && plansEl) root.plans.mount(plansEl);
    if (isResults && resultsEl) root.results.mount(resultsEl);
    if (homeReady && homeEl) root.portal.mount(homeEl);
    else if (root.portal && root.portal.unmount) root.portal.unmount();   // 시작화면이 아닌 준비중 화면으로 옮기면 해제
  };

  // 로그인(또는 세션이 있는 채로 다시 연 첫 그림) 뒤 시작화면 — 포털이 보이는 대상 역할(영업 계열·디자이너·전산팀)이고 아직 지도만 보고 있으면 시작화면(포털).
  // 본체(root.portal.mount)가 없으면 지금처럼 지도에 둔다. 메뉴 권한이 도착해 항목이 생긴 첫 시점에 한 번만 적용한다.
  let pendingHome = false;
  let overduePending = null;   // 시작화면이 열릴 것으로 보고 미뤄 둔 경과 요약 팝업 인자 — 시작화면이 안 열리면 그때 띄운다
  function flushOverdue() {
    const a = overduePending;
    overduePending = null;
    if (a && root.overdue && root.overdue.onLogin) root.overdue.onLogin(a.ctx, a.id);
  }
  function applyHome(settled) {
    if (!pendingHome || !root.nav) return;
    if (!root.store.loadSession()) return;   // 로그인 화면 뒤에서는 아직 기다린다
    if (settled === false) { flushOverdue(); return; }   // 권한 응답 실패: 시작화면은 다음 성공 응답까지 기다리고, 경과 팝업만 먼저 띄운다(영원히 미뤄지지 않게)
    pendingHome = false;
    // 재무의 시작화면(이사회 자료 작성)은 포털 본체가 필요 없다 — 포털 본체 가드는 포털이 시작화면인 계정에만 건다.
    if (homeId() !== root.nav.BOARD_ID && !(root.portal && root.portal.mount)) { flushOverdue(); return; }
    const id = root.nav.homeItemId(navBuilt, navActiveId, navTabs, navContext());
    const item = id ? findNavItem(id) : null;
    if (item) { navHoming = true; try { openNavItem(item); } finally { navHoming = false; } }
    flushOverdue();   // 시작화면이 열린 '뒤에' 경과 팝업을 띄운다(사용자 11-16, design P1-2) — 열기 전에 띄우면 팝업 뒤에서 화면이 바뀌어 포커스가 엇갈린다
  }

  // 로그아웃·로그인 때 화면을 처음(지도 한 장)으로 되돌린다(사용자 11-19: 앞 계정의 탭·화면이 다음 계정에 이어지던 버그).
  // 내 정보 저장·계정 전환기(onProfileChanged)에는 걸지 않는다 — 같은 사람이 설정을 고칠 때 열어 둔 탭을 닫으면 안 된다.
  app.resetScreens = function () {
    if (root.overdue && root.overdue.closePopup) root.overdue.closePopup(false);
    if (root.dashboard && root.dashboard.closeDetail) root.dashboard.closeDetail(false);
    if (root.dlg && root.dlg.closeAll) root.dlg.closeAll();   // 공통 팝업 틀 창은 스택·inert까지 정리하며 닫는다(qa 11-20 P2-2)
    document.querySelectorAll('.modal-overlay').forEach(function (ov) { ov.style.display = 'none'; });
    overduePending = null; navHoming = false;
    ['portal', 'kbboard', 'dashboard', 'plans', 'results'].forEach(function (k) { const m = root[k]; if (m && m.unmount) m.unmount(); });
    if (root.render && root.render.clearSelection) root.render.clearSelection();   // 앞 계정이 지도에서 고른 기관 링·순위 카드 강조도 지운다(qa P3-3)
    if (root.render && root.render.state && root.render.state.currentRegion && app.backToNational) app.backToNational();
    navTabs = []; navActiveId = null;
    const mapBtn = document.getElementById('tab-btn-map');
    if (mapBtn) mapBtn.click();   // 지도 탭으로 — onTabChange → syncNavActive가 탭을 [지도] 하나로 다시 채운다
  };

  // 화면이 바뀔 때마다(어느 경로든) 불린다: 활성 항목 갱신 → 탭 보관 → 그 카테고리만 열기.
  app.syncNavActive = function (tab) {
    if (tab !== 'soon') navActiveId = activeNavId();
    const item = navActiveId ? findNavItem(navActiveId) : null;
    if (item) {
      navTabs = root.nav.openTab(navTabs, item, navActiveId, undefined, pinId()).tabs;   // 가득 찼으면 보관만 건너뛴다
      const cat = root.nav.accordionOf(navBuilt, navActiveId);      // 단독 항목(시작화면)은 null — 다른 분류의 열림을 닫지 않는다
      navOpen = root.nav.navigatedOpen(navOpen, cat, navHoming);   // 저장은 하지 않는다(사용자가 직접 펼치거나 접을 때만)
      openCat = navOpen.open;
    }
    app.drawNav();
    drawTabs();
    recordScreen(navActiveId);
  };

  // 화면 열람을 접근 이력에 남긴다(서버 모드·로그인 상태·같은 화면 연속 호출 제외). 실패는 무시한다.
  function recordScreen(id) {
    const name = root.nav.screenName(id, root.board && root.board.SOON_ID);
    if (!name || name === lastRecorded) return;
    // 키는 있지만 준비중 안내만 연 항목(AI 대화·지식 검색)은 실제로 열람한 화면이 아니므로 기록하지 않는다.
    const shown = findNavItem(id);
    const soonTab = document.getElementById('tab-soon');
    if (shown && shown.pending && soonTab && soonTab.classList.contains('active')) return;
    const session = root.store.loadSession();
    if (!root.store.isServerMode() || !(session && session.mode === 'account' && session.emp)) return;
    lastRecorded = name;
    fetch('/auth/screen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screen: name }) }).catch(function () { /* 기록 실패가 화면을 막지 않는다 */ });
  }

  function activateItem(item) {
    if (item.soon) { app.showSoon(item.id, item.label, item.tag, item.note); return; }
    if (item.view && root.admin && root.admin.showView) root.admin.showView(item.view);
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
    const r = root.nav.openTab(navTabs, item, navActiveId, undefined, pinId());
    if (r.full) {
      showTabNotice('화면은 최대 ' + root.nav.MAX_TABS + '개까지 열어 둘 수 있습니다. 탭을 닫고 다시 열어 주세요.');
      return false;
    }
    activateItem(item);
    return true;
  }
  // 다른 화면(지도 팝오버의 '제안 확정' 등)이 사이드바 항목 id로 화면을 연다. 항목이 안 보이거나 탭이 가득 차면 false.
  app.openNavItem = function (id) {
    const found = findNavItem(id);
    return found ? openNavItem(found) : false;
  };
  app.findNavItem = findNavItem;   // overdue.js 팝업이 '입찰 공고 현황 메뉴가 보이는가'를 판정한다(영업 계열 밖은 지도로 떨어짐)

  // 계정의 시작화면 id(nav.homeIdFor): 대상 역할 = 포털, 재무 = 이사회 자료 작성, 마스터·그 밖 = null. 맨 앞 고정 탭(pinId)도 같은 id다.
  function homeId() { return root.nav ? root.nav.homeIdFor(navContext()) : null; }
  function pinId() { return homeId(); }

  // 머리 띠 제목 '기관영업지원 시스템' = 시작화면으로. 시작화면이 있는 계정이면 그 화면(탭 맨 앞), 없으면(마스터) 전국 지도.
  // 이미 시작화면이어도 반응 없이 넘기지 않고 다시 연다 — 눌러도 반응이 없으면 고장처럼 읽혀서, 거르기·정렬·스크롤을 처음으로 되돌리는 '새로 고침'으로 쓴다(사용자 11-19).
  // 이사회 자료 작성 화면은 board.mount가 편집 중 상태를 지우지 않고 목록만 다시 받으므로 다시 열어도 해가 없다.
  app.goHome = function () {
    const hid = homeId();
    const item = hid ? findNavItem(hid) : null;
    if (item) { openNavItem(item); return; }
    const mapBtn = document.getElementById('tab-btn-map');
    if (mapBtn && !mapBtn.classList.contains('active')) mapBtn.click();
  };

  function closeNavTab(id) {
    const r = root.nav.closeTab(navTabs, id, navActiveId, pinId());
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
    // 시작화면 탭(pin): 맨 앞 고정(nav.openTab), 닫기(×) 없음. 라벨 앞에 집 글리프(design-reviewer 11-19 1428_aab03363 5절)
    const homeIco = '<svg class="stab-ico" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M1.5 6.2 6 2.2l4.5 4M3 5.2V10h6V5.2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
    const pid = pinId();
    list.innerHTML = navTabs.map(function (t) {
      const pin = !!pid && t.id === pid;
      if (pin) {
        return '<div class="stab pin' + (t.id === navActiveId ? ' active' : '') + '" role="tab" data-tab-id="' + esc(t.id) +
          '" title="시작화면 (닫을 수 없음)">' + homeIco + '<span class="stab-label">' + esc(t.label) + '</span><span class="sr-only">, 고정 탭</span></div>';
      }
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
    const shown = navBuilt.filter(function (c) { return !c.headOnly; });   // 시작화면은 메뉴에 그리지 않는다(머리 띠 제목·고정 탭으로 연다)
    const sig = shown.map(function (c) {
      return c.id + (c.showSubs ? '+' : ':') + c.items.map(function (i) { return i.id + '@' + (i.sub || ''); }).join(',');
    }).join('|');
    if (sig !== navDomSig) {
      const esc = root.logic.esc;
      el.innerHTML = shown.map(function (cat) {
        function itemHtml(it) {
          const badge = root.nav.badgeOf(it);   // 배지가 없으면 흐림(.soon)도 없다 — 이미 열리는 화면이다
          return '<button class="nav-item' + (badge ? ' soon' : '') + '" data-nav="' + esc(it.id) +
            '" title="' + esc(it.label) + '"><span class="nav-label">' + esc(it.label) + '</span>' +
            (badge ? '<span class="nav-soon-tag" aria-hidden="true">' + esc(badge) + '</span>' +
                     '<span class="sr-only">' + esc(badge) + '</span>' : '') + '</button>';
        }
        let items = '';
        if (cat.showSubs) {
          // 중분류 = 누를 수 없는 소제목. 같은 sub가 이어지는 구간을 한 묶음(role=group)으로 그린다.
          const groups = [];
          cat.items.forEach(function (it) {
            const last = groups[groups.length - 1];
            if (last && last.sub === it.sub) last.items.push(it); else groups.push({ sub: it.sub, items: [it] });
          });
          items = groups.map(function (g, n) {
            const sid = 'nav-sub-' + cat.id + '-' + n;
            return '<div role="group" aria-labelledby="' + esc(sid) + '" data-sub="' + esc(g.sub) + '">' +
              '<div class="nav-sub" id="' + esc(sid) + '">' + esc(g.sub) + '</div>' + g.items.map(itemHtml).join('') + '</div>';
          }).join('');
        } else {
          items = cat.items.map(itemHtml).join('');
        }
        const lid = 'nav-items-' + cat.id;
        return '<button class="nav-cat" data-cat="' + esc(cat.id) + '" title="' + esc(cat.title) +
          '" aria-expanded="false" aria-controls="' + esc(lid) + '">' +
          '<span class="nav-label">' + esc(cat.title) + '</span>' +
          '<span class="nav-count nav-cat-count" aria-hidden="true" hidden></span><span class="sr-only nav-cat-sr" hidden></span>' +
          '<span class="sr-only nav-cat-here" hidden>, 지금 보는 화면 포함</span>' +
          '<svg class="chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true" focusable="false"><path d="M4.5 2.5 8 6l-3.5 3.5"/></svg></button>' +
          '<div class="nav-items" id="' + esc(lid) + '" data-for="' + esc(cat.id) + '"><div class="nav-items-in">' + items + '</div></div>';
      }).join('');
      navDomSig = sig;
    }
    const activeCat = root.nav.accordionOf(navBuilt, navActiveId);
    el.querySelectorAll('.nav-cat').forEach(function (b) {
      b.classList.toggle('open', b.dataset.cat === openCat);
      b.classList.toggle('has-active', b.dataset.cat === activeCat);
      b.setAttribute('aria-expanded', b.dataset.cat === openCat ? 'true' : 'false');
    });
    el.querySelectorAll('.nav-items').forEach(function (d) {
      d.classList.toggle('open', d.dataset.for === openCat);
    });
    el.querySelectorAll('.nav-item').forEach(function (b) {
      const on = b.dataset.nav === navActiveId;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    // 활성 항목이 든 중분류 소제목은 진하게(.has-active).
    el.querySelectorAll('[role="group"]').forEach(function (g) {
      const sub = g.querySelector('.nav-sub');
      if (sub) sub.classList.toggle('has-active', !!g.querySelector('.nav-item.active'));
    });
    // 머리 띠 제목 단추: 시작화면을 보고 있으면 현재 위치 표시(aria-current)
    const hb = document.getElementById('app-home');
    if (hb) { if (homeId() && navActiveId === homeId()) hb.setAttribute('aria-current', 'page'); else hb.removeAttribute('aria-current'); }
    const apb = document.getElementById('btn-appr');   // 결재함 화면이 열려 있으면 머리 띠 단추가 '지금 화면'
    if (apb) { if (navActiveId === 'approvals') apb.setAttribute('aria-current', 'page'); else apb.removeAttribute('aria-current'); }
    // 항목 구성이 바뀌어 DOM을 새로 만들면 '전국 지도' 옆 미처리 배지도 사라지므로 다시 단다.
    if (root.overdue && root.overdue.paintNavBadge) root.overdue.paintNavBadge();
    if (root.plancollect && root.plancollect.onNavDrawn) root.plancollect.onNavDrawn();   // 사업계획 수집 요청 대기 배지(시스템 관리 항목 옆)
    app.paintCatBadges();
  };

  // 접힌 분류 제목 오른쪽에 그 안의 배지(공고 예정일 경과 미처리) 합계를 보인다. 펼치면 숨긴다(항목 쪽 배지가 보이므로).
  // 합계가 같으면 DOM을 건드리지 않는다(MutationObserver가 자기 변경에 다시 돌지 않게).
  app.paintCatBadges = function () {
    const el = document.getElementById('side-nav');
    if (!el || !root.nav || !root.nav.catBadgeSum) return;
    el.querySelectorAll('.nav-cat').forEach(function (b) {
      const items = el.querySelector('.nav-items[data-for="' + b.dataset.cat + '"]');
      const vals = items ? Array.prototype.map.call(items.querySelectorAll('.nav-count'), function (c) { return c.textContent; }) : [];
      const n = root.nav.catBadgeSum(vals);
      const open = b.classList.contains('open');
      const num = b.querySelector('.nav-cat-count'), sr = b.querySelector('.nav-cat-sr'), here = b.querySelector('.nav-cat-here');
      const showN = n > 0 && !open;
      if (num) {
        if (num.textContent !== (n > 0 ? String(n) : '')) num.textContent = n > 0 ? String(n) : '';
        if (num.hidden !== !showN) num.hidden = !showN;
      }
      if (sr) {
        // 항목 배지마다 짝지은 낭독 문장(.nav-count 바로 뒤 .sr-only)을 모아 쓴다 — 경과 배지(overdue)와 수집 요청 대기(plancollect)가 한 분류에 있어도 문장이 맞는다.
        const t = n > 0 ? Array.prototype.map.call(items.querySelectorAll('.nav-count'), function (c) {
          const s = c.nextElementSibling;
          return s && s.classList.contains('sr-only') ? s.textContent : '';
        }).join('') : '';
        if (sr.textContent !== t) sr.textContent = t;
        if (sr.hidden !== !showN) sr.hidden = !showN;
      }
      if (here) { const showHere = b.classList.contains('has-active') && !open; if (here.hidden !== !showHere) here.hidden = !showHere; }
    });
  };

  app.paintNav = function (visible) {
    if (!root.nav || !document.getElementById('side-nav')) return;
    navBuilt = root.nav.limitToRole(root.nav.build(visible, navContext()), navContext());   // 역할별 기본 대분류(디자이너·재무)로 한 번 더 좁힌다
    if (!navActiveId) navActiveId = activeNavId();
    navTabs = root.nav.pruneTabs(navTabs, navBuilt);
    // 준비중 화면을 보고 있었는데 그 항목이 더는 안 보이면(로그아웃 등) 지도로 돌려보낸다.
    if (navActiveId && navActiveId.indexOf('soon:') === 0 && !root.nav.categoryOf(navBuilt, navActiveId)) {
      const mapBtn = document.getElementById('tab-btn-map');
      navActiveId = 'map';
      if (mapBtn) mapBtn.click();
    }
    // 열림 복원: 사용자가 바뀌면(첫 그림·로그인·로그아웃) 그 사람이 마지막에 연 분류를 읽고, 분류가 아직 안 보이면 권한이 올 때까지 미룬다.
    const who = navWho();
    if (who !== navOpenWho) {   // 사용자가 바뀌면(첫 그림·로그인·로그아웃) 앞 사용자의 열림을 버리고 이 사람의 저장값으로 시작한다
      navOpenWho = who;
      navOpen = root.nav.newOpenState(root.store.loadNavOpen ? root.store.loadNavOpen(who) : null);
    }
    navOpen = root.nav.settleOpen(navOpen, navBuilt, navActiveId ? root.nav.accordionOf(navBuilt, navActiveId) : null);
    openCat = navOpen.open;
    const cur = navActiveId ? findNavItem(navActiveId) : null;
    if (cur) navTabs = root.nav.openTab(navTabs, cur, navActiveId, undefined, pinId()).tabs;   // 지금 보는 화면은 처음부터 탭으로
    const apprBtn = document.getElementById('btn-appr');   // 결재함 권한(서버 approvals 키·역할 메뉴)이 있을 때만
    if (apprBtn) apprBtn.style.display = findNavItem('approvals') ? '' : 'none';
    app.drawNav();
    drawTabs();
    if (root.plans && root.plans.onNavPainted) root.plans.onNavPainted();   // 메뉴가 바뀐 뒤 상세의 '사업계획' 절 노출을 다시 판정(계정 전환)
  };

  app.wireNav = function () {
    const el = document.getElementById('side-nav');
    if (!el) return;
    el.addEventListener('click', function (e) {
      const cat = e.target.closest('.nav-cat');
      if (cat) {
        // 아코디언: 다른 카테고리는 닫고, 열린 걸 다시 누르면 닫는다. 마지막 상태를 기억한다.
        navOpen = root.nav.toggledOpen(navOpen, cat.dataset.cat);
        openCat = navOpen.open;
        rememberOpenCat();
        app.drawNav();
        return;
      }
      const item = e.target.closest('.nav-item');
      if (!item) return;
      const found = findNavItem(item.dataset.nav);
      if (found) openNavItem(found);
    });
    const hb = document.getElementById('app-home');
    if (hb) hb.addEventListener('click', app.goHome);   // 머리 띠 제목 = 시작화면으로
    const ab = document.getElementById('btn-appr');   // 머리 띠 [결재함 n](사용자 11-23) — 화면 탭으로 연다
    if (ab) ab.addEventListener('click', function () { app.openNavItem('approvals'); });
    const list = document.getElementById('tab-list');
    if (list) list.addEventListener('click', function (e) {
      const tab = e.target.closest('.stab');
      if (!tab) return;
      const id = tab.dataset.tabId;
      if (e.target.closest('.stab-x')) { closeNavTab(id); return; }
      const found = findNavItem(id);
      if (found) openNavItem(found);
    });
    // 경과 배지(overdue.paintNavBadge)는 drawNav 밖에서도 바뀐다 — 접힌 분류의 합계 배지가 따라오게 한다.
    if (typeof MutationObserver === 'function') {
      new MutationObserver(function () { app.paintCatBadges(); }).observe(el, { childList: true, subtree: true });
    }
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
    document.body.classList.toggle('is-viewonly', app.isViewOnly());   // 보기 전용 역할(전산팀·디자이너) — 도구줄 [기관 추가]·[CSV]를 그리지 않는다(index.html CSS)
    if (chip) chip.textContent = root.login.chipText(session, root.store.loadProfile());
    // 로그인 상태의 헤더 우측: "{소속} {이름}" 글자 · 로그아웃(밑줄) · ⚙ 설정 — 칩(로그인)은 둘러보기에서만 보인다.
    const label = byId('user-label');
    if (label) label.textContent = root.login.userLabel(root.store.loadProfile());
  };

  // 로그인 화면이 떠 있는 동안 뒤의 헤더·본문은 Tab·낭독기에서 막는다(inert) — 가려진 버튼으로 포커스가 새지 않게.
  app.setBehindInert = function (on) {
    ['header', 'shell'].forEach(function (k) {
      const el = k === 'header' ? document.querySelector('body > header') : byId(k);
      if (!el) return;
      if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    });
  };

  app.showLogin = function (message) {
    const view = byId('login-view');
    if (!view) return;
    view.classList.remove('hidden');
    app.setBehindInert(true);
    if (root.loginHero) root.loginHero.mount();   // 보일 때마다 다시 그린다(날짜가 바뀌었을 수 있다). 이미 떠 있으면 아무 일 없음.
    byId('login-msg').textContent = message || '';
    byId('login-id').removeAttribute('aria-invalid');
    byId('login-pw').value = '';
    byId('login-id').focus();
  };

  app.enterApp = function (session, profile) {
    pendingHome = true;   // 메뉴 권한이 도착하면 시작화면(포털)이 열린다(applyHome)
    app.resetScreens();   // 앞 계정·둘러보기의 탭·팝업·거르기를 버리고 지도 한 장에서 시작. 세션을 저장하기 전에 불러야 지도 열람이 새 계정 접근 이력에 남지 않는다
    root.store.saveSession(session);
    root.store.saveProfile(profile);
    if (app.showProfileRole) {
      byId('me-name').value = profile.name;
      app.showProfileRole(profile.team);
    }
    byId('login-view').classList.add('hidden');
    app.setBehindInert(false);
    if (root.loginHero) root.loginHero.destroy();   // 숨은 화면에서 6초 타이머가 돌지 않게
    app.paintUserArea();
    // 공고 예정일 경과 요약 팝업 — 영업 계열에게만, '오늘 더 이상 보지 않기'를 안 눌렀을 때만(overdue.js).
    // 둘러보기(guest)는 소속이 없어 영업 계열이 아니므로 뜨지 않는다.
    // 시작화면(포털: 영업 계열·디자이너·전산팀 + 본체 있음)이어도 경과 팝업을 띄운다 — 경과 목록이 입찰 공고 현황으로 옮겨 갔다(사용자 11-16).
    // 다만 시작화면이 열리기 전에 띄우면 화면이 팝업 뒤에서 바뀌므로, 메뉴 권한이 오기 전에는 미뤄 두고 applyHome이 시작화면을 연 뒤에 띄운다
    // (applyHome이 onProfileChanged 안에서 바로 불릴 수 있어 그 전에 정해 둔다).
    const args = { ctx: navContext(), id: session.emp || session.id || '' };
    const deferOverdue = root.nav.expectsHome(args.ctx, !!(root.portal && root.portal.mount));
    overduePending = deferOverdue ? args : null;
    app.onProfileChanged();
    if (!deferOverdue && root.overdue && root.overdue.onLogin) root.overdue.onLogin(args.ctx, args.id);
  };

  app.logout = function () {
    // 세션을 지우기 전에 기록한다(헤더에 사번이 실려야 누가 나갔는지 남는다). 실패해도 로그아웃은 진행.
    if (root.store.isServerMode() && (root.store.loadSession() || {}).emp) {
      fetch('/auth/logout', { method: 'POST' }).catch(function () { /* 기록 실패가 로그아웃을 막지 않는다 */ });
    }
    if (root.headcard && root.headcard.onProfileChange) root.headcard.onProfileChange();   // 세션을 지우기 전에 기관장 카드 상태를 비운다
    root.store.clearSession();
    root.store.saveProfile({ name: '', team: '' });
    app.resetScreens();   // 세션을 지운 뒤라 지도 열람이 접근 이력에 남지 않는다
    if (app.showProfileRole) { byId('me-name').value = ''; app.showProfileRole(''); }
    app.paintUserArea();
    app.onProfileChanged();
    root.login.resetFields(byId('login-id'), byId('login-role'));   // 직전 사번·계정이 남아 있지 않게
    app.showLogin('');
  };

  // 같은 출처 요청에 사번 헤더(X-Emp-No)를 붙인다. **자기신고 값**이라 서버는 '검증 안 됨'으로 기록한다.
  // 서버가 이 값만 믿고 권한을 주지는 않는다(관리 API는 DB의 권한을 다시 확인한다).
  app.installIdentityHeader = function () {
    if (typeof root.fetch !== 'function' || root.fetch.__identity) return;
    const orig = root.fetch.bind(root);
    const wrapped = function (input, init) {
      const url = typeof input === 'string' ? input : '';
      const sameOrigin = url.charAt(0) === '/' && url.charAt(1) !== '/';
      const emp = (root.store.loadSession() || {}).emp;
      if (sameOrigin && emp) {
        init = Object.assign({}, init || {});
        init.headers = root.login.withIdentity(init.headers, emp);
      }
      return orig(input, init);
    };
    wrapped.__identity = true;
    root.fetch = wrapped;
  };

  app.wireLogin = function () {
    const view = byId('login-view');
    if (!view || !root.login) return;
    app.installIdentityHeader();
    // 사번을 도입하기 전에 로그인한 세션이면 임시 계정의 사번으로 채운다(다시 로그인하지 않아도 되게).
    const prev = root.store.loadSession();
    if (prev && prev.mode === 'account' && !prev.emp) {
      const pa = root.login.byId(prev.id);
      if (pa) root.store.saveSession({ mode: 'account', id: prev.id, emp: pa.empNo });
    }
    const idEl = byId('login-id');
    const roleEl = byId('login-role');
    roleEl.innerHTML = '<option value="">고르면 사번 칸이 채워집니다</option>' + root.login.groups().map(function (g) {
      return '<optgroup label="' + root.logic.esc(root.roles.roleLabel(g.title)) + '">' + g.accounts.map(function (a) {
        return '<option value="' + root.logic.esc(a.id) + '">' + root.logic.esc(root.login.label(a)) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    // 팀/직위를 고르면 아이디가 채워지고, 아이디를 직접 치면 드롭다운이 따라간다.
    // 사번 칸의 오류 표시(aria-invalid)는 고치기 시작하면 바로 지운다.
    function clearInvalid() { idEl.removeAttribute('aria-invalid'); }
    roleEl.addEventListener('change', function () { if (roleEl.value) { idEl.value = roleEl.value; clearInvalid(); byId('login-msg').textContent = ''; } });
    idEl.addEventListener('input', function () {
      const a = root.login.byId(idEl.value);
      roleEl.value = a ? a.id : '';
      clearInvalid();
    });

    // 사번(또는 임시 계정)으로 서버에 확인한다. 서버가 없으면(file://) 임시 계정 목록으로만 들어간다.
    // 서버 응답이 있으면 그 사용자 정보(이름·역할)를 쓴다 — DB에만 있는 사용자도 로그인된다.
    let loginBusy = false;   // 서버 응답을 기다리는 동안 Enter·버튼·둘러보기가 또 실행되지 않게
    function submit() {
      if (loginBusy) return;
      const typed = idEl.value.trim();
      const a = root.login.authenticate(typed, byId('login-pw').value);
      const emp = root.login.empNoFor(typed);
      if (!emp && !a) {
        byId('login-msg').textContent = '사번(숫자 7자리) 또는 임시 계정을 입력하세요.';
        idEl.setAttribute('aria-invalid', 'true'); idEl.focus();
        return;
      }
      if (!emp || !root.store.isServerMode()) {
        if (!a) { byId('login-msg').textContent = '서버에 연결되지 않아 임시 계정으로만 들어갈 수 있습니다.'; return; }
        app.enterApp({ mode: 'account', id: a.id, emp: a.empNo }, { name: a.name, team: a.role });
        return;
      }
      loginBusy = true;
      byId('login-go').disabled = true;
      fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_no: emp }) }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { byId('login-msg').textContent = j.detail || '로그인하지 못했습니다.'; return; }
          app.enterApp({ mode: 'account', id: a ? a.id : j.emp_no, emp: j.emp_no }, { name: j.name, team: j.role });
        });
      }).catch(function () {
        // 서버가 안 닿는다. 임시 계정이면 들어가되, 사용자에게 기록이 남지 않음을 알린다.
        if (a) { app.enterApp({ mode: 'account', id: a.id, emp: a.empNo }, { name: a.name, team: a.role }); return; }
        byId('login-msg').textContent = '서버에 연결하지 못했습니다.';
      }).then(function () { loginBusy = false; byId('login-go').disabled = false; });
    }
    byId('login-go').addEventListener('click', submit);
    [idEl, byId('login-pw')].forEach(function (el) {
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    });
    // 둘러보기 = 프로필을 비운 채 지금까지의 '/' 화면(지도·지역별)으로 들어간다.
    byId('login-guest').addEventListener('click', function () {
      if (loginBusy) return;
      app.enterApp({ mode: 'guest', id: '' }, { name: '', team: '' });
    });

    // 프로필 칩은 둘러보기(로그인 전)에서만 보인다 — 누르면 로그인 화면.
    byId('profile-chip').addEventListener('click', function () { app.showLogin(''); });
    // ⚙ 설정 → 내 정보. 사이드바 메뉴가 아니라 숨은 탭 버튼으로 연다 — 메뉴 키를 늘리지 않는다.
    byId('btn-settings').addEventListener('click', function () { byId('tab-btn-myinfo').click(); });
    byId('btn-logout').addEventListener('click', app.logout);

    // 첫 화면: 세션이 있으면 바로 앱, 없으면 로그인(마크업 기본값이 "보임"이라 깜빡임이 없다).
    // 세션이 있으면 로그인 화면은 처음부터 숨겨지므로 히어로를 켜지 않고(destroy는 안전한 no-op), 없으면 mount한다.
    if (root.store.loadSession()) {
      view.classList.add('hidden'); pendingHome = true;
      app.setBehindInert(false);
      if (root.loginHero) root.loginHero.destroy();
    } else {
      app.setBehindInert(true);
      if (root.loginHero) root.loginHero.mount();
    }
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
      if (root.overdue && root.overdue.wire) root.overdue.wire();   // 경과 패널·팝업 이벤트 연결
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
