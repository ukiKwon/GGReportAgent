#!/usr/bin/env node
// Stop 훅: 이번 턴에 메인이 사용자에게 던진 질문을 handoff/questions.json(정본 장부)에 status "open"으로 자동 추가한다.
//   질문 추가만 한다. 답(answer)·상태(status) 변경은 하지 않는다 — 사용자 글·에이전트 보고·AskUserQuestion 응답 어느 것도
//   답으로 쓰지 않고, 답·해소(answered/done)는 메인이 손으로 기록한다(사용자 결정 2026-11-15, NEXT 84 ②).
//   장부가 없거나 깨져 있으면 아무것도 쓰지 않는다. 어떤 오류도 exit 0, stdout 비움 — 훅이 대화를 막지 않는다.
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

// summary/options 경계(NEXT 88): '문장 안 첫 ⓐ'가 아니라 선택지 목록의 시작 = 첫 ⓑ 바로 앞의 마지막 ⓐ.
// ⓑ가 없으면 첫 ⓐ(기존 동작). 앞 문장이 MIN_SUMMARY자 미만이면 자르지 않는다('앞서'만 남던 Q-2026-11-16-42 사례).
const MIN_SUMMARY = 3;   // "앞서"처럼 한두 글자만 남는 경우만 막는다(10이면 "두 번째 질문" 같은 정상 짧은 질문까지 안 잘림)
// 선택지 목록의 ⓐ = 그 뒤에 나오는 첫 원문자가 ⓑ인 첫 ⓐ("앞서 ⓑ로 정한…? ⓐ 유지 ⓑ 변경"도 맞게 — qa 11-16). 없으면 첫 ⓐ.
function splitIndex(s) {
  let i = -1;
  for (let k = s.indexOf('ⓐ'); k >= 0; k = s.indexOf('ⓐ', k + 1)) {
    const m = /[ⓐ-ⓩ]/.exec(s.slice(k + 1));
    if (m && m[0] === 'ⓑ') { i = k; break; }
  }
  if (i < 0) i = s.indexOf('ⓐ');
  if (i <= 0) return -1;
  return s.slice(0, i).replace(/[\s:：/\-—]+$/, '').length < MIN_SUMMARY ? -1 : i;
}

// 한 질문 문자열 → {summary, options, recommend}
function parseQuestion(str) {
  const s = clean(str);
  const i = splitIndex(s);
  let summary = s, options = '';
  if (i > 0) {
    summary = s.slice(0, i).trim().replace(/[\s:：/\-—]+$/, '');
    options = s.slice(i).trim();
  }
  const recs = [];
  for (const seg of (i > 0 ? options : s).split(/(?=[ⓐ-ⓩ])/)) {
    if (/^[ⓐ-ⓩ]/.test(seg) && MARK.test(seg)) {
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
    // 조사가 붙은 한글 키("비밀번호는 abc123")는 값이 한글이 아닐 때만 — "암호가 걸린 파일" 같은 문장은 두다(11-16 오탐 수정)
    .replace(/(비밀번호|비번|암호)(?:은|는|이|가)(\s*[=:]\s*|\s+)[^\s가-힣]+/g, '$1=[가림]')
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

// AskUserQuestion 입력 → 질문 문자열 배열(질문 + ⓐⓑ 선택지). 응답(tool_result)은 읽지 않는다.
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

// 사람이 친 글이 아닌 자동 주입 메시지(에이전트 보고·작업 알림·다른 세션 메시지·시스템 알림)는 턴 경계가 아니다
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

// JSONL 줄들 → {prev, blocks}. 사람이 친 글(isRealPrompt)은 턴 경계로만 쓰고 내용은 읽지 않는다.
function scan(lines) {
  let blocks = [], prev = [];
  for (const line of lines) {
    if (!line || !line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch (_) { continue; }
    if (!o || o.isSidechain) continue;
    if (isRealPrompt(o)) { prev = blocks; blocks = []; continue; }
    if (o.type !== 'assistant' || !o.message || !Array.isArray(o.message.content)) continue;
    for (const b of o.message.content) if (b) blocks.push(b);
  }
  return { prev, blocks };
}

function detail(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type === 'text' && typeof b.text === 'string') out.push(...fromText(b.text));
    else if (b.type === 'tool_use' && b.name === 'AskUserQuestion') out.push(...fromAsk(b.input));
  }
  return out;
}

// Stop 수집용: 직전 턴 + 이번 턴(직전 턴도 보는 이유: Stop 시점에 마지막 답변이 아직 기록 파일에 없으면 다음 Stop에서 잡기 위해서다 — qa 11-15 P1).
// 중복은 addToLedger가 summary 키로 거른다. 늦게 잡힌 질문도 open으로만 넣는다(답 추정 없음).
function extractQuestions(lines) {
  const s = scan(lines);
  return detail(s.prev).concat(detail(s.blocks));
}

const normKey = s => String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

// 같은 날 유사 중복 판정(NEXT 88). 괄호 속(권장 표시 등)을 지운 뒤 normKey.
const dkey = s => normKey(String(s || '').replace(/[(（][^)）]*[)）]/g, ''));
const bigrams = k => { const set = new Set(); for (let i = 0; i < k.length - 1; i++) set.add(k.slice(i, i + 2)); return set; };
function overlap(a, b) { // 겹친 2-gram ÷ 짧은 쪽 2-gram 수
  const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return 0;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
}
const spans = s => (String(s || '').match(/`[^`]{15,}`/g) || []).map(normKey);
// 같은 명령 코드 스팬(15자↑)이 같거나, summary 2-gram 겹침 0.75↑(짧은 쪽 15자↑) — 그리고 선택지도 비슷(둘 다 비었거나 겹침 0.6↑)
// 한두 낱말만 바꿔 끼운 다른 질문인가(기관명 도봉→노원, 막을까요→허용할까요, 034→035) — qa 11-16 과잉 병합 방지.
// 앞뒤 낱말이 같고 가운데 1~2낱말만 다르며, 바뀐 낱말끼리 앞 2글자도 다르거나 숫자가 다르면 '다른 질문'.
// (확인합니다→확인해요처럼 앞부분이 같은 어미 변화는 같은 질문으로 둔다.)
function swapped(sa, sb) {
  const tok = s => String(s || '').replace(/[(（][^)）]*[)）]/g, '').split(/\s+/).map(normKey).filter(Boolean);
  const A = tok(sa), B = tok(sb);
  let p = 0; while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let q = 0; while (q < A.length - p && q < B.length - p && A[A.length - 1 - q] === B[B.length - 1 - q]) q++;
  const ma = A.slice(p, A.length - q), mb = B.slice(p, B.length - q);
  if (!ma.length || !mb.length || ma.length > 2 || mb.length > 2) return false;
  const ja = ma.join(''), jb = mb.join('');
  const digits = x => (x.match(/\d+/g) || []).join(',');
  return digits(ja) !== digits(jb) || ja.slice(0, 2) !== jb.slice(0, 2);
}
function similar(p, ex) {
  const a = dkey(p.summary), b = dkey(ex.summary);
  if (!a || !b) return false;
  if (swapped(p.summary, ex.summary)) return false;
  const sa = spans(p.summary), sb = spans(ex.summary);
  const same = sa.some(x => sb.includes(x)) || (Math.min(a.length, b.length) >= 15 && overlap(a, b) >= 0.75);
  if (!same) return false;
  const oa = dkey(p.options), ob = dkey(ex.options);
  if (!oa && !ob) return true;
  return !!oa && !!ob && overlap(oa, ob) >= 0.6;
}
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
  const pool = data.questions.filter(q => q && (q.askedAt === today || String(q.id || '').startsWith(prefix)))
    .map(q => ({ summary: q.summary, options: q.options }));   // 같은 날 항목만 유사 판정(NEXT 88)
  let max = 0;
  for (const q of data.questions) {
    const id = q && typeof q.id === 'string' ? q.id : '';
    if (id.startsWith(prefix)) { const n = parseInt(id.slice(prefix.length), 10); if (n > max) max = n; }
  }
  const items = [];
  for (const e of qstrs) {
    const p = parseQuestion(typeof e === 'string' ? e : '');
    if (!p.summary) continue;
    const k = normKey(p.summary);
    if (!k || seen.has(k)) continue;
    if (pool.some(x => similar(p, x))) continue;
    seen.add(k);
    pool.push({ summary: p.summary, options: p.options });
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
