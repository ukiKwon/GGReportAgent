// 로그인 슬라이드 데이터(login-slides.js) 형식 검증 — 사용자가 직접 고치는 파일이라 틀린 칸을 알려 준다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const hero = require('../js/login-hero.js');

const ROOT = path.join(__dirname, '..');
// 데이터 파일은 data/ 또는 js/ 어느 쪽에 있어도 찾는다.
const REL = ['data/login-slides.js', 'js/login-slides.js'].filter(function (r) { return fs.existsSync(path.join(ROOT, r)); })[0];

function load(rel, key) {
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sb);
  return JSON.parse(JSON.stringify(sb.window[key]));   // 다른 realm의 배열을 이 realm으로
}

test('데이터 파일이 있고 슬라이드가 1장 이상이다', function () {
  assert.ok(REL, 'login-slides.js 를 찾지 못함');
  const list = load(REL, 'loginSlides');
  assert.ok(Array.isArray(list) && list.length >= 1);
});

test('모든 슬라이드가 필수 칸·날짜 형식을 갖춘다(틀린 칸 이름을 보여 준다)', function () {
  load(REL, 'loginSlides').forEach(function (s, i) {
    assert.deepStrictEqual(hero.problems(s), [], (s && s.id) + ' (#' + (i + 1) + ')');
  });
});

test('id는 겹치지 않고 kind는 알려진 4종이다', function () {
  const list = load(REL, 'loginSlides');
  const ids = list.map(function (s) { return s.id; });
  assert.strictEqual(new Set(ids).size, ids.length, 'id 중복');
  list.forEach(function (s) { assert.ok(hero.KINDS.indexOf(s.kind) >= 0, s.id + ' kind=' + s.kind); });
});

test('쓰인 구 코드는 모두 frontend/geo/seoul.js에 있다', function () {
  const geo = load('geo/seoul.js', 'geoSeoul');
  const known = {}; geo.features.forEach(function (f) { known[f.properties.code] = f.properties.name; });
  load(REL, 'loginSlides').forEach(function (s) {
    const items = s.kind === 'districts' ? (s.items || []) : [];   // cards 의 items 는 구 코드가 없는 기관 카드
    const used = items.map(function (it) { return it.code; }).concat((s.hot || []).map(function (it) { return it.code; }));
    used.forEach(function (c) { assert.ok(known[c], s.id + ': 구 코드 ' + c + ' 가 seoul.js에 없음'); });
    // items의 구 이름이 코드의 실제 이름과 같다(코드만 바꾸고 이름을 안 고친 실수 방지)
    items.forEach(function (it) { assert.strictEqual(it.name, known[it.code], s.id + ': ' + it.code); });
  });
});

test('날짜 칸은 모두 YYYY-MM-DD 이고 notice는 공고→접수 순서다', function () {
  load(REL, 'loginSlides').forEach(function (s) {
    ['showUntil', 'noticeFrom', 'noticeTo', 'receiveFrom', 'receiveTo', 'contractEnd'].forEach(function (k) {
      if (s[k] !== undefined) assert.ok(hero.isDate(s[k]), s.id + '.' + k + '=' + s[k]);
    });
    if (s.kind === 'notice') {
      assert.ok(hero.dayNo(s.noticeFrom) <= hero.dayNo(s.receiveFrom) && hero.dayNo(s.receiveFrom) <= hero.dayNo(s.receiveTo), s.id);
    }
  });
});

// timeline 계산에 쓰는 기관 목록: 지자체(institutions.js) + 지자체 외(institutions_nonmuni.js)
const logic = require('../js/logic.js');
const records = load('data/institutions.js', 'institutions').concat(require('../data/institutions_nonmuni.js'));
const ctx = { records: records, logic: logic };
const ids = function (list, d) { return hero.activeSlides(list, d, ctx).map(function (s) { return s.id; }); };

test('오늘(2026-11-11) 기준 모든 장이 보이고, 접수가 끝난 뒤(11-20)에는 마포 접수 장만, 11-21에는 임박 지도도 빠진다', function () {
  const list = load(REL, 'loginSlides');
  const d1 = ids(list, new Date(2026, 10, 11));
  assert.strictEqual(d1.length, list.length);
  const d2 = ids(list, new Date(2026, 10, 20));
  assert.deepStrictEqual(d1.filter(function (id) { return d2.indexOf(id) < 0; }), ['mapo-notice']);
  const d3 = ids(list, new Date(2026, 10, 21));
  assert.deepStrictEqual(d2.filter(function (id) { return d3.indexOf(id) < 0; }), ['seoul-heat']);
});

test('새 종류 timeline·cards가 데이터에 있고, timeline은 오늘 6개월 안 입찰이 1곳 이상이다', function () {
  const list = load(REL, 'loginSlides');
  const kinds = list.map(function (s) { return s.kind; });
  assert.ok(kinds.indexOf('timeline') >= 0 && kinds.indexOf('cards') >= 0);
  const b = hero.bidItems(records, new Date(2026, 10, 11), logic);
  assert.ok(b.total >= 1 && b.items.length <= 8, 'total=' + b.total);
  b.items.forEach(function (it) { assert.ok(it.name && it.kind && it.label, JSON.stringify(it)); });
});

test('cards의 서울교통공사 문구는 institutions_nonmuni.js의 sources 문구와 같고(** 제외), 확정 아님으로 표시한다', function () {
  const cards = load(REL, 'loginSlides').filter(function (s) { return s.kind === 'cards'; });
  assert.ok(cards.length >= 1);
  const seoul = cards[0].items.filter(function (it) { return it.name === '서울교통공사'; })[0];
  assert.ok(seoul, '서울교통공사 카드');
  const rec = require('../data/institutions_nonmuni.js').filter(function (r) { return r.name === '서울교통공사'; })[0];
  assert.strictEqual(seoul.src, rec.sources[0].replace(/\*\*/g, ''));
  assert.ok(/국민은행/.test(seoul.bank) && /우선협상/.test(seoul.bank));
  assert.strictEqual(seoul.pending, true);
  // 모든 카드 이름은 비지자체 데이터에 실제로 있는 기관이다
  const names = require('../data/institutions_nonmuni.js').map(function (r) { return r.name; });
  cards[0].items.forEach(function (it) { assert.ok(names.indexOf(it.name) >= 0, it.name); });
});

test('데이터의 id는 영문 소문자·숫자·-이고 say·sayOpen의 자리표시는 아는 이름만 쓴다', function () {
  load(REL, 'loginSlides').forEach(function (s) {
    assert.ok(/^[a-z0-9-]+$/.test(s.id), s.id);
    [s.say, s.sayOpen].forEach(function (t) {
      (String(t || '').match(/\{(\w+)\}/g) || []).forEach(function (m) {
        assert.ok(['receiveFrom', 'receiveTo', 'noticeFrom', 'noticeTo', 'contractEnd', 'count'].indexOf(m.slice(1, -1)) >= 0, s.id + ' ' + m);
        if (m !== '{count}') assert.strictEqual(s.kind, 'notice', s.id + ': 날짜 자리표시는 notice에서만');
        else assert.strictEqual(s.kind, 'timeline', s.id + ': {count}는 timeline에서만');
      });
    });
  });
});

test('데이터 파일 맨 위에 한국어 사용법 주석이 10줄 이내로 있다', function () {
  const src = fs.readFileSync(path.join(ROOT, REL), 'utf8').split('\n');
  let n = 0; while (n < src.length && src[n].indexOf('//') === 0) n += 1;
  assert.ok(n >= 5 && n <= 10, '주석 ' + n + '줄');
  assert.ok(/[가-힣]/.test(src[0]));
  assert.ok(src.slice(0, n).join('\n').indexOf('seoul.js') > 0 && src.slice(0, n).join('\n').indexOf('YYYY-MM-DD') > 0);
});
