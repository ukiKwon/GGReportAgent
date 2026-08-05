(function (root) {
  'use strict';
  // 권한 관리 (계획 I Task 7) — 시스템 운영자(전산팀)가 역할×메뉴를 켜고 끈다.
  //
  // ⚠️ **권한은 화면 노출 제어이지 보안 경계가 아니다.** 프로필이 자기신고
  // (localStorage)라 서버가 신원을 확인할 방법이 없다. 실제 차단은 폐쇄망 +
  // nginx Basic Auth가 맡는다(계획 G).
  const admin = {};

  const ADMIN_MENU = 'admin';
  admin.ADMIN_MENU = ADMIN_MENU;

  admin.grid = function (payload) {
    const p = payload || {};
    const menus = (p.menus || []).map(function (m) {
      return { key: m.key, label: m.label, serverOnly: !!m.server_only };
    });
    const rows = Object.keys(p.roles || {}).map(function (role) {
      return { role: role, cells: Object.assign({}, p.roles[role]) };
    });
    return { menus: menus, rows: rows };
  };

  // 바뀐 것만 보낸다 — 전체를 덮어쓰면 두 사람이 같은 화면을 열었을 때 나중에
  // 저장한 쪽이 상대의 변경을 통째로 지운다.
  admin.diff = function (before, after) {
    const out = [];
    Object.keys(after || {}).forEach(function (role) {
      Object.keys(after[role] || {}).forEach(function (menu) {
        const was = ((before || {})[role] || {})[menu];
        const now = after[role][menu];
        if (!!was !== !!now) out.push({ role: role, menu: menu, enabled: !!now });
      });
    });
    return out;
  };

  // 저장을 누르기 전에 화면에서 먼저 알려준다(서버도 400으로 막는다).
  admin.lockCheck = function (after) {
    const anyone = Object.keys(after || {}).some(function (role) {
      return !!(after[role] || {})[ADMIN_MENU];
    });
    if (anyone) return '';
    return '권한관리를 모든 역할에서 끄면 아무도 이 화면에 들어올 수 없습니다 — ' +
      '먼저 다른 역할에 권한관리를 켜 주세요.';
  };

  // ── 렌더·배선 ───────────────────────────────────────────────────────
  function esc(s) {
    if (root.logic && root.logic.esc) return root.logic.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }

  let loaded = null;      // 서버에서 받은 원본(diff의 기준)
  let draft = null;       // 화면에서 만진 값

  admin.render = function (container, payload) {
    const g = admin.grid(payload);
    if (!g.rows.length) {
      container.innerHTML = '<p class="wf-empty">역할 정보를 불러오지 못했습니다.</p>';
      return;
    }
    container.innerHTML =
      '<table class="ad-grid"><thead><tr><th>역할</th>' +
      g.menus.map(function (m) {
        return '<th' + (m.serverOnly ? ' title="서버 모드에서만 열립니다"' : '') + '>' +
          esc(m.label) + (m.serverOnly ? ' <span class="ad-so">*</span>' : '') + '</th>';
      }).join('') + '</tr></thead><tbody>' +
      g.rows.map(function (r) {
        return '<tr><th>' + esc(r.role) + '</th>' + g.menus.map(function (m) {
          const on = r.cells[m.key] ? ' checked' : '';
          return '<td><input type="checkbox" data-role="' + esc(r.role) +
            '" data-menu="' + esc(m.key) + '"' + on + '></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>' +
      '<p class="ad-note"><span class="ad-so">*</span> 표시는 서버 모드 전용입니다 — ' +
      'file://로 열면 켜져 있어도 보이지 않습니다.</p>';
  };

  function collect() {
    const out = {};
    el('ad-grid').querySelectorAll('input[type=checkbox]').forEach(function (box) {
      const role = box.dataset.role;
      out[role] = out[role] || {};
      out[role][box.dataset.menu] = box.checked;
    });
    return out;
  }

  function paint() {
    admin.render(el('ad-grid'), { menus: loaded.menus, roles: draft });
    el('ad-grid').querySelectorAll('input[type=checkbox]').forEach(function (box) {
      box.onchange = function () {
        draft = collect();
        el('ad-msg').textContent = admin.lockCheck(draft);
      };
    });
    el('ad-msg').textContent = '';
  }

  function load() {
    return fetch('/menus').then(function (r) {
      if (!r.ok) throw new Error('menus ' + r.status);
      return r.json();
    }).then(function (body) {
      loaded = body;
      draft = JSON.parse(JSON.stringify(body.roles || {}));
      paint();
    }).catch(function () {
      el('ad-grid').innerHTML = '<p class="wf-empty">권한 정보를 불러오지 못했습니다.</p>';
    });
  }

  function save() {
    const warn = admin.lockCheck(draft);
    if (warn) { alert(warn); return; }
    const changes = admin.diff(loaded.roles, draft);
    if (!changes.length) { el('ad-msg').textContent = '바뀐 것이 없습니다.'; return; }
    fetch('/menus', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: changes }),
    }).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) throw new Error(body.detail || ('저장 실패 (' + r.status + ')'));
        el('ad-msg').textContent = changes.length + '건을 저장했습니다.';
        // 내 소속의 권한이 바뀌었을 수 있다 — 탭을 즉시 다시 계산한다.
        if (root.app && root.app.applyMenuPermissions) root.app.applyMenuPermissions();
        return load();
      });
    }).catch(function (e) { alert(e.message || '서버 연결 실패 — 저장되지 않았습니다.'); });
  }

  admin.mount = function () {
    el('ad-save').onclick = save;
    el('ad-reset').onclick = function () {
      draft = JSON.parse(JSON.stringify(loaded.roles || {}));
      paint();
    };
    load();
  };

  admin.unmount = function () { /* 폴링이 없어 정리할 것이 없다 */ };

  if (typeof module !== 'undefined' && module.exports) module.exports = admin;
  else root.admin = admin;
})(typeof self !== 'undefined' ? self : this);
