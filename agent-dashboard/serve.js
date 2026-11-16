// serve.py의 Node 버전(Python이 없는 PC용). 실행: node agent-dashboard/serve.js [포트]
const http = require('http'), fs = require('fs'), path = require('path');
const store = require('./statefile');
const ROOT = __dirname, STATE = path.join(ROOT, 'state.json'), PORT = +process.argv[2] || 8090;
const IDS = store.IDS;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_BODY = 16 * 1024;
const ALLOW = new Set(['index.html', 'app.js', 'fmt.js', 'site.js', 'style.css', 'state.json']); // 정적 서빙 허용 목록(그 외·디렉터리는 404)
const HOST_OK = h => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h || '');
// 이 밖은 501(NEXT 31). CONNECT 는 Node 가 'connect' 이벤트로 넘겨 여기 오지 않고(받는 곳이 없어 연결 종료),
// Node 파서가 모르는 이름(FOO 등)은 핸들러 전에 400 — 501 은 PROPFIND 처럼 파서는 알지만 안 쓰는 메서드에만 나온다.
const KNOWN_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'TRACE']);
const notAllowed = (res, allow) => { res.writeHead(405, { Allow: allow }); res.end('method not allowed'); };
const QFILE = path.join(ROOT, '..', 'handoff', 'questions.json'), MAX_Q = 256 * 1024; // 고정 경로(요청 값으로 경로를 만들지 않는다)
const readQuestions = () => { // 어떤 실패도 {questions:[],error}로 — 대시보드가 죽지 않게. 오류 문구에는 경로·예외 내용을 싣지 않는다
  try {
    const st = fs.statSync(QFILE);
    if (!st.isFile()) return { questions: [], error: 'questions.json not found' };
    if (st.size > MAX_Q) return { questions: [], error: 'questions.json too large' };
    const j = JSON.parse(fs.readFileSync(QFILE, 'utf8').replace(/^﻿/, ''));
    if (!j || typeof j !== 'object' || !Array.isArray(j.questions)) return { questions: [], error: 'questions.json bad format' };
    return { questions: j.questions.filter(q => q && typeof q === 'object' && !Array.isArray(q)) };
  } catch (e) { return { questions: [], error: e && e.code === 'ENOENT' ? 'questions.json not found' : 'questions.json unreadable' }; }
};
const merge = (b, p) => { for (const k in p) { if (BAD.has(k)) continue; if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) && b[k] && typeof b[k] === 'object') merge(b[k], p[k]); else b[k] = p[k]; } return b; };
if (!fs.existsSync(STATE)) fs.writeFileSync(STATE, JSON.stringify({ coach: { task: '' }, agents: Object.fromEntries(IDS.map(k => [k, { active: false, task: '' }])) }, null, 2));
store.update(() => {}); // 기존 state.json에 stats가 없으면 normalize가 채운다
http.createServer((req, res) => {
  if (!HOST_OK(req.headers.host)) { res.writeHead(403); return res.end('bad host'); }
  if (!KNOWN_METHODS.has(req.method)) { res.writeHead(501); return res.end('not implemented'); }
  const url = req.url.split('?')[0];
  if (url === '/api/state' && req.method !== 'POST') return notAllowed(res, 'POST');
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
  if (url === '/api/questions') { // 읽기 전용 — 정본은 handoff/questions.json(메인이 손으로 기록)
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end('read only'); }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(readQuestions()));
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return notAllowed(res, 'GET, HEAD'); // /api/version·정적·없는 경로 공통(405가 404보다 먼저)
  if (url === '/api/version') { // 화면 코드가 바뀌면 열린 탭이 스스로 새로고침하도록 파일 수정 시각을 알려 준다
    const v = ['index.html', 'app.js', 'fmt.js', 'site.js', 'style.css'].map(n => { try { return fs.statSync(path.join(ROOT, n)).mtimeMs; } catch (_) { return 0; } }).reduce((a, b) => Math.max(a, b), 0); // 브랜치 전환 등으로 파일이 잠깐 없어도 서버가 죽지 않게
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
