'use strict';
// 웹 접근성(KWCAG 2.2) 1~3번 — 본문 바로가기, '열어 둔 화면' 탭 키보드, 이름 없던 입력칸 3개 (사용자 11-23 '권장안대로', NEXT 109)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

test('본문 바로가기: header 첫 요소(로그인 중 inert), main에 tabindex=-1, 화면 밖 → 포커스 때 나타남', function () {
  assert.ok(/<header>\s*<a class="skip-link" href="#main">본문 바로가기<\/a>\s*<h1>/.test(html));
  assert.ok(html.indexOf('<main id="main" tabindex="-1">') > 0);
  assert.ok(/body > header \.skip-link \{[^}]*position:fixed;[^}]*top:-\d+px;/.test(css));
  assert.ok(/body > header \.skip-link:focus \{[^}]*top:8px;/.test(css));
  assert.ok(/#main:focus, #main:focus-visible \{ outline:none; \}/.test(css));
  assert.ok(/querySelector\('body > header \.skip-link'\)[\s\S]{0,200}preventDefault\(\);[\s\S]{0,120}getElementById\('main'\)[\s\S]{0,40}\.focus\(\)/.test(app));
  // 로그인 화면이 떠 있는 동안 header가 inert — 바로가기가 거기 들어 있어야 로그인 화면에 새지 않는다
  assert.ok(/setBehindInert[\s\S]{0,200}body > header/.test(app));
});

test('열어 둔 화면 탭: <button role=tab> + 형제 ×, 단추 안 단추 없음, 로빙 tabindex·aria-selected', function () {
  const d = app.slice(app.indexOf('function drawTabs()'), app.indexOf('app.drawNav = function'));
  assert.ok(d.indexOf('role="presentation"') > 0 && d.indexOf('class="stab-tab"') > 0);
  assert.ok(d.indexOf('role="tab" aria-selected="') > 0 && /tabindex="' \+ \(\(on \|\| \(!hasActive && i === 0\)\) \? '0' : '-1'\)/.test(d));
  assert.ok(d.indexOf('role="button"') < 0 && d.indexOf('탭 닫기') < 0);                 // 옛 span 단추 제거
  assert.ok(/<\/button>' \+\s*'<button type="button" class="stab-x"/.test(d));            // 탭 단추가 닫힌 뒤 형제로 ×
  assert.ok(d.indexOf("' 닫기\">×</button>") > 0 && d.indexOf('aria-label="') > 0);
  assert.ok(/if \(kept\) focusTabEl\(kept\.id, kept\.x\);/.test(d));                       // 다시 그려도 포커스 유지
  assert.ok(html.indexOf('id="tab-list" role="tablist" aria-label="열어 둔 화면"') > 0);
});

test('탭 키보드: 화살표·Home·End 포커스 이동(수동 전환), Delete 닫기, 닫은 뒤 이웃 탭 포커스', function () {
  const k = app.slice(app.indexOf("list.addEventListener('keydown'"), app.indexOf("querySelector('body > header .skip-link')"));
  ['ArrowRight', 'ArrowLeft', 'Home', 'End', 'Delete'].forEach(function (key) { assert.ok(k.indexOf("'" + key + "'") > 0, key); });
  assert.ok(k.indexOf('openNavItem') < 0 && k.indexOf('click()') < 0);                    // 화살표는 화면을 바꾸지 않는다
  assert.ok(/classList\.contains\('pin'\)/.test(k));                                        // 시작화면 고정 탭은 Delete로 안 닫힘
  const c = app.slice(app.indexOf('function closeNavTab'), app.indexOf('function drawTabs()'));
  assert.ok(/navTabs\[at\] \|\| navTabs\[at - 1\]/.test(c) && c.indexOf('focusTabEl(nb.id)') > 0 && c.indexOf('mapBtn.focus()') > 0);
});

test('탭 CSS: 단추 기본 모양을 지우고 포커스 링은 탭 상자에, 기존 .stab-x 24px 유지', function () {
  assert.ok(/\.stab-tab, \.stab-tab:hover \{[^}]*background:transparent;[^}]*border:0;[^}]*font:inherit;/.test(css) ||
            /\.stab-tab, \.stab-tab:hover \{[^}]*border:0;[^}]*background:transparent;[^}]*font:inherit;/.test(css));
  assert.ok(/\.stab:has\(\.stab-tab:focus-visible\) \{ outline:2px solid var\(--accent-color\);/.test(css));
  assert.ok(/\.stab-x \{[^}]*width:24px; height:24px;[^}]*border:0; background:transparent;/.test(css));
});

test('입력칸 3개에 이름: 대화 입력·파일 선택은 aria-label, 메모는 제목과 aria-labelledby', function () {
  assert.ok(/<textarea id="ch-input"[^>]*aria-label="질문 입력"/.test(html));
  assert.ok(/<input type="file" id="dg-file-input"[^>]*aria-label="업로드할 파일 선택"[^>]*aria-describedby="dg-file-hint"/.test(html));
  assert.ok(html.indexOf('id="dg-file-hint"') > 0);
  assert.ok(/<h4 id="dg-memo-h">메모<\/h4>\s*<textarea id="dg-memo"[^>]*aria-labelledby="dg-memo-h"/.test(html));
});
