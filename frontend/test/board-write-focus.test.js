const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const bw = require('../js/board-write.js');
const board = require('../js/board.js');   // 칸 이름 연결(setLabeler)
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// ── 표 B 실제 모양: 머리 행 '구분'(2칸) · 1열 2~3행 병합 빈 칸 · 명목가치/현재가치 행 ──
function formB() {
  const V = function (k) { return { key: k, text: '0', mapped: true }; };
  return { form_id: 'f', name: '양식', tables: [
    { id: 'B', ref: 'B', mapping: 'B', title: '5. 수익성 분석', columns: 4, notes: [],
      rows: [[{ key: 'h0', text: '구분', header: true, colspan: 2 }, { key: 'h1', text: '총기대수익', header: true }, { key: 'h2', text: '총소요비용', header: true }],
             [{ key: 'b00', text: '', rowspan: 2 }, { key: 'b01', text: '명목가치' }, V('n1'), V('n2')],
             [{ key: 'b11', text: '현재가치' }, V('p1'), V('p2')]] }] };
}
function rc(key, over) {
  return Object.assign({ key: key, value: '48.51', status: 'filled', reason: null, warnings: [],
    source: { sheet: '수익성', cell: 'K54', display: '4,851.4', raw: '4851.4', rounded: false },
    convert: { kind: 'eok', unit_from: '백만원', unit_to: '억원', divisor: 100, sum: '4851.4', sub_sum: null, of: null, result: '48.51' } }, over || {});
}
function part(cell, display) { return { role: 'main', sheet: '수익성', cell: cell, display: display, raw: display.replace(/,/g, ''), rounded: false }; }
function wsB() {
  const cells = [rc('n1'), rc('n2', { value: '30.00' }), rc('p1', { value: '44.00' }), rc('p2', { value: '29.00' })];
  return bw.buildState(formB(), { tables: [{ ref: 'B', needs_review: false, label_mismatches: [], sums: [], cells: cells }], sources: [], warnings: [] }, { fileName: 'a.xlsx', formId: 'f' });
}

test('표 B 칸 이름: 행 이름(명목가치/현재가치)이 들어가 두 칸이 값이 아니라 이름으로 구별된다', function () {
  const t = board.cellLabel({ title: '5. 수익성 분석', columns: 4, rows: formB().tables[0].rows, cells: {} }, 1, 2);
  assert.strictEqual(t, '5. 수익성 분석 · 명목가치 · 총기대수익');
  const ws = wsB(), tb = ws.tables[0];
  assert.strictEqual(bw.cellAria(tb, tb.cells.n1), '5. 수익성 분석, 명목가치, 총기대수익, 48.51, 미확인');
  assert.strictEqual(bw.cellAria(tb, tb.cells.p1), '5. 수익성 분석, 현재가치, 총기대수익, 44.00, 미확인');
  assert.strictEqual(bw.cellAria(tb, tb.cells.p2), '5. 수익성 분석, 현재가치, 총소요비용, 29.00, 미확인');
  assert.notStrictEqual(bw.cellAria(tb, tb.cells.n1), bw.cellAria(tb, tb.cells.p1));
});

test('대조 첫 줄: 한 칸은 "표시값 단위 ← 주소 엑셀값 단위", 여러 칸은 "← 주소 외 N칸 합", 단위를 모르면 생략', function () {
  const ws = bw.buildState(formB(), { tables: [{ ref: 'B', needs_review: false, label_mismatches: [], sums: [], cells: [
    rc('n1'),
    rc('n2', { value: '20.77', part_count: 4, parts: [part('K45', '1,000'), part('K46', '2'), part('K47', '3'), part('K48', '4')] }),
    rc('p1', { value: '5', convert: null, source: { sheet: '수익성', cell: 'C2', display: '5', raw: '5', rounded: false } }),
    rc('p2', { value: '', source: { sheet: '수익성', cell: 'C3', display: '', raw: null, rounded: null } })] }], sources: [], warnings: [] }, {});
  const t = ws.tables[0];
  assert.strictEqual(bw.compareLine(t, t.cells.n1), '48.51 억원 ← K54 4,851.4 백만원');
  assert.strictEqual(bw.compareLine(t, t.cells.n2), '20.77 억원 ← K45 외 3칸 합');
  assert.strictEqual(bw.compareLine(t, t.cells.p1), '5 ← C2 5');
  assert.strictEqual(bw.compareLine(t, t.cells.p2), '');
  assert.strictEqual(bw.compareLine(t, null), '');
  // 상태 줄 첫 줄 · 기존 둘째 줄(합 … ÷ 100 = …) 유지
  const ui = bw.freshUi(); ui.sel = { t: 'B', key: 'n1' };
  const h = bw.statusHtml(ws, ui);
  assert.ok(h.indexOf('<div class="bd-w-cmp mono">48.51 억원 ← K54 4,851.4 백만원</div>') === 0);
  assert.ok(h.includes('합 4,851.4 백만원 ÷ 100 = 48.51 억원'));
});

test('알림 줄(aria-live): 대조 첫 줄과 같으면 화면에서는 숨기고 읽어 주기만 한다', function () {
  const ws = wsB(), t = ws.tables[0], ui = bw.freshUi();
  ui.sel = { t: 'B', key: 'n1' }; ui.live = bw.compareLine(t, t.cells.n1);
  assert.strictEqual(bw.liveClass(ws, ui), 'bd-w-live is-sr');
  ui.live = '읽지 못한 칸은 값을 넣은 뒤에 확인할 수 있습니다.';
  assert.strictEqual(bw.liveClass(ws, ui), 'bd-w-live');
  const w = bw.writeHtml(ws, Object.assign(bw.freshUi(), { sel: { t: 'B', key: 'n1' }, live: '48.51 억원 ← K54 4,851.4 백만원' }));
  assert.ok(/id="bd-w-live" class="bd-w-live is-sr" role="status" aria-live="polite">48\.51 억원 ← K54 4,851\.4 백만원</.test(w));
});

test('선택 해제(Esc): 지난 대조 문구는 비우고 낭독 전용 해제 안내만 남으며 화면에는 보이지 않는다', function () {
  const ws = wsB(), t = ws.tables[0], ui = bw.freshUi();
  ui.sel = { t: 'B', key: 'n1' }; ui.live = bw.compareLine(t, t.cells.n1);
  bw.releaseSel(ui);
  assert.strictEqual(ui.sel, null);
  assert.notStrictEqual(ui.live, '48.51 억원 ← K54 4,851.4 백만원');
  assert.strictEqual(ui.live, '선택을 해제했습니다.');
  assert.strictEqual(bw.liveClass(ws, ui), 'bd-w-live is-sr');
  const w = bw.writeHtml(ws, ui);
  assert.ok(!w.includes('K54 4,851.4'));
  assert.ok(/id="bd-w-live" class="bd-w-live is-sr"[^>]*>선택을 해제했습니다\.</.test(w));
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'board-write.js'), 'utf8');
  assert.ok(/a === 'sel'\) \{ bw\.releaseSel\(ui\)/.test(src));
});

test('창 크기 보정: resize 처리에서 측정(measureSrc) 뒤에 선택 칸 보정(keepVisible)을 한다', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'board-write.js'), 'utf8');
  const i = src.indexOf('function realignSrc()');
  assert.ok(i > 0);
  const body = src.slice(i, src.indexOf('window.addEventListener(\'resize\'', i));
  const m = body.indexOf('measureSrc()'), k = body.indexOf('keepVisible('), r = body.indexOf('bw.resizeRealign(');
  assert.ok(m >= 0 && k > m, '측정 → 보정 순서');
  assert.ok(k < r, 'resizeRealign 이 false 여도(원본을 직접 스크롤한 직후) 가림 보정은 한다');
  assert.ok(/if \(ui\.sel\)/.test(body.slice(m - 20, k)));
});

test('표 A 칸 이름: 첫 열이 값 칸(기관명 rowspan 4)이어도 네 행이 서로 다른 행 이름을 갖는다', function () {
  const M = function (k, x, e) { return Object.assign({ key: k, text: x, mapped: true }, e); };
  const L = function (k, x, e) { return Object.assign({ key: k, text: x }, e); };
  const rows = [[{ key: 'h0', text: '기관명', header: true }, { key: 'h1', text: '구분', header: true }, { key: 'h2', text: '제공금액', header: true }, { key: 'h3', text: '비고', header: true }],
    [M('a_org', '대한민국 기관', { rowspan: 4 }), L('a_l1', '출연금'), M('v1', '0'), L('a_n1', '', { rowspan: 3 })],
    [L('a_l2', '예비비'), M('v2', '0')],
    [L('a_l3', '전산시스템 구축/운영비용'), M('v3', '0')],
    [L('a_l4', '합계'), M('v4', '0'), L('a_n4', '')]];
  const t = { title: '표 제목', columns: 4, rows: rows, cells: {} };
  const labels = [[1, 2], [2, 1], [3, 1], [4, 1]].map(function (p) { return board.cellLabel(t, p[0], p[1]); });
  assert.deepStrictEqual(labels, ['표 제목 · 출연금 · 제공금액', '표 제목 · 예비비 · 제공금액', '표 제목 · 전산시스템 구축/운영비용 · 제공금액', '표 제목 · 합계 · 제공금액']);
  assert.strictEqual(new Set(labels).size, 4);
  // 첫 열 값 칸 자신은 행 이름이 자기 글자로 새지 않는다
  assert.ok(!board.cellLabel(t, 1, 0).includes('대한민국 기관'));
  // 값 칸 뒤에 '비고'만 남는 모양은 행 이름이 아니다(회귀)
  const only = { title: 'O', columns: 3, cells: {}, rows: [[{ key: 'o0', text: '값', header: true }, { key: 'o1', text: '값2', header: true }, { key: 'o2', text: '비고', header: true }],
    [M('o3', '1'), M('o4', '2'), L('o5', '비고 문구')]] };
  assert.ok(!board.cellLabel(only, 1, 1).includes('비고 문구'));
});

test('선택 상태 클래스: 선택이 있으면 격자·카드·상태 줄·원본 열 머리, 해제하면 모두 없다', function () {
  const ws = wsB();
  const ui = bw.freshUi();
  const off = bw.writeHtml(ws, ui);
  assert.ok(!off.includes('is-focusing') && !off.includes('has-sel') && !off.includes('is-srccol'));
  ui.sel = { t: 'B', key: 'n1' };
  const on = bw.writeHtml(ws, ui);
  assert.ok(on.includes('class="bd-w-grid is-focusing"'));
  assert.ok(on.includes('<section class="bd-card bd-w-card has-sel" data-t="B"'));
  assert.ok(on.includes('id="bd-w-status" class="bd-w-status is-focusing"'));
  assert.strictEqual(bw.gridClass({ panelOpen: true, wide: true, sel: { t: 'B', key: 'n1' } }), 'bd-w-grid is-wide is-focusing');
  ui.sel = null;
  assert.ok(!bw.writeHtml(ws, ui).includes('is-focusing'));
});

test('원본 열 머리: 선택 칸이 있는 열의 thead th 에 is-srccol', function () {
  const L = function (id) { return { id: id, ref: id, mapping: id, title: id, columns: 1, notes: [], rows: [[{ key: 'r0c0', text: id, mapped: true }]] }; };
  const form = { form_id: 'f', name: 'f', tables: [L('A'), L('B')] };
  const c = function (cell) { return { key: 'r0c0', value: '1', status: 'filled', reason: null, warnings: [], source: { sheet: 'S', cell: cell, display: '1', raw: null, rounded: null } }; };
  const g = function (ref) { return { ref: ref, sheet: 'S', range: '', first_row: 1, cols: ['A', 'B', 'C', 'D'], rows: [['', '', '', ''], ['', '', '3', '']], merges: [] }; };
  const ws = bw.buildState(form, { tables: [{ ref: 'A', needs_review: false, label_mismatches: [], sums: [], cells: [c('A1')] },
    { ref: 'B', needs_review: false, label_mismatches: [], sums: [], cells: [c('C2')] }], sources: [g('A'), g('B')], warnings: [] }, {});
  const ui = bw.freshUi();
  assert.ok(!bw.sourceHtml(ws, ui).includes('is-srccol'));
  ui.sel = { t: 'B', key: 'r0c0' };
  const h = bw.sourceHtml(ws, ui);
  assert.ok(h.includes('<th scope="col" class="is-srccol">C</th>'));
  assert.strictEqual(h.split('is-srccol').length - 1, 1);
  assert.ok(h.includes('<th scope="col">A</th>'));
});

test('창 크기 변경 뒤 원본 재정렬: 선택이 있고 사용자가 방금 스크롤한 게 아닐 때만', function () {
  assert.strictEqual(bw.resizeRealign({ hasSel: false, now: 5000, lastManual: 0 }), false);
  assert.strictEqual(bw.resizeRealign({ hasSel: true, now: 5000, lastManual: 0 }), true);
  assert.strictEqual(bw.resizeRealign({ hasSel: true, now: 5000, lastManual: 4500 }), false);   // 0.5초 전에 직접 스크롤
  assert.strictEqual(bw.resizeRealign({ hasSel: true, now: 5000, lastManual: 5000 - bw.RESIZE_QUIET }), true);
  assert.strictEqual(bw.resizeRealign({ hasSel: true, now: 5000, lastManual: 4900, quiet: 50 }), true);
  assert.strictEqual(bw.resizeRealign(null), false);
});

// ── CSS 소스 검사 ──
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }
function rule(sel) {
  const i = html.indexOf(sel + ' {');
  assert.ok(i >= 0, sel);
  return html.slice(i, html.indexOf('}', i) + 1);
}
test('CSS 스포트라이트: opacity 로 가라앉히지 않고 글자색만 --muted', function () {
  const a = html.indexOf('/* 선택 스포트라이트'), b = html.indexOf('/* 원본 패널이 360px 미만');
  assert.ok(a > 0 && b > a);
  const blk = stripComments(html.slice(a, b));
  assert.ok(!/opacity/.test(blk), 'opacity 금지');
  assert.ok(/\.bd-w-grid\.is-focusing \.bd-w-card:not\(\.has-sel\) td[^{]*\{ color:var\(--muted\); \}/.test(blk));
  assert.ok(/\.bd-w-grid\.is-focusing \.bd-w-srctbl td\[data-key\]:not\(\.is-src\) \{ color:var\(--muted\); \}/.test(blk));
  assert.ok(blk.includes('color-mix(in srgb, var(--accent-color) 55%, var(--line-strong))'));
  assert.ok(/\.bd-w-status\.is-focusing \{ border-left:3px solid var\(--accent-color\)/.test(blk));
  assert.ok(/border-top-color:color-mix\(in srgb, var\(--accent-color\) 55%, var\(--line-strong\)\)/.test(blk));
  assert.ok(!/--[a-z0-9-]+\s*:/.test(blk.replace(/var\(--[a-z0-9-]+\)/g, '')), '새 CSS 변수 금지');
});
test('CSS: 원본 표 바닥 #0d1117 제거(--panel), 머리 th 는 --panel2, 열 머리·행 머리 강조', function () {
  const body = rule('#bd-w-srcbody');
  assert.ok(!/0d1117/i.test(body) && body.includes('background:var(--panel)'));
  assert.ok(/\.bd-w-srctbl th \{[^}]*background:var\(--panel2\)/.test(html));
  assert.ok(/\.bd-w-srctbl th\.is-srccol \{ color:var\(--fg\); box-shadow:inset 0 -2px 0 var\(--accent-color\); \}/.test(html));
  assert.ok(/\.bd-w-srctbl th\.is-srcrow \{ color:var\(--fg\); box-shadow:inset 2px 0 0 var\(--accent-color\); \}/.test(html));
});
test('CSS 칩: 카드 왼쪽 .bd-map 과 원본 머리 .bd-w-srcjump 가 같은 모양, 선택 카드 칩은 틸, 높이 24px 이상', function () {
  const r = rule('.bd-w-head .bd-map, .bd-w-srcjump');
  ['font-family:var(--mono)', 'font-size:11px', 'border:1px solid var(--line-strong)', 'border-radius:8px', 'min-height:24px'].forEach(function (s) { assert.ok(r.includes(s), s); });
  assert.ok(/\.bd-w-srcjump\[aria-current="true"\], \.bd-w-card\.has-sel \.bd-w-head \.bd-map \{ color:var\(--fg\); border-color:var\(--accent-color\)/.test(html));
  assert.ok(/\.bd-w-srchead button \{[^}]*min-height:24px/.test(html));
});
test('CSS 전환: 200ms, prefers-reduced-motion 이면 없음', function () {
  assert.ok(/transition:color \.2s ease, border-color \.2s ease/.test(html));
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{\s*\.bd-w-card, \.bd-w-head \.bd-map[^}]*transition:none/.test(html));
});
test('CSS: 알림 줄 숨김(is-sr)은 margin 규칙에 지지 않는다', function () {
  assert.ok(/\.bd-w-status \.bd-w-live\.is-sr \{ position:absolute;/.test(html));
});
