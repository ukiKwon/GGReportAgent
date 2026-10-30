// 매일 18:00 "마무리" — 청소부(cleaner) 캐릭터가 수행한다. Windows 작업 스케줄러가 실행한다.
// 사용: node agent-dashboard/closing.js [--dry] [--merge]
//   --dry  : 판단만 출력하고 아무것도 하지 않는다
//   --merge: (시험용, 수동 지정 때만) 마무리 뒤 현재 브랜치를 main에 --no-ff로 병합하고 main을 푸시한다. 매일 18:00 자동 실행에는 들어가지 않는다.
//
// 안전 규칙
//  - 작업 중인 에이전트가 있으면 미룬다(5분 간격, 최대 30분). 끝내 바쁘면 이번 회차는 건너뛴다.
//  - 커밋할 것도, 올릴 커밋도 없으면 모델을 부르지 않는다(비용 0).
//  - 현재 브랜치가 main/master면 푸시하지 않는다(커밋까지만).
//  - 헤드리스 모델은 허용 도구가 정해져 있다: 읽기·편집 + git status/diff/log/add/commit/push/branch/rev-parse/rev-list/ls-files.
//    force push·reset·삭제·병합은 도구 허용 목록에 없다.
//  - 결과는 agent-dashboard/closing.log(gitignore)에 남긴다.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const store = require('./statefile');

const ROOT = path.resolve(__dirname, '..');
const LOG = path.join(__dirname, 'closing.log');
const DRY = process.argv.includes('--dry');
const MERGE = process.argv.includes('--merge');
const PROTECTED = ['main', 'master'];
const log = m => { const line = `[${new Date().toISOString()}] ${m}\n`; process.stdout.write(line); try { fs.appendFileSync(LOG, line); } catch (_) {} };
const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', windowsHide: true });
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function findClaude() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const w = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8', windowsHide: true });
  if (w.status === 0 && w.stdout.trim()) return w.stdout.split(/\r?\n/)[0].trim();
  const ext = path.join(process.env.USERPROFILE || process.env.HOME || '', '.vscode', 'extensions');
  try {
    const dirs = fs.readdirSync(ext).filter(d => d.startsWith('anthropic.claude-code')).sort();
    for (const d of dirs.reverse()) {
      const p = path.join(ext, d, 'resources', 'native-binary', process.platform === 'win32' ? 'claude.exe' : 'claude');
      if (fs.existsSync(p)) return p;
    }
  } catch (_) {}
  return null;
}

function busy() {
  const s = store.read(); if (!s || !s.agents) return false;
  return Object.entries(s.agents).some(([id, a]) => id !== 'cleaner' && a && a.active);
}

function setCleaner(on) { // 대시보드에 청소부 출근/퇴근 표시
  store.update(s => {
    const a = s.agents.cleaner || (s.agents.cleaner = {});
    a.instances = a.instances || {};
    if (on) a.instances.closing = { task: '18:00 마무리', since: Date.now() }; else delete a.instances.closing;
  });
}

function mergeToMain(branch) { // 충돌이 나면 되돌리고 원래 브랜치로 돌아온다. force·reset은 쓰지 않는다.
  if (PROTECTED.includes(branch)) { log('이미 main 계열 브랜치 — 병합 생략'); return; }
  const dirty = git('status', '--porcelain').stdout.split(/\r?\n/).filter(l => l && !/^\?\? GGReportAgent\/?$/.test(l));
  if (dirty.length) { log('작업 트리가 깨끗하지 않아 병합 중단: ' + dirty.slice(0, 5).join(' | ')); return; }
  const step = (label, ...a) => { const r = git(...a); log(`${label}: ${r.status === 0 ? 'ok' : 'FAIL ' + (r.stderr || r.stdout).trim().slice(0, 300)}`); return r.status === 0; };
  if (!step('fetch', 'fetch', 'origin')) return;
  if (!step('checkout main', 'checkout', 'main')) return;
  let ok = step('main 최신화(ff-only)', 'pull', '--ff-only', 'origin', 'main');
  ok = ok && step('병합(--no-ff)', 'merge', '--no-ff', branch, '-m', `merge: ${branch} → main (청소부 마무리 시험)\n\nCo-Authored-By: Claude <noreply@anthropic.com>`);
  if (!ok) { git('merge', '--abort'); log('병합 실패 — 중단하고 원래 브랜치로 복귀(main은 변경 없음)'); step('복귀', 'checkout', branch); return; }
  step('main 푸시', 'push', 'origin', 'main');
  step('원래 브랜치로 복귀', 'checkout', branch);
}

function main() {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
  const pushAllowed = !PROTECTED.includes(branch);
  const changes = git('status', '--porcelain').stdout.split(/\r?\n/).filter(l => l && !/^\?\? GGReportAgent\/?$/.test(l));
  const ahead = parseInt(git('rev-list', '--count', '@{u}..HEAD').stdout.trim(), 10) || 0;
  log(`브랜치=${branch} 푸시허용=${pushAllowed} 변경=${changes.length}건 올릴커밋=${ahead}개 작업중=${busy()}`);

  if (!changes.length && !ahead) { log('정리할 것 없음 — 종료'); return; }
  if (DRY) { log('--dry: 여기서 종료(실제로는 마무리를 수행함)'); return; }

  for (let i = 0; busy(); i++) {
    if (i >= 6) { log('에이전트가 계속 작업 중이라 이번 회차는 건너뜀'); return; }
    log('에이전트 작업 중 — 5분 뒤 다시 확인'); sleepSync(5 * 60 * 1000);
  }

  const claude = findClaude();
  if (!claude) { log('claude 실행 파일을 찾지 못함 — 종료(CLAUDE_BIN으로 경로 지정 가능)'); return; }

  const pushRule = pushAllowed
    ? `커밋 뒤 현재 브랜치(${branch})를 푸시한다(upstream이 없으면 git push -u origin ${branch}). 실패하면 재시도하지 말고 이유만 보고한다.`
    : `현재 브랜치(${branch})는 보호 브랜치다 — 푸시하지 말고 커밋까지만 한다.`;
  const prompt = `[18:00 자동 마무리] 이 저장소의 CLAUDE.md "마무리" 절차를 수행해라.
1) 오늘 날짜의 handoff/YYYY-MM-DD_summary.md에 "## Session HH:mm" 섹션을 맨 아래에 추가한다(기존 섹션은 수정·삭제 금지, 파일이 없으면 새로 만든다). 내용은 git log·git status·git diff 근거로 오늘 한 일, 결정, 남은 일을 짧게 쓴다.
2) 상태가 바뀐 handoff/NEXT.md 항목이 있으면 그 항목만 부분 수정한다(통째로 다시 쓰지 않는다).
3) 커밋: git add -A / git commit -a 는 쓰지 않고 경로를 지정해 담는다. 담지 않을 것: GGReportAgent/ 폴더, .env·키·토큰·자격증명으로 보이는 파일, *.log, agent-dashboard/state.json. 의심스러운 파일은 빼고 보고한다. 커밋 메시지는 한국어 conventional 형식, 끝에 빈 줄과 "Co-Authored-By: Claude <noreply@anthropic.com>".
4) ${pushRule}
금지: force push, reset --hard, 파일 삭제, 브랜치 병합·삭제, 설정(.claude/settings*.json·CLAUDE.md) 수정.
마지막에 한 일을 5줄 이내로 보고해라.`;

  const args = ['-p', prompt, '--permission-mode', 'acceptEdits', '--no-session-persistence',
    '--allowedTools', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
    'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git add:*)', 'Bash(git commit:*)',
    'Bash(git push:*)', 'Bash(git branch:*)', 'Bash(git rev-parse:*)', 'Bash(git rev-list:*)', 'Bash(git ls-files:*)'];
  log('마무리 시작 (청소부 출근)');
  try { setCleaner(true); } catch (e) { log('대시보드 갱신 실패: ' + e.message); }
  const r = spawnSync(claude, args, { cwd: ROOT, encoding: 'utf8', timeout: 25 * 60 * 1000, windowsHide: true });
  if (MERGE && r.status === 0) { try { mergeToMain(branch); } catch (e) { log('병합 단계 예외: ' + e.message); } }
  try { setCleaner(false); } catch (_) {}
  log(`종료 코드=${r.status}${r.error ? ' 오류=' + r.error.message : ''}\n${(r.stdout || '').trim().slice(-1500)}${r.stderr ? '\n[stderr] ' + r.stderr.trim().slice(-500) : ''}`);
}
try { main(); } catch (e) { log('실패: ' + e.message); try { setCleaner(false); } catch (_) {} }
