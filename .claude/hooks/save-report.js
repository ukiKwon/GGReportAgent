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
    let text = typeof p.last_assistant_message === 'string' ? p.last_assistant_message : '';
    if (!text && p.agent_transcript_path) text = lastAssistantText(p.agent_transcript_path);
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

function lastAssistantText(file) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const o = JSON.parse(lines[i]);
      const m = o.message || o;
      if ((m.role || o.type) !== 'assistant') continue;
      const c = m.content;
      if (typeof c === 'string') return c;
      if (Array.isArray(c)) { const t = c.filter(b => b && b.type === 'text').map(b => b.text).join('\n').trim(); if (t) return t; }
    }
  } catch (_) {}
  return '';
}
