'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const renderSrc = fs.readFileSync(path.join(ROOT, 'js', 'render.js'), 'utf8');

// <style> 안에서 주석을 걷고, fa 담당 kbboard(.hb-*) 묶음은 뺀다.
// fa가 그 묶음을 끝내면 아래 cut 두 줄을 지워 전체를 검사한다.
function css() {
  const s = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const a = s.indexOf('국민은행 상태 현황판(kbboard.js) 시작'), b = s.indexOf('국민은행 상태 현황판 끝');
  assert.ok(a > 0 && b > a);
  const cs = s.lastIndexOf('/*', a), ce = s.indexOf('*/', b) + 2;
  return (s.slice(0, cs) + s.slice(ce)).replace(/\/\*[\s\S]*?\*\//g, '');
}
function rules() {
  const out = [], re = /([^{}]+)\{([^{}]*)\}/g; let m; const c = css();
  while ((m = re.exec(c))) out.push({ sel: m[1].trim(), body: m[2] });
  return out;
}

test('모서리: 3px 이상 직접 값 없음, 원(50%)은 점 2곳만', function () {
  const vals = (css().match(/border-radius\s*:\s*[^;}]+/g) || []);
  const bad = vals.filter(function (v) { return /(^|[^\d.-])([3-9]|\d{2,})(\.\d+)?px/.test(v.replace(/var\([^)]*\)/g, '')); });
  assert.deepStrictEqual(bad, []);
  assert.strictEqual(vals.filter(function (v) { return /50%/.test(v); }).length, 2);   // .lg-tl li::before, .nt-dot
});

test('글자: 12px 미만은 SVG 지도 라벨·숫자 칩 예외만', function () {
  const keep = /(^|[\s,>+~])\.label(?![\w-])|\.lg-gu-label|\.nav-count|#notify-badge|\.ov-stamp/;
  const bad = rules().filter(function (r) {
    return /font-size\s*:\s*(9|10|11)px|font\s*:[^;}]*?(?<![\d.])(9|10|11)px/.test(r.body) && !keep.test(r.sel);
  }).map(function (r) { return r.sel; });
  assert.deepStrictEqual(bad, []);
});

test('그림자·떠오름·유리 없음: backdrop-filter·블러 그림자·hover/active 이동 없음', function () {
  const c = css();
  assert.ok(!/backdrop-filter/.test(c));
  assert.ok(!/rgba\(\s*8\s*,\s*12\s*,\s*24/.test(c));
  (c.match(/box-shadow\s*:\s*[^;}]+/g) || []).forEach(function (decl) {
    decl.replace(/^box-shadow\s*:\s*/, '').split(/,(?![^()]*\))/).forEach(function (part) {
      const nums = part.replace(/\([^)]*\)/g, '').trim().split(/\s+/).filter(function (t) { return /^-?[\d.]+(px)?$/.test(t); });
      assert.ok(nums.length < 3 || parseFloat(nums[2]) === 0, '블러 있는 그림자: ' + decl);
    });
  });
  const moving = rules().filter(function (r) {
    return /:(hover|active)/.test(r.sel) && /transform\s*:\s*(translate|scale)/.test(r.body);
  }).map(function (r) { return r.sel; });
  assert.deepStrictEqual(moving, []);
});

test('색 잔재: #626d81·옛 다크 muted 빗금·금색 glow·.08em 자간 없음', function () {
  const c = css();
  assert.ok(!/#626d81/i.test(c));
  assert.ok(!/152\s*,\s*161\s*,\s*175/.test(c));
  assert.ok(!/#d8c47a|216\s*,\s*196\s*,\s*122/i.test(c));
  assert.ok(!/letter-spacing\s*:\s*\.08em/.test(c));
});

test('머리 띠·메뉴·탭: 국민은행 CI 시안 B(진회색 띠 + 옐로 선), 로그아웃·로고 흰색, 탭 닫기 24px', function () {
  const c = css();
  assert.strictEqual((c.match(/#052561/gi) || []).length, 0);   // 남색은 시안 B(사용자 11-19)로 모두 KB Dark Gray로 바뀌었다
  assert.ok(/(^|\n)\s*body > header \{[^}]*background:#545045[^}]*color:#fff/.test(c));
  assert.ok(/\.lg-top \{[^}]*background:#545045; color:#fff; box-shadow:inset 0 -3px 0 var\(--bk-kb, #ffbc00\);/.test(c));
  assert.ok(/\.login-card \{[^}]*border-top:3px solid var\(--bk-kb, #ffbc00\);/.test(c));
  assert.ok(/#login-view \.lg-primary \{[^}]*background:#545045; color:#fff;/.test(c));
  assert.ok(/body > header \.link-btn \{ color:#fff; \}/.test(c) && /body > header \.link-btn:hover \{ color:#ece6da; \}/.test(c));
  // 맨 타입 선택자 header는 JS 팝업 <header class="bd-src-head">(board-write.js)에도 걸린다 — 앱 머리 띠는 body > header로만(qa 11-19 P1)
  const bare = rules().filter(function (r) {
    return r.sel.split(',').some(function (x) { return /^header(\s|$|:)/.test(x.trim()); });
  }).map(function (r) { return r.sel; });
  assert.deepStrictEqual(bare, []);
  assert.ok(/<body[^>]*>[\s\S]*?\n<header>/.test(html) && /'<header class="bd-src-head">/.test(fs.readFileSync(path.join(ROOT, 'js', 'board-write.js'), 'utf8')));
  assert.ok(/\.stab-x \{[^}]*width:24px; height:24px;/.test(c));
  assert.ok(/\.nav-item\.active \{[^}]*inset 3px 0 0 var\(--accent-color\)[^}]*font-weight:700/.test(c));
  const logo = /<header>\s*<h1>[\s\S]*?<\/h1>/.exec(html)[0];
  assert.ok(logo.indexOf('#0b50d0') < 0 && logo.indexOf('currentColor') > 0);
});

test('머리 띠 제목 단추·고정 탭 CSS(11-19, design-reviewer 1428_aab03363 5절)', function () {
  const c = css();
  assert.ok(/<h1><button type="button" id="app-home" class="brand-btn" aria-label="[^"]*시작화면으로 가기"[^>]*><svg/.test(html));
  assert.ok(/body > header \.brand-btn \{[^}]*cursor:pointer/.test(c) && /body > header \.brand-btn:hover \{ background:rgba\(255,255,255,\.14\); \}/.test(c));
  assert.ok(/body > header \.brand-btn:focus-visible \{ outline:2px solid #fff;/.test(c) && /\.brand-btn\[aria-current="page"\] \{ cursor:default; \}/.test(c));
  assert.ok(/\.stab\.pin \{[^}]*padding:7px 12px/.test(c) && /\.stab\.pin \+ \.stab \{ margin-left:5px; \}/.test(c));
  assert.ok(html.indexOf('class="nav-home"') < 0 && !/\.nav-home\b/.test(c));
  // 날짜 머리 = 장부 모양(grid, 오른쪽 D-n), 일정 줄은 24px 들여 쓴다, 기간 칩
  assert.ok(/\.pt-day \{[^}]*display:grid; grid-template-columns:1fr auto;/.test(c) && /#pt-sched \.pt-row \{ padding-left:24px; \}/.test(c));
  assert.ok(/\.pt-span \{[^}]*font:700 12px var\(--mono\)/.test(c));
});

test('지도 강조: 덮개 층 g.sel-ring-layer, raise() 없음, 선택 세 겹(잉크·흰·파랑, 사용자 11-19)·포커스 두 겹', function () {
  assert.ok(!/\.raise\(\)/.test(renderSrc));
  ['sel-ring-layer', '_ringSelect', '_ringFocus', '_ringBlur'].forEach(function (k) { assert.ok(renderSrc.indexOf(k) > 0, k); });
  assert.ok(/clearSelection[\s\S]*?g\.sel-ring-layer path\.ring-sel[\s\S]*?\.remove\(\)/.test(renderSrc));
  assert.ok(/\.on\('focus'[\s\S]*?render\._ringFocus\(this\)[\s\S]*?\.on\('blur'[\s\S]*?render\._ringBlur\(\)/.test(renderSrc));
  const c = css();
  assert.ok(/\.ring-sel\.edge \{[^}]*stroke:var\(--fg\); stroke-width:8;/.test(c) && /\.ring-sel\.under \{[^}]*stroke:#fff; stroke-width:6;/.test(c));
  assert.ok(/\.ring-sel\.over \{[^}]*stroke:var\(--accent-color\); stroke-width:3;/.test(c));
  assert.ok(renderSrc.indexOf("render._ringPaths(layer, 'sel', ds, ['edge', 'under', 'over'])") > 0 && renderSrc.indexOf("layer.insert('path', kind === 'sel' ? 'path.ring-focus' : null)") > 0);   // 포커스가 항상 맨 위
  assert.ok(/\.ring-focus\.under \{[^}]*stroke:var\(--fg\); stroke-width:6;/.test(c));
  assert.ok(/\.ring-focus\.over \{[^}]*stroke:#fff; stroke-width:2\.5;/.test(c));
  assert.ok(/@keyframes muni-blink \{[^}]*stroke-width:3;[^}]*\}[^}]*stroke-width:4;/.test(c) && !/stroke-opacity:\.30/.test(c));
  assert.ok(/\.region:focus-visible, \.subregion:focus-visible \{ outline:none; \}/.test(c));
  assert.ok(/\.region\.watched \{ stroke:var\(--fg\); stroke-width:1\.5; stroke-dasharray:4 2; \}/.test(c));
  assert.ok(/g\.ripple-layer \{ filter:drop-shadow\(0 0 1px #fff\); \}/.test(c));
});

test('테마 창 문구: 포인트 색은 물결·화면 강조만 칠한다', function () {
  assert.ok(html.indexOf('물결·화면 강조색') > 0 && html.indexOf('선택 강조색') < 0);
});
