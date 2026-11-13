#!/usr/bin/env node
// 기관 전체 시드(029) 생성기 — backend-dev 설계(2026-11-13), 외부 패키지 없음(Node 22). 사용법: node gen-seed-institutions.mjs --help
// frontend/data/institutions.js(지자체)·institutions_nonmuni.js(지자체 외)를 읽어 db/mysql·db/oracle 의 029_*.sql 두 벌을 쓴다.
// 시각·난수가 없어 입력이 같으면 출력이 바이트 단위로 같다. Oracle 이 정본, MySQL 은 미러(같은 행·같은 규칙, 문법만 다름).
// 규칙: 없으면 넣고 있으면 빈 칸만 채운다(사람 값·NAME_KO·STAGE 불변). 서울 25구 id 는 003 그대로(기관장·이사회 참조 보호).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SEOUL_COUNT = 25;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Za-z0-9_-]{1,40}$/;
const CHUNK_MYSQL = 100;
const CHUNK_ORACLE = 50;

const USAGE = `사용법: node gen-seed-institutions.mjs [옵션]
  (옵션 없음)        db/mysql·db/oracle 에 029_seed_institutions_all.sql 을 씀
  --check            쓰지 않고 요약·경고만 출력
  --strict           경고가 하나라도 있으면 실패
  --number <NNN>     파일 번호(기본 029) — 이후 갱신은 새 번호로(적용한 파일은 고치지 않는다)
  --name <이름>      파일 이름 꼬리(기본 seed_institutions_all)
  --muni <경로> --nonmuni <경로> --oracle003 <경로> --out-dir <db 폴더>
  --help`;

// ---------- 순수 함수 (단위 시험 대상) ----------

export const sha10 = (s) => createHash('sha1').update(String(s).normalize('NFC'), 'utf8').digest('hex').slice(0, 10);
export const sha256n = (text) => createHash('sha256').update(String(text).replace(/\r\n/g, '\n'), 'utf8').digest('hex');

/** 데이터 파일(window.xxx = [...], 루프·IIFE 포함)을 샌드박스에서 실행해 레코드 배열을 얻는다. */
export function loadRecords(code, key, filename = 'data.js') {
  const win = {};
  const ctx = vm.createContext({ window: win });
  vm.runInContext(code, ctx, { filename, timeout: 5000 });
  const arr = win[key];
  if (!Array.isArray(arr)) throw new Error(`${filename}: window.${key} 배열이 없습니다`);
  return JSON.parse(JSON.stringify(arr));
}

/** Oracle 003 정본에서 '이름 → id' (서울 25구). */
export function parseSeoulIds(oracle003Text) {
  const m = new Map();
  const re = /SELECT\s+'([a-z]+)'(?:\s+AS\s+INSTITUTION_ID)?\s*,\s*'([^']+)'/g;
  let r;
  while ((r = re.exec(oracle003Text))) m.set(r[2], r[1]);
  if (m.size !== SEOUL_COUNT) throw new Error(`Oracle 003 에서 서울 ${SEOUL_COUNT}구 id 를 읽지 못했습니다(${m.size}개)`);
  return m;
}

const blank = (v) => v === undefined || v === null || String(v).trim() === '';

/** 레코드 하나의 기관 id. kind: 'muni' | 'nonmuni' */
export function makeId(rec, kind, seoul) {
  const name = String(rec.name).normalize('NFC').trim();
  const region = blank(rec.region) ? '' : String(rec.region).trim();
  if (kind === 'muni') {
    if (region === '11' && name.endsWith('청') && seoul.has(name.slice(0, -1))) return seoul.get(name.slice(0, -1));
    return `lg-${region || 'xx'}-${sha10(`${region}|${name}`)}`;
  }
  if (!blank(rec.orgCode)) {
    const c = String(rec.orgCode).trim();
    if (!CODE_RE.test(c)) throw new Error(`orgCode 형식 오류: ${name}`);
    return `org-${c}`;
  }
  if (!blank(rec.g2bCode)) {
    const c = String(rec.g2bCode).trim();
    if (!CODE_RE.test(c)) throw new Error(`g2bCode 형식 오류: ${name}`);
    return `g2b-${c}`;
  }
  return `nm-${sha10(`${rec.type || ''}|${region}|${name}`)}`;
}

/** 두 레코드 목록 → { rows, warnings }. rows 는 id 순(결정적). 같은 id 의 레코드는 한 행(필드별 먼저 나온 값). */
export function buildRows(muni, nonmuni, seoul) {
  const warnings = [];
  const byId = new Map();
  const add = (rec, kind) => {
    if (blank(rec.name)) throw new Error('이름이 없는 레코드가 있습니다');
    const id = makeId(rec, kind, seoul);
    const val = {
      name: String(rec.name).normalize('NFC').trim(),
      region: blank(rec.region) ? null : String(rec.region).trim(),
      type: blank(rec.type) ? (kind === 'muni' ? '지자체' : null) : String(rec.type).trim(),
      contractEnd: blank(rec.contractEnd) ? null : String(rec.contractEnd).trim(),
      lastBid: blank(rec.lastBid) ? null : String(rec.lastBid).trim(),
      term: blank(rec.term) ? null : rec.term,
    };
    const cur = byId.get(id);
    if (!cur) { byId.set(id, { id, ...val }); return; }
    for (const k of ['name', 'region', 'type', 'contractEnd', 'lastBid', 'term']) {
      if (cur[k] === null) cur[k] = val[k];
      else if (val[k] !== null && String(val[k]) !== String(cur[k])) {
        if (k === 'name' && id.startsWith('lg-')) throw new Error(`해시 id 충돌: ${id} (${cur.name} / ${val.name})`);
        warnings.push(`${id} ${k}: '${cur[k]}' ≠ '${val[k]}' — 먼저 나온 값 사용`);
      }
    }
  };
  muni.forEach((r) => add(r, 'muni'));
  nonmuni.forEach((r) => add(r, 'nonmuni'));

  // 서울 25구: DB 쪽 이름('마포구')을 쓴다. 25개가 모두 있어야 한다.
  const idToSeoulName = new Map([...seoul].map(([n, i]) => [i, n]));
  let seoulHit = 0;
  for (const row of byId.values()) {
    if (idToSeoulName.has(row.id)) { row.name = idToSeoulName.get(row.id); seoulHit++; }
  }
  if (seoulHit !== SEOUL_COUNT) throw new Error(`서울 ${SEOUL_COUNT}구 중 ${seoulHit}개만 데이터와 짝지어졌습니다 — id 불변 조건 위반`);

  const rows = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const seenName = new Map();
  for (const r of rows) {
    if (r.name.length > 100) throw new Error(`NAME_KO 100자 초과: ${r.id}`);
    if (/[\u0000-\u001f]/.test(r.name) || r.name.includes('--') || r.name.includes('/*')) throw new Error(`이름에 쓸 수 없는 문자열이 있습니다: ${r.id}`);
    if (r.id.length > 64) throw new Error(`id 64자 초과: ${r.id}`);
    if (r.region !== null && !/^\d{2}$/.test(r.region)) { warnings.push(`${r.id} region 형식 불량 '${r.region}' → NULL`); r.region = null; }
    if (r.region === null) warnings.push(`${r.id} region 비어 있음`);
    for (const k of ['contractEnd', 'lastBid']) {
      if (r[k] !== null && !DATE_RE.test(r[k])) { warnings.push(`${r.id} ${k} 형식 불량 '${r[k]}' → NULL`); r[k] = null; }
    }
    if (r.term !== null) {
      const n = Number(r.term);
      if (Number.isInteger(n) && n >= 1 && n <= 30) r.term = n;
      else { warnings.push(`${r.id} term 불량 '${r.term}' → NULL`); r.term = null; }
    }
    if (seenName.has(r.name)) warnings.push(`이름 겹침: '${r.name}' — ${seenName.get(r.name)} / ${r.id} (반입이 이름 키라 구분 필요)`);
    else seenName.set(r.name, r.id);
  }
  return { rows, warnings };
}

// ---------- SQL 출력 ----------

const qMy = (s) => (s === null ? 'NULL' : `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);
const qOr = (s, len) => (s === null
  ? `CAST(NULL AS VARCHAR2(${len}))`
  : `'${String(s).replace(/'/g, "''").replace(/&/g, "'||CHR(38)||'")}'`);

const header = (dialect, meta) => `-- ---------------------------------------------------------------------------
-- kgi-ggreport-web — ${dialect === 'oracle' ? 'Oracle 정본' : 'MySQL 8.0 미러'} (${meta.number}) : 기관 전체 시드(지자체 + 지자체 외)
--
-- ⚠️ 이 파일은 tools/db/gen-seed-institutions.mjs 가 만든다 — 손으로 고치지 않는다.
--    ${dialect === 'oracle' ? 'db/mysql 쪽이 미러다.' : '정본은 db/oracle 쪽이다. 값이 갈리면 정본을 따른다.'}
-- 원본(frontend/data) 해시: institutions.js ${meta.muniSha.slice(0, 12)} · institutions_nonmuni.js ${meta.nonSha.slice(0, 12)}
-- 행 ${meta.count}개(서울 25구 id 는 003 그대로, 나머지는 lg-/org-/g2b-/nm- 접두 id).
--
-- 규칙: 없으면 넣고, 있으면 **비어 있는** REGION_CODE·TYPE·CONTRACT_END·LAST_BID·TERM 만 채운다.
--       사람이 넣은 값·NAME_KO·STAGE 는 덮지 않는다. 여러 번 돌려도 같다(적용 도구는 한 번만 돌린다).
-- 넣지 않는 값: subRegion·orgCode·g2bCode·parentOrgCode·followsCourt·bank·bidKind·court*·contractExpiry (DB 칸 없음).
-- 데이터가 바뀌면 이 파일을 고치지 말고 새 번호로 다시 생성한다(--number).
-- ---------------------------------------------------------------------------
`;

export function renderMysql(rows, meta) {
  const out = [header('mysql', meta)];
  for (let i = 0; i < rows.length; i += CHUNK_MYSQL) {
    const vals = rows.slice(i, i + CHUNK_MYSQL).map((r) =>
      `    (${qMy(r.id)}, ${qMy(r.name)}, ${qMy(r.region)}, ${qMy(r.type)}, ${qMy(r.contractEnd)}, ${qMy(r.lastBid)}, ${r.term === null ? 'NULL' : r.term}, 1)`);
    out.push(`INSERT INTO INSTITUTIONS
    (INSTITUTION_ID, NAME_KO, REGION_CODE, TYPE, CONTRACT_END, LAST_BID, TERM, STAGE)
VALUES
${vals.join(',\n')}
ON DUPLICATE KEY UPDATE
    REGION_CODE  = COALESCE(NULLIF(INSTITUTIONS.REGION_CODE, ''),  VALUES(REGION_CODE)),
    TYPE         = COALESCE(NULLIF(INSTITUTIONS.TYPE, ''),         VALUES(TYPE)),
    CONTRACT_END = COALESCE(NULLIF(INSTITUTIONS.CONTRACT_END, ''), VALUES(CONTRACT_END)),
    LAST_BID     = COALESCE(NULLIF(INSTITUTIONS.LAST_BID, ''),     VALUES(LAST_BID)),
    TERM         = COALESCE(INSTITUTIONS.TERM, VALUES(TERM));
`);
  }
  return out.join('\n');
}

export function renderOracle(rows, meta) {
  const out = [header('oracle', meta)];
  for (let i = 0; i < rows.length; i += CHUNK_ORACLE) {
    const sel = rows.slice(i, i + CHUNK_ORACLE).map((r, j) => {
      const a = (n) => (j === 0 ? ` AS ${n}` : '');
      const term = r.term === null ? 'CAST(NULL AS NUMBER(5))' : String(r.term);
      return `    SELECT ${qOr(r.id, 64)}${a('INSTITUTION_ID')}, ${qOr(r.name, 100)}${a('NAME_KO')}, ${qOr(r.region, 20)}${a('REGION_CODE')}, ${qOr(r.type, 50)}${a('TYPE')}, ${qOr(r.contractEnd, 30)}${a('CONTRACT_END')}, ${qOr(r.lastBid, 30)}${a('LAST_BID')}, ${term}${a('TERM')} FROM DUAL`;
    });
    out.push(`MERGE INTO INSTITUTIONS t
USING (
${sel.join(' UNION ALL\n')}
) s
ON (t.INSTITUTION_ID = s.INSTITUTION_ID)
WHEN MATCHED THEN UPDATE SET
    t.REGION_CODE  = COALESCE(t.REGION_CODE,  s.REGION_CODE),
    t.TYPE         = COALESCE(t.TYPE,         s.TYPE),
    t.CONTRACT_END = COALESCE(t.CONTRACT_END, s.CONTRACT_END),
    t.LAST_BID     = COALESCE(t.LAST_BID,     s.LAST_BID),
    t.TERM         = COALESCE(t.TERM,         s.TERM)
WHEN NOT MATCHED THEN INSERT
    (INSTITUTION_ID, NAME_KO, REGION_CODE, TYPE, CONTRACT_END, LAST_BID, TERM, STAGE)
VALUES
    (s.INSTITUTION_ID, s.NAME_KO, s.REGION_CODE, s.TYPE, s.CONTRACT_END, s.LAST_BID, s.TERM, 1);
`);
  }
  out.push('COMMIT;\n');
  return out.join('\n');
}

// ---------- 입출력 ----------

export function parseArgs(argv) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, '../../..');
  const o = { check: false, strict: false, help: false, number: '029', name: 'seed_institutions_all',
    muni: path.join(root, 'frontend/data/institutions.js'),
    nonmuni: path.join(root, 'frontend/data/institutions_nonmuni.js'),
    oracle003: path.resolve(here, '../../src/main/resources/db/oracle/003_seed_institutions.sql'),
    outDir: path.resolve(here, '../../src/main/resources/db') };
  const val = (i, f) => { if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(`${f} 뒤에 값이 필요합니다`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--help': case '-h': o.help = true; break;
      case '--check': o.check = true; break;
      case '--strict': o.strict = true; break;
      case '--number': o.number = val(i++, a); break;
      case '--name': o.name = val(i++, a); break;
      case '--muni': o.muni = path.resolve(val(i++, a)); break;
      case '--nonmuni': o.nonmuni = path.resolve(val(i++, a)); break;
      case '--oracle003': o.oracle003 = path.resolve(val(i++, a)); break;
      case '--out-dir': o.outDir = path.resolve(val(i++, a)); break;
      default: throw new Error(`알 수 없는 옵션: ${a}`);
    }
  }
  if (!/^\d{3}$/.test(o.number)) throw new Error('--number 는 3자리 숫자여야 합니다');
  if (!/^[A-Za-z0-9_]+$/.test(o.name)) throw new Error('--name 형식이 올바르지 않습니다');
  return o;
}

export function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(`오류: ${e.message}\n\n${USAGE}`); return 2; }
  if (o.help) { console.log(USAGE); return 0; }
  try {
    const muniText = readFileSync(o.muni, 'utf8');
    const nonText = readFileSync(o.nonmuni, 'utf8');
    const seoul = parseSeoulIds(readFileSync(o.oracle003, 'utf8'));
    const muni = loadRecords(muniText, 'institutions', 'institutions.js');
    const non = loadRecords(nonText, 'institutionsNonMuni', 'institutions_nonmuni.js');
    const { rows, warnings } = buildRows(muni, non, seoul);
    const meta = { number: o.number, count: rows.length, muniSha: sha256n(muniText), nonSha: sha256n(nonText) };
    console.log(`지자체 레코드 ${muni.length} · 지자체 외 ${non.length} → 행 ${rows.length} (서울 25 포함)`);
    const byPrefix = {};
    rows.forEach((r) => { const p = r.id.includes('-') ? r.id.split('-')[0] : 'seoul'; byPrefix[p] = (byPrefix[p] || 0) + 1; });
    console.log('id 종류별:', JSON.stringify(byPrefix));
    warnings.forEach((w) => console.warn(`경고: ${w}`));
    if (warnings.length) console.warn(`경고 ${warnings.length}건`);
    if (o.strict && warnings.length) { console.error('--strict: 경고가 있어 쓰지 않습니다'); return 1; }
    if (o.check) return 0;
    const file = `${o.number}_${o.name}.sql`;
    for (const [d, text] of [['mysql', renderMysql(rows, meta)], ['oracle', renderOracle(rows, meta)]]) {
      mkdirSync(path.join(o.outDir, d), { recursive: true });
      writeFileSync(path.join(o.outDir, d, file), text, { encoding: 'utf8' });
      console.log(`썼음: ${path.join(o.outDir, d, file)}`);
    }
    return 0;
  } catch (e) { console.error(`오류: ${e.message}`); return 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
