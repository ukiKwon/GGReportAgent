(function (root) {
  'use strict';
  // 에이전트 대화창 (계획 C2, 스펙 §⑦-②). 기관 단위 상시 채팅 —
  // 참여검토 3관점(영업/전산/예산) 답변이 스트리밍으로 들어온다.
  // 서버 모드 전용. 순수 모델과 DOM 렌더를 나누고 순수부만 node --test로 고정한다.
  const chat = {};

  const AGENT_LABEL = '참여검토 agent';
  // 서버가 LLM 실패를 이 표식으로 시작하는 한 문단을 보낸다(backend/agent_adapter.failure_notice).
  // 답변처럼 생겼지만 답변이 아니므로 눈에 띄게 구분한다.
  const FAILURE_MARK = '[답변 실패]';
  chat.FAILURE_MARK = FAILURE_MARK;

  // workflow.roleLabel을 재사용하지 않는다 — 대화는 role이 user/agent 2종뿐이라
  // 파일 간 의존을 만들 이유가 없다.
  chat.rows = function (messages, profile) {
    const me = (profile && profile.name) || '';
    return (messages || []).map(function (m) {
      const isAgent = m.role === 'agent';
      return {
        role: m.role,
        content: m.content,
        at: m.created_at,
        author: m.author || null,
        label: isAgent ? AGENT_LABEL : (m.author || '담당자'),
        // 에이전트 답변은 author가 없으니 절대 내 것이 되지 않는다.
        mine: !isAgent && !!me && m.author === me,
        failed: isAgent && String(m.content || '').indexOf(FAILURE_MARK) >= 0,
      };
    });
  };

  chat.canSend = function (state) {
    if (!state) return false;
    return !!state.institutionId && !state.sending && !!String(state.text || '').trim();
  };

  // ── 렌더 ────────────────────────────────────────────────────────────
  function esc(s) {
    return (root.logic && root.logic.esc) ? root.logic.esc(s) : String(s == null ? '' : s);
  }

  chat.renderLog = function (el, messages, profile) {
    const rows = chat.rows(messages, profile);
    if (!rows.length) {
      el.innerHTML = '<p class="wf-empty">아직 대화가 없습니다 — 참여 여부를 물어보세요.</p>';
      return;
    }
    el.innerHTML = rows.map(function (r) {
      return '<div class="ch-row ' + r.role + (r.mine ? ' mine' : '') +
        (r.failed ? ' failed' : '') + '">' +
        '<div class="ch-who">' + esc(r.label) + ' · ' + esc(r.at) + '</div>' +
        '<pre>' + esc(r.content) + '</pre></div>';
    }).join('');
  };

  // ── 배선 ────────────────────────────────────────────────────────────
  let selectedId = null;
  let messages = [];
  let sending = false;
  let aborter = null;

  function el(id) { return document.getElementById(id); }

  function getJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' → ' + r.status);
      return r.json();
    });
  }

  function repaint() {
    chat.renderLog(el('ch-log'), messages, root.store.loadProfile());
    const log = el('ch-log');
    log.scrollTop = log.scrollHeight;              // 새 말풍선이 항상 보이게
    syncControls();
  }

  function syncControls() {
    const send = el('ch-send'), stop = el('ch-stop'), input = el('ch-input'), sel = el('ch-inst');
    if (!send) return;
    send.disabled = !chat.canSend({ institutionId: selectedId, text: input.value, sending: sending });
    stop.style.display = sending ? '' : 'none';
    input.disabled = !selectedId;
    sel.disabled = sending;                        // 전송 중 기관 변경 잠금
  }

  function loadHistory() {
    if (!selectedId) { messages = []; repaint(); return Promise.resolve(); }
    const id = selectedId;
    return getJson('/institutions/' + encodeURIComponent(id) + '/chat').then(function (list) {
      if (selectedId !== id) return;
      messages = list;
      repaint();
    }).catch(function (e) {
      el('ch-log').innerHTML = '<p class="wf-empty">대화를 불러오지 못했습니다 — ' + esc(e.message) + '</p>';
    });
  }

  function send() {
    const input = el('ch-input');
    const text = input.value.trim();
    if (!chat.canSend({ institutionId: selectedId, text: text, sending: sending })) return;

    const profile = root.store.loadProfile();
    const id = selectedId;
    // 낙관적 표시: 내 말풍선과 빈 답변 자리를 먼저 그린다. 실패하면 되돌린다.
    messages = messages.concat([
      { role: 'user', content: text, created_at: '방금', author: profile.name || null },
      { role: 'agent', content: '…', created_at: '응답 중', author: null },
    ]);
    const replyIndex = messages.length - 1;
    input.value = '';
    sending = true;
    aborter = new AbortController();
    repaint();

    fetch('/institutions/' + encodeURIComponent(id) + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 한글 이름은 헤더에 못 실으므로 body로 보낸다(X-User-Id는 ASCII만).
      body: JSON.stringify({ content: text, author: profile.name || null }),
      signal: aborter.signal,
    }).then(function (r) {
      if (!r.ok) throw new Error('전송 실패 (' + r.status + ')');
      // SSE가 아니라 평문 스트림이다. stream:true가 없으면 청크 경계에서 한글이 깨진다.
      const reader = r.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let acc = '';
      function pump() {
        return reader.read().then(function (res) {
          if (res.done) {
            // LLM 엔드포인트가 죽어 있으면 200인데 본문이 0바이트로 끝난다.
            // 빈 말풍선만 남기면 왜 답이 없는지 알 수 없다.
            if (!acc && selectedId === id) {
              messages[replyIndex].content =
                '(응답을 받지 못했습니다 — LLM 엔드포인트가 켜져 있는지 확인하세요)';
              repaint();
            }
            return;
          }
          acc += decoder.decode(res.value, { stream: true });
          if (selectedId === id) { messages[replyIndex].content = acc; repaint(); }
          return pump();
        });
      }
      return pump();
    }).catch(function (e) {
      if (e.name === 'AbortError') {
        messages[replyIndex].content += '\n\n…(응답이 중단되었습니다)';
      } else {
        alert(e.message || '서버 연결 실패 — 전송되지 않았습니다.');
        messages = messages.slice(0, replyIndex - 1);   // 낙관적 두 줄을 되돌린다
        input.value = text;                             // 입력 복구
      }
    }).then(function () {
      sending = false; aborter = null;
      repaint();
      if (selectedId === id) loadHistory();              // 서버가 저장한 실제 시각으로 교체
    });
  }

  function renderControls() {
    const rows = (root.store && root.store.loadData() || []).filter(function (r) { return r.institutionId; });
    el('ch-controls').innerHTML =
      '<select id="ch-inst"><option value="">기관 선택…</option>' +
      rows.map(function (r) {
        return '<option value="' + esc(r.institutionId) + '">' + esc(r.name) + '</option>';
      }).join('') + '</select>';

    el('ch-inst').onchange = function () {
      selectedId = this.value || null;
      messages = [];
      loadHistory();
    };
    el('ch-send').onclick = send;
    el('ch-stop').onclick = function () { if (aborter) aborter.abort(); };
    el('ch-input').oninput = syncControls;
    el('ch-input').onkeydown = function (e) {
      // Enter 전송 / Shift+Enter 줄바꿈
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    };
  }

  chat.mount = function () {
    renderControls();
    const sel = el('ch-inst');
    if (selectedId && sel) sel.value = selectedId;
    loadHistory();
  };

  chat.unmount = function () { if (aborter) aborter.abort(); };

  if (typeof module !== 'undefined' && module.exports) module.exports = chat;
  else root.chat = chat;
})(typeof self !== 'undefined' ? self : this);
