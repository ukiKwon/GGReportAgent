(function (root) {
  'use strict';
  // 쪽지함·결재함 (계획 C2, 스펙 §⑦-⑤). A2에서 연기했던 기능 — notifications 행은
  // 그동안 쌓이기만 하고 읽을 길이 없었다(미읽음 수가 단조 증가하던 원인).
  // 수신자는 사람 이름일 수도 역할일 수도 있어(영업팀·디자이너·인사권자)
  // store.myRecipients()가 소속과 이름을 함께 준다.
  const notify = {};

  const KIND_CLASS = { '결재요청': 'approval', '되물음': 'risk', '이관': 'handoff', '쪽지': 'note' };

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
      };
    });
  };

  notify.unreadCount = function (list) {
    return (list || []).filter(function (n) { return !n.read_at; }).length;
  };

  notify.kindClass = function (kind) { return KIND_CLASS[kind] || 'note'; };

  // ── 렌더 ────────────────────────────────────────────────────────────
  function esc(s) {
    // chat.js·knowledge.js와 같은 이유 — 폴백이 원문을 그대로 내보내면 XSS가 된다.
    if (root.logic && root.logic.esc) return root.logic.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  notify.renderList = function (el, list) {
    const rows = notify.rows(list);
    if (!rows.length) {
      el.innerHTML = '<p class="wf-empty">받은 쪽지가 없습니다.</p>';
      return;
    }
    el.innerHTML = rows.map(function (r) {
      return '<div class="nt-row' + (r.read ? ' read' : '') + '">' +
        '<div class="nt-head">' +
          '<span class="nt-kind ' + notify.kindClass(r.kind) + '">' + esc(r.kind) + '</span> ' +
          esc(r.from) + ' → ' + esc(r.to) +
          (r.stage ? ' · ' + r.stage + '단계' : '') + ' · ' + esc(r.at) +
          (r.read ? '' : '<button class="nt-read" data-id="' + esc(r.id) + '">읽음</button>') +
        '</div><pre>' + esc(r.content) + '</pre></div>';
    }).join('');
  };

  // ── 배선 ────────────────────────────────────────────────────────────
  const POLL_MS = 30000;   // 워크플로(2초)와 달리 쪽지는 급하지 않다
  let pollTimer = null;
  let list = [];

  function el(id) { return document.getElementById(id); }
  function overlay() { return el('notify-modal'); }

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

  function paintList() {
    notify.renderList(el('nt-list'), list);
    el('nt-list').querySelectorAll('.nt-read').forEach(function (btn) {
      btn.onclick = function () {
        fetch('/notifications/' + encodeURIComponent(btn.dataset.id) + '/read', { method: 'POST' })
          .then(function (r) {
            if (!r.ok) { alert('읽음 처리 실패 (' + r.status + ')'); return; }
            return fetchList().then(paintList);
          }).catch(function () { alert('서버 연결 실패 — 처리되지 않았습니다.'); });
      };
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
    fetchList().then(paintList);
  }

  function close() { overlay().style.display = 'none'; }

  function send() {
    const to = (el('nt-to').value || '').trim();
    const content = (el('nt-text').value || '').trim();
    if (!to || !content) { alert('수신자와 내용을 모두 입력하세요.'); return; }
    fetch('/notifications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // 한글 이름은 헤더에 못 실으므로 body의 sender로 보낸다.
      body: JSON.stringify({ recipient: to, content: content, sender: root.store.loadProfile().name || null }),
    }).then(function (r) {
      if (!r.ok) { alert('발송 실패 (' + r.status + ')'); return; }
      el('nt-text').value = '';
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
