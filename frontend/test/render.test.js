const test = require('node:test');
const assert = require('node:assert');
const render = require('../js/render.js');
const logic = require('../js/logic.js');

// render.js는 지도·DOM이 대부분이라 오래 테스트가 없었다. 여기서 고정하는 것은
// **지도 면(폴리곤) 클릭**에 얽힌 두 규칙뿐이다(2026-08-21 사용자 요청으로 신설):
//   ⓐ 면 하나에 레코드가 여럿이면 **면 색을 정한 그 레코드**를 고른다.
//   ⓑ 강조된 카드가 목록 밖이면 끌어오되, 이미 보이면 목록을 흔들지 않는다.
// 나머지(d3 렌더)는 여전히 브라우저 실측으로 확인한다.

const TODAY = new Date('2026-08-21T00:00:00');

function muni(name, contractEnd) {
  return { name: name, type: '지자체', contractEnd: contractEnd, confirmed: true };
}

// municipalityForFeature를 갈아끼워 '이 면에 걸린 레코드'를 마음대로 준다.
function withFeatureRecords(records, fn) {
  const origLookup = render.municipalityForFeature;
  const origToday = render.state.today;
  render.municipalityForFeature = function () { return records; };
  render.state.today = TODAY;
  try { return fn(); }
  finally {
    render.municipalityForFeature = origLookup;
    render.state.today = origToday;
  }
}

// ── ⓐ 면 색과 클릭이 같은 레코드를 봐야 한다 ────────────────────────────
// 색은 subUrgencyColor가, 클릭은 onSubregionClick이 정한다. 둘이 각자 정렬하면
// 언젠가 어긋나서 "빨간 면을 눌렀는데 딴 기관이 잡히는" 상태가 된다.

test('recordForFeature: 면에 레코드가 여럿이면 가장 임박한 것을 고른다', function () {
  const soon = muni('가구청', '2026-09-01');
  const later = muni('나구청', '2027-05-01');
  withFeatureRecords([later, soon], function () {
    assert.strictEqual(render.recordForFeature({}).name, '가구청');
  });
});

test('recordForFeature: 면 색을 정하는 레코드와 같은 것을 돌려준다', function () {
  const soon = muni('가구청', '2026-09-01');
  const later = muni('나구청', '2027-05-01');
  withFeatureRecords([later, soon], function () {
    const picked = render.recordForFeature({});
    // 색은 그 레코드의 임박도에서 나온다 — 둘이 같은 값이어야 지도를 믿을 수 있다.
    assert.strictEqual(render.subUrgencyColor({}),
      render.URGENCY_COLORS[logic.urgencyOf(picked, TODAY)]);
  });
});

test('recordForFeature: 레코드가 없는 면은 null (색은 회색)', function () {
  withFeatureRecords([], function () {
    assert.strictEqual(render.recordForFeature({}), null);
    assert.strictEqual(render.subUrgencyColor({}), render.URGENCY_COLORS.gray);
  });
});

// ── 면 클릭의 분기 ──────────────────────────────────────────────────────
// 레코드가 없는 면은 **일부러 그냥 흘려보낸다** — document 클릭 핸들러가 예전처럼
// '빈 곳 클릭'(선택 해제)으로 처리해야 하기 때문이다. 레코드가 있을 때만 멈춘다.

function spyClick(records, fn) {
  const calls = { stopped: 0, selected: [], focused: [] };
  const origSelect = render.selectInstitution, origFocus = render.focusCard;
  render.selectInstitution = function (r) { calls.selected.push(r && r.name); };
  render.focusCard = function (n) { calls.focused.push(n); };
  const ev = { stopPropagation: function () { calls.stopped += 1; } };
  // 열려 있던 팝오버를 닫는 줄이 document를 본다 — 아래 withPanel의 스텁을 빌려 쓴다
  // (없는 id는 null을 주므로 팝오버는 '없음'으로 처리된다).
  try {
    withPanel(null, function () {
      withFeatureRecords(records, function () { render.onSubregionClick({}, ev); });
    });
  } finally { render.selectInstitution = origSelect; render.focusCard = origFocus; }
  return calls;
}

test('onSubregionClick: 레코드가 있으면 선택 + 목록 포커스, 전파를 멈춘다', function () {
  const calls = spyClick([muni('나구청', '2027-05-01'), muni('가구청', '2026-09-01')]);
  assert.deepStrictEqual(calls.selected, ['가구청']);
  assert.deepStrictEqual(calls.focused, ['가구청']);
  // 멈추지 않으면 document 핸들러가 방금 한 선택을 곧바로 풀어 버린다.
  assert.strictEqual(calls.stopped, 1);
});

test('onSubregionClick: 레코드 없는 회색 면은 아무것도 하지 않고 흘려보낸다', function () {
  const calls = spyClick([]);
  assert.deepStrictEqual(calls.selected, []);
  assert.deepStrictEqual(calls.focused, []);
  assert.strictEqual(calls.stopped, 0);   // 빈 곳 클릭으로 처리되게 둔다
});

// ── ⓑ 목록 포커스 ──────────────────────────────────────────────────────
// jsdom을 쓰지 않으므로 필요한 만큼만 스텁한다(designer.test.js와 같은 방식).

function fakePanel(cards, opts) {
  const o = opts || {};
  const panel = {
    scrollTop: o.scrollTop || 0,
    clientHeight: o.clientHeight || 300,
    getBoundingClientRect: function () { return { top: 0, bottom: this.clientHeight }; },
    querySelectorAll: function () { return cards; },
  };
  return panel;
}
function fakeCard(name, top, height) {
  return {
    dataset: { name: name },
    offsetHeight: height,
    getBoundingClientRect: function () { return { top: top, bottom: top + height }; },
  };
}
function withPanel(panel, fn) {
  const had = typeof global.document !== 'undefined';
  const orig = had ? global.document : undefined;
  global.document = { getElementById: function (id) { return id === 'rank-panel' ? panel : null; } };
  try { return fn(); }
  finally { if (had) global.document = orig; else delete global.document; }
}

test('focusCard: 카드가 목록 밖이면 가운데로 끌어온다', function () {
  // 패널 높이 300, 카드(높이 40)가 아래쪽 밖(top 500)에 있다.
  const card = fakeCard('가구청', 500, 40);
  const panel = fakePanel([card], { scrollTop: 0, clientHeight: 300 });
  withPanel(panel, function () { render.focusCard('가구청'); });
  // 0 + (500 - 0) - (300 - 40)/2 = 370 → 카드가 패널 한가운데 온다.
  assert.strictEqual(panel.scrollTop, 370);
});

test('focusCard: 이미 다 보이는 카드는 목록을 움직이지 않는다', function () {
  // 이유 없이 목록이 튀면 그게 더 헷갈린다 — 브라우저 실측에서도 확인한 동작이다.
  const card = fakeCard('가구청', 100, 40);
  const panel = fakePanel([card], { scrollTop: 120, clientHeight: 300 });
  withPanel(panel, function () { render.focusCard('가구청'); });
  assert.strictEqual(panel.scrollTop, 120);
});

test('focusCard: 타입 필터로 카드가 빠져 있어도 조용히 넘어간다', function () {
  const panel = fakePanel([fakeCard('다른구청', 500, 40)], { scrollTop: 55 });
  assert.doesNotThrow(function () {
    withPanel(panel, function () { render.focusCard('가구청'); });
  });
  assert.strictEqual(panel.scrollTop, 55);
});

test('focusCard: 랭킹 패널이 없으면(전국 뷰) 예외 없이 넘어간다', function () {
  assert.doesNotThrow(function () {
    withPanel(null, function () { render.focusCard('가구청'); });
  });
});
