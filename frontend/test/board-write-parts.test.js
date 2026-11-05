const test = require('node:test');
const assert = require('node:assert');
const bw = require('../js/board-write.js');
const board = require('../js/board.js');   // 칸 이름 연결(setLabeler)

// 업로드 응답의 새 정보: parts[]·convert·main_value/sub_value·manual·assumptions
const KEYS = ['r1c1', 'r2c1', 'r3c1'];
function form() {
  return { form_id: 'f', name: '양식', tables: [
    { id: 'A', ref: 'A', mapping: 'A', title: '수익성', columns: 2, notes: [],
      rows: [[{ key: 'h0', text: '구분', header: true }, { key: 'h1', text: '금액', header: true }]].concat(KEYS.map(function (k) {
        return [{ key: k + 'n', text: '행 ' + k }, { key: k, text: '0', mapped: true }];
      })) }] };
}
function part(role, cell, display, extra) {
  return Object.assign({ role: role, sheet: '수익성', cell: cell, display: display, raw: display.replace(/,/g, ''), rounded: false }, extra || {});
}
function rc(key, over) {
  return Object.assign({ key: key, value: '', status: 'filled', reason: null, warnings: [],
    source: { sheet: '수익성', cell: 'C2', display: '', raw: null, rounded: null } }, over || {});
}
function build(cells, over) {
  const resp = Object.assign({ tables: [{ ref: 'A', needs_review: false, label_mismatches: [], sums: [], cells: cells }], sources: [], warnings: [] }, over || {});
  return bw.buildState(form(), resp, { fileName: 'a.xlsx', formId: 'f' });
}
function lines(ws, key) { const t = ws.tables[0]; return bw.infoLines(t, t.cells[key]); }
function texts(ws, key, k) { return lines(ws, key).filter(function (l) { return !k || l.k === k; }).map(function (l) { return l.text; }); }
const ROUND = ' (소수 둘째 자리에서 반올림)';

test('buildState: parts·part_count·convert·main/sub·manual·assumptions를 읽고 source.sheet가 null이면 src=null', function () {
  const ws = build([
    rc('r1c1', { value: '5.00 (1.00)', main_value: '5.00', sub_value: '1.00', part_count: 2,
      parts: [part('main', 'C2', '500'), part('sub', 'C3', '100')],
      convert: { kind: 'eok_paren', unit_from: '백만원', unit_to: '억원', divisor: 100, sum: '500', sub_sum: '100', of: null, result: '5.00 (1.00)' } }),
    rc('r2c1', { status: 'manual', manual: true, source: { sheet: null, cell: null, display: '', raw: null, rounded: null } }),
    rc('r3c1', { value: '3', source: { sheet: null, cell: null } })
  ], { assumptions: [{ code: 'UNIT_ASSUMED', area: 'a', unit: '백만원', confirmed: false }] });
  const t = ws.tables[0], c = t.cells.r1c1;
  assert.strictEqual(c.parts.length, 2); assert.strictEqual(c.partCount, 2);
  assert.strictEqual(c.parts[1].role, 'sub'); assert.strictEqual(c.mainValue, '5.00'); assert.strictEqual(c.subValue, '1.00');
  assert.strictEqual(c.convert.kind, 'eok_paren'); assert.strictEqual(c.convert.divisor, '100'); assert.strictEqual(c.status, 'filled');
  assert.strictEqual(t.cells.r2c1.manual, true); assert.strictEqual(t.cells.r2c1.status, 'manual'); assert.strictEqual(t.cells.r2c1.src, null);
  assert.strictEqual(t.cells.r3c1.src, null);
  assert.strictEqual(ws.assumptions.length, 1);
});

test('툴팁: 부품 3개 — 시트 첫칸 외 N칸, 부품 줄, 괄호 병기는 앞 값/괄호 안 두 줄', function () {
  const ws = build([rc('r1c1', { value: '123.40 (5.00)', main_value: '123.40', sub_value: '5.00', part_count: 3,
    parts: [part('main', 'C2', '12,000'), part('main', 'C3', '340'), part('sub', 'C4', '500')],
    convert: { kind: 'eok_paren', unit_from: '백만원', unit_to: '억원', divisor: 100, sum: '12340', sub_sum: '500', of: null, result: '123.40 (5.00)' } })]);
  const place = lines(ws, 'r1c1').filter(function (l) { return l.k === 'place'; })[0];
  assert.strictEqual(place.text, '수익성 시트 C2 외 2칸');
  assert.strictEqual(texts(ws, 'r1c1', 'shown').length, 0);
  assert.deepStrictEqual(texts(ws, 'r1c1', 'part'), ['수익성 C2 · 표시 12,000', '수익성 C3 · 표시 340', '괄호 안 수익성 C4 · 표시 500']);
  assert.deepStrictEqual(texts(ws, 'r1c1', 'calc'), [
    '앞 값 합 12,340 백만원 ÷ 100 = 123.40 억원' + ROUND,
    '괄호 안 합 500 백만원 ÷ 100 = 5.00 억원' + ROUND]);
});

test('툴팁: 한 칸 환산(eok)은 환산 줄 하나, 표시 줄은 그대로', function () {
  const ws = build([rc('r1c1', { value: '123.40', part_count: 1, parts: [part('main', 'C2', '12,340')],
    source: { sheet: '수익성', cell: 'C2', display: '12,340', raw: '12340', rounded: false },
    convert: { kind: 'eok', unit_from: '백만원', unit_to: '억원', divisor: 100, sum: '12340', sub_sum: null, of: null, result: '123.40' } })]);
  assert.deepStrictEqual(texts(ws, 'r1c1', 'calc'), ['합 12,340 백만원 ÷ 100 = 123.40 억원' + ROUND]);
  assert.deepStrictEqual(texts(ws, 'r1c1', 'shown'), ['표시 12,340']);
  assert.strictEqual(texts(ws, 'r1c1', 'part').length, 0);
});

test('툴팁: 부품 9개면 6줄 + "그 밖에 3칸"', function () {
  const ps = [];
  for (let i = 0; i < 9; i++) ps.push(part('main', 'C' + (i + 2), String(i + 1)));
  const ws = build([rc('r1c1', { value: '45', part_count: 9, parts: ps })]);
  const p = texts(ws, 'r1c1', 'part');
  assert.strictEqual(p.length, 7);
  assert.strictEqual(p[6], '그 밖에 3칸');
  assert.strictEqual(texts(ws, 'r1c1', 'place')[0], '수익성 시트 C2 외 8칸');
  // part_count가 parts보다 크면(서버가 잘라 보냄) 그 수를 따른다
  const ws2 = build([rc('r1c1', { value: '1', part_count: 20, parts: ps.slice(0, 6) })]);
  assert.strictEqual(texts(ws2, 'r1c1', 'part').pop(), '그 밖에 14칸');
  // 툴팁 HTML은 모두 이스케이프된 div
  const t = ws.tables[0];
  assert.ok(bw.tipHtml(t, t.cells.r1c1).includes('그 밖에 3칸'));
});

test('툴팁: display_sum은 구성 칸 개수 문구, manual은 직접 입력 문구', function () {
  const ws = build([
    rc('r1c1', { value: '9.00', source: { sheet: null, cell: null }, convert: { kind: 'display_sum', unit_from: '억원', unit_to: '억원', divisor: null, sum: '9.00', sub_sum: null, of: ['a', 'b', 'c'], result: '9.00' } }),
    rc('r2c1', { status: 'manual', manual: true, source: { sheet: null, cell: null } })]);
  assert.deepStrictEqual(texts(ws, 'r1c1', 'calc'), ['구성 칸 3개의 표시값을 더한 합계입니다']);
  assert.deepStrictEqual(texts(ws, 'r2c1', 'place'), ['엑셀에서 가져오지 않고 직접 입력하는 칸입니다']);
});

test('상태 줄: part·calc 줄은 .bd-w-calc로 분리하고 main 줄에는 섞이지 않는다', function () {
  const ws = build([rc('r1c1', { value: '1.00', part_count: 2, parts: [part('main', 'C2', '60'), part('main', 'C3', '40')],
    convert: { kind: 'eok', unit_from: '백만원', unit_to: '억원', divisor: 100, sum: '100', sub_sum: null, of: null, result: '1.00' } })]);
  const ui = bw.freshUi(); ui.sel = { t: 'A', key: 'r1c1' };
  const h = bw.statusHtml(ws, ui);
  assert.strictEqual((h.match(/class="bd-w-calc/g) || []).length, 3);   // 부품 2 + 환산 1
  const mainPart = h.slice(h.indexOf('bd-w-main'), h.indexOf('</span></span>') + 14);
  assert.ok(!mainPart.includes('표시 60'));
});

test('괄호 병기: 칸에 앞 값 + muted 괄호 값, 오른쪽 정렬, 읽기 이름', function () {
  const ws = build([rc('r1c1', { value: '5.00 (1.00)', main_value: '5.00', sub_value: '1.00' })]);
  const t = ws.tables[0], c = t.cells.r1c1;
  const h = bw.valueCellHtml(t, c, { fc: {} });
  assert.ok(h.includes('5.00 <span class="bd-w-paren">(1.00)</span>'), h);
  assert.ok(h.includes('bd-a-right'));
  assert.ok(bw.cellAria(t, c).includes('5.00, 괄호 안 1.00'));
  // 복사 값은 서버 문자열 그대로
  assert.ok(bw.tableCopy(ws, t).text.includes('5.00 (1.00)'));
});

test('괄호 병기: 고친 뒤에는 평문, 서버 문자열이 "main (sub)"가 아니면 평문', function () {
  const ws = build([rc('r1c1', { value: '5.00 (1.00)', main_value: '5.00', sub_value: '1.00' }),
    rc('r2c1', { value: '5.00 (1.00)', main_value: '5.00', sub_value: '2.00' })]);
  const t = ws.tables[0];
  assert.ok(!bw.valueCellHtml(t, t.cells.r2c1, { fc: {} }).includes('bd-w-paren'));
  const r = bw.editCell(ws, 'A', 'r1c1', '7 (1.00)');
  const t2 = r.ws.tables[0];
  const h = bw.valueCellHtml(t2, t2.cells.r1c1, { fc: {} });
  assert.ok(!h.includes('bd-w-paren') && h.includes('7 (1.00)'));
  assert.ok(bw.cellAria(t2, t2.cells.r1c1).includes('7 (1.00)'));
});

test('괄호 병기: 이스케이프(XSS)', function () {
  const X = '<img src=x onerror=alert(1)>';
  const ws = build([rc('r1c1', { value: X + ' ("><b>)', main_value: X, sub_value: '"><b>' })]);
  const t = ws.tables[0];
  const h = bw.valueCellHtml(t, t.cells.r1c1, { fc: {} });
  assert.ok(!h.includes('<img') && !h.includes('<b>'));
  assert.ok(h.includes('&lt;img') && h.includes('bd-w-paren'));
});

test('PART_EMPTY: "비어 있음"(muted), 사유 문구, 요약의 "그중 N칸은 엑셀 칸이 비어 있습니다."', function () {
  const ws = build([rc('r1c1', { status: 'failed', reason: 'PART_EMPTY', value: '' }),
    rc('r2c1', { status: 'failed', reason: 'NOT_NUMERIC', value: '' }),
    rc('r3c1', { value: '3' })]);
  const t = ws.tables[0];
  const h = bw.valueCellHtml(t, t.cells.r1c1, { fc: {} });
  assert.ok(h.includes('class="bd-w-miss bd-w-empty">비어 있음</span>'), h);
  assert.ok(bw.cellAria(t, t.cells.r1c1).includes('비어 있음'));
  const h2 = bw.valueCellHtml(t, t.cells.r2c1, { fc: {} });
  assert.ok(h2.includes('class="bd-w-miss">읽지 못함</span>') && !h2.includes('bd-w-empty'));
  assert.ok(texts(ws, 'r1c1', 'note').some(function (s) { return s.includes('엑셀의 해당 칸이 비어 있어 값을 채우지 않았습니다. 빈 칸은 0으로 계산하지 않습니다. 0이면 엑셀에 0을 넣어 다시 올리거나 여기서 직접 입력하세요.'); }));
  const y = bw.tally(ws);
  assert.strictEqual(y.failed, 2); assert.strictEqual(y.empty, 1);
  const s = bw.summaryHtml(ws);
  assert.ok(s.includes('2칸은 읽지 못했') && s.includes('그중 1칸은 엑셀 칸이 비어 있습니다.'));
  // 비어 있는 칸이 없으면 그 문장은 없다
  assert.ok(!bw.summaryHtml(build([rc('r1c1', { status: 'failed', reason: 'NOT_NUMERIC', value: '' })])).includes('그중'));
});

test('reasonText: PART_FAILED·NOT_NUMERIC, 행·열 못 찾음 계열은 한 문구, 모르는 코드는 일반 문구', function () {
  const nf = bw.reasonText('ROW_NOT_FOUND');
  ['ROW_MISSING', 'AREA_NOT_FOUND', 'HEADER_MISMATCH', 'COL_NOT_FOUND'].forEach(function (c) { assert.strictEqual(bw.reasonText(c), nf, c); });
  assert.ok(nf.includes('행·열을 찾지 못했습니다'));
  assert.ok(bw.reasonText('PART_FAILED').length > 0 && bw.reasonText('PART_FAILED') !== nf);
  assert.ok(bw.reasonText('NOT_NUMERIC').includes('숫자'));
  const g = bw.reasonText('SOMETHING_NEW');
  assert.ok(g.includes('직접 입력해 주세요') && g !== nf);
  assert.strictEqual(bw.reasonText(''), g); assert.strictEqual(bw.reasonText(null), g);
  const ws = build([rc('r1c1', { status: 'failed', reason: 'SOMETHING_NEW', value: '' })]);
  assert.ok(texts(ws, 'r1c1', 'note').some(function (s) { return s.startsWith('읽지 못함: ') && s.includes('직접 입력해 주세요'); }));
});

test('경고 문구: TEXT_NUMBER·EXTERNAL_REF·UNIT_MISMATCH·UNIT_UNKNOWN', function () {
  ['TEXT_NUMBER', 'EXTERNAL_REF', 'UNIT_MISMATCH', 'UNIT_UNKNOWN'].forEach(function (code) {
    const ws = build([rc('r1c1', { value: '1', warnings: [{ code: code }] })]);
    assert.strictEqual(texts(ws, 'r1c1', 'note').length, 1, code);
    const t = ws.tables[0];
    assert.ok(bw.cellInfo(t, t.cells.r1c1).need, code);
  });
});

test('manual: 비어 있으면 "직접 입력", 수정됨으로 세지 않고 filled로도 세지 않는다', function () {
  const ws = build([rc('r1c1', { status: 'manual', manual: true, source: { sheet: null, cell: null } }), rc('r2c1', { value: '2' })]);
  const t = ws.tables[0];
  const h = bw.valueCellHtml(t, t.cells.r1c1, { fc: {} });
  assert.ok(h.includes('bd-w-empty">직접 입력</span>'));
  assert.ok(bw.cellAria(t, t.cells.r1c1).includes('직접 입력'));
  assert.strictEqual(bw.cellInfo(t, t.cells.r1c1).unreadable, false);
  const r = bw.editCell(ws, 'A', 'r1c1', '77');
  const t2 = r.ws.tables[0];
  assert.strictEqual(t2.cells.r1c1.value, '77');
  assert.strictEqual(bw.cellInfo(t2, t2.cells.r1c1).edited, false);
  assert.ok(bw.valueCellHtml(t2, t2.cells.r1c1, { fc: {} }).includes('77'));
  const y = bw.tally(r.ws);
  assert.strictEqual(y.manual, 1); assert.strictEqual(y.filled, 1); assert.strictEqual(y.edited, 0); assert.strictEqual(y.failed, 0);
  assert.strictEqual(bw.draftBody(r.ws).tables[0].cells.r1c1, '77');
  assert.ok(bw.summaryHtml(ws).includes('직접 입력하는 칸 1칸'));
});

test('assumptions: UNIT_ASSUMED(confirmed!==true)는 단위별 한 번만 주의 목록에', function () {
  const ws = build([rc('r1c1', { value: '1' })], { assumptions: [
    { code: 'UNIT_ASSUMED', area: 'a', unit: '백만원', confirmed: false },
    { code: 'UNIT_ASSUMED', area: 'b', unit: '백만원', confirmed: false },
    { code: 'UNIT_ASSUMED', area: 'c', unit: '천원' },
    { code: 'UNIT_ASSUMED', area: 'd', unit: '원', confirmed: true },
    { code: 'OTHER', unit: '엑스' }] });
  const items = bw.warnItems(ws).filter(function (s) { return s.includes('가정'); });
  assert.strictEqual(items.length, 2);
  assert.ok(items[0].includes('백만원') && items[1].includes('천원'));
  assert.ok(bw.summaryHtml(ws).includes('주의 '));
});

test('기존 모양(parts 없음)은 이전과 같은 출력', function () {
  const ws = build([rc('r1c1', { value: '1,234', source: { sheet: '기부금', cell: 'C2', display: '1,234', raw: '1233.6', rounded: true } })]);
  assert.deepStrictEqual(lines(ws, 'r1c1').map(function (l) { return l.k + '|' + l.text; }), [
    'path|' + lines(ws, 'r1c1')[0].text, 'place|기부금 시트 C2', 'shown|표시 1,234 · 원래 값 1233.6']);
  const t = ws.tables[0];
  const h = bw.valueCellHtml(t, t.cells.r1c1, { fc: {} });
  assert.ok(h.includes('<span class="bd-w-v">1,234</span>') && !h.includes('bd-w-paren'));
  assert.ok(!bw.summaryHtml(ws).includes('그중') && !bw.summaryHtml(ws).includes('직접 입력하는 칸'));
  assert.strictEqual(bw.warnItems(ws).length, 0);
});

// ── board.js (표 화면) ───────────────────────────────────────
test('NUM_RE 확장: 괄호 병기·년 단위·음수는 숫자 칸, 글자는 아님', function () {
  ['5.00 (1.00)', '5.00 (-1.00)', '3.2년', '-400'].forEach(function (s) {
    const h = board.cellHtml({ text: s });
    assert.ok(h.includes('bd-num') && h.includes('bd-a-right'), s);
  });
  assert.ok(!board.cellHtml({ text: '가나' }).includes('bd-num'));
});

test('표 단위: unit이 있으면 caption 안에 bd-unit(이스케이프), 없으면 이전과 같다', function () {
  const t = { title: '수익', rows: [[{ text: '1' }]], unit: '억원' };
  assert.ok(board.tableHtml(t).includes('<caption>수익<span class="bd-unit">(단위: 억원)</span></caption>'));
  assert.ok(board.tableHtml({ title: '수익', rows: [], unit: '' }).includes('<caption>수익</caption>'));
  assert.ok(board.tableHtml({ title: '수익', rows: [] }).includes('<caption>수익</caption>'));
  const h = board.tableHtml({ title: 'T', rows: [], unit: '<b>x</b>' });
  assert.ok(!h.includes('<b>') && h.includes('&lt;b&gt;'));
});

test('th scope: 열 머리 col, 병합 머리 colgroup, 행 머리 row', function () {
  const h = board.tableHtml({ title: 'T', columns: ['가', '나'], rows: [
    [{ text: '구분', header: true }, { text: '합계', header: true, colspan: 2 }],
    [{ text: '예금', header: true, rowspan: 2 }, { text: '1' }, { text: '2' }]] });
  assert.ok(h.includes('<th class="bd-a-center" scope="col">구분</th>'), h);
  assert.ok(h.includes('scope="colgroup">합계</th>'));
  assert.ok(h.includes('scope="rowgroup">예금</th>'));
  assert.ok(board.tableHtml({ columns: ['가'], rows: [] }).includes('scope="col">가</th>'));
  assert.ok(board.cellHtml({ text: 'x', header: true }, 'row').includes('scope="row"'));
  assert.ok(board.cellHtml({ text: 'x', header: true }, '" onclick="x').includes('scope="col"'));
  assert.ok(!board.cellHtml({ text: 'x' }).includes('scope='));
});

test('버튼 줄: 샘플 워드 버튼 이름과 안내 문구(작성 권한 없으면 뒷문장 없음)', function () {
  const v = board.actionsHtml({ mode: 'view', hasDoc: true, canWrite: true });
  assert.ok(v.includes('>샘플 워드 내려받기</button>') && !v.includes('>워드 내려받기<'));
  assert.ok(v.includes('<p class="bd-legend">표의 숫자는 예시입니다. 틸 배경 칸은 엑셀 값이 들어가는 칸으로, [이 양식으로 작성]에서 엑셀을 올리면 채워집니다.</p>'));
  const n = board.actionsHtml({ mode: 'view', hasDoc: true, canWrite: false });
  assert.ok(n.includes('<p class="bd-legend">표의 숫자는 예시입니다.</p>'));
  assert.ok(board.actionsHtml({ mode: 'edit', hasDoc: true }).includes('disabled>샘플 워드 내려받기</button>'));
  assert.ok(!board.actionsHtml({ mode: 'view', hasDoc: false }).includes('bd-legend'));
  assert.ok(board.docHtml({ name: 'n', tables: [] }).includes('bd-doc-name'));
});
