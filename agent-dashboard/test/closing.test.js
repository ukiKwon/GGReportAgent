// closing.js busyReason 시험(--dry). 실제 저장소·state.json·원격에 접근하지 않는다.
//  - agent-dashboard 파일을 임시 폴더로 복사한다. closing.js의 ROOT가 임시 폴더가 되어 git·state.json·closing.log가 모두 임시 폴더 안에 있다.
//  - origin은 존재하지 않는 로컬 경로(끝이 github.com/ukiKwon/GGReportAgent.git)라 ALLOWED_REMOTE는 통과하지만 네트워크에 닿을 수 없다.
//  - 전역 git 설정·훅 환경변수는 차단한다. 항상 --dry로 실행한다.
// 실행: node --test agent-dashboard/test/closing.test.js   (Node 18+)
const test = require('node:test'), assert = require('node:assert');
const { describe, it, before, after } = test;
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');

const SRC = path.join(__dirname, '..');
let root, dash, env;

function git(...a) {
  const r = spawnSync('git', a, { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.strictEqual(r.status, 0, 'git ' + a.join(' ') + ' 실패: ' + (r.stderr || r.error));
  return r.stdout;
}

function writeState({ at, active = [] }) { // store.read()는 정규화하지 않으므로 active를 직접 쓴다
  const ids = ['designer', 'qa', 'frontend', 'backend', 'security', 'planner', 'pm', 'auditor', 'cleaner'];
  fs.writeFileSync(path.join(dash, 'state.json'), JSON.stringify({
    coach: at === undefined ? { task: '' } : { task: '', at },
    stats: { laps: 0, since: 1000 },
    agents: Object.fromEntries(ids.map(k => [k, { active: active.includes(k), task: '' }])),
  }, null, 2));
}

function runDry(...extra) {
  const r = spawnSync(process.execPath, [path.join(dash, 'closing.js'), '--dry', ...extra],
    { cwd: root, env, encoding: 'utf8', timeout: 20000, windowsHide: true });
  assert.strictEqual(r.status, 0, 'closing.js 종료 코드: ' + r.status + ' ' + r.stderr);
  const out = r.stdout;
  assert.ok(!out.includes('원격이 허용 대상이 아니라 중단'), '원격 검사에서 중단됨:\n' + out);
  assert.match(out, /브랜치=test-branch 푸시허용=true/); // main()이 사용중= 로그까지 도달했다
  assert.ok(out.includes('--dry: 여기서 종료'), '--dry 종료 줄이 없음:\n' + out); // 쓰기·푸시 경로에 들어가지 않았다
  assert.ok(!out.includes('마무리 시작'));
  const m = /사용중=([^\r\n]*)/.exec(out);
  assert.ok(m, '사용중= 로그 없음:\n' + out);
  return m[1];
}

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agclose-'));
  dash = path.join(root, 'agent-dashboard');
  fs.mkdirSync(dash);
  for (const f of ['closing.js', 'statefile.js']) fs.copyFileSync(path.join(SRC, f), path.join(dash, f));
  const emptyCfg = path.join(root, 'empty.gitconfig'); // Windows에서는 os.devNull(\\.\nul)을 git이 못 읽는다
  fs.writeFileSync(emptyCfg, '');
  env = { ...process.env };
  for (const k of Object.keys(env)) if (/^GIT_/i.test(k)) delete env[k]; // 훅 등에서 상속된 GIT_DIR·GIT_INDEX_FILE 차단
  Object.assign(env, {
    HOME: root, USERPROFILE: root, XDG_CONFIG_HOME: root,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyCfg, GIT_TERMINAL_PROMPT: '0',
    GIT_CEILING_DIRECTORIES: path.dirname(root),
    CLAUDE_BIN: path.join(root, 'no-such-claude'), // 어떤 경로로도 모델이 실행되지 않게
  });
  git('init', '-q');
  git('symbolic-ref', 'HEAD', 'refs/heads/test-branch');
  fs.writeFileSync(path.join(root, 'README.md'), 'test repo\n');
  git('add', 'README.md');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init');
  // 정규식 끝부분만 맞으면 통과: 존재하지 않는 로컬 경로 → 푸시가 일어나도 네트워크에 닿지 않는다
  const fake = root.replace(/\\/g, '/') + '/nowhere/github.com/ukiKwon/GGReportAgent.git';
  git('remote', 'add', 'origin', fake);
  // 복사한 closing.js·statefile.js가 untracked라 담을것>0 이다. --dry는 사용중= 로그 뒤 '--dry: 여기서 종료'로 끝난다.
});

after(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { console.warn('임시 폴더 정리 실패(수동 삭제 필요):', root, e.code); }
});

describe('closing.js busyReason (--dry)', () => {
  it('프롬프트 직후 · 에이전트 idle · 인자 없음 → 최근 10분 사용자 프롬프트', () => {
    writeState({ at: Date.now() });
    assert.match(runDry(), /^최근 10분 안에 사용자 프롬프트가 있었음/);
  });
  it('같은 상태 + --now → 아님', () => {
    writeState({ at: Date.now() });
    assert.strictEqual(runDry('--now'), '아님');
  });
  it('프롬프트 직후 + 에이전트 active + --now → 작업 중인 에이전트', () => {
    writeState({ at: Date.now(), active: ['designer'] });
    assert.strictEqual(runDry('--now'), '작업 중인 에이전트: designer');
  });
  it('(추가) 프롬프트가 1시간 전이고 idle → 아님', () => {
    writeState({ at: Date.now() - 60 * 60 * 1000 });
    assert.strictEqual(runDry(), '아님');
  });
  it('(추가) cleaner만 active이면 사용 중으로 보지 않는다', () => {
    writeState({ active: ['cleaner'] });
    assert.strictEqual(runDry(), '아님');
  });
  it('임시 폴더 로그에만 기록하고 커밋 수는 그대로다', () => {
    assert.ok(fs.existsSync(path.join(dash, 'closing.log')));
    assert.strictEqual(git('rev-list', '--count', 'HEAD').trim(), '1');
  });
});
