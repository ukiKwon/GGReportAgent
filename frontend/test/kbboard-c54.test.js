'use strict';
// 입찰 현황판 후속(design-reviewer 11-17 a3ab5c5a 6-1~6-12): 제안 진행 줄·거르기·정렬·입찰 종료·관심 기관·옮기기·409 4종·빈 후보 4묶음·협약 팝업 줄.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const logic = require('../js/logic.js');
const dash = require('../js/dashboard.js');
const kbb = require('../js/kbboard.js');

const TODAY = new Date(2026, 10, 17);   // 2026-11-17
function p(n) { return logic.localDateStr(new Date(2026, 10, 17 + n)); }
function src(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
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

test('정렬: 마감까지는 확정 → 추정 → 미상 → 입찰 종료 줄이 맨 아래, 내림차순도 같은 묶음 규칙, 은행·단계 모름은 방향과 상관없이 아래', function () {
  const ctx = mkCtx();
  const rows = kbb.goalRows([tgt('IA', 'RETAIN'), tgt('IB', 'NEW'), tgt('IE', 'NEW'), tgt('IC', 'NEW', { bid_closed: { basis_cd: 'NOTICE_CLOSED', basis_date: '2026-09-30', round_seq: 1 } })], ctx);
  assert.deepStrictEqual(kbb.sortBy(rows, 'due', 'asc').map(function (r) { return r.id; }), ['IA', 'IB', 'IE', 'IC']);
  assert.deepStrictEqual(kbb.sortBy(rows, 'due', 'asc').slice(-1)[0].closed, { cd: 'NOTICE_CLOSED', date: '2026-09-30' });
  assert.deepStrictEqual(kbb.sortBy(rows, 'nm', 'desc').map(function (r) { return r.name; }), ['마', '다', '나', '가']);   // 기관 자료의 이름이 먼저
  const st = kbb.goalRows([tgt('IA', 'RETAIN'), tgt('IB', 'NEW')], mkCtx({ entries: { IA: { id: 'IA', stage: 3 } } }));
  assert.deepStrictEqual(kbb.sortBy(st, 'stage', 'asc').map(function (r) { return r.id; }), ['IA', 'IB']);
  assert.deepStrictEqual(kbb.sortBy(st, 'stage', 'desc').map(function (r) { return r.id; }), ['IA', 'IB']);   // 단계 모름(-1)은 방향과 상관없이 아래
  const bk = kbb.goalRows([tgt('IA', 'RETAIN', { bank: { kb_now: 'NO_RECORD', lines_now: [] } }), tgt('IB', 'NEW')], mkCtx());
  assert.strictEqual(kbb.sortBy(bk, 'bank', 'desc')[1].bank.unknown, true);
});

test('거르기: 검색(기관명·지역)·구분·상태·종류·단계, 입찰 종료 줄은 지연·보류가 아니다, 필터 켜짐 판정', function () {
  const ctx = mkCtx();
  const rows = kbb.goalRows([tgt('IA', 'RETAIN'), tgt('IB', 'NEW'), tgt('IC', 'NEW', { bid_closed: { basis_cd: 'NOTICE_NO_BID', basis_date: '2026-09-30' } })], ctx);
  const ids = function (f) { return kbb.filterRows(rows, f).map(function (r) { return r.id; }); };
  assert.deepStrictEqual(ids({ q: ' 가 ' }), ['IA']);
  assert.deepStrictEqual(ids({ tag: 'NEW' }), ['IB', 'IC']);
  assert.deepStrictEqual(ids({ status: 'closed' }), ['IC']);
  assert.deepStrictEqual(ids({ status: 'late' }), ['IA']);                         // 마감 D-12·작성 전
  assert.deepStrictEqual(ids({ status: 'soon' }), ['IA']);
  assert.deepStrictEqual(ids({ status: 'unk' }), []);
  assert.strictEqual(rows[2].late, false); assert.strictEqual(rows[2].hold, false);
  const out = kbb.outRows([{ institutionId: 'IE', name: '마' }], {}, ctx);
  assert.deepStrictEqual(kbb.filterRows(rows.concat(out), { kind: 'out' }).map(function (r) { return r.id; }), ['IE']);
  assert.deepStrictEqual(kbb.filterRows(rows.concat(out), { kind: 'goal' }).length, 3);
  assert.strictEqual(kbb.filterOn({ q: '', tag: '', status: '', kind: '', stage: -1 }), false);
  assert.strictEqual(kbb.filterOn({ stage: 0 }), true);
  assert.strictEqual(kbb.filterOn({ q: ' ' }), false);
});

test('제안 진행 줄: 버튼의 수 = 그 단계로 거르면 표에 남는 줄 수(목표 줄 + 목표 밖 준비 줄), 0곳은 disabled, 자료 없음은 다섯 칸 disabled', function () {
  const ctx = mkCtx({ entries: { IA: { id: 'IA', stage: 2 }, IB: { id: 'IB', stage: 2 }, IE: { id: 'IE', stage: 4 }, IC: { id: 'IC', stage: 0 } } });
  const rows = kbb.goalRows([tgt('IA', 'RETAIN'), tgt('IB', 'NEW')], ctx);
  const out = kbb.outRows([{ institutionId: 'IE', name: '마' }, { institutionId: 'IC', name: '다' }], { IA: true, IB: true }, ctx);
  const all = rows.concat(out), c = kbb.stageCounts(all);
  assert.deepStrictEqual(c, [1, 0, 2, 0, 1]);
  c.forEach(function (n, i) { assert.strictEqual(kbb.filterRows(all, { stage: i }).length, n, '단계 ' + i); });
  const h = kbb.stagesHtml(c, { ok: true, active: 2 });
  assert.strictEqual((h.match(/<button type="button" class="hb-sb"/g) || []).length, 5);
  assert.ok(h.indexOf('aria-label="사전준비 2곳 — 거르기 끄기"') > 0 && h.indexOf('aria-pressed="true"') > 0 && (h.match(/aria-pressed="true"/g) || []).length === 1);
  assert.ok(h.indexOf('aria-label="개설 승인 대기 0곳 — 표를 이 단계로 거르기"') > 0 && /data-stage="1" aria-pressed="false" disabled/.test(h));
  assert.ok(h.indexOf('style="--p:1"') > 0 && h.indexOf('<span class="l">제안 진행</span>') > 0);
  const none = kbb.stagesHtml([0, 0, 0, 0, 0], { ok: false, why: kbb.prepWhy('denied', 403) });
  assert.strictEqual((none.match(/ disabled>/g) || []).length, 5);
  assert.ok(none.indexOf('<span class="ct">—</span>') > 0 && none.indexOf('이 계정은 제안 진행을 볼 수 없어 판정하지 않습니다') > 0 && none.indexOf('aria-pressed') < 0);
});

test('입찰 종료 줄: 마감까지 칸 \'입찰 종료\'+근거(title·sr), 12개월 칸 버튼 둘(그림 밖), 서버 근거만 판정을 바꾼다, 보기 전용은 버튼 없음', function () {
  const ctx = mkCtx();
  const r = kbb.goalRow(tgt('IA', 'RETAIN', { institution_name: '동작구청', bid_closed: { basis_cd: 'NOTICE_CLOSED', basis_date: '2026-09-30', round_seq: 1 } }), ctx);
  assert.deepStrictEqual(r.closed, { cd: 'NOTICE_CLOSED', date: '2026-09-30' });
  const h = kbb.goalRowHtml(r, { win: kbb.laneWindow(TODAY, 2026), canEdit: true });
  assert.ok(h.indexOf('<td title="근거: 입찰 공고 현황 2026-09-30 공고 종료"><b class="hb-dd tx end">입찰 종료</b><span class="sr-only">근거: 입찰 공고 현황 2026-09-30 공고 종료</span></td>') > 0);
  assert.ok(h.indexOf('<td class="ln"><div class="hb-acts">') > 0 && h.indexOf('hb-lane') < 0 && h.indexOf('hb-late') < 0 && h.indexOf('class="late"') < 0);
  assert.ok(h.indexOf('data-act="towatch"') > 0 && h.indexOf('data-act="tonext"') > 0 && h.indexOf('>관심 기관으로…</button>') > 0 && h.indexOf('>관심 기관으로</button>') < 0 && h.indexOf('>다음 회차 목표로…</button>') > 0);   // 버튼·메뉴·안내 모두 '관심 기관으로…'(design P3-1)
  const nw = kbb.goalRowHtml(r, { win: kbb.laneWindow(TODAY, 2026), canEdit: true, noWatch: true });                  // 옛 서버: 관심 기관이 없으니 옮기기 버튼도 없다
  assert.ok(nw.indexOf('data-act="towatch"') < 0 && nw.indexOf('data-act="tonext"') > 0);
  const ro = kbb.goalRowHtml(r, { win: kbb.laneWindow(TODAY, 2026), canEdit: false });
  assert.ok(ro.indexOf('<button type="button" class="hb-tag" data-act') < 0 && ro.indexOf('hb-acts') < 0);
  assert.ok(h.indexOf('<tr class="has-acts">') === 0 && ro.indexOf('has-acts') < 0);   // 단추가 있는 줄만 has-acts(일정 칸 잘림 푸는 CSS 훅, 11-23)
  const css = src('index.html');
  assert.ok(/\.hb-tt td\.ln \.hb-acts \{[^}]*right:0/.test(css) && !/\.hb-tt td\.ln \.hb-acts \{[^}]*inset:0/.test(css));
  assert.ok(css.indexOf('.hb-tt tr.has-acts td.ln { overflow:visible; }') > 0 && css.indexOf('.hb-tt tr.has-acts > td.mut > [aria-hidden="true"] { visibility:hidden; }') > 0);
  assert.strictEqual(kbb.closedOf({ basis_cd: 'HACK', basis_date: '2026-09-30' }), null);                   // 모르는 근거 코드는 버린다
  assert.deepStrictEqual(kbb.closedOf({ basis_cd: 'CONTRACT_DECIDED', basis_date: '<img>' }), { cd: 'CONTRACT_DECIDED', date: '' });
  assert.strictEqual(kbb.basisText({ cd: 'NOTICE_NO_BID', date: '2026-09-30' }), '입찰 공고 현황 2026-09-30 입찰 없음');
  assert.strictEqual(kbb.basisText({ cd: 'CONTRACT_DECIDED', date: '2027-01-01' }), '금고 약정 2027-01-01 시작 약정이 이미 정해져 있음');
  // 구분 메뉴: 목표 줄은 [관심 기관으로…], 입찰 종료 줄은 [다음 회차 목표로…]도(12개월 칸이 숨는 폭에서도), 관심 줄은 '관심에서 빼기…'
  const tags = [{ code: 'RETAIN', name: '재유치 도전' }];
  const m1 = kbb.menuHtml(r, { tags: tags, def: {}, canCancel: true, canMove: true });
  assert.ok(m1.indexOf('data-cmd="towatch" tabindex="-1">관심 기관으로…</button><button type="button" role="menuitem" data-cmd="tonext" tabindex="-1">다음 회차 목표로…</button>') > 0);
  assert.ok(kbb.menuHtml({ tagCd: 'RETAIN' }, { tags: tags, def: {}, canCancel: true, canMove: true }).indexOf('data-cmd="tonext"') < 0);
  assert.ok(kbb.menuHtml({ tagCd: 'RETAIN', kind: 'WATCH' }, { tags: tags, def: {}, canCancel: true, cancelText: '관심에서 빼기…' }).indexOf('data-cmd="cancel" tabindex="-1">관심에서 빼기…</button>') > 0);
  // 화면만 아는 근거(기관 자료의 다음 입찰이 올해 뒤로 넘어감): 판정은 그대로, 마감까지 칸 title만
  const far = kbb.goalRow(tgt('ID', 'NEW'), mkCtx({ byInst: { ID: rec('ID', '라', { contractEnd: '2029-05-01', confirmed: true, lastBid: '2026-01-01' }) } }));
  assert.strictEqual(far.closed, null);
  const n = kbb.screenNote(rec('IX', '엑스', { contractEnd: '2029-05-01' }), { today: TODAY });
  assert.ok(n === null || (n.src === 'inst' && n.year === 2029));
  assert.strictEqual(kbb.screenNoteText({ year: 2030, src: 'lofin' }), '다음 입찰 예정이 이미 다음 회차(2030)로 넘어갔습니다(근거: 행안부 금고지정). 올해 목표로 넣기 전에 확인하세요.');
  assert.strictEqual(kbb.screenRowTitle({ year: 2030, src: 'lofin' }), '행안부 금고지정으로는 다음 회차(2030)로 넘어갔습니다 — 입찰 공고 현황에서 확인하세요');
});

test('검색 단계 미리 주의: 공고 현황 올해 판정(CLOSED·NO_BID·round_closed)·시작 전 약정은 서버와 같은 근거, 지난해 판정은 아니다', function () {
  const snap = { byId: { A: { status_cd: 'CLOSED', handled_at: '2026-09-30T09:00:00+09:00' }, B: { status_cd: 'NO_BID', round_closed: true, close_reason_cd: 'NO_BID', handled_at: '2026-03-02T09:00:00+09:00' },
    C: { status_cd: 'CLOSED', handled_at: '2025-12-01T09:00:00+09:00' }, D: { status_cd: 'OPEN', handled_at: '2026-05-01T09:00:00+09:00' } } };
  assert.deepStrictEqual(kbb.closedBasis('A', snap, TODAY), { cd: 'NOTICE_CLOSED', date: '2026-09-30' });
  assert.deepStrictEqual(kbb.closedBasis('B', snap, TODAY), { cd: 'NOTICE_NO_BID', date: '2026-03-02' });
  assert.strictEqual(kbb.closedBasis('C', snap, TODAY), null);
  assert.strictEqual(kbb.closedBasis('D', snap, TODAY), null);
  assert.strictEqual(kbb.closedBasis('Z', null, TODAY), null);
  assert.deepStrictEqual(kbb.closedBasis('Z', snap, TODAY, { lines_now: [{ term_from: '2027-01-01', term_to: '2030-12-31' }] }), { cd: 'CONTRACT_DECIDED', date: '2027-01-01' });
  // 주의 상자: 막는 상자(버튼 둘 + 바로가기)·제안 진행 중 상자(막지 않음, 버튼 없음)·화면만 아는 근거(muted, 버튼 없음), 서버 글·기관 이름이 아니라 고정 문장
  const X = '<img src=x onerror=alert(1)>';
  const blk = kbb.warnHtml({ mode: 'block', basis: { cd: 'NOTICE_CLOSED', date: '2026-09-30' }, years: [2027, 2028], boxYear: 2028, icon: '<svg></svg>' });
  assert.ok(blk.indexOf('올해 입찰이 끝난 기관입니다') > 0 && blk.indexOf('근거: 입찰 공고 현황 2026-09-30 공고 종료. 올해 목표로는 넣을 수 없습니다.') > 0);
  assert.ok(blk.indexOf('id="hb-w-watch">관심 기관으로 넣기') > 0 && blk.indexOf('<option value="2028" selected>2028</option>') > 0 && blk.indexOf('id="hb-w-next">2028 목표로 넣기') > 0);
  assert.ok(blk.indexOf('정보가 틀리면 \'입찰 공고 현황\'에서 고쳐 주세요.') > 0 && blk.indexOf('id="hb-w-notice">입찰 공고 현황 열기') > 0);
  const prog = kbb.warnHtml({ mode: 'progress', basis: { cd: 'NOTICE_CLOSED', date: '' } });
  assert.ok(prog.indexOf('올해 입찰이 끝난 것으로 기록되어 있습니다') > 0 && prog.indexOf('이 기관은 제안을 진행 중이라 올해 목표로 넣을 수 있습니다.') > 0 && prog.indexOf('hb-w-watch') < 0);
  const scr = kbb.warnHtml({ mode: 'screen', note: { year: 2030, src: 'lofin' } });
  assert.ok(scr.indexOf('class="hb-warn soft"') > 0 && scr.indexOf('hb-w-watch') < 0 && scr.indexOf('근거: 행안부 금고지정') > 0);
  assert.ok(kbb.warnHtml({ mode: 'block', basis: kbb.closedOf({ basis_cd: 'NOTICE_CLOSED', basis_date: X }), years: [2027] }).indexOf('<img') < 0);
  assert.strictEqual(kbb.warnHtml(null), '');
});

test('관심 기관 줄: 다음 협약 종료 출처 순서(약정 → 행안부 → 기관 자료 오늘 이후만 → 일정 모름), 옮기기 조건 = 그 연도가 선택 가능 연도 안', function () {
  const LF = { asof: '2026-01-01', rows: { '11|행': [{ bank: '우리은행', rank: 'RANK1', accts: ['일반회계'], start: '2023-01-01', end: '2027-12-31', unit: 'a' }] } };
  assert.deepStrictEqual(kbb.nextEnd(rec('I1', '행'), '2028-12-31', { lofin: LF, today: TODAY }), { date: '2028-12-31', src: 'contract' });
  assert.deepStrictEqual(kbb.nextEnd(rec('I1', '행'), null, { lofin: LF, today: TODAY }), { date: '2027-12-31', src: 'lofin' });
  assert.deepStrictEqual(kbb.nextEnd(rec('I2', '없'), null, { lofin: LF, today: TODAY }), { date: '', src: '' });
  assert.deepStrictEqual(kbb.nextEnd(null, '', { today: TODAY }), { date: '', src: '' });
  assert.strictEqual(kbb.moveYear('2028-12-31', [2026, 2027, 2028]), 2028);
  assert.strictEqual(kbb.moveYear('2030-01-31', [2026, 2027, 2028]), 0);
  assert.strictEqual(kbb.moveYear('', [2026]), 0);
  const ctx = mkCtx({ lofin: LF, byInst: { I1: rec('I1', '행'), I3: rec('I3', '삼') } });
  const w = kbb.goalRow({ institution_id: 'I1', institution_name: '행', kind_cd: 'WATCH', target_no: 3, rev_no: 1, target_year: null, tag_cd: 'NEW', tag_name: '신규유치 도전', memo: '다음엔 <b>', next_term_to: '2028-12-31', can_cancel: true }, ctx);
  assert.deepStrictEqual([w.kind, w.nextDate, w.next.src, w.movable, w.targetYear], ['WATCH', '2028-12-31', 'contract', 2028, null]);
  const h = kbb.watchRowHtml(w, { canEdit: true });
  assert.ok(h.indexOf('<b class="hb-nx">2028-12</b><span class="hb-q">약정</span><span class="hb-q">2년 안</span>') > 0);
  assert.ok(h.indexOf('data-act="togoal"') > 0 && h.indexOf('>목표로 옮기기</button>') > 0 && h.indexOf('<b>') < 0);       // 메모는 이스케이프
  assert.strictEqual((h.match(/<td/g) || []).length, 5);                                                                   // th 1 + td 5 = 6열
  assert.ok(kbb.watchRowHtml(w, { canEdit: false }).indexOf('hb-tag" data-act="togoal"') < 0);
  const far = kbb.goalRow({ institution_id: 'I3', institution_name: '삼', kind_cd: 'WATCH', target_no: 1, rev_no: 1, tag_cd: 'NEW', next_term_to: '2031-12-31' }, ctx);
  assert.strictEqual(far.movable, 0);
  const fh = kbb.watchRowHtml(far, { canEdit: true });
  assert.ok(fh.indexOf('togoal') < 0 && fh.indexOf('목표로 옮길 시기 아님') > 0 && fh.indexOf('2년 안') < 0);
  const unk = kbb.goalRow({ institution_id: 'I3', institution_name: '삼', kind_cd: 'WATCH', target_no: 1, rev_no: 1, tag_cd: 'NEW' }, ctx);
  assert.ok(kbb.watchRowHtml(unk, { canEdit: true }).indexOf('>일정 모름</span><span class="sr-only">다음 일정 모름 — 기관 정보에 새 협약 기간을 넣어 주세요</span>') > 0);
  assert.deepStrictEqual(kbb.sortBy([unk, w, far], 'next', 'desc').map(function (r) { return r.nextDate; }), ['2031-12-31', '2028-12-31', '']);   // 모름은 방향과 상관없이 맨 아래
  assert.deepStrictEqual(kbb.filterRows([unk, w, far], { status: 'movable' }).map(function (r) { return r.nextDate; }), ['2028-12-31']);
  assert.deepStrictEqual(kbb.filterRows([unk, w, far], { status: 'unk' }).length, 1);
  // 표: 관심 탭 열(기관·구분·다음 협약 종료·현 금고 은행·메모·동작), 정렬 머리 aria-sort, 비면 안내
  const t = kbb.goalTableHtml({ st: 'ok', year: 2026, tab: 'watch', win: kbb.laneWindow(TODAY, 2026), rows: [w], out: [], canEdit: true, sort: { key: 'next', dir: 'asc' }, total: 1 });
  assert.ok(t.indexOf('<col class="c-wnm"><col class="c-tag"><col class="c-next"><col class="c-bank"><col class="c-memo"><col class="c-act">') > 0);
  assert.ok(t.indexOf('<th scope="col" aria-sort="ascending"><button type="button" class="hb-sort" data-sort="next">다음 협약 종료') > 0 && (t.match(/aria-sort=/g) || []).length === 1);
  assert.ok(t.indexOf('<caption class="sr-only">관심 기관 1곳 중 1곳 보임, 다음 협약 종료 오름차순</caption>') > 0);
  const em = kbb.goalTableHtml({ st: 'ok', year: 2026, tab: 'watch', win: kbb.laneWindow(TODAY, 2026), rows: [], out: [], canEdit: true, total: 0 });
  assert.ok(em.indexOf('관심 기관이 없습니다') > 0 && em.indexOf('id="hb-watch-add2"') > 0);
  assert.ok(kbb.goalTableHtml({ st: 'ok', year: 2026, tab: 'watch', win: kbb.laneWindow(TODAY, 2026), rows: [], out: [], canEdit: false, total: 0 }).indexOf('<button') < 0);
});

test('표 머리·도구 줄·거른 결과 0: 정렬 머리는 aria-sort 하나, 설명회·12개월은 정렬하지 않음, 도구 줄 구성, 조건에 맞는 기관이 없습니다 + [필터 지우기]', function () {
  const ctx = mkCtx();
  const rows = kbb.sortBy(kbb.goalRows([tgt('IA', 'RETAIN'), tgt('IB', 'NEW')], ctx), 'due', 'asc');
  const t = kbb.goalTableHtml({ st: 'ok', year: 2026, tab: 'goal', win: kbb.laneWindow(TODAY, 2026), rows: rows, out: [], canEdit: true, sort: { key: 'due', dir: 'asc' }, total: 5 });
  assert.ok(t.indexOf('<th scope="col" aria-sort="ascending"><button type="button" class="hb-sort" data-sort="due">마감까지<svg') > 0 && (t.match(/aria-sort=/g) || []).length === 1);
  assert.ok(t.indexOf('<th scope="col">설명회</th>') > 0 && t.indexOf('data-sort="nm"') > 0 && t.indexOf('data-sort="stage"') > 0);
  assert.ok(t.indexOf('<caption class="sr-only">2026 목표 기관 5곳 중 2곳 보임, 마감까지 오름차순</caption>') > 0);
  const none = kbb.goalTableHtml({ st: 'ok', year: 2026, tab: 'goal', win: kbb.laneWindow(TODAY, 2026), rows: [], out: [], canEdit: true, sort: { key: 'due', dir: 'asc' }, total: 5, filtered: true });
  assert.ok(none.indexOf('조건에 맞는 기관이 없습니다. <button type="button" id="hb-fclear2">필터 지우기</button>') > 0 && none.indexOf('아직 없습니다') < 0);
  const tb = kbb.toolbarHtml({ tab: 'goal', nGoal: 3, nWatch: 2, f: { q: '동<작', tag: 'NEW', status: 'late', kind: '', stage: 2 }, stageName: '사전준비', shown: 3, total: 5, canEdit: true });
  assert.ok(tb.indexOf('role="tab" id="hb-tab-goal" data-tab="goal" class="on" aria-selected="true" aria-controls="hb-ts" tabindex="0">목표 <b>3</b>') > 0);
  assert.ok(tb.indexOf('id="hb-tab-watch"') > 0 && tb.indexOf('aria-selected="false"') > 0 && tb.indexOf('tabindex="-1">관심 <b>2</b>') > 0);
  assert.ok(tb.indexOf('placeholder="기관명·지역" aria-label="기관명이나 지역으로 찾기"') > 0 && tb.indexOf('value="동&lt;작"') > 0);
  assert.ok(tb.indexOf('구분 전체</option>') > 0 && tb.indexOf('상태 전체</option>') > 0 && tb.indexOf('<option value="" selected>종류 전체</option>') > 0 && tb.indexOf('<option value="NEW" selected>') > 0 && tb.indexOf('<option value="REGAIN">') > 0);
  assert.ok(tb.indexOf('<option value="late" selected>준비 지연</option>') > 0 && tb.indexOf('id="hb-sclr"') > 0 && tb.indexOf('단계: 사전준비 ×') > 0);
  assert.ok(tb.indexOf('<span class="cnt" id="hb-cnt" role="status"><span class="sr-only">5곳 중 3곳 보임</span><span aria-hidden="true"><b>3</b> / <b>5</b>곳</span></span>') > 0 && tb.indexOf('id="hb-fclear">필터 지우기') > 0 && tb.indexOf('id="hb-fclear" hidden') < 0);
  const wt = kbb.toolbarHtml({ tab: 'watch', nGoal: 3, nWatch: 2, f: { q: '', tag: '', status: '', kind: '', stage: -1 }, shown: 2, total: 2, canEdit: true });
  assert.ok(wt.indexOf('hb-f-kind') < 0 && wt.indexOf('<option value="movable">목표로 옮길 수 있음</option>') > 0 && wt.indexOf('id="hb-watch-add"') > 0 && wt.indexOf('id="hb-fclear" hidden') > 0);
  assert.ok(kbb.toolbarHtml({ tab: 'watch', nGoal: 0, nWatch: 0, f: {}, shown: 0, total: 0, canEdit: false }).indexOf('hb-watch-add') < 0);
});

test('409 4종과 201 warning: ALREADY_GOAL·ALREADY_WATCH 고정 문장, INST_BID_CLOSED 근거·다음 연도, 서버 글은 내보이지 않는다', function () {
  const r = function (status, detail, extra) { return { status: status, body: Object.assign({ detail: detail }, extra || {}) }; };
  const g = kbb.outcome(r(409, { code: 'ALREADY_GOAL', message: '<img>', latest: { target_no: 2, rev_no: 3, kind_cd: 'GOAL', target_year: 2027 } }), 'add');
  assert.deepStrictEqual([g.kind, g.which, g.year], ['already', 'GOAL', 2027]);
  assert.strictEqual(g.msg, '이미 목표 기관으로 설정되어 있습니다(2027 목표). 관심으로 옮기려면 목표 표의 구분 메뉴에서 [관심 기관으로…]를 누르세요.');
  // 옮기기 중 ALREADY_GOAL(다른 해 목표가 남음)은 방금 누른 버튼을 되풀이하지 않고 다음 행동을 말한다(qa P2-1)
  const gm = kbb.outcome(r(409, { code: 'ALREADY_GOAL', message: '<img>', latest: { target_no: 2, rev_no: 3, kind_cd: 'GOAL', target_year: 2027 } }), 'move');
  assert.deepStrictEqual([gm.kind, gm.which, gm.year], ['already', 'GOAL', 2027]);
  assert.strictEqual(gm.msg, '이 기관은 2027 목표에도 들어 있어 관심 기관으로 옮길 수 없습니다. 그 목표를 먼저 빼 주세요.');
  assert.strictEqual(kbb.outcome(r(409, { code: 'ALREADY_GOAL' }), 'move').msg, '이 기관은 다른 해 목표에도 들어 있어 관심 기관으로 옮길 수 없습니다. 그 목표를 먼저 빼 주세요.');
  const w = kbb.outcome(r(409, { code: 'ALREADY_WATCH', latest: { target_no: 4, rev_no: 1, kind_cd: 'WATCH' } }), 'add');
  assert.deepStrictEqual([w.kind, w.which, w.latest], ['already', 'WATCH', { targetNo: 4, revNo: 1 }]);
  assert.strictEqual(w.msg, '이미 관심 기관으로 설정되어 있습니다. 목표로 넣으려면 관심 탭에서 [목표로 옮기기]를 누르세요.');
  const c = kbb.outcome(r(409, { code: 'INST_BID_CLOSED', message: '<img>', basis: { basis_cd: 'NOTICE_CLOSED', basis_date: '2026-09-30', round_seq: 1 }, next_years: [2027, 2028], latest: null }), 'add');
  assert.deepStrictEqual([c.kind, c.nextYears, c.basis], ['closed', [2027, 2028], { cd: 'NOTICE_CLOSED', date: '2026-09-30' }]);
  assert.strictEqual(c.msg, '올해 입찰이 끝난 기관입니다. 근거: 입찰 공고 현황 2026-09-30 공고 종료. 올해 목표로는 넣을 수 없습니다.');
  assert.ok(c.msg.indexOf('<img') < 0 && g.msg.indexOf('<img') < 0);
  assert.strictEqual(kbb.outcome(r(409, { code: 'STALE', message: '다른 사람이 먼저 고쳤습니다.' }), 'move').kind, 'stale');           // 기존 409는 그대로
  assert.strictEqual(kbb.outcome(r(409, { code: 'ALREADY_CANCELLED', message: '이미 뺀 기록입니다.' }), 'move').kind, 'stale');
  assert.strictEqual(kbb.outcome(r(409, { code: 'LIMIT' }), 'move').kind, 'limit');
  assert.deepStrictEqual(kbb.outcome({ status: 201, body: { item: {} } }, 'add'), { kind: 'saved' });
  const wn = kbb.outcome({ status: 201, body: { item: {}, warning: { code: 'INST_BID_CLOSED', basis: { basis_cd: 'NOTICE_NO_BID', basis_date: '2026-03-02' }, prep_state_cd: 'IN_PROGRESS' } } }, 'add');
  assert.deepStrictEqual(wn, { kind: 'saved', warning: { code: 'INST_BID_CLOSED', basis: { cd: 'NOTICE_NO_BID', date: '2026-03-02' } } });
  assert.ok(kbb.warnFlash(wn.warning).indexOf('입찰 공고 현황 2026-03-02 입찰 없음') > 0);
  assert.strictEqual(kbb.flashMoved('동작구청', 'WATCH'), '동작구청을 관심 기관으로 옮겼습니다.');
  assert.strictEqual(kbb.flashMoved('동작구청', 'GOAL', 2027), '동작구청을 2027 목표로 옮겼습니다.');
  assert.strictEqual(kbb.flashWatchAdded('동작구청'), '동작구청을 관심 기관에 넣었습니다.');
});

test('옮기기: /move 주소·머리글(move_to_goal·move_to_watch), 확인 창 3종(제목·본문·연도 칸·버튼 글), 목표 연도 필수', async function () {
  const calls = [], keep = kbb.env.fetch;
  try {
    kbb.env.fetch = function (url, init) { calls.push({ url: url, init: init }); return Promise.resolve({ status: 201, json: function () { return Promise.resolve({}); } }); };
    await kbb.moveTarget('I 1', 3, { base_rev_no: 1, to_kind_cd: 'GOAL', target_year: 2027 }, kbb.BTN.moveGoal);
    assert.strictEqual(calls[0].url, '/institutions/I%201/bid-targets/3/move');
    assert.deepStrictEqual(calls[0].init.headers, { 'Content-Type': 'application/json', 'X-Screen-Id': 'bid_board', 'X-Button-Id': 'move_to_goal' });
    assert.deepStrictEqual(JSON.parse(calls[0].init.body), { base_rev_no: 1, to_kind_cd: 'GOAL', target_year: 2027 });
    await kbb.saveTarget('I1', { kind_cd: 'WATCH', tag_cd: 'NEW', memo: null }, kbb.BTN.addWatch);
    assert.strictEqual(calls[1].init.headers['X-Button-Id'], 'add_watch_target');
  } finally { kbb.env.fetch = keep; }
  const r = { regionName: '서울', name: '동작구청<b>', tagName: '재유치 도전' };
  const w = kbb.moveDialogHtml('towatch', r, {});
  assert.ok(w.indexOf('<h3 id="hb-d-t">관심 기관으로 옮기기 — 서울 동작구청&lt;b&gt;</h3>') > 0 && w.indexOf('올해 목표에서 빠지고 관심 기관에 들어갑니다. 구분(재유치 도전)과 메모는 그대로 옮겨집니다. 옮긴 기록(누가·언제)은 남습니다.') > 0);
  assert.ok(w.indexOf('hb-m-year') < 0 && w.indexOf('>관심 기관으로 옮기기</button>') > 0 && w.indexOf('class="pp-next-btn"') > 0);
  const n = kbb.moveDialogHtml('tonext', r, { years: [2027, 2028], year: 2027 });
  assert.ok(n.indexOf('<option value="2027" selected>2027년</option>') > 0 && n.indexOf('<option value="2028">2028년</option>') > 0 && n.indexOf('>2027 목표로 옮기기</button>') > 0);
  const g = kbb.moveDialogHtml('togoal', r, { years: [2026, 2027, 2028], year: 0 });
  assert.ok(g.indexOf('<option value="" selected>고르세요</option>') > 0 && g.indexOf('>목표로 옮기기</button>') > 0);
  assert.deepStrictEqual(kbb.moveState('togoal', { year: 0 }), { canGo: false, why: '목표 연도를 고르세요.' });
  assert.deepStrictEqual(kbb.moveState('tonext', { year: 2027 }), { canGo: true, why: '' });
  assert.deepStrictEqual(kbb.moveState('towatch', { year: 0 }), { canGo: true, why: '' });
  assert.deepStrictEqual(kbb.moveState('towatch', { busy: true }), { canGo: false, why: '' });
  assert.strictEqual(kbb.moveGoText('tonext', 2028), '2028 목표로 옮기기');
});

test('추가 창: 넣을 곳(목표·관심) 라디오, 관심이면 연도 줄 숨김·제목 바뀜, 이미 걸린 기관·올해 입찰 종료 표시, 중복 알림 문장, 막힘 이유', function () {
  const tags = [{ code: 'RETAIN', name: '재유치 도전' }];
  const a = kbb.addDialogHtml({ q: '', year: 2026, tag: '', kind: 'WATCH' }, { years: [2026], tags: tags });
  assert.ok(a.indexOf('<h3 id="hb-d-t">관심 기관 추가</h3>') > 0 && a.indexOf('<legend>넣을 곳 (필수)</legend>') > 0 && a.indexOf('<input type="radio" name="hb-a-kind" value="WATCH" checked> 관심 기관(연도 없음)') > 0);
  assert.ok(a.indexOf('id="hb-a-yrow" hidden') > 0 && a.indexOf('id="hb-a-box"') > 0 && a.indexOf('id="hb-a-pick" class="tm-note" role="status"') > 0 && a.indexOf('>관심 기관에 넣기</button>') > 0);
  assert.ok(kbb.addDialogHtml({ q: '', year: 2026, tag: '' }, { years: [2026], tags: tags }).indexOf('value="GOAL" checked> 목표') > 0);
  const html = kbb.resultsHtml([{ name: '가', sub: 's', taken: true, takenKind: 'WATCH' }, { name: '나', sub: 's', taken: true, takenKind: 'GOAL', takenYear: 2027 }, { name: '다', sub: 's', closed: true }], 2, 2026);
  assert.ok(html.indexOf('· 이미 관심 기관') > 0 && html.indexOf('· 이미 2027 목표') > 0 && html.indexOf('· 올해 입찰 종료') > 0);
  assert.strictEqual(kbb.dupText('GOAL', 2027), '이미 목표 기관으로 설정되어 있습니다(2027 목표).');
  assert.strictEqual(kbb.dupText('WATCH'), '이미 관심 기관으로 설정되어 있습니다.');
  assert.ok(kbb.dupLinkHtml('WATCH').indexOf('관심 탭에서 보기') > 0 && kbb.dupLinkHtml('GOAL').indexOf('목표 표에서 보기') > 0);
  assert.deepStrictEqual(kbb.addState({ inst: { id: 'I1' }, tag: 'NEW', kind: 'WATCH' }), { canGo: true, why: '' });                             // 관심은 연도가 필요 없다
  assert.deepStrictEqual(kbb.addState({ inst: { id: 'I1' }, tag: 'NEW', year: 2026, closedBlock: true }), { canGo: false, why: '올해 입찰이 끝나 올해 목표로는 넣을 수 없습니다.' });
  const list = [rec('I1', '광진구청'), rec('I2', '광진복지원')];
  const r = kbb.searchInst(list, '광진', { taken: { I1: { kind: 'WATCH', year: 0 } }, closedIds: { I2: true }, today: TODAY });
  assert.deepStrictEqual(r.map(function (x) { return [x.taken, x.takenKind, x.closed]; }), [[true, 'WATCH', false], [false, 'GOAL', true]]);
});

test('빈 목표 후보 4묶음: 공고 중 → 확정 공고 예정 → 추정 공고 예정 → 협약 1년 안 종료, 묶음마다 3줄 + 그 밖 N곳, 비는 묶음은 머리째 뺀다, 이미 목표·관심은 뺀다', function () {
  const it = function (id, name, extra) { return Object.assign({ key: '11|' + name, name: name, region: '11', rec: rec(id, name) }, extra); };
  const m = {
    notice: [it('N1', '공고가', { phase: 'receiving', deadlineDays: 12 }), it('N2', '공고나', { phase: 'receiving', deadlineDays: 3 }), it('N3', '마감지남', { phase: 'awaiting', deadlineDays: -2 }), it('N4', '이미', { phase: 'receiving', deadlineDays: 1 })],
    upcoming: [it('U1', '확정가', { confidence: '확정', date: '2026-12-03' }), it('U2', '추정가', { confidence: '추정', date: '2027-01-15' }), it('U3', '추정나', { confidence: '추정', date: '2027-02-15' }),
      it('U4', '추정다', { confidence: '추정', date: '2027-03-15' }), it('U5', '추정라', { confidence: '추정', date: '2027-04-15' }), { key: 'x', name: '번호없음', rec: { name: '번호없음' }, confidence: '확정', date: '2026-12-05' }] };
  const g = { soon: [{ key: '11|끝', name: '끝', region: '11', endDate: '2026-12-31', rec: rec('S1', '끝') }], next: [] };
  const groups = kbb.candGroups(m, { N4: true }, g, []);
  assert.deepStrictEqual(groups.map(function (x) { return [x.key, x.items.length]; }), [['notice', 2], ['plan', 1], ['est', 4], ['end', 1]]);
  assert.deepStrictEqual(groups[0].items.map(function (x) { return x.when; }), ['접수 마감 D-3', '접수 마감 D-12']);   // 마감 가까운 순, 접수 마감 지난 곳은 뺀다
  assert.strictEqual(groups[1].items[0].when, '공고 예정 2026-12-03');
  assert.strictEqual(groups[2].items[0].when, '추정 2027-01');
  assert.strictEqual(groups[3].items[0].when, '협약 종료 2026-12-31');
  const h = kbb.emptyHtml({ year: 2026, canEdit: true, groups: groups });
  assert.ok(h.indexOf('<ul class="hb-cand3" id="hb-rec-list"') > 0 && h.indexOf('<h4>') < 0 && h.indexOf('hb-cand2') < 0);
  assert.strictEqual((h.match(/<input type="radio" name="hb-rec"/g) || []).length, 4);                                                // 묶음 라디오 4개
  assert.ok(h.indexOf('<input type="radio" name="hb-rec" id="hb-rec-notice" value="notice" checked') > 0 && h.indexOf('<span>추정 공고 예정 <b>4</b></span>') > 0);   // 기본 = 비지 않은 첫 묶음
  assert.strictEqual((h.match(/data-act="cand"/g) || []).length, 2);                                                                  // 공고 중 2줄만 보인다
  assert.ok(h.indexOf('hb-rec-more') < 0 && h.indexOf('찾는 기관이 없으면 위 [목표 기관 추가]에서 찾습니다.') > 0 && h.indexOf('그 밖의 기관은 위') < 0);
  assert.ok(h.indexOf('<p>입찰이 가까운 기관부터 추천합니다. [목표에 넣기]를 누르면 기관을 채운 추가 창이 열립니다.</p>') > 0);
  assert.ok(h.indexOf('<p class="hb-rec-sub" id="hb-rec-sub">지금 공고가 나 있는 기관 · 접수 마감이 가까운 순</p>') > 0);
  // recTab 존중: 추정 묶음은 4줄(5줄 이하라 더 보기 없음), 사라진 recTab은 첫 묶음으로
  const he = kbb.emptyHtml({ year: 2026, canEdit: true, groups: groups, recTab: 'est' });
  assert.ok(he.indexOf('value="est" checked') > 0 && he.indexOf('value="notice" checked') < 0 && (he.match(/data-act="cand"/g) || []).length === 4);
  assert.ok(he.indexOf('공고 시기를 짐작한 기관(확정 아님) · 시기 순') > 0);
  assert.ok(kbb.emptyHtml({ year: 2026, canEdit: true, groups: groups, recTab: 'gone' }).indexOf('value="notice" checked') > 0);
  const only = kbb.emptyHtml({ year: 2026, canEdit: true, groups: kbb.candGroups({ notice: [], upcoming: [] }, {}, g, []) });
  assert.ok(only.indexOf('type="radio"') < 0 && only.indexOf('<fieldset') < 0);                                                       // 묶음이 하나뿐이면 라디오 없음
  assert.ok(only.indexOf('<p class="hb-rec-sub" id="hb-rec-sub">협약 종료 1년 안 <b>1</b>곳 · 협약이 1년 안에 끝나는 기관</p>') > 0);
  assert.ok(kbb.emptyHtml({ year: 2026, canEdit: true, groups: [] }).indexOf('협약이 1년 안에 끝나는 기관이 없습니다.') > 0);
  assert.ok(kbb.emptyHtml({ year: 2026, canEdit: false, groups: groups }).indexOf('<button') < 0);
});

test('빈 목표 후보 추천: 처음 5줄 + [N곳 더 보기], recAll이면 전부·단추 없음, 묶음 안 정렬(날짜·종료일 순, 같으면 이름 순)', function () {
  const it = function (id, name, extra) { return Object.assign({ key: '11|' + name, name: name, region: '11', rec: rec(id, name) }, extra); };
  assert.strictEqual(kbb.CAND_MAX, 5);
  const up = [];
  ['07', '03', '05', '03', '09', '01', '08'].forEach(function (mm, i) { up.push(it('U' + i, '확정' + String.fromCharCode(97 + i), { confidence: '확정', date: '2027-' + mm + '-10', days: Number(mm) * 30 })); });
  const soon = [['끝다', '2027-02-01'], ['끝가', '2027-02-01'], ['끝나', '2026-12-01']].map(function (p, i) { return { key: '11|' + p[0], name: p[0], region: '11', endDate: p[1], rec: rec('S' + i, p[0]) }; });
  const groups = kbb.candGroups({ notice: [], upcoming: up }, {}, { soon: soon, next: [] }, []);
  assert.deepStrictEqual(groups[0].items.map(function (x) { return x.when; }), ['공고 예정 2027-01-10', '공고 예정 2027-03-10', '공고 예정 2027-03-10', '공고 예정 2027-05-10', '공고 예정 2027-07-10', '공고 예정 2027-08-10', '공고 예정 2027-09-10']);
  assert.deepStrictEqual(groups[0].items.slice(1, 3).map(function (x) { return x.name; }), ['확정b', '확정d']);   // 같은 날짜는 이름 순
  assert.deepStrictEqual(groups[1].items.map(function (x) { return x.name; }), ['끝나', '끝가', '끝다']);   // 종료일 순, 같으면 이름 순
  const h = kbb.emptyHtml({ year: 2026, canEdit: true, groups: groups });
  assert.strictEqual((h.match(/data-act="cand"/g) || []).length, 5);
  assert.ok(h.indexOf('<button type="button" id="hb-rec-more" data-group="plan">2곳 더 보기</button>') > 0);
  const all = kbb.emptyHtml({ year: 2026, canEdit: true, groups: groups, recAll: true });
  assert.strictEqual((all.match(/data-act="cand"/g) || []).length, 7);
  assert.ok(all.indexOf('hb-rec-more') < 0);
  const end = kbb.emptyHtml({ year: 2026, canEdit: true, groups: groups, recTab: 'end', recAll: true });
  assert.ok(end.indexOf('value="end" checked') > 0 && (end.match(/data-act="cand"/g) || []).length === 3 && end.indexOf('협약이 1년 안에 끝나는 기관 · 종료일 순') > 0);
  const js = src('js/kbboard.js');
  assert.ok(js.indexOf("t.name === 'hb-rec'") > 0 && js.indexOf("case 'hb-rec-more'") > 0 && js.indexOf('gs.recAll = false') > 0);   // 이벤트·초기화 배선
  assert.ok(js.indexOf("gs.recTab = btn.getAttribute('data-group')") > 0);                                                            // 더 보기는 지금 묶음으로 고정
  // 사라진 묶음 + 펼침 → 첫 묶음 5줄 + 더 보기(펼침 무시)
  const gone = kbb.emptyHtml({ year: 2026, canEdit: true, groups: groups, recTab: 'gone', recAll: true });
  assert.strictEqual((gone.match(/data-act="cand"/g) || []).length, 5);
  assert.ok(gone.indexOf('id="hb-rec-more" data-group="plan"') > 0);
  // 라디오 id(다시 그릴 때 포커스 복원용) + 추천받기 창의 .hb-rec와 겹치지 않는 컨테이너 클래스
  assert.ok(h.indexOf('id="hb-rec-plan"') > 0 && h.indexOf('class="hb-erec"') > 0 && h.indexOf('class="hb-rec"') < 0);
  assert.ok(src('index.html').indexOf('.hb-erec {') > 0);
});

test('빈 목표 후보 정렬: 공고 중은 model 원래 순서 유지(일수가 둘 다 숫자일 때만 비교), 확정·추정은 일수 순, 종료일 없는 줄은 맨 뒤·when 빈 칸, XSS 이스케이프', function () {
  const it = function (id, name, extra) { return Object.assign({ key: '11|' + name, name: name, region: '11', rec: rec(id, name) }, extra); };
  // 마감일 미확인(숫자 아님) 두 곳은 들어온 순서(다, 가) 그대로 — 이름 순으로 섞이지 않는다
  const m = { notice: [it('A', '다', { phase: 'receiving' }), it('B', '가', { phase: 'receiving' }), it('C', '나', { phase: 'receiving', deadlineDays: 5 })], upcoming: [
    it('D', '확정나', { confidence: '확정', date: '2026-12-03', days: 9 }), it('E', '확정가', { confidence: '확정', date: '2026-12-03', days: 9 }), it('F', '확정다', { confidence: '확정', date: '2026-12-01', days: 7 }),
    it('G', '추정나', { confidence: '추정', date: '2027-02-01', days: 70 }), it('H', '추정가', { confidence: '추정', date: '2027-01-01', days: 38 })] };
  const g = { soon: [{ key: '11|없음', name: '없음', region: '11', endDate: '', rec: rec('S0', '없음') }, { key: '11|끝', name: '끝', region: '11', endDate: '2026-12-31', rec: rec('S1', '끝') }], next: [] };
  const gr = kbb.candGroups(m, {}, g, []);
  assert.deepStrictEqual(gr[0].items.map(function (x) { return x.name; }), ['다', '가', '나']);
  assert.deepStrictEqual(gr[1].items.map(function (x) { return x.name; }), ['확정다', '확정가', '확정나']);
  assert.deepStrictEqual(gr[2].items.map(function (x) { return x.name; }), ['추정가', '추정나']);
  assert.deepStrictEqual(gr[3].items.map(function (x) { return [x.name, x.when]; }), [['끝', '협약 종료 2026-12-31'], ['없음', '']]);
  const X = '<img onerror=x>';
  const xs = kbb.emptyHtml({ year: 2026, canEdit: true, groups: [{ key: X, label: X, items: [{ id: 'I1', key: X, name: X, region: X, when: X }] }, { key: 'end', label: 'e', items: [{ id: 'I2', key: 'k', name: 'n', region: '11', when: '' }] }] });
  assert.ok(xs.indexOf('&lt;img') > 0 && xs.indexOf('<img') < 0);
});

test('협약 중인 기관 팝업 줄: [목표에 넣기]는 해당 줄에만, 이미 걸린 줄은 칩, 예전 모양은 그대로', function () {
  const it = { key: '11|가', name: '가', region: '11', rec: rec('I1', '가'), endDays: 40, endDate: '2026-12-31', days: 40, date: '2027-02-01', label: '', confidence: '추정', overdue: false };
  const plain = kbb.rowHtml(it, { verified: [], nextList: [] });
  assert.ok(plain.indexOf('<li><button type="button" class="hb-row"') === 0 && plain.indexOf('hb-mark') < 0 && plain.indexOf('data-act="oadd"') < 0);
  const add = kbb.rowHtml(it, { verified: [], nextList: [], canAdd: true });
  assert.ok(add.indexOf('<li class="hb-rl"><button type="button" class="hb-row"') === 0 && add.indexOf('</button><button type="button" class="hb-tag add" data-act="oadd" data-inst="I1" data-key="11|가" aria-label="가 목표에 넣기">목표에 넣기</button></li>') > 0);
  const mk = kbb.rowHtml(it, { verified: [], nextList: [], mark: '2026 목표' });
  assert.ok(mk.indexOf('<span class="hb-slot hb-mark">2026 목표</span>') > 0 && mk.indexOf('data-act="oadd"') < 0);
  assert.ok(kbb.rowHtml(Object.assign({}, it, { name: '<img>' }), { verified: [], nextList: [], mark: '<img>', canAdd: true }).indexOf('<img') < 0);
});

test('소스 구조: 새 버튼 id·역할, 보안(서버 글 textContent·esc, 근거 코드는 고정 문장), 접근성(탭·필터·팝업·inert), 새 hex·변수 없음', function () {
  const k = src('js/kbboard.js');
  ['add_watch_target', 'edit_bid_target', 'goal_next_year', 'move_to_goal', 'move_to_watch'].forEach(function (b) { assert.ok(k.indexOf("'" + b + "'") > 0, b); });
  const j = path.join(ROOT, '..', 'kgi-ggreport-web', 'src', 'main', 'java', 'com', 'kbstar', 'kgi', 'ggreport', 'web', 'support', 'TargetUiIds.java');
  if (fs.existsSync(j)) { const t = fs.readFileSync(j, 'utf8'); Object.keys(kbb.BTN).forEach(function (n) { assert.ok(t.indexOf('"' + kbb.BTN[n] + '"') > 0, kbb.BTN[n]); }); }
  // 팝업: 뒤는 inert, 닫을 때(closePop) 정확히 inert를 풀고, 화면을 떠나거나 계정이 바뀌어도 closePop을 거친다(qa 4절 4)
  assert.ok(/function closePop\(refocus\) \{[\s\S]*?kbb\.inertRelease\(popInert\); popInert = \[\];[\s\S]*?\n  \}/.test(k) && k.indexOf('popInert = kbb.inertBehind(ov, document.body);') > 0 && k.indexOf("ev.key === 'Escape'") > 0);
  assert.ok(/kbb\.unmount = function \(\) \{[\s\S]*?closePop\(false\);/.test(k) && /kbb\.onProfileChange = function \(\) \{[\s\S]*?closePop\(false\);/.test(k));
  assert.ok(/ev\.key === 'Escape'\) \{ ev\.preventDefault\(\); ev\.stopPropagation\(\); closePop\(true\)/.test(k) && k.indexOf('if (ev.target === ov) closePop(true)') > 0 && k.indexOf("case 'hb-ours-close': closePop(true); break;") > 0);
  assert.ok(k.indexOf('<h3 id="hb-ot">협약 중인 기관</h3><span id="hb-osm"></span>') > 0 && k.indexOf('aria-describedby="hb-osm"') > 0);   // 건수 줄은 제목 밖(design P3-2)
  assert.ok(k.indexOf('id="hb-ours-btn" aria-haspopup="dialog" aria-disabled="true"') > 0 && k.indexOf("btn.removeAttribute('aria-disabled')") > 0);   // 자료 전에는 aria-disabled, 받으면 해제(design P3-3)
  assert.ok(k.indexOf("if (refocus) { const b = $('hb-ours-btn');") > 0);                                                                 // 닫으면 여는 버튼으로 포커스
  assert.ok(k.indexOf("e.key === 'ArrowLeft' || e.key === 'ArrowRight'") > 0 && k.indexOf("role=\"tab\"") > 0);                          // 탭 ←/→
  assert.ok(/qTimer = setTimeout\(function \(\) \{[\s\S]*?\}, 150\)/.test(k));                                                            // 검색 디바운스 150ms
  assert.ok(k.indexOf("if (sig === gs.tbSig && tb.firstChild)") > 0);                                                                     // 검색 입력 중에는 도구 줄을 다시 만들지 않는다(한글 조합)
  assert.ok(k.indexOf('aria-live') < 0 && k.indexOf('confirm(') < 0 && k.indexOf('alert(') < 0);
  assert.ok(k.indexOf("if (r.kind === 'WATCH') delete body.target_year;") > 0);                                                          // 관심은 연도를 보내면 400
  assert.ok(k.indexOf("body = watch ? { kind_cd: 'WATCH', tag_cd: m.tag, memo: memo } : { target_year: eff.year") > 0 || k.indexOf("{ kind_cd: 'WATCH', tag_cd: m.tag, memo: memo }") > 0);
  assert.ok(k.indexOf('m.warn = { mode: \'block\', basis: o.basis') > 0);                                                                  // 409 근거는 코드·날짜로 만든 고정 문장
  const html = src('index.html');
  const a = html.indexOf('/* 국민은행 상태 현황판(kbboard.js) 시작'), b = html.indexOf('/* 국민은행 상태 현황판 끝 */');
  const css = html.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\.hb-stgs \{[^}]*grid-template-columns:88px repeat\(5, minmax\(0,1fr\)\)[^}]*border-top:1px solid var\(--line\)/.test(css) && /\.hb-sb \{[^}]*height:28px[^}]*border-radius:var\(--r\)/.test(css));
  assert.ok(/\.hb-sb::after \{[^}]*calc\(\(100% - 16px\) \* var\(--p, 0\)\)/.test(css) && /\.hb-sb\[aria-pressed=true\] \{[^}]*var\(--accent-color\) 13%/.test(css) && /\.hb-sb:disabled \{[^}]*color:var\(--muted\)/.test(css));
  assert.ok(/\.hb-tb \{[^}]*flex:none[^}]*padding:8px 12px[^}]*border-bottom:1px solid var\(--line\)/.test(css) && /\.hb-tb \.cnt \{ margin-left:auto;/.test(css));
  assert.ok(/\.hb-tb select\.on, \.hb-tb input\.on \{ border-color:color-mix\(in srgb, var\(--accent-color\) 55%, var\(--line-strong\)\); \}/.test(css));
  assert.ok(/\.hb-sort \{ all:unset;/.test(css) && /\.hb-sort:focus-visible \{ outline:2px solid var\(--accent-color\); outline-offset:2px; \}/.test(css) && /\.hb-dd\.end \{[^}]*color:var\(--muted\)/.test(css));
  assert.ok(/\.hb-warn \{[^}]*border:1px solid var\(--orange\)[^}]*color-mix\(in srgb, var\(--orange\) 8%, transparent\)/.test(css) && /\.hb-warn \.t \{[^}]*color-mix\(in srgb, var\(--orange\) 72%, var\(--fg\)\)/.test(css));
  assert.ok(/\.hb-erec \{[^}]*max-width:720px/.test(css) && css.indexOf('.hb-erec {') > 0 &&/\.hb-cand3 li \{[^}]*grid-template-columns:132px minmax\(0,1fr\) auto/.test(css) && css.indexOf('.hb-cand2') < 0);
  assert.ok(/\.hb-tt col\.c-next \{ width:170px; \}/.test(css) && /\.hb-tt col\.c-wnm \{ width:200px; \}/.test(css) && /@media \(max-width:880px\) \{ \.hb-stgs \{[^}]*overflow-x:auto/.test(css));
  assert.ok(/\.hb-tp \{[^}]*calc\(100vh - 296px\)/.test(css) && css.indexOf('#hb-ours > summary') < 0);
  assert.deepStrictEqual(css.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);                                                                     // hex 없음
  assert.deepStrictEqual((css.match(/(^|[\s;{])--[\w-]+\s*:/g) || []).map(function (s) { return s.trim().replace(/:$/, '').replace(/^[;{]/, ''); }), ['--rowbg', '--rowbg', '--rowbg']);   // :root 변수는 안 늘고 표 칸 지역 변수 --rowbg만(11-19 E)                                                                // 새 :root 변수 없음(표 칸 지역 변수 --rowbg만)
  assert.ok(css.indexOf('72%, #fff') < 0 && css.slice(css.indexOf('.hb-warn {')).indexOf('box-shadow') < 0);   // 새 그림자 없음
  // 단계 버튼 테두리는 --line-strong, 꺼진 버튼은 --line(design P2-2)
  assert.ok(/\.hb-sb \{[^}]*border:1px solid var\(--line-strong\)/.test(css) && /\.hb-sb:disabled \{[^}]*border-color:var\(--line\)/.test(css));
});

test('포커스 복원 규칙(qa P1-1): id만 있는 요소(검색칸·탭·select)는 id로, data-key 줄 버튼은 기존대로, 식별할 것이 없으면 아무 데도 옮기지 않는다', function () {
  assert.deepStrictEqual(kbb.focusPlan({ id: 'hb-q', key: '', act: '', bid: '' }), { id: 'hb-q' });                       // 검색칸 → 'hb-q' 복원
  assert.deepStrictEqual(kbb.focusPlan({ id: 'hb-tab-watch' }), { id: 'hb-tab-watch' });
  assert.deepStrictEqual(kbb.focusPlan({ id: 'hb-f-status' }), { id: 'hb-f-status' });
  assert.deepStrictEqual(kbb.focusPlan({ id: '', key: '11|가', act: 'tag', bid: '' }), { key: '11|가', act: 'tag', bid: '', sort: '' });   // 줄 버튼은 data-key로
  assert.deepStrictEqual(kbb.focusPlan({ id: 'x', key: '11|가', act: '', bid: '' }), { key: '11|가', act: '', bid: '', sort: '' });   // data-key가 있으면 그쪽이 먼저
  assert.deepStrictEqual(kbb.focusPlan({ sort: 'due' }), { key: '', act: '', bid: '', sort: 'due' });                     // 열 머리 정렬 버튼
  assert.strictEqual(kbb.focusPlan({ id: '', key: '', act: '', bid: '' }), null);                                          // 예전에는 '첫 버튼'으로 튀었다
  assert.strictEqual(kbb.focusPlan(null), null);
  const k = src('js/kbboard.js');
  assert.ok(/function restoreFocus\(sc, keepKey\) \{[\s\S]*?if \(keepKey\.id\) \{[\s\S]*?sc\.querySelector\('#' \+ keepKey\.id\)[\s\S]*?return;/.test(k));
  assert.ok(/ae !== document\.body && ae !== sc && sc\.contains\(ae\)\) return;/.test(k));                                  // 이미 목록 안에 포커스가 있으면(paintToolbar가 되돌렸으면) 덮어쓰지 않는다
});

test('마감까지 내림차순도 입찰 종료·미상 줄은 맨 아래(qa P3-1), 오름차순은 그대로', function () {
  const ctx = mkCtx();
  const rows = kbb.goalRows([tgt('IA', 'RETAIN'), tgt('IB', 'NEW'), tgt('IE', 'NEW'), tgt('IC', 'NEW', { bid_closed: { basis_cd: 'NOTICE_CLOSED', basis_date: '2026-09-30', round_seq: 1 } })], ctx);
  const ids = function (d) { return kbb.sortBy(rows, 'due', d).map(function (r) { return r.id; }); };
  assert.deepStrictEqual(ids('asc'), ['IA', 'IB', 'IE', 'IC']);
  const desc = ids('desc');
  assert.deepStrictEqual(desc.slice(-2), ['IE', 'IC']);                                  // 미상 → 입찰 종료, 방향과 상관없이 맨 아래
  assert.deepStrictEqual(desc.slice(0, 2).sort(), ['IA', 'IB']);                         // 나머지는 방향대로 뒤집힌다
  assert.notDeepStrictEqual(desc.slice(0, 2), ids('asc').slice(0, 2));
});

test('옛 서버(watch_items 없음): 관심 줄 0·예외 없음, 관심 탭·[관심 기관 추가]·넣을 곳 라디오·[관심 기관으로 넣기]를 숨긴다(qa P3-2)', function () {
  assert.deepStrictEqual(kbb.goalRows(undefined, mkCtx()), []);
  const base = { nGoal: 1, nWatch: 0, f: { q: '', tag: '', status: '', kind: '', stage: -1 }, shown: 1, total: 1, canEdit: true };
  const old = kbb.toolbarHtml(Object.assign({ tab: 'goal', noWatch: true }, base));
  assert.ok(old.indexOf('id="hb-tab-goal"') > 0 && old.indexOf('hb-tab-watch') < 0 && old.indexOf('hb-watch-add') < 0);
  assert.ok(kbb.toolbarHtml(Object.assign({ tab: 'goal' }, base)).indexOf('id="hb-tab-watch"') > 0);                      // 새 서버는 그대로
  assert.ok(kbb.toolbarHtml(Object.assign({ tab: 'watch', noWatch: true }, base)).indexOf('hb-watch-add') < 0);
  const t = kbb.goalTableHtml({ st: 'ok', year: 2026, tab: 'goal', win: kbb.laneWindow(TODAY, 2026), rows: [], out: [], canEdit: true, groups: [], total: 0, noWatch: true });
  assert.ok(t.indexOf('<table') === 0);
  assert.strictEqual(kbb.addDialogHtml({ q: '', year: 2026, tag: '' }, { years: [2026], tags: [], noWatch: true }).indexOf('hb-a-kind'), -1);
  const wb = kbb.warnHtml({ mode: 'block', basis: { cd: 'NOTICE_CLOSED', date: '2026-09-30' }, years: [2027], noWatch: true });
  assert.ok(wb.indexOf('hb-w-watch') < 0 && wb.indexOf('id="hb-w-next">2027 목표로 넣기') > 0);
  const k = src('js/kbboard.js');
  assert.ok(k.indexOf('function noWatchNow() { return gs.st === \'ok\' && !!gs.data && !Array.isArray(gs.data.watch_items); }') > 0);
  assert.ok(k.indexOf("canMove: r.kind !== 'WATCH' && !noWatchNow()") > 0 && k.indexOf("if (noWatch && gs.tab === 'watch') gs.tab = 'goal';") > 0);
});

test('도구 줄·검색·배선 구조(qa P1-1·P2-2·P3-3~P3-5, design P2-1): 건수 노드 유지, 조합 중 미룸, 타이머는 현재 값, 새 줄 거르기 풀기, 다른 해 줄 보기', function () {
  const k = src('js/kbboard.js');
  // 건수 노드: 도구 줄을 다시 만들어도 같은 #hb-cnt를 떼었다 되꽂는다
  assert.ok(/let cnt = \$\('hb-cnt'\);[\s\S]*?removeChild\(cnt\)[\s\S]*?tb\.innerHTML = v\.loaded \? kbb\.toolbarHtml\(v\) : '';[\s\S]*?replaceChild\(cnt, fresh\)/.test(k));
  assert.strictEqual(kbb.cntHtml(3, 5), '<span class="sr-only">5곳 중 3곳 보임</span><span aria-hidden="true"><b>3</b> / <b>5</b>곳</span>');
  // 한글 조합 중에는 다시 그리지 않고, 끝나면 한 번만. 타이머는 그 시점 입력칸 값을 읽고 거르기가 바뀌면 취소
  assert.ok(k.indexOf("host.addEventListener('compositionstart', onCompStart, opt)") > 0 && k.indexOf("host.addEventListener('compositionend', onCompEnd, opt)") > 0);
  assert.ok(/function onInput\(e\) \{[\s\S]*?if \(e\.isComposing \|\| composing\) return;[\s\S]*?schedQ\(\);/.test(k));
  assert.ok(/function schedQ\(\) \{[\s\S]*?if \(!host \|\| composing\) return;\s*const t = \$\('hb-q'\); if \(!t\) return;\s*gs\.f\.q = t\.value;/.test(k));
  assert.ok(/function clearFilters\(\) \{ cancelQ\(\);/.test(k) && /function stageBtn\(i\) \{\s*cancelQ\(\);/.test(k) && /function showRow\(tab, id, year\) \{\s*cancelQ\(\);/.test(k));
  // 탭 패널 이름은 도구 줄이 있을 때만
  assert.ok(k.indexOf("if (ok) ts.setAttribute('aria-labelledby', 'hb-tab-' + gs.tab); else ts.removeAttribute('aria-labelledby');") > 0);
  // 넣기·옮기기 성공 뒤 새 줄이 거르기에 가려지면 풀고 그 줄로
  assert.ok(k.indexOf('gs.focusNext = { inst: m.inst.id, reveal: true }') > 0 && k.indexOf('gs.focusNext = { inst: r.id, reveal: true }') > 0);
  assert.ok(/if \(!el && f\.reveal && f\.inst && gs\.st === 'ok' && kbb\.filterOn\(gs\.f\)\) \{\s*gs\.f = \{ q: '', tag: '', status: '', kind: '', stage: -1 \};/.test(k));
  // 다른 해 목표의 줄 보기: 그 해로 옮겨 다시 받는다
  assert.ok(k.indexOf("showRow(which === 'WATCH' ? 'watch' : 'goal', id, yr)") > 0 && k.indexOf("gs.year = Number(year); gs.optSig = ''; loadGoals(); return;") > 0);
});

test('거르기 풀기 뒤처리(qa N-1·N-2): 풀 때 검색칸 글자도 비움, [필터 지우기] 뒤 포커스는 검색칸, 단계 버튼은 data-stage로 복귀', function () {
  const k = src('js/kbboard.js');
  assert.ok(k.indexOf("function clearQInput() { const q = $('hb-q'); if (q) q.value = ''; }") > 0);
  assert.ok(/if \(!el && f\.reveal[\s\S]*?gs\.f = \{ q: '', tag: '', status: '', kind: '', stage: -1 \};\s*clearQInput\(\);/.test(k));        // applyFocusNext
  assert.ok(/function showRow\(tab, id, year\) \{[\s\S]*?gs\.f = \{ q: '', tag: '', status: '', kind: '', stage: -1 \}; clearQInput\(\);/.test(k));   // showRow
  assert.ok(/function clearFilters\(\) \{[^\n]*renderGoals\(\); clearQInput\(\); const q = \$\('hb-q'\); if \(q && q\.focus\) q\.focus\(\);/.test(k));
  assert.deepStrictEqual(kbb.focusPlan({ id: '', key: '', act: '', bid: '', sort: '', stage: '2' }), { key: '', act: '', bid: '', sort: '', stage: '2' });
  assert.deepStrictEqual(kbb.focusPlan({ stage: '0' }), { key: '', act: '', bid: '', sort: '', stage: '0' });   // 문자열 '0'은 참이라 0단계도 잡힌다
  assert.ok(k.indexOf("stage: ae.getAttribute('data-stage') || ''") > 0 && k.indexOf("(b.getAttribute('data-stage') || '') === (keepKey.stage || '')") > 0);
});
