// 사용: node stories.mjs <크롬 프로필 폴더> <가짜값 엑셀 절대경로>
// 시작화면 3단계(영업팀장 로그인 직후)·입찰 현황판 5단계·입찰 공고 현황 4단계·전국 지도 4단계(사이드바로 이동)·이사회 자료 작성(020a: 목록→새 자료→자료 머리·탭→엑셀→대조·확인→저장 안내→부장 읽기 전용) 캡처 → story/*.jpg
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
const NEVER = /m-save|leave-save|data-w=draft|bd-w-draft|data-act=create|bd-l-np-ok|db-cf|db-do|db-open|data-hc|data-pp-pop|pp-next-btn|db-reload|hb-a-go|hb-m-go|hb-c-go|hb-w-watch|hb-w-next|hb-confirm|dm-info-edit/;
const miss = [];
const c = await launch(process.argv[2]);
// 열린 팝업을 닫는다 — 경과 안내(#ov-pop-close)·기관 상세(#dm-close)처럼 문구가 '닫기'가 아닌 것까지(id가 -close로 끝나는 버튼). 누른 개수를 돌려준다.
const CLOSE = `(()=>{let n=0;document.querySelectorAll('.modal-overlay, .dm-ov, .hc-ov').forEach(o=>{if(getComputedStyle(o).display==='none')return;const b=[...o.querySelectorAll('button')].find(x=>/-close$/.test(x.id)||x.textContent.trim()==='닫기');if(b){b.click();n++}});return n})()`;
const closeAll = async () => { for (let i = 0; i < 4; i++) { if (!await c.ev(CLOSE)) break; await c.sleep(400); } };   // 상세를 닫으면 '협약 중인 기관' 목록이 다시 열리니 다 닫힐 때까지
const navCount = () => c.ev(`document.querySelectorAll('#side-nav .nav-item').length`);
// 로그인: 스크립트가 다 올라 사이드바가 그려진 뒤에 입력하고, 메뉴 권한 응답(/menus)이 와서 항목 수가 안정될 때까지 기다린다. 실패하면 한 번 더, 그래도 안 되면 멈춘다.
async function login(a) {
  for (let tr = 0; tr < 2; tr++) {
    await c.nav('http://localhost:8080/'); await c.ev(`localStorage.clear();sessionStorage.clear();0`); await c.nav('http://localhost:8080/');
    if (!await waitFor(`document.getElementById('login-id')&&document.getElementById('login-go')&&document.querySelectorAll('#side-nav .nav-item').length`, 15000)) continue;
    const n0 = await navCount();
    await c.ev(`document.getElementById('login-id').value='${a}';document.getElementById('login-go').click();0`);
    if (await waitFor(`document.getElementById('login-view').classList.contains('hidden')`, 8000)) {
      await waitFor(`document.querySelectorAll('#side-nav .nav-item').length!==${n0}`, 8000);
      let last = -1, same = 0; for (let t = 0; t < 12000 && same < 3; t += 400) { const n = await navCount(); same = (n > 0 && n === last) ? same + 1 : 0; last = n; await c.sleep(400); }
      return true;
    }
    console.error(a, '로그인 안 됨:', await c.ev(`(document.getElementById('login-msg')||{}).textContent||''`));
  }
  throw new Error(a + ' 로그인 실패 — 서버(8080)·계정 확인');
}
const DASH_ORG = process.env.DASH_ORG || '마포구청';   // 공고 진행 중 + 로컬 DB에 기관장 시험 행
const hot = {};   // story/hot.json — 강조점(화면 %) 자동 측정 결과. build.mjs가 stories.json 좌표보다 우선한다
const waitFor = async (expr, ms = 8000) => { for (let t = 0; t < ms; t += 250) { if (await c.ev(`!!(${expr})`)) return true; await c.sleep(250); } return false; };
// 사이드바 항목을 data-nav로 연다: 그 항목이 든 분류를 먼저 펼친다(아코디언).
const gotoNav = async (id, wait = 1800) => {
  await waitFor(`[...document.querySelectorAll('#side-nav .nav-item')].some(x=>x.dataset.nav===${JSON.stringify(id)})`, 8000);   // 메뉴 권한 응답이 늦으면 항목이 아직 없다(이사회 7단계 전부 실패한 원인)
  const ok = await c.ev(`(()=>{const it=[...document.querySelectorAll('#side-nav .nav-item')].find(x=>x.dataset.nav===${JSON.stringify(id)});if(!it)return 0;const box=it.closest('.nav-items');const cat=box&&document.querySelector('#side-nav .nav-cat[data-cat="'+box.dataset.for+'"]');if(cat&&cat.getAttribute('aria-expanded')!=='true')cat.click();it.click();return 1})()`);
  if (!ok) miss.push('메뉴 항목 ' + id);
  await c.sleep(wait); return !!ok;
};
// 찍고, 고른 요소의 위치를 화면 %로 hot에 적는다(스크린샷 = 1440×900 뷰포트라 그대로 hotspot 좌표다). 못 찾으면 stories.json의 x·y.
const shotHot = async (file, sel, text) => {
  await c.shot(file);
  if (!sel) return;
  const p = await c.ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>!${JSON.stringify(text || '')}||x.textContent.includes(${JSON.stringify(text || '')}));if(!e)return null;const b=e.getBoundingClientRect();if(!b.width||!b.height)return null;const x=(b.left+b.width/2)/innerWidth*100,y=(b.top+Math.min(b.height/2,36))/innerHeight*100;return (x<0||x>100||y<0||y>100)?null:[+x.toFixed(1),+y.toFixed(1)]})()`);
  if (p) hot[file] = p; else miss.push('강조점 요소를 못 찾음(stories.json 좌표 유지): ' + file + '  ← ' + sel);
};
const scrollTop = sel => c.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(e)e.scrollIntoView({block:'start'});return 1})()`);
try {
  // 보이는 첫 요소를 누른다(쓰기 버튼 선택자는 거부). 없으면 miss에 적고 계속 간다(optional=true면 적지 않는다). 아래 시작화면·현황판 단계도 쓰므로 맨 앞에 둔다.
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
  const TOP = `window.scrollTo(0,0);document.querySelectorAll('*').forEach(e=>{if(e.scrollTop>0)e.scrollTop=0});0`;

  // ── 시작화면: 영업 계열·디자이너·개발부서가 로그인하면 먼저 보는 화면(포털, #pt-root). 로그인 직후 그대로 찍는다(경과 안내 팝업은 닫는다)
  await login('sales.lead'); await closeAll();
  if (!await waitFor(`(()=>{const r=document.getElementById('pt-root');return r&&getComputedStyle(r).display!=='none'&&r.querySelector('.pt-k')&&!r.querySelector('.pt-k[aria-busy="true"]')})()`, 12000)) miss.push('시작화면 숫자 칸이 뜨지 않음(#pt-root .pt-k) — 로그인 첫 화면이 시작화면인지 확인');
  await c.sleep(800); await closeAll(); await c.sleep(500);
  await shotHot('story/home1.jpg', '#pt-band');                          // 1 숫자 칸 4개
  await shotHot('story/home2.jpg', '#pt-list .pt-ph');                   // 2 기관별 입찰 일정(1년) — 오른쪽 날짜별 일정(30일)과 같은 화면, 강조점만 다름
  if (await press('시작화면 표에서 기관 열기', '#pt-sc .pt-nm[data-pt-open]', 1500)) await waitFor(`document.querySelector('#dm-pane .db-sec')`, 6000);
  await c.sleep(600); await shotHot('story/home3.jpg', '#dm-bar');       // 3 기관 상세 팝업(읽기만, [제안 확정]은 누르지 않음)
  await closeAll();
  // ── 입찰 현황판(올해 목표 기관 표, kbboard.js): 사이드바로 연다. 쓰기(목표에 넣기·구분 바꾸기·빼기·제안 확정)는 누르지 않는다
  await gotoNav('soon:현황판', 2000); await closeAll();
  if (!await waitFor(`document.querySelector('#hb-goals:not([aria-busy="true"]) .hb-tt')`, 12000)) miss.push('현황판 목표 표가 뜨지 않음(#hb-goals .hb-tt)');
  await c.sleep(800);
  await shotHot('story/dash1.jpg', '#hb-band');                                         // 1 위 요약 칸
  await scrollTop('#hb-goals'); await c.sleep(400);
  await shotHot('story/dash2.jpg', '#hb-ts tbody tr:not(.grp):not(.emp) .hb-lane');     // 2 목표 표(탭·거르기·12개월 일정)
  await c.ev(TOP); await c.sleep(400);
  if (await press('목표 기관 추가 열기', '#hb-add', 1000)) await press('추천받기(화면 안 계산, 저장 안 됨)', '#hb-a-recbtn', 900, true);
  await shotHot('story/dash3.jpg', '#hb-a-recbtn');                                      // 3 목표 기관 추가 창([목표에 넣기]는 누르지 않음)
  await press('목표 기관 추가 닫기', '#hb-a-cancel', 600, true); await closeAll();
  await waitFor(`document.querySelector('#hb-ours-btn:not([aria-disabled])')`, 8000);
  if (await press('협약 중인 기관 열기', '#hb-ours-btn', 1200)) await waitFor(`document.querySelector('#hb-ours .hb-row')`, 6000);
  await shotHot('story/dash4.jpg', '#hb-ours .hb-sum');                                  // 4 협약 중인 기관 팝업
  const picked = await c.ev(`(()=>{const rows=[...document.querySelectorAll('#hb-ours .hb-row')].filter(x=>x.offsetParent);const e=rows.find(x=>((x.querySelector('.nm')||x).textContent||'').trim().startsWith(${JSON.stringify(DASH_ORG)}))||rows[0];if(!e)return 0;e.click();return 1})()`);
  if (!picked) miss.push('협약 중인 기관 목록에 줄이 없음(#hb-ours .hb-row)');
  await waitFor(`document.querySelector('#dm-pane .db-sec')`, 6000); await c.sleep(900);
  await shotHot('story/dash5.jpg', '#dm-pane .db-sec');                                  // 5 기관 상세([이전]이 보임). [제안 확정]은 누르지 않는다
  await closeAll();
  // ── 입찰 공고 현황(전국 공고, dashboard.js): 옛 현황판 4단계(종류별 막대(옛 월별 막대)·공고 띠·기간 버튼·기관 상세)가 이 화면으로 옮겨 왔다
  await gotoNav('soon:입찰 공고 현황', 2200); await closeAll();
  if (!await waitFor(`document.querySelector('#db-scroll:not([aria-busy="true"]) .db-row')`, 10000)) miss.push('공고 현황 목록이 뜨지 않음(#db-scroll .db-row)');
  await c.sleep(800);
  await shotHot('story/notice1.jpg', '#db-tl');                          // 1 다가오는 기관별 공고현황(종류별 막대)
  await shotHot('story/notice2.jpg', '#db-notice .db-nb-card');          // 2 지금 공고가 난 기관 띠(없으면 hidden → 좌표 유지)
  await scrollTop('.db-work'); await c.sleep(400);
  await shotHot('story/notice3.jpg', '#db-per');                         // 3 기간 버튼
  const pickedN = await c.ev(`(()=>{const all=[...document.querySelectorAll('#db-root .db-nb-card, #db-root .db-row')].filter(x=>x.offsetParent);const e=all.find(x=>((x.querySelector('.nm')||{}).textContent||'').trim()===${JSON.stringify(DASH_ORG)})||all[0];if(!e)return 0;e.click();return 1})()`);
  if (!pickedN) miss.push('공고 현황에서 기관 줄을 못 찾음(.db-nb-card / .db-row)');
  await c.sleep(1200); await scrollTop('#db-pane'); await c.sleep(400);
  await shotHot('story/notice4.jpg', '#db-pane .db-ntrk');               // 4 공고 진행 막대 + 기관장 절(headcard는 읽기만)
  await closeAll();
  // ── 전국 지도: 사이드바에서 옮긴다
  await gotoNav('map', 2200); await closeAll(); await c.sleep(600);
  await shotHot('story/map1.jpg', '#legend');                           // 1 범례·필터
  await shotHot('story/map2.jpg', '#map-svg text', '서울');             // 2 서울 라벨(▲·공고 n) — 같은 화면, 강조점만 다름
  await c.ev(`document.querySelector('#tab-map path.region[data-code="11"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));0`); await c.sleep(1500);
  await shotHot('story/map3.jpg', '#rank-list');                        // 3 서울 25구 + 순위표
  const rk = await c.ev(`(()=>{const cs=[...document.querySelectorAll('.rank-card')].filter(x=>x.offsetParent);const e=cs.find(x=>x.textContent.includes(${JSON.stringify(DASH_ORG)}))||cs[0];if(!e)return 0;e.click();e.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));return 1})()`);   // 한 번 = 지도 표시, 두 번 = 상세 팝업(render.js 859행)
  if (!rk) miss.push('지도 순위표에 기관 카드가 없음(.rank-card)');
  await c.sleep(1500); await waitFor(`document.querySelector('#dm-pane .db-sec')`, 6000);
  await shotHot('story/map5.jpg', '#dm-bar');                           // 5 기관 상세 팝업(옛 요약 카드). [제안 확정]은 보이되 누르지 않는다
  await closeAll();
  // ── 이사회 자료 작성 (020a)
  const openBoardList = async () => { await gotoNav('soon:이사회 자료', 1800); };   // nav.js BOARD_ID
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
  await waitFor(`document.querySelector('#bd-writebar [data-w=srcopen]:not([disabled])')`, 30000);   // 엑셀 확인·채우기가 끝나야 버튼이 켜진다
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
  fs.writeFileSync('story/hot.json', JSON.stringify(hot, null, 1));   // build.mjs가 읽는다
  if (miss.length) { console.error('찾지 못한 요소 ' + miss.length + '건:\n - ' + miss.join('\n - ')); process.exitCode = 2; }
  console.log('stories done');
} finally { c.close(); }
