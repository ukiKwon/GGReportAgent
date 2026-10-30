// 에이전트 대시보드 상태 갱신 훅. 사용: node hook.js <dispatch|start|stop|prompt|idle|session>
// stdin: Claude Code 훅 JSON. 실패해도 항상 exit 0 — 본 작업을 막지 않는다.
// 같은 역할이 동시에 여러 개(병렬·여러 세션) 돌 수 있어, 에이전트별 instances에 인스턴스 단위로 기록한다.
const { update } = require('./statefile');
const MAP = {
  'design-reviewer': 'designer', 'qa-verifier': 'qa', 'frontend-dev': 'frontend',
  'backend-dev': 'backend', 'security': 'security', 'planner': 'planner', 'pm': 'pm', 'cleaner': 'cleaner',
};
const inst = (s, id) => { const a = s.agents[id] || (s.agents[id] = {}); return a.instances || (a.instances = {}); };
const oldest = (ins, pred) => Object.keys(ins).filter(pred).sort((x, y) => (ins[x].since || 0) - (ins[y].since || 0))[0];
const isPending = k => k.startsWith('pending:');

let raw = '';
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  try {
    const mode = process.argv[2];
    let p = {}; try { p = JSON.parse(raw); } catch (_) {}
    if (mode === 'dispatch') { // Agent 도구 호출 직전: 무슨 일을 맡기는지 (agent_id는 아직 없음)
      const ti = p.tool_input || {}, id = MAP[ti.subagent_type]; if (!id) return;
      const desc = Array.from(String(ti.description || '')).slice(0, 24).join('') || '작업 중';
      update(s => { inst(s, id)['pending:' + Date.now() + Math.random().toString(36).slice(2, 6)] = { task: desc, since: Date.now() }; });
    } else if (mode === 'start') {
      const id = MAP[p.agent_type]; if (!id) return;
      update(s => {
        const ins = inst(s, id), key = p.agent_id || 'anon:' + Date.now();
        if (ins[key]) return;
        const pend = oldest(ins, isPending);
        if (pend) { ins[key] = ins[pend]; delete ins[pend]; } else ins[key] = { task: '작업 중', since: Date.now() };
      });
    } else if (mode === 'stop') {
      const id = MAP[p.agent_type]; if (!id) return;
      update(s => {
        const ins = inst(s, id);
        if (p.agent_id && ins[p.agent_id]) delete ins[p.agent_id];
        else { const k = oldest(ins, () => true); if (k) delete ins[k]; }
      });
    } else if (mode === 'prompt') {
      update(s => { s.coach.task = Array.from(String(p.prompt || '').replace(/\s+/g, ' ')).slice(0, 40).join(''); });
    } else if (mode === 'idle') {
      update(s => { s.coach.task = ''; });
    } else if (mode === 'session') { // 새 Claude 세션(startup·clear)만 누적 리셋 — resume·compact에서도 SessionStart가 오므로 제외
      if (p.source === 'startup' || p.source === 'clear') update(s => { s.stats = { laps: 0, since: Date.now() }; });
    }
  } catch (_) {}
});
