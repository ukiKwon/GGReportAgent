// 기능 소개 랜딩(js/landing.js + index.html #landing-view·#ld-style)의 순수 함수와 소스 단언.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const landing = require('../js/landing.js');

const ROOT = path.join(__dirname, '..');
const read = function (p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); };
const html = read('index.html');
const src = read('js/landing.js');

const mStart = html.indexOf('<div id="landing-view" hidden>');
const mEnd = html.indexOf('<script src="js/landing.js"></script>');
const markup = html.slice(mStart, mEnd);
const sStart = html.indexOf('<style id="ld-style">');
const css = html.slice(sStart, html.indexOf('</style>', sStart)).replace('<style id="ld-style">', '').replace(/\/\*[\s\S]*?\*\//g, '');

test('hasSession: account·guest만 세션, 깨진 값·저장소 없음은 세션 없음, 키는 store.js와 같다', function () {
  const st = function (v) { return { getItem: function () { return v; } }; };
  assert.strictEqual(landing.hasSession(st('{"mode":"account","id":"a"}')), true);
  assert.strictEqual(landing.hasSession(st('{"mode":"guest"}')), true);
  [null, '', '{', '{"mode":"x"}', 'null'].forEach(function (v) { assert.strictEqual(landing.hasSession(st(v)), false, String(v)); });
  assert.strictEqual(landing.hasSession(null), false);
  assert.strictEqual(landing.hasSession({ getItem: function () { throw new Error('blocked'); } }), false);
  assert.ok(read('js/store.js').indexOf("SESSION_KEY = '" + landing.SESSION_KEY + "'") > 0);
});

test('계산: 써짐 시간·보이는 비율·재생 단위 고르기·진행 줄 채움', function () {
  assert.strictEqual(landing.writeMs('가 나'), 400);
  assert.strictEqual(landing.writeMs('가'.repeat(30)), 900);
  assert.strictEqual(landing.writeMs('가'.repeat(100)), 1400);
  assert.strictEqual(landing.visibleRatio(false, 100, 100, 100), 0);
  assert.strictEqual(landing.visibleRatio(true, 400, 1600, 800), 0.5);
  const a = { ratio: 0.6, min: 0.5 }, b = { ratio: 0.6, min: 0.5 }, c = { ratio: 0.3, min: 0.4 };
  assert.strictEqual(landing.pickUnit([c, a, b]), a);
  assert.strictEqual(landing.pickUnit([c]), null);
  assert.strictEqual(landing.fillProgress(0, 100, 200), 0);
  assert.strictEqual(landing.fillProgress(150, 100, 200), 0.5);
  assert.strictEqual(landing.fillProgress(900, 100, 200), 1);
});

test('마크업: hidden 기본, 로그인 화면 앞, script가 바로 뒤, 시안 문구 없음', function () {
  assert.ok(mStart > 0 && mEnd > mStart && mEnd < html.indexOf('<div id="login-view"'));
  assert.ok(markup.indexOf('시안') < 0 && markup.indexOf('ld-status') < 0);
  assert.strictEqual((markup.match(/data-go="login"/g) || []).length, 3);
  assert.strictEqual((markup.match(/화면 캡처 준비 중/g) || []).length, 4);
  assert.ok(markup.indexOf('가상입니다. 사내 시연용, 외부 배포 금지.</p>') > 0);
  assert.strictEqual((markup.match(/<section\b/g) || []).length, (markup.match(/<\/section>/g) || []).length);
  assert.ok(!/<form[\s>]/.test(markup) && !/(src|href)="https?:/.test(markup));
  (markup.match(/ id="[^"]+"/g) || []).forEach(function (a) { assert.strictEqual(html.split(a).length, 2, 'id 중복:' + a); });
  assert.ok(/<p hidden><button type="button" class="link-btn" id="ld-open">서비스 소개<\/button><\/p>/.test(html.slice(html.indexOf('<div id="login-view"'), html.indexOf('<header>'))));
});

test('업무 흐름 칸 수 = 정본 27칸', function () {
  const got = landing.FLOW_CELLS.map(function (n, i) {
    const a = markup.indexOf('id="flow-' + (i + 1) + '"');
    const chain = /<ol class="ld-chain">([\s\S]*?)<\/ol>/.exec(markup.slice(a))[1];
    return (chain.match(/<li[^>]*>/g) || []).reduce(function (s, li) { const m = /data-cells="(\d+)"/.exec(li); return s + (m ? Number(m[1]) : 1); }, 0);
  });
  assert.deepStrictEqual(got, landing.FLOW_CELLS);
  assert.strictEqual(got.reduce(function (a, b) { return a + b; }, 0), 27);
});

test('장면 토큰: 마크업의 data-* 값은 모두 시간표에 있다', function () {
  const figs = markup.match(/<figure[^>]*data-scene="[^"]+"[\s\S]*?<\/figure>/g);
  assert.strictEqual(figs.length, Object.keys(landing.TIMELINES).length);
  figs.forEach(function (f) {
    const name = /data-scene="([^"]+)"/.exec(f)[1];
    const toks = landing.TIMELINES[name].steps.map(function (s) { return s[1]; });
    (f.match(/data-(?:hl|in|rv|out|fade|flash)="[^"]+"/g) || []).forEach(function (a) {
      assert.ok(toks.indexOf(/="([^"]+)"/.exec(a)[1]) >= 0, name + ' ' + a);
    });
  });
});

function splitTop(list) {
  const out = []; let depth = 0, cur = '';
  list.split('').forEach(function (ch) {
    if (ch === '(') depth += 1; else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  });
  out.push(cur);
  return out.map(function (s) { return s.trim(); });
}

test('CSS: 기존 style 뒤의 #ld-style, 모든 선택자가 #landing-view 아래, 루트 클래스는 붙여 쓴다', function () {
  assert.ok(sStart > html.indexOf('</style>'));
  const body = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '').replace(/@media[^{]+\{/g, '');
  const rules = body.match(/[^{}]+\{[^{}]*\}/g);
  assert.ok(rules.length > 150);
  rules.forEach(function (r) {
    splitTop(r.slice(0, r.indexOf('{'))).forEach(function (s) {
      assert.ok(s.indexOf('#landing-view') === 0 || s.indexOf(':where(#landing-view)') === 0, '격리 안 됨: ' + s);
    });
  });
  assert.ok(!/:where\(#landing-view\) \.ld-(anim|entering|revealing)/.test(css));
  assert.ok(css.indexOf('.ld-status') < 0 && !/url\(|@import|https?:/.test(css));
  assert.ok(/#landing-view\s*\{[^}]*position:fixed[^}]*overflow-y:auto/.test(css));
});

test('동작 소스: 스크롤 기준은 컨테이너, 숨길 때 타이머·관찰자·리스너 정지', function () {
  assert.ok(src.indexOf('opts.root = view') > 0 && src.indexOf("view.addEventListener('scroll'") > 0);
  assert.ok(!/(window|root)\.addEventListener\('scroll'/.test(src) && src.indexOf('innerHeight') < 0);
  assert.ok(/function hide\(\) \{[\s\S]{0,120}stopMotion\(\);/.test(src));
  const s = src.slice(src.indexOf('function stopMotion'), src.indexOf('function setBehind'));
  ['stop(u)', 'clearTimeout(enterTimer)', 'disconnect()', "removeEventListener('visibilitychange'", "removeEventListener('scroll'", "removeEventListener('resize'", 'cancelAnimationFrame']
    .forEach(function (k) { assert.ok(s.indexOf(k) > 0, k); });
  assert.ok(src.indexOf('loginNote') < 0);
});
