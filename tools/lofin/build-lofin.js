// 행안부 「지방자치단체 금고지정 현황」 CSV → frontend/data/lofin-<연도>.js 화면 데이터 파일.
// 실행: node tools/lofin/build-lofin.js [CSV경로] [출력경로]
//   기본: corpus/inbox/2026-11-16_lofin365/2026_금고지정현황.csv → frontend/data/lofin-2026.js
// 규칙 근거: data-auditor 2026-11-17(행안부 243곳 변환 규칙), 순위 = 사용자 11-17
//   "일반회계가 속하면 1금고, 나머지는 2금고, 한 은행이 일반회계와 나머지를 모두 맡으면 단수금고".
// 해마다 새 판이 나오면 CSV를 corpus/inbox/에 넣고 경로·ASOF만 바꿔 다시 돌린다. 한글 소스라 PowerShell로 쓰지 않는다.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const CSV = path.resolve(ROOT, process.argv[2] || 'corpus/inbox/2026-11-16_lofin365/2026_금고지정현황.csv');
const OUT = path.resolve(ROOT, process.argv[3] || 'frontend/data/lofin-2026.js');
const ASOF = '2026-01-01';
const SRC = '행안부 금고지정 현황(2026.1.1. 기준)';
const URL = 'https://www.lofin365.go.kr/portal/LF8310000.do?curPage=1&ntcaClsDvCd=FSL409';

const REGION = { 서울: '11', 부산: '26', 대구: '27', 인천: '28', 광주: '46', 대전: '30', 울산: '31', 세종: '36',
  경기: '41', 강원: '42', 충북: '43', 충남: '44', 전북: '45', 전남: '46', 경북: '47', 경남: '48', 제주: '50' };
const CAPITAL = { 서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시', 대전: '대전광역시',
  울산: '울산광역시', 세종: '세종특별자치시', 경기: '경기도', 강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도',
  전북: '전북특별자치도', 경북: '경상북도', 경남: '경상남도', 제주: '제주특별자치도', 광주: '전남광주통합특별시', 전남: '전남광주통합특별시' };
const PREFIX = { 부산: ['중구', '서구', '동구', '남구', '북구', '강서구'], 대구: ['중구', '동구', '서구', '남구', '북구'],
  대전: ['동구', '중구', '서구'], 울산: ['중구', '남구', '동구', '북구'], 광주: ['동구', '서구', '남구', '북구'], 경남: ['고성군'] };
// 2026-07-01 인천 개편 — 옛 구 값을 새 구에 근사로 싣는다(institutions.js 주석 기준).
const INCHEON = { 중구: ['영종구청'], 동구: ['제물포구청'], 서구: ['서해구청', '검단구청'] };
const BANK = { 농협: '농협은행', NH농협은행: '농협은행', IM뱅크: 'iM뱅크', 아이엠뱅크: 'iM뱅크' };
const ACCT_ORDER = ['일반회계', '기타특별', '공기업특별', '특별회계', '기금', '고향사랑기금'];

function acctOf(raw) {
  const s = raw.replace(/\(.*?\)/g, '').replace(/[0-9.]+$/, '').trim();
  if (/^일반/.test(s)) return '일반회계';
  if (/^기타특별/.test(s)) return '기타특별';
  if (/^공기업/.test(s)) return '공기업특별';
  if (/^특별회계/.test(s)) return '특별회계';
  if (/^고향사랑기금/.test(s)) return '고향사랑기금';
  if (/^기금/.test(s)) return '기금';
  throw new Error('모르는 회계구분: ' + raw);
}
function dateOf(raw) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})\.?$/.exec(String(raw).trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
  return m[1] + '-' + m[2] + '-' + m[3];
}
function keysOf(sido, unit) {
  const r = REGION[sido];
  if (!r) throw new Error('모르는 시도: ' + sido);
  if (unit === '본청' || unit === '도본청') return [r + '|' + CAPITAL[sido]];
  if (sido === '인천' && INCHEON[unit]) return INCHEON[unit].map(function (n) { return r + '|' + n; });
  if ((PREFIX[sido] || []).indexOf(unit) >= 0) return [r + '|' + sido + ' ' + unit + '청'];
  if (/[구시군]$/.test(unit)) return [r + '|' + unit + '청'];
  throw new Error('이름 규칙 밖: ' + sido + ' ' + unit);
}
function mode(arr) {
  const c = {}; let best = null;
  arr.forEach(function (v) { c[v] = (c[v] || 0) + 1; if (best == null || c[v] > c[best]) best = v; });
  return best;
}

const text = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '');
const lines = text.split(/\r?\n/);
const head = lines.findIndex(function (l) { return /^시도,자치단체,회계구분/.test(l); });
if (head < 0) throw new Error('머리글 없음');

const units = new Map();   // '시도|자치단체' → { sido, unit, rows: [] }
const anomalies = [];
let dataRows = 0;
for (let i = head + 1; i < lines.length; i += 1) {
  const l = lines[i];
  if (!l.trim()) continue;
  const f = l.split(',').map(function (s) { return s.trim(); });
  if (f.length < 6) throw new Error((i + 1) + '줄 칸 수: ' + l);
  dataRows += 1;
  const ln = i + 1, sido = f[0], unit = f[1];
  const bank = BANK[f[3]] || f[3];
  const start = dateOf(f[4]), end = dateOf(f[5]);
  if (!start) anomalies.push({ ln: ln, unit: sido + ' ' + unit, field: 'start', raw: f[4], kind: 'BAD_DATE', used: null });
  if (!end) anomalies.push({ ln: ln, unit: sido + ' ' + unit, field: 'end', raw: f[5], kind: 'BAD_DATE', used: null });
  const k = sido + '|' + unit;
  if (!units.has(k)) units.set(k, { sido: sido, unit: unit, rows: [] });
  units.get(k).rows.push({ ln: ln, raw: f[2], acct: acctOf(f[2]), bank: bank, start: start, end: end });
}

const rows = {};
const exceptions = [];
let single = 0, ranked = 0;
units.forEach(function (u) {
  const banks = [];
  u.rows.forEach(function (r) { if (banks.indexOf(r.bank) < 0) banks.push(r.bank); });
  const gen = u.rows.filter(function (r) { return r.acct === '일반회계'; });
  const genBanks = [];
  gen.forEach(function (r) { if (genBanks.indexOf(r.bank) < 0) genBanks.push(r.bank); });
  const where = u.sido + ' ' + u.unit;
  if (!gen.length) { exceptions.push({ unit: where, kind: 'NO_GENERAL' }); return; }
  if (genBanks.length > 1) { exceptions.push({ unit: where, kind: 'SPLIT_GENERAL' }); return; }
  if (banks.length > 2) { exceptions.push({ unit: where, kind: 'MANY_BANKS' }); return; }
  if (banks.length === 1) single += 1; else ranked += 1;
  const items = banks.map(function (b) {
    const mine = u.rows.filter(function (r) { return r.bank === b; });
    const g = mine.filter(function (r) { return r.acct === '일반회계'; });
    const pick = function (fld) {
      const own = g.map(function (r) { return r[fld]; }).filter(Boolean);
      if (own.length) return own[0];
      const all = mine.map(function (r) { return r[fld]; }).filter(Boolean);
      const vals = all.filter(function (v, i) { return all.indexOf(v) === i; });
      if (vals.length > 1) anomalies.push({ unit: where, bank: b, field: fld, kind: 'CONFLICT', raw: vals.join('/'), used: mode(all) });
      return mode(all);
    };
    const rank = banks.length === 1 ? 'SINGLE' : (b === genBanks[0] ? 'RANK1' : 'RANK2');
    const accts = ACCT_ORDER.filter(function (a) { return mine.some(function (r) { return r.acct === a; }); });
    return { bank: b, rank: rank, slot: rank === 'RANK2' ? 2 : 1, accts: accts,
      raw: mine.map(function (r) { return r.raw; }), start: pick('start'), end: pick('end'),
      ln: mine.map(function (r) { return r.ln; }) };
  }).sort(function (a, b) { return a.slot - b.slot; });
  items.forEach(function (it) {
    if (!it.start || !it.end) return;
    const s = new Date(it.start + 'T00:00:00Z'), e = new Date(it.end + 'T00:00:00Z');
    const ok = [3, 4].some(function (n) {
      const x = new Date(s); x.setUTCFullYear(x.getUTCFullYear() + n); x.setUTCDate(x.getUTCDate() - 1);
      return x.getTime() === e.getTime();
    });
    if (!ok) anomalies.push({ unit: where, bank: it.bank, field: 'term', kind: 'SUSPECT_TERM', raw: it.start + '~' + it.end, used: it.start + '~' + it.end });
  });
  const keys = keysOf(u.sido, u.unit);
  const merged = CAPITAL[u.sido] === '전남광주통합특별시' && (u.unit === '본청' || u.unit === '도본청');
  keys.forEach(function (key) {
    const tagged = items.map(function (it) {
      const o = Object.assign({}, it);
      if (merged) o.unit = u.sido + ' 본청';
      if (u.sido === '인천' && INCHEON[u.unit]) { o.unit = '옛 인천 ' + u.unit; o.approx = true; }
      return o;
    });
    rows[key] = (rows[key] || []).concat(tagged);
  });
});

// ── 검산(data-auditor 2026-11-17 손 집계와 대조) ──
function must(cond, msg) { if (!cond) throw new Error('검산 실패: ' + msg); }
must(dataRows === 977, '데이터 행 977 (실제 ' + dataRows + ')');
must(units.size === 243, '기관 243 (실제 ' + units.size + ')');
must(exceptions.length === 0, '예외 0 (실제 ' + JSON.stringify(exceptions) + ')');
must(single === 130 && ranked === 113, 'SINGLE 130·1·2금고 113 (실제 ' + single + '·' + ranked + ')');
must(Object.keys(rows).length === 243, '화면 키 243 (실제 ' + Object.keys(rows).length + ')');

const sandbox = { window: {}, console: console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'frontend/data/institutions.js'), 'utf8'), sandbox);
const instKeys = new Set(sandbox.window.institutions.map(function (r) { return (r.region || '') + '|' + (r.name || ''); }));
const missing = Object.keys(rows).filter(function (k) { return !instKeys.has(k); });
must(missing.length === 0, '화면 기관에 없는 키: ' + missing.join(', '));

const kbSand = { globalThis: {}, window: {} };
kbSand.globalThis = kbSand;
vm.createContext(kbSand);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'frontend/data/kb-verified.js'), 'utf8'), kbSand);
const KBV = kbSand.KB_VERIFIED || kbSand.window.KB_VERIFIED;
must(Array.isArray(KBV), 'KB_VERIFIED 읽기');
const kbKeys = Object.keys(rows).filter(function (k) { return rows[k].some(function (it) { return it.bank === '국민은행'; }); });
must(kbKeys.length === 16, '국민은행 포함 16 (실제 ' + kbKeys.length + ')');
KBV.forEach(function (v) {
  const it = (rows[v.key] || []).filter(function (x) { return x.bank === '국민은행'; })[0];
  must(it, 'KB_VERIFIED ' + v.key + ' 가 표에 없음');
  must(it.slot === v.slot, 'KB_VERIFIED ' + v.key + ' slot ' + v.slot + ' ↔ 표 ' + it.slot);
});

const body = '// 자동 생성 — 손으로 고치지 말 것. node tools/lofin/build-lofin.js (원본 ' + path.relative(ROOT, CSV).split(path.sep).join('/') + ')\n' +
  '// ' + SRC + ' — 지자체 243곳 회계별 금고 은행. rank: SINGLE(한 은행이 모든 회계 = 단수 금고) / RANK1(일반회계 은행 = 1금고) /\n' +
  '// RANK2(나머지 회계만 = 2금고) — 사용자 11-17. slot은 kb-verified.js와 같은 뜻(1 = 일반회계 보유, 2 = 그 밖 회계만).\n' +
  '// unit: 한 화면 키에 다른 기관 몫이 섞일 때(전남광주 통합 본청 2곳, 인천 개편 옛 구). approx: 개편 전 행정구역 값을 근사로 실음.\n' +
  '// 약정 기록 표(INST_BANK_CONTRACT)에는 넣지 않는다 — 화면의 \'수집\' 줄로만 보인다(planner·9f 11-17).\n' +
  '(function (root) {\n  root.LOFIN_2026 = ' + JSON.stringify({ asof: ASOF, src: SRC, url: URL, rows: rows, anomalies: anomalies, exceptions: exceptions }, null, 1)
    .replace(/\n\s*/g, ' ').replace(/\], "(\d{2}\|)/g, '],\n    "$1') + ';\n' +
  '  if (typeof module !== \'undefined\' && module.exports) module.exports = root.LOFIN_2026;\n' +
  '})(typeof window !== \'undefined\' ? window : globalThis);\n';
fs.writeFileSync(OUT, body);
console.log('ok', path.relative(ROOT, OUT), '키', Object.keys(rows).length, 'SINGLE', single, '1·2금고', ranked, '이상값', anomalies.length);
anomalies.forEach(function (a) { console.log('  이상값', JSON.stringify(a)); });
