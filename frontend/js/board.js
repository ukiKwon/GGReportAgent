(function (root) {
  'use strict';
  // 이사회 자료 화면 — 양식(JSON)을 문서처럼 HTML 표로 보여주고 워드로 내려받는다.
  // 순수 함수(검증·HTML 생성·fetch 래퍼)와 얇은 DOM 배선을 한 파일에 둔다. 엑셀 업로드·출처 대조·
  // 확인 체크·결재는 이번 범위가 아니다.
  const logic = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./logic.js') : root.logic;
  const board = {};

  // 이 화면이 열리는 사이드바 항목 id(nav.js의 준비중 항목 'soon:<라벨>'). 서버 메뉴 키는 쓰지 않는다.
  board.SOON_ID = 'soon:이사회 자료';
  board.FORMS = [{ id: 'default_doc', name: '기본 양식' }];

  const NET_ERROR = '서버에 연결하지 못했습니다.';
  const ALIGNS = { left: 1, center: 1, right: 1 };
  // 천 단위 쉼표·소수·%·괄호·부호·△▲(감소 표기)를 허용하는 숫자 표시값. 엑셀 표시값을 그대로 옮기므로 문자열로만 본다.
  const NUM_RE = /^[\s(△▲+-]*\d[\d,]*(\.\d+)?\s*%?\)?$/;

  function esc(s) {
    if (logic && logic.esc) return logic.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  board.docUrl = function (id) { return '/board-docs/' + encodeURIComponent(id); };
  board.docxUrl = function (id) { return board.docUrl(id) + '/docx'; };

  // 병합 폭: 2 이상 100 이하의 정수만 속성으로 내보낸다(그 밖은 병합 없음).
  function span(v) {
    const n = parseInt(v, 10);
    return n > 1 && n <= 100 ? n : 1;
  }

  board.cellHtml = function (cell) {
    const c = (cell && typeof cell === 'object') ? cell : { text: cell };
    const text = c.text == null ? '' : String(c.text);
    const header = c.header === true;
    const numeric = !header && NUM_RE.test(text);
    const align = ALIGNS[c.align] ? c.align : (numeric ? 'right' : (header ? 'center' : 'left'));
    const cls = ['bd-a-' + align];
    if (numeric) cls.push('bd-num');
    if (c.mapped === true) cls.push('bd-mapped');
    const cs = span(c.colspan);
    const rs = span(c.rowspan);
    const tag = header ? 'th' : 'td';
    return '<' + tag + ' class="' + cls.join(' ') + '"' +
      (cs > 1 ? ' colspan="' + cs + '"' : '') + (rs > 1 ? ' rowspan="' + rs + '"' : '') +
      (c.mapped === true ? ' title="엑셀 값이 들어가는 칸"' : '') + '>' + esc(text) + '</' + tag + '>';
  };

  board.tableHtml = function (t) {
    const tb = t || {};
    const rows = Array.isArray(tb.rows) ? tb.rows : [];
    const cols = Array.isArray(tb.columns) ? tb.columns : [];
    // 머리행이 rows 안에 이미 있으면(header:true) columns로 또 그리지 않는다.
    const firstHasHeader = rows.length && Array.isArray(rows[0]) &&
      rows[0].some(function (c) { return c && c.header === true; });
    const thead = (cols.length && !firstHasHeader)
      ? '<thead><tr>' + cols.map(function (c) { return board.cellHtml({ text: c, header: true }); }).join('') + '</tr></thead>'
      : '';
    const tbody = '<tbody>' + rows.map(function (r) {
      return '<tr>' + (Array.isArray(r) ? r : []).map(board.cellHtml).join('') + '</tr>';
    }).join('') + '</tbody>';
    const notes = Array.isArray(tb.notes) && tb.notes.length
      ? '<ul class="bd-notes">' + tb.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>'
      : '';
    return '<div class="bd-table-wrap"><table class="bd-table">' +
      (tb.title ? '<caption>' + esc(tb.title) + '</caption>' : '') + thead + tbody + '</table></div>' + notes;
  };

  // 오류 문구. 서버가 준 detail이 문자열이면 그대로, 아니면 기본 문구.
  function errText(body, status, base) {
    return (body && typeof body.detail === 'string' && body.detail) || (base + ' (' + status + ')');
  }

  board.validate = function (doc) {
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.tables) || !doc.tables.length) {
      return '양식 내용이 비어 있거나 형식이 맞지 않습니다.';
    }
    return null;
  };

  // 쪽 구분 없이 표를 서버가 준 순서대로 카드 하나씩 나열한다. mapping(A/B/C-2)은 작은 mono 라벨.
  board.docHtml = function (doc) {
    const tables = (doc && Array.isArray(doc.tables)) ? doc.tables : [];
    return '<div class="bd-doc-name">' + esc(doc && doc.name) + '</div>' +
      (tables.length ? tables.map(function (t) {
        const m = t && t.mapping;
        return '<section class="bd-card">' +
          (m ? '<div class="bd-card-head"><span class="bd-map">' + esc(m) + '</span></div>' : '') +
          board.tableHtml(t) + '</section>';
      }).join('') : '<p class="wf-empty">표가 없습니다.</p>');
  };

  board.optionsHtml = function (forms, selectedId) {
    return '<option value="">양식 선택</option>' + (forms || []).map(function (f) {
      return '<option value="' + esc(f.id) + '"' + (f.id === selectedId ? ' selected' : '') + '>' + esc(f.name) + '</option>';
    }).join('');
  };

  // state: {status:'idle'|'loading'|'error'|'ready', error?, doc?}
  board.stateHtml = function (state) {
    const s = state || { status: 'idle' };
    if (s.status === 'loading') return '<p class="wf-empty">양식을 불러오는 중…</p>';
    if (s.status === 'error') return '<p class="wf-empty bd-err" role="alert">' + esc(s.error) + '</p>';
    if (s.status === 'ready') return board.docHtml(s.doc);
    return '<p class="wf-empty">양식을 선택하면 문서가 표시됩니다.</p>';
  };

  board.docxFileName = function (doc, id) {
    const base = String((doc && doc.name) || id || 'board').replace(/[\\/:*?"<>|]/g, '_').trim() || 'board';
    return base + '.docx';
  };

  // fetchFn(url) → Promise<Response>. 실패는 reject하지 않고 {ok:false,error}로 돌려준다.
  board.load = function (fetchFn, id) {
    return fetchFn(board.docUrl(id)).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) {
        if (!r.ok) return { ok: false, error: errText(body, r.status, '양식을 불러오지 못했습니다') };
        const bad = board.validate(body);
        return bad ? { ok: false, error: bad } : { ok: true, doc: body };
      });
    }).catch(function () { return { ok: false, error: NET_ERROR }; });
  };

  board.fetchDocx = function (fetchFn, id) {
    return fetchFn(board.docxUrl(id)).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return null; }).then(function (body) {
          return { ok: false, error: errText(body, r.status, '워드 파일을 만들지 못했습니다') };
        });
      }
      return r.blob().then(function (blob) { return { ok: true, blob: blob }; });
    }).catch(function () { return { ok: false, error: NET_ERROR }; });
  };

  // ── 배선(DOM) ─────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }
  let token = 0;       // 늦게 도착한 응답이 새 선택을 덮지 않게 한다
  let current = null;  // 지금 보이는 양식 {id, doc}

  function show(state) {
    el('bd-body').innerHTML = board.stateHtml(state);
    el('bd-docx').disabled = state.status !== 'ready';
  }
  function say(text) { el('bd-msg').textContent = text || ''; }

  function onSelect() {
    const id = el('bd-form').value;
    const t = ++token;
    current = null;
    say('');
    if (!id) { show({ status: 'idle' }); return; }
    show({ status: 'loading' });
    board.load(function (u) { return fetch(u); }, id).then(function (res) {
      if (t !== token) return;
      if (res.ok) { current = { id: id, doc: res.doc }; show({ status: 'ready', doc: res.doc }); }
      else show({ status: 'error', error: res.error });
    });
  }

  function onDocx() {
    if (!current) return;
    const cur = current;
    el('bd-docx').disabled = true;
    say('워드 파일을 만드는 중…');
    board.fetchDocx(function (u) { return fetch(u); }, cur.id).then(function (res) {
      el('bd-docx').disabled = false;
      if (!res.ok) { say(res.error); return; }
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = board.docxFileName(cur.doc, cur.id);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      say('');
    });
  }

  board.mount = function () {
    if (el('bd-form')) return;   // 선택값을 날리지 않게 처음 한 번만 그린다
    el('bd-controls').innerHTML =
      '<label>양식 <select id="bd-form">' + board.optionsHtml(board.FORMS, '') + '</select></label>' +
      '<button id="bd-docx" disabled>워드 내려받기</button>' +
      '<span id="bd-msg" role="status"></span>';
    el('bd-form').onchange = onSelect;
    el('bd-docx').onclick = onDocx;
    show({ status: 'idle' });
  };
  board.unmount = function () { /* 폴링·스트림 없음 */ };

  if (typeof module !== 'undefined' && module.exports) module.exports = board;
  else root.board = board;
})(typeof self !== 'undefined' ? self : this);
