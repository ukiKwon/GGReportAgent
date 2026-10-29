#!/usr/bin/env node
// handoff/ → docs/obsidian/task-history/ 파생 볼트 생성기. 원본(handoff/)은 읽기만 한다.
// 실행: node docs/obsidian/build_vault.js   (몇 번이든 다시 돌려도 된다 — 생성 폴더를 지우고 새로 쓴다)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'handoff');
const VAULT = path.join(__dirname, 'task-history');
const DIRS = { day: '일별', item: '항목', branch: '브랜치', topic: '주제' };
// 주제 허브: 노트 본문에 키워드가 MIN_HITS회 이상 나오면 허브가 그 노트로 링크한다 (스치듯 언급은 거른다).
const MIN_HITS = 3;
const TOPICS = [
  ['kgi-ggreport-web (메인)', /kgi-ggreport-web|시스템 관리|docfill|엑셀\s*→\s*워드/gi, 1], // 새 앱이라 언급이 적어 기준을 낮춘다
  ['결재라인·권한', /결재|권한|사번|대결/g],
  ['WebLogic·WebSphere 이관', /WebLogic|WebSphere|이관|골든 파일/gi],
  ['uploader·Oracle', /uploader|Oracle|DDL/gi],
  ['금고 입찰 대시보드', /금고|대시보드|eminwon|geo\//gi],
  ['구청 제안·보고서', /구청|자치구|사업제안|제안 보고서|보고서 2\.0/g],
  ['RFP·배점표·제안 에이전트', /RFP|배점표|institution-intelligence|제안서|rfp-/gi],
  ['LLM·gpt-oss', /LLM|gpt-oss/gi],
  ['수집기·인박스', /collector|inbox|크롤|수집기/gi],
  ['폐쇄망·보안', /폐쇄망|반입|PII|비밀번호|보안/g],
  ['문의서·인프라', /문의서|AWS|EC2|서버 사양/g],
  ['리포 구조·핸드오프', /재구성|핸드오프|worktree|handoff\//gi],
  ['UI·화면 검증', /Playwright|브라우저 검증|스크린샷|화면 개편/gi],
];
const HOME = '00 홈';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const safe = (s) => s.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim();
const link = (name, alias) => `[[${name}${alias ? '|' + alias : ''}]]`;

// ── 1. 항목(NEXT.md / done.md)을 `### N.` 단위로 쪼갠다 ─────────────────────────
function titleOf(heading) {
  let t = heading.replace(/^###\s*\d+[.\-A-Za-z]*\s*/, '');
  t = t.replace(/~~/g, '').replace(/\*\*/g, '').replace(/`/g, '');
  t = t.replace(/[\u{1F000}-\u{1FFFF}☀-➿️]/gu, '');
  t = t.split(/\s—\s|\s\(/)[0];
  return safe(t).slice(0, 40).trim();
}

function split(file, status) {
  const lines = read(path.join(SRC, file)).split('\n');
  const notes = [];
  let cur = { kind: 'section', num: null, heading: `${file} 머리말`, status, body: [] };
  let fence = false;
  for (const line of lines) {
    if (/^```/.test(line)) fence = !fence;
    const h = !fence && line.match(/^(##|###)\s+(.*)$/);
    if (h) {
      const num = h[1] === '###' && line.match(/^###\s*(\d+)(-[A-Za-z]+)?\.?\s/);
      if (num) {
        notes.push(cur);
        cur = { kind: 'item', num: Number(num[1]), suffix: num[2] || '', heading: line, status, body: [line] };
        continue;
      }
      if (h[1] === '##') {
        notes.push(cur);
        cur = { kind: 'section', num: null, heading: `${file} ${h[2]}`, status, body: [line] };
        continue;
      }
    }
    cur.body.push(line);
  }
  notes.push(cur);
  return notes.filter((n) => n.body.join('').trim());
}

const itemNotes = [...split('NEXT.md', 'open'), ...split('done.md', 'done')];
const nameOf = new Map(); // 번호 → 파일명 (NEXT가 done보다 우선)
for (const n of itemNotes) {
  if (n.kind === 'item') {
    n.name = safe(`항목 ${n.num}${n.suffix} ${titleOf(n.heading)}`);
    // "항목 18" 참조는 접미사 없는 노트를 우선한다 (NEXT의 18-B vs done의 18)
    if (!nameOf.has(n.num) || (!n.suffix && nameOf.get(n.num).suffixed)) nameOf.set(n.num, { name: n.name, suffixed: !!n.suffix });
  } else {
    n.name = safe(n.heading).slice(0, 60);
  }
}
// 이름 충돌(같은 번호가 두 파일에 있을 때)을 막는다.
const used = new Set();
for (const n of itemNotes) {
  while (used.has(n.name)) n.name += ` (${n.status})`;
  used.add(n.name);
}

// ── 2. 본문 링크 치환 ───────────────────────────────────────────────────────
function linkify(text, { ownNum = null, strict }) {
  let fence = false;
  return text
    .split('\n')
    .map((line) => {
      if (/^```/.test(line)) fence = !fence;
      if (fence) return line;
      const inTable = line.trimStart().startsWith('|');
      const bar = inTable ? '\\|' : '|';
      const mk = (name, alias) => `[[${name}${bar}${alias}]]`;
      // YYYY-MM-DD_summary.md → 일별 노트
      line = line.replace(/(\d{4}-\d{2}-\d{2})_summary\.md/g, (m, d) => mk(d, m));
      // 항목 N 참조
      // summary(strict)는 "NEXT"가 든 줄만, 항목 노트끼리는 모든 줄 — summary의 "항목 5"는 지역 번호일 수 있다.
      if (!strict || /NEXT/.test(line)) {
        line = line.replace(/((?:NEXT(?:\.md)?(?:의)?\s*)?항목\s*)(\d+)(?![\d.\-]|\s?[건개가곳번명종])/g, (m, pre, n) => {
          const hit = nameOf.get(Number(n));
          if (!hit || Number(n) === ownNum) return m;
          return mk(hit.name, m);
        });
      }
      return line;
    })
    .join('\n');
}

// ── 3. 일별 노트 ────────────────────────────────────────────────────────────
const dayFiles = fs.readdirSync(SRC).filter((f) => /^\d{4}-\d{2}-\d{2}_summary\.md$/.test(f)).sort();
const branchDays = new Map(); // 브랜치 → [날짜]
const days = dayFiles.map((f) => {
  const date = f.slice(0, 10);
  const raw = read(path.join(SRC, f));
  const branches = [...new Set([...raw.matchAll(/브랜치\s*`([^`]+)`/g)].map((m) => m[1].replace(/^origin\//, '')))]
    .filter((b) => /^[A-Za-z][\w./-]*$/.test(b) && !/^[0-9a-f]{7,}$/.test(b) && !b.startsWith('.'));
  const sessions = (raw.match(/^## Session/gm) || []).length;
  for (const b of branches) branchDays.set(b, [...(branchDays.get(b) || []), date]);
  return { date, raw, branches, sessions };
});

// ── 4. 쓰기 ────────────────────────────────────────────────────────────────
for (const d of Object.values(DIRS)) fs.rmSync(path.join(VAULT, d), { recursive: true, force: true });
for (const d of Object.values(DIRS)) fs.mkdirSync(path.join(VAULT, d), { recursive: true });
const write = (rel, text) => fs.writeFileSync(path.join(VAULT, rel), text, 'utf8');
const fm = (obj) =>
  '---\n' + Object.entries(obj).map(([k, v]) => `${k}: ${Array.isArray(v) ? '[' + v.join(', ') + ']' : v}`).join('\n') + '\n---\n\n';
const branchName = (b) => safe(`브랜치 ${b}`);

for (const d of days) {
  const head = [`> 원본: \`handoff/${d.date}_summary.md\` (파생본 — 고치지 말고 원본을 고칠 것)`];
  if (d.branches.length) head.push(`> 브랜치: ${d.branches.map((b) => link(branchName(b))).join(' · ')}`);
  write(
    `${DIRS.day}/${d.date}.md`,
    fm({ date: d.date, tags: ['summary'], sessions: d.sessions }) + head.join('\n') + '\n\n' + linkify(d.raw, { strict: true }),
  );
}

for (const n of itemNotes) {
  const src = n.status === 'open' ? 'NEXT.md' : 'done.md';
  const meta = { tags: n.kind === 'item' ? ['item', n.status] : ['section', n.status], 원본: src };
  if (n.num) meta.번호 = n.num;
  write(
    `${DIRS.item}/${n.name}.md`,
    fm(meta) + `> 원본: \`handoff/${src}\` (파생본)\n\n` + linkify(n.body.join('\n'), { ownNum: n.num, strict: false }),
  );
}

for (const [b, ds] of branchDays) {
  write(
    `${DIRS.branch}/${branchName(b)}.md`,
    fm({ tags: ['branch'] }) + `\`${b}\` 가 언급된 날\n\n` + ds.map((x) => `- ${link(x)}`).join('\n') + '\n',
  );
}

// 주제 허브 — 일별·항목 노트를 키워드 빈도로 연결
const topicName = (t) => safe(`주제 ${t}`);
const topicHits = TOPICS.map(([t, re, min = MIN_HITS]) => {
  const hits = [];
  for (const d of days) hits.push({ name: d.date, kind: '일별', n: (d.raw.match(re) || []).length });
  for (const n of itemNotes) if (n.kind === 'item') hits.push({ name: n.name, kind: '항목', n: (n.body.join('\n').match(re) || []).length });
  return [t, hits.filter((h) => h.n >= min).sort((a, b) => b.n - a.n)];
});
for (const [t, hs] of topicHits) {
  const body = (kind) => hs.filter((h) => h.kind === kind).map((h) => `- ${link(h.name)} (${h.n})`).join('\n') || '- (없음)';
  write(
    `${DIRS.topic}/${topicName(t)}.md`,
    fm({ tags: ['topic'] }) + `# ${t}\n\n키워드가 기준 횟수 이상 나온 노트 (괄호 = 횟수, 많은 순)\n\n## 항목\n${body('항목')}\n\n## 일별\n${body('일별')}\n`,
  );
}

// 허브: 월별 + 홈
const byMonth = new Map();
for (const d of days) byMonth.set(d.date.slice(0, 7), [...(byMonth.get(d.date.slice(0, 7)) || []), d]);
for (const [m, ds] of byMonth) {
  write(`${m} 월.md`, fm({ tags: ['hub'] }) + ds.map((d) => `- ${link(d.date)} (세션 ${d.sessions})`).join('\n') + '\n');
}
const items = itemNotes.filter((n) => n.kind === 'item').sort((a, b) => a.num - b.num);
const lst = (s) => items.filter((n) => n.status === s).map((n) => `- ${link(n.name)}`).join('\n') || '- (없음)';
write(
  `${HOME}.md`,
  fm({ tags: ['hub'] }) +
    `# task-history\n\n\`handoff/\`의 파생 볼트. 원본은 \`handoff/\`, 이 폴더는 \`node docs/obsidian/build_vault.js\` 로 다시 만든다.\n\n` +
    `## 주제\n${topicHits.map(([t, hs]) => `- ${link(topicName(t))} (${hs.length})`).join('\n')}\n\n` +
    `## 월별\n${[...byMonth.keys()].map((m) => `- ${link(m + ' 월')}`).join('\n')}\n\n` +
    `## 열린 항목 (NEXT.md)\n${lst('open')}\n\n## 완료 항목 (done.md)\n${lst('done')}\n\n` +
    `## 기타 섹션 (항목이 아닌 NEXT.md·done.md 부분)\n${itemNotes.filter((n) => n.kind !== 'item').map((n) => `- ${link(n.name)}`).join('\n')}\n\n` +
    `## 브랜치\n${[...branchDays.keys()].map((b) => `- ${link(branchName(b))}`).join('\n')}\n`,
);

// 그래프 색 그룹 (나머지 설정은 보존)
const gp = path.join(VAULT, '.obsidian', 'graph.json');
const g = fs.existsSync(gp) ? JSON.parse(fs.readFileSync(gp, 'utf8')) : {};
const rgb = (r, gg, b) => (r << 16) | (gg << 8) | b;
g.colorGroups = [
  { query: 'tag:#open', color: { a: 1, rgb: rgb(230, 80, 80) } },
  { query: 'tag:#done', color: { a: 1, rgb: rgb(110, 170, 110) } },
  { query: 'tag:#summary', color: { a: 1, rgb: rgb(90, 140, 220) } },
  { query: 'tag:#branch', color: { a: 1, rgb: rgb(230, 170, 60) } },
  { query: 'tag:#hub', color: { a: 1, rgb: rgb(170, 110, 220) } },
  { query: 'tag:#topic', color: { a: 1, rgb: rgb(60, 190, 190) } },
];
g.showTags = false;
g.hideUnresolved = true;
fs.writeFileSync(gp, JSON.stringify(g, null, 2), 'utf8');

console.log(`일별 ${days.length} · 항목 ${items.length} · 섹션 ${itemNotes.length - items.length} · 브랜치 ${branchDays.size} · 월 ${byMonth.size} · 주제 ${TOPICS.length}`);
for (const [t, hs] of topicHits) console.log(`  ${t}: 일별 ${hs.filter((h) => h.kind === '일별').length} / 항목 ${hs.filter((h) => h.kind === '항목').length}`);
