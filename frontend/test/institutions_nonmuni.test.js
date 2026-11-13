// NEXT 79 — 지자체 외 기관 데이터 규칙(institutions.js와 같은 근거 규칙 + 기관코드·종류)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const list = require(path.join(__dirname, '..', 'data', 'institutions_nonmuni.js'));
const logic = require(path.join(__dirname, '..', 'js', 'logic.js'));

const TYPES = ['교육청', '법원', '공공기관', '지방공기업', '대학', '병원'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

test('지자체 외 기관 — 종류·지역·기관코드 형식', function () {
  assert.ok(Array.isArray(list) && list.length > 0);
  list.forEach(function (r) {
    assert.ok(TYPES.indexOf(r.type) >= 0, r.name + ': 종류 ' + r.type);
    assert.match(String(r.region), /^\d{2}$/, r.name + ': region');
    if (r.orgCode) assert.match(r.orgCode, /^[0-9A-Z]\d{6}$/, r.name + ': orgCode');
    if (r.type === '법원') assert.ok(['본원', '지원'].indexOf(r.courtKind) >= 0, r.name + ': courtKind');
  });
});

test('지자체 외 기관 — 날짜는 근거 URL과 함께, 빈 곳은 빈 이유를 첫 줄에', function () {
  list.forEach(function (r) {
    assert.ok(Array.isArray(r.sources) && r.sources.length > 0, r.name + ': 출처 없음');
    ['lastBid', 'contractEnd'].forEach(function (k) { if (r[k]) assert.match(r[k], DATE, r.name + ': ' + k); });
    if (r.contractExpiry) assert.match(String(r.contractExpiry), /^\d{4}(-\d{2}-\d{2})?$/, r.name + ': contractExpiry');
    if (r.lastBid) assert.ok(r.term, r.name + ': lastBid에는 term이 필요');
    const hasUrl = r.sources.some(function (s) { return /^https?:\/\//.test(s); });
    if (r.lastBid || r.contractEnd || r.contractExpiry) assert.ok(hasUrl, r.name + ': 날짜를 주장하는데 URL이 없다');
    else assert.match(r.sources[0], /미확보|미확인/, r.name + ': 빈 이유가 없다');
  });
});

test('지자체 외 기관 — 같은 기관이 두 번 없고, 화면 날짜 계산이 된다', function () {
  const keys = list.map(logic.instKey);
  assert.strictEqual(new Set(keys).size, keys.length, '중복 region|name');
  const withDate = list.filter(function (r) { return r.lastBid || r.contractEnd || r.contractExpiry; });
  withDate.forEach(function (r) { assert.ok(logic.effectiveBid(r).date, r.name + ': 날짜가 계산되지 않는다'); });
});

test('지자체 외 기관 — 진행 중 공고(contractEnd)는 공고일·원문 확인 표시', function () {
  list.filter(function (r) { return r.contractEnd; }).forEach(function (r) {
    assert.strictEqual(r.confirmed, true, r.name + ': contractEnd에는 confirmed');
    assert.match(r.sources[0], /^기준일=공고일/, r.name + ': contractEnd는 공고일(NEXT 30-1)');
  });
});

test('법원 따름 표기(followsCourt) — 가정·회생·행정만, 따르는 법원 값과 같아야 한다(11-13)', function () {
  const byCode = {};
  list.forEach(function (r) { if (r.orgCode) byCode[r.orgCode] = r; });
  const keys = ['bank', 'lastBid', 'term', 'contractExpiry', 'contractEnd', 'confirmed'];
  list.forEach(function (r) {
    assert.strictEqual(!!r.followsCourt, !!r.followKind, r.name + ': followsCourt·followKind는 함께');
    if (!r.followsCourt) return;
    assert.strictEqual(r.followKind, '공탁소 관할', r.name + ': followKind');
    assert.ok(['가정', '회생', '행정'].indexOf(r.courtType) >= 0, r.name + ': 지방법원·지원은 따름 표기 금지(개별 지정 사례)');
    const p = byCode[r.followsCourt];
    assert.ok(p, r.name + ': 따르는 법원이 목록에 없다');
    assert.ok(!p.followsCourt && p.courtType === '지방' && p.opStatus === '운영', r.name + ': 따르는 법원은 운영 중 지방법원(연쇄 금지)');
    keys.forEach(function (k) { assert.deepStrictEqual(r[k], p[k], r.name + ': ' + k + '가 ' + p.name + '와 다르다 — 같이 고칠 것'); });
    assert.ok(r.sources[0].indexOf(p.name + ' 값 따름') >= 0, r.name + ': 첫 줄에 따름 표기');
  });
  list.filter(function (r) { return r.opStatus === '개원 예정'; }).forEach(function (r) {
    assert.ok(!r.followsCourt && !r.lastBid && !r.contractExpiry, r.name + ': 개원 예정은 비움');
  });
});
