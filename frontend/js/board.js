(function (root) {
  'use strict';
  // 이사회 자료 화면 — 양식(JSON)을 문서처럼 HTML 표로 보여주고 워드로 내려받는다.
  // 1단계 양식 커스텀: 같은 화면에서 '보기 / 양식 편집' 모드를 전환한다.
  // 순수 함수(검증·HTML 생성·편집 상태 모델·fetch 래퍼)와 얇은 DOM 배선을 한 파일에 둔다.
  // 엑셀 업로드·출처 대조·확인 체크·결재·이전 버전 되돌리기는 이번 범위가 아니다.
  const logic = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./logic.js') : root.logic;
  const board = {};
  const bw = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./board-write.js') : root.boardWrite;

  // 이 화면이 열리는 사이드바 항목 id(nav.js의 준비중 항목 'soon:<라벨>'). 서버 메뉴 키는 쓰지 않는다.
  board.SOON_ID = 'soon:이사회 자료';
  // 서버 목록(GET /board-forms)을 못 받았을 때의 대체 목록. 평소에는 서버 목록을 쓴다.
  board.FORMS = [{ id: 'default_doc', name: '기본 양식' }];

  const NET_ERROR = '서버에 연결하지 못했습니다.';
  // 목록 응답의 모양이 맞지 않을 때(사용자가 고칠 수 없는 오류라 다음 행동만 안내한다).
  const LIST_ERROR = '목록을 불러오지 못했습니다. 잠시 후 다시 열어 주세요. 계속되면 담당자에게 알려 주세요.';
  board.LIST_ERROR = LIST_ERROR;
  const ALIGNS = { left: 1, center: 1, right: 1 };
  // 천 단위 쉼표·소수·%·괄호·부호·△▲(감소 표기)를 허용하는 숫자 표시값. 엑셀 표시값을 그대로 옮기므로 문자열로만 본다.
  // 끝의 '년'(3.2년)과 괄호 병기("5.00 (1.00)", "5.00 (-1.00)")도 숫자로 본다.
  const NUM_RE = /^[\s(△▲+-]*\d[\d,]*(\.\d+)?\s*(%|년)?\)?(\s+\(-?\d[\d,]*(\.\d+)?\))?$/;
  // 서버(BoardDocSpec.clean)와 같은 규칙: 줄바꿈·탭 포함 제어문자, U+2028/2029, U+FFFE/FFFF는 거부한다.
  // 짝 없는 서로게이트는 서버가 거부하므로 여기서 보지 않는다(저장 오류 문구로 보인다).
  const CTRL_RE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f' + String.fromCharCode(0x2028, 0x2029, 0xfffe, 0xffff) + ']');
  const MAX_NAME = 60, MAX_TITLE = 100, MAX_CELL = 100;

  function str(v) { return v == null ? '' : String(v); }
  function esc(s) {
    if (logic && logic.esc) return logic.esc(str(s));
    return str(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  board.docUrl = function (id) { return '/board-docs/' + encodeURIComponent(id); };
  board.docxUrl = function (id) { return board.docUrl(id) + '/docx'; };
  board.formsUrl = function () { return '/board-forms'; };
  board.catalogUrl = function () { return '/board-forms/catalog'; };
  board.formUrl = function (id, version) {
    return '/board-forms/' + encodeURIComponent(id) +
      (version != null && version !== '' ? '?version=' + encodeURIComponent(version) : '');
  };
  board.formDocxUrl = function (id) { return '/board-forms/' + encodeURIComponent(id) + '/docx'; };
  // 복제는 원본을 본문으로 고른다(서버: POST /board-forms/copy). 경로에 id를 넣지 않는다.
  board.copyUrl = function () { return '/board-forms/copy'; };
  board.BASE_ID = 'default_doc';
  board.isBase = function (id) { return str(id) === board.BASE_ID; };

  // 병합 폭: 2 이상 100 이하의 정수만 속성으로 내보낸다(그 밖은 병합 없음).
  function span(v) {
    const n = parseInt(v, 10);
    return n > 1 && n <= 100 ? n : 1;
  }

  function cellParts(cell) {
    const c = (cell && typeof cell === 'object') ? cell : { text: cell };
    const text = c.text == null ? '' : String(c.text);
    const header = c.header === true;
    const numeric = !header && NUM_RE.test(text);
    const align = ALIGNS[c.align] ? c.align : (numeric ? 'right' : (header ? 'center' : 'left'));
    const cls = ['bd-a-' + align];
    if (numeric) cls.push('bd-num');
    if (c.mapped === true) cls.push('bd-mapped');
    return { tag: header ? 'th' : 'td', cls: cls, cs: span(c.colspan), rs: span(c.rowspan),
             text: text, mapped: c.mapped === true, key: c.key };
  }
  function openTag(p, extra) {
    return '<' + p.tag + ' class="' + p.cls.join(' ') + '"' +
      (p.cs > 1 ? ' colspan="' + p.cs + '"' : '') + (p.rs > 1 ? ' rowspan="' + p.rs + '"' : '') +
      (extra || '') + '>';
  }

  // scope: th 의 범위(고정 낱말만). 없으면 열 머리(병합이면 colgroup). map 이 넘기는 인덱스(숫자)는 무시한다.
  const SCOPES = { col: 1, colgroup: 1, row: 1, rowgroup: 1 };
  board.cellHtml = function (cell, scope) {
    const p = cellParts(cell);
    let extra = p.mapped ? ' title="엑셀 값이 들어가는 칸"' : '';
    if (p.tag === 'th') {
      const sc = (typeof scope === 'string' && SCOPES[scope] === 1) ? scope : (p.cs > 1 ? 'colgroup' : 'col');
      extra = ' scope="' + sc + '"' + extra;
    }
    return openTag(p, extra) + esc(p.text) + '</' + p.tag + '>';
  };

  function headerInRows(rows) {
    return !!(rows.length && Array.isArray(rows[0]) &&
      rows[0].some(function (c) { return c && c.header === true; }));
  }
  function theadHtml(cols, rows) {
    // 머리행이 rows 안에 이미 있으면(header:true) columns로 또 그리지 않는다.
    return (cols.length && !headerInRows(rows))
      ? '<thead><tr>' + cols.map(function (c) { return board.cellHtml({ text: c, header: true }); }).join('') + '</tr></thead>'
      : '';
  }
  function notesHtml(notes) {
    return Array.isArray(notes) && notes.length
      ? '<ul class="bd-notes">' + notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>'
      : '';
  }

  // 표 단위 문구(순수). 서버는 "(단위: 억원)"을 통째로 보낸다 — 괄호로 시작하면 그대로,
  // '억원'처럼 맨 값이나 '단위: 억원'이 오면 '(단위: 억원)'으로 보정한다. 비면 ''.
  board.unitText = function (u) {
    const s = typeof u === 'string' ? u.trim() : '';
    if (s === '') return '';
    if (/^[(（]/.test(s)) return s;
    if (/^단위\s*[:：]/.test(s)) return '(' + s + ')';
    return '(단위: ' + s + ')';
  };

  board.tableHtml = function (t) {
    const tb = t || {};
    const rows = Array.isArray(tb.rows) ? tb.rows : [];
    const cols = Array.isArray(tb.columns) ? tb.columns : [];
    const tbody = '<tbody>' + rows.map(function (r) {
      const cells = Array.isArray(r) ? r : [];
      const hasData = cells.some(function (c) { return !(c && typeof c === 'object' && c.header === true); });
      return '<tr>' + cells.map(function (c, ci) {
        // 데이터 칸이 있는 행의 첫 머리 칸은 행 머리(scope=row)
        const rowHead = ci === 0 && hasData && c && typeof c === 'object' && c.header === true;
        return board.cellHtml(c, rowHead ? (span(c.rowspan) > 1 ? 'rowgroup' : 'row') : undefined);
      }).join('') + '</tr>';
    }).join('') + '</tbody>';
    const unit = board.unitText(tb.unit);   // 읽기 전용, 비어 있을 수 있다
    const cap = (tb.title || unit)
      ? '<caption>' + esc(tb.title) + (unit ? '<span class="bd-unit">' + esc(unit) + '</span>' : '') + '</caption>' : '';
    return '<div class="bd-table-wrap"><table class="bd-table">' +
      cap + theadHtml(cols, rows) + tbody + '</table></div>' +
      notesHtml(tb.notes);
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
  board.docHtml = function (doc, version) {
    const tables = (doc && Array.isArray(doc.tables)) ? doc.tables : [];
    return '<div class="bd-doc-name">' + esc(doc && doc.name) +
      (version != null && version !== '' ? '<span class="bd-ver">v' + esc(version) + '</span>' : '') + '</div>' +
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

  // 서버 목록(GET /board-forms)의 items로 만드는 옵션. form_id는 숫자일 수 있어 문자열로 비교한다.
  board.formOptionsHtml = function (items, selectedId) {
    const sel = str(selectedId);
    return '<option value="">양식 선택</option>' + (items || []).map(function (f) {
      const id = str(f.form_id);
      // 기본 양식은 이름이 이미 '기본 양식'이라 접미사를 붙이지 않는다('기본 양식 (기본)' 중복 방지).
      const label = str(f.name) + (f.is_default === true ? '' : (f.current_version != null ? ' · v' + f.current_version : ''));
      return '<option value="' + esc(id) + '"' + (id === sel && sel !== '' ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  };

  // state: {status:'idle'|'loading'|'error'|'ready', error?, doc?, version?}
  board.stateHtml = function (state) {
    const s = state || { status: 'idle' };
    if (s.status === 'loading') return '<p class="wf-empty">양식을 불러오는 중…</p>';
    if (s.status === 'error') return '<p class="wf-empty bd-err" role="alert">' + esc(s.error) + '</p>';
    if (s.status === 'ready') return board.docHtml(s.doc, s.version);
    return '<p class="wf-empty">양식을 선택하면 문서가 표시됩니다.</p>';
  };

  board.docxFileName = function (doc, id) {
    const base = String((doc && doc.name) || id || 'board').replace(/[\\/:*?"<>|]/g, '_').trim() || 'board';
    return base + '.docx';
  };

  // ── 서버 호출(순수: fetchFn 주입). 실패는 reject하지 않고 {ok:false,error}로 돌려준다 ──
  // fetchFn(url) → Promise<Response>. 기존 /board-docs 경로(테스트 호환용으로 유지).
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

  board.fetchFormDocx = function (fetchFn, id) {
    return fetchFn(board.formDocxUrl(id)).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return null; }).then(function (body) {
          return { ok: false, error: errText(body, r.status, '워드 파일을 만들지 못했습니다') };
        });
      }
      return r.blob().then(function (blob) { return { ok: true, blob: blob }; });
    }).catch(function () { return { ok: false, error: NET_ERROR }; });
  };

  // 워드: 기본 양식은 /board-docs, 서버 양식은 /board-forms(같은 워드 파일).
  board.fetchAnyDocx = function (fetchFn, id) {
    return board.isBase(id) ? board.fetchDocx(fetchFn, id) : board.fetchFormDocx(fetchFn, id);
  };
  // JSON 요청 공통: → {ok, status, body} (네트워크 실패는 status 0)
  function req(fetchFn, url, init) {
    return fetchFn(url, init).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) {
        return { ok: r.ok, status: r.status, body: body };
      });
    }).catch(function () { return { ok: false, status: 0, body: null, net: true }; });
  }
  function fail(x, base) {
    return { ok: false, status: x.status, conflict: x.status === 409,
             error: x.net ? NET_ERROR : errText(x.body, x.status, base) };
  }

  board.loadForms = function (fetchFn) {
    return req(fetchFn, board.formsUrl()).then(function (x) {
      if (!x.ok) return fail(x, '양식 목록을 불러오지 못했습니다');
      if (!x.body || !Array.isArray(x.body.items)) return { ok: false, error: LIST_ERROR };
      return { ok: true, items: x.body.items, canEdit: x.body.can_edit === true };
    });
  };

  board.loadCatalog = function (fetchFn) {
    return req(fetchFn, board.catalogUrl()).then(function (x) {
      if (!x.ok) return fail(x, '추가할 수 있는 표 목록을 불러오지 못했습니다');
      if (!x.body || !Array.isArray(x.body.items)) return { ok: false, error: LIST_ERROR };
      const out = { ok: true, items: x.body.items };
      // 서버가 준 크기 한도(행·열·칸 수). 없으면 키를 만들지 않는다(board.limitsOf가 기본값을 쓴다).
      if (x.body.limits && typeof x.body.limits === 'object') out.limits = x.body.limits;
      return out;
    });
  };

  board.loadForm = function (fetchFn, id, version) {
    return req(fetchFn, board.formUrl(id, version)).then(function (x) {
      if (!x.ok) return fail(x, '양식을 불러오지 못했습니다');
      const bad = board.validate(x.body);
      return bad ? { ok: false, error: bad } : { ok: true, form: x.body };
    });
  };

  // 화면에 띄울 양식. 기본 양식은 코드 원본(/board-docs), 서버 양식은 /board-forms/{id}.
  board.loadView = function (fetchFn, id, version) {
    if (!board.isBase(id)) return board.loadForm(fetchFn, id, version);
    return req(fetchFn, board.docUrl(board.BASE_ID)).then(function (x) {
      if (!x.ok) return fail(x, '양식을 불러오지 못했습니다');
      const bad = board.validate(x.body);
      return bad ? { ok: false, error: bad }
        : { ok: true, form: { form_id: board.BASE_ID, name: str(x.body.name), editable: false, tables: x.body.tables } };
    });
  };

  // 원본: 기본 양식이면 source="default_doc", 서버 양식이면 source_form_id(숫자).
  board.copyBody = function (id, name) {
    const b = { name: str(name).trim() };
    if (board.isBase(id)) b.source = board.BASE_ID;
    else b.source_form_id = Number(id);
    return b;
  };
  board.copyForm = function (fetchFn, id, name) {
    if (!board.isBase(id) && !/^\d+$/.test(str(id))) {
      return Promise.resolve({ ok: false, error: '복제할 양식을 찾지 못했습니다.' });
    }
    return req(fetchFn, board.copyUrl(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(board.copyBody(id, name))
    }).then(function (x) {
      if (!x.ok) return fail(x, '양식을 복제하지 못했습니다');
      const fid = x.body && x.body.form_id;
      if (fid == null || fid === '') return { ok: false, error: '복제 결과를 확인하지 못했습니다.' };
      return { ok: true, formId: fid };
    });
  };

  // 저장(PUT). 성공 시 {ok:true, version, changed[, droppedMapped]}. 409는 conflict:true.
  // 엑셀 연결 칸이 사라지는 저장은 서버가 400 UNMAP_CONFIRM_REQUIRED로 막는다 → {ok:false, unmap:{count,dropped,message}}.
  // 사용자가 확인한 뒤에만 opts.confirmUnmapped:true로 다시 보낸다(첫 요청에는 보내지 않는다).
  board.saveForm = function (fetchFn, st, opts) {
    return req(fetchFn, board.formUrl(st.formId), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(board.putBody(st, opts))
    }).then(function (x) {
      if (!x.ok) {
        const d = x.body && x.body.detail;
        if (x.status === 400 && d && typeof d === 'object' && d.code === 'UNMAP_CONFIRM_REQUIRED') {
          return { ok: false, status: 400, conflict: false,
                   unmap: { count: Number(d.count) || 0, dropped: Array.isArray(d.dropped) ? d.dropped : [], message: str(d.message) },
                   error: str(d.message) || '엑셀 값이 들어가는 칸이 빠지는 저장입니다.' };
        }
        return fail(x, '저장하지 못했습니다');
      }
      const b = x.body;
      const v = typeof b === 'number' ? b : (b && b.version);
      // 서버는 내용이 같으면 버전을 올리지 않고 changed:false를 준다(BoardFormService.update).
      const changed = !(b && typeof b === 'object' && b.changed === false);
      const out = { ok: true, version: v == null ? null : v, changed: changed };
      if (b && typeof b === 'object' && typeof b.dropped_mapped === 'number') out.droppedMapped = b.dropped_mapped;
      return out;
    });
  };

  // ── 편집 상태 모델(순수·불변) ────────────────────────────────
  function lockedIn(rows) {
    let n = 0;
    rows.forEach(function (r) {
      (Array.isArray(r) ? r : []).forEach(function (c) { if (c && c.mapped === true) n++; });
    });
    return n;
  }

  // GET /board-forms/{id} 응답 → 편집 상태
  // 머리글(th) 칸도 key가 있으면 편집할 수 있게 둔다(사용자 결정 2026-11-02): 서버도 cells 키로
  // 받아 주고, 열 이름 정정도 양식 커스텀의 일부다. 막는 것은 매핑 칸(mapped)뿐이다.
  board.editFromForm = function (form) {
    const doc = form || {};
    const tables = (Array.isArray(doc.tables) ? doc.tables : []).map(function (t, i) {
      const rows = Array.isArray(t.rows) ? t.rows : [];
      const cells = {};
      rows.forEach(function (r) {
        (Array.isArray(r) ? r : []).forEach(function (c) {
          if (c && c.key != null && c.key !== '' && c.mapped !== true) cells[String(c.key)] = str(c.text);
        });
      });
      // 행·열 id(서버 row_ids/col_ids). 둘 다 와서 격자와 길이가 맞을 때만 행·열 편집(structOk)을 켠다 —
      // id를 모르는 채 구조를 보내면 서버가 모든 행을 새 행으로 보기 때문이다.
      const w = gridWidth(gridOf(rows));
      const structOk = rows.length > 0 && Array.isArray(t.row_ids) && Array.isArray(t.col_ids) &&
        t.row_ids.length === rows.length && t.col_ids.length === w;
      const rowIds = structOk ? t.row_ids.slice() : rows.map(function () { return null; });
      const colIds = structOk ? t.col_ids.slice() : [];
      return {
        ref: t.ref != null ? t.ref : t.id, mapping: t.mapping || '', title: str(t.title), origTitle: str(t.title),
        notes: Array.isArray(t.notes) ? t.notes.slice() : [], columns: Array.isArray(t.columns) ? t.columns : [],
        rows: rows, cells: cells, origCells: Object.assign({}, cells), locked: lockedIn(rows),
        isNew: false, origRank: i,
        structOk: structOk, rowIds: rowIds, colIds: colIds, seq: 0, origStruct: structSig(rows, rowIds, colIds)
      };
    });
    return { formId: form.form_id != null ? form.form_id : doc.id, name: str(form.name || doc.name),
             origName: str(form.name || doc.name), version: form.version, origCount: tables.length, tables: tables,
             limits: (form.limits && typeof form.limits === 'object') ? form.limits : null };
  };

  function withTables(st, tables) { return Object.assign({}, st, { tables: tables }); }
  function withTable(st, i, patch) {
    if (!(i >= 0 && i < st.tables.length)) return st;
    const tables = st.tables.slice();
    tables[i] = Object.assign({}, tables[i], patch);
    return withTables(st, tables);
  }

  board.editSetName = function (st, name) { return Object.assign({}, st, { name: str(name) }); };
  board.editSetTitle = function (st, i, title) { return withTable(st, i, { title: str(title) }); };
  // 서버가 준 키가 없는 칸(매핑 칸 포함)은 바꾸지 않는다.
  board.editSetCell = function (st, i, key, text) {
    const t = st.tables[i];
    if (!t || !has(t.cells, key)) return st;
    const cells = Object.assign({}, t.cells);
    cells[key] = str(text);
    return withTable(st, i, { cells: cells });
  };
  // dir: -1(위) / +1(아래). 범위를 벗어나면 같은 상태를 돌려준다.
  board.editMove = function (st, i, dir) {
    const j = i + dir;
    if (!(i >= 0 && i < st.tables.length) || j < 0 || j >= st.tables.length) return st;
    const tables = st.tables.slice();
    const tmp = tables[i]; tables[i] = tables[j]; tables[j] = tmp;
    return withTables(st, tables);
  };
  // 마지막 1개는 뺄 수 없다.
  board.editRemove = function (st, i) {
    if (st.tables.length <= 1 || !(i >= 0 && i < st.tables.length)) return st;
    return withTables(st, st.tables.filter(function (_, k) { return k !== i; }));
  };
  // 카탈로그 항목을 맨 아래에 붙인다. 같은 표(ref)가 이미 있으면 같은 상태를 돌려준다.
  board.editAdd = function (st, item) {
    if (!item || item.ref == null || item.ref === '') return st;
    if (st.tables.some(function (t) { return str(t.ref) === str(item.ref); })) return st;
    const tables = st.tables.slice();
    tables.push({
      ref: item.ref, mapping: str(item.mapping), title: str(item.title || item.ref),
      origTitle: '', notes: Array.isArray(item.notes) ? item.notes.slice() : [], columns: [], rows: [],
      cells: {}, origCells: {}, locked: 0,
      isNew: true, origRank: -1,
      structOk: false, rowIds: [], colIds: [], seq: 0, origStruct: structSig([], [], [])
    });
    return withTables(st, tables);
  };

  // ── 행·열 편집(순수·불변) ─────────────────────────────────────
  // 표의 rows(칸 객체의 배열의 배열, 병합은 앵커 칸의 colspan/rowspan)와 rowIds(행 id, 새 행은 null)·
  // colIds(격자 열 id, 새 열은 null)를 함께 바꾼다. 새 칸은 {fresh:true}이고 글자는 t.cells[key]에 둔다.
  const DEFAULT_LIMITS = { max_rows: 40, max_cols: 12, max_cell_chars: 100, max_form_cells: 800, max_table_cells: 300 };
  const RC_MAX_UNDO = 50;
  // 서버 한도(카탈로그 limits). 없는 값은 기본값(표당 행 40·열 12·칸 300, 양식 칸 800).
  board.limitsOf = function (st) {
    const l = (st && st.limits && typeof st.limits === 'object') ? st.limits : {};
    const out = {};
    Object.keys(DEFAULT_LIMITS).forEach(function (k) { out[k] = l[k] > 0 ? Number(l[k]) : DEFAULT_LIMITS[k]; });
    return out;
  };

  function gridWidth(g) {
    let w = 0;
    g.forEach(function (line) { if (line.length > w) w = line.length; });
    return w;
  }
  board.gridWidth = function (rows) { return gridWidth(gridOf(Array.isArray(rows) ? rows : [])); };
  // 칸마다 {r, ci, start, cs, rs}: 행 r의 ci번째 칸이 시작하는 격자 열과 (격자 안으로 자른) 가로·세로 병합 폭.
  function anchorsOf(rows, g) {
    const out = [];
    rows.forEach(function (row, r) {
      const line = g[r] || [];
      (Array.isArray(row) ? row : []).forEach(function (c, ci) {
        let st = -1;
        for (let k = 0; k < line.length; k++) { const e = line[k]; if (e && e.r === r && e.ci === ci) { st = k; break; } }
        const o = (c && typeof c === 'object') ? c : {};
        out.push({ r: r, ci: ci, start: st, cs: span(o.colspan), rs: Math.min(span(o.rowspan), rows.length - r) });
      });
    });
    return out;
  }
  // 구성(행·열 id와 칸 배치·병합) 서명. 같으면 구성이 바뀌지 않은 것이다.
  function structSig(rows, rowIds, colIds) {
    return JSON.stringify([rowIds, colIds, rows.map(function (r) {
      return (Array.isArray(r) ? r : []).map(function (c) {
        const o = (c && typeof c === 'object') ? c : {};
        return [o.key == null ? null : o.key, span(o.colspan), span(o.rowspan)];
      });
    })]);
  }
  // 엑셀 값이 들어가는 칸(연결 칸·값 칸). 그 밖은 이름(머리·구분) 칸이다.
  function isValueCell(c) { return !!c && typeof c === 'object' && (c.input === true || c.mapped === true); }
  function cloneRows(rows) {
    return rows.map(function (r) {
      return (Array.isArray(r) ? r : []).map(function (c) {
        return (c && typeof c === 'object') ? Object.assign({}, c) : { text: c == null ? '' : String(c) };
      });
    });
  }
  function setSpan(cell, name, n) { if (n > 1) cell[name] = n; else delete cell[name]; }
  function countCells(t) {
    let n = 0;
    ((t && t.rows) || []).forEach(function (r) { n += Array.isArray(r) ? r.length : 0; });
    return n;
  }
  function newKeyGen(t) {
    const used = {};
    (t.rows || []).forEach(function (r) {
      (Array.isArray(r) ? r : []).forEach(function (c) { if (c && c.key != null) used[String(c.key)] = true; });
    });
    Object.keys(t.cells || {}).forEach(function (k) { used[k] = true; });
    let n = t.seq || 0;
    const gen = function () { let k; do { n++; k = 'new' + n; } while (used[k]); used[k] = true; return k; };
    gen.seq = function () { return n; };
    return gen;
  }
  // 새 칸: 이웃(눌린 행·열의 칸)이 값 칸이면 빈 값 칸(input), 아니면 이웃을 따라 머리 여부를 정한 빈 이름 칸.
  function freshCell(nbr, key) {
    const value = !nbr || isValueCell(nbr);
    const c = { key: key, text: '', header: !value && nbr.header === true, input: value, mapped: false, fresh: true };
    if (nbr && ALIGNS[nbr.align]) c.align = nbr.align;
    return c;
  }
  // 각 격자 열이 값 열인지 이름 열인지(머리 행을 뺀 칸 중 값 칸이 있으면 값 열).
  function colKinds(rows, g, w) {
    const hdr = headerInRows(rows);
    const kinds = [];
    for (let c = 0; c < w; c++) {
      let value = false;
      for (let r = hdr ? 1 : 0; r < rows.length && !value; r++) {
        const e = g[r][c];
        if (e && isValueCell(cellAt(rows, e))) value = true;
      }
      kinds.push(value ? 'value' : 'label');
    }
    return kinds;
  }

  // 행 삽입. where: 'above'(ri행 위) | 'below'(ri행 아래). 삽입 위치가 세로 병합 칸 안쪽이면 그 칸의 rowspan+1,
  // 경계면 병합은 그대로 두고 새 칸을 만든다. → {t, key}(key: 새 행의 첫 이름 칸)
  function tInsRow(t, ri, where) {
    const rows = cloneRows(t.rows);
    const g = gridOf(rows);
    const w = gridWidth(g);
    const hdr = headerInRows(rows);
    const at = where === 'above' ? ri : ri + 1;
    // 새 칸의 모양을 따를 기준 행: 눌린 행. 머리 행이면 그 아래 첫 본문 행.
    const ref = (hdr && ri === 0 && rows.length > 1) ? 1 : ri;
    const gen = newKeyGen(t);
    const cells = Object.assign({}, t.cells);
    const row = [];
    const grown = {};
    for (let c = 0; c < w; c++) {
      const up = at > 0 ? g[at - 1][c] : null;
      const down = at < rows.length ? g[at][c] : null;
      if (up && down && up.r === down.r && up.ci === down.ci) {
        const id = up.r + ':' + up.ci;
        if (!grown[id]) { grown[id] = true; const cell = rows[up.r][up.ci]; cell.rowspan = span(cell.rowspan) + 1; }
        continue;
      }
      const fc = freshCell(cellAt(rows, g[ref] && g[ref][c]), gen());
      cells[fc.key] = '';
      row.push(fc);
    }
    rows.splice(at, 0, row);
    const rowIds = (t.rowIds || []).slice();
    rowIds.splice(at, 0, null);
    const first = row.filter(function (c) { return !c.input; })[0];
    return { t: Object.assign({}, t, { rows: rows, rowIds: rowIds, cells: cells, seq: gen.seq(), locked: lockedIn(rows) }),
             key: first ? first.key : null };
  }
  // 행 삭제. 걸친 병합 칸은 rowspan-1, 이 행에서 시작하는 병합 칸은 내용을 다음 행으로 옮기고 rowspan-1.
  // → {t, lost}(lost: 사라진 엑셀 연결 칸 수)
  function tDelRow(t, ri) {
    const rows = cloneRows(t.rows);
    const an = anchorsOf(t.rows, gridOf(t.rows));
    const cells = Object.assign({}, t.cells);
    let lost = 0;
    const moved = [];
    an.forEach(function (a) {
      const cell = rows[a.r][a.ci];
      if (a.r === ri) {
        if (a.rs > 1) { setSpan(cell, 'rowspan', a.rs - 1); moved.push({ cell: cell, start: a.start }); }
        else {
          if (cell.mapped === true) lost++;
          if (cell.key != null) delete cells[String(cell.key)];
        }
      } else if (a.r < ri && a.r + a.rs > ri) {
        setSpan(cell, 'rowspan', a.rs - 1);
      }
    });
    if (moved.length && ri + 1 < rows.length) {
      moved.sort(function (x, y) { return x.start - y.start; });
      const base = an.filter(function (a) { return a.r === ri + 1; });
      moved.forEach(function (m, k) {
        const pos = base.filter(function (a) { return a.start < m.start; }).length + k;
        rows[ri + 1].splice(pos, 0, m.cell);
      });
    }
    rows.splice(ri, 1);
    const rowIds = (t.rowIds || []).slice();
    rowIds.splice(ri, 1);
    return { t: Object.assign({}, t, { rows: rows, rowIds: rowIds, cells: cells, locked: lockedIn(rows) }), lost: lost };
  }
  // 열 삽입(격자 열 gc 기준). where: 'left' | 'right'. 삽입 위치가 가로 병합 칸 안쪽이면 colspan+1.
  // → {t, key}(key: 새 열의 머리 칸, 머리 행이 없으면 첫 이름 칸)
  function tInsCol(t, gc, where) {
    const rows = cloneRows(t.rows);
    const g = gridOf(rows);
    const w = gridWidth(g);
    const hdr = headerInRows(rows);
    const at = where === 'left' ? gc : gc + 1;
    const gen = newKeyGen(t);
    const cells = Object.assign({}, t.cells);
    const an = anchorsOf(rows, g);
    const grown = {};
    const made = [];
    rows.forEach(function (row, r) {
      const left = at > 0 ? g[r][at - 1] : null;
      const right = at < w ? g[r][at] : null;
      if (left && right && left.r === right.r && left.ci === right.ci) {
        const id = left.r + ':' + left.ci;
        if (!grown[id]) { grown[id] = true; const cell = rows[left.r][left.ci]; cell.colspan = span(cell.colspan) + 1; }
        return;
      }
      const fc = freshCell(cellAt(rows, g[r][gc]), gen());
      cells[fc.key] = '';
      const pos = an.filter(function (a) { return a.r === r && a.start >= 0 && a.start < at; }).length;
      row.splice(pos, 0, fc);
      made.push({ r: r, cell: fc });
    });
    const colIds = (t.colIds || []).slice();
    colIds.splice(at, 0, null);
    let key = null;
    const top = hdr ? made.filter(function (m) { return m.r === 0; })[0] : null;
    if (top) key = top.cell.key;
    else { const f = made.filter(function (m) { return !m.cell.input; })[0]; if (f) key = f.cell.key; }
    return { t: Object.assign({}, t, { rows: rows, colIds: colIds, cells: cells, seq: gen.seq(), locked: lockedIn(rows) }), key: key };
  }
  // 열 삭제. 걸친 병합 칸은 colspan-1(그 열에서 시작하는 병합 칸은 같은 칸이 다음 열로 이어져 내용이 따라온다).
  function tDelCol(t, gc) {
    const rows = cloneRows(t.rows);
    const an = anchorsOf(t.rows, gridOf(t.rows));
    const cells = Object.assign({}, t.cells);
    const rm = [];
    let lost = 0;
    an.forEach(function (a) {
      if (a.start < 0 || !(a.start <= gc && gc < a.start + a.cs)) return;
      const cell = rows[a.r][a.ci];
      if (a.cs > 1) setSpan(cell, 'colspan', a.cs - 1);
      else {
        rm.push(cell);
        if (cell.mapped === true) lost++;
        if (cell.key != null) delete cells[String(cell.key)];
      }
    });
    rows.forEach(function (row, r) { rows[r] = row.filter(function (c) { return rm.indexOf(c) < 0; }); });
    const colIds = (t.colIds || []).slice();
    colIds.splice(gc, 1);
    return { t: Object.assign({}, t, { rows: rows, colIds: colIds, cells: cells, locked: lockedIn(rows) }), lost: lost };
  }

  // 메뉴 항목의 켜짐/꺼짐과 꺼진 이유. kind: 'row'|'col', idx: 행 순번 또는 격자 열 순번.
  // → {before, after, del} 각 {ok, why[, lost]}. before/after: 행은 위/아래, 열은 왼쪽/오른쪽. lost: 삭제로 사라질 연결 칸 수.
  board.rcRules = function (st, ti, kind, idx) {
    const t = st && st.tables && st.tables[ti];
    const no = function (why) { return { ok: false, why: why }; };
    if (!t || t.structOk !== true || !(idx >= 0)) return { before: no(''), after: no(''), del: no('') };
    const rows = t.rows;
    const g = gridOf(rows);
    const w = gridWidth(g);
    const lim = board.limitsOf(st);
    const hdr = headerInRows(rows);
    const tableCells = countCells(t);
    const formCells = st.tables.reduce(function (n, x) { return n + countCells(x); }, 0);
    // 넣은 뒤 칸 수가 한도를 넘는가(grown: 넣은 결과 표)
    const room = function (grown) {
      const add = countCells(grown) - tableCells;
      if (tableCells + add > lim.max_table_cells) return no('표 하나에 칸은 최대 ' + lim.max_table_cells + '개까지 넣을 수 있습니다.');
      if (formCells + add > lim.max_form_cells) return no('양식 전체에 칸은 최대 ' + lim.max_form_cells + '개까지 넣을 수 있습니다.');
      return { ok: true, why: '' };
    };
    if (kind === 'row') {
      if (idx >= rows.length) return { before: no(''), after: no(''), del: no('') };
      const isHdr = hdr && idx === 0;
      const body = rows.length - (hdr ? 1 : 0);
      const ins = function (where) {
        if (where === 'above' && isHdr) return no('머리 행 위에는 행을 넣을 수 없습니다.');
        if (rows.length >= lim.max_rows) return no('표 하나에 행은 최대 ' + lim.max_rows + '개까지 넣을 수 있습니다.');
        return room(tInsRow(t, idx, where).t);
      };
      let del;
      if (isHdr) del = no('머리 행은 삭제할 수 없습니다.');
      else if (body <= 1) del = no('행이 하나뿐이면 삭제할 수 없습니다.');
      else del = { ok: true, why: '', lost: tDelRow(t, idx).lost };
      return { before: ins('above'), after: ins('below'), del: del };
    }
    if (idx >= w) return { before: no(''), after: no(''), del: no('') };
    const kinds = colKinds(rows, g, w);
    const labelCols = kinds.filter(function (k) { return k === 'label'; }).length;
    const insC = function (where) {
      if (w >= lim.max_cols) return no('표 하나에 열은 최대 ' + lim.max_cols + '개까지 넣을 수 있습니다.');
      return room(tInsCol(t, idx, where).t);
    };
    let delC;
    if (w <= 1) delC = no('열이 하나뿐이면 삭제할 수 없습니다.');
    else if (kinds[idx] === 'label' && labelCols <= 1) delC = no('행 이름 열이 하나뿐이면 삭제할 수 없습니다.');
    else delC = { ok: true, why: '', lost: tDelCol(t, idx).lost };
    return { before: insC('left'), after: insC('right'), del: delC };
  };

  // 결과: {ok, st, why, key, lost}. 꺼진 항목이면 ok:false와 같은 상태를 돌려준다.
  function rcResult(st, ti, rule, make) {
    if (!rule.ok) return { ok: false, st: st, why: rule.why, key: null, lost: 0 };
    const x = make(st.tables[ti]);
    return { ok: true, st: withTable(st, ti, x.t), why: '', key: x.key != null ? x.key : null, lost: x.lost || 0 };
  }
  board.rcInsertRow = function (st, ti, ri, where) {
    const rules = board.rcRules(st, ti, 'row', ri);
    return rcResult(st, ti, where === 'above' ? rules.before : rules.after, function (t) { return tInsRow(t, ri, where); });
  };
  board.rcDeleteRow = function (st, ti, ri) {
    return rcResult(st, ti, board.rcRules(st, ti, 'row', ri).del, function (t) { return tDelRow(t, ri); });
  };
  board.rcInsertCol = function (st, ti, gc, where) {
    const rules = board.rcRules(st, ti, 'col', gc);
    return rcResult(st, ti, where === 'left' ? rules.before : rules.after, function (t) { return tInsCol(t, gc, where); });
  };
  board.rcDeleteCol = function (st, ti, gc) {
    return rcResult(st, ti, board.rcRules(st, ti, 'col', gc).del, function (t) { return tDelCol(t, gc); });
  };

  // 되돌리기 스택(행·열 조작만). 항목은 그 조작 직전의 표 구성 사본이다(상태는 불변이라 참조만 담는다).
  // 되돌릴 때 글자 입력은 되돌리지 않는다 — 구성 쪽 칸 중 지금 값이 있는 칸은 지금 값을 따른다.
  board.rcPush = function (stack, before, meta) {
    const m = meta || {};
    const e = { ref: before.ref, kind: str(m.kind), label: str(m.label), name: str(m.name),
                snap: { rows: before.rows, rowIds: before.rowIds, colIds: before.colIds, cells: before.cells, seq: before.seq || 0 } };
    const s = (stack || []).concat([e]);
    return s.length > RC_MAX_UNDO ? s.slice(s.length - RC_MAX_UNDO) : s;
  };
  // → null(되돌릴 것이 없다) | {st, entry, stack}. 그 표가 이미 빠졌으면 그 항목은 건너뛴다.
  board.rcUndo = function (st, stack) {
    let s = stack || [];
    while (s.length) {
      const e = s[s.length - 1];
      s = s.slice(0, -1);
      const ti = st.tables.findIndex(function (t) { return str(t.ref) === str(e.ref); });
      if (ti < 0) continue;
      const cur = st.tables[ti];
      const cells = {};
      Object.keys(e.snap.cells).forEach(function (k) { cells[k] = has(cur.cells, k) ? cur.cells[k] : e.snap.cells[k]; });
      const rows = e.snap.rows;
      return { st: withTable(st, ti, { rows: rows, rowIds: e.snap.rowIds, colIds: e.snap.colIds, cells: cells,
                                       seq: Math.max(cur.seq || 0, e.snap.seq || 0), locked: lockedIn(rows) }),
               entry: e, stack: s };
    }
    return null;
  };

  // 이름·위치 문구 ─ 행 이름은 그 행의 왼쪽부터 첫 값 칸 직전까지의 이름 칸 중, 글자가 있는 가장 안쪽 칸의 글자(없으면 '').
  // 값 칸 오른쪽의 '비고'·'판단기준' 같은 이름 칸은 행 이름이 아니다.
  board.rcRowName = function (t, ri) {
    const rows = (t && t.rows) || [];
    const line = gridOf(rows)[ri] || [];
    const seen = {};
    const list = [];
    for (let k = 0; k < line.length; k++) {
      const e = line[k];
      if (!e) continue;
      const id = e.r + ',' + e.ci;
      if (seen[id]) continue;
      seen[id] = true;
      list.push(cellAt(rows, e));
    }
    // 표 A 의 첫 열(기관명, rowspan 4)처럼 맨 왼쪽이 값 칸인 행: 그 앞쪽 값 칸은 건너뛰고, 뒤에 값 칸이 이어지는 이름 칸 묶음을 행 이름으로 본다.
    // (뒤에 값 칸이 없는 이름 칸 — 예: 값 칸 오른쪽의 '비고' — 만 남으면 행 이름이 아니다.)
    let i0 = 0;
    while (i0 < list.length && isValueCell(list[i0])) i0++;
    let name = '';
    let k2 = i0;
    for (; k2 < list.length; k2++) {
      const c = list[k2];
      if (isValueCell(c)) break;
      const tx = nowText(c, t.cells || {}).trim();
      if (tx !== '') name = tx;
      else if (c && c.fresh === true) name = '';   // 아직 이름을 쓰지 않은 새 행의 이름 칸: 바깥 구분 이름을 이 행 이름으로 쓰지 않는다
    }
    if (i0 > 0 && k2 >= list.length) return '';
    return name;
  };
  // 격자 열 gc의 이름: 머리 행의 그 열을 덮는 칸의 글자(없으면 columns 배열). 병합 아래 하위 열이면 part/total.
  board.rcColInfo = function (t, gc) {
    const rows = (t && t.rows) || [];
    if (headerInRows(rows)) {
      const e = (gridOf(rows)[0] || [])[gc];
      if (e) {
        const cell = cellAt(rows, e);
        return { name: nowText(cell, (t && t.cells) || {}).trim(), part: gc - e.start + 1, total: span(cell.colspan) };
      }
    }
    const col = t && Array.isArray(t.columns) ? t.columns[gc] : null;
    return { name: typeof col === 'string' ? col.trim() : '', part: 1, total: 1 };
  };
  board.rcHandleLabel = function (t, kind, idx) {
    if (kind === 'row') {
      if (headerInRows((t && t.rows) || []) && idx === 0) return '머리 행 편집';
      const n = board.rcRowName(t, idx);
      return n ? "'" + n + "' 행 편집" : (idx + 1) + '번째 행 편집';
    }
    const i = board.rcColInfo(t, idx);
    if (!i.name) return (idx + 1) + '번째 열 편집';
    return i.total > 1 ? "'" + i.name + "' " + i.part + '/' + i.total + '번째 열 편집' : "'" + i.name + "' 열 편집";
  };
  function unitOf(kind) { return kind === 'row' ? '행' : '열'; }
  // "'예비비'"(이름이 있을 때) 또는 "3번째 행"
  board.rcNm = function (kind, idx, name) { return name ? "'" + name + "'" : (idx + 1) + '번째 ' + unitOf(kind); };
  // "'예비비' 행" 또는 "3번째 행"
  board.rcWhat = function (kind, idx, name) { return name ? "'" + name + "' " + unitOf(kind) : (idx + 1) + '번째 ' + unitOf(kind); };
  // op: 'ins-before' | 'ins-after' | 'del'
  function rcSide(kind, op) { return kind === 'row' ? (op === 'ins-before' ? '위' : '아래') : (op === 'ins-before' ? '왼쪽' : '오른쪽'); }
  // 되돌리기 항목 이름(예: "'예비비' 아래에 행 삽입", "'예비비' 행 삭제")
  board.rcLabel = function (kind, op, idx, name) {
    return op === 'del' ? board.rcWhat(kind, idx, name) + ' 삭제'
      : board.rcNm(kind, idx, name) + ' ' + rcSide(kind, op) + '에 ' + unitOf(kind) + ' 삽입';
  };
  // 조작 직후 알림 문구
  // inBody: 열 삽입인데 새 열에 머리 입력란이 없어(병합 머리 아래) 본문의 행 이름 입력란으로 가는 경우 true
  board.rcDoneText = function (kind, op, idx, name, inBody) {
    if (op === 'del') return board.rcWhat(kind, idx, name) + '을 삭제했습니다.';
    const ask = (kind === 'col' && inBody === true) ? '새 열의 행 이름을 입력해 주세요.' : unitOf(kind) + ' 이름을 입력해 주세요.';
    return board.rcNm(kind, idx, name) + ' ' + rcSide(kind, op) + '에 ' + unitOf(kind) + '을 삽입했습니다. ' + ask;
  };
  // 열 삽입 결과의 첫 입력 칸(key)이 머리 행이 아닌 본문에 있는가.
  board.rcColNameInBody = function (t, key) {
    const rows = (t && t.rows) || [];
    if (key == null) return false;
    if (!headerInRows(rows)) return true;   // 머리 행이 없는 표: 입력란은 본문 이름 칸이다
    return !(rows[0] || []).some(function (c) { return c && typeof c === 'object' && c.key != null && String(c.key) === String(key); });
  };
  // 되돌린 뒤 알림 문구(label이 '삽입'으로 끝나면 '을', '삭제'면 '를')
  board.rcUndoneText = function (label) {
    const l = str(label);
    return l + (/삽입$/.test(l) ? '을' : '를') + ' 되돌렸습니다.';
  };
  board.rcDeleteConfirmText = function (kind, name, idx, lost) {
    const unit = unitOf(kind);
    return board.rcWhat(kind, idx, name) + '을 삭제할까요?' +
      '\n이 ' + unit + '에는 작성할 때 엑셀에서 값이 채워지는 칸이 ' + lost + '개 있습니다. 삭제하면 작성할 때 이 값들이 문서에 들어가지 않습니다.' +
      '\n저장하기 전에는 실제 양식이 바뀌지 않습니다.';
  };
  // 그 행·열에 걸친 칸들의 위치('r:ci') — 메뉴 대상 표시·삭제 대기 표시에 쓴다.
  board.rcTargetCells = function (t, kind, idx) {
    const rows = (t && t.rows) || [];
    const g = gridOf(rows);
    const out = [], seen = {};
    const add = function (e) {
      if (!e) return;
      const id = e.r + ':' + e.ci;
      if (!seen[id]) { seen[id] = true; out.push(id); }
    };
    if (kind === 'row') (g[idx] || []).forEach(add);
    else g.forEach(function (line) { add(line[idx]); });
    return out;
  };
  // 삭제로 실제 사라지는 칸의 위치('r:ci'): 그 행(열)에서 시작하고 rowspan(colspan)이 1인 칸만.
  // 걸쳐 있는 병합 칸·시작은 하지만 여러 행(열)에 걸쳐 내용이 옮겨 가는 병합 칸은 남으므로 제외한다.
  board.rcDeleteCells = function (t, kind, idx) {
    const rows = (t && t.rows) || [];
    const g = gridOf(rows);
    const out = [], seen = {};
    const add = function (e) {
      if (!e) return;
      const id = e.r + ':' + e.ci;
      if (seen[id]) return;
      seen[id] = true;
      const c = cellAt(rows, e);
      const o = (c && typeof c === 'object') ? c : {};
      if (kind === 'row' ? (e.r === idx && span(o.rowspan) === 1) : (e.start === idx && span(o.colspan) === 1)) out.push(id);
    };
    if (kind === 'row') (g[idx] || []).forEach(add);
    else g.forEach(function (line) { add(line[idx]); });
    return out;
  };
  // 새로 넣은 행·열 중 이름이 빈 것. → null | {kind:'row'|'col', key}. 행 이름은 그 행이 직접 가진 이름 칸 중
  // 가장 안쪽 칸, 열 이름은 머리 행에서 그 열을 덮는 칸이다(머리 행이 없는 표는 열을 보지 않는다).
  board.rcEmptyName = function (t) {
    if (!t || t.structOk !== true || !t.rows || !t.rows.length) return null;
    const rows = t.rows, g = gridOf(rows), w = gridWidth(g), vals = t.cells || {};
    const blank = function (c) { return nowText(c, vals).trim() === ''; };
    for (let r = 0; r < rows.length; r++) {
      if ((t.rowIds || [])[r] != null) continue;
      const own = (rows[r] || []).filter(function (c) { return !isValueCell(c); });
      if (!own.length) continue;
      const inner = own[own.length - 1];
      if (blank(inner)) return { kind: 'row', key: inner.key != null ? String(inner.key) : null };
    }
    if (headerInRows(rows)) {
      for (let c = 0; c < w; c++) {
        if ((t.colIds || [])[c] != null) continue;
        const e = (g[0] || [])[c];
        const cell = e ? cellAt(rows, e) : null;
        if (cell && blank(cell)) return { kind: 'col', key: cell.key != null ? String(cell.key) : null };
      }
    }
    return null;
  };

  // 제목은 trim해서 비교한다(putBody가 trim해서 보내므로 앞뒤 공백만 바꾼 것은 변경이 아니다).
  // 칸 값도 trim해서 비교한다(서버 BoardDocSpec.clean이 칸 값을 trim하고, putBody도 trim해서 보낸다 —
  // 앞뒤 공백만 바꾼 칸은 저장해도 달라지지 않으므로 변경이 아니다).
  // 행·열 구성이 처음과 달라졌는가(행·열을 넣었다 지우면 같아져 변경이 아니다).
  function structChanged(t) {
    return t.origStruct != null && structSig(t.rows || [], t.rowIds || [], t.colIds || []) !== t.origStruct;
  }
  function textChanged(t) {
    return str(t.title).trim() !== str(t.origTitle).trim() ||
      Object.keys(t.cells).some(function (k) { return str(t.cells[k]).trim() !== str(t.origCells[k]).trim(); });
  }
  function tableChanged(t) { return textChanged(t) || structChanged(t); }
  // 기존 표끼리의 상대 순서가 원래와 다른 표를 true로 표시한 배열(추가한 표는 항상 false)
  function shifted(st) {
    const kept = [];
    st.tables.forEach(function (t, i) { if (!t.isNew) kept.push(i); });
    const ranks = kept.map(function (i) { return st.tables[i].origRank; }).sort(function (a, b) { return a - b; });
    const out = st.tables.map(function () { return false; });
    kept.forEach(function (idx, k) { out[idx] = st.tables[idx].origRank !== ranks[k]; });
    return out;
  }

  board.changeCount = function (st) {
    let n = 0;
    if (str(st.name).trim() !== str(st.origName).trim()) n++;
    let kept = 0;
    st.tables.forEach(function (t) {
      if (t.isNew) n++;
      else { kept++; if (tableChanged(t)) n++; }
    });
    n += Math.max(0, (st.origCount || 0) - kept);
    if (shifted(st).some(Boolean)) n++;
    return n;
  };

  board.badgesFor = function (st, i) {
    const t = st.tables[i];
    if (!t) return [];
    if (t.isNew) return ['추가됨'];
    const out = [];
    const sc = structChanged(t);
    // 행·열만 바뀐 표는 '행·열 바뀜' 하나만, 글자도 함께 바뀌었으면 '변경됨'도 붙인다.
    if (textChanged(t) || (!sc && tableChanged(t))) out.push('변경됨');
    if (sc) out.push('행·열 바뀜');
    if (shifted(st)[i]) out.push('순서 바뀜');
    return out;
  };
  board.badgesHtml = function (list) {
    return (list || []).map(function (b) { return '<span class="bd-badge">' + esc(b) + '</span>'; }).join('');
  };
  board.dirtyText = function (n) { return n > 0 ? '● 저장 안 한 변경 ' + n + '건' : '변경 없음'; };

  // 저장 전 클라이언트 검증(서버도 같은 한도로 다시 검사한다). 오류 문구 또는 null.
  board.validateEdit = function (st) {
    const r = board.validateEditAt(st);
    return r ? r.msg : null;
  };
  // 위치까지 돌려주는 검증. → null | {msg, target}. target: 'name' | 'title:<i>' | 'cell:<i>:<key>'
  // ([고치러 가기] 버튼이 그 입력으로 포커스를 옮길 때 쓴다 — board.errTargetParts).
  board.validateEditAt = function (st) {
    function at(msg, target) { return { msg: msg, target: target }; }
    const name = str(st.name).trim();
    if (!name) return at('양식 이름을 입력해 주세요.', 'name');
    if (name.length > MAX_NAME) return at('양식 이름은 ' + MAX_NAME + '자 이내로 입력해 주세요.', 'name');
    if (CTRL_RE.test(st.name)) return at('양식 이름에 쓸 수 없는 문자가 있습니다.', 'name');
    for (let i = 0; i < st.tables.length; i++) {
      const t = st.tables[i];
      const label = (i + 1) + '번째 표';
      const title = str(t.title).trim();
      // 서버처럼 빈 제목은 항상 오류(원래 제목이 비어 있던 기존 표도 저장 전에 제목을 채워야 한다).
      if (!title) return at(label + '의 제목을 입력해 주세요.', 'title:' + i);
      if (title.length > MAX_TITLE) return at(label + '의 제목은 ' + MAX_TITLE + '자 이내로 입력해 주세요.', 'title:' + i);
      if (CTRL_RE.test(t.title)) return at(label + '의 제목에 쓸 수 없는 문자가 있습니다.', 'title:' + i);
      const keys = Object.keys(t.cells);
      for (let k = 0; k < keys.length; k++) {
        const v = t.cells[keys[k]];
        if (v.length > MAX_CELL) return at(label + '에 ' + MAX_CELL + '자를 넘는 칸이 있습니다.', 'cell:' + i + ':' + keys[k]);
        if (CTRL_RE.test(v)) return at(label + '의 칸에 쓸 수 없는 문자가 있습니다.', 'cell:' + i + ':' + keys[k]);
      }
      // 새로 넣은 행·열의 이름이 비어 있으면 저장할 수 없다(어느 행·열인지 알 수 없는 양식이 된다).
      const blank = board.rcEmptyName(t);
      if (blank) {
        return at(label + '에 이름이 빈 ' + (blank.kind === 'row' ? '행' : '열') + '이 있습니다.',
          blank.key != null ? 'cell:' + i + ':' + blank.key : 'title:' + i);
      }
    }
    return null;
  };
  // 오류 위치 문자열 → {kind:'name'|'title'|'cell', i, key} | null. 선택자를 문자열로 만들지 않고
  // 배선에서 data-key 값을 직접 비교하게 하려고 나눠 돌려준다(키에 따옴표 등이 있어도 안전).
  board.errTargetParts = function (target) {
    const s = str(target);
    if (s === 'name') return { kind: 'name', i: -1, key: '' };
    const m = /^(title|cell):(\d+)(?::([\s\S]*))?$/.exec(s);
    if (!m) return null;
    if (m[1] === 'cell' && m[3] == null) return null;
    return { kind: m[1], i: parseInt(m[2], 10), key: m[1] === 'cell' ? m[3] : '' };
  };

  // 표시 중인 오류 문구를 지금 지워도 되는가. cause: 'confirm'(저장·끝내기 확인 줄을 여는 순간) | 'input'(입력 중).
  // 409 충돌(conflict)은 [최신 내용 보기]로만 풀리므로 지우지 않는다.
  // 입력으로는 검증 오류(errorKind 'local')만, 지금 상태가 검증을 통과할 때 지운다 —
  // 서버가 돌려준 저장 실패 문구는 입력만으로 원인이 풀렸다고 볼 수 없어 남긴다.
  board.shouldClearError = function (ui, st, cause) {
    const u = ui || {};
    if (!u.error || u.conflict || u.saving) return false;
    if (cause === 'confirm') return true;
    if (cause === 'input') return u.errorKind === 'local' && !!st && board.validateEdit(st) === null;
    return false;
  };
  // 표 구조(순서·개수)가 바뀌었을 때(위로·아래로·빼기 확정·표 추가) 검증 오류를 지울지.
  // 검증 오류의 위치(title:i 등)가 표 순번을 가리키므로 구조가 바뀌면 낡는다 — 지우고 다음 저장 때 다시 검증한다.
  // 409 충돌·서버 저장 실패 문구는 구조 변경과 무관하므로 남긴다. 저장 중에는 건드리지 않는다.
  board.clearOnRestructure = function (ui) {
    const u = ui || {};
    return !!u.error && u.errorKind === 'local' && !u.conflict && !u.saving;
  };

  // PUT 본문(표 순서 = 배열 순서). 행·열 구성이 바뀌지 않은 표는 재정의 값 맵(cells)만 보내고,
  // 바뀐 표만 cols + rows(앵커 칸만)를 보낸다(그 표에는 cells를 보내지 않는다).
  // opts.confirmUnmapped: 엑셀 연결 칸이 사라지는 저장을 사용자가 확인한 뒤의 재요청에만 true.
  board.putBody = function (st, opts) {
    const body = {
      base_version: st.version,
      name: str(st.name).trim(),
      tables: st.tables.map(function (t) {
        const o = { ref: t.ref, title: str(t.title).trim(), notes: t.notes.slice() };
        if (structChanged(t)) {
          const sb = structBody(t);
          o.cols = sb.cols; o.rows = sb.rows;
        } else {
          const cells = {};
          Object.keys(t.cells).forEach(function (k) { cells[k] = str(t.cells[k]).trim(); });   // 서버도 칸 값을 trim한다
          o.cells = cells;
        }
        return o;
      })
    };
    if (opts && opts.confirmUnmapped === true) body.confirm_unmapped = true;
    return body;
  };
  // 구조가 바뀐 표의 cols/rows. 새 열(id 없음)에는 표 안에서 유일한 임시 id "n1","n2"…를 주고,
  // 새 행의 id는 null. 병합으로 가려진 칸은 보내지 않는다(행마다 앵커 칸만, 열 순서대로).
  // 엑셀 연결 칸(mapped)의 글자는 ""로 보낸다.
  function structBody(t) {
    const rows = t.rows || [];
    const g = gridOf(rows);
    const start = {};
    anchorsOf(rows, g).forEach(function (a) { start[a.r + ':' + a.ci] = a.start; });
    const used = {};
    (t.colIds || []).forEach(function (id) { if (id != null) used[String(id)] = true; });
    let n = 0;
    const ids = (t.colIds || []).map(function (id) {
      if (id != null) return id;
      do { n++; } while (used['n' + n]);
      return 'n' + n;
    });
    return {
      cols: ids.map(function (id) { return { id: id }; }),
      rows: rows.map(function (row, ri) {
        return {
          id: t.rowIds && t.rowIds[ri] != null ? t.rowIds[ri] : null,
          cells: (Array.isArray(row) ? row : []).map(function (c, ci) {
            const o = (c && typeof c === 'object') ? c : { text: c };
            let text;
            if (o.mapped === true) text = '';
            else if (o.key != null && o.key !== '' && has(t.cells, String(o.key))) text = str(t.cells[String(o.key)]).trim();
            else text = str(o.text).trim();
            const cell = { col: ids[start[ri + ':' + ci]], text: text, colspan: span(o.colspan), rowspan: span(o.rowspan),
                           header: o.header === true, input: o.input === true };
            if (ALIGNS[o.align]) cell.align = o.align;
            return cell;
          })
        };
      })
    };
  }

  board.removeConfirmText = function (t) {
    const name = str(t && t.title).trim() || str(t && t.mapping) || '이 표';
    const locked = (t && t.locked) || 0;
    return '"' + name + '" 표를 양식에서 뺄까요?' +
      (locked > 0 ? '\n엑셀 값이 들어가는 칸 ' + locked + '개가 함께 빠집니다.' : '') +
      '\n저장하기 전에는 실제 양식이 바뀌지 않습니다.';
  };
  board.saveConfirmText = function () {
    return '새 버전으로 저장합니다.\n결재 중인 건은 상신할 때의 버전이 그대로 유지됩니다.';
  };
  board.cancelConfirmText = function (n) {
    return n > 0 ? '저장하지 않은 변경 ' + n + '건이 사라집니다. 편집을 끝낼까요?'
      : '저장하지 않은 변경이 없습니다. 편집을 끝낼까요?';
  };
  board.NOTHING_TO_SAVE = '바뀐 내용이 없어 저장하지 않았습니다.';

  // 인라인 확인의 [확인]을 눌렀을 때 할 일(순수). 확인을 띄운 뒤 변경이 0건이 됐으면 저장하지 않는다.
  board.confirmPlan = function (st, c) {
    if (!st || !c) return { run: 'none' };
    if (c.act === 'save') return board.changeCount(st) > 0 ? { run: 'save' } : { run: 'none', msg: board.NOTHING_TO_SAVE };
    if (c.act === 'cancel') return { run: 'cancel' };
    if (c.act === 'del') return { run: 'del' };
    if (c.act === 'delrow' || c.act === 'delcol') return { run: 'delrc' };
    // 엑셀 연결 칸이 빠지는 저장의 확인: 확인을 띄운 뒤 변경이 0건이 됐으면 보내지 않는다.
    if (c.act === 'unmap') return board.changeCount(st) > 0 ? { run: 'save-unmap' } : { run: 'none', msg: board.NOTHING_TO_SAVE };
    return { run: 'none' };
  };
  // 확인 줄 문구. 취소·저장은 지금 상태로 다시 만든다(확인 대기 중에 입력이 바뀌어도 건수가 맞게).
  board.confirmText = function (st, c) {
    if (c && c.act === 'cancel') return board.cancelConfirmText(board.changeCount(st));
    if (c && c.act === 'save') return board.saveConfirmText();
    return str(c && c.text);
  };
  // 확인 줄을 닫을 때 포커스를 돌려줄 곳. 삭제는 그 표의 삭제 버튼(지금 위치), 없으면 표 추가.
  board.confirmBack = function (st, c) {
    if (c && c.act === 'del') {
      const tables = (st && Array.isArray(st.tables)) ? st.tables : [];
      const idx = tables.findIndex(function (t) { return str(t.ref) === str(c.ref); });
      return idx >= 0 ? '[data-act="del"][data-i="' + idx + '"]' : '#bd-add';
    }
    if (c && (c.act === 'delrow' || c.act === 'delcol')) {
      const tables = (st && Array.isArray(st.tables)) ? st.tables : [];
      const ti = tables.findIndex(function (t) { return str(t.ref) === str(c.ref); });
      return ti >= 0 ? '.bd-handle[data-t="' + ti + '"][data-kind="' + (c.act === 'delrow' ? 'row' : 'col') + '"][data-idx="' + (parseInt(c.idx, 10) || 0) + '"]' : '#bd-add';
    }
    if (c && c.act === 'cancel') return '#bd-cancel';
    return '#bd-save';
  };
  // 확인 줄 버튼 문구(동작별 동사). primary: 실행 버튼에 틸 테두리(저장만).
  board.confirmButtons = function (c) {
    const act = c && c.act;
    if (act === 'save') return { ok: '저장', no: '돌아가기', primary: true };
    if (act === 'cancel') return { ok: '변경 버리고 끝내기', no: '계속 편집', primary: false };
    if (act === 'del') return { ok: '표 빼기', no: '그대로 두기', primary: false };
    if (act === 'delrow') return { ok: '행 삭제', no: '그대로 두기', primary: false };
    if (act === 'delcol') return { ok: '열 삭제', no: '그대로 두기', primary: false };
    if (act === 'unmap') return { ok: '저장', no: '돌아가기', primary: false };
    return { ok: '확인', no: '취소', primary: false };
  };
  // 확인 줄이 열릴 때 처음 포커스할 버튼. 편집 끝내기·행/열 삭제·연결 칸이 빠지는 저장은
  // 되돌리기 어려운 쪽이라 안전한 [계속 편집]·[그대로 두기]·[돌아가기](no 버튼)에 둔다.
  board.confirmFocus = function (c) {
    const a = c && c.act;
    return (a === 'cancel' || a === 'delrow' || a === 'delcol' || a === 'unmap') ? '#bd-no-confirm' : '#bd-ok-confirm';
  };
  // 저장 성공 문구. 서버가 changed:false를 주면 버전이 그대로다. 연결 칸이 빠졌으면(dropped_mapped) 건수를 덧붙인다.
  board.savedText = function (res) {
    if (res && res.changed === false) return '바뀐 내용이 없어 버전을 올리지 않았습니다.';
    const v = res ? res.version : null;
    return (v != null ? '새 버전 v' + v + '로 저장했습니다.' : '새 버전으로 저장했습니다.') +
      ' 앞으로 새로 만드는 건부터 적용됩니다.' +
      (res && res.droppedMapped > 0 ? ' 엑셀 값이 들어가는 칸 ' + res.droppedMapped + '개가 빠졌습니다.' : '');
  };
  // 엑셀 연결 칸이 빠지는 저장의 확인 문구(서버 400 UNMAP_CONFIRM_REQUIRED의 건수).
  board.unmapConfirmText = function (count) {
    return '작성할 때 엑셀에서 값이 채워지는 칸 ' + (count > 0 ? count + '개가 ' : '') + '양식에서 빠집니다.' +
      '\n저장하면 작성할 때 이 값들이 문서에 들어가지 않습니다. 그래도 저장할까요?';
  };
  // 목록을 화면에 적용될 때까지 다시 요청한다(순수). refresh: () => Promise<boolean>(적용됐으면 true).
  // 복제 응답을 기다리는 사이 이사회 화면 재진입(mount)이 목록 요청을 새로 보내면 이쪽 응답은 버려진다(listToken).
  board.untilApplied = function (refresh, max) {
    const n = max > 0 ? max : 3;
    const go = function (k) {
      return refresh().then(function (ok) { return (ok === true || k + 1 >= n) ? ok === true : go(k + 1); });
    };
    return go(0);
  };
  // 복제 뒤 새 양식을 열지 여부(순수). applied: 목록이 적용됐나, selected: 선택 상자 값,
  // here: 복제를 시작한 양식을 보기 모드로 아직 보고 있나. 하나라도 어긋나면 열지 않고 안내만 한다.
  board.copyOpenPlan = function (applied, selected, nid, here) {
    return applied === true && here === true && str(selected) !== '' && str(selected) === str(nid) ? 'open' : 'say';
  };
  // 목록 응답(loadForms 결과) → 화면 상태. 기본 양식은 items에 없으므로 앞에 붙인다.
  // 목록이 실패하면(예: DB 014 미적용 500) 기본 양식만 남고 편집·복제는 꺼진다.
  board.formsFromList = function (res) {
    const ok = !!(res && res.ok);
    const base = board.FORMS.map(function (f) { return { form_id: f.id, name: f.name, is_default: true }; });
    return {
      canEdit: ok && res.canEdit === true,
      perm: board.permState(res),
      forms: base.concat(ok && Array.isArray(res.items) ? res.items : []),
      error: ok ? '' : str(res && res.error)
    };
  };
  // 편집 권한 3상태. 'unknown'(목록 응답 전·목록 실패: 권한을 알 수 없음) | 'yes' | 'no'.
  // 권한 안내 한 줄(actionsHtml)은 'no'로 확인됐을 때만 띄운다.
  board.permState = function (res) {
    if (!res || !res.ok) return 'unknown';
    return res.canEdit === true ? 'yes' : 'no';
  };
  // 신원 키. 계정·모드가 바뀌었는지 비교하는 데만 쓴다.
  board.whoKey = function (session) {
    return session ? [str(session.mode), str(session.id), str(session.emp)].join('|') : '';
  };
  // 편집 가능한 사용자가 기본 양식 등 수정 불가 양식을 볼 때 '복제하여 편집'을 보여줄지.
  // 복제 가능 = 목록 응답의 can_edit(tasks 수정 권한)이고 지금 보는 양식이 편집 가능이 아닐 때.
  board.canCopy = function (form, canEdit) {
    return !!form && form.editable !== true && canEdit === true;
  };
  // 계정이 바뀌었을 때 화면을 어떻게 할지(순수). '이미 그렸는가'는 #bd-form 존재가 아니라 mount 이력으로 본다
  // (로그아웃 때 화면을 비우면 #bd-form이 사라져, 다시 로그인해도 그리지 않던 문제).
  // mounted: 한 번이라도 mount했는가 / key: 새 계정 키(''=로그아웃) / visible: #bd-root가 보이는가
  // → 'none'(한 번도 연 적 없음: 메뉴를 열 때 mount된다) | 'clear'(비우기만) | 'redraw'(비우고 새 계정으로 다시 그림)
  board.profilePlan = function (mounted, key, visible) {
    if (!mounted) return 'none';
    return key !== '' && visible ? 'redraw' : 'clear';
  };
  // 워드 내려받기 응답을 어떻게 할지(순수). 요청 때 잡은 계정 epoch가 지금과 다르면 'drop'
  // (계정이 바뀐 뒤라 파일 저장·안내·버튼 상태 모두 건드리지 않는다), 실패면 'error', 성공이면 'save'.
  board.docxOutcome = function (reqEpoch, nowEpoch, res) {
    if (reqEpoch !== nowEpoch) return 'drop';
    return res && res.ok ? 'save' : 'error';
  };

  // ── 칸 입력의 읽기 이름(순수) ───────────────────────────────
  // 병합(colspan·rowspan)을 펼친 격자: g[r][col] = {r, ci, start} (그 자리를 차지한 칸과 시작 열).
  function gridOf(rows) {
    const g = rows.map(function () { return []; });
    rows.forEach(function (row, r) {
      let col = 0;
      (Array.isArray(row) ? row : []).forEach(function (c, ci) {
        while (g[r][col]) col++;
        const o = (c && typeof c === 'object') ? c : {};
        const cs = span(o.colspan), rs = span(o.rowspan);
        for (let rr = r; rr < Math.min(r + rs, rows.length); rr++) {
          for (let cc = col; cc < col + cs; cc++) g[rr][cc] = { r: r, ci: ci, start: col };
        }
        col += cs;
      });
    });
    return g;
  }
  function cellAt(rows, e) { return e ? (Array.isArray(rows[e.r]) ? rows[e.r][e.ci] : null) : null; }
  // 칸의 지금 글자: 편집 중 값(values)이 있으면 그것, 없으면 원래 글자.
  function nowText(cell, values) {
    const o = (cell && typeof cell === 'object') ? cell : { text: cell };
    if (o.key != null && o.key !== '' && values && has(values, String(o.key))) return str(values[String(o.key)]);
    return str(o.text);
  }
  function labelIn(t, rows, g, r, ci) {
    const vals = t.cells || {};
    const parts = [str(t.title).trim()];
    const self = function (e) { return !!e && e.r === r && e.ci === ci; };
    const hdrRow = headerInRows(rows);
    const line = g[r] || [];
    const isHdr = function (e) { const c = cellAt(rows, e); return !!c && typeof c === 'object' && c.header === true; };
    // 아직 이름이 없는 이름 칸(새로 넣은 행·열의 머리 칸): 경로로 부를 글자가 없으므로 순번으로 부른다.
    //  "<표 제목> · 2번째 열 이름"(머리 행) / "<표 제목> · 3번째 행 이름"
    const mine = rows[r] && rows[r][ci];
    // 새 열을 기존 행 안쪽(병합 머리 아래)에 넣어 생긴 본문 이름 칸: 입력 전후 같은 이름 "<표 제목> · 3번째 열의 행 이름"
    if (mine && typeof mine === 'object' && mine.fresh === true && !isValueCell(mine) && !(hdrRow && r === 0) &&
        (t.rowIds || [])[r] != null) {
      for (let col = 0; col < line.length; col++) {
        if (self(line[col])) {
          if ((t.colIds || [])[line[col].start] == null && Array.isArray(t.colIds)) {
            return [parts[0], (line[col].start + 1) + '번째 열의 행 이름'].filter(function (s) { return s !== ''; }).join(' · ');
          }
          break;
        }
      }
    }
    if (mine && typeof mine === 'object' && mine.fresh === true && !isValueCell(mine) && nowText(mine, vals).trim() === '') {
      let at = -1;
      for (let col = 0; col < line.length; col++) { if (self(line[col])) { at = col; break; } }
      const what = (hdrRow && r === 0) ? (at + 1) + '번째 열 이름' : (r + 1) + '번째 행 이름';
      return [parts[0], what].filter(function (s) { return s !== ''; }).join(' · ');
    }
    // 구분(머리) 칸 자신의 입력: "<표 제목> · <바깥 구분 › … › 자기 글자> 구분 이름"
    let selfAt = -1;
    for (let col = 0; col < line.length; col++) { if (self(line[col])) { selfAt = col; break; } }
    if (selfAt >= 0 && isHdr(line[selfAt]) && !(hdrRow && r === 0)) {
      const seen = {}, seenText = {}, path = [];
      for (let col = 0; col <= selfAt; col++) {
        const e = line[col];
        if (!e || !isHdr(e)) continue;
        const id = e.r + ',' + e.ci;
        if (seen[id]) continue;
        seen[id] = true;
        const tx = nowText(cellAt(rows, e), vals).trim();
        if (tx !== '' && !seenText[tx]) { seenText[tx] = true; path.push(tx); }
      }
      const p = path.join(' › ');
      return [parts[0], p ? p + ' 구분 이름' : ''].filter(function (s) { return s !== ''; }).join(' · ') || '칸 수정';
    }
    // 행 머리: 같은 행(위에서 내려온 병합 포함)의 구분(header) 칸 전부를 바깥→안쪽 순서로 ' › '로 잇는다
    // (같은 칸·같은 글자는 한 번만). 구분 칸이 없으면 그 행 첫 칸. 머리글 행 칸은 생략.
    if (!(hdrRow && r === 0)) {
      const seen = {}, seenText = {}, path = [];
      const add = function (e) {
        const id = e.r + ',' + e.ci;
        if (seen[id] || self(e)) return;
        seen[id] = true;
        const tx = nowText(cellAt(rows, e), vals).trim();
        if (tx !== '' && !seenText[tx]) { seenText[tx] = true; path.push(tx); }
      };
      let any = false;
      for (let col = 0; col < line.length; col++) { if (isHdr(line[col])) { any = true; add(line[col]); } }
      if (!any) {
        // 구분 칸에 header 표시가 없는 표(실제 양식의 C-5): 행 앞쪽의 글자만 있는 칸(값 칸 mapped·input 이 아닌 칸)을
        // 값 칸이 나오기 전까지 바깥→안쪽 구분 경로로 본다. 글자가 다른 칸이 둘 이상일 때만 쓰고,
        // 그렇지 않으면(구분 1열 표 A/B/C-2/C-3/C-4) 예전처럼 그 행 첫 칸만 쓴다.
        const run = [], runSeen = {}, runText = {};
        let inRun = true;
        for (let col = 0; col < line.length && inRun; col++) {
          const e = line[col], c = cellAt(rows, e);
          if (!c || typeof c !== 'object' || c.header === true || c.mapped === true || c.input === true) { inRun = false; break; }
          const id = e.r + ',' + e.ci;
          if (runSeen[id]) continue;
          runSeen[id] = true;
          if (self(e)) { inRun = false; run.length = 0; break; }   // 자기 자신이 라벨 칸이면 예전 규칙
          const tx = nowText(c, vals).trim();
          if (tx !== '' && !runText[tx]) { runText[tx] = true; run.push(e); }
        }
        if (run.length >= 2) run.forEach(add); else if (line[0]) add(line[0]);
      }
      if (path.length) parts.push(path.join(' › '));
    }
    // 열 머리: 첫 행(header)에서 같은 열 순번을 차지한 칸. 머리글 행이 없으면 columns 배열(문자열)의 같은 순번.
    let start = -1;
    for (let col = 0; col < line.length; col++) { if (self(line[col])) { start = line[col].start; break; } }
    if (start >= 0) {
      if (hdrRow) {
        const e = g[0] && g[0][start];
        if (e && !self(e)) parts.push(nowText(cellAt(rows, e), vals).trim());
      } else if (Array.isArray(t.columns) && t.columns[start] != null && typeof t.columns[start] !== 'object') {
        parts.push(str(t.columns[start]).trim());
      }
    }
    const out = parts.filter(function (s) { return s !== ''; });
    return out.length ? out.join(' · ') : '칸 수정';
  }
  // 값 칸 입력의 aria-label: "<표 제목> · <행 구분 경로(바깥 › 안쪽)> · <열 머리>". 구하지 못한 부분은 생략,
  // 모두 비면 '칸 수정'. t: 편집 상태의 표({title, rows, columns, cells}), r: 행 순번, ci: 그 행 배열 안의 순번.
  board.cellLabel = function (t, r, ci) {
    const tb = t || {};
    const rows = Array.isArray(tb.rows) ? tb.rows : [];
    return labelIn(tb, rows, gridOf(rows), r, ci);
  };
  // 표 카드의 영역 이름. 제목이 비면 매핑 이름, 둘 다 없으면 '표'.
  board.cardLabel = function (t) {
    const tb = t || {};
    return (tb.title || tb.mapping || '표') + ' 편집';
  };
  // 표의 값 칸 전체의 읽기 이름: {칸 key: label}. 제목·행 머리 값을 고친 뒤 화면의 aria-label을 다시 맞출 때 쓴다.
  board.cellLabels = function (t) {
    const tb = t || {};
    const rows = Array.isArray(tb.rows) ? tb.rows : [];
    const g = gridOf(rows);
    const out = {};
    rows.forEach(function (row, r) {
      (Array.isArray(row) ? row : []).forEach(function (c, ci) {
        const k = (c && typeof c === 'object') ? c.key : null;
        if (k != null && k !== '') out[String(k)] = labelIn(tb, rows, g, r, ci);
      });
    });
    return out;
  };
  if (bw && bw.setLabeler) bw.setLabeler(board.cellLabel);   // 작성 모드의 칸 이름(툴팁·읽기 이름)

  // ── 편집 화면 HTML(순수) ─────────────────────────────────────
  // 이름(머리·구분) 칸은 입력으로, 엑셀 연결 칸은 틸 배경 글자로(잠김 표시 없음), 값 칸은 예시 글자로 그린다.
  // 새로 넣은 빈 값 칸에는 화면 낭독용 '빈 칸'을 둔다. label: 입력의 aria-label(board.cellLabel). 없으면 '칸 수정'.
  // o: {pos:'r:ci'(칸 위치 표시), ph:입력 placeholder('행 이름'|'열 이름'), pending:삭제 대기 표시}
  board.editCellHtml = function (cell, values, label, o) {
    const p = cellParts(cell);
    const raw = (cell && typeof cell === 'object') ? cell : {};
    const opt = o || {};
    const pos = opt.pos != null ? ' data-pos="' + esc(opt.pos) + '"' : '';
    if (opt.pending) p.cls.push('bd-pending-del');
    if (p.mapped) {
      return openTag(p, pos + ' title="작성할 때 엑셀 값이 들어가는 칸"') + esc(p.text) + '</' + p.tag + '>';
    }
    const vals = values || {};
    // 값 칸(input)은 예시 글자라 고치지 않는다. 이름 칸 중 글자가 있거나 새로 넣은 칸만 입력으로 연다.
    if (raw.input !== true && p.key != null && p.key !== '' && (p.text !== '' || raw.fresh === true) && has(vals, String(p.key))) {
      const v = vals[String(p.key)];
      // 서버는 줄바꿈이 든 칸을 받지 않으므로 입력은 한 줄 input으로 통일한다(줄바꿈 칸이 생기면 이관 참조).
      const ctl = '<input type="text" class="bd-cell-in" data-key="' + esc(p.key) + '" maxlength="' + MAX_CELL + '" value="' + esc(v) + '" aria-label="' + esc(label || '칸 수정') + '"' +
        (opt.ph ? ' placeholder="' + esc(opt.ph) + '"' : '') + '>';
      return openTag(p, pos) + ctl + '</' + p.tag + '>';
    }
    const blank = p.text === '' && (raw.input === true || raw.fresh === true);
    return openTag(p, pos) + (blank ? '<span class="bd-sr">빈 칸</span>' : esc(p.text)) + '</' + p.tag + '>';
  };

  const DOTS_V = '<svg class="bd-dots" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
    '<circle cx="8" cy="3.5" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="12.5" r="1.2" fill="currentColor"/></svg>';
  const DOTS_H = '<svg class="bd-dots" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
    '<circle cx="3.5" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="12.5" cy="8" r="1.2" fill="currentColor"/></svg>';
  // 행·열 손잡이(펼침 버튼). 메뉴 패널은 카드 직속 #bd-rcmenu-<표 순번>.
  function handleHtml(t, ti, kind, idx, open) {
    return '<button type="button" class="bd-handle" data-act="rc-handle" data-t="' + ti + '" data-kind="' + kind + '" data-idx="' + idx +
      '" aria-label="' + esc(board.rcHandleLabel(t, kind, idx)) + '" aria-expanded="' + (open ? 'true' : 'false') +
      '" aria-controls="bd-rcmenu-' + ti + '">' + (kind === 'row' ? DOTS_V : DOTS_H) + '</button>';
  }
  // 메뉴 패널: role=group + 일반 버튼 3개. 꺼진 항목은 disabled 대신 aria-disabled(포커스 가능) + 이유 한 줄.
  // menu: {ti, kind:'row'|'col', idx}
  board.rcMenuHtml = function (st, ti, menu) {
    const t = st.tables[ti];
    if (!t || !menu) return '';
    const rules = board.rcRules(st, ti, menu.kind, menu.idx);
    const row = menu.kind === 'row';
    const items = [['ins-before', row ? '위에 행 삽입' : '왼쪽에 열 삽입', rules.before],
                   ['ins-after', row ? '아래에 행 삽입' : '오른쪽에 열 삽입', rules.after],
                   ['del', row ? '행 삭제' : '열 삭제', rules.del]];
    return '<div class="bd-rcmenu" id="bd-rcmenu-' + ti + '" role="group" aria-label="' + esc(board.rcHandleLabel(t, menu.kind, menu.idx)) + '">' +
      items.map(function (it) {
        const r = it[2];
        return '<button type="button" class="bd-rc-item" data-act="rc-item" data-op="' + it[0] + '"' + (r.ok ? '' : ' aria-disabled="true"') + '>' +
          '<span>' + esc(it[1]) + '</span>' + (r.ok ? '' : '<span class="bd-rc-why">' + esc(r.why) + '</span>') + '</button>';
      }).join('') + '</div>';
  };
  // o: {ti(표 순번 — 있어야 행·열 손잡이를 그린다), menu, pending:{kind, idx}}
  board.editTableHtml = function (t, o) {
    const opt = o || {};
    const rows = Array.isArray(t.rows) ? t.rows : [];
    const cols = Array.isArray(t.columns) ? t.columns : [];
    const g = gridOf(rows);   // 칸마다 읽기 이름을 만들 때 격자를 한 번만 펼친다
    const handles = opt.ti != null && t.structOk === true && rows.length > 0;
    const hdr = headerInRows(rows);
    const menu = opt.menu || null;
    const pend = {};
    if (opt.pending) board.rcDeleteCells(t, opt.pending.kind, opt.pending.idx).forEach(function (k) { pend[k] = true; });
    let bar = '';
    if (handles) {
      bar = '<tr class="bd-colbar"><td class="bd-gut"></td>';
      for (let c = 0; c < gridWidth(g); c++) {
        bar += '<td class="bd-colh">' + handleHtml(t, opt.ti, 'col', c, !!menu && menu.kind === 'col' && menu.idx === c) + '</td>';
      }
      bar += '</tr>';
    }
    const body = '<tbody>' + bar + rows.map(function (r, ri) {
      const gut = handles
        ? '<td class="bd-gut">' + handleHtml(t, opt.ti, 'row', ri, !!menu && menu.kind === 'row' && menu.idx === ri) + '</td>' : '';
      return '<tr>' + gut + (Array.isArray(r) ? r : []).map(function (c, ci) {
        const pos = ri + ':' + ci;
        return board.editCellHtml(c, t.cells, labelIn(t, rows, g, ri, ci),
          { pos: pos, ph: (hdr && ri === 0) ? '열 이름' : '행 이름', pending: pend[pos] === true });
      }).join('') + '</tr>';
    }).join('') + '</tbody>';
    const head = theadHtml(cols, rows);
    const table = (rows.length || head)
      ? '<div class="bd-table-wrap"><table class="bd-table">' + head + body + '</table></div>' : '';
    const added = t.isNew ? '<p class="bd-added-note">저장하면 표 내용이 채워집니다.</p>' : '';
    return table + added + notesHtml(t.notes);
  };

  // ui: 삭제 확인(confirm.act==='del'|'delrow'|'delcol')이 이 표를 가리키면 머리 줄 바로 아래에 확인 줄을 그린다.
  // ui.menu: 열려 있는 행·열 메뉴({ti, kind, idx}).
  board.editCardHtml = function (st, i, ui) {
    const t = st.tables[i];
    const n = st.tables.length;
    const badges = board.badgesFor(st, i);
    const u = ui || {};
    const c = u.confirm;
    const mine = !!c && !u.saving && !u.conflict && str(c.ref) === str(t.ref);
    const ask = (mine && (c.act === 'del' || c.act === 'delrow' || c.act === 'delcol'))
      ? board.confirmHtml({ act: c.act, text: board.confirmText(st, c) }) : '';
    const pending = (mine && (c.act === 'delrow' || c.act === 'delcol')) ? { kind: c.act === 'delrow' ? 'row' : 'col', idx: c.idx } : null;
    const menu = (u.menu && u.menu.ti === i) ? u.menu : null;
    return '<section class="bd-card bd-card-edit' + (badges.length ? ' is-dirty' : '') + '" data-i="' + i +
      '" aria-label="' + esc(board.cardLabel(t)) + '">' +
      '<div class="bd-card-head bd-edit-head">' +
      (t.mapping ? '<span class="bd-map">' + esc(t.mapping) + '</span>' : '') +
      '<input type="text" class="bd-title-in" data-title="' + i + '" maxlength="' + MAX_TITLE + '" value="' + esc(t.title) + '" aria-label="표 제목">' +
      '<span class="bd-badges">' + board.badgesHtml(badges) + '</span>' +
      '<button type="button" data-act="up" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="표 위로 옮기기">위로</button>' +
      '<button type="button" data-act="down" data-i="' + i + '"' + (i === n - 1 ? ' disabled' : '') + ' aria-label="표 아래로 옮기기">아래로</button>' +
      // 문구는 확인 줄('표 빼기')·완료 안내('표를 뺐습니다')와 같은 동사로 맞춘다. data-act는 'del' 그대로.
      '<button type="button" data-act="del" data-i="' + i + '"' + (n <= 1 ? ' disabled' : '') + ' aria-label="표 빼기">빼기</button>' +
      '<button type="button" class="link-btn" data-act="skip" data-i="' + i + '">이 표 칸 건너뛰기</button>' +
      '</div>' + (n <= 1 ? '<p class="bd-hint">표가 하나뿐이면 뺄 수 없습니다.</p>' : '') +
      ask + board.editTableHtml(t, { ti: i, menu: menu, pending: pending }) + (menu ? board.rcMenuHtml(st, i, menu) : '') + '</section>';
  };

  // 행·열 알림 줄 안쪽: 문구 + (되돌리기 링크가 있으면) [되돌리기]. m: {text, undo}
  board.rcMsgInner = function (m) {
    if (!m || !m.text) return '';
    return esc(m.text) + (m.undo ? ' <button type="button" class="link-btn" data-act="rc-undo">되돌리기</button>' : '');
  };
  // ui: {saving, undo(되돌리기 스택), rcMsg({text, undo})}
  board.editBarHtml = function (st, ui) {
    const n = board.changeCount(st);
    const u = ui || {};
    const saving = !!u.saving;
    const stack = Array.isArray(u.undo) ? u.undo : [];
    const last = stack.length ? stack[stack.length - 1] : null;
    // tabindex=-1: 저장 중(버튼이 모두 꺼짐)에 포커스를 둘 곳. 저장 중이면 건수 자리에 진행 문구를 둔다.
    return '<div class="bd-editbar" id="bd-editbar" tabindex="-1"><span>양식 편집 중 · v' + esc(st.version) + ' 기준</span>' +
      '<span id="bd-dirty" class="' + (n ? 'bd-dirty' : 'bd-clean') + '">' + esc(saving ? '저장하는 중…' : board.dirtyText(n)) + '</span>' +
      '<span id="bd-rowcol-msg" class="bd-rowcol-msg" aria-live="polite">' + board.rcMsgInner(u.rcMsg) + '</span>' +
      '<button type="button" id="bd-undo" class="bd-undo" data-act="rc-undo"' + ((last && !saving) ? '' : ' disabled') +
      ' aria-label="' + esc(last ? '되돌리기: ' + last.label : '되돌리기') + '">되돌리기</button></div>';
  };
  // 안내 문구(잠김 표시 대신): 편집 막대 바로 아래, 양식 이름 줄 위, 화면에 한 번만.
  board.editGuideHtml = function () {
    return '<div class="bd-edit-guide" id="bd-edit-guide">' +
      '<p>표 안의 숫자는 예시입니다. 실제 값은 [이 양식으로 작성]에서 엑셀을 올리면 채워집니다.</p>' +
      '<p>여기서는 표 제목, 행·열 이름, 행과 열의 구성을 고칠 수 있습니다. ' +
      '<span class="bd-swatch" aria-hidden="true"></span>틸 배경 칸은 작성할 때 엑셀 값이 들어가는 자리입니다.</p></div>';
  };

  // cat: {status:'idle'|'loading'|'ready'|'error', items?, error?}
  board.catalogPanelHtml = function (st, cat) {
    const c = cat || { status: 'idle' };
    let inner;
    if (c.status === 'error') inner = '<p class="bd-err" role="alert">' + esc(c.error) + '</p>';
    else if (c.status !== 'ready') inner = '<p class="bd-hint">표 목록을 불러오는 중…</p>';
    else if (!c.items.length) inner = '<p class="bd-hint">추가할 수 있는 표가 없습니다.</p>';
    else {
      const used = {};
      st.tables.forEach(function (t) { used[str(t.ref)] = true; });
      inner = '<ul class="bd-add-list">' + c.items.map(function (it) {
        const isUsed = used[str(it.ref)] === true;
        return '<li><button type="button" data-act="addpick" data-ref="' + esc(it.ref) + '"' + (isUsed ? ' disabled' : '') + '>' +
          esc(it.title || it.ref) + (isUsed ? ' · 이미 있음' : '') + '</button>' +
          (it.mapping ? '<span class="bd-map">' + esc(it.mapping) + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
    }
    return '<div class="bd-add-panel" id="bd-addpanel" role="group" aria-label="추가할 표 고르기">' +
      '<div class="bd-legend">추가할 표를 고르세요. 표는 맨 아래에 붙습니다.</div>' + inner +
      '<div><button type="button" data-act="addclose">닫기</button></div></div>';
  };

  // 인라인 확인 줄(브라우저 확인창 대신). 문구는 줄바꿈을 살린다(CSS .bd-confirm span).
  // 열리면 포커스가 확인 줄의 버튼(board.confirmFocus)으로 가므로 role=alert를 쓰지 않는다(문구는 aria-labelledby로 읽힌다).
  // c: {act, text} — 버튼 문구는 act로 정한다(board.confirmButtons).
  board.confirmHtml = function (c) {
    const b = board.confirmButtons(c);
    return '<div class="bd-confirm" role="group" aria-labelledby="bd-confirm-text"><span id="bd-confirm-text">' + esc(c.text) + '</span>' +
      '<button type="button" id="bd-ok-confirm" data-act="ok-confirm"' + (b.primary ? ' class="bd-primary"' : '') + '>' + esc(b.ok) + '</button>' +
      '<button type="button" id="bd-no-confirm" data-act="no-confirm">' + esc(b.no) + '</button></div>';
  };
  // ui: {saving, conflict, error, addOpen, confirm}
  board.editFootHtml = function (st, ui) {
    const u = ui || {};
    // 검증 오류(errorTarget 있음)면 문구 끝에 그 입력으로 가는 버튼을 붙인다. 409 충돌에는 붙이지 않는다.
    const go = (u.errorTarget && !u.conflict)
      ? ' <button type="button" class="link-btn" data-act="goerr" data-target="' + esc(u.errorTarget) + '">고치러 가기</button>' : '';
    const err = u.error ? '<p id="bd-editerr" class="bd-err" role="alert" tabindex="-1">' + esc(u.error) + go + '</p>' : '';
    if (u.conflict) {
      return err + '<div class="bd-foot"><button type="button" id="bd-reload" data-act="reload">최신 내용 보기</button></div>';
    }
    const n = board.changeCount(st);
    // 삭제 확인은 해당 표 카드 안에 그린다(editCardHtml). 가리키는 표가 없을 때만 여기에 대신 그린다.
    const c = u.confirm;
    const inCard = !!c && (c.act === 'del' || c.act === 'delrow' || c.act === 'delcol') && st.tables.some(function (t) { return str(t.ref) === str(c.ref); });
    const ask = (c && !inCard) ? board.confirmHtml({ act: c.act, text: board.confirmText(st, c) }) : '';
    return err + ask + '<div class="bd-foot">' +
      '<button type="button" id="bd-add" data-act="add"' + (u.saving ? ' disabled' : '') + ' aria-expanded="' + (u.addOpen ? 'true' : 'false') + '">표 추가</button>' +
      '<button type="button" id="bd-save" data-act="save"' + ((n === 0 || u.saving) ? ' disabled' : '') + '>' +
      (u.saving ? '저장하는 중…' : '새 버전으로 저장') + '</button>' +
      '<button type="button" id="bd-cancel" data-act="cancel"' + (u.saving ? ' disabled' : '') + '>편집 끝내기</button></div>';
  };

  board.editHtml = function (st, ui, cat) {
    const u = ui || {};
    return board.editBarHtml(st, u) + board.editGuideHtml() +
      '<fieldset class="bd-fs"' + ((u.saving || u.conflict) ? ' disabled' : '') + '>' +
      '<label class="bd-name-row">양식 이름 <input type="text" id="bd-name" maxlength="' + MAX_NAME + '" value="' + esc(st.name) + '"></label>' +
      st.tables.map(function (_, i) { return board.editCardHtml(st, i, u); }).join('') +
      '</fieldset>' +
      (u.addOpen && !u.conflict ? board.catalogPanelHtml(st, cat) : '') +
      board.editFootHtml(st, u);
  };

  // 위쪽 버튼 줄. ctx: {mode:'view'|'edit', hasDoc, docxBusy, editable, canCopy, perm, copy:null|{name,error,busy}}
  // docxBusy: 워드 생성 중이면 다시 그려져도 버튼을 끈 채로 둔다(두 번 누름 방지).
  // perm: board.permState — 권한 안내는 'no'일 때만(알 수 없음이면 목록 실패 문구만 보인다).
  board.actionsHtml = function (ctx) {
    const c = ctx || {};
    if (c.mode === 'write') return '';   // 작성 모드의 버튼은 작성 줄(#bd-writebar, board-write.js)에 있다
    if (c.mode === 'edit') return '<button type="button" id="bd-docx" data-act="docx" disabled>샘플 워드 내려받기</button>';
    let h = (c.canWrite ? '<button type="button" id="bd-write" data-act="write">이 양식으로 작성</button>' : '') +
      '<button type="button" id="bd-docx" data-act="docx"' + (c.hasDoc && !c.docxBusy ? '' : ' disabled') + '>샘플 워드 내려받기</button>';
    if (c.editable) {
      h += '<button type="button" id="bd-edit" data-act="edit">양식 편집</button>';
    } else if (c.canCopy) {
      if (c.copy) {
        h += '<span class="bd-copybox"><input type="text" id="bd-copyname" maxlength="' + MAX_NAME + '" value="' + esc(c.copy.name) + '" aria-label="새 양식 이름">' +
          '<button type="button" id="bd-copyok" data-act="copyok"' + (c.copy.busy ? ' disabled' : '') + '>복제 만들기</button>' +
          '<button type="button" data-act="copycancel"' + (c.copy.busy ? ' disabled' : '') + '>취소</button></span>' +
          (c.copy.error ? '<span id="bd-copyerr" class="bd-err" role="alert">' + esc(c.copy.error) + '</span>' : '');
      } else {
        h += '<button type="button" id="bd-copy" data-act="copy">양식 복제하여 편집</button>';
      }
    } else if (c.hasDoc && c.perm === 'no') {
      // 편집도 복제도 못 하는 사람: 버튼이 없는 이유를 한 줄로 알린다(양식을 고르지 않은 빈 화면에는 띄우지 않는다).
      // 권한을 아직 모르거나(목록 응답 전) 알 수 없으면(목록 실패) 띄우지 않는다.
      h += '<span class="bd-hint">양식은 편집 권한이 있는 사람만 고칠 수 있습니다.</span>';
      h += '<span class="bd-hint">자료 작성은 업무 수정 권한이 있어야 할 수 있습니다.</span>';
    }
    // 양식을 보고 있을 때만: 표의 숫자는 예시라는 안내. 작성 권한이 없는 사람에게는 작성 안내(뒷문장)를 뺀다.
    if (c.hasDoc) {
      h += '<p class="bd-legend">표의 숫자는 예시입니다.' +
        (c.canWrite ? ' 틸 배경 칸은 엑셀 값이 들어가는 칸으로, [이 양식으로 작성]에서 엑셀을 올리면 채워집니다.' : '') + '</p>';
    }
    return h;
  };

  // ── 배선(DOM) ─────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }
  function doFetch(u, init) { return fetch(u, init); }   // 신원 헤더는 app.js가 fetch를 감싸 붙인다

  let token = 0;          // 늦게 도착한 응답이 새 선택을 덮지 않게 한다
  let forms = [];         // 기본 양식 + GET /board-forms items
  let canEdit = false;    // 목록 응답의 can_edit(복제 가능 판정)
  let perm = 'unknown';   // 편집 권한 3상태(board.permState) — 권한 안내 한 줄을 띄울지
  let current = null;     // 지금 보이는 양식 {id, form}
  let mode = 'view';      // 'view' | 'edit'
  let edit = null;        // 편집 상태
  let editUi = freshUi();
  let catalog = { status: 'idle' };
  let copyUi = null;      // null | {name, error, busy}
  let listToken = 0;      // 늦게 도착한 목록 응답이 새 목록을 덮지 않게 한다
  let epoch = 0;          // 계정이 바뀌면 올린다(그 전에 보낸 복제·카탈로그 응답을 버린다)
  let who = '';           // 화면을 그린 계정(board.whoKey)
  let mounted = false;    // 한 번이라도 화면을 그렸는가(board.profilePlan)
  let docxBusy = false;   // 워드 생성 중(다시 그려져도 버튼을 끈 채로 둔다)
  let wc = null;          // 작성 모드 컨트롤러(board-write.js)

  // errorKind: 'local'(저장 전 검증) | 'server'(저장 응답) — 입력으로 지울 수 있는지 가른다(board.shouldClearError).
  // errorTarget: 검증 오류의 위치(board.validateEditAt) — [고치러 가기]가 쓴다. 서버 오류는 ''.
  // menu: 열린 행·열 메뉴 {ti, kind, idx} | undo: 행·열 조작 되돌리기 스택(저장·끝내기·다른 양식 열기에서 비운다) | rcMsg: 행·열 알림 {text, undo}
  function freshUi() {
    return { saving: false, error: '', errorKind: '', errorTarget: '', conflict: false, addOpen: false, confirm: null,
             menu: null, undo: [], rcMsg: null };
  }
  function whoNow() { return board.whoKey(root.store && root.store.loadSession ? root.store.loadSession() : null); }
  // 계정이 바뀌면 이전 계정의 목록·권한·편집 상태를 모두 버린다. 진행 중 응답은 토큰으로 무시한다.
  function resetState() {
    token++; listToken++; epoch++;
    forms = []; canEdit = false; perm = 'unknown'; current = null; mode = 'view'; edit = null;
    editUi = freshUi(); catalog = { status: 'idle' }; copyUi = null;
    docxBusy = false;   // 이전 계정의 워드 생성 응답은 onDocx가 epoch로 버린다
    if (wc) wc.reset();   // 작성 중이던 엑셀 값·확인 표시도 버린다
  }
  function say(text) { const m = el('bd-msg'); if (m) m.textContent = text || ''; }
  let limitsNow = null;   // 카탈로그 응답의 행·열·칸 한도(양식 응답에 limits가 없을 때 쓴다)
  // 화면 그리기·행/열 규칙 계산용 편집 상태: 양식 응답에 한도가 없으면 카탈로그 한도를 얹는다(편집 상태 자체는 바꾸지 않는다).
  function ed() { return (edit && !edit.limits && limitsNow) ? Object.assign({}, edit, { limits: limitsNow }) : edit; }
  function scroller() { const r = el('bd-root'); return r ? r.parentNode : null; }
  function focusFirst(selectors) {
    const body = el('bd-body');
    for (let i = 0; i < selectors.length; i++) {
      const f = body.querySelector(selectors[i]) || document.querySelector(selectors[i]);
      if (f && !f.disabled) {
        f.focus();
        if (document.activeElement === f) return;   // 포커스를 못 받는 요소면 다음 후보로
      }
    }
  }

  function renderActions() {
    const form = current && current.form;
    el('bd-actions').innerHTML = board.actionsHtml({
      mode: mode, hasDoc: !!form, docxBusy: docxBusy, editable: !!(form && form.editable === true),
      canCopy: board.canCopy(form, canEdit), perm: perm, copy: copyUi,
      canWrite: !!form && canEdit === true
    });
    el('bd-form').disabled = mode !== 'view';
  }
  function showState(state) { el('bd-body').innerHTML = board.stateHtml(state); }
  function renderView() {
    const f = current.form;
    showState({ status: 'ready', doc: f, version: f.version });
    renderActions();
  }
  function renderEdit(focusSelectors) {
    const sc = scroller();
    const top = sc ? sc.scrollTop : 0;
    // 표의 가로 스크롤 위치도 다시 그린 뒤 되돌린다(행·열을 넣을 때 표가 맨 앞으로 튀지 않게).
    const lefts = Array.prototype.map.call(el('bd-body').querySelectorAll('.bd-table-wrap'), function (w) { return w.scrollLeft; });
    el('bd-body').innerHTML = board.editHtml(ed(), editUi, catalog);
    if (sc) sc.scrollTop = top;
    Array.prototype.forEach.call(el('bd-body').querySelectorAll('.bd-table-wrap'), function (w, k) {
      if (lefts[k]) w.scrollLeft = lefts[k];
    });
    if (editUi.menu) placeMenu();
    if (focusSelectors) focusFirst(focusSelectors);
  }
  // 입력 중에는 전체를 다시 그리지 않고(포커스 유지) 건수·뱃지·저장 버튼만 갱신한다.
  function refreshStatus() {
    const n = board.changeCount(edit);
    const d = el('bd-dirty');
    if (d) { d.className = n ? 'bd-dirty' : 'bd-clean'; d.textContent = board.dirtyText(n); }
    Array.prototype.forEach.call(el('bd-body').querySelectorAll('section[data-i]'), function (sec) {
      const i = parseInt(sec.getAttribute('data-i'), 10);
      const b = board.badgesFor(edit, i);
      sec.classList.toggle('is-dirty', b.length > 0);
      const holder = sec.querySelector('.bd-badges');
      if (holder) holder.innerHTML = board.badgesHtml(b);
    });
    const s = el('bd-save');
    if (s) s.disabled = n === 0 || editUi.saving;
    if (editUi.confirm) {
      const ct = el('bd-confirm-text');
      if (ct) ct.textContent = board.confirmText(edit, editUi.confirm);
    }
    // 입력으로 검증 오류의 원인이 풀렸으면 오류 줄만 뗀다(전체를 다시 그리면 입력 포커스를 잃는다).
    if (board.shouldClearError(editUi, edit, 'input')) {
      editUi.error = ''; editUi.errorKind = ''; editUi.errorTarget = '';
      const e = el('bd-editerr');
      if (e && e.parentNode) e.parentNode.removeChild(e);
    }
  }

  // 기본 양식은 목록 응답의 items에 없으므로 앞에 붙인다(board.formsFromList).
  // 목록이 실패하면 기본 양식만 남고 편집·복제는 꺼진다.
  function refreshForms(selectId) {
    const t = ++listToken;
    return board.loadForms(doFetch).then(function (res) {
      if (t !== listToken) return false;   // 더 새 목록 요청이 있다 — 호출한 쪽이 필요하면 다시 요청한다
      const r = board.formsFromList(res);
      canEdit = r.canEdit;
      perm = r.perm;
      forms = r.forms;
      if (r.error) say(r.error);
      const sel = el('bd-form');
      if (!sel) return false;
      sel.innerHTML = board.formOptionsHtml(forms, selectId || '');
      renderActions();
      return true;
    });
  }

  // opts: {msg, thenEdit, focusEdit}
  function openForm(id, opts) {
    const o = opts || {};
    const t = ++token;
    mode = 'view'; edit = null; editUi = freshUi(); copyUi = null; current = null;
    say(o.msg || '');
    renderActions();
    if (id === '' || id == null) { showState({ status: 'idle' }); return; }
    showState({ status: 'loading' });
    board.loadView(doFetch, id).then(function (res) {
      if (t !== token) return;
      if (!res.ok) { showState({ status: 'error', error: res.error }); renderActions(); return; }
      current = { id: String(id), form: res.form };
      renderView();
      if (o.thenEdit && res.form.editable === true) startEdit(o.msg);
      else if (o.focusEdit) focusFirst(['#bd-edit', '#bd-copy']);
    });
  }

  // msg: 편집을 시작하면서 남길 안내(복제 직후 등). 버튼 클릭으로 불리면 이벤트가 오므로 문자열만 쓴다.
  function startEdit(msg) {
    if (!current || current.form.editable !== true) return;
    edit = board.editFromForm(current.form);
    mode = 'edit'; editUi = freshUi();
    say(typeof msg === 'string' ? msg : '');
    // 행·열 크기 한도는 표 카탈로그 응답(limits)에서 온다 — 아직 모르면 미리 받아 둔다(못 받으면 기본 한도).
    if (catalog.status === 'idle' || catalog.status === 'error') loadCatalog();
    renderActions();
    renderEdit(['#bd-name']);
  }

  function onSelect() { openForm(el('bd-form').value); }

  // 작성 모드(board-write.js). 컨트롤러는 한 번만 만든다. exit는 보기 모드로 돌아간다.
  function writeCtl() {
    if (wc || !bw || !bw.createController) return wc;
    wc = bw.createController({
      el: el, doFetch: doFetch, scroller: scroller,
      ctx: function () { return current ? { id: current.id, form: current.form } : null; },
      epoch: function () { return epoch; },
      who: function () { const p = root.store && root.store.loadProfile ? root.store.loadProfile() : null; return (p && p.name) || ''; },
      now: function () { return new Date(); },
      perms: function () {   // 내 정보 › 내 권한(권한 신청 폼)으로 이동
        if (root.myinfo && root.myinfo.openView) root.myinfo.openView('perms');
        const b = document.getElementById('tab-btn-myinfo');
        if (b) b.click();
      },
      exit: function (focusSel) {
        mode = 'view';
        if (current) renderView(); else renderActions();
        say('');
        focusFirst([focusSel || '#bd-write', '#bd-docx']);
      }
    });
    return wc;
  }
  function startWrite() {
    const c = writeCtl();
    if (!c || !current || mode !== 'view' || canEdit !== true) return;
    mode = 'write'; copyUi = null; say('');
    renderActions();
    c.start();
  }

  function onDocx() {
    if (!current || mode !== 'view' || docxBusy) return;
    const cur = current;
    const ep = epoch;
    docxBusy = true;
    el('bd-docx').disabled = true;
    say('워드 파일을 만드는 중…');
    board.fetchAnyDocx(doFetch, cur.id).then(function (res) {
      const what = board.docxOutcome(ep, epoch, res);
      // 그 사이 계정이 바뀌었다 — resetState가 docxBusy를 이미 내렸으므로 새 세션의 버튼·안내를 건드리지 않는다.
      if (what === 'drop') return;
      docxBusy = false;
      const b = el('bd-docx');
      if (b) b.disabled = mode === 'edit' || !current;
      if (what === 'error') { say(res.error); return; }
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = board.docxFileName({ name: cur.form.name || (cur.form.doc && cur.form.doc.name) }, cur.id);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      say('');
    });
  }

  function onCopyOk() {
    if (!copyUi || copyUi.busy || !current) return;
    const inp = el('bd-copyname');
    const name = inp ? inp.value.trim() : '';
    if (!name) { copyUi = { name: '', error: '새 양식 이름을 입력해 주세요.', busy: false }; renderActions(); focusFirst(['#bd-copyname']); return; }
    if (name.length > MAX_NAME) { copyUi = { name: name, error: '양식 이름은 ' + MAX_NAME + '자 이내로 입력해 주세요.', busy: false }; renderActions(); focusFirst(['#bd-copyname']); return; }
    copyUi = { name: name, error: '', busy: true };
    renderActions();
    const src = current.id;
    const ep = epoch;
    board.copyForm(doFetch, src, name).then(function (res) {
      if (ep !== epoch) return;   // 그 사이 계정이 바뀌었다
      // 복제를 시작한 화면에 그대로 있는지. 다른 양식으로 옮겼어도 결과는 알린다(서버에는 이미 생겼다).
      const stay = !!(current && current.id === src && copyUi);
      if (!res.ok) {
        if (stay) { copyUi = { name: name, error: res.error, busy: false }; renderActions(); }
        else say(res.error);
        return;
      }
      const nid = String(res.formId);
      // 목록 갱신이 재진입 갱신에 밀려도 적용될 때까지 다시 요청한다. 계정이 바뀌면(ep) 요청을 멈춘다.
      const listed = function (selectId) {
        return board.untilApplied(function () {
          return ep !== epoch ? Promise.resolve(true) : refreshForms(selectId);
        });
      };
      if (stay) {
        listed(nid).then(function (applied) {
          if (ep !== epoch) return;
          const s = el('bd-form');
          const here = !!(current && current.id === src && mode === 'view');
          if (board.copyOpenPlan(applied, s ? s.value : '', nid, here) === 'open') {
            openForm(nid, { thenEdit: true, msg: '양식을 복제했습니다. 이제 고칠 수 있습니다.' });
          } else {
            // 선택 상자와 본문이 어긋나지 않게 열지 않는다. 복제본은 목록에서 고를 수 있다.
            say('"' + name + '" 양식을 복제했습니다. 목록에서 골라 고칠 수 있습니다.');
          }
        });
        return;
      }
      const selNow = el('bd-form');
      const keep = current ? current.id : (selNow ? selNow.value : '');
      listed(keep).then(function () {
        if (ep !== epoch) return;
        say('"' + name + '" 양식을 복제했습니다. 목록에서 골라 고칠 수 있습니다.');
      });
    });
  }

  function onSave() {
    if (!edit || editUi.saving || board.changeCount(edit) === 0) return;
    const bad = board.validateEditAt(edit);
    if (bad) { setLocalError(bad); renderEdit(['#bd-editerr']); return; }
    if (board.shouldClearError(editUi, edit, 'confirm')) { editUi.error = ''; editUi.errorKind = ''; editUi.errorTarget = ''; }
    editUi.confirm = { act: 'save', ref: '', text: board.saveConfirmText() };
    renderEdit([board.confirmFocus(editUi.confirm)]);
  }

  // 검증 오류({msg, target})를 화면 상태에 넣는다. target은 [고치러 가기]가 쓴다.
  function setLocalError(bad) {
    editUi.error = bad.msg; editUi.errorKind = 'local'; editUi.errorTarget = str(bad.target);
  }
  // 표 구조가 바뀌면(위로·아래로·빼기 확정·표 추가) 위치가 낡은 검증 오류를 지운다(board.clearOnRestructure).
  // 호출한 쪽이 곧바로 renderEdit로 다시 그리므로 #bd-editerr도 함께 사라진다. 409·서버 오류는 남는다.
  function clearOnRestructure() {
    if (board.clearOnRestructure(editUi)) { editUi.error = ''; editUi.errorKind = ''; editUi.errorTarget = ''; }
  }
  // [고치러 가기]: 오류 위치의 입력으로 포커스를 옮긴다. 칸 입력이 없으면(빈 칸 등) 그 표 제목으로.
  // data-key는 선택자에 넣지 않고 값을 직접 비교한다.
  function goToError(target) {
    const p = board.errTargetParts(target);
    if (!p) return;
    const body = el('bd-body');
    let f = null;
    if (p.kind === 'name') f = el('bd-name');
    else {
      if (p.kind === 'cell') {
        const sec = body.querySelector('section[data-i="' + p.i + '"]');
        if (sec) {
          f = Array.prototype.filter.call(sec.querySelectorAll('[data-key]'), function (x) {
            return x.getAttribute('data-key') === p.key;
          })[0] || null;
        }
      }
      if (!f) f = body.querySelector('[data-title="' + p.i + '"]');
    }
    if (f && !f.disabled) f.focus();
  }

  // 인라인 확인의 [확인]으로만 불린다. 확인 뒤에도 검증을 한 번 더 한다.
  // opts.confirmUnmapped: 엑셀 연결 칸이 빠지는 저장을 사용자가 확인한 뒤의 재요청(첫 요청에는 넣지 않는다).
  function doSave(opts) {
    if (!edit || editUi.saving || board.changeCount(edit) === 0) return;
    const bad0 = board.validateEditAt(edit);
    if (bad0) { setLocalError(bad0); renderEdit(['#bd-editerr']); return; }
    const snap = edit;
    const id = current.id;
    const ep = epoch;
    editUi.saving = true; editUi.error = ''; editUi.errorKind = ''; editUi.errorTarget = '';
    // 진행 문구는 편집 줄(#bd-dirty)과 저장 버튼 두 곳에만 둔다. #bd-msg는 이전 안내만 비운다.
    say('');
    renderEdit(['#bd-editbar']);   // 저장 중에는 버튼이 모두 꺼지므로 편집 줄에 포커스를 둔다(body로 빠지지 않게)
    board.saveForm(doFetch, snap, opts).then(function (res) {
      if (edit !== snap) return;
      if (res.ok) {
        const msg = board.savedText(res);
        refreshForms(id).then(function () {
          if (ep !== epoch) return;   // 그 사이 계정이 바뀌었다
          openForm(id, { msg: msg, focusEdit: true });
        });
        return;
      }
      editUi.saving = false;
      if (res.unmap) {
        // 연결 칸이 빠지는 저장: 오류 줄 대신 인라인 확인 줄로 건수를 알리고, 확인한 뒤에만 다시 보낸다.
        editUi.confirm = { act: 'unmap', ref: '', text: board.unmapConfirmText(res.unmap.count) };
        say('');
        renderEdit([board.confirmFocus(editUi.confirm)]);
        return;
      }
      editUi.error = res.error;
      editUi.errorKind = 'server';
      editUi.errorTarget = '';
      editUi.conflict = res.conflict === true;
      say('');
      renderEdit([res.conflict ? '#bd-reload' : '#bd-editerr', '#bd-save', '#bd-cancel']);
    });
  }

  function onCancel() {
    const n = board.changeCount(edit);
    if (n > 0) {
      if (board.shouldClearError(editUi, edit, 'confirm')) { editUi.error = ''; editUi.errorKind = ''; editUi.errorTarget = ''; }
      editUi.confirm = { act: 'cancel', ref: '', text: board.cancelConfirmText(n) };
      renderEdit([board.confirmFocus(editUi.confirm)]);
      return;
    }
    doCancel();
  }
  function doCancel() {
    mode = 'view'; edit = null; editUi = freshUi();
    say('');
    renderView();
    focusFirst(['#bd-edit']);
  }

  function loadCatalog() {
    catalog = { status: 'loading' };
    const ep = epoch;
    board.loadCatalog(doFetch).then(function (res) {
      if (ep !== epoch) return;   // 그 사이 계정이 바뀌었다
      catalog = res.ok ? { status: 'ready', items: res.items, limits: res.limits || null } : { status: 'error', error: res.error };
      if (res.ok && res.limits) limitsNow = res.limits;
      if (mode === 'edit' && editUi.addOpen) renderEdit(['#bd-addpanel button:not([disabled])', '#bd-add']);
    });
  }

  // 인라인 확인의 [확인]: 대기 중인 동작 하나만 실행하고 확인 줄을 치운다.
  function runConfirm() {
    const c = editUi.confirm;
    editUi.confirm = null;
    if (!c || mode !== 'edit' || !edit) return;
    const plan = board.confirmPlan(edit, c);
    if (plan.run === 'none') { renderEdit(['#bd-cancel', '#bd-add']); say(plan.msg || ''); return; }
    if (plan.run === 'save') { doSave(); return; }
    if (plan.run === 'cancel') { doCancel(); return; }
    if (plan.run === 'del') {
      const idx = edit.tables.findIndex(function (t) { return str(t.ref) === c.ref; });
      if (idx < 0 || edit.tables.length <= 1) { renderEdit(['#bd-add']); return; }
      edit = board.editRemove(edit, idx);
      clearOnRestructure();
      renderEdit(['[data-title="' + Math.min(idx, edit.tables.length - 1) + '"]', '#bd-add']);
      say('표를 뺐습니다. 저장하면 반영됩니다.');
    }
    if (plan.run === 'save-unmap') { doSave({ confirmUnmapped: true }); return; }
    if (plan.run === 'delrc') {
      const ti = edit.tables.findIndex(function (t) { return str(t.ref) === str(c.ref); });
      if (ti < 0) { renderEdit(['#bd-add']); return; }
      applyRc(ti, c.act === 'delrow' ? 'row' : 'col', c.idx, 'del');
    }
  }

  // ── 행·열 편집 배선(손잡이·메뉴·되돌리기) ───────────────────────
  let rcTimer = 0;   // 행·열 알림을 5초 뒤 비우는 타이머
  function sectionOf(ti) { const b = el('bd-body'); return b ? b.querySelector('section[data-i="' + ti + '"]') : null; }
  function findHandle(ti, kind, idx) {
    const sec = sectionOf(ti);
    if (!sec) return null;
    return Array.prototype.filter.call(sec.querySelectorAll('.bd-handle'), function (h) {
      return h.getAttribute('data-kind') === kind && h.getAttribute('data-idx') === String(idx);
    })[0] || null;
  }
  // 대상 표시: 메뉴가 열린(또는 손잡이에 올린·포커스한) 행·열의 칸에 클래스를 붙인다(배경이 아니라 안쪽 테두리).
  function clearTarget() {
    const b = el('bd-body');
    if (!b) return;
    Array.prototype.forEach.call(b.querySelectorAll('.bd-rc-target'), function (c) { c.classList.remove('bd-rc-target'); });
  }
  function setTarget(ti, kind, idx) {
    clearTarget();
    const t = edit && edit.tables[ti], sec = sectionOf(ti);
    if (!t || !sec) return;
    const want = {};
    board.rcTargetCells(t, kind, idx).forEach(function (k) { want[k] = true; });
    Array.prototype.forEach.call(sec.querySelectorAll('[data-pos]'), function (c) {
      if (want[c.getAttribute('data-pos')]) c.classList.add('bd-rc-target');
    });
  }
  // 열린 메뉴 패널을 손잡이 아래 4px에 놓는다(카드 안 절대 위치). 560px 이하에서는 카드 폭 가득.
  function placeMenu() {
    const m = editUi.menu;
    if (!m) return;
    const sec = sectionOf(m.ti), h = findHandle(m.ti, m.kind, m.idx);
    const p = sec ? sec.querySelector('.bd-rcmenu') : null;
    if (!sec || !h || !p) { editUi.menu = null; return; }
    const sr = sec.getBoundingClientRect(), hr = h.getBoundingClientRect();
    p.style.top = Math.round(hr.bottom - sr.top + 4) + 'px';
    if (typeof window !== 'undefined' && window.innerWidth <= 560) {
      p.classList.add('is-narrow');
      p.style.left = '12px'; p.style.right = '12px';
    } else {
      p.style.left = Math.max(0, Math.min(Math.round(hr.left - sr.left), sr.width - p.offsetWidth)) + 'px';
    }
    setTarget(m.ti, m.kind, m.idx);
  }
  // byKey: 키보드(Enter/Space)로 열었으면 첫 켜진 항목으로 포커스를 옮긴다.
  function openMenu(ti, kind, idx, byKey) {
    closeMenu(false);
    const sec = sectionOf(ti), h = findHandle(ti, kind, idx);
    if (!sec || !h) return;
    editUi.menu = { ti: ti, kind: kind, idx: idx };
    sec.insertAdjacentHTML('beforeend', board.rcMenuHtml(ed(), ti, editUi.menu));
    h.setAttribute('aria-expanded', 'true');
    placeMenu();
    if (byKey) {
      const p = sec.querySelector('.bd-rcmenu');
      const first = p && (p.querySelector('.bd-rc-item:not([aria-disabled="true"])') || p.querySelector('.bd-rc-item'));
      if (first) first.focus();
    }
  }
  // 전체를 다시 그리지 않고 패널만 떼어 낸다(다른 입력의 포커스를 건드리지 않으려고). refocus: 손잡이로 포커스.
  function closeMenu(refocus) {
    const m = editUi.menu;
    if (!m) return;
    editUi.menu = null;
    const b = el('bd-body');
    if (b) {
      Array.prototype.forEach.call(b.querySelectorAll('.bd-rcmenu'), function (p) { if (p.parentNode) p.parentNode.removeChild(p); });
      Array.prototype.forEach.call(b.querySelectorAll('.bd-handle[aria-expanded="true"]'), function (h) { h.setAttribute('aria-expanded', 'false'); });
    }
    clearTarget();
    if (refocus) { const h = findHandle(m.ti, m.kind, m.idx); if (h) h.focus(); }
  }
  function focusKey(ti, key) {
    const sec = key == null ? null : sectionOf(ti);
    if (!sec) return false;
    const inp = Array.prototype.filter.call(sec.querySelectorAll('input[data-key]'), function (x) { return x.getAttribute('data-key') === key; })[0];
    if (!inp || inp.disabled) return false;
    inp.focus();
    if (inp.scrollIntoView) inp.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return document.activeElement === inp;
  }
  // 편집 막대 안 알림(aria-live=polite). 다시 그린 직후 채워야 낭독된다. [되돌리기] 링크가 있으면 계속 둔다.
  function rcSay(text, withUndo) {
    clearTimeout(rcTimer);
    setTimeout(function () {
      if (mode !== 'edit' || !edit) return;
      editUi.rcMsg = { text: text, undo: !!withUndo };
      const m = el('bd-rowcol-msg');
      if (m) m.innerHTML = board.rcMsgInner(editUi.rcMsg);
      if (!withUndo) {
        rcTimer = setTimeout(function () {
          editUi.rcMsg = null;
          const x = el('bd-rowcol-msg');
          if (x) x.innerHTML = '';
        }, 5000);
      }
    }, 50);
  }
  // 행·열 조작 하나를 적용한다(삽입은 즉시, 삭제는 호출한 쪽이 확인을 마친 뒤). op: 'ins-before'|'ins-after'|'del'
  function applyRc(ti, kind, idx, op) {
    const t = edit && edit.tables[ti];
    if (!t) return;
    const row = kind === 'row';
    const where = op === 'ins-before' ? (row ? 'above' : 'left') : (row ? 'below' : 'right');
    const res = row
      ? (op === 'del' ? board.rcDeleteRow(ed(), ti, idx) : board.rcInsertRow(ed(), ti, idx, where))
      : (op === 'del' ? board.rcDeleteCol(ed(), ti, idx) : board.rcInsertCol(ed(), ti, idx, where));
    if (!res.ok) return;
    const name = row ? board.rcRowName(t, idx) : board.rcColInfo(t, idx).name;
    editUi.undo = board.rcPush(editUi.undo, t, { kind: kind + '-' + op, label: board.rcLabel(kind, op, idx, name), name: name });
    edit = res.st;
    editUi.menu = null; editUi.confirm = null; editUi.rcMsg = null;
    clearOnRestructure();
    renderEdit();
    if (op === 'del') {
      // 삭제 뒤: 올라온 행(열)의 손잡이, 마지막이었으면 바로 위 행(열)의 손잡이
      const left = row ? edit.tables[ti].rows.length : board.gridWidth(edit.tables[ti].rows);
      const h = findHandle(ti, kind, Math.max(0, Math.min(idx, left - 1)));
      if (h) h.focus();
    } else if (!focusKey(ti, res.key)) {
      const h = findHandle(ti, kind, idx);   // 새 머리 칸이 없으면(병합 안쪽 삽입 등) 눌렀던 손잡이로
      if (h) h.focus();
    }
    const inBody = !row && op !== 'del' && res.key != null && board.rcColNameInBody(edit.tables[ti], res.key);
    rcSay(board.rcDoneText(kind, op, idx, name, inBody), op === 'del');
  }
  function onRcHandle(b, e) {
    const ti = parseInt(b.getAttribute('data-t'), 10), kind = b.getAttribute('data-kind'), idx = parseInt(b.getAttribute('data-idx'), 10);
    const m = editUi.menu;
    if (m && m.ti === ti && m.kind === kind && m.idx === idx) { closeMenu(true); return; }
    openMenu(ti, kind, idx, !!e && e.detail === 0);
  }
  function onRcItem(b) {
    const m = editUi.menu;
    if (!m || b.getAttribute('aria-disabled') === 'true') return;
    const op = b.getAttribute('data-op');
    const t = edit.tables[m.ti];
    if (!t) return;
    if (op === 'del') {
      const rule = board.rcRules(ed(), m.ti, m.kind, m.idx).del;
      if (!rule.ok) return;
      if (rule.lost > 0) {
        // 엑셀 연결 칸이 있는 행·열: 카드 안 인라인 확인 줄(첫 포커스는 [그대로 두기])
        const name = m.kind === 'row' ? board.rcRowName(t, m.idx) : board.rcColInfo(t, m.idx).name;
        editUi.confirm = { act: m.kind === 'row' ? 'delrow' : 'delcol', ref: str(t.ref), idx: m.idx,
                           text: board.rcDeleteConfirmText(m.kind, name, m.idx, rule.lost) };
        closeMenu(false);
        renderEdit([board.confirmFocus(editUi.confirm)]);
        return;
      }
    }
    applyRc(m.ti, m.kind, m.idx, op);
  }
  // [되돌리기]: 마지막 행·열 조작 하나를 되돌린다. 전역 단축키(Ctrl+Z)는 쓰지 않는다.
  function doUndo() {
    if (!edit || editUi.saving || !editUi.undo.length) return;
    const r = board.rcUndo(edit, editUi.undo);
    closeMenu(false);
    editUi.confirm = null; editUi.rcMsg = null;
    if (!r) {
      editUi.undo = [];
      renderEdit(['#bd-editbar']);
      rcSay('되돌릴 수 있는 행·열 변경이 없습니다.', false);
      return;
    }
    edit = r.st; editUi.undo = r.stack;
    clearOnRestructure();
    renderEdit(['#bd-undo', '#bd-editbar']);
    rcSay(board.rcUndoneText(r.entry.label), false);
  }
  function handleOf(t) { return (t && t.closest) ? t.closest('.bd-handle') : null; }
  function onHandleOn(e) {
    const h = handleOf(e.target);
    if (!h || mode !== 'edit' || !edit) return;
    setTarget(parseInt(h.getAttribute('data-t'), 10), h.getAttribute('data-kind'), parseInt(h.getAttribute('data-idx'), 10));
  }
  function onHandleOff(e) {
    if (!handleOf(e.target) || !edit) return;
    clearTarget();
    if (editUi.menu) setTarget(editUi.menu.ti, editUi.menu.kind, editUi.menu.idx);
  }
  // 표를 가로로 밀거나 창 크기가 바뀌면 메뉴 위치가 어긋나므로 닫는다.
  function onBodyScroll(e) {
    if (mode === 'edit' && editUi.menu && e.target && e.target.classList && e.target.classList.contains('bd-table-wrap')) closeMenu(false);
  }
  function onWinResize() { if (mode === 'edit' && editUi.menu) closeMenu(false); }
  // 인라인 확인의 [취소]·Esc: 확인 줄만 닫고 포커스를 확인을 띄운 버튼 쪽으로 돌려준다.
  function closeConfirm() {
    const c = editUi.confirm;
    editUi.confirm = null;
    renderEdit([board.confirmBack(edit, c), '#bd-save', '#bd-add']);
  }
  function onBodyKey(e) {
    // 행·열 메뉴가 열려 있으면 Esc는 메뉴를 닫고 그 손잡이로 포커스를 돌려준다.
    if (e.key === 'Escape' && mode === 'edit' && edit && editUi.menu) {
      e.preventDefault();
      closeMenu(true);
      return;
    }
    if (e.key === 'Escape' && mode === 'edit' && edit && editUi.confirm) {
      e.preventDefault();
      closeConfirm();
    }
  }

  function onBodyClick(e) {
    // 메뉴 밖을 누르면 메뉴를 닫는다(다시 그리지 않으므로 누른 입력의 포커스는 그대로).
    if (mode === 'edit' && edit && editUi.menu && e.target.closest && !e.target.closest('.bd-rcmenu') && !e.target.closest('.bd-handle')) closeMenu(false);
    const b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b || b.disabled || mode !== 'edit' || !edit) return;
    const act = b.getAttribute('data-act');
    const i = parseInt(b.getAttribute('data-i'), 10);
    if (act === 'rc-handle') { onRcHandle(b, e); return; }
    if (act === 'rc-item') { onRcItem(b); return; }
    if (act === 'rc-undo') { doUndo(); return; }
    if (act === 'up' || act === 'down') {
      const dir = act === 'up' ? -1 : 1;
      const next = board.editMove(edit, i, dir);
      if (next === edit) return;
      const title = edit.tables[i].title || edit.tables[i].mapping || '표';
      edit = next;
      clearOnRestructure();
      renderEdit(['[data-act="' + act + '"][data-i="' + (i + dir) + '"]',
        '[data-act="' + (act === 'up' ? 'down' : 'up') + '"][data-i="' + (i + dir) + '"]']);
      say('"' + title + '" 표를 ' + (i + dir + 1) + '번째로 옮겼습니다.');
    } else if (act === 'del') {
      if (edit.tables.length <= 1) return;
      editUi.confirm = { act: 'del', ref: str(edit.tables[i].ref), text: board.removeConfirmText(edit.tables[i]) };
      renderEdit([board.confirmFocus(editUi.confirm)]);
    } else if (act === 'ok-confirm') {
      runConfirm();
    } else if (act === 'no-confirm') {
      closeConfirm();
    } else if (act === 'goerr') {
      goToError(b.getAttribute('data-target'));
    } else if (act === 'skip') {
      focusFirst(['[data-title="' + (i + 1) + '"]', '#bd-add']);
    } else if (act === 'add') {
      editUi.addOpen = !editUi.addOpen;
      if (editUi.addOpen && catalog.status !== 'ready' && catalog.status !== 'loading') loadCatalog();
      renderEdit(editUi.addOpen ? ['#bd-addpanel button:not([disabled])', '#bd-add'] : ['#bd-add']);
    } else if (act === 'addclose') {
      editUi.addOpen = false;
      renderEdit(['#bd-add']);
    } else if (act === 'addpick') {
      const ref = b.getAttribute('data-ref');
      const item = (catalog.items || []).filter(function (c) { return str(c.ref) === ref; })[0];
      const next = board.editAdd(edit, item);
      if (next === edit) { say('이미 들어 있는 표입니다.'); return; }
      edit = next; editUi.addOpen = false;
      clearOnRestructure();
      const idx = edit.tables.length - 1;
      renderEdit(['[data-title="' + idx + '"]']);
      const sec = el('bd-body').querySelector('section[data-i="' + idx + '"]');
      if (sec && sec.scrollIntoView) sec.scrollIntoView({ block: 'nearest' });
      say('표를 맨 아래에 추가했습니다. 저장하면 반영됩니다.');
    } else if (act === 'save') {
      onSave();
    } else if (act === 'cancel') {
      onCancel();
    } else if (act === 'reload') {
      openForm(current.id, { msg: '최신 내용을 불러왔습니다. 고치려면 [양식 편집]을 다시 눌러 주세요.', focusEdit: true });
    }
  }

  // 제목·칸 값을 고치면 카드 영역 이름과 칸 입력의 aria-label을 다시 맞춘다(입력 포커스는 건드리지 않는다).
  function relabel(i) {
    const tb = edit && edit.tables[i];
    const sec = el('bd-body').querySelector('section[data-i="' + i + '"]');
    if (!tb || !sec) return;
    sec.setAttribute('aria-label', board.cardLabel(tb));
    const labels = board.cellLabels(tb);
    Array.prototype.forEach.call(sec.querySelectorAll('input[data-key]'), function (inp) {
      const k = inp.getAttribute('data-key');
      inp.setAttribute('aria-label', Object.prototype.hasOwnProperty.call(labels, k) ? labels[k] : '칸 수정');
    });
    // 행·열 손잡이 이름도 이름 칸을 고친 대로 맞춘다(안내 문구의 이름과 같은 글자).
    Array.prototype.forEach.call(sec.querySelectorAll('.bd-handle'), function (h) {
      h.setAttribute('aria-label', board.rcHandleLabel(tb, h.getAttribute('data-kind'), parseInt(h.getAttribute('data-idx'), 10)));
    });
  }
  function onBodyInput(e) {
    if (mode !== 'edit' || !edit) return;
    const t = e.target;
    let ti = -1;   // 라벨을 다시 맞출 표 순번
    if (t.id === 'bd-name') edit = board.editSetName(edit, t.value);
    else if (t.hasAttribute && t.hasAttribute('data-title')) {
      ti = parseInt(t.getAttribute('data-title'), 10);
      edit = board.editSetTitle(edit, ti, t.value);
    } else if (t.hasAttribute && t.hasAttribute('data-key')) {
      const sec = t.closest('section[data-i]');
      if (!sec) return;
      ti = parseInt(sec.getAttribute('data-i'), 10);
      edit = board.editSetCell(edit, ti, t.getAttribute('data-key'), t.value);
    } else return;
    refreshStatus();
    if (ti >= 0) relabel(ti);
  }

  function onControlsClick(e) {
    const b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b || b.disabled) return;
    const act = b.getAttribute('data-act');
    if (act === 'docx') onDocx();
    else if (act === 'edit') startEdit();
    else if (act === 'write') startWrite();
    else if (act === 'copy') {
      copyUi = { name: str(current && current.form.name) + ' 사본', error: '', busy: false };
      renderActions();
      focusFirst(['#bd-copyname']);
    } else if (act === 'copycancel') { copyUi = null; renderActions(); focusFirst(['#bd-copy']); }
    else if (act === 'copyok') onCopyOk();
  }
  // 복제 이름 입력을 상태에 반영한다(목록 갱신 등으로 버튼 줄이 다시 그려져도 입력값이 초기값으로 돌아가지 않게).
  function onControlsInput(e) {
    const t = e.target;
    if (t && t.id === 'bd-copyname' && copyUi) copyUi = Object.assign({}, copyUi, { name: t.value });
  }

  board.mount = function () {
    const sel = el('bd-form');
    if (sel) {
      // 이미 그렸으면 선택값을 날리지 않는다. 계정이 바뀌었으면 상태를 버리고 다시 그린다.
      if (whoNow() !== who) { board.onProfileChange(); return; }
      refreshForms(current ? current.id : sel.value);   // 다른 곳에서 만든 양식·권한 변화를 반영
      return;
    }
    who = whoNow();
    mounted = true;
    el('bd-controls').innerHTML =
      '<label>양식 <select id="bd-form">' + board.formOptionsHtml([], '') + '</select></label>' +
      '<span id="bd-actions" class="bd-actions"></span>' +
      '<span id="bd-msg" role="status" aria-live="polite"></span>';
    el('bd-form').onchange = onSelect;
    el('bd-controls').onclick = onControlsClick;
    el('bd-controls').oninput = onControlsInput;
    el('bd-body').onclick = onBodyClick;
    el('bd-body').oninput = onBodyInput;
    el('bd-body').onkeydown = onBodyKey;
    // 같은 함수 참조라 mount가 다시 불려도 중복 등록되지 않는다.
    el('bd-body').addEventListener('scroll', onBodyScroll, true);
    el('bd-body').addEventListener('mouseover', onHandleOn);
    el('bd-body').addEventListener('focusin', onHandleOn);
    el('bd-body').addEventListener('mouseout', onHandleOff);
    el('bd-body').addEventListener('focusout', onHandleOff);
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', onWinResize);
    const wcl = writeCtl(); if (wcl) wcl.attach();
    renderActions();
    showState({ status: 'idle' });
    refreshForms('');
  };
  // 계정(프로필)이 바뀌면 이전 계정의 목록·권한·편집 중 내용을 버린다(app.js onProfileChanged에서 부른다).
  // 화면이 보이고 있으면 새 계정으로 다시 그린다. 로그아웃(k==='')이면 비워 두기만 한다.
  board.onProfileChange = function () {
    const k = whoNow();
    if (k === who) return;
    who = k;
    resetState();
    const r = el('bd-root');
    const plan = board.profilePlan(mounted, k, !!(r && r.style.display !== 'none'));
    if (plan === 'none') return;
    const c = el('bd-controls'), b = el('bd-body');
    if (c) c.innerHTML = '';
    if (b) b.innerHTML = '';
    if (plan === 'redraw') board.mount();   // #bd-form이 사라졌으므로 처음부터 다시 그린다
  };
  board.unmount = function () { /* 폴링·스트림 없음 */ };

  if (typeof module !== 'undefined' && module.exports) module.exports = board;
  else root.board = board;
})(typeof self !== 'undefined' ? self : this);
