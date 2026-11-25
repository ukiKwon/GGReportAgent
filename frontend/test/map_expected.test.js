// 예상 공고현황 지도(2026-11-25, 사용자 결정 안 A · design-reviewer 2026-11-25_1701 · 메인 확정 D1 단일 방식).
// 구간 경계·공고 중/경과 제외·none·근거 글·툴팁·aria·범례·카드·목록·머리 줄·로그인 팝업.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const logic = require('../js/logic.js');
const store = require('../js/store.js');
const render = require('../js/render.js');
const ov = require('../js/overdue.js');

const ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
const TODAY = new Date('2026-08-21T00:00:00');
function dateAfter(days) { return logic.localDateStr(new Date(2026, 7, 21 + days)); }
function rec(days, confirmed, name, extra) {
  return Object.assign({ name: name, region: '41', type: '지자체', contractEnd: dateAfter(days), confirmed: confirmed !== false }, extra || {});
}
function nodate(name) { return { name: name, region: '41', type: '지자체' }; }
function withDoc(doc, fn) {
  const prev = global.document; global.document = doc;
  try { return fn(); } finally { if (prev === undefined) delete global.document; else global.document = prev; }
}
function withFeatureRecords(records, fn) {
  const o = { lookup: render.municipalityForFeature, today: render.state.today };
  render.municipalityForFeature = function () { return records; };
  render.state.today = TODAY;
  try { return fn(); } finally { render.municipalityForFeature = o.lookup; render.state.today = o.today; }
}
// 공고 중 1 · 경과 1 · 3개월 안 2 · 3~6개월 1 · 6개월~1년 1 · 1~2년 1 · 2년 뒤 1 · 근거 없음 1 = 9건
const MIXED = [rec(-5, true, '공고a'), rec(-150, true, '경과a'), rec(10, true, '가1'), rec(29, true, '가2'),
  rec(100, true, '나'), rec(250, true, '다'), rec(500, true, '라'), rec(800, true, '마'), nodate('미상')];

test('구간 경계(일수): 0~91 r3 / 92~182 r2 / 183~365 p / 366~730 b2 / 731~ b3', () => {
  const k = (days, conf) => logic.mapBucket(rec(days, conf, 'x'), TODAY);
  assert.strictEqual(k(0, false), 'r3');                        // 당일 추정 — 확정이면 공고 중이라 notice
  assert.deepStrictEqual([91, 92].map(d => k(d)), ['r3', 'r2']);
  assert.deepStrictEqual([182, 183].map(d => k(d)), ['r2', 'p']);
  assert.deepStrictEqual([365, 366].map(d => k(d)), ['p', 'b2']);
  assert.deepStrictEqual([730, 731].map(d => k(d)), ['b2', 'b3']);
  assert.deepStrictEqual(logic.MAP_LIMITS, [['r3', 91], ['r2', 182], ['p', 365], ['b2', 730]]);
});

test('공고 중·예정일 경과는 지도 집계에서 아예 빠진다(total·buckets·band 어디에도 안 센다)', () => {
  assert.strictEqual(logic.mapBucket(rec(0, true, 'a'), TODAY), 'notice');      // 공고일이 오늘인 확정 공고
  assert.strictEqual(logic.mapBucket(rec(-5, true, 'a'), TODAY), 'notice');
  assert.strictEqual(logic.mapBucket(rec(-150, true, 'a'), TODAY), 'overdue');  // 공고 후 120일 초과
  assert.strictEqual(logic.mapBucket(rec(-1, false, 'a'), TODAY), 'overdue');   // 추정 예정일이 하루 지남
  assert.strictEqual(logic.mapBucket(nodate('a'), TODAY), 'unknown');
  assert.strictEqual(logic.isPreNotice(rec(-5, true, 'a'), TODAY), false);
  const m = logic.regionMix([rec(-5, true, '공고a'), rec(-150, true, '경과a'), rec(10, true, '가'), nodate('미상')], TODAY);
  assert.deepStrictEqual([m.listed, m.total, m.notice, m.overdue], [4, 2, 1, 1]);
  assert.deepStrictEqual(m.buckets, { r3: 1, r2: 0, p: 0, b2: 0, b3: 0, unknown: 1 });
  assert.strictEqual(m.band, 'r3'); assert.strictEqual(m.imminent.name, '가'); assert.strictEqual(m.urgent, 1);
});

test('면 색은 가장 이른 예상 기관의 구간(평균 섞기 없음) — 가까운 1곳 + 먼 9곳도 r3', () => {
  const list = [rec(10, true, '가까움')].concat([1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => rec(800 + i, true, '먼' + i)));
  assert.strictEqual(logic.regionMix(list, TODAY).band, 'r3');
});

test('earliest: 최대 2곳, 남은 일수 순, 같은 날이면 확정이 먼저', () => {
  const m = logic.regionMix([rec(30, false, '추정'), rec(30, true, '확정'), rec(60, true, '셋째'), rec(10, true, '맨앞')], TODAY);
  assert.deepStrictEqual(m.earliest.map(e => e.rec.name), ['맨앞', '확정']);
  assert.strictEqual(m.imminent.name, '맨앞');
  assert.strictEqual(m.earliest[0].date, dateAfter(10));
});

test('none = 공고 전 기관 0곳(켠 종류의 기관이 없을 때도, 공고 중·경과만 있을 때도), gray = 근거 있는 기관이 0곳', () => {
  const empty = logic.regionMix([], TODAY);
  assert.deepStrictEqual([empty.band, empty.listed, empty.total], ['none', 0, 0]);
  const out = logic.regionMix([rec(-5, true, 'a'), rec(-150, true, 'b')], TODAY);
  assert.deepStrictEqual([out.band, out.listed, out.total, out.earliest.length], ['none', 2, 0, 0]);
  const unk = logic.regionMix([nodate('a'), nodate('b')], TODAY);
  assert.deepStrictEqual([unk.band, unk.total, unk.imminent], ['gray', 2, null]);
  assert.strictEqual(render.mixColor(empty), '#eef1f5');
  assert.strictEqual(render.mixColor(out), render.NONE_FILL);
  assert.strictEqual(render.mixColor(unk), render.MAP_COLORS.gray);
  assert.strictEqual(render.mixColor(logic.regionMix([rec(10, true, 'a')], TODAY)), render.MAP_COLORS.r3);
});

test('basisText: 약정주기 계산 · 약정 만료일 기준 · 공고 예정일 확인 · 공고일 기록(미확인) · 예상 근거 없음', () => {
  const T = r => logic.basisText(logic.effectiveBid(r));
  assert.strictEqual(T({ name: 'a', lastBid: '2023-02-01', term: 4 }), '약정주기 계산');
  assert.strictEqual(T({ name: 'b', contractExpiry: '2027-03-31' }), '약정 만료일 기준');
  assert.strictEqual(T(rec(30, true, 'c')), '공고 예정일 확인');
  assert.strictEqual(T(rec(30, false, 'd')), '공고일 기록(미확인)');
  assert.strictEqual(T({ name: 'e' }), '예상 근거 없음');
  assert.strictEqual(logic.mapBucket({ name: 'a', lastBid: '2023-02-01', term: 4 }, TODAY), 'r2');   // 2027-02-01 = 164일 뒤
  assert.strictEqual(logic.mapBucket({ name: 'b', contractExpiry: '2027-03-31' }, TODAY), 'r3');     // 약정 만료 6개월 전 2026-09-30 = 40일 뒤
});

test('subCardLines·subCardEligible: 3개월 안·3~6개월·6개월~1년·근거 없음만, 1년 넘게·공고 중·경과는 카드에 안 씀', () => {
  const lines = logic.subCardLines(logic.regionMix(MIXED, TODAY));
  assert.deepStrictEqual(lines.map(l => [l.label, l.n]), [['3개월 안', 2], ['3~6개월', 1], ['6개월~1년', 1], ['근거 없음', 1]]);
  assert.strictEqual(lines[0].strong, true); assert.strictEqual(lines[3].muted, true); assert.strictEqual(lines[3].full, '예상 근거 없음');
  assert.deepStrictEqual(logic.subCardLines(logic.regionMix([rec(120, true, 'a')], TODAY)).map(l => l.label), ['3~6개월']);
  assert.deepStrictEqual(logic.subCardLines(logic.regionMix([], TODAY)), []);
  assert.deepStrictEqual(logic.subCardLines(null), []);
  assert.strictEqual(logic.subCardEligible(logic.regionMix([rec(500, true, 'a'), rec(-5, true, 'b'), rec(-150, true, 'c')], TODAY)), false);
  assert.strictEqual(logic.subCardEligible(logic.regionMix([nodate('미상')], TODAY)), true);
  assert.strictEqual(logic.subCardEligible(logic.regionMix([rec(250, true, 'a')], TODAY)), true);
  assert.strictEqual(logic.subCardEligible(null), false);
});

test('tipBuckets: 전국 6구간·드릴인 1년 넘게 합침, 겹치지 않고 0건은 숨김, 구간 합 + 공고 중 + 경과 = 입력 수', () => {
  const info = logic.regionMix(MIXED, TODAY);
  const b = logic.tipBuckets(info);
  assert.deepStrictEqual(b.map(x => [x.label, x.n]), [['3개월 안', 2], ['3~6개월', 1], ['6개월~1년', 1], ['1~2년', 1], ['2년 뒤', 1], ['예상 근거 없음', 1]]);
  assert.strictEqual(b.reduce((s, x) => s + x.n, 0) + info.notice + info.overdue, info.listed);
  assert.deepStrictEqual(logic.tipBuckets(info, 'drill').map(x => [x.label, x.n]),
    [['3개월 안', 2], ['3~6개월', 1], ['6개월~1년', 1], ['1년 넘게', 2], ['예상 근거 없음', 1]]);
  assert.deepStrictEqual(logic.tipBuckets(logic.regionMix([rec(10, true, 'a')], TODAY)).map(x => x.label), ['3개월 안']);
  assert.deepStrictEqual(logic.tipBuckets(null), []);
});

test('recordBucket·groupSummary·RANK_REST', () => {
  const k = r => logic.recordBucket(r, TODAY);
  assert.deepStrictEqual([rec(-5, true, 'a'), rec(-150, true, 'b'), rec(10, true, 'c'), rec(100, true, 'd'), rec(250, true, 'e'), rec(500, true, 'f'), rec(800, true, 'g'), nodate('h')].map(k),
    ['notice', 'overdue', 'r3', 'r2', 'p', 'b2', 'b3', 'unknown']);
  assert.deepStrictEqual(logic.RANK_REST, { b2: true, b3: true });
  assert.deepStrictEqual(logic.groupSummary(logic.regionMix(MIXED, TODAY)).map(x => [x.label, x.n]),
    [['3개월 안', 2], ['3~6개월', 1], ['6개월~1년', 1], ['근거 없음', 1]]);
  assert.deepStrictEqual(logic.groupSummary(logic.regionMix([rec(500, true, 'a'), rec(800, true, 'b')], TODAY)), []);
  assert.deepStrictEqual(logic.groupSummary(null), []);
});

test('restLabel·groupStatusText: 1년 넘게 남은 / 1년 안 예상', () => {
  assert.strictEqual(logic.restLabel(3, false), '1년 넘게 남은 3건 보기');
  assert.strictEqual(logic.restLabel(3, true), '1년 넘게 남은 3건 접기');
  assert.strictEqual(logic.groupStatusText({ name: '강남구', shown: [1, 2, 3, 4], rest: [1, 2, 3] }), '강남구 묶음을 목록에서 표시했습니다. 1년 안 예상 4건, 1년 넘게 남은 3건.');
  assert.strictEqual(logic.groupStatusText({ name: '강남구', shown: [1], rest: [] }), '강남구 묶음을 목록에서 표시했습니다. 1년 안 예상 1건.');
  assert.strictEqual(logic.groupStatusText({ name: '강남구', shown: [], rest: [1, 2] }), '강남구 묶음을 목록에서 표시했습니다. 1년 넘게 남은 2건.');
});

test('tipHtml 전국: 가장 이른 예상(이름·날짜·근거 글) → 예상 시기 → 공고 전 기관, 공고 중·경과·합계·"지도 색은" 줄 없음', () => {
  const h = render.tipHtml('경남', logic.regionMix(MIXED, TODAY), TODAY);
  assert.ok(h.includes('<div class="rt-kv rt-t"><span>가장 이른 예상</span></div>'), h);
  assert.ok(h.includes('<span class="rt-nm">가1</span><span class="rt-d">' + dateAfter(10) + '</span>') && h.includes('<div class="rt-b">공고 예정일 확인</div>'), h);
  assert.ok(h.includes('<span class="rt-nm">가2</span>') && !h.includes('>나<') && !h.includes('공고a') && !h.includes('경과a'), h);   // 최대 2곳
  assert.ok(h.includes('<div class="rt-kv rt-t"><span>예상 시기</span></div>'), h);
  ['3개월 안:2', '3~6개월:1', '6개월~1년:1', '1~2년:1', '2년 뒤:1', '예상 근거 없음:1'].forEach(s => {
    const p = s.split(':'); assert.ok(h.includes('<span>' + p[0] + '</span><span class="rt-n">' + p[1] + '건</span>'), p[0]);
  });
  assert.ok(h.includes('<span>공고 전 기관</span><span class="rt-n">7건</span>'), h);
  assert.ok(h.indexOf('가장 이른 예상') < h.indexOf('예상 시기') && h.indexOf('예상 시기') < h.indexOf('공고 전 기관'));
  assert.ok(!/곳|날짜 미상|6개월 안|rt-row| · |합계|지도 색은|공고 진행 중|예정일 경과|rt-notice|가장 임박/.test(h), h);
});

test('tipHtml 드릴인: 1년 넘게 한 줄, 근거 글은 날짜마다, 이름은 이스케이프', () => {
  const info = logic.regionMix(MIXED, TODAY);
  const d = render.tipHtml('창원시', info, TODAY, 'drill');
  assert.ok(d.includes('<span>1년 넘게</span><span class="rt-n">2건</span>') && !d.includes('<span>1~2년</span>') && !d.includes('<span>2년 뒤</span>'), d);
  const esc = render.tipHtml('x', logic.regionMix([rec(10, true, '<b>가</b>')], TODAY), TODAY);
  assert.ok(esc.includes('&lt;b&gt;가&lt;/b&gt;') && !esc.includes('<b>가</b>'), esc);
});

test('tipHtml 빈 경우 셋: 켠 종류 기관 0 / 공고 전 0 / 근거 있는 기관 0', () => {
  assert.ok(render.tipHtml('빈곳', logic.regionMix([], TODAY), TODAY).includes('켠 종류의 기관이 없습니다'));
  const none = render.tipHtml('x', logic.regionMix([rec(-5, true, 'a'), rec(-150, true, 'b')], TODAY), TODAY);
  assert.ok(none.includes('아직 공고 전인 기관이 없습니다') && !none.includes('예상 시기'), none);
  const gray = render.tipHtml('x', logic.regionMix([nodate('a'), nodate('b')], TODAY), TODAY);
  assert.ok(gray.includes('<span>예상 근거 없음</span><span class="rt-n">2건</span>') && gray.includes('지도 색을 정할 근거가 없어 회색입니다') && !gray.includes('가장 이른 예상'), gray);
});

test('aria: 전국은 가장 이른 예상 기관·날짜·근거 + 공고 전 기관 수, 드릴인은 카드와 같은 줄, 색 이름 없음', () => {
  const info = logic.regionMix([rec(10, true, '가'), rec(250, true, '나'), nodate('미상')], TODAY);
  assert.strictEqual(render.mixAriaLabel('서울', info), '서울, 가장 이른 예상 3개월 안 가 ' + dateAfter(10) + ' 공고 예정일 확인, 공고 전 기관 3건');
  assert.strictEqual(render.mixAriaLabel('빈곳', logic.regionMix([], TODAY)), '빈곳, 공고 전 기관 없음');
  assert.strictEqual(render.mixAriaLabel('미상곳', logic.regionMix([nodate('a'), nodate('b')], TODAY)), '미상곳, 예상 근거 없음, 공고 전 기관 2건');
  const card = logic.regionMix([rec(10, true, '가'), rec(100, true, '나'), rec(250, true, '다'), rec(500, true, '라'), nodate('미상')], TODAY);
  assert.strictEqual(render.mixAriaLabelCard('강남구', card),
    '강남구, 가장 이른 예상 3개월 안, 3개월 안 1건, 3~6개월 1건, 6개월~1년 1건, 예상 근거 없음 1건, 공고 전 기관 5건');
  assert.strictEqual(render.mixAriaLabelCard('빈곳', logic.regionMix([rec(-5, true, 'a')], TODAY)), '빈곳, 공고 전 기관 없음');
  assert.deepStrictEqual(render.MIX_NAME, { r3: '3개월 안', r2: '3~6개월', p: '6개월~1년', b2: '1~2년', b3: '2년 뒤', gray: '예상 근거 없음', none: '공고 전 기관 없음' });
});

test('범례: 7색 + 조사 전, 제목, 섞임·위주·준비중 없음, none은 #eef1f5, 드릴인만 카드 줄', () => {
  assert.deepStrictEqual(render.LEGEND_ITEMS.map(i => i[0]), ['r3', 'r2', 'p', 'b2', 'b3', 'gray', 'none']);
  assert.deepStrictEqual(render.LEGEND_ITEMS.map(i => i[1]), ['3개월 안', '3~6개월', '6개월~1년', '1~2년', '2년 뒤', '예상 근거 없음', '공고 전 기관 없음']);
  const el = { innerHTML: '' };
  const doc = { getElementById: id => (id === 'legend' ? el : null) };
  withDoc(doc, () => render.drawLegend('national'));
  assert.ok(el.innerHTML.includes('lg-title">예상 공고 시기 — 지역 색은 가장 이른 예상 기관</div>'));
  assert.ok(el.innerHTML.includes('background:#eef1f5') && el.innerHTML.includes('조사 전'));
  assert.ok(!/섞임|위주|준비중|날짜 미상|lg-card|lg-tri-row/.test(el.innerHTML));
  withDoc(doc, () => render.drawLegend('drill'));
  assert.ok(el.innerHTML.includes('<i class="lg-card" aria-hidden="true"></i>카드: 시군구별 예상 시기 건수 — 3개월 안·3~6개월·6개월~1년·근거 없음(켠 종류 모두)'));
  assert.deepStrictEqual(Object.keys(render.DEFAULT_THEME).slice(0, 6), ['r3', 'r2', 'p', 'b2', 'b3', 'gray']);   // 테마 키·색은 그대로
});

test('recordForFeature: 공고 중·경과 기관은 고르지 않고, 지도에 오른 기관이 없으면 null', () => {
  withFeatureRecords([rec(-5, true, '공고a'), rec(10, true, '가구청'), rec(-150, true, '경과a')], () => {
    assert.strictEqual(render.recordForFeature({}).name, '가구청');
  });
  withFeatureRecords([rec(-5, true, '공고a'), rec(-150, true, '경과a')], () => {
    assert.strictEqual(render.recordForFeature({}), null);
    assert.strictEqual(render.subUrgencyColor({}), render.NONE_FILL);
  });
});

test('오른쪽 목록: 공고 전 기관만(이른 예상순), 빠진 수는 rankOutCount, 둘째 줄은 날짜 예상 · 근거 글', () => {
  const list = [rec(-5, true, '공고a'), rec(-150, true, '경과a'), rec(60, true, '나'), rec(10, true, '가'), nodate('미상')];
  const o = { inst: render.institutionsByRegion, today: render.state.today, sort: render.state.rankSort };
  render.institutionsByRegion = () => list; render.state.today = TODAY; render.state.rankSort = 'urgency';
  try {
    assert.deepStrictEqual(render.rankedList('41').map(r => r.name), ['가', '나', '미상']);
    assert.strictEqual(render.rankOutCount('41'), 2);
  } finally { render.institutionsByRegion = o.inst; render.state.today = o.today; render.state.rankSort = o.sort; }
  assert.strictEqual(render.rankLineText({ name: 'b', type: '지자체', lastBid: '2023-02-01', term: 4 }, TODAY), '지자체 · 2027-02-01 예상 · 약정주기 계산');
  assert.strictEqual(render.rankLineText(nodate('c'), TODAY), '지자체 · 예상 근거 없음');
  const src = read('js/render.js');
  assert.ok(src.includes('<option value="urgency">이른 예상순</option><option value="interest">관심 먼저</option>') && src.includes('1년 안 예상 없음'));
  assert.ok(src.includes('이 지역에는 아직 공고 전인 기관이 없습니다.') && src.includes('은 입찰 공고 현황에서 봅니다.'));
  assert.ok(src.includes("'<span class=\"heart\"") || src.includes('class="heart"'));   // ♥는 그대로
});

test('머리 줄: drawTicker가 기준일·안내를 갱신하고 overdue.refresh를 부르는 자리를 갖는다(P1-2), 굴림 연출은 없다', () => {
  const asof = { textContent: '' }, lede = { textContent: '' }, out = { hidden: false }, btn = { addEventListener() {} };
  const doc = { getElementById: id => ({ 'map-asof': asof, 'map-lede': lede, 'map-out': out, 'map-to-notice': btn })[id] || null };
  const prev = render.state.today; render.state.today = TODAY;
  try {
    withDoc(doc, () => {
      store.setServerData([rec(30, false, '예정시청', { region: '11' })]);
      render.drawTicker();
      assert.strictEqual(asof.textContent, '기준 2026-08-21');
      assert.strictEqual(lede.textContent, render.MAP_LEDE);
      assert.strictEqual(out.hidden, true);                                  // 테스트 환경엔 입찰 공고 현황 메뉴가 없다
      store.setServerData([rec(-5, true, '공고중시청', { region: '11' })]);  // 공고 전 기관 0곳
      render.drawTicker();
      assert.strictEqual(lede.textContent, render.MAP_LEDE_EMPTY);
    });
  } finally { store.clearServerData(); render.state.today = prev; }
  const src = read('js/render.js');
  const fn = src.slice(src.indexOf('render.drawTicker = function'), src.indexOf('render.startTickerSync'));
  assert.ok(fn.includes('render.paintMapHead()') && fn.includes('root.overdue.refresh()'));
  assert.strictEqual(render._rollTicker, undefined); assert.strictEqual(render.TICKER_ROLL_MS, undefined);
  assert.strictEqual(typeof render.startTickerSync, 'function');           // app.js:1216 호환
  assert.ok(src.indexOf('syncLayout') < 0);                                // drawNational·drawRegion의 경과 패널 배치 호출 없음
});

test('로그인 팝업: map 갈래 없음 — 입찰 공고 현황 메뉴가 없으면 [전체 보기] 단추를 숨긴다, 지도 배지 갈래·패널 코드 삭제', () => {
  ['syncLayout', 'setOpen', 'openPanel', 'modeFor', 'defaultOpen', 'popAllLabel', 'POP_ALL_MAP', 'POP_ALL_NOTICE'].forEach(k => assert.strictEqual(ov[k], undefined, k));
  const src = read('js/overdue.js');
  assert.ok(/allBtn\.hidden = dest !== 'notice'/.test(src));
  assert.ok(/if \(!toNotice\) \{ ov\.closePopup\(true\); return; \}/.test(src));
  assert.ok(src.indexOf("byId('map')") < 0 && src.indexOf("$('ov-panel')") < 0 && src.indexOf('syncLayout') < 0);
  const s = logic.overdueSummary([1, 2, 3, 4, 5, 6].map(i => ({ name: '기관' + i, region: '11', type: '지자체', contractEnd: '2026-08-0' + i, confirmed: false })), TODAY);
  assert.strictEqual(ov.popupParts(s, [], '2026-08-21').more, '외 1건이 더 있습니다.');
  assert.strictEqual(ov.popupParts(s, [], '2026-08-21', 'notice').more, '외 1건은 입찰 공고 현황의 [공고 예정일 경과]에서 볼 수 있습니다.');
});

test('index.html: 머리 줄·메뉴 이름·테마 창 이름, 경과 패널·티커·굴림 CSS 제거, 팝업 단추 숨김 규칙', () => {
  const html = read('index.html');
  assert.ok(html.includes('id="tab-btn-map">예상 공고현황</button>') && html.includes('<h2 id="map-h">예상 공고현황</h2>'));
  ['id="map-head"', 'id="map-lede"', 'id="map-asof"', 'id="map-out"', 'id="map-to-notice"', 'id="data-msg"'].forEach(k => assert.ok(html.includes(k), k));
  ['id="ticker"', 'id="ov-panel"', 'id="ov-toggle"', 'id="ov-collapse"', 'data-ovmode', 'data-ov=', 'tkRoll', '임박 TOP5', '경과 패널에서 전체 보기', '.rt-notice', '#ticker .', '지역을 섞은 5단'].forEach(k => assert.ok(!html.includes(k), k));
  assert.ok(html.includes('#main:has(> #tab-map.active) #map-head') && html.includes('#region-tip .rt-b {'));
  assert.ok(/#ov-pop-all\[hidden\]/.test(html) && html.includes('id="ov-pop-all" type="button">입찰 공고 현황에서 보기</button>'));
  ['3개월 안', '3~6개월', '6개월~1년', '1~2년', '2년 뒤', '예상 근거 없음'].forEach((l, i) => assert.ok(html.includes('<label>' + l + ' <input type="color" data-t="' + ['r3', 'r2', 'p', 'b2', 'b3', 'gray'][i] + '">'), l));
  assert.ok(html.includes('.rk-empty {') && html.includes('.rk-out {'));
});

// 메인 결정(2026-11-25): 드릴인 마커도 지도에 남는 기관(공고 전)만 그린다 — 면 색·카드·목록과 같은 판정(logic.isPreNotice).
test('드릴인 마커: 공고 중·경과 기관은 그리지 않고 공고 전 기관만 그린다', () => {
  const drawn = [];
  const sel = {
    size: () => 1, select: () => sel, selectAll: () => sel, remove: () => sel, append: () => sel,
    attr: (k, v) => { if (k === 'data-name') drawn.push(v); return sel; }, style: () => sel, on: () => sel, text: () => sel, node: () => ({}),
  };
  const pub = (days, name) => rec(days, true, name, { type: '공공기관', region: '11', lng: 127, lat: 37 });
  const list = [pub(-5, '공고중공단'), pub(-150, '경과공단'), pub(10, '가공단'), pub(500, '나공단')];
  const o = { d3: global.d3, inst: render.institutionsByRegion, defs: render._ensureDefs, proj: render._regionProjection,
    today: render.state.today, types: render.state.enabledTypes };
  global.d3 = { select: () => sel };
  render._ensureDefs = () => {}; render._regionProjection = () => [10, 10];
  render.institutionsByRegion = () => list; render.state.today = TODAY; render.state.enabledTypes = new Set(['공공기관']);
  try {
    render.drawMarkers('11');
    assert.deepStrictEqual(drawn.sort(), ['가공단', '나공단']);
  } finally {
    if (o.d3 === undefined) delete global.d3; else global.d3 = o.d3;
    render.institutionsByRegion = o.inst; render._ensureDefs = o.defs; render._regionProjection = o.proj;
    render.state.today = o.today; render.state.enabledTypes = o.types;
  }
  assert.ok(/drawMarkers = function[\s\S]*?logic\.isPreNotice\(r, render\.state\.today\)/.test(read('js/render.js')));
});
