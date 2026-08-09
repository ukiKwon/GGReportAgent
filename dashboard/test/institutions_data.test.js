// 기본 데이터(dashboard/data/institutions.js)의 무결성 회귀 테스트.
//
// 이 파일이 지키는 것은 "값이 맞다"가 아니라 **규칙을 어긴 값이 섞이지 않는다**이다.
// 조사 규칙상 모르는 것은 비워 두기로 했는데, 나중에 누군가 빈칸이 보기 싫어서
// 근거 없는 날짜를 채워 넣는 것이 이 데이터셋의 가장 현실적인 붕괴 경로다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const logic = require(path.join(ROOT, 'js/logic.js'));

// vm 샌드박스가 만든 배열은 **다른 realm의 Array**라 deepStrictEqual이 프로토타입
// 불일치로 실패한다(값은 같은데 틀렸다고 나온다). JSON 왕복으로 이 realm의 값으로 옮긴다.
function loadGlobal(relPath, key) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, relPath), 'utf8'), sandbox);
  return JSON.parse(JSON.stringify(sandbox.window[key]));
}

const institutions = loadGlobal('data/institutions.js', 'institutions');
const geoKorea = loadGlobal('geo/korea.js', 'geoKorea');
const geoSeoul = loadGlobal('geo/seoul.js', 'geoSeoul');
const REGION_CODES = geoKorea.features.map(function (f) { return f.properties.code; });
const SEOUL_CODES = geoSeoul.features.map(function (f) { return f.properties.code; });

// 광역(시·도) 레코드와 기초(구/시군) 레코드는 subRegion 유무로 갈린다.
const wide = institutions.filter(function (r) { return !r.subRegion; });
const sub = institutions.filter(function (r) { return r.subRegion; });

test('17개 시·도가 빠짐없이 한 번씩 들어 있다', function () {
  assert.strictEqual(wide.length, 17);
  const codes = wide.map(function (r) { return r.region; }).sort();
  assert.deepStrictEqual(codes, REGION_CODES.slice().sort());
});

test('서울 25개 자치구가 빠짐없이 한 번씩, seoul.js 코드와 일치한다', function () {
  const seoulGu = sub.filter(function (r) { return r.region === '11'; });
  assert.strictEqual(seoulGu.length, 25);
  const codes = seoulGu.map(function (r) { return r.subRegion; }).sort();
  assert.deepStrictEqual(codes, SEOUL_CODES.slice().sort());
});

test('기초 레코드의 subRegion은 자기 region 코드로 시작한다', function () {
  sub.forEach(function (r) {
    assert.ok(r.subRegion.indexOf(r.region) === 0,
      r.name + ': subRegion ' + r.subRegion + '이 region ' + r.region + '에 속하지 않는다');
  });
});

test('서울 자치구는 현 금고 은행을 출처에 담는다 (14/6/5 분포)', function () {
  const count = {};
  sub.filter(function (r) { return r.region === '11'; }).forEach(function (r) {
    const line = r.sources.filter(function (s) { return s.indexOf('현 금고: ') === 0; })[0];
    assert.ok(line, r.name + ': 현 금고 은행이 없다');
    const bank = line.replace('현 금고: ', '');
    count[bank] = (count[bank] || 0) + 1;
  });
  assert.deepStrictEqual(count, { '우리은행': 14, '신한은행': 6, '국민은행': 5 });
});

test('모든 레코드가 필수 필드를 갖춘다 (지도에 !로 뜨지 않는다)', function () {
  institutions.forEach(function (r) {
    const v = logic.validateRecord(r);
    assert.ok(v.valid, r.name + ' 누락: ' + v.missing.join(','));
    assert.strictEqual(r.type, '지자체');
  });
});

test('날짜는 YYYY-MM-DD로 파싱되는 실제 날짜다', function () {
  institutions.forEach(function (r) {
    ['lastBid', 'contractEnd'].forEach(function (f) {
      if (r[f] === undefined) return;
      assert.match(r[f], /^\d{4}-\d{2}-\d{2}$/, r.name + '.' + f);
      assert.ok(!isNaN(new Date(r[f] + 'T00:00:00').getTime()), r.name + '.' + f);
    });
  });
});

test('lastBid가 있으면 term도 있다 — 없으면 다음 회차를 계산할 수 없다', function () {
  institutions.forEach(function (r) {
    if (r.lastBid) assert.ok(r.term > 0, r.name + ': lastBid는 있는데 term이 없다');
  });
});

// 실제로 낸 실수: lastBid에 "가장 최근 회차보다 한 회 전" 값을 넣으면
// addYears(lastBid, term)가 한 번만 term을 더해 **이미 지난 날짜**가 나온다
// (예: 도봉 2014+4=2018년 — "이미 늦었다"는 잘못된 빨간불). 중간 회차를 못 찾았으면
// lastBid를 비우는 것이 규칙이지, 오래된 값을 그대로 넣는 것이 아니다.
test('lastBid+term으로 유도한 날짜가 조사 시점보다 크게 과거로 나오지 않는다', function () {
  const today = new Date('2026-08-10T00:00:00');
  institutions.forEach(function (r) {
    if (r.contractEnd || !r.lastBid) return;   // 확정일이 있거나 lastBid가 없으면 해당 없음
    const days = logic.daysUntil(logic.effectiveBid(r).date, today);
    assert.ok(days > -365,
      r.name + ': lastBid=' + r.lastBid + '+term=' + r.term + ' → 유도 날짜가 1년 넘게 과거다(중간 회차 누락 의심)');
  });
});

test('term은 4년 이내다 — 예규가 "4년 이내"라 그보다 길 수 없다', function () {
  institutions.forEach(function (r) {
    if (r.term === undefined) return;
    assert.ok(r.term >= 1 && r.term <= 4, r.name + ': term=' + r.term);
  });
});

test('confirmed(확정)는 contractEnd가 실제로 있을 때만 붙는다', function () {
  institutions.forEach(function (r) {
    if (r.confirmed) assert.ok(r.contractEnd, r.name + ': 확정인데 입찰예상일이 없다');
  });
});

test('모든 레코드가 출처를 가진다 — 근거 없는 행은 두지 않는다', function () {
  institutions.forEach(function (r) {
    assert.ok(Array.isArray(r.sources) && r.sources.length > 0, r.name + ': 출처 없음');
    const hasUrl = r.sources.some(function (s) { return /^https?:\/\//.test(s); });
    assert.ok(hasUrl, r.name + ': 출처에 URL이 하나도 없다');
  });
});

test('날짜가 있는 레코드는 출처에 기준일이 무엇인지 밝혀 둔다', function () {
  institutions.forEach(function (r) {
    if (!r.lastBid && !r.contractEnd) return;
    const noted = r.sources.some(function (s) { return s.indexOf('기준일=') === 0; });
    assert.ok(noted, r.name + ': 기준일(공고일/지정일)이 출처에 명시돼 있지 않다');
  });
});

test('날짜가 없는 레코드는 왜 비었는지를 출처 첫 줄에 남긴다', function () {
  institutions.forEach(function (r) {
    if (r.lastBid || r.contractEnd) return;
    assert.match(r.sources[0], /미확보|변동/, r.name + ': 빈 이유가 적혀 있지 않다');
  });
});

test('파생 일정이 실제로 유도된다 — 날짜 있는 곳은 미상이 아니다', function () {
  const withDate = institutions.filter(function (r) { return r.lastBid || r.contractEnd; });
  // 광역 9곳(서울 부산 인천 대전 울산 경기 강원 경남 제주) + 서울 자치구 1곳(서대문).
  // 이 숫자가 늘어나는 것은 정상(조사가 진행된 것)이므로 하한으로 둔다.
  assert.ok(withDate.length >= 10, '날짜 확보 레코드가 ' + withDate.length + '건으로 줄었다');
  withDate.forEach(function (r) {
    const e = logic.effectiveBid(r);
    assert.ok(e.date, r.name + ': 일정이 유도되지 않는다');
    assert.notStrictEqual(e.confidence, '미상');
  });
});

test('CSV 왕복으로 값이 보존된다 (반입 경로와 형식이 같다)', function () {
  const headers = logic.CSV_HEADERS;
  const key = logic._HEADER_KEY;
  const rows = institutions.map(function (r) {
    return headers.map(function (h) {
      const k = key[h];
      let v = r[k];
      if (k === 'sources') v = (v || []).join(';');
      else if (k === 'confirmed') v = v ? 'Y' : '';
      if (v === undefined || v === null) v = '';
      v = String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(',');
  });
  const back = logic.parseCsv(headers.join(',') + '\n' + rows.join('\n'));
  assert.strictEqual(back.length, institutions.length);
  institutions.forEach(function (r, i) {
    assert.strictEqual(back[i].name, r.name);
    assert.strictEqual(back[i].region, r.region);
    assert.strictEqual(back[i].lastBid || undefined, r.lastBid);
    assert.strictEqual(!!back[i].confirmed, !!r.confirmed);
    assert.strictEqual(back[i].sources.length, r.sources.length);
  });
});
