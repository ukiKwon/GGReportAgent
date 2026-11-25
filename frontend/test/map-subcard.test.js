// 지역별 공고현황 시군구 드릴인 '지시선 카드'(사용자 11-24, design-reviewer 2026-11-24_1544, 팀 결정 11-24).
// 카드 줄 구성·배치 계산(순수 함수)·aria·범례·소스 계약(줌 해제·sub-urgent 삭제·CSS 토큰).
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
function rec(days, confirmed, name) {
  return { name: name, type: '지자체', contractEnd: dateAfter(days), confirmed: confirmed !== false };
}
function withDoc(doc, fn) {
  const prev = global.document;
  global.document = doc;
  try { return fn(); } finally { if (prev === undefined) delete global.document; else global.document = prev; }
}
const S = logic.SUBCARD;

// ── 카드 줄 ───────────────────────────────────────────────────────────
// subCardLines·subCardEligible 시험은 예상 공고현황 기준으로 map_expected.test.js에 있다(2026-11-25).

test('subCardHeight: 1줄 38, 2줄 53, 5줄 98', () => {
  assert.strictEqual(logic.subCardHeight(1), 38);
  assert.strictEqual(logic.subCardHeight(2), 53);
  assert.strictEqual(logic.subCardHeight(5), 98);
});

// ── 배치 ─────────────────────────────────────────────────────────────
function noOverlap(list) {
  const s = list.slice().sort((a, b) => a.y - b.y);
  for (let i = 1; i < s.length; i++) assert.ok(s[i - 1].y + s[i - 1].h < s[i].y, s[i - 1].code + ' / ' + s[i].code + ' 겹침');
}
function bySide(lay, side) { return lay.items.filter(i => i.side === side); }

test('layoutSubCards: 지시선은 앵커 → 꺾임(가장자리 ∓12) → 카드 가장자리, 왼쪽 카드 x=8, 오른쪽 x=w-8-120', () => {
  const lay = logic.layoutSubCards([
    { code: 'a', ax: 200, ay: 100, lines: 1, pri: [0, 0, 0, 1] },
    { code: 'b', ax: 500, ay: 30, lines: 1, pri: [0, 0, 0, 1] },
  ], 660, 520);
  const a = lay.items.filter(i => i.code === 'a')[0], b = lay.items.filter(i => i.code === 'b')[0];
  assert.strictEqual(a.side, 'left'); assert.strictEqual(a.x, 8); assert.strictEqual(a.y, 81);
  assert.deepStrictEqual(a.pts, [[200, 100], [140, 100], [128, 100]]);
  assert.strictEqual(b.side, 'right'); assert.strictEqual(b.x, 532); assert.strictEqual(b.y, 12);
  assert.deepStrictEqual(b.pts, [[500, 30], [520, 31], [532, 31]]);
  assert.deepStrictEqual(lay.dropped, []);
  assert.strictEqual(lay.notes.left, null); assert.strictEqual(lay.notes.right, null);
});

test('layoutSubCards: 왼쪽 열은 breadcrumb 아래(top 48)에서 시작하고 가운데선(w/2) 위 앵커는 오른쪽', () => {
  const lay = logic.layoutSubCards([
    { code: 'a', ax: 200, ay: 10, lines: 1, pri: [1, 0, 0, 0] },
    { code: 'm', ax: 330, ay: 10, lines: 1, pri: [1, 0, 0, 0] },
  ], 660, 520);
  assert.strictEqual(lay.items.filter(i => i.code === 'a')[0].y, 48);
  const m = lay.items.filter(i => i.code === 'm')[0];
  assert.strictEqual(m.side, 'right'); assert.strictEqual(m.y, 12);
});

test('layoutSubCards: 한쪽이 넘치고 반대쪽에 자리가 있으면 가운데선에 가까운 면부터 옮긴다(넘침 없음)', () => {
  const items = [];
  for (let i = 0; i < 14; i++) items.push({ code: 'c' + i, ax: 160 + i * 10, ay: 30 + i * 22, lines: 1, pri: [0, 0, 0, 1] });
  for (let i = 14; i < 20; i++) items.push({ code: 'c' + i, ax: 400 + (i - 14) * 10, ay: 30 + i * 22, lines: 1, pri: [0, 0, 0, 1] });
  const lay = logic.layoutSubCards(items, 660, 520);
  assert.strictEqual(lay.items.length, 20); assert.deepStrictEqual(lay.dropped, []);
  assert.strictEqual(bySide(lay, 'left').length, 11);
  assert.strictEqual(bySide(lay, 'right').length, 9);
  ['c11', 'c12', 'c13'].forEach(c => assert.strictEqual(lay.items.filter(i => i.code === c)[0].side, 'right'));
  noOverlap(bySide(lay, 'left')); noOverlap(bySide(lay, 'right'));
  bySide(lay, 'left').forEach(i => { assert.ok(i.y >= 48 && i.y + i.h <= 520 - 12); assert.strictEqual(i.x, 8); });
  bySide(lay, 'right').forEach(i => { assert.ok(i.y >= 12 && i.y + i.h <= 520 - 12); assert.strictEqual(i.x, 532); });
});

test('layoutSubCards: 양쪽 다 넘치면 우선순위가 낮은 카드부터 뺀다, 안내 자리는 열 맨 아래', () => {
  const items = [];
  for (let k = 1; k <= 15; k++) {
    items.push({ code: 'L' + k, ax: 160 + k * 5, ay: 40 + k * 25, lines: 2, pri: [0, 0, 0, k] });
    items.push({ code: 'R' + k, ax: 420 + k * 5, ay: 40 + k * 25, lines: 2, pri: [0, 0, 0, k] });
  }
  const lay = logic.layoutSubCards(items, 660, 520);
  ['left', 'right'].forEach(side => {
    const kept = bySide(lay, side);
    assert.strictEqual(kept.length, 7);
    noOverlap(kept);
    const top = side === 'left' ? 48 : 12;
    const limit = 520 - 12 - (S.GAP + S.NOTE_H);
    kept.forEach(i => { assert.ok(i.y >= top && i.y + i.h <= limit, i.code); });
    const prefix = side === 'left' ? 'L' : 'R';
    const pri = c => Number(c.slice(1));
    const keptK = kept.map(i => pri(i.code)), droppedK = lay.dropped.filter(c => c[0] === prefix).map(pri);
    assert.strictEqual(droppedK.length, 8);
    assert.ok(Math.min.apply(null, keptK) > Math.max.apply(null, droppedK), side + ' 우선순위');
    assert.strictEqual(lay.notes[side].count, 8);
    assert.strictEqual(lay.notes[side].y, 520 - 12 - S.NOTE_H);
    assert.ok(Math.max.apply(null, kept.map(i => i.y + i.h)) + S.GAP <= lay.notes[side].y);
  });
});

test('layoutSubCards: 우선순위 비교는 첫 칸(3개월 안)이 가장 크다(뒤 칸이 많아도 첫 칸 1곳이 이긴다)', () => {
  const items = [];
  for (let i = 0; i < 12; i++) items.push({ code: 'x' + i, ax: 100 + i, ay: 60 + i * 30, lines: 5, pri: [0, 3, 3, 3] });
  items.push({ code: 'notice', ax: 100, ay: 60, lines: 5, pri: [1, 0, 0, 0] });
  const lay = logic.layoutSubCards(items, 660, 520);
  assert.ok(lay.items.some(i => i.code === 'notice'));
  assert.ok(lay.dropped.length > 0 && lay.dropped.indexOf('notice') < 0);
});

test('layoutSubCards: 좌표가 NaN·숫자가 아니거나 줄이 0인 항목은 건너뛴다', () => {
  const lay = logic.layoutSubCards([
    { code: 'n', ax: NaN, ay: 10, lines: 1 }, { code: 'z', ax: 100, ay: null, lines: 1 },
    { code: 'l', ax: 100, ay: 10, lines: 0 }, { code: 'ok', ax: 100, ay: 10, lines: 1 },
  ], 660, 520);
  assert.deepStrictEqual(lay.items.map(i => i.code), ['ok']);
  assert.deepStrictEqual(logic.layoutSubCards(null, 660, 520).items, []);
});

// ── aria·범례 ────────────────────────────────────────────────────────
// mixAriaLabelCard 시험은 map_expected.test.js로 옮겼다(2026-11-25).
test('범례: 드릴인이면 카드 설명 한 줄, 전국은 그 줄이 없음, 생략하면 currentRegion을 따른다', () => {
  const el = { innerHTML: '' };
  const doc = { getElementById: id => (id === 'legend' ? el : null) };
  withDoc(doc, () => render.drawLegend('drill'));
  assert.ok(el.innerHTML.includes('lg-card') && !el.innerHTML.includes('lg-nchip'));
  withDoc(doc, () => render.drawLegend('national'));
  assert.ok(!el.innerHTML.includes('lg-tri"') && !el.innerHTML.includes('lg-nchip') && !el.innerHTML.includes('lg-tri-row') && !el.innerHTML.includes('lg-card'));
  const prev = render.state.currentRegion;
  try {
    render.state.currentRegion = '11';
    withDoc(doc, () => render.drawLegend());
    assert.ok(el.innerHTML.includes('lg-card'));
    render.state.currentRegion = null;
    withDoc(doc, () => render.drawLegend());
    assert.ok(!el.innerHTML.includes('lg-nchip') && !el.innerHTML.includes('lg-card'));
  } finally { render.state.currentRegion = prev; }
});

// ── 소스 계약 ────────────────────────────────────────────────────────
test('render.js: sub-urgent 삭제, 드릴인 줌 해제, fitExtent 여백 열, 카드 층은 마커 뒤, 지자체 흐림은 카드 층에도', () => {
  const r = read('js/render.js');
  assert.ok(r.indexOf('sub-urgent') < 0);
  assert.ok(/svg\.on\('\.zoom', null\)/.test(r));
  assert.ok(/fitExtent\(\[\[S\.G, S\.TOP_R\], \[w - S\.G, h - S\.BOT\]\], fc\)/.test(r));
  assert.ok(/render\.drawMarkers\(code\);[^\n]*\n\s*if \(withCards\) render\._drawSubCards\(/.test(r));
  assert.ok(/selectAll\('g\.sub-card-layer'\)\.attr\('opacity', render\.muniDimOpacity\(\)\)/.test(r));
  assert.ok(r.indexOf("selectAll('g.sub-glyph')") > 0);
  const fn = r.slice(r.indexOf('render._drawSubCards = function'), r.indexOf('render.loadRegionGeoWithRetry'));
  assert.ok(fn.indexOf("'aria-hidden', 'true'") > 0);
  assert.ok(fn.indexOf('tabindex') < 0 && fn.indexOf('render.onSubregionClick(d, ev)') > 0);
});

test('CSS: 지시선 카드 블록은 토큰만(hex는 흰색 #fff만), 카드 글자 12px, 선택 = accent 2px, 지도 면 클릭 외곽선 없음', () => {
  const html = read('index.html');
  const a = html.indexOf('/* 시군구 지시선 카드 시작 */'), b = html.indexOf('/* 시군구 지시선 카드 끝 */');
  assert.ok(a > 0 && b > a);
  const css = html.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepStrictEqual((css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter(h => h.toLowerCase() !== '#fff'), []);
  assert.ok(/\.sub-card text \{[^}]*font-size:12px/.test(css));
  assert.ok(/\.sub-card\.selected \.sc-box \{[^}]*var\(--accent-color\)[^}]*stroke-width:2/.test(css));
  assert.ok(/\.sub-leader \.sl-under \{[^}]*stroke:#fff[^}]*stroke-width:3/.test(css));
  assert.ok(/\.sub-leader \.sl-over \{[^}]*var\(--fg\)[^}]*stroke-width:1[;}]/.test(css));
  assert.ok(!/animation|transition/.test(css));
  // 마우스로 면을 누를 때 브라우저 기본 외곽선(검은 사각형)이 잠깐 보이던 문제(사용자 11-24)
  assert.ok(/\.region:focus, \.subregion:focus,[^{]*\{ outline:none; \}/.test(html));
});
