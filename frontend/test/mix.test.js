const test = require('node:test');
const assert = require('node:assert');
const logic = require('../js/logic.js');
const render = require('../js/render.js');

// NEXT 78 — 지도 지역 색 섞기(C안 '바닥 섞기 + ▲개수').
// 규격: handoff/agents/design-reviewer/2026-11-11_1616_a821ad3f.md §3 시나리오 가~아.

const TODAY = new Date('2026-08-21T00:00:00');
// 구간 경계(182·365·730일)에서 멀리 떨어진 값만 쓴다 — 날짜 계산의 시각 차이가 결과를 흔들지 않게.
const D = { W6: 30, M12: 250, Y2: 500, OVER: 1000 };

function dateAfter(days) { return logic.localDateStr(new Date(2026, 7, 21 + days)); }
function rec(days, confirmed, name) {
  return { name: name || ('기관' + days), type: '지자체', contractEnd: dateAfter(days), confirmed: confirmed !== false };
}
function recs(days, n, confirmed) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(rec(days, confirmed, '기관' + days + '_' + i));
  return out;
}
function undated(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ name: '미상' + i, type: '지자체' });
  return out;
}

test('instScore: 6개월 안 +2, 6~12개월 +1, 1~2년 −1, 2년 넘음 −2, 미상·경과 null', () => {
  assert.strictEqual(logic.instScore(rec(30), TODAY), 2);
  assert.strictEqual(logic.instScore(rec(-40, false), TODAY), null);   // 경과는 따로 관리(사용자 2026-11-12). 확정 공고 −40일은 '진행 중'이라 추정으로 쓴다
  assert.strictEqual(logic.instScore(rec(250), TODAY), 1);
  assert.strictEqual(logic.instScore(rec(500), TODAY), -1);
  assert.strictEqual(logic.instScore(rec(1000), TODAY), -2);
  assert.strictEqual(logic.instScore({ name: 'x', type: '지자체' }, TODAY), null);
});

test('mixBandOf: 5단 경계(1.5·0.5·−0.5·−1.5)', () => {
  assert.strictEqual(logic.mixBandOf(2), 'r3');
  assert.strictEqual(logic.mixBandOf(1.5), 'r3');
  assert.strictEqual(logic.mixBandOf(1.49), 'r2');
  assert.strictEqual(logic.mixBandOf(0.5), 'r2');
  assert.strictEqual(logic.mixBandOf(0.49), 'p');
  assert.strictEqual(logic.mixBandOf(0), 'p');
  assert.strictEqual(logic.mixBandOf(-0.5), 'b2');
  assert.strictEqual(logic.mixBandOf(-1.49), 'b2');
  assert.strictEqual(logic.mixBandOf(-1.5), 'b3');   // 규격 §3: 진파랑 m≤−1.5
  assert.strictEqual(logic.mixBandOf(-1.51), 'b3');
});

// ── 규격 §3 시나리오 가~아 ────────────────────────────────────────────
test('섞기 가: 6개월 안 1곳뿐 → 진빨강 ▲1', () => {
  const m = logic.regionMix(recs(D.W6, 1), TODAY);
  assert.strictEqual(m.band, 'r3'); assert.strictEqual(logic.urgentMark(m), '▲1');
});
test('섞기 나: 6개월 안 1 + 2년 넘음 9 → 평균대로 진파랑 ▲1 (바닥 규칙 없음, 사용자 2026-11-12)', () => {
  const m = logic.regionMix(recs(D.W6, 1).concat(recs(D.OVER, 9)), TODAY);
  assert.ok(m.mean < -1.5);
  assert.strictEqual(m.band, 'b3'); assert.strictEqual(m.urgent, 1);
});
test('섞기 다: 6개월 안 5 + 2년 넘음 5 → 보라 ▲5', () => {
  const m = logic.regionMix(recs(D.W6, 5).concat(recs(D.OVER, 5)), TODAY);
  assert.strictEqual(m.band, 'p'); assert.strictEqual(logic.urgentMark(m), '▲5');
});
test('섞기 라: 6~12개월 1 + 2년 넘음 9 → 평균대로 진파랑, ▲ 없음', () => {
  const m = logic.regionMix(recs(D.M12, 1).concat(recs(D.OVER, 9)), TODAY);
  assert.strictEqual(m.band, 'b3'); assert.strictEqual(logic.urgentMark(m), '');
});
test('섞기 마: 6~12개월 2 → 빨강', () => {
  assert.strictEqual(logic.regionMix(recs(D.M12, 2), TODAY).band, 'r2');
});
test('섞기 바: 1~2년 3 + 2년 넘음 1 → 파랑', () => {
  assert.strictEqual(logic.regionMix(recs(D.Y2, 3).concat(recs(D.OVER, 1)), TODAY).band, 'b2');
});
test('섞기 사: 2년 넘음 4 → 진파랑', () => {
  assert.strictEqual(logic.regionMix(recs(D.OVER, 4), TODAY).band, 'b3');
});
test('섞기 아: 날짜 미상 3 → 회색, 날짜 있는 기관이 0곳이면 가장 임박도 없음', () => {
  const m = logic.regionMix(undated(3), TODAY);
  assert.strictEqual(m.band, 'gray'); assert.strictEqual(m.imminent, null);
  assert.strictEqual(m.unknown, 3);
});
test('섞기: 미상은 평균에서 빠진다(6개월 안 1 + 미상 5 → 진빨강)', () => {
  const m = logic.regionMix(recs(D.W6, 1).concat(undated(5)), TODAY);
  assert.strictEqual(m.band, 'r3'); assert.strictEqual(m.dated, 1); assert.strictEqual(m.total, 6);
});
test('섞기: 기관 0곳은 none, 1년 안 기관이 없으면 바닥 없이 파랑 쪽으로 간다', () => {
  assert.strictEqual(logic.regionMix([], TODAY).band, 'none');
  assert.strictEqual(logic.regionMix(recs(D.Y2, 2).concat(recs(D.OVER, 1)), TODAY).band, 'b2');   // 평균 −1.33
  assert.strictEqual(logic.regionMix(recs(D.Y2, 1).concat(recs(D.OVER, 1)), TODAY).band, 'b3');   // 평균 −1.5 = 진파랑 경계
});

test('▲n: 6개월 안 기관이 모두 추정이면 속 빈 △, 하나라도 확정이면 ▲', () => {
  const allEst = logic.regionMix([rec(D.W6, false, 'a'), rec(D.W6 + 5, false, 'b')], TODAY);
  assert.strictEqual(logic.urgentMark(allEst), '△2');
  const mixed = logic.regionMix([rec(D.W6, false, 'a'), rec(D.W6 + 5, true, 'b')], TODAY);
  assert.strictEqual(logic.urgentMark(mixed), '▲2');
  assert.strictEqual(logic.urgentMark(logic.regionMix(recs(D.OVER, 2), TODAY)), '');
});

test('mostImminent: 가장 임박한 기관, 같은 날이면 확정이 먼저, 미상은 건너뛴다', () => {
  const est = rec(D.W6, false, '추정기관');
  const fixed = rec(D.W6, true, '확정기관');
  assert.strictEqual(logic.mostImminent([est, fixed], TODAY).name, '확정기관');
  assert.strictEqual(logic.mostImminent([fixed, est], TODAY).name, '확정기관');
  assert.strictEqual(logic.mostImminent([rec(D.OVER, true, '먼'), est], TODAY).name, '추정기관');
  assert.strictEqual(logic.mostImminent(undated(2), TODAY), null);
  assert.strictEqual(logic.mostImminent([], TODAY), null);
});

test('regionMix.imminent는 mostImminent와 같은 기관이다', () => {
  const list = [rec(D.OVER, true, '먼'), rec(D.W6, false, '추정'), rec(D.W6, true, '확정')];
  assert.strictEqual(logic.regionMix(list, TODAY).imminent.name, '확정');
});

test('종류 정본 5종과 옛 이름 접기, markerShape는 옛 매핑 그대로', () => {
  assert.deepStrictEqual(logic.TYPE_KINDS, ['지자체','공공기관','대학','법원','병원']);
  assert.strictEqual(logic.kindOf('공기업'), '공공기관');
  assert.strictEqual(logic.kindOf('대학교'), '대학');
  assert.strictEqual(logic.kindOf('대학병원'), '병원');
  assert.strictEqual(logic.kindOf('연구소'), null);
  assert.strictEqual(logic.markerShape('대학병원'), 'circle');
  assert.strictEqual(logic.markerShape('병원'), 'circle');
  assert.strictEqual(logic.markerShape('대학교'), 'pentagon');
  assert.strictEqual(logic.markerShape('대학'), 'pentagon');
  assert.strictEqual(logic.markerShape('법원'), 'diamond');
});

// ── render: 면 색·테마·범례·툴팁 ───────────────────────────────────────
function withFeatureRecords(records, fn) {
  const origLookup = render.municipalityForFeature, origToday = render.state.today;
  render.municipalityForFeature = function () { return records; };
  render.state.today = TODAY;
  try { return fn(); }
  finally { render.municipalityForFeature = origLookup; render.state.today = origToday; }
}

test('subUrgencyColor: 켠 기관을 섞은 5단 색(다 시나리오 = 보라)', () => {
  withFeatureRecords(recs(D.W6, 5).concat(recs(D.OVER, 5)), () => {
    assert.strictEqual(render.subUrgencyColor({}), render.MAP_COLORS.p);
  });
});

test('recordForFeature(클릭)와 imminentForFeature(섞기)는 지자체만 있으면 같다(동률이면 확정)', () => {
  const list = [rec(D.OVER, true, '먼'), rec(D.W6, false, '추정'), rec(D.W6, true, '확정')];
  withFeatureRecords(list, () => {
    assert.strictEqual(render.recordForFeature({}).name, '확정');
    assert.strictEqual(render.imminentForFeature({}).name, '확정');
    assert.strictEqual(render.featureMixInfo({}).imminent.name, '확정');
  });
});

// ── 클릭은 지자체 우선, 섞기(툴팁·▲)는 모든 종류의 mostImminent (팀 결정 11-11) ──────────
function withRegion(all, feature, fn) {
  const o = { inst: render.institutionsByRegion, cur: render.state.currentRegion, today: render.state.today,
    enabled: render.state.enabledTypes };
  render.institutionsByRegion = function () { return all; };
  render.state.currentRegion = '11'; render.state.today = TODAY;
  // municipalityForFeature는 그대로 둔다 — institutionsByRegion을 보고 구시군코드로 지자체를 찾는다.
  try { return fn(); }
  finally {
    render.institutionsByRegion = o.inst; render.state.currentRegion = o.cur;
    render.state.today = o.today; render.state.enabledTypes = o.enabled;
  }
}
function otherKind(days, type, sub, name) {
  return { name: name, type: type, region: '11', subRegion: sub, contractEnd: dateAfter(days), confirmed: true };
}

test('recordsForFeature: 켠 다른 종류가 섞이고, 끈 종류는 빠진다', () => {
  const feature = { properties: { code: 'G1', name: '가구' } };
  const gu = { name: '가구청', type: '지자체', region: '11', subRegion: 'G1', contractEnd: dateAfter(D.OVER), confirmed: true };
  const pub = otherKind(D.W6, '공공기관', 'G1', '공단');
  const other = otherKind(D.W6, '공공기관', 'G2', '다른구공단');
  withRegion([gu, pub, other], feature, () => {
    render.state.enabledTypes = new Set(['지자체', '공공기관']);
    const names = render.recordsForFeature(feature).map(r => r.name).sort();
    assert.deepStrictEqual(names, ['가구청', '공단']);
    assert.strictEqual(render.featureMixInfo(feature).urgent, 1);
    // 공공기관을 끄면 섞기에서 빠진다(지자체는 항상 포함)
    render.state.enabledTypes = new Set(['지자체']);
    assert.deepStrictEqual(render.recordsForFeature(feature).map(r => r.name), ['가구청']);
    assert.strictEqual(render.featureMixInfo(feature).urgent, 0);
  });
});

test('클릭 기관은 그 구의 지자체 우선, 섞기 가장 임박은 더 급한 다른 종류일 수 있다', () => {
  const feature = { properties: { code: 'G1', name: '가구' } };
  const gu = { name: '가구청', type: '지자체', region: '11', subRegion: 'G1', contractEnd: dateAfter(D.OVER), confirmed: true };
  const pub = otherKind(D.W6, '공공기관', 'G1', '공단');
  withRegion([gu, pub], feature, () => {
    render.state.enabledTypes = new Set(['지자체', '공공기관']);
    assert.strictEqual(render.recordForFeature(feature).name, '가구청');
    assert.strictEqual(render.imminentForFeature(feature).name, '공단');
  });
});

test('경과 건은 색·▲·가장 임박에서 빠지고 overdue로만 센다(사용자 2026-11-12)', () => {
  // 확정 공고는 120일 넘게 지나야 경과다(그 안은 '진행 중')
  const m = logic.regionMix([rec(-150, true, '경과'), rec(D.OVER, true, '먼')], TODAY);
  assert.strictEqual(m.overdue, 1); assert.strictEqual(m.within6, 0); assert.strictEqual(m.urgent, 0);
  assert.strictEqual(m.mean, -2); assert.strictEqual(m.band, 'b3');
  assert.strictEqual(m.imminent.name, '먼');
  const only = logic.regionMix([rec(-150, true, '경과')], TODAY);
  assert.strictEqual(only.band, 'gray'); assert.strictEqual(only.imminent, null);
  const h = render.tipHtml('경과곳', m, TODAY);
  assert.ok(h.includes('기관 2곳 중 예정일 경과 1곳은 색에 넣지 않음'), h);
});

test('recordForFeature: 날짜가 전부 없으면 첫 기관을 돌려준다(눌러서 고를 수는 있다)', () => {
  withFeatureRecords(undated(2), () => {
    assert.strictEqual(render.recordForFeature({}).name, '미상0');
    assert.strictEqual(render.subUrgencyColor({}), render.MAP_COLORS.gray);
  });
});

test('기관 단위 중복 제거: 같은 시가 일반구마다 반복돼도 한 곳으로 센다', () => {
  const dup = [rec(D.W6, true, '수원시청'), rec(D.W6, true, '수원시청'), rec(D.W6, true, '수원시청')];
  withFeatureRecords(dup, () => {
    assert.strictEqual(render.featureMixInfo({}).urgent, 1);
  });
});

test('테마 5단: 기본값, 마커는 지도 팔레트, 티커(크롬)는 옛 4단 색 고정', () => {
  assert.strictEqual(render.DEFAULT_THEME.r3, '#e8606b');
  assert.strictEqual(render.DEFAULT_THEME.p, '#cf9ad8');
  assert.strictEqual(render.DEFAULT_THEME.b3, '#4f72b8');
  assert.strictEqual(render.markerColor('red'), render.MAP_COLORS.r3);
  assert.strictEqual(render.markerColor('orange'), render.MAP_COLORS.r2);
  assert.strictEqual(render.markerColor('yellow'), render.MAP_COLORS.b2);
  assert.strictEqual(render.markerColor('blue'), render.MAP_COLORS.b3);
  assert.strictEqual(render.markerColor('gray'), render.MAP_COLORS.gray);
  assert.deepStrictEqual(render.URGENCY_COLORS, { red:'#f0a6a9', orange:'#f3c795', yellow:'#e9e3a8', blue:'#a9c5ea', gray:'#7c8699' });
});

test('instScore 경계: 0·182 / 183·365 / 366·730 / 731 / −1일', () => {
  assert.strictEqual(logic.instScore(rec(0), TODAY), 2);
  assert.strictEqual(logic.instScore(rec(-1, false), TODAY), null);
  assert.strictEqual(logic.instScore(rec(182), TODAY), 2);
  assert.strictEqual(logic.instScore(rec(183), TODAY), 1);
  assert.strictEqual(logic.instScore(rec(365), TODAY), 1);
  assert.strictEqual(logic.instScore(rec(366), TODAY), -1);
  assert.strictEqual(logic.instScore(rec(730), TODAY), -1);
  assert.strictEqual(logic.instScore(rec(731), TODAY), -2);
});

test('바닥 없음: 평균이 −0.5면 6~12개월 기관이 있어도 파랑', () => {
  const withFloor = logic.regionMix([rec(D.M12, true, 'a'), rec(D.OVER, true, 'b')], TODAY);   // (+1 −2)/2 = −0.5
  assert.strictEqual(withFloor.mean, -0.5);
  assert.strictEqual(withFloor.band, 'b2');
  const noFloor = logic.regionMix([rec(D.Y2, true, 'a'), rec(D.Y2, true, 'b'), rec(D.OVER, true, 'c'), rec(D.OVER, true, 'd')], TODAY); // −1.5
  assert.strictEqual(noFloor.band, 'b3');
});

test('migrateTheme: 대문자 hex 옛 기본값도 고른 색이 아니고, gray는 키가 같아 그대로 이어진다', () => {
  const m = render.migrateTheme({ red:'#F0A6A9', orange:'#F3C795', yellow:'#E9E3A8', blue:'#A9C5EA', gray:'#7C8699' });
  assert.deepStrictEqual(Object.keys(m), ['gray']);   // 옛 키는 지워지고 gray만 남는다
  assert.strictEqual(m.gray, '#7C8699');
  assert.strictEqual(render.migrateTheme({ gray:'#123456' }).gray, '#123456');
});

test('regionKey: Enter·Space가 동작, 다른 키·repeat는 무시, Space는 스크롤을 막는다', () => {
  function ev(key, repeat) { return { key: key, repeat: !!repeat, prevented: 0, preventDefault: function () { this.prevented++; } }; }
  let n = 0;
  const enter = function () { n++; };
  const e1 = ev('Enter'), e2 = ev(' '), e3 = ev('a'), e4 = ev('Enter', true), e5 = ev(' ', true);
  assert.strictEqual(render.regionKey(e1, {}, enter), true);
  assert.strictEqual(render.regionKey(e2, {}, enter), true);
  assert.strictEqual(e2.prevented, 1);
  assert.strictEqual(render.regionKey(e3, {}, enter), false);
  assert.strictEqual(e3.prevented, 0);
  assert.strictEqual(render.regionKey(e4, {}, enter), false);
  assert.strictEqual(render.regionKey(e5, {}, enter), false);
  assert.strictEqual(e5.prevented, 1);                // 길게 눌러도 페이지가 스크롤되지 않는다
  assert.strictEqual(n, 2);
  assert.strictEqual(render.regionKey(ev('Enter'), {}, null), false);
});

test('migrateTheme: 옛 저장 테마를 끝점으로 이어받고 옛 기본값 그대로인 값은 버린다', () => {
  const m = render.migrateTheme({ red:'#111111', orange:'#f3c795', yellow:'#222222', blue:'#333333',
    gray:'#444444', accent:'#57b8ad', rippleDuration:3 });
  assert.strictEqual(m.r3, '#111111');
  assert.strictEqual(m.r2, undefined);          // 옛 기본값 = 고른 색이 아니다
  assert.strictEqual(m.b2, '#222222');
  assert.strictEqual(m.b3, '#333333');
  assert.strictEqual(m.gray, '#444444');
  assert.strictEqual(m.p, undefined);           // 보라는 옛 대응이 없다 → 기본값
  assert.strictEqual(m.red, undefined);
  assert.strictEqual(m.rippleDuration, 3);
  // 새 키가 이미 있으면 새 키가 이긴다
  assert.strictEqual(render.migrateTheme({ red:'#111111', r3:'#abcdef' }).r3, '#abcdef');
  assert.deepStrictEqual(render.migrateTheme(null), {});
});

test('범례: 5단 + 날짜 미상, 용어는 6개월 안/1~2년/2년 넘음/날짜 미상으로 통일', () => {
  assert.deepStrictEqual(render.LEGEND_ITEMS.map(function (i) { return i[0]; }), ['r3','r2','p','b2','b3','gray']);
  const text = render.LEGEND_ITEMS.map(function (i) { return i[1]; }).join('|');
  assert.ok(text.includes('6개월 안') && text.includes('1~2년') && text.includes('2년 넘음') && text.includes('날짜 미상'));
  assert.ok(!/6개월↓|1년↓|2년↓|2년\+|미상$/.test(text.replace(/날짜 미상/g, '')));
});

test('tipHtml: 가장 임박·구간 수·미상 안내, 추정이면 (추정), 이스케이프', () => {
  const list = [rec(D.W6, false, '<b>구청</b>'), rec(D.M12, true, 'B청')].concat(undated(2));
  const info = logic.regionMix(list, TODAY);
  const h = render.tipHtml('서울', info, TODAY);
  assert.ok(h.includes('서울') && h.includes('가장 임박'));
  assert.ok(h.includes('&lt;b&gt;구청&lt;/b&gt;') && !h.includes('<b>구청</b>'));
  assert.ok(h.includes('D-30') && h.includes('(추정)'));
  assert.ok(h.includes('6개월 안 1 · 6~12개월 1 · 1~2년 0 · 2년 넘음 0'));
  assert.ok(h.includes('기관 4곳 중 날짜 미상 2곳은 색에 넣지 않음'));
  assert.ok(render.tipHtml('빈곳', logic.regionMix([], TODAY), TODAY).includes('켠 종류의 기관이 없습니다'));
  assert.ok(render.tipHtml('미상곳', logic.regionMix(undated(2), TODAY), TODAY).includes('날짜가 있는 기관이 없습니다'));
});

test('mixAriaLabel: 이름, 색 이름, 6개월 안 곳수, 기관 수', () => {
  const info = logic.regionMix(recs(D.W6, 1).concat(recs(D.OVER, 9)), TODAY);
  assert.strictEqual(render.mixAriaLabel('서울', info), '서울, ' + render.MIX_NAME.b3 + ', 6개월 안 1곳, 기관 10곳');
  assert.strictEqual(render.mixAriaLabel('빈곳', logic.regionMix([], TODAY)), '빈곳, 기관 없음, 기관 0곳');
});
