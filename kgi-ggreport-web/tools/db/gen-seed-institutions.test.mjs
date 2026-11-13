// gen-seed-institutions.mjs 단위 시험 — node --test kgi-ggreport-web/tools/db/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, makeId, parseSeoulIds, renderMysql, renderOracle } from './gen-seed-institutions.mjs';

const GU = ['dobong:도봉구', 'dongdaemun:동대문구', 'dongjak:동작구', 'eunpyeong:은평구', 'gangbuk:강북구', 'gangdong:강동구',
  'gangnam:강남구', 'gangseo:강서구', 'geumcheon:금천구', 'guro:구로구', 'gwanak:관악구', 'gwangjin:광진구', 'jongno:종로구',
  'jung:중구', 'jungnang:중랑구', 'mapo:마포구', 'nowon:노원구', 'seocho:서초구', 'seodaemun:서대문구', 'seongbuk:성북구',
  'seongdong:성동구', 'songpa:송파구', 'yangcheon:양천구', 'yeongdeungpo:영등포구', 'yongsan:용산구'].map((x) => x.split(':'));
const ORACLE003 = GU.map(([id, n], i) => `    SELECT '${id}'${i ? '' : ' AS INSTITUTION_ID'}, '${n}' FROM DUAL`).join(' UNION ALL\n');
const seoul = parseSeoulIds(ORACLE003);
const seoulRecs = GU.map(([, n]) => ({ name: `${n}청`, region: '11' }));
const meta = { number: '029', count: 0, muniSha: 'x'.repeat(64), nonSha: 'y'.repeat(64) };

test('서울 25구는 003 id·DB 이름 그대로', () => {
  const { rows } = buildRows(seoulRecs, [], seoul);
  const mapo = rows.find((r) => r.id === 'mapo');
  assert.equal(mapo.name, '마포구');
  assert.equal(rows.length, 25);
});

test('서울 구가 하나라도 빠지면 실패(id 불변 조건)', () => {
  assert.throws(() => buildRows(seoulRecs.slice(1), [], seoul), /id 불변/);
  assert.throws(() => parseSeoulIds('SELECT \'a\', \'가\' FROM DUAL'), /25구/);
});

test('지자체 id 는 해시, 다른 시도의 같은 이름은 다른 id, 같은 기관 여러 블록은 한 행', () => {
  const busanJung = makeId({ name: '중구청', region: '26' }, 'muni', seoul);
  assert.match(busanJung, /^lg-26-[0-9a-f]{10}$/);
  assert.notEqual(busanJung, 'jung');
  const { rows, warnings } = buildRows(seoulRecs.concat([1, 2, 3, 4, 5].map(() => ({ name: '창원시청', region: '48' }))), [], seoul);
  assert.equal(rows.filter((r) => r.name === '창원시청').length, 1);
  assert.equal(warnings.length, 0);
});

test('지자체 외 id 우선순위 orgCode > g2bCode > 이름 해시', () => {
  assert.equal(makeId({ name: '가', orgCode: '9740894' }, 'nonmuni', seoul), 'org-9740894');
  assert.equal(makeId({ name: '가', g2bCode: 'X1' }, 'nonmuni', seoul), 'g2b-X1');
  assert.match(makeId({ name: '가', type: '병원', region: '11' }, 'nonmuni', seoul), /^nm-[0-9a-f]{10}$/);
});

test('값 충돌은 먼저 나온 값 + 경고, 형식 불량은 NULL + 경고', () => {
  const { rows, warnings } = buildRows(seoulRecs.concat([{ name: '가시청', region: '48', lastBid: '2026-01-01' },
    { name: '가시청', region: '48', lastBid: '2025-01-01', term: 0 }]), [], seoul);
  const r = rows.find((x) => x.name === '가시청');
  assert.equal(r.lastBid, '2026-01-01');
  assert.ok(warnings.some((w) => /lastBid/.test(w)));
  const bad = buildRows(seoulRecs.concat([{ name: '나시청', region: '48', lastBid: '2026-1-3', term: 0 }]), [], seoul);
  const b = bad.rows.find((x) => x.name === '나시청');
  assert.equal(b.lastBid, null);
  assert.equal(b.term, null);
});

test('이스케이프 — 작은따옴표·&·역슬래시, 이름의 -- 는 거부', () => {
  const { rows } = buildRows(seoulRecs, [{ name: "O'B&C\\", type: '공공기관', region: '11', g2bCode: 'Q1' }], seoul);
  const my = renderMysql(rows, meta);
  const or = renderOracle(rows, meta);
  assert.ok(my.includes("'O''B&C\\\\'"));
  assert.ok(or.includes("'O''B'||CHR(38)||'C\\'"));
  assert.throws(() => buildRows(seoulRecs, [{ name: 'a--b', g2bCode: 'Q2' }], seoul), /쓸 수 없는/);
});

test('덮어쓰기 금지 규칙과 결정성', () => {
  const { rows } = buildRows(seoulRecs, [], seoul);
  const my = renderMysql(rows, meta);
  const or = renderOracle(rows, meta);
  assert.ok(my.includes('ON DUPLICATE KEY UPDATE') && !/NAME_KO\s*=|STAGE\s*=/.test(my.split('ON DUPLICATE KEY UPDATE')[1]));
  assert.ok(or.includes('WHEN MATCHED') && !or.includes('t.STAGE') && !or.includes('t.NAME_KO') && or.trim().endsWith('COMMIT;'));
  const shuffled = buildRows(seoulRecs.slice().reverse(), [], seoul).rows;
  assert.equal(renderMysql(shuffled, meta), my);
});
