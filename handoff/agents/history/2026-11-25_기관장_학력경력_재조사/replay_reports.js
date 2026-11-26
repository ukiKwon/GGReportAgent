// 11-25 에이전트 보고서(git 보관)의 학력·경력 줄을 이 PC 8080 API(item_add)로 다시 넣는다. 사용: node replay.js [--go]
// 기관 ID로 현 기관장을 찾는다(PC마다 head_id가 다름). 중복·정당·선거 조직·시험 합격·재학·끝 모름 경력은 건너뛴다.
const fs = require('fs'), path = require('path');
const GO = process.argv.includes('--go');
const BASE = 'http://localhost:8080', TODAY = '2026-11-26';
const REPO = 'C:/github/GGReportAgent', DIR = REPO + '/handoff/agents/data-auditor';
const KINDS = ['HOMEPAGE', 'NEC', 'ALIO', 'CLEANEYE', 'GAZETTE', 'PRESS', 'OTHER'];
const PERIOD = /^\d{4}(-(0[1-9]|1[0-2]))?$/;
const inOrder = (f, t) => { const c = f.slice(0, 4).localeCompare(t.slice(0, 4)); if (c) return c < 0; return f.length < 7 || t.length < 7 || f <= t; };
const PARTY = /(더불어민주당|국민의힘|민주당|조국혁신당|개혁신당|진보당|정의당|새누리당|한나라당|열린우리당|자유한국당|미래통합당|바른미래당|국민의당|새정치|당원|도당|시당|최고위원|공천|대변인\(.*당)/;
const BAD = /(선거|캠프|선대위|예비후보|시험 합격|고시 합격|합격$|재학|휴직)/;   // 11-25 메인이 뺀 종류(선거 조직·시험 합격·'재학'·현직 불확실)
const MISTAKE = [['lg-43-4925d7843c', /겸임교수|기업인협의회/]];   // 11-25 잘못 들어가 무효 처리한 줄(김명식)
const H = btn => ({ 'X-Emp-No': '5047192', 'X-Screen-Id': 'head_card', 'X-Button-Id': btn, 'Content-Type': 'application/json' });
const clean = t => String(t || '공개 자료').replace(/\([^)]*\d{4}[^)]*\)/g, '').replace(/\d{4}[-./]\d{1,2}[-./]\d{1,2}/g, '').replace(PARTY, '').replace(/\s+/g, ' ').trim().slice(0, 100) || '공개 자료';
const src = s => { s = s || {}; const o = { kind: KINDS.indexOf(s.kind) >= 0 ? s.kind : 'OTHER', title: clean(s.title), checked_on: TODAY }; if (s.url) { try { o.url = encodeURI(decodeURI(s.url)); } catch (e) { o.url = encodeURI(s.url); } } return o; };

const rows = [], seen = new Set();
for (const f of fs.readdirSync(DIR).sort()) {
  const m = f.match(/^2026-11-25_(\d{4})_/); if (!m || +m[1] < 1900) continue;
  const t = fs.readFileSync(path.join(DIR, f), 'utf8'); const b = [...t.matchAll(/```json\s*([\s\S]*?)```/g)]; if (!b.length) continue;
  let arr; try { arr = JSON.parse(b[b.length - 1][1]); } catch (e) { continue; } if (!Array.isArray(arr)) continue;
  for (const r of arr) { if (!r || (r.field !== 'EDU' && r.field !== 'CAREER') || !r.inst) continue; const k = r.inst + '|' + r.field + '|' + String(r.value || '').trim(); if (seen.has(k)) continue; seen.add(k); rows.push(r); }
}
(async () => {
  const log = { rows: rows.length, ok: 0, skip: {}, fail: [] }; const sk = k => { log.skip[k] = (log.skip[k] || 0) + 1; };
  const cache = {};
  for (const r of rows) {
    if (!(r.inst in cache)) { const j = await (await fetch(BASE + '/institutions/' + encodeURIComponent(r.inst) + '/head', { headers: H('open_card') })).json(); cache[r.inst] = j.head || null; }
    const h = cache[r.inst]; if (!h) { sk('nohead'); continue; }
    const v = String(r.value || '').trim();
    if (!v) { sk('novalue'); continue; }
    if (PARTY.test(v)) { sk('party'); continue; }
    if (BAD.test(v)) { sk('bad-kind'); continue; }
    if (MISTAKE.some(([i, re]) => i === r.inst && re.test(v))) { sk('mistake'); continue; }
    const from = r.from || '', to = r.to || '';
    if (from && !PERIOD.test(from)) { sk('badfrom'); continue; }
    if (to && !PERIOD.test(to)) { sk('badto'); continue; }
    if (from && to && !inOrder(from, to)) { sk('order'); continue; }
    let body;
    if (r.field === 'EDU') {
      if (!from && to) { sk('edu-end-only'); continue; }
      body = { head_id: h.head_id, field_cd: 'EDU', value: v.slice(0, 200), source: src(r.src) };
      if (from) body.from = from; if (to) body.to = to;
    } else {
      if (!from) { sk('career-nofrom'); continue; }
      if (r.current && !to) body = { head_id: h.head_id, field_cd: 'CAREER', value: v.slice(0, 200), from, current: true, source: src(r.src) };
      else if (to) body = { head_id: h.head_id, field_cd: 'CAREER', value: v.slice(0, 200), from, to, source: src(r.src) };
      else { sk('career-endunknown'); continue; }
    }
    const list = (r.field === 'EDU' ? h.education : h.career) || [];
    if (list.some(i => i.value === v)) { sk('dup'); continue; }
    list.push({ value: v }); if (r.field === 'EDU') h.education = list; else h.career = list;
    if (!GO) { log.ok++; continue; }
    const res = await fetch(BASE + '/institutions/' + encodeURIComponent(r.inst) + '/head/items', { method: 'POST', headers: H('item_add'), body: JSON.stringify(body) });
    if (res.status === 201) log.ok++; else { let d = ''; try { d = JSON.stringify((await res.json()).detail).slice(0, 110); } catch (e) { } log.fail.push(r.inst + ':' + r.field + ':' + res.status + ':' + d); }
  }
  console.log((GO ? '' : '[시험] ') + JSON.stringify({ rows: log.rows, ok: log.ok, skip: log.skip, fail: log.fail.length }));
  if (log.fail.length) console.log(log.fail.slice(0, 8).join('\n'));
})();
