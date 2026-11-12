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
