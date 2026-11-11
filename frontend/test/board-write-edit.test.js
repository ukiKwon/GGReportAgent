const test = require('node:test');
const assert = require('node:assert');
const bw = require('../js/board-write.js');
require('../js/board.js');
const MINUS = '−';
function form() { return { form_id: '7', name: 'q', tables: [{ id: 'A', ref: 'A', mapping: 'A', title: '표', rows: [
  [{ key: 'h', text: '구분', header: true }, { key: 'h2', text: '2026', header: true }],
  [{ key: 'r1c0', text: '출연금' }, { key: 'r1c1', text: '0', mapped: true }],
  [{ key: 'r2c0', text: '예비비' }, { key: 'r2c1', text: '0', mapped: true }],
  [{ key: 'r3c0', text: '합계' }, { key: 'r3c1', text: '0', mapped: true }]], notes: [] }] }; }
function c(key, v, cell, raw, rounded) { return { key: key, value: v, status: 'filled', reason: null, warnings: [],
  source: { sheet: 'S', cell: cell, display: v, raw: raw == null ? null : raw, rounded: rounded == null ? null : rounded } }; }
function ws0() {
  return bw.buildState(form(), { tables: [{ ref: 'A', needs_review: false, label_mismatches: [], sums: [{ total: 'r3c1', of: ['r1c1', 'r2c1'] }],
    cells: [c('r1c1', '1,234', 'C2', '1233.6', true), c('r2c1', '2,345', 'C3'), c('r3c1', '3,580', 'C4')] }], sources: [], warnings: [], unmapped_tables: [] }, { fileName: 'a.xlsx' });
}
test('sumState: 합계 관계가 있으면 현재 값으로 다시 계산 — 서버 벡터와 같다', function () {
  const t = bw.findT(ws0(), 'A');
  assert.deepStrictEqual(bw.sumState(t, 'r3c1'), { expected: '3,579', actual: '3,580', diff: '+1', zero: false });
  assert.strictEqual(bw.sumState(t, 'r1c1'), null);
});
test('editCell: 값 변경은 수정됨·그 표의 확인 해제·검수 완료 해제, 같은 값은 변화 없음, 원래 값으로 돌아오면 사유도 지움', function () {
  let ws = bw.toggleCheck(ws0(), 'A', 'x', '10:00');   // 표가 하나뿐이라 검수 완료도 함께 붙는다
  assert.ok(ws.done);
  const same = bw.editCell(ws, 'A', 'r1c1', '1,234');
  assert.strictEqual(same.changed, false); assert.strictEqual(same.ws, ws);
  assert.strictEqual(same.ws.tables[0].checked.at, '10:00', '같은 값이면 확인이 풀리지 않는다');
  let r = bw.editCell(ws, 'A', 'r1c1', ' 1,235 ');
  assert.strictEqual(r.changed, true); assert.strictEqual(r.released, 'done');
  assert.strictEqual(r.ws.done, null);
  const t = bw.findT(r.ws, 'A');
  assert.strictEqual(t.cells.r1c1.value, '1,235'); assert.strictEqual(t.checked, null);
  assert.deepStrictEqual(t.relNote, { label: '출연금 2026', from: '1,234', to: '1,235' });
  assert.ok(!('checked' in t.cells.r1c1), '칸 단위 checked 는 없다');
  assert.strictEqual(bw.cellInfo(t, t.cells.r1c1).edited, true);
  let w2 = bw.setWhy(r.ws, 'A', 'r1c1', 'ROUND', '');
  assert.strictEqual(bw.findT(w2, 'A').cells.r1c1.why, 'ROUND');
  w2 = bw.editCell(w2, 'A', 'r1c1', '1,234').ws;   // 원래 값
  assert.strictEqual(bw.findT(w2, 'A').cells.r1c1.why, '');
  assert.strictEqual(bw.editCell(ws0(), 'A', 'r1c1', '1').released, '', '확인하지 않은 표는 풀 것이 없다');
  assert.strictEqual(bw.editCell(ws0(), 'A', 'r1c1', '1').ws.tables[0].relNote, null);
});
test('editCell: 확인이 풀린 뒤 다시 고치면 relNote 가 최신 값으로 갱신되고, 모두 원본으로 돌아오면 사라진다(표 확인 해제는 유지)', function () {
  let ws = bw.toggleCheck(ws0(), 'A', 'x', '10:00');
  ws = bw.editCell(ws, 'A', 'r1c1', '1,235').ws;
  assert.deepStrictEqual(bw.findT(ws, 'A').relNote, { label: '출연금 2026', from: '1,234', to: '1,235' });
  ws = bw.editCell(ws, 'A', 'r1c1', '1,240').ws;   // 두 번째 수정: 옛 내용(→1,235)이 남지 않는다
  assert.deepStrictEqual(bw.findT(ws, 'A').relNote, { label: '출연금 2026', from: '1,235', to: '1,240' });
  ws = bw.editCell(ws, 'A', 'r2c1', '2,000').ws;   // 다른 칸을 또 고침
  assert.strictEqual(bw.findT(ws, 'A').relNote.to, '2,000');
  ws = bw.editCell(ws, 'A', 'r2c1', '2,345').ws;   // 한 칸 되돌림 — 아직 r1c1 이 고쳐진 채라 사유가 남는다
  assert.ok(bw.findT(ws, 'A').relNote);
  ws = bw.editCell(ws, 'A', 'r1c1', '1,234').ws;   // 모두 원본
  const t = bw.findT(ws, 'A');
  assert.strictEqual(t.relNote, null, '풀림 사유가 없어지면 안내를 지운다');
  assert.strictEqual(t.checked, null, '표 확인 해제 상태 자체는 유지');
});
test('editCell: 표가 둘이면 고친 칸이 속한 표만 확인이 풀리고, 검수 완료만 해제된다(released=table 은 검수 완료 전)', function () {
  const f = form(); f.tables.push({ id: 'Z', ref: 'Z', mapping: 'Z', title: '다른 표', rows: [[{ key: 'z1', text: '0', mapped: true }]], notes: [] });
  const resp2 = { tables: [{ ref: 'A', needs_review: false, label_mismatches: [], sums: [], cells: [c('r1c1', '1', 'C2'), c('r2c1', '2', 'C3'), c('r3c1', '3', 'C4')] },
    { ref: 'Z', needs_review: false, label_mismatches: [], sums: [], cells: [c('z1', '5', 'D1')] }], sources: [], warnings: [], unmapped_tables: [] };
  let ws = bw.buildState(f, resp2, {});
  ws = bw.toggleCheck(ws, 'A', 'x', '10:00');
  assert.strictEqual(ws.done, null, '표 하나만 확인했으니 검수 완료가 아니다');
  const r = bw.editCell(ws, 'A', 'r1c1', '9');
  assert.strictEqual(r.released, 'table');
  assert.strictEqual(bw.findT(r.ws, 'Z').checked, null);
  ws = bw.toggleCheck(bw.toggleCheck(ws, 'Z', 'x', '10:05'), 'Z', 'x', '10:06');   // Z 확인 → 해제 → (검수 완료 아님)
  ws = bw.toggleCheck(ws, 'Z', '나', '10:07');
  assert.deepStrictEqual(ws.done, { who: '나', at: '10:07' });
  const r2 = bw.editCell(ws, 'Z', 'z1', '6');
  assert.strictEqual(r2.released, 'done');
  assert.ok(bw.findT(r2.ws, 'A').checked, '다른 표의 확인은 그대로');
  assert.strictEqual(r2.ws.done, null);
  assert.ok(bw.releaseText('table', bw.findT(r2.ws, 'Z')).includes('‘다른 표’ 표의 확인을 풀었습니다') && bw.releaseText('done', bw.findT(r2.ws, 'Z')).includes('검수 완료를 해제'));
  assert.strictEqual(bw.releaseText('', bw.findT(r2.ws, 'Z')), '');
});
test('재검산 문구: +1 → 0 이제 맞습니다, +1 → +2, 합계 칸을 고쳐도 동작', function () {
  const ws = ws0(), lab = '합계';
  const after = bw.editCell(ws, 'A', 'r2c1', '2,344').ws;   // 합 3,578
  let lines = bw.recheckLines(ws, bw.editCell(ws, 'A', 'r2c1', '2,346').ws, 'A', 'r2c1');   // 3,580 → 맞음
  assert.strictEqual(lines.length, 1); assert.ok(lines[0].endsWith('차이 +1 → 0, 이제 맞습니다.'));
  lines = bw.recheckLines(ws, after, 'A', 'r2c1');
  assert.ok(lines[0].endsWith('차이 +1 → +2.'));
  assert.strictEqual(bw.recheckText(lab, { diff: '0', zero: true }, { diff: '0', zero: true }), '');
  assert.strictEqual(bw.recheckText(lab, { diff: '0', zero: true }, { diff: MINUS + '2', zero: false }), '합계: 차이 0 → ' + MINUS + '2.');
  assert.ok(bw.recheckText(lab, { diff: '+1', zero: false }, null).includes('숫자로 읽을 수 없어'));
});
test('needsAsk: 원본 값 있는 칸을 처음 고칠 때만, 수정된·읽지 못함·출처 없음·이미 물은 칸은 묻지 않음', function () {
  const ws = ws0(), t = bw.findT(ws, 'A'), c1 = t.cells.r1c1;
  assert.strictEqual(bw.needsAsk(t, c1), true);
  assert.strictEqual(bw.needsAsk(t, Object.assign({}, c1, { asked: true })), false);
  assert.strictEqual(bw.needsAsk(t, Object.assign({}, c1, { value: '9' })), false);
  assert.strictEqual(bw.needsAsk(t, Object.assign({}, c1, { src: null })), false);
  assert.strictEqual(bw.needsAsk(t, Object.assign({}, c1, { value: '', orig: '', status: 'failed' })), false);
});
test('askLines: 가져온 위치·표시·원래 값, 합계 줄(차이/맞음), 확인한 칸이면 해제 안내', function () {
  let ws = ws0(), t = bw.findT(ws, 'A');
  let l = bw.askLines(t, t.cells.r1c1);
  assert.strictEqual(l[0], '출연금 2026 값은 S 시트 C2에서 가져왔습니다. 표시 1,234 · 원래 값 1233.6');
  assert.strictEqual(l[1], '이 칸이 들어간 합계: 합계 2026 — 표시 합 3,579 · 합계 3,580 · 차이 +1');
  ws = bw.toggleCheck(ws, 'A', 'x', 'y'); t = bw.findT(ws, 'A');
  assert.ok(bw.askLines(t, t.cells.r1c1).includes('고치면 이 표의 확인이 풀립니다.'));
  // 합계가 맞는 상태
  const ok = bw.editCell(ws0(), 'A', 'r2c1', '2,346').ws, t2 = bw.findT(ok, 'A');
  assert.ok(bw.askLines(t2, t2.cells.r1c1).includes('이 칸이 들어간 합계(합계 2026)는 지금 맞습니다.'));
});
test('askHtml: 안전한 [취소]가 있고 [그래도 고치기]와 role=group', function () {
  const t = bw.findT(ws0(), 'A'), h = bw.askHtml(t, t.cells.r1c1);
  assert.ok(h.includes('role="group" aria-label="고치기 전 확인"') && h.includes('>그래도 고치기</button>') && h.includes('id="bd-w-ask-no"'));
  assert.ok(h.includes('aria-describedby="bd-w-asktxt"'));
});
test('사유: 기본값 없음·선택 사항, [기타]는 메모가 있어야 사유 있음, 메모 100자 제한, 요약 줄 안내', function () {
  let ws = bw.editCell(ws0(), 'A', 'r1c1', '1,230').ws;
  assert.strictEqual(bw.tally(ws).noReason, 1);
  ws = bw.setWhy(ws, 'A', 'r1c1', 'OTHER', '');
  assert.strictEqual(bw.tally(ws).noReason, 1);
  ws = bw.setWhy(ws, 'A', 'r1c1', 'OTHER', new Array(130).join('가'));
  assert.strictEqual(bw.findT(ws, 'A').cells.r1c1.memo.length, 100);
  assert.strictEqual(bw.tally(ws).noReason, 0);
  ws = bw.setWhy(ws, 'A', 'r1c1', 'ROUND', 'x');
  assert.strictEqual(bw.findT(ws, 'A').cells.r1c1.memo, '');
  assert.strictEqual(bw.setWhy(ws, 'A', 'r1c1', '매핑 오류', ''), ws);   // 모르는 코드는 무시
  assert.deepStrictEqual(bw.WHY.map(function (w) { return w.label; }), ['반올림 맞춤', '원본 값과 다르게 가져옴', '원본 오류', '기타']);
  const ws2 = bw.editCell(ws0(), 'A', 'r1c1', '1,230').ws;
  assert.ok(bw.summaryHtml(ws2).includes('사유를 고르지 않은 수정 1칸'));
  assert.ok(bw.reviewHtml(ws2).includes('이 남아 있어도 표 확인은 할 수 있습니다.'));
});
test('whyHtml: radiogroup·4개·기타만 메모 입력(100자, 80자 이상 카운터)', function () {
  let ws = bw.setWhy(bw.editCell(ws0(), 'A', 'r1c1', '9').ws, 'A', 'r1c1', 'OTHER', new Array(84).join('가'));
  const h = bw.whyHtml(bw.findT(ws, 'A').cells.r1c1);
  assert.ok(h.includes('role="radiogroup" aria-label="수정 사유"'));
  assert.strictEqual(h.split('role="radio"').length - 1, 4);
  assert.ok(h.includes('maxlength="100"') && h.includes('83/100') && !/id="bd-w-memocnt" hidden/.test(h));
  assert.ok(!bw.whyHtml(bw.findT(bw.setWhy(ws, 'A', 'r1c1', 'ROUND', ''), 'A').cells.r1c1).includes('bd-w-memo"'));
});
test('칸 HTML: 수정 칸은 원본 보조 줄·is-edited, 입력 중이면 input, 합계 칸 선택이면 구성 칸 강조', function () {
  const ws = bw.editCell(ws0(), 'A', 'r1c1', '1,230').ws, t = bw.findT(ws, 'A');
  const h = bw.valueCellHtml(t, t.cells.r1c1, { fc: {} });
  assert.ok(h.includes('is-edited') && h.includes('<span class="bd-w-orig">원본 1,234</span>') && h.includes('원본과 다름, 원본 1,234'));
  const ui = bw.freshUi(); ui.edit = { t: 'A', key: 'r1c1', text: '<x' };
  const e = bw.valueCellHtml(t, t.cells.r1c1, { fc: {}, ui: ui });
  assert.ok(e.includes('id="bd-w-in"') && e.includes('value="&lt;x"') && e.includes('maxlength="100"'));
  ui.edit = null; ui.sel = { t: 'A', key: 'r3c1' };
  const card = bw.cardHtml(ws, t, ui, null);
  assert.strictEqual(card.split('is-part').length - 1, 2);   // r1c1, r2c1
});
test('validateValue: 100자·제어문자·줄바꿈 거부(서버 clean과 같은 규칙)', function () {
  assert.strictEqual(bw.validateValue('1,230'), null);
  assert.ok(bw.validateValue(new Array(102).join('1')));
  assert.ok(bw.validateValue('a\nb')); assert.ok(bw.validateValue('a\tb'));
  assert.ok(bw.validateValue('a' + String.fromCharCode(0x2028)));
});
test('statusHtml: 수정 칸은 사유 그룹·[원본 값으로](한 줄), 확인 줄이면 확인 줄이 상태 줄을 대신', function () {
  const ws = bw.editCell(ws0(), 'A', 'r1c1', '1,230').ws, ui = bw.freshUi();
  ui.sel = { t: 'A', key: 'r1c1' };
  const h = bw.statusHtml(ws, ui);
  assert.ok(h.includes('role="radiogroup"') && h.includes('data-w="revert"'));
  ui.ask = { t: 'A', key: 'r1c1' };
  assert.ok(bw.statusHtml(ws, ui).includes('고치기 전 확인') && !bw.statusHtml(ws, ui).includes('data-w="revert"'));
  ui.ask = null; ui.edit = { t: 'A', key: 'r1c1', text: '' };
  assert.ok(bw.statusHtml(ws, ui).includes('Enter로 확정하고 Esc로 취소'));
  assert.strictEqual(bw.tipAllowed(ui), false);   // 입력·확인 줄 중에는 툴팁 숨김
});
test('수정 사유·원래 값은 초안 본문에 들어가지 않는다', function () {
  const ws = bw.setWhy(bw.editCell(ws0(), 'A', 'r1c1', '1,230').ws, 'A', 'r1c1', 'ROUND', '');
  const s = JSON.stringify(bw.draftBody(ws, 7));
  assert.deepStrictEqual(JSON.parse(s), { version: 7, tables: [{ ref: 'A', cells: { r1c1: '1,230', r2c1: '2,345', r3c1: '3,580' } }] });
  assert.ok(s.indexOf('ROUND') < 0 && s.indexOf('1233') < 0);
});
