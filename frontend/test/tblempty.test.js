'use strict';
// 빈 표 한 줄 도우미 (사용자 11-26, DESIGN '빈 표')
const test = require('node:test');
const assert = require('node:assert');
const te = require('../js/tblempty.js');

function count(s, re) { return (s.match(re) || []).length; }

test('rowHtml: 열 수만큼 td, 첫 칸에 sr-only 비어 있음', function () {
  const h = te.rowHtml(4);
  assert.strictEqual(count(h, /<td>/g), 4);
  assert.ok(h.indexOf('<tr class="tb-empty"><td><span class="sr-only">비어 있음</span></td>') === 0);
  assert.ok(h.indexOf('colspan') < 0);
});

test('rowHtml: 0·음수·문자열·undefined 는 1칸', function () {
  [0, -3, 'x', undefined, null].forEach(function (n) { assert.strictEqual(count(te.rowHtml(n), /<td>/g), 1); });
  assert.strictEqual(count(te.rowHtml('3'), /<td>/g), 3);
});

test('rowHtml: cls·sr 는 esc', function () {
  const h = te.rowHtml(2, { cls: 'a"><b', sr: '<i>' });
  assert.ok(h.indexOf('<b') < 0 && h.indexOf('<i>') < 0);
  assert.ok(h.indexOf('&lt;i&gt;') >= 0 && h.indexOf('a&quot;&gt;&lt;b') >= 0);
});

test('noteHtml: 빈 입력은 빈 문자열, 글은 esc, 단추는 그대로', function () {
  assert.strictEqual(te.noteHtml(''), '');
  assert.strictEqual(te.noteHtml('', ''), '');
  assert.strictEqual(te.noteHtml('<x>'), '<p class="tb-empty-note">&lt;x&gt;</p>');
  assert.ok(te.noteHtml('없음', '<button>풀기</button>', { id: 'n1' }).indexOf('<p class="tb-empty-note" id="n1">없음 <button>풀기</button></p>') === 0);
});

test('rowEl/noteEl: DOM 칸 수', function () {
  function mk(tag) {
    const e = { tag: tag, className: '', children: [], textContent: '', appendChild: function (c) { e.children.push(c); } };
    return e;
  }
  const doc = { createElement: mk };
  const tr = te.rowEl(doc, 3);
  assert.strictEqual(tr.className, 'tb-empty');
  assert.strictEqual(tr.children.length, 3);
  assert.strictEqual(tr.children[0].children[0].textContent, '비어 있음');
  assert.strictEqual(tr.children[1].children.length, 0);
  assert.strictEqual(te.rowEl(doc, 0).children.length, 1);
  const p = te.noteEl(doc, '문장');
  assert.strictEqual(p.className, 'tb-empty-note');
  assert.strictEqual(p.textContent, '문장');
});
