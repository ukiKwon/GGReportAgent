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
  assert.strictEqual(bw.cellAria(tb, tb.cells.n1), '5. 수익성 분석, 명목가치, 총기대수익, 48.51');
  assert.strictEqual(bw.cellAria(tb, tb.cells.p1), '5. 수익성 분석, 현재가치, 총기대수익, 44.00');
  assert.strictEqual(bw.cellAria(tb, tb.cells.p2), '5. 수익성 분석, 현재가치, 총소요비용, 29.00');
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
  // 상태 줄은 한 줄: 표 › 행 › 열 │ 대조 줄 │ [분석표에서 보기]. 계산 줄(합 … ÷ 100)은 팝업 편집 영역에만 둔다.
  const ui = bw.freshUi(); ui.sel = { t: 'B', key: 'n1' };
  const h = bw.statusHtml(ws, ui);
  assert.ok(h.indexOf('<span class="bd-w-path">5. 수익성 분석 › 명목가치 › 총기대수익</span>') === 0);
  assert.ok(h.includes('<span class="bd-w-cmp mono">48.51 억원 ← K54 4,851.4 백만원</span>'));
  assert.ok(h.includes('data-w="srcopen" data-v="*">분석표에서 보기</button>'));
  assert.ok(!h.includes('합 4,851.4') && !h.includes('data-w="check"') && !h.includes('bd-w-calc'));
  assert.strictEqual(bw.statusHtml(ws, bw.freshUi()), '', '선택이 없으면 안내 문구 없이 비어 있다');
  ui.pop = { at: null };
  assert.strictEqual(bw.statusHtml(ws, ui), '', '팝업이 열려 있으면 상태 줄은 숨는다');
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

test('창 크기 보정: resize 처리에서 측정(measureStatus) 뒤에 선택 칸 보정(keepVisible)을 한다', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'board-write.js'), 'utf8');
  const i = src.indexOf('function realign()');
  assert.ok(i > 0);
  const body = src.slice(i, src.indexOf('window.addEventListener(\'resize\'', i));
  const m = body.indexOf('measureStatus()'), k = body.indexOf('keepVisible(');
  assert.ok(m >= 0 && k > m, '측정 → 보정 순서');
  assert.ok(/if \(ui\.sel && !ui\.pop\)/.test(body.slice(m, k)), '팝업이 열려 있을 때는 작성본 칸을 보정하지 않는다');
});

test('원본 패널·옛 배치 계산은 없다: 오른쪽 원본 패널 함수·상태(panelOpen·wide)·엑셀 원본 문구가 코드에 남지 않는다', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'board-write.js'), 'utf8');
  ['stackMode', 'gridClass', 'srcScrollTop', 'resizeRealign', 'measureSrc', 'panelOpen', 'bd-w-src"', 'bd-w-grid', 'CHECK_SVG', 'setDone', 'bd-w-done'].forEach(function (k) {
    assert.ok(!src.includes(k), k);
  });
  const ui = bw.freshUi();
  assert.ok(!('panelOpen' in ui) && !('wide' in ui) && ui.pop === null);
});

test('상태 줄 가려짐 여백: 숨은 상태 줄은 0, 보이는 상태 줄만 scroll-margin-bottom 에 쓴다', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'board-write.js'), 'utf8');
  const i = src.indexOf('function measureStatus()');
  const body = src.slice(i, src.indexOf('function ensureVisible', i));
  assert.ok(/statusShown\(\)/.test(body) && /--bd-occl-b/.test(body));
});

test('버튼 가림 보정: 칸이 아닌 버튼은 표 영역 안·고정 영역 밖일 때만 보정하고, 칸처럼 scroll-margin 도 가진다', function () {
  assert.strictEqual(bw.needsOcclusionFix(true, false), true);
  assert.strictEqual(bw.needsOcclusionFix(true, true), false);    // 상태 줄·작성 바 안의 버튼
  assert.strictEqual(bw.needsOcclusionFix(null, null), false);    // 표 영역 밖
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'board-write.js'), 'utf8');
  const i = src.indexOf('function onFocusIn(e)');
  const body = src.slice(i, src.indexOf('function onChange', i));
  assert.ok(/bw\.needsOcclusionFix\(t\.closest\('\.bd-w-tables'\), t\.closest\('#bd-w-status, #bd-writebar'\)\)\) keepVisible\(t\)/.test(body));
  assert.ok(!/select\(/.test(body.slice(body.indexOf('else if')) ), '버튼 포커스는 선택을 바꾸지 않는다');
  assert.ok(/\.bd-w-tables button[^{]*\{[^}]*scroll-margin-top:calc\(var\(--bd-bar-h, 64px\) \+ 8px\)[^}]*scroll-margin-bottom:calc\(var\(--bd-occl-b, 56px\) \+ 8px\)/.test(html));
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

test('선택 상태 클래스: 선택이 있으면 표 영역·카드·상태 줄, 해제하면 상태 줄은 숨는다(is-idle)', function () {
  const ws = wsB();
  const ui = bw.freshUi();
  const off = bw.writeHtml(ws, ui);
  assert.ok(!off.includes('is-focusing') && !off.includes('has-sel') && !off.includes('is-srccol'));
  assert.ok(off.includes('id="bd-w-status" class="bd-w-status is-idle"'));
  ui.sel = { t: 'B', key: 'n1' };
  const on = bw.writeHtml(ws, ui);
  assert.ok(on.includes('<div class="bd-w-tables is-focusing" id="bd-w-tables">'));
  assert.ok(on.includes('<section class="bd-card bd-w-card has-sel" data-t="B"'));
  assert.ok(on.includes('id="bd-w-status" class="bd-w-status is-focusing"'));
  ui.pop = { at: null };
  assert.ok(bw.writeHtml(ws, ui).includes('id="bd-w-status" class="bd-w-status is-idle"'), '팝업이 열려 있으면 상태 줄은 숨는다');
  ui.pop = null; ui.sel = null;
  assert.ok(!bw.writeHtml(ws, ui).includes('is-focusing'));
});

test('원본 열 머리: 선택 칸이 있는 열의 thead th 에 is-srccol', function () {
  const L = function (id) { return { id: id, ref: id, mapping: id, title: id, columns: 1, notes: [], rows: [[{ key: 'r0c0', text: id, mapped: true }]] }; };
  const form = { form_id: 'f', name: 'f', tables: [L('A'), L('B')] };
  const c = function (cell) { return { key: 'r0c0', value: '1', status: 'filled', reason: null, warnings: [], source: { sheet: 'S', cell: cell, display: '1', raw: null, rounded: null } }; };
  const g = function (ref) { return { ref: ref, sheet: 'S', range: '', first_row: 1, cols: ['A', 'B', 'C', 'D'], rows: [['', '', '', ''], ['', '', '3', '']], merges: [] }; };
  const ws = bw.buildState(form, { tables: [{ ref: 'A', needs_review: false, label_mismatches: [], sums: [], cells: [c('A1')] },
    { ref: 'B', needs_review: false, label_mismatches: [], sums: [], cells: [c('C2')] }], sources: [g('A'), g('B')], warnings: [] }, {});
  const ui = bw.freshUi(); ui.pop = { at: null, onlyEdited: false };
  assert.ok(!bw.srcBodyHtml(ws, ui).includes('is-srccol'));
  ui.sel = { t: 'B', key: 'r0c0' };
  assert.ok(!bw.srcBodyHtml(ws, ui).includes('is-srccol'), '원본 칸을 고르기 전에는 강조가 없다');
  ui.pop.at = { s: 0, r: 1, c: 2 };
  const h = bw.srcBodyHtml(ws, ui);
  assert.ok(h.includes('<th scope="col" class="is-srccol">C</th>'));
  assert.strictEqual(h.split('is-srccol').length - 1, 1);
  assert.ok(h.includes('<th scope="col">A</th>'));
});

// ── CSS 소스 검사 ──
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }
function rule(sel) {
  const i = html.indexOf(sel + ' {');
  assert.ok(i >= 0, sel);
  return html.slice(i, html.indexOf('}', i) + 1);
}
test('CSS 스포트라이트: opacity 로 가라앉히지 않고 글자색만 --muted', function () {
  const a = html.indexOf('/* 선택 스포트라이트'), b = html.indexOf('/* 포커스·스크롤 때 칸이');
  assert.ok(a > 0 && b > a);
  const blk = stripComments(html.slice(a, b));
  assert.ok(!/opacity/.test(blk), 'opacity 금지');
  assert.ok(/\.bd-w-tables\.is-focusing\s+\.bd-w-card:not\(\.has-sel\)\s+td[^{]*\{\s*color:\s*var\(--muted\);?\s*\}/.test(blk));
  assert.ok(blk.includes('color-mix(in srgb, var(--accent-color) 55%, var(--line-strong))'));
  assert.ok(/\.bd-w-status\.is-focusing \{ border-left:3px solid var\(--accent-color\)/.test(blk));
  assert.ok(/\.bd-w-status\.is-idle \{ position:absolute;/.test(blk), '선택이 없으면 상태 줄은 화면에서만 숨는다');
  assert.ok(!/--[a-z0-9-]+\s*:/.test(blk.replace(/var\(--[a-z0-9-]+\)/g, '')), '새 CSS 변수 금지');
});
test('CSS: 오른쪽 원본 패널·2열 격자·세로 도크 규칙은 없다', function () {
  const css = stripComments(html);
  ['.bd-w-grid', '.bd-w-src ', '.bd-w-src{', '.bd-w-srchead', '.bd-stacked', '--bd-status-h', '--bd-scroll-top', '.bd-w-ck'].forEach(function (k) {
    assert.ok(css.indexOf(k) < 0, k);
  });
});
test('CSS 글자 확대: 작성본 표 값·머리 14px, 카드 제목 15px, 주석 13px, 칸 편집 입력 14px', function () {
  assert.ok(/\.bd-w-tables \.bd-table th, \.bd-w-tables \.bd-table td \{ font-size:14px; padding:6px 10px; \}/.test(html));
  assert.ok(/\.bd-w-title \{ font-size:15px; font-weight:700; \}/.test(html));
  assert.ok(/\.bd-w-tables \.bd-notes \{ font-size:13px; line-height:1\.55; \}/.test(html));
  assert.ok(/\.bd-w-in \{[^}]*font-size:14px/.test(html));
  assert.ok(/\.bd-w-tcheck \{[^}]*min-height:32px/.test(html), '표 확인 라벨은 누르는 영역 32px 이상');
});
test('CSS 팝업: 1320px·100vh−64px, 편집 영역 340px, 881~1365 아래 고정, 880 이하 전체 화면, 움직임 줄임', function () {
  const r = rule('.modal-box.bd-src-box');
  assert.ok(r.includes('width:min(1320px, calc(100vw - 64px))') && r.includes('height:calc(100vh - 64px)'));
  assert.ok(/\.bd-src-main \{[^}]*grid-template-columns:minmax\(0,1fr\) 340px/.test(html));
  assert.ok(/@media \(max-width:1365px\)/.test(html) && /@media \(max-width:880px\)\s*\{\s*\.modal-box\.bd-src-box\s*\{\s*width:100vw;\s*height:100vh/.test(html));
  assert.ok(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.modal-box\.bd-src-box\s*\{\s*animation:none;\s*\}\s*\}/.test(html));
  assert.ok(/\.bd-w-srctbl td\.is-part \{ outline:1px dashed var\(--accent-color\)/.test(html));
});
test('CSS: 원본 표 바닥 #0d1117 제거(--panel), 머리 th 는 --panel2, 열 머리·행 머리 강조', function () {
  const body = rule('#bd-w-srcbody');
  assert.ok(!/0d1117/i.test(body) && body.includes('background:var(--panel)'));
  assert.ok(/\.bd-w-srctbl th \{[^}]*background:var\(--panel2\)/.test(html));
  assert.ok(/\.bd-w-srctbl th\.is-srccol \{ color:var\(--fg\); box-shadow:inset 0 -2px 0 var\(--accent-color\); \}/.test(html));
  assert.ok(/\.bd-w-srctbl th\.is-srcrow \{ color:var\(--fg\); box-shadow:inset 2px 0 0 var\(--accent-color\); \}/.test(html));
});
test('CSS 칩: 카드 왼쪽 .bd-map 과 팝업 머리 .bd-w-srcjump 가 같은 모양, 선택 카드 칩은 틸, 높이 26px', function () {
  const r = rule('.bd-w-head .bd-map, .bd-w-srcjump');
  ['font-family:var(--mono)', 'font-size:12px', 'border:1px solid var(--line-strong)', 'border-radius:8px', 'min-height:26px'].forEach(function (s) { assert.ok(r.includes(s), s); });
  assert.ok(/\.bd-w-srcjump\[aria-current="true"\], \.bd-w-card\.has-sel \.bd-w-head \.bd-map \{ color:var\(--fg\); border-color:var\(--accent-color\)/.test(html));
});
test('CSS 전환: 200ms, prefers-reduced-motion 이면 없음', function () {
  assert.ok(/transition:color \.2s ease, border-color \.2s ease/.test(html));
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{\s*\.bd-w-card, \.bd-w-head \.bd-map[^}]*transition:none/.test(html));
});
test('CSS: 알림 줄 숨김(is-sr)은 margin 규칙에 지지 않는다', function () {
  assert.ok(/\.bd-w-status \.bd-w-live\.is-sr \{ position:absolute;/.test(html));
});
test('CSS 가시성 토큰: :root 5개가 새 값, hover 리터럴, 입력 테두리 3:1(새 변수 없음)', function () {
  const root = /:root \{([^}]*)\}/.exec(html)[1];
  const tok = function (n) { return new RegExp('--' + n + ':\\s*(#[0-9a-fA-F]{6})').exec(root)[1].toLowerCase(); };
  assert.strictEqual(tok('panel'), '#181e29');
  assert.strictEqual(tok('panel2'), '#202835');
  assert.strictEqual(tok('line'), '#2d3644');
  assert.strictEqual(tok('line-strong'), '#424e62');
  assert.strictEqual(tok('muted'), '#98a1af');
  assert.ok(/button:hover \{ background:#283141; border-color:#4a566b;/.test(html));
  assert.ok(!/--line-input/.test(html), '입력 테두리용 새 변수를 만들지 않는다');
  assert.ok(/input:not\(\[type\]\), select, textarea \{[^}]*border:1px solid #626d81/.test(html));
});
test('CSS 가시성: 연결 칸 틸 18%+왼쪽 막대, 비활성 초안 버튼은 중립 테두리, 비활성 버튼 .55, 퇴직 버튼 빨강', function () {
  assert.ok(/\.bd-mapped \{[^}]*accent-color\) 18%[^}]*box-shadow:inset 2px 0 0 var\(--accent-color\)/.test(html));
  assert.ok(/\.bd-wb-btns \.bd-wb-main:disabled \{ border-color:var\(--line-strong\); \}/.test(html));
  assert.ok(/button\[disabled\] \{ opacity:\.55;/.test(html) && /button:disabled \{ opacity:\.55;/.test(html));
  assert.ok(/\.ad-badge\.active, \.ad-badge\.ok \{ color:var\(--blue\);/.test(html));
  assert.ok(/\.ad-ops button\.retire \{[^}]*margin-left:8px;[^}]*color:var\(--red\)/.test(html));
  assert.ok(/#ad-flash:empty \{ min-height:0;/.test(html));
  assert.ok(/button\.primary \{ background:var\(--accent-color\)/.test(html), '사용자 등록 틸 채움 주버튼은 예외로 유지');
});

// ── 규칙 순서·특이도 비교(공백 무관) ──
function allRules() {
  const css = stripComments(html), out = [], re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) out.push({ i: m.index, sels: m[1].trim().split(/\s*,\s*/).map(function (s) { return s.replace(/\s+/g, ' '); }), body: m[2] });
  return out;
}
function spec(sel) {
  return (sel.match(/#[\w-]+/g) || []).length * 100 + (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!not)[\w-]+/g) || []).length * 10 + (sel.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length;
}
function find(sel, prop) {
  return allRules().filter(function (r) { return r.sels.indexOf(sel) >= 0 && (!prop || new RegExp('(^|[;\\s])' + prop + '\\s*:').test(r.body)); });
}
function after(a, b) { return a.i > b.i; }
// 같은 속성을 두 규칙이 정할 때 이기는 쪽: 특이도가 높거나, 같으면 뒤에 있는 쪽
function wins(a, b) { return spec(a.sel) > spec(b.sel) || (spec(a.sel) === spec(b.sel) && after(a.r, b.r)); }

test('CSS 팝업 크기: .bd-src-box 의 margin·padding·max-height 가 공용 .modal-box 에 덮이지 않는다', function () {
  const modal = find('.modal-box', 'margin')[0];
  assert.ok(modal && /padding:/.test(modal.body) && /max-height:/.test(modal.body), '공용 .modal-box 규칙');
  const sels = [];
  allRules().forEach(function (r) { r.sels.forEach(function (s) { if (/bd-src-box/.test(s) && /margin:32px auto/.test(r.body)) sels.push({ sel: s, r: r }); }); });
  assert.strictEqual(sels.length, 1);
  assert.ok(wins(sels[0], { sel: '.modal-box', r: modal }), '.bd-src-box 규칙이 .modal-box 를 이겨야 한다: ' + sels[0].sel);
  ['margin:32px auto', 'padding:0', 'max-height:none'].forEach(function (d) { assert.ok(sels[0].r.body.replace(/\s+/g, '').includes(d.replace(/\s+/g, '')), d); });
  // 좁은 창 구간도 같은 선택자 구조(.modal-box.bd-src-box)여야 .modal-box 를 이긴다
  const m1 = html.match(/@media \(max-width:1365px\)\s*\{\s*([^\s{]+)\s*\{[^}]*margin:16px auto/);
  const m2 = html.match(/@media \(max-width:880px\)\s*\{\s*([^\s{]+)\s*\{[^}]*margin:0/);
  assert.ok(m1 && spec(m1[1]) > spec('.modal-box'), '1365 이하');
  assert.ok(m2 && spec(m2[1]) > spec('.modal-box'), '880 이하');
});
test('CSS 팝업 편집 영역: 좁은 창에서 행 트랙은 auto(내용만큼), 편집 영역은 max-height 상한까지만 커지고 자체 스크롤', function () {
  const blk = html.match(/@media \(max-width:1365px\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(blk, '1365 구간');
  const rows = blk[1].match(/\.bd-src-main\s*\{[^}]*grid-template-rows:\s*([^;}]+)/);
  assert.ok(rows && /^minmax\(0,\s*1fr\)\s+auto$/.test(rows[1].trim()), 'rows: ' + (rows && rows[1]));
  assert.ok(/\.bd-src-edit\s*\{[^}]*max-height:\s*calc\(/.test(blk[1]), '1365: 편집 영역 max-height 상한');
  assert.ok(/\.bd-src-edit\s*\{[^}]*overflow:\s*auto/.test(html), '편집 영역은 자체 스크롤');
  const m880 = html.match(/@media \(max-width:880px\)\s*\{([^\n]*)/);
  assert.ok(m880 && /grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto/.test(m880[1]) && /\.bd-src-edit\s*\{[^}]*max-height:/.test(m880[1]), '880 구간도 auto 행 + 상한');
});
test('CSS 팝업 편집 영역: 적용·되돌리기·취소 줄과 알림(.bd-src-foot)은 아래에 sticky 로 붙고 배경이 있다', function () {
  const r = find('.bd-src-foot')[0];
  assert.ok(r, '.bd-src-foot 규칙');
  assert.ok(/position:\s*sticky/.test(r.body) && /bottom:\s*0/.test(r.body), 'sticky bottom:0');
  assert.ok(/background:\s*var\(--panel\)/.test(r.body) && /border-top:/.test(r.body), '배경·위 경계선');
});
test('CSS 확인 풀림 카드: 선택돼도(is-focusing·has-sel) 주황 왼쪽 테두리가 이긴다', function () {
  const foc = find('.bd-w-tables.is-focusing .bd-w-card.has-sel', 'border-color')[0];
  assert.ok(foc);
  const rel = allRules().filter(function (r) { return r.sels.some(function (s) { return /is-released/.test(s) && /has-sel/.test(s) && /is-focusing/.test(s); }) && /border-left-color:\s*var\(--orange\)/.test(r.body); })[0];
  assert.ok(rel, '풀림+선택+집중 규칙');
  const relSel = rel.sels.filter(function (s) { return /is-released/.test(s); })[0];
  assert.ok(wins({ sel: relSel, r: rel }, { sel: '.bd-w-tables.is-focusing .bd-w-card.has-sel', r: foc }));
  assert.ok(find('.bd-w-card.is-released', 'border-left')[0], '기본 3px 주황');
});
test('CSS 원본 칸 숫자 배지: 오른쪽 위 모서리에 떼어 놓고 칸 오른쪽 여백을 확보한다', function () {
  const after = find('.bd-w-srctbl td[data-n]::after')[0];
  assert.ok(after && /position:\s*absolute/.test(after.body) && /right:\s*\d+px/.test(after.body) && /top:\s*\d+px/.test(after.body));
  const pad = find('.bd-w-srctbl td[data-n]', 'padding-right')[0];
  assert.ok(pad, '배지 자리 padding-right');
  assert.ok(Number(pad.body.match(/padding-right:\s*(\d+)px/)[1]) >= 14, '배지(10px 글자) 폭보다 넓은 여백');
});
test('CSS 낭독 영역 #bd-src-note: 비어도 display:none 으로 빼지 않는다', function () {
  const e = find('.bd-src-note:empty')[0];
  assert.ok(e && !/display:\s*none/.test(e.body));
});
