'use strict';
// [목표 기관 추가] '추천받기' 1단계(design-reviewer 11-19 4~6절): 순수 함수 kbb.recommend·recHtml·recNote·recBtnText·addDialogHtml({rec}) + CSS 규격.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const logic = require('../js/logic.js');
const kbb = require('../js/kbboard.js');

const TODAY = new Date(2026, 10, 19);   // 2026-11-19
function p(n) { return logic.localDateStr(new Date(2026, 10, 19 + n)); }
function src(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function rec(id, name, extra) { return Object.assign({ institutionId: id, name: name, region: '11', type: '지자체', confirmed: false }, extra || {}); }
function nIt(r, dl, extra) {
  return Object.assign({ key: r.region + '|' + r.name, rec: r, name: r.name, region: r.region, phase: dl === null ? 'unknown' : 'receiving', deadlineDays: dl === null ? undefined : dl, receiveTo: dl === null ? '' : p(dl), notice: true }, extra || {});
}
function uIt(r, days, conf) { return { key: r.region + '|' + r.name, rec: r, name: r.name, region: r.region, date: p(days), days: days, confidence: conf || '확정' }; }
const sKB = { kb_now: 'KB', last_kb_year: 0, lines_now: [{ rank_cd: 'SINGLE', bank_name: '국민은행', term_from: '2024-01-01', term_to: '2027-12-31' }] };
function sOth(rank, last) { return { kb_now: 'OTHER', last_kb_year: last || 0, lines_now: [{ rank_cd: rank, bank_name: '우리은행', term_from: '2024-01-01', term_to: '2027-12-31' }] }; }
function base(extra) { return Object.assign({ today: TODAY, years: [2026, 2027], sumById: {}, taken: {}, closed: {}, list: [], noWatch: false }, extra || {}); }

const A = rec('IA', '가'), B = rec('IB', '나'), C = rec('IC', '다'), D = rec('ID', '라'), E = rec('IE', '마'), F = rec('IF', '바'), G = rec('IG', '사');

function scenario1() {
  const m = { notice: [nIt(A, 12), nIt(B, 3), nIt(C, 7), nIt(D, 5), nIt(E, null)], upcoming: [uIt(F, 100), uIt(G, 40, '추정')] };
  return kbb.recommend(m, base({
    list: [A, B, C, D, E, F, G],
    sumById: { IA: sKB, IB: sOth('SINGLE', 2022), IC: sOth('SINGLE', 0), ID: sOth('FIRST', 0), IF: sOth('SINGLE', 2021) } }));
}

test('추천: ① 국민은행 금고 기관(재유치·되찾기) → ② 비슷한 기관 → ③ 접수 마감 가까운 기관, 단계 안 정렬은 접수 마감 → 공고 예정일 → 이름', function () {
  const r = scenario1();
  const ids = function (s) { return s.items.map(function (x) { return x.id; }); };
  assert.deepStrictEqual(r.stages.map(function (s) { return s.key; }), ['KB', 'SIM', 'DUE']);
  assert.deepStrictEqual(ids(r.stages[0]), ['IB', 'IA', 'IF']);   // D-3, D-12, 그다음 공고 예정(확정) 기관
  assert.deepStrictEqual(ids(r.stages[1]), ['IC']);               // 단수 금고 지자체 = 국민은행이 금고인 가와 같은 구성
  assert.deepStrictEqual(ids(r.stages[2]), ['ID']);               // 1·2금고라 비교 불가 → ③
  assert.strictEqual(r.n, 5);
  assert.strictEqual(r.allEmpty, false);
  const a = r.byId.IA, b = r.byId.IB, f = r.byId.IF, c = r.byId.IC, d = r.byId.ID;
  assert.strictEqual(a.chip, '재유치'); assert.strictEqual(a.why, '지금 국민은행 단수 금고 · 접수 마감 D-12');
  assert.strictEqual(b.chip, '되찾기'); assert.strictEqual(b.why, '2022년까지 국민은행 금고, 지금 우리은행 · 접수 마감 D-3');
  assert.strictEqual(f.chip, '되찾기'); assert.strictEqual(f.why, '2021년까지 국민은행 금고, 지금 우리은행 · 공고 예정 ' + p(100));
  assert.strictEqual(c.chip, ''); assert.strictEqual(c.why, '지자체 · 단수 금고 — 국민은행이 금고인 지자체와 같은 구성 · 접수 마감 D-7');
  assert.strictEqual(d.why, '접수 마감 D-5 (' + p(5) + ')');
  assert.ok(!r.byId.IE && !r.byId.IG);   // 마감 미상 공고·추정 예정은 추천하지 않는다
});

test('추천: 기본 연도 — 공고 중은 올해, 확정 예정은 공고 예정일의 연도, 고를 수 있는 연도 밖이면 관심', function () {
  const r = scenario1();
  assert.deepStrictEqual([r.byId.IA.kind, r.byId.IA.year], ['GOAL', 2026]);
  assert.deepStrictEqual([r.byId.IF.kind, r.byId.IF.year], ['GOAL', 2027]);   // p(100) = 2027-02-27
  assert.strictEqual(kbb.recBtnText(r.byId.IA), '2026 목표로 고르기');
  const m = { notice: [], upcoming: [uIt(F, 100)] };
  const r2 = kbb.recommend(m, base({ list: [F], years: [2026], sumById: { IF: sOth('SINGLE', 2021) } }));
  assert.deepStrictEqual([r2.byId.IF.kind, r2.byId.IF.year], ['WATCH', 0]);
  assert.strictEqual(kbb.recBtnText(r2.byId.IF), '관심으로 고르기');
  const r3 = kbb.recommend(m, base({ list: [F], years: [2026], noWatch: true, sumById: { IF: sOth('SINGLE', 2021) } }));
  assert.strictEqual(r3.n, 0); assert.strictEqual(r3.excl.other, 1); assert.ok(!r3.byId.IF);
});

test('추천: 이미 목표·관심·올해 입찰 종료는 빼고 수를 센다(결과가 국민은행이거나 모르는 곳도 종료로 센다)', function () {
  const H = rec('IH', '아'), I = rec('II', '자'), J = rec('IJ', '차'), K = rec('IK', '카');
  const m = { notice: [nIt(G, 4), nIt(H, 5), nIt(I, 6), nIt(J, 7), nIt(K, 8)], upcoming: [] };
  const futKb = { kb_now: 'KB', last_kb_year: 0, lines_now: [{ rank_cd: 'SINGLE', bank_name: '국민은행', term_from: '2027-01-01' }] };
  const r = kbb.recommend(m, base({
    taken: { IG: { kind: 'GOAL', year: 2026 }, IH: { kind: 'WATCH', year: 0 } },
    closed: { II: { cd: 'NOTICE_CLOSED', date: '2026-09-30' }, IJ: { cd: 'CONTRACT_DECIDED', date: '2027-01-01' }, IK: { cd: 'NOTICE_CLOSED', date: '2026-09-30' } },
    list: [G, H, I, J, K],
    sumById: { IJ: futKb, IK: sOth('SINGLE', 2022) } }));   // IK: 되찾기 대상이지만 미래 약정 줄이 없어 결과를 모른다 → 종료로 센다
  assert.deepStrictEqual(r.excl, { goal: 1, watch: 1, closed: 3, other: 0 });
  assert.strictEqual(r.n, 0);
  assert.strictEqual(r.allEmpty, true);
  assert.strictEqual(r.stages[0].next.length, 0);
});

test('추천: 다음 회차 준비 — 올해 결과가 다른 은행으로 정해진 되찾기 기관은 내년(y0+1) 목표, 연도 밖이면 관심, awaiting 공고도 입찰 종료 근거가 있으면 든다', function () {
  const L = rec('IL', '청주시');
  const sum = { kb_now: 'OTHER', last_kb_year: 2022, lines_now: [{ rank_cd: 'SINGLE', bank_name: '우리은행', term_from: '2027-01-01', term_to: '2030-12-31' }] };
  const m = { notice: [nIt(L, null, { phase: 'awaiting' })], upcoming: [] };
  const o = { list: [L], sumById: { IL: sum }, closed: { IL: { cd: 'CONTRACT_DECIDED', date: '2027-01-01' } } };
  const r = kbb.recommend(m, base(o));
  const s = r.stages[0];
  assert.strictEqual(s.items.length, 0); assert.strictEqual(s.next.length, 1); assert.strictEqual(s.n, 1); assert.strictEqual(r.n, 1);
  const x = s.next[0];
  assert.deepStrictEqual([x.kind, x.year, x.chip, x.cls], ['GOAL', 2027, '되찾기', 'next']);
  assert.strictEqual(x.why, '올해 결과가 정해짐(금고 약정 2027-01-01 시작, 우리은행) · 다음 회차를 미리 준비');
  assert.strictEqual(r.excl.closed, 0);
  const r2 = kbb.recommend(m, base(Object.assign({}, o, { years: [2026] })));
  assert.deepStrictEqual([r2.stages[0].next[0].kind, r2.stages[0].next[0].year], ['WATCH', 0]);
  const r3 = kbb.recommend(m, base(Object.assign({}, o, { years: [2026], noWatch: true })));
  assert.strictEqual(r3.stages[0].next.length, 0); assert.strictEqual(r3.excl.other, 1);
  // 입찰 종료 근거가 없는 awaiting 공고는 풀에 들지 않는다(세지도 않는다)
  const r4 = kbb.recommend(m, base({ list: [L], sumById: { IL: sum } }));
  assert.strictEqual(r4.n, 0); assert.deepStrictEqual(r4.excl, { goal: 0, watch: 0, closed: 0, other: 0 });
});

test('추천: 한 기관은 한 번만 — 공고 중·예정에 함께 있어도 하나, ① 기관은 ②에 다시 나오지 않는다', function () {
  const m = { notice: [nIt(A, 12), nIt(B, 3)], upcoming: [uIt(A, 90), uIt(C, 50)] };
  const r = kbb.recommend(m, base({ list: [A, B, C], sumById: { IA: sKB, IB: sOth('SINGLE', 2022), IC: sOth('SINGLE', 0) } }));
  const all = [];
  r.stages.forEach(function (s) { s.items.concat(s.next).forEach(function (x) { all.push(x.id); }); });
  assert.deepStrictEqual(all.slice().sort(), ['IA', 'IB', 'IC']);
  assert.strictEqual(r.stages[0].items.length, 2); assert.deepStrictEqual(r.stages[1].items.map(function (x) { return x.id; }), ['IC']);
  assert.strictEqual(r.byId.IA.why, '지금 국민은행 단수 금고 · 접수 마감 D-12');   // 공고 중 쪽이 이긴다
});

test('추천: 빈 단계 사유 — 예전 자료 없음·지금도 없음 / 지금은 있음 / 자료 있으나 0곳, 되찾기 누락 안내', function () {
  const none = kbb.recommend({ notice: [], upcoming: [] }, base());
  assert.strictEqual(none.stages[0].empty, 'emptyKbSkip'); assert.strictEqual(none.stages[0].formerMissing, false);
  assert.strictEqual(none.stages[1].empty, 'emptySim'); assert.strictEqual(none.stages[2].empty, 'emptyDue');
  assert.strictEqual(none.allEmpty, true);
  const now = kbb.recommend({ notice: [], upcoming: [] }, base({ list: [A], sumById: { IA: sKB } }));   // 지금 KB 기관은 있으나 풀에 없음
  assert.strictEqual(now.stages[0].empty, 'emptyKbNone'); assert.strictEqual(now.stages[0].formerMissing, true);
  const some = kbb.recommend({ notice: [nIt(A, 12)], upcoming: [] }, base({ list: [A], sumById: { IA: sKB } }));   // 지금 KB 기관만 있고 예전 자료 없음
  assert.strictEqual(some.stages[0].empty, ''); assert.strictEqual(some.stages[0].formerMissing, true);
  assert.strictEqual(scenario1().stages[0].formerMissing, false);   // 예전 자료가 있으면 안내 없음
  assert.doesNotThrow(function () { kbb.recommend(null, null); });
  assert.strictEqual(kbb.recommend(null, null).n, 0);
});

function dueMany(n, extra) {
  const recs = [], notice = [];
  for (let i = 1; i <= n; i += 1) { const r = rec('D' + i, '기관' + i); recs.push(r); notice.push(nIt(r, i)); }
  return { recs: recs, r: kbb.recommend({ notice: notice, upcoming: [] }, base(Object.assign({ list: recs, years: [2026] }, extra || {}))) };
}

test('추천 마크업: 단계당 5줄 + [나머지 n곳 보기], 펼치면 전부·버튼 없음, 줄 버튼은 연도 글자와 aria-label·describedby', function () {
  const d = dueMany(7);
  const h = kbb.recHtml(d.r, {});
  assert.strictEqual((h.match(/data-rec="/g) || []).length, 5);
  assert.ok(h.indexOf('<button type="button" class="hb-tag more" data-more="DUE" aria-label="접수 마감이 가까운 기관 나머지 2곳 보기">나머지 2곳 보기</button>') > 0);
  assert.ok(h.indexOf('<h4><span class="no">3</span>접수 마감이 가까운 기관 <b>7</b>곳</h4>') > 0);
  assert.ok(h.indexOf('공고 중이거나 1년 안에 공고가 확정된 기관 중 <b>7</b>곳을 추천합니다.') > 0);
  assert.ok(/aria-label="서울? ?기관1 2026 목표로 고르기"|aria-label="[^"]*기관1 2026 목표로 고르기"/.test(h));
  assert.ok(h.indexOf('>2026 목표로 고르기</button>') > 0);
  const m = /aria-describedby="(hb-r\d+w)"/.exec(h); assert.ok(m && h.indexOf('id="' + m[1] + '"') > 0);
  const ids = h.match(/id="hb-r\d+w"/g); assert.strictEqual(new Set(ids).size, ids.length);
  const all = kbb.recHtml(d.r, { more: { DUE: true } });
  assert.strictEqual((all.match(/data-rec="/g) || []).length, 7); assert.ok(all.indexOf('data-more=') < 0);
  assert.ok(h.indexOf('<span class="d">D-1</span>') > 0);   // 날짜·D-n은 고정폭 span
  assert.ok(h.indexOf('추천 근거: 입찰 공고 현황 · 금고 약정 · 행안부 금고지정 현황') > 0);
});

test('추천 마크업: 제외 한 줄(0인 항목은 뺌·전부 0이면 줄 없음), 빈 사유·전부 빔·공고 현황 없음 문장, 이스케이프', function () {
  const X = '<img src=x onerror=alert(1)>';
  const bad = rec('IX', X);
  const r = kbb.recommend({ notice: [nIt(bad, 3), nIt(G, 4)], upcoming: [] }, base({ list: [bad, G], years: [2026], taken: { IG: { kind: 'GOAL' } }, closedUnknown: true }));
  const h = kbb.recHtml(r, {});
  assert.ok(h.indexOf('<img') < 0 && h.indexOf('&lt;img') > 0);
  assert.ok(h.indexOf('이미 목표 1곳은 뺐습니다.') > 0 && h.indexOf('관심 0곳') < 0);
  assert.ok(h.indexOf('입찰 공고 현황을 받지 못해 올해 입찰이 끝난 기관을 가리지 못했습니다. 고른 뒤 주의 상자를 확인하세요.') > 0);
  assert.ok(kbb.recHtml(dueMany(2).r, {}).indexOf('뺐습니다') < 0);
  const e = kbb.recHtml(kbb.recommend({ notice: [], upcoming: [] }, base()), {});
  assert.ok(e.indexOf('추천할 기관이 없습니다. 위 칸에 기관 이름을 2자 이상 적어 찾으세요.') > 0 && e.indexOf('<h4') < 0);
  const k = kbb.recHtml(kbb.recommend({ notice: [nIt(D, 5)], upcoming: [] }, base({ list: [D], sumById: { ID: sOth('FIRST') } })), {});
  assert.ok(k.indexOf('예전 국민은행 금고 기록이 아직 반입되지 않아 이 단계를 건너뜁니다.') > 0);   // ① 비어 있고 지금·예전 자료 둘 다 없음
  assert.ok(k.indexOf('종류·금고 구성이 같은 기관 중 공고 중이거나 공고가 확정된 곳이 없습니다.') > 0);
  assert.ok(k.indexOf('<h4><span class="no">1</span>국민은행이 금고인·금고였던 기관 <b>0</b>곳</h4>') > 0);   // 빈 단계도 머리는 남긴다
});

test('추천 마크업: 다음 회차 준비는 ① 안 소제목(h5)·기본 연도 버튼', function () {
  const L = rec('IL', '청주시');
  const sum = { kb_now: 'OTHER', last_kb_year: 2022, lines_now: [{ rank_cd: 'SINGLE', bank_name: '우리은행', term_from: '2027-01-01' }] };
  const r = kbb.recommend({ notice: [nIt(L, null, { phase: 'awaiting' })], upcoming: [] }, base({ list: [L], sumById: { IL: sum }, closed: { IL: { cd: 'CONTRACT_DECIDED', date: '2027-01-01' } } }));
  const h = kbb.recHtml(r, {});
  assert.ok(h.indexOf('<h5>다음 회차 준비 — 올해 결과가 정해진 곳 <b>1</b>곳</h5>') > 0);
  assert.ok(h.indexOf('>2027 목표로 고르기</button>') > 0 && h.indexOf('<span class="hb-rk">되찾기</span>') > 0);
});

test('추천 근거 줄: 되찾기·재유치·다음 회차만 #hb-a-note에 잇고, 비슷한 기관·마감 가까운 기관은 없다', function () {
  const r = scenario1();
  assert.strictEqual(kbb.recNote(r.byId.IA), '재유치 추천 — 지금 국민은행 금고입니다.');
  assert.strictEqual(kbb.recNote(r.byId.IB), '되찾기 추천 — 예전(2022년까지) 국민은행 금고였고 지금은 우리은행입니다.');
  assert.strictEqual(kbb.recNote(r.byId.IC), ''); assert.strictEqual(kbb.recNote(r.byId.ID), ''); assert.strictEqual(kbb.recNote(null), '');
});

test('대화창 마크업: addDialogHtml({rec:true})만 [추천받기]·패널(접힘·hidden) — 이름표 줄 오른쪽, Tab 순서 버튼 → 검색 칸 → 패널', function () {
  const m = { q: '', year: 2026, tag: '', note: '', pickText: '' }, o = { years: [2026], tags: [] };
  const off = kbb.addDialogHtml(m, o);
  assert.ok(off.indexOf('hb-a-rec') < 0);
  assert.ok(off.indexOf('<div class="tm-reason-row"><label for="hb-a-q">기관 (필수)</label></div><input type="text" id="hb-a-q"') > 0);   // 예전 모양 그대로
  const on = kbb.addDialogHtml(m, Object.assign({ rec: true }, o));
  assert.ok(on.indexOf('<label for="hb-a-q">기관 (필수)</label><button type="button" class="hb-tag" id="hb-a-recbtn" aria-expanded="false" aria-controls="hb-a-rec">추천받기</button></div>') > 0);
  assert.ok(on.indexOf('<div id="hb-a-rec" class="hb-rec" role="group" aria-labelledby="hb-a-rech" hidden></div>') > 0);
  assert.ok(on.indexOf('id="hb-a-recbtn"') < on.indexOf('id="hb-a-q"') && on.indexOf('id="hb-a-q"') < on.indexOf('id="hb-a-rec"') && on.indexOf('id="hb-a-rec"') < on.indexOf('id="hb-a-box"'));
  assert.ok(on.indexOf('id="hb-a-go"') > on.indexOf('id="hb-a-rec"'));   // 저장 버튼은 기존 하나
  assert.strictEqual((on.match(/id="hb-a-go"/g) || []).length, 1);
});

test('index.html·kbboard.js: 추천 패널 CSS(새 색·새 변수 없음) + 와이어링(서버 요청 없음, 포커스 이동, 줄 버튼은 칸 채우기만)', function () {
  const html = src('index.html');
  const a = html.indexOf('/* 국민은행 상태 현황판(kbboard.js) 시작'), b = html.indexOf('/* 국민은행 상태 현황판 끝 */');
  const css = html.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\.hb-rec \{[^}]*margin-top:8px[^}]*border:1px solid var\(--line\)[^}]*border-radius:var\(--r\)[^}]*background:var\(--panel\)/.test(css));
  assert.ok(/\.hb-rec li \{[^}]*grid-template-columns:minmax\(0,1fr\) auto[^}]*border-top:1px solid var\(--line\)/.test(css));
  assert.ok(/\.hb-rec \.hb-rk \{[^}]*border:1px solid var\(--line-strong\)/.test(css) && /\.hb-rec \.hb-rk \{[^}]*font-size:12px/.test(css));
  assert.ok(/@media \(max-width:880px\) \{ \.hb-rec li \{ grid-template-columns:1fr; \}/.test(css));
  assert.deepStrictEqual(css.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
  const js = src('js/kbboard.js');
  const fn = js.slice(js.indexOf('kbb.recommend = function'), js.indexOf('kbb.addState = function'));
  assert.ok(fn.length > 500 && !/fetch\(|saveTarget|\.get\(|\.post\(/.test(fn));   // 화면 계산만
  const open = js.slice(js.indexOf('function openAdd(pre)'), js.indexOf('function submitAdd('));
  assert.ok(open.indexOf("b.id === 'hb-a-recbtn'") > 0 && open.indexOf("b.hasAttribute('data-rec')") > 0 && open.indexOf("b.hasAttribute('data-more')") > 0);
  const pick = open.slice(open.indexOf('const pickRec'), open.indexOf('ov.addEventListener(\'input\''));
  assert.ok(pick.indexOf('submitAdd') < 0 && pick.indexOf('kbb.recNote') > 0 && pick.indexOf('m.busy') > 0);   // 줄 버튼은 칸 채우기만, 저장 중에는 무시
});
