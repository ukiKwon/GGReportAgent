#!/usr/bin/env node
// 서울 25구 사업계획 원문(TXT) -> 시드 CSV 변환기 (034 기관 사업계획 1단계) — 외부 패키지 없음(Node 22).
// 입력: corpus/institutions/{구}/spec/ (00_인덱스 · 01 개요 · 02~0N 장별 사업목록 · 07/08 홈페이지 확인 결과)
// 출력: src/main/resources/plan-seed/{기관ID}_{YYYYMMDD}_plan.csv  (UTF-8 BOM, 머리행·열 순서 = PlanCsv.HEADERS)
// 시각·난수가 없어 입력이 같으면 출력이 바이트 단위로 같다. 사용법: node convert-plan-txt.mjs --help
//
// 규칙(호출자 지시 2026-11-16):
//  - 수집자 칸·출처URL 칸은 비운다(서버가 시드 경로에서 수집자를 seed-txt-convert/1 로 고정, URL 빈칸은 시드 경로만 허용).
//  - 문서는 장(분야)마다 1개. 문서쪽범위 = 장 머리의 쪽 범위, 사업별 원문쪽은 비운다(원문에 사업별 쪽이 없다).
//  - 예산은 원문 숫자·단위를 그대로 적는다. '-'·미표기·빈칸은 0이 아니라 예산상태(원문에 없음)로, 숫자 하나로 정할 수 없으면 확인안됨.
//    단위는 장 머리에 명시되었거나 숫자에 붙어 있을 때만 쓴다(추측 금지).
//  - 확인상태는 07/08 의 사업명과 정규화(공백·괄호 제거) 후 완전 일치할 때만 넣고 나머지는 미조사.
//  - 글 칸이 = + - @ 로 시작하면 서버가 거부하므로 첫 글자를 전각으로 바꾼다(앞 공백은 서버가 trim 해서 소용없다). 바꾼 행은 보고한다.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const DEFAULT_SPEC = path.join(REPO, 'corpus', 'institutions');
const DEFAULT_OUT = path.resolve(HERE, '..', '..', 'src', 'main', 'resources', 'plan-seed');

/** PlanCsv.HEADERS 와 같은 순서(서버 계약). */
export const HEADERS = ['기관ID', '문서명', '원천종류', '대상기간시작', '대상기간끝', '출처URL', '확인일', '수집자', '문서쪽범위', '문서비고',
  '분야번호', '분야명', '사업번호', '상위사업번호', '사업명', '내용', '예산상태', '예산금액', '예산단위', '연차예산', '원문쪽', '확인상태',
  '진행상태', '이행률', '비고'];

/** 구별 설정. 기관 ID 는 029 시드의 INSTITUTION_ID 와 같다(영문 폴더명과 같음을 확인함). */
export const DISTRICTS = {
  dobong: { id: 'dobong', kind: '4개년계획', budget: 'dobong', checks: 'columns' },
  nowon: { id: 'nowon', kind: '주요업무계획', budget: 'nowon', checks: 'numbered' },
  gwangjin: { id: 'gwangjin', kind: '주요업무계획', budget: 'gwangjin', checks: 'columns' },
  dongdaemun: { id: 'dongdaemun', kind: '주요업무계획', budget: 'dongdaemun', checks: 'columns', title: '동대문구 2023년 주요업무계획' },
  dongjak: { id: 'dongjak', kind: '주요업무계획', budget: 'dongjak', checks: 'columns' },
  jung: { id: 'jung', kind: '4개년계획', budget: 'jung', checks: 'inline' },
};

/** 장 파일 이름 규칙. 기본은 '사업목록_예산.txt'. 동대문·동작은 파일 이름이 다르다(02~06만; 07·08 은 확인결과·민원). 언론 정리 19구는 넣지 않는다(사용자 11-16). */
const CHAPTER_RE = {
  dongdaemun: /^0[2-6]_.*_사업목록\.txt$/,
  dongjak: /^0[2-6]_(?:세대별사업_.*|.*분야_사업목록)\.txt$/,
};

const LIM = { cell: 1000, content: 1000, note: 500, name: 300, field: 100, title: 200, years: 300 };
const STATE_NAME = { AMOUNT: '금액', UNVERIFIED: '확인안됨', NOT_IN_SOURCE: '원문에 없음' };
const ITEM_NO_RE = /^[\p{L}\p{N}][\p{L}\p{N} _./()\-]{0,49}$/u;
const PAGE_RE = /^\d{1,4}(~\d{1,4})?$/;
const AMOUNT_RE = /^[0-9][0-9,]{0,18}(\.[0-9]{1,3})?$/;
const FULL = { '=': '＝', '+': '＋', '-': '－', '@': '＠' };

// ---------- 문자열 도구 ----------

export const norm = (s) => String(s).replace(/[\s()[\]]/g, '');

/** 서버 PlanCsv.text 가 거부하는 글자(제어·서식)를 정리한다. 바꾼 내역은 log 에 쌓는다. */
export function cleanText(s, multiline, log, where) {
  let v = String(s ?? '').replace(/\r\n?/g, '\n');
  const before = v;
  v = v.replace(/[\t\u00A0  ]/g, ' ').replace(/[\u2028\u2029]/g, ' ');
  v = v.replace(/\p{Cf}/gu, '').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, '');
  if (multiline) {
    v = v.split('\n').map((l) => l.trim()).join('\n').trim();
  } else {
    v = v.replace(/\n/g, ' ').trim();
  }
  if (v !== before.trim() && log) log.push(`${where}: 제어·서식 문자/탭/줄바꿈 정리`);
  return v;
}

/** 줄 앞의 목록 기호('- ', '· ', '• ', '○ ' 등 기호+공백)를 뗀다 — 서식 정리일 뿐 뜻은 같다(팀 결정 2026-11-16). '※'는 주석 표시라 둔다. */
export function stripMarker(v) {
  return String(v).replace(/^(?:[-–—·•○●◦▪]\s+)+/, '').trim();
}

/** 수식 시작 문자(= + - @)를 전각으로 바꾼다(의미 유지). 바꿨으면 log 에 남긴다. */
export function defuse(v, log, where, label) {
  if (v && FULL[v[0]]) {
    log.push(`${where}: ${label} 첫 글자 '${v[0]}' -> '${FULL[v[0]]}'(전각)`);
    return FULL[v[0]] + v.slice(1);
  }
  return v;
}

export function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// ---------- 예산 ----------

const blankBudget = (state, extra = {}) => ({ state, amount: '', unit: '', years: '', note: '', ...extra });

/** 도봉 연차 '2022:39, 2023:229, ..., 장기:-' -> '2022:39;2023:229'. 형식이 다르면(화살표·범위·문장) 연차는 버린다. */
export function parseYears(inner) {
  let s = String(inner);
  let dropped = false;
  const cut = s.search(/[←※]/);
  if (cut >= 0) { s = s.slice(0, cut).trim(); dropped = true; }
  const out = [];
  for (const t of s.split(/,\s+/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d{4}|장기)(이후)?:(\d[\d,]*(?:\.\d+)?|-)$/.exec(t);
    if (!m) return { years: '', ok: false };
    if (m[3] === '-') continue;
    if (m[2]) return { years: '', ok: false };
    out.push(`${m[1]}:${m[3]}`);
  }
  return { years: out.join(';'), ok: !dropped };
}

/** 도봉 카드형(1장) '계 718 (2022:39, ...)' 해석. */
export function dobongBudget(raw, unit) {
  const r = String(raw).trim();
  const m = /^계\s+(\d[\d,]*(?:\.\d+)?)\s*(?:\(([^)]*)\))?\s*(.*)$/.exec(r);
  if (!m || !unit || parseFloat(m[1].replace(/,/g, '')) <= 0) return blankBudget('UNVERIFIED', { note: '예산 원문: ' + r });
  let years = '';
  let clean = true;
  if (m[2] !== undefined) { const y = parseYears(m[2]); years = y.years; clean = y.ok; }
  if (m[3]) clean = false;
  return blankBudget('AMOUNT', { amount: m[1], unit, years, note: clean ? '' : '예산 원문: ' + r });
}

/** 도봉 한 줄형(2~5장) 금액 토큰 해석('-' · '51,893' · '268+32'). */
export function dobongTokBudget(tok, unit) {
  if (tok === '-') return blankBudget('NOT_IN_SOURCE');
  if (/^\d[\d,]*(\.\d+)?$/.test(tok) && unit && parseFloat(tok.replace(/,/g, '')) > 0) return blankBudget('AMOUNT', { amount: tok, unit });
  return blankBudget('UNVERIFIED', { note: '예산 원문: ' + tok });
}

const AMT_RE = /^(?:연\s*)?(\d[\d,]*(?:\.\d+)?)(백만원|억원|천원)/;
const SUM_RE = /^((?:\d[\d,]*(?:\.\d+)?\+)+\d[\d,]*(?:\.\d+)?)=(\d[\d,]*(?:\.\d+)?)(백만원|억원|천원)/;
const segOf = (after) => after.split(/\s\/\s|\n/)[0].trim().slice(0, 150);

function tryAmount(after) {
  let m = SUM_RE.exec(after);
  if (m) return { ok: true, sum: true, amount: m[2], unit: m[3], seg: segOf(after) };
  m = AMT_RE.exec(after);
  if (m && !/^[+~=-]/.test(after.slice(m[0].length))) return { ok: true, sum: false, amount: m[1], unit: m[2], seg: segOf(after) };
  return { ok: false, seg: segOf(after) };
}

/** 광진 하위 사업(5-1 등): 내용에 융자·발행 규모가 있으면 상위 행과 같이 확인안됨 + 원문 비고, 없으면 원문에 없음. */
export function gwangjinChildBudget(texts) {
  for (const t of texts) {
    const m = /(융자규모|발행규모)[^/\n]*/.exec(t);
    if (m) return blankBudget('UNVERIFIED', { note: '예산 원문: ' + m[0].trim().slice(0, 150) });
  }
  return blankBudget('NOT_IN_SOURCE');
}

/** '기간: 2025.3~2026.5' / '사업기간: 2021.10~2027.12' 처럼 콜론이 붙고 시작·끝 연도가 다른 기간이 있나('지정기간'은 제외, 콜론 없는 '기간 2023.6~…' 표기는 대상 아님). */
export function multiYearPeriod(text) {
  for (const m of String(text).matchAll(/(?:^|[\s/(])(?:사업)?기간:\s*(\d{4})[^~\n/]*~\s*(\d{4})/g)) if (Number(m[2]) > Number(m[1])) return true;
  return false;
}

/** 노원: 사업 카드 전문에서 예산을 찾는다. 소요예산 > 총사업비(확인안됨) > 예산 미기재 > 그 밖의 금액 문구 순. */
export function nowonBudget(text) {
  const spent = [...text.matchAll(/(소요예산|소요비용)\s*:?\s*/g)].map((m) => ({ kw: m[1], ...tryAmount(text.slice(m.index + m[0].length)) }));
  if (spent.length) {
    if (spent.length === 1 && spent[0].ok) {
      const s = spent[0];
      if (!s.sum && !/^연/.test(s.seg) && multiYearPeriod(text)) {   // 여러 해 기간의 소요예산 = 총사업비 규칙(연 단위 칸에 섞지 않는다, 2026-11-16)
        return blankBudget('UNVERIFIED', { note: `예산 구분: 총사업비(전체 기간 사업비) / 예산 원문: ${s.kw} ${s.seg}` });
      }
      return blankBudget('AMOUNT', { amount: s.amount, unit: s.unit, note: s.sum ? `예산 원문: ${s.kw} ${s.seg}` : '' });
    }
    return blankBudget('UNVERIFIED', { note: '예산 원문: ' + spent.map((s) => `${s.kw} ${s.seg}`).join(' ; ') });
  }
  const total = [...text.matchAll(/총사업비(?!의)\s*:?\s*/g)].map((m) => tryAmount(text.slice(m.index + m[0].length)));
  if (total.length) {
    // 예산금액 칸은 '연 단위 예산'만 담는다(팀 결정 2026-11-16: 뜻이 다른 값을 한 칸에 섞지 않는다) — 총사업비는 금액으로 적지 않고 원문을 비고에 남긴다.
    return blankBudget('UNVERIFIED', { note: '예산 구분: 총사업비(전체 기간 사업비) / 예산 원문: ' + total.map((s) => `총사업비 ${s.seg}`).join(' ; ') });
  }
  if (/예산\s*미기재/.test(text)) return blankBudget('NOT_IN_SOURCE');
  const m = /(융자규모|출연|발행규모)[^/\n]*/.exec(text);
  if (m) return blankBudget('UNVERIFIED', { note: '예산 원문: ' + m[0].trim().slice(0, 150) });
  if (/예산\d/.test(text)) return blankBudget('UNVERIFIED', { note: '예산 원문: 시설별 예산이 내용 안에 따로 적혀 있음(내용 참조)' });
  return blankBudget('NOT_IN_SOURCE');
}

/** 광진: '예산:' 줄만 본다('미표기…' = 원문에 없음, 그 밖의 금액 문구는 예산이 아니라 발행·융자 규모라 확인안됨). */
/** 동대문·동작: 사업 카드의 '예산:'·'[예산]' 줄(사업별로 적힌 경우에만 존재). 깨끗한 단일 금액만 금액, 그 밖은 확인안됨 + 원문. */
export const BUDGET_LINE_RE = /^(?:\[예산\]\s*:?|예산\s*:)\s*/;
export function labeledBudget(raw) {
  const r = String(raw ?? '').trim();
  if (!r || /^(?:-|미표기)/.test(r)) return blankBudget('NOT_IN_SOURCE');
  const t = tryAmount(r);
  const m = AMT_RE.exec(r);
  if (t.ok && !t.sum && m && m[0] === r) return blankBudget('AMOUNT', { amount: t.amount, unit: t.unit, note: /^연/.test(r) ? '예산 원문: ' + r : '' });
  return blankBudget('UNVERIFIED', { note: '예산 원문: ' + r });
}

/** 중구: '계 830 (2022:…)' = 2022~2026 누계(단위는 장 머리). 연차 괄호가 깨끗하면 연차예산 칸, 남는 문구가 있으면 원문을 비고에. */
export function jungBudget(raw, unit) {
  const r = String(raw).trim();
  const m = /^계\s+(\d[\d,]*(?:\.\d+)?)\s*(.*)$/.exec(r);
  if (m) {
    if (!unit || !(parseFloat(m[1].replace(/,/g, '')) > 0)) return blankBudget('UNVERIFIED', { note: '예산 원문: ' + r });
    let rest = m[2].trim();
    let years = '';
    for (const g of rest.matchAll(/\(([^()]*)\)/g)) {
      if (!/^\d{4}:/.test(g[1])) continue;
      const y = parseYears(g[1]);
      if (y.ok && y.years) { years = y.years; rest = rest.replace(g[0], '').trim(); break; }
    }
    return blankBudget('AMOUNT', { amount: m[1], unit, years, note: rest ? '예산 원문: ' + r : '' });
  }
  if (/^계\s/.test(r) || /미확인|추정/.test(r)) return blankBudget('UNVERIFIED', { note: '예산 원문: ' + r });
  return blankBudget('NOT_IN_SOURCE', { note: '예산 원문: ' + r });
}

export function gwangjinBudget(raw) {
  if (raw == null) return blankBudget('NOT_IN_SOURCE');
  const r = String(raw).trim();
  if (/^미표기/.test(r)) return blankBudget('NOT_IN_SOURCE', { note: r.length > 3 ? '예산 원문: ' + r : '' });
  return blankBudget('UNVERIFIED', { note: '예산 원문: ' + r });
}

// ---------- 장 파일 해석 ----------

function newItem(no, head, subtopic) {
  return { no, head: head.trim(), lines: [], children: [], subtopic, oneLine: false, cont: [] };
}

/** 장 파일 -> { fieldNo, fieldName, pageRange, declared, headerTotal, unit, items(상위, children 포함), warns } (원시 해석, 예산은 아직) */
export function parseChapter(text, seq, kind) {
  const inlineSpecials = kind === 'nowon';   // 노원만 '(※'·'['·'1)' 로 시작하는 이어진 줄을 새 줄로 본다(광진은 문장 중간의 '[' 가 있다)
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const head = lines[0];
  const warns = [];
  let fieldNo = String(seq);
  let fieldName = head.replace(/\s*[(（].*$/, '').trim();
  let declared = null;
  const hm = /^(\d+)장\.\s+(.+?)\s*[(（](?:(\d+)개\s*사업|p\.)/.exec(head);
  if (hm) {
    fieldNo = hm[1];
    fieldName = hm[2].trim();
    if (hm[3]) declared = Number(hm[3]);
  }
  if (kind === 'dongdaemun') {   // '1. 쾌적한 동대문 (19개 세부사업, 출처: …p.13~22)'
    const dh = /^(\d+)\.\s+(.+?)\s*[(（](\d+)개\s*세부사업/.exec(head);
    if (dh) { fieldNo = dh[1]; fieldName = dh[2].trim(); declared = Number(dh[3]); }
  } else if (kind === 'jung') {   // '# 도시분야 (14개 역점과제, 31개 세부사업, …)'
    fieldName = head.replace(/^#\s*/, '').replace(/\s*[(（].*$/, '').trim();
    const jd = /(\d+)개\s*세부사업/.exec(head);
    if (jd) declared = Number(jd[1]);
  }
  const dm = /확인된\s*(?:대표)?사업\s*개수:\s*(\d+)개/.exec(text);
  if (dm) declared = Number(dm[1]);
  const pm = /p\.\s*(\d+)\s*~\s*(\d+)/.exec(lines.slice(0, 6).join('\n'));
  const pageRange = pm ? `${pm[1]}~${pm[2]}` : '';
  const tm = /총\s*투자계획\s*([\d,.]+)\s*백만원/.exec(head);
  const headerTotal = tm ? tm[1] : null;
  const um = /예산\((백만원|억원|천원)/.exec(text);
  const unit = um ? um[1] : '';

  const items = [];
  let cur = null;
  let child = null;
  let subtopic = '';
  let on = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '');
    if (!on) {
      if (/^\[(세부사업 목록|소주제:)/.test(line)) {
        on = true;
        const sm = /^\[소주제:\s*(.+)\]$/.exec(line);
        if (sm) subtopic = sm[1].trim();
        continue;
      }
      if (/^\[(정책환경|섹션|정책방향)[^\]]*\]/.test(line)) continue;
      const bm = /^\[(.+)\]$/.exec(line);
      if (bm && !/(총계|비고)/.test(bm[1])) {   // 노원 4장처럼 '소주제:' 없이 소주제 대괄호로 시작하는 장
        on = true;
        subtopic = bm[1].trim();
        continue;
      }
      if (!/^■/.test(line)) continue;           // 광진 4~7장은 '[세부사업 목록]' 없이 '■ 소주제' 로 시작한다
      on = true;
    }
    if (/^\[[^\]]*(총계|비고)[^\]]*\]/.test(line)) break;
    if (line.trim() === '') continue;
    let mm;
    if (kind === 'dongdaemun') {
      if ((mm = /^(\d+)\.\s+(.+?)\s*[(（]\d+개\s*사업[^)）]*[)）]\s*$/.exec(line))) { subtopic = mm[2].trim(); cur = null; child = null; continue; }
      if ((mm = /^(\d+-\d+)\.\s+(\S.*)$/.exec(line))) { cur = newItem(mm[1], mm[2], subtopic); items.push(cur); child = null; continue; }
    } else if (kind === 'jung') {
      if ((mm = /^과제(\d+)\.\s*(\S.*)$/.exec(line))) { subtopic = `과제${mm[1]}. ${mm[2].trim()}`; cur = null; child = null; continue; }
      if ((mm = /^ (\d+)\.\s+(\S.*)$/.exec(line))) { cur = newItem(mm[1], mm[2], subtopic); items.push(cur); child = null; continue; }
    }
    if ((mm = /^\[(.+)\]$/.exec(line))) { subtopic = mm[1].replace(/^소주제:\s*/, '').trim(); cur = null; child = null; continue; }
    if ((mm = /^■\s*(.+)$/.exec(line))) { subtopic = mm[1].trim(); cur = null; child = null; continue; }
    if ((mm = /^(\d+)\.\s+(.+)$/.exec(line))) { cur = newItem(mm[1], mm[2], subtopic); items.push(cur); child = null; continue; }
    if ((mm = /^(\d+-\d+)\s+(\S.*)$/.exec(line))) {
      cur = newItem(mm[1], mm[2], subtopic);
      cur.oneLine = true;
      items.push(cur);
      child = null;
      continue;
    }
    if (cur && !cur.oneLine && (mm = /^(\s+)(\d+-\d+)\.\s+(.+)$/.exec(line))) {
      child = { no: mm[2], head: mm[3].trim(), lines: [] };
      cur.children.push(child);
      continue;
    }
    if ((mm = /^(\s*)-\s+(.*)$/.exec(line))) {
      if (!cur) { warns.push(`줄 ${i + 1}: 사업 앞의 글머리 줄을 건너뜀`); continue; }
      if (mm[1].length <= cur.no.length + 2) child = null;   // 상위 사업 글머리 들여쓰기 = "N. " 의 너비
      (child || cur).lines.push(mm[2].trim());
      continue;
    }
    const t = line.trim();
    if (!cur) { warns.push(`줄 ${i + 1}: 사업 앞의 줄을 건너뜀`); continue; }
    if (cur.oneLine) { cur.head += ' ' + t; cur.cont.push(t); continue; }
    const tgt = child || cur;
    if (inlineSpecials && /^(\(?※|\[|\d+\))/.test(t)) { tgt.lines.push(t); continue; }
    if (tgt.lines.length === 0) tgt.head += ' ' + t;
    else tgt.lines[tgt.lines.length - 1] += ' ' + t;
  }
  return { fieldNo, fieldName, pageRange, declared, headerTotal, unit, items, warns };
}

/** 동작: 파일 하나에 분야 여러 개('[힘이되는 복지] … (20~21쪽)'). 분야마다 '2026년 중점사업(N개):' 아래 '1.'부터 번호를 새로 시작한다. 입력은 readTxt 로 BOM·줄끝을 정리한 글. */
export function parseDongjakFile(text, seqStart) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const chapters = [];
  let ch = null;
  let cur = null;
  let on = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '');
    let mm;
    if ((mm = /^\[([^\]]+)\]\s*(.*?)\s*\((\d+)(?:~(\d+))?쪽\)$/.exec(line))) {
      ch = { fieldNo: String(seqStart + chapters.length), fieldName: mm[1].trim(), pageRange: mm[4] ? `${mm[3]}~${mm[4]}` : mm[3], declared: null, headerTotal: null, unit: '', items: [], warns: [] };
      chapters.push(ch);
      cur = null;
      on = false;
      continue;
    }
    if (!ch) continue;
    if (/^\[요약\]/.test(line)) break;
    if (/^=+$/.test(line)) continue;
    if (!on) {
      const dm = /^2026년\s*중점사업\((\d+)개/.exec(line);
      if (dm) { on = true; ch.declared = Number(dm[1]); }
      continue;
    }
    if (line.trim() === '') continue;
    if ((mm = /^(\d+)\.\s+(\S.*)$/.exec(line))) { cur = newItem(mm[1], mm[2], ''); ch.items.push(cur); continue; }
    const t = line.trim();
    if (!cur) { ch.warns.push(`줄 ${i + 1}: 사업 앞의 줄을 건너뜀`); continue; }
    if ((mm = /^[-*]\s+(.*)$/.exec(t))) { cur.lines.push(mm[1].trim()); continue; }
    if (cur.lines.length === 0) cur.head += ' ' + t;
    else cur.lines[cur.lines.length - 1] += ' ' + t;
  }
  return chapters;
}

/** 원시 사업 -> 행 후보 { no, parentNo, name, content, budget }. 상위 뒤에 하위가 이어진다. */
export function buildRows(chapter, budgetKind, tag, errs) {
  const out = [];
  const topicLine = (it) => (it.subtopic && budgetKind !== 'dobong' ? [`소주제: ${it.subtopic}`] : []);
  for (const it of chapter.items) {
    let name = it.head;
    let content = [];
    let budget;
    if (it.oneLine) {
      const m = /^(.+?)\s+(\d[\d,]*(?:\.\d+)?(?:\+\d[\d,]*(?:\.\d+)?)?|-)(\s+\(.*\))?(\s*★.*)?\s*$/.exec(it.head);
      if (!m) {
        errs.push(`${tag} ${it.no}: 한 줄 사업 줄을 해석하지 못함`);
        continue;
      }
      name = m[1].trim();
      const tail = `${(m[3] || '').trim()} ${(m[4] || '').trim()}`.trim();
      content = tail ? [tail] : [];
      // 원문 줄바꿈 때문에 사업명 뒤에 붙은 세부 내역 괄호(숫자 포함)는 내용으로 옮긴다(도봉 5-2, 5-3 과 같게).
      // 같은 줄에 적힌 부제 괄호(숫자 없음)나 이어진 줄이 아닌 괄호는 사업명에 둔다.
      for (const piece of it.cont || []) {
        const bm = /^\([^)]*\d[^)]*\)/.exec(piece);
        if (bm && name.endsWith(bm[0]) && name.length > bm[0].length) {
          name = name.slice(0, name.length - bm[0].length).trim();
          content = [bm[0], ...content];
          break;
        }
      }
      budget = dobongTokBudget(m[2], chapter.unit);
    } else if (budgetKind === 'nowon') {
      const k = it.head.indexOf(' - ');
      const rest = k >= 0 ? it.head.slice(k + 3) : '';
      name = (k >= 0 ? it.head.slice(0, k) : it.head).trim();
      const segs = rest.split(/\s\/\s/).map((s) => s.trim()).filter(Boolean);
      content = [...topicLine(it), ...segs, ...it.lines];
      budget = nowonBudget([it.head, ...it.lines].join('\n'));
    } else if (budgetKind === 'dongdaemun' || budgetKind === 'dongjak') {
      const k = it.head.indexOf(' - ');
      const rest = k >= 0 ? it.head.slice(k + 3) : '';
      name = (k >= 0 ? it.head.slice(0, k) : it.head).trim();
      const segs = rest.split(/\s\/\s/).map((s) => s.trim()).filter(Boolean);
      const bi = it.lines.findIndex((l) => BUDGET_LINE_RE.test(l));
      content = [...topicLine(it), ...segs, ...it.lines.filter((_, i) => i !== bi)];
      budget = bi >= 0 ? labeledBudget(it.lines[bi].replace(BUDGET_LINE_RE, '')) : blankBudget('NOT_IN_SOURCE');
    } else if (budgetKind === 'jung') {
      const cm = /\(((?:공약|신규|계속)[^()]*)\)\s*$/.exec(it.head);
      name = (cm ? it.head.slice(0, cm.index) : it.head).trim();
      const bi = it.lines.findIndex((l) => /^예산\s*:/.test(l));
      content = [...topicLine(it), ...(cm ? [`사업구분: ${cm[1].trim()}`] : []), ...it.lines.filter((_, i) => i !== bi)];
      budget = bi >= 0 ? jungBudget(it.lines[bi].replace(/^예산\s*:\s*/, ''), chapter.unit) : blankBudget('NOT_IN_SOURCE');
    } else {
      const bi = it.lines.findIndex((l) => /^예산\s*:/.test(l));
      const braw = bi >= 0 ? it.lines[bi].replace(/^예산\s*:\s*/, '') : null;
      content = [...topicLine(it), ...it.lines.filter((_, i) => i !== bi)];
      if (budgetKind === 'dobong') {
        budget = braw == null ? blankBudget('NOT_IN_SOURCE') : dobongBudget(braw, chapter.unit);
      } else {
        budget = gwangjinBudget(braw);
      }
    }
    out.push({ no: it.no, parentNo: '', name, content: content.join('\n'), budget, top: true });
    for (const c of it.children) {
      const k = c.head.indexOf(': ');
      const cname = (k >= 0 ? c.head.slice(0, k) : c.head).trim();
      const rest = k >= 0 ? c.head.slice(k + 2).trim() : '';
      let cb;
      let cc;
      if (budgetKind === 'dobong') {
        const bm = /계\s+\d[\d,]*(?:\.\d+)?(?:\s*\([^)]*\))?/.exec(rest);
        cb = bm ? dobongBudget(bm[0], chapter.unit) : blankBudget('NOT_IN_SOURCE');
        const left = (bm ? rest.replace(bm[0], '') : rest).replace(/^[\s/]+|[\s/]+$/g, '');
        cc = [...left.split(/\s\/\s/).map((s) => s.trim()).filter(Boolean), ...c.lines];
      } else {
        cb = budgetKind === 'nowon' ? nowonBudget([c.head, ...c.lines].join('\n'))
          : budgetKind === 'gwangjin' ? gwangjinChildBudget([c.head, ...c.lines]) : blankBudget('NOT_IN_SOURCE');
        cc = [...(rest ? [rest] : []), ...c.lines];
      }
      out.push({ no: c.no, parentNo: it.no, name: cname, content: cc.join('\n'), budget: cb, top: false });
    }
  }
  return out;
}

// ---------- 확인 결과(07/08) ----------

export function parseChecks(text, format) {
  const map = new Map();
  const qualified = [];
  const dups = [];
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const put = (name, tok) => {
    const m = /^(확인됨|부분확인|확인안됨)(\(.*\))?$/.exec(tok);
    if (!m) return;
    if (m[2]) { qualified.push(`${name} ${tok}`); return; }
    const key = norm(name);
    if (map.has(key) && map.get(key) !== m[1]) dups.push(name);
    else map.set(key, m[1]);
  };
  if (format === 'columns') {
    for (const line of lines) {
      const m = /^(\S.*?)\s{2,}(\S+)\s{2,}\S/.exec(line);
      if (m) put(m[1], m[2]);
    }
  } else if (format === 'inline') {   // 중구 07: '22. 사업명 확인됨 - 근거' (판정이 같은 줄)
    for (const line of lines) {
      const m = /^\d+\.\s+(.+?)\s+(확인됨|부분확인|확인안됨)\s+-\s/.exec(line);
      if (m) put(m[1], m[2]);
    }
  } else {
    let pending = null;
    for (const line of lines) {
      if (line.trim() === '') continue;
      const n = /^(\d+)\.\s+(.+)$/.exec(line);
      if (n) { pending = n[2].trim(); continue; }
      const s = /^\s+(확인됨|부분확인|확인안됨)(\([^)]*\))?\s+-/.exec(line);
      if (s && pending) put(pending, s[1] + (s[2] || ''));
      pending = null;
    }
  }
  return { map, qualified, dups };
}

// ---------- 구 단위 변환 ----------

const readTxt = (p) => readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

export function buildDistrict(specRoot, id, opts = {}) {
  const cfg = DISTRICTS[id];
  if (!cfg || cfg.id !== id || id !== id.toLowerCase() || !/^[a-z0-9-]{1,64}$/.test(id)) {
    return { id, errors: [`${id}: 기관ID 는 INSTITUTIONS 시드와 같은 소문자 값이어야 함`], rep: [], rows: [], fileName: null };
  }
  const dir =path.join(specRoot, id, 'spec');
  const files = readdirSync(dir).sort();
  const pick = (re) => files.find((f) => re.test(f));
  const chapterFiles = files.filter((f) => (CHAPTER_RE[cfg.budget] || /^\d{2}_.*사업목록_예산\.txt$/).test(f));
  const overview = pick(/^\d{2}_.*개요\.txt$/);
  const indexFile = pick(/인덱스/) || pick(/^00_/);
  const checkFile = pick(/홈페이지검색확인결과/);
  const errors = [];
  const changes = [];
  const rep = [];
  if (!chapterFiles.length || !overview || !checkFile) {
    return { id, errors: [`${id}: 필요한 spec 파일을 찾지 못함(장 ${chapterFiles.length}개, 개요 ${overview}, 확인결과 ${checkFile})`], rep, rows: [], fileName: null };
  }

  const ovText = readTxt(path.join(dir, overview));
  const firstLine = ovText.split('\n')[0].replace(/^#\s*/, '').replace(/\s*개요\s*$/, '').trim();
  const baseTitle = cfg.title || firstLine;
  const pm = /[(（](\d{4})\s*-\s*(\d{4})[)）]/.exec(firstLine) || /(\d{4})년/.exec(firstLine)
    || /(\d{4})년\s*(?:판\s*)?주요업무계획/.exec(ovText.split('\n').slice(1, 8).join('\n'));
  const from = pm ? Number(pm[1]) : NaN;
  const to = pm ? Number(pm[2] || pm[1]) : NaN;
  if (!pm) errors.push(`${id}: 개요 첫 줄에서 대상 기간을 찾지 못함`);

  const checkText = readTxt(path.join(dir, checkFile));
  let checkedOn = opts.checkedOn || null;
  if (!checkedOn) {
    const dm = /조사일 기준:\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/.exec(checkText);
    if (!dm) errors.push(`${id}: ${checkFile} 에서 조사일을 찾지 못함(--checked-on 으로 지정)`);
    else checkedOn = `${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}`;
  }
  const checks = parseChecks(checkText, cfg.checks);

  // 인덱스 '전체 사업 개수 검증'
  const idxPer = new Map();
  const idxNamed = new Map();   // 중구: '도시(31) + 복지건강(29) …' (장 번호 없이 분야 이름)
  let idxTotal = null;
  if (indexFile) {
    const idx = readTxt(path.join(dir, indexFile));
    const at = idx.indexOf('전체 사업 개수 검증');
    if (at >= 0) {
      const seg = idx.slice(at, at + 400).split('\n').slice(0, 4).join('\n');
      for (const m of seg.matchAll(/(\d+)장\((\d+)\)/g)) idxPer.set(m[1], Number(m[2]));
      if (cfg.budget === 'jung') for (const m of seg.matchAll(/([\p{L}]+)\((\d+)\)/gu)) idxNamed.set(m[1], Number(m[2]));
      const tm = /=\s*([\d,]+)개/.exec(seg);
      if (tm) idxTotal = Number(tm[1].replace(/,/g, ''));
    } else if (cfg.budget === 'dongjak') {   // '세대별 6개 챕터 중점사업: … = 39개' + '분야별 7개 챕터 중점사업: … = 56개'
      const sums = [...idx.matchAll(/챕터 중점사업:[^\n]*=\s*(\d+)개/g)].map((m) => Number(m[1]));
      if (sums.length) idxTotal = sums.reduce((a, b) => a + b, 0);
    }
  }
  const idxFor = (ch, f) => {
    if (cfg.budget === 'dongdaemun') return idxPer.get(String(Number(f.slice(0, 2))));   // 인덱스는 파일번호(02~06) 기준 '2장(19)'
    if (cfg.budget === 'jung') { for (const [k, v] of idxNamed) if (ch.fieldName.startsWith(k)) return v; return undefined; }
    return idxPer.get(ch.fieldNo);
  };

  const docs = [];
  const status = { 확인됨: 0, 부분확인: 0, 확인안됨: 0, 미조사: 0 };
  const bstate = { AMOUNT: 0, UNVERIFIED: 0, NOT_IN_SOURCE: 0 };
  let topTotal = 0;
  let rowTotal = 0;
  let yearWarn = 0;
  let chapterMismatch = false;
  const parsed = [];
  for (const f of chapterFiles) {
    const txt = readTxt(path.join(dir, f));
    if (cfg.budget === 'dongjak') parseDongjakFile(txt, parsed.length + 1).forEach((c) => parsed.push({ f, ch: c }));
    else parsed.push({ f, ch: parseChapter(txt, parsed.length + 1, cfg.budget) });
  }
  parsed.forEach(({ f, ch }) => {
    ch.warns.forEach((w) => rep.push(`  경고 ${f} ${w}`));
    const tag = cfg.budget === 'dongjak' ? `${id} ${f.slice(0, 2)} ${ch.fieldName}` : `${id} ${f.slice(0, 2)}`;
    const title = ['gwangjin', 'dongjak', 'jung'].includes(cfg.budget) ? `${baseTitle} ${ch.fieldName}` : `${baseTitle} ${ch.fieldNo}장 ${ch.fieldName}`;
    const cands = buildRows(ch, cfg.budget, tag, errors);
    const doc = { title, fieldNo: ch.fieldNo, fieldName: ch.fieldName, pageRange: ch.pageRange, rows: [] };
    const seen = new Set();
    const topNos = new Set(cands.filter((c) => c.top).map((c) => c.no));
    let sum = 0;
    let top = 0;
    for (const c of cands) {
      const where = `${tag} ${c.no}`;
      if (c.top) top++;
      if (seen.has(c.no)) errors.push(`${where}: 같은 장 안에 사업번호가 겹침`);
      seen.add(c.no);
      if (c.parentNo && !topNos.has(c.parentNo)) errors.push(`${where}: 상위사업번호 ${c.parentNo} 가 없음`);
      const row = {
        fieldNo: ch.fieldNo,
        fieldName: defuse(cleanText(ch.fieldName, false, changes, where), changes, where, '분야명'),
        no: cleanText(c.no, false, changes, where),
        parentNo: c.parentNo,
        name: defuse(stripMarker(cleanText(c.name, false, changes, where)), changes, where, '사업명'),
        content: defuse(c.content.split('\n').map((l) => stripMarker(cleanText(l, false, changes, where))).filter(Boolean).join('\n'), changes, where, '내용'),
        budget: { ...c.budget, note: defuse(cleanText(c.budget.note, true, changes, where), changes, where, '비고') },
      };
      if (!ITEM_NO_RE.test(row.no)) errors.push(`${where}: 사업번호 형식 오류`);
      if (!row.name) errors.push(`${where}: 사업명이 비어 있음`);
      if (row.name.length > LIM.name) errors.push(`${where}: 사업명 ${row.name.length}자(상한 ${LIM.name})`);
      if (row.content.length > LIM.content) errors.push(`${where}: 내용 ${row.content.length}자(상한 ${LIM.content}) — 자르지 않음, 사람이 줄여야 함`);
      if (row.budget.note.length > LIM.note) errors.push(`${where}: 비고 ${row.budget.note.length}자(상한 ${LIM.note})`);
      if (row.budget.years.length > LIM.years) errors.push(`${where}: 연차예산 ${row.budget.years.length}자(상한 ${LIM.years})`);
      if (row.budget.state === 'AMOUNT') {
        if (!AMOUNT_RE.test(row.budget.amount) || !(parseFloat(row.budget.amount.replace(/,/g, '')) > 0)) errors.push(`${where}: 예산금액 형식 오류`);
        if (row.budget.amount.replace(/,/g, '').split('.')[0].length > 15) errors.push(`${where}: 예산금액 정수부 15자리 초과(DB NUMBER(18,3))`);
        if (!row.budget.unit) errors.push(`${where}: 예산단위가 비어 있음`);
        sum += parseFloat(row.budget.amount.replace(/,/g, ''));
        if (row.budget.years) {
          let ys = 0;
          let any = false;
          for (const part of row.budget.years.split(';')) {
            const k = part.indexOf(':');
            if (k === 4) { ys += parseFloat(part.slice(k + 1).replace(/,/g, '')); any = true; }
          }
          if (any && Math.abs(ys - parseFloat(row.budget.amount.replace(/,/g, ''))) > 1e-9) yearWarn++;
        }
      }
      const cs = checks.map.get(norm(row.name));
      row.check = cs || '미조사';
      status[row.check]++;
      bstate[row.budget.state]++;
      doc.rows.push(row);
    }
    topTotal += top;
    rowTotal += doc.rows.length;
    const idxN = idxFor(ch, f);
    if ((idxN != null && top !== idxN) || (ch.declared != null && top !== ch.declared)) chapterMismatch = true;
    const verdict = (a, b) => (b == null ? '비교값 없음' : a === b ? '일치' : '불일치');
    rep.push(`  ${ch.fieldNo}장 ${ch.fieldName}: 상위 사업 ${top}건 / 장 머리 ${ch.declared ?? '-'} (${verdict(top, ch.declared)}) / 인덱스 ${idxN ?? '-'} (${verdict(top, idxN)}) / 하위 ${doc.rows.length - top}건 / 쪽 ${ch.pageRange || '-'}`);
    if (ch.headerTotal) rep.push(`      예산 합 참고: 장 머리 ${ch.headerTotal}${ch.unit} / 변환 행의 금액 합 ${Math.round(sum * 1000) / 1000}${ch.unit} (금액 상태 행만, 하위 포함 — 단순 참고)`);
    docs.push(doc);
  });

  rep.push(`  전체 상위 사업 ${topTotal}건 / 인덱스 ${idxTotal ?? '-'} (${idxTotal == null ? '비교값 없음' : topTotal === idxTotal ? '일치' : '불일치'}), 전체 행 ${rowTotal}`);
  rep.push(`  예산상태: 금액 ${bstate.AMOUNT} / 확인안됨 ${bstate.UNVERIFIED} / 원문에 없음 ${bstate.NOT_IN_SOURCE}, 연차 합이 계와 다른 행 ${yearWarn}(서버는 경고로만 처리)`);
  rep.push(`  확인상태: 확인됨 ${status.확인됨} / 부분확인 ${status.부분확인} / 확인안됨 ${status.확인안됨} / 미조사 ${status.미조사} (07·08 완전 일치만 반영, 단서 붙은 판정 ${checks.qualified.length}건은 미조사로 둠${checks.dups.length ? `, 상충 ${checks.dups.length}건` : ''})`);
  if (changes.length) rep.push(`  정리·변경한 칸 ${changes.length}건:\n${changes.map((c) => '    - ' + c).join('\n')}`);

  const mismatch = chapterMismatch || (idxTotal != null && topTotal !== idxTotal);
  let fileName = null;
  const rows = [];
  if (!errors.length) {
    if (!checkedOn) errors.push(`${id}: 확인일 없음`);
    else {
      fileName = `${id}_${checkedOn.replace(/-/g, '')}_plan.csv`;
      for (const d of docs) {
        for (const r of d.rows) {
          const b = r.budget;
          rows.push([id, d.title, cfg.kind, from, to, '', checkedOn, '', d.pageRange, '', r.fieldNo, r.fieldName, r.no, r.parentNo, r.name,
            r.content, STATE_NAME[b.state], b.state === 'AMOUNT' ? b.amount : '', b.state === 'AMOUNT' ? b.unit : '', b.years, '', r.check, '', '', b.note]);
        }
      }
    }
  }
  return { id, errors, rep, rows, fileName, topTotal, rowTotal, idxTotal, mismatch, docCount: docs.length };
}

export function toCsv(rows) {
  const lines = [HEADERS, ...rows].map((r) => r.map(csvCell).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

// ---------- CLI ----------

const USAGE = `사용법: node convert-plan-txt.mjs [옵션]
  (옵션 없음)          dobong·nowon·gwangjin·dongdaemun·dongjak·jung 모두 변환해 src/main/resources/plan-seed/ 에 쓴다
  --district <id>      dobong | nowon | gwangjin | dongdaemun | dongjak | jung | all(기본)
  --check              쓰지 않고 요약·검산만 출력
  --strict             건수 검산이 불일치이면 종료 코드 1 (오류는 항상 1)
  --checked-on <날짜>  확인일(YYYY-MM-DD) 지정(기본: 07/08 의 '조사일 기준')
  --spec-dir <경로>    corpus/institutions 위치
  --out-dir <경로>     출력 폴더
  --help`;

function parseArgs(argv) {
  const o = { district: 'all', check: false, strict: false, checkedOn: null, spec: DEFAULT_SPEC, out: DEFAULT_OUT, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--check') o.check = true;
    else if (a === '--strict') o.strict = true;
    else if (a === '--district') o.district = argv[++i];
    else if (a === '--checked-on') o.checkedOn = argv[++i];
    else if (a === '--spec-dir') o.spec = path.resolve(argv[++i]);
    else if (a === '--out-dir') o.out = path.resolve(argv[++i]);
    else throw new Error(`알 수 없는 옵션: ${a}`);
  }
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log(USAGE); return; }
  if (o.checkedOn && !/^\d{4}-\d{2}-\d{2}$/.test(o.checkedOn)) throw new Error('--checked-on 은 YYYY-MM-DD');
  const ids = o.district === 'all' ? Object.keys(DISTRICTS) : [o.district];
  for (const id of ids) if (!DISTRICTS[id]) throw new Error(`알 수 없는 구: ${id}`);
  let fail = false;
  for (const id of ids) {
    const r = buildDistrict(o.spec, id, { checkedOn: o.checkedOn });
    console.log(`[${id}] ${r.fileName ?? '(파일 없음)'}`);
    r.rep.forEach((l) => console.log(l));
    if (r.errors.length) {
      fail = true;
      console.log(`  오류 ${r.errors.length}건 — 이 구는 쓰지 않음:`);
      r.errors.forEach((e) => console.log('    - ' + e));
      continue;
    }
    if (o.strict && r.mismatch) { fail = true; console.log('  --strict: 건수 검산 불일치'); }
    if (!o.check) {
      mkdirSync(o.out, { recursive: true });
      const p = path.join(o.out, r.fileName);
      writeFileSync(p, toCsv(r.rows));
      console.log(`  쓴 파일: ${p} (행 ${r.rows.length})`);
    }
  }
  if (fail) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
