const test = require('node:test');
const assert = require('node:assert');
const bw = require('../js/board-write.js');

// 이사회 자료(020a) 숫자 칸: 단위(unit)·괄호(paren/sub_key)·소수 자리(dec) 계약 — handoff/agents/backend-dev/2026-11-11_0938_a3c892d5.md §6
function M(key, over) { return Object.assign({ key: key, text: '', header: false, mapped: true, input: false, align: 'right', unit: '', paren: false, sub_key: null, dec: 2 }, over || {}); }
function L(key, text) { return { key: key, text: text, header: false, mapped: false, input: false }; }
function H(key, text) { return { key: key, text: text, header: true, mapped: false, input: false }; }
function form() {
  return { form_id: 'default_doc', name: '기본 양식', version: null, tables: [
    { id: 'A', ref: 'A', mapping: 'A', title: '재산상 이익제공', notes: [], rows: [
      [H('h0', '기관명'), H('h1', '구분'), H('h2', '제공금액')],
      [{ key: 'r1_c0', text: '', header: false, mapped: false, input: true, align: 'center', unit: '', paren: false, sub_key: null, dec: null }, L('l1', '출연금'), M('r1_c2')],
      [L('l0', '기관'), L('l2', '합계'), M('r2_c2')]] },
    { id: 'B', ref: 'B', mapping: 'B', title: '출연금 현재가치', notes: [], rows: [
      [H('h0', '구분'), H('h1', '값')],
      [L('l1', '출연금(예비비)'), M('r1_c5', { paren: true, sub_key: 'r1_c5_p' })]] },
    { id: 'C-4', ref: 'C-4', mapping: 'C-4', title: '경제성 분석', notes: [], rows: [
      [H('h0', '지표'), H('h1', '값')],
      [L('l1', '회수기간'), M('r1_c1', { unit: '년', dec: null })],
      [L('l2', 'NPV'), M('r2_c1', { dec: null })],
      [L('l3', 'IRR'), M('r3_c1', { unit: '%', dec: null })]] }] };
}
function rc(key, over) {
  return Object.assign({ key: key, value: '', status: 'filled', reason: null, warnings: [], source: { sheet: 's', cell: 'C2', display: '', raw: null, rounded: null } }, over || {});
}
// 샘플 엑셀을 올린 응답 시뮬레이션: A r1_c0 은 연결 칸이 아니라 응답에 없다. B 괄호 칸은 value 가 표시 글자, main_value·sub_value 가 저장값. 단위 칸은 value 가 이미 숫자.
function sample() {
  return { tables: [
    { ref: 'A', needs_review: false, label_mismatches: [], sums: [], cells: [rc('r1_c2', { value: '1,234.50' }), rc('r2_c2', { value: '500.00' })] },
    { ref: 'B', needs_review: false, label_mismatches: [], sums: [], cells: [rc('r1_c5', { value: '5.00 (1.00)', main_value: '5.00', sub_value: '1.00' })] },
    { ref: 'C-4', needs_review: false, label_mismatches: [], sums: [], cells: [
      rc('r1_c1', { value: '3.4', source: { sheet: 's', cell: 'D4', display: '3.4년', raw: null, rounded: null } }),
      rc('r2_c1', { value: '-12.3' }),
      rc('r3_c1', { value: '0.74', source: { sheet: 's', cell: 'D6', display: '0.74%', raw: null, rounded: null } })] }], sources: [], warnings: [] };
}
function numeric() { return bw.numericKeys(form()); }
function cell(ws, ref, key) { return bw.findT(ws, ref).cells[key]; }

test('샘플 엑셀 업로드 시뮬레이션: 숫자 칸 정규형·괄호 칸 앞/뒤 값 분리, 저장 직전 숫자 오류 0건', function () {
  const ws = bw.buildState(form(), sample(), {});
  assert.strictEqual(cell(ws, 'A', 'r1_c2').value, '1234.5');
  assert.strictEqual(cell(ws, 'A', 'r2_c2').value, '500');
  assert.strictEqual(cell(ws, 'B', 'r1_c5').value, '5');
  assert.strictEqual(cell(ws, 'B', 'r1_c5').sub, '1');
  assert.strictEqual(cell(ws, 'C-4', 'r1_c1').value, '3.4');
  assert.strictEqual(cell(ws, 'C-4', 'r2_c1').value, '-12.3');
  assert.strictEqual(cell(ws, 'C-4', 'r3_c1').value, '0.74');
  assert.deepStrictEqual(bw.numberProblems(ws, numeric()), []);
  assert.strictEqual(bw.cellInfo(bw.findT(ws, 'B'), cell(ws, 'B', 'r1_c5')).edited, false);
});

test('표시: 화면 글자는 항상 dec·unit·paren 규칙으로 그린다(업로드·저장본·읽기 전용 같은 글자)', function () {
  const ws = bw.buildState(form(), sample(), {});
  assert.strictEqual(bw.cellText(cell(ws, 'A', 'r1_c2')), '1,234.50');
  assert.strictEqual(bw.cellText(cell(ws, 'A', 'r2_c2')), '500.00');
  assert.strictEqual(bw.cellText(cell(ws, 'B', 'r1_c5')), '5.00 (1.00)');
  assert.strictEqual(bw.cellText(cell(ws, 'C-4', 'r1_c1')), '3.4년');
  assert.strictEqual(bw.cellText(cell(ws, 'C-4', 'r3_c1')), '0.74%');
  assert.strictEqual(bw.cellText(cell(ws, 'C-4', 'r2_c1')), '-12.3', '단위·자리 규칙이 없는 칸은 그대로');
  assert.deepStrictEqual(bw.parenOf(cell(ws, 'B', 'r1_c5')), { main: '5.00', sub: '1.00' });
  const t = bw.findT(ws, 'B'), html = bw.valueCellHtml(t, cell(ws, 'B', 'r1_c5'), { fc: form().tables[1].rows[1][1] });
  assert.ok(html.includes('5.00') && html.includes('<span class="bd-w-paren">(1.00)</span>'));
  assert.ok(bw.cellAria(t, cell(ws, 'B', 'r1_c5')).includes('5.00, 괄호 안 1.00'));
  // 저장본으로 연 화면(상태 B)도 같은 글자
  const sv = bw.stateFromSaved(form(), { B: { r1_c5: '5', r1_c5_p: '1' }, 'C-4': { r1_c1: '3.4' } }, {});
  assert.strictEqual(bw.cellText(cell(sv, 'B', 'r1_c5')), '5.00 (1.00)');
  assert.strictEqual(bw.cellText(cell(sv, 'C-4', 'r1_c1')), '3.4년');
});

test('A r1_c0(기관명): 응답에 없어도 양식 구조의 직접 입력 칸으로 만들어지고 저장본 값을 이어받는다', function () {
  const ws = bw.buildState(form(), sample(), {});
  const c = cell(ws, 'A', 'r1_c0');
  assert.ok(c, '업로드 응답에 없어도 입력 칸이 있다');
  assert.strictEqual(c.manual, true); assert.strictEqual(c.value, ''); assert.strictEqual(c.fmt, undefined, '텍스트 칸은 숫자 칸이 아니다');
  assert.ok(!numeric().A.r1_c0, '숫자 검사 대상이 아니다');
  const w2 = bw.adoptManual(ws, { A: { r1_c0: '노원구' } });
  assert.strictEqual(cell(w2, 'A', 'r1_c0').value, '노원구');
  assert.strictEqual(bw.cellText(cell(w2, 'A', 'r1_c0')), '노원구');
  // 글자는 숫자로 해석하지 않는다
  const r = bw.editCell(w2, 'A', 'r1_c0', '동작구 12호');
  assert.strictEqual(cell(r.ws, 'A', 'r1_c0').value, '동작구 12호');
  assert.deepStrictEqual(bw.numberProblems(r.ws, numeric()), []);
});

test('편집: 쓴 글자를 해석해 정규형으로 담는다(단위·△·(n)·쉼표), 괄호 칸은 앞/뒤로 나눈다', function () {
  let ws = bw.buildState(form(), sample(), {});
  ws = bw.editCell(ws, 'A', 'r1_c2', '△1,234.5').ws;
  assert.strictEqual(cell(ws, 'A', 'r1_c2').value, '-1234.5');
  assert.strictEqual(bw.cellText(cell(ws, 'A', 'r1_c2')), '-1,234.50');
  assert.strictEqual(bw.cellInfo(bw.findT(ws, 'A'), cell(ws, 'A', 'r1_c2')).edited, true);
  ws = bw.editCell(ws, 'C-4', 'r1_c1', '4.7년').ws;
  assert.strictEqual(cell(ws, 'C-4', 'r1_c1').value, '4.7');
  assert.strictEqual(bw.cellText(cell(ws, 'C-4', 'r1_c1')), '4.7년');
  ws = bw.editCell(ws, 'B', 'r1_c5', '7 (2.5)').ws;
  assert.strictEqual(cell(ws, 'B', 'r1_c5').value, '7'); assert.strictEqual(cell(ws, 'B', 'r1_c5').sub, '2.5');
  assert.strictEqual(bw.cellText(cell(ws, 'B', 'r1_c5')), '7.00 (2.50)');
  assert.deepStrictEqual(bw.numberProblems(ws, numeric()), []);
  // 괄호 안만 지우면 앞 값만 남는다
  ws = bw.editCell(ws, 'B', 'r1_c5', '7').ws;
  assert.strictEqual(cell(ws, 'B', 'r1_c5').sub, ''); assert.strictEqual(bw.cellText(cell(ws, 'B', 'r1_c5')), '7.00');
  // 원본 글자로 되돌리면(표시 글자 그대로 다시 넣기) 수정 아님
  ws = bw.editCell(ws, 'B', 'r1_c5', bw.origText(cell(ws, 'B', 'r1_c5'))).ws;
  assert.strictEqual(bw.cellInfo(bw.findT(ws, 'B'), cell(ws, 'B', 'r1_c5')).edited, false);
  assert.strictEqual(bw.origText(cell(ws, 'B', 'r1_c5')), '5.00 (1.00)');
});

test('numberProblems: 단위가 다르거나 해석 안 되는 글자, 괄호 값 따로 검사, 괄호 안만 있으면 괄호 안 key 가 문제', function () {
  let ws = bw.buildState(form(), sample(), {});
  ws = bw.editCell(ws, 'C-4', 'r1_c1', '3.4개월').ws;               // 해석 불가 → 글자 그대로
  assert.strictEqual(cell(ws, 'C-4', 'r1_c1').value, '3.4개월');
  assert.deepStrictEqual(bw.numberProblems(ws, numeric()), [{ t: 'C-4', key: 'r1_c1' }]);
  ws = bw.editCell(ws, 'C-4', 'r3_c1', '0.74년').ws;               // % 칸에 다른 단위
  assert.deepStrictEqual(bw.numberProblems(ws, numeric()).map(function (x) { return x.key; }), ['r1_c1', 'r3_c1']);
  ws = bw.editCell(ws, 'C-4', 'r1_c1', '3.4').ws; ws = bw.editCell(ws, 'C-4', 'r3_c1', '0.74%').ws;
  assert.deepStrictEqual(bw.numberProblems(ws, numeric()), []);
  // 괄호 칸: 앞 값 문제
  ws = bw.editCell(ws, 'B', 'r1_c5', '5 (abc)').ws;
  assert.deepStrictEqual(bw.numberProblems(ws, numeric()), [{ t: 'B', key: 'r1_c5' }]);
  // 소수 3자리는 해석은 되지만 서버 문법(소수 2자리)을 넘어 문제로 남는다(조용한 반올림 없음)
  ws = bw.editCell(ws, 'B', 'r1_c5', '5.123').ws;
  assert.deepStrictEqual(bw.numberProblems(ws, numeric()), [{ t: 'B', key: 'r1_c5' }]);
  // 괄호 안만 3자리
  ws = bw.editCell(ws, 'B', 'r1_c5', '5 (1.234)').ws;
  assert.deepStrictEqual(bw.numberProblems(ws, numeric()), [{ t: 'B', key: 'r1_c5_p' }]);
  // 앞 값 없이 괄호 안만 있음
  ws = bw.patchCell(ws, 'B', 'r1_c5', { value: '', sub: '1' });
  assert.deepStrictEqual(bw.numberProblems(ws, numeric()), [{ t: 'B', key: 'r1_c5_p' }]);
  const e = bw.numberErrorLocal(bw.numberProblems(ws, numeric()));
  assert.deepStrictEqual(e.cells, [{ t: 'B', key: 'r1_c5' }], '화면에서는 칸(TD) key 로 이동');
  assert.strictEqual(e.count, 1);
});

test('refreshNumWarn: 숫자 오류 칸에 경고, 서버 단위 경고(CELL_UNIT_TEXT)와 겹쳐 달지 않고 고치면 뗀다', function () {
  const r = sample();
  r.tables[2].cells[0] = rc('r1_c1', { value: '3.4개월', status: 'review', warnings: [{ code: 'CELL_UNIT_TEXT' }] });
  let ws = bw.buildState(form(), r, {});
  assert.strictEqual(cell(ws, 'C-4', 'r1_c1').value, '3.4개월');
  assert.deepStrictEqual(cell(ws, 'C-4', 'r1_c1').warns, ['CELL_UNIT_TEXT']);
  ws = bw.refreshNumWarn(ws, numeric());
  assert.deepStrictEqual(cell(ws, 'C-4', 'r1_c1').warns, ['CELL_UNIT_TEXT']);
  const notes = bw.infoLines(bw.findT(ws, 'C-4'), cell(ws, 'C-4', 'r1_c1')).filter(function (l) { return l.k === 'note'; }).map(function (l) { return l.text; });
  assert.ok(notes.indexOf('단위가 양식과 다르거나 숫자로 읽히지 않습니다. 숫자만 남겨 주세요.') >= 0);
  ws = bw.refreshNumWarn(bw.editCell(ws, 'C-4', 'r1_c1', '3.4').ws, numeric());
  assert.deepStrictEqual(cell(ws, 'C-4', 'r1_c1').warns, []);
  // 일반 숫자 오류는 NUM_FORMAT
  ws = bw.refreshNumWarn(bw.editCell(ws, 'A', 'r1_c2', '12a').ws, numeric());
  assert.deepStrictEqual(cell(ws, 'A', 'r1_c2').warns, ['NUM_FORMAT']);
});

test('저장·초안 본문: 숫자는 정규형, 괄호 칸은 key 와 sub_key 둘 다 보낸다', function () {
  const ws = bw.buildState(form(), sample(), {});
  const body = bw.saveBody(ws, {}, 3, '메모');
  const by = {}; body.tables.forEach(function (t) { by[t.ref] = t.cells; });
  assert.deepStrictEqual(by.B, { r1_c5: '5', r1_c5_p: '1' });
  assert.deepStrictEqual(by['C-4'], { r1_c1: '3.4', r2_c1: '-12.3', r3_c1: '0.74' });
  assert.strictEqual(by.A.r1_c2, '1234.5');
  assert.strictEqual(body.base_snap_no, 3);
  const d = bw.draftBody(ws, 3), db = {}; d.tables.forEach(function (t) { db[t.ref] = t.cells; });
  assert.deepStrictEqual(db.B, { r1_c5: '5', r1_c5_p: '1' }, '초안도 표시 글자가 아니라 정규형을 보낸다(표시는 서버가 한다)');
  assert.strictEqual(db['C-4'].r1_c1, '3.4');
  // 괄호 안 값이 없으면 초안에서는 빼고, 저장 본문은 빈 값으로 보낸다
  const w2 = bw.editCell(ws, 'B', 'r1_c5', '5').ws;
  assert.deepStrictEqual(bw.draftBody(w2, null).tables.filter(function (t) { return t.ref === 'B'; })[0].cells, { r1_c5: '5' });
  assert.deepStrictEqual(bw.saveBody(w2, {}, 0, '').tables.filter(function (t) { return t.ref === 'B'; })[0].cells, { r1_c5: '5', r1_c5_p: '' });
});

test('matDirty·rebase·adoptSaved: 괄호 안 값(sub_key)도 같은 칸으로 비교한다', function () {
  const base = { B: { r1_c5: '5', r1_c5_p: '1' } };
  let ws = bw.stateFromSaved(form(), base, {});
  assert.strictEqual(cell(ws, 'B', 'r1_c5').sub, '1');
  assert.deepStrictEqual(bw.matDirty(ws, base), []);
  ws = bw.editCell(ws, 'B', 'r1_c5', '5 (1.5)').ws;
  assert.deepStrictEqual(bw.matDirty(ws, base), [{ t: 'B', key: 'r1_c5' }]);
  // 남이 앞 값을 고친 최신 저장본 위에 내가 고친 칸(앞·뒤 값)만 얹는다
  const latest = { B: { r1_c5: '9', r1_c5_p: '8' } };
  const merged = bw.rebaseBase(ws, base, latest);
  assert.deepStrictEqual(merged.B, { r1_c5: '5', r1_c5_p: '1.5' });
  // 저장 뒤 화면 맞춤
  let w2 = bw.stateFromSaved(form(), base, {});
  w2 = bw.adoptSaved(w2, latest);
  assert.strictEqual(cell(w2, 'B', 'r1_c5').value, '9'); assert.strictEqual(cell(w2, 'B', 'r1_c5').sub, '8');
  assert.strictEqual(bw.cellText(cell(w2, 'B', 'r1_c5')), '9.00 (8.00)');
});

test('saveError: 서버 400·422 의 칸 key 가 _p 로 끝나면 칸(TD) key 로 포커스한다', function () {
  const e = bw.saveError({ status: 400, body: { detail: { code: 'BAD_VALUE', message: '숫자 칸', count: 2, cells: [{ ref: 'B', key: 'r1_c5_p' }, { ref: 'C-4', key: 'r1_c1' }] } } });
  assert.strictEqual(e.kind, 'bad_num');
  assert.deepStrictEqual(e.cells, [{ t: 'B', key: 'r1_c5' }, { t: 'C-4', key: 'r1_c1' }]);
  const p = bw.saveError({ status: 422, body: { detail: { code: 'PII_DETECTED', message: 'x', kinds: [{ kind: 'RRN', count: 1 }], cells: [{ ref: 'A', key: 'r1_c0' }] } } });
  assert.deepStrictEqual(p.cells, [{ t: 'A', key: 'r1_c0' }]);
});

test('옛 서버·옛 양식(새 필드 없음): 칸은 예전처럼 글자 그대로, 괄호 병기 글자는 숫자 오류', function () {
  const f = { form_id: 'x', name: 'x', tables: [{ id: 'A', ref: 'A', title: 't', notes: [], rows: [
    [H('h0', '구분'), H('h1', '값')],
    [L('l', '출연금'), { key: 'k1', text: '', mapped: true, input: false }]] }] };
  const r = { tables: [{ ref: 'A', needs_review: false, label_mismatches: [], sums: [], cells: [rc('k1', { value: '5.00 (1.00)', main_value: '5.00', sub_value: '1.00' })] }], sources: [], warnings: [] };
  const ws = bw.buildState(f, r, {});
  assert.strictEqual(cell(ws, 'A', 'k1').fmt, undefined);
  assert.strictEqual(cell(ws, 'A', 'k1').value, '5.00 (1.00)');
  assert.strictEqual(bw.cellText(cell(ws, 'A', 'k1')), '5.00 (1.00)');
  assert.deepStrictEqual(bw.parenOf(cell(ws, 'A', 'k1')), { main: '5.00', sub: '1.00' });
  assert.deepStrictEqual(bw.numberProblems(ws, bw.numericKeys(f)), [{ t: 'A', key: 'k1' }]);
});
