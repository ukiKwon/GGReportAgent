'use strict';
// 제안 진행 띠 5칸 1차(NEXT 120, design 11-25 a222b5f9 §5·§6 + 11-26 열 폭 132·표 정렬): 화면만으로 셀 수 있는 칸만 세고 나머지는 0이 아니라 '—'.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const logic = require('../js/logic.js');
const dash = require('../js/dashboard.js');
const kbb = require('../js/kbboard.js');

const TODAY = new Date(2026, 10, 17);
function p(n) { return logic.localDateStr(new Date(2026, 10, 17 + n)); }
function src(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); }
function rec(id, name, extra) { return Object.assign({ institutionId: id, name: name, region: '11', type: '지자체', confirmed: false }, extra || {}); }
function mkCtx(extra) {
  const recs = { IA: rec('IA', '가', { confirmed: true, contractEnd: p(-3), receiveTo: p(12) }), IB: rec('IB', '나', { contractEnd: p(200) }),
    IC: rec('IC', '다', { confirmed: true, contractEnd: p(30) }), ID: rec('ID', '라', { contractEnd: p(-140) }), IE: rec('IE', '마', {}) };
  return Object.assign({ byInst: recs, sumById: {}, today: TODAY, verified: [], lofin: null, entries: {}, prepOk: true, delayDays: 30, years: [2026, 2027, 2028], actOf: function () { return 'confirm'; } }, extra || {});
}
function tgt(id, tag, extra) {
  return Object.assign({ institution_id: id, institution_name: '이름' + id, region_code: '11', target_no: 1, rev_no: 2, target_year: 2026, tag_cd: tag, tag_name: kbb.TAG[tag], memo: '', can_cancel: true, kind_cd: 'GOAL',
    bank: { kb_now: tag === 'RETAIN' ? 'KB' : 'OTHER', last_kb_year: 2022, lines_now: [{ rank_cd: 'SINGLE', bank_name: tag === 'RETAIN' ? '국민은행' : '우리은행', term_to: '2026-12-31' }] } }, extra || {});
}
const NB = { basis_cd: 'NOTICE_NO_BID', basis_date: '2026-09-30' };
const NC = { basis_cd: 'NOTICE_CLOSED', basis_date: '2026-09-30' };
function row(id, tag, extra, ctx) { return kbb.goalRow(tgt(id, tag, extra), ctx || mkCtx()); }
function rowHtml(r) { return kbb.goalRowHtml(r, { canEdit: true }); }

test('STAGES: 새 이름 5칸·승인 대기는 제안 준비의 sub·3~5칸은 근거 없음, 옛 이름·gate 없음', function () {
  assert.deepStrictEqual(dash.STAGES.map(function (s) { return s.label; }), ['제안 준비 전', '제안 준비', '제안 제출 및 대기', '협약 예정', '협약 완료']);
  assert.deepStrictEqual(dash.STAGES.map(function (s) { return s.sub || ''; }), ['', 'approval', '', '', '']);
  assert.deepStrictEqual(dash.STAGES_UNKNOWN, [2, 3, 4]);
  dash.STAGES.forEach(function (s) { assert.strictEqual('gate' in s, false); });
  const cds = ['CONFIRMED', 'OPEN_PENDING', 'IN_PROGRESS', 'APPROVAL_PENDING', 'WRITABLE', 'WRITING', 'WEIRD'];
  assert.deepStrictEqual(cds.map(dash.stageOf), [0, 0, 1, 1, 1, 1, 1]);
  assert.deepStrictEqual(cds.map(dash.stateRank), [0, 1, 2, 3, 4, 4, 2]);
});

test('prepEntries: 같은 기관은 더 나간 건(rank)·cd·stage, overview 전용은 제안 준비(rank 4)', function () {
  const e = kbb.prepEntries([{ institution_id: 'A', state_cd: 'CONFIRMED' }, { institution_id: 'A', state_cd: 'APPROVAL_PENDING' }, { institution_id: 'B', state_cd: 'CANCELLED' }],
    { items: [{ institution_id: 'H', state: 'RUNNING', done: false }] });
  const by = {}; e.forEach(function (x) { by[x.id] = x; });
  assert.deepStrictEqual([by.A.stage, by.A.rank, by.A.cd], [1, 3, 'APPROVAL_PENDING']);
  assert.deepStrictEqual([by.H.stage, by.H.rank, by.H.cd], [1, 4, 'WRITING']);
  assert.strictEqual(by.B, undefined);
});

test('goalRow 칸 정하기: 기록 없음=준비 전, 입찰 없음+타행=끝난 건, +국민은행·은행 미확인·취소 이력=어느 칸에도 안 넣음, 기록·관심·목표 밖 줄은 그대로', function () {
  let r = row('IB', 'NEW');
  assert.deepStrictEqual([r.stage, r.stageLabel, r.unk, r.endKind], [0, '제안 준비 전', '', '']);
  assert.strictEqual(row('IB', 'NEW', {}, mkCtx({ prepOk: false })).stage, -1);            // 진행 자료를 못 받았으면 정하지 않는다
  r = row('IB', 'NEW', { bid_closed: NB });
  assert.deepStrictEqual([r.stage, r.endKind, r.late, r.hold], [5, 'nobid', false, false]);
  r = row('IA', 'RETAIN', { bid_closed: NB });                                              // 국민은행 유지 = 협약 예정 후보(1차 칸 없음)
  assert.deepStrictEqual([r.stage, r.unk], [-1, 'kb']);
  r = row('IB', 'NEW', { bid_closed: NB, bank: { kb_now: 'NO_RECORD', lines_now: [] } });
  assert.deepStrictEqual([r.stage, r.unk], [-1, 'bank']);
  r = row('IB', 'NEW', { bid_closed: { basis_cd: 'NOTICE_CLOSED', basis_date: '2026-09-30' } });   // 공고 끝남 + 제안 기록 없음 = 준비 전이 아니라 미분류(qa P2-4)
  assert.deepStrictEqual([r.stage, r.unk, r.endKind], [-1, 'closed', '']);
  r = row('IB', 'NEW', { bid_closed: { basis_cd: 'CONTRACT_DECIDED', basis_date: '2026-09-30' } });   // 약정 정해짐도 같다
  assert.deepStrictEqual([r.stage, r.unk], [-1, 'closed']);
  r = row('IB', 'NEW', { bid_closed: { basis_cd: 'NOTICE_CLOSED', basis_date: '2026-09-30' } }, mkCtx({ entries: { IB: { id: 'IB', stage: 1, rank: 2, cd: 'IN_PROGRESS' } } }));
  assert.strictEqual(r.stage, 1);                                                           // 진행 기록이 있으면 그것이 먼저
  r = row('IB', 'NEW', {}, mkCtx({ stopped: { IB: true } }));                                // 개설 뒤 중단(미참여) = 끝난 건 stop
  assert.deepStrictEqual([r.stage, r.endKind, r.unk], [5, 'stop', '']);
  r = row('IB', 'NEW', {}, mkCtx({ stopped: { IB: true }, entries: { IB: { id: 'IB', stage: 1, rank: 2, cd: 'IN_PROGRESS' } } }));
  assert.deepStrictEqual([r.stage, r.unk], [1, '']);                                        // 지금 진행 중인 건이 있으면 그것이 먼저
  r = row('IB', 'NEW', { bid_closed: NB, bank: { kb_now: 'KB', lines_now: [{ rank_cd: 'FIRST', bank_name: '우리은행' }, { rank_cd: 'SECOND', bank_name: '국민은행' }] } });
  assert.deepStrictEqual([r.stage, r.unk], [-1, 'kb']);                                     // 국민은행이 2금고여도 국민은행 유지로 본다(qa P2-3)
  r = row('IB', 'NEW', { bid_closed: NB }, mkCtx({ entries: { IB: { id: 'IB', stage: 1, rank: 2, cd: 'IN_PROGRESS' } } }));
  assert.strictEqual(r.stage, 1);
  assert.deepStrictEqual([row('IB', 'NEW', { kind_cd: 'WATCH' }).stage, row('IB', 'NEW', { kind_cd: 'WATCH' }).unk], [-1, '']);   // 관심 줄
  assert.strictEqual(kbb.goalRow({ institution_id: 'IB', institution_name: '나' }, mkCtx(), true).stage, -1);   // 목표 밖 줄은 칸을 새로 정하지 않는다
});

test('stoppedIds: 개설 뒤 중단(미참여)만 센다, 개설 전 확정 취소(2025 포함)는 무시 → 그 기관은 제안 준비 전', function () {
  assert.strictEqual(kbb.STOP_STATE_NAME, '중단(미참여)');
  const s = kbb.stoppedIds([{ institution_id: 'IA', state_cd: 'CANCELLED', state_name: '확정 취소' }, { institution_id: 'IB', state_cd: 'CANCELLED', state_name: '중단(미참여)' },
    { institution_id: 'IC', state_cd: 'IN_PROGRESS', state_name: '중단(미참여)' }, { institution_id: 'ID', state_cd: 'CANCELLED' }]);
  assert.deepStrictEqual(Object.keys(s), ['IB']);
  const ctx = mkCtx({ stopped: kbb.stoppedIds([{ institution_id: 'IB', state_cd: 'CANCELLED', state_name: '확정 취소', created_at: '2025-03-01' }]) });
  assert.deepStrictEqual([row('IB', 'NEW', {}, ctx).stage, row('IB', 'NEW', {}, ctx).unk], [0, '']);
  const ctx2 = mkCtx({ stopped: kbb.stoppedIds([{ institution_id: 'IB', state_cd: 'CANCELLED', state_name: '중단(미참여)' }]) });
  const rr = [row('IB', 'NEW', {}, ctx2)];
  assert.deepStrictEqual(kbb.endCounts(rr), { drop: null, stop: 1, nobid: 0, rows: 1 });
});

test('합계 규칙: 5칸 + 끝난 건 + 어느 칸에도 못 넣은 줄 = 표 줄 수, 제출·협약 칸은 0이 아니라 —', function () {
  const ctx = mkCtx({ entries: { IA: { id: 'IA', stage: 1, rank: 3, cd: 'APPROVAL_PENDING' } } });
  const rows = kbb.goalRows([tgt('IA', 'RETAIN'), tgt('IB', 'NEW'), tgt('IC', 'NEW', { bid_closed: NB }), tgt('IE', 'NEW', { bid_closed: NC }), tgt('ID', 'RETAIN', { bid_closed: NB })], ctx);
  const c = kbb.stageCounts(rows), e = kbb.endCounts(rows);
  assert.deepStrictEqual(c, [1, 1, 0, 0, 0]);
  assert.deepStrictEqual(e, { drop: null, stop: 0, nobid: 1, rows: 1 });
  assert.strictEqual(kbb.unkCount(rows), 2);
  assert.deepStrictEqual(kbb.subCounts(rows), { approval: 1 });
  assert.strictEqual(c.reduce(function (a, b) { return a + b; }, 0) + e.rows + kbb.unkCount(rows), rows.length);
  const ids = function (f) { return kbb.filterRows(rows, f).map(function (r) { return r.id; }); };
  assert.deepStrictEqual(ids({ stage: 5 }), ['IC']);
  assert.deepStrictEqual(kbb.sortBy(rows, 'stage', 'asc').map(function (r) { return r.id; }), ['IB', 'IA', 'IC', 'ID', 'IE']);   // 끝난 건은 협약 완료 뒤, 미분류는 맨 아래
  assert.deepStrictEqual(kbb.sortBy(rows, 'stage', 'desc').map(function (r) { return r.id; }), ['IA', 'IB', 'IC', 'ID', 'IE']);   // 끝난 건은 방향과 상관없이 5칸 뒤, 미분류는 그 뒤
  assert.strictEqual(kbb.stageName(5), '끝난 건'); assert.strictEqual(kbb.stageName(1), '제안 준비'); assert.strictEqual(kbb.stageName(-1), '');
});

test('stagesHtml 1차: 3~5칸 점선 — + aria-disabled + 이유 문장, 제안 준비 승인 대기 보조, 끝난 건 단추(탈락·중단 —), 못 넣은 줄 문장', function () {
  const ctx = mkCtx({ entries: { IA: { id: 'IA', stage: 1, rank: 3, cd: 'APPROVAL_PENDING' } } });
  const rows = kbb.goalRows([tgt('IA', 'RETAIN'), tgt('IB', 'NEW'), tgt('IC', 'NEW', { bid_closed: NB }), tgt('IE', 'NEW', { bid_closed: NC }), tgt('ID', 'RETAIN', { bid_closed: NB })], ctx);
  const o = { ok: true, active: -1, unknown: dash.STAGES_UNKNOWN, sub: kbb.subCounts(rows), end: kbb.endCounts(rows), unplaced: kbb.unkCount(rows), nOut: 0, outCounts: [] };
  const h = kbb.stagesHtml(kbb.stageCounts(rows), o);
  assert.strictEqual((h.match(/class="hb-sb unk"/g) || []).length, 3);
  assert.ok(h.indexOf('data-stage="2" aria-disabled="true" aria-label="제안 제출 및 대기, 아직 셀 수 없음" aria-describedby="hb-stgs-note"') > 0);
  assert.strictEqual((h.match(/<span class="ct">—<\/span>/g) || []).length, 3);
  assert.strictEqual((h.match(/ disabled[ >]/g) || []).length, 0);                           // aria-disabled만(Tab으로 닿아 이유를 읽는다)
  assert.ok(h.indexOf('<span class="nm">제안 준비</span><span class="sub">승인 대기 1</span><span class="ct">1</span>') > 0);
  assert.ok(h.indexOf('aria-label="제안 준비 1곳, 그중 사전준비 승인 대기 1곳 — 표를 이 단계로 거르기"') > 0);
  assert.ok(h.indexOf('id="hb-stgs-note">3~5칸과 탈락은 아직 세지 않습니다') > 0 && h.indexOf('2곳은 단계를 정할 근거가 아직 없어 어느 칸에도 넣지 않았습니다.') > 0);
  assert.ok(h.indexOf('<button type="button" class="hb-fin" data-stage="5" aria-pressed="false" aria-label="끝난 건: 탈락은 아직 셀 수 없음, 중단 0곳, 입찰 없음(타행 유지) 1곳 — 표를 끝난 건으로 거르기">') > 0);
  assert.ok(h.indexOf('<span class="nm">끝난 건</span><span class="bd">탈락 — · 중단 0 · 입찰 없음(타행 유지) 1</span>') > 0);   // 일부 항목이 —이면 합계를 보이지 않는다
  const on = kbb.stagesHtml(kbb.stageCounts(rows), Object.assign({}, o, { active: 5 }));
  assert.ok(on.indexOf('class="hb-fin" data-stage="5" aria-pressed="true"') > 0 && on.indexOf('— 거르기 끄기">') > 0);
  const none = kbb.stagesHtml([0, 0, 0, 0, 0], { ok: true, unknown: [2, 3, 4], end: { drop: null, stop: null, nobid: 0, rows: 0 } });
  assert.ok(none.indexOf('class="hb-fin" data-stage="5" aria-disabled="true"') > 0 && none.indexOf('class="hb-fin" data-stage="5" aria-pressed') < 0);   // 거를 줄이 없으면 누를 수 없다
});

test('stagesHtml 2차 모양(근거 연결 뒤): unknown 없음·끝난 건 합계 숫자·이유 문장 없음', function () {
  const h = kbb.stagesHtml([1, 2, 1, 1, 1], { ok: true, active: -1, unknown: [], end: { drop: 1, stop: 0, nobid: 2, rows: 3 } });
  assert.ok(h.indexOf('hb-sb unk') < 0 && h.indexOf('hb-stgs-note') < 0 && h.indexOf('<span class="ct">—</span>') < 0);
  assert.ok(h.indexOf('<span class="ct">3</span><span class="bd">탈락 1 · 중단 0 · 입찰 없음(타행 유지) 2</span>') > 0);
  assert.ok(h.indexOf('aria-label="끝난 건 3곳: 탈락 1곳, 중단 0곳, 입찰 없음(타행 유지) 2곳 — 표를 끝난 건으로 거르기"') > 0);
});

test('표 칸: 두 줄(이름 전체+막대 n/5), 공고 전은 지연이 없을 때만 보임, 끝난 건 칩, 미분류 —(이유는 title·sr-only)', function () {
  const a = rowHtml(row('IB', 'NEW', {}, mkCtx({ actOf: function () { return 'later'; } })));
  assert.ok(a.indexOf('<span class="hb-stg two"><span class="lb">제안 준비 전</span><span class="ln2"><span class="hb-pg" aria-hidden="true"><i style="width:20%"></i></span><span class="n">1/5</span><span class="mut">공고 전</span></span></span>') > 0);
  const lt = rowHtml(row('IA', 'RETAIN', {}, mkCtx({ actOf: function () { return 'later'; } })));   // 마감 D-12 → 지연 칩이 있으면 '공고 전'은 눈에 안 보인다(2줄째 폭)
  assert.ok(lt.indexOf('<span class="hb-late">지연</span><span class="sr-only">입찰 공고가 나면 [제안 사전준비]를 쓸 수 있습니다.</span></span></span>') > 0 && lt.indexOf('<span class="mut">공고 전</span>') < 0 && lt.indexOf('class="hb-stg two" title="') > 0);
  const b = rowHtml(row('IB', 'NEW', {}, mkCtx({ actOf: function () { return 'past'; } })));   // 5자 이상 글자는 sr-only+title
  assert.ok(b.indexOf('<span class="sr-only">접수 기간이 지난 것으로 봅니다.') > 0 && b.indexOf('class="hb-stg two" title="') > 0 && b.indexOf('<span class="mut">접수 기간 지남</span>') < 0);
  const e = rowHtml(row('IB', 'NEW', { bid_closed: NB }));
  assert.ok(e.indexOf('<span class="hb-stg"><span class="wf-badge pp-cancel">입찰 없음</span><span class="sr-only">끝난 건: 입찰 없음, 현 금고 타행 유지</span></span>') > 0 && e.indexOf('hb-late') < 0 && e.indexOf('class="hb-pg"') < 0);
  const k = rowHtml(row('IA', 'RETAIN', { bid_closed: NB }));
  assert.ok(k.indexOf('<span class="hb-stg" title="입찰 없이 국민은행이 금고를 이어 갑니다 — 협약 예정 칸은 결과 기록이 생기면 함께 셉니다.') > 0 && k.indexOf('<span class="mut" aria-hidden="true">—</span>') > 0);
  const c = rowHtml(row('IB', 'NEW', { bid_closed: NC }));
  assert.ok(c.indexOf('입찰이 끝났지만 제안 기록이 없어 단계를 정할 수 없습니다.') > 0 && c.indexOf('class="hb-pg"') < 0);
  const sp = rowHtml(row('IB', 'NEW', {}, mkCtx({ stopped: { IB: true } })));
  assert.ok(sp.indexOf('<span class="wf-badge pp-cancel">중단</span><span class="sr-only">끝난 건: 중단</span>') > 0);
  const w = rowHtml(row('IB', 'NEW', {}, mkCtx({ actOf: function () { return 'wait'; } })));   // '확인 중…'은 읽는 글이 아니라 무엇을 확인하는지 문장(qa/design W3)
  assert.ok(w.indexOf('<span class="lb">제안 준비 전</span>') > 0 && w.indexOf('<span class="sr-only">입찰 공고 현황을 확인하는 중입니다.</span>') > 0 && w.indexOf('확인 중…') < 0);
});

test('열 폭 132·두 줄 칸 가운데·.hb-end(협약 종료 표시)와 겹치지 않는 .hb-fin', function () {
  const css = src('index.html');
  assert.ok(/\.hb-tt col\.c-stg \{ width:132px; \}/.test(css) && /\.hb-tt \{ width:100%; min-width:816px;/.test(css) && /\.hb-tt\.wt \{ min-width:1028px; \}/.test(css) && css.indexOf('c-brf') < 0);
  let fixed = 0; const re = /\.hb-tt col\.c-(tag|aim|due|bank|stg) \{ width:(\d+)px; \}/g; let m;
  while ((m = re.exec(css))) fixed += Number(m[2]);
  assert.strictEqual(150 + 32 + fixed, 816);                                                 // 기관 150 + 고르기 32 + 고정 열 634
  assert.ok(/\.hb-stg\.two \{[^}]*flex-direction:column[^}]*align-items:center/.test(css) && !/\.hb-stg\.two \{[^}]*flex-start/.test(css));   // DESIGN 표 정렬: 새 칸도 가운데
  assert.ok(/\.hb-stg \.ln2 \{[^}]*justify-content:center/.test(css) && /\.hb-tt \.hb-stg \{ justify-content:center;/.test(css));
  assert.ok(css.indexOf('.hb-end { grid-column:2; grid-row:1;') > 0 && !/\.hb-fin[^{]*\{[^}]*grid-column/.test(css));   // 옛 .hb-end 규칙은 그대로, 새 단추는 다른 이름
  ['.hb-sb.unk {', '.hb-stgs .ft {', '.hb-fin {', '.hb-stg.two {'].forEach(function (s) { assert.ok(css.indexOf(s) > 0, s); });
  assert.ok(/\.hb-sb\.unk \{[^}]*color:var\(--muted\)/.test(css) && /\.hb-sb\.unk \.ct \{ font:400 12px var\(--mono\); color:var\(--muted\); \}/.test(css));   // design 11-26 꺼짐 표현
  assert.ok(/\.hb-fin \.nm \{ font-weight:700; \}/.test(css) && /\.hb-fin\[aria-disabled=true\]:hover \{ color:var\(--muted\); border-color:var\(--line\); \}/.test(css));
  assert.ok(/\.hb-tt tr\.grp th \{ height:32px; padding:0 10px;/.test(css));
});

test('소스: 끝난 건 단추도 단계 거르기 단추, aria-disabled는 눌러도 거르지 않음, 옛 [제안 확정] 문구 없음, 예상 공고현황', function () {
  const K = src('js/kbboard.js'), D = src('js/dashboard.js');
  assert.ok(K.indexOf("btn.classList.contains('hb-fin')") > 0 && K.indexOf("btn.getAttribute('aria-disabled') !== 'true'") > 0);
  assert.ok(K.indexOf("'.hb-stgs button[data-stage=\"'") > 0 && K.indexOf('class="hb-fin"') > 0);   // 새 단추 클래스는 hb-fin
  ['제안 확정했습니다', '확정하고 제안 준비 현황으로', "'확정하는 중…'"].forEach(function (w) { assert.strictEqual(K.indexOf(w), -1, w); });
  ['이미 제안 확정되어', '제안 확정하지 못했습니다', "'확정하고 이동'", '제안 확정했습니다', '지역별 공고현황'].forEach(function (w) { assert.strictEqual(D.indexOf(w), -1, w); });
  assert.ok(D.indexOf('예상 공고현황에서 보기') > 0 && D.indexOf('예상 공고현황과 같은 기관') > 0);
  assert.ok(dash.footHtml({ unknownN: 2 }).indexOf('id="db-tomap2">예상 공고현황</button>') > 0);
});
