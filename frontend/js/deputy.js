(function (root) {
  'use strict';
  // 대결 설정 — 결재함 아래 카드. 결재자 **본인이** 부재 기간 동안 자기 결재를 맡길 사람을 지정한다.
  //   · 자격은 고정하지 않는다(부장의 대결자를 다른 팀장으로 둘 수도 있다). 과장 미만이면 경고만 뜬다.
  //   · 서버가 막는 것: 자기 자신, 기간 중복, 최대 90일. 그리고 결재할 때의 방향 규칙 —
  //     상신자가 대결자보다 상위 직급이면 그 건은 대결자가 결재할 수 없다.
  const deputy = {};

  deputy.MAX_DAYS = 90;

  // 입력 검사(서버도 같은 검사를 다시 한다). 문제가 없으면 ''.
  deputy.formError = function (f, today) {
    const form = f || {};
    if (!/^[0-9]{7}$/.test(String(form.deputy_emp_no || ''))) return '대결자를 선택하세요.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.start_date || '') || !/^\d{4}-\d{2}-\d{2}$/.test(form.end_date || '')) {
      return '시작일과 종료일을 입력하세요.';
    }
    if (today && form.start_date < today) return '시작일은 오늘 이후여야 합니다.';
    if (form.end_date < form.start_date) return '종료일은 시작일 이후여야 합니다.';
    const days = (Date.parse(form.end_date) - Date.parse(form.start_date)) / 86400000 + 1;
    if (days > deputy.MAX_DAYS) return '대결 기간은 최대 ' + deputy.MAX_DAYS + '일까지 지정할 수 있습니다.';
    return '';
  };

  // 대결자 후보 — 사용 중인 사용자, 나 제외. (자격은 서버·업무가 정한다.)
  deputy.candidates = function (users, myEmp) {
    return (users || []).filter(function (u) { return u.emp_no !== myEmp && u.status === 'ACTIVE'; });
  };

  deputy.periodText = function (d) {
    return d.start_date === d.end_date ? d.start_date : d.start_date + ' ~ ' + d.end_date;
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = deputy; return; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function el(id) { return document.getElementById(id); }
  function myEmp() { return (root.store.loadSession() || {}).emp || ''; }

  function say(text, bad) {
    const m = el('dp-msg');
    if (m) { m.textContent = text || ''; m.className = 'ad-flash' + (bad ? ' bad' : ''); }
  }

  function api(method, url, body) {
    const init = { method: method };
    if (body !== undefined) { init.headers = { 'Content-Type': 'application/json' }; init.body = JSON.stringify(body); }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.detail || ('요청에 실패했습니다 (' + r.status + ')'));
        return j;
      });
    });
  }

  let mine = [];
  let people = [];

  function paint() {
    const me = myEmp();
    const rows = mine.filter(function (d) { return d.principal_emp_no === me; });
    const asDeputy = mine.filter(function (d) { return d.deputy_emp_no === me; });
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    el('ap-deputy').innerHTML =
      '<h4 class="ad-sub">대결 설정 <span class="dg-hint">— 부재 기간 동안 내 결재를 대신 처리할 사람(최대 ' + deputy.MAX_DAYS + '일)</span></h4>' +
      '<div class="ad-toolbar"><label class="ad-inline">대결자 <select id="dp-who"><option value="">선택</option>' +
      deputy.candidates(people, me).map(function (u) {
        return '<option value="' + esc(u.emp_no) + '">' + esc(u.name + ' (' + u.emp_no + ') · ' + u.role +
          (u.position_title ? ' ' + u.position_title : '')) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="ad-inline">시작 <input type="date" id="dp-from" value="' + today + '" min="' + today + '"></label>' +
      '<label class="ad-inline">끝 <input type="date" id="dp-to" value="' + today + '" min="' + today + '"></label>' +
      '<label class="ad-inline">사유 <input id="dp-reason" maxlength="200" placeholder="예: 출장" style="width:160px"></label>' +
      '<button id="dp-add" class="primary">지정</button><span id="dp-msg" class="ad-flash"></span></div>' +
      '<table class="ad-table"><thead><tr><th>대결자</th><th>기간</th><th>사유</th><th>상태</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (d) {
        return '<tr><td>' + esc(d.deputy_name || d.deputy_emp_no) + (d.deputy_position ? ' (' + esc(d.deputy_position) + ')' : '') +
          '</td><td>' + esc(deputy.periodText(d)) + '</td><td>' + esc(d.reason || '') + '</td><td><span class="ad-badge ' +
          (d.active_now ? 'ok' : 'muted') + '">' + (d.active_now ? '대결 중' : '예정') + '</span></td><td class="ad-ops">' +
          '<button data-cancel="' + esc(d.deputy_id) + '">취소</button></td></tr>';
      }).join('') : '<tr><td colspan="5" class="ad-empty">지정한 대결이 없습니다.</td></tr>') + '</tbody></table>' +
      (asDeputy.length ? '<p class="ad-note">내가 대결자로 지정된 기간: ' + asDeputy.map(function (d) {
        return esc((d.principal_name || d.principal_emp_no) + ' ' + deputy.periodText(d));
      }).join(', ') + '</p>' : '');
    el('dp-add').onclick = function () {
      const form = { deputy_emp_no: el('dp-who').value, start_date: el('dp-from').value, end_date: el('dp-to').value,
        reason: el('dp-reason').value };
      const bad = deputy.formError(form, today);
      if (bad) { say(bad, true); return; }
      api('POST', '/approval-deputies', form).then(function (d) {
        return load().then(function () { say('지정했습니다.' + (d.warning ? ' ' + d.warning : '')); });
      }).catch(function (e) { say(e.message, true); });
    };
    el('ap-deputy').querySelectorAll('button[data-cancel]').forEach(function (b) {
      b.onclick = function () {
        api('DELETE', '/approval-deputies/' + encodeURIComponent(b.dataset.cancel))
          .then(function () { return load().then(function () { say('취소했습니다.'); }); })
          .catch(function (e) { say(e.message, true); });
      };
    });
  }

  function load() {
    if (!myEmp()) { el('ap-deputy').innerHTML = ''; return Promise.resolve(); }
    return api('GET', '/approval-deputies').then(function (r) {
      mine = r.items || [];
      // 대결자 후보: 같은 목록을 관리자만 읽을 수 있어, 일반 사용자는 결재 목록의 이름으로 고르게 한다.
      return api('GET', '/approval-deputies/candidates').then(function (c) { people = c.users || []; });
    }).then(paint).catch(function () { el('ap-deputy').innerHTML = ''; });
  }

  deputy.mount = load;
  root.deputy = deputy;
})(typeof self !== 'undefined' ? self : this);
