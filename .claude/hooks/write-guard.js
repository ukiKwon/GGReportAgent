// write-guard.js — PreToolUse(Edit|Write|NotebookEdit) 경로 가드. 쓰기용 에이전트(-write)만 검사한다.
// 메인 세션과 읽기 전용 에이전트(Edit·Write가 없음)는 그대로 통과한다.
// 쓰기용 에이전트로 판정된 뒤에는 실패 시 거부(fail closed): 경로 없음, 저장소 밖, 허용 목록 밖, 모르는 에이전트.
// 단, 입력 JSON 자체를 해석하지 못하면 누가 부른 것인지 알 수 없으므로 통과시킨다(메인 작업을 막지 않기 위해 — 의도된 동작).
// 거부는 exit 2 + stderr(에이전트에게 보인다). 근거: security 2026-11-02 사후 검토 중-1, handoff/agents/README.md.
const path = require('path');

const ALLOW = {
  // 역할 정의(.claude/agents/frontend-dev-write.md)와 같은 범위: frontend/data/·vendor/·geo/ 등은 제외
  'frontend-dev-write': [/^frontend\/index\.html$/, /^frontend\/js\/[^/]+\.js$/, /^frontend\/test\/[^/]+\.js$/],
  'backend-dev-write': [/^kgi-ggreport-web\//]
};
// 허용 목록 안이어도 막는다: 비밀번호 설정, 다음 훅·커밋 때 실행되는 경로.
const DENY = [
  /^\.claude\//, /^\.git\//, /^agent-dashboard\//,
  /(^|\/)config\/application\.properties$/, /(^|\/)\.mylogin\.cnf$/
];

function deny(msg) {
  process.stderr.write('write-guard: ' + msg + '\n');
  process.exit(2);
}

let raw = '';
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  let p;
  try { p = JSON.parse(raw); } catch (e) { process.exit(0); }   // 메인 여부를 알 수 없으면 막지 않는다(아래에서 -write만 판정)
  const agent = String(p.agent_type || '');
  if (!agent.endsWith('-write')) process.exit(0);
  const rules = ALLOW[agent];
  if (!rules) deny('등록되지 않은 쓰기 에이전트: ' + agent);
  const ti = p.tool_input || {};
  const target = ti.file_path || ti.notebook_path;
  if (!target) deny('대상 경로가 없습니다');
  const root = process.env.CLAUDE_PROJECT_DIR || p.cwd || process.cwd();
  // Windows(NTFS)는 대소문자를 구분하지 않고 끝 점·공백을 버리며 ':'는 ADS 별칭이다 → 소문자로 비교하고 별칭은 거부(security PUSH-GATE 2026-11-02 중)
  const rel = path.relative(path.resolve(root), path.resolve(root, target)).split(path.sep).join('/').toLowerCase();
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) deny('저장소 밖 경로: ' + target);
  if (/:|[. ](\/|$)/.test(rel)) deny('허용하지 않는 경로 표기: ' + target);
  if (DENY.some((re) => re.test(rel))) deny('쓰기 금지 경로: ' + rel);
  if (!rules.some((re) => re.test(rel))) deny(agent + '의 허용 경로 밖: ' + rel);
  process.exit(0);
});
