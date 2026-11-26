'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
const allCss = (html.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');   // 랜딩 #ld-style 포함 전체
const faces =css.match(/@font-face\s*\{[^}]*\}/g) || [];

test('KB 글꼴: @font-face 5개 — family·굵기 범위·local() 뒤 url()·woff2 이름', function () {
  const want = [
    ['KB Text', '300 400', 'KBFGText-Light'],
    ['KB Text', '500 600', 'KBFGText-Medium'],
    ['KB Text', '700 900', 'KBFGText-Bold'],
    ['KB Display', '100 400', 'KBFGText-Light'],   // 제목체 안의 400 이하 글자는 본문체 Light로
    ['KB Display', '500 900', 'KBFGDisplay-Bold']
  ];
  assert.strictEqual(faces.length, 5);
  want.forEach(function (w, i) {
    const f = faces[i];
    assert.ok(f.indexOf('font-family:"' + w[0] + '"') >= 0, w[2] + ' family');
    assert.ok(f.indexOf('font-weight:' + w[1] + ';') >= 0, w[2] + ' weight');
    assert.ok(f.indexOf('font-display:swap') >= 0, w[2] + ' swap');
    assert.ok(f.indexOf('unicode-range:U+0000-00B6,U+00B8-2039,U+203B-10FFFF;') >= 0, w[2] + ' unicode-range(› U+203A·· U+00B7 제외)');
    assert.strictEqual((f.match(/local\(/g) || []).length, 3, w[2] + ' local 3개');
    assert.strictEqual((f.match(/url\(/g) || []).length, 1, w[2] + ' url 1개');
    assert.ok(f.lastIndexOf('local(') < f.indexOf('url('), w[2] + ' local이 url보다 앞');
    assert.ok(f.indexOf('local("' + w[2] + '")') >= 0, w[2] + ' PostScript 이름');
    assert.ok(f.indexOf('url("fonts/' + w[2] + '.woff2") format("woff2")') >= 0, w[2] + ' woff2');
    assert.ok(!/https?:|\/\//.test(f.replace(/url\("fonts\//, '')), w[2] + ' 외부 주소 없음');
  });
});

test('KB 글꼴: preload·외부 링크 없음, 글꼴 이름은 --… 선언에만 남는다', function () {
  assert.ok(!/rel=["']?preload/i.test(html));
  assert.ok(!/<link[^>]+font/i.test(html));
  const bad = allCss.split('\n').filter(function (l) { return /Malgun/.test(l) && !/^\s*--[\w-]+:/.test(l); });
  assert.deepStrictEqual(bad, []);   // font 단축 속성·body에 맑은 고딕을 박아 두지 않는다
  const badC = allCss.split('\n').filter(function (l) { return /Consolas/.test(l) && !/^\s*--[\w-]+:/.test(l); });
  assert.deepStrictEqual(badC, []);   // Consolas도 --… 변수 선언에만 남는다
});

test('KB 글꼴: url 이름 4개 고정, fonts/ 는 비어 있어도 되고(PC마다 따로 넣음) 있는 파일은 4개 이름·wOF2 머리·크기>0', function () {
  const dir = path.join(__dirname, '..', 'fonts');
  const names = [];
  faces.join('\n').replace(/url\("fonts\/([^"]+\.woff2)"\)/g, function (m, n) { if (names.indexOf(n) < 0) names.push(n); return m; });
  assert.deepStrictEqual(names.slice().sort(), ['KBFGDisplay-Bold.woff2', 'KBFGText-Bold.woff2', 'KBFGText-Light.woff2', 'KBFGText-Medium.woff2']);
  if (!fs.existsSync(dir)) return;   // 폴더가 없으면 통과 — 파일은 저장소 밖에서 따로 넣는다
  const present = fs.readdirSync(dir).filter(function (f) { return !/^(\.gitkeep|readme(\..*)?)$/i.test(f); });
  present.forEach(function (n) {
    assert.ok(names.indexOf(n) >= 0, n + ' 은(는) 쓰지 않는 글꼴 이름');
    const p = path.join(dir, n);
    assert.ok(fs.statSync(p).size > 0, n + ' 크기 > 0');
    const fd = fs.openSync(p, 'r');
    const head = Buffer.alloc(4);
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    assert.strictEqual(head.toString('latin1'), 'wOF2', n + ' woff2 머리');
  });
});

test('KB 글꼴: 랜딩 얇은 글자(.lg-say·.ld-sub)는 font-weight 300 유지', function () {
  assert.ok(/\.lg-say \{[^}]*font:300 40px\/1\.25 var\(--lg-thin\)/.test(allCss));
  assert.ok(/\.ld-sub\{[^}]*font:300 20px\/1\.6 var\(--ld-thin\)/.test(allCss));
});

test('KB 글꼴: 변수·body·--mono·--lg/--ld 변수', function () {
  assert.ok(css.indexOf('--font-text:"KB Text","Malgun Gothic","Segoe UI",sans-serif;') >= 0);
  assert.ok(css.indexOf('--font-display:"KB Display","KB Text","Malgun Gothic","Segoe UI",sans-serif;') >= 0);
  assert.ok(/(^|\n)\s*body \{[^}]*font-family:var\(--font-text\)/.test(css));
  assert.ok(css.indexOf('--mono:"KB Text",Consolas,') >= 0);
  assert.ok(allCss.indexOf('--ld-mono:var(--mono);') >= 0);
  assert.ok(allCss.indexOf('--lg-sans:var(--font-text);') >= 0 && allCss.indexOf('--ld-sans:var(--font-text);') >= 0);
  assert.ok(allCss.indexOf('--lg-thin:"KB Text",') >= 0 && allCss.indexOf('--ld-thin:"KB Text",') >= 0);
});

test('KB 글꼴: 제목체는 h1~h4, 13px 이하 제목은 그 뒤에서 본문체로 되돌린다', function () {
  const disp = css.indexOf('h1, h2, h3, h4 { font-family:var(--font-display); }');
  assert.ok(disp > 0);
  const back = /\.bd-m-return h3, \.mn h4, \.db-sub-h h4, \.hb-rec h4, \.bs-auto h3, \.rs-rm-h h3,[^{]*\{ font-family:var\(--font-text\); \}/.exec(css);
  assert.ok(back && back.index > disp);
  ['.ad-sub', '.ts-sec-h', '.ts-doc-h', '.dc-h', '#dg-memo-h'].forEach(function (s) { assert.ok(back[0].indexOf(s) >= 0, s); });
  assert.ok(/\.lg-notice h3 \{[^}]*var\(--lg-serif\)/.test(css));   // 명조 제목은 그대로
  assert.ok(css.indexOf('input, select, textarea { font-family:inherit; }') > 0);
});
