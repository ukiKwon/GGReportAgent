'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const render = require('../js/render.js');
const store = require('../js/store.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('regionCardHtml: 열 수 있는 시도 = 형제 button 2개(열기·별), 단추 안 단추 없음, 문자 화살표 없음', function () {
  const h = render.regionCardHtml('11', { drillable: true, on: true, count: 46 });
  assert.ok(h.indexOf('<button type="button" class="rg-open" data-code="11" aria-label="서울, 기관 46곳, 구/시군 보기">') >= 0);
  assert.ok(h.indexOf('<button type="button" class="star" data-code="11" aria-pressed="true" aria-label="서울 관심 지역">') >= 0);
  const open = h.slice(h.indexOf('class="rg-open"'), h.indexOf('</button>', h.indexOf('class="rg-open"')));
  assert.ok(open.indexOf('<button') < 0);
  const star = h.slice(h.indexOf('class="star"'), h.indexOf('</button>', h.indexOf('class="star"')));
  assert.ok(star.indexOf('<button') < 0);
  assert.ok(h.indexOf('→') < 0 && h.indexOf('tabindex') < 0);
  assert.ok(h.indexOf('class="rg-open"') < h.indexOf('class="star"'));   // 열기 → 별 순서
  assert.ok(render.regionCardHtml('11', { drillable: true, on: false, count: 3 }).indexOf('aria-pressed="false"') >= 0);
});

test('regionCardHtml: 경계 데이터 없는 시도는 열기 단추 없이 별 단추만', function () {
  const h = render.regionCardHtml('26', { drillable: false, on: false, count: 0 });
  assert.strictEqual(h.split('<button').length - 1, 1);
  assert.ok(h.indexOf('<div class="rg-open">') >= 0 && h.indexOf('구/시군 경계 준비중') >= 0 && h.indexOf('class="rg-open" data-code') < 0);
});

test('시도 카드 hover 강조는 열 수 있는 카드(열기 단추 있음)에만', function () {
  assert.ok(html.indexOf('.rg-card:has(button.rg-open):hover {') >= 0);
  assert.ok(html.indexOf('.rg-card:hover {') < 0);
});

test('drawPinBar 빈 안내문: 별 그림에 접근 이름 "별"', function () {
  const bar = { innerHTML: '' };
  const prevDoc = global.document, prevLoad = store.loadWatch;
  global.document = { getElementById: function () { return bar; } };
  store.loadWatch = function () { return []; };
  try { render.drawPinBar(); } finally { global.document = prevDoc; store.loadWatch = prevLoad; }
  assert.ok(bar.innerHTML.indexOf('role="img" aria-label="별"') >= 0);
});

test('CSS: 별 24×24 이상, 열기 단추 카드 전체 영역, 쪽지 단추 24px, 검색 칸이 전역 입력 규칙', function () {
  assert.ok(/\.rg-card \.star \{[^}]*width:24px[^}]*height:24px/.test(html));
  assert.ok(/button\.rg-open::after \{[^}]*inset:0/.test(html) && /@supports selector\(:has\(\*\)\) \{[^@]*\.rg-card:has\(\.rg-open:focus-visible\)[^@]*\.rg-open:focus-visible \{ outline:none; \}/.test(html));
  assert.strictEqual(html.split('.rg-open:focus-visible { outline:none').length - 1, 1);   // 블록 밖에는 없다
  assert.ok(/@supports selector\(:has\(\*\)\) \{[^@]*#theme-modal label:has\(input\[type=range\]\)/.test(html));
  assert.ok(/\.nt-act button \{[^}]*min-height:24px/.test(html));
  assert.ok(/input\[type=number\], input\[type=search\], input:not\(\[type\]\)/.test(html));
  assert.ok(/\.hb-stgs \{[^}]*padding:8px 16px/.test(html));
  assert.ok(/\.bd-w-prog \{[^}]*border-radius:var\(--r\)/.test(html) && /#hb-ours \.waf i \{[^}]*border-radius:var\(--r\)/.test(html));
  assert.ok(/#ld-hero h1\{[^}]*letter-spacing:-\.02em/.test(html) && /\.lg-say \{[^}]*letter-spacing:-\.02em/.test(html));
  assert.ok(/#landing-view h2\{[^}]*text-wrap:balance/.test(html));
});
