// 에이전트 보고서(md)에서 마지막 ```json 블록을 꺼내 파일로 저장. 사용: node pickjson.js <report.md> <out.json>
const fs = require('fs');
const [, , inp, out] = process.argv;
const t = fs.readFileSync(inp, 'utf8');
const m = [...t.matchAll(/```json\s*([\s\S]*?)```/g)];
if (!m.length) { console.log('no json'); process.exit(1); }
const rows = JSON.parse(m[m.length - 1][1]);
fs.writeFileSync(out, JSON.stringify(rows));
console.log('rows', rows.length);
