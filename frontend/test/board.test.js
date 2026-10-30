const test = require('node:test');
const assert = require('node:assert');
const board = require('../js/board.js');
const nav = require('../js/nav.js');

function res(ok, status, body, blob) {
  return { ok: ok, status: status,
    json: function () { return body === undefined ? Promise.reject(new Error('x')) : Promise.resolve(body); },
    blob: function () { return Promise.resolve(blob); } };
}
// 샘플 기관명: '대한민국 기관'
const DOC = { id: 'default_doc', name: '기본 양식', tables: [
  { id: 't1', mapping: 'A', title: '재산상 이익제공', columns: ['항목', '금액'],
    rows: [[{ text: '대한민국 기관', colspan: 2, rowspan: 3 }], [{ text: '1,234.5', mapped: true }]], notes: ['단위: 백만원'] }] };

// 렌더 병합
test('cellHtml: colspan·rowspan·header를 반영한다', function () {
  const h = board.cellHtml({ text: '합계', colspan: 2, rowspan: 3, header: true });
  assert.ok(h.startsWith('<th '));
  assert.ok(h.includes(' colspan="2"') && h.includes(' rowspan="3"'));
});
test('cellHtml: 1·없음·음수·문자는 병합 속성을 내지 않고 "2"는 2로 본다', function () {
  [{ colspan: 1 }, {}, { colspan: -3 }, { colspan: 'abc' }, { rowspan: '"><x' }].forEach(function (o) {
    const h = board.cellHtml(Object.assign({ text: 'a' }, o));
    assert.ok(!h.includes('colspan') && !h.includes('rowspan'), JSON.stringify(o));
  });
  assert.ok(board.cellHtml({ text: 'a', colspan: '2' }).includes('colspan="2"'));
});
test('cellHtml: 숫자 칸은 bd-num + 우측, 글자 칸은 좌측, 머리글은 숫자 취급 안 함', function () {
  const n = board.cellHtml({ text: '1,234.5' });
  assert.ok(n.includes('bd-num') && n.includes('bd-a-right'));
  assert.ok(board.cellHtml({ text: '△12.3%' }).includes('bd-num'));
  const t = board.cellHtml({ text: '대한민국 기관' });
  assert.ok(!t.includes('bd-num') && t.includes('bd-a-left'));
  assert.ok(!board.cellHtml({ text: '2026', header: true }).includes('bd-num'));
  assert.ok(board.cellHtml({ text: 'x', align: 'center' }).includes('bd-a-center'));
});
test('cellHtml: mapped=true만 은은한 표시', function () {
  assert.ok(board.cellHtml({ text: '1', mapped: true }).includes('bd-mapped'));
  assert.ok(!board.cellHtml({ text: '1', mapped: false }).includes('bd-mapped'));
});
test('tableHtml: columns는 머리행이 rows에 없을 때만 thead, 제목은 caption, notes는 목록', function () {
  const h = board.tableHtml(DOC.tables[0]);
  assert.ok(h.includes('<caption>재산상 이익제공</caption>') && h.includes('<thead>'));
  assert.ok(h.includes('<li>단위: 백만원</li>'));
  const t2 = Object.assign({}, DOC.tables[0], { rows: [[{ text: '구분', header: true }]] });
  assert.ok(!board.tableHtml(t2).includes('<thead>'));
});
test('tableHtml: 서버처럼 columns가 숫자여도 깨지지 않는다', function () {
  const h = board.tableHtml({ columns: 4, rows: [[{ text: '기관명', header: true }]] });
  assert.ok(h.includes('<th ') && !h.includes('<thead>'));
});
test('docHtml: 표마다 카드 하나, 순서대로, 쪽 표시는 없다', function () {
  const h = board.docHtml({ name: 'n', tables: [
    { mapping: 'A', title: 'T1', rows: [] }, { mapping: 'C-2', title: 'T2', rows: [] }] });
  assert.strictEqual((h.match(/<section class="bd-card">/g) || []).length, 2);
  assert.ok(h.indexOf('T1') < h.indexOf('T2'));
  assert.ok(h.includes('<span class="bd-map">A</span>') && h.includes('<span class="bd-map">C-2</span>'));
  assert.ok(!h.includes('bd-page') && !h.includes('p.'));
});
test('docHtml: mapping이 없으면 라벨을 내지 않고, 표가 없으면 안내 문구', function () {
  assert.ok(!board.docHtml({ name: 'n', tables: [{ title: 'T', rows: [] }] }).includes('bd-map'));
  assert.ok(board.docHtml({ name: 'n', tables: [] }).includes('wf-empty'));
});

// XSS
test('모든 텍스트는 이스케이프된다(셀·제목·notes·매핑·양식명·align)', function () {
  const X = '<img src=x onerror=alert(1)>';
  const h = board.docHtml({ name: X, tables: [
    { mapping: X, title: X, columns: [X], rows: [[{ text: X, align: '"><script>' }]], notes: [X] }] });
  assert.ok(!h.includes('<img') && !h.includes('<script'));
  assert.ok(h.includes('&lt;img'));
});
test('stateHtml: 오류 문구도 이스케이프, role=alert', function () {
  const h = board.stateHtml({ status: 'error', error: '<b>x</b>' });
  assert.ok(h.includes('role="alert"') && h.includes('&lt;b&gt;') && !h.includes('<b>'));
});

// 드롭다운 선택
test('FORMS에 default_doc이 있고 optionsHtml은 선택값을 표시한다', function () {
  assert.ok(board.FORMS.some(function (f) { return f.id === 'default_doc'; }));
  const o = board.optionsHtml(board.FORMS, 'default_doc');
  assert.ok(o.startsWith('<option value="">') && o.includes('value="default_doc" selected'));
  assert.ok(!board.optionsHtml(board.FORMS, '').includes('selected'));
});
test('load: 선택한 id로 GET /board-docs/<id>를 부르고 ok면 doc을 돌려준다', async function () {
  let url;
  const r = await board.load(function (u) { url = u; return Promise.resolve(res(true, 200, DOC)); }, 'default_doc');
  assert.strictEqual(url, '/board-docs/default_doc');
  assert.deepStrictEqual(r, { ok: true, doc: DOC });
});

// 오류 상태
test('load: 서버 detail 문자열을 그대로, 비-JSON 오류는 상태코드 문구', async function () {
  let r = await board.load(function () { return Promise.resolve(res(false, 404, { detail: '없는 양식입니다' })); }, 'x');
  assert.deepStrictEqual(r, { ok: false, error: '없는 양식입니다' });
  r = await board.load(function () { return Promise.resolve(res(false, 500, undefined)); }, 'x');
  assert.ok(r.error.includes('500'));
  r = await board.load(function () { return Promise.resolve(res(false, 422, { detail: [{ a: 1 }] })); }, 'x');
  assert.ok(r.error.includes('422'));
});
test('load: 네트워크 실패·형식 오류·빈 tables·옛 pages 형식은 ok:false', async function () {
  let r = await board.load(function () { return Promise.reject(new Error('down')); }, 'x');
  assert.strictEqual(r.ok, false);
  r = await board.load(function () { return Promise.resolve(res(true, 200, { tables: [] })); }, 'x');
  assert.strictEqual(r.ok, false);
  r = await board.load(function () { return Promise.resolve(res(true, 200, { pages: [{ tables: [{}] }] })); }, 'x');
  assert.strictEqual(r.ok, false);
  r = await board.load(function () { return Promise.resolve(res(true, 200, null)); }, 'x');
  assert.strictEqual(r.ok, false);
});
test('validate: 정상 doc은 null', function () { assert.strictEqual(board.validate(DOC), null); });

// 워드 내려받기
test('fetchDocx: /docx를 부르고 blob을 돌려준다, 실패는 ok:false', async function () {
  let url;
  const b = { size: 1 };
  let r = await board.fetchDocx(function (u) { url = u; return Promise.resolve(res(true, 200, undefined, b)); }, 'default_doc');
  assert.strictEqual(url, '/board-docs/default_doc/docx');
  assert.strictEqual(r.blob, b);
  r = await board.fetchDocx(function () { return Promise.resolve(res(false, 403, { detail: '권한이 없습니다' })); }, 'default_doc');
  assert.deepStrictEqual(r, { ok: false, error: '권한이 없습니다' });
});
test('docxFileName: 금지 문자 제거', function () {
  assert.strictEqual(board.docxFileName({ name: 'a/b:c' }, 'x'), 'a_b_c.docx');
  assert.strictEqual(board.docxFileName(null, 'default_doc'), 'default_doc.docx');
});

// 진입 경로 계약
test('SOON_ID는 nav의 이사회 자료 항목 id와 같다(서버 키 없이 연결)', function () {
  const all = {}; ['map','regions','workflow','tasks','approvals','knowledge','chat','admin'].forEach(function (k) { all[k] = true; });
  const built = nav.build(all, { role: '영업팀' });
  const ids = []; built.forEach(function (c) { c.items.forEach(function (i) { ids.push(i.id); }); });
  assert.ok(ids.includes(board.SOON_ID));
});
