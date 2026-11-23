'use strict';
// 시작화면(포털, 구 '첫 화면') 3단계 — NEXT 97. 순수 계산(띠·묶음·표·거르기·결재 합산)·확정 규칙·nav 연결·소스 규칙.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const logic = require('../js/logic.js');
const nav = require('../js/nav.js');
const portal = require('../js/portal.js');

const TODAY = new Date(2026, 10, 19);                       // 2026-11-19
function p(n) { return logic.localDateStr(new Date(2026, 10, 19 + n)); }
function src(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function rec(id, name, extra) { return Object.assign({ institutionId: id, name: name, region: '11', type: '지자체', confirmed: false }, extra || {}); }
const ALL_ON = { map: true, regions: true, workflow: true, chat: true, knowledge: true, tasks: true, approvals: true, admin: true };

// ── 띠 ① 이번 달 접수 마감 ─────────────────────────────────────────────
test('① deadlineKpi: 공고로 확정된 마감만(이번 달 + 아직 안 지남), D-7 안은 n7·nearest, 추정 공고 예정은 따로', function () {
  const L = [
    rec('N1', '가구', { confirmed: true, contractEnd: p(-3), receiveTo: p(2) }),    // 11-21 접수 중 → 센다, D-2
    rec('N2', '나구', { confirmed: true, contractEnd: p(-5), receiveTo: p(9) }),    // 11-28 → 센다, D-9
    rec('N3', '다구', { confirmed: true, contractEnd: p(-5), receiveTo: p(15) }),   // 12-04 → 다음 달
    rec('N4', '라구', { confirmed: true, contractEnd: p(-40), receiveTo: p(-1) }),  // 마감 지남 → 세지 않는다
    rec('E1', '마구', { confirmed: false, contractEnd: p(5) }),                      // 추정 공고 예정 11-24 → estN
    rec('E2', '바구', { confirmed: false, contractEnd: p(30) }),                     // 12-19 → 다음 달
    rec('PL', '사구', { confirmed: true, contractEnd: p(10) })                       // 확정 공고 예정(마감 아님) → 세지 않는다
  ];
  const model = require('../js/dashboard.js').model(L, TODAY);
  assert.deepStrictEqual(portal.deadlineKpi(model, TODAY), { month: 11, n: 2, n7: 1, nearest: 2, estN: 1 });
});

// ── 띠 ② ④ 국민은행/다른 은행 가름(확정 규칙) ──────────────────────────
// 서버 모양: lines_now = 지금 유효한 줄만, 시작 전 줄은 lines_next(백엔드 이관 — 그전까지 서버는 lines_next를 주지 않음)
function sum(lines, next) { return next ? { lines_now: lines, lines_next: next } : { lines_now: lines }; }
function ln(bank, from, to, rank) { return { rank_cd: rank || 'SINGLE', bank_name: bank, term_from: from, term_to: to }; }
function fixture() {
  const list = [
    rec('A', '가구'), rec('B', '나구'), rec('C', '다구'), rec('D', '라구'), rec('E', '마구'), rec('F', '바구'),
    rec('G', '사구'), rec('H', '아구'), rec('I', '자구'), rec('J', '차구'),
    { institutionId: 'K', name: '서울중앙법원', region: '11', type: '법원', bank: '신한은행', contractExpiry: p(20) }];
  const sumById = {
    A: sum([ln('국민은행', '2024-01-01', p(100))]),
    B: sum([ln('신한은행', '2024-01-01', p(50), 'FIRST'), ln('KB국민은행', '2024-01-01', p(200), 'SECOND')]),   // 공동 — 한쪽이 국민은행
    C: sum([ln('신한은행', '2024-01-01', p(30))]),
    D: sum([ln('신한은행', '2024-01-01', p(-5))]),                                                         // 종료일 지남
    E: sum([ln('국민은행', '2024-01-01', p(400))]),                                                        // 1년 밖
    F: sum([ln('신한은행', '2024-01-01', p(40))]),                                                         // KB_NEXT(2027년부터 국민은행)
    G: sum([ln('국민은행', '2020-01-01', p(60))], [ln('국민은행', p(61), p(3000))]),                          // 시작 전 약정도 국민은행
    H: sum([ln('신한은행', '2020-01-01', p(70))], [ln('우리은행', p(71), p(3000))]),                          // 시작 전 약정이 다른 은행
    I: sum([ln('국민은행', '2020-01-01', p(80))])                                                          // 공고 회차 입찰 없음
  };
  const snap = { byId: { I: { handled_at: p(-9), status_cd: 'NO_BID' } }, today: p(0) };
  return { list: list, o: { today: TODAY, verified: [], next: ['11|바구'], lofin: null, sumById: sumById, snap: snap } };
}
const names = function (a) { return a.map(function (x) { return x.name; }); };

test('②④ 확정 규칙: 공동 금고는 국민은행이 한쪽이라도 맡으면 ②, 아니면 ④, 두 칸에 중복 없음', function () {
  const f = fixture(), b = portal.bankBuckets(f.list, f.o);
  assert.deepStrictEqual(names(b.kb), ['사구', '자구', '가구', '나구']);                  // 60·80·100·200일, 마구(400일)는 1년 밖
  assert.deepStrictEqual(names(b.other), ['서울중앙법원', '다구', '바구', '아구']);       // 20·30·40·70일
  assert.strictEqual(b.byKey['11|나구'].group, 'kb');                                    // 공동: 신한 + KB국민은행 → 국민은행 쪽
  assert.strictEqual(b.byKey['11|나구'].end, p(200));                                    // 종료일은 국민은행 줄
  const all = b.kb.concat(b.other, b.past).map(function (x) { return x.key; });
  assert.strictEqual(new Set(all).size, all.length);                                     // 한 기관이 두 곳에 들지 않는다
  assert.strictEqual(b.noBankN, 1);                                                      // 은행 모름(차구)
});

test('종료일이 이미 지난 기관은 1년 안 숫자에 넣지 않고 past(공고 경과 판정 대기)로', function () {
  const f = fixture(), b = portal.bankBuckets(f.list, f.o);
  assert.deepStrictEqual(names(b.past), ['라구']);
  assert.ok(b.past[0].endDays < 0);
  assert.ok(b.kb.concat(b.other).every(function (x) { return x.endDays >= 0 && x.endDays <= 365; }));
});

test('다음 금고 은행 태그: 재유치 확정·차기 확정·신규 확정(KB_NEXT)·입찰 끝남 — 숫자에서 빼지 않는다', function () {
  const f = fixture(), b = portal.bankBuckets(f.list, f.o), tag = function (k) { return b.byKey['11|' + k].tag; };
  assert.strictEqual(tag('사구'), 'kept');
  assert.strictEqual(tag('아구'), 'next');
  assert.strictEqual(b.byKey['11|아구'].nextBank, '우리은행');
  assert.strictEqual(tag('바구'), 'won');
  assert.strictEqual(b.byKey['11|바구'].nextBank, '국민은행');
  assert.strictEqual(tag('자구'), 'ended');
  assert.strictEqual(tag('가구'), '');
  assert.strictEqual(b.kb.length, 4);                                                    // 태그 붙은 사구·자구도 센다
  assert.strictEqual(portal.decidedNote(b.kb), '재유치 확정 1곳 · 입찰 끝남 1곳 포함');
  assert.strictEqual(portal.decidedNote(b.other), '차기 확정 1곳 · 신규 확정 1곳 포함');
  assert.strictEqual(portal.decidedNote([{ tag: '' }]), '');
});

test('현재 줄만 판정: 시작 전 약정의 종료일은 종료일·국민은행 판정에 섞이지 않는다', function () {
  const f = fixture(), b = portal.bankBuckets(f.list, f.o);
  assert.strictEqual(b.byKey['11|사구'].end, p(60));            // 시작 전 줄 종료일(p(3000))이 아니다
  assert.strictEqual(b.byKey['11|아구'].group, 'other');        // 시작 전 줄이 우리은행이어도 지금은 신한
});

test('종료일 근거 우선순위는 kbboard.contractEnd와 같다(039 직접 입력 > 행안부 > 기관 자료 contractExpiry)', function () {
  const lofin = { rows: { '11|가구': [{ bank: '국민은행', rank: 'SINGLE', accts: ['일반회계'], start: '2024-01-01', end: p(150) }] } };
  const L = [rec('A', '가구')], o = { today: TODAY, verified: ['11|가구'], lofin: lofin };
  assert.strictEqual(portal.bankBuckets(L, o).byKey['11|가구'].end, p(150));              // 039 없음 → 행안부
  const o2 = Object.assign({}, o, { sumById: { A: sum([ln('국민은행', '2024-01-01', p(90))]) } });
  assert.strictEqual(portal.bankBuckets(L, o2).byKey['11|가구'].end, p(90));              // 039 직접 입력이 이긴다
  const court = [{ institutionId: 'K', name: '서울중앙법원', region: '11', type: '법원', bank: '국민은행', contractExpiry: p(33) }];
  const bc = portal.bankBuckets(court, { today: TODAY, verified: [] });
  assert.strictEqual(bc.byKey['11|서울중앙법원'].end, p(33));                              // 법원 = contractExpiry
  assert.strictEqual(bc.byKey['11|서울중앙법원'].group, 'kb');
});

test('P.CFG.OTHER_INCLUDE_NONMUNI=false면 법원·공공기관은 다른 은행 칸에서 빠진다(기획 확인용 스위치)', function () {
  const f = fixture();
  portal.CFG.OTHER_INCLUDE_NONMUNI = false;
  try { assert.deepStrictEqual(names(portal.bankBuckets(f.list, f.o).other), ['다구', '바구', '아구']); }
  finally { portal.CFG.OTHER_INCLUDE_NONMUNI = true; }
});

// ── 띠 ③ 내 결재 ────────────────────────────────────────────────────────
function ok(data) { return { status: 'ok', data: data }; }
test('③ approvalKpi: 결재자는 처리할 건수(받은 결재 can_decide + 작업물), 결재 권한 없으면 내가 올려 대기(PENDING)', function () {
  const inbox = ok({ items: [{ can_decide: true }, { can_decide: false }, { can_decide: true }] });
  const mine = ok({ items: [{ status: 'PENDING' }, { status: 'APPROVED' }, { status: 'PENDING' }, { status: 'PENDING' }] });
  assert.deepStrictEqual(portal.approvalKpi({ perms: ok({ can_approve: true }), inbox: inbox, mine: mine }, '영업팀'),
    { mode: 'decide', n: 2, status: 'ok', partial: false });
  assert.deepStrictEqual(portal.approvalKpi({ perms: ok({ can_approve: true }), inbox: inbox, mine: mine, appr: ok({ items: [{}, {}, {}] }) }, '영업팀장'),
    { mode: 'decide', n: 5, status: 'ok', partial: false });                                           // 팀장은 /approvals 합산
  assert.deepStrictEqual(portal.approvalKpi({ perms: ok({ rank_can_approve: false, can_approve: false }), inbox: inbox, mine: mine }, '디자이너'),
    { mode: 'mine', n: 3, status: 'ok', partial: false });
  // 영업팀(팀장·부장 아님)은 /approvals 결과를 합치지 않는다
  assert.strictEqual(portal.approvalKpi({ perms: ok({ can_approve: true }), inbox: inbox, appr: ok({ items: [{}, {}] }) }, '영업팀').n, 2);
  assert.deepStrictEqual(portal.sourcesFor('영업팀'), ['bank', 'perms', 'inbox', 'mine', 'assign']);
  assert.ok(portal.sourcesFor('영업부장').indexOf('appr') >= 0 && portal.sourcesFor('디자이너').indexOf('appr') < 0);
});

test('③ 출처별 실패: 권한 확인 중이면 loading, 일부만 실패하면 partial, 전부 실패하면 이유별 상태', function () {
  assert.strictEqual(portal.approvalKpi({ perms: { status: 'loading' } }, '영업팀').status, 'loading');
  const p1 = portal.approvalKpi({ perms: ok({ can_approve: true }), inbox: ok({ items: [{ can_decide: true }] }), appr: { status: 'error' } }, '영업부장');
  assert.deepStrictEqual([p1.status, p1.partial, p1.n], ['ok', true, 1]);
  assert.strictEqual(portal.approvalKpi({ perms: ok({ can_approve: true }), inbox: { status: 'error' } }, '영업팀').status, 'error');
  assert.strictEqual(portal.approvalKpi({ perms: ok({ can_approve: true }), inbox: { status: 'denied' } }, '영업팀').status, 'denied');
  assert.strictEqual(portal.approvalKpi({ perms: { status: 'offline' }, inbox: { status: 'offline' }, mine: { status: 'offline' } }, '영업팀').status, 'offline');
  // my-perms를 못 받으면 처리할 건이 보일 때 결재자로 본다(가정 아님: 받은 결재에 can_decide 건이 있음)
  assert.strictEqual(portal.approvalKpi({ perms: { status: 'error' }, inbox: ok({ items: [{ can_decide: true }] }), mine: ok({ items: [] }) }, '영업팀').mode, 'decide');
});

// ── 띠 모델·표 ──────────────────────────────────────────────────────────
test('bandModel: 규격 문구·상태(0곳은 확인했고 없음, —는 확인 못 함)·aria-pressed·실패 시 —', function () {
  const f = fixture(), b = portal.bankBuckets(f.list, f.o), model = require('../js/dashboard.js').model(f.list, TODAY);
  const mk = function (x) { return portal.bandModel(Object.assign({ today: TODAY, model: model, buckets: b, bankSt: 'ok', appr: { mode: 'decide', n: 3, status: 'ok', partial: false }, mode: 'kb' }, x || {})); };
  const s = mk();
  assert.deepStrictEqual(s.map(function (x) { return x.id; }), ['deadline', 'kb', 'appr', 'other']);
  assert.strictEqual(s[0].label, '11월 접수 마감');
  assert.strictEqual(s[1].n, 4);
  assert.strictEqual(s[1].sub, '가장 빠른 종료 ' + p(60));                       // 규격 ②: 가장 빠른 종료
  assert.ok(s[1].title.indexOf('재유치 확정 1곳 · 입찰 끝남 1곳 포함') > 0);        // 태그 건수는 title에
  assert.strictEqual(s[1].pressed, true);
  assert.strictEqual(s[3].sub, '신한은행 4곳 가장 많음');                          // ④: 가장 많은 은행(서울중앙법원·다구·바구·아구 모두 현재 신한은행)
  assert.ok(s[3].title.indexOf('데려올 기회') === 0);
  assert.strictEqual(s[2].sub, '처리할 결재');
  assert.strictEqual(s[2].pressed, null);
  // 11-19 저녁 사용자 지정 + design 4-5: 내가 올린 쪽(mine)은 '결재 대기 중' / '결재 대기 중인 건 없음', 결재자 쪽(decide)은 '처리할 결재' 그대로
  assert.strictEqual(mk({ appr: { mode: 'mine', n: 0, status: 'ok' } })[2].sub, '결재 대기 중인 건 없음');
  assert.strictEqual(mk({ appr: { mode: 'mine', n: 2, status: 'ok' } })[2].sub, '결재 대기 중');
  assert.strictEqual(mk({ appr: { mode: 'decide', n: 0, status: 'ok' } })[2].sub, '처리할 결재 없음');
  assert.strictEqual(mk({ appr: { status: 'denied' } })[2].sub, '결재함 권한 없음');
  assert.strictEqual(mk({ appr: { status: 'error' } })[2].sub, '불러오지 못함');
  assert.strictEqual(mk({ appr: { status: 'loading' } })[2].kind, 'busy');
  assert.strictEqual(mk({ bankSt: 'error' })[1].sub, '불러오지 못함');             // 실패 → —
  assert.strictEqual(mk({ bankSt: 'denied' })[3].sub, '기관 정보 열람 권한 없음');
  assert.strictEqual(mk({ bankSt: 'loading' })[1].kind, 'busy');
  const none = portal.bankBuckets([], { today: TODAY });
  assert.strictEqual(portal.bandModel({ today: TODAY, model: model, buckets: none, bankSt: 'ok', appr: { status: 'loading' }, mode: 'all' })[1].sub, '등록된 금고 약정 없음');
  const html = portal.bandHtml(mk({ bankSt: 'error' }));
  assert.ok(html.indexOf('<span class="v">—</span>') > 0 && (html.match(/aria-pressed/g) || []).length === 1 && html.indexOf('id="pt-k4"') > 0);
});
test('① 보조 줄: D-7 안이 있으면 hot + 가장 가까운 D-n, 추정 있으면 별도 문구, 없으면 0 문구', function () {
  const L = [rec('N1', '가구', { confirmed: true, contractEnd: p(-3), receiveTo: p(2) }), rec('E1', '마구', { confirmed: false, contractEnd: p(5) })];
  const model = require('../js/dashboard.js').model(L, TODAY), empty = portal.bankBuckets([], { today: TODAY });
  const k = portal.bandModel({ today: TODAY, model: model, buckets: empty, bankSt: 'ok', appr: { status: 'loading' }, mode: 'month' })[0];
  assert.strictEqual(k.hot, true);
  assert.strictEqual(k.sub, '가장 가까운 D-2 · 확정 공고만, 추정 1곳 별도');
  assert.strictEqual(k.pressed, true);
  const none = portal.bandModel({ today: TODAY, model: require('../js/dashboard.js').model([], TODAY), buckets: empty, bankSt: 'ok', appr: { status: 'loading' }, mode: 'all' })[0];
  assert.strictEqual(none.sub, '11월에 확정된 접수 마감 없음');
});

function row(extra) {
  return Object.assign({ key: 'k', rec: {}, name: '가', region: '11', org: '지자체', kind: 'plan', date: '2026-12-01', days: 12, est: false,
    sortDate: '2026-12-01', group: '', bank: '', end: '', endDays: null, tag: '', nextBank: '' }, extra || {});
}
test('표 정렬: 날짜 하나(추정은 그 달 1일), 같은 날이면 확정 먼저, 태그 붙은 줄은 맨 뒤', function () {
  const L = [rec('U1', '가구', { confirmed: true, contractEnd: p(12) }),          // 12-01 확정
    rec('U2', '나구', { confirmed: false, contractEnd: p(30) }),                  // 12-19 추정 → 정렬은 12-01
    rec('U3', '다구', { confirmed: true, contractEnd: p(5) })];                   // 11-24 확정
  const model = require('../js/dashboard.js').model(L, TODAY);
  const by = { '11|다구': { group: 'kb', bank: '국민은행', end: p(100), endDays: 100, tag: 'next', nextBank: '우리은행' } };
  const rows = portal.tableRows(model, { byKey: by, kb: [], other: [] }, TODAY);
  assert.deepStrictEqual(names(rows), ['가구', '나구', '다구']);                    // 가구(확정 12-01) → 나구(추정, 12-01) → 다구(태그, 날짜는 가장 빠르지만 뒤)
  assert.strictEqual(rows[1].sortDate, '2026-12-01');
  assert.strictEqual(rows[1].est, true);
  assert.strictEqual(rows[2].tag, 'next');
});

test('열 머리 정렬(11-19 저녁): 네 열 오름·내림, 값 없는 줄은 방향과 무관하게 맨 아래, 같은 값은 날짜→확정→이름, 태그 줄도 섞는다, 기본(null)은 그대로', function () {
  const a = row({ key: 'a', name: '가', kind: 'est', est: true, date: '2026-12-10', sortDate: '2026-12-01', days: 21, bank: '신한은행', tag: 'next' });
  const b = row({ key: 'b', name: '나', kind: 'notice', date: '2026-11-25', sortDate: '2026-11-25', days: 6, bank: '국민은행' });
  const c = row({ key: 'c', name: '다', kind: 'kb', date: '2027-03-01', sortDate: '2027-03-01', days: 102, bank: '국민은행' });
  const d = row({ key: 'd', name: '라', kind: 'notice', date: '', sortDate: '9999-12-31', days: null, bank: '' });   // 마감일 미확인·남은 날 —·은행 미등록
  const e = row({ key: 'e', name: '마', kind: 'plan', date: '2026-12-01', sortDate: '2026-12-01', days: 12, bank: '우리은행' });
  const all = [a, b, c, d, e], ks = function (r) { return r.map(function (x) { return x.key; }).join(''); };
  assert.strictEqual(portal.sortBy(all, null), all);
  assert.strictEqual(ks(portal.sortBy(all, { key: 'stage', dir: 'asc' })), 'bdeac');                 // 공고 중(나·라) → 공고 예정(마) → 추정(가) → 협약 종료(다), 같은 순위는 날짜(값 없음 9999) 뒤
  assert.strictEqual(ks(portal.sortBy(all, { key: 'stage', dir: 'desc' })), 'caebd');                // 같은 순위(나·라)는 내림에서도 날짜 오름
  assert.strictEqual(ks(portal.sortBy(all, { key: 'date', dir: 'asc' })), 'beacd');                  // 추정(가)은 그 달 1일 → 마와 같은 날이면 확정(마) 먼저, 값 없음(라)은 맨 아래
  assert.strictEqual(ks(portal.sortBy(all, { key: 'date', dir: 'desc' })), 'ceabd');                 // 내림에서도 라는 맨 아래, 같은 날 순서(마→가)는 방향과 무관
  assert.strictEqual(ks(portal.sortBy(all, { key: 'days', dir: 'asc' })), 'beacd');
  assert.strictEqual(ks(portal.sortBy(all, { key: 'days', dir: 'desc' })), 'caebd');
  assert.strictEqual(ks(portal.sortBy(all, { key: 'bank', dir: 'asc' })), 'bcaed');                  // 국민은행(나·다) → 신한 → 우리, 미등록(라)은 맨 아래
  assert.strictEqual(ks(portal.sortBy(all, { key: 'bank', dir: 'desc' })), 'eabcd');                 // 내림차순에서도 미등록은 맨 아래
  assert.strictEqual(portal.sortBy(all, { key: 'days', dir: 'asc' })[2].key, 'a');                   // 태그(가=next) 줄도 맨 뒤로 가지 않고 순수 정렬 순서에 섞인다
  assert.deepStrictEqual(all.map(function (x) { return x.key; }), ['a', 'b', 'c', 'd', 'e']);        // 원본은 바꾸지 않는다
  assert.strictEqual(portal.sortBy(all, { key: 'x', dir: 'asc' }), all);                             // 모르는 열은 그대로
});
test('nextSort 두 상태 토글·sortText·liveText(kind sort)', function () {
  assert.deepStrictEqual(portal.nextSort(null, 'date'), { key: 'date', dir: 'asc' });
  assert.deepStrictEqual(portal.nextSort({ key: 'date', dir: 'asc' }, 'date'), { key: 'date', dir: 'desc' });
  assert.deepStrictEqual(portal.nextSort({ key: 'date', dir: 'desc' }, 'date'), { key: 'date', dir: 'asc' });   // 세 번째 누름은 다시 오름(기본으로 돌아가는 길은 [임박순으로])
  assert.deepStrictEqual(portal.nextSort({ key: 'date', dir: 'desc' }, 'bank'), { key: 'bank', dir: 'asc' });
  assert.strictEqual(portal.sortText(null), '임박순');
  assert.strictEqual(portal.sortText({ key: 'days', dir: 'desc' }), '남은 날 내림차순');
  assert.strictEqual(portal.liveText({ kind: 'sort', sort: { key: 'bank', dir: 'asc' } }, 7, 11, 9), '현 금고 은행 오름차순으로 정렬했습니다. 7곳');
  assert.strictEqual(portal.liveText({ kind: 'sort', sort: null }, 7, 11, 9), '임박순으로 돌아갔습니다. 7곳');
  const sk = portal.skeletonHtml();
  assert.ok(sk.indexOf('id="pt-lr"') > 0 && sk.indexOf('id="pt-sort-reset"') > 0 && sk.indexOf('data-pt-sortreset="1" hidden>임박순으로</button>') > 0 && sk.indexOf('id="pt-live"') > 0);
  const s = src('js/portal.js');
  assert.ok(/P\.sortBy\(P\.filterRows\(v\.rows, f\), S\.sort\)/.test(s));                           // 정렬은 ROW_MAX로 자르기(tableHtml) 전에
  assert.ok(/S\.sort = null; S\.errSig = ''/.test(s) && s.indexOf("'data-pt-sort'") > 0);           // 초기화·포커스 복원
});

test('표 한 기관 한 줄: 공고 중 > 공고 예정 > 협약 종료, 마감 지남·결과 확인은 제외, 마감일 미확인은 맨 뒤쪽', function () {
  const L = [rec('N1', '가구', { confirmed: true, contractEnd: p(-3), receiveTo: p(2) }),
    rec('N4', '라구', { confirmed: true, contractEnd: p(-40), receiveTo: p(-1) }),           // awaiting → 제외
    rec('N5', '마구', { confirmed: true, contractEnd: p(-3) })];                              // 공고 났으나 마감일 미확인(30일 이내) → 포함
  const model = require('../js/dashboard.js').model(L, TODAY);
  const kbItem = { key: '11|가구', rec: L[0], name: '가구', region: '11', org: '지자체', group: 'kb', bank: '국민은행', end: p(40), endDays: 40, tag: '', nextBank: '' };
  const kbOnly = { key: '11|바구', rec: rec('B', '바구'), name: '바구', region: '11', org: '지자체', group: 'kb', bank: '국민은행', end: p(10), endDays: 10, tag: '', nextBank: '' };
  const buckets = { byKey: { '11|가구': kbItem, '11|바구': kbOnly }, kb: [kbItem, kbOnly], other: [] };
  const rows = portal.tableRows(model, buckets, TODAY);
  assert.deepStrictEqual(names(rows), ['가구', '바구', '마구']);                                // 마감일 미확인(마구)은 9999 → 맨 뒤
  assert.strictEqual(rows[0].kind, 'notice');
  assert.strictEqual(rows[0].group, 'kb');                                                      // 공고 줄이어도 ② 거르기에 들어간다
  assert.strictEqual(rows[0].inMonth, true);                                                    // 이번 달(11월) 확정 접수 마감
  assert.strictEqual(rows[1].kind, 'kb');
  assert.strictEqual(rows[2].date, '');
  assert.strictEqual(rows[2].kind, 'notice');                                                   // 마감일 미확인이어도 단계는 '공고 중'
});

test('거르기·유형 탭·건수: 띠 거르기는 한 번에 하나(이번 달 확정 마감 = month), 유형 탭과 함께 쓰고 탭 건수는 거르기를 반영, 일정 패널은 30일 안 실제 날짜 순', function () {
  const rows = [row({ key: '1', name: '가', org: '지자체', kind: 'notice', date: p(3), days: 3, group: 'kb', inMonth: true }),
    row({ key: '2', name: '나', org: '법원', kind: 'plan', days: 10, date: p(10) }),
    row({ key: '3', name: '다', org: '지자체', kind: 'est', est: true, days: 20, date: p(20) }),
    row({ key: '4', name: '라', org: '교육청', kind: 'other', group: 'other', days: 100, date: p(100) }),
    row({ key: '5', name: '마', org: '지자체', kind: 'notice', days: 40, date: p(40), inMonth: false })];
  assert.deepStrictEqual(portal.filterRows(rows, { mode: 'month', org: 'all' }).map(function (r) { return r.name; }), ['가']);
  assert.deepStrictEqual(portal.filterRows(rows, { mode: 'all', org: '지자체' }).map(function (r) { return r.name; }), ['가', '다', '마']);
  assert.deepStrictEqual(portal.filterRows(rows, { mode: 'kb', org: '법원' }), []);
  const c = portal.counts(rows, { mode: 'all' });
  assert.deepStrictEqual([c.org.all, c.org['지자체'], c.org['법원'], c.org['교육청']], [5, 3, 1, 1]);
  const c2 = portal.counts(rows, { mode: 'other' });
  assert.deepStrictEqual([c2.org.all, c2.org['교육청'], c2.org['지자체'] || 0], [1, 1, 0]);
  assert.deepStrictEqual(portal.scheduleRows(rows).map(function (r) { return r.name; }), ['가', '나', '다']);
  assert.strictEqual(portal.liveText({ mode: 'month' }, 4, 11, 42), '11월 접수 마감 4곳으로 걸렀습니다');
  assert.strictEqual(portal.liveText({ mode: 'all' }, 42, 11, 42), '거르기를 풀었습니다. 42곳');
  assert.strictEqual(portal.liveText({ kind: 'org', org: '법원' }, 2, 11, 42), '법원 2곳을 보여 줍니다.');
  assert.deepStrictEqual(portal.MODES, ['all', 'month', 'kb', 'other']);
});

test('HTML: 이름·은행은 이스케이프, 단계 칩 모양, 날짜 표기(추정은 월까지), 남은 날(hot 30일 경계·삼각·지난 날 도장·추정), 은행 칸, 태그 칩, 탭·거르기 줄 접근성', function () {
  const evil = '<img src=x onerror=alert(1)>';
  const h = portal.rowHtml(row({ name: evil, bank: evil, end: p(5), endDays: 5, days: 30, tag: 'kept', nextBank: evil, kind: 'notice', date: p(30) }));
  assert.ok(h.indexOf('<img') < 0 && h.indexOf('&lt;img') > 0);
  assert.ok(h.indexOf('<span class="pt-chip on">공고 중</span>') > 0);
  assert.ok(h.indexOf('class="pt-dd hot"') > 0 && h.indexOf('class="gph"') > 0 && h.indexOf('aria-hidden="true"') > 0);
  assert.ok(h.indexOf('pt-chip tag kept') > 0 && h.indexOf('재유치 확정') > 0);
  assert.ok(portal.rowHtml(row({ days: 31 })).indexOf('pt-dd hot') < 0);
  assert.ok(portal.rowHtml(row({ days: -3 })).indexOf('<span class="ov-stamp"><span aria-hidden="true">D+3') > 0);
  const est = portal.rowHtml(row({ kind: 'est', est: true, date: '2027-03-15', days: 120 }));
  assert.ok(est.indexOf('<td class="dt est">2027-03</td>') > 0 && est.indexOf('<span class="mut">추정</span>') > 0 && est.indexOf('pt-chip est') > 0);
  assert.ok(portal.rowHtml(row({ kind: 'kb', bank: '국민은행' })).indexOf('class="pt-bank k"') > 0);
  assert.ok(portal.rowHtml(row({ bank: '농협은행' })).indexOf('class="pt-bank mut"') > 0);
  assert.ok(portal.rowHtml(row({ bank: '' })).indexOf('미등록') > 0);
  assert.ok(portal.rowHtml(row({ kind: 'other' })).indexOf('<span class="pt-chip end">협약 종료</span>') > 0);
  ['next', 'won', 'ended'].forEach(function (tg) { assert.ok(portal.rowHtml(row({ tag: tg })).indexOf('pt-chip tag ' + tg) > 0, tg); });
  const types = ['지자체', '법원'], counts = portal.counts([row({ org: '법원' })], { mode: 'all' });
  const t = portal.tabsHtml(types, counts, '법원');
  assert.ok(t.indexOf('role="tab"') > 0 && t.indexOf('aria-selected="true"') > 0 && t.indexOf('tabindex="-1"') > 0 && t.indexOf('aria-controls="pt-sc"') > 0);
  assert.strictEqual((t.match(/role="tab"/g) || []).length, 3);
  assert.strictEqual(portal.tabIndex(types, '법원'), 2);
  const fl = portal.filterHtml('month', 4, 11);
  assert.ok(fl.indexOf('거르기: <b>11월 접수 마감 4곳</b>') === 0 && fl.indexOf('data-pt-unfilter') > 0 && fl.indexOf('거르기 풀기') > 0);
  const e1 = portal.tableHtml([], { caption: 'c', mode: 'month', org: 'all', month: 11, total: 10 });
  assert.ok(e1.indexOf('11월에 접수 마감인 기관이 없습니다.') > 0 && e1.indexOf('data-pt-unfilter') > 0);
  const e2 = portal.tableHtml([], { caption: 'c', mode: 'all', org: 'all', total: 0 });
  assert.ok(e2.indexOf('1년 안에 다가오는 입찰이 없습니다.') > 0 && e2.indexOf('[전국 지도]에서 봅니다') > 0);
  assert.ok(portal.tableHtml([], { mode: 'all', org: '법원', total: 5 }).indexOf('이 유형에는 해당하는 기관이 없습니다.') > 0);
  assert.ok(e1.indexOf('<caption class="sr-only">c</caption>') > 0 && e1.indexOf('<th scope="col">기관</th>') > 0);
  // 열 머리 정렬(11-19 저녁): 네 열은 .hb-sort 버튼, 정렬된 열에만 aria-sort, 기관 열은 글자만
  assert.strictEqual((e1.match(/class="hb-sort" data-pt-sort="/g) || []).length, 4);
  assert.ok(e1.indexOf('aria-sort') < 0 && e1.indexOf('data-pt-sort="bank">현 금고 은행<svg') > 0);
  const sd = portal.tableHtml([], { caption: 'c', mode: 'all', org: 'all', total: 0, sort: { key: 'days', dir: 'desc' } });
  assert.ok(sd.indexOf('<th scope="col" aria-sort="descending"><button type="button" class="hb-sort" data-pt-sort="days">남은 날') > 0 && (sd.match(/aria-sort/g) || []).length === 1);
  assert.ok(portal.tableHtml([], { sort: { key: 'date', dir: 'asc' } }).indexOf('aria-sort="ascending"') > 0);
  const many = []; for (let i = 0; i < 205; i += 1) many.push(row({ key: 'x' + i }));
  assert.strictEqual((portal.tableHtml(many).match(/class="pt-r"/g) || []).length, 200);
});
test('일정·대기 패널: 날짜 머리(오늘·요일)·칩, 묶음 3개는 비어도 0·없음, 출처별 상태 문구, 실패 alert', function () {
  const sch = portal.schedHtml([row({ key: 'a', name: '가', kind: 'notice', date: p(0), days: 0 }), row({ key: 'b', name: '나', kind: 'est', est: true, date: p(2), days: 2 })], TODAY);
  // 날짜 머리 = 장부 모양: 왼쪽 날짜, 오른쪽 D-n(오늘은 D-day)
  assert.ok(sch.indexOf('<div class="pt-day"><span>오늘 11-19 (목)</span><span class="dd">D-day</span></div>') === 0 && sch.indexOf('<div class="pt-day"><span>11-21 (토)</span><span class="dd">D-2</span></div>') > 0);
  assert.ok(sch.indexOf('<span class="pt-chip on">접수 마감</span>') > 0 && sch.indexOf('pt-chip est') > 0);
  assert.ok(portal.schedHtml([], TODAY).indexOf('30일 안에 공고나 접수 마감 일정이 없습니다.') > 0);
  const ok0 = { status: 'ok', items: [] };
  const all0 = portal.waitHtml({ appr: { mode: 'decide', n: 0, status: 'ok', items: [] }, judge: ok0, assign: ok0 });
  assert.ok(all0.indexOf('기다리는 결재나 확인할 일이 없습니다.') > 0 && (all0.match(/<details class="pt-grp" open>/g) || []).length === 3 && all0.indexOf('없음') > 0);
  const h = portal.waitHtml({ appr: { mode: 'decide', n: 1, status: 'ok', items: [{ title: '가구 · 결재', meta: '권한 신청' }] }, judge: { status: 'ok', items: [{ key: '11|가구', name: '가구', days: 5 }] },
    assign: { status: 'error', items: [] } });
  assert.ok(h.indexOf('data-pt-go="appr-inbox"') > 0 && h.indexOf('data-pt-open="11|가구"') > 0 && h.indexOf('D+5') > 0);
  // 묶음 안 실패 줄은 alert 아님(띠 아래 #pt-err가 alert — 두 번 낭독하지 않게, design 11-19 대조 P3)
  assert.ok(h.indexOf('<p class="pt-none">불러오지 못함</p>') > 0 && h.indexOf('role="alert"') < 0 && h.indexOf('처리할 결재<span class="n">1</span>') > 0);
  // 권한 없음 문구는 묶음별(결재함·기관 정보·배정 목록)
  const den = portal.waitHtml({ appr: { mode: 'decide', n: 0, status: 'denied', items: [] }, judge: { status: 'denied', items: [] }, assign: { status: 'denied', items: [] } });
  assert.ok(den.indexOf('결재함 권한 없음') > 0 && den.indexOf('기관 정보 열람 권한 없음') > 0 && den.indexOf('배정 목록 권한 없음') > 0);
  // 태그: 이름과 태그는 .pt-cell 안(이름만 말줄임), 확정 태그만 체크 글리프, 다음 은행은 낭독용 글자로도
  const kept = portal.rowHtml(row({ tag: 'kept', nextBank: '국민은행' })), nxt = portal.rowHtml(row({ tag: 'next', nextBank: '농협은행' }));
  assert.ok(kept.indexOf('<span class="pt-cell"><button') > 0 && kept.indexOf('M1.5 5.3l2.4') > 0 && kept.indexOf('<span class="sr-only">, 다음 금고 은행 국민은행</span>') > 0);
  assert.ok(nxt.indexOf('M1.5 5.3l2.4') < 0 && nxt.indexOf('다음 금고 은행 농협은행') > 0);
  assert.ok(portal.waitHtml({ appr: { mode: 'mine', n: 2, status: 'ok', items: [] }, judge: ok0, assign: ok0 }).indexOf('내가 올린 결재') > 0);
  assert.strictEqual(portal.waitTotal({ appr: { n: 2, status: 'ok' }, judge: { status: 'ok', items: [1, 2, 3] }, assign: { status: 'error', items: [] } }), 5);
  const e = portal.errHtml(['bank', 'approvals']);
  assert.ok(e.indexOf('금고 약정을 불러오지 못했습니다. 서버 연결을 확인한 뒤 다시 불러오세요.') > 0 && e.indexOf('data-pt-retry="approvals"') > 0 && e.indexOf('다시 불러오기') > 0);
  assert.ok(portal.errHtml(['bank', 'notice']).indexOf('data-pt-retry="notice"') > 0);
  assert.ok(portal.apprItems({ inbox: { status: 'ok', data: { items: [{ can_decide: true, title: 'a', type_label: 't' }, { can_decide: false }] } } }, '영업팀', 'decide').length === 1);
});

test('공고 경과 판정 대기 = 경과 미처리 + 협약 종료일 지난 기관(같은 기관은 한 번만)', function () {
  const L = [rec('O1', '가구', { confirmed: false, contractEnd: p(-10) }), rec('O2', '나구', { confirmed: false, contractEnd: p(-20) })];   // 예정일 경과 둘
  const model = require('../js/dashboard.js').model(L, TODAY);
  const past = [{ key: '11|가구' }, { key: '11|다구' }];                                       // 가구는 경과와 겹침
  assert.strictEqual(portal.judgeCount(model, { past: past }, null, TODAY), 3);                // snap 없음 → 경과 둘 모두 미처리 + 다구
  const snap = { byId: { O2: { status_cd: 'CLOSED' } }, today: p(0) };
  assert.strictEqual(portal.judgeCount(model, { past: past }, snap, TODAY), 2);                // 나구는 처리됨 → 가구·다구
  assert.strictEqual(portal.judgeItems(model, { past: [] }, null, TODAY)[0].name, '가구');     // 경과 일수가 적은(최근) 기관이 먼저
});

// ── nav 연결 ────────────────────────────────────────────────────────────
function items(built, id) { return built.filter(function (c) { return c.id === id; })[0].items; }
test('nav 시작화면: 첫 분류 단독 항목(headOnly — 사이드바에는 안 그림), 영업 계열+디자이너+전산팀(보기 전용)만(서버 map 키 AND), 마스터·재무·둘러보기는 숨김', function () {
  ['영업팀', '영업팀장', '영업부장', '디자이너', '전산팀', '전산팀장'].forEach(function (role) {
    const built = nav.build(ALL_ON, { role: role });
    assert.strictEqual(built[0].id, 'home', role);
    assert.strictEqual(built[0].headOnly, true);
    assert.deepStrictEqual(built[0].items.map(function (i) { return i.id + ':' + i.label; }), ['soon:시작화면:시작화면']);
    assert.strictEqual(nav.badgeOf(built[0].items[0]), '');
    assert.strictEqual(built[0].showSubs, false);
    assert.ok(!built[1].headOnly);
  });
  assert.strictEqual(nav.HOME_ID, 'soon:시작화면');
  ['예산팀', '예산팀장', ''].forEach(function (role) {
    assert.ok(!nav.build(ALL_ON, { role: role }).some(function (c) { return c.id === 'home'; }), role || '(역할 없음)');
  });
  assert.ok(!nav.build(ALL_ON, { role: '영업팀', master: true }).some(function (c) { return c.id === 'home'; }));
  assert.ok(!nav.build(Object.assign({}, ALL_ON, { map: false }), { role: '영업팀' }).some(function (c) { return c.id === 'home'; }));
  assert.ok(nav.build(ALL_ON, { role: '영업팀' }).some(function (c) { return c.id === 'scan' && items([c], 'scan')[0].id === nav.DASH_ID; }));   // 입찰 현황판은 메뉴에 그대로
  assert.strictEqual(nav.screenName(nav.HOME_ID, 'soon:이사회 자료'), null);                    // 접근 이력 기록 안 함(soon: 항목)
});
test('nav.accordionOf: 단독 항목은 null, 그 밖은 categoryOf와 같다 — 시작화면이 다른 분류의 열림을 닫지 않는다', function () {
  const built = nav.build(ALL_ON, { role: '영업팀' });
  assert.strictEqual(nav.categoryOf(built, nav.HOME_ID), 'home');
  assert.strictEqual(nav.accordionOf(built, nav.HOME_ID), null);
  assert.strictEqual(nav.accordionOf(built, nav.DASH_ID), 'scan');
  assert.strictEqual(nav.accordionOf(built, 'approvals'), null);   // 결재함 = 머리 띠 단독 항목(11-23)
  assert.deepStrictEqual(nav.navigatedOpen({ open: 'manage', fixed: true, pending: null }, nav.accordionOf(built, nav.HOME_ID), false), { open: 'manage', fixed: true, pending: null });
});
test('nav.homeItemId·expectsHome·isHomeRole: 대상 역할에 디자이너, 지도만 본 상태에서만', function () {
  const home = function (role, o) {
    const x = o || {}, ctx = { role: role, master: !!x.master };
    return nav.homeItemId(nav.build(x.visible || ALL_ON, ctx), x.active === undefined ? 'map' : x.active, x.tabs || [{ id: 'map', label: '전국 지도' }], ctx);
  };
  assert.strictEqual(home('디자이너'), nav.HOME_ID);
  assert.strictEqual(home('영업부장', { active: 'workflow' }), null);
  assert.strictEqual(home('전산팀'), nav.HOME_ID);   // 전산팀은 시작화면을 본다(보기 전용, 11-19)
  assert.strictEqual(home('예산팀'), nav.BOARD_ID);   // 재무의 시작화면 = 이사회 자료 작성(11-19)
  assert.strictEqual(home('예산팀장'), nav.BOARD_ID);
  assert.strictEqual(nav.expectsHome({ role: '디자이너' }, true), true);
  assert.strictEqual(nav.expectsHome({ role: '디자이너' }, false), false);
  assert.strictEqual(nav.expectsHome({ role: '영업팀', master: true }, true), false);
  assert.strictEqual(nav.expectsHome({ role: '예산팀' }, true), true);          // 재무도 시작화면이 열리므로 overdue 팝업을 미룬다
  assert.strictEqual(nav.expectsHome({ role: '예산팀장' }, false), true);       // 이사회 자료는 포털 본체가 필요 없다
  assert.strictEqual(nav.expectsHome({ role: '예산팀', master: true }, true), false);
});
test('nav.homeIdFor·limitToRole·pinId(역할별 시작화면·기본 메뉴, 사용자 11-19)', function () {
  assert.strictEqual(nav.homeIdFor({ role: '영업팀' }), nav.HOME_ID);
  assert.strictEqual(nav.homeIdFor({ role: '전산팀장' }), nav.HOME_ID);
  assert.strictEqual(nav.homeIdFor({ role: '디자이너' }), nav.HOME_ID);
  assert.strictEqual(nav.homeIdFor({ role: '예산팀' }), 'soon:이사회 자료');
  assert.strictEqual(nav.homeIdFor({ role: '예산팀장' }), nav.BOARD_ID);
  assert.strictEqual(nav.homeIdFor({ role: '영업팀', master: true }), null);
  assert.strictEqual(nav.homeIdFor({ role: '' }), null);
  const ids = function (role) { return nav.limitToRole(nav.build(ALL_ON, { role: role }), { role: role }).map(function (c) { return c.id; }); };
  assert.deepStrictEqual(ids('디자이너'), ['home', 'scan', 'manage', 'relate', 'tools', 'apprbox', 'sys']);   // relate = 협약 성과 관리(NEXT 104, 11-20)
  assert.deepStrictEqual(ids('예산팀'), ['plan', 'apprbox', 'sys']);       // 재무팀원도 '내가 올린 요청'을 본다(머리 띠 결재함, 11-23)
  assert.deepStrictEqual(ids('예산팀장'), ['plan', 'apprbox', 'sys']);     // 사용자 11-23 '제안서 작성·관리 묶음 닫기'
  assert.deepStrictEqual(ids('영업팀'), nav.build(ALL_ON, { role: '영업팀' }).map(function (c) { return c.id; }));   // 영업·전산은 지금대로
  assert.deepStrictEqual(ids('전산팀'), nav.build(ALL_ON, { role: '전산팀' }).map(function (c) { return c.id; }));
  const m = nav.build(ALL_ON, { role: '디자이너', master: true });
  assert.strictEqual(nav.limitToRole(m, { role: '디자이너', master: true }), m);   // 마스터는 제한 없음
  // 재무는 시스템 관리도 서버 admin 키가 켠 경우에만 남는다
  assert.ok(!nav.limitToRole(nav.build(Object.assign({}, ALL_ON, { admin: false }), { role: '예산팀' }), { role: '예산팀' }).some(function (c) { return c.id === 'sys'; }));
  // 맨 앞 고정 탭(pinId): 생략 = 시작화면(기존 동작), 재무 = 이사회 자료, null = 없음
  const board = { id: nav.BOARD_ID, label: '이사회 자료 작성' }, other = { id: 'workflow', label: '제안서 진행 현황' };
  let r = nav.openTab([other], board, 'workflow', undefined, nav.BOARD_ID);
  assert.deepStrictEqual(r.tabs.map(function (t) { return t.id; }), [nav.BOARD_ID, 'workflow']);
  assert.deepStrictEqual(nav.closeTab(r.tabs, nav.BOARD_ID, nav.BOARD_ID, nav.BOARD_ID).tabs.map(function (t) { return t.id; }), [nav.BOARD_ID, 'workflow']);   // 닫을 수 없다
  assert.deepStrictEqual(nav.closeTab(r.tabs, nav.BOARD_ID, nav.BOARD_ID).tabs.map(function (t) { return t.id; }), ['workflow']);                              // 인자 생략 = 시작화면만 고정
  r = nav.openTab([other], board, 'workflow', undefined, null);
  assert.deepStrictEqual(r.tabs.map(function (t) { return t.id; }), ['workflow', nav.BOARD_ID]);   // 마스터: 고정 없음, 뒤에 붙는다
  // 고정 탭은 개수 제한에 세지 않는다
  const nine = []; for (let i = 0; i < 10; i += 1) nine.push({ id: 'x' + i, label: 'x' + i });
  assert.strictEqual(nav.openTab(nine, board, 'x0', 10, nav.BOARD_ID).full, false);
  assert.strictEqual(nav.openTab(nine, board, 'x0', 10, null).full, true);
});

// ── 소스 규칙 ───────────────────────────────────────────────────────────
function cssBlock() {
  const h = src('index.html');
  const a = h.indexOf('시작화면(포털) 시작'), b = h.indexOf('시작화면(포털) 끝');
  assert.ok(a > 0 && b > a);
  return h.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
}
test('index.html: #pt-root 한 개, portal.js는 kbboard.js 뒤·app.js 앞, 새 구간은 현황판 끝 뒤·기관장 카드 앞', function () {
  const h = src('index.html');
  assert.strictEqual((h.match(/id="pt-root"/g) || []).length, 1);
  assert.ok(h.indexOf('js/kbboard.js') < h.indexOf('js/portal.js') && h.indexOf('js/portal.js') < h.indexOf('js/app.js'));
  assert.ok(h.indexOf('국민은행 상태 현황판 끝') < h.indexOf('시작화면(포털) 시작') && h.indexOf('시작화면(포털) 끝') < h.indexOf('기관장 카드 시작'));
});
test('CSS(시작화면): 규격 9절 치수(띠 72·값 16/700·머리 40·행 40/36·칩), 새 hex는 #eef1f5와 국민은행 CI 대체값뿐, 12px 미만·opacity·블러 그림자·hover 이동 없음, 태그·탭 문법', function () {
  const c = cssBlock();
  // 허용 hex: #eef1f5(DESIGN 패널 머리 리터럴), #ffbc00(KB Yellow Positive)·#545045(KB Dark Gray)는 국민은행 CI(kbfg.com/kor/about/corporate/ci.htm, 사용자 11-19)이고
  // var(--bk-kb*, 대체값)의 대체값으로만 쓴다. #1e2124는 기존 --fg 잉크 값(노랑 위 글자 대비 9.59).
  // #1d6f3a = :root --green 값(11-19 저녁 design 4-2 '신규 확정' 초록, 흰 바탕 글자 대비 약 6.2:1)이고 var(--green, #1d6f3a)의 대체값으로만 쓴다. 그 밖의 새 hex는 금지.
  assert.deepStrictEqual((c.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort(), ['#1d6f3a', '#1e2124', '#545045', '#eef1f5', '#ffbc00']);
  assert.ok(/--green:#1d6f3a;/.test(src('index.html')));
  assert.ok(/\.pt-chip\.tag\.won \{[^}]*color:var\(--green, #1d6f3a\);[^}]*border-color:var\(--green, #1d6f3a\);[^}]*12%[^}]*font-weight:700/.test(c));
  assert.ok(/\.pt-chip\.tag\.next \{[^}]*color:var\(--fg\); border-color:color-mix\(in srgb, var\(--red\) 55%, var\(--line-strong\)\); font-weight:400/.test(c));
  assert.ok(/forced-colors:active/.test(c));
  assert.ok(/\.pt-chip\.tag\.kept \{[^}]*background:var\(--bk-kb, #ffbc00\);[^}]*color:var\(--bk-kb-ink, #1e2124\);[^}]*border-color:var\(--bk-kb-edge, #545045\);[^}]*font-weight:700/.test(c));
  assert.ok(!/font-size\s*:\s*(9|10|11)px/.test(c) && !/font\s*:[^;}]*?(?<![\d.])(9|10|11)px/.test(c));
  assert.ok(!/opacity|backdrop-filter|transform\s*:\s*(translate|scale)/.test(c));
  assert.ok(!/border-radius\s*:\s*(?!0|var\(--r)/.test(c));
  assert.ok(/\.pt-k \{[^}]*height:72px/.test(c) && /\.pt-k \.v \{ font:700 16px\/22px var\(--mono\)/.test(c) && /\.pt-ph \{[^}]*height:40px;[^}]*background:#eef1f5/.test(c));
  assert.ok(/\.pt-tt td, \.pt-tt tbody th \{ height:40px/.test(c) && /\.pt-row \{[^}]*height:36px/.test(c) && /\.pt-body \{[^}]*clamp\(360px, calc\(100vh - 284px\), 900px\)/.test(c));
  assert.ok(/\.pt-k:first-of-type/.test(c) && /\.pt-k:nth-of-type\(3\)/.test(c) && !/pt-k:first-child|pt-k:nth-child/.test(c));   // 띠 첫 자식이 h3.sr-only라서
  assert.ok(/\.pt-tab\[aria-selected=true\] \{[^}]*inset 0 -2px 0 var\(--accent-color\)/.test(c) && !/pt-tab\[[^}]*16%/.test(c));
  ['kept', 'next', 'won', 'ended'].forEach(function (t) { assert.ok(c.indexOf('.pt-chip.tag.' + t) >= 0, t); });
  assert.ok(/\.pt-k\[aria-pressed=true\] \{[^}]*inset 0 -3px 0 var\(--accent-color\)/.test(c));
});
test('portal.js 소스: confirm()·외부 주소·1인칭 없음, 서버 글자는 esc, fetch는 GET만, 쓰기 요청 없음', function () {
  const s = src('js/portal.js');
  assert.ok(!/\bconfirm\(/.test(s) && !/https?:\/\//.test(s) && s.indexOf('우리') < 0);
  assert.ok(!/method\s*:\s*['"](POST|PUT|DELETE)/i.test(s));
  assert.ok(/dash\.openDetail\(rec, \{ opener: btn, screen: P\.SCREEN/.test(s) && /P\.SCREEN = 'bid_notice'/.test(s));
  assert.ok(s.indexOf("'<p class=\"db-state\" role=\"alert\">'") > 0);
  // kbboard.js에서 읽는 것은 순수 함수 세 가지뿐
  const used = (s.match(/\bK\.[A-Za-z]+/g) || []).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort();
  assert.deepStrictEqual(used, ['K.closedBasis', 'K.contractEnd', 'K.normDate']);
});
test('app.js 연결: showSoon 시작화면 분기(soon-plain 숨김은 별도 줄)·onTabChange 해제·프로필·편집 저장·단독 항목', function () {
  const a = src('js/app.js');
  assert.ok(/const isHome = !!\(root\.nav && itemId === root\.nav\.HOME_ID\)/.test(a));
  assert.ok(a.indexOf('root.portal.mount(homeEl)') > 0 && a.indexOf("document.getElementById('pt-root')") > 0);
  assert.ok(/if \(homeReady\) document\.getElementById\('soon-plain'\)\.style\.display = 'none'/.test(a));
  assert.ok(/isBoard \|\| isTeam \|\| isPrep \|\| dashReady \|\| isPlans/.test(a) && !/dashReady \|\| isPlans \|\| homeReady/.test(a));   // plans.test.js:51 줄 보존
  assert.ok(/tab !== 'soon' && root\.portal && root\.portal\.unmount/.test(a));
  assert.ok(a.indexOf('root.portal.onProfileChange()') > 0 && a.indexOf('root.portal.refresh()') > 0);
  assert.ok(/if \(homeId\(\) !== root\.nav\.BOARD_ID && !\(root\.portal && root\.portal\.mount\)\) \{ flushOverdue\(\); return; \}/.test(a));   // 재무(이사회 자료)는 포털 본체 가드 제외
  assert.ok(a.indexOf('root.nav.accordionOf(navBuilt, navActiveId)') > 0 && /return !c\.headOnly;/.test(a) && a.indexOf('nav-home') < 0);
});

test('시작화면(11-19): 로그아웃·로그인 초기화, 복원 pending 보존, 제목 단추, 고정 탭, 메뉴에서 제거, 보기 전용 전달, 패널 제목', function () {
  const a = src('js/app.js'), p = src('js/portal.js');
  assert.ok(/app\.resetScreens = function \(\) \{[\s\S]*?navTabs = \[\]; navActiveId = null;[\s\S]*?tab-btn-map[\s\S]*?\.click\(\);/.test(a));
  assert.ok(/enterApp = function \(session, profile\) \{\s*pendingHome = true;[^\n]*\n\s*app\.resetScreens\(\);/.test(a));
  assert.ok(/root\.store\.saveProfile\(\{ name: '', team: '' \}\);\s*app\.resetScreens\(\);/.test(a));
  assert.ok(a.indexOf('resetScreens', a.indexOf('app.onProfileChanged = function')) > a.indexOf('app.applyMenuPermissions();', a.indexOf('app.onProfileChanged = function')));   // onProfileChanged 본문에는 없다 — 내 정보 저장·계정 전환기에는 걸지 않는다
  assert.ok(/view\.classList\.add\('hidden'\); pendingHome = true;/.test(a));                                    // 새로고침 복원
  assert.ok(/function applyHome\(settled\)/.test(a) && /settled === false\) \{ flushOverdue\(\); return; \}/.test(a));
  assert.ok(/app\.goHome = function/.test(a) && /getElementById\('app-home'\)/.test(a) && a.indexOf("'click', app.goHome") > 0);
  // 제목 클릭(11-19): 이미 시작화면이어도 조기 return 없이 다시 연다(거르기·정렬·스크롤을 처음으로). 시작화면 id는 계정별(homeId), 고정 탭도 같은 id(pinId)
  const gh = a.slice(a.indexOf('app.goHome = function'), a.indexOf('function closeNavTab'));
  assert.ok(gh.indexOf('navActiveId') < 0 && gh.split('return;').length === 2);   // return은 '시작화면을 열고 끝' 한 곳뿐
  assert.ok(/const hid = homeId\(\);/.test(gh) && /findNavItem\(hid\)/.test(gh) && /openNavItem\(item\)/.test(gh));
  assert.ok(/function homeId\(\) \{ return root\.nav \? root\.nav\.homeIdFor\(navContext\(\)\) : null; \}/.test(a) && /function pinId\(\) \{ return homeId\(\); \}/.test(a));
  assert.ok(a.indexOf('root.nav.openTab(navTabs, item, navActiveId, undefined, pinId())') > 0 && a.indexOf('root.nav.closeTab(navTabs, id, navActiveId, pinId())') > 0);
  assert.ok(a.indexOf('root.nav.limitToRole(root.nav.build(visible, navContext()), navContext())') > 0);
  assert.ok(a.indexOf('homeId() && navActiveId === homeId()') > 0 && a.indexOf('root.nav.HOME_ID) hb') < 0);
  assert.ok(/pin \? ' pin' : ''|class="stab pin/.test(a) && a.indexOf('시작화면 (닫을 수 없음)') > 0 && a.indexOf('고정 탭') > 0);
  assert.ok(/root\.dashboard\.onProfileChange\(\)/.test(a));
  // 기관 목록이 시작화면보다 늦게 오면 출처를 다시 불러온다(11-19 실측: 빠른 로그인에 '로그인과 서버 연결이 필요합니다'로 굳음)
  assert.ok(/applyServerModeUI\(\);[\s\S]{0,300}root\.portal\.onDataReady\(\)/.test(a) && /P\.onDataReady = function \(\) \{\s*if \(!host\) return;\s*S\.seq \+= 1; startLoad\(\);/.test(p));
  assert.ok(p.indexOf('readOnly: viewOnly()') < 0 && p.indexOf('function viewOnly(') < 0 && p.indexOf("refocus: again });") > 0);   // 보기 전용은 dash.openDetail이 역할로 정한다(전산팀·디자이너 어디서 열든)
  assert.ok(p.indexOf('시작화면') > 0 && p.indexOf('첫 화면') < 0);
  // 패널 제목·부제·개수·기간 칩(design-reviewer 11-19 1428_aab03363 5절)
  const sk = portal.skeletonHtml();
  assert.ok(sk.indexOf('<h3 id="pt-list-h">기관별 입찰 일정</h3>') > 0 && sk.indexOf('기관마다 가장 가까운 일 하나, 1년 안, 임박순') > 0);
  assert.ok(sk.indexOf('<h3 id="pt-cal-h">날짜별 일정</h3>') > 0 && sk.indexOf('앞으로 30일, 접수 마감·공고 예정') > 0 && sk.indexOf('id="pt-cn"') > 0);
  assert.ok(sk.indexOf('<span class="pt-span" aria-hidden="true">1년</span>') > 0 && sk.indexOf('<span class="pt-span" aria-hidden="true">30일</span>') > 0);
  assert.ok(sk.indexOf('<h2 id="pt-title">시작화면</h2>') > 0 && p.indexOf("caption: '기관별 입찰 일정, ' + P.sortText(S.sort) + ', '") > 0);
  assert.ok(/getElementById\('pt-cn'\)|\$\('pt-cn'\)/.test(p));
});

test('qa 11-19 후속: —·… 칸은 눌러도 거르지 않음, 다시 그려도 표·일정 줄 포커스 유지, 배정 줄은 건 번호로 구분, 039 시작 전 줄은 lines_next', function () {
  const s = src('js/portal.js');
  assert.ok(/if \(!k\.hasAttribute\('aria-pressed'\)\) return;/.test(s));
  assert.ok(/'data-pt-unfilter', 'data-pt-open'\]/.test(s));
  assert.ok(s.indexOf("'입찰 건 #' + x.bid_case_id") > 0);
  assert.ok(/arr\('lines_now'\)\.concat\(arr\('lines_next'\)\)/.test(s));
  // 서버가 lines_next를 주지 않으면(지금) 시작 전 국민은행 줄이 없어 재유치 태그도 없다
  const L = [rec('G', '사구')];
  const noNext = portal.bankBuckets(L, { today: TODAY, sumById: { G: sum([ln('국민은행', '2020-01-01', p(60))]) } });
  const withNext = portal.bankBuckets(L, { today: TODAY, sumById: { G: sum([ln('국민은행', '2020-01-01', p(60))], [ln('국민은행', p(61), p(3000))]) } });
  assert.strictEqual(noNext.kb[0].tag, '');
  assert.strictEqual(withNext.kb[0].tag, 'kept');
});

test('decideCount: 머리 띠 [결재함 n]은 시작화면 approvalKpi decide와 같은 값, 결재 권한 없음·일부 실패는 null(사용자 11-23)', function () {
  assert.strictEqual(typeof portal.decideCount, 'function');
  assert.strictEqual(typeof portal.loadApprSources, 'function');
  assert.strictEqual(typeof portal.headApprCount, 'function');
  const roles = ['영업팀', '영업팀장', '영업부장', '디자이너', '예산팀', '전산팀'];
  roles.forEach(function (role) {
    const k = portal.approvalKpi({ perms: { items: [] }, inbox: { items: [] }, appr: [] }, role);
    const n = portal.decideCount({ perms: { items: [] }, inbox: { items: [] }, appr: [] }, role);
    if (k.mode === 'decide' && k.status === 'ok' && !k.partial) assert.strictEqual(n, k.n, role);
    else assert.strictEqual(n, null, role);
  });
});
