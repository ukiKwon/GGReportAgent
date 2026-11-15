import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  parseMigrationName, normalizeVersion, sortMigrations, checksum,
  planMigrations, parseArgs, parseAppliedRows, insertSql,
  escapeOptionValue, buildOptionsFileContent, buildMysqlArgs, withOptionsFile,
} from './apply-mysql.mjs';

test('파일 이름 규칙', () => {
  assert.deepEqual(parseMigrationName('028_prep_rename.sql'), { version: '028', name: '028_prep_rename.sql' });
  for (const bad of ['28_x.sql', '028_x.txt', 'README.md', '028-x.sql', '028_한글.sql']) assert.equal(parseMigrationName(bad), null);
});

test('번호 정규화', () => {
  assert.equal(normalizeVersion('28'), '028');
  assert.equal(normalizeVersion('028'), '028');
  assert.equal(normalizeVersion('abc'), null);
  assert.equal(normalizeVersion('1234'), null);
});

test('번호순 정렬·무시·중복', () => {
  const r = sortMigrations(['010_b.sql', 'ops', '002_a.sql', 'notes.md', '001_c.sql']);
  assert.deepEqual(r.map((x) => x.version), ['001', '002', '010']);
  assert.throws(() => sortMigrations(['001_a.sql', '001_b.sql']), /번호가 같은/);
});

test('실제 db/mysql 폴더: 중복 없이 오름차순', () => {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/main/resources/db/mysql');
  const items = sortMigrations(readdirSync(dir));
  assert.ok(items.length >= 24);
  assert.equal(items[0].version, '001');
});

test('해시는 CRLF/LF 차이를 무시하고 내용 변경은 감지', () => {
  assert.equal(checksum(Buffer.from('a\r\nb\r\n')), checksum(Buffer.from('a\nb\n')));
  assert.notEqual(checksum(Buffer.from('a\nb\n')), checksum(Buffer.from('a\nc\n')));
  assert.match(checksum(Buffer.from('x')), /^[0-9a-f]{64}$/);
});

test('계획: 대기·적용됨·변경됨·고아', () => {
  const files = [{ version: '001', name: '001_a.sql', sha: 'h1' }, { version: '002', name: '002_b.sql', sha: 'h2' }, { version: '003', name: '003_c.sql', sha: 'h3' }];
  const applied = new Map([['001', { checksum: 'h1' }], ['002', { checksum: 'OLD' }], ['009', { checksum: 'z' }]]);
  const p = planMigrations(files, applied);
  assert.deepEqual(p.done.map((f) => f.version), ['001']);
  assert.deepEqual(p.mismatched.map((f) => f.version), ['002']);
  assert.deepEqual(p.pending.map((f) => f.version), ['003']);
  assert.deepEqual(p.orphans, ['009']);
});

test('옵션 파싱 기본값·검증', () => {
  const d = parseArgs([]);
  assert.equal(d.user, 'root'); assert.equal(d.db, 'ggreportdb'); assert.equal(d.host, 'localhost'); assert.equal(d.port, '3306');
  assert.equal(parseArgs(['--baseline', '28']).baseline, '028');
  assert.throws(() => parseArgs(['--baseline']), /값이 필요/);
  assert.throws(() => parseArgs(['--db', 'a;drop']), /--db/);
  assert.throws(() => parseArgs(['--nope']), /알 수 없는/);
  assert.throws(() => parseArgs(['--status', '--dry-run']), /함께/);
});

test('기록 행 파싱·INSERT 문 (값 검증, 비밀번호 무관)', () => {
  const m = parseAppliedRows('001\t001_a.sql\tabc\t2026-11-13 10:00:00\tme\n');
  assert.equal(m.get('001').checksum, 'abc');
  const sha = 'a'.repeat(64);
  const sql = insertSql([{ version: '001', name: '001_a.sql', sha }], "o'brien");
  assert.ok(sql.includes("'o_brien'"));
  assert.throws(() => insertSql([{ version: '001', name: "x'; DROP.sql", sha }], 'me'), /올바르지/);
  assert.throws(() => insertSql([{ version: '001', name: '001_a.sql', sha: 'zz' }], 'me'), /올바르지/);
});

test('옵션 파일 값 이스케이프: 백슬래시·따옴표·제어문자만, # ; 공백 작은따옴표는 그대로', () => {
  assert.equal(escapeOptionValue("a b#c;d'e"), "a b#c;d'e");
  assert.equal(escapeOptionValue('a\\b'), 'a\\\\b');
  assert.equal(escapeOptionValue('a"b'), 'a\\"b');
  assert.equal(escapeOptionValue('a\nb\rc\td'), 'a\\nb\\rc\\td');
  assert.equal(escapeOptionValue('\\"'), '\\\\\\"');
  assert.throws(() => escapeOptionValue('a\0b'), /쓸 수 없는/);
});

test('옵션 파일 내용: [client] 와 password 한 줄뿐', () => {
  const c = buildOptionsFileContent('p#s;w "d"\\');
  assert.equal(c, '[client]\npassword="p#s;w \\"d\\"\\\\"\n');
  assert.equal(c.split('\n').filter(Boolean).length, 2);
});

test('mysql 인자: --defaults-extra-file 이 맨 앞, 없으면 생략', () => {
  const cfg = { host: 'h', port: '3306', user: 'u' };
  const a = buildMysqlArgs(cfg, ['--batch', 'db'], '/tmp/x/client.cnf');
  assert.equal(a[0], '--defaults-extra-file=/tmp/x/client.cnf');
  assert.deepEqual(a.slice(1, 7), ['-h', 'h', '-P', '3306', '-u', 'u']);
  assert.equal(a[a.length - 1], 'db');
  assert.ok(!buildMysqlArgs(cfg, [], null).some((x) => x.startsWith('--defaults-extra-file')));
  assert.ok(!a.some((x) => x.includes('password')));
});

test('withOptionsFile: 내용 기록·권한, 정상 종료 뒤 삭제', async () => {
  let seen;
  await withOptionsFile('pw"1', (f) => {
    seen = f;
    assert.equal(readFileSync(f, 'utf8'), '[client]\npassword="pw\\"1"\n');
    if (process.platform !== 'win32') assert.equal(statSync(f).mode & 0o777, 0o600);
    assert.ok(path.basename(path.dirname(f)).startsWith('apply-mysql-'));
    return 0;
  });
  assert.ok(!existsSync(seen));
  assert.ok(!existsSync(path.dirname(seen)));
});

test('withOptionsFile: fn 이 예외를 던져도 삭제하고 예외는 그대로 전달', async () => {
  let seen;
  await assert.rejects(() => withOptionsFile('secret', (f) => { seen = f; throw new Error('boom'); }), /boom/);
  assert.ok(!existsSync(seen));
  assert.ok(!existsSync(path.dirname(seen)));
});

test('withOptionsFile: 실행 도중 프로세스가 끝나도(exit) 임시 폴더를 지운다', async () => {
  const { spawnSync } = await import('node:child_process');
  const mod = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'apply-mysql.mjs')).href;
  const script = `import { withOptionsFile } from ${JSON.stringify(mod)};
    await withOptionsFile('pw', (f) => { process.stdout.write(f); process.exit(0); });`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.endsWith('client.cnf'), r.stdout);
  assert.ok(!existsSync(r.stdout));
  assert.ok(!existsSync(path.dirname(r.stdout)));
});

test('withOptionsFile: 비밀번호 없으면 파일을 만들지 않음, 쓰기 실패해도 폴더 정리', async () => {
  assert.equal(await withOptionsFile('', (f) => f), null);
  const base = mkdtempSync(path.join(os.tmpdir(), 'apply-mysql-test-'));
  try {
    let created;
    await assert.rejects(() => withOptionsFile('x', () => 1, {
      tmpdir: base,
      mkdtemp: (p) => { created = mkdtempSync(p); return created; },
      write: () => { throw new Error('disk'); },
    }), /disk/);
    assert.ok(!existsSync(created));
  } finally { rmSync(base, { recursive: true, force: true }); }
});
