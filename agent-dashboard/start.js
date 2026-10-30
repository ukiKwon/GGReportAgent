// 세션 시작 훅: 대시보드 서버가 안 떠 있으면 백그라운드로 띄우고 브라우저를 한 번 연다.
// 이미 떠 있으면(다른 세션이 띄운 경우) 아무것도 하지 않는다 — 탭이 중복으로 열리지 않는다.
// 브라우저를 열지 않으려면 환경변수 AGENT_DASH_NO_OPEN=1. 실패해도 항상 exit 0, 출력 없음.
const net = require('net'), path = require('path'), { spawn } = require('child_process');
const PORT = +process.env.AGENT_DASH_PORT || 8090;
const done = () => process.exit(0);
const sock = net.connect(PORT, '127.0.0.1');
sock.setTimeout(800);
sock.on('connect', () => { sock.destroy(); done(); });
sock.on('timeout', () => { sock.destroy(); done(); });
sock.on('error', () => {
  try {
    spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    if (!process.env.AGENT_DASH_NO_OPEN) setTimeout(() => {
      const url = 'http://localhost:' + PORT + '/';
      try {
        if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
      } catch (_) {}
      setTimeout(done, 300);
    }, 1200);
    else setTimeout(done, 300);
  } catch (_) { done(); }
});
