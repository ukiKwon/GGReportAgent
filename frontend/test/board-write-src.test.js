const test = require('node:test');
const assert = require('node:assert');
const bw = require('../js/board-write.js');
require('../js/board.js');   // setLabeler 연결

function ft(id) { return { id: id, ref: id, mapping: id, title: id, columns: 1, notes: [], rows: [[{ key: 'r0c0', text: id, mapped: true }]] }; }
function rt(ref, cell) {
  return { ref: ref, needs_review: false, label_mismatches: [], sums: [],
    cells: [{ key: 'r0c0', value: '1', status: 'filled', reason: null, warnings: [], source: { sheet: 'S', cell: cell, display: '1', raw: null, rounded: null } }] };
}
function src(ref, sheet, firstRow, cols, rows) { return { ref: ref, sheet: sheet, range: '', first_row: firstRow, cols: cols, rows: rows, merges: [] }; }
function state() {
  const form = { form_id: 'f', name: 'f', tables: [ft('A'), ft('B'), ft('C')] };
  const resp = { tables: [rt('A', 'B4'), rt('B', 'C2'), rt('C', 'A1')], sources: [
    src('A', 'S', 3, ['A', 'B', 'C'], [['가', '1', ''], ['나', '2,000', '']]),
    src('B', 'S', 1, ['A', 'B', 'C', 'D'], [['', '', '', ''], ['', '', '3', ''], ['', '', '', ''], ['', '', '', ''], ['', '', '', 'x']]),
    src('C', 'T', 1, ['A', 'B'], [['z', '9']])], warnings: [], unmapped_tables: [] };
  return bw.buildState(form, resp, { fileName: '수익성.xlsx', formId: 'f' });
}

test('mergeSources: 같은 시트는 합집합 격자 하나, 다른 시트는 따로', function () {
  const m = bw.mergeSources(state());
  assert.strictEqual(m.length, 2);
  const s = m[0];
  assert.strictEqual(s.sheet, 'S');
  assert.strictEqual(s.range, 'A1:D5');
  assert.strictEqual(s.first_row, 1);
  assert.deepStrictEqual(s.cols, ['A', 'B', 'C', 'D']);
  assert.strictEqual(s.rows.length, 5);
  assert.strictEqual(s.rows[2][0], '가');          // A3
  assert.strictEqual(s.rows[3][1], '2,000');       // B4
  assert.strictEqual(s.rows[1][2], '3');           // C2
  assert.strictEqual(m[1].sheet, 'T');
  assert.strictEqual(m[1].range, 'A1:B1');
});
test('mergeSources: 표 태그 범위와 srcIndex 좌표 재계산', function () {
  const s = bw.mergeSources(state())[0];
  assert.deepStrictEqual(s.tags.map(function (t) { return [t.ref, t.r0, t.c0, t.r1, t.c1]; }), [['A', 2, 0, 3, 2], ['B', 0, 0, 4, 3]]);
  assert.deepStrictEqual(s.owners['3,1'], [{ t: 'A', key: 'r0c0' }]);   // B4
  assert.deepStrictEqual(s.owners['1,2'], [{ t: 'B', key: 'r0c0' }]);   // C2
  assert.strictEqual(Object.keys(s.owners).length, 2);
});
test('mergeSources: 격자 없는 표·빈 입력', function () {
  assert.deepStrictEqual(bw.mergeSources(null), []);
  assert.deepStrictEqual(bw.mergeSources({ tables: [{ ref: 'X', grid: null, srcIndex: {} }] }), []);
});
test('mergeSources: 같은 원본 칸을 두 표가 가리키면 소유자 둘', function () {
  const form = { form_id: 'f', name: 'f', tables: [ft('A'), ft('B')] };
  const g = function (ref) { return src(ref, 'S', 1, ['A'], [['5']]); };
  const ws = bw.buildState(form, { tables: [rt('A', 'A1'), rt('B', 'A1')], sources: [g('A'), g('B')] }, {});
  const s = bw.mergeSources(ws)[0];
  assert.deepStrictEqual(s.owners['0,0'].map(function (o) { return o.t; }), ['A', 'B']);
  assert.strictEqual(bw.ownsCell('A|r0c0 B|r0c0', 'A', 'r0c0', { t: 'B', key: 'r0c0' }), true);
  assert.strictEqual(bw.ownsCell(null, 'A', 'r0c0', { t: 'B', key: 'r0c0' }), false);
  assert.strictEqual(bw.ownsCell(null, 'A', 'r0c0', { t: 'A', key: 'r0c0' }), true);
  assert.strictEqual(bw.ownsCell(null, 'A', '', { t: 'A', key: '' }), false);
  assert.strictEqual(bw.ownsCell(null, 'A', 'r0c0', null), false);
});
test('srcKind: 숫자·빈 칸은 num, 문장은 text', function () {
  ['1,234', '(1,234)', '-5', '△5', '12.5%', '1,234원', '', '  ', null].forEach(function (v) { assert.strictEqual(bw.srcKind(v), 'num', String(v)); });
  ['기관명', '출연금 합계', '2026년 계획', 'N/A', '가 1'].forEach(function (v) { assert.strictEqual(bw.srcKind(v), 'text', v); });
});
test('centerAxis·centerScroll: 가운데로, 이미 보이면 그대로, 끝은 자른다', function () {
  // 보이는 길이 300, 고정 머리 20, 최대 스크롤 700
  assert.strictEqual(bw.centerAxis(0, 100, 20, 300, 20, 700), 0);       // 완전히 보임
  assert.strictEqual(bw.centerAxis(0, 500, 20, 300, 20, 700), 350);     // 칸 중심 510 = 보이는 띠 [370,650]의 가운데
  assert.strictEqual(bw.centerAxis(400, 405, 20, 300, 20, 700), 255);   // 고정 머리에 가려진 칸은 움직인다
  assert.strictEqual(bw.centerAxis(0, 900, 20, 300, 20, 700), 700);     // 끝에서 자름
  assert.strictEqual(bw.centerAxis(500, 10, 20, 300, 20, 700), 0);      // 처음에서 자름
  const to = bw.centerScroll({ st: 0, sl: 0, w: 400, h: 300, sw: 1000, sh: 1000, lead: { top: 20, left: 40 }, cell: { top: 500, left: 700, w: 60, h: 20 } });
  assert.deepStrictEqual(to, { top: 350, left: 510 });
  const same = bw.centerScroll({ st: 50, sl: 60, w: 400, h: 300, sw: 1000, sh: 1000, lead: { top: 20, left: 40 }, cell: { top: 100, left: 200, w: 60, h: 20 } });
  assert.deepStrictEqual(same, { top: 50, left: 60 });
});
test('alignScroll: 표 점프는 첫 행·열을 고정 머리 바로 아래로', function () {
  assert.strictEqual(bw.alignScroll(500, 20, 300, 1000), 480);
  assert.strictEqual(bw.alignScroll(10, 20, 300, 1000), 0);
  assert.strictEqual(bw.alignScroll(950, 20, 300, 1000), 700);
});
test('stackMode: 패널이 360px 미만이면 세로 배치', function () {
  assert.strictEqual(bw.stackMode(1000, false, true), false);   // 986*2/5 = 394
  assert.strictEqual(bw.stackMode(900, false, true), true);     // 354
  assert.strictEqual(bw.stackMode(900, true, true), false);     // 531
  assert.strictEqual(bw.stackMode(600, true, true), true);      // 351
  assert.strictEqual(bw.stackMode(300, false, false), false);   // 접힘
  assert.strictEqual(bw.stackMode(0, false, true), false);
});
test('gridClass: 접힘 > 넓게 > 기본', function () {
  assert.strictEqual(bw.gridClass({ panelOpen: true, wide: false }), 'bd-w-grid');
  assert.strictEqual(bw.gridClass({ panelOpen: true, wide: true }), 'bd-w-grid is-wide');
  assert.strictEqual(bw.gridClass({ panelOpen: false, wide: true }), 'bd-w-grid is-one');
});
test('sourceHtml: 머리·점프 버튼·넓게 보기 aria-pressed·스크롤 영역 하나', function () {
  const ws = state(), ui = bw.freshUi();
  let h = bw.sourceHtml(ws, ui);
  assert.ok(h.includes('id="bd-w-src"') && h.includes('class="bd-w-srchead"'));
  assert.ok(h.includes('data-w="srcwide" aria-pressed="false"'));
  assert.ok(h.includes('id="bd-w-srcbody" tabindex="0" role="region" aria-label="엑셀 원본 표, 방향키로 스크롤"'));
  assert.strictEqual(h.split('id="bd-w-srcbody"').length, 2);
  assert.strictEqual(h.split('<table class="bd-w-srctbl"').length - 1, 2);   // 시트 S 하나 + 시트 T 하나
  assert.ok(h.includes('data-w="srcjump" data-v="A" aria-label="A 표 원본으로 이동"'));
  assert.ok(h.includes('data-w="srcsel" disabled'));
  assert.ok(!h.includes('aria-current'));
  assert.ok(h.includes('data-tstart="B"') && h.includes('class="bd-w-srctag"'));
  assert.ok(h.includes('class="is-text" title="가"') || h.includes('class="is-text" title="나"'));
  ui.wide = true; ui.sel = { t: 'A', key: 'r0c0' };
  h = bw.sourceHtml(ws, ui);
  assert.ok(h.includes('data-w="srcwide" aria-pressed="true"'));
  assert.ok(/data-v="A"[^>]*aria-current="true"/.test(h) && !/data-v="B"[^>]*aria-current/.test(h));
  assert.ok(!h.includes('data-w="srcsel" disabled'));
  assert.ok(h.includes('class="is-src"') && h.includes('<th scope="row" class="is-srcrow">'));
  assert.ok(h.includes('data-st="A" data-key="r0c0" class="is-src"'));
});
test('sourceHtml: 접힌 패널은 머리만, 원본 칸은 탭 순서에 없다', function () {
  const ui = bw.freshUi(); ui.panelOpen = false;
  const h = bw.sourceHtml(state(), ui);
  assert.ok(h.includes('is-folded') && !h.includes('bd-w-srcbody') && h.includes('원본 펼치기'));
  assert.ok(!/<td[^>]*tabindex/.test(bw.sourceHtml(state(), bw.freshUi())));
});
