// 사용: node build.mjs <출력 html 경로>   (작업 폴더 = cap/·story/ 가 있는 곳에서 실행)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2]; if (!out) { console.error('출력 경로를 주세요'); process.exit(1); }
const idx=JSON.parse(fs.readFileSync('cap/index.json','utf8'));
const labels={'sales.member':'영업팀원','sales.lead':'영업팀장','sales.head':'영업부장','budget.member':'재무팀원','master':'관리자(전산)'};
const imgs={},accounts={};
const b64=f=>'data:image/jpeg;base64,'+fs.readFileSync(f).toString('base64');
for(const a of Object.keys(labels)){
  accounts[a]={label:labels[a],items:idx[a].map(i=>{const o={cat:i.cat,label:i.label,soon:i.soon};if(i.file){const k=i.file.split('/')[1].replace('.jpg','');imgs[k]=b64(i.file);o.img=k;}return o;})};
}
const st=JSON.parse(fs.readFileSync(path.join(here,'stories.json'),'utf8'));const stories={};
for(const k in st){stories[k]=st[k].map((x,i)=>{const id=(k==='전국 지도'?'sm':'sb')+i;imgs[id]=b64(x.f);return {img:id,x:x.x,y:x.y,t:x.t,d:x.d};});}
const data={accounts,imgs,stories,hero:b64('cap/sales_head_0.jpg')};
const html=fs.readFileSync(path.join(here,'template.html'),'utf8').replace('/*DATA*/null',()=>JSON.stringify(data));
fs.writeFileSync(out,html);
console.log('bytes',html.length,'→',out);
