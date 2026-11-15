#!/usr/bin/env node
// Stop 훅: 이번 턴에 메인이 사용자에게 던진 질문을 handoff/questions.json(정본 장부)에 status "open"으로 자동 추가한다.
//   (AskUserQuestion에 같은 턴 답이 이미 있으면 바로 answered/answerSource:"auto".)
// UserPromptSubmit 훅(`node capture-questions.js answer`): 직전 턴 질문 중 장부에서 open인 것을 사용자가 방금 친 글로 answered 처리한다.
//   (답이 질문과 무관한 말이어도 그대로 기록된다 — 해소·반영(done)은 여전히 메인이 손으로.) 장부가 없거나 깨져 있으면 아무것도 쓰지 않는다.
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
  // security 11-15 보강: _접두 키·한글 키·공백 구분, URL 쿼리 값, Bearer, AWS 키, 사설 IP, 유선·국제 전화, 계좌·카드(숫자 10자리 이상 묶음 — 날짜는 제외)
  return String(s || '')
    .replace(/(^|[^A-Za-z])((?:access_|refresh_|x[_-]?)?(?:password|passwd|pwd|pw|token|secret|api[_-]?key|key|auth|sid|jsessionid|session)|비밀번호|비번|암호)(\s*[=:]\s*|\s+)\S+/gi, '$1$2=[가림]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [가림]')
    .replace(/([?&][^=\s&]+=)[^&\s]+/g, '$1[가림]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[가림]')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[가림]')
    .replace(/\b(?:10|127|192\.168|172\.(?:1[6-9]|2\d|3[01]))(?:\.\d{1,3}){2,3}\b/g, '[가림]')
    .replace(/\b\d{6}-?[1-4]\d{6}\b/g, '[가림]')
    .replace(/(?:\+82[- ]?|\b0)1[016789][- ]?\d{3,4}[- ]?\d{4}\b/g, '[가림]')
    .replace(/(?:\+82[- ]?|\b0)\d{1,2}[- ]?\d{3,4}[- ]?\d{4}\b/g, '[가림]')
    .replace(/\b\d{2,6}([- ])\d{2,6}(?:\1\d{2,6}){0,2}\b|\b\d{10,19}\b/g, m => (m.replace(/\D/g, '').length >= 10 ? '[가림]' : m))
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

const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// res: {text, err} | null — 같은 tool_use의 tool_result. 답이 없으면 answer ''.
function fromAskDetailed(input, res) {
  const out = [];
  const qs = input && Array.isArray(input.questions) ? input.questions : [];
  for (const q of qs) {
    if (!q || typeof q.question !== 'string') continue;
    const opts = (Array.isArray(q.options) ? q.options : []).slice(0, 26).filter(o => o && typeof o.label === 'string');
    const joined = opts.map((o, k) => String.fromCharCode(0x24D0 + k) + o.label.trim()).join(' ');
    let answer = '';
    if (res && !res.err && res.text && !/rejected|doesn't want to proceed/i.test(res.text)) {
      const m = new RegExp('"' + escRe(q.question) + '"\\s*=\\s*"([^"]*)"').exec(res.text);
      answer = mask((m ? m[1] : res.text).replace(MARK_G, ' ').replace(/\s+/g, ' ').trim()).slice(0, 300);
    }
    out.push({ q: opts.length ? clean(q.question) + ' ' + joined : clean(q.question), answer });
  }
  return out;
}
const fromAsk = input => fromAskDetailed(input, null).map(x => x.q);

// 사람이 친 글이 아닌 자동 주입 메시지(에이전트 보고·작업 알림·다른 세션 메시지·시스템 알림)는 답도 턴 경계도 아니다
// (2026-11-15 사고: 에이전트 보고가 질문의 답으로 기록됨)
const INJECTED = /^\s*(?:<(?:agent-message|task-notification|cross-session-message|system-reminder|command-name|command-message|local-command-stdout|bash-input|bash-stdout)\b|\[SYSTEM NOTIFICATION|\[Subagent hand-back\])/i;
function isInjected(text) { return INJECTED.test(String(text || '')); }

function isRealPrompt(o) {
  if (!o || o.type !== 'user' || o.isSidechain || o.isMeta) return false;
  const c = o.message && o.message.content;
  if (typeof c === 'string') return c.trim().length > 0 && !isInjected(c);
  if (!Array.isArray(c)) return false;
  if (c.some(b => b && b.type === 'tool_result')) return false;
  const texts = c.filter(b => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim()).map(b => b.text);
  return texts.length > 0 && !texts.every(isInjected);
}

function resText(c) {
  if (typeof c === 'string') return c;
  return Array.isArray(c) ? c.map(x => (x && typeof x.text === 'string' ? x.text : '')).join(' ') : '';
}
// 사용자 입력에서 편집기·시스템이 붙인 태그 블록(<ide_selection>·<system-reminder> 등)을 뺀 본문(qa 11-15 P3)
function promptText(c) {
  return resText(c).replace(/<(ide_[\w-]+|system-reminder)\b[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/\s+/g, ' ').trim();
}

// JSONL 줄들 → {prev, blocks, results}. results: tool_use_id → {text, err}
function scan(lines) {
  let blocks = [], prev = [], lastPrompt = ''; const results = {};
  for (const line of lines) {
    if (!line || !line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch (_) { continue; }
    if (!o || o.isSidechain) continue;
    if (isRealPrompt(o)) { prev = blocks; blocks = []; lastPrompt = promptText(o.message.content); continue; }
    if (o.type === 'user' && o.message && Array.isArray(o.message.content)) {
      for (const b of o.message.content)
        if (b && b.type === 'tool_result' && typeof b.tool_use_id === 'string') results[b.tool_use_id] = { text: resText(b.content), err: !!b.is_error };
      continue;
    }
    if (o.type !== 'assistant' || !o.message || !Array.isArray(o.message.content)) continue;
    for (const b of o.message.content) if (b) blocks.push(b);
  }
  return { prev, blocks, results, lastPrompt };
}

function detail(blocks, results) {
  const out = [];
  for (const b of blocks) {
    if (b.type === 'text' && typeof b.text === 'string') for (const q of fromText(b.text)) out.push({ q, answer: '' });
    else if (b.type === 'tool_use' && b.name === 'AskUserQuestion') out.push(...fromAskDetailed(b.input, results[b.id]));
  }
  return out;
}

// Stop 수집용: 직전 턴 + 이번 턴(직전 턴도 보는 이유: Stop 시점에 마지막 답변이 아직 기록 파일에 없으면 다음 Stop에서 잡기 위해서다 — qa 11-15 P1)
// 직전 턴 질문이 이제야 장부에 들어가는 경우(Stop 때 기록 지연·Esc 중단) 그 뒤 사용자 입력이 곧 답이므로 answered로 넣는다(qa 11-15 P2).
function extractDetailed(lines) {
  const s = scan(lines);
  const reply = mask(s.lastPrompt.startsWith('/') ? '' : s.lastPrompt).slice(0, 300);
  const prev = detail(s.prev, s.results).map(x => (x.answer || !reply ? x : { q: x.q, answer: reply }));
  return prev.concat(detail(s.blocks, s.results));
}
function extractQuestions(lines) { return extractDetailed(lines).map(x => x.q); }

// 답 기록용: 사용자가 방금 답하는 대상 턴만. 새 prompt가 이미 기록돼 있으면 blocks가 비어 prev가 대상 턴이다.
// prompt가 주어지면: 이번 턴이 비었을 때 마지막 기록 프롬프트가 바로 그 prompt일 때만 prev로 넘어간다(즉시 중단 턴에서 그 앞 턴 질문이 오기록되지 않게 — security 11-15 하).
function extractTarget(lines, prompt) {
  const s = scan(lines);
  const same = prompt == null || s.lastPrompt === promptText(String(prompt));
  const turn = s.blocks.length ? s.blocks : same ? s.prev : [];
  return detail(turn, s.results).map(x => x.q);
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
  for (const e of qstrs) {
    const s = typeof e === 'string' ? e : e && e.q, ans = typeof e === 'string' ? '' : String((e && e.answer) || '');
    const p = parseQuestion(s);
    if (!p.summary) continue;
    const k = normKey(p.summary);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    items.push({ id: `${prefix}${String(++max).padStart(2, '0')}`, summary: p.summary, askedAt: today, next: nextNums(p.summary),
      options: p.options, recommend: p.recommend, status: ans ? 'answered' : 'open', answer: ans, answeredAt: ans ? today : '', appliedRef: '', source: 'auto' });
    if (ans) items[items.length - 1].answerSource = 'auto';
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

// 장부 원문 + 대상 질문 키 집합 + 사용자 답 → {text, changed} 또는 null.
// open이고 summary 키가 같은 한 줄 항목만 그 줄을 JSON.stringify로 교체한다. 다른 줄은 바이트 그대로.
function answerLedger(raw, keys, prompt, now) {
  if (typeof raw !== 'string' || raw.length > MAX_LEDGER) return null;
  let data; try { data = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch (_) { return null; }
  if (!data || !Array.isArray(data.questions)) return null;
  const ans = mask(String(prompt || '').replace(/\s+/g, ' ').trim()).slice(0, 300);
  if (!ans) return null;
  const today = ymd(now || new Date()), changed = [];
  const lines = raw.split('\n').map(line => {
    const m = /^(\s*)(\{.*\})(,?)(\s*)$/.exec(line);
    if (!m) return line;
    let q; try { q = JSON.parse(m[2]); } catch (_) { return line; }
    if (!q || q.status !== 'open' || !keys.has(normKey(q.summary))) return line;
    changed.push(q.id);
    return m[1] + JSON.stringify(Object.assign({}, q, { status: 'answered', answer: ans, answeredAt: today, answerSource: 'auto' })) + m[3] + m[4];
  });
  if (!changed.length) return null;
  const text = lines.join('\n');
  try {
    const chk = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (chk.questions.length !== data.questions.length) return null;
    if (chk.questions.filter(q => changed.includes(q.id) && q.status === 'answered').length !== changed.length) return null;
  } catch (_) { return null; }
  return { text, changed };
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

// fn(raw) → {text, count} | null. 잠금 → 읽기 → 변환 → 임시파일 rename. 못 쓰면 0.
function withLedger(ledger, fn) {
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
    const r = fn(raw);
    if (!r) return 0;
    const tmp = ledger + '.' + process.pid + '.tmp';
    try { fs.writeFileSync(tmp, r.text); fs.renameSync(tmp, ledger); }
    catch (e) { try { fs.unlinkSync(tmp); } catch (_) {} return 0; } // 백신 등이 파일을 쥐면 임시 파일만 치우고 포기
    return r.count;
  } finally { try { fs.unlinkSync(LOCK); } catch (_) {} }
}

function writeLedger(ledger, qstrs, now) {
  return withLedger(ledger, raw => { const r = addToLedger(raw, qstrs, now); return r && { text: r.text, count: r.added.length }; });
}

// payload: Stop 훅 입력. opts: {root, now} (시험용). 추가한 건수를 돌려준다.
function run(payload, opts) {
  const o = opts || {};
  const root = o.root || process.env.CLAUDE_PROJECT_DIR || (payload && payload.cwd) || process.cwd();
  const ledger = path.join(root, 'handoff', 'questions.json');
  if (!payload || !payload.transcript_path || !fs.existsSync(ledger)) return 0;
  const qstrs = extractDetailed(readTailLines(payload.transcript_path));
  if (!qstrs.length) return 0;
  return writeLedger(ledger, qstrs, o.now || new Date());
}

// payload: UserPromptSubmit 훅 입력({transcript_path, cwd, prompt}). 답으로 바꾼 건수를 돌려준다.
function runAnswer(payload, opts) {
  const o = opts || {};
  const root = o.root || process.env.CLAUDE_PROJECT_DIR || (payload && payload.cwd) || process.cwd();
  const ledger = path.join(root, 'handoff', 'questions.json');
  const raw = payload && typeof payload.prompt === 'string' ? payload.prompt : '';
  const prompt = isInjected(raw) ? '' : promptText(raw); // 자동 주입 메시지는 답이 아니다, 편집기 태그는 뺀다
  if (!prompt || prompt.startsWith('/') || !payload.transcript_path || !fs.existsSync(ledger)) return 0;
  const keys = new Set(extractTarget(readTailLines(payload.transcript_path), prompt).map(s => normKey(parseQuestion(s).summary)).filter(Boolean));
  if (!keys.size) return 0;
  return withLedger(ledger, raw => { const r = answerLedger(raw, keys, prompt, o.now || new Date()); return r && { text: r.text, count: r.changed.length }; });
}

module.exports = { parseQuestion, fromText, fromAsk, extractQuestions, extractTarget, addToLedger, answerLedger, run, runAnswer, normKey };

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', d => raw += d);
  process.stdin.on('end', () => {
    try { const p = JSON.parse(raw || '{}'); if (process.argv[2] === 'answer') runAnswer(p); else run(p); } catch (_) { /* 수집 실패가 대화를 막지 않는다 */ }
    process.exit(0);
  });
}
