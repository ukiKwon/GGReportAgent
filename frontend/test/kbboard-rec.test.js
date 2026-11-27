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

test('추천: ① 국민은행 금고 기관(재유치·되찾기) → ② 비슷한 기관 → ③ 공고 중(마감 미정은 뒤) → ⑤ 추정 공고 예정, 묶음 안 정렬은 접수 마감 → 공고 예정일 → 이름', function () {
  const r = scenario1();
  const ids = function (s) { return s.items.map(function (x) { return x.id; }); };
  assert.deepStrictEqual(r.stages.map(function (s) { return s.key; }), ['KB', 'SIM', 'NOTICE', 'PLAN', 'EST', 'END']);
  assert.deepStrictEqual(ids(r.stages[0]), ['IB', 'IA', 'IF']);   // D-3, D-12, 그다음 공고 예정(확정) 기관
  assert.deepStrictEqual(ids(r.stages[1]), ['IC']);               // 단수 금고 지자체 = 국민은행이 금고인 가와 같은 구성
  assert.deepStrictEqual(ids(r.stages[2]), ['ID', 'IE']);         // 1·2금고라 비교 불가 → ③, 마감 미정(IE)은 뒤
  assert.deepStrictEqual(ids(r.stages[3]), []);
  assert.deepStrictEqual(ids(r.stages[4]), ['IG']);               // 추정 공고 예정은 ⑤(①②를 거치지 않는다)
  assert.strictEqual(r.n, 7);
  assert.strictEqual(r.allEmpty, false);
  const a = r.byId.IA, b = r.byId.IB, f = r.byId.IF, c = r.byId.IC, d = r.byId.ID;
  assert.strictEqual(a.chip, '재유치'); assert.strictEqual(a.why, '지금 국민은행 단수 금고 · 접수 마감 D-12');
  assert.strictEqual(b.chip, '되찾기'); assert.strictEqual(b.why, '2022년까지 국민은행 금고, 지금 우리은행 · 접수 마감 D-3');
  assert.strictEqual(f.chip, '되찾기'); assert.strictEqual(f.why, '2021년까지 국민은행 금고, 지금 우리은행 · 공고 예정 ' + p(100));
  assert.strictEqual(c.chip, ''); assert.strictEqual(c.why, '지자체 · 단수 금고 — 국민은행이 금고인 지자체와 같은 구성 · 접수 마감 D-7');
  assert.strictEqual(d.why, '접수 마감 D-5 (' + p(5) + ')');
  assert.strictEqual(r.byId.IE.why, '공고 중 · 접수 마감일 미정');   // 마감 미정 공고도 ③에 든다
  assert.strictEqual(r.byId.IG.why, '추정 ' + p(40).slice(0, 7) + ' (확정 아님)');
  assert.deepStrictEqual([r.byId.IG.kind, r.byId.IG.year, r.byId.IG.chip], ['GOAL', 2026, '']);
});

function mkSix() {
  const mk = function (id, name) { return rec(id, name); };
  const N1 = mk('IN1', '공고미정'), N2 = mk('IN2', '공고셋'), N3 = mk('IN3', '공고열'), P1 = mk('IP1', '확정예정'), E1 = mk('IE1', '추정일'), E2 = mk('IE2', '추정이'), E3 = mk('IE3', '추정삼');
  const S = function (id, name, end) { return { key: '11|' + name, name: name, region: '11', endDate: end, rec: mk(id, name) }; };
  const S1 = S('IS1', '끝일', '2027-03-31'), S2 = S('IS2', '끝이', '2027-09-30'), S3 = S('IS3', '끝삼', '2027-06-30'), S4 = S('IS4', '끝사', '2030-12-31'), S5 = S('IN2', '공고셋', '2027-01-31');
  const m = { notice: [nIt(A, 12), nIt(N1, null), nIt(N3, 10), nIt(N2, 3)], upcoming: [uIt(P1, 100), uIt(E3, 800, '추정'), uIt(E2, 200, '추정'), uIt(E1, 40, '추정')] };
  return kbb.recommend(m, base({ list: [A, N1, N2, N3, P1, E1, E2, E3], sumById: { IA: sKB }, verified: [], groups: { soon: [S4, S2, S1, S3, S5], next: [] }, taken: { IS3: { kind: 'GOAL', year: 2026 } } }));
}

test('추천 6묶음: 순서·한 기관 한 번·③ 마감 미정은 뒤·⑤ 추정은 추정일의 해·⑥ 협약 종료는 (종료일−6개월)의 해(고를 수 있는 연도 밖이면 가장 가까운 연도)', function () {
  const r = mkSix();
  const ids = function (k) { return r.stages.filter(function (s) { return s.key === k; })[0].items.map(function (x) { return x.id; }); };
  assert.deepStrictEqual(r.stages.map(function (s) { return s.key + ':' + s.no; }), ['KB:1', 'SIM:2', 'NOTICE:3', 'PLAN:4', 'EST:5', 'END:6']);
  assert.deepStrictEqual(r.stages.map(function (s) { return s.label; }), ['국민은행이 금고인·금고였던 기관', '비슷한 기관', '공고 중', '확정 공고 예정', '추정 공고 예정', '협약 종료 1년 안']);
  assert.deepStrictEqual(ids('KB'), ['IA']);
  assert.deepStrictEqual(ids('NOTICE'), ['IN2', 'IN3', 'IN1']);   // D-3, D-10, 마감 미정은 맨 뒤
  assert.deepStrictEqual(ids('PLAN'), ['IP1']);
  assert.deepStrictEqual(ids('EST'), ['IE1', 'IE2', 'IE3']);     // 추정 시기 순
  assert.deepStrictEqual(ids('END'), ['IS1', 'IS2', 'IS4']);     // 종료일 순. IS3는 같은 해 목표가 이미 있어 빠짐, IN2(공고 중)는 ③에서 이미 나와 다시 나오지 않는다
  const all = [];
  r.stages.forEach(function (s) { s.items.concat(s.next).forEach(function (x) { all.push(x.id); }); });
  assert.strictEqual(new Set(all).size, all.length);
  assert.strictEqual(r.n, all.length); assert.strictEqual(r.n, 11);
  assert.strictEqual(r.excl.goal, 1);
  const yr = function (id) { return [r.byId[id].kind, r.byId[id].year]; };
  assert.deepStrictEqual(yr('IE1'), ['GOAL', 2026]);   // 추정일 2026-12-29의 해
  assert.deepStrictEqual(yr('IE2'), ['GOAL', 2027]);   // 2027-06
  assert.deepStrictEqual(yr('IE3'), ['GOAL', 2027]);   // 2029 — 고를 수 있는 연도(2026·2027) 밖이라 가장 가까운 2027
  assert.deepStrictEqual(yr('IS1'), ['GOAL', 2026]);   // 종료 2027-03-31 − 6개월 = 2026-09 → 2026
  assert.deepStrictEqual(yr('IS2'), ['GOAL', 2027]);   // 종료 2027-09-30 − 6개월 = 2027-03 → 2027
  assert.deepStrictEqual(yr('IS4'), ['GOAL', 2027]);   // 종료 2030-12 → 2030 밖 → 가장 가까운 2027
  assert.strictEqual(r.byId.IS1.why, '협약 종료 2027-03-31');
  assert.strictEqual(kbb.recBtnText(r.byId.IS1), '2026 목표로 고르기'); assert.strictEqual(kbb.recBtnText(r.byId.IE3), '2027 목표로 고르기');
  // 종료일이 6월 30일이면 6개월 전은 전해 12월 — 2027-06-30 → 2026
  const rr = kbb.recommend({ notice: [], upcoming: [] }, base({ groups: { soon: [{ key: 'k', name: '끝삼', region: '11', endDate: '2027-06-30', rec: rec('IS3', '끝삼') }], next: [] }, verified: [] }));
  assert.deepStrictEqual([rr.byId.IS3.kind, rr.byId.IS3.year], ['GOAL', 2026]);
  // 관심만 가능한 연도 규칙: 연도 목록이 비면(옛 서버) 관심으로, 관심도 못 쓰면 뺀다
  const rw = kbb.recommend({ notice: [], upcoming: [] }, base({ years: [], groups: { soon: [{ key: 'k', name: '끝삼', region: '11', endDate: '2027-06-30', rec: rec('IS3', '끝삼') }], next: [] }, verified: [] }));
  assert.deepStrictEqual([rw.byId.IS3.kind, rw.byId.IS3.year], ['WATCH', 0]);
  assert.strictEqual(kbb.recommend({ notice: [], upcoming: [] }, base({ years: [], noWatch: true, groups: { soon: [{ key: 'k', name: '끝삼', region: '11', endDate: '2027-06-30', rec: rec('IS3', '끝삼') }], next: [] }, verified: [] })).excl.other, 1);
  assert.strictEqual(kbb.recommend({ notice: [], upcoming: [] }, base({ groups: { soon: [], next: [] } })).stages[5].n, 0);
});

test('추천 마크업(아코디언): 묶음 머리는 단추(aria-expanded·aria-controls), 수 1 이상인 첫 묶음만 펼침, 여러 개 동시 펼침, 접힌 묶음은 hidden, ③~⑥ 0곳은 안 그림, ①② 0곳은 글자 머리 + 이유 문장', function () {
  const r = mkSix();
  const h = kbb.recHtml(r, {});
  assert.ok(h.indexOf('공고 중·공고 예정이거나 협약이 1년 안에 끝나는 기관 중 <b>11</b>곳을 추천합니다. 국민은행과 관련된 기관부터 보입니다.') > 0);
  assert.strictEqual((h.match(/<button type="button" class="hb-rec-h"/g) || []).length, 5);            // KB·NOTICE·PLAN·EST·END(②는 0곳이라 글자 머리)
  assert.ok(h.indexOf('<h4><button type="button" class="hb-rec-h" id="hb-rec-hKB" data-acc="KB" aria-expanded="true" aria-controls="hb-rec-sKB"><span class="no" aria-hidden="true">1</span>국민은행이 금고인·금고였던 기관 <b>1</b>곳<svg') > 0);
  assert.strictEqual((h.match(/aria-expanded="true"/g) || []).length, 1);                              // 첫 묶음만 펼침
  assert.strictEqual((h.match(/aria-expanded="false"/g) || []).length, 4);
  assert.ok(h.indexOf('<div id="hb-rec-sKB">') > 0 && h.indexOf('<div id="hb-rec-sNOTICE" hidden></div>') > 0 && h.indexOf('<div id="hb-rec-sEND" hidden></div>') > 0);
  assert.strictEqual((h.match(/data-rec="/g) || []).length, 1);                                         // 펼친 묶음의 줄만
  assert.ok(h.indexOf('<h4><span class="no">2</span>비슷한 기관 <b>0</b>곳</h4><p class="tm-note">종류·금고 구성이 같은 기관 중 공고 중이거나 공고가 확정된 곳이 없습니다.</p>') > 0);
  assert.ok(h.indexOf('추정은 지난 금고 선정일+약정 주기 또는 약정 만료 6개월 전.') > 0);
  // 여러 개 동시에 펼침, 펼친 ③ 설명 줄·마감 미정 문구·⑤ 근거 줄·⑥ 종료일
  const two = kbb.recHtml(r, { exp: { NOTICE: true, EST: true, END: true } });
  assert.strictEqual((two.match(/aria-expanded="true"/g) || []).length, 4);
  assert.ok(two.indexOf('<p class="tm-note">지금 공고가 나 있는 기관 · 접수 마감이 가까운 순(마감 미정은 뒤)</p>') > 0 && two.indexOf('공고 중 · 접수 마감일 미정') > 0);
  assert.ok(two.indexOf('<span class="d">2026-12</span> (확정 아님)') > 0 && two.indexOf('협약 종료 <span class="d">2027-03-31</span>') > 0);
  assert.ok(two.indexOf('>2026 목표로 고르기</button>') > 0 && /aria-label="[^"]*끝일 2026 목표로 고르기"/.test(two));
  // 펼침을 사용자가 접으면(exp 값이 false) 자동 첫 묶음 펼침도 하지 않는다
  assert.strictEqual((kbb.recHtml(r, { exp: { KB: false } }).match(/aria-expanded="true"/g) || []).length, 0);
  // ③~⑥ 0곳은 그리지 않는다
  const only = kbb.recHtml(kbb.recommend({ notice: [nIt(B, 3)], upcoming: [] }, base({ list: [B], sumById: {} })), {});
  assert.ok(only.indexOf('hb-rec-hPLAN') < 0 && only.indexOf('hb-rec-hEST') < 0 && only.indexOf('hb-rec-hEND') < 0 && only.indexOf('hb-rec-hNOTICE') > 0);
  assert.ok(only.indexOf('id="hb-rec-hNOTICE" data-acc="NOTICE" aria-expanded="true"') > 0);          // ①②가 0곳이면 첫 번째로 수 1 이상인 ③이 펼침
  // 나머지 n곳 보기는 펼친 묶음 안에서
  const many = dueMany(7).r, mh = kbb.recHtml(many, {});
  assert.ok(mh.indexOf('<div id="hb-rec-sNOTICE">') > 0 && mh.indexOf('data-more="NOTICE"') > mh.indexOf('<div id="hb-rec-sNOTICE">'));
  const js = src('js/kbboard.js');
  assert.ok(js.indexOf("b.hasAttribute('data-acc')") > 0 && js.indexOf('m.rec.exp[ak] = b.getAttribute(\'aria-expanded\') !== \'true\'') > 0 && js.indexOf("hb-rec-h' + ak") > 0);   // 펼침 상태는 m.rec.exp, 다시 그린 뒤 포커스는 같은 머리 단추
  assert.ok(js.indexOf('more: {}, exp: {} }') > 0 && js.indexOf('groups: G };') > 0);
});

test('CSS(사용자 1차 수정 11-24): 사유·연도 칸 폭, [목표 기관 추가] 채움, 고른 기관 띠 틴트·그림자·등장·감소 설정, 묶음 머리 단추', function () {
  const html = src('index.html');
  assert.ok(/\.dlg-f textarea \{[^}]*display:block[^}]*width:100%[^}]*box-sizing:border-box[^}]*min-height:64px[^}]*resize:vertical/.test(html));
  assert.ok(/\.hb-dlg #hb-a-year, \.hb-dlg #hb-m-year \{[^}]*display:block[^}]*width:100%[^}]*box-sizing:border-box/.test(html));
  assert.ok(/#hb-add \{[^}]*height:32px[^}]*font-weight:700[^}]*background:var\(--accent-color\)[^}]*border:1px solid var\(--accent-color\)/.test(html));
  assert.ok(/#hb-add:hover \{[^}]*color-mix\(in srgb, var\(--accent-color\) 86%, black\)/.test(html) && /#hb-add:focus-visible \{[^}]*outline:2px solid var\(--accent-color\)[^}]*outline-offset:2px/.test(html));
  assert.ok(/\.hb-selbar \{[^}]*min-height:72px[^}]*padding:0 16px[^}]*color-mix\(in srgb, var\(--accent-color\) 12%, var\(--panel\)\)[^}]*border-top:2px solid var\(--accent-color\)[^}]*box-shadow:0 -6px 16px -6px rgba\(19,20,22,\.28\)/.test(html));
  assert.ok(/\.hb-selbar:not\(\[hidden\]\) \{ animation:hbSelIn \.36s cubic-bezier\(\.22,1,\.36,1\) backwards; \}/.test(html) && /@keyframes hbSelIn \{ from \{ min-height:0; max-height:0; overflow:hidden; transform:translateY\(24px\); \} to \{ min-height:72px; max-height:72px; overflow:hidden; transform:none; \} \}/.test(html));   // opacity 없음(현황판 블록 opacity 금지), 높이를 0에서 72px로 펴며 올라온다(사용자 11-27)
  assert.ok(/\.hb-selbar button \{ height:36px; padding:0 16px; \}/.test(html));
  assert.ok(/@media \(prefers-reduced-motion:reduce\) \{ \.hb-selbar:not\(\[hidden\]\) \{ animation:none; \} \}/.test(html));
  assert.ok(/\.hb-selbar \.n \{[^}]*color:var\(--fg\)[^}]*font-weight:700/.test(html) && !/\.hb-selbar \.go \{/.test(html) &&/\.hb-selbar\[hidden\] \{ display:none; \}/.test(html));
  assert.ok(/\.hb-rec-h \{[^}]*display:flex[^}]*width:100%[^}]*min-height:32px/.test(html) && /\.hb-rec-h:hover \{ background:var\(--panel2\); \}/.test(html));
  assert.ok(/\.hb-rec-h svg \{[^}]*transition:transform \.2s/.test(html) && /@media \(prefers-reduced-motion:reduce\) \{ \.hb-rec-h svg \{ transition:none; \} \}/.test(html) && /\.hb-rec-h\[aria-expanded="true"\] svg \{ transform:rotate\(180deg\); \}/.test(html));
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

test('추천(qa 11-19 P1-1): 서버 실제 모양 — 지금 국민은행 줄만 있어도 종료 + KB_VERIFIED leaves면 다음 회차 준비(2027 목표, 되찾기 칩)', function () {
  const L = rec('IL', '청주시');
  const sum = { kb_now: 'KB', last_kb_year: 2026, lines_now: [{ rank_cd: 'SINGLE', bank_name: '국민은행', term_from: '2023-01-01', term_to: '2026-12-31' }] };
  const m = { notice: [nIt(L, null, { phase: 'awaiting' })], upcoming: [] };
  const r = kbb.recommend(m, base({ list: [L], sumById: { IL: sum }, closed: { IL: { cd: 'NOTICE_CLOSED', date: '2026-09-30' } }, verified: [{ key: L.region + '|' + L.name, leaves: 2027 }] }));
  assert.strictEqual(r.stages[0].next.length, 1); assert.strictEqual(r.excl.closed, 0);
  const x = r.stages[0].next[0];
  assert.deepStrictEqual([x.kind, x.year, x.chip, x.cls, x.bank, x.start], ['GOAL', 2027, '되찾기', 'next', '다른 은행', '']);
  assert.strictEqual(x.why, '올해 결과가 정해짐(다른 은행으로 정해짐) · 다음 회차를 미리 준비');
  assert.strictEqual(kbb.recNote(x), '다음 회차 준비 추천 — 올해 입찰 결과가 정해졌습니다(다른 은행).');
  // leaves 근거가 없으면(재유치 성공 가능) 종료로만 센다
  const r2 = kbb.recommend(m, base({ list: [L], sumById: { IL: sum }, closed: { IL: { cd: 'NOTICE_CLOSED', date: '2026-09-30' } } }));
  assert.strictEqual(r2.stages[0].next.length, 0); assert.strictEqual(r2.excl.closed, 1);
  // sum.lines_next(시작 전 줄)만으로도 같다 — 은행·시작일이 why에 들어간다
  const sumN = Object.assign({}, sum, { lines_next: [{ bank_name: '우리은행', term_from: '2027-01-01' }] });
  const r3 = kbb.recommend(m, base({ list: [L], sumById: { IL: sumN }, closed: { IL: { cd: 'NOTICE_CLOSED', date: '2026-09-30' } } }));
  const y = r3.stages[0].next[0];
  assert.deepStrictEqual([y.kind, y.year, y.chip, y.bank, y.start], ['GOAL', 2027, '되찾기', '우리은행', '2027-01-01']);
  assert.strictEqual(y.why, '올해 결과가 정해짐(금고 약정 2027-01-01 시작, 우리은행) · 다음 회차를 미리 준비');
  // 다음 약정이 국민은행이면(재유치 성공) leaves가 있어도 줄이 이긴다 — 제외
  const sumK = Object.assign({}, sum, { lines_next: [{ bank_name: '국민은행', term_from: '2027-01-01' }] });
  const r4 = kbb.recommend(m, base({ list: [L], sumById: { IL: sumK }, closed: { IL: { cd: 'NOTICE_CLOSED', date: '2026-09-30' } }, verified: [{ key: L.region + '|' + L.name, leaves: 2027 }] }));
  assert.strictEqual(r4.stages[0].next.length, 0); assert.strictEqual(r4.excl.closed, 1);
  // closedBasis도 lines_next를 시작 전 약정 근거로 본다
  assert.deepStrictEqual(kbb.closedBasis('IL', null, TODAY, sumN), { cd: 'CONTRACT_DECIDED', date: '2027-01-01' });
  assert.strictEqual(kbb.closedBasis('IL', null, TODAY, sum), null);
});

test('추천(11-27 신고): 관심 창(watchOnly)은 모든 줄이 관심 갈래 — 단추 "관심으로 고르기", "목표로 고르기" 없음', function () {
  const m = { notice: [nIt(A, 12), nIt(B, 3), nIt(C, 7), nIt(D, 5), nIt(E, null)], upcoming: [uIt(F, 100), uIt(G, 40, '추정')] };
  const o = { list: [A, B, C, D, E, F, G], sumById: { IA: sKB, IB: sOth('SINGLE', 2022), IC: sOth('SINGLE', 0), ID: sOth('FIRST', 0), IF: sOth('SINGLE', 2021) }, watchOnly: true };
  const r = kbb.recommend(m, base(o));
  const all = [];
  r.stages.forEach(function (s) { s.items.forEach(function (x) { all.push(x); }); (s.next || []).forEach(function (x) { all.push(x); }); });
  assert.ok(all.length > 0);
  all.forEach(function (x) { assert.strictEqual(x.kind, 'WATCH'); assert.strictEqual(kbb.recBtnText(x), '관심으로 고르기'); });
  assert.ok(kbb.recHtml(r, {}).indexOf('목표로 고르기') < 0);
  // 목표 창(watchOnly 없음)은 그대로 GOAL
  const r0 = kbb.recommend(m, base(Object.assign({}, o, { watchOnly: false })));
  assert.strictEqual(r0.byId.IG.kind, 'GOAL');
});

test('추천(qa 11-19 P2-1): 미래 국민 줄이 만든 last_kb_year(오늘 연도 이후)는 되찾기가 아니고 noFormer에도 영향이 없다', function () {
  const M = rec('IM', '미래시');
  const sum = { kb_now: 'OTHER', last_kb_year: 2030, lines_now: [{ rank_cd: 'SINGLE', bank_name: '우리은행', term_from: '2024-01-01', term_to: '2026-12-31' }, { rank_cd: 'SINGLE', bank_name: '국민은행', term_from: '2027-01-01', term_to: '2030-12-31' }] };
  const r = kbb.recommend({ notice: [nIt(M, 6)], upcoming: [] }, base({ list: [M], sumById: { IM: sum } }));
  const x = r.byId.IM;
  assert.ok(!x || (x.chip !== '되찾기' && x.cls !== 'next' && x.cls !== 'regain'));
  assert.strictEqual(r.stages[0].items.filter(function (i) { return i.cls === 'regain'; }).length, 0);
});

test('추천(qa 11-19 P2-2·P2-3): 이미 목표는 줄의 추천 연도와 같은 해일 때만 뺀다 — 올해 목표라도 종료+타 은행이면 다음 회차(내년) 줄로 보인다', function () {
  const L = rec('IL', '청주시');
  const sum = { kb_now: 'OTHER', last_kb_year: 2022, lines_now: [{ rank_cd: 'SINGLE', bank_name: '우리은행', term_from: '2027-01-01' }] };
  const m = { notice: [nIt(L, null, { phase: 'awaiting' })], upcoming: [] };
  const o = { list: [L], sumById: { IL: sum }, closed: { IL: { cd: 'CONTRACT_DECIDED', date: '2027-01-01' } } };
  const r = kbb.recommend(m, base(Object.assign({ taken: { IL: { kind: 'GOAL', year: 2026 } } }, o)));
  assert.strictEqual(r.stages[0].next.length, 1); assert.strictEqual(r.excl.goal, 0); assert.strictEqual(r.byId.IL.year, 2027);
  const r2 = kbb.recommend(m, base(Object.assign({ taken: { IL: { kind: 'GOAL', year: 2027 } } }, o)));   // 내년 목표는 이미 있다 → 제외
  assert.strictEqual(r2.stages[0].next.length, 0); assert.strictEqual(r2.excl.goal, 1);
  const r3 = kbb.recommend(m, base(Object.assign({ taken: { IL: { kind: 'WATCH', year: 0 } } }, o)));   // 관심은 연도와 상관없이 제외
  assert.strictEqual(r3.stages[0].next.length, 0); assert.strictEqual(r3.excl.watch, 1);
  // 공고 중 줄(2026 추천): 2027 목표는 있어도 제외하지 않고, 2026 목표면 제외
  const n = { notice: [nIt(A, 12)], upcoming: [] };
  const a1 = kbb.recommend(n, base({ list: [A], sumById: { IA: sKB }, taken: { IA: { kind: 'GOAL', year: 2027 } } }));
  assert.strictEqual(a1.n, 1); assert.strictEqual(a1.excl.goal, 0); assert.strictEqual(a1.byId.IA.year, 2026);
  const a2 = kbb.recommend(n, base({ list: [A], sumById: { IA: sKB }, taken: { IA: { kind: 'GOAL', year: 2026 } } }));
  assert.strictEqual(a2.n, 0); assert.strictEqual(a2.excl.goal, 1);
});

test('추천(qa 11-19 P3-1·P3-2): 줄 고른 뒤 포커스 순서와 저장 뒤 추천 다시 계산(코드 확인)', function () {
  const js = src('js/kbboard.js');
  const open = js.slice(js.indexOf('function openAdd(pre)'), js.indexOf('function submitAdd('));
  const pick = open.slice(open.indexOf('const pickRec'), open.indexOf('ov.addEventListener(\'input\''));
  assert.ok(pick.indexOf("dq('hb-a-year')") > 0 && pick.indexOf("dq('hb-a-go')") > pick.indexOf("dq('hb-a-year')") && pick.indexOf('hb-a-tag') > pick.indexOf("dq('hb-a-go')") && pick.indexOf("dq('hb-a-q')") > pick.indexOf('hb-a-tag'));
  const sub = js.slice(js.indexOf('function submitAdd('), js.indexOf('function showRow('));
  assert.strictEqual((sub.match(/m\.rec\.data = null/g) || []).length, 2);
});

test('추천: 한 기관은 한 번만— 공고 중·예정에 함께 있어도 하나, ① 기관은 ②에 다시 나오지 않는다', function () {
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
  assert.strictEqual(none.stages[1].empty, 'emptySim');
  assert.deepStrictEqual(none.stages.slice(2).map(function (s) { return s.empty; }), ['', '', '', '']);   // ③~⑥은 0곳이면 문장 없이 그리지 않는다(emptyDue 삭제)
  assert.strictEqual(kbb.REC_MSG.emptyDue, undefined);
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
  assert.ok(h.indexOf('<button type="button" class="hb-tag more" data-more="NOTICE" aria-label="공고 중 나머지 2곳 보기">나머지 2곳 보기</button>') > 0);
  assert.ok(h.indexOf('<span class="no" aria-hidden="true">3</span>공고 중 <b>7</b>곳<svg') > 0 && h.indexOf('aria-expanded="true" aria-controls="hb-rec-sNOTICE"') > 0);   // ①② 0곳이라 수 1 이상인 첫 묶음 = ③
  assert.ok(h.indexOf('공고 중·공고 예정이거나 협약이 1년 안에 끝나는 기관 중 <b>7</b>곳을 추천합니다. 국민은행과 관련된 기관부터 보입니다.') > 0);
  assert.ok(/aria-label="서울? ?기관1 2026 목표로 고르기"|aria-label="[^"]*기관1 2026 목표로 고르기"/.test(h));
  assert.ok(h.indexOf('>2026 목표로 고르기</button>') > 0);
  const m = /aria-describedby="(hb-r\d+w)"/.exec(h); assert.ok(m && h.indexOf('id="' + m[1] + '"') > 0);
  const ids = h.match(/id="hb-r\d+w"/g); assert.strictEqual(new Set(ids).size, ids.length);
  const all = kbb.recHtml(d.r, { more: { NOTICE: true } });
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
