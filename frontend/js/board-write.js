(function (root) {
  'use strict';
  // 이사회 자료 '작성 모드'(NEXT 37) — 엑셀을 올려 양식의 값 칸을 채우고, 오른쪽 원본과 대조하며 칸마다 확인한다.
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
  const CHECK_SVG = '<svg class="bd-w-ck" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 5.5 4 8l4.5-6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
      r.title = '엑셀(.xlsx) 파일만 올릴 수 있습니다.'; r.hint = '암호가 걸린 파일은 암호를 풀고 저장해 주세요.';
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
  bw.draftDoneText = function (ws) {
    const u = bw.tally(ws).unchecked;
    return '초안 워드를 내려받았습니다.' + (u > 0 ? ' 확인하지 않은 칸 ' + u + '개가 포함된 초안입니다.' : '');
  };

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
            checked: false, asked: false, why: '', memo: '', whyAsked: false
          };
          t.order.push(key);
          if (t.grid && s) { const gp = bw.gridPos(t.grid, s.cell); if (gp) t.srcIndex[gp.r + ',' + gp.c] = key; }
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
    LABEL_MISMATCH: '이 표의 머리글이 양식과 달라 위치대로 채웠습니다.'
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
    if (f === 'unchecked') return !c.checked;
    return true;
  };
  bw.tally = function (ws) {
    const y = { m: 0, n: 0, edited: 0, need: 0, unchecked: 0, filled: 0, failed: 0, review: 0, sumBad: 0, noReason: 0, hidden: 0, hiddenFmt: 0, empty: 0, manual: 0 };
    eachCell(ws, function (t, c) {
      const i = bw.cellInfo(t, c);
      y.m++;
      if (c.checked) y.n++; else y.unchecked++;
      if (c.manual) y.manual++;
      else if (c.status === 'failed') { y.failed++; if (c.reason === 'PART_EMPTY') y.empty++; }
      else if (c.status === 'review') y.review++; else y.filled++;
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
    return y.n > 0 || y.edited > 0;
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

  const FILTERS = [['all', '전체'], ['edited', '수정됨'], ['need', '확인 필요'], ['unchecked', '미확인']];
  bw.setFilter = function (ws, f) {
    return FILTERS.some(function (x) { return x[0] === f; }) ? Object.assign({}, ws, { filter: f }) : ws;
  };
  // '확인했음'은 모든 칸을 확인했을 때만 유지된다. 확인이 하나라도 빠지면 해제.
  bw.normalize = function (ws) {
    if (!ws.done) return ws;
    const y = bw.tally(ws);
    return (y.m > 0 && y.n === y.m) ? ws : Object.assign({}, ws, { done: null });
  };
  bw.toggleCheck = function (ws, ref, key) {
    const t = findT(ws, ref), c = t && t.cells[key];
    if (!c) return ws;
    if (!c.checked && bw.cellInfo(t, c).unreadable) return ws;   // 읽지 못한 빈 칸은 값을 넣은 뒤에 확인
    return bw.normalize(bw.patchCell(ws, ref, key, { checked: !c.checked }));
  };
  bw.setDone = function (ws, on, who, at) {
    if (!on) return Object.assign({}, ws, { done: null });
    const y = bw.tally(ws);
    return (y.m > 0 && y.n === y.m) ? Object.assign({}, ws, { done: { who: str(who), at: str(at) } }) : ws;
  };
  bw.hhmm = function (d) {
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes());
  };
  bw.leaveText = function (kind, y) {
    const parts = [];
    if (y && y.n > 0) parts.push('확인 ' + y.n + '칸');
    if (y && y.edited > 0) parts.push('수정 ' + y.edited + '칸');
    const what = parts.join('과 ');
    if (kind === 'swap') return '새 엑셀로 바꾸면 ' + (what ? what + '이 사라집니다.' : '지금 화면이 새로 채워집니다.');
    return (what ? what + '이 사라집니다. ' : '') + '작성을 끝낼까요?';
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
  function convertLines(c) {
    const cv = c.convert;
    if (!cv) return [];
    if (cv.kind === 'display_sum') return ['구성 칸 ' + cv.of.length + '개의 표시값을 더한 합계입니다'];
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
    convertLines(c).forEach(function (s) { out.push({ k: 'calc', text: s }); });
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
    parts.push(c.checked ? '확인됨' : '미확인');
    return parts.join(', ');
  };

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
    if (c.checked) out.push('고치면 이 칸의 확인 표시가 해제됩니다.');
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
    const released = c.checked ? (ws.done ? 'done' : 'cell') : '';
    if (c.checked) patch.checked = false;
    if (v === c.orig.trim()) { patch.why = ''; patch.memo = ''; }   // 원래 값으로 돌아오면 사유도 지운다
    return { ws: bw.normalize(bw.patchCell(ws, ref, key, patch)), released: released, changed: true };
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

  // ── 화면 조각(HTML) ────────────────────────────────────────
  function freshUi() {
    return { form: null, upload: null, rej: null, leave: null, panelOpen: true, wide: false, sel: null, live: '', banOpen: {},
             draftBusy: false, draftNote: '', draftErr: false, mapText: '', maxMb: DEFAULT_MAX_MB,
             edit: null, ask: null, copyNote: null };
  }
  bw.freshUi = freshUi;

  bw.barHtml = function (ws, ui) {
    const f = ui.form || {};
    const title = '자료 작성 중 · ' + str(f.name) + (f.version != null && f.version !== '' ? ' v' + f.version : '') +
      (ws ? ' · 원본 ' + ws.fileName + '(저장 안 됨)' : '');
    return '<div class="bd-editbar bd-writebar" id="bd-writebar" tabindex="-1"><div class="bd-wb-row"><span>' + esc(title) + '</span><span class="bd-wb-btns">' +
      '<button type="button" data-w="swap"' + (ws && !ui.upload ? '' : ' disabled') + '>엑셀 바꾸기</button>' +
      (ws ? '<button type="button" data-w="copyall">모든 표 복사</button>' + bw.copyAllNoteHtml(ui) : '') +
      '<button type="button" id="bd-w-draft" class="bd-wb-main" data-w="draft"' + (ws && !ui.draftBusy ? '' : ' disabled') + '>' +
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
      text = (got > 0 ? '값 ' + got + '칸을 채웠' : '채운 값이 없') + (y.failed > 0 ? '고 ' + y.failed + '칸은 읽지 못했' : '') + '습니다.' +
        (y.empty > 0 ? ' 그중 ' + y.empty + '칸은 엑셀 칸이 비어 있습니다.' : '') +
        (y.review > 0 ? ' 머리글이 달라 확인이 필요한 칸이 ' + y.review + '칸 있습니다.' : '');
    }
    else if (y.filled === 0 && y.manual > 0) text = '엑셀에서 가져올 값이 없습니다.';
    else text = '값 ' + y.filled + '칸을 모두 채웠습니다. 오른쪽 원본과 대조하며 칸마다 확인해 주세요.';
    let extra = '';
    if (y.noReason > 0) extra = '사유를 고르지 않은 수정 ' + y.noReason + '칸';
    const items = bw.warnItems(ws);
    return '<div class="bd-w-sum" id="bd-w-sum" role="status" tabindex="-1"><span>' + esc(text) + '</span>' +
      (extra ? '<span>' + esc(extra) + '</span>' : '') +
      (y.manual > 0 ? '<span>' + esc('직접 입력하는 칸 ' + y.manual + '칸은 엑셀에서 가져오지 않습니다.') + '</span>' : '') +
      (y.failed > 0 ? '<button type="button" data-w="unread">읽지 못한 칸 보기</button>' : '') + '</div>' +
      (items.length ? '<details class="bd-w-warn"><summary>주의 ' + items.length + '건</summary><ul>' +
        items.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></details>' : '') +
      '<p class="bd-w-def">‘원래 값’은 엑셀 칸에 저장된 숫자입니다. 엑셀에서 서식으로 가려 보이지 않던 값도 여기에는 나옵니다.</p>';
  };
  bw.filterHtml = function (ws) {
    const y = bw.tally(ws), n = { all: y.m, edited: y.edited, need: y.need, unchecked: y.unchecked };
    return '<div class="wf-chips" role="group" aria-label="칸 거르기">' + FILTERS.map(function (f) {
      return '<button type="button" class="wf-chip" data-w="filter" data-v="' + f[0] + '" aria-pressed="' + (ws.filter === f[0]) + '">' + f[1] + '<i>' + n[f[0]] + '</i></button>';
    }).join('') + '</div><p class="bd-w-def">확인 필요: 읽지 못했거나, 주의가 붙었거나, 합계가 맞지 않거나, 머리글이 다른 표의 칸 · 미확인: 아직 확인 표시를 하지 않은 칸</p>';
  };
  bw.reviewHtml = function (ws) {
    const y = bw.tally(ws), ok = y.m > 0 && y.n === y.m;
    let notes = '';
    const bits = [];
    if (y.sumBad > 0) bits.push('합계 차이 ' + y.sumBad + '곳');
    if (y.noReason > 0) bits.push('사유를 고르지 않은 수정 ' + y.noReason + '칸');
    if (bits.length) notes = bits.join(' · ') + '이 남아 있어도 ‘확인했음’은 선택할 수 있습니다.';
    return '<div class="bd-w-rev"><span class="bd-w-count" id="bd-w-count">' + (ok ? CHECK_SVG : '') + '검수 ' + y.n + '/' + y.m + '</span>' +
      '<label class="bd-w-donelab"><input type="checkbox" id="bd-w-done"' + (ok ? '' : ' disabled') + (ws.done ? ' checked' : '') + ' aria-describedby="bd-w-donewhy"> 확인했음</label>' +
      (ws.done ? '<span class="bd-w-chip is-done">검수 완료 · ' + esc((ws.done.who ? ws.done.who + ' ' : '') + ws.done.at) + '</span>' : '') +
      '<span class="bd-w-note" id="bd-w-donewhy">' + esc(ok ? '모든 값을 원본과 대조해 확인했습니다' : '모든 칸을 확인하면 선택할 수 있습니다(남은 칸 ' + (y.m - y.n) + ')') + '</span>' +
      (notes ? '<span class="bd-w-note">' + esc(notes) + '</span>' : '') + '</div>';
  };

  bw.chipsHtml = function (t) {
    let h = '';
    let sumN = 0, left = 0;
    t.order.forEach(function (k) {
      const c = t.cells[k];
      if (bw.cellInfo(t, c).sumBad) sumN++;
      if (!c.checked) left++;
    });
    if (sumN) h += '<span class="bd-w-chip is-warn">' + icon('warn') + '합계 차이 ' + sumN + '</span>';
    if (t.needsReview) {
      if (t.labelState === 'failed') h += '<span class="bd-w-chip is-warn">' + icon('warn') + '주의 · 채우지 못함</span>';
      else h += left ? '<span class="bd-w-chip is-warn">' + icon('warn') + '주의 · 남은 칸 ' + left + '</span>' : '<span class="bd-w-chip">주의 · 모두 확인함</span>';
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
    if (c.checked) cls.push('is-checked');
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
      '<span class="bd-w-v">' + inner + '</span>' + extra + (warn ? icon('warn') : '') + (c.checked ? CHECK_SVG : '') + '</td>';
  };
  bw.cardHtml = function (ws, t, ui, rv) {
    const label = esc(t.title || t.mapping || '표');
    const head = '<div class="bd-card-head bd-w-head">' + (t.mapping ? '<span class="bd-map">' + esc(t.mapping) + '</span>' : '') +
      '<strong class="bd-w-title">' + esc(t.title) + '</strong>' + bw.chipsHtml(t) + bw.copyBtnHtml(t, ui) + '</div>';
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
        if (o.mapped === true && has(t.cells, key)) {
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
    return '<section class="bd-card bd-w-card" data-t="' + esc(t.ref) + '" aria-label="' + label + '">' + head + bw.bannerHtml(t, !!ui.banOpen[t.ref]) +
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
  bw.srcHasSel = function (sheets, sel) {
    if (!sel) return false;
    return sheets.some(function (sh) {
      return Object.keys(sh.owners).some(function (k) { return sh.owners[k].some(function (o) { return o.t === sel.t && o.key === sel.key; }); });
    });
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
  // 좌우로 놓았을 때 원본 패널 너비가 360px 미만이면 세로 배치.
  bw.stackMode = function (gridW, wide, open) {
    if (open === false) return false;
    const w = (Number(gridW) - 14) * (wide ? 3 : 2) / 5;
    return isFinite(w) && Number(gridW) > 0 && w < 360;
  };
  bw.gridClass = function (ui) { return 'bd-w-grid' + (ui.panelOpen ? (ui.wide ? ' is-wide' : '') : ' is-one'); };

  bw.sourceHtml = function (ws, ui) {
    const name = '<span class="bd-w-srcname" title="' + esc(ws.fileName) + '">엑셀 원본 · ' + esc(ws.fileName) + '</span>';
    const panelBtn = '<button type="button" data-w="panel" aria-expanded="' + !!ui.panelOpen + '">' + (ui.panelOpen ? '원본 접기' : '원본 펼치기') + '</button>';
    if (!ui.panelOpen) return '<aside id="bd-w-src" class="bd-w-src is-folded" aria-label="엑셀 원본"><div class="bd-w-srchead"><div class="bd-w-srcrow">' + name +
      '<span class="bd-w-srcbtns">' + panelBtn + '</span></div></div></aside>';
    const sheets = bw.mergeSources(ws), sel = ui.sel;
    const jumps = [];
    sheets.forEach(function (sh) {
      sh.tags.forEach(function (tg) {
        jumps.push('<button type="button" class="bd-w-srcjump" data-w="srcjump" data-v="' + esc(tg.ref) + '" aria-label="' + esc(tg.label + ' 표 원본으로 이동') + '"' +
          (sel && sel.t === tg.ref ? ' aria-current="true"' : '') + '>' + esc(tg.label) + '</button>');
      });
    });
    const head = '<div class="bd-w-srchead"><div class="bd-w-srcrow">' + name + '<span class="bd-w-srcbtns">' +
      '<button type="button" data-w="srcwide" aria-pressed="' + !!ui.wide + '">넓게 보기</button>' + panelBtn + '</span></div>' +
      '<div class="bd-w-srcrow bd-w-srcjumps" role="group" aria-label="원본 표로 이동">' + jumps.join('') +
      '<button type="button" data-w="srcsel"' + (bw.srcHasSel(sheets, sel) ? '' : ' disabled') + '>선택 칸으로</button></div></div>';
    const parts = sheets.map(function (sh) {
      const cover = function (r, c) {
        for (let i = 0; i < sh.tags.length; i++) { const g = sh.tags[i]; if (r >= g.r0 && r <= g.r1 && c >= g.c0 && c <= g.c1) return g.ref; }
        return sh.tags[0].ref;
      };
      return '<div class="bd-w-srccap">' + esc(sh.sheet + ' 시트 · ' + sh.range) + '</div>' +
        '<table class="bd-w-srctbl" role="table" aria-label="' + esc(sh.sheet + ' 시트 원본') + '"><thead><tr><th></th>' +
        sh.cols.map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        sh.rows.map(function (row, r) {
          const starts = sh.tags.filter(function (g) { return g.r0 === r; });
          let on0 = false;
          const tds = row.map(function (v, c) {
            const own = sh.owners[r + ',' + c] || [], key = own.length ? own[0].key : '';
            const on = own.some(function (o) { return !!sel && sel.t === o.t && sel.key === o.key; });
            if (on) on0 = true;
            const here = starts.filter(function (g) { return g.c0 === c; }).map(function (g) { return g.ref; });
            const text = bw.srcKind(v) === 'text';
            const cls = (text ? 'is-text' : '') + (on ? (text ? ' ' : '') + 'is-src' : '');
            return '<td data-st="' + esc(own.length ? own[0].t : cover(r, c)) + '"' + (key ? ' data-key="' + esc(key) + '"' : '') +
              (own.length > 1 ? ' data-own="' + esc(own.map(function (o) { return o.t + '|' + o.key; }).join(' ')) + '"' : '') +
              (here.length ? ' data-tstart="' + esc(here.join(' ')) + '"' : '') + (cls ? ' class="' + cls + '"' : '') +
              (text ? ' title="' + esc(str(v)) + '"' : '') + '>' + esc(v) + '</td>';
          }).join('');
          return '<tr><th scope="row"' + (on0 ? ' class="is-srcrow"' : '') + '>' + starts.map(function (g) {
            return '<span class="bd-w-srctag" aria-label="' + esc(g.label + ' 표 시작') + '">' + esc(g.label) + '</span>';
          }).join('') + (sh.first_row + r) + '</th>' + tds + '</tr>';
        }).join('') + '</tbody></table>';
    }).join('');
    return '<aside id="bd-w-src" class="bd-w-src" aria-label="엑셀 원본">' + head +
      '<div id="bd-w-srcbody" tabindex="0" role="region" aria-label="엑셀 원본 표, 방향키로 스크롤">' + parts + '</div></aside>';
  };
  bw.statusHtml = function (ws, ui) {
    const sel = bw.selected(ws, ui.sel);
    let h = '';
    if (sel && ui.ask && ui.ask.t === sel.t.ref && ui.ask.key === sel.c.key) return bw.askHtml(sel.t, sel.c);
    if (ui.edit) return '<span class="bd-w-hint">값을 고치는 중입니다. Enter로 확정하고 Esc로 취소합니다.</span>';
    if (!sel) {
      h = '<span class="bd-w-hint">표의 칸을 고르면 엑셀 원본 위치와 값이 여기에 나옵니다.</span>';
    } else {
      const L = bw.infoLines(sel.t, sel.c), i = bw.cellInfo(sel.t, sel.c);
      const calc = function (l) { return l.k === 'part' || l.k === 'calc'; };
      const main = L.filter(function (l) { return l.k !== 'note' && !calc(l); }), notes = L.filter(function (l) { return l.k === 'note'; });
      h = '<span class="bd-w-main">' + main.map(function (l) { return '<span' + (l.mono ? ' class="mono"' : '') + '>' + esc(l.text) + '</span>'; })
        .join('<span class="bd-w-sep" aria-hidden="true">│</span>') + '</span>';
      const calcHtml = L.filter(calc).map(function (l) { return '<div class="bd-w-calc' + (l.mono ? ' mono' : '') + '">' + esc(l.text) + '</div>'; }).join('');
      if (i.edited && i.hasOrig) h += bw.whyHtml(sel.c);
      if (i.edited) h += '<button type="button" data-w="revert">원본 값으로</button>';
      h += '<button type="button" data-w="check" aria-pressed="' + !!sel.c.checked + '"' + (i.unreadable && !sel.c.checked ? ' disabled' : '') + '>확인</button>';
      h += calcHtml;
      if (notes.length) h += '<div class="bd-w-notes">' + notes.map(function (l) { return '<div>' + esc(l.text) + '</div>'; }).join('') + '</div>';
    }
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
        '<div class="' + bw.gridClass(ui) + '"><div class="bd-w-tables" id="bd-w-tables">' +
        ws.tables.map(function (t) { return bw.cardHtml(ws, t, ui, rv); }).join('') + '</div>' + bw.sourceHtml(ws, ui) + '</div>' +
        '<div id="bd-w-status" class="bd-w-status"><div id="bd-w-statusbody" class="bd-w-statusbody">' + bw.statusHtml(ws, ui) + '</div>' +
        '<div id="bd-w-live" class="bd-w-live" role="status" aria-live="polite">' + esc(ui.live) + '</div></div>';
    }
    return h + '</div>';
  };

  // ── ③ 복사: HTML 표 + 탭 텍스트 ──────────────────────────────
  // 복사 값 = 화면 현재 값. 상태 표시(틴트·체크·삼각형·보조 줄·사유·원래 값)는 넣지 않는다.
  function oneLine(s) { return str(s).replace(/[\t\r\n]+/g, ' ').trim(); }
  function cellTextOf(t) {
    return function (o) { const k = str(o.key); return (o.mapped === true && has(t.cells, k)) ? t.cells[k].value : str(o.text); };
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
      t.order.forEach(function (k) { const c = t.cells[k]; if (!c.checked) unchecked++; if (bw.cellInfo(t, c).sumBad) sumBad++; });
    });
    const out = [];
    if (unchecked) out.push('확인하지 않은 칸 ' + unchecked + '개');
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
    return '<span class="bd-w-copy"><button type="button" data-w="copy1" data-v="' + esc(t.ref) + '">이 표 복사</button>' +
      (n ? '<span class="bd-w-note' + (n.err ? ' bd-err' : '') + '" role="' + (n.err ? 'alert' : 'status') + '">' + esc(n.text) + '</span>' : '') + '</span>';
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
  bw.tipAllowed = function (ui) { return !ui.leave && !ui.edit && !ui.ask; };
  // 칸 위 4px·왼쪽 정렬. 위 공간이 작성 줄+8px보다 좁으면 아래, 가장자리 8px 안, 원본 패널(limitRight)은 가리지 않는다.
  bw.tipPlace = function (cell, tip, vp, barBottom, limitRight) {
    const gap = 4, edge = 8;
    let top = cell.top - gap - tip.h, below = false;
    if (top < (barBottom || 0) + edge) { top = cell.bottom + gap; below = true; }
    if (below && top + tip.h > vp.h - edge) top = Math.max(edge, vp.h - edge - tip.h);
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
    // 원본 패널 높이 = 뷰포트 − 패널 시작 y − 하단 상태 줄 높이 − 16px (CSS 변수로 넘긴다). 좁으면 세로 배치.
    function measureSrc() {
      const r = $('bd-root'), b = bodyEl();
      if (!r || !b) return;
      const src = $('bd-w-src'), st = $('bd-w-status'), bar = $('bd-writebar'), grid = b.querySelector('.bd-w-grid');
      if (st) r.style.setProperty('--bd-status-h', st.offsetHeight + 'px');
      if (src) r.style.setProperty('--bd-scroll-top', Math.max(bar ? bar.offsetHeight : 0, src.getBoundingClientRect().top) + 'px');
      if (grid) grid.classList.toggle('is-stack', bw.stackMode(grid.clientWidth, ui.wide, ui.panelOpen));
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
      const old = $('bd-w-srcbody'), st = old ? old.scrollTop : 0, sl = old ? old.scrollLeft : 0;
      b.innerHTML = bw.writeHtml(ws, ui);
      if (sc) sc.scrollTop = top;
      measureBar();
      measureSrc();
      const src = $('bd-w-srcbody');
      if (src) { src.scrollTop = st; src.scrollLeft = sl; }
      focusTarget(focus);
    }
    function drawStatus() {
      const n = $('bd-w-statusbody'); if (n) n.innerHTML = bw.statusHtml(ws, ui);
      const l = $('bd-w-live'); if (l) l.textContent = ui.live || '';   // 알림 줄만 읽힌다(상태 줄 본문은 읽지 않는다)
      measureSrc();   // 상태 줄 높이가 바뀌면 원본 패널 높이도 따라간다
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
      const root = bodyEl(), src = root.querySelectorAll('td[data-st]');
      const rows = root.querySelectorAll('th.is-srcrow');
      for (let k = 0; k < rows.length; k++) rows[k].classList.remove('is-srcrow');
      let hit = null;
      for (let j = 0; j < src.length; j++) {
        const on = bw.ownsCell(src[j].getAttribute('data-own'), src[j].getAttribute('data-st'), src[j].getAttribute('data-key'), s);
        src[j].classList.toggle('is-src', on);
        if (on) {
          if (!hit) hit = src[j];
          const rh = src[j].parentNode && src[j].parentNode.firstElementChild;
          if (rh) rh.classList.add('is-srcrow');
        }
      }
      const jb = root.querySelectorAll('[data-w="srcjump"]');
      for (let m = 0; m < jb.length; m++) {
        if (s && jb[m].getAttribute('data-v') === s.t) jb[m].setAttribute('aria-current', 'true'); else jb[m].removeAttribute('aria-current');
      }
      const sb = root.querySelector('[data-w="srcsel"]');
      if (sb) sb.disabled = !hit;
      if (hit) scrollSrcTo(hit);
    }
    function select(t, key, o) {
      const opt = o || {};
      if (ui.sel && ui.sel.t === t && ui.sel.key === key && !opt.force) return;
      ui.sel = { t: t, key: key }; ui.live = '';
      hideTip();
      applySel(); drawStatus();
      if (opt.focus) { const n = findCell(t, key); if (n) n.focus(); }
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
      const r = td.getBoundingClientRect(), bar = $('bd-writebar'), src = $('bd-w-src');
      const p = bw.tipPlace({ left: r.left, top: r.top, bottom: r.bottom }, { w: tip.offsetWidth, h: tip.offsetHeight },
        { w: window.innerWidth, h: window.innerHeight }, bar ? bar.getBoundingClientRect().bottom : 0,
        (src && ui.panelOpen) ? src.getBoundingClientRect().left - 4 : 0);
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
      if (bad) { ui.rej = bw.rejectFrom({ status: 0, body: { detail: bad } }, rctx()); draw({ id: 'bd-w-rej' }); return; }
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
        ui.rej = bw.rejectFrom(res, rctx());
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
    function toggle(t, key) {
      const before = bw.tally(ws), next = bw.toggleCheck(ws, t, key);
      if (next === ws) { ui.live = '읽지 못한 칸은 값을 넣은 뒤에 확인할 수 있습니다.'; drawStatus(); return; }
      ws = next;
      const after = bw.tally(ws);
      ui.live = (after.m > 0 && after.n === after.m && before.n !== before.m) ? '모든 칸을 확인했습니다.' : '';
      draw({ cell: true });
    }
    function finish(focusSel) {
      active = false; ++upTok;
      if (abortCtl) abortCtl.abort();
      abortCtl = null; hideTip(); ws = null; formDoc = null; ui = freshUi();
      env.exit(focusSel);
    }
    function askEnd() {
      if (bw.hasWork(ws)) { ui.leave = 'end'; draw({ id: 'bd-w-leave-no' }); } else finish();
    }
    function askSwap() {
      if (bw.hasWork(ws)) { ui.leave = 'swap'; draw({ id: 'bd-w-leave-no' }); } else pickFile();
    }

    // ── ② 수정 ──
    function restorePanel() { if (ui.ask && ui.ask.reopen) ui.panelOpen = false; }   // 확인 줄이 잠시 펼친 원본은 취소 때 다시 접는다
    function scrollSrcCenter() {
      const s = ui.sel, l = bodyEl().querySelectorAll('td[data-st]');
      for (let i = 0; i < l.length; i++) {
        if (s && l[i].getAttribute('data-st') === s.t && l[i].getAttribute('data-key') === s.key && l[i].scrollIntoView) { l[i].scrollIntoView({ block: 'center' }); return; }
      }
    }
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
        ui.ask = { t: t, key: key, reopen: !ui.panelOpen }; ui.panelOpen = true;
        draw({ id: 'bd-w-ask-no' });
        scrollSrcCenter();
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
      if (r.released === 'done') msgs.push('값이 바뀌어 ‘확인했음’을 해제했습니다.');
      else if (r.released === 'cell') msgs.push('값이 바뀌어 이 칸의 확인 표시를 해제했습니다.');
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
        case 'panel': ui.panelOpen = !ui.panelOpen; draw({ w: 'panel' }); break;
        case 'srcwide': {   // 다시 그리지 않고 클래스만 바꿔 열 비율 전환이 보이게 한다(상태는 메모리에만)
          ui.wide = !ui.wide;
          const g = bodyEl().querySelector('.bd-w-grid');
          if (g) g.classList.toggle('is-wide', !!ui.wide);
          btn.setAttribute('aria-pressed', ui.wide ? 'true' : 'false');
          measureSrc();
          break;
        }
        case 'srcjump': jumpSrc(v); break;
        case 'srcsel': { const b = $('bd-w-srcbody'), hit = b && b.querySelector('td.is-src'); if (hit) scrollSrcTo(hit); break; }
        case 'banmore': ui.banOpen[v] = !ui.banOpen[v]; draw({ w: 'banmore', v: v }); break;
        case 'unread': { ws = bw.setFilter(ws, 'need'); const f = bw.firstUnreadable(ws); if (f) ui.sel = f; draw({ cell: true }); break; }
        case 'draft': doDraft(); break;
        case 'check': if (ui.sel) toggle(ui.sel.t, ui.sel.key); break;
        case 'ask-ok': {
          const a0 = ui.ask; ui.ask = null;
          if (a0) { ws = bw.patchCell(ws, a0.t, a0.key, { asked: true }); openEdit(a0.t, a0.key, null); }   // 이번 작업 동안 그 칸은 다시 묻지 않는다
          break;
        }
        case 'ask-no': restorePanel(); ui.ask = null; draw({ cell: true }); break;
        case 'why': setWhyFrom(v); break;
        case 'revert': {
          if (!ui.sel) break;
          const s = lookup(ui.sel.t, ui.sel.key);
          if (s) { const r = bw.editCell(ws, ui.sel.t, ui.sel.key, s.c.orig); ws = r.ws; ui.live = r.released === 'done' ? '값이 바뀌어 ‘확인했음’을 해제했습니다.' : ''; }
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
      if (td) { select(td.getAttribute('data-t'), td.getAttribute('data-key'), { focus: true }); return; }
      const st = t.closest ? t.closest('td[data-st]') : null;
      if (st && st.getAttribute('data-key')) select(st.getAttribute('data-st'), st.getAttribute('data-key'), { focus: true, force: true });
    }
    function onFocusIn(e) {
      if (!active) return;
      const td = cellOf(e.target);
      if (td && !ui.edit) select(td.getAttribute('data-t'), td.getAttribute('data-key'), { tip: !pointer });
    }
    function onChange(e) {
      if (!active || !ws || !e.target || e.target.id !== 'bd-w-done') return;
      ws = bw.setDone(ws, !!e.target.checked, env.who(), bw.hhmm(env.now()));
      ui.live = '';
      draw({ id: 'bd-w-done' });
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
      if (to >= 0 && list[to]) list[to].focus();   // focusin이 선택·툴팁 예약을 한다
    }
    function onEsc(e) {
      const a = bw.escAction({ tip: !!tipFor, edit: !!ui.edit, ask: !!ui.ask, reason: !!(e.target && e.target.closest && e.target.closest('.bd-w-whybox')), leave: !!ui.leave, sel: !!ui.sel });
      if (a === 'none') return;
      e.preventDefault(); e.stopPropagation();
      if (a === 'tip') hideTip();
      else if (a === 'leave') { const k = ui.leave; ui.leave = null; draw(k === 'swap' ? { w: 'swap' } : { id: 'bd-w-end' }); }
      else if (a === 'sel') { ui.sel = null; applySel(); drawStatus(); }
      else if (a === 'edit') cancelEdit();
      else if (a === 'ask') { restorePanel(); ui.ask = null; draw({ cell: true }); }
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
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); toggle(t, key); return; }
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
        b.addEventListener('change', onChange);
        b.addEventListener('mousedown', function () { pointer = true; setTimeout(function () { pointer = false; }, 300); });
        b.addEventListener('dragover', onDrag);
        b.addEventListener('dragleave', onDragLeave);
        b.addEventListener('drop', onDrop);
        b.addEventListener('input', onInput);
        b.addEventListener('dblclick', onDblClick);
        window.addEventListener('scroll', function () { if (tipFor || tipTimer) hideTip(); }, true);
        window.addEventListener('resize', function () { hideTip(); measureBar(); measureSrc(); });
        let srcRaf = 0;   // 페이지 스크롤로 패널 시작 y가 바뀌면 높이를 다시 잰다
        window.addEventListener('scroll', function (e) {
          if (!active || srcRaf || (e.target && e.target.id === 'bd-w-srcbody') || typeof requestAnimationFrame !== 'function') return;
          srcRaf = requestAnimationFrame(function () { srcRaf = 0; measureSrc(); });
        }, true);
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
        abortCtl = null; hideTip(); ws = null; formDoc = null; ui = freshUi();
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
