#!/usr/bin/env node
// 로컬 MySQL 전용 마이그레이션 적용기. 외부 패키지 없음(Node 22).
// 회사 Oracle은 DBA가 db/oracle 스크립트를 직접 적용한다 — 이 스크립트와 무관.
// 사용법: node apply-mysql.mjs --help   (README §5-3)
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
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

  --host <호스트>      기본 localhost
  --port <포트>        기본 3306
  --user <계정>        기본 root
  --db <DB 이름>       기본 ggreportdb
  --mysql <경로>       mysql 실행 파일(PATH에 없을 때). 예: --mysql "C:\\mysql\\bin\\mysql.exe"
  --dir <폴더>         SQL 폴더(기본: 이 저장소의 src/main/resources/db/mysql)
  --help

비밀번호는 한 번만 묻고(입력 숨김) MYSQL_PWD 환경변수로 mysql 에 넘깁니다.
환경변수 MYSQL_PWD 가 이미 설정돼 있으면 묻지 않고 그 값을 씁니다.`;

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
    dir: null, status: false, dryRun: false, baseline: null, help: false };
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
      default: throw new Error(`알 수 없는 옵션: ${a}`);
    }
  }
  if (!/^[A-Za-z0-9._-]+$/.test(o.host)) throw new Error('--host 형식이 올바르지 않습니다');
  if (!/^\d{1,5}$/.test(o.port)) throw new Error('--port 는 숫자여야 합니다');
  if (!/^[A-Za-z0-9._-]+$/.test(o.user)) throw new Error('--user 형식이 올바르지 않습니다');
  if (!/^[A-Za-z0-9_]+$/.test(o.db)) throw new Error('--db 형식이 올바르지 않습니다');
  if (o.status && (o.baseline || o.dryRun)) throw new Error('--status 는 다른 동작 옵션과 함께 쓸 수 없습니다');
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

function runMysql(cfg, extra, input) {
  return new Promise((resolve) => {
    const args = ['-h', cfg.host, '-P', cfg.port, '-u', cfg.user, '--default-character-set=utf8mb4', ...extra];
    const env = { ...process.env };
    if (cfg.password) env.MYSQL_PWD = cfg.password; else delete env.MYSQL_PWD;
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
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
