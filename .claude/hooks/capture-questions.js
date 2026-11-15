#!/usr/bin/env node
// Stop 훅: 이번 턴에 메인이 사용자에게 던진 질문을 handoff/questions.json(정본 장부)에 status "open"으로 자동 추가한다.
// 답·해소 처리는 자동이 아니다(메인이 손으로). 장부가 없거나 깨져 있으면 아무것도 쓰지 않는다.
// 어떤 오류도 exit 0, stdout 비움 — 훅이 대화를 막지 않는다. (backend-dev 설계, 2026-11-15)
const fs = require('fs'), path = require('path');
const TAIL = 4 * 1024 * 1024, MAX_LEDGER = 256 * 1024, NO_REC = '기록된 권장안 없음';
// 머리줄: 앞뒤 굵게(**)·이모지 변형 문자 허용, 콜론 필수('🙋 물어볼게 블록을…' 같은 본문 오탐 방지)
const HEAD = /^\s*\*{0,2}\s*🙋️?\s*\*{0,2}\s*물어볼게\s*\*{0,2}\s*[:：]\s*\*{0,2}\s*(.*)$/;
const MARK = /\s*[(（](?:권장|Recommended)[)）]\s*/;
const MARK_G = new RegExp(MARK.source, 'g');

function clean(s) { return String(s || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(); }

function stripFences(text) {
  return String(text || '').replace(/```[\s\S]*?```/g, '\n').replace(/```[\s\S]*$/, '\n');
}

// 한 질문 문자열 → {summary, options, recommend}
function parseQuestion(str) {
  const s = clean(str);
  const i = s.indexOf('ⓐ');
  let summary = s, options = '';
  if (i > 0) {
    summary = s.slice(0, i).trim().replace(/[\s:：/\-—]+$/, '');
    options = s.slice(i).trim();
  }
  const recs = [];
  for (const seg of options.split(/(?=[ⓐ-ⓩ])/)) {
    if (MARK.test(seg)) {
      const r = seg.replace(MARK_G, ' ').replace(/^[ⓐ-ⓩ]\s*/, '').replace(/\s*\/\s*$/, '').trim();
      if (r) recs.push(r);
    }
  }
  options = mask(options.replace(MARK_G, ' ').replace(/\s+/g, ' ').trim()).slice(0, 300);
  summary = mask(summary.replace(MARK_G, ' ').replace(/\s+/g, ' ').trim()).slice(0, 300);
  return { summary, options, recommend: mask(recs.join(' / ')).slice(0, 300) || NO_REC };
}

// git 추적 장부로 새지 않게 비밀값·개인정보 모양은 가린다(security 11-15 중)
function mask(s) {
  return String(s || '')
    .replace(/\b(password|passwd|pw|token|secret|api[_-]?key|key)\s*[=:]\s*\S+/gi, '$1=[가림]')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[가림]')
    .replace(/\b\d{6}-?[1-4]\d{6}\b/g, '[가림]')
    .replace(/\b01[016789]-?\d{3,4}-?\d{4}\b/g, '[가림]')
    .replace(/\b[A-Za-z0-9_\-]{32,}\b/g, '[가림]');
}

// 어시스턴트 text 한 덩어리 → 질문 문자열 배열
function fromText(text) {
  const t = stripFences(text).split(/\r?\n/), out = [];
  for (let i = 0; i < t.length; i++) {
    const m = HEAD.exec(t[i]);
    if (!m) continue;
    if (m[1].trim()) { out.push(m[1].trim()); continue; }
    const items = []; let blanks = 0;
    for (let j = i + 1; j < t.length; j++) {
      const ln = t[j];
      if (!ln.trim()) { if (++blanks >= 2) break; continue; }
      blanks = 0;
      if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(ln) || HEAD.test(ln)) break;
      const top = /^-\s+(.*)$/.exec(ln), sub = /^\s+(?:[-*]\s+)?(\S.*)$/.exec(ln);
      if (top) items.push(top[1]);
      else if (sub && items.length) items[items.length - 1] += ' ' + sub[1];
      else if (!items.length) { items.push(ln.trim()); break; } // 목록 없이 문장 1건
      else break;
    }
    out.push(...items);
  }
  return out;
}

function fromAsk(input) {
  const out = [];
  const qs = input && Array.isArray(input.questions) ? input.questions : [];
  for (const q of qs) {
    if (!q || typeof q.question !== 'string') continue;
    const opts = (Array.isArray(q.options) ? q.options : []).slice(0, 26).filter(o => o && typeof o.label === 'string');
    const joined = opts.map((o, k) => String.fromCharCode(0x24D0 + k) + o.label.trim()).join(' ');
    out.push(opts.length ? clean(q.question) + ' ' + joined : clean(q.question));
  }
  return out;
}

function isRealPrompt(o) {
  if (!o || o.type !== 'user' || o.isSidechain || o.isMeta) return false;
  const c = o.message && o.message.content;
  if (typeof c === 'string') return c.trim().length > 0;
  if (!Array.isArray(c)) return false;
  if (c.some(b => b && b.type === 'tool_result')) return false;
  return c.some(b => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim());
}

// JSONL 줄들 → 직전 턴 + 이번 턴의 질문 문자열 배열(순서 유지).
// 직전 턴도 보는 이유: Stop 시점에 마지막 답변이 아직 기록 파일에 없으면 다음 Stop에서 잡기 위해서다(중복은 장부 쪽에서 거른다 — qa 11-15 P1).
function extractQuestions(lines) {
  let blocks = [], prev = [];
  for (const line of lines) {
    if (!line || !line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch (_) { continue; }
    if (!o || o.isSidechain) continue;
    if (isRealPrompt(o)) { prev = blocks; blocks = []; continue; }
    if (o.type !== 'assistant' || !o.message || !Array.isArray(o.message.content)) continue;
    for (const b of o.message.content) if (b) blocks.push(b);
  }
  const out = [];
  for (const b of prev.concat(blocks)) {
    if (b.type === 'text' && typeof b.text === 'string') out.push(...fromText(b.text));
    else if (b.type === 'tool_use' && b.name === 'AskUserQuestion') out.push(...fromAsk(b.input));
  }
  return out;
}

const normKey = s => String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const ymd = d => { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

function nextNums(summary) {
  const set = new Set(); let m; const re = /NEXT\s*(\d+)/g;
  while ((m = re.exec(summary))) set.add(Number(m[1]));
  return [...set];
}

// 장부 원문 + 질문 문자열들 → {text, added} 또는 null(쓰면 안 되거나 추가할 것 없음)
function addToLedger(raw, qstrs, now) {
  if (typeof raw !== 'string' || raw.length > MAX_LEDGER) return null;
  let data; try { data = JSON.parse(raw.replace(/^﻿/, '')); } catch (_) { return null; }
  if (!data || !Array.isArray(data.questions)) return null;
  const seen = new Set(data.questions.map(q => normKey(q && q.summary)));
  const today = ymd(now || new Date()), prefix = `Q-${today}-`;
  let max = 0;
  for (const q of data.questions) {
    const id = q && typeof q.id === 'string' ? q.id : '';
    if (id.startsWith(prefix)) { const n = parseInt(id.slice(prefix.length), 10); if (n > max) max = n; }
  }
  const items = [];
  for (const s of qstrs) {
    const p = parseQuestion(s);
    if (!p.summary) continue;
    const k = normKey(p.summary);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    items.push({ id: `${prefix}${String(++max).padStart(2, '0')}`, summary: p.summary, askedAt: today, next: nextNums(p.summary),
      options: p.options, recommend: p.recommend, status: 'open', answer: '', answeredAt: '', appliedRef: '', source: 'auto' });
  }
  if (!items.length) return null;
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const m = /(\r?\n)\]\}[ \t]*(\r?\n)?\s*$/.exec(raw);
  if (!m) return null;
  const before = raw.slice(0, m.index);
  if (!before.trimEnd().endsWith('}')) return null; // 마지막 줄이 항목이 아니면(빈 목록 등) 손대지 않는다
  const text = before + ',' + eol + items.map(x => JSON.stringify(x)).join(',' + eol) + raw.slice(m.index);
  try { const chk = JSON.parse(text.replace(/^﻿/, '')); if (chk.questions.length !== data.questions.length + items.length) return null; }
  catch (_) { return null; }
  return { text, added: items };
}

function readTailLines(file) {
  const st = fs.statSync(file);
  if (st.size <= TAIL) return fs.readFileSync(file, 'utf8').split('\n');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(TAIL);
    fs.readSync(fd, buf, 0, TAIL, st.size - TAIL);
    const lines = buf.toString('utf8').split('\n');
    lines.shift(); // 잘린 첫 줄 버림
    return lines;
  } finally { fs.closeSync(fd); }
}

const sleep = ms => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) {} };

function writeLedger(ledger, qstrs, now) {
  const LOCK = ledger + '.lock', t0 = Date.now(); let locked = false;
  while (!locked) {
    try { fs.closeSync(fs.openSync(LOCK, 'wx')); locked = true; }
    catch (_) {
      try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 3000) fs.unlinkSync(LOCK); } catch (__) {}
      if (Date.now() - t0 > 3000) return 0; // 못 잡으면 포기(장부를 덮어쓰지 않는다)
      sleep(15 + Math.random() * 25);
    }
  }
  try {
    let raw; try { raw = fs.readFileSync(ledger, 'utf8'); } catch (_) { return 0; }
    const r = addToLedger(raw, qstrs, now);
    if (!r) return 0;
    const tmp = ledger + '.' + process.pid + '.tmp';
    try { fs.writeFileSync(tmp, r.text); fs.renameSync(tmp, ledger); }
    catch (e) { try { fs.unlinkSync(tmp); } catch (_) {} return 0; } // 백신 등이 파일을 쥐면 임시 파일만 치우고 포기
    return r.added.length;
  } finally { try { fs.unlinkSync(LOCK); } catch (_) {} }
}

// payload: Stop 훅 입력. opts: {root, now} (시험용). 추가한 건수를 돌려준다.
function run(payload, opts) {
  const o = opts || {};
  const root = o.root || process.env.CLAUDE_PROJECT_DIR || (payload && payload.cwd) || process.cwd();
  const ledger = path.join(root, 'handoff', 'questions.json');
  if (!payload || !payload.transcript_path || !fs.existsSync(ledger)) return 0;
  const qstrs = extractQuestions(readTailLines(payload.transcript_path));
  if (!qstrs.length) return 0;
  return writeLedger(ledger, qstrs, o.now || new Date());
}

module.exports = { parseQuestion, fromText, fromAsk, extractQuestions, addToLedger, run, normKey };

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', d => raw += d);
  process.stdin.on('end', () => {
    try { run(JSON.parse(raw || '{}')); } catch (_) { /* 수집 실패가 대화를 막지 않는다 */ }
    process.exit(0);
  });
}
