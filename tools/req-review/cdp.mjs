import { spawn } from 'node:child_process';
import fs from 'node:fs';
export async function launch(dir){
  const port=9333+Math.floor(Math.random()*500);
  const p=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port='+port,'--user-data-dir='+dir,'--window-size=1440,900','--hide-scrollbars','--no-first-run','about:blank'],{stdio:'ignore'});
  let list;
  for(let i=0;i<50;i++){try{list=await (await fetch(`http://127.0.0.1:${port}/json`)).json();if(list.find(t=>t.type==='page'))break;}catch{}await new Promise(r=>setTimeout(r,200));}
  const t=list.find(t=>t.type==='page');
  const ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>ws.onopen=r);
  let id=0;const pend=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});if(r.result.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0,300));return r.result.result.value;};
  const shot=async(file)=>{const r=await send('Page.captureScreenshot',{format:'jpeg',quality:72});fs.writeFileSync(file,Buffer.from(r.result.data,'base64'));};
  const nav=async(u)=>{await send('Page.navigate',{url:u});await new Promise(r=>setTimeout(r,1500));};
  return {send,ev,shot,nav,sleep:ms=>new Promise(r=>setTimeout(r,ms)),close:()=>{try{ws.close()}catch{};p.kill();}};
}
