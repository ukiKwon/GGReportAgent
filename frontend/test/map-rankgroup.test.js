// 지역별 공고현황 툴팁 줄 나눔(A)·시군구별 목록 묶음(B) — design-reviewer 2026-11-24_1839, 팀 결정 11-24(단위 '건', 기본 숨김 = 1년 이상 남은 기관).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const logic = require('../js/logic.js');
const render = require('../js/render.js');

const ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
const TODAY = new Date('2026-08-21T00:00:00');
function dateAfter(days) { return logic.localDateStr(new Date(2026, 7, 21 + days)); }
function rec(days, name, extra) {
  return Object.assign({ name: name, region: '41', type: '지자체', contractEnd: dateAfter(days), confirmed: true }, extra || {});
}
function nodate(name) { return { name: name, region: '41', type: '지자체' }; }
// 공고 중 1 · 경과 1 · 1개월 미만 2 · 6개월 미만 1 · 1년 미만 1 · 2년 미만 1 · 2년 이상 1 · 알 수 없음 1 = 9건
const MIXED = [rec(-5, '공고a'), rec(-150, '경과a'), rec(10, '가1'), rec(29, '가2'), rec(60, '나'), rec(250, '다'), rec(500, '라'), rec(800, '마'), nodate('미상')];

// ── 순수 로직 ─────────────────────────────────────────────────────────
test('tipBuckets: 6구간(1개월 미만·6개월 미만·1년 미만·2년 미만·2년 이상·알 수 없음), 겹치지 않고 0건은 숨김', () => {
  const info = logic.regionMix(MIXED, TODAY);
  const b = logic.tipBuckets(info);
  assert.deepStrictEqual(b.map(x => [x.label, x.n]), [['1개월 미만', 2], ['6개월 미만', 1], ['1년 미만', 1], ['2년 미만', 1], ['2년 이상', 1], ['알 수 없음', 1]]);
  // 구간 합 + 공고 중 + 경과 = 합계(겹침·누락 없음)
  assert.strictEqual(b.reduce((s, x) => s + x.n, 0) + info.notice + info.overdue, info.total);
  assert.deepStrictEqual(logic.tipBuckets(logic.regionMix([rec(10, 'a')], TODAY)).map(x => x.label), ['1개월 미만']);
  assert.deepStrictEqual(logic.tipBuckets(logic.regionMix([], TODAY)), []);
  assert.deepStrictEqual(logic.tipBuckets(null), []);
});

test('recordBucket: 공고 중·경과·1개월 미만·6개월 미만·1년 미만·2년 미만·2년 이상·알 수 없음', () => {
  const k = r => logic.recordBucket(r, TODAY);
  assert.deepStrictEqual(
    [rec(-5, 'a'), rec(-150, 'b'), rec(10, 'c'), rec(60, 'd'), rec(250, 'e'), rec(500, 'f'), rec(800, 'g'), nodate('h')].map(k),
    ['notice', 'overdue', 'within1', 'within6', 'to12', 'to24', 'over24', 'unknown']);
});

test('groupSummary: 공고 중·경과·1개월 미만·6개월 미만·1년 미만·알 수 없음만(2년 미만·이상은 요약에 없음), 0건 숨김', () => {
  const s = logic.groupSummary(logic.regionMix(MIXED, TODAY));
  assert.deepStrictEqual(s.map(x => [x.label, x.n]), [['공고 중', 1], ['경과', 1], ['1개월 미만', 2], ['6개월 미만', 1], ['1년 미만', 1], ['알 수 없음', 1]]);
  assert.deepStrictEqual(logic.groupSummary(logic.regionMix([rec(500, 'a'), rec(800, 'b')], TODAY)), []);
  assert.deepStrictEqual(logic.groupSummary(null), []);
});

test('faceGroups: 같은 지자체 레코드를 공유하는 면은 한 묶음(수원 4구), 이어져도 한 묶음, 나머지는 면 하나', () => {
  const su = { key: '41|수원시청', name: '수원시청' }, sn = { key: '41|성남시청', name: '성남시청' };
  const g = logic.faceGroups([
    { code: '31011', name: '수원시장안구', muni: [su] }, { code: '31012', name: '수원시권선구', muni: [su] },
    { code: '31020', name: '성남시수정구', muni: [sn] }, { code: '31030', name: '가평군', muni: [] },
  ]);
  assert.deepStrictEqual(g, [
    { code: '31011', name: '수원시', faceCodes: ['31011', '31012'] },
    { code: '31020', name: '성남시수정구', faceCodes: ['31020'] },
    { code: '31030', name: '가평군', faceCodes: ['31030'] }]);
  const k1 = { key: 'k1', name: 'A청' }, k2 = { key: 'k2', name: 'A청' };
  const chain = logic.faceGroups([{ code: 'a', name: 'a', muni: [k1] }, { code: 'b', name: 'b', muni: [k1, k2] }, { code: 'c', name: 'c', muni: [k2] }]);
  assert.strictEqual(chain.length, 1); assert.deepStrictEqual(chain[0].faceCodes, ['a', 'b', 'c']);
  assert.deepStrictEqual(logic.faceGroups(null), []);
});

test('rankGroups: 처음 나온 순서로 묶고, 어느 면에도 없으면 시·군·구 미확인, 1년 이상은 rest, 행이 없는 묶음은 안 만듦', () => {
  const groups = [
    { code: 'g1', name: '가구', faceCodes: ['g1'], keys: ['41|가구청', '41|가공단'] },
    { code: 'g2', name: '나구', faceCodes: ['g2'], keys: ['41|나구청', '41|나공단', '41|가구청'] },   // 가구청은 앞 묶음이 먼저 가진다
    { code: 'g3', name: '빈구', faceCodes: ['g3'], keys: ['41|없음'] },
  ];
  const ranked = [rec(10, '가구청'), rec(20, '무소속'), rec(60, '가공단', { type: '공공기관' }), rec(500, '나구청'), rec(800, '나공단', { type: '공공기관' })];
  const out = logic.rankGroups(ranked, groups, TODAY);
  assert.deepStrictEqual(out.map(g => g.code), ['g1', '', 'g2']);
  const g1 = out[0], none = out[1], g2 = out[2];
  assert.deepStrictEqual(g1.recs.map(r => r.name), ['가구청', '가공단']);
  assert.strictEqual(g1.total, 2); assert.strictEqual(g1.shown.length, 2); assert.strictEqual(g1.rest.length, 0);
  assert.deepStrictEqual(g1.summary.map(s => [s.label, s.n]), [['1개월 미만', 1], ['6개월 미만', 1]]);
  assert.strictEqual(none.name, '시·군·구 미확인'); assert.deepStrictEqual(none.faceCodes, []);
  assert.deepStrictEqual(none.recs.map(r => r.name), ['무소속']);
  assert.strictEqual(g2.shown.length, 0); assert.deepStrictEqual(g2.rest.map(r => r.name), ['나구청', '나공단']);
  assert.deepStrictEqual(g2.summary, []);   // 머리는 '1년 안 입찰 없음'
  assert.deepStrictEqual(logic.rankGroups([], groups, TODAY), []);
});

test('restLabel·groupScrollDelta·groupStatusText', () => {
  assert.strictEqual(logic.restLabel(3, false), '1년 이상 남은 3건 보기');
  assert.strictEqual(logic.restLabel(3, true), '1년 이상 남은 3건 접기');
  // 머리가 보이는 영역 위쪽 1/3 안이면 안 움직이고, 아니면 머리를 맨 위로 맞춘다
  assert.strictEqual(logic.groupScrollDelta(10, 300), 0);
  assert.strictEqual(logic.groupScrollDelta(100, 300), 0);
  assert.strictEqual(logic.groupScrollDelta(101, 300), 101);
  assert.strictEqual(logic.groupScrollDelta(-20, 300), -20);
  assert.strictEqual(logic.groupScrollDelta(500, 300), 500);
  assert.strictEqual(logic.groupStatusText({ name: '강남구', shown: [1, 2, 3, 4], rest: [1, 2, 3] }), '강남구 묶음을 목록에서 표시했습니다. 입찰 가까운 4건, 1년 이상 3건.');
  assert.strictEqual(logic.groupStatusText({ name: '강남구', shown: [1], rest: [] }), '강남구 묶음을 목록에서 표시했습니다. 입찰 가까운 1건.');
  assert.strictEqual(logic.groupStatusText({ name: '강남구', shown: [], rest: [1, 2] }), '강남구 묶음을 목록에서 표시했습니다. 1년 이상 2건.');
});

// ── 툴팁(6-A) ─────────────────────────────────────────────────────────
test('tipHtml: 한 줄에 항목 하나(이름 왼쪽·수 오른쪽), 공고 → 입찰 예정 시기 → 꼬리 순, 단위 건, 가운뎃점 연결 없음', () => {
  const h = render.tipHtml('강남구', logic.regionMix(MIXED, TODAY), TODAY);
  assert.ok(h.includes('<div class="rt-kv rt-t"><span>공고 진행 중</span><span class="rt-n">1건</span></div>'), h);
  assert.ok(h.includes('<span>접수 기간 원문 확인</span><span class="rt-n">1건</span>'), h);
  assert.ok(h.includes('<span class="rt-nm">공고a</span><span class="rt-d rt-q">공고 후 5일</span>'), h);
  assert.ok(h.includes('<div class="rt-kv rt-t"><span>입찰 예정 시기</span></div>'), h);
  assert.ok(!h.includes('가장 임박') && !h.includes('rt-l') && !h.includes('가1'), h);   // '가장 임박' 줄 없음(design 11-24 P2-2)
  ['1개월 미만:2', '6개월 미만:1', '1년 미만:1', '2년 미만:1', '2년 이상:1', '알 수 없음:1'].forEach(s => {
    const p = s.split(':'); assert.ok(h.includes('<span>' + p[0] + '</span><span class="rt-n">' + p[1] + '건</span>'), p[0]);
  });
  assert.ok(h.includes('<span>예정일 경과</span><span class="rt-n">1건</span>') && h.includes('<span>합계</span><span class="rt-n">9건</span>'), h);
  assert.ok(h.includes('<div class="rt-mu">지도 색은 9건 중 7건으로 정했습니다</div>') && !h.includes('뺌'), h);
  assert.ok(h.indexOf('공고 진행 중') < h.indexOf('입찰 예정 시기') && h.indexOf('입찰 예정 시기') < h.indexOf('합계'));
  assert.ok(!/곳|날짜 미상|6개월 안|rt-row| · /.test(h), h);   // 옛 용어·단위·가운뎃점 없음
});

test('tipHtml: 0건 줄·블록은 통째로 숨김, 꼬리는 색을 정한 건수(전부 정했으면 줄 없음), 이름은 이스케이프', () => {
  const one = render.tipHtml('x', logic.regionMix([rec(10, '<b>가</b>')], TODAY), TODAY);
  assert.ok(one.includes('1개월 미만') && !one.includes('6개월 미만') && !one.includes('2년 이상') && !one.includes('rt-notice') && !one.includes('예정일 경과'));
  assert.ok(!one.includes('<b>가</b>') && !one.includes('rt-mu">경과'));
  // '가장 임박' 줄이 없어져 이름은 공고 진행 중 블록에만 나온다 → 거기서 이스케이프를 검증
  const esc = render.tipHtml('x', logic.regionMix([rec(-5, '<b>가</b>')], TODAY), TODAY);
  assert.ok(esc.includes('&lt;b&gt;가&lt;/b&gt;') && !esc.includes('<b>가</b>'), esc);
  const unk = render.tipHtml('x', logic.regionMix([nodate('a'), nodate('b')], TODAY), TODAY);
  assert.ok(unk.includes('<span>알 수 없음</span><span class="rt-n">2건</span>') && unk.includes('지도 색을 정할 건이 없어 회색입니다') && !unk.includes('가장 임박') && !unk.includes('뺌'));
  const part = render.tipHtml('x', logic.regionMix([rec(10, 'a'), nodate('b')], TODAY), TODAY);
  assert.ok(part.includes('지도 색은 2건 중 1건으로 정했습니다') && !part.includes('뺌'));
  assert.ok(!one.includes('rt-mu'));   // 한 건 전부 색에 들어갔으면 안내 줄 없음
  assert.ok(render.tipHtml('빈곳', logic.regionMix([], TODAY), TODAY).includes('켠 종류의 기관이 없습니다'));
});

test('LEGEND_ITEMS: 색 이름이 카드 용어(6개월 미만·1년 미만·2년 미만·2년 이상 위주)', () => {
  assert.deepStrictEqual(render.LEGEND_ITEMS.map(i => i[1]),
    ['6개월 미만 위주', '1년 미만 위주', '섞임 (급한 곳·여유 있는 곳 반반)', '2년 미만 위주', '2년 이상 위주', '날짜 미상']);
});

// ── 묶음 정의·클릭·선택 ───────────────────────────────────────────────
test('rankGroupDefs: 면마다 recordsForFeature로 묶고, 지자체를 공유하는 면은 한 묶음(키는 합집합)', () => {
  const origRf = render.recordsForFeature;
  const su = { name: '수원시청', region: '41', type: '지자체' }, pub = { name: '수원시공단', region: '41', type: '공공기관' }, gp = { name: '가평군청', region: '41', type: '지자체' };
  const map = { a1: [su, pub], a2: [su], b1: [gp] };
  render.REGION_GEO['99'] = () => ({ features: [
    { properties: { code: 'a1', name: '수원시장안구' } }, { properties: { code: 'a2', name: '수원시권선구' } }, { properties: { code: 'b1', name: '가평군' } }] });
  render.recordsForFeature = f => map[f.properties.code];
  try {
    const g = render.rankGroupDefs('99');
    assert.deepStrictEqual(g.map(x => [x.code, x.name, x.faceCodes.join('+'), x.keys.join(',')]),
      [['a1', '수원시', 'a1+a2', '41|수원시청,41|수원시공단'], ['b1', '가평군', 'b1', '41|가평군청']]);
    assert.deepStrictEqual(render.rankGroupDefs('00'), []);
  } finally { render.recordsForFeature = origRf; delete render.REGION_GEO['99']; }
});

test('onSubregionClick: 묶음을 찾으면 묶음 선택(기관 하나를 고르지 않음), 못 찾으면 예전처럼 기관 하나', () => {
  const o = { rec: render.recordForFeature, sg: render.selectGroup, si: render.selectInstitution, fc: render.focusCard, fg: render._faceGroup };
  const calls = { group: [], inst: [], focus: [], stop: 0 };
  render.recordForFeature = () => ({ name: '가구청' });
  render.selectGroup = c => { calls.group.push(c); return !!c; };
  render.selectInstitution = r => calls.inst.push(r.name);
  render.focusCard = n => calls.focus.push(n);
  const ev = { stopPropagation: () => { calls.stop++; } };
  const feat = { properties: { code: 'a2' } };
  try {
    render._faceGroup = { a2: 'a1' };
    render.onSubregionClick(feat, ev);
    assert.deepStrictEqual(calls.group, ['a1']); assert.deepStrictEqual(calls.inst, []); assert.deepStrictEqual(calls.focus, []); assert.strictEqual(calls.stop, 1);
    render._faceGroup = {};   // 소속 없음 → 예전 경로
    render.onSubregionClick(feat, ev);
    assert.deepStrictEqual(calls.inst, ['가구청']); assert.deepStrictEqual(calls.focus, ['가구청']);
    render.recordForFeature = () => null;   // 회색 면은 아무것도 안 하고 흘려보낸다
    const before = calls.stop; render.onSubregionClick(feat, ev);
    assert.strictEqual(calls.stop, before);
  } finally { render.recordForFeature = o.rec; render.selectGroup = o.sg; render.selectInstitution = o.si; render.focusCard = o.fc; render._faceGroup = o.fg; }
});

test('selectGroup: 없는 묶음·빈 코드는 false, 있으면 묶음만 선택(기관 선택은 비움)', () => {
  const o = { cs: render.clearSelection, g: render._groups, n: render._selectedName, sg: render._selectedGroup };
  render.clearSelection = function () { render._selectedGroup = null; };
  try {
    render._groups = [{ code: 'g1', name: '강남구', faceCodes: ['g1'], shown: [1], rest: [] }];
    assert.strictEqual(render.selectGroup('zz'), false);
    assert.strictEqual(render.selectGroup(''), false);
    render._selectedName = '가구청';
    assert.strictEqual(render.selectGroup('g1', { quiet: true }), true);
    assert.strictEqual(render._selectedGroup, 'g1'); assert.strictEqual(render._selectedName, null);
  } finally { render.clearSelection = o.cs; render._groups = o.g; render._selectedName = o.n; render._selectedGroup = o.sg; }
});

// ── 소스·CSS 계약 ─────────────────────────────────────────────────────
test('render.js: 묶음 선택은 clearSelection이 푼다, 빈 곳 클릭 제외 목록에 묶음·펼침 단추, 숨긴 행은 hidden, sr-only 알림, 패널 제목', () => {
  const r = read('js/render.js');
  assert.ok(/clearSelection = function[\s\S]*?\.rk-grp\.on[\s\S]*?render\._selectedGroup = null;/.test(r));
  assert.ok(r.indexOf(".rank-card, .marker, .dm-ov, .hc-ov, .rk-gbtn, .rk-rest-btn") > 0);
  assert.ok(/render\._selectedName \|\| render\._selectedGroup/.test(r));
  assert.ok(r.indexOf('<b>시군구별 기관</b>') > 0 && r.indexOf('<b>랭킹</b>') < 0);
  assert.ok(r.indexOf('<p id="rank-status" class="sr-only" role="status"></p>') > 0);
  assert.ok(/rest\.hidden = true/.test(r) && r.indexOf("'aria-expanded'") > 0 && r.indexOf("'aria-controls'") > 0);
  assert.ok(/state\.currentRegion !== code/.test(r) && r.indexOf('rankOpen') > 0);
});

test('CSS: 툴팁은 2열 줄(rt-kv·rt-it, 폭 232~288), 옛 rt-row·rt-m 없음, 목록 묶음 블록은 토큰만·머리 sticky·880px 이하 static(screen and)', () => {
  const html = read('index.html');
  assert.ok(/#region-tip \{[^}]*min-width:232px[^}]*max-width:288px/.test(html));
  assert.ok(html.includes('#region-tip .rt-kv, #region-tip .rt-it') && html.includes('#region-tip .rt-n { min-width:4ch'));
  assert.ok(!html.includes('#region-tip .rt-row') && !html.includes('#region-tip .rt-m,'));
  const a = html.indexOf('/* 시군구 묶음 목록 시작 */'), b = html.indexOf('/* 시군구 묶음 목록 끝 */');
  assert.ok(a > 0 && b > a);
  const css = html.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepStrictEqual(css.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
  assert.ok(/\.rk-gh \{[^}]*position:sticky[^}]*top:var\(--rank-head-h\)/.test(css));
  // 선택 묶음 몸통 막대는 ::before(자식 hover·.hi 바탕에 안 가림, z-index 1 — 2면 .rank-head를 뚫는다), 머리 막대는 inset 그대로
  assert.ok(/\.rk-grp\.on::before \{[^}]*position:absolute[^}]*width:3px[^}]*var\(--accent-color\)[^}]*z-index:1/.test(css));
  assert.ok(/\.rk-grp\.on \.rk-gh \{[^}]*inset 3px 0 0 var\(--accent-color\)/.test(css));
  // 위계: 머리 --bg 띠·14px, 기관 행 14px 들임 + 세로선
  assert.ok(/\.rk-gh \{[^}]*background:var\(--bg\)[^}]*border-bottom:1px solid var\(--line-strong\)/.test(css));
  assert.ok(/\.rk-gn \{[^}]*font-size:14px/.test(css));
  assert.ok(/\.rk-grp > \.rank-card, \.rk-rest > \.rank-card \{[^}]*margin-left:14px[^}]*border-left:1px solid var\(--line\)/.test(css));
  assert.ok(!html.includes('#region-tip .rt-l '));   // '가장 임박' 줄과 함께 지움
  assert.ok(/\.rk-gbtn:focus-visible \{[^}]*var\(--accent-color\)/.test(css) && /\.rk-rest-btn:focus-visible/.test(css));
  assert.ok(/@media screen and \(max-width:880px\) \{ \.rk-gh \{ position:static; \} \}/.test(css));
  // 움직임 없음: 애니메이션 없음, transition은 전역 button 규칙을 끄는 'none'뿐
  assert.ok(!/animation/.test(css));
  assert.deepStrictEqual(css.match(/transition:[^;}]*/g), ['transition:none', 'transition:none']);
  assert.ok(/\.rk-gbtn \{[^}]*transition:none/.test(css) && /\.rk-rest-btn \{[^}]*transition:none/.test(css));
});

test('묶음 머리 단추 aria-pressed: 기본 false, 선택·해제·복원 때 .on과 같이 true/false', () => {
  const r = read('js/render.js');
  assert.ok(/class="rk-gbtn" id="rkg-' \+ esc\(key\) \+ '" aria-pressed="false"/.test(r));
  // 실제 동작: 단추 하나짜리 가짜 묶음 요소로 _rkPressed 확인
  const attrs = {}; const btn = { setAttribute: (k, v) => { attrs[k] = v; } };
  const sec = { querySelector: s => (s === '.rk-gbtn' ? btn : null) };
  render._rkPressed(sec, true); assert.strictEqual(attrs['aria-pressed'], 'true');
  render._rkPressed(sec, false); assert.strictEqual(attrs['aria-pressed'], 'false');
  render._rkPressed({ querySelector: () => null }, true);   // 미확인 묶음(단추 없음)은 조용히 넘어감
  assert.ok(/classList\.remove\('on'\); render\._rkPressed\(s, false\)/.test(r));   // clearSelection
  assert.ok(/sec\.classList\.add\('on'\); render\._rkPressed\(sec, true\)/.test(r));   // selectGroup
  assert.ok(/on\.classList\.add\('on'\); render\._rkPressed\(on, true\)/.test(r));   // 복원
});

test('mixAriaLabel 전국: 6개월 안 공고 예정(범례와 같은 말), 옛 6개월 안 n건 없음', () => {
  const info = logic.regionMix([rec(10, 'a')], TODAY);
  const t = render.mixAriaLabel('경남', info);
  assert.ok(t.includes('6개월 안 공고 예정 1건') && !/6개월 안 \d/.test(t), t);
});

test('render.js·app.js: 새로 그릴 때 선택 이름을 비워 묶음 자동 펼침을 막고, 묶음 선택 복원은 스크롤하지 않는다', () => {
  const r = read('js/render.js'), a = read('js/app.js');
  // drawRegion: _selectedName을 비우는 줄이 drawRankingPanel 호출보다 앞(highlightCard→_revealCard 펼침 방지)
  const dr = r.slice(r.indexOf('render.drawRegion = function'));
  const clr = dr.indexOf('render._selectedName = null;'), drp = dr.indexOf('render.drawRankingPanel(code)');
  assert.ok(clr > 0 && drp > clr);
  // 복원은 noScroll — render.js redrawKeepSel·app.js 종류 필터
  assert.ok(/selectGroup\(selG, \{ quiet: true, noScroll: true \}\)/.test(r));
  assert.ok(/selectGroup\(selG, \{ quiet: true, noScroll: true \}\)/.test(a));
  assert.ok(!/selectGroup\(selG, \{ quiet: true \}\)/.test(r + a));
});
