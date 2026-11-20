import {launch} from './cdp.mjs';
import fs from 'node:fs';
fs.mkdirSync('cap',{recursive:true});
// designer(디자이너)는 영업 계열과 같이 시작화면(포털)으로 들어온다 — 시작화면 장에 함께 찍는다. 빌드(build.mjs labels)에도 이름을 더해야 화면에 나온다.
const accts=['sales.member','sales.lead','sales.head','designer','budget.member','master'];
const out={};
const c=await launch(process.argv[2]);
// 조건이 참이 될 때까지 기다린다(페이지를 다시 불러오는 중의 평가 오류는 무시하고 다시 본다).
const waitFor=async(expr,ms=10000)=>{for(let t=0;t<ms;t+=250){try{if(await c.ev(`!!(${expr})`))return true;}catch{}await c.sleep(250);}return false;};
// 열린 팝업을 닫는다 — 경과 안내(#ov-pop-close)·기관 상세(#dm-close)처럼 문구가 '닫기'가 아닌 것까지(id가 -close로 끝나는 버튼). 누른 개수를 돌려준다.
const CLOSE=`(()=>{let n=0;document.querySelectorAll('.modal-overlay, .dm-ov, .hc-ov').forEach(o=>{if(getComputedStyle(o).display==='none')return;const b=[...o.querySelectorAll('button')].find(x=>/-close$/.test(x.id)||x.textContent.trim()==='닫기');if(b){b.click();n++}});return n})()`;
const closeAll=async()=>{for(let i=0;i<4;i++){if(!await c.ev(CLOSE))break;await c.sleep(400);}};
const navCount=()=>c.ev(`document.querySelectorAll('#side-nav .nav-item').length`);
// 로그인: 스크립트가 다 올라 사이드바가 그려진 뒤에 입력한다(정적 HTML의 #login-id에 먼저 넣으면 클릭이 무시된다). 로그인이 끝나면 메뉴 권한 응답(/menus)이 와서 항목 수가 안정될 때까지 기다린다. 실패하면 한 번 더.
const login=async a=>{
  for(let tr=0;tr<2;tr++){
    await c.nav('http://localhost:8080/');
    await c.ev(`localStorage.clear();sessionStorage.clear();0`); await c.nav('http://localhost:8080/');
    if(!await waitFor(`document.getElementById('login-id')&&document.getElementById('login-go')&&document.querySelectorAll('#side-nav .nav-item').length`,15000)) continue;
    const n0=await navCount();   // 로그인 전(둘러보기 수준) 항목 수
    await c.ev(`document.getElementById('login-id').value='${a}';document.getElementById('login-go').click();0`);
    if(await waitFor(`document.getElementById('login-view').classList.contains('hidden')`,8000)){
      await waitFor(`document.querySelectorAll('#side-nav .nav-item').length!==${n0}`,8000);
      let last=-1,same=0;for(let t=0;t<12000&&same<3;t+=400){const n=await navCount();same=(n>0&&n===last)?same+1:0;last=n;await c.sleep(400);}
      return true;
    }
    console.error(a,'로그인 안 됨:',await c.ev(`(document.getElementById('login-msg')||{}).textContent||''`));
  }
  return false;
};
// 시작화면(포털, 상단 고정 탭): 영업 계열·디자이너·개발부서가 로그인하면 먼저 열린다. 메뉴 항목이 아니라서 따로 찍는다. 안 열리는 계정(마스터·재무)은 null.
const homeShot=async a=>{
  if(!await waitFor(`(()=>{const r=document.getElementById('pt-root');return r&&getComputedStyle(r).display!=='none'&&r.querySelector('.pt-k')})()`,5000)) return null;
  await waitFor(`!document.querySelector('#pt-root .pt-k[aria-busy="true"]')`,10000);
  await c.sleep(1000); await closeAll(); await c.sleep(500);   // 경과 안내 팝업은 시작화면이 열린 뒤에 뜬다
  const file=`cap/${a.replace('.','_')}_0.jpg`; await c.shot(file); return file;
};
for(const a of accts){
  if(!await login(a)){ console.error(a,'건너뜀(로그인 실패)'); out[a]=[]; process.exitCode=2; continue; }
  await closeAll();
  const items=JSON.parse(await c.ev(`(()=>{
    const res=[];let cat='',sub='';
    document.querySelectorAll('#side-nav .nav-cat, #side-nav .nav-sub, #side-nav .nav-item').forEach(e=>{
      const t=e.textContent.trim();
      if(e.classList.contains('nav-cat'))cat=(e.querySelector('.nav-label')||e).textContent.trim();else if(e.classList.contains('nav-sub'))sub=t;
      else res.push({cat,sub,label:(e.querySelector('.nav-label')||e).textContent.trim(),nav:e.dataset.nav||'',full:t,soon:/준비중|구현 예정/.test(t)});
    });return JSON.stringify(res)})()`));
  const home=await homeShot(a);
  let n=0;
  if(home){ items.unshift({cat:'기관·입찰 현황',sub:'',label:'시작화면',nav:'soon:시작화면',full:'시작화면',soon:false,file:home}); n=1; }
  out[a]=items;
  for(const it of items){
    if(it.soon||it.file)continue;
    const file=`cap/${a.replace('.','_')}_${n++}.jpg`;
    await c.ev(`(()=>{const el=[...document.querySelectorAll('#side-nav .nav-item')].find(e=>e.dataset.nav===${JSON.stringify(it.nav)});if(!el)return 0;const box=el.closest('.nav-items');const cat=box&&document.querySelector('#side-nav .nav-cat[data-cat="'+box.dataset.for+'"]');if(cat&&cat.getAttribute('aria-expanded')!=='true')cat.click();el.click();return 1})()`);
    await c.sleep(['입찰 현황판','입찰 공고 현황','기관 사업계획','대시보드'].includes(it.label)?2800:1500);   // 서버 조회가 끝날 때까지(대시보드 = 옛 '제안서 사전준비 프로세스', 66b0938)
    const ready={'입찰 현황판':`document.querySelector('#hb-goals:not([aria-busy="true"]) .hb-tt')`,'입찰 공고 현황':`document.querySelector('#db-scroll:not([aria-busy="true"])')`}[it.label];
    if(ready) await waitFor(ready,8000);
    await closeAll();await c.sleep(300);
    if(it.label==='이사회 자료 작성'){await c.sleep(1500);}   // 020a: 목록 화면 그대로 찍는다(목록 조회가 끝날 때까지만 기다림)
    await c.shot(file); it.file=file;
  }
  console.log(a,items.filter(i=>i.file).map(i=>i.label).join(','));
}
fs.writeFileSync('cap/index.json',JSON.stringify(out,null,1));
c.close();
