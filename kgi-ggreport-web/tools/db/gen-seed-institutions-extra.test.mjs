// gen-seed-institutions.mjs --extra(031) 단위 시험 — node --test kgi-ggreport-web/tools/db/
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRows, hasExtra, main, normalizeExtra, parseArgs, parseSeoulIds, renderMysqlExtra, renderOracleExtra,
  validOpenDate, validUrl,
} from './gen-seed-institutions.mjs';

const GU = ['dobong:도봉구', 'dongdaemun:동대문구', 'dongjak:동작구', 'eunpyeong:은평구', 'gangbuk:강북구', 'gangdong:강동구',
  'gangnam:강남구', 'gangseo:강서구', 'geumcheon:금천구', 'guro:구로구', 'gwanak:관악구', 'gwangjin:광진구', 'jongno:종로구',
  'jung:중구', 'jungnang:중랑구', 'mapo:마포구', 'nowon:노원구', 'seocho:서초구', 'seodaemun:서대문구', 'seongbuk:성북구',
  'seongdong:성동구', 'songpa:송파구', 'yangcheon:양천구', 'yeongdeungpo:영등포구', 'yongsan:용산구'].map((x) => x.split(':'));
const ORACLE003 = GU.map(([id, n], i) => `    SELECT '${id}'${i ? '' : ' AS INSTITUTION_ID'}, '${n}' FROM DUAL`).join(' UNION ALL\n');
const seoul = parseSeoulIds(ORACLE003);
const seoulRecs = GU.map(([, n]) => ({ name: `${n}청`, region: '11' }));
const meta = { number: '031', count: 0, muniSha: 'x'.repeat(64), nonSha: 'y'.repeat(64) };
const mk = (extra) => buildRows(seoulRecs, [extra], seoul, { extra: true });
const one = (extra) => { const { rows, warnings } = mk(extra); return { r: rows.find((x) => x.name === extra.name), warnings }; };

test('validUrl: http(s)만, 서버 url() 과 같은 글자 기준', () => {
  assert.ok(validUrl('https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=R26BK01656425&bidPbancOrd=000'));
  for (const bad of ['javascript:alert(1)', 'ftp://x.kr/a', 'https://u:p@x.kr/', 'https://x.kr/a b', '//x.kr',
    'http://x.kr/"><img src=x onerror=alert(1)>', 'http://x.kr/<a>', 'http://x.kr/a\\b', 'http://x.kr/{a}', 'http://x.kr/a|b',
    'http://x.kr/a^b', 'http://x.kr/a`b', 'http://x.kr/‮', 'https://x.kr/' + 'a'.repeat(500), '']) {
    assert.equal(validUrl(bad), false, bad);
  }
});

test('validOpenDate', () => {
  for (const ok of ['2028', '2028-03', '2028-03-01']) assert.ok(validOpenDate(ok), ok);
  for (const bad of ['2028-13', '2028-02-30', '1999', '2028-3', '20280301', 'abc']) assert.equal(validOpenDate(bad), false, bad);
});

test('상태 변환: 개원 예정 → PLANNED, 기본 OPERATING, 알 수 없는 값은 throw', () => {
  assert.equal(one({ name: '가원', opStatus: '개원 예정', openDate: '2031' }).r.opCode, 'PLANNED');
  assert.equal(one({ name: '가원' }).r.opCode, 'OPERATING');
  assert.throws(() => mk({ name: '가원', opStatus: '폐쇄' }), /opStatus/);
});

test('확정 + 출처 있음 → 1, 링크는 검증한 값으로', () => {
  const { r } = one({ name: '가원', contractEnd: '2027-03-01', confirmed: true, noticeNo: '제2026-1393호', noticeUrl: 'https://x.kr/a' });
  assert.equal(r.ceConfirmed, 1);
  assert.equal(r.ceUrl, 'https://x.kr/a');
  assert.equal(r.ceNo, '제2026-1393호');
});

test('B2: 확정인데 출처 없음 → 추정(0)으로 강등 + 경고', () => {
  const { r, warnings } = one({ name: '가원', contractEnd: '2027-03-01', confirmed: true });
  assert.equal(r.ceConfirmed, 0);
  assert.equal(r.ceDowngraded, true);
  assert.ok(warnings.some((w) => /강등/.test(w)));
});

test('B1: 불량 링크(따옴표·꺾쇠)는 버려지고 번호도 없으면 강등', () => {
  const { r, warnings } = one({ name: '가원', contractEnd: '2027-03-01', confirmed: true, noticeUrl: 'http://x.kr/"><b>' });
  assert.equal(r.ceUrl, null);
  assert.equal(r.ceConfirmed, 0);
  assert.ok(warnings.some((w) => /noticeUrl/.test(w)));
});

test('confirmed 인데 contractEnd 없으면 0 + 경고', () => {
  const { r, warnings } = one({ name: '가원', confirmed: true, noticeNo: 'R26BK01656425' });
  assert.equal(r.ceConfirmed, 0);
  assert.ok(warnings.some((w) => /contractEnd/.test(w)));
});

test('렌더: 날것 & 없음(Oracle 은 CHR(38)), 두 번 렌더하면 같음, 031 대상만', () => {
  const { rows } = mk({ name: '가원', contractEnd: '2027-03-01', confirmed: true, noticeUrl: 'https://x.kr/a?b=1&c=2', noticeNo: 'R26' });
  const xr = rows.filter(hasExtra);
  assert.equal(xr.length, 1);
  const my = renderMysqlExtra(xr, { ...meta, count: 1 });
  const or = renderOracleExtra(xr, { ...meta, count: 1 });
  assert.ok(/b=1&c=2/.test(my));
  assert.ok(or.includes("CHR(38)"));
  assert.ok(!/b=1&c=2/.test(or));
  assert.equal(renderMysqlExtra(xr, { ...meta, count: 1 }), my);
  assert.equal(renderOracleExtra(xr, { ...meta, count: 1 }), or);
  // MySQL: CONTRACT_END_CONFIRMED 가 마지막 대입(SET 왼쪽부터 평가)
  const sets = my.slice(my.indexOf('ON DUPLICATE KEY UPDATE')).match(/^\s{4}([A-Z_]+)\s*=/gm).map((s) => s.trim().split(/\s/)[0]);
  assert.equal(sets[sets.length - 1], 'CONTRACT_END_CONFIRMED');
});

test('--extra 기본 번호·이름', () => {
  const o = parseArgs(['--extra']);
  assert.equal(o.number, '031');
  assert.equal(o.name, 'seed_institution_columns');
  assert.equal(parseArgs(['--extra', '--number', '032']).number, '032');
  assert.equal(parseArgs([]).number, '029');
});

test('029 모드 출력은 커밋된 029 와 바이트 단위로 같다(--extra 없이)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'gen029-'));
  const log = console.log; const warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  let code;
  try { code = main(['--out-dir', tmp]); } finally { console.log = log; console.warn = warn; }
  assert.equal(code, 0);
  for (const d of ['mysql', 'oracle']) {
    const f = '029_seed_institutions_all.sql';
    const a = readFileSync(path.join(tmp, d, f), 'utf8');
    const b = readFileSync(path.resolve(here, '../../src/main/resources/db', d, f), 'utf8').replace(/\r\n/g, '\n');   // 체크아웃 줄바꿈 차이만 흡수
    assert.equal(a, b, `${d}/${f} 불일치`);
  }
});
