// 에이전트 운동장 상태 갱신 훅. 사용: node hook.js <start|stop|prompt|idle>
// stdin: Claude Code 훅 JSON (agent_type, prompt 등). 실패해도 항상 exit 0 — 본 작업을 막지 않는다.
const fs = require('fs'), path = require('path');
const STATE = path.join(__dirname, 'state.json'), LOCK = STATE + '.lock';
const MAP = {
  'design-reviewer': 'designer', 'qa-verifier': 'qa', 'frontend-dev': 'frontend',
  'backend-dev': 'backend', 'security': 'security', 'planner': 'planner', 'pm': 'pm',
};
const LABEL = { start: '작업 중', stop: '' };

function update(fn) {
  const t0 = Date.now();
  for (;;) {
    try { fs.closeSync(fs.openSync(LOCK, 'wx')); break; }
    catch (e) {
      try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 3000) fs.unlinkSync(LOCK); } catch (_) {}
      if (Date.now() - t0 > 2000) return;
    }
  }
  try {
    let s = {};
    try { s = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (_) {}
    s.coach = s.coach || { task: '' }; s.agents = s.agents || {};
    fn(s);
    fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
  } finally { try { fs.unlinkSync(LOCK); } catch (_) {} }
}

let raw = '';
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  try {
    const mode = process.argv[2];
    let inp = {}; try { inp = JSON.parse(raw); } catch (_) {}
    if (mode === 'start' || mode === 'stop') {
      const id = MAP[inp.agent_type]; if (!id) return;
      update(s => { s.agents[id] = { active: mode === 'start', task: LABEL[mode] }; });
    } else if (mode === 'prompt') {
      update(s => { s.coach.task = String(inp.prompt || '').replace(/\s+/g, ' ').slice(0, 40); });
    } else if (mode === 'idle') {
      update(s => { s.coach.task = ''; });
    }
  } catch (_) {}
});
