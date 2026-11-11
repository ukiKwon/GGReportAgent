import {launch} from './cdp.mjs';
import fs from 'node:fs';
fs.mkdirSync('cap',{recursive:true});
const accts=['sales.member','sales.lead','sales.head','budget.member','master'];
const out={};
const c=await launch(process.argv[2]);
for(const a of accts){
  await c.nav('http://localhost:8080/');
  await c.ev(`localStorage.clear();sessionStorage.clear();0`); await c.nav('http://localhost:8080/');
  await c.ev(`document.getElementById('login-id').value='${a}';document.getElementById('login-go').click();0`);
  await c.sleep(2200);

  await c.ev(`[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='닫기'&&b.offsetParent).forEach(b=>b.click());0`);await c.sleep(500);
  const items=JSON.parse(await c.ev(`(()=>{document.querySelectorAll('#side-nav .nav-cat').forEach(b=>{if(b.getAttribute('aria-expanded')!=='true')b.click()});
    const res=[];let cat='',sub='';
    document.querySelectorAll('#side-nav .nav-cat, #side-nav .nav-sub, #side-nav .nav-item').forEach(e=>{
      const t=e.textContent.trim();
      if(e.classList.contains('nav-cat'))cat=t;else if(e.classList.contains('nav-sub'))sub=t;
      else res.push({cat,sub,label:(e.querySelector('span')||e).textContent.trim(),full:t,soon:/준비중|구현 예정/.test(t)});
    });return JSON.stringify(res)})()`));
  out[a]=items;
  let n=0;
  for(const it of items){
    if(it.soon)continue;
    const file=`cap/${a.replace('.','_')}_${n++}.jpg`;
    await c.ev(`(()=>{document.querySelectorAll('#side-nav .nav-cat').forEach(b=>{if(b.getAttribute('aria-expanded')!=='true')b.click()});
      const el=[...document.querySelectorAll('#side-nav .nav-item')].find(e=>e.textContent.trim()===${JSON.stringify(it.full)});if(el)el.click();return 1})()`);
    await c.sleep(1500);
    await c.ev(`[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='닫기'&&b.offsetParent).forEach(b=>b.click());0`);await c.sleep(500);
    if(it.label==='이사회 자료 작성'){await c.sleep(1500);}   // 020a: 목록 화면 그대로 찍는다(목록 조회가 끝날 때까지만 기다림)
    await c.shot(file); it.file=file;
  }
  console.log(a,items.filter(i=>i.file).map(i=>i.label).join(','));
}
fs.writeFileSync('cap/index.json',JSON.stringify(out,null,1));
c.close();
