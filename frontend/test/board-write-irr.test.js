const test = require('node:test');
const assert = require('node:assert');
const bw = require('../js/board-write.js');

// C-4 IRR 판단기준 칸(r3_c2): 서버가 엑셀에서 문장을 채우는 입력 칸. handoff/agents/backend-dev/2026-11-16_1813_af5f0d77.md
const DEF = 'IRR이 고정자산 기회비용률(수익성분석표 기준)을 상회하는 경우 투자 결정';
const SENT = 'IRR이 3.30%(고정자산 기회비용률)를 상회하는 경우 투자 결정';
const RULE = { key: 'r3_c2', text: DEF, header: false, mapped: false, input: true, align: 'left', unit: '', paren: false, sub_key: null, dec: null };
function form() {
  return { form_id: 'default_doc', name: '기본 양식', version: null, tables: [
    { id: 'A', ref: 'A', mapping: 'A', title: '재산상 이익제공', notes: [], rows: [
      [{ key: 'h0', text: '기관명', header: true }],
      [{ key: 'r1c0', text: '기관', input: true }]] },
    { id: 'C-4', ref: 'C-4', mapping: 'C-4', title: '투자적정성 분석', notes: ['※ 현재가치할인율: 올린 수익성분석표의 투자가부결정기준을 따릅니다'], rows: [
      [{ key: 'h0', text: '구분', header: true }, { key: 'h1', text: '값', header: true }, { key: 'h2', text: '판단기준', header: true }],
      [{ key: 'l3', text: '내부수익률법(IRR)' }, { key: 'r3_c1', text: '5.8%', mapped: true, input: false, align: 'right', unit: '%', paren: false, sub_key: null, dec: null }, RULE]] }] };
}
function src(cell, disp) { return { sheet: '수익성분석', cell: cell, display: disp, raw: null, rounded: null }; }
function respOk(sentence) {
  return { tables: [{ ref: 'C-4', needs_review: false, label_mismatches: [], sums: [], cells: [
    { key: 'r3_c1', value: '5.80', status: 'filled', reason: null, warnings: [], source: src('D6', '5.80%') },
    { key: 'r3_c2', value: sentence, status: 'filled', reason: null, warnings: [], source: src('D4', '3.30%') }] }], sources: [], warnings: [] };
}
function respFail() {
  return { tables: [{ ref: 'C-4', needs_review: false, label_mismatches: [], sums: [], cells: [
    { key: 'r3_c1', value: '5.80', status: 'filled', reason: null, warnings: [], source: src('D6', '5.80%') },
    { key: 'r3_c2', value: '', status: 'failed', reason: 'IRR_RULE_UNREADABLE', warnings: [], source: { sheet: null } }] }], sources: [], warnings: [] };
}
function T(ws) { return bw.findT(ws, 'C-4'); }
function C(ws) { return T(ws).cells.r3_c2; }

test('IRR 판단기준: 엑셀 문장이 오면 그 문장이 칸 값이고 숫자 칸이 아니다', function () {
  const ws = bw.buildState(form(), respOk(SENT), {});
  const c = C(ws);
  assert.strictEqual(c.value, SENT);
  assert.strictEqual(c.status, 'filled'); assert.strictEqual(c.manual, false);
  assert.strictEqual(c.fmt, undefined, '숫자 서식 대상이 아니다');
  assert.strictEqual(bw.cellText(c), SENT);
  assert.deepStrictEqual(bw.numericKeys(form()), { 'C-4': { r3_c1: true } });
  assert.deepStrictEqual(bw.numberProblems(ws, bw.numericKeys(form())), []);
  assert.strictEqual(bw.cellInfo(T(ws), c).edited, false);
  const html = bw.valueCellHtml(T(ws), c, { fc: RULE });
  assert.ok(html.includes(SENT) && html.includes('bd-a-left') && !html.includes('bd-num'));
  // 저장 본문에 그대로 실린다(숫자 검증 없이)
  const body = bw.saveBody(ws, {}, 1, '');
  assert.strictEqual(body.tables.filter(function (t) { return t.ref === 'C-4'; })[0].cells.r3_c2, SENT);
});

test('IRR 판단기준: 칸에 쓴 글자는 이스케이프된다', function () {
  const bad = '<img src=x onerror=alert(1)>';
  const ws = bw.buildState(form(), respOk(bad), {});
  const html = bw.valueCellHtml(T(ws), C(ws), { fc: RULE });
  assert.ok(!html.includes('<img') && html.includes('&lt;img'));
});

test('IRR 판단기준: 못 읽으면 읽지 못함 + 안내 문구, 값은 비어 있다', function () {
  const ws = bw.buildState(form(), respFail(), {});
  const c = C(ws), t = T(ws);
  assert.strictEqual(c.value, ''); assert.strictEqual(c.status, 'failed');
  assert.strictEqual(bw.cellInfo(t, c).unreadable, true);
  const msg = '수익성분석표에서 투자가부결정기준(IRR)을 찾지 못했습니다 — 직접 입력하세요';
  assert.strictEqual(bw.reasonText('IRR_RULE_UNREADABLE'), msg);
  assert.ok(bw.infoLines(t, c).some(function (l) { return l.k === 'note' && l.text === '읽지 못함: ' + msg; }));
  assert.ok(bw.valueCellHtml(t, c, { fc: RULE }).includes('읽지 못함'));
  assert.deepStrictEqual(bw.numberProblems(ws, bw.numericKeys(form())), []);
  assert.strictEqual(bw.tally(ws).failed, 1);
});

test('IRR 판단기준: 서버가 칸을 안 주면 양식의 기본 문구가 그대로 보인다', function () {
  const r = respOk(SENT); r.tables[0].cells.pop();   // r3_c2 없음(옛 서버)
  const ws = bw.buildState(form(), r, {});
  assert.strictEqual(C(ws), undefined);
  const html = bw.cardHtml(ws, T(ws), bw.freshUi(), null);
  assert.ok(html.includes(DEF));
});

test('IRR 판단기준: 저장본으로 열면 값이 없을 때 기본 문구를 흐리게, 저장값이 있으면 그 값을', function () {
  const empty = bw.stateFromSaved(form(), {}, {});
  const c = C(empty), t = T(empty);
  assert.strictEqual(c.manual, true); assert.strictEqual(c.value, ''); assert.strictEqual(c.dflt, DEF);
  const html = bw.valueCellHtml(t, c, { fc: RULE });
  assert.ok(html.includes('<span class="bd-w-dflt">' + DEF + '</span>') && !html.includes('직접 입력</span>'));
  assert.ok(bw.cellAria(t, c).includes('기본 문구'));
  assert.deepStrictEqual(bw.matDirty(empty, {}), [], '기본 문구는 저장값이 아니라 고친 칸으로 안 센다');
  const saved = bw.stateFromSaved(form(), { 'C-4': { r3_c2: '직접 쓴 문구' } }, {});
  const h2 = bw.valueCellHtml(T(saved), C(saved), { fc: RULE });
  assert.ok(h2.includes('직접 쓴 문구') && !h2.includes('bd-w-dflt'));
  // 다른 입력 칸(기관명)은 기본 문구 없이 예전 그대로 '직접 입력'
  const a = bw.findT(empty, 'A').cells.r1c0;
  assert.strictEqual(a.dflt, '');
  assert.ok(bw.valueCellHtml(bw.findT(empty, 'A'), a, { fc: { key: 'r1c0', text: '기관', input: true } }).includes('직접 입력'));
});

test('IRR 판단기준 + 엑셀 올리기: 읽으면 엑셀 문장이 이기고, 못 읽으면 저장본 문구를 살린다', function () {
  const base = { 'C-4': { r3_c2: '손으로 쓴 문구' } };
  const ok = bw.adoptManual(bw.buildState(form(), respOk(SENT), {}), base);
  assert.strictEqual(C(ok).value, SENT);
  assert.deepStrictEqual(bw.matDirty(ok, base).map(function (x) { return x.key; }).sort(), ['r3_c1', 'r3_c2']);
  const fail = bw.adoptManual(bw.buildState(form(), respFail(), {}), base);
  assert.strictEqual(C(fail).value, '손으로 쓴 문구'); assert.strictEqual(C(fail).manual, true); assert.strictEqual(C(fail).status, 'manual');
  assert.strictEqual(bw.cellInfo(T(fail), C(fail)).unreadable, false);
  assert.strictEqual(bw.tally(fail).failed, 0);
  // 저장본에 문구가 없으면 못 읽음 그대로
  const none = bw.adoptManual(bw.buildState(form(), respFail(), {}), { 'C-4': { r3_c2: '' } });
  assert.strictEqual(C(none).status, 'failed'); assert.strictEqual(C(none).value, '');
  // 숫자 칸이 못 읽힌 경우는 저장본을 이어받지 않는다(기존 규칙)
  assert.strictEqual(bw.isTextFill('C-4', 'r3_c1'), false);
});
