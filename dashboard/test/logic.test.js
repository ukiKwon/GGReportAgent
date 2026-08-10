const test = require('node:test');
const assert = require('node:assert');
const logic = require('../js/logic.js');

test('logic module loads', () => {
  assert.strictEqual(typeof logic, 'object');
});

test('computeUrgency: 미상/무효 → gray', () => {
  const today = new Date('2026-07-23T00:00:00');
  assert.strictEqual(logic.computeUrgency(undefined, today), logic.URGENCY.GRAY);
  assert.strictEqual(logic.computeUrgency('not-a-date', today), logic.URGENCY.GRAY);
});

test('computeUrgency: 구간 경계', () => {
  const today = new Date('2026-07-23T00:00:00');
  assert.strictEqual(logic.computeUrgency('2026-08-01', today), logic.URGENCY.RED);    // 6개월 이내
  assert.strictEqual(logic.computeUrgency('2027-06-01', today), logic.URGENCY.ORANGE); // 1년 이내
  assert.strictEqual(logic.computeUrgency('2028-06-01', today), logic.URGENCY.YELLOW); // 2년 이내
  assert.strictEqual(logic.computeUrgency('2030-01-01', today), logic.URGENCY.BLUE);   // 2년 초과
  assert.strictEqual(logic.computeUrgency('2026-07-01', today), logic.URGENCY.RED);    // 이미 지남 → 최긴급
});

test('validateRecord: 필수는 name/type/region', () => {
  assert.strictEqual(logic.validateRecord({ name:'X', type:'공기업', region:'11' }).valid, true);
  const r = logic.validateRecord({ name:'X', type:'공기업' });
  assert.strictEqual(r.valid, false);
  assert.deepStrictEqual(r.missing, ['region']);
});

test('recordGlyph: ! 우선(필수누락), 그다음 ?(유효일 없음)', () => {
  assert.strictEqual(logic.recordGlyph({ name:'X', type:'공기업' }), '!'); // region 없음
  assert.strictEqual(logic.recordGlyph({ name:'X', type:'공기업', region:'11' }), '?'); // 날짜 없음
  assert.strictEqual(logic.recordGlyph({ name:'X', type:'공기업', region:'11', contractEnd:'2027-01-01' }), '');
});

test('markerShape 매핑', () => {
  assert.strictEqual(logic.markerShape('대학병원'), 'circle');
  assert.strictEqual(logic.markerShape('공기업'), 'square');
  assert.strictEqual(logic.markerShape('공공기관'), 'triangle');
  assert.strictEqual(logic.markerShape('지자체'), 'polygon');
  assert.strictEqual(logic.markerShape('대학교'), 'pentagon');
  assert.strictEqual(logic.markerShape('연구소'), 'diamond'); // 미정의 폴백
});

test('FILTERABLE_TYPES: 대학교 포함, 지자체는 제외(면이라 랭킹에서 숨기지 않음)', () => {
  assert.ok(logic.FILTERABLE_TYPES.indexOf('대학교') >= 0);
  assert.strictEqual(logic.FILTERABLE_TYPES.indexOf('지자체'), -1);
});

test('visibleMarkers: 지자체 제외 + 유형 필터 + 미정의 항상표시', () => {
  const list = [
    { name:'구청', type:'지자체', region:'11' },
    { name:'병원', type:'대학병원', region:'11' },
    { name:'공사', type:'공기업', region:'11' },
    { name:'대학', type:'대학교', region:'11' },
    { name:'연구소', type:'연구소', region:'11' },
  ];
  const enabled = new Set(['대학병원']); // 공기업·대학교 꺼짐
  const vis = logic.visibleMarkers(list, enabled).map(r => r.name);
  // 지자체 제외, 공기업·대학교(필터 대상, 꺼짐) 제외, 연구소(미정의) 표시
  assert.deepStrictEqual(vis.sort(), ['병원','연구소'].sort());
});

test('normalizeMuniName: 기관명 → 행정구역 폴리곤명', () => {
  assert.strictEqual(logic.normalizeMuniName('마포구청'), '마포구');
  assert.strictEqual(logic.normalizeMuniName('마포구청(예시)'), '마포구');
  assert.strictEqual(logic.normalizeMuniName('수원시청'), '수원시');
  assert.strictEqual(logic.normalizeMuniName('서울시청(예시)'), '서울시'); // 광역 → 어떤 구에도 안 붙음
  assert.strictEqual(logic.normalizeMuniName(''), '');
  assert.strictEqual(logic.normalizeMuniName(null), '');
});

test('sortByUrgency: 임박순 + 미상 뒤로', () => {
  const today = new Date('2026-07-23T00:00:00');
  const list = [
    { name:'미상', region:'11' },
    { name:'멂', contractEnd:'2029-01-01' },
    { name:'임박', contractEnd:'2026-08-01' },
  ];
  assert.deepStrictEqual(logic.sortByUrgency(list, today).map(r => r.name), ['임박','멂','미상']);
});

test('esc: & < > " \' 를 모두 엔티티로 변환', () => {
  assert.strictEqual(logic.esc('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  assert.strictEqual(logic.esc('<script>alert("x")</script>'),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('esc: 일반 문자열/숫자는 그대로(문자열화만)', () => {
  assert.strictEqual(logic.esc('서울 구청 A-1'), '서울 구청 A-1');
  assert.strictEqual(logic.esc(123), '123');
  assert.strictEqual(logic.esc(''), '');
});

test('ALL_FIELDS: 신규 스키마 필드', () => {
  assert.deepStrictEqual(logic.ALL_FIELDS,
    ['name','type','region','subRegion','term','lastBid','contractEnd','confirmed','lng','lat','sources','updatedAt']);
});

test('formatBidDate: 괄호 표기', () => {
  assert.strictEqual(logic.formatBidDate({ contractEnd:'2026-12-03', confirmed:true }), '2026-12-03(확정)');
  assert.strictEqual(logic.formatBidDate({ contractEnd:'2026-12-03' }), '2026-12-03(추측)');
  assert.strictEqual(logic.formatBidDate({ lastBid:'2022-12-05', term:2 }), '2024-12-05(추측)');
  assert.strictEqual(logic.formatBidDate({}), '미상');
});

test('FIELD_LABELS: 한글 라벨 매핑', () => {
  assert.strictEqual(logic.FIELD_LABELS.contractEnd, '입찰예상일');
  assert.strictEqual(logic.FIELD_LABELS.term, '입찰주기');
});

test('addYears: 정수 년 더하기', () => {
  assert.strictEqual(logic.addYears('2022-12-05', 2), '2024-12-05');
  assert.strictEqual(logic.addYears('2020-02-29', 1), '2021-03-01'); // 윤일 롤오버
  assert.strictEqual(logic.addYears('', 2), null);
  assert.strictEqual(logic.addYears('bad', 2), null);
});

test('effectiveBid: 확정/추측/미상 유도', () => {
  // 확정: 날짜 + confirmed
  assert.deepStrictEqual(logic.effectiveBid({ contractEnd:'2026-12-03', confirmed:true }),
    { date:'2026-12-03', confidence:'확정' });
  // 추측: 날짜 있으나 confirmed 아님(기본)
  assert.deepStrictEqual(logic.effectiveBid({ contractEnd:'2026-12-03' }),
    { date:'2026-12-03', confidence:'추측' });
  // 추측: 날짜 없고 지난입찰일+주기 → 계산
  assert.deepStrictEqual(logic.effectiveBid({ lastBid:'2022-12-05', term:2 }),
    { date:'2024-12-05', confidence:'추측' });
  // 미상: 아무것도 없음
  assert.deepStrictEqual(logic.effectiveBid({}), { date:null, confidence:'미상' });
});

test('urgencyOf: effectiveBid 기반', () => {
  const today = new Date('2026-07-23T00:00:00');
  assert.strictEqual(logic.urgencyOf({ contractEnd:'2026-08-01', confirmed:true }, today), logic.URGENCY.RED);
  assert.strictEqual(logic.urgencyOf({ lastBid:'2022-01-01', term:4 }, today), logic.URGENCY.RED); // 2026-01-01
  assert.strictEqual(logic.urgencyOf({}, today), logic.URGENCY.GRAY);
});

test('sortByUrgency: effectiveBid(추측 포함) 기준 임박순', () => {
  const today = new Date('2026-07-23T00:00:00');
  const list = [
    { name:'미상' },
    { name:'추측멂', lastBid:'2025-01-01', term:4 }, // 2029-01-01
    { name:'확정임박', contractEnd:'2026-08-01', confirmed:true },
  ];
  assert.deepStrictEqual(logic.sortByUrgency(list, today).map(r=>r.name), ['확정임박','추측멂','미상']);
});

test('dedupeByInstitution: 같은 시의 일반구 레코드는 첫 등장만 남는다(순서 보존)', () => {
  const list = [
    { region:'41', subRegion:'31011', name:'수원시청' },
    { region:'41', subRegion:'31012', name:'수원시청' },
    { region:'11', subRegion:'11020', name:'중구청' },
    { region:'41', subRegion:'31013', name:'수원시청' },
    { region:'26', subRegion:'21020', name:'부산 서구청' },
  ];
  assert.deepStrictEqual(
    logic.dedupeByInstitution(list).map(r => r.region + '|' + r.name),
    ['41|수원시청', '11|중구청', '26|부산 서구청']);
});

test('dedupeByInstitution: 동명 기관이라도 region이 다르면 둘 다 남는다', () => {
  const list = [
    { region:'41', name:'광주시청' },   // 경기 광주
    { region:'29', name:'광주시청' },   // 가상의 동명 — 지역이 다르면 다른 기관
  ];
  assert.strictEqual(logic.dedupeByInstitution(list).length, 2);
});

test('sortByInterest: 관심 먼저(임박순) 그 뒤 미관심(임박순)', () => {
  const today = new Date('2026-07-23T00:00:00');
  const list = [
    { name:'미관심임박', contractEnd:'2026-08-01', confirmed:true },
    { name:'관심멂', contractEnd:'2029-01-01', confirmed:true },
    { name:'관심임박', contractEnd:'2026-09-01', confirmed:true },
  ];
  const hearts = new Set(['관심멂','관심임박']);
  const out = logic.sortByInterest(list, today, r => hearts.has(r.name)).map(r=>r.name);
  assert.deepStrictEqual(out, ['관심임박','관심멂','미관심임박']);
});

test('parseCsv: 한글헤더→영문키 + 타입 변환', () => {
  const csv = '﻿기관명,기관구분,지역코드,입찰주기,지난입찰일,입찰예상일,확정여부,경도,위도,출처,수정일\n'
    + '서울시청,지자체,11,2,2022-12-05,,,,,공고A;공고B,2026-07-25\n'
    + '"A,병원",대학병원,11,,,2026-08-15,Y,126.99,37.56,,2026-07-25\n';
  const recs = logic.parseCsv(csv);
  assert.strictEqual(recs.length, 2);
  assert.deepStrictEqual(recs[0], { name:'서울시청', type:'지자체', region:'11', term:2,
    lastBid:'2022-12-05', contractEnd:'', confirmed:false, lng:null, lat:null,
    sources:['공고A','공고B'], updatedAt:'2026-07-25' });
  assert.strictEqual(recs[1].name, 'A,병원');       // 따옴표 내 쉼표 보존
  assert.strictEqual(recs[1].confirmed, true);       // Y → true
  assert.strictEqual(recs[1].lng, 126.99);
  assert.deepStrictEqual(recs[1].sources, []);       // 빈 출처 → []
});

test('parseCsv: 구시군코드 → subRegion 매핑', () => {
  const csv = '﻿기관명,기관구분,지역코드,구시군코드,입찰예상일,출처,수정일\n'
    + '마포구청,지자체,11,11140,2026-09-30,공고A,2026-07-28\n';
  const recs = logic.parseCsv(csv);
  assert.strictEqual(recs[0].subRegion, '11140');
  assert.strictEqual(recs[0].region, '11');
});

test('parseCsv: 구시군코드 열이 없어도 기존 CSV가 그대로 동작', () => {
  const csv = '﻿기관명,기관구분,지역코드,수정일\n서울시청,지자체,11,2026-07-25\n';
  const recs = logic.parseCsv(csv);
  assert.strictEqual(recs[0].name, '서울시청');
  assert.strictEqual(recs[0].subRegion, undefined);
});

test('buildCsvTemplate: BOM + 헤더 포함', () => {
  const t = logic.buildCsvTemplate();
  assert.ok(t.startsWith('﻿'));
  assert.ok(t.indexOf('기관명,기관구분,지역코드') >= 0);
});

test('separateLabelsY: 겹치는 라벨은 세로로 벌어진다', () => {
  // 서울/경기처럼 거의 같은 자리에 겹친 두 라벨
  const boxes = [ {x:100, y:50, w:40, h:14}, {x:100, y:55, w:40, h:14} ];
  const dy = logic.separateLabelsY(boxes);
  const a = boxes[0].y + dy[0], b = boxes[1].y + dy[1];
  assert.ok(Math.abs(a - b) >= 14, '중심 간격이 글자 높이 이상으로 벌어져야 함: ' + Math.abs(a - b));
  assert.ok(a < b, '원래 위에 있던 쪽이 계속 위여야 함');
});

test('separateLabelsY: 안 겹치면 그대로 둔다', () => {
  const boxes = [ {x:100, y:50, w:40, h:14}, {x:100, y:300, w:40, h:14} ];
  assert.deepStrictEqual(logic.separateLabelsY(boxes), [0, 0]);
});

test('separateLabelsY: 가로가 안 겹치면 세로가 겹쳐도 건드리지 않는다', () => {
  const boxes = [ {x:100, y:50, w:40, h:14}, {x:400, y:52, w:40, h:14} ];
  assert.deepStrictEqual(logic.separateLabelsY(boxes), [0, 0]);
});

test('accountLabel: 사람은 "이름 (소속)", 역할만 있으면 그 사실을 드러낸다', () => {
  assert.strictEqual(logic.accountLabel({ name: '김 차장', team: '영업' }), '김 차장 (영업)');
  assert.strictEqual(logic.accountLabel({ name: null, team: '디자이너' }), '(역할만) 디자이너');
  assert.strictEqual(logic.accountLabel({ name: '박 수석', team: null }), '박 수석');
  assert.strictEqual(logic.accountLabel(null), '');
});

test('accountValue: 이름과 소속을 한 문자열로 (select value 왕복용)', () => {
  assert.strictEqual(logic.accountValue({ name: '김 차장', team: '영업' }), '김 차장\u241f영업');
  assert.deepStrictEqual(logic.parseAccountValue('김 차장\u241f영업'), { name: '김 차장', team: '영업' });
  assert.deepStrictEqual(logic.parseAccountValue('\u241f디자이너'), { name: '', team: '디자이너' });
  assert.deepStrictEqual(logic.parseAccountValue(''), { name: '', team: '' });
});

test('SERVER_UNSAVABLE_FIELDS: 서버 모드에서 저장 경로가 없는 필드를 명시한다', function () {
  // 편집창이 이 목록을 보고 입력을 잠근다 — 목록이 비면 무음 실패(기관명을 고쳐도
  // 서버·화면 어디에도 안 남고 오류도 없음)가 되살아난다.
  assert.ok(Array.isArray(logic.SERVER_UNSAVABLE_FIELDS));
  assert.ok(logic.SERVER_UNSAVABLE_FIELDS.indexOf('name') >= 0);
  // 로컬 overlay로 저장되는 필드가 여기 섞이면 멀쩡한 편집까지 막힌다.
  ['lng', 'lat', 'sources'].forEach(function (f) {
    assert.strictEqual(logic.SERVER_UNSAVABLE_FIELDS.indexOf(f), -1);
  });
});

test('formatDDay: 지난 날짜는 D+n, 당일은 D-day, 미상은 미상', () => {
  const today = new Date('2026-08-09T00:00:00');
  assert.strictEqual(logic.formatDDay({ contractEnd: '2026-08-06', confirmed: true }, today), 'D+3');
  assert.strictEqual(logic.formatDDay({ contractEnd: '2026-08-09' }, today), 'D-day');
  assert.strictEqual(logic.formatDDay({ contractEnd: '2026-09-08' }, today), 'D-30');
  assert.strictEqual(logic.formatDDay({ name: '미상건' }, today), '미상');
});

test('formatDDay: lastBid+term으로 유도된 날짜에도 적용된다', () => {
  const today = new Date('2026-08-09T00:00:00');
  assert.strictEqual(logic.formatDDay({ lastBid: '2024-09-24', term: 4 }, today), 'D-777');
});
