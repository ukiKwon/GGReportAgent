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
function popUi(at, sel) { const ui = bw.freshUi(); ui.pop = { at: at || null, text: null, onlyEdited: false, note: '', err: false, last: null, ret: null }; ui.sel = sel || null; return ui; }
test('popHtml: 대화상자 역할·제목·시트 범위·표 이동 칩·고친 칸 버튼·닫기, 엑셀 원본 문구 없음', function () {
  const ws = state(), h = bw.popHtml(ws, popUi());
  assert.ok(h.includes('role="dialog" aria-modal="true" aria-labelledby="bd-src-title"'));
  assert.ok(h.includes('<h3 id="bd-src-title" title="수익성.xlsx">수익성 분석표 · 수익성.xlsx</h3>'));
  assert.ok(h.includes('S · A1:D5') && h.includes('T · A1:B1'));
  assert.ok(h.includes('data-w="srcjump" data-v="A" aria-label="A 표 원본으로 이동"'));
  assert.ok(/data-w="srcedited" aria-pressed="false" disabled>고친 칸만 표시 0</.test(h));
  assert.ok(h.includes('data-w="srcclose">닫기</button>'));
  assert.ok(!h.includes('엑셀 원본') && !h.includes('srcwide') && !h.includes('data-w="panel"'));
  assert.ok(h.includes('id="bd-w-srcbody" tabindex="0" role="region"') && h.includes('id="bd-src-edit"'));
});
test('srcBodyHtml: 시트별 표 하나씩·행 번호·표 시작 태그·원본 칸 roving(탭 정지 하나)·배지', function () {
  const ws = state(), h = bw.srcBodyHtml(ws, popUi());
  assert.strictEqual(h.split('id="bd-w-srcbody"').length, 2);
  assert.strictEqual(h.split('<table class="bd-w-srctbl"').length - 1, 2);   // 시트 S 하나 + 시트 T 하나
  assert.ok(h.includes('data-tstart="B"') && h.includes('class="bd-w-srctag"'));
  assert.ok(h.includes('class="is-text" title="가"') || h.includes('class="is-text" title="나"'));
  assert.strictEqual(h.split('<td ').length - 1 - h.split('tabindex="-1"').length + 1, 1, '탭 정지는 한 칸');
  assert.ok(h.includes('role="grid"') && h.includes('role="gridcell"'));
  assert.ok(!h.includes('is-src') && !h.includes('is-at') && !h.includes('data-n='), '고른 칸이 없으면 강조·배지(여러 칸에 쓰이는 칸 제외)가 없다');
});
test('srcBodyHtml: 칸을 고르면 그 칸 2px 강조·행/열 머리, 더해지는 칸은 is-part, 고쳐진 칸은 is-edsrc, 고친 칸만 표시', function () {
  const form = { form_id: 'f', name: 'f', tables: [ft('A')] };
  const c = { key: 'r0c0', value: '7', status: 'filled', reason: null, warnings: [], part_count: 2,
    parts: [{ role: 'main', sheet: 'S', cell: 'A1', display: '3', raw: '3', rounded: false }, { role: 'main', sheet: 'S', cell: 'B1', display: '4', raw: '4', rounded: false }],
    source: { sheet: 'S', cell: 'A1', display: '3', raw: '3', rounded: false } };
  let ws = bw.buildState(form, { tables: [{ ref: 'A', needs_review: false, label_mismatches: [], sums: [], cells: [c] }],
    sources: [src('A', 'S', 1, ['A', 'B'], [['3', '4']])] }, { fileName: 'a.xlsx' });
  const at = bw.popAtFor(bw.mergeSources(ws), ws, { t: 'A', key: 'r0c0' });
  assert.deepStrictEqual(at, { s: 0, r: 0, c: 0 });   // 주 원본 주소 A1
  let h = bw.srcBodyHtml(ws, popUi(at, { t: 'A', key: 'r0c0' }));
  assert.ok(/data-a="A1"[^>]*aria-selected="true"/.test(h) && h.includes('class="is-src"'));
  assert.ok(h.includes('class="is-part"'), '함께 더해지는 B1');
  assert.ok(h.includes('<th scope="row" class="is-srcrow">') && h.includes('<th scope="col" class="is-srccol">A</th>'));
  assert.ok(!h.includes('is-edsrc'));
  ws = bw.editCell(ws, 'A', 'r0c0', '8').ws;
  const ui = popUi(at, { t: 'A', key: 'r0c0' });
  h = bw.srcBodyHtml(ws, ui);
  assert.ok(h.includes('is-edsrc'));
  assert.ok(h.includes('>3</td>') && h.includes('>4</td>'), '원본 엑셀 값은 그대로 보인다(이사회 값 8이 아니다)');
  ui.pop.onlyEdited = true;
  assert.ok(bw.srcBodyHtml(ws, ui).includes('<table class="bd-w-srctbl is-only-edited"'));
  assert.ok(/data-w="srcedited" aria-pressed="true">고친 칸만 표시 1</.test(bw.popHtml(ws, ui)));
});
test('원본 칸 하나가 이사회 칸 여럿에 쓰이면 data-own·배지 숫자·라디오로 대상을 고른다, 한 개면 목록 없이 바로', function () {
  const form = { form_id: 'f', name: 'f', tables: [ft('A'), ft('B')] };
  const g = function (ref) { return src(ref, 'S', 1, ['A'], [['5']]); };
  let ws = bw.buildState(form, { tables: [rt('A', 'A1'), rt('B', 'A1')], sources: [g('A'), g('B')] }, { fileName: 'a.xlsx' });
  const sheets = bw.mergeSources(ws);
  let ui = popUi(null, null);
  const at = { s: 0, r: 0, c: 0 };
  bw.popSelect(ws, ui, sheets, at);
  assert.deepStrictEqual(ui.sel, { t: 'A', key: 'r0c0' }, '후보가 여럿이면 첫 후보');
  assert.ok(bw.srcBodyHtml(ws, ui).includes('data-n="2"'));
  let h = bw.popEditHtml(ws, ui);
  assert.ok(h.includes('이 칸을 쓰는 이사회 칸 2개') && h.includes('role="radiogroup"'));
  assert.strictEqual(h.split('type="radio"').length - 1, 2);
  assert.ok(/data-v="A\|r0c0" checked/.test(h) && !/data-v="B\|r0c0" checked/.test(h));
  ui.sel = { t: 'B', key: 'r0c0' };
  bw.popSelect(ws, ui, sheets, at);
  assert.deepStrictEqual(ui.sel, { t: 'B', key: 'r0c0' }, '이미 후보 안에 있는 선택은 지킨다');
  // 고치면 고른 이사회 칸이 속한 표만 확인이 풀린다
  ws = bw.toggleCheck(bw.toggleCheck(ws, 'A', '나', '10:00'), 'B', '나', '10:01');
  const r = bw.popCommit(ws, ui.sel, '9');
  assert.strictEqual(r.changed, true);
  assert.ok(bw.findT(r.ws, 'A').checked && !bw.findT(r.ws, 'B').checked);
  assert.strictEqual(r.ws.done, null);
  // 후보 하나 · 쓰이지 않는 칸
  const one = state();
  ui = popUi(null, null);
  bw.popSelect(one, ui, bw.mergeSources(one), { s: 0, r: 0, c: 0 });   // A1 은 어느 표도 쓰지 않는 칸
  assert.strictEqual(ui.sel, null);
  assert.ok(bw.popEditHtml(one, ui).includes('이 칸은 이사회 자료에 쓰지 않습니다.') && !bw.popEditHtml(one, ui).includes('bd-src-in'));
  bw.popSelect(one, ui, bw.mergeSources(one), { s: 0, r: 3, c: 1 });   // B4 = 표 A
  h = bw.popEditHtml(one, ui);
  assert.ok(h.includes('이 칸을 쓰는 이사회 칸 1개') && !h.includes('type="radio"') && h.includes('id="bd-src-in"'));
});
test('popEditHtml: 안내 문구가 맨 위, 입력 라벨·적용·취소, 수정되면 사유(선택)·원본 값으로, 결과 알림 role=status', function () {
  const ws = state(), sheets = bw.mergeSources(ws);
  const ui = popUi({ s: 0, r: 3, c: 1 }, { t: 'A', key: 'r0c0' });
  let h = bw.popEditHtml(ws, ui);
  assert.ok(h.indexOf('엑셀 파일은 바뀌지 않습니다. 고친 값은 이사회 자료에만 들어갑니다.') < h.indexOf('S 시트 B4'));
  assert.ok(h.includes('S 시트 B4 · 표시 2,000'));
  assert.ok(h.includes('<label class="bd-src-lab" for="bd-src-in">이사회 자료에 넣을 값</label>') && h.includes('data-w="srcapply">적용</button>') && h.includes('data-w="srccancel">취소</button>'));
  assert.ok(!h.includes('data-w="srcrevert"') && !h.includes('수정 사유(선택)'));
  assert.ok(h.includes('id="bd-src-note" role="status"'));
  const ed = bw.editCell(ws, 'A', 'r0c0', '9').ws;
  h = bw.popEditHtml(ed, ui);
  assert.ok(h.includes('수정 사유(선택)') && h.includes('role="radiogroup" aria-label="수정 사유"') && h.includes('data-w="srcrevert">원본 값으로</button>'));
  assert.ok(h.includes('수정됨 · 원본 1') && h.includes('value="9"'));
  ui.pop.note = '숫자가 아닙니다'; ui.pop.err = true; ui.pop.text = '<x';
  h = bw.popEditHtml(ws, ui);
  assert.ok(h.includes('role="alert"') && h.includes('aria-invalid="true"') && h.includes('value="&lt;x"'));
  assert.ok(sheets.length === 2);
});
test('popCommit: 이사회 칸만 바뀌고 원본 값(orig·src)은 그대로, 문구·조사·재검산·표 확인 풀림', function () {
  const form = { form_id: 'f', name: 'f', tables: [{ id: 'B', ref: 'B', mapping: 'B', title: '5. 수익성 분석', rows: [
    [{ key: 'h', text: '구분', header: true }, { key: 'h1', text: '총기대수익', header: true }],
    [{ key: 'l', text: '명목가치' }, { key: 'n1', text: '0', mapped: true }]], notes: [] }] };
  const c = { key: 'n1', value: '48.51', status: 'filled', reason: null, warnings: [], source: { sheet: 'S', cell: 'K54', display: '4,851.4', raw: '4851.41951', rounded: true },
    convert: { kind: 'eok', unit_from: '백만원', unit_to: '억원', divisor: 100, sum: '4851.41951', sub_sum: null, of: null, result: '48.51' } };
  let ws = bw.buildState(form, { tables: [{ ref: 'B', needs_review: false, label_mismatches: [], sums: [], cells: [c] }], sources: [] }, { fileName: 'a.xlsx' });
  ws = bw.toggleCheck(ws, 'B', '전산팀 마스터', '14:32');
  const sel = { t: 'B', key: 'n1' };
  const r = bw.popCommit(ws, sel, ' 49.00 ');
  assert.strictEqual(r.note, '명목가치 총기대수익을 48.51에서 49.00으로 고쳤습니다. ‘5. 수익성 분석’ 표의 확인을 풀었습니다.');
  const t = bw.findT(r.ws, 'B');
  assert.strictEqual(t.cells.n1.value, '49.00'); assert.strictEqual(t.cells.n1.orig, '48.51'); assert.strictEqual(t.cells.n1.src.raw, '4851.41951');
  assert.strictEqual(t.checked, null);
  assert.deepStrictEqual(t.relNote, { label: '명목가치 총기대수익', from: '48.51', to: '49.00' });
  assert.strictEqual(bw.popCommit(r.ws, sel, '49.00').note, '값이 같아 바꾸지 않았습니다.');
  assert.strictEqual(bw.popCommit(r.ws, sel, 'a\nb').error, true);
  assert.strictEqual(bw.popCommit(ws, { t: 'X', key: 'q' }, '1').changed, false);
  assert.strictEqual(bw.popCommit(r.ws, sel, '48.51').changed, true, '원래 값으로 돌아오기');
  assert.strictEqual(bw.josaEul('총기대수익'), '을'); assert.strictEqual(bw.josaEul('총소요비용'), '을'); assert.strictEqual(bw.josaEul('합계'), '를');
  assert.strictEqual(bw.josaEuro('49.00'), '으로'); assert.strictEqual(bw.josaEuro('48.51'), '로'); assert.strictEqual(bw.josaEuro('48.57'), '로'); assert.strictEqual(bw.josaEuro('48.53'), '으로');
});
test('popCommit: 원본 값으로 되돌리면 "원본 값 X로 되돌렸습니다", 일반 수정은 "A에서 B로 고쳤습니다"', function () {
  const form = { form_id: 'f', name: 'f', tables: [{ id: 'B', ref: 'B', mapping: 'B', title: '5. 수익성 분석', rows: [
    [{ key: 'h', text: '구분', header: true }, { key: 'h1', text: '총기대수익', header: true }],
    [{ key: 'l', text: '명목가치' }, { key: 'n1', text: '0', mapped: true }]], notes: [] }] };
  const c = { key: 'n1', value: '36.85', status: 'filled', reason: null, warnings: [], source: { sheet: 'S', cell: 'K54', display: '3,685', raw: '3685', rounded: false } };
  const ws = bw.buildState(form, { tables: [{ ref: 'B', needs_review: false, label_mismatches: [], sums: [], cells: [c] }], sources: [] }, { fileName: 'a.xlsx' });
  const sel = { t: 'B', key: 'n1' };
  const r1 = bw.popCommit(ws, sel, '36.90');
  assert.ok(r1.note.startsWith('명목가치 총기대수익을 36.85에서 36.90으로 고쳤습니다.'), r1.note);
  const cur = bw.findT(r1.ws, 'B').cells.n1;
  const r2 = bw.popCommit(r1.ws, sel, cur.orig);
  assert.ok(r2.changed && r2.note.startsWith('명목가치 총기대수익을 원본 값 36.85로 되돌렸습니다.'), r2.note);
  assert.ok(!/에서/.test(r2.note));
});
test('srcBodyHtml: 이사회 쪽에서 고쳐진 원본 칸의 aria-label 에 "이사회 쪽 수정됨"', function () {
  const form = { form_id: 'f', name: 'f', tables: [ft('A')] };
  const c = { key: 'r0c0', value: '7', status: 'filled', reason: null, warnings: [], source: { sheet: 'S', cell: 'A1', display: '3', raw: '3', rounded: false } };
  let ws = bw.buildState(form, { tables: [{ ref: 'A', needs_review: false, label_mismatches: [], sums: [], cells: [c] }],
    sources: [src('A', 'S', 1, ['A', 'B'], [['3', '4']])] }, { fileName: 'a.xlsx' });
  assert.ok(!bw.srcBodyHtml(ws, popUi()).includes('이사회 쪽 수정됨'));
  ws = bw.editCell(ws, 'A', 'r0c0', '8').ws;
  const h = bw.srcBodyHtml(ws, popUi());
  assert.ok(/data-a="A1"[^>]*aria-label="[^"]*이사회 쪽 수정됨"/.test(h), h);
  assert.ok(!/data-a="B1"[^>]*이사회 쪽 수정됨/.test(h), '쓰지 않는 B1 에는 없다');
});
test('popEscAction: 입력 안 Esc 는 입력 취소(팝업 유지), 밖은 닫기', function () {
  assert.strictEqual(bw.popEscAction({ input: true }), 'input');
  assert.strictEqual(bw.popEscAction({ input: false }), 'close');
  assert.strictEqual(bw.popEscAction(null), 'close');
});
test('popAtFor: 선택 칸의 주 원본 위치, 선택이 없거나 원본이 없으면 null', function () {
  const ws = state(), sheets = bw.mergeSources(ws);
  assert.deepStrictEqual(bw.popAtFor(sheets, ws, { t: 'B', key: 'r0c0' }), { s: 0, r: 1, c: 2 });   // C2
  assert.deepStrictEqual(bw.popAtFor(sheets, ws, { t: 'C', key: 'r0c0' }), { s: 1, r: 0, c: 0 });   // 시트 T A1
  assert.strictEqual(bw.popAtFor(sheets, ws, null), null);
  assert.strictEqual(bw.popAtFor(sheets, ws, { t: 'Z', key: 'r0c0' }), null);
  assert.deepStrictEqual(bw.popCands(sheets, { s: 0, r: 1, c: 2 }), [{ t: 'B', key: 'r0c0' }]);
  assert.deepStrictEqual(bw.popCands(sheets, null), []);
});
