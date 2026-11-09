(function (root) {
  'use strict';
  // 이사회 자료 '작성 모드'(NEXT 37) — 엑셀을 올려 양식의 값 칸을 채우고, [수익성 분석표 보기] 팝업의 원본과 대조해 표마다 확인한다.
  // 순수 함수(검증·숫자 파싱·상태 집계·HTML)와 DOM 배선(createController)을 한 파일에 둔다. board.js가 불러 쓴다.
  // 원본 엑셀·원래 값(raw)·확인·수정 표시는 이 화면의 메모리에만 둔다. 브라우저 저장소·초안 요청 본문에 넣지 않는다.
  // 브라우저 확인창 함수는 쓰지 않는다(테스트가 소스 문자열을 검사한다). 확인은 인라인 확인 줄로 한다.
  const logic = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./logic.js') : root.logic;
  const bw = {};

  const DEFAULT_MAX_MB = 5;
  const MAX_CELL = 100;
  const MINUS = '−';
  const ALIGNS = { left: 1, center: 1, right: 1 };
  // 서버(BoardDocSpec.clean)와 같은 규칙: 제어문자·U+2028/2029·U+FFFE/FFFF 거부
  const CTRL_RE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f' + String.fromCharCode(0x2028, 0x2029, 0xfffe, 0xffff) + ']');
  const DROP_TITLE = '수익성 분석 엑셀을 올려 주세요';

  function str(v) { return v == null ? '' : String(v); }
  function esc(s) {
    if (logic && logic.esc) return logic.esc(str(s));
    return str(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function span(v) { const n = parseInt(v, 10); return n > 1 && n <= 100 ? n : 1; }
  function icon(name) { return (root.render && root.render.ICONS && root.render.ICONS[name]) || ''; }
  let labeler = function () { return ''; };
  // board.cellLabel(t, r, ci) 주입 — "<표 제목> · <행 머리> · <열 머리>"
  bw.setLabeler = function (fn) { if (typeof fn === 'function') labeler = fn; };

  // ── 숫자: 서버 BoardExcelFill.shownNum과 같은 규칙 ─────────────────
  const B = typeof BigInt === 'function' ? BigInt : null;
  const NUM_RE = /^([-+]?)(\d{1,30})(?:\.(\d{1,15}))?$/;
  let UNIT = null;
  function unit() { return UNIT || (UNIT = B('1000000000000000')); }
  bw.shownNum = function (s) {
    if (!B || s == null) return null;
    // 서버 Java \s 와 같게 ASCII 공백만 제거(NBSP·전각 공백은 남아 정규식에서 탈락). trim() 도 쓰지 않는다.
    let t = String(s).replace(/[,\x20\t\r\n\f\v]/g, '');
    if (t === '') return null;
    let neg = false;
    if (t.length > 2 && t.charAt(0) === '(' && t.charAt(t.length - 1) === ')') { neg = true; t = t.slice(1, -1); }
    else if (t.length > 1 && (t.charAt(0) === '△' || t.charAt(0) === '▲')) { neg = true; t = t.slice(1); }
    const m = NUM_RE.exec(t);
    if (!m || (neg && m[1] !== '')) return null; // 괄호·△·▲ 안쪽 부호는 이중 부호라 모호
    let v = B(m[2]) * unit() + B((m[3] || '').padEnd(15, '0'));
    if (m[1] === '-') v = -v;
    return neg ? -v : v;
  };
  function group(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  bw.fmtScaled = function (v) {
    const neg = v < B(0);
    const a = neg ? -v : v;
    const fp = String(a % unit()).padStart(15, '0').replace(/0+$/, '');
    return (neg ? '-' : '') + group(String(a / unit())) + (fp ? '.' + fp : '');
  };
  function signed(v) {
    if (v === B(0)) return '0';
    return (v < B(0) ? MINUS : '+') + bw.fmtScaled(v < B(0) ? -v : v);
  }
  // 합계 칸 표시값 − 구성 칸 표시값 합. 하나라도 숫자로 못 읽으면 null(검산 생략, 침묵).
  bw.checkSum = function (totalText, partTexts) {
    if (!B) return null;
    const tot = bw.shownNum(totalText);
    if (tot == null || !Array.isArray(partTexts) || !partTexts.length) return null;
    let acc = B(0);
    for (let i = 0; i < partTexts.length; i++) {
      const n = bw.shownNum(partTexts[i]);
      if (n == null) return null;
      acc += n;
    }
    const d = tot - acc;
    return { expected: bw.fmtScaled(acc), actual: bw.fmtScaled(tot), diff: signed(d), zero: d === B(0) };
  };
  // 서버 SUM_MISMATCH 경고({expected,actual,diff} 문자열) → 같은 모양. 차이는 서버 문자열 대신 다시 계산한다.
  bw.serverSum = function (w) {
    const e = bw.shownNum(w && w.expected), a = bw.shownNum(w && w.actual);
    if (e != null && a != null) {
      const d = a - e;
      return { expected: bw.fmtScaled(e), actual: bw.fmtScaled(a), diff: signed(d), zero: d === B(0) };
    }
    return { expected: str(w && w.expected), actual: str(w && w.actual), diff: str(w && w.diff), zero: false };
  };

  // ── URL·파일 검사·서버 호출 ───────────────────────────────────
  bw.excelMapUrl = function () { return '/board-forms/excel-map'; };
  bw.uploadUrl = function (id) { return '/board-forms/' + encodeURIComponent(id) + '/excel'; };
  bw.draftUrl = function (id) { return '/board-forms/' + encodeURIComponent(id) + '/draft-docx'; };
  bw.isBase = function (id) { return str(id) === 'default_doc'; };

  // 올리기 전 검사(서버도 다시 검사한다). → null | {code, message}
  bw.checkFile = function (file, maxMb) {
    const max = maxMb > 0 ? maxMb : DEFAULT_MAX_MB;
    const name = str(file && file.name).toLowerCase();
    if (!file) return { code: 'EMPTY_FILE', message: '엑셀(.xlsx) 파일을 골라 주세요.' };
    if (name.slice(-5) === '.xlsm') return { code: 'MACRO', message: '' };
    if (name.slice(-5) !== '.xlsx') return { code: 'NOT_XLSX', message: '' };
    if (!(file.size > 0)) return { code: 'EMPTY_FILE', message: '' };
    if (file.size > max * 1024 * 1024) return { code: 'FILE_TOO_LARGE', message: '', max_mb: max };
    return null;
  };

  function detailOf(body) { const d = body && body.detail; return (d && typeof d === 'object') ? d : null; }
  function kindsText(kinds) {
    return (Array.isArray(kinds) ? kinds : []).map(function (k) { return str(k && k.kind) + ' 형식 ' + (k && k.count) + '건'; }).join(' · ');
  }
  // 업로드 실패 → 화면에 그릴 거부 상자 내용. 작성 API는 모두 detail 객체 {code,message}이다(문자열 분기 없음).
  // res: {status, body, net}. ctx: {formName, maxMb}
  bw.rejectFrom = function (res, ctx) {
    const c = ctx || {};
    const status = res ? res.status : 0;
    const d = detailOf(res && res.body);
    const code = d && typeof d.code === 'string' ? d.code : '';
    const msg = d && typeof d.message === 'string' ? d.message : '';
    const r = { code: code || ('HTTP_' + status), title: '', lines: [], kindsText: '', hint: '', structure: false, canPick: true, canReform: false, canPerm: false };
    if (res && res.net) { r.code = 'NET'; r.title = '서버에 연결하지 못했습니다.'; r.hint = '잠시 뒤 다시 올려 주세요.'; return r; }
    if (code === 'MACRO') {
      r.title = '매크로가 들어 있는 파일은 받지 않습니다.'; r.hint = '매크로 없는 .xlsx로 다시 저장해 올려 주세요.';
    } else if (code === 'NOT_XLSX' || status === 415) {
      const fn = str(c.fileName).toLowerCase();
      if (fn.slice(-5) === '.xlsx') {
        // 이름은 .xlsx 인데 서버가 엑셀로 읽지 못한 경우(깨진 파일·다른 형식을 이름만 바꾼 파일·암호 파일)
        r.title = '파일이 깨졌거나 엑셀(.xlsx) 형식이 아닙니다.';
        r.hint = '엑셀에서 파일이 열리는지 확인하고 .xlsx 로 다시 저장해 올려 주세요. 암호가 걸린 파일은 암호를 풀고 저장해 주세요.';
      } else if (fn) {
        // 확장자 오류(.xls·.csv·.md 등): 암호 안내는 붙이지 않는다. .xlsm 은 매크로 안내(MACRO)로 따로 거부한다.
        r.title = '엑셀(.xlsx) 파일만 올릴 수 있습니다.';
        r.hint = '.xls·.csv 같은 파일은 엑셀에서 .xlsx 로 저장해 올려 주세요. 매크로가 든 .xlsm 은 받지 않습니다.';
      } else {
        r.title = '엑셀(.xlsx) 파일만 올릴 수 있습니다.'; r.hint = '파일이 깨졌거나 암호가 걸려 있으면 엑셀에서 .xlsx 로 다시 저장해 주세요.';
      }
    } else if (code === 'FILE_TOO_LARGE' || status === 413) {
      const mb = (d && d.max_mb > 0 ? d.max_mb : 0) || c.maxMb || DEFAULT_MAX_MB;
      r.title = '파일이 너무 큽니다(최대 ' + mb + 'MB).'; r.hint = '필요한 시트만 남겨 다시 저장해 올려 주세요.';
    } else if (status === 411) {
      r.title = '파일 크기를 확인하지 못했습니다.'; r.hint = '파일을 다시 골라 올려 주세요.';
    } else if (code === 'EMPTY_FILE') {
      r.title = '빈 파일입니다.'; r.hint = '엑셀(.xlsx) 파일을 골라 주세요.';
    } else if (code === 'PII_DETECTED') {
      r.title = '개인정보로 보이는 값이 있어 이 파일을 받지 않았습니다.';
      r.kindsText = kindsText(d.kinds);
      if (d.count > 0) r.lines.push('해당하는 칸 ' + d.count + '곳');
      r.hint = '해당 값을 지우거나 가린 사본을 다시 올려 주세요. 파일은 저장되지 않았습니다.';
    } else if (code === 'STRUCTURE_MISMATCH') {
      r.structure = true;
      r.title = '이 엑셀은 ‘' + str(c.formName) + '’과 구조가 달라 값을 채우지 않았습니다.';
      const seen = {};
      (Array.isArray(d.reasons) ? d.reasons : []).forEach(function (x) {
        let line = '';
        if (x && x.code === 'SHEET_MISSING') line = '‘' + str(x.sheet) + '’ 시트를 찾지 못했습니다.';
        else if (x && x.code === 'LABEL_MISMATCH') line = '‘' + str(x.ref) + '’ 표의 머리글이 다릅니다: 양식 ‘' + str(x.expected) + '’, 파일 ‘' + str(x.actual) + '’';
        if (line && !seen[line]) { seen[line] = 1; r.lines.push(line); }
      });
      r.hint = '시트 이름이 같은 엑셀인지 확인해 주세요.';
    } else {
      // detail이 없거나 문자열(Spring 기본 본문 등)이면 상태 코드로 일반 문구를 쓴다(문자열 본문은 화면에 내지 않는다).
      // 403은 서버 문구보다 우선해 '권한 신청' 안내로 고정한다(다른 계정 로그인 안내가 아니라 신청 경로를 보여 준다).
      if (status === 403) { r.title = '이 양식으로 자료를 작성하려면 업무 수정 권한이 필요합니다.'; r.hint = '내 정보의 내 권한에서 권한을 신청하면, 승인 후 이어서 작성할 수 있습니다.'; }
      else if (msg) r.title = msg;
      else if (status === 401) { r.title = '로그인이 필요합니다.'; r.hint = '다시 로그인한 뒤 올려 주세요.'; }
      else if (status === 404) { r.title = '양식을 찾지 못했습니다.'; r.hint = '양식을 다시 골라 주세요.'; }
      else { r.title = '엑셀을 처리하지 못했습니다.'; r.hint = '파일을 다시 골라 올려 주세요.'; }
      if (status === 503 || status >= 500) r.hint = '잠시 뒤 다시 올려 주세요.';
    }
    // 버튼: 구조 불일치와 404(양식 없음)는 양식을 다시 고르게 하고, 403은 같은 파일을 다시 올려도 소용없어 파일 고르기를 뺀다.
    r.canReform = r.structure || status === 404;
    if (status === 403) { r.canPick = false; r.canPerm = true; }
    return r;
  };

  function reqJson(fetchFn, url, init) {
    return fetchFn(url, init).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) { return { ok: r.ok, status: r.status, body: body }; });
    }).catch(function (e) { return { ok: false, status: 0, body: null, net: true, aborted: !!(e && e.name === 'AbortError') }; });
  }
  // multipart: file(+version, 기본 양식은 version을 보내지 않는다 — 서버가 400)
  bw.upload = function (fetchFn, id, version, file, signal) {
    const fd = new FormData();
    fd.append('file', file);
    if (!bw.isBase(id) && version != null && version !== '') fd.append('version', String(version));
    const init = { method: 'POST', body: fd };
    if (signal) init.signal = signal;
    return reqJson(fetchFn, bw.uploadUrl(id), init);
  };
  // GET /board-forms/excel-map: 빈 상태의 '채워질 표'·크기 한도용. 실패해도 작성은 막지 않는다.
  bw.loadMap = function (fetchFn) {
    return reqJson(fetchFn, bw.excelMapUrl()).then(function (x) {
      const b = x.body;
      if (!x.ok || !b || !Array.isArray(b.tables)) return { ok: false, maxMb: DEFAULT_MAX_MB, tables: [] };
      return { ok: true, maxMb: b.max_mb > 0 ? b.max_mb : DEFAULT_MAX_MB, tables: b.tables.map(function (t) { return str(t && t.ref); }) };
    });
  };
  bw.mapListText = function (formTables, refs) {
    const set = {};
    (refs || []).forEach(function (r) { set[r] = 1; });
    const names = (formTables || []).filter(function (t) { return set[tableRef(t)]; }).map(function (t) {
      return [str(t.mapping || tableRef(t)), str(t.title)].filter(Boolean).join(' ');
    });
    return names.length ? '채워질 표: ' + names.join(' · ') : '';
  };

  // 초안 워드 요청 본문: 값만(매핑 칸의 화면 현재 값). raw·원래 값·사유·확인 상태는 넣지 않는다.
  bw.draftBody = function (ws, version) {
    const body = {};
    if (version != null && version !== '' && isFinite(Number(version))) body.version = Number(version);
    body.tables = ws.tables.filter(function (t) { return t.mapped; }).map(function (t) {
      const cells = {};
      t.order.forEach(function (k) { cells[k] = str(t.cells[k].value).trim(); });
      return { ref: t.ref, cells: cells };
    });
    return body;
  };
  bw.fetchDraft = function (fetchFn, id, body) {
    return fetchFn(bw.draftUrl(id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        if (r.ok) return r.blob().then(function (blob) { return { ok: true, blob: blob }; });
        return r.json().catch(function () { return null; }).then(function (b) { return { ok: false, status: r.status, body: b }; });
      }).catch(function () { return { ok: false, status: 0, body: null, net: true }; });
  };
  bw.draftErrorText = function (res) {
    if (res && res.net) return '서버에 연결하지 못했습니다. 잠시 뒤 다시 눌러 주세요.';
    const d = detailOf(res && res.body);
    const code = d && d.code;
    const msg = d && typeof d.message === 'string' ? d.message : '';
    if (code === 'PII_DETECTED') {
      return '개인정보로 보이는 값이 있어 초안을 만들지 않았습니다. ' + kindsText(d.kinds) + ' 해당 칸을 고친 뒤 다시 눌러 주세요.';
    }
    if (msg && (code === 'UNAUTHENTICATED' || code === 'FORBIDDEN' || code === 'BAD_VALUE' || code === 'BAD_REQUEST' || code === 'NOT_FOUND')) return msg;
    return '초안 워드를 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요.';
  };
  bw.draftFileName = function (name) { return (str(name).replace(/[\\/:*?"<>|]/g, '_').trim() || 'board') + '_초안.docx'; };
  function tname(t) { return str(t.title || t.mapping || t.ref); }
  // 값 칸이 있는데 아직 '이 표 확인'을 하지 않은 표(초안은 막지 않고 알리기만 한다)
  bw.uncheckedTables = function (ws) {
    return ws ? ws.tables.filter(function (t) { return t.order.length > 0 && !t.checked; }) : [];
  };
  bw.draftDoneText = function (ws) {
    const u = bw.uncheckedTables(ws);
    return '초안 워드를 내려받았습니다.' + (u.length ? ' 확인하지 않은 표 ' + u.length + '개(' + u.map(tname).join(', ') + ')가 있는 상태로 초안을 만들었습니다.' : '');
  };
  // 받침 판정(조사용): 한글이면 종성 번호(0=받침 없음), 숫자는 읽는 소리의 받침, 그 밖은 받침 없음.
  const DIGIT_JONG = { '0': 21, '1': 8, '2': 0, '3': 16, '4': 0, '5': 0, '6': 1, '7': 8, '8': 8, '9': 0 };
  function jong(s) {
    const w = str(s), ch = w.charAt(w.length - 1), code = ch ? ch.charCodeAt(0) : 0;
    if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28;
    return has(DIGIT_JONG, ch) ? DIGIT_JONG[ch] : 0;
  }
  bw.josaEul = function (w) { return jong(w) > 0 ? '을' : '를'; };
  bw.josaEuro = function (w) { const j = jong(w); return (j > 0 && j !== 8) ? '으로' : '로'; };

  // ── 상태 모델(순수·불변) ─────────────────────────────────────
  function tableRef(t) { return str(t && (t.ref != null ? t.ref : t.id)); }
  function findT(ws, ref) {
    for (let i = 0; i < ws.tables.length; i++) if (ws.tables[i].ref === ref) return ws.tables[i];
    return null;
  }
  bw.findT = findT;
  function eachCell(ws, fn) { ws.tables.forEach(function (t) { t.order.forEach(function (k) { fn(t, t.cells[k]); }); }); }
  function posIn(rows, key) {
    for (let r = 0; r < rows.length; r++) {
      const row = Array.isArray(rows[r]) ? rows[r] : [];
      for (let ci = 0; ci < row.length; ci++) {
        if (row[ci] && typeof row[ci] === 'object' && str(row[ci].key) === key) return { r: r, ci: ci };
      }
    }
    return null;
  }
  bw.parseRef = function (ref) {
    const m = /^([A-Za-z]{1,3})(\d{1,7})$/.exec(str(ref).replace(/\$/g, ''));
    return m ? { letters: m[1].toUpperCase(), row: parseInt(m[2], 10) } : null;
  };
  // 원본 격자(sources[]) 안의 위치 {r, c}. 범위 밖이면 null.
  bw.gridPos = function (grid, ref) {
    const p = bw.parseRef(ref);
    if (!p || !grid || !Array.isArray(grid.cols) || !Array.isArray(grid.rows)) return null;
    const c = grid.cols.indexOf(p.letters), r = p.row - Number(grid.first_row);
    return (c >= 0 && r >= 0 && r < grid.rows.length) ? { r: r, c: c } : null;
  };

  function normParts(a) {
    return (Array.isArray(a) ? a : []).filter(function (p) { return p && typeof p === 'object'; }).map(function (p) {
      return { role: p.role === 'sub' ? 'sub' : 'main', sheet: str(p.sheet), cell: str(p.cell), display: str(p.display),
               raw: p.raw == null ? null : str(p.raw), rounded: p.rounded === true ? true : (p.rounded === false ? false : null) };
    });
  }
  function normConvert(cv) {
    if (!cv || typeof cv !== 'object') return null;
    const n = function (v) { return v == null ? null : str(v); };
    return { kind: str(cv.kind), unit_from: str(cv.unit_from), unit_to: str(cv.unit_to), divisor: n(cv.divisor), sum: n(cv.sum),
             sub_sum: n(cv.sub_sum), of: Array.isArray(cv.of) ? cv.of.map(str) : [], result: n(cv.result) };
  }

  // form: 지금 보는 양식(board의 current.form), resp: 업로드 응답, o: {fileName, formId, version}
  bw.buildState = function (form, resp, o) {
    const opt = o || {};
    const fts = (form && Array.isArray(form.tables)) ? form.tables : [];
    const rts = {}, srcs = {};
    (Array.isArray(resp && resp.tables) ? resp.tables : []).forEach(function (t) { rts[str(t.ref)] = t; });
    (Array.isArray(resp && resp.sources) ? resp.sources : []).forEach(function (s) { srcs[str(s.ref)] = s; });
    const tables = fts.map(function (ft) {
      const ref = tableRef(ft);
      const rows = Array.isArray(ft.rows) ? ft.rows : [];
      const rt = rts[ref] || null;
      const t = {
        ref: ref, mapping: str(ft.mapping), title: str(ft.title), rows: rows,
        columns: Array.isArray(ft.columns) ? ft.columns : [], notes: Array.isArray(ft.notes) ? ft.notes : [],
        checked: null, relNote: null,   // 표 단위 확인: {who, at} | null. relNote: 값을 고쳐 확인이 풀린 표의 안내 {label, from, to}
        mapped: !!rt, needsReview: !!(rt && rt.needs_review === true),
        labelState: rt ? (rt.label_state === 'failed' ? 'failed' : (rt.needs_review === true ? 'partial' : 'ok')) : 'ok',
        mismatches: (rt && Array.isArray(rt.label_mismatches)) ? rt.label_mismatches : [],
        sums: [], order: [], cells: {}, grid: srcs[ref] || null, srcIndex: {}
      };
      if (rt) {
        // 합계 관계(서버 계약). 없으면 서버가 알려 준 불일치만 쓰고 재검산은 하지 않는다.
        (Array.isArray(rt.sums) ? rt.sums : []).forEach(function (s) {
          if (s && s.total != null && Array.isArray(s.of)) t.sums.push({ total: str(s.total), of: s.of.map(str) });
        });
        (Array.isArray(rt.cells) ? rt.cells : []).forEach(function (rc) {
          const key = str(rc.key), value = str(rc.value);
          // source.sheet 가 null 이면(출처 없는 칸: 직접 입력·합계) 출처 없음으로 본다.
          const s = (rc.source && typeof rc.source === 'object' && rc.source.sheet != null) ? rc.source : null;
          const manual = rc.status === 'manual' || rc.manual === true;
          const parts = normParts(rc.parts);
          const pc = Number(rc.part_count);
          const pos = posIn(rows, key);
          const warns = [];
          let serverSum = null;
          (Array.isArray(rc.warnings) ? rc.warnings : []).forEach(function (w) {
            const code = str(w && w.code);
            if (code === 'SUM_MISMATCH') serverSum = bw.serverSum(w); else if (code) warns.push(code);
          });
          t.cells[key] = {
            key: key, value: value, orig: value,
            status: manual ? 'manual' : (rc.status === 'failed' ? 'failed' : (rc.status === 'review' ? 'review' : 'filled')), reason: str(rc.reason),
            manual: manual, parts: parts, partCount: (isFinite(pc) && pc >= 0) ? Math.max(pc, parts.length) : parts.length,
            convert: normConvert(rc.convert), mainValue: rc.main_value == null ? null : str(rc.main_value),
            subValue: rc.sub_value == null ? null : str(rc.sub_value),
            src: s ? { sheet: str(s.sheet), cell: str(s.cell), display: str(s.display),
                       raw: s.raw == null ? null : str(s.raw), rounded: s.rounded === true ? true : (s.rounded === false ? false : null) } : null,
            warns: warns, serverSum: serverSum,
            label: pos ? str(labeler({ title: ft.title, rows: rows, columns: t.columns, cells: {} }, pos.r, pos.ci)) : '',
            asked: false, why: '', memo: '', whyAsked: false
          };
          t.order.push(key);
          if (t.grid && s) { const gp = bw.gridPos(t.grid, s.cell); if (gp) t.srcIndex[gp.r + ',' + gp.c] = key; }
          // 여러 원본 칸을 더한 칸(parts)은 부품 칸도 같은 양식 칸의 원본으로 등록한다(원본 패널에서 모두 강조).
          // 다른 시트의 부품은 이 표의 원본 격자에 없으므로 건너뛴다. 이미 다른 칸이 차지한 자리는 덮지 않는다.
          if (t.grid) {
            parts.forEach(function (pt) {
              if (pt.sheet !== '' && str(t.grid.sheet) !== '' && pt.sheet !== str(t.grid.sheet)) return;
              const pp = bw.gridPos(t.grid, pt.cell);
              if (pp && t.srcIndex[pp.r + ',' + pp.c] == null) t.srcIndex[pp.r + ',' + pp.c] = key;
            });
          }
        });
        // 새로 넣은 행·열의 값 칸(양식 칸 input:true·mapped:false, 서버 cells 에 없음): 작성할 때 직접 입력하는 칸으로 만든다.
        // 기관명 같은 서버 직접 입력 칸(status manual)과 같은 칸 모양이라 렌더·검증·복사·초안 본문·합계 재검산을 그대로 쓴다.
        // 처음 값은 공란(0으로 치지 않는다). 글자가 이미 있는 예시 값 칸은 건드리지 않는다.
        rows.forEach(function (row, r) {
          (Array.isArray(row) ? row : []).forEach(function (fc, ci) {
            if (!fc || typeof fc !== 'object' || fc.input !== true || fc.mapped === true || str(fc.text) !== '') return;
            const key = str(fc.key);
            if (key === '' || has(t.cells, key)) return;
            t.cells[key] = {
              key: key, value: '', orig: '', status: 'manual', reason: '', manual: true, parts: [], partCount: 0,
              convert: null, mainValue: null, subValue: null, src: null, warns: [], serverSum: null,
              label: str(labeler({ title: ft.title, rows: rows, columns: t.columns, cells: {} }, r, ci)),
              asked: false, why: '', memo: '', whyAsked: false
            };
            t.order.push(key);
          });
        });
      }
      return t;
    });
    return {
      formId: str(opt.formId), version: opt.version, name: str(form && form.name), fileName: str(opt.fileName),
      tables: tables, warnings: Array.isArray(resp && resp.warnings) ? resp.warnings : [],
      assumptions: Array.isArray(resp && resp.assumptions) ? resp.assumptions : [],
      unmapped: Array.isArray(resp && resp.unmapped_tables) ? resp.unmapped_tables : [], filter: 'all', done: null
    };
  };

  bw.patchCell = function (ws, ref, key, patch) {
    const ti = ws.tables.findIndex(function (t) { return t.ref === ref; });
    if (ti < 0 || !ws.tables[ti].cells[key]) return ws;
    const t = ws.tables[ti];
    const cells = Object.assign({}, t.cells);
    cells[key] = Object.assign({}, t.cells[key], patch);
    const tables = ws.tables.slice();
    tables[ti] = Object.assign({}, t, { cells: cells });
    return Object.assign({}, ws, { tables: tables });
  };
  bw.patchTable = function (ws, ref, patch) {
    const ti = ws.tables.findIndex(function (t) { return t.ref === ref; });
    if (ti < 0) return ws;
    const tables = ws.tables.slice();
    tables[ti] = Object.assign({}, ws.tables[ti], patch);
    return Object.assign({}, ws, { tables: tables });
  };

  // 합계 칸의 현재 검산 결과 → null | {expected, actual, diff, zero}. 합계 칸이 아니면 null.
  bw.sumState = function (t, key) {
    const c = t.cells[key];
    for (let i = 0; i < t.sums.length; i++) if (t.sums[i].total === key) return bw.liveSum(t, t.sums[i]);
    if (t.sums.length) return null;   // 합계 관계를 아는 표에서 합계 칸이 아니면 검산 대상이 아니다
    return c && c.serverSum ? c.serverSum : null;
  };

  const REASON = {
    EMPTY: '엑셀 칸이 비어 있습니다. 값을 직접 넣은 뒤 확인해 주세요.',
    TOO_LONG: '값이 100자를 넘어 가져오지 못했습니다. 값을 직접 넣어 주세요.',
    NO_CACHED_VALUE: '수식의 계산 결과가 파일에 저장돼 있지 않습니다. 엑셀에서 한 번 저장한 뒤 다시 올리거나 직접 입력하세요.',
    EXCEL_ERROR: '엑셀 칸에 오류 값이 들어 있습니다. 엑셀에서 고친 뒤 다시 올리거나 직접 입력하세요.',
    LABEL_MISMATCH: '표 머리글이 양식과 많이 달라 값을 채우지 않았습니다. 원본 시트를 보고 직접 입력하거나 올바른 엑셀을 다시 올려 주세요.',
    PART_EMPTY: '엑셀의 해당 칸이 비어 있어 값을 채우지 않았습니다. 빈 칸은 0으로 계산하지 않습니다. 0이면 엑셀에 0을 넣어 다시 올리거나 여기서 직접 입력하세요.',
    PART_FAILED: '합계에 들어가는 칸 중 값을 못 채운 칸이 있어 합계를 계산하지 않았습니다. 그 칸을 채우거나 합계를 직접 입력하세요.',
    NOT_NUMERIC: '엑셀 칸의 값을 숫자로 읽지 못했습니다. 엑셀에서 숫자로 고쳐 다시 올리거나 직접 입력하세요.',
    NOT_FOUND: '엑셀에서 이 칸의 행·열을 찾지 못했습니다. 시트 구조가 양식과 같은지 확인한 뒤 다시 올리거나 직접 입력하세요.',
    GENERAL: '엑셀에서 값을 읽지 못했습니다. 직접 입력해 주세요.'
  };
  // 사유 코드 → 문구. ROW_/AREA_/HEADER_/COL_ 계열은 한 문구, 모르는 코드는 일반 문구.
  bw.reasonText = function (code) {
    const k = str(code);
    if (has(REASON, k) && k !== 'NOT_FOUND' && k !== 'GENERAL') return REASON[k];
    if (/^(ROW|AREA|HEADER|COL)_/.test(k)) return REASON.NOT_FOUND;
    return REASON.GENERAL;
  };
  const WARN = {
    TEXT_NUMBER: '엑셀에서 글자로 저장된 숫자입니다. 값이 맞는지 확인해 주세요.',
    EXTERNAL_REF: '다른 파일을 참조하는 수식의 값입니다. 값은 파일에 저장된 마지막 값입니다.',
    UNIT_MISMATCH: '엑셀 표 제목의 단위가 양식에서 정한 단위와 다릅니다. 환산한 값을 확인해 주세요.',
    UNIT_UNKNOWN: '엑셀 표 제목에서 단위를 찾지 못했습니다. 환산한 값이 맞는지 확인해 주세요.',
    HIDDEN_SHEET: '숨겨진 시트의 값입니다.', HIDDEN_ROW: '숨겨진 행의 값입니다.', HIDDEN_COLUMN: '숨겨진 열의 값입니다.',
    HIDDEN_FORMAT: '엑셀 화면에서는 서식으로 가려져 보이지 않는 값입니다. 문서에 넣어도 되는지 확인해 주세요. (글꼴 색 등 서식 밖의 숨김은 검사하지 않습니다.)',
    LABEL_MISMATCH: '이 표의 머리글이 양식과 달라 위치대로 채웠습니다.',
    SUM_HAS_MANUAL_PARTS: '합계 범위 안에 엑셀에서 가져오지 않는 칸(직접 입력)이 있어 합계가 엑셀 값과 다를 수 있습니다. 직접 입력한 값을 확인해 주세요.'
  };

  bw.cellInfo = function (t, c) {
    const unreadable = c.status === 'failed' && c.value.trim() === '';
    const edited = !c.manual && c.value.trim() !== c.orig.trim();   // 직접 입력 칸은 원본이 없어 수정으로 세지 않는다
    const sum = bw.sumState(t, c.key);
    const sumBad = !!(sum && !sum.zero);
    return {
      unreadable: unreadable, review: c.status === 'review', edited: edited, hasOrig: c.orig.trim() !== '', sum: sum, sumBad: sumBad,
      hidden: c.warns.some(function (w) { return /^HIDDEN_/.test(w); }),
      need: unreadable || c.status === 'review' || c.warns.length > 0 || sumBad || t.needsReview
    };
  };
  bw.matches = function (ws, t, c) {
    const f = ws.filter;
    if (f === 'edited') return bw.cellInfo(t, c).edited;
    if (f === 'need') return bw.cellInfo(t, c).need;
    if (f === 'unchecked') return !t.checked;
    return true;
  };
  // m: 값 칸 수 · tm: 값 칸이 있는 표 수 · tn: 확인한 표 수 · tu: 확인 안 한 표 수
  bw.tally = function (ws) {
    const y = { m: 0, tm: 0, tn: 0, tu: 0, edited: 0, need: 0, filled: 0, failed: 0, review: 0, sumBad: 0, noReason: 0, hidden: 0, hiddenFmt: 0, empty: 0, manual: 0, sumManual: 0, reviewLabel: 0 };
    ws.tables.forEach(function (t) {
      if (!t.order.length) return;
      y.tm++;
      if (t.checked) y.tn++; else y.tu++;
    });
    eachCell(ws, function (t, c) {
      const i = bw.cellInfo(t, c);
      y.m++;
      if (c.manual) y.manual++;
      else if (c.status === 'failed') { y.failed++; if (c.reason === 'PART_EMPTY') y.empty++; }
      else if (c.status === 'review') {
        y.review++;
        // 확인이 필요한 까닭: 합계 범위의 직접 입력 칸 때문이면 머리글 불일치로 세지 않는다
        if (c.warns.indexOf('SUM_HAS_MANUAL_PARTS') < 0) y.reviewLabel++;
      } else y.filled++;
      if (c.warns.indexOf('SUM_HAS_MANUAL_PARTS') >= 0) y.sumManual++;
      if (i.edited) y.edited++;
      if (i.need) y.need++;
      if (i.sumBad) y.sumBad++;
      if (i.hidden) y.hidden++;
      if (c.warns.indexOf('HIDDEN_FORMAT') >= 0) y.hiddenFmt++;
      if (i.edited && i.hasOrig && !bw.reasonOk(c)) y.noReason++;
    });
    return y;
  };
  bw.hasWork = function (ws) {
    if (!ws) return false;
    const y = bw.tally(ws);
    return y.tn > 0 || y.edited > 0;
  };
  bw.selected = function (ws, sel) {
    if (!ws || !sel) return null;
    const t = findT(ws, sel.t), c = t && t.cells[sel.key];
    return c ? { t: t, c: c } : null;
  };
  bw.firstUnreadable = function (ws) {
    for (let i = 0; i < ws.tables.length; i++) {
      const t = ws.tables[i];
      for (let k = 0; k < t.order.length; k++) if (bw.cellInfo(t, t.cells[t.order[k]]).unreadable) return { t: t.ref, key: t.order[k] };
    }
    return null;
  };
  // 롤링 탭 정지 칸: 선택 칸(보이면) 아니면 첫 보이는 칸
  bw.roveKey = function (ws, sel) {
    const s = bw.selected(ws, sel);
    if (s && bw.matches(ws, s.t, s.c)) return { t: s.t.ref, key: s.c.key };
    for (let i = 0; i < ws.tables.length; i++) {
      const t = ws.tables[i];
      for (let k = 0; k < t.order.length; k++) if (bw.matches(ws, t, t.cells[t.order[k]])) return { t: t.ref, key: t.order[k] };
    }
    return null;
  };

  const FILTERS = [['all', '전체'], ['edited', '수정됨'], ['need', '확인 필요'], ['unchecked', '확인 안 한 표']];
  bw.setFilter = function (ws, f) {
    return FILTERS.some(function (x) { return x[0] === f; }) ? Object.assign({}, ws, { filter: f }) : ws;
  };
  // '검수 완료'(ws.done)는 값 칸이 있는 모든 표를 확인했을 때만 유지된다. 하나라도 풀리면 해제.
  bw.normalize = function (ws) {
    if (!ws.done) return ws;
    const y = bw.tally(ws);
    return (y.tm > 0 && y.tn === y.tm) ? ws : Object.assign({}, ws, { done: null });
  };
  // 표 하나의 확인을 켜고 끈다. 읽지 못한 칸·합계 차이가 있어도 확인할 수 있다(칩으로만 경고).
  // 모든 표가 확인되면 같은 순간 '검수 완료'(마지막 확인 시각)가 자동으로 붙는다.
  bw.toggleCheck = function (ws, ref, who, at) {
    const t = findT(ws, ref);
    if (!t || !t.order.length) return ws;
    const next = bw.patchTable(ws, ref, t.checked ? { checked: null } : { checked: { who: str(who), at: str(at) }, relNote: null });
    const y = bw.tally(next);
    return Object.assign({}, next, { done: (y.tm > 0 && y.tn === y.tm) ? { who: str(who), at: str(at) } : null });
  };
  bw.hhmm = function (d) {
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes());
  };
  bw.leaveText = function (kind, y) {
    const parts = [];
    if (y && y.tn > 0) parts.push('표 확인 ' + y.tn + '개');
    if (y && y.edited > 0) parts.push('수정 ' + y.edited + '칸');
    const what = parts.join(', ');
    const ga = jong(what) > 0 ? '이' : '가';
    if (kind === 'swap') return '새 엑셀로 바꾸면 ' + (what ? what + ga + ' 사라집니다.' : '지금 화면이 새로 채워집니다.');
    return (what ? what + ga + ' 사라집니다. ' : '') + '작성을 끝낼까요?';
  };

  // 주의 목록(요약 줄의 "주의 n건")
  bw.warnItems = function (ws) {
    const out = [];
    (ws.warnings || []).forEach(function (w) {
      if (w && w.code === 'EXTERNAL_LINK') out.push('다른 파일을 참조하는 연결이 있습니다. 값은 파일에 저장된 마지막 값입니다.');
      else if (w && w.code === 'PII_OUTSIDE_RANGE') out.push('작성에 쓰지 않는 칸에 개인정보로 보이는 값이 있습니다. 화면과 초안에는 가져오지 않았습니다.' + (w.count > 0 ? '(' + w.count + '칸)' : ''));
    });
    const nameOf = function (t) { return t.mapping || t.title; };
    const failed = ws.tables.filter(function (t) { return t.needsReview && t.labelState === 'failed'; });
    const partial = ws.tables.filter(function (t) { return t.needsReview && t.labelState !== 'failed'; });
    if (failed.length) out.push('머리글이 많이 달라 값을 채우지 않은 표가 ' + failed.length + '개 있습니다(' + failed.map(nameOf).join(', ') + ').');
    if (partial.length) out.push('머리글이 양식과 다른 표가 ' + partial.length + '개 있습니다(' + partial.map(nameOf).join(', ') + ').');
    const y = bw.tally(ws);
    const hs = y.hidden - y.hiddenFmt;
    if (hs > 0) out.push('숨겨진 시트·행·열에서 가져온 값이 ' + hs + '칸 있습니다.');
    if (y.hiddenFmt) out.push('엑셀 화면에서 서식으로 가려져 보이지 않는 값이 ' + y.hiddenFmt + '칸 있습니다.');
    if (y.sumBad) out.push('합계가 맞지 않는 곳이 ' + y.sumBad + '곳 있습니다.');
    if (y.sumManual) out.push('합계 범위 안에 엑셀에서 가져오지 않는 칸(직접 입력)이 있는 합계가 ' + y.sumManual + '칸 있습니다. 직접 입력한 값을 확인해 주세요.');
    // 단위를 지도에서 가정한 표: 단위별로 한 번만 알린다(확인된 단위는 알리지 않는다).
    const seenUnit = {};
    (ws.assumptions || []).forEach(function (a) {
      if (!a || a.code !== 'UNIT_ASSUMED' || a.confirmed === true) return;
      const u = str(a.unit);
      if (seenUnit[u]) return;
      seenUnit[u] = 1;
      out.push('엑셀 표의 단위를 ‘' + u + '’로 가정해 억원으로 환산했습니다. 엑셀 표의 단위가 맞는지 확인해 주세요.');
    });
    return out;
  };

  // ── 출처 정보(툴팁·상태 줄 공통 원천) ──────────────────────────
  const MAX_PART_LINES = 6;
  const ROUND_NOTE = ' (소수 둘째 자리에서 반올림)';
  function fmtPlain(s) {
    const m = /^(-?)(\d+)(\.\d+)?$/.exec(str(s));
    return m ? m[1] + group(m[2]) + (m[3] || '') : str(s);
  }
  function eokLine(prefix, sum, cv, result) {
    return prefix + '합 ' + fmtPlain(sum) + ' ' + cv.unit_from + ' ÷ ' + str(cv.divisor) + ' = ' + str(result) + ' ' + cv.unit_to + ROUND_NOTE;
  }
  // 환산 줄: 억원 환산(합 ÷ 나눔수), 괄호 병기(앞 값·괄호 안 두 줄), 표시값 합계.
  function convertLines(t, c) {
    const cv = c.convert;
    if (!cv) return [];
    if (cv.kind === 'display_sum') {
      // 서버 sums.of(직접 입력 칸 포함)가 있으면 그 개수를 따른다. 없으면 convert.of.
      let n = cv.of.length;
      for (let i = 0; i < t.sums.length; i++) if (t.sums[i].total === c.key) { n = t.sums[i].of.length; break; }
      return ['구성 칸 ' + n + '개의 표시값을 더한 합계입니다'];
    }
    if (cv.kind === 'eok') return [eokLine('', cv.sum, cv, cv.result != null ? cv.result : c.value)];
    if (cv.kind === 'eok_paren') {
      return [eokLine('앞 값 ', cv.sum, cv, c.mainValue != null ? c.mainValue : cv.result),
              eokLine('괄호 안 ', cv.sub_sum, cv, c.subValue != null ? c.subValue : '')];
    }
    return [];
  }
  bw.infoLines = function (t, c) {
    const i = bw.cellInfo(t, c), out = [];
    out.push({ k: 'path', text: c.label || ((t.mapping ? t.mapping + ' ' : '') + t.title) });
    const total = Math.max(c.partCount || 0, (c.parts || []).length);
    if (c.manual) {
      out.push({ k: 'place', text: '엑셀에서 가져오지 않고 직접 입력하는 칸입니다' });
    } else if (!c.src) {
      out.push({ k: 'place', text: '엑셀에서 가져오지 않은 칸입니다' });
    } else {
      out.push({ k: 'place', mono: true, text: c.src.sheet + ' 시트 ' + c.src.cell + (total > 1 ? ' 외 ' + (total - 1) + '칸' : '') });
      if (total <= 1 && c.src.display !== '') {
        let s = '표시 ' + c.src.display;
        if (c.src.raw != null && c.src.rounded === true) s += ' · 원래 값 ' + c.src.raw;   // rounded가 null(%·날짜 서식 등)이면 표시값만
        out.push({ k: 'shown', mono: true, text: s });
      }
    }
    if (total > 1) {
      c.parts.slice(0, MAX_PART_LINES).forEach(function (p) {
        let s = (p.role === 'sub' ? '괄호 안 ' : '') + p.sheet + ' ' + p.cell + ' · ' + (p.display !== '' ? '표시 ' + p.display : '표시 값 없음');
        if (p.display !== '' && p.raw != null && p.rounded === true) s += ' · 원래 값 ' + p.raw;
        out.push({ k: 'part', mono: true, text: s });
      });
      if (total > MAX_PART_LINES) out.push({ k: 'part', text: '그 밖에 ' + (total - MAX_PART_LINES) + '칸' });
    }
    convertLines(t, c).forEach(function (s) { out.push({ k: 'calc', text: s }); });
    if (i.edited) out.push({ k: 'note', text: '수정함 ' + c.value + (c.why ? ' · 사유 ' + bw.whyText(c) : '') });
    if (i.sumBad) out.push({ k: 'note', text: '표시 합 ' + i.sum.expected + ' · 합계 ' + i.sum.actual + ' · 차이 ' + i.sum.diff });
    if (i.unreadable) out.push({ k: 'note', text: (c.reason === 'PART_EMPTY' ? '비어 있음: ' : '읽지 못함: ') + bw.reasonText(c.reason) });
    c.warns.forEach(function (w) { if (WARN[w] && !(w === 'LABEL_MISMATCH' && c.reason === 'LABEL_MISMATCH')) out.push({ k: 'note', text: WARN[w] }); });
    return out;
  };
  bw.tipHtml = function (t, c) {
    return bw.infoLines(t, c).map(function (l) {
      return '<div class="' + (l.mono ? 'mono' : '') + (l.k === 'note' ? ' sub' : '') + '">' + esc(l.text) + '</div>';
    }).join('');
  };
  // 서버 값이 정확히 "main (sub)" 이고 아직 고치지 않았으면 {main, sub}, 아니면 null.
  bw.parenOf = function (c) {
    if (!c || c.manual || c.mainValue == null || c.subValue == null || c.value !== c.orig) return null;
    return c.value === c.mainValue + ' (' + c.subValue + ')' ? { main: c.mainValue, sub: c.subValue } : null;
  };
  function missText(c) { return c.reason === 'LABEL_MISMATCH' ? '채우지 않음' : (c.reason === 'PART_EMPTY' ? '비어 있음' : '읽지 못함'); }
  bw.cellAria = function (t, c) {
    const i = bw.cellInfo(t, c), pr = bw.parenOf(c);
    const parts = [(c.label || t.title).replace(/ · /g, ', '),
      i.unreadable ? missText(c) : (pr ? pr.main + ', 괄호 안 ' + pr.sub : (c.value === '' ? (c.manual ? '직접 입력' : '비어 있음') : c.value))];
    if (i.edited) parts.push('수정됨' + (i.hasOrig ? ', 원본 ' + c.orig : ''));
    if (i.sumBad) parts.push('합계 차이 ' + i.sum.diff);
    if (c.warns.some(function (w) { return w !== 'LABEL_MISMATCH'; })) parts.push('주의');
    return parts.join(', ');   // 확인 상태는 칸이 아니라 표(카드 aria-label·체크박스)가 전한다
  };
  // 상태 줄 첫 줄 · 알림 줄: 양식 칸 표시값 ← 엑셀 원본 주소 + 엑셀 화면값(+ 환산 전 단위).
  //   한 칸: "48.51 억원 ← K54 4,851.4 백만원" / 여러 칸 합: "20.77 억원 ← K45 외 3칸 합". 단위를 모르면 단위는 생략한다.
  //   직접 입력·출처 없음·읽지 못함·값 없음이면 ''.
  bw.compareLine = function (t, c) {
    if (!c || c.manual || !c.src || str(c.value) === '' || bw.cellInfo(t, c).unreadable) return '';
    const total = Math.max(c.partCount || 0, (c.parts || []).length), cv = c.convert;
    const now = str(c.value) + (cv && cv.unit_to ? ' ' + str(cv.unit_to) : '');
    if (total > 1) {
      const first = (c.parts && c.parts[0] && c.parts[0].cell) || c.src.cell;
      return now + ' ← ' + str(first) + ' 외 ' + (total - 1) + '칸 합';
    }
    if (str(c.src.display) === '') return '';
    return now + ' ← ' + str(c.src.cell) + ' ' + str(c.src.display) + (cv && cv.kind !== 'display_sum' && cv.unit_from ? ' ' + str(cv.unit_from) : '');
  };
  // 알림 줄(#bd-w-live)이 대조 첫 줄과 같으면 화면에서는 숨기고 읽어 주기만 한다(상태 줄 첫 줄과 겹쳐 보이지 않게).
  // 선택을 해제했을 때의 낭독 전용 안내 — 화면에는 보이지 않는다(지난 대조 문구가 안내 문구 아래에 남지 않게).
  bw.RELEASE_LIVE = '선택을 해제했습니다.';
  // 선택이 없으면 상태 줄 전체가 화면에서 숨고(is-idle) 낭독 영역만 남는다.
  bw.liveClass = function (ws, ui) {
    const s = ws && ui && ui.sel ? bw.selected(ws, ui.sel) : null;
    if (!s) return 'bd-w-live is-sr';
    return 'bd-w-live' + (ui.live && ui.live === bw.compareLine(s.t, s.c) ? ' is-sr' : '');
  };
  // 상태 줄은 칸을 골랐을 때만 보인다. 팝업이 열려 있으면 팝업 편집 영역이 같은 일을 하므로 숨긴다.
  bw.statusIdle = function (ws, ui) { return !ui || !ui.sel || !ws || !bw.selected(ws, ui.sel) || !!ui.pop; };
  // 선택을 해제하는 한 곳: 대조 문구(ui.live)를 비우고 낭독 전용 해제 안내로 바꾼다.
  bw.releaseSel = function (ui) { ui.sel = null; ui.live = bw.RELEASE_LIVE; return ui; };

  // ── ② 수정: 고치기 전 확인·사유·재검산 ─────────────────────────
  const WHY = [{ id: 'ROUND', label: '반올림 맞춤' }, { id: 'MAPPING', label: '원본 값과 다르게 가져옴' },
               { id: 'SOURCE', label: '원본 오류' }, { id: 'OTHER', label: '기타' }];
  bw.WHY = WHY;
  bw.whyText = function (c) {
    const w = WHY.filter(function (x) { return x.id === c.why; })[0];
    return w ? (c.why === 'OTHER' && c.memo.trim() ? w.label + ': ' + c.memo.trim() : w.label) : '';
  };
  // 사유는 선택 사항. 단 [기타]를 골랐으면 메모가 있어야 '사유 있음'으로 센다.
  bw.reasonOk = function (c) { return !!c.why && (c.why !== 'OTHER' || c.memo.trim() !== ''); };
  bw.validateValue = function (text) {
    const s = str(text);
    if (CTRL_RE.test(s)) return '쓸 수 없는 문자가 있습니다. 지우고 다시 입력해 주세요.';
    if (s.trim().length > MAX_CELL) return MAX_CELL + '자 이내로 입력해 주세요.';
    return null;
  };
  // 원본 값이 있는 칸을 처음 고치려 할 때만 묻는다(수정된 칸·읽지 못함·출처 없음은 묻지 않음).
  bw.needsAsk = function (t, c) { const i = bw.cellInfo(t, c); return !!c.src && i.hasOrig && !i.edited && !c.asked; };
  bw.shortLabel = function (c) { const p = str(c.label).split(' · '); return p.length > 1 ? p.slice(1).join(' ') : (c.label || c.key); };
  bw.liveSum = function (t, sm) {
    const tot = t.cells[sm.total];
    if (!tot) return null;
    const parts = [];
    for (let i = 0; i < sm.of.length; i++) { const p = t.cells[sm.of[i]]; if (!p) return null; parts.push(p.value); }
    return bw.checkSum(tot.value, parts);
  };
  bw.sumsFor = function (t, key) {
    return t.sums.filter(function (sm) { return sm.total === key || sm.of.indexOf(key) >= 0; })
      .map(function (sm) { return { total: sm.total, of: sm.of, now: bw.liveSum(t, sm) }; });
  };
  bw.partKeys = function (t, key, viaAsk) {
    const out = {};
    t.sums.forEach(function (sm) { if (sm.total === key || (viaAsk && sm.of.indexOf(key) >= 0)) sm.of.forEach(function (k) { out[k] = true; }); });
    return out;
  };
  bw.askLines = function (t, c) {
    const s = c.src, out = [];
    out.push(bw.shortLabel(c) + ' 값은 ' + s.sheet + ' 시트 ' + s.cell + '에서 가져왔습니다. 표시 ' + s.display + (s.raw != null && s.rounded === true ?' · 원래 값 ' + s.raw : ''));
    bw.sumsFor(t, c.key).forEach(function (x) {
      if (!x.now || !t.cells[x.total]) return;
      const nm = bw.shortLabel(t.cells[x.total]);
      out.push(x.now.zero ? '이 칸이 들어간 합계(' + nm + ')는 지금 맞습니다.'
        : '이 칸이 들어간 합계: ' + nm + ' — 표시 합 ' + x.now.expected + ' · 합계 ' + x.now.actual + ' · 차이 ' + x.now.diff);
    });
    if (t.checked) out.push('고치면 이 표의 확인이 풀립니다.');
    return out;
  };
  bw.askHtml = function (t, c) {
    return '<div class="bd-confirm" id="bd-w-ask" role="group" aria-label="고치기 전 확인"><span id="bd-w-asktxt">' + esc(bw.askLines(t, c).join('\n')) + '</span>' +
      '<button type="button" id="bd-w-ask-ok" data-w="ask-ok">그래도 고치기</button>' +
      '<button type="button" id="bd-w-ask-no" data-w="ask-no" aria-describedby="bd-w-asktxt">취소</button></div>';
  };
  bw.whyHtml = function (c) {
    const radios = WHY.map(function (w, idx) {
      const on = c.why === w.id;
      return '<button type="button" class="wf-chip" role="radio" data-w="why" data-v="' + w.id + '" aria-checked="' + on + '" tabindex="' + ((on || (!c.why && idx === 0)) ? '0' : '-1') + '">' + esc(w.label) + '</button>';
    }).join('');
    let memo = '';
    if (c.why === 'OTHER') {
      const n = c.memo.length, blank = c.memo.trim() === '';
      memo = '<input type="text" id="bd-w-memo" class="bd-w-memo" maxlength="100" value="' + esc(c.memo) + '" placeholder="예: 본부 확정치로 맞춤" aria-label="기타 사유">' +
        '<span class="bd-w-count" id="bd-w-memocnt"' + (n >= 80 ? '' : ' hidden') + '>' + n + '/100</span>' +
        '<span class="bd-err" id="bd-w-memohint"' + (blank ? '' : ' hidden') + '>기타 사유를 적어 주세요</span>';
    }
    return '<span class="bd-w-whybox"><span class="bd-w-why" role="radiogroup" aria-label="수정 사유">' + radios + '</span>' + memo + '</span>';
  };
  bw.editCell = function (ws, ref, key, text) {
    const t = findT(ws, ref), c = t && t.cells[key];
    if (!c) return { ws: ws, released: '', changed: false };
    const v = str(text).trim();
    if (v === c.value) return { ws: ws, released: '', changed: false };
    const patch = { value: v };
    // 값이 바뀌면 그 칸이 속한 표의 확인만 풀린다(한 원본 칸이 두 표에 쓰여도 고친 이사회 칸의 표만).
    const released = t.checked ? (ws.done ? 'done' : 'table') : '';
    if (v === c.orig.trim()) { patch.why = ''; patch.memo = ''; }   // 원래 값으로 돌아오면 사유도 지운다
    let next = bw.patchCell(ws, ref, key, patch);
    if (t.checked) next = bw.patchTable(next, ref, { checked: null, relNote: { label: bw.shortLabel(c), from: c.value, to: v } });
    else if (t.relNote) {
      // 이미 확인이 풀린 표: 안내는 가장 최근에 고친 값으로 갱신하고, 고친 칸이 하나도 남지 않으면(모두 원본으로 되돌림) 지운다
      const t2 = findT(next, ref);
      const any = Object.keys(t2.cells).some(function (k) { return bw.cellInfo(t2, t2.cells[k]).edited; });
      next = bw.patchTable(next, ref, { relNote: any ? { label: bw.shortLabel(c), from: c.value, to: v } : null });
    }
    return { ws: bw.normalize(next), released: released, changed: true };
  };
  bw.setWhy = function (ws, ref, key, why, memo) {
    if (why && !WHY.some(function (w) { return w.id === why; })) return ws;
    return bw.patchCell(ws, ref, key, { why: why || '', memo: why === 'OTHER' ? str(memo).slice(0, 100) : '' });
  };
  bw.recheckText = function (label, before, after) {
    if (!after) return (before && !before.zero) ? label + ': 값을 숫자로 읽을 수 없어 합계를 다시 맞춰 볼 수 없습니다.' : '';
    const b = before ? before.diff : '0';
    if (b === after.diff) return '';
    return after.zero ? label + ': 차이 ' + b + ' → 0, 이제 맞습니다.' : label + ': 차이 ' + b + ' → ' + after.diff + '.';
  };
  bw.recheckLines = function (before, after, ref, key) {
    const tb = findT(before, ref), ta = findT(after, ref);
    if (!tb || !ta) return [];
    return ta.sums.filter(function (sm) { return sm.total === key || sm.of.indexOf(key) >= 0; }).map(function (sm) {
      return bw.recheckText(bw.shortLabel(ta.cells[sm.total]), bw.liveSum(tb, sm), bw.liveSum(ta, sm));
    }).filter(Boolean);
  };
  // 팝업에서 값을 고치는 한 번의 동작(순수). sel 은 고를 이사회 칸 {t,key}. → {ws, note, error, changed, released}
  // 원본 엑셀 값(orig·src)은 그대로 두고 이사회 칸 값(value)만 bw.editCell 로 바꾼다.
  bw.popCommit = function (ws, sel, text) {
    const t = sel && findT(ws, sel.t), c = t && t.cells[sel.key];
    if (!c) return { ws: ws, note: '', error: false, changed: false, released: '' };
    const bad = bw.validateValue(text);
    if (bad) return { ws: ws, note: bad, error: true, changed: false, released: '' };
    const r = bw.editCell(ws, sel.t, sel.key, text);
    if (!r.changed) return { ws: ws, note: '값이 같아 바꾸지 않았습니다.', error: false, changed: false, released: '' };
    const label = bw.shortLabel(c), from = c.value === '' ? '빈 칸' : c.value, to = str(text).trim() === '' ? '빈 칸' : str(text).trim();
    const back = !c.manual && str(c.orig).trim() !== '' && str(text).trim() === str(c.orig).trim();   // 원본 값으로 되돌린 경우
    const msgs = [(back ? label + bw.josaEul(label) + ' 원본 값 ' + to + bw.josaEuro(to) + ' 되돌렸습니다.'
                        : label + bw.josaEul(label) + ' ' + from + '에서 ' + to + bw.josaEuro(to) + ' 고쳤습니다.') +
      (r.released ? ' ‘' + tname(t) + '’ 표의 확인을 풀었습니다.' : '')];
    bw.recheckLines(ws, r.ws, sel.t, sel.key).forEach(function (m) { msgs.push(m); });
    return { ws: r.ws, note: msgs.join(' '), error: false, changed: true, released: r.released };
  };
  // 표 확인이 풀렸을 때 낭독 문구(작성본 칸을 직접 고친 경우)
  bw.releaseText = function (r, t) {
    if (r === 'done') return '값이 바뀌어 검수 완료를 해제했습니다. ‘' + tname(t) + '’ 표의 확인도 풀렸습니다.';
    if (r === 'table') return '값이 바뀌어 ‘' + tname(t) + '’ 표의 확인을 풀었습니다.';
    return '';
  };

  // ── 화면 조각(HTML) ────────────────────────────────────────
  function freshUi() {
    return { form: null, upload: null, rej: null, leave: null, sel: null, live: '', banOpen: {},
             draftBusy: false, draftNote: '', draftErr: false, mapText: '', maxMb: DEFAULT_MAX_MB,
             edit: null, ask: null, copyNote: null, pop: null };
  }
  bw.freshUi = freshUi;

  bw.barHtml = function (ws, ui) {
    const f = ui.form || {};
    const title = '자료 작성 중 · ' + str(f.name) + (f.version != null && f.version !== '' ? ' v' + f.version : '') +
      (ws ? ' · 원본 ' + ws.fileName + '(저장 안 됨)' : '');
    const un = ws ? bw.uncheckedTables(ws).length : 0;
    return '<div class="bd-editbar bd-writebar" id="bd-writebar" tabindex="-1"><div class="bd-wb-row"><span>' + esc(title) + '</span><span class="bd-wb-btns">' +
      '<button type="button" data-w="swap"' + (ws && !ui.upload ? '' : ' disabled') + '>엑셀 바꾸기</button>' +
      (ws ? '<button type="button" data-w="srcopen"' + (bw.mergeSources(ws).length ? '' : ' disabled') + '>수익성 분석표 보기</button>' : '') +
      (ws ? '<button type="button" data-w="copyall">모든 표 복사</button>' + bw.copyAllNoteHtml(ui) : '') +
      (un > 0 ? '<span class="bd-w-draftwarn" id="bd-w-draftwarn">' + icon('warn') + '확인 안 한 표 ' + un + '개</span>' : '') +
      '<button type="button" id="bd-w-draft" class="bd-wb-main" data-w="draft"' + (un > 0 ? ' aria-describedby="bd-w-draftwarn"' : '') + (ws && !ui.draftBusy ? '' : ' disabled') + '>' +
      (ui.draftBusy ? '만드는 중…' : '초안 워드 내려받기') + '</button>' +
      '<button type="button" id="bd-w-end" data-w="end">작성 끝내기</button></span></div>' +
      '<p class="bd-wb-note">이 작업은 저장되지 않습니다. 새로고침하거나 창을 닫으면 확인·수정한 내용이 사라집니다.</p>' +
      (ui.draftNote ? '<p class="bd-wb-note' + (ui.draftErr ? ' bd-err' : '') + '" id="bd-w-draftnote" tabindex="-1" role="' + (ui.draftErr ? 'alert' : 'status') + '">' + esc(ui.draftNote) + '</p>' : '') +
      '</div>';
  };
  bw.dropHtml = function (ui) {
    return '<div class="bd-w-drop" id="bd-w-drop" role="group" aria-labelledby="bd-w-droptitle">' +
      '<b id="bd-w-droptitle">' + DROP_TITLE + '</b>' +
      '<p>엑셀(.xlsx) 파일 1개 · 원본 파일은 저장되지 않습니다. 이 화면을 닫으면 작성 내용도 사라집니다.</p>' +
      '<button type="button" id="bd-w-pick" data-w="pick">엑셀 파일 고르기</button>' +
      '<p id="bd-w-maplist">' + esc(ui.mapText) + '</p></div>';
  };
  bw.uploadingHtml = function () {
    return '<div class="bd-w-up" id="bd-w-up" role="status"><span>엑셀을 확인하고 양식에 값을 채우는 중입니다…</span>' +
      '<div class="bd-w-prog"><i></i></div><button type="button" id="bd-w-abort" data-w="abort">취소</button></div>';
  };
  bw.rejHtml = function (r) {
    return '<div class="bd-w-rej" id="bd-w-rej" role="alert" tabindex="-1"><strong>' + esc(r.title) + '</strong>' +
      (r.lines.length ? '<ul>' + r.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '') +
      (r.kindsText ? '<p class="mono">' + esc(r.kindsText) + '</p>' : '') +
      (r.hint ? '<p>' + esc(r.hint) + '</p>' : '') +
      ((r.canPick || r.canReform || r.canPerm) ? '<div class="bd-w-rejbtns">' +
        (r.canPerm ? '<button type="button" data-w="perm">권한 신청하러 가기</button>' : '') +
        (r.canPick ? '<button type="button" data-w="pick">다른 파일 고르기</button>' : '') +
        (r.canReform ? '<button type="button" data-w="reform">양식 다시 고르기</button>' : '') + '</div>' : '') + '</div>';
  };
  bw.leaveHtml = function (kind, y) {
    const b = kind === 'swap' ? ['바꾸고 새로 채우기', '그대로 두기'] : ['작성 내용 버리기', '계속 작성'];
    return '<div class="bd-confirm" id="bd-w-leave" role="group" aria-labelledby="bd-w-leavetxt"><span id="bd-w-leavetxt">' + esc(bw.leaveText(kind, y)) + '</span>' +
      '<button type="button" id="bd-w-leave-ok" data-w="leave-ok">' + b[0] + '</button>' +
      '<button type="button" id="bd-w-leave-no" data-w="leave-no">' + b[1] + '</button></div>';
  };
  bw.summaryHtml = function (ws) {
    const y = bw.tally(ws);
    let text;
    if (!y.m) text = '이 양식에는 엑셀에서 채울 칸이 없습니다.';
    else if (y.failed > 0 || y.review > 0) {
      const got = y.filled + y.review;
      // 예: "값 46칸을 채웠고 2칸은 읽지 못했습니다. 그중 1칸은 엑셀 칸이 비어 있습니다. 머리글이 달라 확인이 필요한 칸이 3칸 있습니다."
      const allEmpty = y.failed > 0 && y.empty === y.failed;   // 읽지 못한 칸이 전부 '엑셀 칸이 비어 있음'이면 한 번만 말한다
      text = (got > 0 ? '값 ' + got + '칸을 채웠' : '채운 값이 없') +
        (allEmpty ? (got > 0 ? '고 ' : '고, ') + y.failed + '칸은 엑셀 칸이 비어 있어 채우지 않았' : (y.failed > 0 ? '고 ' + y.failed + '칸은 읽지 못했' : '')) + '습니다.' +
        (!allEmpty && y.empty > 0 ? ' 그중 ' + y.empty + '칸은 엑셀 칸이 비어 있습니다.' : '') +
        (y.reviewLabel > 0 ? ' 머리글이 달라 확인이 필요한 칸이 ' + y.reviewLabel + '칸 있습니다.' : '');
    }
    else if (y.filled === 0 && y.manual > 0) text = '엑셀에서 가져올 값이 없습니다.';
    else text = '값 ' + y.filled + '칸을 모두 채웠습니다. 표마다 [원본 보기]로 수익성 분석표와 맞춰 보고 ‘이 표 확인’을 눌러 주세요.';
    let extra = '';
    if (y.noReason > 0) extra = '사유를 고르지 않은 수정 ' + y.noReason + '칸';
    const items = bw.warnItems(ws);
    return '<div class="bd-w-sum" id="bd-w-sum" role="status" tabindex="-1"><span>' + esc(text) + '</span>' +
      (extra ? '<span>' + esc(extra) + '</span>' : '') +
      (y.sumManual > 0 ? '<span>' + esc('합계 범위에 직접 입력 칸이 있어 확인이 필요한 합계가 ' + y.sumManual + '칸 있습니다.') + '</span>' : '') +
      (y.manual > 0 ? '<span>' + esc('직접 입력하는 칸 ' + y.manual + '칸은 엑셀에서 가져오지 않습니다.') + '</span>' : '') +
      (y.failed > 0 ? '<button type="button" data-w="unread">읽지 못한 칸 보기</button>' : '') + '</div>' +
      (items.length ? '<details class="bd-w-warn"><summary>주의 ' + items.length + '건</summary><ul>' +
        items.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></details>' : '') +
      '<p class="bd-w-def">‘원래 값’은 엑셀 칸에 저장된 숫자입니다. 엑셀에서 서식으로 가려 보이지 않던 값도 여기에는 나옵니다.</p>';
  };
  bw.filterHtml = function (ws) {
    const y = bw.tally(ws), n = { all: y.m, edited: y.edited, need: y.need, unchecked: y.tu };
    return '<div class="wf-chips" role="group" aria-label="칸 거르기">' + FILTERS.map(function (f) {
      return '<button type="button" class="wf-chip" data-w="filter" data-v="' + f[0] + '" aria-pressed="' + (ws.filter === f[0]) + '">' + f[1] + '<i>' + n[f[0]] + '</i></button>';
    }).join('') + '</div><p class="bd-w-def">확인 필요: 읽지 못했거나, 주의가 붙었거나, 합계가 맞지 않거나, 머리글이 다른 표의 칸 · 확인 안 한 표: 표 머리의 ‘이 표 확인’을 누르지 않은 표</p>';
  };
  // 표 확인 현황 한 줄: "표 확인 4/6". 모든 표를 확인하면 '검수 완료 · 마지막 확인 14:32' 칩이 자동으로 붙는다.
  bw.reviewHtml = function (ws) {
    const y = bw.tally(ws);
    if (!y.tm) return '';
    const bits = [];
    if (y.sumBad > 0) bits.push('합계 차이 ' + y.sumBad + '곳');
    if (y.noReason > 0) bits.push('사유를 고르지 않은 수정 ' + y.noReason + '칸');
    const notes = bits.length ? bits.join(' · ') + '이 남아 있어도 표 확인은 할 수 있습니다.' : '';
    return '<div class="bd-w-rev"><span class="bd-w-count" id="bd-w-count">표 확인 ' + y.tn + '/' + y.tm + '</span>' +
      (ws.done ? '<span class="bd-w-chip is-done">검수 완료 · 마지막 확인 ' + esc(ws.done.at) + '</span>' : '') +
      (notes ? '<span class="bd-w-note">' + esc(notes) + '</span>' : '') + '</div>';
  };

  bw.chipsHtml = function (t) {
    let h = '';
    let sumN = 0;
    t.order.forEach(function (k) { if (bw.cellInfo(t, t.cells[k]).sumBad) sumN++; });
    if (sumN) h += '<span class="bd-w-chip is-warn">' + icon('warn') + '합계 차이 ' + sumN + '</span>';
    if (t.needsReview) {
      if (t.labelState === 'failed') h += '<span class="bd-w-chip is-warn">' + icon('warn') + '주의 · 채우지 못함</span>';
      else h += t.checked ? '<span class="bd-w-chip">주의 · 확인함</span>' : '<span class="bd-w-chip is-warn">' + icon('warn') + '주의 · 머리글 확인 필요</span>';
    }
    return h ? '<span class="bd-w-chips">' + h + '</span>' : '';
  };
  bw.bannerHtml = function (t, open) {
    if (!t.needsReview) return '';
    const sheet = t.grid ? t.grid.sheet : '';
    const all = t.mismatches, list = open ? all : all.slice(0, 3);
    const failed = t.labelState === 'failed';
    return '<div class="bd-w-ban" role="group" aria-label="머리글 주의">' + icon('warn') + '<div><b>' +
      (failed ? '이 표는 머리글이 양식과 많이 달라 값을 채우지 않았습니다.' : '이 표는 머리글이 양식과 달라 위치대로 값을 채웠습니다.') + '</b>' +
      '<div>' + (failed ? '엑셀의 시트와 표가 맞는지 확인하고, 값을 직접 넣거나 올바른 파일을 다시 올려 주세요.' : '값이 맞는 자리에 들어갔는지 모든 칸을 원본과 하나씩 확인해 주세요.') + '</div>' +
      (list.length ? '<ul>' + list.map(function (m) {
        return '<li>양식 ‘' + esc(m.expected) + '’ · 엑셀 ‘' + esc(m.actual) + '’ (' + esc(sheet ? sheet + ' 시트 ' : '') + esc(m.cell) + ')</li>';
      }).join('') + '</ul>' : '') +
      (all.length > 3 ? '<button type="button" class="link-btn" data-w="banmore" data-v="' + esc(t.ref) + '" aria-expanded="' + !!open + '">' +
        (open ? '접기' : '외 ' + (all.length - 3) + '개 더 보기') + '</button>' : '') + '</div></div>';
  };

  function staticCellHtml(o) {
    const header = o.header === true, tag = header ? 'th' : 'td';
    const al = ALIGNS[o.align] ? o.align : (header ? 'center' : 'left');
    const cs = span(o.colspan), rs = span(o.rowspan);
    return '<' + tag + ' class="bd-a-' + al + '"' + (cs > 1 ? ' colspan="' + cs + '"' : '') + (rs > 1 ? ' rowspan="' + rs + '"' : '') + '>' + esc(o.text) + '</' + tag + '>';
  }
  function headerInRows(rows) {
    return !!(rows.length && Array.isArray(rows[0]) && rows[0].some(function (c) { return c && c.header === true; }));
  }
  // 값 칸(엑셀에서 채운 칸). p: {ui, fc(양식 칸), rove, sel, dim, part}. bd-mapped(틸)는 쓰지 않는다.
  bw.valueCellHtml = function (t, c, o) {
    const p = o || {}, i = bw.cellInfo(t, c), fc = p.fc || {};
    const pr = bw.parenOf(c);
    const al = ALIGNS[fc.align] ? fc.align : (pr || bw.shownNum(c.value) != null ? 'right' : 'left');
    const cls = ['bd-w-cell', 'bd-a-' + al];
    if (al === 'right') cls.push('bd-num');
    if (i.edited) cls.push('is-edited');
    if (i.unreadable) cls.push('is-bad');
    if (p.dim) cls.push('is-dim');
    if (p.part) cls.push('is-part');
    if (p.sel) cls.push('is-sel');
    const cs = span(fc.colspan), rs = span(fc.rowspan);
    let inner;
    if (i.unreadable) inner = '<span class="bd-w-miss' + (c.reason === 'PART_EMPTY' ? ' bd-w-empty' : '') + '">' + missText(c) + '</span>';
    else if (pr) inner = esc(pr.main) + ' <span class="bd-w-paren">(' + esc(pr.sub) + ')</span>';
    else if (c.manual && c.value === '') inner = '<span class="bd-w-miss bd-w-empty">직접 입력</span>';
    else inner = esc(c.value);
    let extra = '';
    if (p.ui && p.ui.edit && p.ui.edit.t === t.ref && p.ui.edit.key === c.key) {
      inner = '<input type="text" id="bd-w-in" class="bd-w-in" maxlength="' + MAX_CELL + '" value="' + esc(p.ui.edit.text) + '" aria-label="' + esc(bw.cellAria(t, c)) + ' 수정">';
    }
    if (i.edited && i.hasOrig) extra += '<span class="bd-w-orig">원본 ' + esc(c.orig) + '</span>';
    const warn = c.warns.some(function (w) { return w !== 'LABEL_MISMATCH'; }) || i.sumBad;
    return '<td class="' + cls.join(' ') + '" role="gridcell" data-t="' + esc(t.ref) + '" data-key="' + esc(c.key) + '" tabindex="' + (p.rove ? '0' : '-1') +
      '" aria-selected="' + (p.sel ? 'true' : 'false') + '" aria-label="' + esc(bw.cellAria(t, c)) + '"' +
      (cs > 1 ? ' colspan="' + cs + '"' : '') + (rs > 1 ? ' rowspan="' + rs + '"' : '') + '>' +
      '<span class="bd-w-v">' + inner + '</span>' + extra + (warn ? icon('warn') : '') + '</td>';
  };
  bw.cardHtml = function (ws, t, ui, rv) {
    const dirty = !!t.relNote && !t.checked;
    const state = t.order.length ? (t.checked ? ', 확인함' : (dirty ? ', 확인 풀림' : '')) : '';
    const label = esc((t.title || t.mapping || '표') + state);
    const head = '<div class="bd-card-head bd-w-head">' + (t.mapping ? '<span class="bd-map">' + esc(t.mapping) + '</span>' : '') +
      '<strong class="bd-w-title">' + esc(t.title) + '</strong>' + bw.chipsHtml(t) + bw.copyBtnHtml(t, ui) + '</div>' +
      (dirty ? '<p class="bd-w-relnote" role="status">값을 고쳐 확인을 풀었습니다(' + esc(t.relNote.label + ' ' + t.relNote.from + ' → ' + t.relNote.to) + '). 다시 확인해 주세요.</p>' : '');
    const any = t.mapped && t.order.some(function (k) { return bw.matches(ws, t, t.cells[k]); });
    if (ws.filter !== 'all' && !any) {
      return '<section class="bd-card bd-w-card is-empty" data-t="' + esc(t.ref) + '" aria-label="' + label + '">' + head + '<p class="bd-hint">해당 칸 없음</p></section>';
    }
    let parts = {};
    if (ui.sel && ui.sel.t === t.ref) parts = bw.partKeys(t, ui.sel.key, !!ui.ask);
    const thead = (t.columns.length && !headerInRows(t.rows))
      ? '<thead><tr>' + t.columns.map(function (c) { return '<th class="bd-a-center">' + esc(c && typeof c === 'object' ? c.text : c) + '</th>'; }).join('') + '</tr></thead>' : '';
    const body = t.rows.map(function (r) {
      return '<tr>' + (Array.isArray(r) ? r : []).map(function (fc) {
        const o = (fc && typeof fc === 'object') ? fc : { text: fc };
        const key = str(o.key);
        if ((o.mapped === true || o.input === true) && has(t.cells, key)) {
          return bw.valueCellHtml(t, t.cells[key], {
            ui: ui, fc: o, rove: !!rv && rv.t === t.ref && rv.key === key,
            sel: !!ui.sel && ui.sel.t === t.ref && ui.sel.key === key,
            dim: !bw.matches(ws, t, t.cells[key]), part: !!parts[key]
          });
        }
        return staticCellHtml(o);
      }).join('') + '</tr>';
    }).join('');
    const notes = t.notes.length ? '<ul class="bd-notes">' + t.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '';
    return '<section class="bd-card bd-w-card' + (ui.sel && ui.sel.t === t.ref ? ' has-sel' : '') + (dirty ? ' is-released' : '') + '" data-t="' + esc(t.ref) + '" aria-label="' + label + '">' + head + bw.bannerHtml(t, !!ui.banOpen[t.ref]) +
      (t.mapped ? '' : '<p class="bd-hint">이 표는 엑셀에서 값을 가져오지 않습니다.</p>') +
      '<div class="bd-table-wrap"><table class="bd-table bd-w-table" role="grid" aria-label="' + label + '">' + thead + '<tbody>' + body + '</tbody></table></div>' + notes + '</section>';
  };
  // ── 원본 패널 순수 로직: 같은 시트의 표는 격자 하나로 합친다 ──
  function colNum(L) { let n = 0; const s = str(L).toUpperCase(); for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
  function colLetters(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  // → [{sheet, first_row, cols[], rows[][], range, tags[{ref,label,r0,c0,r1,c1}], owners{'r,c':[{t,key}]}}]  (좌표는 합집합 격자 기준 0부터)
  bw.mergeSources = function (ws) {
    const groups = [];
    ((ws && ws.tables) || []).forEach(function (t) {
      const g = t.grid;
      if (!g || !Array.isArray(g.cols) || !g.cols.length || !Array.isArray(g.rows) || !isFinite(Number(g.first_row))) return;
      const sheet = str(g.sheet);
      let grp = null;
      for (let i = 0; i < groups.length; i++) if (groups[i].sheet === sheet) { grp = groups[i]; break; }
      if (!grp) { grp = { sheet: sheet, items: [] }; groups.push(grp); }
      grp.items.push(t);
    });
    return groups.map(function (grp) {
      let minC = Infinity, maxC = 0, minR = Infinity, maxR = 0;
      grp.items.forEach(function (t) {
        const g = t.grid, fr = Number(g.first_row);
        g.cols.forEach(function (c) { const n = colNum(c); if (n > 0) { minC = Math.min(minC, n); maxC = Math.max(maxC, n); } });
        minR = Math.min(minR, fr); maxR = Math.max(maxR, fr + g.rows.length - 1);
      });
      if (!isFinite(minC) || !isFinite(minR) || maxR < minR) return null;
      const cols = [];
      for (let n = minC; n <= maxC; n++) cols.push(colLetters(n));
      const rows = [];
      for (let r = minR; r <= maxR; r++) rows.push(cols.map(function () { return ''; }));
      const tags = [], owners = {};
      grp.items.forEach(function (t) {
        const g = t.grid, fr = Number(g.first_row), cn = g.cols.map(colNum);
        g.rows.forEach(function (row, r) {
          (Array.isArray(row) ? row : []).forEach(function (v, c) {
            if (c >= cn.length || cn[c] < 1) return;
            const rr = fr + r - minR, cc = cn[c] - minC;
            if (rows[rr][cc] === '') rows[rr][cc] = str(v);
          });
        });
        Object.keys(t.srcIndex || {}).forEach(function (k) {
          const p = k.split(','), r = Number(p[0]), c = Number(p[1]);
          if (!(c >= 0 && c < cn.length)) return;
          const id = (fr + r - minR) + ',' + (cn[c] - minC);
          (owners[id] = owners[id] || []).push({ t: t.ref, key: t.srcIndex[k] });
        });
        const lo = Math.min.apply(null, cn), hi = Math.max.apply(null, cn);
        tags.push({ ref: t.ref, label: t.mapping || t.ref, r0: fr - minR, c0: lo - minC, r1: fr + g.rows.length - 1 - minR, c1: hi - minC });
      });
      return { sheet: grp.sheet, first_row: minR, cols: cols, rows: rows, tags: tags, owners: owners,
               range: colLetters(minC) + minR + ':' + colLetters(maxC) + maxR };
    }).filter(Boolean);
  };
  // 문장 칸이면 'text', 숫자·빈 칸이면 'num'.
  bw.srcKind = function (v) {
    const s = str(v).trim();
    if (s === '') return 'num';
    if (bw.shownNum(s) != null) return 'num';
    return /^[()+\-−△▲\s]*\d[\d,.\s]*[%원]?\)?$/.test(s) ? 'num' : 'text';
  };
  // 원본 칸이 선택(t,key)에 해당하는가. own = 여러 양식 칸이 한 원본 칸을 가리킬 때의 "표|키 표|키" 목록.
  bw.ownsCell = function (own, st, key, sel) {
    if (!sel) return false;
    if (own) return own.split(' ').indexOf(sel.t + '|' + sel.key) >= 0;
    return !!key && st === sel.t && key === sel.key;
  };
  // 한 축의 가운데 스크롤. cur 현재 스크롤, pos·size 칸의 위치·크기(내용 좌표), view 보이는 길이, lead 고정 머리 길이, max 스크롤 최댓값.
  // 이미 완전히 보이면 cur 그대로.
  bw.centerAxis = function (cur, pos, size, view, lead, max) {
    if (pos >= cur + lead && pos + size <= cur + view) return cur;
    const want = pos + size / 2 - (lead + (view - lead) / 2);
    return Math.round(Math.max(0, Math.min(Math.max(0, max), want)));
  };
  // o: {st, sl, w, h, sw, sh, lead:{top,left}, cell:{top,left,w,h}} → {top, left}
  bw.centerScroll = function (o) {
    return { top: bw.centerAxis(o.st, o.cell.top, o.cell.h, o.h, o.lead.top, o.sh - o.h),
             left: bw.centerAxis(o.sl, o.cell.left, o.cell.w, o.w, o.lead.left, o.sw - o.w) };
  };
  // 표 점프: 그 칸의 위치를 고정 머리 바로 아래(오른쪽)로.
  bw.alignScroll = function (pos, lead, view, total) {
    return Math.round(Math.max(0, Math.min(Math.max(0, total - view), pos - lead)));
  };
  // ── 선택·포커스한 칸이 고정 패널(작성 바·상태 줄)에 가려지지 않게 하는 계산(순수) ──
  // o: {vpH, barBottom, covers:[{top,left,right}...], cell:{left,right}}. 칸과 가로로 겹치는 아래쪽 패널 중 가장 위쪽 top 이 보이는 영역의 아래 끝.
  // 반환 {top, bottom}: 칸이 있어야 할 보이는 영역(위아래 8px 여백 포함).
  bw.visibleBand = function (o) {
    const m = 8, cell = o.cell || { left: 0, right: 0 };
    let floor = Number(o.vpH) || 0;
    (o.covers || []).forEach(function (c) {
      const overlap = c.left < cell.right && c.right > cell.left;
      if (overlap && c.top < floor) floor = c.top;
    });
    return { top: Math.max(0, Number(o.barBottom) || 0) + m, bottom: floor - m };
  };
  // 포커스가 칸 밖의 버튼·입력(예: '이 표 복사')에 갔을 때 고정 패널 뒤에서 꺼내야 하는지: 표 영역 안이고 고정 영역(작성 바·상태 줄) 밖일 때만.
  bw.needsOcclusionFix = function (inTables, inFixed) { return !!inTables && !inFixed; };
  // 칸(top·bottom)이 영역 밖이면 가려진 것.
  bw.isCovered = function (cell, band) { return cell.top < band.top || cell.bottom > band.bottom; };
  // 칸을 영역 안으로 옮기는 데 필요한 스크롤 양(양수 = 아래로 스크롤). 이미 보이면 0.
  // 칸이 영역보다 크면 칸의 위쪽을 영역 위쪽에 맞춘다.
  bw.scrollDelta = function (cell, band) {
    if (!bw.isCovered(cell, band)) return 0;
    if (cell.bottom - cell.top > band.bottom - band.top) return Math.round(cell.top - band.top);
    return Math.round(cell.top < band.top ? cell.top - band.top : cell.bottom - band.bottom);
  };
  // 선택 뒤 보정(순수 로직, 호출 순서 검증용): 상태 줄이 자란 뒤 높이를 다시 재고 칸을 영역 안으로 옮기고, 다음 프레임에 한 번 더 한다.
  // d: {measure, ensure, raf, alive}
  // 보정에서 예외가 나도 호출자(선택·툴팁)를 깨지 않도록 각 단계를 감싼다.
  bw.settleVisible = function (d) {
    function once() { try { d.measure(); } catch (e) { /* 측정 실패는 무시 */ } try { d.ensure(); } catch (e2) { /* 보정 실패는 무시 */ } }
    once();
    try {
      const raf = d.raf;   // 떼어서 부른다: requestAnimationFrame 을 객체 속성으로 부르면 Illegal invocation
      if (typeof raf === 'function') raf(function () { if (d.alive()) once(); });
    } catch (e3) { /* 프레임 예약 실패는 무시 */ }
  };
  // 위에 붙는 바(sticky)가 실제로 붙었는지: 바의 현재 top 이 스크롤 영역 top + 위 여백 이하일 때(= 붙은 뒤).
  bw.STICK_PAD = 14;
  bw.isStuck = function (barTop, scrollerTop, pad) {
    const p = typeof pad === 'number' ? pad : bw.STICK_PAD;
    return barTop <= scrollerTop + p + 0.5;
  };
  // 마우스로 칸을 누른 뒤 손을 뗄 때, 그 칸이 현재 선택이면 보정이 필요하다(mouseup 이 상태 줄로 떨어져 click 이 오지 않을 수 있다).
  bw.needSettle = function (downCell, sel) {
    return !!(downCell && sel && downCell.t === sel.t && downCell.key === sel.key);
  };
  // 원본 칸 (행,열) 가운데 선택 칸이 있는 열 번호들 → 그 열 머리를 is-srccol 로 표시한다.
  function selCols(sh, sel) {
    const out = {};
    if (!sel) return out;
    Object.keys(sh.owners).forEach(function (k) {
      if (sh.owners[k].some(function (o) { return o.t === sel.t && o.key === sel.key; })) out[Number(k.split(',')[1])] = true;
    });
    return out;
  }

  // ── 수익성 분석표 팝업(순수 조각) ─────────────────────────────
  // 팝업 상태 ui.pop = {at:{s,r,c}|null, text:null|string, onlyEdited, note, err, last:{t,key}|null, ret:{w,v}|null}
  function srcAddr(sh, r, c) { return sh.cols[c] + (sh.first_row + r); }
  function cleanRef(s) { return str(s).replace(/\$/g, '').toUpperCase(); }
  // 선택 칸(sel)의 원본 위치 at. 같은 칸을 가리키는 원본 칸이 여럿이면 주 원본 주소가 있는 칸을 먼저 고른다.
  bw.popAtFor = function (sheets, ws, sel) {
    const s = bw.selected(ws, sel);
    if (!s) return null;
    const main = s.c.src ? cleanRef(s.c.src.cell) : '';
    let first = null;
    for (let i = 0; i < sheets.length; i++) {
      const keys = Object.keys(sheets[i].owners);
      for (let k = 0; k < keys.length; k++) {
        if (!sheets[i].owners[keys[k]].some(function (o) { return o.t === sel.t && o.key === sel.key; })) continue;
        const p = keys[k].split(','), at = { s: i, r: Number(p[0]), c: Number(p[1]) };
        if (srcAddr(sheets[i], at.r, at.c) === main) return at;
        if (!first) first = at;
      }
    }
    return first;
  };
  bw.popCands = function (sheets, at) {
    const sh = at && sheets[at.s];
    return (sh && sh.owners[at.r + ',' + at.c]) || [];
  };
  // 원본 칸을 골랐을 때(순수): at 를 바꾸고, 이사회 칸 선택(ui.sel)을 후보에 맞춘다. 후보가 없으면 선택을 비운다.
  bw.popSelect = function (ws, ui, sheets, at) {
    const p = ui.pop;
    if (!p) return ui;
    p.at = at; p.text = null; p.note = ''; p.err = false;
    const cands = bw.popCands(sheets, at).filter(function (o) { return !!bw.selected(ws, o); });
    if (!cands.length) { ui.sel = null; return ui; }
    if (!(ui.sel && cands.some(function (o) { return o.t === ui.sel.t && o.key === ui.sel.key; }))) ui.sel = { t: cands[0].t, key: cands[0].key };
    return ui;
  };
  // 입력 칸의 처음 글자: 쓰던 글자가 있으면 그것, 없으면 이사회 칸 현재 값
  bw.popInputText = function (ws, ui) {
    const s = bw.selected(ws, ui.sel);
    if (!s) return '';
    return ui.pop && ui.pop.text != null ? ui.pop.text : s.c.value;
  };
  // Esc: 입력 안이면 입력만 취소하고 팝업은 열어 둔다. 입력 밖이면 닫는다.
  bw.popEscAction = function (x) { return x && x.input ? 'input' : 'close'; };
  bw.srcEditedCount = function (ws) { return bw.tally(ws).edited; };

  // 원본 표 영역(#bd-w-srcbody). sel 은 팝업에서 고른 이사회 칸(없으면 강조 없음), at 은 고른 원본 칸.
  bw.srcBodyHtml = function (ws, ui) {
    const sheets = bw.mergeSources(ws), p = ui.pop || {}, at = p.at || null, sel = at ? ui.sel : null;
    const s0 = sel ? bw.selected(ws, sel) : null, main = s0 && s0.c.src ? cleanRef(s0.c.src.cell) : '';
    const edited = function (o) { const x = bw.selected(ws, o); return !!x && bw.cellInfo(x.t, x.c).edited; };
    let rove = at ? { s: at.s, r: at.r, c: at.c } : null;
    if (!rove) {
      for (let i = 0; i < sheets.length && !rove; i++) {
        const k = Object.keys(sheets[i].owners)[0];
        if (k) { const q = k.split(','); rove = { s: i, r: Number(q[0]), c: Number(q[1]) }; }
      }
      if (!rove && sheets.length) rove = { s: 0, r: 0, c: 0 };
    }
    const parts = sheets.map(function (sh, si) {
      const cover = function (r, c) {
        for (let i = 0; i < sh.tags.length; i++) { const g = sh.tags[i]; if (r >= g.r0 && r <= g.r1 && c >= g.c0 && c <= g.c1) return g.ref; }
        return sh.tags[0].ref;
      };
      const hot = selCols(sh, sel);
      return '<div class="bd-w-srccap">' + esc(sh.sheet + ' 시트 · ' + sh.range) + '</div>' +
        '<table class="bd-w-srctbl' + (p.onlyEdited ? ' is-only-edited' : '') + '" role="grid" aria-label="' + esc(sh.sheet + ' 시트 원본') + '"><thead><tr><th></th>' +
        sh.cols.map(function (c, ci) { return '<th scope="col"' + (hot[ci] ? ' class="is-srccol"' : '') + '>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        sh.rows.map(function (row, r) {
          const starts = sh.tags.filter(function (g) { return g.r0 === r; });
          let on0 = false;
          const tds = row.map(function (v, c) {
            const own = sh.owners[r + ',' + c] || [], key = own.length ? own[0].key : '';
            const mine = own.some(function (o) { return !!sel && sel.t === o.t && sel.key === o.key; });
            const addr = srcAddr(sh, r, c);
            const on = mine && (main === '' || addr === main), part = mine && !on;
            const here = at && at.s === si && at.r === r && at.c === c;
            if (mine) on0 = true;
            const tags = starts.filter(function (g) { return g.c0 === c; }).map(function (g) { return g.ref; });
            const text = bw.srcKind(v) === 'text';
            const cls = [];
            if (text) cls.push('is-text');
            if (on) cls.push('is-src'); else if (part) cls.push('is-part'); else if (here) cls.push('is-at');
            if (own.some(edited)) cls.push('is-edsrc');
            const label = addr + ' ' + str(v) + (own.length ? ', 이사회 자료에 쓰는 칸 ' + own.length + '개' : ', 쓰지 않는 칸') + (own.some(edited) ? ', 이사회 쪽 수정됨' : '');
            return '<td data-st="' + esc(own.length ? own[0].t : cover(r, c)) + '"' + (key ? ' data-key="' + esc(key) + '"' : '') +
              (own.length > 1 ? ' data-own="' + esc(own.map(function (o) { return o.t + '|' + o.key; }).join(' ')) + '" data-n="' + own.length + '"' : '') +
              (tags.length ? ' data-tstart="' + esc(tags.join(' ')) + '"' : '') + (cls.length ? ' class="' + cls.join(' ') + '"' : '') +
              (text ? ' title="' + esc(str(v)) + '"' : '') + ' data-s="' + si + '" data-r="' + r + '" data-c="' + c + '" data-a="' + esc(addr) + '"' +
              ' role="gridcell" tabindex="' + (rove && rove.s === si && rove.r === r && rove.c === c ? '0' : '-1') + '" aria-selected="' + (!!here) + '" aria-label="' + esc(label) + '">' + esc(v) + '</td>';
          }).join('');
          return '<tr><th scope="row"' + (on0 ? ' class="is-srcrow"' : '') + '>' + starts.map(function (g) {
            return '<span class="bd-w-srctag" aria-label="' + esc(g.label + ' 표 시작') + '">' + esc(g.label) + '</span>';
          }).join('') + (sh.first_row + r) + '</th>' + tds + '</tr>';
        }).join('') + '</tbody></table>';
    }).join('');
    return '<div id="bd-w-srcbody" tabindex="0" role="region" aria-label="수익성 분석표 원본, 방향키로 칸을 옮깁니다">' + parts + '</div>';
  };
  // 편집 영역(고른 원본 칸 기준, 위에서 아래로)
  bw.popEditHtml = function (ws, ui) {
    const p = ui.pop || {}, sheets = bw.mergeSources(ws);
    const guide = '<p class="bd-src-guide">엑셀 파일은 바뀌지 않습니다. 고친 값은 이사회 자료에만 들어갑니다.</p>';
    const note = '<p class="bd-src-note' + (p.err ? ' bd-err' : '') + '" id="bd-src-note" role="' + (p.err ? 'alert' : 'status') + '">' + esc(p.note || '') + '</p>';
    if (!p.at) return guide + '<p class="bd-w-hint">원본 표에서 칸을 고르면 이사회 자료에 쓰는 값을 여기서 고칠 수 있습니다.</p>' + note;
    const sh = sheets[p.at.s], v = sh ? str(sh.rows[p.at.r][p.at.c]) : '', addr = sh ? srcAddr(sh, p.at.r, p.at.c) : '';
    const cands = bw.popCands(sheets, p.at).filter(function (o) { return !!bw.selected(ws, o); });
    const s = bw.selected(ws, ui.sel);
    let h = guide + '<div class="bd-src-cell mono">' + esc((sh ? sh.sheet + ' 시트 ' : '') + addr + ' · 표시 ' + (v === '' ? '(빈 칸)' : v)) +
      (s && s.c.src && cleanRef(s.c.src.cell) === addr && s.c.src.raw != null && s.c.src.rounded === true ? esc(' · 원래 값 ' + s.c.src.raw) : '') + '</div>';
    if (!cands.length || !s) return h + '<p class="bd-w-hint">이 칸은 이사회 자료에 쓰지 않습니다.</p>' + note;
    const row = function (o) {
      const x = bw.selected(ws, o), i = bw.cellInfo(x.t, x.c), on = ui.sel.t === o.t && ui.sel.key === o.key;
      const name = (x.t.mapping ? '(' + x.t.mapping + ') ' : '') + bw.pathText(x.c, x.t);
      const val = '<span class="bd-src-val mono">' + esc(x.c.value === '' ? '빈 칸' : x.c.value + (x.c.convert && x.c.convert.unit_to ? ' ' + x.c.convert.unit_to : '')) + '</span>' +
        (i.edited ? '<span class="bd-w-chip is-warn">수정됨' + (i.hasOrig ? ' · 원본 ' + esc(x.c.orig) : '') + '</span>' : '');
      return cands.length > 1
        ? '<label class="bd-src-cand' + (on ? ' is-on' : '') + '"><input type="radio" name="bd-src-cand" data-w="srccand" data-v="' + esc(o.t + '|' + o.key) + '"' + (on ? ' checked' : '') + '> <span>' + esc(name) + '</span>' + val + '</label>'
        : '<div class="bd-src-cand is-on"><span>' + esc(name) + '</span>' + val + '</div>';
    };
    h += '<div class="bd-src-owners" role="' + (cands.length > 1 ? 'radiogroup' : 'group') + '" aria-label="이 칸을 쓰는 이사회 칸"><div class="bd-src-sub">이 칸을 쓰는 이사회 칸 ' + cands.length + '개</div>' + cands.map(row).join('') + '</div>';
    // 계산(합산·환산) — 구성 칸 주소는 누르면 원본 표에서 그 칸으로 이동한다
    const L = bw.infoLines(s.t, s.c);
    const calc = L.filter(function (l) { return l.k === 'calc'; });
    const partCells = (s.c.parts || []).filter(function (q) { return q.cell !== ''; });
    if (partCells.length > 1) {
      h += '<div class="bd-w-calc">구성 칸 ' + partCells.length + '개: ' + partCells.slice(0, 12).map(function (q) {
        return '<button type="button" class="link-btn mono" data-w="srcpart" data-v="' + esc(cleanRef(q.cell)) + '">' + esc(q.cell) + '</button>';
      }).join(' ') + (partCells.length > 12 ? ' 외 ' + (partCells.length - 12) + '칸' : '') + '</div>';
    }
    calc.forEach(function (l) { h += '<div class="bd-w-calc' + (l.mono ? ' mono' : '') + '">' + esc(l.text) + '</div>'; });
    const unit = s.c.convert && s.c.convert.unit_to ? ' (' + s.c.convert.unit_to + ')' : '';
    const i0 = bw.cellInfo(s.t, s.c);
    h += '<label class="bd-src-lab" for="bd-src-in">이사회 자료에 넣을 값' + esc(unit) + '</label>' +
      '<input type="text" id="bd-src-in" class="bd-w-in" maxlength="' + MAX_CELL + '" value="' + esc(bw.popInputText(ws, ui)) + '"' + (p.err ? ' aria-invalid="true"' : '') + ' aria-describedby="bd-src-note">';
    if (i0.edited && i0.hasOrig) h += '<div class="bd-src-sub">수정 사유(선택)</div>' + bw.whyHtml(s.c);
    h += '<div class="bd-src-foot"><div class="bd-src-btns"><button type="button" class="bd-src-apply" data-w="srcapply">적용</button>' +
      (i0.edited ? '<button type="button" data-w="srcrevert">원본 값으로</button>' : '') +
      '<button type="button" data-w="srccancel">취소</button></div>' + note + '</div>';
    return h;
  };
  // 이사회 칸 이름(머리글 제외 표 제목 + 행·열): '5. 수익성 분석 › 명목가치 › 총기대수익'
  bw.pathText = function (c, t) { return str(c.label || t.title).replace(/ · /g, ' › '); };
  bw.popHtml = function (ws, ui) {
    const p = ui.pop || {}, sheets = bw.mergeSources(ws), sel = p.at ? ui.sel : null, n = bw.srcEditedCount(ws);
    const jumps = [];
    sheets.forEach(function (sh) {
      sh.tags.forEach(function (tg) {
        jumps.push('<button type="button" class="bd-w-srcjump" data-w="srcjump" data-v="' + esc(tg.ref) + '" aria-label="' + esc(tg.label + ' 표 원본으로 이동') + '"' +
          (sel && sel.t === tg.ref ? ' aria-current="true"' : '') + '>' + esc(tg.label) + '</button>');
      });
    });
    const ranges = sheets.map(function (sh) { return sh.sheet + ' · ' + sh.range; }).join(' / ');
    return '<div class="modal-box bd-src-box" role="dialog" aria-modal="true" aria-labelledby="bd-src-title">' +
      '<header class="bd-src-head"><h3 id="bd-src-title" title="' + esc(ws.fileName) + '">수익성 분석표 · ' + esc(ws.fileName) + '</h3>' +
      '<span class="bd-src-range mono">' + esc(ranges) + '</span>' +
      '<span class="bd-src-jumps" role="group" aria-label="원본 표로 이동">' + jumps.join('') + '</span>' +
      '<span class="bd-src-btns"><button type="button" data-w="srcedited" aria-pressed="' + !!p.onlyEdited + '"' + (n > 0 ? '' : ' disabled') + '>고친 칸만 표시 ' + n + '</button>' +
      '<button type="button" data-w="srcclose">닫기</button></span></header>' +
      '<div class="bd-src-main">' + bw.srcBodyHtml(ws, ui) + '<aside class="bd-src-edit" id="bd-src-edit" aria-label="이사회 칸 고치기">' + bw.popEditHtml(ws, ui) + '</aside></div></div>';
  };
  bw.statusHtml = function (ws, ui) {
    const sel = bw.selected(ws, ui.sel);
    let h = '';
    if (sel && ui.ask && ui.ask.t === sel.t.ref && ui.ask.key === sel.c.key) return bw.askHtml(sel.t, sel.c);
    if (ui.edit) return '<span class="bd-w-hint">값을 고치는 중입니다. Enter로 확정하고 Esc로 취소합니다.</span>';
    if (!sel || ui.pop) return '';   // 칸을 고르지 않았거나 팝업이 열려 있으면 상태 줄은 숨는다(안내 문구 없음)
    // 한 줄: {표 › 행 › 열} │ 대조 줄 │ [분석표에서 보기] │ (고친 칸이면) 사유 + [원본 값으로]
    // 계산 줄·부분 칸 목록·경고 문구는 툴팁(#bd-tip)과 팝업 편집 영역에만 둔다.
    const i = bw.cellInfo(sel.t, sel.c), cmp = bw.compareLine(sel.t, sel.c);
    h = '<span class="bd-w-path">' + esc(bw.pathText(sel.c, sel.t)) + '</span>' +
      (cmp ? '<span class="bd-w-sep" aria-hidden="true">│</span><span class="bd-w-cmp mono">' + esc(cmp) + '</span>' : '');
    if (i.unreadable) {
      const nt = bw.infoLines(sel.t, sel.c).filter(function (l) { return l.k === 'note'; })[0];
      if (nt) h += '<span class="bd-w-note">' + esc(nt.text) + '</span>';
    }
    if (sel.c.src) h += '<button type="button" data-w="srcopen" data-v="*">분석표에서 보기</button>';
    if (i.edited && i.hasOrig) h += bw.whyHtml(sel.c);
    if (i.edited) h += '<button type="button" data-w="revert">원본 값으로</button>';
    return h;   // 알림 문장(ui.live)은 writeHtml의 고정 알림 줄(#bd-w-live)에만 둔다
  };
  bw.writeHtml = function (ws, ui) {
    const y = ws ? bw.tally(ws) : null;
    let h = '<div class="bd-w" id="bd-w">' + bw.barHtml(ws, ui);
    if (ui.leave) h += bw.leaveHtml(ui.leave, y);
    if (ui.rej) h += bw.rejHtml(ui.rej);
    if (ui.upload) h += bw.uploadingHtml(); else if (!ws) h += bw.dropHtml(ui);
    if (ws) {
      const rv = bw.roveKey(ws, ui.sel);
      h += bw.summaryHtml(ws) + bw.filterHtml(ws) + bw.reviewHtml(ws) +
        '<div class="bd-w-tables' + (ui.sel ? ' is-focusing' : '') + '" id="bd-w-tables">' +
        ws.tables.map(function (t) { return bw.cardHtml(ws, t, ui, rv); }).join('') + '</div>' +
        '<div id="bd-w-status" class="bd-w-status' + (bw.statusIdle(ws, ui) ? ' is-idle' : ' is-focusing') + '"><div id="bd-w-statusbody" class="bd-w-statusbody">' + bw.statusHtml(ws, ui) + '</div>' +
        '<div id="bd-w-live" class="' + bw.liveClass(ws, ui) + '" role="status" aria-live="polite">' + esc(ui.live) + '</div></div>';
    }
    return h + '</div>';
  };

  // ── ③ 복사: HTML 표 + 탭 텍스트 ──────────────────────────────
  // 복사 값 = 화면 현재 값. 상태 표시(틴트·체크·삼각형·보조 줄·사유·원래 값)는 넣지 않는다.
  function oneLine(s) { return str(s).replace(/[\t\r\n]+/g, ' ').trim(); }
  function cellTextOf(t) {
    return function (o) { const k = str(o.key); return ((o.mapped === true || o.input === true) && has(t.cells, k)) ? t.cells[k].value : str(o.text); };
  }
  function tsvRows(rows, textOf) {
    const g = [];
    rows.forEach(function (row, r) {
      g[r] = g[r] || [];
      let col = 0;
      (Array.isArray(row) ? row : []).forEach(function (fc) {
        while (g[r][col] !== undefined) col++;
        const o = (fc && typeof fc === 'object') ? fc : { text: fc };
        const cs = span(o.colspan), rs = span(o.rowspan), txt = oneLine(textOf(o));
        for (let rr = r; rr < Math.min(r + rs, rows.length); rr++) {
          g[rr] = g[rr] || [];
          for (let cc = col; cc < col + cs; cc++) g[rr][cc] = (rr === r && cc === col) ? txt : '';
        }
        col += cs;
      });
    });
    return g.map(function (line) { const a = []; for (let i = 0; i < line.length; i++) a.push(line[i] === undefined ? '' : line[i]); return a.join('\t'); });
  }
  const TD = 'border:1px solid #000;padding:2px 6px;';
  function htmlRows(rows, textOf) {
    return rows.map(function (row) {
      return '<tr>' + (Array.isArray(row) ? row : []).map(function (fc) {
        const o = (fc && typeof fc === 'object') ? fc : { text: fc };
        const header = o.header === true, txt = textOf(o), tag = header ? 'th' : 'td';
        const al = ALIGNS[o.align] ? o.align : (header ? 'center' : (bw.shownNum(txt) != null ? 'right' : 'left'));
        const cs = span(o.colspan), rs = span(o.rowspan);
        return '<' + tag + (cs > 1 ? ' colspan="' + cs + '"' : '') + (rs > 1 ? ' rowspan="' + rs + '"' : '') + ' style="' + TD + 'text-align:' + al +
          (header ? ';font-weight:bold;background:#f2f2f2' : '') + '">' + esc(txt).replace(/\n/g, '<br>') + '</' + tag + '>';
      }).join('') + '</tr>';
    }).join('');
  }
  bw.tableCopy = function (ws, t) {
    const textOf = cellTextOf(t), hdr = headerInRows(t.rows);
    const colsLine = (!hdr && t.columns.length) ? t.columns.map(function (c) { return oneLine(c && typeof c === 'object' ? c.text : c); }) : null;
    const lines = [];
    if (t.title) lines.push(oneLine(t.title));
    if (colsLine) lines.push(colsLine.join('\t'));
    tsvRows(t.rows, textOf).forEach(function (l) { lines.push(l); });
    t.notes.forEach(function (n) { lines.push(oneLine(n)); });
    const head = colsLine ? '<tr>' + colsLine.map(function (c) { return '<th style="' + TD + 'text-align:center;font-weight:bold;background:#f2f2f2">' + esc(c) + '</th>'; }).join('') + '</tr>' : '';
    const html = '<div>' + (t.title ? '<p style="margin:0 0 4px;font-weight:bold">' + esc(t.title) + '</p>' : '') +
      '<table border="1" cellspacing="0" cellpadding="3" style="border-collapse:collapse;border:1px solid #000"><tbody>' + head + htmlRows(t.rows, textOf) + '</tbody></table>' +
      t.notes.map(function (n) { return '<p style="margin:4px 0 0;font-size:90%">' + esc(n) + '</p>'; }).join('') + '</div>';
    return { html: html, text: lines.join('\n') };
  };
  bw.allCopy = function (ws) {
    const ps = ws.tables.map(function (t) { return bw.tableCopy(ws, t); });
    return { html: ps.map(function (p) { return p.html; }).join('<p style="margin:0">&nbsp;</p>'), text: ps.map(function (p) { return p.text; }).join('\n\n') };
  };
  // 복사 뒤 덧붙임: 막지 않고 알리기만 한다.
  bw.copyExtras = function (ws, tables) {
    let unchecked = 0, sumBad = 0, review = 0;
    tables.forEach(function (t) {
      if (t.needsReview) review++;
      if (t.order.length && !t.checked) unchecked++;
      t.order.forEach(function (k) { if (bw.cellInfo(t, t.cells[k]).sumBad) sumBad++; });
    });
    const out = [];
    if (unchecked) out.push('확인하지 않은 표 ' + unchecked + '개');
    if (sumBad) out.push('합계 차이 ' + sumBad + '곳');
    if (review) out.push('머리글 주의 표 ' + review + '개');
    return out;
  };
  // scope: 'all' | 표 ref. r: copyToClipboard 결과
  bw.copyNote = function (ws, scope, r) {
    const tables = scope === 'all' ? ws.tables : ws.tables.filter(function (t) { return t.ref === scope; });
    let s = scope === 'all' ? '표 ' + tables.length + '개를 제목·주석과 함께 복사했습니다. 워드에서 Ctrl+V로 붙여 넣으세요.'
      : '‘' + [tables[0] && tables[0].mapping, tables[0] && tables[0].title].filter(Boolean).join(' ') + '’ 표를 복사했습니다. 워드에서 Ctrl+V로 붙여 넣으세요.';
    const ex = bw.copyExtras(ws, tables);
    if (ex.length) {
      // 조사: 마지막 낱말이 받침으로 끝나면 '이'(…곳), 아니면 '가'(…개) — 보강 규격 §3 문구
      const last = ex[ex.length - 1], code = last.charCodeAt(last.length - 1);
      const batchim = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
      s += ' ' + ex.join(' / ') + (batchim ? '이' : '가') + ' 그대로 들어 있습니다.';
    }
    if (r && r.rich === false) s += ' 표 서식 없이 글자만 복사됐습니다. 워드에서 표가 안 되면 [초안 워드 내려받기]를 쓰세요.';
    return s;
  };
  bw.COPY_FAIL = '복사하지 못했습니다. 이 화면에서 복사가 막혀 있으면 [초안 워드 내려받기]로 받아 주세요.';
  // env: {navigator, document, ClipboardItem, Blob, isSecureContext}. 항상 Promise<{ok, rich, via}>.
  // 1) 보안 컨텍스트(https·localhost)면 ClipboardItem(HTML+텍스트)  2) 아니면(http 폐쇄망 등)·실패하면 copy 이벤트에 HTML을 얹는 execCommand  3) 둘 다 안 되면 ok:false.
  bw.copyToClipboard = function (p, env) {
    const e = env || {}, nav = e.navigator, doc = e.document;
    function viaExec() {
      try {
        if (!doc || !doc.body || typeof doc.execCommand !== 'function') return { ok: false };
        const ta = doc.createElement('textarea');
        ta.value = p.text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        doc.body.appendChild(ta); ta.select();
        let handled = false, ok = false;
        const onCopy = function (ev) {
          if (ev.clipboardData) { ev.clipboardData.setData('text/html', p.html); ev.clipboardData.setData('text/plain', p.text); ev.preventDefault(); handled = true; }
        };
        doc.addEventListener('copy', onCopy);
        try { ok = doc.execCommand('copy'); } finally { doc.removeEventListener('copy', onCopy); doc.body.removeChild(ta); }
        return ok ? { ok: true, rich: handled, via: 'exec' } : { ok: false };
      } catch (x) { return { ok: false }; }
    }
    const canAsync = e.isSecureContext !== false && nav && nav.clipboard && typeof nav.clipboard.write === 'function' &&
      typeof e.ClipboardItem === 'function' && typeof e.Blob === 'function';
    if (canAsync) {
      try {
        const item = new e.ClipboardItem({ 'text/html': new e.Blob([p.html], { type: 'text/html' }), 'text/plain': new e.Blob([p.text], { type: 'text/plain' }) });
        return nav.clipboard.write([item]).then(function () { return { ok: true, rich: true, via: 'clipboard' }; }, function () { return viaExec(); });
      } catch (x) { return Promise.resolve(viaExec()); }
    }
    return Promise.resolve(viaExec());
  };
  bw.copyBtnHtml = function (t, ui) {
    const n = ui.copyNote && ui.copyNote.scope === t.ref ? ui.copyNote : null;
    // 카드 머리 오른쪽 순서: [원본 보기] → [이 표 복사] → [이 표 확인](마지막 행동이라 맨 끝)
    return '<span class="bd-w-copy">' +
      (n ? '<span class="bd-w-note' + (n.err ? ' bd-err' : '') + '" role="' + (n.err ? 'alert' : 'status') + '">' + esc(n.text) + '</span>' : '') +
      (t.grid ? '<button type="button" data-w="srcopen" data-v="' + esc(t.ref) + '">원본 보기</button>' : '') +
      '<button type="button" data-w="copy1" data-v="' + esc(t.ref) + '">이 표 복사</button>' + bw.tcheckHtml(t) + '</span>';
  };
  bw.tcheckHtml = function (t) {
    if (!t.order.length) return '';
    return (t.checked ? '<span class="bd-w-chip is-done">확인함 · ' + esc((t.checked.who ? t.checked.who + ' ' : '') + t.checked.at) + '</span>' : '') +
      '<label class="bd-w-tcheck' + (t.checked ? ' is-on' : '') + '"><input type="checkbox" data-w="tcheck" data-v="' + esc(t.ref) + '"' + (t.checked ? ' checked' : '') + '> 이 표 확인 <span class="bd-w-tn">' + t.order.length + '칸</span></label>';
  };
  bw.copyAllNoteHtml = function (ui) {
    const n = ui.copyNote && ui.copyNote.scope === 'all' ? ui.copyNote : null;
    return n ? '<span class="bd-w-note' + (n.err ? ' bd-err' : '') + '" role="' + (n.err ? 'alert' : 'status') + '">' + esc(n.text) + '</span>' : '';
  };

  // ── 키보드·툴팁 순수 함수 ──────────────────────────────────
  // Esc는 한 번에 하나만 닫는다: 툴팁 → 입력 → 고치기 전 확인 → 사유 → 확인 줄 → 선택.
  bw.escAction = function (s) {
    const x = s || {};
    if (x.tip) return 'tip';
    if (x.edit) return 'edit';
    if (x.ask) return 'ask';
    if (x.reason) return 'reason';
    if (x.leave) return 'leave';
    if (x.sel) return 'sel';
    return 'none';
  };
  bw.tipAllowed = function (ui) { return !ui.leave && !ui.edit && !ui.ask && !ui.pop; };
  // 칸 위 4px·왼쪽 정렬. 위 공간이 작성 줄+8px보다 좁으면 아래, 가장자리 8px 안, 원본 패널(limitRight)은 가리지 않는다.
  // coverTop(선택): 아래쪽을 덮는 고정 패널(좁은 화면의 원본 패널·상태 줄)의 위쪽 y. 없으면 뷰포트 아래.
  bw.tipPlace = function (cell, tip, vp, barBottom, limitRight, coverTop) {
    const gap = 4, edge = 8;
    const floor = coverTop > 0 ? Math.min(coverTop, vp.h) : vp.h;
    let top = cell.top - gap - tip.h, below = false;
    if (top < (barBottom || 0) + edge) { top = cell.bottom + gap; below = true; }
    if (below && top + tip.h > floor - edge) {
      // 아래에도 자리가 없으면, 위쪽에 두되 작성 줄 아래로 밀어 칸 근처에 둔다(칸을 조금 가려도 사이드바 위로 날아가지 않는다).
      top = coverTop > 0 ? Math.max((barBottom || 0) + edge, cell.top - gap - tip.h) : Math.max(edge, vp.h - edge - tip.h);
      if (coverTop > 0) below = false;
    }
    const maxRight = limitRight > 0 ? Math.min(limitRight, vp.w - edge) : vp.w - edge;
    let left = Math.min(cell.left, maxRight - tip.w);
    if (left < edge) left = edge;
    return { left: left, top: top, below: below };
  };
  // items: 보이는 칸들의 중심 {cx, cy, h}. 방향키 → 다음 칸 인덱스(-1이면 이동 없음).
  bw.navTarget = function (items, idx, dir) {
    const cur = items[idx];
    if (!cur) return -1;
    const tol = Math.max(2, (cur.h || 0) / 2);
    let best = -1, bd = Infinity;
    for (let i = 0; i < items.length; i++) {
      if (i === idx) continue;
      const dx = items[i].cx - cur.cx, dy = items[i].cy - cur.cy;
      let ok, score;
      if (dir === 'left' || dir === 'right') { ok = Math.abs(dy) <= tol && (dir === 'left' ? dx < -0.5 : dx > 0.5); score = Math.abs(dx); }
      else { ok = dir === 'up' ? dy < -tol : dy > tol; score = Math.abs(dy) * 1000 + Math.abs(dx); }
      if (ok && score < bd) { bd = score; best = i; }
    }
    return best;
  };
  bw.linearTarget = function (n, idx, delta) { const j = idx + delta; return (idx >= 0 && j >= 0 && j < n) ? j : -1; };

  // ── DOM 배선 ─────────────────────────────────────────────
  // env: {el(id), doFetch, scroller(), ctx()→{id,form}|null, epoch(), who(), now(), exit(focusSelector)}
  bw.createController = function (env) {
    let ws = null, formDoc = null, ui = freshUi(), active = false, attached = false;
    let upTok = 0, abortCtl = null, fileInput = null, pointer = false;
    let tipEl = null, tipFor = null, tipTimer = 0, tipHideTimer = 0, hoverTd = null;

    function $(id) { return env.el(id); }
    function bodyEl() { return env.el('bd-body'); }
    function cellsAll() { const b = bodyEl(); return b ? b.querySelectorAll('td.bd-w-cell') : []; }
    function cellOf(n) { return (n && n.closest) ? n.closest('td.bd-w-cell') : null; }
    function findCell(t, key) {
      const l = cellsAll();
      for (let i = 0; i < l.length; i++) if (l[i].getAttribute('data-t') === t && l[i].getAttribute('data-key') === key) return l[i];
      return null;
    }
    function lookup(t, key) { const tb = ws && findT(ws, t); return tb && tb.cells[key] ? { t: tb, c: tb.cells[key] } : null; }
    function rctx() { return { formName: ui.form ? ui.form.name : '', maxMb: ui.maxMb }; }

    function focusTarget(f) {
      if (!f) return;
      let n = null;
      if (f.cell) { const r = ui.sel || (ws && bw.roveKey(ws, null)); n = r ? findCell(r.t, r.key) : null; }
      else if (f.id) n = $(f.id);
      else if (f.w) {
        const l = bodyEl().querySelectorAll('[data-w]');
        for (let i = 0; i < l.length; i++) {
          if (l[i].getAttribute('data-w') === f.w && (f.v == null || l[i].getAttribute('data-v') === f.v)) { n = l[i]; break; }
        }
      }
      if (n && !n.disabled && n.focus) n.focus();
    }
    function measureBar() {
      const bar = $('bd-writebar'), r = $('bd-root');
      if (bar && r) r.style.setProperty('--bd-bar-h', bar.offsetHeight + 'px');
    }
    // 아래 고정 상태 줄이 뷰포트 아래에서 차지하는 높이를 CSS 변수로 넘긴다(칸의 scroll-margin-bottom 이 쓴다). 숨은(is-idle) 상태 줄은 0.
    function statusShown() { const st = $('bd-w-status'); return !!st && !st.classList.contains('is-idle'); }
    function measureStatus() {
      const r = $('bd-root'), st = $('bd-w-status');
      if (!r) return;
      const h = (st && statusShown()) ? Math.max(0, Math.round((window.innerHeight || 0) - st.getBoundingClientRect().top)) : 0;
      r.style.setProperty('--bd-occl-b', h + 'px');
    }
    // 칸이 작성 바 아래 ~ 아래쪽 고정 상태 줄 위 사이에 오도록 스크롤한다(WCAG 2.4.11 가려지지 않는 포커스).
    function ensureVisible(td) {
      const sc = env.scroller();
      if (!td || !td.getBoundingClientRect || !sc) return;
      const bar = $('bd-writebar'), st = $('bd-w-status'), cr = td.getBoundingClientRect();
      const covers = [];
      if (st && statusShown()) {
        const q = st.getBoundingClientRect();
        covers.push({ top: q.top, left: q.left, right: q.right });
      }
      const band = bw.visibleBand({ vpH: window.innerHeight, barBottom: bar ? bar.getBoundingClientRect().bottom : 0, covers: covers, cell: { left: cr.left, right: cr.right } });
      const d = bw.scrollDelta({ top: cr.top, bottom: cr.bottom }, band);
      if (d) sc.scrollTop += d;
    }
    // 원본 칸의 스크롤 영역 안 위치(내용 좌표)와 고정 머리 크기.
    function srcMetrics(body, td) {
      const b = body.getBoundingClientRect(), r = td.getBoundingClientRect();
      const tbl = td.closest ? td.closest('table') : null, th = tbl ? tbl.querySelector('thead th') : null, rh = td.parentNode ? td.parentNode.firstElementChild : null;
      return { cell: { top: r.top - b.top - body.clientTop + body.scrollTop, left: r.left - b.left - body.clientLeft + body.scrollLeft, w: r.width, h: r.height },
               lead: { top: th ? th.offsetHeight : 0, left: rh ? rh.offsetWidth : 0 } };
    }
    // 페이지 스크롤은 건드리지 않고 #bd-w-srcbody 안에서만 가운데로(이미 다 보이면 그대로).
    function scrollSrcTo(td) {
      const body = $('bd-w-srcbody');
      if (!body || !td) return;
      const m = srcMetrics(body, td);
      const to = bw.centerScroll({ st: body.scrollTop, sl: body.scrollLeft, w: body.clientWidth, h: body.clientHeight,
                                   sw: body.scrollWidth, sh: body.scrollHeight, lead: m.lead, cell: m.cell });
      body.scrollTop = to.top; body.scrollLeft = to.left;
    }
    function jumpSrc(ref) {
      const body = $('bd-w-srcbody');
      if (!body) return;
      const l = body.querySelectorAll('td[data-tstart]');
      for (let i = 0; i < l.length; i++) {
        if ((l[i].getAttribute('data-tstart') || '').split(' ').indexOf(ref) < 0) continue;
        const m = srcMetrics(body, l[i]);
        body.scrollTop = bw.alignScroll(m.cell.top, m.lead.top, body.clientHeight, body.scrollHeight);
        body.scrollLeft = bw.alignScroll(m.cell.left, m.lead.left, body.clientWidth, body.scrollWidth);
        return;
      }
    }
    function draw(focus) {
      const b = bodyEl();
      if (!b) return;
      const inp = $('bd-w-in');
      if (inp && ui.edit) ui.edit.text = inp.value;   // 다시 그려도 입력 중인 글자는 남긴다
      hideTip();
      const sc = env.scroller(), top = sc ? sc.scrollTop : 0;
      b.innerHTML = bw.writeHtml(ws, ui);
      if (sc) sc.scrollTop = top;
      measureBar();
      measureStatus();
      markStuck();
      focusTarget(focus);
    }
    function drawStatus() {
      const st = $('bd-w-status');
      if (st) { const idle = bw.statusIdle(ws, ui); st.classList.toggle('is-idle', idle); st.classList.toggle('is-focusing', !idle); }
      const n = $('bd-w-statusbody'); if (n) n.innerHTML = bw.statusHtml(ws, ui);
      const l = $('bd-w-live'); if (l) { l.textContent = ui.live || ''; l.className = bw.liveClass(ws, ui); }   // 알림 줄만 읽힌다(상태 줄 본문은 읽지 않는다)
      measureStatus();   // 상태 줄이 나타나거나 사라지면 가려짐 여백도 따라간다
    }

    // 선택은 다시 그리지 않고 클래스만 바꾼다(포커스·스크롤 유지).
    function applySel() {
      const s = ui.sel, l = cellsAll();
      for (let i = 0; i < l.length; i++) {
        const on = !!s && l[i].getAttribute('data-t') === s.t && l[i].getAttribute('data-key') === s.key;
        l[i].classList.toggle('is-sel', on);
        l[i].setAttribute('aria-selected', on ? 'true' : 'false');
        if (s) l[i].tabIndex = on ? 0 : -1;
      }
      // 선택 스포트라이트: 선택이 있으면 표 영역·선택 칸이 든 카드에 표시, 해제하면 모두 뗀다. 상태 줄은 선택이 있을 때만 보인다.
      const root = bodyEl(), gr = $('bd-w-tables'), cards = root.querySelectorAll('.bd-w-card');
      if (gr) gr.classList.toggle('is-focusing', !!s);
      for (let q = 0; q < cards.length; q++) cards[q].classList.toggle('has-sel', !!s && cards[q].getAttribute('data-t') === s.t);
    }
    // 상태 줄 높이가 선택 때문에 달라지므로 측정 뒤 맞추고, 레이아웃이 끝난 다음 프레임에 한 번 더 맞춘다.
    function keepVisible(n) {
      if (!n) return;
      bw.settleVisible({ measure: measureStatus, ensure: function () { ensureVisible(n); },
        raf: typeof requestAnimationFrame === 'function' ? function (fn) { return requestAnimationFrame(fn); } : null, alive: function () { return active && n.isConnected; } });
    }
    // 작성 바가 붙은 뒤에만 위쪽 틈 띠(::before)를 보이게 한다(스크롤 0 에서는 위쪽 툴바를 덮지 않는다).
    function markStuck() {
      const bar = $('bd-writebar'), sc = env.scroller();
      if (bar && sc) bar.classList.toggle('is-stuck', bw.isStuck(bar.getBoundingClientRect().top, sc.getBoundingClientRect().top));
    }
    function select(t, key, o) {
      const opt = o || {};
      if (ui.sel && ui.sel.t === t && ui.sel.key === key && !opt.force) {
        // 마우스: mousedown 의 focusin 이 먼저 선택하고 상태 줄이 자란 뒤 click 이 온다 — 여기서 한 번 더 가림을 푼다.
        if (opt.focus) keepVisible(findCell(t, key));
        return;
      }
      ui.sel = { t: t, key: key };
      const ss = lookup(t, key);
      ui.live = ss ? bw.compareLine(ss.t, ss.c) : '';   // 읽어 주는 첫 줄 = 상태 줄 첫 줄(대조 결과)
      hideTip();
      applySel(); drawStatus();
      if (opt.focus) { const n = findCell(t, key); if (n) { n.focus({ preventScroll: true }); keepVisible(n); } }
      if (opt.tip) tipLater(findCell(t, key), 400);
    }

    // ── 출처 툴팁: 문서에 노드 하나(#bd-tip), 보일 때만 칸에 aria-describedby ──
    function tipNode() {
      if (tipEl && tipEl.parentNode) return tipEl;
      tipEl = document.getElementById('bd-tip');
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.id = 'bd-tip';
        tipEl.setAttribute('role', 'tooltip');
        document.body.appendChild(tipEl);
      }
      tipEl.onmouseenter = function () { clearTimeout(tipHideTimer); };
      tipEl.onmouseleave = function () { tipHideTimer = setTimeout(hideTip, 100); };
      return tipEl;
    }
    function onTipKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideTip(); } }
    function tipLater(td, ms) {
      clearTimeout(tipTimer);
      if (!td || !bw.tipAllowed(ui)) return;
      tipTimer = setTimeout(function () { showTip(td); }, ms);
    }
    function showTip(td) {
      if (!active || !td.isConnected || !td.offsetParent || !bw.tipAllowed(ui)) return;   // 다른 탭으로 가려졌으면 띄우지 않는다
      const s = lookup(td.getAttribute('data-t'), td.getAttribute('data-key'));
      if (!s) return;
      if (tipFor && tipFor !== td) tipFor.removeAttribute('aria-describedby');
      const tip = tipNode();
      tip.innerHTML = bw.tipHtml(s.t, s.c);
      const r = td.getBoundingClientRect(), bar = $('bd-writebar'), st = $('bd-w-status');
      const covers = [];
      if (st && statusShown()) covers.push(st.getBoundingClientRect().top);
      const p = bw.tipPlace({ left: r.left, top: r.top, bottom: r.bottom }, { w: tip.offsetWidth, h: tip.offsetHeight },
        { w: window.innerWidth, h: window.innerHeight }, bar ? bar.getBoundingClientRect().bottom : 0,
        0, covers.length ? Math.min.apply(null, covers) : 0);
      tip.style.left = p.left + 'px'; tip.style.top = p.top + 'px';
      tip.classList.add('is-on');
      td.setAttribute('aria-describedby', 'bd-tip');
      tipFor = td;
      document.addEventListener('keydown', onTipKey, true);
    }
    function hideTip() {
      clearTimeout(tipTimer); clearTimeout(tipHideTimer);
      if (tipEl) tipEl.classList.remove('is-on');
      if (tipFor) { tipFor.removeAttribute('aria-describedby'); tipFor = null; }
      document.removeEventListener('keydown', onTipKey, true);
    }
    function onOver(e) {
      if (!active) return;
      const td = cellOf(e.target);
      if (!td) return;
      clearTimeout(tipHideTimer);
      if (td === hoverTd) return;
      hoverTd = td;
      if (tipFor && tipFor !== td) hideTip();
      tipLater(td, 500);
    }
    function onOut(e) {
      const td = cellOf(e.target);
      if (!td) return;
      const to = e.relatedTarget;
      if (to && td.contains(to)) return;
      if (to && tipEl && (to === tipEl || tipEl.contains(to))) return;   // 툴팁 위로 옮기는 것은 허용(WCAG 1.4.13)
      hoverTd = null; clearTimeout(tipTimer);
      tipHideTimer = setTimeout(hideTip, 100);
    }

    // ── 업로드·초안·확인 ──
    function pickFile() {
      if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = '.xlsx,.xlsm'; fileInput.tabIndex = -1;
        fileInput.style.display = 'none'; fileInput.setAttribute('aria-hidden', 'true');
        fileInput.addEventListener('change', function () {
          const f = fileInput.files && fileInput.files[0];
          fileInput.value = '';
          if (f) startUpload(f);
        });
        (env.el('bd-root') || document.body).appendChild(fileInput);
      }
      fileInput.value = '';
      fileInput.click();
    }
    function startUpload(file) {
      if (!active || !formDoc) return;
      const bad = bw.checkFile(file, ui.maxMb);
      const rc = rctx(); rc.fileName = file && file.name;
      if (bad) { ui.rej = bw.rejectFrom({ status: 0, body: { detail: bad } }, rc); draw({ id: 'bd-w-rej' }); return; }
      const tok = ++upTok, ep = env.epoch();
      ui.rej = null; ui.upload = { name: file.name }; ui.live = '';
      draw({ id: 'bd-w-abort' });
      abortCtl = typeof AbortController === 'function' ? new AbortController() : null;
      bw.upload(env.doFetch, ui.form.id, ui.form.isBase ? null : ui.form.version, file, abortCtl ? abortCtl.signal : null).then(function (res) {
        if (tok !== upTok || ep !== env.epoch() || !active) return;   // 취소·계정 변경·작성 종료 뒤의 응답은 버린다
        ui.upload = null; abortCtl = null;
        if (res.ok && res.body && Array.isArray(res.body.tables)) {
          ws = bw.buildState(formDoc, res.body, { fileName: file.name, formId: ui.form.id, version: ui.form.version });
          ui.rej = null; ui.sel = null; ui.live = ''; ui.draftNote = ''; ui.draftErr = false; ui.copyNote = null;
          draw({ id: 'bd-w-sum' });
          return;
        }
        ui.rej = bw.rejectFrom(res, rc);
        draw({ id: 'bd-w-rej' });
      });
    }
    function abortUpload() {
      ++upTok;
      if (abortCtl) abortCtl.abort();
      abortCtl = null; ui.upload = null;
      draw({ w: ws ? 'swap' : 'pick' });
    }
    function doDraft() {
      if (!ws || ui.draftBusy) return;
      ui.draftBusy = true; ui.draftNote = ''; ui.draftErr = false;
      draw({ id: 'bd-writebar' });
      const ep = env.epoch();
      bw.fetchDraft(env.doFetch, ui.form.id, bw.draftBody(ws, ui.form.isBase ? null : ui.form.version)).then(function (res) {
        if (ep !== env.epoch() || !active) return;
        ui.draftBusy = false;
        if (!res.ok) { ui.draftNote = bw.draftErrorText(res); ui.draftErr = true; draw({ id: 'bd-w-draftnote' }); return; }
        const url = URL.createObjectURL(res.blob), a = document.createElement('a');
        a.href = url; a.download = bw.draftFileName(ws.name);
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        ui.draftNote = bw.draftDoneText(ws); ui.draftErr = false;
        draw({ id: 'bd-w-draft' });
      });
    }
    // 표 하나의 확인을 켜고 끈다. 모든 표를 확인하면 자동으로 '검수 완료', 하나라도 풀면 해제(낭독 문구).
    function toggleTable(ref) {
      const before = bw.tally(ws), next = bw.toggleCheck(ws, ref, env.who(), bw.hhmm(env.now()));
      if (next === ws) return;
      ws = next;
      const a = bw.tally(ws), wasAll = before.tm > 0 && before.tn === before.tm, isAll = a.tm > 0 && a.tn === a.tm;
      ui.live = (isAll && !wasAll) ? '모든 표를 확인해 검수 완료로 표시했습니다.' : (wasAll && !isAll ? '검수 완료를 해제했습니다.' : '');
      draw({ w: 'tcheck', v: ref });
    }
    function finish(focusSel) {
      active = false; ++upTok;
      if (abortCtl) abortCtl.abort();
      abortCtl = null; hideTip(); closePop({ silent: true }); ws = null; formDoc = null; ui = freshUi();
      env.exit(focusSel);
    }
    function askEnd() {
      if (bw.hasWork(ws)) { ui.leave = 'end'; draw({ id: 'bd-w-leave-no' }); } else finish();
    }
    function askSwap() {
      if (bw.hasWork(ws)) { ui.leave = 'swap'; draw({ id: 'bd-w-leave-no' }); } else pickFile();
    }

    // ── ② 수정 ──
    function openEdit(t, key, seed) {
      const s = lookup(t, key);
      if (!s) return;
      ui.edit = { t: t, key: key, text: seed == null ? s.c.value : seed };
      draw(null);
      const inp = $('bd-w-in');
      if (inp) { inp.focus(); if (seed == null) inp.select(); else inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
    // seed: 숫자 등을 쳐서 시작했을 때의 첫 글자. 확인 줄을 거치면 그 글자는 버린다.
    function beginEdit(t, key, seed) {
      const s = lookup(t, key);
      if (!s || ui.edit) return;
      if (bw.needsAsk(s.t, s.c)) {
        ui.sel = { t: t, key: key };
        ui.ask = { t: t, key: key };
        draw({ id: 'bd-w-ask-no' });
        return;
      }
      openEdit(t, key, seed);
    }
    function commitEdit() {
      const inp = $('bd-w-in');
      if (!ui.edit || !inp) return;
      const e0 = ui.edit, bad = bw.validateValue(inp.value);
      if (bad) { ui.live = bad; drawStatus(); inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
      const before = ws, r = bw.editCell(ws, e0.t, e0.key, inp.value);
      ui.edit = null; ws = r.ws;
      const msgs = [];
      if (r.released) msgs.push(bw.releaseText(r.released, findT(ws, e0.t)));
      bw.recheckLines(before, ws, e0.t, e0.key).forEach(function (m) { msgs.push(m); });
      ui.live = msgs.join(' ');
      let focus = { cell: true };
      const s = lookup(e0.t, e0.key);
      if (r.changed && s && bw.cellInfo(s.t, s.c).edited && bw.cellInfo(s.t, s.c).hasOrig && !s.c.whyAsked) {
        ws = bw.patchCell(ws, e0.t, e0.key, { whyAsked: true });   // 첫 수정 직후 1회만 사유 그룹으로 포커스
        focus = { w: 'why' };
      }
      draw(focus);
    }
    function cancelEdit() { ui.edit = null; draw({ cell: true }); }
    function setWhyFrom(id) {
      const s = ui.sel && lookup(ui.sel.t, ui.sel.key);
      if (!s) return;
      ws = bw.setWhy(ws, ui.sel.t, ui.sel.key, id, s.c.memo);
      draw(id === 'OTHER' ? { id: 'bd-w-memo' } : { cell: true });
    }
    function onInput(e) {
      if (!active || !e.target || e.target.id !== 'bd-w-memo' || !ui.sel) return;
      ws = bw.setWhy(ws, ui.sel.t, ui.sel.key, 'OTHER', e.target.value);   // 다시 그리지 않는다(포커스 유지)
      const n = e.target.value.length, cnt = $('bd-w-memocnt'), hint = $('bd-w-memohint');
      if (cnt) { cnt.textContent = n + '/100'; cnt.hidden = n < 80; }
      if (hint) hint.hidden = e.target.value.trim() !== '';
    }
    function onDblClick(e) {
      if (!active || ui.edit) return;
      const td = cellOf(e.target);
      if (td) beginEdit(td.getAttribute('data-t'), td.getAttribute('data-key'), null);
    }

    // ── ③ 복사 ──
    function doCopy(scope) {
      if (!ws) return;
      const t = scope === 'all' ? null : findT(ws, scope);
      if (scope !== 'all' && !t) return;
      const p = scope === 'all' ? bw.allCopy(ws) : bw.tableCopy(ws, t);
      // 사용자 클릭 안에서 바로 호출한다(비동기 클립보드는 제스처가 필요).
      bw.copyToClipboard(p, { navigator: navigator, document: document, ClipboardItem: window.ClipboardItem, Blob: window.Blob, isSecureContext: window.isSecureContext }).then(function (r) {
        if (!active || !ws) return;
        ui.copyNote = { scope: scope, text: r.ok ? bw.copyNote(ws, scope, r) : bw.COPY_FAIL, err: !r.ok };
        draw(scope === 'all' ? { w: 'copyall' } : { w: 'copy1', v: scope });
      });
    }

    // ── 수익성 분석표 팝업(보기 + 이사회 칸 고치기) ──
    // 팝업 노드는 bd-body 밖(문서 끝)에 한 개 둔다 — 작성 화면이 다시 그려져도 팝업의 스크롤·입력이 살아 있다.
    let popEl = null;
    function popNode() {
      if (popEl && popEl.parentNode) return popEl;
      popEl = document.getElementById('bd-src-pop');
      if (!popEl) {
        popEl = document.createElement('div');
        popEl.id = 'bd-src-pop'; popEl.className = 'modal-overlay bd-src-ov'; popEl.style.display = 'none';
        document.body.appendChild(popEl);
      }
      if (!popEl.getAttribute('data-wired')) {
        popEl.setAttribute('data-wired', '1');
        popEl.addEventListener('click', onPopClick);
        popEl.addEventListener('keydown', onPopKey);
        popEl.addEventListener('input', onPopInput);
      }
      return popEl;
    }
    function srcCell(at) {
      const b = $('bd-w-srcbody');
      return (b && at) ? b.querySelector('td[data-s="' + at.s + '"][data-r="' + at.r + '"][data-c="' + at.c + '"]') : null;
    }
    function popFocus(f) {
      if (!f) return;
      let n = null;
      if (f.cell) { n = srcCell(f.cell); if (n) { n.focus({ preventScroll: true }); scrollSrcTo(n); return; } }
      else if (f.id) n = $(f.id);
      else if (f.body) n = $('bd-w-srcbody');
      else if (f.w) {
        const l = popNode().querySelectorAll('[data-w]');
        for (let i = 0; i < l.length; i++) if (l[i].getAttribute('data-w') === f.w && (f.v == null || l[i].getAttribute('data-v') === f.v)) { n = l[i]; break; }
      }
      if (n && !n.disabled && n.focus) n.focus();
    }
    // keep: 쓰던 입력 글자를 남긴 채 다시 그린다. 스크롤(원본 표·편집 영역)은 항상 지킨다.
    function drawPop(focus, keep) {
      if (!ui.pop || !ws) return;
      const n = popNode();
      const inp = $('bd-src-in'); if (keep && inp) ui.pop.text = inp.value;
      const old = $('bd-w-srcbody'), st = old ? old.scrollTop : 0, sl = old ? old.scrollLeft : 0;
      const ed = $('bd-src-edit'), es = ed ? ed.scrollTop : 0;
      n.innerHTML = bw.popHtml(ws, ui);
      const nb = $('bd-w-srcbody'); if (nb) { nb.scrollTop = st; nb.scrollLeft = sl; }
      const ne = $('bd-src-edit'); if (ne) ne.scrollTop = es;
      // 낭독 영역(#bd-src-note)은 새로 만든 요소의 처음 내용이 낭독되지 않으므로, 빈 요소로 먼저 두고 글자만 채워 갱신으로 읽히게 한다
      const nt = $('bd-src-note');
      if (nt && nt.textContent) {
        const msg = nt.textContent; nt.textContent = '';
        setTimeout(function () { const cur = $('bd-src-note'); if (cur === nt && ui.pop) nt.textContent = msg; }, 30);
      }
      popFocus(focus);
    }
    function setInert(on) {
      const b = bodyEl();
      if (!b) return;
      if (on) { b.setAttribute('inert', ''); b.setAttribute('aria-hidden', 'true'); } else { b.removeAttribute('inert'); b.removeAttribute('aria-hidden'); }
    }
    // ret: 닫을 때 포커스를 돌려줄 버튼 {w, v}. ref: 카드의 [원본 보기]이면 그 표 ref(그 표 위치로 연다).
    function openPop(ret, ref) {
      if (!ws || ui.pop || ui.edit || ui.ask || ui.leave) return;
      const sheets = bw.mergeSources(ws);
      if (!sheets.length) return;
      hideTip();
      ui.pop = { at: null, text: null, onlyEdited: false, note: '', err: false, last: null, ret: ret || null };
      if (ui.sel && (ref == null || ui.sel.t === ref)) ui.pop.at = bw.popAtFor(sheets, ws, ui.sel);
      setInert(true);
      drawStatus();   // 상태 줄은 팝업이 열려 있는 동안 숨는다
      const n = popNode();
      n.style.display = 'block';
      drawPop(null);
      const at = ui.pop.at;
      if (at && srcCell(at)) { const td = srcCell(at); td.focus({ preventScroll: true }); scrollSrcTo(td); }
      else { if (ref != null) jumpSrc(ref); popFocus({ body: true }); }
    }
    // silent: 작성을 끝내거나 되돌릴 때 — 화면을 다시 그리지 않는다.
    function closePop(o) {
      if (!ui.pop) return;
      const p = ui.pop;
      ui.pop = null;
      if (popEl) { popEl.style.display = 'none'; popEl.innerHTML = ''; }
      setInert(false);
      if (o && o.silent) return;
      // 팝업에서 마지막으로 고친 이사회 칸을 작성본에서 선택하고 가운데로 스크롤한다.
      if (p.last && lookup(p.last.t, p.last.key)) { ui.sel = { t: p.last.t, key: p.last.key }; ui.live = ''; }
      draw(null);
      focusTarget(p.ret);
      if (p.last) { const td = findCell(p.last.t, p.last.key); if (td && td.scrollIntoView) td.scrollIntoView({ block: 'center' }); }
    }
    function popPick(at) {
      bw.popSelect(ws, ui, bw.mergeSources(ws), at);
      drawPop({ cell: at });
    }
    function popApply() {
      const inp = $('bd-src-in');
      if (!ui.pop || !inp || !ui.sel) return;
      const r = bw.popCommit(ws, ui.sel, inp.value);
      if (r.error) { ui.pop.text = inp.value; ui.pop.note = r.note; ui.pop.err = true; drawPop({ id: 'bd-src-in' }); return; }
      ws = r.ws; ui.pop.text = null; ui.pop.note = r.note; ui.pop.err = false;
      if (r.changed) ui.pop.last = { t: ui.sel.t, key: ui.sel.key };
      drawPop({ id: 'bd-src-in' });
    }
    function popRevert() {
      const s = ui.sel && lookup(ui.sel.t, ui.sel.key);
      if (!ui.pop || !s) return;
      const r = bw.popCommit(ws, ui.sel, s.c.orig);
      ws = r.ws; ui.pop.text = null; ui.pop.note = r.note; ui.pop.err = r.error;
      if (r.changed) ui.pop.last = { t: ui.sel.t, key: ui.sel.key };
      drawPop({ id: 'bd-src-in' });
    }
    // 입력 취소(Esc): 쓰던 글자를 버리고 현재 값으로 되돌린다. 팝업은 열어 둔다.
    function popCancelInput() {
      const s = ui.sel && lookup(ui.sel.t, ui.sel.key), inp = $('bd-src-in');
      if (!ui.pop) return;
      ui.pop.text = null; ui.pop.note = ''; ui.pop.err = false;
      if (inp && s) { inp.value = s.c.value; inp.removeAttribute('aria-invalid'); }
      const nt = $('bd-src-note'); if (nt) { nt.textContent = ''; nt.className = 'bd-src-note'; nt.setAttribute('role', 'status'); }
    }
    function popAct(btn) {
      const a = btn.getAttribute('data-w'), v = btn.getAttribute('data-v');
      switch (a) {
        case 'srcclose': closePop(); break;
        case 'srcjump': jumpSrc(v); break;
        case 'srcedited': {
          ui.pop.onlyEdited = !ui.pop.onlyEdited;
          drawPop({ w: 'srcedited' }, true);
          const hit = ui.pop.onlyEdited ? $('bd-w-srcbody').querySelector('td.is-edsrc') : null;
          if (hit) scrollSrcTo(hit);
          break;
        }
        case 'srccand': {
          const k = (v || '').split('|');
          ui.sel = { t: k[0], key: k.slice(1).join('|') }; ui.pop.text = null; ui.pop.note = ''; ui.pop.err = false;
          drawPop({ w: 'srccand', v: v });
          break;
        }
        case 'srcpart': {
          const b = $('bd-w-srcbody'), td = b && b.querySelector('td[data-a="' + v + '"]');
          if (td) { td.focus({ preventScroll: true }); scrollSrcTo(td); }
          break;
        }
        case 'srcapply': popApply(); break;
        case 'srcrevert': popRevert(); break;
        case 'srccancel': ui.pop.text = null; ui.pop.note = ''; ui.pop.err = false; drawPop({ id: 'bd-src-in' }); break;
        case 'why': {
          const s = ui.sel && lookup(ui.sel.t, ui.sel.key);
          if (!s) break;
          ws = bw.setWhy(ws, ui.sel.t, ui.sel.key, v, s.c.memo);
          drawPop(v === 'OTHER' ? { id: 'bd-w-memo' } : { w: 'why', v: v }, true);
          break;
        }
        default: break;
      }
    }
    function onPopClick(e) {
      if (!active || !ui.pop) return;
      const t = e.target;
      if (t === popEl) { closePop(); return; }   // 배경을 눌렀을 때만(상자 안쪽은 닫지 않는다)
      const btn = t.closest ? t.closest('[data-w]') : null;
      if (btn && !btn.disabled) { popAct(btn); return; }
      const td = t.closest ? t.closest('td[data-s]') : null;
      if (td) popPick({ s: Number(td.getAttribute('data-s')), r: Number(td.getAttribute('data-r')), c: Number(td.getAttribute('data-c')) });
    }
    function onPopInput(e) {
      if (!active || !ui.pop || !e.target || e.target.id !== 'bd-w-memo' || !ui.sel) return;
      ws = bw.setWhy(ws, ui.sel.t, ui.sel.key, 'OTHER', e.target.value);   // 다시 그리지 않는다(포커스 유지)
      const n = e.target.value.length, cnt = $('bd-w-memocnt'), hint = $('bd-w-memohint');
      if (cnt) { cnt.textContent = n + '/100'; cnt.hidden = n < 80; }
      if (hint) hint.hidden = e.target.value.trim() !== '';
    }
    // 원본 표 안: 방향키로 칸 이동(선택이 따라온다), Home/End 는 행의 처음/끝, Enter 는 편집 영역으로.
    function onPopKey(e) {
      if (!active || !ui.pop || e.key === 'Escape') return;
      const tg = e.target;
      if (tg && tg.id === 'bd-src-in') { if (e.key === 'Enter') { e.preventDefault(); popApply(); } return; }
      if (tg && tg.id === 'bd-w-memo') { if (e.key === 'Enter') { e.preventDefault(); popFocus({ id: 'bd-src-in' }); } return; }
      if (tg && tg.getAttribute && tg.getAttribute('data-w') === 'why' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        const ids = WHY.map(function (w) { return w.id; }), cur = ids.indexOf(tg.getAttribute('data-v'));
        const nx = ids[(cur + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
        const s0 = ui.sel && lookup(ui.sel.t, ui.sel.key);
        if (s0) { ws = bw.setWhy(ws, ui.sel.t, ui.sel.key, nx, s0.c.memo); drawPop({ w: 'why', v: nx }, true); }
        return;
      }
      const td = tg && tg.closest ? tg.closest('td[data-s]') : null;
      if (!td || e.altKey || e.metaKey || e.ctrlKey) return;
      const at = { s: Number(td.getAttribute('data-s')), r: Number(td.getAttribute('data-r')), c: Number(td.getAttribute('data-c')) };
      const to = { s: at.s, r: at.r, c: at.c };
      if (e.key === 'ArrowRight') to.c++; else if (e.key === 'ArrowLeft') to.c--;
      else if (e.key === 'ArrowDown') to.r++; else if (e.key === 'ArrowUp') to.r--;
      else if (e.key === 'Home') to.c = 0;
      else if (e.key === 'End') to.c = 1e6;
      else if (e.key === 'Enter') { e.preventDefault(); popPick(at); popFocus({ id: 'bd-src-in' }); return; }
      else return;
      e.preventDefault();
      if (to.c === 1e6) { const row = td.parentNode.querySelectorAll('td[data-s]'); to.c = Number(row[row.length - 1].getAttribute('data-c')); }
      if (!srcCell(to)) return;   // 표 가장자리: 움직이지 않는다
      popPick(to);
    }
    // 창 전체(캡처): 입력 안 Esc 는 입력 취소, 그 밖의 Esc 는 닫기, Tab 은 팝업 안에 가둔다.
    function onPopWindowKey(e) {
      if (!active || !ui.pop) return;
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        if (bw.popEscAction({ input: !!(e.target && e.target.id === 'bd-src-in') }) === 'input') popCancelInput(); else closePop();
        return;
      }
      if (e.key !== 'Tab') return;
      const box = popEl && popEl.querySelector('.bd-src-box');
      if (!box) return;
      const l = box.querySelectorAll('button, input, [tabindex="0"]'), items = [];
      for (let i = 0; i < l.length; i++) if (!l[i].disabled && l[i].getClientRects().length > 0) items.push(l[i]);
      if (!items.length) return;
      const idx = items.indexOf(document.activeElement);
      if (idx < 0) { e.preventDefault(); (e.shiftKey ? items[items.length - 1] : items[0]).focus(); return; }
      if (e.shiftKey && idx === 0) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && idx === items.length - 1) { e.preventDefault(); items[0].focus(); }
    }

    function act(btn) {
      const a = btn.getAttribute('data-w'), v = btn.getAttribute('data-v');
      switch (a) {
        case 'pick': pickFile(); break;
        case 'abort': abortUpload(); break;
        case 'swap': askSwap(); break;
        case 'end': askEnd(); break;
        case 'leave-ok': { const k = ui.leave; ui.leave = null; if (k === 'swap') { draw(null); pickFile(); } else finish(); break; }
        case 'leave-no': { const k = ui.leave; ui.leave = null; draw(k === 'swap' ? { w: 'swap' } : { id: 'bd-w-end' }); break; }
        case 'reform': finish('#bd-form'); break;
        case 'perm': if (env.perms) env.perms(); break;
        case 'filter': ws = bw.setFilter(ws, v); draw({ w: 'filter', v: ws.filter }); break;
        case 'srcopen': openPop({ w: 'srcopen', v: v }, (v == null || v === '*') ? null : v); break;
        case 'tcheck': toggleTable(v); break;
        case 'banmore': ui.banOpen[v] = !ui.banOpen[v]; draw({ w: 'banmore', v: v }); break;
        case 'unread': { ws = bw.setFilter(ws, 'need'); const f = bw.firstUnreadable(ws); if (f) ui.sel = f; draw({ cell: true }); break; }
        case 'draft': doDraft(); break;
        case 'ask-ok': {
          const a0 = ui.ask; ui.ask = null;
          if (a0) { ws = bw.patchCell(ws, a0.t, a0.key, { asked: true }); openEdit(a0.t, a0.key, null); }   // 이번 작업 동안 그 칸은 다시 묻지 않는다
          break;
        }
        case 'ask-no': ui.ask = null; draw({ cell: true }); break;
        case 'why': setWhyFrom(v); break;
        case 'revert': {
          if (!ui.sel) break;
          const s = lookup(ui.sel.t, ui.sel.key);
          if (s) { const r = bw.editCell(ws, ui.sel.t, ui.sel.key, s.c.orig); ws = r.ws; ui.live = bw.releaseText(r.released, findT(ws, ui.sel.t)); }
          draw({ cell: true });
          break;
        }
        case 'copy1': doCopy(v); break;
        case 'copyall': doCopy('all'); break;
        default: break;
      }
    }

    // ── 이벤트 ──
    function onClick(e) {
      if (!active) return;
      const t = e.target;
      const btn = t.closest ? t.closest('[data-w]') : null;
      if (btn && !btn.disabled) { act(btn); return; }
      if (ui.edit) { const inp = $('bd-w-in'); if (inp && !cellOf(t)) return; if (inp) { inp.focus(); return; } }
      const td = cellOf(t);
      if (td) select(td.getAttribute('data-t'), td.getAttribute('data-key'), { focus: true });
    }
    function onFocusIn(e) {
      if (!active) return;
      const td = cellOf(e.target);
      if (td && !ui.edit) {
        select(td.getAttribute('data-t'), td.getAttribute('data-key'), { tip: !pointer });
        // 마우스·키보드 모두: select 가 상태 줄을 키운 뒤(drawStatus) 칸이 고정 패널에 가려지지 않게 맞춘다(click 이 안 와도 보정되도록).
        keepVisible(td);
      } else if (!td && e.target && e.target.closest) {
        // 칸이 아닌 버튼(예: '이 표 복사')도 아래쪽 고정 패널·상태 줄 뒤에 가려지지 않게 한다. 선택은 바꾸지 않는다.
        const t = e.target;
        if (bw.needsOcclusionFix(t.closest('.bd-w-tables'), t.closest('#bd-w-status, #bd-writebar'))) keepVisible(t);
      }
    }
    function move(td, dir) {
      const all = cellsAll(), list = [], items = [];
      let cur = -1;
      for (let i = 0; i < all.length; i++) {
        if (all[i].classList.contains('is-dim')) continue;
        const r = all[i].getBoundingClientRect();
        if (all[i] === td) cur = items.length;
        items.push({ cx: r.left + r.width / 2, cy: r.top + r.height / 2, h: r.height });
        list.push(all[i]);
      }
      const to = (dir === 'next' || dir === 'prev') ? bw.linearTarget(items.length, cur, dir === 'next' ? 1 : -1) : bw.navTarget(items, cur, dir);
      if (to >= 0 && list[to]) { list[to].focus({ preventScroll: true }); ensureVisible(list[to]); }   // focusin이 선택·툴팁 예약을 한다
    }
    function onEsc(e) {
      const a = bw.escAction({ tip: !!tipFor, edit: !!ui.edit, ask: !!ui.ask, reason: !!(e.target && e.target.closest && e.target.closest('.bd-w-whybox')), leave: !!ui.leave, sel: !!ui.sel });
      if (a === 'none') return;
      e.preventDefault(); e.stopPropagation();
      if (a === 'tip') hideTip();
      else if (a === 'leave') { const k = ui.leave; ui.leave = null; draw(k === 'swap' ? { w: 'swap' } : { id: 'bd-w-end' }); }
      else if (a === 'sel') { bw.releaseSel(ui); applySel(); drawStatus(); }
      else if (a === 'edit') cancelEdit();
      else if (a === 'ask') { ui.ask = null; draw({ cell: true }); }
      else if (a === 'reason') focusTarget({ cell: true });
    }
    const ARROWS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    function onKey(e) {
      if (!active) return;
      if (e.key === 'Escape') { onEsc(e); return; }
      if (e.target && e.target.id === 'bd-w-in') { if (e.key === 'Enter') { e.preventDefault(); commitEdit(); } return; }
      if (e.target && e.target.id === 'bd-w-memo') { if (e.key === 'Enter') { e.preventDefault(); draw({ cell: true }); } return; }
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-w') === 'why' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        const ids = WHY.map(function (w) { return w.id; }), cur = ids.indexOf(e.target.getAttribute('data-v'));
        const nx = ids[(cur + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
        const s0 = ui.sel && lookup(ui.sel.t, ui.sel.key);
        if (s0) { ws = bw.setWhy(ws, ui.sel.t, ui.sel.key, nx, s0.c.memo); draw({ w: 'why', v: nx }); }
        return;
      }
      const td = cellOf(e.target);
      if (!td || e.altKey || e.metaKey) return;
      const t = td.getAttribute('data-t'), key = td.getAttribute('data-key');
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); return; }   // 확인은 표 단위: 칸에서는 Space 로 하지 않는다
      if (ARROWS[e.key]) {
        e.preventDefault();
        if (e.ctrlKey) { if (e.key === 'ArrowDown') move(td, 'next'); else if (e.key === 'ArrowUp') move(td, 'prev'); }   // Ctrl+↓↑: 보이는 칸을 차례로
        else move(td, ARROWS[e.key]);
        return;
      }
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); beginEdit(t, key, null); return; }
      if (e.key.length === 1 && !e.ctrlKey && e.key !== ' ') { e.preventDefault(); beginEdit(t, key, e.key); }   // 숫자·부호로 시작: 확인 줄을 거치면 이 글자는 버린다
    }
    function hasFiles(e) {
      const dt = e.dataTransfer;
      if (!dt || !dt.types) return false;
      for (let i = 0; i < dt.types.length; i++) if (dt.types[i] === 'Files') return true;
      return false;
    }
    function dropZone(e) { return (e.target && e.target.closest) ? e.target.closest('#bd-w-drop') : null; }
    function onDrag(e) {
      if (!active || !hasFiles(e)) return;
      e.preventDefault();   // 창 밖에 떨어뜨려 페이지가 파일로 이동하는 사고 방지
      const z = dropZone(e);
      if (z && !ui.upload) { z.classList.add('is-over'); const tt = $('bd-w-droptitle'); if (tt) tt.textContent = '여기에 놓으면 올립니다'; }
    }
    function onDragLeave(e) {
      const z = $('bd-w-drop');
      if (!z || (e.relatedTarget && z.contains(e.relatedTarget))) return;
      z.classList.remove('is-over');
      const tt = $('bd-w-droptitle'); if (tt) tt.textContent = DROP_TITLE;
    }
    function onDrop(e) {
      if (!active || !hasFiles(e)) return;
      e.preventDefault();
      if (!dropZone(e) || ui.upload) return;
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) startUpload(f);
    }
    function onUnload(e) { if (active && bw.hasWork(ws)) { e.preventDefault(); e.returnValue = ''; } }   // 브라우저 이탈은 기본창(확인창 금지의 유일한 예외)

    return {
      attach: function () {
        if (attached) return;
        const b = bodyEl();
        if (!b) return;
        attached = true;
        b.addEventListener('click', onClick);
        b.addEventListener('keydown', onKey);
        b.addEventListener('mouseover', onOver);
        b.addEventListener('mouseout', onOut);
        b.addEventListener('focusin', onFocusIn);
        let downCell = null;
        b.addEventListener('mousedown', function (e) { pointer = true; downCell = ui && !ui.edit ? cellOf(e.target) : null; setTimeout(function () { pointer = false; }, 300); });
        b.addEventListener('mouseup', function () {   // 상태 줄이 자라 mouseup 이 칸 밖에 떨어져도(click 없음) 누른 칸을 다시 보이게 한다
          const d = downCell; downCell = null;
          if (!active || !d) return;
          const k = { t: d.getAttribute('data-t'), key: d.getAttribute('data-key') };
          if (bw.needSettle(k, ui.sel)) keepVisible(findCell(k.t, k.key));
        });
        b.addEventListener('dragover', onDrag);
        b.addEventListener('dragleave', onDragLeave);
        b.addEventListener('drop', onDrop);
        b.addEventListener('input', onInput);
        b.addEventListener('dblclick', onDblClick);
        window.addEventListener('scroll', function () { if (tipFor || tipTimer) hideTip(); }, true);
        let rzRaf = 0;
        function realign() {
          rzRaf = 0;
          if (!active || !ui) return;
          measureStatus();
          if (ui.sel && !ui.pop) keepVisible(findCell(ui.sel.t, ui.sel.key));   // 줄인 창에서 선택 칸이 고정 상태 줄 뒤로 가려지지 않게(측정 → 보정)
        }
        window.addEventListener('resize', function () {
          hideTip(); measureBar(); measureStatus();
          if (!rzRaf && typeof requestAnimationFrame === 'function') rzRaf = requestAnimationFrame(realign);   // 한 프레임에 한 번만
        });
        let stRaf = 0;   // 페이지 스크롤로 작성 바 위치가 바뀌면 붙음 띠를 다시 맞춘다
        window.addEventListener('scroll', function (e) {
          if (!active || stRaf || ui.pop || (e.target && e.target.id === 'bd-w-srcbody') || typeof requestAnimationFrame !== 'function') return;
          stRaf = requestAnimationFrame(function () { stRaf = 0; markStuck(); });
        }, true);
        window.addEventListener('keydown', onPopWindowKey, true);   // 팝업 Esc·Tab(전역 Esc보다 먼저 가로챈다)
        window.addEventListener('beforeunload', onUnload);
      },
      start: function () {
        const c = env.ctx();
        if (!c || !c.form) return;
        ws = null; formDoc = c.form; ui = freshUi(); active = true; ++upTok;
        ui.form = { id: c.id, name: str(c.form.name), version: c.form.version, isBase: bw.isBase(c.id) };
        const ep = env.epoch();
        bw.loadMap(env.doFetch).then(function (m) {
          if (!active || ep !== env.epoch() || ws) return;
          ui.maxMb = m.maxMb; ui.mapText = bw.mapListText(formDoc.tables, m.tables);
          const p = $('bd-w-maplist'); if (p) p.textContent = ui.mapText;   // 다시 그리지 않고 한 줄만 채운다(포커스 유지)
        });
        draw({ id: 'bd-w-pick' });
      },
      reset: function () {
        active = false; ++upTok;
        if (abortCtl) abortCtl.abort();
        abortCtl = null; hideTip(); closePop({ silent: true }); ws = null; formDoc = null; ui = freshUi();
        if (fileInput && fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
        fileInput = null;
      },
      isActive: function () { return active; },
      hasWork: function () { return active && bw.hasWork(ws); }
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = bw;
  else root.boardWrite = bw;
})(typeof self !== 'undefined' ? self : this);
