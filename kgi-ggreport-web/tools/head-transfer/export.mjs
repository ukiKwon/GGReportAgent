#!/usr/bin/env node
// 기관장 정보·사진 내보내기 — 이 PC의 8080 API에서 꺼내 묶음 폴더(heads.json + photos/)로 저장한다.
// DB 비밀번호가 필요 없다(정상 API로만 읽음 — 열람 기록이 남는다). 외부 패키지 없음(Node 22).
// 사용: node export.mjs --out <폴더> [--base http://localhost:8080] [--emp 5047192]
// 사진은 git 에 올리지 않는다(사용자 11-13·11-24: 언론·나무위키 사진은 이 PC 전용 조건) — 묶음은 USB·사내 공유로만 옮긴다.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
if (!args.out) { console.log('사용: node export.mjs --out <폴더> [--base http://localhost:8080] [--emp 5047192]'); process.exit(1); }
const BASE = (args.base || 'http://localhost:8080').replace(/\/$/, '');
const EMP = args.emp || '5047192';
const H = (btn) => ({ 'X-Emp-No': EMP, 'X-Screen-Id': 'head_card', 'X-Button-Id': btn });
const OUT = path.resolve(args.out);
mkdirSync(path.join(OUT, 'photos'), { recursive: true });

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
      (h.career || []).map((i) => ({ field: 'CAREER', value: i.value, from: i.from, to: i.to, src: srcOf(i.source) }))),
    photo: null,
  };
  if (h.photo && h.photo.photo_id) {
    const p = await fetch(BASE + '/institutions/' + encodeURIComponent(inst) + '/head/photos/' + h.photo.photo_id + '/content', { headers: H('photo_view') });
    if (p.ok) {
      const type = (p.headers.get('content-type') || 'image/jpeg').split(';')[0];
      const file = inst + (type === 'image/png' ? '.png' : '.jpg');
      writeFileSync(path.join(OUT, 'photos', file), Buffer.from(await p.arrayBuffer()));
      rec.photo = { file, type, license_cd: h.photo.license_cd, src: srcOf(h.photo.source) };
      photos++;
    } else { fail++; console.log('사진 못 받음', inst, p.status); }
  }
  out.push(rec);
}
writeFileSync(path.join(OUT, 'heads.json'), JSON.stringify({ exported_at: new Date().toISOString(), base: BASE, heads: out }, null, 1));
console.log(`기관장 ${out.length}명, 사진 ${photos}장, 실패 ${fail}건 → ${OUT}`);
