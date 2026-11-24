#!/usr/bin/env node
// 로컬 MySQL 전용 마이그레이션 적용기. 외부 패키지 없음(Node 22).
// 회사 Oracle은 DBA가 db/oracle 스크립트를 직접 적용한다 — 이 스크립트와 무관.
// 사용법: node apply-mysql.mjs --help   (README §5-3)
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const FILE_RE = /^(\d{3})_([A-Za-z0-9_]+)\.sql$/;
const TABLE = 'SCHEMA_MIGRATION';
const MARKER_TABLE = 'INSTITUTIONS'; // 001이 만드는 표 — 이미 있으면 '손으로 적용한 DB'로 본다

const USAGE = `사용법: node apply-mysql.mjs [옵션]

  (옵션 없음)          아직 적용 안 된 db/mysql/NNN_*.sql 을 번호순으로 적용
  --status             파일별 적용 여부 표만 보여 줌(변경 없음)
  --dry-run            적용할 파일 목록만 보여 줌(변경 없음)
  --baseline <번호>    그 번호까지 '실행 없이' 적용됨으로 기록 (이미 손으로 적용한 DB용, 예: --baseline 028)
  --mark-applied <번호,번호>  mysql 로 직접 적용한 파일만 골라 '실행 없이' 기록. 실제 스키마·데이터를 검사해
                       맞을 때만 기록한다(예: --mark-applied 033,036,038). --dry-run 과 함께 쓰면 검사만 한다.
                       이미 적용 기록이 있는 DB 에서만 쓴다(없으면 --baseline 먼저).

  --host <호스트>      기본 localhost
  --port <포트>        기본 3306
  --user <계정>        기본 root
  --db <DB 이름>       기본 ggreportdb
  --mysql <경로>       mysql 실행 파일(PATH에 없을 때). 예: --mysql "C:\\mysql\\bin\\mysql.exe"
  --dir <폴더>         SQL 폴더(기본: 이 저장소의 src/main/resources/db/mysql)
  --help

비밀번호는 한 번만 묻고(입력 숨김), 실행 중에만 존재하는 임시 옵션 파일(--defaults-extra-file)로
mysql 에 넘깁니다. 파일은 mysql 호출이 끝나면(성공·실패·예외 모두) 지웁니다.
환경변수 MYSQL_PWD 가 이미 설정돼 있으면 묻지 않고 그 값을 씁니다(입력 방식만 그렇고, mysql 에는 환경변수로 넘기지 않음).`;

// ---------- 순수 함수 (단위 시험 대상) ----------

export function parseMigrationName(name) {
  const m = FILE_RE.exec(name);
  return m ? { version: m[1], name } : null;
}

export function normalizeVersion(s) {
  const t = String(s);
  return /^\d{1,3}$/.test(t) ? t.padStart(3, '0') : null;
}

/** 파일 이름 목록 → 번호순 [{version,name}]. 규칙에 안 맞는 이름은 무시, 번호 중복은 오류. */
export function sortMigrations(names) {
  const items = names.map(parseMigrationName).filter(Boolean);
  items.sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));
  for (let i = 1; i < items.length; i++) {
    if (items[i].version === items[i - 1].version) {
      throw new Error(`번호가 같은 파일이 둘 이상입니다: ${items[i - 1].name}, ${items[i].name}`);
    }
  }
  return items;
}

/** CRLF/LF 차이로 해시가 달라지지 않게 정규화한 sha256(hex). */
export function checksum(buf) {
  const text = Buffer.from(buf).toString('utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * files: [{version,name,sha}], applied: Map(version -> {file_name, checksum})
 * → { pending, done, mismatched, orphans }
 */
// ---- SCHEMA_PROBES 조립 도우미: 모두 '조건식' 문자열을 돌려주고, probe()가 한 문장 SELECT IF 로 묶는다 ----
const qlist = (names) => names.map((n) => `'${n}'`).join(',');
/** 표 N개가 모두 있다 */
const hasTables = (names) => `(SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND UPPER(TABLE_NAME) IN (${qlist(names)}))=${names.length}`;
/** 한 표에 칸 N개가 모두 있다 */
const hasColumns = (table, cols) => `(SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND UPPER(TABLE_NAME)='${table}' AND UPPER(COLUMN_NAME) IN (${qlist(cols)}))=${cols.length}`;
/** 코드표(COMMON_CODE)에 그 그룹의 코드가 모두 있다(ENABLED 값은 보지 않음 — 관리자가 끌 수 있다) */
const hasCodes = (group, codes) => `(SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP='${group}' AND CODE IN (${qlist(codes)}))=${codes.length}`;
const probe = (...conds) => `SELECT IF(${conds.join(' AND ')},1,0);`;

/** --mark-applied 가 '정말 적용돼 있나'를 확인하는 번호별 검사(결과 1이면 통과). 검사가 없는 번호는 기록하지 않는다 — 새 파일을 손으로 적용할 일이 있으면 여기에 한 줄 추가. */
export const SCHEMA_PROBES = {
  '033': "SELECT IF(COUNT(*)>=1,1,0) FROM ROLE_MENUS WHERE ROLE='전산팀장' AND MENU='admin';",   // 데이터 증거(관리자가 끈 뒤에도 행은 남는다)
  '036': "SELECT IF(COUNT(*)=5,1,0) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND UPPER(TABLE_NAME)='PERM_CHANGE_LOG' AND UPPER(COLUMN_NAME) IN ('SCREEN_ID','BUTTON_ID','UI_VALID','EMP_VERIFIED','TARGET_ROLE');",
  '037': "SELECT IF(COUNT(*)=2,1,0) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND UPPER(TABLE_NAME) IN ('NOTICE_ROUND','NOTICE_ROUND_LOG');",
  '038': "SELECT IF(COUNT(*)>=1,1,0) FROM INSTITUTIONS WHERE INSTITUTION_ID='org-9740520' AND REGION_CODE='47';",   // 데이터 정정 — 대표 1행
  '039': "SELECT IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND UPPER(TABLE_NAME)='INST_BANK_CONTRACT' AND UPPER(COLUMN_NAME)='ACCOUNT_ETC')=1 AND (SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP='BANK_ACCOUNT')=5,1,0);",   // 마지막 추가 칸 + 코드표 5줄(반만 적용된 경우도 잡음)
  '041': "SELECT IF(COUNT(*)=1,1,0) FROM COMMON_CODE WHERE CODE_GROUP='BANK_RANK' AND CODE='SINGLE';",   // 코드표 1줄(데이터 증거)
  '045': "SELECT IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND UPPER(TABLE_NAME) IN ('PLAN_COLLECT_REQ','PLAN_COLLECT_REQUESTER'))=2 AND (SELECT COUNT(*) FROM COMMON_CODE WHERE CODE_GROUP='PLAN_ACTION' AND CODE IN ('COLLECT_REQUEST','COLLECT_CANCEL','COLLECT_EXPORT','COLLECT_RUN','COLLECT_EXCLUDE','COLLECT_FAIL','COLLECT_APPLY'))=7,1,0);",   // 두 표 + 감사 코드 7줄
  '042': "SELECT IF(COUNT(*)=3,1,0) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND UPPER(TABLE_NAME) IN ('EXT_CHECK','EXT_CHECK_FILE','EXT_CHECK_EXCL');",   // 표 3개(반만 적용된 경우도 잡음)
  // ---- 047 이후 (046·050·053 은 파일 없음). 표는 파일의 CREATE TABLE 전부 — 반만 적용된 경우도 잡는다 ----
  '047': probe(hasTables(['BOARD_MINUTES', 'BOARD_MINUTES_UTTER', 'BOARD_MINUTES_SEG', 'BOARD_MINUTES_ITEM', 'BOARD_MINUTES_SCOPE', 'BOARD_MINUTES_REV', 'BOARD_MINUTES_LOG', 'BOARD_MINUTES_ACT'])),
  '048': probe(hasTables(['PREP_NOBID_ACK'])),
  '049': probe(hasTables(['BID_PREP_FORM', 'BID_PREP_FORM_VER']), hasColumns('BID_PREP_LOG', ['FORM_VER']), hasColumns('BID_PREP_ACT', ['FORM_VER']), hasCodes('PREP_EVENT', ['FORM_CONFIRM', 'FORM_UNCONFIRM'])),
  '051': probe(hasTables(['DESIGN_ROUND', 'DESIGN_ROUND_RECIP', 'DESIGN_COMMENT', 'DESIGN_ACK'])),
  // 052 는 UPDATE 만 한다 — 009 시드(최디자이너)가 박디자이너로 바뀐 행이 있으면 적용 증거. 이름을 나중에 또 바꾼 DB 는 검사가 실패해 중단되므로, 사람이 확인해 번호를 빼면 된다.
  '052': probe("(SELECT COUNT(*) FROM USERS WHERE EMP_NO='7130526' AND NAME='박디자이너')=1"),
  '054': probe(hasTables(['BID_PREP_CHECK']), hasCodes('DASH_MARK', ['DONE', 'IN_PROGRESS', 'NA', 'NONE'])),
  '055': probe(hasCodes('HEAD_FIELD', ['BIRTH_DATE'])),
  '056': probe(hasColumns('INST_BID_TARGET', ['APPROVAL_REQ_ID', 'CARRY_FROM_NO', 'CARRY_BASIS_CD']), hasTables(['INST_BID_TARGET_REQ_ITEM', 'INST_BID_TARGET_REQ_ACT', 'INST_BID_TERM']), hasCodes('TARGET_CANCEL_REASON', ['CARRY_REVOKED'])),
  '057': probe(hasTables(['DOC_CHECK', 'DOC_CHECK_HIT', 'DOC_CHECK_LOG'])),
  '058': probe(hasTables(['BOARD_MINUTES_SPEAKER'])),
  '059': probe(hasCodes('TARGET_TAG', ['REGAIN'])),   // REGAIN 행(INSERT). NEW 의 SORT_NO 는 관리자가 바꿀 수 있어 판정에서 뺌
  '060': probe(hasTables(['INST_NEWS_IMPORT', 'INST_NEWS_ITEM']), hasCodes('PLAN_ACTION', ['NEWS_IMPORT'])),
};

/** versions → { targets(파일), skipped(이미 기록), errors }. 파일 없음·검사 없음은 errors. */
export function planMark(versions, files, applied) {
  const byVer = new Map(files.map((f) => [f.version, f]));
  const targets = [], skipped = [], errors = [];
  for (const v of versions) {
    const f = byVer.get(v);
    if (!f) errors.push(`${v}: 해당 번호의 파일이 없습니다`);
    else if (applied.has(v)) skipped.push(v);
    else if (!SCHEMA_PROBES[v]) errors.push(`${v}: 적용 여부를 확인할 검사가 없어 기록하지 않습니다(SCHEMA_PROBES 에 추가 필요)`);
    else targets.push(f);
  }
  return { targets, skipped, errors };
}

/** 오래된(기본 1시간) apply-mysql-XXXXXX 임시 폴더를 지운다 — 강제 종료로 finally·exit 훅이 못 돈 경우의 마지막 방어. 지운 폴더 이름 목록을 돌려준다. */
export function sweepStaleTempDirs(io = {}) {
  const { tmpdir = os.tmpdir(), now = Date.now(), maxAgeMs = 3600000 } = io;
  const removed = [];
  let names;
  try { names = readdirSync(tmpdir); } catch { return removed; }
  for (const n of names) {
    if (!/^apply-mysql-[A-Za-z0-9]{6}$/.test(n)) continue;
    const p = path.join(tmpdir, n);
    try {
      const st = lstatSync(p);   // 링크는 따라가지 않는다
      if (!st.isDirectory() || now - st.mtimeMs < maxAgeMs) continue;
      rmSync(p, { recursive: true, force: true });
      removed.push(n);
    } catch { /* 건드릴 수 없으면 그대로 둔다 */ }
  }
  return removed;
}

export function planMigrations(files, applied) {
  const pending = [], done = [], mismatched = [];
  for (const f of files) {
    const rec = applied.get(f.version);
    if (!rec) pending.push(f);
    else if (rec.checksum !== f.sha) mismatched.push({ ...f, recorded: rec.checksum });
    else done.push(f);
  }
  const have = new Set(files.map((f) => f.version));
  const orphans = [...applied.keys()].filter((v) => !have.has(v)).sort();
  return { pending, done, mismatched, orphans };
}

export function parseArgs(argv) {
  const o = { host: 'localhost', port: '3306', user: 'root', db: 'ggreportdb', mysql: 'mysql',
    dir: null, status: false, dryRun: false, baseline: null, markApplied: null, help: false };
  const val = (i, flag) => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(`${flag} 뒤에 값이 필요합니다`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--help': case '-h': o.help = true; break;
      case '--status': o.status = true; break;
      case '--dry-run': o.dryRun = true; break;
      case '--host': o.host = val(i++, a); break;
      case '--port': o.port = val(i++, a); break;
      case '--user': o.user = val(i++, a); break;
      case '--db': o.db = val(i++, a); break;
      case '--mysql': o.mysql = val(i++, a); break;
      case '--dir': o.dir = val(i++, a); break;
      case '--baseline': {
        const v = normalizeVersion(val(i++, a));
        if (!v) throw new Error('--baseline 값은 1~3자리 숫자여야 합니다 (예: 028)');
        o.baseline = v; break;
      }
      case '--mark-applied': {
        const vs = val(i++, a).split(',').map((x) => normalizeVersion(x.trim()));
        if (vs.some((v) => !v)) throw new Error('--mark-applied 값은 쉼표로 구분한 1~3자리 숫자여야 합니다 (예: 033,036,038)');
        o.markApplied = [...new Set(vs)].sort(); break;
      }
      default: throw new Error(`알 수 없는 옵션: ${a}`);
    }
  }
  if (!/^[A-Za-z0-9._-]+$/.test(o.host)) throw new Error('--host 형식이 올바르지 않습니다');
  if (!/^\d{1,5}$/.test(o.port)) throw new Error('--port 는 숫자여야 합니다');
  if (!/^[A-Za-z0-9._-]+$/.test(o.user)) throw new Error('--user 형식이 올바르지 않습니다');
  if (!/^[A-Za-z0-9_]+$/.test(o.db)) throw new Error('--db 형식이 올바르지 않습니다');
  if (o.status && (o.baseline || o.dryRun || o.markApplied)) throw new Error('--status 는 다른 동작 옵션과 함께 쓸 수 없습니다');
  if (o.baseline && o.markApplied) throw new Error('--baseline 과 --mark-applied 는 함께 쓸 수 없습니다');
  if (o.baseline && o.dryRun) throw new Error('--baseline 과 --dry-run 은 함께 쓸 수 없습니다');
  return o;
}

/** 'tab 구분 행' 출력 → Map(version -> {...}) */
export function parseAppliedRows(stdout) {
  const m = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [version, file_name, sum, applied_at, applied_by] = line.split('\t');
    m.set(version, { file_name, checksum: sum, applied_at, applied_by });
  }
  return m;
}

export function insertSql(rows, by) {
  const safeBy = String(by).replace(/[^A-Za-z0-9._ ()-]/g, '_').slice(0, 80);
  const values = rows.map((r) => {
    if (!FILE_RE.test(r.name) || !/^[0-9a-f]{64}$/.test(r.sha)) throw new Error('기록할 값이 올바르지 않습니다');
    return `('${r.version}','${r.name}','${r.sha}','${safeBy}')`;
  });
  return `INSERT INTO ${TABLE} (VERSION, FILE_NAME, CHECKSUM, APPLIED_BY) VALUES ${values.join(',')};`;
}

/**
 * MySQL 옵션 파일 값 이스케이프 — 큰따옴표로 감싼 값 안에서 \ " 와 제어문자만 이스케이프한다.
 * (옵션 파일 문법: 따옴표 안에서는 # ; 공백 ' 가 그대로 문자다. 지원 이스케이프: \b \t \n \r \\ \s \")
 */
export function escapeOptionValue(value) {
  const s = String(value);
  if (s.includes('\0')) throw new Error('비밀번호에 쓸 수 없는 문자가 있습니다');
  return s.replace(/[\\"\b\t\n\r]/g, (c) => ({ '\\': '\\\\', '"': '\\"', '\b': '\\b', '\t': '\\t', '\n': '\\n', '\r': '\\r' }[c]));
}

/** 옵션 파일 내용. 비밀번호만 담는다(host/user/port 는 이미 검증된 명령행 인자로 넘김). */
export function buildOptionsFileContent(password) {
  return `[client]\npassword="${escapeOptionValue(password)}"\n`;
}

/** mysql 인자. --defaults-extra-file 은 반드시 맨 앞(MySQL 규칙: 다른 옵션보다 먼저). optionsFile 이 없으면 생략. */
export function buildMysqlArgs(cfg, extra, optionsFile) {
  const args = [];
  if (optionsFile) args.push(`--defaults-extra-file=${optionsFile}`);
  args.push('-h', cfg.host, '-P', cfg.port, '-u', cfg.user, '--default-character-set=utf8mb4', ...extra);
  return args;
}

/**
 * 비밀번호용 임시 옵션 파일을 만들어 fn(경로)을 실행하고, 성공·실패·예외 어느 경우든 finally 에서 지운다.
 * 비밀번호가 비어 있으면 파일을 만들지 않고 fn(null).
 * io 는 시험용 주입(기본: 실제 fs, OS 임시 폴더). 폴더 이름은 mkdtemp 가 무작위로 붙인다.
 * 권한: 폴더는 mkdtemp 기본(Linux/macOS 0o700), 파일 0o600(flag 'wx' = 이미 있으면 실패).
 * Windows 는 mode 가 대부분 무시되고 사용자별 %TEMP% 의 상속 ACL 에 기댄다 —
 * 그래서 수명을 최소화(호출 직후 삭제)하는 것이 주된 방어다.
 */
export async function withOptionsFile(password, fn, io = {}) {
  const { tmpdir = os.tmpdir(), mkdtemp = mkdtempSync, write = writeFileSync, rm = rmSync } = io;
  if (!password) return fn(null);
  let dir = null;
  try {
    dir = mkdtemp(path.join(tmpdir, 'apply-mysql-'));
    LIVE_DIRS.add(dir);
    hookExitCleanup();
    const file = path.join(dir, 'client.cnf');
    write(file, buildOptionsFileContent(password), { flag: 'wx', mode: 0o600 });
    return await fn(file);
  } finally {
    if (dir) {
      LIVE_DIRS.delete(dir);
      try { rm(dir, { recursive: true, force: true }); } catch { warnLeftover(dir); }
    }
  }
}

// 강제 종료(Ctrl+C·kill)로 finally 가 돌지 않아도 비밀번호 파일이 남지 않게 — 종료 직전 동기 삭제(security 11-15 중).
const LIVE_DIRS = new Set();
let exitHooked = false;
function warnLeftover(dir) {
  process.stderr.write(`경고: 비밀번호 임시 폴더를 지우지 못했습니다. 직접 지우세요: ${dir}\n`);   // 경로만, 값 없음
}
function cleanupLiveDirs() {
  for (const d of LIVE_DIRS) {
    try { rmSync(d, { recursive: true, force: true }); } catch { warnLeftover(d); }
  }
  LIVE_DIRS.clear();
}
function hookExitCleanup() {
  if (exitHooked) return;
  exitHooked = true;
  process.once('exit', cleanupLiveDirs);
}
/** CLI 로 실행될 때만 신호 처리기를 단다(시험·import 에서는 달지 않음). 신호 → exit 이벤트 → 동기 삭제. */
export function installSignalCleanup() {
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {   // SIGBREAK: Windows Ctrl+Break·콘솔 닫기
    process.once(sig, () => { cleanupLiveDirs(); process.exit(130); });
  }
}

// ---------- 입출력 ----------

function askPassword(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const finish = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write('\n');
    };
    const onData = (chunk) => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n' || c === '\u0004') { finish(); resolve(buf); return; }
        if (c === '\u0003') { finish(); reject(new Error('취소했습니다')); return; }
        if (c === '\u007f' || c === '\b') { buf = buf.slice(0, -1); continue; }
        buf += c;
      }
    };
    stdin.on('data', onData);
  });
}

function spawnMysql(cfg, extra, input, optionsFile) {
  return new Promise((resolve) => {
    const args = buildMysqlArgs(cfg, extra, optionsFile);
    // 비밀번호는 옵션 파일로만 넘긴다 — 부모 환경의 MYSQL_PWD 는 자식에게 물려주지 않는다.
    const env = { ...process.env };
    delete env.MYSQL_PWD;
    const redact = (s) => (cfg.password && cfg.password.length >= 3 ? s.split(cfg.password).join('***') : s);
    const child = spawn(cfg.mysql, args, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => resolve({ code: -1, stdout: '',
      stderr: e.code === 'ENOENT' ? 'mysql 실행 파일을 찾지 못했습니다. --mysql <경로> 로 지정하세요.' : `mysql 실행 실패(${e.code || '오류'})` }));
    child.on('close', (code) => resolve({ code, stdout: redact(out), stderr: redact(err) }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function runMysql(cfg, extra, input) {
  try {
    return await withOptionsFile(cfg.password, (file) => spawnMysql(cfg, extra, input, file));
  } catch (e) {
    // fs 오류 메시지에는 경로만 있고 비밀번호는 없지만, 내부 정보를 줄이려고 고정 문구로 바꾼다.
    const msg = e && e.message === '비밀번호에 쓸 수 없는 문자가 있습니다' ? e.message : `비밀번호 임시 파일 처리 실패(${(e && e.code) || '오류'})`;
    return { code: -1, stdout: '', stderr: msg };
  }
}

const query = (cfg, sql) => runMysql(cfg, ['--batch', '--skip-column-names', cfg.db], sql);

async function tableExists(cfg, name) {
  const r = await query(cfg, `SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND UPPER(TABLE_NAME) = '${name}';`);
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'DB 조회 실패');
  return r.stdout.trim() === '1';
}

async function loadApplied(cfg) {
  if (!(await tableExists(cfg, TABLE))) return new Map();
  const r = await query(cfg, `SELECT VERSION, FILE_NAME, CHECKSUM, DATE_FORMAT(APPLIED_AT,'%Y-%m-%d %H:%i:%s'), APPLIED_BY FROM ${TABLE} ORDER BY VERSION;`);
  if (r.code !== 0) throw new Error(r.stderr.trim() || '적용 기록 조회 실패');
  return parseAppliedRows(r.stdout);
}

async function ensureTable(cfg) {
  const r = await query(cfg, `CREATE TABLE IF NOT EXISTS ${TABLE} (
  VERSION    VARCHAR(10)  NOT NULL,
  FILE_NAME  VARCHAR(100) NOT NULL,
  CHECKSUM   CHAR(64)     NOT NULL,
  APPLIED_AT DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  APPLIED_BY VARCHAR(80)  NOT NULL,
  PRIMARY KEY (VERSION)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  if (r.code !== 0) throw new Error(r.stderr.trim() || '기록표 생성 실패');
}

function loadFiles(dir) {
  const items = sortMigrations(readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name));
  return items.map((it) => {
    const buf = readFileSync(path.join(dir, it.name));
    return { ...it, buf, sha: checksum(buf) };
  });
}

const who = () => { try { return os.userInfo().username; } catch { return 'unknown'; } };

// ---------- 실행 ----------

export async function main(argv) {
  let opt;
  try { opt = parseArgs(argv); } catch (e) { console.error(`오류: ${e.message}\n\n${USAGE}`); return 2; }
  if (opt.help) { console.log(USAGE); return 0; }
  const swept = sweepStaleTempDirs();
  if (swept.length) console.error(`알림: 이전 실행이 남긴 임시 폴더 ${swept.length}개를 지웠습니다.`);

  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = opt.dir ? path.resolve(opt.dir) : path.resolve(here, '../../src/main/resources/db/mysql');
  let files;
  try { files = loadFiles(dir); } catch (e) { console.error(`오류: SQL 폴더를 읽지 못했습니다 (${dir}): ${e.message}`); return 2; }
  if (files.length === 0) { console.error(`오류: ${dir} 에 NNN_*.sql 파일이 없습니다`); return 2; }

  let password = process.env.MYSQL_PWD || '';
  if (!password) {
    if (!process.stdin.isTTY) { console.error('오류: 비밀번호를 입력할 터미널이 없습니다. MYSQL_PWD 환경변수를 설정하거나 터미널에서 실행하세요.'); return 2; }
    try { password = await askPassword(`MySQL ${opt.user}@${opt.host} 비밀번호: `); } catch (e) { console.error(e.message); return 2; }
  }
  const cfg = { ...opt, password };

  try {
    const ping = await query(cfg, 'SELECT 1;');
    if (ping.code !== 0) { console.error(`오류: DB에 연결하지 못했습니다.\n${ping.stderr.trim()}`); return 1; }

    const applied = await loadApplied(cfg);
    const plan = planMigrations(files, applied);

    if (opt.status) { printStatus(files, applied, plan); return plan.mismatched.length ? 2 : 0; }

    if (plan.mismatched.length) {
      console.error('중단: 이미 적용 기록이 있는 파일의 내용이 바뀌었습니다. 아무것도 적용하지 않았습니다.');
      for (const f of plan.mismatched) console.error(`  - ${f.name} (기록 ${f.recorded.slice(0, 12)}… / 현재 ${f.sha.slice(0, 12)}…)`);
      console.error('적용한 SQL은 고치지 말고 새 번호 파일로 추가하세요. 의도한 수정이면 기록표를 사람이 확인해 정리해야 합니다.');
      return 2;
    }
    for (const v of plan.orphans) console.error(`경고: 기록은 있으나 파일이 없는 번호 ${v} (${applied.get(v).file_name})`);

    if (opt.baseline) return await doBaseline(cfg, files, applied, opt);
    if (opt.markApplied) return await doMarkApplied(cfg, files, applied, opt);

    if (plan.pending.length && applied.size === 0 && (await tableExists(cfg, MARKER_TABLE))) {
      console.error(`중단: 이 DB에는 이미 표(${MARKER_TABLE})가 있는데 적용 기록이 없습니다. 손으로 적용한 DB로 보입니다.`);
      console.error('처음부터 다시 돌리면 비멱등 파일(002 등)이 터집니다. 어디까지 적용했는지 확인한 뒤 예: --baseline 028 을 먼저 실행하세요.');
      return 2;
    }
    if (plan.pending.length === 0) { console.log('적용할 파일이 없습니다. (이미 최신)'); return 0; }

    if (opt.dryRun) {
      console.log('[dry-run] 적용 예정:'); for (const f of plan.pending) console.log(`  ${f.name}`);
      return 0;
    }

    await ensureTable(cfg);
    for (const f of plan.pending) {
      process.stdout.write(`적용 중 ${f.name} ... `);
      const r = await runMysql(cfg, [cfg.db], f.buf);
      if (r.code !== 0) {
        console.log('실패');
        console.error(`\n중단: ${f.name}\n${r.stderr.trim()}`);
        console.error('기록하지 않았습니다. MySQL DDL은 롤백되지 않아 이 파일이 중간까지 적용됐을 수 있습니다 — 상태를 확인하고 고친 뒤 다시 실행하세요.');
        return 1;
      }
      const rec = await query(cfg, insertSql([f], who()));
      if (rec.code !== 0) {
        console.log('적용됨, 기록 실패');
        console.error(`${f.name} 은 적용됐지만 기록표에 쓰지 못했습니다: ${rec.stderr.trim()}\n--baseline ${f.version} 으로 기록을 맞추세요(앞 번호가 모두 적용된 경우).`);
        return 1;
      }
      console.log('완료');
    }
    console.log(`끝: ${plan.pending.length}개 적용.`);
    return 0;
  } catch (e) {
    console.error(`오류: ${e.message}`);
    return 1;
  }
}

async function doMarkApplied(cfg, files, applied, opt) {
  if (applied.size === 0) {
    console.error('중단: 적용 기록이 비어 있습니다. 먼저 --baseline <번호> 로 앞 번호를 기록하세요(안 그러면 다음 실행이 001 부터 다시 돕니다).');
    return 2;
  }
  const { targets, skipped, errors } = planMark(opt.markApplied, files, applied);
  for (const v of skipped) console.log(`이미 기록됨: ${v}`);
  if (errors.length) {
    for (const e of errors) console.error(`중단: ${e}`);
    console.error('아무것도 기록하지 않았습니다.');
    return 2;
  }
  const missing = [];
  for (const f of targets) {
    const r = await query(cfg, SCHEMA_PROBES[f.version]);
    if (r.code !== 0) throw new Error(`${f.name} 검사 쿼리 실패: ${r.stderr.trim() || '오류'}`);
    if (r.stdout.trim() !== '1') missing.push(f.name);
  }
  if (missing.length) {
    console.error(`중단: 다음 파일은 DB 에 적용된 흔적이 없습니다 — ${missing.join(', ')}\n먼저 mysql 로 적용하거나 번호를 빼세요. 아무것도 기록하지 않았습니다.`);
    return 2;
  }
  if (targets.length === 0) { console.log('기록할 파일이 없습니다.'); return 0; }
  if (opt.dryRun) {
    console.log('[dry-run] 검사 통과, 기록 예정:');
    for (const f of targets) console.log(`  ${f.name}`);
    return 0;
  }
  const r = await query(cfg, insertSql(targets, `${who()} (mark-applied)`));   // 현재 파일의 sha256 만 기록한다
  if (r.code !== 0) { console.error(`기록 실패: ${r.stderr.trim()}`); return 1; }
  console.log(`실행 없이 기록했습니다: ${targets.map((f) => f.name).join(', ')}`);
  return 0;
}

async function doBaseline(cfg, files, applied, opt) {
  if (!(await tableExists(cfg, MARKER_TABLE))) {
    console.error(`중단: 이 DB에는 ${MARKER_TABLE} 표가 없습니다. 빈 DB에는 --baseline 이 아니라 그냥 실행하세요.`);
    return 2;
  }
  const targets = files.filter((f) => f.version <= opt.baseline && !applied.has(f.version));
  if (targets.length === 0) { console.log('기록할 파일이 없습니다.'); return 0; }
  console.log(`실행 없이 '적용됨'으로 기록: ${targets[0].name} ~ ${targets[targets.length - 1].name} (${targets.length}개)`);
  await ensureTable(cfg);
  const r = await query(cfg, insertSql(targets, `${who()} (baseline)`));
  if (r.code !== 0) { console.error(`기록 실패: ${r.stderr.trim()}`); return 1; }
  console.log('기록했습니다. 이후 새 파일만 적용됩니다.');
  return 0;
}

function printStatus(files, applied, plan) {
  const bad = new Set(plan.mismatched.map((f) => f.version));
  console.log('번호  파일                                   상태      적용 시각            적용자');
  for (const f of files) {
    const rec = applied.get(f.version);
    const state = !rec ? '대기' : bad.has(f.version) ? '변경됨!' : '적용됨';
    console.log(`${f.version}   ${f.name.padEnd(36)} ${state.padEnd(8)} ${(rec?.applied_at || '').padEnd(19)}  ${rec?.applied_by || ''}`);
  }
  for (const v of plan.orphans) console.log(`${v}   (파일 없음) ${applied.get(v).file_name}`);
  console.log(`\n적용됨 ${plan.done.length} / 대기 ${plan.pending.length} / 변경됨 ${plan.mismatched.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  installSignalCleanup();
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
