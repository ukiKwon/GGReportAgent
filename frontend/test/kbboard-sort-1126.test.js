'use strict';
// 목표 표 모든 열 정렬 + 설명회 열 삭제(사용자 11-26).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const logic = require('../js/logic.js');
const kbb = require('../js/kbboard.js');

const TODAY = new Date(2026, 10, 17);
function p(n) { return logic.localDateStr(new Date(2026, 10, 17 + n)); }
function rec(id, name, extra) { return Object.assign({ institutionId: id, name: name, region: '11', type: '지자체', confirmed: false }, extra || {}); }
function mkCtx(extra) {
  const recs = { IA: rec('IA', '가', { confirmed: true, contractEnd: p(-3), receiveTo: p(12) }), IB: rec('IB', '나', { contractEnd: p(200) }),
    IC: rec('IC', '다', { confirmed: true, contractEnd: p(30) }), ID: rec('ID', '라', { contractEnd: p(-140) }), IE: rec('IE', '마', {}) };
  return Object.assign({ byInst: recs, sumById: {}, today: TODAY, verified: [], lofin: null, entries: {}, prepOk: true, delayDays: 30, years: [2026, 2027, 2028], actOf: function () { return 'confirm'; } }, extra || {});
}
function tgt(id, tag, extra) {
  return Object.assign({ institution_id: id, institution_name: '이름' + id, region_code: '11', target_no: 1, rev_no: 2, target_year: 2026, tag_cd: tag, tag_name: kbb.TAG[tag], memo: '', can_cancel: true, kind_cd: 'GOAL', aim_mode: 'DIRECT',
    bank: { kb_now: tag === 'RETAIN' ? 'KB' : 'OTHER', last_kb_year: 2022, lines_now: [{ rank_cd: 'SINGLE', bank_name: tag === 'RETAIN' ? '국민은행' : '우리은행', term_to: '2026-12-31' }] } }, extra || {});
}
function ids(rows, key, dir) { return kbb.sortBy(rows, key, dir).map(function (r) { return r.id; }); }
const NB = { basis_cd: 'NOTICE_NO_BID', basis_date: '2026-09-30' };

test('기관: 한글 가나다 오름·내림', function () {
  const rows = kbb.goalRows([tgt('IC', 'NEW'), tgt('IA', 'NEW'), tgt('IE', 'NEW'), tgt('IB', 'NEW'), tgt('ID', 'NEW')], mkCtx());
  assert.deepStrictEqual(ids(rows, 'nm', 'asc'), ['IA', 'IB', 'IC', 'ID', 'IE']);   // 가 나 다 라 마
  assert.deepStrictEqual(ids(rows, 'nm', 'desc'), ['IE', 'ID', 'IC', 'IB', 'IA']);
});

test('구분: 재유치→되찾기→신규, 구분 미정은 방향과 상관없이 맨 아래', function () {
  const rows = kbb.goalRows([tgt('IA', 'RETAIN'), tgt('IB', 'REGAIN'), tgt('IC', 'NEW'), tgt('ID', null), tgt('IE', 'NEW')], mkCtx());
  assert.deepStrictEqual(ids(rows, 'tag', 'asc'), ['IA', 'IB', 'IC', 'IE', 'ID']);
  assert.deepStrictEqual(ids(rows, 'tag', 'desc'), ['IC', 'IE', 'IB', 'IA', 'ID']);
});

test('금고 방식: 1금고→2금고→단수금고→주거래→비어 있음(방향과 상관없이 맨 아래), 저장 전 대기 값은 순서를 바꾸지 않는다', function () {
  const a = function (id, tag, nm, cd) { return tgt(id, tag, { aim_rank_cd: cd, aim_rank_name: nm }); };
  const rows = kbb.goalRows([a('IA', 'NEW', '2금고', 'SECOND'), a('IB', 'NEW', '1금고', 'FIRST'), a('IC', 'NEW', '주거래', 'MAIN'), a('ID', 'NEW', '단수금고', 'SINGLE'), a('IE', 'NEW', null, null)], mkCtx());
  assert.deepStrictEqual(ids(rows, 'aim', 'asc'), ['IB', 'IA', 'ID', 'IC', 'IE']);
  assert.deepStrictEqual(ids(rows, 'aim', 'desc'), ['IC', 'ID', 'IA', 'IB', 'IE']);
  assert.ok(kbb.SORTABLE.goal.indexOf('aim') >= 0 && kbb.SORT_LABEL.aim === '금고 방식');
});

test('마감까지: 확정 마감이 가까운 줄이 먼저, 일정 모름은 방향과 상관없이 맨 아래', function () {
  const rows = kbb.goalRows([tgt('IA', 'RETAIN'), tgt('IB', 'NEW'), tgt('IE', 'NEW')], mkCtx());
  assert.strictEqual(ids(rows, 'due', 'asc')[0], 'IA');
  assert.strictEqual(ids(rows, 'due', 'asc').slice(-1)[0], 'IE');
  assert.strictEqual(ids(rows, 'due', 'desc').slice(-1)[0], 'IE');
});

test('현 금고 은행: 이름순, 은행 확인 안 됨은 방향과 상관없이 맨 아래', function () {
  const rows = kbb.goalRows([tgt('IA', 'RETAIN'), tgt('IB', 'NEW'), tgt('IC', 'NEW', { bank: { kb_now: 'NO_RECORD', lines_now: [] } })], mkCtx());
  assert.deepStrictEqual(ids(rows, 'bank', 'asc'), ['IA', 'IB', 'IC']);   // 국민은행 < 우리은행
  assert.deepStrictEqual(ids(rows, 'bank', 'desc'), ['IB', 'IA', 'IC']);
});

test('준비 단계: 5칸 순서, 끝난 건은 오름·내림 모두 5칸 뒤, 단계를 못 정한 줄은 그 뒤', function () {
  const ctx = mkCtx({ entries: { IA: { id: 'IA', stage: 1, rank: 3, cd: 'APPROVAL_PENDING' } } });
  const rows = kbb.goalRows([tgt('IA', 'RETAIN'), tgt('IB', 'NEW'), tgt('IC', 'NEW', { bid_closed: NB }), tgt('IE', 'NEW', { bid_closed: { basis_cd: 'NOTICE_CLOSED', basis_date: '2026-09-30' } }), tgt('ID', 'RETAIN', { bid_closed: NB })], ctx);
  assert.deepStrictEqual(ids(rows, 'stage', 'asc'), ['IB', 'IA', 'IC', 'ID', 'IE']);
  assert.deepStrictEqual(ids(rows, 'stage', 'desc'), ['IA', 'IB', 'IC', 'ID', 'IE']);
});

test('저장 전 금고 방식 대기가 있어도 정렬 순서는 그대로(저장된 값만 본다)', function () {
  const a = function (id, nm, cd) { return tgt(id, 'NEW', { aim_rank_cd: cd, aim_rank_name: nm }); };
  const rows = kbb.goalRows([a('IA', '2금고', 'SECOND'), a('IB', '1금고', 'FIRST'), a('IC', '주거래', 'MAIN')], mkCtx());
  const before = ids(rows, 'aim', 'asc');
  const drafts = { IC: { no: 1, tagCd: 'NEW', aimCd: 'FIRST', aimName: '1금고' } };   // 주거래 → 1금고로 바꾸는 대기
  const html = kbb.aimCellHtml(rows.filter(function (r) { return r.id === 'IC'; })[0], { canEdit: true, drafts: drafts });
  assert.ok(html.indexOf('draft') > 0);                                                     // 대기가 칩에 보이긴 한다
  assert.deepStrictEqual(ids(rows, 'aim', 'asc'), before);
  assert.deepStrictEqual(before, ['IB', 'IA', 'IC']);
});

test('눌러도 거르지 않는 칸: 못 세는 칸은 aria-disabled(눌림 속성 없음), 거를 줄 없는 끝난 건도 같다', function () {
  const h = kbb.stagesHtml([1, 0, 0, 0, 0], { ok: true, active: -1, unknown: [2, 3, 4], end: { drop: null, stop: 0, nobid: 0, rows: 0 } });
  (h.match(/<button[^>]*class="hb-sb unk"[^>]*>/g) || []).forEach(function (b) { assert.ok(b.indexOf('aria-disabled="true"') > 0 && b.indexOf('aria-pressed') < 0 && b.indexOf(' disabled') < 0, b); });
  assert.ok(/<button[^>]*class="hb-fin"[^>]*aria-disabled="true"/.test(h) && !/<button[^>]*class="hb-fin"[^>]*aria-pressed/.test(h));
});

test('표 머리: 목표 표 6열 모두 정렬 단추(눌린 열만 aria-sort, 캡션 낭독), 설명회 열 없음, colspan 6(고르기 열이 있으면 7)', function () {
  const base = { st: 'ok', year: 2026, tab: 'goal', rows: [], out: [], canEdit: true, cands: [], total: 0 };
  [['nm', '기관'], ['tag', '구분'], ['aim', '금고 방식'], ['due', '마감까지'], ['bank', '현 금고 은행'], ['stage', '준비 단계']].forEach(function (k) {
    const t = kbb.goalTableHtml(Object.assign({}, base, { sort: { key: k[0], dir: 'desc' } }));
    assert.strictEqual((t.match(/class="hb-sort"/g) || []).length, 6, k[0]);
    assert.strictEqual((t.match(/aria-sort=/g) || []).length, 1, k[0]);
    assert.ok(t.indexOf('<th scope="col" aria-sort="descending"><button type="button" class="hb-sort" data-sort="' + k[0] + '">' + k[1] + '<svg') > 0, k[0]);
    assert.ok(t.indexOf(k[1] + ' 내림차순</caption>') > 0, k[0]);
    assert.ok(t.indexOf('설명회') < 0 && t.indexOf('c-brf') < 0 && t.indexOf('colspan="6"') > 0, k[0]);
  });
  assert.ok(kbb.goalTableHtml(Object.assign({}, base, { selCol: true, sort: { key: 'due', dir: 'asc' } })).indexOf('colspan="7"') > 0);
  const w = kbb.goalTableHtml(Object.assign({}, base, { tab: 'watch', sort: { key: 'next', dir: 'asc' } }));
  assert.strictEqual((w.match(/class="hb-sort"/g) || []).length, 4);   // 관심 표: 기관·구분·공고·다음 협약 종료·현 금고 은행(메모·동작은 정렬 대상 아님)
});

test('설명회 열 삭제: 줄 칸 수·소스·CSS 어디에도 없다', function () {
  const r = kbb.goalRow(tgt('IA', 'RETAIN'), mkCtx());
  const h = kbb.goalRowHtml(r, { canEdit: true });
  assert.strictEqual((h.match(/<t[dh][ >]/g) || []).length, 6);   // 기관 th + td 5
  assert.ok(h.indexOf('설명회') < 0 && h.endsWith('</td></tr>'));
  const K = fs.readFileSync(path.join(__dirname, '..', 'js', 'kbboard.js'), 'utf8'), css = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.strictEqual(K.indexOf('설명회 기록 없음'), -1);
  assert.strictEqual(K.indexOf('c-brf'), -1);
  assert.ok(css.indexOf('.hb-tt:not(.wt) thead th:nth-child(7)') < 0 && css.indexOf('.hb-tt.sel:not(.wt) thead th:nth-child(8)') < 0);
});
