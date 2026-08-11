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
const geoGyeonggi = loadGlobal('geo/gyeonggi.js', 'geoGyeonggi');
const geoBusan = loadGlobal('geo/busan.js', 'geoBusan');
const geoIncheon = loadGlobal('geo/incheon.js', 'geoIncheon');
const geoDaegu = loadGlobal('geo/daegu.js', 'geoDaegu');
const geoDaejeon = loadGlobal('geo/daejeon.js', 'geoDaejeon');
const geoUlsan = loadGlobal('geo/ulsan.js', 'geoUlsan');
const geoGangwon = loadGlobal('geo/gangwon.js', 'geoGangwon');
const geoChungbuk = loadGlobal('geo/chungbuk.js', 'geoChungbuk');
const geoChungnam = loadGlobal('geo/chungnam.js', 'geoChungnam');
const REGION_CODES = geoKorea.features.map(function (f) { return f.properties.code; });
const SEOUL_CODES = geoSeoul.features.map(function (f) { return f.properties.code; });
const GYEONGGI_CODES = geoGyeonggi.features.map(function (f) { return f.properties.code; });
const BUSAN_CODES = geoBusan.features.map(function (f) { return f.properties.code; });
const INCHEON_CODES = geoIncheon.features.map(function (f) { return f.properties.code; });
const DAEGU_CODES = geoDaegu.features.map(function (f) { return f.properties.code; });
const DAEJEON_CODES = geoDaejeon.features.map(function (f) { return f.properties.code; });
const ULSAN_CODES = geoUlsan.features.map(function (f) { return f.properties.code; });
const GANGWON_CODES = geoGangwon.features.map(function (f) { return f.properties.code; });
const CHUNGBUK_CODES = geoChungbuk.features.map(function (f) { return f.properties.code; });
const CHUNGNAM_CODES = geoChungnam.features.map(function (f) { return f.properties.code; });

// 광역(시·도) 레코드와 기초(구/시군) 레코드는 subRegion 유무로 갈린다.
const wide = institutions.filter(function (r) { return !r.subRegion; });
const sub = institutions.filter(function (r) { return r.subRegion; });

// 17개로 시작했으나 2026-07-01 전남광주통합특별시 출범을 반영해 광주(29)를
// 전남(46)에 병합, 폴리곤·레코드 모두 16개가 됐다(2026-08-10 사용자 결정).
test('시·도가 빠짐없이 한 번씩 들어 있다 (통합 반영 16개)', function () {
  assert.strictEqual(wide.length, 16);
  const codes = wide.map(function (r) { return r.region; }).sort();
  assert.deepStrictEqual(codes, REGION_CODES.slice().sort());
});

test('서울 25개 자치구가 빠짐없이 한 번씩, seoul.js 코드와 일치한다', function () {
  const seoulGu = sub.filter(function (r) { return r.region === '11'; });
  assert.strictEqual(seoulGu.length, 25);
  const codes = seoulGu.map(function (r) { return r.subRegion; }).sort();
  assert.deepStrictEqual(codes, SEOUL_CODES.slice().sort());
});

// 경기는 서울과 달리 시 하나가 일반구 여러 개로 쪼개질 수 있다(수원 4·성남 3·안양 2·
// 안산 2·고양 3·용인 3 — 사용자 확정 ⓐ안: 그 시의 모든 구 폴리곤에 같은 값을 붙인다).
// 그래서 "31개 시군 = 42개 폴리곤 레코드"가 되고, gyeonggi.js의 코드 전량과 일치해야 한다.
test('경기 31개 시군이 gyeonggi.js의 폴리곤 코드 전량(42개)과 일치한다', function () {
  const gg = sub.filter(function (r) { return r.region === '41'; });
  assert.strictEqual(gg.length, GYEONGGI_CODES.length);
  const codes = gg.map(function (r) { return r.subRegion; }).sort();
  assert.deepStrictEqual(codes, GYEONGGI_CODES.slice().sort());
});

// ⚠️ subRegion 코드는 region 코드와 **숫자 체계가 다를 수 있다** — 우연이 아니라
// 이 코드베이스의 실제 사양이다. render.REGION_GEO는 region(예: '41' 경기)으로
// geo 파일을 고르고, 그 안의 폴리곤 매칭은 subRegion을 그 geo 파일의
// feature.properties.code와 직접 비교한다(render.municipalityForFeature).
// 서울은 우연히 region '11'과 subRegion '11XXX'의 접두사가 같지만, 경기는
// region이 '41'인데 gyeonggi.js 폴리곤 코드는 '31XXX'다(다른 코드 체계 소스).
// 그래서 검증은 "접두사 일치"가 아니라 "그 region의 실제 geo 파일에 그 코드가
// 있는가"로 해야 진짜 불변식을 잡는다.
test('부산 16개 구·군이 busan.js의 폴리곤 코드 전량과 일치한다', function () {
  const bs = sub.filter(function (r) { return r.region === '26'; });
  assert.strictEqual(bs.length, BUSAN_CODES.length);
  const codes = bs.map(function (r) { return r.subRegion; }).sort();
  assert.deepStrictEqual(codes, BUSAN_CODES.slice().sort());
});

// 인천은 2026-07 개편(검단구 분리)이 2018 폴리곤에 없어 **검단구가 서해구 폴리곤
// (23080)을 공유한다**(사용자 결정 ⓐ안). 그래서 "레코드 수 == 폴리곤 수"가 아니라
// "11개 레코드, 폴리곤 전량 커버, 23080만 2개"가 불변식이다.
test('인천 11개 구·군 — 폴리곤 전량 커버 + 서해/검단의 23080 공유', function () {
  const ic = sub.filter(function (r) { return r.region === '28'; });
  assert.strictEqual(ic.length, 11);
  ic.forEach(function (r) {
    assert.ok(INCHEON_CODES.indexOf(r.subRegion) >= 0, r.name + ': ' + r.subRegion);
  });
  INCHEON_CODES.forEach(function (code) {
    assert.ok(ic.some(function (r) { return r.subRegion === code; }), code + ' 폴리곤에 레코드 없음');
  });
  const shared = ic.filter(function (r) { return r.subRegion === '23080'; }).map(function (r) { return r.name; }).sort();
  assert.deepStrictEqual(shared, ['검단구청', '서해구청']);
});

// 대구(군위 포함 9)·대전(5)·울산(5)은 부산과 같은 1:1 패턴이다.
// 강원(18)도 1:1. 충북은 14폴리곤(청주 4개 일반구 — 경기 ⓐ안: 청주시청 레코드 4번)이
// 그대로 14레코드라 역시 1:1이다.
[['대구', '27', function(){ return DAEGU_CODES; }],
 ['대전', '30', function(){ return DAEJEON_CODES; }],
 ['울산', '31', function(){ return ULSAN_CODES; }],
 ['강원', '42', function(){ return GANGWON_CODES; }],
 ['충북', '43', function(){ return CHUNGBUK_CODES; }],
 ['충남', '44', function(){ return CHUNGNAM_CODES; }]].forEach(function (t) {
  test(t[0] + ' 구·군이 geo 폴리곤 코드 전량과 일치한다', function () {
    const recs = sub.filter(function (r) { return r.region === t[1]; });
    const codes = t[2]();
    assert.strictEqual(recs.length, codes.length);
    assert.deepStrictEqual(recs.map(function (r) { return r.subRegion; }).sort(),
                           codes.slice().sort());
  });
});

test('기초 레코드의 subRegion이 실제 geo 폴리곤 코드와 일치한다', function () {
  const REGION_TO_CODES = { '11': SEOUL_CODES, '41': GYEONGGI_CODES, '26': BUSAN_CODES,
    '28': INCHEON_CODES, '27': DAEGU_CODES, '30': DAEJEON_CODES, '31': ULSAN_CODES,
    '42': GANGWON_CODES, '43': CHUNGBUK_CODES, '44': CHUNGNAM_CODES };
  sub.forEach(function (r) {
    const codes = REGION_TO_CODES[r.region];
    assert.ok(codes, r.name + ': region ' + r.region + '용 geo 파일이 테스트에 등록돼 있지 않다');
    assert.ok(codes.indexOf(r.subRegion) >= 0,
      r.name + ': subRegion ' + r.subRegion + '이 region ' + r.region + '의 geo 폴리곤 목록에 없다');
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
    // 날짜(lastBid/contractEnd)를 주장하는 레코드는 반드시 URL로 근거를 대야 한다.
    // 날짜가 없는(진짜 못 찾은) 레코드까지 URL을 강제하면, 검색해도 안 나오는 곳에
    // 억지로 무관한 URL을 채워 넣는 역효과가 생긴다 — 대신 "찾아봤다"는 사실 자체는
    // 문구로 남기게 한다(침묵과 "검색했으나 없음"을 구분).
    if (r.lastBid || r.contractEnd) {
      assert.ok(hasUrl, r.name + ': 날짜를 주장하는데 출처에 URL이 없다');
    } else if (!hasUrl) {
      const attempted = r.sources.some(function (s) { return /검색|조사|확인|미확보|미확인/.test(s); });
      assert.ok(attempted, r.name + ': URL도 없고 "찾아봤다"는 근거 문구도 없다');
    }
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
