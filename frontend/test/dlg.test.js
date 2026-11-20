'use strict';
// 공통 팝업 틀(.dlg) — 순수 함수 + index.html/knowledge.js 연결 소스 단언(사용자 11-20 시안 4판).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const dlg = require('../js/dlg.js');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const KN = fs.readFileSync(path.join(__dirname, '..', 'js', 'knowledge.js'), 'utf8');

test('zFor: 열린 순서대로 30부터 쌓이고 시스템 알림(39) 아래에 머문다', function () {
  assert.strictEqual(dlg.zFor(0), 30);
  assert.strictEqual(dlg.zFor(1), 31);
  assert.strictEqual(dlg.zFor(-3), 30);
  assert.strictEqual(dlg.zFor('2'), 32);
  assert.strictEqual(dlg.zFor(99), 38);
});

test('mergeDescribedBy: 기존 연결을 덮어쓰지 않고 합친다', function () {
  assert.strictEqual(dlg.mergeDescribedBy('a b', 'c'), 'a b c');
  assert.strictEqual(dlg.mergeDescribedBy('a  c', 'c'), 'a c');
  assert.strictEqual(dlg.mergeDescribedBy(null, 'x'), 'x');
  assert.strictEqual(dlg.mergeDescribedBy('', ''), '');
});

test('removeDescribedBy: 그 토큰만 빼고, 비면 null', function () {
  assert.strictEqual(dlg.removeDescribedBy('a b c', 'b'), 'a c');
  assert.strictEqual(dlg.removeDescribedBy('x', 'x'), null);
  assert.strictEqual(dlg.removeDescribedBy(null, 'x'), null);
});

test('확인 상자 기본 문장은 시안 4판 그대로', function () {
  assert.strictEqual(dlg.DIRTY_TEXT, '닫으면 입력한 내용이 사라집니다.');
});

test('index.html: dlg.js는 다른 화면 스크립트보다 먼저 읽힌다', function () {
  const d = HTML.indexOf('<script src="js/dlg.js"></script>');
  const k = HTML.indexOf('<script src="js/knowledge.js"></script>');
  assert.ok(d > 0 && k > d);
});

test('index.html: .dlg 기본 폭 560, 예외는 --wide 720·--full 뿐', function () {
  assert.match(HTML, /\.dlg \{[^}]*width:min\(560px/);
  assert.match(HTML, /\.dlg--wide \{ width:min\(720px/);
  assert.match(HTML, /\.dlg--full \{/);
  // 공통 규칙(줄 첫머리의 .dlg--*)만 본다 — 화면 범위 규칙(#plans-root .dlg--s 등)은 그 화면 이행 때 정리.
  assert.doesNotMatch(HTML, /\n\s*\.dlg--(s|m|l) \{/);
});

test('원문 보기(#doc-modal): .dlg 틀 · 동작 없는 보는 창이라 [닫기]는 오른쪽 아래', function () {
  const s = HTML.indexOf('<div id="doc-modal"');
  const block = HTML.slice(s, HTML.indexOf('</div>\n</div>', s));
  assert.match(block, /class="dlg" role="dialog" aria-modal="true" aria-labelledby="doc-title"/);
  assert.match(block, /<h2 class="dlg-t" id="doc-title" tabindex="-1">/);
  assert.match(block, /<footer class="dlg-foot"><button type="button" id="doc-close"[^>]*>닫기<\/button><\/footer>/);
  assert.doesNotMatch(block, /modal-box|style="max-width:840px/);
});

test('knowledge.js: 원문 창은 dlg.open/requestClose로 열고 닫는다(Esc·바깥 클릭은 dlg가 맡음)', function () {
  assert.match(KN, /root\.dlg\.open\(modal\)/);
  assert.match(KN, /root\.dlg\.requestClose\(modal\)/);
  assert.match(KN, /el\('doc-title'\)\.title = /);
});
