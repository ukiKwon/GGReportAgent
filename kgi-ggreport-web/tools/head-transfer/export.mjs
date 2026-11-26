#!/usr/bin/env node
// 기관장 정보·사진 내보내기 — 이 PC의 8080 API에서 꺼내 묶음 폴더(heads.json + photos/)로 저장한다.
// DB 비밀번호가 필요 없다(정상 API로만 읽음 — 열람 기록이 남는다). 외부 패키지 없음(Node 22).
// 사용: node export.mjs --out <폴더> [--base http://localhost:8080] [--emp 5047192]
// 사진은 git 에 올리지 않는다(사용자 11-13·11-24: 언론·나무위키 사진은 이 PC 전용 조건) — 묶음은 USB·사내 공유로만 옮긴다.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
if (!args.out) { console.log('사용: node export.mjs --out <폴더> [--base http://localhost:8080] [--emp 5047192]'); process.exit(1); }
const BASE = (args.base || 'http://localhost:8080').replace(/\/$/, '');
const EMP = args.emp || '5047192';
const H = (btn) => ({ 'X-Emp-No': EMP, 'X-Screen-Id': 'head_card', 'X-Button-Id': btn });
const OUT = path.resolve(args.out);
// 묶음에는 사진·생년월일이 들어간다 — 저장소 폴더 안에 만들면 실수로 커밋될 수 있어 막는다(security 11-24)
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');   // fileURLToPath: 공백·한글 경로의 % 인코딩을 풀어 준다
if ((OUT + path.sep).toLowerCase().startsWith((REPO + path.sep).toLowerCase())) {
  console.log('저장소 폴더 안에는 묶음을 만들지 않습니다(사진·생년월일이 커밋될 수 있음). 바탕화면 등 저장소 밖 폴더를 --out 으로 주세요: ' + REPO);
  process.exit(1);
}
mkdirSync(path.join(OUT, 'photos'), { recursive: true });
const safeName = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 70);   // 기관 ID를 파일 이름으로 쓸 때

const DATE_FIELDS = ['FIRST_TAKE_OFFICE', 'TERM_START', 'TERM_END', 'BIRTH_DATE'];
const srcOf = (s) => (s ? { kind: s.kind, title: s.title, url: s.url || undefined, checked_on: s.checked_on } : null);

const list = await (await fetch(BASE + '/institution-heads', { headers: H('open_queue') })).json();
const out = [];
let photos = 0, fail = 0;
for (const row of list) {
  const inst = row.institution_id;
  const r = await fetch(BASE + '/institutions/' + encodeURIComponent(inst) + '/head', { headers: H('open_card') });
  if (!r.ok) { fail++; console.log('건너뜀', inst, r.status); continue; }
  const h = (await r.json()).head;
  if (!h || !h.name) continue;
  const f = h.fields || {};
  const rec = {
    inst, name: h.name, position: h.position,
    name_src: srcOf(f.NAME && f.NAME.source), position_src: srcOf(f.POSITION && f.POSITION.source),
    acting: f.ACTING ? { flag: (h.acting ? 1 : 0), src: srcOf(f.ACTING.source) } : null,
    dates: DATE_FIELDS.filter((k) => f[k] && f[k].value).map((k) => ({ field: k, date: f[k].value, src: srcOf(f[k].source) })),
    items: [].concat(
      (h.education || []).map((i) => ({ field: 'EDU', value: i.value, from: i.from, to: i.to, src: srcOf(i.source) })),
      // 경력만 현직 표시(current)를 싣는다 — 학력에는 없다. 옛 줄 SQL(시작 연도 없음)은 current 대상이 아니다(VAL_FLAG 비움)
      (h.career || []).map((i) => ({ field: 'CAREER', value: i.value, from: i.from, to: i.to, current: !!i.current, src: srcOf(i.source) }))),
    photo: null,
  };
  if (h.photo && h.photo.photo_id) {
    const p = await fetch(BASE + '/institutions/' + encodeURIComponent(inst) + '/head/photos/' + h.photo.photo_id + '/content', { headers: H('photo_view') });
    if (p.ok) {
      const type = (p.headers.get('content-type') || 'image/jpeg').split(';')[0];
      const file = safeName(inst) + (type === 'image/png' ? '.png' : '.jpg');
      writeFileSync(path.join(OUT, 'photos', file), Buffer.from(await p.arrayBuffer()));
      rec.photo = { file, type, license_cd: h.photo.license_cd, src: srcOf(h.photo.source) };
      photos++;
    } else { fail++; console.log('사진 못 받음', inst, p.status); }
  }
  out.push(rec);
}
writeFileSync(path.join(OUT, 'heads.json'), JSON.stringify({ exported_at: new Date().toISOString(), base: BASE, heads: out }, null, 1));

// 시작 연도가 없는 옛 학력·경력 줄(11-13~11-20 입력분)은 지금 API 규칙(시작 필수)으로 다시 넣을 수 없다 →
// 받는 PC에서 import.mjs --go 다음에 mysql 로 한 번 실행하는 SQL 로 만든다(사용자 11-24 "옛줄도 똑같이 옮기고").
// 그 기관의 현 기관장(STATUS_CD=CURRENT)에 확정(CONFIRMED) 줄로 넣고, 같은 값이 이미 있으면 넣지 않는다(여러 번 실행해도 안전).
const q = (v) => (v == null || v === '' ? 'NULL' : "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'");
const NOW = new Date(Date.now() + 9 * 3600e3).toISOString().replace('Z', '+09:00').replace(/\.\d+/, '');
const sql = ['-- 기관장 옛 학력·경력 줄(시작 연도 없음) — export.mjs 가 만든 파일. 먼저 import.mjs --go 로 기관장을 넣은 뒤 실행한다.',
  '-- 실행: mysql -u root -p --default-character-set=utf8mb4 ggreportdb < old-items.sql',
  '-- API를 거치지 않아 입력 감사 기록은 남지 않는다(자료 이전용). 같은 값이 있으면 넣지 않으므로 다시 실행해도 안전하다.',
  'SET NAMES utf8mb4;'];
let old = 0;
for (const rec of out) {
  for (const it of rec.items) {
    if (it.from) continue;
    const s = it.src || {};
    sql.push('INSERT INTO INST_HEAD_ITEM (HEAD_ID, INSTITUTION_ID, FIELD_CD, STATE_CD, ORIGIN_CD, VAL_TEXT, VAL_FROM, VAL_TO, SRC_KIND_CD, SRC_TITLE, SRC_URL, CHECKED_ON, CREATED_BY, CREATED_AT, CREATED_VERIFIED, DECIDED_BY, DECIDED_AT)'
      + ' SELECT h.HEAD_ID, h.INSTITUTION_ID, ' + q(it.field) + ", 'CONFIRMED', 'MANUAL', " + q(it.value) + ', NULL, ' + q(it.to) + ', '
      + q(s.kind || 'OTHER') + ', ' + q((s.title || '공개 자료').slice(0, 100)) + ', ' + q(s.url) + ', ' + q(s.checked_on || NOW.slice(0, 10)) + ', '
      + q(EMP) + ', ' + q(NOW) + ', 0, ' + q(EMP) + ', ' + q(NOW)
      + ' FROM INST_HEAD h WHERE h.INSTITUTION_ID = ' + q(rec.inst) + " AND h.STATUS_CD = 'CURRENT'"
      + ' AND NOT EXISTS (SELECT 1 FROM INST_HEAD_ITEM i WHERE i.HEAD_ID = h.HEAD_ID AND i.FIELD_CD = ' + q(it.field) + " AND i.STATE_CD = 'CONFIRMED' AND i.VAL_TEXT = " + q(it.value) + ');');
    old++;
  }
}
writeFileSync(path.join(OUT, 'old-items.sql'), sql.join('\n') + '\n');
console.log(`기관장 ${out.length}명, 사진 ${photos}장, 날짜 없는 옛 줄 ${old}줄(old-items.sql), 실패 ${fail}건 → ${OUT}`);
