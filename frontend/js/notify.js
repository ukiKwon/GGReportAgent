(function (root) {
  'use strict';
  // 쪽지함·결재함 (계획 C2, 스펙 §⑦-⑤). A2에서 연기했던 기능 — notifications 행은
  // 그동안 쌓이기만 하고 읽을 길이 없었다(미읽음 수가 단조 증가하던 원인).
  // 수신자는 사람 이름일 수도 역할일 수도 있어(영업팀·디자이너·인사권자)
  // store.myRecipients()가 소속과 이름을 함께 준다. 결재 알림 쪽지는 이름이 겹칠 수 있어 사번으로 온다.
  //
  // 쪽지함은 두 탭으로 나뉜다 — **개인 쪽지**(내 이름·사번 앞)와 **단체 쪽지**(내 소속 같은 역할 앞).
  // 단체 쪽지의 읽음은 그 역할 전원이 공유한다(read_at이 한 칸) — 그래서 눌러서 자동으로 읽히지 않고
  // 버튼을 눌러 표시한다.
  const notify = {};

  const KIND_CLASS = { '결재요청': 'approval', '결재알림': 'approval', '결재결과': 'handoff',
    '되물음': 'risk', '이관': 'handoff', '쪽지': 'note' };

  // 쪽지의 link 값 → 이동할 화면. (옛 제안서 워크플로의 '결재요청'은 link가 없지만 같은 결재함으로 간다.)
  const DESTINATIONS = {
    'approvals:inbox': { tab: 'approvals', sub: 'inbox', label: '결재함 › 받은 결재' },
    'approvals:mine': { tab: 'approvals', sub: 'mine', label: '결재함 › 내가 올린 요청' },
  };

  notify.destination = function (n) {
    const x = n || {};
    if (x.link && DESTINATIONS[x.link]) return DESTINATIONS[x.link];
    if (x.kind === '결재요청') return DESTINATIONS['approvals:inbox'];
    return null;
  };

  notify.rows = function (list) {
    return (list || []).map(function (n) {
      return {
        id: n.notification_id,
        kind: n.kind,
        from: n.sender || '시스템',      // 그래프가 보낸 것은 sender가 없다
        to: n.recipient,
        at: n.created_at,
        content: n.content,
        read: !!n.read_at,
        stage: n.stage == null ? null : n.stage,
        institutionId: n.institution_id || null,
        dest: notify.destination(n),
      };
    });
  };

  notify.unreadCount = function (list) {
    return (list || []).filter(function (n) { return !n.read_at; }).length;
  };

  notify.kindClass = function (kind) { return KIND_CLASS[kind] || 'note'; };

  // 서버의 UTC ISO(마이크로초 포함)를 한국시간 'YYYY-MM-DD HH:mm'으로. 해석이 안 되면 원문 그대로.
  notify.formatTime = function (iso) {
    const t = Date.parse(String(iso || ''));
    if (isNaN(t)) return String(iso || '');
    return new Date(t + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);
  };

  // 나(이름·사번) 앞으로 온 것은 개인, 그 밖(내 소속 같은 역할 앞)은 단체.
  notify.scopeOf = function (n, me) {
    const m = me || {};
    const to = (n || {}).recipient;
    return to && (to === m.name || to === m.emp) ? 'personal' : 'group';
  };

  notify.TABS = [
    { key: 'personal', label: '개인 쪽지', empty: '받은 개인 쪽지가 없습니다.' },
    { key: 'group', label: '단체 쪽지', empty: '받은 단체 쪽지가 없습니다.' },
  ];

  notify.split = function (list, me) {
    const out = { personal: [], group: [] };
    (list || []).forEach(function (n) { out[notify.scopeOf(n, me)].push(n); });
    return out;
  };

  // 처음 열 때 어느 탭을 보여줄까 — 안 읽은 쪽지가 있는 탭(개인 우선).
  notify.defaultTab = function (parts) {
    const p = parts || {};
    if (notify.unreadCount(p.personal) > 0) return 'personal';
    if (notify.unreadCount(p.group) > 0) return 'group';
    return 'personal';
  };

  // 누르면 자동으로 읽힘으로 바뀌는가 — 개인 쪽지만. 단체는 읽음을 전원이 공유하므로 버튼으로만.
  notify.autoReadsOnClick = function (scope) { return scope === 'personal'; };

  // ── 렌더 ────────────────────────────────────────────────────────────
  function esc(s) {
    // chat.js·knowledge.js와 같은 이유 — 폴백이 원문을 그대로 내보내면 XSS가 된다.
    if (root.logic && root.logic.esc) return root.logic.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 한 쪽지: 안 읽음 = 점·굵은 글씨·"새 쪽지" 표시 / 읽음 = 흐린 글씨·"읽음" 글자(누르는 것이 아니다).
  // 눌러야 하는 것은 오직 파란 버튼(이동 · 읽음으로 표시)이다.
  notify.renderList = function (el, list, scope) {
    const rows = notify.rows(list);
    const empty = (notify.TABS.filter(function (t) { return t.key === scope; })[0] || notify.TABS[0]).empty;
    if (!rows.length) {
      el.innerHTML = '<p class="wf-empty">' + esc(empty) + '</p>';
      return;
    }
    el.innerHTML = rows.map(function (r) {
      const auto = notify.autoReadsOnClick(scope);
      const actions = [];
      if (r.dest) {
        actions.push('<button class="nt-go primary" data-id="' + esc(r.id) + '">' + esc(r.dest.label) + ' 열기 →</button>');
      }
      if (!r.read && !r.dest) {
        actions.push('<button class="nt-read" data-id="' + esc(r.id) + '"' +
          (auto ? '' : ' title="이 소속 전체에 읽음으로 표시됩니다"') + '>읽음으로 표시</button>');
      }
      return '<div class="nt-row ' + (r.read ? 'read' : 'unread') + (auto && !r.read ? ' autoread' : '') + '" data-id="' + esc(r.id) + '">' +
        '<div class="nt-head">' +
          (r.read ? '' : '<span class="nt-dot" aria-hidden="true"></span>') +
          '<span class="nt-kind ' + notify.kindClass(r.kind) + '">' + esc(r.kind) + '</span> ' +
          esc(r.from) + ' → ' + esc(r.to) +
          (r.stage ? ' · ' + r.stage + '단계' : '') + ' · ' + esc(notify.formatTime(r.at)) +
          (r.read ? '<span class="nt-state">읽음</span>' : '<span class="nt-new">새 쪽지</span>') +
        '</div><pre>' + esc(r.content) + '</pre>' +
        (actions.length ? '<div class="nt-act">' + actions.join('') + '</div>' : '') + '</div>';
    }).join('');
  };

  // ── 배선 ────────────────────────────────────────────────────────────
  const POLL_MS = 30000;   // 워크플로(2초)와 달리 쪽지는 급하지 않다
  let pollTimer = null;
  let list = [];
  let tab = 'personal';

  function el(id) { return document.getElementById(id); }
  function overlay() { return el('notify-modal'); }

  function me() {
    return { name: root.store.loadProfile().name || '', emp: (root.store.loadSession() || {}).emp || '' };
  }

  function query() {
    const recipients = root.store.myRecipients();
    if (!recipients.length) return null;
    return recipients.map(function (r) { return 'recipient=' + encodeURIComponent(r); }).join('&');
  }

  function fetchList() {
    const qs = query();
    if (!qs) { list = []; paintBadge(); return Promise.resolve(); }
    return fetch('/notifications?' + qs).then(function (r) {
      if (!r.ok) throw new Error('쪽지 조회 실패 (' + r.status + ')');
      return r.json();
    }).then(function (rows) {
      list = rows;
      paintBadge();
      if (overlay() && overlay().style.display === 'block') paintList();
    }).catch(function () { /* 배지는 부가 정보 — 실패해도 화면을 막지 않는다 */ });
  }

  function paintBadge() {
    const badge = el('notify-badge');
    if (!badge) return;
    const n = notify.unreadCount(list);
    badge.textContent = n ? String(n) : '';
  }

  function markRead(id) {
    return fetch('/notifications/' + encodeURIComponent(id) + '/read', { method: 'POST' })
      .then(function (r) {
        if (!r.ok) { alert('읽음 처리 실패 (' + r.status + ')'); return false; }
        return true;
      }).catch(function () { alert('서버 연결 실패 — 처리되지 않았습니다.'); return false; });
  }

  function findRow(id) {
    return notify.rows(list).filter(function (r) { return r.id === id; })[0];
  }

  // 결재 쪽지 → 결재함. 메뉴 권한이 없어 결재함 탭이 숨겨져 있으면 열지 않는다(권한 우회 방지).
  function go(dest) {
    const btn = document.getElementById('tab-btn-' + dest.tab);
    if (!btn || btn.style.display === 'none') {
      alert('이 화면을 열 권한이 없습니다. (' + dest.label + ')');
      return;
    }
    close();
    if (dest.tab === 'approvals' && root.approvals && root.approvals.openTab) root.approvals.openTab(dest.sub);
    btn.click();
  }

  function paintList() {
    const parts = notify.split(list, me());
    el('nt-tabs').innerHTML = notify.TABS.map(function (t) {
      const n = notify.unreadCount(parts[t.key]);
      return '<button type="button" role="tab" class="' + (t.key === tab ? 'on' : '') + '" data-tab="' + t.key + '">' +
        esc(t.label) + (n ? '<span class="ap-badge">' + n + '</span>' : '') + '</button>';
    }).join('');
    el('nt-tabs').querySelectorAll('button').forEach(function (b) {
      b.onclick = function () { tab = b.dataset.tab; paintList(); };
    });
    notify.renderList(el('nt-list'), parts[tab], tab);

    el('nt-list').querySelectorAll('.nt-read').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        markRead(btn.dataset.id).then(function (ok) { if (ok) return fetchList(); });
      };
    });
    el('nt-list').querySelectorAll('.nt-go').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        const row = findRow(btn.dataset.id);
        if (!row) return;
        // 이동하는 것 자체가 "확인했다"는 뜻이다 — 개인 쪽지는 읽음 처리 후 이동한다.
        const scope = notify.scopeOf(list.filter(function (n) { return n.notification_id === row.id; })[0], me());
        const done = (!row.read && notify.autoReadsOnClick(scope)) ? markRead(row.id) : Promise.resolve(true);
        done.then(function () { go(row.dest); fetchList(); });
      };
    });
    // 안 읽은 개인 쪽지는 쪽지를 누르는 것만으로 읽음이 된다.
    el('nt-list').querySelectorAll('.nt-row.autoread').forEach(function (row) {
      row.onclick = function () { markRead(row.dataset.id).then(function (ok) { if (ok) return fetchList(); }); };
    });
  }

  function open() {
    const profile = root.store.loadProfile();
    if (!profile.name && !profile.team) {
      alert('상단에서 이름·소속을 먼저 입력하세요 — 쪽지는 소속과 이름 앞으로 옵니다.');
      return;
    }
    overlay().style.display = 'block';
    el('nt-me').textContent = root.store.myRecipients().join(' · ');
    fetchList().then(function () {
      tab = notify.defaultTab(notify.split(list, me()));
      paintList();
    });
  }

  function close() { overlay().style.display = 'none'; }

  // 다른 화면에서 '문의'로 넘어올 때 딸려오는 맥락(어느 기관·어느 작업 이야기인지).
  // 쪽지에 함께 실어야 받는 쪽이 무슨 건인지 안다.
  let composeLink = {};

  // 디자이너 뷰의 [문의] 버튼이 부른다 — 쪽지 발송 폼을 두 벌 만들지 않기 위해
  // 이 폼을 수신자·맥락을 채운 채로 연다.
  notify.openCompose = function (opts) {
    const o = opts || {};
    composeLink = { institution_id: o.institutionId || null, task_id: o.taskId || null };
    open();
    if (o.recipient) el('nt-to').value = o.recipient;
    el('nt-text').focus();
  };

  function send() {
    const to = (el('nt-to').value || '').trim();
    const content = (el('nt-text').value || '').trim();
    if (!to || !content) { alert('수신자와 내용을 모두 입력하세요.'); return; }
    fetch('/notifications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // 한글 이름은 헤더에 못 실으므로 body의 sender로 보낸다.
      body: JSON.stringify(Object.assign({
        recipient: to, content: content, sender: root.store.loadProfile().name || null,
      }, composeLink)),
    }).then(function (r) {
      if (!r.ok) { alert('발송 실패 (' + r.status + ')'); return; }
      el('nt-text').value = '';
      composeLink = {};        // 다음 쪽지에 엉뚱한 건이 딸려가지 않게 비운다
      alert(to + ' 앞으로 쪽지를 보냈습니다.');
      return fetchList().then(paintList);
    }).catch(function () { alert('서버 연결 실패 — 보내지 않았습니다.'); });
  }

  notify.onProfileChange = function () { fetchList(); };

  notify.start = function () {
    const btn = el('btn-notify');
    if (!btn) return;
    btn.onclick = open;
    el('nt-close').onclick = close;
    el('nt-send').onclick = send;
    fetchList();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(fetchList, POLL_MS);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = notify;
  else root.notify = notify;
})(typeof self !== 'undefined' ? self : this);
