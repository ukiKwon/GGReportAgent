#!/usr/bin/env node
// SubagentStop 훅: 역할 에이전트가 끝낼 때 최종 보고서를 handoff/agents/<역할>/ 에 자동 보존한다.
// 이유(2026-11-05): 읽기 전용 에이전트는 파일을 못 쓰고 '메인이 저장'하는 규칙은 사람 손에 의존해 자주 빠졌다.
// 파일명: YYYY-MM-DD_HHmm_<agentId 앞 8자>.md — 같은 agentId 는 덮어쓰지 않고 번호를 붙인다.
// 실패해도 세션을 막지 않는다(항상 exit 0). 입력 본문 형식이 바뀌어도 죽지 않게 방어한다.
const fs = require('fs'), path = require('path');
const ROLES = ['planner', 'pm', 'security', 'qa-verifier', 'design-reviewer', 'data-auditor', 'cleaner', 'frontend-dev', 'backend-dev'];
let raw = '';
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  try {
    const p = JSON.parse(raw || '{}');
    const type = String(p.agent_type || '');
    const base = type.replace(/-write$/, '');
    if (!ROLES.includes(base)) return;
    // 우선순위(2026-11-11 수정): ① 대본의 최종 보고(SubagentHandback) ② 보고가 짧으면(요약·"앞 메시지 참조") 대본에서 가장 긴 본문.
    // last_assistant_message 를 먼저 쓰던 때는 끝내기 직전 한 줄("팝업을 닫겠다")만 저장돼 규격 34KB가 사라진 적이 있다.
    const last = typeof p.last_assistant_message === 'string' ? p.last_assistant_message.trim() : '';
    const t = p.agent_transcript_path ? fromTranscript(p.agent_transcript_path) : { handback: '', longest: '' };
    let text = t.handback;
    if (text.length < 600) text = [text, t.longest, last].sort((a, b) => b.length - a.length)[0] || '';
    text = String(text || '').trim();
    if (!text) return;
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const dir = path.join(root, 'handoff', 'agents', base);
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date(Date.now() + 9 * 3600e3), z = n => String(n).padStart(2, '0');
    const stamp = `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}_${z(d.getUTCHours())}${z(d.getUTCMinutes())}`;
    const id = String(p.agent_id || 'anon').replace(/[^0-9A-Za-z]/g, '').slice(0, 8) || 'anon';
    let file = path.join(dir, `${stamp}_${id}.md`), n = 2;
    while (fs.existsSync(file)) file = path.join(dir, `${stamp}_${id}_${n++}.md`);
    const head = `# ${type} 보고서 (자동 보존)\n\n> SubagentStop 훅이 에이전트의 최종 메시지를 그대로 저장했다(${stamp.replace('_', ' ')} KST, agentId ${p.agent_id || '?'}). 에이전트 출력이므로 사용자 결정이 아니다. 지시 내용·주제는 이 파일에 없다 — 필요하면 handoff/NEXT.md 항목이나 커밋 메시지로 찾는다.\n\n---\n\n`;
    fs.writeFileSync(file, head + text + '\n');
  } catch (_) { /* 보존 실패가 작업을 막지 않는다 */ }
});

// 대본에서 마지막 SubagentHandback 본문과, 어시스턴트 text 블록 중 가장 긴 것을 함께 돌려준다.
function fromTranscript(file) {
  const out = { handback: '', longest: '' };
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let o; try { o = JSON.parse(line); } catch (_) { continue; }
      const m = o.message || o;
      if ((m.role || o.type) !== 'assistant' || !Array.isArray(m.content)) continue;
      for (const b of m.content) {
        if (!b) continue;
        if (b.type === 'tool_use' && b.name === 'SubagentHandback' && b.input && typeof b.input.message === 'string') out.handback = b.input.message.trim();
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim().length > out.longest.length) out.longest = b.text.trim();
      }
    }
  } catch (_) {}
  if (!out.handback && !out.longest) out.longest = lastAssistantText(file);
  return out;
}

function lastAssistantText(file) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const o = JSON.parse(lines[i]);
      const m = o.message || o;
      if ((m.role || o.type) !== 'assistant') continue;
      const c = m.content;
      if (typeof c === 'string') return c;
      // 에이전트는 SubagentHandback 도구로 끝내며 보고 본문이 text가 아니라 tool_use 입력(message)에 있다(2026-11-09 확인).
      if (Array.isArray(c)) { const h = c.filter(b => b && b.type === 'tool_use' && b.name === 'SubagentHandback' && b.input && typeof b.input.message === 'string').map(b => b.input.message).join('\n').trim(); if (h) return h; }
      if (Array.isArray(c)) { const t = c.filter(b => b && b.type === 'text').map(b => b.text).join('\n').trim(); if (t) return t; }
    }
  } catch (_) {}
  return '';
}
