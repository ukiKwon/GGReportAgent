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

// 지도 집계(구간·가장 이른 예상·공고 중/경과 제외) 시험은 map_expected.test.js로 옮겼다(2026-11-25 예상 공고현황).

test('종류 정본 6종과 옛 이름 접기, markerShape는 종류 기준(NEXT 82)', () => {
  assert.deepStrictEqual(logic.TYPE_KINDS, ['지자체','교육청','공공기관','대학','법원','병원']);
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

test('subUrgencyColor: 면 색 = 가장 이른 예상 기관의 구간(가까운 5곳 + 먼 5곳도 r3)', () => {
  withFeatureRecords(recs(D.W6, 5).concat(recs(D.OVER, 5)), () => {
    assert.strictEqual(render.subUrgencyColor({}), render.MAP_COLORS.r3);
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

test('migrateTheme: 옛 기본 포인트색(#57b8ad, 대소문자 무시)은 버려 새 기본값을 쓰고, 사용자가 고른 색은 유지', () => {
  assert.strictEqual(render.DEFAULT_THEME.accent, '#0b50d0');
  assert.strictEqual(render.migrateTheme({ accent:'#57b8ad' }).accent, undefined);
  assert.strictEqual(render.migrateTheme({ accent:'#57B8AD' }).accent, undefined);
  assert.strictEqual(render.migrateTheme({ accent:'#123456', rippleDuration:3 }).accent, '#123456');
  assert.strictEqual(render.migrateTheme({ accent:'#123456', rippleDuration:3 }).rippleDuration, 3);
  assert.strictEqual(Object.assign({}, render.DEFAULT_THEME, render.migrateTheme({ accent:'#57b8ad' })).accent, '#0b50d0');
  assert.strictEqual(Object.assign({}, render.DEFAULT_THEME, render.migrateTheme({ accent:'#123456' })).accent, '#123456');
});

test('밝은 바탕 회귀(NEXT 97): 지도 안내 문구·범례·티커 글자는 흰색을 섞지 않고, 파랑·빨강 위 글자는 흰색', () => {
  const fsx = require('fs'), path = require('path');
  const js = fsx.readFileSync(path.join(__dirname, '../js/render.js'), 'utf8');
  const html = fsx.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(js.includes('translate(-50%,-50%);color:var(--fg);'), '지도 불러오기 안내 문구는 본문색');
  assert.ok(!/color-mix\(in srgb, ' \+ c \+ ' \d+%, #ffffff\)/.test(js), '범례·티커 글자에 흰색 섞기 없음');
  assert.strictEqual(js.split("50%, var(--fg))").length - 1, 1, '범례 글자만 본문색 섞기(티커는 없어짐)');
  assert.ok(!html.includes('#0d1116'), '파랑·빨강 바탕 위 어두운 글자 없음');
  assert.ok(html.includes('button.primary { background:var(--accent-color); color:#fff;'));
});
