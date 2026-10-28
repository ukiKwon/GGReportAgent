(function (root) {
  'use strict';
  // 시스템 관리 — 사용자(사번)·권한·메뉴·접근 이력. 같은 'admin' 탭 안의 네 보기다.
  //   · 사용자 관리 : 사번 7자리로 등록·수정, 잠금·퇴직(삭제 없음)      → /sysadmin/users
  //   · 권한 관리   : 사용자별 메뉴 권한(조회·작성·수정·결재)          → /sysadmin/perms
  //   · 메뉴 관리   : 역할×메뉴 격자 — 어느 역할이 어떤 화면을 볼지    → /menus (기존 계약 그대로)
  //   · 접근 이력   : 로그인·화면 열람·API 기록                        → /sysadmin/access-log
  // (예전 '권한 관리 (계획 I Task 7)' 가 지금의 '메뉴 관리'다.)
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
    return '시스템 관리를 모든 역할에서 끄면 아무도 이 화면에 들어올 수 없습니다 — ' +
      '먼저 다른 역할에 시스템 관리를 켜 주세요.';
  };

  // ── 순수 규칙(테스트 대상) ─────────────────────────────────────────────

  admin.VIEWS = { users: '사용자 관리', perms: '권한 관리', menus: '메뉴 관리', audit: '접근 이력' };
  admin.VIEW_HINTS = {
    users: '사번(숫자 7자리)으로 사용자를 등록·수정합니다. 삭제하지 않고 퇴직 처리해 이력을 남깁니다.',
    perms: '메뉴 권한을 주면 조회가 기본입니다. 결재는 결재 기능이 확인된 메뉴에서만 줄 수 있습니다.',
    menus: '역할별로 어떤 화면을 볼 수 있는지 정합니다 — 화면 노출만 정합니다(보안 경계가 아닙니다).',
    audit: '로그인·화면 열람·API 호출 기록입니다. 사번이 "자기신고"인 행은 위조될 수 있습니다.'
  };
  admin.EVENT_LABELS = {
    LOGIN_OK: '로그인 성공', LOGIN_FAIL: '로그인 실패', LOGOUT: '로그아웃',
    SCREEN_VIEW: '화면 열람', API: 'API 호출', DENIED: '접근 거부'
  };
  admin.STATUS_LABELS = { ACTIVE: '사용', LOCKED: '잠김', RETIRED: '퇴직' };
  const DEFAULT_GRADES = { NONE: '해당 없음', TEAM_LEAD: '팀장급', DEPT_HEAD: '부장급', EXECUTIVE: '대표급' };

  admin.isEmpNo = function (v) { return /^[0-9]{7}$/.test(String(v == null ? '' : v).trim()); };

  // 등록·수정 폼 검사 — 서버도 다시 검사한다(화면 검사를 믿지 않는다). 문제가 없으면 ''.
  admin.userFormError = function (f, isNew) {
    const form = f || {};
    if (isNew && !admin.isEmpNo(form.emp_no)) return '사번은 숫자 7자리여야 합니다.';
    const name = String(form.name == null ? '' : form.name).trim();
    if (!name || name.length > 50) return '이름은 1~50자로 입력하세요.';
    if (!form.role) return '역할을 선택하세요.';
    return '';
  };

  // 체크 한 칸을 바꿨을 때의 새 행. 조회를 끄면 나머지가 꺼지고, 작성·수정·결재를 켜면 조회가 따라 켜진다.
  // 결재는 결재 기능이 없는 메뉴(approvable=false)에서는 켤 수 없다.
  admin.togglePerm = function (row, field, checked) {
    const r = { menu_key: row.menu_key, label: row.label, approvable: !!row.approvable, source: row.source,
                view: !!row.view, write: !!row.write, edit: !!row.edit, approve: !!row.approve };
    if (field === 'approve' && !r.approvable) return r;
    r[field] = !!checked;
    if (field === 'view' && !r.view) { r.write = false; r.edit = false; r.approve = false; }
    else if (r.write || r.edit || r.approve) r.view = true;
    return r;
  };

  // 서버로 보낼 것 — 바뀐 메뉴만(통째로 덮어쓰면 동시 수정이 서로를 지운다).
  admin.permChanges = function (before, after) {
    const was = {};
    (before || []).forEach(function (r) { was[r.menu_key] = r; });
    const out = [];
    (after || []).forEach(function (r) {
      const b = was[r.menu_key] || {};
      if (!!b.view !== !!r.view || !!b.write !== !!r.write || !!b.edit !== !!r.edit || !!b.approve !== !!r.approve) {
        out.push({ menu: r.menu_key, view: !!r.view, write: !!r.write, edit: !!r.edit, approve: !!r.approve });
      }
    });
    return out;
  };

  // 메뉴 관리 격자의 열 — 사이드바의 대표 메뉴 순서·이름을 따른다(서버의 옛 라벨 '권한관리' 등을 쓰지 않는다).
  admin.menuColumns = function (serverMenus, categories) {
    const have = {};
    (serverMenus || []).forEach(function (m) { have[m.key] = m; });
    const used = {};
    const cols = [];
    (categories || []).forEach(function (cat) {
      cat.items.forEach(function (it) {
        if (!it.key || !have[it.key] || used[it.key]) return;
        used[it.key] = true;
        const label = it.key === ADMIN_MENU ? '시스템 관리' : it.label;
        cols.push({ key: it.key, label: label, group: cat.title, serverOnly: !!have[it.key].server_only });
      });
    });
    (serverMenus || []).forEach(function (m) {
      if (!used[m.key]) cols.push({ key: m.key, label: m.label, group: '기타', serverOnly: !!m.server_only });
    });
    return cols;
  };

  // 같은 그룹이 이어지는 구간을 묶는다(표 머리글의 colspan).
  admin.groupSpans = function (cols) {
    const out = [];
    (cols || []).forEach(function (c) {
      const last = out[out.length - 1];
      if (last && last.group === c.group) last.span += 1;
      else out.push({ group: c.group, span: 1 });
    });
    return out;
  };

  admin.gradeLabel = function (g, grades) { return (grades || DEFAULT_GRADES)[g] || '해당 없음'; };

  // UTC ISO → 한국시간 'YYYY-MM-DD HH:mm:ss'. 읽을 수 없으면 원문.
  admin.formatTime = function (iso) {
    const t = Date.parse(String(iso || ''));
    if (isNaN(t)) return String(iso || '');
    return new Date(t + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  };

  admin.maskIp = function (ip) {
    const v = String(ip || '');
    const m = v.match(/^(\d+\.\d+\.\d+)\.\d+$/);
    return m ? m[1] + '.*' : (v.indexOf(':') >= 0 ? v.split(':').slice(0, 2).join(':') + ':*' : v);
  };

  // CSV — 엑셀에서 열 때 수식으로 실행되지 않게 = + - @ 로 시작하는 칸 앞에 ' 를 붙인다(CSV 인젝션 방어).
  admin.csvCell = function (v) {
    let t = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return '"' + t.replace(/"/g, '""') + '"';
  };
  admin.auditCsv = function (items) {
    const head = ['시각(KST)', '사번', '신원', '이벤트', '메서드', '경로', '결과', 'IP', '상세'];
    const lines = [head.map(admin.csvCell).join(',')];
    (items || []).forEach(function (r) {
      lines.push([admin.formatTime(r.occurred_at), r.emp_no || '', r.emp_verified ? '검증됨' : '자기신고',
        admin.EVENT_LABELS[r.event_type] || r.event_type, r.http_method || '', r.req_path || '',
        r.status_code == null ? '' : r.status_code, admin.maskIp(r.client_ip), r.detail || ''].map(admin.csvCell).join(','));
    });
    return lines.join('\r\n');
  };

  // ── 렌더·배선 ───────────────────────────────────────────────────────
  function esc(s) {
    if (root.logic && root.logic.esc) return root.logic.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }

  let view = 'users';
  admin.currentView = function () { return view; };
  // 사이드바 항목이 부른다. 이미 열려 있으면 바로 다시 그리고, 아니면 mount가 그린다.
  admin.showView = function (v) {
    if (!admin.VIEWS[v]) return;
    view = v;
    if (el('ad-body')) paint();
  };

  function api(method, url, body) {
    const init = { method: method };
    if (body !== undefined) { init.headers = { 'Content-Type': 'application/json' }; init.body = JSON.stringify(body); }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          const e = new Error(j.detail || ('요청에 실패했습니다 (' + r.status + ')'));
          e.status = r.status;
          throw e;
        }
        return j;
      });
    });
  }
  function fail(e) {
    if (e && (e.status === 401 || e.status === 403)) {
      return e.status === 401 ? '로그인이 필요합니다. 사번으로 다시 로그인해 주세요.' : '이 기능을 쓸 권한이 없습니다.';
    }
    return (e && e.message) || '서버에 연결하지 못했습니다.';
  }
  function say(text, bad) {
    const m = el('ad-flash');
    if (!m) return;
    m.textContent = text || '';
    m.className = 'ad-flash' + (bad ? ' bad' : '');
  }

  // ── 메뉴 관리(역할×메뉴 격자) — 예전 '권한관리' ─────────────────────────
  let loaded = null;      // 서버에서 받은 원본(diff의 기준)
  let draft = null;       // 화면에서 만진 값

  admin.render = function (container, payload) {
    const g = admin.grid(payload);
    if (!g.rows.length) {
      container.innerHTML = '<p class="wf-empty">역할 정보를 불러오지 못했습니다.</p>';
      return;
    }
    const cols = admin.menuColumns(payload.menus, root.nav && root.nav.CATEGORIES);
    container.innerHTML =
      '<table class="ad-grid"><thead><tr><th rowspan="2">역할</th>' +
      admin.groupSpans(cols).map(function (s) { return '<th colspan="' + s.span + '">' + esc(s.group) + '</th>'; }).join('') +
      '</tr><tr>' + cols.map(function (m) {
        return '<th' + (m.serverOnly ? ' title="서버 모드에서만 열립니다"' : '') + '>' +
          esc(m.label) + (m.serverOnly ? ' <span class="ad-so">*</span>' : '') + '</th>';
      }).join('') + '</tr></thead><tbody>' +
      g.rows.map(function (r) {
        return '<tr><th>' + esc(r.role) + '</th>' + cols.map(function (m) {
          const on = r.cells[m.key] ? ' checked' : '';
          return '<td><input type="checkbox" data-role="' + esc(r.role) +
            '" data-menu="' + esc(m.key) + '"' + on + ' aria-label="' + esc(r.role + ' ' + m.label) + '"></td>';
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

  function paintMenusGrid() {
    admin.render(el('ad-grid'), { menus: loaded.menus, roles: draft });
    el('ad-grid').querySelectorAll('input[type=checkbox]').forEach(function (box) {
      box.onchange = function () {
        draft = collect();
        say(admin.lockCheck(draft), true);
      };
    });
    say('');
  }

  function loadMenus() {
    return fetch('/menus').then(function (r) {
      if (!r.ok) throw new Error('menus ' + r.status);
      return r.json();
    }).then(function (body) {
      loaded = body;
      draft = JSON.parse(JSON.stringify(body.roles || {}));
      paintMenusGrid();
    }).catch(function () {
      el('ad-grid').innerHTML = '<p class="wf-empty">메뉴 정보를 불러오지 못했습니다.</p>';
    });
  }

  function saveMenus() {
    const warn = admin.lockCheck(draft);
    if (warn) { say(warn, true); return; }
    const changes = admin.diff(loaded.roles, draft);
    if (!changes.length) { say('바뀐 것이 없습니다.'); return; }
    api('PUT', '/menus', { changes: changes }).then(function () {
      // 내 소속의 권한이 바뀌었을 수 있다 — 탭을 즉시 다시 계산한다.
      if (root.app && root.app.applyMenuPermissions) root.app.applyMenuPermissions();
      return loadMenus().then(function () { say(changes.length + '건을 저장했습니다.'); });
    }).catch(function (e) { say(fail(e), true); });
  }

  function paintMenus() {
    el('ad-body').innerHTML = '<div id="ad-grid"></div>' +
      '<div id="ad-actions"><button id="ad-save">저장</button><button id="ad-reset">되돌리기</button></div>';
    el('ad-save').onclick = saveMenus;
    el('ad-reset').onclick = function () {
      draft = JSON.parse(JSON.stringify(loaded.roles || {}));
      paintMenusGrid();
    };
    loadMenus();
  }

  // ── 사용자 관리 ───────────────────────────────────────────────────────
  let meta = null;
  let users = [];
  let userQuery = '';
  let showRetired = false;
  let editing = null;            // null | {isNew, form}
  let confirmRetire = null;      // 퇴직 확인 중인 사번

  function loadMeta() {
    return meta ? Promise.resolve(meta) : api('GET', '/sysadmin/meta').then(function (m) { meta = m; return m; });
  }

  function roleOptions(selected) {
    return '<option value="">선택</option>' + ((meta && meta.roles) || []).map(function (r) {
      return '<option value="' + esc(r) + '"' + (r === selected ? ' selected' : '') + '>' + esc(r) + '</option>';
    }).join('');
  }
  function gradeOptions(selected) {
    const g = (meta && meta.grades) || DEFAULT_GRADES;
    return Object.keys(g).map(function (k) {
      return '<option value="' + esc(k) + '"' + (k === (selected || 'NONE') ? ' selected' : '') + '>' + esc(g[k]) + '</option>';
    }).join('');
  }

  function userForm() {
    const f = editing.form;
    return '<div class="ad-form">' +
      '<label>사번<input id="uf-emp" maxlength="7" inputmode="numeric" autocomplete="off" value="' + esc(f.emp_no) + '"' +
        (editing.isNew ? '' : ' readonly') + ' placeholder="숫자 7자리"></label>' +
      '<label>이름<input id="uf-name" maxlength="50" autocomplete="off" value="' + esc(f.name) + '"></label>' +
      '<label>역할<select id="uf-role">' + roleOptions(f.role) + '</select></label>' +
      '<label>직위<input id="uf-pos" maxlength="50" autocomplete="off" value="' + esc(f.position_title) + '" placeholder="예: 과장"></label>' +
      '<label>결재 등급<select id="uf-grade">' + gradeOptions(f.approval_grade) + '</select></label>' +
      '<div class="ad-form-actions"><button id="uf-save" class="primary">' + (editing.isNew ? '등록' : '저장') +
      '</button><button id="uf-cancel">취소</button></div></div>';
  }

  function paintUsers() {
    const q = userQuery.trim().toLowerCase();
    const rows = users.filter(function (u) {
      if (!showRetired && u.status === 'RETIRED') return false;
      return !q || (u.name || '').toLowerCase().indexOf(q) >= 0 || u.emp_no.indexOf(q) >= 0 ||
        (u.role || '').toLowerCase().indexOf(q) >= 0;
    });
    const grades = (meta && meta.grades) || DEFAULT_GRADES;
    el('ad-body').innerHTML =
      '<div class="ad-toolbar"><input id="us-q" placeholder="이름·사번·역할 검색" value="' + esc(userQuery) + '">' +
      '<label class="ad-inline"><input type="checkbox" id="us-retired"' + (showRetired ? ' checked' : '') + '> 퇴직 포함</label>' +
      '<span class="ad-count">' + rows.length + '명</span>' +
      '<button id="us-new" class="primary">사용자 등록</button></div>' +
      (editing ? userForm() : '') +
      '<table class="ad-table"><thead><tr><th>사번</th><th>이름</th><th>역할</th><th>직위</th><th>결재 등급</th><th>상태</th><th>최근 로그인</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (u) {
        const retiring = confirmRetire === u.emp_no;
        return '<tr class="st-' + esc((u.status || '').toLowerCase()) + '"><td class="mono">' + esc(u.emp_no) + '</td><td>' + esc(u.name) +
          '</td><td>' + esc(u.role) + '</td><td>' + esc(u.position_title || '') + '</td><td>' +
          esc(admin.gradeLabel(u.approval_grade, grades)) + '</td><td><span class="ad-badge ' + esc((u.status || '').toLowerCase()) + '">' +
          esc(admin.STATUS_LABELS[u.status] || u.status) + '</span></td><td>' +
          esc(u.last_login_at ? admin.formatTime(u.last_login_at) : '-') + '</td><td class="ad-ops">' +
          (u.status === 'RETIRED' ? '<button data-op="restore" data-emp="' + esc(u.emp_no) + '">복직</button>' :
            '<button data-op="edit" data-emp="' + esc(u.emp_no) + '">수정</button>' +
            (u.status === 'LOCKED' ? '<button data-op="unlock" data-emp="' + esc(u.emp_no) + '">잠금 해제</button>' :
              '<button data-op="lock" data-emp="' + esc(u.emp_no) + '">잠금</button>') +
            (retiring ? '<button class="danger" data-op="retire-yes" data-emp="' + esc(u.emp_no) + '">정말 퇴직</button>' +
              '<button data-op="retire-no">취소</button>' :
              '<button data-op="retire" data-emp="' + esc(u.emp_no) + '">퇴직</button>')) + '</td></tr>';
      }).join('') : '<tr><td colspan="8" class="ad-empty">조건에 맞는 사용자가 없습니다.</td></tr>') + '</tbody></table>';

    el('us-q').oninput = function (e) {
      userQuery = e.target.value;
      const pos = e.target.selectionStart;
      paintUsers();
      const q2 = el('us-q'); q2.focus(); q2.setSelectionRange(pos, pos);
    };
    el('us-retired').onchange = function (e) { showRetired = e.target.checked; paintUsers(); };
    el('us-new').onclick = function () {
      editing = { isNew: true, form: { emp_no: '', name: '', role: '', position_title: '', approval_grade: 'NONE' } };
      paintUsers();
      el('uf-emp').focus();
    };
    if (editing) {
      el('uf-cancel').onclick = function () { editing = null; paintUsers(); };
      el('uf-save').onclick = saveUser;
    }
    el('ad-body').querySelectorAll('button[data-op]').forEach(function (b) {
      b.onclick = function () { userOp(b.dataset.op, b.dataset.emp); };
    });
  }

  function saveUser() {
    const form = {
      emp_no: el('uf-emp').value.trim(), name: el('uf-name').value, role: el('uf-role').value,
      position_title: el('uf-pos').value, approval_grade: el('uf-grade').value
    };
    const bad = admin.userFormError(form, editing.isNew);
    if (bad) { say(bad, true); return; }
    const req = editing.isNew ? api('POST', '/sysadmin/users', form)
      : api('PUT', '/sysadmin/users/' + encodeURIComponent(form.emp_no), form);
    req.then(function () {
      say(editing.isNew ? '등록했습니다.' : '저장했습니다.');
      editing = null;
      return loadUsers();
    }).catch(function (e) { say(fail(e), true); });
  }

  function userOp(op, emp) {
    const u = users.filter(function (x) { return x.emp_no === emp; })[0];
    if (op === 'edit' && u) {
      editing = { isNew: false, form: { emp_no: u.emp_no, name: u.name, role: u.role,
        position_title: u.position_title || '', approval_grade: u.approval_grade } };
      paintUsers();
      el('uf-name').focus();
      return;
    }
    if (op === 'retire') { confirmRetire = emp; paintUsers(); return; }
    if (op === 'retire-no') { confirmRetire = null; paintUsers(); return; }
    const status = { lock: 'LOCKED', unlock: 'ACTIVE', restore: 'ACTIVE', 'retire-yes': 'RETIRED' }[op];
    if (!status) return;
    confirmRetire = null;
    api('PUT', '/sysadmin/users/' + encodeURIComponent(emp) + '/status', { status: status })
      .then(function () { say('변경했습니다.'); return loadUsers(); })
      .catch(function (e) { say(fail(e), true); paintUsers(); });
  }

  function loadUsers() {
    return Promise.all([loadMeta(), api('GET', '/sysadmin/users')]).then(function (res) {
      users = res[1].users || [];
      paintUsers();
    }).catch(function (e) {
      el('ad-body').innerHTML = '<p class="wf-empty">' + esc(fail(e)) + '</p>';
    });
  }

  // ── 권한 관리(사용자별) ───────────────────────────────────────────────
  let permEmp = '';
  let permLoaded = [];
  let permDraft = [];
  let permHistory = [];

  function paintPerms() {
    const grades = (meta && meta.grades) || DEFAULT_GRADES;
    const active = users.filter(function (u) { return u.status !== 'RETIRED'; });
    const me = users.filter(function (u) { return u.emp_no === permEmp; })[0];
    const changes = admin.permChanges(permLoaded, permDraft);
    // 메뉴 이름은 사이드바의 현재 이름을 따른다(서버의 옛 라벨 '지식'·'권한관리' 대신).
    const names = {};
    admin.menuColumns((meta && meta.menus) || [], root.nav && root.nav.CATEGORIES).forEach(function (c) { names[c.key] = c.label; });
    el('ad-body').innerHTML =
      '<div class="ad-toolbar"><label class="ad-inline">사용자 <select id="pm-user"><option value="">선택</option>' +
      active.map(function (u) {
        return '<option value="' + esc(u.emp_no) + '"' + (u.emp_no === permEmp ? ' selected' : '') + '>' +
          esc(u.name + ' (' + u.emp_no + ') · ' + u.role) + '</option>';
      }).join('') + '</select></label>' +
      (me ? '<span class="ad-badge grade">결재 등급 · ' + esc(admin.gradeLabel(me.approval_grade, grades)) + '</span>' : '') + '</div>' +
      (permEmp ? '<table class="ad-table ad-perms"><thead><tr><th>메뉴</th><th>조회</th><th>작성</th><th>수정</th><th>결재</th><th>기준</th></tr></thead><tbody>' +
        permDraft.map(function (r, i) {
          function box(field, disabled, tip) {
            return '<td><input type="checkbox" data-i="' + i + '" data-f="' + field + '"' + (r[field] ? ' checked' : '') +
              (disabled ? ' disabled' : '') + (tip ? ' title="' + esc(tip) + '"' : '') +
              ' aria-label="' + esc(r.label + ' ' + field) + '"></td>';
          }
          return '<tr><th>' + esc(names[r.menu_key] || r.label) + '</th>' + box('view') + box('write') + box('edit') +
            box('approve', !r.approvable, r.approvable ? '' : '이 메뉴에는 결재 기능이 없습니다') +
            '<td><span class="ad-badge ' + (r.source === 'user' ? 'warn' : 'muted') + '">' +
            (r.source === 'user' ? '개별 설정' : '역할 기본') + '</span></td></tr>';
        }).join('') + '</tbody></table>' +
        '<div id="ad-actions"><button id="pm-save" class="primary"' + (changes.length ? '' : ' disabled') + '>저장' +
        (changes.length ? ' (' + changes.length + '개 메뉴)' : '') + '</button><button id="pm-reset">되돌리기</button></div>' +
        '<h4 class="ad-sub">변경 이력</h4>' +
        (permHistory.length ? '<table class="ad-table"><thead><tr><th>시각</th><th>변경자</th><th>항목</th><th>이전</th><th>이후</th></tr></thead><tbody>' +
          permHistory.map(function (h) {
            return '<tr><td>' + esc(admin.formatTime(h.changed_at)) + '</td><td class="mono">' + esc(h.actor_emp_no || '-') +
              '</td><td>' + esc(h.item) + '</td><td>' + esc(h.before_value == null ? '' : h.before_value) + '</td><td>' +
              esc(h.after_value == null ? '' : h.after_value) + '</td></tr>';
          }).join('') + '</tbody></table>' : '<p class="ad-empty">아직 변경 이력이 없습니다.</p>')
        : '<p class="ad-empty">권한을 볼 사용자를 선택하세요.</p>');
    el('pm-user').onchange = function (e) { permEmp = e.target.value; loadPerms(); };
    if (!permEmp) return;
    el('ad-body').querySelectorAll('input[data-f]').forEach(function (box) {
      box.onchange = function () {
        const i = Number(box.dataset.i);
        permDraft[i] = admin.togglePerm(permDraft[i], box.dataset.f, box.checked);
        paintPerms();
      };
    });
    el('pm-reset').onclick = function () { permDraft = JSON.parse(JSON.stringify(permLoaded)); paintPerms(); };
    el('pm-save').onclick = function () {
      api('PUT', '/sysadmin/perms/' + encodeURIComponent(permEmp), { changes: changes })
        .then(function (r) { say(r.saved + '개 메뉴의 권한을 저장했습니다.'); return loadPerms(); })
        .catch(function (e) { say(fail(e), true); });
    };
  }

  function loadPerms() {
    if (!permEmp) { paintPerms(); return Promise.resolve(); }
    return Promise.all([api('GET', '/sysadmin/perms/' + encodeURIComponent(permEmp)),
      api('GET', '/sysadmin/perm-changes?emp=' + encodeURIComponent(permEmp))]).then(function (res) {
      permLoaded = (res[0].menus || []).map(function (m) {
        return { menu_key: m.menu_key, label: m.label, approvable: m.approvable, source: m.source,
                 view: m.view, write: m.write, edit: m.edit, approve: m.approve };
      });
      permDraft = JSON.parse(JSON.stringify(permLoaded));
      permHistory = res[1].items || [];
      paintPerms();
    }).catch(function (e) { say(fail(e), true); });
  }

  function loadPermsScreen() {
    return Promise.all([loadMeta(), api('GET', '/sysadmin/users')]).then(function (res) {
      users = res[1].users || [];
      return loadPerms();
    }).catch(function (e) { el('ad-body').innerHTML = '<p class="wf-empty">' + esc(fail(e)) + '</p>'; });
  }

  // ── 접근 이력 ─────────────────────────────────────────────────────────
  const audit = { from: '', to: '', emp: '', event: '', page: 0, size: 50, data: null };

  function paintAudit() {
    const d = audit.data || { items: [], total: 0, page: 0, size: audit.size };
    const pages = Math.max(1, Math.ceil(d.total / d.size));
    const fails = d.items.filter(function (r) { return r.event_type === 'LOGIN_FAIL' || r.event_type === 'DENIED'; }).length;
    el('ad-body').innerHTML =
      '<div class="ad-toolbar">' +
      '<label class="ad-inline">시작 <input type="date" id="au-from" value="' + esc(audit.from) + '"></label>' +
      '<label class="ad-inline">끝 <input type="date" id="au-to" value="' + esc(audit.to) + '"></label>' +
      '<label class="ad-inline">사번 <input id="au-emp" maxlength="7" inputmode="numeric" value="' + esc(audit.emp) + '" style="width:92px"></label>' +
      '<label class="ad-inline">이벤트 <select id="au-event"><option value="">전체</option>' +
      Object.keys(admin.EVENT_LABELS).map(function (k) {
        return '<option value="' + k + '"' + (audit.event === k ? ' selected' : '') + '>' + esc(admin.EVENT_LABELS[k]) + '</option>';
      }).join('') + '</select></label>' +
      '<button id="au-go" class="primary">조회</button><button id="au-csv">CSV 내보내기</button>' +
      '<span class="ad-count">총 ' + d.total + '건' + (fails ? ' · 이 쪽의 실패·거부 ' + fails + '건' : '') + '</span></div>' +
      '<table class="ad-table ad-audit"><thead><tr><th>시각(KST)</th><th>사번</th><th>신원</th><th>이벤트</th><th>요청</th><th>결과</th><th>IP</th><th>상세</th></tr></thead><tbody>' +
      (d.items.length ? d.items.map(function (r) {
        const bad = r.event_type === 'LOGIN_FAIL' || r.event_type === 'DENIED' || (r.status_code >= 400);
        return '<tr class="' + (bad ? 'bad' : '') + '"><td>' + esc(admin.formatTime(r.occurred_at)) + '</td><td class="mono">' +
          esc(r.emp_no || '-') + '</td><td>' + (r.emp_verified ? '<span class="ad-badge ok">검증됨</span>' :
            '<span class="ad-badge muted">자기신고</span>') + '</td><td>' + esc(admin.EVENT_LABELS[r.event_type] || r.event_type) +
          '</td><td class="mono">' + esc((r.http_method || '') + ' ' + (r.req_path || '')) + '</td><td>' +
          esc(r.status_code == null ? '' : r.status_code) + '</td><td class="mono">' + esc(r.client_ip || '') + '</td><td>' +
          esc(r.detail || '') + '</td></tr>';
      }).join('') : '<tr><td colspan="8" class="ad-empty">기록이 없습니다.</td></tr>') + '</tbody></table>' +
      '<div class="ad-pager"><button id="au-prev"' + (d.page <= 0 ? ' disabled' : '') + '>이전</button><span>' + (d.page + 1) + ' / ' + pages +
      '</span><button id="au-next"' + (d.page + 1 >= pages ? ' disabled' : '') + '>다음</button></div>';
    el('au-go').onclick = function () { readAuditFilters(); audit.page = 0; loadAudit(); };
    el('au-prev').onclick = function () { audit.page = Math.max(0, audit.page - 1); loadAudit(); };
    el('au-next').onclick = function () { audit.page += 1; loadAudit(); };
    el('au-csv').onclick = function () { downloadCsv(admin.auditCsv(d.items)); };
  }

  function readAuditFilters() {
    audit.from = el('au-from').value;
    audit.to = el('au-to').value;
    audit.emp = el('au-emp').value.trim();
    audit.event = el('au-event').value;
  }

  function downloadCsv(text) {
    // BOM을 붙여 엑셀이 한글을 깨뜨리지 않게 한다.
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'access-log.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function loadAudit() {
    const q = ['page=' + audit.page, 'size=' + audit.size];
    if (audit.from) q.push('from=' + encodeURIComponent(audit.from));
    if (audit.to) q.push('to=' + encodeURIComponent(audit.to));
    if (audit.emp) q.push('emp=' + encodeURIComponent(audit.emp));
    if (audit.event) q.push('event=' + encodeURIComponent(audit.event));
    return api('GET', '/sysadmin/access-log?' + q.join('&')).then(function (d) {
      audit.data = d;
      paintAudit();
    }).catch(function (e) { el('ad-body').innerHTML = '<p class="wf-empty">' + esc(fail(e)) + '</p>'; });
  }

  // ── 보기 전환 ─────────────────────────────────────────────────────────
  function paint() {
    el('ad-head').innerHTML = esc(admin.VIEWS[view]) + ' <span class="dg-hint">— ' + esc(admin.VIEW_HINTS[view]) + '</span>';
    say('');
    editing = null;
    confirmRetire = null;
    if (view === 'users') { el('ad-body').innerHTML = ''; loadUsers(); }
    else if (view === 'perms') { el('ad-body').innerHTML = ''; loadPermsScreen(); }
    else if (view === 'menus') paintMenus();
    else { el('ad-body').innerHTML = ''; loadAudit(); }
  }

  admin.mount = function () { paint(); };

  admin.unmount = function () { /* 폴링이 없어 정리할 것이 없다 */ };

  if (typeof module !== 'undefined' && module.exports) module.exports = admin;
  else root.admin = admin;
})(typeof self !== 'undefined' ? self : this);
