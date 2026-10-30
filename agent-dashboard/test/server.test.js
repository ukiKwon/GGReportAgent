// 서버·훅 자동 테스트. 실제 state.json을 건드리지 않도록 필요한 파일을 임시 폴더로 복사해 그 사본으로 돌린다.
// 실행: node --test agent-dashboard/test/   (Node 18+)
const test = require('node:test'), assert = require('node:assert');
const { describe, it, before, after } = test;
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), http = require('http');
const { spawn, spawnSync } = require('child_process');

const SRC = path.join(__dirname, '..');
const FILES = ['serve.js', 'statefile.js', 'hook.js', 'closing.js', 'index.html', 'app.js', 'fmt.js', 'style.css'];
const IDS = ['designer', 'qa', 'frontend', 'backend', 'security', 'planner', 'pm', 'cleaner'];
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

describe('hook session 모드', () => {
  for (const src of ['startup', 'clear']) {
    it(src + '는 stats를 리셋한다', () => {
      writeState({ laps: 7, since: 1000 });
      const r = hook('session', JSON.stringify({ source: src }));
      assert.strictEqual(r.status, 0);
      const s = readState().stats;
      assert.strictEqual(s.laps, 0);
      assert.ok(s.since > 1000);
    });
  }
  const UNCHANGED = [['resume', JSON.stringify({ source: 'resume' })], ['compact', JSON.stringify({ source: 'compact' })], ['빈 입력', ''], ['깨진 JSON', '{broken']];
  for (const [name, input] of UNCHANGED) {
    it(name + '은 stats 불변이고 exit 0', () => {
      writeState({ laps: 7, since: 1000 });
      const r = hook('session', input);
      assert.strictEqual(r.status, 0);
      assert.deepStrictEqual(readState().stats, { laps: 7, since: 1000 });
    });
  }
});

describe('서버 stats POST', () => {
  before(() => writeState({ laps: 5, since: 1000 }));
  it('정상 반영', async () => {
    assert.strictEqual((await postJson({ stats: { laps: 10, since: 1000 } })).status, 204);
    assert.deepStrictEqual(readState().stats, { laps: 10, since: 1000 });
  });
  it('값 감소는 무시', async () => {
    await postJson({ stats: { laps: 3, since: 1000 } });
    assert.strictEqual(readState().stats.laps, 10);
  });
  it('since 불일치는 무시', async () => {
    await postJson({ stats: { laps: 99, since: 999 } });
    assert.deepStrictEqual(readState().stats, { laps: 10, since: 1000 });
  });
  for (const bad of ['50', -1, null, true, {}]) {
    it('laps=' + JSON.stringify(bad) + '은 무시', async () => {
      await postJson({ stats: { laps: bad, since: 1000 } });
      assert.deepStrictEqual(readState().stats, { laps: 10, since: 1000 });
    });
  }
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

describe('정적 노출', () => {
  it('허용 파일은 200', async () => {
    for (const p of ['/', '/index.html', '/app.js', '/fmt.js', '/style.css', '/state.json', '/app.js?x=1']) {
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
