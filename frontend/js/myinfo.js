(function (root) {
  'use strict';
  // 내 정보 — 계정·권한 관련 개인 설정(회원관리성). 헤더 우측 프로필 팝오버의 "내 정보"로 들어온다.
  //   · 기본 정보 : 사번·이름·소속·직급·상위 결재자(읽기 전용)
  //   · 내 권한   : 지금 권한을 보고 바꿀 칸을 체크해 신청 → /approval-requests/perm (진행은 결재함 › 내가 올린 요청)
  //   · 대결 설정 : 부재 기간 동안 내 결재를 맡길 사람 (결재 권한이 있을 때만 의미가 있다)
  // 사이드바 메뉴가 아니다 — 메뉴 키를 늘리면 /menus 계약·골든이 흔들려서, 숨은 탭 버튼(#tab-btn-myinfo)으로 연다.
  // ⚠️ 비밀번호는 없다 — 지금 로그인은 사번만 쓴다. 인증 방식이 정해지면 '기본 정보'에 붙인다.
  const myinfo = {};

  const admin = (typeof require !== 'undefined') ? require('./admin.js') : root.admin;
  const approvals = (typeof require !== 'undefined') ? require('./approvals.js') : root.approvals;

  myinfo.VIEWS = [
    { key: 'basic', label: '기본 정보' },
    { key: 'perms', label: '내 권한' },
    { key: 'deputy', label: '대결 설정' },
  ];
  myinfo.normView = function (key) {
    return myinfo.VIEWS.some(function (v) { return v.key === key; }) ? key : myinfo.VIEWS[0].key;
  };

  // 기본 정보 표 — 값이 없으면 '-'. 상위 결재자가 없으면 최상위(대표급)라는 뜻이다.
  myinfo.basicRows = function (me) {
    const m = me || {};
    function v(x) { return x ? String(x) : '-'; }
    return [
      { label: '사번', value: v(m.emp_no) },
      { label: '이름', value: v(m.name) },
      { label: '소속', value: v(m.role) },
      { label: '직급', value: v(m.position_title) },
      { label: '상위 결재자', value: m.approver_name ? m.approver_name + ' (' + m.approver_emp_no + ')' : '없음 (최상위)' },
    ];
  };

  // 내 권한 표의 행 — 서버(my-perms)의 menus에 화면 이름을 붙인다. admin.togglePerm/permChanges가 그대로 쓰는 모양이다.
  myinfo.permRows = function (menus, categories) {
    return (menus || []).map(function (m) {
      return { menu_key: m.menu_key, label: approvals.menuName(m.menu_key, categories) || m.label,
               approvable: !!m.approvable, source: m.source,
               view: !!m.view, write: !!m.write, edit: !!m.edit, approve: !!m.approve };
    });
  };

  myinfo.reasonError = function (reason) {
    const r = String(reason || '').trim();
    if (!r) return '신청 사유를 입력하세요.';
    if (r.length > 200) return '신청 사유는 200자 이내로 입력하세요.';
    return '';
  };
  // 신청 전에 화면에서 먼저 알려준다(서버도 같은 검사를 다시 한다). 문제가 없으면 ''.
  myinfo.submitError = function (changes, reason) {
    if (!changes || !changes.length) return '바꿀 권한을 체크하거나 해제한 뒤 신청하세요.';
    return myinfo.reasonError(reason);
  };

  myinfo.deputyNotice = function (canApprove) {
    return canApprove ? '' : '결재 권한이 없어 대결을 지정할 수 없습니다. 결재 권한이 필요하면 [내 권한]에서 신청하세요.';
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = myinfo; return; }

  // ── 렌더·배선(브라우저 전용) ─────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }

  let view = myinfo.VIEWS[0].key;
  let me = null;          // /approval-requests/my-perms 응답
  let loaded = [];        // 서버가 준 권한 행
  let draft = [];         // 화면에서 고친 행
  let reason = '';
  let flash = { text: '', bad: false };
  let loadError = '';

  function say(text, bad) {
    flash = { text: text || '', bad: !!bad };
    const m = el('mi-msg');
    if (m) { m.textContent = flash.text; m.className = 'ad-flash' + (flash.bad ? ' bad' : ''); }
  }

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

  function paintBasic() {
    el('mi-body').innerHTML = '<table class="ad-table mi-kv"><tbody>' + myinfo.basicRows(me).map(function (r) {
      return '<tr><th>' + esc(r.label) + '</th><td>' + esc(r.value) + '</td></tr>';
    }).join('') + '</tbody></table>' +
      '<h4 class="ad-sub">비밀번호</h4>' +
      '<p class="dg-hint">현재는 사번 로그인만 지원합니다. 인증 방식(SSO 등)이 정해지면 이곳에 추가합니다.</p>';
  }

  function paintPerms() {
    const changes = admin.permChanges(loaded, draft);
    el('mi-body').innerHTML =
      '<p class="dg-hint">현재 권한입니다. 바꿀 칸을 체크하거나 해제하고 사유를 적어 신청하세요 — 승인되면 자동으로 반영됩니다. ' +
      '진행 상태는 결재함 › 내가 올린 요청에서 봅니다.</p>' +
      '<table class="ad-table ad-perms"><thead><tr><th>메뉴</th><th>조회</th><th>작성</th><th>수정</th><th>결재</th><th>기준</th></tr></thead><tbody>' +
      draft.map(function (r, i) {
        function box(field, disabled, tip) {
          return '<td><input type="checkbox" data-i="' + i + '" data-f="' + field + '"' + (r[field] ? ' checked' : '') +
            (disabled ? ' disabled' : '') + (tip ? ' title="' + esc(tip) + '"' : '') +
            ' aria-label="' + esc(r.label + ' ' + field) + '"></td>';
        }
        return '<tr><th>' + esc(r.label) + '</th>' + box('view') + box('write') + box('edit') +
          box('approve', !r.approvable, r.approvable ? '' : '이 메뉴에는 결재 기능이 없습니다') +
          '<td><span class="ad-badge ' + (r.source === 'user' ? 'warn' : 'muted') + '">' +
          (r.source === 'user' ? '개별 설정' : '역할 기본') + '</span></td></tr>';
      }).join('') + '</tbody></table>' +
      '<label class="mi-reason">신청 사유 <textarea id="mi-reason" rows="2" maxlength="200" placeholder="왜 필요한지 적어 주세요 (200자 이내)">' +
      esc(reason) + '</textarea></label>' +
      '<div id="ad-actions"><button id="mi-submit" class="primary"' + (changes.length ? '' : ' disabled') + '>신청' +
      (changes.length ? ' (' + changes.length + '개 메뉴)' : '') + '</button><button id="mi-reset">되돌리기</button></div>';
    el('mi-body').querySelectorAll('input[data-f]').forEach(function (b) {
      b.onchange = function () {
        reason = el('mi-reason').value;
        const i = Number(b.dataset.i);
        draft[i] = admin.togglePerm(draft[i], b.dataset.f, b.checked);
        paintPerms();
      };
    });
    el('mi-reason').oninput = function () { reason = el('mi-reason').value; };
    el('mi-reset').onclick = function () { reason = ''; draft = JSON.parse(JSON.stringify(loaded)); say(''); paintPerms(); };
    el('mi-submit').onclick = function () {
      reason = el('mi-reason').value;
      const bad = myinfo.submitError(changes, reason);
      if (bad) { say(bad, true); return; }
      el('mi-submit').disabled = true;
      api('POST', '/approval-requests/perm', { reason: reason.trim(), changes: changes }).then(function () {
        reason = '';
        return load().then(function () { say('신청했습니다. 결재함 › 내가 올린 요청에서 진행 상태를 확인하세요.'); });
      }).catch(function (e) { el('mi-submit').disabled = false; say(e.message, true); });
    };
  }

  function paintDeputy() {
    const notice = myinfo.deputyNotice(!!(me && me.can_approve));
    el('mi-body').innerHTML = notice ? '<p class="wf-empty">' + esc(notice) + '</p>' : '<div id="mi-deputy"></div>';
    if (!notice && root.deputy && root.deputy.mount) root.deputy.mount('mi-deputy');
  }

  function paint() {
    el('mi-tabs').innerHTML = myinfo.VIEWS.map(function (v) {
      return '<button type="button" role="tab" class="' + (v.key === view ? 'on' : '') + '" data-v="' + v.key + '">' +
        esc(v.label) + '</button>';
    }).join('');
    el('mi-tabs').querySelectorAll('button').forEach(function (b) {
      b.onclick = function () { view = myinfo.normView(b.dataset.v); say(''); paint(); };
    });
    // 프로필 편집(데모)은 기본 정보 탭에서만 — 컨테이너를 다시 그리지 않으므로 #me-* 연결이 살아 있다.
    el('mi-demo').style.display = (!loadError && me && view === 'basic') ? '' : 'none';
    if (loadError) { el('mi-body').innerHTML = '<p class="wf-empty">' + esc(loadError) + '</p>'; return; }
    if (!me) { el('mi-body').innerHTML = ''; return; }
    if (view === 'basic') paintBasic();
    else if (view === 'perms') paintPerms();
    else paintDeputy();
    say(flash.text, flash.bad);
  }

  function load() {
    return api('GET', '/approval-requests/my-perms').then(function (r) {
      me = r;
      loaded = myinfo.permRows(r.menus, root.nav && root.nav.CATEGORIES);
      draft = JSON.parse(JSON.stringify(loaded));
      loadError = '';
      paint();
    }).catch(function (e) {
      me = null;
      loadError = e && e.status === 401 ? '로그인이 필요합니다. 사번으로 로그인해 주세요.'
        : (e && e.status === 403 ? '이 계정으로는 쓸 수 없습니다.' : '내 정보를 불러오지 못했습니다.');
      paint();
    });
  }

  myinfo.mount = function () { view = myinfo.VIEWS[0].key; flash = { text: '', bad: false }; reason = ''; return load(); };
  myinfo.unmount = function () { /* 폴링이 없어 정리할 것이 없다 */ };
  myinfo.onProfileChange = function () { if (el('tab-myinfo') && el('tab-myinfo').classList.contains('active')) load(); };

  root.myinfo = myinfo;
})(typeof self !== 'undefined' ? self : this);
