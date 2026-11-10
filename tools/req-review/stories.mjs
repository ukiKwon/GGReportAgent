// 사용: node stories.mjs <크롬 프로필 폴더> <가짜값 엑셀 절대경로>
// 전국 지도(영업팀장)·이사회 자료 작성(작성 권한 있는 계정) 사용 단계 캡처 → story/*.jpg
// 서버에 쓰는 동작(초안 저장 등)은 누르지 않는다. 엑셀은 화면 메모리에서만 읽힌다.
import { launch } from './cdp.mjs';
import fs from 'node:fs';
fs.mkdirSync('story', { recursive: true });
const WRITER = process.env.BOARD_WRITER || 'master';   // 배정 기능이 생기면 배정된 영업팀원 계정으로 바꾼다
const c = await launch(process.argv[2]);
const CLOSE = `[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='닫기'&&b.offsetParent).forEach(b=>b.click());0`;
async function login(a){ await c.nav('http://localhost:8080/'); await c.ev(`localStorage.clear();0`); await c.nav('http://localhost:8080/');
  await c.ev(`document.getElementById('login-id').value='${a}';document.getElementById('login-go').click();0`); await c.sleep(2200); }
try {
  // ── 전국 지도
  await login('sales.lead'); await c.shot('story/map1.jpg');
  await c.ev(CLOSE); await c.sleep(600); await c.shot('story/map2.jpg');
  await c.ev(`document.querySelector('#tab-map path.region[data-code="11"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));0`); await c.sleep(1500); await c.shot('story/map3.jpg');
  await c.ev(`(()=>{const e=[...document.querySelectorAll('#tab-map *')].find(x=>x.offsetParent&&x.children.length<4&&x.textContent.trim().startsWith('동대문구청')&&x.textContent.length<60);if(e)e.click();return 1})()`);
  await c.sleep(1500); await c.shot('story/map5.jpg');
  // ── 이사회 자료 작성
  await login(WRITER); await c.ev(CLOSE); await c.sleep(400);
  await c.ev(`document.querySelectorAll('#side-nav .nav-cat').forEach(b=>{if(b.getAttribute('aria-expanded')!=='true')b.click()});[...document.querySelectorAll('#side-nav .nav-item')].find(e=>e.textContent.trim()==='이사회 자료 작성').click();0`); await c.sleep(1200);
  await c.shot('story/bd1.jpg');
  await c.ev(`(()=>{const sel=[...document.querySelectorAll('select')].find(e=>e.offsetParent&&[...e.options].some(o=>o.textContent.includes('양식')));sel.selectedIndex=1;sel.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`); await c.sleep(1500);
  await c.shot('story/bd2.jpg');
  await c.ev(`document.getElementById('bd-write').click();0`); await c.sleep(1000); await c.shot('story/bd3.jpg');
  await c.send('Page.enable'); await c.send('Page.setInterceptFileChooserDialog', { enabled: true });
  await c.ev(`document.querySelector('[data-w=pick]').click();0`); await c.sleep(500);
  const doc = await c.send('DOM.getDocument', { depth: -1, pierce: true });
  const q = await c.send('DOM.querySelectorAll', { nodeId: doc.result.root.nodeId, selector: 'input[accept=".xlsx,.xlsm"]' });
  await c.send('DOM.setFileInputFiles', { nodeId: q.result.nodeIds[0], files: [process.argv[3]] }); await c.sleep(3000);
  await c.shot('story/bd4.jpg');
  await c.ev(`document.querySelector('[data-w=srcopen]').click();0`); await c.sleep(1500); await c.shot('story/bd5.jpg');
  await c.ev(`document.querySelector('[data-w=srcclose]').click();0`); await c.sleep(500);
  for (let i = 0; i < 6; i++) { await c.ev(`(()=>{const x=[...document.querySelectorAll('[data-w=tcheck]')].find(e=>!e.checked);if(x)x.click();return 1})()`); await c.sleep(500); }
  await c.ev(`window.scrollTo(0,0);document.querySelectorAll('*').forEach(e=>{if(e.scrollTop>0)e.scrollTop=0});0`); await c.sleep(600);
  await c.shot('story/bd6.jpg');
  console.log('stories done');
} finally { c.close(); }
