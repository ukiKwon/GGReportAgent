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
  assert.strictEqual((markup.match(/화면 캡처 준비 중/g) || []).length, 0);
  assert.strictEqual((markup.match(/data-capture="pending"/g) || []).length, 0);
  assert.ok(markup.indexOf('ld-gnote') < 0 && markup.indexOf('예상 공고현황(지도)') < 0);
  assert.ok(markup.indexOf('가상입니다. 사내 시연용, 외부 배포 금지.</p>') > 0);
  assert.strictEqual((markup.match(/<section\b/g) || []).length, (markup.match(/<\/section>/g) || []).length);
  assert.ok(!/<form[\s>]/.test(markup) && !/(src|href)="https?:/.test(markup));
  (markup.match(/ id="[^"]+"/g) || []).forEach(function (a) { assert.strictEqual(html.split(a).length, 2, 'id 중복:' + a); });
  assert.ok(/<p hidden><button type="button" class="link-btn" id="ld-open">서비스 소개<\/button><\/p>/.test(html.slice(html.indexOf('<div id="login-view"'), html.indexOf('<header>'))));
});

test('업무 흐름 칸 수: 4묶음 22칸(정본 27칸 중 심의·이사회 5칸은 랜딩에서 뺌)', function () {
  const got = landing.FLOW_CELLS.map(function (n, i) {
    const a = markup.indexOf('id="flow-' + (i + 1) + '"');
    const chain = /<ol class="ld-chain">([\s\S]*?)<\/ol>/.exec(markup.slice(a))[1];
    return (chain.match(/<li[^>]*>/g) || []).reduce(function (s, li) { const m = /data-cells="(\d+)"/.exec(li); return s + (m ? Number(m[1]) : 1); }, 0);
  });
  assert.deepStrictEqual(got, landing.FLOW_CELLS);
  assert.strictEqual(got.reduce(function (a, b) { return a + b; }, 0), 22);
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

test('업무 흐름 예시 장면 4개: figure.ld-fm, 장면 이름, 가상 표기, 묶음 안 위치', function () {
  const figs = markup.match(/<figure class="ld-mock ld-fm"[\s\S]*?<\/figure>/g) || [];
  assert.deepStrictEqual(figs.map(function (f) { return /data-scene="([^"]+)"/.exec(f)[1]; }), ['map', 'prop', 'prep', 'perf']);
  figs.forEach(function (f) {
    assert.ok(/data-step="end"/.test(f) && /aria-hidden="true"/.test(f), '끝 상태 기본 + aria-hidden');
    assert.ok(f.indexOf('예시 자료(가상)') > 0 && f.indexOf('지금 쓰는 화면') > 0 && f.indexOf('class="ld-ptr"') > 0);
    assert.ok(/<span class="sr-only">/.test(f.slice(f.indexOf('<figcaption'))), 'sr-only 끝 상태 설명');
  });
  ['flow-1', 'flow-2', 'flow-3', 'flow-4'].forEach(function (id, i) {
    const a = markup.indexOf('id="' + id + '"');
    const b = i < 3 ? markup.indexOf('id="flow-' + (i + 2) + '"') : markup.indexOf('id="ld-end"');
    assert.ok(markup.slice(a, b).indexOf('data-scene="' + ['map', 'prop', 'prep', 'perf'][i] + '"') > 0, id);
  });
  assert.ok(markup.indexOf('<b>예상 공고현황</b>') > 0);
  assert.ok(markup.indexOf('가상 자료로 다시 그린 예시입니다.</p>') > 0);
  assert.ok(src.indexOf("$$('.ld-group .ld-mock[data-scene]')") > 0);
});

test('CSS: 업무 흐름 장면의 [data-scene][data-on~=토큰]은 그 장면 시간표에 있다', function () {
  const body = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '').replace(/@media[^{]+\{/g, '');
  let n = 0;
  (body.match(/[^{}]+\{[^{}]*\}/g) || []).forEach(function (r) {
    splitTop(r.slice(0, r.indexOf('{'))).forEach(function (s) {
      const sc = /data-scene="(\w+)"/.exec(s);
      if (!sc) return;
      assert.ok(landing.TIMELINES[sc[1]], '시간표 없음: ' + sc[1]);
      const toks = landing.TIMELINES[sc[1]].steps.map(function (st) { return st[1]; });
      (s.match(/data-on~="[^"]+"/g) || []).forEach(function (a) {
        n += 1;
        assert.ok(toks.indexOf(/="([^"]+)"/.exec(a)[1]) >= 0, sc[1] + ' ' + a);
      });
    });
  });
  assert.ok(n > 40);
  ['map', 'prop', 'prep', 'perf', 'boardmap', 'minutes'].forEach(function (k) { assert.ok(landing.TIMELINES[k].steps[landing.TIMELINES[k].steps.length - 1][1] === 'end'); });
});

test('currentGroup: 기준선을 품은 묶음, 없으면 가장 가까운 묶음', function () {
  const r = [{ top: 0, bottom: 100 }, { top: 100, bottom: 300 }, { top: 340, bottom: 500 }];
  assert.strictEqual(landing.currentGroup(r, 50), 0);
  assert.strictEqual(landing.currentGroup(r, 200), 1);
  assert.strictEqual(landing.currentGroup(r, 330), 2);
  assert.strictEqual(landing.currentGroup(r, 310), 1);
  assert.strictEqual(landing.currentGroup(r, 900), 2);
  assert.strictEqual(landing.currentGroup(r, -50), 0);
  assert.strictEqual(landing.currentGroup([], 10), -1);
});

test('진행 줄: 지금 묶음은 위치 계산(IO 들어옴 아님), layoutRail은 글꼴·크기 변화에도, 정지 때 정리', function () {
  const u = src.slice(src.indexOf('function updateFill'), src.indexOf('function onScroll'));
  assert.ok(u.indexOf('landing.currentGroup') > 0 && u.indexOf('setCurrent') > 0);
  assert.ok(src.indexOf('observe(groups') < 0);
  assert.ok(src.indexOf('doc.fonts.ready') > 0 && src.indexOf('ResizeObserver') > 0 && src.indexOf("'onscrollend' in view") > 0);
  const s = src.slice(src.indexOf('function stopMotion'), src.indexOf('function setBehind'));
  assert.ok(s.indexOf('rszObs.disconnect()') > 0 && s.indexOf("removeEventListener('scrollend'") > 0);
});

test('P3: 탭이 숨거나 랜딩이 닫히면 등장 타이머도 정리한다', function () {
  const e = src.slice(src.indexOf('function evaluate'), src.indexOf('// ── 업무 흐름 진행 줄'));
  assert.ok(/!running \|\| doc\.hidden\) \{ clearTimeout\(enterTimer\)/.test(e));
  assert.ok(e.indexOf("classList.remove('ld-entering')") > 0);
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

test('상태 칩: 장면 8개마다 하나, 종류별 개수와 지금 되는 것 줄', function () {
  const chips = markup.match(/<span class="ld-st is-(?:on|part|soon)">[^<]+<\/span>/g) || [];
  assert.strictEqual(chips.length, 8);
  const by = function (k) { return chips.filter(function (c) { return c.indexOf('is-' + k + '"') > 0; }); };
  assert.deepStrictEqual([by('on').length, by('part').length, by('soon').length], [1, 6, 1]);
  assert.ok(by('on')[0].indexOf('>지금 사용 중<') > 0 && by('soon')[0].indexOf('>준비 중<') > 0);
  by('part').forEach(function (c) { assert.ok(c.indexOf('>일부 사용 중<') > 0); });
  const arts = markup.match(/<article class="ld-(?:scene|trow)[^"]*"[\s\S]*?<\/article>/g) || [];
  assert.deepStrictEqual(arts.map(function (a) { return /id="([^"]+)"/.exec(a)[1]; }),
    ['scene-today', 'scene-rfp', 'scene-check', 'scene-plan', 'scene-boardmap', 'scene-script', 'scene-draft', 'scene-minutes']);
  arts.forEach(function (a) {
    assert.strictEqual((a.match(/class="ld-st is-/g) || []).length, 1);
    assert.strictEqual(a.indexOf('class="ld-st-now"') > 0, a.indexOf('ld-st is-part') > 0, /id="([^"]+)"/.exec(a)[1]);
  });
});

test('AI·자동화 구역 이름·설명, 작은 장면 구역 이름, 옛 문구 없음', function () {
  assert.ok(markup.indexOf('class="ld-reveal-t">AI·자동화로 달라질 일</h2>') > 0);
  assert.ok(markup.indexOf('장면마다 위에 지금 사용 중·일부 사용 중·준비 중을 표시합니다.') > 0);
  assert.ok(markup.indexOf('앞으로 붙일 기능의 완성 모습') < 0 && markup.indexOf('그 밖에 붙일 기능') < 0);
  assert.ok(markup.indexOf('<h3 class="ld-trio-h">그 밖의 기능</h3>') > 0);
  assert.ok(markup.indexOf('대본 틀은 지금 됩니다. 초안은 시범 중입니다.') > 0);
});

test('큰 장면 boardmap: 큰 장면 4개 뒤·작은 장면 앞, 끝 상태 기본, 값 길 11개, 단추 없음', function () {
  const a = markup.indexOf('id="scene-boardmap"');
  assert.ok(markup.indexOf('id="scene-plan"') < a && a < markup.indexOf('id="ld-trio"'));
  const art = markup.slice(a, markup.indexOf('</article>', a));
  assert.ok(art.indexOf('수익성 분석표와 이사회 자료 연동</h3>') > 0);
  assert.ok(art.indexOf('(백만원 단위는 억원으로 바뀝니다). 담당자가 표마다 확인합니다.') > 0);
  assert.ok(/<figure class="ld-mock bx" data-scene="boardmap" data-step="end">/.test(art) && art.indexOf('aria-hidden="true"') > 0);
  assert.ok(art.indexOf('<button') < 0 && art.indexOf('bx-replay') < 0 && art.indexOf('다시 보기') < 0);
  const toks = art.match(/<span class="bx-tok"[^>]*>/g) || [];
  assert.strictEqual(toks.length, 11);
  toks.forEach(function (t) {
    const f = /data-fly-from="\.bx-src\[data-f=(\w+)\]"/.exec(t)[1];
    assert.strictEqual(/data-fly-to="\.bx-to\[data-f=(\w+)\]"/.exec(t)[1], f);
    assert.ok(new RegExp('bx-src[^>]*data-f="' + f + '"').test(art) && new RegExp('bx-to[^>]*data-f="' + f + '"').test(art), f);
  });
  const n = function (re) { return (art.match(re) || []).length; };
  assert.deepStrictEqual([n(/data-hl="rA"/g), n(/data-hl="rC"/g), n(/data-hl="rD"/g)], [3, 24, 4]);
  assert.deepStrictEqual([n(/data-out="lA"/g), n(/data-out="lC"/g), n(/data-out="lD"/g)], [4, 24, 4]);
  assert.deepStrictEqual([n(/data-in="lA"/g), n(/data-in="lC"/g), n(/data-in="lD"/g)], [5, 25, 5]);
});

test('boardmap 시간표: 묶음마다 읽음→옮김→채움, 끝에 확인 대기', function () {
  const st = landing.TIMELINES.boardmap.steps, at = {};
  st.forEach(function (s) { at[s[1]] = s[0]; });
  ['A', 'C', 'D'].forEach(function (g) { assert.ok(at['r' + g] < at['m' + g] && at['m' + g] < at['l' + g], g); });
  assert.ok(at.lA < at.rC && at.lC < at.rD && at.lD < at.done && at.done < at.end);
  for (let i = 1; i < st.length; i++) assert.ok(st[i][0] >= st[i - 1][0]);
  assert.strictEqual(st[st.length - 1][1], 'end');
});

test('flightVars: 무대 기준 출발 위치와 이동량', function () {
  assert.deepStrictEqual(landing.flightVars({ left: 100, top: 50, width: 40, height: 22 }, { left: 300, top: 200, width: 44, height: 29 }, { left: 10, top: 20 }),
    { fx: 90, fy: 30, fw: 40, fh: 22, dx: 200, dy: 150, tw: 44, th: 29 });
  assert.ok(src.indexOf('measureFlights(s.fig)') > 0 && src.indexOf("'[data-fly-from]'") > 0);
});

test('minutes 새 장면: 이사회 녹음 글, 옛 회의록 장면·ld-s7 없음', function () {
  const a = markup.indexOf('id="scene-minutes"');
  const art = markup.slice(a, markup.indexOf('</article>', a));
  assert.ok(art.indexOf('이사회 녹음을 올리면 보완할 곳을 요약</h4>') > 0 && /data-scene="minutes"/.test(art));
  assert.ok(markup.indexOf('회의는 핵심과 할 일로') < 0 && markup.indexOf('ld-s7') < 0 && css.indexOf('ld-s7') < 0);
  assert.strictEqual((art.match(/data-hl="g[123]"/g) || []).length, 3);
});

test('업무 흐름은 4묶음: 심의·이사회·board 없음, 진행 줄이 묶음과 맞음, 27단계 표현 없음, 끊어진 쪽 안 링크 없음', function () {
  assert.deepStrictEqual(landing.FLOW_CELLS, [3, 5, 3, 11]);
  assert.strictEqual((markup.match(/<article class="ld-group"/g) || []).length, 4);
  ['flow-1', 'flow-2', 'flow-3', 'flow-4'].forEach(function (id) {
    assert.ok(markup.indexOf('id="' + id + '"') > 0 && markup.indexOf('id="' + id + '-h"') > 0 && markup.indexOf('aria-labelledby="' + id + '-h"') > 0, id);
  });
  assert.ok(markup.indexOf('id="flow-5"') < 0);
  const rail = markup.slice(markup.indexOf('<nav class="ld-rail"'), markup.indexOf('</nav>', markup.indexOf('<nav class="ld-rail"')));
  assert.deepStrictEqual((rail.match(/<span class="ld-sq">\d+<\/span>/g) || []).map(function (s) { return /(\d+)/.exec(s)[1]; }), ['1', '2', '3', '4']);
  assert.deepStrictEqual((rail.match(/href="#flow-\d"/g) || []), ['href="#flow-1"', 'href="#flow-2"', 'href="#flow-3"', 'href="#flow-4"']);
  assert.deepStrictEqual((rail.match(/ld-rail-name">[^<]+/g) || []).map(function (s) { return s.split('>')[1]; }), ['분석', '제안·제출', '발표·선정', '협약·이행']);
  assert.ok(markup.indexOf('심의·이사회') < 0 && markup.indexOf('data-scene="board"') < 0 && markup.indexOf('ld-bm') < 0);
  assert.ok(markup.indexOf('27단계') < 0 && markup.indexOf('27칸') < 0);
  (markup.match(/href="#[^"]+"/g) || []).forEach(function (h) { assert.ok(markup.indexOf(' id="' + h.slice(7, -1) + '"') > 0, h); });
});
