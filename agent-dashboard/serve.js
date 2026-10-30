// serve.py의 Node 버전(Python이 없는 PC용). 실행: node agent-dashboard/serve.js [포트]
const http = require('http'), fs = require('fs'), path = require('path');
const store = require('./statefile');
const ROOT = __dirname, STATE = path.join(ROOT, 'state.json'), PORT = +process.argv[2] || 8090;
const IDS = ['designer', 'qa', 'frontend', 'backend', 'security', 'planner', 'pm', 'cleaner'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_BODY = 16 * 1024;
const ALLOW = new Set(['index.html', 'app.js', 'fmt.js', 'style.css', 'state.json']); // 정적 서빙 허용 목록(그 외·디렉터리는 404)
const HOST_OK = h => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h || '');
const merge = (b, p) => { for (const k in p) { if (BAD.has(k)) continue; if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) && b[k] && typeof b[k] === 'object') merge(b[k], p[k]); else b[k] = p[k]; } return b; };
if (!fs.existsSync(STATE)) fs.writeFileSync(STATE, JSON.stringify({ coach: { task: '' }, agents: Object.fromEntries(IDS.map(k => [k, { active: false, task: '' }])) }, null, 2));
store.update(() => {}); // 기존 state.json에 stats가 없으면 normalize가 채운다
http.createServer((req, res) => {
  if (!HOST_OK(req.headers.host)) { res.writeHead(403); return res.end('bad host'); }
  const url = req.url.split('?')[0];
  if (req.method === 'POST' && url === '/api/state') {
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) { res.writeHead(415); return res.end('json only'); }
    let body = '', big = false;
    req.on('data', d => { if (big) return; body += d; if (body.length > MAX_BODY) { big = true; res.writeHead(413); res.end('too large'); } });
    req.on('end', () => {
      if (big) return;
      try {
        const patch = JSON.parse(body); if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('object expected');
        store.update(cur => {
          if ('stats' in patch) { // stats는 같은 세션(since 일치)일 때만 받고, 값은 줄이지 않는다(여러 탭·지연 쓰기 대비)
            const st = patch.stats, cs = cur.stats;
            const ok = st && typeof st === 'object' && cs && Number.isFinite(st.laps) && st.laps >= 0 && st.laps <= Number.MAX_SAFE_INTEGER && st.since === cs.since;
            if (ok) patch.stats = { laps: Math.max(cs.laps || 0, Math.floor(st.laps)), since: cs.since }; else delete patch.stats;
          }
          merge(cur, patch);
        });
        res.writeHead(204); res.end();
      } catch (e) { res.writeHead(400); res.end(String(e.message)); }
    });
    return;
  }
  if (url === '/api/version') { // 화면 코드가 바뀌면 열린 탭이 스스로 새로고침하도록 파일 수정 시각을 알려 준다
    const v = ['index.html', 'app.js', 'fmt.js', 'style.css'].map(n => { try { return fs.statSync(path.join(ROOT, n)).mtimeMs; } catch (_) { return 0; } }).reduce((a, b) => Math.max(a, b), 0); // 브랜치 전환 등으로 파일이 잠깐 없어도 서버가 죽지 않게
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); return res.end(String(v));
  }
  let rel; try { rel = url === '/' ? 'index.html' : decodeURIComponent(url).replace(/^\//, ''); } catch (_) { res.writeHead(400); return res.end('bad url'); }
  const f = path.join(ROOT, rel);
  if (!ALLOW.has(rel) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  const rs = fs.createReadStream(f);
  rs.on('error', () => res.destroy()); // existsSync 이후 파일이 사라지는 경우
  rs.pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log('agent-dashboard: http://localhost:' + PORT));
