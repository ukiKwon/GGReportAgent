// 에이전트 대시보드 상태 갱신 훅. 사용: node hook.js <dispatch|start|stop|prompt|idle|session|tool|end>
// stdin: Claude Code 훅 JSON. 실패해도 항상 exit 0 — 본 작업을 막지 않는다.
// 같은 역할이 동시에 여러 개(병렬·여러 세션) 돌 수 있어, 에이전트별 instances에 인스턴스 단위로 기록한다.
// 메인 세션(에이전트 없이 직접 일하는 쪽)은 state.mains에 세션별 한 줄, stats.mainOps에 하루 처리 수(도구 호출 1회=1)로 기록한다(tool·prompt·idle·session·end, 사용자 11-24).
const { update, dayKey } = require('./statefile');
const MAP = {
  'design-reviewer': 'designer', 'qa-verifier': 'qa', 'frontend-dev': 'frontend',
  'backend-dev': 'backend', 'security': 'security',
  // 쓰기용 변형도 같은 역할 칸에 띄운다(빠져 있어 대시보드에 안 보였음, 2026-11-11)
  'frontend-dev-write': 'frontend', 'backend-dev-write': 'backend', 'planner': 'planner', 'pm': 'pm', 'cleaner': 'cleaner', 'data-auditor': 'auditor',
};
// 쓰기용 에이전트 — MAP 블록 밖에 둔다(test/server.test.js가 MAP 블록만 정규식으로 읽음). 같은 선수 칸에 '쓰기' 표시를 붙이는 데 쓴다.
const WRITE = new Set(['frontend-dev-write', 'backend-dev-write']);
const KO = { designer: '디자이너', qa: 'QA', frontend: '프론트', backend: '백엔드', security: '보안', planner: '기획', pm: 'PM', auditor: '데이터', cleaner: '청소부' };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clip = (t, n) => Array.from(String(t == null ? '' : t).replace(/\s+/g, ' ').trim()).slice(0, n).join('');
const fname = f => String(f || '').split(/[\\/]/).filter(Boolean).pop() || '';
const isSub = p => !!p.agent_id || has(MAP, p.agent_type) || String(p.agent_type || '').includes(':'); // 서브에이전트 안의 호출(메인이 아님)
const sidOf = p => String(p.session_id || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 12);
const mainOf = (s, p) => { // 세션 줄(없으면 만든다). 세션 이름은 알 방법이 없어 cwd 끝 폴더 + session_id 앞 6자
  const sid = sidOf(p); if (!sid) return null;
  const k = 'm_' + sid, m = s.mains[k] || (s.mains[k] = {});
  m.sid = sid.slice(0, 6); m.dir = clip(fname(p.cwd), 16) || m.dir || '?';
  return m;
};
function mainTask(tool, ti) { // 사용자가 읽는 한 줄. 명령 본문(command)은 비밀이 섞일 수 있어 절대 싣지 않는다
  const named = (label, f) => fname(f) ? label + ': ' + clip(fname(f), 30) : label;
  switch (tool) {
    case 'Bash': return clip(ti.description, 40) || '명령 실행 중';
    case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit': return named('파일 고치는 중', ti.file_path || ti.notebook_path);
    case 'Read': return named('파일 읽는 중', ti.file_path);
    case 'Grep': case 'Glob': return '파일 찾는 중';
    case 'Agent': case 'Task': {
      const id = has(MAP, ti.subagent_type) ? MAP[ti.subagent_type] : '';
      return (id ? KO[id] + (WRITE.has(ti.subagent_type) ? '(쓰기)' : '') : clip(ti.subagent_type, 16) || '에이전트') + '에게 맡기는 중';
    }
    case 'TodoWrite': return '할 일 정리 중';
    case 'WebFetch': case 'WebSearch': return '웹 자료 찾는 중';
    default: return tool ? '도구 사용 중: ' + clip(tool, 24) : '작업 중';
  }
}
const inst = (s, id) => { const a = s.agents[id] || (s.agents[id] = {}); return a.instances || (a.instances = {}); };
const oldest = (ins, pred) => Object.keys(ins).filter(pred).sort((x, y) => (ins[x].since || 0) - (ins[y].since || 0))[0];
const isPending = k => k.startsWith('pending:');
const finish = (s, id, ins, k) => { // 끝난 인스턴스는 지우지 않고 done으로 옮긴다(active 계산은 instances만 본다)
  const v = ins[k] || {}; delete ins[k];
  const a = s.agents[id]; (a.done || (a.done = {}))[k] = { task: v.task || '', since: v.since || 0, doneAt: Date.now() };
};

let raw = '';
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  try {
    const mode = process.argv[2];
    let p = {}; try { p = JSON.parse(raw); } catch (_) {}
    if (mode === 'dispatch') { // Agent 도구 호출 직전: 무슨 일을 맡기는지 (agent_id는 아직 없음)
      const ti = p.tool_input || {}, id = MAP[ti.subagent_type]; if (!id) return;
      const desc = Array.from(String(ti.description || '')).slice(0, 24).join('') || '작업 중';
      update(s => { inst(s, id)['pending:' + Date.now() + Math.random().toString(36).slice(2, 6)] = { task: desc, since: Date.now(), w: WRITE.has(ti.subagent_type) ? 1 : 0 }; });
    } else if (mode === 'start') {
      const id = MAP[p.agent_type]; if (!id) return;
      update(s => {
        const ins = inst(s, id), key = p.agent_id || 'anon:' + Date.now();
        if (ins[key]) return;
        const pend = oldest(ins, isPending);
        if (pend) { ins[key] = ins[pend]; delete ins[pend]; } else ins[key] = { task: '작업 중', since: Date.now() };
        ins[key].w = WRITE.has(p.agent_type) ? 1 : 0; // 같은 역할의 pending과 짝이 어긋나도 쓰기 여부는 시작한 에이전트 기준
      });
    } else if (mode === 'stop') {
      const id = MAP[p.agent_type]; if (!id) return;
      update(s => {
        const ins = inst(s, id);
        if (p.agent_id && ins[p.agent_id]) finish(s, id, ins, p.agent_id);
        else { const k = oldest(ins, () => true); if (k) finish(s, id, ins, k); }
      });
    } else if (mode === 'prompt') {
      const text = String(p.prompt || '').replace(/\s+/g, ' ').trim();
      if (text.startsWith('<')) return; // 시스템 알림·명령 태그는 전광판에 올리지 않고 사용 중 표시(at)도 하지 않는다
      update(s => {
        s.coach.task = Array.from(text).slice(0, 40).join(''); s.coach.at = Date.now(); // at: 마지막 사용자 프롬프트 시각(closing.js가 사용 중 판단에 씀)
        const m = mainOf(s, p); if (m) { m.st = 'work'; m.task = '지시 받음: ' + clip(text, 24); m.at = Date.now(); delete m.hold; }
      });
    } else if (mode === 'idle') { // Stop: 이 세션은 대기
      update(s => {
        s.coach.task = '';
        const m = mainOf(s, p); if (m) { m.st = 'idle'; m.task = ''; m.at = Date.now(); delete m.hold; }
      });
    } else if (mode === 'session') { // 누적은 하루 유지(사용자 11-16) — 새 세션에서는 날짜만 확인(바뀌었으면 statefile.normalize가 0부터)
      if (p.source === 'startup' || p.source === 'clear' || p.source === 'resume') update(s => { // 세션 줄은 '대기'로 시작(compact는 일하던 도중이라 건드리지 않음)
        const m = mainOf(s, p); if (m) { m.st = 'idle'; m.task = ''; m.at = Date.now(); delete m.hold; }
      });
    } else if (mode === 'tool') { // PreToolUse(matcher 없음): 메인 세션이 도구를 쓰기 직전 — 세션 줄 갱신 + 하루 처리 수 +1
      if (isSub(p) || !sidOf(p)) return; // 서브에이전트 안의 호출·세션 모름은 올리지 않는다
      const ti = p.tool_input && typeof p.tool_input === 'object' ? p.tool_input : {};
      const task = mainTask(p.tool_name, ti);
      const hold = p.tool_name === 'Bash' ? Math.min(Math.max(Number(ti.timeout) || 0, 0), 600000) : 0; // 오래 걸릴 수 있는 시간 — 그 안에는 '멈춤?'으로 보지 않는다
      update(s => {
        const m = mainOf(s, p), now = Date.now(), dk = dayKey(now);
        if (m.day !== dk) { m.day = dk; m.n = 0; } // 세션별 건수도 하루 단위(stats.mainOps와 맞춤)
        m.st = 'work'; m.task = task; m.at = now; m.n = (m.n || 0) + 1;
        if (hold) m.hold = hold; else delete m.hold;
        s.stats.mainOps = (s.stats.mainOps || 0) + 1;
      });
    } else if (mode === 'end') { // SessionEnd: 세션 줄을 지운다(안 불려도 60분 뒤 정리)
      const sid = sidOf(p); if (sid) update(s => { delete s.mains['m_' + sid]; });
    }
  } catch (_) {}
});
