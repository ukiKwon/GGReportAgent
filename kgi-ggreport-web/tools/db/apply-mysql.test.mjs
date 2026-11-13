import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseMigrationName, normalizeVersion, sortMigrations, checksum,
  planMigrations, parseArgs, parseAppliedRows, insertSql,
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
