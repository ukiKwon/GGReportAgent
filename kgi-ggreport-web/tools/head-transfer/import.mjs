#!/usr/bin/env node
// 기관장 정보·사진 가져오기 — export.mjs 묶음(heads.json + photos/)을 다른 PC의 8080 API로 넣는다.
// DB 비밀번호가 필요 없다. 정상 API(등록·칸 입력·사진 올리기)로만 쓰므로 감사 기록이 남는다. 외부 패키지 없음(Node 22).
// 사용: node import.mjs --dir <묶음 폴더> [--base http://localhost:8080] [--emp 5047192] [--go] [--fix-current]
//   --fix-current: 묶음은 현직인데 받는 PC 경력 줄은 현직 표시가 없으면 그 줄을 무효 처리하고 current:true 로 다시 등록.
//   --go 가 없으면 시험 실행(무엇을 할지 건수만, 아무것도 쓰지 않음).
// 규칙: 이미 있는 값은 건너뛴다(다시 돌려도 안전). 그 기관에 이름이 다른 기관장이 이미 있으면 덮어쓰지 않고 '이름 다름'으로 알린다.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const args = {}; for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
if (!args.dir) { console.log('사용: node import.mjs --dir <묶음 폴더> [--base http://localhost:8080] [--emp 5047192] [--go]'); process.exit(1); }
const GO = !!args.go;
const FIX = !!args['fix-current'];   // 기본 꺼짐: 받는 쪽 경력이 현직 아님인데 묶음은 현직이면 그 줄을 무효 처리하고 다시 등록
const BASE = String(args.base || 'http://localhost:8080').replace(/\/$/, '');
const EMP = String(args.emp || '5047192');
const DIR = path.resolve(args.dir);
const H = (btn, json) => Object.assign({ 'X-Emp-No': EMP, 'X-Screen-Id': 'head_card', 'X-Button-Id': btn }, json ? { 'Content-Type': 'application/json' } : {});
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);   // 서울 날짜
const src = (s) => { const o = Object.assign({ kind: 'OTHER', title: '공개 자료' }, s || {}); if (!o.checked_on || o.checked_on > TODAY) o.checked_on = TODAY; if (!o.url) delete o.url; return o; };

const bundle = JSON.parse(readFileSync(path.join(DIR, 'heads.json'), 'utf8'));
const log = { heads_new: 0, heads_same: 0, name_diff: [], no_inst: [], items: 0, dates: 0, photos: 0, skip: 0, old_sql: 0, fixed: 0, fail: [] };
async function post(p, body, btn) {
  if (!GO) return { status: 0, json: {} };
  const r = await fetch(BASE + p, { method: 'POST', headers: H(btn, true), body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch (e) { /* 본문 없음 */ }
  return { status: r.status, json: j };
}
const bad = (r) => GO && r.status !== 201 && r.status !== 200;
const why = (r) => r.status + ':' + ((r.json && r.json.detail && (r.json.detail.code || r.json.detail)) || '');

for (const rec of bundle.heads) {
  const base = '/institutions/' + encodeURIComponent(rec.inst);
  const g = await fetch(BASE + base + '/head', { headers: H('open_card') });
  if (g.status === 404) { log.no_inst.push(rec.inst); continue; }
  if (!g.ok) { log.fail.push(rec.inst + ':조회 ' + g.status); continue; }
  let h = (await g.json()).head;
  if (h && h.name && h.name !== rec.name) { log.name_diff.push(rec.inst + ' (있음 ' + h.name + ' / 묶음 ' + rec.name + ')'); continue; }
  let headId = h && h.name ? h.head_id : null;
  if (!headId) {
    const r = await post(base + '/heads', { name: rec.name, position: rec.position, source: src(rec.name_src || rec.position_src) }, 'head_add');
    if (bad(r)) { log.fail.push(rec.inst + ':등록 ' + why(r)); continue; }
    headId = GO ? r.json.head_id : -1; log.heads_new++;
    h = { fields: {}, education: [], career: [], photo: null };
  } else log.heads_same++;
  const f = h.fields || {};
  for (const d of rec.dates || []) {
    if (f[d.field] && f[d.field].value) { log.skip++; continue; }
    const r = await post(base + '/head/items', { head_id: headId, field_cd: d.field, date: d.date, source: src(d.src) }, 'item_add');
    if (bad(r)) log.fail.push(rec.inst + ':' + d.field + ' ' + why(r)); else log.dates++;
  }
  if (rec.acting && rec.acting.flag && !(f.ACTING && f.ACTING.value)) {
    const r = await post(base + '/head/items', { head_id: headId, field_cd: 'ACTING', flag: 1, source: src(rec.acting.src) }, 'item_add');
    if (bad(r)) log.fail.push(rec.inst + ':ACTING ' + why(r));
  }
  const have = new Set([].concat(h.education || [], h.career || []).map((i) => i.value));
  for (const it of rec.items || []) {
    let fixing = false;
    if (FIX && have.has(it.value) && it.field === 'CAREER' && it.current === true && it.from) {
      // 현직 고침: 같은 문구의 경력 줄이 받는 쪽에서 현직이 아니면 무효 처리 뒤 current:true 로 다시 등록(반대 방향은 건드리지 않는다)
      const same = (h.career || []).filter((i) => i.value === it.value);
      if (same.length && !same.some((i) => i.current === true)) {
        fixing = true;
        if (GO) {
          let ok = true;
          for (const old of same) {
            const vr = await post(base + '/head/items/' + encodeURIComponent(old.item_id) + '/void', { reason: '현직 표시 고침(자료 이전)' }, 'item_void');
            if (bad(vr)) { log.fail.push(rec.inst + ':무효 ' + why(vr)); ok = false; break; }
          }
          if (!ok) continue;   // 무효 처리 실패 — 다시 등록하지 않는다(중복 방지)
        }
      }
    }
    if (!fixing && have.has(it.value)) { log.skip++; continue; }
    if (!it.from) { log.old_sql++; continue; }   // 시작 연도 없는 옛 줄 — API로 못 넣음, 묶음의 old-items.sql 로 넣는다
    const body = { head_id: headId, field_cd: it.field, value: it.value, from: it.from, source: src(it.src) };
    // 현직 표시(경력만): current:true 면 끝은 비운다. 예전 묶음(current 키 없음)은 지금처럼 끝 없음='미상'
    if (it.field === 'CAREER' && it.current === true) body.current = true;
    else if (it.to) body.to = it.to;
    const r = await post(base + '/head/items', body, 'item_add');
    if (bad(r)) log.fail.push(rec.inst + ':' + it.field + ' ' + why(r)); else { log.items++; if (fixing) log.fixed++; }
  }
  if (rec.photo && !h.photo) {
    // 묶음 파일 이름은 photos/ 안의 단순 이름만 받는다(../ 등으로 묶음 밖 파일을 읽지 않게 — security 11-24)
    const pf = String(rec.photo.file || '');
    const pp = path.resolve(DIR, 'photos', pf);
    if (!/^[A-Za-z0-9._-]{1,80}\.(jpg|png)$/.test(pf) || path.dirname(pp) !== path.resolve(DIR, 'photos')) { log.fail.push(rec.inst + ':사진 파일 이름 이상'); continue; }
    if (!GO) { log.photos++; continue; }
    const fd = new FormData();
    fd.append('file', new Blob([readFileSync(pp)], { type: pf.endsWith('.png') ? 'image/png' : 'image/jpeg' }), pf);
    fd.append('head_id', String(headId));
    fd.append('license_cd', rec.photo.license_cd || 'LOCAL_ONLY');
    const s = src(rec.photo.src);
    fd.append('src_kind', s.kind); fd.append('src_title', s.title); if (s.url) fd.append('src_url', s.url); fd.append('checked_on', s.checked_on);
    const r = await fetch(BASE + base + '/head/photos', { method: 'POST', headers: H('photo_upload'), body: fd });
    if (r.status !== 201) { let t = ''; try { t = (await r.text()).slice(0, 120); } catch (e) { /* 무시 */ } log.fail.push(rec.inst + ':사진 ' + r.status + ' ' + t); } else log.photos++;
  } else if (rec.photo) log.skip++;
}
console.log((GO ? '' : '[시험 실행 — 아무것도 쓰지 않음. 실제로 넣으려면 --go] ') + JSON.stringify({
  묶음_기관장: bundle.heads.length, 새로_등록: log.heads_new, 이미_있음: log.heads_same, 날짜칸: log.dates, 학력경력: log.items, 현직_고침: log.fixed, 사진: log.photos, 건너뜀: log.skip,
  옛줄_SQL로: log.old_sql, 이름_다름: log.name_diff.length, 기관_없음: log.no_inst.length, 실패: log.fail.length }, null, 1));
if (log.old_sql) console.log('날짜 없는 옛 학력·경력 ' + log.old_sql + '줄은 --go 뒤에 mysql 로 넣는다: mysql -u root -p --default-character-set=utf8mb4 ggreportdb < "' + path.join(DIR, 'old-items.sql') + '"');
if (log.name_diff.length) console.log('이름 다름(덮어쓰지 않음):', log.name_diff.slice(0, 20).join(', '));
if (log.no_inst.length) console.log('그 PC에 없는 기관:', log.no_inst.slice(0, 20).join(', '));
if (log.fail.length) console.log('실패:', log.fail.slice(0, 20).join(' | '));
