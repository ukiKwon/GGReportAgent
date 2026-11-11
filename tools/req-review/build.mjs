// 사용: node build.mjs <출력 html 경로>   (작업 폴더 = cap/·story/ 가 있는 곳에서 실행)
// REVIEW_DATE=YYYY-MM-DD 로 화면 날짜·의견 저장 키를 정한다(기본: 오늘). 캡처한 날과 같게 둔다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2]; if (!out) { console.error('출력 경로를 주세요'); process.exit(1); }
const idx=JSON.parse(fs.readFileSync('cap/index.json','utf8'));
const p2=n=>String(n).padStart(2,'0'), now=new Date();
const date=process.env.REVIEW_DATE||`${now.getFullYear()}-${p2(now.getMonth()+1)}-${p2(now.getDate())}`;
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){ console.error('날짜 형식이 틀렸습니다(YYYY-MM-DD):',date); process.exit(1); }
// STEPS 제목이 캡처한 메뉴 대분류 이름과 한 글자라도 다르면 업무 흐름 칩이 비므로 빌드를 멈춘다.
const tpl=fs.readFileSync(path.join(here,'template.html'),'utf8');
const blk=/const STEPS = \[([\s\S]*?)\n\];/.exec(tpl);
if(!blk){ console.error('template.html에서 STEPS 블록을 찾지 못했습니다'); process.exit(1); }
const titles=[...blk[1].matchAll(/^\s*\['([^']+)'/gm)].map(x=>x[1]);
const cats=new Set(idx['sales.head'].map(i=>i.cat));
const bad=titles.filter(t=>!cats.has(t));
if(bad.length){ console.error('STEPS 제목이 메뉴 대분류와 다릅니다:',bad.join(', '),'\n캡처된 대분류:',[...cats].join(', ')); process.exit(1); }
const labels={'sales.member':'영업팀원','sales.lead':'영업팀장','sales.head':'영업부장','budget.member':'재무팀원','master':'관리자(전산)'};
const imgs={},accounts={};
const b64=f=>'data:image/jpeg;base64,'+fs.readFileSync(f).toString('base64');
for(const a of Object.keys(labels)){
  accounts[a]={label:labels[a],items:idx[a].map(i=>{const o={cat:i.cat,label:i.label,soon:i.soon};if(i.file){const k=i.file.split('/')[1].replace('.jpg','');imgs[k]=b64(i.file);o.img=k;}return o;})};
}
const st=JSON.parse(fs.readFileSync(path.join(here,'stories.json'),'utf8'));const stories={};
for(const k in st){stories[k]=st[k].map((x,i)=>{const id=(k==='전국 지도'?'sm':'sb')+i;imgs[id]=b64(x.f);if(x.todo)console.warn('좌표 임시값(TODO):',k,i+1,x.todo);return {img:id,x:x.x,y:x.y,t:x.t,d:x.d};});}
const data={date,accounts,imgs,stories,hero:b64('cap/sales_head_0.jpg')};
// </script> 로 스크립트가 끊기지 않게 < 를 이스케이프한다(security PUSH-GATE 11-11 #6)
const html=tpl.replace('/*DATA*/null',()=>JSON.stringify(data).replace(/</g,'\\u003c'));
fs.writeFileSync(out,html);
console.log('date',date,'bytes',html.length,'→',out);
