// NEXT 78 ⑧ — 실제 데이터(frontend/data/institutions.js)로 시도별 지역 색 섞기(C안) 결과를 낸다.
// 목적은 "보라 바다"가 되는지 눈으로 보는 것이라 **출력이 본체**이고, 단언은 회귀용 최소다
// (숫자가 데이터와 함께 바뀌는 것이 정상이므로 특정 색을 못 박지 않는다).
// 보려면: node --test --test-reporter=spec frontend/test/mix_distribution.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const logic = require(path.join(ROOT, 'js/logic.js'));
const render = require(path.join(ROOT, 'js/render.js'));

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/institutions.js'), 'utf8'), sandbox);
const institutions = JSON.parse(JSON.stringify(sandbox.window.institutions));

// 날짜를 고정해 결과가 실행일에 따라 흔들리지 않게 한다(데이터가 늘면 바뀌는 건 정상).
const TODAY = new Date('2026-11-25T00:00:00');   // 메인 D1 측정 기준일과 같다

test('시도별 가장 이른 예상 구간 분포 출력(회귀 단언은 최소)', () => {
  const byRegion = {};
  institutions.forEach(function (r) { (byRegion[r.region] = byRegion[r.region] || []).push(r); });
  const bandCount = {};
  const lines = [];
  let sumTotal = 0;
  Object.keys(byRegion).sort().forEach(function (code) {
    const list = logic.dedupeByInstitution(byRegion[code]);
    const m = logic.regionMix(list, TODAY), b = m.buckets, e = m.earliest[0];
    sumTotal += m.listed;
    bandCount[m.band] = (bandCount[m.band] || 0) + 1;
    lines.push([code, (render.REGION_NAME[code] || '?'), m.band.padEnd(4),
      ('가장 이른 ' + (e ? e.days + '일 ' + e.rec.name : '-')).padEnd(24),
      '공고 전 ' + m.total + ' (3개월 안 ' + b.r3 + ' · 3~6개월 ' + b.r2 + ' · 6개월~1년 ' + b.p + ' · 1~2년 ' + b.b2 +
        ' · 2년 뒤 ' + b.b3 + ' · 근거 없음 ' + b.unknown + ')', '공고 중 ' + m.notice + ' · 경과 ' + m.overdue].join('  '));
  });
  console.log('\n기준일 ' + logic.localDateStr(TODAY) + ' / 시도 ' + lines.length + '곳\n' + lines.join('\n'));
  console.log('색 분포 ' + JSON.stringify(bandCount));

  const valid = ['r3','r2','p','b2','b3','gray','none'];
  Object.keys(bandCount).forEach(function (b) { assert.ok(valid.indexOf(b) >= 0, '알 수 없는 단계 ' + b); });
  assert.strictEqual(sumTotal, logic.dedupeByInstitution(institutions).length);
});
