// 사용: node stories.mjs <크롬 프로필 폴더> <가짜값 엑셀 절대경로>
// 전국 지도(영업팀장)·이사회 자료 작성(020a: 목록→새 자료→자료 머리·탭→엑셀→대조·확인→저장 안내→부장 읽기 전용) 캡처 → story/*.jpg
// 서버에 쓰는 동작(버전 저장·만들기·초안 내려받기)은 누르지 않는다. 엑셀은 파싱을 위해 서버(POST /board-forms/{id}/excel)로 보내지고
// 접근 이력에 남지만 저장되지는 않는다 — 그래서 docs/samples의 가짜값 파일만 쓴다.
// 이사회 자료는 새로 만들지 않고, 로컬 DB에 이미 있는 시험 자료(BOARD_ORG, 기본 노원구 2026)를 연다.
import { launch } from './cdp.mjs';
import fs from 'node:fs';
fs.mkdirSync('story', { recursive: true });
// 노원구 2026에 배정된 계정: 김영업(sales.member) — 2026-11-11 qa 확인. 서버 시드에는 배정이 없으니(로컬 DB 자료) DB를 새로 만들었다면 BOARD_WRITER로 바꾼다.
const WRITER = process.env.BOARD_WRITER || 'sales.member';
const ORG = process.env.BOARD_ORG || '노원구';
// 서버에 쓰는 버튼의 선택자는 press()가 거부한다(버전 저장·저장 확인·만들기·자료 열기 폼·초안 워드).
const NEVER = /m-save|leave-save|data-w=draft|bd-w-draft|data-act=create|bd-l-np-ok/;
const miss = [];
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
  // ── 이사회 자료 작성 (020a)
  // 보이는 첫 요소를 누른다. 없으면 miss에 적고 계속 간다(optional=true면 적지 않는다).
  const press = async (desc, sel, wait = 600, optional = false) => {
    if (NEVER.test(sel)) throw new Error('쓰기 버튼 선택자는 누를 수 없습니다: ' + sel);
    const ok = await c.ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>x.offsetParent&&!x.disabled);if(!e)return 0;e.click();return 1})()`);
    if (!ok && !optional) miss.push(desc + '  ← ' + sel);
    await c.sleep(wait); return !!ok;
  };
  const pressText = async (desc, sel, text, wait = 600) => {
    if (NEVER.test(sel)) throw new Error('쓰기 버튼 선택자는 누를 수 없습니다: ' + sel);
    const ok = await c.ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>x.offsetParent&&x.textContent.trim().startsWith(${JSON.stringify(text)}));if(!e)return 0;e.click();return 1})()`);
    if (!ok) miss.push(desc + '  ← ' + sel + ' "' + text + '"');
    await c.sleep(wait); return !!ok;
  };
  const openBoardList = async () => {
    await c.ev(`document.querySelectorAll('#side-nav .nav-cat').forEach(b=>{if(b.getAttribute('aria-expanded')!=='true')b.click()});0`); await c.sleep(400);
    await pressText('메뉴 이사회 자료 작성', '#side-nav .nav-item', '이사회 자료 작성', 1800);
  };
  await login(WRITER); await c.ev(CLOSE); await c.sleep(400);
  await openBoardList(); await c.shot('story/bd1.jpg');                      // 1 목록
  if (await press('새 이사회 자료 열기', '#bd-l-newbtn', 800)) {             // 2 새 자료(만들기는 누르지 않는다)
    await c.ev(`(()=>{const r=[...document.querySelectorAll('input[name="bd-l-bc"]')].find(x=>(x.closest('label')||x).textContent.includes(${JSON.stringify(ORG)}));if(r&&!r.checked)r.click();return 1})()`); await c.sleep(700);
  }
  await c.shot('story/bd2.jpg');
  await pressText('시험 자료 열기', 'button.bd-l-open', ORG, 1800);
  await c.shot('story/bd3.jpg');                                              // 3 자료 머리·탭
  await c.send('Page.enable'); await c.send('Page.setInterceptFileChooserDialog', { enabled: true });
  await press('엑셀 올리기', '[data-w=pick], [data-w=swap]', 500);            // 4 엑셀 채우기
  await press('엑셀 덮어쓰기 확인 줄(파일 선택 전, 화면 안에서만 동작)', '[data-w=leave-ok]', 500, true);
  const doc = await c.send('DOM.getDocument', { depth: -1, pierce: true });
  const q = await c.send('DOM.querySelectorAll', { nodeId: doc.result.root.nodeId, selector: 'input[accept=".xlsx,.xlsm"]' });
  if (q.result.nodeIds && q.result.nodeIds[0]) await c.send('DOM.setFileInputFiles', { nodeId: q.result.nodeIds[0], files: [process.argv[3]] });
  else miss.push('엑셀 파일 input 없음(input[accept=".xlsx,.xlsm"])');
  await c.sleep(1500);
  await press('엑셀 덮어쓰기 확인 줄(파일 선택 후)', '[data-w=leave-ok]', 1500, true);
  await c.shot('story/bd4.jpg');
  await press('수익성 분석표 보기', '#bd-writebar [data-w=srcopen]', 1500);   // 5 대조·표 확인
  await c.shot('story/bd5.jpg');
  await press('원본 닫기', '[data-w=srcclose]', 500, true);
  for (let i = 0; i < 20; i++) {                                              // 안 된 표 확인을 끝까지(화면 안 체크만, 저장 안 됨)
    const left = await c.ev(`(()=>{const x=[...document.querySelectorAll('[data-w=tcheck]')].find(e=>!e.checked);if(x){x.click();return 1}return 0})()`);
    if (!left) break; await c.sleep(400);
  }
  await c.ev(`window.scrollTo(0,0);document.querySelectorAll('*').forEach(e=>{if(e.scrollTop>0)e.scrollTop=0});0`); await c.sleep(600);
  await c.shot('story/bd6.jpg');                                              // 6 저장하지 않은 수정 N칸 + [버전 저장](누르지 않음)
  await press('목록으로(고친 값 버리고 나가기 준비)', '#bd-m-back', 600, true);
  await press('저장하지 않고 나가기(화면 안에서만 버림)', '[data-w=leave-drop]', 800, true);
  await login('sales.head'); await c.ev(CLOSE); await c.sleep(400);          // 7 영업부장 읽기 전용
  await openBoardList();
  await pressText('시험 자료 열기(부장)', 'button.bd-l-open', ORG, 1800);
  await c.shot('story/bd7.jpg');
  if (miss.length) { console.error('찾지 못한 요소 ' + miss.length + '건:\n - ' + miss.join('\n - ')); process.exitCode = 2; }
  console.log('stories done');
} finally { c.close(); }
