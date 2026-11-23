// 세션 시작 훅: 대시보드 서버가 안 떠 있으면 백그라운드로 띄우고 브라우저를 한 번 연다.
// 이미 떠 있으면(다른 세션이 띄운 경우) 그대로 쓴다 — 탭이 중복으로 열리지 않는다.
// 단, 떠 있는 서버가 서버 코드(serve.js·statefile.js)보다 먼저 켜진 옛 프로세스면 내리고 새로 띄운다(브라우저는 다시 열지 않음).
//   11-23 사례: 11-15에 켜진 서버가 허용 목록에 site.js가 없어 404 → 공사판 테마로 전환되지 않음.
// 내릴 대상은 응답이 알려 준 pid가 아니라 실제로 포트를 듣는 프로세스이고, 둘이 같을 때만 내린다(security 11-23).
// 브라우저를 열지 않으려면 환경변수 AGENT_DASH_NO_OPEN=1. 실패해도 항상 exit 0, 출력 없음.
const net = require('net'), http = require('http'), fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
const PORT = +process.env.AGENT_DASH_PORT || 8090;
const CODE = ['serve.js', 'statefile.js'];
const WIN = process.platform === 'win32', SYS32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'); // 명령은 절대경로로(현재 폴더의 같은 이름 실행 파일 방지)
const done = () => process.exit(0);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const okPid = n => Number.isInteger(n) && n > 0 && n !== process.pid && n !== process.ppid;

const samePath = (a, b) => { const x = path.resolve(a), y = path.resolve(b); return WIN ? x.toLowerCase() === y.toLowerCase() : x === y; };
const codeMtime = () => CODE.map(n => { try { return fs.statSync(path.join(__dirname, n)).mtimeMs; } catch (_) { return 0; } }).reduce((a, b) => Math.max(a, b), 0);

function get(p) { // localhost 서버에 GET — 실패·시간 초과는 null
  return new Promise(resolve => {
    const r = http.get({ host: '127.0.0.1', port: PORT, path: p, headers: { Host: 'localhost:' + PORT }, timeout: 800 }, res => {
      let b = ''; res.setEncoding('utf8'); res.on('data', d => { if (b.length < 4096) b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('timeout', () => { r.destroy(); resolve(null); });
    r.on('error', () => resolve(null));
  });
}

function portOpen() {
  return new Promise(resolve => {
    const s = net.connect(PORT, '127.0.0.1'); s.setTimeout(800);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('timeout', () => { s.destroy(); resolve(true); }); // 응답 없음 — 무언가 잡고 있다고 보고 건드리지 않는다
    s.on('error', () => resolve(false));
  });
}

function listenerPid() { // 127.0.0.1:PORT 를 듣는 프로세스 번호(못 찾으면 0)
  try {
    let pid = 0;
    if (WIN) {
      const out = execFileSync(path.join(SYS32, 'netstat.exe'), ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      const line = out.split(/\r?\n/).find(l => /LISTENING/i.test(l) && new RegExp('127\\.0\\.0\\.1:' + PORT + '\\s').test(l));
      pid = line ? +line.trim().split(/\s+/).pop() : 0;
    } else {
      pid = +execFileSync('lsof', ['-tiTCP:' + PORT, '-sTCP:LISTEN'], { encoding: 'utf8', timeout: 5000 }).trim().split(/\s+/)[0];
    }
    return okPid(pid) ? pid : 0;
  } catch (_) { return 0; }
}

function isNode(pid) { // 내리기 전 그 프로세스가 node인지(무관한 서비스 오인 종료 방지)
  try {
    const out = WIN
      ? execFileSync(path.join(SYS32, 'tasklist.exe'), ['/FI', 'PID eq ' + pid, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true, timeout: 5000 })
      : execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], { encoding: 'utf8', timeout: 5000 });
    return /(^|[\\/"])node(\.exe)?("|\s|$)/i.test(out.trim());
  } catch (_) { return false; }
}

// 떠 있는 서버를 판정: 'fresh'(그대로) | 'stale'(재기동, pid 포함) | 'foreign'(대시보드가 아니거나 판단 불가 — 건드리지 않는다)
async function inspect() {
  const s = await get('/api/server');
  if (s && s.status === 200) {
    let j = null; try { j = JSON.parse(s.body); } catch (_) {}
    if (!j || j.app !== 'agent-dashboard' || !okPid(j.pid) || !Number.isFinite(j.boot)) return { kind: 'foreign' };
    if (typeof j.root !== 'string' || !samePath(j.root, __dirname)) return { kind: 'foreign' }; // 다른 폴더(worktree 등)의 서버는 건드리지 않는다(qa 11-23 P2-1)
    const m = codeMtime();
    if (j.boot >= m || m > Date.now()) return { kind: 'fresh' }; // 미래 시각 파일이면 매 세션 재기동하지 않게(qa P3-1)
    const pid = listenerPid(); // 응답의 pid를 그대로 믿지 않는다 — 실제 포트 주인과 같을 때만
    return pid && pid === j.pid && isNode(pid) ? { kind: 'stale', pid } : { kind: 'foreign' };
  }
  if (s && s.status === 404) { // /api/server 이전의 대시보드 서버인지 /api/version(ms 시각 = 12자리 이상 숫자)·node 프로세스로 확인(qa P3-2)
    const v = await get('/api/version');
    if (v && v.status === 200 && /^\d{12,}(\.\d+)?$/.test(v.body.trim())) { const pid = listenerPid(); return pid && isNode(pid) ? { kind: 'stale', pid } : { kind: 'foreign' }; }
  }
  return { kind: 'foreign' };
}

function launch(openBrowser) {
  spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  if (!openBrowser || process.env.AGENT_DASH_NO_OPEN) return sleep(300);
  return sleep(1200).then(() => {
    const url = 'http://localhost:' + PORT + '/';
    try {
      if (WIN) spawn(process.env.ComSpec || path.join(SYS32, 'cmd.exe'), ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    } catch (_) {}
    return sleep(300);
  });
}

(async () => {
  try {
    if (!(await portOpen())) return await launch(true);
    const st = await inspect();
    if (st.kind !== 'stale' || !okPid(st.pid)) return;
    try { process.kill(st.pid); } catch (_) { return; } // 권한 없음·이미 종료 → 그대로 둔다
    for (let i = 0; i < 20 && await portOpen(); i++) await sleep(150); // 포트가 풀릴 때까지(최대 약 3초)
    if (await portOpen()) return; // 다른 세션이 먼저 다시 띄웠거나 아직 안 풀림 — 그쪽에 맡긴다
    await launch(false); // 열린 탭은 다시 연결되므로 브라우저는 새로 열지 않는다
  } catch (_) { /* 항상 조용히 끝낸다 */ }
})().then(done, done);
