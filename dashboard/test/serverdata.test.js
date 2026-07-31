const test = require('node:test');
const assert = require('node:assert');
const sd = require('../js/serverdata.js');

test('mapServerRow: 서버 필드명을 대시보드 스키마로 옮긴다', function () {
  const rec = sd.mapServerRow({
    institution_id: 'dobong', name_ko: '도봉구', region_code: '11',
    type: '지자체', contract_end: '2026-12-31', last_bid: '2022-12-01',
    term: 4, stage: 6,
  });
  assert.deepStrictEqual(rec, {
    institutionId: 'dobong', name: '도봉구', region: '11', type: '지자체',
    contractEnd: '2026-12-31', lastBid: '2022-12-01', term: 4, stage: 6,
  });
});

test('mapServerRow: null 필드는 키를 만들지 않는다', function () {
  const rec = sd.mapServerRow({ institution_id: 'x', name_ko: '엑스', region_code: null,
    type: null, contract_end: null, last_bid: null, term: null, stage: 1 });
  assert.strictEqual('region' in rec, false);
  assert.strictEqual('contractEnd' in rec, false);
});

test('mergeUnion: 서버 필드 우선, 번들 전용 필드 보존, 순서 유지', function () {
  const bundle = [
    { name: '도봉구', region: '11', contractEnd: '2026-01-01', confidence: '확정',
      sources: ['공고'], lng: 127.0, lat: 37.6 },
    { name: '서울대병원', region: '11', contractEnd: '2027-01-01', confidence: '추측', sources: ['기사'] },
  ];
  const server = [
    { institution_id: 'dobong', name_ko: '도봉구', region_code: null, type: '지자체',
      contract_end: '2026-12-31', last_bid: null, term: 4, stage: 6 },
    { institution_id: 'nowon', name_ko: '노원구', region_code: '11', type: '지자체',
      contract_end: null, last_bid: null, term: null, stage: 2 },
  ];
  const out = sd.mergeUnion(bundle, server);

  assert.strictEqual(out.length, 3);
  const dobong = out[0];
  assert.strictEqual(dobong.contractEnd, '2026-12-31');   // 서버 우선
  assert.strictEqual(dobong.region, '11');                // 서버 null → 번들 유지
  assert.deepStrictEqual(dobong.sources, ['공고']);        // 번들 전용 필드 보존
  assert.strictEqual(dobong.lng, 127.0);
  assert.strictEqual(dobong.stage, 6);                     // 서버 전용 필드 노출
  assert.strictEqual(out[1].name, '서울대병원');            // 서버에 없는 번들 행 유지
  assert.strictEqual(out[2].name, '노원구');                // 번들에 없는 서버 행 추가
});
