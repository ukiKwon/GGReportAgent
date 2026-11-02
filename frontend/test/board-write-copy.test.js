const test = require('node:test');
const assert = require('node:assert');
const bw = require('../js/board-write.js');
require('../js/board.js');
function ws0() {
  const form = { form_id: 'default_doc', name: 'q', tables: [
    { id: 'A', ref: 'A', mapping: 'A', title: '수익성 <분석>', notes: ['단위: 백만원'], rows: [
      [{ text: '구분', header: true, rowspan: 2 }, { text: '금액', header: true, colspan: 2 }],
      [{ text: '2025', header: true }, { text: '2026', header: true }],
      [{ text: '순이익\n(백만원)' }, { key: 'k1', text: '0', mapped: true }, { key: 'k2', text: '0', mapped: true }]] },
    { id: 'B', ref: 'B', mapping: 'B', title: '정적', notes: [], rows: [[{ text: 'x' }]] }] };
  const cell = function (k, v) { return { key: k, value: v, status: 'filled', warnings: [], source: { sheet: 'S', cell: 'A1', display: v, raw: '1233.6', rounded: true } }; };
  return bw.buildState(form, { tables: [{ ref: 'A', needs_review: true, label_mismatches: [], cells: [cell('k1', '1,234'), cell('k2', '<5>')] }],
    sources: [], warnings: [], unmapped_tables: ['B'] }, { fileName: 'a.xlsx' });
}
test('tableCopy 텍스트: 제목·병합 자리 채운 탭 표·주석, 줄바꿈은 공백', function () {
  const p = bw.tableCopy(ws0(), bw.findT(ws0(), 'A'));
  assert.strictEqual(p.text, '수익성 <분석>\n구분\t금액\t\n\t2025\t2026\n순이익 (백만원)\t1,234\t<5>\n단위: 백만원');
});
test('tableCopy HTML: 표·병합·이스케이프, 화면 상태·사유·원래 값·bd- 클래스·data- 속성 없음', function () {
  const h = bw.tableCopy(ws0(), bw.findT(ws0(), 'A')).html;
  assert.ok(h.includes('<table border="1"') && h.includes('rowspan="2"') && h.includes('colspan="2"'));
  assert.ok(h.includes('수익성 &lt;분석&gt;') && h.includes('&lt;5&gt;') && h.includes('순이익<br>(백만원)'));
  assert.ok(h.includes('text-align:right'), '숫자 값은 오른쪽 정렬');
  ['bd-', 'data-', '1233.6', 'class=', '원본', '주의', '확인'].forEach(function (s) { assert.ok(h.indexOf(s) < 0, s); });
});
test('allCopy: 모든 표를 순서대로(정적 표 포함), 표 사이 빈 줄', function () {
  const p = bw.allCopy(ws0());
  assert.ok(p.text.indexOf('수익성 <분석>') < p.text.indexOf('\n\n정적\nx'));
  assert.strictEqual(p.html.split('<table').length - 1, 2);
});
test('copyNote: 표 하나·전체 문구, 덧붙임(막지 않음), 글자만 복사된 경우 안내', function () {
  const ws = ws0();
  let s = bw.copyNote(ws, 'A', { ok: true, rich: true });
  assert.ok(s.startsWith('‘A 수익성 <분석>’ 표를 복사했습니다. 워드에서 Ctrl+V로 붙여 넣으세요.'));
  assert.ok(s.includes('확인하지 않은 칸 2개 / 머리글 주의 표 1개가 그대로 들어 있습니다.'));
  s = bw.copyNote(ws, 'all', { ok: true, rich: false });
  assert.ok(s.startsWith('표 2개를 제목·주석과 함께 복사했습니다.') && s.includes('글자만 복사됐습니다'));
});
test('copyToClipboard: 보안 컨텍스트는 ClipboardItem(html+text), 거절·비보안은 execCommand, 둘 다 안 되면 ok:false', async function () {
  const p = { html: '<table></table>', text: 'a\tb' };
  function Item(o) { this.o = o; }
  function Blob2(parts, o) { this.parts = parts; this.type = o.type; }
  let wrote = null;
  const nav = { clipboard: { write: function (items) { wrote = items; return Promise.resolve(); } } };
  const listeners = {};
  const body = { appendChild: function () {}, removeChild: function () {} };
  function docWith(ok, giveData) {
    return { body: body, createElement: function () { return { setAttribute: function () {}, style: {}, select: function () {} }; },
      addEventListener: function (n, f) { listeners[n] = f; }, removeEventListener: function () { delete listeners.copy; },
      execCommand: function () { if (giveData && listeners.copy) { const data = {}; listeners.copy({ clipboardData: { setData: function (k, v) { data[k] = v; } }, preventDefault: function () {} }); docWith.data = data; } return ok; } };
  }
  let r = await bw.copyToClipboard(p, { navigator: nav, document: docWith(true, true), ClipboardItem: Item, Blob: Blob2, isSecureContext: true });
  assert.deepStrictEqual(r, { ok: true, rich: true, via: 'clipboard' });
  assert.deepStrictEqual(Object.keys(wrote[0].o).sort(), ['text/html', 'text/plain']);
  wrote = null;
  r = await bw.copyToClipboard(p, { navigator: nav, document: docWith(true, true), ClipboardItem: Item, Blob: Blob2, isSecureContext: false });   // http 폐쇄망
  assert.deepStrictEqual(r, { ok: true, rich: true, via: 'exec' });
  assert.strictEqual(wrote, null); assert.strictEqual(docWith.data['text/html'], p.html); assert.strictEqual(docWith.data['text/plain'], p.text);
  const nav2 = { clipboard: { write: function () { return Promise.reject(new Error('denied')); } } };
  r = await bw.copyToClipboard(p, { navigator: nav2, document: docWith(true, false), ClipboardItem: Item, Blob: Blob2, isSecureContext: true });
  assert.deepStrictEqual(r, { ok: true, rich: false, via: 'exec' });   // 글자만
  r = await bw.copyToClipboard(p, { navigator: nav, document: docWith(false, false), ClipboardItem: undefined, Blob: Blob2, isSecureContext: false });
  assert.strictEqual(r.ok, false);
  r = await bw.copyToClipboard(p, {});
  assert.strictEqual(r.ok, false);
});
test('복사 버튼: 표 머리에 [이 표 복사]와 안내, 작성 줄에 [모든 표 복사]', function () {
  const ws = ws0(), ui = bw.freshUi();
  ui.form = { name: 'q' }; ui.copyNote = { scope: 'A', text: '복사했습니다.', err: false };
  const html = bw.writeHtml(ws, ui);
  assert.ok(html.includes('data-w="copy1" data-v="A"') && html.includes('data-w="copyall"') && html.includes('복사했습니다.'));
  ui.copyNote = { scope: 'all', text: bw.COPY_FAIL, err: true };
  assert.ok(bw.writeHtml(ws, ui).includes('role="alert">' + bw.COPY_FAIL));
});
