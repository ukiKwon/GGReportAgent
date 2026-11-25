// 기관장 학력·경력·생년월일 입력(사용자 11-24 "시연 전에 최대한 넣자"). 8080 정상 API(item_add)로만 — 감사 기록이 남는다.
// 입력자: 로컬 시험용 영업팀장 5047192. 사용: node fill_apply.js <rows.json> [--go]
// rows: [{inst, head_id, field:EDU|CAREER|BIRTH_DATE, value, from, to, current, date, src:{kind,title,url}}]
const fs = require('fs');
const [, , file, go] = process.argv;
const GO = go === '--go';
const BASE = 'http://localhost:8080';
const TODAY = '2026-11-24';
const KINDS = ['HOMEPAGE', 'NEC', 'ALIO', 'CLEANEYE', 'GAZETTE', 'PRESS', 'OTHER'];
const MONTH = /^\d{4}(-(0[1-9]|1[0-2]))?$/;   // 사용자 11-24: 연도(YYYY) 또는 연-월
const inOrder = (f, t) => { const c = f.slice(0, 4).localeCompare(t.slice(0, 4)); if (c) return c < 0; return f.length < 7 || t.length < 7 || f <= t; };
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const PARTY = /(더불어민주당|국민의힘|민주당|조국혁신당|개혁신당|진보당|정의당|새누리당|한나라당|열린우리당|자유한국당|미래통합당|바른미래당|국민의당|새정치|당원|도당|시당|최고위원|공천|대변인\(.*당)/;
const H = btn => ({ 'X-Emp-No': '5047192', 'X-Screen-Id': 'head_card', 'X-Button-Id': btn, 'Content-Type': 'application/json' });
const cleanTitle = t => String(t || '공개 자료').replace(/\([^)]*\d{4}[^)]*\)/g, '').replace(/\d{4}[-./]\d{1,2}[-./]\d{1,2}/g, '').replace(PARTY, '').replace(/\s+/g, ' ').trim().slice(0, 100) || '공개 자료';
function src(s) {
  s = s || {};
  const out = { kind: KINDS.indexOf(s.kind) >= 0 ? s.kind : 'OTHER', title: cleanTitle(s.title), checked_on: TODAY };
  if (s.url) { try { out.url = encodeURI(decodeURI(s.url)); } catch (e) { out.url = encodeURI(s.url); } }
  return out;
}
(async () => {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cache = {};
  const log = { ok: 0, skip: {}, fail: [] };
  const skip = k => { log.skip[k] = (log.skip[k] || 0) + 1; };
  for (const r of rows) {
    if (!cache[r.inst]) {
      const j = await (await fetch(BASE + '/institutions/' + encodeURIComponent(r.inst) + '/head', { headers: H('open_card') })).json();
      cache[r.inst] = j.head || null;
    }
    const h = cache[r.inst];
    if (!h) { skip('nohead'); continue; }
    if (r.head_id && Number(r.head_id) !== Number(h.head_id)) { skip('headchanged'); continue; }
    const p = '/institutions/' + encodeURIComponent(r.inst) + '/head/items';
    let body;
    if (r.field === 'BIRTH_DATE') {
      if (h.birth_date) { skip('birth_exists'); continue; }
      if (!DAY.test(r.date || '')) { skip('birth_bad'); continue; }
      body = { head_id: h.head_id, field_cd: 'BIRTH_DATE', date: r.date, source: src(r.src) };
      h.birth_date = r.date;
    } else if (r.field === 'EDU' || r.field === 'CAREER') {
      const v = String(r.value || '').trim();
      if (!v) { skip('novalue'); continue; }
      if (PARTY.test(v)) { skip('party'); continue; }
      if (!MONTH.test(r.from || '')) { skip('nofrom'); continue; }
      if (r.to && (!MONTH.test(r.to) || !inOrder(r.from, r.to))) { skip('badto'); continue; }
      if (!r.to && !r.current && r.field === 'CAREER') { skip('endunknown'); continue; }
      const list = (r.field === 'EDU' ? h.education : h.career) || [];
      if (list.some(i => i.value === v)) { skip('dup'); continue; }
      body = { head_id: h.head_id, field_cd: r.field, value: v.slice(0, 200), from: r.from, source: src(r.src) };
      if (r.to) body.to = r.to;
      list.push({ value: v });
      if (r.field === 'EDU') h.education = list; else h.career = list;
    } else { skip('field'); continue; }
    if (!GO) { log.ok++; continue; }
    const res = await fetch(BASE + p, { method: 'POST', headers: H('item_add'), body: JSON.stringify(body) });
    if (res.status === 201) log.ok++;
    else { let d = ''; try { d = JSON.stringify((await res.json()).detail).slice(0, 120); } catch (e) { } log.fail.push(r.inst + ':' + r.field + ':' + res.status + ':' + d); }
  }
  console.log((GO ? '' : '[시험] ') + JSON.stringify(log));
})().catch(e => console.log('ERR', e.message));
