// 옛 경력('끝 없음'·현직 표시 없음) 판정(data-auditor 4묶음)을 반영: 새 줄 등록(current 또는 끝 날짜) → 옛 줄 무효. 사용: node reclass.js [--go]
const fs = require('fs'), path = require('path');
const GO = process.argv.includes('--go');
const BASE = 'http://localhost:8080', TODAY = '2026-11-26';
const DIR = 'C:/github/GGReportAgent/handoff/agents/data-auditor';
const IDS = ['a787b0a8', 'a062266a', 'a298bd77', 'a2ad69cb'];
const ENDED_OK = new Set([1373, 1371, 1288, 1980, 2233]);   // 끝난 시점이 기사로 확인된 줄(이충우·최원철·최재형·정근식·김민철)
const KINDS = ['HOMEPAGE', 'NEC', 'ALIO', 'CLEANEYE', 'GAZETTE', 'PRESS', 'OTHER'];
const H = (b, j) => Object.assign({ 'X-Emp-No': '5047192', 'X-Screen-Id': 'head_card', 'X-Button-Id': b }, j ? { 'Content-Type': 'application/json' } : {});
const dec = [];
for (const f of fs.readdirSync(DIR).sort()) {
  if (!f.startsWith('2026-11-26') || !IDS.some(i => f.includes(i))) continue;
  const t = fs.readFileSync(path.join(DIR, f), 'utf8'); const b = [...t.matchAll(/```json\s*([\s\S]*?)```/g)]; if (!b.length) continue;
  try { const a = JSON.parse(b[b.length - 1][1]); if (Array.isArray(a)) dec.push(...a); } catch (e) { }
}
const uniq = new Map(); dec.forEach(d => uniq.set(d.item_id, d));
(async () => {
  const log = { decisions: uniq.size, current: 0, ended: 0, skip: {}, fail: [] }; const sk = k => { log.skip[k] = (log.skip[k] || 0) + 1; };
  const heads = {};
  for (const d of uniq.values()) {
    if (!(d.inst in heads)) heads[d.inst] = (await (await fetch(BASE + '/institutions/' + encodeURIComponent(d.inst) + '/head', { headers: H('open_card') })).json()).head;
    const h = heads[d.inst]; const old = h && (h.career || []).find(i => i.item_id === d.item_id);
    if (!old) { sk('item-missing'); continue; }
    if (old.current || old.to) { sk('already'); continue; }
    let body;
    const s0 = old.source || {};
    const a = d.src && d.src.url ? d.src : null;
    const srcObj = a ? { kind: KINDS.includes(a.kind) ? a.kind : 'OTHER', title: String(a.title || '공개 자료').replace(/\([^)]*\d{4}[^)]*\)/g, '').replace(/(더불어민주당|국민의힘|국힘|민주당|조국혁신당|개혁신당|진보당|정의당)/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) || '공개 자료', url: a.url, checked_on: TODAY }
      : { kind: s0.kind || 'OTHER', title: s0.title || '공개 자료', checked_on: TODAY, ...(s0.url ? { url: s0.url } : {}) };
    if (d.decision === 'CURRENT') body = { head_id: h.head_id, field_cd: 'CAREER', value: old.value, from: old.from, current: true, source: srcObj };
    else if (d.decision === 'ENDED' && ENDED_OK.has(d.item_id) && d.to) body = { head_id: h.head_id, field_cd: 'CAREER', value: old.value, from: old.from, to: d.to, source: srcObj };
    else { sk(d.decision === 'ENDED' ? 'ended-unconfirmed' : 'unknown'); continue; }
    if (!GO) { d.decision === 'CURRENT' ? log.current++ : log.ended++; continue; }
    const p = '/institutions/' + encodeURIComponent(d.inst) + '/head/items';
    const r1 = await fetch(BASE + p, { method: 'POST', headers: H('item_add', 1), body: JSON.stringify(body) });
    if (r1.status !== 201) { let m = ''; try { m = JSON.stringify((await r1.json()).detail).slice(0, 100); } catch (e) { } log.fail.push(d.item_id + ':add ' + r1.status + ' ' + m); continue; }
    const r2 = await fetch(BASE + p + '/' + d.item_id + '/void', { method: 'POST', headers: H('item_void', 1), body: JSON.stringify({ reason: '현직·끝 날짜를 확인해 표시를 붙여 다시 등록(같은 내용, 사용자 11-26)' }) });
    if (r2.status !== 200) log.fail.push(d.item_id + ':void ' + r2.status);
    d.decision === 'CURRENT' ? log.current++ : log.ended++;
  }
  console.log((GO ? '' : '[시험] ') + JSON.stringify({ decisions: log.decisions, current: log.current, ended: log.ended, skip: log.skip, fail: log.fail.length }));
  if (log.fail.length) console.log(log.fail.slice(0, 8).join('\n'));
})();
