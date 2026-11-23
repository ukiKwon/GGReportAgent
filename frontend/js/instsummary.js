(function (root) {
  'use strict';
  // 사전준비 양식 '기관 정보 요약' 작성 창(NEXT 100 S2). 전역 root.instSummary.open({ bidCaseId, instName, opener, onClosed(changed), openFix?, restoreFallback? }).
  // 규격: handoff/agents/design-reviewer/2026-11-23_1257_a78d8d68.md 6-0~6-12(안 A: 기대효과 칸은 tpl.keys 에 'effect' 가 있을 때만 그린다).
  // 서버: GET/PUT/POST /bidcases/{id}/prep/forms/INST_SUMMARY(/draft·/prefill·/confirm·/unconfirm·/versions·/confirmed-docx·/draft-docx).
  // 모든 요청에 X-Screen-Id: prep_form + X-Button-Id(form_open·form_refresh·form_save·form_refill·form_prefill·form_confirm·form_unconfirm·form_history·form_docx·form_draft_docx).
  // 앞 절반은 순수 함수(node 시험 대상), 뒤 절반은 DOM 화면 — open()이 불릴 때만 실행된다(document 없으면 아무것도 안 한다).
  // 사용자 값은 textContent·value 로만 넣는다(HTML 문자열 삽입 없음). 서버 message 는 화면에 쓰지 않고 6-9 화면 문구를 쓴다. 브라우저 저장소는 쓰지 않는다.
  const isn = {};
  const isNode = typeof module !== 'undefined' && !!module.exports;
  function dlgApi() { return isNode ? require('./dlg.js') : root.dlg; }

  // ── 작은 도우미 ───────────────────────────────────────────────────
  function s(v) { return v == null ? '' : String(v); }
  function t(v) { return s(v).trim(); }
  function nz(v) { const x = t(v); return x === '' ? null : x; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function josa(w, withFinal, without) {
    let x = s(w).replace(/\s*[(（][^)）]*[)）]\s*$/, '');   // '공고명(입찰 종류)' → 읽는 말은 '공고명'
    if (!x) x = s(w);
    const c = x.charCodeAt(x.length - 1) - 0xAC00;
    return c >= 0 && c < 11172 && c % 28 ? withFinal : without;
  }
  isn.topic = function (w) { return s(w) + josa(w, '은', '는'); };      // {칸 이름}은/는
  isn.subject = function (w) { return s(w) + josa(w, '이', '가'); };    // {칸 이름}이/가
  isn.object = function (w) { return s(w) + josa(w, '을', '를'); };     // {칸 이름}을/를 (괄호로 끝나는 칸 이름용 — dlg.withObj 는 마지막 글자만 본다)
  function strMap(o) { const out = {}; const src = obj(o); Object.keys(src).forEach(function (k) { out[k] = s(src[k]); }); return out; }

  // ── 상수 ──────────────────────────────────────────────────────────
  isn.FORM_CD = 'INST_SUMMARY';
  isn.SCREEN = 'prep_form';
  const BTN = isn.BTN = {
    open: 'form_open', refresh: 'form_refresh', save: 'form_save', refill: 'form_refill', prefill: 'form_prefill',
    confirm: 'form_confirm', unconfirm: 'form_unconfirm', history: 'form_history', docx: 'form_docx', draftDocx: 'form_draft_docx',
  };
  isn.FIX_NAMES = { inst_edit: '기관 기본 정보', head_card: '기관장 정보', bank_contract: '금고 약정 기록' };
  const NOTE_MAX = 100;
  const REASON_MAX = 200;
  const UNIT_MAX = 20;
  const YEAR_MIN = 2000;
  const YEAR_MAX = 2100;
  const MAX_YEAR_COLS = 10;
  const BIZ_LIMIT = { group: 60, sub: 60, lines: 5, line: 200 };
  const FUND_LIMIT = { kind: 60, lines: 10, line: 300 };
  const NOTES_LIMIT = { n: 5, len: 300 };
  const TABLE_KEYS = { biz: 1, fund: 1, years: 1 };
  const MISMATCH = '화면과 서버의 양식이 맞지 않아 저장하지 못했습니다. 화면을 새로 고친 뒤 다시 하세요.';

  // ── 화면 문구 ─────────────────────────────────────────────────────
  const T = isn.T = {
    title: function (n) { return '기관 정보 요약 — ' + s(n); },
    loading: '양식을 불러오는 중…',
    prefilling: '원본에서 기관명·기관장·현 거래 은행과 주요 사업을 채우는 중…',
    emptyView: '아직 작성하지 않았습니다. 이 건의 영업 담당자가 작성하면 여기에서 볼 수 있습니다.',
    dirty: '닫으면 저장하지 않은 내용이 사라집니다.',
    page1: '워드에는 1쪽(요약)만 나옵니다. 2쪽 평가 기준표는 아직 이 화면에서 만들지 않습니다.',
    saving: '저장 중…', making: '만드는 중…', confirming: '확정하는 중…',
    saved: function (v) { return 'v' + v + '판으로 저장했습니다.'; },
    noChange: '바뀐 내용이 없어 새 판을 만들지 않았습니다.',
    confirmed: function (v) { return 'v' + v + '판으로 확정했습니다. 워드 확정본을 내려받을 수 있습니다.'; },
    unconfirmed: function (v) { return 'v' + v + '판 확정을 취소했습니다. 고친 뒤 다시 확정하세요.'; },
    downloaded: function (v, draft) { return '워드 파일을 내려받았습니다(v' + v + '판' + (draft ? ', 초안' : '') + ').'; },
    noteHelp: '어디서 확인했는지 적으세요(예: 2026 예산서 3쪽).',
    effectHelp: '금액·비율을 적으면 그 숫자가 어디서 나왔는지 같은 줄에 적으세요.',
    sameGroup: '같은 대분류가 이어진 줄은 워드에서 한 칸으로 합쳐집니다.',
    afterEnd: '협약 종료 뒤 연도는 워드에서 빗금으로 칠해집니다.',
    amountBad: '숫자로 적으세요(소수 3자리까지, 쉼표 가능).',
    fixCells: function (verb, n) { return verb + '하지 못했습니다. 빨간 칸 ' + n + '곳을 고치세요.'; },
    reasonEmpty: '취소 사유를 적으세요.',
    reasonHelp: '사유는 사전준비 이력에 남습니다. 개인정보(주민등록번호·전화번호)는 적지 마세요.',
    histHelp: '판 내용은 지금 판과 확정본만 볼 수 있습니다.',
    fixHint: function (name, screen) {
      return '지도나 입찰 현황판에서 ' + isn.object(name || '이 기관') + ' 열어 \'' + (isn.FIX_NAMES[screen] || '원 화면') +
        '\'에서 고치세요. 고친 뒤 이 양식을 다시 열면 [다시 불러오기]가 나타납니다.';
    },
  };

  // ── 칸 지도(tpl.keys) ─────────────────────────────────────────────
  isn.keysOf = function (tpl, kind) { return arr(tpl && tpl.keys).filter(function (k) { return k && k.kind === kind; }); };
  isn.keyInfo = function (tpl, key) {
    const a = arr(tpl && tpl.keys);
    for (let i = 0; i < a.length; i += 1) if (a[i] && a[i].key === key) return a[i];
    return null;
  };
  isn.labelOf = function (tpl, key) { const k = isn.keyInfo(tpl, key); return k ? s(k.label) : s(key); };

  // ── 글자 다루기 ───────────────────────────────────────────────────
  // 워드가 글머리를 다시 붙이므로 붙여넣은 줄 앞의 ㅇ·○·•·· 와 '- '(뒤에 공백이 있는 하이픈)는 지운다. '-3% 감소'의 하이픈은 지키지 않는다는 뜻이 아니라, 공백이 없으면 글자로 본다.
  const BULLET_RE = /^[\s\u00a0]*(?:(?:[ㅇ○●•·▪■]|[-–—](?=\s))[\s\u00a0]*)+/;
  isn.stripBullet = function (line) { return s(line).replace(BULLET_RE, ''); };
  // 여러 줄 붙여넣기 정리: 줄 나눔 → 앞머리 제거 → 빈 줄 버림 → room 줄까지만 → 넘친 줄 수.
  isn.splitPaste = function (text, room) {
    const all = s(text).split(/\r\n|\r|\n|\u2028|\u2029/).map(function (l) { return isn.stripBullet(l.replace(/\t/g, ' ')).trim(); }).filter(Boolean);
    const cap = Math.max(0, Math.floor(Number(room)) || 0);
    return { lines: all.slice(0, cap), dropped: Math.max(0, all.length - cap) };
  };
  // 목록 a 의 i 번째 줄에 여러 줄을 넣는다(a 를 직접 바꾼다). 지금 줄이 비어 있으면 그 줄부터, 아니면 아래에.
  isn.pasteInto = function (a, i, text, max) {
    const cur = t(a[i]) === '';
    const room = max - (a.length - (cur ? 1 : 0));
    const r = isn.splitPaste(text, room);
    if (!r.lines.length) return { last: i, dropped: r.dropped, added: 0 };
    const at = cur ? i : i + 1;
    Array.prototype.splice.apply(a, [at, cur ? 1 : 0].concat(r.lines));
    return { last: at + r.lines.length - 1, dropped: r.dropped, added: r.lines.length };
  };
  isn.cleanAmount = function (v) { return s(v).replace(/[,\uFF0C\s\u00a0]/g, ''); };
  isn.amountBad = function (v) { const c = isn.cleanAmount(v); return c !== '' && !/^-?\d{1,13}(\.\d{1,3})?$/.test(c); };
  isn.safeUrl = function (u) {
    const x = t(u);
    if (!/^https?:\/\/[^\s]+$/i.test(x)) return '';
    return x;
  };
  isn.kst = function (iso) {
    const ms = Date.parse(s(iso).replace(/(\.\d{3})\d+/, '$1'));
    if (!isFinite(ms)) return '';
    const d = new Date(ms + 9 * 3600000);
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  };
  isn.fileNameOf = function (cd, fallback) {
    const hd = s(cd);
    const clean = function (n) { return n.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_'); };
    let m = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(hd);
    if (m) {
      try { const n = decodeURIComponent(m[1].trim()); if (n) return clean(n); } catch (e) { /* 아래 filename= 로 */ }
    }
    m = /filename\s*=\s*"([^"]*)"/i.exec(hd) || /filename\s*=\s*([^;]+)/i.exec(hd);
    if (m && t(m[1])) return clean(t(m[1]));
    return fallback || 'inst_summary.docx';
  };

  // ── 연도 표 ───────────────────────────────────────────────────────
  function toYear(v) { const x = t(v); return /^\d{4}$/.test(x) ? Number(x) : null; }
  // → { ok, years:[…], msg, id }  id 는 오류를 붙일 칸(from·to).
  isn.yearCols = function (y) {
    if (!y) return { ok: false, years: [], msg: '', id: 'from' };
    const f = toYear(y.from), e = toYear(y.to);
    if (f == null || f < YEAR_MIN || f > YEAR_MAX) return { ok: false, years: [], msg: '시작 연도는 ' + YEAR_MIN + '~' + YEAR_MAX + ' 사이 숫자로 적으세요.', id: 'from' };
    if (e == null || e < YEAR_MIN || e > YEAR_MAX) return { ok: false, years: [], msg: '끝 연도는 ' + YEAR_MIN + '~' + YEAR_MAX + ' 사이 숫자로 적으세요.', id: 'to' };
    if (f > e) return { ok: false, years: [], msg: '시작 연도는 끝 연도보다 늦을 수 없습니다.', id: 'from' };
    if (e - f + 1 > MAX_YEAR_COLS) return { ok: false, years: [], msg: '연도는 최대 ' + MAX_YEAR_COLS + '열까지 둘 수 있습니다.', id: 'to' };
    const years = [];
    for (let k = f; k <= e; k += 1) years.push(k);
    return { ok: true, years: years, msg: '', id: '' };
  };
  // 범위 밖 연도의 값을 뺀다. → { values:{mmda,income}, removed:{ '2027': 개수 } } (범위가 잘못이면 values 는 비고 removed 도 비운다).
  isn.clipYears = function (y) {
    const c = isn.yearCols(y);
    const values = { mmda: {}, income: {} };
    const removed = {};
    ['mmda', 'income'].forEach(function (row) {
      const src = obj(y && y[row]);
      Object.keys(src).forEach(function (k) {
        if (t(src[k]) === '') return;
        const n = toYear(k);
        if (c.ok && n != null && n >= c.years[0] && n <= c.years[c.years.length - 1]) values[row][k] = src[k];
        else if (c.ok) removed[k] = (removed[k] || 0) + 1;
      });
    });
    return { values: values, removed: removed };
  };
  isn.outText = function (removed) {
    return Object.keys(obj(removed)).sort().map(function (k) { return k + '년 값 ' + removed[k] + '개는 범위 밖이라 저장하지 않습니다.'; }).join(' ');
  };

  // ── 화면 모델 ↔ 서버 본문 ─────────────────────────────────────────
  // 모델: { texts:{key:{val,note}}, lists:{key:[글…]}, biz:[{group,sub,lines:[글…]}], fund:[{kind,lines:[{lv,text}]}], years:null|{unit,from,to,end,mmda,income,notes} }
  isn.modelFromView = function (view) {
    const tpl = view && view.tpl;
    const c = view && view.content;
    const f = obj(c && c.fields), l = obj(c && c.lists), tb = obj(c && c.tables);
    const m = { texts: {}, lists: {}, biz: [], fund: [], years: null };
    isn.keysOf(tpl, 'TEXT').forEach(function (k) { const x = obj(f[k.key]); m.texts[k.key] = { val: s(x.val), note: s(x.note) }; });
    isn.keysOf(tpl, 'LIST').forEach(function (k) { const a = arr(l[k.key]).map(s); m.lists[k.key] = a.length ? a : ['']; });
    m.biz = arr(obj(tb.biz).rows).map(function (r) {
      const ln = arr(r && r.lines).map(s);
      return { group: s(r && r.group), sub: s(r && r.sub), lines: ln.length ? ln : [''] };
    });
    m.fund = arr(obj(tb.fund).rows).map(function (r) {
      const ln = arr(r && r.lines).map(function (x) { return { lv: Number(x && x.lv) === 1 ? 1 : 0, text: s(x && x.text) }; });
      return { kind: s(r && r.kind), lines: ln.length ? ln : [{ lv: 0, text: '' }] };
    });
    const y = tb.years;
    if (y && typeof y === 'object') {
      const nt = arr(y.notes).map(s);
      m.years = { unit: s(y.unit), from: s(y.from), to: s(y.to), end: y.end == null ? '' : s(y.end), mmda: strMap(y.mmda), income: strMap(y.income), notes: nt.length ? nt : [''] };
    }
    return m;
  };
  function yearsBody(y) {
    if (!y) return null;
    const c = isn.yearCols(y);
    const from = toYear(y.from), to = toYear(y.to), endN = toYear(y.end);
    const clip = isn.clipYears(y);
    const num = function (row) {
      const o = {};
      Object.keys(clip.values[row]).sort().forEach(function (k) { const v = isn.cleanAmount(clip.values[row][k]); if (v !== '') o[k] = v; });
      return o;
    };
    return {
      unit: t(y.unit), from: from, to: to,
      end: c.ok && endN != null && endN >= from && endN <= to ? endN : null,
      mmda: num('mmda'), income: num('income'),
      notes: arr(y.notes).map(t).filter(Boolean),
    };
  }
  // PUT …/draft 본문. FACT 칸·biz.src·dropped 는 보내지 않는다. 통째로 빈 줄은 뺀다.
  isn.buildBody = function (m, tpl, baseVer) {
    const mm = m || {};
    const fields = {}, lists = {};
    isn.keysOf(tpl, 'TEXT').forEach(function (k) { const x = obj(obj(mm.texts)[k.key]); fields[k.key] = { val: nz(x.val), note: nz(x.note) }; });
    isn.keysOf(tpl, 'LIST').forEach(function (k) { lists[k.key] = arr(obj(mm.lists)[k.key]).map(t).filter(Boolean); });
    const biz = [];
    arr(mm.biz).forEach(function (r) {
      const g = t(r.group), sub = t(r.sub), ln = arr(r.lines).map(t).filter(Boolean);
      if (!g && !sub && !ln.length) return;
      biz.push({ group: g, sub: nz(sub), lines: ln });
    });
    const fund = [];
    arr(mm.fund).forEach(function (r) {
      const kind = t(r.kind);
      const ln = arr(r.lines).map(function (x) { return { lv: Number(x && x.lv) === 1 ? 1 : 0, text: t(x && x.text) }; }).filter(function (x) { return x.text !== ''; });
      if (!kind && !ln.length) return;
      fund.push({ kind: kind, lines: ln });
    });
    return { base_ver: baseVer, fields: fields, lists: lists, tables: { biz: { rows: biz }, fund: { rows: fund }, years: yearsBody(mm.years) } };
  };
  isn.bodyKey = function (m, tpl) { return JSON.stringify(isn.buildBody(m, tpl, 0)); };
  isn.isDirty = function (m, baseKey, tpl) { return !!m && isn.bodyKey(m, tpl) !== baseKey; };

  // ── 사전 검사 ─────────────────────────────────────────────────────
  // 원본 칸이 필수인데 값이 없는 키(서버 missingRequired 와 같은 뜻).
  isn.missingFacts = function (view) {
    const f = obj(obj(view && view.content).fields);
    return isn.keysOf(view && view.tpl, 'FACT').filter(function (k) { return k.required && t(obj(f[k.key]).val) === ''; }).map(function (k) { return k.key; });
  };
  isn.factMissingMsg = function (tpl, key) {
    const k = isn.keyInfo(tpl, key) || { label: key, fix_screen: null };
    const fix = isn.FIX_NAMES[k.fix_screen];
    return '원본에 ' + isn.subject(k.label) + ' 없습니다.' + (fix ? ' ' + fix + '에서 넣으세요.' : '');
  };
  // → [{ id, msg }] — id 는 화면 칸의 DOM id. 저장은 형식 오류만, 확정(o.confirm)은 필수 칸까지 본다.
  isn.precheck = function (m, tpl, o) {
    const opt = o || {};
    const out = [];
    const add = function (id, msg) { out.push({ id: id, msg: msg }); };
    const mm = m || {};
    const withObj = isn.object;
    isn.keysOf(tpl, 'TEXT').forEach(function (k) {
      const x = obj(obj(mm.texts)[k.key]);
      const val = t(x.val), note = t(x.note);
      const id = 'isf-f-' + k.key;
      if (k.max_len && val.length > k.max_len) add(id, isn.topic(k.label) + ' ' + k.max_len + '자 이하 한 줄로 적으세요.');
      else if (opt.confirm && k.required && !val) add(id, withObj(k.label) + ' 적으세요.');
      if (note.length > NOTE_MAX) add('isf-n-' + k.key, '출처는 ' + NOTE_MAX + '자 이하로 적으세요.');
    });
    isn.keysOf(tpl, 'LIST').forEach(function (k) {
      const a = arr(obj(mm.lists)[k.key]);
      let n = 0;
      a.forEach(function (v, i) {
        const x = t(v);
        if (!x) return;
        n += 1;
        if (k.max_len && x.length > k.max_len) add('isf-l-' + k.key + '-' + i, (i + 1) + '번째 줄은 ' + k.max_len + '자 이하로 적으세요.');
      });
      if (k.max_items && n > k.max_items) add('isf-l-' + k.key + '-add', k.max_items + '줄까지 쓸 수 있습니다.');
      if (opt.confirm && k.required && n === 0) add('isf-l-' + k.key + '-0', withObj(k.label) + ' 적으세요.');
    });
    // 기관 주요 사업
    const bi = isn.keyInfo(tpl, 'biz');
    let nb = 0;
    arr(mm.biz).forEach(function (r, i) {
      const g = t(r.group), sub = t(r.sub), ln = arr(r.lines).map(t);
      if (!g && !sub && !ln.some(Boolean)) return;
      nb += 1;
      if (!g) add('isf-b-' + i + '-g', '대분류를 적으세요.');
      else if (g.length > BIZ_LIMIT.group) add('isf-b-' + i + '-g', '대분류는 ' + BIZ_LIMIT.group + '자 이하로 적으세요.');
      if (sub.length > BIZ_LIMIT.sub) add('isf-b-' + i + '-s', '세부 사업은 ' + BIZ_LIMIT.sub + '자 이하로 적으세요.');
      let c = 0;
      ln.forEach(function (x, j) {
        if (!x) return;
        c += 1;
        if (x.length > BIZ_LIMIT.line) add('isf-b-' + i + '-l-' + j, '내용은 줄당 ' + BIZ_LIMIT.line + '자 이하로 적으세요.');
      });
      if (c > BIZ_LIMIT.lines) add('isf-b-' + i + '-l-0', '내용은 ' + BIZ_LIMIT.lines + '줄까지 쓸 수 있습니다.');
    });
    const maxBiz = bi && bi.max_items ? bi.max_items : 40;
    if (nb > maxBiz) add('isf-b-add', '사업은 ' + maxBiz + '줄까지 쓸 수 있습니다.');
    // 예산 운영 방식
    const fi = isn.keyInfo(tpl, 'fund');
    let nf = 0;
    arr(mm.fund).forEach(function (r, i) {
      const kind = t(r.kind), ln = arr(r.lines).map(function (x) { return t(x && x.text); });
      if (!kind && !ln.some(Boolean)) return;
      nf += 1;
      if (!kind) add('isf-u-' + i + '-k', '구분을 적으세요.');
      else if (kind.length > FUND_LIMIT.kind) add('isf-u-' + i + '-k', '구분은 ' + FUND_LIMIT.kind + '자 이하로 적으세요.');
      let c = 0;
      ln.forEach(function (x, j) {
        if (!x) return;
        c += 1;
        if (x.length > FUND_LIMIT.line) add('isf-u-' + i + '-l-' + j, '내용은 줄당 ' + FUND_LIMIT.line + '자 이하로 적으세요.');
      });
      if (c > FUND_LIMIT.lines) add('isf-u-' + i + '-l-0', '내용은 ' + FUND_LIMIT.lines + '줄까지 쓸 수 있습니다.');
    });
    const maxFund = fi && fi.max_items ? fi.max_items : 10;
    if (nf > maxFund) add('isf-u-add', '운영 방식은 ' + maxFund + '줄까지 쓸 수 있습니다.');
    // 연도별 표
    const y = mm.years;
    if (y) {
      const unit = t(y.unit);
      if (!unit) add('isf-y-unit', '단위를 적으세요.');
      else if (unit.length > UNIT_MAX) add('isf-y-unit', '단위는 ' + UNIT_MAX + '자 이하로 적으세요.');
      const c = isn.yearCols(y);
      if (!c.ok) add('isf-y-' + c.id, c.msg);
      else {
        ['mmda', 'income'].forEach(function (row) {
          c.years.forEach(function (yr) { if (isn.amountBad(obj(y[row])[String(yr)])) add('isf-y-' + row + '-' + yr, T.amountBad); });
        });
      }
      let nn = 0;
      arr(y.notes).forEach(function (v, i) {
        const x = t(v);
        if (!x) return;
        nn += 1;
        if (x.length > NOTES_LIMIT.len) add('isf-yn-' + i, (i + 1) + '번째 주석은 ' + NOTES_LIMIT.len + '자 이하로 적으세요.');
      });
      if (nn > NOTES_LIMIT.n) add('isf-yn-add', '주석은 ' + NOTES_LIMIT.n + '개까지 쓸 수 있습니다.');
    }
    if (opt.confirm && opt.view) isn.missingFacts(opt.view).forEach(function (key) { add('isf-f-' + key, isn.factMissingMsg(tpl, key)); });
    return out;
  };

  // ── 모드·칩·머리 단추·경고 줄(6-3·6-4) ───────────────────────────
  isn.modeOf = function (view) { return obj(view && view.viewer).can_edit === true ? 'write' : 'view'; };
  isn.chipOf = function (view) {
    const vw = obj(view && view.viewer);
    const cur = Number(view && view.cur_ver) || 0;
    if (cur === 0) return { cls: 'empty', text: '작성 전', icon: '' };
    if (vw.can_edit === true) return { cls: 'draft', text: '작성 중', icon: '' };
    if (view.confirmed && vw.lock_reason === 'CONFIRMED') return { cls: 'done', text: '확정됨', icon: 'check' };
    if (vw.lock_reason === 'STATE') {
      return view.state_cd === 'APPROVAL_PENDING' ? { cls: 'wait', text: '승인 중이라 잠김', icon: '' } : { cls: 'fixed', text: '승인 뒤 고정', icon: 'lock' };
    }
    return { cls: 'src', text: '보기만', icon: '' };
  };
  // → { mode, docx:'confirmed'|'draft'|null, confirm, unconfirm, saveCancel, closeHead, closeFoot }
  isn.headModel = function (view, dirty, o) {
    const opt = o || {};
    const none = { mode: 'view', docx: null, confirm: false, unconfirm: false, saveCancel: false, closeHead: true, closeFoot: false };
    if (!view || opt.loading || opt.broken) return none;
    const vw = obj(view.viewer);
    const cur = Number(view.cur_ver) || 0;
    if (vw.can_edit === true) {
      return { mode: 'write', docx: cur > 0 || dirty ? 'draft' : null, confirm: true, unconfirm: false, saveCancel: true, closeHead: false, closeFoot: false };
    }
    const docx = view.confirmed ? 'confirmed' : cur > 0 ? 'draft' : null;
    return { mode: 'view', docx: docx, confirm: false, unconfirm: vw.can_unconfirm === true && !!view.confirmed, saveCancel: false, closeHead: docx !== null, closeFoot: docx === null };
  };
  // → [{ id, pre, keys, post, btn }] — keys 는 칸 이름 링크로, btn 이 'refillAll' 이면 [모두 다시 불러오기].
  isn.warnLines = function (view) {
    if (!view) return [];
    const vw = obj(view.viewer);
    const cur = Number(view.cur_ver) || 0;
    const stale = arr(view.stale_keys), chg = arr(view.confirmed_changed_keys);
    const out = [];
    if (vw.can_edit === true && stale.length) {
      out.push({ id: 'stale', pre: '원본이 바뀐 칸이 ' + stale.length + '개 있습니다: ', keys: stale, post: '. 확정하려면 다시 불러오세요.', btn: 'refillAll' });
    }
    if (view.confirmed && chg.length) {
      const more = vw.lock_reason === 'CONFIRMED' && vw.can_unconfirm === true ? ' 고치려면 [확정 취소] 뒤 다시 불러오세요.' : '';
      out.push({ id: 'changed', pre: '확정한 뒤 원본이 바뀐 칸이 ' + chg.length + '개 있습니다: ', keys: chg, post: '. 워드에는 확정 당시 값이 나옵니다.' + more, btn: null });
    }
    if (vw.lock_reason === 'STATE') {
      if (view.state_cd === 'APPROVAL_PENDING') {
        out.push({ id: 'pending', pre: '사전준비 승인 중이라 고칠 수 없습니다. 고쳐야 하면 승인 요청을 회수하세요.', keys: [], post: '', btn: null });
      } else if (!view.confirmed) {
        out.push({ id: 'fixed', pre: '확정하지 않은 채 사전준비가 승인되어 마지막 저장 판(v' + cur + ')으로 고정되었습니다.', keys: [], post: '', btn: null });
      }
    } else if (vw.lock_reason == null && vw.can_edit !== true) {
      out.push({ id: 'readonly', pre: '이 건의 영업 담당자만 고칠 수 있습니다. 보기만 합니다.', keys: [], post: '', btn: null });
    }
    return out;
  };
  isn.confirmText = function (ver, dirty) {
    return (dirty ? '고친 내용을 저장한 뒤 확정합니다.' : 'v' + ver + '판을 확정합니다.') +
      '\n확정하면 이 내용이 정본이 되고 워드 확정본이 만들어집니다. 고치려면 사유를 적고 확정을 취소해야 합니다.';
  };
  // 첫 작성 자동 채움 뒤 상태 줄.
  isn.filledText = function (view) {
    const f = obj(obj(view && view.content).fields);
    const names = [];
    isn.keysOf(view && view.tpl, 'FACT').forEach(function (k) { if (t(obj(f[k.key]).val)) names.push(k.label); });
    if (arr(obj(obj(obj(view && view.content).tables).biz).rows).length) names.push(isn.labelOf(view && view.tpl, 'biz'));
    if (!names.length) return '원본에서 채울 값이 없었습니다. 칸을 직접 적고 [저장]하세요.';
    return '원본에서 ' + isn.object(names.join(', ')) + ' 채웠습니다. 나머지 칸을 적고 [저장]하세요.';
  };
  isn.verChangedText = function (name, at, oldV, newV) {
    const who = t(name) ? t(name) + '님이' : '다른 사람이';
    const when = isn.kst(at);
    const vers = oldV && newV ? '(v' + oldV + '→v' + newV + ')' : '';
    return who + (when ? ' ' + when + '에' : '') + ' 이 양식을 먼저 저장했습니다' + vers + '. 화면에서 고친 내용은 아직 그대로 있습니다.';
  };
  // 판 이력 표 줄: 판 | 한 일 | 저장한 사람 | 시각 | 비고, 최신 판이 위.
  isn.histRows = function (list) {
    return arr(list).slice().sort(function (a, b) { return (Number(b && b.ver_no) || 0) - (Number(a && a.ver_no) || 0); }).map(function (r) {
      return ['v' + s(r.ver_no), r.kind_cd === 'PREFILL' ? '원본 불러옴' : '저장', s(r.saved_by_name), isn.kst(r.saved_at), r.confirmed ? '확정본' : ''];
    });
  };

  // ── 오류 코드 → 화면 문구(6-9) ────────────────────────────────────
  // → { code, text, action, keys, key } — action: none | verchanged | stale | incomplete | locked | reread | integrity | table | field | plan | contract
  isn.errInfo = function (status, detail, ctx) {
    const c = ctx || {};
    const tpl = c.tpl, kind = c.kind || '';
    const d = detail && typeof detail === 'object' ? detail : {};
    const code = s(d.code);
    const R = function (text, action, extra) { return Object.assign({ code: code, text: text, action: action || 'none', keys: [], key: '' }, extra || {}); };
    const labelFor = function (k) { return k === 'reason' ? '취소 사유' : isn.keyInfo(tpl, k) ? isn.labelOf(tpl, k) : ''; };
    if (!status) return R('서버에 연결하지 못했습니다. 입력한 내용은 그대로 있습니다.', 'none', { code: 'NETWORK' });
    if (status === 409) {
      switch (code) {
        case 'VER_CHANGED': return R(isn.verChangedText('', '', 0, 0), 'verchanged');
        case 'FORM_STALE': {
          const keys = arr(d.stale_keys);
          return R('원본이 바뀐 칸이 있어 확정하지 못했습니다: ' + keys.map(function (k) { return isn.labelOf(tpl, k); }).join(', ') + '. [모두 다시 불러오기]를 누른 뒤 확정하세요.', 'stale', { keys: keys });
        }
        case 'FORM_INCOMPLETE': return R('', 'incomplete', { keys: arr(d.missing_keys) });
        case 'FORM_LOCKED':
          return R(d.state_cd === 'APPROVAL_PENDING'
            ? '사전준비 승인 요청이 올라가 지금은 고칠 수 없습니다. 고친 내용은 저장되지 않았습니다. 고쳐야 하면 승인 요청을 회수하세요.'
            : '사전준비가 승인되어 이 양식은 고정되었습니다. 고친 내용은 저장되지 않았습니다.', 'locked');
        case 'FORM_CONFIRMED':
        case 'ALREADY_CONFIRMED': return R('다른 곳에서 이미 확정되었습니다. 최신 상태로 다시 불러왔습니다.', 'reread');
        case 'NOT_CONFIRMED':
          return R(kind === 'unconfirm' ? '이미 확정이 취소되었습니다.' : '확정된 판이 없어 확정본을 만들 수 없습니다.', 'reread');
        case 'FORM_EMPTY': return R('저장된 판이 없어 워드를 만들 수 없습니다. 먼저 [저장]하세요.');
        case 'FORM_INTEGRITY': return R('저장된 양식이 바뀐 흔적이 있어 열거나 내보낼 수 없습니다. 개발부서에 알려 주세요.', 'integrity');
        case 'RENDER_UNSUPPORTED': return R('이 판은 지금 워드로 만들 수 없는 형식입니다. 개발부서에 알려 주세요.');
        case 'TOO_MANY_VERSIONS': return R('이 양식에 저장된 판이 500개를 넘어 더 저장할 수 없습니다. 영업팀장에게 알리고 개발부서에 정리를 요청하세요.');
        case 'NO_PLAN_IMPORT': return R('이 기관에 반입된 사업계획이 없어 채울 수 없습니다. 사업을 직접 적으세요.', 'plan');
        case 'NO_CONTRACT': return R('이 기관에 금고 약정 기록이 없어 시작 연도를 정할 수 없습니다. [직접 만들기]로 연도를 정하세요.', 'contract');
        default: break;
      }
    }
    if (status === 400) {
      if (code === 'CONTENT_TOO_LARGE') return R('양식 내용이 너무 커서 저장하지 못했습니다. 사업 표의 내용 줄을 줄이세요.');
      if (code === 'UNKNOWN_KEY' || code === 'FIELD_READONLY') return R(MISMATCH);
      if (code === 'UI_ID_REQUIRED') return R('요청에 화면 정보가 빠져 처리하지 못했습니다. 화면을 새로 고치세요.');
      if (code === 'BAD_VALUE' || code === 'BAD_TYPE' || code === 'TOO_MANY' || code === 'BAD_YEARS') {
        const key = s(d.key);
        if (TABLE_KEYS[key]) return R('이 표에 형식이 맞지 않는 칸이 있습니다. 빨간 칸을 고치세요.', 'table', { key: key });
        if (key === 'reason') return R('취소 사유는 ' + REASON_MAX + '자 이하 한 줄로 적으세요.', 'field', { key: key });
        const ki = isn.keyInfo(tpl, key);
        if (ki && ki.max_len) return R(isn.topic(ki.label) + ' ' + ki.max_len + '자 이하 한 줄로 적으세요.', 'field', { key: key });
        return R(MISMATCH);
      }
      return R(MISMATCH);
    }
    if (status === 422) {
      const key = s(d.key);
      const lab = labelFor(key) || '입력한 내용';
      return R(kind === 'unconfirm'
        ? lab + '에 주민등록번호·전화번호처럼 보이는 값이 있어 확정을 취소하지 않았습니다. 그 부분을 지우고 다시 하세요.'
        : lab + '에 주민등록번호·전화번호처럼 보이는 값이 있어 저장하지 않았습니다. 그 부분을 지우고 다시 저장하세요.', 'field', { key: key });
    }
    if (status === 403) return R('이 양식을 고칠 권한이 없습니다. 이 건의 영업 담당자인지 확인하세요.', kind === 'load' ? 'none' : 'reread');
    if (status === 404) return R('이 건의 양식을 볼 수 없습니다. 담당이 바뀌었거나 건이 없어졌을 수 있습니다. 사전준비 목록을 새로 고치세요.');
    if (status >= 500) return R('처리하지 못했습니다. 기록을 남기지 못하면 내용을 내보내지 않습니다. 잠시 뒤 다시 하세요.');
    return R('처리하지 못했습니다. 잠시 뒤 다시 하세요.');
  };

  // ── 요청 ──────────────────────────────────────────────────────────
  isn.url = function (id, tail) { return '/bidcases/' + encodeURIComponent(s(id)) + '/prep/forms/' + isn.FORM_CD + (tail || ''); };
  // 모든 호출은 이 함수 하나로. 실패하면 Error 에 status·detail 을 달아 던진다(네트워크 실패는 status 없음).
  // o.blob 이면 내려받기 — { blob, name }. o.fetch 는 시험용 주입.
  isn.call = function (method, url, body, button, o) {
    const opt = o || {};
    const init = { method: method, headers: { 'X-Screen-Id': isn.SCREEN, 'X-Button-Id': button } };
    if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    const f = opt.fetch || fetch;
    return f(url, init).then(function (r) {
      if (r.ok) {
        if (opt.blob) {
          return r.blob().then(function (b) { return { blob: b, name: isn.fileNameOf(r.headers && r.headers.get ? r.headers.get('Content-Disposition') : '') }; });
        }
        return r.json();
      }
      return r.json().catch(function () { return {}; }).then(function (j) {
        const e = new Error('http ' + r.status);
        e.status = r.status;
        e.detail = j && j.detail;
        throw e;
      });
    });
  };

  // ══ 화면(브라우저에서만) ═══════════════════════════════════════════
  let S = null;
  const BUSY_BTN = { form_save: 'isf-save', form_confirm: 'isf-confirm', form_draft_docx: 'isf-docx', form_docx: 'isf-docx' };

  function byId(id) { return document.getElementById(id); }
  function h(tag, a, kids) {
    const n = document.createElement(tag);
    if (a) {
      Object.keys(a).forEach(function (k) {
        const v = a[k];
        if (v == null || v === false) return;
        if (k === 'cls') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'value') n.value = v;
        else n.setAttribute(k, v === true ? '' : String(v));
      });
    }
    arr(kids).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return n;
  }
  function icon(kind) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '10'); svg.setAttribute('height', '10'); svg.setAttribute('viewBox', '0 0 12 12'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', kind === 'check' ? 'M2 6.5l2.6 2.6L10 3.4' : 'M3 5.5V4a3 3 0 016 0v1.5M2.5 5.5h7v5h-7z');
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.5');
    svg.appendChild(p);
    return svg;
  }
  function chip(cls, text, ic) { return h('span', { cls: 'isf-chip ' + cls }, [ic ? icon(ic) : null, text]); }
  function reqMark() { return h('span', { cls: 'isf-req', 'aria-hidden': 'true', text: '*' }); }
  function btn(text, o) {
    const b = h('button', { type: 'button', id: o.id, cls: o.cls, 'aria-label': o.aria, disabled: o.disabled, text: text });
    if (o.click) b.addEventListener('click', o.click);
    return b;
  }
  function isDirtyNow(my) { const x = my || S; return !!(x && x.write && x.m && isn.isDirty(x.m, x.baseKey, x.tpl)); }
  function focusId(id, end) {
    const n = byId(id);
    if (!n || !n.focus) return;
    n.focus();
    if (end && n.type === 'text' && typeof n.setSelectionRange === 'function') { try { const l = n.value.length; n.setSelectionRange(l, l); } catch (e) { /* 숫자 칸 */ } }
    if (n.scrollIntoView) n.scrollIntoView({ block: 'nearest' });
  }
  // 결과 줄(#isf-st): 오류는 role=alert·빨강, 성공은 8초 뒤 접힌다. keep 이면 접지 않는다.
  function say(text, isErr, keep) {
    const p = byId('isf-st');
    if (!p) return;
    dlgApi().line(p, text, !!isErr);
    if (S) clearTimeout(S.timer);
    if (S && text && !isErr && !keep) S.timer = setTimeout(function () { const q = byId('isf-st'); if (q) dlgApi().line(q, ''); }, 8000);
  }
  // 창 전체 오류(#isf-err): 글 + 단추들.
  function showErr(text, actions) {
    const p = byId('isf-err');
    if (!p) return;
    p.textContent = '';
    if (!text) return;
    p.appendChild(document.createTextNode(text));
    arr(actions).forEach(function (a) { p.appendChild(btn(a.label, { click: a.fn })); });
  }
  function inlineMsg(id, text) { const p = byId(id); if (p) p.textContent = text; else say(text, true); }
  // 요청 중에는 머리 줄 단추를 모두 잠그고, 누른 단추에만 aria-busy 와 글자를 둔다.
  function setBusy(on, id, text) {
    if (!S) return;
    S.busy = on;
    const acts = byId('isf-acts');
    if (!acts) return;
    const D = dlgApi();
    Array.prototype.forEach.call(acts.querySelectorAll('button'), function (b) {
      D.setDisabled(b, on);
      if (!on) {
        b.removeAttribute('aria-busy');
        if (b.dataset.label) { b.textContent = b.dataset.label; delete b.dataset.label; }
      } else if (id && b.id === id) {
        b.dataset.label = b.textContent; b.textContent = text; b.setAttribute('aria-busy', 'true');
      }
    });
  }
  function closeCf() { const c = byId('isf-cf'); if (c) c.textContent = ''; }

  // ── 칠하기: 머리 · 상태 띠 · 경고 줄 · 아래 줄 ──────────────────────
  function paintAll() {
    if (!S || !byId('isf-ov')) return;
    paintHead(); paintState(); paintWarns(); paintBody(); paintFoot();
  }
  function paintHead() {
    const acts = byId('isf-acts');
    if (!acts) return;
    const my = S;
    const hm = isn.headModel(my.view, isDirtyNow(my), { loading: my.loading || !!my.loadErr, broken: my.broken });
    my.hm = hm;
    my.docxKind = hm.docx;
    const sig = JSON.stringify(hm);
    if (sig === my.headSig) return;
    my.headSig = sig;
    acts.textContent = '';
    if (hm.docx) acts.appendChild(btn(hm.docx === 'confirmed' ? '워드 내려받기(확정본)' : '워드 내려받기(초안)', { id: 'isf-docx', click: onDocx }));
    if (hm.confirm) acts.appendChild(btn('확정…', { id: 'isf-confirm', cls: 'dlg-go', click: onConfirm }));
    if (hm.unconfirm) acts.appendChild(btn('확정 취소…', { id: 'isf-unconfirm', click: openUnconfirm }));
    if (hm.saveCancel) {
      acts.appendChild(h('span', { cls: 'dlg-sep', 'aria-hidden': 'true' }));
      acts.appendChild(btn('취소', { id: 'isf-cancel', click: function () { dlgApi().requestClose(my.ov); } }));
      acts.appendChild(btn('저장', { id: 'isf-save', cls: 'dlg-go', click: function () { doSave(BTN.save, {}); } }));
    } else if (hm.closeHead) {
      if (hm.docx || hm.unconfirm) acts.appendChild(h('span', { cls: 'dlg-sep', 'aria-hidden': 'true' }));
      acts.appendChild(btn('닫기', { id: 'isf-close', click: function () { dlgApi().requestClose(my.ov); } }));
    }
  }
  function paintFoot() {
    const f = byId('isf-foot');
    if (!f) return;
    const my = S;
    f.textContent = '';
    const show = !!(my.hm && my.hm.closeFoot);
    f.hidden = !show;
    if (show) f.appendChild(btn('닫기', { id: 'isf-close2', click: function () { dlgApi().requestClose(my.ov); } }));
  }
  function num(text) { return h('span', { cls: 'isf-num', text: text }); }
  function paintState() {
    const el = byId('isf-state');
    if (!el) return;
    const v = S.view;
    el.textContent = '';
    if (!v || S.loading || S.loadErr) { el.hidden = true; return; }
    el.hidden = false;
    const c = isn.chipOf(v);
    el.appendChild(chip(c.cls, c.text, c.icon));
    const cur = Number(v.cur_ver) || 0;
    if (cur > 0) {
      const kids = [num('v' + cur), '판 · ' + (t(v.saved_by_name) ? t(v.saved_by_name) + ' ' : '') + '저장 ', num(isn.kst(v.saved_at))];
      if (v.confirmed) {
        kids.push(' · 확정 ', num('v' + v.confirmed.ver), '판 ' + (t(v.confirmed.by_name) ? t(v.confirmed.by_name) + ' ' : ''), num(isn.kst(v.confirmed.at)));
      }
      el.appendChild(h('span', {}, kids));
      el.appendChild(btn('판 이력', { id: 'isf-hist-btn', click: openHistory }));
    }
    el.appendChild(h('span', { cls: 'isf-sp', text: T.page1 }));
  }
  function paintWarns() {
    const host = byId('isf-warns');
    if (!host) return;
    host.textContent = '';
    if (!S.view || S.loading || S.loadErr) return;
    isn.warnLines(S.view).forEach(function (w) {
      const p = h('p', { cls: 'isf-warn', id: 'isf-warn-' + w.id });
      p.appendChild(document.createTextNode(w.pre));
      w.keys.forEach(function (k, i) {
        if (i) p.appendChild(document.createTextNode(', '));
        const a = h('a', { href: '#isf-f-' + k, text: isn.labelOf(S.tpl, k) });
        a.addEventListener('click', function (ev) { ev.preventDefault(); focusId('isf-f-' + k); });
        p.appendChild(a);
      });
      if (w.post) p.appendChild(document.createTextNode(w.post));
      if (w.btn === 'refillAll') p.appendChild(btn('모두 다시 불러오기', { id: 'isf-refillall', click: function () { doRefill(arr(S.view.stale_keys), BTN.refill, function () { return '원본에서 바뀐 칸을 다시 불러왔습니다.'; }); } }));
      host.appendChild(p);
    });
  }

  // ── 본문 ──────────────────────────────────────────────────────────
  function paintBody(fid, end) {
    const body = byId('isf-body');
    if (!body || !S) return;
    const top = body.scrollTop;
    const a = document.activeElement;
    const keep = a && a.id && body.contains(a) ? a.id : '';
    body.textContent = '';
    body.setAttribute('aria-busy', S.loading ? 'true' : 'false');
    if (S.loading) {
      body.appendChild(h('p', { cls: 'isf-empty', text: S.loadText || T.loading }));
    } else if (S.loadErr) {
      body.appendChild(h('p', { cls: 'isf-empty' }, [S.loadErr, btn('다시 시도', { id: 'isf-retry', click: function () { load(BTN.refresh); } })]));
    } else if (!S.view || !S.view.content) {
      body.appendChild(h('p', { cls: 'isf-empty', text: T.emptyView }));
    } else {
      body.appendChild(renderDoc());
    }
    body.scrollTop = top;
    if (fid) focusId(fid, end); else if (keep) focusId(keep);
  }
  function redraw(fid, end) { paintBody(fid, end); }

  function countUpd(inp, c, max) {
    if (!max) { c.hidden = true; return; }
    const n = inp.value.length;
    c.hidden = n < max * 0.8;
    c.textContent = n + '/' + max;
    c.setAttribute('aria-live', n >= max * 0.9 ? 'polite' : 'off');
  }
  function valNode(v, id) {
    const x = t(v);
    return h('span', { cls: 'isf-val' + (x ? '' : ' is-empty'), id: id }, x ? [x] : ['—', h('span', { cls: 'sr-only', text: '비어 있음' })]);
  }
  // 글자 입력 + 글자 수(한도의 80%부터). 오류 줄이 칸 바로 아래에 붙도록 .isf-fw 로 감싼다.
  function inputBound(id, o, prop, max, extra) {
    const inp = h('input', Object.assign({ type: 'text', id: id, value: o[prop], autocomplete: 'off' }, extra || {}));
    const cnt = h('span', { cls: 'isf-cnt', hidden: true });
    countUpd(inp, cnt, max);
    inp.addEventListener('input', function () { o[prop] = inp.value; countUpd(inp, cnt, max); });
    return h('span', { cls: 'isf-fw' }, [inp, cnt]);
  }
  function rowBtn(text, aria, disabled, fn) { return btn(text, { aria: aria, disabled: disabled, click: fn }); }
  function move(a, i, d) { const j = i + d; if (j < 0 || j >= a.length) return false; const x = a[i]; a[i] = a[j]; a[j] = x; return true; }

  // 목록(글머리 ㅇ 줄 목록). o: { id, arr, max, maxLen, label, bullet?, cls?, addText? }
  function onListKey(ev, o, i, inp) {
    if (ev.isComposing || ev.keyCode === 229) return;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (o.arr.length >= o.max) { const l = byId(o.id + '-lim'); if (l) l.textContent = o.max + '줄까지 쓸 수 있습니다.'; return; }
      o.arr.splice(i + 1, 0, '');
      redraw(o.id + '-' + (i + 1));
    } else if (ev.key === 'Backspace' && inp.value === '' && o.arr.length > 1) {
      ev.preventDefault();
      o.arr.splice(i, 1);
      redraw(o.id + '-' + Math.max(0, i - 1), true);
    }
  }
  function onListPaste(ev, o, i) {
    const txt = ev.clipboardData ? ev.clipboardData.getData('text') : '';
    if (!/[\r\n]/.test(txt)) return;   // 한 줄 붙여넣기는 브라우저 기본 동작
    ev.preventDefault();
    const r = isn.pasteInto(o.arr, i, txt, o.max);
    if (r.dropped) say(o.max + '줄을 넘는 ' + r.dropped + '줄은 붙이지 않았습니다.', false, true);
    redraw(o.id + '-' + r.last, true);
  }
  function listEditor(o) {
    const a = o.arr;
    const bul = o.bullet || function () { return 'ㅇ'; };
    const wrap = h('div', {});
    const cls = 'isf-list' + (o.cls ? ' ' + o.cls : '');
    if (!S.write) {
      const items = a.map(t).filter(Boolean);
      if (!items.length) { wrap.appendChild(h('div', { cls: 'isf-ind' }, [valNode('')])); return wrap; }
      wrap.appendChild(h('ul', { cls: cls }, items.map(function (x, i) {
        return h('li', {}, [h('span', { cls: 'isf-bul', 'aria-hidden': 'true', text: bul(i) }), h('span', { cls: 'isf-val', text: x })]);
      })));
      return wrap;
    }
    const ul = h('ul', { cls: cls });
    a.forEach(function (val, i) {
      const inp = h('input', { type: 'text', id: o.id + '-' + i, 'aria-label': o.label + ' ' + (i + 1) + '번째 줄', value: val, autocomplete: 'off' });
      const cnt = h('span', { cls: 'isf-cnt', hidden: true });
      countUpd(inp, cnt, o.maxLen);
      inp.addEventListener('input', function () { a[i] = inp.value; countUpd(inp, cnt, o.maxLen); const l = byId(o.id + '-lim'); if (l) l.textContent = ''; });
      inp.addEventListener('keydown', function (ev) { onListKey(ev, o, i, inp); });
      inp.addEventListener('paste', function (ev) { onListPaste(ev, o, i); });
      const pre = o.label + ' ' + (i + 1) + '번째 줄 ';
      const rb = h('span', { cls: 'isf-rowbtn' }, [
        cnt,
        rowBtn('↑', pre + '위로', i === 0, function () { if (move(a, i, -1)) redraw(o.id + '-' + (i - 1)); }),
        rowBtn('↓', pre + '아래로', i === a.length - 1, function () { if (move(a, i, 1)) redraw(o.id + '-' + (i + 1)); }),
        rowBtn('삭제', pre + '삭제', false, function () {
          if (a.length > 1) a.splice(i, 1); else a[0] = '';
          redraw(o.id + '-' + Math.max(0, Math.min(i, a.length - 1)));
        }),
      ]);
      ul.appendChild(h('li', {}, [h('span', { cls: 'isf-bul', 'aria-hidden': 'true', text: bul(i) }), h('span', { cls: 'isf-fw' }, [inp]), rb]));
    });
    wrap.appendChild(ul);
    wrap.appendChild(btn(o.addText || '줄 더하기', {
      id: o.id + '-add', cls: 'isf-add',
      click: function () {
        if (a.length >= o.max) { const l = byId(o.id + '-lim'); if (l) l.textContent = o.max + '줄까지 쓸 수 있습니다.'; return; }
        a.push('');
        redraw(o.id + '-' + (a.length - 1));
      },
    }));
    wrap.appendChild(h('p', { cls: 'isf-cap', id: o.id + '-lim', role: 'status' }));
    return wrap;
  }

  // ── 원본(FACT) 칸 ─────────────────────────────────────────────────
  function factOf(key) { return obj(obj(obj(S.view.content).fields)[key]); }
  function changeKind(key) {
    if (arr(S.view.stale_keys).indexOf(key) >= 0) return 'before';
    if (S.view.confirmed && arr(S.view.confirmed_changed_keys).indexOf(key) >= 0) return 'after';
    return '';
  }
  function srcMeta(src) {
    const parts = [chip('src', '원본')];
    const label = s(src.title) || '출처';
    const link = isn.safeUrl(src.url);
    parts.push(link ? h('a', { href: link, target: '_blank', rel: 'noopener noreferrer', text: label }) : label);
    if (src.checked_on) parts.push(' · 확인 ' + src.checked_on);
    return h('div', { cls: 'isf-fmeta' }, parts);
  }
  // → { box, metas:[…] } — box 는 값 상자(#isf-f-{key}), metas 는 아래 줄들.
  function factNodes(key) {
    const info = isn.keyInfo(S.tpl, key) || { key: key, label: key, required: false, fix_screen: null };
    const fo = factOf(key);
    const val = t(fo.val);
    const src = obj(fo.src);
    const kind = changeKind(key);
    const fixName = isn.FIX_NAMES[info.fix_screen] || '';
    const box = h('div', { cls: 'isf-fact' + (kind ? ' is-chg' : '') + (val ? '' : ' is-none'), id: 'isf-f-' + key, tabindex: '-1' });
    const metas = [];
    if (val) {
      box.appendChild(document.createTextNode(val));
      if (kind) box.appendChild(chip('chg', '바뀜'));
      if (src.title || src.checked_on) metas.push(srcMeta(src));
    } else {
      box.appendChild(document.createTextNode('원본에 값이 없습니다.'));
      metas.push(h('div', { cls: 'isf-fmeta', text: ((fixName ? fixName + '에서 먼저 넣으세요.' : '') + (info.required ? '' : ' 비어 있어도 확정할 수 있습니다.')).trim() }));
    }
    if (kind === 'before') {
      const row = h('div', { cls: 'isf-fmeta' }, ['원본이 바뀌었습니다. ']);
      if (S.write) row.appendChild(btn('다시 불러오기', { aria: info.label + ' 다시 불러오기', click: function () { doRefill([key], BTN.refill, function () { return '원본에서 ' + isn.object(info.label) + ' 다시 불러왔습니다.'; }); } }));
      metas.push(row);
    } else if (kind === 'after') {
      metas.push(h('div', { cls: 'isf-fmeta', text: '확정한 뒤 원본이 바뀌었습니다. 워드에는 확정 당시 값이 나옵니다.' }));
    }
    if (S.write && fixName) {
      metas.push(h('div', { cls: 'isf-fmeta' }, [btn(fixName + '에서 고치기', { click: function () { onFix(info.fix_screen); } })]));
    }
    return { box: box, metas: metas };
  }
  function factCell(key) {
    const info = isn.keyInfo(S.tpl, key);
    if (!info) return null;
    const f = factNodes(key);
    return h('div', { cls: 'isf-cell' }, [h('span', { cls: 'isf-lab' }, [info.label, info.required ? reqMark() : null]), f.box].concat(f.metas));
  }

  // ── 문서 본문 ─────────────────────────────────────────────────────
  function renderDoc() {
    const m = S.m, tpl = S.tpl;
    const doc = h('div', { cls: 'isf-doc' });
    const info = function (k) { return isn.keyInfo(tpl, k); };
    const head = function (text, extras, req) { return h('h4', { cls: 'isf-h' }, [text, req ? reqMark() : null].concat(extras || [])); };

    // 제목 줄: 참고자료 1. 「기관명」 [공고명] 관련 요약
    const nameF = factNodes('inst_name');
    const title = h('div', { cls: 'isf-title' }, ['참고자료 1. 「', nameF.box, '」']);
    const bi = info('bid_kind');
    if (bi) {
      const x = m.texts.bid_kind || (m.texts.bid_kind = { val: '', note: '' });
      const lab = h(S.write ? 'label' : 'span', { cls: 'isf-bid' }, [h('span', {}, [bi.label, bi.required ? reqMark() : null])]);
      if (S.write) lab.appendChild(inputBound('isf-f-bid_kind', x, 'val', bi.max_len, { 'aria-required': bi.required ? 'true' : null }));
      else lab.appendChild(valNode(x.val, 'isf-f-bid_kind'));
      title.appendChild(lab);
    }
    title.appendChild(document.createTextNode(' 관련 요약'));
    doc.appendChild(title);
    if (nameF.metas.length) doc.appendChild(h('div', { cls: 'isf-tmeta' }, nameF.metas));
    doc.appendChild(h('p', { cls: 'isf-lead' }, ['■ [', t(factOf('inst_name').val) || S.name || '기관', '] 입찰 관련 주요내용']));

    // 글 칸 + 출처
    function textCell(key, first) {
      const k = info(key);
      if (!k) return null;
      const x = m.texts[key] || (m.texts[key] = { val: '', note: '' });
      const cell = h('div', { cls: 'isf-cell' });
      if (!S.write) {
        cell.appendChild(h('span', { cls: 'isf-lab', text: k.label }));
        cell.appendChild(valNode(x.val));
        if (t(x.note)) cell.appendChild(h('div', { cls: 'isf-note' }, [h('span', { cls: 'isf-lab', text: '출처' }), valNode(x.note)]));
        return cell;
      }
      cell.appendChild(h('label', { cls: 'isf-lab', for: 'isf-f-' + key, text: k.label }));
      cell.appendChild(inputBound('isf-f-' + key, x, 'val', k.max_len));
      cell.appendChild(h('div', { cls: 'isf-note' }, [
        h('label', { cls: 'isf-lab', for: 'isf-n-' + key, text: '출처' }),
        inputBound('isf-n-' + key, x, 'note', NOTE_MAX, first ? { 'aria-describedby': 'isf-note-help' } : null),
      ]));
      return cell;
    }
    function listFor(key, extra) {
      const k = info(key);
      if (!k) return null;
      if (!m.lists[key]) m.lists[key] = [''];
      return listEditor(Object.assign({ id: 'isf-l-' + key, arr: m.lists[key], max: k.max_items || 10, maxLen: k.max_len || 300, label: k.label }, extra || {}));
    }

    // ── 추진 배경 ──
    const bg = [];
    const ov = info('overview');
    if (ov) { bg.push(head('- 기관 현황', null, ov.required)); bg.push(listFor('overview')); }
    bg.push(head('ㅇ 기관 주요 현황'));
    const grid = h('div', { cls: 'isf-grid' });
    [factCell('head_name'), textCell('budget', true), textCell('staff'), textCell('supervisor'), factCell('inst_type'), textCell('address')].forEach(function (c) { if (c) grid.appendChild(c); });
    bg.push(grid);
    if (S.write) bg.push(h('p', { cls: 'isf-cap', id: 'isf-note-help', text: T.noteHelp }));
    const on = info('org_note');
    if (on) {
      const x = m.texts.org_note || (m.texts.org_note = { val: '', note: '' });
      bg.push(h('div', { cls: 'isf-ind' }, [S.write
        ? h('label', { cls: 'isf-lab', for: 'isf-f-org_note', text: '※ ' + on.label }) : h('span', { cls: 'isf-lab', text: '※ ' + on.label }),
        S.write ? inputBound('isf-f-org_note', x, 'val', on.max_len) : valNode(x.val)]));
    }
    // 기관 주요 사업
    const bz = info('biz');
    if (bz) bizBlock(bg, bz, head);
    // 운영자금 관련 고려사항
    bg.push(head('- 운영자금 관련 고려사항'));
    const fd = info('fund');
    if (fd) fundBlock(bg, fd, head);
    const mb = info('mmda_basis');
    if (mb) { bg.push(head('ㅇ ' + mb.label)); bg.push(listFor('mmda_basis')); }
    const yr = info('years');
    if (yr) yearsBlock(bg, yr, head);
    doc.appendChild(h('section', { cls: 'isf-sec' }, [h('h3', {}, [h('span', { text: '추진 배경' })]), h('div', { cls: 'isf-main' }, bg)]));

    // ── 기타 사항 ──
    const et = [];
    const cp = info('competition');
    et.push(head('- ' + (cp ? cp.label : '경쟁은행 동향 및 중점 제안 사항')));
    const cb = info('current_bank');
    if (cb) {
      const f = factNodes('current_bank');
      et.push(h('div', { cls: 'isf-ind' }, [h('span', { cls: 'isf-lab', text: cb.label }), f.box].concat(f.metas)));
    }
    if (cp) et.push(listFor('competition'));
    const ef = info('effect');   // 안 A — 서버가 칸을 내려 줄 때만 그린다
    if (ef) {
      et.push(head('- ' + ef.label));
      et.push(h('p', { cls: 'isf-cap', text: T.effectHelp }));
      et.push(listFor('effect'));
    }
    doc.appendChild(h('section', { cls: 'isf-sec' }, [h('h3', {}, [h('span', { text: '기타 사항' })]), h('div', { cls: 'isf-main' }, et)]));
    return doc;
  }

  // ── 기관 주요 사업 표 ─────────────────────────────────────────────
  function bizBlock(out, info, head) {
    const m = S.m;
    const rows = m.biz;
    const bsrc = obj(obj(obj(S.view.content).tables).biz).src;
    const sr = obj(bsrc);
    const srcText = sr.title ? '출처: ' + sr.title + (sr.checked_on ? '(기준일 ' + sr.checked_on + ')' : '') : '직접 입력';
    const nRows = rows.filter(function (r) { return t(r.group) || t(r.sub) || arr(r.lines).some(function (x) { return t(x); }); }).length;
    out.push(head('- ' + info.label, [h('span', { cls: 'isf-src', text: srcText }),
      S.write ? btn('주요 사업 다시 채우기', { id: 'isf-reprefill-biz', click: function () { onRefillBiz(nRows); } }) : null]));
    arr(S.view.seed_notices).forEach(function (nt) {
      if (!nt || nt.key !== 'biz') return;
      if (nt.reason === 'NEWER_IMPORT') {
        out.push(h('p', { cls: 'isf-cap' }, S.view.confirmed
          ? [chip('chg', '바뀜'), ' 확정한 뒤 새 사업계획이 반입되었습니다.']
          : ['이 표를 채운 뒤 새 사업계획이 반입되었습니다. 새 계획으로 바꾸려면 [주요 사업 다시 채우기]를 누르세요.']));
      } else if (nt.reason === 'ROWS_DROPPED') {
        out.push(h('p', { cls: 'isf-cap', text: '사업계획 ' + (Number(nt.count) || 0) + '줄은 개인정보로 보이는 글자가 있어 가져오지 않았습니다. 필요하면 직접 적으세요.' }));
      }
    });
    out.push(h('p', { cls: 'isf-cap', id: 'isf-biz-msg', role: 'status' }));
    if (!rows.length) {
      out.push(h('p', { cls: 'isf-empty', text: '사업이 없습니다.' }));
    } else {
      const tb = h('tbody');
      rows.forEach(function (r, i) { tb.appendChild(bizRow(rows, r, i, tb)); });
      markSame(rows, tb);
      out.push(h('table', { cls: 'isf-tbl' }, [
        h('caption', { cls: 'sr-only', text: info.label }),
        h('thead', {}, [h('tr', {}, [
          h('th', {}, ['대분류', reqMark()]), h('th', { text: '세부 사업' }), h('th', { text: '내용(줄당 ' + BIZ_LIMIT.line + '자, ' + BIZ_LIMIT.lines + '줄까지)' }),
          h('th', {}, [h('span', { cls: 'sr-only', text: '줄 조작' })])])]),
        tb]));
      out.push(h('p', { cls: 'isf-cap', text: T.sameGroup }));
    }
    if (S.write) {
      out.push(btn('사업 줄 더하기', {
        id: 'isf-b-add', cls: 'isf-add',
        click: function () {
          if (nRows >= (info.max_items || 40)) { inlineMsg('isf-biz-msg', (info.max_items || 40) + '줄까지 쓸 수 있습니다.'); return; }
          rows.push({ group: '', sub: '', lines: [''] });
          redraw('isf-b-' + (rows.length - 1) + '-g');
        },
      }));
    }
  }
  function markSame(rows, tb) {
    Array.prototype.forEach.call(tb.rows, function (tr, i) {
      const g = t(rows[i] && rows[i].group);
      tr.classList.toggle('isf-same', i > 0 && !!g && g === t(rows[i - 1].group));
    });
  }
  function plainInput(id, o, prop, aria, onInput) {
    const inp = h('input', { type: 'text', id: id, 'aria-label': aria, value: o[prop], autocomplete: 'off' });
    inp.addEventListener('input', function () { o[prop] = inp.value; if (onInput) onInput(); });
    return inp;
  }
  function bizRow(rows, r, i, tb) {
    const n = i + 1;
    const tr = h('tr');
    if (!S.write) {
      tr.appendChild(h('td', { cls: 'isf-grp' }, [valNode(r.group)]));
      tr.appendChild(h('td', {}, [valNode(r.sub)]));
      tr.appendChild(h('td', {}, [h('div', { cls: 'isf-lines' }, arr(r.lines).filter(function (x) { return t(x); }).map(function (x) { return h('div', { text: x }); }))]));
      tr.appendChild(h('td'));
      return tr;
    }
    tr.appendChild(h('td', { cls: 'isf-grp' }, [plainInput('isf-b-' + i + '-g', r, 'group', n + '번째 사업 대분류', function () { markSame(rows, tb); })]));
    tr.appendChild(h('td', {}, [plainInput('isf-b-' + i + '-s', r, 'sub', n + '번째 사업 세부', null)]));
    const lines = h('div', { cls: 'isf-lines' });
    const lo = { id: 'isf-b-' + i + '-l', arr: r.lines, max: BIZ_LIMIT.lines };
    r.lines.forEach(function (x, j) {
      const inp = h('input', { type: 'text', id: lo.id + '-' + j, 'aria-label': n + '번째 사업 내용 ' + (j + 1) + '번째 줄', value: x, autocomplete: 'off' });
      inp.addEventListener('input', function () { r.lines[j] = inp.value; });
      inp.addEventListener('keydown', function (ev) { onListKey(ev, lo, j, inp); });
      inp.addEventListener('paste', function (ev) { onListPaste(ev, lo, j); });
      const row = h('div', {}, [inp]);
      if (r.lines.length > 1) {
        row.appendChild(rowBtn('삭제', n + '번째 사업 내용 ' + (j + 1) + '번째 줄 삭제', false, function () { r.lines.splice(j, 1); redraw(lo.id + '-' + Math.max(0, j - 1)); }));
      }
      lines.appendChild(row);
    });
    if (r.lines.length < BIZ_LIMIT.lines) {
      lines.appendChild(btn('+줄', { id: lo.id + '-add', aria: n + '번째 사업 내용 줄 더하기', click: function () { r.lines.push(''); redraw(lo.id + '-' + (r.lines.length - 1)); } }));
    }
    tr.appendChild(h('td', {}, [lines]));
    tr.appendChild(h('td', {}, [h('span', { cls: 'isf-rowbtn' }, [
      rowBtn('↑', n + '번째 사업 위로', i === 0, function () { if (move(rows, i, -1)) redraw('isf-b-' + (i - 1) + '-g'); }),
      rowBtn('↓', n + '번째 사업 아래로', i === rows.length - 1, function () { if (move(rows, i, 1)) redraw('isf-b-' + (i + 1) + '-g'); }),
      rowBtn('삭제', n + '번째 사업 삭제', false, function () { rows.splice(i, 1); redraw(rows.length ? 'isf-b-' + Math.max(0, i - 1) + '-g' : 'isf-b-add'); }),
    ])]));
    return tr;
  }

  // ── 예산 운영 방식 표 ─────────────────────────────────────────────
  function fundBlock(out, info, head) {
    const rows = S.m.fund;
    out.push(head('ㅇ ' + info.label));
    out.push(h('p', { cls: 'isf-cap', id: 'isf-u-msg', role: 'status' }));
    if (!rows.length) out.push(h('p', { cls: 'isf-empty', text: '운영 방식이 없습니다.' }));
    else {
      const tb = h('tbody');
      rows.forEach(function (r, i) { tb.appendChild(fundRow(rows, r, i)); });
      out.push(h('table', { cls: 'isf-tbl' }, [
        h('caption', { cls: 'sr-only', text: info.label }),
        h('thead', {}, [h('tr', {}, [h('th', {}, ['구분', reqMark()]), h('th', { text: '내용' }), h('th', {}, [h('span', { cls: 'sr-only', text: '줄 조작' })])])]), tb]));
    }
    if (S.write) {
      out.push(btn('운영 방식 줄 더하기', {
        id: 'isf-u-add', cls: 'isf-add',
        click: function () {
          if (rows.length >= (info.max_items || 10)) { inlineMsg('isf-u-msg', (info.max_items || 10) + '줄까지 쓸 수 있습니다.'); return; }
          rows.push({ kind: '', lines: [{ lv: 0, text: '' }] });
          redraw('isf-u-' + (rows.length - 1) + '-k');
        },
      }));
    }
  }
  function fundRow(rows, r, i) {
    const n = i + 1;
    const tr = h('tr');
    if (!S.write) {
      tr.appendChild(h('td', {}, [valNode(r.kind)]));
      tr.appendChild(h('td', {}, [h('div', { cls: 'isf-lines' }, arr(r.lines).filter(function (x) { return t(x.text); }).map(function (x) {
        return h('div', { cls: x.lv === 1 ? 'lv1' : null, text: (x.lv === 1 ? 'ㅇ ' : '- ') + x.text });
      }))]));
      tr.appendChild(h('td'));
      return tr;
    }
    tr.appendChild(h('td', {}, [plainInput('isf-u-' + i + '-k', r, 'kind', n + '번째 운영 방식 구분', null)]));
    const lines = h('div', { cls: 'isf-lines' });
    r.lines.forEach(function (x, j) {
      const inp = h('input', { type: 'text', id: 'isf-u-' + i + '-l-' + j, 'aria-label': n + '번째 운영 방식 내용 ' + (j + 1) + '번째 줄', value: x.text, autocomplete: 'off' });
      inp.addEventListener('input', function () { x.text = inp.value; });
      inp.addEventListener('keydown', function (ev) {
        if (ev.isComposing || ev.keyCode === 229) return;
        if (ev.key === 'Enter' && r.lines.length < FUND_LIMIT.lines) { ev.preventDefault(); r.lines.splice(j + 1, 0, { lv: x.lv, text: '' }); redraw('isf-u-' + i + '-l-' + (j + 1)); }
        else if (ev.key === 'Backspace' && inp.value === '' && r.lines.length > 1) { ev.preventDefault(); r.lines.splice(j, 1); redraw('isf-u-' + i + '-l-' + Math.max(0, j - 1), true); }
      });
      const lv = h('button', { type: 'button', cls: 'isf-lv', 'aria-pressed': x.lv === 1 ? 'true' : 'false', 'aria-label': (j + 1) + '번째 줄 들여쓰기', text: x.lv === 1 ? 'ㅇ' : '-' });
      const row = h('div', { cls: x.lv === 1 ? 'lv1' : null }, [lv, inp]);
      lv.addEventListener('click', function () {
        x.lv = x.lv === 1 ? 0 : 1;
        lv.textContent = x.lv === 1 ? 'ㅇ' : '-';
        lv.setAttribute('aria-pressed', x.lv === 1 ? 'true' : 'false');
        row.classList.toggle('lv1', x.lv === 1);
      });
      if (r.lines.length > 1) row.appendChild(rowBtn('삭제', n + '번째 운영 방식 내용 ' + (j + 1) + '번째 줄 삭제', false, function () { r.lines.splice(j, 1); redraw('isf-u-' + i + '-l-' + Math.max(0, j - 1)); }));
      lines.appendChild(row);
    });
    if (r.lines.length < FUND_LIMIT.lines) {
      lines.appendChild(btn('+줄', { aria: n + '번째 운영 방식 줄 더하기', click: function () { r.lines.push({ lv: 0, text: '' }); redraw('isf-u-' + i + '-l-' + (r.lines.length - 1)); } }));
    }
    tr.appendChild(h('td', {}, [lines]));
    tr.appendChild(h('td', {}, [h('span', { cls: 'isf-rowbtn' }, [
      rowBtn('↑', n + '번째 운영 방식 위로', i === 0, function () { if (move(rows, i, -1)) redraw('isf-u-' + (i - 1) + '-k'); }),
      rowBtn('↓', n + '번째 운영 방식 아래로', i === rows.length - 1, function () { if (move(rows, i, 1)) redraw('isf-u-' + (i + 1) + '-k'); }),
      rowBtn('삭제', n + '번째 운영 방식 삭제', false, function () { rows.splice(i, 1); redraw(rows.length ? 'isf-u-' + Math.max(0, i - 1) + '-k' : 'isf-u-add'); }),
    ])]));
    return tr;
  }

  // ── 연도별 예상 평잔·자금수익 ─────────────────────────────────────
  function yearsBlock(out, info, head) {
    const m = S.m;
    const y = m.years;
    out.push(head('ㅇ ' + info.label, [chip('est', '내부 추정')]));
    out.push(h('p', { cls: 'isf-cap', id: 'isf-y-msg', role: 'status' }));
    if (!y) {
      if (!S.write) { out.push(h('p', { cls: 'isf-empty' }, [valNode('')])); return; }
      out.push(h('p', { cls: 'isf-empty' }, [
        '연도 표가 아직 없습니다.',
        btn('약정 만기로 시작 연도 채우기', { id: 'isf-y-fill', click: function () { doRefill(['years'], BTN.prefill, function () { return info.label + '를 약정 만기 기준으로 채웠습니다.'; }); } }),
        btn('직접 만들기', { id: 'isf-y-make', click: function () { const yy = String(new Date().getFullYear() + 1); m.years = { unit: '억원', from: yy, to: yy, end: '', mmda: {}, income: {}, notes: [''] }; redraw('isf-y-unit'); } }),
      ]));
      return;
    }
    const c = isn.yearCols(y);
    const endN = toYear(y.end);
    if (S.write) {
      const lab = function (text, node) { return h('label', {}, [text, node]); };
      const unit = h('input', { type: 'text', id: 'isf-y-unit', value: y.unit, autocomplete: 'off' });
      unit.addEventListener('input', function () { y.unit = unit.value; });
      const yearIn = function (id, prop) {
        const inp = h('input', { type: 'number', id: id, min: YEAR_MIN, max: YEAR_MAX, value: y[prop] });
        inp.addEventListener('input', function () { y[prop] = inp.value; });
        inp.addEventListener('change', function () { y[prop] = inp.value; if (toYear(y.end) == null || !isn.yearCols(y).ok || toYear(y.end) < toYear(y.from) || toYear(y.end) > toYear(y.to)) y.end = ''; redraw(id); });
        return inp;
      };
      const sel = h('select', { id: 'isf-y-end' }, [h('option', { value: '', text: '표시 안 함' })].concat(c.ok ? c.years.map(function (yr) { return h('option', { value: String(yr), text: String(yr) }); }) : []));
      sel.value = c.ok && endN != null ? String(endN) : '';
      sel.addEventListener('change', function () { y.end = sel.value; redraw('isf-y-end'); });
      out.push(h('div', { cls: 'isf-ycond' }, [
        lab('단위', unit), lab('시작 연도', yearIn('isf-y-from', 'from')), lab('끝 연도', yearIn('isf-y-to', 'to')), lab('협약 종료 연도', sel)]));
    }
    if (!c.ok) { if (S.write) out.push(h('p', { cls: 'isf-cap', text: c.msg })); return; }
    const thead = h('tr', {}, [h('th', { text: '구분(' + (t(y.unit) || '단위') + ')' })].concat(c.years.map(function (yr) {
      return h('th', { cls: endN != null && yr > endN ? 'isf-after' : null }, [String(yr), endN === yr ? h('small', { text: '협약 종료' }) : null]);
    })));
    const rowDefs = [['mmda', 'MMDA 연평잔'], ['income', '자금수익']];
    const tb = h('tbody', {}, rowDefs.map(function (d) {
      return h('tr', {}, [h('td', { text: d[1] })].concat(c.years.map(function (yr) {
        const after = endN != null && yr > endN ? 'isf-after' : null;
        const key = String(yr);
        if (!S.write) return h('td', { cls: after }, [valNode(y[d[0]][key])]);
        const inp = h('input', { type: 'text', id: 'isf-y-' + d[0] + '-' + yr, 'aria-label': yr + '년 ' + d[1], value: y[d[0]][key] || '', inputmode: 'decimal', autocomplete: 'off' });
        inp.addEventListener('input', function () { y[d[0]][key] = inp.value; });
        inp.addEventListener('change', function () { const cl = isn.cleanAmount(inp.value); inp.value = cl; y[d[0]][key] = cl; });
        return h('td', { cls: after }, [inp]);
      })));
    }));
    out.push(h('div', { cls: 'isf-ywrap' }, [h('table', { cls: 'isf-years' }, [h('caption', { cls: 'sr-only', text: info.label }), h('thead', {}, [thead]), tb])]));
    if (endN != null) out.push(h('p', { cls: 'isf-cap', text: T.afterEnd }));
    if (S.write) {
      const clipTxt = isn.outText(isn.clipYears(y).removed);
      if (clipTxt) out.push(h('p', { cls: 'isf-cap', id: 'isf-y-clip', role: 'status', text: clipTxt }));
    }
    out.push(h('div', { cls: 'isf-ind' }, [h('span', { cls: 'isf-lab', text: '주석' }),
      listEditor({ id: 'isf-yn', arr: y.notes, max: NOTES_LIMIT.n, maxLen: NOTES_LIMIT.len, label: '주석', bullet: function (i) { return '주' + (i + 1) + ')'; }, cls: 'isf-notes', addText: '주석 더하기' })]));
  }

  // ── 동작 ──────────────────────────────────────────────────────────
  function showProblems(list, verb) {
    const D = dlgApi();
    const els = list.map(function (p) { return { p: p, el: byId(p.id) }; }).filter(function (x) { return x.el; })
      .sort(function (a, b) { return a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1; });
    say(T.fixCells(verb, list.length), true);
    els.forEach(function (x, i) { D.invalid(x.el, x.p.msg, { focus: i === 0 }); });
    if (!els.length && list.length) say(list[0].msg, true);
  }
  function showMissing(keys) {
    const tpl = S.tpl;
    const list = keys.map(function (k) {
      const ki = isn.keyInfo(tpl, k) || { kind: '', label: k };
      if (ki.kind === 'FACT') return { id: 'isf-f-' + k, msg: isn.factMissingMsg(tpl, k) };
      if (ki.kind === 'LIST') return { id: 'isf-l-' + k + '-0', msg: isn.object(ki.label) + ' 적으세요.' };
      return { id: 'isf-f-' + k, msg: isn.object(ki.label) + ' 적으세요.' };
    });
    showProblems(list, '확정');
  }

  function applyView(v) {
    S.view = v;
    S.tpl = v.tpl;
    S.m = isn.modelFromView(v);
    S.baseKey = isn.bodyKey(S.m, S.tpl);
    S.write = isn.modeOf(v) === 'write' && !!v.content && !S.broken;
    S.loading = false;
    S.loadErr = '';
    S.headSig = '';
    closeCf();
    paintAll();
  }
  function load(btnId) {
    const my = S;
    my.loading = true; my.loadErr = ''; my.loadText = T.loading; my.headSig = '';
    showErr(''); say(''); closeCf(); paintAll();
    return isn.call('GET', isn.url(my.bid, ''), undefined, btnId).then(function (v) {
      if (S !== my) return null;
      if (Number(v.cur_ver) === 0 && obj(v.viewer).can_edit === true) return autoPrefill(my, v);   // 첫 작성: 원본에서 채운다(cur_ver 0일 때만)
      applyView(v);
      return null;
    }).catch(function (e) {
      if (S !== my) return;
      my.loading = false;
      my.loadErr = isn.errInfo(e && e.status, e && e.detail, { tpl: my.tpl, kind: 'load' }).text;
      paintAll();
    });
  }
  function autoPrefill(my, v) {
    my.view = v; my.tpl = v.tpl; my.loadText = T.prefilling;
    paintAll();
    return isn.call('POST', isn.url(my.bid, '/prefill'), { base_ver: 0 }, BTN.open).then(function (res) {
      if (S !== my) return;
      applyView(res);
      say(isn.filledText(res));
    });
  }
  function reread() {
    const my = S;
    return isn.call('GET', isn.url(my.bid, ''), undefined, BTN.refresh).then(function (v) { if (S === my) applyView(v); }).catch(function () { /* 오류 문구는 이미 떠 있다 */ });
  }
  // 고친 내용(모델)은 그대로 두고 상태 값만 새로 받는다.
  function softRefresh() {
    const my = S;
    return isn.call('GET', isn.url(my.bid, ''), undefined, BTN.refresh).then(function (v) {
      if (S !== my) return;
      ['state_cd', 'stale_keys', 'sources_missing', 'seed_notices', 'confirmed_changed_keys', 'confirmed', 'viewer'].forEach(function (k) { my.view[k] = v[k]; });
      my.write = isn.modeOf(my.view) === 'write';
      my.headSig = '';
      paintAll();
    }).catch(function () { /* 조용히 */ });
  }
  function fail(e, kind) {
    const my = S;
    const info = isn.errInfo(e && e.status, e && e.detail, { tpl: my.tpl, kind: kind });
    switch (info.action) {
      case 'verchanged': showVerChanged(); return;
      case 'incomplete': showMissing(info.keys); return;
      case 'stale': showErr(info.text); softRefresh().then(function () { focusId('isf-refillall'); }); return;
      case 'locked': showErr(info.text, [{ label: '최신 상태로 보기', fn: function () { load(BTN.refresh); } }]); return;
      case 'reread': showErr(info.text); reread(); return;
      case 'integrity': my.broken = true; my.write = false; my.headSig = ''; showErr(info.text); paintAll(); return;
      case 'plan': inlineMsg('isf-biz-msg', info.text); return;
      case 'contract': inlineMsg('isf-y-msg', info.text); return;
      case 'table': case 'field': say(info.text, true); showErr(info.text); return;
      default: showErr(info.text);
    }
  }
  function showVerChanged() {
    const my = S;
    closeCf();
    const draw = function (latest) {
      if (S !== my) return;
      const host = byId('isf-cf');
      if (!host) return;
      const ok = latest && obj(latest.viewer).can_edit === true;
      const text = isn.verChangedText(latest && latest.saved_by_name, latest && latest.saved_at, my.view && my.view.cur_ver, latest && latest.cur_ver);
      const row = h('div', { cls: 'dlg-cf-row' }, [
        btn('최신 판 불러오기', { id: 'isf-cf-latest', click: function () { closeCf(); load(BTN.refresh); } }),
        ok ? btn('내 내용으로 다시 저장', { id: 'isf-cf-mine', cls: 'dlg-go', click: function () { closeCf(); doSave(BTN.save, { base: latest.cur_ver }); } }) : null,
      ]);
      const cf = h('div', { cls: 'dlg-cf', role: 'group', 'aria-labelledby': 'isf-cf-t' }, [
        h('p', { id: 'isf-cf-t', text: text }), h('p', { cls: 'isf-cap', text: '다른 사람이 저장한 판은 판 이력에 남습니다.' }), row]);
      host.textContent = '';
      host.appendChild(cf);
      focusId('isf-cf-latest');
    };
    isn.call('GET', isn.url(my.bid, ''), undefined, BTN.refresh).then(draw).catch(function () { draw(null); });
  }

  // 저장. o.base 는 [내 내용으로 다시 저장]이 새 판 번호로 보낼 때, o.quiet 는 다른 동작 앞 저장일 때.
  function doSave(btnId, o) {
    const my = S;
    const opt = o || {};
    if (!my || !my.write || my.busy) return Promise.resolve(false);
    const probs = isn.precheck(my.m, my.tpl, {});
    if (probs.length) { showProblems(probs, '저장'); return Promise.resolve(false); }
    const body = isn.buildBody(my.m, my.tpl, opt.base != null ? opt.base : my.view.cur_ver);
    showErr(''); closeCf();
    setBusy(true, BUSY_BTN[btnId], T.saving);
    return isn.call('PUT', isn.url(my.bid, '/draft'), body, btnId).then(function (res) {
      if (S !== my) return false;
      setBusy(false);
      applyView(res);
      if (!opt.quiet) say(res.changed ? T.saved(res.cur_ver) : T.noChange);
      return true;
    }).catch(function (e) {
      if (S !== my) return false;
      setBusy(false);
      fail(e, 'save');
      return false;
    });
  }
  function ensureSaved(btnId) { return isDirtyNow() ? doSave(btnId, { quiet: true }) : Promise.resolve(true); }

  function doRefill(keys, btnId, doneText) {
    const my = S;
    if (!my || !my.write || my.busy || !keys.length) return;
    ensureSaved(btnId).then(function (ok) {
      if (!ok || S !== my) return null;
      setBusy(true, '', '');
      return isn.call('POST', isn.url(my.bid, '/prefill'), { base_ver: my.view.cur_ver, keys: keys }, btnId).then(function (res) {
        if (S !== my) return;
        setBusy(false);
        applyView(res);
        say(doneText(res));
      }).catch(function (e) {
        if (S !== my) return;
        setBusy(false);
        fail(e, 'prefill');
      });
    });
  }
  function onRefillBiz(n) {
    const my = S;
    if (!my || my.busy) return;
    dlgApi().confirm({
      title: '주요 사업 다시 채우기',
      text: '주요 사업 표를 지금 반입된 사업계획으로 바꿉니다.\n지금 표의 ' + n + '줄(직접 고친 내용 포함)은 새 판에서 사라집니다. 이전 판은 판 이력에 남습니다.',
      go: '다시 채우기', danger: true,
    }).then(function (ok) {
      if (ok && S === my) doRefill(['biz'], BTN.prefill, function () { return '주요 사업 표를 반입된 사업계획으로 다시 채웠습니다.'; });
    });
  }
  function onFix(screen) {
    const my = S;
    if (!my || my.busy) return;
    ensureSaved(BTN.save).then(function (ok) {
      if (!ok || S !== my) return;
      const f = my.o.openFix;
      if (typeof f === 'function') {
        dlgApi().close(my.ov, { restore: false });
        try { f(screen, { bidCaseId: my.bid, instName: my.name }); } catch (e) { /* 원 화면 오류는 이 창과 무관 */ }
        return;
      }
      say(T.fixHint(my.name, screen), false, true);
    });
  }
  function onConfirm() {
    const my = S;
    if (!my || !my.write || my.busy) return;
    const probs = isn.precheck(my.m, my.tpl, { confirm: true, view: my.view });
    if (probs.length) { showProblems(probs, '확정'); return; }
    const stale = arr(my.view.stale_keys);
    if (stale.length) {
      say('원본이 바뀐 칸이 있어 확정하지 못했습니다: ' + stale.map(function (k) { return isn.labelOf(my.tpl, k); }).join(', ') + '. [모두 다시 불러오기]를 누른 뒤 확정하세요.', true);
      focusId('isf-refillall');
      return;
    }
    dlgApi().confirm({ title: '기관 정보 요약 확정', text: isn.confirmText(my.view.cur_ver, isDirtyNow(my)), go: '확정' }).then(function (yes) {
      if (!yes || S !== my) return null;
      return ensureSaved(BTN.confirm).then(function (saved) {
        if (!saved || S !== my) return null;
        showErr('');
        setBusy(true, 'isf-confirm', T.confirming);
        return isn.call('POST', isn.url(my.bid, '/confirm'), { base_ver: my.view.cur_ver }, BTN.confirm).then(function (res) {
          if (S !== my) return;
          setBusy(false);
          my.changed = true;
          applyView(res);
          say(T.confirmed(res.confirmed ? res.confirmed.ver : res.cur_ver));
          focusId('isf-docx');
        }).catch(function (e) { if (S !== my) return; setBusy(false); fail(e, 'confirm'); });
      });
    });
  }
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function onDocx() {
    const my = S;
    if (!my || my.busy || !my.docxKind) return;
    const draft = my.docxKind === 'draft';
    const btnId = draft ? BTN.draftDocx : BTN.docx;
    (draft ? ensureSaved(btnId) : Promise.resolve(true)).then(function (ok) {
      if (!ok || S !== my) return null;
      showErr('');
      setBusy(true, 'isf-docx', T.making);
      return isn.call('GET', isn.url(my.bid, draft ? '/draft-docx' : '/confirmed-docx'), undefined, btnId, { blob: true }).then(function (r) {
        if (S !== my) return;
        setBusy(false);
        saveBlob(r.blob, r.name);
        say(T.downloaded(draft ? my.view.cur_ver : obj(my.view.confirmed).ver, draft));
      }).catch(function (e) { if (S !== my) return; setBusy(false); fail(e, 'docx'); });
    });
  }

  // ── 작은 창: 확정 취소 · 판 이력 ──────────────────────────────────
  function miniDlg(id, titleId, title, acts) {
    const ov = h('div', { cls: 'modal-overlay', id: id });
    const note = h('div', { cls: 'dlg-note' });
    const body = h('div', { cls: 'dlg-body' });
    const box = h('div', { cls: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, [
      h('header', { cls: 'dlg-bar' }, [h('h2', { cls: 'dlg-t', id: titleId, tabindex: '-1', text: title }), acts ? h('div', { cls: 'dlg-acts' }, acts) : null]), note, body]);
    ov.appendChild(box);
    return { ov: ov, box: box, note: note, body: body };
  }
  function openUnconfirm() {
    const my = S;
    if (!my || my.busy) return;
    const D = dlgApi();
    const inp = h('input', { type: 'text', id: 'isf-un-r', maxlength: String(REASON_MAX), 'aria-required': 'true', autocomplete: 'off' });
    const cnt = h('span', { cls: 'isf-cnt', hidden: true });
    inp.addEventListener('input', function () { countUpd(inp, cnt, REASON_MAX); });
    const cancel = btn('취소', { id: 'isf-un-cancel' });
    const go = btn('확정 취소', { id: 'isf-un-go', cls: 'dlg-go' });
    const mini = miniDlg('isf-un', 'isf-un-t', '확정 취소 — 기관 정보 요약', [cancel, go]);
    const err = h('p', { cls: 'dlg-err', id: 'isf-un-err', role: 'alert' });
    mini.note.appendChild(err);
    mini.body.appendChild(h('div', { cls: 'dlg-f' }, [
      h('label', { for: 'isf-un-r' }, ['취소 사유', h('span', { cls: 'dlg-req', 'aria-hidden': 'true', text: '*' })]), h('span', { cls: 'isf-fw' }, [inp, cnt]),
      h('p', { cls: 'isf-un-help', text: T.reasonHelp })]));
    const st = { busy: false, done: false };
    document.body.appendChild(mini.ov);
    cancel.addEventListener('click', function () { D.requestClose(mini.ov); });
    go.addEventListener('click', function () {
      if (st.busy) return;
      const reason = t(inp.value);
      if (!reason) { D.invalid(inp, T.reasonEmpty, { focus: true }); return; }
      err.textContent = '';
      st.busy = true;
      D.setDisabled(go, true); D.setDisabled(cancel, true);
      go.textContent = '취소하는 중…';
      isn.call('POST', isn.url(my.bid, '/unconfirm'), { reason: reason }, BTN.unconfirm).then(function (res) {
        st.done = true;
        D.close(mini.ov, { restore: false });
        if (S !== my) return;
        my.changed = true;
        applyView(res);
        say(T.unconfirmed(res.unconfirmed_ver));
        focusId('isf-f-bid_kind');
      }).catch(function (e) {
        st.busy = false;
        D.setDisabled(go, false); D.setDisabled(cancel, false);
        go.textContent = '확정 취소';
        const info = isn.errInfo(e && e.status, e && e.detail, { tpl: my.tpl, kind: 'unconfirm' });
        err.textContent = info.text;
        if (info.action === 'reread' && S === my) { st.done = true; D.close(mini.ov, { restore: false }); showErr(info.text); reread(); }
      });
    });
    D.open(mini.ov, { isDirty: function () { return !st.done && t(inp.value) !== ''; }, dirtyText: '닫으면 입력한 사유가 사라집니다.', focus: inp, onClose: function () { mini.ov.remove(); } });
  }
  function openHistory() {
    const my = S;
    if (!my || my.busy || !my.view) return;
    isn.call('GET', isn.url(my.bid, '/versions'), undefined, BTN.history).then(function (list) {
      if (S !== my) return;
      const D = dlgApi();
      const mini = miniDlg('isf-hist', 'isf-hist-t', '판 이력 — 기관 정보 요약', null);
      mini.body.appendChild(h('p', { cls: 'isf-cap', text: T.histHelp }));
      const rows = isn.histRows(list);
      mini.body.appendChild(h('table', { cls: 'isf-hist' }, [
        h('caption', { cls: 'sr-only', text: '판 이력' }),
        h('thead', {}, [h('tr', {}, ['판', '한 일', '저장한 사람', '시각', '비고'].map(function (x) { return h('th', { text: x }); }))]),
        h('tbody', {}, rows.map(function (r) { return h('tr', {}, r.map(function (x, i) { return h('td', { cls: i === 0 || i === 3 ? 'isf-num' : null, text: x }); })); }))]));
      const close = btn('닫기', { id: 'isf-hist-close' });
      mini.box.appendChild(h('footer', { cls: 'dlg-foot' }, [close]));
      document.body.appendChild(mini.ov);
      close.addEventListener('click', function () { D.requestClose(mini.ov); });
      D.open(mini.ov, { onClose: function () { mini.ov.remove(); } });
    }).catch(function (e) { if (S === my) fail(e, 'history'); });
  }

  // ── 열기 ──────────────────────────────────────────────────────────
  function buildShell(my) {
    const ov = h('div', { cls: 'modal-overlay', id: 'isf-ov' });
    const note = h('div', { cls: 'dlg-note' }, [
      h('div', { cls: 'isf-state', id: 'isf-state', hidden: true }),
      h('div', { id: 'isf-warns' }),
      h('div', { id: 'isf-cf' }),
      h('p', { cls: 'st-line st-pad', id: 'isf-st', role: 'status' }),
      h('p', { cls: 'dlg-err', id: 'isf-err', role: 'alert' })]);
    const box = h('div', { cls: 'dlg dlg--full', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'isf-t' }, [
      h('header', { cls: 'dlg-bar' }, [h('h2', { cls: 'dlg-t', id: 'isf-t', tabindex: '-1', text: T.title(my.name) }), h('div', { cls: 'dlg-acts', id: 'isf-acts' })]),
      note,
      h('div', { cls: 'dlg-body', id: 'isf-body', 'aria-busy': 'true' }),
      h('footer', { cls: 'dlg-foot', id: 'isf-foot', hidden: true })]);
    ov.appendChild(box);
    ov.addEventListener('keydown', function (ev) {   // Ctrl+S = 저장(작성 모드). Tab 은 가로채지 않는다.
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 's' || ev.key === 'S') && my.write) { ev.preventDefault(); doSave(BTN.save, {}); }
    });
    return ov;
  }
  // o: { bidCaseId, instName, opener, onClosed(changed), openFix?(screen, {bidCaseId, instName}), restoreFallback?() }
  isn.open = function (o) {
    if (typeof document === 'undefined' || !o || !o.bidCaseId) return;
    const D = dlgApi();
    if (S && S.ov && D.isOpen(S.ov)) return;
    const my = S = { o: o, bid: String(o.bidCaseId), name: s(o.instName), ov: null, view: null, tpl: null, m: null, baseKey: '', write: false,
      busy: false, loading: true, loadErr: '', loadText: T.loading, changed: false, broken: false, timer: null, headSig: '', hm: null, docxKind: null };
    my.ov = buildShell(my);
    document.body.appendChild(my.ov);   // 덮개는 body 직계여야 dlg가 나머지 화면을 inert로 막는다
    if (o.opener && o.opener.focus && document.body.contains(o.opener)) o.opener.focus();   // 닫으면 이 단추로 돌아온다
    D.open(my.ov, {
      isDirty: function () { return isDirtyNow(my); },
      dirtyText: T.dirty,
      restoreFallback: function () { return typeof o.restoreFallback === 'function' ? o.restoreFallback() : null; },
      onClose: function () {
        clearTimeout(my.timer);
        const changed = my.changed;
        my.ov.remove();
        if (S === my) S = null;
        if (typeof o.onClosed === 'function') { try { o.onClosed(changed); } catch (e) { /* 닫기는 막지 않는다 */ } }
      },
    });
    paintAll();
    load(BTN.open);
  };

  if (isNode) module.exports = isn; else root.instSummary = isn;
})(typeof self !== 'undefined' ? self : this);
