// state.json 읽기/쓰기 공용(훅 + 서버). 잠금 파일로 직렬화하고, 임시 파일 → rename으로 원자적으로 쓴다.
// 에이전트별 instances({키: {task, since}})가 있으면 active/task/since는 그 값에서 매번 다시 계산한다.
const fs = require('fs'), path = require('path');
const STATE = path.join(__dirname, 'state.json'), LOCK = STATE + '.lock';
const TTL = 15 * 60 * 1000; // stop 이벤트가 유실된 인스턴스는 15분 뒤 정리
const sleep = ms => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) {} };

function read() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (_) { return null; } }

function normalize(s) {
  const now = Date.now();
  if (!s.coach || typeof s.coach !== 'object') s.coach = { task: '' };
  if (!s.agents || typeof s.agents !== 'object') s.agents = {};
  for (const id of Object.keys(s.agents)) {
    const a = s.agents[id];
    if (!a || typeof a !== 'object' || !a.instances) continue;
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
module.exports = { STATE, read, update };
