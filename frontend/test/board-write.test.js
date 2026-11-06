const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const bw = require('../js/board-write.js');
const board = require('../js/board.js');   // setLabeler 연결(칸 이름)을 위해 로드
const MINUS = '−';

function form() {
  return { form_id: 'default_doc', name: '기본 양식', tables: [
    { id: 'A', ref: 'A', mapping: 'A', title: '재산상 이익제공', columns: 2, notes: ['단위: 백만원'],
      rows: [[{ key: 'r0c0', text: '구분', header: true }, { key: 'r0c1', text: '금액', header: true }],
             [{ key: 'r1c0', text: '출연금' }, { key: 'r1c1', text: '0', mapped: true }],
             [{ key: 'r2c0', text: '합계' }, { key: 'r2c1', text: '0', mapped: true }]] },
    { id: 'B', ref: 'B', mapping: 'B', title: '정적 표', rows: [[{ key: 'r0c0', text: '제목칸' }]], notes: [] }] };
}
function cell(key, value, extra) {
  return Object.assign({ key: key, value: value, status: 'filled', reason: null, warnings: [],
    source: { sheet: '기부금', cell: key === 'r1c1' ? 'C2' : 'C5', display: value, raw: null, rounded: null } }, extra || {});
}
function resp(over) {
  return Object.assign({ form: { id: 'default_doc' }, mapping_ver: 1, summary: {}, unmapped_tables: ['B'], warnings: [],
    tables: [{ ref: 'A', needs_review: false, label_mismatches: [], sums: [{ total: 'r2c1', of: ['r1c1'] }], cells: [
      cell('r1c1', '1,234', { source: { sheet: '기부금', cell: 'C2', display: '1,234', raw: '1233.6', rounded: true } }),
      cell('r2c1', '1,235', { source: { sheet: '기부금', cell: 'C5', display: '1,235', raw: '1235', rounded: false },
        warnings: [{ code: 'SUM_MISMATCH', basis: 'display', expected: '1234', actual: '1235', diff: '1' }] })] }],
    sources: [{ ref: 'A', sheet: '기부금', range: 'A1:D5', first_row: 1, cols: ['A', 'B', 'C', 'D'],
      rows: [['기관명', '구분', '제공금액', ''], ['본부', '출연금', '1,234', ''], ['', '', '', ''], ['', '', '', ''], ['', '합계', '1,235', '']], merges: [] }] }, over || {});
}
function ws0(r) { return bw.buildState(form(), r || resp(), { fileName: '수익성.xlsx', formId: 'default_doc' }); }

// 실제 C-5 모양: 행 구분 칸은 header 표시가 없는 일반 글자 칸(lab), 값 칸은 mapped. 머리 행만 header.
function c5Form() {
  const L = function (k, t, o) { return Object.assign({ key: k, text: t }, o || {}); };
  const V = function (k) { return { key: k, text: '0', mapped: true }; };
  return { form_id: 'default_doc', name: '기본 양식', tables: [
    { id: 'C-5', ref: 'C-5', mapping: 'C-5', title: 'Ⅴ. 세부 수익성 분석표', columns: 4, notes: [],
      rows: [[L('r0_c0', '구분', { header: true, colspan: 2 }), L('r0_c2', '사업초기', { header: true }), L('r0_c3', '1년차', { header: true })],
             [L('r1_c0', '비용', { rowspan: 2 }), L('r1_c1', '자동화기기 운영(j)'), V('r1_c2'), V('r1_c3')],
             [L('r2_c1', '임차료(i)'), V('r2_c2'), V('r2_c3')],
             [L('r3_c0', '총 비용', { colspan: 2 }), V('r3_c2'), V('r3_c3')]] }] };
}
function c5Resp() {
  const c = function (k) { return { key: k, value: '1', status: 'filled', reason: null, warnings: [], source: { sheet: 'S', cell: 'C2', display: '1', raw: null, rounded: null } }; };
  return { form: { id: 'default_doc' }, warnings: [], tables: [{ ref: 'C-5', needs_review: false, label_mismatches: [], sums: [],
    cells: ['r1_c2', 'r1_c3', 'r2_c2', 'r3_c2'].map(c) }], sources: [] };
}
test('작성 모드 칸 이름: 구분에 header 표시가 없는 C-5 모양은 바깥 › 안쪽 경로와 열 머리를 잇는다', function () {
  const ws = bw.buildState(c5Form(), c5Resp(), { fileName: 'a.xlsx', formId: 'default_doc' });
  const t = ws.tables[0];
  assert.strictEqual(t.cells.r1_c2.label, 'Ⅴ. 세부 수익성 분석표 · 비용 › 자동화기기 운영(j) · 사업초기');
  assert.strictEqual(t.cells.r1_c3.label, 'Ⅴ. 세부 수익성 분석표 · 비용 › 자동화기기 운영(j) · 1년차');
  assert.strictEqual(t.cells.r2_c2.label, 'Ⅴ. 세부 수익성 분석표 · 비용 › 임차료(i) · 사업초기');   // 위에서 내려온 병합 포함
  assert.strictEqual(t.cells.r3_c2.label, 'Ⅴ. 세부 수익성 분석표 · 총 비용 · 사업초기');             // 병합 한 칸은 한 번만
  const first = bw.infoLines(t, t.cells.r1_c2)[0];
  assert.strictEqual(first.k, 'path');
  assert.ok(first.text.indexOf('비용 › 자동화기기 운영(j)') >= 0);
  assert.ok(bw.tipHtml(t, t.cells.r1_c2).indexOf('비용 › 자동화기기 운영(j)') >= 0);
  assert.ok(bw.cellAria(t, t.cells.r1_c2).indexOf('비용 › 자동화기기 운영(j)') >= 0);
  assert.ok(bw.statusHtml(ws, { sel: { t: 'C-5', key: 'r1_c2' } }).indexOf('비용 › 자동화기기 운영(j)') >= 0);
});
test('작성 모드 칸 이름: 구분 1열 표(기본 A)는 예전 이름 그대로', function () {
  assert.strictEqual(ws0().tables[0].cells.r1c1.label, '재산상 이익제공 · 출연금 · 금액');
});

test('shownNum: 서버 BoardExcelFill.shownNum과 같은 벡터', function () {
  const f = function (s) { const v = bw.shownNum(s); return v == null ? null : bw.fmtScaled(v); };
  assert.strictEqual(f('1,234'), '1,234'); assert.strictEqual(f('(1,234)'), '-1,234');
  assert.strictEqual(f('△5'), '-5'); assert.strictEqual(f('▲5'), '-5');
  assert.strictEqual(f(' 1.5 '), '1.5'); assert.strictEqual(f('1 234'), '1,234'); assert.strictEqual(f('-0'), '0');
  ['12%', '1,234원', '', null, undefined, 'abc', '1.2.3'].forEach(function (s) { assert.strictEqual(f(s), null, String(s)); });
  // 이중 부호 모호: 괄호·△·▲ 안쪽이 -/+ 로 시작하면 null
  ['(-5)', '(+5)', '△-5', '▲+5', '△+5', '▲-5'].forEach(function (s) { assert.strictEqual(f(s), null, s); });
  // 공백은 ASCII 만 제거(서버 Java \s) — NBSP·전각 공백이 있으면 null
  assert.strictEqual(f('1\t2\r\n3\f4\v5'), '12,345');
  ['1 234', ' 5', '5 ', '1　234', '　5', '  5'].forEach(function (s) { assert.strictEqual(f(s), null, JSON.stringify(s)); });
  // 그 밖: 단독 음수 표시, 빈 괄호·기호, 자릿수 한계
  assert.strictEqual(f('(5)'), '-5'); assert.strictEqual(f('(1.5)'), '-1.5'); assert.strictEqual(f('+5'), '5'); assert.strictEqual(f('-5'), '-5');
  ['()', '△', '▲', '(', ')', '(5', '5)'].forEach(function (s) { assert.strictEqual(f(s), null, s); });
  assert.strictEqual(f('1'.repeat(30)) != null, true); assert.strictEqual(f('1'.repeat(31)), null);
  assert.strictEqual(f('1.' + '1'.repeat(15)), '1.' + '1'.repeat(15)); assert.strictEqual(f('1.' + '1'.repeat(16)), null);
});
test('checkSum: 표시값 기준 차이, 하나라도 못 읽으면 검산 생략', function () {
  assert.deepStrictEqual(bw.checkSum('3,580', ['1,234', '2,345', '0']), { expected: '3,579', actual: '3,580', diff: '+1', zero: false });
  assert.strictEqual(bw.checkSum('300', ['100', '200']).zero, true);
  assert.strictEqual(bw.checkSum('900', ['600', '600']).diff, MINUS + '300');
  assert.strictEqual(bw.checkSum('3,580', ['1,234', '', '0']), null);
  assert.strictEqual(bw.checkSum('12%', ['1']), null);
  assert.strictEqual(bw.checkSum('5', []), null);
});
test('checkFile: xlsm=매크로, 비xlsx, 빈 파일, 한도 초과', function () {
  assert.strictEqual(bw.checkFile({ name: 'a.XLSX', size: 10 }, 5), null);
  assert.strictEqual(bw.checkFile({ name: 'a.xlsm', size: 10 }, 5).code, 'MACRO');
  assert.strictEqual(bw.checkFile({ name: 'a.xls', size: 10 }, 5).code, 'NOT_XLSX');
  assert.strictEqual(bw.checkFile({ name: 'a.xlsx', size: 0 }, 5).code, 'EMPTY_FILE');
  assert.strictEqual(bw.checkFile({ name: 'a.xlsx', size: 5 * 1024 * 1024 + 1 }, 5).code, 'FILE_TOO_LARGE');
});
test('visibleBand·isCovered·scrollDelta: 929x869 — 작성 바(~98)와 원본 패널(395~) 사이에 칸이 오게 한다', function () {
  const covers = [{ top: 395, left: 288, right: 929 }, { top: 760, left: 288, right: 929 }];
  const band = bw.visibleBand({ vpH: 869, barBottom: 98, covers: covers, cell: { left: 300, right: 400 } });
  assert.deepStrictEqual(band, { top: 106, bottom: 387 });
  // 보고된 사례: 포커스 칸 468~507 은 원본 패널 뒤 → 위로 올려야 한다(양수 = 아래로 스크롤)
  assert.strictEqual(bw.isCovered({ top: 468, bottom: 507 }, band), true);
  assert.strictEqual(bw.scrollDelta({ top: 468, bottom: 507 }, band), 120);
  // 작성 바 뒤(위쪽)로 가린 칸 → 음수
  assert.strictEqual(bw.scrollDelta({ top: 60, bottom: 90 }, band), -46);
  // 이미 보이면 0
  assert.strictEqual(bw.scrollDelta({ top: 200, bottom: 240 }, band), 0);
  // 가로로 겹치지 않는 패널(원본이 옆에 있는 넓은 화면)은 아래 끝을 줄이지 않는다
  const wide = bw.visibleBand({ vpH: 869, barBottom: 98, covers: [{ top: 120, left: 700, right: 1200 }, { top: 790, left: 0, right: 1200 }], cell: { left: 100, right: 300 } });
  assert.strictEqual(wide.bottom, 782);
  // 칸이 영역보다 크면 위쪽을 맞춘다
  assert.strictEqual(bw.scrollDelta({ top: 300, bottom: 600 }, { top: 106, bottom: 250 }), 194);
});
test('visibleBand·scrollDelta: 1440 — 상태 줄이 38→78→130px 로 자라도 선택 칸이 항상 영역 안으로 들어온다', function () {
  // 상태 줄 top = 886 - 높이(바닥 886). 칸 y775~800 (재현 사례)
  [38, 78, 130].forEach(function (h) {
    const stTop = 886 - h;
    const band = bw.visibleBand({ vpH: 886, barBottom: 98, covers: [{ top: stTop, left: 0, right: 1440 }], cell: { left: 600, right: 700 } });
    assert.strictEqual(band.bottom, stTop - 8);
    const cell = { top: 775, bottom: 800 };
    const d = bw.scrollDelta(cell, band);
    const moved = { top: cell.top - d, bottom: cell.bottom - d };
    assert.strictEqual(bw.isCovered(moved, band), false, 'h=' + h);
    if (h === 38) assert.strictEqual(d, 0 + Math.max(0, 800 - band.bottom));
  });
});
test('settleVisible: select 로 상태 줄이 자란 뒤(top 848→756) 칸 815–840 이 가려지면 보정하고 rAF 에서 한 번 더 확인한다 (qa 실측)', function () {
  const calls = [], frames = [];
  const L = { stTop: 848, scroll: 0, cell: { top: 815, bottom: 840 } };
  // select 직후 drawStatus 로 상태 줄이 커진 상태를 모의
  L.stTop = 756;
  const d = {
    measure: function () { calls.push('measure'); },
    ensure: function () {
      calls.push('ensure');
      const band = bw.visibleBand({ vpH: 886, barBottom: 98, covers: [{ top: L.stTop, left: 0, right: 1440 }], cell: { left: 600, right: 700 } });
      const c = { top: L.cell.top - L.scroll, bottom: L.cell.bottom - L.scroll };
      L.scroll += bw.scrollDelta(c, band);
    },
    // 브라우저처럼 this 가 전역/undefined 가 아니면 던진다(객체 속성으로 부르면 Illegal invocation)
    raf: function (fn) { if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation'); calls.push('raf'); frames.push(fn); },
    alive: function () { return true; }
  };
  assert.doesNotThrow(function () { bw.settleVisible(d); });
  assert.deepStrictEqual(calls, ['measure', 'ensure', 'raf']);
  assert.ok(L.cell.bottom - L.scroll <= 748, '칸 bottom ' + (L.cell.bottom - L.scroll) + ' <= 748');
  frames.forEach(function (f) { f(); });
  assert.deepStrictEqual(calls, ['measure', 'ensure', 'raf', 'measure', 'ensure']);
  assert.ok(L.cell.bottom - L.scroll <= 748);
  // 화면이 사라졌으면(alive false) 다음 프레임에서 아무것도 하지 않는다
  const c2 = [];
  bw.settleVisible({ measure: function () { c2.push('m'); }, ensure: function () { c2.push('e'); }, raf: function (fn) { fn(); }, alive: function () { return false; } });
  assert.deepStrictEqual(c2, ['m', 'e']);
  // raf 가 없는 환경
  const c3 = [];
  bw.settleVisible({ measure: function () { c3.push('m'); }, ensure: function () { c3.push('e'); }, raf: null, alive: function () { return true; } });
  assert.deepStrictEqual(c3, ['m', 'e']);
  // measure·ensure·raf 가 던져도 호출자는 깨지지 않는다
  assert.doesNotThrow(function () {
    bw.settleVisible({ measure: function () { throw new Error('m'); }, ensure: function () { throw new Error('e'); }, raf: function () { throw new Error('r'); }, alive: function () { return true; } });
  });
});
test('isStuck: 바의 현재 top 이 스크롤 영역 top + 14 이하일 때만 붙은 것이다', function () {
  assert.strictEqual(bw.isStuck(172, 91), false);   // 스크롤 영역 top 91, 바 top 172 → 안 붙음
  assert.strictEqual(bw.isStuck(106, 91), false);
  assert.strictEqual(bw.isStuck(105, 91), true);    // 91 + 14
  assert.strictEqual(bw.isStuck(90, 91), true);
});
test('needSettle: 누른 칸이 현재 선택일 때만 mouseup 에서 보정한다', function () {
  assert.strictEqual(bw.needSettle({ t: 'C', key: 'r2c1' }, { t: 'C', key: 'r2c1' }), true);
  assert.strictEqual(bw.needSettle({ t: 'C', key: 'r2c1' }, { t: 'C', key: 'r1c1' }), false);
  assert.strictEqual(bw.needSettle(null, { t: 'C', key: 'r2c1' }), false);
  assert.strictEqual(bw.needSettle({ t: 'C', key: 'r2c1' }, null), false);
});
test('틈 띠: 작성 바·양식 편집 줄은 is-stuck 일 때만, 모두 클릭을 가로채지 않는다, 상태 줄 아래 띠 (index.html)', function () {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(/\.bd-writebar\.is-stuck::before \{[^}]*left:-3px[^}]*pointer-events:none/.test(html));
  assert.ok(/\.bd-editbar:not\(\.bd-writebar\)\.is-stuck::before \{[^}]*pointer-events:none/.test(html));
  assert.ok(!/\.bd-editbar:not\(\.bd-writebar\)::before/.test(html), '항상 켜진 편집 줄 띠가 없어야 한다');
  assert.ok(/\.bd-w-status::after \{[^}]*pointer-events:none/.test(html));
  assert.ok(/\.bd-w-status::after \{[^}]*bottom:-15px;[^}]*height:14px/.test(html), '테두리 바깥에서 시작해 14px');
});
test('rejectFrom: 모든 오류는 detail 객체 기준, 411/413/415/422 문구', function () {
  const ctx = { formName: '기본 양식', maxMb: 5 };
  let r = bw.rejectFrom({ status: 422, body: { detail: { code: 'MACRO', message: 'x' } } }, ctx);
  assert.strictEqual(r.title, '매크로가 들어 있는 파일은 받지 않습니다.'); assert.ok(r.hint.includes('.xlsx'));
  r = bw.rejectFrom({ status: 413, body: { detail: { code: 'FILE_TOO_LARGE', max_mb: 5, message: 'm' } } }, ctx);
  assert.strictEqual(r.title, '파일이 너무 큽니다(최대 5MB).');
  r = bw.rejectFrom({ status: 413, body: { detail: { max_mb: 7 } } }, ctx);
  assert.ok(r.title.includes('7MB'));
  r = bw.rejectFrom({ status: 411, body: { detail: { max_mb: 5 } } }, ctx);
  assert.strictEqual(r.title, '파일 크기를 확인하지 못했습니다.');
  r = bw.rejectFrom({ status: 415, body: { detail: { code: 'UNSUPPORTED_MEDIA_TYPE' } } }, ctx);
  assert.ok(r.title.includes('.xlsx'));
  // 이름이 .xlsx 인데 서버가 NOT_XLSX: 깨진 파일 문구(암호 안내 포함)
  r = bw.rejectFrom({ status: 415, body: { detail: { code: 'NOT_XLSX' } } }, { formName: 'x', fileName: '보고서.XLSX' });
  assert.ok(r.title.includes('깨졌거나') && r.hint.includes('암호'));
  // 확장자 오류(.md): 암호 줄 없음
  r = bw.rejectFrom({ status: 0, body: { detail: bw.checkFile({ name: 'a.md', size: 3 }, 5) } }, { formName: 'x', fileName: 'a.md' });
  assert.strictEqual(r.title, '엑셀(.xlsx) 파일만 올릴 수 있습니다.');
  assert.ok(!r.hint.includes('암호') && r.hint.includes('.xlsm'));
  r = bw.rejectFrom({ status: 422, body: { detail: { code: 'PII_DETECTED', count: 3, kinds: [{ kind: '주민등록번호', count: 2 }, { kind: '휴대폰', count: 1 }] } } }, ctx);
  assert.strictEqual(r.kindsText, '주민등록번호 형식 2건 · 휴대폰 형식 1건');
  assert.ok(r.lines[0].includes('3곳') && r.hint.includes('저장되지 않았습니다'));
  r = bw.rejectFrom({ status: 422, body: { detail: { code: 'STRUCTURE_MISMATCH', reasons: [
    { ref: 'A', code: 'SHEET_MISSING', sheet: '수익성분석' }, { ref: 'B', code: 'SHEET_MISSING', sheet: '수익성분석' }] } } }, ctx);
  assert.strictEqual(r.structure, true);
  assert.deepStrictEqual(r.lines, ['‘수익성분석’ 시트를 찾지 못했습니다.']);   // 같은 문장은 한 번
  assert.ok(r.title.includes('‘기본 양식’'));
  r = bw.rejectFrom({ status: 503, body: { detail: { code: 'BUSY', message: '다른 작업을 처리하고 있습니다.' } } }, ctx);
  assert.strictEqual(r.title, '다른 작업을 처리하고 있습니다.');
  r = bw.rejectFrom({ status: 0, net: true }, ctx);
  assert.strictEqual(r.code, 'NET');
  // 문자열 detail은 분기하지 않는다(일반 문구)
  r = bw.rejectFrom({ status: 500, body: { detail: '내부 오류 문자열' } }, ctx);
  assert.ok(!r.title.includes('내부 오류 문자열') && r.title === '엑셀을 처리하지 못했습니다.' && r.hint === '잠시 뒤 다시 올려 주세요.');
});
test('rejectFrom: detail이 없거나(Spring 기본 본문) 문자열이어도 상태 코드로 기본 문구', function () {
  const ctx = {};
  assert.strictEqual(bw.rejectFrom({ status: 401, body: { status: 401, error: 'Unauthorized' } }, ctx).title, '로그인이 필요합니다.');
  assert.ok(bw.rejectFrom({ status: 403, body: null }, ctx).title.includes('업무 수정 권한이 필요합니다'));
  assert.strictEqual(bw.rejectFrom({ status: 404, body: { detail: '없음' } }, ctx).title, '양식을 찾지 못했습니다.');
  const r = bw.rejectFrom({ status: 502, body: '<html>' }, ctx);
  assert.ok(!r.title.includes('502') && r.hint.includes('잠시 뒤'));
});
test('upload: file만(기본 양식), 서버 양식은 version도, 응답 {ok,status,body}', async function () {
  const saved = global.FormData;
  global.FormData = function () { this.items = []; this.append = function (k, v) { this.items.push([k, v]); }; };
  try {
    let seen = null;
    const fetchFn = function (url, init) { seen = { url: url, init: init }; return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ tables: [] }); } }); };
    const f = { name: 'a.xlsx' };
    let r = await bw.upload(fetchFn, 'default_doc', 3, f);
    assert.strictEqual(seen.url, '/board-forms/default_doc/excel'); assert.strictEqual(seen.init.method, 'POST');
    assert.deepStrictEqual(seen.init.body.items, [['file', f]]);
    assert.ok(!('headers' in seen.init), 'Content-Type은 브라우저가 boundary와 함께 정한다');
    r = await bw.upload(fetchFn, '7', 3, f);
    assert.deepStrictEqual(seen.init.body.items, [['file', f], ['version', '3']]);
    assert.deepStrictEqual(r, { ok: true, status: 200, body: { tables: [] } });
    r = await bw.upload(function () { return Promise.reject(new Error('x')); }, '7', 1, f);
    assert.strictEqual(r.net, true);
  } finally { global.FormData = saved; }
});
test('buildState: 칸 이름·합계 서버 경고 정규화·원본 위치 색인', function () {
  const ws = ws0(), t = ws.tables[0];
  assert.strictEqual(t.cells.r1c1.label, '재산상 이익제공 · 출연금 · 금액');
  // 합계 관계가 있으면 현재 값으로 다시 계산한 결과가 sumState다(서버 스냅샷은 serverSum에 보관)
  assert.deepStrictEqual(t.cells.r2c1.serverSum, { expected: '1,234', actual: '1,235', diff: '+1', zero: false });
  assert.strictEqual(t.cells.r2c1.warns.length, 0);   // SUM_MISMATCH는 warns가 아니라 serverSum으로
  assert.strictEqual(t.srcIndex['1,2'], 'r1c1');       // C2 = 2행(first_row 1) → r1, C → c2
  assert.strictEqual(ws.tables[1].mapped, false);
  assert.deepStrictEqual(t.sums, [{ total: 'r2c1', of: ['r1c1'] }]);
});
test('tally·필터: 총 칸·확인·확인 필요(합계 차이)·미확인', function () {
  let ws = ws0();
  let y = bw.tally(ws);
  assert.deepStrictEqual([y.m, y.n, y.need, y.unchecked, y.edited, y.sumBad], [2, 0, 1, 2, 0, 1]);
  ws = bw.toggleCheck(ws, 'A', 'r1c1');
  assert.strictEqual(bw.tally(ws).n, 1);
  assert.strictEqual(bw.matches(bw.setFilter(ws, 'need'), ws.tables[0], ws.tables[0].cells.r2c1), true);
  assert.strictEqual(bw.matches(bw.setFilter(ws, 'unchecked'), ws.tables[0], ws.tables[0].cells.r1c1), false);
  assert.strictEqual(bw.setFilter(ws, 'x'), ws);
});
test('읽지 못한 빈 칸은 확인할 수 없고, 모두 확인해야 확인했음, 하나 풀면 해제', function () {
  const r = resp(); r.tables[0].cells[0] = cell('r1c1', '', { status: 'failed', reason: 'NO_CACHED_VALUE' });
  let ws = ws0(r);
  assert.strictEqual(bw.toggleCheck(ws, 'A', 'r1c1'), ws);
  assert.strictEqual(bw.cellInfo(ws.tables[0], ws.tables[0].cells.r1c1).unreadable, true);
  ws = ws0();
  ws = bw.toggleCheck(bw.toggleCheck(ws, 'A', 'r1c1'), 'A', 'r2c1');
  assert.strictEqual(bw.setDone(ws, true, '홍길동', '14:05').done.who, '홍길동');
  assert.strictEqual(bw.setDone(bw.toggleCheck(ws, 'A', 'r1c1'), true, 'x', 'y').done, null);   // 미완이면 거부
  const done = bw.setDone(ws, true, '홍길동', '14:05');
  assert.strictEqual(bw.toggleCheck(done, 'A', 'r1c1').done, null);   // 풀면 자동 해제
});
test('infoLines: 표시·원래 값(rounded true만), 합계 차이, 읽지 못함 이유, 출처 없음', function () {
  const ws = ws0(), t = ws.tables[0];
  const l1 = bw.infoLines(t, t.cells.r1c1).map(function (x) { return x.text; });
  assert.deepStrictEqual(l1, ['재산상 이익제공 · 출연금 · 금액', '기부금 시트 C2', '표시 1,234 · 원래 값 1233.6']);
  const l2 = bw.infoLines(t, t.cells.r2c1).map(function (x) { return x.text; });
  assert.ok(l2.includes('표시 1,235'), 'rounded=false면 원래 값을 붙이지 않는다');
  assert.ok(l2.includes('표시 합 1,234 · 합계 1,235 · 차이 +1'));
  const r = resp(); r.tables[0].cells[0] = cell('r1c1', '', { status: 'failed', reason: 'NO_CACHED_VALUE', source: { sheet: '기부금', cell: 'C2', display: '' } });
  const w = ws0(r), l3 = bw.infoLines(w.tables[0], w.tables[0].cells.r1c1).map(function (x) { return x.text; });
  assert.ok(l3.some(function (s) { return s.indexOf('읽지 못함: 수식의 계산 결과가 파일에 저장돼 있지 않습니다') === 0; }));
  const c0 = Object.assign({}, t.cells.r1c1, { src: null });
  assert.ok(bw.infoLines(t, c0).some(function (x) { return x.text === '엑셀에서 가져오지 않은 칸입니다'; }));
});
test('infoLines: rounded가 null(%·날짜 서식 등)이면 raw를 원래 값으로 보여 주지 않는다', function () {
  const r = resp();
  r.tables[0].cells[0] = cell('r1c1', '2026-01-05', { source: { sheet: '기부금', cell: 'C2', display: '2026-01-05', raw: '46027', rounded: null } });
  const ws = ws0(r), t = ws.tables[0];
  const l = bw.infoLines(t, t.cells.r1c1).map(function (x) { return x.text; });
  assert.ok(l.includes('표시 2026-01-05'));
  assert.ok(!l.join('|').includes('46027') && !l.join('|').includes('원래 값'));
  assert.ok(!bw.askLines(t, t.cells.r1c1)[0].includes('46027'));
});
test('valueCellHtml: 이스케이프·gridcell·틸(bd-mapped) 없음·aria-label', function () {
  const r = resp(); r.tables[0].cells[0] = cell('r1c1', '<b>x</b>');
  const ws = ws0(r), t = ws.tables[0];
  const h = bw.valueCellHtml(t, t.cells.r1c1, { fc: {}, rove: true });
  assert.ok(h.includes('&lt;b&gt;x&lt;/b&gt;') && !h.includes('<b>x'));
  assert.ok(h.includes('role="gridcell"') && h.includes('tabindex="0"') && !h.includes('bd-mapped'));
  assert.ok(h.includes('aria-label="재산상 이익제공, 출연금, 금액, &lt;b&gt;x&lt;/b&gt;, 미확인"'));
});
test('cardHtml: 필터에 해당 칸이 없으면 접고, 머리글 주의 표는 배너·칩, 주의 아닌 표에는 없음', function () {
  let ws = ws0();
  assert.ok(bw.cardHtml(bw.setFilter(ws, 'edited'), ws.tables[0], bw.freshUi(), null).includes('해당 칸 없음'));
  assert.ok(!bw.cardHtml(bw.setFilter(ws, 'edited'), ws.tables[0], bw.freshUi(), null).includes('<table'));
  const r = resp(); r.tables[0].needs_review = true;
  r.tables[0].label_mismatches = [1, 2, 3, 4].map(function (n) { return { code: 'LABEL_MISMATCH', cell: 'B' + n, expected: '구분' + n, actual: '항목' + n }; });
  ws = ws0(r);
  const h = bw.cardHtml(ws, ws.tables[0], bw.freshUi(), null);
  assert.ok(h.includes('이 표는 머리글이 양식과 달라 위치대로 값을 채웠습니다.'));
  assert.strictEqual(h.split('<li>양식 ‘').length - 1, 3);
  assert.ok(h.includes('외 1개 더 보기'));
  assert.ok(h.includes('주의 · 남은 칸 2'));
  assert.ok(bw.cardHtml(ws, ws.tables[0], Object.assign(bw.freshUi(), { banOpen: { A: true } }), null).split('<li>양식 ‘').length - 1 === 4);
  // 전 칸 확인 뒤에도 배너는 유지, 칩만 바뀐다
  ['r1c1', 'r2c1'].forEach(function (k) { ws = bw.toggleCheck(ws, 'A', k); });
  const h2 = bw.cardHtml(ws, ws.tables[0], bw.freshUi(), null);
  assert.ok(h2.includes('bd-w-ban') && h2.includes('주의 · 모두 확인함'));
  assert.ok(!bw.cardHtml(ws0(), ws0().tables[0], bw.freshUi(), null).includes('bd-w-ban'));
  // 머리글 주의 표는 모든 칸이 확인 필요 필터에 든다
  assert.strictEqual(bw.tally(ws0(r)).need, 2);
});
test('summaryHtml: 부분 실패 문구·읽지 못한 칸 보기·주의 n건 / 전부 채움 문구', function () {
  assert.ok(bw.summaryHtml(ws0()).includes('값 2칸을 모두 채웠습니다. 오른쪽 원본과 대조하며 칸마다 확인해 주세요.'));
  const r = resp(); r.tables[0].cells[0] = cell('r1c1', '', { status: 'failed', reason: 'EMPTY' });
  r.warnings = [{ code: 'EXTERNAL_LINK' }, { code: 'PII_OUTSIDE_RANGE', count: 2 }];
  const h = bw.summaryHtml(ws0(r));
  assert.ok(h.includes('값 1칸을 채웠고 1칸은 읽지 못했습니다.') && h.includes('읽지 못한 칸 보기'));
  // 구성 칸을 읽지 못하면 합계 검산은 생략(침묵)되므로 합계 줄은 세지 않는다
  assert.ok(h.includes('<summary>주의 2건</summary>'), '외부 연결 + 작성 범위 밖 개인정보');
  assert.ok(bw.summaryHtml(ws0()).includes('<summary>주의 1건</summary>'), '합계가 맞지 않는 곳 1곳');
});
test('reviewHtml: 확인했음은 모두 확인해야 활성, 완료 칩·남은 칸 설명', function () {
  let ws = ws0();
  let h = bw.reviewHtml(ws);
  assert.ok(h.includes('검수 0/2') && /id="bd-w-done" disabled/.test(h) && h.includes('모든 칸을 확인하면 선택할 수 있습니다(남은 칸 2)'));
  ws = bw.toggleCheck(bw.toggleCheck(ws, 'A', 'r1c1'), 'A', 'r2c1');
  assert.ok(!/id="bd-w-done" disabled/.test(bw.reviewHtml(ws)));
  h = bw.reviewHtml(bw.setDone(ws, true, '홍길동', '14:05'));
  assert.ok(h.includes('검수 완료 · 홍길동 14:05') && h.includes(' checked'));
});
test('draftBody: 매핑 칸의 현재 값만, 기본 양식은 version 없음, raw·원래 값·사유·확인 상태 없음', function () {
  let ws = ws0();
  let b = bw.draftBody(ws, null);
  assert.deepStrictEqual(b, { tables: [{ ref: 'A', cells: { r1c1: '1,234', r2c1: '1,235' } }] });
  b = bw.draftBody(bw.toggleCheck(ws, 'A', 'r1c1'), 3);
  assert.strictEqual(b.version, 3);
  const s = JSON.stringify(b);
  ['raw', '1233.6', 'orig', 'why', 'checked', 'rounded'].forEach(function (k) { assert.ok(s.indexOf(k) < 0, k); });
});
test('draftErrorText·draftFileName·draftDoneText', function () {
  assert.ok(bw.draftErrorText({ status: 422, body: { detail: { code: 'PII_DETECTED', kinds: [{ kind: '이메일', count: 1 }] } } }).includes('이메일 형식 1건'));
  assert.strictEqual(bw.draftErrorText({ status: 403, body: { detail: { code: 'FORBIDDEN', message: '권한이 없습니다.' } } }), '권한이 없습니다.');
  assert.strictEqual(bw.draftErrorText({ status: 500, body: { detail: { code: 'SERVER_ERROR', message: '내부' } } }), '초안 워드를 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요.');
  assert.strictEqual(bw.draftErrorText({ status: 500, body: { detail: '문자열' } }), '초안 워드를 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요.');
  assert.strictEqual(bw.draftErrorText({ status: 500, body: null }), '초안 워드를 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요.');
  assert.ok(bw.draftErrorText({ net: true }).includes('서버에 연결하지 못했습니다'));
  assert.strictEqual(bw.draftFileName('a/b:c'), 'a_b_c_초안.docx');
  assert.strictEqual(bw.draftDoneText(ws0()), '초안 워드를 내려받았습니다. 확인하지 않은 칸 2개가 포함된 초안입니다.');
});
test('leaveText·hasWork: 확인·수정 건수 문구, 0건이면 확인 줄 불필요', function () {
  assert.strictEqual(bw.leaveText('end', { n: 12, edited: 3 }), '확인 12칸과 수정 3칸이 사라집니다. 작성을 끝낼까요?');
  assert.strictEqual(bw.leaveText('swap', { n: 12, edited: 3 }), '새 엑셀로 바꾸면 확인 12칸과 수정 3칸이 사라집니다.');
  assert.strictEqual(bw.leaveText('end', { n: 1, edited: 0 }), '확인 1칸이 사라집니다. 작성을 끝낼까요?');
  assert.strictEqual(bw.hasWork(null), false); assert.strictEqual(bw.hasWork(ws0()), false);
  assert.strictEqual(bw.hasWork(bw.toggleCheck(ws0(), 'A', 'r1c1')), true);
});
test('writeHtml: 작성 줄 버튼·빈 상태·거부 상자·확인 줄·상태 줄 라이브', function () {
  const ui = bw.freshUi(); ui.form = { id: 'default_doc', name: '기본 양식', version: undefined };
  let h = bw.writeHtml(null, ui);
  assert.ok(h.includes('자료 작성 중 · 기본 양식') && h.includes('id="bd-w-pick"') && h.includes('수익성 분석 엑셀을 올려 주세요'));
  assert.ok(/data-w="draft"[^>]*disabled/.test(h) && /data-w="swap" disabled/.test(h));
  ui.rej = bw.rejectFrom({ status: 422, body: { detail: { code: 'MACRO' } } }, {});
  assert.ok(bw.writeHtml(null, ui).includes('role="alert" tabindex="-1"'));
  const ws = ws0();
  ui.rej = null; ui.form.version = 3;
  h = bw.writeHtml(ws, ui);
  assert.ok(h.includes('v3 · 원본 수익성.xlsx(저장 안 됨)') && !/data-w="draft"[^>]*disabled/.test(h));
  assert.ok(h.includes('id="bd-w-status" class="bd-w-status"') && h.includes('id="bd-w-live" class="bd-w-live" role="status" aria-live="polite"'));
  assert.ok(h.includes('role="grid"') && !h.includes('bd-mapped') && !h.includes('confirm('));
  ui.leave = 'end';
  assert.ok(bw.writeHtml(ws, ui).includes('id="bd-w-leave-no"'));
});
test('statusHtml: 선택 칸의 출처 줄·확인 버튼(aria-pressed)·읽지 못한 칸은 확인 비활성', function () {
  const ws = ws0(), ui = bw.freshUi();
  assert.ok(bw.statusHtml(ws, ui).includes('칸을 고르면'));
  ui.sel = { t: 'A', key: 'r1c1' };
  const h = bw.statusHtml(ws, ui);
  assert.ok(h.includes('기부금 시트 C2') && h.includes('aria-pressed="false"'));
  assert.ok(bw.statusHtml(bw.toggleCheck(ws, 'A', 'r1c1'), ui).includes('aria-pressed="true"'));
});
test('tipPlace·navTarget·linearTarget·escAction', function () {
  // 위로 4px, 위 공간이 작성 줄+8px보다 좁으면 아래로
  assert.deepStrictEqual(bw.tipPlace({ left: 100, top: 300, bottom: 320 }, { w: 200, h: 60 }, { w: 1000, h: 800 }, 100, 0), { left: 100, top: 236, below: false });
  assert.strictEqual(bw.tipPlace({ left: 100, top: 120, bottom: 140 }, { w: 200, h: 60 }, { w: 1000, h: 800 }, 100, 0).below, true);
  // 가장자리 8px, 원본 패널(limitRight)을 가리지 않는다
  assert.strictEqual(bw.tipPlace({ left: 950, top: 300, bottom: 320 }, { w: 280, h: 60 }, { w: 1000, h: 800 }, 0, 0).left, 712);
  assert.strictEqual(bw.tipPlace({ left: 600, top: 300, bottom: 320 }, { w: 280, h: 60 }, { w: 1200, h: 800 }, 0, 700).left, 420);
  // 아래쪽 고정 패널(coverTop)이 있으면 그 위에 둔다. 아래에도 자리가 없으면 칸 근처 위쪽(사이드바 위로 날아가지 않는다)
  assert.deepStrictEqual(bw.tipPlace({ left: 400, top: 500, bottom: 520 }, { w: 200, h: 60 }, { w: 929, h: 869 }, 98, 0, 395), { left: 400, top: 436, below: false });
  const lowc = bw.tipPlace({ left: 400, top: 120, bottom: 140 }, { w: 200, h: 60 }, { w: 929, h: 869 }, 98, 0, 180);
  assert.strictEqual(lowc.below, false); assert.ok(lowc.top >= 106 && lowc.left === 400);
  const items = [{ cx: 10, cy: 10, h: 20 }, { cx: 60, cy: 10, h: 20 }, { cx: 10, cy: 40, h: 20 }, { cx: 60, cy: 40, h: 20 }, { cx: 60, cy: 70, h: 20 }];
  assert.strictEqual(bw.navTarget(items, 0, 'right'), 1); assert.strictEqual(bw.navTarget(items, 0, 'left'), -1);
  assert.strictEqual(bw.navTarget(items, 0, 'down'), 2); assert.strictEqual(bw.navTarget(items, 3, 'down'), 4);
  assert.strictEqual(bw.navTarget(items, 4, 'up'), 3); assert.strictEqual(bw.navTarget(items, 4, 'down'), -1);
  assert.strictEqual(bw.linearTarget(5, 4, 1), -1); assert.strictEqual(bw.linearTarget(5, 1, -1), 0);
  const all = { tip: 1, edit: 1, ask: 1, reason: 1, leave: 1, sel: 1 };
  const order = ['tip', 'edit', 'ask', 'reason', 'leave', 'sel', 'none'];
  order.forEach(function (want) { assert.strictEqual(bw.escAction(all), want); delete all[want]; });
});
test('mapListText·gridPos·parseRef', function () {
  assert.strictEqual(bw.mapListText(form().tables, ['A']), '채워질 표: A 재산상 이익제공');
  assert.strictEqual(bw.mapListText(form().tables, []), '');
  assert.deepStrictEqual(bw.gridPos(resp().sources[0], 'C5'), { r: 4, c: 2 });
  assert.strictEqual(bw.gridPos(resp().sources[0], 'Z9'), null);
});
test('loadMap: 실패해도 기본 한도로 계속', async function () {
  let r = await bw.loadMap(function () { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ max_mb: 7, tables: [{ ref: 'A' }] }); } }); });
  assert.deepStrictEqual(r, { ok: true, maxMb: 7, tables: ['A'] });
  r = await bw.loadMap(function () { return Promise.resolve({ ok: false, status: 403, json: function () { return Promise.resolve({ detail: { code: 'FORBIDDEN' } }); } }); });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.maxMb, 5);
});
test('board.js 연결: 쓰기 버튼은 canWrite일 때만, 작성 모드는 버튼 줄이 비고, 권한 없음 안내 둘', function () {
  assert.ok(board.actionsHtml({ mode: 'view', hasDoc: true, canWrite: true }).includes('id="bd-write" data-act="write">이 양식으로 작성'));
  assert.ok(!board.actionsHtml({ mode: 'view', hasDoc: true }).includes('bd-write'));
  assert.strictEqual(board.actionsHtml({ mode: 'write', hasDoc: true, canWrite: true }), '');
  const h = board.actionsHtml({ mode: 'view', hasDoc: true, editable: false, canCopy: false, perm: 'no' });
  assert.ok(h.includes('자료 작성은 업무 수정 권한이 있어야 할 수 있습니다.') && h.includes('양식은 편집 권한이 있는 사람만 고칠 수 있습니다.'));
});
test('board-write.js: 확인창·브라우저 저장소·원시 특수 코드포인트가 없다', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'board-write.js'), 'utf8');
  assert.ok(!/\bconfirm\s*\(/.test(src));
  assert.ok(!/localStorage|sessionStorage/.test(src), 'raw·원래 값은 브라우저 저장소에 넣지 않는다');
  [0x2028, 0x2029, 0xfffe, 0xffff].forEach(function (cp) { assert.ok(!src.includes(String.fromCharCode(cp)), cp.toString(16)); });
});

// ── 머리글 불일치(label_state) ──
function respLabel(state) {
  const r = resp(); const t = r.tables[0];
  t.needs_review = true; t.label_state = state;
  t.label_mismatches = [{ code: 'LABEL_MISMATCH', cell: 'B1', expected: '구분', actual: '항목' }];
  t.cells.forEach(function (c) { c.warnings = [{ code: 'LABEL_MISMATCH' }];
    if (state === 'failed') { c.status = 'failed'; c.reason = 'LABEL_MISMATCH'; c.value = ''; c.source.display = ''; c.source.raw = null; }
    else c.status = 'review'; });
  return r;
}
test('partial: review 칸은 값이 보이고 확인 전에는 확인됨으로 세지 않으며 요약에 따로 센다', function () {
  const ws = ws0(respLabel('partial')), y = bw.tally(ws);
  assert.deepStrictEqual([y.m, y.n, y.review, y.filled, y.failed, y.need], [2, 0, 2, 0, 0, 2]);
  assert.ok(bw.summaryHtml(ws).includes('머리글이 달라 확인이 필요한 칸이 2칸 있습니다'));
  assert.strictEqual(bw.findT(ws, 'A').labelState, 'partial');
  assert.strictEqual(bw.tally(bw.toggleCheck(ws, 'A', 'r1c1')).n, 1);
  // 고쳐도 review는 유지된다(확인해야만 센다)
  assert.strictEqual(bw.findT(ws, 'A').cells.r1c1.status, 'review');
  assert.strictEqual(bw.tally(ws).n, 0);
});
test('failed: 모든 칸 비어 채우지 않음, 직접 입력 전에는 확인 불가, 합계 검산 없음, 배너·칩 문구', function () {
  const ws = ws0(respLabel('failed')), t = ws.tables[0];
  assert.strictEqual(bw.toggleCheck(ws, 'A', 'r1c1'), ws);
  assert.ok(bw.valueCellHtml(t, t.cells.r1c1, { fc: {} }).includes('채우지 않음'));
  assert.strictEqual(bw.cellInfo(t, t.cells.r2c1).sumBad, false);
  assert.ok(bw.cardHtml(ws, t, bw.freshUi(), null).includes('이 표는 머리글이 양식과 많이 달라 값을 채우지 않았습니다.'));
  assert.ok(bw.cardHtml(ws, t, bw.freshUi(), null).includes('주의 · 채우지 못함'));
  const lines = bw.infoLines(t, t.cells.r1c1).map(function (x) { return x.text; });
  assert.strictEqual(lines.filter(function (s) { return s.indexOf('머리글') >= 0; }).length, 1);
  assert.ok(bw.summaryHtml(ws).includes('2칸은 읽지 못했습니다'));
});

// ── HIDDEN_FORMAT·review 칸 확인 규칙 ──
test('HIDDEN_FORMAT: 안내 문구, 확인 필요 필터 포함, 확인 전에는 확인됨으로 세지 않는다(숫자 칸 전용이 아님)', function () {
  const r = resp();
  r.tables[0].cells[0] = cell('r1c1', '1,234', { warnings: [{ code: 'HIDDEN_FORMAT' }] });
  r.tables[0].cells[1] = cell('r2c1', '1,234');   // 합계가 맞는 상태
  const ws = ws0(r), t = ws.tables[0];
  const lines = bw.infoLines(t, t.cells.r1c1).map(function (x) { return x.text; });
  assert.ok(lines.includes('엑셀 화면에서는 서식으로 가려져 보이지 않는 값입니다. 문서에 넣어도 되는지 확인해 주세요. (글꼴 색 등 서식 밖의 숨김은 검사하지 않습니다.)'));
  assert.strictEqual(bw.cellInfo(t, t.cells.r1c1).need, true);
  assert.strictEqual(bw.matches(bw.setFilter(ws, 'need'), t, t.cells.r1c1), true);
  assert.strictEqual(bw.matches(bw.setFilter(ws, 'need'), t, t.cells.r2c1), false);
  assert.strictEqual(bw.tally(ws).n, 0, '확인 전에는 확인됨이 0');
  assert.strictEqual(bw.tally(bw.toggleCheck(ws, 'A', 'r1c1')).n, 1, '확인해야만 센다');
  assert.ok(bw.valueCellHtml(t, t.cells.r1c1, { fc: {} }).includes('aria-label') && bw.cellAria(t, t.cells.r1c1).includes('주의'));
  assert.ok(bw.summaryHtml(ws).includes('서식으로 가려져 보이지 않는 값이 1칸'));
  // 문자열 칸에도 같은 처리
  const r2 = resp(); r2.tables[0].cells[0] = cell('r1c1', '비공개', { warnings: [{ code: 'HIDDEN_FORMAT' }] });
  const t2 = ws0(r2).tables[0];
  assert.strictEqual(bw.cellInfo(t2, t2.cells.r1c1).need, true);
});
test('review 칸: 확인 전에는 n에 들지 않고 확인 필요 필터에 포함', function () {
  const r = resp(); r.tables[0].cells[0] = cell('r1c1', '1,234', { status: 'review' });
  const ws = ws0(r), t = ws.tables[0];
  assert.strictEqual(bw.cellInfo(t, t.cells.r1c1).review, true);
  assert.strictEqual(bw.cellInfo(t, t.cells.r1c1).need, true);
  assert.strictEqual(bw.tally(ws).n, 0);
  assert.strictEqual(bw.tally(ws).review, 1);
  assert.strictEqual(bw.tally(bw.toggleCheck(ws, 'A', 'r1c1')).n, 1);
});

test('rejectFrom: 403은 할 일 안내, 기타 코드는 숫자 없이 파일 재선택 안내(P3)', function () {
  const r403 = bw.rejectFrom({ status: 403, body: null }, {});
  assert.ok(r403.hint.includes('내 정보의 내 권한에서 권한을 신청하면'));
  const r400 = bw.rejectFrom({ status: 400, body: null }, {});
  assert.strictEqual(r400.title, '엑셀을 처리하지 못했습니다.');
  assert.strictEqual(r400.hint, '파일을 다시 골라 올려 주세요.');
});

test('rejHtml: 403은 파일 고르기 버튼이 없고, 404는 양식 다시 고르기가 있다, 구조 불일치는 둘 다', function () {
  const ctx = { formName: '기본 양식' };
  const r403 = bw.rejectFrom({ status: 403, body: null }, ctx);
  assert.deepStrictEqual([r403.canPick, r403.canReform], [false, false]);
  const h403 = bw.rejHtml(r403);
  assert.ok(!h403.includes('data-w="pick"') && !h403.includes('data-w="reform"') && h403.includes('data-w="perm"') && h403.includes('권한 신청하러 가기'));
  assert.ok(h403.includes('role="alert"') && h403.includes('업무 수정 권한이 필요합니다'));
  assert.strictEqual(r403.canPerm, true);
  // 서버 문구가 있어도 403은 권한 신청 안내로 고정
  const r403m = bw.rejectFrom({ status: 403, body: { detail: { code: 'FORBIDDEN', message: '권한이 없습니다.' } } }, ctx);
  assert.ok(r403m.title.includes('업무 수정 권한이 필요합니다') && r403m.canPerm);
  const h404 = bw.rejHtml(bw.rejectFrom({ status: 404, body: { detail: '없음' } }, ctx));
  assert.ok(h404.includes('data-w="reform"') && h404.includes('data-w="pick"'));
  const hs = bw.rejHtml(bw.rejectFrom({ status: 422, body: { detail: { code: 'STRUCTURE_MISMATCH', reasons: [] } } }, ctx));
  assert.ok(hs.includes('data-w="pick"') && hs.includes('data-w="reform"'));
  const hm = bw.rejHtml(bw.rejectFrom({ status: 422, body: { detail: { code: 'MACRO' } } }, ctx));
  assert.ok(hm.includes('data-w="pick"') && !hm.includes('data-w="reform"'));
  const hn = bw.rejHtml(bw.rejectFrom({ status: 0, net: true }, ctx));
  assert.ok(hn.includes('data-w="pick"') && !hn.includes('data-w="reform"'));
});

test('index.html: 상태 줄 안 확인 줄은 글자 크기를 상속하고 문구 span은 flex:0 1 auto (P3)', function () {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const a = html.match(/\.bd-w-statusbody > \.bd-confirm \{([^}]*)\}/);
  assert.ok(a && /font-size:\s*inherit/.test(a[1]));
  const b = html.match(/\.bd-w-statusbody > \.bd-confirm span \{([^}]*)\}/);
  assert.ok(b && /flex:\s*0 1 auto/.test(b[1]));
  assert.ok(/\.bd-confirm span \{ flex:1 1 320px;/.test(html));
});

test('rejHtml: 권한 신청 버튼은 403에만 있다', function () {
  const ctx = { formName: '기본 양식' };
  [[401, null], [404, null], [500, null], [422, { detail: { code: 'MACRO' } }]].forEach(function (c) {
    const r = bw.rejectFrom({ status: c[0], body: c[1] }, ctx);
    assert.strictEqual(r.canPerm, false);
    assert.ok(!bw.rejHtml(r).includes('data-w="perm"'));
  });
  assert.ok(!bw.rejHtml(bw.rejectFrom({ status: 0, net: true }, ctx)).includes('data-w="perm"'));
});

test('index.html: 티커 점·깜박임 제거, 읽는 글자 11px, 제목 단계(P3)', function () {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(!html.includes('tkPulse') && !html.includes('tk-live'));
  assert.ok(/\.login-card h1 \{/.test(html) && !/\.login-card h2/.test(html));
  assert.ok(/\.modal-box h2, \.modal-box h3 \{/.test(html));
  assert.ok(/\.filter-title \{ font-size:11px/.test(html));
  assert.ok(/\.wf-step \.wf-gate \{[^}]*font-size:11px/.test(html) && /\.wf-step \.wf-cnt \{[^}]*font-size:11px/.test(html));
});
