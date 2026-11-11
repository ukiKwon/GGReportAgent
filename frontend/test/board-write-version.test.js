const test = require('node:test');
const assert = require('node:assert');
const bw = require('../js/board-write.js');
const X = '<img src=x onerror=alert(1)>';

function form() {
  return { form_id: 'default_doc', name: '기본 양식', version: null, tables: [
    { id: 'A', ref: 'A', mapping: 'A', title: '재산상 이익제공', rows: [
      [{ key: 'h0', text: '구분', header: true }, { key: 'h1', text: '금액', header: true }],
      [{ key: 'r1c0', text: '기관' , input: true }, { key: 'r1c1', text: '0', mapped: true }],
      [{ key: 'r2c0', text: '합계' }, { key: 'r2c1', text: '0', mapped: true }]], notes: [] },
    { id: 'B', ref: 'B', mapping: 'B', title: '정적', rows: [[{ key: 'x', text: '제목' }]], notes: [] }] };
}
const snap = { snap_no: 2, tables: [{ ref: 'A', cells: { r1c0: '본부', r1c1: '1234567', r2c1: '5' } }, { ref: 'Z', cells: { z1: '9' } }] };
function resp(v1, v2) {
  const c = function (k, v) { return { key: k, value: v, status: 'filled', reason: null, warnings: [], source: { sheet: 's', cell: 'C2', display: v, raw: null, rounded: null } }; };
  return { tables: [{ ref: 'A', needs_review: false, label_mismatches: [], sums: [], cells: [c('r1c1', v1), c('r2c1', v2),
    { key: 'r1c0', value: '', status: 'manual', source: { sheet: null }, warnings: [] }] }], sources: [], warnings: [] };
}
function ui(over) { return Object.assign(bw.freshUi(), { mat: Object.assign({ id: '7', bidCaseId: 'BC1', snapNo: 2, base: bw.baseOf(snap), numeric: bw.numericKeys(form()), savedLabel: '김영업 · 11-10 17:24',
  fromExcel: false, noteOpen: false, note: '', saving: false, err: null, ok: null, after: null }, over || {}) }); }

test('isServerNumber·canonNumber: 서버 숫자 문법(13자리, 쉼표 묶음, 소수 2자리)', function () {
  ['0', '-5', '1,234', '1,234,567,890,123', '1234567890123', '1234567890123.99', '1,234.56', '007', '-0.00'].forEach(function (v) { assert.strictEqual(bw.isServerNumber(v), true, v); });
  ['12,345,678,901,234', '99,999,999,999,999', '-12,345,678,901,234', '1,2345', '1,23', '12a', '48.51 (36.85)', '(1,234)', '△1,234', '−5', '5%', '1.234', '12345678901234', '', '.5'].forEach(function (v) { assert.strictEqual(bw.isServerNumber(v), false, v); });
  assert.strictEqual(bw.isServerNumber(' 12 '), true);
  assert.strictEqual(bw.canonNumber('1,234,567'), '1234567');
  assert.strictEqual(bw.canonNumber('00012.50'), '12.5');
  assert.strictEqual(bw.canonNumber('-0.00'), '0');
  assert.strictEqual(bw.canonNumber('-1,000.10'), '-1000.1');
  assert.strictEqual(bw.canonNumber('x'), null);
});

test('baseOf·numericKeys: 저장본 → 기준 맵, 양식의 연결 칸만 숫자 칸', function () {
  assert.deepStrictEqual(bw.baseOf(snap), { A: { r1c0: '본부', r1c1: '1234567', r2c1: '5' }, Z: { z1: '9' } });
  assert.deepStrictEqual(bw.baseOf(null), {});
  assert.deepStrictEqual(bw.numericKeys(form()), { A: { r1c1: true, r2c1: true } });
});

test('stateFromSaved(상태 B): 저장값으로 채운 직접 입력 칸, 값 칸 없는 표는 연결 안 됨, 값 칸은 빈 칸도 포함', function () {
  const ws = bw.stateFromSaved(form(), bw.baseOf(snap), {});
  const t = ws.tables[0];
  assert.strictEqual(t.mapped, true);
  assert.deepStrictEqual(t.order.sort(), ['r1c0', 'r1c1', 'r2c1']);
  assert.strictEqual(t.cells.r1c1.value, '1234567');
  assert.strictEqual(t.cells.r1c1.manual, true);
  assert.strictEqual(bw.cellInfo(t, t.cells.r1c1).edited, false);
  assert.strictEqual(ws.tables[1].mapped, false);
  const empty = bw.stateFromSaved(form(), {}, {});
  assert.strictEqual(empty.tables[0].cells.r2c1.value, '');
});

test('matDirty: 열 때의 저장본과 다른 칸만(숫자는 정규형 비교), 저장본에 없던 칸은 빈 값과 비교', function () {
  const base = bw.baseOf(snap);
  let ws = bw.stateFromSaved(form(), base, {});
  assert.deepStrictEqual(bw.matDirty(ws, base), []);
  ws = bw.patchCell(ws, 'A', 'r1c1', { value: '1,234,567' });   // 같은 값(쉼표만 다름)
  assert.deepStrictEqual(bw.matDirty(ws, base), []);
  ws = bw.patchCell(ws, 'A', 'r1c1', { value: '1234568' });
  ws = bw.patchCell(ws, 'A', 'r1c0', { value: '' });
  assert.deepStrictEqual(bw.matDirty(ws, base).map(function (x) { return x.key; }).sort(), ['r1c0', 'r1c1']);
  const none = bw.stateFromSaved(form(), {}, {});
  assert.deepStrictEqual(bw.matDirty(none, {}), []);
  assert.strictEqual(bw.matDirty(bw.patchCell(none, 'A', 'r2c1', { value: '3' }), {}).length, 1);
});

test('adoptManual: 엑셀을 올려도 직접 입력 칸은 저장본 값, 연결 칸은 엑셀 값', function () {
  const base = bw.baseOf(snap);
  let ws = bw.buildState(form(), resp('1,000', '2,000'), {});
  ws = bw.adoptManual(ws, base);
  assert.strictEqual(ws.tables[0].cells.r1c0.value, '본부');
  assert.strictEqual(ws.tables[0].cells.r1c1.value, '1,000');
  assert.deepStrictEqual(bw.matDirty(ws, base).map(function (x) { return x.key; }), ['r1c1', 'r2c1']);   // 1,000 ≠ 1234567, 2,000 ≠ 5
});

test('numberProblems·refreshNumWarn: 괄호 병기·△·% 는 막고 경고를 달며, 고치면 뗀다', function () {
  const num = bw.numericKeys(form());
  let ws = bw.buildState(form(), resp('48.51 (36.85)', '1,000'), {});
  assert.deepStrictEqual(bw.numberProblems(ws, num), [{ t: 'A', key: 'r1c1' }]);
  ws = bw.refreshNumWarn(ws, num);
  assert.ok(ws.tables[0].cells.r1c1.warns.indexOf('NUM_FORMAT') >= 0);
  assert.strictEqual(bw.cellInfo(ws.tables[0], ws.tables[0].cells.r1c1).need, true);
  assert.strictEqual(bw.refreshNumWarn(ws, num).tables[0].cells.r1c1.warns.filter(function (w) { return w === 'NUM_FORMAT'; }).length, 1);   // 중복 없음
  ws = bw.patchCell(ws, 'A', 'r1c1', { value: '48.51' });
  ws = bw.refreshNumWarn(ws, num);
  assert.strictEqual(ws.tables[0].cells.r1c1.warns.indexOf('NUM_FORMAT'), -1);
  assert.deepStrictEqual(bw.numberProblems(ws, num), []);
  ws = bw.patchCell(ws, 'A', 'r1c0', { value: '(가나다)' });   // 직접 입력 칸은 숫자 검사 대상이 아니다
  assert.deepStrictEqual(bw.numberProblems(ws, num), []);
  const bad = bw.buildState(form(), resp('48.51 (36.85)', '1,000'), {});
  assert.strictEqual(bw.numberErrorLocal(bw.numberProblems(bad, num)).title, '숫자 칸 1곳의 값이 저장 형식에 맞지 않습니다.');
  assert.deepStrictEqual(bw.numberErrorLocal(bw.numberProblems(bad, num)).cells, [{ t: 'A', key: 'r1c1' }]);
});

test('saveBody·nextBase: 값 칸이 있는 표는 화면 값(trim), 엑셀에 없던 표는 기존 저장본 유지, 메모는 있을 때만', function () {
  const base = bw.baseOf(snap);
  let ws = bw.stateFromSaved(form(), base, {});
  ws = bw.patchCell(ws, 'A', 'r1c1', { value: ' 99 ' });
  const b = bw.saveBody(ws, base, 2, '  본부 확정치  ');
  assert.strictEqual(b.base_snap_no, 2);
  assert.strictEqual(b.note, '본부 확정치');
  assert.deepStrictEqual(b.tables.filter(function (t) { return t.ref === 'A'; })[0].cells, { r1c0: '본부', r1c1: '99', r2c1: '5' });
  assert.deepStrictEqual(b.tables.filter(function (t) { return t.ref === 'Z'; })[0].cells, { z1: '9' });
  assert.ok(!('note' in bw.saveBody(ws, base, 0, '   ')));
  assert.strictEqual(bw.saveBody(ws, base, -1, '').base_snap_no, 0);
  const next = bw.nextBase(ws, base);
  assert.strictEqual(next.A.r1c1, '99');
  assert.strictEqual(base.A.r1c1, '1234567');   // 원본 기준은 바뀌지 않는다
});

test('postSnapshot: URL·메서드·감사 헤더·본문', async function () {
  let seen = null;
  const f = function (url, init) { seen = { url: url, init: init }; return Promise.resolve({ ok: true, status: 201, json: function () { return Promise.resolve({ snap_no: 3, changed: true }); } }); };
  const r = await bw.postSnapshot(f, '7', { base_snap_no: 2, tables: [] });
  assert.strictEqual(seen.url, '/board-materials/7/snapshots');
  assert.strictEqual(seen.init.method, 'POST');
  assert.strictEqual(seen.init.headers['X-Screen-Id'], 'board_write');
  assert.strictEqual(seen.init.headers['X-Button-Id'], 'save_version');
  assert.deepStrictEqual(JSON.parse(seen.init.body), { base_snap_no: 2, tables: [] });
  assert.deepStrictEqual([r.ok, r.status, r.body.snap_no], [true, 201, 3]);
});

test('upload: bid_case_id 는 있을 때만(기존 호출 모양 유지)', async function () {
  const saved = global.FormData;
  global.FormData = function () { this.items = []; this.append = function (k, v) { this.items.push([k, v]); }; };
  try {
    let seen = null;
    const f = function (url, init) { seen = init; return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ tables: [] }); } }); };
    const file = { name: 'a.xlsx' };
    await bw.upload(f, 'default_doc', null, file);
    assert.deepStrictEqual(seen.body.items, [['file', file]]);
    await bw.upload(f, '7', 3, file, null, 'BC1');
    assert.deepStrictEqual(seen.body.items, [['file', file], ['version', '3'], ['bid_case_id', 'BC1']]);
  } finally { global.FormData = saved; }
});

test('saveError: 응답별 제목·안내·버튼(문구는 규격 §5-3)', function () {
  const E = function (status, detail, ctx) { return bw.saveError({ status: status, body: { detail: detail } }, ctx); };
  let e = E(409, { code: 'CONFLICT' }, { k: 4, cur: 4, who: '배지아', atText: '11-10 17:31' });
  assert.strictEqual(e.title, '다른 담당자가 먼저 저장했습니다.');
  assert.strictEqual(e.hint, '버전 4 · 배지아 · 11-10 17:31. 내가 고친 4칸은 아직 이 화면에 있습니다.');
  assert.deepStrictEqual(e.btns.map(function (b) { return b[0]; }), ['m-latest', 'm-force', 'm-drop']);
  assert.strictEqual(e.cur, 4);
  assert.strictEqual(E(409, { code: 'CONFLICT' }, { k: 2 }).hint, '내가 고친 2칸은 아직 이 화면에 있습니다.');
  e = E(409, { code: 'MATERIAL_LOCKED' });
  assert.deepStrictEqual([e.kind, e.btns[0][0]], ['locked', 'm-refresh']);
  e = E(422, { code: 'PII_DETECTED', count: 2, kinds: [{ kind: '휴대폰', count: 2 }], cells: [{ ref: 'A', key: 'r1c1' }, { ref: 'A', key: 'r2c1' }] });
  assert.deepStrictEqual([e.kind, e.mono, e.count, e.cells.length, e.btns[0][1]], ['pii', '휴대폰 형식 2건', 2, 2, '확인 필요 칸 보기']);
  e = E(422, { code: 'PII_DETECTED', kinds: [{ kind: '이메일', count: 1 }] });   // 메모(cells 없음)
  assert.strictEqual(e.kind, 'pii_memo');
  assert.strictEqual(e.title, '메모에 개인정보로 보이는 값이 있어 저장하지 않았습니다.');
  e = E(400, { code: 'BAD_VALUE', message: '숫자 칸에는 숫자만', count: 3, cells: [{ ref: 'A', key: 'r1c1' }] });
  assert.deepStrictEqual([e.kind, e.title, e.btns[0][1]], ['bad_num', '숫자 칸 3곳의 값이 저장 형식에 맞지 않습니다.', '그 칸으로 가기']);
  assert.ok(e.hint.includes('숫자만 입력해 주세요') && e.hint.includes('단위 칸은 그 칸의 단위(년·%)까지') && e.hint.includes("'5.00 (1.00)'처럼 괄호 값까지"));
  assert.ok(!e.hint.includes('기호는 뺍니다'));
  e = E(400, { code: 'BAD_VALUE', message: '칸 값은 100자 이하로 입력해 주세요.', count: 1, cells: [{ ref: 'A', key: 'r1c0' }] });
  assert.deepStrictEqual([e.kind, e.title], ['bad_len', '100자를 넘는 칸이 있어 저장하지 않았습니다.']);
  e = E(400, { code: 'BAD_VALUE', message: '메모는 200자 이하로 입력해 주세요.' });
  assert.deepStrictEqual([e.kind, e.title], ['bad_memo', '메모는 200자 이하로 입력해 주세요.']);
  assert.strictEqual(E(400, { code: 'BAD_VALUE', message: '모르는 표입니다.' }).kind, 'generic');
  assert.strictEqual(E(400, { code: 'TOO_MANY_VERSIONS' }).title, '저장 이력이 200개를 넘어 더 저장할 수 없습니다.');
  e = E(400, { code: 'UI_ID_REQUIRED' });
  assert.deepStrictEqual([e.title, e.btns[0][0]], ['화면 오류로 저장하지 못했습니다.', 'copyall']);
  assert.deepStrictEqual([E(403, null).kind, E(403, null).btns[0][0]], ['forbidden', 'm-tolist']);
  assert.strictEqual(E(404, null).kind, 'notfound');
  assert.strictEqual(E(413, null).title, '저장할 내용이 너무 큽니다.');
  e = bw.saveError({ status: 0, net: true });
  assert.deepStrictEqual([e.kind, e.btns[0][1]], ['net', '다시 저장']);
  assert.strictEqual(bw.saveError({ status: 500, body: null }).kind, 'net');
  assert.strictEqual(bw.numberErrorLocal([{ t: 'A', key: 'r1c1' }]).title, '숫자 칸 1곳의 값이 저장 형식에 맞지 않습니다.');
});

test('errClearedByEdit: 개인정보 오류 칸을 고치면 걷고, 다른 칸·다른 오류는 그대로', function () {
  const pii = bw.saveError({ status: 422, body: { detail: { code: 'PII_DETECTED', count: 2, kinds: [{ kind: '휴대폰', count: 2 }],
    cells: [{ ref: 'A', key: 'r1c1' }, { ref: 'A', key: 'r2c1_p' }] } } });
  assert.strictEqual(bw.errClearedByEdit(pii, 'A', 'r1c1'), true);
  assert.strictEqual(bw.errClearedByEdit(pii, 'A', 'r2c1'), true);     // 괄호 값 칸은 칸 key 로 모인다
  assert.strictEqual(bw.errClearedByEdit(pii, 'A', 'r1c0'), false);    // 목록에 없는 칸
  assert.strictEqual(bw.errClearedByEdit(pii, 'B', 'r1c1'), false);    // 다른 표
  assert.strictEqual(bw.errClearedByEdit(null, 'A', 'r1c1'), false);
  const num = bw.numberErrorLocal([{ t: 'A', key: 'r1c1' }]);
  assert.strictEqual(bw.errClearedByEdit(num, 'A', 'r1c1'), false);    // 숫자 오류는 이 규칙이 아니다
  const memo = bw.saveError({ status: 422, body: { detail: { code: 'PII_DETECTED' } } });
  assert.strictEqual(bw.errClearedByEdit(memo, 'A', 'r1c1'), false);
});

test('autoNeedOff: 저절로 켜진 확인 필요 필터는 문제 칸이 0이 되면 전체로, 직접 고른 필터는 그대로', function () {
  const num = bw.numericKeys(form());
  let ws = bw.refreshNumWarn(bw.buildState(form(), resp('48.51 (36.85)', '1,000'), {}), num);
  ws = bw.setFilter(ws, 'need');
  assert.ok(bw.tally(ws).need > 0);
  assert.strictEqual(bw.autoNeedOff(ws, true).filter, 'need');          // 문제가 남아 있으면 유지
  const fixed = bw.refreshNumWarn(bw.patchCell(ws, 'A', 'r1c1', { value: '48.51' }), num);
  assert.strictEqual(bw.tally(fixed).need, 0);
  assert.strictEqual(bw.autoNeedOff(fixed, true).filter, 'all');
  assert.strictEqual(bw.autoNeedOff(fixed, false).filter, 'need');      // 사용자가 직접 켠 필터
  assert.strictEqual(bw.autoNeedOff(bw.setFilter(fixed, 'edited'), true).filter, 'edited');   // 다른 필터는 건드리지 않는다
});

test('saveError·matErrHtml: 서버 메시지·칸 키는 esc, 값은 싣지 않는다', function () {
  const e = bw.saveError({ status: 400, body: { detail: { code: 'BAD_VALUE', message: X } } });
  assert.strictEqual(e.kind, 'generic');
  const h = bw.matErrHtml(e);
  assert.ok(h.includes('role="alert"') && !h.includes('<img') && h.includes('&lt;img'));
  const p = bw.saveError({ status: 422, body: { detail: { code: 'PII_DETECTED', kinds: [{ kind: X, count: 1 }], cells: [] } } });
  assert.ok(!bw.matErrHtml(p).includes('<img') && bw.matErrHtml(p).includes('&lt;img'));
  assert.ok(p.hint.includes('칸 위치는 표시하지 못했습니다.'));
  const c = bw.saveError({ status: 400, body: { detail: { code: 'BAD_VALUE', message: 'm', count: 1, cells: [{ ref: X, key: X }] } } });
  assert.ok(!bw.matErrHtml(c).includes('<img'));
});

test('okText: 저장·같은 값, 받침에 맞는 조사', function () {
  assert.deepStrictEqual(bw.okText({ snap_no: 3, changed: true }), { title: '버전 3을 저장했습니다.', note: '담당자 모두가 이 값을 봅니다.' });
  assert.strictEqual(bw.okText({ snap_no: 2, changed: true }).title, '버전 2를 저장했습니다.');
  assert.strictEqual(bw.okText({ snap_no: 3, changed: false }).title, '버전 3과 값이 같아 새 버전을 만들지 않았습니다.');
  assert.strictEqual(bw.okText({ snap_no: 2, changed: false }).title, '버전 2와 값이 같아 새 버전을 만들지 않았습니다.');
});

test('matBarHtml: 상태 줄·버튼 순서·[버전 저장] 활성 조건, [작성 끝내기] 없음', function () {
  const base = bw.baseOf(snap);
  let ws = bw.stateFromSaved(form(), base, {});
  let h = bw.matBarHtml(ws, ui());
  assert.ok(h.includes('<span class="bd-clean" id="bd-m-state">버전 2와 같음</span>'));
  assert.ok(/id="bd-m-save" class="bd-wb-main" data-w="m-save" aria-describedby="bd-m-state bd-m-savewhy" aria-expanded="false" disabled>버전 저장/.test(h));
  assert.ok(h.includes('<span class="bd-sr" id="bd-m-savewhy">엑셀을 올리거나 칸 값을 고치면 저장할 수 있습니다.</span>'), '꺼진 이유를 숨김 글자로');
  assert.ok(!h.includes('작성 끝내기') && !h.includes('data-w="end"'));
  assert.ok(h.includes('>엑셀 올리기</button>') && /data-w="srcopen" disabled aria-describedby="bd-m-srcwhy"/.test(h));
  assert.ok(h.indexOf('data-w="swap"') < h.indexOf('data-w="copyall"') && h.indexOf('data-w="copyall"') < h.indexOf('id="bd-w-draft"') && h.indexOf('id="bd-w-draft"') < h.indexOf('id="bd-m-save"'));
  assert.ok(h.includes('[버전 저장]을 눌러야 값이 저장되고 담당자 모두에게 보입니다. 원본 엑셀과 표 확인 표시는 저장되지 않습니다.'));
  ws = bw.patchCell(ws, 'A', 'r1c1', { value: '1' });
  h = bw.matBarHtml(ws, ui());
  assert.ok(h.includes('<span class="bd-dirty" id="bd-m-state">저장하지 않은 수정 1칸</span>'));
  assert.ok(/data-w="m-save" aria-describedby="bd-m-state" aria-expanded="false">버전 저장/.test(h));
  assert.ok(!h.includes('bd-m-savewhy'), '저장할 수 있으면 이유 글자 없음');
  assert.ok(/disabled>저장하는 중…/.test(bw.matBarHtml(ws, ui({ saving: true }))));
  assert.ok(!bw.matBarHtml(ws, ui({ saving: true })).includes('bd-m-savewhy'), '저장 중에는 이유 글자 없음');
  const a0 = bw.matBarHtml(null, ui({ snapNo: 0 }));
  assert.ok(a0.includes('아직 저장한 버전이 없습니다'));
  assert.ok(a0.includes('id="bd-w-draft" data-w="draft" disabled>초안 워드 내려받기'), '표가 없으면 초안 버튼은 꺼짐');
  assert.ok(!a0.includes('data-w="swap"'), '드롭존이 보이는 동안 작성 줄의 [엑셀 올리기]는 없다');
  assert.ok(bw.matBarHtml(ws, ui()).includes('data-w="swap"'), '표가 있으면 있다');
  const up = bw.matBarHtml(null, Object.assign(ui({ snapNo: 0 }), { upload: { name: 'a.xlsx' } }));
  assert.ok(up.includes('data-w="swap" disabled>엑셀 올리기'), '올리는 중에는 꺼진 채로 보인다');
  const e2 = bw.matBarHtml(ws, ui({ fromExcel: true }));
  assert.ok(e2.includes('>엑셀 바꾸기</button>'));
});

test('matNoteHtml·matOkHtml·matSummaryHtml·dropHtml: 메모 줄 문구, esc, 160자부터 글자 수', function () {
  const ws = bw.stateFromSaved(form(), bw.baseOf(snap), {});
  const h = bw.matNoteHtml(ws, ui({ note: X }));
  assert.ok(h.includes('바뀐 칸 0 · 확인 안 한 표 1개(저장은 막지 않습니다)') && h.includes('maxlength="200"') && h.includes('id="bd-m-notecnt" hidden'));
  assert.ok(!h.includes('<img') && h.includes('&lt;img'));
  assert.ok(!bw.matNoteHtml(ws, ui({ note: new Array(161).join('a') })).includes('id="bd-m-notecnt" hidden'));
  assert.ok(h.includes('>이 내용으로 저장</button>') && h.includes('data-w="m-savecancel">취소'));
  const ok = bw.matOkHtml({ title: X, note: '' });
  assert.ok(ok.includes('role="status"') && !ok.includes('<img'));
  assert.strictEqual(bw.matSummaryHtml(ui()).includes('버전 2의 값입니다(김영업 · 11-10 17:24 저장). 원본과 대조하려면 엑셀을 다시 올려 주세요.'), true);
  assert.ok(bw.dropHtml(ui()).includes('값은 [버전 저장]을 눌러야 저장됩니다.'));
  assert.ok(bw.dropHtml(bw.freshUi()).includes('이 화면을 닫으면 작성 내용도 사라집니다.'));
});

test('writeHtml: 자료 모드는 새 작성 줄·요약, 이탈 확인 3버튼, 엑셀 확인, 오류·성공 상자', function () {
  const base = bw.baseOf(snap);
  const ws = bw.patchCell(bw.stateFromSaved(form(), base, {}), 'A', 'r1c1', { value: '1' });
  let h = bw.writeHtml(ws, ui());
  assert.ok(h.includes('id="bd-m-state"') && h.includes('버전 2의 값입니다') && !h.includes('직접 입력하는 칸'));
  assert.ok(!h.includes('id="bd-m-saverow"'));
  h = bw.writeHtml(ws, ui({ noteOpen: true }));
  assert.ok(h.includes('id="bd-m-saverow"'));
  const lv = Object.assign(ui(), { leave: 'mat' });
  h = bw.writeHtml(ws, lv);
  assert.ok(h.includes('저장하지 않은 수정 1칸이 사라집니다. 나가기 전에 저장할까요?'));
  ['버전 저장 후 나가기', '저장하지 않고 나가기', '계속 작성'].forEach(function (t) { assert.ok(h.includes('>' + t + '</button>'), t); });
  assert.ok(h.indexOf('data-w="leave-save"') < h.indexOf('data-w="leave-drop"') && h.indexOf('data-w="leave-drop"') < h.indexOf('data-w="leave-no"'));
  h = bw.writeHtml(ws, Object.assign(ui(), { leave: 'excel' }));
  assert.ok(h.includes('엑셀 값으로 표를 다시 채웁니다. 버전 2는 저장할 때까지 그대로 남습니다. 직접 입력한 칸은 버전 2의 값을 이어받습니다.'));
  assert.ok(bw.leaveHtml('excel', null, { k: 0, snapNo: 3 }).includes('버전 3은 저장할 때까지 그대로 남습니다.'), '받침 있는 숫자는 은');
  assert.ok(bw.leaveHtml('excel', null, { k: 0, snapNo: 1 }).includes('버전 1은 저장할 때까지'));
  assert.ok(!bw.leaveHtml('excel', null, { k: 0, snapNo: 0 }).includes('버전'), '저장본이 없으면 버전 문구 없음');
  assert.ok(h.includes('저장하지 않은 수정 1칸은 사라집니다.') && h.includes('>엑셀로 채우기</button>') && h.includes('>그대로 두기</button>'));
  h = bw.writeHtml(ws, ui({ err: bw.saveError({ status: 403, body: null }), ok: { title: '버전 3을 저장했습니다.', note: '' } }));
  assert.ok(h.includes('id="bd-w-rej"') && h.includes('data-w="m-tolist"') && h.includes('id="bd-m-ok"'));
  assert.ok(bw.writeHtml(null, ui()).includes('id="bd-w-drop"'));
  assert.ok(bw.writeHtml(ws, bw.freshUi()).includes('id="bd-writebar"') && !bw.writeHtml(ws, bw.freshUi()).includes('id="bd-m-state"'), '옛 흐름(ui.mat 없음)은 그대로');
});

test('rejectFrom·rejHtml: 자료 모드 403 = 담당자만, [권한 신청] 없음·[목록으로]; 옛 흐름 403 은 그대로', function () {
  const r = bw.rejectFrom({ status: 403, body: null }, { mat: true });
  assert.strictEqual(r.title, '이 입찰 건의 담당자만 작성할 수 있습니다.');
  assert.deepStrictEqual([r.canPick, r.canPerm, r.canList], [false, false, true]);
  const h = bw.rejHtml(r);
  assert.ok(h.includes('data-w="m-tolist">목록으로') && !h.includes('data-w="perm"') && !h.includes('권한 신청하러 가기'));
  assert.strictEqual(bw.rejectFrom({ status: 404, body: null }, { mat: true }).canReform, false, '만든 뒤에는 양식을 바꿀 수 없다');
  assert.strictEqual(bw.rejectFrom({ status: 422, body: { detail: { code: 'STRUCTURE_MISMATCH', reasons: [] } } }, { mat: true, formName: 'x' }).canReform, false);
  assert.ok(bw.rejectFrom({ status: 403, body: null }, {}).title.includes('업무 수정 권한이 필요합니다'));
});

test('rebaseBase·rebaseBody: 409 뒤 다시 저장 = 최신 저장본 위에 내가 고친 칸만, 다른 표·다른 칸은 최신 값', function () {
  const base = bw.baseOf(snap);
  let ws = bw.stateFromSaved(form(), base, {});
  ws = bw.patchCell(ws, 'A', 'r1c1', { value: ' 99 ' });   // 내가 고친 칸은 이것 하나
  const latest = { A: { r1c0: '다른이', r1c1: '1234567', r2c1: '77' }, Z: { z1: '10' } };   // 남이 r1c0·r2c1·Z 를 고쳐 저장했다
  const next = bw.rebaseBase(ws, base, latest);
  assert.deepStrictEqual(next, { A: { r1c0: '다른이', r1c1: '99', r2c1: '77' }, Z: { z1: '10' } });
  assert.strictEqual(latest.A.r1c1, '1234567', '최신 저장본 객체는 바뀌지 않는다');
  assert.strictEqual(base.A.r1c0, '본부', '내 열 때 기준도 바뀌지 않는다');
  const b = bw.rebaseBody(ws, base, latest, 4, '  재저장  ');
  assert.strictEqual(b.base_snap_no, 4);
  assert.strictEqual(b.note, '재저장');
  assert.deepStrictEqual(b.tables, [{ ref: 'A', cells: { r1c0: '다른이', r1c1: '99', r2c1: '77' } }, { ref: 'Z', cells: { z1: '10' } }]);
  assert.ok(!('note' in bw.rebaseBody(ws, base, latest, 4, '')));
  assert.deepStrictEqual(bw.rebaseBase(ws, base, {}), { A: { r1c1: '99' } }, '최신에 그 표가 없으면 내가 고친 칸만');
  assert.deepStrictEqual(bw.rebaseBase(ws, base, null), { A: { r1c1: '99' } });
  const same = bw.stateFromSaved(form(), base, {});   // 고친 칸이 없으면 최신 그대로
  assert.deepStrictEqual(bw.rebaseBase(same, base, latest), latest);
  assert.strictEqual(bw.saveBody(ws, base, 2, '').tables.filter(function (t) { return t.ref === 'A'; })[0].cells.r2c1, '5', '보통 저장은 화면 값 그대로(기존 동작)');
});

test('adoptSaved: 다시 저장한 뒤 남이 고친 칸을 저장된 값으로 맞춰 바뀐 칸 0 이 된다', function () {
  const base = bw.baseOf(snap);
  let ws = bw.stateFromSaved(form(), base, {});
  ws = bw.patchCell(ws, 'A', 'r1c1', { value: '99' });
  const next = bw.rebaseBase(ws, base, { A: { r1c0: '다른이', r1c1: '1234567', r2c1: '77' } });
  const ws2 = bw.adoptSaved(ws, next);
  assert.strictEqual(ws2.tables[0].cells.r2c1.value, '77');
  assert.strictEqual(ws2.tables[0].cells.r1c0.value, '다른이');
  assert.strictEqual(ws2.tables[0].cells.r1c1.value, '99');
  assert.deepStrictEqual(bw.matDirty(ws2, next), []);
  assert.strictEqual(ws.tables[0].cells.r2c1.value, '5', '원래 ws 는 바뀌지 않는다');
});

test('matSummaryText·matSummaryHtml: 저장자 표시가 없으면 이름 없이, 있으면 그 사람·시각', function () {
  assert.strictEqual(bw.matSummaryText(ui({ savedLabel: '' })), '버전 2의 값입니다. 원본과 대조하려면 엑셀을 다시 올려 주세요.');
  assert.strictEqual(bw.matSummaryText(ui()), '버전 2의 값입니다(김영업 · 11-10 17:24 저장). 원본과 대조하려면 엑셀을 다시 올려 주세요.');
  assert.ok(!bw.matSummaryHtml(ui({ savedLabel: '' })).includes('김영업'));
  assert.ok(bw.matSummaryHtml(ui({ savedLabel: X })).includes('&lt;img') && !bw.matSummaryHtml(ui({ savedLabel: X })).includes('<img'));
});

test('josaNeun: 받침 있는 숫자는 은, 없으면 는', function () {
  assert.deepStrictEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(bw.josaNeun), ['은', '는', '은', '는', '는', '은', '은', '은', '는', '은']);
});

test('board-write.js 소스: 감사 헤더는 board-material 상수로, 정렬 값은 own-property 검사', function () {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'board-write.js'), 'utf8');
  assert.ok(!src.includes("'board_write'") && !src.includes("'save_version'"), '화면·버튼 이름 글자를 직접 쓰지 않는다');
  assert.ok(!/ALIGNS\[/.test(src));
});

test('board-write.js: 새 구간에도 확인창·브라우저 저장소 없음', function () {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'board-write.js'), 'utf8');
  assert.ok(!/\bconfirm\s*\(/.test(src));
  assert.ok(!/localStorage|sessionStorage/.test(src));
});
