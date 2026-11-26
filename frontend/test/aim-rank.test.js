'use strict';
// NEXT 114 '금고 방식' 칸(사용자 11-25): 목표 줄 '구분' 오른쪽 칸 — 칩 메뉴로 고르면 저장 전 대기(gs.draft)에 담고 띠 [수정하기]로 저장.
// 구분은 비워 둘 수 있다('-'). 서버 키 aim_rank_cd / aim_rank_name / aim_mode(DIRECT|APPROVAL).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const tc = require('../js/tchange.js');
const kbb = require('../js/kbboard.js');

function src(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
const TODAY = new Date(2026, 10, 23);
function mk(o) {
  return Object.assign({ id: 'G1', name: '종로구청', regionName: '서울', kind: 'GOAL', targetNo: 1, revNo: 4, targetYear: 2026, tagCd: 'RETAIN', tagName: '재유치 도전', aimCd: '', aimName: '', memo: '', ownerEmpNo: 'E1', ownerName: '', movable: 0, out: false, pend: false }, o || {});
}
function mkCtx(extra) {
  return Object.assign({ byInst: {}, sumById: {}, today: TODAY, verified: [], lofin: null, entries: {}, prepOk: false, delayDays: 30, years: [2026, 2027, 2028], actOf: function () { return ''; } }, extra || {});
}
function tgt(id, tag, extra) {
  return Object.assign({ institution_id: id, institution_name: '이름' + id, region_code: '11', target_no: 1, rev_no: 2, target_year: 2026, tag_cd: tag, tag_name: tag ? kbb.TAG[tag] : null,
    aim_rank_cd: null, aim_rank_name: null, aim_mode: 'DIRECT', memo: '', can_cancel: true, kind_cd: 'GOAL',
    bank: { kb_now: 'OTHER', last_kb_year: 2022, lines_now: [{ rank_cd: 'SINGLE', bank_name: '우리은행', term_to: '2026-12-31' }] } }, extra || {});
}
function row(id, tag, extra) { return kbb.goalRow(tgt(id, tag, extra), mkCtx()); }
const DRAFT = { no: 1, tagCd: 'RETAIN', tagName: '재유치 도전', aimCd: 'FIRST', aimName: '1금고' };

test('1 goalRow: 금고 방식·구분 필드(구분 null이면 빈 글)', function () {
  const a = row('A', 'RETAIN', { aim_rank_cd: 'FIRST', aim_rank_name: '1금고' });
  assert.deepStrictEqual([a.aimCd, a.aimName, a.aimMode], ['FIRST', '1금고', 'DIRECT']);
  const b = row('B', null, { aim_mode: 'APPROVAL' });
  assert.deepStrictEqual([b.tagCd, b.tagName, b.aimCd, b.aimMode], ['', '', '', 'APPROVAL']);
  const z = kbb.goalRow({ institution_id: 'Z' }, mkCtx(), true);
  assert.strictEqual(z.aimMode, '');
});

test('2 aimCellHtml: 칩·읽기 전용·목표 밖·이스케이프·대기 표시', function () {
  const empty = kbb.aimCellHtml(row('A', 'RETAIN'), { canEdit: true });
  assert.ok(empty.indexOf('<td class="aim">') === 0 && empty.indexOf('data-act="aim"') > 0 && empty.indexOf('aria-haspopup="menu"') > 0);
  assert.ok(empty.indexOf('>-</span>') > 0 && empty.indexOf('정하지 않음') > 0);
  const val = kbb.aimCellHtml(row('A', 'RETAIN', { aim_rank_cd: 'FIRST', aim_rank_name: '1금고' }), { canEdit: true });
  assert.ok(val.indexOf('1금고<svg') > 0);
  [kbb.aimCellHtml(row('A', 'RETAIN', { aim_mode: 'APPROVAL' }), { canEdit: true }),
    kbb.aimCellHtml(row('A', 'RETAIN'), { canEdit: false }),
    kbb.aimCellHtml(row('A', 'RETAIN', { change_pending: true }), { canEdit: true }),
    kbb.aimCellHtml(row('A', 'RETAIN'), { canEdit: true, canAim: function () { return false; } })].forEach(function (h, i) {
    assert.ok(h.indexOf('<span class="hb-tag ro">') > 0 && h.indexOf('data-act="aim"') < 0 && h.indexOf('<svg') < 0, '읽기 전용 ' + i);
  });
  const out = kbb.aimCellHtml(kbb.goalRow({ institution_id: 'Z' }, mkCtx(), true), { canEdit: true });
  assert.ok(out.indexOf('<td class="aim mut">') === 0 && out.indexOf('목표가 아니어서 금고 방식 없음') > 0);
  const xss = kbb.aimCellHtml(row('A', 'RETAIN', { aim_rank_cd: 'X', aim_rank_name: '<img src=x>' }), { canEdit: true });
  assert.ok(xss.indexOf('<img') < 0);
  const r = row('G1', 'RETAIN');
  const dh = kbb.aimCellHtml(r, { canEdit: true, drafts: { G1: DRAFT } });
  assert.ok(dh.indexOf('class="hb-tag draft"') > 0 && dh.indexOf('바뀔 금고 방식: ') > 0 && dh.indexOf('지금 저장된 금고 방식은 정하지 않음') > 0 && dh.indexOf('title="저장 전') > 0);
  assert.ok(kbb.tagCellHtml(r, { canEdit: true, drafts: { G1: DRAFT } }).indexOf('draft') < 0);   // 금고 방식만 바뀐 대기는 구분 칩에 점선을 주지 않는다
});

test('3 aimMenuHtml', function () {
  const h = kbb.aimMenuHtml(mk(), { aims: [{ code: 'FIRST', name: '1금고' }, { code: 'SECOND', name: '2금고' }], cur: 'FIRST' });
  assert.ok(h.indexOf('aria-label="금고 방식 고르기"') > 0);
  assert.ok(h.indexOf('data-aim="" tabindex="-1"><span>정하지 않음</span>') > 0 && h.indexOf('data-aim=""') < h.indexOf('data-aim="FIRST"'));
  assert.ok(h.indexOf('aria-checked="true" data-aim="FIRST"') > 0);
});

function selWith(row0) { const s = tc.newSel(); tc.pick(s, row0); return s; }

test('4 대기 논리: setAimDraft·setDraft 병합·문구', function () {
  const row0 = tc.entryOfRow(mk());
  const d = {}, s = selWith(row0);
  assert.strictEqual(tc.setAimDraft(d, row0, 'FIRST', '1금고'), true);
  assert.deepStrictEqual(d.G1, { no: 1, tagCd: 'RETAIN', tagName: '재유치 도전', aimCd: 'FIRST', aimName: '1금고' });
  assert.strictEqual(tc.draftCount(d, s), 1);
  tc.setDraft(d, row0, 'NEW', '신규유치 도전');
  assert.strictEqual(d.G1.aimCd, 'FIRST');
  assert.strictEqual(tc.draftWhat(d, s), '구분·금고 방식');
  assert.strictEqual(tc.editLine(row0, d), '구분 재유치 도전 → 신규유치 도전 · 금고 방식 정하지 않음 → 1금고');
  tc.setDraft(d, row0, 'RETAIN');
  assert.strictEqual(d.G1.aimCd, 'FIRST');
  assert.strictEqual(tc.draftWhat(d, s), '금고 방식');
  assert.strictEqual(tc.editLine(row0, d), '금고 방식 정하지 않음 → 1금고');
  assert.strictEqual(tc.deleteLine(row0, d), '2026 목표에서 뺌 · 바뀐 금고 방식은 버림');
  assert.strictEqual(tc.editState(s, d, { canBulk: true }).send.length, 1);
  assert.strictEqual(tc.setAimDraft(d, row0, '', ''), false);
  assert.deepStrictEqual(d, {});
  const d2 = {};
  tc.setDraft(d2, row0, 'NEW', '신규유치 도전');
  assert.strictEqual(tc.draftWhat(d2, s), '구분');
  assert.strictEqual(tc.autoPickNote(2, '금고 방식'), '금고 방식 바뀜 2곳 — [수정하기]로 저장');
  assert.strictEqual(tc.autoPickNote(2), '구분 바뀜 2곳 — [수정하기]로 저장');
});

test('5 본문·검사·결과 문장', function () {
  const e = tc.entryOfRow(mk());
  const it = tc.setOp(tc.newItem(1, e), 'EDIT', { tag: 'RETAIN', aim: 'FIRST' });
  assert.deepStrictEqual(tc.buildBody([it], { mode: 'DIRECT' }), { items: [{ institution_id: 'G1', op_cd: 'EDIT', target_no: 1, base_rev_no: 4, target_year: 2026, tag_cd: 'RETAIN', owner_emp_no: 'E1', aim_rank_cd: 'FIRST' }] });
  assert.strictEqual(tc.validate([it], { mode: 'DIRECT' }).ok, true);
  const e2 = tc.entryOfRow(mk({ aimCd: 'FIRST', aimName: '1금고' }));
  const clr = tc.setOp(tc.newItem(1, e2), 'EDIT', { aim: '' });
  assert.strictEqual(tc.buildBody([clr], { mode: 'DIRECT' }).items[0].aim_rank_cd, '');
  const same = tc.setOp(tc.newItem(1, e), 'EDIT', {});
  assert.ok(!('aim_rank_cd' in tc.buildBody([same], { mode: 'DIRECT' }).items[0]));
  assert.strictEqual(tc.validate([same], { mode: 'DIRECT' }).ok, false);
  const add = tc.addItem(1, { id: 'N1', name: '새', regionName: '서울', tag: '', year: 2026 });
  const ab = tc.buildBody([add], { mode: 'DIRECT' }).items[0];
  assert.ok(!('tag_cd' in ab) && !('aim_rank_cd' in ab));
  assert.strictEqual(tc.resultOf({ mode: 'DIRECT', applied: 2 }, 2, 'edit', '금고 방식').text, '목표 기관 2곳의 금고 방식을 수정했습니다. 결재 없이 반영되고 기록에 남습니다.');
  assert.strictEqual(tc.resultOf({ mode: 'DIRECT', applied: 2 }, 2, 'edit').text, '목표 기관 2곳의 구분을 수정했습니다. 결재 없이 반영되고 기록에 남습니다.');
});

test('6 표 머리·열·거르기·세기·구분 빈 칩', function () {
  const ctx = mkCtx();
  const rows = kbb.goalRows([tgt('A', 'RETAIN'), tgt('B', null), tgt('C', 'NEW')], ctx);
  const base = { year: 2026, rows: rows, out: [], canEdit: true, cands: [], st: 'ok', sort: { key: 'tag', dir: 'asc' } };
  const h = kbb.goalTableHtml(base);
  assert.ok(h.indexOf('data-sort="tag"') > 0 && h.indexOf('data-sort="tag"') < h.indexOf('금고 방식</th>') && h.indexOf('금고 방식</th>') < h.indexOf('data-sort="due"'));
  assert.ok(h.indexOf('<col class="c-tag"><col class="c-aim"><col class="c-due">') > 0);
  assert.ok(kbb.goalTableHtml(Object.assign({}, base, { rows: [] })).indexOf('colspan="7"') > 0);
  const ids = function (a) { return a.map(function (r) { return r.id; }); };
  assert.deepStrictEqual(ids(kbb.filterRows(rows, { tag: 'NONE' })), ['B']);
  assert.deepStrictEqual(ids(kbb.sortBy(rows, 'tag', 'asc')), ['A', 'C', 'B']);
  assert.deepStrictEqual(ids(kbb.sortBy(rows, 'tag', 'desc')), ['C', 'A', 'B']);
  const bm = kbb.bandModel(rows, {});
  assert.strictEqual(bm.none, 1);
  assert.ok(kbb.bandHtml(bm, { year: 2026, loaded: true }).indexOf('미정 <b>1</b>') > 0);
  assert.ok(kbb.bandHtml(kbb.bandModel(kbb.goalRows([tgt('A', 'RETAIN')], ctx), {}), { year: 2026, loaded: true }).indexOf('미정') < 0);
  const chip = kbb.tagCellHtml(rows[1], { canEdit: true });
  assert.ok(chip.indexOf('>-</span>') > 0 && chip.indexOf('정하지 않음') > 0);
});

test('7 추가 창: 구분을 비워 둔다', function () {
  assert.deepStrictEqual(kbb.addState({ inst: { id: 'I1' }, year: 2026, tag: '' }), { canGo: true, why: '' });
  const add = kbb.addDialogHtml({ q: '', year: 2026, tag: '', note: '' }, { years: [2026], tags: [{ code: 'RETAIN', name: '재유치 도전' }] });
  assert.ok(add.indexOf('value="" checked> 정하지 않음') > 0 && add.indexOf('구분 (선택)') > 0);
  assert.strictEqual(kbb.tagHint({ tag: 'RETAIN', why: 'kb' }, '광진구청'), '참고: 광진구청은 지금 국민은행이 금고입니다. 은행 기록으로는 재유치 도전에 해당합니다. 구분은 직접 고르세요.');
  assert.strictEqual(kbb.tagHint({ tag: 'REGAIN', why: 'regain', last: 2022, bank: '우리은행' }, '종로구청'), '참고: 종로구청은 2022년까지 국민은행이 금고였고 지금은 우리은행 금고입니다. 은행 기록으로는 ' + kbb.TAG.REGAIN + '에 해당합니다. 구분은 직접 고르세요.');
  assert.strictEqual(kbb.tagHint({ tag: '', why: '' }, 'x'), '');
  const K = src('js/kbboard.js'), T = src('js/tchange.js');
  assert.ok(K.indexOf('if (m.tag) body.tag_cd = m.tag;') > 0 && K.indexOf("openAdd({ id: inst, tag: 'RETAIN'") < 0);
  assert.ok(T.indexOf('if (it.tag) b.tag_cd = it.tag;') > 0);
});

test('8 배선 소스 단언', function () {
  const K = src('js/kbboard.js');
  assert.ok(K.indexOf('kbb.aimMenuHtml(r, { aims: aimList(), cur: aimNow(r) })') > 0);
  assert.ok(K.indexOf("act === 'tag' || act === 'aim'") > 0);
  assert.ok(K.indexOf('canAim: canAimEdit') > 0);
  const a = K.indexOf('function changeAim('), b = K.indexOf('\n  function ', a + 10), seg = K.slice(a, b);
  assert.ok(a > 0 && seg.indexOf('saveTarget') < 0 && seg.indexOf('loadGoals') < 0 && seg.indexOf('tc.setAimDraft(') > 0);
});

test('9 CSS 단언', function () {
  const html = src('index.html');
  assert.ok(html.indexOf('.hb-tt col.c-aim { width:92px; }') > 0);
  assert.ok(html.indexOf('.hb-tt td.aim { padding:0 6px; }') > 0);
  assert.ok(html.indexOf('.hb-tt:not(.wt) thead th:nth-child(7)') > 0 && html.indexOf('.hb-tt.sel:not(.wt) thead th:nth-child(8)') > 0);
  assert.ok(html.indexOf('.hb-tt.wt thead th:nth-child(6)') > 0 && html.indexOf('.hb-tt.wt.sel thead th:nth-child(7)') > 0);   // 관심 표는 이전 규칙 그대로
  assert.ok(/\.hb-tag\.draft/.test(html) && html.indexOf('꼬리표 없이 점선 + 낭독문') > 0);
});

test('10 관심 탭: 금고 방식 칸 없음, 표에 wt 표식', function () {
  const base = { year: 2026, rows: [], out: [], canEdit: true, cands: [], st: 'ok', tab: 'watch' };
  const h = kbb.goalTableHtml(base);
  assert.ok(h.indexOf('금고 방식') < 0 && h.indexOf('c-aim') < 0 && h.indexOf('<table class="hb-tt wt">') === 0);
  assert.ok(kbb.goalTableHtml(Object.assign({}, base, { selCol: true })).indexOf('<table class="hb-tt sel wt">') === 0);
  assert.ok(kbb.watchRowHtml(row('A', 'RETAIN'), { canEdit: true }).indexOf('class="aim') < 0);
});

test('11 구분 null 줄: 금고 방식만 바꾼 EDIT·대기 정리', function () {
  const e = tc.entryOfRow(mk({ tagCd: '', tagName: '' }));
  const it = tc.setOp(tc.newItem(1, e), 'EDIT', { tag: '', aim: 'FIRST' });
  const b = tc.buildBody([it], { mode: 'DIRECT' }).items[0];
  assert.strictEqual(b.tag_cd, '');
  assert.strictEqual(b.aim_rank_cd, 'FIRST');
  assert.strictEqual(tc.validate([it], { mode: 'DIRECT' }).ok, true);
  const row0 = tc.entryOfRow(mk()), s = selWith(row0), d = {};
  tc.setAimDraft(d, row0, 'FIRST', '1금고');
  s.by.G1.aimCd = 'FIRST';   // 다시 읽어 서버 값이 같아짐
  assert.deepStrictEqual(tc.pruneDrafts(d, s), ['G1']);
  assert.deepStrictEqual(d, {});
  const d2 = {}, row1 = tc.entryOfRow(mk());   // row0은 위에서 aimCd가 바뀌었으므로 새 행
  assert.strictEqual(tc.setAimDraft(d2, row1, '', ''), false);   // 원래 값('')을 고르면 대기 없음
  assert.deepStrictEqual(d2, {});
});

test('12 결재함 카드·결재 중 칸·안내 문구: 구분 null이 "null"로 나오지 않는다', function () {
  const add = tc.cardItemsHtml([{ institution_name: '가', op_cd: 'ADD', to_year: 2026, tag_name: null, owner_name: '', memo: '' }]);
  assert.ok(add.indexOf('null') < 0 && add.indexOf('구분 정하지 않음') > 0);
  const bf = { kind_cd: 'GOAL', target_year: 2026, tag_name: null, owner_name: '', memo: '' };
  const ed = tc.cardItemsHtml([{ institution_name: '가', op_cd: 'EDIT', to_year: 2027, tag_name: null, owner_name: '', memo: '', before: bf }]);
  assert.ok(ed.indexOf('null') < 0);
  const wt = tc.cardItemsHtml([{ institution_name: '가', op_cd: 'CANCEL', before: { kind_cd: 'WATCH', tag_name: null } }]);
  assert.ok(wt.indexOf('null') < 0 && wt.indexOf('관심 기관 · 구분 정하지 않음') > 0);
  assert.ok(tc.pendCellHtml({ tagCd: '', tagName: '', pend: true }, {}).indexOf('구분 정하지 않음') > 0);
  assert.ok(tc.rowTips({ carried: true, tagCd: '', prevYear: 2019, targetYear: 2026 }).join(' ').indexOf('되찾기 후보') >= 0);
  const it = tc.addItem(1, { id: 'N1', name: '새', regionName: '서울', tag: '', year: 2026 });
  assert.ok(tc.afterBlockHtml(it, {}).indexOf('구분 정하지 않음') > 0);
  const eit = tc.setOp(tc.newItem(1, tc.entryOfRow(mk({ tagCd: '', tagName: '' }))), 'EDIT', {});
  const bh = tc.beforeHtml(eit);
  assert.ok(bh.indexOf('null') < 0 && bh.indexOf('구분 정하지 않음') > 0);
  assert.ok(tc.afterBlockHtml(eit, { tags: [{ code: 'RETAIN', name: '재유치 도전' }] }).indexOf('<option value="" selected>-</option>') > 0);
  assert.strictEqual(tc.toWatchFact(''), '구분과 메모는 그대로 옮겨집니다. 옮긴 기록(누가·언제)은 팀 이력에 남습니다.');
  assert.ok(tc.toWatchFact('재유치 도전').indexOf('구분(재유치 도전)과') === 0);
  assert.ok(tc.editItemHtml(tc.newItem(1, tc.entryOfRow(mk({ tagCd: '', tagName: '' }))), 1, { tags: [{ code: 'RETAIN', name: '재유치 도전' }] }).indexOf('<option value="" selected>-</option>') > 0);
});

test('13 확인 상자 제목: 바뀐 내용에 맞춘다', function () {
  assert.strictEqual(tc.bulkTitle({ kind: 'edit', what: '구분', n: 2 }), '구분 수정 — 2곳');
  assert.strictEqual(tc.bulkTitle({ kind: 'edit', what: '금고 방식', n: 2 }), '금고 방식 수정 — 2곳');
  assert.strictEqual(tc.bulkTitle({ kind: 'edit', what: '구분·금고 방식', n: 3 }), '구분·금고 방식 수정 — 3곳');
  assert.strictEqual(tc.bulkTitle({ kind: 'delete', n: 1 }), '목표 기관에서 제외 — 1곳');
});

test('14 결재 중 줄: 금고 방식은 값만 보이는 span', function () {
  const h = kbb.aimCellHtml(row('A', 'RETAIN', { aim_rank_cd: 'FIRST', aim_rank_name: '1금고', change_pending: true }), { canEdit: true });
  assert.ok(h.indexOf('1금고') > 0 && h.indexOf('<span class="hb-tag ro">') > 0 && h.indexOf('<button') < 0 && h.indexOf('data-act="aim"') < 0);
});

test('15 결재함 카드: 금고 방식이 바뀌면 "A → B" 줄, 같으면 줄 없음, 이름은 이스케이프', function () {
  const bf = { kind_cd: 'GOAL', target_year: 2026, tag_name: '재유치 도전', owner_name: '김영업', memo: '', aim_rank_cd: 'FIRST', aim_rank_name: '1금고' };
  const base = { institution_name: '가', op_cd: 'EDIT', to_year: 2026, tag_name: '재유치 도전', owner_name: '이팀장', memo: '', before: bf };
  const ch = tc.cardItemsHtml([Object.assign({}, base, { aim_rank_cd: 'SECOND', aim_rank_name: '2금고' })]);
  assert.ok(ch.indexOf('금고 방식: 1금고 → <b>2금고</b>') > 0);
  const same = tc.cardItemsHtml([Object.assign({}, base, { aim_rank_cd: 'FIRST', aim_rank_name: '1금고' })]);
  assert.ok(same.indexOf('금고 방식') < 0);
  const none = tc.cardItemsHtml([Object.assign({}, base, { aim_rank_cd: null, aim_rank_name: null })]);
  assert.ok(none.indexOf('금고 방식: 1금고 → <b>정하지 않음</b>') > 0 && none.indexOf('null') < 0);
  const first = tc.cardItemsHtml([Object.assign({}, base, { before: Object.assign({}, bf, { aim_rank_cd: null, aim_rank_name: null }), aim_rank_cd: 'SINGLE', aim_rank_name: '단수금고' })]);
  assert.ok(first.indexOf('금고 방식: 정하지 않음 → <b>단수금고</b>') > 0);
  const xss = tc.cardItemsHtml([Object.assign({}, base, { aim_rank_cd: 'X', aim_rank_name: '<img src=x>' })]);
  assert.ok(xss.indexOf('<img') < 0 && xss.indexOf('&lt;img') > 0);
  const onlyAim = tc.cardItemsHtml([Object.assign({}, base, { owner_name: '김영업', to_year: 2027, aim_rank_cd: 'SECOND', aim_rank_name: '2금고' })]);
  assert.ok(onlyAim.indexOf(tc.opLong('NEXT')) < 0);
  const w = tc.cardItemsHtml([{ institution_name: '가', op_cd: 'TO_WATCH', before: bf, aim_rank_cd: 'FIRST', aim_rank_name: '1금고' }]);
  assert.ok(w.indexOf('금고 방식') < 0);
});
