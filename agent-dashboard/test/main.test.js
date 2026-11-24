// 메인 세션 줄·처리 수·쓰기 표시 — hook.js 'tool' 모드, statefile 정리, fmt.js 순수 함수(사용자 11-24).
// 실제 state.json을 건드리지 않도록 hook.js·statefile.js 사본을 임시 폴더에 두고 돌린다(statefile.js는 __dirname 기준으로 state.json을 연다).
// 실행: node --test agent-dashboard/test/   (Node 18+)
const test = require('node:test'), assert = require('node:assert');
const { describe, it, before, after } = test;
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn, spawnSync } = require('child_process');
const F = require('../fmt.js');

const SRC = path.join(__dirname, '..');
let tmp;
const stateFile = () => path.join(tmp, 'state.json');
const readState = () => JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
const reset = extra => fs.writeFileSync(stateFile(), JSON.stringify(Object.assign({ coach: { task: '' }, agents: {}, stats: { laps: 0, since: Date.now() } }, extra || {}), null, 2));
const hook = (mode, obj) => spawnSync(process.execPath, [path.join(tmp, 'hook.js'), mode], { input: typeof obj === 'string' ? obj : JSON.stringify(obj), encoding: 'utf8', timeout: 15000 });
const hookAsync = (mode, obj) => new Promise(resolve => {
  const c = spawn(process.execPath, [path.join(tmp, 'hook.js'), mode], { stdio: ['pipe', 'ignore', 'ignore'] });
  c.on('exit', code => resolve(code));
  c.stdin.end(JSON.stringify(obj));
});
const S1 = 'abcdef123456-7890', K1 = 'm_abcdef123456';
const DIR = 'C:\\github\\GGReportAgent';
const tool = (name, input, extra) => Object.assign({ session_id: S1, cwd: DIR, tool_name: name, tool_input: input }, extra);
const noMains = () => { const m = readState().mains; return !m || Object.keys(m).length === 0; };

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agdash-main-'));
  for (const f of ['hook.js', 'statefile.js']) fs.copyFileSync(path.join(SRC, f), path.join(tmp, f));
});
after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { console.warn('임시 폴더 정리 실패(수동 삭제 필요):', tmp, e.code); } });

describe('hook tool — 메인 세션 줄·처리 수', () => {
  it('Bash는 description을 올리고 명령 본문(비밀)은 state에 싣지 않는다, mainOps=1', () => {
    reset();
    const r = hook('tool', tool('Bash', { description: '8080 서버 재기동', command: 'mysql -pSECRET123' }));
    assert.strictEqual(r.status, 0);
    const s = readState(), m = s.mains[K1];
    assert.strictEqual(m.task, '8080 서버 재기동'); assert.strictEqual(m.st, 'work');
    assert.strictEqual(m.sid, 'abcdef'); assert.strictEqual(m.dir, 'GGReportAgent'); assert.strictEqual(m.n, 1);
    assert.strictEqual(s.stats.mainOps, 1);
    assert.ok(!JSON.stringify(s).includes('SECRET123'));
  });
  it('description이 없으면 "명령 실행 중", 길면 40자로 자른다', () => {
    reset();
    hook('tool', tool('Bash', { command: 'ls' }));
    assert.strictEqual(readState().mains[K1].task, '명령 실행 중');
    hook('tool', tool('Bash', { description: 'x'.repeat(100) }));
    assert.strictEqual(Array.from(readState().mains[K1].task).length, 40);
  });
  it('Edit·Write·Read는 파일 이름만(경로 구분자 \\ / 모두)', () => {
    reset();
    hook('tool', tool('Edit', { file_path: 'C:\\a\\frontend\\js\\app.js', old_string: 'x' }));
    assert.strictEqual(readState().mains[K1].task, '파일 고치는 중: app.js');
    hook('tool', tool('Write', { file_path: '/x/y/notes.md' }));
    assert.strictEqual(readState().mains[K1].task, '파일 고치는 중: notes.md');
    hook('tool', tool('Write', {}));
    assert.strictEqual(readState().mains[K1].task, '파일 고치는 중');
    hook('tool', tool('Read', { file_path: 'c:/r/logic.js' }));
    assert.strictEqual(readState().mains[K1].task, '파일 읽는 중: logic.js');
  });
  it('Agent는 "<역할>에게 맡기는 중", 쓰기용은 (쓰기), 모르는 유형은 그 이름', () => {
    reset();
    hook('tool', tool('Agent', { subagent_type: 'qa-verifier', description: '검토' }));
    assert.strictEqual(readState().mains[K1].task, 'QA에게 맡기는 중');
    hook('tool', tool('Agent', { subagent_type: 'frontend-dev-write' }));
    assert.strictEqual(readState().mains[K1].task, '프론트(쓰기)에게 맡기는 중');
    hook('tool', tool('Task', { subagent_type: 'general-purpose' }));
    assert.strictEqual(readState().mains[K1].task, 'general-purpose에게 맡기는 중');
    hook('tool', tool('Agent', { subagent_type: '__proto__' }));
    assert.strictEqual(readState().mains[K1].task, '__proto__에게 맡기는 중');
  });
  it('그 밖의 도구: TodoWrite·Grep·모르는 도구·tool_input 없음', () => {
    reset();
    hook('tool', tool('TodoWrite', { todos: [] })); assert.strictEqual(readState().mains[K1].task, '할 일 정리 중');
    hook('tool', tool('Grep', { pattern: 'a' })); assert.strictEqual(readState().mains[K1].task, '파일 찾는 중');
    hook('tool', tool('mcp__x__y', {})); assert.strictEqual(readState().mains[K1].task, '도구 사용 중: mcp__x__y');
    hook('tool', { session_id: S1, cwd: DIR }); assert.strictEqual(readState().mains[K1].task, '작업 중');
    assert.strictEqual(readState().stats.mainOps, 4);
  });
  it('Bash timeout은 hold로 남고(최대 10분), 다음 호출에서 지워진다', () => {
    reset();
    hook('tool', tool('Bash', { description: 'mvn', timeout: 120000 })); assert.strictEqual(readState().mains[K1].hold, 120000);
    hook('tool', tool('Bash', { description: 'mvn', timeout: 99999999 })); assert.strictEqual(readState().mains[K1].hold, 600000);
    hook('tool', tool('Edit', { file_path: 'a.js', timeout: 5000 })); assert.strictEqual(readState().mains[K1].hold, undefined);
  });
  it('서브에이전트 안의 호출(agent_id)은 줄도 처리 수도 올리지 않는다', () => {
    reset();
    assert.strictEqual(hook('tool', tool('Bash', { description: 'x' }, { agent_id: 'a1', agent_type: 'qa-verifier' })).status, 0);
    assert.ok(noMains()); assert.strictEqual(readState().stats.mainOps, undefined);
  });
  it('agent_id가 없어도 알려진 agent_type·플러그인 에이전트는 서브에이전트로 본다', () => {
    reset();
    hook('tool', tool('Read', { file_path: 'a' }, { agent_type: 'frontend-dev-write' }));
    hook('tool', tool('Read', { file_path: 'a' }, { agent_type: 'pr-review-toolkit:code-reviewer' }));
    assert.ok(noMains()); assert.strictEqual(readState().stats.mainOps, undefined);
  });
  it('--agent로 띄운 메인(agent_type만 있고 MAP에 없음)은 메인으로 센다', () => {
    reset();
    hook('tool', tool('Read', { file_path: 'a' }, { agent_type: 'custom-main' }));
    assert.strictEqual(readState().stats.mainOps, 1);
  });
  it('여러 번 호출하면 증분하고, 세션이 둘이면 줄이 둘이다(동시 10건도 유실 없음)', async () => {
    reset();
    hook('tool', tool('Read', { file_path: 'a' })); hook('tool', tool('Read', { file_path: 'b' })); hook('tool', tool('Read', { file_path: 'c' }));
    let s = readState(); assert.strictEqual(s.mains[K1].n, 3); assert.strictEqual(s.stats.mainOps, 3);
    const codes = await Promise.all(Array.from({ length: 10 }, (_, i) => hookAsync('tool', tool('Read', { file_path: 'f' }, { session_id: i % 2 ? 'aaaaaa111111' : 'bbbbbb222222' }))));
    assert.ok(codes.every(c => c === 0));
    s = readState();
    assert.strictEqual(s.stats.mainOps, 13);
    assert.strictEqual(Object.keys(s.mains).length, 3);
    assert.strictEqual(s.mains.m_aaaaaa111111.n + s.mains.m_bbbbbb222222.n, 10);
  });
  it('세션 줄 건수는 날짜가 바뀐 뒤 첫 호출에서 0부터 센다', () => {
    reset({ mains: { [K1]: { st: 'idle', task: '', at: Date.now(), sid: 'abcdef', dir: 'x', n: 50, day: 19990101 } } });
    hook('tool', tool('Read', { file_path: 'a' }));
    assert.strictEqual(readState().mains[K1].n, 1);
  });
  it('session_id가 없거나 입력이 깨졌으면 exit 0이고 상태 불변', () => {
    reset();
    for (const input of ['', '{broken', JSON.stringify({ tool_name: 'Bash', tool_input: { description: 'x' } })]) {
      assert.strictEqual(hook('tool', input).status, 0);
    }
    assert.ok(noMains());
    assert.strictEqual(readState().stats.mainOps, undefined);
  });
});

describe('hook prompt·idle·session·end — 세션 줄 상태', () => {
  it('prompt: 일하는 중 + 지시 받음, coach.task는 그대로 기록', () => {
    reset();
    assert.strictEqual(hook('prompt', { session_id: S1, cwd: DIR, prompt: '  안녕   하세요 ' }).status, 0);
    const s = readState();
    assert.strictEqual(s.coach.task, '안녕 하세요'); assert.ok(Number.isFinite(s.coach.at));
    assert.strictEqual(s.mains[K1].st, 'work'); assert.strictEqual(s.mains[K1].task, '지시 받음: 안녕 하세요');
    assert.strictEqual(s.stats.mainOps, undefined);
  });
  it('prompt: 시스템 알림(<로 시작)은 줄도 coach도 건드리지 않는다', () => {
    reset();
    hook('prompt', { session_id: S1, cwd: DIR, prompt: '<task-notification>x</task-notification>' });
    assert.ok(noMains()); assert.strictEqual(readState().coach.task, '');
  });
  it('idle(Stop): 대기로 바뀌고 건수는 유지, coach.task 비움. 줄이 없던 세션도 대기 줄이 생긴다', () => {
    reset();
    hook('tool', tool('Read', { file_path: 'a' }));
    hook('idle', { session_id: S1, cwd: DIR });
    const m = readState().mains[K1];
    assert.strictEqual(m.st, 'idle'); assert.strictEqual(m.task, ''); assert.strictEqual(m.n, 1); assert.strictEqual(readState().coach.task, '');
    hook('idle', { session_id: 'zzzzzz999999', cwd: DIR });
    assert.strictEqual(readState().mains.m_zzzzzz999999.st, 'idle');
  });
  it('session: startup·clear·resume은 대기 줄을 만들고 compact는 만들지 않는다', () => {
    for (const src of ['startup', 'clear', 'resume']) {
      reset(); hook('session', { source: src, session_id: S1, cwd: DIR });
      assert.strictEqual(readState().mains[K1].st, 'idle', src);
    }
    reset(); hook('session', { source: 'compact', session_id: S1, cwd: DIR });
    assert.ok(noMains());
  });
  it('end(SessionEnd): 그 세션 줄만 지운다', () => {
    reset();
    hook('tool', tool('Read', { file_path: 'a' })); hook('tool', tool('Read', { file_path: 'a' }, { session_id: 'bbbbbb222222' }));
    hook('end', { session_id: S1 });
    assert.deepStrictEqual(Object.keys(readState().mains), ['m_bbbbbb222222']);
  });
});

describe('statefile 정리 — mains TTL·mainOps 날짜 초기화', () => {
  it('날짜가 바뀌면 stats(mainOps 포함)는 0부터, 신선한 세션 줄은 남는다', () => {
    reset({ stats: { laps: 5, since: 1000, mainOps: 9 }, mains: { m_old: { st: 'idle', task: '', at: Date.now(), sid: 'old000', dir: 'x', n: 3 } } });
    hook('idle', {});
    const s = readState();
    assert.strictEqual(s.stats.laps, 0); assert.strictEqual(s.stats.mainOps, undefined);
    assert.ok(s.mains.m_old);
  });
  it('마지막 신호가 60분 넘은 줄은 지우고 59분은 남긴다', () => {
    const now = Date.now();
    reset({ mains: { m_old: { st: 'work', at: now - 61 * 60e3 }, m_new: { st: 'work', at: now - 59 * 60e3 }, m_bad: 'x' } });
    hook('idle', {});
    assert.deepStrictEqual(Object.keys(readState().mains), ['m_new']);
  });
  it('잘못된 mainOps(음수·문자)는 버리고 정상 값은 같은 날 유지', () => {
    reset({ stats: { laps: 1, since: Date.now(), mainOps: -3 } }); hook('idle', {});
    assert.strictEqual(readState().stats.mainOps, undefined);
    reset({ stats: { laps: 1, since: Date.now(), mainOps: 'x' } }); hook('idle', {});
    assert.strictEqual(readState().stats.mainOps, undefined);
    reset({ stats: { laps: 1, since: Date.now(), mainOps: 7 } }); hook('idle', {});
    assert.strictEqual(readState().stats.mainOps, 7);
  });
});

describe('쓰기 에이전트 표시(w)', () => {
  it('dispatch·start가 frontend-dev-write·backend-dev-write에 w:1, 읽기 전용에는 w:0', () => {
    reset();
    hook('dispatch', { tool_name: 'Agent', tool_input: { subagent_type: 'frontend-dev-write', description: '패치' } });
    let ins = readState().agents.frontend.instances;
    assert.strictEqual(ins[Object.keys(ins)[0]].w, 1);
    hook('start', { agent_type: 'frontend-dev-write', agent_id: 'w1' });
    ins = readState().agents.frontend.instances;
    assert.strictEqual(Object.keys(ins).length, 1); assert.strictEqual(ins.w1.w, 1); assert.strictEqual(ins.w1.task, '패치');
    hook('start', { agent_type: 'frontend-dev', agent_id: 'r1' });
    assert.strictEqual(readState().agents.frontend.instances.r1.w, 0);
    hook('start', { agent_type: 'backend-dev-write', agent_id: 'b1' });
    assert.strictEqual(readState().agents.backend.instances.b1.w, 1);
  });
});

describe('MAP·WRITE 누락 대조(.claude/agents)', () => {
  const dir = path.join(SRC, '..', '.claude', 'agents');
  const names = () => fs.readdirSync(dir).filter(f => f.endsWith('.md') && f.toLowerCase() !== 'readme.md').map(f => f.slice(0, -3));
  const src = () => fs.readFileSync(path.join(SRC, 'hook.js'), 'utf8').replace(/\r\n/g, '\n');
  it('에이전트 정의 파일마다 hook.js MAP 키가 있다', { skip: !fs.existsSync(dir) }, () => {
    const blk = /const MAP = \{([\s\S]*?)\n\};/.exec(src()); assert.ok(blk);
    const keys = Array.from(blk[1].matchAll(/'([\w-]+)'\s*:\s*'[\w-]+'/g), m => m[1]);
    assert.deepStrictEqual(names().filter(n => !keys.includes(n)), []);
  });
  it('-write 에이전트는 모두 WRITE 집합에 있다', { skip: !fs.existsSync(dir) }, () => {
    const w = /const WRITE = new Set\(\[([^\]]*)\]\)/.exec(src()); assert.ok(w);
    const ws = Array.from(w[1].matchAll(/'([\w-]+)'/g), m => m[1]);
    assert.deepStrictEqual(names().filter(n => n.endsWith('-write') && !ws.includes(n)), []);
  });
});

describe('등록·연결 확인', () => {
  const settings = path.join(SRC, '..', '.claude', 'settings.json');
  it('settings.json: PreToolUse에 matcher 없는 tool 훅이 있고 Agent|Task dispatch·Edit|Write 가드는 그대로', { skip: !fs.existsSync(settings) }, () => {
    const h = JSON.parse(fs.readFileSync(settings, 'utf8')).hooks.PreToolUse;
    const cmds = e => e.hooks.map(x => x.command);
    assert.ok(h.some(e => !e.matcher && cmds(e).some(c => /agent-dashboard\/hook\.js" tool$/.test(c))));
    assert.ok(h.some(e => e.matcher === 'Agent|Task' && cmds(e).some(c => /hook\.js" dispatch$/.test(c))));
    assert.ok(h.some(e => /Edit\|Write/.test(e.matcher || '') && cmds(e).some(c => /write-guard\.js/.test(c))));
  });
  it('화면 연결: index.html #mains, app.js가 전광판·판·쓰기 표시를 쓰고 site.js도 taskOf를 쓴다', () => {
    const r = f => fs.readFileSync(path.join(SRC, f), 'utf8');
    assert.ok(/id="mains"/.test(r('index.html')));
    assert.ok(/mainBoardText\(mainRowsCache, coachTask\)/.test(r('app.js')));
    assert.ok(/drawMainOps\(\);/.test(r('app.js')));
    assert.ok(/mainOpsLbl/.test(r('app.js')) && /mainOpsLbl/.test(r('site.js')));
    assert.ok(/rs\.map\(taskOf\)/.test(r('app.js')) && /rs\.map\(taskOf\)/.test(r('site.js')));
  });
});

describe('fmt.js 메인 세션 줄 순수 함수', () => {
  const NOW = 1e12;
  it('agoLabel', () => {
    assert.strictEqual(F.agoLabel(-5), '방금'); assert.strictEqual(F.agoLabel(3000), '방금'); assert.strictEqual(F.agoLabel(NaN), '방금');
    assert.strictEqual(F.agoLabel(5000), '5초 전'); assert.strictEqual(F.agoLabel(59999), '59초 전');
    assert.strictEqual(F.agoLabel(60000), '1분 전'); assert.strictEqual(F.agoLabel(3599000), '59분 전'); assert.strictEqual(F.agoLabel(7200000), '2시간 전');
  });
  it('mainState: 대기·일함·멈춤? 경계(5분)', () => {
    assert.strictEqual(F.mainState({ st: 'idle', at: NOW - 9e6 }, NOW, false), 'idle');
    assert.strictEqual(F.mainState(null, NOW, false), 'idle');
    assert.strictEqual(F.mainState({ st: 'work', at: NOW - 4 * 60e3 }, NOW, false), 'work');
    assert.strictEqual(F.mainState({ st: 'work', at: NOW - F.MAIN_STALL_MS }, NOW, false), 'work');
    assert.strictEqual(F.mainState({ st: 'work', at: NOW - F.MAIN_STALL_MS - 1 }, NOW, false), 'stall');
    assert.strictEqual(F.mainState({ st: 'work', at: NOW - 10 * 60e3 }, NOW, true), 'work');
  });
  it('mainState: Bash hold(긴 시험)는 hold+30초까지 기다리고 10분으로 제한', () => {
    const m = { st: 'work', hold: 8 * 60e3 };
    assert.strictEqual(F.mainState({ ...m, at: NOW - 6 * 60e3 }, NOW, false), 'work');
    assert.strictEqual(F.mainState({ ...m, at: NOW - (8 * 60e3 + 3e4) - 1 }, NOW, false), 'stall');
    assert.strictEqual(F.mainState({ st: 'work', hold: 99e9, at: NOW - (6e5 + 3e4) - 1 }, NOW, false), 'stall');
  });
  const mains = {
    m_a: { st: 'idle', task: '', at: NOW - 1000, sid: 'aaaaaa', dir: 'web', n: 3 },
    m_b: { st: 'work', task: '파일 고치는 중: app.js', at: NOW - 20000, sid: 'bbbbbb', dir: 'GGReportAgent', n: 12 },
    m_c: { st: 'work', task: 'mvn 시험', at: NOW - 6 * 60e3, sid: 'cccccc', dir: 'wt', n: 1 },
    bad: null, m_d: 'x',
  };
  it('mainRows: 일하는 줄 먼저·최근 먼저, 문구·경과·건수, 깨진 항목 제외', () => {
    const r = F.mainRows(mains, NOW, false);
    assert.deepStrictEqual(r.map(x => x.key), ['m_b', 'm_c', 'm_a']);
    assert.strictEqual(r[0].name, 'GGReportAgent bbbbbb'); assert.strictEqual(r[0].st, 'work'); assert.strictEqual(r[0].text, '파일 고치는 중: app.js');
    assert.strictEqual(r[0].ago, '20초 전'); assert.strictEqual(r[0].n, 12);
    assert.strictEqual(r[1].st, 'stall'); assert.strictEqual(r[1].text, '멈춤? mvn 시험');
    assert.strictEqual(r[2].text, '대기');
    assert.strictEqual(F.mainRows(mains, NOW, true)[1].st, 'work');
  });
  it('mainRows: 잘못된 입력은 빈 목록, n이 이상하면 0', () => {
    for (const bad of [null, undefined, [], 'x', 5]) assert.deepStrictEqual(F.mainRows(bad, NOW, false), []);
    assert.strictEqual(F.mainRows({ k: { st: 'work', at: NOW, n: 'x' } }, NOW, false)[0].n, 0);
    assert.strictEqual(F.mainRows({ k: { st: 'work', at: NOW } }, NOW, false)[0].text, '작업 중');
  });
  it('mainBoardText: 일하는 세션 우선(+외 N세션), 없으면 마지막 지시, 둘 다 없으면 빈 문자열', () => {
    assert.strictEqual(F.mainBoardText(F.mainRows(mains, NOW, false), '지시'), 'bbbbbb 파일 고치는 중: app.js (외 1세션)');
    assert.strictEqual(F.mainBoardText(F.mainRows({ m_a: mains.m_a }, NOW, false), '지시'), '지시');
    assert.strictEqual(F.mainBoardText([], undefined), '');
    assert.strictEqual(F.mainBoardText(undefined, ''), '');
  });
});
