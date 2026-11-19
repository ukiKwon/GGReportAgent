// 입찰 현황판 '올해 목표 기관' 표(kbboard.js 순수 부분, 2026-11-17 규격 design-reviewer acfdd5da): 12개월 레인·구분 기본값·마감까지·지연 판정·빈 상태 후보·행 마크업·대화창 검증·응답 처리·보기 전용·CSS 구조.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const logic = require('../js/logic.js');
const dash = require('../js/dashboard.js');
const kbb = require('../js/kbboard.js');

const TODAY = new Date(2026, 10, 17);   // 2026-11-17 (로컬)
function p(n) { return logic.localDateStr(new Date(2026, 10, 17 + n)); }
function src(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function rec(id, name, extra) { return Object.assign({ institutionId: id, name: name, region: '11', type: '지자체', confirmed: false }, extra || {}); }

// ── 12개월 레인 ─────────────────────────────────────────────────────
test('laneWindow: 시작 = max(이번 달 1일, 목표 연도 1월 1일), 12개월, 오늘 위치(%)', function () {
  const w = kbb.laneWindow(TODAY, 2026);
  assert.strictEqual(w.start, '2026-11-01');
  assert.strictEqual(w.label, '2026.11 ~ 2027.10');
  assert.deepStrictEqual(w.months.slice(0, 3), [{ y: 2026, m: 11 }, { y: 2026, m: 12 }, { y: 2027, m: 1 }]);
  assert.strictEqual(w.months.length, 12);
  assert.strictEqual(w.nowPct, 4.444);                                        // 11월 17일 = (16/30)/12
  const y27 = kbb.laneWindow(TODAY, 2027);                                    // 2027 목표 = 2027.01~12, 오늘은 창 밖
  assert.strictEqual(y27.start, '2027-01-01');
  assert.strictEqual(y27.label, '2027.01 ~ 2027.12');
  assert.strictEqual(y27.nowPct, null);
  assert.strictEqual(kbb.laneWindow(TODAY, 2025).start, '2026-11-01');        // 지난 해는 이번 달부터
  assert.strictEqual(kbb.laneWindow('2026-12-31', 2026).label, '2026.12 ~ 2027.11');
  assert.strictEqual(kbb.laneWindow('2026-12-31', 2026).nowPct, 8.065);
  assert.strictEqual(kbb.laneWindow(TODAY, 0).start, '2026-11-01');            // 연도 없음 = 올해
});

test('laneGeom: 확정 = 공고일~접수 마감(달 눈금에 맞춘 비율), 추정 = 그 달 한 칸, 창 밖은 off', function () {
  const w = kbb.laneWindow(TODAY, 2026);
  assert.deepStrictEqual(kbb.laneGeom('2026-11-20', '2026-11-29', false, w), { left: 5.278, width: 2.778, off: null });   // 규격 시안 5.3%·2.5%
  assert.deepStrictEqual(kbb.laneGeom('2027-06-15', '', true, w), { left: 58.333, width: 8.333, off: null });           // 추정 = 7번째 칸
  assert.deepStrictEqual(kbb.laneGeom('', '2027-06-15', true, w), { left: 58.333, width: 8.333, off: null });
  assert.strictEqual(kbb.laneGeom('2028-01-10', '', true, w).off, 'after');
  assert.strictEqual(kbb.laneGeom('2026-09-10', '', true, w).off, 'before');
  assert.strictEqual(kbb.laneGeom('2026-11-01', '2026-11-01', true, w).left, 0);
  assert.strictEqual(kbb.laneGeom('2027-10-30', '', true, w).off, null);       // 12번째 칸(마지막 달)
  assert.strictEqual(kbb.laneGeom('2027-11-01', '', true, w).off, 'after');     // 13번째 달부터 밖
  // 창 시작 앞에서 걸치면 0에서 자른다
  assert.deepStrictEqual(kbb.laneGeom('2026-10-25', '2026-11-05', false, w), { left: 0, width: 1.389, off: null });
  // 공고일이 없으면 마감 앞 7일, 마감일이 없으면 공고일 하루
  assert.deepStrictEqual(kbb.laneGeom('', '2026-11-29', false, w), { left: 5.833, width: 2.222, off: null });
  assert.strictEqual(kbb.laneGeom('2026-11-10', '', false, w).width, 0.278);
  assert.strictEqual(kbb.laneGeom('2026-10-01', '2026-10-20', false, w).off, 'before');
  assert.strictEqual(kbb.laneGeom('2028-02-01', '2028-02-10', false, w).off, 'after');
  assert.strictEqual(kbb.laneGeom('', '', false, w), null);
  assert.strictEqual(kbb.laneGeom('엉터리', '2026-13-40', true, w), null);
  // 2027 창
  const w27 = kbb.laneWindow(TODAY, 2027);
  assert.strictEqual(kbb.laneGeom('2027-01-05', '', true, w27).left, 0);
  assert.strictEqual(kbb.laneGeom('2026-12-20', '', true, w27).off, 'before');
});

// ── 구분(태그) 기본값 ───────────────────────────────────────────────────
test('defaultTag: 039 kb_now(KB→재유치, OTHER→신규유치) → NO_RECORD면 행안부 국민은행 줄 → KB_VERIFIED → 없음', function () {
  const r = rec('I1', '가', {});
  const LO = { rows: { '11|가': [{ bank: '국민은행', rank: 'RANK1', accts: ['일반회계'], end: '2026-12-31' }] } };
  const LO2 = { rows: { '11|가': [{ bank: '농협은행', rank: 'RANK1', accts: ['일반회계'], end: '2026-12-31' }] } };
  const V = [{ key: '11|가', name: '가', slot: 1 }];
  const o = { lofin: LO, verified: V, today: TODAY };
  assert.deepStrictEqual(kbb.defaultTag(r, { kb_now: 'KB' }, o), { tag: 'RETAIN', why: 'kb' });
  assert.deepStrictEqual(kbb.defaultTag(r, { kb_now: 'OTHER' }, o), { tag: 'NEW', why: 'other' });       // 039가 먼저(행안부·검증 목록에 국민은행이 있어도)
  assert.deepStrictEqual(kbb.defaultTag(r, { kb_now: 'NO_RECORD' }, o), { tag: 'RETAIN', why: 'lofin' });
  assert.deepStrictEqual(kbb.defaultTag(r, null, o), { tag: 'RETAIN', why: 'lofin' });
  assert.deepStrictEqual(kbb.defaultTag(r, { kb_now: 'NO_RECORD' }, { lofin: LO2, verified: V, today: TODAY }), { tag: 'RETAIN', why: 'verified' });
  // qa 11-17 P2-2: 039 기록은 없지만 행안부 자료로 다른 은행이 금고인 것이 확인되면 신규유치 도전(국민은행만 재유치) + 은행 이름. 은행을 모를 때만 기본값 없음.
  assert.deepStrictEqual(kbb.defaultTag(r, { kb_now: 'NO_RECORD' }, { lofin: LO2, verified: [], today: TODAY }), { tag: 'NEW', why: 'other', bank: '농협은행' });
  assert.deepStrictEqual(kbb.defaultTag(r, null, { lofin: LO2, verified: [], today: TODAY }), { tag: 'NEW', why: 'other', bank: '농협은행' });
  const LO3 = { rows: { '11|가': [{ bank: '농협은행', rank: 'RANK1', accts: ['일반회계'], end: '2020-12-31' }] } };            // 협약이 끝난 줄만 있으면 지금 금고를 모른다
  assert.deepStrictEqual(kbb.defaultTag(r, { kb_now: 'NO_RECORD' }, { lofin: LO3, verified: [], today: TODAY }), { tag: '', why: '' });
  assert.deepStrictEqual(kbb.defaultTag(r, { kb_now: 'NO_RECORD' }, { lofin: null, verified: [], today: TODAY }), { tag: '', why: '' });   // 은행 미상
  assert.deepStrictEqual(kbb.defaultTag(r, { kb_now: 'OTHER', lines_now: [{ rank_cd: 'FIRST', bank_name: '우리은행' }] }, { lofin: null, verified: [], today: TODAY }), { tag: 'NEW', why: 'other', bank: '우리은행' });
  assert.deepStrictEqual(kbb.defaultTag(r, undefined, undefined), { tag: '', why: '' });
  assert.deepStrictEqual(kbb.defaultTag(null, { kb_now: 'NO_RECORD' }, o), { tag: '', why: '' });
  // 대화창 근거 문장·메뉴 근거
  assert.strictEqual(kbb.tagNote({ tag: 'RETAIN', why: 'kb' }, '광진구청'), '광진구청은 지금 국민은행이 금고라 \'재유치 도전\'을 골랐습니다. 바꿀 수 있습니다.');
  assert.strictEqual(kbb.tagNote({ tag: 'NEW', why: 'other' }, '하남시'), '하남시는 지금 다른 은행이 금고라 \'신규유치 도전\'을 골랐습니다. 바꿀 수 있습니다.');
  // 다른 은행이 금고인 줄 아는데 039 기록이 없는 경우 — 은행 이름을 넣어 '자료가 없어'라고 하지 않는다(선택 줄의 은행과 같은 말)
  assert.strictEqual(kbb.tagNote({ tag: 'NEW', why: 'other', bank: '우리은행' }, '강동구청'), '강동구청은 지금 우리은행이 금고라 \'신규유치 도전\'을 골랐습니다. 바꿀 수 있습니다.');
  assert.strictEqual(kbb.tagNote({ tag: 'NEW', why: 'other', bank: '농협은행' }, '하남시'), '하남시는 지금 농협은행이 금고라 \'신규유치 도전\'을 골랐습니다. 바꿀 수 있습니다.');
  assert.strictEqual(kbb.tagNote({ tag: 'NEW', why: 'other', bank: 'SC제일' }, '하남시'), '하남시는 지금 SC제일이 금고라 \'신규유치 도전\'을 골랐습니다. 바꿀 수 있습니다.');
  assert.strictEqual(kbb.tagNote({ tag: '', why: '' }, '광진구청'), '현 금고 은행 자료가 없어 직접 고릅니다.');                      // 은행 미상일 때만
  assert.strictEqual(kbb.tagWhy({ tag: 'RETAIN', why: 'lofin' }), '지금 국민은행 협약 중');
  assert.strictEqual(kbb.tagWhy({ tag: 'NEW', why: 'other' }), '지금 다른 은행이 금고');
  assert.strictEqual(kbb.tagWhy({ tag: 'NEW', why: 'other', bank: '우리은행' }), '지금 우리은행이 금고');
});

// ── 마감까지·레인 칸 ─────────────────────────────────────────────────
function itemOf(r) { return dash.itemForRec(r, TODAY); }
test('dueOf·dueHtml: 확정 마감 D-n(30일 안이면 빨강) / 마감 미확인 / 마감 지남 / 예정일 지남 / 추정 / 확정 공고일 / 미상', function () {
  const fixed = kbb.dueOf(itemOf(rec('IA', '가', { confirmed: true, contractEnd: p(-3), receiveTo: p(12) })));
  assert.strictEqual(fixed.kind, 'fixed'); assert.strictEqual(fixed.days, 12);
  assert.strictEqual(kbb.dueHtml(fixed), '<b class="hb-dd hot">D-12</b><span class="hb-q">마감</span>');
  assert.strictEqual(kbb.dueHtml({ kind: 'fixed', days: 31 }), '<b class="hb-dd">D-31</b><span class="hb-q">마감</span>');          // 30일 초과는 빨강 아님
  assert.ok(kbb.dueHtml({ kind: 'fixed', days: 0 }).indexOf('>D-day<') > 0);
  const open = kbb.dueOf(itemOf(rec('IB', '나', { confirmed: true, contractEnd: p(-3) })));                                      // 공고는 났고 마감일 모름
  assert.strictEqual(open.kind, 'open');
  assert.strictEqual(kbb.dueHtml(open), '<b class="hb-dd tx">공고 중</b><span class="hb-q">마감 미상</span>');
  const closed = kbb.dueOf(itemOf(rec('IC', '다', { confirmed: true, contractEnd: p(-20), receiveTo: p(-5) })));
  assert.strictEqual(closed.kind, 'closed');
  assert.strictEqual(kbb.dueHtml(closed), '<b class="hb-dd tx">마감 지남</b>');
  const over = kbb.dueOf(itemOf(rec('ID', '라', { contractEnd: p(-140) })));
  assert.strictEqual(over.kind, 'over'); assert.strictEqual(over.days, 140); assert.strictEqual(over.est, true);
  assert.strictEqual(kbb.dueHtml(over), '<b class="hb-dd est">D+140</b><span class="hb-q">추정 지남</span>');
  assert.strictEqual(kbb.dueHtml({ kind: 'over', days: 3, est: false }), '<b class="hb-dd est">D+3</b><span class="hb-q">지남</span>');
  const est = kbb.dueOf(itemOf(rec('IE', '마', { contractEnd: p(200) })));
  assert.strictEqual(est.kind, 'est'); assert.strictEqual(est.days, 200);
  assert.strictEqual(kbb.dueHtml(est), '<b class="hb-dd est">D-200</b><span class="hb-q">추정</span>');
  const plan = kbb.dueOf(itemOf(rec('IF', '바', { confirmed: true, contractEnd: p(30) })));
  assert.strictEqual(plan.kind, 'plan'); assert.strictEqual(plan.days, 30);
  assert.strictEqual(kbb.dueHtml(plan), '<b class="hb-dd">D-30</b><span class="hb-q">공고일</span>');
  const unk = kbb.dueOf(itemOf(rec('IG', '사', {})));
  assert.strictEqual(unk.kind, 'unk');
  assert.strictEqual(kbb.dueHtml(unk), '<b class="hb-dd est tx">미상</b>');
  assert.strictEqual(kbb.dueOf(null).kind, 'unk');
});

test('sortGoals: 확정 마감 가까운 순 → 공고 났으나 마감 미확인·지남 → 추정·예정일(부호 있는 D) → 미상, 같으면 이름', function () {
  const mk = function (name, due) { return { name: name, due: due }; };
  const rows = [mk('미상', { kind: 'unk' }), mk('추정10', { kind: 'est', days: 10 }), mk('지남3', { kind: 'over', days: 3 }), mk('공고중', { kind: 'open' }),
    mk('마감30', { kind: 'fixed', days: 30 }), mk('마감5나', { kind: 'fixed', days: 5 }), mk('마감5가', { kind: 'fixed', days: 5 }), mk('마감지남', { kind: 'closed' })];
  assert.deepStrictEqual(kbb.sortGoals(rows).map(function (r) { return r.name; }), ['마감5가', '마감5나', '마감30', '공고중', '마감지남', '지남3', '추정10', '미상']);
  assert.deepStrictEqual(kbb.sortGoals(null), []);
});

test('laneCellHtml: 그림은 aria-hidden, 읽기용 문장, 추정 = est, 마감 30일 안 = hot, 창 밖·자료 없음 글, 2027 창은 오늘 선 없음', function () {
  const w = kbb.laneWindow(TODAY, 2026);
  const fx = kbb.laneCellHtml({ kind: 'fixed', days: 12, from: '2026-11-20', to: '2026-11-29' }, w);
  assert.ok(fx.indexOf('<div class="hb-lane" aria-hidden="true"><span class="cur"></span><span class="now" style="left:4.444%"></span>') === 0);
  assert.ok(fx.indexOf('<span class="w hot" style="left:5.278%;width:2.778%"></span>') > 0);
  assert.ok(fx.indexOf('<span class="sr-only">공고 2026-11-20부터 접수 마감 2026-11-29까지</span>') > 0);
  assert.ok(kbb.laneCellHtml({ kind: 'fixed', days: 40, from: '2026-12-20', to: '2026-12-27' }, w).indexOf('class="w"') > 0);   // 30일 밖은 무채색
  const es = kbb.laneCellHtml({ kind: 'est', days: 200, date: '2027-06-15' }, w);
  assert.ok(es.indexOf('class="w est" style="left:58.333%;width:8.333%"') > 0 && es.indexOf('추정 공고 2027-06') > 0);
  const af = kbb.laneCellHtml({ kind: 'est', days: 800, date: '2028-01-10' }, w);
  assert.ok(af.indexOf('<span class="off">2028-01 추정 · 목표 연도 밖 →</span>') > 0 && af.indexOf('12개월 밖') > 0);
  assert.ok(kbb.laneCellHtml({ kind: 'over', days: 140, est: true, date: '2026-07-01' }, w).indexOf('<span class="unk before">← 추정일 지남</span>') > 0);
  // 공고 예정일(plan)·공고 중 마감 미상(open)은 접수 마감 눈금이 없는 막대(pl·op 클래스, design 11-17 P2-3) — 확정(fixed)·마감 지남(closed)은 눈금 있는 보통 막대
  const pl = kbb.laneCellHtml({ kind: 'plan', days: 30, date: '2026-12-17' }, w);
  assert.ok(/<span class="w pl" style="left:\d/.test(pl) && pl.indexOf('<span class="sr-only">공고 예정 2026-12-17</span>') > 0 && pl.indexOf('class="w hot"') < 0);
  const op = kbb.laneCellHtml({ kind: 'open', days: null, from: '2026-11-10', to: '' }, w);
  assert.ok(op.indexOf('<span class="w op" style="left:') > 0 && op.indexOf('<span class="sr-only">공고 2026-11-10, 접수 마감일 미확인</span>') > 0);
  const cl = kbb.laneCellHtml({ kind: 'closed', days: null, from: '2026-10-20', to: '2026-11-05' }, w);
  assert.ok(cl.indexOf('class="w"') > 0 && cl.indexOf(' pl') < 0 && cl.indexOf(' op') < 0 && cl.indexOf('<span class="sr-only">접수 마감 2026-11-05 지남</span>') > 0);
  assert.ok(fx.indexOf('class="w hot"') > 0 && fx.indexOf(' pl"') < 0 && fx.indexOf(' op"') < 0);
  const un = kbb.laneCellHtml({ kind: 'unk' }, w);
  assert.ok(un.indexOf('<span class="unk">입찰 예정일 자료 없음</span>') > 0 && un.indexOf('<span class="sr-only">입찰 예정일 자료 없음</span>') > 0);
  const y27 = kbb.laneCellHtml({ kind: 'est', days: 400, date: '2027-03-10' }, kbb.laneWindow(TODAY, 2027));
  assert.ok(y27.indexOf('class="now"') < 0 && y27.indexOf('class="cur"') < 0 && y27.indexOf('left:16.667%') > 0);
  const evil = kbb.laneCellHtml({ kind: 'plan', days: 3, date: '<b>2026-11-20' }, w);
  assert.ok(evil.indexOf('<b>') < 0);
});

// ── 현 금고 은행·직접 입력 약정 ──────────────────────────────────────
test('bankInfo·bankCellHtml: 039 줄(1금고·단수 우선, 외 n) → 행안부 줄 → 레코드 은행 칸 → 확인 안 됨', function () {
  const sum = { kb_now: 'OTHER', lines_now: [{ rank_cd: 'SECOND', bank_name: '신한은행', term_to: '2028' }, { rank_cd: 'FIRST', bank_name: '우리은행', term_to: '2026-12-31' }] };
  const b = kbb.bankInfo(sum, null, {});
  assert.deepStrictEqual([b.name, b.rank, b.more, b.kb, b.end, b.unknown], ['우리은행', '1금고', 1, false, '2026-12-31', false]);
  assert.strictEqual(kbb.bankCellHtml(b), '<td class="hb-bank">우리은행<span class="r">1금고</span><span class="r">외 1</span></td>');
  const kb = kbb.bankInfo({ kb_now: 'KB', lines_now: [{ rank_cd: 'SINGLE', bank_name: '국민은행', term_to: '2026-12-31' }] }, null);
  assert.ok(kb.kb && kb.rank === '단수');
  const LO = { rows: { '11|가': [{ bank: '농협은행', rank: 'RANK2', accts: ['기금'], end: '2027-12-31' }, { bank: '국민은행', rank: 'RANK1', accts: ['일반회계'], end: '2026-12-31' }] } };
  const lo = kbb.bankInfo({ kb_now: 'NO_RECORD', lines_now: [] }, rec('I1', '가'), { lofin: LO, today: TODAY });
  assert.deepStrictEqual([lo.name, lo.rank, lo.end], ['국민은행', '1금고', '2026-12-31']);                  // 1금고 줄이 먼저
  assert.strictEqual(kbb.bankInfo(null, { name: '법원', region: '11', type: '법원', bank: '농협은행' }).name, '농협은행');
  const un = kbb.bankInfo(null, rec('I9', '없음'));
  assert.strictEqual(un.unknown, true);
  assert.strictEqual(kbb.bankCellHtml(un), '<td class="hb-bank mut">확인 안 됨</td>');
  assert.ok(kbb.bankCellHtml({ name: '<b>x', rank: '', more: 0, unknown: false }).indexOf('<b>') < 0);
});

test('directEnds: 039 요약의 국민은행 줄 term_to를 기관 키로 — 현황판 협약 종료일의 직접 입력 값(endOpts().direct)', function () {
  const r = rec('I1', '가');
  const sum = { I1: { lines_now: [{ bank_name: '우리은행', term_to: '2030-12-31' }, { bank_name: '국민은행', term_to: '2027-06' }] }, I2: { lines_now: [{ bank_name: '우리은행', term_to: '2030-12-31' }] },
    I3: { lines_now: [{ bank_name: '국민은행', term_to: '엉터리' }] }, I4: { lines_now: [{ bank_name: '국민은행', term_to: '2029' }] } };
  const d = kbb.directEnds(sum, { I1: r, I2: rec('I2', '나'), I3: rec('I3', '다') });
  assert.deepStrictEqual(d, { '11|가': '2027-06-30' });                                                      // 국민은행 줄이 없거나 읽을 수 없거나 기관 자료가 없으면 뺀다
  assert.deepStrictEqual(kbb.directEnds(null, null), {});
  assert.deepStrictEqual(kbb.contractEnd(r, { direct: d, lofin: { rows: { '11|가': [{ bank: '국민은행', accts: ['일반회계'], end: '2026-12-31' }] } }, today: TODAY }), { date: '2027-06-30', src: 'direct' });
});

// ── 줄 모델·지연 판정·요약 띠 ─────────────────────────────────────────
function mkCtx(extra) {
  const recs = { IA: rec('IA', '가', { confirmed: true, contractEnd: p(-3), receiveTo: p(12) }), IB: rec('IB', '나', { contractEnd: p(200) }),
    IC: rec('IC', '다', { confirmed: true, contractEnd: p(30) }), ID: rec('ID', '라', { contractEnd: p(-140) }), IE: rec('IE', '마', {}),
    IF: rec('IF', '바', { confirmed: true, contractEnd: p(-3), receiveTo: p(45) }) };
  return Object.assign({ byInst: recs, sumById: {}, today: TODAY, verified: [], lofin: null, entries: {}, prepOk: true, delayDays: 30, actOf: function () { return 'confirm'; } }, extra || {});
}
function tgt(id, tag, extra) {
  return Object.assign({ institution_id: id, institution_name: '이름' + id, region_code: '11', target_no: 1, rev_no: 2, target_year: 2026, tag_cd: tag, tag_name: kbb.TAG[tag], memo: '', can_cancel: true,
    bank: { kb_now: tag === 'RETAIN' ? 'KB' : 'OTHER', last_kb_year: tag === 'RETAIN' ? 2026 : 2022,
      lines_now: [{ rank_cd: 'SINGLE', bank_name: tag === 'RETAIN' ? '국민은행' : '우리은행', term_to: '2026-12-31' }] } }, extra || {});
}

test('goalRow 지연 판정: 확정 마감이 기준일(30일) 안인데 제안서 작성 전만 지연, 추정일만 있으면 판정 보류, 제안 진행 자료가 없으면 판정 안 함', function () {
  const ctx = mkCtx();
  const A = kbb.goalRow(tgt('IA', 'RETAIN'), ctx);
  assert.strictEqual(A.due.kind, 'fixed'); assert.strictEqual(A.late, true); assert.strictEqual(A.hold, false);
  assert.strictEqual(kbb.goalRow(tgt('IF', 'NEW'), ctx).late, false);                                        // 마감 D-45 — 기준일 밖
  const wr = mkCtx({ entries: { IA: { id: 'IA', stage: 4 } } });                                              // 제안서 작성 단계면 지연 아님
  assert.strictEqual(kbb.goalRow(tgt('IA', 'RETAIN'), wr).late, false);
  const early = mkCtx({ entries: { IA: { id: 'IA', stage: 2 } } });                                           // 사전준비 단계는 아직 작성 전 → 지연
  assert.strictEqual(kbb.goalRow(tgt('IA', 'RETAIN'), early).late, true);
  const C = kbb.goalRow(tgt('IC', 'NEW'), ctx);                                                               // 확정 공고일만(마감일 없음) D-30 → 보류
  assert.deepStrictEqual([C.late, C.hold], [false, true]);
  assert.deepStrictEqual([kbb.goalRow(tgt('IB', 'NEW'), ctx).late, kbb.goalRow(tgt('IB', 'NEW'), ctx).hold], [false, false]);   // 추정 D-200은 멀다
  assert.strictEqual(kbb.goalRow(tgt('ID', 'NEW'), ctx).hold, true);                                          // 예정일 지남 → 보류
  assert.deepStrictEqual([kbb.goalRow(tgt('IE', 'NEW'), ctx).late, kbb.goalRow(tgt('IE', 'NEW'), ctx).hold], [false, false]);   // 날짜 없음
  // 접수 마감이 이미 지난 줄(closed, 결과 확인 대기): 제안서 작성 전이어도 지연도 보류도 아니다 — 판정은 확정 마감이 기준일 안일 때만
  const clctx = mkCtx({ byInst: { IK: rec('IK', '끝난', { confirmed: true, contractEnd: p(-20), receiveTo: p(-5) }) } });
  const K = kbb.goalRow(tgt('IK', 'NEW'), clctx);
  assert.strictEqual(K.due.kind, 'closed');
  assert.deepStrictEqual([K.late, K.hold, K.stage], [false, false, -1]);                                      // 작성 전(진행 기록 없음)
  const K2 = kbb.goalRow(tgt('IK', 'NEW'), Object.assign({}, clctx, { entries: { IK: { id: 'IK', stage: 1 } } }));
  assert.deepStrictEqual([K2.late, K2.hold], [false, false]);                                                 // 사전준비 단계여도 같다
  const off = mkCtx({ prepOk: false });
  const A0 = kbb.goalRow(tgt('IA', 'RETAIN'), off);
  assert.deepStrictEqual([A0.late, A0.hold], [null, null]);
  const d60 = mkCtx({ delayDays: 60 });                                                                       // 서버 delay_days
  assert.strictEqual(kbb.goalRow(tgt('IF', 'NEW'), d60).late, true);
  // 제안 진행 단계는 dash.STAGES 글자, 기록 없으면 act
  const st = kbb.goalRow(tgt('IA', 'RETAIN'), mkCtx({ entries: { IA: { id: 'IA', stage: 2 } } }));
  assert.deepStrictEqual([st.stage, st.stageLabel, st.act], [2, '사전준비', 'open']);
  assert.strictEqual(kbb.goalRow(tgt('IA', 'RETAIN'), ctx).act, 'confirm');
  assert.strictEqual(kbb.goalRow(tgt('IZ', 'NEW'), ctx).rec, null);                                           // 기관 자료가 없어도 줄은 그린다
  assert.strictEqual(kbb.goalRow(tgt('IZ', 'NEW'), ctx).due.kind, 'unk');
  assert.strictEqual(kbb.goalRow(tgt('IZ', 'NEW'), ctx).fkey, 'id:IZ');
});

test('bandModel·bandHtml: 목표 n곳(재유치·신규유치)·접수 마감 30일 안(확정만)·준비 지연·은행 막대(국민은행 먼저, 확인 안 됨)', function () {
  const ctx = mkCtx();
  const rows = kbb.goalRows([tgt('IA', 'RETAIN'), tgt('IB', 'NEW'), tgt('IC', 'NEW'), tgt('ID', 'NEW'), tgt('IE', 'RETAIN', { bank: { kb_now: 'NO_RECORD', lines_now: [] } })], ctx);
  const b = kbb.bandModel(rows, { prepOk: true, delayDays: 30 });
  assert.deepStrictEqual([b.n, b.retain, b.fresh, b.soon, b.delay, b.hold], [5, 2, 3, 1, 1, 2]);              // 마감 30일 안 = A(D-12)뿐, 지연 = A, 보류 = C·D
  assert.deepStrictEqual(b.bars.map(function (x) { return [x.label, x.n]; }), [['국민은행', 1], ['우리은행', 3], ['확인 안 됨', 1]]);
  const h = kbb.bandHtml(b, { year: 2026, loaded: true });
  assert.ok(h.indexOf('<span class="l">2026 목표 기관</span><span class="v">5<span>곳</span></span>') > 0);
  assert.ok(h.indexOf('재유치 도전 <b>2</b> · 신규유치 도전 <b>3</b>') > 0);
  assert.ok(h.indexOf('<span class="v hot">1<span>곳</span></span><span class="s">공고로 확정된 마감일만 셉니다') > 0);
  assert.ok(h.indexOf('마감 30일 안인데 제안서 작성 전<br>판정 보류 <b>2</b>곳 — 마감일이 확정되지 않은 곳') > 0);      // 보류 = 추정일만이 아니라 공고 중·확정 공고일·예정일 지남까지(qa P3-6)
  assert.ok(h.indexOf('추정일만 있는') < 0);
  assert.ok(h.indexOf('<dt>국민</dt><dd class="tr" aria-hidden="true"><span class="bar k" style="width:33%"></span></dd><dd class="ct"><b>1</b><span class="sr-only">곳</span></dd>') > 0);   // 빈 막대 칸은 읽지 않고 숫자 뒤에 '곳'
  assert.ok(h.indexOf('<dt>확인 안 됨</dt>') > 0);
  assert.ok(h.indexOf('<dl class="hb-bk">') > 0 && h.indexOf('hb-bk two') < 0);                                 // 막대 3줄 이하는 1단
  // 지연이 없으면 '없음', 제안 진행 자료가 없으면 판정하지 않는다, 받기 전에는 '—'
  const none = kbb.bandHtml(kbb.bandModel(kbb.goalRows([tgt('IB', 'NEW')], ctx), { prepOk: true }), { year: 2026, loaded: true });
  assert.ok(none.indexOf('<span class="v">없음</span>') > 0 && none.indexOf('판정 보류') < 0);
  const noPrep = kbb.bandHtml(kbb.bandModel(kbb.goalRows([tgt('IA', 'RETAIN')], mkCtx({ prepOk: false })), { prepOk: false }), { year: 2026, loaded: true });
  assert.ok(noPrep.indexOf('제안 진행 자료가 없어 판정하지 않습니다') > 0 && noPrep.indexOf('<span class="v">—</span>') > 0);
  const wait = kbb.bandHtml(kbb.bandModel([], {}), { year: 2026, loaded: false });
  assert.ok(wait.indexOf('<span class="v">—</span>') > 0 && wait.indexOf('<b>0</b>') < 0);
  assert.strictEqual(kbb.bandHtml(b, { year: 2026, loaded: true }).split('class="hb-k"').length, 5);          // 네 칸
  // 은행이 4곳 넘으면 3곳 + '그 밖'
  const many = ['A', 'B', 'C', 'D', 'E'].map(function (x) { return { bank: { name: x + '은행', unknown: false, kb: false } }; });
  assert.deepStrictEqual(kbb.bankBars(many.concat([{ bank: { name: 'A은행', unknown: false } }])).map(function (x) { return x.label; }), ['A은행', 'B은행', 'C은행', '그 밖']);
  // 막대가 4줄 이상이면 2단 격자 클래스(국민 + 우리 + 그 밖 + 확인 안 됨)
  const four = kbb.bandHtml({ n: 4, retain: 1, fresh: 3, soon: 0, delay: 0, hold: 0, delayDays: 30, bars: [{ label: '국민은행', n: 1, kb: true }, { label: '우리은행', n: 1 }, { label: '그 밖', n: 1 }, { label: '확인 안 됨', n: 1, unknown: true }] }, { year: 2026, loaded: true });
  assert.ok(four.indexOf('<dl class="hb-bk two">') > 0);
});

test('bandModel 판정 보류: 공고 중(마감 미상)·확정 공고일·예정일 지남은 보류로 세고 띠 문구가 그와 맞다 / 추정이 멀면 보류 아님', function () {
  const ctx = mkCtx({ byInst: { IO: rec('IO', '열린', { confirmed: true, contractEnd: p(-3) }), IP: rec('IP', '예정', { confirmed: true, contractEnd: p(20) }), IQ: rec('IQ', '먼', { contractEnd: p(300) }) } });
  const rows = kbb.goalRows([tgt('IO', 'NEW'), tgt('IP', 'NEW'), tgt('IQ', 'NEW')], ctx);
  assert.deepStrictEqual(rows.map(function (r) { return r.due.kind; }), ['open', 'plan', 'est']);
  assert.deepStrictEqual(rows.map(function (r) { return r.hold; }), [true, true, false]);
  const b = kbb.bandModel(rows, { prepOk: true, delayDays: 30 });
  assert.deepStrictEqual([b.delay, b.hold], [0, 2]);
  const h = kbb.bandHtml(b, { year: 2026, loaded: true });
  assert.ok(h.indexOf('<span class="v">없음</span>') > 0 && h.indexOf('판정 보류 <b>2</b>곳 — 마감일이 확정되지 않은 곳') > 0);
});

test('bandHtml 제안 진행 자료 문구: 권한 없음(403)·로그인(401)·오류를 가르고, 목표 0곳이면 \'넣으면 셉니다\'(design 11-17 6-C)', function () {
  const ctx = mkCtx({ prepOk: false });
  const bm = kbb.bandModel(kbb.goalRows([tgt('IA', 'RETAIN')], ctx), { prepOk: false });
  const h = function (v) { return kbb.bandHtml(bm, Object.assign({ year: 2026, loaded: true }, v)); };
  assert.ok(h({ prep: 'denied', prepCode: 403 }).indexOf('이 계정은 제안 진행을 볼 수 없어 판정하지 않습니다') > 0);
  assert.ok(h({ prep: 'denied', prepCode: 401 }).indexOf('로그인이 필요해 판정하지 않습니다') > 0);
  assert.ok(h({ prep: 'error', prepCode: 500 }).indexOf('제안 진행 자료를 불러오지 못해 판정하지 않습니다') > 0);
  assert.ok(h({ prep: 'offline' }).indexOf('제안 진행 자료가 없어 판정하지 않습니다') > 0 && h({}).indexOf('제안 진행 자료가 없어 판정하지 않습니다') > 0);
  assert.ok(h({ prep: 'denied', prepCode: 403 }).indexOf('<span class="v">—</span><span class="s">이 계정은') > 0);
  // 목표 0곳: 준비 지연·은행 칸 모두 '—' + 채우는 방법(좋은 소식처럼 '없음'으로 읽히지 않게)
  const zero = kbb.bandHtml(kbb.bandModel([], { prepOk: true }), { year: 2026, loaded: true, prep: 'ok' });
  assert.ok(zero.indexOf('<span class="l">준비 지연</span><span class="v">—</span><span class="s">목표 기관을 넣으면 셉니다</span>') > 0);
  assert.ok(zero.indexOf('<span class="l">목표 기관의 현 금고 은행</span><span class="v">—</span><span class="s">목표 기관을 넣으면 은행별로 셉니다</span>') > 0);
  assert.ok(zero.indexOf('없음') < 0);
});

test('emptyCandidates: 협약 1년 안 종료 중 \'국민은행 확정\'·이미 목표인 곳을 뺀다(협약 예정은 soon에 들지 않음)', function () {
  const V = [{ key: '11|나', name: '나', slot: 1, next: '2026 회차 국민은행 수성(기사 2026-11-04)' }, { key: '11|가', name: '가', slot: 1 }, { key: '11|라', name: '라', slot: 1 }];
  const it = function (id, name) { return { key: '11|' + name, name: name, region: '11', endDate: '2026-12-31', rec: rec(id, name) }; };
  const g = { soon: [it('I1', '가'), it('I2', '나'), it('I3', '다'), it('I4', '라'), { key: 'x', name: '아이디없음', rec: { name: '아이디없음' } }], next: [it('I9', '예정')] };
  const c = kbb.emptyCandidates(g, { I3: true }, V);
  assert.deepStrictEqual(c.map(function (x) { return x.name; }), ['가', '라']);                                  // 나 = 국민은행 확정, 다 = 이미 목표, 아이디 없는 곳 = 넣을 수 없음
  assert.strictEqual(c[0].endDate, '2026-12-31');
  assert.deepStrictEqual(kbb.emptyCandidates(null, {}, V), []);
});

// ── 행·표 마크업 ───────────────────────────────────────────────────
function rowHtml(r, o) { return kbb.goalRowHtml(r, Object.assign({ win: kbb.laneWindow(TODAY, 2026), canEdit: true }, o || {})); }
test('goalRowHtml: 지연 행(late·지연 칩·마감 D-n·준비 단계 막대) 마크업, 이름 버튼·구분 칩(메뉴 버튼)', function () {
  const ctx = mkCtx({ entries: { IA: { id: 'IA', stage: 2 } } });
  const r = kbb.goalRow(tgt('IA', 'RETAIN', { institution_name: '성동구청' }), ctx);
  const h = rowHtml(r);
  assert.ok(h.indexOf('<tr class="late"><th scope="row"><button type="button" class="hb-nm" data-key="11|가" data-inst="IA" aria-haspopup="dialog"><span class="rg">11</span>가</button></th>') === 0);
  assert.ok(h.indexOf('<button type="button" class="hb-tag" data-act="tag" data-inst="IA" data-key="11|가" aria-haspopup="menu" aria-expanded="false"><span class="sr-only">구분: </span>재유치 도전<svg') > 0);
  assert.ok(h.indexOf('<b class="hb-dd hot">D-12</b><span class="hb-q">마감</span>') > 0);
  assert.ok(h.indexOf('<td class="hb-bank">국민은행<span class="r">단수</span></td>') > 0);
  assert.ok(h.indexOf('<span class="hb-stg"><span class="lb" title="사전준비">사전준비</span><span class="hb-pg" aria-hidden="true"><i style="width:60%"></i></span><span class="n">3/5</span><span class="hb-late">지연</span></span>') > 0);
  assert.ok(h.indexOf('<td class="mut"><span aria-hidden="true">—</span><span class="sr-only">설명회 기록 없음</span></td>') > 0);   // 설명회 열은 1단계에 '—'
  assert.ok(h.indexOf('<td class="ln"><div class="hb-lane" aria-hidden="true">') > 0 && h.indexOf('class="w hot"') > 0);
  assert.strictEqual((h.match(/<td/g) || []).length, 6);                                                      // th 1 + td 6 = 7열
  // 지연이 아니면 class 없음, 단계 기록이 없고 [제안 확정]이 가능하면 단계 칸에 [제안 확정]
  const ok = rowHtml(kbb.goalRow(tgt('IF', 'NEW'), mkCtx()));
  assert.ok(ok.indexOf('<tr><th scope="row">') === 0 && ok.indexOf('hb-late') < 0);
  assert.ok(ok.indexOf('<span class="hb-stg"><button type="button" class="hb-confirm" data-key="11|바" data-act="confirm" aria-haspopup="dialog" aria-label="바 제안 확정">제안 확정</button></span>') > 0);
  // 공고 전은 '공고 전', 진행 자료 없음은 —
  assert.ok(rowHtml(kbb.goalRow(tgt('IB', 'NEW'), mkCtx({ actOf: function () { return 'later'; } }))).indexOf('<span class="mut">공고 전</span>') > 0);
  const un = rowHtml(kbb.goalRow(tgt('IB', 'NEW'), mkCtx({ actOf: function () { return 'unavailable'; } })));
  assert.ok(un.indexOf('제안 진행 정보 없음') > 0);
});

test('goalRowHtml: 추정·미상·예전 국민은행 표시·목표 밖 줄', function () {
  const ctx = mkCtx();
  const est = rowHtml(kbb.goalRow(tgt('IB', 'NEW'), ctx));
  assert.ok(est.indexOf('<b class="hb-dd est">D-200</b><span class="hb-q">추정</span>') > 0 && est.indexOf('class="w est"') > 0);
  assert.ok(est.indexOf('<span class="hb-q hb-prev" title="예전에 국민은행 금고였던 기관(마지막 2022년)">예전 KB</span>') > 0);   // 신규유치 칩 옆 작은 표시(사용자 11-17)
  assert.ok(est.indexOf('예전 국민은행 금고, 마지막 2022년') > 0);
  assert.ok(rowHtml(kbb.goalRow(tgt('IA', 'RETAIN'), ctx)).indexOf('hb-prev') < 0);                           // 재유치 도전은 표시 없음
  assert.ok(rowHtml(kbb.goalRow(tgt('IB', 'NEW', { bank: { kb_now: 'OTHER', lines_now: [] } }), ctx)).indexOf('hb-prev') < 0);   // 국민은행이었던 기록이 없으면 표시 없음
  assert.ok(rowHtml(kbb.goalRow(tgt('IB', 'NEW', { bank: { kb_now: 'KB', last_kb_year: 2026, lines_now: [] } }), ctx)).indexOf('hb-prev') < 0);   // 지금 국민은행이면 표시 없음
  const yr = TODAY.getFullYear();
  const prevOf = function (y) { return rowHtml(kbb.goalRow(tgt('IB', 'NEW', { bank: { kb_now: 'OTHER', last_kb_year: y, lines_now: [] } }), ctx)); };
  assert.ok(prevOf(yr + 1).indexOf('hb-prev') < 0);   // 미래에 시작하는 국민은행 약정은 '예전'이 아니다(qa 11-19 P3)
  assert.ok(prevOf(yr).indexOf('hb-prev') < 0);       // 올해는 '예전' 아님(올해보다 앞선 해만)
  assert.ok(prevOf(yr - 1).indexOf('hb-prev') > 0);   // 지난해는 칩이 붙는다
  const unk = rowHtml(kbb.goalRow(tgt('IE', 'NEW'), ctx));
  assert.ok(unk.indexOf('<b class="hb-dd est tx">미상</b>') > 0 && unk.indexOf('<span class="unk">입찰 예정일 자료 없음</span>') > 0 && unk.indexOf('class="w') < 0);
  // 목표 밖(제안을 준비 중인 기관): 구분 칸에 [목표에 넣기], 보기 전용은 '목표 아님'
  const out = kbb.goalRow({ institution_id: 'IA', institution_name: '가' }, ctx, true);
  const oh = rowHtml(out);
  assert.ok(oh.indexOf('<td><button type="button" class="hb-tag add" data-act="add" data-inst="IA" data-key="11|가" aria-label="가 목표에 넣기">목표에 넣기</button></td>') > 0);
  assert.ok(rowHtml(out, { canEdit: false }).indexOf('<td><span class="hb-tag ro">목표 아님</span></td>') > 0);
  const o2 = kbb.outRows([{ institutionId: 'IA', name: '가' }, { institutionId: 'IB', name: '나' }, { institutionId: '', name: '무' }], { IA: true }, ctx);
  assert.deepStrictEqual(o2.map(function (x) { return [x.id, x.out]; }), [['IB', true]]);                      // 목표에 있는 기관·기관 번호 없는 건은 뺀다
});

test('보기 전용(디자이너): 구분은 ▾ 없는 span.hb-tag.ro, 이름 버튼은 그대로(상세 팝업), 메모·사번 자기신고는 읽기용으로만', function () {
  const r = kbb.goalRow(tgt('IA', 'RETAIN', { memo: '2금고 노림', first_editor_name: '김영업', editor_name: '박영업', emp_verified: false, saved_at: '2026-11-17T10:20:30' }), mkCtx());
  const ro = rowHtml(r, { canEdit: false });
  assert.ok(ro.indexOf('<span class="hb-tag ro"><span class="sr-only">구분: </span>재유치 도전</span>') > 0);
  assert.ok(ro.indexOf('hb-tag" data-act') < 0 && ro.indexOf('aria-haspopup="menu"') < 0 && ro.indexOf('<svg') < 0);
  assert.ok(ro.indexOf('class="hb-nm"') > 0 && ro.indexOf('aria-haspopup="dialog"') > 0);
  // 사번을 확인하지 못한 기록은 '확인됨'으로 보이지 않는다
  assert.ok(ro.indexOf('title="메모: 2금고 노림 · 넣은 사람 김영업 · 마지막 고침 박영업(사번 자기신고) 2026-11-17 10:20"') > 0);
  assert.ok(ro.indexOf('확인됨') < 0);
  const ver = rowHtml(kbb.goalRow(tgt('IA', 'RETAIN', { editor_name: '박영업', emp_verified: true, saved_at: '2026-11-17T10:20:30' }), mkCtx()));
  assert.ok(ver.indexOf('마지막 고침 박영업 2026-11-17 10:20') > 0 && ver.indexOf('자기신고') < 0);
  const t = kbb.goalTableHtml({ st: 'ok', year: 2026, win: kbb.laneWindow(TODAY, 2026), rows: [], out: [], canEdit: false, cands: [{ id: 'I1', key: '11|가', name: '가', region: '11', endDate: '2026-12-31' }] });
  assert.ok(t.indexOf('<h3 class="hb-eh">2026 목표 기관이 아직 없습니다</h3><p>협약이 1년 안에 끝나는 기관은 아래 &#39;협약 중인 기관&#39;에서 봅니다.</p>') > 0 && t.indexOf('<button') < 0);   // 제목 줄이 '영업부서가 넣고 뺍니다'를 말하므로 표는 다음 행동(design P3-2)
  const js = src('js/kbboard.js');
  assert.ok(js.indexOf('<button type="button" id="hb-add" hidden>') > 0 && js.indexOf("add.hidden = !can") > 0);   // [목표 기관 추가]는 hidden(disabled 아님)
  assert.ok(js.indexOf('esc(kbb.GOAL_MSG.roTop)') > 0 && kbb.GOAL_MSG.roTop === '보기 전용 — 목표 기관은 영업부서가 넣고 뺍니다.');
  assert.ok(js.indexOf("$('hb-ro')") > 0 && js.indexOf('ro.hidden = !(ok && !can)') > 0);
});

test('서버 글(이름·메모·편집자)은 전부 이스케이프(S8) — 표·메뉴·대화창·결과 목록', function () {
  const X = '<img src=x onerror=alert(1)>';
  const r = kbb.goalRow(tgt('IA', 'RETAIN', { memo: X, first_editor_name: X, editor_name: X, institution_name: X }), mkCtx({ byInst: {} }));
  const h = rowHtml(r);
  assert.ok(h.indexOf('<img') < 0 && h.indexOf('&lt;img') > 0);
  assert.ok(kbb.menuHtml(Object.assign({}, r, { tagCd: '<b>' }), { tags: [{ code: '<b>', name: X }], def: {}, canCancel: true }).indexOf('<img') < 0);
  assert.ok(kbb.cancelDialogHtml(r, { reasons: [{ code: 'ETC', name: X }] }).indexOf('<img') < 0);
  assert.ok(kbb.addDialogHtml({ q: X, year: 2026, tag: '', note: X, pickText: X }, { years: [2026], tags: [{ code: 'RETAIN', name: X }] }).indexOf('<img') < 0);
  const res = kbb.resultsHtml([{ name: X, sub: X, taken: true }], 0, 2026);
  assert.ok(res.indexOf('<img') < 0 && res.indexOf('aria-disabled="true"') > 0 && res.indexOf('이미 2026 목표') > 0);
  assert.ok(kbb.emptyHtml({ year: 2026, canEdit: true, cands: [{ id: 'I1', key: X, name: X, region: '11', endDate: X }] }).indexOf('<img') < 0);
  assert.ok(kbb.laneCellHtml({ kind: 'fixed', days: 3, from: X, to: X }, kbb.laneWindow(TODAY, 2026)).indexOf('<img') < 0);
});

test('goalTableHtml: 표 구조(caption·colgroup·머리 7열·월 머리), 상태별 문구(불러오는 중·서버 없음·권한·오류·빈 상태·목표 밖 묶음)', function () {
  const win = kbb.laneWindow(TODAY, 2026), base = { year: 2026, win: win, rows: [], out: [], canEdit: true, cands: [] };
  const ctx = mkCtx();
  const rows = kbb.sortGoals(kbb.goalRows([tgt('IA', 'RETAIN'), tgt('IB', 'NEW')], ctx));
  const out = kbb.outRows([{ institutionId: 'IF', name: '바' }], {}, ctx);
  const ok = kbb.goalTableHtml(Object.assign({}, base, { st: 'ok', rows: rows, out: out }));
  assert.ok(ok.indexOf('<table class="hb-tt"><caption class="sr-only">2026 목표 기관 2곳과 그 밖의 제안서 준비 중인 기관 1곳, 마감 가까운 순</caption><colgroup>') === 0);
  assert.ok(ok.indexOf('<col class="c-nm"><col class="c-tag"><col class="c-due"><col class="c-bank"><col class="c-stg"><col class="c-brf"><col class="ln">') > 0);   // 열 폭은 CSS 클래스(인라인 px 없음)
  assert.ok(ok.indexOf('<col style') < 0);
  assert.ok(ok.indexOf('hb-pretry') < 0);                                                                       // 제안 진행 자료가 정상이면 오류 안내 없음
  ['기관', '구분', '마감까지', '현 금고 은행', '준비 단계', '설명회'].forEach(function (c) { assert.ok(ok.indexOf('<th scope="col">' + c + '</th>') > 0, c); });
  assert.ok(ok.indexOf('<span class="yr">2026.11 ~ 2027.10</span><span class="mh" aria-hidden="true"><span>11</span><span>12</span><span>1</span>') > 0);
  assert.strictEqual((ok.match(/<span>\d+<\/span>/g) || []).length, 12);
  assert.ok(ok.indexOf('<tr class="grp"><th scope="rowgroup" colspan="7">그 밖의 제안서 준비 중인 기관 <b>1</b>곳</th></tr>') > 0);
  assert.ok(ok.indexOf('data-act="add"') > ok.indexOf('rowgroup'));                                            // 목표에 넣기는 묶음 안
  assert.ok(ok.indexOf('hb-nm') < ok.indexOf('rowgroup'));
  const M = kbb.GOAL_MSG;
  const tb = function (st, code) { return kbb.goalTableHtml(Object.assign({}, base, { st: st, code: code })); };
  assert.ok(tb('loading').indexOf('aria-busy="true"><p class="db-state">목표 기관을 불러오는 중입니다…</p>') > 0);
  assert.ok(tb('offline').indexOf('목표 기관은 서버에 저장됩니다. 서버에 연결되면 보입니다.') > 0);
  assert.ok(tb('denied', 403).indexOf('목표 기관을 볼 권한이 없는 계정입니다. 관리자에게 권한을 요청하세요.') > 0);
  assert.ok(tb('denied', 401).indexOf('로그인이 필요합니다. 다시 로그인하세요.') > 0);
  assert.ok(tb('error', 500).indexOf('목표 기관을 불러오지 못했습니다(오류 500). <button type="button" id="hb-gretry">다시 시도</button>') > 0);
  assert.ok(tb('error', 0).indexOf('서버에 연결되지 않음') > 0);
  // 제안 진행 자료 오류(qa 11-17 P2-1): 목표 밖 묶음 자리에 오류 안내 + [다시 시도](#hb-pretry). 목표 밖 기관이 있으면 안내 없이 묶음, 권한 없음(403)은 표에 안내를 두지 않는다(띠가 이유를 말한다)
  const pe = kbb.goalTableHtml(Object.assign({}, base, { st: 'ok', rows: rows, prep: 'error', prepCode: 500 }));
  assert.ok(pe.indexOf('<tr class="grp"><th scope="rowgroup" colspan="7">그 밖의 제안서 준비 중인 기관</th></tr><tr class="emp"><td colspan="7"><p class="db-state">제안 진행 자료를 불러오지 못했습니다(오류 500).') > 0);
  assert.ok(pe.indexOf('<button type="button" id="hb-pretry">다시 시도</button>') > 0 && pe.indexOf('id="hb-gretry"') < 0);
  assert.ok(kbb.goalTableHtml(Object.assign({}, base, { st: 'ok', rows: rows, prep: 'error', prepCode: 0 })).indexOf('제안 진행 자료를 불러오지 못했습니다(서버에 연결되지 않음).') > 0);
  assert.ok(kbb.goalTableHtml(Object.assign({}, base, { st: 'ok', rows: rows, out: out, prep: 'error' })).indexOf('hb-pretry') < 0);
  assert.ok(kbb.goalTableHtml(Object.assign({}, base, { st: 'ok', rows: rows, prep: 'denied', prepCode: 403 })).indexOf('hb-pretry') < 0);
  assert.ok(kbb.goalTableHtml(Object.assign({}, base, { st: 'error', code: 500, prep: 'error' })).indexOf('hb-pretry') < 0);   // 목표 기관 자체가 오류면 그 안내([다시 시도] hb-gretry)만
  assert.strictEqual(M.offline, '목표 기관은 서버에 저장됩니다. 서버에 연결되면 보입니다.');
  // 빈 상태: 후보가 있으면 목록 + [목표에 넣기](영업부서), 후보가 없으면 안내, 읽기 전용은 안내만
  const cands = [{ id: 'I1', key: '11|가', name: '가', region: '11', endDate: '2026-12-31' }, { id: 'I2', key: '11|나', name: '나', region: '11', endDate: '' }];
  const em = kbb.goalTableHtml(Object.assign({}, base, { st: 'ok', cands: cands }));
  assert.ok(em.indexOf('<h3 class="hb-eh">2026 목표 기관이 아직 없습니다</h3>') > 0);
  assert.ok(em.indexOf('<ul class="hb-cand2"><li><h4>협약 종료 1년 안 <b>2</b>곳</h4><ul class="hb-cand">') > 0 && em.indexOf('입찰 공고가 났거나 날 예정인 기관부터 보여 줍니다.') > 0);   // 묶음 2×2(6-8), 묶음 하나뿐이면 협약 종료 1년 안
  assert.ok(em.indexOf('<button type="button" class="hb-tag add" data-act="cand" data-inst="I1" data-key="11|가" aria-label="가 목표에 넣기">목표에 넣기</button>') > 0);
  assert.ok(em.indexOf('협약 종료 2026-12-31') > 0 && em.indexOf('그 밖의 기관은 위 [목표 기관 추가]에서 찾습니다.') > 0);
  assert.ok(kbb.goalTableHtml(Object.assign({}, base, { st: 'ok' })).indexOf('협약이 1년 안에 끝나는 기관이 없습니다. [목표 기관 추가]에서 기관을 찾아 넣으세요.') > 0);
  assert.ok(kbb.goalTableHtml(Object.assign({}, base, { st: 'ok', year: 2027 })).indexOf('2027 목표 기관이 아직 없습니다') > 0);
  assert.strictEqual(kbb.oursHeadHtml(27, 8, 4), ' <b>27</b>곳 · 협약 종료 1년 안 <b>8</b>곳 · 그중 목표 <b>4</b>곳');
  assert.strictEqual(kbb.oursHeadHtml(27, 8, null), ' <b>27</b>곳 · 협약 종료 1년 안 <b>8</b>곳');
  const ft = kbb.goalFootHtml(13);
  assert.ok(ft.indexOf('공고~접수 마감') > 0 && ft.indexOf('추정 공고 달') > 0 && ft.indexOf('오늘') > 0);
  assert.ok(ft.indexOf('<span>전국 공고 진행 중 <b>13</b>곳</span><button type="button" id="hb-to-notice">입찰 공고 현황에서 보기</button>') > 0);
});

test('menuHtml: 자동 제안 설명 줄 + 구분 라디오(현재 값 체크) + 구분선 + 목표에서 빼기(영업부서만)', function () {
  const r = { tagCd: 'RETAIN' };
  const tags = [{ code: 'RETAIN', name: '재유치 도전' }, { code: 'NEW', name: '신규유치 도전' }];
  const h = kbb.menuHtml(r, { tags: tags, def: { tag: 'RETAIN', why: 'kb' }, canCancel: true });
  assert.ok(h.indexOf('<div class="hb-menu" role="menu" aria-label="구분 바꾸기"><div class="mh">자동 제안: 재유치 도전 — 지금 국민은행 협약 중</div>') === 0);
  assert.ok(h.indexOf('role="menuitemradio" aria-checked="true" data-tag="RETAIN" tabindex="-1"><span>재유치 도전</span><svg class="ck"') > 0);
  assert.ok(h.indexOf('role="menuitemradio" aria-checked="false" data-tag="NEW"') > 0);
  assert.ok(h.indexOf('<div class="ms" role="separator"></div><button type="button" role="menuitem" data-cmd="cancel" tabindex="-1">목표에서 빼기…</button>') > 0);
  const nc = kbb.menuHtml(r, { tags: tags, def: {}, canCancel: false });
  assert.ok(nc.indexOf('class="mh"') < 0 && nc.indexOf('목표에서 빼기') < 0 && nc.indexOf('role="separator"') < 0);
});

// ── 대화창 ───────────────────────────────────────────────────────────
test('searchInst: 2자부터·최대 8곳·이름이 검색어로 시작하는 곳이 먼저·이미 목표는 taken·한 줄 설명(은행·협약 종료)', function () {
  const mk = function (i, name) { return rec('I' + i, name, { region: '11' }); };
  const list = [mk(1, '광진구청'), mk(2, '서광진시청'), mk(3, '광진복지원'), rec('', '광진없는번호'), mk(5, '노원구청')];
  assert.deepStrictEqual(kbb.searchInst(list, '광', {}), []);
  assert.deepStrictEqual(kbb.searchInst(list, ' 광 ', {}), []);
  const sum = { I1: { kb_now: 'KB', lines_now: [{ rank_cd: 'SINGLE', bank_name: '국민은행', term_to: '2026-12-31' }] } };
  const r = kbb.searchInst(list, '광진', { taken: { I3: true }, sumById: sum, today: TODAY });
  assert.deepStrictEqual(r.map(function (x) { return x.name; }), ['광진구청', '광진복지원', '서광진시청']);   // 기관 번호 없는 곳은 뺀다
  assert.deepStrictEqual(r.map(function (x) { return x.taken; }), [false, true, false]);
  assert.strictEqual(r[0].sub, '11 · 국민은행 단수 · 협약 종료 2026-12-31');                                  // 결과 목록은 첫 줄이 이름이라 둘째 줄에 반복하지 않는다(design P3-3)
  assert.strictEqual(r[1].sub, '11 · 현 금고 은행 확인 안 됨');
  assert.strictEqual(kbb.instSub(list[0], sum.I1, { today: TODAY }), '11 광진구청 · 국민은행 단수 · 협약 종료 2026-12-31');   // '선택한 기관:' 줄은 이름을 넣는다
  assert.strictEqual(kbb.searchInst(Array.from({ length: 12 }, function (_, i) { return mk(i + 10, '가나다' + i); }), '가나', { limit: 8 }).length, 8);
  const html = kbb.resultsHtml(r, 0, 2026);
  assert.ok(html.indexOf('<li role="option" id="hb-a-o0" data-i="0" aria-selected="true">') === 0);
  assert.ok(html.indexOf('<li role="option" id="hb-a-o1" data-i="1" aria-selected="false" aria-disabled="true">') > 0 && html.indexOf('이미 2026 목표') > 0);
});

test('addState·cancelState: 기관 → 구분 → 메모 100자 순으로 막고 이유를 말한다 / 빼기 사유 필수, 기타는 글 필수(50자)', function () {
  assert.deepStrictEqual(kbb.addState({}), { canGo: false, why: '기관을 고르세요.' });
  assert.deepStrictEqual(kbb.addState({ inst: { id: 'I1' }, year: 2026, tag: '' }), { canGo: false, why: '구분을 고르세요.' });
  assert.deepStrictEqual(kbb.addState({ inst: { id: 'I1' }, tag: 'NEW', year: 0 }), { canGo: false, why: '목표 연도를 고르세요.' });
  assert.deepStrictEqual(kbb.addState({ inst: { id: 'I1' }, tag: 'NEW', year: 2026, memo: '가'.repeat(101) }), { canGo: false, why: '메모는 100자 이내로 적으세요.' });
  assert.deepStrictEqual(kbb.addState({ inst: { id: 'I1' }, tag: 'NEW', year: 2026, memo: '가'.repeat(100) }), { canGo: true, why: '' });
  assert.deepStrictEqual(kbb.addState({ inst: { id: 'I1' }, tag: 'NEW', year: 2026, busy: true }), { canGo: false, why: '' });                // 저장 중 두 번 누름 방지
  assert.deepStrictEqual(kbb.cancelState({}), { canGo: false, why: '사유를 고르세요.' });
  assert.deepStrictEqual(kbb.cancelState({ reason: 'DUP' }), { canGo: true, why: '' });
  assert.deepStrictEqual(kbb.cancelState({ reason: 'ETC', etc: '  ' }), { canGo: false, why: '기타 사유를 적으세요.' });
  assert.deepStrictEqual(kbb.cancelState({ reason: 'ETC', etc: '입찰 포기' }), { canGo: true, why: '' });
  assert.deepStrictEqual(kbb.cancelState({ reason: 'ETC', etc: '가'.repeat(51) }), { canGo: false, why: '기타 사유는 50자 이내로 적으세요.' });
  assert.deepStrictEqual(kbb.cancelState({ reason: 'DUP', busy: true }), { canGo: false, why: '' });
});

test('대화창 마크업: 추가 = 기관 combobox·목표 연도·구분 라디오·메모 0/100·[취소][목표에 넣기](처음엔 disabled), 빼기 = 사유 라디오(서버 코드표)·기타 글칸(숨김)·pp-danger', function () {
  const add = kbb.addDialogHtml({ q: '', year: 2027, tag: 'NEW', note: '근거', pickText: '' }, { years: [2026, 2027], tags: [{ code: 'RETAIN', name: '재유치 도전' }, { code: 'NEW', name: '신규유치 도전' }] });
  assert.ok(add.indexOf('<div class="modal-box tm-modal-box hb-dlg" role="dialog" aria-modal="true" aria-labelledby="hb-d-t"><h3 id="hb-d-t">목표 기관 추가</h3>') === 0);
  assert.ok(add.indexOf('<div class="tm-reason-row"><label for="hb-a-q">기관 (필수)</label></div><input type="text" id="hb-a-q" role="combobox" aria-expanded="false" aria-controls="hb-a-list" aria-autocomplete="list"') > 0);
  assert.ok(add.indexOf('<option value="2027" selected>2027년</option>') > 0 && add.indexOf('<option value="2026">2026년</option>') > 0);
  assert.ok(add.indexOf('<legend>구분 (필수)</legend>') > 0 && add.indexOf('<input type="radio" name="hb-a-tag" value="NEW" checked>') > 0);
  assert.ok(add.indexOf('메모 (선택)') > 0 && add.indexOf('<span id="hb-a-cnt" class="tm-count">0/100</span>') > 0 && add.indexOf('개인정보를 적지 마세요.') > 0);
  assert.ok(add.indexOf('<button type="button" id="hb-a-cancel">취소</button><button type="button" id="hb-a-go" class="pp-next-btn" disabled aria-describedby="hb-a-why">목표에 넣기</button>') > 0);
  assert.ok(add.indexOf('id="hb-a-err" class="ap-err" role="alert"') > 0);
  const rs = [{ code: 'WRONG', name: '잘못 넣음' }, { code: 'ETC', name: '기타' }];
  const c = kbb.cancelDialogHtml({ regionName: '서울', name: '광진구청' }, { reasons: rs });
  assert.ok(c.indexOf('<h3 id="hb-d-t">목표에서 빼기 — 서울 광진구청</h3>') > 0);
  assert.ok(c.indexOf('뺀 기록(누가·언제·사유)은 남고, 같은 해에 다시 넣을 수 있습니다.') > 0);
  assert.ok(c.indexOf('<input type="radio" name="hb-c-rs" value="WRONG"> 잘못 넣음') > 0 && c.indexOf('value="ETC"> 기타') > 0);
  assert.ok(c.indexOf('id="hb-c-etcrow" hidden') > 0 && c.indexOf('maxlength="50"') > 0);
  assert.ok(c.indexOf('<button type="button" id="hb-c-go" class="pp-danger" disabled') > 0 && c.indexOf('>목표에서 빼기</button>') > 0);
  assert.strictEqual(kbb.cancelDialogHtml({ regionName: '서울', name: 'x' }, {}).indexOf('type="radio"'), -1);     // 코드표 없으면 사유를 지어내지 않는다
});

// ── 서버 요청·응답 ─────────────────────────────────────────────────
function fakeFetch(status, body, calls) {
  return function (url, init) { calls.push({ url: url, init: init }); return Promise.resolve({ status: status, json: function () { return Promise.resolve(body); } }); };
}
test('saveTarget·cancelTarget: 주소·POST·머리글(X-Screen-Id bid_board, X-Button-Id)·본문, 서버 응답 못 받으면 status 0', async function () {
  const calls = [], keep = kbb.env.fetch;
  try {
    kbb.env.fetch = fakeFetch(201, { saved: true }, calls);
    const x = await kbb.saveTarget('jong no', { target_year: 2026, tag_cd: 'NEW', memo: null });
    assert.strictEqual(x.status, 201);
    assert.strictEqual(calls[0].url, '/institutions/jong%20no/bid-targets');
    assert.strictEqual(calls[0].init.method, 'POST');
    assert.deepStrictEqual(calls[0].init.headers, { 'Content-Type': 'application/json', 'X-Screen-Id': 'bid_board', 'X-Button-Id': 'add_bid_target' });
    assert.deepStrictEqual(JSON.parse(calls[0].init.body), { target_year: 2026, tag_cd: 'NEW', memo: null });
    await kbb.saveTarget('I1', { target_no: 1, base_rev_no: 2 }, kbb.BTN.tag);
    assert.strictEqual(calls[1].init.headers['X-Button-Id'], 'change_target_tag');
    await kbb.cancelTarget('I1', 3, { base_rev_no: 4, cancel_reason_cd: 'DUP', cancel_reason_etc: null });
    assert.strictEqual(calls[2].url, '/institutions/I1/bid-targets/3/cancel');
    assert.deepStrictEqual([calls[2].init.headers['X-Screen-Id'], calls[2].init.headers['X-Button-Id']], ['bid_board', 'cancel_bid_target']);
    kbb.env.fetch = function () { return Promise.reject(new TypeError('network')); };
    assert.deepStrictEqual(await kbb.saveTarget('I1', {}), { status: 0, body: null });
    kbb.env.fetch = function () { return Promise.resolve({ status: 500, json: function () { return Promise.reject(new Error('not json')); } }); };
    assert.deepStrictEqual(await kbb.cancelTarget('I1', 1, {}), { status: 500, body: null });
  } finally { kbb.env.fetch = keep; }
});

test('버튼 이름은 서버 허용값(TargetUiIds)과 같다', function () {
  assert.deepStrictEqual(kbb.BTN, { add: 'add_bid_target', tag: 'change_target_tag', cancel: 'cancel_bid_target', addWatch: 'add_watch_target', edit: 'edit_bid_target', nextYear: 'goal_next_year', moveGoal: 'move_to_goal', moveWatch: 'move_to_watch' });
  assert.strictEqual(kbb.SCREEN, 'bid_board');
  const f = path.join(ROOT, '..', 'kgi-ggreport-web', 'src', 'main', 'java', 'com', 'kbstar', 'kgi', 'ggreport', 'web', 'support', 'TargetUiIds.java');
  if (!fs.existsSync(f)) return;
  const j = fs.readFileSync(f, 'utf8');
  Object.keys(kbb.BTN).forEach(function (k) { assert.ok(j.indexOf('"' + kbb.BTN[k] + '"') > 0, kbb.BTN[k]); });
  assert.ok(j.indexOf('"bid_board"') > 0);
});

test('outcome: 201 저장 / 200 변경 없음 / 409 DUP_TARGET·STALE·LIMIT·ALREADY_CANCELLED / 400·422 서버 문구 / 401·403 / 연결 실패', function () {
  const r = function (status, detail) { return { status: status, body: detail === undefined ? null : { detail: detail } }; };
  assert.deepStrictEqual(kbb.outcome(r(201), 'add'), { kind: 'saved' });
  assert.deepStrictEqual(kbb.outcome(r(200, undefined), 'edit'), { kind: 'nochange', msg: '바뀐 내용이 없습니다.' });
  assert.deepStrictEqual(kbb.outcome(r(409, { code: 'DUP_TARGET', message: '이 기관은 같은 연도 목표에 이미 들어 있습니다.' }), 'add', { year: 2026 }),
    { kind: 'dup', code: 'DUP_TARGET', msg: '넣지 못했습니다 — 이미 2026 목표에 있는 기관입니다.' });
  assert.deepStrictEqual(kbb.outcome(r(409, { code: 'STALE', message: '다른 사람이 먼저 고쳤습니다.' }), 'edit'),
    { kind: 'stale', code: 'STALE', msg: '다른 사람이 먼저 고쳤습니다. 목록을 다시 불러왔습니다.' });
  assert.strictEqual(kbb.outcome(r(409, { code: 'ALREADY_CANCELLED', message: '이미 목표에서 뺀 기록입니다.' }), 'cancel').kind, 'stale');
  assert.deepStrictEqual(kbb.outcome(r(409, { code: 'LIMIT', message: '한도에 닿았습니다.' }), 'add'), { kind: 'limit', code: 'LIMIT', msg: '한도에 닿았습니다.' });
  assert.strictEqual(kbb.outcome(r(409, { code: 'LIMIT' }), 'add').msg, '이 기관의 목표 기록이 더 늘릴 수 없는 한도에 닿았습니다.');
  assert.deepStrictEqual(kbb.outcome(r(400, '메모는 100자 이내여야 합니다.'), 'add'), { kind: 'field', code: '', msg: '메모는 100자 이내여야 합니다.' });
  assert.deepStrictEqual(kbb.outcome(r(422, { code: 'PII_BLOCKED', message: '개인정보로 보이는 내용이 있습니다.', kinds: [] }), 'add'),
    { kind: 'field', code: 'PII_BLOCKED', msg: '개인정보로 보이는 내용이 있습니다.' });
  assert.strictEqual(kbb.outcome(r(400), 'add').msg, '입력한 내용을 확인하세요.');
  assert.deepStrictEqual(kbb.outcome(r(403, '올해 목표 기관은 영업부서만 넣고 고치고 뺄 수 있습니다.'), 'add'), { kind: 'denied', msg: '올해 목표 기관은 영업부서만 넣고 고치고 뺄 수 있습니다.' });
  assert.strictEqual(kbb.outcome(r(401), 'add').msg, '로그인이 필요합니다. 다시 로그인하세요.');
  assert.deepStrictEqual(kbb.outcome({ status: 0, body: null }, 'add'), { kind: 'error', msg: '서버에 연결되지 않아 저장하지 못했습니다. 다시 시도하세요.' });
  assert.strictEqual(kbb.outcome(null, 'add').kind, 'error');
  assert.strictEqual(kbb.outcome(r(500), 'add').msg, '저장하지 못했습니다(오류 500). 다시 시도하세요.');
  // 서버 영문 문구는 화면에 내보이지 않는다(qa 11-17 P3-12) — 한국어 고정 문구, 한글이 든 서버 문구는 그대로
  assert.deepStrictEqual(kbb.outcome(r(404, 'institution not found'), 'add'), { kind: 'error', msg: '기관을 찾지 못했습니다.' });
  assert.strictEqual(kbb.outcome(r(404), 'cancel').msg, '기관을 찾지 못했습니다.');
  assert.strictEqual(kbb.outcome(r(404, '목표 기록을 찾지 못했습니다.'), 'cancel').msg, '목표 기록을 찾지 못했습니다.');
  assert.strictEqual(kbb.outcome(r(500, 'Internal Server Error'), 'add').msg, '저장하지 못했습니다(오류 500). 다시 시도하세요.');
  assert.strictEqual(kbb.outcome(r(400, 'must not be blank'), 'add').msg, '입력한 내용을 확인하세요.');
  assert.strictEqual(kbb.outcome(r(403, 'Forbidden'), 'add').msg, '올해 목표 기관은 영업부서만 넣고 고치고 뺄 수 있습니다.');
});

test('알림 문구(#hb-flash): 넣었습니다 / 바꿨습니다 / 뺐습니다 — 받침에 맞는 조사', function () {
  assert.strictEqual(kbb.flashAdded('광진구청', 2026), '광진구청을 2026 목표 기관에 넣었습니다.');
  assert.strictEqual(kbb.flashAdded('하남시', 2026), '하남시를 2026 목표 기관에 넣었습니다.');
  assert.strictEqual(kbb.flashTag('광진구청', '신규유치 도전'), '광진구청을 \'신규유치 도전\'으로 바꿨습니다.');
  assert.strictEqual(kbb.flashCancelled('광진구청', 2026), '광진구청을 2026 목표에서 뺐습니다.');
});

// ── 소스 구조(보안·접근성·배선) ──────────────────────────────────────────
test('DOM 코드 구조: 서버 글은 textContent·esc로, 쓰기는 영업부서 버튼만 / 메뉴·대화창 접근성 / 포커스 되돌림', function () {
  const k = src('js/kbboard.js');
  assert.ok(/function flash\(msg, act\) \{[\s\S]*?const f = \$\('hb-flash'\); if \(f\) f\.textContent = msg \|\| '';/.test(k));          // 알림 문장은 textContent(버튼은 고정 마크업 kbb.seeWatchHtml)
  assert.ok(/function say\(msg, isErr, act\)[\s\S]*?renderBanner\(\);[\s\S]*?flash\(isErr \? '' : msg, act\)/.test(k));
  assert.ok(k.indexOf("el.innerHTML = t && st.err ? esc(st.err) : t;") > 0);                                                       // 오류 줄은 esc
  assert.ok(k.indexOf("pk.textContent = m.pickText") > 0 && k.indexOf("nt.textContent = m.note") > 0 && k.indexOf("why.textContent = s.why") > 0);
  assert.ok(k.indexOf('confirm(') < 0 && k.indexOf('alert(') < 0);                                                                 // confirm() 금지(인라인 확인·안내만)
  // 메뉴: ↑↓·Home·End·Esc(칩으로 포커스)·Tab 닫기, 바깥 누름·스크롤에 닫기
  assert.ok(/ev\.key === 'ArrowDown'[\s\S]*?ev\.key === 'ArrowUp'[\s\S]*?ev\.key === 'Escape'[\s\S]*?closeMenu\(true\)[\s\S]*?ev\.key === 'Tab'/.test(k));
  assert.ok(k.indexOf("btn.setAttribute('aria-expanded', 'true')") > 0 && k.indexOf("m.btn.setAttribute('aria-expanded', 'false')") > 0);
  assert.ok(k.indexOf("btn.setAttribute('aria-busy', 'true')") > 0);                                                              // 저장 중 칩 aria-busy
  // 구분 바꾸기는 base_rev_no와 함께 전체 값을 다시 보낸다
  assert.ok(/target_no: r\.targetNo, base_rev_no: r\.revNo, target_year: r\.targetYear, tag_cd: code, memo: r\.memo \|\| null, owner_emp_no: r\.ownerEmpNo \|\| null/.test(k));
  assert.ok(/base_rev_no: r\.revNo, cancel_reason_cd: m\.reason, cancel_reason_etc: m\.reason === 'ETC' \?/.test(k));
  // 열기 전 영업부서(can_edit) 확인: 서버가 줄 때만 추가 버튼·메뉴
  assert.ok(k.indexOf("const ok = gs.st === 'ok' && !!gs.data, can = ok && !!gs.data.can_edit;") > 0);
  assert.ok(/function canEditNow\(\) \{ return gs\.st === 'ok' && !!gs\.data && !!gs\.data\.can_edit; \}/.test(k));
  assert.ok(/function openAdd\(pre\) \{\s*if \(dlg \|\| !ALL \|\| !canEditNow\(\)\) return;/.test(k));                    // 버튼이 없어도 함수가 한 번 더 막는다(심층 방어)
  assert.ok(/if \(!r \|\| gs\.busy \|\| !canEditNow\(\)\) return;/.test(k) && /function changeTag\(r, code, btn\) \{\s*if \(gs\.busy \|\| !canEditNow\(\)\) return;/.test(k));
  // 대화창 접근성: Esc·Tab 순환, 닫으면 연 버튼(없으면 [목표 기관 추가])
  assert.ok(k.indexOf("ev.key !== 'Tab'") > 0 && k.indexOf("const a = $('hb-add'); o = a && !a.hidden ? a : null;") > 0);
  // 추가 뒤 새 줄 이름·뺀 뒤 다음 줄 이름으로 포커스
  assert.ok(k.indexOf('gs.focusNext = { inst: m.inst.id, reveal: true };') > 0 && k.indexOf("gs.focusNext = { inst: nx ? nx.id : '' };") > 0);
  // 이름 버튼 → dash.openDetail(screen bid_board), 닫으면 같은 data-key로
  assert.ok(k.indexOf("btn.classList.contains('hb-nm') || btn.classList.contains('hb-row')") > 0);
  // 연도 선택·서버 없음·1279px: 서버 없으면 협약 구획을 펼친 채로
  assert.ok(k.indexOf("gs.st = (!U.serverMode() || !U.hasEmp()) ? 'offline' : 'loading';") > 0 && k.indexOf('ob.open = true') < 0 && k.indexOf("case 'hb-ours-btn': openPop(); break;") > 0);   // 협약 구획은 팝업 — 서버가 없어도 버튼이 내장 자료로 연다
  // 서버 요청은 /bid-targets?year=·/bank-contracts/summary(처음 한 번)
  assert.ok(k.indexOf("fetchJson('/bid-targets?year=' + encodeURIComponent(goalYear()))") > 0 && k.indexOf("fetchJson('/bank-contracts/summary')") > 0);
  // 서버 응답 순서가 어긋나도 옛 응답은 버린다
  assert.ok(/if \(my !== gs\.seq \|\| !host\) return;/.test(k));
  // 목표 밖 묶음·후보는 제안 진행 자료가 있을 때만
  assert.ok(k.indexOf('if (ctx.prepOk) out = kbb.outRows(') > 0);
  // qa 11-17 P3-5: 메뉴에서 Tab은 칩으로 포커스를 되돌린 뒤 넘어간다(body로 떨어지지 않게)
  assert.ok(/ev\.key === 'Tab'\) closeMenu\(true\)/.test(k) && k.indexOf("ev.key === 'Tab') closeMenu(false)") < 0);
  // P3-7: [다시 시도] 뒤 포커스 — 눌렀던 버튼 id를 기억했다가 받기가 끝나면 같은 버튼 또는 표 영역으로
  assert.ok(/case 'hb-gretry': gs\.retryFocus = 'hb-gretry'; loadGoals\(\); break;/.test(k) && /case 'hb-pretry': gs\.retryFocus = 'hb-pretry'; loadProgress\(\); break;/.test(k));
  assert.ok(/function applyRetryFocus\(\)[\s\S]*?gs\.retryFocus = '';[\s\S]*?\$\(id\) \|\| \$\('hb-goals'\)/.test(k) && k.indexOf('class="hb-tp" id="hb-goals" tabindex="-1"') > 0);
  // P3-8: 저장 중에는 Esc·[취소]를 막고 버튼 글을 '저장 중…'으로, 포커스는 대화창 상자에 두었다가 실패하면 되돌린다
  assert.ok(/if \(mm && mm\.busy\) \{ ev\.preventDefault\(\); return; \}/.test(k));
  assert.ok(/if \(b\.id === 'hb-a-cancel'\) \{ if \(!m\.busy\) closeDlg\(\); \}/.test(k) && /if \(b\.id === 'hb-c-cancel'\) \{ if \(!m\.busy\) closeDlg\(\); \}/.test(k));
  assert.ok(k.indexOf("go.textContent = m.busy ? '저장 중…' : (watch ? '관심 기관에 넣기' : '목표에 넣기')") > 0 && k.indexOf("'관심에서 빼기' : '목표에서 빼기')") > 0);
  assert.ok(k.indexOf("cb.disabled = !!m.busy") > 0 && k.indexOf('holdDlgFocus(d,') > 0 && k.indexOf('releaseDlgFocus(d);') > 0);
  // P2-1: 제안 진행 자료가 둘 다 403이면 기억해 두고 다시 부르지 않는다, 계정이 바뀌면 푼다
  assert.ok(/if \(prepDenied403\) \{[\s\S]*?return Promise\.resolve\(\);/.test(k) && /p\.code === 403 && o\.code === 403\) prepDenied403 = true;/.test(k) && /prepDenied403 = false;/.test(k));
  // summary 안에 h3를 두지 않는다(P3-11)
  assert.ok(k.indexOf('<summary><h3') < 0 && k.indexOf('<h3 id="hb-ot">') > 0);   // 팝업 머리의 제목은 h3(details·summary 없음)
});

test('index.html: 요약 띠·표·구분 칩·메뉴·레인 CSS가 규격(6-B)대로 — 새 변수 0개, 칩 24px, 행 40px, 월 눈금 12등분', function () {
  const html = src('index.html');
  const a = html.indexOf('/* 국민은행 상태 현황판(kbboard.js) 시작'), b = html.indexOf('/* 국민은행 상태 현황판 끝 */');
  const css = html.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\.hb-tt td, \.hb-tt tbody th \{[^}]*height:40px/.test(css));
  assert.ok(/\.hb-lane \{[^}]*repeating-linear-gradient\(to right, transparent 0 calc\(100%\/12 - 1px\), var\(--line\) calc\(100%\/12 - 1px\) calc\(100%\/12\)\)/.test(css));
  assert.ok(/\.hb-lane \.cur \{[^}]*width:calc\(100%\/12\)/.test(css));
  assert.ok(/\.hb-tt \.hb-nm:focus-visible \{ outline:2px solid var\(--accent-color\)/.test(css));                   // 키보드 포커스 링(틸)
  assert.ok(/\.hb-late \{[^}]*var\(--red\) 72%, var\(--fg\)[^}]*var\(--red\) 18%/.test(css));                          // 지연 칩 = 빨강 글자(본문색 쪽 섞기)·테두리·18% 바탕
  assert.ok(/\.hb-k \.v\.hot \{[^}]*var\(--red\) 72%, var\(--fg\)/.test(css) && /\.hb-dd\.hot \{[^}]*var\(--red\) 72%, var\(--fg\)/.test(css));
  assert.ok(/#hb-ours \{[^}]*width:min\(720px, 92vw\)/.test(css) && /#hb-ours \.hb-ob \{[^}]*max-height:76vh/.test(css));   // 협약 중인 기관 팝업(6-10)
  assert.ok(/\.hb-top \.ro \{[^}]*color:var\(--muted\)/.test(css) && /\.hb-top \.ro\[hidden\], \.hb-top #hb-add\[hidden\] \{ display:none; \}/.test(css));   // hidden 속성이 display 규칙에 지지 않게
  assert.ok(/\.hb-tag\.ro \{[^}]*cursor:default/.test(css) && /\.hb-tag\.add \{[^}]*border-style:dashed/.test(css));
  assert.ok(/\.hb-dlg \.hb-rd input \{ width:auto;/.test(css) && /\.hb-res li\[aria-disabled=true\] \{ color:var\(--muted\); cursor:default; \}/.test(css));
  // design 11-17 6-A·6-B: 열 폭은 클래스(구분 166·마감까지 120·현 금고 은행 124), 2단 은행 막대, 눈금 없는 plan·open 막대, 후보 폭, 대화창 이름표 위·칸 전체 폭
  assert.ok(/\.hb-tt col\.c-nm \{ width:150px; \} \.hb-tt col\.c-tag \{ width:166px; \} \.hb-tt col\.c-due \{ width:120px; \}/.test(css) && /\.hb-tt col\.c-bank \{ width:124px; \} \.hb-tt col\.c-stg \{ width:148px; \} \.hb-tt col\.c-brf \{ width:56px; \}/.test(css));
  assert.ok(/\.hb-bk\.two \{ grid-template-columns:auto minmax\(0,1fr\) 20px auto minmax\(0,1fr\) 20px; column-gap:8px; \}/.test(css));
  assert.ok(/\.hb-lane \.w\.pl::after, \.hb-lane \.w\.op::after \{ content:none; \}/.test(css) && /\.hb-lane \.w\.op \{ border-right-style:dashed; \}/.test(css));
  assert.ok(/\.hb-lane \.unk, \.hb-lane \.unk\.before \{ left:calc\(100%\/12 \+ 2px\); max-width:calc\(100% - 100%\/12 - 4px\); \}/.test(css));
  assert.ok(/\.hb-cand \{[^}]*max-width:560px/.test(css));
  assert.ok(/\.hb-dlg #hb-a-q, \.hb-dlg #hb-a-memo, \.hb-dlg #hb-c-etc \{ display:block; width:100%; margin-top:4px; box-sizing:border-box; \}/.test(css));
  assert.ok(!/#hb-ours > summary/.test(css) && !/#hb-ours\[open\]/.test(css));                                         // 접힌 구획 규칙은 지웠다
  // :root 변수 이름은 동결 — 이 블록이 새 --변수를 정의하지 않는다
  assert.deepStrictEqual((css.match(/(^|[\s;{])--[\w-]+\s*:/g) || []).map(function (s) { return s.trim().replace(/:$/, '').replace(/^[;{]/, ''); }), ['--rowbg', '--rowbg', '--rowbg']);   // :root 변수는 안 늘고 표 칸 지역 변수 --rowbg만(11-19 E)
  // 새 글자 크기는 11px 이상
  (css.match(/font(?:-size)?:\s*(?:\d+\s+)?(\d+)px/g) || []).forEach(function (s) { assert.ok(Number(/(\d+)px/.exec(s)[1]) >= 11, s); });
  // 스크립트 순서: errtext.js가 kbboard.js보다 앞(오류 문구 해석)
  const at = function (s) { return html.indexOf('<script src="js/' + s + '"></script>'); };
  assert.ok(at('errtext.js') > 0 && at('errtext.js') < at('kbboard.js') && at('kbboard.js') < at('app.js'));
});
