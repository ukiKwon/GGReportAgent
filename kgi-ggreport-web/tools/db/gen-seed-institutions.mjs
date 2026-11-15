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
const OP_CODE = { '운영': 'OPERATING', '개원 예정': 'PLANNED' };
const CODE20_RE = /^[A-Za-z0-9_-]{1,20}$/;
const NOTICE_NO_RE = /^[\p{L}\p{N}][\p{L}\p{N} _./()-]{0,49}$/u;

/** 출처 링크 검사 — 서버 InstitutionEditRules.url() 과 같은 글자 기준(보안 검토 B1). 통과하면 검증한 값(정규화 href), 아니면 null. */
export function checkUrl(s) {
  if (typeof s !== 'string' || s.length > 500) return null;
  if (!/^[\x21-\x7e]+$/.test(s)) return null;            // 공백·제어문자·비ASCII 거부
  if (/["<>\\{}|^`]/.test(s)) return null;               // 서버 java.net.URI 가 거부하는 글자
  try {
    const u = new URL(s);
    if (!((u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== '' && u.username === '' && u.password === '')) return null;
    return u.href.length <= 500 && /^[\x21-\x7e]+$/.test(u.href) ? u.href : null;
  } catch { return null; }
}
export const validUrl = (s) => checkUrl(s) !== null;
export function validOpenDate(s) {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(s);
  if (!m) return false;
  const y = +m[1]; if (y < 2000 || y > 2100) return false;
  if (m[2] !== undefined) {
    const mo = +m[2]; if (mo < 1 || mo > 12) return false;
    if (m[3] !== undefined) { const d = new Date(Date.UTC(y, mo - 1, +m[3])); if (d.getUTCMonth() !== mo - 1) return false; }
  }
  return true;
}

const USAGE = `사용법: node gen-seed-institutions.mjs [옵션]
  (옵션 없음)        db/mysql·db/oracle 에 029_seed_institutions_all.sql 을 씀
  --check            쓰지 않고 요약·경고만 출력
  --strict           경고가 하나라도 있으면 실패
  --number <NNN>     파일 번호(기본 029) — 이후 갱신은 새 번호로(적용한 파일은 고치지 않는다)
  --name <이름>      파일 이름 꼬리(기본 seed_institutions_all)
  --extra            새 칸 값 채우기(기본 번호 031, 이름 seed_institution_columns). 029 와 별개 출력
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
export function buildRows(muni, nonmuni, seoul, opts = {}) {
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
      orgCode: blank(rec.orgCode) ? null : String(rec.orgCode).trim(),
      g2bCode: blank(rec.g2bCode) ? null : String(rec.g2bCode).trim(),
      opStatus: blank(rec.opStatus) ? null : String(rec.opStatus).trim(),
      openDate: blank(rec.openDate) ? null : String(rec.openDate).trim(),
      confirmed: rec.confirmed === true ? true : null,
      noticeUrl: blank(rec.noticeUrl) ? null : String(rec.noticeUrl).trim(),
      noticeNo: blank(rec.noticeNo) ? null : String(rec.noticeNo).trim(),
    };
    const cur = byId.get(id);
    if (!cur) { byId.set(id, { id, ...val }); return; }
    for (const k of ['name', 'region', 'type', 'contractEnd', 'lastBid', 'term',
                     'orgCode', 'g2bCode', 'opStatus', 'openDate', 'confirmed', 'noticeUrl', 'noticeNo']) {
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
  if (opts.extra) rows.forEach((r) => normalizeExtra(r, warnings));   // 029 모드에서는 새 칸 경고·검사를 하지 않는다(출력 불변)
  return { rows, warnings };
}

/** 새 칸(030) 값 정리. 029 출력에는 쓰이지 않는다(r.opCode·ceConfirmed 등을 더할 뿐 기존 칸은 건드리지 않는다). */
export function normalizeExtra(r, warnings) {
  const w = (m) => warnings.push(`${r.id} ${m}`);
  for (const k of ['orgCode', 'g2bCode']) {
    if (r[k] !== null && !CODE20_RE.test(r[k])) { w(`${k} 형식 불량 '${r[k]}' → NULL`); r[k] = null; }
  }
  if (r.orgCode !== null && !/^\d{7}$/.test(r.orgCode)) w(`orgCode 가 7자리 숫자가 아님 '${r.orgCode}'`);
  if (r.opStatus === null) r.opCode = 'OPERATING';
  else if (OP_CODE[r.opStatus]) r.opCode = OP_CODE[r.opStatus];
  else throw new Error(`opStatus 알 수 없는 값: ${r.id} '${r.opStatus}'`);
  if (r.openDate !== null && !validOpenDate(r.openDate)) { w(`openDate 형식 불량 '${r.openDate}' → NULL`); r.openDate = null; }
  if (r.opCode === 'PLANNED' && r.openDate === null) w('개원 예정인데 openDate 가 없음');
  r.ceConfirmed = 0;
  r.ceUrl = null; r.ceNo = null;
  r.ceDowngraded = false;
  if (r.confirmed === true) {
    if (r.contractEnd === null) { w('confirmed 인데 contractEnd 가 없음 → 추정으로 둠'); r.ceDowngraded = true; }
    else {
      if (r.noticeUrl !== null) {
        const u = checkUrl(r.noticeUrl);
        if (u !== null) r.ceUrl = u; else w('noticeUrl 형식 불량 → NULL');
      }
      if (r.noticeNo !== null) { if (NOTICE_NO_RE.test(r.noticeNo)) r.ceNo = r.noticeNo; else w('noticeNo 형식 불량 → NULL'); }
      if (r.ceUrl === null && r.ceNo === null) {
        // 보안 검토 B2(팀 결정): 출처 없는 확정은 쓰지 않고 추정으로 내린다.
        w('확정인데 출처(noticeUrl·noticeNo)가 없음 → 추정(0)으로 강등');
        r.ceDowngraded = true;
      } else r.ceConfirmed = 1;
    }
  }
}
export const hasExtra = (r) => r.orgCode !== null || r.g2bCode !== null || r.opCode === 'PLANNED'
  || r.openDate !== null || r.ceConfirmed === 1;

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

// ---------- 031(새 칸 값 채우기) 출력 ----------

const COLS_X = 'INSTITUTION_ID, NAME_KO, REGION_CODE, TYPE, CONTRACT_END, LAST_BID, TERM, STAGE, ORG_CODE, G2B_CODE, OP_STATUS, OPEN_DATE, CONTRACT_END_CONFIRMED, CONTRACT_END_SRC_URL, CONTRACT_END_SRC_NO';
const headerX = (dialect, meta) => `-- ---------------------------------------------------------------------------
-- kgi-ggreport-web — ${dialect === 'oracle' ? 'Oracle 정본' : 'MySQL 8.0 미러'} (${meta.number}) : 기관 새 칸 값 채우기(ORG_CODE·G2B_CODE·OP_STATUS·OPEN_DATE·확정 여부·출처)
-- ⚠️ tools/db/gen-seed-institutions.mjs --extra 가 만든다 — 손으로 고치지 않는다. ${dialect === 'oracle' ? 'db/mysql 쪽이 미러다.' : '정본은 db/oracle 쪽이다.'}
-- 원본 해시: institutions.js ${meta.muniSha.slice(0, 12)} · institutions_nonmuni.js ${meta.nonSha.slice(0, 12)} · 행 ${meta.count}개(새 칸 값이 있는 기관만)
-- 규칙: ORG_CODE·G2B_CODE·OPEN_DATE 는 빈 칸만. OP_STATUS 는 OP_SRC_* 가 모두 NULL 일 때만(사람이 바꾼 행은 출처가 있다).
--       확정 여부·출처는 DB 의 CONTRACT_END 가 시드 값과 같고 아직 추정(0)일 때만. 지자체(lg-) ORG_CODE 는 NULL(NEXT 76 판정 뒤).
--       출처(공고 링크·번호)가 없는 번들 확정은 추정(0)으로 내려 담았다(보안 검토 B2).
-- ⚠️ 030 직후 한 번만 돌린다(다시 돌리면 사람이 내린 '추정'을 되살릴 수 있다).
-- ---------------------------------------------------------------------------
`;
const GUARD_MY = 'INSTITUTIONS.CONTRACT_END = VALUES(CONTRACT_END) AND INSTITUTIONS.CONTRACT_END_CONFIRMED = 0';
// ⚠️ MySQL 은 SET 을 왼쪽부터 평가하고 앞서 바꾼 값을 뒤에서 본다 — CONTRACT_END_CONFIRMED 를 맨 끝에 둔다.
export function renderMysqlExtra(rows, meta) {
  const out = [headerX('mysql', meta)];
  for (let i = 0; i < rows.length; i += CHUNK_MYSQL) {
    const vals = rows.slice(i, i + CHUNK_MYSQL).map((r) =>
      `    (${qMy(r.id)}, ${qMy(r.name)}, ${qMy(r.region)}, ${qMy(r.type)}, ${qMy(r.contractEnd)}, ${qMy(r.lastBid)}, ${r.term === null ? 'NULL' : r.term}, 1, ${qMy(r.orgCode)}, ${qMy(r.g2bCode)}, ${qMy(r.opCode)}, ${qMy(r.openDate)}, ${r.ceConfirmed}, ${qMy(r.ceUrl)}, ${qMy(r.ceNo)})`);
    out.push(`INSERT INTO INSTITUTIONS
    (${COLS_X})
VALUES
${vals.join(',\n')}
ON DUPLICATE KEY UPDATE
    ORG_CODE  = COALESCE(NULLIF(INSTITUTIONS.ORG_CODE, ''),  VALUES(ORG_CODE)),
    G2B_CODE  = COALESCE(NULLIF(INSTITUTIONS.G2B_CODE, ''),  VALUES(G2B_CODE)),
    OPEN_DATE = COALESCE(NULLIF(INSTITUTIONS.OPEN_DATE, ''), VALUES(OPEN_DATE)),
    OP_STATUS = CASE WHEN INSTITUTIONS.OP_SRC_URL IS NULL AND INSTITUTIONS.OP_SRC_NO IS NULL THEN VALUES(OP_STATUS) ELSE INSTITUTIONS.OP_STATUS END,
    CONTRACT_END_SRC_URL = CASE WHEN ${GUARD_MY} THEN COALESCE(NULLIF(INSTITUTIONS.CONTRACT_END_SRC_URL, ''), VALUES(CONTRACT_END_SRC_URL)) ELSE INSTITUTIONS.CONTRACT_END_SRC_URL END,
    CONTRACT_END_SRC_NO  = CASE WHEN ${GUARD_MY} THEN COALESCE(NULLIF(INSTITUTIONS.CONTRACT_END_SRC_NO, ''),  VALUES(CONTRACT_END_SRC_NO))  ELSE INSTITUTIONS.CONTRACT_END_SRC_NO  END,
    CONTRACT_END_CONFIRMED = CASE WHEN ${GUARD_MY} THEN VALUES(CONTRACT_END_CONFIRMED) ELSE INSTITUTIONS.CONTRACT_END_CONFIRMED END;
`);
  }
  return out.join('\n');
}
export function renderOracleExtra(rows, meta) {
  const out = [headerX('oracle', meta)];
  const G = 't.CONTRACT_END = s.CONTRACT_END AND t.CONTRACT_END_CONFIRMED = 0';
  for (let i = 0; i < rows.length; i += CHUNK_ORACLE) {
    const sel = rows.slice(i, i + CHUNK_ORACLE).map((r, j) => {
      const a = (n) => (j === 0 ? ` AS ${n}` : '');
      const term = r.term === null ? 'CAST(NULL AS NUMBER(5))' : String(r.term);
      return `    SELECT ${qOr(r.id, 64)}${a('INSTITUTION_ID')}, ${qOr(r.name, 100)}${a('NAME_KO')}, ${qOr(r.region, 20)}${a('REGION_CODE')}, ${qOr(r.type, 50)}${a('TYPE')}, ${qOr(r.contractEnd, 30)}${a('CONTRACT_END')}, ${qOr(r.lastBid, 30)}${a('LAST_BID')}, ${term}${a('TERM')}, ${qOr(r.orgCode, 20)}${a('ORG_CODE')}, ${qOr(r.g2bCode, 20)}${a('G2B_CODE')}, ${qOr(r.opCode, 20)}${a('OP_STATUS')}, ${qOr(r.openDate, 10)}${a('OPEN_DATE')}, ${r.ceConfirmed}${a('CONTRACT_END_CONFIRMED')}, ${qOr(r.ceUrl, 500)}${a('CONTRACT_END_SRC_URL')}, ${qOr(r.ceNo, 50)}${a('CONTRACT_END_SRC_NO')} FROM DUAL`;
    });
    out.push(`MERGE INTO INSTITUTIONS t
USING (
${sel.join(' UNION ALL\n')}
) s
ON (t.INSTITUTION_ID = s.INSTITUTION_ID)
WHEN MATCHED THEN UPDATE SET
    t.ORG_CODE  = COALESCE(t.ORG_CODE,  s.ORG_CODE),
    t.G2B_CODE  = COALESCE(t.G2B_CODE,  s.G2B_CODE),
    t.OPEN_DATE = COALESCE(t.OPEN_DATE, s.OPEN_DATE),
    t.OP_STATUS = CASE WHEN t.OP_SRC_URL IS NULL AND t.OP_SRC_NO IS NULL THEN s.OP_STATUS ELSE t.OP_STATUS END,
    t.CONTRACT_END_SRC_URL = CASE WHEN ${G} THEN COALESCE(t.CONTRACT_END_SRC_URL, s.CONTRACT_END_SRC_URL) ELSE t.CONTRACT_END_SRC_URL END,
    t.CONTRACT_END_SRC_NO  = CASE WHEN ${G} THEN COALESCE(t.CONTRACT_END_SRC_NO,  s.CONTRACT_END_SRC_NO)  ELSE t.CONTRACT_END_SRC_NO  END,
    t.CONTRACT_END_CONFIRMED = CASE WHEN ${G} THEN s.CONTRACT_END_CONFIRMED ELSE t.CONTRACT_END_CONFIRMED END
WHEN NOT MATCHED THEN INSERT
    (${COLS_X})
VALUES
    (s.INSTITUTION_ID, s.NAME_KO, s.REGION_CODE, s.TYPE, s.CONTRACT_END, s.LAST_BID, s.TERM, 1, s.ORG_CODE, s.G2B_CODE, s.OP_STATUS, s.OPEN_DATE, s.CONTRACT_END_CONFIRMED, s.CONTRACT_END_SRC_URL, s.CONTRACT_END_SRC_NO);
`);
  }
  out.push('COMMIT;\n');
  return out.join('\n');
}

// ---------- 입출력 ----------

export function parseArgs(argv) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, '../../..');
  const o = { check: false, strict: false, help: false, extra: false, numberSet: false, nameSet: false,
    number: '029', name: 'seed_institutions_all',
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
      case '--extra': o.extra = true; break;
      case '--number': o.number = val(i++, a); o.numberSet = true; break;
      case '--name': o.name = val(i++, a); o.nameSet = true; break;
      case '--muni': o.muni = path.resolve(val(i++, a)); break;
      case '--nonmuni': o.nonmuni = path.resolve(val(i++, a)); break;
      case '--oracle003': o.oracle003 = path.resolve(val(i++, a)); break;
      case '--out-dir': o.outDir = path.resolve(val(i++, a)); break;
      default: throw new Error(`알 수 없는 옵션: ${a}`);
    }
  }
  if (o.extra && !o.numberSet) o.number = '031';
  if (o.extra && !o.nameSet) o.name = 'seed_institution_columns';
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
    const { rows, warnings } = buildRows(muni, non, seoul, { extra: o.extra });
    const meta = { number: o.number, count: rows.length, muniSha: sha256n(muniText), nonSha: sha256n(nonText) };
    console.log(`지자체 레코드 ${muni.length} · 지자체 외 ${non.length} → 행 ${rows.length} (서울 25 포함)`);
    const byPrefix = {};
    rows.forEach((r) => { const p = r.id.includes('-') ? r.id.split('-')[0] : 'seoul'; byPrefix[p] = (byPrefix[p] || 0) + 1; });
    console.log('id 종류별:', JSON.stringify(byPrefix));
    warnings.forEach((w) => console.warn(`경고: ${w}`));
    if (warnings.length) console.warn(`경고 ${warnings.length}건`);
    if (o.extra) {
      const down = rows.filter((r) => r.ceDowngraded).length;
      const withExtra = rows.filter(hasExtra).length;
      console.log(`새 칸 값이 있는 행 ${withExtra}개 · 확정 ${rows.filter((r) => r.ceConfirmed === 1).length}건 · 개원 예정 ${rows.filter((r) => r.opCode === 'PLANNED').length}건`);
      if (down) console.warn(`경고: 번들 confirmed:true 중 출처(noticeUrl·noticeNo) 없음/불량 또는 날짜 없음 ${down}건 → 추정(0)으로 강등됨 (data-auditor 가 출처를 채운 뒤 다시 생성)`);
    }
    if (o.strict && warnings.length) { console.error('--strict: 경고가 있어 쓰지 않습니다'); return 1; }
    if (o.check) return 0;
    const file = `${o.number}_${o.name}.sql`;
    const xr = rows.filter(hasExtra);
    const xmeta = { ...meta, count: xr.length };
    const pairs = o.extra
      ? [['mysql', renderMysqlExtra(xr, xmeta)], ['oracle', renderOracleExtra(xr, xmeta)]]
      : [['mysql', renderMysql(rows, meta)], ['oracle', renderOracle(rows, meta)]];
    for (const [d, text] of pairs) {
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
