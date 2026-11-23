// 서버·훅 자동 테스트. 실제 state.json을 건드리지 않도록 필요한 파일을 임시 폴더로 복사해 그 사본으로 돌린다.
// 실행: node --test agent-dashboard/test/   (Node 18+)
const test = require('node:test'), assert = require('node:assert');
const { describe, it, before, after } = test;
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), http = require('http');
const { spawn, spawnSync } = require('child_process');

const SRC = path.join(__dirname, '..');
const FILES = ['serve.js', 'statefile.js', 'hook.js', 'closing.js', 'index.html', 'app.js', 'fmt.js', 'site.js', 'style.css'];
const { IDS } = require('../statefile'); // 원본 한 곳
let tmp, port, child;

const stateFile = () => path.join(tmp, 'state.json');
const readState = () => JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
const writeState = stats => fs.writeFileSync(stateFile(), JSON.stringify({
  coach: { task: '' }, stats, agents: Object.fromEntries(IDS.map(k => [k, { active: false, task: '' }])),
}, null, 2));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

function req(method, p, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers }, res => {
      let b = ''; res.setEncoding('utf8'); res.on('data', d => b += d); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', reject);
    if (body !== undefined) r.write(body);
    r.end();
  });
}
const postJson = obj => req('POST', '/api/state', { headers: { 'Content-Type': 'application/json' }, body: typeof obj === 'string' ? obj : JSON.stringify(obj) });

function hook(mode, input) {
  return spawnSync(process.execPath, [path.join(tmp, 'hook.js'), mode], { input, encoding: 'utf8', timeout: 15000 });
}
function hookAsync(mode, obj) {
  return new Promise(resolve => {
    const c = spawn(process.execPath, [path.join(tmp, 'hook.js'), mode], { stdio: ['pipe', 'ignore', 'ignore'] });
    c.on('exit', code => resolve(code));
    c.stdin.end(JSON.stringify(obj));
  });
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agdash-'));
  for (const f of FILES) fs.copyFileSync(path.join(SRC, f), path.join(tmp, f));
  fs.writeFileSync(path.join(tmp, 'closing.log'), 'secret log\n');
  fs.mkdirSync(path.join(tmp, 'test'));
  fs.writeFileSync(path.join(tmp, 'test', 'x.js'), '// 하위 파일\n');
  // 프로브: 서버 프로세스의 Object.prototype 오염 여부를 /__probe로 확인(서버 코드는 수정하지 않는다)
  fs.writeFileSync(path.join(tmp, 'probe.js'),
    "const http=require('http');const o=http.createServer;http.createServer=function(h){return o.call(this,(q,s)=>{" +
    "if(q.url==='/__probe'){s.end(String(({}).polluted)+','+Object.prototype.hasOwnProperty.call(Object.prototype,'polluted'));return;}h(q,s);});};");
  writeState({ laps: 5, since: 1000 });
  port = await freePort();
  child = spawn(process.execPath, ['--require', path.join(tmp, 'probe.js'), path.join(tmp, 'serve.js'), String(port)], { cwd: tmp, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', c => reject(new Error('server exited ' + c)));
    child.stdout.on('data', d => { if (String(d).includes('agent-dashboard:')) resolve(); });
    setTimeout(() => reject(new Error('server start timeout')), 10000);
  });
  child.removeAllListeners('exit');
});

after(async () => {
  if (child) { const done = new Promise(r => child.once('exit', r)); child.kill(); await done; }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { console.warn('임시 폴더 정리 실패(수동 삭제 필요):', tmp, e.code); }
});

const T0 = Date.now(); // 오늘(누적은 하루 유지 — 날짜가 바뀌어야 리셋, 11-16)
describe('hook session 모드', () => {
  for (const src of ['startup', 'clear']) {
    it(src + '는 같은 날이면 stats를 유지한다', () => {
      writeState({ laps: 7, since: T0 });
      const r = hook('session', JSON.stringify({ source: src }));
      assert.strictEqual(r.status, 0);
      assert.deepStrictEqual(readState().stats, { laps: 7, since: T0 });
    });
    it(src + '는 날짜가 지난 stats를 리셋한다', () => {
      writeState({ laps: 7, since: 1000, agents: { qa: { lapF: 3, freshAt: 0 } } });
      const r = hook('session', JSON.stringify({ source: src }));
      assert.strictEqual(r.status, 0);
      const s = readState().stats;
      assert.strictEqual(s.laps, 0);
      assert.ok(s.since > 1000);
      assert.strictEqual(s.agents, undefined);
    });
  }
  const UNCHANGED = [['resume', JSON.stringify({ source: 'resume' })], ['compact', JSON.stringify({ source: 'compact' })], ['빈 입력', ''], ['깨진 JSON', '{broken']];
  for (const [name, input] of UNCHANGED) {
    it(name + '은 stats 불변이고 exit 0', () => {
      writeState({ laps: 7, since: T0 });
      const r = hook('session', input);
      assert.strictEqual(r.status, 0);
      assert.deepStrictEqual(readState().stats, { laps: 7, since: T0 });
    });
  }
});

describe('서버 stats POST', () => {
  before(() => writeState({ laps: 5, since: T0 }));
  it('정상 반영', async () => {
    assert.strictEqual((await postJson({ stats: { laps: 10, since: T0 } })).status, 204);
    assert.deepStrictEqual(readState().stats, { laps: 10, since: T0 });
  });
  it('값 감소는 무시', async () => {
    await postJson({ stats: { laps: 3, since: T0 } });
    assert.strictEqual(readState().stats.laps, 10);
  });
  it('since 불일치는 무시', async () => {
    await postJson({ stats: { laps: 99, since: T0 - 1 } });
    assert.deepStrictEqual(readState().stats, { laps: 10, since: T0 });
  });
  for (const bad of ['50', -1, null, true, {}]) {
    it('laps=' + JSON.stringify(bad) + '은 무시', async () => {
      await postJson({ stats: { laps: bad, since: T0 } });
      assert.deepStrictEqual(readState().stats, { laps: 10, since: T0 });
    });
  }
  it('에이전트별 진행(agents)은 저장되고 줄어들지 않는다(하루 유지)', async () => {
    await postJson({ stats: { laps: 10, since: T0, agents: { qa: { lapF: 2.5, freshAt: 1 }, backend_2: { lapF: 1.25, freshAt: 0 } } } });
    assert.deepStrictEqual(readState().stats.agents, { qa: { lapF: 2.5, freshAt: 1 }, backend_2: { lapF: 1.25, freshAt: 0 } });
    await postJson({ stats: { laps: 10, since: T0, agents: { qa: { lapF: 1, freshAt: 0 } } } });
    assert.strictEqual(readState().stats.agents.qa.lapF, 2.5);
  });
  it('agents의 잘못된 키·값은 버린다', async () => {
    await postJson({ stats: { laps: 10, since: T0, agents: { __proto__x: { lapF: 9 }, cleaner: { lapF: 9 }, qa_10: { lapF: 9 }, pm: { lapF: -1 }, planner: { lapF: '9' }, designer: { lapF: 3, freshAt: 9 }, auditor: [1] } } });
    const ag = readState().stats.agents;
    assert.deepStrictEqual(Object.keys(ag).sort(), ['backend_2', 'qa']);
  });
  it('날짜가 지난 stats는 다음 쓰기 때 0부터', async () => {
    writeState({ laps: 50, since: 1000, agents: { qa: { lapF: 5, freshAt: 0 } } });
    await postJson({ coach: { task: 'x' } });
    const s = readState().stats;
    assert.strictEqual(s.laps, 0); assert.ok(s.since > 1000); assert.strictEqual(s.agents, undefined);
    writeState({ laps: 10, since: T0 });
  });
  it('text/plain은 415', async () => {
    assert.strictEqual((await req('POST', '/api/state', { headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  });
  it('16KB 초과는 413이고 상태 불변', async () => {
    let status;
    try { status = (await postJson('{"coach":{"task":"' + 'a'.repeat(17000) + '"}}')).status; }
    catch (e) { status = e.code === 'ECONNRESET' || e.code === 'EPIPE' ? 413 : -1; } // 서버가 413을 먼저 보내고 연결을 끊는 경우
    assert.strictEqual(status, 413);
    assert.strictEqual(readState().coach.task, ''); // 상태가 바뀌지 않았다
  });
  it('Host 변조는 403', async () => {
    assert.strictEqual((await req('POST', '/api/state', { headers: { Host: 'evil.com', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.strictEqual((await req('GET', '/', { headers: { Host: 'evil.com' } })).status, 403);
  });
  it('__proto__·constructor 키가 Object.prototype을 오염시키지 않는다', async () => {
    await postJson('{"__proto__":{"polluted":"yes"}}');
    await postJson('{"agents":{"__proto__":{"polluted":"yes"}}}');
    await postJson('{"coach":{"constructor":{"prototype":{"polluted":"yes"}}}}');
    const probe = await req('GET', '/__probe');
    assert.strictEqual(probe.body, 'undefined,false');
  });
});

describe('HTTP 메서드 405/501 (NEXT 31)', () => {
  const rawReq = (method, p, headers = {}) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers }, res => {
      let b = ''; res.setEncoding('utf8'); res.on('data', d => b += d); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    r.on('error', reject); r.end();
  });
  it('/api/state는 POST 외 메서드가 405 + Allow: POST이고 상태는 그대로다', async () => {
    writeState({ laps: 5, since: 1000 });
    const before = fs.readFileSync(stateFile(), 'utf8');
    for (const m of ['GET', 'HEAD', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      const r = await rawReq(m, '/api/state', { 'Content-Type': 'application/json' });
      assert.strictEqual(r.status, 405, m); assert.strictEqual(r.headers.allow, 'POST', m);
    }
    assert.strictEqual(fs.readFileSync(stateFile(), 'utf8'), before);
  });
  it('정적 파일·/api/version·없는 경로도 쓰기·OPTIONS는 405 + Allow: GET, HEAD', async () => {
    for (const p of ['/', '/app.js', '/state.json', '/api/version', '/nope', '/closing.log']) {
      for (const m of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
        const r = await rawReq(m, p);
        assert.strictEqual(r.status, 405, m + ' ' + p); assert.strictEqual(r.headers.allow, 'GET, HEAD', m + ' ' + p);
      }
    }
  });
  it('TRACE·쿼리 붙은 경로도 같은 규칙(qa 11-16)', async () => {
    let r = await rawReq('TRACE', '/app.js');
    assert.strictEqual(r.status, 405); assert.strictEqual(r.headers.allow, 'GET, HEAD');
    r = await rawReq('GET', '/api/state?x=1');
    assert.strictEqual(r.status, 405); assert.strictEqual(r.headers.allow, 'POST');
    r = await rawReq('PUT', '/api/version?x=1');
    assert.strictEqual(r.status, 405); assert.strictEqual(r.headers.allow, 'GET, HEAD');
  });
  it('GET·HEAD는 영향 없다(정적 200·없는 파일 404)', async () => {
    assert.strictEqual((await rawReq('GET', '/app.js')).status, 200);
    assert.strictEqual((await rawReq('HEAD', '/api/version')).status, 200);
    assert.strictEqual((await rawReq('GET', '/closing.log')).status, 404);
  });
  it('파서는 알지만 지원하지 않는 메서드(PROPFIND·PURGE)는 501이다', async () => {
    for (const m of ['PROPFIND', 'PURGE']) {
      for (const p of ['/', '/api/state', '/api/questions', '/api/version']) {
        assert.strictEqual((await rawReq(m, p)).status, 501, m + ' ' + p);
      }
    }
  });
  it('Host 변조는 메서드보다 먼저 403이다', async () => {
    for (const m of ['PUT', 'OPTIONS', 'PROPFIND']) {
      assert.strictEqual((await rawReq(m, '/app.js', { Host: 'evil.com' })).status, 403, m);
    }
  });
  it('거부된 요청 뒤에도 서버가 살아 있고 POST /api/state는 정상이다', async () => {
    assert.strictEqual((await postJson({ coach: { task: '' } })).status, 204);
    assert.strictEqual((await rawReq('GET', '/')).status, 200);
  });
});

describe('정적 노출', () => {
  it('허용 파일은 200', async () => {
    for (const p of ['/', '/index.html', '/app.js', '/fmt.js', '/site.js', '/style.css', '/state.json', '/app.js?x=1']) {
      assert.strictEqual((await req('GET', p)).status, 200, p);
    }
  });
  it('closing.log·hook.js·closing.js 등 그 외 파일은 404', async () => {
    for (const p of ['/closing.log', '/hook.js', '/closing.js', '/statefile.js', '/serve.js', '/probe.js', '/favicon.ico', '/test/', '/test', '/test/x.js', '/%2e%2e/README.md', '/../README.md', '/closing%2Elog']) {
      assert.strictEqual((await req('GET', p)).status, 404, p);
    }
  });
  it('state.json.lock은 파일이 실제로 있어도 404', async () => {
    const lock = path.join(tmp, 'state.json.lock');
    fs.writeFileSync(lock, '');
    try { assert.strictEqual((await req('GET', '/state.json.lock')).status, 404); }
    finally { fs.unlinkSync(lock); }
  });
  it('경로 우회 변형(대소문자·끝 슬래시·NUL·공백·역슬래시·점 세그먼트)은 모두 404', async () => {
    for (const p of ['/APP.JS', '/app.js/', '/app.js%00', '//app.js', '/\\app.js', '/%5Capp.js', '/./app.js', '/%2e/app.js', '/app.js%20', '/Index.html']) {
      assert.strictEqual((await req('GET', p)).status, 404, p);
    }
  });
  it('퍼센트 인코딩된 허용 파일명은 같은 파일이라 200', async () => {
    assert.strictEqual((await req('GET', '/%61pp.js')).status, 200);
  });
  it('HEAD: 허용 파일은 200이고 본문 없음, 비허용은 404', async () => {
    const ok = await req('HEAD', '/app.js');
    assert.strictEqual(ok.status, 200); assert.strictEqual(ok.body, '');
    assert.strictEqual((await req('HEAD', '/closing.log')).status, 404);
  });
  it('/api/version은 숫자 문자열이고, 화면 파일이 잠깐 없어도 서버가 살아 있다', async () => {
    const v = await req('GET', '/api/version');
    assert.strictEqual(v.status, 200); assert.ok(Number.isFinite(Number(v.body)));
    const f = path.join(tmp, 'fmt.js'), bak = f + '.bak';
    fs.renameSync(f, bak);
    try { assert.strictEqual((await req('GET', '/api/version')).status, 200); assert.strictEqual((await req('GET', '/')).status, 200); }
    finally { fs.renameSync(bak, f); }
  });
  it('/state.json은 JSON이고 no-store', async () => {
    const r = await new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port, path: '/state.json' }, res => { res.resume(); resolve(res.headers); }).on('error', reject));
    assert.match(r['content-type'], /application\/json/);
    assert.strictEqual(r['cache-control'], 'no-store');
  });
  it('잘못된 퍼센트 인코딩은 400이고 서버는 살아 있다', async () => {
    assert.strictEqual((await req('GET', '/%E0%A4%A')).status, 400);
    assert.strictEqual((await req('GET', '/')).status, 200);
  });
});

describe('인스턴스 hook', () => {
  it('같은 agent_type 동시 start 10개가 모두 기록되고 stop 뒤 active=false', async () => {
    writeState({ laps: 0, since: 1000 });
    const ids = Array.from({ length: 10 }, (_, i) => 'inst-' + i);
    const codes = await Promise.all(ids.map(id => hookAsync('start', { agent_type: 'qa-verifier', agent_id: id })));
    assert.ok(codes.every(c => c === 0));
    let qa = readState().agents.qa;
    assert.strictEqual(Object.keys(qa.instances).length, 10);
    assert.strictEqual(qa.active, true);
    await Promise.all(ids.map(id => hookAsync('stop', { agent_type: 'qa-verifier', agent_id: id })));
    qa = readState().agents.qa;
    assert.strictEqual(Object.keys(qa.instances).length, 0);
    assert.strictEqual(qa.active, false);
  });
});

// ── id 일치: hook.js MAP 값 = app.js AGENTS id ∪ {CLEANER id} = serve.js IDS ──
// app.js는 브라우저 전용이라 require하지 않고 소스 텍스트에서 뽑는다. Windows CRLF에 대비해 먼저 \r\n을 \n으로 바꾼다.
const readSrc = f => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n/g, '\n');
const uniqSorted = a => Array.from(new Set(a)).sort();
const allMatches = (re, text) => Array.from(text.matchAll(re), m => m[1]);

describe('id 일치(hook.js · app.js · serve.js)', () => {
  const hookIds = () => {
    const blk = /const MAP = \{([\s\S]*?)\n\};/.exec(readSrc('hook.js'));
    assert.ok(blk, 'hook.js에서 MAP 블록을 찾지 못함');
    return allMatches(/'[\w-]+'\s*:\s*'([\w-]+)'/g, blk[1]); // 'design-reviewer': 'designer' 의 값 쪽
  };
  const appAgentIds = () => {
    const blk = /const AGENTS = \[([\s\S]*?)\n\];/.exec(readSrc('app.js'));
    assert.ok(blk, 'app.js에서 AGENTS 블록을 찾지 못함');
    return allMatches(/\{\s*id:\s*'([\w-]+)'/g, blk[1]);
  };
  const appCleanerId = () => {
    const m = /const CLEANER = \{\s*id:\s*'([\w-]+)'/.exec(readSrc('app.js'));
    assert.ok(m, 'app.js에서 CLEANER 상수를 찾지 못함');
    return m[1];
  };
  const serveIds = () => {
    assert.ok(/const IDS = store\.IDS;/.test(readSrc('serve.js')), 'serve.js가 statefile IDS를 쓰지 않음');
    return IDS;
  };

  it('app.js의 청소부 id는 cleaner이고 AGENTS에는 없다', () => {
    assert.strictEqual(appCleanerId(), 'cleaner');
    assert.ok(!appAgentIds().includes('cleaner'));
  });
  it('hook.js MAP 값 집합 = app.js AGENTS id ∪ {cleaner}', () => {
    const agents = appAgentIds();
    assert.strictEqual(new Set(agents).size, agents.length, 'AGENTS id 중복');
    assert.deepStrictEqual(uniqSorted(hookIds()), uniqSorted([...agents, appCleanerId()]));
  });
  it('serve.js IDS도 같은 집합이다', () => {
    assert.deepStrictEqual(uniqSorted(serveIds()), uniqSorted([...appAgentIds(), appCleanerId()]));
    assert.deepStrictEqual(uniqSorted(serveIds()), uniqSorted(hookIds()));
  });
});

describe('인스턴스 hook — data-auditor', () => {
  it("agent_type 'data-auditor' start는 agents.auditor.instances를 만들고 stop이 지운다", () => {
    writeState({ laps: 0, since: 1000 });
    assert.strictEqual(hook('start', JSON.stringify({ agent_type: 'data-auditor', agent_id: 'aud-1' })).status, 0);
    let a = readState().agents.auditor;
    assert.ok(a.instances && a.instances['aud-1'], 'auditor 인스턴스가 기록되어야 함');
    assert.strictEqual(a.active, true);
    assert.strictEqual(hook('stop', JSON.stringify({ agent_type: 'data-auditor', agent_id: 'aud-1' })).status, 0);
    a = readState().agents.auditor;
    assert.strictEqual(Object.keys(a.instances).length, 0);
    assert.strictEqual(a.active, false);
  });
});

// ── 끝난 인스턴스 30초 유지(done): 진행 중 판정(active)에는 들어가지 않고, 30초 뒤 정리된다 ──
describe('done 유지(방금 끝남)', () => {
  it('start 후 stop하면 instances 0개·active=false이고 done에 기록된다', () => {
    writeState({ laps: 0, since: 1000 });
    hook('start', JSON.stringify({ agent_type: 'planner', agent_id: 'd1' }));
    hook('stop', JSON.stringify({ agent_type: 'planner', agent_id: 'd1' }));
    const a = readState().agents.planner;
    assert.strictEqual(Object.keys(a.instances).length, 0);
    assert.strictEqual(a.active, false);
    assert.ok(a.done && a.done.d1 && Number.isFinite(a.done.d1.doneAt));
  });
  it('doneAt이 31초 전이면 다음 갱신에서 정리된다', () => {
    const s = readState(); s.agents.planner.done = { d1: { task: 'x', since: 1, doneAt: Date.now() - 31000 } };
    fs.writeFileSync(stateFile(), JSON.stringify(s));
    hook('idle', '{}');
    assert.strictEqual(readState().agents.planner.done, undefined);
  });
  it('같은 역할 2개 중 1개만 stop하면 active=true 유지, done 1건', () => {
    writeState({ laps: 0, since: 1000 });
    hook('start', JSON.stringify({ agent_type: 'qa-verifier', agent_id: 'q1' }));
    hook('start', JSON.stringify({ agent_type: 'qa-verifier', agent_id: 'q2' }));
    hook('stop', JSON.stringify({ agent_type: 'qa-verifier', agent_id: 'q1' }));
    const a = readState().agents.qa;
    assert.strictEqual(a.active, true);
    assert.strictEqual(Object.keys(a.instances).length, 1);
    assert.strictEqual(Object.keys(a.done).length, 1);
  });
  it('agent_id 없는 stop은 가장 오래된 인스턴스를 done으로 옮기고, 인스턴스가 없으면 아무 일도 없다', () => {
    writeState({ laps: 0, since: 1000 });
    hook('start', JSON.stringify({ agent_type: 'pm', agent_id: 'p1' }));
    hook('stop', JSON.stringify({ agent_type: 'pm' }));
    assert.strictEqual(Object.keys(readState().agents.pm.done).length, 1);
    hook('stop', JSON.stringify({ agent_type: 'pm' }));
    assert.strictEqual(Object.keys(readState().agents.pm.done).length, 1);
  });
  it('app.js DONE_MS와 statefile.js DONE_TTL 값이 같다', () => {
    const a = readSrc('app.js').match(/const DONE_MS = (\d+) \* 1000/), s = readSrc('statefile.js').match(/const DONE_TTL = (\d+) \* 1000/);
    assert.ok(a && s && a[1] === s[1]);
  });
});

// ── /api/questions: handoff/questions.json(ROOT/../handoff)을 읽는 읽기 전용 API. 부모 폴더가 달라야 해서 base/agent-dashboard + base/handoff 구조로 따로 띄운다 ──
describe('/api/questions', () => {
  let base, qport, qchild;
  const qfile = () => path.join(base, 'handoff', 'questions.json');
  const qreq = (method, p, headers = {}) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: qport, method, path: p, headers }, res => {
      let b = ''; res.setEncoding('utf8'); res.on('data', d => b += d); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    r.on('error', reject); r.end();
  });
  before(async () => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'agdash-q-'));
    const dash = path.join(base, 'agent-dashboard'); fs.mkdirSync(dash); fs.mkdirSync(path.join(base, 'handoff'));
    for (const f of FILES) fs.copyFileSync(path.join(SRC, f), path.join(dash, f));
    qport = await freePort();
    qchild = spawn(process.execPath, [path.join(dash, 'serve.js'), String(qport)], { cwd: dash, stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((resolve, reject) => {
      qchild.on('error', reject);
      qchild.stdout.on('data', d => { if (String(d).includes('agent-dashboard:')) resolve(); });
      setTimeout(() => reject(new Error('server start timeout')), 10000);
    });
  });
  after(async () => {
    if (qchild) { const done = new Promise(r => qchild.once('exit', r)); qchild.kill(); await done; }
    try { fs.rmSync(base, { recursive: true, force: true }); } catch (_) {}
  });

  it('정상 파일은 200·JSON·no-store로 questions를 돌려준다', async () => {
    fs.writeFileSync(qfile(), JSON.stringify({ questions: [{ id: 'Q-1', summary: '요약', status: 'open', next: [72] }, 'x', null] }));
    const r = await qreq('GET', '/api/questions?x=1');
    assert.strictEqual(r.status, 200);
    assert.match(r.headers['content-type'], /application\/json/);
    assert.strictEqual(r.headers['cache-control'], 'no-store');
    const j = JSON.parse(r.body);
    assert.strictEqual(j.error, undefined);
    assert.deepStrictEqual(j.questions, [{ id: 'Q-1', summary: '요약', status: 'open', next: [72] }]); // 객체 아닌 항목은 걸러진다
  });
  it('파일이 없으면 200 + 빈 목록 + error', async () => {
    fs.rmSync(qfile(), { force: true });
    const r = await qreq('GET', '/api/questions');
    assert.strictEqual(r.status, 200);
    const j = JSON.parse(r.body);
    assert.deepStrictEqual(j.questions, []); assert.ok(j.error);
    assert.ok(!r.body.includes(base), '오류에 경로가 실리면 안 된다');
  });
  it('깨진 JSON·형식 불일치는 200 + 빈 목록 + error', async () => {
    for (const txt of ['{broken', '[]', '{"questions":"x"}', '']) {
      fs.writeFileSync(qfile(), txt);
      const r = await qreq('GET', '/api/questions');
      assert.strictEqual(r.status, 200, txt);
      const j = JSON.parse(r.body); assert.deepStrictEqual(j.questions, [], txt); assert.ok(j.error, txt);
    }
  });
  it('256KB 초과는 200 + 빈 목록 + error(본문을 읽지 않는다)', async () => {
    fs.writeFileSync(qfile(), '{"questions":[{"summary":"' + 'a'.repeat(260 * 1024) + '"}]}');
    const j = JSON.parse((await qreq('GET', '/api/questions')).body);
    assert.deepStrictEqual(j.questions, []); assert.ok(j.error);
  });
  it('UTF-8 BOM이 있어도 읽힌다(Windows 편집기 대비)', async () => {
    fs.writeFileSync(qfile(), '﻿{"questions":[{"id":"Q-2"}]}');
    assert.strictEqual(JSON.parse((await qreq('GET', '/api/questions')).body).questions.length, 1);
  });
  it('POST·PUT·DELETE는 405이고 파일은 그대로다', async () => {
    fs.writeFileSync(qfile(), '{"questions":[]}');
    for (const m of ['POST', 'PUT', 'DELETE']) {
      const r = await qreq(m, '/api/questions', { 'Content-Type': 'application/json' });
      assert.strictEqual(r.status, 405, m); assert.match(r.headers.allow, /GET/);
    }
    assert.strictEqual(fs.readFileSync(qfile(), 'utf8'), '{"questions":[]}');
  });
  it('Host 변조는 403, HEAD는 200이고 본문 없음', async () => {
    assert.strictEqual((await qreq('GET', '/api/questions', { Host: 'evil.com' })).status, 403);
    const h = await qreq('HEAD', '/api/questions');
    assert.strictEqual(h.status, 200); assert.strictEqual(h.body, '');
  });
  it('/handoff/questions.json 직접 접근은 404(정적 허용 목록 밖)', async () => {
    assert.strictEqual((await qreq('GET', '/handoff/questions.json')).status, 404);
    assert.strictEqual((await qreq('GET', '/../handoff/questions.json')).status, 404);
  });
});

describe('start.js — 옛 서버 재기동(11-23 site.js 404 사례)', () => {
  let dir, sport, first;
  const sget = p => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: sport, path: p }, res => { let b = ''; res.on('data', d => b += d); res.on('end', () => resolve({ status: res.statusCode, body: b })); }).on('error', reject);
  });
  const info = async () => JSON.parse((await sget('/api/server')).body);
  const runStart = (d = dir) => spawnSync(process.execPath, [path.join(d, 'start.js')], { env: Object.assign({}, process.env, { AGENT_DASH_PORT: String(sport), AGENT_DASH_NO_OPEN: '1' }), timeout: 30000 });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitUp = async () => { for (let i = 0; i < 50; i++) { try { const j = await info(); if (j.pid) return j; } catch (_) { /* 아직 */ } await sleep(100); } throw new Error('server not up'); };
  const alive = pid => { try { process.kill(pid, 0); return true; } catch (_) { return false; } };
  const fake = (name, src) => { const f = path.join(dir, name); fs.writeFileSync(f, src); const c = spawn(process.execPath, [f, String(sport)], { stdio: ['ignore', 'pipe', 'ignore'] }); return new Promise(r => c.stdout.once('data', () => r(c))); };
  const fakeSrc = (server, version) => "require('http').createServer((q,s)=>{const u=q.url;" +
    "if(u==='/api/server'){" + (server ? "s.writeHead(200);return s.end(" + JSON.stringify(server) + ");" : "s.writeHead(404);return s.end('not found');") + "}" +
    "if(u==='/api/version'){s.writeHead(200);return s.end(" + JSON.stringify(version) + ");}s.writeHead(404);s.end();})" +
    ".listen(+process.argv[2],'127.0.0.1',()=>console.log('up'));";
  const killServer = async () => { try { process.kill((await info()).pid); } catch (_) { /* 없음 */ } for (let i = 0; i < 30; i++) { try { await info(); await sleep(100); } catch (_) { return; } } };
  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agdash-start-'));
    for (const f of ['serve.js', 'statefile.js', 'start.js']) fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
    sport = await freePort();
    assert.strictEqual(runStart().status, 0); // 포트가 비어 있으면 띄운다(첫 기동 경로)
    first = await waitUp();
  });
  after(async () => {
    await killServer();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* 잠긴 파일은 OS가 정리 */ }
  });
  it('/api/server는 app·pid·boot·root를 준다', () => {
    assert.strictEqual(first.app, 'agent-dashboard'); assert.ok(Number.isInteger(first.pid)); assert.ok(Number.isFinite(first.boot));
    assert.strictEqual(path.resolve(first.root).toLowerCase(), path.resolve(dir).toLowerCase());
  });
  it('서버 코드보다 나중에 켜진 서버는 그대로 둔다', async () => {
    assert.strictEqual(runStart().status, 0);
    assert.strictEqual((await info()).pid, first.pid);
  });
  it('다른 폴더(worktree 등)의 start.js는 떠 있는 서버를 건드리지 않는다(qa P2-1)', async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'agdash-wt-'));
    try {
      for (const f of ['serve.js', 'statefile.js', 'start.js']) fs.copyFileSync(path.join(SRC, f), path.join(other, f));
      assert.strictEqual(runStart(other).status, 0);
      assert.strictEqual((await info()).pid, first.pid);
    } finally { fs.rmSync(other, { recursive: true, force: true }); }
  });
  it('미래 시각 파일이면 재기동하지 않는다(qa P3-1)', async () => {
    const f = path.join(dir, 'statefile.js'), st = fs.statSync(f), t = new Date(Date.now() + 3600000);
    fs.utimesSync(f, t, t);
    try { assert.strictEqual(runStart().status, 0); assert.strictEqual((await info()).pid, first.pid); }
    finally { fs.utimesSync(f, st.atime, st.mtime); }
  });
  it('서버 코드(statefile.js 포함)가 기동 뒤에 바뀌었으면 내리고 새로 띄운다', async () => {
    const t = new Date(); fs.utimesSync(path.join(dir, 'statefile.js'), t, t);
    assert.strictEqual(runStart().status, 0);
    const now = await waitUp();
    assert.notStrictEqual(now.pid, first.pid); assert.ok(!alive(first.pid));
    assert.ok(now.boot > first.boot);
  });
  it('/api/server가 없는 옛 대시보드(/api/version = ms 시각)는 내리고 새로 띄운다', async () => {
    await killServer();
    const c = await fake('old.js', fakeSrc(null, '1795443525956.5'));
    assert.strictEqual(runStart().status, 0);
    const now = await waitUp();
    assert.strictEqual(now.app, 'agent-dashboard'); assert.ok(!alive(c.pid));
  });
  for (const [name, server, version] of [
    ['/api/version이 짧은 숫자(다른 앱의 버전)', null, '2.0'],
    ['/api/version이 숫자가 아님(serve.py 등)', null, 'ok'],
    ['/api/server의 app이 다름', JSON.stringify({ app: 'other', pid: 1, boot: 0 }), '1795443525956'],
    ['/api/server의 pid가 실제 포트 주인과 다름', JSON.stringify({ app: 'agent-dashboard', pid: 4, boot: 0, root: '' }), '1795443525956'],
  ]) {
    it('대시보드라 확신할 수 없으면 건드리지 않는다 — ' + name, async () => {
      await killServer();
      const c = await fake('other.js', fakeSrc(server, version));
      try { assert.strictEqual(runStart().status, 0); assert.ok(alive(c.pid)); }
      finally { const d = new Promise(r => c.once('exit', r)); c.kill(); await d; }
    });
  }
});
