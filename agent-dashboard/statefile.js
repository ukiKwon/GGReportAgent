// state.json 읽기/쓰기 공용(훅 + 서버). 잠금 파일로 직렬화하고, 임시 파일 → rename으로 원자적으로 쓴다.
// 에이전트별 instances({키: {task, since}})가 있으면 active/task/since는 그 값에서 매번 다시 계산한다.
const fs = require('fs'), path = require('path');
const STATE = path.join(__dirname, 'state.json'), LOCK = STATE + '.lock';
const TTL = 15 * 60 * 1000; // stop 이벤트가 유실된 인스턴스는 15분 뒤 정리
const DONE_TTL = 30 * 1000;  // 끝난 인스턴스(done)는 30초만 남긴다(화면 숨김은 app.js DONE_MS와 같은 값)
const MAIN_TTL = 60 * 60 * 1000; // 메인 세션 줄(state.mains)은 마지막 신호가 한 시간 지나면 정리
const sleep = ms => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) {} };

// 작업 내용(누적 바퀴·에이전트별 진행)은 하루 동안 유지하고 날짜(이 PC 기준)가 바뀌면 0부터(사용자 11-16 — 전에는 새 Claude 세션마다 리셋)
const dayKey = ts => { const d = new Date(ts); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
const AGENT_KEY = /^(designer|qa|frontend|backend|security|planner|pm|auditor)(_[2-9])?$/; // 화면 선수 id(추가 인스턴스는 _2~_9)
const MAX_LAP = 1e7;
// 에이전트별 진행 {id: {lapF, freshAt}} 병합 — 형식이 틀린 항목은 버리고, 같은 id는 진행(lapF)이 줄어들지 않게(여러 탭·지연 쓰기 대비)
function mergeAgents(cur, inc) {
  const out = {};
  const take = (k, v) => {
    if (!AGENT_KEY.test(k) || !v || typeof v !== 'object' || Array.isArray(v)) return;
    const lapF = v.lapF, freshAt = v.freshAt == null ? 0 : v.freshAt;
    if (typeof lapF !== 'number' || !Number.isFinite(lapF) || lapF < 0 || lapF > MAX_LAP) return;
    if (typeof freshAt !== 'number' || !Number.isFinite(freshAt) || freshAt < 0 || freshAt > lapF + 1) return;
    const o = out[k], nv = { lapF: Math.round(lapF * 1000) / 1000, freshAt: Math.floor(freshAt) };
    if (!o || nv.lapF > o.lapF || (nv.lapF === o.lapF && nv.freshAt > o.freshAt)) out[k] = nv;
  };
  for (const src of [cur, inc]) {
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    let n = 0;
    for (const k of Object.keys(src)) { if (++n > 64) break; take(k, src[k]); }
  }
  return out;
}

function read() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (_) { return null; } }

function normalize(s) {
  const now = Date.now();
  if (!s.coach || typeof s.coach !== 'object') s.coach = { task: '' };
  if (!s.agents || typeof s.agents !== 'object') s.agents = {};
  if (!s.stats || typeof s.stats !== 'object') s.stats = { laps: 0, since: now };
  if (!(Number.isFinite(s.stats.laps) && s.stats.laps >= 0)) s.stats.laps = 0;
  if (!Number.isFinite(s.stats.since)) s.stats.since = now;
  if (dayKey(s.stats.since) !== dayKey(now)) s.stats = { laps: 0, since: now }; // 날짜가 바뀌면 0부터(stats.mainOps = 메인 처리 수도 함께)
  if ('mainOps' in s.stats && !(Number.isFinite(s.stats.mainOps) && s.stats.mainOps >= 0)) delete s.stats.mainOps; // 기본값은 넣지 않는다(기존 stats 시험이 deepStrictEqual)
  if (!s.mains || typeof s.mains !== 'object' || Array.isArray(s.mains)) s.mains = {};
  for (const k of Object.keys(s.mains)) { const m = s.mains[k]; if (!m || typeof m !== 'object' || !(now - (m.at || 0) <= MAIN_TTL)) delete s.mains[k]; }
  if ('agents' in s.stats) { const ag = mergeAgents(null, s.stats.agents); if (Object.keys(ag).length) s.stats.agents = ag; else delete s.stats.agents; }
  for (const id of Object.keys(s.agents)) {
    const a = s.agents[id];
    if (!a || typeof a !== 'object') continue;
    if (a.done && typeof a.done === 'object') { // 정리용. 화면 숨김은 app.js가 따로 한다
      for (const k of Object.keys(a.done)) if (!(now - (a.done[k] && a.done[k].doneAt || 0) <= DONE_TTL)) delete a.done[k];
      if (!Object.keys(a.done).length) delete a.done;
    } else if (a.done) delete a.done;
    if (!a.instances) continue;
    for (const k of Object.keys(a.instances)) if (now - (a.instances[k].since || 0) > TTL) delete a.instances[k];
    const first = Object.values(a.instances).sort((x, y) => (x.since || 0) - (y.since || 0))[0];
    a.active = !!first; a.task = first ? first.task || '' : ''; a.since = first ? first.since : 0;
  }
}

function update(fn) {
  const t0 = Date.now(); let locked = false;
  while (!locked) {
    try { fs.closeSync(fs.openSync(LOCK, 'wx')); locked = true; }
    catch (_) {
      try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 3000) fs.unlinkSync(LOCK); } catch (__) {}
      if (Date.now() - t0 > 3000) break; // 끝내 못 잡아도 갱신을 버리지 않는다(마지막 쓰기 우선)
      sleep(15 + Math.random() * 25);
    }
  }
  try {
    const s = read() || {};
    normalize(s); fn(s); normalize(s);
    const tmp = STATE + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2)); fs.renameSync(tmp, STATE);
  } finally { if (locked) try { fs.unlinkSync(LOCK); } catch (_) {} }
}
const IDS = ['designer', 'qa', 'frontend', 'backend', 'security', 'planner', 'pm', 'auditor', 'cleaner']; // 에이전트 id 정본(serve.js·시험이 공유)
module.exports = { STATE, IDS, read, update, mergeAgents, dayKey };
